import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
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
import { DailyDivination, Fortune, TarotOrientation } from '@/types';
import { CardBack } from './CardBack';
import { TarotCardSVG } from './TarotCardSVG';
import { ShuffleAnim } from './ShuffleAnim';
import { buildDailyRequest, callDailyAI, formatApiError } from '@/utils/tarotAI';
import { buildOfflineDaily } from '@/utils/tarotOffline';
import { renderMarkdown } from '@/utils/markdown';

type Phase =
  | 'init'        // 计算初始态
  | 'intro'       // 尚未抽：洗牌入场
  | 'pick'        // 3 张候选待点
  | 'flipping'    // 选中的牌翻转中
  | 'calling'     // 调用 AI
  | 'done'        // 完成
  | 'error';

interface Candidate {
  card: TarotCardData;
  orientation: TarotOrientation;
}

export function DailyDraw() {
  const { dailyDivination, settings, attributes, saveDailyDivination, getRecentActivitiesForDaily } = useAppStore();

  const [phase, setPhase] = useState<Phase>('init');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const noApiKey = !settings.summaryApiKey;

  // 生成候选（每日塔罗仅用 22 张大阿卡纳）
  const rollCandidates = () => {
    const cards = drawRandomCards(3, MAJOR_ARCANA);
    const list: Candidate[] = cards.map(c => ({
      card: c,
      orientation: randomOrientation(),
    }));
    setCandidates(list);
  };

  // 初始化：若今日已抽直接 done，否则进入 intro
  useEffect(() => {
    if (dailyDivination && dailyDivination.date === toLocalDateKey()) {
      setPhase('done');
      return;
    }
    rollCandidates();
    setPhase('intro');
  }, [dailyDivination?.id]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const handlePick = async (idx: number, useOffline = false) => {
    if (phase !== 'pick') return;
    setPickedIndex(idx);
    setPhase('flipping');

    // 翻牌动画 + 随后请求
    const picked = candidates[idx];
    const orientation = picked.orientation;

    // 等翻牌动画约 700ms 后再发起请求（与 UI 同步）
    await new Promise(r => setTimeout(r, 700));
    setPhase('calling');

    const multiplier = randomBonusMultiplier(orientation);
    let narration = '';
    let advice = '';
    let attribute = picked.card.relatedAttribute ?? 'knowledge';
    let fortune: Fortune = inferFortune(picked.card.id, orientation);
    let source: 'ai' | 'offline' = useOffline ? 'offline' : 'ai';

    try {
      if (useOffline || noApiKey) {
        const offline = buildOfflineDaily(picked.card, orientation);
        narration = offline.narration;
        advice = offline.advice;
        attribute = offline.attribute;
        fortune = offline.fortune;
        source = 'offline';
      } else {
        const req = buildDailyRequest({
          settings,
          attributes,
          card: picked.card,
          orientation,
          recentActivities: getRecentActivitiesForDaily(7),
        });
        const abortCtrl = new AbortController();
        abortRef.current = abortCtrl;
        const result = await callDailyAI(req, abortCtrl.signal, settings.attributeNames);
        narration = result.narration;
        advice = result.advice;
        attribute = result.attribute;
        fortune = result.fortune;
      }
    } catch (e) {
      setErrorMsg(formatApiError(e));
      setPhase('error');
      return;
    }

    const drawn: DailyDivination = {
      id: uuidv4(),
      date: toLocalDateKey(),
      drawnFrom: candidates.map(c => c.card.id),
      pickedIndex: idx,
      cardId: picked.card.id,
      orientation,
      effect: { attribute, multiplier },
      narration,
      advice,
      fortune,
      source,
      createdAt: new Date(),
    };

    await saveDailyDivination(drawn);
    setPhase('done');
  };

  const handleTryOffline = () => {
    if (pickedIndex === null) return;
    setErrorMsg(null);
    void handlePick(pickedIndex, true);
  };

  const handleRetryAI = () => {
    if (pickedIndex === null) return;
    setErrorMsg(null);
    void handlePick(pickedIndex, false);
  };

  // ── 视图 ──────────────────────────────────────────────────

  if (phase === 'init') {
    return <div className="h-64" />;
  }

  if (phase === 'done' && dailyDivination) {
    return <DoneView d={dailyDivination} />;
  }

  return (
    <div className="space-y-5">
      {/* AI 未配置提示 */}
      {noApiKey && (phase === 'intro' || phase === 'pick') && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          尚未配置 AI API。可前往「设置 → AI 总结」配置后获得定制解读；
          或以离线兜底文案完成今日抽卡——将使用牌意关键词生成通用解读。
        </div>
      )}

      {/* 动态说明 */}
      <div className="text-center px-4">
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-[3px]">
          {phase === 'intro'  && '正在洗牌…'}
          {phase === 'pick'    && '从三张牌中选择一张'}
          {phase === 'flipping' && '揭示命运…'}
          {phase === 'calling'  && '正在解读星象…'}
          {phase === 'error'    && '解读遇到了阻碍'}
        </h2>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
          {phase === 'intro'   && '今日的星象正在汇聚'}
          {phase === 'pick'    && '每日仅一次，慎重选择'}
          {phase === 'flipping' && '正位 / 逆位皆有意义'}
          {phase === 'calling'  && '结合您近期的成长轨迹'}
          {phase === 'error'    && '可重试 AI 或改用离线兜底'}
        </p>
      </div>

      {/* 主舞台 */}
      <div className="min-h-[280px] flex items-center justify-center">
        {phase === 'intro' && (
          <ShuffleAnim
            onComplete={() => setPhase('pick')}
            cardWidth={92}
            duration={1800}
          />
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

        {(phase === 'flipping' || phase === 'calling' || phase === 'error') && pickedIndex !== null && (
          <FlipReveal
            candidate={candidates[pickedIndex]}
            revealed={phase !== 'flipping'}
            loading={phase === 'calling'}
          />
        )}
      </div>

      {/* 错误态：重试选项 */}
      {phase === 'error' && (
        <div className="space-y-3">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl p-3 text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
            {errorMsg}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRetryAI}
              className="flex-1 py-3 rounded-2xl font-bold text-sm bg-primary text-white shadow-md"
            >
              重试 AI 解读
            </button>
            <button
              onClick={handleTryOffline}
              className="flex-1 py-3 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200"
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

// ── 子组件：翻牌展示 ───────────────────────────────────────

function FlipReveal({
  candidate,
  revealed,
  loading,
}: {
  candidate: Candidate;
  revealed: boolean;
  loading: boolean;
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
      {loading && (
        <div className="flex items-center gap-2 text-xs text-primary">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
          >◌</motion.span>
          <span>正在解读星象…</span>
        </div>
      )}
    </div>
  );
}

// ── 子组件：已完成视图 ──────────────────────────────────────

function DoneView({ d }: { d: DailyDivination }) {
  const { settings } = useAppStore();
  const card = TAROT_BY_ID[d.cardId];
  if (!card) return null;
  const attrName = settings.attributeNames[d.effect.attribute];
  // 兼容旧记录：若未存 fortune，按规则推断
  const fortune = d.fortune ?? inferFortune(d.cardId, d.orientation);
  const fortuneMeta = FORTUNE_META[fortune];

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

      {/* 加成卡 */}
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
        className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/30 p-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold tracking-[2px] uppercase text-gray-500 dark:text-gray-400">
            本牌含义
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {card.name} · {d.orientation === 'upright' ? '正位' : '逆位'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {card[d.orientation].keywords.map((kw, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-gray-900/60 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
            >
              {kw}
            </span>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          {card[d.orientation].meaning}
        </p>
      </motion.div>

      {/* 今日运势（AI 结合近期活动给出的个性化解读） */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl bg-black/3 dark:bg-white/3 p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed"
      >
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
            __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(d.narration)}</p>`),
          }}
        />
      </motion.div>

      {/* 总体运势 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className={`rounded-2xl border ${fortuneMeta.borderClass} ${fortuneMeta.bgClass} p-4`}
        style={{ boxShadow: `0 0 24px ${fortuneMeta.ring}` }}
      >
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
