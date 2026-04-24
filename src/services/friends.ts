/**
 * 好友关系 API —— 包在 PocketBase `friendships` 集合之上。
 *
 * 约定：
 *   - user_a / user_b 按 PB record id 字典序归一化（较小者 = user_a）
 *   - 每个 (user_a, user_b) 对在 DB 里只有一条记录（unique index），
 *     status 在 pending / linked / rejected / severed / expired 之间迁移
 *   - 冷却："拒绝后 3 天" / "解除后 7 天" 分别写在 re_request_after / re_link_after 上
 *   - 过期：pending 状态满 21 天自动视为 expired（客户端兜底，后续可挂 PB JSVM hook）
 */

import type { RecordModel } from 'pocketbase';
import { pb, getUserId } from './pocketbase';
import type { CloudProfile, Friendship, FriendshipStatus } from '@/types';

const FRIEND_REQUEST_TTL_DAYS = 21;
const REJECTED_COOLDOWN_DAYS = 3;
const SEVERED_COOLDOWN_DAYS = 7;

// ── 归一化 / 转换工具 ──────────────────────────────────────────────

/** 两个 id 排序，较小的在前 */
const orderPair = (a: string, b: string): { userA: string; userB: string } =>
  a < b ? { userA: a, userB: b } : { userA: b, userB: a };

/** 从 PB 展开字段里抽一份 CloudProfile 快照 */
const profileFromExpand = (r: RecordModel | undefined | null): CloudProfile | undefined => {
  if (!r) return undefined;
  const avatarField = r.avatar as string | string[] | undefined;
  let avatarUrl: string | undefined;
  if (avatarField && pb) {
    const file = Array.isArray(avatarField) ? avatarField[0] : avatarField;
    if (file) {
      // PB 0.22+ 用 pb.files.getUrl；老版本 pb.getFileUrl
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const any = pb as any;
      avatarUrl = any.files?.getUrl?.(r, file) ?? any.getFileUrl?.(r, file) ?? undefined;
    }
  }
  return {
    id: r.id,
    userId: (r.username as string | undefined) || undefined,
    nickname: (r.nickname as string | undefined) || undefined,
    // email 不再暴露到 CloudProfile —— PII 外泄隐患（PB collection 字段一旦"show in API"，
    // 所有好友互相可见对方账号邮箱）。身份展示统一走 nickname / userId。
    avatarUrl,
    totalLv: typeof r.total_lv === 'number' ? (r.total_lv as number) : undefined,
    attributeNames: (r.attribute_names as Record<string, string> | undefined) || undefined,
    attributeLevels: (r.attribute_levels as Record<string, number> | undefined) || undefined,
    attributePoints: (r.attribute_points as Record<string, number> | undefined) || undefined,
    totalPoints: typeof r.total_points === 'number' ? (r.total_points as number) : undefined,
    unlockedCount: typeof r.unlocked_count === 'number' ? (r.unlocked_count as number) : undefined,
    lastSyncedAt: new Date(),
  };
};

/** 从一条 friendships PB record 转成前端类型 */
const mapFriendship = (r: RecordModel, viewerId: string): Friendship => {
  const userAId = r.user_a as string;
  const userBId = r.user_b as string;
  const expand = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  const otherExpand = viewerId === userAId ? expand.user_b : expand.user_a;
  return {
    id: r.id,
    userAId,
    userBId,
    initiatorId: r.initiator as string,
    status: r.status as FriendshipStatus,
    message: (r.message as string | undefined) || undefined,
    expiresAt: r.expires_at ? new Date(r.expires_at as string) : undefined,
    respondedAt: r.responded_at ? new Date(r.responded_at as string) : undefined,
    reRequestAfter: r.re_request_after ? new Date(r.re_request_after as string) : undefined,
    reLinkAfter: r.re_link_after ? new Date(r.re_link_after as string) : undefined,
    createdAt: new Date(r.created as string),
    updatedAt: new Date(r.updated as string),
    otherProfile: profileFromExpand(otherExpand),
  };
};

// ── 搜索 ───────────────────────────────────────────────────────────

/**
 * 按 UserID（username）精确查找用户。返回 null = 没找到。
 * 不可用于模糊搜索（刻意减少被扫号的风险）。
 */
