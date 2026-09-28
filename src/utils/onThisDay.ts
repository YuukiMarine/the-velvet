import type { Activity } from '@/types';
import { calcCurrentStreak, daysSinceFirstRecord, localDayNumber, streakDates } from '@/utils/streak';

/**
 * 「当年今日」（2.7.0.6 第 6 轮，用户拍板：只做一年档、放在今日仪式轮播里逆影战场那张之后）。
 *
 * 口径：第一条（非补记）记录到今天满 365 天才出现；看去年同月同日（2 月 29 日回落到 28 日）；
 * 那天没有记录就不出现。只算用户自己写的记录：系统副记录（升级 / 成就 / 子步…）不算，补记的也不算。
 * 纯本地计算，不走 AI。
 */
export const ON_THIS_DAY_MIN_DAYS = 365;

/** 系统写入的副记录类别：不是「那天你做了什么」 */
const SYSTEM_CATEGORIES = new Set<NonNullable<Activity['category']>>([
  'skill_unlock', 'achievement_unlock', 'level_up', 'weekly_goal', 'countercurrent', 'shadow_defeat',
  'calling_card_clear', 'ledger', 'terminal_clear', 'bigdeal_step', 'bigdeal_clear', 'wish_fulfilled', 'return',
]);

export const isMemoryWorthy = (a: Activity): boolean =>
  !a.backfilled && !(a.category && SYSTEM_CATEGORIES.has(a.category));

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 去年同月同日；2 月 29 日回落到 2 月 28 日 */
export function sameDayLastYear(now: Date): Date {
  const y = now.getFullYear() - 1;
  const m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(now.getDate(), daysInMonth), 12, 0, 0, 0);
}

export interface OnThisDayView {
  /** 那一天（本地日历日键，YYYY-MM-DD） */
  key: string;
  date: Date;
  /** 那天的记录（按时间正序），最多 3 条给卡片；total 是那天的总条数 */
  items: Activity[];
  total: number;
  /** 那时连续记录了几天（按那天算） */
  streakThen: number;
  /** 第一条记录到今天过了多少天 */
  daysSince: number;
}

export function computeOnThisDay(activities: Activity[], now: Date = new Date()): OnThisDayView | null {
  const dates = streakDates(activities);
  const daysSince = daysSinceFirstRecord(dates, now);
  if (daysSince < ON_THIS_DAY_MIN_DAYS) return null;
  const date = sameDayLastYear(now);
  const target = localDayNumber(date);
  const all = activities
    .filter((a) => isMemoryWorthy(a) && localDayNumber(new Date(a.date)) === target)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (all.length === 0) return null;
  return {
    key: dateKeyOf(date),
    date,
    items: all.slice(0, 3),
    total: all.length,
    streakThen: calcCurrentStreak(dates, date),
    daysSince,
  };
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/** 「2025年9月27日 · 周六」 */
export function onThisDayLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS[date.getDay()]}`;
}
