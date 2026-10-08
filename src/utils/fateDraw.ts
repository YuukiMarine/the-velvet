import type { Activity, AttributeId, FateCandidate } from '@/types';

/**
 * 抽签（「命运会替你选择」）的候选筛选与加权（第 17 批）——纯函数，store 和测试共用。
 *
 * 用户反馈「旧事老让人再做一次性、已经做过的事」：以前旧事 = 近 30 天每一条手记（标题去重、不看次数），
 * 抽签又对所有条目一视同仁随机——旧事条数最多，所以总抽到它，体检、搬家这类一次性的事也在里面。现在：
 *   - 旧事只收「做过不止一天」的：近 60 天里至少两天记过同一件事（标题去掉数字和跟在数字后的量词再比，
 *     「跑步 3 公里」「跑步5km」算同一件）；今天、昨天做过的不出；
 *   - 隔得越久（相对它平时多久做一次）越容易抽到；池子里最多 2 张；「以后别抽这件」的不出；
 *   - 抽的时候按来源加权：今日待办 > 愿望 > 今日委托 = 旧事。
 */

export const FATE_SOURCE_WEIGHT: Record<FateCandidate['kind'], number> = { todo: 2, wish: 1.5, quest: 1, history: 1 };
/** 旧事在池子里最多几张 */
export const FATE_HISTORY_MAX = 2;
/** 旧事往回看多少天 */
export const FATE_HISTORY_DAYS = 60;

const pad = (n: number) => String(n).padStart(2, '0');
const dayKeyOf = (d: Date | string): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const dayIndexOf = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400_000);
};

const UNIT = '(?:公里|千米|km|米|m|分钟|分|小时|个小时|钟头|秒|个|次|遍|页|章|节|篇|首|杯|瓶|组|下|圈|步|天|kg|公斤|斤|元|块|本|集|部)';
const NUM = '(?:[0-9０-９]+(?:\\.[0-9]+)?|[一二三四五六七八九十两半百千万]+)';

/**
 * 「同一件事」的键：去掉「数字 + 量词」、剩下的数字、空白和标点，转小写。
 * 量词只在紧跟数字时才去（「天文」「分享」里的字不动）。
 */
export function fateHistoryKey(title: string): string {
  return String(title ?? '')
    .toLowerCase()
    .replace(new RegExp(`${NUM}\\s*${UNIT}`, 'gi'), '')
    .replace(/[0-9０-９]+(?:\.[0-9]+)?/g, '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
const mulberry32 = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 按 weight 抽一张（weight 缺省 1；全 0 时退回均匀） */
export function pickWeighted<T extends { weight?: number }>(items: readonly T[], rnd: () => number = Math.random): T | null {
  if (!items.length) return null;
  const ws = items.map((c) => Math.max(0, c.weight ?? 1));
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(rnd() * items.length)];
  let x = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    x -= ws[i];
    if (x < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * 旧事候选：近 60 天里至少两天做过的事，今天 / 昨天做过的不出；按「隔了多久 ÷ 平时多久做一次」加权，
 * 按日期 + 用户做种抽最多 max 张（同一天打开几次是同一组；被沉底 / 拉黑的先剔掉再抽，空位由别的补上）。
 */
export function fateHistoryCandidates(opts: {
  activities: readonly Activity[];
  today: string;
  /** 「以后别抽这件」的键（fateHistoryKey） */
  muted?: readonly string[];
  /** 今天已经抽过 / 沉底的候选键（hist:…） */
  sunk?: ReadonlySet<string>;
  seed: string;
  max?: number;
}): FateCandidate[] {
  const end = dayIndexOf(opts.today);
  const groups = new Map<string, { days: Set<number>; last: Activity; lastIdx: number; firstIdx: number }>();
  for (const a of opts.activities) {
    // 只看自己手记的（排除完成任务 / 战斗 / 升级等机器记录与副记录）
    if (a.method !== 'local' || a.category) continue;
    const idx = dayIndexOf(dayKeyOf(a.date));
    const ago = end - idx;
    if (ago < 0 || ago >= FATE_HISTORY_DAYS) continue;
    const key = fateHistoryKey(a.description);
    if (!key) continue;
    const g = groups.get(key);
    if (!g) { groups.set(key, { days: new Set([idx]), last: a, lastIdx: idx, firstIdx: idx }); continue; }
    g.days.add(idx);
    if (idx > g.lastIdx || (idx === g.lastIdx && new Date(a.date).getTime() > new Date(g.last.date).getTime())) { g.last = a; g.lastIdx = idx; }
    if (idx < g.firstIdx) g.firstIdx = idx;
  }
  const muted = new Set(opts.muted ?? []);
  const cands: FateCandidate[] = [];
  for (const [key, g] of groups) {
    if (g.days.size < 2) continue; // 只做过一天的（多半是一次性的事）不出
    if (muted.has(key)) continue;
    const lastDaysAgo = end - g.lastIdx;
    if (lastDaysAgo < 2) continue; // 今天、昨天做过的不出
    const candKey = `hist:${key.slice(0, 40)}`;
    if (opts.sunk?.has(candKey)) continue;
    const interval = Math.max(1, (g.lastIdx - g.firstIdx) / (g.days.size - 1));
    const gap = Math.min(3, Math.max(0.5, lastDaysAgo / interval));
    const top = (Object.entries(g.last.pointsAwarded ?? {}) as Array<[AttributeId, number]>).sort((x, y) => y[1] - x[1])[0];
    cands.push({
      key: candKey,
      kind: 'history',
      title: g.last.description.trim(),
      attribute: top && top[1] > 0 ? top[0] : 'guts',
      points: top && top[1] > 0 ? Math.max(1, Math.min(5, top[1])) : 2,
      historyDays: g.days.size,
      lastDaysAgo,
      weight: FATE_SOURCE_WEIGHT.history * gap,
    });
  }
  // 最多 max 张：按权重不放回地抽（Efraimidis–Spirakis），按日期 + 用户做种
  const rnd = mulberry32(fnv1a(`fate-hist|${opts.seed}|${opts.today}`));
  return cands
    .map((c) => ({ c, k: Math.pow(rnd(), 1 / Math.max(0.01, c.weight ?? 1)) }))
    .sort((a, b) => b.k - a.k)
    .slice(0, opts.max ?? FATE_HISTORY_MAX)
    .map((x) => x.c);
}
