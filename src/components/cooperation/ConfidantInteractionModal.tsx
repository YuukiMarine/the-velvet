import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, toLocalDateKey } from '@/store';
import { useCloudStore } from '@/store/cloud';
import type { AttributeId, Confidant } from '@/types';
import { TAROT_BY_ID } from '@/constants/tarot';
import { evaluateInteraction, type InteractionEvalResult } from '@/utils/confidantAI';
import { INTIMACY_LABELS, MAX_INTIMACY } from '@/utils/confidantLevels';
import { triggerSuccessFeedback } from '@/utils/feedback';
import { MusicalNotes } from '@/components/MusicalNotes';
import { useBackHandler } from '@/utils/useBackHandler';

type Stage = 'input' | 'thinking' | 'result' | 'done' | 'error';

const ATTR_ORDER: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const ATTR_ACCENTS: Record<AttributeId, string> = {
  knowledge: '#3B82F6',
  guts: '#EF4444',
  dexterity: '#10B981',
  kindness: '#F59E0B',
  charm: '#EC4899',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  confidant: Confidant | null;
}

const DELTA_LABELS: Record<number, string> = {
  0: '波澜未起',
  1: '日常维系',
  2: '稳稳升温',
  3: '明显推进',
  4: '深度共享',
  5: '关键节点',
};

/**
 * "今日互动" 弹窗：
 * 1. 用户输入今天和 Ta 发生的事
 * 2. AI 判断关系走向 + 给出 0–3 的加点建议
 * 3. 用户可覆盖建议值后确认
 * 4. 可选：同步到"记录"（category = confidant）
 * 5. 一天仅限一次
 */
