/**
 * COOP 契约（CoopBond）—— 把一对已 linked 好友升级为"在线同伴"的羁绊。
 *
 * PB 集合 `coop_bonds` schema（需要用户在 PB Admin 手动建立）：
 *   user_a                relation → users    required   cascade-delete
 *   user_b                relation → users    required   cascade-delete
 *   initiator             relation → users    required
 *   status                text                required   (pending|linked|rejected|severed|expired)
 *   arcana_a_id           text
 *   arcana_a_orientation  text                            (upright|reversed)
 *   arcana_b_id           text
 *   arcana_b_orientation  text
 *   intimacy_a_level      number (1-10)                   ⟵ v2 新增
 *   intimacy_b_level      number (1-10)                   ⟵ v2 新增
 *   skill_attribute_a     text   (knowledge|guts|...)     ⟵ v2 新增
 *   skill_attribute_b     text                            ⟵ v2 新增
 *   decay_a               bool                            ⟵ v3 新增
 *   decay_b               bool                            ⟵ v3 新增
 *   message_a             text
 *   message_b             text
 *   expires_at            date
 *   responded_at          date
 *   re_request_after      date
 *   re_link_after         date
 *
 *   Unique index: (user_a, user_b)  —— 同一对用户只允许一条活跃 bond
 *   List/View rule:  @request.auth.id = user_a || @request.auth.id = user_b
 *   Create rule:     @request.auth.id = initiator && (@request.auth.id = user_a || @request.auth.id = user_b)
 *   Update rule:     @request.auth.id = user_a || @request.auth.id = user_b
 *   Delete rule:     （留空；不提供硬删除）
 */

import type { RecordModel } from 'pocketbase';
import { pb, getUserId } from './pocketbase';
import type { AttributeId, CloudProfile, CoopBond, CoopBondStatus, TarotOrientation } from '@/types';

export const COOP_PROPOSAL_TTL_DAYS = 14;
export const COOP_REJECT_COOLDOWN_DAYS = 3;
export const COOP_SEVER_COOLDOWN_DAYS = 7;

// ── 转换 ─────────────────────────────────────────────────────────

const profileFromRecord = (r: RecordModel | undefined | null): CloudProfile | undefined => {
  if (!r) return undefined;
  const avatarField = r.avatar as string | string[] | undefined;
  let avatarUrl: string | undefined;
  if (avatarField && pb) {
    const file = Array.isArray(avatarField) ? avatarField[0] : avatarField;
    if (file) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const any = pb as any;
      avatarUrl = any.files?.getUrl?.(r, file) ?? any.getFileUrl?.(r, file) ?? undefined;
    }
  }
  return {
    id: r.id,
    userId: (r.username as string | undefined) || undefined,
    nickname: (r.nickname as string | undefined) || undefined,
    avatarUrl,
    totalLv: typeof r.total_lv === 'number' ? (r.total_lv as number) : undefined,
    attributeNames: (r.attribute_names as Record<string, string> | undefined) || undefined,
    attributeLevels: (r.attribute_levels as Record<string, number> | undefined) || undefined,
    attributeLevelTitles: (r.attribute_level_titles as Record<string, string[]> | undefined) || undefined,
    attributePoints: (r.attribute_points as Record<string, number> | undefined) || undefined,
    totalPoints: typeof r.total_points === 'number' ? (r.total_points as number) : undefined,
    unlockedCount: typeof r.unlocked_count === 'number' ? (r.unlocked_count as number) : undefined,
    lastSyncedAt: new Date(),
  };
};

const mapBond = (r: RecordModel, viewerId: string): CoopBond => {
  const userAId = r.user_a as string;
  const userBId = r.user_b as string;
  const expand = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  const otherExpand = viewerId === userAId ? expand.user_b : expand.user_a;
  const intimacyA = typeof r.intimacy_a_level === 'number' ? (r.intimacy_a_level as number) : undefined;
  const intimacyB = typeof r.intimacy_b_level === 'number' ? (r.intimacy_b_level as number) : undefined;
  return {
    id: r.id,
    userAId,
    userBId,
    initiatorId: r.initiator as string,
    status: r.status as CoopBondStatus,
    arcanaAId: (r.arcana_a_id as string | undefined) || undefined,
    arcanaAOrientation: (r.arcana_a_orientation as TarotOrientation | undefined) || undefined,
    arcanaBId: (r.arcana_b_id as string | undefined) || undefined,
    arcanaBOrientation: (r.arcana_b_orientation as TarotOrientation | undefined) || undefined,
    intimacyALevel: intimacyA,
    intimacyBLevel: intimacyB,
    skillAttributeA: (r.skill_attribute_a as AttributeId | undefined) || undefined,
    skillAttributeB: (r.skill_attribute_b as AttributeId | undefined) || undefined,
    decayA: typeof r.decay_a === 'boolean' ? r.decay_a as boolean : undefined,
    decayB: typeof r.decay_b === 'boolean' ? r.decay_b as boolean : undefined,
    messageA: (r.message_a as string | undefined) || undefined,
    messageB: (r.message_b as string | undefined) || undefined,
    expiresAt: r.expires_at ? new Date(r.expires_at as string) : undefined,
    respondedAt: r.responded_at ? new Date(r.responded_at as string) : undefined,
    reRequestAfter: r.re_request_after ? new Date(r.re_request_after as string) : undefined,
    reLinkAfter: r.re_link_after ? new Date(r.re_link_after as string) : undefined,
    createdAt: new Date(r.created as string),
    updatedAt: new Date(r.updated as string),
    otherProfile: profileFromRecord(otherExpand),
  };
};

