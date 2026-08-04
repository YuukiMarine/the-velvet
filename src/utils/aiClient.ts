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
  isThinkingModel,
  type ApiProvider, DEFAULT_PROVIDER } from '@/utils/aiProviders';

export type AIRole = 'system' | 'user' | 'assistant';

/**
 * 多模态内容块（FS3 视觉专线）。OpenAI 兼容的 content 数组形态，
 * 各家（GPT-4o/5 系、qwen-vl、gemini 兼容层、GLM-4V…）都吃这套结构。
 * 图片用 data URL 直接内联，不上传任何第三方图床。
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

/** content 为字符串 = 纯文本（老路径，绝大多数调用）；为数组 = 多模态 */
export interface AIMessage { role: AIRole; content: string | ContentPart[]; }

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
  /**
   * 思维链增量（仅流式）。**不会**混进 yield 出去的正文里——
   * 正文要拿去解析 JSON，掺了思维链就废了。这个回调纯粹给 UI 用：
   * 思维链模型在"想"的那几十秒里一个正文字都不吐，界面上那条滚动预览
   * 会整段空着（用户上报「流式的滚动窗口没有了」）。把想的过程喂给它，
   * 那扇窗才一直有东西在动。
   */
  onReasoning?: (delta: string) => void;
}

/**
 * response_format:{type:'json_object'} 的 provider 白名单（其余发了可能 400）。
 * deepseek 被剔除：官方文档承认 JSON Output 有概率返回空 content，v4 推理系上
 * 实测高频复现（content 为纯空格）——DeepSeek 走 prompt 约定 + 解析兜底。
 */
const JSON_MODE_PROVIDERS: ReadonlySet<string> = new Set(['openai', 'kimi']);

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

/**
 * 「深思熟虑」档配置（助手对话 / 每日问候 / 人格生成 / 中长期占卜）。
 *
 * 跨平台：settings.navigatorProvider 指了别家、且那家在 aiProfiles 里有 Key 时，
 * 直接用那家的连接（key/baseUrl）跑 navigatorModel——聊天可以用更贵更好的平台，
 * 而「快速响应」档（getAIConfig，记账解析/塔罗单抽/打分等批量任务）留在当前生效
 * 服务商的便宜模型上。未指别家时退化为老口径：当前连接 + navigatorModel 覆盖。
 * 指了别家但那家 Key 缺失 → 忽略整套覆盖（连 navigatorModel 一起丢：那个模型名
 * 属于别家，套在当前连接上必 404）。
 */
export function getDeliberateAIConfig(settings: Settings): AIConfig | null {
  return applyModelOverride(settings, settings.navigatorProvider, settings.navigatorModel);
}

/**
 * 「助手」专属配置（对话回合 / 每日问候 / 人格生成器）。
 *
 * 层级：助手专属（assistantModel/assistantProvider）→ 深思熟虑档 → 快速响应档。
 * 分成两层的理由（用户口径）：助手区那个快捷入口应当只改助手自己，
 * 而不是连带把中长期占卜的模型一起换掉。
 */
export function getAssistantAIConfig(settings: Settings): AIConfig | null {
  const own = settings.assistantModel?.trim();
  if (own) return applyModelOverride(settings, settings.assistantProvider, own);
  return getDeliberateAIConfig(settings);
}

/**
 * 把「平台 + 模型」覆盖套到当前连接上，得到可直接发请求的配置。
 * pv 指了别家且那家在 aiProfiles 有 Key → 用那家的 key/baseUrl 直连；
 * 那家 Key 缺失 → 整套覆盖作废回落快速响应（模型名属于别家，套错连接必 404）。
 */
function applyModelOverride(
  settings: Settings,
  pv: ApiProvider | undefined,
  model: string | undefined,
): AIConfig | null {
  const activeProvider = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
  if (pv && pv !== activeProvider) {
    const prof = settings.aiProfiles?.[pv];
    const key = prof?.key?.trim();
    if (key) {
      const resolved = resolveProvider(pv, prof?.baseUrl, model?.trim() || prof?.model);
      return { apiKey: key, baseUrl: resolved.baseUrl, model: resolved.model, provider: pv };
    }
    return getAIConfig(settings);
  }
  const base = getAIConfig(settings);
  if (!base) return null;
  const override = model?.trim();
  return override ? { ...base, model: override } : base;
}

