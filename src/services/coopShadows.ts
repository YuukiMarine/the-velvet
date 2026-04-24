/**
 * 羁绊之影 · 联机暗影狩猎服务层
 *
 * 负责：
 *   - 按月相降临规则自动 spawn（或手动触发）
 *   - 列表 / 读取 / 攻击 / 结算
 *   - 配合 loadSocial 消费 coop_shadow_* 通知
 *
 * 关键不变量：
 *   - 每对 COOP 同一时刻最多 1 个 active coop_shadow
 *   - 每个 user × 每个 coop_shadow × 每个本地日最多 1 次 attack
 *     （PB 唯一索引 (shadow_id, attacker, day) 硬性拦截）
 *   - 共鸣印记 resonance_until / resonance_by 以最后一次 update 为准
 *     （二人同秒攻击的 race 只影响一次加成，不影响正确性）
 *
 * Phase 1：客户端驱动所有业务逻辑；反作弊靠 PB access rules + unique index 兜底。
 */

import type { RecordModel } from 'pocketbase';
import { pb, getUserId } from './pocketbase';
import {
  archetypeById,
  pickArchetypeForBond,
} from '@/constants/coopShadowPool';
import type {
  AttributeId,
  CoopAttack,
  CoopBond,
  CoopMemorialStamp,
  CoopShadow,
  CoopShadowStatus,
  SharedBuffs,
} from '@/types';
import { isMoonPhaseNight } from '@/utils/moonPhase';

// ── 参数区 ────────────────────────────────────────────────

/**
 * 测试期总开关 —— true 则跳过所有降临门槛（月相 / cooldown / 攻击窗口）。
 * 上线前翻成 false。
 */
export const COOP_SHADOW_ALWAYS_OPEN = false;

/** 羁绊之影存活天数 —— 超时自动撤退 */
export const SHADOW_LIFETIME_DAYS = 10;

/** 两次降临之间的冷却（防止每天一只） */
const SPAWN_COOLDOWN_DAYS = 14;

/**
 * COOP 缔结后多少天才能降临第一次 —— 给新 COOP 一个缓冲期
 * 测试期设为 0
 */
const BOND_WARMUP_DAYS = COOP_SHADOW_ALWAYS_OPEN ? 0 : 7;

/** 共鸣印记的有效期 */
const RESONANCE_WINDOW_HOURS = 12;

/** 弱点属性加成 */
const WEAKNESS_DMG_MULTIPLIER = 1.3;

/** 共鸣接力加成 */
const RESONANCE_DMG_MULTIPLIER = 1.5;

/** 奖励常量（直接吃死 user 的需求） */
export const REWARD_ATTR_CAP = 5;       // 属性奖励硬顶
export const REWARD_INTIMACY_CAP = 4;   // 亲密度硬顶
export const REWARD_SP_VICTORY = 10;    // 胜利 SP
export const REWARD_SP_FINISHER = 2;    // 终结者追加 SP
export const REWARD_SP_RETREAT = 3;     // 撤退慰问 SP

// ── Mapper ────────────────────────────────────────────────

function mapCoopShadow(r: RecordModel): CoopShadow {
  const memorial = r.memorial_stamp as CoopMemorialStamp | null | undefined;
  return {
    id: r.id,
    bondId: r.bond_id as string,
    userAId: r.user_a as string,
    userBId: r.user_b as string,
    shadowId: r.shadow_id as string,
    nameOverride: (r.name_override as string | undefined) || undefined,
    spawnedAt: new Date(r.spawned_at as string),
    expiresAt: new Date(r.expires_at as string),
    hpMax: r.hp_max as number,
    hpCurrent: r.hp_current as number,
    status: r.status as CoopShadowStatus,
    weaknessAttribute: r.weakness_attribute as AttributeId,
    resonanceUntil: r.resonance_until ? new Date(r.resonance_until as string) : undefined,
    resonanceBy: (r.resonance_by as string | undefined) || undefined,
    comboCount: typeof r.combo_count === 'number' ? (r.combo_count as number) : 0,
    allOutByA: Boolean(r.all_out_by_a),
    allOutByB: Boolean(r.all_out_by_b),
    identifiedByA: Boolean(r.identified_by_a),
    identifiedByB: Boolean(r.identified_by_b),
    sharedBuffs: (r.shared_buffs as SharedBuffs | null | undefined) || {},
    defeatedAt: r.defeated_at ? new Date(r.defeated_at as string) : undefined,
    memorialStamp: memorial || undefined,
  };
}

