import type { AttributeId } from '@/types';
import { LIFE_QUEST_PRESETS, type LifeQuestPreset } from '@/constants/lifeQuestPresets';

/**
 * 今日委托题库 ↔ 用户自己的五项属性（第 17 批）——纯逻辑，不发请求（发请求的在 lifeQuestAI.ts）。
 *
 * 题库按默认五维（知识 / 胆量 / 灵巧 / 温柔 / 魅力）写。用户把某一项改成了别的意思（比如「胆量」改成「休息」），
 * 原样出题就会出现「鼓起勇气的事给休息加点」。所以：
 *   - 名字没改、或改成同一个意思（胆量 → 勇气）：这一类照原样出；
 *   - 改成了别的意思：等 AI 把 80 条逐条对到最贴切的属性（对不上的不出），结果存在设置里（随同步），
 *     属性名或题库一变（签名变了）就重算；
 *   - AI 的结果还没有（没配 AI / 还在路上 / 失败了等下次重试）：改过名的那几类先不出，宁可少出不错出。
 */

/** 每一维「算同一个意思」的叫法（规整后比：去空白标点、转小写） */
export const LIFE_ATTR_SYNONYMS: Record<AttributeId, readonly string[]> = {
  knowledge: ['知识', '学识', '学习', '学问', '智慧', '求知', '智力', '头脑', '知性', '博学', 'knowledge', 'wisdom', 'intelligence'],
  guts: ['胆量', '勇气', '胆识', '勇敢', '冒险', '胆子', '魄力', '行动力', '胆魄', 'guts', 'courage', 'bravery'],
  dexterity: ['灵巧', '手艺', '技巧', '动手', '手工', '灵活', '巧手', '技艺', '实践', '巧思', 'dexterity', 'proficiency', 'skill'],
  kindness: ['温柔', '善良', '温暖', '体贴', '关怀', '共情', '同理心', '包容', '宽容', '爱心', '善意', 'kindness', 'empathy'],
  charm: ['魅力', '气质', '风度', '吸引力', '审美', '品味', '格调', '魅', 'charm', 'charisma'],
};

export const LIFE_ATTR_IDS: readonly AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

/** 这一维的名字是不是还是原来的意思（没改、或改成了同义词） */
export function attrNameIsStock(attr: AttributeId, name: string | undefined): boolean {
  const n = norm(name ?? '');
  if (!n) return true; // 没填 = 用默认名
  return LIFE_ATTR_SYNONYMS[attr].some((s) => norm(s) === n);
}

/** 改成了别的意思的那几维 */
export function customLifeAttrs(names: Partial<Record<AttributeId, string>> | undefined): AttributeId[] {
  return LIFE_ATTR_IDS.filter((a) => !attrNameIsStock(a, names?.[a]));
}

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

/** 题库的版本：编号 / 标题 / 候选词 / 原属性任何一样变了，签名就变（人工改题库后会自动重对） */
export function lifePresetLibrarySig(presets: readonly LifeQuestPreset[] = LIFE_QUEST_PRESETS): string {
  return fnv1a(presets.map((p) => `${p.id}|${p.title}|${(p.slots ?? []).join('/')}|${p.attribute}`).join('\n')).toString(36);
}

/** 对应关系的签名：五个属性名（按顺序）+ 题库版本 */
export function lifeAttrMapSig(names: Partial<Record<AttributeId, string>> | undefined, presets: readonly LifeQuestPreset[] = LIFE_QUEST_PRESETS): string {
  return `${fnv1a(LIFE_ATTR_IDS.map((a) => norm(names?.[a] ?? '')).join('|')).toString(36)}.${lifePresetLibrarySig(presets)}`;
}

/** 设置里存的 AI 对应结果 */
export interface LifeQuestAttrMap {
  /** 算这份结果时的签名（lifeAttrMapSig）：和现在的不一样就作废重算 */
  sig: string;
  /** 预设 id → 属性；null = 五项都不搭，不出 */
  map: Record<string, AttributeId | null>;
  at: number;
}

export interface ResolvedLifeAttrs {
  /** 这条题目算哪一项属性；null = 不出 */
  attrOf: (p: LifeQuestPreset) => AttributeId | null;
  /** stock = 都是原来的意思；ai = 用 AI 对好的；fallback = 等 AI（改过名的那几类先不出） */
  source: 'stock' | 'ai' | 'fallback';
  /** 改成了别的意思的那几维 */
  custom: AttributeId[];
  sig: string;
}

/** 按当前设置算每条题目归哪一项属性 */
export function resolveLifeAttrs(settings: { attributeNames?: Partial<Record<AttributeId, string>>; lifeQuestAttrMap?: LifeQuestAttrMap }): ResolvedLifeAttrs {
  const names = settings.attributeNames;
  const custom = customLifeAttrs(names);
  const sig = lifeAttrMapSig(names);
  if (!custom.length) return { attrOf: (p) => p.attribute, source: 'stock', custom, sig };
  const saved = settings.lifeQuestAttrMap;
  if (saved && saved.sig === sig && saved.map) {
    const map = saved.map;
    // AI 没给到的那几条按兜底：原来那类没改过名就照旧，改过的不出
    return { attrOf: (p) => (p.id in map ? map[p.id] : custom.includes(p.attribute) ? null : p.attribute), source: 'ai', custom, sig };
  }
  return { attrOf: (p) => (custom.includes(p.attribute) ? null : p.attribute), source: 'fallback', custom, sig };
}

/** 一批委托是按哪种对应出的：stock 不随同义改名变；ai 跟着属性名 + 题库签名；fallback 跟着「改过名的那几维」 */
export function lifeAttrSigOf(attrs: ResolvedLifeAttrs): string {
  return attrs.source === 'stock' ? 'stock' : attrs.source === 'ai' ? `ai:${attrs.sig}` : `fallback:${attrs.custom.join(',')}`;
}
