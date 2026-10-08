/**
 * AI provider 配置与连接测试
 * 统一管理各 provider 的 baseUrl / defaultModel，避免分散在 store / Settings / SummaryModal 中重复
 * 所有 provider 均走 OpenAI 兼容的 /chat/completions 端点
 */
import { aiFetch, hostOfUrl, nativeTransportAvailable } from '@/utils/aiTransport';
import { recordAIDiag } from '@/utils/aiDiagnostics';
import { effortFixFromMessage, isEnableThinkingMessage, isLegacyThinkingMessage, isUnsupportedTemperatureMessage, quirksFor, rememberQuirk, thinkingSuffixBase } from '@/utils/aiQuirks';
import { anthropicEndpoint, anthropicHeaders } from '@/utils/aiAnthropic';

export type ApiProvider = 'openai' | 'deepseek' | 'kimi' | 'qwen' | 'gemini' | 'minimax' | 'custom';
/** 请求协议：OpenAI 兼容（/chat/completions，六家和绝大多数中转站）/ Anthropic Messages（自定义服务商的备用协议） */
export type ApiProtocol = 'openai' | 'anthropic';

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
  /**
   * 第 14 批 · 自定义服务商（第 7 个胶囊）：中转站和其它 OpenAI 兼容平台（硅基流动 / 火山方舟 / 智谱 / OpenRouter），
   * 以及 Anthropic 协议。地址、模型都要自己填（没有默认值）；名字、协议、取 Key 入口跟着设置走（见 syncCustomProvider）。
   * 不带任何一家的专属字段和报错口径。
   */
  {
    id: 'custom',
    label: '自定义',
    defaultBaseUrl: '',
    defaultModel: '',
    hint: '',
    keyUrl: '',
  },
];

/** 自定义服务商的预设：一键填地址、协议和取 Key 入口（跨域与 /models 均于 2026-10-07 实测） */
export interface CustomProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  protocol: ApiProtocol;
  keyUrl: string;
  hint: string;
}
export const CUSTOM_PRESETS: readonly CustomProviderPreset[] = [
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', protocol: 'openai', keyUrl: 'https://cloud.siliconflow.cn/account/ak', hint: '国内可直连，开源模型多（DeepSeek / Qwen / GLM…）' },
  { id: 'ark', name: '火山方舟', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', protocol: 'openai', keyUrl: 'https://console.volcengine.com/ark', hint: '豆包等；模型名填方舟里的模型 ID 或接入点 ID' },
  { id: 'zhipu', name: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', protocol: 'openai', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', hint: 'GLM 系列' },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', protocol: 'openai', keyUrl: 'https://openrouter.ai/settings/keys', hint: '一个 Key 用各家模型（国内网络可能不稳）' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', protocol: 'anthropic', keyUrl: 'https://console.anthropic.com/settings/keys', hint: '官方 Claude（Anthropic 协议）' },
  { id: 'relay', name: '中转站', baseUrl: '', protocol: 'openai', keyUrl: '', hint: '填中转站给的地址（一般以 /v1 结尾）；它若只给 Anthropic 格式的地址，协议选 Anthropic' },
];

/**
 * 自定义服务商的名字 / 协议 / 取 Key 入口：store 订阅设置变化同步过来（与 aiTransport.syncNativeHosts 同一个思路），
 * 这样各处 getProviderConfig('custom').label 显示的就是用户起的名字，不用每个调用点都去读设置。
 */
const customState = { name: '', protocol: 'openai' as ApiProtocol, keyUrl: '' };
export function syncCustomProvider(s: { customProviderName?: string; customProviderProtocol?: ApiProtocol; customProviderPreset?: string } | null | undefined): void {
  const preset = CUSTOM_PRESETS.find((p) => p.id === s?.customProviderPreset);
  customState.name = s?.customProviderName?.trim() || preset?.name || '';
  customState.protocol = s?.customProviderProtocol === 'anthropic' ? 'anthropic' : 'openai';
  customState.keyUrl = preset?.keyUrl ?? '';
}
/** 自定义服务商当前用的协议 */
export const customProtocol = (): ApiProtocol => customState.protocol;

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
  // 自定义：不知道接的是谁，按常见的 32K 封顶；更严的会被「400 就降档」兜住
  custom:    32_000,
};
export const DEFAULT_MAX_OUTPUT = 16_000;

