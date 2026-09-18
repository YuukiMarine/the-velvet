/**
 * tarotJobs — 塔罗解读的「后台任务」（v2.7.0.6）。
 *
 * 之前每日 / 中长期 / 追问的流式请求由组件自己持有：用户点出去（组件卸载）就 abort，
 * 回来只能重跑（用户上报：等不住点出去，回来发现进度被自己打断）。这里把请求提到
 * 模块级：任务在一个 zustand 小仓里跑，组件只是订阅它——切页、切 tab 都不打断；
 * 跑完自己落库（每日 → dailyDivinations，中长期 → longReadings，追问 → 追加到 reading），
 * 回来直接看到结果。
 *
 * 进程被杀（刷新 / 系统回收）救不回网络流；能救的是"参数"：中长期把问题 + 牌阵存进
 * localStorage，下次进来提示「用同一副牌继续」；每日靠原有的 pending 候选机制。
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import type {
  AttributeId, DailyDivination, DrawnCard, LongReading, LongReadingFollowUp, LongReadingPeriod, Settings, TarotOrientation,
} from '@/types';
import { TAROT_BY_ID, spreadPositionsFor, randomBonusMultiplier } from '@/constants/tarot';
import {
  buildDailyRequest, streamDaily, visibleDailyText, parseDailyResult,
  buildLongReadingRequest, buildFollowUpRequest, streamChatSSE, extractReadingMemo, formatApiError,
} from '@/utils/tarotAI';
import { createThinkTracker, type ThinkTracker } from '@/utils/thinkProgress';

export type JobStatus = 'thinking' | 'streaming' | 'done' | 'error';

interface JobBase {
  status: JobStatus;
  /** 已到达的正文（每日：截到 META 之前的可见部分） */
  text: string;
  /** 思维链已开始、正文还没开始 */
  thinking: boolean;
  tracker: ThinkTracker;
  error?: string;
  startedAt: number;
}

export interface DailyJob extends JobBase {
  date: string;
  cardId: string;
  orientation: TarotOrientation;
  drawnFrom: string[];
  pickedIndex: number;
}

export interface LongJob extends JobBase {
  /** 将来落库的 reading id（先定下来，追问 / 续跑都靠它对号） */
  id: string;
  question: string;
  period: LongReadingPeriod;
  /** 6 张候选（牌 id + 正逆） */
  candidates: DrawnCard[];
  /** 选中的 3 个下标，顺序 = 牌阵位置 */
  pickedIndices: number[];
  /** 长远档的「底色」牌（大阿卡纳，长按注入命运时抽出）；其余档没有 */
  base?: DrawnCard;
  /** 主解读请求的 user 消息原文（带简报的那版）：追问时复用 */
  promptUser?: string;
  result?: LongReading;
}

export interface FollowJob extends JobBase {
  readingId: string;
  question: string;
  candidates: DrawnCard[];
  pickedIndex: number;
  result?: LongReadingFollowUp;
}

interface JobsState {
  daily: DailyJob | null;
  long: LongJob | null;
  follow: FollowJob | null;
}

export const useTarotJobs = create<JobsState>(() => ({ daily: null, long: null, follow: null }));

/** 中止控制器不进 store（不可序列化、也没人需要订阅它） */
const controllers: { daily?: AbortController; long?: AbortController; follow?: AbortController } = {};

const isRunning = (j: JobBase | null | undefined): boolean =>
  !!j && (j.status === 'thinking' || j.status === 'streaming');

