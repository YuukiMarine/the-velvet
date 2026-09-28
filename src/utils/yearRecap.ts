/**
 * yearRecap — 年度开场的数字（v2.7.0.6）。
 *
 * 全在本机算、不调 AI：生成年度总结时算一次，定格进 PeriodSummary.recap（跟着总结同步），
 * 之后「重温开场」原样放——数据改了、换了设备，那一年的样子不变。
 * 口径与年度简报（summaryAI.buildSummaryBrief）一致：记录范围、特殊条目开关都用同一套筛选，
 * 开场上的数字和信里表格对得上。某项没有数据就留空，对应的卡跳过。
 */
import { db } from '@/db';
import type { Activity, AttributeId, Settings, YearRecap, YearRecapLine } from '@/types';
import { CATEGORY_TAGS, includeActivity } from '@/utils/summaryAI';
import { localDayNumber } from '@/utils/streak';

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const noonOf = (k: string): Date => new Date(`${k}T12:00:00`);
/** 日序号 → YYYY-MM-DD（localDayNumber 是按本地年月日折成 UTC 的，反过来按 UTC 取） */
const keyOfDayNumber = (n: number): string => {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};
const clip = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const pointsOf = (a: Activity): number => ATTRS.reduce((s, k) => s + (a.pointsAwarded?.[k] ?? 0), 0);
const byDate = (a: Activity, b: Activity) => new Date(a.date).getTime() - new Date(b.date).getTime();
/** 里程碑：有标签的系统条目（同伴除外）——和简报里「里程碑 / 标了重要的」同一口径 */
const isMilestone = (a: Activity): boolean => !!a.category && a.category !== 'confidant' && !!CATEGORY_TAGS[a.category];

