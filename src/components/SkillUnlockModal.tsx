import { motion } from 'motion/react';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { UnlockCutInP5 } from '@/components/p5r/cutins';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerLevelFeedback } from '@/utils/feedback';

/** 技能解锁庆祝 —— P7.2 第一波收编进 CelebrationCutIn 基座。
 *  P5R：与成就解锁共用 UnlockCutInP5 壳（同一张 p5-modal-07 制式，只换标题与副文）。 */
interface SkillUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  skillName: string;
}

export const SkillUnlockModal = ({ isOpen, onClose, skillName }: SkillUnlockModalProps) => {
  const channel = useUiChannel();
  if (channel === 'p5') {
    return (
      <UnlockCutInP5
        isOpen={isOpen}
        onClose={onClose}
        heading="技能解锁！"
        name={skillName}
        lines={['新技能已激活', '属性加成自动生效']}
      />
    );
  }
  return (
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
};
