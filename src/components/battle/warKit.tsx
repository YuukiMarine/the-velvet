/**
 * 逆影战场 · 视觉套件（批2c 质感升级骨架）
 *
 * 方向拍板（2026-07-17 全案采纳）：
 *  ① 斜切语言替代圆角  ② 大字号数字排版  ③ 幽灵字层  ⑪ 噪点纹理 + 几何图标替代 emoji
 * 战斗/塔内深色域专用（与 p3r/kit 的亮蓝页面语言分工：这里是"影时间内部"的暗面语言）。
 */
import { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';

// ── 斜切基元 ────────────────────────────────────────────────
/** 平行四边形斜切（左上/右下切角），px 为水平切入量 */
export const slantPoly = (px = 8) => `polygon(${px}px 0, 100% 0, calc(100% - ${px}px) 100%, 0 100%)`;
/** 右向箭头式斜切（右侧切角更深） */
export const slantEdge = (px = 10) => `polygon(0 0, 100% 0, calc(100% - ${px}px) 100%, 0 100%)`;

/** 区层色温（⑩）：等级 → 主色/辅色/背景端色 */
export const STRATUM_PALETTE: Record<number, { accent: string; accentRgb: string; deep: string; mist: string }> = {
  1: { accent: '#9fc0ff', accentRgb: '159,192,255', deep: '#0a1030', mist: 'rgba(159,192,255,0.08)' },
  2: { accent: '#35d1e8', accentRgb: '53,209,232', deep: '#071426', mist: 'rgba(53,209,232,0.08)' },
  3: { accent: '#7d8cff', accentRgb: '125,140,255', deep: '#0c0b2e', mist: 'rgba(125,140,255,0.09)' },
  4: { accent: '#b06cff', accentRgb: '176,108,255', deep: '#150a30', mist: 'rgba(176,108,255,0.09)' },
  5: { accent: '#ff5c7a', accentRgb: '255,92,122', deep: '#1c0716', mist: 'rgba(255,92,122,0.08)' },
};
export const paletteFor = (level: number) => STRATUM_PALETTE[Math.min(5, Math.max(1, level))];

// ── 噪点/半调纹理层（⑪）：去"数码平涂"味 ────────────────────
export function NoiseLayer({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity,
        backgroundImage: [
          'repeating-linear-gradient(0deg, rgba(255,255,255,0.7) 0px, transparent 1px, transparent 3px)',
          'repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0px, transparent 1px, transparent 5px)',
          'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.5) 0.5px, transparent 1px)',
        ].join(','),
        backgroundSize: 'auto, auto, 7px 7px',
        mixBlendMode: 'overlay',
      }}
    />
  );
}

