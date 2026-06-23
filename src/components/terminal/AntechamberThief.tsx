/**
 * AntechamberThief — F3 玄关「怪盗 channel」皮肤（红/自定义主题，Persona 5 风）。
 *
 * 重写（learn-not-copy 自开源 P5 菜单的技法，仓库无 license 故只取技法、代码自写）：
 * P5 的招牌不是碎纸拼贴，而是 **大块倾斜四边形色块 + 厚重四向黑描边大字 + 强红黑对比 + 大角度倾斜**。
 * 用 4 点 clip-path 斜块、四角 text-shadow 描边、强对角能量线、halftone 红块、怪盗面具 + 旋转星爆。
 * D0/reduced-motion 直接出静态。
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic, triggerThemeSwitchFeedback } from '@/utils/feedback';
import type { TerminalSkin } from '@/utils/terminalSkin';

interface Props {
  skin: TerminalSkin;
  onEnter: () => void;
  onBack: () => void;
}

let _thiefIntroSeen = false;

// ── 倾斜四边形色块（P5 的核心形：简练有力的斜块，而非碎纸） ──
const Q = [
  'polygon(0% 12%, 100% 0%, 98% 82%, 2% 100%)',
  'polygon(3% 0%, 100% 14%, 96% 100%, 0% 84%)',
  'polygon(0% 6%, 100% 0%, 100% 92%, 1% 100%)',
];

/** 厚重四向黑描边白字（P5 sticker 字） */
const heavy = (px = 3): React.CSSProperties => ({
  color: '#fff',
  textShadow: `${-px}px ${-px}px 0 #000, ${px}px ${-px}px 0 #000, ${-px}px ${px}px 0 #000, ${px}px ${px}px 0 #000, 0 ${px + 2}px 0 #000`,
});

/** 斜块色卡：白描边(底) + 偏移黑影 + 锐利斜裁 */
const Slab = ({ children, fill, variant = 0, className }: { children: React.ReactNode; fill: string; variant?: number; className?: string }) => {
  const clip = Q[variant % Q.length];
  return (
    <div className={`relative ${className ?? ''}`} style={{ filter: 'drop-shadow(4px 5px 0 rgba(0,0,0,0.75))' }}>
      <div aria-hidden className="absolute inset-0 bg-white" style={{ clipPath: clip }} />
      <div aria-hidden className="absolute -inset-[3px]" style={{ clipPath: clip, background: fill }} />
      <div className="relative">{children}</div>
    </div>
  );
};

