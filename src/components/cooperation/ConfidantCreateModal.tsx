import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useBackHandler } from '@/utils/useBackHandler';
import { matchConfidant, type ConfidantMatchResult } from '@/utils/confidantAI';
import { TAROT_BY_ID } from '@/constants/tarot';
import { INTIMACY_LABELS, MAJOR_ARCANA_IDS, MAX_INTIMACY } from '@/utils/confidantLevels';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';

type Stage =
  | 'basic'        // 模式 + 名字（+ 在线邮箱）
  | 'description'  // 关系描述
  | 'trait'        // 4 个补充性格/相处问题（stageStep 0..3）
  | 'matching'     // AI 正在匹配
  | 'result'       // 展示结果 + 自选等级 + 确认
  | 'error';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  /** 用户在 basic 页点"在线"tab 时的回调 —— 由父组件打开 AddOnlineConfidantModal */
  onPickOnline?: () => void;
}

interface TraitQ {
  question: string;
  short: string;
  options: string[];
}

const TRAIT_QUESTIONS: TraitQ[] = [
  {
    question: 'Ta 给你的整体印象更接近：',
    short: '性格基调',
    options: [
      '温和包容，让人安心',
      '直率有棱角，说话不绕圈',
      '慢热敏感，需要时间打开',
      '情绪丰富，起伏鲜明',
      '稳重克制，什么都先留一手',
    ],
  },
  {
    question: '你们在一起时，你通常感觉：',
    short: '相处压力',
    options: [
      '完全放松，什么都能说',
      '大致轻松，偶有小心翼翼',
      '有些绷着，但依然珍贵',
      '常觉得累，但戒不掉',
      '像在博弈，时时权衡',
    ],
  },
  {
    question: '这段关系里，你更多是：',
    short: '关系位置',
    options: [
      '我更多是给予的那一方',
      '我更多是被陪伴/照顾的一方',
      '相互依赖，彼此撑着',
      '保持距离，但彼此信任',
      '暧昧不定，角色在变',
    ],
  },
  {
    question: '你们已经认识：',
    short: '认识时长',
    options: [
      '不到半年',
      '半年到两年',
      '两到五年',
      '五年以上',
      '很难说清，像是很久了',
    ],
  },
];

