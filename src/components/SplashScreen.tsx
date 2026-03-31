import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

type SplashStyle = 'velvet' | 'p5' | 'p3' | 'p4';
type SplashSpeedOption = 'fast' | 'normal' | 'slow';

const SPEED_MULT: Record<SplashSpeedOption, number> = { fast: 0.55, normal: 1, slow: 1.65 };

export interface SplashScreenProps {
  isVisible: boolean;
  onComplete: () => void;
  splashStyle?: SplashStyle;
  splashSpeed?: SplashSpeedOption;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. VELVET (original dark-indigo style)
// ─────────────────────────────────────────────────────────────────────────────
function VelvetSplash({ onComplete, s }: { onComplete: () => void; s: number }) {
  const [showText, setShowText] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowText(true),    300  * s);
    const t2 = setTimeout(() => setShowSubtitle(true), 800  * s);
    const t3 = setTimeout(onComplete,                  2500 * s);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete, s]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#0b061a] via-[#1a0b2e] to-black flex items-center justify-center z-50 overflow-hidden">
      <style>{`
        @keyframes vr-slide-ltr { from { transform:translateX(-30%); } to { transform:translateX(10%); } }
        @keyframes vr-slide-rtl { from { transform:translateX(10%); }  to { transform:translateX(-30%); } }
        .vr-top { animation: vr-slide-ltr ${2.5 * s}s linear forwards; white-space:nowrap;
          font-size:clamp(5rem,22vw,14rem); font-weight:900; font-style:italic;
          color:transparent; -webkit-text-stroke:1px rgba(255,255,255,0.55);
          letter-spacing:-0.02em; line-height:1; }
        .vr-btm { animation: vr-slide-rtl ${2.5 * s}s linear forwards; white-space:nowrap;
          font-size:clamp(5rem,22vw,14rem); font-weight:900; font-style:italic;
          color:transparent; -webkit-text-stroke:1px rgba(255,255,255,0.55);
          letter-spacing:-0.02em; line-height:1; }
      `}</style>

      <div className="absolute top-[8%] left-0 right-0 overflow-hidden pointer-events-none select-none">
        <div className="vr-top">THE VELVET</div>
      </div>
      <div className="absolute bottom-[8%] left-0 right-0 overflow-hidden pointer-events-none select-none">
        <div className="vr-btm">THE VELVET</div>
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(18)].map((_, i) => (
          <motion.div key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ y: [0, -120], scale: [0, 1, 0], opacity: [0, 0.7, 0] }}
            transition={{ duration: (1.8 + (i % 5) * 0.4) * s, repeat: Infinity, delay: (i * 0.14) * s }}
            className="absolute w-1.5 h-1.5 bg-white rounded-full"
            style={{ left: `${(i * 17 + 5) % 95}%`, top: `${(i * 23 + 10) % 90}%` }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center px-6">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', duration: 1 * s, damping: 20, stiffness: 100 }}
          className="mb-8"
        >
          <motion.div
            animate={{ scale: [1, 1.08, 1], rotate: [0, 4, -4, 0] }}
            transition={{ duration: 2 * s, repeat: Infinity, repeatType: 'reverse' }}
            className="text-6xl font-bold text-white"
          >
            靛蓝色房间
          </motion.div>
        </motion.div>

        <motion.div
          animate={{ opacity: showText ? 1 : 0, y: showText ? 0 : 20 }}
          transition={{ duration: 0.8 * s }}
          className="text-2xl font-semibold text-white mb-2"
        >
          个人成长追踪器
        </motion.div>

        <motion.div
          animate={{ opacity: showSubtitle ? 1 : 0, y: showSubtitle ? 0 : 20 }}
          transition={{ duration: 0.8 * s, delay: 0.2 * s }}
          className="text-lg text-white/80"
        >
          愿您成为最棒的客人
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 * s }}
          className="mt-8 flex justify-center gap-2"
        >
          {[0, 1, 2].map(i => (
            <motion.div key={i}
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1 * s, repeat: Infinity, delay: i * 0.2 * s }}
              className="w-3 h-3 bg-white rounded-full"
            />
          ))}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 * s }}
        className="absolute bottom-8 left-0 right-0 text-center"
      >
        <p className="text-white/60 text-sm">正在启动应用...</p>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. P5 — Persona 5 "Phantom Thief" style
