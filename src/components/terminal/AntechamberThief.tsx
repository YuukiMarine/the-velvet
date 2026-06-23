/**
 * AntechamberThief — F3 玄关「怪盗 channel」皮肤（红主题，Persona 5 拟物风）。
 *
 * 不复用通用件，专门按 P5 视觉语言手搓：撕纸拼贴横幅(clip-path 锯齿 + 白描边 + 偏移黑影)、
 * halftone 网点出血、速度线、描边贴纸大字、面具/星爆「潜入」按钮。觉醒文字以「预告状砸下」
 * 的方式逐条 slam-in（红主题 overshoot）。可点击跳过、本会话只全播一次、D0 直接出静态。
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

// 本会话是否已全播过觉醒（整页刷新重置）
let _thiefIntroSeen = false;

// ── 撕纸锯齿多边形（几种变体，制造不规则手撕边） ──
const TORN = [
  'polygon(0.5% 14%, 16% 3%, 38% 10%, 60% 1%, 82% 9%, 99.5% 4%, 98% 40%, 100% 72%, 96% 97%, 70% 88%, 44% 99%, 22% 90%, 3% 98%, 1% 60%, 2% 32%)',
  'polygon(1% 8%, 22% 0.5%, 50% 7%, 74% 0%, 99% 10%, 97% 44%, 99% 78%, 92% 99%, 64% 92%, 38% 100%, 14% 91%, 0.5% 96%, 2% 56%, 0% 28%)',
  'polygon(0% 10%, 20% 2%, 46% 8%, 68% 0.5%, 90% 6%, 100% 34%, 98% 66%, 99% 94%, 76% 90%, 50% 99%, 26% 91%, 6% 99%, 1% 62%, 3% 30%)',
];

/** 一张撕纸横幅：白描边 + 偏移黑影 + 锯齿裁切 */
const Torn = ({
  children,
  fill,
  variant = 0,
  className,
}: {
  children: React.ReactNode;
  fill: string;
  variant?: number;
  className?: string;
}) => {
  const clip = TORN[variant % TORN.length];
  return (
    <div className={`relative ${className ?? ''}`} style={{ filter: 'drop-shadow(3px 4px 0 rgba(0,0,0,0.6))' }}>
      <div aria-hidden className="absolute inset-0 bg-white" style={{ clipPath: clip }} />
      <div aria-hidden className="absolute inset-[3px]" style={{ clipPath: clip, background: fill }} />
      <div className="relative">{children}</div>
    </div>
  );
};

/** P5 描边贴纸大字 */
const inkText = (stroke = '#000', shadow = true): React.CSSProperties => ({
  WebkitTextStroke: `1.2px ${stroke}`,
  textShadow: shadow ? '2px 3px 0 rgba(0,0,0,0.35)' : undefined,
  letterSpacing: '0.01em',
});

