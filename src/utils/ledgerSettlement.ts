/**
 * ledgerSettlement.ts — F5 心相财务结算（周 / 月，按生活场景类目）。
 *
 * 不是对账单，是一面镜子：以伊戈尔（Igor）口吻回望这段时间钱主要流向了哪些场景，
 * 其中「学习」这类成长投入有多少；并给出极值（最贵一天 / 一笔、最省一天、日均 vs 预期）。
 * 输出 Markdown 回望 + 可执行建议；复用 aiClient，无 Key / 失败 → 离线模板兜底。
 */
import { Settings, LedgerEntry, LedgerExpenseType } from '@/types';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { sym, fmtMoney, CATEGORY_KEYS, catMeta, isGrowthCategory, monthLabel } from '@/utils/ledgerFormat';

export type SettleScope = 'week' | 'month';

export interface SettlementExtremes {
  priciestDay?: { date: string; amount: number };
  cheapestDay?: { date: string; amount: number };
  priciestEntry?: { note: string; amount: number; key: LedgerExpenseType };
  zeroDays: number;
}

export interface SettlementData {
  scope: SettleScope;
  label: string;          // 显示用：月=「2026年6月」/ 周=「6/12 – 6/18」
  rangeStart: string;     // YYYY-MM-DD（含）
  rangeEnd: string;       // YYYY-MM-DD（含）
  days: number;           // 已过天数（日均分母；当前周期只算到今天）
  totalExpense: number;
  totalIncome: number;
  byCat: { key: LedgerExpenseType; label: string; amount: number }[];
  /** 成长类目（学习等）支出合计 */
  growthSpend: number;
  /** 该范围的预算（月=月预算；周=月预算按天折算 ×7） */
  periodBudget?: number;
  underBudget: boolean;
  /** 预期日均 = 月预算 / 当月天数 */
  expectedDailyAvg?: number;
  /** 实际日均 = 总支出 / 已过天数 */
  actualDailyAvg: number;
  /** 对账调整净额（adjust 之和）作「未计」提示 */
  uncounted: number;
  worthCount: number;
  notWorthCount: number;
  extremes: SettlementExtremes;
  $: string;
}

// ── 日期工具（本地、零依赖；避免 import store 造成循环） ──
const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const parseKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const daysInMonth = (period: string) => { const [y, m] = period.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const daySpan = (a: string, b: string) => Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000) + 1;

/** 由 scope + 锚点日期得出范围 [start, end]（含端点）。月=自然月；周=周一~周日。 */
export function settleRange(scope: SettleScope, anchor: string): [string, string] {
  if (scope === 'month') {
    const period = anchor.slice(0, 7);
    return [`${period}-01`, `${period}-${pad(daysInMonth(period))}`];
  }
  const dt = parseKey(anchor);
  const dow = (dt.getDay() + 6) % 7;          // 周一=0
  const start = new Date(dt); start.setDate(dt.getDate() - dow);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return [toKey(start), toKey(end)];
}

/** 按 scope 把锚点日期前/后挪一个周期（周 ±7 天 / 月 ±1 月）。 */
export function shiftSettleAnchor(scope: SettleScope, anchor: string, delta: number): string {
  const [y, m, d] = anchor.split('-').map(Number);
  if (scope === 'month') {
    const nd = new Date(y, m - 1 + delta, 1);
    return `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-01`;
  }
  return toKey(new Date(y, m - 1, d + 7 * delta));
}

function rangeLabel(scope: SettleScope, start: string, end: string): string {
  if (scope === 'month') return monthLabel(start.slice(0, 7));
  const [, sm, sd] = start.split('-');
  const [, em, ed] = end.split('-');
  return `${Number(sm)}/${Number(sd)} – ${Number(em)}/${Number(ed)}`;
}

