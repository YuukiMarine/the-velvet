/**
 * AI provider 配置与连接测试
 * 统一管理各 provider 的 baseUrl / defaultModel，避免分散在 store / Settings / SummaryModal 中重复
 * 所有 provider 均走 OpenAI 兼容的 /chat/completions 端点
 */

export type ApiProvider = 'openai' | 'deepseek' | 'kimi' | 'qwen' | 'gemini' | 'minimax';

export interface ProviderConfig {
  id: ApiProvider;
  label: string;
  /** 默认 baseUrl（不含尾部斜杠） */
  defaultBaseUrl: string;
  /** 默认模型名 */
  defaultModel: string;
  /** Settings 中展示的模型提示 */
  hint: string;
  /**
   * 申请 Key 的控制台地址。
   *
   * 为什么值得单独存一份：用户第一次配 AI 时最卡的一步不是"填哪儿"，
   * 而是"去哪儿拿"——他得先知道这家叫什么、官网是哪个、控制台在哪一层菜单里。
   * 存下来就能在设置里直接给一个「去申请」的口子。
   */
  keyUrl: string;
}

// 默认模型/端点核对于 2026-09（DeepSeek 以其 /models 实际返回为准；其余见各家官方
// models / deprecations 页）。
// 注意：Kimi 与 MiniMax 的默认 baseUrl 是「国内端点」；用国际平台申请的 Key 请在
// 「高级选项」里改成 https://api.moonshot.ai/v1 / https://api.minimax.io/v1，
// 否则区域不匹配会返回 401。
export const AI_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    // GPT-6 Luna：官方给的高频 / 省钱档默认（能看图）。推理模型：aiClient 自动改用
    // max_completion_tokens、省略 temperature、reasoning_effort 取 none
    defaultModel: 'gpt-6-luna',
    hint: 'gpt-6-luna',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    // 2026-09-10 起 V4.1-Flash 的正式名是 deepseek-flash（原生多模态，能看图）；
    // deepseek-v4-flash 已退役，只是暂时转发过去（见 RETIRED_MODEL_SUCCESSORS）
    defaultModel: 'deepseek-flash',
    hint: 'deepseek-flash',
    // 用户点名的那一个：国内最省心的起步选择，首次引导会把它顶到前面
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    defaultBaseUrl: 'https://api.moonshot.cn/v1', // 国际 Key 改 https://api.moonshot.ai/v1
    defaultModel: 'kimi-k3',
    hint: 'kimi-k3',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'qwen',
    label: '千问',
    // 阿里云百炼的 OpenAI 兼容端点；国际站 Key 改 https://dashscope-intl.aliyuncs.com/compatible-mode/v1
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    // qwen-plus 是稳定别名（始终指向当前 Qwen-Plus），不随版本迭代失效
    defaultModel: 'qwen-plus',
    hint: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    // 官方给新项目的廉价档推荐（3.1-flash-lite 仍可用，2.0 系 2026-06 已关停）
    defaultModel: 'gemini-3.5-flash-lite',
    hint: 'gemini-3.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    defaultBaseUrl: 'https://api.minimaxi.com/v1', // 国际 Key 改 https://api.minimax.io/v1
    defaultModel: 'MiniMax-M3',
    hint: 'MiniMax-M3',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
];

/**
 * 未指定服务商时的默认值（R19 用户拍板：openai → deepseek）。
 *
 * 这不只是"哪个排第一"的问题：provider 缺省会一路影响到
 * resolveProvider 的 baseUrl/model —— 之前缺省落到 openai，
 * 于是一把 DeepSeek 的 Key 会被拿去打 api.openai.com、
 * 或被当成 gpt-5.4-mini（推理模型）来构造请求体。
 * 全站的 `?? 'openai'` 都换成它。
 */
export const DEFAULT_PROVIDER: ApiProvider = 'deepseek';

/**
 * 各家单次输出上限（tokens），用来给「思维链余量」封顶。
 *
 * 核对于 2026-08 官方文档：DeepSeek v4-flash / v4-pro 都是 1M 上下文、**384K 最大输出**，
 * 且默认开思考模式 —— 也就是说在 DeepSeek 上我们永远不该是那个卡住输出的人。
 * 其余家按各自公开的保守值；查不到的走 DEFAULT_MAX_OUTPUT。
 *
 * 只作为**上限**：实际请求量 = 任务所需 + 思维链余量，再被这里夹一下。
 * 真撞上服务商更严的限制时，aiClient 里那发「400 就降档重试」会兜住。
 */
