/**
 * boardKit — F3 讨论板（蓝 / 粉 / 自定义主题）频道的共享 Y2K BBS 原语。
 *
 * 玄关（AntechamberBoard）与正文（短路决策板 / 限时置顶帖 / 完成结帖 / 收藏板抽屉）共用一套：
 * 等宽字、老式窗口（斜角凸边框 + 蓝标题栏 + `_□✕` 假窗钮）、斜角凸边按钮、CRT 扫描线、楼层帖。
 *
 * 配色策略：窗体固定深底 PANEL，正文用固定浅墨 INK/INK_DIM（不靠 var(--color-primary) 当文字色），
 * primary 仅作标题栏底 / 边框 / 强调——这样自定义主题取任意（含近黑）primary 时正文仍可读。
 */
import type { CSSProperties, ReactNode } from 'react';

export const MONO = "'JetBrains Mono','Cascadia Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
export const PANEL = '#0a1019';
export const INK = '#bcd6f5';
export const INK_DIM = '#8fb3dd';

/** CRT 扫描线叠层 */
export const Scanlines = ({ className, opacity = 1 }: { className?: string; opacity?: number }) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute inset-0 ${className ?? ''}`}
    style={{ opacity, backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px)' }}
  />
);

/** 老式窗口：斜角凸边框 + 蓝标题栏（假窗钮，✕ 可点关闭）+ 深底窗体 */
export const BevelWindow = ({
  title,
  children,
  onClose,
  className,
  bodyClass,
  bodyStyle,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  bodyClass?: string;
  bodyStyle?: CSSProperties;
}) => (
  <div
    className={`relative ${className ?? ''}`}
    style={{
      fontFamily: MONO,
      border: '2px solid',
      borderColor: 'color-mix(in srgb, var(--color-primary) 70%, #fff) var(--color-primary) var(--color-primary) color-mix(in srgb, var(--color-primary) 70%, #fff)',
      boxShadow: '0 0 0 1px #000, 5px 6px 0 rgba(0,0,0,0.5)',
    }}
  >
    <div className="flex items-center justify-between px-2 py-1 text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>
      <span className="min-w-0 truncate tracking-wide">{title}</span>
      <span className="ml-2 flex shrink-0 items-center gap-1 text-white/90">
        <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none">_</span>
        <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none">□</span>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="关闭" className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none hover:bg-white/20">✕</button>
        ) : (
          <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none">✕</span>
        )}
      </span>
    </div>
    <div className={bodyClass ?? 'px-3 py-3'} style={{ background: PANEL, color: INK, ...bodyStyle }}>
      {children}
    </div>
  </div>
);

/** 斜角凸边按钮：primary=米色主操作（深字）/ 否则蓝描边次操作 */
export const BevelButton = ({
  children,
  onClick,
  disabled,
  primary,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
  ariaLabel?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    style={{
      fontFamily: MONO,
      border: '2px solid',
      ...(primary
        ? { background: 'color-mix(in srgb, var(--color-primary) 28%, #e8eef7)', borderColor: '#fff var(--color-primary) var(--color-primary) #fff', boxShadow: '2px 2px 0 #000' }
        : { background: 'transparent', borderColor: 'color-mix(in srgb, var(--color-primary) 50%, #fff)' }),
    }}
    className={`px-4 py-1.5 text-sm font-bold tracking-wider transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${primary ? 'text-[#0a1019]' : 'bk-fg hover:bg-primary/10'} ${className ?? ''}`}
  >
    {children}
  </button>
);

/** 楼层帖：`#01 匿名 » …` */
export const FloorPost = ({ index, author = '匿名', children, className }: { index: number; author?: string; children: ReactNode; className?: string }) => (
  <div className={`truncate text-[12px] ${className ?? ''}`} style={{ color: INK_DIM }}>
    <span className="bk-fg">#{String(index).padStart(2, '0')}</span> {author} » {children}
  </div>
);
