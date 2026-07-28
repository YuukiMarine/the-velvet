/**
 * RadialWheelP3 —— 轮盘的 P3（蓝/靛蓝色房间）演出层。
 *
 * 与红频道的手牌扇是两套语法（用户定稿）：
 *   1. RingBurst：从 ◈ 扩散的**同心圆环**（红频道是星形波纹），另有几组圆环在
 *      屏幕其它位置持续扩散——长按期间整屏都在"起波"；
 *   2. VelvetTime：背景大字 VELVET / TIME 取代红频道的同心星群，无衬线黑斜体，
 *      入场自左揭示 + 常态慢漂 + 极低频呼吸；
 *   3. 条目：一排**平行的竖直等长平行四边形**，白底；英文顺时针转 90° 当作背景大字，
 *      中文竖排（text-orientation: upright，字本身不倒）；选中项翻蓝 + 一枚
 *      运动三角形高亮（P3Highlight）。
 *
 * 命中判定：红频道按**角度**扇形分区，这里条带是等距直排，角度分区会和条子的实际
 * 位置对不上（cos 分布在两端挤成一堆），所以 P3 走**横向等宽分带**——
 * 手指抬过条带下缘后按 x 落在哪一格就选哪一格，滑回下方 = 取消。
 * 该分带函数 p3Pick 与本文件的布局 p3Strip 同源，父级 RadialQuickNav 直接调用，
 * 保证"手指在哪"和"哪条亮"永远是同一套几何。
 */
import { motion } from 'motion/react';
import { P3R, P3Highlight, slantClip } from '@/components/p3r/kit';
import type { WheelItem } from './RadialQuickNav';

// ── 布局：一排等距竖条，整体居中于 ◈ 并夹在屏幕内 ──────────────────────────
export interface P3Strip {
  pitch: number;
  barW: number;
  barH: number;
  /** 条带左缘 x（视口坐标） */
  x0: number;
  /** 条带底缘 y（条子从这里向上长） */
  bottom: number;
}

export const p3Strip = (origin: { x: number; y: number }, count: number): P3Strip => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pitch = Math.max(38, Math.min(56, (Math.min(vw, 460) - 20) / count));
  const total = pitch * count;
  const x0 = Math.max(8, Math.min(origin.x - total / 2, vw - total - 8));
  // 条带底缘抬到 ◈ 上方 96px：拇指按住 ◈ 时不挡住最下面一截
  const bottom = Math.max(vh * 0.34, origin.y - 96);
  const barH = Math.min(226, Math.max(150, bottom - 132));
  return { pitch, barW: Math.round(pitch - 7), barH, x0, bottom };
};

/** 命中：抬过条带下缘（留 26px 容差）后按 x 分带；两端夹住不越界 */
export const p3Pick = (
  origin: { x: number; y: number },
  count: number,
  cx: number,
  cy: number,
): number | null => {
  const { pitch, x0, bottom } = p3Strip(origin, count);
  if (cy > bottom + 26) return null;
  return Math.max(0, Math.min(count - 1, Math.floor((cx - x0) / pitch)));
};

// ── 1 · 圆环波纹 ───────────────────────────────────────────────────────────
/** 用 motion 直接补间 SVG 的 r 属性：环在放大过程中描边恒定粗细
 *  （用 CSS scale 撑一个带 border 的 div，边会跟着放大成一圈粗白箍）。 */
const Ring = ({ cx, cy, r0, r1, stroke, width, delay, duration, repeat, fadeEarly }: {
  cx: number; cy: number; r0: number; r1: number; stroke: string; width: number;
  delay: number; duration: number; repeat?: boolean;
  /** 环还没扩到最大就先化掉（浪推出去、水面先平） */
  fadeEarly?: boolean;
}) => (
  <motion.circle
    cx={cx}
    cy={cy}
    fill="none"
    stroke={stroke}
    strokeWidth={width}
    initial={{ r: r0, opacity: 0 }}
    animate={{ r: r1, opacity: [0, 0.85, 0.45, 0] }}
    transition={{
      duration,
      delay,
      ease: [0.16, 0.7, 0.35, 1],
      opacity: { duration, delay, times: fadeEarly ? [0, 0.08, 0.34, 0.66] : [0, 0.12, 0.6, 1] },
      ...(repeat ? { repeat: Infinity, repeatDelay: 0.5 } : {}),
    }}
  />
);

