import { AttributeId, PersonaSkill, Settings } from '@/types';

interface AIMessage { role: 'system' | 'user' | 'assistant'; content: string; }

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

function getAIConfig(settings: Settings): { apiKey: string; baseUrl: string; model: string } | null {
  if (!settings.summaryApiKey) return null;
  const provider = settings.summaryApiProvider || 'openai';
  const baseUrl = settings.summaryApiBaseUrl || (
    provider === 'deepseek' ? 'https://api.deepseek.com' :
    provider === 'kimi' ? 'https://api.moonshot.cn' :
    'https://api.openai.com'
  );
  const model = settings.summaryModel || (
    provider === 'deepseek' ? 'deepseek-chat' :
    provider === 'kimi' ? 'moonshot-v1-8k' :
    'gpt-4o-mini'
  );
  return { apiKey: settings.summaryApiKey, baseUrl, model };
}

async function callAI(
  cfg: { apiKey: string; baseUrl: string; model: string },
  messages: AIMessage[],
  temperature = 0.8,
): Promise<string> {
  const resp = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model, messages, max_tokens: 1500, temperature }),
  });
  if (!resp.ok) throw new Error(`AI error: ${resp.status}`);
  const data = await resp.json();
  return data.choices[0].message.content as string;
}

// ── Robust JSON extraction ──────────────────────────────────────────────────

/** Extract a JSON object from AI response text, tolerating code blocks, trailing commas, comments */
function extractJSON(text: string): Record<string, unknown> {
  // Strip markdown code blocks
  let cleaned = text.replace(/```(?:json|JSON)?\s*/g, '').replace(/```\s*/g, '');
  // Find the outermost JSON object
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no json found');
  let jsonStr = match[0];
  // Remove single-line comments (// ...)
  jsonStr = jsonStr.replace(/\/\/[^\n]*/g, '');
  // Remove trailing commas before } or ]
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Last resort: try to fix common issues like unescaped newlines in strings
    jsonStr = jsonStr.replace(/[\r\n]+/g, ' ');
    return JSON.parse(jsonStr);
  }
}

/** Call AI with one automatic retry on failure (lower temperature on retry for more stable output) */
async function callAIWithRetry(
  cfg: { apiKey: string; baseUrl: string; model: string },
  messages: AIMessage[],
  temperature = 0.8,
): Promise<string> {
  try {
    return await callAI(cfg, messages, temperature);
  } catch (e) {
    // Retry once with lower temperature
    try {
      return await callAI(cfg, messages, Math.max(0.3, temperature - 0.3));
    } catch {
      throw e; // Throw the original error
    }
  }
}

// ── Persona skill validation ────────────────────────────────────────────────

const VALID_SKILL_TYPES = new Set(['damage', 'crit', 'buff', 'debuff', 'charge', 'heal', 'attack_boost']);
const EXPECTED_POWERS = [10, 15, 22, 30, 40];
const EXPECTED_COSTS = [8, 12, 18, 25, 35];

/** Validate and repair a single PersonaSkill, filling missing fields with defaults */
function repairSkill(raw: Record<string, unknown>, level: number, attrName: string, personaName: string): PersonaSkill {
  const defaultTypes: PersonaSkill['type'][] = ['damage', 'crit', 'buff', 'debuff', 'attack_boost'];
  return {
    level,
    name: (typeof raw.name === 'string' && raw.name) ? raw.name : `${attrName}之力 Lv${level}`,
    description: (typeof raw.description === 'string' && raw.description) ? raw.description : `${personaName}释放${attrName}的力量`,
    type: (typeof raw.type === 'string' && VALID_SKILL_TYPES.has(raw.type)) ? raw.type as PersonaSkill['type'] : defaultTypes[level - 1],
    power: (typeof raw.power === 'number' && raw.power > 0) ? raw.power : EXPECTED_POWERS[level - 1],
    spCost: (typeof raw.spCost === 'number' && raw.spCost > 0) ? raw.spCost : EXPECTED_COSTS[level - 1],
  };
}

