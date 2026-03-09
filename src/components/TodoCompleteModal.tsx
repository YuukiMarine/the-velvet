import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { triggerSuccessFeedback } from '@/utils/feedback';

interface TodoCompleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  unlockHint?: {
    achievements: number;
    skills: number;
  };
}

export const TodoCompleteModal = ({ isOpen, onClose, title, unlockHint }: TodoCompleteModalProps) => {
  const [ribbons, setRibbons] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);
  const playedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!playedRef.current) {
        triggerSuccessFeedback();
        playedRef.current = true;
      }
      const newRibbons = Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: Math.random() * 260 - 130,
        y: Math.random() * 200 - 100,
        delay: Math.random() * 0.4
      }));
      setRibbons(newRibbons);

      const timer = setTimeout(() => {
        onClose();
      }, 2200);

      return () => clearTimeout(timer);
    }
    playedRef.current = false;
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0, rotate: 6 }}
            transition={{ type: 'spring', duration: 0.6 }}
            className="bg-gradient-to-br from-emerald-400 via-teal-500 to-sky-500 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {ribbons.map((ribbon) => (
              <motion.div
                key={ribbon.id}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                animate={{
                  x: ribbon.x,
                  y: ribbon.y,
                  opacity: [0, 1, 0],
                  scale: [0, 1.2, 0]
                }}
                transition={{ duration: 1.6, delay: ribbon.delay, ease: 'easeOut' }}
                className="absolute top-1/2 left-1/2 w-3 h-3 bg-white rounded-full"
                style={{ boxShadow: '0 0 10px rgba(255, 255, 255, 0.8)' }}
              />
            ))}

            <div className="relative z-10 text-center">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.6 }}
                className="text-5xl mb-3"
              >
                ✅
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-2">今日完成</h2>
              <p className="text-white/90 text-sm mb-4 line-clamp-2">{title}</p>
              {unlockHint && (unlockHint.achievements > 0 || unlockHint.skills > 0) && (
                <div className="text-white/90 text-sm mb-4">您解锁了新成就/新技能！</div>
              )}
              <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '0%' }}
                  transition={{ duration: 1.6, ease: 'easeInOut' }}
                  className="h-full bg-white rounded-full"
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