/**
 * 按双方 LV 总和阶梯决定 Boss HP。
 *
 * 数值回算逻辑（方便后续调）：
 *   常规命中（弱点 + 共鸣，无暴击，单次 ≈ 50 × 1.3 × 1.5 ≈ 98 伤害）
 *   10 天窗口双方共 ~20 次常规攻击 → 总伤害约 1250
 *   HP 设在"打 6–10 天能结束"的区间
 */
export function computeShadowHpMax(totalSumLevels: number): number {
  if (totalSumLevels <= 15) return 200;
  if (totalSumLevels <= 20) return 300;
  if (totalSumLevels <= 30) return 450;
  return 650;
}

function mapCoopAttack(r: RecordModel): CoopAttack {
  return {
    id: r.id,
    shadowId: r.shadow_id as string,
    attackerId: r.attacker as string,
    day: r.day as string,
    personaId: r.persona_id as string,
    personaName: r.persona_name as string,
    skillKind: r.skill_kind as CoopAttack['skillKind'],
    skillName: r.skill_name as string,
    damageRaw: r.damage_raw as number,
    damageFinal: r.damage_final as number,
    resonanceBonus: Boolean(r.resonance_bonus),
    weaknessBonus: Boolean(r.weakness_bonus),
    counterDamage: r.counter_damage as number,
    createdAt: new Date(r.created as string),
  };
}

// ── 查询 ───────────────────────────────────────────────────

/** 拉取当前登录用户相关的所有 coop_shadows（含 active / defeated / retreated）*/
export const listCoopShadows = async (): Promise<CoopShadow[]> => {
  if (!pb || !pb.authStore.isValid) return [];
  const me = getUserId();
  if (!me) return [];
  const records = await pb.collection('coop_shadows').getFullList({
    filter: `user_a = "${me}" || user_b = "${me}"`,
    sort: '-spawned_at',
    requestKey: null,
  });
  return records.map(mapCoopShadow);
};

/** 拉一只 shadow 的全部攻击事件（按时间倒序） */
export const listAttacksFor = async (shadowId: string): Promise<CoopAttack[]> => {
  if (!pb || !pb.authStore.isValid) return [];
  const records = await pb.collection('coop_attacks').getFullList({
    filter: `shadow_id = "${shadowId}"`,
    sort: '-created',
    requestKey: null,
  });
  return records.map(mapCoopAttack);
};

// ── 降临 ───────────────────────────────────────────────────

/**
 * 判断"这个时间点是否应该给这个 bond 降临一只羁绊之影"。
 *
 * 规则：
 *   1. 测试期（COOP_SHADOW_ALWAYS_OPEN = true）只保留 "没有 active" 这一条，其它全放行
 *   2. 正式：
 *      - 当天必须是月相之夜（isMoonPhaseNight）
 *      - bond 必须 linked 且已过 BOND_WARMUP_DAYS
 *      - bond 没有 active coop_shadow
 *      - 距离最近一次 coop_shadow（任意状态）≥ SPAWN_COOLDOWN_DAYS
 */
