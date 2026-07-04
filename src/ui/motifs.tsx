/**
 * 频道 motif 图案库（PERSONA_UI_REWRITE_GUIDE §6）——全站通用装饰原语。
 *
 * 从 F3 四 kit 提炼泛化（thiefKit.Halftone / boardKit.Scanlines / p3Kit.P3GhostWord 等），
 * kit 本体保留供 F3 专用；这里是参数化的全站版本。
 *
 * 铁律（guide §22.3）：全部 aria-hidden + pointer-events-none，装饰不承担交互与语义数据；
 * 语义由使用处赋予（斜切红条=选中、彩条=分类、点阵=版画噪点……见 guide §3.4）。
 */
import type { CSSProperties, ReactNode } from 'react';

/** 半调网点：P5 强情绪 / P4 电视印刷 / P3 版画噪点（guide §6 各频道通用，颜色可配） */
export const Halftone = ({ className, style, dot = 1.3, gap = 8, color = 'rgba(0,0,0,0.45)' }: {
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

/** CRT/版画扫描线：dark=暗线压在亮底（P4 CRT），否则亮线浮在深底（P3/BBS） */
export const Scanlines = ({ className, style, opacity = 1, dark = false }: {
  className?: string; style?: CSSProperties; opacity?: number; dark?: boolean;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute inset-0 ${className ?? ''}`}
    style={{
      opacity,
      backgroundImage: dark
        ? 'repeating-linear-gradient(0deg, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 1px, transparent 1px, transparent 3px)'
        : 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px)',
      ...style,
    }}
  />
);

/** P4 彩色信号条带（guide §6.2）：垂直=左缘频道条，水平=分组标识 */
export const SignalStripes = ({ className, style, vertical = true }: {
  className?: string; style?: CSSProperties; vertical?: boolean;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none ${className ?? ''}`}
    style={{
      background: `linear-gradient(${vertical ? '180deg' : '90deg'},
        #d71920 0 20%, #ffe100 20% 40%, #ff6a00 40% 60%, #20bff2 60% 80%, #0057ff 80% 100%)`,
      ...style,
    }}
  />
);

/** P4 同心圆环（guide §6.2）：节目聚焦 / 当日主题背景 */
export const SunRing = ({ className, style, color = 'rgba(255,185,0,0.85)' }: {
  className?: string; style?: CSSProperties; color?: string;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none ${className ?? ''}`}
    style={{
      background: `
        radial-gradient(circle, transparent 0 26%, ${color} 27% 29%, transparent 30%),
        radial-gradient(circle, transparent 0 38%, rgba(255,255,255,0.25) 39% 41%, transparent 42%),
        radial-gradient(circle, transparent 0 50%, ${color} 51% 52.5%, transparent 53.5%)`,
      ...style,
    }}
  />
);

/** 巨型幽灵字背景（P3 竖排/横排大字骨架；P5 COMMAND 压底字同源）。
 *  移动端透明度控制在 8%~16%（guide §18.1），由调用方 className 定。 */
export const BigTypeBackdrop = ({ word, className, style, vertical = false }: {
  word: string; className?: string; style?: CSSProperties; vertical?: boolean;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none select-none whitespace-nowrap font-black italic leading-none tracking-tight ${className ?? ''}`}
    style={{
      fontFamily: 'Impact, "Arial Black", "Arial Narrow", sans-serif',
      writingMode: vertical ? 'vertical-rl' : undefined,
      ...style,
    }}
  >
    {word}
  </div>
);

/** 斜切面板：--ui-cut-md 裁切 + --ui-surface 底 + --ui-shadow-hard 硬影。
 *  频道无关（token 驱动）：neutral 下 cut=none、radius 圆角，自动退化为普通卡。
 *  注意：clip-path 会裁掉 box-shadow，硬影用外层 drop-shadow 承载。 */
export const SlashPanel = ({ children, className, style, cut, tone = 'surface' }: {
  children: ReactNode; className?: string; style?: CSSProperties;
  /** 覆盖裁切形状；缺省用频道 token --ui-cut-md */
  cut?: string;
  /** surface=深面板（深字白底频道自动对应），paper=纸面 */
  tone?: 'surface' | 'paper';
}) => (
  <div className={className} style={{ filter: 'drop-shadow(var(--ui-shadow-hard))', ...style }}>
    <div
      style={{
        clipPath: cut ?? 'var(--ui-cut-md)',
        borderRadius: 'var(--ui-radius)',
        background: tone === 'paper' ? 'var(--ui-paper)' : 'var(--ui-surface)',
        color: tone === 'paper' ? '#111' : 'var(--ui-surface-ink)',
      }}
    >
      {children}
    </div>
  </div>
);
