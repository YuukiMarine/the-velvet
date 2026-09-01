/**
 * 影时间高塔 · 区层显形仪式（批2 §7.1）
 *
 * 三句审判问答（定调 tone）→ 单次 AI 调用产出 区层名/描述/主影 → 显形。
 * 无 Key / 失败 → 手动模式（名称+弱点，模板区层名）。
 * 替代旧「识破暗影」流程（ShadowCreateModal 已退役）。
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { Shadow, AttributeId } from '@/types';
import { generateStratumReveal } from '@/utils/battleAI';
import { SHADOW_LEVEL_CONFIG } from '@/constants';
import { BOSS_ATTACK_BY_LEVEL } from '@/battle/numbers';
import { rollThemeAttribute, weekKeyOf } from '@/battle/tower';
import { playSound } from '@/utils/feedback';
import { ShadowWarningOverlay } from '@/components/battle/ShadowWarningOverlay';
import { ModalPortal } from '@/components/ModalPortal';
import { useBackHandler } from '@/utils/useBackHandler';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 显形的区层等级（= 已通关最高区层 + 1，1-5） */
  level: number;
}

const REVEAL_QA: Array<{ q: string; opts: string[] }> = [
  { q: '塔的上方传来低语：「你为何而登？」', opts: ['为了证明自己', '为了寻找答案', '只是不想停下'] },
  { q: '「你最怕在塔里遇见什么？」', opts: ['停滞不前的自己', '徒劳无功的夜晚', '无人同行的孤独'] },
  { q: '「……很好。那就上来吧。」黑暗在上方张开——', opts: ['回以沉默', '报上名号', '提剑就走'] },
];

const FALLBACK_LINES = [
  '你以为这就能击败我？',
  '这点伤害不过如此。',
  '有趣，继续吧。',
  '你真的了解自己吗？',
  '我是你内心的一部分！',
  '就这点实力还妄想战胜我？',
  '你在变强……但还不够。',
  '小心……我也在变强。',
];