export function ConfidantCreateModal({ isOpen, onClose, onCreated, onPickOnline }: Props) {
  const { settings, confidants, addConfidant } = useAppStore();

  const [stage, setStage] = useState<Stage>('basic');
  const [traitStep, setTraitStep] = useState(0);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [traitAnswers, setTraitAnswers] = useState<Array<string | null>>(
    () => TRAIT_QUESTIONS.map(() => null)
  );
  const [decayEnabled, setDecayEnabled] = useState(false);
  const [matchResult, setMatchResult] = useState<ConfidantMatchResult | null>(null);
  const [pickedLevel, setPickedLevel] = useState<number>(1);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStage('basic');
      setTraitStep(0);
      setName('');
      setDescription('');
      setTraitAnswers(TRAIT_QUESTIONS.map(() => null));
      setDecayEnabled(false);
      setMatchResult(null);
      setPickedLevel(1);
      setErr(null);
    }
  }, [isOpen]);

  const takenIds = useMemo(
    () => confidants.filter(c => !c.archivedAt).map(c => c.arcanaId),
    [confidants]
  );
  const remaining = MAJOR_ARCANA_IDS.length - takenIds.length;
  const hasApiKey = Boolean(settings.summaryApiKey?.trim());

  // 流程节点（用于顶部进度圆点）
  const flowSteps = ['basic', 'description', 'trait'] as const;
  const progressIndex: number =
    stage === 'basic' ? 0
    : stage === 'description' ? 1
    : stage === 'trait' ? 2
    : stage === 'matching' || stage === 'result' ? 3
    : 0;

  const handleBack = () => {
    if (stage === 'description') setStage('basic');
    else if (stage === 'trait' && traitStep > 0) setTraitStep(traitStep - 1);
    else if (stage === 'trait' && traitStep === 0) setStage('description');
    else if (stage === 'result') setStage('trait');
    else onClose();
  };

  // Android 返回键：
  //   - matching 阶段（AI 正在匹配）→ 遮罩已显式不响应，back 也 no-op
  //   - 其他阶段 → 走 handleBack，复用组件自己的"返回一步"逻辑（翻页回到上一段）
  useBackHandler(isOpen, () => {
    if (stage === 'matching') return;
    handleBack();
  });

  const basicValid = name.trim().length > 0;
  const descriptionValid = description.trim().length >= 6;

  const handleNextFromBasic = () => {
    if (!basicValid) {
      setErr('请先告诉我 Ta 叫什么名字');
      return;
    }
    setErr(null);
    setStage('description');
  };

  const handleNextFromDescription = () => {
    if (!descriptionValid) {
      setErr('请用至少几个字描述 Ta，让塔罗有内容可参考');
      return;
    }
    if (takenIds.length >= MAJOR_ARCANA_IDS.length) {
      setErr('22 张大阿卡纳都已占用，请先归档一位同伴再添加');
      return;
    }
    setErr(null);
    setStage('trait');
    setTraitStep(0);
  };

  const handleTraitPick = (answer: string) => {
    const next = [...traitAnswers];
    next[traitStep] = answer;
    setTraitAnswers(next);
    // 自动进入下一题
    if (traitStep < TRAIT_QUESTIONS.length - 1) {
      setTraitStep(traitStep + 1);
    } else {
      // 最后一题回答完毕 → 匹配
      void startMatch(next);
    }
  };

  const startMatch = async (answers: Array<string | null>) => {
    setErr(null);
    setStage('matching');
    try {
      let result: ConfidantMatchResult | null = null;
      const traits = TRAIT_QUESTIONS.map((q, i) => ({
        question: q.question,
        answer: answers[i] || '（未选择）',
      }));
      for (let i = 0; i < 3; i++) {
        const r = await matchConfidant({
          settings,
          name: name.trim(),
          description: description.trim(),
          takenArcanaIds: takenIds,
          traits,
        });
        if (!takenIds.includes(r.arcanaId)) {
          result = r;
          break;
        }
      }
      if (!result) throw new Error('未能找到合适的阿卡纳，请调整描述后再试');
      setMatchResult(result);
      setPickedLevel(Math.max(1, result.initialIntimacy));
      setStage('result');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '匹配失败');
      setStage('error');
    }
  };

  const handleConfirm = async () => {
    if (!matchResult) return;
    try {
      const c = await addConfidant({
        name: name.trim(),
        description: description.trim(),
        match: matchResult,
        source: 'offline',
        initialLevel: pickedLevel,
      });
      if (decayEnabled) {
        await useAppStore.getState().updateConfidant(c.id, { decayEnabled: true });
      }
      onCreated?.(c.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
      setStage('error');
    }
  };

  if (!isOpen) return null;

  const resultCard = matchResult ? TAROT_BY_ID[matchResult.arcanaId] : null;
  const accent = resultCard?.accent || '#6366f1';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={stage === 'matching' ? undefined : onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-3xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="relative px-6 pt-6 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {stage !== 'basic' && stage !== 'result' && stage !== 'matching' && (
                  <button
                    onClick={handleBack}
                    className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-sm flex items-center justify-center"
                    aria-label="返回上一步"
                  >‹</button>
                )}
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {stage === 'result' ? '塔罗的回响' : '结识一位同伴'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center"
                aria-label="关闭"
              >✕</button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              剩余阿卡纳：{remaining} / {MAJOR_ARCANA_IDS.length}
            </p>

            {/* 进度圆点 */}
            {stage !== 'result' && stage !== 'matching' && stage !== 'error' && (
              <div className="flex items-center gap-1.5 mt-3">
                {flowSteps.map((s, i) => {
                  const active = i === progressIndex;
                  const done = i < progressIndex;
                  return (
                    <div
                      key={s}
                      className="h-1 flex-1 rounded-full transition-all"
                      style={{
                        background: active
                          ? 'var(--color-primary, #6366f1)'
                          : done
                          ? 'var(--color-primary, #6366f1)'
                          : 'rgba(148,163,184,0.3)',
                        opacity: active ? 1 : done ? 0.6 : 1,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">
              {/* ── 第 1 页：基本信息 ─────────────── */}
              {stage === 'basic' && (
                <motion.div key="basic" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
                  {/* 模式切换：在线（搜 UserID 邀请）/ 离线（本地塔罗匹配，下方流程） */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* 离线（当前选中，灰底突出） */}
                    <button
                      type="button"
                      onClick={() => { /* noop: 离线就是本流程，已在这一页 */ }}
                      className="relative rounded-2xl px-3 py-3 text-left border-2 cursor-default transition-all"
                      style={{
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.06))',
                        borderColor: 'rgba(99,102,241,0.5)',
                        boxShadow: '0 6px 16px -8px rgba(99,102,241,0.45)',
                      }}
                    >
                      {/* 选中角标 */}
                      <span
                        className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white text-[11px] font-black"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
                      >✓</span>
                      <div className="text-xl mb-1">📝</div>
                      <div className="text-sm font-black text-indigo-700 dark:text-indigo-300">离线同伴</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                        本地塔罗匹配<br />身边的人 / 自己的关系
                      </div>
                    </button>

                    {/* 在线（强调卡片，点击后切到 AddOnlineConfidantModal） */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!onPickOnline) return;
                        onPickOnline();
                      }}
                      disabled={!onPickOnline}
                      className="relative rounded-2xl px-3 py-3 text-left border-2 transition-all active:scale-95 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(20,184,166,0.05))',
                        borderColor: 'rgba(16,185,129,0.4)',
                      }}
                    >
                      <div className="text-xl mb-1">🤝</div>
                      <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                        在线同伴
                        <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 align-middle tracking-wider">
                          COOP
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                        按 UserID 邀请<br />缔结双向羁绊
                      </div>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      Ta 的名字 / 称呼
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={20}
                      placeholder="朋友、家人、老师、恋人……"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <label className="flex items-start gap-3 p-3 rounded-xl border border-dashed border-rose-500/30 bg-rose-500/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={decayEnabled}
                      onChange={(e) => setDecayEnabled(e.target.checked)}
                      className="mt-0.5 accent-rose-500"
                    />
                    <div>
                      <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
                        开启「逆流」模式
                      </div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        连续 3 天无互动，亲密度每日 -1。
                      </p>
                    </div>
                  </label>

                  {!hasApiKey && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                      未配置 AI API，将使用离线模式进行匹配
                    </div>
                  )}

                  {err && (
                    <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                      {err}
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleNextFromBasic}
                    disabled={!basicValid}
                    className="w-full py-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm shadow-lg shadow-purple-500/30 disabled:opacity-40"
                  >
                    下一步
                  </motion.button>
                </motion.div>
              )}

              {/* ── 第 2 页：关系描述 ─────────────── */}
              {stage === 'description' && (
                <motion.div key="description" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
                  <div>
                    <div className="text-[10px] font-bold tracking-widest text-gray-400 mb-1">
                      告诉星象
                    </div>
                    <label className="block text-base font-bold text-gray-900 dark:text-white mb-2">
                      你们的关系 / Ta 是什么样的人？
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      maxLength={300}
                      placeholder="比如：一起长大的朋友，总能包容我的不安；最近很忙，但只要我需要，Ta 都会接电话……"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      autoFocus
                    />
                    <p className="text-[10px] text-gray-400 mt-1 text-right">
                      {description.length} / 300
                    </p>
                  </div>

                  {err && (
                    <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                      {err}
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleNextFromDescription}
                    disabled={!descriptionValid}
                    className="w-full py-3 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm shadow-lg shadow-purple-500/30 disabled:opacity-40"
                  >
                    下一步（还有 4 个小问题）
                  </motion.button>
                </motion.div>
              )}

              {/* ── 第 3 页：4 个性格/相处问题（逐题） ─── */}
              {stage === 'trait' && (
                <motion.div key={`trait-${traitStep}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
                  {/* 小圆点：4 题进度 */}
                  <div className="flex justify-center gap-2 mb-1">
                    {TRAIT_QUESTIONS.map((_, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full transition-all"
                        style={{
                          background: traitAnswers[i]
                            ? 'var(--color-primary, #6366f1)'
                            : i === traitStep
                            ? 'var(--color-primary, #6366f1)'
                            : 'rgba(148,163,184,0.3)',
                          transform: i === traitStep ? 'scale(1.3)' : 'scale(1)',
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-gray-400 text-xs text-center">
                    第 {traitStep + 1} / {TRAIT_QUESTIONS.length} 问 · {TRAIT_QUESTIONS[traitStep].short}
                  </p>
                  <p className="text-base font-bold text-gray-900 dark:text-white leading-relaxed text-center">
                    {TRAIT_QUESTIONS[traitStep].question}
                  </p>

                  <div className="space-y-2">
                    {TRAIT_QUESTIONS[traitStep].options.map((option, i) => {
                      const active = traitAnswers[traitStep] === option;
                      return (
                        <motion.button
                          key={i}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleTraitPick(option)}
                          className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                            active
                              ? 'text-indigo-600 dark:text-indigo-300'
                              : 'text-gray-700 dark:text-gray-200'
                          }`}
                          style={{
                            background: active ? 'rgba(99,102,241,0.15)' : 'rgba(148,163,184,0.07)',
                            border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(148,163,184,0.2)'}`,
                          }}
                        >
                          {option}
                        </motion.button>
                      );
                    })}
                  </div>

                  {traitStep > 0 && (
                    <button
                      onClick={() => setTraitStep(traitStep - 1)}
                      className="w-full py-2 text-xs text-gray-500 dark:text-gray-400"
                    >
                      ‹ 上一题
                    </button>
                  )}
                </motion.div>
              )}

              {/* ── 匹配中 ────────────────────────── */}
              {stage === 'matching' && (
                <motion.div key="matching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                    className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
                  >
                    <span className="text-white">✦</span>
                  </motion.div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4">
                    星象正在翻动塔罗……
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    一段关系的倒影，正从 22 张牌里浮现
                  </p>
                </motion.div>
              )}

              {/* ── 结果 + 等级自选 ────────────────── */}
              {stage === 'result' && matchResult && resultCard && (
                <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                  <div className="flex justify-center">
                    <TarotCardSVG
                      card={resultCard}
                      orientation={matchResult.orientation}
                      width={140}
                      staticCard
                    />
                  </div>

                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-900 dark:text-white">
                      《{resultCard.name}》{matchResult.orientation === 'reversed' ? '逆位' : '正位'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 tracking-wider">
                      {resultCard.nameEn}
                    </div>
                    <div className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-bold"
                      style={{ background: `${accent}22`, color: accent }}>
                      星象建议 Lv.{matchResult.initialIntimacy} · {INTIMACY_LABELS[matchResult.initialIntimacy]}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-bold tracking-widest text-gray-400">
                        当前亲密度（由你决定）
                      </div>
                      <div className="text-xs font-bold" style={{ color: accent }}>
                        Lv.{pickedLevel} · {INTIMACY_LABELS[pickedLevel]}
                      </div>
                    </div>
                    <div className="grid grid-cols-10 gap-1">
                      {Array.from({ length: MAX_INTIMACY }, (_, i) => i + 1).map(lv => {
                        const active = pickedLevel === lv;
                        return (
                          <button
                            key={lv}
                            onClick={() => setPickedLevel(lv)}
                            className="h-8 rounded-md text-[11px] font-bold transition-all select-none"
                            style={{
                              background: active ? accent : 'transparent',
                              color: active ? '#fff' : accent,
                              border: `1px solid ${active ? accent : accent + '55'}`,
                            }}
                          >
                            {lv}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2">
                      AI 只给参考，最终等级由你判断。不同等级会立即解锁对应的日常/战斗能力。
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                    <div className="text-[10px] font-bold tracking-widest text-gray-400 mb-2">
                      为什么是这张牌
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                      {matchResult.interpretation}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border border-indigo-500/20">
                    <div className="text-[10px] font-bold tracking-widest text-indigo-500 mb-2">
                      未来
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                      {matchResult.advice}
                    </p>
                  </div>

                  {matchResult.source === 'offline' && (
                    <div className="text-[10px] text-gray-400 text-center">
                      · 本次为离线匹配 ·
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setStage('trait');
                        setTraitStep(TRAIT_QUESTIONS.length - 1);
                      }}
                      className="py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300"
                    >
                      回去改一改
                    </button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleConfirm}
                      className="py-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold shadow-md shadow-purple-500/20"
                    >
                      就是 Ta 了
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* ── 错误 ──────────────────────────── */}
              {stage === 'error' && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-10 text-center space-y-3">
                  <div className="text-3xl">☁</div>
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    {err || '出了点问题'}
                  </p>
                  <button
                    onClick={() => setStage('trait')}
                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    返回修改
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
