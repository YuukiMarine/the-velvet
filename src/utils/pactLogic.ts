/**
 * pactLogic —— 一起进步（v2.7.0.6）的纯计算：哪天算「同步」、连续几天、到期没有、该发哪些亲密度奖励。
 *
 * 不碰网络、不碰数据库，两台设备拿同一份约定记录算出来的结果一致；
 * 奖励用确定的事件 id（pact-<id>-…），同一台设备重复对账也不会重复加。
 */
import type { CoopPact, Todo } from '@/types';

/** 同一天两人都完成 */
export const PACT_SYNC_DELTA = 1;
/** 连续同步每满这么多天，额外奖励一次 */
export const PACT_STREAK_BLOCK = 7;
export const PACT_STREAK_BONUS = 2;
/** 每日打卡到期、同步率达标时的额外奖励（按约定天数） */
export const PACT_FINISH_BONUS: Record<number, number> = { 7: 2, 14: 3, 30: 5 };
export const PACT_FINISH_RATE = 0.8;
/** 一次性目标两人都完成 */
export const PACT_ONCE_BONUS = 2;
/** 每日打卡可选天数；0 = 不设期限 */
export const PACT_DAYS_OPTIONS = [7, 14, 30, 0] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');
const keyOfDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** YYYY-MM-DD 往后挪 n 天（按本地日历日，夏令时不影响） */
export const addDays = (key: string, n: number): string => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return keyOfDate(d);
};
const dayNumber = (key: string) => Math.round(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86400000);

export type PactSide = 'from' | 'to';
export const sideOf = (p: CoopPact, me: string): PactSide => (p.fromId === me ? 'from' : 'to');
export const partnerIdOf = (p: CoopPact, me: string): string => (p.fromId === me ? p.toId : p.fromId);
export const myDoneDays = (p: CoopPact, me: string): string[] => (sideOf(p, me) === 'from' ? p.doneFrom : p.doneTo);
export const theirDoneDays = (p: CoopPact, me: string): string[] => (sideOf(p, me) === 'from' ? p.doneTo : p.doneFrom);
export const myTitle = (p: CoopPact, me: string): string =>
  p.mode === 'same' || sideOf(p, me) === 'from' ? p.titleFrom : (p.titleTo || p.titleFrom);
export const theirTitle = (p: CoopPact, me: string): string =>
  p.mode === 'same' || sideOf(p, me) === 'to' ? p.titleFrom : (p.titleTo || p.titleFrom);
export const partnerNameOf = (p: CoopPact): string =>
  p.otherProfile?.nickname || p.otherProfile?.userId || '好友';

/** 约定的最后一天：每日打卡 = 开始日 + 天数 - 1；一次性 = 截止日；不设期限 = null */
export function pactLastDay(p: CoopPact): string | null {
  if (p.kind === 'once') return p.deadline ?? null;
  if (!p.startDay || !p.days) return null;
  return addDays(p.startDay, p.days - 1);
}

/** 第几天（从 1 数）；还没开始为 0 */
export function pactDayIndex(p: CoopPact, today: string): number {
  if (!p.startDay || today < p.startDay) return 0;
  return dayNumber(today) - dayNumber(p.startDay) + 1;
}

/** 约定内（开始日到最后一天 / 今天）的日子里，两人都打了卡的 */
export function syncedDays(p: CoopPact): string[] {
  if (p.kind !== 'daily' || !p.startDay) return [];
  const last = pactLastDay(p);
  const theirs = new Set(p.doneTo);
  return [...new Set(p.doneFrom)]
    .filter(d => theirs.has(d) && d >= p.startDay! && (!last || d <= last))
    .sort();
}

/** 一次性目标：两人都完成了 */
export const onceBothDone = (p: CoopPact): boolean =>
  p.kind === 'once' && p.doneFrom.length > 0 && p.doneTo.length > 0;

/** 到期没有：每日打卡过了最后一天；一次性目标两人都完成或过了截止日 */
export function isPactOver(p: CoopPact, today: string): boolean {
  if (p.kind === 'once') return onceBothDone(p) || (!!p.deadline && today > p.deadline);
  const last = pactLastDay(p);
  return !!last && today > last;
}

/** 收尾时该落的状态：达成 / 过期 */
export function closingStatus(p: CoopPact): 'finished' | 'expired' {
  if (p.kind === 'once') return onceBothDone(p) ? 'finished' : 'expired';
  return 'finished';
}

/** 同步率（仅限有期限的每日打卡） */
export function syncRate(p: CoopPact): number {
  if (p.kind !== 'daily' || !p.days) return 0;
  return syncedDays(p).length / p.days;
}

