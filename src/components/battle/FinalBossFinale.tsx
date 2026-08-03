/**
 * Lv6 · 终局演出（PRD_FINAL_BOSS §5）
 *
 * ⚠️ 第一轮为**占位形态**：只走「三条血归零 → 长按总攻击 → 掉英雄的证明」这条主干，
 *    让骨架可玩、可验、可出包。第二轮把八段演出（吃惊/挑衅/禁忌回满/碾压/玩家反应/
 *    援军上阵/最终觉醒/18 张记录卡）填进 phase 状态机里，主干不动。
 *
 * 设计约束（两轮共用，改的时候别丢）：
 *  - 阶段推进用显式 phase，不是一串 setTimeout —— 可中断、可恢复、D0 可直给
 *  - 不提供「跳过演出」：一生一次；中途退出靠 battleState.finalBossStage='finale' 恢复
 *  - 渲染归 BattleArena（不是 BattleModal）：战斗窗已经关了，这是战斗之后的事
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { RelicInstance } from '@/types';
import { RELIC_POOL, relicEntryText } from '@/battle/loot';
import { playSound } from '@/utils/feedback';
import { HoldButton } from '@/components/battle/HoldButton';

/** 八段演出的完整阶段表（第二轮实装 shock…awaken；第一轮直接从 finish 起） */
export type FinalePhase =
  | 'shock' | 'taunt' | 'forbidden' | 'crush'
  | 'resolve' | 'allies' | 'awaken' | 'finish' | 'reward';

interface Props {
  isOpen: boolean;
  onDone: () => void;
}

export function FinalBossFinale({ isOpen, onDone }: Props) {
  const shadow = useAppStore(s => s.shadow);
  const flaw = useAppStore(s => s.battleState?.finalBossFlaw);
  const defeatFinalBoss = useAppStore(s => s.defeatFinalBoss);

  const [phase, setPhase] = useState<FinalePhase>('finish');
  const [relic, setRelic] = useState<RelicInstance | null>(null);
  const [settling, setSettling] = useState(false);

  const doFinish = async () => {
    if (settling) return;
    setSettling(true);
    playSound('/battle-fanfare.mp3');
    const got = await defeatFinalBoss();
    setRelic(got);
    setPhase('reward');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-center justify-center p-5"
        style={{ background: 'rgba(4,3,0,0.96)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(232,182,76,0.05) 3px, rgba(232,182,76,0.05) 4px)' }}
        />

        <div className="relative w-full max-w-md text-center">
          {phase === 'finish' && (
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <p className="text-[10px] tracking-[0.55em] uppercase font-bold" style={{ color: '#e8b64c' }}>
                the false god falls
              </p>
              <h2 className="text-3xl font-black text-white" style={{ fontFamily: '"Noto Serif SC", "Songti SC", serif' }}>
                {shadow?.name ?? '伪神'}
              </h2>
              {flaw && (
                <p className="text-[13px] leading-relaxed text-amber-100/60 px-2">
                  它写给你的结论是「{flaw.title}」——<br />「{flaw.verdict}」
                </p>
              )}
              <p className="text-[13px] leading-relaxed text-amber-50/85 px-2">
                三条血都空了。它跪在那里，还在张嘴。<br />
                该由你来结束这句话了。
              </p>
              <HoldButton
                label="总 攻 击"
                holdMs={1400}
                disabled={settling}
                onComplete={() => void doFinish()}
              />
            </motion.div>
          )}

          {phase === 'reward' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-5"
            >
              <p className="text-[10px] tracking-[0.55em] uppercase font-bold" style={{ color: '#e8b64c' }}>
                hidden relic
              </p>
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                className="mx-auto px-5 py-6"
                style={{
                  maxWidth: 320,
                  background: 'linear-gradient(165deg, #1a1204 0%, #2e1d04 55%, #120c02 100%)',
                  border: '1px solid rgba(232,182,76,0.55)',
                  borderRadius: 14,
                }}
              >
                <p className="text-3xl">✦</p>
                <p className="mt-2 text-xl font-black" style={{ color: '#e8b64c' }}>
                  {RELIC_POOL.heroproof.name}
                </p>
                <p className="mt-1.5 text-[13px] text-amber-100/75">
                  {relic ? relicEntryText(relic) : 'SP 消耗 −5 · 攻击 +20%'}
                </p>
                <p className="mt-3 text-[11px] leading-relaxed text-amber-200/45">
                  它不是从伪神身上掉下来的。<br />
                  是你走到这里的那些天，自己攒出来的。
                </p>
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                className="text-[11px] text-amber-200/40"
              >
                去「战备 → 遗物」里把它装上。
              </motion.p>
              <motion.button
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
                onClick={onDone}
                className="w-full py-3.5 font-black text-[15px]"
                style={{
                  clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)',
                  background: 'linear-gradient(135deg, #92610e, #e8b64c)',
                  color: '#160d02',
                }}
              >
                收下
              </motion.button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
