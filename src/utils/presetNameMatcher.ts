import type { AttributeId, AttributeNames, Settings } from '@/types';
import { ACHIEVEMENTS, DEFAULT_ATTRIBUTE_NAMES, SKILLS } from '@/constants';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { tryExtractJSON } from '@/utils/aiJson';

export interface PresetNameMatchResult {
  achievements: Record<string, string>;
  skills: Record<string, string>;
}

/**
 * 提示词里只留「现在的属性名」（第 34 批）。以前每条都带原名（知识学者 / 速读）、默认说明（知识达到3级）和
 * 有词义的英文 id（knowledge / empathy / charisma），新名字只在 attributeHint 一处：五维改成健身 / 睡眠之后，
 * DeepSeek 起的名字约三成还带着旧属性的意象（健身「翻页如风」、睡眠「梦匠之手」）。
 * 现在说明换成新名字、不带原名、条目用中性编号（A1 / S1，回来再映射成 id），改过名的在提示里点明旧名作废。
 */
const SYSTEM_PROMPT = [
  '你是一个沉浸式成长系统的命名设计器。',
  '任务：按用户现在的五维属性名，给每个属性的等级成就和技能起名。',
  '要求：',
  '1. 名称要短，推荐 2-6 个中文字符，最多 8 个中文字符。',
  '2. 含义只看每条写的属性名（用户现在的名字）；属性名本身不要直接拼进名称里。',
  '3. 避免模板化后缀和直白段位词，尤其不要使用「学徒」「大师」「达人」「之王」「初级」「高级」。',
  '4. 成就名要像一个事件、印记、章节或传闻；技能名要像一种被动能力、手法或气质。',
  '5. 名称要贴合属性含义、等级要求和效果，尽量用隐喻表达，减少“AI命名感”。',
  '6. 不要输出解释，不要 Markdown。',
  '7. 只输出 JSON：{"achievements":{"编号":"名称"},"skills":{"编号":"名称"}}，编号照抄每条的 key。',
].join('\n');

const ATTR_IDS = Object.keys(DEFAULT_ATTRIBUTE_NAMES) as AttributeId[];
const ATTR_ACHIEVEMENTS = ACHIEVEMENTS.filter(a => a.condition.type === 'attribute_level' && a.condition.attribute);
/** 中性编号 → 真 id：A1… 是成就、S1… 是技能 */
const ACH_KEYS = new Map(ATTR_ACHIEVEMENTS.map((a, i) => [`A${i + 1}`, a.id]));
const SKILL_KEYS = new Map(SKILLS.map((s, i) => [`S${i + 1}`, s.id]));

const nameOf = (names: AttributeNames, id: AttributeId) => (names[id] ?? '').trim() || DEFAULT_ATTRIBUTE_NAMES[id];
/** 说明里的默认属性名换成现在的名字（「知识达到3级」→「健身达到3级」） */
const withName = (text: string, id: AttributeId, names: AttributeNames) => text.replace(DEFAULT_ATTRIBUTE_NAMES[id], () => nameOf(names, id));

export async function generatePresetNameMatches(
  settings: Settings,
  signal?: AbortSignal,
): Promise<PresetNameMatchResult> {
  const cfg = getAIConfig(settings);
  if (!cfg) {
    throw new Error('请先在「设置 → AI 服务」里填写 API Key，再匹配成就/技能名称');
  }

  const raw = await chatComplete(cfg, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildPrompt(settings.attributeNames) },
  ], { temperature: 0.82, maxTokens: 1200, signal, instant: true }); // 瞬发：设置页里点一下就等着

  return normalizeResult(parseJson(raw));
}

function buildPrompt(attributeNames: AttributeNames): string {
  const renamed = ATTR_IDS.filter(id => nameOf(attributeNames, id) !== DEFAULT_ATTRIBUTE_NAMES[id]);

  const achievements = ATTR_ACHIEVEMENTS.map((a, i) => {
    const attr = a.condition.attribute as AttributeId;
    return {
      key: `A${i + 1}`,
      attribute: nameOf(attributeNames, attr),
      level: a.condition.value,
      description: withName(a.description, attr, attributeNames),
    };
  });

  const skills = SKILLS.map((s, i) => ({
    key: `S${i + 1}`,
    attribute: nameOf(attributeNames, s.requiredAttribute),
    requiredLevel: s.requiredLevel,
    description: withName(s.description, s.requiredAttribute, attributeNames),
  }));

  return [
    `用户现在的五维属性名：${ATTR_IDS.map(id => nameOf(attributeNames, id)).join('、')}`,
    ...(renamed.length > 0
      ? [`其中改过名的：${renamed.map(id => `「${DEFAULT_ATTRIBUTE_NAMES[id]}」改叫「${nameOf(attributeNames, id)}」`).join('，')}。旧名已经作废，起名不要沿用旧名的意象。`]
      : []),
    '',
    '需要起名的属性等级成就：',
    JSON.stringify(achievements),
    '',
    '需要起名的技能：',
    JSON.stringify(skills),
  ].join('\n');
}

function parseJson(raw: string): Partial<PresetNameMatchResult> {
  return (tryExtractJSON(raw) as Partial<PresetNameMatchResult> | null) ?? {};
}

function normalizeResult(input: Partial<PresetNameMatchResult>): PresetNameMatchResult {
  const achievements: Record<string, string> = {};
  const skills: Record<string, string> = {};

  for (const [key, name] of Object.entries(input.achievements ?? {})) {
    const id = ACH_KEYS.get(key.trim().toUpperCase());
    const normalized = normalizeName(name);
    if (id && normalized) achievements[id] = normalized;
  }
  for (const [key, name] of Object.entries(input.skills ?? {})) {
    const id = SKILL_KEYS.get(key.trim().toUpperCase());
    const normalized = normalizeName(name);
    if (id && normalized) skills[id] = normalized;
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