export const searchUserByUserId = async (userId: string): Promise<CloudProfile | null> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const normalized = userId.trim().toLowerCase();
  if (!normalized) return null;
  try {
    const record = await pb.collection('users').getFirstListItem(
      `username = "${escapePbString(normalized)}"`,
      { requestKey: null },  // 避免 strict-mode 双触发 / 用户快速重搜时被 autocancel
    );
    return profileFromExpand(record) ?? null;
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
};

/** PB filter 字符串需要转义双引号 */
const escapePbString = (s: string): string => s.replace(/"/g, '\\"');

// ── 读好友列表 ──────────────────────────────────────────────────

/** 拉取当前登录用户的全部好友关系（含 pending / linked / rejected / severed 等） */
export const listFriendships = async (): Promise<Friendship[]> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  const records = await pb.collection('friendships').getFullList({
    filter: `user_a = "${me}" || user_b = "${me}"`,
    expand: 'user_a,user_b,initiator',
    sort: '-updated',
    requestKey: null,
  });
  return records.map(r => mapFriendship(r, me));
};

// ── 发起 / 响应好友申请 ─────────────────────────────────────────

/** 根据归一化后的对 (userA, userB) 查已有记录（用于判断重发 / 冷却） */
const findExistingFriendship = async (
  userA: string,
  userB: string,
): Promise<RecordModel | null> => {
  if (!pb) return null;
  try {
    return await pb.collection('friendships').getFirstListItem(
      `user_a = "${userA}" && user_b = "${userB}"`,
      { requestKey: null },  // 并发 sendFriendRequest 时避免被 autocancel
    );
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
};

export interface SendFriendRequestInput {
  targetUserId: string;  // 对方的 PB user.id（通过 searchUserByUserId 拿到）
  message?: string;
}

/**
 * 发起好友申请。
 *
 * 处理以下情况：
 *  - 双方同一人 → 抛错
 *  - 已经 linked → 抛错
 *  - 已有 pending → 抛错（等对方响应，不允许重发）
 *  - rejected 且 re_request_after 未到 → 抛错（3 天冷却）
 *  - severed 且 re_link_after 未到 → 抛错（7 天冷却）
 *  - 以上检查都过：update 回 pending / create 新记录
 */
export const sendFriendRequest = async (input: SendFriendRequestInput): Promise<Friendship> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  const target = input.targetUserId.trim();
  if (!target) throw new Error('对方信息缺失');
  if (target === me) throw new Error('不能向自己发起申请');

  const { userA, userB } = orderPair(me, target);
  const now = new Date();
  const existing = await findExistingFriendship(userA, userB);

  if (existing) {
    const status = existing.status as FriendshipStatus;
    if (status === 'linked') throw new Error('已经是好友了');
    if (status === 'pending') throw new Error('已经发过申请，等对方响应吧');

    // 检查冷却
    if (status === 'rejected') {
      const reReqAfter = existing.re_request_after as string | undefined;
      if (reReqAfter && new Date(reReqAfter).getTime() > now.getTime()) {
        const daysLeft = Math.ceil(
          (new Date(reReqAfter).getTime() - now.getTime()) / 86400000,
        );
        throw new Error(`对方拒绝过申请，请在 ${daysLeft} 天后再来`);
      }
    }
    if (status === 'severed') {
      const reLinkAfter = existing.re_link_after as string | undefined;
      if (reLinkAfter && new Date(reLinkAfter).getTime() > now.getTime()) {
        const daysLeft = Math.ceil(
          (new Date(reLinkAfter).getTime() - now.getTime()) / 86400000,
        );
        throw new Error(`此前已解除关系，请在 ${daysLeft} 天后再来`);
      }
    }

    // 冷却过了 / 过期了 / 之前被拒绝但现在可以再发 → 把记录复用，回到 pending
    const updated = await pb.collection('friendships').update(existing.id, {
      status: 'pending',
      initiator: me,
      message: input.message?.slice(0, 200) || '',
      expires_at: new Date(now.getTime() + FRIEND_REQUEST_TTL_DAYS * 86400000).toISOString(),
      responded_at: null,
      re_request_after: null,
      re_link_after: null,
    }, { expand: 'user_a,user_b,initiator' });
    // 创建通知
    await createFriendRequestNotification(target, updated.id, input.message);
    return mapFriendship(updated, me);
  }

  // 全新关系
  const created = await pb.collection('friendships').create({
    user_a: userA,
    user_b: userB,
    initiator: me,
    status: 'pending',
    message: input.message?.slice(0, 200) || '',
    expires_at: new Date(now.getTime() + FRIEND_REQUEST_TTL_DAYS * 86400000).toISOString(),
  }, { expand: 'user_a,user_b,initiator' });
  await createFriendRequestNotification(target, created.id, input.message);
  return mapFriendship(created, me);
};

