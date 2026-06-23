/**
 * AntechamberThief — F3 玄关「怪盗 channel」皮肤（红/自定义主题，Persona 5 红黑剪报拼贴风）。
 *
 * 手搓 P5 视觉语言（不复用通用件）：放射速度线、面具剪影出血、halftone 网点、撕纸锯齿横幅
 * (clip-path + 白描边 + 偏移黑影)、英文勒索信碎片拼贴、墨点、mix-blend-mode 色分离大标题、
 * 散布星与怪盗 LOGO。觉醒/标题逐件 slam-in（红 overshoot）。可点击跳过、本会话只全播一次、
 * D0/reduced-motion 直接出静态拼贴。
 */
import { useEffect, useState } from 'react';
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

// ── 撕纸锯齿多边形（手撕边变体） ──
const TORN = [
  'polygon(0.5% 14%, 16% 3%, 38% 10%, 60% 1%, 82% 9%, 99.5% 4%, 98% 40%, 100% 72%, 96% 97%, 70% 88%, 44% 99%, 22% 90%, 3% 98%, 1% 60%, 2% 32%)',
  'polygon(1% 8%, 22% 0.5%, 50% 7%, 74% 0%, 99% 10%, 97% 44%, 99% 78%, 92% 99%, 64% 92%, 38% 100%, 14% 91%, 0.5% 96%, 2% 56%, 0% 28%)',
  'polygon(0% 10%, 20% 2%, 46% 8%, 68% 0.5%, 90% 6%, 100% 34%, 98% 66%, 99% 94%, 76% 90%, 50% 99%, 26% 91%, 6% 99%, 1% 62%, 3% 30%)',
];

/** 撕纸横幅：白描边 + 偏移黑影 + 锯齿裁切 */
const Torn = ({ children, fill, variant = 0, className }: { children: React.ReactNode; fill: string; variant?: number; className?: string }) => {
  const clip = TORN[variant % TORN.length];
  return (
    <div className={`relative ${className ?? ''}`} style={{ filter: 'drop-shadow(3px 4px 0 rgba(0,0,0,0.65))' }}>
      <div aria-hidden className="absolute inset-0 bg-white" style={{ clipPath: clip }} />
      <div aria-hidden className="absolute inset-[3px]" style={{ clipPath: clip, background: fill }} />
      <div className="relative">{children}</div>
    </div>
  );
};

const ink = (stroke = '#000'): React.CSSProperties => ({ WebkitTextStroke: `1.2px ${stroke}`, textShadow: '2px 3px 0 rgba(0,0,0,0.4)' });

