/**
 * tarotJobs — 塔罗解读的「后台任务」（v2.7.0.6）。
 *
 * 之前每日 / 中长期 / 追问的流式请求由组件自己持有：用户点出去（组件卸载）就 abort，
 * 回来只能重跑（用户上报：等不住点出去，回来发现进度被自己打断）。这里把请求提到
 * 模块级：任务在一个 zustand 小仓里跑，组件只是订阅它——切页、切 tab 都不打断；
 * 跑完自己落库（每日 → dailyDivinations，中长期 → longReadings，追问 → 追加到 reading，
 * 命运 → fateGlimpses），回来直接看到结果。
 *
 * 进程被杀（刷新 / 系统回收）救不回网络流；能救的是"参数"：中长期把问题 + 牌阵存进
 * localStorage，下次进来提示「用同一副牌继续」；每日靠原有的 pending 候选机制。
 *
 * 第 4 轮：截断（finish_reason=length / 连接中途断开）不再作废——半截正文留在任务里，
 * 可「接着写」最多三次（把半截当 assistant 回传，让模型从断处续，与成长总结同一套）；
 * 「窥探命运」也改成这里的后台任务：弹层关掉不中止，写完就落库，回来直接看。
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import type {
  AttributeId, DailyDivination, DrawnCard, FateGlimpse, FateGlimpseDay, LongReading, LongReadingFollowUp, LongReadingPeriod, Settings, TarotOrientation,
} from '@/types';
import { TAROT_BY_ID, spreadPositionsFor, randomBonusMultiplier } from '@/constants/tarot';
import { chatStream, type AIMessage } from '@/utils/aiClient';
import {
  buildDailyRequest, visibleDailyText, parseDailyResult, DAILY_META_MARK,
  buildLongReadingRequest, buildFollowUpRequest, extractReadingMemo, formatApiError, type AIRequestData,
} from '@/utils/tarotAI';
import {
  buildFateGlimpseRequest, parseFateGlimpseText, buildOfflineFateGlimpse, type FateGlimpseAIResult,
} from '@/utils/fateGlimpseAI';
import { trimSeam } from '@/utils/summaryAI';
import { createThinkTracker, type ThinkTracker } from '@/utils/thinkProgress';

export type JobStatus = 'thinking' | 'streaming' | 'done' | 'error';
/** 「接着写」最多几次（与成长总结同口径） */
export const TAROT_CONTINUE_LIMIT = 3;

interface JobBase {
  status: JobStatus;
  /** 已到达的正文（每日：截到 META 之前的可见部分） */
  text: string;
  /** 原始累计正文（每日含 META 尾巴；续写时当 assistant 回传） */
  full: string;
  /** 思维链已开始、正文还没开始 */
  thinking: boolean;
  tracker: ThinkTracker;
  error?: string;
  /** 正文没收完（截断 / 连接断开）：可「接着写」 */
  truncated: boolean;
  continues: number;
  /** 组好的请求（续写复用同一份上下文） */
  req?: AIRequestData;
  startedAt: number;
}

