/**
 * Donut — F5 记账统一甜甜圈环原语（hero 余额环 / 统计类目环 / 资产财富环 共用）。
 *
 * segments 按比例堆叠，total 作分母（total > Σvalue 时余下显为灰色 track = 「未填满」部分）。
 * 安定态恒为「已填满」（首屏即渲染到位、绝不空环）；数值变化时 CSS transition 平滑补间，
 * 入场缩放由所在卡片的动效承载（hero popIn / 统计·资产卡 rise）。
 */
import { type ReactNode } from 'react';

const SIZES = {
  hero: { vb: 200, r: 84, stroke: 12, cls: 'w-56 h-56' },
  card: { vb: 140, r: 56, stroke: 15, cls: 'w-32 h-32' },
} as const;

const EASE = 'stroke-dasharray .7s cubic-bezier(.22,1,.36,1), stroke-dashoffset .7s cubic-bezier(.22,1,.36,1), stroke .3s';

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
  return (
    <div className={`relative flex-shrink-0 ${cls} ${className}`}>
      <svg viewBox={`0 0 ${vb} ${vb}`} className="w-full h-full -rotate-90">
        {track && <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-100 dark:stroke-gray-800" />}
        {segments.map((sg, i) => {
          const frac = total > 0 ? Math.max(0, sg.value) / total : 0;
          const len = frac * C;
          const off = -acc * C;
          acc += frac;
          return (
            <circle
              key={i} cx={c} cy={c} r={r} fill="none" stroke={sg.color} strokeWidth={stroke} strokeLinecap="butt"
              strokeDasharray={`${len} ${C}`} strokeDashoffset={off} style={{ transition: EASE }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">{children}</div>
    </div>
  );
}
