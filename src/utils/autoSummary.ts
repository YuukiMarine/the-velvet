/**
 * autoSummary — 自动撰写上一期成长总结（v2.7.0.6，默认开）。
 *
 * 用户口径：「可以查看了」的提醒，本质上还得用户自己去点生成——不如新周期一开始就在后台
 * 写好。于是：新的一周 / 一个月第一次打开 App 时，上一周 / 上个月的总结还没写过、而且那期有
 * 记录，就在后台写好存档（未读），再由推送、助手问候、记录页红点各提醒一次「可以查看了」。
 *
 * 口径：
 *   · 开关在总结弹层与「设置 → AI 总结」，默认开（settings.summaryAutoWrite !== false）；
 *   · 只补**紧挨着的上一期**，离开几周回来不会一口气补一串；那期一条记录都没有就跳过；
 *   · 用当前选的风格与分档（深思熟虑开关照样生效），写法与手动生成完全一样；
 *   · 截断时接着写一次；失败了下次打开再试，最多三次、每次间隔至少六小时；
 *   · 进度记在 localStorage（节流状态，不上云）；换设备时以库里有没有那期总结为准。
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import type { PeriodSummary, SummaryPeriod } from '@/types';
import { chatStream } from '@/utils/aiClient';
import {
  buildContinueMessages, extractSummaryMemo, looksTruncated, parseSummaryResult, summaryKindOf, trimSeam, SUMMARY_MAX_TOKENS,
} from '@/utils/summaryAI';
import { useSummaryJobs, isSummaryJobRunning } from '@/utils/summaryJobs';

const KEY = 'velvet.autoSummary.v1';
const MAX_ATTEMPTS = 3;
const RETRY_GAP_MS = 6 * 3600_000;

interface Rec { status: 'done' | 'skipped' | 'failed'; attempts: number; lastAt: number }

const readAll = (): Record<string, Rec> => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, Rec>; } catch { return {}; }
};
const writeRec = (key: string, rec: Rec) => {
  const all = readAll();
  all[key] = rec;
  // 只留最近 24 条
  const trimmed = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].lastAt - a[1].lastAt).slice(0, 24));
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch { /* 存不了就每次都查库，结果一样 */ }
};

/** 上一周（周一到周日）与上个月的日期范围 */
export function previousPeriods(now = new Date()): Array<{ period: SummaryPeriod; start: string; end: string }> {
  const dow = now.getDay();
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((dow + 6) % 7));
  const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday); lastSunday.setDate(thisMonday.getDate() - 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return [
    { period: 'week', start: toLocalDateKey(lastMonday), end: toLocalDateKey(lastSunday) },
    { period: 'month', start: toLocalDateKey(monthStart), end: toLocalDateKey(monthEnd) },
  ];
}

let running: Promise<void> | null = null;

/** 需要时在后台补写上一期总结（幂等，可反复调用：启动、切回前台都调一次） */
export function maybeAutoWriteSummaries(): Promise<void> {
  if (running) return running;
  running = run().catch(e => { if (import.meta.env.DEV) console.warn('[autoSummary] 异常', e); }).finally(() => { running = null; });
  return running;
}

async function run(): Promise<void> {
  const st = useAppStore.getState();
  if (!st.user || st.settings.summaryAutoWrite === false || !st.settings.summaryApiKey?.trim()) return;
  for (const t of previousPeriods()) {
    const key = `${t.period}:${t.start}`;
    const rec = readAll()[key];
    if (rec?.status === 'done' || rec?.status === 'skipped') continue;
    if (rec?.status === 'failed' && (rec.attempts >= MAX_ATTEMPTS || Date.now() - rec.lastAt < RETRY_GAP_MS)) continue;

    // 已经写过（手动写的、别的设备同步来的都算）
    const exists = (await db.summaries.toArray()).some(x => summaryKindOf(x) === t.period && x.startDate === t.start);
    if (exists) { writeRec(key, { status: 'done', attempts: rec?.attempts ?? 0, lastAt: Date.now() }); continue; }
    // 用户正在手动写同一期：这次先不动
    const job = useSummaryJobs.getState().job;
    if (isSummaryJobRunning(job) && job?.period === t.period && job?.startDate === t.start) continue;
    // 那期一条自己的记录都没有：没什么可写的
    const acts = await db.activities.toArray();
    const count = acts.filter(a => { const k = toLocalDateKey(new Date(a.date)); return k >= t.start && k <= t.end && !a.category; }).length;
    if (count === 0) { writeRec(key, { status: 'skipped', attempts: 0, lastAt: Date.now() }); continue; }

    try {
      await writeOne(t.period, t.start, t.end);
      writeRec(key, { status: 'done', attempts: (rec?.attempts ?? 0) + 1, lastAt: Date.now() });
    } catch (e) {
      writeRec(key, { status: 'failed', attempts: (rec?.attempts ?? 0) + 1, lastAt: Date.now() });
      if (import.meta.env.DEV) console.warn('[autoSummary] 这一期没写成，下次打开再试', key, e);
    }
  }
}

async function writeOne(period: SummaryPeriod, start: string, end: string): Promise<void> {
  const store = useAppStore.getState();
  const req = await store.buildSummaryRequest(period, start, end);
  let full = '';
  let finish = '';
  for await (const d of chatStream(req, req.messages, {
    temperature: 0.8, maxTokens: SUMMARY_MAX_TOKENS, onFinishReason: r => { finish = r; },
  })) full += d;
  let parsed = parseSummaryResult(full);
  // 没收住（被截断 / 连接中途断开）：接着写一次
  if (!parsed.metaFound && (finish === 'length' || (finish !== 'stop' && looksTruncated(parsed.content)))) {
    const seed = trimSeam(full);
    let cont = '';
    for await (const d of chatStream(req, buildContinueMessages(req.messages, seed), { temperature: 0.8, maxTokens: SUMMARY_MAX_TOKENS })) cont += d;
    full = seed + cont;
    parsed = parseSummaryResult(full);
  }
  if (!parsed.content.trim()) throw new Error('模型没有写出正文');
  const memo = parsed.memo ?? await extractSummaryMemo(store.settings, parsed.content).catch(() => undefined);
  const summary: PeriodSummary = {
    id: uuidv4(),
    period,
    startDate: start,
    endDate: end,
    label: req.periodLabel,
    content: parsed.content,
    promptPresetId: req.preset.id,
    promptPresetName: req.preset.name,
    totalPoints: req.totalPoints,
    attributePoints: req.attributePoints,
    activityCount: req.activityCount,
    createdAt: new Date(),
    memo,
    question: parsed.question,
    deliberate: req.deliberate,
    autoWritten: true,
    reqContext: { baseUrl: req.baseUrl, model: req.model, provider: req.provider, messages: req.messages },
  };
  // 存成未读：推送、助手问候、记录页红点各提醒一次「可以查看了」
  await useAppStore.getState().saveSummary(summary);
}
