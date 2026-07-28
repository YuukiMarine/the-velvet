/**
 * RadialWheelP4 —— 轮盘的 P4（黄/午夜频道）演出层。
 *
 * 按用户定的出场次序：
 *   1) 长按瞬间：**四角星形的粗波纹**从 ◈ 扩散（不是圆环——那是蓝频道的语法）；
 *   2) 紧接着一组**同心圆**浮现（黑 / 橙 / 奶油交替的粗环，慢慢自转）；
 *   3) 圆心落下一枚**大四角星**；
 *   4) 同心圆的不同角度上挂着标签（每瓣一枚四角星徽 + 竖排小字），
 *      滑到哪一瓣，中间就用**衬线大字**把该标签的中文打出来。
 *
 * 其余为本层自定：环上的刻度短划、瓣与瓣之间的奶油分隔线、选中瓣的橙色扇形高亮、
 * 中心大字下方的英文小字与一条橙色下划线——密度按「华丽」口径给足。
 *
 * 命中判定沿用父级 RadialQuickNav 的扇形分区（P4 是真的绕 ◈ 排一圈上半环，
 * 和红频道同构），所以这里纯渲染。
 */
import { motion } from 'motion/react';
import type { WheelItem } from './RadialQuickNav';

const CREAM = '#fff6d0';
const INK = '#131313';
const ORANGE = 'var(--p4-orange, #f9a11b)';
const YELLOW = 'var(--ui-bg, #ffd900)';

/** 四角星路径（与频道签名件同形，四条腰深内凹）——半径 R、中心 (cx,cy) */
const starD = (cx: number, cy: number, R: number, waist = 0.42): string => {
  const w = R * waist;
  return (
    `M${cx} ${cy - R}` +
    `C${cx + w * 0.28} ${cy - w} ${cx + w} ${cy - w * 0.28} ${cx + R} ${cy}` +
    `C${cx + w} ${cy + w * 0.28} ${cx + w * 0.28} ${cy + w} ${cx} ${cy + R}` +
    `C${cx - w * 0.28} ${cy + w} ${cx - w} ${cy + w * 0.28} ${cx - R} ${cy}` +
    `C${cx - w} ${cy - w * 0.28} ${cx - w * 0.28} ${cy - w} ${cx} ${cy - R}Z`
  );
};

// ── 1 · 四角星粗波纹 ────────────────────────────────────────────────────────
const StarBurst = ({ origin }: { origin: { x: number; y: number } }) => (
  <div className="pointer-events-none absolute inset-0" aria-hidden>
    {[0, 1, 2, 3].map((i) => (
      <motion.svg
        key={i}
        viewBox="0 0 200 200"
        width={200}
        height={200}
        className="absolute"
        style={{ left: origin.x - 100, top: origin.y - 100, overflow: 'visible' }}
        initial={{ scale: 0.18, opacity: 0 }}
        animate={{ scale: 3.4 + i * 1.15, opacity: [0, 0.95, 0.5, 0] }}
        transition={{ duration: 1.05, delay: i * 0.1, ease: [0.16, 0.7, 0.35, 1], opacity: { duration: 1.05, delay: i * 0.1, times: [0, 0.1, 0.4, 0.78] } }}
      >
        <path
          d={starD(100, 100, 92)}
          fill="none"
          stroke={i % 2 === 1 ? ORANGE : CREAM}
          strokeWidth={i % 2 === 1 ? 15 : 11}
          strokeLinejoin="round"
        />
      </motion.svg>
    ))}
  </div>
);

// ── 2 · 同心圆盘（黑 / 橙 / 奶油交替 + 刻度短划，慢自转）────────────────────
const DIAL_RINGS = [
  { r: 0.96, w: 5, c: CREAM },
  { r: 0.88, w: 12, c: INK },
  { r: 0.74, w: 4, c: ORANGE },
  { r: 0.6, w: 9, c: CREAM },
  { r: 0.44, w: 3, c: INK },
];

const Dial = ({ origin, R }: { origin: { x: number; y: number }; R: number }) => (
  <motion.svg
    aria-hidden
    className="pointer-events-none absolute"
    width={R * 2}
    height={R * 2}
    viewBox={`0 0 ${R * 2} ${R * 2}`}
    style={{ left: origin.x - R, top: origin.y - R, overflow: 'visible' }}
    initial={{ scale: 0.55, opacity: 0, rotate: -18 }}
    animate={{ scale: 1, opacity: 1, rotate: 0 }}
    transition={{ type: 'spring', stiffness: 190, damping: 20, delay: 0.16 }}
  >
    {DIAL_RINGS.map((ring) => (
      <circle key={ring.r} cx={R} cy={R} r={R * ring.r} fill="none" stroke={ring.c} strokeWidth={ring.w} />
    ))}
    {/* 刻度短划：外圈上每 6° 一根，落在黑环上 */}
    <motion.g
      style={{ transformOrigin: `${R}px ${R}px` }}
      animate={{ rotate: 360 }}
      transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
    >
      {Array.from({ length: 60 }, (_, i) => {
        const a = ((i * 6 - 90) * Math.PI) / 180;
        const r1 = R * 0.83;
        const r2 = R * 0.93;
        return (
          <line
            key={i}
            x1={R + r1 * Math.cos(a)}
            y1={R + r1 * Math.sin(a)}
            x2={R + r2 * Math.cos(a)}
            y2={R + r2 * Math.sin(a)}
            stroke={i % 5 === 0 ? YELLOW : 'rgba(255,246,208,0.42)'}
            strokeWidth={i % 5 === 0 ? 4 : 2}
          />
        );
      })}
    </motion.g>
  </motion.svg>
);

