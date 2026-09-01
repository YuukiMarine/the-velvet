import { motion } from 'motion/react';
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { VelvetRoomSplash } from '@/components/splash/VelvetRoomSplash';

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
/**
 * VELVET 开屏 = 「天鹅绒房间」入场（PRD_V2.6 §4，v2.6 重做）。
 * 本体拆到 components/splash/VelvetRoomSplash：那里是一整套 3D 透视场景，
 * 与本文件其余三个频道开屏（纯 2D 拼贴）不是一个量级，混在一起会难以维护。
 */
function VelvetSplash({ onComplete, s }: { onComplete: () => void; s: number }) {
  return <VelvetRoomSplash onComplete={onComplete} s={s} />;
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
                fontFamily: '"Impact", "Noto Sans SC Black", "Velvet Sans SC", sans-serif',
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
                fontFamily: '"Impact", "Noto Sans SC Black", "Velvet Sans SC", sans-serif',
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
// 3. P3 —「深夜月光录」Persona 3（v2.7.0.2h 三稿）
//    影时间绿钟 → 敲正 → 整钟碎块飞散 + 镜头急推急坠 → VHS 撕裂换世界
//    → 蓝界（新月渐盈满月 / 水面 / 三角 / 上飘光尘）→ 题字（放大下移 + 蓝波纹外扩）。
//    工程口径（glitch 对齐逆影战场 shadow 的语言，但全屏版避开其 clip-path/filter 动画）：
//    · 绿世界本体预切 7 条横带（带内渐变按整体渐变取样对齐），glitch = 横带 steps() 撕裂位移
//      + 红/青色散残影带闪烁 + 扫描线 + 追踪杂波上滚 —— 撕的是世界本体，不是浮在上面的彩条；
//    · 钟表碎裂 = 钟面复制 6 份配静态 clip-path 楔形一次性 transform 飞散；
//      碎片/碎块静态 opacity:0 + forwards 填充 → 延迟期绝不提前露出（修中央碎片早现 bug）；
//    · 镜头急推急坠 = 全场景包一层 transform scale 冲击；
//    · 月亮圆缺 = 月影盘在 overflow:hidden 圆内滑离（静态裁切，非 clip-path 动画）。
//    全部动效 CSS 合成器：零 backdrop-filter、零 clip-path 动画、零 filter 动画、零逐帧 JS。
// ─────────────────────────────────────────────────────────────────────────────

const P3S_STARS = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  left: `${((i * 41 + 13) % 92) + 3}%`,
  top: `${((i * 29 + 7) % 52) + 4}%`,
  size: 1.5 + (i % 3),
  delay: (i % 5) * 0.6,
  dur: 2.2 + (i % 4) * 0.7,
}));

/** 绿世界横带：整体渐变(164deg #031008→#0a2c1a→#14452b→#0a2416)按边界取样切成 7 条 */
const P3S_GREEN_STRIPS = [
  { id: 0, top: '0%', h: '12.5%', c1: '#031008', c2: '#051a0e', jit: 'a', jd: 0.16 },
  { id: 1, top: '12%', h: '14.5%', c1: '#051a0e', c2: '#082415', jit: 'b', jd: 0.14 },
  { id: 2, top: '26%', h: '16.5%', c1: '#082415', c2: '#0c311d', jit: 'c', jd: 0.19 },
  { id: 3, top: '42%', h: '13.5%', c1: '#0c311d', c2: '#103c25', jit: 'a', jd: 0.22 },
  { id: 4, top: '55%', h: '15.5%', c1: '#103c25', c2: '#134129', jit: 'b', jd: 0.17 },
  { id: 5, top: '70%', h: '16.5%', c1: '#134129', c2: '#0e321f', jit: 'c', jd: 0.15 },
  { id: 6, top: '86%', h: '14.5%', c1: '#0e321f', c2: '#0a2416', jit: 'a', jd: 0.2 },
] as const;

/** 碎钟飞屑：绕轴心均匀布向，尺寸/转角/延迟带伪随机抖动（渲染间恒定） */
const P3S_SHARDS = Array.from({ length: 12 }, (_, i) => {
  const ang = ((i / 12) * 360 + ((i * 53) % 34) - 17) * (Math.PI / 180);
  const dist = 130 + ((i * 47) % 110);
  return {
    id: i,
    w: 5 + ((i * 13) % 14),
    h: 12 + ((i * 17) % 26),
    dx: Math.round(Math.cos(ang) * dist),
    dy: Math.round(Math.sin(ang) * dist),
    rot: (((i * 67) % 240) - 120),
    delay: (i % 6) * 0.022,
    green: i % 3 !== 2,
  };
});