//    Black bg + red slash + cut-out ransom-letter blocks + sharp springs
// ─────────────────────────────────────────────────────────────────────────────
function P5Splash({ onComplete, s }: { onComplete: () => void; s: number }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2100 * s);
    return () => clearTimeout(timer);
  }, [onComplete, s]);

  const slam = (dir: number, delay: number) => ({
    initial: { x: dir * 260, rotate: dir * -6, opacity: 0 },
    animate: { x: 0, rotate: dir * 4, opacity: 1 },
    transition: { delay: delay * s, duration: 0.35 * s, type: 'spring' as const, stiffness: 380, damping: 22 },
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: '#080808' }}>
      {/* Red diagonal band */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.28 * s, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: 'left center', background: 'linear-gradient(135deg,#cc0018 0%,#8b0012 100%)' }}
        className="absolute inset-0"
      />

      {/* Halftone dot overlay */}
      <div className="absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'radial-gradient(circle,#000 1.5px,transparent 1.5px)', backgroundSize: '14px 14px' }}
      />

      {/* Diagonal slash accent line */}
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ delay: 0.1 * s, duration: 0.2 * s, ease: 'easeOut' }}
        style={{ transformOrigin: 'left center' }}
        className="absolute top-[42%] left-0 right-0 h-[3px] bg-black/40 rotate-[-8deg]"
      />

      {/* Title blocks */}
      <div className="absolute inset-0 flex items-center justify-center gap-3">
        <motion.div {...slam(-1, 0.14)}
          className="bg-black px-5 py-3 font-black text-white leading-none select-none"
          style={{ fontSize: 'clamp(2.4rem,10vw,4rem)', fontFamily: '"Impact","Arial Black",sans-serif', letterSpacing: '-0.02em' }}
        >
          靛蓝色
        </motion.div>
        <motion.div {...slam(1, 0.22)}
          className="bg-white px-5 py-3 font-black text-black leading-none select-none"
          style={{ fontSize: 'clamp(2.4rem,10vw,4rem)', fontFamily: '"Impact","Arial Black",sans-serif', letterSpacing: '-0.02em' }}
        >
          房间
        </motion.div>
      </div>

      {/* Subtitle */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.48 * s, duration: 0.28 * s }}
        className="absolute bottom-[30%] left-0 right-0 text-center text-white font-black text-xs tracking-[0.42em] uppercase"
      >
        VELVET ROOM
      </motion.div>

      {/* ✦ Star sparks */}
      {[{ top: '18%', left: '12%', d: 0.40 }, { top: '72%', right: '10%', d: 0.50 }, { top: '24%', right: '18%', d: 0.36 }].map((p, i) => (
        <motion.div key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 0.8] }}
          transition={{ delay: p.d * s, duration: 0.22 * s, type: 'spring', stiffness: 500 }}
          className="absolute text-white font-black text-2xl pointer-events-none select-none"
          style={{ top: p.top, left: (p as { left?: string }).left, right: (p as { right?: string }).right }}
        >✦</motion.div>
      ))}

      {/* Fade to black */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.65 * s, duration: 0.38 * s }}
        className="absolute inset-0 bg-black pointer-events-none"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. P3 — Persona 3 "Memento Mori" style
