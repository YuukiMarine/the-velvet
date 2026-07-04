/**
 * RadialWheelP5 —— 轮盘的 P5（红/怪盗）演出层（用户设计稿 1:1 转译）。
 *
 * 构成（自下而上）：
 *   1. StarBurstRipple：打开瞬间从 ◈ 扩散的星形波纹（白描边星 3 圈 scale 放大渐隐）；
 *   2. StarFieldBackdrop：波纹散开后浮现的「多层同心条纹星」星群（参考图 2，SVG 嵌套
 *      黑白交替描边五角星），铺在碑牌之下；
 *   3. 七块黑色斜切碑牌呈手牌扇展开：竖排中文大字 + 底部竖排英文小字，3D 暗侧面；
 *      选中牌变红、拔高放大、叠 thiefKit 的 P5Highlight 红青活高亮（复用定稿）。
 *
 * 手势/选择逻辑在父级 RadialQuickNav（本层纯渲染）；字随碑牌倾斜属 P5 菜单语法
 * （guide §1.4 允许菜单项错位旋转），非正文不受字恒水平约束。
 */
import { motion } from 'motion/react';
import { P5Highlight } from '@/components/terminal/thiefKit';
import type { WheelItem } from './RadialQuickNav';

// ── 规则五角星 path（同心条纹星用；与 starPath.buildStar 的不规则星区分）──────
const starD = (cx: number, cy: number, R: number): string => {
  const r = R * 0.42;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? R : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    d += `${i === 0 ? 'M' : 'L'}${(cx + radius * Math.cos(a)).toFixed(1)},${(cy + radius * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
};

/** 多层同心条纹星（参考图 2 单颗）：黑白交替粗描边嵌套 + 实心小星芯 */
const ConcentricStar = ({ size, layers = 5, invert = false }: { size: number; layers?: number; invert?: boolean }) => {
  const c = size / 2;
  const rings = Array.from({ length: layers }, (_, k) => {
    const R = (size / 2) * (1 - k * (0.82 / layers));
    const white = invert ? k % 2 === 1 : k % 2 === 0;
    return { R, stroke: white ? '#f4f1e8' : '#0d0d0d', width: Math.max(2, size * 0.045) };
  });
  const core = (size / 2) * (1 - 0.82) * 0.9;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {/* 最外白色粗底轮廓（星与背景的分离边） */}
      <path d={starD(c, c, size / 2)} fill="none" stroke="#f4f1e8" strokeWidth={Math.max(3, size * 0.07)} strokeLinejoin="round" />
      {rings.map((ring, k) => (
        <path key={k} d={starD(c, c, ring.R)} fill="none" stroke={ring.stroke} strokeWidth={ring.width} strokeLinejoin="round" />
      ))}
      <path d={starD(c, c, Math.max(3, core))} fill={invert ? '#0d0d0d' : '#f4f1e8'} stroke="none" />
    </svg>
  );
};

/** 星群铺底（固定布局，围着轮盘上半区；opacity 交给父级动画） */
const FIELD_STARS: { dx: number; dy: number; size: number; rot: number; invert?: boolean; op: number }[] = [
  { dx: -150, dy: -196, size: 120, rot: -14, op: 0.85 },
  { dx: -22, dy: -252, size: 158, rot: 9, invert: true, op: 0.9 },
  { dx: 118, dy: -204, size: 104, rot: 22, op: 0.8 },
  { dx: -176, dy: -84, size: 66, rot: 30, invert: true, op: 0.6 },
  { dx: 168, dy: -96, size: 72, rot: -18, op: 0.6 },
  { dx: 62, dy: -128, size: 46, rot: 40, op: 0.5 },
  { dx: -84, dy: -136, size: 40, rot: -32, invert: true, op: 0.5 },
];

const StarFieldBackdrop = ({ origin }: { origin: { x: number; y: number } }) => (
  <div className="pointer-events-none absolute inset-0" aria-hidden>
    {FIELD_STARS.map((s, i) => (
      <motion.div
        key={i}
        className="absolute"
        style={{ left: origin.x + s.dx - s.size / 2, top: origin.y + s.dy - s.size / 2, rotate: s.rot }}
        initial={{ opacity: 0, scale: 0.55 }}
        animate={{ opacity: s.op, scale: 1 }}
        exit={{ opacity: 0, scale: 0.7 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.16 + i * 0.035 }}
      >
        <ConcentricStar size={s.size} invert={s.invert} />
      </motion.div>
    ))}
  </div>
);

/** 打开波纹：星形描边 3 圈从 ◈ 扩散渐隐 */
const StarBurstRipple = ({ origin }: { origin: { x: number; y: number } }) => (
  <div className="pointer-events-none absolute inset-0" aria-hidden>
    {[0, 1, 2].map((i) => (
      <motion.svg
        key={i}
        width={160}
        height={160}
        viewBox="0 0 160 160"
        className="absolute"
        style={{ left: origin.x - 80, top: origin.y - 80 }}
        initial={{ scale: 0.24, opacity: 0.95 }}
        animate={{ scale: 3.6 + i * 0.7, opacity: 0 }}
        transition={{ duration: 0.62, delay: i * 0.09, ease: [0.2, 0.8, 0.3, 1] }}
      >
        <path d={starD(80, 80, 74)} fill="none" stroke={i === 1 ? 'var(--color-primary)' : '#f4f1e8'} strokeWidth={i === 1 ? 5 : 3.5} strokeLinejoin="round" />
      </motion.svg>
    ))}
  </div>
);

// ── 碑牌 ──────────────────────────────────────────────────────────────────
const STELE_CLIP = 'polygon(8% 0%, 96% 2%, 100% 96%, 2% 100%)';
const SIDE_CLIP = 'polygon(8% 0%, 96% 2%, 100% 96%, 2% 100%)';

const Stele = ({
  item,
  index,
  count,
  origin,
  radius,
  state,
}: {
  item: WheelItem;
  index: number;
  count: number;
  origin: { x: number; y: number };
  radius: number;
  state: 'idle' | 'active' | 'dim';
}) => {
  const armDeg = -180 + ((index + 0.5) * 180) / count;
  const arm = (armDeg * Math.PI) / 180;
  // 位置：极坐标 + 纵向压扁（牌群贴底成手牌弧）；旋转：长轴沿半径、系数收拢更「立」
  const x = origin.x + radius * Math.cos(arm);
  const y = origin.y + radius * 0.8 * Math.sin(arm) + 8;
  const tilt = (armDeg + 90) * 0.55;
  // 中间高两端矮的手牌弧 + 选中拔高
  const baseH = 118 + 46 * Math.sin((Math.PI * (index + 0.5)) / count);
  const active = state === 'active';
  const W = 56;
  const H = active ? baseH * 1.22 : baseH;

  return (
    <motion.div
      role="menuitem"
      aria-label={item.label}
      className="pointer-events-none absolute"
      style={{ left: x, top: y, zIndex: active ? 60 : 30 + index }}
      initial={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y, rotate: 0 }}
      animate={{
        opacity: state === 'dim' ? 0.55 : 1,
        scale: active ? 1.06 : state === 'dim' ? 0.92 : 1,
        x: -W / 2,
        y: -H + 8,
        rotate: tilt,
      }}
      exit={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y }}
      transition={{ type: 'spring', stiffness: 340, damping: 26, delay: 0.03 * index }}
    >
      {/* transformOrigin 设在牌根（底部中心）：旋转/放大像从 ◈ 长出来的牌 */}
      <div className="relative" style={{ width: W, height: H, transformOrigin: '50% 100%' }}>
        {/* 选中：复用 thiefKit P5Highlight 红青活高亮 */}
        {active && <P5Highlight live className="absolute -inset-x-3 -inset-y-2 -z-10" />}
        {/* 3D 暗侧面 */}
        <div aria-hidden className="absolute inset-0" style={{ clipPath: SIDE_CLIP, background: active ? '#5c0208' : '#000', transform: 'translate(5px, 4px)' }} />
        {/* 主面 */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-between overflow-hidden pb-2 pt-2.5"
          style={{ clipPath: STELE_CLIP, background: active ? 'var(--color-primary)' : '#0d0d0d' }}
        >
          {/* 竖排中文大字 */}
          <div className="flex flex-col items-center leading-none">
            {[...item.label].map((chr, i) => (
              <span key={i} className="text-[20px] font-black text-white" style={{ textShadow: '1.5px 1.5px 0 rgba(0,0,0,0.55)' }}>
                {chr}
              </span>
            ))}
          </div>
          {/* 竖排英文小字 */}
          <span
            className="text-[8px] font-black tracking-[0.12em] text-white/75"
            style={{ writingMode: 'vertical-rl' }}
          >
            {item.en}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

/** 牌根黑色碎片群（设计稿底部的锐角碎屑；纯装饰） */
const SHARDS = [
  { ang: -158, dist: 52, size: 15, rot: 24 },
  { ang: -132, dist: 62, size: 11, rot: -40 },
  { ang: -108, dist: 50, size: 18, rot: 70 },
  { ang: -84, dist: 64, size: 12, rot: -15 },
  { ang: -62, dist: 54, size: 16, rot: 48 },
  { ang: -38, dist: 60, size: 10, rot: -70 },
  { ang: -20, dist: 50, size: 14, rot: 12 },
];

const RootShards = ({ origin }: { origin: { x: number; y: number } }) => (
  <div className="pointer-events-none absolute inset-0" style={{ zIndex: 55 }} aria-hidden>
    {SHARDS.map((s, i) => {
      const a = (s.ang * Math.PI) / 180;
      return (
        <motion.div
          key={i}
          className="absolute bg-black"
          style={{
            left: origin.x + s.dist * Math.cos(a) - s.size / 2,
            top: origin.y + s.dist * 0.8 * Math.sin(a) - s.size / 2,
            width: s.size,
            height: s.size,
            rotate: s.rot,
            clipPath: 'polygon(50% 0%, 100% 82%, 12% 100%)',
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.92, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24, delay: 0.1 + i * 0.03 }}
        />
      );
    })}
  </div>
);

export interface RadialWheelP5Props {
  items: WheelItem[];
  origin: { x: number; y: number };
  radius: number;
  active: number | null;
}

export const RadialWheelP5 = ({ items, origin, radius, active }: RadialWheelP5Props) => (
  <>
    <StarBurstRipple origin={origin} />
    <StarFieldBackdrop origin={origin} />
    {items.map((item, i) => (
      <Stele
        key={item.id}
        item={item}
        index={i}
        count={items.length}
        origin={origin}
        radius={radius}
        state={active === i ? 'active' : active === null ? 'idle' : 'dim'}
      />
    ))}
    <RootShards origin={origin} />
  </>
);
