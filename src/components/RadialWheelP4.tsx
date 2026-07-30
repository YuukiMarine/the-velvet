/**
 * RadialWheelP4 —— 轮盘的 P4（黄/午夜频道）演出层，v2 全面返工（用户口径）：
 *
 *   - 四角星改「长尖深腰」：v1 的腰太鼓（cubic w=0.42R），读起来像圆角菱形；
 *     现在用二次曲线、控制点收到 0.19R——四个顶点更长、四条边弧度更大；
 *   - 同心圆盘加粗改造：细线圈全部撤掉，换成「墨色粗环（载刻度）/ 橙环 /
 *     奶油珠链环（dasharray 0+间隔 & round 线帽 = 一圈圆珠）/ 内细环」四件套，
 *     底下垫一片半透明黄圆把环组收拢成一个整体；
 *   - 七枚一模一样的黑星徽（重复度太高）换成**斜切奶油签牌**：横排中文 + 硬墨影，
 *     沿环位微扇排布；选中翻墨底黄字、右上迸一枚橙四角星——星形只留给
 *     波纹 / 中心主星，不再满屏都是；
 *   - 新增**斜天空**：底部一整块斜切的实景云天（p4-cloud-sky 素材，频道签名件），
 *     上缘压奶油粗棱线 + 墨色细线，从屏下滑入；
 *   - 新增**彩虹元素**（P4G 语汇）：一组六色彩虹弧从盘外扫过（pathLength 挥入），
 *     天空楔的棱线上再横一条小彩虹缎带。
 *
 * 命中判定沿用父级 RadialQuickNav 的扇形分区（绕 ◈ 上半环，与红频道同构），
 * 本层纯渲染；中心星与大字整体上提 0.42R——◈ 贴屏底，压在其上会被屏缘切半。
 */
import { motion } from 'motion/react';
import { P4Sparkle } from '@/ui/p4Kit';
import type { WheelItem } from './RadialQuickNav';

const CREAM = '#fff6d0';
const INK = '#131313';
const ORANGE = 'var(--p4-orange, #f9a11b)';
const YELLOW = 'var(--ui-bg, #ffd900)';

/** P4G 味的六色彩虹（在暗幕与黄底上都立得住的饱和度） */
const RAINBOW = ['#e94b4b', '#f9a11b', '#ffd900', '#57c15e', '#39a8e0', '#8d6bc7'];

/**
 * 四角星路径 v2：二次曲线 + 控制点收到 k·R（默认 0.19）。
 * k 越小腰越深、尖越长；v1 的 cubic（w=0.42R）就是用户说的「弧度太平缓」。
 */
const starD = (cx: number, cy: number, R: number, k = 0.19): string => {
  const q = R * k;
  return (
    `M${cx} ${cy - R}` +
    ` Q${cx + q} ${cy - q} ${cx + R} ${cy}` +
    ` Q${cx + q} ${cy + q} ${cx} ${cy + R}` +
    ` Q${cx - q} ${cy + q} ${cx - R} ${cy}` +
    ` Q${cx - q} ${cy - q} ${cx} ${cy - R}Z`
  );
};

/** 圆弧路径（彩虹弧用）：角度制，0° = 正右，逆时针为负 */
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
      {/* 上暗下明的一点纵深，别抢轮盘 */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(19,19,19,0.30) 0%, rgba(19,19,19,0) 46%)' }} />
    </div>
    {/* 彩虹缎带：**精确骑在棱线上**。奶油棱线左端 24.5%、右端 4.5%，中线 14.5%；
        斜率 = 20% × 42vh / 100vw，在 450px 宽下 ≈ -9°——缎带转同一个角度才像
        贴着棱走，差几度就会一头扎进黑带、一头飘在天上（v2 初版的穿帮）。 */}
    <motion.div
      className="absolute left-[-4%] right-[-4%]"
      // rotate 必须写进 motion 的 style（motion 值）：initial/animate 里带了 x，
      // motion 会整条接管 transform，写在 CSS transform 里的 rotate 会被覆盖成 0
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

// ── 1 · 四角星粗波纹（长按瞬间）─────────────────────────────────────────────
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
          strokeLinejoin="round"
        />
      </motion.svg>
    ))}
  </div>
);

// ── 2 · 彩虹弧：六色同心弧从盘外左下扫到右上 ────────────────────────────────
const RainbowSweep = ({ origin, R }: { origin: { x: number; y: number }; R: number }) => {
  const pad = R * 0.16;
  const box = R + pad + 70;
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
          d={arcD(0, 0, R + pad + i * 10, -206, -22)}
          fill="none"
          stroke={c}
          strokeWidth={9}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.18 + i * 0.045, ease: [0.3, 0, 0.2, 1] }}
        />
      ))}
    </svg>
  );
};