/** Validate and repair an array of 5 skills for one attribute */
function repairSkills(rawSkills: unknown, attrName: string, personaName: string): PersonaSkill[] {
  const arr = Array.isArray(rawSkills) ? rawSkills : [];
  return Array.from({ length: 5 }, (_, i) => {
    const raw = (arr[i] && typeof arr[i] === 'object') ? arr[i] as Record<string, unknown> : {};
    return repairSkill(raw, i + 1, attrName, personaName);
  });
}

// ── Anti-repetition: diversity hints ────────────────────────────────────────

const CULTURE_POOLS = [
  '优先从东亚文化（中国/日本/韩国）中选取人物',
  '优先从北欧神话或凯尔特传说中选取人物',
  '优先从印度/波斯/阿拉伯文化圈中选取人物',
  '优先从美洲原住民/非洲神话中选取人物',
  '优先从古典希腊罗马文明中选取人物',
  '优先从近现代（19-20世纪）历史人物中选取',
  '优先从文艺复兴或启蒙时代的人物中选取',
  '优先从古代两河流域/埃及文明中选取人物',
];

function getDiversityHint(): string {
  return CULTURE_POOLS[Math.floor(Math.random() * CULTURE_POOLS.length)];
}

// ── Persona generation ──────────────────────────────────────────────────────

export async function generatePersonaSkills(
  settings: Settings,
  fallbackName: string,
  attributeNames: Record<AttributeId, string>,
  dialogHistory: string[]
): Promise<{
  personaName: string;
  skills: Record<AttributeId, PersonaSkill[]>;
  attributePersonas: Record<AttributeId, { name: string; description: string }>;
  usedFallback: boolean;
}> {
  const cfg = getAIConfig(settings);
  if (!cfg) return {
    personaName: fallbackName,
    skills: generateDefaultSkills(fallbackName, attributeNames),
    attributePersonas: generateDefaultAttributePersonas(fallbackName, attributeNames),
    usedFallback: true,
  };

  const context = dialogHistory.join('\n\n');
  const diversityHint = getDiversityHint();
  const prompt = `你是Persona系列游戏的人格解析师。请仔细阅读反抗者（用户）的五轮问答，深度解析其价值观、性格底色、行为倾向，然后从人类历史与文化中找出最精准契合的五个Persona。

【反抗者问答记录】
${context}

【属性与名称对应】
${ATTRS.map(a => `${a} → ${attributeNames[a]}`).join('\n')}

【Persona选择原则】
每个属性的Persona必须是真实存在或有据可查的一位人物：
- 历史人物（科学家/哲学家/将领/艺术家等）
- 神话体系中的神明或英雄（任意文化皆可）
- 经典文学、史诗、戏剧中的标志性角色
- 宗教传说中的著名人物
禁止：名字后的任何后缀如"之灵""之影""化身"，禁止输出"某类人"或"某个流派的学者们"之类的复数人。

【关键要求】
1. 五个人物必须真正基于用户的具体回答来选择——不同的答案应当产生截然不同的人物组合
2. 从用户的文字中提炼出他/她独特的气质关键词，再据此匹配最贴切的人物
3. 五个人物尽量跨越不同时代、地域、文化，避免过度集中于同一文明
4. 人物选择要有新意，避免反复使用过于大众化的通识性例子
5. 本次生成的文化偏好提示：${diversityHint}

技能规格：level 1-5，power=10/15/22/30/40，spCost=8/12/18/25/35
技能类型说明（7种）：
- damage：直接伤害
- crit：暴击型（有20%概率双倍伤害+令Shadow失衡）
- buff：增益（提升下次攻击伤害×1.5）
- debuff：减益（令Shadow陷入易伤状态，下次受到额外30%伤害）
- charge：蓄力（下回合技能伤害翻倍）
- heal：治愈（回复玩家5点HP）
- attack_boost：攻击增益（造成15点伤害，并令接下来3回合所有伤害+15，不可叠加）
五技能分布（level顺序）：damage / crit / buff或heal / debuff / attack_boost或charge
技能名称和描述须体现该历史人物的标志性事迹或特质

必须使用纯JSON输出，不要包裹在代码块中，不含任何注释与额外文字：
{
  "knowledge":{"name":"真实人物名","description":"一句话说明该人物与反抗者${attributeNames['knowledge']}特质的契合点","skills":[{"level":1,"name":"技能名","description":"技能描述","type":"damage","power":10,"spCost":8},{"level":2,"name":"技能名","description":"技能描述","type":"crit","power":15,"spCost":12},{"level":3,"name":"技能名","description":"技能描述","type":"buff","power":22,"spCost":18},{"level":4,"name":"技能名","description":"技能描述","type":"debuff","power":30,"spCost":25},{"level":5,"name":"技能名","description":"技能描述","type":"attack_boost","power":40,"spCost":35}]},
  "guts":{"name":"真实人物名","description":"一句话说明契合${attributeNames['guts']}的原因","skills":[...同上格式共5个]},
  "dexterity":{"name":"真实人物名","description":"一句话说明契合${attributeNames['dexterity']}的原因","skills":[...同上格式共5个]},
  "kindness":{"name":"真实人物名","description":"一句话说明契合${attributeNames['kindness']}的原因","skills":[...同上格式共5个]},
  "charm":{"name":"真实人物名","description":"一句话说明契合${attributeNames['charm']}的原因","skills":[...同上格式共5个]}
}`;

  try {
    const result = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }]);
    const parsed = extractJSON(result) as Record<string, { name?: string; description?: string; skills?: unknown }>;

    const personaName = fallbackName;
    const skills = {} as Record<AttributeId, PersonaSkill[]>;
    const attributePersonas = {} as Record<AttributeId, { name: string; description: string }>;

    ATTRS.forEach(attr => {
      const attrData = parsed[attr];
      skills[attr] = repairSkills(attrData?.skills, attributeNames[attr], personaName);
      attributePersonas[attr] = {
        name: (typeof attrData?.name === 'string' && attrData.name) ? attrData.name : `${attributeNames[attr]}之灵`,
        description: (typeof attrData?.description === 'string' && attrData.description) ? attrData.description : `${personaName}的${attributeNames[attr]}具现`,
      };
    });

    return { personaName, skills, attributePersonas, usedFallback: false };
  } catch {
    return {
      personaName: fallbackName,
      skills: generateDefaultSkills(fallbackName, attributeNames),
      attributePersonas: generateDefaultAttributePersonas(fallbackName, attributeNames),
      usedFallback: true,
    };
  }
}

