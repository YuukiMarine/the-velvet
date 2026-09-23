/**
 * summaryJobs — 成长总结的「后台任务」（v2.7.0.6，照 tarotJobs 的路子）。
 *
 * 之前生成挂在 SummaryModal 组件里：关弹层就中断、切页就丢，还得弹「中断并退出？」拦人。
 * 这里把请求提到模块级：任务在 zustand 小仓里跑，弹层只是订阅；跑完落成**草稿**
 * （localStorage，未归档），回来直接看，归档保存才进 db.summaries。
 *
 * 截断（finish_reason=length / 连接中途断开）不再报废：草稿留着，可「接着写」最多三次——
 * 把半截正文当 assistant 回传，让模型从断处续。
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import type { PeriodSummary, Settings, SummaryPeriod, YearRecap } from '@/types';
import { buildYearRecap } from '@/utils/yearRecap';
import { chatStream } from '@/utils/aiClient';
import { createThinkTracker, type ThinkTracker } from '@/utils/thinkProgress';
import { formatApiError } from '@/utils/tarotAI';
import {
  buildContinueMessages, extractSummaryMemo, parseSummaryResult, visibleSummaryText, looksTruncated, trimSeam,
  summaryKindOf, SUMMARY_MAX_TOKENS, type SummaryRequestData,
} from '@/utils/summaryAI';

export type SummaryJobStatus = 'preparing' | 'thinking' | 'streaming' | 'done' | 'error';
export const SUMMARY_CONTINUE_LIMIT = 3;

export interface SummaryJob {
  id: string;
  status: SummaryJobStatus;
  period: SummaryPeriod;
  startDate: string;
  endDate: string;
  /** 组好的请求（preparing 阶段为 null） */
  req: SummaryRequestData | null;
  /** 原始累计正文（含 META 行） */
  full: string;
  /** 给客人看的部分 */
  text: string;
  thinking: boolean;
  tracker: ThinkTracker | null;
  error?: string;
  /** 正文没收完：可「接着写」 */
  truncated: boolean;
  continues: number;
  /** done 后的草稿（未归档） */
  draft?: PeriodSummary;
  /** 年度开场的数字（只有年度任务有；开工就在本机算好，不等信写完） */
  recap?: YearRecap;
  startedAt: number;
}

interface State { job: SummaryJob | null }

export const useSummaryJobs = create<State>(() => ({ job: null }));

let controller: AbortController | undefined;

const patch = (p: Partial<SummaryJob>) => useSummaryJobs.setState(s => ({ job: s.job ? { ...s.job, ...p } : s.job }));

export const isSummaryJobRunning = (j: SummaryJob | null | undefined): boolean =>
  !!j && (j.status === 'preparing' || j.status === 'thinking' || j.status === 'streaming');

// ── 草稿持久化 ─────────────────────────────────────────────────────────────

const DRAFT_KEY = 'velvet.summary.draft.v1';

interface StoredDraft { summary: PeriodSummary; truncated: boolean; continues: number; full: string }

const writeDraft = (d: StoredDraft) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* 配额 / 隐私模式：不留草稿 */ }
};

export const clearSummaryDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
};

const readDraft = (): StoredDraft | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StoredDraft;
    if (!d?.summary?.content) return null;
    d.summary.createdAt = new Date(d.summary.createdAt);
    if (d.summary.followUps) d.summary.followUps = d.summary.followUps.map(f => ({ ...f, createdAt: new Date(f.createdAt) }));
    return d;
  } catch {
    return null;
  }
};

/** 弹层打开时：没有在跑的任务、但有草稿 → 以 done 态接回，回来直接看 */
export function restoreSummaryDraft(): boolean {
  if (useSummaryJobs.getState().job) return false;
  const d = readDraft();
  if (!d) return false;
  // 老草稿里的年度总结是按 'month' 存的：按标签认回「年」，归档时就存成年度
  const s: PeriodSummary = { ...d.summary, period: summaryKindOf(d.summary) };
  useSummaryJobs.setState({
    job: {
      id: s.id,
      status: 'done',
      period: s.period,
      startDate: s.startDate,
      endDate: s.endDate,
      recap: s.recap,
      req: null,
      full: d.full || s.content,
      text: s.content,
      thinking: false,
      tracker: null,
      truncated: !!d.truncated,
      continues: d.continues ?? 0,
      draft: s,
      startedAt: new Date(s.createdAt).getTime(),
    },
  });
  return true;
}

// ── 主流程 ─────────────────────────────────────────────────────────────────

