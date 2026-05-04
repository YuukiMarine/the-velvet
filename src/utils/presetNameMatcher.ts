import type { AttributeId, AttributeNames, Settings } from '@/types';
import { ACHIEVEMENTS, SKILLS } from '@/constants';
import { resolveProvider } from '@/utils/aiProviders';

export interface PresetNameMatchResult {
  achievements: Record<string, string>;
  skills: Record<string, string>;
}

const SYSTEM_PROMPT = [
  '你是一个沉浸式成长系统的命名设计器。',
  '任务：根据用户自定义的五维属性名称，重命名系统内置的属性等级成就和技能。',
  '要求：',
  '1. 名称要短，推荐 2-6 个中文字符，最多 8 个中文字符。',
  '2. 属性名称只作为语义参考，不要把用户的属性名直接拼进名称里。',
  '3. 避免模板化后缀和直白段位词，尤其不要使用「学徒」「大师」「达人」「之王」「初级」「高级」。',
  '4. 成就名要像一个事件、印记、章节或传闻；技能名要像一种被动能力、手法或气质。',
  '5. 名称要贴合属性含义、等级要求和原始功能，但尽量用隐喻表达，减少“AI命名感”。',
  '6. 不要改动 id，不要输出解释，不要 Markdown。',
  '7. 只输出 JSON：{"achievements":{"id":"名称"},"skills":{"id":"名称"}}。',
].join('\n');

const DEFAULT_ATTR_NAMES: AttributeNames = {
  knowledge: '知识',
  guts: '胆量',
  dexterity: '灵巧',
  kindness: '温柔',
  charm: '魅力',
};

export async function generatePresetNameMatches(
  settings: Settings,
  signal?: AbortSignal,
): Promise<PresetNameMatchResult> {
  const apiKey = settings.summaryApiKey?.trim();
  if (!apiKey) {
    throw new Error('请先在「AI 总结-API 配置」里填写 API Key，再匹配成就/技能名称');
  }

  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(settings.attributeNames) },
      ],
      temperature: 0.82,
      max_tokens: 1200,
      stream: false,
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI 匹配失败 (${response.status}): ${extractProviderError(body) || response.statusText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('AI 没有返回可用的成就/技能名称');
  }

  return normalizeResult(parseJson(raw));
}

function buildPrompt(attributeNames: AttributeNames): string {
  const attrLines = (Object.keys(DEFAULT_ATTR_NAMES) as AttributeId[])
    .map(id => `${id}: ${attributeNames[id] || DEFAULT_ATTR_NAMES[id]}`)
    .join('\n');

  const achievements = ACHIEVEMENTS
    .filter(a => a.condition.type === 'attribute_level' && a.condition.attribute)
    .map(a => ({
      id: a.id,
      originalTitle: a.title,
      attribute: a.condition.attribute,
      attributeHint: attributeNames[a.condition.attribute as AttributeId] || DEFAULT_ATTR_NAMES[a.condition.attribute as AttributeId],
      level: a.condition.value,
      description: a.description,
    }));

  const skills = SKILLS.map(s => ({
    id: s.id,
    originalName: s.name,
    attribute: s.requiredAttribute,
    attributeHint: attributeNames[s.requiredAttribute] || DEFAULT_ATTR_NAMES[s.requiredAttribute],
    requiredLevel: s.requiredLevel,
    description: s.description,
  }));

  return [
    '当前五维属性名：',
    attrLines,
    '',
    '需要重命名的属性等级成就：',
    JSON.stringify(achievements, null, 2),
    '',
    '需要重命名的技能：',
    JSON.stringify(skills, null, 2),
  ].join('\n');
}

function parseJson(raw: string): Partial<PresetNameMatchResult> {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const parsed = JSON.parse(text) as Partial<PresetNameMatchResult>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeResult(input: Partial<PresetNameMatchResult>): PresetNameMatchResult {
  const achievementIds = new Set(
    ACHIEVEMENTS
      .filter(a => a.condition.type === 'attribute_level')
      .map(a => a.id),
  );
  const skillIds = new Set(SKILLS.map(s => s.id));
  const achievements: Record<string, string> = {};
  const skills: Record<string, string> = {};

  for (const [id, name] of Object.entries(input.achievements ?? {})) {
    const normalized = normalizeName(name);
    if (achievementIds.has(id) && normalized) achievements[id] = normalized;
  }
  for (const [id, name] of Object.entries(input.skills ?? {})) {
    const normalized = normalizeName(name);
    if (skillIds.has(id) && normalized) skills[id] = normalized;
  }

  if (Object.keys(achievements).length === 0 && Object.keys(skills).length === 0) {
    throw new Error('AI 返回的名称格式不可用，请重试');
  }
  return { achievements, skills };
}

function normalizeName(value: string | undefined): string {
  const cleaned = (value || '')
    .replace(/[\s:：,，.。;；"'“”‘’`~!！?？、|/\\()[\]{}<>《》【】]/g, '')
    .trim();
  return Array.from(cleaned).slice(0, 8).join('');
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
