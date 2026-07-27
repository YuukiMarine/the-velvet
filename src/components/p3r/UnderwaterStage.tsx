/**
 * UnderwaterStage —— 蓝频道（P3）的全局舞台背景，照用户参考图 1:1 复刻。
 *
 * 自上而下：
 *   1. 水体：亮蓝 → 深蓝 → 蓝紫（越往下越偏紫，参考图口径）；
 *   2. 水面波光：从水底往上看到的那种交错亮带（caustics）——用两条正弦叠出的
 *      「丝带」互相穿插，不是简单的波浪填充。4 张相位不同的帧横排成 400% 胶片，
 *      steps(4) 于 1s 走完一轮 = 每秒 4 帧的定格动画；
 *   3. 散射光：只有三条很宽的光柱，从水面上方的锥顶扇下来；整块绕锥顶匀速转，
 *      因为 repeating-conic-gradient 每 26° 重复，转满 26° 与初态重合 → 无缝地
 *      「缓慢从左向右」推移；
 *   4. 两侧：半调网点三角斑 + 亮青/深蓝的菱形碎片；
 *   5. 水底：左右两块深蓝紫斜坡。
 *
 * 整层 pointer-events-none + contain:strict，不参与布局、不接事件、重绘锁死在自身。
 */

// ── 2 · 水面波光：4 帧定格胶片 ───────────────────────────────────────────────
const VB_W = 400;
const VB_H = 150;

/**
 * 一条「波光丝带」：上下缘各一条正弦，厚度沿 x 再被一条低频正弦调制 ——
 * 于是丝带时粗时细、互相穿插，接近水面焦散的观感（而不是等宽波浪条）。
 */
const ribbon = (base: number, amp: number, freq: number, phase: number, thick: number, thickFreq: number): string => {
  const top: string[] = [];
  const bot: string[] = [];
  for (let x = 0; x <= VB_W; x += 8) {
    const t = (x / VB_W) * Math.PI * 2;
    const y = base + Math.sin(t * freq + phase) * amp + Math.sin(t * (freq * 1.9) + phase * 1.4) * amp * 0.35;
    const h = thick * (0.45 + 0.55 * Math.abs(Math.sin(t * thickFreq + phase * 0.8)));
    top.push(`${x} ${(y - h / 2).toFixed(1)}`);
    bot.push(`${x} ${(y + h / 2).toFixed(1)}`);
  }
  return `M${top.join(' L')} L${bot.reverse().join(' L')} Z`;
};

/** 单帧：多条丝带交错 + 顶部一层更亮的水面带 */
const RippleFrame = ({ phase }: { phase: number }) => (
  <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="h-full w-1/4 shrink-0">
    {/* 贴着水面的整片亮区 */}
    <path d={ribbon(20, 9, 2, phase, 44, 3)} fill="#8fe9ff" opacity="0.92" />
    {/* 交错丝带 */}
    <path d={ribbon(46, 13, 2, phase + 0.6, 15, 3.2)} fill="#a9f2ff" />
    <path d={ribbon(62, 16, 3, phase + 2.2, 11, 4.1)} fill="#7fe3ff" opacity="0.85" />
    <path d={ribbon(84, 12, 2.5, phase + 3.6, 9, 2.6)} fill="#6ddcff" opacity="0.7" />
    <path d={ribbon(104, 15, 3.4, phase + 1.1, 7, 4.6)} fill="#5ad4ff" opacity="0.5" />
    <path d={ribbon(124, 11, 2.2, phase + 4.4, 5, 3.3)} fill="#4fceff" opacity="0.34" />
  </svg>
);

const PHASES = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];

