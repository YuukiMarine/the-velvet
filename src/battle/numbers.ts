/**
 * 战斗引擎 v2 · 数值锚点单文件（BATTLE_UPGRADE_PLAN_V2.md §9）
 *
 * 全部战斗数值集中于此，平衡性调整只动这里。
 * ⚠️ 本模块只允许相对导入（模拟战脚本用 tsx 直跑，不解析 '@/' 别名）。
 */
import type { AttributeId } from '../types';

// ── 五维克制环（§3.3）──────────────────────────────────────
// 知识 → 胆量 → 灵巧 → 温柔 → 魅力 → 知识（顺环 ×1.2，逆环 ×0.8）
export const ATTR_RING: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

export const RING_ADVANTAGE_MULT = 1.2;
export const RING_DISADVANTAGE_MULT = 0.8;

/** 攻击方属性 → 防御方属性 的克制乘数（无属性一方传 null → ×1） */
export function ringMultiplier(attacker: AttributeId | null, defender: AttributeId | null): number {
  if (!attacker || !defender || attacker === defender) return 1;
  const ai = ATTR_RING.indexOf(attacker);
  const di = ATTR_RING.indexOf(defender);
  if ((ai + 1) % ATTR_RING.length === di) return RING_ADVANTAGE_MULT;
  if ((di + 1) % ATTR_RING.length === ai) return RING_DISADVANTAGE_MULT;
  return 1;
}

// ── 玩家侧 ─────────────────────────────────────────────────
export const PLAYER_BASE_HP = 40;              // §9.1（旧默认 8 → 40；跑测后 30→40）
export const DEFEND_DAMAGE_MULT = 0.5;
export const DEFEND_SP_REGEN = 5;              // 跑测微调 3→5：长战 SP 经济的主要回路
export const GUARD_COUNTER_ADD = 0.5;          // 格挡反击：完全吸收后下回合首击 +50%（加算段）
export const INSIGHT_SP_COST = 2;              // 洞察：免回合，每回合 1 次
export const ATTACK_BOOST_FLAT = 6;            // 攻击增益平添（旧 +15 → +6）
export const ATTACK_BOOST_TURNS = 3;
export const BUFF_ADD = 0.5;                   // buff：下次伤害 +50%（旧 ×1.5 乘算 → 加算）
export const VULNERABLE_ADD = 0.3;             // 易伤兜底（无 SKILL_EFFECT_MAP 映射时）
export const CHARGE_MULT = 2;
export const CRIT_MULT = 2;
export const WEAKNESS_MULT = 1.5;
export const ONE_MORE_CD_TURNS = 2;            // 1More 触发后 2 回合内不再触发
/** crit 类技能基础暴击率（按技能等级） */
export const SKILL_CRIT_BY_LEVEL = [0.1, 0.15, 0.2, 0.25, 0.3];
/** 非 crit 技能吃 crit_buff 的减半系数（沿 v1.9） */
export const OFFTYPE_CRIT_FACTOR = 0.5;

// 面具被动
export const GUTS_MASK_CRIT = 0.15;
export const KNOWLEDGE_MASK_WEAK_FLAT = 2;
export const DEX_MASK_EXTRA_EVERY = 5;         // 每第 5 次技能获得追加行动

/** heal 重做（§9.1）：回复 = 威力 ×30%，温柔 ×1.3，至少 1（跑测后 0.25→0.30） */
export function healAmount(power: number, attr: AttributeId): number {
  return Math.max(1, Math.round(power * 0.3 * (attr === 'kindness' ? 1.3 : 1)));
}

// ── 失衡与总攻击（§3.6）────────────────────────────────────
export const STAGGER_MAX = 100;
export const STAGGER_WEAKNESS_GAIN = 34;       // 3 次弱点满条
export const STAGGER_CRIT_GAIN = 17;           // 暴击半量
export const STAGGER_TAKEN_MULT = 1.3;         // 失衡期间受伤 +30%
export const STAGGER_IMMUNE_TURNS = 3;
export const ALL_OUT_SP_COST = 20;
export const ALL_OUT_BASE_RATIO = 0.6;         // 基数 = 全 Lv5 威力和 × 0.6
export const BOSS_FORCED_WINDOW_HP_RATIO = 0.1; // 濒死保底失衡窗口

