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
    <div className="fixed inset-0 bg-gradient-to-br from-[#0b061a] via-[#1a0b2e] to-black flex items-center justify-center z-50 overflow-hidden" style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'strict' }}>
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
//    Aggressive red/black/white, ransom-letter blocks, halftone, diagonal
//    slashes, stepped frame-skip animations, manga panel cuts
// ─────────────────────────────────────────────────────────────────────────────

// Pre-computed diagonal slash lines
const P5_SLASHES = [
  { x1: -15, y1: 18, x2: 115, y2: 42, w: 4, delay: 0.32, color: '#000' },
  { x1: -10, y1: 55, x2: 110, y2: 38, w: 3, delay: 0.36, color: '#fff' },
  { x1: -5, y1: 75, x2: 105, y2: 60, w: 5, delay: 0.40, color: '#000' },
  { x1: 20, y1: -5, x2: 45, y2: 105, w: 3, delay: 0.44, color: '#fff' },
  { x1: 60, y1: -5, x2: 85, y2: 105, w: 2, delay: 0.42, color: '#000' },
];

// Angular black panel shapes that fly in (like manga panels / cityscape silhouettes)
// Kept as thin edge strips so the red + title remain prominent
const P5_PANELS = [
  { clip: 'polygon(0 0, 14% 0, 8% 100%, 0 100%)', from: -80, delay: 0.18, bg: '#0a0a0a' },
  { clip: 'polygon(100% 0, 86% 0, 92% 100%, 100% 100%)', from: 80, delay: 0.22, bg: '#0a0a0a' },
  { clip: 'polygon(0 0, 100% 0, 100% 12%, 0 18%)', from: -60, delay: 0.26, bg: '#0a0a0aCC' },
  { clip: 'polygon(0 85%, 100% 80%, 100% 100%, 0 100%)', from: 60, delay: 0.30, bg: '#0a0a0aCC' },
];

// Ink splatter / paint marks (SVG paths)
const P5_SPLATTERS = [
  { d: 'M10,20 Q15,5 30,18 Q40,8 35,25 Q45,30 30,35 Q20,40 15,30 Z', top: '12%', left: '8%', size: 60, delay: 0.55, rot: -15 },
  { d: 'M5,15 Q10,2 25,12 Q35,5 32,20 Q40,28 25,30 Q12,35 8,22 Z', top: '70%', right: '6%', size: 50, delay: 0.60, rot: 25 },
  { d: 'M8,18 Q20,3 28,15 Q38,10 35,22 Q42,32 28,35 Q15,38 10,25 Z', top: '82%', left: '15%', size: 45, delay: 0.65, rot: -8 },
  { d: 'M12,22 Q18,5 32,16 Q42,8 38,24 Q48,32 32,38 Q18,42 14,28 Z', top: '8%', right: '20%', size: 55, delay: 0.58, rot: 40 },
];

// Stepped "strobe" keyframe indices for frame-skipping effect
const P5_STROBE_FRAMES = [0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1];

