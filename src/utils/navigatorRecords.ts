/**
 * navigatorRecords — 助手读用户真实记录的公共取数（第 25 批 · PRD §24.10.2）。
 *
 * 别家陪伴 App 只有「用户说过什么」，我们有「用户做过什么」：活动、任务与完成、账本、周目标、愿望、
 * 倒计时（宣告卡）、同伴、成长总结的统计。这里只做纯计算（从 store 状态读，不碰 AI、不写库），
 * 给近况流（navigatorHappenings）、用户简报（navigatorBriefing）、做到过的事（navigatorGravity）、
 * 只读查询（navigatorQueries）和本地索引（navigatorIndex）共用。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { dayLabelCN, daysBetween, keyOfDate, shiftKey } from '@/utils/navigatorClock';
import type { Activity, AttributeId, CallingCard, PeriodSummary, Todo, Wish } from '@/types';

const ATTR_FALLBACK: Record<AttributeId, string> = { knowledge: '知识', guts: '胆量', dexterity: '灵巧', kindness: '温柔', charm: '魅力' };
export const attrName = (id: AttributeId): string => useAppStore.getState().settings.attributeNames?.[id] ?? ATTR_FALLBACK[id];
export const ATTR_ORDER: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

export const activityDay = (a: Activity): string => toLocalDateKey(new Date(a.date));
/** 用户自己记的（不含升级 / 解锁 / 结算这类系统产出的） */
export const isUserActivity = (a: Activity): boolean => !a.category;
export const pointsOf = (a: Activity): number => Object.values(a.pointsAwarded ?? {}).reduce((n, v) => n + (Number(v) || 0), 0);
export const gainsText = (a: Activity): string =>
  ATTR_ORDER.filter((id) => (a.pointsAwarded?.[id] ?? 0) > 0).map((id) => `${attrName(id)} +${a.pointsAwarded[id]}`).join(' ');

/** 有记录的日子集合（用户自己记的） */
export function recordDays(): Set<string> {
  const days = new Set<string>();
  for (const a of useAppStore.getState().activities) if (isUserActivity(a)) days.add(activityDay(a));
  return days;
}

/** 连续记录天数：从今天（今天没记就从昨天）往回数 */
export function recordStreak(todayKey: string = toLocalDateKey()): { days: number; endsToday: boolean } {
  const days = recordDays();
  const endsToday = days.has(todayKey);
  let cursor = endsToday ? todayKey : shiftKey(todayKey, -1);
  let n = 0;
  while (days.has(cursor) && n < 1000) { n++; cursor = shiftKey(cursor, -1); }
  return { days: n, endsToday };
}

/** 昨天断了：昨天没记、前面连着记了 ≥ minRun 天 */
export function streakBrokeYesterday(todayKey: string = toLocalDateKey(), minRun = 5): number {
  const days = recordDays();
  const y = shiftKey(todayKey, -1);
  if (days.has(y) || days.has(todayKey)) return 0;
  let cursor = shiftKey(todayKey, -2);
  let n = 0;
  while (days.has(cursor) && n < 1000) { n++; cursor = shiftKey(cursor, -1); }
  return n >= minRun ? n : 0;
}

/** 某条每日任务近 N 天做到了几天（按 todoCompletions） */
export function completionDays(todoId: string, days: number, todayKey: string = toLocalDateKey()): { done: number; last?: string } {
  const since = shiftKey(todayKey, -(days - 1));
  const rows = useAppStore.getState().todoCompletions.filter((c) => c.todoId === todoId && c.count > 0 && c.date >= since && c.date <= todayKey);
  const set = new Set(rows.map((c) => c.date));
  const last = [...set].sort().pop();
  return { done: set.size, last };
}

/** 长期习惯：每日任务按近 30 天完成率排 */
export function habits(limit = 3, todayKey: string = toLocalDateKey()): Array<{ todo: Todo; done: number; last?: string }> {
  const s = useAppStore.getState();
  return s.todos
    .filter((t) => t.isActive && !t.archivedAt && t.repeatDaily && !t.pact && !t.orgOp)
    .map((t) => ({ todo: t, ...completionDays(t.id, 30, todayKey) }))
    .filter((h) => h.done > 0)
    .sort((a, b) => b.done - a.done)
    .slice(0, limit);
}

