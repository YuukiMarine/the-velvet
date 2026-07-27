/**
 * UnderwaterStage —— 蓝频道（P3）的全局舞台背景。
 *
 * 三层结构，全部纯 CSS/SVG、零 JS 每帧开销：
 *   1. 水体：自上而下由亮青过渡到深蓝的竖向渐变；
 *   2. 光柱：以水面上方一点为锥顶的重复扇形光束，整块绕锥顶匀速旋转 —— 因为
 *      repeating-conic-gradient 每 9° 重复一次，转满 9° 即与初态重合，所以
 *      「光缓慢从左向右扫」是无缝循环，看不到跳帧；
 *   3. 水面波纹：4 张相位不同的波形帧横排成 400% 宽的胶片，用 steps(4) 在 1s 内
 *      平移一整轮 —— 即每秒 4 帧的定格动画（用户口径），不是补间的平滑波动。
 *
 * 另有半调网点、漂浮碎片与水底暗色斜坡呼应参考稿。整层 pointer-events-none +
 * contain:strict，不参与布局、不接事件、重绘范围锁死在自身。
 */

// ── 水面波纹：4 帧定格胶片 ───────────────────────────────────────────────────
const VB_W = 400;
const VB_H = 150;

/** 由两组不同频率的正弦叠加出的波带（自顶部实心填到波形线） */
const wavePath = (phase: number, amp: number, base: number): string => {
  let d = `M0 ${base.toFixed(1)}`;
  for (let x = 0; x <= VB_W; x += 8) {
    const t = (x / VB_W) * Math.PI * 2;
    const y = base + Math.sin(t * 2 + phase) * amp + Math.sin(t * 3.5 + phase * 1.7) * amp * 0.55;
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `${d} L${VB_W} 0 L0 0 Z`;
};

/** 单帧：三条深浅不同的波带叠出水面焦散 */
const RippleFrame = ({ phase }: { phase: number }) => (
  <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="h-full w-1/4 shrink-0">
    <path d={wavePath(phase, 13, 96)} fill="#3fd0ff" opacity="0.55" />
    <path d={wavePath(phase + 0.9, 16, 74)} fill="#7fe6ff" opacity="0.75" />
    <path d={wavePath(phase + 2.1, 11, 46)} fill="#a9f0ff" />
  </svg>
);

const PHASES = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

// ── 漂浮碎片（参考稿里的亮青 / 深蓝小菱片，位置固定不随机） ──────────────────
const SHARDS: Array<{ l: string; t: string; w: number; h: number; c: string; r: number }> = [
  { l: '7%', t: '13%', w: 15, h: 34, c: '#5fe4ff', r: -14 },
  { l: '4%', t: '20%', w: 13, h: 30, c: '#0b1f8a', r: -14 },
  { l: '92%', t: '17%', w: 12, h: 26, c: '#0b1f8a', r: 12 },
  { l: '94%', t: '22%', w: 14, h: 32, c: '#5fe4ff', r: 12 },
  { l: '10%', t: '58%', w: 16, h: 36, c: '#7fefff', r: -10 },
  { l: '16%', t: '74%', w: 13, h: 30, c: '#9df4ff', r: -8 },
  { l: '13%', t: '80%', w: 12, h: 26, c: '#0a1c78', r: -8 },
  { l: '89%', t: '62%', w: 13, h: 30, c: '#7fefff', r: 10 },
  { l: '86%', t: '68%', w: 12, h: 26, c: '#0a1c78', r: 10 },
];

export const UnderwaterStage = () => (
  <div
    aria-hidden
    className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    style={{ contain: 'strict' }}
  >
    {/* 1 · 水体 */}
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(180deg, #1fb6f7 0%, #189af2 0%, #1a95ec 24%, #166fde 54%, #1146c8 80%, #0d31b0 100%)' }}
    />

    {/* 2 · 光柱：绕锥顶旋转一个重复周期（9°）→ 无缝的「从左向右扫」 */}
    <div
      className="absolute"
      style={{
        inset: '-60%',
        transformOrigin: '50% 22.7%',
        background:
          'repeating-conic-gradient(from 0deg at 50% 22.7%, rgba(255,255,255,0.13) 0deg 3.2deg, rgba(255,255,255,0) 3.2deg 9deg)',
        animation: 'p3-underwater-rays 26s linear infinite',
        willChange: 'transform',
      }}
    />

    {/* 3 · 水面波纹：1s / 4 帧定格 */}
    <div className="absolute inset-x-0 top-0 h-[15vh] min-h-[96px] overflow-hidden">
      <div className="flex h-full w-[400%]" style={{ animation: 'p3-underwater-ripple 1s steps(4) infinite', willChange: 'transform' }}>
        {PHASES.map((p, i) => <RippleFrame key={i} phase={p} />)}
      </div>
    </div>

    {/* 半调网点（两侧） */}
    <div
      className="absolute left-0 top-[9%] h-[34%] w-[15%]"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(120,225,255,0.5) 1.6px, transparent 1.9px)',
        backgroundSize: '11px 11px',
        maskImage: 'linear-gradient(115deg, #000 12%, transparent 72%)',
        WebkitMaskImage: 'linear-gradient(115deg, #000 12%, transparent 72%)',
      }}
    />
    <div
      className="absolute right-0 top-[8%] h-[30%] w-[13%]"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(120,225,255,0.45) 1.5px, transparent 1.8px)',
        backgroundSize: '11px 11px',
        maskImage: 'linear-gradient(245deg, #000 12%, transparent 70%)',
        WebkitMaskImage: 'linear-gradient(245deg, #000 12%, transparent 70%)',
      }}
    />

    {/* 水底暗色斜坡 */}
    <div className="absolute inset-x-0 bottom-0 h-[42%]">
      <div className="absolute inset-0" style={{ background: '#0a2597', clipPath: 'polygon(0 46%, 26% 100%, 0 100%)' }} />
      <div className="absolute inset-0" style={{ background: '#0b2ba6', clipPath: 'polygon(100% 22%, 100% 100%, 44% 100%)' }} />
      <div className="absolute inset-0" style={{ background: '#0a2085', clipPath: 'polygon(100% 58%, 100% 100%, 68% 100%)' }} />
    </div>

    {/* 漂浮碎片 */}
    {SHARDS.map((s, i) => (
      <span
        key={i}
        className="absolute"
        style={{
          left: s.l,
          top: s.t,
          width: s.w,
          height: s.h,
          background: s.c,
          transform: `rotate(${s.r}deg)`,
          clipPath: 'polygon(24% 0, 100% 0, 76% 100%, 0 100%)',
        }}
      />
    ))}
  </div>
);
