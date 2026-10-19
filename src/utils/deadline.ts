/**
 * 任务截止日（DDL，YYYY-MM-DD）的纯计算。
 * 单次 / 计数任务在「更多设置」里设（与「每日重置」互斥）；BIG DEAL 的截止日沿用同一个字段。
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 截止日距今天几天：正 = 还剩，0 = 今天，负 = 已过。按日历日算（夏令时的 23 / 25 小时日由 round 吃掉） */
export const daysUntilKey = (deadline: string, todayKey: string): number =>
  Math.round((new Date(deadline + 'T00:00:00').getTime() - new Date(todayKey + 'T00:00:00').getTime()) / 86400000);

/** plain = 还早；soon = 三天内；due = 今天截止；over = 已逾期 */
export type DeadlineTone = 'plain' | 'soon' | 'due' | 'over';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** 截止时刻 'HH:MM' 合法与否（第 28 批） */
export const isDeadlineTime = (t: unknown): t is string => typeof t === 'string' && TIME_RE.test(t);

/**
 * 任务条上的一句：剩 N 天 / 今天截止 / 逾期 N 天；没设或格式不对返回 null。
 * 带截止时刻（第 28 批）：「剩 2 天 · 09:00」「今天 21:00 截止」；逾期不再写时刻。
 */
export function deadlineStatus(deadline: string | undefined, todayKey: string, time?: string): { days: number; text: string; tone: DeadlineTone } | null {
  if (!deadline || !DAY_RE.test(deadline)) return null;
  const days = daysUntilKey(deadline, todayKey);
  const t = isDeadlineTime(time) ? time : '';
  if (days > 0) return { days, text: `剩 ${days} 天${t ? ` · ${t}` : ''}`, tone: days <= 3 ? 'soon' : 'plain' };
  if (days === 0) return { days, text: t ? `今天 ${t} 截止` : '今天截止', tone: 'due' };
  return { days, text: `逾期 ${-days} 天`, tone: 'over' };
}
