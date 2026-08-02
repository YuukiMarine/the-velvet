/**
 * WishRing —— 「离这个愿望还有多远」的百分比环（PRD_V2.6 §8）。
 *
 * 与 BIG DEAL 的 GoalArc 分工：
 *   · GoalArc 画的是**客观计数**（N/M 步），开口弧 + 里程表数字，环心是"做完几步"；
 *   · 本件画的是**主观距离**（AI 或用户给的百分比），整圆 + 百分号，环心是"到哪了"。
 * 两者不能互相替代——一件大事可以子步全成而愿望仍在半路。
 *
 * 颜色全部走 props：愿望面在四个频道里各有自己的卡面，环不能自带一套配色去撞它们。
 * 未评估态（evaluated=false）画虚底轨 + 「?」，而不是画一个 0%——
 * "还没评估过"和"评估结果是 0"对用户是两句完全不同的话。
 */
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

interface Props {
  pct: number;
  /** false = 从未评估过，画未评估态 */
  evaluated?: boolean;
  size?: number;
  /** 进度弧颜色 */
  color: string;
  /** 底轨颜色 */
  track: string;
  /** 环心文字颜色，缺省随 color */
  ink?: string;
  strokeWidth?: number;
  /** 环心不画数字（用于弹窗里另有大字的场景） */
  bare?: boolean;
}

export function WishRing({
  pct,
  evaluated = true,
  size = 38,
  color,
  track,
  ink,
  strokeWidth = 3,
  bare = false,
}: Props) {
  const bold = useBoldness();
  const r = (size - strokeWidth * 2) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, pct / 100)) * (evaluated ? 1 : 0);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={strokeWidth}
          strokeDasharray={evaluated ? undefined : '3 4'}
        />
        {/* 12 点起顺时针：旋转在 svg 层做，环心文字层不参与，守「字恒水平」 */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: bold ? 0.65 : 0, ease: 'easeOut' }}
        />
      </svg>
      {!bare && (
        <div className="absolute inset-0 flex items-center justify-center">
          {evaluated ? (
            <span
              className="font-black tabular-nums leading-none"
              style={{ color: ink ?? color, fontSize: Math.max(9, Math.round(size * 0.3)) }}
            >
              {Math.round(pct)}
            </span>
          ) : (
            <span
              className="font-black leading-none"
              style={{ color: track, fontSize: Math.max(9, Math.round(size * 0.32)) }}
            >
              ?
            </span>
          )}
        </div>
      )}
    </div>
  );
}
