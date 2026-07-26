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
import { AI_PROVIDERS, fetchAvailableModels, getProviderConfig, type ApiProvider } from '@/utils/aiProviders';

// ── 对话模型过滤 ─────────────────────────────────────────────────────────────
// 关键词黑名单：命中即视为非对话用途（embedding/重排/语音/图像/视频/审核等）。
// 注意 VL（视觉对话）模型**不在**黑名单——它们仍走 /chat/completions 能聊文本。
const NON_CHAT_KEYWORDS = [
  'embedding', 'embed-', '-embed', 'rerank', 'similarity',
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
  const active = settings.summaryApiProvider ?? 'openai';
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
    r: await fetchAvailableModels({ provider: t.id, apiKey: t.key, baseUrl: t.baseUrl }),
  })));
  const profiles = { ...(settings.aiProfiles ?? {}) };
  const okParts: string[] = [];
  const skipped: string[] = [];
  for (const { id, r } of results) {
    if (r.ok) {
      profiles[id] = { ...(profiles[id] ?? {}), models: r.models };
      okParts.push(`${getProviderConfig(id).label} ${r.models.length} 个`);
    } else {
      skipped.push(`${getProviderConfig(id).label}（${r.error.slice(0, 60)}）`);
    }
  }
  return { profiles, okParts, skipped };
}
