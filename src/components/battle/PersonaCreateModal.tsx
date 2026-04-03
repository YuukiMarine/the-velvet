import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { Persona, BattleState, AttributeId } from '@/types';
import { generatePersonaSkills } from '@/utils/battleAI';
import { triggerSuccessFeedback, playSound } from '@/utils/feedback';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Stage = 'intro' | 'choice' | 'text' | 'generating' | 'reveal';

const ATTR_ORDER: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const CHOICE_QUESTIONS = [
  {
    question: '对于人生，你认为：',
    options: [
      '人生是一场修行，每次经历都是成长的磨砺',
      '人生是一场探险，未知才是最大的魅力',
      '人生是一份责任，对自己和他人都要负责',
      '人生是一段旅程，重要的是沿途的风景和同行的人',
      '人生是一面镜子，你投入什么就得到什么',
    ],
  },
  {
    question: '在人群中，你通常：',
    options: [
      '是推动事情发展的核心，引领方向',
      '默默观察，在关键时刻给出精准建议',
      '连接不同的人，调节气氛，让大家融为一体',
      '专注于自己的事，保持独立与清醒',
      '寻找志同道合的人，追求深度连接',
    ],
  },
  {
    question: '面对过去，你倾向于：',
    options: [
      '从失败和挫折中汲取力量，化为前进的动力',
      '珍视美好的记忆，让它们温暖当下的每一刻',
      '坦然接受，好的坏的都造就了现在的自己',
      '有些遗憾，但也无怨无悔，坚定向前',
      '希望改变某些事，因此更加珍惜现在的每个选择',
    ],
  },
  {
    question: '对于未来，你持有：',
    options: [
      '坚定的信念，目标清晰，步步为营',
      '开放的心态，享受未知带来的一切可能',
      '期待与担忧并存，但相信自己能够面对',
      '专注当下，相信未来自然会到来',
      '理想主义的憧憬，相信世界可以因自己而变得更好',
    ],
  },
];

const TEXT_QUESTION = '描述你至今最核心的特质——那些让你最受赞扬、令你自己也感到骄傲的品质：';

