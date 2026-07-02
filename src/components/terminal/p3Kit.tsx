/**
 * p3Kit — 蓝(board)频道的 P3R「亮蓝水面」视觉原语。
 * 对照设计稿 artifacts/p3-blue-terminal-reference-v4.png（进入后的菜单）1:1 转译。
 *
 * 色板策略：大面积色一律由 --color-primary 经 color-mix 派生——蓝主题即设计稿原色；
 * 粉 / 自定义主题整室随主色变调（白面板 + 深字的结构保证任意主色可读，延续 board
 * 的「自定义安全色」思路）。青色 ACCENT 是 P3 的固定信号色，不随主题走。
 * 水面纹理素材（p3-water*.png）直接取自设计稿本体。
 */
import type { CSSProperties } from 'react';
import { motion } from 'motion/react';

export const P3 = {
  /** 白面板上的深蓝标题 / 正文 */
  ink: 'color-mix(in srgb, var(--color-primary) 45%, #101b8e)',
  /** 白面板上的次级说明字 */
  inkDim: 'color-mix(in srgb, var(--color-primary) 32%, #46628f)',
  /** CTA / 底部弹幕栏的藏青底 */
  deep: 'color-mix(in srgb, var(--color-primary) 30%, #061c50)',
  /** 弹幕栏左标签、CTA 播放块的亮一档藏蓝 */
  deepSoft: 'color-mix(in srgb, var(--color-primary) 58%, #1b3a94)',
  /** 房间背景顶部强蓝 */
  hi: 'color-mix(in srgb, var(--color-primary) 72%, #0053d0)',
  /** 房间背景中段 */
  mid: 'color-mix(in srgb, var(--color-primary) 82%, #6fc2ff)',
  /** 房间背景底部浅蓝（水面处） */
  pale: 'color-mix(in srgb, var(--color-primary) 20%, #dbf0fd)',
  /** 图标块 / 进度填充 / 「打开」的亮蓝 */
  blue: 'color-mix(in srgb, var(--color-primary) 78%, #0b6cf0)',
  /** 固定青色信号色（LIVE 点、下划线段、CH 章、|||） */
  accent: '#2fd2ff',
  /** 白面板底色 */
  panel: '#f7fbff',
} as const;

export const P3_WATER = '/assets/terminal/p3-water.png';
export const P3_WATER_WIDE = '/assets/terminal/p3-water-wide.png';

/** 白点阵网格（设计稿右上 / 水面板上的装饰） */
export const P3DotGrid = ({ className, style, size = 14, dot = 1.3, opacity = 0.5 }: {
  className?: string; style?: CSSProperties; size?: number; dot?: number; opacity?: number;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute ${className ?? ''}`}
    style={{
      backgroundImage: `radial-gradient(circle, rgba(255,255,255,.95) ${dot}px, transparent ${dot + 0.5}px)`,
      backgroundSize: `${size}px ${size}px`,
      opacity,
      ...style,
    }}
  />
);

/** 巨型幽灵字（背景 TRACE 水印） */
export const P3GhostWord = ({ word, className, style }: { word: string; className?: string; style?: CSSProperties }) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute select-none whitespace-nowrap font-black italic leading-none tracking-tight text-white ${className ?? ''}`}
    style={{ fontFamily: 'Arial Black, Impact, sans-serif', ...style }}
  >
    {word}
  </div>
);

/**
 * 底部弹幕栏（设计稿最下缘的深蓝滚动条）。
 * 纯氛围装饰：aria-hidden + pointer-events-none；bold=false 时不滚动、只静态显示一条。
 * 移动端悬于 BottomNav（h-16 + 安全区）之上；桌面端贴底、让出左侧 Sidebar。
 */
export const P3DanmakuBar = ({ messages, bold, label = '匿名讨论版' }: {
  messages: string[]; bold: boolean; label?: string;
}) => {
  const pool = messages.length > 0 ? messages : ['深夜里，有人和你一起醒着。'];
  const ticker = pool.join('　•　');
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 z-30 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 md:left-60"
    >
      <div className="flex h-11 items-stretch overflow-hidden" style={{ background: P3.deep, boxShadow: '0 -6px 22px rgba(6,28,80,.28)' }}>
        <span className="flex shrink-0 items-center gap-2 px-4 text-[13px] font-black tracking-wide text-white" style={{ background: P3.deepSoft }}>
          {label}
          <span className="text-[10px]" style={{ color: P3.accent }}>▶</span>
        </span>
        <span className="my-auto ml-3 h-4 w-px shrink-0 bg-white/40" />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {bold ? (
            <motion.div
              className="flex h-full items-center whitespace-nowrap text-[13px] font-bold text-white/90"
              animate={{ x: ['0%', '-50%'] }}
              transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
            >
              <span className="pl-3 pr-10">{ticker}</span>
              <span className="pl-3 pr-10">{ticker}</span>
            </motion.div>
          ) : (
            <div className="flex h-full items-center truncate pl-3 pr-4 text-[13px] font-bold text-white/90">{pool[0]}</div>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 px-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-4 w-1" style={{ background: P3.accent }} />
          ))}
        </span>
      </div>
    </div>
  );
};
