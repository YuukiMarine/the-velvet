import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import {
  ALL_TAROT,
  TAROT_BY_ID,
  drawRandomCards,
  randomOrientation,
  SPREAD_POSITIONS,
  PERIOD_LABELS,
  TarotCardData,
} from '@/constants/tarot';
import { LongReading, LongReadingPeriod, TarotOrientation, DrawnCard, LongReadingFollowUp } from '@/types';
import { CardBack } from './CardBack';
import { TarotCardSVG } from './TarotCardSVG';
import { buildLongReadingRequest, buildFollowUpRequest, streamChatSSE, formatApiError } from '@/utils/tarotAI';
import { renderMarkdown } from '@/utils/markdown';

type Phase =
  | 'form'        // 问题 + 周期
  | 'picking'     // 6 张候选 → 选 3
  | 'revealing'   // 3 张选中牌翻面中（过渡到流式）
  | 'reading'     // AI 流式
  | 'done';       // 已有 reading 展示

interface Props {
  /** 打开时已有一个活跃 reading 则直接回到详情 */
  initialReading?: LongReading | null;
  onBack: () => void;
}

interface Candidate {
  card: TarotCardData;
  orientation: TarotOrientation;
}

export function LongReadingFlow({ initialReading, onBack }: Props) {
  const {
    settings, attributes,
    getRecentActivitiesByAttribute,
    saveLongReading,
    appendLongReadingFollowUp,
    countActiveReadings,
  } = useAppStore();
  const noApiKey = !settings.summaryApiKey;

  const [phase, setPhase] = useState<Phase>(initialReading ? 'done' : 'form');
  const [reading, setReading] = useState<LongReading | null>(initialReading ?? null);

  // 表单
  const [question, setQuestion] = useState('');
  const [period, setPeriod] = useState<LongReadingPeriod>('midterm');

  // 抽卡
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);

  // 流式
  const [streamedText, setStreamedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prevMessagesRef = useRef<{ user: string; assistant: string } | null>(null);

  // 追问
  const [followOpen, setFollowOpen] = useState(false);
  const [followPhase, setFollowPhase] = useState<'form' | 'picking' | 'reading' | 'done'>('form');
  const [followQuestion, setFollowQuestion] = useState('');
  const [followCandidates, setFollowCandidates] = useState<Candidate[]>([]);
  const [followPickedIndex, setFollowPickedIndex] = useState<number | null>(null);
  const [followStreamedText, setFollowStreamedText] = useState('');
  const [followStreaming, setFollowStreaming] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const followAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      followAbortRef.current?.abort();
    };
  }, []);

  const activeCount = countActiveReadings();
  const hitConcurrencyCap = !initialReading && activeCount >= 2;

  const canFollowUp = useMemo(() => {
    if (!reading) return false;
    if (reading.archived) return false;
    if (reading.expiresAt < toLocalDateKey()) return false;
    return (reading.followUps?.length ?? 0) < 1;
  }, [reading]);

  // ── 表单 → 抽卡 ────────────────────────────────────────────
  const handleStartPicking = () => {
    if (!question.trim()) return;
    if (hitConcurrencyCap) return;
    const cards = drawRandomCards(6, ALL_TAROT);
    setCandidates(cards.map(c => ({ card: c, orientation: randomOrientation() })));
    setPickedIndices([]);
    setPhase('picking');
  };

  const togglePick = (idx: number) => {
    if (pickedIndices.includes(idx)) {
      setPickedIndices(pickedIndices.filter(i => i !== idx));
      return;
    }
    if (pickedIndices.length >= 3) return;
    setPickedIndices([...pickedIndices, idx]);
  };

  // ── 抽卡 → 翻面 → 流式解读 ────────────────────────────────
  const handleReveal = () => {
    if (pickedIndices.length !== 3) return;
    if (noApiKey) {
      setError('请先在「设置 → AI 总结」中配置 API 密钥。中长期占卜无法离线完成。');
      return;
    }
    setError(null);
    setStreamedText('');
    setPhase('revealing');

    // 翻面动画期间并发启动 AI 流式调用；动画完成后切到 reading 视图，
    // 此时已有部分文本可显示，避免空档。
    void runReadingStream();
    setTimeout(() => {
      // 仅当仍处于 revealing 时才过渡（流式失败会把 phase 设回 picking）
      setPhase(p => (p === 'revealing' ? 'reading' : p));
    }, 1500);
  };

  const runReadingStream = async () => {
    const picked: DrawnCard[] = pickedIndices.map(i => ({
      cardId: candidates[i].card.id,
      orientation: candidates[i].orientation,
    }));

    const recentByAttribute = getRecentActivitiesByAttribute(4);
    const req = buildLongReadingRequest({
      settings, attributes, recentByAttribute,
      question: question.trim(), period, picked,
    });
    prevMessagesRef.current = {
      user: req.messages[req.messages.length - 1].content,
      assistant: '',
    };

    setIsStreaming(true);

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    let full = '';
    try {
      for await (const chunk of streamChatSSE(req, abortCtrl.signal)) {
        full += chunk;
        setStreamedText(full);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setError(formatApiError(e));
        setIsStreaming(false);
        return;
      }
    } finally {
      setIsStreaming(false);
    }

    if (!full) {
      setError('解读内容为空，请重试');
      return;
    }

    if (prevMessagesRef.current) prevMessagesRef.current.assistant = full;

    const createdAt = new Date();
    const expires = new Date(createdAt);
    expires.setDate(expires.getDate() + 14);
    const newReading: LongReading = {
      id: uuidv4(),
      question: question.trim(),
      period,
      drawnFrom: candidates.map(c => c.card.id),
      picked,
      content: full,
      followUps: [],
      archived: false,
      createdAt,
      expiresAt: toLocalDateKey(expires),
    };
    await saveLongReading(newReading);
    setReading(newReading);
    setPhase('done');
  };

  // ── 追问 ──────────────────────────────────────────────────
  const handleFollowStart = () => {
    setFollowOpen(true);
    setFollowPhase('form');
    setFollowQuestion('');
  };

  const handleFollowPickStart = () => {
    if (!followQuestion.trim()) return;
    const cards = drawRandomCards(3, ALL_TAROT);
    setFollowCandidates(cards.map(c => ({ card: c, orientation: randomOrientation() })));
    setFollowPickedIndex(null);
    setFollowPhase('picking');
  };

  const handleFollowReveal = async (idx: number) => {
    if (!reading) return;
    setFollowPickedIndex(idx);
    setFollowPhase('reading');
    setFollowStreamedText('');
    setFollowError(null);
    setFollowStreaming(true);

    const picked = followCandidates[idx];

    // 恢复先前主解读的上下文（若本次是打开归档详情，则从 reading 重建）
    const prev = prevMessagesRef.current ?? {
      user: `**客人提出的问题**：${reading.question}\n**牌阵**：${reading.picked
        .map((p, i) => {
          const c = TAROT_BY_ID[p.cardId];
          return `${SPREAD_POSITIONS[reading.period][i]}：${c?.name ?? p.cardId}（${p.orientation === 'upright' ? '正位' : '逆位'}）`;
        })
        .join('；')}`,
      assistant: reading.content,
    };

    const req = buildFollowUpRequest({
      settings,
      previousUserMessage: prev.user,
      previousAssistantMessage: prev.assistant,
      followUpQuestion: followQuestion.trim(),
      followUpCard: picked.card,
      followUpOrientation: picked.orientation,
    });

    const abortCtrl = new AbortController();
    followAbortRef.current = abortCtrl;

    let full = '';
    try {
      for await (const chunk of streamChatSSE(req, abortCtrl.signal)) {
        full += chunk;
        setFollowStreamedText(full);
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setFollowError(formatApiError(e));
      }
      setFollowStreaming(false);
      return;
    } finally {
      setFollowStreaming(false);
    }

    if (!full) {
      setFollowError('回应内容为空');
      return;
    }

    const follow: LongReadingFollowUp = {
      id: uuidv4(),
      question: followQuestion.trim(),
      drawnFrom: followCandidates.map(c => c.card.id),
      cardId: picked.card.id,
      orientation: picked.orientation,
      content: full,
      createdAt: new Date(),
    };
    await appendLongReadingFollowUp(reading.id, follow);
    setReading({ ...reading, followUps: [...(reading.followUps ?? []), follow] });
    setFollowPhase('done');
  };

  // ── 视图 ─────────────────────────────────────────────────

  // 1) 表单
  if (phase === 'form') {
    return (
      <div className="space-y-5">
        {hitConcurrencyCap && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            当前已有 {activeCount} 条活跃占卜（上限 2）。请先归档或等已有占卜过期（14 天）后再发起新的。
          </div>
        )}
        {noApiKey && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl p-4 text-xs text-red-700 dark:text-red-300 leading-relaxed">
            中长期占卜需要 AI 解读，请先在「设置 → AI 总结」中配置 API 密钥。
          </div>
        )}
        <div>
          <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">你想要询问什么？</div>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value.slice(0, 300))}
            placeholder="例：我最近对工作的方向感到迷茫，接下来该如何取舍？"
            rows={4}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary resize-none"
          />
          <div className="text-[10px] text-gray-400 mt-1 text-right">{question.length}/300</div>
        </div>
        <div>
          <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">时间周期</div>
          <div className="grid grid-cols-3 gap-2">
            {(['recent', 'midterm', 'longterm'] as LongReadingPeriod[]).map(p => {
              const meta = PERIOD_LABELS[p];
              const active = period === p;
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-2xl py-2.5 px-2 text-xs font-bold transition-all text-center ${
                    active
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <div>{meta.label}</div>
                  <div className={`text-[10px] mt-0.5 ${active ? 'text-white/80' : 'text-gray-400'}`}>{meta.days}</div>
                </button>
              );
            })}
          </div>
          <div className="text-[10px] text-gray-400 mt-1.5">牌阵：{SPREAD_POSITIONS[period].join(' · ')}</div>
        </div>

        <button
          onClick={handleStartPicking}
          disabled={!question.trim() || hitConcurrencyCap || noApiKey}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${
            !question.trim() || hitConcurrencyCap || noApiKey
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-primary text-white shadow-lg active:scale-98'
          }`}
        >
          🂠 开始洗牌
        </button>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl p-3 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>
    );
  }

  // 2) 抽卡（6 选 3）
  if (phase === 'picking') {
    const positions = SPREAD_POSITIONS[period];
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-[3px]">
            从六张牌中选出三张
          </h3>
          <p className="text-[11px] text-gray-400 mt-1">
            依次点击 = 依次进入牌阵：{positions.join(' → ')}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 place-items-center">
          {candidates.map((_c, i) => {
            const picked = pickedIndices.indexOf(i);
            const isSelected = picked >= 0;
            // 错位的 float 相位：依据在选中序列中的位置（picked）而非卡索引，保证多卡同步感但又有细微错落
            const floatDelay = picked * 0.25;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="relative"
              >
                <motion.div
                  animate={isSelected
                    ? { y: [0, -10, 0], scale: [1, 1.03, 1] }
                    : { y: 0, scale: 1 }
                  }
                  transition={isSelected
                    ? {
                        y:     { repeat: Infinity, duration: 2.4, ease: 'easeInOut', delay: floatDelay },
                        scale: { repeat: Infinity, duration: 2.4, ease: 'easeInOut', delay: floatDelay },
                      }
                    : { duration: 0.25 }
                  }
                  className="relative"
                  style={{
                    filter: isSelected
                      ? 'drop-shadow(0 6px 18px rgba(212,175,55,0.35))'
                      : 'none',
                  }}
                >
                  <CardBack width={88} onClick={() => togglePick(i)} selected={isSelected} />
                  {isSelected && (
                    <div
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-white text-xs font-black flex items-center justify-center shadow-md"
                      style={{ zIndex: 10 }}
                    >
                      {picked + 1}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setPhase('form')}
            className="flex-1 py-3 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300"
          >
            返回
          </button>
          <button
            onClick={handleReveal}
            disabled={pickedIndices.length !== 3}
            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${
              pickedIndices.length !== 3
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-primary text-white shadow-md'
            }`}
          >
            揭示 ({pickedIndices.length}/3)
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl p-3 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>
    );
  }

  // 2.5) 翻面过渡：三张选中牌从背面翻到正面
  if (phase === 'revealing') {
    const positions = SPREAD_POSITIONS[period];
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-6 pt-2"
      >
        <div className="text-center">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-[3px]">
            揭示牌阵…
          </h3>
          <p className="text-[11px] text-gray-400 mt-1">
            三张牌依次翻开，等候星象的解读
          </p>
        </div>
        <div className="flex justify-center gap-3">
          {pickedIndices.map((i, pos) => (
            <FlippingCard
              key={i}
              card={candidates[i].card}
              orientation={candidates[i].orientation}
              width={100}
              delay={pos * 0.35}
              position={positions[pos]}
            />
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="flex items-center justify-center gap-2 text-[10px] text-gray-400 dark:text-gray-500 tracking-widest"
        >
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
          >◌</motion.span>
          <span>正在展开牌阵</span>
        </motion.div>
      </motion.div>
    );
  }

  // 3) 解读中（流式）
  if (phase === 'reading') {
    const positions = SPREAD_POSITIONS[period];
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="space-y-5"
      >
        <div className="flex justify-center gap-3">
          {pickedIndices.map((i, pos) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 1.15 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: pos * 0.08, duration: 0.4 }}
              className="flex flex-col items-center"
            >
              <TarotCardSVG
                card={candidates[i].card}
                orientation={candidates[i].orientation}
                width={72}
                staticCard
                showOrientationTag
              />
              <div className="text-[10px] text-gray-400 mt-1">{positions[pos]}</div>
            </motion.div>
          ))}
        </div>

        <div className="relative bg-black/3 dark:bg-white/3 rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed min-h-[120px]">
          {streamedText ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(streamedText)}</p>`),
              }}
            />
          ) : (
            <div className="text-xs text-gray-400 flex items-center gap-2">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
              >◌</motion.span>
              <span>正在展开牌阵…</span>
            </div>
          )}
          {isStreaming && (
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.6 }}
              className="inline-block w-0.5 h-4 bg-primary align-middle ml-0.5"
            />
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl p-3 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
            {error}
            <div className="mt-2">
              <button
                onClick={() => setPhase('picking')}
                className="text-xs font-bold underline"
              >返回抽卡重试</button>
            </div>
          </div>
        )}

        {!isStreaming && !error && streamedText && (
          <div className="text-center text-[11px] text-gray-400">
            已归档至档案，14 天内可追问一次。
          </div>
        )}
      </motion.div>
    );
  }

  // 4) 完成态
  if (phase === 'done' && reading) {
    return (
      <ReadingDetail
        reading={reading}
        canFollowUp={canFollowUp}
        onFollowUp={handleFollowStart}
        onBack={onBack}
        followUI={followOpen ? (
          <FollowUpPanel
            phase={followPhase}
            question={followQuestion}
            setQuestion={setFollowQuestion}
            candidates={followCandidates}
            pickedIndex={followPickedIndex}
            streamedText={followStreamedText}
            isStreaming={followStreaming}
            error={followError}
            onStartPick={handleFollowPickStart}
            onReveal={handleFollowReveal}
            onClose={() => setFollowOpen(false)}
          />
        ) : undefined}
      />
    );
  }

  return null;
}

// ── 翻面卡（用于 revealing 过渡） ───────────────────────────

function FlippingCard({
  card, orientation, width, delay, position,
}: {
  card: TarotCardData;
  orientation: TarotOrientation;
  width: number;
  delay: number;
  position: string;
}) {
  const height = Math.round(width * 1.6);
  return (
    <div className="flex flex-col items-center" style={{ perspective: 1200 }}>
      <motion.div
        initial={{ rotateY: 0, y: -4 }}
        animate={{ rotateY: 180, y: 0 }}
        transition={{ duration: 0.9, delay, ease: [0.45, 0, 0.55, 1] }}
        style={{ transformStyle: 'preserve-3d', width, height }}
        className="relative"
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <CardBack width={width} hoverable={false} />
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <TarotCardSVG
            card={card}
            orientation={orientation}
            width={width}
            staticCard
            showOrientationTag
          />
        </div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.9 }}
        className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 tracking-wider"
      >
        {position}
      </motion.div>
    </div>
  );
}

// ── 追问面板 ───────────────────────────────────────────────

function FollowUpPanel({
  phase, question, setQuestion, candidates, pickedIndex,
  streamedText, isStreaming, error,
  onStartPick, onReveal, onClose,
}: {
  phase: 'form' | 'picking' | 'reading' | 'done';
  question: string;
  setQuestion: (v: string) => void;
  candidates: Candidate[];
  pickedIndex: number | null;
  streamedText: string;
  isStreaming: boolean;
  error: string | null;
  onStartPick: () => void;
  onReveal: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-black text-primary tracking-wider uppercase">追问（仅一次）</div>
        {phase !== 'reading' && (
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">收起</button>
        )}
      </div>

      {phase === 'form' && (
        <div className="space-y-2">
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value.slice(0, 200))}
            placeholder="想对先前的解读再深入问什么？"
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary resize-none"
          />
          <button
            onClick={onStartPick}
            disabled={!question.trim()}
            className={`w-full py-2.5 rounded-xl text-sm font-bold ${
              !question.trim() ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-primary text-white'
            }`}
          >
            抽一张牌
          </button>
        </div>
      )}

      {phase === 'picking' && (
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 text-center">
            从三张中选一张
          </div>
          <div className="flex justify-center gap-3">
            {candidates.map((_, i) => (
              <CardBack key={i} width={72} onClick={() => onReveal(i)} />
            ))}
          </div>
        </div>
      )}

      {phase === 'reading' && pickedIndex !== null && (
        <div className="space-y-3">
          <div className="flex justify-center">
            <TarotCardSVG
              card={candidates[pickedIndex].card}
              orientation={candidates[pickedIndex].orientation}
              width={80}
              staticCard
              showOrientationTag
            />
          </div>
          <div className="bg-white/50 dark:bg-black/20 rounded-xl p-3 text-sm text-gray-700 dark:text-gray-200 leading-relaxed min-h-[80px]">
            {streamedText ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(streamedText)}</p>`),
                }}
              />
            ) : (
              <div className="text-xs text-gray-400">正在回应…</div>
            )}
            {isStreaming && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.6 }}
                className="inline-block w-0.5 h-4 bg-primary align-middle ml-0.5"
              />
            )}
          </div>
          {error && (
            <div className="text-xs text-red-500 dark:text-red-400 whitespace-pre-wrap">{error}</div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          追问已记录，可在档案中回看。
        </div>
      )}
    </motion.div>
  );
}