/** 尖星爆 */
const StarBurst = ({ className }: { className?: string }) => {
  const pts: string[] = [];
  const spikes = 11;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 50 : 24;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`);
  }
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <polygon points={pts.join(' ')} fill="#fff" stroke="#000" strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
};

/** 怪盗面具 */
const Mask = ({ className, fill = '#0a0a0a', stroke = '#fff' }: { className?: string; fill?: string; stroke?: string }) => (
  <svg viewBox="0 0 120 64" className={className} aria-hidden>
    <path d="M6 20 Q2 6 20 9 L40 16 Q50 22 60 22 Q70 22 80 16 L100 9 Q118 6 114 20 Q112 40 86 40 Q70 40 62 30 L60 28 L58 30 Q50 40 34 40 Q8 40 6 20 Z" fill={fill} stroke={stroke} strokeWidth={4} strokeLinejoin="round" />
    <path d="M22 20 L40 22 Q34 30 26 28 Q18 26 22 20 Z" fill={stroke} />
    <path d="M98 20 L80 22 Q86 30 94 28 Q102 26 98 20 Z" fill={stroke} />
  </svg>
);

/** 从右上角放射的速度线 */
const SpeedLines = ({ className }: { className?: string }) => {
  const ox = 97;
  const oy = 4;
  const lines = Array.from({ length: 22 }).map((_, i) => {
    const a = (Math.PI * 0.42) + (i / 21) * (Math.PI * 0.92); // 向下、向左扇形铺开
    return { x2: ox + 220 * Math.cos(a), y2: oy + 220 * Math.sin(a) };
  });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      {lines.map((l, i) => (
        <line key={i} x1={ox} y1={oy} x2={l.x2} y2={l.y2} stroke="#fff" strokeWidth={i % 3 === 0 ? 0.5 : 0.25} />
      ))}
    </svg>
  );
};

// 散布的勒索信英文碎片（拼贴质感）
const SCRAPS: { text: string; top: string; left: string; rot: number; fill: string; size: string; from: { x: number; y: number } }[] = [
  { text: 'TAKE YOUR HEART', top: '11%', left: '50%', rot: 4, fill: '#0a0a0a', size: 'text-[10px]', from: { x: 40, y: -30 } },
  { text: 'SHOWTIME', top: '63%', left: '4%', rot: -6, fill: 'var(--color-primary)', size: 'text-[11px]', from: { x: -40, y: 20 } },
  { text: '心の怪盗団', top: '30%', left: '70%', rot: 7, fill: '#0a0a0a', size: 'text-[10px]', from: { x: 40, y: 0 } },
  { text: 'ALL-OUT ATTACK', top: '78%', left: '64%', rot: -4, fill: '#0a0a0a', size: 'text-[9px]', from: { x: 30, y: 30 } },
];

export const AntechamberThief = ({ skin, onEnter, onBack }: Props) => {
  const user = useAppStore((s) => s.user);
  const bold = useBoldness();
  const [phase, setPhase] = useState<'intro' | 'rest'>(() => (bold && !_thiefIntroSeen ? 'intro' : 'rest'));
  const intro = phase === 'intro';

  useEffect(() => {
    if (!intro) return;
    _thiefIntroSeen = true;
    const t = setTimeout(() => setPhase('rest'), 2400);
    return () => clearTimeout(t);
  }, [intro]);

  const enter = () => {
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    onEnter();
  };

  // slam-in：放大+旋转 overshoot 砸到位
  const slam = (delay: number, rest = 0, from = { x: -24, y: 0 }) =>
    intro
      ? {
          initial: { opacity: 0, scale: 1.4, rotate: rest - 8, x: from.x, y: from.y },
          animate: { opacity: 1, scale: 1, rotate: rest, x: 0, y: 0 },
          transition: { type: 'spring' as const, damping: 13, stiffness: 340, delay },
        }
      : { initial: false as const, animate: { opacity: 1, scale: 1, rotate: rest, x: 0, y: 0 }, transition: { duration: 0.12 } };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: bold ? 0.3 : 0.15 }}
      className="fixed inset-0 z-40 overflow-hidden bg-[#070707]"
      onClick={() => intro && setPhase('rest')}
    >
      {/* ── 背景层（静态） ── */}
      {/* 右上红色网点出血 */}
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-[62%] w-[82%]" style={{ background: 'radial-gradient(120% 100% at 100% 0%, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 50%, #000) 40%, transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-[62%] w-[82%]" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.6) 1.2px, transparent 1.6px)', backgroundSize: '7px 7px', WebkitMaskImage: 'radial-gradient(120% 100% at 100% 0%, #000 0%, transparent 60%)', maskImage: 'radial-gradient(120% 100% at 100% 0%, #000 0%, transparent 60%)' }} />
      {/* 左下红块 */}
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-[44%] w-[58%]" style={{ background: 'radial-gradient(120% 100% at 0% 100%, color-mix(in srgb, var(--color-primary) 65%, #000) 0%, transparent 60%)' }} />
      {/* 放射速度线 */}
      <SpeedLines className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.1]" />
      {/* 角色面具剪影（右上出血，半透明大面具） */}
      <Mask className="pointer-events-none absolute -right-10 -top-6 h-44 w-80 rotate-6 opacity-25" fill="#000" stroke="rgba(255,255,255,0.5)" />
      {/* 墨点 */}
      <div aria-hidden className="pointer-events-none absolute left-[8%] top-[20%] h-16 w-16 rounded-full opacity-30" style={{ background: 'var(--color-primary)', filter: 'blur(2px)', clipPath: TORN[0] }} />

      {/* 散布勒索碎片 */}
      {SCRAPS.map((s, i) => (
        <motion.div
          key={i}
          {...slam(intro ? 0.15 + i * 0.12 : 0, s.rot, s.from)}
          className="pointer-events-none absolute -translate-x-1/2"
          style={{ top: s.top, left: s.left }}
        >
          <Torn fill={s.fill} variant={i}>
            <div className={`px-2 py-0.5 font-black tracking-wider text-white ${s.size}`} style={ink()}>{s.text}</div>
          </Torn>
        </motion.div>
      ))}
      {/* 散布星 */}
      <StarBurst className="pointer-events-none absolute right-[10%] top-[50%] h-10 w-10 opacity-90" />
      <StarBurst className="pointer-events-none absolute left-[14%] top-[8%] h-6 w-6 rotate-12 opacity-70" />

      {/* 返回 */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onBack(); }} aria-label="返回" className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/10">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      {/* ── 拼贴主体（偏左下，非对称） ── */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end px-6 pb-16">
        {/* 台标 */}
        <motion.div {...slam(intro ? 0.2 : 0, -3)} className="mb-3 self-start">
          <Torn fill="var(--color-primary)" variant={1}>
            <div className="px-4 py-1 text-xs font-black tracking-[2px] text-white" style={ink()}>★ {skin.label}</div>
          </Torn>
        </motion.div>

        {/* 主标题：色分离大字 */}
        <motion.div {...slam(intro ? 0.45 : 0, -2)} className="relative mb-3 self-start" style={{ lineHeight: 1 }}>
          <span aria-hidden className="absolute whitespace-nowrap text-5xl font-black" style={{ color: '#ff1f4b', transform: 'translate(-3px,2px)', mixBlendMode: 'screen' }}>{skin.heroTitle}</span>
          <span aria-hidden className="absolute whitespace-nowrap text-5xl font-black" style={{ color: '#22d3ee', transform: 'translate(3px,-2px)', mixBlendMode: 'screen' }}>{skin.heroTitle}</span>
          <span className="relative whitespace-nowrap text-5xl font-black text-white" style={ink('#000')}>{skin.heroTitle}</span>
        </motion.div>

        {/* 副标语横幅 */}
        <motion.div {...slam(intro ? 0.7 : 0, 1.5)} className="mb-7 self-start">
          <Torn fill="#0a0a0a" variant={2}>
            <div className="px-4 py-2 text-lg font-black text-white" style={ink()}>{skin.heroSub}</div>
          </Torn>
        </motion.div>

        {/* 潜入按钮 */}
        <motion.button
          type="button"
          onClick={(e) => { e.stopPropagation(); enter(); }}
          aria-label={skin.enterLabel}
          initial={intro ? { opacity: 0, scale: 0.5, rotate: -2 } : false}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          transition={{ type: 'spring', damping: 11, stiffness: 360, delay: intro ? 1.0 : 0 }}
          whileTap={{ scale: 0.94 }}
          className="relative self-center"
        >
          <motion.span aria-hidden className="absolute left-1/2 top-1/2 -z-10 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2" animate={bold ? { rotate: 360 } : undefined} transition={bold ? { duration: 16, repeat: Infinity, ease: 'linear' } : undefined}>
            <StarBurst className="h-full w-full opacity-95" />
          </motion.span>
          <Torn fill="var(--color-primary)" variant={0}>
            <div className="flex items-center gap-3 px-8 py-3">
              <Mask className="h-7 w-12 shrink-0" />
              <span className="text-2xl font-black tracking-widest text-white" style={ink()}>{skin.enterLabel}</span>
            </div>
          </Torn>
        </motion.button>

        <motion.div initial={intro ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: intro ? 1.4 : 0 }} className="mt-3 self-center text-[11px] tracking-widest text-white/45">
          {intro ? '轻点跳过' : '轻点面具 · 潜入'}
        </motion.div>
      </div>
    </motion.div>
  );
};
