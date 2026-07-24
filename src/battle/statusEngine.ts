/**
 * 战斗引擎 v2 · 状态效果（BATTLE_UPGRADE_PLAN_V2.md §3.13）
 *
 * 口径修正（修 review #3）：衰减发生在**回合开始**，且施加当回合带 fresh 标记免衰减——
 * hint 写"持续 N 回合"就真的从施加时刻起覆盖 N 个回合。
 * 中毒也在回合开始 tick：turns=3 的毒恰好跳伤 3 次。
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */
import type { StatusEffect, StatusKind } from '../types';

export interface EngineStatus extends StatusEffect {
  /** 施加当回合为 true：本次回合开始 tick 只摘 fresh，不衰减 */
  fresh?: boolean;
}

export function findStatus(list: EngineStatus[], kind: StatusKind): EngineStatus | undefined {
  return list.find(e => e.kind === kind);
}

export function removeStatus(list: EngineStatus[], kind: StatusKind): EngineStatus[] {
  return list.filter(e => e.kind !== kind);
}

/** 施加（带 fresh）：可叠加则加层数并刷新回合，否则刷新数值/回合 */
export function applyStatus(
  list: EngineStatus[],
  eff: StatusEffect,
  stackable = false,
  maxStacks = 3,
): EngineStatus[] {
  const idx = list.findIndex(e => e.kind === eff.kind);
  const freshEff: EngineStatus = { ...eff, fresh: true };
  if (idx === -1) return [...list, freshEff];
  const prev = list[idx];
  const updated: EngineStatus = stackable
    ? {
        ...prev,
        stacks: Math.min(prev.stacks + (eff.stacks || 1), maxStacks),
        remainingTurns: Math.max(prev.remainingTurns, eff.remainingTurns),
        fresh: true,
      }
    : {
        ...prev,
        value: eff.value,
        remainingTurns: Math.max(prev.remainingTurns, eff.remainingTurns),
        sourceName: eff.sourceName,
        fresh: true,
      };
  const copy = [...list];
  copy[idx] = updated;
  return copy;
}

export interface TickResult {
  list: EngineStatus[];
  /** 本次 tick 造成的中毒伤害（value × stacks 合计） */
  poisonDamage: number;
  /** 本次 tick 到期移除的状态 */
  expired: EngineStatus[];
}

/**
 * 回合开始 tick：
 *  - fresh 状态：摘掉 fresh，不衰减、不跳毒（施加当回合已"存在"，从下回合开始计数）
 *  - 非 fresh：poison 先跳伤，然后 remainingTurns--，归零移除
 */
export function tickTurnStart(list: EngineStatus[]): TickResult {
  const next: EngineStatus[] = [];
  const expired: EngineStatus[] = [];
  let poisonDamage = 0;
  for (const eff of list) {
    if (eff.fresh) {
      next.push({ ...eff, fresh: false });
      continue;
    }
    if (eff.kind === 'poison') {
      poisonDamage += eff.value * eff.stacks;
    }
    const remaining = eff.remainingTurns - 1;
    if (remaining <= 0) expired.push(eff);
    else next.push({ ...eff, remainingTurns: remaining });
  }
  return { list: next, poisonDamage, expired };
}
