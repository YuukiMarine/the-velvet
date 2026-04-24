/**
 * COOP AI 匹配 modal —— 仿离线"问答 + 星象推荐"流程，
 * 给出推荐的塔罗 / 正逆位 / 初始亲密度 / 解读，让用户一键应用到 propose / accept 表单。
 *
 * 工作流：
 *   1. description（你眼中的 Ta）
 *   2. 4 道补充问题
 *   3. 匹配中（AI 调用）
 *   4. 结果展示 → "用这个" 把结果返给父组件
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import { matchConfidant } from '@/utils/confidantAI';
import { TAROT_BY_ID } from '@/constants/tarot';
import { INTIMACY_LABELS, getArcanaAttribute } from '@/utils/confidantLevels';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';
import type { AttributeId, AttributeNames } from '@/types';
import type { ArcanaPickerValue } from './ArcanaPickerForm';
import type { ConfidantMatchResult } from '@/utils/confidantAI';

const ATTR_ORDER: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 对方昵称，用于 prompt 上下文 */
  targetName: string;
  /** 用户已占用的阿卡纳（不能选这些） */
  takenArcanaIds: string[];
  /** 用户自定义的五维属性名（用于属性按钮标签） */
  attributeNames: AttributeNames;
  /** 结果屏"用这个" —— 回传完整的选项值（含属性 / 留一句话），父组件直接走提交 */
  onApply: (value: ArcanaPickerValue) => void;
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

type Stage = 'description' | 'trait' | 'matching' | 'result' | 'error';

