import { motion } from 'motion/react';
import { useState } from 'react';

/**
 * 庆祝粒子层（CelebrationCutIn 配套原语，也可单独挂进任何演出容器）。
 *
 * 约束：
 *   - 粒子参数用 useState 惰性初始化，挂载时生成一次（正确范本：AchievementUnlockModal
 *     的 useState(() => ...)；反面教材：SkillUnlockModal 在 effect 里 setState 重建，
 *     isOpen 抖动会重洗粒子）。因此 count/colors 只在首次挂载生效——要重播请用 key 重挂。
 *   - 纯装饰层：aria-hidden + pointer-events-none，永不参与命中测试与读屏。
 *   - colors 必须传 Tailwind bg 类的完整字面量（JIT 只认源码里写全的类名，不可拼接）。
 *   - 裁切责任在容器：粒子会飞出自身边界，需要约束时由父级加 overflow-hidden。
 */

interface Particle {
  id: number;
  x: number;
  y: number;
  delay: number;
  size: number;
  colorClass: string;
}

/** 默认四彩——完整字面量，JIT 可见 */
const DEFAULT_COLORS = ['bg-yellow-300', 'bg-orange-400', 'bg-rose-400', 'bg-violet-400'];

interface ParticleBurstProps {
  /** 粒子数，<=0 时不渲染 */
  count?: number;
  /** 追加到外层容器（默认铺满父级、从中心炸开；可用定位类改炸点） */
  className?: string;
  /** Tailwind bg 类字面量数组，按序循环取色 */
  colors?: string[];
}

export const ParticleBurst = ({ count = 24, className = '', colors = DEFAULT_COLORS }: ParticleBurstProps) => {
  const [particles] = useState<Particle[]>(() => {
    const palette = colors.length > 0 ? colors : DEFAULT_COLORS;
    return Array.from({ length: Math.max(0, count) }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 90;
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        delay: Math.random() * 0.4,
        size: 6 + Math.random() * 6,
        colorClass: palette[i % palette.length],
      };
    });
  });

  if (particles.length === 0) return null;

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={{ x: p.x, y: p.y, scale: [0, 1, 0.5], opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, delay: p.delay, ease: 'easeOut' }}
          className={`absolute left-1/2 top-1/2 rounded-full ${p.colorClass}`}
          // 不写 will-change：动的本来就是 transform/opacity，浏览器自会提升，
          // 而 will-change 是**常驻**声明——粒子 1.2s 就炸完了，元素却要挂到弹窗关闭，
          // 于是 16~30 个层的后备存储白占三秒多（实测庆祝弹窗期间 will-change 元素
          // 从 5 个涨到 21/35 个，且直到关窗才回落）
          style={{
            width: p.size,
            height: p.size,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
          }}
        />
      ))}
    </div>
  );
};
