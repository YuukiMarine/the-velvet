/**
 * aiJobs — AI 后台任务的「登记簿」（第 27 批 · PRD §21.3 ①②）。
 *
 * 四个任务模块（tarotJobs / summaryJobs / revealJobs / moonJob）各有自己的状态机，这里**一个都不改**：
 * 每个模块加载时把自己的小仓登记进来（registerAIJobSource），本模块只订阅、只归表——「谁在写、写完了没」。
 * 表给三处用：
 *   · 底导中间的黑猫键 / 侧栏「助手」上的小圆点（有任务在跑，或有写好了还没看的）；
 *   · 顶部可收起的横幅（「正在写：中长期占卜 · 思考中 42%」，点一行直达那个弹层）；
 *   · 写完提醒：任务写完时用户不在那一页 → 横幅留一条「写好了」；App 在后台（原生）→ 再发一条本地通知。
 *     每个任务只提醒一次，口径沿用成长总结的「可以查看了」。
 * 「在那一页」由弹层 / 区块挂载时登记（useWatchAIJob）：正开着看的，不留小条、不发通知。
 *
 * 本文件刻意轻：只 import type 四个模块的状态（不把 tarotAI / battleAI 拖进主包）；
 * 登记调用写在各模块末尾，模块没加载就不可能有它的任务在跑，表自然是空的。
 * 通知 ID 用 44000 段（41000 时段提醒 / 42000 一起进步 / 42100 弹幕 / 43000 助手找你 都已占）。
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { useAppStore } from '@/store';
import { isNative } from '@/utils/native';
import { requestOpenSummary } from '@/utils/reportNotice';
import type { Settings } from '@/types';
import type { useTarotJobs } from '@/utils/tarotJobs';
import type { useSummaryJobs } from '@/utils/summaryJobs';
import type { useRevealJobs } from '@/utils/revealJobs';
import type { useMoonJob } from '@/utils/moonJob';

export type AIJobKey = 'daily' | 'long' | 'follow' | 'fate' | 'summary' | 'stratum' | 'final' | 'moon';
export type AIJobState = 'running' | 'done' | 'error';

export const AI_JOB_LABELS: Record<AIJobKey, string> = {
  daily: '今日塔罗', long: '中长期占卜', follow: '塔罗追问', fate: '窥探命运',
  summary: '成长总结', stratum: '区层显形', final: '伪神显形', moon: '月度心魔',
};

/** 通知正文（标题是「〈名字〉写好了」） */
const DONE_BODY: Record<AIJobKey, string> = {
  daily: '今天这张牌的解读写好了，可以查看了。',
  long: '这份占卜写好了，可以查看了。',
  follow: '追问的回应写好了，可以查看了。',
  fate: '七日的总占卜写好了，可以查看了。',
  summary: '这一期的成长总结写好了，可以查看了。',
  stratum: '区层已经显形，回战场看看。',
  final: '塔顶的那位已经显形，回战场看看。',
  moon: '这个月的月度心魔已经凝成形。',
};

export interface AIJobView {
  key: AIJobKey;
  /** 这一发的身份：同一 key 的下一发换新 id（写完 / 中断只按同一发判一次） */
  id: string;
  label: string;
  state: AIJobState;
  startedAt: number;
  /** 直达用：long = 将来的 reading id；follow = 所属 reading id */
  ref?: string;
}

/** 写完 / 中断时用户不在那一页：横幅里留的一条 */
export interface AIJobNote {
  key: AIJobKey;
  id: string;
  label: string;
  state: 'done' | 'error';
  ref?: string;
  at: number;
}

interface AIJobsState {
  running: AIJobView[];
  notes: AIJobNote[];
  /** 正开着看它的弹层 / 区块数（>0 = 在那一页） */
  watching: Partial<Record<AIJobKey, number>>;
  /** 横幅收起（本次会话内；新任务开跑 / 写完时再展开） */
  collapsed: boolean;
}

export const useAIJobs = create<AIJobsState>(() => ({ running: [], notes: [], watching: {}, collapsed: false }));

// ── 登记：各任务模块加载时把自己的小仓交进来 ─────────────────────────────

