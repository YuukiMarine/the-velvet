/**
 * p3rKit —— P3R「白日水面」全站视觉底座（p3-redraw/ 设计稿 1:1 复刻用）。
 *
 * 语言要素（对照 p3-component-kit-reference-v2.png）：
 *   - 底：近白水面（浅青白 + 水波 caustic 纹理，素材复用 terminal/p3-water.png）；
 *   - 形：一切容器/按钮/徽章都是「左上→右下」斜边的平行四边形（clip-path）；
 *   - 色：亮蓝 #1b57ff（CTA/选中/数字）· 深蓝墨 #0a1230（标题正文）·
 *         浅青面 #cfeaf6 / 亮青 #35d1e8（辅助/进度）· 洋红 #f0417f（危险/句点）；
 *   - 字：超大黑斜体标题（font-black italic 紧字距）+ 蓝色功能小字；
 *   - 背景幽灵大字：极浅蓝斜体英文词（MIDNIGHT / ACTION / PLAN / LOG…）。
 *
 * 仅在 channel==='p3'（蓝主题）挂载的页面变体中使用；铁律照旧：
 * 装饰 aria-hidden、命中区完整矩形、正文恒水平（斜的只有容器与装饰）。
 */
import type { CSSProperties, ReactNode } from 'react';

export const P3R = {
  blue: '#1b57ff',
  blueDeep: '#0a3bd6',
  ink: '#0a1230',
  inkSoft: '#3d4a66',
  grey: '#8a97ad',
  cyan: '#35d1e8',
  cyanPale: '#cfeaf6',
  cyanFaint: '#e2f2fa',
  magenta: '#f0417f',
  bg: '#eef5f9',
  panel: '#ffffff',
} as const;

/** 平行四边形 clip（dir: 左上→右下 = 'lead'；右上→左下 = 'tail'） */
export const slantClip = (cut = 7, dir: 'lead' | 'tail' = 'lead') =>
  dir === 'lead'
    ? `polygon(${cut}px 0, 100% 0, calc(100% - ${cut}px) 100%, 0 100%)`
    : `polygon(0 0, calc(100% - ${cut}px) 0, 100% 100%, ${cut}px 100%)`;

/** 页面壳：水面底（fixed 铺满视口）+ 内容层。active=false 时退化为透明直通
 *  （给"组件内 p3 分支"的页面用：恒挂同一组件、按频道开关壳，避免内联 Wrapper 每渲染重建导致子树 remount） */
export const P3RPage = ({ children, className, active = true }: { children: ReactNode; className?: string; active?: boolean }) => {
  if (!active) return <>{children}</>;
  return (
    <div className={`relative ${className ?? ''}`}>
      {/* 水面底：浅色基底 + caustic 素材极淡平铺（页面卸载即消失，不污染其它主题） */}
      <div aria-hidden className="fixed inset-0 z-0" style={{ background: P3R.bg }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/assets/terminal/p3-water-wide.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            opacity: 0.3,
          }}
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(238,245,249,0.35) 0%, rgba(238,245,249,0.82) 58%, rgba(238,245,249,0.95) 100%)' }} />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
};

/** 背景幽灵大字（多行，整块斜置；移动端低透明度护栏 §18.1）
 *  字重口径：Arial 合成加粗（比 Impact / Arial Black 细一档，用户定稿） */
