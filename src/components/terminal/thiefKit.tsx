/**
 * thiefKit — F3 怪盗（红 / 自定义主题）频道的共享 P5 视觉原语。
 *
 * 玄关（AntechamberThief）、作战室（TerminalRoom）、短路决策作战台（ShortCircuitThief）、
 * 预告状任务卡共用同一套「斜块色卡 / 厚描边花字 / 活高亮 / 剪报字 / 面具 / 星爆」，
 * 抽到这里统一来源，保证三处视觉一致、不重复实现。
 *
 * 学自开源 P5 菜单的技法（双多边形 screen 混合活高亮），仓库无 license，故只取技法、代码自写。
 */
import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

// ── 倾斜四边形色块 clip（P5 的核心形：简练有力的斜块） ──
export const QUAD = [
  'polygon(0% 12%, 100% 0%, 98% 82%, 2% 100%)',
  'polygon(3% 0%, 100% 14%, 96% 100%, 0% 84%)',
  'polygon(0% 6%, 100% 0%, 100% 92%, 1% 100%)',
];

/** 厚重四向黑描边白字（P5 sticker 字） */
export const heavy = (px = 3): React.CSSProperties => ({
  color: '#fff',
  textShadow: `${-px}px ${-px}px 0 #000, ${px}px ${-px}px 0 #000, ${-px}px ${px}px 0 #000, ${px}px ${px}px 0 #000, 0 ${px + 2}px 0 #000`,
});

/** 斜块色卡：白描边(底) + 偏移黑影 + 锐利斜裁 */
export const Slab = ({ children, fill, variant = 0, className }: { children: React.ReactNode; fill: string; variant?: number; className?: string }) => {
  const clip = QUAD[variant % QUAD.length];
  return (
    <div className={`relative ${className ?? ''}`} style={{ filter: 'drop-shadow(4px 5px 0 rgba(0,0,0,0.75))' }}>
      <div aria-hidden className="absolute inset-0 bg-white" style={{ clipPath: clip }} />
      <div aria-hidden className="absolute -inset-[3px]" style={{ clipPath: clip, background: fill }} />
      <div className="relative">{children}</div>
    </div>
  );
};

export const StarBurst = ({ className }: { className?: string }) => {
  const pts: string[] = [];
  const spikes = 12;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 50 : 21;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`);
  }
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <polygon points={pts.join(' ')} fill="#fff" stroke="#000" strokeWidth={3.5} strokeLinejoin="round" />
    </svg>
  );
};

export const Mask = ({ className, fill = '#0a0a0a', stroke = '#fff' }: { className?: string; fill?: string; stroke?: string }) => (
  <svg viewBox="0 0 120 64" className={className} aria-hidden>
    <path d="M6 20 Q2 6 20 9 L40 16 Q50 22 60 22 Q70 22 80 16 L100 9 Q118 6 114 20 Q112 40 86 40 Q70 40 62 30 L60 28 L58 30 Q50 40 34 40 Q8 40 6 20 Z" fill={fill} stroke={stroke} strokeWidth={4} strokeLinejoin="round" />
    <path d="M22 20 L40 22 Q34 30 26 28 Q18 26 22 20 Z" fill={stroke} />
    <path d="M98 20 L80 22 Q86 30 94 28 Q102 26 98 20 Z" fill={stroke} />
  </svg>
);

// ── P5「活高亮」：双多边形(红/青)，顶层 screen 混合；rAF 每帧向随机目标插值 → 60fps 平滑红青震颤 ──
const hlTarget = (): number[] => {
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  return [r(0, 16), r(0, 12), r(84, 100), r(0, 14), r(84, 100), r(38, 50), r(0, 16), r(40, 50)];
};
const hlPoints = (a: number[]) => `${a[0].toFixed(1)},${a[1].toFixed(1)} ${a[2].toFixed(1)},${a[3].toFixed(1)} ${a[4].toFixed(1)},${a[5].toFixed(1)} ${a[6].toFixed(1)},${a[7].toFixed(1)}`;
export const P5Highlight = ({ className, live = true }: { className?: string; live?: boolean }) => {
  const bold = useBoldness();
  const redRef = useRef<SVGPolygonElement>(null);
  const blueRef = useRef<SVGPolygonElement>(null);
  useEffect(() => {
    // D0 或非 live（如首页常驻预告状卡）：静态高亮，不跑 rAF——避免常驻屏幕无限烧帧
    if (!bold || !live) return;
    const layers = [redRef, blueRef].map((ref) => ({ ref, cur: hlTarget(), tgt: hlTarget(), last: 0 }));
    let raf = 0;
    const loop = (t: number) => {
      for (const L of layers) {
        if (t - L.last > 130) { L.tgt = hlTarget(); L.last = t; } // 每 ~130ms 换目标，逐帧插值过去
        for (let i = 0; i < 8; i++) L.cur[i] += (L.tgt[i] - L.cur[i]) * 0.18;
        L.ref.current?.setAttribute('points', hlPoints(L.cur));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bold, live]);
  return (
    <svg viewBox="0 0 100 50" preserveAspectRatio="none" className={className} aria-hidden>
      <polygon ref={redRef} fill="#ff0022" points="2,6 95,5 94,45 5,46" />
      <polygon ref={blueRef} fill="#1cfeff" points="6,9 92,12 88,46 8,42" style={{ mixBlendMode: 'screen' }} />
    </svg>
  );
};

// ── 勒索信剪报拼贴字（每字母独立小纸片：混字体 / 红黑白 / 各自倾角 / 撕角） ──
const RANSOM_BG = ['#ffffff', 'var(--color-primary)', '#0d0d0d', '#ffffff', '#0d0d0d', 'var(--color-primary)'];
const RANSOM_FG = ['#0d0d0d', '#ffffff', '#ffffff', '#0d0d0d', '#ffffff', '#ffffff'];
const RANSOM_FONT = ['Georgia, "Times New Roman", serif', 'Arial, Helvetica, sans-serif', 'ui-monospace, monospace', '"Courier New", monospace'];
const RANSOM_CLIP = ['polygon(3% 5%, 96% 0%, 100% 93%, 4% 100%)', 'polygon(0% 4%, 97% 6%, 94% 100%, 5% 95%)', 'polygon(5% 0%, 100% 8%, 96% 96%, 0% 100%)'];

export const Ransom = ({ lines, baseSize = 'text-base', bigSize = 'text-xl' }: { lines: string[]; baseSize?: string; bigSize?: string }) => {
  let g = 0; // 跨行连续索引，让字母样式连续变化
  return (
    <span className="flex flex-col items-end gap-1.5">
      {lines.map((line, li) => (
        <span key={li} className="flex justify-end gap-x-1">
          {[...line].map((ch, i) => {
            if (ch === ' ') { g += 1; return <span key={i} className="w-1.5" aria-hidden />; }
            const k = g++;
            const rot = ((k * 53) % 17) - 8; // -8..8 伪随机倾角
            const big = k % 3 === 0;
            return (
              <span
                key={i}
                className={`inline-block px-1.5 py-0.5 font-black leading-none ${big ? bigSize : baseSize}`}
                style={{
                  background: RANSOM_BG[k % RANSOM_BG.length],
                  color: RANSOM_FG[k % RANSOM_FG.length],
                  fontFamily: RANSOM_FONT[k % RANSOM_FONT.length],
                  fontStyle: k % 4 === 0 ? 'italic' : 'normal',
                  transform: `rotate(${rot}deg)`,
                  clipPath: RANSOM_CLIP[k % RANSOM_CLIP.length],
                  filter: 'drop-shadow(1.5px 2px 0 rgba(0,0,0,0.65))',
                }}
              >
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
};

/** halftone 网点叠层（红块出血用）；caller 定位 / 裁剪 / 旋转 */
export const Halftone = ({ className, style, dot = 1.3, gap = 8 }: { className?: string; style?: React.CSSProperties; dot?: number; gap?: number }) => (
  <div
    aria-hidden
    className={`pointer-events-none ${className ?? ''}`}
    style={{ backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.55) ${dot}px, transparent ${dot + 0.4}px)`, backgroundSize: `${gap}px ${gap}px`, ...style }}
  />
);

