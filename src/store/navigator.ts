/**
 * navigator store — F6 黑猫的窗口开关 + 当日会话 + 回合仲裁器（Batch2）。
 *
 * 仲裁器把「消息流」与「LLM 回合」解耦（F6_NAVIGATOR_MEMORY.md §3）：
 *   idle → collecting(动态收口窗口) → thinking(AI 在飞,可 abort) → replying(分段吐泡,可打断) → idle
 * 崩溃安全：待收口批 = 消息流尾部连续的用户消息（从日志推导，零持久化）；
 * 计时器 / AbortController / 吞话 均为模块级易失状态，丢了重开窗即重建。
 *
 * 会话延续：当日保留、跨天清流（Batch3 迁 Dexie，消息结构已对齐未来表）。
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import { getAIConfig } from '@/utils/aiClient';
import {
  buildDailyGreeting, buildFallbackReply, buildShortGreeting, buildSnapshot,
  type NavigatorDraft,
} from '@/utils/navigatorRegistry';
import { generateAIGreeting, runNavigatorTurn, splitSegments, type TurnHistoryItem } from '@/utils/navigatorIntent';

export type NavigatorCardStatus = 'pending' | 'done' | 'cancelled';
export type NavigatorPhase = 'idle' | 'collecting' | 'thinking' | 'replying';

export interface NavigatorMessage {
  id: string;
  /** cat=黑猫气泡 / user=用户气泡 / card=待确认动作卡（draft+status） */
  role: 'cat' | 'user' | 'card';
  text?: string;
  draft?: NavigatorDraft;
  cardStatus?: NavigatorCardStatus;
  /** 执行成功后的回执文案（渲染在卡片下方的黑猫签章行） */
  receipt?: string;
  createdAt: number;
}

interface NavigatorState {
  isOpen: boolean;
  /** 会话所属日期（跨天清流判据） */
  dateKey: string;
  messages: NavigatorMessage[];
  /** 仲裁器相位（UI 据此渲染打字指示等） */
  phase: NavigatorPhase;
  open: () => void;
  close: () => void;
  /** 跨天则清空消息并更新 dateKey；返回是否发生了清流 */
  rolloverIfNewDay: () => boolean;
  /** 输入框活动信号（聚焦且非空 / IME 组合中）→ 收口窗口挂起等它说完 */
  setInputActive: (active: boolean) => void;
  /** 用户发一条消息 → 进入/重置收口，或打断 thinking/replying */
  userSend: (text: string) => void;
  /** 开窗问候（跨天完整版走 AI + 超时落模板；当日空会话简短招呼） */
  greet: () => void;
  pushCat: (text: string) => void;
  pushUser: (text: string) => void;
  pushCard: (draft: NavigatorDraft) => string;
  updateCard: (id: string, patch: Partial<Pick<NavigatorMessage, 'draft' | 'cardStatus' | 'receipt'>>) => void;
}

const msg = (partial: Omit<NavigatorMessage, 'id' | 'createdAt'>): NavigatorMessage => ({
  id: uuidv4(),
  createdAt: Date.now(),
  ...partial,
});

// ── 仲裁器易失状态（模块级；崩溃/重开即重建，不进 zustand） ──
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let settleWaitStart = 0;
let turnAbort: AbortController | null = null;
/** 代计数：每次打断/清流 +1，异步续体凭票入场，过期作废 */
let generation = 0;
let inputActive = false;
/** 被打断吞掉的回复段（Batch3 迁入 session.swallowed 持久化） */
let swallowed: string[] = [];

const GREET_TIMEOUT_MS = 4000;
const SETTLE_INPUT_POLL_MS = 500;
const SETTLE_INPUT_MAX_WAIT_MS = 15000;

const isD0 = () =>
  typeof document !== 'undefined' && document.documentElement.getAttribute('data-boldness') === '0';

/** 动态收口窗口：按"这句像不像说完了"定时长（D0 压最短，仪式不变负担） */
const settleWindowMs = (text: string): number => {
  if (isD0()) return 300;
  const t = text.trim();
  if (/[。？！?!~～)）」”]$/.test(t)) return 800;
  if (t.length <= 4 || /[，、,…—-]$/.test(t)) return 2500;
  return 1400;
};