export const GhostWords = ({ words, className, style }: { words: string[]; className?: string; style?: CSSProperties }) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute select-none font-black italic leading-[0.86] tracking-tight ${className ?? ''}`}
    style={{ fontFamily: 'Arial, "Noto Sans SC", sans-serif', color: 'rgba(147,190,222,0.30)', transform: 'rotate(-12deg)', ...style }}
  >
    {words.map((w, i) => (
      <div key={`${w}-${i}`}>{w}</div>
    ))}
  </div>
);

/** 节标记：蓝色小斜块 + 标题 + 右侧 meta 槽（variant='blue'：蓝色斜体，account 页「数据管理 · DATA」式） */
export const SectionMark = ({ title, meta, variant = 'ink', className }: { title: ReactNode; meta?: ReactNode; variant?: 'ink' | 'blue'; className?: string }) => (
  <div className={`flex items-center justify-between gap-3 ${className ?? ''}`}>
    <div className="flex items-center gap-2">
      <span aria-hidden className="h-[18px] w-[13px]" style={{ background: P3R.blue, clipPath: 'polygon(32% 0, 100% 0, 68% 100%, 0 100%)' }} />
      <h3 className={`text-[19px] font-black leading-none ${variant === 'blue' ? 'italic tracking-wide' : ''}`} style={{ color: variant === 'blue' ? P3R.blue : P3R.ink }}>{title}</h3>
    </div>
    {meta}
  </div>
);

/** P3R 页头：可选返回三角 + 可选大蓝斜块前导 + 超大黑斜体标题 + 可选尾随青双片 */
export const P3PageHeader = ({
  title,
  lead = false,
  ticks = false,
  onBack,
  className,
}: {
  title: ReactNode;
  /** 标题左侧的大蓝斜块（account 页式） */
  lead?: boolean;
  /** 标题右下的青双斜片（成就/星象页式） */
  ticks?: boolean;
  onBack?: () => void;
  className?: string;
}) => (
  <div className={className}>
    {onBack && (
      <button
        type="button"
        onClick={onBack}
        aria-label="返回"
        className="mb-2 flex h-10 w-10 items-center justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
      >
        <span aria-hidden className="block h-[15px] w-[13px]" style={{ background: P3R.ink, clipPath: 'polygon(100% 0, 100% 100%, 0 50%)' }} />
      </button>
    )}
    <div className="flex items-end gap-2.5">
      {lead && <span aria-hidden className="mb-1.5 h-[40px] w-[25px] shrink-0" style={{ background: P3R.blue, clipPath: 'polygon(36% 0, 100% 0, 64% 100%, 0 100%)' }} />}
      <h1
        className="text-[46px] font-black italic leading-[0.95] tracking-tight"
        style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}
      >
        {title}
      </h1>
      {ticks && (
        <span aria-hidden className="mb-2.5 flex shrink-0 items-start gap-1">
          <span className="h-[13px] w-[17px]" style={{ background: P3R.cyan, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          <span className="mt-[3px] h-[11px] w-[13px]" style={{ background: '#9adcee', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
        </span>
      )}
    </div>
  </div>
);

/** 行内代码片（account 云同步说明的 .env.local / VITE_PB_URL 式） */
export const CodeChip = ({ children, tone = 'grey' }: { children: ReactNode; tone?: 'grey' | 'cyan' }) => (
  <code
    className="px-1.5 py-0.5 font-mono text-[12px] font-bold"
    style={tone === 'cyan' ? { background: P3R.cyanPale, color: P3R.blueDeep } : { background: '#e6edf3', color: P3R.ink }}
  >
    {children}
  </code>
);

/** 超大黑斜体节题（今日任务 / 已归档 式），右侧计数槽 */
export const BigSlantTitle = ({ title, count, className }: { title: string; count?: ReactNode; className?: string }) => (
  <div className={`flex items-end justify-between gap-3 ${className ?? ''}`}>
    <h2
      className="text-[34px] font-black italic leading-none tracking-tight"
      style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}
    >
      {title}
    </h2>
    {count !== undefined && (
      <div className="flex items-center gap-1.5 pb-1">
        <span className="text-[17px] font-black italic leading-none" style={{ color: P3R.blue }}>{count}</span>
        <span aria-hidden className="h-3 w-3" style={{ background: P3R.cyan, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
      </div>
    )}
  </div>
);

/** 斜切按钮（设计稿四款：primary 蓝 / soft 浅青 / ghost 更浅 / danger 洋红） */
export const SlantButton = ({
  children,
  tone = 'primary',
  onClick,
  className,
  style,
  ariaLabel,
}: {
  children: ReactNode;
  tone?: 'primary' | 'soft' | 'ghost' | 'danger';
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}) => {
  const skin: Record<string, CSSProperties> = {
    primary: { background: P3R.blue, color: '#fff' },
    soft: { background: '#aee5f2', color: P3R.ink },
    ghost: { background: P3R.cyanFaint, color: P3R.ink },
    danger: { background: P3R.magenta, color: '#fff' },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`relative select-none px-6 py-2.5 text-[16px] font-black tracking-wide active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff] focus-visible:ring-offset-2 ${className ?? ''}`}
      style={{ clipPath: slantClip(10), ...skin[tone], ...style }}
    >
      {children}
    </button>
  );
};

/** 空态板：浅青大平行四边形 + 居中提示（设计稿「暂无可追踪的信号」区） */
export const P3EmptySlab = ({ text = '暂无可追踪的信号', className }: { text?: string; className?: string }) => (
  <div
    className={`flex min-h-[168px] items-center justify-center px-6 ${className ?? ''}`}
    style={{ clipPath: slantClip(26), background: 'rgba(199,231,244,0.72)' }}
  >
    <span className="text-[16px] font-black" style={{ color: P3R.ink }}>{text}</span>
  </div>
);

/** 标题句点：青片 + 洋红小片错位（午夜状态 / 任务 tab 右下的签名符号） */
export const TitlePeriod = ({ className, style }: { className?: string; style?: CSSProperties }) => (
  <span aria-hidden className={`relative inline-block h-[14px] w-[30px] ${className ?? ''}`} style={style}>
    <span className="absolute left-0 top-0 h-full w-[20px]" style={{ background: P3R.cyan, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
    <span className="absolute left-[16px] top-[4px] h-[10px] w-[14px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
  </span>
);