/** 钟面碎块：6 块静态 clip-path 楔形（裂纹自轴心放射、边缘带折角），沿各自方位飞散 */
const P3S_CLOCK_PIECES = [
  { id: 0, clip: 'polygon(50% 50%, 0% 0%, 34% 6%, 55% 0%)', dx: -52, dy: -74, r: -26, d: 0 },
  { id: 1, clip: 'polygon(50% 50%, 55% 0%, 78% 9%, 100% 0%, 100% 42%)', dx: 78, dy: -58, r: 22, d: 0.03 },
  { id: 2, clip: 'polygon(50% 50%, 100% 42%, 100% 100%, 68% 100%)', dx: 92, dy: 60, r: 30, d: 0.015 },
  { id: 3, clip: 'polygon(50% 50%, 68% 100%, 44% 92%, 22% 100%)', dx: 8, dy: 96, r: -14, d: 0.045 },
  { id: 4, clip: 'polygon(50% 50%, 22% 100%, 0% 100%, 0% 58%)', dx: -84, dy: 68, r: -32, d: 0.02 },
  { id: 5, clip: 'polygon(50% 50%, 0% 58%, 0% 0%)', dx: -96, dy: -18, r: 18, d: 0.06 },
] as const;

/** 主页标题同形的不规则三角（TitleTri 路径语言），散点三枚 */
const P3S_TRIS = [
  { id: 0, left: '5%', top: '8%', w: 120, fill: '#1b57ff', rot: -8, delay: 0.42, op: 0.8 },
  { id: 1, left: '70%', top: '58%', w: 88, fill: '#35d1e8', rot: 14, delay: 0.52, op: 0.55 },
  { id: 2, left: '14%', top: '66%', w: 74, fill: '#0f2c6e', rot: 24, delay: 0.62, op: 0.85 },
];

const P3S_TRI_PATH = 'M2 32 L296 6 L70 74 Z';

/** 题字碎屑：题字甩入时从字块四周迸出的小三角（挂在 slam 容器内随题字移动），散开即灭。
 *  dx/dy = 迸散冲量（减速曲线）；ax = 向右加速位移（外层 ease-in 曲线叠加）——合成"越飘越快向右"。 */
const P3S_TITLE_DEBRIS = [
  { id: 0, left: '-4%', top: '10%', w: 21, r0: -18, dx: -18, dy: -20, r1: -96, delay: 0.16, ax: 54, fill: '#35d1e8' },
  { id: 1, left: '30%', top: '-30%', w: 24, r0: -6, dx: 10, dy: -30, r1: -74, delay: 0.22, ax: 66, fill: '#86b7ff' },
  { id: 2, left: '62%', top: '-18%', w: 17, r0: 24, dx: 16, dy: -22, r1: 118, delay: 0.25, ax: 78, fill: '#35d1e8' },
  { id: 3, left: '96%', top: '6%', w: 27, r0: 8, dx: 20, dy: -8, r1: 92, delay: 0.2, ax: 88, fill: '#1b57ff' },
  { id: 4, left: '88%', top: '74%', w: 18, r0: -26, dx: 14, dy: 26, r1: -110, delay: 0.28, ax: 72, fill: '#86b7ff' },
  { id: 5, left: '46%', top: '96%', w: 21, r0: 16, dx: 6, dy: 36, r1: 82, delay: 0.24, ax: 60, fill: '#1b57ff' },
] as const;

/** 罗马数字钟位（影时间口径） */
const P3S_NUMERALS = [
  { t: 'XII', style: { top: '6%', left: '50%', transform: 'translateX(-50%)' } },
  { t: 'III', style: { top: '50%', right: '7%', transform: 'translateY(-50%)' } },
  { t: 'VI', style: { bottom: '6%', left: '50%', transform: 'translateX(-50%)' } },
  { t: 'IX', style: { top: '50%', left: '7%', transform: 'translateY(-50%)' } },
] as const;

const P3S_TICKS = Array.from({ length: 12 }, (_, i) => ({ id: i, deg: i * 30, long: i % 3 === 0 }));

