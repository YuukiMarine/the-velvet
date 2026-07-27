/**
 * p5rKit —— P5「红黑剪报」全站视觉底座（P5UI/ 设计稿 1:1 复刻用）。
 *
 * 语言要素（对照 p5-dashboard-flat-newsprint-v1.png 等 24 张稿）：
 *   - 底：纯黑舞台 + 大块猩红斜切碰撞 + 半调网点 + 散落五角星；
 *   - 形：一切纸卡都是「四角各自错动」的不规则四边形，黑框粗细天然不等宽——
 *     实现 = 多层错位多边形（影层/纸外圈/黑框/纸面 各自独立抖动，层间露出即边框）；
 *   - 色：猩红 #c00008（横幅/选中/CTA）· 纯黑 · 米白纸 #f0e9df · 灰 #6b6862 · 橙点缀；
 *   - 字：黑体拉满字重；标题 = 拼贴信纸瓷砖（每字一块、异色穿插、微旋转）；
 *   - 五角星是唯一图腾：实红/纸白/黑、多层描边、爆炸多尖变体、四角星闪光。
 *
 * 确定性铁律：所有「随机」形状由 mulberry32(seed) 生成——同 seed 恒同形，
 * 重渲染零抖动；装饰一律 aria-hidden + pointer-events-none；命中区完整矩形。
 * 仅在 channel==='p5'（红主题）挂载的页面变体中使用。
 */
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

export const P5R = {
  red: '#c00008',      // 主红（横幅 / 选中 / 大按钮）
  redDeep: '#8e0000',  // 暗红（背景碎片 / 影）
  redHot: '#d90008',   // 亮红（日期大数字 / 强调）
  ink: '#000000',      // 纯黑（舞台 / 描边 / 硬影）
  panel: '#0d0d0d',    // 面板黑（微浮于纯黑舞台的卡面）
  paper: '#f0e9df',    // 米白纸面
  paperDim: '#dcd4c4', // 纸阴影面（水印 / 分隔）
  grey: '#6b6862',     // 灰星 / 图标灰
  greyLight: '#9b9791',// 浅灰（占卜磁贴 / 次级块）
  orange: '#e06808',   // 橙（成就数字专用点缀）
  white: '#f8f8f6',    // 近白（黑底上的字）
} as const;

/** 黑体拉满字重的标题字栈（不引入网络字体，PWA 离线不破坏） */
export const P5_FONT = '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif';

