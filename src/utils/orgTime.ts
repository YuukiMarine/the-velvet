/**
 * 组织时区的日与周（从 orgLogic 拆出来：团战 utils/orgRaid 也要用，放在这里免得互相引用）。
 * orgLogic 原样转出这些名字，老的引用不用改。纯计算，无头脚本里可以直接验。
 */

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string): Intl.DateTimeFormat {
  const hit = fmtCache.get(tz);
  if (hit) return hit;
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  } catch {
    // 时区名不认识（老设备 / 手改数据）：退回 UTC，不让整页崩
    f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  }
  fmtCache.set(tz, f);
  return f;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** 某一刻在组织时区里是哪一天、周几（周一 = 1 … 周日 = 7）、几点（0–23） */
export function zonedDay(date: Date, tz: string): { key: string; weekday: number; hour: number } {
  const parts = fmtFor(tz).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const hour = Number(get('hour'));
  return { key: `${get('year')}-${get('month')}-${get('day')}`, weekday: WEEKDAY[get('weekday')] ?? 1, hour: Number.isFinite(hour) ? hour % 24 : 0 };
}

/** 日键平移 n 天（按日历算，与时区、夏令时无关） */
export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 组织时区里「这一周」的周键 = 那周周一的日键 */
export function orgWeekKey(date: Date, tz: string): string {
  const { key, weekday } = zonedDay(date, tz);
  return shiftDayKey(key, 1 - weekday);
}

/** 某个日键所在那周的周键（周一）——日键本身已经是组织时区里的日子，按日历算 */
export function weekKeyOfDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = 周日
  return shiftDayKey(dayKey, -((dow + 6) % 7));
}

/** 一周七天的日键（周一起） */
export const weekDayKeys = (weekKey: string): string[] => Array.from({ length: 7 }, (_, i) => shiftDayKey(weekKey, i));

/** 组织时区里今天是不是周日 */
export const isMeetingDay = (date: Date, tz: string): boolean => zonedDay(date, tz).weekday === 7;

/** 会议开到周一凌晨几点（和 App 其它地方的 4 点日界一致，给熬夜的人留一点时间） */
export const MEETING_GRACE_HOUR = 4;

/**
 * 组织时区里此刻的会议状态（7b）：
 *   · open：周日全天，以及周一 0–4 点；week = 这场会议所属的那周（周一的日键）；
 *   · 不在会议时间：week = 本周（下一场会在本周日）；
 *   · lastClosed = 最近一场已经结束的会议属于哪周——纪要就补这一周。
 */
export function meetingState(now: Date, tz: string): { open: boolean; week: string; lastClosed: string } {
  const { key, weekday, hour } = zonedDay(now, tz);
  const cur = shiftDayKey(key, 1 - weekday);
  if (weekday === 7) return { open: true, week: cur, lastClosed: shiftDayKey(cur, -7) };
  if (weekday === 1 && hour < MEETING_GRACE_HOUR) return { open: true, week: shiftDayKey(cur, -7), lastClosed: shiftDayKey(cur, -14) };
  return { open: false, week: cur, lastClosed: shiftDayKey(cur, -7) };
}

/** 下周的周键 */
export const nextWeekKey = (weekKey: string): string => shiftDayKey(weekKey, 7);

export const bitCount = (n: number): number => {
  let c = 0;
  for (let v = n; v; v &= v - 1) c++;
  return c;
};

// ── 组织时区里的「几点整」→ 时刻（团战窗口用）─────────────────────────────────────

const fullCache = new Map<string, Intl.DateTimeFormat>();
function fullFmt(tz: string): Intl.DateTimeFormat {
  const hit = fullCache.get(tz);
  if (hit) return hit;
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz });
  } catch {
    f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' });
  }
  fullCache.set(tz, f);
  return f;
}

/** 某一刻在这个时区比 UTC 快多少毫秒（东八区 = +8h） */
function offsetMs(t: number, tz: string): number {
  const parts = fullFmt(tz).formatToParts(new Date(t));
  const get = (k: string) => Number(parts.find(p => p.type === k)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** 组织时区里某天几点整是哪一刻（夏令时切换那天按切换后的偏移；差一小时以内） */
export function zonedInstant(dayKey: string, hour: number, tz: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  return new Date(t);
}