/** 放射 / 平行速度线（SVG 直线扇铺）；preserveAspectRatio=none 拉满容器 */
export const SpeedLines = ({ className, lines = [18, 42, 70, 88], angle = -9, opacity = 0.07 }: { className?: string; lines?: number[]; angle?: number; opacity?: number }) => (
  <div aria-hidden className={`pointer-events-none absolute inset-0 ${className ?? ''}`} style={{ opacity }}>
    {lines.map((t, i) => (
      <div key={i} className="absolute left-[-10%] h-[3px] w-[120%] bg-white" style={{ top: `${t}%`, transform: `rotate(${angle}deg)` }} />
    ))}
  </div>
);

/** 怪盗主操作按钮：红斜块色卡 + 面具(可选) + P5 活高亮（怪盗频道通用）。
 *  live=false（如首页常驻预告状卡）→ 高亮静态、不跑 rAF。 */
export const StrikeButton = ({ label, onClick, mask = false, disabled = false, live = true, className }: { label: string; onClick: () => void; mask?: boolean; disabled?: boolean; live?: boolean; className?: string }) => (
  <motion.button type="button" whileTap={disabled ? undefined : { scale: 0.95 }} onClick={onClick} disabled={disabled} aria-label={label} className={`relative disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0d] ${className ?? ''}`}>
    {!disabled && <P5Highlight live={live} className="absolute -inset-x-2 -inset-y-1 -z-10" />}
    <Slab fill="var(--color-primary)" variant={0}>
      <div className="flex items-center justify-center gap-2 px-5 py-2.5">
        {mask && <Mask className="h-5 w-9 shrink-0" />}
        <span className="text-base font-black tracking-wider" style={heavy(2)}>{label}</span>
      </div>
    </Slab>
  </motion.button>
);

/** 怪盗次操作按钮：红描边幽灵按钮 */
export const GhostButton = ({ label, onClick, disabled = false, className }: { label: string; onClick: () => void; disabled?: boolean; className?: string }) => (
  <button type="button" onClick={onClick} disabled={disabled} className={`rounded-[2px] border-2 border-primary/60 px-4 py-2 text-sm font-bold tracking-wide text-primary transition hover:bg-primary/10 focus-visible:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0d] disabled:opacity-40 ${className ?? ''}`}>
    {label}
  </button>
);