function P5Splash({ onComplete, s }: { onComplete: () => void; s: number }) {
  const [phase, setPhase] = useState(0);
  // 0: black + strobe flash
  // 1: red wipe + halftone + panels fly in
  // 2: title blocks slam in (frame-skipped)
  // 3: decorative elements + subtitle
  // 4: slash-cut exit

  const [strobeIdx, setStrobeIdx] = useState(0);

  useEffect(() => {
    const t0 = setTimeout(() => setPhase(1), 120 * s);
    const t1 = setTimeout(() => setPhase(2), 480 * s);
    const t2 = setTimeout(() => setPhase(3), 900 * s);
    const t3 = setTimeout(() => setPhase(4), 1800 * s);
    const t4 = setTimeout(onComplete, 2600 * s);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [onComplete, s]);

  // Strobe flash effect — rapid on/off in phase 0
  useEffect(() => {
    if (phase !== 0) return;
    const interval = setInterval(() => {
      setStrobeIdx(prev => (prev + 1) % P5_STROBE_FRAMES.length);
    }, 35 * s);
    return () => clearInterval(interval);
  }, [phase, s]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: '#080808', transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'strict' }}>
      <style>{`
        @keyframes p5-halftone-drift {
          0% { background-position: 0 0; }
          100% { background-position: 28px 28px; }
        }
        @keyframes p5-stripe-scroll {
          0% { background-position: 0 0; }
          100% { background-position: 40px 40px; }
        }
        @keyframes p5-jitter {
          0%  { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-2px, 1px) rotate(-0.4deg); }
          50% { transform: translate(1px, -1px) rotate(0.3deg); }
          75% { transform: translate(-1px, -1px) rotate(-0.2deg); }
        }
        @keyframes p5-title-slam {
          0% { transform: translateX(var(--p5-slam-from)) rotate(var(--p5-slam-rot-start)) scale(1.4); opacity: 0; }
          30% { transform: translateX(calc(var(--p5-slam-from) * -0.15)) rotate(var(--p5-slam-rot-end)) scale(1.05); opacity: 1; }
          45% { transform: translateX(calc(var(--p5-slam-from) * 0.05)) rotate(var(--p5-slam-rot-end)) scale(0.98); opacity: 1; }
          55% { transform: translateX(0) rotate(var(--p5-slam-rot-end)) scale(1); opacity: 1; }
          100% { transform: translateX(0) rotate(var(--p5-slam-rot-end)) scale(1); opacity: 1; }
        }
        @keyframes p5-slash-draw {
          0% { stroke-dashoffset: 1; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes p5-exit-slash {
          0% { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); }
          40% { clip-path: polygon(0 0, 65% 0, 45% 100%, 0 100%); }
          100% { clip-path: polygon(0 0, 120% 0, 100% 100%, 0 100%); }
        }
        .p5-title-block-left {
          animation: p5-title-slam ${0.35 * s}s steps(6) forwards;
          --p5-slam-from: -140%;
          --p5-slam-rot-start: 8deg;
          --p5-slam-rot-end: -3.5deg;
        }
        .p5-title-block-right {
          animation: p5-title-slam ${0.35 * s}s steps(6) forwards;
          animation-delay: ${0.08 * s}s;
          --p5-slam-from: 140%;
          --p5-slam-rot-start: -8deg;
          --p5-slam-rot-end: 4deg;
        }
        .p5-title-block-sub {
          animation: p5-title-slam ${0.3 * s}s steps(5) forwards;
          animation-delay: ${0.18 * s}s;
          --p5-slam-from: 160%;
          --p5-slam-rot-start: -6deg;
          --p5-slam-rot-end: -2.5deg;
        }
        .p5-exit-mask {
          animation: p5-exit-slash ${0.4 * s}s steps(8) forwards;
        }
        .p5-jitter {
          animation: p5-jitter ${1.0 * s}s steps(4, jump-none) infinite;
        }
      `}</style>

      {/* ── Phase 0: Black + red strobe flash ── */}
      {phase === 0 && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: P5_STROBE_FRAMES[strobeIdx] ? '#cc0018' : '#080808',
            transition: 'none',
          }}
        />
      )}

      {/* ── Phase 1+: Red background reveal — angular diagonal wipe ── */}
      <motion.div
        initial={{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }}
        animate={phase >= 1
          ? { clipPath: 'polygon(0 0, 120% 0, 100% 100%, 0 100%)' }
          : {}}
        transition={{ duration: 0.3 * s, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0"
        style={{ background: 'linear-gradient(145deg, #cc0018 0%, #a30014 50%, #8b0012 100%)' }}
      />

      {/* ── Black zigzag lightning bolt decoration (P5 style, extends gradually) ── */}
      {phase >= 1 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Large upper-left zigzag bolt */}
          <motion.svg
            viewBox="0 0 400 600"
            preserveAspectRatio="none"
            className="absolute"
            style={{ top: '-8%', left: '-12%', width: '75%', height: '60%' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 * s, duration: 0.1 * s }}
          >
            <motion.path
              d="M160,0 L340,0 L290,90 L400,90 L170,320 L250,190 L110,190 L210,60 L90,60 Z"
              fill="#0a0a0a"
              initial={{ clipPath: 'inset(0 100% 0 0)' }}
              animate={{ clipPath: 'inset(0 0% 0 0)' }}
              transition={{ delay: 0.22 * s, duration: 0.45 * s, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.svg>

          {/* Mid-right zigzag bolt */}
          <motion.svg
            viewBox="0 0 400 600"
            preserveAspectRatio="none"
            className="absolute"
            style={{ top: '25%', right: '-12%', width: '65%', height: '55%' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.32 * s, duration: 0.1 * s }}
          >
            <motion.path
              d="M320,0 L400,140 L290,140 L380,320 L200,320 L300,170 L180,170 L280,20 Z"
              fill="#0a0a0a"
              initial={{ clipPath: 'inset(0 0 100% 0)' }}
              animate={{ clipPath: 'inset(0 0 0% 0)' }}
              transition={{ delay: 0.32 * s, duration: 0.5 * s, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.svg>

          {/* Lower-left zigzag bolt */}
          <motion.svg
            viewBox="0 0 400 600"
            preserveAspectRatio="none"
            className="absolute"
            style={{ bottom: '-8%', left: '-8%', width: '60%', height: '50%' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.42 * s, duration: 0.1 * s }}
          >
            <motion.path
              d="M60,450 L200,220 L110,220 L240,0 L310,0 L170,230 L280,230 L90,530 Z"
              fill="#0a0a0a"
              initial={{ clipPath: 'inset(100% 0 0 0)' }}
              animate={{ clipPath: 'inset(0% 0 0 0)' }}
              transition={{ delay: 0.42 * s, duration: 0.55 * s, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.svg>

          {/* Small decorative star outlines (like in p5-3.jpg) */}
          {[
            { cx: '28%', cy: '32%', size: 20, delay: 0.55 },
            { cx: '72%', cy: '44%', size: 16, delay: 0.62 },
            { cx: '42%', cy: '60%', size: 14, delay: 0.68 },
            { cx: '16%', cy: '74%', size: 18, delay: 0.60 },
          ].map((star, i) => (
            <motion.svg key={i}
              className="absolute pointer-events-none"
              style={{ left: star.cx, top: star.cy, width: star.size, height: star.size }}
              viewBox="0 0 24 24"
              initial={{ scale: 0, opacity: 0, rotate: -30 }}
              animate={{ scale: [0, 1.6, 1], opacity: [0, 1, 0.8], rotate: [-30, 10, 0] }}
              transition={{ delay: star.delay * s, duration: 0.2 * s, ease: [0.22, 1, 0.36, 1] }}
            >
              <path d="M12,2 L14.5,8.5 L21,9.5 L16,14 L17.5,21 L12,17.5 L6.5,21 L8,14 L3,9.5 L9.5,8.5 Z"
                fill="none" stroke="#0a0a0a" strokeWidth="2" />
            </motion.svg>
          ))}
        </div>
      )}

      {/* ── Halftone dot pattern (prominent, drifting) ── */}
      {phase >= 1 && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, #000 1.8px, transparent 1.8px)',
            backgroundSize: '12px 12px',
            opacity: 0.12,
            animation: `p5-halftone-drift ${2.5 * s}s linear infinite`,
          }}
        />
      )}

      {/* ── Diagonal stripe overlay ── */}
      {phase >= 1 && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 18px, rgba(0,0,0,0.06) 18px, rgba(0,0,0,0.06) 20px)',
            animation: `p5-stripe-scroll ${1.8 * s}s linear infinite`,
          }}
        />
      )}

      {/* ── Angular black panels — manga-style silhouette shapes ── */}
      {P5_PANELS.map((panel, i) => (
        <motion.div key={i}
          initial={{ x: panel.from, opacity: 0 }}
          animate={phase >= 1 ? { x: 0, opacity: 1 } : {}}
          transition={{
            delay: panel.delay * s,
            duration: 0.25 * s,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="absolute inset-0 pointer-events-none"
          style={{ clipPath: panel.clip, background: panel.bg }}
        />
      ))}

      {/* ── Jagged city-scape silhouette strip (mid-screen) ── */}
      {phase >= 1 && (
        <motion.div
          initial={{ opacity: 0, x: -60 }}
          animate={{ opacity: 0.25, x: 0 }}
          transition={{ delay: 0.35 * s, duration: 0.3 * s, ease: [0.22, 1, 0.36, 1] }}
          className="absolute pointer-events-none"
          style={{ top: '38%', left: 0, right: 0, height: '24%' }}
        >
          <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0,80 L0,55 L15,55 L15,30 L25,30 L25,45 L35,45 L35,20 L50,20 L50,35 L55,35 L55,10 L65,10 L65,40 L80,40 L80,25 L95,25 L95,50 L105,50 L105,15 L115,15 L115,35 L125,35 L125,55 L140,55 L140,22 L155,22 L155,38 L165,38 L165,12 L180,12 L180,45 L195,45 L195,28 L210,28 L210,50 L220,50 L220,18 L235,18 L235,42 L250,42 L250,30 L260,30 L260,52 L275,52 L275,20 L290,20 L290,48 L305,48 L305,15 L320,15 L320,40 L330,40 L330,55 L345,55 L345,25 L360,25 L360,45 L375,45 L375,32 L390,32 L390,50 L400,50 L400,80 Z"
              fill="#0a0a0a" />
          </svg>
        </motion.div>
      )}

      {/* ── Diagonal slash lines ── */}
      {phase >= 1 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
          {P5_SLASHES.map((sl, i) => (
            <motion.line key={i}
              x1={`${sl.x1}%`} y1={`${sl.y1}%`}
              x2={`${sl.x2}%`} y2={`${sl.y2}%`}
              stroke={sl.color}
              strokeWidth={sl.w}
              strokeLinecap="square"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 0.7, 0.5] }}
              transition={{ delay: sl.delay * s, duration: 0.2 * s, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </svg>
      )}

      {/* ── Ink splatters / paint marks ── */}
      {phase >= 3 && P5_SPLATTERS.map((sp, i) => (
        <motion.div key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 1], opacity: [0, 0.85, 0.7] }}
          transition={{ delay: (sp.delay - 0.55) * s, duration: 0.15 * s, ease: [0.22, 1, 0.36, 1] }}
          className="absolute pointer-events-none"
          style={{
            top: sp.top,
            left: (sp as { left?: string }).left,
            right: (sp as { right?: string }).right,
            width: sp.size,
            height: sp.size,
            transform: `rotate(${sp.rot}deg)`,
          }}
        >
          <svg viewBox="0 0 50 50" className="w-full h-full">
            <path d={sp.d} fill="#080808" />
          </svg>
        </motion.div>
      ))}

      {/* ── TITLE BLOCKS — ransom-letter style, frame-skipped slam ── */}
      {phase >= 2 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10 p5-jitter">
          {/* Main title row */}
          <div className="flex items-center gap-2 mb-2">
            {/* 靛蓝色 — white on black block */}
            <div className="p5-title-block-left opacity-0"
              style={{
                background: '#0a0a0a',
                padding: 'clamp(8px, 2vw, 16px) clamp(12px, 3vw, 24px)',
                boxShadow: '6px 6px 0 rgba(0,0,0,0.4), -2px -2px 0 rgba(255,255,255,0.15)',
                border: '3px solid #fff',
              }}>
              <span style={{
                fontSize: 'clamp(2.2rem, 10vw, 4.2rem)',
                fontFamily: '"Impact", "Arial Black", "Noto Sans SC", sans-serif',
                fontWeight: 900,
                color: '#ffffff',
                letterSpacing: '-0.02em',
                lineHeight: 1,
                display: 'block',
                textShadow: '2px 2px 0 #cc0018',
              }}>靛蓝色</span>
            </div>

            {/* 房间 — black on white block */}
            <div className="p5-title-block-right opacity-0"
              style={{
                background: '#ffffff',
                padding: 'clamp(8px, 2vw, 16px) clamp(12px, 3vw, 24px)',
                boxShadow: '-6px 6px 0 rgba(0,0,0,0.4), 2px -2px 0 rgba(204,0,24,0.3)',
                border: '3px solid #0a0a0a',
              }}>
              <span style={{
                fontSize: 'clamp(2.2rem, 10vw, 4.2rem)',
                fontFamily: '"Impact", "Arial Black", "Noto Sans SC", sans-serif',
                fontWeight: 900,
                color: '#0a0a0a',
                letterSpacing: '-0.02em',
                lineHeight: 1,
                display: 'block',
              }}>房间</span>
            </div>
          </div>

          {/* THE VELVET subtitle block — red on black */}
          <div className="p5-title-block-sub opacity-0"
            style={{
              background: '#0a0a0a',
              padding: '4px 20px',
              border: '2px solid #cc0018',
              marginTop: 4,
            }}>
            <span style={{
              fontSize: 'clamp(0.6rem, 2.5vw, 0.9rem)',
              fontFamily: '"Impact", "Arial Black", sans-serif',
              fontWeight: 900,
              color: '#cc0018',
              letterSpacing: '0.45em',
              textTransform: 'uppercase' as const,
            }}>THE VELVET</span>
          </div>
        </div>
      )}

      {/* ── Corner star-burst decorations ── */}
      {phase >= 3 && (
        <>
          {[
            { top: '14%', left: '10%', delay: 0, size: 38, rot: 0 },
            { top: '72%', right: '8%', delay: 0.06, size: 32, rot: 15 },
            { top: '20%', right: '14%', delay: 0.03, size: 28, rot: -10 },
            { top: '80%', left: '12%', delay: 0.09, size: 24, rot: 30 },
          ].map((star, i) => (
            <motion.div key={i}
              initial={{ scale: 0, rotate: star.rot - 45, opacity: 0 }}
              animate={{ scale: [0, 1.8, 1], rotate: [star.rot - 45, star.rot + 10, star.rot], opacity: [0, 1, 0.9] }}
              transition={{ delay: star.delay * s, duration: 0.12 * s, ease: [0.22, 1, 0.36, 1] }}
              className="absolute pointer-events-none select-none"
              style={{
                top: star.top,
                left: (star as { left?: string }).left,
                right: (star as { right?: string }).right,
                width: star.size,
                height: star.size,
              }}
            >
              <svg viewBox="0 0 50 50" className="w-full h-full">
                <path d="M25,0 L29,19 L50,25 L29,31 L25,50 L21,31 L0,25 L21,19 Z" fill="#fff" />
              </svg>
            </motion.div>
          ))}
        </>
      )}

      {/* ── Scattered small text fragments — "THE VELVET" ── */}
      {phase >= 3 && (
        <>
          {[
            { text: 'THE', top: '26%', left: '5%', rot: -12, delay: 0.05 },
            { text: 'VELVET', top: '28%', left: '20%', rot: 5, delay: 0.08 },
            { text: 'THE', top: '66%', right: '5%', rot: -8, delay: 0.10 },
            { text: 'VELVET', top: '68%', right: '18%', rot: 6, delay: 0.13 },
          ].map((frag, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 0.4, scale: 1 }}
              transition={{ delay: frag.delay * s, duration: 0.1 * s, ease: [0.22, 1, 0.36, 1] }}
              className="absolute pointer-events-none select-none"
              style={{
                top: frag.top,
                left: (frag as { left?: string }).left,
                right: (frag as { right?: string }).right,
                transform: `rotate(${frag.rot}deg)`,
                fontFamily: '"Impact","Arial Black",sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(0.5rem, 1.8vw, 0.75rem)',
                color: '#fff',
                letterSpacing: '0.2em',
                background: 'rgba(0,0,0,0.5)',
                padding: '2px 8px',
              }}
            >{frag.text}</motion.div>
          ))}
        </>
      )}

      {/* ── Thick red accent bar at bottom ── */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={phase >= 1 ? { scaleX: 1 } : {}}
        transition={{ delay: 0.4 * s, duration: 0.2 * s, ease: [0.22, 1, 0.36, 1] }}
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: 'clamp(6px, 1.5vw, 10px)',
          background: '#fff',
          transformOrigin: 'left center',
        }}
      />

      {/* ── White border frame (appears with title) ── */}
      {phase >= 2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.25 }}
          transition={{ duration: 0.15 * s }}
          className="absolute pointer-events-none"
          style={{
            inset: 'clamp(8px, 2vw, 16px)',
            border: '2px solid #fff',
          }}
        />
      )}

      {/* ── Phase 4: Diagonal slash exit to black ── */}
      {phase >= 4 && (
        <>
          {/* Black diagonal wipe with stepped animation */}
          <div className="absolute inset-0 bg-black pointer-events-none z-20 p5-exit-mask" />

          {/* Final solid black */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 * s, duration: 0.15 * s }}
            className="absolute inset-0 bg-black pointer-events-none z-30"
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. P3 — Persona 3 Reload "Memento Mori" style
//    Dark navy, shattered glass, cyan energy burst, angular composition
// ─────────────────────────────────────────────────────────────────────────────

// Pre-computed shard data to avoid recalculating on each render
const P3_SHARDS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * 360 + (i * 37 % 60 - 30);
  const rad = angle * Math.PI / 180;
  const dist = 60 + (i * 47 % 80);
  return {
    id: i,
    w: 8 + (i * 13 % 40),
    h: 12 + (i * 17 % 55),
    startX: Math.cos(rad) * 8,
    startY: Math.sin(rad) * 8,
    endX: Math.cos(rad) * dist * (0.7 + (i % 3) * 0.3),
    endY: Math.sin(rad) * dist * (0.7 + (i % 3) * 0.3),
    rot: (i * 47 % 360) - 180,
    delay: 0.04 + (i % 7) * 0.025,
    skewX: (i % 2 === 0 ? 1 : -1) * (5 + i % 12),
    opacity: 0.25 + (i % 4) * 0.2,
    bg: i % 3 === 0
      ? `linear-gradient(${120 + i * 15}deg, rgba(0,180,255,0.6), rgba(0,80,200,0.15))`
      : i % 3 === 1
        ? `linear-gradient(${60 + i * 20}deg, rgba(120,210,255,0.5), rgba(20,60,140,0.1))`
        : `linear-gradient(${200 + i * 10}deg, rgba(255,255,255,0.55), rgba(0,120,220,0.1))`,
  };
});

