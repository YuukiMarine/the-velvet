/**
 * 连续天数的**唯一取数口径**（PRD_V2.6 §12）。
 *
 * 补记（`backfilled`）的条目一律不计入连续天数。
 *
 * 理由：streak 记的是「没有断过」。如果事后补几条就能把它接上，这个数字
 * 就再也不代表任何东西了——App 等于对用户撒了个关于他自己历史的谎。
 * 回归面板上写着"补记不会修复连续天数"，那句承诺就靠这个函数兑现。
 *
 * 所有 calcMaxStreak / calcCurrentStreak 的调用点都应当先过这一层，
 * 而不是各自 `activities.map(a => a.date)`——那样漏一处就破一处。
 */
export function streakDates(activities: Array<{ date: string | Date; backfilled?: boolean }>): (string | Date)[] {
  return activities.filter(a => !a.backfilled).map(a => a.date);
}

/**
 * 本地日历日的序号（按本地年月日折成 UTC 再除一天）。
 *
 * 之前用「本地零点时间戳相差正好 86400000」判相邻：有夏令时的时区里，切换那天
 * 两个零点只差 23 或 25 小时，连续天数一年断两次（实测纽约连记 400 天只算 238，
 * 悉尼 182）——「连续 365 天」在这些时区永远达不到。序号相减不受夏令时影响。
 */
export function localDayNumber(d: string | Date): number {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return Math.round(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000);
}

/**
 * Computes the maximum consecutive-day streak from an array of date strings or Date objects.
 * Each entry is normalised to its local calendar day, so the gap check survives DST switches.
 */
export function calcMaxStreak(dates: (string | Date)[]): number {
  if (dates.length === 0) return 0;
  const unique = [...new Set(dates.map(localDayNumber))].sort((a, b) => a - b);
  let maxStreak = 1;
  let cur = 1;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] - unique[i - 1] === 1) {
      cur++;
      if (cur > maxStreak) maxStreak = cur;
    } else {
      cur = 1;
    }
  }
  return maxStreak;
}

/**
 * 第一条记录到今天过了几个日历日（「你的记忆」成就用）。传进来的应当是 streakDates 过滤后的日期：
 * 补记不算——不然新用户补几条去年的记录就能直接领一周年。没有记录为 0。
 */
export function daysSinceFirstRecord(dates: (string | Date)[], now: Date = new Date()): number {
  if (dates.length === 0) return 0;
  let first = Infinity;
  for (const d of dates) {
    const n = localDayNumber(d);
    if (n < first) first = n;
  }
  return Math.max(0, localDayNumber(now) - first);
}

/**
 * Computes the consecutive-day streak ending today.
 * Each entry is normalised to its local calendar day, so the gap check survives DST switches.
 * A day without records does not break the chain until it is over: when today has
 * no entry yet but yesterday has, the streak counts from yesterday (same semantics
 * as the Statistics page). Returns 0 when the most recent entry is older than yesterday.
 */
export function calcCurrentStreak(dates: (string | Date)[]): number {
  if (dates.length === 0) return 0;
  const unique = [...new Set(dates.map(localDayNumber))].sort((a, b) => a - b);
  const today = localDayNumber(new Date());
  const latest = unique[unique.length - 1];
  if (latest !== today && latest !== today - 1) return 0;
  let streak = 1;
  for (let i = unique.length - 1; i > 0; i--) {
    if (unique[i] - unique[i - 1] === 1) streak++;
    else break;
  }
  return streak;
}