//    Dark navy, rising moon, elegant atmosphere
// ─────────────────────────────────────────────────────────────────────────────
function P3Splash({ onComplete, s }: { onComplete: () => void; s: number }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2800 * s);
    return () => clearTimeout(timer);
  }, [onComplete, s]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center"
      style={{ background: 'linear-gradient(180deg,#04090f 0%,#0a1628 60%,#0d1f3a 100%)' }}>

      {/* Blue radial glow at bottom */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.35, scale: 1.4 }}
        transition={{ duration: 2.2 * s, ease: 'easeOut' }}
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70vw] h-[50vh] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse,#1e4a8a 0%,transparent 70%)' }}
      />

      {/* Rising moon */}
      <motion.div
        initial={{ y: 200, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.3 * s, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="absolute"
        style={{ bottom: '18%', left: '50%', transform: 'translateX(-50%)' }}
      >
        <div className="rounded-full bg-white shadow-[0_0_60px_16px_rgba(180,210,255,0.35)]"
          style={{ width: 'clamp(80px,22vw,130px)', height: 'clamp(80px,22vw,130px)' }} />
      </motion.div>

      {/* Clock hands on moon */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.35, 0] }}
        transition={{ delay: 0.5 * s, duration: 1.2 * s, times: [0, 0.3, 1] }}
        className="absolute pointer-events-none"
        style={{ bottom: '18%', left: '50%', transform: 'translateX(-50%)', width: 'clamp(80px,22vw,130px)', height: 'clamp(80px,22vw,130px)' }}
      >
        {/* Hour hand */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4 * s, ease: 'linear' }}
          className="absolute top-1/2 left-1/2 origin-bottom bg-[#0a1628] rounded-full"
          style={{ width: 3, height: '30%', marginLeft: -1.5, marginTop: '-30%' }}
        />
        {/* Minute hand */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 0.9 * s, ease: 'linear' }}
          className="absolute top-1/2 left-1/2 origin-bottom bg-[#0a1628] rounded-full"
          style={{ width: 2, height: '40%', marginLeft: -1, marginTop: '-40%' }}
        />
      </motion.div>

      {/* Floating blue particles */}
      {[...Array(9)].map((_, i) => (
        <motion.div key={i}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: [-10, -180 - i * 20], opacity: [0, 0.65, 0] }}
          transition={{ delay: (0.3 + i * 0.12) * s, duration: (1.8 + i * 0.2) * s, ease: 'easeOut' }}
          className="absolute rounded-full pointer-events-none"
          style={{
            bottom: `${18 + (i % 3) * 8}%`,
            left: `${38 + (i * 7) % 26}%`,
            width: i % 3 === 0 ? 5 : 3,
            height: i % 3 === 0 ? 5 : 3,
            background: i % 2 === 0 ? '#7ab3e8' : '#c8dff8',
          }}
        />
      ))}

      {/* MEMENTO MORI */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 * s, duration: 0.9 * s, ease: 'easeOut' }}
        className="absolute text-white/60 font-bold tracking-[0.5em] uppercase select-none"
        style={{ top: '22%', left: 0, right: 0, textAlign: 'center', fontSize: 'clamp(0.65rem,2.5vw,0.85rem)' }}
      >
        MEMENTO MORI
      </motion.div>

      {/* App title */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 * s, duration: 0.9 * s }}
        className="relative z-10 text-center select-none"
        style={{ marginTop: '-8vh' }}
      >
        <div className="text-white font-bold tracking-[0.12em]"
          style={{ fontSize: 'clamp(1.6rem,7vw,2.4rem)', textShadow: '0 0 40px rgba(120,170,240,0.5)' }}>
          靛蓝色房间
        </div>
        <div className="text-white/50 text-xs tracking-[0.3em] mt-2 uppercase">Velvet Room</div>
      </motion.div>

      {/* Fade to black */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.3 * s, duration: 0.45 * s }}
        className="absolute inset-0 bg-black pointer-events-none"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. P4 — Persona 4 "Investigation" style