/** @deprecated 改名 getDeliberateAIConfig（覆盖面已不止 Navigator）；保留别名防漏改 */
export const getNavigatorAIConfig = getDeliberateAIConfig;

/**
 * 「视觉」档（FS3）：拍照记账等看图任务。**没配就是没配**——不回落到文本档，
 * 因为把图发给纯文本模型只会 400 或胡说；调用方据 null 走 OCR / 手输降级链。
 */
export function getVisionAIConfig(settings: Settings): AIConfig | null {
  const model = settings.visionModel?.trim();
  if (!model) return null;
  return applyModelOverride(settings, settings.visionProvider, model);
}

/**
 * 「听觉」档（FS3）：语音转写。同样不回落——没配就当没有话筒。
 * 注意它走的是 /audio/transcriptions（见 speech.ts），不是 /chat/completions，
 * 但连接解析（key/baseUrl/跨平台）与其它档完全同构，所以复用同一套。
 */
export function getAudioAIConfig(settings: Settings): AIConfig | null {
  const model = settings.audioModel?.trim();
  if (!model) return null;
  return applyModelOverride(settings, settings.audioProvider, model);
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
  /**
   * 思维链余量。
   *
   * `max_completion_tokens` / `max_tokens` 是**推理 + 正文的总额**，推理先花、正文后写。
   * 原来只加 `max(1024, maxTokens*0.5)`——按比例放余量，对小预算等于没放：
   * 属性名匹配只要 400，加完 1424，思维链轻轻松松就吃光，正文一个字没写
   * → finish_reason=length + content 为空 → 调用方看到「AI 返回空响应」。
   * 这就是用户上报的召唤 Persona / AI 匹配技能名失败。
   *
   * 余量必须是**定额**而不是比例：想多久跟你要多长的正文基本无关。
   * 4096 是各家思维链模型的常见量级，宁可多要——没用完不收费。
   */
  const thinking = isThinkingModel(cfg.model);
  // 余量放到 8192：ceiling 不是 target，没用完不收费，宁可给宽。
  // 真超过服务商上限时由 chatComplete 的 400 兜底降档重发（见那边注释）。
  const budget = thinking ? maxTokens + Math.max(8192, maxTokens) : maxTokens;
  if (isReasoningModel(cfg.model)) {
    body.max_completion_tokens = budget;
    body.reasoning_effort = 'minimal'; // 让 GPT-5 尽量接近"非推理"的快/省行为
    // 不发 temperature：推理模型只接受默认 1，自定义会 400
  } else {
    body.max_tokens = budget;
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
/** 「正文为空且 finish_reason=length」——思维链把预算吃光的特征错误 */
const EMPTY_LENGTH = Symbol('aiEmptyLength');
function markEmptyLength(e: Error): Error {
  (e as Error & { [EMPTY_LENGTH]?: true })[EMPTY_LENGTH] = true;
  return e;
}
function isEmptyLengthError(e: unknown): boolean {
  return !!(e as Error & { [EMPTY_LENGTH]?: true })?.[EMPTY_LENGTH];
}

/** 服务商嫌 max_tokens / max_completion_tokens 太大而 400（各家措辞不同，按关键词认） */
function isOverBudgetError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : '';
  if (!/HTTP 400|invalid_request|Bad Request/i.test(m)) return false;
  return /max_tokens|max_completion_tokens|maximum.*tokens|tokens.*exceed|too large|less than or equal/i.test(m);
}

/**
 * 非流式 chat completion。
 *
 * 外面这层只做一件事：**撞上「思维链吃光预算」就加倍重来一次**。
 * isThinkingModel 是名字嗅探，必然有漏网的模型；漏了的表现就是
 * 正文空 + finish_reason=length。与其让用户自己去调 max_tokens，
 * 不如当场翻倍再试一发——只在这个特征错误上重试，正常失败不多花一次钱。
 */
export async function chatComplete(
  cfg: AIConfig,
  messages: AIMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  try {
    return await chatCompleteOnce(cfg, messages, opts);
  } catch (e) {
    // ① 思维链吃光预算 → 翻三倍重来
    if (isEmptyLengthError(e)) {
      const bumped = Math.max(4000, (opts.maxTokens ?? DEFAULT_MAX_TOKENS) * 3);
      return await chatCompleteOnce(cfg, messages, { ...opts, maxTokens: bumped });
    }
    /**
     * ② 预算**超过服务商上限**被 400 顶回来 → 降到保守档重发。
     *
     * 这是"为什么不直接按厂商上限要"的答案：ceiling 不是 target，没用完不收费，
     * 所以要得宽本身没代价；代价在于**各家上限不一样、也没有可靠的地方查**，
     * 写死一个大数会让上限较低的模型直接 400。
     * 于是策略是「先要宽 → 被拒就退」，而不是「先猜一个都能过的小数」。
     */
    if (isOverBudgetError(e) && (opts.maxTokens ?? DEFAULT_MAX_TOKENS) > 2048) {
      return await chatCompleteOnce(cfg, messages, { ...opts, maxTokens: 2048 });
    }
    throw e;
  }
}

async function chatCompleteOnce(
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
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content === 'string' && content.trim()) return content;
    /**
     * 正文空了，但别急着判失败——两种真实情况：
     *
     * ① 思维链模型（DeepSeek-R1 / GLM / Qwen-thinking 一族）会把内容写进
     *    message.reasoning_content，content 留空。里面若带着 JSON，捞出来照样能用。
     * ② 预算被推理段吃光 → finish_reason: 'length'，content 是空串。
     *    这两种都会表现成用户说的「AI 内容根本就没返回」，
     *    但错误提示只写「空响应」，看不出该调大预算还是该换模型。
     */
    const reasoning = choice?.message?.reasoning_content ?? choice?.message?.reasoning;
    if (typeof reasoning === 'string' && reasoning.includes('{') && reasoning.includes('}')) {
      return reasoning;
    }
    const fr = typeof choice?.finish_reason === 'string' ? choice.finish_reason : '';
    if (fr === 'length' || (!fr && typeof reasoning === 'string' && reasoning.trim())) {
      // 打上标记：外层 chatComplete 会加倍预算再来一发
      throw markEmptyLength(new Error(
        '模型把预算全花在思考上了，正文一个字没写（finish_reason=length）——已在自动加大预算重试',
      ));
    }
    throw new Error(
      fr === 'content_filter'
        ? 'AI 响应被内容审查拦截（finish_reason=content_filter）'
        : `AI 返回空响应${fr ? `（finish_reason=${fr}）` : ''}，可能被截断或被审查拦截`,
    );
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
    /** 只见思维链、不见正文：单独报错，别混进「空响应」里（那句看不出该怎么办） */
    let sawReasoning = false;
    let finishReason = '';
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
          const c = json?.choices?.[0];
          if (typeof c?.finish_reason === 'string' && c.finish_reason) finishReason = c.finish_reason;
          // 思维链不 yield 给 UI（那是过程不是答案），只记一笔用于最终报错
          const rd: string = c?.delta?.reasoning_content ?? c?.delta?.reasoning ?? '';
          if (rd) { sawReasoning = true; opts.onReasoning?.(rd); }
          const delta: string = c?.delta?.content ?? c?.message?.content ?? '';
          if (delta) { produced = true; yield delta; }
        } catch { /* 半个 / 非法 chunk，跳过 */ }
      }
    }
    if (!produced) {
      throw new Error(
        sawReasoning
          ? '模型只吐了思维链、没写正文——预算多半被推理段吃光了，调大 max_tokens 或换一个非推理模型'
          : finishReason === 'length'
            ? 'AI 输出被 max_tokens 截断（finish_reason=length）'
            : `AI 流式返回为空${finishReason ? `（finish_reason=${finishReason}）` : ''}，可能被截断或被审查拦截`,
      );
    }
  } catch (e) {
    rethrowAbortAware(e, ab, opts);
  } finally {
    ab.cleanup();
  }
}
