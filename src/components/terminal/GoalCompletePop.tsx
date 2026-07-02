/**
 * GoalCompletePop — 一件素材下的全部小步骤达成时的庆祝弹窗。
 *
 * 当完成某件素材的最后一个小步骤时弹出，让用户决定：
 *   1. 这件目标已经完成；
 *   2. 还不够，继续沿着同一目标往下拆。
 * 主题差分保留，进场动效尊重 bold 降级。
 */
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

export interface GoalCompletePopPayload {
  id: string;
  title: string;
}

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
        <div className="mt-1 text-xl font-black text-gray-900">你完成了一组小步骤</div>
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
    <div className="mt-1 text-lg font-bold" style={{ color: INK }}>你完成了一组小步骤</div>
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
    <div className="mt-1.5 text-xl font-black" style={fancy(2.5)}>你完成了一组小步骤</div>
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
    <div className="text-base font-bold text-gray-900 dark:text-white">🎉 你完成了一组小步骤</div>
    <div className="mx-auto mt-1 max-w-[15rem] truncate text-sm text-gray-500 dark:text-gray-400">《{title}》</div>
  </motion.div>
);

export const GoalCompletePop = ({
  pop,
  onCompleteGoal,
  onContinue,
}: {
  pop: GoalCompletePopPayload | null;
  onCompleteGoal: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
}) => {
  const theme = useAppStore((s) => s.user?.theme);
  const channel = terminalChannel(theme);
  const bold = useBoldness();
  const completeButtonClass = channel === 'thief'
    ? 'min-h-11 border-2 border-black bg-primary px-4 py-2.5 text-sm font-black tracking-wide text-black transition hover:-translate-x-0.5 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
    : channel === 'tv'
      ? 'min-h-11 rounded-full border-2 border-black bg-primary px-4 py-2.5 text-sm font-black text-black transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
      : channel === 'board'
        ? 'min-h-11 border px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
        : 'min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-black/25 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
  const continueButtonClass = channel === 'thief'
    ? 'min-h-11 border-2 border-white bg-black px-4 py-2.5 text-sm font-black tracking-wide text-white transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
    : channel === 'tv'
      ? 'min-h-11 rounded-full border-2 border-primary bg-[#0a0a06] px-4 py-2.5 text-sm font-black text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
      : channel === 'board'
        ? 'min-h-11 border px-4 py-2.5 text-sm font-bold transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
        : 'min-h-11 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-black/20 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';
  const completeButtonStyle = channel === 'thief'
    ? { clipPath: POP_CLIP, boxShadow: '3px 3px 0 #000' }
    : channel === 'tv'
      ? { boxShadow: '0 4px 0 #000' }
      : channel === 'board'
        ? { fontFamily: MONO, background: 'var(--color-primary)', borderColor: '#fff var(--color-primary) var(--color-primary) #fff', boxShadow: '3px 3px 0 #000' }
        : undefined;
  const continueButtonStyle = channel === 'thief'
    ? { clipPath: POP_CLIP, boxShadow: '3px 3px 0 #000' }
    : channel === 'tv'
      ? { boxShadow: '0 4px 0 #000' }
      : channel === 'board'
        ? { fontFamily: MONO, color: INK, background: PANEL, borderColor: 'color-mix(in srgb, var(--color-primary) 70%, #fff) var(--color-primary) var(--color-primary) color-mix(in srgb, var(--color-primary) 70%, #fff)', boxShadow: '3px 3px 0 #000' }
        : undefined;

  return createPortal(
    <AnimatePresence>
      {pop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.cutin} flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm`}
          role="dialog"
          aria-modal="true"
          aria-label="小步骤全部完成"
        >
          <motion.div
            initial={bold ? { y: 16, opacity: 0 } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            className="w-full max-w-sm"
          >
            {channel === 'thief' ? <ThiefBurst title={pop.title} bold={bold} /> : channel === 'board' ? <BoardClosed title={pop.title} /> : channel === 'tv' ? <TVCleared title={pop.title} bold={bold} /> : <PlainToast title={pop.title} />}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onCompleteGoal}
                className={completeButtonClass}
                style={completeButtonStyle}
              >
                我完成了这个目标
              </button>
              <button
                type="button"
                onClick={onContinue}
                className={continueButtonClass}
                style={continueButtonStyle}
              >
                但是还不够，我要继续努力
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