export function ConfidantInteractionModal({ isOpen, onClose, confidant }: Props) {
  const { settings, recordConfidantInteraction, confidantEvents } = useAppStore();
  const cloudUser = useCloudStore(s => s.cloudUser);
  const [stage, setStage] = useState<Stage>('input');
  const [description, setDescription] = useState('');
  const [evalResult, setEvalResult] = useState<InteractionEvalResult | null>(null);
  const [pickedDelta, setPickedDelta] = useState<number>(1);
  const [syncToActivity, setSyncToActivity] = useState<boolean>(false);
  const [activityAttr, setActivityAttr] = useState<AttributeId | null>(null);
  const [activityPoints, setActivityPoints] = useState<number>(1);

  // Android 返回键：
  //   - thinking 阶段（AI 评估）→ no-op，避免打断生成。
  //     (虽然现有遮罩点击 onClose 不分 stage，但中断 AI 会让用户失去今日仅有的一次互动机会，更保险的做法是屏蔽)
  //   - 其他阶段 → onClose（与点遮罩 / ✕ 同步）
  useBackHandler(isOpen, () => {
    if (stage === 'thinking') return;
    onClose();
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStage('input');
      setDescription('');
      setEvalResult(null);
      setPickedDelta(1);
      setSyncToActivity(false);
      setActivityAttr(null);
      setActivityPoints(1);
      setErr(null);
    }
  }, [isOpen]);

  if (!isOpen || !confidant) return null;

  const card = TAROT_BY_ID[confidant.arcanaId];
  const accent = card?.accent || '#6366f1';
  const alreadyToday = confidant.lastInteractionDate === toLocalDateKey();

  const handleEval = async () => {
    if (!description.trim() || description.trim().length < 4) {
      setErr('请再多描述一点，星象才能照见');
      return;
    }
    setErr(null);
    setStage('thinking');
    try {
      // 最近 2 条"一起做的事"——取用户原话，不包含 AI 解读
      const recentUserInputs = confidantEvents
        .filter(e => e.confidantId === confidant.id && e.type === 'conversation' && typeof e.userInput === 'string' && e.userInput!.trim())
        .slice(0, 2)
        .map(e => ({ date: e.date, text: (e.userInput as string).trim() }));

      // 在线同伴 + 未登录云端 → 不允许走 AI 解读（避免白嫖）。
      // 此时会 fallback 到模板文案，但本地仍然可以记录这次互动。
      const allowAI = confidant.source !== 'online' || !!cloudUser;
      const r = await evaluateInteraction(
        {
          settings,
          confidantName: confidant.name,
          arcanaName: card?.name ?? '塔罗',
          orientation: confidant.orientation,
          currentLevel: confidant.intimacy,
          description: description.trim(),
          relationshipSummary: confidant.description,
          recentUserInputs,
        },
        undefined,
        allowAI,
      );
      setEvalResult(r);
      setPickedDelta(r.delta);
      setStage('result');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI 判断失败');
      setStage('error');
    }
  };

  const handleConfirm = async () => {
    if (!evalResult) return;
    try {
      await recordConfidantInteraction({
        id: confidant.id,
        description: description.trim(),
        delta: pickedDelta,
        narrative: evalResult.narrative,
        advice: evalResult.advice,
        createActivity: syncToActivity,
        activityAttribute: syncToActivity && activityAttr ? activityAttr : undefined,
        activityPoints: syncToActivity && activityAttr ? activityPoints : 0,
      });
      // 复用 TodoComplete / SaveSuccess 那套音符 + 主题化成功反馈
      if (syncToActivity && activityAttr && activityPoints > 0) {
        triggerSuccessFeedback();
      }
      setStage('done');
      // 存在时间：延长 0.6 秒，让粒子和音符播完
      setTimeout(() => {
        onClose();
      }, syncToActivity ? 2600 : 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
      setStage('error');
    }
  };

  // 是否需要在 done 阶段渲染音符：勾选同步 + 选了属性 + ≥1 点
  const showMusicalNotes =
    stage === 'done' && syncToActivity && !!activityAttr && activityPoints > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-3xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800"
               style={{ background: `linear-gradient(135deg, ${accent}18, transparent)` }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  今日与 {confidant.name} 的互动
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  《{card?.name}》{confidant.orientation === 'reversed' ? '逆位' : '正位'} · Lv.{confidant.intimacy} · 每日一次
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center"
                aria-label="关闭"
              >✕</button>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {alreadyToday && stage === 'input' && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
                今天已经记录过和 Ta 的互动了。同一天反复加点容易失真，明天再来吧。
              </div>
            )}

            {/* 在线同伴 + 未登录 → AI 走不起来；明确告诉用户 */}
            {confidant.source === 'online' && !cloudUser && stage === 'input' && (
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-700 dark:text-sky-300 leading-relaxed">
                这是一位在线同伴 —— 需要登录云端后才能让 AI 读懂你们之间的互动。
                <span className="opacity-70"> 当前会退回到通用模板记录，不会调 AI。</span>
              </div>
            )}

            <AnimatePresence mode="wait">
              {stage === 'input' && (
                <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      今天和 Ta 做了什么？发生了什么？
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      maxLength={400}
                      disabled={alreadyToday}
                      placeholder="可以很具体——一起吃了什么饭、聊了什么话题、Ta 说了一句让你印象深刻的话…… 也可以写下一次小小的矛盾。"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary/30 resize-none disabled:opacity-50"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 text-right">
                      {description.length} / 400
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 space-y-2.5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncToActivity}
                        onChange={(e) => {
                          setSyncToActivity(e.target.checked);
                          if (!e.target.checked) setActivityAttr(null);
                        }}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-gray-700 dark:text-gray-200">
                          同步到「记录」（带「同伴」标签）
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          会在记录列表里生成一条专属条目；可选择将这次相处经验换算为某一属性的加点（最多 +3）。
                        </p>
                      </div>
                    </label>

                    <AnimatePresence>
                      {syncToActivity && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden pl-7 space-y-2"
                        >
                          <div className="text-[10px] font-bold tracking-widest text-gray-400">
                            选择加点属性（可不选）
                          </div>
                          <div className="grid grid-cols-5 gap-1">
                            {ATTR_ORDER.map(id => {
                              const name = settings.attributeNames[id] ?? id;
                              const active = activityAttr === id;
                              const color = ATTR_ACCENTS[id];
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => setActivityAttr(active ? null : id)}
                                  className="py-1.5 rounded-md text-[11px] font-bold transition-all"
                                  style={{
                                    background: active ? color : 'transparent',
                                    color: active ? '#fff' : color,
                                    border: `1px solid ${active ? color : color + '44'}`,
                                  }}
                                >
                                  {name}
                                </button>
                              );
                            })}
                          </div>
                          <AnimatePresence>
                            {activityAttr && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-gray-500 dark:text-gray-400">加点</span>
                                  <div className="flex gap-1">
                                    {[1, 2, 3].map(n => {
                                      const active = activityPoints === n;
                                      const color = ATTR_ACCENTS[activityAttr];
                                      return (
                                        <button
                                          key={n}
                                          type="button"
                                          onClick={() => setActivityPoints(n)}
                                          className="w-9 h-7 rounded-md text-xs font-bold transition-all"
                                          style={{
                                            background: active ? color : 'transparent',
                                            color: active ? '#fff' : color,
                                            border: `1px solid ${active ? color : color + '55'}`,
                                          }}
                                        >
                                          +{n}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {err && (
                    <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                      {err}
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleEval}
                    disabled={alreadyToday || !description.trim()}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm shadow-lg disabled:opacity-40"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 8px 24px -10px ${accent}80` }}
                  >
                    解读这一段
                  </motion.button>
                </motion.div>
              )}

              {stage === 'thinking' && (
                <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
                    className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-3xl"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}
                  >
                    <span className="text-white">✧</span>
                  </motion.div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4">
                    水晶球散发出了淡蓝色的微光……
                  </p>
                </motion.div>
              )}

              {stage === 'result' && evalResult && (
                <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {/* AI 解读 */}
                  <div
                    className="p-4 rounded-xl border"
                    style={{ background: `${accent}08`, borderColor: `${accent}33` }}
                  >
                    <div className="text-[10px] font-bold tracking-widest mb-2" style={{ color: accent }}>
                      解读
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                      {evalResult.narrative}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                    <div className="text-[10px] font-bold tracking-widest text-gray-400 mb-2">
                      未来
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                      {evalResult.advice}
                    </p>
                  </div>

                  {/* 加点选择（0–3） */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold tracking-widest text-gray-400">
                        建议加点（可调整）
                      </span>
                      <span className="text-xs font-bold" style={{ color: accent }}>
                        {confidant.intimacy < MAX_INTIMACY
                          ? `+${pickedDelta} · ${DELTA_LABELS[pickedDelta]}`
                          : '已达圆满'}
                      </span>
                    </div>
                    <div className="grid grid-cols-6 gap-1.5">
                      {[0, 1, 2, 3, 4, 5].map(n => {
                        const active = pickedDelta === n;
                        const isAI = evalResult.delta === n;
                        return (
                          <button
                            key={n}
                            onClick={() => setPickedDelta(n)}
                            className="py-2.5 rounded-lg text-sm font-bold transition-all select-none"
                            style={{
                              background: active ? accent : 'transparent',
                              color: active ? '#fff' : accent,
                              border: `1.5px solid ${active ? accent : accent + '55'}`,
                            }}
                          >
                            +{n}
                            {isAI && (
                              <span className="block text-[8px] font-normal mt-0.5 opacity-80 whitespace-nowrap">
                                AI 荐
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2">
                      {INTIMACY_LABELS[confidant.intimacy]}（当前）{confidant.intimacy < MAX_INTIMACY ? ` → Lv.${confidant.intimacy} + ${pickedDelta} 点` : ''}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 space-y-2.5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={syncToActivity}
                        onChange={(e) => {
                          setSyncToActivity(e.target.checked);
                          if (!e.target.checked) setActivityAttr(null);
                        }}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-gray-700 dark:text-gray-200">
                          同步到「记录」（带「同伴」标签）
                        </div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          勾选后可选任一属性加 1–3 点，确认时会有音符弹起～
                        </p>
                      </div>
                    </label>
                    <AnimatePresence>
                      {syncToActivity && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden pl-7 space-y-2"
                        >
                          <div className="grid grid-cols-5 gap-1">
                            {ATTR_ORDER.map(id => {
                              const name = settings.attributeNames[id] ?? id;
                              const active = activityAttr === id;
                              const color = ATTR_ACCENTS[id];
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => setActivityAttr(active ? null : id)}
                                  className="py-1.5 rounded-md text-[11px] font-bold transition-all"
                                  style={{
                                    background: active ? color : 'transparent',
                                    color: active ? '#fff' : color,
                                    border: `1px solid ${active ? color : color + '44'}`,
                                  }}
                                >
                                  {name}
                                </button>
                              );
                            })}
                          </div>
                          {activityAttr && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 dark:text-gray-400">加点</span>
                              <div className="flex gap-1">
                                {[1, 2, 3].map(n => {
                                  const active = activityPoints === n;
                                  const color = ATTR_ACCENTS[activityAttr];
                                  return (
                                    <button
                                      key={n}
                                      type="button"
                                      onClick={() => setActivityPoints(n)}
                                      className="w-9 h-7 rounded-md text-xs font-bold transition-all"
                                      style={{
                                        background: active ? color : 'transparent',
                                        color: active ? '#fff' : color,
                                        border: `1px solid ${active ? color : color + '55'}`,
                                      }}
                                    >
                                      +{n}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setStage('input')}
                      className="py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300"
                    >
                      修改描述
                    </button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleConfirm}
                      className="py-2.5 rounded-xl text-white text-sm font-bold shadow-md"
                      style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
                    >
                      就这样记下
                    </motion.button>
                  </div>

                  {evalResult.source === 'offline' && (
                    <div className="text-[10px] text-gray-400 text-center">· 本次为离线评估 ·</div>
                  )}
                </motion.div>
              )}

              {stage === 'done' && (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-10 text-center space-y-3 relative">
                  {/* 背景辐射粒子 */}
                  <DoneSparkles accent={accent} />

                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 10, stiffness: 200 }}
                    className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-3xl text-white relative z-10"
                    style={{
                      background: accent,
                      boxShadow: `0 0 0 0 ${accent}55`,
                    }}
                  >
                    ✓
                    {/* 脉冲光环 */}
                    <motion.span
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ border: `2px solid ${accent}` }}
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 1.4, ease: 'easeOut', repeat: 1, repeatDelay: 0.2 }}
                    />
                  </motion.div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 relative z-10">
                    今日的这一页被写进了你们的故事里
                  </p>
                  {syncToActivity && activityAttr && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 relative z-10">
                      ♪ {settings.attributeNames[activityAttr] ?? activityAttr} +{activityPoints}
                    </p>
                  )}
                </motion.div>
              )}

              {stage === 'error' && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center space-y-3">
                  <div className="text-3xl">☁</div>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{err || '出了点问题'}</p>
                  <button
                    onClick={() => setStage('input')}
                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium"
                  >
                    返回重试
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* 音符动画（复用 MusicalNotes）：同步到记录且选择了属性时触发，数量 = 加点数 */}
        {showMusicalNotes && (
          <MusicalNotes count={activityPoints} delay={0.3} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * 成功页背景粒子：从中心向四周辐射 12 粒，带主题 accent 色晕。
 */
function DoneSparkles({ accent }: { accent: string }) {
  const particles = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const r = 70 + (i % 3) * 14;
    return {
      id: i,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      size: 4 + (i % 3) * 2,
      delay: 0.05 + (i % 4) * 0.08,
      glyph: i % 3 === 0 ? '✦' : i % 3 === 1 ? '✧' : '·',
    };
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      {particles.map(p => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-1/2 select-none"
          style={{
            color: accent,
            fontSize: p.size * 2.2,
            textShadow: `0 0 6px ${accent}cc`,
            translate: '-50% -50%',
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{
            x: [0, p.x * 0.3, p.x],
            y: [0, p.y * 0.3, p.y],
            opacity: [0, 1, 0],
            scale: [0, 1.4, 0.6],
          }}
          transition={{
            duration: 1.8,
            delay: p.delay,
            times: [0, 0.4, 1],
            ease: 'easeOut',
          }}
        >
          {p.glyph}
        </motion.span>
      ))}
    </div>
  );
}