export interface DailyJob extends JobBase {
  date: string;
  cardId: string;
  orientation: TarotOrientation;
  drawnFrom: string[];
  pickedIndex: number;
  /** 简报选的案头 / 写法（落库时写进 dailyDivination） */
  focusKey?: string;
  nudgeKey?: string;
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

export interface FateJob extends JobBase {
  /** 起跑那天：同一天内不重复开第二次（关掉弹层再打开只是接回来） */
  date: string;
  days: FateGlimpseDay[];
  /** 流式半成品（三段各自到达即上屏） */
  live: FateGlimpseAIResult | null;
  result?: FateGlimpseAIResult;
  source: 'ai' | 'offline';
  /** 已落库的 glimpse id */
  savedId?: string;
}

interface JobsState {
  daily: DailyJob | null;
  long: LongJob | null;
  follow: FollowJob | null;
  fate: FateJob | null;
}

export const useTarotJobs = create<JobsState>(() => ({ daily: null, long: null, follow: null, fate: null }));

/** 中止控制器不进 store（不可序列化、也没人需要订阅它） */
const controllers: { daily?: AbortController; long?: AbortController; follow?: AbortController; fate?: AbortController } = {};

const isRunning = (j: JobBase | null | undefined): boolean =>
  !!j && (j.status === 'thinking' || j.status === 'streaming');

/** 流没收完的特征：结尾不是句末标点。finish_reason 为空（连接中途断开）时靠它兜底判断 */
const looksTruncated = (t: string): boolean => !/[。！？!?…」』"”)）]\s*$/.test(t.trim());
const INTERRUPTED = '连接中途断开，正文没有收完。';
const LENGTH_CUT = '写到一半被截断了（模型输出预算不足）。';
const CONTINUE_HINT = '已写的部分留着，可以让它接着写。';

const patchDaily = (p: Partial<DailyJob>) =>
  useTarotJobs.setState(s => ({ daily: s.daily ? { ...s.daily, ...p } : s.daily }));
const patchLong = (p: Partial<LongJob>) =>
  useTarotJobs.setState(s => ({ long: s.long ? { ...s.long, ...p } : s.long }));
const patchFollow = (p: Partial<FollowJob>) =>
  useTarotJobs.setState(s => ({ follow: s.follow ? { ...s.follow, ...p } : s.follow }));
const patchFate = (p: Partial<FateJob>) =>
  useTarotJobs.setState(s => ({ fate: s.fate ? { ...s.fate, ...p } : s.fate }));

/** 接着写：把半截正文当 assistant 回传，从断处续 */
function continueMessages(req: AIRequestData, seed: string, kind: 'daily' | 'markdown' | 'fate'): AIMessage[] {
  const tail = kind === 'daily'
    ? `写完后同样另起一行输出 ${DAILY_META_MARK}，再一行 JSON。`
    : kind === 'fate'
      ? '保持「## 总结 / ## 展望 / ## 建议」的段落格式，缺哪段就接着写哪段。'
      : '保持同一语气与 Markdown 格式；如果断在列表或段落中间，先把它接着写完整再继续。';
  return [
    ...req.messages,
    { role: 'assistant', content: seed },
    { role: 'user', content: `刚才的解读写到一半断了。请从断处直接接着写完：不要重复已写的内容，不要重新开头，不要解释。${tail}` },
  ];
}

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

/** 每日：流一段（首跑或续写）→ 收尾（解析 META、落库 / 标截断） */
async function runDaily(settings: Settings, ac: AbortController, req: AIRequestData, messages: AIMessage[], seed: string): Promise<void> {
  const job = useTarotJobs.getState().daily;
  if (!job) return;
  const card = TAROT_BY_ID[job.cardId];
  if (!card) return;
  const tr = createThinkTracker(req.model);
  patchDaily({ tracker: tr, status: 'thinking', thinking: false, error: undefined, truncated: false });
  let full = seed;
  let finish = '';
  try {
    // 正文边到边上屏；META 尾巴由 visibleDailyText 藏住，流完再解析
    for await (const delta of chatStream(req, messages, {
      temperature: 0.7, maxTokens: 2000,
      signal: ac.signal,
      onReasoning: d => { tr.onReasoning(d); patchDaily({ thinking: true }); },
      onFinishReason: r => { finish = r; },
    })) {
      tr.onContent();
      full += delta;
      patchDaily({ status: 'streaming', thinking: false, full, text: visibleDailyText(full) });
    }
  } catch (e) {
    if (ac.signal.aborted) return;
    // 已经有半截正文：留着，标成可续写；一个字都没有才算失败
    if (full.trim() && full !== seed) {
      patchDaily({ status: 'error', thinking: false, full, text: visibleDailyText(full), truncated: true, error: `${INTERRUPTED}${CONTINUE_HINT}` });
      return;
    }
    patchDaily({ status: 'error', thinking: false, error: formatApiError(e) });
    return;
  }
  const parsed = parseDailyResult(full, {
    attrNames: settings.attributeNames as Record<AttributeId, string>,
    card,
    orientation: job.orientation,
  });
  if (!parsed.metaFound) {
    const cut = finish === 'length' ? LENGTH_CUT : (finish !== 'stop' && looksTruncated(full)) ? INTERRUPTED : '';
    if (cut) {
      patchDaily({ status: 'error', thinking: false, full, text: visibleDailyText(full), truncated: true, error: `${cut}${CONTINUE_HINT}` });
      return;
    }
  }
  const r = parsed.result;
  const drawn: DailyDivination = {
    id: uuidv4(),
    date: job.date,
    drawnFrom: job.drawnFrom,
    pickedIndex: job.pickedIndex,
    cardId: card.id,
    orientation: job.orientation,
    effect: { attribute: r.attribute, multiplier: randomBonusMultiplier(job.orientation) },
    narration: r.narration,
    advice: r.advice,
    fortune: r.fortune,
    memo: r.memo,
    focusKey: job.focusKey,
    nudgeKey: job.nudgeKey,
    source: 'ai',
    createdAt: new Date(),
  };
  try {
    await useAppStore.getState().saveDailyDivination(drawn);
    clearDailyPending();
    patchDaily({ status: 'done', thinking: false, full, text: visibleDailyText(full), truncated: false });
  } catch (e) {
    if (ac.signal.aborted) return;
    patchDaily({ status: 'error', thinking: false, error: formatApiError(e) });
  }
}

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
      full: '',
      thinking: false,
      tracker: createThinkTracker('pending'),
      error: undefined,
      truncated: false,
      continues: 0,
      startedAt: Date.now(),
    },
  });

  void (async () => {
    try {
      const built = await buildDailyRequest({ settings: args.settings, card, orientation: args.orientation });
      if (ac.signal.aborted) return;
      // focusKey / nudgeKey 随任务走（落库时写进 dailyDivination）
      patchDaily({ req: built.req, focusKey: built.focusKey, nudgeKey: built.nudgeKey });
      await runDaily(args.settings, ac, built.req, built.req.messages, '');
    } catch (e) {
      if (ac.signal.aborted) return;
      patchDaily({ status: 'error', thinking: false, error: formatApiError(e) });
    }
  })();
}