function shouldSpawn(
  bond: CoopBond,
  existingShadows: CoopShadow[],
  now: Date,
): boolean {
  if (bond.status !== 'linked') return false;
  const bondShadows = existingShadows.filter(s => s.bondId === bond.id);
  const hasActive = bondShadows.some(s => s.status === 'active');
  if (hasActive) return false;
  if (COOP_SHADOW_ALWAYS_OPEN) return true;

  // 正式规则：月相之夜 + cooldown + warmup
  if (!isMoonPhaseNight(now)) return false;
  if (bond.createdAt) {
    const ageMs = now.getTime() - bond.createdAt.getTime();
    if (ageMs < BOND_WARMUP_DAYS * 86400 * 1000) return false;
  }
  if (bondShadows.length > 0) {
    const latest = bondShadows[0]; // sort -spawned_at
    const elapsed = now.getTime() - latest.spawnedAt.getTime();
    if (elapsed < SPAWN_COOLDOWN_DAYS * 86400 * 1000) return false;
  }
  return true;
}

/**
 * 降临一只新羁绊之影并创建 PB 记录。
 * 失败抛错；上层（social pipeline）会 catch + 下次 loadSocial 重试。
 *
 * hp_max 由双方属性等级之和决定，保证 scale 随玩家成长：
 *   hp_max = (ΣLv_A + ΣLv_B) × archetype.hpFactor + 500
 * 由于 spawn 时不一定能拿到对方的属性，这里用 bond.otherProfile.totalLv + 我方的 totalLv
 */
export const spawnCoopShadow = async (
  bond: CoopBond,
  mySumLevels: number,
): Promise<CoopShadow> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');

  const archetype = pickArchetypeForBond(bond.id);
  const partnerSumLevels = bond.otherProfile?.totalLv ?? 10; // 兜底
  const hpMax = computeShadowHpMax(mySumLevels + partnerSumLevels);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SHADOW_LIFETIME_DAYS * 86400 * 1000);
  // 同一个 archetype 从两个候选名里随机抽一个 —— 同对 COOP 每次降临可能是不同名字
  const pickedName = archetype.names[Math.floor(Math.random() * archetype.names.length)];

  const created = await pb.collection('coop_shadows').create({
    bond_id: bond.id,
    user_a: bond.userAId,
    user_b: bond.userBId,
    shadow_id: archetype.id,
    name_override: pickedName,
    spawned_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    hp_max: hpMax,
    hp_current: hpMax,
    status: 'active',
    weakness_attribute: archetype.weakness,
    combo_count: 0,
    all_out_by_a: false,
    all_out_by_b: false,
    identified_by_a: false,
    identified_by_b: false,
  });

  // 通知对方 Boss 降临
  const partnerId = bond.userAId === me ? bond.userBId : bond.userAId;
  try {
    await pb.collection('notifications').create({
      user: partnerId,
      type: 'coop_shadow_spawned',
      from: me,
      payload: { shadow_id: created.id, archetype_id: archetype.id },
      read: false,
    });
  } catch (err) {
    console.warn('[velvet-coopShadows] spawn notification failed', err);
  }

  return mapCoopShadow(created);
};

/**
 * 为所有 linked 的 bond 逐一检查是否需要降临。
 * 通常在 loadSocial 的 coop pipeline 里调用。
 */
export const maybeSpawnForBonds = async (
  bonds: CoopBond[],
  existingShadows: CoopShadow[],
  mySumLevels: number,
): Promise<CoopShadow[]> => {
  const now = new Date();
  const newShadows: CoopShadow[] = [];
  for (const bond of bonds) {
    if (!shouldSpawn(bond, existingShadows, now)) continue;
    try {
      const s = await spawnCoopShadow(bond, mySumLevels);
      newShadows.push(s);
    } catch (err) {
      console.warn('[velvet-coopShadows] spawn failed for bond', bond.id, err);
    }
  }
  return newShadows;
};

// ── 识破 ───────────────────────────────────────────────────

/**
 * 登记一次"识破"。
 * - 如果自己已经识破过了 → 幂等（静默返回当前记录）
 * - 识破后同时发通知给对方（让对方的红点更新）
 * - 双方都识破后，攻击路径才会真正可用（由前端面板判定）
 */
