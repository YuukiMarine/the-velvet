/**
 * aiModelCatalog —— 模型目录整理工具（ModelPickerSheet 的数据层）。
 *
 * 背景：千问（阿里云百炼）这类**聚合平台**的 /models 会回两百多个条目，里面还托管着
 * DeepSeek/Llama/GLM 等外族开源模型；而 DeepSeek 官方端点只回 2 个。要让用户分得清
 * "官方的 deepseek-v4" 和 "千问平台托管的 deepseek-r1"，光按平台分组不够，需要两个维度：
 *   · 平台（section）＝ 模型跑在哪家、用哪把 Key 计费；
 *   · 血统（badge）＝ 模型出身哪个系列——托管的外族模型打徽标，同族不打。
 * 另外聚合平台的大列表里大半是 embedding/语音/图像等非对话模型，默认过滤掉。
 */
import type { Settings } from '@/types';
import { AI_PROVIDERS, fetchAvailableModels, getProviderConfig, effectiveModelName, type ApiProvider, type ModelCaps, DEFAULT_PROVIDER } from '@/utils/aiProviders';

// ── 对话模型过滤 ─────────────────────────────────────────────────────────────
// 关键词黑名单：命中即视为非对话用途（embedding/重排/语音/图像/视频/审核等）。
// 注意 VL（视觉对话）模型**不在**黑名单——它们仍走 /chat/completions 能聊文本。
const NON_CHAT_KEYWORDS = [
  'embedding', 'embed-', '-embed', 'rerank', 'similarity',
  // 中转站列表里常见的向量模型（BAAI bge 系 / moka m3e）：第 14 批实测中转站列表里混在对话模型中
  'bge-', 'm3e-',
  'tts', 'asr', 'audio', 'speech', 'whisper', 'transcri', 'realtime', 'voice',
  'paraformer', 'sambert', 'cosyvoice', 'music',
  'image', 'img-', '-img', 'wanx', 'dall', 'sora', 'flux', 'stable-diffusion', 'sd-turbo', 'sdxl',
  'video', 'animate', 'avatar',
  'moderation', 'ocr', 'background-generation', 'colorization', 'sketch',
];

export function isChatModel(id: string): boolean {
  const s = id.toLowerCase();
  return !NON_CHAT_KEYWORDS.some((k) => s.includes(k));
}

// ── 视觉 / 听觉能力过滤（FS3 两个新档的选择面板用）─────────────────────────────
// v2.7.0.6：能看图优先看 /models 给的能力字段（DeepSeek 的 input_modalities 等，
// 存在 aiProfiles[家].modelCaps）；接口没说的才按命名猜——现在的原生多模态模型名字里
// 基本不带 vision 了（deepseek-flash、gpt-6-luna、kimi-k3…），名单只是兜底。
// 宁可**多列几个**也不漏：猜错的代价是调用报错（可读的 400/404），漏掉的代价是选不到。
// 两个列表都保留「关掉筛选」的开关，手填输入框也一直在。
const VISION_HINTS = [
  '-vl', 'vl-', 'vision', 'omni', '4o', 'gpt-5', 'gpt-6', 'gpt-4.1', 'gpt-4-turbo',
  'gemini', 'gemma-3', 'claude', 'glm-4v', 'glm-4.', 'internvl', 'llava', 'pixtral', 'llama-4',
  'kimi-k', 'moonshot-v1-vision', 'step-1v', 'step-3', 'yi-vision', 'minimax-m', 'abab7',
  'qwen3.5', 'qwen3.6', 'grok-4', 'doubao-seed',
  // DeepSeek：V4.1-Flash（deepseek-flash）起原生多模态；janus 是早年的多模态系列名，
  // deepseek-ocr 虽带 ocr 字样但走 /chat/completions、能看图能对话
  'deepseek-flash', 'janus', 'deepseek-ocr',
];

/**
 * 像不像"能看图"的模型。caps 是 /models 给的能力（有就以它为准），没有才按命名猜（宁滥勿缺）。
 */
export function isVisionModel(id: string, caps?: ModelCaps): boolean {
  if (caps?.image !== undefined) return caps.image;
  const s = id.toLowerCase();
  // 明确的非对话件（embedding/tts…）先排除，再看视觉线索
  // （janus / deepseek-ocr 会撞 NON_CHAT_KEYWORDS 的 'ocr'，需显式豁免）
  if (!isChatModel(s) && !s.includes('vl') && !s.includes('vision') && !s.includes('janus') && !s.includes('deepseek-ocr')) return false;
  return VISION_HINTS.some((k) => s.includes(k));
}

