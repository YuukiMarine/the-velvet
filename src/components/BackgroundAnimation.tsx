/**
 * BackgroundAnimation
 * ────────────────────────────────────────────────────────────
 * 四种纯 CSS 背景动画，颜色跟随 --color-primary CSS 变量，
 * 所有动画通过 style 标签注入 @keyframes，零 JS 运行开销。
 *
 * aurora    — 极光：三个大色块缓慢漂移
 * particles — 粒子：细小圆点缓慢浮动
 * wave      — 渐变波：全屏渐变背景位移
 * pulse     — 脉冲：半透明网格线呼吸
 *
 * 性能优化（Android 防闪烁）：
 * - 所有动画元素使用 transform: translateZ(0) 强制独立 GPU 合成层
 * - backface-visibility: hidden 避免层提升时的重绘
 * - contain: strict 限制重绘范围，不影响父文档布局
 * - wave 改用 transform: translate3d 替代 background-position，
 *   确保动画完全在合成器线程（compositor thread）执行，不触发重绘
 * - aurora blur 在移动端降至 40px，减少 GPU 纹理带宽压力
 */

import { useEffect } from 'react';

interface BackgroundAnimationProps {
  styles: string[];
  darkMode?: boolean;
}

// ── 注入一次性 keyframes CSS（去重）───────────────────────
const KEYFRAMES_ID = 'bg-anim-keyframes';

function ensureKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  const el = document.createElement('style');
  el.id = KEYFRAMES_ID;
  el.textContent = `
    /* aurora — 使用 translate3d 确保 compositor 线程执行 */
    @keyframes aurora-a {
      0%   { transform: translate3d(0%,    0%,    0) scale(1);    }
      33%  { transform: translate3d(8%,   -12%,   0) scale(1.08); }
      66%  { transform: translate3d(-6%,   8%,    0) scale(0.95); }
      100% { transform: translate3d(0%,    0%,    0) scale(1);    }
    }
    @keyframes aurora-b {
      0%   { transform: translate3d(0%,   0%,   0) scale(1);    }
      40%  { transform: translate3d(-10%,  10%,  0) scale(1.12); }
      75%  { transform: translate3d(7%,  -6%,   0) scale(0.92); }
      100% { transform: translate3d(0%,   0%,   0) scale(1);    }
    }
    @keyframes aurora-c {
      0%   { transform: translate3d(0%,  0%,  0) scale(1);    }
      50%  { transform: translate3d(5%,  12%, 0) scale(1.06); }
      80%  { transform: translate3d(-8%, -5%, 0) scale(0.97); }
      100% { transform: translate3d(0%,  0%,  0) scale(1);    }
    }

    /* particles — drift wrapper uses translateX, rise inner uses translateY
       拆成父子两层各控制一个轴，避免 margin-left 触发 layout */
    @keyframes particle-drift {
      0%   { transform: translate3d(0,   0, 0); }
      50%  { transform: translate3d(30px,0, 0); }
      100% { transform: translate3d(0,   0, 0); }
    }
    @keyframes particle-rise {
      0%   { transform: translate3d(0, 0, 0)      scale(1);   opacity: 0;   }
      10%  { opacity: 1; }
      85%  { opacity: 0.7; }
      100% { transform: translate3d(0, -110vh, 0)  scale(0.6); opacity: 0;   }
    }

    /* wave — 用 translate3d 在独立层上平移，避免 background-position 重绘 */
    @keyframes wave-shift {
      0%   { transform: translate3d(0%,    0%, 0); }
      33%  { transform: translate3d(-15%,  8%, 0); }
      66%  { transform: translate3d(10%,  -8%, 0); }
      100% { transform: translate3d(0%,    0%, 0); }
    }

    /* pulse */
    @keyframes grid-breathe {
      0%, 100% { opacity: 0.06; }
      50%       { opacity: 0.14; }
    }
    @keyframes grid-breathe-dark {
      0%, 100% { opacity: 0.08; }
      50%       { opacity: 0.18; }
    }
  `;
  document.head.appendChild(el);
}

// ── Aurora ────────────────────────────────────────────────
function Aurora({ darkMode }: { darkMode?: boolean }) {
  const baseOp = darkMode ? 0.18 : 0.13;
  const blobs = [
    { anim: 'aurora-a 22s ease-in-out infinite', size: '70vmax', top: '-20%', left: '-15%',  opacity: baseOp },
    { anim: 'aurora-b 28s ease-in-out infinite', size: '65vmax', top: '30%',  left: '40%',   opacity: baseOp * 0.85 },
    { anim: 'aurora-c 18s ease-in-out infinite', size: '55vmax', top: '55%',  left: '-10%',  opacity: baseOp * 0.7 },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        contain: 'strict',
      }}
    >
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            borderRadius: '50%',
            // 用更大的 radial-gradient 中间段模拟 blur，避免实时 filter: blur
            // 比 blur(40px) 性能高一个数量级，视觉上几乎等效
            background: 'radial-gradient(circle, var(--color-primary) 0%, var(--color-primary) 15%, transparent 65%)',
            opacity: b.opacity,
            animation: b.anim,
            willChange: 'transform',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        />
      ))}
    </div>
  );
}

