/**
 * 统一 AI 传输层（gateway）
 *
 * 所有走 OpenAI 兼容 /chat/completions 端点的请求都应经过这里，而不是各
 * *AI.ts / store / 组件自己 fetch + 解析 SSE。集中管理：
 *   - 鉴权头 / 请求体构造
 *   - 流式 SSE 解析（缓冲跨 chunk 的半行，兼容 \r\n、行首空格、[DONE]）
 *   - 超时
 *       · chatComplete：从发起到拿到完整响应的「总超时」
 *       · chatStream：「空闲超时」—— 每收到一段数据就重置计时，
 *         既能发现挂死的连接，又不会误杀正常但较长的流式生成
 *   - 调用方 AbortSignal（"停止"按钮 / 组件卸载）与内部超时的合流
 *   - 错误归一（复用 aiProviders 的状态码提示 + 错误体提取，文案与连接测试一致）
 *   - 空响应保护
 *
 * 业务侧（拼 prompt / 解析返回 JSON / 离线兜底）仍留在各自的 *AI.ts。
 */

import type { Settings } from '@/types';
import {
  resolveProvider,
  extractProviderErrorMessage,
  getHttpStatusHint,
  isReasoningModel,
  type ApiProvider,
} from '@/utils/aiProviders';

export type AIRole = 'system' | 'user' | 'assistant';
export interface AIMessage { role: AIRole; content: string; }

export interface AIConfig {
  apiKey: string;
  /** 不含尾部斜杠（resolveProvider 已规整） */
  baseUrl: string;
  model: string;
  /** 仅用于错误提示文案（如 DeepSeek 402 余额提示）；可选 */
  provider?: ApiProvider;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** 调用方的中断信号（"停止"按钮 / 卸载组件）。与内部超时合流。 */
  signal?: AbortSignal;
  /**
   * 超时毫秒数，默认 90s（与项目文档「90 秒超时」一致）。
   * 传 0 关闭内部超时（仍受调用方 signal 控制）。
   */
  timeoutMs?: number;
  /**
   * 严格 JSON 输出（response_format json_object）。只对确认支持的 provider 生效
   * （openai/deepseek/kimi），其余 provider 静默忽略——prompt 约定仍是兜底。
   */
  jsonMode?: boolean;
}

/** response_format:{type:'json_object'} 的 provider 白名单（其余发了可能 400） */
const JSON_MODE_PROVIDERS: ReadonlySet<string> = new Set(['openai', 'deepseek', 'kimi']);

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_TEMPERATURE = 0.8;
const DEFAULT_MAX_TOKENS = 1500;

/**
 * 从 Settings 解析运行时 AI 配置；未配置 API key 时返回 null。
 * 取代散落在 battleAI / activityAI 等处各写一遍的 getAIConfig。
 */
export function getAIConfig(settings: Settings): AIConfig | null {
  const apiKey = settings.summaryApiKey?.trim();
  if (!apiKey) return null;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );
  return { apiKey, baseUrl, model, provider: settings.summaryApiProvider };
}

// ── 内部：超时 + 调用方 signal 合流 ──────────────────────────────────────────

interface AbortBundle {
  signal: AbortSignal;
  /** 流式空闲超时：每收到数据调一次以重置计时 */
  rearm: () => void;
  cleanup: () => void;
  timedOut: () => boolean;
}

function setupAbort(opts: ChatOptions): AbortBundle {
  const ac = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let didTimeout = false;

  const rearm = () => {
    if (timeoutMs <= 0) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { didTimeout = true; ac.abort(); }, timeoutMs);
  };

  // 调用方 signal → 内部 controller（已中止则立即中止）
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort();
    else opts.signal.addEventListener('abort', () => ac.abort(), { once: true });
  }
  rearm();

  return {
    signal: ac.signal,
    rearm,
    cleanup: () => { if (timer) clearTimeout(timer); },
    timedOut: () => didTimeout,
  };
}

function timeoutError(timeoutMs: number): Error {
  const secs = Math.round((timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS) / 1000);
  return new Error(`AI 请求超时（${secs}秒），请检查网络或更换更快的模型`);
}

/** 把 !resp.ok 的响应转成可读错误（复用 aiProviders 的提示映射，与连接测试同源） */
async function toHttpError(resp: Response, provider?: ApiProvider): Promise<Error> {
  const body = await resp.text().catch(() => '');
  const detail = extractProviderErrorMessage(body).slice(0, 200).trim();
  const hint = getHttpStatusHint(resp.status, provider);
  const prefix = hint ? `${hint}（HTTP ${resp.status}）` : `HTTP ${resp.status}`;
  return new Error(detail ? `${prefix}: ${detail}` : prefix);
}

