/**
 * ClearContentDefault — 终端完成结算屏的通用内容层（board / tv / 兜底）。
 * 纯展示，保持频道化拆分前观感；外层冲击 / 粒子 / 音效 / portal 在 TerminalClearCutIn。
 */
import { motion } from 'motion/react';
import type { TerminalSkin } from '@/utils/terminalSkin';

export interface ClearVM {
  skin: TerminalSkin;
  goalTitle?: string;
  stepTitle: string;
  rewardPoints: number;
  attrName: string;
  danmakuGranted: boolean;
  encourage: string;
  bold: boolean;
  flash: string;
  onClose: () => void;
}

export const ClearContentDefault = ({ vm }: { vm: ClearVM }) => {
  const { skin, goalTitle, stepTitle, rewardPoints, attrName, danmakuGranted, encourage, flash, onClose } = vm;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.1, type: 'spring', damping: 18 }}
      onClick={(e) => e.stopPropagation()}
      className="relative w-full max-w-md text-center"
    >
      <div className="mb-2 text-[10px] font-black tracking-[5px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {skin.label.toUpperCase()}
      </div>

      <motion.h1
        initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)', filter: 'blur(8px)' }}
        animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)', filter: 'blur(0px)' }}
        transition={{ duration: 0.55, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
        className="mb-3 font-black"
        style={{ color: 'var(--color-primary)', fontFamily: "'Caveat', cursive", fontSize: '3rem', lineHeight: 1.05, textShadow: `0 2px 16px ${flash}` }}
      >
        {skin.clearHeading}
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.55, type: 'spring', damping: 16 }}
        className="relative mx-auto mb-5 px-6 py-5"
        style={{ maxWidth: 360, background: 'rgba(0,0,0,0.32)', border: '2px solid var(--color-primary)', borderRadius: 12 }}
      >
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.9)' }}>
          {goalTitle ? `你又一次接近了《${goalTitle}》的心愿，从虚无中拯救了自己。` : '你迈出了那一步，从虚无中把自己拉了回来。'}
        </p>
        <p className="mt-2 text-xs italic" style={{ color: 'rgba(255,255,255,0.55)' }}>「{stepTitle}」</p>

        <div
          aria-hidden
          className="absolute -top-2 -right-2 rounded-md px-2.5 py-1 text-[10px] font-black tracking-[3px]"
          style={{ color: 'var(--color-primary)', border: '2px solid var(--color-primary)', background: 'rgba(0,0,0,0.4)', textShadow: '0 0 10px var(--color-primary)', transform: 'rotate(-10deg)' }}
        >
          {skin.clearStamp}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.9 }}
        className="mb-5 flex flex-col items-center gap-1.5"
      >
        {rewardPoints > 0 ? (
          <span className="rounded-full bg-primary/20 px-3 py-1 text-sm font-bold text-white">+{rewardPoints} {attrName}</span>
        ) : (
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>今日的属性奖励已领过，但这一步依然算数</span>
        )}
        {danmakuGranted && (
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>✦ 解锁一次鼓励他人的机会 · 去终端写一句送出</span>
        )}
        <span className="mt-1 text-xs italic" style={{ color: 'rgba(255,255,255,0.6)' }}>{encourage}</span>
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 1.1 }}
        whileTap={{ scale: 0.96 }}
        onClick={onClose}
        className="mx-auto block w-full max-w-[280px] rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/40"
      >
        收下这一步
      </motion.button>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ duration: 0.5, delay: 1.3 }}
        className="mt-4 text-sm italic"
        style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Caveat', cursive" }}
      >
        ─ Velvet
      </motion.div>
    </motion.div>
  );
};