interface SourceApi<S> { getState: () => S; subscribe: (listener: (s: S) => void) => () => void }
/** 横幅上那行小字 + 进度（思考阶段才有百分比） */
export interface AIJobLive { text: string; pct: number | null }
type Source = { get: () => AIJobView[]; live: (key: AIJobKey) => AIJobLive | null };
const sources: Source[] = [];

export function registerAIJobSource<S>(store: SourceApi<S>, views: (s: S) => AIJobView[], live: (s: S, key: AIJobKey) => AIJobLive | null): void {
  sources.push({ get: () => views(store.getState()), live: key => live(store.getState(), key) });
  store.subscribe(() => recompute());
  recompute();
}

/** 横幅每半秒读一次：进度是时间推的（thinkProgress），不经过仓 */
export function liveStatusOf(key: AIJobKey): AIJobLive {
  for (const src of sources) {
    const l = src.live(key);
    if (l) return l;
  }
  return { text: '正在写', pct: null };
}

const fmtElapsed = (startedAt: number): string => {
  const s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface ThinkLike { status: string; thinking?: boolean; tracker?: { progress: () => number } | null }
/** 塔罗四路 / 成长总结共用：thinking 读 tracker 的预估进度，streaming 就是「正在写」 */
function thinkLive(j: ThinkLike): AIJobLive | null {
  if (j.status === 'preparing') return { text: '整理材料中', pct: null };
  if (j.status === 'thinking') {
    const p = j.tracker ? j.tracker.progress() : 0;
    if (!j.thinking && p < 0.05) return { text: '连接中', pct: null };
    return { text: `思考中 ${Math.round(Math.min(0.99, p) * 100)}%`, pct: Math.min(0.99, p) };
  }
  if (j.status === 'streaming') return { text: '正在写', pct: null };
  return null;
}

// 四个模块各自的「状态 → 表」（结构类型，只 import type）
type TarotState = ReturnType<typeof useTarotJobs.getState>;
type SummaryState = ReturnType<typeof useSummaryJobs.getState>;
type RevealState = ReturnType<typeof useRevealJobs.getState>;
type MoonState = ReturnType<typeof useMoonJob.getState>;

export function tarotJobViews(s: TarotState): AIJobView[] {
  const out: AIJobView[] = [];
  const push = (key: AIJobKey, j: { status: string; startedAt: number } | null, ref?: string) => {
    if (!j) return;
    const state: AIJobState = j.status === 'thinking' || j.status === 'streaming' ? 'running' : j.status === 'done' ? 'done' : 'error';
    out.push({ key, id: `${key}:${j.startedAt}`, label: AI_JOB_LABELS[key], state, startedAt: j.startedAt, ref });
  };
  push('daily', s.daily);
  push('long', s.long, s.long?.id);
  push('follow', s.follow, s.follow?.readingId);
  push('fate', s.fate);
  return out;
}

export function summaryJobViews(s: SummaryState): AIJobView[] {
  const j = s.job;
  if (!j) return [];
  const running = j.status === 'preparing' || j.status === 'thinking' || j.status === 'streaming';
  return [{ key: 'summary', id: j.id, label: AI_JOB_LABELS.summary, state: running ? 'running' : j.status === 'done' ? 'done' : 'error', startedAt: j.startedAt }];
}

export function revealJobViews(s: RevealState): AIJobView[] {
  const out: AIJobView[] = [];
  const push = (key: AIJobKey, j: { id: string; status: string; startedAt: number } | null) => {
    if (!j) return;
    out.push({ key, id: j.id, label: AI_JOB_LABELS[key], state: j.status === 'running' ? 'running' : j.status === 'done' ? 'done' : 'error', startedAt: j.startedAt });
  };
  push('stratum', s.stratum);
  push('final', s.final);
  return out;
}

export function moonJobViews(s: MoonState): AIJobView[] {
  if (!s.running || s.slot === null) return [];
  return [{ key: 'moon', id: `moon:${s.slot}:${s.startedAt}`, label: AI_JOB_LABELS.moon, state: 'running', startedAt: s.startedAt }];
}

export function tarotJobLive(s: TarotState, key: AIJobKey): AIJobLive | null {
  const j = key === 'daily' ? s.daily : key === 'long' ? s.long : key === 'follow' ? s.follow : key === 'fate' ? s.fate : null;
  return j ? thinkLive(j) : null;
}

export function summaryJobLive(s: SummaryState, key: AIJobKey): AIJobLive | null {
  return key === 'summary' && s.job ? thinkLive(s.job) : null;
}

export function revealJobLive(s: RevealState, key: AIJobKey): AIJobLive | null {
  const j = key === 'stratum' ? s.stratum : key === 'final' ? s.final : null;
  if (!j || j.status !== 'running') return null;
  return { text: `显形中 · ${fmtElapsed(j.startedAt)}`, pct: null };
}

export function moonJobLive(s: MoonState, key: AIJobKey): AIJobLive | null {
  if (key !== 'moon' || !s.running) return null;
  return { text: `凝形中 · ${fmtElapsed(s.startedAt)}`, pct: null };
}

// ── 归表：跑着的 / 刚写完的 ───────────────────────────────────────────────

let prev = new Map<AIJobKey, AIJobView>();
let lastSig = '';

function recompute(): void {
  const now = sources.flatMap(src => src.get());
  const nowMap = new Map<AIJobKey, AIJobView>();
  for (const v of now) nowMap.set(v.key, v);
  const st = useAIJobs.getState();
  let notes = st.notes;
  let collapsed = st.collapsed;
  // 上一刻在跑、这一刻写完 / 中断了 → 一次「完成」事件（月度心魔没有 done 态：跑着 → 不见了就是收尾了）
  for (const [key, p] of prev) {
    if (p.state !== 'running') continue;
    const n = nowMap.get(key);
    const finished: AIJobView | null = n && n.id === p.id && n.state !== 'running'
      ? n
      : (!n && key === 'moon' ? { ...p, state: 'done' } : null);
    if (!finished) continue;
    if ((st.watching[key] ?? 0) > 0) continue;            // 正开着看：弹层自己会演
    notes = [...notes.filter(x => x.key !== key), { key, id: finished.id, label: finished.label, state: finished.state === 'done' ? 'done' : 'error', ref: finished.ref, at: Date.now() }];
    collapsed = false;
    void notifyJobDone(finished);
  }
  // 新开跑的：横幅展开、同类旧小条撤掉
  for (const v of now) {
    if (v.state !== 'running') continue;
    const p = prev.get(v.key);
    if (!p || p.id !== v.id || p.state !== 'running') {
      collapsed = false;
      notes = notes.filter(x => x.key !== v.key);
    }
  }
  prev = nowMap;
  const running = now.filter(v => v.state === 'running');
  const sig = running.map(v => `${v.id}:${v.state}`).join('|');
  // 进度文本每 120ms 刷一次仓，表没变就不动（横幅自己起定时器读进度）
  if (sig === lastSig && notes === st.notes && collapsed === st.collapsed) return;
  lastSig = sig;
  useAIJobs.setState({ running, notes, collapsed });
}

/** 弹层 / 区块挂载时登记「我在看这个」；返回注销函数 */
export function watchAIJob(key: AIJobKey): () => void {
  useAIJobs.setState(s => ({
    watching: { ...s.watching, [key]: (s.watching[key] ?? 0) + 1 },
    notes: s.notes.filter(n => n.key !== key),
  }));
  return () => useAIJobs.setState(s => ({ watching: { ...s.watching, [key]: Math.max(0, (s.watching[key] ?? 0) - 1) } }));
}

export function useWatchAIJob(key: AIJobKey, active = true): void {
  useEffect(() => {
    if (!active) return;
    return watchAIJob(key);
  }, [key, active]);
}

export const dismissAIJobNote = (key: AIJobKey): void =>
  useAIJobs.setState(s => ({ notes: s.notes.filter(n => n.key !== key) }));

export const setAIJobsCollapsed = (collapsed: boolean): void => useAIJobs.setState({ collapsed });

// ── 直达：点横幅 / 点通知 → 去那一页并把弹层拉起来 ─────────────────────────
// 页面各自订阅这个小信箱（与 reportNotice 的「打开这份总结」同一个路子）：
// 占星页消费 daily / long / follow / fate，战场页消费 stratum / final / moon。

export interface AIJobFocus { key: AIJobKey; ref?: string; nonce: number }
export const useAIJobFocus = create<{ request: AIJobFocus | null }>(() => ({ request: null }));
const FOCUS_TTL_MS = 60_000;

export const requestAIJobFocus = (key: AIJobKey, ref?: string): void =>
  useAIJobFocus.setState({ request: { key, ref, nonce: Date.now() } });

/** 不消费地看一眼（父页面要据此切 tab，再让子区块消费） */
export function peekAIJobFocus(keys: AIJobKey[]): AIJobFocus | null {
  const r = useAIJobFocus.getState().request;
  if (!r || !keys.includes(r.key)) return null;
  if (Date.now() - r.nonce > FOCUS_TTL_MS) { useAIJobFocus.setState({ request: null }); return null; }
  return r;
}

export function consumeAIJobFocus(keys: AIJobKey[]): AIJobFocus | null {
  const r = peekAIJobFocus(keys);
  if (r) useAIJobFocus.setState({ request: null });
  return r;
}

export function openAIJob(key: AIJobKey, ref?: string): void {
  dismissAIJobNote(key);
  const st = useAppStore.getState();
  switch (key) {
    case 'daily':
    case 'long':
    case 'follow':
    case 'fate':
      requestAIJobFocus(key, ref);
      st.setCurrentPage('astrology');
      return;
    case 'summary':
      // 总结弹层挂在记录页里：走它现成的「打开总结」信箱（没指定 id = 有在跑的任务 / 草稿就进结果页）
      requestOpenSummary();
      st.setActionsSubTab('activities');
      st.setCurrentPage('actions');
      return;
    case 'stratum':
    case 'final':
    case 'moon':
      requestAIJobFocus(key, ref);
      st.setCurrentPage('battle');
      return;
  }
}

// ── 写完提醒（原生本地通知；网页版只有横幅那条） ───────────────────────────

export const AI_JOB_NOTIF_ID_BASE = 44000;
const KEY_INDEX: Record<AIJobKey, number> = { daily: 0, long: 1, follow: 2, fate: 3, summary: 4, stratum: 5, final: 6, moon: 7 };
const notified = new Set<string>();

/** 设置口径：跟着提醒总开关走（和「助手找你」一样），子开关缺省 = 开 */
export const jobDoneNotifyEnabled = (settings: Settings): boolean =>
  !!settings.notificationsEnabled && settings.aiJobDoneNotify !== false;

/**
 * 要不要发这一条（纯判定，测试用）：只有 done 才发；在前台（页面可见）不发——横幅就够了；
 * 网页版没有本地通知；设置关了不发。
 */
export function shouldNotifyJobDone(v: Pick<AIJobView, 'state'>, env: { hidden: boolean; native: boolean; settings: Settings }): boolean {
  if (v.state !== 'done') return false;
  if (!env.hidden) return false;
  if (!env.native) return false;
  return jobDoneNotifyEnabled(env.settings);
}

async function notifyJobDone(v: AIJobView): Promise<boolean> {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  if (!shouldNotifyJobDone(v, { hidden, native: isNative(), settings: useAppStore.getState().settings })) return false;
  if (notified.has(v.id)) return false;
  notified.add(v.id);
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: AI_JOB_NOTIF_ID_BASE + KEY_INDEX[v.key],
        title: `${v.label}写好了`,
        body: DONE_BODY[v.key],
        extra: { content: 'aijob', key: v.key, ref: v.ref ?? null },
      }],
    });
    return true;
  } catch {
    return false;
  }
}

/** 点开「写好了」的通知：App.tsx 的通知点击处理器调这里 */
export function openAIJobFromNotification(extra: { key?: unknown; ref?: unknown } | undefined): boolean {
  const key = extra?.key;
  if (typeof key !== 'string' || !(key in AI_JOB_LABELS)) return false;
  openAIJob(key as AIJobKey, typeof extra?.ref === 'string' ? extra.ref : undefined);
  return true;
}

/** 测试 / 调试：当前表 */
export const peekAIJobs = () => useAIJobs.getState();
