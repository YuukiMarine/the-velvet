/**
 * 深渊周常（2.7.0.6 第 6 轮 · PRD §11.8）：八条规则按周键确定性取一条，进环那一刻定下、整环有效。
 * 只和自己比：BattleState.abyssWeekly / abyssRuleBest 记最好成绩，不做排行榜。
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */
import type { AbyssRuleId, AttributeId } from '../types';

export interface AbyssRule {
  id: AbyssRuleId;
  /** 名字里的 {attr} 由展示层换成属性名（只剩温柔 / 只剩胆量…） */
  name: string;
  text: string;
}

export const ABYSS_RULES: AbyssRule[] = [
  { id: 'single_weak', name: '只剩{attr}', text: '本周守卫的弱点全是{attr}' },
  { id: 'thick_armor', name: '厚甲', text: '守卫血量 +25%，本环 SP 收益 ×1.5' },
  { id: 'gale', name: '疾风', text: '守卫攻击 9 → 11，但你先手一回合' },
  { id: 'oath_night', name: '誓约之夜', text: '誓约技 SP −50%，其余技能 +50%' },
  { id: 'eclipse', name: '月蚀', text: '守卫弱点全隐，洞察免费' },
  { id: 'greed', name: '贪婪', text: '掉率 ×2，守卫血量 +15%' },
  { id: 'silence', name: '静默', text: '防御不再回 SP' },
  { id: 'echo', name: '回响', text: '每一环的补给层都是回忆之光' },
];

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

/** 本周规则（周键 = 周一 YYYY-MM-DD） */
export function abyssWeeklyRule(weekKey: string): AbyssRule {
  return ABYSS_RULES[fnv1a(`abyss|${weekKey}`) % ABYSS_RULES.length];
}

/** 「只剩 X」那一周的 X */
export function abyssWeeklyWeakAttribute(weekKey: string): AttributeId {
  return ATTRS[fnv1a(`weak|${weekKey}`) % ATTRS.length];
}

export const abyssRuleById = (id: AbyssRuleId): AbyssRule => ABYSS_RULES.find((r) => r.id === id) ?? ABYSS_RULES[0];

/** 展示文案：把 {attr} 换成属性名 */
export function abyssRuleLabel(rule: AbyssRule, attrName: string): { name: string; text: string } {
  return { name: rule.name.replace('{attr}', attrName), text: rule.text.replace('{attr}', attrName) };
}
