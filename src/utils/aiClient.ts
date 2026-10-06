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
  reasoningEffortFor,
  effectiveModelName,
  providerMaxOutput,
  isOfficialHost,
  relayHint,
  type ApiProvider, DEFAULT_PROVIDER, cleanApiKey } from '@/utils/aiProviders';

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
  /**
   * 这份配置属于哪一档（v2.7.0.6 第 4 轮）。只影响 OpenAI 推理模型的 reasoning_effort：
   * 深思熟虑档不再压成最低档（让它按模型默认的力度想），其余档位与「瞬发」调用照旧压最低。
   */
  tier?: AITier;
}

export type AITier = 'fast' | 'deliberate' | 'assistant' | 'vision' | 'audio';

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
  /**
   * 流式结束时的 finish_reason 回传（仅流式）。调用方据此识别「被 max_tokens
   * 拦腰截断」（'length'）——流式内容已实时上屏无法重试，但至少能把最后那半句
   * 拦下来不吐（助手拟真泡上屏过半个词，用户上报「把某个词只说一半」）。
   */
  onFinishReason?: (reason: string) => void;
  /**
   * 追加进请求体的字段（v2.7.0.6）。目前只用于续写时对 DeepSeek 发
   * `thinking: { type: 'disabled' }`——接着写半截 JSON 不需要再想两分钟。
   */
  extraBody?: Record<string, unknown>;
  /** 不加思维链余量（服务商嫌 max_tokens 太大而 400 之后的降档重发用） */
  noThinkingAllowance?: boolean;
  /** 不发 reasoning_effort（服务商不认这个取值而 400 之后的重发用） */
  noReasoningEffort?: boolean;
  /**
   * 「瞬发」调用（v2.7.0.6 第 4 轮）：用户十秒内就想看到结果的小判定
   * （记录加点解读、记账解析、设置里的成就 / 技能预设名匹配、属性称号）。
   * 对 DeepSeek 发 thinking: disabled、OpenAI 推理模型压最低 effort、总超时 20 秒；
   * 其余调用一律保持思考（质量优先，用户口径）。
   */
  instant?: boolean;
  /**
   * 「中转站保险」（第 12 轮）：去掉只有官方才认的字段（thinking / reasoning_effort / response_format）、
   * 不加思维链余量。非官方地址上撞到 HTTP 400 时自动带上它重发一次——中转站的 400 措辞五花八门，
   * 不按措辞认。
   */
  relaySafe?: boolean;
}

/**
 * response_format:{type:'json_object'} 的 provider 白名单（其余发了可能 400）。
 * deepseek 被剔除：官方文档承认 JSON Output 有概率返回空 content，v4 推理系上
 * 实测高频复现（content 为纯空格）——DeepSeek 走 prompt 约定 + 解析兜底。
 */
const JSON_MODE_PROVIDERS: ReadonlySet<string> = new Set(['openai', 'kimi']);

const DEFAULT_TIMEOUT_MS = 90_000;
/**
 * 思维链模型的非流式超时（v2.7.0.6）：v4-pro 一类思考两三分钟才吐第一个字节，
 * 90 秒硬超时等于"深思熟虑档必挂"（区层显形 / 伪神显形之前就栽在这）。
 * 流式路径不受影响——那边是空闲超时，思维链增量会续命。
 */
const THINKING_TIMEOUT_MS = 300_000;
/** 加倍预算之后还是只有思维链没有正文：给用户一句能懂的话，而不是"已在自动重试" */
const THINK_EXHAUSTED_MSG = '模型把预算全花在思考上了，加大预算重来一次也没写出正文。换个更快的模型，或稍后再试。';

/**
 * 「瞬发」调用的总超时：思考关得掉（DeepSeek）、或本来就不是思维链模型 → 20 秒；
 * 关不掉思考的思维链模型（Kimi / Qwen 一类）放宽到 60 秒，别把正常在想的请求掐了。
 */
const INSTANT_TIMEOUT_MS = 20_000;
const INSTANT_THINKING_TIMEOUT_MS = 60_000;
function instantTimeoutFor(cfg: AIConfig): number {
  const canSkipThinking = cfg.provider === 'deepseek' || isReasoningModel(cfg.model) || !isThinkingModel(cfg.model);
  return canSkipThinking ? INSTANT_TIMEOUT_MS : INSTANT_THINKING_TIMEOUT_MS;
}

