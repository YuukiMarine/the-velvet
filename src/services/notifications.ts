/**
 * 通知列表 API —— 包在 PocketBase `notifications` 集合之上。
 *
 * 每条通知只对收件人可见；收件人可以读 / 标记已读 / 删除。
 * 发送通知的创建逻辑在 `services/friends.ts` 等业务流程里，不在这里暴露。
 */

import type { RecordModel } from 'pocketbase';
import { pb, getUserId } from './pocketbase';
import { parseGoalSnapshot, parseProfileStatus } from '@/utils/profilePresence';
import type { CloudProfile, NotificationEntry, NotificationType } from '@/types';

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
    // 难度档（R19）：PB 上可能还没这个字段，缺了就是 undefined = 不特殊标记
    levelDifficulty: r.level_difficulty === 'hard' || r.level_difficulty === 'easy'
      ? (r.level_difficulty as 'hard' | 'easy')
      : undefined,
    attributeNames: (r.attribute_names as Record<string, string> | undefined) || undefined,
    attributeLevels: (r.attribute_levels as Record<string, number> | undefined) || undefined,
    attributeLevelTitles: (r.attribute_level_titles as Record<string, string[]> | undefined) || undefined,
    totalPoints: typeof r.total_points === 'number' ? (r.total_points as number) : undefined,
    unlockedCount: typeof r.unlocked_count === 'number' ? (r.unlocked_count as number) : undefined,
    // 名片状态 / 目标（v2.7.0.6 第 6 项）：PB 上可能还没这两个字段，缺了就是 undefined
    status: parseProfileStatus(r.status),
    goal: parseGoalSnapshot(r.goal),
    lastSyncedAt: new Date(),
  };
};

/** payload 里各字段的上限：字符串键超长就截，其余键 200 字；不是字符串的一律丢（面板直接 .trim/.slice，类型错了会整页崩） */
const PAYLOAD_STRING_MAX: Record<string, number> = {
  title: 60, message: 200, narrative: 400, persona_name: 40, skill_name: 40, archetype_id: 40, event: 20,
  pact_kind: 10, mode: 10, deadline: 10, shadow_id: 20, pact_id: 20, friendship_id: 20, coop_bond_id: 20,
  prayer_id: 20, coop_link_id: 20, kind: 40,
};
const PAYLOAD_NUMBER_KEYS = new Set(['days', 'damage', 'hp_remaining', 'delta', 'sp']);
const PAYLOAD_BOOL_KEYS = new Set(['resonance_bonus', 'weakness_bonus', 'all_out']);

/**
 * 通知是别人写来的：字段类型、长度都不能信。这里按键把类型对齐、把长度截掉，
 * 面板那边就可以放心当字符串用。认不出的键原样保留（限 2KB），嵌套对象只留小的。
 */
export function sanitizeNotificationPayload(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (k in PAYLOAD_STRING_MAX) {
      if (typeof v !== 'string') continue;
      const max = PAYLOAD_STRING_MAX[k];
      out[k] = [...v].length > max ? [...v].slice(0, max).join('') : v;
    } else if (PAYLOAD_NUMBER_KEYS.has(k)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    } else if (PAYLOAD_BOOL_KEYS.has(k)) {
      out[k] = v === true;
    } else if (typeof v === 'string') {
      out[k] = [...v].length > 200 ? [...v].slice(0, 200).join('') : v;
    } else if (typeof v === 'number') {
      if (Number.isFinite(v)) out[k] = v;
    } else if (typeof v === 'boolean') {
      out[k] = v;
    } else if (v && typeof v === 'object') {
      try {
        const text = JSON.stringify(v);
        if (text.length <= 2048) out[k] = JSON.parse(text);
      } catch { /* 循环引用之类：丢掉 */ }
    }
  }
  return out;
}

const mapNotification = (r: RecordModel): NotificationEntry => {
  const expand = (r.expand ?? {}) as { from?: RecordModel };
  return {
    id: r.id,
    userId: r.user as string,
    type: r.type as NotificationType,
    fromId: (r.from as string | undefined) || undefined,
    fromProfile: profileFromRecord(expand.from),
    payload: sanitizeNotificationPayload(r.payload),
    read: Boolean(r.read),
    createdAt: new Date(r.created as string),
  };
};

/**
 * 拉当前用户的通知：最新 100 条，外加**全部未读**（最多再 400 条）。
 * 结算（祈愿 SP、一起进步事件）只看未读；以前只拉最新 100 条，通知多了以后更早的未读永远轮不到结算。
 */
export const listNotifications = async (): Promise<NotificationEntry[]> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  // 只拉 user = 当前登录者的；按 created 倒序；expand from 字段
  const latest = await pb.collection('notifications').getList(1, 100, {
    filter: `user = "${me}"`,
    expand: 'from',
    sort: '-created',
    requestKey: null,
  });
  const out = new Map<string, NotificationEntry>();
  for (const r of latest.items) out.set(r.id, mapNotification(r));
  if (latest.totalItems > latest.items.length) {
    try {
      const unread = await pb.collection('notifications').getList(1, 400, {
        filter: `user = "${me}" && read = false`,
        expand: 'from',
        sort: '-created',
        requestKey: null,
      });
      for (const r of unread.items) if (!out.has(r.id)) out.set(r.id, mapNotification(r));
    } catch (err) {
      console.warn('[velvet-notifications] extra unread fetch failed', err); // 最新 100 条照常用
    }
  }
  return [...out.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

/**
 * 标记一条通知为已读。
 *
 * **会抛** —— 之前版本是静默吞掉错误，结果 consumer 以为标记成功、
 * 但 PB 上还是 `read=false`，下次 loadSocial 会把同一条事件再消费一遍
 * （重复 +SP / +亲密度）。现在由调用方决定：
 *   - 如果消费方需要 at-most-once，应该先 markRead 成功再发奖励
 *   - 如果只是 "一键全读" 这类批量操作，用 try/catch 忽略单条失败即可
 */
export const markNotificationRead = async (id: string): Promise<void> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  await pb.collection('notifications').update(id, { read: true });
};

/** 把当前用户所有未读标成已读（一键清空红点） */
export const markAllNotificationsRead = async (unread: NotificationEntry[]): Promise<number> => {
  if (!pb || !pb.authStore.isValid) return 0;
  let ok = 0;
  for (const n of unread) {
    if (n.read) continue;
    try {
      await pb.collection('notifications').update(n.id, { read: true });
      ok += 1;
    } catch (err) {
      console.warn('[velvet-notifications] markRead batch item failed', n.id, err);
    }
  }
  return ok;
};

/** 删除一条通知（对自己不可见） */
export const deleteNotification = async (id: string): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;
  try {
    await pb.collection('notifications').delete(id);
  } catch (err) {
    console.warn('[velvet-notifications] delete failed', id, err);
  }
};