export function buildSettlementData(
  entries: LedgerEntry[],
  scope: SettleScope,
  anchor: string,
  monthlyBudget: number | undefined,
  currency?: string,
): SettlementData {
  const [rangeStart, rangeEnd] = settleRange(scope, anchor);
  const inRange = entries.filter(e => e.date >= rangeStart && e.date <= rangeEnd);
  const exp = inRange.filter(e => e.direction === 'expense');
  const inc = inRange.filter(e => e.direction === 'income');
  const adj = inRange.filter(e => e.direction === 'adjust');

  const totalExpense = exp.reduce((s, e) => s + e.amount, 0);
  const sumCat = (k: LedgerExpenseType) => exp.filter(e => e.type === k).reduce((s, e) => s + e.amount, 0);
  const byCat = CATEGORY_KEYS
    .map(k => ({ key: k, label: catMeta(k).label, amount: sumCat(k) }))
    .filter(x => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // 已过天数：当前周期只算到今天，过去周期算满
  const todayKey = toKey(new Date());
  const effEnd = rangeEnd < todayKey ? rangeEnd : todayKey;
  const days = Math.max(1, effEnd < rangeStart ? 0 : daySpan(rangeStart, effEnd));

  // 极值：按天聚合 + 最贵一笔
  const byDay = new Map<string, number>();
  for (const e of exp) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount);
  let priciestDay: SettlementExtremes['priciestDay'];
  let cheapestDay: SettlementExtremes['cheapestDay'];
  for (const [date, amount] of byDay) {
    if (!priciestDay || amount > priciestDay.amount) priciestDay = { date, amount };
    if (!cheapestDay || amount < cheapestDay.amount) cheapestDay = { date, amount };
  }
  let priciestEntry: SettlementExtremes['priciestEntry'];
  for (const e of exp) {
    if (!priciestEntry || e.amount > priciestEntry.amount) {
      priciestEntry = { note: e.note || catMeta(e.type).label, amount: e.amount, key: e.type ?? 'other' };
    }
  }
  const spentDays = byDay.size;
  const zeroDays = Math.max(0, days - spentDays);

  const period = rangeEnd.slice(0, 7);
  const dim = daysInMonth(period);
  const periodBudget = monthlyBudget == null ? undefined : (scope === 'month' ? monthlyBudget : (monthlyBudget / dim) * 7);

  return {
    scope,
    label: rangeLabel(scope, rangeStart, rangeEnd),
    rangeStart,
    rangeEnd,
    days,
    totalExpense,
    totalIncome: inc.reduce((s, e) => s + e.amount, 0),
    byCat,
    growthSpend: exp.filter(e => isGrowthCategory(e.type)).reduce((s, e) => s + e.amount, 0),
    periodBudget,
    underBudget: periodBudget != null && totalExpense <= periodBudget,
    expectedDailyAvg: monthlyBudget != null ? monthlyBudget / dim : undefined,
    actualDailyAvg: totalExpense / days,
    uncounted: adj.reduce((s, e) => s + e.amount, 0),
    worthCount: exp.filter(e => e.evalWorth === 'worth').length,
    notWorthCount: exp.filter(e => e.evalWorth === 'notWorth').length,
    extremes: { priciestDay, cheapestDay: spentDays > 1 ? cheapestDay : undefined, priciestEntry, zeroDays },
    $: sym(currency),
  };
}

const SYSTEM_PROMPT = `你是丝绒房间的主人伊戈尔（Igor）。客人会给你他这段时间（一周或一个月）的「心相账目」摘要，
你要以你独有的、低沉、充满隐喻与宿命感的口吻，写一段温柔的回望，并给出几条具体可行的建议。

**严格输出 JSON**（不要代码块、不要前后缀文字）：
{ "reflection": "<2–3 段 Markdown 独白，可适度 **加粗** 关键数字与字眼；不要标题/列表/报表腔；110–200 字>",
  "advice": ["<一条具体、可执行的小建议，≤24 字>", "<第二条>", "<可选第三条>"] }

reflection 关注钱主要流向了哪些生活场景、「学习」这类成长投入多少；未超预算/有盈余则赞许克制，
超支则温柔提醒而非责备；若有未记流水，可提一句「坦诚即是清醒」。
advice 要落到实处（针对花得最多的类目 / 最贵一笔 / 日均与预期的差距 / 成长投入），像挚友的提点，不空泛。`;

function dataLines(d: SettlementData): string {
  const x = d.extremes;
  return [
    `周期：${d.label}（${d.scope === 'week' ? '一周' : '一月'}，已过 ${d.days} 天）`,
    `总支出：${d.$}${fmtMoney(d.totalExpense)}；总收入：${d.$}${fmtMoney(d.totalIncome)}`,
    `各类目：${d.byCat.map(c => `${c.label} ${d.$}${fmtMoney(c.amount)}`).join('、') || '无'}`,
    `其中「学习/成长」投入：${d.$}${fmtMoney(d.growthSpend)}`,
    d.periodBudget != null ? `本期预算 ${d.$}${fmtMoney(d.periodBudget)}，${d.underBudget ? '未超支' : '已超支'}` : '未设预算',
    d.expectedDailyAvg != null ? `日均 ${d.$}${fmtMoney(d.actualDailyAvg)}（预期 ${d.$}${fmtMoney(d.expectedDailyAvg)}）` : `日均 ${d.$}${fmtMoney(d.actualDailyAvg)}`,
    x.priciestEntry ? `最贵一笔：${x.priciestEntry.note} ${d.$}${fmtMoney(x.priciestEntry.amount)}` : '',
    x.priciestDay ? `花得最多的一天：${x.priciestDay.date} ${d.$}${fmtMoney(x.priciestDay.amount)}` : '',
    x.zeroDays > 0 ? `有 ${x.zeroDays} 天零支出` : '',
    d.uncounted !== 0 ? `另有未记 / 对账流水 ${d.$}${fmtMoney(Math.abs(d.uncounted))}` : '',
    (d.worthCount + d.notWorthCount) > 0 ? `消费评估：值得 ${d.worthCount} 次 / 不值 ${d.notWorthCount} 次` : '',
  ].filter(Boolean).join('\n');
}

