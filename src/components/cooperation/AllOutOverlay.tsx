/**
 * 总攻击 · ALL-OUT 全屏特效
 *
 * 触发：CoopShadowBattleModal 里点击总攻击 → setIsFiring(true)
 * 效果（第 6 轮重做：双人名 + 双斩 + 伤害数字，1.8s）：
 *   1) 全屏红紫混色闪光 (0–0.6s)
 *   2) 两道对角斜切条交叉划过——两个人各斩一刀 (0.15–1.15s)
 *   3) 大号 "ALL-OUT ATTACK!" 扫入，下面是「我的 Persona × 同伴」(0.25–1.8s)
 *   4) 伤害数字在服务器回来的那一刻砸下来（请求比特效快时约在 0.3s，慢时晚一点）
 */

import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';

interface Props {
  isFiring: boolean;
  personaName: string;
  /** 同伴名（双人名那一行） */
  partnerName?: string;
  /** 这一发的伤害（请求回来之前是 null） */
  damage?: number | null;
}

const TOTAL = 1.8;

// 24 颗放射粒子
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  angle: (i / 24) * 360,
  distance: 140 + (i % 4) * 30,
  size: 3 + (i % 3) * 2,
  delay: (i % 6) * 0.02,
  color: (['#f59e0b', '#dc2626', 'rgb(var(--color-bond-bright-rgb))', '#ffffff'] as const)[i % 4],
}));

export function AllOutOverlay({ isFiring, personaName, partnerName, damage }: Props) {
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

          {/* 幕 2：双斩——第一刀从左上划过，第二刀反方向交叉（两个人各一刀） */}
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
          <motion.div
            aria-hidden
            initial={{ x: '120%', skewX: '18deg' }}
            animate={{ x: '-120%' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
            className="absolute top-[30%] h-[40%] w-[140%]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.8), rgba(196,181,253,0.85), transparent)',
              boxShadow: '0 0 60px 10px rgba(99,102,241,0.45)',
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

          {/* 幕 3：大字 + 双人名 + 伤害 */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0, rotate: -4 }}
            animate={{
              scale: [0.3, 1.15, 1, 1],
              opacity: [0, 1, 1, 0],
              rotate: [-4, 0, 0, 2],
            }}
            transition={{ duration: TOTAL - 0.25, times: [0, 0.2, 0.78, 1], delay: 0.25 }}
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
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              className="mt-3 text-sm font-bold tracking-[0.24em] text-white/90"
              style={{ textShadow: '0 0 8px rgba(0,0,0,0.9)' }}
            >
              {personaName.toUpperCase()}
              {partnerName && (
                <>
                  <span className="mx-2 text-amber-300">×</span>
                  <span>@{partnerName}</span>
                </>
              )}
            </motion.div>
            {/* 伤害：请求回来那一刻才挂上，挂上就砸下来 */}
            {typeof damage === 'number' && (
              <motion.div
                key={`dmg-${damage}`}
                initial={{ scale: 2.4, opacity: 0, y: -10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                className="mt-2 text-4xl font-black tabular-nums leading-none"
                style={{
                  color: '#fff7ed',
                  WebkitTextStroke: '1.5px #b91c1c',
                  textShadow: '0 0 18px rgba(251,191,36,0.85)',
                  fontFamily: "'Impact', 'Arial Black', sans-serif",
                }}
              >
                −{damage}
              </motion.div>
            )}
          </motion.div>

          {/* 顶/底黑边条（电影感） */}
          <motion.div
            aria-hidden
            initial={{ height: 0 }}
            animate={{ height: ['0%', '12%', '12%', '0%'] }}
            transition={{ duration: TOTAL, times: [0, 0.14, 0.8, 1] }}
            className="absolute top-0 left-0 right-0 bg-black"
          />
          <motion.div
            aria-hidden
            initial={{ height: 0 }}
            animate={{ height: ['0%', '12%', '12%', '0%'] }}
            transition={{ duration: TOTAL, times: [0, 0.14, 0.8, 1] }}
            className="absolute bottom-0 left-0 right-0 bg-black"
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
