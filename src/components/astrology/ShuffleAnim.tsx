import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CardBack } from './CardBack';

interface ShuffleAnimProps {
  /** 动画完成后回调（candidates 已在上层生成） */
  onComplete: () => void;
  cardWidth?: number;
  /** 洗牌总时长 (ms) */
  duration?: number;
}

/**
 * 洗牌 → 扇形展开动画
 * - 前 70% 时间：5 张牌快速左右交错位移
 * - 后 30% 时间：合并为一叠并停住（实际候选展开由父组件接管）
 */
export function ShuffleAnim({ onComplete, cardWidth = 90, duration = 1600 }: ShuffleAnimProps) {
  const [phase, setPhase] = useState<'shuffle' | 'stack' | 'done'>('shuffle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const shuffleMs = Math.floor(duration * 0.7);
    const stackMs   = duration - shuffleMs;

    timerRef.current = setTimeout(() => {
      setPhase('stack');
      timerRef.current = setTimeout(() => {
        setPhase('done');
        onComplete();
      }, stackMs);
    }, shuffleMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, onComplete]);

  const N = 5;

  return (
    <div className="relative w-full flex items-center justify-center" style={{ height: cardWidth * 1.7 }}>
      {Array.from({ length: N }).map((_, i) => {
        const offset = i - (N - 1) / 2;
        return (
          <motion.div
            key={i}
            className="absolute"
            initial={{ x: 0, y: 0, rotate: 0, scale: 0.92 }}
            animate={
              phase === 'shuffle'
                ? {
                    x: [0, offset * 60, offset * -40, 0],
                    y: [0, -10, 8, 0],
                    rotate: [0, offset * 8, offset * -6, 0],
                    scale: 0.92,
                  }
                : phase === 'stack'
                  ? { x: offset * 1.5, y: offset * -1.5, rotate: offset * 0.6, scale: 0.96 }
                  : { x: 0, y: 0, rotate: 0, scale: 1 }
            }
            transition={{
              duration: phase === 'shuffle' ? 0.9 : 0.4,
              repeat: phase === 'shuffle' ? 1 : 0,
              ease: 'easeInOut',
            }}
            style={{ zIndex: i }}
          >
            <CardBack width={cardWidth} hoverable={false} />
          </motion.div>
        );
      })}
    </div>
  );
}