// ── 幽灵字层（③） ──────────────────────────────────────────
export function WarGhost({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className={`absolute select-none pointer-events-none font-black leading-none ${className ?? ''}`}
      style={{
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        letterSpacing: '0.06em',
        color: 'rgba(255,255,255,0.045)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {text}
    </span>
  );
}

// ── 斜切分段量表（⑤ HP/失衡通用基元） ───────────────────────
interface SlantGaugeProps {
  value: number;
  max: number;
  segments?: number;
  height?: number;
  onColor: string;
  offColor?: string;
  glow?: string;
  /** 分段间隙 */
  gap?: number;
}

export function SlantGauge({ value, max, segments = 12, height = 10, onColor, offColor = 'rgba(255,255,255,0.09)', glow, gap = 2 }: SlantGaugeProps) {
  const litExact = Math.max(0, Math.min(segments, (value / Math.max(1, max)) * segments));
  const lit = Math.ceil(litExact);
  return (
    <div className="flex w-full" style={{ gap }}>
      {Array.from({ length: segments }, (_, i) => {
        const on = i < lit;
        const partial = i === lit - 1 && litExact % 1 !== 0;
        return (
          <motion.span
            key={i}
            layout
            className="flex-1"
            animate={{ opacity: on ? (partial ? 0.75 : 1) : 1 }}
            style={{
              height,
              clipPath: slantPoly(Math.min(5, height * 0.45)),
              background: on ? onColor : offColor,
              boxShadow: on && glow ? `0 0 6px ${glow}` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

// ── 失衡水条（⑤）：表面张力水面，满时溢光 ────────────────────
export function WaterGauge({ value, max, height = 7, full }: { value: number; max: number; height?: number; full?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height, clipPath: slantPoly(height * 0.6), background: 'rgba(255,255,255,0.07)' }}
    >
      <motion.div
        className="absolute inset-y-0 left-0"
        animate={{
          width: `${pct}%`,
          backgroundPositionX: ['0%', '200%'],
          boxShadow: full ? ['0 0 6px rgba(53,209,232,0.5)', '0 0 16px rgba(250,204,21,0.9)', '0 0 6px rgba(53,209,232,0.5)'] : undefined,
        }}
        transition={{
          width: { duration: 0.35 },
          backgroundPositionX: { duration: 2.2, repeat: Infinity, ease: 'linear' },
          boxShadow: full ? { duration: 0.8, repeat: Infinity } : undefined,
        }}
        style={{
          background: full
            ? 'linear-gradient(90deg, #f59e0b, #fde047, #35d1e8, #fde047)'
            : 'linear-gradient(90deg, #1b57ff, #35d1e8, #7fd8ee, #35d1e8)',
          backgroundSize: '200% 100%',
        }}
      />
      {/* 水面高光线 */}
      <motion.div
        className="absolute top-0 bottom-0 w-6 pointer-events-none"
        animate={{ left: ['-10%', '104%'] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)', mixBlendMode: 'screen' }}
      />
    </div>
  );
}

// ── 几何图标集（⑪ 替代 emoji；stroke 风格，继承 currentColor） ──
interface IconProps { size?: number; className?: string }
const svgBase = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

/** Shadow（小怪）：短剑 */
export function IconSword({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M4 20 L15 9" />
      <path d="M13 4 L20 11 L15 9 L13 4 Z" fill="currentColor" stroke="none" />
      <path d="M6 15 L9 18" />
    </svg>
  );
}
/** 强敌：双角轮廓 */
export function IconElite({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M5 10 L3 4 L8 7" />
      <path d="M19 10 L21 4 L16 7" />
      <path d="M6 12 a6 6 0 0 1 12 0 v5 l-3 3 h-6 l-3 -3 Z" />
      <path d="M9.5 14 h.01 M14.5 14 h.01" strokeWidth="2.6" />
    </svg>
  );
}
/** 心魔：竖目 */
export function IconEvilEye({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M12 3 C17 8 18 10 18 12 C18 14 17 16 12 21 C7 16 6 14 6 12 C6 10 7 8 12 3 Z" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
/** 异变（事件）：斜置菱形问号 */
export function IconRift({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M12 2 L22 12 L12 22 L2 12 Z" />
      <path d="M9.6 9 a2.5 2.5 0 1 1 3.4 3.1 c-.8.4-1 .9-1 1.9" />
      <path d="M12 17 h.01" strokeWidth="2.6" />
    </svg>
  );
}
/** 回响：残月 */
export function IconCrescent({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M19 14 A8 8 0 1 1 10 5 A6.5 6.5 0 0 0 19 14 Z" />
    </svg>
  );
}
/** 月匣：斜盖宝箱 */
export function IconCase({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M4 10 L6 6 H18 L20 10 V19 H4 Z" />
      <path d="M4 10 H20" />
      <path d="M11 13 h2 v3 h-2 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
/** 面具 */
export function IconMask({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M4 8 C4 5 8 4 12 4 C16 4 20 5 20 8 C20 14 16 20 12 20 C8 20 4 14 4 8 Z" />
      <path d="M8 10.5 L10.5 11.5 M16 10.5 L13.5 11.5" />
    </svg>
  );
}
/** 盾（防御） */
export function IconGuard({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M12 3 L20 6 V11 C20 16 16.5 19.5 12 21 C7.5 19.5 4 16 4 11 V6 Z" />
    </svg>
  );
}
/** 洞察（目） */
export function IconInsight({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M2 12 C5 6.5 9 4.5 12 4.5 C15 4.5 19 6.5 22 12 C19 17.5 15 19.5 12 19.5 C9 19.5 5 17.5 2 12 Z" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
/** 人物剪影（⑨ 当前位置标记） */
export function IconFigure({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor" stroke="none">
      <circle cx="12" cy="5.4" r="3" />
      <path d="M7.5 22 C7.5 15 9 10.5 12 10.5 C15 10.5 16.5 15 16.5 22 L13.8 22 L13.2 15.5 L10.8 15.5 L10.2 22 Z" />
    </svg>
  );
}
/** 塔（潜入/区层标识） */
export function IconTower({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M9 21 V8 L12 3 L15 8 V21" />
      <path d="M6 21 H18" />
      <path d="M9 12 H15 M9 16 H15" />
    </svg>
  );
}

/** 节点类型 → 几何图标 */
export function NodeGlyph({ type, size = 15, className }: { type: 'mob' | 'elite' | 'event' | 'echo' | 'chest' | 'boss'; size?: number; className?: string }) {
  switch (type) {
    case 'mob': return <IconSword size={size} className={className} />;
    case 'elite': return <IconElite size={size} className={className} />;
    case 'event': return <IconRift size={size} className={className} />;
    case 'echo': return <IconCrescent size={size} className={className} />;
    case 'chest': return <IconCase size={size} className={className} />;
    case 'boss': return <IconEvilEye size={size} className={className} />;
  }
}

/** 暴击/1More：闪电 */
export function IconBolt({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor" stroke="none">
      <path d="M13 2 L5 13.5 H10.5 L9 22 L19 9.5 H12.8 Z" />
    </svg>
  );
}
/** 蓄力：聚能环 */
export function IconOrb({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22 M4.9 4.9 L7 7 M19.1 4.9 L17 7 M4.9 19.1 L7 17 M19.1 19.1 L17 17" />
    </svg>
  );
}
/** 回复：水滴 */
export function IconDrop({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M12 3 C16 8.5 18 11.5 18 14.5 A6 6 0 0 1 6 14.5 C6 11.5 8 8.5 12 3 Z" />
      <path d="M10 14 H14 M12 12 V16" strokeWidth="1.6" />
    </svg>
  );
}
/** 增益：上双箭头 */
export function IconUp({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M5 12.5 L12 6 L19 12.5" />
      <path d="M5 18.5 L12 12 L19 18.5" />
    </svg>
  );
}
/** 减益：下双箭头 */
export function IconDown({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M5 5.5 L12 12 L19 5.5" />
      <path d="M5 11.5 L12 18 L19 11.5" />
    </svg>
  );
}
/** 攻击增益：燃焰 */
export function IconFlame({ size = 15, className }: IconProps) {
  return (
    <svg {...svgBase(size)} className={className} aria-hidden>
      <path d="M12 3 C14.5 6.5 17 9 17 13 A5 5 0 0 1 7 13 C7 10.5 8.5 8.5 9.5 7 C9.8 9 10.6 10 12 10.5 C11.4 8 11.4 5.5 12 3 Z" />
    </svg>
  );
}

/** 技能类型 → 几何图标 */
export function SkillGlyph({ type, size = 14, className }: { type: string; size?: number; className?: string }) {
  switch (type) {
    case 'damage': return <IconSword size={size} className={className} />;
    case 'crit': return <IconBolt size={size} className={className} />;
    case 'buff': return <IconUp size={size} className={className} />;
    case 'debuff': return <IconDown size={size} className={className} />;
    case 'charge': return <IconOrb size={size} className={className} />;
    case 'heal': return <IconDrop size={size} className={className} />;
    case 'attack_boost': return <IconFlame size={size} className={className} />;
    default: return <IconSword size={size} className={className} />;
  }
}

// ── 斜切描边卡（①）：clipPath 会切掉 border，用双层法造 1px 轮廓 ──
interface SlantCardProps {
  cut?: number;
  /** 轮廓色（外层） */
  edge: string;
  /** 面色（内层） */
  face: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  as?: 'div' | 'button';
}

export function SlantCard({ cut = 10, edge, face, className, style, children, onClick, disabled, as = 'div' }: SlantCardProps) {
  const Outer: 'div' | 'button' = as;
  return (
    <Outer
      onClick={onClick}
      disabled={as === 'button' ? disabled : undefined}
      className={`relative block w-full text-left p-[1px] transition-all ${disabled ? 'opacity-50' : ''} ${className ?? ''}`}
      style={{ clipPath: slantPoly(cut), background: edge, ...style }}
    >
      <div className="relative h-full w-full" style={{ clipPath: slantPoly(cut), background: face }}>
        {children}
      </div>
    </Outer>
  );
}

// ── 大数字排版基元（②） ────────────────────────────────────
export function StatBig({ value, label, color = '#fff', align = 'right' }: { value: ReactNode; label: string; color?: string; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <span
        className="block font-black tabular-nums leading-none"
        style={{ fontSize: 22, color, letterSpacing: '-0.02em' }}
      >
        {value}
      </span>
      <span className="block text-[9px] font-bold uppercase tracking-[0.18em] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
        {label}
      </span>
    </div>
  );
}
