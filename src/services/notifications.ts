/**
 * 通知列表 API —— 包在 PocketBase `notifications` 集合之上。
 *
 * 每条通知只对收件人可见；收件人可以读 / 标记已读 / 删除。
 * 发送通知的创建逻辑在 `services/friends.ts` 等业务流程里，不在这里暴露。
 */

import type { RecordModel } from 'pocketbase';
import { pb, getUserId } from './pocketbase';
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
    totalPoints: typeof r.total_points === 'number' ? (r.total_points as number) : undefined,
    unlockedCount: typeof r.unlocked_count === 'number' ? (r.unlocked_count as number) : undefined,
    lastSyncedAt: new Date(),
  };
};

const mapNotification = (r: RecordModel): NotificationEntry => {
  const expand = (r.expand ?? {}) as { from?: RecordModel };
  return {
    id: r.id,
    userId: r.user as string,
    type: r.type as NotificationType,
    fromId: (r.from as string | undefined) || undefined,
    fromProfile: profileFromRecord(expand.from),
    payload: (r.payload as Record<string, unknown> | undefined) || undefined,
    read: Boolean(r.read),
    createdAt: new Date(r.created as string),
  };
};

/** 拉当前用户的全部通知（最新 100 条） */
export const listNotifications = async (): Promise<NotificationEntry[]> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  // 只拉 user = 当前登录者的；按 created 倒序；expand from 字段
  const records = await pb.collection('notifications').getList(1, 100, {
    filter: `user = "${me}"`,
    expand: 'from',
    sort: '-created',
    requestKey: null,
  });
  return records.items.map(mapNotification);
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