const AUDIO_HINTS = [
  'whisper', 'transcri', 'asr', 'audio', 'speech', 'voice',
  'sensevoice', 'paraformer', 'qwen-audio', 'qwen3-asr', 'gummy', 'fun-asr',
];

/** 像不像"能听写"的模型（走 /audio/transcriptions 的那类） */
export function isAudioModel(id: string): boolean {
  const s = id.toLowerCase();
  // tts / 语音合成不是听写：合成类命名里带 tts / cosyvoice / sambert
  if (/tts|cosyvoice|sambert|speech-0?1|synthes/i.test(s)) return false;
  return AUDIO_HINTS.some((k) => s.includes(k));
}

// ── 模型血统 ─────────────────────────────────────────────────────────────────

export interface ModelFamily { id: string; label: string; }

const FAMILIES: Array<ModelFamily & { test: RegExp }> = [
  { id: 'qwen',     label: 'Qwen 系',     test: /^(qwen|qwq|qvq|tongyi)/i },
  { id: 'deepseek', label: 'DeepSeek 系', test: /^deepseek/i },
  { id: 'kimi',     label: 'Kimi 系',     test: /^(kimi|moonshot)/i },
  { id: 'openai',   label: 'GPT 系',      test: /^(gpt|o[1-9]|chatgpt|davinci)/i },
  { id: 'gemini',   label: 'Gemini 系',   test: /^(gemini|gemma)/i },
  { id: 'minimax',  label: 'MiniMax 系',  test: /^(minimax|abab)/i },
  { id: 'llama',    label: 'Llama 系',    test: /^(llama|meta-llama|codellama)/i },
  { id: 'glm',      label: 'GLM 系',      test: /^(glm|chatglm|zhipu)/i },
  { id: 'mistral',  label: 'Mistral 系',  test: /^(mistral|mixtral|ministral|codestral)/i },
  { id: 'claude',   label: 'Claude 系',   test: /^claude/i },
  { id: 'grok',     label: 'Grok 系',     test: /^grok/i },
  { id: 'yi',       label: 'Yi 系',       test: /^yi-/i },
  { id: 'baichuan', label: '百川系',      test: /^baichuan/i },
  { id: 'ernie',    label: '文心系',      test: /^ernie/i },
  { id: 'hunyuan',  label: '混元系',      test: /^hunyuan/i },
  { id: 'internlm', label: '书生系',      test: /^internlm/i },
];

export function modelFamily(id: string): ModelFamily | null {
  const f = FAMILIES.find((x) => x.test.test(id.trim()));
  return f ? { id: f.id, label: f.label } : null;
}

/** 平台品牌自己的血统（同族模型不打徽标） */
const PROVIDER_HOME_FAMILY: Record<ApiProvider, string> = {
  openai: 'openai', deepseek: 'deepseek', kimi: 'kimi', qwen: 'qwen', gemini: 'gemini', minimax: 'minimax',
  // 自定义：不知道是谁家，列表里每个模型都按血统打徽标
  custom: '',
};

/** 托管的外族模型 → 徽标文案（如千问平台里的 deepseek-r1 → 「DeepSeek 系」）；同族 → null */
export function familyBadge(provider: ApiProvider, modelId: string): string | null {
  const fam = modelFamily(modelId);
  if (!fam) return null;
  return fam.id === PROVIDER_HOME_FAMILY[provider] ? null : fam.label;
}

/** 平台列表里出现 ≥2 个血统 → 视为聚合平台（分区头打「聚合平台」标） */
export function isAggregatorList(models: string[]): boolean {
  const seen = new Set<string>();
  for (const m of models) {
    const f = modelFamily(m);
    if (f) seen.add(f.id);
    if (seen.size >= 2) return true;
  }
  return false;
}

// ── 全家模型列表刷新（Settings / ModelPickerSheet 共用同一口径）──────────────

export interface RefreshModelsOutcome {
  /** 合并后的新 aiProfiles（调用方负责 updateSettings） */
  profiles: NonNullable<Settings['aiProfiles']>;
  okParts: string[];
  skipped: string[];
  /** 正在用、但已不在该家最新列表里的模型（可能下线了）——提示用户换 */
  stale: string[];
}

/**
 * 某家当前「在用」的模型（发请求时实际用的名字，退役名已换成继任者）。
 * 当前连接那家看 summaryModel，别家看它存档里的 model；都没填 = 预设默认。
 */
export function liveModelOf(settings: Settings, pv: ApiProvider): string {
  const active = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
  const raw = pv === active ? settings.summaryModel?.trim() : settings.aiProfiles?.[pv]?.model?.trim();
  return effectiveModelName(raw || getProviderConfig(pv).defaultModel);
}