export async function buildYearRecap(year: number, settings: Settings, now: Date = new Date()): Promise<YearRecap> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const today = keyOf(now);
  const asOf = today > end ? end : today < start ? start : today;
  const spanDays = localDayNumber(noonOf(asOf)) - localDayNumber(noonOf(start)) + 1;
  const names = settings.attributeNames as Record<AttributeId, string>;
  const includeSpecial = settings.summaryIncludeSpecial === true;

  const [acts, completions, todos, draws, cards, wishes, images] = await Promise.all([
    db.activities.toArray(),
    db.todoCompletions.toArray(),
    db.todos.toArray(),
    db.dailyDivinations.toArray(),
    db.callingCards.toArray().catch(() => []),
    db.wishes.toArray().catch(() => []),
    db.activityImages.toArray().catch(() => []),
  ]);
  const dk = (a: Activity) => keyOf(new Date(a.date));
  const inYear = (k: string) => k >= start && k <= end;

  const included = acts.filter(a => inYear(dk(a)) && includeActivity(a, includeSpecial)).sort(byDate);
  // 连续、熬夜、记忆只认当时写下的：补记的时间是事后挑的
  const genuine = included.filter(a => !a.backfilled);
  const own = genuine.filter(a => !a.category);

  // ── 来过的日子 ──
  const monthly = Array.from({ length: 12 }, () => 0);
  for (const a of included) monthly[new Date(a.date).getMonth()]++;
  const daysRecorded = new Set(included.map(dk)).size;

  let habit: YearRecap['habit'];
  const buckets: Record<string, number> = { 早上: 0, 中午: 0, 下午: 0, 晚上: 0, 深夜: 0 };
  for (const a of own) {
    const h = new Date(a.date).getHours();
    if (h >= 5 && h < 11) buckets.早上++; else if (h >= 11 && h < 14) buckets.中午++; else if (h >= 14 && h < 18) buckets.下午++; else if (h >= 18 && h < 23) buckets.晚上++; else buckets.深夜++;
  }
  const topBucket = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
  if (own.length >= 5 && topBucket && topBucket[1] / own.length >= 0.4) {
    habit = { label: topBucket[0], pct: Math.round((topBucket[1] / own.length) * 100) };
  }

  // ── 最晚的一夜：23:00～次日 5:00 里最晚的一条；正零点多半是只挑了日期的，不算 ──
  let lateNight: YearRecap['lateNight'];
  let lateScore = -1;
  for (const a of own) {
    const d = new Date(a.date);
    const h = d.getHours(), m = d.getMinutes();
    if (!(h >= 23 || h < 5)) continue;
    if (h === 0 && m === 0 && d.getSeconds() === 0) continue;
    const score = (h < 5 ? h + 24 : h) * 60 + m;
    if (score >= lateScore) { lateScore = score; lateNight = { at: d.toISOString(), text: clip(a.description, 60) }; }
  }

  // ── 加点 ──
  const attrPts: Record<AttributeId, number> = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
  for (const a of included) for (const k of ATTRS) attrPts[k] += a.pointsAwarded?.[k] ?? 0;
  const points = ATTRS.reduce((s, k) => s + attrPts[k], 0);
  const attrs = ATTRS.map(id => ({ id, name: names[id] ?? id, points: attrPts[id] }));
  const prevStart = `${year - 1}-01-01`, prevEnd = `${year - 1}-12-31`;
  const prevActs = acts.filter(a => { const k = dk(a); return k >= prevStart && k <= prevEnd && includeActivity(a, includeSpecial); });
  const prevPoints = prevActs.length ? prevActs.reduce((s, a) => s + pointsOf(a), 0) : undefined;

  // ── 没断过的日子：年内最长连续（按日历日，夏令时不断链） ──
  let streak: YearRecap['streak'];
  const nums = [...new Set(genuine.map(a => localDayNumber(a.date)))].sort((a, b) => a - b);
  let best = { len: 0, s: 0 };
  let run = { len: 0, s: 0 };
  for (let i = 0; i < nums.length; i++) {
    run = i > 0 && nums[i] - nums[i - 1] === 1 ? { len: run.len + 1, s: run.s } : { len: 1, s: nums[i] };
    if (run.len >= best.len) best = { ...run };
  }
  if (best.len >= 2) streak = { days: best.len, start: keyOfDayNumber(best.s), end: keyOfDayNumber(best.s + best.len - 1) };

  let todosStat: YearRecap['todos'];
  const comps = completions.filter(c => inYear(c.date) && c.count > 0);
  if (comps.length) {
    const byTodo = new Map<string, number>();
    for (const c of comps) byTodo.set(c.todoId, (byTodo.get(c.todoId) ?? 0) + c.count);
    const [topId, topN] = [...byTodo.entries()].sort((a, b) => b[1] - a[1])[0];
    const title = todos.find(t => t.id === topId)?.title;
    todosStat = { checkins: comps.reduce((s, c) => s + c.count, 0), top: title ? { title: clip(title, 16), count: topN } : undefined };
  }

  // ── 高光：标了重要 / 里程碑的挑三件；一件都没有就挑加点最多的 ──
  const score = (a: Activity) => (a.important ? 100 : 0) + (isMilestone(a) ? 50 : 0) + pointsOf(a);
  let pool = included.filter(a => a.important || isMilestone(a));
  if (!pool.length) pool = included.filter(a => !a.category && pointsOf(a) > 0);
  const picked = [...pool].sort((a, b) => score(b) - score(a) || byDate(b, a)).slice(0, 3).sort(byDate);
  const highlights: YearRecapLine[] = picked.map(a => ({ date: dk(a), text: clip(a.description, 44) }));

  // ── 配图：高光里的先，其余按新到旧，最多六条记录 ──
  const withImage = new Set(images.map(r => r.activityId));
  const photoIds: string[] = [];
  for (const a of [...picked, ...[...included].reverse()]) {
    if (withImage.has(a.id) && !photoIds.includes(a.id)) photoIds.push(a.id);
    if (photoIds.length >= 6) break;
  }

  // ── 倒计时（不含终端的 24h 小步卡） ──
  let countdown: YearRecap['countdown'];
  const cc = cards.filter(c => !c.terminal);
  const reached = cc
    .filter(c => c.archived && c.archivedAt && inYear(keyOf(new Date(c.archivedAt))) && (c.archiveReason === 'auto_date' || c.archiveReason === 'auto_todos'))
    .sort((a, b) => new Date(a.archivedAt!).getTime() - new Date(b.archivedAt!).getTime())
    .map(c => ({ title: clip(c.title, 18), date: keyOf(new Date(c.archivedAt!)), how: (c.archiveReason === 'auto_todos' ? 'todos' : 'date') as 'date' | 'todos' }));
  const created = cc.filter(c => inYear(keyOf(new Date(c.createdAt)))).length;
  const upcoming = cc
    .filter(c => !c.archived && c.targetDate && c.targetDate > asOf)
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))[0];
  if (reached.length || created || upcoming) {
    countdown = {
      reached: reached.slice(-3),
      created,
      next: upcoming ? { title: clip(upcoming.title, 18), days: localDayNumber(noonOf(upcoming.targetDate!)) - localDayNumber(noonOf(asOf)) } : undefined,
    };
  }

  // ── 天气（第 6 轮）：记录上存的当时天气，只在本机有；≥ 5 条才给这张卡 ──
  let weather: YearRecap['weather'];
  const ww = own.filter(a => !!a.weather?.icon);
  if (ww.length >= 5) {
    const count = (icons: string[]) => ww.filter(a => icons.includes(a.weather!.icon)).length;
    weather = {
      total: ww.length,
      rainy: count(['rain', 'heavy-rain', 'thunder']),
      snowy: count(['snow']),
      sunny: count(['clear-day', 'clear-night']),
    };
  }

  // ── 塔罗：次数 + 来得最勤的一张（同样多取后来的那张） ──
  let tarot: YearRecap['tarot'];
  const yd = draws.filter(d => inYear(d.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (yd.length) {
    const freq = new Map<string, number>();
    for (const d of yd) freq.set(d.cardId, (freq.get(d.cardId) ?? 0) + 1);
    let top = yd[yd.length - 1].cardId;
    for (const d of yd) if ((freq.get(d.cardId) ?? 0) >= (freq.get(top) ?? 0)) top = d.cardId;
    tarot = { draws: yd.length, cardId: top, count: freq.get(top) ?? 1 };
  }

  // ── 愿望：实现了的；一个没实现就看这一年离它们近了多少 ──
  let wishStat: YearRecap['wishes'];
  const tops = wishes.filter(w => !w.parentId);
  const fulfilled: YearRecapLine[] = tops
    .filter(w => w.fulfilledAt && inYear(keyOf(new Date(w.fulfilledAt))))
    .sort((a, b) => new Date(a.fulfilledAt!).getTime() - new Date(b.fulfilledAt!).getTime())
    .map(w => ({ date: keyOf(new Date(w.fulfilledAt!)), text: clip(w.title, 18) }));
  const yStart = new Date(`${start}T00:00:00`).getTime();
  const yEnd = new Date(`${end}T23:59:59`).getTime();
  const closer = tops
    .filter(w => w.status === 'active' && !w.archivedAt)
    .map(w => {
      const hist = (w.progressHistory ?? []).filter(p => p && typeof p.pct === 'number' && !Number.isNaN(Date.parse(p.at)))
        .sort((a, b) => a.at.localeCompare(b.at));
      const within = hist.filter(p => { const t = Date.parse(p.at); return t >= yStart && t <= yEnd; });
      if (!within.length) {
        // 没有轨迹的：今年新许下、评估过的愿望，整段进度都是今年走的
        if (!hist.length && typeof w.progressPct === 'number' && w.progressPct > 0 && inYear(keyOf(new Date(w.createdAt)))) {
          return { title: clip(w.title, 18), gained: Math.round(w.progressPct), now: Math.round(w.progressPct) };
        }
        return null;
      }
      const before = hist.filter(p => Date.parse(p.at) < yStart).pop();
      const first = within[0];
      const startPct = before ? before.pct : Math.max(0, first.pct - (typeof first.delta === 'number' ? first.delta : first.pct));
      const endPct = within[within.length - 1].pct;
      const gained = Math.round(endPct - startPct);
      return gained > 0 ? { title: clip(w.title, 18), gained, now: Math.round(endPct) } : null;
    })
    .filter((x): x is { title: string; gained: number; now: number } => !!x)
    .sort((a, b) => b.gained - a.gained)
    .slice(0, 2);
  if (fulfilled.length || closer.length) wishStat = { fulfilled: fulfilled.slice(-3), closer };

  // ── 你的记忆：这一年写下的第一条和最近一条 ──
  let memory: YearRecap['memory'];
  const mem = own.length ? own : genuine;
  if (mem.length) {
    const f = mem[0], l = mem[mem.length - 1];
    const earlier = acts.some(a => !a.backfilled && !a.category && dk(a) < start);
    memory = {
      first: { date: dk(f), text: clip(f.description, 60) },
      last: { date: dk(l), text: clip(l.description, 60) },
      days: localDayNumber(l.date) - localDayNumber(f.date),
      records: mem.length,
      firstEver: !earlier,
    };
  }

  return {
    v: 1,
    year,
    asOf,
    spanDays,
    daysRecorded,
    records: included.length,
    monthly,
    habit,
    lateNight,
    points,
    attrs,
    prevPoints,
    streak,
    todos: todosStat,
    highlights,
    photoIds,
    countdown,
    tarot,
    weather,
    wishes: wishStat,
    memory,
  };
}