// ── Default Persona data ────────────────────────────────────────────────────

function generateDefaultAttributePersonas(
  _name: string,
  _attrNames: Record<AttributeId, string>
): Record<AttributeId, { name: string; description: string }> {
  const defaultPersonas: Record<AttributeId, { name: string; description: string }> = {
    knowledge: { name: '亚里士多德', description: '古希腊哲学家，逻辑学与知识体系的奠基人' },
    guts: { name: '阿喀琉斯', description: '特洛伊战争中最勇敢的英雄，代表无畏的战士精神' },
    dexterity: { name: '莫扎特', description: '音乐天才，以精湛的技艺和创造力闻名于世' },
    kindness: { name: '甘地', description: '非暴力抵抗运动的倡导者，体现慈悲与包容' },
    charm: { name: '克利奥帕特拉', description: '埃及艳后，以智慧与魅力著称的古代政治家' },
  };
  const r = {} as Record<AttributeId, { name: string; description: string }>;
  ATTRS.forEach(attr => { r[attr] = defaultPersonas[attr]; });
  return r;
}

function generateDefaultSkills(name: string, attrNames: Record<AttributeId, string>): Record<AttributeId, PersonaSkill[]> {
  const types: Array<'damage' | 'buff' | 'debuff' | 'attack_boost'> = ['damage', 'damage', 'buff', 'debuff', 'attack_boost'];
  const powers = [10, 15, 22, 30, 40];
  const costs = [8, 12, 18, 25, 35];
  const r = {} as Record<AttributeId, PersonaSkill[]>;
  ATTRS.forEach(attr => {
    r[attr] = powers.map((p, i) => ({
      level: i + 1,
      name: `${attrNames[attr]}之力 Lv${i + 1}`,
      description: `${name}释放${attrNames[attr]}的力量`,
      type: types[i],
      power: types[i] === 'attack_boost' ? 15 : p,
      spCost: costs[i],
    }));
  });
  return r;
}

