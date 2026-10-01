/**
 * navigatorClock — 助手相关的日子写法（AI 助手第二批 · 时间准确性）。
 *
 * 大模型自己算「后天是几号 / 10 月 3 日是星期几」常错，所以凡是要它换算或复述日子的地方，
 * 都由这里先写成具体的字：「10月1日（周三）」、往后 14 天的日历表。纯函数，不碰 store。
 * 日期键一律是本地时区的 YYYY-MM-DD（与 toLocalDateKey 同口径）。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** YYYY-MM-DD → 本地零点的 Date（不能用 new Date('YYYY-MM-DD')：那是 UTC 零点，西半球会差一天） */
export function dateOfKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function keyOfDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 日期键加减天数（按日历日，夏令时不影响） */
export function shiftKey(key: string, days: number): string {
  const d = dateOfKey(key);
  d.setDate(d.getDate() + days);
  return keyOfDate(d);
}

/** 两个日期键相差几天（b − a，按日历日） */
export function daysBetween(a: string, b: string): number {
  const da = dateOfKey(a);
  const db = dateOfKey(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400_000);
}

export const weekdayCN = (key: string): string => `周${WEEKDAYS[dateOfKey(key).getDay()]}`;

/** 「10月1日」 */
export const mdCN = (key: string): string => {
  const d = dateOfKey(key);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/** 「10月1日（周三）」；跨年时带年份「2027年1月3日（周日）」 */
export function dayLabelCN(key: string, todayKey?: string): string {
  const d = dateOfKey(key);
  const withYear = todayKey ? dateOfKey(todayKey).getFullYear() !== d.getFullYear() : false;
  return `${withYear ? `${d.getFullYear()}年` : ''}${mdCN(key)}（${weekdayCN(key)}）`;
}

/** 相对今天的说法：今天 / 昨天 / 前天 / N 天前 / 明天 / 后天 / N 天后 */
export function relativeDayCN(key: string, todayKey: string): string {
  const n = daysBetween(todayKey, key);
  if (n === 0) return '今天';
  if (n === -1) return '昨天';
  if (n === -2) return '前天';
  if (n === 1) return '明天';
  if (n === 2) return '后天';
  return n < 0 ? `${-n} 天前` : `${n} 天后`;
}

/** 「M/D」短写（记忆注入行用） */
export const shortMD = (key: string): string => {
  const d = dateOfKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 往后 N 天的日历表（给要换算日子的调用查表用）：
 * 「10月2日 周五（今天）/ 10月3日 周六（明天）/ 10月4日 周日（后天）/ 10月5日 周一 …」
 */
export function calendarTable(todayKey: string, days = 14): string {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const k = shiftKey(todayKey, i);
    const tag = i === 0 ? '（今天）' : i === 1 ? '（明天）' : i === 2 ? '（后天）' : '';
    out.push(`${k} ${weekdayCN(k)}${tag}`);
  }
  return out.join('\n');
}

/**
 * 历史时间戳（助手 / 谏言共用）：今天 [21:35]、昨天 [昨天 23:10]、更早 [9月30日 23:10]——与界面气泡同一规则。
 * 只有 [HH:mm] 时，窗口开着过了夜，昨晚 23:10 的话在模型眼里像今天的。
 */
export const stampOf = (ts: number, now: number = Date.now()): string => {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  if (ts >= today0.getTime()) return `[${hm}]`;
  if (ts >= today0.getTime() - 86400_000) return `[昨天 ${hm}]`;
  return `[${d.getMonth() + 1}月${d.getDate()}日 ${hm}]`;
};

/** 「现在是 2026-10-02（周五）21:35」 */
export function nowLineCN(now: Date = new Date()): string {
  const key = keyOfDate(now);
  return `${key}（${weekdayCN(key)}）${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
