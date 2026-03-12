import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface SplashScreenProps {
  isVisible: boolean;
  onComplete: () => void;
}

export const SplashScreen = ({ isVisible, onComplete }: SplashScreenProps) => {
  const [showText, setShowText] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);

  useEffect(() => {
    if (isVisible) {
      const textTimer = setTimeout(() => setShowText(true), 300);
      const subtitleTimer = setTimeout(() => setShowSubtitle(true), 800);
      const completeTimer = setTimeout(() => {
        onComplete();
      }, 2500);

      return () => {
        clearTimeout(textTimer);
        clearTimeout(subtitleTimer);
        clearTimeout(completeTimer);
      };
    }
  }, [isVisible, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#0b061a] via-[#1a0b2e] to-black flex items-center justify-center z-50 overflow-hidden">
      <style>{`
        @keyframes vr-slide-ltr {
          from { transform: translateX(-30%); }
          to   { transform: translateX(10%); }
        }
        @keyframes vr-slide-rtl {
          from { transform: translateX(10%); }
          to   { transform: translateX(-30%); }
        }
        .vr-marquee-top {
          animation: vr-slide-ltr 2.5s linear forwards;
          white-space: nowrap;
          font-size: clamp(5rem, 22vw, 14rem);
          font-weight: 900;
          font-style: italic;
          color: transparent;
          -webkit-text-stroke: 1px rgba(255,255,255,0.55);
          letter-spacing: -0.02em;
          line-height: 1;
          font-family: sans-serif;
        }
        .vr-marquee-btm {
          animation: vr-slide-rtl 2.5s linear forwards;
          white-space: nowrap;
          font-size: clamp(5rem, 22vw, 14rem);
          font-weight: 900;
          font-style: italic;
          color: transparent;
          -webkit-text-stroke: 1px rgba(255,255,255,0.55);
          letter-spacing: -0.02em;
          line-height: 1;
          font-family: sans-serif;
        }
      `}</style>

      {/* 上方大字 — 从左到右 */}
      <div className="absolute top-[8%] left-0 right-0 overflow-hidden pointer-events-none select-none">
        <div className="vr-marquee-top">THE VELVET</div>
      </div>

      {/* 下方大字 — 从右到左 */}
      <div className="absolute bottom-[8%] left-0 right-0 overflow-hidden pointer-events-none select-none">
        <div className="vr-marquee-btm">THE VELVET</div>
      </div>

      {/* 背景动画粒子 */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              scale: 0,
              opacity: 0
            }}
            animate={{
              y: [null, -100],
              scale: [0, 1, 0],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: 2 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2
            }}
            className="absolute w-2 h-2 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`
            }}
          />
        ))}
      </div>

      {/* 主要内容 */}
      <div className="relative z-10 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            duration: 1,
            damping: 20,
            stiffness: 100
          }}
          className="mb-8"
        >
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatType: "reverse"
            }}
            className="text-6xl font-bold text-white"
          >
            靛蓝色房间
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: showText ? 1 : 0, y: showText ? 0 : 20 }}
          transition={{ duration: 0.8 }}
          className="text-2xl font-semibold text-white mb-2"
        >
          个人成长追踪器
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: showSubtitle ? 1 : 0, y: showSubtitle ? 0 : 20 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg text-white/80"
        >
          愿您成为最棒的客人
        </motion.div>

        {/* 加载动画 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 flex justify-center"
        >
          <div className="flex space-x-2">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2
                }}
                className="w-3 h-3 bg-white rounded-full"
              />
            ))}
          </div>
        </motion.div>
      </div>

      {/* 底部提示 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-0 right-0 text-center"
      >
        <p className="text-white/60 text-sm">
          正在启动应用...
        </p>
      </motion.div>
    </div>
  );
};
