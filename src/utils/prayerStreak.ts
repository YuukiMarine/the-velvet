/**
 * 连续祈愿天数。
 *
 * 口径与全站 streak 一致：只认「昨天」——断一天就从 1 重新数，不做补签、不宽限。
 * 日期一律走 toLocalDateKey（本地日历日），不能用 toISOString().slice：
 * 东八区凌晨 0–8 点祈愿会被 UTC 记成"昨天"，连续天数当场断掉。
 */
import { toLocalDateKey } from '@/store';

/** 前一天的 key */
const prevKey = (key: string): string => {
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return toLocalDateKey(d);
};

/**
 * 今天祈愿之后，这位同伴的连续天数应该是多少。
 * @param last 上次祈愿日期（YYYY-MM-DD），无则视为首次
 * @param streak 上次记录的连续天数
 * @param today 今天的 key（可注入，便于测试）
 */
export const nextPrayerStreak = (
  last: string | undefined,
  streak: number | undefined,
  today: string = toLocalDateKey(),
): number => {
  if (last === today) return Math.max(1, streak ?? 1);  // 今天已经数过，不重复推进
  if (last && last === prevKey(today)) return Math.max(1, (streak ?? 0) + 1);
  return 1;                                             // 断了 / 首次
};

/**
 * 互动记录里该写哪句话。
 * 第 1 天保持原有默认输出；**第 2 天起**由连续天数接管（用户口径）。
 */
export const prayerNarrative = (streak: number, reciprocal: boolean): string => {
  if (streak >= 2) {
    return reciprocal
      ? `已连续祈愿 ${streak} 天 · 今日互相祈愿，愿望之光交汇`
      : `已连续祈愿 ${streak} 天`;
  }
  return reciprocal ? '今日互相祈愿。愿望之光交汇' : '送出今日的祈愿';
};