/** 收官的大事（按完成时间倒序） */
export function bigDealsCleared(sinceKey?: string): Array<{ todo: Todo; dateKey: string }> {
  return useAppStore.getState().todos
    .filter((t) => t.isBigDeal && t.clearedActivityId && t.completedAt)
    .map((t) => ({ todo: t, dateKey: toLocalDateKey(new Date(t.completedAt!)) }))
    .filter((x) => !sinceKey || x.dateKey >= sinceKey)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

/** ⭐ 重要活动（用户自己标的） */
export function importantActivities(sinceKey?: string, limit = 5): Activity[] {
  return useAppStore.getState().activities
    .filter((a) => a.important && isUserActivity(a) && (!sinceKey || activityDay(a) >= sinceKey))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

/** 升级记录（系统活动 category=level_up） */
export function levelUps(sinceKey?: string, limit = 3): Activity[] {
  return useAppStore.getState().activities
    .filter((a) => a.category === 'level_up' && (!sinceKey || activityDay(a) >= sinceKey))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

export function achievementsUnlocked(sinceKey?: string, limit = 3) {
  return useAppStore.getState().achievements
    .filter((a) => a.unlocked && a.unlockedDate && (!sinceKey || toLocalDateKey(new Date(a.unlockedDate)) >= sinceKey))
    .sort((a, b) => new Date(b.unlockedDate!).getTime() - new Date(a.unlockedDate!).getTime())
    .slice(0, limit)
    .map((a) => ({ title: a.title, dateKey: toLocalDateKey(new Date(a.unlockedDate!)) }));
}

/** 进行中的倒计时（宣告卡，带日期的） */
export function activeCountdowns(todayKey: string = toLocalDateKey()): Array<{ card: CallingCard; daysLeft: number }> {
  return useAppStore.getState().callingCards
    .filter((c) => !c.archived && c.targetDate && c.targetDate >= todayKey)
    .map((c) => ({ card: c, daysLeft: daysBetween(todayKey, c.targetDate!) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** 快到截止日、还没完成的任务 */
export function dueSoonTodos(withinDays: number, todayKey: string = toLocalDateKey()): Array<{ todo: Todo; daysLeft: number }> {
  const s = useAppStore.getState();
  return s.todos
    .filter((t) => t.isActive && !t.archivedAt && t.deadline && t.deadline >= todayKey && !t.completedAt)
    .map((t) => ({ todo: t, daysLeft: daysBetween(todayKey, t.deadline!) }))
    .filter((x) => x.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** 正在追的愿望（父级、活跃） */
export function activeWishes(limit = 3): Wish[] {
  return useAppStore.getState().wishes
    .filter((w) => w.status === 'active' && !w.parentId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
export const wishProgress = (w: Wish): number | undefined => (typeof w.progressPct === 'number' ? Math.round(w.progressPct) : undefined);

/** 本周 / 前四周的支出（账本） */
export function weekSpend(todayKey: string = toLocalDateKey()): { thisWeek: number; avgPrev: number; weekStart: string } {
  const d = new Date(todayKey + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // 周一 = 0
  const weekStart = shiftKey(todayKey, -dow);
  const prevStart = shiftKey(weekStart, -28);
  let thisWeek = 0;
  let prev = 0;
  for (const e of useAppStore.getState().ledgerEntries) {
    if (e.direction !== 'expense') continue;
    if (e.date >= weekStart && e.date <= todayKey) thisWeek += e.amount;
    else if (e.date >= prevStart && e.date < weekStart) prev += e.amount;
  }
  return { thisWeek, avgPrev: prev / 4, weekStart };
}

/** 属性排名（按点数） */
export function attrRanking(): Array<{ id: AttributeId; level: number; points: number }> {
  return [...useAppStore.getState().attributes]
    .map((a) => ({ id: a.id, level: a.level, points: a.points }))
    .sort((a, b) => b.points - a.points);
}

/**
 * 成长总结的中性事实（第 25 批）：总结正文和手记是「写信人」的口吻，助手不能用；只从统计字段和那一期的记录算几句数据。
 * 「第 41 周（10月5日–10月11日）：记录 23 条、总点数 48，最多的是知识 20；大事「论文初稿」收官；⭐ 2 条」
 */
export function summaryFacts(sum: PeriodSummary, todayKey: string = toLocalDateKey()): string {
  const s = useAppStore.getState();
  const top = Object.entries(sum.attributePoints ?? {}).sort((a, b) => b[1] - a[1])[0];
  const topText = top && top[1] > 0 && ATTR_ORDER.includes(top[0] as AttributeId) ? `最多的是${attrName(top[0] as AttributeId)} ${top[1]}` : '';
  const inPeriod = (k: string) => k >= sum.startDate && k <= sum.endDate;
  const bigs = s.todos.filter((t) => t.isBigDeal && t.clearedActivityId && t.completedAt && inPeriod(toLocalDateKey(new Date(t.completedAt)))).map((t) => `「${t.title}」`);
  const stars = s.activities.filter((a) => a.important && isUserActivity(a) && inPeriod(activityDay(a))).length;
  const parts = [
    `记录 ${sum.activityCount} 条、总点数 ${sum.totalPoints}${topText ? `，${topText}` : ''}`,
    bigs.length ? `大事${bigs.slice(0, 2).join('')}收官` : '',
    stars ? `⭐ ${stars} 条` : '',
  ].filter(Boolean);
  return `${sum.label}（${dayLabelCN(sum.startDate, todayKey)}–${dayLabelCN(sum.endDate, todayKey)}）：${parts.join('；')}`;
}

/** 最近 N 期已写好的总结（按结束日倒序） */
export function recentSummaries(limit = 2): PeriodSummary[] {
  return [...useAppStore.getState().summaries]
    .filter((s) => s.period === 'week' || s.period === 'month')
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, limit);
}

/** 用了多久、记了多少 */
export function usageFacts(todayKey: string = toLocalDateKey()): { days: number; records: number; firstKey?: string } {
  const s = useAppStore.getState();
  const userActs = s.activities.filter(isUserActivity);
  const first = userActs.length ? userActs.map(activityDay).sort()[0] : undefined;
  const created = s.user?.createdAt ? keyOfDate(new Date(s.user.createdAt)) : first;
  const start = created && first ? (created < first ? created : first) : (created ?? first);
  return { days: start ? daysBetween(start, todayKey) + 1 : 0, records: userActs.length, firstKey: start };
}