const StarBurst = ({ className }: { className?: string }) => {
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

const Mask = ({ className, fill = '#0a0a0a', stroke = '#fff' }: { className?: string; fill?: string; stroke?: string }) => (
  <svg viewBox="0 0 120 64" className={className} aria-hidden>
    <path d="M6 20 Q2 6 20 9 L40 16 Q50 22 60 22 Q70 22 80 16 L100 9 Q118 6 114 20 Q112 40 86 40 Q70 40 62 30 L60 28 L58 30 Q50 40 34 40 Q8 40 6 20 Z" fill={fill} stroke={stroke} strokeWidth={4} strokeLinejoin="round" />
    <path d="M22 20 L40 22 Q34 30 26 28 Q18 26 22 20 Z" fill={stroke} />
    <path d="M98 20 L80 22 Q86 30 94 28 Q102 26 98 20 Z" fill={stroke} />
  </svg>
);

// ── P5「活高亮」：双多边形(红/青)，顶层 screen 混合，每帧抖动顶点 → 红青色差震颤 ──
const jitter4 = () => {
  const r = (a: number, b: number) => (a + Math.random() * (b - a)).toFixed(1);
  return `${r(0, 16)},${r(0, 9)} ${r(84, 100)},${r(0, 13)} ${r(84, 100)},${r(37, 50)} ${r(0, 16)},${r(41, 50)}`;
};
const P5Highlight = ({ className }: { className?: string }) => {
  const bold = useBoldness();
  const redRef = useRef<SVGPolygonElement>(null);
  const blueRef = useRef<SVGPolygonElement>(null);
  useEffect(() => {
    if (!bold) return; // D0：静态高亮，不抖
    const tick = () => {
      redRef.current?.setAttribute('points', jitter4());
      blueRef.current?.setAttribute('points', jitter4());
    };
    tick();
    const id = setInterval(tick, 110);
    return () => clearInterval(id);
  }, [bold]);
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

const Ransom = ({ lines }: { lines: string[] }) => {
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
                className={`inline-block px-1.5 py-0.5 font-black leading-none ${big ? 'text-xl' : 'text-base'}`}
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

export const AntechamberThief = ({ skin, onEnter, onBack }: Props) => {
  const user = useAppStore((s) => s.user);
  const bold = useBoldness();
  const [phase, setPhase] = useState<'intro' | 'rest'>(() => (bold && !_thiefIntroSeen ? 'intro' : 'rest'));
  const [popping, setPopping] = useState(false);
  const intro = phase === 'intro';

  useEffect(() => {
    if (!intro) return;
    _thiefIntroSeen = true;
    const t = setTimeout(() => setPhase('rest'), 2200);
    return () => clearTimeout(t);
  }, [intro]);

  const enter = () => {
    if (popping) return;
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    // 选中确认：快速跳一下(缩放 bounce)再进入；D0 直接进
    if (!bold) { onEnter(); return; }
    setPopping(true);
    setTimeout(onEnter, 230);
  };

  const slam = (delay: number, rest = 0, fromX = -30) =>
    intro
      ? {
          initial: { opacity: 0, scale: 1.35, rotate: rest - 7, x: fromX },
          animate: { opacity: 1, scale: 1, rotate: rest, x: 0 },
          transition: { type: 'spring' as const, damping: 12, stiffness: 330, delay },
        }
      : { initial: false as const, animate: { opacity: 1, scale: 1, rotate: rest, x: 0 }, transition: { duration: 0.12 } };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: bold ? 0.25 : 0.12 }}
      className="fixed inset-0 z-40 overflow-hidden bg-[#0d0d0d]"
      onClick={() => intro && setPhase('rest')}
    >
      {/* 大红斜块（右上对角主色块）+ halftone */}
      <div aria-hidden className="pointer-events-none absolute -right-[12%] -top-[14%] h-[78%] w-[90%]" style={{ background: 'var(--color-primary)', clipPath: 'polygon(28% 0%, 100% 0%, 100% 100%, 0% 62%)', transform: 'rotate(2deg)' }} />
      <div aria-hidden className="pointer-events-none absolute -right-[12%] -top-[14%] h-[78%] w-[90%]" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.55) 1.3px, transparent 1.7px)', backgroundSize: '8px 8px', clipPath: 'polygon(28% 0%, 100% 0%, 100% 100%, 0% 62%)', transform: 'rotate(2deg)' }} />
      {/* 黑色对角大块（压住下半，作内容底） */}
      <div aria-hidden className="pointer-events-none absolute -bottom-[10%] -left-[6%] h-[72%] w-[92%] bg-black" style={{ clipPath: 'polygon(0% 18%, 100% 0%, 100% 100%, 0% 100%)', transform: 'rotate(-2deg)' }} />
      {/* 对角能量斜条 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]">
        {[18, 42, 70, 88].map((t, i) => (
          <div key={i} className="absolute left-[-10%] h-[3px] w-[120%] bg-white" style={{ top: `${t}%`, transform: 'rotate(-9deg)' }} />
        ))}
      </div>
      {/* 勒索信剪报「TAKE YOUR / HEART」（右上，两行右对齐，替代面具剪影） */}
      <motion.div {...slam(intro ? 0.28 : 0, -6, 30)} className="pointer-events-none absolute right-3 top-12 z-10 flex max-w-[85%] flex-col items-end">
        <Ransom lines={['TAKE YOUR', 'HEART']} />
      </motion.div>
      {/* 角落小星 */}
      <StarBurst className="pointer-events-none absolute left-[8%] top-[10%] h-9 w-9 -rotate-12 opacity-90" />

      {/* 返回 */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onBack(); }} aria-label="返回" className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white/80 hover:bg-white/10">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      {/* ── 主体（偏左下，对角） ── */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end px-6 pb-14">
        {/* 台标 */}
        <motion.div {...slam(intro ? 0.15 : 0, -4)} className="mb-3 self-start">
          <Slab fill="var(--color-primary)" variant={1}>
            <div className="px-4 py-1 text-xs font-black tracking-[3px]" style={heavy(2)}>★ {skin.label.toUpperCase()}</div>
          </Slab>
        </motion.div>

        {/* 主标题：超大厚描边斜字 */}
        <motion.div {...slam(intro ? 0.4 : 0, -5)} className="mb-4 self-start text-[2.9rem] font-black leading-[0.95]" style={heavy(4)}>
          {skin.heroTitle}
        </motion.div>

        {/* 副标语：红斜块 */}
        <motion.div {...slam(intro ? 0.62 : 0, 2)} className="mb-8 self-start">
          <Slab fill="var(--color-primary)" variant={2}>
            <div className="px-4 py-2 text-lg font-black" style={heavy(2.5)}>{skin.heroSub}</div>
          </Slab>
        </motion.div>

        {/* 潜入按钮：P5 活高亮(抖动红青色差) + 点击跳一下确认 */}
        <motion.button
          type="button"
          onClick={(e) => { e.stopPropagation(); enter(); }}
          aria-label={skin.enterLabel}
          initial={intro ? { opacity: 0, scale: 0.5, rotate: -3 } : false}
          animate={popping ? { scale: [1, 1.22, 0.9, 1.06, 1], rotate: -3, opacity: 1 } : { opacity: 1, scale: 1, rotate: -3 }}
          transition={popping ? { duration: 0.26, ease: 'easeOut' } : { type: 'spring', damping: 11, stiffness: 360, delay: intro ? 0.95 : 0 }}
          whileTap={popping ? undefined : { scale: 0.95 }}
          className="relative self-center"
        >
          {/* P5「活高亮」框（抖动红青，screen 混合，环在按钮外缘） */}
          <P5Highlight className="absolute -inset-2.5 -z-10" />
          <Slab fill="var(--color-primary)" variant={0}>
            <div className="flex items-center gap-3 px-9 py-3">
              <Mask className="h-8 w-14 shrink-0" />
              <span className="text-3xl font-black tracking-widest" style={heavy(3)}>{skin.enterLabel}</span>
            </div>
          </Slab>
        </motion.button>

        <motion.div initial={intro ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: intro ? 1.3 : 0 }} className="mt-3 self-center text-[11px] tracking-widest text-white/55">
          {intro ? '轻点跳过' : '轻点面具 · 潜入'}
        </motion.div>
      </div>
    </motion.div>
  );
};