// ── 确定性伪随机 ─────────────────────────────────────────────────────────────
const mulberry = (seed: number) => {
  let a = (Math.round(seed * 1000) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 不规则四边形 clip：四角各自向内错动 0..jag px（seed 同形恒定）。
 *  多层叠用不同 seed → 层间露出的宽度连续变化 = 「不等宽边框」的来源。 */
export const roughQuad = (seed: number, jag = 7): string => {
  const r = mulberry(seed);
  const j = () => (r() * jag).toFixed(1);
  return `polygon(${j()}px ${j()}px, calc(100% - ${j()}px) ${j()}px, calc(100% - ${j()}px) calc(100% - ${j()}px), ${j()}px calc(100% - ${j()}px))`;
};

/** 八点变体：四角 + 四边中点内凹/外凸，撕纸感更强（横幅 / 大面积红斜块用） */
export const roughOct = (seed: number, jag = 10): string => {
  const r = mulberry(seed + 0.5);
  const j = () => (r() * jag).toFixed(1);
  return `polygon(${j()}px ${j()}px, 50% ${(r() * jag * 0.6).toFixed(1)}px, calc(100% - ${j()}px) ${j()}px, calc(100% - ${(r() * jag * 0.6).toFixed(1)}px) 50%, calc(100% - ${j()}px) calc(100% - ${j()}px), 50% calc(100% - ${(r() * jag * 0.6).toFixed(1)}px), ${j()}px calc(100% - ${j()}px), ${(r() * jag * 0.6).toFixed(1)}px 50%)`;
};

// ── 纸卡面板（三/四层错位多边形 = 不规则形 + 不等宽边框 + 硬影）──────────────
export interface P5PanelProps {
  /** 形状种子：同页多卡请用不同 seed，否则轮廓完全一样穿帮 */
  seed?: number;
  /** 角错动幅度 px */
  jag?: number;
  /** 黑框基准厚度 */
  frame?: number;
  /** 纸色外圈厚度（深底上的卡用 ≥2 露出白圈；纸/红底上的卡用 0） */
  keyline?: number;
  face?: string;
  frameColor?: string;
  keylineColor?: string;
  /** 硬影平移；null 关闭 */
  shadow?: { x: number; y: number; color?: string } | null;
  rot?: number;
  className?: string;
  /** 内容层类（padding 写这里；注意留出 keyline+frame+jag 的呼吸） */
  bodyClassName?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  children?: ReactNode;
}

export const P5Panel = ({
  seed = 1,
  jag = 6,
  frame = 3,
  keyline = 0,
  face = P5R.paper,
  frameColor = P5R.ink,
  keylineColor = P5R.paper,
  shadow = { x: 5, y: 6 },
  rot = 0,
  className,
  bodyClassName,
  style,
  bodyStyle,
  children,
}: P5PanelProps) => (
  <div className={`relative ${className ?? ''}`} style={{ transform: rot ? `rotate(${rot}deg)` : undefined, ...style }}>
    {shadow && (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ transform: `translate(${shadow.x}px, ${shadow.y}px)`, background: shadow.color ?? P5R.ink, clipPath: roughQuad(seed + 0.13, jag + 2) }}
      />
    )}
    {keyline > 0 && (
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: keylineColor, clipPath: roughQuad(seed + 0.29, jag) }} />
    )}
    <div aria-hidden className="pointer-events-none absolute" style={{ inset: keyline, background: frameColor, clipPath: roughQuad(seed + 0.41, jag) }} />
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ inset: keyline + frame, background: face, clipPath: roughQuad(seed + 0.57, Math.max(2, jag - 2)) }}
    />
    <div className={`relative ${bodyClassName ?? ''}`} style={bodyStyle}>{children}</div>
  </div>
);

// ── 五角星族 ─────────────────────────────────────────────────────────────────
/** 正五角星点集（rot=-90 顶点朝上；innerRatio 0.42 = 设计稿的锐星） */
export const starPts = (cx: number, cy: number, R: number, rot = -90, innerRatio = 0.42): string => {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = ((rot + i * 72) * Math.PI) / 180;
    const b = ((rot + i * 72 + 36) * Math.PI) / 180;
    pts.push(`${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`);
    pts.push(`${(cx + R * innerRatio * Math.cos(b)).toFixed(1)},${(cy + R * innerRatio * Math.sin(b)).toFixed(1)}`);
  }
  return pts.join(' ');
};

/** 实心五角星：ring2→ring→fill 同形缩放叠层（贴纸式多层描边：尖角处自然更厚） */
export const P5Star = ({
  size = 24,
  fill = P5R.red,
  ring,
  ring2,
  rot = 0,
  className,
  style,
}: {
  size?: number;
  fill?: string;
  /** 内圈描边色（如黑） */
  ring?: string;
  /** 最外圈描边色（如纸白） */
  ring2?: string;
  rot?: number;
  className?: string;
  style?: CSSProperties;
}) => (
  <svg
    viewBox="0 0 100 100"
    width={size}
    height={size}
    className={className}
    style={{ transform: rot ? `rotate(${rot}deg)` : undefined, ...style }}
    aria-hidden
  >
    {ring2 && <polygon points={starPts(50, 50, 50)} fill={ring2} />}
    {ring && <polygon points={starPts(50, 50, ring2 ? 41 : 50)} fill={ring} />}
    <polygon points={starPts(50, 50, ring2 ? 32 : ring ? 40 : 50)} fill={fill} />
  </svg>
);