export function providerMaxOutput(provider: ApiProvider | undefined): number {
  return (provider && PROVIDER_MAX_OUTPUT[provider]) || DEFAULT_MAX_OUTPUT;
}

export function getProviderConfig(provider: ApiProvider | undefined): ProviderConfig {
  if (provider === 'custom') {
    const base = AI_PROVIDERS.find(p => p.id === 'custom')!;
    return { ...base, label: customState.name || base.label, keyUrl: customState.keyUrl };
  }
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
/**
 * 把用户贴的地址整理成「不含尾斜杠、不带端点路径」的 base（第 12 轮，境内中转站画像）：
 *   · 漏了 https:// 的补上（手机上常漏；没有协议的地址 fetch 会当成相对路径）
 *   · 去掉 ?query / #hash 与尾斜杠
 *   · 去掉误贴的 /chat/completions、/completions、/models、/embeddings——中转站的文档常给完整端点
 * 少写的 /v1 不在这里补（有的网关确实不带版本段），交给测试连接去探。
 */
export function normalizeBaseUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, '')}`;
  u = u.replace(/[?#].*$/, '').replace(/\/+$/, '');
  u = u.replace(/\/(chat\/completions|completions|models|embeddings|messages)$/i, '');
  return u.replace(/\/+$/, '');
}

/** 各家官方接口的主机名（含国际站别名）：只有打到这些主机的请求才算「官方」，其余都按中转站对待 */
const OFFICIAL_HOSTS = new Set([
  'api.openai.com',
  'api.deepseek.com',
  'api.moonshot.cn', 'api.moonshot.ai',
  'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com',
  'generativelanguage.googleapis.com',
  'api.minimaxi.com', 'api.minimax.io',
  // 第 14 批 · 自定义服务商的预设平台：都是官方接口，不按中转站对待（报错按状态码说、思维链余量按官方给）
  'api.siliconflow.cn', 'api.siliconflow.com', 'ark.cn-beijing.volces.com', 'open.bigmodel.cn', 'openrouter.ai', 'api.anthropic.com',
]);
/**
 * 千问「套餐专属」网关（coding plan / token plan）：阿里自家的地址，不是中转站——报错措辞按官方说；
 * 但它对浏览器的 OPTIONS 预检回 401、不带 CORS 头（2026-10-06 实测），网页版发不出去，App 里走原生通道（aiTransport）。
 */
const QWEN_PLAN_HOSTS = [/^coding\.dashscope(-intl)?\.aliyuncs\.com$/i, /^token-plan\.[a-z0-9-]+\.maas\.aliyuncs\.com$/i];
export const isQwenPlanHost = (host: string): boolean => QWEN_PLAN_HOSTS.some((re) => re.test(host));

export function isOfficialHost(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).host.toLowerCase();
    return OFFICIAL_HOSTS.has(host) || isQwenPlanHost(host);
  } catch {
    return false;
  }
}

/**
 * 中转站（one-api / new-api 一族）的错误措辞 → 该做什么。按措辞认、不按状态码：它们的状态码不准
 * （没渠道回 503、额度用尽回 403……），按状态码给的提示（「服务繁忙」「无访问权限」）会把人带偏。
 * 认不出返回空串，由调用方退回状态码提示。
 */
/**
 * 服务商的内容安全审核拦截（千问 data_inspection_failed、DeepSeek Content Exists Risk、Kimi「high risk」…）：
 * 都回 400，以前被说成「请求格式有误」，用户以为是自己设置坏了（第 13 轮）。认出来就直说。
 */
export const MODERATION_HINT = '内容被服务商的安全审核拦下了（不是设置问题）：换个说法或删掉敏感的部分再试';
export function moderationHint(detail: string): string {
  return /data[_\s-]?inspection|content[_\s-]?exists[_\s-]?risk|content[_\s-]?filter|considered high risk|high[_\s-]?risk|inappropriate content|敏感|违规|安全审核/i.test(detail || '')
    ? MODERATION_HINT : '';
}

/** 中转站对这个模型强开了旧式思考参数，新一代 Claude 不认（第 16 批） */
export const LEGACY_THINKING_HINT = '中转站给这个模型发了旧式的思考参数，这一代 Claude 不认（不是 Key 或设置的问题）：换成不带「-thinking」的同款模型，或换个模型';

/** 中转站这个模型临时没上游（第 14 批）：aiClient / battleAI 按这句认「别再连撞了」 */
export const RELAY_CAPACITY_HINT = '中转站这个模型暂时没有可用的上游资源（不是 Key 或设置的问题）：换个模型，或过一会儿再试';

export function relayHint(detail: string, official = false): string {
  // 官方主机不用中转措辞：DeepSeek 官方 402 的「Insufficient Balance」也会撞上下面的「余额」正则，
  // 被说成「去中转站充值」（第 13 轮用户反馈）；官方落回按状态码 + 厂商的提示（getHttpStatusHint）
  if (official) return '';
  const d = detail || '';
  if (!d) return '';
  // 中转站给这个模型发了旧式思考参数（「-thinking」版本被改写成 thinking.type=enabled），新一代 Claude 不认（第 16 批）：
  // 带 -thinking 后缀的 aiClient 会自动去掉后缀重发，走到这里说明自动改不了
  if (isLegacyThinkingMessage(d)) return LEGACY_THINKING_HINT;
  // 中转站这个模型临时没上游（如「No available resources, please try again later」）：不是 Key / 设置的问题（第 14 批）
  if (/no available resources?|无可用资源|上游负载已饱和|负载已饱和|上游.*(繁忙|不可用)|系统繁忙|server is busy|temporarily unavailable|overloaded/i.test(d)) return RELAY_CAPACITY_HINT;
  if (/无可用渠道|no available channel|no channel|channel not found|无可用的渠道/i.test(d)) return '这把 Key 的分组里没有这个模型：换个模型名（试试「刷新全部模型列表」），或在中转站把令牌换到有它的分组';
  if (/额度|余额|quota|balance|insufficient/i.test(d)) return '额度 / 余额用尽：去中转站充值，或换一个令牌';
  if (/(令牌|token|api[ _-]?key|密钥)/i.test(d) && /(无效|不存在|不可用|invalid|disabled|unavailable|禁用|expired|过期|incorrect|错误)/i.test(d)) return '令牌（Key）无效或已被禁用：回中转站重新复制一个';
  // 参数被拒（temperature / max_tokens / 思考档…）的报错也常带「model」和「invalid」（Kimi：「invalid temperature: only 1 is allowed for this model」），
  // 以前被这条说成「模型名不对」（第 17 批 · 用户反馈「400 模型名称不正确」）。说到参数名的不算模型名问题
  if (/(模型|model)/i.test(d) && /(不存在|不支持|not found|does not exist|not exist|unknown|unsupported|invalid|未配置)/i.test(d)
    && !/temperature|top_p|max_tokens|max_completion_tokens|reasoning|thinking|parameter|参数/i.test(d)) return '模型名不对：点「刷新全部模型列表」从里面选';
  if (/分组|group/i.test(d)) return '令牌分组不对：在中转站把令牌换到有这个模型的分组';
  return '';
}

export function resolveProvider(
  provider: ApiProvider | undefined,
  overrideBaseUrl?: string,
  overrideModel?: string
): { baseUrl: string; model: string } {
  const p = getProviderConfig(provider);
  const baseUrl = overrideBaseUrl?.trim() ? normalizeBaseUrl(overrideBaseUrl) : p.defaultBaseUrl;
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
  | {
      ok: true;
      latencyMs: number;
      model: string;
      /** 实际连通的地址（填的地址少写了 /v1 时是补过的那个） */
      baseUrlUsed: string;
      /** 填的地址不通、补 /v1 才通：界面应把 baseUrlUsed 替换进设置 */
      corrected: boolean;
      /** 浏览器通道发不出去（对方不放行跨域预检）、App 原生通道才通：界面应把 nativeHost 登记进 settings.aiNativeHosts */
      transport?: 'native';
      nativeHost?: string;
      /** 测的时候顺手摸清的脾气（不收 temperature / 不认最省的思考档…）：一句一行，界面附在结果后面 */
      notes?: string[];
    }
  | { ok: false; error: string; transport?: 'native'; nativeHost?: string };

/** no-cors 探一下地址能不能连上（看不到状态码，只看连不连得上）：区分「跨域被拒」与「根本连不上」 */
async function probeReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const hostOf = (url: string): string => {
  try { return new URL(url).host; } catch { return url; }
};

/**
 * 用最小 payload 探测 API 连接是否可用（第 12 轮按境内中转站的画像重做）：
 * - 超时 15 s，防止界面卡死
 * - 地址少写了 /v1（中转站最常见的「配不上」）：404 / 响应不像 OpenAI 时自动再试一次带 /v1 的，通了就让界面替换
 * - 网络错误分两种说：能连上但没放行跨域（App 里用不了，换中转或让站长开 CORS）/ 根本连不上
 * - 错误提示先认中转站的措辞（无可用渠道 / 额度 / 令牌 / 模型不存在），认不出再按状态码
 */
/**
 * 密钥清洗（紧急修复 #2）：从网页 / 聊天软件复制、或用中文输入法手敲的密钥，常混进零宽空格（U+200B）、
 * 全角字母（ｓｋ－）、不换行空格、中文标点等。这些字符 fetch 根本发不出去——构造请求头时就抛 TypeError
 * （Chrome「Failed to read the 'headers' property」、WebKit 也是 TypeError），以前被当成网络 / 跨域失败，
 * 用户看到的是「没放行 CORS」，而同一把 key 在别的 App 里（原生 HTTP 栈会直接发字节或自行清理）却能用。
 * 规则：全角 ASCII（U+FF01–U+FF5E）折回半角；其余只保留可见 ASCII（0x21–0x7E）。
 */
export function cleanApiKey(raw: string | undefined | null): { key: string; removed: number } {
  const src = String(raw ?? '');
  let key = '';
  let removed = 0;
  for (const ch of src) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xff01 && code <= 0xff5e) { key += String.fromCharCode(code - 0xfee0); removed++; continue; }
    if (code >= 0x21 && code <= 0x7e) { key += ch; continue; }
    if (!/\s/.test(ch)) removed++;           // 首尾空白不算「脏」，trim 本来就会去掉；中间的空白也去掉但不计数
    else if (key.length > 0 && key.length < src.trim().length) removed++;
  }
  return { key, removed };
}

/** fetch 在构造请求头时就抛的 TypeError（密钥 / 地址里有非法字符），不是网络问题 */
export function isHeaderValueError(e: unknown): boolean {
  if (!(e instanceof TypeError)) return false;
  return /headers|header value|Invalid value|ISO-8859-1|not a valid HTTP|Invalid name/i.test(e.message);
}

export async function testAIConnection(opts: {
  provider: ApiProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** 已登记走 App 原生通道的主机（settings.aiNativeHosts） */
  nativeHosts?: string[];
  /** 浏览器通道发不出去时允许换原生通道再试（默认：原生壳里允许，网页里没有原生层） */
  allowNativeFallback?: boolean;
  /** 请求协议（自定义服务商可选 Anthropic）；不传 = 自定义按当前设置、其余 OpenAI 兼容 */
  protocol?: ApiProtocol;
}): Promise<TestResult> {
  if (!opts.apiKey?.trim()) {
    return { ok: false, error: '请先填写 API 密钥' };
  }
  const apiKey = cleanApiKey(opts.apiKey).key;

  const { baseUrl, model } = resolveProvider(opts.provider, opts.baseUrl, opts.model);
  const nativeSet = new Set((opts.nativeHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean));
  const allowNative = opts.allowNativeFallback ?? nativeTransportAvailable();
  const anthropic = (opts.protocol ?? (opts.provider === 'custom' ? customProtocol() : 'openai')) === 'anthropic';
  if (!baseUrl) return { ok: false, error: '自定义服务商要先填 API 地址' };
  if (!model) return { ok: false, error: '自定义服务商要先填模型名（点「选择模型」从列表里挑，或直接手填）' };
  // 推理模型（GPT-5/o 系列）拒绝 max_tokens，且 max_tokens:1 会被推理 token 吃光
  const reasoning = !anthropic && isReasoningModel(model);
  /**
   * 按真实请求的口径发（第 14 批）：非推理模型也带上 temperature——以前不带，新一代 Claude 这种不收 temperature 的模型
   * 「测试连接正常、真用起来全挂」（中转站实测）。撞到就记下、去掉再测，真实请求之后也自动不发。
   */
  const buildBody = () => {
    const q = quirksFor(baseUrl, model);
    const sendModel = q.sendAs ?? model;
    // 「xxx-thinking」按真实请求的额度测（第 16 批）：中转站只有额度够放下思考预算时才改写成 thinking.type=enabled，
    // max_tokens: 1 测不出来——中转站上的 claude-opus-5-5-thinking 就是「测试连接正常、真用起来全挂」
    const probeTokens = !q.sendAs && thinkingSuffixBase(model) ? 2048 : 1;
    if (anthropic) {
      return JSON.stringify({ model: sendModel, max_tokens: probeTokens, messages: [{ role: 'user', content: 'ping' }], ...(q.noTemperature ? {} : { temperature: 0.7 }) });
    }
    const effort = q.effort === null ? undefined : (q.effort ?? reasoningEffortFor(model));
    return JSON.stringify({
      model: sendModel,
      messages: [{ role: 'user', content: 'ping' }],
      ...(reasoning
        ? { max_completion_tokens: 16, ...(effort ? { reasoning_effort: effort } : {}) }
        : { max_tokens: probeTokens, ...(q.noTemperature ? {} : { temperature: 0.7 }) }),
      ...(q.nonStreamThinkingOff ? { enable_thinking: false } : {}),
      stream: false,
    });
  };
  const notes: string[] = [];

  type Attempt =
    | { ok: true; latencyMs: number; native: boolean }
    | { ok: false; error: string; retryWithV1: boolean; native: boolean; /** 服务器回了 HTTP 状态（不是发不出去） */ http?: boolean };
  const attempt = async (base: string, forceNative = false): Promise<Attempt> => {
    // 浏览器通道优先（能流式、也能自愈：登记过的主机哪天放行了跨域，测一次就改回去）；
    // 只有浏览器发不出去之后的补试才走原生通道（第 13 轮 · 千问套餐专属网关）
    const viaNative = forceNative;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const start = Date.now();
    try {
      const resp = await aiFetch(anthropic ? anthropicEndpoint(base, 'messages') : `${base}/chat/completions`, {
        method: 'POST',
        headers: anthropic ? anthropicHeaders(apiKey) : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: buildBody(),
        signal: controller.signal,
      }, viaNative);
      const latencyMs = Date.now() - start;
      const diag = { kind: 'test' as const, provider: opts.provider, host: hostOfUrl(base), model, native: viaNative, ms: latencyMs, status: resp.status };
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const detail = extractProviderErrorMessage(text).slice(0, 240).trim();
        const hint = moderationHint(detail) || relayHint(detail, isOfficialHost(base)) || getHttpStatusHint(resp.status, opts.provider);
        const prefix = hint ? `${hint} (HTTP ${resp.status})` : `HTTP ${resp.status}`;
        const error = detail ? `${prefix}: ${detail}` : `${prefix}: ${resp.statusText}`;
        recordAIDiag({ ...diag, ok: false, err: error });
        return { ok: false, error, retryWithV1: resp.status === 404, native: viaNative, http: true };
      }
      const data = await resp.json().catch(() => null);
      if (anthropic ? !(Array.isArray(data?.content) || data?.type === 'message') : !data?.choices?.[0]?.message) {
        recordAIDiag({ ...diag, ok: false, err: anthropic ? '响应格式不像 Anthropic Messages' : '响应格式非 OpenAI 兼容' });
        return anthropic
          ? { ok: false, error: '回来的不像 Anthropic Messages 的格式：检查地址，或把协议换回 OpenAI 兼容', retryWithV1: false, native: viaNative, http: true }
          : { ok: false, error: '响应格式非 OpenAI 兼容，请检查 Base URL', retryWithV1: true, native: viaNative, http: true };
      }
      recordAIDiag({ ...diag, ok: true });
      return { ok: true, latencyMs, native: viaNative };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        if (!viaNative && allowNative && nativeSet.has(hostOfUrl(base))) {
          // 登记过的原生主机：浏览器通道干等 15s 没动静（有的网关对预检不回包），也换原生通道补一次
          const viaApp = await attempt(base, true);
          if (viaApp.ok || viaApp.http) return viaApp;
        }
        return { ok: false, error: '连接超时（15s 无响应）', retryWithV1: false, native: viaNative };
      }
      if (isHeaderValueError(e)) {
        return { ok: false, retryWithV1: false, native: viaNative, error: '密钥或地址里有发不出去的字符（看不见的空格、全角字母、中文标点）——请删掉重新粘贴，或在密钥框里把它清理后再保存' };
      }
      if (e instanceof TypeError) {
        const host = hostOf(base);
        recordAIDiag({ kind: 'test', provider: opts.provider, host: hostOfUrl(base), model, native: viaNative, ms: Date.now() - start, status: 0, ok: false, err: e.message || 'TypeError' });
        if (viaNative) {
          // 原生通道也发不出去：多半是真没网 / 域名不对；交回去，让浏览器通道那次的诊断说话
          return { ok: false, retryWithV1: false, native: true, error: `连不上 ${host}${e.message ? `（${e.message.slice(0, 80)}）` : ''}` };
        }
        if (allowNative) {
          // 浏览器发不出去：多半是对方不放行跨域预检（千问套餐专属网关就是），也可能是半路被拦。App 里换原生通道
          // 再试一次：通了、或至少拿到了 HTTP 状态（密钥错是另一回事），就把这台主机登记为原生主机；
          // 原生也发不出去（真没网 / 域名不对）就按下面的网络诊断说
          const viaApp = await attempt(base, true);
          if (viaApp.ok || viaApp.http) return viaApp;
        }
        const reachable = await probeReachable(`${base}/models`);
        // 探测是不带预检的简单 GET，真请求带 Authorization 要预检。官方接口（DeepSeek 等）对 App 的
        // 预检是放行的（本机对 capacitor://localhost 实测），所以官方「探得到 + 真请求失败」几乎只有一种情况：
        // 这台设备的网络在半路拦了（校园网 / 公司网 / 运营商劫持页、VPN 或 DNS 过滤类 App）——
        // 简单 GET 拿到了那个页面，带预检的 POST 被它弄坏。别再对官方用户讲「中转 / 站长 / 跨域」（第 13 轮反馈）。
        const official = isOfficialHost(base);
        let error: string;
        const raw = e.message ? `（${e.message.slice(0, 60)}）` : '';
        if (isQwenPlanHost(host.toLowerCase())) {
          // 2026-10-06 实测：千问「套餐专属」网关（coding.dashscope / token-plan.*.maas）对浏览器的 OPTIONS 预检直接回 401、
          // 不带 CORS 头（百炼默认地址是放行的），不是密钥的问题，也不是中转站。App 里上面已经换原生通道试过了，
          // 走到这里说明是网页版（没有原生层）或原生也不通
          error = allowNative
            ? `连不上千问的套餐专属地址（${host}）：浏览器通道被它拒绝预检（回 401），App 原生通道也没通——检查网络后再试，或改用百炼默认地址 https://dashscope.aliyuncs.com/compatible-mode/v1`
            : `千问的套餐专属地址（${host}）不放行浏览器跨域：它对预检请求也要求鉴权（回 401），网页版无法直连它（App 里会自动改走原生通道）。网页版请改用百炼默认地址 https://dashscope.aliyuncs.com/compatible-mode/v1（套餐 Key 若不能用于该地址，就只能经中转站）`;
        } else if (official) {
          error = reachable
            ? `连不上 ${host}：它允许 App 直连，这次请求是在半路被拦下的——常见于校园网 / 公司网，或手机上开着 VPN、DNS 过滤类 App。换个网络（关掉 VPN、切到流量）再试一次${raw}`
            : `连不上 ${host}：当前没有网络，或这个网络到不了它——换个网络再试${raw}`;
        } else {
          error = reachable
            ? `能连上 ${host}，但这个中转站没有开放跨域访问（CORS），App 里无法直连它——换一个支持跨域的中转站，或请服务商开启 CORS`
            : `连不上 ${host}：检查域名 / 端口 / https 证书，或当前没有网络`;
        }
        return { ok: false, retryWithV1: false, native: viaNative, error };
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e), retryWithV1: false, native: viaNative };
    } finally {
      clearTimeout(timeout);
    }
  };

  /** 走了原生通道的结果打上标记：界面据此登记 / 注销 settings.aiNativeHosts */
  const viaTag = (a: Attempt, base: string) => (a.native ? { transport: 'native' as const, nativeHost: hostOfUrl(base) } : {});
  let first = await attempt(baseUrl);
  // 模型不收 temperature / 不认这一档 reasoning_effort / 「-thinking」被中转站改写成旧式思考参数…：记下、改掉再测
  // （真实请求同样会自动这么发）。一个模型可能连着撞好几样（opus-5-5-thinking：先撞思考参数、去掉后缀又撞 temperature），
  // 每样改一次，最多改 4 回
  for (let fix = 0; fix < 4 && !first.ok && first.http && /HTTP 400/.test(first.error); fix++) {
    const q = quirksFor(baseUrl, model);
    const effortFix = effortFixFromMessage(first.error);
    const thinkingBase = !q.sendAs && isLegacyThinkingMessage(first.error) ? thinkingSuffixBase(model) : null;
    if (!q.noTemperature && isUnsupportedTemperatureMessage(first.error)) {
      rememberQuirk(baseUrl, model, { noTemperature: true });
      notes.push('这个模型不收 temperature 参数，App 会自动不发');
    } else if (thinkingBase) {
      rememberQuirk(baseUrl, model, { sendAs: thinkingBase });
      notes.push(`中转站把「-thinking」版本转成了这一代 Claude 不认的旧式思考参数，App 会改用「${thinkingBase}」发送（建议直接选它）`);
    } else if (effortFix !== undefined && q.effort === undefined) {
      rememberQuirk(baseUrl, model, { effort: effortFix });
      notes.push(effortFix ? `这个模型不认最省的思考档，已改用「${effortFix}」` : '这个模型不认思考力度参数，App 会自动不发');
    } else if (!q.nonStreamThinkingOff && isEnableThinkingMessage(first.error)) {
      rememberQuirk(baseUrl, model, { nonStreamThinkingOff: true });
      notes.push('这个模型一次性调用要关掉思考，App 会自动带上 enable_thinking=false');
    } else {
      break;
    }
    first = await attempt(baseUrl, first.native);
  }
  if (first.ok) return { ok: true, latencyMs: first.latencyMs, model, baseUrlUsed: baseUrl, corrected: false, ...viaTag(first, baseUrl), ...(notes.length ? { notes } : {}) };
  // 少写 /v1：404、或回来的东西不像 OpenAI，且地址末尾没有版本段 → 补 /v1 再试一次
  if (first.retryWithV1 && !/\/v\d+[a-z]*$/i.test(baseUrl)) {
    const withV1 = `${baseUrl}/v1`;
    const second = await attempt(withV1, first.native);
    if (second.ok) return { ok: true, latencyMs: second.latencyMs, model, baseUrlUsed: withV1, corrected: true, ...viaTag(second, withV1), ...(notes.length ? { notes } : {}) };
  }
  return { ok: false, error: first.error, ...viaTag(first, baseUrl) };
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
  /** 已登记走 App 原生通道的主机（settings.aiNativeHosts）；没传则按 aiTransport 里同步过的清单 */
  nativeHosts?: string[];
  /** 请求协议；不传 = 自定义按当前设置、其余 OpenAI 兼容 */
  protocol?: ApiProtocol;
}): Promise<ModelListResult> {
  if (!opts.apiKey?.trim()) return { ok: false, error: '请先填写并保存 API 密钥' };
  const apiKey = cleanApiKey(opts.apiKey).key;

  const { baseUrl } = resolveProvider(opts.provider, opts.baseUrl);
  const nativeSet = new Set((opts.nativeHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean));
  const viaNative = nativeSet.has(hostOfUrl(baseUrl)) ? nativeTransportAvailable() : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const t0 = Date.now();
  try {
    const anthropic = (opts.protocol ?? (opts.provider === 'custom' ? customProtocol() : 'openai')) === 'anthropic';
    if (!baseUrl) { clearTimeout(timeout); return { ok: false, error: '自定义服务商要先填 API 地址' }; }
    const resp = await aiFetch(anthropic ? anthropicEndpoint(baseUrl, 'models') : `${baseUrl}/models`, {
      headers: anthropic ? anthropicHeaders(apiKey) : { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    }, viaNative);
    clearTimeout(timeout);
    recordAIDiag({ kind: 'models', provider: opts.provider, host: hostOfUrl(baseUrl), ok: resp.ok, status: resp.status, ms: Date.now() - t0, native: !!viaNative });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const detail = extractProviderErrorMessage(body).slice(0, 200).trim();
      const hint = resp.status === 404
        ? '该地址不支持 /models 列表接口，请手动填写模型名'
        : (relayHint(detail, isOfficialHost(baseUrl)) || getHttpStatusHint(resp.status, opts.provider));
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
    recordAIDiag({ kind: 'models', provider: opts.provider, host: hostOfUrl(baseUrl), ok: false, status: 0, ms: Date.now() - t0, native: !!viaNative, err: e instanceof Error ? (e.name === 'AbortError' ? '超时' : e.message) : String(e) });
    if (e instanceof Error && e.name === 'AbortError') return { ok: false, error: '拉取超时（15s 无响应）' };
    if (e instanceof TypeError) {
      // 同 testAIConnection：官方主机讲网络环境，中转站才讲跨域
      const host = hostOf(baseUrl);
      return {
        ok: false,
        error: isQwenPlanHost(host.toLowerCase())
          ? `连不上 ${host}：千问套餐专属地址不放行浏览器跨域（App 里先点「测试连接」让它改走原生通道）`
          : isOfficialHost(baseUrl)
            ? `连不上 ${host}：检查网络——校园网 / 公司网、VPN 或 DNS 过滤类 App 常会拦它，换个网络再试`
            : `连不上 ${host}，或它没放行跨域访问（CORS）`,
      };
    }
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
