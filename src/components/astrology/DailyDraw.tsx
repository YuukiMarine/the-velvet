import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import {
  MAJOR_ARCANA,
  TAROT_BY_ID,
  drawRandomCards,
  randomOrientation,
  randomBonusMultiplier,
  inferFortune,
  FORTUNE_META,
  TarotCardData,
} from '@/constants/tarot';
import { DailyDivination, TarotOrientation } from '@/types';
import { CardBack } from './CardBack';
import { TarotCardSVG } from './TarotCardSVG';
import { CardNameReveal } from './CardNameReveal';
import { ShuffleAnim } from './ShuffleAnim';
import { buildOfflineDaily } from '@/utils/tarotOffline';
import { renderMarkdown } from '@/utils/markdown';
import { useThinkProgress } from '@/utils/thinkProgress';
import {
  useTarotJobs, startDailyJob, continueDailyJob, TAROT_CONTINUE_LIMIT, readDailyPending, writeDailyPending, clearDailyPending,
} from '@/utils/tarotJobs';
import { ThinkingCircle } from './ThinkingCircle';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, slantClip } from '@/components/p3r/kit';
import { roughQuad } from '@/components/p5r/kit';

/**
 * P5 结果纸卡 —— 抽完之后的三块文字（本牌含义 / 今日运势 / 总体运势）原本是
 * 半透明灰底 + 灰字，压在纯黑舞台上既糊又读不出；这里换成纸面 + 不等宽黑框。
 * 挂 .p5-paper：页面上的 .p5-onink 会据此把内部灰系文字翻回黑（卡内不跟舞台走）。
 */
const P5Sheet = ({ seed, children, className }: { seed: number; children: React.ReactNode; className?: string }) => (
  <div className={`p5-paper relative px-4 py-3.5 ${className ?? ''}`}>
    <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: '#050505', clipPath: roughQuad(seed, 6) }} />
    <span aria-hidden className="absolute inset-0" style={{ background: '#050505', clipPath: roughQuad(seed + 0.31, 5) }} />
    <span aria-hidden className="absolute inset-[3px]" style={{ background: '#f0e9df', clipPath: roughQuad(seed + 0.63, 4) }} />
    <div className="relative" style={{ color: '#050505' }}>{children}</div>
  </div>
);

/** p5 时套上纸卡，其它频道原样透传（避免为三处各写一遍三元表达式） */
const Wrap = ({ p5, seed, children }: { p5: boolean; seed: number; children: React.ReactNode }) =>
  p5 ? <P5Sheet seed={seed}>{children}</P5Sheet> : <>{children}</>;

