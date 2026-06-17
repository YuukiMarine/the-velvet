/**
 * ledgerSettlement.ts — F5 月末 Velvet 财务结算（按生活场景类目）。
 *
 * 不是对账单，是一面镜子：以伊戈尔（Igor）口吻回望钱主要流向了哪些场景、其中「学习」
 * 这类让自己成长的投入有多少。输出 Markdown（renderMarkdown 渲染）。
 * 复用 aiClient；无 Key / 失败 → 离线模板兜底。
 */
import { Settings, LedgerEntry, LedgerExpenseType } from '@/types';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { sym, fmtMoney, CATEGORY_KEYS, catMeta, isGrowthCategory } from '@/utils/ledgerFormat';

export interface SettlementData {
  period: string;
  totalExpense: number;
  totalIncome: number;
  byCat: { key: LedgerExpenseType; label: string; amount: number }[];
  /** 成长类目（学习等）支出合计 */
  growthSpend: number;
  budget?: number;
  underBudget: boolean;
  /** 对账调整净额（adjust 之和）作「未计」提示 */
  uncounted: number;
  worthCount: number;
  notWorthCount: number;
  $: string;
}

export function buildSettlementData(
  entries: LedgerEntry[],
  period: string,
  budget: number | undefined,
  currency?: string,
): SettlementData {
  const inMonth = entries.filter(e => e.date.slice(0, 7) === period);
  const exp = inMonth.filter(e => e.direction === 'expense');
  const inc = inMonth.filter(e => e.direction === 'income');
  const adj = inMonth.filter(e => e.direction === 'adjust');
  const sumCat = (k: LedgerExpenseType) => exp.filter(e => e.type === k).reduce((s, e) => s + e.amount, 0);
  const byCat = CATEGORY_KEYS
    .map(k => ({ key: k, label: catMeta(k).label, amount: sumCat(k) }))
    .filter(x => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const totalExpense = exp.reduce((s, e) => s + e.amount, 0);
  return {
    period,
    totalExpense,
    totalIncome: inc.reduce((s, e) => s + e.amount, 0),
    byCat,
    growthSpend: exp.filter(e => isGrowthCategory(e.type)).reduce((s, e) => s + e.amount, 0),
    budget,
    underBudget: budget != null && totalExpense <= budget,
    uncounted: adj.reduce((s, e) => s + e.amount, 0),
    worthCount: exp.filter(e => e.evalWorth === 'worth').length,
    notWorthCount: exp.filter(e => e.evalWorth === 'notWorth').length,
    $: sym(currency),
  };
}

const SYSTEM_PROMPT = `你是丝绒房间的主人伊戈尔（Igor）。客人会给你他这个月的「心相账目」摘要，
你要以你独有的、低沉、充满隐喻与宿命感的口吻，写一段温柔的回望。
**用 Markdown 输出**：2–3 段独白，可适度 **加粗** 关键数字与字眼；不要用标题、不要列表、不要代码块、不要报表腔。
120–220 字。关注钱主要流向了哪些生活场景、其中「学习」这类让自己成长的投入有多少；
未超预算 / 有盈余则赞许这份克制，超支则温柔提醒而非责备；若有未记的流水，提一句「坦诚即是清醒」。
直接输出正文，不要前后缀。`;

function dataLines(d: SettlementData): string {
  return [
    `月份：${d.period}`,
    `总支出：${d.$}${fmtMoney(d.totalExpense)}；总收入：${d.$}${fmtMoney(d.totalIncome)}`,
    `各类目：${d.byCat.map(c => `${c.label} ${d.$}${fmtMoney(c.amount)}`).join('、') || '无'}`,
    `其中「学习/成长」投入：${d.$}${fmtMoney(d.growthSpend)}`,
    d.budget != null ? `本月预算 ${d.$}${fmtMoney(d.budget)}，${d.underBudget ? '未超支' : '已超支'}` : '未设预算',
    d.uncounted !== 0 ? `另有未记 / 对账流水 ${d.$}${fmtMoney(Math.abs(d.uncounted))}` : '',
    (d.worthCount + d.notWorthCount) > 0 ? `消费评估：值得 ${d.worthCount} 次 / 不值 ${d.notWorthCount} 次` : '',
  ].filter(Boolean).join('\n');
}

/** 生成结算独白（Markdown）：有 Key 走 AI、失败或无 Key → 离线模板。 */
export async function generateSettlement(d: SettlementData, settings: Settings, signal?: AbortSignal): Promise<string> {
  const cfg = getAIConfig(settings);
  if (!cfg) return offlineSettlement(d);
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${dataLines(d)}\n\n请写这段回望独白（Markdown）。` },
    ], { temperature: 0.85, maxTokens: 500, signal });
    const text = raw.trim();
    return text || offlineSettlement(d);
  } catch {
    return offlineSettlement(d);
  }
}

/** 离线兜底：Markdown（加粗 + 分段）。 */
export function offlineSettlement(d: SettlementData): string {
  const { $ } = d;
  const top = d.byCat[0];
  const parts: string[] = [];
  parts.push(`**这个月，你共支出 ${$}${fmtMoney(d.totalExpense)}。**${top ? `钱走得最多的是「${top.label}」（${$}${fmtMoney(top.amount)}）。` : ''}`);
  if (d.growthSpend > 0) {
    parts.push(`你为「成为更好的自己」投入了 **${$}${fmtMoney(d.growthSpend)}**——这些不会随时间消散，它们沉淀为你的一部分。`);
  }
  if (d.budget != null) {
    parts.push(d.underBudget
      ? `你守住了 ${$}${fmtMoney(d.budget)} 的预算线——这份克制，本身就是一种力量。`
      : `你越过了 ${$}${fmtMoney(d.budget)} 的预算线。无需自责，看见即是开始。`);
  }
  if (d.uncounted !== 0) {
    parts.push(`还有些未记的流水悄悄滑过——坦诚地承认它们，也是一种清醒。`);
  }
  parts.push(`愿你与金钱的关系，如与命运的关系一般，渐渐清明。`);
  return parts.join('\n\n');
}