// ── 拔河 QTE（§3.7）────────────────────────────────────────
export const QTE_DURATION_MS = 3500;
export const QTE_TAP_GAIN = 2.2;               // 每次点击 +2.2%
export const QTE_START = 30;
/** Shadow 意志回拉：每 100ms 按等级 0.8~1.6% */
export function qtePullPer100ms(level: number): number {
  return 0.8 + (Math.min(5, Math.max(1, level)) - 1) * 0.2;
}
export function qteMultiplier(gauge: number): number {
  if (gauge >= 100) return 2.2;
  if (gauge >= 75) return 1.8;
  if (gauge >= 50) return 1.5;
  return 1.2;
}
export const QTE_FALLBACK_MULT = 1.5;          // D0 / reduce-motion 直接结算

// ── Shadow 侧（§9.2）───────────────────────────────────────
/** 主影攻击力（按区层/Shadow 等级 1-5）。settings.battleAttackScale（%）作用其上
 *  跑测微调：[7,9,11,13,15] → [5,6,7,8,9]——原表下聪明策略胜率仅 1/10，玩家 HP 池只够挨 4-6 击 */
export const BOSS_ATTACK_BY_LEVEL = [5, 6, 7, 8, 9];
/** Shadow 暴击率（按等级）。跑测微调：[0,.1,.15,.2,.3] → 减半，暴击×2 在小血池下过于摇摆 */
export const SHADOW_CRIT_BY_LEVEL = [0, 0.05, 0.08, 0.1, 0.12];
export const PHASE2_ATTACK_MULT = 1.2;
export const PHASE2_RESIST_MULT = 0.7;         // 二形态对一形态受击最多的属性产生耐性
export const BERSERK_ATK_MULT = 1.5;
export const BERSERK_SELF_DAMAGE = 1;
export const BERSERK_HP_THRESHOLD = 0.3;
export const EXECUTE_PLAYER_HP_RATIO = 0.25;   // 玩家 HP <25% → 处刑意图（必暴击）
export const HEAVY_POWER_MULT = 2.2;
export const HEAVY_WINDUP_TURNS = 1;           // 前摇 1 回合：预告下回合释放
export const HEAVY_COOLDOWN_TURNS = 4;
export const GUARD_STANCE_MULT = 0.6;          // 警戒姿态：受到的伤害 ×0.6（1 回合）
export const GUARD_INTENT_ATTACK_MULT = 0.7;   // 警戒当回合攻击减弱
export const DEBUFF_INTENT_ATTACK_MULT = 0.5;  // 施异常当回合附带轻击
export const SHADOW_ATKUP_MULT = 1.25;         // 强化意图：自身攻击 ×1.25（3 回合）
export const SHADOW_ATKUP_TURNS = 3;
/** Shadow 施加给玩家的中毒强度（按其攻击力折算，至少 1） */
export function shadowPoisonValue(attackPower: number): number {
  return Math.max(1, Math.round(attackPower * 0.4));
}
export const SHADOW_CALM_MULT = 0.85;          // 侵蚀（玩家攻击减弱）
export const SHADOW_STATUS_TURNS = 2;

// ── 回合压力（§3.11）───────────────────────────────────────
export const PRESSURE_START_TURN = 12;
export const PRESSURE_RATE = 0.1;
export const PRESSURE_CAP = 1.6;
export function turnPressureMult(turn: number): number {
  if (turn < PRESSURE_START_TURN) return 1;
  return Math.min(PRESSURE_CAP, 1 + PRESSURE_RATE * (turn - PRESSURE_START_TURN + 1));
}

// ── 伤害乘区三段（§3.2）────────────────────────────────────
// 最终伤害 = ( 基础威力 + Σ平添 ) × ( 1 + Σ加算 ) × Π乘算
export function computeDamage(base: number, flats: number[], adds: number[], mults: number[]): number {
  const flatSum = flats.reduce((s, v) => s + v, 0);
  const addSum = adds.reduce((s, v) => s + v, 0);
  const multProduct = mults.reduce((p, v) => p * v, 1);
  return Math.max(0, Math.round((base + flatSum) * (1 + addSum) * multProduct));
}
