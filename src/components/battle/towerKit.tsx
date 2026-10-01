/**
 * 塔屏（第 9 轮 9a · PRD §14.7）的界面零件：频道配色、资源条、小签、频道装饰层。
 *
 * 配色口径（用户拍板）：底色保持「影时间」的暗色（区层色温照旧），强调色跟着频道走——
 *   蓝 = 青蓝 + 洋红点缀（斜切）；黄 = 明黄 + 橙（圆角 + 黑描边）；红 = 正红 + 白（不规则四边）；中性 = 紫（圆角）。
 *   「选中 / 当前 / 走过的路」用 sel：多数频道就是强调色；红频道用纸白，红色留给危险和心魔，免得撞色。
 * 自己的 HP 统一青绿、SP 统一金色（四个频道一样，只认颜色就知道是谁的）。
 * 动画的关键帧在 index.css（tw-*）：元素挂 tw-anim；粗犷度关掉时外层挂 tw-still 全停，被战斗盖住时挂 tw-paused 定格。
 */
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import type { UIChannel } from '@/ui/channel';

export interface TowerSkin {
  ch: UIChannel;
  accent: string;
  accentRgb: string;
  /** 强调色上的字 */
  onAccent: string;
  /** 选中 / 当前 / 走过的路 */
  sel: string;
  selRgb: string;
  onSel: string;
  /** 点缀（蓝频道的洋红） */
  hot: string;
  /** 卡片外形：斜切 / 不规则（圆角时返回 undefined，用 radius） */
  shape: (seed: number, cut?: number) => string | undefined;
  radius: number;
  titleFont: string;
}

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
export const twSlant = (cut = 10) => `polygon(${cut}px 0, 100% 0, calc(100% - ${cut}px) 100%, 0 100%)`;
export const twRough = (seed: number, jag = 5): string => {
  const r = mulberry(seed);
  const j = () => (r() * jag).toFixed(1);
  return `polygon(${j()}px ${j()}px, calc(100% - ${j()}px) ${j()}px, calc(100% - ${j()}px) calc(100% - ${j()}px), ${j()}px calc(100% - ${j()}px))`;
};

const TITLE_BLACK = '"Noto Sans SC Black", "Velvet Sans SC", sans-serif';

export const TOWER_SKINS: Record<UIChannel, TowerSkin> = {
  p3: {
    ch: 'p3', accent: '#35d1e8', accentRgb: '53,209,232', onAccent: '#04131f', sel: '#35d1e8', selRgb: '53,209,232', onSel: '#04131f', hot: '#f0417f',
    shape: (_s, cut = 10) => twSlant(cut), radius: 0, titleFont: TITLE_BLACK,
  },
  p4: {
    ch: 'p4', accent: '#ffd400', accentRgb: '255,212,0', onAccent: '#131313', sel: '#ffd400', selRgb: '255,212,0', onSel: '#131313', hot: '#f9a11b',
    shape: () => undefined, radius: 12, titleFont: 'var(--p4-display-font, "Noto Serif SC", serif)',
  },
  p5: {
    ch: 'p5', accent: '#ff1f2d', accentRgb: '255,31,45', onAccent: '#ffffff', sel: '#f8f8f6', selRgb: '248,248,246', onSel: '#000000', hot: '#000000',
    shape: (s, cut = 5) => twRough(s, cut), radius: 0, titleFont: TITLE_BLACK,
  },
  neutral: {
    ch: 'neutral', accent: '#a78bfa', accentRgb: '167,139,250', onAccent: '#ffffff', sel: '#a78bfa', selRgb: '167,139,250', onSel: '#ffffff', hot: '#f472b6',
    shape: () => undefined, radius: 14, titleFont: 'inherit',
  },
};

export const TW_HP = { c: '#2dd4bf', rgb: '45,212,191' };
export const TW_SP = { c: '#fbbf24', rgb: '251,191,36' };

/** 按频道的外形：斜切 / 不规则 / 圆角 */
export const twShape = (skin: TowerSkin, seed: number, cut = 8, round = 12): CSSProperties =>
  skin.ch === 'p3' ? { clipPath: twSlant(cut) } : skin.ch === 'p5' ? { clipPath: skin.shape(seed, Math.min(5, cut / 2)) } : { borderRadius: skin.ch === 'p4' ? Math.min(round, 12) : round };

/**
 * 资源条：标签 + 数字写在条外（读数清楚），条本身分段斜切。
 * max 不传 = 没有上限的数（SP）：只写数字，条按 scale 封顶显示。
 */
