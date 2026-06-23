/**
 * ClearContentThief — 终端完成结算屏的怪盗（红）内容层：「夺回成功」。
 *
 * 印章爆破（TAKEN 章带星爆 slam-in）+ 通缉照划掉（目标名被红线划穿）。
 * 纯展示，外层冲击 / 粒子 / portal 在 TerminalClearCutIn。动效尊重 vm.bold 降级。
 */
import { motion } from 'motion/react';
import { heavy, Halftone, StarBurst, Slab } from './thiefKit';
import type { ClearVM } from './ClearContentDefault';

export const ClearContentThief = ({ vm }: { vm: ClearVM }) => {
  const { skin, goalTitle, stepTitle, rewardPoints, attrName, danmakuGranted, encourage, bold, onClose } = vm;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.1, type: 'spring', damping: 18 }}
      onClick={(e) => e.stopPropagation()}
      className="relative w-full max-w-md text-center"
    >
      <div className="mb-2 text-[10px] font-black tracking-[5px] text-white/50">{skin.label.toUpperCase()}</div>

      {/* 夺回成功 · 厚描边花字 slam-in */}
      <motion.h1
        initial={bold ? { opacity: 0, scale: 1.3, rotate: -8 } : { opacity: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: -3 }}
        transition={bold ? { type: 'spring', damping: 11, stiffness: 300, delay: 0.3 } : { duration: 0.3 }}
        className="mb-4 inline-block text-[2.7rem] font-black leading-[0.95]"
        style={heavy(4)}
      >
        {skin.clearHeading}
      </motion.h1>

      {/* 通缉照：目标被划掉 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5, type: 'spring', damping: 16 }}
        className="relative mx-auto mb-5 overflow-hidden border-2 border-primary bg-[#0d0d0d] px-5 py-4"
        style={{ maxWidth: 360, boxShadow: '5px 6px 0 rgba(0,0,0,0.5)' }}
      >
        <Halftone className="absolute right-0 top-0 h-16 w-16 opacity-35" style={{ clipPath: 'polygon(45% 0,100% 0,100% 55%)' }} />
        <div className="relative text-[10px] font-black tracking-[3px] text-primary/80">WANTED · 心之宝物</div>
        <div className="relative mt-1 inline-block">
          <p className="text-base font-black text-white">{goalTitle ?? '今天的自己'}</p>
          <motion.span
            aria-hidden
            className="absolute left-0 top-1/2 h-[3px] w-full -translate-y-1/2 bg-primary"
            style={{ boxShadow: '0 0 6px var(--color-primary)' }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: bold ? 0.9 : 0.3, duration: bold ? 0.35 : 0, ease: 'easeOut' }}
          />
        </div>
        <p className="relative mt-2 text-xs italic text-white/60">「{stepTitle}」</p>
      </motion.div>

      {/* 印章爆破：TAKEN */}
      <div className="relative mx-auto mb-5 h-20 w-44">
        {bold && (
          <motion.div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 0.85, 0.45], scale: [0.2, 1.3, 1] }}
            transition={{ delay: 1.0, duration: 0.5, ease: 'easeOut' }}
          >
            <StarBurst className="h-28 w-28 opacity-60" />
          </motion.div>
        )}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={bold ? { opacity: 0, scale: 2.4, rotate: 18 } : { opacity: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: -10 }}
          transition={bold ? { type: 'spring', damping: 9, stiffness: 260, delay: 1.05 } : { duration: 0.3, delay: 0.2 }}
        >
          <Slab fill="var(--color-primary)" variant={0}>
            <div className="px-5 py-1.5 text-2xl font-black tracking-widest" style={heavy(3)}>{skin.clearStamp}</div>
          </Slab>
        </motion.div>
      </div>

      {/* 奖励 / 弹幕解锁 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: bold ? 1.4 : 0.5 }}
        className="mb-5 flex flex-col items-center gap-1.5"
      >
        {rewardPoints > 0 ? (
          <span className="border-2 border-primary bg-primary/15 px-3 py-1 text-sm font-black text-white">+{rewardPoints} {attrName}</span>
        ) : (
          <span className="text-xs text-white/55">今日的属性奖励已领过，但这一步依然算数</span>
        )}
        {danmakuGranted && <span className="text-xs text-white/70">✦ 解锁一次鼓励他人的机会 · 去终端写一句送出</span>}
        <span className="mt-1 text-xs italic text-white/60">{encourage}</span>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: bold ? 1.55 : 0.6 }}
        whileTap={{ scale: 0.96 }}
        onClick={onClose}
        className="mx-auto block w-full max-w-[280px] border-2 border-black bg-primary py-3 text-sm font-black tracking-wider text-black"
        style={{ boxShadow: '4px 4px 0 #000' }}
      >
        收下这一步
      </motion.button>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ duration: 0.5, delay: bold ? 1.7 : 0.7 }}
        className="mt-4 text-sm italic"
        style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Caveat', cursive" }}
      >
        ─ Velvet
      </motion.div>
    </motion.div>
  );
};
