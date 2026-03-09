import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { triggerLevelFeedback } from '@/utils/feedback';

interface AchievementUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  achievementTitle: string;
}

export const AchievementUnlockModal = ({ isOpen, onClose, achievementTitle }: AchievementUnlockModalProps) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);
  const playedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!playedRef.current) {
        triggerLevelFeedback();
        playedRef.current = true;
      }
      const newParticles = Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: Math.random() * 300 - 150,
        y: Math.random() * 300 - 150,
        delay: Math.random() * 0.6
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => {
        onClose();
      }, 4500);

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
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.3, opacity: 0, rotate: -15 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0, rotate: 15 }}
            transition={{ type: "spring", damping: 15, stiffness: 400 }}
            className="bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
          >
            {/* 背景光效 */}
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-transparent" />
            
            {/* 星星粒子效果 */}
            <div className="absolute inset-0">
              {particles.map((particle) => (
                <motion.div
                  key={particle.id}
                  initial={{ opacity: 0, scale: 0, rotate: 0, x: 0, y: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0],
                    scale: [0, 2, 0],
                    rotate: [0, 180],
                    x: [0, particle.x],
                    y: [0, particle.y]
                  }}
                  transition={{ 
                    duration: 2,
                    delay: particle.delay,
                    ease: "easeOut"
                  }}
                  className="absolute text-2xl"
                  style={{ left: '50%', top: '50%' }}
                >
                  ✨
                </motion.div>
              ))}
            </div>

            <div className="relative z-10 text-center">
              {/* 成就奖杯 */}
              <motion.div
                initial={{ scale: 0, rotate: -360 }}
                animate={{ scale: [0, 1.5, 1], rotate: 0 }}
                transition={{ duration: 1, delay: 0.2, type: "spring" }}
                className="text-9xl mb-6"
              >
                🏆
              </motion.div>
              
              {/* 闪耀效果 */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 2, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 1.5, delay: 0.5, repeat: 2 }}
                className="absolute top-20 left-1/2 transform -translate-x-1/2 text-6xl"
              >
                ⭐
              </motion.div>
              
              {/* 标题 */}
              <motion.h2
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className="text-4xl font-bold text-white mb-4"
              >
                成就解锁！
              </motion.h2>
              
              {/* 成就名称 */}
              <motion.p
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.8 }}
                className="text-2xl text-white/95 mb-6 font-semibold"
              >
                {achievementTitle}
              </motion.p>
              
              {/* 提示文字 */}
              <motion.p
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1, duration: 0.8 }}
                className="text-base text-white/80 mb-8"
              >
                恭喜你达成新成就！继续努力解锁更多内容
              </motion.p>
              
              {/* 进度条 */}
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "100%", opacity: 1 }}
                transition={{ delay: 1.2, duration: 2.5, ease: "easeInOut" }}
                className="h-2 bg-white/30 rounded-full overflow-hidden"
              >
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "0%" }}
                  transition={{ delay: 1.2, duration: 2.5, ease: "easeInOut" }}
                  className="h-full bg-gradient-to-r from-white via-yellow-200 to-white rounded-full"
                />
              </motion.div>
            </div>
            
            {/* 关闭按钮 */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2 }}
              onClick={onClose}
              className="absolute top-4 right-4 w-10 h-10 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors text-xl"
            >
              ×
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
