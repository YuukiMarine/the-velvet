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
export const ALL_OUT_SP_COST = 10;             // R18：20 → 10（处决化，随手可发）
/** R19：总攻击基数再压——LV1 时 1.0 倍率 50，逐级 +4（R18 的 100@5 溢出过多） */
export const ALL_OUT_BASE_AT_LV1 = 50;
export const ALL_OUT_PER_LEVEL = 4;
export const BOSS_FORCED_WINDOW_HP_RATIO = 0.1; // 濒死保底失衡窗口
/** R18 普攻：固定 8 点（原 五维等级和），可暴击 */
export const BASIC_ATTACK_POWER = 8;
/** R18 面具羁绊：出战场次阈值（Ⅰ/Ⅱ/Ⅲ）与每档伤害加算 */
export const MASK_BOND_THRESHOLDS = [3, 10, 25];
export const MASK_BOND_ADD_PER_TIER = 0.02;
export function maskBondTier(battles: number): 0 | 1 | 2 | 3 {
  if (battles >= MASK_BOND_THRESHOLDS[2]) return 3;
  if (battles >= MASK_BOND_THRESHOLDS[1]) return 2;
  if (battles >= MASK_BOND_THRESHOLDS[0]) return 1;
  return 0;
}

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
export const BOSS_ATTACK_BY_LEVEL = [5, 6, 7, 8, 9, 11];
/** Shadow 暴击率（按等级）。跑测微调：[0,.1,.15,.2,.3] → 减半，暴击×2 在小血池下过于摇摆 */
export const SHADOW_CRIT_BY_LEVEL = [0, 0.05, 0.08, 0.1, 0.12, 0.14];
export const PHASE2_ATTACK_MULT = 1.2;
/** Lv6 伪神第三形态：比二形态再上一档（只有最终 BOSS 有第三条血） */
export const PHASE3_ATTACK_MULT = 1.35;
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

// ── 高塔区层 · 小影/精英（§9.2，批2）───────────────────────
// 批3 验收调整：全敌人最大 HP 上调 Lv1-2 +10 / Lv3 +20 / Lv4-5 +30（用户拍板）
/** 小影 HP 区间（按区层等级） */
export const MOB_HP_BY_LEVEL: Array<[number, number]> = [[32, 40], [43, 55], [68, 86], [96, 120], [118, 150]];
export const MOB_ATTACK_BY_LEVEL = [3, 4, 5, 6, 7];
export const ELITE_HP_BY_LEVEL: Array<[number, number]> = [[70, 85], [100, 120], [150, 180], [210, 250], [270, 320]];
export const ELITE_ATTACK_BY_LEVEL = [4, 5, 6, 7, 8];

/** 区层等级 SP 系数（节点奖励 = 层段基准 × 系数 × 1.1^异变加深） */
export const STRATUM_SP_COEF = [1, 1.25, 1.5, 1.85, 2.2];
/** 层段 SP 基准（区层内层号）：1-4 层 / 5-8 层 / 9+ 层 */
export const FLOOR_SP_BANDS: Array<[number, number]> = [[3, 5], [6, 9], [10, 14]];
export const BOSS_SP_BASE = 30;
export const DEEPEN_SP_MULT = 1.1;

/** 节点 SP 奖励（rng 注入取整区间） */
export function nodeSpReward(level: number, floor: number, deepenCount: number, rng: () => number): number {
  const band = FLOOR_SP_BANDS[floor <= 4 ? 0 : floor <= 8 ? 1 : 2];
  const base = band[0] + Math.floor(rng() * (band[1] - band[0] + 1));
  const coef = STRATUM_SP_COEF[Math.min(4, Math.max(0, level - 1))];
  return Math.max(1, Math.round(base * coef * Math.pow(DEEPEN_SP_MULT, deepenCount)));
}

export function bossSpReward(level: number, deepenCount: number): number {
  const coef = STRATUM_SP_COEF[Math.min(4, Math.max(0, level - 1))];
  return Math.round(BOSS_SP_BASE * coef * Math.pow(DEEPEN_SP_MULT, deepenCount));
}

/** 回响节点回复比例（§2.6） */
export const ECHO_HEAL_PCT = 0.2;

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