/** 非流式：调用方没指定超时时，思维链模型放宽到 THINKING_TIMEOUT_MS；瞬发调用收紧 */
function withThinkingTimeout(cfg: AIConfig, opts: ChatOptions): ChatOptions {
  if (opts.timeoutMs !== undefined) return opts;
  if (opts.instant) return { ...opts, timeoutMs: instantTimeoutFor(cfg) };
  return isThinkingModel(cfg.model) ? { ...opts, timeoutMs: THINKING_TIMEOUT_MS } : opts;
}

/**
 * 流式的**空闲**超时（v2.7.0.6）：思维链模型放宽到 150s。
 * DeepSeek / Kimi 会把思维链一路推过来，空闲计时一直在续；但 OpenAI、Gemini 一类
 * 「闷头想」的模型在想的时候一个字节都不发，90s 会把正在正常思考的请求掐掉。
 */
const THINKING_STREAM_IDLE_MS = 150_000;
function withStreamIdleTimeout(cfg: AIConfig, opts: ChatOptions): ChatOptions {
  if (opts.timeoutMs !== undefined) return opts;
  if (opts.instant) return { ...opts, timeoutMs: instantTimeoutFor(cfg) };
  return isThinkingModel(cfg.model) ? { ...opts, timeoutMs: THINKING_STREAM_IDLE_MS } : opts;
}

/** 收到 finish_reason 之后，最多再等这么久的 [DONE] / 断开；过了就按正常结束算 */
const FINISH_GRACE_MS = 3_000;
const DEFAULT_TEMPERATURE = 0.8;
/** 调用方没指定正文额度时的缺省（各任务大多自带更贴的数，这里只是兜底） */
const DEFAULT_MAX_TOKENS = 2048;
/** 思维链模型的推理余量（在正文额度之外另加）；见 buildRequestBody 注释 */
const THINKING_ALLOWANCE = 65_536;
/** 非官方地址（中转站）的思维链余量：它们多按模型上限直接 400，64K 只会撞回来；12K 是用户定的口径 */
const RELAY_THINKING_ALLOWANCE = 12_000;

/**
 * 从 Settings 解析运行时 AI 配置；未配置 API key 时返回 null。
 * 取代散落在 battleAI / activityAI 等处各写一遍的 getAIConfig。
 */
export function getAIConfig(settings: Settings): AIConfig | null {
  const apiKey = cleanApiKey(settings.summaryApiKey).key;
  if (!apiKey) return null;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );
  return { apiKey, baseUrl, model, provider: settings.summaryApiProvider, tier: 'fast' };
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
  const cfg = applyModelOverride(settings, settings.navigatorProvider, settings.navigatorModel);
  return cfg ? { ...cfg, tier: 'deliberate' } : null;
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
  // 对话是要等首字的：不管落到哪一档的连接上，都按「助手」档处理（OpenAI 推理模型压最低 effort）
  const cfg = own ? applyModelOverride(settings, settings.assistantProvider, own) : getDeliberateAIConfig(settings);
  return cfg ? { ...cfg, tier: 'assistant' } : null;
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
  /** strict：那家 Key 缺失就返回 null，**不**回落到当前连接（视觉 / 听觉档：模型名属于别家，套错连接只会 404 或胡说） */
  strict = false,
): AIConfig | null {
  const activeProvider = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
  if (pv && pv !== activeProvider) {
    const prof = settings.aiProfiles?.[pv];
    const key = cleanApiKey(prof?.key).key;
    if (key) {
      const resolved = resolveProvider(pv, prof?.baseUrl, model?.trim() || prof?.model);
      return { apiKey: key, baseUrl: resolved.baseUrl, model: resolved.model, provider: pv };
    }
    return strict ? null : getAIConfig(settings);
  }
  const base = getAIConfig(settings);
  if (!base) return null;
  const override = model?.trim();
  return override ? { ...base, model: effectiveModelName(override) } : base;
}

/**
 * 没配 Key 时的兜底连接（请求会以 401 / 空 Key 失败，但至少走的是当前服务商的地址，
 * 错误提示也能对上号）。塔罗 / 命运 / 同伴 / 谏言在 hasKey 分流之后用。
 */
export function fallbackAIConfig(settings: Settings): AIConfig {
  return {
    ...resolveProvider(settings.summaryApiProvider, settings.summaryApiBaseUrl, settings.summaryModel),
    apiKey: cleanApiKey(settings.summaryApiKey).key,
    provider: settings.summaryApiProvider,
    tier: 'fast',
  };
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
  const cfg = applyModelOverride(settings, settings.visionProvider, model, true);
  return cfg ? { ...cfg, tier: 'vision' } : null;
}

