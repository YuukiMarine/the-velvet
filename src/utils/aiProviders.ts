/**
 * AI provider 配置与连接测试
 * 统一管理各 provider 的 baseUrl / defaultModel，避免分散在 store / Settings / SummaryModal 中重复
 * 所有 provider 均走 OpenAI 兼容的 /chat/completions 端点
 */

export type ApiProvider = 'openai' | 'deepseek' | 'kimi' | 'gemini' | 'minimax';

export interface ProviderConfig {
  id: ApiProvider;
  label: string;
  /** 默认 baseUrl（不含尾部斜杠） */
  defaultBaseUrl: string;
  /** 默认模型名 */
  defaultModel: string;
  /** Settings 中展示的模型提示 */
  hint: string;
}

// 默认模型/端点核对于 2026-06（见各 provider 官方 models/pricing/deprecations 页）。
// 注意：Kimi 与 MiniMax 的默认 baseUrl 是「国内端点」；用国际平台申请的 Key 请在
// 「高级选项」里改成 https://api.moonshot.ai/v1 / https://api.minimax.io/v1，
// 否则区域不匹配会返回 401。
export const AI_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    // GPT-5 系列为推理模型：aiClient 会自动改用 max_completion_tokens 并省略 temperature
    defaultModel: 'gpt-5.4-mini',
    hint: 'gpt-5.4-mini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    // 旧的 deepseek-chat 别名将于 2026-07-24 停服；v4-flash 是其廉价档后继
    defaultModel: 'deepseek-v4-flash',
    hint: 'deepseek-v4-flash',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    defaultBaseUrl: 'https://api.moonshot.cn/v1', // 国际 Key 改 https://api.moonshot.ai/v1
    defaultModel: 'kimi-k2.5',
    hint: 'kimi-k2.5',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    // gemini-1.5-flash 已 EOL（调用 404）；3.1-flash-lite 是当前廉价档且寿命最长
    defaultModel: 'gemini-3.1-flash-lite',
    hint: 'gemini-3.1-flash-lite',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    defaultBaseUrl: 'https://api.minimaxi.com/v1', // 国际 Key 改 https://api.minimax.io/v1
    defaultModel: 'MiniMax-M2.5',
    hint: 'MiniMax-M2.5',
  },
];

export function getProviderConfig(provider: ApiProvider | undefined): ProviderConfig {
  return AI_PROVIDERS.find(p => p.id === provider) ?? AI_PROVIDERS[0];
}

/**
 * 解析运行时 baseUrl / model：优先使用用户在高级选项中的覆盖值，否则回退到 provider 默认
 */
export function resolveProvider(
  provider: ApiProvider | undefined,
  overrideBaseUrl?: string,
  overrideModel?: string
): { baseUrl: string; model: string } {
  const p = getProviderConfig(provider);
  const rawBase = (overrideBaseUrl?.trim() || p.defaultBaseUrl);
  const baseUrl = rawBase.replace(/\/+$/, '');
  const model = overrideModel?.trim() || p.defaultModel;
  return { baseUrl, model };
}

/**
 * OpenAI 推理模型族（GPT-5 系列 + o 系列）在 /chat/completions 上的请求结构不同：
 * 用 max_completion_tokens 代替 max_tokens，且只接受默认 temperature（自定义会 400）。
 * 按 model id 前缀判断；aiClient 的实际请求与下面的"测试连接"共用此判断，
 * 这样自定义 baseUrl 代理这些模型时也能命中。
 */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model.trim());
}

export type TestResult =
  | { ok: true; latencyMs: number; model: string }
  | { ok: false; error: string };

/**
 * 用最小 payload 探测 API 连接是否可用
 * - 超时 15 s，防止界面卡死
 * - 对 401 / 402 / 403 / 429 / 网络错误 / CORS 给出可读提示
 */