// ── 批3 · 技能熟练度（§4.1）────────────────────────────────
/** 满星（3星）阈值：按技能等级 Lv1-5（拍板：5/10/15/20/30） */
export const MASTERY_FULL_BY_LEVEL = [5, 10, 15, 20, 30];
export const MASTERY_STAR_ADD = 0.05;          // 每星 +5%（加算段）
export function masteryStars(uses: number, skillLevel: number): 0 | 1 | 2 | 3 {
  const full = MASTERY_FULL_BY_LEVEL[Math.min(4, Math.max(0, skillLevel - 1))];
  if (uses >= full) return 3;
  if (uses >= Math.ceil((full * 2) / 3)) return 2;
  if (uses >= Math.ceil(full / 3)) return 1;
  return 0;
}

// ── 批3 · 遗物（§4.2/§10.2）────────────────────────────────
/** 遗物栏位数：按当前区层等级（拍板：Lv1期1 / Lv2-4期2 / Lv5期3） */
export const RELIC_SLOTS_BY_STRATUM = [1, 2, 2, 2, 3];
/** 删除转化 SP：残月/弦月/满月 */
export const RELIC_SALVAGE_SP: Record<'waning' | 'half' | 'full', number> = { waning: 10, half: 25, full: 60 };
export const ELITE_LOOT_RATE = 0.6;            // 强敌 60% 掉战利品
export const CHAIN_DROP_RATE = 0.35;           // 心魔击破 35% 掉共鸣链
export const OATH_DROP_RATE = 0.25;            // 心魔击破 25% 掉誓约石（渠道酌定）
export const CHEST_MYTH_RATE = 0.3;            // 月匣战利品：30% 迷思 / 70% 遗物
export const DUP_CHAIN_SP = 30;                // 重复共鸣链的 SP 补偿

/** 已装备遗物的引擎修正聚合（store 侧汇总注入；塔外效果 compass/handwarmer 由 store 直接消费） */
export interface RelicMods {
  weaknessAdd: number;   // 单片镜：弱点命中加算
  addAll: number;        // 音叉：全伤害加算
  chargeAdd: number;     // 沙漏：蓄力消费时加算
  oneMoreAdd: number;    // 引雷针：1More 后下一击加算
  maskSwitchAdd: number; // 挂绳：换面具后首次攻击加算
  critAdd: number;       // 星图：暴击率
  spPerTurn: number;     // 怀表：回合开始回 SP
  blockHeal: number;     // 铁壁徽记：防御回合结束回 HP
  poisonAmp: number;     // 蚀骨之牙：玩家施毒强度 ×(1+x)
  lowHpGuard: number;    // 绷带：HP<30% 受伤 ×(1−x)
  spCostCut: number;     // 英雄的证明：技能/总攻击 SP 消耗 −n（下限 1）
  atkPct: number;        // 英雄的证明：攻击 +20%（技能进加算段；普攻/总攻击直乘）
}
export const ZERO_RELIC_MODS: RelicMods = {
  weaknessAdd: 0, addAll: 0, chargeAdd: 0, oneMoreAdd: 0, maskSwitchAdd: 0,
  critAdd: 0, spPerTurn: 0, blockHeal: 0, poisonAmp: 0, lowHpGuard: 0,
  spCostCut: 0, atkPct: 0,
};
/** 英雄的证明（Lv6 唯一掉落）：SP 消耗 −5、攻击 +20% */
export const HEROPROOF_SP_CUT = 5;
export const HEROPROOF_ATK_PCT = 0.2;
export const BANDAGE_HP_THRESHOLD = 0.3;       // 绷带触发线

// ── 批3 · 共鸣链（§4.5/§10.5，仅战斗内生效）────────────────
export const CHAIN_STAGGER_WEAK_BONUS = 10;    // 无畏考据：弱点失衡充能 +10（文档"+1"按加档口径实装）
export const CHAIN_CRIT_ADD = 0.06;            // 精算连击
export const CHAIN_HEAL_AMP = 0.25;            // 疗理之学
export const CHAIN_LETHAL_GUARD = 0.2;         // 亡命身法：致命伤 20% 保留 1HP（每场1次）
export const CHAIN_GUARD_COUNTER_ADD = 0.7;    // 守护之勇：格挡反击 +50%→+70%
export const CHAIN_FIRST_TURN_ADD = 0.15;      // 烈焰亮相：首回合伤害加算
export const CHAIN_POISON_MEND = 1;            // 巧手医心：敌中毒期间每回合回 1HP
export const CHAIN_RESONANCE_AMP = 1.3;        // 月下共鸣：共鸣效果 ×1.3

