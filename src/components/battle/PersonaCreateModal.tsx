import { Fragment, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { P3R, slantClip, SlantButton } from '@/components/p3r/kit';
import { useUiChannel } from '@/ui/useUiChannel';
import { Persona, BattleState, AttributeId } from '@/types';
import { generatePersonaSkills } from '@/utils/battleAI';
import { PLAYER_BASE_HP } from '@/battle/numbers';
import { triggerSuccessFeedback, playSound } from '@/utils/feedback';
import { AwakeningOverlay, AwakeningOverlayHandle } from '@/components/battle/AwakeningOverlay';
import { useBackHandler } from '@/utils/useBackHandler';
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

/** P3R 五步进度排（p3-modal-10 稿：双色三角步标 + 01-05 QUESTION + 青箭头）。current=-1 全亮 */
const P3StepRow = ({ current }: { current: number }) => (
  <div className="mt-5 flex items-end justify-between">
    {[0, 1, 2, 3, 4].map((i) => (
      <Fragment key={i}>
        {i > 0 && (
          <span aria-hidden className="mb-6 h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent" style={{ borderLeftColor: P3R.cyan, opacity: 0.8 }} />
        )}
        <span className={`flex flex-col items-start ${current >= 0 && i > current ? 'opacity-40' : ''}`}>
          <svg viewBox="0 0 46 40" className="h-9 w-11" aria-hidden>
            <polygon points="4,38 22,6 26,38" fill={P3R.cyan} />
            <polygon points="16,38 30,2 36,38" fill={P3R.blue} />
            <polygon points="32,8 44,0 42,14" fill={P3R.cyan} />
          </svg>
          <span className="mt-1 text-[15px] font-black italic leading-none" style={{ color: P3R.ink }}>{`0${i + 1}`}</span>
          <span className="text-[7px] font-black tracking-[0.14em]" style={{ color: P3R.inkSoft }}>QUESTION</span>
        </span>
      </Fragment>
    ))}
  </div>
);

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
  /** AI 生成失败且未保存时为 true：需要用户重新回答 Q5 并重试 */
  const [retryMode, setRetryMode] = useState(false);
  /** AwakeningOverlay 的命令式句柄：流式 chunk 通过 ref 直接更新，不触发本组件 re-render */
  const awakeningRef = useRef<AwakeningOverlayHandle>(null);

  const reset = () => {
    setStage('intro');
    setChoiceStep(0);
    setChoiceAnswers([]);
    setTextAnswer('');
    setError('');
    setGeneratedPersona(null);
    setFallbackWarning(false);
    setRetryMode(false);
    awakeningRef.current?.setStreamText('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Android 返回键：
  //   - generating（AI 流式生成）阶段：点遮罩已显式被阻止（见下方 onClick 里 "if (stage === 'generating') return"），
  //     back 也做 no-op，保持一致
  //   - 其余阶段（intro / choice / text / reveal）：等同于点 ✕ / 点遮罩 → handleClose
  useBackHandler(isOpen, () => {
    if (stage === 'generating') return; // 生成中：严格无法返回
    handleClose();
  });

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
    awakeningRef.current?.setStreamText('');
    try {
      const attrNamesTyped = settings.attributeNames as Record<AttributeId, string>;

      const { personaName, skills, attributePersonas, usedFallback, errorMessage } = await generatePersonaSkills(
        settings,
        user?.name ?? '觉醒者',
        attrNamesTyped,
        dialog,
        // 命令式调用：ref 仅更新 AwakeningOverlay 内部状态，不触发本组件 re-render
        (_delta, full) => awakeningRef.current?.setStreamText(full),
      );

      // AI 失败：不保存默认 persona，回到 Q5 让用户修改后重试
      if (usedFallback) {
        setError(errorMessage ? `AI 召唤失败：${errorMessage}` : 'AI 召唤失败，请重试');
        setRetryMode(true);
        setTextAnswer(''); // 清空 Q5 答案，引导用户重新表述
        setStage('text');
        return;
      }

      const persona: Persona = {
        id: uuidv4(),
        name: personaName,
        description: attributePersonas.knowledge?.description,
        attributePersonas,
        equippedMaskAttribute: null,
        createdViaAI: true,
        skills,
        createdAt: new Date(),
      };
      await savePersona(persona);

      if (!battleState) {
        const bs: BattleState = {
          id: 'current',
          shadowId: '',
          personaId: persona.id,
          playerHp: settings.battlePlayerMaxHp ?? PLAYER_BASE_HP,
          playerMaxHp: settings.battlePlayerMaxHp ?? PLAYER_BASE_HP,
          sp: 0,
          totalSpEarned: 0,
          battleLog: [],
          status: 'idle',
          shadowsDefeated: 0,
        };
        await saveBattleState(bs);
      }

      triggerSuccessFeedback();
      playSound('/battle-summon.mp3');
      setFallbackWarning(false);
      setGeneratedPersona(persona);
      setStage('reveal');
    } catch (e) {
      // 理论上 generatePersonaSkills 内部已捕获，这里是兜底
      setError(e instanceof Error ? `意外错误：${e.message}` : '召唤失败，请重试');
      setRetryMode(true);
      setTextAnswer('');
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

  const p3 = useUiChannel() === 'p3';

  // P3R（p3-modal-10 稿 1:1）：亮蓝觉醒协议全屏页——05/AWAKEN 幽灵字 + 白斜面板宣言
  // （蓝带压「汝即是吾…」+ 青「吾」+ 点列 + 洋红角）+ 五步三角进度 + 蓝大 CTA；
  // choice / text / reveal 阶段稿上未画，按同语言换装（白斜卡 + 深蓝墨字 + SlantButton）。
  if (p3) {
  // R19 修复：整块面板原本渲染在 App 的 `relative z-10` 语境里——
  // 无论标多少 z 都压不过底导（z-40 是它的兄弟节点），底部内容会被
  // tab 栏 / 宽屏左侧栏切掉。按 utils/zIndex.ts 的迁移口径 portal 到 body。
    return createPortal(
      <>
        <AwakeningOverlay ref={awakeningRef} isOpen={isOpen && stage === 'generating'} />
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
              style={{ background: 'linear-gradient(160deg, #f2f9fd 0%, #e2f0f9 55%, #cfe9f6 100%)' }}
            >
              {/* 幽灵字：05 巨数字 + AWAKEN */}
              <div aria-hidden className="pointer-events-none absolute -left-3 -top-6 select-none font-black italic leading-none" style={{ fontFamily: 'Arial, sans-serif', fontSize: '9.5rem', color: 'rgba(27,87,255,0.10)' }}>05</div>
              <div aria-hidden className="pointer-events-none absolute right-[-28px] top-[66px] select-none font-black italic leading-none" style={{ fontFamily: 'Arial, sans-serif', fontSize: '4.6rem', color: 'rgba(53,209,232,0.30)' }}>AWAKEN</div>
              {/* 底部左蓝大三角装饰 */}
              <span aria-hidden className="pointer-events-none fixed bottom-8 left-0 h-0 w-0 border-b-[52px] border-r-[76px] border-r-transparent" style={{ borderBottomColor: 'rgba(27,87,255,0.8)' }} />

              <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-14 pt-5">
                {/* 页眉：觉醒协议 + ✕ */}
                <div className="flex items-center justify-between">
                  <span className="text-[17px] font-black italic" style={{ color: P3R.ink }}>觉醒协议</span>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { if (stage !== 'generating') handleClose(); }}
                    aria-label="关闭"
                    className="flex h-10 w-12 items-center justify-center text-xl font-black text-white"
                    style={{ background: P3R.blue, clipPath: slantClip(10), opacity: stage === 'generating' ? 0.4 : 1 }}
                  >
                    ×
                  </motion.button>
                </div>

                {stage === 'generating' && (
                  <div className="py-20 text-center text-[14px] font-black" style={{ color: P3R.blue }}>Persona 正在觉醒……</div>
                )}

                {stage === 'intro' && (
                  <div className="mt-8">
                    {/* 宣言白斜面板 + 蓝带第二行 */}
                    <div className="relative">
                      <div className="relative bg-white px-6 pb-11 pt-9" style={{ clipPath: 'polygon(7% 0, 100% 3%, 93% 100%, 0 97%)', boxShadow: '0 18px 44px rgba(38,96,140,0.16)' }}>
                        <span aria-hidden className="absolute left-5 top-4 flex gap-1">
                          <span className="h-[12px] w-[10px]" style={{ background: P3R.cyan, clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                          <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.5)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                        </span>
                        <div className="text-center text-[44px] font-black leading-none" style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}>吾即是汝，</div>
                      </div>
                      <div className="relative z-10 -mt-7 px-6 py-4" style={{ background: P3R.blue, clipPath: 'polygon(22px 0, 100% 0, calc(100% - 22px) 100%, 0 100%)', boxShadow: '0 14px 32px rgba(27,87,255,0.35)' }}>
                        <span className="whitespace-nowrap text-[38px] font-black leading-none text-white" style={{ fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}>
                          汝即是<span style={{ color: P3R.cyan }}>吾</span>
                        </span>
                        <span aria-hidden className="ml-1.5 align-super text-[24px] font-black tracking-[0.08em]" style={{ color: P3R.cyan }}>·····</span>
                        <span aria-hidden className="absolute bottom-0 right-3 h-[12px] w-[18px]" style={{ background: P3R.magenta, clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
                      </div>
                    </div>

                    <p className="mt-7 text-center text-[15px] font-black" style={{ color: P3R.ink }}>回答五个问题，觉醒你内心的五灵 Persona</p>

                    <P3StepRow current={-1} />

                    {!hasApi && (
                      <div className="mt-7 flex items-center gap-3">
                        <span className="flex shrink-0 flex-col items-center leading-none">
                          <span className="text-[30px] font-black italic" style={{ color: P3R.blue }}>05</span>
                          <span className="text-[8px] font-black tracking-[0.14em]" style={{ color: P3R.blue }}>QUESTIONS</span>
                        </span>
                        <span aria-hidden className="h-9 w-[3px] shrink-0" style={{ background: P3R.blue, transform: 'skewX(-18deg)' }} />
                        <span className="text-[13px] font-black leading-snug" style={{ color: P3R.blue }}>请先在设置中配置 AI API Key 以召唤 Persona</span>
                      </div>
                    )}

                    <div className="mt-6">
                      <SlantButton
                        tone="primary"
                        magentaCorner
                        disabled={!hasApi}
                        className="w-full py-4 text-[20px]"
                        onClick={() => { playSound('/battle-awaken.mp3'); setStage('choice'); }}
                      >
                        觉醒 Persona
                      </SlantButton>
                    </div>
                  </div>
                )}

                {stage === 'choice' && (
                  <div className="mt-4">
                    <P3StepRow current={choiceStep} />
                    <p className="mt-7 text-[11px] font-black tracking-[0.18em]" style={{ color: P3R.blue }}>QUESTION 0{choiceStep + 1} / 04</p>
                    <h2 className="mt-2 text-[22px] font-black leading-snug" style={{ color: P3R.ink }}>{CHOICE_QUESTIONS[choiceStep].question}</h2>
                    <div className="mt-5 space-y-3">
                      {CHOICE_QUESTIONS[choiceStep].options.map((option, i) => (
                        <motion.button
                          key={i}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleChoiceSelect(option)}
                          className="flex w-full items-center gap-3 bg-white px-5 py-3.5 text-left text-[14px] font-bold leading-relaxed"
                          style={{ color: P3R.ink, clipPath: slantClip(12), boxShadow: '0 8px 20px rgba(38,96,140,0.10)' }}
                        >
                          <span aria-hidden className="h-[16px] w-[5px] shrink-0" style={{ background: P3R.cyan, transform: 'skewX(-18deg)' }} />
                          {option}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {stage === 'text' && (
                  <div className="mt-4">
                    <P3StepRow current={4} />
                    <p className="mt-7 text-[11px] font-black tracking-[0.18em]" style={{ color: retryMode ? P3R.magenta : P3R.blue }}>
                      {retryMode ? 'RETRY · QUESTION 05' : 'QUESTION 05 / 05'}
                    </p>
                    <h2 className="mt-2 text-[19px] font-black leading-snug" style={{ color: P3R.ink }}>
                      {retryMode ? '请重新回答第五题，AI 会据此重新召唤 Persona：' : TEXT_QUESTION}
                    </h2>
                    {retryMode && (
                      <p className="mt-2 text-[12px] font-bold" style={{ color: P3R.magenta }}>换一种说法或补充细节可能有助于 AI 稳定输出。</p>
                    )}
                    <div className="mt-4 space-y-1.5">
                      {choiceAnswers.map((answer, i) => (
                        <div key={i} className="truncate px-3 py-1.5 text-[11px] font-bold" style={{ background: 'rgba(27,87,255,0.07)', color: P3R.inkSoft, clipPath: slantClip(8) }}>
                          Q{i + 1}: {answer}
                        </div>
                      ))}
                    </div>
                    <textarea
                      value={textAnswer}
                      onChange={e => setTextAnswer(e.target.value)}
                      placeholder="输入你的回答…"
                      rows={4}
                      className="mt-4 w-full resize-none bg-white px-4 py-3 text-[15px] font-bold outline-none placeholder:text-[#8a97ad]"
                      style={{ color: P3R.ink, clipPath: slantClip(12), borderBottom: `4px solid ${P3R.cyan}`, boxShadow: '0 8px 20px rgba(38,96,140,0.10)' }}
                    />
                    {error && (
                      <div className="mt-3 px-4 py-2.5" style={{ background: 'rgba(240,65,127,0.10)', clipPath: slantClip(10) }}>
                        <p className="break-all text-[12px] font-bold leading-relaxed" style={{ color: P3R.magenta }}>{error}</p>
                        <p className="mt-1 text-[10px] font-bold" style={{ color: 'rgba(240,65,127,0.7)' }}>
                          常见原因：网络超时、模型 token 上限不足、响应被截断。建议换个模型或重试。
                        </p>
                      </div>
                    )}
                    <div className="mt-5 flex gap-3">
                      <SlantButton tone="soft" className="px-6 py-3" onClick={() => { setStage('choice'); setChoiceStep(3); setRetryMode(false); setError(''); }}>
                        返回
                      </SlantButton>
                      <SlantButton tone="primary" magentaCorner disabled={!textAnswer.trim()} className="flex-1 py-3" onClick={() => { void handleTextSubmit(); }}>
                        {retryMode ? '重新召唤' : '召唤 Persona'}
                      </SlantButton>
                    </div>
                  </div>
                )}

                {stage === 'reveal' && generatedPersona && (() => {
                  const attrNames = settings.attributeNames as Record<string, string>;
                  const sparkles = Array.from({ length: 12 }, (_, i) => ({
                    id: i,
                    angle: (i / 12) * 360,
                    dist: 80 + Math.random() * 60,
                    delay: Math.random() * 0.5,
                  }));
                  return (
                    <div className="relative mt-8">
                      {sparkles.map(sp => (
                        <motion.div
                          key={sp.id}
                          className="absolute h-1.5 w-1.5 rounded-full"
                          style={{ left: '50%', top: '18%', background: 'rgba(53,209,232,0.9)', boxShadow: '0 0 6px rgba(53,209,232,0.6)' }}
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

                      <div className="relative z-10 text-center">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} className="mb-1 inline-block text-4xl" style={{ color: P3R.blue }}>✦</motion.div>
                        <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-[30px] font-black italic leading-none" style={{ color: P3R.ink }}>
                          Persona 觉醒完毕
                        </motion.h2>
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-2 text-[13px] font-black" style={{ color: P3R.blue }}>
                          五灵具现，反抗之力觉醒
                        </motion.p>
                      </div>

                      <div className="relative z-10 mt-5 space-y-3">
                        {ATTR_ORDER.map((attr, i) => {
                          const ap = generatedPersona.attributePersonas?.[attr];
                          if (!ap) return null;
                          return (
                            <motion.div
                              key={attr}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.3 + i * 0.15, type: 'spring', stiffness: 200, damping: 20 }}
                              className="bg-white px-5 py-3.5"
                              style={{ clipPath: slantClip(12), boxShadow: '0 8px 20px rgba(38,96,140,0.10)' }}
                            >
                              <span className="inline-block px-2 py-0.5 text-[10px] font-black tracking-[0.14em] text-white" style={{ background: P3R.blue, clipPath: slantClip(5) }}>
                                {attrNames[attr] ?? attr}
                              </span>
                              <p className="mt-1.5 text-[15px] font-black" style={{ color: P3R.ink }}>✦ {ap.name}</p>
                              <p className="mt-0.5 text-[12px] font-semibold leading-relaxed" style={{ color: P3R.inkSoft }}>{ap.description}</p>
                            </motion.div>
                          );
                        })}
                      </div>

                      {fallbackWarning && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }} className="mt-4 text-center text-[11px] font-bold leading-relaxed" style={{ color: P3R.magenta }}>
                          AI 召唤未能成功，已使用默认 Persona。你可以稍后在设置中检查 API 配置后重新召唤。
                        </motion.p>
                      )}
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="mt-5 text-center text-[11px] font-semibold italic" style={{ color: P3R.inkSoft }}>
                        {fallbackWarning ? '默认五灵已就位，征途仍将继续。' : '五灵已集，新的征途即将开启。'}
                      </motion.p>

                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }} className="mt-6">
                        <SlantButton tone="primary" magentaCorner className="w-full py-3.5 text-[17px]" onClick={() => { reset(); onClose(); }}>
                          开始征途
                        </SlantButton>
                      </motion.div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>,
      document.body,
    );
  }

  // R19 修复：整块面板原本渲染在 App 的 `relative z-10` 语境里——
  // 无论标多少 z 都压不过底导（z-40 是它的兄弟节点），底部内容会被
  // tab 栏 / 宽屏左侧栏切掉。按 utils/zIndex.ts 的迁移口径 portal 到 body。
  return createPortal(
    <>
    <AwakeningOverlay ref={awakeningRef} isOpen={isOpen && stage === 'generating'} />
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={(e) => { if (stage === 'generating') return; if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 100%)',
              border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div className="p-6">
              {/* Generating — 占位，实际用 AwakeningOverlay 覆盖全屏 */}
              {stage === 'generating' && (
                <div className="text-center py-8 opacity-40">
                  <div className="w-10 h-10 mx-auto mb-4" />
                  <p className="text-purple-300 text-sm">Persona 正在觉醒……</p>
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
                          background: 'rgb(var(--color-battle-bright-rgb) / 0.8)',
                          boxShadow: '0 0 6px rgb(var(--color-battle-bright-rgb) / 0.6)',
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
                              background: 'rgb(var(--color-battle-bright-rgb) / 0.08)',
                              border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.2)',
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
                        background: 'linear-gradient(135deg, rgb(var(--color-battle-rgb)), rgb(var(--color-battle-indigo-rgb)))',
                        boxShadow: '0 4px 15px rgb(var(--color-battle-rgb) / 0.4)',
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
                          background: 'linear-gradient(90deg, transparent, rgb(var(--color-battle-bright-rgb) / 0.8), transparent)',
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
                      onClick={() => { if (!hasApi) return; playSound('/battle-awaken.mp3'); setStage('choice'); }}
                      disabled={!hasApi}
                      className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'linear-gradient(90deg, rgb(var(--color-battle-rgb)), rgb(var(--color-battle-indigo-rgb)))' }}
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
                          background: i <= choiceStep ? 'rgb(var(--color-battle-bright-rgb))' : 'rgba(255,255,255,0.2)',
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
                          border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.2)',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgb(var(--color-battle-bright-rgb) / 0.2)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(var(--color-battle-bright-rgb) / 0.5)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgb(var(--color-battle-bright-rgb) / 0.2)';
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
                    <h2 className="text-lg font-bold text-white">
                      {retryMode ? '✦ 重新召唤' : '✦ 最后一问'}
                    </h2>
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

                  <p className="text-white text-sm font-medium leading-relaxed">
                    {retryMode ? '请重新回答第五题，AI 会据此重新召唤 Persona：' : TEXT_QUESTION}
                  </p>
                  {retryMode && (
                    <p className="text-amber-300/80 text-xs leading-relaxed -mt-2">
                      换一种说法或补充细节可能有助于 AI 稳定输出。
                    </p>
                  )}
                  <textarea
                    value={textAnswer}
                    onChange={e => setTextAnswer(e.target.value)}
                    placeholder="输入你的回答…"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                  />
                  {error && (
                    <div className="rounded-xl px-3 py-2 space-y-1" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
                      <p className="text-red-300 text-xs leading-relaxed break-all">{error}</p>
                      <p className="text-red-400/60 text-[10px]">
                        常见原因：网络超时、模型 token 上限不足、响应被截断。建议换个模型或重试。
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setStage('choice'); setChoiceStep(3); setRetryMode(false); setError(''); }}
                      className="py-2 px-4 rounded-xl text-gray-300 text-sm"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      返回
                    </button>
                    <button
                      onClick={handleTextSubmit}
                      disabled={!textAnswer.trim()}
                      className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                      style={{ background: retryMode ? 'linear-gradient(90deg, #dc2626, rgb(var(--color-battle-rgb)))' : 'linear-gradient(90deg, rgb(var(--color-battle-rgb)), rgb(var(--color-battle-indigo-rgb)))' }}
                    >
                      {retryMode ? '🔄 重新召唤' : '召唤 Persona'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>,
    document.body,
  );
}