/** 尖星爆 */
const StarBurst = ({ className }: { className?: string }) => {
  const pts: string[] = [];
  const spikes = 11;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 50 : 26;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`);
  }
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <polygon points={pts.join(' ')} fill="#fff" stroke="#000" strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
};

/** 怪盗面具（白描边黑角，尖耳分明） */
const Mask = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 64" className={className} aria-hidden>
    <path
      d="M6 20 Q2 6 20 9 L40 16 Q50 22 60 22 Q70 22 80 16 L100 9 Q118 6 114 20 Q112 40 86 40 Q70 40 62 30 L60 28 L58 30 Q50 40 34 40 Q8 40 6 20 Z"
      fill="#0a0a0a"
      stroke="#fff"
      strokeWidth={4}
      strokeLinejoin="round"
    />
    {/* 眼孔 */}
    <path d="M22 20 L40 22 Q34 30 26 28 Q18 26 22 20 Z" fill="#fff" />
    <path d="M98 20 L80 22 Q86 30 94 28 Q102 26 98 20 Z" fill="#fff" />
  </svg>
);

export const AntechamberThief = ({ skin, onEnter, onBack }: Props) => {
  const user = useAppStore((s) => s.user);
  const bold = useBoldness();
  const [phase, setPhase] = useState<'intro' | 'rest'>(() => (bold && !_thiefIntroSeen ? 'intro' : 'rest'));
  const intro = phase === 'intro';

  useEffect(() => {
    if (!intro) return;
    _thiefIntroSeen = true;
    const total = skin.awaken.length * 420 + 1100;
    const t = setTimeout(() => setPhase('rest'), total);
    return () => clearTimeout(t);
  }, [intro, skin.awaken.length]);

  const enter = () => {
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    onEnter();
  };

  // slam-in：从放大+旋转 overshoot 砸到位（红 channel 的攻击感）；rest 为该件最终静止倾角
  const slam = (i: number, rest = 0) =>
    intro
      ? {
          initial: { opacity: 0, scale: 1.5, rotate: rest - 9, x: -24 },
          animate: { opacity: 1, scale: 1, rotate: rest, x: 0 },
          transition: { type: 'spring' as const, damping: 13, stiffness: 340, delay: 0.25 + i * 0.42 },
        }
      : { initial: false as const, animate: { opacity: 1, scale: 1, rotate: rest, x: 0 }, transition: { duration: 0.12 } };

  const enterDelay = intro ? 0.25 + skin.awaken.length * 0.42 + 0.2 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: bold ? 0.3 : 0.15 }}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden bg-[#070707] px-6"
      onClick={() => intro && setPhase('rest')}
    >
      {/* 红色网点出血（右上角，呼应首页角色稿位） */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[60%] w-[78%]"
        style={{ background: 'radial-gradient(120% 100% at 100% 0%, var(--color-primary) 0%, color-mix(in srgb, var(--color-primary) 55%, #000) 42%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[60%] w-[78%]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.55) 1.2px, transparent 1.6px)',
          backgroundSize: '7px 7px',
          WebkitMaskImage: 'radial-gradient(120% 100% at 100% 0%, #000 0%, transparent 62%)',
          maskImage: 'radial-gradient(120% 100% at 100% 0%, #000 0%, transparent 62%)',
        }}
      />
      {/* 左下角网点出血 */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-[40%] w-[55%]"
        style={{ background: 'radial-gradient(120% 100% at 0% 100%, color-mix(in srgb, var(--color-primary) 70%, #000) 0%, transparent 62%)' }}
      />
      {/* 速度线（几道斜白条，极淡） */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]">
        {[12, 30, 58, 80].map((left, i) => (
          <div key={i} className="absolute top-[-20%] h-[140%] w-[2px] bg-white" style={{ left: `${left}%`, transform: `rotate(-18deg)` }} />
        ))}
      </div>

      {/* 返回 */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onBack(); }}
        aria-label="返回"
        className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      {/* ── 拼贴主体 ── */}
      <div className="relative z-[1] flex w-full max-w-sm flex-col items-stretch gap-3">
        {/* 台标横幅 */}
        <motion.div {...slam(0, -3)} className="self-start">
          <Torn fill="var(--color-primary)" variant={1}>
            <div className="px-5 py-1.5 text-sm font-black tracking-[2px] text-white" style={inkText('#000', false)}>
              ★ {skin.label}
            </div>
          </Torn>
        </motion.div>

        {/* 觉醒文字：逐条砸下 */}
        {skin.awaken.map((line, i) => (
          <motion.div
            key={i}
            {...slam(i + 1, i % 2 === 0 ? -1.5 : 2)}
            className={i % 2 === 0 ? 'self-stretch' : 'self-end'}
          >
            <Torn fill={i % 2 === 1 ? 'var(--color-primary)' : '#0a0a0a'} variant={i}>
              <div className="px-5 py-3 text-2xl font-black leading-snug text-white" style={inkText('#000')}>
                {line}
              </div>
            </Torn>
          </motion.div>
        ))}

        {/* 进入：面具 + 星爆 + 潜入 大按钮 */}
        <motion.button
          type="button"
          onClick={(e) => { e.stopPropagation(); enter(); }}
          aria-label={skin.enterLabel}
          initial={intro ? { opacity: 0, scale: 0.6, rotate: -2 } : false}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          transition={{ type: 'spring', damping: 12, stiffness: 360, delay: enterDelay }}
          whileTap={{ scale: 0.94 }}
          className="relative mt-4 self-center"
        >
          {/* 星爆光环（呼吸） */}
          <motion.span
            aria-hidden
            className="absolute left-1/2 top-1/2 -z-10 h-[160%] w-[160%] -translate-x-1/2 -translate-y-1/2"
            animate={bold ? { rotate: 360, scale: [1, 1.06, 1] } : undefined}
            transition={bold ? { rotate: { duration: 18, repeat: Infinity, ease: 'linear' }, scale: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } } : undefined}
          >
            <StarBurst className="h-full w-full opacity-90" />
          </motion.span>
          <Torn fill="var(--color-primary)" variant={2}>
            <div className="flex items-center gap-3 px-7 py-3">
              <Mask className="h-7 w-12 shrink-0" />
              <span className="text-2xl font-black tracking-widest text-white" style={inkText('#000')}>
                {skin.enterLabel}
              </span>
            </div>
          </Torn>
        </motion.button>

        <motion.div
          initial={intro ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ delay: enterDelay + 0.3 }}
          className="self-center text-[11px] tracking-widest text-white/45"
        >
          {intro ? '轻点跳过' : '轻点面具 · 潜入'}
        </motion.div>
      </div>
    </motion.div>
  );
};