/** P3R 标题两侧的青双斜杠装饰（p3-astrology 设计稿「// 正在洗牌… //」式） */
const CyanSlashes = () => (
  <span aria-hidden className="flex gap-1">
    <span className="h-[13px] w-[11px]" style={{ background: 'rgba(53,209,232,0.75)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
    <span className="h-[13px] w-[11px]" style={{ background: 'rgba(53,209,232,0.4)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
  </span>
);

type Phase =
  | 'init'        // 计算初始态
  | 'intro'       // 尚未抽：洗牌入场
  | 'pick'        // 3 张候选待点
  | 'flipping'    // 选中的牌翻转中
  | 'calling'     // 后台任务在跑（思维链 / 流式落笔）
  | 'done'        // 完成
  | 'error';

interface Candidate {
  card: TarotCardData;
  orientation: TarotOrientation;
}

export function DailyDraw() {
  const { dailyDivination, settings, saveDailyDivination } = useAppStore(useShallow(s => ({ dailyDivination: s.dailyDivination, settings: s.settings, saveDailyDivination: s.saveDailyDivination })));
  // 解读请求跑在模块级任务里（utils/tarotJobs）：切页不打断，回来接着看
  const job = useTarotJobs(s => s.daily);
  const today = toLocalDateKey();
  const jobToday = job && job.date === today ? job : null;
  const jobRunning = !!jobToday && (jobToday.status === 'thinking' || jobToday.status === 'streaming');
  const progress = useThinkProgress(jobToday?.tracker ?? null, !!jobToday && jobToday.status === 'thinking');

  const [phase, setPhase] = useState<Phase>('init');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const drawChannel = useUiChannel();
  const p3 = drawChannel === 'p3';
  const p5 = drawChannel === 'p5';

  const noApiKey = !settings.summaryApiKey;

  // 生成候选（每日塔罗仅用 22 张大阿卡纳）——同时落盘，供中断后恢复
  const rollCandidates = () => {
    const cards = drawRandomCards(3, MAJOR_ARCANA);
    const list: Candidate[] = cards.map(c => ({
      card: c,
      orientation: randomOrientation(),
    }));
    setCandidates(list);
    writeDailyPending({
      date: today,
      cards: list.map(c => ({ id: c.card.id, orientation: c.orientation })),
      pickedIndex: null,
    });
  };

  // 初始化：若今日已抽直接 done；有后台任务就接上；否则按暂存 / 重抽
  // 依赖项里加 dailyDivination?.date：跨日时即便 id 没变，date 不再等于 today 也会触发重置；
  // App 入口的 visibilitychange 已经在跨日时调 loadDailyDivination()，这里是双保险。
  useEffect(() => {
    if (dailyDivination && dailyDivination.date === today) {
      clearDailyPending();
      setPhase('done');
      return;
    }
    // 有当日暂存 → 恢复同一副候选
    const pending = readDailyPending();
    if (pending) {
      const restored = pending.cards
        .map(c => ({ card: TAROT_BY_ID[c.id], orientation: c.orientation }))
        .filter((c): c is Candidate => !!c.card);
      if (restored.length === pending.cards.length) {
        setCandidates(restored);
        // 后台任务还在跑 / 刚出错：接回它的状态，不重抽也不重跑
        if (jobToday && restored[jobToday.pickedIndex]) {
          setPickedIndex(jobToday.pickedIndex);
          if (jobRunning) {
            setPhase('calling');
          } else if (jobToday.status === 'error') {
            setErrorMsg(jobToday.error ?? '解读失败');
            setPhase('error');
          } else {
            setPhase('calling');
          }
          return;
        }
        if (pending.pickedIndex !== null && restored[pending.pickedIndex]) {
          // 选过牌但任务不在内存里（进程被杀过）：直接回到「重试 / 离线兜底」，牌面保持不变
          setPickedIndex(pending.pickedIndex);
          setErrorMsg('上次的解读没能完成——这张牌已经为你留着，直接继续就好。');
          setPhase('error');
        } else {
          setPhase('pick');
        }
        return;
      }
    }
    rollCandidates();
    setPhase('intro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyDivination?.id, dailyDivination?.date]);

  // 任务出错 → 错误态（任务成功会写 store，由上面的 effect 切到 done）
  useEffect(() => {
    if (!jobToday || phase !== 'calling') return;
    if (jobToday.status === 'error') {
      setErrorMsg(jobToday.error ?? '解读失败');
      setPhase('error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobToday?.status]);

  // force：从 error 态重试时用。phase 是闭包里的旧值，先 setPhase 再调这里读到的仍是
  // 'error'，会被守卫挡掉——这也是「重试 AI 解读 / 使用离线兜底」一直点不动的原因。
  const handlePick = async (idx: number, useOffline = false, force = false) => {
    if (!force && phase !== 'pick') return;
    setPickedIndex(idx);
    // 先把「选了哪张」落盘：从这一刻起中断都不该丢牌
    const cur = readDailyPending();
    if (cur) writeDailyPending({ ...cur, pickedIndex: idx });
    setPhase('flipping');

    const picked = candidates[idx];
    const orientation = picked.orientation;

    // 等翻牌动画约 700ms 后再发起请求（与 UI 同步）
    await new Promise(r => setTimeout(r, 700));

    if (useOffline || noApiKey) {
      const offline = buildOfflineDaily(picked.card, orientation);
      const drawn: DailyDivination = {
        id: uuidv4(),
        date: today,
        drawnFrom: candidates.map(c => c.card.id),
        pickedIndex: idx,
        cardId: picked.card.id,
        orientation,
        effect: { attribute: offline.attribute, multiplier: randomBonusMultiplier(orientation) },
        narration: offline.narration,
        advice: offline.advice,
        fortune: offline.fortune,
        source: 'offline',
        createdAt: new Date(),
      };
      await saveDailyDivination(drawn);
      clearDailyPending();
      setPhase('done');
      return;
    }

    setErrorMsg(null);
    setPhase('calling');
    startDailyJob({
      settings,
      cardId: picked.card.id,
      orientation,
      drawnFrom: candidates.map(c => c.card.id),
      pickedIndex: idx,
    });
  };

  const resume = (useOffline: boolean) => {
    if (pickedIndex === null) return;
    setErrorMsg(null);
    void handlePick(pickedIndex, useOffline, true);
  };
  const handleTryOffline = () => resume(true);
  const handleRetryAI = () => resume(false);
  // 第 4 轮：截断 / 断线不作废——半截解读留着，让它从断处接着写（最多三次）
  const canContinue = !!jobToday && jobToday.status === 'error' && jobToday.truncated && jobToday.continues < TAROT_CONTINUE_LIMIT;
  const handleContinue = () => {
    if (!canContinue) return;
    setErrorMsg(null);
    setPhase('calling');
    continueDailyJob(settings);
  };

  // ── 视图 ──────────────────────────────────────────────────

  if (phase === 'init') {
    return <div className="h-64" />;
  }

  if (phase === 'done' && dailyDivination) {
    return <DoneView d={dailyDivination} />;
  }

  const jobText = jobToday?.text ?? '';
  const thinking = !!jobToday?.thinking;
  // 一进 calling 就把面板亮出来：思维链第一段到达之前也有阵图在按时间生长
  const streaming = phase === 'calling';

  return (
    <div className="space-y-5">
      {/* AI 未配置提示（p3：浅青斜条 + 左蓝斜片，p3-astrology 设计稿） */}
      {noApiKey && (phase === 'intro' || phase === 'pick') && (
        p3 ? (
          <div className="flex items-start gap-2.5 px-4 py-3" style={{ clipPath: slantClip(10), background: P3R.cyanPale }}>
            <span aria-hidden className="mt-0.5 h-[14px] w-[10px] shrink-0" style={{ background: P3R.blue, clipPath: 'polygon(32% 0, 100% 0, 68% 100%, 0 100%)' }} />
            <p className="text-[12px] font-semibold leading-relaxed" style={{ color: P3R.ink }}>
              尚未配置 AI API。可前往「设置 → AI 总结」配置后获得定制解读；
              或以离线兜底文案完成今日抽卡——将使用牌面描述生成通用解读。
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            尚未配置 AI API。可前往「设置 → AI 总结」配置后获得定制解读；
            或以离线兜底文案完成今日抽卡——将使用牌面描述生成通用解读。
          </div>
        )
      )}

      {/* 动态说明（p3：蓝色大字 + 两侧青双斜杠） */}
      <div className="text-center px-4">
        <h2
          className={
            p3
              ? 'flex items-center justify-center gap-3 text-[19px] font-black tracking-[2px]'
              : p5
                ? 'text-[17px] font-black tracking-[2px]'
                : 'text-sm font-bold text-gray-800 dark:text-gray-100 tracking-[3px]'
          }
          // P5：这行字直接坐在纯黑舞台上，走通用灰系类会被重皮压成黑字（隐形）
          style={p3 ? { color: P3R.blueDeep } : p5 ? { color: '#f0e9df', textShadow: '2px 2px 0 #050505' } : undefined}
        >
          {p3 && <CyanSlashes />}
          <span>
            {phase === 'intro'  && '正在洗牌…'}
            {phase === 'pick'    && '从三张牌中选择一张'}
            {phase === 'flipping' && '揭示命运…'}
            {phase === 'calling'  && (jobText ? '解读者正在落笔' : '正在解读星象…')}
            {phase === 'error'    && '解读遇到了阻碍'}
          </span>
          {p3 && <CyanSlashes />}
        </h2>
        <p
          className={p3 ? 'mt-1.5 text-[12px] font-semibold' : p5 ? 'mt-1.5 text-[12px] font-bold' : 'text-[11px] text-gray-400 dark:text-gray-500 mt-1'}
          style={p3 ? { color: P3R.grey } : p5 ? { color: '#a9a49b' } : undefined}
        >
          {phase === 'intro'   && '今日的星象正在汇聚'}
          {phase === 'pick'    && '每日仅一次，慎重选择'}
          {phase === 'flipping' && '正位 / 逆位皆有意义'}
          {phase === 'calling'  && (thinking && !jobText ? '解读者正在思索，离开这页也不会中断' : '结合您近期的处境')}
          {phase === 'error'    && '可重试 AI 或改用离线兜底'}
        </p>
      </div>

      {/* 主舞台 */}
      <div className="min-h-[280px] flex items-center justify-center">
        {phase === 'intro' && (
          p3 ? (
            <div className="flex w-full flex-col items-center gap-9">
              <ShuffleAnim
                onComplete={() => setPhase('pick')}
                cardWidth={92}
                duration={1800}
              />
              {/* 接入命运：设计稿大梯形 CTA——点击即跳过洗牌直达选牌（流程不变，纯快进） */}
              <button
                type="button"
                onClick={() => setPhase('pick')}
                className="relative block w-[88%] py-4 text-[26px] font-black tracking-[0.18em] active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                style={{ clipPath: 'polygon(8% 0, 100% 0, 92% 100%, 0 100%)', background: '#a5e3f3', color: '#0b2a66' }}
              >
                <span
                  aria-hidden
                  className="absolute left-[9%] top-1/2 h-[22px] w-[24px] -translate-y-1/2"
                  style={{ background: `repeating-linear-gradient(105deg, ${P3R.blue} 0 5px, transparent 5px 12px)` }}
                />
                接入命运
                <span aria-hidden className="absolute bottom-0 right-[7%] h-[9px] w-[22px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
              </button>
            </div>
          ) : (
            <ShuffleAnim
              onComplete={() => setPhase('pick')}
              cardWidth={92}
              duration={1800}
            />
          )
        )}

        {phase === 'pick' && (
          <div className="flex items-center justify-center gap-3 sm:gap-6">
            {candidates.map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30, rotate: -6 + i * 6 }}
                animate={{ opacity: 1, y: 0, rotate: -6 + i * 6 }}
                transition={{ delay: i * 0.12, type: 'spring', damping: 18, stiffness: 200 }}
              >
                <CardBack width={96} onClick={() => handlePick(i)} />
              </motion.div>
            ))}
          </div>
        )}

        {(phase === 'flipping' || phase === 'calling' || phase === 'error') && pickedIndex !== null && candidates[pickedIndex] && (
          <FlipReveal
            candidate={candidates[pickedIndex]}
            revealed={phase !== 'flipping'}
          />
        )}
      </div>

      {/* 思维链阵图 / 流式落笔（v2.7.0.6，用户口径：不能让用户干等） */}
      {streaming && (
        <StreamPanel text={jobText} thinking={thinking} progress={progress} p5={p5} p3={p3} />
      )}
      {/* 截断态：半截解读还在，下面可以「接着写」 */}
      {phase === 'error' && !!jobToday?.truncated && !!jobText && (
        <StreamPanel text={jobText} thinking={false} progress={0} p5={p5} p3={p3} />
      )}

      {/* 错误态：重试选项 */}
      {phase === 'error' && (
        <div className="space-y-3">
          <div
            className={p3 ? 'p-3.5 text-sm font-semibold whitespace-pre-wrap' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl p-3 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap'}
            style={p3 ? { clipPath: slantClip(10), background: 'rgba(240,65,127,0.09)', color: P3R.magenta } : undefined}
          >
            {errorMsg}
          </div>
          <div className="flex gap-2">
            {canContinue && (
              <button
                onClick={handleContinue}
                className={p3 ? 'flex-1 py-3 font-black text-sm text-white' : 'flex-1 py-3 rounded-2xl font-bold text-sm bg-primary text-white shadow-md'}
                style={p3 ? { clipPath: slantClip(10), background: P3R.blue } : undefined}
              >
                接着写
              </button>
            )}
            <button
              onClick={handleRetryAI}
              className={canContinue
                ? (p3 ? 'flex-1 py-3 font-black text-sm' : 'flex-1 py-3 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200')
                : (p3 ? 'flex-1 py-3 font-black text-sm text-white' : 'flex-1 py-3 rounded-2xl font-bold text-sm bg-primary text-white shadow-md')}
              style={p3 ? (canContinue ? { clipPath: slantClip(10), background: '#dcebf4', color: P3R.ink } : { clipPath: slantClip(10), background: P3R.blue }) : undefined}
            >
              {canContinue ? '重新解读' : '重试 AI 解读'}
            </button>
            <button
              onClick={handleTryOffline}
              className={p3 ? 'flex-1 py-3 font-black text-sm' : 'flex-1 py-3 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200'}
              style={p3 ? { clipPath: slantClip(10), background: '#dcebf4', color: P3R.ink } : undefined}
            >
              使用离线兜底
            </button>
          </div>
        </div>
      )}

      {/* 占位：抽牌前展示三张候选的说明栏 */}
      {phase === 'pick' && noApiKey && (
        <div className="flex justify-center">
          <button
            onClick={() => {
              // 未配置 API 的情况下：点击任意卡仍会用离线兜底
            }}
            className="text-xs text-gray-400 dark:text-gray-500 underline"
          >
            未配置 API — 选择任意卡牌将使用离线兜底
          </button>
        </div>
      )}
    </div>
  );
}

// ── 子组件：思维链阵图 / 流式落笔面板 ───────────────────────

function StreamPanel({ text, thinking, progress, p5, p3 }: { text: string; thinking: boolean; progress: number; p5: boolean; p3: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={p5 ? 'text-sm leading-relaxed' : 'rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed min-h-[96px]'}
    >
      <Wrap p5={p5} seed={527}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-primary/80">
            今日运势
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {text ? '落笔中' : thinking ? '思索中' : '解读中'}
          </span>
        </div>
        {text ? (
          <div
            className="prose-sm"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(renderMarkdown(text)),
            }}
          />
        ) : (
          // 思维链阶段：结阵中的魔法阵按预估进度生长；正文第一个字到达即切到上面的流式正文
          <div className="flex justify-center py-2">
            <ThinkingCircle
              variant="pentagram"
              progress={progress}
              size={124}
              color={p3 ? '#1b57ff' : p5 ? '#c00008' : '#d4af37'}
              label={thinking ? '解读者正在思索' : '正在解读星象'}
              textColor={p5 ? '#494540' : undefined}
            />
          </div>
        )}
        {text && (
          <motion.span
            aria-hidden
            animate={{ opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 0.6 }}
            className="inline-block w-0.5 h-4 bg-primary align-middle ml-0.5"
          />
        )}
      </Wrap>
    </motion.div>
  );
}

// ── 子组件：翻牌展示 ───────────────────────────────────────

function FlipReveal({
  candidate,
  revealed,
}: {
  candidate: Candidate;
  revealed: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3" style={{ perspective: 1200 }}>
      <motion.div
        initial={{ rotateY: 0 }}
        animate={{ rotateY: revealed ? 180 : 0 }}
        transition={{ duration: 0.7, ease: 'easeInOut' }}
        style={{ transformStyle: 'preserve-3d', width: 150, height: 240 }}
        className="relative"
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
          <CardBack width={150} hoverable={false} />
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <TarotCardSVG
            card={candidate.card}
            orientation={candidate.orientation}
            width={150}
            staticCard
            showOrientationTag
          />
        </div>
      </motion.div>
      {/* 牌名大字：翻面完成即亮相（逆位追「· 逆位」） */}
      {revealed && (
        <CardNameReveal
          name={candidate.card.name}
          nameEn={candidate.card.nameEn}
          reversed={candidate.orientation === 'reversed'}
          delay={0.1}
        />
      )}
    </div>
  );
}

// ── 子组件：已完成视图 ──────────────────────────────────────

function DoneView({ d }: { d: DailyDivination }) {
  const { settings } = useAppStore(useShallow(s => ({ settings: s.settings })));
  const doneP5 = useUiChannel() === 'p5';
  const card = TAROT_BY_ID[d.cardId];
  if (!card) return null;
  const attrName = settings.attributeNames[d.effect.attribute];
  // 兼容旧记录：若未存 fortune，按规则推断
  const fortune = d.fortune ?? inferFortune(d.cardId, d.orientation);
  const fortuneMeta = FORTUNE_META[fortune];
  const meaning = card[d.orientation];

  return (
    <div className="space-y-5">
      {/* 卡面 — 入场后持续漂浮，带 30% 金色光晕 */}
      <div className="flex justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
            style={{ filter: 'drop-shadow(0 8px 22px rgba(212,175,55,0.30))' }}
          >
            <TarotCardSVG
              card={card}
              orientation={d.orientation}
              width={150}
              staticCard
              showOrientationTag
            />
          </motion.div>
        </motion.div>
      </div>

      {/* 牌名大字（已完成视图同样亮相，逆位追「· 逆位」） */}
      <CardNameReveal
        name={card.name}
        nameEn={card.nameEn}
        reversed={d.orientation === 'reversed'}
        delay={0.18}
      />

      {/* 加成卡：属性 × 倍率 + 一句签语（飘渺、可代入；不是待办） */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border border-amber-200 dark:border-amber-700/50 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0">⚡</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black text-amber-800 dark:text-amber-300">
                {attrName} × {d.effect.multiplier}
              </span>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
                {d.orientation === 'upright' ? '正位' : '逆位'}
              </span>
              {d.source === 'offline' && (
                <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  离线
                </span>
              )}
            </div>
            <div className="text-xs text-amber-700/90 dark:text-amber-400/90 mt-1 leading-relaxed">
              {d.advice}
            </div>
          </div>
        </div>
      </motion.div>

      {/* 本牌含义（硬编码牌意 —— 与 AI 解读分离，方便用户看到这张牌本身代表什么） */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={doneP5 ? '' : 'rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/30 p-4'}
      >
        <Wrap p5={doneP5} seed={521}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-gray-500 dark:text-gray-400">
            本牌含义
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {card.name} · {d.orientation === 'upright' ? '正位' : '逆位'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {meaning.keywords.map((kw, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-gray-900/60 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
            >
              {kw}
            </span>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {meaning.meaning}
        </p>
        {/* 对号入座：写给客人的一段话（tarotReflections），留白让他自己认领 */}
        <p className="mt-2 text-[12.5px] leading-relaxed text-gray-700 dark:text-gray-200">
          {meaning.reflection}
        </p>
        </Wrap>
      </motion.div>

      {/* 今日运势（AI 结合近期处境给出的个性化解读） */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className={doneP5 ? 'text-sm leading-relaxed' : 'rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed'}
      >
        <Wrap p5={doneP5} seed={523}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-primary/80">
            今日运势
          </span>
          {d.source === 'offline' && (
            <span className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              离线
            </span>
          )}
        </div>
        <div
          className="prose-sm"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(renderMarkdown(d.narration)),
          }}
        />
        {/* 解读者手记（d.memo）不外显：只作为之后解读的"上次聊到哪"喂回去（用户口径：内化掉） */}
        </Wrap>
      </motion.div>

      {/* 总体运势 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className={doneP5 ? '' : `rounded-2xl border ${fortuneMeta.borderClass} ${fortuneMeta.bgClass} p-4`}
        style={doneP5 ? undefined : { boxShadow: `0 0 24px ${fortuneMeta.ring}` }}
      >
        <Wrap p5={doneP5} seed={525}>
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-2xl"
            style={{
              background: 'rgba(255,255,255,0.7)',
              boxShadow: `0 0 12px ${fortuneMeta.ring}`,
            }}
          >
            {fortuneMeta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] font-bold uppercase tracking-[2px] ${fortuneMeta.textClass} opacity-70`}>
              总体运势
            </div>
            <div className={`text-2xl font-black ${fortuneMeta.textClass}`} style={{ letterSpacing: 2 }}>
              {fortuneMeta.label}
            </div>
          </div>
        </div>
        </Wrap>
      </motion.div>

      <AnimatePresence>
        {/* 提示语 */}
        <motion.div
          key="tip"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-[10px] text-gray-400 dark:text-gray-500"
        >
          每日一抽，明日再会。
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