/** 每日：接着写（截断态才有效；最多 TAROT_CONTINUE_LIMIT 次） */
export function continueDailyJob(settings: Settings): void {
  const job = useTarotJobs.getState().daily;
  if (!job || job.status !== 'error' || !job.truncated || !job.req || job.continues >= TAROT_CONTINUE_LIMIT) return;
  controllers.daily?.abort();
  const ac = new AbortController();
  controllers.daily = ac;
  const seed = trimSeam(job.full);
  patchDaily({ continues: job.continues + 1, truncated: false, full: seed, text: visibleDailyText(seed) });
  void runDaily(settings, ac, job.req, continueMessages(job.req, seed, 'daily'), seed);
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

/** Markdown 类流（中长期 / 追问）共用的一段：流 → 判截断 → 交给 onDone 落库 */
async function runMarkdown(
  ac: AbortController,
  req: AIRequestData,
  messages: AIMessage[],
  seed: string,
  patch: (p: Partial<JobBase>) => void,
  onDone: (full: string) => Promise<void>,
  emptyMsg: string,
): Promise<void> {
  const tr = createThinkTracker(req.model);
  patch({ tracker: tr, status: 'thinking', thinking: false, error: undefined, truncated: false });
  let full = seed;
  let finish = '';
  try {
    for await (const chunk of chatStream(req, messages, {
      temperature: 0.85, maxTokens: 3000,
      signal: ac.signal,
      onReasoning: d => { tr.onReasoning(d); patch({ thinking: true }); },
      onFinishReason: r => { finish = r; },
    })) {
      tr.onContent();
      full += chunk;
      patch({ status: 'streaming', thinking: false, full, text: full });
    }
  } catch (e) {
    if (ac.signal.aborted) return;
    if (full.trim() && full !== seed) {
      patch({ status: 'error', thinking: false, full, text: full, truncated: true, error: `${INTERRUPTED}${CONTINUE_HINT}` });
      return;
    }
    patch({ status: 'error', thinking: false, error: formatApiError(e) });
    return;
  }
  if (!full.trim()) { patch({ status: 'error', thinking: false, error: emptyMsg }); return; }
  const cut = finish === 'length' ? LENGTH_CUT : (finish !== 'stop' && looksTruncated(full)) ? INTERRUPTED : '';
  if (cut) {
    patch({ status: 'error', thinking: false, full, text: full, truncated: true, error: `${cut}${CONTINUE_HINT}` });
    return;
  }
  try {
    await onDone(full);
  } catch (e) {
    if (ac.signal.aborted) return;
    patch({ status: 'error', thinking: false, error: formatApiError(e) });
  }
}

async function finishLong(settings: Settings, id: string, full: string): Promise<void> {
  const job = useTarotJobs.getState().long;
  if (!job || job.id !== id) return;
  const three: DrawnCard[] = job.pickedIndices.map(i => job.candidates[i]);
  const picked: DrawnCard[] = job.base ? [job.base, ...three] : three;
  const createdAt = new Date();
  const expires = new Date(createdAt);
  expires.setDate(expires.getDate() + 14);
  const reading: LongReading = {
    id,
    question: job.question,
    period: job.period,
    drawnFrom: job.candidates.map(c => c.cardId),
    picked,
    content: full,
    followUps: [],
    archived: false,
    createdAt,
    expiresAt: toLocalDateKey(expires),
  };
  await useAppStore.getState().saveLongReading(reading);
  clearLongPending();
  patchLong({ status: 'done', thinking: false, full, text: full, truncated: false, result: reading });

  // 解读者手记：另用一次快速档小调用抽一条备忘（失败就没有手记）
  const memo = await extractReadingMemo(settings, reading.question, full);
  if (memo) {
    await useAppStore.getState().updateLongReadingMemo(id, memo);
    patchLong({ result: { ...reading, memo } });
  }
}

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
      full: '',
      thinking: false,
      tracker: createThinkTracker('pending'),
      error: undefined,
      truncated: false,
      continues: 0,
      result: undefined,
    },
  });

  void (async () => {
    try {
      // 底色牌（若有）排在牌阵第一位，与三张一起落库；提示词按 picked 长度识别它
      const three: DrawnCard[] = args.pickedIndices.map(i => args.candidates[i]);
      const picked: DrawnCard[] = args.base ? [args.base, ...three] : three;
      const req = await buildLongReadingRequest({ settings: args.settings, question: args.question, period: args.period, picked });
      if (ac.signal.aborted) return;
      patchLong({ req, promptUser: req.messages[req.messages.length - 1].content });
      await runMarkdown(ac, req, req.messages, '', patchLong, full => finishLong(args.settings, id, full), '解读内容为空，请重试');
    } catch (e) {
      if (ac.signal.aborted) return;
      patchLong({ status: 'error', thinking: false, error: formatApiError(e) });
    }
  })();
}