export const identifyShadow = async (shadow: CoopShadow): Promise<CoopShadow> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  if (shadow.status !== 'active') throw new Error('这只羁绊之影已经不在战斗中');

  const iAmA = shadow.userAId === me;
  const alreadyIdentified = iAmA ? shadow.identifiedByA : shadow.identifiedByB;
  if (alreadyIdentified) return shadow;

  const patch = { [iAmA ? 'identified_by_a' : 'identified_by_b']: true };
  const updated = await pb.collection('coop_shadows').update(shadow.id, patch);
  const next = mapCoopShadow(updated);

  // 通知对方 —— 沿用 coop_shadow_attacked 类型（前端显示"对方已识破"）
  // 不想新增一种通知 type 污染 NotificationType；payload.event='identify' 区分
  const partnerId = shadow.userAId === me ? shadow.userBId : shadow.userAId;
  try {
    await pb.collection('notifications').create({
      user: partnerId,
      type: 'coop_shadow_spawned', // 复用 —— 对方看到的语义是"有新动作"
      from: me,
      payload: { shadow_id: shadow.id, event: 'identify' },
      read: false,
    });
  } catch (err) {
    console.warn('[velvet-coopShadows] identify notification failed', err);
  }

  return next;
};

// ── 攻击 ───────────────────────────────────────────────────

export interface AttackInput {
  shadow: CoopShadow;
  personaId: string;
  personaName: string;
  skillKind: CoopAttack['skillKind'];
  skillName: string;
  skillAttribute: AttributeId;
  damageRaw: number;
}

export interface AttackResult {
  attack: CoopAttack;
  updatedShadow: CoopShadow;
  /** 本次攻击是否命中弱点 */
  weaknessBonus: boolean;
  /** 本次攻击是否吃到共鸣接力加成 */
  resonanceBonus: boolean;
  /** crit 类技能本次是否触发暴击（×2） */
  critTriggered: boolean;
  /** 是 buff / debuff 类 —— 本次不造成伤害，只修改 sharedBuffs */
  isBuffCast: boolean;
  /** 击杀者 = true（hp<=0 且是这次攻击造成的） */
  defeatedNow: boolean;
}

/** attack_up / vulnerability 倍率 */
const BUFF_ATTACK_UP_MULT = 1.2;
const BUFF_VULNERABILITY_MULT = 1.15;
/** 每次 buff 技能延长的回合数，封顶 */
const BUFF_DURATION_INC = 3;
const BUFF_DURATION_CAP = 6;

function isDamagingKind(kind: CoopAttack['skillKind']): boolean {
  // damage / crit / charge / attack_boost 走伤害路径
  // heal 在联机模式里没有血条可回，也不转成伤害 —— 直接在 UI 侧隐藏，不让用户点
  return (
    kind === 'damage'
    || kind === 'crit'
    || kind === 'charge'
    || kind === 'attack_boost'
  );
}

function isUtilityKind(kind: CoopAttack['skillKind']): boolean {
  // buff / debuff → 施加共享 buff；不造成伤害
  return kind === 'buff' || kind === 'debuff';
}

/** 同 kind 不叠加数值，只延长回合数（封顶 BUFF_DURATION_CAP） */
function extendBuff(prev: SharedBuffs, kind: 'attack_up' | 'vulnerability'): SharedBuffs {
  const existing = prev[kind]?.remainingTurns ?? 0;
  return { ...prev, [kind]: { remainingTurns: Math.min(BUFF_DURATION_CAP, existing + BUFF_DURATION_INC) } };
}

/** 每次伤害类攻击结束后 —— 所有 buff 剩余回合 -1；≤0 则移除 */
function tickBuffs(prev: SharedBuffs): SharedBuffs {
  const next: SharedBuffs = {};
  if (prev.attack_up && prev.attack_up.remainingTurns - 1 > 0) {
    next.attack_up = { remainingTurns: prev.attack_up.remainingTurns - 1 };
  }
  if (prev.vulnerability && prev.vulnerability.remainingTurns - 1 > 0) {
    next.vulnerability = { remainingTurns: prev.vulnerability.remainingTurns - 1 };
  }
  return next;
}

