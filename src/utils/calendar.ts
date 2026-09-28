/**
 * 岁时（2.7.0.6 第 6 轮）：二十四节气 + 节日 + 每天一句小注。
 *
 * 节气按天文算（太阳视黄经 = k × 15°，Meeus 低精度公式 + 牛顿迭代），按**北京时间**取日期——
 * 年历上的节气就是这么定的；与 2025、2026 两年的年历逐一对过（48/48）。每年只算一次，缓存。
 * 农历节日本地算不出（要闰月规则），查表：2026～2028 那份从成长总结搬过来，2029～2030 是按年历抄的，
 * 2028 年底前再对一次年历（见 PRD §11.5）。
 */

export interface SeasonMark {
  /** 唯一键：`${YYYY-MM-DD}-${kind}-${slug}` */
  key: string;
  name: string;
  kind: 'term' | 'festival';
  /** 一行小注（写死，不走 AI） */
  note: string;
  /** 节气序号 0=小寒 … 23=冬至；节日为 -1 */
  index: number;
  date: string;
}

// ── 节气 ────────────────────────────────────────────────────────────────

/** 按公历顺序的 24 节气（1 月小寒起） */
export const SOLAR_TERM_NAMES = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
] as const;
export type SolarTermName = (typeof SOLAR_TERM_NAMES)[number];

/** 岁时卡底部的英文名（通行译法） */
export const SOLAR_TERM_EN: Record<SolarTermName, string> = {
  小寒: 'Minor Cold', 大寒: 'Major Cold', 立春: 'Start of Spring', 雨水: 'Rain Water', 惊蛰: 'Awakening of Insects', 春分: 'Spring Equinox',
  清明: 'Pure Brightness', 谷雨: 'Grain Rain', 立夏: 'Start of Summer', 小满: 'Grain Buds', 芒种: 'Grain in Ear', 夏至: 'Summer Solstice',
  小暑: 'Minor Heat', 大暑: 'Major Heat', 立秋: 'Start of Autumn', 处暑: 'End of Heat', 白露: 'White Dew', 秋分: 'Autumn Equinox',
  寒露: 'Cold Dew', 霜降: "Frost's Descent", 立冬: 'Start of Winter', 小雪: 'Minor Snow', 大雪: 'Major Snow', 冬至: 'Winter Solstice',
};

/** 节气在传统序里的位次（立春 = 1 … 大寒 = 24），岁时卡顶上的罗马数字用；入参是本表的下标（小寒 = 0） */
export function termOrdinal(index: number): number {
  return ((index - 2 + 24) % 24) + 1;
}

const SOLAR_TERM_SLUGS = [
  'xiaohan', 'dahan', 'lichun', 'yushui', 'jingzhe', 'chunfen', 'qingming', 'guyu', 'lixia', 'xiaoman', 'mangzhong', 'xiazhi',
  'xiaoshu', 'dashu', 'liqiu', 'chushu', 'bailu', 'qiufen', 'hanlu', 'shuangjiang', 'lidong', 'xiaoxue', 'daxue', 'dongzhi',
] as const;

export const SOLAR_TERM_NOTES: Record<(typeof SOLAR_TERM_NAMES)[number], string> = {
  小寒: '一年最冷的日子开头了，手别离开口袋太久。',
  大寒: '冷到头了，再往前就是春天。',
  立春: '春天从今天起算，风里已经有软的了。',
  雨水: '雨多起来，地气回暖，出门带把伞。',
  惊蛰: '雷一响，藏了一冬的都醒了。',
  春分: '昼夜平分，从今天起白天占上风。',
  清明: '天清地明，适合走一走、想一想。',
  谷雨: '雨生百谷，种什么都来得及。',
  立夏: '夏天开始，晚饭后可以多待一会儿。',
  小满: '麦粒渐满，还没满——留一点余地正好。',
  芒种: '有芒的种，有芒的收，忙起来的季节。',
  夏至: '一年里最长的白天，太阳今天最慷慨。',
  小暑: '热起来了，午后找个有风的地方。',
  大暑: '一年最热，热到头就要往凉走了。',
  立秋: '秋天报到，早晚先凉，中午还热。',
  处暑: '暑气到此为止，夜里可以关空调了。',
  白露: '草叶上有露水了，早上出门加件外套。',
  秋分: '昼夜再度平分，从今天起夜长了。',
  寒露: '露水带了寒意，夜里别再穿凉鞋。',
  霜降: '早晚添衣，霜要来了。',
  立冬: '冬天开始，把厚被子翻出来。',
  小雪: '开始飘雪的时节，南方是冷雨。',
  大雪: '雪大了，路滑，慢一点。',
  冬至: '一年最长的夜，从今天起白天一天天回来。',
};

const D2R = Math.PI / 180;
const norm360 = (x: number) => ((x % 360) + 360) % 360;

