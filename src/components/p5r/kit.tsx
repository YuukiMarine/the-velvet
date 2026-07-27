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

/**
 * 斜平行四边形 + 顶点抖动 —— 设计稿里 tab / 段钮 / 横条的标准轮廓。
 * 与 roughQuad 的区别：整体向右倾（上边右移、下边左移），杜绝「板正矩形」的观感。
 */
export const roughSlant = (seed: number, slant = 14, jag = 3): string => {
  const r = mulberry(seed + 0.77);
  const j = () => (r() * jag).toFixed(1);
  const s = () => (slant + r() * jag).toFixed(1);
  return `polygon(${s()}px ${j()}px, calc(100% - ${j()}px) ${j()}px, calc(100% - ${s()}px) calc(100% - ${j()}px), ${j()}px calc(100% - ${j()}px))`;
};

/**
 * 横幅撕边形（首页「今日仪式」红幅制式）：左右两端斜切更狠，上下沿轻微起伏。
 * 由 seed 决定唯一形状；同一张幅的影/衬/面三层用 seed 派生值即得不等宽边框。
 */
export const roughBanner = (seed: number): string => {
  const r = mulberry(seed);
  const j = (amp: number) => (r() * amp).toFixed(1);
  return `polygon(${j(14)}px ${j(8)}px, 40% ${j(5)}px, calc(100% - ${j(16)}px) ${j(8)}px, calc(100% - ${j(6)}px) calc(50% + ${j(8)}px), calc(100% - ${j(18)}px) calc(100% - ${j(8)}px), 55% calc(100% - ${j(5)}px), ${j(16)}px calc(100% - ${j(9)}px), ${j(5)}px calc(50% - ${j(8)}px))`;
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

/**
 * 抖动五角星点集 —— 每个内外顶点的半径按 seed 各自浮动，得到「手撕纸」的不规则星。
 * 用途：贴纸式叠层里最外那圈白描边（正圆星缩放叠出来的边太匀，稿上是歪的）。
 */
export const jitterStarPts = (cx: number, cy: number, R: number, seed: number, jag = 0.08, rot = -90, innerRatio = 0.42): string => {
  const rnd = mulberry(seed);
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = ((rot + i * 72) * Math.PI) / 180;
    const b = ((rot + i * 72 + 36) * Math.PI) / 180;
    const ro = R * (1 + (rnd() - 0.5) * 2 * jag);
    const ri = R * innerRatio * (1 + (rnd() - 0.5) * 2 * jag);
    pts.push(`${(cx + ro * Math.cos(a)).toFixed(1)},${(cy + ro * Math.sin(a)).toFixed(1)}`);
    pts.push(`${(cx + ri * Math.cos(b)).toFixed(1)},${(cy + ri * Math.sin(b)).toFixed(1)}`);
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

/**
 * BubbleMark —— 气泡右上角的「！/ ？」粗白描边小角标（设计稿签名件，三频道通用）。
 *
 * 触发：文本里出现 ！! 就出叹号（优先），只出现 ？? 出问号，都没有则不渲染。
 * 造型：不规则四边形黑底 + 粗糙白描边（两层异形错位），入场先弹出再回正并轻晃。
 * 三个频道只换配色，形与动效共用。
 */
export type MarkChannel = 'p5' | 'p4' | 'p3';

/** 字形填色 + 粗描边色（不是方块底：描边直接长在字上） */
const MARK_SKIN: Record<MarkChannel, { ink: string; edge: string }> = {
  p5: { ink: '#f0e9df', edge: '#050505' },
  p4: { ink: '#131313', edge: '#fff6d0' },
  p3: { ink: '#ffffff', edge: '#0a1230' },
};

/** 从文本判定角标字符；无则 null */
export const bubbleMarkOf = (text: string | undefined | null): '!' | '?' | null => {
  if (!text) return null;
  if (/[!！]/.test(text)) return '!';
  if (/[?？]/.test(text)) return '?';
  return null;
};

/**
 * 手绘字形（不吃字体渲染——不同系统/字重下「！」「？」的粗细与转角软硬差异很大，
 * 直接画笔画保证跨平台一致的硬边）：
 *   「！」= 折线笔画（描边+内芯双层）+ 独立菱形点；
 *   「？」= 硬折角钩形笔画（同一根折线，miter 尖角、方头端点，不走圆弧）+ 同款菱形点。
 * 描边法：同一路径画两遍——先粗（edge 色）再细（ink 色），linejoin="miter" +
 * linecap="square" 保证转角是尖角、端头是平切，不出现任何圆润的地方。
 */
const MARK_STROKE = {
  '!': '27,3 25,22 22,42',
  '?': '15,11 28,2 43,6 46,19 35,29 26,31 25,43',
} as const;
/** 点：单条菱形轮廓（描边宽见下方 DOT_STROKE_W）。
 *  当前点位 = 原始形以质心 (24,60) 为中心缩到 72%（先 80% 再 90%，两轮调整叠加）。 */
const MARK_DOT = '19.68,52.8 31.2,55.68 28.32,67.2 16.8,64.32';
/** 折线笔画：外层描边宽 / 内芯宽 */
const STROKE_W = 25;
const INK_W = 7;
/** 点的描边宽（点体积小，跟折线同宽会糊成一坨，单独一档） */
const DOT_STROKE_W = 14;

export const BubbleMark = ({ mark, channel = 'p5', size = 34, className, style }: {
  mark: '!' | '?';
  channel?: MarkChannel;
  /** 字形高度（px） */
  size?: number;
  className?: string;
  style?: CSSProperties;
}) => {
  const anim = useBoldness();
  const sk = MARK_SKIN[channel];
  const points = MARK_STROKE[mark];
  return (
    <motion.span
      aria-hidden
      className={`pointer-events-none absolute ${className ?? ''}`}
      style={{ width: size * 0.78, height: size, ...style }}
      initial={anim ? { scale: 0, rotate: -30, opacity: 0 } : false}
      animate={anim
        ? { scale: [0, 1.3, 1], rotate: [-30, 10, -5], opacity: 1 }
        : { scale: 1, rotate: -5, opacity: 1 }}
      transition={{ duration: 0.46, times: [0, 0.62, 1], ease: [0.2, 1.45, 0.4, 1], delay: 0.14 }}
    >
      <svg viewBox="0 0 56 72" className="h-full w-full overflow-visible">
        <polyline points={points} fill="none" stroke={sk.edge} strokeWidth={STROKE_W} strokeLinejoin="miter" strokeLinecap="square" />
        <polyline points={points} fill="none" stroke={sk.ink} strokeWidth={INK_W} strokeLinejoin="miter" strokeLinecap="square" />
        {/* 点：描边居中于路径 + paintOrder="stroke" 让内芯盖掉描边的内半圈，
            只留外半圈可见——与上面折线「先粗后细」殊途同归，且直接吃同一组宽度参数 */}
        <polygon
          points={MARK_DOT}
          fill={sk.ink}
          stroke={sk.edge}
          strokeWidth={DOT_STROKE_W}
          strokeLinejoin="miter"
          paintOrder="stroke"
        />
      </svg>
    </motion.span>
  );
};

/**
 * 同心多环星 —— 由外到内逐层缩半径铺色（p5-modal-07 主视觉：黑/纸/红/纸/黑 五环）。
 * 比 P5Star 的三层版自由：环数、每环占比都由 rings 数组决定。
 */
export const P5RingStar = ({ size = 120, rings = [P5R.ink, P5R.paper, P5R.red, P5R.paper, P5R.ink], step = 0.145, rot = 0, className, style }: {
  size?: number;
  /** 由外到内的环色 */
  rings?: string[];
  /** 每层半径相对最外层的递减比例 */
  step?: number;
  rot?: number;
  className?: string;
  style?: CSSProperties;
}) => (
  <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={{ transform: rot ? `rotate(${rot}deg)` : undefined, ...style }} aria-hidden>
    {rings.map((c, i) => (
      <polygon key={i} points={starPts(50, 50, 49 * (1 - i * step))} fill={c} />
    ))}
  </svg>
);

/**
 * 五属性字形（p5-statistics 稿「属性分布」行首黑磁贴里的白色图标）。
 * 纯路径单色——不引 emoji，保住红/黑/纸三色律。
 */
export const P5AttrGlyph = ({ id, size = 18, color = P5R.white, className, style }: {
  id: 'knowledge' | 'guts' | 'dexterity' | 'kindness' | 'charm';
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} style={style} aria-hidden>
    {id === 'knowledge' && (
      // 摊开的书：左右两页各一块梯形
      <path d="M2 5 L11 7.1 V20 L2 17.9 Z M13 7.1 L22 5 V17.9 L13 20 Z" fill={color} />
    )}
    {id === 'guts' && (
      // 哑铃：两端配重 + 中杆
      <path d="M2 8.6 h3.2 v6.8 H2 Z M6.2 10 h2.4 v4 H6.2 Z M8.8 10.8 h6.4 v2.4 H8.8 Z M15.4 10 h2.4 v4 h-2.4 Z M18.8 8.6 H22 v6.8 h-3.2 Z" fill={color} />
    )}
    {id === 'dexterity' && (
      // 靶心：外环 + 靶点
      <>
        <circle cx="12" cy="12" r="9.4" fill="none" stroke={color} strokeWidth="2.6" />
        <circle cx="12" cy="12" r="3.6" fill={color} />
      </>
    )}
    {id === 'kindness' && (
      // 三瓣嫩芽
      <path d="M12 3.2 C14.6 7 14.6 10.4 12 13.4 C9.4 10.4 9.4 7 12 3.2 Z M4 8.6 C8.2 9 10.6 11 11.4 14.6 C7.4 14.6 4.8 12.6 4 8.6 Z M20 8.6 C19.2 12.6 16.6 14.6 12.6 14.6 C13.4 11 15.8 9 20 8.6 Z M11 15.6 h2 V21 h-2 Z" fill={color} />
    )}
    {id === 'charm' && (
      // 假面：眼孔用 evenodd 掏空
      <path
        fillRule="evenodd"
        d="M2.4 8 C7 5.9 17 5.9 21.6 8 C21.6 14 18 17 14.6 14.9 C13.1 14 10.9 14 9.4 14.9 C6 17 2.4 14 2.4 8 Z
           M5 10.6 a2.3 1.8 0 1 0 4.6 0 a2.3 1.8 0 1 0 -4.6 0 Z
           M14.4 10.6 a2.3 1.8 0 1 0 4.6 0 a2.3 1.8 0 1 0 -4.6 0 Z"
        fill={color}
      />
    )}
  </svg>
);

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

/**
 * P5CollageTitle —— 由一串中文自动生成剪报瓷砖标题（全站表单/弹窗顶部统一制式）。
 *
 * 配色循环照 p5-modal-03「记录一件事」采样：
 *   纸底红字 → 纸底黑字 → 红底白字 → 黑底白字 → 灰底黑字，之后重复。
 * 尾部缀一颗红星（稿上「添加任务 ☆」「记录一件事 ★」同款）。标点不占瓷砖，直接排黑字。
 */
const TITLE_CYCLE: Array<{ bg: string; fg: string }> = [
  { bg: P5R.paper, fg: P5R.red },
  { bg: P5R.paper, fg: P5R.ink },
  { bg: P5R.red, fg: P5R.white },
  { bg: P5R.ink, fg: P5R.white },
  { bg: P5R.greyLight, fg: P5R.ink },
];
const TITLE_ROT = [-3.5, 2.4, -2, 3, -2.8, 1.8, -3.2, 2.6];
const TITLE_DY = [0, 6, 2, 7, 3, 5, 1, 6];

export const P5CollageTitle = ({ text, size = 30, star = true, className }: {
  text: string;
  size?: number;
  star?: boolean;
  className?: string;
}) => {
  const anim = useBoldness();
  const chars = Array.from(text.trim());
  let tileIdx = 0;
  return (
    <span className={`flex flex-wrap items-start gap-[3px] ${className ?? ''}`} aria-hidden>
      {chars.map((ch, i) => {
        // 标点/空格不做瓷砖（做出来像掉字），直接以黑字排在基线上。
        // 例外：！？ 在稿上（成就解锁！/ 恭喜升级！）是实打实的一块瓷砖，不能落成裸字
        if (/[\s·、，。：；（）()「」【】…—-]/.test(ch)) {
          return (
            <span key={i} className="inline-block font-black" style={{ fontSize: size * 0.9, lineHeight: 1.2, marginTop: 6, color: P5R.ink, fontFamily: P5_FONT }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          );
        }
        const c = TITLE_CYCLE[tileIdx % TITLE_CYCLE.length];
        const rot = TITLE_ROT[tileIdx % TITLE_ROT.length];
        const dy = TITLE_DY[tileIdx % TITLE_DY.length];
        tileIdx += 1;
        return (
          <motion.span
            key={i}
            className="inline-flex shrink-0 select-none items-center justify-center font-black"
            initial={anim ? { scale: 1.5, opacity: 0, rotate: rot * 3 } : false}
            animate={{ scale: 1, opacity: 1, rotate: rot }}
            transition={{ type: 'spring', stiffness: 520, damping: 26, delay: i * 0.045 }}
            style={{
              width: size * 1.2,
              height: size * 1.2,
              marginTop: dy,
              fontSize: size,
              lineHeight: 1,
              fontFamily: P5_FONT,
              background: c.bg,
              color: c.fg,
              border: `2.5px solid ${P5R.ink}`,
              boxShadow: `0 0 0 2.5px ${P5R.paper}, 4px 5px 0 ${P5R.ink}`,
            }}
          >
            {ch}
          </motion.span>
        );
      })}
      {star && (
        <motion.span
          className="ml-1 shrink-0"
          style={{ marginTop: size * 0.18 }}
          initial={anim ? { scale: 0, rotate: -40 } : false}
          animate={{ scale: 1, rotate: -10 }}
          transition={{ type: 'spring', stiffness: 480, damping: 20, delay: chars.length * 0.045 }}
        >
          <P5Star size={size * 0.62} fill={P5R.red} ring2={P5R.paper} />
        </motion.span>
      )}
    </span>
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
export const P5Wedge = ({ children, star = true, starSide = 'right', tone = 'ink', rot = -1.2, keyline = true, className, style }: {
  children: ReactNode;
  star?: boolean;
  /** 星在文字左还是右（p5-statistics 的节标是「★ 成长轨迹」，星在左） */
  starSide?: 'left' | 'right';
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
  const starEl = star ? <P5Star size={15} fill={fg} className="shrink-0" /> : null;
  return (
    <div className={`relative inline-block ${className ?? ''}`} style={{ transform: `rotate(${rot}deg)`, ...style }}>
      {keyline && (
        <span aria-hidden className="absolute -inset-[2.5px]" style={{ background: tone === 'paper' ? P5R.ink : P5R.paper, clipPath: wedge }} />
      )}
      <span className="relative flex items-center gap-2 py-1.5 pl-4 pr-8" style={{ background: bg, clipPath: wedge }}>
        {starSide === 'left' && starEl}
        <span className="text-[19px] font-black leading-none tracking-wide" style={{ color: fg, fontFamily: P5_FONT }}>{children}</span>
        {starSide === 'right' && starEl}
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
