/**
 * MicroBurst — 一次性的主题色粒子小爆（重设计阶段 1 · 微胜利 juice）。
 *
 * 抽自 CallingCardCutIn 的尘屑算法的轻量版，就地绝对定位、播完自卸（onDone）。
 * 调用方应在 useBoldness()=true 时才挂载它；D0 降级路径不渲染粒子。
 */
import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';

interface Props {
  /** 粒子数 */
  count?: number;
  /** 播完回调（用于父级清理触发态） */
  onDone?: () => void;
}

export const MicroBurst = ({ count = 7, onDone }: Props) => {
  const bits = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 14 + Math.random() * 12;
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          size: 2 + Math.random() * 2,
          dur: 0.32 + Math.random() * 0.18,
        };
      }),
    [count],
  );

  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 540);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10">
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute rounded-full bg-primary"
          style={{ width: b.size, height: b.size, boxShadow: '0 0 6px var(--color-primary)' }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: b.dur, ease: 'easeOut' }}
        />
      ))}
    </span>
  );
};
