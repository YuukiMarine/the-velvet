/**
 * StarChart「星象仪」—— 五维属性的 P5 式星形展示（PRD_V2.5_FINAL §4.2）。
 *
 * 对 design-refs/stars.png 的转译（非复刻）：
 *   - 灰色大五角星舞台 + 深色错位阴影星，整体带斜率（TILT 烘进顶点角度）；
 *   - 数值不靠多边形面积，而是**星臂刻度点**：每臂 8 点，点亮数 = level/maxLevel；
 *   - 五角压着可点击**贴纸**（属性名块 + 大数字 + 称号小字）→ onSelect 打开属性档案；
 *   - 中央宝石折面星（金橙渐变，固定色——像圣遗物，不随主题）。
 *
 * 铁律：星可以斜，字恒水平（贴纸不随 TILT 旋转，只做各自 ±3° 贴纸微倾）；
 * 真实数值走贴纸文本（可读），SVG 全部 aria-hidden；D0 全静态。
 */
import { motion } from 'motion/react';
import type { AttributeId } from '@/types';
import { useBoldness } from '@/utils/boldness';

export interface StarChartItem {
  id: AttributeId;
  name: string;
  level: number;
  maxLevel: number;
  points: number;
  /** 当前等级称号（attributeLevelTitles） */
  title: string;
}

export interface StarChartProps {
  items: StarChartItem[];
  size?: 'md' | 'lg';
  onSelect?: (id: AttributeId, origin: HTMLElement) => void;
  className?: string;
}

// ── 几何常量（viewBox 360×360，中心 180）──────────────────────────────────
const C = 180;
const TILT = -9;               // 全局斜率（度），烘进顶点角度
const R_OUTER = 132;           // 大星外顶点半径
const R_INNER = R_OUTER * 0.42; // 内凹点半径（略胖于正五角星的 0.382，星臂更厚实）
const R_CORE = 38;             // 中央宝石星
const TICKS = 8;               // 每臂刻度点数
const TICK_FROM = 56;
const TICK_TO = 118;

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (angleDeg: number, radius: number): [number, number] => [
  C + radius * Math.cos(rad(angleDeg)),
  C + radius * Math.sin(rad(angleDeg)),
];

/** 顶点角（含斜率）：i=0 顶部起逆时针 72° 步进 */
const armAngle = (i: number) => -90 + i * 72 + TILT;