export function StratumRevealModal({ isOpen, onClose, level }: Props) {
  const { settings, attributes, battleState, revealStratum } = useAppStore();
  const [step, setStep] = useState<'qa' | 'choose' | 'manual' | 'generating'>('qa');
  const [qaIndex, setQaIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualWeak, setManualWeak] = useState<AttributeId>('knowledge');
  const [warn, setWarn] = useState<{ name: string; weakAttribute: AttributeId } | null>(null);

  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const attrValues = Object.fromEntries(attributes.map(a => [a.id, a.points])) as Record<AttributeId, number>;
  const lastWeak = battleState?.lastDefeatedWeakAttribute;
  // 主塔区层只到 5（Lv6 顶阙走 FinalBossRevealModal）；钳按表长写，别再钉死数字
  const cfg = SHADOW_LEVEL_CONFIG[Math.min(level, SHADOW_LEVEL_CONFIG.length) - 1];

  // 批4 §6.7 主影主题：本周（周一起）五维成长点数最少者 65% 成为主题属性
  const rollTheme = (): AttributeId => {
    const weekStart = new Date(weekKeyOf(new Date()) + 'T00:00:00').getTime();
    const acts = useAppStore.getState().activities.filter(a => new Date(a.date).getTime() >= weekStart);
    const weekPoints = Object.fromEntries(
      (Object.keys(attrNames) as AttributeId[]).map(attr => [
        attr,
        acts.reduce((s, a) => s + (a.pointsAwarded?.[attr] ?? 0), 0),
      ]),
    ) as Record<AttributeId, number>;
    return rollThemeAttribute(weekPoints);
  };

  useEffect(() => {
    if (isOpen) {
      setStep('qa'); setQaIndex(0); setAnswers([]); setError(''); setManualName('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useBackHandler(isOpen, () => {
    if (warn) { setWarn(null); return; }
    if (step === 'generating') return;
    onClose();
  });

  const buildBoss = (data: {
    name: string; description: string;
    invertedAttributes: Record<AttributeId, string>;
    responseLines: string[]; weakAttribute: AttributeId;
  }): Shadow => ({
    id: uuidv4(),
    level,
    name: data.name,
    description: data.description,
    invertedAttributes: data.invertedAttributes,
    weakAttribute: data.weakAttribute,
    maxHp: cfg.maxHp,
    currentHp: cfg.maxHp,
    maxHp2: cfg.maxHp2,
    currentHp2: cfg.maxHp2,
    responseLines: data.responseLines,
    attackPower: BOSS_ATTACK_BY_LEVEL[level - 1],
    createdAt: new Date(),
  });

  const answerQa = (opt: string) => {
    playSound('/ui-menu.mp3', 0.5);
    const next = [...answers, opt];
    setAnswers(next);
    if (qaIndex < REVEAL_QA.length - 1) {
      setQaIndex(qaIndex + 1);
    } else {
      void doGenerate(next);
    }
  };

  const doGenerate = async (toneAnswers: string[]) => {
    setStep('generating');
    setError('');
    try {
      const themeAttribute = rollTheme();
      const data = await generateStratumReveal(settings, attrNames, level, attrValues, lastWeak, toneAnswers, themeAttribute);
      const boss = buildBoss(data);
      await revealStratum({
        level,
        name: data.stratumName,
        description: data.stratumDescription,
        themeAttribute,
        boss,
      });
      playSound('/battle-seal.mp3');
      setWarn({ name: boss.name, weakAttribute: boss.weakAttribute });
    } catch (err) {
      setError(err instanceof Error ? err.message : '显形失败，请重试');
      setStep('choose');
    }
  };

  const doManual = async () => {
    if (!manualName.trim()) return;
    const attrs = Object.keys(attrNames) as AttributeId[];
    const boss = buildBoss({
      name: manualName.trim(),
      description: `${manualName}从你内心的阴暗面诞生，盘踞在区层之巅。`,
      invertedAttributes: Object.fromEntries(attrs.map(a => [a, `缺乏${attrNames[a]}`])) as Record<AttributeId, string>,
      responseLines: [...FALLBACK_LINES],
      weakAttribute: manualWeak,
    });
    await revealStratum({
      level,
      name: `${manualName.trim().slice(0, 6)}之域`,
      description: '月光稀薄的塔层，影子在栏杆间低语。',
      themeAttribute: rollTheme(),
      boss,
    });
    playSound('/battle-seal.mp3');
    setWarn({ name: boss.name, weakAttribute: boss.weakAttribute });
  };

  const handleWarnDone = () => {
    setWarn(null);
    onClose();
  };

  // portal 到 body：战场页活在 PageShell 的 stacking context 里，页内浮层对外
  // 只等效 z=1，底部导航（z-40）会盖住它（用户上报「区层显形仪式被底部栏挡住」）。
  // 见 components/ModalPortal.tsx。
  return (
    <ModalPortal>
      <ShadowWarningOverlay
        isOpen={!!warn}
        shadowName={warn?.name ?? ''}
        level={level}
        weakAttribute={warn?.weakAttribute}
        weakAttributeName={warn ? attrNames[warn.weakAttribute] : undefined}
        onDone={handleWarnDone}
      />
      <AnimatePresence>
        {isOpen && !warn && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.87)' }}
            onClick={e => { if (step === 'generating') return; if (e.target === e.currentTarget) onClose(); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(160deg, #0c0628 0%, #1b1042 55%, #0a0824 100%)',
                border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)',
              }}
            >
              <div className="p-6">
                <h2 className="text-xl font-bold text-white mb-1 text-center">🗼 区层显形仪式</h2>
                <p className="text-center text-xs text-indigo-200/60 mb-4">第 {level} 区层 · 高塔上方的黑暗正在成形</p>

                {step === 'generating' ? (
                  <div className="text-center py-8">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-10 h-10 rounded-full border-2 border-indigo-400 border-t-transparent mx-auto mb-4"
                    />
                    <p className="text-indigo-200 text-sm">区层正在显形……</p>
                  </div>
                ) : step === 'qa' ? (
                  <div className="space-y-4">
                    <div className="flex justify-center gap-1.5 mb-1">
                      {REVEAL_QA.map((_, i) => (
                        <span key={i} className="h-1 w-8 rounded-full" style={{ background: i <= qaIndex ? 'rgb(var(--color-battle-bright-rgb))' : 'rgba(255,255,255,0.12)' }} />
                      ))}
                    </div>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={qaIndex}
                        initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-3"
                      >
                        <p className="text-gray-200 text-sm leading-relaxed text-center py-2">{REVEAL_QA[qaIndex].q}</p>
                        {REVEAL_QA[qaIndex].opts.map(opt => (
                          <button
                            key={opt}
                            onClick={() => answerQa(opt)}
                            className="w-full py-2.5 rounded-xl text-sm font-semibold text-indigo-100 transition-all active:scale-[0.98]"
                            style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.16)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)' }}
                          >
                            {opt}
                          </button>
                        ))}
                      </motion.div>
                    </AnimatePresence>
                    <p className="text-center text-[10px] text-gray-500">
                      心魔 HP {cfg.maxHp}{cfg.maxHp2 ? ` + ${cfg.maxHp2}` : ''} · 攻击 {BOSS_ATTACK_BY_LEVEL[level - 1]}
                    </p>
                  </div>
                ) : step === 'choose' ? (
                  <div className="space-y-4">
                    {error && (
                      <div className="rounded-xl px-3 py-2 space-y-1" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
                        <p className="text-red-300 text-xs leading-relaxed">{error}</p>
                        <p className="text-red-400/60 text-[10px]">请确认 API 配置可用后重试，或选「手动」自行命名心魔。</p>
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={() => void doGenerate(answers)}
                        className="flex-1 py-3 rounded-xl text-white text-sm font-semibold"
                        style={{ background: 'linear-gradient(90deg, rgb(var(--color-battle-rgb)), rgb(var(--color-battle-indigo-rgb)))' }}
                      >
                        🔄 重试显形
                      </button>
                      <button
                        onClick={() => setStep('manual')}
                        className="flex-1 py-3 rounded-xl text-sm font-semibold"
                        style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                      >
                        ✏️ 手动
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <input
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      placeholder="心魔名称…"
                      className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                      onKeyDown={e => e.key === 'Enter' && void doManual()}
                    />
                    <div>
                      <p className="text-gray-400 text-xs mb-1.5">弱点属性（受到该属性技能×1.5伤害）</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(attrNames) as AttributeId[]).map(attr => (
                          <button
                            key={attr}
                            onClick={() => setManualWeak(attr)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                            style={{
                              background: manualWeak === attr ? 'rgb(var(--color-battle-bright-rgb) / 0.4)' : 'rgba(255,255,255,0.1)',
                              color: manualWeak === attr ? '#c4b5fd' : '#9ca3af',
                              border: manualWeak === attr ? '1px solid rgb(var(--color-battle-bright-rgb) / 0.6)' : '1px solid transparent',
                            }}
                          >
                            {attrNames[attr]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setStep('choose')}
                        className="py-2 px-4 rounded-xl text-gray-300 text-sm"
                        style={{ background: 'rgba(255,255,255,0.1)' }}
                      >
                        返回
                      </button>
                      <button
                        onClick={() => void doManual()}
                        className="flex-1 py-2 rounded-xl text-white text-sm font-semibold"
                        style={{ background: 'linear-gradient(90deg, rgb(var(--color-battle-rgb)), rgb(var(--color-battle-indigo-rgb)))' }}
                      >
                        显形
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}