// ── 3 · 中心大四角星 + 选中项衬线大字 ──────────────────────────────────────
const Hub = ({ origin, item, R }: { origin: { x: number; y: number }; item: WheelItem | null; R: number }) => (
  // ◈ 就贴在屏幕最底，星心压在 ◈ 上会被屏缘切掉一半——整体上提到可见半圆的中心。
  // 命中判定仍以 ◈ 为极点（父级算角度），所以只挪视觉、不动几何。
  <div
    aria-hidden
    className="pointer-events-none absolute z-30 flex flex-col items-center"
    style={{ left: origin.x, top: origin.y - R * 0.42, transform: 'translate(-50%,-50%)' }}
  >
    <motion.svg
      viewBox="0 0 200 200"
      width={item ? 150 : 118}
      height={item ? 150 : 118}
      className="absolute left-1/2 top-1/2"
      style={{ x: '-50%', y: '-50%', overflow: 'visible' }}
      initial={{ scale: 0, rotate: -140, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 15, delay: 0.34 }}
    >
      <path d={starD(100, 100, 96)} fill={item ? YELLOW : CREAM} stroke={INK} strokeWidth={9} strokeLinejoin="round" paintOrder="stroke" />
    </motion.svg>
    {/* 选中项：衬线大字打在星心上 */}
    {item && (
      <motion.div
        key={item.id}
        className="relative flex flex-col items-center"
        initial={{ scale: 0.6, opacity: 0, y: 6 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 460, damping: 22 }}
      >
        <span
          className="whitespace-nowrap text-[34px] font-black leading-none"
          style={{ color: INK, fontFamily: 'var(--p4-display-font, "Noto Serif SC", serif)' }}
        >
          {item.label}
        </span>
        <span className="mt-1 h-[3px] w-[38px]" style={{ background: ORANGE }} />
        <span className="mt-1 text-[10px] font-black tracking-[0.22em]" style={{ color: 'rgba(19,19,19,0.62)' }}>
          {item.en}
        </span>
      </motion.div>
    )}
  </div>
);

// ── 4 · 环上的瓣（四角星徽 + 竖排中文）─────────────────────────────────────
const Petal = ({
  item,
  index,
  count,
  origin,
  R,
  active,
}: {
  item: WheelItem; index: number; count: number;
  origin: { x: number; y: number }; R: number; active: boolean;
}) => {
  const armDeg = -180 + ((index + 0.5) * 180) / count;
  const a = (armDeg * Math.PI) / 180;
  const x = origin.x + R * Math.cos(a);
  const y = origin.y + R * Math.sin(a);
  const size = active ? 74 : 56;

  return (
    <motion.div
      role="menuitem"
      aria-label={item.label}
      className="pointer-events-none absolute z-20 flex flex-col items-center"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y }}
      animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
      exit={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y }}
      transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.3 + index * 0.035 }}
    >
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        animate={{ scale: active ? 1.08 : 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 20 }}
      >
        <svg viewBox="0 0 200 200" width={size} height={size} className="absolute inset-0" style={{ overflow: 'visible' }}>
          <path
            d={starD(100, 100, 94)}
            fill={active ? ORANGE : INK}
            stroke={CREAM}
            strokeWidth={active ? 12 : 8}
            strokeLinejoin="round"
            paintOrder="stroke"
          />
        </svg>
        <span
          className="relative text-center font-black leading-[1.02]"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            fontSize: active ? 15 : 13,
            color: active ? INK : CREAM,
          }}
        >
          {item.label}
        </span>
      </motion.div>
    </motion.div>
  );
};

export interface RadialWheelP4Props {
  items: WheelItem[];
  origin: { x: number; y: number };
  radius: number;
  active: number | null;
}

export const RadialWheelP4 = ({ items, origin, radius, active }: RadialWheelP4Props) => {
  const R = radius * 1.06;
  return (
    <>
      <StarBurst origin={origin} />
      <Dial origin={origin} R={R} />
      {/* 选中瓣的橙色扇形高亮：压在盘上、瓣之下 */}
      {active !== null && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute z-10"
          style={{ left: origin.x - R, top: origin.y - R, width: R * 2, height: R * 2 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.svg
            viewBox="0 0 200 200"
            className="h-full w-full"
            style={{ overflow: 'visible' }}
            animate={{ rotate: -180 + ((active + 0.5) * 180) / items.length + 90 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            {/* 一枚朝上的扇形（张角 = 一瓣），转到选中瓣的方向 */}
            <path
              d={`M100 100 L${100 + 96 * Math.cos((-90 - 90 / items.length) * Math.PI / 180)} ${100 + 96 * Math.sin((-90 - 90 / items.length) * Math.PI / 180)} A96 96 0 0 1 ${100 + 96 * Math.cos((-90 + 90 / items.length) * Math.PI / 180)} ${100 + 96 * Math.sin((-90 + 90 / items.length) * Math.PI / 180)} Z`}
              fill="rgba(249,161,27,0.32)"
              stroke={ORANGE}
              strokeWidth={2}
            />
          </motion.svg>
        </motion.div>
      )}
      {items.map((item, i) => (
        <Petal key={item.id} item={item} index={i} count={items.length} origin={origin} R={R} active={active === i} />
      ))}
      <Hub origin={origin} item={active === null ? null : items[active]} R={R} />
    </>
  );
};
