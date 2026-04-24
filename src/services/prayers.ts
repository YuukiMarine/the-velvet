/**
 * 祈愿 / Prayer —— 在线好友之间互送 SP 的轻量动作。
 *
 * 设计：
 *   - 每个"祈愿日"以本地 04:00 为日界，同一 (from, to, day) 只能存在一条
 *   - 对方收到祈愿 → +3 SP（走本地 battleState；battleState 不存在时静默丢弃）
 *   - 双向互祈 → 给两边各 +1 notification，前端 UI 强调之
 *
 * PB 集合 `prayers` schema（需要用户在 PB Admin 手动建立）：
 *   from     relation → users  required  cascade-delete
 *   to       relation → users  required  cascade-delete
 *   day      text (YYYY-MM-DD) required
 *   索引 (unique): from, to, day
 *   List/View rule:   @request.auth.id = from || @request.auth.id = to
 *   Create rule:      @request.auth.id = from && from != to
 *   Update/Delete:    （留空；祈愿不可修改 / 撤回）
 */

import type { RecordModel } from 'pocketbase';
import { pb, getUserId } from './pocketbase';
import type { CloudProfile, Prayer } from '@/types';

/** 祈愿日界：本地 04:00 */
const DAY_RESET_HOUR = 4;

/**
 * 按 DAY_RESET_HOUR 返回"当前祈愿日"的 YYYY-MM-DD。
 * 凌晨 0:00–3:59 属于"前一自然日"的祈愿日。
 */
export const getPrayerDayKey = (now: Date = new Date()): string => {
  const anchor = new Date(now);
  if (anchor.getHours() < DAY_RESET_HOUR) {
    anchor.setDate(anchor.getDate() - 1);
  }
  const y = anchor.getFullYear();
  const m = String(anchor.getMonth() + 1).padStart(2, '0');
  const d = String(anchor.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** 下一次 04:00 的时间戳（毫秒），用于前端倒计时显示 */
export const getNextResetTime = (now: Date = new Date()): Date => {
  const next = new Date(now);
  next.setHours(DAY_RESET_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
};

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
    totalPoints: typeof r.total_points === 'number' ? (r.total_points as number) : undefined,
    unlockedCount: typeof r.unlocked_count === 'number' ? (r.unlocked_count as number) : undefined,
    lastSyncedAt: new Date(),
  };
};

const mapPrayer = (r: RecordModel): Prayer => {
  const expand = (r.expand ?? {}) as { from?: RecordModel; to?: RecordModel };
  return {
    id: r.id,
    fromId: r.from as string,
    toId: r.to as string,
    day: r.day as string,
    createdAt: new Date(r.created as string),
    fromProfile: profileFromRecord(expand.from),
    toProfile: profileFromRecord(expand.to),
  };
};

// ── 读 ────────────────────────────────────────────────────────────

/**
 * 拉取今日（以本地 04:00 为日界）所有"与我相关"的祈愿记录。
 * 包含 from = me 和 to = me 两种方向。
 */
export const listTodayPrayers = async (): Promise<Prayer[]> => {
  if (!pb || !pb.authStore.isValid) return [];
  const me = getUserId();
  if (!me) return [];
  const day = getPrayerDayKey();
  try {
    const records = await pb.collection('prayers').getFullList({
      filter: `day = "${day}" && (from = "${me}" || to = "${me}")`,
      expand: 'from,to',
      sort: '-created',
      requestKey: null,
    });
    return records.map(mapPrayer);
  } catch (err) {
    // PB 集合不存在 / 权限没配 → 返回空，不阻塞主流程
    console.warn('[velvet-prayers] listTodayPrayers failed', err);
    return [];
  }
};

/** 今天我是否已为对方祈愿 */
export const hasPrayedToday = (targetUserId: string, todayPrayers: Prayer[]): boolean => {
  const me = getUserId();
  if (!me) return false;
  return todayPrayers.some(p => p.fromId === me && p.toId === targetUserId);
};

/** 今天对方是否已为我祈愿 */
export const hasBeenPrayedByToday = (sourceUserId: string, todayPrayers: Prayer[]): boolean => {
  const me = getUserId();
  if (!me) return false;
  return todayPrayers.some(p => p.fromId === sourceUserId && p.toId === me);
};

// ── 写 ────────────────────────────────────────────────────────────

export interface SendPrayerResult {
  prayer: Prayer;
  /** 对方今天是否也给我发过祈愿（此次发送后构成双向互祈） */
  reciprocal: boolean;
}

/**
 * 向对方发送祈愿。
 *
 * - 失败情况：未登录 / 对方为自己 / 今日已发过 / PB 集合未建
 * - 成功：创建 prayers + 通知 prayer_received
 * - 若对方今天也已对我祈愿 → 额外创建 prayer_reciprocal 通知给双方
 */
export const sendPrayer = async (
  targetUserId: string,
  existingTodayPrayers: Prayer[] = [],
): Promise<SendPrayerResult> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  if (!targetUserId || targetUserId === me) throw new Error('不能对自己祈愿');
  if (hasPrayedToday(targetUserId, existingTodayPrayers)) {
    throw new Error('今天已经为 Ta 祈愿过了');
  }

  const day = getPrayerDayKey();
  const created = await pb.collection('prayers').create(
    { from: me, to: targetUserId, day },
    { expand: 'from,to' },
  );
  const prayer = mapPrayer(created);

  // 对方收到祈愿的通知（+3 SP 在对方本地处理）
  try {
    await pb.collection('notifications').create({
      user: targetUserId,
      type: 'prayer_received',
      from: me,
      payload: { prayer_id: prayer.id, day },
      read: false,
    });
  } catch (err) {
    console.warn('[velvet-prayers] create prayer_received notification failed', err);
  }

  // 双向互祈 → 只给对方发一条反射通知。
  // **不发给自己** —— 发送方的 +1 反射 SP 已在 Cooperation.executePrayer 本地路径中结算，
  // 如果再给自己塞一条 prayer_reciprocal，consumePrayerNotifications 下次 loadSocial 会把同一笔 +1 再发一次，
  // 导致发送方拿到 +4 而不是预期的 +3。
  const reciprocal = hasBeenPrayedByToday(targetUserId, existingTodayPrayers);
  if (reciprocal) {
    try {
      await pb.collection('notifications').create({
        user: targetUserId,
        type: 'prayer_reciprocal',
        from: me,
        payload: { prayer_id: prayer.id, day },
        read: false,
      });
    } catch (err) {
      console.warn('[velvet-prayers] create prayer_reciprocal notification failed', err);
    }
  }

  return { prayer, reciprocal };
};