/**
 * 对 Boss 发起一次攻击。负责：
 *   1. 计算最终伤害（弱点 × 共鸣加成）
 *   2. 写 coop_attacks 一条（会被 PB 唯一索引拦截每日重复）
 *   3. 更新 coop_shadows：hp_current / resonance_until / resonance_by / status
 *   4. 通知对方（coop_shadow_attacked 或 coop_shadow_defeated）
 *
 * 失败抛错；上层展示 toast + 不回滚本地 battleState（因为攻击记录是否落盘未知）。
 */
export const attackCoopShadow = async (input: AttackInput): Promise<AttackResult> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');

  const { shadow, damageRaw, skillAttribute, skillKind } = input;
  if (shadow.status !== 'active') throw new Error('这只羁绊之影已经不在战斗中');

  const now = new Date();
  const day = toLocalDateKey(now);
  const isUtility = isUtilityKind(skillKind);
  const isDamaging = isDamagingKind(skillKind);

  // 1) 计算最终伤害 / buff 效果
  const weaknessBonus = isDamaging && skillAttribute === shadow.weaknessAttribute;
  const resonanceActive = !!(
    isDamaging
    && shadow.resonanceUntil
    && shadow.resonanceUntil.getTime() > now.getTime()
    && shadow.resonanceBy
    && shadow.resonanceBy !== me
  );
  // crit 技能：50% 翻倍
  const critTriggered = skillKind === 'crit' && Math.random() < 0.5;
  // 读当前共享 buff
  const curBuffs = shadow.sharedBuffs ?? {};
  const attackUpActive = (curBuffs.attack_up?.remainingTurns ?? 0) > 0;
  const vulnerabilityActive = (curBuffs.vulnerability?.remainingTurns ?? 0) > 0;

  let damageFinal = 0;
  if (isDamaging) {
    let multiplier = 1;
    if (weaknessBonus)       multiplier *= WEAKNESS_DMG_MULTIPLIER;
    if (resonanceActive)     multiplier *= RESONANCE_DMG_MULTIPLIER;
    if (critTriggered)       multiplier *= 2;
    if (attackUpActive)      multiplier *= BUFF_ATTACK_UP_MULT;
    if (vulnerabilityActive) multiplier *= BUFF_VULNERABILITY_MULT;
    damageFinal = Math.round(damageRaw * multiplier);
  }

  // 2) 写 coop_attacks（buff/debuff 也要写，只是 damage_final = 0，对方日志可见）
  let attackRec: RecordModel;
  try {
    attackRec = await pb.collection('coop_attacks').create({
      shadow_id: shadow.id,
      attacker: me,
      day,
      persona_id: input.personaId,
      persona_name: input.personaName,
      skill_kind: skillKind,
      skill_name: input.skillName,
      damage_raw: isDamaging ? damageRaw : 0,
      damage_final: damageFinal,
      resonance_bonus: resonanceActive,
      weakness_bonus: weaknessBonus,
      counter_damage: 0,  // 联机模式玩家没有 HP —— 反击伤害作废
    });
  } catch (err) {
    const errWithStatus = err as { status?: number; message?: string };
    if (errWithStatus?.status === 400 && errWithStatus.message?.includes('unique')) {
      throw new Error('今天你已经对这只羁绊之影出过手了，明天再来');
    }
    throw err;
  }

  // 3) 计算 shared_buffs 的下一步状态
  let nextBuffs: SharedBuffs = curBuffs;
  if (isUtility) {
    // buff → 加 attack_up；debuff → 加 vulnerability；同 kind 只延长、不叠加
    if (skillKind === 'buff')    nextBuffs = extendBuff(nextBuffs, 'attack_up');
    if (skillKind === 'debuff')  nextBuffs = extendBuff(nextBuffs, 'vulnerability');
  } else if (isDamaging) {
    // 伤害类：所有 buff 剩余回合 -1
    nextBuffs = tickBuffs(nextBuffs);
  }

  // 4) 更新 coop_shadows
  const hpAfter = Math.max(0, shadow.hpCurrent - damageFinal);
  const defeatedNow = isDamaging && hpAfter === 0;
  const comboAfter = weaknessBonus ? shadow.comboCount + 1 : shadow.comboCount;
  const patch: Record<string, unknown> = {
    hp_current: hpAfter,
    combo_count: comboAfter,
    shared_buffs: nextBuffs,
  };
  // 只有伤害类攻击才更新 resonance 印记（utility 不影响节律）
  if (isDamaging) {
    patch.resonance_until = new Date(now.getTime() + RESONANCE_WINDOW_HOURS * 3600 * 1000).toISOString();
    patch.resonance_by = me;
  }
  if (defeatedNow) {
    patch.status = 'defeated';
    patch.defeated_at = now.toISOString();
    // 写入纪念图章（双方 loadSocial 时都能读到）
    patch.memorial_stamp = buildMemorialStamp(shadow, now, me);
  }
  const updatedRec = await pb.collection('coop_shadows').update(shadow.id, patch);
  const updatedShadow = mapCoopShadow(updatedRec);

  // 4) 通知对方
  const partnerId = shadow.userAId === me ? shadow.userBId : shadow.userAId;
  try {
    await pb.collection('notifications').create({
      user: partnerId,
      type: defeatedNow ? 'coop_shadow_defeated' : 'coop_shadow_attacked',
      from: me,
      payload: {
        shadow_id: shadow.id,
        damage: damageFinal,
        resonance_bonus: resonanceActive,
        weakness_bonus: weaknessBonus,
        persona_name: input.personaName,
        skill_name: input.skillName,
        hp_remaining: hpAfter,
      },
      read: false,
    });
  } catch (err) {
    console.warn('[velvet-coopShadows] attack notification failed', err);
  }

  return {
    attack: mapCoopAttack(attackRec),
    updatedShadow,
    weaknessBonus,
    resonanceBonus: resonanceActive,
    critTriggered,
    isBuffCast: isUtility,
    defeatedNow,
  };
};

