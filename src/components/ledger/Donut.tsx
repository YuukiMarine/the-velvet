/**
 * Donut — F5 记账统一甜甜圈环原语（hero 余额环 / 统计类目环 / 资产财富环 共用）。
 *
 * segments 按比例堆叠，total 作分母（total > Σvalue 时余下显为灰色 track = 「未填满」部分）。
 * 入场「填充」生长：各段 strokeDasharray + dashoffset 由 0 按比例同步补到位（gap-free，
 * 用 framer 声明式 motion.circle 驱动，落定到终态可靠）；数值变化时同一动画平滑补间。
 */
import { motion } from 'motion/react';
import { type ReactNode } from 'react';
import { useUiChannel } from '@/ui/useUiChannel';

const SIZES = {
  hero: { vb: 200, r: 84, stroke: 12, cls: 'w-56 h-56' },
  card: { vb: 140, r: 56, stroke: 15, cls: 'w-32 h-32' },
} as const;

export function Donut({ segments, total, variant = 'card', track = true, className = '', children }: {
  segments: { value: number; color: string }[];
  total: number;
  variant?: keyof typeof SIZES;
  track?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { vb, r, stroke, cls } = SIZES[variant];
  const C = 2 * Math.PI * r;
  const c = vb / 2;
  let acc = 0;
  // P4（p4-ledger-reference-v2）：向日葵舞台上环槽退为半透明奶油描边，不与花瓣打架
  const isP4 = useUiChannel() === 'p4';
  return (
    <div className={`relative flex-shrink-0 ${cls} ${className}`}>
      <svg viewBox={`0 0 ${vb} ${vb}`} className="w-full h-full -rotate-90">
        {track && (
          isP4 ? (
            <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} stroke="rgba(255,246,208,0.75)" />
          ) : (
            <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-100 dark:stroke-gray-800" />
          )
        )}
        {segments.map((sg, i) => {
          const frac = total > 0 ? Math.max(0, sg.value) / total : 0;
          const len = frac * C;
          const off = -acc * C;
          acc += frac;
          return (
            <motion.circle
              key={i} cx={c} cy={c} r={r} fill="none" stroke={sg.color} strokeWidth={stroke} strokeLinecap="butt"
              initial={{ strokeDasharray: `0 ${C}`, strokeDashoffset: 0 }}
              animate={{ strokeDasharray: `${len} ${C}`, strokeDashoffset: off }}
              transition={{ duration: 0.8, delay: 0.05 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">{children}</div>
    </div>
  );
}