/** 追问时要的上下文：草稿的 reqContext 或在跑任务的 req */
export function summaryJobMessages(job: SummaryJob): SummaryRequestData['messages'] | null {
  return job.req?.messages ?? job.draft?.reqContext?.messages ?? null;
}

async function finalize(settings: Settings, job: SummaryJob, full: string, finish: string): Promise<void> {
  const parsed = parseSummaryResult(full);
  // META 到了就是收完了；没到：length 必截断，连接断开靠句末标点兜底
  const truncated = !parsed.metaFound && (finish === 'length' || (finish !== 'stop' && looksTruncated(parsed.content)));
  let memo = parsed.memo;
  if (!memo && !truncated && parsed.content.trim()) {
    memo = await extractSummaryMemo(settings, parsed.content, controller?.signal).catch(() => undefined);
  }
  const req = job.req;
  const prevDraft = job.draft;
  const draft: PeriodSummary = {
    id: job.id,
    period: job.period,
    startDate: job.startDate,
    endDate: job.endDate,
    label: req?.periodLabel ?? prevDraft?.label ?? '',
    content: parsed.content,
    promptPresetId: req?.preset.id ?? prevDraft?.promptPresetId ?? 'igor',
    promptPresetName: req?.preset.name ?? prevDraft?.promptPresetName ?? '',
    totalPoints: req?.totalPoints ?? prevDraft?.totalPoints ?? 0,
    attributePoints: req?.attributePoints ?? prevDraft?.attributePoints ?? {},
    activityCount: req?.activityCount ?? prevDraft?.activityCount ?? 0,
    createdAt: prevDraft?.createdAt ?? new Date(),
    memo,
    question: parsed.question,
    deliberate: req?.deliberate ?? prevDraft?.deliberate,
    followUps: prevDraft?.followUps,
    recap: job.recap ?? prevDraft?.recap,
    reqContext: req
      ? { baseUrl: req.baseUrl, model: req.model, provider: req.provider, messages: req.messages }
      : prevDraft?.reqContext,
  };
  useSummaryJobs.setState(s => (s.job && s.job.id === job.id
    ? { job: { ...s.job, status: 'done', thinking: false, full, text: parsed.content, truncated, draft, error: undefined } }
    : s));
  const cur = useSummaryJobs.getState().job;
  writeDraft({ summary: draft, truncated, continues: cur?.continues ?? 0, full });
}

async function stream(settings: Settings, job: SummaryJob, messages: SummaryRequestData['messages'], seed: string, req: SummaryRequestData): Promise<void> {
  const ac = new AbortController();
  controller = ac;
  const tracker = job.tracker ?? createThinkTracker(req.model);
  patch({ status: 'thinking', tracker, thinking: true, error: undefined });
  let full = seed;
  let finish = '';
  let sawContent = false;
  try {
    const devCap = import.meta.env.DEV ? Number(localStorage.getItem('velvet.dev.summaryMaxTokens') || 0) : 0;
    for await (const delta of chatStream(req, messages, {
      temperature: 0.8,
      maxTokens: devCap > 0 ? devCap : SUMMARY_MAX_TOKENS,
      signal: ac.signal,
      onReasoning: d => { tracker.onReasoning(d); },
      onFinishReason: r => { finish = r; },
    })) {
      if (ac.signal.aborted) return;
      if (!sawContent) { sawContent = true; tracker.onContent(); }
      full += delta;
      patch({ status: 'streaming', thinking: false, full, text: visibleSummaryText(full) });
    }
    if (ac.signal.aborted) return;
    const cur = useSummaryJobs.getState().job;
    if (!cur || cur.id !== job.id) return;
    await finalize(settings, cur, full, finish);
  } catch (e) {
    if (ac.signal.aborted) return;
    if (e instanceof Error && e.name === 'AbortError') return;
    // 已经有半截正文：当截断留下，而不是整轮报废
    if (full.trim() && full !== seed) {
      const cur = useSummaryJobs.getState().job;
      if (cur && cur.id === job.id) await finalize(settings, cur, full, 'interrupted');
      return;
    }
    patch({ status: 'error', thinking: false, error: formatApiError(e) });
  }
}

