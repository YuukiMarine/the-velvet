/**
 * navigatorHappenings — 近况流（第 25 批 · PRD §24.10.2）：「上次聊完之后，ta 的 App 里发生了什么」。
 *
 * 朋友提往事的第一种方式是「注意到变化」：大事收官、连续记录破纪录或断了、升级、⭐活动、新愿望、周目标进度、
 * 倒计时临近、快到的截止、这周花得比平时多。全部本地从记录算，零调用；按显著度排、取 5 条进上下文，
 * 每轮最多顺口提一件；提过的记账（navigatorTopics 的话题配额）不重提。
 * 口径：「记得」不是「评判」——条目只写事实；「断了 / 没做」这类只给督促型人格（coachStyle=push）。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { db } from '@/db';
import { BUILTIN_NAVIGATOR_PRESETS } from '@/constants/navigatorPresets';
import { dayLabelCN, keyOfDate, relativeDayCN, shiftKey } from '@/utils/navigatorClock';
import {
  achievementsUnlocked, activeCountdowns, activityDay, bigDealsCleared, dueSoonTodos, importantActivities, levelUps,
  recordStreak, streakBrokeYesterday, weekSpend,
} from '@/utils/navigatorRecords';
import type { NavigatorPreset } from '@/types';

export interface Happening {
  /** 唯一键（进话题配额的记账） */
  key: string;
  dateKey: string;
  text: string;
  /** 1–5，越大越值得提 */
  salience: number;
  /** 回复里出现其中任一就算提过了 */
  probes: string[];
}

export type CoachStyle = NonNullable<NavigatorPreset['coachStyle']>;
export const coachStyleOf = (p: Pick<NavigatorPreset, 'coachStyle' | 'id'>): CoachStyle =>
  p.coachStyle ?? (p.id === BUILTIN_NAVIGATOR_PRESETS[0].id ? 'push' : 'accompany');

const STREAK_MARKS = new Set([7, 14, 21, 30, 50, 100, 200, 365]);
const WINDOW_MIN_DAYS = 3;
const WINDOW_MAX_DAYS = 14;

/** 「上次聊完」是哪天：当前人格今天之前最近一场会话；没有就按 3 天前；最远 14 天 */
export async function happeningsSince(presetId: string, todayKey: string = toLocalDateKey()): Promise<string> {
  const cat = BUILTIN_NAVIGATOR_PRESETS[0].id;
  let last: string | undefined;
  try {
    last = (await db.navigatorSessions.toArray())
      .filter((s) => (s.presetId ?? cat) === presetId && s.dateKey < todayKey)
      .map((s) => s.dateKey)
      .sort()
      .pop();
  } catch { /* 读不到就按缺省窗口 */ }
  const floor = shiftKey(todayKey, -WINDOW_MAX_DAYS);
  const dflt = shiftKey(todayKey, -WINDOW_MIN_DAYS);
  const since = last && last > floor ? last : floor;
  return since < dflt ? since : dflt;
}