export async function testAIConnection(opts: {
  provider: ApiProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): Promise<TestResult> {
  if (!opts.apiKey?.trim()) {
    return { ok: false, error: '请先填写 API 密钥' };
  }

  const { baseUrl, model } = resolveProvider(opts.provider, opts.baseUrl, opts.model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const start = Date.now();

  // 推理模型（GPT-5/o 系列）拒绝 max_tokens，且 max_tokens:1 会被推理 token 吃光
  const reasoning = isReasoningModel(model);
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        ...(reasoning
          ? { max_completion_tokens: 16, reasoning_effort: 'minimal' }
          : { max_tokens: 1 }),
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const detail = extractProviderErrorMessage(body).slice(0, 240).trim();
      const hint = getHttpStatusHint(resp.status, opts.provider);
      const prefix = hint ? `${hint} (HTTP ${resp.status})` : `HTTP ${resp.status}`;
      return { ok: false, error: detail ? `${prefix}: ${detail}` : `${prefix}: ${resp.statusText}` };
    }

    const data = await resp.json().catch(() => null);
    if (!data?.choices?.[0]?.message) {
      return { ok: false, error: '响应格式非 OpenAI 兼容，请检查 Base URL' };
    }
    return { ok: true, latencyMs, model };
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: '连接超时（15s 无响应）' };
    }
    if (e instanceof TypeError) {
      return { ok: false, error: '网络错误：可能是 CORS 被拦截或无网络连接' };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ModelListResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string };

/**
 * 按当前 API 配置拉取「这把 Key 能用哪些模型」。
 *
 * 走 OpenAI 兼容的 `GET {baseUrl}/models`——本项目所有 provider（含 Gemini 的
 * v1beta/openai 兼容层、各类自建网关）都实现了这个端点。返回体两种形态都吃：
 * 标准的 `{ data: [{ id }] }`，以及少数网关直接吐的字符串/对象数组。
 *
 * Gemini 的 id 带 `models/` 前缀，这里剥掉——/chat/completions 要的是裸模型名。
 * 拉不到不是致命错误：调用方保留手填输入框兜底。
 */
export async function fetchAvailableModels(opts: {
  provider: ApiProvider;
  apiKey: string;
  baseUrl?: string;
}): Promise<ModelListResult> {
  if (!opts.apiKey?.trim()) return { ok: false, error: '请先填写并保存 API 密钥' };

  const { baseUrl } = resolveProvider(opts.provider, opts.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${opts.apiKey.trim()}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const detail = extractProviderErrorMessage(body).slice(0, 200).trim();
      const hint = resp.status === 404
        ? '该地址不支持 /models 列表接口，请手动填写模型名'
        : getHttpStatusHint(resp.status, opts.provider);
      const prefix = hint ? `${hint} (HTTP ${resp.status})` : `HTTP ${resp.status}`;
      return { ok: false, error: detail ? `${prefix}: ${detail}` : prefix };
    }

    const data = (await resp.json().catch(() => null)) as unknown;
    const rows =
      Array.isArray(data) ? data
      : data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
        ? ((data as { data: unknown[] }).data)
        : null;
    if (!rows) return { ok: false, error: '响应格式非 OpenAI 兼容（没有 data 数组）' };

    const models = [...new Set(
      rows
        .map((row) => (typeof row === 'string' ? row : (row as { id?: unknown } | null)?.id))
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim().replace(/^models\//, '')),
    )].sort((a, b) => a.localeCompare(b));

    if (models.length === 0) return { ok: false, error: '接口没有返回任何模型' };
    return { ok: true, models };
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === 'AbortError') return { ok: false, error: '拉取超时（15s 无响应）' };
    if (e instanceof TypeError) return { ok: false, error: '网络错误：可能是 CORS 被拦截或无网络连接' };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function getHttpStatusHint(status: number, provider?: ApiProvider): string {
  if (status === 400) return '请求格式有误';
  if (status === 401) return '密钥无效或已过期';
  if (status === 402) {
    return provider === 'deepseek'
      ? '余额不足，请检查 DeepSeek 账户余额或充值'
      : '余额不足或账户额度不可用';
  }
  if (status === 403) return '无访问权限（Key 可能未开通该模型）';
  if (status === 404) return '接口地址或模型名不存在';
  if (status === 422) return '请求参数无效';
  if (status === 429) return '请求过于频繁';
  if (status === 500) return '服务端错误';
  if (status === 503) return '服务繁忙或过载';
  return '';
}

export function extractProviderErrorMessage(body: string): string {
  const text = body.trim();
  if (!text) return '';

  try {
    const data = JSON.parse(text) as unknown;
    const candidates = [
      getNestedString(data, ['error', 'message']),
      getNestedString(data, ['message']),
      getNestedString(data, ['detail']),
      getNestedString(data, ['error_description']),
      getNestedString(data, ['error']),
    ];
    const message = candidates.find(Boolean);
    if (message) return message;
  } catch {
    /* Fall back to the raw response text below. */
  }

  return text;
}

function getNestedString(value: unknown, path: string[]): string {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current.trim() : '';
}
