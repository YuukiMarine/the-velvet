/**
 * RadialWheelP4 —— 轮盘的 P4（黄/午夜频道）演出层，v3（对照用户参考图返工）：
 *
 *   - 盘面改**实心墨盘**：黄粗轮缘 + 缘内奶油刻度（慢自转）+ 细虚线环，
 *     盘心不再透出天空；
 *   - 四角星再收腰：k 0.19 → 0.14（四条边更细长），并删掉底下叠的 45° 纯黑副星；
 *     星外套一圈奶油细圆环（参考图的星环结构）；
 *   - 七个选项换**不规则菱形徽**（参考图形制）：墨面 + 奶油粗描边 + 竖排中文，
 *     五套四边形轮换避免整齐划一；选中翻黄面墨字并放大；
 *   - 波纹的圆角改回**尖角**（miter——round 的圆头是上一版被点名的丑处）；
 *   - 彩虹弧拉长（-232° → 6°，两端探进天空/盘后）且**平头端点**（去掉 round 线帽）；
 *   - 补五瓣花元素：盘面上两朵小花 + 幕布左右各一朵大花。
 *
 * 命中判定沿用父级 RadialQuickNav 的扇形分区；中心星与大字上提 0.42R
 * （◈ 贴屏底，压在其上会被屏缘切半），只挪视觉不动几何。
 */
import { motion } from 'motion/react';
import { P4Flower, P4Sparkle, P4_FLOWER_PATH } from '@/ui/p4Kit';
import type { WheelItem } from './RadialQuickNav';

const CREAM = '#fff6d0';
const INK = '#131313';
const ORANGE = 'var(--p4-orange, #f9a11b)';
const YELLOW = 'var(--ui-bg, #ffd900)';

/** P4G 味的六色彩虹（在暗幕与黄底上都立得住的饱和度） */
const RAINBOW = ['#e94b4b', '#f9a11b', '#ffd900', '#57c15e', '#39a8e0', '#8d6bc7'];

/**
 * 四角星路径：二次曲线 + 控制点收到 k·R。
 * k=0.14（v3，用户口径「四条边更细一些」）；越小腰越深、尖越长。
 */
const starD = (cx: number, cy: number, R: number, k = 0.14): string => {
  const q = R * k;
  return (
    `M${cx} ${cy - R}` +
    ` Q${cx + q} ${cy - q} ${cx + R} ${cy}` +
    ` Q${cx + q} ${cy + q} ${cx} ${cy + R}` +
    ` Q${cx - q} ${cy + q} ${cx - R} ${cy}` +
    ` Q${cx - q} ${cy - q} ${cx} ${cy - R}Z`
  );
};

/** 圆弧路径（彩虹弧用）：角度制，0° = 正右，顺时针为正 */
const arcD = (cx: number, cy: number, r: number, a1: number, a2: number): string => {
  const p = (a: number) => `${cx + r * Math.cos((a * Math.PI) / 180)} ${cy + r * Math.sin((a * Math.PI) / 180)}`;
  return `M${p(a1)} A${r} ${r} 0 ${Math.abs(a2 - a1) > 180 ? 1 : 0} 1 ${p(a2)}`;
};