/** 启动一份总结。已有在跑的任务则忽略（防双击 / StrictMode 双跑）。 */
export function startSummaryJob(args: { settings: Settings; period: SummaryPeriod; startDate: string; endDate: string }): void {
  const cur = useSummaryJobs.getState().job;
  if (isSummaryJobRunning(cur)) return;
  const { settings, period, startDate, endDate } = args;
  controller?.abort();
  clearSummaryDraft();
  const id = uuidv4();
  const job: SummaryJob = {
    id, status: 'preparing', period, startDate, endDate,
    req: null, full: '', text: '', thinking: false, tracker: null,
    truncated: false, continues: 0, startedAt: Date.now(),
  };
  useSummaryJobs.setState({ job });
  const ac = new AbortController();
  controller = ac;
  // 年度：开场的数字先算（几十毫秒），开场就能先放起来，信在后面慢慢写
  if (period === 'year') {
    void buildYearRecap(Number(startDate.slice(0, 4)), settings)
      .then(recap => { if (useSummaryJobs.getState().job?.id === id) patch({ recap }); })
      .catch(e => { if (import.meta.env.DEV) console.warn('[summaryJobs] 年度开场数字没算出来，只写信', e); });
  }
  void (async () => {
    let req: SummaryRequestData;
    try {
      req = await useAppStore.getState().buildSummaryRequest(period, startDate, endDate, { signal: ac.signal });
    } catch (e) {
      if (ac.signal.aborted) return;
      patch({ status: 'error', error: e instanceof Error ? e.message : '生成失败，请重试' });
      return;
    }
    if (ac.signal.aborted) return;
    patch({ req });
    const j = useSummaryJobs.getState().job;
    if (!j || j.id !== id) return;
    await stream(settings, j, req.messages, '', req);
  })();
}

/** 接着写：把半截正文当 assistant 回传，从断处续；最多三次 */
export function continueSummaryJob(settings: Settings): void {
  const job = useSummaryJobs.getState().job;
  if (!job || job.status !== 'done' || !job.truncated || job.continues >= SUMMARY_CONTINUE_LIMIT) return;
  const base = summaryJobMessages(job);
  if (!base) return;
  // 草稿接回来的任务没有 req：用 reqContext 重组连接（Key 取当下设置）
  let req = job.req;
  if (!req) {
    const rc = job.draft?.reqContext;
    if (!rc) return;
    const key = resolveKeyFor(settings, rc.provider);
    if (!key) { patch({ error: '当前没有可用的 API Key，接不上了' }); return; }
    req = {
      baseUrl: rc.baseUrl, model: rc.model, apiKey: key, provider: rc.provider, messages: rc.messages,
      periodLabel: job.draft!.label, preset: { id: job.draft!.promptPresetId, name: job.draft!.promptPresetName, systemPrompt: '', isBuiltin: true },
      totalPoints: job.draft!.totalPoints, attributePoints: job.draft!.attributePoints, activityCount: job.draft!.activityCount,
      period: job.period, startDate: job.startDate, endDate: job.endDate, deliberate: !!job.draft!.deliberate,
    };
    patch({ req });
  }
  // 续写前把最后一行没写完的丢掉：断在表格行 / 半句话中间时，模型接着写会把散文塞进最后一格
  // （实测：切在「| 魅力 | +2 | +0 |」后面，续写的整段话都进了那个单元格）。丢掉的那行由模型重写。
  const seed = trimSeam(job.full);
  patch({ continues: job.continues + 1, truncated: false, full: seed, text: visibleSummaryText(seed) });
  const j = useSummaryJobs.getState().job!;
  void stream(settings, j, buildContinueMessages(base, seed), seed, req);
}

/** 追问 / 归档详情要用的 Key：深思熟虑档可能指向别家 */
export function resolveKeyFor(settings: Settings, provider?: Settings['summaryApiProvider']): string | undefined {
  const active = settings.summaryApiProvider ?? 'deepseek';
  if (provider && provider !== active) return settings.aiProfiles?.[provider]?.key?.trim() || undefined;
  return settings.summaryApiKey?.trim() || undefined;
}

/** 停止（丢弃进行中的输出） */
export function cancelSummaryJob(): void {
  controller?.abort();
  controller = undefined;
  useSummaryJobs.setState({ job: null });
  clearSummaryDraft();
}

/** 丢弃草稿（重新生成前 / 用户主动放弃） */
export function discardSummaryJob(): void {
  cancelSummaryJob();
}

/** 归档保存后：任务与草稿一并清掉 */
export function markSummaryJobSaved(): void {
  controller = undefined;
  useSummaryJobs.setState({ job: null });
  clearSummaryDraft();
}

/** 追问落到草稿上（归档时随之保存） */
export function attachDraftFollowUp(fu: NonNullable<PeriodSummary['followUps']>[number]): void {
  const job = useSummaryJobs.getState().job;
  if (!job?.draft) return;
  const draft: PeriodSummary = { ...job.draft, followUps: [...(job.draft.followUps ?? []), fu] };
  patch({ draft });
  writeDraft({ summary: draft, truncated: job.truncated, continues: job.continues, full: job.full });
}
