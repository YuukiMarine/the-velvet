/**
 * ClearContentTV — 终端完成结算屏的 TV 内容层：综艺「通关！」。
 * 花字 slam-in + 闪星爆 + CLEAR 戳 + 本期回放面板 + 音符。外层冲击/粒子/portal 在 TerminalClearCutIn。
 */
import { motion } from 'motion/react';
import { MusicalNotes } from '@/components/MusicalNotes';
import { TVPanel, TVButton, Sparkle, RecDot, fancy } from './tvKit';
import type { ClearVM } from './ClearContentDefault';

export const ClearContentTV = ({ vm }: { vm: ClearVM }) => {
  const { skin, goalTitle, stepTitle, rewardPoints, attrName, danmakuGranted, encourage, bold, onClose } = vm;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: 0.1, type: 'spring', damping: 18 }}
      onClick={(e) => e.stopPropagation()}
      className="relative w-full max-w-md text-center"
    >
      <div className="mb-2 flex items-center justify-center gap-1.5 text-[10px] font-black tracking-[4px] text-primary">
        <RecDot size="h-1.5 w-1.5" bold={bold} />{skin.label.toUpperCase()}
      </div>

      {/* 通关！花字 slam-in + 闪星 + CLEAR 戳 */}
      <div className="relative mx-auto mb-4 inline-block">
        <Sparkle className="-left-6 -top-3 text-xl" delay={0} bold={bold} />
        <Sparkle className="-right-5 top-0 text-base" delay={0.5} bold={bold} />
        <Sparkle className="-bottom-2 left-4 text-lg" delay={1} bold={bold} />
        <motion.h1
          initial={bold ? { scale: 1.4, rotate: -8, opacity: 0 } : { opacity: 0 }}
          animate={{ scale: 1, rotate: -3, opacity: 1 }}
          transition={bold ? { type: 'spring', damping: 10, stiffness: 280, delay: 0.25 } : { duration: 0.3 }}
          className="text-[3rem] font-black leading-[0.95]"
          style={fancy(4)}
        >
          {skin.clearHeading}
        </motion.h1>
        <span aria-hidden className="absolute -right-9 -top-3 rotate-12 rounded border-2 border-[#ff2e2e] px-1.5 py-0.5 text-[10px] font-black tracking-wider text-[#ff2e2e]" style={{ boxShadow: '0 0 8px rgba(255,46,46,0.5)' }}>{skin.clearStamp}</span>
      </div>

      {/* 本期回放 */}
      <TVPanel className="mb-4 text-left" title="本期回放">
        <p className="text-sm leading-relaxed text-white/90">
          {goalTitle ? `你又一次接近了《${goalTitle}》的心愿，从虚无中拯救了自己。` : '你迈出了那一步，从虚无中把自己拉了回来。'}
        </p>
        <p className="mt-2 text-xs italic text-white/55">「{stepTitle}」</p>
      </TVPanel>

      {/* 奖励 / 观众席 */}
      <div className="mb-4 flex flex-col items-center gap-1.5">
        {rewardPoints > 0 ? (
          <span className="relative rounded-full border-2 border-black bg-primary px-3 py-1 text-sm font-black text-black">
            +{rewardPoints} {attrName}
            {bold && <MusicalNotes count={rewardPoints} />}
          </span>
        ) : (
          <span className="text-xs text-white/55">今日的属性奖励已领过，但这一步依然算数</span>
        )}
        {danmakuGranted && <span className="text-xs text-white/70">✦ 解锁一次鼓励他人的机会 · 去写一句送出</span>}
        <span className="mt-1 text-xs italic text-white/60">{encourage}</span>
      </div>

      <div className="flex justify-center">
        <TVButton onClick={onClose} className="w-full max-w-[280px]" ariaLabel="记录这一刻">记录这一刻</TVButton>
      </div>

      <div className="mt-4 text-sm italic text-white/60" style={{ fontFamily: "'Caveat', cursive" }}>─ Velvet</div>
    </motion.div>
  );
};