/** 从记录里算近况（sinceKey 当天算在内） */
export function buildHappenings(sinceKey: string, coach: CoachStyle, todayKey: string = toLocalDateKey()): Happening[] {
  const s = useAppStore.getState();
  const out: Happening[] = [];
  const day = (k: string) => `${dayLabelCN(k, todayKey)}${k === todayKey ? '' : `，${relativeDayCN(k, todayKey)}`}`;

  for (const { todo, dateKey } of bigDealsCleared(sinceKey).slice(0, 2)) {
    out.push({ key: `bigdeal:${todo.id}`, dateKey, salience: 5, text: `${day(dateKey)}：大事「${todo.title}」收官${todo.steps?.length ? `（${todo.steps.length} 步全做完）` : ''}`, probes: [todo.title] });
  }
  for (const w of s.wishes) {
    if (!w.fulfilledAt) continue;
    const k = toLocalDateKey(new Date(w.fulfilledAt));
    if (k >= sinceKey) out.push({ key: `wish-done:${w.id}`, dateKey: k, salience: 5, text: `${day(k)}：愿望「${w.title}」实现了`, probes: [w.title] });
  }
  for (const a of achievementsUnlocked(sinceKey, 2)) {
    out.push({ key: `ach:${a.title}:${a.dateKey}`, dateKey: a.dateKey, salience: 4, text: `${day(a.dateKey)}：解锁了成就「${a.title}」`, probes: [a.title, '成就'] });
  }
  for (const a of levelUps(sinceKey, 2)) {
    const k = activityDay(a);
    out.push({ key: `lv:${a.id}`, dateKey: k, salience: 4, text: `${day(k)}：${a.description.slice(0, 40)}`, probes: ['升到', '升级', 'Lv'] });
  }
  for (const a of importantActivities(sinceKey, 2)) {
    const k = activityDay(a);
    out.push({ key: `star:${a.id}`, dateKey: k, salience: 4, text: `${day(k)}：ta 标了 ⭐ 的记录「${a.description.slice(0, 40)}」`, probes: [a.description.slice(0, 8)] });
  }
  const streak = recordStreak(todayKey);
  if (streak.days > 0 && STREAK_MARKS.has(streak.days)) {
    const k = streak.endsToday ? todayKey : shiftKey(todayKey, -1);
    if (k >= sinceKey) out.push({ key: `streak:${streak.days}:${k}`, dateKey: k, salience: 4, text: `${day(k)}：连续记录满 ${streak.days} 天`, probes: ['连续', `${streak.days} 天`, `${streak.days}天`] });
  }
  if (coach === 'push') {
    const broke = streakBrokeYesterday(todayKey);
    if (broke) out.push({ key: `streak-break:${shiftKey(todayKey, -1)}`, dateKey: shiftKey(todayKey, -1), salience: 3, text: `${day(shiftKey(todayKey, -1))}：没记录，之前连着记了 ${broke} 天（事实而已，别念叨）`, probes: ['断了', '没记', '昨天'] });
  }
  for (const g of s.weeklyGoals) {
    if (g.completed && g.completedAt) {
      const k = toLocalDateKey(new Date(g.completedAt));
      if (k >= sinceKey) out.push({ key: `wg-done:${g.id}`, dateKey: k, salience: 4, text: `${day(k)}：本周目标全部达成${g.reward ? `（奖励「${g.reward}」）` : ''}`, probes: ['周目标', '本周目标', '目标'] });
    } else if (!g.completed && g.weekStart <= todayKey && g.weekEnd >= todayKey) {
      const items = s.getWeeklyGoalProgress(g);
      const ratio = items.length ? items.reduce((n, it) => n + Math.min(1, it.current / Math.max(1, it.target)), 0) / items.length : 0;
      if (ratio >= 0.8) out.push({ key: `wg-near:${g.id}:${todayKey}`, dateKey: todayKey, salience: 2, text: `本周目标已经做到 ${Math.round(ratio * 100)}%`, probes: ['周目标', '本周目标'] });
    }
  }
  for (const { card, daysLeft } of activeCountdowns(todayKey).filter((x) => x.daysLeft <= 7).slice(0, 2)) {
    out.push({ key: `cd:${card.id}:${todayKey}`, dateKey: todayKey, salience: 3, text: `倒计时「${card.title}」${daysLeft === 0 ? '就是今天' : `还有 ${daysLeft} 天（${dayLabelCN(card.targetDate!, todayKey)}）`}`, probes: [card.title] });
  }
  for (const { todo, daysLeft } of dueSoonTodos(3, todayKey).slice(0, 2)) {
    out.push({ key: `ddl:${todo.id}:${todayKey}`, dateKey: todayKey, salience: 3, text: `任务「${todo.title}」${daysLeft === 0 ? '今天截止' : `还有 ${daysLeft} 天截止（${dayLabelCN(todo.deadline!, todayKey)}）`}`, probes: [todo.title] });
  }
  for (const w of s.wishes) {
    if (w.parentId || w.status !== 'active') continue;
    const k = keyOfDate(new Date(w.createdAt));
    if (k >= sinceKey) out.push({ key: `wish-new:${w.id}`, dateKey: k, salience: 3, text: `${day(k)}：新许了愿望「${w.title}」`, probes: [w.title] });
  }
  if (coach === 'push') {
    const sp = weekSpend(todayKey);
    if (sp.avgPrev > 0 && sp.thisWeek > 100 && sp.thisWeek > sp.avgPrev * 1.5) {
      out.push({ key: `spend:${sp.weekStart}`, dateKey: todayKey, salience: 2, text: `这周到现在花了 ¥${Math.round(sp.thisWeek)}，前四周平均一周 ¥${Math.round(sp.avgPrev)}（事实而已）`, probes: ['花', '账', '支出'] });
    }
  }
  return out.sort((a, b) => b.salience - a.salience || b.dateKey.localeCompare(a.dateKey));
}

/** 注入块；items 已经按配额过滤 */
export function happeningsBlock(items: Happening[]): string {
  if (!items.length) return '';
  return `【最近发生的事（上次聊完之后，ta 的记录里的；最多顺口提一件，像朋友想起来那样，不是汇报；提过的不再提）】\n${items.slice(0, 5).map((h) => `- ${h.text}`).join('\n')}`;
}