/** 流没收完的特征：结尾不是句末标点。finish_reason 为空（连接中途断开）时靠它兜底判断 */
const looksTruncated = (t: string): boolean => !/[。！？!?…」』"”)）]\s*$/.test(t.trim());
const INTERRUPTED = '连接中途断开，正文没有收完。牌还留着，重试即可。';

const patchDaily = (p: Partial<DailyJob>) =>
  useTarotJobs.setState(s => ({ daily: s.daily ? { ...s.daily, ...p } : s.daily }));
const patchLong = (p: Partial<LongJob>) =>
  useTarotJobs.setState(s => ({ long: s.long ? { ...s.long, ...p } : s.long }));
const patchFollow = (p: Partial<FollowJob>) =>
  useTarotJobs.setState(s => ({ follow: s.follow ? { ...s.follow, ...p } : s.follow }));

// ── 每日：候选暂存（仪式感保护；任务落库后由任务自己清） ──────────────
/**
 * 抽牌到完成解读之间会经过一次网络请求。把当日候选与已选下标落到 localStorage：
 *   - 只存牌 id + 正逆位 + 已选下标，几十字节，不进 Dexie 免得为它加一张表；
 *   - 按日期 key，跨日自然失效；
 *   - 解读成功写入 dailyDivination 后清空。
 */
export const DAILY_PENDING_KEY = 'velvet.dailyDraw.pending.v1';

export interface PendingDraw {
  date: string;
  cards: Array<{ id: string; orientation: TarotOrientation }>;
  pickedIndex: number | null;
}

export const readDailyPending = (): PendingDraw | null => {
  try {
    const raw = localStorage.getItem(DAILY_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingDraw;
    if (!p || p.date !== toLocalDateKey() || !Array.isArray(p.cards) || p.cards.length === 0) return null;
    return p;
  } catch {
    return null;
  }
};

export const writeDailyPending = (p: PendingDraw) => {
  try { localStorage.setItem(DAILY_PENDING_KEY, JSON.stringify(p)); } catch { /* 隐私模式 / 配额满：降级为不保留 */ }
};

export const clearDailyPending = () => {
  try { localStorage.removeItem(DAILY_PENDING_KEY); } catch { /* 同上 */ }
};

/**
 * 启动今日解读。同一天已有在跑的任务则什么都不做（防双击 / 防 StrictMode 双跑）；
 * 出错后再次调用 = 重试（换新控制器）。
 */
export function startDailyJob(args: {
  settings: Settings;
  cardId: string;
  orientation: TarotOrientation;
  drawnFrom: string[];
  pickedIndex: number;
}): void {
  const today = toLocalDateKey();
  const cur = useTarotJobs.getState().daily;
  if (cur && cur.date === today && isRunning(cur)) return;
  const card = TAROT_BY_ID[args.cardId];
  if (!card) return;
  controllers.daily?.abort();
  const ac = new AbortController();
  controllers.daily = ac;

  useTarotJobs.setState({
    daily: {
      date: today,
      cardId: args.cardId,
      orientation: args.orientation,
      drawnFrom: args.drawnFrom,
      pickedIndex: args.pickedIndex,
      status: 'thinking',
      text: '',
      thinking: false,
      tracker: createThinkTracker('pending'),
      error: undefined,
      startedAt: Date.now(),
    },
  });

  void (async () => {
    try {
      const built = await buildDailyRequest({ settings: args.settings, card, orientation: args.orientation });
      const tr = createThinkTracker(built.req.model);
      patchDaily({ tracker: tr });
      let full = '';
      let finish = '';
      // 正文边到边上屏；META 尾巴由 visibleDailyText 藏住，流完再解析
      for await (const delta of streamDaily(built.req, {
        signal: ac.signal,
        onReasoning: d => { tr.onReasoning(d); patchDaily({ thinking: true }); },
        onFinishReason: r => { finish = r; },
      })) {
        tr.onContent();
        full += delta;
        patchDaily({ status: 'streaming', thinking: false, text: visibleDailyText(full) });
      }
      const parsed = parseDailyResult(full, {
        attrNames: args.settings.attributeNames as Record<AttributeId, string>,
        card,
        orientation: args.orientation,
      });
      if (!parsed.metaFound) {
        if (finish === 'length') throw new Error('解读写到一半被截断了（模型输出预算不足）。这张牌还留着，重试即可。');
        if (finish !== 'stop' && looksTruncated(full)) throw new Error(INTERRUPTED);
      }
      const r = parsed.result;
      const drawn: DailyDivination = {
        id: uuidv4(),
        date: today,
        drawnFrom: args.drawnFrom,
        pickedIndex: args.pickedIndex,
        cardId: card.id,
        orientation: args.orientation,
        effect: { attribute: r.attribute, multiplier: randomBonusMultiplier(args.orientation) },
        narration: r.narration,
        advice: r.advice,
        fortune: r.fortune,
        memo: r.memo,
        focusKey: built.focusKey,
        nudgeKey: built.nudgeKey,
        source: 'ai',
        createdAt: new Date(),
      };
      await useAppStore.getState().saveDailyDivination(drawn);
      clearDailyPending();
      patchDaily({ status: 'done', thinking: false });
    } catch (e) {
      if (ac.signal.aborted) return;
      patchDaily({ status: 'error', thinking: false, error: formatApiError(e) });
    }
  })();
}

// ── 中长期：参数落盘，进程被杀后可"用同一副牌继续" ─────────────────────

export const LONG_PENDING_KEY = 'velvet.longReading.pending.v1';

export interface LongPending {
  id: string;
  question: string;
  period: LongReadingPeriod;
  candidates: DrawnCard[];
  pickedIndices: number[];
  base?: DrawnCard;
  startedAt: number;
}

export const readLongPending = (): LongPending | null => {
  try {
    const raw = localStorage.getItem(LONG_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LongPending;
    if (!p || typeof p.question !== 'string' || !Array.isArray(p.candidates) || !Array.isArray(p.pickedIndices)) return null;
    if (p.pickedIndices.length !== 3 || p.candidates.length < 3) return null;
    // 三天前的半截占卜不再提示：那时的近况简报早已过期
    if (Date.now() - (p.startedAt || 0) > 3 * 86400_000) return null;
    return p;
  } catch {
    return null;
  }
};

export const clearLongPending = () => {
  try { localStorage.removeItem(LONG_PENDING_KEY); } catch { /* 同上 */ }
};

export function startLongJob(args: {
  settings: Settings;
  question: string;
  period: LongReadingPeriod;
  candidates: DrawnCard[];
  pickedIndices: number[];
  base?: DrawnCard;
  /** 续跑时沿用原 id */
  id?: string;
}): void {
  controllers.long?.abort();
  const ac = new AbortController();
  controllers.long = ac;
  const id = args.id ?? uuidv4();
  const pending: LongPending = {
    id, question: args.question, period: args.period,
    candidates: args.candidates, pickedIndices: args.pickedIndices, base: args.base, startedAt: Date.now(),
  };
  try { localStorage.setItem(LONG_PENDING_KEY, JSON.stringify(pending)); } catch { /* 降级：不可续跑 */ }

  useTarotJobs.setState({
    long: {
      ...pending,
      status: 'thinking',
      text: '',
      thinking: false,
      tracker: createThinkTracker('pending'),
      error: undefined,
      result: undefined,
    },
  });

  void (async () => {
    try {
      // 底色牌（若有）排在牌阵第一位，与三张一起落库；提示词按 picked 长度识别它
      const three: DrawnCard[] = args.pickedIndices.map(i => args.candidates[i]);
      const picked: DrawnCard[] = args.base ? [args.base, ...three] : three;
      const req = await buildLongReadingRequest({ settings: args.settings, question: args.question, period: args.period, picked });
      const tr = createThinkTracker(req.model);
      patchLong({ tracker: tr, promptUser: req.messages[req.messages.length - 1].content });
      let full = '';
      let finish = '';
      for await (const chunk of streamChatSSE(req, ac.signal, {
        onReasoning: d => { tr.onReasoning(d); patchLong({ thinking: true }); },
        onFinishReason: r => { finish = r; },
      })) {
        tr.onContent();
        full += chunk;
        patchLong({ status: 'streaming', thinking: false, text: full });
      }
      if (!full.trim()) throw new Error('解读内容为空，请重试');
      if (finish === 'length') throw new Error('解读被截断了（模型输出预算不足），用同一副牌再试一次即可。');
      if (finish !== 'stop' && looksTruncated(full)) throw new Error(INTERRUPTED);

      const createdAt = new Date();
      const expires = new Date(createdAt);
      expires.setDate(expires.getDate() + 14);
      const reading: LongReading = {
        id,
        question: args.question,
        period: args.period,
        drawnFrom: args.candidates.map(c => c.cardId),
        picked,
        content: full,
        followUps: [],
        archived: false,
        createdAt,
        expiresAt: toLocalDateKey(expires),
      };
      await useAppStore.getState().saveLongReading(reading);
      clearLongPending();
      patchLong({ status: 'done', thinking: false, result: reading });

      // 解读者手记：另用一次快速档小调用抽一条备忘（失败就没有手记）
      const memo = await extractReadingMemo(args.settings, reading.question, full);
      if (memo) {
        await useAppStore.getState().updateLongReadingMemo(id, memo);
        patchLong({ result: { ...reading, memo } });
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      patchLong({ status: 'error', thinking: false, error: formatApiError(e) });
    }
  })();
}

/** 用户离开完成态 / 放弃：清掉已结束的任务（在跑的保留，回来还能接上） */
export function ackLongJob(): void {
  if (!isRunning(useTarotJobs.getState().long)) useTarotJobs.setState({ long: null });
}

// ── 追问 ────────────────────────────────────────────────────

export function startFollowJob(args: {
  settings: Settings;
  reading: LongReading;
  question: string;
  candidates: DrawnCard[];
  pickedIndex: number;
  /** 主解读那次请求的 user 消息（若还在内存里）；没有就按 reading 重建 */
  promptUser?: string;
}): void {
  const pick = args.candidates[args.pickedIndex];
  const card = pick ? TAROT_BY_ID[pick.cardId] : undefined;
  if (!pick || !card) return;
  controllers.follow?.abort();
  const ac = new AbortController();
  controllers.follow = ac;

  useTarotJobs.setState({
    follow: {
      readingId: args.reading.id,
      question: args.question,
      candidates: args.candidates,
      pickedIndex: args.pickedIndex,
      status: 'thinking',
      text: '',
      thinking: false,
      tracker: createThinkTracker('pending'),
      error: undefined,
      result: undefined,
      startedAt: Date.now(),
    },
  });

  void (async () => {
    try {
      const positions = spreadPositionsFor(args.reading.period, args.reading.picked.length);
      const prevUser = args.promptUser ?? `**客人提出的问题**：${args.reading.question}\n**牌阵**：${args.reading.picked
        .map((p, i) => {
          const c = TAROT_BY_ID[p.cardId];
          return `${positions[i] ?? ''}：${c?.name ?? p.cardId}（${p.orientation === 'upright' ? '正位' : '逆位'}）`;
        })
        .join('；')}`;
      const req = buildFollowUpRequest({
        settings: args.settings,
        previousUserMessage: prevUser,
        previousAssistantMessage: args.reading.content,
        followUpQuestion: args.question,
        followUpCard: card,
        followUpOrientation: pick.orientation,
      });
      const tr = createThinkTracker(req.model);
      patchFollow({ tracker: tr });
      let full = '';
      let finish = '';
      for await (const chunk of streamChatSSE(req, ac.signal, {
        onReasoning: d => { tr.onReasoning(d); patchFollow({ thinking: true }); },
        onFinishReason: r => { finish = r; },
      })) {
        tr.onContent();
        full += chunk;
        patchFollow({ status: 'streaming', thinking: false, text: full });
      }
      if (!full.trim()) throw new Error('回应内容为空');
      if (finish === 'length') throw new Error('回应被截断了（模型输出预算不足），请重试。');
      if (finish !== 'stop' && looksTruncated(full)) throw new Error(INTERRUPTED);
      const follow: LongReadingFollowUp = {
        id: uuidv4(),
        question: args.question,
        drawnFrom: args.candidates.map(c => c.cardId),
        cardId: card.id,
        orientation: pick.orientation,
        content: full,
        createdAt: new Date(),
      };
      await useAppStore.getState().appendLongReadingFollowUp(args.reading.id, follow);
      patchFollow({ status: 'done', thinking: false, result: follow });
    } catch (e) {
      if (ac.signal.aborted) return;
      patchFollow({ status: 'error', thinking: false, error: formatApiError(e) });
    }
  })();
}

export function ackFollowJob(): void {
  if (!isRunning(useTarotJobs.getState().follow)) useTarotJobs.setState({ follow: null });
}