/**
 * Regenerate a single attribute's Persona via AI.
 * Returns new name, description, and skills for that attribute.
 */
export async function reshuffleAttributePersonaAI(
  settings: Settings,
  _attr: AttributeId,
  attrName: string,
  currentName: string,
): Promise<{ name: string; description: string; skills: PersonaSkill[] } | null> {
  const cfg = getAIConfig(settings);
  if (!cfg) return null;
  const diversityHint = getDiversityHint();
  const prompt = `你是Persona系列游戏的人格解析师。请为"${attrName}"属性重新匹配一个全新的Persona人物。

【要求】
1. 必须是真实存在或有据可查的一位人物（历史人物/神话人物/文学角色/宗教传说人物）
2. 禁止与当前人物"${currentName}"相同或过于相似
3. 文化偏好提示：${diversityHint}
4. 人物要有新意，避免过于大众化的选择

技能规格：level 1-5，power=10/15/22/30/40，spCost=8/12/18/25/35
技能类型（7种）：damage/crit/buff/debuff/charge/heal/attack_boost
五技能分布（level顺序）：damage / crit / buff或heal / debuff / attack_boost或charge
技能名称和描述须体现该人物的标志性事迹或特质

纯JSON输出，不含代码块和注释：
{"name":"真实人物名","description":"一句话说明该人物与${attrName}特质的契合点","skills":[{"level":1,"name":"技能名","description":"技能描述","type":"damage","power":10,"spCost":8},{"level":2,"name":"技能名","description":"技能描述","type":"crit","power":15,"spCost":12},{"level":3,"name":"技能名","description":"技能描述","type":"buff","power":22,"spCost":18},{"level":4,"name":"技能名","description":"技能描述","type":"debuff","power":30,"spCost":25},{"level":5,"name":"技能名","description":"技能描述","type":"attack_boost","power":40,"spCost":35}]}`;

  try {
    const result = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }]);
    const parsed = extractJSON(result) as { name?: string; description?: string; skills?: unknown };
    const name = (typeof parsed.name === 'string' && parsed.name) ? parsed.name.slice(0, 15) : attrName + '之灵';
    const description = (typeof parsed.description === 'string' && parsed.description) ? parsed.description : `${name}的${attrName}具现`;
    const skills = repairSkills(parsed.skills, attrName, name);
    return { name, description, skills };
  } catch {
    return null;
  }
}

/**
 * Generate skills for a manually-named Persona (no AI, generates default skill set).
 */
export function generateSkillsForManualPersona(
  personaName: string,
  attrName: string,
): PersonaSkill[] {
  const types: Array<PersonaSkill['type']> = ['damage', 'crit', 'buff', 'debuff', 'attack_boost'];
  const powers = [10, 15, 22, 30, 40];
  const costs = [8, 12, 18, 25, 35];
  return powers.map((p, i) => ({
    level: i + 1,
    name: `${personaName}·${attrName}之力 Lv${i + 1}`,
    description: `${personaName}释放${attrName}的力量`,
    type: types[i],
    power: types[i] === 'attack_boost' ? 15 : p,
    spCost: costs[i],
  }));
}

/**
 * Generate AI-flavored skills for a user-provided persona name + attribute.
 */
