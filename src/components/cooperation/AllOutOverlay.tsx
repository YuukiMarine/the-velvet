/**
 * 总攻击 · ALL-OUT 全屏特效
 *
 * 触发：CoopShadowBattleModal 里点击总攻击 → setIsFiring(true)
 * 效果：1.2s 的紧凑三幕
 *   1) 全屏红紫混色闪光 (0–0.25s)
 *   2) 大号 "ALL-OUT ATTACK!" 扫入 (0.25–0.9s)
 *   3) Persona 名 + 粒子散出 (0.9–1.3s)
 */

import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface Props {
  isFiring: boolean;
  personaName: string;
}

// 24 颗放射粒子
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  angle: (i / 24) * 360,
  distance: 140 + (i % 4) * 30,
  size: 3 + (i % 3) * 2,
  delay: (i % 6) * 0.02,
  color: (['#f59e0b', '#dc2626', '#a855f7', '#ffffff'] as const)[i % 4],
}));

export function AllOutOverlay({ isFiring, personaName }: Props) {
  return createPortal(
    <AnimatePresence>
      {isFiring && (
        <motion.div
          key="allout-root"
          className="fixed inset-0 z-[220] pointer-events-none flex items-center justify-center overflow-hidden"
        >
          {/* 幕 1：瞬间闪光 */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.6, 0] }}
            transition={{ duration: 0.6, times: [0, 0.15, 0.4, 1] }}
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at center, rgba(251,191,36,0.9) 0%, rgba(220,38,38,0.55) 30%, rgba(88,28,135,0.3) 60%, transparent 90%)',
            }}
          />

          {/* 幕 2：对角斜切条（Persona 5 既视感） */}
          <motion.div
            aria-hidden
            initial={{ x: '-120%', skewX: '-18deg' }}
            animate={{ x: '120%' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="absolute top-1/4 h-1/2 w-[140%]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(220,38,38,0.85), rgba(251,191,36,0.85), transparent)',
              boxShadow: '0 0 60px 10px rgba(220,38,38,0.5)',
              mixBlendMode: 'screen',
            }}
          />

          {/* 粒子散射 */}
          <div className="absolute left-1/2 top-1/2">
            {PARTICLES.map(p => (
              <motion.div
                key={p.id}
                aria-hidden
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.5 }}
                animate={{
                  x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
                  y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
                  opacity: [0, 1, 0],
                  scale: [0.5, 1.2, 0.3],
                }}
                transition={{ duration: 0.9, delay: 0.3 + p.delay, ease: 'easeOut' }}
                className="absolute rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  background: p.color,
                  boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                }}
              />
            ))}
          </div>

          {/* 幕 3：大字 */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0, rotate: -4 }}
            animate={{
              scale: [0.3, 1.15, 1, 1],
              opacity: [0, 1, 1, 0],
              rotate: [-4, 0, 0, 2],
            }}
            transition={{ duration: 1.3, times: [0, 0.25, 0.7, 1], delay: 0.25 }}
            className="relative text-center select-none"
          >
            <div
              className="text-5xl sm:text-6xl font-black tracking-[0.15em] leading-none"
              style={{
                color: '#fef3c7',
                WebkitTextStroke: '2px #dc2626',
                textShadow: '0 0 24px rgba(251,191,36,0.8), 0 0 50px rgba(220,38,38,0.6)',
                fontFamily: "'Impact', 'Arial Black', sans-serif",
              }}
            >
              ALL-OUT
            </div>
            <div
              className="text-3xl sm:text-4xl font-black tracking-[0.2em] leading-none mt-1"
              style={{
                color: '#fbbf24',
                WebkitTextStroke: '1px #7c1d1d',
                textShadow: '0 0 16px rgba(251,191,36,0.6)',
                fontFamily: "'Impact', 'Arial Black', sans-serif",
              }}
            >
              ATTACK!
            </div>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -4] }}
              transition={{ duration: 1.1, times: [0, 0.35, 0.75, 1], delay: 0.5 }}
              className="mt-3 text-sm font-bold tracking-[0.3em] text-white/90"
              style={{ textShadow: '0 0 8px rgba(0,0,0,0.9)' }}
            >
              {personaName.toUpperCase()}
            </motion.div>
          </motion.div>

          {/* 顶/底黑边条（电影感） */}
          <motion.div
            aria-hidden
            initial={{ height: 0 }}
            animate={{ height: ['0%', '12%', '12%', '0%'] }}
            transition={{ duration: 1.3, times: [0, 0.18, 0.7, 1] }}
            className="absolute top-0 left-0 right-0 bg-black"
          />
          <motion.div
            aria-hidden
            initial={{ height: 0 }}
            animate={{ height: ['0%', '12%', '12%', '0%'] }}
            transition={{ duration: 1.3, times: [0, 0.18, 0.7, 1] }}
            className="absolute bottom-0 left-0 right-0 bg-black"
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