/** 中长期：接着写 */
export function continueLongJob(settings: Settings): void {
  const job = useTarotJobs.getState().long;
  if (!job || job.status !== 'error' || !job.truncated || !job.req || job.continues >= TAROT_CONTINUE_LIMIT) return;
  controllers.long?.abort();
  const ac = new AbortController();
  controllers.long = ac;
  const seed = trimSeam(job.full);
  patchLong({ continues: job.continues + 1, truncated: false, full: seed, text: seed });
  const id = job.id;
  void runMarkdown(ac, job.req, continueMessages(job.req, seed, 'markdown'), seed, patchLong, full => finishLong(settings, id, full), '解读内容为空，请重试');
}

/** 用户离开完成态 / 放弃：清掉已结束的任务（在跑的保留，回来还能接上） */
export function ackLongJob(): void {
  if (!isRunning(useTarotJobs.getState().long)) useTarotJobs.setState({ long: null });
}

// ── 追问 ────────────────────────────────────────────────────

async function finishFollow(full: string): Promise<void> {
  const job = useTarotJobs.getState().follow;
  if (!job) return;
  const pick = job.candidates[job.pickedIndex];
  const card = pick ? TAROT_BY_ID[pick.cardId] : undefined;
  if (!pick || !card) return;
  const follow: LongReadingFollowUp = {
    id: uuidv4(),
    question: job.question,
    drawnFrom: job.candidates.map(c => c.cardId),
    cardId: card.id,
    orientation: pick.orientation,
    content: full,
    createdAt: new Date(),
  };
  await useAppStore.getState().appendLongReadingFollowUp(job.readingId, follow);
  patchFollow({ status: 'done', thinking: false, full, text: full, truncated: false, result: follow });
}

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
      full: '',
      thinking: false,
      tracker: createThinkTracker('pending'),
      error: undefined,
      truncated: false,
      continues: 0,
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
      patchFollow({ req });
      await runMarkdown(ac, req, req.messages, '', patchFollow, finishFollow, '回应内容为空');
    } catch (e) {
      if (ac.signal.aborted) return;
      patchFollow({ status: 'error', thinking: false, error: formatApiError(e) });
    }
  })();
}

