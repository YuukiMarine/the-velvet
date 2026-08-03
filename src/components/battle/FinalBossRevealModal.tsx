/**
 * Lv6 · 伪神显形仪式（PRD_FINAL_BOSS §2/§3）
 *
 * 与 StratumRevealModal 的区别，也是它单独成文件的理由：
 *  - 没有三句审判问答——这一层不问你想怎么爬，它已经读完你了
 *  - 没有手动兜底：无 AI Key 不开放（用户拍板），失败只能重试
 *  - 显形的核心不是名字，是那句「判词」——它指认你最主要的一个缺点
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { generateFinalBoss } from '@/utils/battleAI';
import { AttributeId } from '@/types';
import { playSound } from '@/utils/feedback';
import { ShadowWarningOverlay } from '@/components/battle/ShadowWarningOverlay';
import { useBackHandler } from '@/utils/useBackHandler';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'gate' | 'generating' | 'verdict' | 'error';

export function FinalBossRevealModal({ isOpen, onClose }: Props) {
  const settings = useAppStore(s => s.settings);
  const collectFinalBossFacts = useAppStore(s => s.collectFinalBossFacts);
  const revealFinalBoss = useAppStore(s => s.revealFinalBoss);

  const [step, setStep] = useState<Step>('gate');
  const [error, setError] = useState('');
  const [verdict, setVerdict] = useState<{ name: string; flawTitle: string; verdict: string; weak: AttributeId } | null>(null);
  const [warn, setWarn] = useState(false);

  const attrNames = settings.attributeNames as Record<AttributeId, string>;

  useBackHandler(isOpen, () => {
    if (warn) return;                 // 演出中不可回退
    if (step === 'generating') return;
    onClose();
  });

  const doGenerate = async () => {
    setStep('generating');
    setError('');
    try {
      const facts = collectFinalBossFacts();
      const data = await generateFinalBoss(settings, attrNames, facts);
      await revealFinalBoss({
        stratumName: data.stratumName,
        stratumDescription: data.stratumDescription,
        name: data.name,
        description: data.description,
        invertedAttributes: data.invertedAttributes,
        responseLines: data.responseLines,
        weakAttribute: data.weakAttribute,
        flaw: { key: data.flawKey, title: data.flawTitle, verdict: data.verdict },
      });
      playSound('/battle-seal.mp3');
      setVerdict({ name: data.name, flawTitle: data.flawTitle, verdict: data.verdict, weak: data.weakAttribute });
      setStep('verdict');
    } catch (err) {
      setError(err instanceof Error ? err.message : '显形失败，请重试');
      setStep('error');
    }
  };

  return (
    <>
      <ShadowWarningOverlay
        isOpen={warn}
        shadowName={verdict?.name ?? ''}
        level={6}
        weakAttribute={verdict?.weak}
        weakAttributeName={verdict ? attrNames[verdict.weak] : undefined}
        onDone={() => { setWarn(false); onClose(); }}
      />
      <AnimatePresence>
        {isOpen && !warn && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.94)' }}
            onClick={e => {
              if (step === 'generating' || step === 'verdict') return;
              if (e.target === e.currentTarget) onClose();
            }}
          >
            {/* 金色栅格：与深渊回廊的冷紫刻意区分——终局是被镀过的，不是深的 */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(232,182,76,0.045) 3px, rgba(232,182,76,0.045) 4px)' }}
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="relative w-full max-w-md overflow-hidden"
              style={{
                background: 'linear-gradient(165deg, #120d04 0%, #241703 52%, #0d0902 100%)',
                border: '1px solid rgba(232,182,76,0.45)',
                borderRadius: 16,
              }}
            >
              <div className="p-6">
                <p className="text-center text-[10px] tracking-[0.55em] uppercase font-bold" style={{ color: '#e8b64c' }}>
                  final stratum
                </p>
                <h2 className="mt-2 text-xl font-black text-white text-center">顶阙 · 伪神显形</h2>

                {step === 'gate' && (
                  <div className="mt-5 space-y-4">
                    <p className="text-[13px] leading-relaxed text-amber-100/70">
                      五个区层都被你走完了。可塔顶之上还有一层——
                      它一直在那里，只是在你走完之前，它不允许自己被看见。
                    </p>
                    <p className="text-[13px] leading-relaxed text-amber-100/70">
                      上面的东西会先读你：你的每一条记录、每一次断链、每一张过期的宣告。
                      然后它会用读到的东西，替你写一句结论。
                    </p>
                    <p className="text-[11px] text-amber-200/40">这是一次性的。它显形之后，深渊回廊要等它倒下才会开。</p>
                    <button
                      onClick={() => void doGenerate()}
                      className="w-full py-3.5 font-black text-[15px]"
                      style={{
                        clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)',
                        background: 'linear-gradient(135deg, #92610e, #e8b64c)',
                        color: '#160d02',
                      }}
                    >
                      让它读
                    </button>
                  </div>
                )}

                {step === 'generating' && (
                  <div className="py-10 text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                      className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-t-transparent"
                      style={{ borderColor: '#e8b64c', borderTopColor: 'transparent' }}
                    />
                    <p className="text-sm text-amber-100/70">它正在翻你的记录……</p>
                  </div>
                )}

                {step === 'error' && (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-xl px-3 py-2 space-y-1" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
                      <p className="text-red-300 text-xs leading-relaxed">{error}</p>
                      <p className="text-red-400/60 text-[10px]">顶阙不提供手动模式——它必须读得懂你，才能显形。</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={onClose}
                        className="py-3 px-5 rounded-xl text-sm text-gray-300"
                        style={{ background: 'rgba(255,255,255,0.08)' }}
                      >
                        以后再说
                      </button>
                      <button
                        onClick={() => void doGenerate()}
                        className="flex-1 py-3 rounded-xl text-sm font-black"
                        style={{ background: 'linear-gradient(135deg, #92610e, #e8b64c)', color: '#160d02' }}
                      >
                        🔄 重试
                      </button>
                    </div>
                  </div>
                )}

                {step === 'verdict' && verdict && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
                    className="mt-5 space-y-4"
                  >
                    <div className="text-center">
                      <p className="text-[10px] tracking-[0.4em] uppercase text-amber-300/60">它给你的结论</p>
                      <motion.p
                        initial={{ letterSpacing: '0.45em', opacity: 0 }}
                        animate={{ letterSpacing: '0.12em', opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.15 }}
                        className="mt-2 text-2xl font-black text-white"
                        style={{ fontFamily: '"Noto Serif SC", "Songti SC", serif' }}
                      >
                        {verdict.flawTitle}
                      </motion.p>
                    </div>
                    <motion.p
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                      className="text-[15px] leading-relaxed text-amber-50 text-center px-1"
                    >
                      「{verdict.verdict}」
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}
                      className="text-[11px] text-amber-200/45 text-center leading-relaxed"
                    >
                      这句话是它写的，不是判决。<br />
                      它的破绽在【{attrNames[verdict.weak]}】——你最拿得出手的那一面。
                    </motion.p>
                    <motion.button
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
                      onClick={() => { playSound('/battle-impact.mp3', 0.7); setWarn(true); }}
                      className="w-full py-3.5 font-black text-[15px]"
                      style={{
                        clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)',
                        background: 'linear-gradient(135deg, #92610e, #e8b64c)',
                        color: '#160d02',
                      }}
                    >
                      那就去反驳它
                    </motion.button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