const orderPair = (a: string, b: string) => (a < b ? { userA: a, userB: b } : { userA: b, userB: a });

// ── 读 ────────────────────────────────────────────────────────────

export const listCoopBonds = async (): Promise<CoopBond[]> => {
  if (!pb || !pb.authStore.isValid) return [];
  const me = getUserId();
  if (!me) return [];
  try {
    const records = await pb.collection('coop_bonds').getFullList({
      filter: `user_a = "${me}" || user_b = "${me}"`,
      expand: 'user_a,user_b,initiator',
      sort: '-updated',
      requestKey: null,
    });
    return records.map(r => mapBond(r, me));
  } catch (err) {
    console.warn('[velvet-coop] listCoopBonds failed', err);
    return [];
  }
};

const findExistingBond = async (
  userA: string,
  userB: string,
): Promise<RecordModel | null> => {
  if (!pb) return null;
  try {
    return await pb.collection('coop_bonds').getFirstListItem(
      `user_a = "${userA}" && user_b = "${userB}"`,
      { requestKey: null },  // 并发 proposeCoopBond / acceptCoopBond 时避免被 autocancel
    );
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
};

// ── 写 ────────────────────────────────────────────────────────────

export interface ProposeCoopBondInput {
  targetUserId: string;
  arcanaId: string;
  orientation: TarotOrientation;
  /** 发起方期望的初始亲密度（1-10） */
  intimacyLevel: number;
  /** 发起方希望的能力加成属性 */
  skillAttribute: AttributeId;
  message?: string;
}

/**
 * 发起 COOP 契约提议。
 *
 * - 已经 linked  → 抛错
 * - 已有 pending → 抛错
 * - rejected / severed 且冷却未过 → 抛错
 * - 其他 → update 现有记录回 pending / 新建记录
 */
export const proposeCoopBond = async (input: ProposeCoopBondInput): Promise<CoopBond> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  const target = input.targetUserId.trim();
  if (!target) throw new Error('对方信息缺失');
  if (target === me) throw new Error('不能对自己发起 COOP');

  const { userA, userB } = orderPair(me, target);
  const now = new Date();
  const existing = await findExistingBond(userA, userB);

  const iAmA = me === userA;
  const arcanaField = iAmA ? 'arcana_a_id' : 'arcana_b_id';
  const orientField = iAmA ? 'arcana_a_orientation' : 'arcana_b_orientation';
  const messageField = iAmA ? 'message_a' : 'message_b';
  const intimacyField = iAmA ? 'intimacy_a_level' : 'intimacy_b_level';
  const skillAttrField = iAmA ? 'skill_attribute_a' : 'skill_attribute_b';
  const clampedIntimacy = Math.max(1, Math.min(10, Math.floor(input.intimacyLevel || 1)));

  if (existing) {
    const status = existing.status as CoopBondStatus;
    if (status === 'linked') throw new Error('你们已经建立了 COOP');
    if (status === 'pending') throw new Error('已发出提议，等对方响应吧');
    if (status === 'rejected') {
      const reReqAfter = existing.re_request_after as string | undefined;
      if (reReqAfter && new Date(reReqAfter).getTime() > now.getTime()) {
        const daysLeft = Math.ceil((new Date(reReqAfter).getTime() - now.getTime()) / 86400000);
        throw new Error(`对方拒绝过这次提议，请在 ${daysLeft} 天后再试`);
      }
    }
    if (status === 'severed') {
      const reLinkAfter = existing.re_link_after as string | undefined;
      if (reLinkAfter && new Date(reLinkAfter).getTime() > now.getTime()) {
        const daysLeft = Math.ceil((new Date(reLinkAfter).getTime() - now.getTime()) / 86400000);
        throw new Error(`此前曾解除 COOP，请在 ${daysLeft} 天后再试`);
      }
    }

    const updated = await pb.collection('coop_bonds').update(existing.id, {
      status: 'pending',
      initiator: me,
      [arcanaField]: input.arcanaId,
      [orientField]: input.orientation,
      [intimacyField]: clampedIntimacy,
      [skillAttrField]: input.skillAttribute,
      // 清掉对面的旧提议（假设重新发起是干净的）
      ...(iAmA
        ? { arcana_b_id: '', arcana_b_orientation: '', message_b: '', intimacy_b_level: null, skill_attribute_b: '' }
        : { arcana_a_id: '', arcana_a_orientation: '', message_a: '', intimacy_a_level: null, skill_attribute_a: '' }),
      [messageField]: input.message?.slice(0, 200) || '',
      expires_at: new Date(now.getTime() + COOP_PROPOSAL_TTL_DAYS * 86400000).toISOString(),
      responded_at: null,
      re_request_after: null,
      re_link_after: null,
    }, { expand: 'user_a,user_b,initiator' });

    await createCoopNotification(target, 'coop_proposal', updated.id, input.message);
    return mapBond(updated, me);
  }

  const created = await pb.collection('coop_bonds').create({
    user_a: userA,
    user_b: userB,
    initiator: me,
    status: 'pending',
    [arcanaField]: input.arcanaId,
    [orientField]: input.orientation,
    [intimacyField]: clampedIntimacy,
    [skillAttrField]: input.skillAttribute,
    [messageField]: input.message?.slice(0, 200) || '',
    expires_at: new Date(now.getTime() + COOP_PROPOSAL_TTL_DAYS * 86400000).toISOString(),
  }, { expand: 'user_a,user_b,initiator' });
  await createCoopNotification(target, 'coop_proposal', created.id, input.message);
  return mapBond(created, me);
};