// ── 批3 · 词缀（§5.1）──────────────────────────────────────
export const AFFIX_HP_MULT = 1.3;              // 顽固（生成时应用于 maxHp）
export const AFFIX_CRIT_ADD = 0.1;             // 敏锐
export const AFFIX_VENGEFUL_ATK = 1.15;        // 记仇（everRetreatedDown 时生效）
export const AFFIX_THORNS_PCT = 0.1;           // 荆棘：反弹直接伤害
export const AFFIX_SLIPPERY_FACTOR = 1 / 1.5;  // 湿滑：失衡充能 ×0.67（=条长+50%）
export const AFFIX_GREEDY_SP_MULT = 1.5;       // 贪婪（store 侧结算）

// ── 批4 · 日常闭环（§6）────────────────────────────────────
export const AMMO_ADD_PER_RECORD = 0.04;       // 弹药：今日该属性每条记录 +4%（加算）
export const AMMO_ADD_CAP = 0.12;              // 弹药封顶 +12%（本次登塔有效）
export const LEDGER_WARD_ABSORB = 0.5;         // 结余护壁：吸收一次 Shadow 攻击的 50%（每 session 一次）
export const SPEND_CURSE_MULT = 0.8;           // 物欲缠身：心魔开场受到的伤害 ×0.8
export const SPEND_CURSE_TURNS = 2;            // 物欲缠身持续回合
export const DILIGENCE_STREAK_DAYS = 3;        // 勤勉的光辉：连续记录 3 天得 1 枚
export const DILIGENCE_MAX_CHARGES = 2;        // 持有上限
export const COMPANION_GUARD_CHANCE = 0.35;    // 同伴庇护：致命一击 35% 保留 1HP（每 session 一次）

// ── 批5 · 深渊回廊（§13 批5 / §5.5）────────────────────────
export const ABYSS_RING_FLOORS = 5;            // 每环 5 层直线小图
export const ABYSS_GUARD_BASE_HP = 450;        // 守卫基准 = Lv5 心魔一形态（无二形态）
export const ABYSS_GUARD_HP_GROWTH = 0.05;     // 每环 HP +5%（攻击不涨，词缀补压力）
/** 词缀条数按环带：1-2环→1条 / 3-5→2 / 6-9→3 / 10+→4（cap，验收"叠加不溢出"） */
export function abyssAffixCount(ring: number): number {
  if (ring >= 10) return 4;
  if (ring >= 6) return 3;
  if (ring >= 3) return 2;
  return 1;
}
export function abyssGuardHp(ring: number): number {
  return Math.round(ABYSS_GUARD_BASE_HP * (1 + ABYSS_GUARD_HP_GROWTH * (ring - 1)));
}
export const GOLDEN_NODE_RATE = 0.015;         // 金色回响：任意中间层 mob 节点 1.5% 转金
export const GOLDEN_HP_MULT = 1.1;             // 稀有影 HP = 强敌高段 ×1.1
export const GOLDEN_SP_MULT = 1.5;             // 金色节点 SP 收益 ×1.5

// ── 批3 · 誓约技数值（§10.4，本地定义）─────────────────────
export const OATH_HEAL_PCT = 0.25;             // 深渊之誓
export const OATH_CHARGE_MULT = 2.3;           // 蓄雷之誓
export const OATH_SELF_HP_COST_PCT = 0.1;      // 燃魂之誓：自损10%当前HP（不致死）
export const OATH_POISON_STACKS = 3;           // 蚀影之誓
export const OATH_POISON_DOT = 4;              // 蚀影之誓：每层每回合伤害
export const OATH_SHIELD_PCT = 0.6;            // 铁壁之誓
export const OATH_SP_GAIN = 18;                // 月光之誓（每场1次）