// ── Particles ─────────────────────────────────────────────
const PARTICLE_CONFIG = [
  { left: '8%',  size: 4, dur: 18, delay: 0,    drift: 25 },
  { left: '18%', size: 3, dur: 24, delay: 4,    drift: 18 },
  { left: '29%', size: 5, dur: 20, delay: 1.5,  drift: 32 },
  { left: '40%', size: 3, dur: 26, delay: 7,    drift: 20 },
  { left: '51%', size: 4, dur: 22, delay: 2,    drift: 15 },
  { left: '62%', size: 3, dur: 30, delay: 9,    drift: 28 },
  { left: '73%', size: 5, dur: 19, delay: 3,    drift: 22 },
  { left: '84%', size: 3, dur: 25, delay: 6,    drift: 12 },
  { left: '91%', size: 4, dur: 21, delay: 11,   drift: 30 },
  { left: '14%', size: 3, dur: 27, delay: 13,   drift: 18 },
  { left: '46%', size: 4, dur: 23, delay: 5,    drift: 24 },
  { left: '77%', size: 3, dur: 29, delay: 8,    drift: 16 },
];

function Particles({ darkMode }: { darkMode?: boolean }) {
  const op = darkMode ? 0.5 : 0.35;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        contain: 'layout style',
      }}
    >
      {PARTICLE_CONFIG.map((p, i) => (
        /* 外层: drift（translateX），独立合成层 */
        <div
          key={i}
          style={{
            position: 'absolute',
            bottom: '-10px',
            left: p.left,
            animation: `particle-drift ${p.dur * 0.6}s ease-in-out ${p.delay}s infinite`,
            willChange: 'transform',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        >
          {/* 内层: rise（translateY + scale + opacity） */}
          <div
            style={{
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              opacity: op,
              animation: `particle-rise ${p.dur}s ease-in ${p.delay}s infinite`,
              willChange: 'transform, opacity',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Wave ──────────────────────────────────────────────────
// 旧实现用 background-position 动画——这在浏览器合成器层面不可加速，
// 每帧都会触发重绘（paint），在 Android 上尤其严重。
// 新实现：把渐变画在一个放大的子 div 上（150vmax × 150vmax），
// 用 translate3d 平移该子 div——translate 是纯合成器操作，零重绘。
function Wave({ darkMode }: { darkMode?: boolean }) {
  const op = darkMode ? 0.12 : 0.08;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        contain: 'strict',
      }}
    >
      <div
        style={{
          position: 'absolute',
          // 比视口大，使平移时不露白边
          top: '-25%',
          left: '-25%',
          width: '150%',
          height: '150%',
          backgroundImage: [
            'radial-gradient(ellipse at 30% 40%, var(--color-primary) 0%, transparent 50%)',
            'radial-gradient(ellipse at 70% 60%, var(--color-secondary, var(--color-primary)) 0%, transparent 50%)',
            'radial-gradient(ellipse at 50% 50%, var(--color-primary) 0%, transparent 40%)',
          ].join(', '),
          opacity: op,
          animation: 'wave-shift 20s ease-in-out infinite',
          willChange: 'transform',
          // 强制独立合成层
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
    </div>
  );
}

// ── Pulse ─────────────────────────────────────────────────
function Pulse({ darkMode }: { darkMode?: boolean }) {
  const animName = darkMode ? 'grid-breathe-dark' : 'grid-breathe';
  // 与 keyframes 0% 帧对齐的初始 opacity，避免动画启动前/延迟期间出现"满亮度闪烁"
  const initialOpacity = darkMode ? 0.08 : 0.06;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        contain: 'strict',
      }}
    >
      {/* 横线 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(0deg, var(--color-primary) 1px, transparent 1px)',
          backgroundSize: '100% 48px',
          opacity: initialOpacity,                              // 初始帧锁定，防止首帧拉满
          animation: `${animName} 4s ease-in-out infinite`,
          animationFillMode: 'both',                            // 0% 帧立即生效（含延迟期）
          willChange: 'opacity',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
      {/* 竖线 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)',
          backgroundSize: '48px 100%',
          opacity: initialOpacity,                              // 同上：与 2s 延迟期间保持一致
          animation: `${animName} 4s ease-in-out infinite 2s`,
          animationFillMode: 'both',                            // backwards 让 0% 帧在 2s 延迟期就锁定
          willChange: 'opacity',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
    </div>
  );
}

// ── 主导出 ─────────────────────────────────────────────────
export function BackgroundAnimation({ styles, darkMode }: BackgroundAnimationProps) {
  useEffect(() => { ensureKeyframes(); }, []);
  return (
    <div
      className="fixed inset-0 pointer-events-none select-none"
      style={{
        zIndex: 0,
        // 整个背景动画容器提升为独立合成层，
        // 与页面内容（z-10）隔离，页面切换/弹窗时不共享重绘
        isolation: 'isolate',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
      aria-hidden="true"
    >
      {styles.includes('aurora')    && <Aurora    darkMode={darkMode} />}
      {styles.includes('particles') && <Particles darkMode={darkMode} />}
      {styles.includes('wave')      && <Wave      darkMode={darkMode} />}
      {styles.includes('pulse')     && <Pulse     darkMode={darkMode} />}
    </div>
  );
}
