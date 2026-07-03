/**
 * navigator store — F6 黑猫：窗口开关 + 回合仲裁器（Batch2）+ 会话持久化与人格（Batch3）。
 *
 * 仲裁器把「消息流」与「LLM 回合」解耦（F6_NAVIGATOR_MEMORY.md §3）：
 *   idle → collecting(动态收口窗口) → thinking(AI 在飞,可 abort) → replying(分段吐泡,可打断) → idle
 * 崩溃安全：待收口批 = 消息流尾部连续的用户消息（从日志推导）；计时器/AbortController 易失。
 *
 * 持久化（Batch3）：会话按「每日 × 人格」一条（跨天清流、切人格开新会话，当日切回旧人格
 * 恢复旧会话）；消息/卡片状态/吞话全部落 Dexie，跨重启存活。hydrate 异步、写库 fire-and-forget，
 * 竞态用 pendingWrites 缓冲（hydrate 完成前产生的消息补写入库）。
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { getAIConfig } from '@/utils/aiClient';
import {
  ACTION_META, buildDailyGreeting, buildFallbackReply, buildPreviewLines, buildShortGreeting,
  buildSnapshot, type NavigatorDraft,
} from '@/utils/navigatorRegistry';
import {
  generateAIGreeting, runNavigatorTurn, splitSegments, type TurnHistoryItem,
} from '@/utils/navigatorIntent';
import {
  buildWarmthLine, finalizeStaleSessions, getProfile, lazySweepMemos, maybeCompactLive, recallMemories,
} from '@/utils/navigatorMemory';
import { BUILTIN_NAVIGATOR_PRESETS, resolveNavigatorPreset } from '@/constants/navigatorPresets';
import type { NavigatorMessageRow, NavigatorPreset } from '@/types';

export type NavigatorCardStatus = 'pending' | 'done' | 'cancelled';
export type NavigatorPhase = 'idle' | 'collecting' | 'thinking' | 'replying';

export interface NavigatorMessage {
  id: string;
  /** cat=黑猫气泡 / user=用户气泡 / card=待确认动作卡 / summary=compact 摘要占位（Batch3 后段） */
  role: 'cat' | 'user' | 'card' | 'summary';
  text?: string;
  draft?: NavigatorDraft;
  cardStatus?: NavigatorCardStatus;
  /** 执行成功后的回执文案（渲染在卡片下方的签章行） */
  receipt?: string;
  createdAt: number;
  /** 归属会话：上拉加载的历史消息与今日会话共存于 messages，凭它区分（上下文只用今日的） */
  sessionId?: string;
}

