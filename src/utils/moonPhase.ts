/**
 * 月相工具 —— COOP 羁绊之影以新月 / 满月之夜为降临触发。
 *
 * 算法：以一个已知的新月作为参考点（2000-01-06 18:14 UTC），
 * 合朔周期约 29.530588 天，新月 → 满月间隔 ~14.765 天。
 *
 * 本文件做三件事：
 *   - 判断某个 `Date` 是不是"新月 / 满月之夜"（24h 窗口）
 *   - 月夜编号（羁绊之影按它定唯一身份）
 *   - 首页 / 小组件共用的月相读数 moonPhaseOf（第 6 轮：原来三套首页 + 小组件各抄一份）
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
 * 这一刻属于第几个「新月 / 满月」（从参考新月起数半个合朔周期，偶数新月、奇数满月）。
 * 按 UTC 时刻算，两个时区不同的人在同一个月夜拿到的是同一个编号——
 * 羁绊之影用它给「一对 COOP、一个月夜」定唯一身份（见 coopShadows.shadowSlotId）。
 */
export function moonPhaseSlot(at: Date = new Date()): number {
  return Math.round((at.getTime() - REFERENCE_NEW_MOON_UTC) / HALF_SYNODIC_MS);
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
 * 今天的攻击窗口是否开着？—— 每日 18:00 至次日 07:00。
 *
 * 注意：和 `isMoonPhaseNight` 正交 —— 月相决定"有没有 Boss"，这个决定"能不能打"。
 */
export function isDailyAttackWindow(at: Date = new Date()): boolean {
  const h = at.getHours();
  // [18, 24) ∪ [0, 7)
  return h >= 18 || h < 7;
}

/** 八个月相名（首页 / 小组件同一份） */
export const MOON_PHASE_NAMES = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'] as const;
const SYNODIC_DAYS = 29.530588853;

/** 月相读数：phase 0 新月 → 0.5 满月 → 1；name 八分相；illum 亮面比例；full = 满月那一档 */
export function moonPhaseOf(date: Date = new Date()): { phase: number; name: string; illum: number; full: boolean } {
  const days = (date.getTime() - REFERENCE_NEW_MOON_UTC) / 86400000;
  const phase = (((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS) / SYNODIC_DAYS;
  const idx = Math.round(phase * 8) % 8;
  return { phase, name: MOON_PHASE_NAMES[idx], illum: (1 - Math.cos(2 * Math.PI * phase)) / 2, full: idx === 4 };
}

// ── 满月心魔（第 6 轮）──────────────────────────────────────────

/** 某个槽位（奇数 = 满月、偶数 = 新月）的天文时刻（毫秒，按平均朔望月推） */
export function moonInstantOfSlot(slot: number): number {
  return REFERENCE_NEW_MOON_UTC + slot * HALF_SYNODIC_MS;
}

const isOdd = (n: number) => ((n % 2) + 2) % 2 === 1;

/** 这一天（本地日）里有没有满月时刻：有就返回那次满月的槽位编号，没有返回 null */
export function fullMoonSlotOnDay(date: Date = new Date()): number | null {
  const near = moonPhaseSlot(date);
  for (const s of [near - 1, near, near + 1]) {
    if (!isOdd(s)) continue;
    const t = new Date(moonInstantOfSlot(s));
    if (t.getFullYear() === date.getFullYear() && t.getMonth() === date.getMonth() && t.getDate() === date.getDate()) return s;
  }
  return null;
}

/** 下一次满月（含今天）的时刻 */
export function nextFullMoon(from: Date = new Date()): Date {
  const dayStart = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  let s = moonPhaseSlot(from) - 1;
  if (!isOdd(s)) s -= 1;
  while (moonInstantOfSlot(s) < dayStart) s += 2;
  return new Date(moonInstantOfSlot(s));
}