// ── 3 · 同心圆盘（粗环组 + 刻度慢自转 + 珠链环）────────────────────────────
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
    {/* 半透明黄底盘：把整组环收拢成一件东西 */}
    <circle cx={R} cy={R} r={R * 0.98} fill="rgba(255,217,0,0.14)" />
    {/* 墨色粗环（承载刻度） */}
    <circle cx={R} cy={R} r={R * 0.88} fill="none" stroke={INK} strokeWidth={R * 0.17} />
    {/* 刻度：随粗环慢自转；每 7.5° 一根、逢五加长翻黄 */}
    <motion.g style={{ transformOrigin: `${R}px ${R}px` }} animate={{ rotate: 360 }} transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}>
      {Array.from({ length: 48 }, (_, i) => {
        const a = ((i * 7.5 - 90) * Math.PI) / 180;
        const long = i % 4 === 0;
        const r1 = R * (long ? 0.815 : 0.845);
        const r2 = R * (long ? 0.945 : 0.915);
        return (
          <line
            key={i}
            x1={R + r1 * Math.cos(a)}
            y1={R + r1 * Math.sin(a)}
            x2={R + r2 * Math.cos(a)}
            y2={R + r2 * Math.sin(a)}
            stroke={long ? YELLOW : CREAM}
            strokeWidth={long ? 5 : 3}
            strokeLinecap="round"
          />
        );
      })}
    </motion.g>
    {/* 橙环 */}
    <circle cx={R} cy={R} r={R * 0.7} fill="none" stroke={ORANGE} strokeWidth={R * 0.075} />
    {/* 奶油珠链环：dasharray「0 + 间隔」+ round 线帽 = 一圈圆珠，反向慢转 */}
    <motion.g style={{ transformOrigin: `${R}px ${R}px` }} animate={{ rotate: -360 }} transition={{ duration: 110, repeat: Infinity, ease: 'linear' }}>
      <circle
        cx={R}
        cy={R}
        r={R * 0.585}
        fill="none"
        stroke={CREAM}
        strokeWidth={R * 0.045}
        strokeLinecap="round"
        strokeDasharray={`0 ${(2 * Math.PI * R * 0.585) / 26}`}
      />
    </motion.g>
    {/* 内细环 */}
    <circle cx={R} cy={R} r={R * 0.46} fill="none" stroke={INK} strokeWidth={R * 0.028} />
  </motion.svg>
);

// ── 4 · 中心大四角星 + 选中项衬线大字 ──────────────────────────────────────
const Hub = ({ origin, item, R }: { origin: { x: number; y: number }; item: WheelItem | null; R: number }) => (
  // ◈ 贴在屏幕最底，压在其上会被屏缘切半——整体上提到可见半圆的中心；
  // 命中判定仍以 ◈ 为极点（父级算角度），只挪视觉不动几何。
  <div
    aria-hidden
    className="pointer-events-none absolute z-30 flex flex-col items-center"
    style={{ left: origin.x, top: origin.y - R * 0.42, transform: 'translate(-50%,-50%)' }}
  >
    <motion.svg
      viewBox="0 0 200 200"
      width={item ? 176 : 138}
      height={item ? 176 : 138}
      className="absolute left-1/2 top-1/2"
      style={{ x: '-50%', y: '-50%', overflow: 'visible' }}
      initial={{ scale: 0, rotate: -140, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 15, delay: 0.32 }}
    >
      {/* 底下垫一枚 45° 的墨色副星：双星错位 = 频道贴纸语法，也当外描边 */}
      <path d={starD(100, 100, 82)} fill={INK} transform="rotate(45 100 100)" />
      <path d={starD(100, 100, 96)} fill={item ? YELLOW : CREAM} stroke={INK} strokeWidth={8} strokeLinejoin="round" paintOrder="stroke" />
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

// ── 5 · 签牌（斜切奶油小牌，取代 v1 的七枚黑星徽）──────────────────────────
const TAG_CLIP = 'polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)';

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
  // 沿环位微扇（顶正、两端 ±20°），牌面永远可读
  const rot = (armDeg + 90) * 0.22;

  return (
    <motion.div
      role="menuitem"
      aria-label={item.label}
      className="pointer-events-none absolute z-20"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y, rotate: 0 }}
      animate={{ opacity: 1, scale: active ? 1.14 : 1, x: '-50%', y: '-50%', rotate: rot }}
      exit={{ opacity: 0, scale: 0.2, x: origin.x - x, y: origin.y - y }}
      transition={{ type: 'spring', stiffness: 330, damping: 22, delay: 0.28 + index * 0.032 }}
    >
      <div className="relative px-4 py-1.5">
        {/* 硬墨影 + 面：斜切签牌（P4 贴纸语法，不透明度不表达状态） */}
        <span aria-hidden className="absolute inset-0" style={{ background: INK, clipPath: TAG_CLIP, transform: 'translate(3.5px,4px)' }} />
        <span aria-hidden className="absolute inset-0" style={{ background: active ? INK : CREAM, clipPath: TAG_CLIP }} />
        {/* 左缘橙条 */}
        <span aria-hidden className="absolute bottom-[3px] left-[6px] top-[3px] w-[4px]" style={{ background: active ? YELLOW : ORANGE, transform: 'skewX(-14deg)' }} />
        <span
          className="relative block whitespace-nowrap text-[16px] font-black leading-none"
          style={{ color: active ? YELLOW : INK }}
        >
          {item.label}
        </span>
        {/* 选中：右上迸一枚橙四角星 */}
        {active && (
          <motion.span
            aria-hidden
            className="absolute -right-3 -top-3.5"
            initial={{ scale: 0, rotate: -60 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 480, damping: 16 }}
          >
            <P4Sparkle size={22} color={ORANGE} />
          </motion.span>
        )}
      </div>
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
      <SkyWedge />
      <StarBurst origin={origin} />
      <RainbowSweep origin={origin} R={R} />
      <Dial origin={origin} R={R} />
      {/* 选中扇形指向：橙面 + 奶油描边，转到选中瓣的方向 */}
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
              fill="rgba(249,161,27,0.34)"
              stroke={CREAM}
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