/** 气泡时间戳（渲染层 + 历史上下文标注共用）：今天 HH:mm / 昨天 HH:mm / M月D日 HH:mm */
export function formatBubbleTime(ts: number): string {
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  if (ts >= today0.getTime()) return hm;
  if (ts >= today0.getTime() - 86400_000) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/** 相邻消息隔 >5 分钟 → 显示新时间戳（UI 与 LLM 历史标注同一规则） */
export const TIME_GAP_MS = 5 * 60 * 1000;

interface NavigatorState {
  isOpen: boolean;
  /** 会话所属日期（跨天清流判据） */
  dateKey: string;
  /** 当前会话 id（hydrate 后非空） */
  sessionId: string | null;
  messages: NavigatorMessage[];
  /** 已加载历史的最早日期（上拉分页游标；初始=今日） */
  oldestLoadedDate: string;
  /** 是否还有更早的历史可拉（7 天保存期内） */
  hasOlder: boolean;
  /** 上拉加载更早一天的对话（当前人格线；返回是否加载到内容） */
  loadOlder: () => Promise<boolean>;
  /** 自定义人格（内置在常量里，不入表） */
  presets: NavigatorPreset[];
  /** 仲裁器相位（UI 据此渲染打字指示等） */
  phase: NavigatorPhase;
  open: () => void;
  close: () => void;
  /** 当前激活人格（settings.navigatorPresetId 解析；缺省黑猫） */
  activePreset: () => NavigatorPreset;
  loadPresets: () => Promise<void>;
  savePreset: (p: NavigatorPreset) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  /** 切人格 = 开（或恢复）该人格的今日会话，空会话时播接管语 */
  switchPreset: (id: string) => Promise<void>;
  /** 跨天则清流并重挂当日会话；返回是否发生了清流 */
  rolloverIfNewDay: () => boolean;
  /** 输入框活动信号（聚焦且非空 / IME 组合中）→ 收口窗口挂起等它说完 */
  setInputActive: (active: boolean) => void;
  /** 用户发一条消息 → 进入/重置收口，或打断 thinking/replying */
  userSend: (text: string) => void;
  /** 开窗问候：先 hydrate 当日会话，空会话才问候（跨天完整版走 AI + 超时落模板） */
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
/** 被打断吞掉的回复段（随 session.swallowed 持久化，跨重启回捞） */
let swallowed: string[] = [];
/** hydrate 完成前产生的消息先入内存，这里排队补写 */
let pendingWrites: NavigatorMessage[] = [];
let hydrating: Promise<void> | null = null;

// 推理模型（DeepSeek v4 等）问候常要 3~8s，4s 会高频落模板；打字指示本来就是拟人化等待
const GREET_TIMEOUT_MS = 9000;
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

// ── 持久化编解码 ──

const toRow = (m: NavigatorMessage, sessionId: string): NavigatorMessageRow => ({
  id: m.id,
  sessionId,
  role: m.role,
  text: m.text,
  draftJson: m.draft ? JSON.stringify(m.draft) : undefined,
  cardStatus: m.cardStatus,
  receipt: m.receipt,
  createdAt: m.createdAt,
});

const fromRow = (r: NavigatorMessageRow): NavigatorMessage => ({
  id: r.id,
  role: r.role,
  text: r.text,
  draft: r.draftJson ? (JSON.parse(r.draftJson) as NavigatorDraft) : undefined,
  cardStatus: r.cardStatus,
  receipt: r.receipt,
  createdAt: r.createdAt,
  sessionId: r.sessionId,
});

export const useNavigatorStore = create<NavigatorState>((set, get) => {
  /** 消息写库（fire-and-forget；未 hydrate 先排队） */
  const persistMessage = (m: NavigatorMessage) => {
    const sid = get().sessionId;
    if (!sid) { pendingWrites.push(m); return; }
    void db.navigatorMessages.put(toRow(m, sid)).catch((e) => console.warn('[navigator] 消息写库失败', e));
    void db.navigatorSessions.update(sid, { updatedAt: new Date() }).catch(() => {});
  };

  const persistSwallowed = () => {
    const sid = get().sessionId;
    if (sid) void db.navigatorSessions.update(sid, { swallowed, updatedAt: new Date() }).catch(() => {});
  };

  /**
   * 挂载「今日 × 当前人格」的会话：有则恢复（消息回灌），无则新建。
   * 跨天/切人格都汇到这里——它是会话生命周期的唯一入口。
   */
  const hydrateSession = (): Promise<void> => {
    if (hydrating) return hydrating;
    hydrating = (async () => {
      try {
        const today = toLocalDateKey();
        const preset = get().activePreset();
        const cur = get();
        if (cur.sessionId && cur.dateKey === today) {
          // 已挂载今日会话：只需校验人格没变
          const row = await db.navigatorSessions.get(cur.sessionId);
          if (row && row.presetId === preset.id) return;
        }
        const existing = await db.navigatorSessions
          .where('dateKey').equals(today)
          .and((s) => s.presetId === preset.id)
          .first();
        const sessionId = existing?.id ?? uuidv4();
        if (!existing) {
          await db.navigatorSessions.put({
            id: sessionId, dateKey: today, presetId: preset.id,
            createdAt: new Date(), updatedAt: new Date(),
          });
        }
        const rows = await db.navigatorMessages.where('sessionId').equals(sessionId).sortBy('createdAt');
        swallowed = existing?.swallowed ?? [];
        // hydrate 期间产生的内存消息（如无 Key 秒开就发话）追加在库存消息之后并补写
        const inMemoryNew = pendingWrites.slice().map((m) => ({ ...m, sessionId }));
        pendingWrites = [];
        set({ sessionId, dateKey: today, messages: [...rows.map(fromRow), ...inMemoryNew], oldestLoadedDate: today, hasOlder: true });
        for (const m of inMemoryNew) persistMessage(m);
        void purgeExpired(today);
      } catch (e) {
        console.warn('[navigator] 会话挂载失败（本次退化为内存会话）', e);
      } finally {
        hydrating = null;
      }
    })();
    return hydrating;
  };

  /** 7 天保存期：更早会话的消息删除（会话行与摘要保留——记忆已提炼，原文可弃） */
  const purgeExpired = async (today: string) => {
    try {
      const cutoff = new Date(Date.parse(today) - 7 * 86400_000);
      const cutoffKey = toLocalDateKey(cutoff);
      const old = (await db.navigatorSessions.toArray()).filter((s) => s.dateKey < cutoffKey);
      for (const s of old) await db.navigatorMessages.where('sessionId').equals(s.id).delete();
    } catch { /* 静默 */ }
  };

  /** 今日会话的消息（上拉加载的历史消息只供浏览，绝不进上下文/收口批） */
  const currentSessionMessages = (): NavigatorMessage[] => {
    const sid = get().sessionId;
    return get().messages.filter((m) => !sid || !m.sessionId || m.sessionId === sid);
  };

  /** 待收口批 = 消息尾部"最后一条非用户消息之后"的连续用户消息（§3.7 可推导性） */
  const pendingBatch = (): string => {
    const ms = currentSessionMessages();
    const batch: string[] = [];
    for (let i = ms.length - 1; i >= 0; i--) {
      if (ms[i].role === 'user') batch.unshift(ms[i].text ?? '');
      else break;
    }
    return batch.join('\n');
  };

  /**
   * 历史投影（不含待收口批）。卡片**不进 assistant 历史**——模型会模仿自己
   * "说过"的折叠标记、在 reply 里手画假卡；卡片状态改走动态块的数据区（cardsDigest）。
   * createdAt 随行传出：intent 层按「隔 >5 分钟标时间」给模型时间感（与 UI 时间戳同规则）。
   */
  const historyForTurn = (): TurnHistoryItem[] => {
    const ms = currentSessionMessages();
    let end = ms.length;
    while (end > 0 && ms[end - 1].role === 'user') end--;
    return ms.slice(0, end)
      .filter((m) => m.role !== 'card' && m.role !== 'summary')
      .map((m): TurnHistoryItem => ({ role: m.role === 'user' ? 'user' : 'cat', text: m.text ?? '', createdAt: m.createdAt }))
      .filter((h) => h.text);
  };

  /** 本会话卡片实录（进动态块数据区）：AI 提议的与用户手建的一视同仁，模型据此读卡 */
  const cardsDigest = (): string[] =>
    currentSessionMessages()
      .filter((m) => m.role === 'card' && m.draft)
      .slice(-10)
      .map((m) => {
        const status = m.cardStatus === 'done' ? '已确认生效' : m.cardStatus === 'cancelled' ? '已取消' : '待用户确认';
        const head = buildPreviewLines(m.draft!).slice(0, 2).join('；');
        return `- ${ACTION_META[m.draft!.kind].label}【${status}】${head}${m.receipt ? `（回执：${m.receipt}）` : ''}`;
      });

  /** 收口 → thinking → replying → idle（gen 凭票，全程可被打断作废） */
  const settleNow = async () => {
    if (get().phase !== 'collecting') return;
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
    persistSwallowed();
    try {
      // 记忆检索（纯本地，失败返回空不阻断）+ 用户画像常驻 + warmth 语气行
      const recall = await recallMemories(batch);
      const profile = await getProfile();
      const extra = [
        profile ? `【用户画像（长期）】${profile}` : '',
        recall.lines.length ? `【关于用户的记忆】\n${recall.lines.join('\n')}` : '',
        buildWarmthLine(),
      ].filter(Boolean);
      const persona = get().activePreset().personaPrompt;
      const immersive = !!useAppStore.getState().settings.navigatorImmersive && !isD0();

      if (immersive) {
        // 拟真增强：流式切泡入队，独立 drain 以固定 0.5s 吐泡（吐泡与生成并行）
        const queue: string[] = [];
        let streamEnded = false;
        const turnPromise = runNavigatorTurn(
          historyForTurn(), batch, mySwallowed, turnAbort.signal, cardsDigest(), persona, extra,
          { onSegment: (s) => { queue.push(s); return gen === generation; } },
        ).finally(() => { streamEnded = true; });
        for (;;) {
          if (gen !== generation) { swallowed = queue.splice(0); persistSwallowed(); return; }
          if (queue.length > 0) {
            if (get().phase !== 'replying') set({ phase: 'replying' });
            get().pushCat(queue.shift()!);
            const alive = await sleepUnlessStale(1200, gen);
            if (!alive) { swallowed = queue.splice(0); persistSwallowed(); return; }
          } else if (streamEnded) {
            break;
          } else {
            const alive = await sleepUnlessStale(90, gen);
            if (!alive) { swallowed = queue.splice(0); persistSwallowed(); return; }
          }
        }
        const result = await turnPromise;
        if (gen !== generation) return;
        result.drafts.forEach((d) => get().pushCard(d));
        set({ phase: 'idle' });
        void runLiveCompact();
        return;
      }

      const result = await runNavigatorTurn(
        historyForTurn(), batch, mySwallowed, turnAbort.signal, cardsDigest(), persona, extra,
      );
      if (gen !== generation) return;
      // 分段吐泡（段间隙 = 天然插话点）
      set({ phase: 'replying' });
      for (let i = 0; i < result.segments.length; i++) {
        if (gen !== generation) { swallowed = result.segments.slice(i); persistSwallowed(); return; }
        get().pushCat(result.segments[i]);
        if (i < result.segments.length - 1) {
          const alive = await sleepUnlessStale(segmentDelayMs(result.segments[i + 1]), gen);
          if (!alive) { swallowed = result.segments.slice(i + 1); persistSwallowed(); return; }
        }
      }
      result.drafts.forEach((d) => get().pushCard(d));
      set({ phase: 'idle' });
      void runLiveCompact(); // 阈值泵（32k/120 条才动手，平时空转）
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

  /** 阈值泵：库内压缩后同步内存流（旧消息换成一条 summary 占位） */
  const runLiveCompact = async () => {
    const sid = get().sessionId;
    if (!sid) return;
    try {
      const rows = get().messages.map((m) => toRow(m, sid));
      const outcome = await maybeCompactLive(sid, rows);
      if (!outcome.summaryText) return;
      const removed = new Set(outcome.removedIds);
      set((s) => {
        const firstRemovedIdx = s.messages.findIndex((m) => removed.has(m.id));
        const insertAt = firstRemovedIdx < 0 ? 0
          : s.messages.slice(0, firstRemovedIdx).filter((m) => !removed.has(m.id)).length;
        const kept = s.messages.filter((m) => !removed.has(m.id));
        const summaryMsg: NavigatorMessage = {
          id: uuidv4(), role: 'summary', text: outcome.summaryText!, sessionId: sid,
          createdAt: s.messages[firstRemovedIdx]?.createdAt ?? Date.now(),
        };
        return { messages: [...kept.slice(0, insertAt), summaryMsg, ...kept.slice(insertAt)] };
      });
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[navigator] 阈值泵失败', e);
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
    sessionId: null,
    messages: [],
    presets: [],
    phase: 'idle',
    oldestLoadedDate: toLocalDateKey(),
    hasOlder: true,

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),

    loadOlder: async () => {
      const { oldestLoadedDate, hasOlder } = get();
      if (!hasOlder) return false;
      const preset = get().activePreset();
      const floorKey = toLocalDateKey(new Date(Date.now() - 7 * 86400_000));
      try {
        // 当前人格线里，比已加载最早日期更早、且在 7 天保存期内的最近一个会话
        const older = (await db.navigatorSessions.toArray())
          .filter((s) => s.presetId === preset.id && s.dateKey < oldestLoadedDate && s.dateKey >= floorKey)
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0];
        if (!older) { set({ hasOlder: false }); return false; }
        const rows = await db.navigatorMessages.where('sessionId').equals(older.id).sortBy('createdAt');
        set((s) => ({
          oldestLoadedDate: older.dateKey,
          messages: [...rows.map(fromRow), ...s.messages],
        }));
        return rows.length > 0;
      } catch {
        return false;
      }
    },

    activePreset: () => resolveNavigatorPreset(
      useAppStore.getState().settings.navigatorPresetId,
      get().presets,
    ),

    loadPresets: async () => {
      try {
        const presets = await db.navigatorPresets.orderBy('createdAt').toArray();
        set({ presets });
      } catch (e) {
        console.warn('[navigator] presets 加载失败', e);
      }
    },

    savePreset: async (p) => {
      await db.navigatorPresets.put(p);
      await get().loadPresets();
    },

    deletePreset: async (id) => {
      await db.navigatorPresets.delete(id);
      // 删的是当前激活人格 → 回落黑猫
      if (useAppStore.getState().settings.navigatorPresetId === id) {
        await get().switchPreset(BUILTIN_NAVIGATOR_PRESETS[0].id);
      }
      await get().loadPresets();
    },

    switchPreset: async (id) => {
      const app = useAppStore.getState();
      if (app.settings.navigatorPresetId === id) return;
      generation++;
      clearSettle();
      turnAbort?.abort();
      await app.updateSettings({ navigatorPresetId: id });
      // 换会话：清内存流 → 挂载该人格今日会话（当日切回旧人格 = 恢复旧流）
      swallowed = [];
      pendingWrites = [];
      set({ sessionId: null, messages: [], phase: 'idle' });
      await hydrateSession();
      if (get().messages.length === 0) {
        const preset = get().activePreset();
        get().pushCat(preset.handoffLine ?? `（${preset.name} 上线了）`);
      }
    },

    rolloverIfNewDay: () => {
      const today = toLocalDateKey();
      if (get().dateKey === today) return false;
      generation++;
      clearSettle();
      turnAbort?.abort();
      swallowed = [];
      pendingWrites = [];
      // 旧会话留库（compact 主泵在 Batch3 后段接管归档摘要）
      set({ dateKey: today, sessionId: null, messages: [], phase: 'idle' });
      void hydrateSession();
      return true;
    },

    setInputActive: (active) => { inputActive = active; },

    userSend: (text) => {
      const phase = get().phase;
      get().pushUser(text);
      if (phase === 'thinking') {
        generation++;
        turnAbort?.abort();
        turnAbort = null;
      } else if (phase === 'replying') {
        generation++;
      }
      set({ phase: 'collecting' });
      scheduleSettle(text);
    },

    greet: () => {
      void (async () => {
        get().rolloverIfNewDay();
        // 主泵（昨日会话末 compact）与遗忘清扫：开窗惰性触发
        const finalizing = finalizeStaleSessions();
        void lazySweepMemos();
        await hydrateSession();
        if (get().messages.length > 0) return;
        const snap = buildSnapshot();
        const app = useAppStore.getState();
        const preset = get().activePreset();
        const firstToday = app.settings.navigatorLastGreetDate !== snap.dateKey;
        if (firstToday) void app.updateSettings({ navigatorLastGreetDate: snap.dateKey });

        if (!firstToday || !getAIConfig(app.settings)) {
          get().pushCat(firstToday ? buildDailyGreeting(snap) : buildShortGreeting(snap));
          return;
        }
        // 有 Key 的跨天首开：打字指示等 AI，超时/失败静默落模板（等待本身就是拟人）
        const gen = ++generation;
        set({ phase: 'thinking' });
        try {
          // 跨日叙事素材：昨日摘要（等主泵最多 2.5s，拿不到就不带）+ 记忆 + 语气
          const yesterday = await Promise.race([finalizing, sleep(2500).then(() => null)]);
          const recall = await recallMemories('');
          const lastBefore = (await db.navigatorSessions.toArray())
            .filter((r) => r.dateKey < snap.dateKey)
            .sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0];
          const gapDays = lastBefore
            ? Math.max(0, Math.round((Date.parse(snap.dateKey) - Date.parse(lastBefore.dateKey)) / 86400_000))
            : null;
          const profile = await getProfile();
          const extra = [
            profile ? `【用户画像（长期）】${profile}` : '',
            yesterday ? `【昨日聊天摘要】${yesterday}` : '',
            gapDays !== null && gapDays >= 2 ? `【距上次聊天】已隔 ${gapDays} 天` : '',
            recall.lines.length ? `【关于用户的记忆】\n${recall.lines.join('\n')}` : '',
            buildWarmthLine(),
          ].filter(Boolean);
          // 超时计时只覆盖 AI 调用本身（此前从素材准备就开始计时，预算被前置步骤吃掉）
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), GREET_TIMEOUT_MS);
          const text = await generateAIGreeting(snap, ac.signal, preset.personaPrompt, extra);
          clearTimeout(timer);
          if (gen !== generation) return;
          if (!text && import.meta.env.DEV) console.warn('[navigator] AI 问候失败/超时，落模板');
          splitSegments(text ?? buildDailyGreeting(snap)).forEach((seg) => get().pushCat(seg));
          set({ phase: 'idle' });
        } catch (e) {
          if (gen !== generation) return;
          if (import.meta.env.DEV) console.warn('[navigator] 问候流程异常，落模板', e);
          get().pushCat(buildDailyGreeting(snap));
          set({ phase: 'idle' });
        }
      })();
    },

    pushCat: (text) => {
      const m = msg({ role: 'cat', text, sessionId: get().sessionId ?? undefined });
      set((s) => ({ messages: [...s.messages, m] }));
      persistMessage(m);
    },
    pushUser: (text) => {
      const m = msg({ role: 'user', text, sessionId: get().sessionId ?? undefined });
      set((s) => ({ messages: [...s.messages, m] }));
      persistMessage(m);
    },
    pushCard: (draft) => {
      const m = msg({ role: 'card', draft, cardStatus: 'pending', sessionId: get().sessionId ?? undefined });
      set((s) => ({ messages: [...s.messages, m] }));
      persistMessage(m);
      return m.id;
    },
    updateCard: (id, patch) => {
      set((s) => ({
        messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }));
      const updated = get().messages.find((m) => m.id === id);
      if (updated) persistMessage(updated);
    },
  };
});
