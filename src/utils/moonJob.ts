/**
 * moonJob — 满月心魔的后台生成（2.7.0.6 第 6 轮 · PRD §11.6）。
 *
 * 满月当天第一次打开 App 就在后台开跑，不挡任何界面：
 *   - 配了 AI：流式生成（思维链续命、超时只算空闲）；JSON 被截断就从半截续，最多续 3 次；
 *   - 没配 AI / 失败 / 续不完：直接用离线模板（名字按月轮换，描述由当月事实拼），保证它一定会来；
 *   - 提示词与半截落 localStorage：App 生成到一半被杀，下次打开从半截接着跑（同一份提示词，弱点不会重掷）；
 *   - 隔了一天还没生成完的（旧任务）：不再等 AI，直接离线模板收尾。
 * 生成完交给 store.completeMoonShadow 落库（它决定是装进环还是先放着）。
 */
import { create } from 'zustand';
import { db } from '@/db';
import { useAppStore } from '@/store';
import type { AttributeId } from '@/types';
import {
  completeMoonReveal, offlineMoonShadow, prepareMoonReveal, JSONTruncatedError,
  type MoonShadowFacts, type PreparedMoonReveal,
} from '@/utils/battleAI';
import { collectMoonFacts } from '@/utils/moonFacts';

const KEY = 'velvet:moonJob';
const RESUME_LIMIT = 3;

interface Persisted {
  slot: number;
  prompt: string;
  weakAttribute: AttributeId;
  facts: MoonShadowFacts;
  partial?: string;
}

const read = (): Persisted | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch { return null; }
};
const write = (p: Persisted) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 隐私模式 / 配额满：降级为不可续跑 */ } };
const clear = () => { try { localStorage.removeItem(KEY); } catch { /* 同上 */ } };

export const useMoonJob = create<{ slot: number | null; running: boolean; shown: string; startedAt: number }>(() => ({
  slot: null, running: false, shown: '', startedAt: 0,
}));

let active: { slot: number; ac: AbortController } | null = null;

/** 进度文本节流：思维链一秒几十段，每段都 setState 太密 */
function throttled(apply: (t: string) => void): (t: string) => void {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (t: string) => {
    pending = t;
    if (timer) return;
    timer = setTimeout(() => { timer = null; if (pending !== null) apply(pending); pending = null; }, 150);
  };
}

export const moonJobRunning = (slot: number): boolean => active?.slot === slot;

export async function startMoonJob(slot: number, opts: { stale?: boolean } = {}): Promise<void> {
  if (active?.slot === slot) return;
  // 先占位再做任何 await：loadData 与战场页挂载可能同时叫到这里
  const ac = new AbortController();
  active = { slot, ac };
  try {
    await runMoonJob(slot, ac, opts);
  } finally {
    if (active?.ac === ac) active = null;
    useMoonJob.setState({ running: false });
  }
}

async function runMoonJob(slot: number, ac: AbortController, opts: { stale?: boolean }): Promise<void> {
  const st = useAppStore.getState();
  const names = st.settings.attributeNames as Record<AttributeId, string>;
  const saved = read();
  const resumable = saved && saved.slot === slot ? saved : null;
  const facts: MoonShadowFacts = resumable?.facts ?? collectMoonFacts({
    activities: st.activities,
    divinations: await db.dailyDivinations.toArray(),
    todos: st.todos,
    battleState: st.battleState,
    now: new Date(),
  });
  const finishOffline = async () => {
    clear();
    await useAppStore.getState().completeMoonShadow(slot, offlineMoonShadow(facts, names), true);
  };
  if (opts.stale) { await finishOffline(); return; }

  let prep: PreparedMoonReveal;
  try {
    const fresh = prepareMoonReveal(st.settings, names, facts);
    // 续跑用同一份提示词与弱点（提示词里写着弱点名，不能重掷）
    prep = resumable ? { ...fresh, prompt: resumable.prompt, weakAttribute: resumable.weakAttribute } : fresh;
  } catch {
    await finishOffline(); // 没配 AI
    return;
  }
  let partial = resumable?.partial;
  write({ slot, prompt: prep.prompt, weakAttribute: prep.weakAttribute, facts, partial });

  useMoonJob.setState({ slot, running: true, shown: partial ?? '', startedAt: Date.now() });
  const onProgress = throttled((t) => { if (!ac.signal.aborted) useMoonJob.setState({ shown: t }); });
  for (let attempt = 0; attempt <= RESUME_LIMIT; attempt++) {
    try {
      const data = await completeMoonReveal(prep, names, { signal: ac.signal, resumeFrom: partial, onProgress });
      if (ac.signal.aborted) return;
      clear();
      await useAppStore.getState().completeMoonShadow(slot, data, false);
      return;
    } catch (e) {
      if (ac.signal.aborted) return;
      if (e instanceof JSONTruncatedError && attempt < RESUME_LIMIT) {
        partial = e.partial;
        write({ slot, prompt: prep.prompt, weakAttribute: prep.weakAttribute, facts, partial });
        continue;
      }
      break;
    }
  }
  if (!ac.signal.aborted) await finishOffline();
}

/** 测试 / 重置战场用：掐掉在跑的生成并清掉续跑材料 */
export function cancelMoonJob(): void {
  active?.ac.abort();
  active = null;
  clear();
  useMoonJob.setState({ slot: null, running: false, shown: '' });
}