/** 连续同步天数：截到今天（今天还没同步就截到昨天） */
export function syncStreak(p: CoopPact, today: string): number {
  const set = new Set(syncedDays(p));
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export interface PactAward { eventId: string; delta: number; reason: string }

/**
 * 这份约定到目前为止应得的全部亲密度奖励（只给在线同伴用；普通好友不涨亲密度）。
 * 事件 id 固定：同一天 / 同一段连续 / 同一次到期，只会被记一次。
 */
export function pactAwards(p: CoopPact, today: string, titleForReason: string): PactAward[] {
  const out: PactAward[] = [];
  if (p.kind === 'daily') {
    const days = syncedDays(p);
    for (const d of days) {
      out.push({ eventId: `pact-${p.id}-day-${d}`, delta: PACT_SYNC_DELTA, reason: `一起进步：${d.slice(5).replace('-', '/')} 两人都完成了「${titleForReason}」` });
    }
    // 连续段：每满 7 天一次
    let runStart = '';
    let runLen = 0;
    const flush = () => {
      for (let k = 1; k <= Math.floor(runLen / PACT_STREAK_BLOCK); k++) {
        out.push({ eventId: `pact-${p.id}-streak-${runStart}-${k}`, delta: PACT_STREAK_BONUS, reason: `一起进步：连续同步满 ${k * PACT_STREAK_BLOCK} 天` });
      }
    };
    for (let i = 0; i < days.length; i++) {
      if (i > 0 && dayNumber(days[i]) - dayNumber(days[i - 1]) === 1) runLen++;
      else { flush(); runStart = days[i]; runLen = 1; }
    }
    flush();
    // 到期：同步率达标
    if (p.days && (isPactOver(p, today) || p.status === 'finished') && syncRate(p) >= PACT_FINISH_RATE) {
      out.push({ eventId: `pact-${p.id}-finish`, delta: PACT_FINISH_BONUS[p.days] ?? PACT_STREAK_BONUS, reason: `一起进步：${p.days} 天的约定走完了，同步 ${Math.round(syncRate(p) * 100)}%` });
    }
  } else if (onceBothDone(p)) {
    out.push({ eventId: `pact-${p.id}-finish`, delta: PACT_ONCE_BONUS, reason: `一起进步：两人都完成了「${titleForReason}」` });
  }
  return out;
}

/** 今天这份约定在「我」眼里的样子（标记 / 催促按钮用） */
export interface PactTodayView {
  mineDone: boolean;
  theirsDone: boolean;
  /** 对方今天催过我 */
  nudgedMe: boolean;
  /** 我今天已经催过对方 */
  iNudged: boolean;
}

export function pactTodayView(p: CoopPact, me: string, today: string): PactTodayView {
  const mine = myDoneDays(p, me);
  const theirs = theirDoneDays(p, me);
  const once = p.kind === 'once';
  const side = sideOf(p, me);
  return {
    // 一次性目标：完成过一次就一直算完成
    mineDone: once ? mine.length > 0 : mine.includes(today),
    theirsDone: once ? theirs.length > 0 : theirs.includes(today),
    nudgedMe: (side === 'from' ? p.nudgeToDay : p.nudgeFromDay) === today,
    iNudged: (side === 'from' ? p.nudgeFromDay : p.nudgeToDay) === today,
  };
}

/** 进行中 / 等回应的约定（每位好友同一时间只有一个） */
export const isPactLive = (p: CoopPact): boolean => p.status === 'active' || p.status === 'pending';

/** 和这位好友的约定今天怎么样了，一句话 + 色调（羁绊卡标记、名片选项卡、详情页快捷入口共用）。没有约定返回 null */
export type PactTone = 'hot' | 'warm' | 'plain' | 'done';
export function pactStatusWith(p: CoopPact, partnerId: string, today: string): { text: string; tone: PactTone } {
  if (p.status === 'pending') {
    return p.toId === partnerId ? { text: '等回应', tone: 'plain' } : { text: '待回应', tone: 'hot' };
  }
  const me = p.fromId === partnerId ? p.toId : p.fromId;
  const v = pactTodayView(p, me, today);
  if (!v.mineDone && v.nudgedMe) return { text: 'Ta 催你了', tone: 'hot' };
  if (!v.mineDone) return { text: '还差你', tone: v.theirsDone ? 'warm' : 'plain' };
  if (!v.theirsDone) return { text: 'Ta 还没完成', tone: 'plain' };
  return { text: '今天已同步 ✓', tone: 'done' };
}

/**
 * 本地提醒（档 1）要写进快照的那份约定：今天还没完成、被催过的优先，其次今天还没完成的，
 * 都完成了就挑往后还有日子的（以后的日子照样提醒）。pacts 没拉到时按待办本身兜底。
 */
export function pickTogetherReminder(
  todos: Todo[],
  pacts: CoopPact[],
  today: string,
  isDoneToday: (todoId: string) => boolean,
  windowDays = 7,
): { partnerName: string; title: string; nudged: boolean; doneToday: boolean; daysAhead: number } | null {
  const cands: Array<{ partnerName: string; title: string; nudged: boolean; doneToday: boolean; daysAhead: number }> = [];
  for (const t of todos) {
    if (!t.pact || !t.isActive || t.archivedAt) continue;
    if (t.startDate && t.startDate > today) continue;
    const p = pacts.find(x => x.id === t.pact!.id);
    if (p && p.status !== 'active') continue;
    const me = p ? (p.fromId === t.pact.partnerId ? p.toId : p.fromId) : '';
    const last = p ? pactLastDay(p) : null;
    const daysAhead = last ? Math.max(0, Math.min(windowDays, dayNumber(last) - dayNumber(today))) : (t.pact.kind === 'daily' ? windowDays : 0);
    cands.push({
      partnerName: t.pact.partnerName,
      title: t.title,
      nudged: !!(p && me && pactTodayView(p, me, today).nudgedMe),
      doneToday: isDoneToday(t.id),
      daysAhead,
    });
  }
  return cands.find(c => c.nudged && !c.doneToday)
    ?? cands.find(c => !c.doneToday)
    ?? cands.find(c => c.daysAhead > 0)
    ?? null;
}
