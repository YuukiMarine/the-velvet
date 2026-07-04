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

/** 多层同心条纹星（参考图 2 单颗）：黑白交替粗描边嵌套 + 实心小星芯。
 *  strokeLinejoin=miter：星尖必须锐利（用户口径「圆角太多」）。 */
const ConcentricStar = ({ size, layers = 5, invert = false }: { size: number; layers?: number; invert?: boolean }) => {
  const c = size / 2;
  const rings = Array.from({ length: layers }, (_, k) => {
    const R = (size / 2) * (1 - k * (0.82 / layers));
    const white = invert ? k % 2 === 1 : k % 2 === 0;
    return { R, stroke: white ? '#f4f1e8' : '#0d0d0d', width: Math.max(2, size * 0.045) };
  });
  const core = (size / 2) * (1 - 0.82) * 0.9;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }} aria-hidden>
      {/* 最外白色粗底轮廓（星与背景的分离边） */}
      <path d={starD(c, c, size / 2)} fill="none" stroke="#f4f1e8" strokeWidth={Math.max(3, size * 0.07)} strokeLinejoin="miter" strokeMiterlimit={12} />
      {rings.map((ring, k) => (
        <path key={k} d={starD(c, c, ring.R)} fill="none" stroke={ring.stroke} strokeWidth={ring.width} strokeLinejoin="miter" strokeMiterlimit={12} />
      ))}
      <path d={starD(c, c, Math.max(3, core))} fill={invert ? '#0d0d0d' : '#f4f1e8'} stroke="none" />
    </svg>
  );
};