/**
 * 「听觉」档（FS3）：语音转写。同样不回落——没配就当没有话筒。
 * 注意它走的是 /audio/transcriptions（见 speech.ts），不是 /chat/completions，
 * 但连接解析（key/baseUrl/跨平台）与其它档完全同构，所以复用同一套。
 */
export function getAudioAIConfig(settings: Settings): AIConfig | null {
  const model = settings.audioModel?.trim();
  if (!model) return null;
  const cfg = applyModelOverride(settings, settings.audioProvider, model, true);
  return cfg ? { ...cfg, tier: 'audio' } : null;
}

// ── 内部：超时 + 调用方 signal 合流 ──────────────────────────────────────────

interface AbortBundle {
  signal: AbortSignal;
  /** 流式空闲超时：每收到数据调一次以重置计时 */
  rearm: () => void;
  cleanup: () => void;
  timedOut: () => boolean;
  /** 主动掐断底层请求（调用方提前退出流式循环时用：不然服务商那边继续生成、继续计费） */
  abort: () => void;
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
    abort: () => ac.abort(),
  };
}

function timeoutError(timeoutMs: number): Error {
  const secs = Math.round((timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS) / 1000);
  return new Error(`AI 请求超时（${secs}秒），请检查网络或更换更快的模型`);
}

/** HTTP 层失败：带状态码与 Retry-After（毫秒），调用方可据此退避（紧急修复 #3：Kimi 429） */
export class HttpStatusError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Retry-After 头 → 毫秒（秒数或 HTTP 日期）；没有 / 不合法 → undefined */
function parseRetryAfter(resp: Response): number | undefined {
  const v = resp.headers.get('retry-after');
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 120_000);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - Date.now(), 120_000)) : undefined;
}

/**
 * 被限流（429）/ 服务商说过载（503 且给了 Retry-After）时该等多久再试：
 * 优先 Retry-After，没有就 10s → 20s → 40s（Moonshot 低档位账号是「每分钟 3 次、并发 1」这种量级）。
 * 不是限流 → null。
 */
export function rateLimitWaitMs(e: unknown, attempt: number): number | null {
  if (!(e instanceof HttpStatusError)) return null;
  if (e.status !== 429 && !(e.status === 503 && e.retryAfterMs != null)) return null;
  const ladder = [10_000, 20_000, 40_000];
  return e.retryAfterMs ?? ladder[Math.min(Math.max(attempt, 0), ladder.length - 1)];
}

