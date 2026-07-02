/**
 * ClearContentTV — 终端完成结算屏的 TV 内容层：综艺「通关！」。
 * 花字 slam-in + 闪星爆 + CLEAR 戳 + 本期回放面板 + 音符。外层冲击/粒子/portal 在 TerminalClearCutIn。
 */
import { motion } from 'motion/react';
import { MusicalNotes } from '@/components/MusicalNotes';
import { RecDot } from './tvKit';
import type { ClearVM } from './ClearContentDefault';

export const ClearContentTV = ({ vm }: { vm: ClearVM }) => {
  const { skin, stepTitle, rewardPoints, attrName, danmakuGranted, comboCount, comboAvailable, encourage, bold, onClose, onCombo } = vm;
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, rotate: 0.8, scale: 0.96 }}
      animate={{ opacity: 1, y: -48, rotate: -1.2, scale: 1 }}
      transition={{ duration: 0.42, delay: 0.08, type: 'spring', damping: 20 }}
      onClick={(e) => e.stopPropagation()}
      className="relative w-full max-w-[25rem] text-left text-[#18150d]"
    >
      <div
        className="relative min-h-[34rem] overflow-hidden border-[3px] border-[#18150d] bg-[#fff4b8] px-4 pb-5 pt-4 shadow-[0_9px_0_#ff9a00]"
        style={{
          borderRadius: '2rem 1.35rem 2.35rem 1.45rem / 1.45rem 2rem 1.25rem 2.25rem',
          fontFamily: '"Arial Black", Impact, "Noto Sans SC", "Microsoft YaHei", sans-serif',
        }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30 tv-crt-scanlines" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.22]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.55), transparent 34%, rgba(255,225,0,.18) 100%)' }} />
        <div aria-hidden className="pointer-events-none absolute -right-9 -top-10 h-40 w-40 rounded-full border-[15px] border-[#ff9a00]/38" />
        <div aria-hidden className="pointer-events-none absolute -left-16 bottom-7 h-40 w-40 rounded-full border-[4px] border-white/70" />
        <div aria-hidden className="pointer-events-none absolute right-14 top-[4.7rem] h-20 w-32 opacity-28" style={{ backgroundImage: 'radial-gradient(circle, #18150d 1.45px, transparent 2px)', backgroundSize: '9px 9px' }} />
        <div aria-hidden className="pointer-events-none absolute bottom-0 right-7 h-44 w-[0.2rem] bg-[#ff4a17]" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 right-3 h-36 w-[0.2rem] bg-[#24c8f2]" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[0.68rem] font-black tracking-[0.14em] text-[#8d6f00]">
            <RecDot size="h-1.5 w-1.5" bold={bold} />
            <span className="truncate">深夜TV特别篇</span>
          </div>
          <span className="shrink-0 rounded-full border-2 border-[#18150d] bg-[#24c8f2] px-3.5 py-1 text-[0.76rem] font-black uppercase tracking-[0.12em] shadow-[0_2px_0_#18150d]">CH 04</span>
        </div>

        <div className="relative mt-8 min-h-[9.35rem]">
          <motion.h1
            initial={bold ? { scale: 1.12, rotate: -7, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, rotate: -4.5, opacity: 1 }}
            transition={bold ? { type: 'spring', damping: 12, stiffness: 240, delay: 0.16 } : { duration: 0.3 }}
            className="absolute -left-1 top-2 text-[4.1rem] font-black leading-none text-white sm:text-[4.55rem]"
            style={{
              WebkitTextStroke: '2.2px #18150d',
              paintOrder: 'stroke fill',
              letterSpacing: '-0.045em',
              textShadow: '3px 4px 0 #ffd400, -2px 3px 0 #18150d',
            }}
          >
            {skin.clearHeading}
          </motion.h1>
          <span
            aria-hidden
            className="absolute right-5 top-1 rotate-[8deg] rounded-md border-[3px] border-[#ff3c22] px-3 py-1 text-base font-black uppercase tracking-[0.12em] text-[#ff3c22]"
            style={{ boxShadow: '0 0 8px rgba(255,46,46,0.35)' }}
          >
            {skin.clearStamp}
          </span>
        </div>

        <div className="relative overflow-hidden rounded-[1.15rem] border-[3px] border-[#18150d] bg-[#fff8d6] shadow-[0_4px_0_rgba(24,21,13,0.32)]">
          <div className="flex items-center justify-between bg-[#ffe100] px-4 py-2 text-base font-black">
            <span>刚刚这一幕</span>
            <span aria-hidden>✽</span>
          </div>
          <div className="px-4 py-5">
            <p className="text-[1.03rem] font-black leading-relaxed text-[#18150d] sm:text-lg">
              你让停滞的时间再度流动了起来。
            </p>
            <p className="mt-3 text-[0.98rem] font-black leading-relaxed text-[#8d6f00]">「{stepTitle}」</p>
          </div>
        </div>

        <div className="relative mt-4 flex flex-nowrap items-center justify-between gap-2 text-[0.68rem] font-black">
          {rewardPoints > 0 ? (
            <span className="relative max-w-[14.5rem] shrink truncate whitespace-nowrap rounded-full border-2 border-[#18150d]/55 bg-[#fff8d6] px-3 py-1 text-[#18150d] shadow-[0_2px_0_rgba(24,21,13,.16)]">
              +{rewardPoints} {attrName}
              {bold && <MusicalNotes count={rewardPoints} />}
            </span>
          ) : (
            <span className="max-w-[14.5rem] shrink truncate whitespace-nowrap rounded-full border-2 border-[#18150d]/45 bg-[#fff8d6] px-3 py-1 text-[#5d4a12] shadow-[0_2px_0_rgba(24,21,13,.16)]">今天的加成已领过，这一步照样算数。</span>
          )}
          {danmakuGranted && <span className="max-w-[14.5rem] shrink truncate whitespace-nowrap rounded-full border-2 border-[#24c8f2] bg-[#e9fbff] px-3 py-1 text-[#18150d]">可以写一句话送给同样卡住的人</span>}
          {comboCount && comboCount > 1 && (
            <span className="shrink-0 rounded-full border-2 border-[#ff4a17] bg-[#fff8d6] px-3 py-1 tracking-[0.14em] text-[#ff4a17]">COMBO x{comboCount}</span>
          )}
        </div>

        <p className="relative mt-3 text-center text-xs font-bold italic text-[#5d4a12]">{encourage}</p>

        <div className="relative mx-auto mt-6 flex w-full max-w-[22rem] flex-col gap-2">
          {comboAvailable && onCombo && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={onCombo}
              className="min-h-[3.5rem] rounded-full border-[3px] border-[#18150d] bg-[#24c8f2] px-5 text-sm font-black tracking-widest text-[#18150d] shadow-[0_4px_0_#18150d]"
              aria-label="继续连击"
            >
              继续连击
            </motion.button>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={onClose}
            className="relative min-h-[4.15rem] rounded-full border-[3px] border-[#18150d] bg-[#ffe100] px-6 text-base font-black tracking-[0.08em] text-[#18150d] shadow-[0_5px_0_#ff9a00]"
            aria-label="记录这一刻"
          >
            <span className="mr-3 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#18150d] bg-[#fff8d6] text-sm" aria-hidden>▶</span>
            记录这一刻
            <span className="absolute -bottom-3 right-7 rotate-[-7deg] rounded-md border-2 border-[#18150d] bg-[#fff4b8] px-2.5 py-0.5 text-[0.68rem] font-black tracking-[0.14em] shadow-[0_2px_0_rgba(24,21,13,.2)]">ON AIR</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};