// ── 0 · 斜天空（底部实景云天楔 + 棱线 + 彩虹缎带）──────────────────────────
const SkyWedge = () => (
  <motion.div
    aria-hidden
    className="pointer-events-none absolute inset-x-0 bottom-0"
    style={{ height: '42vh' }}
    initial={{ y: '55%', opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    exit={{ y: '55%', opacity: 0 }}
    transition={{ type: 'spring', stiffness: 170, damping: 24 }}
  >
    {/* 墨色底衬（斜切比天空多露 6px = 硬棱线） */}
    <div className="absolute inset-0" style={{ background: INK, clipPath: 'polygon(0 22%, 100% 2%, 100% 100%, 0 100%)' }} />
    {/* 奶油棱线层 */}
    <div className="absolute inset-0" style={{ background: CREAM, clipPath: 'polygon(0 24.5%, 100% 4.5%, 100% 100%, 0 100%)' }} />
    {/* 实景云天 */}
    <div className="absolute inset-0 overflow-hidden" style={{ clipPath: 'polygon(0 28%, 100% 8%, 100% 100%, 0 100%)' }}>
      <img
        src="/assets/terminal/p4-cloud-sky.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: '50% 68%', filter: 'saturate(1.18) contrast(1.06)' }}
      />
      <div className="absolute inset-0 bg-[#00a6ff]/10 mix-blend-screen" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(19,19,19,0.30) 0%, rgba(19,19,19,0) 46%)' }} />
    </div>
    {/* 彩虹缎带：精确骑在棱线上（奶油棱线中线 14.5%，斜率在 450px 宽下 ≈ -9°）。
        rotate 必须走 motion 的 style——initial/animate 带了 x，CSS transform 会被整条覆盖 */}
    <motion.div
      className="absolute left-[-4%] right-[-4%]"
      style={{
        top: 'calc(14.5% - 7px)',
        height: 14,
        rotate: -9.05,
        background: `linear-gradient(180deg, ${RAINBOW.map((c, i) => `${c} ${(i / 6) * 100}% ${((i + 1) / 6) * 100}%`).join(', ')})`,
        boxShadow: '0 3px 0 rgba(19,19,19,0.55)',
      }}
      initial={{ x: '-30%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
    />
  </motion.div>
);

// ── 1 · 四角星粗波纹（长按瞬间；尖角，不要 round 的圆头）────────────────────
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
        initial={{ scale: 0.18, opacity: 0, rotate: i % 2 === 1 ? 45 : 0 }}
        animate={{ scale: 3.6 + i * 1.2, opacity: [0, 0.95, 0.5, 0] }}
        transition={{ duration: 1.05, delay: i * 0.1, ease: [0.16, 0.7, 0.35, 1], opacity: { duration: 1.05, delay: i * 0.1, times: [0, 0.1, 0.4, 0.78] } }}
      >
        <path
          d={starD(100, 100, 92)}
          fill="none"
          stroke={i % 2 === 1 ? ORANGE : CREAM}
          strokeWidth={i % 2 === 1 ? 16 : 12}
          strokeLinejoin="miter"
          strokeMiterlimit={10}
        />
      </motion.svg>
    ))}
  </div>
);

// ── 2 · 彩虹弧：六色同心弧，拉长到两端探进盘后/天空，平头端点 ────────────────
const RainbowSweep = ({ origin, R }: { origin: { x: number; y: number }; R: number }) => {
  const pad = R * 0.16;
  const box = R + pad + 80;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute"
      width={box * 2}
      height={box * 2}
      viewBox={`${-box} ${-box} ${box * 2} ${box * 2}`}
      style={{ left: origin.x - box, top: origin.y - box, overflow: 'visible' }}
    >
      {RAINBOW.map((c, i) => (
        <motion.path
          key={c}
          d={arcD(0, 0, R + pad + i * 10, -232, 6)}
          fill="none"
          stroke={c}
          strokeWidth={10}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.66, delay: 0.18 + i * 0.045, ease: [0.3, 0, 0.2, 1] }}
        />
      ))}
    </svg>
  );
};