export const PROVIDER_MAX_OUTPUT: Record<ApiProvider, number> = {
  deepseek: 384_000,
  openai:   128_000,
  kimi:      32_000,
  qwen:      32_000,
  gemini:    64_000,
  minimax:   32_000,
};
export const DEFAULT_MAX_OUTPUT = 16_000;

export function providerMaxOutput(provider: ApiProvider | undefined): number {
  return (provider && PROVIDER_MAX_OUTPUT[provider]) || DEFAULT_MAX_OUTPUT;
}

export function getProviderConfig(provider: ApiProvider | undefined): ProviderConfig {
  return AI_PROVIDERS.find(p => p.id === provider)
    ?? AI_PROVIDERS.find(p => p.id === DEFAULT_PROVIDER)
    ?? AI_PROVIDERS[0];
}

/**
 * 服务商已退役 / 改名的模型 → 继任者（v2.7.0.6）。
 *
 * 只在**发请求时**换名，不改用户的存档：存档里写着 deepseek-v4-flash 的老用户，
 * 请求实际发 deepseek-flash；设置页的灰字也显示换过的名字（= 真正在用的那个）。
 * 只收官方公告过下线 / 转发的名字，别拿它做"推荐升级"。
 */
export const RETIRED_MODEL_SUCCESSORS: Record<string, string> = {
  // DeepSeek：2026-09-10 V4.1-Flash 上线，v4-flash / vision-exp 退役并暂时转发；chat / reasoner 2026-07-24 停服
  'deepseek-v4-flash': 'deepseek-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-flash',
  'deepseek-chat': 'deepseek-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
  // Gemini：3.1 Flash-Lite Preview 2026-05 关停；2.0 系 2026-06 关停；1.5 早已 EOL
  'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite',
  'gemini-2.0-flash': 'gemini-3.5-flash-lite',
  'gemini-2.0-flash-lite': 'gemini-3.5-flash-lite',
  'gemini-1.5-flash': 'gemini-3.5-flash-lite',
};

/** 请求实际会用的模型名（退役名换成继任者） */
export function effectiveModelName(model: string): string {
  const m = model.trim();
  return RETIRED_MODEL_SUCCESSORS[m] ?? m;
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
  const model = effectiveModelName(overrideModel?.trim() || p.defaultModel);
  return { baseUrl, model };
}

/**
 * OpenAI 推理模型族（GPT-5 系列 + o 系列）在 /chat/completions 上的请求结构不同：
 * 用 max_completion_tokens 代替 max_tokens，且只接受默认 temperature（自定义会 400）。
 * 按 model id 前缀判断；aiClient 的实际请求与下面的"测试连接"共用此判断，
 * 这样自定义 baseUrl 代理这些模型时也能命中。
 */
export function isReasoningModel(model: string): boolean {
  // gpt-5.x / gpt-6 起全是推理模型（v2.7.0.6 补 gpt-6：之前没认出来会发 max_tokens + temperature）
  return /^(gpt-[5-9]|o[1-9])/i.test(model.trim()) && !/-chat(-|$)/i.test(model.trim());
}

/**
 * OpenAI 推理模型的「最省」思考档取值（v2.7.0.6）。
 * 叫法随代际变过：初代 GPT-5 最低是 minimal；GPT-5.1 起（含 gpt-5.4-mini、gpt-6-*）
 * 改成 none，再发 minimal 会 400（之前线上一直发 minimal，默认模型的测试连接因此失败）；
 * o 系列没有这两档，最低 low。认不准的交给 aiClient 那发「不认就去掉字段重来」。
 */
export function reasoningEffortFor(model: string): string | undefined {
  const m = model.trim().toLowerCase();
  if (/^o[1-9]/.test(m)) return 'low';
  if (/^gpt-5(-(mini|nano))?(-\d{4}-\d{2}-\d{2})?$/.test(m)) return 'minimal';
  if (/^gpt-([5-9])/.test(m)) return 'none';
  return undefined;
}

