/**
 * GoalArc — 终极目标的「逼近度」断弧（重设计阶段 1c）。
 *
 * 把「N/M 子愿望」灰字升级为一段沿 -4° 倾斜的开口弧（斜界不用整圆）：弧填充 = 已完成占比，
 * 环心是已夺回步数的里程表数字；完成一步弧会生长一截，满环边缘发烫。
 * 用声明式 motion 描边（headless 可靠 settle），D0 直接出终态、不跑生长动画。
 */
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

interface Props {
  done: number;
  total: number;
  size?: number;
}

export const GoalArc = ({ done, total, size = 42 }: Props) => {
  const bold = useBoldness();
  const frac = total > 0 ? Math.min(1, done / total) : 0;
  const complete = total > 0 && done >= total;

  const r = (size - 6) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const startDeg = 135; // 开口在底部，从左下起、顺时针扫 270°
  const sweepDeg = 270;
  const polar = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = polar(startDeg);
  const [x2, y2] = polar(startDeg + sweepDeg);
  const arcLen = 2 * Math.PI * r * (sweepDeg / 360);
  const d = `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size, transform: 'rotate(-4deg)' }}>
      <svg width={size} height={size} className="overflow-visible">
        <path d={d} fill="none" className="text-gray-200 dark:text-gray-700" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        <motion.path
          d={d}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={arcLen}
          style={complete ? { filter: 'drop-shadow(0 0 4px var(--color-primary))' } : undefined}
          initial={false}
          animate={{ strokeDashoffset: arcLen * (1 - frac) }}
          transition={{ duration: bold ? 0.7 : 0, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotate(4deg)' }}>
        <span className="text-xs font-black tabular-nums text-primary">{done}</span>
      </div>
    </div>
  );
};
