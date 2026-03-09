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