/** 空心描边星（背景水印 / 装饰） */
export const P5StarOutline = ({ size = 24, color = P5R.paper, width = 7, className, style, rot = 0 }: {
  size?: number; color?: string; width?: number; className?: string; style?: CSSProperties; rot?: number;
}) => (
  <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ transform: rot ? `rotate(${rot}deg)` : undefined, ...style }} aria-hidden>
    <polygon points={starPts(50, 50, 46)} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="miter" />
  </svg>
);

/** 爆炸多尖星（seed 抖动尖长）：横幅端头 / 面板边缘冲出的那种 */
export const P5Burst = ({
  size = 60,
  points = 9,
  fill = P5R.red,
  ring,
  seed = 3,
  className,
  style,
}: {
  size?: number;
  points?: number;
  fill?: string;
  ring?: string;
  seed?: number;
  className?: string;
  style?: CSSProperties;
}) => {
  const r = mulberry(seed);
  const mk = (R: number) => {
    const pts: string[] = [];
    for (let i = 0; i < points; i++) {
      const a = ((-90 + (i * 360) / points) * Math.PI) / 180;
      const b = ((-90 + (i * 360) / points + 180 / points) * Math.PI) / 180;
      const ro = R * (0.72 + r() * 0.28);
      const ri = R * (0.3 + r() * 0.14);
      pts.push(`${(50 + ro * Math.cos(a)).toFixed(1)},${(50 + ro * Math.sin(a)).toFixed(1)}`);
      pts.push(`${(50 + ri * Math.cos(b)).toFixed(1)},${(50 + ri * Math.sin(b)).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const outer = mk(50);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={style} aria-hidden>
      {ring && <polygon points={outer} fill="none" stroke={ring} strokeWidth={7} strokeLinejoin="miter" />}
      <polygon points={outer} fill={fill} transform={ring ? 'translate(50 50) scale(0.86) translate(-50 -50)' : undefined} />
    </svg>
  );
};

/** 四角星闪光（✦） */
export const P5Sparkle = ({ size = 14, color = P5R.red, className, style }: { size?: number; color?: string; className?: string; style?: CSSProperties }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} aria-hidden>
    <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill={color} />
  </svg>
);

/** 半调网点补丁（P5 专属默认：白点低透明度洒在黑上 / 黑点洒在红上） */
export const P5Dots = ({ className, style, dot = 1.6, gap = 9, color = '#6e6a62' }: {
  className?: string; style?: CSSProperties; dot?: number; gap?: number; color?: string;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none ${className ?? ''}`}
    style={{
      backgroundImage: `radial-gradient(circle, ${color} ${dot}px, transparent ${dot + 0.4}px)`,
      backgroundSize: `${gap}px ${gap}px`,
      ...style,
    }}
  />
);

// ── 拼贴信纸标题 ─────────────────────────────────────────────────────────────
export interface CollageTile {
  ch: string;
  /** 瓷砖底色（默认按位次循环 红/纸/纸/黑） */
  bg?: string;
  fg?: string;
  /** 相对基准字号的缩放（设计稿首字常更大） */
  scale?: number;
  rot?: number;
  /** 垂直错位 px */
  dy?: number;
}

const TILE_DEFAULTS: Array<{ bg: string; fg: string }> = [
  { bg: P5R.red, fg: P5R.ink },
  { bg: P5R.paper, fg: P5R.ink },
  { bg: P5R.paper, fg: P5R.grey },
  { bg: P5R.ink, fg: P5R.greyLight },
];
const TILE_ROT = [-3.5, 2.5, -2, 3.2, -2.6, 2];
const TILE_DY = [0, 7, 2, 9, 4, 8];

/** 勒索信剪报标题：每字一块瓷砖（异色穿插 + 微旋转 + 白圈黑框硬影）。
 *  入场（boldness≥1）：瓷砖依次砸落就位；D0 静态。 */
export const P5Collage = ({ tiles, size = 52, gap = 5, className, delay = 0 }: {
  tiles: CollageTile[];
  size?: number;
  gap?: number;
  className?: string;
  delay?: number;
}) => {
  const anim = useBoldness();
  return (
    <div className={`flex items-start ${className ?? ''}`} style={{ gap }}>
      {tiles.map((t, i) => {
        const d = TILE_DEFAULTS[i % TILE_DEFAULTS.length];
        const s = size * (t.scale ?? 1);
        return (
          <motion.span
            key={`${t.ch}-${i}`}
            className="inline-flex shrink-0 select-none items-center justify-center font-black"
            initial={anim ? { scale: 1.7, opacity: 0, rotate: (t.rot ?? TILE_ROT[i % TILE_ROT.length]) * 3 } : false}
            animate={{ scale: 1, opacity: 1, rotate: t.rot ?? TILE_ROT[i % TILE_ROT.length] }}
            transition={{ type: 'spring', stiffness: 520, damping: 26, delay: delay + i * 0.06 }}
            style={{
              width: s * 1.24,
              height: s * 1.24,
              marginTop: t.dy ?? TILE_DY[i % TILE_DY.length],
              fontSize: s,
              lineHeight: 1,
              fontFamily: P5_FONT,
              background: t.bg ?? d.bg,
              color: t.fg ?? d.fg,
              border: `3px solid ${P5R.ink}`,
              boxShadow: `0 0 0 3px ${P5R.paper}, 6px 7px 0 #000000`,
            }}
          >
            {t.ch}
          </motion.span>
        );
      })}
    </div>
  );
};

/** 拼贴标题下的黑条副标（「TAKE BACK ☆」式）：黑底 + 分色词 + 白圈硬影 + 微旋转 */
export const P5SubBar = ({ segs, star = true, rot = -1.6, className }: {
  segs: Array<{ t: string; c?: string }>;
  star?: boolean;
  rot?: number;
  className?: string;
}) => (
  <div
    className={`inline-flex select-none items-center gap-2 px-3.5 py-1 ${className ?? ''}`}
    style={{
      background: P5R.ink,
      transform: `rotate(${rot}deg)`,
      boxShadow: `0 0 0 2.5px ${P5R.paper}, 5px 5px 0 #000000`,
    }}
  >
    {segs.map((s, i) => (
      <span key={i} className="text-[17px] font-black leading-none tracking-[0.14em]" style={{ color: s.c ?? P5R.white, fontFamily: P5_FONT }}>
        {s.t}
      </span>
    ))}
    {star && (
      <svg viewBox="0 0 100 100" width={15} height={15} aria-hidden>
        <polygon points={starPts(50, 50, 46)} fill="none" stroke={P5R.white} strokeWidth={10} strokeLinejoin="miter" />
      </svg>
    )}
  </div>
);

// ── 楔形节标 / 徽章 ──────────────────────────────────────────────────────────
/** 楔形节标（左直右斜 + 微旋转）：tone=ink 黑底白字（今日任务）/ paper 纸底黑字（人格星象） */
export const P5Wedge = ({ children, star = true, tone = 'ink', rot = -1.2, keyline = true, className, style }: {
  children: ReactNode;
  star?: boolean;
  tone?: 'ink' | 'paper' | 'red';
  rot?: number;
  /** 深底上的黑楔要一圈纸边才看得见轮廓 */
  keyline?: boolean;
  className?: string;
  style?: CSSProperties;
}) => {
  const bg = tone === 'ink' ? P5R.ink : tone === 'red' ? P5R.red : P5R.paper;
  const fg = tone === 'paper' ? P5R.ink : P5R.white;
  const wedge = 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)';
  return (
    <div className={`relative inline-block ${className ?? ''}`} style={{ transform: `rotate(${rot}deg)`, ...style }}>
      {keyline && (
        <span aria-hidden className="absolute -inset-[2.5px]" style={{ background: tone === 'paper' ? P5R.ink : P5R.paper, clipPath: wedge }} />
      )}
      <span className="relative flex items-center gap-2 py-1.5 pl-4 pr-8" style={{ background: bg, clipPath: wedge }}>
        <span className="text-[19px] font-black leading-none tracking-wide" style={{ color: fg, fontFamily: P5_FONT }}>{children}</span>
        {star && <P5Star size={15} fill={fg} className="shrink-0" />}
      </span>
    </div>
  );
};

/** 小徽章片（「暂无」「详细统计 →」「SAT」「知识」属性名……）——平行四边形微斜 */
export const P5Chip = ({ children, tone = 'red', rot = 0, className, style, onClick, ariaLabel }: {
  children: ReactNode;
  tone?: 'red' | 'ink' | 'paper';
  rot?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  ariaLabel?: string;
}) => {
  const skin: Record<string, CSSProperties> = {
    red: { background: P5R.red, color: P5R.white, boxShadow: `2px 2.5px 0 ${P5R.ink}` },
    ink: { background: P5R.ink, color: P5R.white, boxShadow: `2px 2.5px 0 ${P5R.grey}` },
    paper: { background: P5R.paper, color: P5R.ink, boxShadow: `2px 2.5px 0 ${P5R.ink}` },
  };
  const cls = `inline-flex select-none items-center gap-1 px-2.5 py-1 text-[13px] font-black leading-none ${className ?? ''}`;
  const st: CSSProperties = {
    clipPath: 'polygon(3px 0, 100% 1px, calc(100% - 3px) 100%, 0 calc(100% - 2px))',
    transform: rot ? `rotate(${rot}deg)` : undefined,
    fontFamily: P5_FONT,
    ...skin[tone],
    ...style,
  };
  if (onClick) {
    return (
      <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={onClick} aria-label={ariaLabel} className={`${cls} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008] focus-visible:ring-offset-1`} style={st}>
        {children}
      </motion.button>
    );
  }
  return <span className={cls} style={st}>{children}</span>;
};

/** 不规则块底三层（影/黑框/面）——按钮与小件的通用垫底，渲染为绝对层组，父需 relative。
 *  反板正铁律（用户口径）：任何按钮/组件不得是板正矩形——最规整也要不规则四边形 +
 *  不等宽描边/错位影。内容自行放在层组之后的 relative 元素里。 */
export const P5Rough = ({ seed, jag = 6, frame = 3, face = P5R.paper, frameColor = P5R.ink, shadow = { x: 3, y: 4 }, shadowColor, className }: {
  seed: number;
  jag?: number;
  frame?: number;
  face?: string;
  frameColor?: string;
  shadow?: { x: number; y: number } | null;
  shadowColor?: string;
  className?: string;
}) => (
  <span aria-hidden className={`pointer-events-none absolute inset-0 ${className ?? ''}`}>
    {shadow && (
      <span className="absolute inset-0" style={{ transform: `translate(${shadow.x}px, ${shadow.y}px)`, background: shadowColor ?? P5R.ink, clipPath: roughQuad(seed + 0.13, jag + 1.5) }} />
    )}
    <span className="absolute inset-0" style={{ background: frameColor, clipPath: roughQuad(seed + 0.29, jag) }} />
    <span className="absolute" style={{ inset: frame, background: face, clipPath: roughQuad(seed + 0.47, Math.max(2, jag - 2)) }} />
  </span>
);

// ── 大按钮 ───────────────────────────────────────────────────────────────────
/** P5 大按钮：红面/纸面/黑面 + 不等宽黑框 + 硬影，按下沉入影位 */
export const P5Btn = ({ children, tone = 'red', seed = 9, onClick, disabled = false, className, bodyClassName, ariaLabel, rot = 0 }: {
  children: ReactNode;
  tone?: 'red' | 'paper' | 'ink';
  seed?: number;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
  rot?: number;
}) => {
  const face = tone === 'red' ? P5R.red : tone === 'ink' ? P5R.ink : P5R.paper;
  const fg = tone === 'paper' ? P5R.ink : P5R.white;
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { x: 3, y: 4 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008] focus-visible:ring-offset-2 ${className ?? ''}`}
      style={{ rotate: rot }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(4px, 5px)', background: P5R.ink, clipPath: roughQuad(seed + 0.13, 7) }} />
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(seed + 0.29, 6) }} />
      <span aria-hidden className="pointer-events-none absolute inset-[2.5px]" style={{ background: P5R.ink, clipPath: roughQuad(seed + 0.41, 5) }} />
      <span aria-hidden className="pointer-events-none absolute inset-[5.5px]" style={{ background: face, clipPath: roughQuad(seed + 0.57, 4) }} />
      <span className={`relative flex items-center justify-center gap-2 px-6 py-3 text-[17px] font-black tracking-wider ${bodyClassName ?? ''}`} style={{ color: fg, fontFamily: P5_FONT }}>
        {children}
      </span>
    </motion.button>
  );
};

// ── 页面壳 ───────────────────────────────────────────────────────────────────
/** 红斜块装饰件（舞台/区块通用）：确定性撕边多边形 */
export const P5Slab = ({ color = P5R.red, seed = 5, className, style, rot = 0 }: {
  color?: string; seed?: number; className?: string; style?: CSSProperties; rot?: number;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute ${className ?? ''}`}
    style={{ background: color, clipPath: roughOct(seed, 14), transform: rot ? `rotate(${rot}deg)` : undefined, ...style }}
  />
);