// ── 解读详情（主 + 追问列表 + 操作） ────────────────────────

export function ReadingDetail({
  reading,
  canFollowUp,
  onFollowUp,
  onBack,
  followUI,
}: {
  reading: LongReading;
  canFollowUp: boolean;
  onFollowUp: () => void;
  onBack: () => void;
  followUI?: React.ReactNode;
}) {
  const { archiveLongReading, deleteLongReading } = useAppStore();
  const positions = SPREAD_POSITIONS[reading.period];
  const today = toLocalDateKey();
  const expired = reading.expiresAt < today;
  const remainingDays = Math.max(0, Math.ceil(
    (new Date(reading.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-gray-500 text-lg flex-shrink-0"
          aria-label="返回"
        >‹</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary">
              {PERIOD_LABELS[reading.period].label}
            </span>
            {reading.archived ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500">
                已归档
              </span>
            ) : expired ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                已到期
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                活跃 · 剩 {remainingDays} 天
              </span>
            )}
          </div>
          <div className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-1 line-clamp-2">
            {reading.question}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {new Date(reading.createdAt).toLocaleDateString('zh-CN')} · 到期 {reading.expiresAt}
          </div>
        </div>
      </div>

      {/* 牌阵 */}
      <div className="flex justify-center gap-3">
        {reading.picked.map((p, i) => {
          const card = TAROT_BY_ID[p.cardId];
          if (!card) return null;
          return (
            <div key={i} className="flex flex-col items-center">
              <TarotCardSVG card={card} orientation={p.orientation} width={78} staticCard showOrientationTag />
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{positions[i]}</div>
            </div>
          );
        })}
      </div>

      {/* 主解读 */}
      <div
        className="rounded-2xl bg-black/3 dark:bg-white/3 p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(reading.content)}</p>`),
        }}
      />

      {/* 追问列表 */}
      {(reading.followUps ?? []).map(f => {
        const card = TAROT_BY_ID[f.cardId];
        return (
          <div key={f.id} className="rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 space-y-3">
            <div className="text-xs font-black text-primary tracking-wider uppercase">追问</div>
            <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{f.question}</div>
            {card && (
              <div className="flex justify-center">
                <TarotCardSVG card={card} orientation={f.orientation} width={64} staticCard showOrientationTag />
              </div>
            )}
            <div
              className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(f.content)}</p>`),
              }}
            />
            <div className="text-[10px] text-gray-400">
              {new Date(f.createdAt).toLocaleDateString('zh-CN')}
            </div>
          </div>
        );
      })}

      {followUI}

      {/* 操作栏 */}
      <div className="flex gap-2 pt-1">
        {canFollowUp && !followUI && (
          <button
            onClick={onFollowUp}
            className="flex-1 py-3 rounded-2xl font-bold text-sm bg-primary text-white shadow-md"
          >
            追问（1/1）
          </button>
        )}
        {!reading.archived && (
          <button
            onClick={() => archiveLongReading(reading.id, true)}
            className="flex-1 py-3 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200"
          >
            归档
          </button>
        )}
        {reading.archived && (
          <button
            onClick={() => archiveLongReading(reading.id, false)}
            className="flex-1 py-3 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200"
          >
            取消归档
          </button>
        )}
        {confirmDel ? (
          <button
            onClick={() => { deleteLongReading(reading.id); onBack(); }}
            className="flex-1 py-3 rounded-2xl font-bold text-sm bg-red-500 text-white"
          >
            确认删除
          </button>
        ) : (
          <button
            onClick={() => setConfirmDel(true)}
            className="py-3 px-4 rounded-2xl font-bold text-sm bg-red-50 dark:bg-red-900/20 text-red-500"
          >
            删除
          </button>
        )}
      </div>
    </div>
  );
}