export function TowerBar({ label, value, max, scale, color, rgb, segments = 0, height = 8 }: {
  label: string; value: number; max?: number; scale?: number; color: string; rgb: string; segments?: number; height?: number;
}) {
  const full = max ?? scale ?? 1;
  const pct = Math.max(0, Math.min(1, value / Math.max(1, full)));
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 leading-none">
        <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: `rgba(${rgb},0.75)` }}>{label}</span>
        <span className="tabular-nums" style={{ color }}>
          <span className="text-[15px] font-black">{value}</span>
          {max !== undefined && <span className="text-[11px] font-bold opacity-60"> / {max}</span>}
        </span>
      </div>
      <div className="relative overflow-hidden" style={{ height, background: 'rgba(255,255,255,0.08)', clipPath: twSlant(Math.min(6, height)) }}>
        <motion.div
          className="absolute inset-y-0 left-0"
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{ background: `linear-gradient(90deg, rgba(${rgb},0.75), ${color})`, boxShadow: `0 0 10px rgba(${rgb},0.55)` }}
        />
        {segments > 1 && (
          <div aria-hidden className="absolute inset-0 flex">
            {Array.from({ length: segments - 1 }, (_, i) => (
              <span key={i} className="h-full" style={{ marginLeft: `${100 / segments}%`, width: 2, background: 'rgba(5,4,20,0.85)', transform: 'skewX(-20deg)' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 频道外形的小签 */
export function TowerChip({ skin, children, tone = 'soft', seed = 1, className, style, onClick, ariaLabel }: {
  skin: TowerSkin; children: ReactNode; tone?: 'soft' | 'solid' | 'danger' | 'gold' | 'line'; seed?: number; className?: string; style?: CSSProperties;
  onClick?: () => void; ariaLabel?: string;
}) {
  const bg = tone === 'solid' ? skin.accent
    : tone === 'danger' ? 'rgba(239,68,68,0.18)'
      : tone === 'gold' ? 'rgba(251,191,36,0.16)'
        : tone === 'line' ? 'transparent'
          : `rgba(${skin.accentRgb},0.16)`;
  const color = tone === 'solid' ? skin.onAccent : tone === 'danger' ? '#fca5a5' : tone === 'gold' ? '#fde68a' : tone === 'line' ? 'rgba(255,255,255,0.8)' : skin.ch === 'p5' ? '#ffd5d8' : skin.accent;
  const ring = tone === 'danger' ? 'rgba(239,68,68,0.5)' : tone === 'gold' ? 'rgba(251,191,36,0.45)' : tone === 'line' ? 'rgba(255,255,255,0.3)' : tone === 'solid' ? 'transparent' : `rgba(${skin.accentRgb},0.45)`;
  const cls = `inline-flex items-center gap-1 whitespace-nowrap px-2 py-[3px] text-[10px] font-black leading-none ${className ?? ''}`;
  const st: CSSProperties = {
    background: bg, color,
    boxShadow: skin.ch === 'p4' ? `0 0 0 1.5px ${tone === 'solid' ? '#131313' : ring}` : `inset 0 0 0 1px ${ring}`,
    clipPath: skin.ch === 'p3' ? twSlant(4) : skin.ch === 'p5' ? twRough(seed + 2.3, 1.6) : undefined,
    borderRadius: skin.ch === 'p4' || skin.ch === 'neutral' ? 999 : 0,
    ...style,
  };
  if (onClick) return <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={onClick} aria-label={ariaLabel} className={cls} style={st}>{children}</motion.button>;
  return <span className={cls} style={st} aria-label={ariaLabel}>{children}</span>;
}

/** 每个频道压在暗底上的那一层装饰：蓝 = 斜光带；黄 = 扫描线 + 斜纹；红 = 碎片 + 网点；中性 = 柔光 */
export function TowerDeco({ skin }: { skin: TowerSkin }) {
  if (skin.ch === 'p3') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-[12%] h-[38%] w-[150%] -rotate-[24deg]" style={{ background: 'linear-gradient(90deg, transparent, rgba(53,209,232,0.07), transparent)' }} />
        <div className="absolute -left-10 top-[58%] h-[16%] w-[140%] -rotate-[24deg]" style={{ background: 'linear-gradient(90deg, transparent, rgba(27,87,255,0.12), transparent)' }} />
      </div>
    );
  }
  if (skin.ch === 'p4') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(0deg, rgba(255,212,0,0.035) 0 1px, transparent 1px 4px)' }} />
        <div className="absolute -right-10 top-0 h-full w-24 rotate-[8deg]" style={{ background: 'repeating-linear-gradient(135deg, rgba(255,212,0,0.09) 0 10px, transparent 10px 22px)' }} />
      </div>
    );
  }
  if (skin.ch === 'p5') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 -top-10 h-56 w-56" style={{ background: 'rgba(255,31,45,0.16)', clipPath: 'polygon(0 0, 100% 12%, 62% 100%, 8% 70%)' }} />
        <div className="absolute -bottom-12 -right-10 h-64 w-60" style={{ background: 'rgba(255,31,45,0.12)', clipPath: 'polygon(30% 0, 100% 20%, 90% 100%, 0 76%)' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1.4px)', backgroundSize: '9px 9px' }} />
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-20 top-[20%] h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(167,139,250,0.12)' }} />
      <div className="absolute -right-24 bottom-[10%] h-72 w-72 rounded-full blur-3xl" style={{ background: 'rgba(124,58,237,0.14)' }} />
    </div>
  );
}