/** 页面壳：纯黑舞台（fixed 铺满）+ 低密度全局装饰；active=false 退化直通。
 *  大块红色构图交给各页面的「区块局部装饰」（zIndex:-1 沉底），这里只铺氛围。 */
export const P5RPage = ({ children, className, active = true, decor = true }: {
  children: ReactNode;
  className?: string;
  active?: boolean;
  decor?: boolean;
}) => {
  if (!active) return <>{children}</>;
  return (
    <div className={`relative ${className ?? ''}`}>
      <div aria-hidden className="fixed inset-0 z-0 pointer-events-none" style={{ background: P5R.ink, contain: 'strict' }}>
        {decor && (
          <>
            {/* 右上暗红斜块（探出屏缘） */}
            <P5Slab color={P5R.redDeep} seed={11} rot={14} style={{ right: -90, top: -60, width: 230, height: 190 }} />
            {/* 左中暗红楔 */}
            <P5Slab color="#4a0000" seed={12} rot={-9} style={{ left: -110, top: '38%', width: 200, height: 240 }} />
            {/* 底部左暗红 */}
            <P5Slab color={P5R.redDeep} seed={13} rot={7} style={{ left: -70, bottom: -80, width: 240, height: 200 }} />
            {/* 半调网点两片（纯色暗灰点——舞台上不用透明度表达） */}
            <P5Dots className="absolute" style={{ left: 0, top: 96, width: 90, height: 130 }} color="#57534c" />
            <P5Dots className="absolute" style={{ right: 0, bottom: '24%', width: 76, height: 150 }} dot={1.3} gap={8} color="#4a4741" />
            {/* 散落描边星（纯色暗灰 / 暗红） */}
            <P5StarOutline size={30} color="#57534c" rot={-14} className="absolute" style={{ right: 24, top: '30%' }} />
            <P5StarOutline size={20} color="#5c0004" rot={18} className="absolute" style={{ left: 14, top: '58%' }} />
            <P5Star size={14} fill="#4a4741" rot={10} className="absolute" style={{ right: 52, bottom: '14%' }} />
          </>
        )}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
};
