/**
 * ConfidantNameFx —— 同伴 / 好友**名字本身**的两种状态特效。
 *
 * 为什么把特效挂在名字上而不是再加一个角标：名字是这张卡上视线必然落到的地方，
 * 而这两件事都属于「你该看一眼这个人」——角标（OnlineStarBadge）负责"有没有"，
 * 名字负责"有多要紧"。两者叠加使用，不冲突。
 *
 *   waiting  = 今日 Ta 为你祈过、你还没回 → 渐变流光扫过 + 一道高光闪烁
 *   maxBond  = 羁绊满级（Lv.10）→ 名字转强调色 + 几颗上浮粒子
 *
 * 配色按频道取（蓝=蓝青 / 黄=橙金 / 红=猩红 / 中性=主题色），不用 --color-primary
 * 一把梭：黄频道的强调是橙不是黄底，直接用主题色会糊在舞台上。
 *
 * 流光的亮点要往**背离底色**的方向走（第 19 批）：深底上扫成亮色（下面 hi 那一列）；
 * 浅底上以前也扫成白 / 亮黄，白卡、黄页上名字会有一瞬间整个看不见——浅底改成在强调色和
 * 名字本来的深色字之间流。底深底浅不靠调用方传：看名字本来的字色（各处给名字配的字色
 * 本来就保证在自己那块底上看得清），字色深 = 底浅；换频道 / 开关夜间时重判。
 *
 * D0 守卫：降级时两种动画都停，只留静态色——纯装饰，低端机第一个该省。
 * 动的只有 background-position / transform / opacity，全在合成器。
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBoldness } from '@/utils/boldness';
import { resolveCssColor } from '@/utils/cssColor';

/** <html> 上的 .dark：开关夜间时名字的字色会变，底深底浅要重判 */
const subscribeDark = (onChange: () => void) => {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
};
const getDark = () => document.documentElement.classList.contains('dark');

/** 相对亮度（WCAG 口径，0 黑 ~ 1 白） */
const luminance = ([r, g, b]: readonly number[]) => {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** [流光起色, 流光高光（深底用）, 满级强调色] */
const FX_INK: Record<string, { a: string; hi: string; max: string }> = {
  p3: { a: 'var(--p3r-blue, #1b57ff)', hi: '#7fe3f4', max: 'var(--p3r-cyan, #35d1e8)' },
  p4: { a: '#b26a00', hi: '#ffd900', max: 'var(--p4-orange, #f9a11b)' },
  p5: { a: '#c00008', hi: '#ff8a8a', max: '#d90008' },
  neutral: { a: 'var(--color-primary)', hi: '#ffffff', max: 'var(--color-primary)' },
};

let injected = false;
const ensureKeyframes = () => {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'confidant-name-fx';
  el.textContent = `
    @keyframes vr-name-flow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
    @keyframes vr-name-spark { 0%,100% { opacity: 0; transform: translateY(0) scale(0.6); } 45% { opacity: 1; transform: translateY(-7px) scale(1); } }
  `;
  document.head.appendChild(el);
};

export interface ConfidantNameFxProps {
  children: ReactNode;
  /** 今日祈愿未回应 */
  waiting?: boolean;
  /** 羁绊满级 */
  maxBond?: boolean;
  className?: string;
}

export const ConfidantNameFx = ({ children, waiting = false, maxBond = false, className = '' }: ConfidantNameFxProps) => {
  const channel = useUiChannel();
  const bold = useBoldness();
  const dark = useSyncExternalStore(subscribeDark, getDark);
  const ink = FX_INK[channel] ?? FX_INK.neutral;
  ensureKeyframes();

  // 两态可同时成立（满级好友今天也没回祈愿）：流光优先，满级色作为流光的基色
  const animate = bold && waiting;
  const base = maxBond ? ink.max : undefined;

  // 名字本来的字色（流光盖住的那个）：深 = 名字在浅底上
  const boxRef = useRef<HTMLSpanElement>(null);
  const [plain, setPlain] = useState<{ color: string; onLight: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!animate) return;
    const read = () => {
      const el = boxRef.current;
      if (!el) return;
      const color = getComputedStyle(el).color;
      const rgb = resolveCssColor(color);
      const onLight = !!rgb && luminance(rgb) < 0.3;
      setPlain(p => (p && p.color === color && p.onLight === onLight ? p : { color, onLight }));
    };
    read();
    // 换肤 / 开关夜间时字色可能还在过渡，过一会儿再读一次
    const t = window.setTimeout(read, 400);
    return () => window.clearTimeout(t);
  }, [animate, channel, dark]);

  if (!waiting && !maxBond) return <span className={className}>{children}</span>;

  // 浅底：在强调色和名字本来的深色字之间流（满级色在浅底上多半偏浅——蓝青、橙——流光时先不用）
  const from = plain?.onLight ? ink.a : base ?? ink.a;
  const peak = plain?.onLight ? plain.color : ink.hi;

  return (
    <span ref={boxRef} className={`relative inline-flex min-w-0 items-center ${className}`}>
      <span
        className="min-w-0 truncate"
        style={
          animate
            ? {
                // background-clip:text 的流光——与首页品牌标题同一套配方
                backgroundImage: `linear-gradient(90deg, ${from} 0%, ${peak} 22%, ${from} 46%, ${peak} 70%, ${from} 100%)`,
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'vr-name-flow 2.6s linear infinite',
              }
            : base
              ? { color: base }
              : undefined
        }
      >
        {children}
      </span>
      {/* 满级粒子：三颗错开上浮的小点，压在名字右上，不占布局 */}
      {maxBond && bold && (
        <span aria-hidden className="pointer-events-none absolute -right-1.5 -top-1 h-3 w-3">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: i * 4,
                bottom: 0,
                width: 2.5,
                height: 2.5,
                background: ink.max,
                boxShadow: `0 0 4px ${ink.max}`,
                animation: `vr-name-spark 2.2s ease-in-out ${i * 0.55}s infinite`,
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
};
