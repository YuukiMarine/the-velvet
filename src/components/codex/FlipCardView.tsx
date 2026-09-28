import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue, useSpring, type PanInfo } from 'motion/react';
import { useBackHandler } from '@/utils/useBackHandler';
import { zClass } from '@/utils/zIndex';

/**
 * 图鉴共用的放大 + 翻面页（第 6 轮）：塔罗卡与岁时卡都用它。
 * CSS perspective + 弹簧曲线，不用 WebGL；点一下或横向拖过 90px 翻面，拖的时候牌跟着手指转（带回弹）。
 * 正反两面由调用方给（拿到卡宽），背面预翻 180°，父层翻过来正读。
 */
export const FlipCardView = ({ open, onClose, label, resetKey, front, back, hint = '点一下或左右拖动翻面' }: {
  open: boolean;
  onClose: () => void;
  /** 无障碍名 */
  label: string;
  /** 换卡时重置翻面状态 */
  resetKey?: string;
  front: (width: number, height: number) => ReactNode;
  back: (width: number, height: number) => ReactNode;
  hint?: string;
}) => {
  const [flipped, setFlipped] = useState(false);
  const drag = useMotionValue(0);
  // 阻尼：拖动时牌面跟手转，松手回弹到 0 或翻过去
  const dragSpring = useSpring(drag, { stiffness: 260, damping: 22, mass: 0.9 });
  useBackHandler(open, onClose);
  useEffect(() => { if (open) { setFlipped(false); drag.set(0); } }, [open, resetKey, drag]);

  const width = Math.min(300, Math.round(Math.min(window.innerWidth, 480) * 0.68));
  const height = Math.round(width * 1.6);

  const onPan = (_: unknown, info: PanInfo) => { drag.set(Math.max(-140, Math.min(140, info.offset.x))); };
  const onPanEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 600) setFlipped((f) => !f);
    drag.set(0);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.celebration} flex flex-col items-center justify-center bg-black/80 p-5`}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <button type="button" onClick={onClose} aria-label="关闭" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl font-black text-white" style={{ marginTop: 'env(safe-area-inset-top)' }}>×</button>
          <motion.div
            className="relative touch-pan-y select-none"
            style={{ width, height, perspective: 1200 }}
            onClick={(e) => { e.stopPropagation(); setFlipped((f) => !f); }}
            onPan={onPan}
            onPanEnd={onPanEnd}
            initial={{ scale: 0.7, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
          >
            <motion.div
              className="relative h-full w-full"
              style={{ transformStyle: 'preserve-3d', rotateY: dragSpring }}
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.55)]" style={{ backfaceVisibility: 'hidden' }}>
                {front(width, height)}
              </div>
              <div className="absolute inset-0 overflow-hidden rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.55)]" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                {back(width, height)}
              </div>
            </motion.div>
          </motion.div>
          <p className="mt-5 text-[12px] font-bold text-white/70">{hint}</p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

/** 背面共用的纸面（奶白渐变 + 墨字） */
export const FlipBackPanel = ({ children }: { children: ReactNode }) => (
  <div className="h-full w-full overflow-y-auto p-5 text-left" style={{ background: 'linear-gradient(170deg, #fbf7ef 0%, #efe6d3 100%)', color: '#1a1712' }}>
    {children}
  </div>
);
