/**
 * navigatorQueries — 助手的只读查询表（第 25 批 · PRD §24.10.2 G1）。
 *
 * 以前分诊只能查一种东西（近 N 天活动）；周目标、倒计时、账本汇总、塔罗、过去几天聊过什么都查不到，被问到只能说「记不清」。
 * 现在分诊从这张表里挑（一轮最多 2 个），本地执行、限长、返回名称不返回 uuid，结果作为事实交给表演。
 * 第 28 批原生 tool calling 的工具 schema 从这里生成。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { db } from '@/db';
import { TAROT_BY_ID } from '@/constants/tarot';
import { BUILTIN_NAVIGATOR_PRESETS } from '@/constants/navigatorPresets';
import { CATEGORY_META, INCOME_META } from '@/utils/ledgerFormat';
import { dayLabelCN, relativeDayCN, shiftKey } from '@/utils/navigatorClock';
import {
  activeCountdowns, activeWishes, activityDay, attrName, completionDays, gainsText, recentSummaries, summaryFacts, wishProgress,
} from '@/utils/navigatorRecords';
import type { LedgerExpenseType, LedgerIncomeType } from '@/types';

export type NavigatorQuery =
  | { kind: 'activities'; days: number; keyword?: string }
  | { kind: 'ledger'; days?: number; month?: string }
  | { kind: 'weeklyGoal' }
  | { kind: 'countdowns' }
  | { kind: 'todo'; todoId: string }
  | { kind: 'tarot'; days: number }
  | { kind: 'chats'; days: number }
  | { kind: 'wishes' }
  | { kind: 'summaries' };

export const MAX_QUERIES_PER_TURN = 2;
const MAX_CHARS = 1600;

/** 给分诊协议看的说明（写进 TRIAGE_PROTOCOL） */
export const QUERY_PROTOCOL = `- 需要查 App 里的数据才能回答时，把要查的放进 queries（最多 2 个；不需要就 []）：
  {"kind":"activities","days":1~30,"keyword":"可选，按关键词筛"} 过去的活动记录（今天的已经在清单里，不用查）
  {"kind":"ledger","days":1~90} 或 {"kind":"ledger","month":"YYYY-MM"} 账本汇总（花了多少、花在哪）
  {"kind":"weeklyGoal"} 本周目标的进度
  {"kind":"countdowns"} 倒计时 / 宣告卡还剩几天
  {"kind":"todo","todoId":"任务清单里的 id"} 某条任务的详情与近 30 天完成情况
  {"kind":"tarot","days":1~30} 最近几天抽到的塔罗
  {"kind":"chats","days":1~30} 最近几天和你聊过什么（摘要）
  {"kind":"wishes"} 愿望与进度
  {"kind":"summaries"} 最近的成长总结（只有数据）`;

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** 分诊输出 → 合法查询（认不出的丢掉；兼容旧的单个 query 字段） */
export function parseQueries(raw: unknown, legacy?: unknown): NavigatorQuery[] {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length && legacy && typeof legacy === 'object') list.push(legacy);
  const out: NavigatorQuery[] = [];
  for (const item of list) {
    const q = (item && typeof item === 'object') ? item as Record<string, unknown> : null;
    if (!q) continue;
    switch (q.kind) {
      case 'activities': out.push({ kind: 'activities', days: clampInt(q.days, 1, 30, 7), keyword: typeof q.keyword === 'string' && q.keyword.trim() ? q.keyword.trim().slice(0, 20) : undefined }); break;
      case 'ledger':
        if (typeof q.month === 'string' && /^\d{4}-\d{2}$/.test(q.month)) out.push({ kind: 'ledger', month: q.month });
        else out.push({ kind: 'ledger', days: clampInt(q.days, 1, 90, 30) });
        break;
      case 'weeklyGoal': out.push({ kind: 'weeklyGoal' }); break;
      case 'countdowns': out.push({ kind: 'countdowns' }); break;
      case 'todo': if (typeof q.todoId === 'string' && q.todoId) out.push({ kind: 'todo', todoId: q.todoId }); break;
      case 'tarot': out.push({ kind: 'tarot', days: clampInt(q.days, 1, 30, 7) }); break;
      case 'chats': out.push({ kind: 'chats', days: clampInt(q.days, 1, 30, 7) }); break;
      case 'wishes': out.push({ kind: 'wishes' }); break;
      case 'summaries': out.push({ kind: 'summaries' }); break;
      default: break;
    }
    if (out.length >= MAX_QUERIES_PER_TURN) break;
  }
  return out;
}

