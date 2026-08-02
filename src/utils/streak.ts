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
 * Computes the maximum consecutive-day streak from an array of date strings or Date objects.
 * Each entry is normalised to midnight local time so the ONE_DAY gap check is exact.
 */
export function calcMaxStreak(dates: (string | Date)[]): number {
  if (dates.length === 0) return 0;
  const toLocalMidnight = (d: string | Date): number => {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  };
  const unique = [...new Set(dates.map(toLocalMidnight))].sort((a, b) => a - b);
  const ONE_DAY = 86400000;
  let maxStreak = 1;
  let cur = 1;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] - unique[i - 1] === ONE_DAY) {
      cur++;
      if (cur > maxStreak) maxStreak = cur;
    } else {
      cur = 1;
    }
  }
  return maxStreak;
}

/**
 * Computes the consecutive-day streak ending today.
 * Each entry is normalised to midnight local time so the ONE_DAY gap check is exact.
 * A day without records does not break the chain until it is over: when today has
 * no entry yet but yesterday has, the streak counts from yesterday (same semantics
 * as the Statistics page). Returns 0 when the most recent entry is older than yesterday.
 */
export function calcCurrentStreak(dates: (string | Date)[]): number {
  if (dates.length === 0) return 0;
  const toLocalMidnight = (d: string | Date): number => {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  };
  const unique = [...new Set(dates.map(toLocalMidnight))].sort((a, b) => a - b);
  const ONE_DAY = 86400000;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const latest = unique[unique.length - 1];
  if (latest !== todayMidnight && latest !== todayMidnight - ONE_DAY) return 0;
  let streak = 1;
  for (let i = unique.length - 1; i > 0; i--) {
    if (unique[i] - unique[i - 1] === ONE_DAY) streak++;
    else break;
  }
  return streak;
}
