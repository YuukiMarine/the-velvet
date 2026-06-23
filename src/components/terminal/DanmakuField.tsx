/**
 * DanmakuField — F3 终端的漂浮弹幕层（Batch 3，离线官方精选池）。
 *
 * 仪式过程中周围漂浮其他「声音」的鼓励语，对抗孤独感。当前只展示官方精选种子池
 * （离线、不依赖网络）；用户投稿的在线弹幕（先审后发，PocketBase）随 F2b 后端批接入。
 *
 * 纯氛围层：pointer-events-none、低透明度、置于内容之下（父容器 relative + 本层 -z-10）。
 */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { TERMINAL_DANMAKU_SEEDS } from '@/constants/terminalDanmaku';

interface Props {
  /** 自定义弹幕内容；默认用官方精选池 */
  messages?: string[];
  /** 同时漂浮的条数（从池中取） */
  count?: number;
}

export const DanmakuField = ({ messages, count = 7 }: Props) => {
  const bold = useBoldness();
  const lanes = useMemo(() => {
    const pool = messages && messages.length > 0 ? messages : TERMINAL_DANMAKU_SEEDS;
    return Array.from({ length: count }).map((_, i) => {
      const text = pool[Math.floor(Math.random() * pool.length)];
      return {
        id: i,
        text,
        top: 6 + Math.random() * 82, // 纵向 6%–88%
        duration: 20 + Math.random() * 14, // 20–34s 飘过
        delay: (i / count) * 18 + Math.random() * 3, // 错峰，避免扎堆
        opacity: 0.18 + Math.random() * 0.16,
      };
    });
  }, [messages, count]);

  // 降级红线：reduced-motion / 校直模式 / 低帧永久降级下，氛围层不跑无限动画（静默）
  if (!bold) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {lanes.map(l => (
        <motion.span
          key={l.id}
          className="absolute whitespace-nowrap text-xs font-medium text-primary"
          style={{ top: `${l.top}%`, left: 0, opacity: l.opacity }}
          initial={{ x: '100vw' }}
          animate={{ x: '-110vw' }}
          transition={{ duration: l.duration, delay: l.delay, repeat: Infinity, ease: 'linear' }}
        >
          {l.text}
        </motion.span>
      ))}
    </div>
  );
};
