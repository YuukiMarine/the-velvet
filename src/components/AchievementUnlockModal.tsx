import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerLevelFeedback } from '@/utils/feedback';
import { useAutoClose } from '@/utils/useAutoClose';
import { useBackHandler } from '@/utils/useBackHandler';
import { useFeedbackOnce } from '@/utils/useFeedbackOnce';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';

/**
 * 成就解锁庆祝 —— P7.2 第一波收编进 CelebrationCutIn 基座。
 * 相比旧手写版新增：backdrop 点击跳过 + ESC/Android back（旧版只有 X 和自动关）。
 *
 * P3R（p3-modal-07 稿）：蓝频道换白色大菱形斜面板演出——UNLOCK 巨幽灵字 +
 * 青纸鹤徽记 + 蓝斜带压「成就解锁！」深蓝大斜体 + 成就名蓝字配青双斜杠 + 副文。
 */
interface AchievementUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  achievementTitle: string;
}

/** 青纸鹤徽记（p3-modal-07 面板顶部三角拼贴） */
const CyanCrest = () => (
  <svg viewBox="0 0 150 110" className="w-[108px]" aria-hidden>
    <polygon points="46,72 108,10 96,84" fill="#35d1e8" />
    <polygon points="46,72 96,84 60,102" fill="#0fb8d8" />
    <polygon points="108,10 118,64 96,84" fill="#7fd8ee" />
    <polygon points="96,84 132,70 122,92" fill="#f0417f" />
    <polygon points="28,80 44,74 38,92" fill="#8fe4f2" />
  </svg>
);

/** P3R 成就解锁演出（p3-modal-07 1:1） */
const AchievementUnlockP3 = ({ isOpen, onClose, achievementTitle }: AchievementUnlockModalProps) => {
  const containerRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);
  useAutoClose(isOpen, 4500, onClose);
  useFeedbackOnce(isOpen, triggerLevelFeedback);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.celebration} flex items-center justify-center overflow-hidden p-5`}
          style={{ background: 'rgba(190,228,244,0.88)', backdropFilter: 'blur(3px)' }}
          onClick={onClose}
        >
          {/* UNLOCK 巨幽灵字（overlay 层，横排斜置） */}
          <div aria-hidden className="pointer-events-none absolute left-[-24px] top-[4%] select-none font-black italic leading-none" style={{ fontFamily: 'Arial, sans-serif', fontSize: '7.5rem', color: 'rgba(255,255,255,0.55)', transform: 'rotate(-9deg)' }}>
            UNLOCK
          </div>
          {/* 右上蓝三角 + ✕ */}
          <span aria-hidden className="absolute right-0 top-0 h-[120px] w-[140px]" style={{ background: '#1b57ff', clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center text-2xl font-black text-white"
          >
            ×
          </motion.button>

          {/* 白色大菱形面板 */}
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`成就解锁！${achievementTitle}`}
            initial={{ scale: 0.55, opacity: 0, rotate: -5 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.75, opacity: 0 }}
            transition={{ type: 'spring', damping: 19, stiffness: 230 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden pb-10 pt-6 text-center"
            style={{
              background: 'rgba(255,255,255,0.96)',
              clipPath: 'polygon(7% 9%, 96% 0, 100% 88%, 3% 100%)',
              boxShadow: '0 24px 60px rgba(38,96,140,0.28)',
            }}
          >
            {/* 蓝斜带（横贯面板，压在标题后方） */}
            <span aria-hidden className="absolute left-[-4%] right-[-4%] top-[43%] h-[64px]" style={{ background: '#1b57ff', transform: 'rotate(-7deg)' }} />
            <span aria-hidden className="absolute right-[6%] top-[38%] h-[16px] w-[26px]" style={{ background: '#f0417f', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
            {/* 左下青三角 */}
            <span aria-hidden className="absolute bottom-1 left-2 h-0 w-0 border-b-[26px] border-r-[38px] border-r-transparent" style={{ borderBottomColor: 'rgba(53,209,232,0.8)' }} />

            <div className="relative z-10 flex flex-col items-center px-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.25, 1] }}
                transition={{ duration: 0.7, delay: 0.15, type: 'spring', stiffness: 280 }}
              >
                <CyanCrest />
              </motion.div>

              {/* 成就解锁！（压在蓝带上，白描边保证跨底可读） */}
              <div
                className="mt-1 text-[44px] font-black italic leading-none"
                style={{
                  color: '#0a3bd6',
                  fontFamily: '"Arial Black", "Noto Sans SC", sans-serif',
                  WebkitTextStroke: '7px #fff',
                  paintOrder: 'stroke fill',
                }}
              >
                成就解锁！
              </div>

              {/* 成就名 + 青双斜杠 */}
              <div className="mt-7 flex items-center justify-center gap-3">
                <span aria-hidden className="flex gap-1">
                  <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.8)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                  <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.45)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                </span>
                <span className="max-w-[70%] truncate text-[30px] font-black leading-none" style={{ color: '#1b57ff' }}>{achievementTitle}</span>
                <span aria-hidden className="flex gap-1">
                  <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.45)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                  <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.8)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                </span>
              </div>

              <p className="mt-3 text-[14px] font-black" style={{ color: '#0a1230' }}>恭喜你达成新成就！继续努力解锁更多内容</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export const AchievementUnlockModal = (props: AchievementUnlockModalProps) => {
  const p3 = useUiChannel() === 'p3';
  if (p3) return <AchievementUnlockP3 {...props} />;
  const { isOpen, onClose, achievementTitle } = props;
  return (
  <CelebrationCutIn
    isOpen={isOpen}
    onClose={onClose}
    theme="gold"
    autoCloseMs={4500}
    particles={16}
    onShown={triggerLevelFeedback}
    icon={
      <motion.span
        className="inline-block"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ duration: 0.8, delay: 0.2, type: 'spring', stiffness: 300 }}
      >
        🏆
      </motion.span>
    }
    title="成就解锁！"
  >
    <p className="text-2xl font-semibold text-white/95">{achievementTitle}</p>
    <p className="mt-4 text-base text-white/80">恭喜你达成新成就！继续努力解锁更多内容</p>
  </CelebrationCutIn>
  );
};