// ── 3 · 实心墨盘（黄粗轮缘 + 奶油刻度慢自转 + 细虚线环 + 盘面小花）──────────
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
    transition={{ type: 'spring', stiffness: 190, damping: 20, delay: 0.14 }}
  >
    {/* 实心墨盘（用户口径：中间不透出天空） */}
    <circle cx={R} cy={R} r={R * 0.985} fill={INK} />
    {/* 黄粗轮缘 */}
    <circle cx={R} cy={R} r={R * 0.94} fill="none" stroke={YELLOW} strokeWidth={R * 0.06} />
    {/* 刻度：奶油细划 + 逢五黄长划，慢自转 */}
    <motion.g style={{ transformOrigin: `${R}px ${R}px` }} animate={{ rotate: 360 }} transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}>
      {Array.from({ length: 48 }, (_, i) => {
        const a = ((i * 7.5 - 90) * Math.PI) / 180;
        const long = i % 4 === 0;
        const r1 = R * (long ? 0.75 : 0.785);
        const r2 = R * 0.865;
        return (
          <line
            key={i}
            x1={R + r1 * Math.cos(a)}
            y1={R + r1 * Math.sin(a)}
            x2={R + r2 * Math.cos(a)}
            y2={R + r2 * Math.sin(a)}
            stroke={long ? YELLOW : CREAM}
            strokeWidth={long ? 5 : 2.5}
          />
        );
      })}
    </motion.g>
    {/* 细虚线环（反向慢转） */}
    <motion.g style={{ transformOrigin: `${R}px ${R}px` }} animate={{ rotate: -360 }} transition={{ duration: 110, repeat: Infinity, ease: 'linear' }}>
      <circle cx={R} cy={R} r={R * 0.66} fill="none" stroke="rgba(255,246,208,0.55)" strokeWidth={2.5} strokeDasharray="3 7" />
    </motion.g>
    {/* 盘面小花（补五瓣花元素）：kit 的花 path 花心在原点、半径 ~12，按需缩放 */}
    <g transform={`translate(${R * 0.36} ${R * 0.6}) scale(1.5) rotate(14)`}><path d={P4_FLOWER_PATH} fill={YELLOW} fillRule="nonzero" /></g>
    <g transform={`translate(${R * 1.58} ${R * 0.68}) scale(1.15) rotate(-22)`}><path d={P4_FLOWER_PATH} fill={ORANGE} fillRule="nonzero" /></g>
  </motion.svg>
);

// ── 4 · 中心：奶油细圆环 + 长尖四角星 + 衬线大字 ────────────────────────────
const Hub = ({ origin, item, R }: { origin: { x: number; y: number }; item: WheelItem | null; R: number }) => (
  <div
    aria-hidden
    className="pointer-events-none absolute z-30 flex flex-col items-center"
    style={{ left: origin.x, top: origin.y - R * 0.42, transform: 'translate(-50%,-50%)' }}
  >
    <motion.svg
      viewBox="0 0 200 200"
      width={item ? 176 : 150}
      height={item ? 176 : 150}
      className="absolute left-1/2 top-1/2"
      style={{ x: '-50%', y: '-50%', overflow: 'visible' }}
      initial={{ scale: 0, rotate: -140, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 15, delay: 0.32 }}
    >
      {/* 星外奶油细圆环（参考图的星环结构；45° 黑副星按用户口径删除） */}
      <circle cx={100} cy={100} r={72} fill="none" stroke={CREAM} strokeWidth={4.5} />
      <path d={starD(100, 100, 97)} fill={item ? YELLOW : CREAM} stroke={CREAM} strokeWidth={5} strokeLinejoin="miter" strokeMiterlimit={10} paintOrder="stroke" />
    </motion.svg>
    {item && (
      <motion.div
        key={item.id}
        className="relative flex flex-col items-center"
        initial={{ scale: 0.6, opacity: 0, y: 6 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 460, damping: 22 }}
      >
        <span
          className="whitespace-nowrap text-[36px] font-black leading-none"
          style={{ color: INK, fontFamily: 'var(--p4-display-font, "Noto Serif SC", serif)' }}
        >
          {item.label}
        </span>
        <span className="mt-1 h-[3px] w-[42px]" style={{ background: ORANGE }} />
        <span className="mt-1 text-[10px] font-black tracking-[0.22em]" style={{ color: 'rgba(19,19,19,0.62)' }}>
          {item.en}
        </span>
      </motion.div>
    )}
  </div>
);

// ── 5 · 选项：不规则菱形徽（参考图形制；五套四边形轮换）────────────────────
const BADGE_CLIPS = [
  'polygon(50% 0, 100% 48%, 52% 100%, 0 50%)',
  'polygon(46% 4%, 100% 42%, 56% 100%, 0 56%)',
  'polygon(54% 0, 100% 56%, 48% 100%, 0 44%)',
  'polygon(50% 2%, 96% 50%, 50% 98%, 4% 46%)',
  'polygon(44% 0, 100% 50%, 58% 98%, 0 48%)',
];