/** 太阳视黄经（度）：Meeus《天文算法》第 25 章低精度公式，含章动与光行差 */
function apparentSolarLongitude(jd: number): number {
  const T = (jd - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * D2R)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M * D2R)
    + 0.000289 * Math.sin(3 * M * D2R);
  const omega = 125.04 - 1934.136 * T;
  return norm360(L0 + C - 0.00569 - 0.00478 * Math.sin(omega * D2R));
}

const jdOfMs = (ms: number) => ms / 86400000 + 2440587.5;
const msOfJd = (jd: number) => (jd - 2440587.5) * 86400000;

/** 黄经到达 targetDeg 的时刻（UTC 毫秒）；guessMs 是粗略初值 */
function longitudeInstant(targetDeg: number, guessMs: number): number {
  let jd = jdOfMs(guessMs);
  for (let i = 0; i < 10; i++) {
    let diff = targetDeg - apparentSolarLongitude(jd);
    diff = ((diff + 540) % 360) - 180;
    jd += diff / (360 / 365.2422);
    if (Math.abs(diff) < 1e-7) break;
  }
  return msOfJd(jd);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** 北京时间的日期键（节气按东八区定日） */
const beijingDateKey = (ms: number): string => {
  const d = new Date(ms + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

const termCache = new Map<number, SeasonMark[]>();

/** 某公历年的 24 个节气（小寒 → 冬至，按日期升序） */
export function solarTermsOf(year: number): SeasonMark[] {
  const hit = termCache.get(year);
  if (hit) return hit;
  const out: SeasonMark[] = [];
  for (let i = 0; i < 24; i++) {
    // 小寒 = 285°、大寒 = 300°、立春 = 315° … 冬至 = 270°：(285 + 15 i) mod 360
    const target = (285 + 15 * i) % 360;
    // 初值：1 月 6 日起每 15.22 天一个
    const guess = Date.UTC(year, 0, 6) + i * 15.2184 * 86400000;
    const date = beijingDateKey(longitudeInstant(target, guess));
    const name = SOLAR_TERM_NAMES[i];
    out.push({ key: `${date}-term-${SOLAR_TERM_SLUGS[i]}`, name, kind: 'term', note: SOLAR_TERM_NOTES[name], index: i, date });
  }
  termCache.set(year, out);
  return out;
}

// ── 节日 ────────────────────────────────────────────────────────────────

const FESTIVAL_NOTES: Record<string, string> = {
  元旦: '新的一年，先把今天记下来。',
  情人节: '对喜欢的人说一句，对自己也说一句。',
  妇女节: '给身边的她一句谢谢。',
  劳动节: '歇一天，或者做点想做很久的事。',
  青年节: '年轻不是年纪，是还想试的劲。',
  儿童节: '今天允许幼稚。',
  教师节: '想想那个改变过你的人。',
  国庆节: '长假开始，别忘了记录。',
  万圣夜: '戴上面具的一晚，也可以摘下来。',
  双十一: '买之前先看一眼记账。',
  平安夜: '平安就好。',
  圣诞节: '给自己一份礼物。',
  跨年夜: '回头看一眼这一年，再往前走。',
  除夕: '团圆的一晚，把手机放一会儿。',
  春节: '新年快乐，万事从头。',
  元宵: '灯一亮，年就过完了。',
  端午: '粽子、艾草、龙舟——也别忘了午睡。',
  七夕: '鹊桥今晚搭起来了。',
  中秋: '月亮圆的时候，人也该聚一聚。',
  重阳: '登高望远，给家里长辈打个电话。',
};

export const FESTIVAL_EN: Record<string, string> = {
  元旦: "New Year's Day", 情人节: "Valentine's Day", 妇女节: "Women's Day", 劳动节: 'Labour Day', 青年节: 'Youth Day',
  儿童节: "Children's Day", 教师节: "Teachers' Day", 国庆节: 'National Day', 万圣夜: 'Halloween', 双十一: "Singles' Day",
  平安夜: 'Christmas Eve', 圣诞节: 'Christmas', 跨年夜: "New Year's Eve", 除夕: "Lunar New Year's Eve", 春节: 'Spring Festival',
  元宵: 'Lantern Festival', 端午: 'Dragon Boat Festival', 七夕: 'Qixi', 中秋: 'Mid-Autumn', 重阳: 'Double Ninth',
};

/** 公历固定节日（MM-DD） */
const SOLAR_FESTIVALS: Record<string, string> = {
  '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '05-01': '劳动节',
  '05-04': '青年节', '06-01': '儿童节', '09-10': '教师节', '10-01': '国庆节', '10-31': '万圣夜',
  '11-11': '双十一', '12-24': '平安夜', '12-25': '圣诞节', '12-31': '跨年夜',
};

/**
 * 农历节日（查表）。2026～2028 沿用成长总结那份；2029～2030 按年历抄录，2028 年底前再核一次。
 */
const LUNAR_FESTIVALS: Record<string, string> = {
  '2026-02-16': '除夕', '2026-02-17': '春节', '2026-03-03': '元宵', '2026-06-19': '端午', '2026-08-19': '七夕', '2026-09-25': '中秋', '2026-10-18': '重阳',
  '2027-02-05': '除夕', '2027-02-06': '春节', '2027-02-20': '元宵', '2027-06-09': '端午', '2027-08-08': '七夕', '2027-09-15': '中秋', '2027-10-08': '重阳',
  '2028-01-25': '除夕', '2028-01-26': '春节', '2028-02-09': '元宵', '2028-05-28': '端午', '2028-07-27': '七夕', '2028-10-03': '中秋', '2028-10-26': '重阳',
  '2029-02-12': '除夕', '2029-02-13': '春节', '2029-02-27': '元宵', '2029-06-16': '端午', '2029-08-16': '七夕', '2029-09-22': '中秋', '2029-10-16': '重阳',
  '2030-02-02': '除夕', '2030-02-03': '春节', '2030-02-17': '元宵', '2030-06-05': '端午', '2030-08-05': '七夕', '2030-09-12': '中秋', '2030-10-05': '重阳',
};

/** 某天的节日名（先农历表、再公历表）；成长总结的简报也用它 */
export function festivalOf(dateKey: string): string | undefined {
  return LUNAR_FESTIVALS[dateKey] ?? SOLAR_FESTIVALS[dateKey.slice(5)];
}

const slugOf = (s: string) => Array.from(s).map((ch) => ch.codePointAt(0)!.toString(16)).join('');

/** 某天的节日印记（没有返回 null） */
export function festivalMarkOf(dateKey: string): SeasonMark | null {
  const name = festivalOf(dateKey);
  if (!name) return null;
  return { key: `${dateKey}-festival-${slugOf(name)}`, name, kind: 'festival', note: FESTIVAL_NOTES[name] ?? '', index: -1, date: dateKey };
}

/** 某天的节气印记（没有返回 null） */
export function termMarkOf(dateKey: string): SeasonMark | null {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return solarTermsOf(year).find((t) => t.date === dateKey) ?? null;
}

/** 今天该盖的印：节气优先（清明既是节气也是节日，按节气算），其次节日 */
export function seasonMarkOf(dateKey: string): SeasonMark | null {
  return termMarkOf(dateKey) ?? festivalMarkOf(dateKey);
}

/** 岁时册一年的格子：24 节气 + 当年有的节日，按日期排 */
export function seasonMarksOfYear(year: number): SeasonMark[] {
  const marks = [...solarTermsOf(year)];
  const seen = new Set(marks.map((m) => m.date));
  for (const md of Object.keys(SOLAR_FESTIVALS)) {
    const key = `${year}-${md}`;
    if (!seen.has(key)) marks.push(festivalMarkOf(key)!);
  }
  for (const key of Object.keys(LUNAR_FESTIVALS)) {
    if (key.startsWith(`${year}-`) && !seen.has(key)) {
      const m = festivalMarkOf(key);
      if (m && !marks.some((x) => x.key === m.key)) marks.push(m);
    }
  }
  return marks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ── 岁时册的四季分页 ─────────────────────────────────────────────────────

export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASON_ORDER: SeasonKey[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_META: Record<SeasonKey, { name: string; en: string }> = {
  spring: { name: '春', en: 'SPRING' },
  summer: { name: '夏', en: 'SUMMER' },
  autumn: { name: '秋', en: 'AUTUMN' },
  winter: { name: '冬', en: 'WINTER' },
};

/** 某天属于哪一季：按四立分界（立春前的一月、二月初算冬） */
export function seasonOfDate(dateKey: string): SeasonKey {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(year)) return 'spring';
  const terms = solarTermsOf(year);
  const at = (name: SolarTermName) => terms.find((t) => t.name === name)!.date;
  if (dateKey < at('立春')) return 'winter';
  if (dateKey < at('立夏')) return 'spring';
  if (dateKey < at('立秋')) return 'summer';
  if (dateKey < at('立冬')) return 'autumn';
  return 'winter';
}

export interface SeasonPage { key: SeasonKey; name: string; en: string; marks: SeasonMark[] }

/**
 * 岁时册一年分成春夏秋冬四页（用户拍板：不整页枚举，左右翻）。
 * 冬页按季节先后排：立冬起的在前，年初立春前的小寒 / 大寒 / 元旦 / 春节前那些排在后面。
 */
export function seasonPagesOf(year: number): SeasonPage[] {
  const pages: SeasonPage[] = SEASON_ORDER.map((key) => ({ key, ...SEASON_META[key], marks: [] }));
  const lichun = solarTermsOf(year).find((t) => t.name === '立春')!.date;
  for (const m of seasonMarksOfYear(year)) pages[SEASON_ORDER.indexOf(seasonOfDate(m.date))].marks.push(m);
  const winterKey = (m: SeasonMark) => (m.date < lichun ? `1${m.date}` : `0${m.date}`);
  pages[3].marks.sort((a, b) => (winterKey(a) < winterKey(b) ? -1 : winterKey(a) > winterKey(b) ? 1 : 0));
  return pages;
}
