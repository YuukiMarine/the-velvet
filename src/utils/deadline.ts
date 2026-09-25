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

/** 任务条上的一句：剩 N 天 / 今天截止 / 逾期 N 天；没设或格式不对返回 null */
export function deadlineStatus(deadline: string | undefined, todayKey: string): { days: number; text: string; tone: DeadlineTone } | null {
  if (!deadline || !DAY_RE.test(deadline)) return null;
  const days = daysUntilKey(deadline, todayKey);
  if (days > 0) return { days, text: `剩 ${days} 天`, tone: days <= 3 ? 'soon' : 'plain' };
  if (days === 0) return { days, text: '今天截止', tone: 'due' };
  return { days, text: `逾期 ${-days} 天`, tone: 'over' };
}