/** 后半段上飘光尘（一次性 transform/opacity） */
const P3S_MOTES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${((i * 37 + 11) % 88) + 6}%`,
  bottom: `${18 + ((i * 23) % 30)}%`,
  size: 2 + (i % 2),
  mx: ((i * 29) % 26) - 13,
  dur: 0.9 + (i % 4) * 0.16,
  delay: 0.72 + (i % 5) * 0.14,
  cyan: i % 3 === 0,
  o: 0.4 + ((i * 17) % 30) / 100,
}));

/** 影时间钟面（本体与碎块共用；碎块传入已敲正的静态分针） */
function P3sClockFace({ clockSize, minuteStyle }: { clockSize: string; minuteStyle: CSSProperties }) {
  return (
    <div className="absolute inset-0" style={{ opacity: 0.94 }}>
      <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(110,240,170,0.55)' }} />
      <div className="absolute rounded-full" style={{ inset: '7%', border: '1px solid rgba(110,240,170,0.18)' }} />
      {P3S_TICKS.map((t) => (
        <div key={t.id} className="absolute left-1/2 top-1/2"
          style={{
            width: 2, height: t.long ? '8%' : '4.5%',
            marginLeft: -1,
            background: t.long ? 'rgba(125,255,176,0.7)' : 'rgba(125,255,176,0.32)',
            transform: `rotate(${t.deg}deg) translateY(calc(${clockSize} / -2 + 6px))`,
            transformOrigin: '50% 0',
          }} />
      ))}
      {/* 罗马数字（影时间口径：衬线 + 病绿） */}
      {P3S_NUMERALS.map((n) => (
        <div key={n.t} className="absolute select-none"
          style={{
            ...n.style,
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontWeight: 700,
            fontSize: n.t === 'XII' ? 'clamp(0.9rem, 3.4vw, 1.25rem)' : 'clamp(0.7rem, 2.6vw, 1rem)',
            letterSpacing: '0.08em',
            color: n.t === 'XII' ? 'rgba(168,255,204,0.85)' : 'rgba(125,255,176,0.5)',
            textShadow: '0 0 12px rgba(125,255,176,0.35)',
          }}>
          {n.t}
        </div>
      ))}
      <div className="absolute left-1/2 bottom-1/2"
        style={{ width: 3, height: '28%', marginLeft: -1.5, background: 'rgba(168,255,204,0.8)', transformOrigin: '50% 100%', transform: 'rotate(2deg)', borderRadius: 2 }} />
      <div className="absolute left-1/2 bottom-1/2"
        style={{
          width: 2, height: '40%', marginLeft: -1, background: 'rgba(214,255,232,0.9)', transformOrigin: '50% 100%',
          borderRadius: 2,
          ...minuteStyle,
        }} />
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -ml-1 -mt-1 rounded-full" style={{ background: '#7dffb0' }} />
    </div>
  );
}

function P3Splash({ onComplete, s }: { onComplete: () => void; s: number }) {
  const [phase, setPhase] = useState(0); // 0 影时间 · 1 碎裂+glitch+蓝界 · 2 题字
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 380 * s);
    const t2 = setTimeout(() => setPhase(2), 860 * s);
    const t3 = setTimeout(onComplete, 2200 * s);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete, s]);

  const moonSize = 'min(52vw, 36vh)';
  const clockSize = 'min(46vw, 34vh)';
  return (
    <div className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: '#020810', transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'strict' }}>
      <style>{`
        @keyframes p3s-fadein { from { opacity: 0; } to { opacity: 1; } }
        @keyframes p3s-fadeout { from { opacity: 1; } to { opacity: 0; } }
        @keyframes p3s-twinkle { 0%, 100% { opacity: 0.10; } 50% { opacity: 0.65; } }
        @keyframes p3s-strike { to { transform: rotate(0deg); } }
        @keyframes p3s-vanish { from { opacity: 1; } to { opacity: 0; } }
        @keyframes p3s-flashring { from { transform: scale(0.16); opacity: 0.8; } to { transform: scale(2.7); opacity: 0; } }
        @keyframes p3s-campunch { 0% { transform: scale(1) translateY(0); } 17% { transform: scale(1) translateY(0); } 64% { transform: scale(1.032) translateY(-4px); } 78% { transform: scale(0.985) translateY(3px); } 90% { transform: scale(1.002) translateY(0); } 100% { transform: scale(1) translateY(0); } }
        @keyframes p3s-clockpiece { from { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; } to { transform: translate(var(--cp-x), var(--cp-y)) rotate(var(--cp-r)) scale(0.82); opacity: 0; } }
        @keyframes p3s-shard { from { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 0.95; } to { transform: translate(var(--sh-x), var(--sh-y)) rotate(var(--sh-r)) scale(0.4); opacity: 0; } }
        @keyframes p3s-vhsjit-a { 0% { transform: translateX(0); } 22% { transform: translateX(-3.2%); } 40% { transform: translateX(2.4%); } 62% { transform: translateX(-1.2%); } 100% { transform: translateX(0); } }
        @keyframes p3s-vhsjit-b { 0% { transform: translateX(0); } 18% { transform: translateX(4.5%); } 34% { transform: translateX(-2.6%); } 55% { transform: translateX(5.5%); } 78% { transform: translateX(-1.6%); } 100% { transform: translateX(0); } }
        @keyframes p3s-vhsjit-c { 0% { transform: translateX(0); } 26% { transform: translateX(-5.5%); } 48% { transform: translateX(3.5%); } 70% { transform: translateX(-2%); } 100% { transform: translateX(0); } }
        @keyframes p3s-chromaghost { 0% { opacity: 0; } 15% { opacity: var(--go, 0.24); } 30% { opacity: 0.06; } 45% { opacity: var(--go, 0.24); } 65% { opacity: 0.1; } 100% { opacity: 0; } }
        @keyframes p3s-scanflick { 0% { opacity: 0; } 12% { opacity: 0.5; } 30% { opacity: 0.18; } 50% { opacity: 0.44; } 75% { opacity: 0.14; } 100% { opacity: 0; } }
        @keyframes p3s-track { 0% { transform: translateY(0); opacity: 0; } 8% { opacity: 0.5; } 92% { opacity: 0.38; } 100% { transform: translateY(1400%); opacity: 0; } }
        @keyframes p3s-vhsflash { 0% { opacity: 0; } 10% { opacity: 0.30; } 22% { opacity: 0; } 40% { opacity: 0.15; } 100% { opacity: 0; } }
        @keyframes p3s-moonrise { from { transform: translateY(6vh) scale(0.96); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes p3s-moonwax { from { transform: translate(-5%, 0); } to { transform: translate(-118%, -8%); } }
        @keyframes p3s-shimmer { 0%, 100% { opacity: 0.32; transform: scaleX(1); } 50% { opacity: 0.62; transform: scaleX(0.88); } }
        @keyframes p3s-ripple { from { transform: translate(-50%, -50%) scale(0.14); opacity: 0.6; } to { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
        @keyframes p3s-titlering { from { transform: translate(-50%, -50%) scale(0.2); opacity: 0.55; } to { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
        @keyframes p3s-tridebris { 0% { transform: translate(0, 0) rotate(var(--td-r0, 0deg)) scale(1); opacity: 0; } 14% { opacity: 0.9; } 100% { transform: translate(var(--td-x), var(--td-y)) rotate(var(--td-r1, 80deg)) scale(0.4); opacity: 0; } }
        @keyframes p3s-tridebris-x { from { transform: translateX(0); } to { transform: translateX(var(--td-ax, 60px)); } }
        @keyframes p3s-tripop { from { transform: rotate(var(--tri-r)) scale(0); opacity: 0; } to { transform: rotate(var(--tri-r)) scale(1); opacity: var(--tri-o); } }
        @keyframes p3s-slam { from { transform: translateX(-34px) scaleX(0.94); opacity: 0; } to { transform: translateX(0) scaleX(1); opacity: 1; } }
        @keyframes p3s-rise { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: var(--rise-o, 1); } }
        @keyframes p3s-vdrift { 0% { transform: translateY(3.5%); opacity: 0; } 22% { opacity: 0.5; } 100% { transform: translateY(-3.5%); opacity: 0.3; } }
        @keyframes p3s-vdrift-r { 0% { transform: translateY(-3.5%); opacity: 0; } 22% { opacity: 0.5; } 100% { transform: translateY(3.5%); opacity: 0.3; } }
        @keyframes p3s-mote { 0% { transform: translate(0, 14px); opacity: 0; } 30% { opacity: var(--mo, 0.6); } 100% { transform: translate(var(--mx, 0px), -78px); opacity: 0; } }
      `}</style>

      {/* 镜头层：敲击期缓慢抬升 → 碎裂瞬间快速放下（幅度收小）。
          从挂载起一条时间轴：17% 静置 → 64%（=wall 576ms，对准碎块起飞）缓升顶点 → 78% 放下过冲 → 归位；收幕在层外 */}
      <div className="absolute inset-0"
        style={{ animation: `p3s-campunch ${0.9 * s}s ease-in-out both` }}>

        {/* 蓝界底（常驻） */}
        <div className="absolute inset-0"
          style={{
            background: 'linear-gradient(168deg, #020814 0%, #04102e 38%, #071b4a 68%, #060f2e 100%)',
            animation: `p3s-fadein ${0.5 * s}s ease-out both`,
          }} />

        {/* 影时间绿世界：本体即 7 条横带，glitch 时各带独立撕裂位移后齐灭 */}
        {P3S_GREEN_STRIPS.map((st) => (
          <div key={st.id} className="absolute pointer-events-none"
            style={{
              left: '-6%', width: '112%', top: st.top, height: st.h,
              background: `linear-gradient(180deg, ${st.c1}, ${st.c2})`,
              animation: phase >= 1
                ? `p3s-vhsjit-${st.jit} ${0.4 * s}s steps(1, end) ${st.jd * s}s both, p3s-fadeout ${0.3 * s}s ease-in ${0.34 * s}s both`
                : `p3s-fadein ${0.5 * s}s ease-out both`,
            }} />
        ))}

        {/* 星子（两界通用的微光呼吸） */}
        {P3S_STARS.map((st) => (
          <div key={st.id} className="absolute rounded-full pointer-events-none"
            style={{
              left: st.left, top: st.top, width: st.size, height: st.size,
              background: '#cfeaf6',
              animation: `p3s-twinkle ${st.dur * s}s ease-in-out ${st.delay * s}s infinite, p3s-fadein ${0.6 * s}s ease-out both`,
            }} />
        ))}

        {/* ── 影时间钟本体：分针 -42° 敲正，一拍后 steps 硬隐（碎块同帧接管） ── */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative"
            style={{
              width: clockSize, aspectRatio: '1',
              animation: phase >= 1
                ? `p3s-vanish ${0.2 * s}s steps(1, end) both`
                : `p3s-fadein ${0.55 * s}s ease-out both`,
            }}>
            <P3sClockFace clockSize={clockSize} minuteStyle={{
              transform: 'rotate(-42deg)',
              animation: phase >= 1 ? `p3s-strike ${0.16 * s}s cubic-bezier(0.6, 0, 0.2, 1) both` : undefined,
            }} />
          </div>
        </div>

        {/* 钟面碎块：6 块静态 clip-path 楔形飞散；静态 opacity:0 + forwards → 延迟期不露出 */}
        {phase >= 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative" style={{ width: clockSize, aspectRatio: '1' }}>
              {P3S_CLOCK_PIECES.map((p) => (
                <div key={p.id} className="absolute inset-0"
                  style={{
                    clipPath: p.clip,
                    opacity: 0,
                    '--cp-x': `${p.dx}px`,
                    '--cp-y': `${p.dy}px`,
                    '--cp-r': `${p.r}deg`,
                    animation: `p3s-clockpiece ${0.55 * s}s cubic-bezier(0.2, 0.6, 0.35, 1) ${(0.2 + p.d) * s}s forwards`,
                  } as CSSProperties}>
                  <P3sClockFace clockSize={clockSize} minuteStyle={{ transform: 'rotate(0deg)' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 碎钟飞屑：一次性 transform 飞散，绿屑为主、掺青蓝——碎着碎着变了世界 */}
        {phase >= 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {P3S_SHARDS.map((sh) => (
              <div key={sh.id} className="absolute"
                style={{
                  width: sh.w, height: sh.h,
                  opacity: 0,
                  background: sh.green
                    ? 'linear-gradient(160deg, rgba(168,255,204,0.9), rgba(60,180,110,0.25))'
                    : 'linear-gradient(160deg, rgba(53,209,232,0.85), rgba(27,87,255,0.2))',
                  clipPath: 'polygon(18% 0, 100% 10%, 78% 100%, 0 84%)',
                  '--sh-x': `${sh.dx}px`,
                  '--sh-y': `${sh.dy}px`,
                  '--sh-r': `${sh.rot}deg`,
                  animation: `p3s-shard ${0.6 * s}s cubic-bezier(0.2, 0.7, 0.35, 1) ${(0.18 + sh.delay) * s}s forwards`,
                } as CSSProperties} />
            ))}
          </div>
        )}

        {/* 敲正瞬间的绿环闪 */}
        {phase >= 1 && (
          <div className="absolute left-1/2 top-1/2 pointer-events-none"
            style={{
              width: clockSize, aspectRatio: '1',
              marginLeft: `calc(${clockSize} / -2)`, marginTop: `calc(${clockSize} / -2)`,
              border: '2px solid rgba(125,255,176,0.6)', borderRadius: '50%',
              animation: `p3s-flashring ${0.65 * s}s cubic-bezier(0.16, 0.8, 0.3, 1) ${0.12 * s}s both`,
            }} />
        )}

        {/* VHS 杂波层：红/青色散残影带 + 扫描线 + 追踪杂波上滚 + 两跳泛白（全部一次性） */}
        {phase >= 1 && (
          <>
            <div className="absolute pointer-events-none"
              style={{
                left: '-6%', width: '112%', top: '20%', height: '12%',
                background: 'rgba(255,70,120,0.5)', transform: 'translateX(-6px)',
                '--go': 0.2,
                animation: `p3s-chromaghost ${0.36 * s}s steps(1, end) ${0.16 * s}s both`,
              } as CSSProperties} />
            <div className="absolute pointer-events-none"
              style={{
                left: '-6%', width: '112%', top: '56%', height: '10%',
                background: 'rgba(80,230,255,0.5)', transform: 'translateX(6px)',
                '--go': 0.24,
                animation: `p3s-chromaghost ${0.36 * s}s steps(1, end) ${0.21 * s}s both`,
              } as CSSProperties} />
            <div className="absolute inset-0 pointer-events-none"
              style={{
                background: 'repeating-linear-gradient(0deg, rgba(2,10,6,0.5) 0px, rgba(2,10,6,0.5) 2px, transparent 2px, transparent 5px)',
                animation: `p3s-scanflick ${0.4 * s}s steps(1, end) ${0.14 * s}s both`,
              }} />
            <div className="absolute pointer-events-none"
              style={{
                left: 0, right: 0, top: '-9%', height: '8%',
                background: 'linear-gradient(180deg, transparent, rgba(224,255,238,0.55) 45%, rgba(224,255,238,0.2) 70%, transparent)',
                animation: `p3s-track ${0.34 * s}s steps(8, end) ${0.18 * s}s both`,
              }} />
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(120deg, #d9ffe9, #eaf6ff)', animation: `p3s-vhsflash ${0.3 * s}s steps(1, end) ${0.16 * s}s both` }} />
          </>
        )}

        {/* ── 蓝界：月亮升起 + 新月渐盈满月（月影盘圆内滑离，非线性），满月成形后辉光才亮 ── */}
        {phase >= 1 && (
          <div className="absolute left-1/2 pointer-events-none"
            style={{
              top: '11%', width: moonSize, aspectRatio: '1',
              marginLeft: `calc(${moonSize} / -2)`,
              animation: `p3s-moonrise ${0.6 * s}s cubic-bezier(0.3, 0.8, 0.3, 1) ${0.52 * s}s both`,
            }}>
            <div className="absolute inset-0 rounded-full"
              style={{
                boxShadow: '0 0 56px 16px rgba(207,234,246,0.26), 0 0 150px 54px rgba(53,209,232,0.10)',
                animation: `p3s-fadein ${0.3 * s}s ease-out ${1.0 * s}s both`,
              }} />
            <div className="absolute inset-0 rounded-full"
              style={{
                overflow: 'hidden',
                background: 'radial-gradient(circle at 37% 33%, #fdfcf4 0%, #eef2f2 40%, #ccdae6 70%, #a9bcd2 100%)',
              }}>
              <div className="absolute inset-0 rounded-full"
                style={{
                  opacity: 0.5,
                  background:
                    'radial-gradient(circle at 64% 28%, rgba(150,170,196,0.5) 0%, transparent 9%),' +
                    'radial-gradient(circle at 30% 62%, rgba(150,170,196,0.42) 0%, transparent 12%),' +
                    'radial-gradient(circle at 58% 70%, rgba(150,170,196,0.34) 0%, transparent 7%)',
                }} />
              {/* 月影盘：地照质感（压进天空色域，避免暗面整圆轮廓穿帮）。
                  单段 from→to + 加速曲线 = 一次滑离先慢后快（多关键帧会逐段重启速度产生顿挫，勿改回） */}
              <div className="absolute rounded-full"
                style={{
                  inset: '-5%',
                  background: 'radial-gradient(circle at 40% 35%, #071528 0%, #040d20 70%)',
                  animation: `p3s-moonwax ${0.65 * s}s cubic-bezier(0.6, 0, 0.9, 0.55) ${0.62 * s}s both`,
                }} />
            </div>
          </div>
        )}

        {/* 主页语言的不规则蓝三角：三枚散点弹入（TitleTri 同形） */}
        {phase >= 1 && P3S_TRIS.map((tr) => (
          <div key={tr.id} className="absolute pointer-events-none"
            style={{
              left: tr.left, top: tr.top, width: tr.w, height: tr.w * 0.27,
              '--tri-r': `${tr.rot}deg`,
              '--tri-o': tr.op,
              animation: `p3s-tripop ${0.4 * s}s cubic-bezier(0.2, 1.1, 0.35, 1) ${tr.delay * s}s both`,
            } as CSSProperties}>
            <svg viewBox="0 0 300 80" className="h-full w-full" style={{ overflow: 'visible' }}>
              <path d={P3S_TRI_PATH} fill={tr.fill} />
            </svg>
          </div>
        ))}

        {/* 左右竖排装饰大字 THE VELVET（主页装饰大字语言：空心描边 + 缓漂） */}
        {phase >= 1 && (
          <>
            <div className="absolute left-[2%] top-0 bottom-0 flex items-center pointer-events-none select-none overflow-hidden">
              <div style={{
                writingMode: 'vertical-rl',
                fontSize: 'clamp(3.2rem, 13vw, 6.5rem)', fontWeight: 900, fontStyle: 'italic',
                letterSpacing: '0.1em', whiteSpace: 'nowrap',
                color: 'transparent', WebkitTextStroke: '1px rgba(53,209,232,0.24)',
                animation: `p3s-vdrift ${1.6 * s}s linear ${0.4 * s}s both`,
              }}>
                THE VELVET
              </div>
            </div>
            <div className="absolute right-[2%] top-0 bottom-0 flex items-center pointer-events-none select-none overflow-hidden">
              <div style={{
                writingMode: 'vertical-rl',
                fontSize: 'clamp(3.2rem, 13vw, 6.5rem)', fontWeight: 900, fontStyle: 'italic',
                letterSpacing: '0.1em', whiteSpace: 'nowrap',
                color: 'transparent', WebkitTextStroke: '1px rgba(27,87,255,0.28)',
                animation: `p3s-vdrift-r ${1.6 * s}s linear ${0.55 * s}s both`,
              }}>
                THE VELVET
              </div>
            </div>
          </>
        )}

        {/* ── 水面：地平青线 + 月光倒影柱 ── */}
        {phase >= 1 && (
          <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: '23%', animation: `p3s-fadein ${0.6 * s}s ease-out ${0.42 * s}s both` }}>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(2,8,20,0) 0%, #030b1d 34%, #051233 100%)' }} />
            <div className="absolute inset-x-0 top-0" style={{ height: 1, background: 'linear-gradient(90deg, transparent 8%, rgba(53,209,232,0.4) 50%, transparent 92%)' }} />
            {/* 月光倒影柱：左右羽化（横向 mask 静态栅格化一次），纵向仍由背景渐变收尾 */}
            <div className="absolute top-0 bottom-0 left-1/2"
              style={{
                width: 'calc(min(12vw, 64px) + 8px)', marginLeft: 'calc((min(12vw, 64px) + 8px) / -2)',
                background: 'linear-gradient(180deg, rgba(253,252,244,0.30) 0%, rgba(53,209,232,0.10) 55%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 32%, #000 68%, transparent 100%)',
                maskImage: 'linear-gradient(90deg, transparent 0%, #000 32%, #000 68%, transparent 100%)',
                animation: `p3s-shimmer ${2.6 * s}s ease-in-out infinite`,
              }} />
          </div>
        )}

        {/* 00:00 —— Dark Hour 印 */}
        {phase >= 1 && (
          <div className="absolute pointer-events-none select-none"
            style={{
              left: '6%', bottom: '25%',
              fontSize: 'clamp(0.7rem, 2.6vw, 0.9rem)', fontWeight: 800, fontStyle: 'italic',
              letterSpacing: '0.18em', color: 'rgba(53,209,232,0.6)',
              animation: `p3s-rise ${0.5 * s}s ease-out ${0.55 * s}s both`,
              '--rise-o': 1,
            } as CSSProperties}>
            00:00
          </div>
        )}

        {/* 后半段上飘光尘（静态 opacity:0 + forwards，延迟期不露出） */}
        {phase >= 1 && P3S_MOTES.map((m) => (
          <span key={m.id} className="absolute rounded-full pointer-events-none"
            style={{
              left: m.left, bottom: m.bottom, width: m.size, height: m.size,
              background: m.cyan ? '#8fe3f2' : '#e6f3fb',
              opacity: 0,
              '--mx': `${m.mx}px`,
              '--mo': m.o,
              animation: `p3s-mote ${m.dur * s}s linear ${m.delay * s}s forwards`,
            } as CSSProperties} />
        ))}

        {/* 水面涟漪（题字落定时一圈椭圆） */}
        {phase >= 2 && (
          <div className="absolute left-1/2 pointer-events-none"
            style={{
              top: '84%', width: 'min(52vw, 250px)', aspectRatio: '2.7',
              border: '2px solid rgba(53,209,232,0.45)', borderRadius: '50%',
              animation: `p3s-ripple ${1.1 * s}s ease-out ${0.15 * s}s both`,
            }} />
        )}

        {/* ── 题字：MEMENTO MORI · 白斜体压主页同形蓝三角，字出时双圈蓝波纹外扩 ── */}
        {phase >= 2 && (
          <div className="absolute inset-x-0 flex flex-col items-center pointer-events-none select-none" style={{ top: '47.5%' }}>
            <div style={{
              fontSize: 'clamp(0.65rem, 2.6vw, 0.85rem)', fontWeight: 800, letterSpacing: '0.55em',
              color: '#35d1e8', textShadow: '0 1px 10px rgba(2,8,20,0.85), 0 0 18px rgba(53,209,232,0.45)', paddingLeft: '0.55em',
              animation: `p3s-rise ${0.4 * s}s ease-out both`,
              '--rise-o': 0.85,
            } as CSSProperties}>
              MEMENTO MORI
            </div>
            <div className="relative mt-3" style={{ animation: `p3s-slam ${0.3 * s}s cubic-bezier(0.2, 0.9, 0.3, 1) ${0.08 * s}s both` }}>
              {/* 外扩蓝波纹：双圈错拍（居中于题字，先出在字后） */}
              {[0, 1].map((r) => (
                <span key={r} className="absolute left-1/2 top-1/2 rounded-full"
                  style={{
                    width: 'min(64vw, 330px)', aspectRatio: '1',
                    border: `${r === 0 ? 2 : 1.5}px solid rgba(53,209,232,${r === 0 ? 0.5 : 0.32})`,
                    animation: `p3s-titlering ${(0.62 + r * 0.14) * s}s cubic-bezier(0.16, 0.8, 0.3, 1) ${(0.06 + r * 0.12) * s}s both`,
                  }} />
              ))}
              {/* 底衬三角：主页 TitleTri 同形同姿（微逆旋），铺在字后 */}
              <svg viewBox="0 0 300 80" aria-hidden
                className="absolute"
                style={{ left: '-7%', right: '-4%', top: '4%', bottom: '-10%', width: '111%', height: '106%', transform: 'rotate(-2deg)', overflow: 'visible' }}>
                <path d={P3S_TRI_PATH} fill="#1b57ff" />
              </svg>
              {/* 题字碎屑：slam 中后段错拍迸出（容器在跑 slam → 碎屑随题字移动），散开即灭。
                  外层 ease-in 纯 X 位移 = 向右加速度；内层迸散（减速）+ 旋转 + 消隐 */}
              {P3S_TITLE_DEBRIS.map((d) => (
                <div key={d.id} className="absolute" aria-hidden
                  style={{
                    left: d.left, top: d.top, width: d.w, height: d.w * 0.27,
                    '--td-ax': `${d.ax}px`,
                    animation: `p3s-tridebris-x ${0.45 * s}s cubic-bezier(0.5, 0, 0.8, 0.35) ${d.delay * s}s forwards`,
                  } as CSSProperties}>
                  <div className="absolute inset-0"
                    style={{
                      opacity: 0,
                      '--td-r0': `${d.r0}deg`,
                      '--td-r1': `${d.r1}deg`,
                      '--td-x': `${d.dx}px`,
                      '--td-y': `${d.dy}px`,
                      animation: `p3s-tridebris ${0.45 * s}s cubic-bezier(0.2, 0.7, 0.35, 1) ${d.delay * s}s forwards`,
                    } as CSSProperties}>
                    <svg viewBox="0 0 300 80" className="h-full w-full" style={{ overflow: 'visible' }}>
                      <path d={P3S_TRI_PATH} fill={d.fill} />
                    </svg>
                  </div>
                </div>
              ))}
              <span className="relative" style={{
                fontSize: 'clamp(2.65rem, 11.5vw, 4.3rem)', fontWeight: 900, fontStyle: 'italic',
                color: '#ffffff', letterSpacing: '0.05em', lineHeight: 1.15,
                fontFamily: '"Noto Sans SC Black", "Velvet Sans SC", sans-serif',
                textShadow: '2px 3px 0 rgba(4, 12, 42, 0.55), 0 0 26px rgba(27, 87, 255, 0.35)',
              }}>
                靛蓝色房间
              </span>
            </div>
          </div>
        )}

      </div>

      {/* 收幕 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, #010510, #000208)', animation: `p3s-fadein ${0.45 * s}s ease-in ${1.75 * s}s both` }} />
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
