import type { AttributeId, AttributeLevelTitles, AttributeNames, Settings } from '@/types';
import { resolveProvider } from '@/utils/aiProviders';

export const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

export const DEFAULT_ATTRIBUTE_LEVEL_TITLES: AttributeLevelTitles = {
  knowledge: ['蒙昧初开', '略有所知', '渐入学理', '博闻强识', '真知灼见', '洞察万象', '智识如海', '通晓万法', '星海智者', '全知之眼'],
  guts: ['畏首畏尾', '勉强应战', '临危不乱', '勇往直前', '无畏之心', '铁胆英魂', '逆境不折', '破局之勇', '王道胆魄', '无惧无畏'],
  dexterity: ['手忙脚乱', '稍具准头', '心手相应', '巧思灵动', '精准无误', '妙手天成', '神乎其技', '千变万化', '匠心巅峰', '天工之手'],
  kindness: ['冷眼旁观', '懂得体谅', '温言相待', '暖意渐深', '慈心如灯', '守护之心', '春风化雨', '万物可亲', '圣者慈悲', '普照群心'],
  charm: ['平平无奇', '略有好感', '引人注目', '风度初成', '光彩照人', '迷人气场', '众望所归', '万众倾心', '星辰魅影', '王者风华'],
};

const GENERIC_EXTRA_TITLES = ['无名新星', '锋芒初现', '高阶觉醒', '极境将至', '命运之冠'];

const LEVEL_TITLE_SYSTEM_PROMPT = [
  '你是一个沉浸式成长系统的称号设计器。',
  '任务：为用户自定义的五维人格属性生成每一级的四字中文等级称号。',
  '要求：',
  '1. 每个称号必须严格四个中文字符，不要标点、空格、数字、英文。',
  '2. 等级越高越强，从普通、笨拙、未觉醒，逐渐到稀有、传奇、近乎神话。',
  '3. 五个维度要贴合各自含义，避免同质化，不要每个属性都套同一组词。',
  '4. 保留 Persona 式的戏剧感，但不要直接引用受版权保护的原作称号。',
  '5. 只输出 JSON，不要 Markdown，不要解释。',
].join('\n');

export function normalizeAttributeLevelTitles(
  input: Partial<Record<AttributeId, string[]>> | undefined,
  maxLevel: number,
): AttributeLevelTitles {
  const levelCount = clampLevelCount(maxLevel);
  const normalized = {} as AttributeLevelTitles;
  for (const id of ATTRIBUTE_IDS) {
    normalized[id] = Array.from({ length: levelCount }, (_, index) => {
      const fallback = fallbackTitle(id, index);
      return normalizeTitle(input?.[id]?.[index], fallback);
    });
  }
  return normalized;
}

export function getAttributeLevelTitle(
  titles: Partial<Record<AttributeId, string[]>> | undefined,
  attributeId: AttributeId,
  level: number,
): string {
  const index = Math.max(0, Math.floor(level || 1) - 1);
  return normalizeTitle(titles?.[attributeId]?.[index], fallbackTitle(attributeId, index));
}

export function patchAttributeLevelTitle(
  titles: Partial<Record<AttributeId, string[]>> | undefined,
  attributeId: AttributeId,
  levelIndex: number,
  value: string,
  maxLevel: number,
): AttributeLevelTitles {
  const normalized = normalizeAttributeLevelTitles(titles, maxLevel);
  normalized[attributeId] = [...normalized[attributeId]];
  normalized[attributeId][levelIndex] = normalizeTitle(value, fallbackTitle(attributeId, levelIndex));
  return normalized;
}

export async function generateAttributeLevelTitles(
  settings: Settings,
  maxLevel: number,
  signal?: AbortSignal,
): Promise<AttributeLevelTitles> {
  const apiKey = settings.summaryApiKey?.trim();
  if (!apiKey) {
    throw new Error('请先在「AI 总结-API 配置」里填写 API Key，再刷新等级称号');
  }

  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );
  const levelCount = clampLevelCount(maxLevel);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: LEVEL_TITLE_SYSTEM_PROMPT },
        { role: 'user', content: buildLevelTitlePrompt(settings.attributeNames, levelCount) },
      ],
      temperature: 0.85,
      max_tokens: 900,
      stream: false,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI 刷新失败 (${response.status}): ${extractProviderError(body) || response.statusText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('AI 没有返回可用的等级称号');
  }

  const parsed = parseTitleJson(raw);
  if (!hasAnyTitle(parsed)) {
    throw new Error('AI 返回的等级称号格式不可用，请重试');
  }
  return normalizeAttributeLevelTitles(parsed, levelCount);
}

function buildLevelTitlePrompt(attributeNames: AttributeNames, levelCount: number): string {
  const names = ATTRIBUTE_IDS.map(id => `${id}: ${attributeNames[id] || id}`).join('\n');
  return [
    `需要生成的最高等级：Lv.${levelCount}`,
    '五维属性如下：',
    names,
    '',
    '请输出如下 JSON 结构：',
    '{"knowledge":["四字称号", "..."],"guts":[],"dexterity":[],"kindness":[],"charm":[]}',
    `每个数组必须正好 ${levelCount} 项。`,
  ].join('\n');
}

function parseTitleJson(raw: string): Partial<Record<AttributeId, string[]>> {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const root = ('titles' in parsed && (parsed as Record<string, unknown>).titles)
      || parsed;
    const result: Partial<Record<AttributeId, string[]>> = {};
    for (const id of ATTRIBUTE_IDS) {
      const value = (root as Record<string, unknown>)[id];
      if (Array.isArray(value)) {
        result[id] = value.filter((item): item is string => typeof item === 'string');
      }
    }
    return result;
  } catch {
    return {};
  }
}

function hasAnyTitle(value: Partial<Record<AttributeId, string[]>>): boolean {
  return ATTRIBUTE_IDS.some(id => (value[id] ?? []).some(item => normalizeTitle(item, '') !== ''));
}

function normalizeTitle(value: string | undefined, fallback: string): string {
  const cleaned = (value || '')
    .replace(/[\s:：,，.。;；"'“”‘’`~!！?？、|/\\()[\]{}<>《》【】]/g, '')
    .trim();
  const chars = Array.from(cleaned);
  if (chars.length >= 4) return chars.slice(0, 4).join('');
  if (chars.length > 0) return cleaned;
  return fallback;
}

function fallbackTitle(attributeId: AttributeId, index: number): string {
  return DEFAULT_ATTRIBUTE_LEVEL_TITLES[attributeId]?.[index]
    ?? GENERIC_EXTRA_TITLES[index - DEFAULT_ATTRIBUTE_LEVEL_TITLES[attributeId].length]
    ?? '终极之境';
}

function clampLevelCount(maxLevel: number): number {
  return Math.max(1, Math.min(10, Math.floor(maxLevel || 5)));
}

function extractProviderError(body: string): string {
  const text = body.trim();
  if (!text) return '';
  try {
    const data = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return data.error?.message || data.message || text.slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}