/** 屏幕其它位置的散点环：按视口比例落位，长按期间持续扩散 */
const SCATTER: Array<{ fx: number; fy: number; r: number; d: number; dur: number }> = [
  { fx: 0.18, fy: 0.24, r: 118, d: 0.18, dur: 2.1 },
  { fx: 0.82, fy: 0.17, r: 96, d: 0.52, dur: 2.4 },
  { fx: 0.72, fy: 0.46, r: 138, d: 0.05, dur: 2.6 },
  { fx: 0.12, fy: 0.58, r: 84, d: 0.78, dur: 2.2 },
  { fx: 0.5, fy: 0.09, r: 108, d: 0.35, dur: 2.8 },
];

const RingBurst = ({ origin }: { origin: { x: number; y: number } }) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {/* ◈ 处的主波：4 圈（原 5 圈太密），环身再粗一档、化得更早 */}
      {[0, 1, 2, 3].map((i) => (
        <Ring
          key={`o${i}`}
          cx={origin.x}
          cy={origin.y}
          r0={16}
          r1={200 + i * 92}
          stroke={i % 2 === 1 ? P3R.cyan : '#ffffff'}
          width={i % 2 === 1 ? 20 : 15}
          delay={i * 0.11}
          duration={0.95}
          fadeEarly
        />
      ))}
      {/* 屏幕其它位置：远处的环细一点（回调到接近原始值），错相位、循环 */}
      {SCATTER.map((s, i) => (
        <g key={`s${i}`}>
          <Ring cx={s.fx * vw} cy={s.fy * vh} r0={6} r1={s.r} stroke={P3R.cyan} width={3.5} delay={s.d} duration={s.dur} repeat />
          <Ring cx={s.fx * vw} cy={s.fy * vh} r0={6} r1={s.r * 0.62} stroke="rgba(255,255,255,0.8)" width={2.4} delay={s.d + 0.28} duration={s.dur} repeat />
        </g>
      ))}
    </svg>
  );
};

