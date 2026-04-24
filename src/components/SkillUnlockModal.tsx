import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { triggerLevelFeedback } from '@/utils/feedback';
import { useBackHandler } from '@/utils/useBackHandler';

interface SkillUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  skillName: string;
}

export const SkillUnlockModal = ({ isOpen, onClose, skillName }: SkillUnlockModalProps) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);
  const playedRef = useRef(false);
  useBackHandler(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      if (!playedRef.current) {
        triggerLevelFeedback();
        playedRef.current = true;
      }
      const newParticles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 200 - 100,
        y: Math.random() * 200 - 100,
        delay: Math.random() * 0.5
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => {
        onClose();
      }, 4000);

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
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.5, opacity: 0, rotate: 10 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
          >
            {/* 背景光效 */}
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/10 to-transparent" />
            
            {/* 粒子效果 */}
            <div className="absolute inset-0">
              {particles.map((particle) => (
                <motion.div
                  key={particle.id}
                  initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0],
                    scale: [0, 1.5, 0],
                    x: [0, particle.x],
                    y: [0, particle.y]
                  }}
                  transition={{ 
                    duration: 1.5,
                    delay: particle.delay,
                    ease: "easeOut"
                  }}
                  className="absolute w-3 h-3 bg-white rounded-full"
                  style={{ left: '50%', top: '50%' }}
                />
              ))}
            </div>

            <div className="relative z-10 text-center">
              {/* 技能图标 */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: [0, 1.3, 1], rotate: 0 }}
                transition={{ duration: 0.8, delay: 0.2, type: "spring" }}
                className="text-8xl mb-6"
              >
                ⚡
              </motion.div>
              
              {/* 标题 */}
              <motion.h2
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="text-3xl font-bold text-white mb-3"
              >
                技能解锁！
              </motion.h2>
              
              {/* 技能名称 */}
              <motion.p
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="text-xl text-white/90 mb-6"
              >
                {skillName}
              </motion.p>
              
              {/* 提示文字 */}
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="text-sm text-white/70"
              >
                新技能已激活，属性加成自动生效
              </motion.p>
              
              {/* 进度条 */}
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "100%", opacity: 1 }}
                transition={{ delay: 1, duration: 2, ease: "easeInOut" }}
                className="mt-6 h-1 bg-white/30 rounded-full overflow-hidden"
              >
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "0%" }}
                  transition={{ delay: 1, duration: 2, ease: "easeInOut" }}
                  className="h-full bg-white rounded-full"
                />
              </motion.div>
            </div>
            
            {/* 关闭按钮 */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              ×
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