/** 这家在用的模型是否已不在它最新拉到的列表里（列表为空 = 没拉过，不算） */
export function isModelStale(settings: Settings, pv: ApiProvider, model = liveModelOf(settings, pv)): boolean {
  const list = settings.aiProfiles?.[pv]?.models ?? [];
  return list.length > 0 && !list.includes(effectiveModelName(model));
}

/**
 * 视觉档自动填写（用户口径：模型表刷新完，识别到能看图的模型就直接填上）。
 * 只在视觉档**当前为空**时生效；候选顺序：当前连接家优先，其余按 AI_PROVIDERS 序。
 * 返回 null = 视觉档已有值 / 没识别到任何视觉模型。调用方把 patch 并进同一次
 * updateSettings，并用 label 在刷新结果里告知用户（可去视觉档更换/停用）。
 */
export function autoFillVisionPatch(
  settings: Settings,
  profiles: NonNullable<Settings['aiProfiles']>,
): { patch: Pick<Settings, 'visionModel' | 'visionProvider'>; label: string } | null {
  if (settings.visionModel?.trim()) return null;
  const active = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
  const order: ApiProvider[] = [active, ...AI_PROVIDERS.map((p) => p.id).filter((id) => id !== active)];
  for (const pv of order) {
    const caps = profiles[pv]?.modelCaps ?? {};
    // 接口明说能看图的排前面，按名字猜的其次
    const models = profiles[pv]?.models ?? [];
    const hit = models.find(m => caps[m]?.image === true) ?? models.find(m => isVisionModel(m, caps[m]));
    if (hit) {
      return {
        patch: { visionModel: hit, visionProvider: pv === active ? undefined : pv },
        label: `${getProviderConfig(pv).label} · ${hit}`,
      };
    }
  }
  return null;
}

/**
 * 刷新所有已配 Key 的服务商的 /models，按家写进 profiles[].models。
 * activeKeyOverride：设置页里 Key 草稿还没保存时传入，让当前家用草稿测。
 * 返回 null = 没有任何服务商配好 Key。
 */
export async function refreshAllProviderModels(
  settings: Settings,
  activeKeyOverride?: string,
): Promise<RefreshModelsOutcome | null> {
  const active = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
  const targets = AI_PROVIDERS
    .map((p) => ({
      id: p.id,
      key: p.id === active
        ? (activeKeyOverride?.trim() || settings.summaryApiKey || '')
        : (settings.aiProfiles?.[p.id]?.key ?? ''),
      baseUrl: p.id === active ? settings.summaryApiBaseUrl : settings.aiProfiles?.[p.id]?.baseUrl,
    }))
    .filter((t) => t.key.trim());
  if (!targets.length) return null;

  const results = await Promise.all(targets.map(async (t) => ({
    id: t.id,
    r: await fetchAvailableModels({
      provider: t.id, apiKey: t.key, baseUrl: t.baseUrl, nativeHosts: settings.aiNativeHosts,
      // 自定义服务商按它自己的协议拉（第 14 批）
      ...(t.id === 'custom' ? { protocol: settings.customProviderProtocol === 'anthropic' ? 'anthropic' as const : 'openai' as const } : {}),
    }),
  })));
  const profiles = { ...(settings.aiProfiles ?? {}) };
  const okParts: string[] = [];
  const skipped: string[] = [];
  for (const { id, r } of results) {
    if (r.ok) {
      profiles[id] = { ...(profiles[id] ?? {}), models: r.models, modelCaps: r.caps };
      okParts.push(`${getProviderConfig(id).label} ${r.models.length} 个`);
    } else {
      skipped.push(`${getProviderConfig(id).label}（${r.error.slice(0, 60)}）`);
    }
  }
  // 各档在用的模型对照新列表：不在了就提示（快速响应 / 深思熟虑 / 视觉）
  const after: Settings = { ...settings, aiProfiles: profiles };
  const stale: string[] = [];
  const check = (label: string, pv: ApiProvider, model: string | undefined) => {
    if (!model?.trim() || !results.some(x => x.id === pv && x.r.ok)) return;
    if (isModelStale(after, pv, model)) stale.push(`${label}：${getProviderConfig(pv).label} · ${effectiveModelName(model)}`);
  };
  check('快速响应', active, liveModelOf(after, active));
  check('深思熟虑', settings.navigatorProvider ?? active, settings.navigatorModel);
  check('视觉', settings.visionProvider ?? active, settings.visionModel);
  return { profiles, okParts, skipped, stale };
}