export function CoopAiMatchModal({ isOpen, onClose, targetName, takenArcanaIds, attributeNames, onApply }: Props) {
  const settings = useAppStore(s => s.settings);

  const [stage, setStage] = useState<Stage>('description');
  const [traitStep, setTraitStep] = useState(0);
  const [description, setDescription] = useState('');
  const [traitAnswers, setTraitAnswers] = useState<Array<string | null>>(
    () => TRAIT_QUESTIONS.map(() => null),
  );
  const [matchResult, setMatchResult] = useState<ConfidantMatchResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickedLevel, setPickedLevel] = useState(1);
  // 能力加成属性：AI 不返回，默认跟随塔罗花色；用户可改
  const [skillAttribute, setSkillAttribute] = useState<AttributeId>('knowledge');
  // 独立的"留一句话"（给对方看，和给 AI 参考的 description 不是一个东西）
  const [userMessage, setUserMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setStage('description');
    setTraitStep(0);
    setDescription('');
    setTraitAnswers(TRAIT_QUESTIONS.map(() => null));
    setMatchResult(null);
    setErr(null);
    setPickedLevel(1);
    setSkillAttribute('knowledge');
    setUserMessage('');
  }, [isOpen]);

  const hasApiKey = useMemo(() => Boolean(settings.summaryApiKey?.trim()), [settings]);

  const startMatch = async (answers: Array<string | null>) => {
    setErr(null);
    setStage('matching');
    try {
      const traits = TRAIT_QUESTIONS.map((q, i) => ({
        question: q.question,
        answer: answers[i] || '（未选择）',
      }));
      let result: ConfidantMatchResult | null = null;
      for (let i = 0; i < 3; i++) {
        const r = await matchConfidant({
          settings,
          name: targetName,
          description: description.trim(),
          takenArcanaIds,
          traits,
        });
        if (!takenArcanaIds.includes(r.arcanaId)) {
          result = r;
          break;
        }
      }
      if (!result) throw new Error('未能找到合适的阿卡纳，请调整描述后再试');
      setMatchResult(result);
      setPickedLevel(Math.max(1, result.initialIntimacy || 1));
      // 能力属性默认跟随塔罗花色（AI 推荐，用户可改）
      setSkillAttribute(getArcanaAttribute(result.arcanaId));
      setStage('result');
    } catch (e) {
      setErr(e instanceof Error ? e.message : '匹配失败');
      setStage('error');
    }
  };

  const handleTraitPick = (answer: string) => {
    const next = [...traitAnswers];
    next[traitStep] = answer;
    setTraitAnswers(next);
    if (traitStep < TRAIT_QUESTIONS.length - 1) {
      setTraitStep(traitStep + 1);
    } else {
      void startMatch(next);
    }
  };

  const handleApply = () => {
    if (!matchResult) return;
    onApply({
      arcanaId: matchResult.arcanaId,
      orientation: matchResult.orientation,
      intimacyLevel: pickedLevel,
      skillAttribute,
      message: userMessage,
    });
    onClose();
  };

  if (!isOpen) return null;

  const card = matchResult ? TAROT_BY_ID[matchResult.arcanaId] : null;
  const accent = card?.accent || '#6366f1';
  const descriptionValid = description.trim().length >= 6;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[210] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={stage === 'matching' ? undefined : onClose}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[92vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div
            className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(99,102,241,0.04))',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.4em] font-bold text-purple-500">
              ✨ STAR MATCH · 星象匹配
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                星象为 {targetName} 推演一张塔罗
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={stage === 'matching'}
              className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center disabled:opacity-40"
              aria-label="关闭"
            >✕</button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            <AnimatePresence mode="wait">
              {stage === 'description' && (
                <motion.div key="desc" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
                  <div>
                    <div className="text-[10px] font-bold tracking-widest text-gray-400 mb-1">
                      告诉星象 · 只给 AI 参考
                    </div>
                    <label className="block text-base font-bold text-gray-900 dark:text-white mb-2">
                      你眼中的 {targetName} 是怎样的人？
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      maxLength={300}
                      placeholder="比如：跟我一起十年的朋友，会在我说不出话的夜里发一段没头没尾的语音……"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      autoFocus
                    />
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[10px] text-gray-400 leading-snug">
                        这段不会发给对方，只用来推荐塔罗。<br />对方看到的"留一句话"在结果页填。
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {description.length} / 300
                      </p>
                    </div>
                  </div>

                  {!hasApiKey && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                      未配置 AI API，将使用离线模式进行匹配
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setErr(null); setStage('trait'); setTraitStep(0); }}
                    disabled={!descriptionValid}
                    className="w-full py-3 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-purple-500/30 disabled:opacity-40"
                  >
                    {descriptionValid ? '下一步（4 个小问题）' : '至少几个字，让塔罗有内容可参考'}
                  </motion.button>
                </motion.div>
              )}

              {stage === 'trait' && (
                <motion.div key={`trait-${traitStep}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
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

              {stage === 'matching' && (
                <motion.div key="matching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                    className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-3xl"
                    style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)' }}
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

              {stage === 'result' && matchResult && card && (
                <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                  <div className="flex justify-center">
                    <TarotCardSVG card={card} orientation={matchResult.orientation} width={120} staticCard />
                  </div>

                  <div className="text-center">
                    <div className="text-base font-bold text-gray-900 dark:text-white">
                      《{card.name}》{matchResult.orientation === 'reversed' ? '逆位' : '正位'}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5 tracking-wider">
                      {card.nameEn}
                    </div>
                    <div className="mt-2 inline-block px-3 py-1 rounded-full text-[11px] font-bold"
                      style={{ background: `${accent}22`, color: accent }}>
                      星象建议起点 Lv.{matchResult.initialIntimacy} · {INTIMACY_LABELS[matchResult.initialIntimacy]}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                    <div className="text-[10px] font-bold tracking-widest text-gray-400 mb-1">
                      为什么是这张牌
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">
                      {matchResult.interpretation}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border border-indigo-500/20">
                    <div className="text-[10px] font-bold tracking-widest text-indigo-500 mb-1">
                      未来
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">
                      {matchResult.advice}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[10px] font-bold tracking-widest text-gray-400">
                        起点羁绊（你最终决定）
                      </div>
                      <div className="text-[11px] font-bold" style={{ color: accent }}>
                        Lv.{pickedLevel}
                      </div>
                    </div>
                    <div className="grid grid-cols-10 gap-1">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map(lv => {
                        const active = pickedLevel === lv;
                        return (
                          <button
                            key={lv}
                            onClick={() => setPickedLevel(lv)}
                            className="h-7 rounded-md text-[10px] font-bold transition-all select-none"
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
                  </div>

                  {/* 能力加成属性 —— 默认跟随塔罗花色（AI 推荐），可改 */}
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[10px] font-bold tracking-widest text-gray-400">
                        能力加成属性
                      </div>
                      <div className="text-[10px] text-gray-400">
                        默认来自塔罗花色
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {ATTR_ORDER.map(id => {
                        const active = skillAttribute === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSkillAttribute(id)}
                            className="py-1.5 rounded-md text-[11px] font-bold transition-all select-none"
                            style={{
                              background: active ? accent : 'transparent',
                              color: active ? '#fff' : accent,
                              border: `1px solid ${active ? accent : accent + '55'}`,
                            }}
                          >
                            {attributeNames[id]?.slice(0, 4) || id}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                      Lv2 日常加点、Lv7 战斗固伤、Lv10 SP 道具都会指向这个属性。
                    </p>
                  </div>

                  {/* 留一句话 —— 给对方看（和上一页告诉星象的"关系描述"是两回事） */}
                  <div>
                    <label className="block text-[10px] font-bold tracking-widest text-gray-500 mb-1">
                      留一句话（给对方看，可选，≤ 200 字）
                    </label>
                    <textarea
                      value={userMessage}
                      onChange={(e) => setUserMessage(e.target.value.slice(0, 200))}
                      rows={2}
                      placeholder={`想对 ${targetName} 说的话……`}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                    />
                    <div className="text-right text-[10px] text-gray-400 mt-0.5">
                      {userMessage.length} / 200
                    </div>
                  </div>

                  {matchResult.source === 'offline' && (
                    <div className="text-[10px] text-gray-400 text-center">
                      · 本次为离线匹配 ·
                    </div>
                  )}
                </motion.div>
              )}

              {stage === 'error' && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center space-y-3">
                  <div className="text-3xl">☁</div>
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    {err || '出了点问题'}
                  </p>
                  <button
                    onClick={() => { setStage('description'); setErr(null); }}
                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    回去改一改
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          {stage === 'result' && matchResult && (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-2">
              <button
                onClick={() => { setStage('description'); setMatchResult(null); }}
                className="py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
              >
                重新匹配
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleApply}
                className="py-2.5 rounded-xl text-xs font-bold text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)' }}
              >
                就用这份 ✨
              </motion.button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