const cut = (s: string): string => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}…` : s);

// ── 各查询 ──

function qActivities(days: number, keyword: string | undefined, todayKey: string): string {
  const s = useAppStore.getState();
  const since = shiftKey(todayKey, -Math.min(30, Math.max(1, days)));
  const rows = s.activities
    .filter((a) => activityDay(a) >= since && activityDay(a) < todayKey)
    .filter((a) => !keyword || a.description.includes(keyword))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 40)
    .map((a) => { const g = gainsText(a); return `${activityDay(a)} ${a.description.slice(0, 40)}${g ? `（${g}）` : ''}${a.important ? ' ⭐' : ''}`; });
  const head = `【近 ${days} 天的活动记录${keyword ? `（含「${keyword}」）` : ''}，共 ${rows.length} 条】`;
  return rows.length ? `${head}\n${cut(rows.join('\n'))}` : `【近 ${days} 天没有${keyword ? `含「${keyword}」的` : ''}活动记录】`;
}

function qLedger(q: { days?: number; month?: string }, todayKey: string): string {
  const s = useAppStore.getState();
  let from: string;
  let to: string;
  let label: string;
  if (q.month) { from = `${q.month}-01`; to = `${q.month}-31`; label = `${Number(q.month.slice(5))} 月`; }
  else { from = shiftKey(todayKey, -(q.days ?? 30) + 1); to = todayKey; label = `近 ${q.days ?? 30} 天`; }
  const rows = s.ledgerEntries.filter((e) => e.date >= from && e.date <= to && e.direction !== 'adjust');
  if (!rows.length) return `【${label}没有记账】`;
  const expense = rows.filter((e) => e.direction === 'expense');
  const income = rows.filter((e) => e.direction === 'income');
  const sum = (arr: typeof rows) => Math.round(arr.reduce((n, e) => n + e.amount, 0) * 100) / 100;
  const byType = new Map<string, number>();
  for (const e of expense) { const k = e.type ? (CATEGORY_META[e.type as LedgerExpenseType]?.label ?? e.type) : '未分类'; byType.set(k, (byType.get(k) ?? 0) + e.amount); }
  const types = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ¥${Math.round(v)}`).join('、');
  const byIncome = new Map<string, number>();
  for (const e of income) { const k = e.incomeType ? (INCOME_META[e.incomeType as LedgerIncomeType]?.label ?? e.incomeType) : '其他'; byIncome.set(k, (byIncome.get(k) ?? 0) + e.amount); }
  const top = [...expense].sort((a, b) => b.amount - a.amount).slice(0, 5).map((e) => `${e.date} ¥${e.amount}${e.note ? `（${e.note.slice(0, 16)}）` : ''}`);
  const lines = [
    `【${label}的账（${rows.length} 笔）】`,
    `支出 ¥${sum(expense)}${types ? `：${types}` : ''}`,
    income.length ? `收入 ¥${sum(income)}${byIncome.size ? `：${[...byIncome.entries()].map(([k, v]) => `${k} ¥${Math.round(v)}`).join('、')}` : ''}` : '',
    top.length ? `最大的几笔：${top.join('；')}` : '',
  ].filter(Boolean);
  return cut(lines.join('\n'));
}

function qWeeklyGoal(todayKey: string): string {
  const s = useAppStore.getState();
  const g = s.weeklyGoals.find((x) => x.weekStart <= todayKey && x.weekEnd >= todayKey);
  if (!g) return '【这周没有设周目标】';
  const items = s.getWeeklyGoalProgress(g);
  const name = (it: typeof items[number]) => it.type === 'activity_count' ? `${it.attribute ? attrName(it.attribute) + '类' : ''}记录 ${it.target} 条`
    : it.type === 'todo_count' ? `完成任务 ${it.target} 次` : it.type === 'attr_points' ? `${it.attribute ? attrName(it.attribute) : ''}加 ${it.target} 点` : `总点数 ${it.target}`;
  return `【本周目标（${dayLabelCN(g.weekStart, todayKey)}–${dayLabelCN(g.weekEnd, todayKey)}）${g.completed ? '，已全部达成' : ''}】\n${items.map((it) => `- ${name(it)}：${it.current}/${it.target}${it.current >= it.target ? ' ✓' : ''}`).join('\n')}${g.reward ? `\n奖励：${g.reward}` : ''}`;
}

function qCountdowns(todayKey: string): string {
  const list = activeCountdowns(todayKey);
  const s = useAppStore.getState();
  const noDate = s.callingCards.filter((c) => !c.archived && !c.targetDate);
  if (!list.length && !noDate.length) return '【没有进行中的倒计时 / 宣告卡】';
  const lines = list.slice(0, 6).map(({ card, daysLeft }) => `- 「${card.title}」${daysLeft === 0 ? '就是今天' : `还有 ${daysLeft} 天`}（${dayLabelCN(card.targetDate!, todayKey)}）${card.subtitle ? `：${card.subtitle.slice(0, 20)}` : ''}`);
  for (const c of noDate.slice(0, 3)) lines.push(`- 「${c.title}」（按任务进度算，${c.linkedTodoIds?.length ?? 0} 条任务）`);
  return `【倒计时 / 宣告卡】\n${lines.join('\n')}`;
}