/** 把 !resp.ok 的响应转成可读错误（复用 aiProviders 的提示映射，与连接测试同源） */
async function toHttpError(resp: Response, provider?: ApiProvider, requestUrl?: string): Promise<Error> {
  const body = await resp.text().catch(() => '');
  const detail = extractProviderErrorMessage(body).slice(0, 200).trim();
  // 先认中转站的措辞（无可用渠道 / 额度 / 令牌 / 模型不存在），认不出再按状态码
  // 官方主机不用中转措辞，落回按状态码 + 厂商的提示。优先按请求地址判：
  // 自己 new 出来的 Response（测试桩 / 个别代理层）resp.url 是空串，只靠它会把官方当成中转
  const hint = relayHint(detail, isOfficialHost(requestUrl || resp.url)) || getHttpStatusHint(resp.status, provider);
  const prefix = hint ? `${hint}（HTTP ${resp.status}）` : `HTTP ${resp.status}`;
  return new HttpStatusError(detail ? `${prefix}: ${detail}` : prefix, resp.status, parseRetryAfter(resp));
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
  const relaySafe = !!opts.relaySafe;
  const body: Record<string, unknown> = { model: cfg.model, messages, stream };
  if (opts.jsonMode && cfg.provider && JSON_MODE_PROVIDERS.has(cfg.provider) && !relaySafe) {
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
  /**
   * 思维链余量：ceiling 不是 target —— 没用完不收费，所以宁可给宽。
   * 64K：deepseek-v4-pro 实测一次中长期占卜就能想 8~9K 字、pro 一族偶尔翻倍，
   * 32K 时代的"绰绰有余"已经不够稳；正文额度仍由各调用点按任务自己定，不统一口径。
   * 总额再被该服务商的单次输出上限夹一下（DeepSeek 384K 等于不夹；Kimi/Qwen/MiniMax 32K
   * 会把它压回去）。真撞上更严的限制，chatComplete / chatStream 那发「400 就降档」会兜住。
   */
  /**
   * 「瞬发」调用：DeepSeek 直接关思考（V4 系列吃 thinking 字段）。关掉了就不用再留思维链余量；
   * 关不掉的（别家思维链模型）余量照留，只靠压 effort / 缩短超时。
   */
  const thinkingOff = !!opts.instant && cfg.provider === 'deepseek' && !relaySafe;
  if (thinkingOff) body.thinking = { type: 'disabled' };
  const thinking = isThinkingModel(cfg.model) && !opts.noThinkingAllowance && !thinkingOff && !relaySafe;
  const cap = providerMaxOutput(cfg.provider);
  // 思维链余量：官方地址 64K；非官方（中转站）收到 12K（第 12 轮，用户口径）——它们多半按模型上限
  // 直接 400，余量再大也是撞回来；真撞了还有 relaySafe 那一发兜底
  const allowance = isOfficialHost(cfg.baseUrl) ? THINKING_ALLOWANCE : RELAY_THINKING_ALLOWANCE;
  const budget = Math.min(cap, thinking ? maxTokens + Math.max(allowance, maxTokens) : maxTokens);
  if (isReasoningModel(cfg.model)) {
    body.max_completion_tokens = budget;
    /**
     * OpenAI 推理模型的思考力度。取值按代际分（v2.7.0.6 修）：
     * 初代 GPT-5 最低档叫 minimal；GPT-5.1 起（含默认的 gpt-5.4-mini、gpt-6-*）改叫 none，
     * 再发 minimal 会 400；o 系列没有这两档，最低 low。
     * 第 4 轮：**深思熟虑档不再压成最低**——不发这个字段，让模型按默认力度想（那一档要的就是质量）；
     * 快速 / 助手档和瞬发调用照旧压最低（要的是首字快）。
     */
    const pressLowest = !!opts.instant || cfg.tier !== 'deliberate';
    const effort = opts.noReasoningEffort || !pressLowest ? undefined : reasoningEffortFor(cfg.model);
    if (effort && !relaySafe) body.reasoning_effort = effort;
    // 不发 temperature：推理模型只接受默认 1，自定义会 400
  } else {
    body.max_tokens = budget;
    body.temperature = opts.temperature ?? DEFAULT_TEMPERATURE;
  }
  if (opts.extraBody) Object.assign(body, opts.extraBody);
  if (relaySafe) {
    // 调用方塞进 extraBody 的官方专属字段（如 DeepSeek 的 thinking）一并去掉
    delete body.thinking;
    delete body.reasoning_effort;
    delete body.response_format;
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
/** 「finish_reason=length」——预算不够的特征错误（正文可能为空，也可能是半截） */
const EMPTY_LENGTH = Symbol('aiEmptyLength');
interface LengthMarked { [EMPTY_LENGTH]?: true; aiPartialText?: string }
function markEmptyLength(e: Error, partialText?: string): Error {
  (e as Error & LengthMarked)[EMPTY_LENGTH] = true;
  if (partialText) (e as Error & LengthMarked).aiPartialText = partialText;
  return e;
}
function isEmptyLengthError(e: unknown): boolean {
  return !!(e as Error & LengthMarked)?.[EMPTY_LENGTH];
}
/** 截断错误上挂着的半成品正文（重试也失败时的最后退路） */
function partialOf(e: unknown): string {
  return (e as Error & LengthMarked)?.aiPartialText ?? '';
}

const isHttp400 = (e: unknown): boolean => e instanceof Error && /HTTP 400\b/.test(e.message);

/** 服务商嫌 max_tokens / max_completion_tokens 太大而 400（各家措辞不同，按关键词认） */
function isOverBudgetError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : '';
  if (!/HTTP 400|invalid_request|Bad Request/i.test(m)) return false;
  return /max_tokens|max_completion_tokens|maximum.*tokens|tokens.*exceed|too large|less than or equal/i.test(m);
}

/** 服务商不认 reasoning_effort（或它的某个取值）而 400 */
function isUnsupportedEffortError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : '';
  if (!/HTTP 400|invalid_request|Bad Request|unsupported/i.test(m)) return false;
  return /reasoning[._ ]?effort|reasoning\.effort/i.test(m);
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
    // ⓪ 非官方地址（中转站）撞到 400：先把只有官方才认的字段（thinking / reasoning_effort / response_format）
    //    和思维链余量全去掉重发一次——它们的 400 措辞五花八门，不按措辞认（第 12 轮）
    if (!opts.relaySafe && isHttp400(e) && !isOfficialHost(cfg.baseUrl)) {
      return await chatComplete(cfg, messages, { ...opts, relaySafe: true, noThinkingAllowance: true });
    }
    // ① 预算不够（正文为空 or 半截）→ 翻三倍重来一次
    if (isEmptyLengthError(e)) {
      const bumped = Math.max(4000, (opts.maxTokens ?? DEFAULT_MAX_TOKENS) * 3);
      try {
        return await chatCompleteOnce(cfg, messages, { ...opts, maxTokens: bumped });
      } catch (e2) {
        // 加了预算还是截断：退回两次里更长的那段半成品——半句话好过整轮报错。
        // （非截断类错误照抛，别把真实故障吞成一段残句。）
        if (isEmptyLengthError(e2)) {
          const best = [partialOf(e), partialOf(e2)].sort((a, b) => b.length - a.length)[0];
          if (best.trim()) return best;
          // 一个字都没有：内部那句「已在自动加大预算重试」不该当最终错误弹给用户
          throw new Error(THINK_EXHAUSTED_MSG);
        }
        throw e2;
      }
    }
    /**
     * ② 预算**超过服务商上限**被 400 顶回来 → 降到保守档重发。
     *
     * 这是"为什么不直接按厂商上限要"的答案：ceiling 不是 target，没用完不收费，
     * 所以要得宽本身没代价；代价在于**各家上限不一样、也没有可靠的地方查**，
     * 写死一个大数会让上限较低的模型直接 400。
     * 于是策略是「先要宽 → 被拒就退」，而不是「先猜一个都能过的小数」。
     */
    if (isOverBudgetError(e)) {
      // 先去掉思维链余量（余量才是把总额顶爆的那部分），还不行再退到保守档
      if (!opts.noThinkingAllowance && isThinkingModel(cfg.model)) {
        try {
          return await chatCompleteOnce(cfg, messages, { ...opts, noThinkingAllowance: true });
        } catch (e2) {
          if (!isOverBudgetError(e2)) throw e2;
        }
      }
      if ((opts.maxTokens ?? DEFAULT_MAX_TOKENS) > 2048) {
        return await chatCompleteOnce(cfg, messages, { ...opts, maxTokens: 2048, noThinkingAllowance: true });
      }
    }
    // ③ 服务商不认 reasoning_effort 的取值（各家各代叫法不一）→ 不发这个字段重来
    if (isUnsupportedEffortError(e) && !opts.noReasoningEffort) {
      return await chatComplete(cfg, messages, { ...opts, noReasoningEffort: true });
    }
    throw e;
  }
}