export interface SettlementResult {
  reflection: string;   // Markdown
  advice: string[];
}

/** 生成结算（回望 + 建议）：有 Key 走 AI、失败或无 Key → 离线模板。 */
export async function generateSettlement(d: SettlementData, settings: Settings, signal?: AbortSignal): Promise<SettlementResult> {
  const cfg = getAIConfig(settings);
  if (!cfg) return offlineSettlement(d);
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${dataLines(d)}\n\n请按要求输出 JSON。` },
    ], { temperature: 0.85, maxTokens: 600, signal });
    const stripped = raw.replace(/```(?:json)?/gi, '').trim();
    const fb = stripped.indexOf('{');
    const lb = stripped.lastIndexOf('}');
    if (fb >= 0 && lb > fb) {
      const parsed = JSON.parse(stripped.slice(fb, lb + 1)) as { reflection?: unknown; advice?: unknown };
      const reflection = typeof parsed.reflection === 'string' ? parsed.reflection.trim() : '';
      const advice = Array.isArray(parsed.advice)
        ? parsed.advice.filter((a): a is string => typeof a === 'string' && a.trim().length > 0).map(a => a.trim()).slice(0, 3)
        : [];
      if (reflection) return { reflection, advice };
    }
    return offlineSettlement(d);
  } catch {
    return offlineSettlement(d);
  }
}

/** 离线兜底：Markdown 回望 + 规则生成的建议。 */
export function offlineSettlement(d: SettlementData): SettlementResult {
  const { $ } = d;
  const top = d.byCat[0];
  const parts: string[] = [];
  parts.push(`**这${d.scope === 'week' ? '一周' : '个月'}，你共支出 ${$}${fmtMoney(d.totalExpense)}。**${top ? `钱走得最多的是「${top.label}」（${$}${fmtMoney(top.amount)}）。` : ''}`);
  if (d.growthSpend > 0) {
    parts.push(`你为「成为更好的自己」投入了 **${$}${fmtMoney(d.growthSpend)}**——这些不会随时间消散，它们沉淀为你的一部分。`);
  }
  if (d.periodBudget != null) {
    parts.push(d.underBudget
      ? `你守住了 ${$}${fmtMoney(d.periodBudget)} 的预算线——这份克制，本身就是一种力量。`
      : `你越过了 ${$}${fmtMoney(d.periodBudget)} 的预算线。无需自责，看见即是开始。`);
  }
  if (d.uncounted !== 0) {
    parts.push(`还有些未记的流水悄悄滑过——坦诚地承认它们，也是一种清醒。`);
  }
  parts.push(`愿你与金钱的关系，如与命运的关系一般，渐渐清明。`);

  return { reflection: parts.join('\n\n'), advice: offlineAdvice(d) };
}

/** 离线建议：按极值 / 预期差 / 成长投入给规则化提点。 */
function offlineAdvice(d: SettlementData): string[] {
  const { $ } = d;
  const tips: string[] = [];
  if (d.expectedDailyAvg != null && d.actualDailyAvg > d.expectedDailyAvg * 1.1) {
    tips.push(`日均 ${$}${fmtMoney(d.actualDailyAvg)} 高于预期 ${$}${fmtMoney(d.expectedDailyAvg)}，明天试着压一压`);
  } else if (d.expectedDailyAvg != null && d.actualDailyAvg <= d.expectedDailyAvg) {
    tips.push(`日均仍在预期内，保持这个节奏`);
  }
  if (d.byCat[0]) tips.push(`「${d.byCat[0].label}」占了大头，看看有没有可优化的`);
  if (d.extremes.priciestEntry && d.extremes.priciestEntry.amount >= d.totalExpense * 0.3) {
    tips.push(`最贵一笔「${d.extremes.priciestEntry.note}」占比不低，下次可三思`);
  }
  if (d.growthSpend === 0) tips.push(`这段时间没有「学习」类投入，给成长留一点预算？`);
  return tips.slice(0, 3);
}