// Clock fragments: each piece is a wedge of the clock that flies away on shatter
const P3_CLOCK_FRAGMENTS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * 360 - 90;
  const rad = angle * Math.PI / 180;
  const exitAngle = rad + (((i % 3) - 1) * 0.3);
  const dist = 120 + (i * 31 % 80);
  return {
    id: i,
    // Wedge clip-path: a pie slice from center
    startAngle: (i / 8) * 360,
    endAngle: ((i + 1) / 8) * 360,
    exitX: Math.cos(exitAngle) * dist,
    exitY: Math.sin(exitAngle) * dist,
    rot: (i % 2 === 0 ? 1 : -1) * (25 + (i * 19 % 40)),
    delay: i * 0.015,
  };
});

const P3_SCAN_LINES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  top: `${(i * 5.8) % 100}%`,
  width: `${30 + (i * 23 % 50)}%`,
  left: `${(i * 17 % 60)}%`,
  delay: 0.15 + i * 0.045,
  opacity: 0.08 + (i % 4) * 0.06,
}));

const P3_PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${5 + (i * 19 % 88)}%`,
  bottom: `${5 + (i * 13 % 70)}%`,
  size: 2 + (i % 4),
  delay: 0.2 + i * 0.08,
  dur: 1.6 + (i % 5) * 0.3,
  drift: (i % 2 === 0 ? -1 : 1) * (15 + i % 20),
  color: i % 3 === 0 ? '#00d4ff' : i % 3 === 1 ? '#6ec6ff' : '#ffffff',
}));

function P3Splash({ onComplete, s }: { onComplete: () => void; s: number }) {
  const [phase, setPhase] = useState(0); // 0: dark, 1: shatter, 2: title reveal

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 200 * s);
    const t2 = setTimeout(() => setPhase(2), 900 * s);
    const t3 = setTimeout(onComplete, 3200 * s);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete, s]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: '#020810', transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'strict' }}>
      <style>{`
        @keyframes p3-scanmove {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes p3-vtext {
          0% { transform: translateY(8%); opacity: 0; }
          30% { opacity: 0.08; }
          100% { transform: translateY(-8%); opacity: 0; }
        }
        @keyframes p3-glitch {
          0%, 100% { clip-path: inset(0 0 96% 0); opacity: 0; }
          15% { clip-path: inset(40% 0 20% 0); opacity: 0.7; }
          30% { clip-path: inset(80% 0 2% 0); opacity: 0.5; }
          50% { clip-path: inset(10% 0 60% 0); opacity: 0.6; }
          70% { clip-path: inset(55% 0 30% 0); opacity: 0.4; }
          85% { clip-path: inset(20% 0 50% 0); opacity: 0.3; }
        }
        .p3-vtext-left {
          animation: p3-vtext ${3.6 * s}s linear forwards;
          writing-mode: vertical-rl;
          font-size: clamp(4rem,16vw,9rem);
          font-weight: 900;
          font-style: italic;
          color: transparent;
          -webkit-text-stroke: 1px rgba(0,180,255,0.1);
          letter-spacing: 0.1em;
          white-space: nowrap;
        }
        .p3-glitch-overlay {
          animation: p3-glitch ${0.8 * s}s ease-in-out infinite;
          position: absolute; inset: 0;
          background: rgba(0,160,255,0.04);
          pointer-events: none;
        }
      `}</style>

      {/* Deep blue gradient base — fades in */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 * s, ease: 'easeOut' }}
        className="absolute inset-0"
        style={{ background: 'linear-gradient(160deg, #020a18 0%, #041030 35%, #081848 65%, #0a1235 100%)' }}
      />

      {/* ── Shattering Clock ── */}
      {/* Intact clock: appears in phase 0, fades when shatter begins */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={phase === 0
            ? { opacity: 0.25, scale: 1 }
            : { opacity: 0, scale: 1.05 }}
          transition={phase === 0
            ? { duration: 0.6 * s, ease: 'easeOut' }
            : { duration: 0.2 * s, ease: 'easeIn' }}
          style={{ width: 'min(65vw, 65vh)', height: 'min(65vw, 65vh)' }}
        >
          <svg viewBox="0 0 200 200" className="w-full h-full">
            {/* Clock circle */}
            <circle cx="100" cy="100" r="95" fill="none" stroke="rgba(0,180,255,0.3)" strokeWidth="2" />
            <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(0,140,255,0.12)" strokeWidth="0.5" />
            {/* Hour ticks */}
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * 360 - 90;
              const r1 = 82, r2 = 92;
              const rad = a * Math.PI / 180;
              return <line key={i}
                x1={100 + r1 * Math.cos(rad)} y1={100 + r1 * Math.sin(rad)}
                x2={100 + r2 * Math.cos(rad)} y2={100 + r2 * Math.sin(rad)}
                stroke="rgba(0,200,255,0.45)" strokeWidth={i % 3 === 0 ? 2.5 : 1} />;
            })}
            {/* XII at top */}
            <text x="100" y="32" textAnchor="middle" fill="rgba(0,200,255,0.5)"
              fontSize="14" fontWeight="900" fontFamily="serif" letterSpacing="2">XII</text>
            {/* VI at bottom */}
            <text x="100" y="178" textAnchor="middle" fill="rgba(0,200,255,0.25)"
              fontSize="10" fontWeight="700" fontFamily="serif">VI</text>
            {/* III and IX */}
            <text x="176" y="104" textAnchor="middle" fill="rgba(0,200,255,0.25)"
              fontSize="10" fontWeight="700" fontFamily="serif">III</text>
            <text x="24" y="104" textAnchor="middle" fill="rgba(0,200,255,0.25)"
              fontSize="10" fontWeight="700" fontFamily="serif">IX</text>
            {/* Hour hand pointing to ~12 */}
            <line x1="100" y1="100" x2="100" y2="42" stroke="rgba(0,200,255,0.5)" strokeWidth="3" strokeLinecap="round" />
            {/* Minute hand */}
            <line x1="100" y1="100" x2="130" y2="68" stroke="rgba(0,200,255,0.35)" strokeWidth="2" strokeLinecap="round" />
            {/* Center dot */}
            <circle cx="100" cy="100" r="3" fill="rgba(0,200,255,0.5)" />
            {/* Crack lines (pre-drawn, invisible until just before shatter) */}
            <g opacity="0.15">
              <line x1="100" y1="100" x2="45" y2="25" stroke="#00d4ff" strokeWidth="0.8" />
              <line x1="100" y1="100" x2="170" y2="50" stroke="#00d4ff" strokeWidth="0.6" />
              <line x1="100" y1="100" x2="30" y2="140" stroke="#00d4ff" strokeWidth="0.7" />
              <line x1="100" y1="100" x2="165" y2="160" stroke="#00d4ff" strokeWidth="0.5" />
              <line x1="100" y1="100" x2="100" y2="195" stroke="#00d4ff" strokeWidth="0.6" />
              <line x1="100" y1="100" x2="15" y2="80" stroke="#00d4ff" strokeWidth="0.5" />
            </g>
          </svg>
        </motion.div>
      </div>

      {/* Shattering clock fragments — 12 wedge-shaped pieces fly outward */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {P3_CLOCK_FRAGMENTS.map(frag => {
          // Build a wedge clip-path for this fragment (pie slice)
          const a1 = (frag.startAngle - 2) * Math.PI / 180;
          const a2 = (frag.endAngle + 2) * Math.PI / 180;
          const cx = 50, cy = 50, r = 52; // percentage-based
          const clip = `polygon(${cx}% ${cy}%, ${cx + r * Math.cos(a1)}% ${cy + r * Math.sin(a1)}%, ${cx + r * Math.cos((a1 + a2) / 2)}% ${cy + r * Math.sin((a1 + a2) / 2)}%, ${cx + r * Math.cos(a2)}% ${cy + r * Math.sin(a2)}%)`;
          return (
            <motion.div key={frag.id}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 1 }}
              animate={phase >= 1 ? {
                x: [0, frag.exitX * 0.3, frag.exitX],
                y: [0, frag.exitY * 0.3, frag.exitY],
                rotate: [0, frag.rot * 0.4, frag.rot],
                opacity: [0.35, 0.3, 0],
                scale: [1, 0.95, 0.5],
              } : {}}
              transition={{
                delay: frag.delay * s,
                duration: 0.9 * s,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                position: 'absolute',
                width: 'min(65vw, 65vh)',
                height: 'min(65vw, 65vh)',
                clipPath: clip,
              }}
            >
              <svg viewBox="0 0 200 200" className="w-full h-full">
                <circle cx="100" cy="100" r="95" fill="none" stroke="rgba(0,180,255,0.4)" strokeWidth="2" />
                <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(0,140,255,0.15)" strokeWidth="0.5" />
                {Array.from({ length: 12 }, (_, i) => {
                  const a = (i / 12) * 360 - 90;
                  const r1 = 82, r2 = 92;
                  const rad = a * Math.PI / 180;
                  return <line key={i}
                    x1={100 + r1 * Math.cos(rad)} y1={100 + r1 * Math.sin(rad)}
                    x2={100 + r2 * Math.cos(rad)} y2={100 + r2 * Math.sin(rad)}
                    stroke="rgba(0,200,255,0.5)" strokeWidth={i % 3 === 0 ? 2.5 : 1} />;
                })}
                <text x="100" y="32" textAnchor="middle" fill="rgba(0,200,255,0.55)"
                  fontSize="14" fontWeight="900" fontFamily="serif" letterSpacing="2">XII</text>
                <line x1="100" y1="100" x2="100" y2="42" stroke="rgba(0,200,255,0.5)" strokeWidth="3" strokeLinecap="round" />
                <line x1="100" y1="100" x2="130" y2="68" stroke="rgba(0,200,255,0.35)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="100" cy="100" r="3" fill="rgba(0,200,255,0.5)" />
              </svg>
            </motion.div>
          );
        })}
      </div>

      {/* Vertical large text on left side — like the poster's "PERSONA 3" */}
      <div className="absolute left-[3%] top-0 bottom-0 flex items-center pointer-events-none select-none overflow-hidden">
        <div className="p3-vtext-left">MEMENTO</div>
      </div>
      <div className="absolute right-[3%] top-0 bottom-0 flex items-center pointer-events-none select-none overflow-hidden" style={{ opacity: 0.6 }}>
        <div className="p3-vtext-left" style={{ animationDelay: `${0.3 * s}s`, animationDirection: 'reverse' }}>MORI</div>
      </div>

      {/* Horizontal scan lines that sweep across */}
      {P3_SCAN_LINES.map(line => (
        <motion.div key={line.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 1 ? line.opacity : 0 }}
          transition={{ delay: line.delay * s, duration: 0.15 * s }}
          className="absolute h-[1px] pointer-events-none"
          style={{
            top: line.top,
            left: line.left,
            width: line.width,
            background: 'linear-gradient(90deg, transparent, rgba(0,180,255,0.4), transparent)',
          }}
        >
          <div style={{ animation: `p3-scanmove ${(1.2 + line.id * 0.1) * s}s linear ${line.delay * s}s infinite` }}
            className="h-full w-full bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
        </motion.div>
      ))}

      {/* Central energy burst — the core of the shatter */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={phase >= 1
            ? { scale: [0, 1.8, 1.2], opacity: [0, 0.9, 0.4] }
            : {}}
          transition={{ duration: 0.5 * s, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: 'min(70vw, 70vh)',
            height: 'min(70vw, 70vh)',
            background: 'radial-gradient(circle, rgba(0,200,255,0.4) 0%, rgba(0,100,220,0.15) 35%, transparent 70%)',
            borderRadius: '50%',
          }}
        />
      </div>

      {/* Secondary ring pulse */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={phase >= 1
            ? { scale: [0.5, 2.5], opacity: [0.6, 0] }
            : {}}
          transition={{ delay: 0.15 * s, duration: 0.8 * s, ease: 'easeOut' }}
          className="rounded-full"
          style={{
            width: 'min(50vw, 50vh)',
            height: 'min(50vw, 50vh)',
            border: '2px solid rgba(0,200,255,0.3)',
          }}
        />
      </div>

      {/* Shattered glass fragments — explode outward from center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {P3_SHARDS.map(shard => (
          <motion.div key={shard.id}
            initial={{
              x: shard.startX,
              y: shard.startY,
              scale: 0,
              rotate: 0,
              opacity: 0,
            }}
            animate={phase >= 1 ? {
              x: [shard.startX, shard.endX * 0.5, shard.endX],
              y: [shard.startY, shard.endY * 0.4, shard.endY],
              scale: [0, 1.2, phase >= 2 ? 0.3 : 0.8],
              rotate: [0, shard.rot * 0.5, shard.rot],
              opacity: [0, shard.opacity, phase >= 2 ? 0 : shard.opacity * 0.6],
            } : {}}
            transition={{
              delay: shard.delay * s,
              duration: 0.7 * s,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute"
            style={{
              width: shard.w,
              height: shard.h,
              background: shard.bg,
              clipPath: 'polygon(15% 0%, 100% 5%, 85% 100%, 0% 90%)',
              backdropFilter: 'blur(1px)',
              transform: `skewX(${shard.skewX}deg)`,
            }}
          />
        ))}
      </div>

      {/* Angular accent lines — like the poster's geometric composition */}
      {[
        { x1: -20, y1: 30, x2: 120, y2: 70, delay: 0.25 },
        { x1: -10, y1: 65, x2: 110, y2: 25, delay: 0.32 },
        { x1: 40, y1: -10, x2: 60, y2: 110, delay: 0.38 },
      ].map((line, i) => (
        <motion.svg key={i}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={phase >= 1 ? { pathLength: 1, opacity: 0.2 } : {}}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ overflow: 'visible' }}
        >
          <motion.line
            x1={`${line.x1}%`} y1={`${line.y1}%`}
            x2={`${line.x2}%`} y2={`${line.y2}%`}
            stroke="rgba(0,180,255,0.3)"
            strokeWidth="1"
            initial={{ pathLength: 0 }}
            animate={phase >= 1 ? { pathLength: 1 } : {}}
            transition={{ delay: line.delay * s, duration: 0.5 * s, ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.svg>
      ))}

      {/* Rising blue particles */}
      {P3_PARTICLES.map(p => (
        <motion.div key={p.id}
          initial={{ y: 0, x: 0, opacity: 0, scale: 0 }}
          animate={phase >= 1 ? {
            y: [0, -120 - p.id * 10, -250 - p.id * 15],
            x: [0, p.drift * 0.5, p.drift],
            opacity: [0, 0.8, 0],
            scale: [0, 1, 0.3],
          } : {}}
          transition={{
            delay: p.delay * s,
            duration: p.dur * s,
            ease: 'easeOut',
          }}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: p.left,
            bottom: p.bottom,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          }}
        />
      ))}

      {/* Glitch overlay — rapid clip-path flicker */}
      {phase >= 1 && phase < 2 && (
        <div className="p3-glitch-overlay" />
      )}

      {/* MEMENTO MORI — top tracking text */}
      <motion.div
        initial={{ opacity: 0, letterSpacing: '1.5em' }}
        animate={phase >= 2
          ? { opacity: 0.7, letterSpacing: '0.5em' }
          : phase >= 1
            ? { opacity: 0.15, letterSpacing: '1em' }
            : {}}
        transition={{ duration: 0.7 * s, ease: [0.22, 1, 0.36, 1] }}
        className="absolute top-[18%] left-0 right-0 text-center select-none pointer-events-none"
        style={{
          fontFamily: '"Helvetica Neue","Arial",sans-serif',
          fontSize: 'clamp(0.6rem, 2.5vw, 0.9rem)',
          fontWeight: 800,
          color: '#00c8ff',
          textShadow: '0 0 20px rgba(0,200,255,0.5)',
          textTransform: 'uppercase',
        }}
      >
        MEMENTO MORI
      </motion.div>

      {/* Main title — 靛蓝色房间 */}
      <motion.div
        initial={{ opacity: 0, scale: 1.3, y: 10 }}
        animate={phase >= 2
          ? { opacity: 1, scale: 1, y: 0 }
          : {}}
        transition={{
          duration: 0.65 * s,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="absolute inset-0 flex flex-col items-center justify-center select-none pointer-events-none z-10"
      >
        <div style={{
          fontSize: 'clamp(2rem, 9vw, 3.5rem)',
          fontWeight: 900,
          color: '#fff',
          textShadow: '0 0 30px rgba(0,180,255,0.6), 0 0 60px rgba(0,120,255,0.3), 0 2px 4px rgba(0,0,0,0.8)',
          letterSpacing: '0.08em',
        }}>
          靛蓝色房间
        </div>

        {/* Underline accent */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={phase >= 2 ? { scaleX: 1 } : {}}
          transition={{ delay: 0.2 * s, duration: 0.4 * s, ease: [0.22, 1, 0.36, 1] }}
          className="mt-2"
          style={{
            width: 'clamp(120px, 40vw, 220px)',
            height: 2,
            background: 'linear-gradient(90deg, transparent, #00c8ff, transparent)',
            transformOrigin: 'center',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={phase >= 2 ? { opacity: 0.6, y: 0 } : {}}
          transition={{ delay: 0.35 * s, duration: 0.4 * s }}
          className="mt-3 uppercase tracking-[0.4em] font-bold"
          style={{
            fontSize: 'clamp(0.55rem, 2vw, 0.75rem)',
            color: '#7ab8e8',
          }}
        >
          THE VELVET
        </motion.div>
      </motion.div>

      {/* Corner accents — angular bracket marks */}
      {phase >= 2 && (
        <>
          <motion.div
            initial={{ opacity: 0, x: -10, y: -10 }}
            animate={{ opacity: 0.3, x: 0, y: 0 }}
            transition={{ duration: 0.3 * s }}
            className="absolute top-6 left-6 pointer-events-none"
            style={{
              width: 24, height: 24,
              borderTop: '2px solid #00c8ff',
              borderLeft: '2px solid #00c8ff',
            }}
          />
          <motion.div
            initial={{ opacity: 0, x: 10, y: 10 }}
            animate={{ opacity: 0.3, x: 0, y: 0 }}
            transition={{ duration: 0.3 * s }}
            className="absolute bottom-6 right-6 pointer-events-none"
            style={{
              width: 24, height: 24,
              borderBottom: '2px solid #00c8ff',
              borderRight: '2px solid #00c8ff',
            }}
          />
        </>
      )}

      {/* Final fade to deep blue then black */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.6 * s, duration: 0.5 * s, ease: 'easeIn' }}
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, #010510, #000)' }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. P4 — Persona 4 "Midnight Channel" style
//    Bright yellow, VHS static/glitch, analog color bars, film strip,
//    "The Velvet" caution tape, flat vector, non-linear animation
// ─────────────────────────────────────────────────────────────────────────────

// SMPTE-inspired analog color bars
const P4_COLOR_BARS = [
  '#c0c0c0', // white/gray
  '#c0c000', // yellow
  '#00c0c0', // cyan
  '#00c000', // green
  '#c000c0', // magenta
  '#c00000', // red
  '#0000c0', // blue
];

// Film strip sprocket holes
const P4_SPROCKETS = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  y: i * 7.5 + 1,
}));

function P4Splash({ onComplete, s }: { onComplete: () => void; s: number }) {
  const [phase, setPhase] = useState(0); // 0: static, 1: signal in, 2: reveal

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 280 * s);
    const t2 = setTimeout(() => setPhase(2), 1000 * s);
    const t3 = setTimeout(onComplete, 2800 * s);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete, s]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: '#1a1a1a', transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'strict' }}>
      <style>{`
        @keyframes p4-static {
          0% { background-position: 0 0; }
          100% { background-position: 100% 100%; }
        }
        @keyframes p4-scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes p4-roll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes p4-tape-scroll {
          0% { transform: rotate(-8deg) translateX(0); }
          100% { transform: rotate(-8deg) translateX(-50%); }
        }
        @keyframes p4-tape-scroll2 {
          0% { transform: rotate(6deg) translateX(-50%); }
          100% { transform: rotate(6deg) translateX(0); }
        }
        @keyframes p4-flicker {
          0%, 100% { opacity: 0.04; }
          5% { opacity: 0.12; }
          10% { opacity: 0.03; }
          15% { opacity: 0.08; }
          30% { opacity: 0.05; }
          50% { opacity: 0.1; }
          70% { opacity: 0.04; }
          85% { opacity: 0.09; }
        }
        @keyframes p4-hue-drift {
          0% { filter: hue-rotate(0deg); }
          25% { filter: hue-rotate(8deg); }
          50% { filter: hue-rotate(-5deg); }
          75% { filter: hue-rotate(3deg); }
          100% { filter: hue-rotate(0deg); }
        }
        .p4-vhs-static {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          background-size: 180px 180px;
          animation: p4-static ${0.08 * s}s steps(8) infinite, p4-flicker ${0.3 * s}s steps(1) infinite;
        }
        .p4-glitch-slice {
          animation: p4-flicker ${0.12 * s}s steps(1) infinite;
        }
        @keyframes p4-title-flash {
          0%, 100% { opacity: 1; }
          4% { opacity: 0.2; }
          8% { opacity: 1; }
          12% { opacity: 0.4; }
          16% { opacity: 1; }
          60% { opacity: 1; }
          62% { opacity: 0.15; }
          64% { opacity: 1; }
          66% { opacity: 0.6; }
          68% { opacity: 1; }
        }
        .p4-title-flash {
          animation: p4-title-flash ${1.8 * s}s ease-in-out infinite;
          animation-delay: ${1.3 * s}s;
        }
        @keyframes p4-noise-shift {
          0% { background-position: 0 0; }
          25% { background-position: 50% 25%; }
          50% { background-position: 25% 75%; }
          75% { background-position: 75% 50%; }
          100% { background-position: 0 0; }
        }
      `}</style>

      {/* ── Phase 0: VHS static / snow ── */}
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{ opacity: phase >= 1 ? 0 : 0.5 }}
        transition={{ duration: 0.3 * s }}
        className="absolute inset-0 p4-vhs-static pointer-events-none"
      />

      {/* VHS tracking lines — horizontal glitch bands */}
      {phase === 0 && [12, 35, 58, 78].map((top, i) => (
        <motion.div key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0], x: [0, (i % 2 ? 8 : -8), 0] }}
          transition={{ duration: 0.15 * s, repeat: Infinity, delay: i * 0.04 * s, repeatDelay: 0.2 * s }}
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: `${top}%`, height: 2 + (i % 3), background: 'rgba(255,255,255,0.4)' }}
        />
      ))}

      {/* ── Yellow BG wipe ── */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={phase >= 1 ? { scaleX: 1 } : {}}
        transition={{ duration: 0.35 * s, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: 'left center', background: '#f4cc0a' }}
        className="absolute inset-0"
      />

      {/* ── SMPTE analog color bars (left edge) ── */}
      <div className="absolute top-0 bottom-0 left-0 flex pointer-events-none" style={{ width: 56 }}>
        {P4_COLOR_BARS.map((color, i) => (
          <motion.div key={i}
            initial={{ scaleY: 0 }}
            animate={phase >= 1 ? { scaleY: 1 } : {}}
            transition={{
              delay: (0.1 + i * 0.03) * s,
              duration: 0.25 * s,
              ease: [0.34, 1.56, 0.64, 1], // overshoot
            }}
            style={{ background: color, transformOrigin: 'top center', width: 8 }}
          />
        ))}
      </div>

      {/* ── Analog signal interference lines (horizontal rainbow bands) ── */}
      {phase >= 1 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ animation: `p4-hue-drift ${2 * s}s linear infinite` }}>
          {[15, 42, 68, 88].map((top, i) => (
            <motion.div key={i}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 0.12, 0.08] }}
              transition={{ delay: (0.35 + i * 0.06) * s, duration: 0.3 * s, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 right-0"
              style={{
                top: `${top}%`,
                height: 3 - (i % 2),
                transformOrigin: i % 2 === 0 ? 'left' : 'right',
                background: `linear-gradient(90deg, ${P4_COLOR_BARS[i % 7]}, ${P4_COLOR_BARS[(i + 2) % 7]}, ${P4_COLOR_BARS[(i + 4) % 7]})`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── VHS scanline overlay (persistent) ── */}
      {phase >= 1 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ mixBlendMode: 'multiply' }}>
          <div className="absolute left-0 right-0" style={{
            height: '200%',
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
            animation: `p4-scanline ${3 * s}s linear infinite`,
          }} />
        </div>
      )}

      {/* ── Film strip (right edge) ── */}
      <motion.div
        initial={{ x: 60 }}
        animate={phase >= 1 ? { x: 0 } : {}}
        transition={{ delay: 0.25 * s, duration: 0.4 * s, type: 'spring', stiffness: 300, damping: 28 }}
        className="absolute top-0 bottom-0 right-0 pointer-events-none select-none"
        style={{ width: 38 }}
      >
        {/* Film strip body */}
        <div className="absolute inset-0 bg-[#1a1a1a]" />
        {/* Sprocket holes */}
        <div className="absolute inset-0 overflow-hidden" style={{ animation: `p4-roll ${4 * s}s linear infinite` }}>
          <div style={{ height: '200%' }}>
            {[...P4_SPROCKETS, ...P4_SPROCKETS.map(sp => ({ ...sp, y: sp.y + 100 }))].map((sp, i) => (
              <div key={i}
                className="absolute left-1/2 -translate-x-1/2 rounded-sm"
                style={{
                  top: `${sp.y}%`,
                  width: 14,
                  height: 10,
                  border: '2px solid #444',
                  background: '#0a0a0a',
                }}
              />
            ))}
          </div>
        </div>
        {/* Film edge lines */}
        <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-[#444]" />
        <div className="absolute top-0 bottom-0 right-0 w-[2px] bg-[#444]" />
      </motion.div>

      {/* ── TV frame (large, centered) — title lives inside ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={phase >= 1 ? { scale: 1, opacity: 1 } : {}}
          transition={{ delay: 0.18 * s, duration: 0.4 * s, type: 'spring', stiffness: 280, damping: 24 }}
          className="relative"
          style={{ width: 'min(62vw, 290px)' }}
        >
          <svg viewBox="0 0 280 200" className="w-full" style={{ display: 'block' }}>
            {/* TV outer body */}
            <rect x="8" y="14" width="264" height="172" rx="14" ry="14"
              fill="none" stroke="#1a1a1a" strokeWidth="5" />
            {/* Screen bezel */}
            <rect x="20" y="26" width="240" height="148" rx="6" ry="6"
              fill="none" stroke="#1a1a1a" strokeWidth="2.5" />
            {/* 10% noise inside screen */}
            <foreignObject x="20" y="26" width="240" height="148">
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: 6,
                overflow: 'hidden',
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
                backgroundSize: '150px 150px',
                opacity: 0.1,
                animation: `p4-noise-shift ${0.3 * s}s steps(5) infinite`,
              }} />
            </foreignObject>
            {/* Antenna left */}
            <line x1="105" y1="14" x2="80" y2="-6" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
            {/* Antenna right */}
            <line x1="175" y1="14" x2="200" y2="-6" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
            {/* Antenna tips */}
            <circle cx="80" cy="-6" r="2.5" fill="#1a1a1a" />
            <circle cx="200" cy="-6" r="2.5" fill="#1a1a1a" />
            {/* Power button */}
            <circle cx="254" cy="174" r="3.5" fill="none" stroke="#1a1a1a" strokeWidth="1.5" />
            {/* Volume lines */}
            <line x1="242" y1="170" x2="242" y2="178" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="234" y1="170" x2="234" y2="178" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </motion.div>
      </div>

      {/* ── Black four-pointed star — flashes in center of TV before title ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ scale: 0, rotate: 0, opacity: 0 }}
          animate={phase >= 1 ? {
            scale: [0, 1.4, 1.1, 0.8, 0],
            rotate: [0, 0, 12, 12, 12],
            opacity: [0, 1, 1, 0.7, 0],
          } : {}}
          transition={{
            delay: 0.3 * s,
            duration: 0.55 * s,
            times: [0, 0.2, 0.4, 0.7, 1],
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <svg viewBox="0 0 100 100" style={{ width: 'min(22vw, 110px)', height: 'min(22vw, 110px)' }}>
            <path d="M50 0 L58 42 L100 50 L58 58 L50 100 L42 58 L0 50 L42 42 Z" fill="#1a1a1a" />
          </svg>
        </motion.div>
      </div>

      {/* ── Glitch displacement slices ── */}
      {phase >= 1 && phase < 2 && [28, 48, 68].map((top, i) => (
        <motion.div key={i}
          animate={{
            x: [0, (i % 2 ? 6 : -6), 0, (i % 2 ? -3 : 4), 0],
            opacity: [0, 0.7, 0],
          }}
          transition={{
            duration: 0.2 * s,
            repeat: Infinity,
            repeatDelay: (0.6 + i * 0.2) * s,
            ease: 'linear',
          }}
          className="absolute left-0 right-0 pointer-events-none overflow-hidden"
          style={{
            top: `${top}%`,
            height: 4 + (i * 3 % 6),
            background: '#f4cc0a',
            mixBlendMode: 'difference',
          }}
        />
      ))}

      {/* ── Diagonal "The Velvet" caution tape (upper) ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : {}}
        transition={{ delay: 0.4 * s, duration: 0.15 * s }}
        className="absolute left-[-10%] right-[-10%] overflow-visible pointer-events-none select-none"
        style={{ top: '22%' }}
      >
        <div style={{
          animation: `p4-tape-scroll ${3 * s}s linear infinite`,
          whiteSpace: 'nowrap',
        }}>
          <div className="inline-block bg-black py-2 px-1"
            style={{ fontSize: 'clamp(0.6rem,2vw,0.82rem)' }}>
            <span className="font-black tracking-[0.25em] uppercase" style={{ color: '#f4cc0a' }}>
              {'⚠ THE VELVET ⚠ CAUTION ⚠ THE VELVET ⚠ DANGER ⚠ THE VELVET ⚠ CAUTION ⚠ THE VELVET ⚠ DANGER ⚠ THE VELVET ⚠ CAUTION ⚠ THE VELVET ⚠ DANGER '}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── Diagonal "The Velvet" caution tape (lower, reverse direction) ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : {}}
        transition={{ delay: 0.48 * s, duration: 0.15 * s }}
        className="absolute left-[-10%] right-[-10%] overflow-visible pointer-events-none select-none"
        style={{ top: '72%' }}
      >
        <div style={{
          animation: `p4-tape-scroll2 ${3.5 * s}s linear infinite`,
          whiteSpace: 'nowrap',
        }}>
          <div className="inline-block bg-[#1a1a1a]/90 py-1.5 px-1"
            style={{ fontSize: 'clamp(0.5rem,1.6vw,0.7rem)' }}>
            <span className="font-black tracking-[0.3em] uppercase" style={{ color: '#f4cc0a' }}>
              {'THE VELVET ▪ THE VELVET ▪ THE VELVET ▪ THE VELVET ▪ THE VELVET ▪ THE VELVET ▪ THE VELVET ▪ THE VELVET ▪ '}
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── Main title INSIDE TV (P4 logo style: skew + stretch) ── */}
      <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none z-10">
        <motion.div
          initial={{ opacity: 0, scale: 1.5 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : {}}
          transition={{
            duration: 0.35 * s,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="flex flex-col items-center"
        >
          <div className={phase >= 2 ? 'p4-title-flash' : ''}
            style={{
              transform: 'skewX(-10deg) scaleY(1.15)',
            }}>
            <div className="text-black leading-none"
              style={{
                fontSize: 'clamp(1.8rem,8vw,2.8rem)',
                fontFamily: '"Georgia","Noto Serif SC","Source Han Serif SC","SimSun","Times New Roman",serif',
                fontWeight: 900,
                letterSpacing: '-0.01em',
              }}>
              靛蓝色房间
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={phase >= 2 ? { opacity: 0.65, y: 0 } : {}}
            transition={{ delay: 0.18 * s, duration: 0.25 * s }}
            className="text-black text-xs tracking-[0.4em] uppercase mt-2"
            style={{
              fontFamily: '"Georgia","Times New Roman",serif',
              fontWeight: 800,
              transform: 'skewX(-10deg)',
            }}
          >
            THE VELVET
          </motion.div>
        </motion.div>
      </div>

      {/* ── Corner badge (bottom-right, flat vector) ── */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={phase >= 2 ? { opacity: 1, x: 0 } : {}}
        transition={{ delay: 0.15 * s, duration: 0.3 * s, type: 'spring', stiffness: 400, damping: 26 }}
        className="absolute bottom-8 right-12 flex flex-col items-end select-none pointer-events-none z-10"
      >
        <div className="bg-black text-[#f4cc0a] font-black px-2.5 py-0.5 text-[10px] tracking-[0.3em] uppercase">
          CHANNEL
        </div>
        <div className="bg-[#f4cc0a] border-2 border-black text-black font-black px-2.5 py-0.5 text-[10px] tracking-[0.3em] mt-[-2px]">
          04
        </div>
      </motion.div>

      {/* ── "REC" indicator (top-left) ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: [0, 1, 1, 0] } : {}}
        transition={{ delay: 0.3 * s, duration: 1.2 * s, repeat: Infinity, times: [0, 0.1, 0.8, 1] }}
        className="absolute top-6 left-16 flex items-center gap-2 select-none pointer-events-none z-10"
      >
        <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
        <span className="text-black font-black text-xs tracking-wider">REC</span>
      </motion.div>

      {/* ── Timecode (top-right) ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 0.5 } : {}}
        transition={{ delay: 0.35 * s, duration: 0.2 * s }}
        className="absolute top-6 right-14 select-none pointer-events-none z-10"
      >
        <span className="text-black font-mono text-xs font-bold tracking-wider">00:00:04:12</span>
      </motion.div>

      {/* ── Final VHS glitch-out + fade to black ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2 * s, duration: 0.15 * s }}
        className="absolute inset-0 p4-vhs-static pointer-events-none z-20"
        style={{ background: '#1a1a1a' }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.35 * s, duration: 0.35 * s }}
        className="absolute inset-0 bg-black pointer-events-none z-20"
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
