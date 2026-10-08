/**
 * 按「主机 + 模型」记住的请求怪癖（第 14 批 · 中转站实测）。
 *
 * 同一个模型名在不同地方脾气不一样：新一代 Claude（sonnet-5 / opus-4-8 / opus-5-5 / fable-5-1…）
 * 一律 400「`temperature` is deprecated for this model」；gpt-6.1-sol 不认 reasoning_effort=none、
 * 只收 low 往上；有的中转站要把官方专属字段全去掉才收。撞过一次就记在这里，这次运行里之后的请求
 * （和「测试连接」）直接按它发，不再每次先白打一发 400。
 *
 * 只在内存里：重开 App 重新学一次（多一发 400 而已），不进设置、不上云、不进备份。
 * 单独一个模块，aiClient（真实请求）和 aiProviders（测试连接）都用它，互相不 import 免得成环。
 */
import { hostOfUrl } from '@/utils/aiTransport';

export interface ModelQuirks {
  /** 不收 temperature */
  noTemperature?: boolean;
  /** reasoning_effort：undefined = 按默认规则；null = 不发；字符串 = 发这一档（服务商列出来的最低一档） */
  effort?: string | null;
  /** 只有走「中转站保险」（去掉 thinking / reasoning_effort / response_format / temperature）才收 */
  relaySafe?: boolean;
  /**
   * 一次性（非流式）调用必须带 enable_thinking=false（阿里云百炼的 Qwen3 开源系：
   * 「parameter.enable_thinking must be set to false for non-streaming calls」）；流式不受影响
   */
  nonStreamThinkingOff?: boolean;
  /**
   * 按这个模型名发（第 16 批 · 区层显形实测）：中转站（new-api 一族）把「xxx-thinking」版本改写成旧式思考参数
   * thinking.type=enabled，新一代 Claude（opus-5-5 / sonnet-5-5 / fable-5-1…）只认 adaptive，回 400，
   * 而且不管我们发什么都一样；去掉后缀发同一个模型就通。
   */
  sendAs?: string;
}

const store = new Map<string, ModelQuirks>();
const keyOf = (baseUrl: string, model: string) => `${hostOfUrl(baseUrl)}|${model.trim().toLowerCase()}`;

/**
 * 已知只收默认 temperature 的模型（第 17 批 · Kimi 实测）：Moonshot 的 kimi-k2.6 / k2.7-code / k3 一律回 400
 * 「invalid temperature: only 1 is allowed for this model」。不用先撞一发再学——免费账号每分钟只有 3 次，白撞的那发很贵。
 * 撞了再学的那套照旧兜底（规则漏掉的模型）。
 */
const STATIC_NO_TEMPERATURE = /^kimi-k(?:2\.(?:[6-9]|\d{2,})|[3-9])/i;

export function quirksFor(baseUrl: string, model: string): ModelQuirks {
  const learned = store.get(keyOf(baseUrl, model)) ?? {};
  return learned.noTemperature === undefined && STATIC_NO_TEMPERATURE.test(model.trim()) ? { ...learned, noTemperature: true } : learned;
}

export function rememberQuirk(baseUrl: string, model: string, patch: ModelQuirks): void {
  const k = keyOf(baseUrl, model);
  store.set(k, { ...(store.get(k) ?? {}), ...patch });
}

export function _resetQuirksForTest(): void {
  store.clear();
}

/** 400 的报错在说「这个模型不收 temperature」（deprecated / not supported / 只能用默认值…） */
export function isUnsupportedTemperatureMessage(message: string): boolean {
  const m = message || '';
  if (!/temperature/i.test(m)) return false;
  return /deprecat|not supported|unsupported|does not support|doesn't support|not allowed|not permitted|only (the )?default|only 1\b|only supports|invalid|不支持|已弃用|不允许/i.test(m);
}

/**
 * 400 的报错在说「旧式思考参数这个模型不认」（Anthropic：「"thinking.type.enabled" is not supported for this model.
 * Use "thinking.type.adaptive" and "output_config.effort"…」）。new-api 会把像域名的片段打码成「***.***.enabled」，
 * 两种写法都认；output_config.effort 带下划线不会被打码，是最稳的记号。
 */
export function isLegacyThinkingMessage(message: string): boolean {
  const m = message || '';
  return /output_config\.effort|thinking\.type\.(enabled|adaptive)|\*+\.\*+\.(enabled|adaptive)/i.test(m)
    || (/thinking/i.test(m) && /adaptive/i.test(m) && /not supported|unsupported|不支持/i.test(m));
}

/** 「xxx-thinking」（也认 _thinking / :thinking）→ 去掉后缀的同一个模型；没有这个后缀返回 null */
export function thinkingSuffixBase(model: string): string | null {
  const m = model.trim();
  const base = m.replace(/[-_:]thinking$/i, '');
  return base && base !== m ? base : null;
}

/** 400 的报错在说 enable_thinking（百炼 Qwen3 开源系一次性调用必须关思考） */
export function isEnableThinkingMessage(message: string): boolean {
  return /enable_thinking/i.test(message || '');
}

const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high'];

/**
 * 400 的报错在说 reasoning_effort（或它的某个取值）不认：
 *   返回该改发的那一档——报错里列了可用值就取其中最省的（none → minimal → low → …）；列不出就返回 null（不发）。
 *   不是这类报错 → undefined。
 * 认两种写法：OpenAI 官方「'reasoning_effort' does not support 'none' … Supported values are …」，
 * 以及中转站转出来的「Unsupported value: 'none' is not supported with the 'gpt-6.1-sol' model. Supported values are …」（不提字段名）。
 */
export function effortFixFromMessage(message: string): string | null | undefined {
  const m = message || '';
  const effortish = /reasoning[._ ]?effort/i.test(m) || /unsupported value:?\s*'(none|minimal|low|medium|high)'/i.test(m);
  if (!effortish) return undefined;
  const listed = /supported values (are|is):?([^\n]*)/i.exec(m)?.[2] ?? '';
  const values = [...listed.matchAll(/'([a-z]+)'/gi)].map((x) => x[1].toLowerCase());
  return EFFORT_ORDER.find((v) => values.includes(v)) ?? null;
}