const Tag = ({
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
  const rot = (armDeg + 90) * 0.14; // 沿环位微扇，顶正、两端 ±12°
  const clip = BADGE_CLIPS[index % BADGE_CLIPS.length];
  const size = active ? 96 : 72;

  return (
    <motion.div
      role="menuitem"
      aria-label={item.label}
      className="pointer-events-none absolute z-20"
      style={{ left: x, top: y, width: size, height: size }}
      initial={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%', rotate: rot }}
      exit={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y }}
      transition={{ type: 'spring', stiffness: 330, damping: 22, delay: 0.28 + index * 0.032 }}
    >
      {/* 选中沿臂向外推一档：不推的话顶位的徽会被中心大星盖住半张。
          径向位移放内层（外层的 x/y 已被居中占用，一层 motion 只有一组位移量） */}
      <motion.div
        className="relative h-full w-full"
        animate={{ x: (active ? R * 0.3 : 0) * Math.cos(a), y: (active ? R * 0.3 : 0) * Math.sin(a) }}
        transition={{ type: 'spring', stiffness: 380, damping: 24 }}
      >
        {/* 奶油描边层 + 内缩面层（同形裁切；不透明度不表达状态） */}
        <span aria-hidden className="absolute inset-0" style={{ background: CREAM, clipPath: clip }} />
        <span aria-hidden className="absolute inset-[4px]" style={{ background: active ? YELLOW : INK, clipPath: clip }} />
        <span
          className="absolute inset-0 flex items-center justify-center text-center font-black"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            fontSize: active ? 21 : 16,
            lineHeight: 1.04,
            color: active ? INK : CREAM,
          }}
        >
          {item.label}
        </span>
        {active && (
          <motion.span
            aria-hidden
            className="absolute -right-2 -top-2"
            initial={{ scale: 0, rotate: -60 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 480, damping: 16 }}
          >
            <P4Sparkle size={22} color={ORANGE} />
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
};

// ── 6 · 幕布上的大五瓣花（补花元素）─────────────────────────────────────────
const Flowers = ({ origin, R }: { origin: { x: number; y: number }; R: number }) => (
  <div className="pointer-events-none absolute inset-0" aria-hidden>
    {[
      { dx: -R * 1.62, dy: -R * 1.66, s: 40, c: YELLOW, rot: 12, d: 0.3 },
      { dx: R * 1.66, dy: -R * 1.28, s: 30, c: CREAM, rot: -18, d: 0.4 },
      { dx: -R * 1.78, dy: -R * 0.5, s: 22, c: ORANGE, rot: 30, d: 0.5 },
    ].map((f, i) => (
      <motion.span
        key={i}
        className="absolute"
        style={{ left: origin.x + f.dx - f.s / 2, top: origin.y + f.dy - f.s / 2, rotate: f.rot }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18, delay: f.d }}
      >
        <P4Flower size={f.s} color={f.c} />
      </motion.span>
    ))}
  </div>
);

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
      <SkyWedge />
      <StarBurst origin={origin} />
      <RainbowSweep origin={origin} R={R} />
      <Dial origin={origin} R={R} />
      <Flowers origin={origin} R={R} />
      {/* 选中扇形指向：墨盘上的一道黄光 */}
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
            <path
              d={`M100 100 L${100 + 96 * Math.cos((-90 - 90 / items.length) * Math.PI / 180)} ${100 + 96 * Math.sin((-90 - 90 / items.length) * Math.PI / 180)} A96 96 0 0 1 ${100 + 96 * Math.cos((-90 + 90 / items.length) * Math.PI / 180)} ${100 + 96 * Math.sin((-90 + 90 / items.length) * Math.PI / 180)} Z`}
              fill="rgba(255,217,0,0.2)"
              stroke={YELLOW}
              strokeWidth={2.5}
            />
          </motion.svg>
        </motion.div>
      )}
      {items.map((item, i) => (
        <Tag key={item.id} item={item} index={i} count={items.length} origin={origin} R={R} active={active === i} />
      ))}
      <Hub origin={origin} item={active === null ? null : items[active]} R={R} />
    </>
  );
};