export function PersonaCreateModal({ isOpen, onClose }: Props) {
  const { settings, savePersona, saveBattleState, battleState, user } = useAppStore();

  const hasApi = !!settings.summaryApiKey;

  const [stage, setStage] = useState<Stage>('intro');
  const [choiceStep, setChoiceStep] = useState(0);
  const [choiceAnswers, setChoiceAnswers] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState('');
  const [error, setError] = useState('');
  const [generatedPersona, setGeneratedPersona] = useState<Persona | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState(false);

  const reset = () => {
    setStage('intro');
    setChoiceStep(0);
    setChoiceAnswers([]);
    setTextAnswer('');
    setError('');
    setGeneratedPersona(null);
    setFallbackWarning(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleChoiceSelect = (option: string) => {
    const newAnswers = [...choiceAnswers, option];
    setChoiceAnswers(newAnswers);
    if (choiceStep < 3) {
      setChoiceStep(choiceStep + 1);
    } else {
      setStage('text');
    }
  };

  const generateAndSave = async (dialog: string[]) => {
    setStage('generating');
    setError('');
    try {
      const attrNamesTyped = settings.attributeNames as Record<AttributeId, string>;

      const { personaName, skills, attributePersonas, usedFallback } = await generatePersonaSkills(
        settings,
        user?.name ?? '觉醒者',
        attrNamesTyped,
        dialog
      );

      const persona: Persona = {
        id: uuidv4(),
        name: personaName,
        description: attributePersonas.knowledge?.description,
        attributePersonas,
        equippedMaskAttribute: null,
        createdViaAI: !usedFallback,
        skills,
        createdAt: new Date(),
      };
      await savePersona(persona);

      if (!battleState) {
        const bs: BattleState = {
          id: 'current',
          shadowId: '',
          personaId: persona.id,
          playerHp: settings.battlePlayerMaxHp ?? 8,
          playerMaxHp: settings.battlePlayerMaxHp ?? 8,
          sp: 0,
          totalSpEarned: 0,
          battleLog: [],
          status: 'idle',
          shadowsDefeated: 0,
        };
        await saveBattleState(bs);
      }

      if (usedFallback) setFallbackWarning(true);
      triggerSuccessFeedback();
      playSound('/battle-evoker-summon.mp3');
      setGeneratedPersona(persona);
      setStage('reveal');
    } catch {
      setError('召唤失败，请重试');
      setStage('text');
    }
  };

  const handleTextSubmit = async () => {
    if (!textAnswer.trim()) return;
    const dialog = [
      ...CHOICE_QUESTIONS.map((q, i) => `问：${q.question}\n答：${choiceAnswers[i]}`),
      `问：${TEXT_QUESTION}\n答：${textAnswer.trim()}`,
    ];
    await generateAndSave(dialog);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 100%)',
              border: '1px solid rgba(139,92,246,0.4)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div className="p-6">
              {/* Generating */}
              {stage === 'generating' && (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent mx-auto mb-4"
                  />
                  <p className="text-purple-300 text-sm">Persona 正在觉醒……</p>
                  <p className="text-white/30 text-xs mt-2">五灵具现，汝之分身降临</p>
                  <p className="text-white/20 text-xs mt-3">觉醒仪式需要 30~40 秒…请保持你的决心</p>
                </div>
              )}

              {/* Reveal — Persona generation complete */}
              {stage === 'reveal' && generatedPersona && (() => {
                const attrNames = settings.attributeNames as Record<string, string>;
                const sparkles = Array.from({ length: 12 }, (_, i) => ({
                  id: i,
                  angle: (i / 12) * 360,
                  dist: 80 + Math.random() * 60,
                  delay: Math.random() * 0.5,
                }));
                return (
                  <div className="relative py-4">
                    {/* Background sparkle particles */}
                    {sparkles.map(sp => (
                      <motion.div
                        key={sp.id}
                        className="absolute w-1.5 h-1.5 rounded-full"
                        style={{
                          left: '50%', top: '30%',
                          background: 'rgba(167,139,250,0.8)',
                          boxShadow: '0 0 6px rgba(167,139,250,0.6)',
                        }}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                        animate={{
                          x: Math.cos(sp.angle * Math.PI / 180) * sp.dist,
                          y: Math.sin(sp.angle * Math.PI / 180) * sp.dist,
                          opacity: [0, 1, 0],
                          scale: [0, 1.5, 0],
                        }}
                        transition={{ duration: 1.8, delay: sp.delay, ease: 'easeOut' }}
                      />
                    ))}

                    {/* Header */}
                    <div className="text-center mb-5 relative z-10">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                        className="text-4xl mb-2 inline-block"
                      >
                        ✦
                      </motion.div>
                      <motion.h2
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-xl font-black text-white"
                      >
                        Persona 觉醒完毕
                      </motion.h2>
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-purple-300 text-sm mt-1"
                      >
                        五灵具现，反抗之力觉醒
                      </motion.p>
                    </div>

                    {/* 5 Persona entries */}
                    <div className="space-y-2.5 relative z-10">
                      {ATTR_ORDER.map((attr, i) => {
                        const ap = generatedPersona.attributePersonas?.[attr];
                        if (!ap) return null;
                        return (
                          <motion.div
                            key={attr}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.15, type: 'spring', stiffness: 200, damping: 20 }}
                            className="rounded-xl px-4 py-3"
                            style={{
                              background: 'rgba(139,92,246,0.08)',
                              border: '1px solid rgba(139,92,246,0.2)',
                            }}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold tracking-widest uppercase text-purple-400/60">
                                {attrNames[attr] ?? attr}
                              </span>
                            </div>
                            <p className="text-purple-200 font-bold text-sm">
                              ✦ {ap.name}
                            </p>
                            <p className="text-white/50 text-xs mt-0.5 leading-relaxed">
                              {ap.description}
                            </p>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Fallback warning */}
                    {fallbackWarning && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.0 }}
                        className="text-center text-amber-400/80 text-xs mt-4 leading-relaxed"
                      >
                        AI 召唤未能成功，已使用默认 Persona。你可以稍后在设置中检查 API 配置后重新召唤。
                      </motion.p>
                    )}

                    {/* Motivational text */}
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1.2 }}
                      className="text-center text-white/40 text-xs mt-5 italic"
                    >
                      {fallbackWarning ? '默认五灵已就位，征途仍将继续。' : '五灵已集，新的征途即将开启。'}
                    </motion.p>

                    {/* Dismiss button */}
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.4 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => { reset(); onClose(); }}
                      className="w-full mt-5 py-3 rounded-xl font-bold text-white text-sm"
                      style={{
                        background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                        boxShadow: '0 4px 15px rgba(124,58,237,0.4)',
                      }}
                    >
                      开始征途
                    </motion.button>
                  </div>
                );
              })()}

              {/* Intro */}
              {stage === 'intro' && (
                <div className="space-y-6">
                  <div className="text-center py-4">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <p className="text-white font-black text-2xl leading-relaxed">
                        吾即是汝，
                      </p>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                    >
                      <p
                        className="font-black text-2xl leading-relaxed"
                        style={{
                          background: 'linear-gradient(90deg, #c4b5fd, #fbbf24)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}
                      >
                        汝即是吾……
                      </p>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                      className="mt-3"
                    >
                      <div
                        className="mx-auto"
                        style={{
                          width: 80,
                          height: 1,
                          background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.8), transparent)',
                        }}
                      />
                      <p className="text-white/40 text-xs mt-3 leading-relaxed">
                        回答五个问题，觉醒你内心的五灵 Persona
                      </p>
                    </motion.div>
                  </div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9 }}
                  >
                    {!hasApi && (
                      <p className="text-amber-400/80 text-xs text-center leading-relaxed px-2">
                        请先在设置中配置 AI API Key 以召唤 Persona
                      </p>
                    )}
                    <button
                      onClick={() => { if (!hasApi) return; playSound('/battle-persona-get.mp3'); setStage('choice'); }}
                      disabled={!hasApi}
                      className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5)' }}
                    >
                      ✨ 觉醒 Persona
                    </button>
                  </motion.div>
                </div>
              )}

              {/* Choice questions */}
              {stage === 'choice' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-white">✦ 召唤 Persona</h2>
                    <button
                      onClick={handleClose}
                      className="text-gray-500 text-sm hover:text-gray-300"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex gap-2 justify-center">
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full transition-all"
                        style={{
                          background: i <= choiceStep ? '#8b5cf6' : 'rgba(255,255,255,0.2)',
                          transform: i === choiceStep ? 'scale(1.3)' : 'scale(1)',
                        }}
                      />
                    ))}
                  </div>

                  <p className="text-gray-400 text-xs text-center">第 {choiceStep + 1}/4 问</p>
                  <p className="text-white text-sm font-medium leading-relaxed">
                    {CHOICE_QUESTIONS[choiceStep].question}
                  </p>

                  <div className="space-y-2">
                    {CHOICE_QUESTIONS[choiceStep].options.map((option, i) => (
                      <motion.button
                        key={i}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleChoiceSelect(option)}
                        className="w-full text-left px-4 py-3 rounded-xl text-sm text-gray-200 transition-all"
                        style={{
                          background: 'rgba(255,255,255,0.07)',
                          border: '1px solid rgba(139,92,246,0.2)',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.2)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.5)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(139,92,246,0.2)';
                        }}
                      >
                        {option}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Text question */}
              {stage === 'text' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-bold text-white">✦ 最后一问</h2>
                    <button
                      onClick={handleClose}
                      className="text-gray-500 text-sm hover:text-gray-300"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-1">
                    {choiceAnswers.map((answer, i) => (
                      <div
                        key={i}
                        className="px-3 py-1.5 rounded-lg text-xs text-gray-400"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        Q{i + 1}: {answer}
                      </div>
                    ))}
                  </div>

                  <p className="text-white text-sm font-medium leading-relaxed">{TEXT_QUESTION}</p>
                  <textarea
                    value={textAnswer}
                    onChange={e => setTextAnswer(e.target.value)}
                    placeholder="输入你的回答…"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                  />
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setStage('choice'); setChoiceStep(3); }}
                      className="py-2 px-4 rounded-xl text-gray-300 text-sm"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      返回
                    </button>
                    <button
                      onClick={handleTextSubmit}
                      disabled={!textAnswer.trim()}
                      className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5)' }}
                    >
                      召唤 Persona
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