function qTodo(todoId: string, todayKey: string): string {
  const s = useAppStore.getState();
  const t = s.todos.find((x) => x.id === todoId);
  if (!t) return '【没有这条任务】';
  const c = completionDays(t.id, 30, todayKey);
  const lines = [
    `【任务「${t.title}」】`,
    `${attrName(t.attribute)} +${t.points}${t.extraBoosts?.length ? `，另 ${t.extraBoosts.map((b) => `${attrName(b.attribute)} +${b.points}`).join(' ')}` : ''}；${t.isBigDeal ? '大事' : t.repeatDaily ? '每日' : '单次'}${t.deadline ? `；截止 ${dayLabelCN(t.deadline, todayKey)}（${relativeDayCN(t.deadline, todayKey)}）` : ''}`,
    `状态：${!t.isActive || t.archivedAt ? (t.completedAt ? `已完成（${dayLabelCN(toLocalDateKey(new Date(t.completedAt)), todayKey)}）` : '已归档') : s.getTodayTodoProgress(t.id).isComplete ? '今天已完成' : '今天还没做'}`,
    t.repeatDaily ? `近 30 天做到 ${c.done} 天${c.last ? `，上次 ${dayLabelCN(c.last, todayKey)}` : ''}` : '',
    t.isBigDeal && t.steps?.length ? `步骤：${t.steps.map((st) => `${st.done ? '✓' : '○'}${st.title}`).join('、')}` : '',
    `建于 ${dayLabelCN(toLocalDateKey(new Date(t.createdAt)), todayKey)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

async function qTarot(days: number, todayKey: string): Promise<string> {
  const since = shiftKey(todayKey, -days + 1);
  let rows: Array<{ date: string; cardId: string; orientation: string; memo?: string }> = [];
  try { rows = (await db.dailyDivinations.toArray()).filter((d) => d.date >= since && d.date <= todayKey).sort((a, b) => b.date.localeCompare(a.date)); } catch { /* */ }
  if (!rows.length) return `【近 ${days} 天没有抽塔罗】`;
  return `【近 ${days} 天的每日塔罗】\n${rows.slice(0, 10).map((d) => `- ${dayLabelCN(d.date, todayKey)}：「${TAROT_BY_ID[d.cardId]?.name ?? d.cardId}」${d.orientation === 'reversed' ? '逆位' : '正位'}${d.memo ? `（${d.memo.slice(0, 30)}）` : ''}`).join('\n')}`;
}

async function qChats(days: number, presetId: string, todayKey: string): Promise<string> {
  const cat = BUILTIN_NAVIGATOR_PRESETS[0].id;
  const since = shiftKey(todayKey, -days);
  let rows: Array<{ dateKey: string; compactedSummary?: string }> = [];
  try { rows = (await db.navigatorSessions.toArray()).filter((s) => (s.presetId ?? cat) === presetId && s.dateKey >= since && s.dateKey < todayKey).sort((a, b) => b.dateKey.localeCompare(a.dateKey)); } catch { /* */ }
  if (!rows.length) return `【近 ${days} 天（今天以前）没和你聊过】`;
  return `【近 ${days} 天和你聊过的（今天以前，摘要）】\n${rows.slice(0, 10).map((s) => `- ${dayLabelCN(s.dateKey, todayKey)}，${relativeDayCN(s.dateKey, todayKey)}：${s.compactedSummary ?? '聊过，还没整理成摘要'}`).join('\n')}`;
}

function qWishes(): string {
  const list = activeWishes(6);
  if (!list.length) return '【没有进行中的愿望】';
  return `【愿望】\n${list.map((w) => { const p = wishProgress(w); return `- 「${w.title}」${p !== undefined ? `：离实现约 ${p}%` : '：还没评估过进度'}${w.steps?.length ? `，${w.steps.length} 个小步` : ''}`; }).join('\n')}`;
}

function qSummaries(todayKey: string): string {
  const list = recentSummaries(3);
  if (!list.length) return '【还没有写好的成长总结】';
  return `【最近的成长总结（只有数据，没有评语）】\n${list.map((s) => `- ${summaryFacts(s, todayKey)}`).join('\n')}`;
}

/** 执行一组查询，返回注入块（各自限长） */
export async function runQueries(queries: NavigatorQuery[], presetId: string): Promise<string[]> {
  const todayKey = toLocalDateKey();
  const out: string[] = [];
  for (const q of queries.slice(0, MAX_QUERIES_PER_TURN)) {
    try {
      switch (q.kind) {
        case 'activities': out.push(qActivities(q.days, q.keyword, todayKey)); break;
        case 'ledger': out.push(qLedger(q, todayKey)); break;
        case 'weeklyGoal': out.push(qWeeklyGoal(todayKey)); break;
        case 'countdowns': out.push(qCountdowns(todayKey)); break;
        case 'todo': out.push(qTodo(q.todoId, todayKey)); break;
        case 'tarot': out.push(await qTarot(q.days, todayKey)); break;
        case 'chats': out.push(await qChats(q.days, presetId, todayKey)); break;
        case 'wishes': out.push(qWishes()); break;
        case 'summaries': out.push(qSummaries(todayKey)); break;
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[navigator] 查询失败', q, e);
    }
  }
  return out;
}