//    Bright yellow + color stripes + CAUTION tape + bold black type
// ─────────────────────────────────────────────────────────────────────────────
function P4Splash({ onComplete, s }: { onComplete: () => void; s: number }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2200 * s);
    return () => clearTimeout(timer);
  }, [onComplete, s]);

  const STRIPES = ['#4caf72', '#e87030', '#3292d8', '#f4cc0a'];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center"
      style={{ background: '#f4cc0a' }}>

      {/* Yellow BG wipe from left */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.32 * s, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: 'left center', background: '#f4cc0a' }}
        className="absolute inset-0"
      />

      {/* Vertical color stripes on left edge */}
      {STRIPES.map((color, i) => (
        <motion.div key={i}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: (0.22 + i * 0.055) * s, duration: 0.22 * s, ease: 'easeOut' }}
          className="absolute top-0 bottom-0"
          style={{ left: 8 + i * 10, width: 7, background: color }}
        />
      ))}

      {/* Diagonal CAUTION tape */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.38 * s, duration: 0.22 * s }}
        className="absolute left-0 right-0 overflow-hidden pointer-events-none select-none"
        style={{ top: '58%', transform: 'rotate(-10deg)' }}
      >
        <div className="bg-black text-[#f4cc0a] font-black tracking-[0.22em] uppercase whitespace-nowrap py-2 px-4 overflow-hidden"
          style={{ fontSize: 'clamp(0.6rem,2vw,0.85rem)' }}>
          {'CAUTION  DANGER  CAUTION  DANGER  CAUTION  DANGER  CAUTION  DANGER  CAUTION  '}
        </div>
      </motion.div>

      {/* Second diagonal tape (lower) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.44 * s, duration: 0.22 * s }}
        className="absolute left-0 right-0 overflow-hidden pointer-events-none select-none"
        style={{ top: '65%', transform: 'rotate(-10deg)' }}
      >
        <div className="bg-black/85 text-[#f4cc0a] font-black tracking-[0.22em] uppercase whitespace-nowrap py-1.5 px-4 overflow-hidden"
          style={{ fontSize: 'clamp(0.5rem,1.6vw,0.7rem)' }}>
          {'VELVET ROOM  VELVET ROOM  VELVET ROOM  VELVET ROOM  VELVET ROOM  VELVET ROOM  '}
        </div>
      </motion.div>

      {/* Main title */}
      <motion.div
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.48 * s, duration: 0.42 * s, type: 'spring', stiffness: 340, damping: 26 }}
        className="relative z-10 text-center select-none"
        style={{ marginTop: '-12vh' }}
      >
        <div className="text-black font-black leading-none"
          style={{ fontSize: 'clamp(2.4rem,11vw,3.8rem)', fontFamily: '"Impact","Arial Black",sans-serif', letterSpacing: '-0.02em' }}>
          靛蓝色房间
        </div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.75 * s, duration: 0.3 * s }}
          className="text-black font-black text-xs tracking-[0.35em] uppercase mt-2"
        >
          VELVET ROOM
        </motion.div>
      </motion.div>

      {/* p4-style corner badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.72 * s, duration: 0.22 * s, type: 'spring', stiffness: 420 }}
        className="absolute bottom-10 right-8 flex flex-col items-end select-none"
      >
        <div className="bg-black text-[#f4cc0a] font-black px-2 py-0.5 text-[10px] tracking-widest uppercase">
          VELVET
        </div>
        <div className="bg-[#f4cc0a] border-2 border-black text-black font-black px-2 py-0.5 text-[10px] tracking-widest">
          ROOM
        </div>
      </motion.div>

      {/* Fade-out: yellow → white → black */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.75 * s, duration: 0.38 * s }}
        className="absolute inset-0 bg-black pointer-events-none"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export const SplashScreen = ({ isVisible, onComplete, splashStyle = 'velvet', splashSpeed = 'normal' }: SplashScreenProps) => {
  // Capture style on first render so it doesn't change mid-animation
  const styleRef = useRef<SplashStyle>(splashStyle);
  const s = SPEED_MULT[splashSpeed];

  if (!isVisible) return null;

  const style = styleRef.current;
  if (style === 'p5') return <P5Splash onComplete={onComplete} s={s} />;
  if (style === 'p3') return <P3Splash onComplete={onComplete} s={s} />;
  if (style === 'p4') return <P4Splash onComplete={onComplete} s={s} />;
  return <VelvetSplash onComplete={onComplete} s={s} />;
};