/** 星群铺底：程序生成 22 颗（固定种子，撒满轮盘周围直至屏底；重叠是特色，参考图即堆叠） */
const FIELD_STARS: { dx: number; dy: number; size: number; rot: number; invert: boolean; op: number }[] = (() => {
  const rnd = (i: number, salt: number) => {
    const x = Math.sin(i * 127.13 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return Array.from({ length: 22 }, (_, i) => {
    // 上半环均匀撒点 + 抖动；后 6 颗压向底部两侧（把牌后/屏底也填上）
    const bottomBand = i >= 16;
    const ang = bottomBand
      ? -Math.PI * (0.08 + 0.84 * rnd(i, 1)) // 全上半随机
      : -Math.PI * ((i / 16) * 0.94 + 0.03 + (rnd(i, 1) - 0.5) * 0.08);
    const dist = bottomBand ? 30 + rnd(i, 2) * 90 : 120 + rnd(i, 2) * 220;
    const size = bottomBand ? 30 + rnd(i, 3) * 60 : 34 + rnd(i, 3) * 128;
    return {
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist * 0.92 + (bottomBand ? 26 : 0),
      size,
      rot: (rnd(i, 4) - 0.5) * 70,
      invert: rnd(i, 5) > 0.5,
      op: 0.42 + rnd(i, 6) * 0.5,
    };
  });
})();

const StarFieldBackdrop = ({ origin }: { origin: { x: number; y: number } }) => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
    {FIELD_STARS.map((s, i) => (
      <motion.div
        key={i}
        className="absolute"
        style={{ left: origin.x + s.dx - s.size / 2, top: origin.y + s.dy - s.size / 2, rotate: s.rot }}
        initial={{ opacity: 0, scale: 0.55 }}
        animate={{ opacity: s.op, scale: 1 }}
        exit={{ opacity: 0, scale: 0.7 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.14 + i * 0.022 }}
      >
        <ConcentricStar size={s.size} invert={s.invert} />
      </motion.div>
    ))}
  </div>
);

/** 打开波纹：星形描边 5 圈从 ◈ 扩散——铺到上半屏、尾段才渐隐（用户口径「多一轮、晚点消失」） */
const StarBurstRipple = ({ origin }: { origin: { x: number; y: number } }) => (
  <div className="pointer-events-none absolute inset-0" aria-hidden>
    {[0, 1, 2, 3, 4].map((i) => (
      <motion.svg
        key={i}
        width={160}
        height={160}
        viewBox="0 0 160 160"
        className="absolute"
        style={{ left: origin.x - 80, top: origin.y - 80, overflow: 'visible' }}
        initial={{ scale: 0.24, opacity: 0.95 }}
        animate={{ scale: 5.2 + i * 1.1, opacity: [0.95, 0.9, 0.55, 0] }}
        transition={{ duration: 1.15, delay: i * 0.13, ease: [0.16, 0.7, 0.35, 1], opacity: { duration: 1.15, delay: i * 0.13, times: [0, 0.55, 0.82, 1] } }}
      >
        <path
          d={starD(80, 80, 74)}
          fill="none"
          stroke={i % 2 === 1 ? 'var(--color-primary)' : '#f4f1e8'}
          strokeWidth={i % 2 === 1 ? 4.5 : 3}
          strokeLinejoin="miter"
          strokeMiterlimit={12}
        />
      </motion.svg>
    ))}
  </div>
);

// ── 碑牌 ──────────────────────────────────────────────────────────────────
// 五套不规则裁切轮换（用户口径「五个一模一样太板正」）：每张牌形状各异、边角锐利
const STELE_CLIPS = [
  'polygon(11% 0%, 93% 3%, 100% 96%, 4% 100%)',
  'polygon(3% 3%, 100% 0%, 94% 100%, 0% 93%)',
  'polygon(7% 1%, 99% 5%, 93% 97%, 0% 100%)',
  'polygon(1% 4%, 95% 0%, 100% 99%, 8% 95%)',
  'polygon(13% 2%, 100% 1%, 95% 100%, 2% 96%)',
];

/** 稳定伪随机（牌形/剪报字抖动用，渲染间不变） */
const jrand = (seed: number) => {
  const x = Math.sin(seed * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
};

/** 剪报字纸片的三套异形裁切 */
const RANSOM_CLIPS = [
  'polygon(6% 8%, 96% 0%, 100% 90%, 0% 100%)',
  'polygon(0% 4%, 100% 10%, 92% 100%, 4% 92%)',
  'polygon(8% 0%, 100% 6%, 96% 94%, 0% 98%)',
];

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
  // 每张牌独立微抖动：倾角/宽/高都不一样（去板正）
  const tilt = (armDeg + 90) * 0.55 + (jrand(index * 3.1) - 0.5) * 5;
  const baseH = 118 + 46 * Math.sin((Math.PI * (index + 0.5)) / count) + (jrand(index * 5.7) - 0.5) * 14;
  const active = state === 'active';
  const W = 56 + Math.round((jrand(index * 7.9) - 0.5) * 8);
  const H = active ? baseH * 1.22 : baseH;
  const clip = STELE_CLIPS[index % STELE_CLIPS.length];

  return (
    <motion.div
      role="menuitem"
      aria-label={item.label}
      className="pointer-events-none absolute"
      style={{ left: x, top: y, zIndex: active ? 60 : 30 + index }}
      initial={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y, rotate: 0 }}
      animate={{
        // dim 别太透：星群铺密后，半透明牌会透出星纹显脏
        opacity: state === 'dim' ? 0.75 : 1,
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
        {/* 3D 暗侧面 */}
        <div aria-hidden className="absolute inset-0" style={{ clipPath: clip, background: active ? '#5c0208' : '#000', transform: 'translate(5px, 4px)' }} />
        {/* 不规则白色锐利描边：白底层露边 + 内缩主面同形裁切 */}
        <div aria-hidden className="absolute inset-0" style={{ clipPath: clip, background: '#f4f1e8' }} />
        {/* 主面 */}
        <div
          className="absolute inset-[3px] flex flex-col items-center justify-between overflow-hidden pb-2 pt-2.5"
          style={{ clipPath: clip, background: active ? 'var(--color-primary)' : '#0d0d0d' }}
        >
          {/* 竖排中文大字：随机 ~1/3 字剪报化（白纸片黑字，微转异形，Ransom 语法） */}
          <div className="flex flex-col items-center leading-none">
            {[...item.label].map((chr, i) => {
              const r = jrand(index * 13.7 + i * 31.9);
              if (r < 0.36) {
                return (
                  <span
                    key={i}
                    className="my-0.5 inline-block px-1 py-0.5 text-[17px] font-black leading-none"
                    style={{
                      background: '#f4f1e8',
                      color: '#0d0d0d',
                      transform: `rotate(${(jrand(index * 17.3 + i * 7.1) - 0.5) * 14}deg)`,
                      clipPath: RANSOM_CLIPS[(index + i) % RANSOM_CLIPS.length],
                      filter: 'drop-shadow(1.5px 1.5px 0 rgba(0,0,0,0.6))',
                    }}
                  >
                    {chr}
                  </span>
                );
              }
              return (
                <span key={i} className="text-[20px] font-black text-white" style={{ textShadow: '1.5px 1.5px 0 rgba(0,0,0,0.55)' }}>
                  {chr}
                </span>
              );
            })}
          </div>
          {/* 竖排英文小字 */}
          <span
            className="text-[8px] font-black tracking-[0.12em] text-white/75"
            style={{ writingMode: 'vertical-rl' }}
          >
            {item.en}
          </span>
        </div>
        {/* 选中：P5Highlight 红青活高亮——竖长贴牌、压在字面之上（screen 混合透字） */}
        {active && <P5Highlight live className="absolute -inset-x-1 -inset-y-5 z-20" />}
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
