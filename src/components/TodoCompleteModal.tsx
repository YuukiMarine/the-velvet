import { motion } from 'motion/react';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { MusicalNotes } from '@/components/MusicalNotes';
import { triggerSuccessFeedback } from '@/utils/feedback';

/**
 * 任务完成庆祝 —— P7.2 第一波收编进 CelebrationCutIn 基座。
 * 相比旧手写版新增：portal + zClass.celebration（旧版树内 z-50，会被黑猫窗盖住）、
 * ESC/Android back。音符雨走 overlayExtras（卡片外，不被 overflow 裁切）。
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

export const TodoCompleteModal = ({ isOpen, onClose, title, totalPoints, unlockHint }: TodoCompleteModalProps) => (
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