/** 追问：接着写 */
export function continueFollowJob(): void {
  const job = useTarotJobs.getState().follow;
  if (!job || job.status !== 'error' || !job.truncated || !job.req || job.continues >= TAROT_CONTINUE_LIMIT) return;
  controllers.follow?.abort();
  const ac = new AbortController();
  controllers.follow = ac;
  const seed = trimSeam(job.full);
  patchFollow({ continues: job.continues + 1, truncated: false, full: seed, text: seed });
  void runMarkdown(ac, job.req, continueMessages(job.req, seed, 'markdown'), seed, patchFollow, finishFollow, '回应内容为空');
}

export function ackFollowJob(): void {
  if (!isRunning(useTarotJobs.getState().follow)) useTarotJobs.setState({ follow: null });
}

// ── 窥探命运（第 4 轮改后台任务：弹层关掉不中止，写完就落库） ──────────────

/** 命运总占卜落库 + 三日祝福 */
async function saveFateGlimpse(days: FateGlimpseDay[], r: FateGlimpseAIResult, source: 'ai' | 'offline'): Promise<string> {
  const today = toLocalDateKey();
  const g: FateGlimpse = {
    id: uuidv4(),
    days,
    verdict: r.verdict,
    summary: r.summary,
    outlook: r.outlook,
    advice: r.advice,
    source,
    buffStart: today,
    buffEnd: toLocalDateKey(new Date(Date.now() + 2 * 86400_000)),
    createdAt: new Date(),
  };
  await useAppStore.getState().createFateGlimpse(g);
  return g.id;
}

const fateComplete = (r: FateGlimpseAIResult): boolean => !!(r.summary || r.outlook || r.advice);

async function runFate(ac: AbortController, req: AIRequestData, messages: AIMessage[], seed: string): Promise<void> {
  const job = useTarotJobs.getState().fate;
  if (!job) return;
  const tr = createThinkTracker(req.model);
  patchFate({ tracker: tr, status: 'thinking', thinking: false, error: undefined, truncated: false, live: seed ? parseFateGlimpseText(seed) : null });
  let full = seed;
  let finish = '';
  try {
    for await (const delta of chatStream(req, messages, {
      temperature: 0.85, maxTokens: 3000,
      signal: ac.signal,
      onReasoning: d => { tr.onReasoning(d); patchFate({ thinking: true }); },
      onFinishReason: f => { finish = f; },
    })) {
      tr.onContent();
      full += delta;
      patchFate({ status: 'streaming', thinking: false, full, text: full, live: parseFateGlimpseText(full) });
    }
  } catch (e) {
    if (ac.signal.aborted) return;
    if (full.trim() && full !== seed) {
      patchFate({ status: 'error', thinking: false, full, text: full, truncated: true, error: `${INTERRUPTED}${CONTINUE_HINT}` });
      return;
    }
    patchFate({ status: 'error', thinking: false, error: formatApiError(e) });
    return;
  }
  const r = parseFateGlimpseText(full);
  if (!fateComplete(r)) { patchFate({ status: 'error', thinking: false, error: '解读内容为空，请重试' }); return; }
  const cut = finish === 'length' ? LENGTH_CUT : (finish !== 'stop' && looksTruncated(full)) ? INTERRUPTED : '';
  if (cut) {
    patchFate({ status: 'error', thinking: false, full, text: full, truncated: true, error: `${cut}${CONTINUE_HINT}` });
    return;
  }
  if (!r.verdict) r.verdict = '明暗交织 路在脚下';
  try {
    const cur = useTarotJobs.getState().fate;
    if (!cur || cur.savedId) return;
    const savedId = await saveFateGlimpse(cur.days, r, 'ai');
    patchFate({ status: 'done', thinking: false, full, text: full, live: r, result: r, source: 'ai', savedId, truncated: false });
  } catch (e) {
    if (ac.signal.aborted) return;
    patchFate({ status: 'error', thinking: false, error: formatApiError(e) });
  }
}

