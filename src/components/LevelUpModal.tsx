import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { triggerLevelFeedback } from '@/utils/feedback';

interface LevelUpModalProps {
  attributeName: string;
  newLevel: number;
  isOpen: boolean;
  onClose: () => void;
}

export const LevelUpModal = ({ attributeName, newLevel, isOpen, onClose }: LevelUpModalProps) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);
  const playedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!playedRef.current) {
        triggerLevelFeedback();
        playedRef.current = true;
      }
      const newParticles = Array.from({ length: 30 }, (_, i) => ({
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotateY: -180 }}
            animate={{ scale: 1, opacity: 1, rotateY: 0 }}
            exit={{ scale: 0.5, opacity: 0, rotateY: 180 }}
            transition={{ type: 'spring', duration: 0.8 }}
            className="bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
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
                  x: particle.x * 4,
                  y: particle.y * 4,
                  scale: [0, 1.5, 0],
                  opacity: [1, 1, 0]
                }}
                transition={{ 
                  duration: 1.5,
                  delay: particle.delay,
                  ease: 'easeOut'
                }}
                className="absolute top-1/2 left-1/2 w-3 h-3 bg-yellow-300 rounded-full"
                style={{ 
                  boxShadow: '0 0 10px rgba(255, 255, 0, 0.8)' 
                }}
              />
            ))}

            {/* 主要内容 */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center relative z-10"
            >
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ 
                  duration: 0.6,
                  repeat: Infinity,
                  repeatDelay: 1
                }}
                className="text-7xl mb-4"
              >
                ⭐
              </motion.div>

              <h2 className="text-4xl font-bold text-white mb-2">
                恭喜升级！
              </h2>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ 
                  type: 'spring',
                  delay: 0.5,
                  stiffness: 200
                }}
                className="text-6xl font-bold text-white my-4"
              >
                {attributeName}
              </motion.div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ 
                  type: 'spring',
                  delay: 0.7,
                  stiffness: 150
                }}
                className="flex items-center justify-center gap-4 text-3xl font-bold text-white"
              >
                <span>Lv.{newLevel - 1}</span>
                <span>→</span>
                <span className="text-yellow-200">Lv.{newLevel}</span>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-6 text-white/90 text-lg"
              >
                继续加油，你越来越强了！
              </motion.p>
            </motion.div>

            {/* 光晕效果 */}
            <motion.div
              animate={{ 
                scale: [1, 1.5, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity
              }}
              className="absolute inset-0 bg-gradient-radial from-yellow-300/30 to-transparent"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
