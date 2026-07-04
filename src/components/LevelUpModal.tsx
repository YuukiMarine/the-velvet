import { motion } from 'motion/react';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { triggerLevelFeedback } from '@/utils/feedback';

/**
 * 属性升级庆祝 —— P7.2 第一波收编：视觉内容保留，行为（portal/celebration 层/
 * 三路关闭/自动关/音效单次）全部交给 CelebrationCutIn 基座。
 */
interface LevelUpModalProps {
  attributeName: string;
  newLevel: number;
  isOpen: boolean;
  onClose: () => void;
}

export const LevelUpModal = ({ attributeName, newLevel, isOpen, onClose }: LevelUpModalProps) => (
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
