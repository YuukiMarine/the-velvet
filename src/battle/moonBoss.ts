/**
 * 满月心魔（2.7.0.6 第 6 轮 · PRD §11.6）——纯数值与装配，零 AI。
 * 它是深渊回廊的关底 boss：满月当天新进的那一环，顶层守卫换成它。
 *   - 血量 = Lv5 心魔一形态 × (1 + 0.1 × 已击败月数)，没有二形态；攻击同 Lv5 心魔
 *   - 弱点 = 当月记得最少的属性（调用方算好传进来）
 *   - 两条词缀按月轮换
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */
import type { AffixKind, AttributeId, Shadow } from '../types';
import { AFFIX_HP_MULT, BOSS_ATTACK_BY_LEVEL, MOON_BOSS_GROWTH } from './numbers';

export interface MoonRevealData {
  name: string;
  description: string;
  invertedAttributes: Record<AttributeId, string>;
  responseLines: string[];
  weakAttribute: AttributeId;
}

/** 两条词缀按月轮换（1 月起） */
export const MOON_AFFIX_CYCLE: AffixKind[][] = [
  ['keen', 'thorns'], ['slippery', 'vengeful'], ['swift', 'greedy'], ['stubborn', 'eclipse'],
  ['keen', 'slippery'], ['thorns', 'swift'], ['greedy', 'vengeful'], ['eclipse', 'keen'],
  ['stubborn', 'thorns'], ['swift', 'slippery'], ['vengeful', 'eclipse'], ['greedy', 'stubborn'],
];

export const monthKeyOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** 「2026 年 10 月」 */
export const monthLabelOf = (month: string): string => `${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月`;

export function moonAffixesOf(month: string): AffixKind[] {
  const m = Number(month.slice(5, 7)) || 1;
  return [...MOON_AFFIX_CYCLE[(m - 1) % MOON_AFFIX_CYCLE.length]];
}

export function moonBossHp(baseHp: number, defeatedMoons: number, affixes: AffixKind[]): number {
  const hp = Math.round(baseHp * (1 + MOON_BOSS_GROWTH * Math.max(0, defeatedMoons)));
  // 顽固照常 +30%（与心魔显形口径一致）
  return affixes.includes('stubborn') ? Math.round(hp * AFFIX_HP_MULT) : hp;
}

export function buildMoonShadow(data: MoonRevealData, opts: {
  id: string;
  slot: number;
  month: string;
  /** Lv5 心魔一形态血量（constants.SHADOW_LEVEL_CONFIG 由调用方取，避免 battle → constants 反向依赖） */
  baseHp: number;
  defeatedMoons: number;
  now: Date;
}): Shadow {
  const affixes = moonAffixesOf(opts.month);
  const maxHp = moonBossHp(opts.baseHp, opts.defeatedMoons, affixes);
  return {
    id: opts.id,
    level: 5,
    name: data.name,
    description: data.description,
    invertedAttributes: data.invertedAttributes,
    weakAttribute: data.weakAttribute,
    maxHp,
    currentHp: maxHp,
    maxHp2: undefined,
    currentHp2: undefined,
    responseLines: data.responseLines,
    attackPower: BOSS_ATTACK_BY_LEVEL[4],
    affixes,
    moonSlot: opts.slot,
    moonMonth: opts.month,
    createdAt: opts.now,
  };
}
