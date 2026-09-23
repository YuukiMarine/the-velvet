/**
 * reportNotice — 成长总结（周报 / 月报）的「可以查看了」提醒口径（v2.7.0.6）。
 *
 * 用户反馈两件事：
 *   ① 推送和助手问候会反复提同一份报告——推送每次前台都 cancel + 重排，「只投一次」
 *      的标记跟着清零；问候每天都提「最新一份未读」。
 *   ② 九月的开屏问候说「五月的总结还没拆」——只看有没有读，不看新旧；云端回拉 / 导入
 *      旧备份会让老总结重新变成未读，而补「已读」的回填只跑过一次。
 * 这里定一个口径：
 *   · 只有**写好 REPORT_FRESH_DAYS 天内、还没看过**的总结才算「新报告」，更早的不再提醒；
 *   · 每份新报告，推送只投一次（排过的时刻一过就算送达，不再重排），问候只提一次；
 *   · 记账放 localStorage：它是提醒节流状态，不是用户数据，不该上云也不该进备份。
 */
import { create } from 'zustand';
import type { PeriodSummary } from '@/types';

export const REPORT_FRESH_DAYS = 7;
const DAY_MS = 86_400_000;
const KEY = 'velvet.reportNotice.v1';

interface Ledger {
  /** summaryId → 推送排到的时刻（epoch ms）；该时刻一过即视为已送达 */
  pushed: Record<string, number>;
  /** summaryId → 问候提过的时刻 */
  greeted: Record<string, number>;
}

const read = (): Ledger => {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) as Partial<Ledger> : {};
    return { pushed: p.pushed ?? {}, greeted: p.greeted ?? {} };
  } catch {
    return { pushed: {}, greeted: {} };
  }
};

const write = (l: Ledger) => {
  // 只留最近 60 条，免得无限长
  const trim = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 60));
  try { localStorage.setItem(KEY, JSON.stringify({ pushed: trim(l.pushed), greeted: trim(l.greeted) })); } catch { /* 隐私模式：不记账，最多多提一次 */ }
};

/** 最新一份「新报告」：写好 REPORT_FRESH_DAYS 天内、还没看过。没有则 null */
export function freshUnreadSummary(summaries: PeriodSummary[], now = Date.now()): PeriodSummary | null {
  return summaries
    .filter(s => !s.viewedAt && now - new Date(s.createdAt).getTime() <= REPORT_FRESH_DAYS * DAY_MS)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

// ── 推送 ──────────────────────────────────────────────────────────────────

/** 这份报告的推送是否已经送达（排过、且排的时刻已过） */
export function reportPushDelivered(id: string, now = Date.now()): boolean {
  const at = read().pushed[id];
  return typeof at === 'number' && at <= now;
}

/** 记下这份报告的推送排到了哪个时刻（重排时会被更新成新的时刻） */
export function markReportPushScheduled(id: string, at: number): void {
  const l = read();
  l.pushed[id] = at;
  write(l);
}

// ── 问候 ──────────────────────────────────────────────────────────────────

export function reportGreeted(id: string): boolean {
  return typeof read().greeted[id] === 'number';
}

export function markReportGreeted(id: string): void {
  const l = read();
  l.greeted[id] = Date.now();
  write(l);
}

/** 问候该不该提这份报告：新报告、且问候还没提过 */
export function reportForGreeting(summaries: PeriodSummary[]): PeriodSummary | null {
  const s = freshUnreadSummary(summaries);
  return s && !reportGreeted(s.id) ? s : null;
}

// ── 「打开这份总结」的请求通道 ────────────────────────────────────────────
// 助手窗口的「看总结」、通知点击都要把用户带到记录页并直接打开某份总结；
// 总结弹层挂在记录页里，这里放一个小仓当信箱，记录页订阅它。

interface OpenRequest { summaryId?: string; nonce: number }
export const useSummaryOpenRequest = create<{ request: OpenRequest | null }>(() => ({ request: null }));

export function requestOpenSummary(summaryId?: string): void {
  useSummaryOpenRequest.setState({ request: { summaryId, nonce: Date.now() } });
}

export function consumeOpenSummaryRequest(): OpenRequest | null {
  const r = useSummaryOpenRequest.getState().request;
  if (r) useSummaryOpenRequest.setState({ request: null });
  return r;
}
