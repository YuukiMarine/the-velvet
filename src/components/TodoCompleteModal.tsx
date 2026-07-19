import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { useBoldness } from '@/utils/boldness';
import { MusicalNotes } from '@/components/MusicalNotes';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerSuccessFeedback } from '@/utils/feedback';
import { useAutoClose } from '@/utils/useAutoClose';
import { useBackHandler } from '@/utils/useBackHandler';
import { useFeedbackOnce } from '@/utils/useFeedbackOnce';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';

/**
 * 任务完成庆祝 —— P7.2 第一波收编进 CelebrationCutIn 基座。
 * 相比旧手写版新增：portal + zClass.celebration（旧版树内 z-50，会被黑猫窗盖住）、
 * ESC/Android back。音符雨走 overlayExtras（卡片外，不被 overflow 裁切）。
 *
 * P3R（p3-modal-06 稿）：蓝频道换「横贯斜带 cut-in」——背景页面可见（浅遮罩），
 * 白色大斜带横贯全宽：今日完成 + TODAY 行 + 蓝斜块任务名 + 巨大青色碎裂勾 +
 * 青✕角 + DONE 幽灵字 + 底部自动关闭提示。行为与基座同口径（四 hooks 复用）。
 */
interface TodoCompleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  totalPoints?: number;
  unlockHint?: {
    achievements: number;
    skills: number;
  };
}

/** 巨大青色碎裂勾（p3-modal-06 稿右侧主视觉） */
const ShatterCheck = () => (
  <svg viewBox="0 0 210 176" className="w-[148px]" aria-hidden>
    <polygon points="26,98 60,84 94,130 76,152 42,118" fill="#35d1e8" />
    <polygon points="76,152 94,130 182,20 202,44 98,164" fill="#5fd9ec" />
    <polygon points="94,130 182,20 160,14 88,110" fill="#8fe4f2" />
    <polygon points="186,6 202,0 196,22" fill="#35d1e8" />
    <polygon points="16,82 32,72 28,94" fill="#7fd8ee" />
    <polygon points="106,164 122,154 114,176" fill="#1b57ff" opacity="0.55" />
    <polygon points="200,54 210,48 206,64" fill="#7fd8ee" opacity="0.8" />
  </svg>
);

interface BandCutInP3Props extends TodoCompleteModalProps {
  /** 主标题（今日完成 / 记录成功） */
  eyebrow: string;
  /** 带内右下幽灵词（DONE / SAVED） */
  ghost: string;
}

/** 勾落地瞬间的迸溅碎片（B1）：位移/旋转/尺寸/色各异的小三角，从勾中心飞散 */
const CHECK_BURST = [
  { dx: -44, dy: -34, rot: -40, s: 10, c: '#35d1e8', d: 0 },
  { dx: 52, dy: -26, rot: 60, s: 8, c: '#1b57ff', d: 0.03 },
  { dx: -30, dy: 40, rot: -80, s: 7, c: '#8fe4f2', d: 0.05 },
  { dx: 58, dy: 30, rot: 45, s: 9, c: '#f0417f', d: 0.02 },
  { dx: 6, dy: -52, rot: 20, s: 7, c: '#5fd9ec', d: 0.06 },
  { dx: -56, dy: 4, rot: -25, s: 8, c: '#1b57ff', d: 0.04 },
  { dx: 30, dy: 52, rot: 70, s: 6, c: '#35d1e8', d: 0.07 },
];

/**
 * P3R 横贯斜带 cut-in（p3-modal-06 稿）——今日完成 / 记录成功 共用。
 * 白色大斜带从右滑入 + 一道蓝青高光从左向右划过 + 巨大青色碎裂勾 + 幽灵词 + 音符雨。
 */