// ── 撤退 ───────────────────────────────────────────────────

/**
 * 把已过期但还是 active 的 shadow 转成 retreated。
 * 两个客户端都会 try 写一次；PB 没事务，以最后写入为准。
 */
export const retreatExpiredShadow = async (shadow: CoopShadow): Promise<CoopShadow> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  if (shadow.status !== 'active') return shadow;
  const now = new Date();
  if (now.getTime() < shadow.expiresAt.getTime()) return shadow;
  const updated = await pb.collection('coop_shadows').update(shadow.id, {
    status: 'retreated',
  });
  return mapCoopShadow(updated);
};

// ── 总攻击（All-Out） ─────────────────────────────────────

export interface AllOutAttackInput {
  shadow: CoopShadow;
  personaId: string;
  personaName: string;
  /** 攻击者本地的属性 level 之和 —— 即总攻击的伤害 */
  myTotalLevels: number;
}

export interface AllOutAttackResult {
  attack: CoopAttack;
  updatedShadow: CoopShadow;
  defeatedNow: boolean;
}

/**
 * 释放总攻击（All-Out）。
 *
 * 前提：
 *   - shadow.comboCount ≥ 5
 *   - 我还没用过（allOutByA / allOutByB 对应我的）
 *   - shadow.status = 'active'
 *
 * 规则：
 *   - 伤害 = 我的属性总等级（可粗略理解为"当前的总 LV"）
 *   - 不吃共鸣、不吃弱点加成（已经是一次大招）
 *   - **不占用当日回合数** —— coop_attacks 用 day='allout' 绕开唯一索引
 *   - 用完就把 all_out_by_{a|b} 翻成 true（一位玩家对一只 Boss 只能一次）
 */
