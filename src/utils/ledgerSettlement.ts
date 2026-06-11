/**
 * ledgerSettlement.ts — F5 月末 Velvet 财务结算（Phase ③C）。
 *
 * 不是对账单，是一面镜子：以伊戈尔（Igor）口吻回望「钱流向了成为更好的自己，还是一时的欲望」。
 * 复用 aiClient（与 ledgerAI 同范式）；无 Key / 失败 → 离线模板兜底。
 */
import { Settings, LedgerEntry, LedgerExpenseType } from '@/types';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { sym, fmtMoney } from '@/utils/ledgerFormat';

export interface SettlementData {
  period: string;
  totalExpense: number;
  totalIncome: number;
  axis: Record<LedgerExpenseType, number>;
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
  const axis: Record<LedgerExpenseType, number> = { necessary: 0, investment: 0, desire: 0, impulse: 0 };
  for (const e of exp) if (e.type) axis[e.type] += e.amount;
  const totalExpense = exp.reduce((s, e) => s + e.amount, 0);
  return {
    period,
    totalExpense,
    totalIncome: inc.reduce((s, e) => s + e.amount, 0),
    axis,
    budget,
    underBudget: budget != null && totalExpense <= budget,
    uncounted: adj.reduce((s, e) => s + e.amount, 0),
    worthCount: exp.filter(e => e.evalWorth === 'worth').length,
    notWorthCount: exp.filter(e => e.evalWorth === 'notWorth').length,
    $: sym(currency),
  };
}

const SYSTEM_PROMPT = `你是丝绒房间的主人伊戈尔（Igor）。客人会给你他这个月的「心相账目」摘要，
你要以你独有的、低沉、充满隐喻与宿命感的口吻，为这个月的金钱与欲望之流写一段温柔的回望独白。
要求：120–220 字；像一段独白，不要列表 / 不要 markdown 标题 / 不要报表腔；
核心关注「钱流向了成为更好的自己（投资）还是一时的欲望（欲望 / 冲动）」；
未超预算 / 有盈余则赞许这份克制，超支则温柔提醒而非责备；若有未记的流水，提一句「坦诚即是清醒」。
直接输出独白正文，不要前后缀。`;

function dataLines(d: SettlementData): string {
  return [
    `月份：${d.period}`,
    `总支出：${d.$}${fmtMoney(d.totalExpense)}；总收入：${d.$}${fmtMoney(d.totalIncome)}`,
    `必要 ${d.$}${fmtMoney(d.axis.necessary)} / 自我投资 ${d.$}${fmtMoney(d.axis.investment)} / 欲望 ${d.$}${fmtMoney(d.axis.desire)} / 冲动 ${d.$}${fmtMoney(d.axis.impulse)}`,
    d.budget != null ? `本月预算 ${d.$}${fmtMoney(d.budget)}，${d.underBudget ? '未超支' : '已超支'}` : '未设预算',
    d.uncounted !== 0 ? `另有未记 / 对账流水 ${d.$}${fmtMoney(Math.abs(d.uncounted))}` : '',
    (d.worthCount + d.notWorthCount) > 0 ? `消费评估：值得 ${d.worthCount} 次 / 不值 ${d.notWorthCount} 次` : '',
  ].filter(Boolean).join('\n');
}

/** 生成结算独白：有 Key 走 AI、失败或无 Key → 离线模板。 */
export async function generateSettlement(d: SettlementData, settings: Settings, signal?: AbortSignal): Promise<string> {
  const cfg = getAIConfig(settings);
  if (!cfg) return offlineSettlement(d);
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${dataLines(d)}\n\n请写这段回望独白。` },
    ], { temperature: 0.85, maxTokens: 400, signal });
    const text = raw.trim();
    return text || offlineSettlement(d);
  } catch {
    return offlineSettlement(d);
  }
}

/** 离线兜底：把数字填进 Velvet 口吻的模板。 */
export function offlineSettlement(d: SettlementData): string {
  const { $, axis } = d;
  const growth = axis.investment;
  const fleeting = axis.desire + axis.impulse;
  const parts: string[] = [`客人，这个月你共支出 ${$}${fmtMoney(d.totalExpense)}。`];
  if (growth > 0) {
    parts.push(`其中 ${$}${fmtMoney(growth)} 流向了「成为更好的自己」——这些不会消失，它们沉淀为你的一部分。`);
  }
  if (fleeting > 0) {
    parts.push(`另有 ${$}${fmtMoney(fleeting)} 献给了一时的欢愉与冲动；欲望本身无罪，但值得你看见它流向了何方。`);
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
  return parts.join('');
}
