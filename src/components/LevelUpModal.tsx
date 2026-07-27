import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { ShatteredStar } from '@/components/p3r/kit';
import { LevelUpP5 } from '@/components/p5r/cutins';
import { useBoldness } from '@/utils/boldness';
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
  const anim = useBoldness();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.celebration} flex items-center justify-center overflow-hidden bg-black/55 p-5 backdrop-blur-sm`}
          onClick={onClose}
        >
          {/* 紧凑大卡（用户定稿：不占满全屏、四周留出背景）；演出元素全部收进卡内 */}
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`恭喜升级！${attributeName} Lv.${newLevel}`}
            initial={{ scale: 0.6, opacity: 0, y: 26 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 240 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm overflow-hidden pb-9 pt-7 shadow-2xl"
            style={{
              background: 'linear-gradient(170deg, #eef7fc 0%, #dff0f9 55%, #cfeaf6 100%)',
              clipPath: 'polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)',
            }}
          >
            {/* 背景：LEVEL 幽灵字（错帧滑入）+ 巨大新等级数字（从深处 zoom 就位）（B2） */}
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-[-8px] top-[2%] select-none font-black italic leading-none"
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '4rem', color: 'rgba(147,190,222,0.34)', rotate: -8 }}
              initial={anim ? { x: -36, opacity: 0 } : false}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.14, ease: [0.2, 0.8, 0.3, 1] }}
            >
              LEVEL
            </motion.div>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[1%] select-none font-black italic leading-none tabular-nums"
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '10rem', color: 'rgba(147,190,222,0.26)', x: '-50%' }}
              initial={anim ? { scale: 1.8, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}
            >
              {String(newLevel).padStart(2, '0')}
            </motion.div>
            {/* 右上蓝角 + 关闭 */}
            <span aria-hidden className="absolute right-0 top-0 h-[84px] w-[96px]" style={{ background: '#1b57ff', clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="关闭"
              className="absolute right-2 top-2 z-20 flex h-10 w-10 items-center justify-center text-2xl font-black text-white"
            >
              ×
            </motion.button>
            {/* 底部蓝三角群装饰：自下错帧戳入（B2） */}
            <motion.span
              aria-hidden
              className="absolute bottom-0 left-0 h-[72px] w-[42%]"
              style={{ background: 'rgba(53,209,232,0.75)', clipPath: 'polygon(0 100%, 0 20%, 100% 100%)' }}
              initial={anim ? { y: 44, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.16 }}
            />
            <motion.span
              aria-hidden
              className="absolute bottom-0 right-0 h-[96px] w-[54%]"
              style={{ background: '#1b57ff', clipPath: 'polygon(100% 100%, 100% 0, 0 100%)' }}
              initial={anim ? { y: 56, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.24 }}
            />

            {/* 主体（文字层只 translate/scale，倾斜全在装饰带上） */}
            <div className="relative z-10 flex w-full flex-col items-center">
              <motion.div
                animate={{ rotate: [0, 3, -3, 0], scale: [1, 1.05, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 0.8 }}
              >
                <ShatteredStar magenta className="w-[136px]" />
              </motion.div>

              {/* 白斜面板：恭喜升级！（自上砸入，B2） */}
              <div className="relative mt-1 w-[84%]">
                <motion.div
                  className="px-5 pb-2.5 pt-3 text-center"
                  style={{ background: 'rgba(255,255,255,0.94)', clipPath: 'polygon(3% 14%, 100% 0, 97% 100%, 0 92%)', boxShadow: '0 12px 30px rgba(38,96,140,0.18)' }}
                  initial={anim ? { y: -18, opacity: 0 } : false}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26, delay: 0.2 }}
                >
                  <div className="text-[22px] font-black italic leading-none" style={{ color: '#1b57ff' }}>恭喜升级！</div>
                </motion.div>
                {/* 蓝斜带：超大白字属性名 slam 就位 + 白闪一帧（格斗 hit-flash，B2） */}
                <motion.div
                  className="relative -mt-1 px-5 py-3 text-center"
                  style={{ background: '#1b57ff', clipPath: 'polygon(0 10%, 100% 0, 100% 90%, 3% 100%)', boxShadow: '0 14px 34px rgba(27,87,255,0.35)' }}
                  initial={anim ? { scale: 1.18, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 24, delay: 0.32 }}
                >
                  <div className="truncate text-[38px] font-black italic leading-none text-white">{attributeName}</div>
                  {anim && (
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{ background: '#fff' }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.85, 0] }}
                      transition={{ duration: 0.3, delay: 0.46, times: [0, 0.35, 1] }}
                    />
                  )}
                </motion.div>
              </div>

              {/* Lv.N-1 → Lv.N */}
              <div className="mt-5 flex items-end justify-center gap-3">
                <span className="text-[20px] font-black italic leading-none" style={{ color: 'rgba(27,87,255,0.55)' }}>Lv.{newLevel - 1}</span>
                <span aria-hidden className="pb-0.5 text-[18px] font-black" style={{ color: '#1b57ff' }}>→</span>
                <span className="relative text-[34px] font-black italic leading-none" style={{ color: '#1b57ff' }}>
                  Lv.{newLevel}
                  <span aria-hidden className="absolute -bottom-2 left-0 right-0 h-[3px]" style={{ background: '#35d1e8' }} />
                  <span aria-hidden className="absolute -bottom-2 right-[-12px] h-[3px] w-[9px]" style={{ background: '#f0417f' }} />
                </span>
              </div>

              <p className="mt-5 text-[14px] font-black" style={{ color: '#1b57ff' }}>继续加油，你越来越强了！</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export const LevelUpModal = (props: LevelUpModalProps) => {
  const channel = useUiChannel();
  // P5R（p5-modal-05 稿）：红频道换「猩红大板砸落」全屏演出
  if (channel === 'p5') return <LevelUpP5 {...props} />;
  const p3 = channel === 'p3';
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