export interface AcceptCoopBondInput {
  bondId: string;
  arcanaId: string;
  orientation: TarotOrientation;
  intimacyLevel: number;
  skillAttribute: AttributeId;
  message?: string;
}

/** 对方接受 COOP 提议：写入接受方的 arcana，并转为 linked */
export const acceptCoopBond = async (input: AcceptCoopBondInput): Promise<CoopBond> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');

  const record = await pb.collection('coop_bonds').getOne(input.bondId);
  if (record.status !== 'pending') throw new Error('此提议已失效或已被响应');
  const iAmA = (record.user_a as string) === me;
  const arcanaField = iAmA ? 'arcana_a_id' : 'arcana_b_id';
  const orientField = iAmA ? 'arcana_a_orientation' : 'arcana_b_orientation';
  const messageField = iAmA ? 'message_a' : 'message_b';
  const intimacyField = iAmA ? 'intimacy_a_level' : 'intimacy_b_level';
  const skillAttrField = iAmA ? 'skill_attribute_a' : 'skill_attribute_b';
  const clampedIntimacy = Math.max(1, Math.min(10, Math.floor(input.intimacyLevel || 1)));

  const updated = await pb.collection('coop_bonds').update(input.bondId, {
    status: 'linked',
    [arcanaField]: input.arcanaId,
    [orientField]: input.orientation,
    [intimacyField]: clampedIntimacy,
    [skillAttrField]: input.skillAttribute,
    [messageField]: input.message?.slice(0, 200) || '',
    responded_at: new Date().toISOString(),
    expires_at: null,
  }, { expand: 'user_a,user_b,initiator' });

  const initiator = updated.initiator as string;
  if (initiator && initiator !== me) {
    await createCoopNotification(initiator, 'coop_accepted', updated.id);
  }
  return mapBond(updated, me);
};

/**
 * 拒绝 COOP 提议（3 天冷却）
 *
 * 服务端二次校验：只有 status='pending' 才能被拒，避免 accept 后误操作让 bond 退回 rejected。
 */
export const rejectCoopBond = async (bondId: string): Promise<CoopBond> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');

  const record = await pb.collection('coop_bonds').getOne(bondId);
  if (record.status !== 'pending') throw new Error('此提议已响应或失效，无法再拒绝');

  const now = new Date();
  const updated = await pb.collection('coop_bonds').update(bondId, {
    status: 'rejected',
    responded_at: now.toISOString(),
    re_request_after: new Date(now.getTime() + COOP_REJECT_COOLDOWN_DAYS * 86400000).toISOString(),
    expires_at: null,
  }, { expand: 'user_a,user_b,initiator' });

  const initiator = updated.initiator as string;
  if (initiator && initiator !== me) {
    await createCoopNotification(initiator, 'coop_rejected', updated.id);
  }
  return mapBond(updated, me);
};

/** 解除已建立的 COOP（7 天冷却） */
export const severCoopBond = async (bondId: string): Promise<CoopBond> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');

  const now = new Date();
  const updated = await pb.collection('coop_bonds').update(bondId, {
    status: 'severed',
    responded_at: now.toISOString(),
    re_link_after: new Date(now.getTime() + COOP_SEVER_COOLDOWN_DAYS * 86400000).toISOString(),
  }, { expand: 'user_a,user_b,initiator' });

  const other = (updated.user_a as string) === me ? (updated.user_b as string) : (updated.user_a as string);
  if (other && other !== me) {
    await createCoopNotification(other, 'coop_severed', updated.id);
  }
  return mapBond(updated, me);
};

