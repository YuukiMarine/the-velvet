import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { ShatteredStar } from '@/components/p3r/kit';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerLevelFeedback } from '@/utils/feedback';
import { useAutoClose } from '@/utils/useAutoClose';
import { useBackHandler } from '@/utils/useBackHandler';
import { useFeedbackOnce } from '@/utils/useFeedbackOnce';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';

/**
 * 属性升级庆祝 —— P7.2 第一波收编：视觉内容保留，行为（portal/celebration 层/
 * 三路关闭/自动关/音效单次）全部交给 CelebrationCutIn 基座。
 *
 * P3R（p3-modal-05 稿）：蓝频道换全屏白日演出——LEVEL 幽灵字 + 巨大新等级数字底 +
 * 碎裂星徽（kit 共享件，洋红碎片版）+ 白斜面板「恭喜升级！」+ 蓝斜带超大白字属性名 +
 * Lv.N-1 → Lv.N + 副文。行为与基座同口径（四个 hooks 直接复用）。
 */
interface LevelUpModalProps {
  attributeName: string;
  newLevel: number;
  isOpen: boolean;
  onClose: () => void;
}

/** P3R 全屏升级演出（p3-modal-05 1:1） */
const LevelUpP3 = ({ attributeName, newLevel, isOpen, onClose }: LevelUpModalProps) => {
  const containerRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);
  useAutoClose(isOpen, 3600, onClose);
  useFeedbackOnce(isOpen, triggerLevelFeedback);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.celebration} overflow-hidden`}
          style={{ background: 'linear-gradient(170deg, #eef7fc 0%, #dff0f9 55%, #cfeaf6 100%)' }}
          onClick={onClose}
        >
          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`恭喜升级！${attributeName} Lv.${newLevel}`}
            className="relative flex h-full w-full flex-col items-center justify-center"
          >
            {/* 背景：LEVEL 幽灵字 + 巨大新等级数字（超淡，压在星徽后） */}
            <div aria-hidden className="pointer-events-none absolute left-[-14px] top-[3%] select-none font-black italic leading-none" style={{ fontFamily: 'Arial, sans-serif', fontSize: '6.5rem', color: 'rgba(147,190,222,0.34)', transform: 'rotate(-8deg)' }}>
              LEVEL
            </div>
            <div aria-hidden className="pointer-events-none absolute top-[7%] left-1/2 -translate-x-1/2 select-none font-black italic leading-none tabular-nums" style={{ fontFamily: 'Arial, sans-serif', fontSize: '19rem', color: 'rgba(147,190,222,0.26)' }}>
              {String(newLevel).padStart(2, '0')}
            </div>
            {/* 右上蓝角 + 关闭 */}
            <span aria-hidden className="absolute right-0 top-0 h-[130px] w-[150px]" style={{ background: '#1b57ff', clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="关闭"
              className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center text-2xl font-black text-white"
            >
              ×
            </motion.button>
            {/* 底部蓝三角群装饰 */}
            <span aria-hidden className="absolute bottom-0 left-0 h-[160px] w-[46%]" style={{ background: 'rgba(53,209,232,0.75)', clipPath: 'polygon(0 100%, 0 20%, 100% 100%)' }} />
            <span aria-hidden className="absolute bottom-0 right-0 h-[210px] w-[58%]" style={{ background: '#1b57ff', clipPath: 'polygon(100% 100%, 100% 0, 0 100%)' }} />
            <span aria-hidden className="absolute bottom-[150px] left-[10%] h-0 w-0 border-y-[10px] border-l-[18px] border-y-transparent" style={{ borderLeftColor: 'rgba(53,209,232,0.9)' }} />

            {/* 主体（弹簧入场；文字层只 translate/scale，倾斜全在装饰带上） */}
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 26 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 240 }}
              className="relative z-10 flex w-full flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                animate={{ rotate: [0, 3, -3, 0], scale: [1, 1.05, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.8 }}
              >
                <ShatteredStar magenta className="w-[210px]" />
              </motion.div>

              {/* 白斜面板：恭喜升级！ */}
              <div className="relative mt-2 w-[86%] max-w-md">
                <div className="px-6 pb-3 pt-4 text-center" style={{ background: 'rgba(255,255,255,0.94)', clipPath: 'polygon(3% 14%, 100% 0, 97% 100%, 0 92%)', boxShadow: '0 16px 40px rgba(38,96,140,0.18)' }}>
                  <div className="text-[30px] font-black italic leading-none" style={{ color: '#1b57ff' }}>恭喜升级！</div>
                </div>
                {/* 蓝斜带：超大白字属性名 */}
                <div className="-mt-1 px-6 py-4 text-center" style={{ background: '#1b57ff', clipPath: 'polygon(0 10%, 100% 0, 100% 90%, 3% 100%)', boxShadow: '0 18px 44px rgba(27,87,255,0.35)' }}>
                  <div className="truncate text-[54px] font-black italic leading-none text-white">{attributeName}</div>
                </div>
              </div>

              {/* Lv.N-1 → Lv.N */}
              <div className="mt-6 flex items-end justify-center gap-4">
                <span className="text-[26px] font-black italic leading-none" style={{ color: 'rgba(27,87,255,0.55)' }}>Lv.{newLevel - 1}</span>
                <span aria-hidden className="pb-1 text-[22px] font-black" style={{ color: '#1b57ff' }}>→</span>
                <span className="relative text-[44px] font-black italic leading-none" style={{ color: '#1b57ff' }}>
                  Lv.{newLevel}
                  <span aria-hidden className="absolute -bottom-2 left-0 right-0 h-[3px]" style={{ background: '#35d1e8' }} />
                  <span aria-hidden className="absolute -bottom-2 right-[-14px] h-[3px] w-[10px]" style={{ background: '#f0417f' }} />
                </span>
              </div>

              <p className="mt-6 text-[16px] font-black" style={{ color: '#1b57ff' }}>继续加油，你越来越强了！</p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export const LevelUpModal = (props: LevelUpModalProps) => {
  const p3 = useUiChannel() === 'p3';
  if (p3) return <LevelUpP3 {...props} />;
  const { attributeName, newLevel, isOpen, onClose } = props;
  return (
  <CelebrationCutIn
    isOpen={isOpen}
    onClose={onClose}
    theme="gold"
    autoCloseMs={3000}
    particles={30}
    onShown={triggerLevelFeedback}
    icon={
      <motion.span
        className="inline-block"
        animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1 }}
      >
        ⭐
      </motion.span>
    }
    title="恭喜升级！"
  >
    <div className="text-5xl font-bold text-white my-3">{attributeName}</div>
    <div className="flex items-center justify-center gap-4 text-3xl font-bold text-white">
      <span>Lv.{newLevel - 1}</span>
      <span>→</span>
      <span className="text-yellow-200">Lv.{newLevel}</span>
    </div>
    <p className="mt-5 text-lg text-white/90">继续加油，你越来越强了！</p>
  </CelebrationCutIn>
  );
};