/**
 * 启动总占卜。今天已有在跑 / 已落库的任务就接回来（关掉弹层再打开、StrictMode 双跑都不重开）；
 * force = 从错误态重试。没配 Key 直接用离线兜底并落库。
 */
export function startFateJob(args: { settings: Settings; days: FateGlimpseDay[]; force?: boolean }): void {
  const today = toLocalDateKey();
  const cur = useTarotJobs.getState().fate;
  if (cur && cur.date === today && (isRunning(cur) || (cur.status === 'done' && cur.savedId))) return;
  if (cur && cur.date === today && cur.status === 'error' && !args.force) return;
  controllers.fate?.abort();
  const ac = new AbortController();
  controllers.fate = ac;
  const s = useAppStore.getState();

  useTarotJobs.setState({
    fate: {
      date: today,
      days: args.days,
      status: 'thinking',
      text: '',
      full: '',
      thinking: false,
      tracker: createThinkTracker('pending'),
      error: undefined,
      truncated: false,
      continues: 0,
      live: null,
      result: undefined,
      source: 'ai',
      startedAt: Date.now(),
    },
  });

  if (!args.settings.summaryApiKey?.trim()) {
    void resolveFateOffline();
    return;
  }

  void (async () => {
    try {
      const since = Date.now() - 7 * 86400_000;
      const req = buildFateGlimpseRequest({
        settings: args.settings,
        attributes: s.attributes,
        days: args.days,
        recentActivities: s.activities.filter(a => !a.category && new Date(a.date).getTime() >= since),
        wishes: s.wishes
          .filter(w => w.status === 'active' && !w.parentId)
          .map(w => ({ title: w.title, currentState: w.currentState })),
        userName: s.user?.name ?? '客人',
      });
      patchFate({ req });
      await runFate(ac, req, req.messages, '');
    } catch (e) {
      if (ac.signal.aborted) return;
      patchFate({ status: 'error', thinking: false, error: formatApiError(e) });
    }
  })();
}

/** 命运：接着写 */
export function continueFateJob(): void {
  const job = useTarotJobs.getState().fate;
  if (!job || job.status !== 'error' || !job.truncated || !job.req || job.continues >= TAROT_CONTINUE_LIMIT) return;
  controllers.fate?.abort();
  const ac = new AbortController();
  controllers.fate = ac;
  const seed = trimSeam(job.full);
  patchFate({ continues: job.continues + 1, truncated: false, full: seed, text: seed });
  void runFate(ac, job.req, continueMessages(job.req, seed, 'fate'), seed);
}

/** 错误态 / 无 Key：用离线兜底完成并落库 */
export async function resolveFateOffline(): Promise<void> {
  const job = useTarotJobs.getState().fate;
  // 正文已经在流、或已经落库：不用兜底；thinking（无 Key 路径）/ error 才走这里
  if (!job || job.savedId || job.status === 'streaming' || job.status === 'done') return;
  controllers.fate?.abort();
  const r = buildOfflineFateGlimpse(job.days, useAppStore.getState().settings.attributeNames);
  try {
    const savedId = await saveFateGlimpse(job.days, r, 'offline');
    patchFate({ status: 'done', thinking: false, live: r, result: r, source: 'offline', savedId, error: undefined, truncated: false });
  } catch (e) {
    patchFate({ status: 'error', thinking: false, error: formatApiError(e) });
  }
}

/** 关掉仪式弹层：已结束的任务清掉（在跑的保留，回来接着看） */
export function ackFateJob(): void {
  if (!isRunning(useTarotJobs.getState().fate)) useTarotJobs.setState({ fate: null });
}