/** 分段吐泡延迟：模拟打字节奏（D0 直出） */
const segmentDelayMs = (seg: string): number => {
  if (isD0()) return 0;
  const base = Math.min(2200, Math.max(400, seg.length * 30));
  return Math.round(base * (0.85 + Math.random() * 0.3));
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 可中断睡眠：小片轮询 gen，打断在 ~120ms 内被察觉（吐泡段间隙即插话点） */
const sleepUnlessStale = async (ms: number, gen: number): Promise<boolean> => {
  let waited = 0;
  while (waited < ms) {
    if (gen !== generation) return false;
    const chunk = Math.min(120, ms - waited);
    await sleep(chunk);
    waited += chunk;
  }
  return gen === generation;
};

const clearSettle = () => {
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
};

export const useNavigatorStore = create<NavigatorState>((set, get) => {
  /** 待收口批 = 消息尾部"最后一条非用户消息之后"的连续用户消息（§3.7 可推导性） */
  const pendingBatch = (): string => {
    const ms = get().messages;
    const batch: string[] = [];
    for (let i = ms.length - 1; i >= 0; i--) {
      if (ms[i].role === 'user') batch.unshift(ms[i].text ?? '');
      else break;
    }
    return batch.join('\n');
  };

  /** 历史投影（不含待收口批；卡片折叠成一行文本） */
  const historyForTurn = (): TurnHistoryItem[] => {
    const ms = get().messages;
    // 去掉尾部待收口的用户消息
    let end = ms.length;
    while (end > 0 && ms[end - 1].role === 'user') end--;
    return ms.slice(0, end).map((m): TurnHistoryItem => {
      if (m.role === 'card' && m.draft) {
        const status = m.cardStatus === 'done' ? '已确认' : m.cardStatus === 'cancelled' ? '已取消' : '待确认';
        return { role: 'cat', text: `[动作卡·${status}]${m.receipt ? ` ${m.receipt}` : ''}` };
      }
      return { role: m.role === 'user' ? 'user' : 'cat', text: m.text ?? '' };
    }).filter((h) => h.text);
  };

  /** 收口 → thinking → replying → idle（gen 凭票，全程可被打断作废） */
  const settleNow = async () => {
    if (get().phase !== 'collecting') return;
    // 用户还在打字：挂起等他说完（上限兜底防永挂）
    if (inputActive && Date.now() - settleWaitStart < SETTLE_INPUT_MAX_WAIT_MS) {
      settleTimer = setTimeout(() => void settleNow(), SETTLE_INPUT_POLL_MS);
      return;
    }
    const batch = pendingBatch().trim();
    if (!batch) { set({ phase: 'idle' }); return; }
    const gen = ++generation;
    set({ phase: 'thinking' });

    const cfg = getAIConfig(useAppStore.getState().settings);
    if (!cfg) {
      // 菜单层模板接话（连发只回这一次——仲裁器治愈 Batch1 的刷屏）
      await sleep(isD0() ? 0 : 500);
      if (gen !== generation) return;
      get().pushCat(buildFallbackReply());
      set({ phase: 'idle' });
      return;
    }

    turnAbort = new AbortController();
    const mySwallowed = swallowed;
    swallowed = [];
    try {
      const result = await runNavigatorTurn(historyForTurn(), batch, mySwallowed, turnAbort.signal);
      if (gen !== generation) return;
      // 分段吐泡（段间隙 = 天然插话点）
      set({ phase: 'replying' });
      for (let i = 0; i < result.segments.length; i++) {
        if (gen !== generation) { swallowed = result.segments.slice(i); return; }
        get().pushCat(result.segments[i]);
        if (i < result.segments.length - 1) {
          const alive = await sleepUnlessStale(segmentDelayMs(result.segments[i + 1]), gen);
          if (!alive) { swallowed = result.segments.slice(i + 1); return; }
        }
      }
      if (result.draft) get().pushCard(result.draft);
      set({ phase: 'idle' });
    } catch (e) {
      if (gen !== generation) return; // 被打断的 abort，静默
      get().pushCat(e instanceof Error && e.message.includes('超时')
        ? '信号断了一下……再说一遍？'
        : '刚才没接住，稍后再试试。');
      set({ phase: 'idle' });
    } finally {
      if (gen === generation) turnAbort = null;
    }
  };

  const scheduleSettle = (lastText: string) => {
    clearSettle();
    settleWaitStart = Date.now();
    settleTimer = setTimeout(() => void settleNow(), settleWindowMs(lastText));
  };

  return {
    isOpen: false,
    dateKey: toLocalDateKey(),
    messages: [],
    phase: 'idle',

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),

    rolloverIfNewDay: () => {
      const today = toLocalDateKey();
      if (get().dateKey === today) return false;
      generation++;
      clearSettle();
      turnAbort?.abort();
      swallowed = [];
      set({ dateKey: today, messages: [], phase: 'idle' });
      return true;
    },

    setInputActive: (active) => { inputActive = active; },

    userSend: (text) => {
      const phase = get().phase;
      get().pushUser(text);
      if (phase === 'thinking') {
        // 打断 AI：作废在飞请求，并回收口重新酝酿
        generation++;
        turnAbort?.abort();
        turnAbort = null;
      } else if (phase === 'replying') {
        // 打断吐泡：剩余段已在吐泡循环里凭 gen 存入 swallowed
        generation++;
      }
      set({ phase: 'collecting' });
      scheduleSettle(text);
    },

    greet: () => {
      const st = get();
      st.rolloverIfNewDay();
      if (get().messages.length > 0) return;
      const snap = buildSnapshot();
      const app = useAppStore.getState();
      const firstToday = app.settings.navigatorLastGreetDate !== snap.dateKey;
      if (firstToday) void app.updateSettings({ navigatorLastGreetDate: snap.dateKey });

      if (!firstToday || !getAIConfig(app.settings)) {
        get().pushCat(firstToday ? buildDailyGreeting(snap) : buildShortGreeting(snap));
        return;
      }
      // 有 Key 的跨天首开：打字指示等 AI，超时/失败静默落模板（等待本身就是拟人）
      const gen = ++generation;
      set({ phase: 'thinking' });
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), GREET_TIMEOUT_MS);
      void generateAIGreeting(snap, ac.signal)
        .then((text) => {
          clearTimeout(timer);
          if (gen !== generation) return;
          splitSegments(text ?? buildDailyGreeting(snap)).forEach((seg) => get().pushCat(seg));
          set({ phase: 'idle' });
        })
        .catch(() => {
          clearTimeout(timer);
          if (gen !== generation) return;
          get().pushCat(buildDailyGreeting(snap));
          set({ phase: 'idle' });
        });
    },

    pushCat: (text) => set((s) => ({ messages: [...s.messages, msg({ role: 'cat', text })] })),
    pushUser: (text) => set((s) => ({ messages: [...s.messages, msg({ role: 'user', text })] })),
    pushCard: (draft) => {
      const m = msg({ role: 'card', draft, cardStatus: 'pending' });
      set((s) => ({ messages: [...s.messages, m] }));
      return m.id;
    },
    updateCard: (id, patch) =>
      set((s) => ({
        messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      })),
  };
});
