import { motion } from 'motion/react';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { triggerLevelFeedback } from '@/utils/feedback';

/**
 * 成就解锁庆祝 —— P7.2 第一波收编进 CelebrationCutIn 基座。
 * 相比旧手写版新增：backdrop 点击跳过 + ESC/Android back（旧版只有 X 和自动关）。
 */
interface AchievementUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  achievementTitle: string;
}

export const AchievementUnlockModal = ({ isOpen, onClose, achievementTitle }: AchievementUnlockModalProps) => (
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
