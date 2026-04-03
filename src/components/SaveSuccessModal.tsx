import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { triggerSuccessFeedback } from '@/utils/feedback';
import { MusicalNotes } from '@/components/MusicalNotes';

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
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);
  const playedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!playedRef.current) {
        triggerSuccessFeedback();
        playedRef.current = true;
      }
      const newParticles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100 - 50,
        y: Math.random() * 100 - 50,
        delay: Math.random() * 0.3
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => {
        onClose();
      }, 3000);

      return () => clearTimeout(timer);
    }
    playedRef.current = false;
  }, [isOpen, onClose]);

  const totalPoints = Object.values(pointsAwarded).reduce((sum, points) => sum + points, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotate: -180 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.5, opacity: 0, rotate: 180 }}
            transition={{ type: 'spring', duration: 0.6 }}
            className={`rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden ${
              tone === 'important'
                ? 'bg-gradient-to-br from-yellow-300 via-amber-400 to-orange-500'
                : 'bg-gradient-to-br from-green-400 via-blue-500 to-purple-600'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 粒子效果 */}
            {particles.map((particle) => (
              <motion.div
                key={particle.id}
                initial={{ 
                  x: 0, 
                  y: 0, 
                  scale: 0,
                  opacity: 1 
                }}
                animate={{ 
                  x: particle.x * 3,
                  y: particle.y * 3,
                  scale: [0, 1.5, 0],
                  opacity: [1, 1, 0]
                }}
                transition={{ 
                  duration: 1.2,
                  delay: particle.delay,
                  ease: 'easeOut'
                }}
                className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full"
                style={{ 
                  boxShadow: '0 0 8px rgba(255, 255, 255, 0.8)' 
                }}
              />
            ))}

            {/* 主要内容 */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-center relative z-10"
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.3, 1],
                  rotate: [0, 10, -10, 0]
                }}
                transition={{ 
                  duration: 0.5,
                  repeat: Infinity,
                  repeatDelay: 0.8
                }}
                className="text-6xl mb-3"
              >
                ✨
              </motion.div>

              <h2 className="text-2xl font-bold text-white mb-2">
                记录成功！
              </h2>

              <div className="text-white/90 text-sm mb-3 line-clamp-2">
                {description}
              </div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ 
                  type: 'spring',
                  delay: 0.4,
                  stiffness: 200
                }}
                className="bg-white/20 backdrop-blur-md rounded-lg p-3"
              >
                <div className="text-white text-lg font-bold">
                  获得 {totalPoints} 点！
                </div>
              </motion.div>
              {unlockHint && (unlockHint.achievements > 0 || unlockHint.skills > 0) && (
                <div className="mt-3 text-sm text-white/90">
                  您解锁了新成就/新技能！
                </div>
              )}
            </motion.div>

            {/* 光晕效果 */}
            <motion.div
              animate={{ 
                scale: [1, 1.3, 1],
                opacity: [0.4, 0.7, 0.4]
              }}
              transition={{ 
                duration: 1.5,
                repeat: Infinity
              }}
              className="absolute inset-0 bg-gradient-radial from-white/20 to-transparent"
            />
          </motion.div>
          {totalPoints > 0 && <MusicalNotes count={totalPoints} delay={0.3} />}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