/** 在对方的 notifications 里插一条 friend_request */
const createFriendRequestNotification = async (
  targetUserId: string,
  friendshipId: string,
  message?: string,
): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;
  const me = getUserId();
  if (!me) return;
  try {
    await pb.collection('notifications').create({
      user: targetUserId,
      type: 'friend_request',
      from: me,
      payload: {
        friendship_id: friendshipId,
        message: message?.slice(0, 200) || '',
      },
      read: false,
    });
  } catch (err) {
    // 通知失败不影响主流程（对方下次拉 friendships 也能看到 pending）
    console.warn('[velvet-friends] failed to create request notification', err);
  }
};

/** 接受好友申请 */
export const acceptFriendRequest = async (friendshipId: string): Promise<Friendship> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  const now = new Date();
  const updated = await pb.collection('friendships').update(friendshipId, {
    status: 'linked',
    responded_at: now.toISOString(),
    expires_at: null,
  }, { expand: 'user_a,user_b,initiator' });

  // 给申请发起人发"已接受"通知
  const initiator = updated.initiator as string;
  if (initiator && initiator !== me) {
    try {
      await pb.collection('notifications').create({
        user: initiator,
        type: 'friend_accepted',
        from: me,
        payload: { friendship_id: friendshipId },
        read: false,
      });
    } catch (err) {
      console.warn('[velvet-friends] failed to create accepted notification', err);
    }
  }
  return mapFriendship(updated, me);
};

/** 拒绝好友申请（触发 3 天冷却） */
export const rejectFriendRequest = async (friendshipId: string): Promise<Friendship> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  const now = new Date();
  const reRequestAfter = new Date(now.getTime() + REJECTED_COOLDOWN_DAYS * 86400000);
  const updated = await pb.collection('friendships').update(friendshipId, {
    status: 'rejected',
    responded_at: now.toISOString(),
    re_request_after: reRequestAfter.toISOString(),
    expires_at: null,
  }, { expand: 'user_a,user_b,initiator' });

  const initiator = updated.initiator as string;
  if (initiator && initiator !== me) {
    try {
      await pb.collection('notifications').create({
        user: initiator,
        type: 'friend_rejected',
        from: me,
        payload: { friendship_id: friendshipId },
        read: false,
      });
    } catch (err) {
      console.warn('[velvet-friends] failed to create rejected notification', err);
    }
  }
  return mapFriendship(updated, me);
};

/** 解除已建立的好友关系（触发 7 天冷却） */
export const severFriendship = async (friendshipId: string): Promise<Friendship> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  const now = new Date();
  const reLinkAfter = new Date(now.getTime() + SEVERED_COOLDOWN_DAYS * 86400000);
  const updated = await pb.collection('friendships').update(friendshipId, {
    status: 'severed',
    responded_at: now.toISOString(),
    re_link_after: reLinkAfter.toISOString(),
  }, { expand: 'user_a,user_b,initiator' });

  // 给对方发解除通知
  const other = (updated.user_a as string) === me ? (updated.user_b as string) : (updated.user_a as string);
  if (other && other !== me) {
    try {
      await pb.collection('notifications').create({
        user: other,
        type: 'coop_severed',
        from: me,
        payload: { friendship_id: friendshipId },
        read: false,
      });
    } catch (err) {
      console.warn('[velvet-friends] failed to create severed notification', err);
    }
  }
  return mapFriendship(updated, me);
};

// ── 过期检查（客户端兜底）──────────────────────────────────────

/**
 * 把超过 21 天的 pending 关系标成 expired。
 * 以本地登录者的视角执行（只能改自己相关的记录）。
 * 调用时机建议：每次 loadSocial 之后跑一次。
 */
export const expireOutdatedPending = async (friendships: Friendship[]): Promise<number> => {
  if (!pb || !pb.authStore.isValid) return 0;
  const now = Date.now();
  let changed = 0;
  for (const f of friendships) {
    if (f.status !== 'pending') continue;
    if (!f.expiresAt) continue;
    if (f.expiresAt.getTime() > now) continue;
    try {
      await pb.collection('friendships').update(f.id, {
        status: 'expired',
        expires_at: null,
      });
      changed += 1;
    } catch (err) {
      console.warn('[velvet-friends] failed to mark expired', f.id, err);
    }
  }
  return changed;
};
