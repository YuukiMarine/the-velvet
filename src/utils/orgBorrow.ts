/**
 * 借面具（v2.7.0.6 第 8 轮 · PRD §13.5）的纯计算：快照校验与夹值、本周的借用状态、借来技能的 SP 与折算威力。
 * 规则（拍板）：每周能带进 3 场战斗（一场里第一次用借来的技能时算一场），只在本周有效；
 * 伤害 = 快照威力 × 据点系数，不吃属性克制、弱点和自己面具的被动；SP 按技能等级的标准消耗扣。
 * 不碰 store，无头脚本里可以直接验。
 */
import { weekKeyOf } from '@/battle/tower';
import type { AttributeId, BattleState, BorrowedMask, OrgPersonaSnapshot, PersonaSkill } from '@/types';

export const BORROW_BATTLES_PER_WEEK = 3;
/** 快照里的威力夹到这个范围（誓约技最高 55，留一点余量） */
export const BORROW_POWER_MIN = 1;
export const BORROW_POWER_MAX = 60;
/** 同等级技能的标准 SP（与人格生成的规格一致：Lv1–5 = 8 / 12 / 18 / 25 / 35） */
export const BORROW_SP_BY_LEVEL = [8, 12, 18, 25, 35] as const;

const ATTRS: readonly AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const TYPES: readonly PersonaSkill['type'][] = ['damage', 'buff', 'debuff', 'crit', 'charge', 'heal', 'attack_boost'];
const clampInt = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : dflt;
  return Math.max(lo, Math.min(hi, v));
};
const cleanName = (s: unknown, n: number): string => [...String(s ?? '').replace(/\s+/g, ' ').trim()].slice(0, n).join('');

/** 别人推上来的面具快照 → 能放心用的样子：属性 / 类型在白名单里，威力 1–60，等级 1–5，最多三个技能，名字截断；不合格返回 null */
export function sanitizePersona(v: unknown): OrgPersonaSnapshot | null {
  const o = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!o) return null;
  const attribute = ATTRS.includes(o.attribute as AttributeId) ? (o.attribute as AttributeId) : null;
  const name = cleanName(o.name, 24);
  if (!attribute || !name) return null;
  const skills = (Array.isArray(o.skills) ? (o.skills as Array<Record<string, unknown>>) : [])
    .filter(x => x && typeof x === 'object' && TYPES.includes(x.type as PersonaSkill['type']) && cleanName(x.name, 24))
    .slice(0, 3)
    .map(x => ({
      name: cleanName(x.name, 24),
      type: x.type as PersonaSkill['type'],
      power: clampInt(x.power, BORROW_POWER_MIN, BORROW_POWER_MAX, BORROW_POWER_MIN),
      level: clampInt(x.level, 1, 5, 1),
    }));
  return { name, attribute, level: clampInt(o.level, 1, 99, 1), skills };
}

/** 借来技能的 SP：按技能等级的标准消耗（不吃任何减耗） */
export const borrowedSkillCost = (level: number): number => BORROW_SP_BY_LEVEL[clampInt(level, 1, 5, 1) - 1];
/** 折算后的威力（快照威力 × 据点系数，四舍五入） */
export const borrowedPower = (power: number, mult: number): number => Math.max(1, Math.round(power * mult));

export interface BorrowNow {
  weekKey: string;
  /** 本周已经带进了几场 */
  battles: number;
  /** 本周还能带进几场 */
  left: number;
  /** 本周借着的那张（上周借的已经还回去了） */
  mask?: BorrowedMask;
}

/** 此刻的借用状态（周键对不上 = 新的一周：场数清零、上周借的还回去） */
export function borrowNow(bs: Pick<BattleState, 'borrow'> | null | undefined, now = new Date()): BorrowNow {
  const weekKey = weekKeyOf(now);
  const b = bs?.borrow;
  if (!b || b.weekKey !== weekKey) return { weekKey, battles: 0, left: BORROW_BATTLES_PER_WEEK };
  const battles = clampInt(b.battles, 0, 99, 0);
  const mask = b.mask ? { ...b.mask, persona: sanitizePersona(b.mask.persona) ?? b.mask.persona } : undefined;
  return { weekKey, battles, left: Math.max(0, BORROW_BATTLES_PER_WEEK - battles), ...(mask ? { mask } : {}) };
}

/** 同步合并：同一周取用得多的那边（借着的面具跟着那边走，都没有就取另一边的），不同周取新的那周 */
export function mergeBorrow(a: BattleState['borrow'], b: BattleState['borrow']): BattleState['borrow'] {
  if (!a) return b;
  if (!b) return a;
  if (a.weekKey !== b.weekKey) return a.weekKey > b.weekKey ? a : b;
  const [hi, lo] = (a.battles ?? 0) >= (b.battles ?? 0) ? [a, b] : [b, a];
  const mask = hi.mask && lo.mask ? (hi.mask.at >= lo.mask.at ? hi.mask : lo.mask) : hi.mask ?? lo.mask;
  return { weekKey: hi.weekKey, battles: hi.battles, ...(mask ? { mask } : {}) };
}