export const allOutAttack = async (input: AllOutAttackInput): Promise<AllOutAttackResult> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');

  const { shadow, myTotalLevels } = input;
  if (shadow.status !== 'active') throw new Error('这只羁绊之影已经不在战斗中');
  if (shadow.comboCount < 5) throw new Error('COMBO 未到 5，还不能释放总攻击');

  const iAmA = shadow.userAId === me;
  const alreadyUsed = iAmA ? shadow.allOutByA : shadow.allOutByB;
  if (alreadyUsed) throw new Error('你已经对这只羁绊之影释放过总攻击了');

  const damage = Math.max(1, Math.floor(myTotalLevels));
  const now = new Date();

  // 1) 写 coop_attacks —— day='allout' 是 magic value，绕开每日唯一索引
  let attackRec: RecordModel;
  try {
    attackRec = await pb.collection('coop_attacks').create({
      shadow_id: shadow.id,
      attacker: me,
      day: 'allout',
      persona_id: input.personaId,
      persona_name: input.personaName,
      skill_kind: 'attack_boost',
      skill_name: '总攻击 · ALL-OUT',
      damage_raw: damage,
      damage_final: damage,
      resonance_bonus: false,
      weakness_bonus: false,
      counter_damage: 0,  // 总攻击不吃反击
    });
  } catch (err) {
    throw err;
  }

  // 2) 更新 coop_shadows
  const hpAfter = Math.max(0, shadow.hpCurrent - damage);
  const defeatedNow = hpAfter === 0;
  const patch: Record<string, unknown> = {
    hp_current: hpAfter,
    [iAmA ? 'all_out_by_a' : 'all_out_by_b']: true,
    // 不动 resonance / combo —— 总攻击不影响节律
  };
  if (defeatedNow) {
    patch.status = 'defeated';
    patch.defeated_at = now.toISOString();
    patch.memorial_stamp = buildMemorialStamp(shadow, now, me);
  }
  const updatedRec = await pb.collection('coop_shadows').update(shadow.id, patch);
  const updatedShadow = mapCoopShadow(updatedRec);

  // 3) 通知对方
  const partnerId = shadow.userAId === me ? shadow.userBId : shadow.userAId;
  try {
    await pb.collection('notifications').create({
      user: partnerId,
      type: defeatedNow ? 'coop_shadow_defeated' : 'coop_shadow_attacked',
      from: me,
      payload: {
        shadow_id: shadow.id,
        damage,
        resonance_bonus: false,
        weakness_bonus: false,
        persona_name: input.personaName,
        skill_name: '总攻击 · ALL-OUT',
        all_out: true,
        hp_remaining: hpAfter,
      },
      read: false,
    });
  } catch (err) {
    console.warn('[velvet-coopShadows] allout notification failed', err);
  }

  return {
    attack: mapCoopAttack(attackRec),
    updatedShadow,
    defeatedNow,
  };
};

// ── 纪念图章 ───────────────────────────────────────────────

/**
 * 构造 memorial stamp —— 仅供 "attackCoopShadow 击杀瞬间" 使用，
 * 写入 coop_shadows.memorial_stamp；对方通过 loadSocial 读到。
 */
function buildMemorialStamp(
  shadow: CoopShadow,
  defeatedAt: Date,
  _finisherId: string,
): CoopMemorialStamp {
  const archetype = archetypeById(shadow.shadowId);
  return {
    shadowId: shadow.shadowId,
    shadowName: shadow.nameOverride || archetype?.names?.[0] || '羁绊之影',
    weaknessAttribute: shadow.weaknessAttribute,
    defeatedAt: defeatedAt.toISOString(),
    // winners 的 nickname 由对方客户端在读 memorial 时补全（这里只放 id）
    winners: [
      { userId: shadow.userAId, nickname: '' },
      { userId: shadow.userBId, nickname: '' },
    ],
    // myDamage / totalDamage 由 claimVictoryReward 时各自填入本地副本
    totalDamage: shadow.hpMax,
  };
}

// ── helper ────────────────────────────────────────────────

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