// ── 4 · 两侧菱形碎片（亮青 / 深蓝成对，照参考图布点）───────────────────────
const DIAMOND = 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)';
const SHARDS: Array<{ l?: string; r?: string; t: string; w: number; h: number; c: string; rot: number }> = [
  { l: '4%', t: '12%', w: 22, h: 52, c: '#5fe4ff', rot: -8 },
  { l: '3%', t: '19%', w: 20, h: 46, c: '#0d1f7a', rot: -8 },
  { r: '5%', t: '17%', w: 19, h: 44, c: '#0d1f7a', rot: 8 },
  { r: '4%', t: '22%', w: 21, h: 50, c: '#5fe4ff', rot: 8 },
  { l: '7%', t: '56%', w: 23, h: 54, c: '#7fefff', rot: -6 },
  { l: '15%', t: '72%', w: 20, h: 48, c: '#9df4ff', rot: -6 },
  { l: '11%', t: '79%', w: 18, h: 42, c: '#0a1a6e', rot: -6 },
  { r: '7%', t: '60%', w: 20, h: 48, c: '#7fefff', rot: 6 },
  { r: '10%', t: '66%', w: 17, h: 40, c: '#0a1a6e', rot: 6 },
];

export const UnderwaterStage = () => (
  <div
    aria-hidden
    className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    style={{ contain: 'strict' }}
  >
    {/* 1 · 水体：越往下越偏深蓝紫 */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(180deg, #1aa9f2 0%, #1592ec 14%, #1276e4 34%, #0f55d6 56%, #1436bd 76%, #1a239f 90%, #1d1c86 100%)',
      }}
    />

    {/* 3 · 三条很宽的散射光：26° 一个重复周期，转满 26° 无缝接回 */}
    <div
      className="absolute"
      style={{
        inset: '-65%',
        transformOrigin: '50% 21%',
        background:
          'repeating-conic-gradient(from 0deg at 50% 21%,' +
          ' rgba(255,255,255,0) 0deg,' +
          ' rgba(255,255,255,0.16) 5deg,' +
          ' rgba(255,255,255,0.16) 12deg,' +
          ' rgba(255,255,255,0) 17deg,' +
          ' rgba(255,255,255,0) 26deg)',
        animation: 'p3-underwater-rays 44s linear infinite',
        willChange: 'transform',
      }}
    />

    {/* 2 · 水面波光：1s / 4 帧定格 */}
    <div className="absolute inset-x-0 top-0 h-[13vh] min-h-[86px] overflow-hidden">
      <div className="flex h-full w-[400%]" style={{ animation: 'p3-underwater-ripple 1s steps(4) infinite', willChange: 'transform' }}>
        {PHASES.map((p, i) => <RippleFrame key={i} phase={p} />)}
      </div>
    </div>

    {/* 4 · 半调网点三角斑（左上 / 右上，向外淡出） */}
    <div
      className="absolute left-0 top-[8%] h-[36%] w-[17%]"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(130,230,255,0.55) 1.8px, transparent 2.1px)',
        backgroundSize: '12px 12px',
        maskImage: 'linear-gradient(126deg, #000 2%, transparent 58%)',
        WebkitMaskImage: 'linear-gradient(126deg, #000 2%, transparent 58%)',
      }}
    />
    <div
      className="absolute right-0 top-[7%] h-[32%] w-[15%]"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(130,230,255,0.5) 1.7px, transparent 2px)',
        backgroundSize: '12px 12px',
        maskImage: 'linear-gradient(234deg, #000 2%, transparent 56%)',
        WebkitMaskImage: 'linear-gradient(234deg, #000 2%, transparent 56%)',
      }}
    />

    {/* 5 · 水底深蓝紫斜坡 */}
    <div className="absolute inset-x-0 bottom-0 h-[46%]">
      {/* 左右两块各自贴边，故意不对称、不在中线交汇（对称的 V 一眼假） */}
      <div className="absolute inset-0" style={{ background: '#141b8e', clipPath: 'polygon(0 52%, 24% 100%, 0 100%)' }} />
      <div className="absolute inset-0" style={{ background: '#161d96', clipPath: 'polygon(100% 24%, 100% 100%, 46% 100%)' }} />
      <div className="absolute inset-0" style={{ background: '#101567', clipPath: 'polygon(100% 62%, 100% 100%, 72% 100%)' }} />
    </div>

    {/* 4 · 菱形碎片 */}
    {SHARDS.map((s, i) => (
      <span
        key={i}
        className="absolute"
        style={{
          left: s.l,
          right: s.r,
          top: s.t,
          width: s.w,
          height: s.h,
          background: s.c,
          transform: `rotate(${s.rot}deg)`,
          clipPath: DIAMOND,
        }}
      />
    ))}
  </div>
);