export const BandCutInP3 = ({ isOpen, onClose, title, totalPoints, unlockHint, eyebrow, ghost }: BandCutInP3Props) => {
  const containerRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);
  useAutoClose(isOpen, 3000, onClose);
  useFeedbackOnce(isOpen, triggerSuccessFeedback);
  const anim = useBoldness();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.celebration} flex flex-col items-stretch justify-center overflow-hidden bg-black/35 backdrop-blur-[2px]`}
          onClick={onClose}
        >
          <div ref={containerRef} role="dialog" aria-modal="true" aria-label={`${eyebrow}：${title}`} className="relative">
            {/* 斜带（横贯全宽，从右侧斜切入场） */}
            <motion.div
              initial={{ x: '110%', skewX: -6 }}
              animate={{ x: 0, skewX: 0 }}
              exit={{ x: '-110%' }}
              transition={{ type: 'spring', damping: 24, stiffness: 220 }}
              className="relative w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative overflow-hidden px-6 pb-10 pt-9"
                style={{
                  background: 'linear-gradient(172deg, #ffffff 0%, #f2f9fd 70%, #e8f4fa 100%)',
                  clipPath: 'polygon(0 12%, 100% 0, 100% 88%, 0 100%)',
                  boxShadow: '0 22px 60px rgba(10,18,48,0.35)',
                }}
              >
                {/* 三道圆形波纹逐个扩散（从青勾处 ping ×3，替代刀光；循环保活整场庆祝） */}
                {[0, 1, 2].map((k) => (
                  <motion.span
                    key={k}
                    aria-hidden
                    className="pointer-events-none absolute z-10 rounded-full"
                    style={{ left: '82%', top: '50%', x: '-50%', y: '-50%', border: '3px solid rgba(53,209,232,0.85)' }}
                    initial={{ width: 26, height: 26, opacity: 0 }}
                    animate={{ width: 240, height: 240, opacity: [0, 0.85, 0] }}
                    transition={{ duration: 1.15, delay: 0.15 + k * 0.26, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.35 }}
                  />
                ))}
                {/* 幽灵词（带内右下）：错帧从右滑入（B1） */}
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute -right-3 bottom-0 select-none font-black italic leading-none"
                  style={{ fontFamily: 'Arial, sans-serif', fontSize: '5.2rem', color: 'rgba(53,209,232,0.22)' }}
                  initial={anim ? { x: 46, opacity: 0 } : false}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.35, delay: 0.26, ease: [0.2, 0.8, 0.3, 1] }}
                >
                  {ghost}
                </motion.div>
                <div className="relative flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {/* 主标题 + 洋红双片 */}
                    <div className="flex items-end gap-2">
                      <span className="text-[38px] font-black italic leading-none" style={{ color: '#0a1230', fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}>{eyebrow}</span>
                      <span aria-hidden className="mb-1 flex gap-[3px]">
                        <span className="h-[10px] w-[12px]" style={{ background: '#f0417f', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                        <span className="h-[8px] w-[9px]" style={{ background: 'rgba(240,65,127,0.55)', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                      </span>
                    </div>
                    {/* TODAY 行 */}
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <span aria-hidden className="h-[4px] w-9" style={{ background: '#1b57ff', transform: 'skewX(-24deg)' }} />
                      <span className="text-[15px] font-black italic tracking-[0.16em]" style={{ color: '#1b57ff' }}>
                        TODAY{(totalPoints ?? 0) > 0 ? ` / +${totalPoints}` : ''}
                      </span>
                    </div>
                    {/* 蓝斜块任务名：从左裁切揭示（B1；外层揭示 clip、内层保平行四边形） */}
                    <motion.div
                      className="mt-3 inline-block max-w-full align-top"
                      initial={anim ? { clipPath: 'inset(-6% 102% -6% -3%)' } : false}
                      animate={{ clipPath: 'inset(-6% -3% -6% -3%)' }}
                      transition={{ duration: 0.38, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                      <div className="inline-block max-w-full px-5 py-2.5" style={{ background: '#1b57ff', clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)', boxShadow: '0 10px 26px rgba(27,87,255,0.35)' }}>
                        <span className="block truncate text-[19px] font-black text-white">{title}</span>
                      </div>
                    </motion.div>
                    {unlockHint && (unlockHint.achievements > 0 || unlockHint.skills > 0) && (
                      <div className="mt-2.5 text-[13px] font-black" style={{ color: '#f0417f' }}>✦ 您解锁了新成就 / 新技能！</div>
                    )}
                  </div>
                  {/* 巨大青色碎裂勾 + 落地迸溅碎片（B1） */}
                  <motion.div
                    initial={{ scale: 0, rotate: -18 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 14, stiffness: 220, delay: 0.12 }}
                    className="relative shrink-0"
                  >
                    <ShatterCheck />
                    {anim && CHECK_BURST.map((b, i) => (
                      <motion.span
                        key={i}
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 top-1/2"
                        style={{ width: b.s, height: b.s, background: b.c, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
                        initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
                        animate={{ x: b.dx, y: b.dy, scale: 1, opacity: [0, 1, 0], rotate: b.rot }}
                        transition={{ duration: 0.55, delay: 0.34 + b.d, ease: 'easeOut' }}
                      />
                    ))}
                  </motion.div>
                </div>
              </div>
              {/* 右上青斜块 ✕ */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                aria-label="关闭"
                className="absolute right-3 top-0 z-20 flex h-11 w-14 items-center justify-center text-xl font-black text-white"
                style={{ background: '#35d1e8', clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)' }}
              >
                ×
              </motion.button>
            </motion.div>

            {/* 底部自动关闭提示 */}
            <div aria-hidden className="mt-5 flex items-center justify-center gap-3 text-[12px] font-black" style={{ color: 'rgba(255,255,255,0.9)' }}>
              <span className="h-px w-12 bg-white/60" />
              即将自动关闭 <span style={{ color: '#7fd8ee' }}>3s</span>
              <span className="h-px w-12 bg-white/60" />
            </div>
          </div>

          {/* 音符雨（数量随加成，与旧版 overlayExtras 同口径） */}
          {(totalPoints ?? 0) > 0 && <MusicalNotes count={totalPoints!} delay={0.3} />}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export const TodoCompleteModal = (props: TodoCompleteModalProps) => {
  const p3 = useUiChannel() === 'p3';
  if (p3) return <BandCutInP3 {...props} eyebrow="今日完成" ghost="DONE" />;
  const { isOpen, onClose, title, totalPoints, unlockHint } = props;
  return (
  <CelebrationCutIn
    isOpen={isOpen}
    onClose={onClose}
    theme="emerald"
    autoCloseMs={3000}
    particles={18}
    onShown={triggerSuccessFeedback}
    icon={
      <motion.span
        className="inline-block"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.6 }}
      >
        ✅
      </motion.span>
    }
    title="今日完成"
    subtitle={title}
    overlayExtras={(totalPoints ?? 0) > 0 ? <MusicalNotes count={totalPoints!} delay={0.3} /> : undefined}
  >
    {unlockHint && (unlockHint.achievements > 0 || unlockHint.skills > 0) && (
      <div className="text-sm text-white/90">您解锁了新成就/新技能！</div>
    )}
  </CelebrationCutIn>
  );
};
