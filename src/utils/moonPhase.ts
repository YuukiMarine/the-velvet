/**
 * 月相工具 —— COOP 羁绊之影以新月 / 满月之夜为降临触发。
 *
 * 算法：以一个已知的新月作为参考点（2000-01-06 18:14 UTC），
 * 合朔周期约 29.530588 天，新月 → 满月间隔 ~14.765 天。
 *
 * 本文件只做两件事：
 *   - 判断某个 `Date` 是不是"新月 / 满月之夜"（24h 窗口）
 *   - 计算下一次新月 / 满月之夜的 18:00 本地时间
 */

/** 已知的参考新月：2000-01-06 18:14 UTC（NASA ephemeris） */
const REFERENCE_NEW_MOON_UTC = new Date('2000-01-06T18:14:00Z').getTime();
/** 合朔周期（秒）—— 29.530588 天 */
const SYNODIC_MS = 29.530588 * 86400 * 1000;
/** 从新月到满月的间隔（秒） */
const HALF_SYNODIC_MS = SYNODIC_MS / 2;

/**
 * 返回给定时刻距离最近一次"新月或满月"的时间差（毫秒，带符号）。
 * 正值 = 将来，负值 = 过去。用来判断 "当前是不是降临窗口期内"。
 */
function distanceToNearestMoonPhase(at: Date): number {
  const t = at.getTime() - REFERENCE_NEW_MOON_UTC;
  // 相对于新月周期的当前位置（0..synodic_ms）
  const phase = ((t % SYNODIC_MS) + SYNODIC_MS) % SYNODIC_MS;
  // 离最近的 {新月(0) / 满月(half) / 下一个新月(synodic)} 的距离
  const distNewMoon = Math.min(phase, SYNODIC_MS - phase);
  const distFullMoon = Math.abs(phase - HALF_SYNODIC_MS);
  return Math.min(distNewMoon, distFullMoon);
}

/**
 * 是不是"新月 / 满月之夜"？
 *
 * 为了让一次降临有一整晚的时间被用户看见，用 24h 容差（±12h 以内即算当夜）。
 * 严格的天文学时间点和本地时区也有偏移，这个容差同时兼容时区差异。
 */
export function isMoonPhaseNight(at: Date = new Date()): boolean {
  return distanceToNearestMoonPhase(at) <= 12 * 3600 * 1000;
}

/**
 * 给定时间之后，下一次新月 / 满月"降临时刻"（取该日 18:00 本地时间）。
 * 主要用于 UI 倒计时展示 "下次降临：YYYY-MM-DD HH:mm"。
 */
export function nextMoonPhaseSpawnAt(after: Date = new Date()): Date {
  const t = after.getTime() - REFERENCE_NEW_MOON_UTC;
  const phase = ((t % SYNODIC_MS) + SYNODIC_MS) % SYNODIC_MS;
  // 下一个新月点 or 满月点（取时间更近的）
  let nextDelta: number;
  if (phase < HALF_SYNODIC_MS) {
    nextDelta = HALF_SYNODIC_MS - phase;   // 下一个满月
  } else {
    nextDelta = SYNODIC_MS - phase;        // 下一个新月
  }
  const nextPhase = new Date(after.getTime() + nextDelta);
  // 把时间锚定到该日的本地 18:00
  const day = new Date(nextPhase);
  day.setHours(18, 0, 0, 0);
  return day;
}

/**
 * 今天的攻击窗口是否开着？—— 每日 18:00 至次日 07:00。
 *
 * 注意：和 `isMoonPhaseNight` 正交 —— 月相决定"有没有 Boss"，这个决定"能不能打"。
 */
export function isDailyAttackWindow(at: Date = new Date()): boolean {
  const h = at.getHours();
  // [18, 24) ∪ [0, 7)
  return h >= 18 || h < 7;
}