export async function generateAISkillsForPersona(
  settings: Settings,
  personaName: string,
  attrName: string,
): Promise<PersonaSkill[] | null> {
  const cfg = getAIConfig(settings);
  if (!cfg) return null;
  const prompt = `你是Persona系列游戏的技能设计师。请为Persona人物"${personaName}"设计5个与"${attrName}"属性相关的战斗技能。

【人物背景】
${personaName}是一位与"${attrName}"属性高度契合的Persona。请根据这位人物的标志性事迹、特质或传说来设计技能。

【技能规格】
- level 1-5，对应 power=10/15/22/30/40，spCost=8/12/18/25/35
- 技能类型（7种）：damage(直接伤害) / crit(暴击型,有概率双倍伤害+失衡) / buff(提升下次攻击×1.5) / debuff(施加易伤×1.3) / charge(蓄力,下回合双倍) / heal(回复5HP) / attack_boost(15伤害+3回合增伤+15)
- 五技能分布（按level顺序）：damage / crit / buff或heal / debuff / attack_boost或charge
- 技能名称要有创意，体现该人物的独特风格，不要使用"之力""Lv"等后缀

纯JSON输出，不含代码块和注释：
{"skills":[{"level":1,"name":"技能名","description":"一句话描述","type":"damage","power":10,"spCost":8},{"level":2,"name":"技能名","description":"一句话描述","type":"crit","power":15,"spCost":12},{"level":3,"name":"技能名","description":"一句话描述","type":"buff","power":22,"spCost":18},{"level":4,"name":"技能名","description":"一句话描述","type":"debuff","power":30,"spCost":25},{"level":5,"name":"技能名","description":"一句话描述","type":"attack_boost","power":40,"spCost":35}]}`;

  try {
    const result = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }]);
    const parsed = extractJSON(result) as { skills?: unknown };
    return repairSkills(parsed.skills, attrName, personaName);
  } catch {
    return null;
  }
}

// ── Shadow generation ───────────────────────────────────────────────────────

/** Pick a weakness attribute that is different from lastWeakAttribute */
function pickWeakAttribute(lastWeak?: AttributeId): AttributeId {
  const pool = lastWeak ? ATTRS.filter(a => a !== lastWeak) : ATTRS;
  return pool[Math.floor(Math.random() * pool.length)];
}

const SHADOW_JSON_FORMAT = `
纯JSON输出，不要包裹在代码块中，不含任何注释：
{"name":"Shadow名称","description":"2句描述","invertedAttributes":{"knowledge":"反向描述","guts":"反向描述","dexterity":"反向描述","kindness":"反向描述","charm":"反向描述"},"responseLines":["台词1","台词2","台词3","台词4","台词5","台词6","台词7","台词8"]}`;

const DEFAULT_SHADOW_LINES = [
  '你以为这就能击败我？',
  '这点伤害不过如此。',
  '有趣，继续吧。',
  '你真的了解自己吗？',
  '我是你内心的一部分！',
  '就这点实力还妄想战胜我？',
  '你在变强……但还不够。',
  '小心……我也在变强。',
];

