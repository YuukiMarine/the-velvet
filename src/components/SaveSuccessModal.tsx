import { motion } from 'motion/react';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { MusicalNotes } from '@/components/MusicalNotes';
import { BandCutInP3 } from '@/components/TodoCompleteModal';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerSuccessFeedback } from '@/utils/feedback';

/**
 * 记录成功庆祝 —— P7.2 第一波收编进 CelebrationCutIn 基座。
 * tone 映射：important→gold（重要记录金色），default→emerald（日常成长绿）。
 */
interface SaveSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  description: string;
  pointsAwarded: Record<string, number>;
  tone?: 'default' | 'important';
  unlockHint?: {
    achievements: number;
    skills: number;
  };
}

export const SaveSuccessModal = ({ isOpen, onClose, description, pointsAwarded, tone = 'default', unlockHint }: SaveSuccessModalProps) => {
  const totalPoints = Object.values(pointsAwarded).reduce((sum, points) => sum + points, 0);
  const p3 = useUiChannel() === 'p3';
  // p3：复用今日完成的横贯斜带 cut-in（含蓝色划过高光），标题换「记录成功」
  if (p3) return <BandCutInP3 isOpen={isOpen} onClose={onClose} title={description} totalPoints={totalPoints} unlockHint={unlockHint} eyebrow="记录成功" ghost="SAVED" />;
  return (
    <CelebrationCutIn
      isOpen={isOpen}
      onClose={onClose}
      theme={tone === 'important' ? 'gold' : 'emerald'}
      autoCloseMs={3000}
      particles={20}
      onShown={triggerSuccessFeedback}
      icon={
        <motion.span
          className="inline-block"
          animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 0.8 }}
        >
          ✨
        </motion.span>
      }
      title="记录成功！"
      subtitle={description}
      overlayExtras={totalPoints > 0 ? <MusicalNotes count={totalPoints} delay={0.3} /> : undefined}
    >
      <div className="rounded-lg bg-white/20 p-3 backdrop-blur-md">
        <div className="text-lg font-bold text-white">获得 {totalPoints} 点！</div>
      </div>
      {unlockHint && (unlockHint.achievements > 0 || unlockHint.skills > 0) && (
        <div className="mt-3 text-sm text-white/90">您解锁了新成就/新技能！</div>
      )}
    </CelebrationCutIn>
  );
};