const starPath = (rOuter: number, rInner: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const [ox, oy] = pt(armAngle(i), rOuter);
    const [ix, iy] = pt(armAngle(i) + 36, rInner);
    pts.push(`${ox.toFixed(1)},${oy.toFixed(1)}`, `${ix.toFixed(1)},${iy.toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
};

/** 中央宝石星：10 个折面三角交替明暗 */
const CoreStar = () => {
  const faces: { d: string; fill: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const [ox, oy] = pt(armAngle(i), R_CORE);
    const [iPrevX, iPrevY] = pt(armAngle(i) - 36, R_CORE * 0.45);
    const [iNextX, iNextY] = pt(armAngle(i) + 36, R_CORE * 0.45);
    faces.push({ d: `M${C},${C} L${iPrevX},${iPrevY} L${ox},${oy} Z`, fill: '#fbbf24' });
    faces.push({ d: `M${C},${C} L${ox},${oy} L${iNextX},${iNextY} Z`, fill: '#d97706' });
  }
  return (
    <g>
      {faces.map((f, i) => (
        <path key={i} d={f.d} fill={f.fill} />
      ))}
      <path d={starPath(R_CORE, R_CORE * 0.45)} fill="none" stroke="#fff7e6" strokeWidth={2} strokeLinejoin="round" />
    </g>
  );
};

export const StarChart = ({ items, size = 'md', onSelect, className }: StarChartProps) => {
  const bold = useBoldness();
  const five = items.slice(0, 5);

  const nameCls = size === 'lg' ? 'text-[13px] px-2 py-1' : 'text-[11px] px-1.5 py-0.5';
  const numCls = size === 'lg' ? 'text-2xl' : 'text-xl';
  const titleCls = size === 'lg' ? 'text-[11px]' : 'text-[10px]';

  return (
    <div className={`relative mx-auto aspect-square w-full max-w-[420px] select-none ${className ?? ''}`}>
      <svg viewBox="0 0 360 360" className="h-full w-full" aria-hidden>
        {/* 错位阴影星（深色，先落位） */}
        <motion.path
          d={starPath(R_OUTER, R_INNER)}
          fill="rgba(13,17,26,0.82)"
          transform="translate(11 15) rotate(2.5 180 180)"
          initial={bold ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
        {/* 主星舞台（灰） */}
        <motion.g
          initial={bold ? { opacity: 0, scale: 0.88 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        >
          <path
            d={starPath(R_OUTER, R_INNER)}
            fill="#8b93a3"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {/* 臂上刻度点：点亮数 = level/maxLevel */}
          {five.map((item, i) => {
            const lit = Math.round((Math.max(0, Math.min(1, item.level / Math.max(1, item.maxLevel)))) * TICKS);
            return Array.from({ length: TICKS }, (_, k) => {
              const r = TICK_FROM + ((TICK_TO - TICK_FROM) / (TICKS - 1)) * k;
              const [x, y] = pt(armAngle(i), r);
              const on = k < lit;
              return (
                <motion.circle
                  key={`${item.id}-${k}`}
                  cx={x}
                  cy={y}
                  r={on ? 3 : 2.2}
                  fill={on ? '#ffffff' : 'rgba(255,255,255,0.28)'}
                  initial={bold ? { opacity: 0, scale: 0 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: bold ? 0.25 + i * 0.06 + k * 0.025 : 0, duration: 0.18 }}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                />
              );
            });
          })}
          <CoreStar />
        </motion.g>
      </svg>

      {/* 五角贴纸（HTML 层：可点、可读、字恒水平） */}
      {five.map((item, i) => {
        const [x, y] = pt(armAngle(i), R_OUTER + 6);
        const stickerTilt = [-3, 2.5, -2, 3, -2.5][i];
        return (
          <motion.button
            key={item.id}
            type="button"
            onClick={(e) => onSelect?.(item.id, e.currentTarget)}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-1"
            style={{ left: `${(x / 360) * 100}%`, top: `${(y / 360) * 100}%` }}
            initial={bold ? { opacity: 0, scale: 0.4 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22, delay: bold ? 0.35 + i * 0.07 : 0 }}
            whileTap={{ scale: 0.92 }}
            aria-label={`${item.name} 等级 ${item.level}，${item.title}`}
          >
            <span className="flex items-end gap-1" style={{ transform: `rotate(${stickerTilt}deg)` }}>
              <span
                className={`inline-block font-black leading-none text-white ${nameCls}`}
                style={{
                  background: 'var(--color-primary)',
                  boxShadow: '2px 2px 0 rgba(0,0,0,0.8)',
                  textShadow: '1px 1px 0 rgba(0,0,0,0.7)',
                  clipPath: 'polygon(3% 6%, 100% 0, 97% 94%, 0 100%)',
                }}
              >
                {item.name}
              </span>
              <span
                className={`font-black leading-none text-white ${numCls}`}
                style={{ textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0 2.5px 0 #000' }}
              >
                {item.level}
              </span>
            </span>
            <span
              className={`mt-0.5 font-bold leading-none text-white ${titleCls}`}
              style={{ textShadow: '-1px -1px 0 rgba(0,0,0,0.75), 1px -1px 0 rgba(0,0,0,0.75), -1px 1px 0 rgba(0,0,0,0.75), 1px 1px 0 rgba(0,0,0,0.75)' }}
            >
              {item.title}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
