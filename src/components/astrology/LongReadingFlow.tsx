import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import DOMPurify from 'dompurify';
import { useAppStore, toLocalDateKey } from '@/store';
import {
  ALL_TAROT,
  MAJOR_ARCANA,
  TAROT_BY_ID,
  drawRandomCards,
  randomOrientation,
  SPREAD_POSITIONS,
  PERIOD_LABELS,
  BASE_POSITION,
  periodHasBase,
  spreadPositionsFor,
  TarotCardData,
} from '@/constants/tarot';
import { LongReading, LongReadingPeriod, TarotOrientation, DrawnCard } from '@/types';
import { CardBack } from './CardBack';
import { TarotCardSVG } from './TarotCardSVG';
import { renderMarkdown } from '@/utils/markdown';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic } from '@/utils/feedback';
import { useThinkProgress } from '@/utils/thinkProgress';
import {
  useTarotJobs, startLongJob, startFollowJob, ackLongJob, ackFollowJob, readLongPending, clearLongPending, type LongPending,
} from '@/utils/tarotJobs';
import { ThinkingCircle } from './ThinkingCircle';
import { P3R, slantClip, SlantButton } from '@/components/p3r/kit';

/** P3R 青双斜杠（p3-modal-16 稿的节标签尾饰） */
const CyanSlashes = ({ soft = false }: { soft?: boolean }) => (
  <span aria-hidden className="inline-flex gap-1">
    <span className="h-[13px] w-[10px]" style={{ background: soft ? 'rgba(53,209,232,0.45)' : 'var(--p3r-cyan, #35d1e8)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
    <span className="h-[13px] w-[10px]" style={{ background: soft ? 'rgba(53,209,232,0.25)' : 'rgba(53,209,232,0.55)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
  </span>
);

type Phase =
  | 'form'        // 问题 + 周期
  | 'base'        // 长远档：长按注入命运的波纹，抽「底色」牌（先不翻开）
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

const toCandidate = (d: DrawnCard): Candidate | null => {
  const card = TAROT_BY_ID[d.cardId];
  return card ? { card, orientation: d.orientation } : null;
};
const toCandidates = (list: DrawnCard[]): Candidate[] => list.map(toCandidate).filter((c): c is Candidate => !!c);

export function LongReadingFlow({ initialReading, onBack }: Props) {
  const { settings, countActiveReadings } = useAppStore();
  const noApiKey = !settings.summaryApiKey;
  const p3 = useUiChannel() === 'p3';

  const [phase, setPhase] = useState<Phase>(initialReading ? 'done' : 'form');
  const [reading, setReading] = useState<LongReading | null>(initialReading ?? null);

  // 表单
  const [question, setQuestion] = useState('');
  const [period, setPeriod] = useState<LongReadingPeriod>('midterm');

  // 抽卡
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  /** 长远档的「底色」牌：长按注入命运时抽出，背面朝上，与三张一起翻开 */
  const [baseCard, setBaseCard] = useState<Candidate | null>(null);

  // 流式：请求跑在模块级任务里（utils/tarotJobs），组件只订阅——切页不打断，回来接着看
  const job = useTarotJobs(s => s.long);
  const followJob = useTarotJobs(s => s.follow);
  const streamedText = job?.text ?? '';
  const isStreaming = !!job && (job.status === 'thinking' || job.status === 'streaming');
  const thinking = !!job?.thinking;
  const progress = useThinkProgress(job?.tracker ?? null, !!job && job.status === 'thinking');
  const [error, setError] = useState<string | null>(null);
  // 进程被杀过、参数还在：表单页给「用同一副牌继续」
  const [pendingLong, setPendingLong] = useState<LongPending | null>(() => (job ? null : readLongPending()));

  // 追问
  const [followOpen, setFollowOpen] = useState(false);
  const [followPhase, setFollowPhase] = useState<'form' | 'picking' | 'reading' | 'done'>('form');
  const [followQuestion, setFollowQuestion] = useState('');
  const [followCandidates, setFollowCandidates] = useState<Candidate[]>([]);
  const [followPickedIndex, setFollowPickedIndex] = useState<number | null>(null);
  const followStreamedText = followJob?.text ?? '';
  const followStreaming = !!followJob && (followJob.status === 'thinking' || followJob.status === 'streaming');
  const followThinking = !!followJob?.thinking;
  const followProgress = useThinkProgress(followJob?.tracker ?? null, !!followJob && followJob.status === 'thinking');
  const [followError, setFollowError] = useState<string | null>(null);

  // ── 挂载时接回后台任务 ──
  useEffect(() => {
    if (initialReading) {
      // 打开归档详情：这条 reading 若有正在跑 / 刚出错的追问，把追问面板接回来
      if (followJob && followJob.readingId === initialReading.id && followJob.status !== 'done') {
        setFollowOpen(true);
        setFollowQuestion(followJob.question);
        setFollowCandidates(toCandidates(followJob.candidates));
        setFollowPickedIndex(followJob.pickedIndex);
        setFollowPhase('reading');
        if (followJob.status === 'error') setFollowError(followJob.error ?? '回应失败');
      }
      return;
    }
    if (!job) return;
    // 新占卜 tab：有任务就接上（跑着的 → reading；跑完的 → done；出错的 → reading + 错误）
    setQuestion(job.question);
    setPeriod(job.period);
    setCandidates(toCandidates(job.candidates));
    setPickedIndices(job.pickedIndices);
    setBaseCard(job.base ? toCandidate(job.base) : null);
    if (job.status === 'done' && job.result) {
      setReading(job.result);
      setPhase('done');
      return;
    }
    if (job.status === 'error') setError(job.error ?? '生成失败');
    setPhase('reading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 任务状态变化 → 视图 ──
  useEffect(() => {
    if (!job) return;
    if (phase !== 'reading' && phase !== 'revealing') return;
    if (job.status === 'done' && job.result) {
      setReading(job.result);
      setPhase('done');
    } else if (job.status === 'error') {
      setError(job.error ?? '生成失败');
      setPhase('reading');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  // 手记异步到达：任务里的 result 更新后同步给详情
  useEffect(() => {
    if (job?.status === 'done' && job.result && reading && job.result.id === reading.id && job.result.memo !== reading.memo) {
      setReading(job.result);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.result?.memo]);

  useEffect(() => {
    if (!followJob || !reading || followJob.readingId !== reading.id) return;
    if (followJob.status === 'done' && followJob.result) {
      const f = followJob.result;
      setReading(r => (r && !(r.followUps ?? []).some(x => x.id === f.id) ? { ...r, followUps: [...(r.followUps ?? []), f] } : r));
      setFollowPhase('done');
      ackFollowJob();
    } else if (followJob.status === 'error') {
      setFollowError(followJob.error ?? '回应失败');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followJob?.status]);

  const activeCount = countActiveReadings();
  const hitConcurrencyCap = !initialReading && activeCount >= 2;

  const liveReading = useAppStore(s => (reading ? s.longReadings.find(r => r.id === reading.id) : undefined)) ?? reading;
  const canFollowUp = useMemo(() => {
    if (!liveReading) return false;
    if (liveReading.archived) return false;
    if (liveReading.expiresAt < toLocalDateKey()) return false;
    return (liveReading.followUps?.length ?? 0) < 1;
  }, [liveReading]);

  // ── 表单 → 抽卡 ────────────────────────────────────────────
  const rollCandidates = () => {
    const cards = drawRandomCards(6, ALL_TAROT);
    setCandidates(cards.map(c => ({ card: c, orientation: randomOrientation() })));
    setPickedIndices([]);
  };

  const handleStartPicking = () => {
    if (!question.trim()) return;
    if (hitConcurrencyCap) return;
    setBaseCard(null);
    if (periodHasBase(period)) {
      // 长远档：先长按注入命运，抽出底色牌（背面朝上），再从六张里选三张
      setPhase('base');
      return;
    }
    rollCandidates();
    setPhase('picking');
  };

  // 长按注满 → 从大阿卡纳里抽一张作底色，先不翻开；停一拍再进选牌
  const handleBaseDrawn = () => {
    const [card] = drawRandomCards(1, MAJOR_ARCANA);
    setBaseCard({ card, orientation: randomOrientation() });
    window.setTimeout(() => {
      rollCandidates();
      setPhase('picking');
    }, 900);
  };

  const togglePick = (idx: number) => {
    if (pickedIndices.includes(idx)) {
      setPickedIndices(pickedIndices.filter(i => i !== idx));
      return;
    }
    if (pickedIndices.length >= 3) return;
    setPickedIndices([...pickedIndices, idx]);
  };

  // ── 抽卡 → 翻面 → 后台任务流式解读 ────────────────────────
  const handleReveal = () => {
    if (pickedIndices.length !== 3) return;
    if (noApiKey) {
      setError('请先在「设置 → AI 总结」中配置 API 密钥。中长期占卜无法离线完成。');
      return;
    }
    setError(null);
    setPhase('revealing');
    // 翻面动画期间任务已经在跑；动画完成后切到 reading 视图（此时多半还在思维链阶段）
    startLongJob({
      settings,
      question: question.trim(),
      period,
      candidates: candidates.map(c => ({ cardId: c.card.id, orientation: c.orientation })),
      pickedIndices,
      base: baseCard ? { cardId: baseCard.card.id, orientation: baseCard.orientation } : undefined,
    });
    setTimeout(() => {
      setPhase(p => (p === 'revealing' ? 'reading' : p));
    }, 1500);
  };

  // 进程被杀后回来：用同一副牌、同一个问题续跑
  const handleResumePending = () => {
    const pd = pendingLong;
    if (!pd) return;
    setQuestion(pd.question);
    setPeriod(pd.period);
    setCandidates(toCandidates(pd.candidates));
    setPickedIndices(pd.pickedIndices);
    setBaseCard(pd.base ? toCandidate(pd.base) : null);
    setError(null);
    setPendingLong(null);
    setPhase('reading');
    startLongJob({ settings, question: pd.question, period: pd.period, candidates: pd.candidates, pickedIndices: pd.pickedIndices, base: pd.base, id: pd.id });
  };
  const handleDiscardPending = () => {
    clearLongPending();
    setPendingLong(null);
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

  const handleFollowReveal = (idx: number) => {
    if (!reading) return;
    setFollowPickedIndex(idx);
    setFollowPhase('reading');
    setFollowError(null);
    startFollowJob({
      settings,
      reading,
      question: followQuestion.trim(),
      candidates: followCandidates.map(c => ({ cardId: c.card.id, orientation: c.orientation })),
      pickedIndex: idx,
      // 主解读那次请求的 user 消息（带简报）还在任务里就复用；归档详情里没有就按 reading 重建
      promptUser: job?.result?.id === reading.id ? job.promptUser : undefined,
    });
  };

  // ── 视图 ─────────────────────────────────────────────────

  // 翻面与解读视图里的牌序：底色（若有）在前，其后是牌阵三位
  const revealCards: Candidate[] = [
    ...(baseCard ? [baseCard] : []),
    ...pickedIndices.map(i => candidates[i]).filter((c): c is Candidate => !!c),
  ];
  const revealPositions = spreadPositionsFor(period, revealCards.length);

  // 1) 表单
  if (phase === 'form') {
    // P3R（p3-modal-16 稿 1:1）：提示斜条 + 大浅青斜切问题面（青底线+计数）+
    // 时间周期斜块三选（选中蓝+洋红角，同页头 tab 结构）+ 牌阵装饰卡 + 「开始洗牌」蓝大 CTA
    if (p3) {
      const periodMetaList = (['recent', 'midterm', 'longterm'] as LongReadingPeriod[]);
      return (
        <div className="space-y-6">
          {pendingLong && (
            <div className="space-y-2.5 px-4 py-3" style={{ background: 'rgba(53,209,232,0.14)', clipPath: slantClip(10) }}>
              <p className="text-[13px] font-black" style={{ color: P3R.ink }}>上次的占卜没有生成完</p>
              <p className="line-clamp-2 text-[12px] font-semibold" style={{ color: P3R.grey }}>「{pendingLong.question}」· {PERIOD_LABELS[pendingLong.period].label}</p>
              <div className="flex gap-2">
                <SlantButton tone="primary" className="flex-1 py-2.5" onClick={handleResumePending}>用同一副牌继续</SlantButton>
                <SlantButton tone="ghost" className="px-5 py-2.5" onClick={handleDiscardPending}>放弃</SlantButton>
              </div>
            </div>
          )}
          {hitConcurrencyCap && (
            <div className="flex items-start gap-2.5 px-4 py-3" style={{ background: 'rgba(240,65,127,0.08)', clipPath: slantClip(10) }}>
              <span aria-hidden className="mt-0.5 h-[14px] w-[8px] shrink-0" style={{ background: P3R.magenta, transform: 'skewX(-18deg)' }} />
              <p className="text-[13px] font-bold leading-relaxed" style={{ color: P3R.magenta }}>
                当前已有 {activeCount} 条活跃占卜（上限 2）。请先归档或等已有占卜过期（14 天）后再发起新的。
              </p>
            </div>
          )}
          {noApiKey && (
            <div className="flex items-start gap-2.5 px-4 py-3" style={{ background: P3R.cyanFaint, clipPath: slantClip(10) }}>
              <span aria-hidden className="mt-0.5 h-[14px] w-[8px] shrink-0" style={{ background: P3R.blue, transform: 'skewX(-18deg)' }} />
              <p className="text-[13px] font-bold leading-relaxed" style={{ color: P3R.blue }}>
                中长期占卜需要 AI 解读，请先在「设置 → AI 总结」中配置 API 密钥。
              </p>
            </div>
          )}

          {/* 你想要询问什么？ */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-[19px] font-black" style={{ color: P3R.ink }}>你想要询问什么？</span>
              <CyanSlashes />
            </div>
            <div className="relative mt-3">
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value.slice(0, 300))}
                placeholder="例：我最近对工作的方向感到迷茫，接下来该如何取舍？"
                rows={6}
                className="w-full resize-none px-5 py-4 text-[15px] font-bold leading-relaxed outline-none placeholder:text-[#8fb1dc]"
                style={{ color: P3R.ink, background: 'linear-gradient(165deg, #ddeef8 0%, #cfe9f6 100%)', clipPath: 'polygon(14px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)' }}
              />
              <span aria-hidden className="absolute -bottom-1 left-0 right-16 h-[3px]" style={{ background: 'var(--p3r-cyan, #35d1e8)' }} />
              <span className="absolute -bottom-2.5 right-0 text-[13px] font-black" style={{ color: P3R.blue }}>{question.length}/300</span>
            </div>
          </div>

          {/* 时间周期 */}
          <div className="pt-1">
            <div className="flex items-center gap-2.5">
              <span className="text-[17px] font-black" style={{ color: P3R.ink }}>时间周期</span>
              <CyanSlashes soft />
            </div>
            <div className="mt-2.5 flex items-stretch">
              {periodMetaList.map((p, i) => {
                const meta = PERIOD_LABELS[p];
                const active = period === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className="relative flex-1 px-1 py-2.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                    style={{
                      clipPath: slantClip(12),
                      background: active ? P3R.blue : P3R.panel,
                      marginLeft: i > 0 ? -7 : 0,
                      zIndex: active ? 2 : 1,
                      boxShadow: active ? '0 8px 20px rgba(27,87,255,.28)' : '0 5px 14px rgba(7,40,120,.08)',
                    }}
                  >
                    <div className="text-[14px] font-black leading-tight" style={{ color: active ? '#fff' : P3R.ink }}>{meta.label}</div>
                    <div className="mt-0.5 text-[11px] font-semibold leading-none" style={{ color: active ? 'rgba(255,255,255,0.85)' : P3R.grey }}>{meta.days}</div>
                    {active && (
                      <span aria-hidden className="absolute bottom-0 right-3 h-[8px] w-[20px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 牌阵预览（装饰卡背） */}
          <div>
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-[14px] w-[8px]" style={{ background: P3R.blue, transform: 'skewX(-18deg)' }} />
              <span className="text-[15px] font-black" style={{ color: P3R.ink }}>牌阵：{spreadPositionsFor(period, periodHasBase(period) ? 4 : 3).join(' · ')}</span>
            </div>
            <div aria-hidden className="mt-3 flex justify-between gap-5 px-1">
              {Array.from({ length: periodHasBase(period) ? 4 : 3 }, (_, i) => i).map(i => (
                <span
                  key={i}
                  className="h-[148px] flex-1"
                  style={{
                    background: 'linear-gradient(115deg, transparent 46%, rgba(53,209,232,.4) 46%, rgba(53,209,232,.4) 50%, transparent 50%), linear-gradient(160deg, #daeef8 0%, #c2e3f2 100%)',
                    clipPath: 'polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 开始洗牌 */}
          <SlantButton
            tone="primary"
            magentaCorner
            disabled={!question.trim() || hitConcurrencyCap || noApiKey}
            className="w-full py-4 text-[22px]"
            onClick={handleStartPicking}
          >
            <span className="flex items-center justify-center gap-4">
              <span aria-hidden className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="h-[20px] w-[7px]" style={{ background: 'var(--p3r-cyan, #35d1e8)', transform: 'skewX(-20deg)', opacity: 1 - i * 0.25 }} />
                ))}
              </span>
              开始洗牌
            </span>
          </SlantButton>
          {error && (
            <div className="px-4 py-3 text-[13px] font-bold leading-relaxed whitespace-pre-wrap" style={{ background: 'rgba(240,65,127,0.08)', clipPath: slantClip(10), color: P3R.magenta }}>
              {error}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-5">
        {pendingLong && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-2">
            <div className="text-xs font-black text-primary">上次的占卜没有生成完</div>
            <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">「{pendingLong.question}」· {PERIOD_LABELS[pendingLong.period].label}</div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleResumePending} className="flex-1 py-2 rounded-xl text-xs font-bold bg-primary text-white">用同一副牌继续</button>
              <button type="button" onClick={handleDiscardPending} className="px-4 py-2 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300">放弃</button>
            </div>
          </div>
        )}
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
          <div className="text-[10px] text-gray-400 mt-1.5">牌阵：{spreadPositionsFor(period, periodHasBase(period) ? 4 : 3).join(' · ')}</div>
        </div>

        <button
          onClick={handleStartPicking}
          disabled={!question.trim() || hitConcurrencyCap || noApiKey}
          className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${
            !question.trim() || hitConcurrencyCap || noApiKey
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-primary text-white shadow-lg active:scale-[0.98]'
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
  // 1.5) 长远档：长按注入命运的波纹 → 抽出「底色」牌（背面朝上，稍后与三张一起翻开）
  if (phase === 'base') {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-2">
        <div className="text-center">
          <h3
            className={p3 ? 'text-[19px] font-black tracking-[2px]' : 'text-sm font-bold text-gray-800 dark:text-gray-100 tracking-[3px]'}
            style={p3 ? { color: P3R.blueDeep } : undefined}
          >
            {baseCard ? '命运的波纹已注入' : '请您注入命运的波纹'}
          </h3>
          <p
            className={p3 ? 'mt-1.5 text-[12px] font-semibold' : 'text-[11px] text-gray-400 dark:text-gray-500 mt-1'}
            style={p3 ? { color: P3R.grey } : undefined}
          >
            {baseCard ? `${BASE_POSITION}已定，稍后与三张牌一起翻开` : '长按牌堆，直到波纹注满'}
          </p>
        </div>
        <div className="flex justify-center">
          <HoldToDraw color={p3 ? '#1b57ff' : '#d4af37'} done={!!baseCard} onDone={handleBaseDrawn} />
        </div>
        {!baseCard && (
          <div className="flex justify-center">
            {p3 ? (
              <SlantButton tone="ghost" className="px-8 py-2.5" onClick={() => setPhase('form')}>返回</SlantButton>
            ) : (
              <button type="button" onClick={() => setPhase('form')} className="px-6 py-2 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300">
                返回
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  if (phase === 'picking') {
    const positions = SPREAD_POSITIONS[period];
    return (
      <div className="space-y-5">
        {baseCard && (
          <div className="flex items-center justify-center gap-3">
            <CardBack width={40} hoverable={false} />
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{BASE_POSITION}已注入，尚未翻开 · 会与三张牌一起揭示</div>
          </div>
        )}
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

        <div className="flex gap-2.5">
          {p3 ? (
            <>
              <SlantButton tone="ghost" className="flex-1 py-3" onClick={() => setPhase('form')}>返回</SlantButton>
              <SlantButton tone="primary" magentaCorner disabled={pickedIndices.length !== 3} className="flex-1 py-3" onClick={handleReveal}>
                揭示（{pickedIndices.length}/3）
              </SlantButton>
            </>
          ) : (
            <>
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
            </>
          )}
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
          {revealCards.map((c, pos) => (
            <FlippingCard
              key={`${c.card.id}-${pos}`}
              card={c.card}
              orientation={c.orientation}
              width={revealCards.length > 3 ? 78 : 100}
              delay={pos * 0.35}
              position={revealPositions[pos] ?? ''}
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
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="space-y-5"
      >
        <div className="flex justify-center gap-3">
          {revealCards.map((c, pos) => (
            <motion.div
              key={`${c.card.id}-${pos}`}
              initial={{ opacity: 0, scale: 1.15 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: pos * 0.08, duration: 0.4 }}
              className="flex flex-col items-center"
            >
              <TarotCardSVG
                card={c.card}
                orientation={c.orientation}
                width={revealCards.length > 3 ? 64 : 72}
                staticCard
                showOrientationTag
              />
              <div className="text-[10px] text-gray-400 mt-1">{revealPositions[pos] ?? ''}</div>
            </motion.div>
          ))}
        </div>

        <div
          className={p3
            ? 'relative min-h-[120px] bg-white p-4 text-sm font-semibold leading-relaxed'
            : 'relative bg-black/[0.03] dark:bg-white/[0.03] rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed min-h-[120px]'}
          style={p3 ? { color: P3R.ink, clipPath: slantClip(14), boxShadow: '0 10px 26px rgba(7,40,120,.10)' } : undefined}
        >
          {streamedText ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(streamedText)}</p>`),
              }}
            />
          ) : (
            <div className="flex justify-center py-3">
              <ThinkingCircle
                variant="hexagram"
                progress={progress}
                size={140}
                color={p3 ? '#1b57ff' : '#d4af37'}
                label={thinking ? '三张牌正在被放在一起推演' : '正在展开牌阵'}
                showPercent={thinking}
              />
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
                onClick={() => { ackLongJob(); setError(null); setPhase('picking'); }}
                className="text-xs font-bold underline"
              >返回抽卡重试</button>
            </div>
          </div>
        )}

        {isStreaming && (
          <div className="text-center text-[11px] text-gray-400">
            离开这页也不会中断，回来接着看。
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
        onBack={() => { ackLongJob(); onBack(); }}
        followUI={followOpen ? (
          <FollowUpPanel
            phase={followPhase}
            question={followQuestion}
            setQuestion={setFollowQuestion}
            candidates={followCandidates}
            pickedIndex={followPickedIndex}
            streamedText={followStreamedText}
            isStreaming={followStreaming}
            thinking={followThinking}
            progress={followProgress}
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
  streamedText, isStreaming, thinking, progress, error,
  onStartPick, onReveal, onClose,
}: {
  phase: 'form' | 'picking' | 'reading' | 'done';
  question: string;
  setQuestion: (v: string) => void;
  candidates: Candidate[];
  pickedIndex: number | null;
  streamedText: string;
  isStreaming: boolean;
  thinking?: boolean;
  progress?: number;
  error: string | null;
  onStartPick: () => void;
  onReveal: (i: number) => void;
  onClose: () => void;
}) {
  const p3 = useUiChannel() === 'p3';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={p3 ? 'space-y-3 p-4' : 'rounded-2xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-3'}
      style={p3 ? { background: '#e6f3fa', clipPath: slantClip(14) } : undefined}
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
          {p3 ? (
            <SlantButton tone="primary" magentaCorner disabled={!question.trim()} className="w-full py-2.5" onClick={onStartPick}>
              抽一张牌
            </SlantButton>
          ) : (
            <button
              onClick={onStartPick}
              disabled={!question.trim()}
              className={`w-full py-2.5 rounded-xl text-sm font-bold ${
                !question.trim() ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-primary text-white'
              }`}
            >
              抽一张牌
            </button>
          )}
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
              <div className="flex justify-center py-1">
                <ThinkingCircle variant="hexagram" progress={progress ?? 0} size={96} color={p3 ? '#1b57ff' : '#d4af37'} label={thinking ? '正在思索' : '正在回应'} showPercent={!!thinking} />
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
  // 归档 / 到期都从 store 取最新值，而不是靠 props：
  // 点「归档」后 store 已更新，但父组件手里那份 reading 还是旧的，按钮与标签要立刻跟着变（用户上报）
  const live = useAppStore(st => st.longReadings.find(r => r.id === reading.id)) ?? reading;
  const p3 = useUiChannel() === 'p3';
  const positions = spreadPositionsFor(reading.period, reading.picked.length);
  const today = toLocalDateKey();
  const expired = live.expiresAt < today;
  const remainingDays = Math.max(0, Math.ceil(
    (new Date(live.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
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
            {live.archived ? (
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
            {new Date(reading.createdAt).toLocaleDateString('zh-CN')} · 到期 {live.expiresAt}
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
              <TarotCardSVG card={card} orientation={p.orientation} width={reading.picked.length > 3 ? 70 : 78} staticCard showOrientationTag />
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">{positions[i] ?? ''}</div>
            </div>
          );
        })}
      </div>

      {/* 主解读 */}
      <div
        className={p3
          ? 'bg-white p-4 text-sm font-semibold leading-relaxed'
          : 'rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed'}
        style={p3 ? { color: P3R.ink, clipPath: slantClip(14), boxShadow: '0 10px 26px rgba(7,40,120,.10)' } : undefined}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(reading.content)}</p>`),
        }}
      />

      {/* 解读者手记（live.memo）不外显：只作为之后解读的"上次问到哪"喂回去（用户口径：内化掉） */}

      {/* 本牌含义：三张牌（及追问牌）各自的关键词 / 牌意 / 对号入座，预设文本，与每日的同款 */}
      <CardMeanings reading={live} p3={p3} />

      {followUI}

      {/* 操作栏 */}
      <div className="flex gap-2.5 pt-1">
        {p3 ? (
          <>
            {canFollowUp && !followUI && (
              <SlantButton tone="primary" magentaCorner className="flex-1 py-3" onClick={onFollowUp}>追问（1/1）</SlantButton>
            )}
            {!live.archived && (
              <SlantButton tone="ghost" className="flex-1 py-3" onClick={() => archiveLongReading(reading.id, true)}>归档</SlantButton>
            )}
            {live.archived && (
              <SlantButton tone="ghost" className="flex-1 py-3" onClick={() => archiveLongReading(reading.id, false)}>取消归档</SlantButton>
            )}
            {confirmDel ? (
              <SlantButton tone="danger" className="flex-1 py-3" onClick={() => { deleteLongReading(reading.id); onBack(); }}>确认删除</SlantButton>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="px-5 py-3 text-sm font-black"
                style={{ background: 'rgba(240,65,127,0.10)', color: P3R.magenta, clipPath: slantClip(10) }}
              >
                删除
              </button>
            )}
          </>
        ) : (
          <>
            {canFollowUp && !followUI && (
              <button
                onClick={onFollowUp}
                className="flex-1 py-3 rounded-2xl font-bold text-sm bg-primary text-white shadow-md"
              >
                追问（1/1）
              </button>
            )}
            {!live.archived && (
              <button
                onClick={() => archiveLongReading(reading.id, true)}
                className="flex-1 py-3 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200"
              >
                归档
              </button>
            )}
            {live.archived && (
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
          </>
        )}
      </div>
    </div>
  );
}


// ── 「窥探命运」：跟在解读之后的预设牌意（关键词 / 牌意 / 对号入座） ─────
// 牌意那句与对号入座不重复：tarotReflections 已按"不复述牌意"重写

function CardMeanings({ reading, p3 }: { reading: LongReading; p3: boolean }) {
  const positions = spreadPositionsFor(reading.period, reading.picked.length);
  const rows = [
    ...reading.picked.map((p, i) => ({ key: `m${i}`, pos: positions[i] ?? '', card: TAROT_BY_ID[p.cardId], orientation: p.orientation })),
    ...(reading.followUps ?? []).map((f, i) => ({ key: `f${i}`, pos: '追问', card: TAROT_BY_ID[f.cardId], orientation: f.orientation })),
  ];
  return (
    <div
      className={p3 ? 'bg-white p-4' : 'rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/30 p-4'}
      style={p3 ? { clipPath: slantClip(14), boxShadow: '0 8px 22px rgba(7,40,120,.08)' } : undefined}
    >
      {/* 小标题层级：主标题 + 一行牌阵位置 */}
      <div className="mb-3 border-b border-gray-200/70 dark:border-gray-700/50 pb-2.5">
        <div className="text-[13px] font-black tracking-[4px] text-primary">窥探命运</div>
        <div className="mt-0.5 text-[10px] tracking-[1px] text-gray-400 dark:text-gray-500">{positions.join(' · ')}</div>
      </div>
      <div className="divide-y divide-gray-200/70 dark:divide-gray-700/50">
        {rows.map(({ key, pos, card, orientation }) => {
          if (!card) return null;
          const m = card[orientation];
          return (
            <div key={key} className="space-y-2 py-3 first:pt-0 last:pb-0">
              {/* 牌名 + 位置 + 正逆：牌名最大最黑，位置是小胶囊 */}
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-black text-gray-900 dark:text-white">{card.name}</span>
                {pos && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">{pos}</span>
                )}
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{orientation === 'upright' ? '正位' : '逆位'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.keywords.map((kw, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-gray-900/60 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{kw}</span>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{m.meaning}</p>
              <p className="text-[12.5px] leading-relaxed text-gray-700 dark:text-gray-200">{m.reflection}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 长按注入命运：蓄力环 + 波纹，注满即抽底色牌 ──────────────────

function HoldToDraw({ color, done, onDone }: { color: string; done: boolean; onDone: () => void }) {
  const d0 = !useBoldness();
  const HOLD_MS = d0 ? 500 : 1500;
  const [progress, setProgress] = useState(0);
  const holdingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const stopRaf = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };
  useEffect(() => () => stopRaf(), []);

  const begin = (e: React.PointerEvent) => {
    if (done || firedRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holdingRef.current = true;
    stopRaf();
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress(p => {
        const next = Math.min(1, p + dt / HOLD_MS);
        if (next >= 1 && !firedRef.current) {
          firedRef.current = true;
          holdingRef.current = false;
          stopRaf();
          triggerLightHaptic();
          onDone();
          return 1;
        }
        return next;
      });
      if (holdingRef.current) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const cancel = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    stopRaf();
    // 松手：蓄力回退
    let last = performance.now();
    const back = (now: number) => {
      const dt = now - last;
      last = now;
      let finished = false;
      setProgress(p => {
        const next = Math.max(0, p - dt / 400);
        if (next <= 0) finished = true;
        return next;
      });
      if (!finished) rafRef.current = requestAnimationFrame(back);
    };
    rafRef.current = requestAnimationFrame(back);
  };

  const p = done ? 1 : progress;
  const soft = color === '#1b57ff' ? 'rgba(27,87,255,0.45)' : 'rgba(212,175,55,0.55)';
  const R = 96;
  const circ = 2 * Math.PI * R;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
      {/* 波纹：随蓄力从牌堆中心扩散，注满后常亮 */}
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: 130 + i * 38, height: 130 + i * 38,
            border: `1.5px solid ${color}`,
            opacity: Math.max(0, Math.min(0.9, p * 1.4 - i * 0.35)),
          }}
          animate={d0 ? undefined : { scale: [1, 1.06, 1] }}
          transition={d0 ? undefined : { repeat: Infinity, duration: 2.4 + i * 0.5, ease: 'easeInOut' }}
        />
      ))}
      {/* 蓄力环 */}
      <svg className="absolute" width={220} height={220} viewBox="0 0 220 220" aria-hidden>
        <circle cx={110} cy={110} r={R} fill="none" stroke={soft} strokeOpacity={0.35} strokeWidth={2} />
        <circle
          cx={110} cy={110} r={R} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={`${p * circ} ${circ}`} transform="rotate(-90 110 110)"
          style={{ filter: `drop-shadow(0 0 ${4 + p * 8}px ${soft})` }}
        />
      </svg>
      <div
        role="button"
        aria-label="长按注入命运的波纹"
        onPointerDown={begin}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        className={`relative z-10 touch-none select-none ${done ? '' : 'cursor-pointer'}`}
        style={{ transform: `scale(${1 + p * 0.06})`, filter: `drop-shadow(0 0 ${6 + p * 18}px ${soft})` }}
      >
        <CardBack width={110} hoverable={false} />
      </div>
    </div>
  );
}