// ── 2 · 背景大字 VELVET TIME ───────────────────────────────────────────────
const VelvetTime = ({ cx, cy }: { cx: number; cy: number }) => {
  const size = Math.min(96, window.innerWidth * 0.21);
  const line = (text: string, color: string, delay: number, drift: number) => (
    <motion.div
      className="whitespace-nowrap font-black italic leading-[0.84] tracking-[-0.03em]"
      style={{ fontFamily: '"Arial Black", Arial, "Noto Sans SC", sans-serif', fontSize: size, color }}
      initial={{ clipPath: 'inset(-12% 103% -12% -3%)', x: drift < 0 ? 26 : -26 }}
      animate={{ clipPath: 'inset(-12% -6% -12% -3%)', x: [0, drift, 0] }}
      exit={{ opacity: 0 }}
      transition={{
        clipPath: { duration: 0.5, delay, ease: [0.22, 0.9, 0.3, 1] },
        x: { duration: 0.5, delay, ease: [0.22, 0.9, 0.3, 1] },
      }}
    >
      <motion.span
        className="block"
        animate={{ x: [0, drift, 0], opacity: [1, 0.72, 1] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut', delay: delay + 0.5 }}
      >
        {text}
      </motion.span>
    </motion.div>
  );
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute select-none"
      style={{ left: cx, top: cy, transform: 'translate(-50%, -50%) rotate(-9deg)' }}
    >
      {line('VELVET', 'rgba(255,255,255,0.17)', 0.1, 7)}
      <div className="pl-[8%]">{line('TIME', 'rgba(43,104,255,0.62)', 0.2, -9)}</div>
    </div>
  );
};

// ── 3 · 条目：竖直等长平行四边形 ────────────────────────────────────────────
const BAR_CLIP = slantClip(11);

const Bar = ({
  item,
  index,
  count,
  strip,
  state,
}: {
  item: WheelItem;
  index: number;
  count: number;
  strip: P3Strip;
  state: 'idle' | 'active' | 'dim';
}) => {
  const active = state === 'active';
  const { pitch, barW, barH, x0, bottom } = strip;
  const left = x0 + index * pitch + (pitch - barW) / 2;
  const top = bottom - barH;
  // 「最中间的速度最快，两边稍慢」：离中心越远，弹簧越软、起步越晚
  const d = Math.abs(index - (count - 1) / 2) / ((count - 1) / 2);

  // 英文旋转 90° 后「字长」占的是条子的高度——按字数反推字号，长短词都刚好铺满
  const enSize = Math.min(46, (barH - 10) / (0.63 * Math.max(4, item.en.length)));

  return (
    <motion.div
      role="menuitem"
      aria-label={item.label}
      className="pointer-events-none absolute"
      style={{ left, top, width: barW, height: barH, transformOrigin: '50% 100%', zIndex: active ? 60 : 30 }}
      initial={{ scaleY: 0.06, y: 26, opacity: 0 }}
      animate={{ scaleY: 1, y: 0, opacity: 1, scale: active ? 1.16 : 1 }}
      exit={{ scaleY: 0.06, y: 26, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 470 - 190 * d, damping: 27, delay: 0.04 * d }}
    >
      {/* 深蓝硬影（clip 会裁掉 filter 阴影，所以影是另一块同形色片） */}
      <span aria-hidden className="absolute inset-0" style={{ clipPath: BAR_CLIP, background: '#050c34', transform: 'translate(5px,5px)' }} />
      {/* 面：常态白 / 未选中态退到浅青实色（**不用透明度表达状态**）/ 选中蓝 */}
      <span aria-hidden className="absolute inset-0" style={{ clipPath: BAR_CLIP, background: active ? P3R.blue : state === 'dim' ? '#d7e6f0' : P3R.panel }} />
      {/* 内容层：高亮在底、英文幽灵大字居中、竖排中文在上 —— 三层共用同一个
          overflow-hidden + BAR_CLIP 容器，高亮从条子下缘滑进来时不会溢出条外 */}
      <span className="absolute inset-0 overflow-hidden" style={{ clipPath: BAR_CLIP }}>
        {/* 选中：一枚运动三角形（转 90° 顺条子竖向铺满），自下而上快速滑入。
            motion 的 transform 串是 translate → rotate，所以 y 走的是**未旋转**的
            父坐标系 = 屏幕竖直方向，直接给 barH 就是"从条子底下推上来"。 */}
        {active && (
          <motion.span
            aria-hidden
            className="absolute"
            style={{ width: barH, height: barW, left: barW / 2 - barH / 2, top: barH / 2 - barW / 2, rotate: 90 }}
            initial={{ y: barH }}
            animate={{ y: 0 }}
            transition={{ duration: 0.24, ease: [0.14, 0.85, 0.28, 1] }}
          >
            <P3Highlight live className="block h-full w-full" />
          </motion.span>
        )}
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 whitespace-nowrap font-black italic leading-none tracking-[-0.02em]"
          style={{
            fontFamily: '"Arial Black", Arial, sans-serif',
            fontSize: enSize,
            color: active ? 'rgba(255,255,255,0.34)' : 'rgba(27,87,255,0.16)',
            transform: 'translate(-50%,-50%) rotate(90deg)',
            transformOrigin: 'center',
          }}
        >
          {item.en}
        </span>
        <span
          className="absolute inset-x-0 top-[12px] flex justify-center text-[26px] font-black leading-[1.06]"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            color: active ? '#ffffff' : P3R.ink,
            textShadow: active ? '0 2px 0 rgba(6,14,54,0.35)' : undefined,
          }}
        >
          {item.label}
        </span>
      </span>
      {/* 底缘青色小斜片：频道签名件，选中时翻洋红 */}
      <span
        aria-hidden
        className="absolute bottom-[7px] left-1/2 h-[7px] w-[18px] -translate-x-1/2"
        style={{ background: active ? P3R.magenta : P3R.cyan, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }}
      />
    </motion.div>
  );
};

export interface RadialWheelP3Props {
  items: WheelItem[];
  origin: { x: number; y: number };
  active: number | null;
}

export const RadialWheelP3 = ({ items, origin, active }: RadialWheelP3Props) => {
  const strip = p3Strip(origin, items.length);
  return (
    <>
      {/* 遮罩已上收到 RadialQuickNav（那层同时负责点击关闭），P3 走的是
          「以 ◈ 为心向外渐暗 + 顶部下压」的双层渐变，这里不再另铺一层。 */}
      <RingBurst origin={origin} />
      {/* 大字压在条带**上方**：条子是实心白的，摆在条带后面等于看不见 */}
      <VelvetTime cx={strip.x0 + (strip.pitch * items.length) / 2} cy={strip.bottom - strip.barH - 118} />
      {items.map((item, i) => (
        <Bar
          key={item.id}
          item={item}
          index={i}
          count={items.length}
          strip={strip}
          state={active === i ? 'active' : active === null ? 'idle' : 'dim'}
        />
      ))}
    </>
  );
};
