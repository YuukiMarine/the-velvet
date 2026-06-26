/**
 * GoalCompletePop — 「终极目标全部子愿望达成」的庆祝弹窗。
 *
 * 当完成某个终极目标的最后一个子愿望时弹出，~2.8s 自动消失。主题差分：
 *   红 = 怪盗漫画风（不规则四边形 + 黑描边/阴影 + 半调 + 星爆 + 厚花字）；其余 = 简洁庆祝条。
 * 纯展示、pointer-events-none（不挡下层抽屉/正文）；进场动效尊重 bold 降级。
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { zClass } from '@/utils/zIndex';
import { terminalChannel } from '@/utils/terminalSkin';
import { Halftone, StarBurst } from './thiefKit';
import { MONO, PANEL, INK, INK_DIM } from './boardKit';
import { fancy, Sparkle } from './tvKit';

const POP_CLIP = 'polygon(2% 7%, 98% 0%, 100% 93%, 0% 100%)';

const ThiefBurst = ({ title, bold }: { title: string; bold: boolean }) => (
  <motion.div
    initial={bold ? { scale: 0.5, rotate: -12, opacity: 0 } : { opacity: 0 }}
    animate={{ scale: 1, rotate: -3, opacity: 1 }}
    transition={bold ? { type: 'spring', damping: 10, stiffness: 260 } : { duration: 0.2 }}
    className="relative"
  >
    {bold && (
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 opacity-20"
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      >
        <StarBurst className="h-full w-full" />
      </motion.div>
    )}
    <div className="relative" style={{ filter: 'drop-shadow(5px 6px 0 #000)' }}>
      <div aria-hidden className="absolute -inset-[4px] bg-black" style={{ clipPath: POP_CLIP }} />
      <div aria-hidden className="absolute inset-0 bg-white" style={{ clipPath: POP_CLIP }} />
      <Halftone className="absolute bottom-0 left-0 h-20 w-20" style={{ clipPath: 'circle(60% at 0% 100%)', opacity: 0.35 }} dot={1.1} gap={6} />
      <div className="relative px-7 py-5 text-center">
        <div aria-hidden className="text-[10px] font-black tracking-[4px] text-primary">MISSION COMPLETE</div>
        <div className="mt-1 text-xl font-black text-gray-900">你完成了一个重要的目标</div>
        <div className="mx-auto mt-1 max-w-[15rem] truncate text-sm font-bold text-gray-500">《{title}》</div>
      </div>
    </div>
  </motion.div>
);

const BoardClosed = ({ title }: { title: string }) => (
  <motion.div
    initial={{ scale: 0.9, y: 12, opacity: 0 }}
    animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{ fontFamily: MONO, background: PANEL, border: '2px solid', borderColor: '#fff var(--color-primary) var(--color-primary) #fff', boxShadow: '5px 6px 0 #000' }}
    className="px-6 py-5 text-center"
  >
    <div aria-hidden className="text-[10px] font-bold tracking-[4px] text-primary">★ THREAD CLOSED ★</div>
    <div className="mt-1 text-lg font-bold" style={{ color: INK }}>你完成了一个重要的目标</div>
    <div className="mx-auto mt-1 max-w-[15rem] truncate text-sm" style={{ color: INK_DIM }}>《{title}》</div>
  </motion.div>
);

const TVCleared = ({ title, bold }: { title: string; bold: boolean }) => (
  <motion.div
    initial={bold ? { scale: 0.5, rotate: -10, opacity: 0 } : { opacity: 0 }}
    animate={{ scale: 1, rotate: -3, opacity: 1 }}
    transition={bold ? { type: 'spring', damping: 10, stiffness: 260 } : { duration: 0.2 }}
    className="relative border-2 border-primary bg-[#0a0a06] px-7 py-5 text-center"
    style={{ boxShadow: '0 5px 0 #000' }}
  >
    <Sparkle className="-left-2 top-1 text-lg" delay={0} bold={bold} />
    <Sparkle className="-right-1 top-3 text-sm" delay={0.6} bold={bold} />
    <div aria-hidden className="text-[10px] font-black tracking-[4px] text-primary">★ 本期通关 ★</div>
    <div className="mt-1.5 text-xl font-black" style={fancy(2.5)}>你完成了一个重要的目标</div>
    <div className="mx-auto mt-1 max-w-[15rem] truncate text-sm text-white/60">《{title}》</div>
  </motion.div>
);

const PlainToast = ({ title }: { title: string }) => (
  <motion.div
    initial={{ scale: 0.9, y: 12, opacity: 0 }}
    animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={{ opacity: 0 }}
    className="rounded-2xl border-2 border-primary bg-white px-6 py-4 text-center shadow-2xl dark:bg-gray-900"
  >
    <div className="text-base font-bold text-gray-900 dark:text-white">🎉 你完成了一个重要的目标</div>
    <div className="mx-auto mt-1 max-w-[15rem] truncate text-sm text-gray-500 dark:text-gray-400">《{title}》</div>
  </motion.div>
);

export const GoalCompletePop = ({ pop, onClose }: { pop: { title: string } | null; onClose: () => void }) => {
  const theme = useAppStore((s) => s.user?.theme);
  const channel = terminalChannel(theme);
  const bold = useBoldness();

  useEffect(() => {
    if (!pop) return;
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [pop, onClose]);

  return createPortal(
    <AnimatePresence>
      {pop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`pointer-events-none fixed inset-0 ${zClass.cutin} flex items-center justify-center p-6`}
          aria-live="polite"
        >
          {channel === 'thief' ? <ThiefBurst title={pop.title} bold={bold} /> : channel === 'board' ? <BoardClosed title={pop.title} /> : channel === 'tv' ? <TVCleared title={pop.title} bold={bold} /> : <PlainToast title={pop.title} />}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
