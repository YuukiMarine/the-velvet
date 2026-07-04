import { motion } from 'motion/react';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { triggerLevelFeedback } from '@/utils/feedback';

/** 技能解锁庆祝 —— P7.2 第一波收编进 CelebrationCutIn 基座。 */
interface SkillUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  skillName: string;
}

export const SkillUnlockModal = ({ isOpen, onClose, skillName }: SkillUnlockModalProps) => (
  <CelebrationCutIn
    isOpen={isOpen}
    onClose={onClose}
    theme="violet"
    autoCloseMs={4000}
    particles={30}
    onShown={triggerLevelFeedback}
    icon={
      <motion.span
        className="inline-block"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: [0, 1.3, 1], rotate: 0 }}
        transition={{ duration: 0.8, delay: 0.2, type: 'spring' }}
      >
        ⚡
      </motion.span>
    }
    title="技能解锁！"
  >
    <p className="text-xl text-white/90">{skillName}</p>
    <p className="mt-4 text-sm text-white/70">新技能已激活，属性加成自动生效</p>
  </CelebrationCutIn>
);