export async function generateShadow(
  settings: Settings,
  attributeNames: Record<AttributeId, string>,
  level: number,
  attrValues: Record<AttributeId, number>,
  lastWeakAttribute?: AttributeId,
): Promise<{ name: string; description: string; invertedAttributes: Record<AttributeId, string>; responseLines: string[]; weakAttribute: AttributeId }> {
  const cfg = getAIConfig(settings);
  const weakAttribute = pickWeakAttribute(lastWeakAttribute);

  if (!cfg) throw new Error('未配置 AI API Key，请前往「设置 → AI摘要」填写 API Key 后重试');

  const customTemplate = settings.battleShadowPromptTemplate;
  const levelPersonality = level <= 2
    ? '语气不稳定、带有挑衅和嘲讽，像一个试探性的捣蛋鬼，偶尔暴露出脆弱'
    : level <= 3
    ? '语气冷静而有压迫感，像一个洞察一切的审判者，用事实和逻辑刺痛对方'
    : '语气绝对而傲慢，像一个降临的灾厄，充满碾压感和神性的威严，台词简短有力';
  const defaultPrompt = `你是Persona系列游戏的Shadow生成器。请为Lv${level}的内心暗影生成数据。
Shadow是用户内心负面特质的具现，其属性为用户属性的反向：${ATTRS.map(a => `${attributeNames[a]}=${attrValues[a]}`).join('，')}。
Shadow的弱点属性为"${attributeNames[weakAttribute]}"，受到该属性技能时伤害×1.5。

【等级${level}的性格要求】
${levelPersonality}。
等级越高，Shadow越强大——名称越有压迫感，描述越令人不安，台词越居高临下。

【输出要求】
- name：格式为"xx之xx"（有压迫感，等级高时可用更宏大/绝望的词汇）
- description：2句话，体现这个Shadow的内心阴暗面来源和危险性
- responseLines：8条战斗台词，必须体现上述性格要求，每条风格各异（不要全是反问句或全是省略号），至少包含：1条嘲讽、1条威胁、1条对玩家弱点的点评、1条自我宣言
${SHADOW_JSON_FORMAT}`;

  // Custom template: append JSON format instructions to prevent format errors
  const prompt = customTemplate
    ? customTemplate
        .replace('{level}', String(level))
        .replace('{attrs}', ATTRS.map(a => `${attributeNames[a]}=${attrValues[a]}`).join(','))
        .replace('{weakAttr}', attributeNames[weakAttribute])
      + '\n' + SHADOW_JSON_FORMAT
    : defaultPrompt;

  const result = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }]);
  let parsed: Record<string, unknown>;
  try {
    parsed = extractJSON(result);
  } catch {
    throw new Error('AI 返回的 JSON 格式无效，请重试');
  }

  // Field-level validation and repair
  const name = (typeof parsed.name === 'string' && parsed.name) ? parsed.name : `暗影Lv${level}`;
  const description = (typeof parsed.description === 'string' && parsed.description)
    ? parsed.description
    : '从你内心的恐惧与回避中诞生的暗影。';
  const invertedAttributes = (parsed.invertedAttributes && typeof parsed.invertedAttributes === 'object')
    ? parsed.invertedAttributes as Record<AttributeId, string>
    : Object.fromEntries(ATTRS.map(a => [a, `缺乏${attributeNames[a]}的力量`])) as Record<AttributeId, string>;
  let responseLines: string[];
  if (Array.isArray(parsed.responseLines) && parsed.responseLines.length >= 4) {
    responseLines = parsed.responseLines.filter((l): l is string => typeof l === 'string').slice(0, 8);
    // Pad to 8 if AI returned fewer
    while (responseLines.length < 8) {
      responseLines.push(DEFAULT_SHADOW_LINES[responseLines.length % DEFAULT_SHADOW_LINES.length]);
    }
  } else {
    responseLines = [...DEFAULT_SHADOW_LINES];
  }

  return { name, description, invertedAttributes, responseLines, weakAttribute };
}

export function getDefaultShadow(
  attrNames: Record<AttributeId, string>,
  level: number
): { name: string; description: string; invertedAttributes: Record<AttributeId, string>; responseLines: string[] } {
  const labels = ['之阴影', '之深渊', '之执念', '之噩梦', '之深渊王'];
  return {
    name: `怠惰${labels[level - 1]}`,
    description: '从你内心的恐惧与回避中诞生，是你所有未曾直面的弱点的具现。',
    invertedAttributes: Object.fromEntries(ATTRS.map(a => [a, `缺乏${attrNames[a]}的力量`])) as Record<AttributeId, string>,
    responseLines: [...DEFAULT_SHADOW_LINES],
  };
}

// ── Victory narrative ───────────────────────────────────────────────────────

export async function generateVictoryNarrative(
  settings: Settings,
  personaName: string,
  shadowName: string,
  level: number
): Promise<string> {
  const cfg = getAIConfig(settings);
  if (!cfg) return `你的Persona「${personaName}」击败了「${shadowName}」！\n你用成长战胜了内心的黑暗。前方还有更强大的Shadow……`;

  const customTemplate = settings.battleVictoryPromptTemplate;
  const prompt = customTemplate
    ? customTemplate.replace('{persona}', personaName).replace('{shadow}', shadowName).replace('{level}', String(level))
    : `写一段100字以内的Persona风格胜利叙事，要求：全程以第二人称"你"为主语；不使用任何括号符号（包括「」【】（）《》等）；语言充满戏剧张力；结尾暗示前方还有更强大的存在。战斗信息：你操控${personaName}，击败了${level}级Shadow ${shadowName}。`;

  try {
    return await callAIWithRetry(cfg, [{ role: 'user', content: prompt }]);
  } catch {
    return `你操控${personaName}，将Shadow ${shadowName}彻底击溃！\n黑暗在你面前碎裂，但你感知到——更深处，还有什么正在苏醒……`;
  }
}