/** 思维链里若有一段能解析的 JSON 对象，只取那一段（见 chatCompleteOnce 注释 ②） */
function salvageJsonFromReasoning(reasoning: string): string | null {
  const a = reasoning.indexOf('{');
  const b = reasoning.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  const candidate = reasoning.slice(a, b + 1);
  try {
    const v = JSON.parse(candidate);
    return v && typeof v === 'object' ? candidate : null;
  } catch {
    return null;
  }
}

async function chatCompleteOnce(
  cfg: AIConfig,
  messages: AIMessage[],
  rawOpts: ChatOptions = {},
): Promise<string> {
  const opts = withThinkingTimeout(cfg, rawOpts);
  const ab = setupAbort(opts);
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify(buildRequestBody(cfg, messages, opts, false)),
      signal: ab.signal,
    });
    if (!resp.ok) throw await toHttpError(resp, cfg.provider, cfg.baseUrl);
    const data = await resp.json().catch(() => null);
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : '';
    if (typeof content === 'string' && content.trim()) {
      /**
       * 正文非空但 finish_reason=length：**拦腰截断**——最后一句多半只写了半截，
       * 中文里甚至会把一个词切成半个字面（用户上报助手「错误地截断句子/词只说一半」）。
       * 此前这里直接把半成品返回给调用方；现在与「正文全空」同待遇：
       * 抛特征错误让外层加预算重来，半成品挂在错误上作最后退路。
       */
      if (finishReason === 'length') {
        throw markEmptyLength(
          new Error('AI 输出被 max_tokens 拦腰截断（finish_reason=length）——已自动加大预算重试'),
          content,
        );
      }
      return content;
    }
    /**
     * 正文空了，但别急着判失败——两种真实情况：
     *
     * ① 预算被推理段吃光 → finish_reason: 'length'，content 是空串。
     *    先按这条走：外层会加大预算重来（第 4 轮把它挪到了 ② 前面——以前 ② 排在前头，
     *    思维链里恰好出现一对花括号就被当成正文交回去，调用方拿到的是半段思考过程）。
     * ② 思维链模型（DeepSeek-R1 / GLM / Qwen-thinking 一族）会把内容写进
     *    message.reasoning_content，content 留空。里面若带着**一段能解析的 JSON 对象**，
     *    只把那段捞出来照样能用（要 JSON 的调用占绝大多数；不要 JSON 的调用，
     *    思维链里也很少有恰好能解析的对象）。
     *    这两种都会表现成用户说的「AI 内容根本就没返回」，
     *    但错误提示只写「空响应」，看不出该调大预算还是该换模型。
     */
    const reasoning = choice?.message?.reasoning_content ?? choice?.message?.reasoning;
    const fr = finishReason;
    if (fr === 'length') {
      // 打上标记：外层 chatComplete 会加倍预算再来一发
      throw markEmptyLength(new Error(
        '模型把预算全花在思考上了，正文一个字没写（finish_reason=length）——已在自动加大预算重试',
      ));
    }
    const salvaged = typeof reasoning === 'string' ? salvageJsonFromReasoning(reasoning) : null;
    if (salvaged) return salvaged;
    if (!fr && typeof reasoning === 'string' && reasoning.trim()) {
      throw markEmptyLength(new Error(
        '模型把预算全花在思考上了，正文一个字没写（连接在思考中途断开）——已在自动加大预算重试',
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
 * - **自愈**：一个字都没产出就结束（流被中途掐断 / 思维链模型偶发空正文 / 预算被推理吃光）
 *   自动再来一发，最多三发；第三发对 DeepSeek 关掉思维链。服务商嫌 max_tokens 太大而 400
 *   → 降到 2048 重来。全部失败才把原因抛给上层。
 *   （用户上报每日塔罗多次「只吐了思维链、没写正文」，断断续续才跑完：正文没到就结束的流，
 *   此前直接报错让人手点重试，现在自己重来。）
 * - 结束时把 finish_reason 回传（'' = 服务端没给 / 连接中途断开），调用方据此判断有没有收完
 */
export async function* chatStream(
  cfg: AIConfig,
  messages: AIMessage[],
  opts: ChatOptions = {},
): AsyncGenerator<string, void, unknown> {
  opts = withStreamIdleTimeout(cfg, opts);
  const ab = setupAbort(opts);
  /** 0 = 原样；1 = 去掉思维链余量；2 = 再退到 2048 */
  let budgetStep = 0;
  let noEffort = !!opts.noReasoningEffort;
  /** 中转站保险：非官方地址撞到 400 就带上它重发（见 ChatOptions.relaySafe） */
  let relaySafe = !!opts.relaySafe;
  let last: StreamOutcome = { produced: false, sawReasoning: false, finishReason: '' };
  /** 正常收完才置 true；调用方提前 break（generator.return）或中途抛错时仍是 false → finally 里掐断底层请求 */
  let completed = false;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const extra: Record<string, unknown> = {};
      if (attempt === 2 && cfg.provider === 'deepseek') extra.thinking = { type: 'disabled' };
      const attemptOpts: ChatOptions = {
        ...opts,
        ...(budgetStep >= 1 ? { noThinkingAllowance: true } : {}),
        ...(budgetStep >= 2 ? { maxTokens: Math.min(opts.maxTokens ?? DEFAULT_MAX_TOKENS, 2048) } : {}),
        ...(noEffort ? { noReasoningEffort: true } : {}),
        ...(relaySafe ? { relaySafe: true, noThinkingAllowance: true } : {}),
      };
      let outcome: StreamOutcome;
      try {
        outcome = yield* streamOnce(cfg, messages, attemptOpts, ab, extra);
      } catch (e) {
        // 这几类 400 在请求发出去就被拒了，一个字节都没流过来，换参数重发是安全的
        if (!relaySafe && isHttp400(e) && !isOfficialHost(cfg.baseUrl)) { relaySafe = true; attempt--; continue; }
        if (budgetStep < 2 && isOverBudgetError(e)) { budgetStep++; attempt--; continue; }
        if (!noEffort && isUnsupportedEffortError(e)) { noEffort = true; attempt--; continue; }
        throw e;
      }
      if (outcome.produced) {
        completed = true;
        opts.onFinishReason?.(outcome.finishReason);
        return;
      }
      last = outcome;
      if (ab.signal.aborted) { completed = true; return; }
      if (import.meta.env.DEV) console.warn(`[aiClient] 流式第 ${attempt + 1} 发没有正文（reasoning=${outcome.sawReasoning} finish=${outcome.finishReason || '-'}），自动重试`);
    }
    throw new Error(
      last.sawReasoning
        ? '模型连续三次只吐了思维链、没写正文——多半是连接被中途掐断或服务端异常，稍后再试'
        : last.finishReason === 'length'
          ? 'AI 输出被 max_tokens 截断（finish_reason=length）'
          : `AI 流式返回为空${last.finishReason ? `（finish_reason=${last.finishReason}）` : ''}，可能被截断或被审查拦截`,
    );
  } catch (e) {
    rethrowAbortAware(e, ab, opts);
  } finally {
    ab.cleanup();
    /**
     * 调用方提前退出（拟真流被用户打断 / 组件卸载 break 掉 for-await）时，for-await 会调
     * generator.return()，这里的 finally 是唯一能拿到控制权的地方：不掐断，服务商那边就继续
     * 生成、继续计费，连接也一直挂着。正常收完（completed）时 abort 是空操作。
     */
    if (!completed) ab.abort();
  }
}

interface StreamOutcome {
  /** 至少收到过一个非空白的正文 delta */
  produced: boolean;
  sawReasoning: boolean;
  finishReason: string;
}

/** 单发流式：正文 delta 逐段 yield，结束时把本发的结局作为 return 值交回 chatStream */
async function* streamOnce(
  cfg: AIConfig,
  messages: AIMessage[],
  opts: ChatOptions,
  ab: AbortBundle,
  extra: Record<string, unknown>,
): AsyncGenerator<string, StreamOutcome, unknown> {
  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(cfg, 'text/event-stream'),
    body: JSON.stringify({ ...buildRequestBody(cfg, messages, opts, true), ...extra }),
    signal: ab.signal,
  });
  if (!resp.ok) throw await toHttpError(resp, cfg.provider, cfg.baseUrl);
  if (!resp.body) throw new Error('AI 流式响应无 body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let produced = false;
  let sawReasoning = false;
  let finishReason = '';
  try {
  outer: while (true) {
    /**
     * 收到 finish_reason 以后不再无限等 [DONE]（v2.7.0.6）。
     * 有些中转网关 / 代理发完最后一块不关连接，读循环就挂在这里，直到空闲超时把它
     * 当成失败抛出去——正文明明已经完整（用户上报「生成在最后卡住然后失败」的一种）。
     * 宽限 FINISH_GRACE_MS 内没有新数据就按正常结束处理，并主动关掉读取。
     */
    const next = finishReason
      ? await Promise.race([
          reader.read(),
          new Promise<{ done: true; value: undefined; grace: true }>(r => setTimeout(() => r({ done: true, value: undefined, grace: true }), FINISH_GRACE_MS)),
        ])
      : await reader.read();
    const { value, done } = next;
    if (done) {
      if ('grace' in next) reader.cancel().catch(() => { /* 已关 */ });
      break;
    }
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
        // 思维链不 yield 给 UI（那是过程不是答案），只回调给进度估算
        const rd: string = c?.delta?.reasoning_content ?? c?.delta?.reasoning ?? '';
        if (rd) { sawReasoning = true; opts.onReasoning?.(rd); }
        const delta: string = c?.delta?.content ?? c?.message?.content ?? '';
        if (delta) {
          // 纯空白不算"写了正文"（DeepSeek 推理系偶发 content 为空格）
          if (delta.trim()) produced = true;
          yield delta;
        }
      } catch { /* 半个 / 非法 chunk，跳过 */ }
    }
  }
  } finally {
    // [DONE] 之后 / 提前退出：把读取端关掉，连接不再挂着（已关闭的流上 cancel 是空操作）
    reader.cancel().catch(() => { /* 已关 */ });
  }
  return { produced, sawReasoning, finishReason };
}
