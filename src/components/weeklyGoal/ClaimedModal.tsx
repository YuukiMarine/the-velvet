import { motion } from 'motion/react';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';

/**
 * 周目标奖励领取确认 —— P7.2 第一波收编进 CelebrationCutIn 基座
 * （data 驱动开合：isOpen = !!data）。
 */
export const ClaimedModal = ({
  data,
  onClose,
}: {
  data: { attrName: string; pts: number } | null;
  onClose: () => void;
}) => (
  <CelebrationCutIn
    isOpen={!!data}
    onClose={onClose}
    theme="gold"
    autoCloseMs={2600}
    particles={20}
    icon={
      <motion.span
        className="inline-block"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: [0, 1.3, 1], rotate: 0 }}
        transition={{ duration: 0.5, type: 'spring', delay: 0.1 }}
      >
        ✨
      </motion.span>
    }
    title="奖励已领取！"
  >
    {data && (
      <p className="text-base font-semibold text-white/90">
        {data.attrName} <span className="text-2xl font-black">+{data.pts}</span>
      </p>
    )}
  </CelebrationCutIn>
);