/**
 * 「会先想很久再写正文」的模型族（不止 OpenAI）。
 *
 * 判断它的意义与 isReasoningModel 不同：后者管**请求结构**（max_completion_tokens /
 * 不发 temperature），这个管**预算**——思维链是要花 token 的，而且花的是同一份额度。
 * 预算给少了，模型把它全花在想上，正文一个字没写就 finish_reason=length，
 * 调用方收到的是「空响应」。用户上报的召唤 Persona / 属性名匹配失败都是这个。
 *
 * 名字嗅探必然漏，所以它只是「先给足」的启发式；真漏了还有 aiClient 里
 * 那一发「空+length 就加倍预算重来」兜底。
 */
export function isThinkingModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return isReasoningModel(m)
    // deepseek-flash / deepseek-pro：v4 家族的无版本号别名，默认带思维链（实测 reasoning_content 会到）；
    // 之前没认出来 → 思维链余量没加 → 推理吃光正文预算 → 「只吐了思维链、没写正文」（v2.7.0.6）
    || /reason|think|-r1|\br1\b|qwq|deepseek-(v[3-9]|flash|pro)|glm-[4-9]\.[5-9]|hunyuan-t|ernie-x|step-r|minimax-m/.test(m)
    // v2.7.0.6 补：Kimi K2 起、Gemini 2.5 / 3.x、Qwen3 开源系、Grok 4、豆包 Seed 都默认先想再写，
    // 且思考 token 和正文共用 max_tokens——没加余量时正文会在结尾被截断（召唤 Persona「最后卡住然后失败」）
    || /kimi-k[2-9]|gemini-(2\.5|[3-9])|qwen3|grok-[4-9]|doubao-seed/.test(m);
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
          ? { max_completion_tokens: 16, ...(reasoningEffortFor(model) ? { reasoning_effort: reasoningEffortFor(model) } : {}) }
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

/**
 * /models 顺带给出的能力信息（v2.7.0.6）。只有部分服务商会给：
 * DeepSeek 返回 input_modalities / max_output_tokens，OpenRouter 放在 architecture 里，
 * Moonshot 用 supports_image_in。给了就以它为准，没给的模型退回按名字猜。
 */
export interface ModelCaps {
  /** 能不能看图（undefined = 接口没说） */
  image?: boolean;
  /** 单次最大输出 tokens（undefined = 接口没说） */
  maxOutput?: number;
}

export type ModelListResult =
  | { ok: true; models: string[]; caps: Record<string, ModelCaps> }
  | { ok: false; error: string };

/** 从 /models 的一行里读能力字段（各家字段名不一，认得的都收） */
function capsOfRow(row: unknown): ModelCaps | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const arch = (r.architecture && typeof r.architecture === 'object') ? r.architecture as Record<string, unknown> : {};
  const modalities = (r.modalities && typeof r.modalities === 'object') ? r.modalities as Record<string, unknown> : {};
  const inputs = [r.input_modalities, arch.input_modalities, modalities.input]
    .find((v): v is unknown[] => Array.isArray(v));
  const caps: ModelCaps = {};
  if (inputs) caps.image = inputs.some(x => typeof x === 'string' && /image|vision/i.test(x));
  else if (typeof r.supports_image_in === 'boolean') caps.image = r.supports_image_in;
  else if (typeof r.vision === 'boolean') caps.image = r.vision;
  const capObj = (r.capabilities && typeof r.capabilities === 'object') ? r.capabilities as Record<string, unknown> : null;
  if (caps.image === undefined && capObj && typeof capObj.vision === 'boolean') caps.image = capObj.vision;
  const topProvider = (r.top_provider && typeof r.top_provider === 'object') ? r.top_provider as Record<string, unknown> : {};
  const maxOut = [r.max_output_tokens, r.max_completion_tokens, topProvider.max_completion_tokens]
    .find((v): v is number => typeof v === 'number' && v > 0);
  if (maxOut) caps.maxOutput = maxOut;
  return caps.image === undefined && caps.maxOutput === undefined ? null : caps;
}

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

    const caps: Record<string, ModelCaps> = {};
    const ids: string[] = [];
    for (const row of rows) {
      const raw = typeof row === 'string' ? row : (row as { id?: unknown } | null)?.id;
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const id = raw.trim().replace(/^models\//, '');
      ids.push(id);
      const c = capsOfRow(row);
      if (c) caps[id] = c;
    }
    const models = [...new Set(ids)].sort((a, b) => a.localeCompare(b));

    if (models.length === 0) return { ok: false, error: '接口没有返回任何模型' };
    return { ok: true, models, caps };
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