function authHeaders(cfg: AIConfig, accept?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey}`,
  };
  if (accept) h['Accept'] = accept;
  return h;
}

/**
 * 按模型类型构造 /chat/completions 请求体（统一收口 max_tokens / temperature 的差异）。
 *
 * OpenAI 推理模型族（GPT-5 / o 系列，见 aiProviders.isReasoningModel）有两点 breaking 差异：
 *   1. 拒绝 `max_tokens`，必须用 `max_completion_tokens`
 *   2. 拒绝自定义 `temperature`（只接受默认值 1）
 * 其余 provider（DeepSeek/Kimi/Gemini-compat/MiniMax 及旧的 gpt-4o-mini）仍用
 * `max_tokens` + `temperature`——尤其 DeepSeek **只**认 max_tokens，所以不能全局切换。
 */
function buildRequestBody(
  cfg: AIConfig,
  messages: AIMessage[],
  opts: ChatOptions,
  stream: boolean,
): Record<string, unknown> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const body: Record<string, unknown> = { model: cfg.model, messages, stream };
  if (opts.jsonMode && cfg.provider && JSON_MODE_PROVIDERS.has(cfg.provider)) {
    body.response_format = { type: 'json_object' };
  }
  if (isReasoningModel(cfg.model)) {
    // 输出预算 + 一段推理 token 余量，避免极小的 maxTokens（如活动分析的 200）被推理吃光导致空响应
    body.max_completion_tokens = maxTokens + 1024;
    body.reasoning_effort = 'minimal'; // 让 GPT-5 尽量接近"非推理"的快/省行为
    // 不发 temperature：推理模型只接受默认 1，自定义会 400
  } else {
    body.max_tokens = maxTokens;
    body.temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  }
  return body;
}

/**
 * 重新抛出错误时区分「超时」与「调用方主动取消」：
 *   - 超时 → 友好的中文超时提示
 *   - 调用方取消 → 原样抛出 AbortError（上层据 name === 'AbortError' 识别取消）
 *   - 其它（含 CORS 的 TypeError）→ 原样抛出，保留给上层做精细识别
 */
function rethrowAbortAware(e: unknown, ab: AbortBundle, opts: ChatOptions): never {
  if (e instanceof Error && e.name === 'AbortError' && ab.timedOut()) {
    throw timeoutError(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }
  throw e;
}

/**
 * 非流式 chat completion，返回 trim 后的文本。
 * 空响应 / HTTP 错误 / 超时都会抛出归一后的 Error。
 */
export async function chatComplete(
  cfg: AIConfig,
  messages: AIMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const ab = setupAbort(opts);
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify(buildRequestBody(cfg, messages, opts, false)),
      signal: ab.signal,
    });
    if (!resp.ok) throw await toHttpError(resp, cfg.provider);
    const data = await resp.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('AI 返回空响应，可能被截断或被内容审查拦截');
    }
    return content;
  } catch (e) {
    rethrowAbortAware(e, ab, opts);
  } finally {
    ab.cleanup();
  }
}

/**
 * 流式 chat completion，按 delta 逐段 yield 文本。
 * - 兼容 delta.content 与（少见的）message.content
 * - 缓冲跨 chunk 的半行
 * - 正常结束但一个字都没产出 → 抛空响应错误（交由上层兜底）
 */
export async function* chatStream(
  cfg: AIConfig,
  messages: AIMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  const ab = setupAbort(opts);
  let produced = false;
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(cfg, 'text/event-stream'),
      body: JSON.stringify(buildRequestBody(cfg, messages, opts, true)),
      signal: ab.signal,
    });
    if (!resp.ok) throw await toHttpError(resp, cfg.provider);
    if (!resp.body) throw new Error('AI 流式响应无 body');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    outer: while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      ab.rearm(); // 空闲超时：收到数据就重置
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') break outer;
        try {
          const json = JSON.parse(payload);
          const delta: string =
            json?.choices?.[0]?.delta?.content
            ?? json?.choices?.[0]?.message?.content
            ?? '';
          if (delta) { produced = true; yield delta; }
        } catch { /* 半个 / 非法 chunk，跳过 */ }
      }
    }
    if (!produced) {
      throw new Error('AI 流式返回为空，可能被截断或被内容审查拦截');
    }
  } catch (e) {
    rethrowAbortAware(e, ab, opts);
  } finally {
    ab.cleanup();
  }
}