// ── 通知 ─────────────────────────────────────────────────────────

const createCoopNotification = async (
  targetUserId: string,
  type: 'coop_proposal' | 'coop_accepted' | 'coop_rejected' | 'coop_severed',
  bondId: string,
  message?: string,
): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;
  const me = getUserId();
  if (!me) return;
  try {
    await pb.collection('notifications').create({
      user: targetUserId,
      type,
      from: me,
      payload: {
        coop_bond_id: bondId,
        message: message?.slice(0, 200) || '',
      },
      read: false,
    });
  } catch (err) {
    console.warn('[velvet-coop] createNotification failed', err);
  }
};

// ── 过期兜底 ─────────────────────────────────────────────────

export const expireOutdatedCoopPending = async (bonds: CoopBond[]): Promise<number> => {
  if (!pb || !pb.authStore.isValid) return 0;
  const now = Date.now();
  let changed = 0;
  for (const b of bonds) {
    if (b.status !== 'pending' || !b.expiresAt) continue;
    if (b.expiresAt.getTime() > now) continue;
    try {
      await pb.collection('coop_bonds').update(b.id, {
        status: 'expired',
        expires_at: null,
      });
      changed += 1;
    } catch (err) {
      console.warn('[velvet-coop] mark expired failed', b.id, err);
    }
  }
  return changed;
};

// ── 工具：给定一方视角取出 "我" / "对方" 的 arcana ───────────

export interface MySideView {
  myArcanaId?: string;
  myArcanaOrientation?: TarotOrientation;
  myMessage?: string;
  myIntimacy?: number;
  mySkillAttribute?: AttributeId;
  theirArcanaId?: string;
  theirArcanaOrientation?: TarotOrientation;
  theirMessage?: string;
  theirIntimacy?: number;
  theirSkillAttribute?: AttributeId;
  iAmInitiator: boolean;
}

export const viewFromMySide = (bond: CoopBond, me: string): MySideView => {
  const iAmA = bond.userAId === me;
  return {
    myArcanaId: iAmA ? bond.arcanaAId : bond.arcanaBId,
    myArcanaOrientation: iAmA ? bond.arcanaAOrientation : bond.arcanaBOrientation,
    myMessage: iAmA ? bond.messageA : bond.messageB,
    myIntimacy: iAmA ? bond.intimacyALevel : bond.intimacyBLevel,
    mySkillAttribute: iAmA ? bond.skillAttributeA : bond.skillAttributeB,
    theirArcanaId: iAmA ? bond.arcanaBId : bond.arcanaAId,
    theirArcanaOrientation: iAmA ? bond.arcanaBOrientation : bond.arcanaAOrientation,
    theirMessage: iAmA ? bond.messageB : bond.messageA,
    theirIntimacy: iAmA ? bond.intimacyBLevel : bond.intimacyALevel,
    theirSkillAttribute: iAmA ? bond.skillAttributeB : bond.skillAttributeA,
    iAmInitiator: bond.initiatorId === me,
  };
};

/**
 * 设置我这一侧对此 COOP 的"逆流"开关 —— 写到 bond.decay_a 或 decay_b。
 * 任何状态都允许写（pending / linked 都可以）；
 * 真正决定衰减是否发生看 bothSidesAgreeOnDecay()
 */
export const setCoopDecayPreference = async (bondId: string, enabled: boolean): Promise<CoopBond> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  const record = await pb.collection('coop_bonds').getOne(bondId);
  const iAmA = (record.user_a as string) === me;
  const field = iAmA ? 'decay_a' : 'decay_b';
  const updated = await pb.collection('coop_bonds').update(bondId, {
    [field]: enabled,
  }, { expand: 'user_a,user_b,initiator' });
  return mapBond(updated, me);
};

/** 双方是否都开启了"逆流"。任意一方未开 → false */
export const bothSidesAgreeOnDecay = (bond: CoopBond): boolean => {
  return bond.decayA === true && bond.decayB === true;
};

/**
 * 聚合两侧的初始 LV：都有 → 取 floor((a+b)/2)；只有一侧 → 取那侧；都没 → 1。
 */
export const resolveCoopInitialIntimacy = (bond: CoopBond): number => {
  const a = bond.intimacyALevel;
  const b = bond.intimacyBLevel;
  if (a && b) return Math.max(1, Math.min(10, Math.floor((a + b) / 2)));
  if (a) return Math.max(1, Math.min(10, a));
  if (b) return Math.max(1, Math.min(10, b));
  return 1;
};
