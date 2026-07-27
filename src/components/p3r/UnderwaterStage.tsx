/**
 * UnderwaterStage —— 蓝频道（P3）的全局舞台背景。
 *
 * 自上而下：
 *   1. 水体：亮蓝 → 深蓝 → 靛紫（底部收到 #4B0082）；
 *   2. 水面波纹：直接用用户提供的 water.svg 线稿（WATER_PATH_* 两条路径原样搬过来），
 *      8 帧定格 —— 同一张线稿按 8 组位移/纵向缩放/镜像排成 800% 宽的胶片，
 *      steps(8) 于 1s 走完一轮 = 每秒 8 帧；
 *   3. 散射光：三条很宽的光柱，硬边不羽化；整块绕水面上方的锥顶匀速转，
 *      repeating-conic-gradient 每 34° 重复，转满 34° 与初态重合 → 无缝左→右推移；
 *   4. 两侧：半调网点三角斑 + 下半部的菱形碎片（顶部那两组按定稿删掉了）；
 *   5. 水底：左右两块深靛紫斜坡。
 *
 * 挂载位置在 App 根（非页面内），所以翻页不会重挂、动画不会重来。
 * `motion=false` 时保留整幅画面、只停掉两处循环动画（设置里的开关 / 系统减动效）。
 */

// ── 2 · 水面波纹：water.svg 原始路径 ────────────────────────────────────────
const WATER_PATH_MAIN =
  'M460.83,168.33c0,0,6.5,1.67,9.67,1.33c-28.17,7.5-60.5,7.33-67.17-0.83c1.83,1.83,6.5-0.33,6.5-0.33' +
  's-55.17-3.83-53.5-6.17c20.33-3,24-0.17,66.17-11.17c47.67-8.17,65.67-7,65.67-7s-0.17-6.67-68-11.33c-29.83-2-28-4.83-28-4.83' +
  's49.67-19.33,81.5-21c17,0,70.17-0.17,73.17-0.17s32.83-5.67,32.83-5.67l-8.05-11.24H548c0,0-8,4.74-29.5,5.74' +
  'c-0.5,0.5-59.33-0.83-78.67,2.17c-19.33,3-61.17,22.5-93.5,22C329,119.67,238,113.5,246.67,107.5C275.17,98.33,343,89.92,343,89.92' +
  'H191c0,0-20.5,6.08,12.83,10.58c17.83,3,31.67,12.17-45.83,16.33C82.83,102,18.5,110,18.5,110l-21.17,2.33l0.67,8.83l25.33-2.5' +
  'c0,0,39.17-4.5,76.83,11.5c83.33,16.33,77.67,19.67,76.83,20.67c-2.83,3.67-61,11-93.83,6.33c-18-2.5-20.67-5.83-56.33-0.33' +
  'c0,0,74.67,13.5,127.5,15.5c34.33-3.83,44.17-1,44.17-1s37.83,2.83,44.5-0.17c0,0.17-47.67-10.5-47.67-15.33' +
  'c7.5-4.33,54.17-3.67,58.83-5.17c-6.17-4.33-89-15.5-89-15.5s91.33-21.33,142.67,3.17c29,8,28.5,8.67,28.5,8.67s-62.17,19-74.67,20' +
  'c-12.67,1,36.5,6.5,76,2.83c47,4.5,53.33,8.17,53.33,8.17s-12.83,0.67-25.67,4.67c-15.67,9.33-53.33,7-65.33,4.67s-39,2.09-39,2.09' +
  's23.5,3.08,21.33,5.41c-3.33,1-11.17,2.33-37.67,5.83C231.33,200,259.83,206.83,280,203c15.67-0.83,22.5,4.02,42.83,1.17' +
  'c0.67-1.17-24.5-4.17-24.33-8.17c4.33-3,33-1.67,48.17,0.83c15.17,2.5,93.67-11.17,107.83-12.5s27.67-2.5,46.67,1.17' +
  'c18.83,5.67,58.5-5.33,58.5-5.33c-37.67,4.5-65.67-1-61.33-4.83c0,0,17.57-9.33,73.28-12.83v-10.83c0,0-34.12,4.67-60.12,6.83' +
  'C477.33,166.17,460.83,168.33,460.83,168.33z M336,134.33c23.56-5.28,60,5.67,60,5.67C381.67,143.33,352,141.67,336,134.33z';
const WATER_PATH_TAIL =
  'M571.62,110.33c0,0-49.28-4.33-79.95,14c13,1.33,32.33-3.67,65,0c17.67,3.33,14.95,2.33,14.95,2.33V110.33z';

/** 8 帧：同一张线稿的位移 / 纵向缩放 / 镜像组合，逐帧跳变（不是补间）。
 *  幅度按定稿收窄——原来位移 ±66、纵缩 ±9% 抖得太凶，现在只留轻微晃动。 */
const FRAMES: Array<{ dx: number; dy: number; sy: number; flip: boolean }> = [
  { dx: 0, dy: 0, sy: 1, flip: false },
  { dx: -5, dy: 0.8, sy: 1.02, flip: false },
  { dx: -10, dy: -0.5, sy: 0.985, flip: true },
  { dx: -15, dy: 1.1, sy: 1.012, flip: true },
  { dx: -3, dy: -0.8, sy: 0.978, flip: false },
  { dx: -8, dy: 0.4, sy: 1.026, flip: true },
  { dx: -13, dy: -1, sy: 0.99, flip: false },
  { dx: -18, dy: 0.7, sy: 1.006, flip: true },
];

const VB_X = -4;
const VB_Y = 84;
const VB_W = 600;
const VB_H = 126;

const RippleFrame = ({ f }: { f: (typeof FRAMES)[number] }) => {
  const cx = VB_X + VB_W / 2;
  const cy = VB_Y + VB_H / 2;
  const t = [
    `translate(${f.dx} ${f.dy})`,
    `translate(${cx} ${cy})`,
    `scale(${f.flip ? -1 : 1} ${f.sy})`,
    `translate(${-cx} ${-cy})`,
  ].join(' ');
  return (
    <svg viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`} preserveAspectRatio="none" className="h-full w-1/8 shrink-0" style={{ width: '12.5%' }}>
      <g transform={t} fill="#a9f0ff" opacity="0.62">
        <path d={WATER_PATH_MAIN} />
        <path d={WATER_PATH_TAIL} />
      </g>
    </svg>
  );
};

// ── 4 · 下半部的菱形碎片（顶部两组按定稿删除）──────────────────────────────
const DIAMOND = 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)';
const SHARDS: Array<{ l?: string; r?: string; t: string; w: number; h: number; c: string; rot: number }> = [
  { l: '7%', t: '56%', w: 23, h: 54, c: '#7fefff', rot: -6 },
  { l: '15%', t: '72%', w: 20, h: 48, c: '#9df4ff', rot: -6 },
  { l: '11%', t: '79%', w: 18, h: 42, c: '#2c0a72', rot: -6 },
  { r: '7%', t: '60%', w: 20, h: 48, c: '#7fefff', rot: 6 },
  { r: '10%', t: '66%', w: 17, h: 40, c: '#2c0a72', rot: 6 },
];

export const UnderwaterStage = ({ motion = true }: { motion?: boolean }) => (
  <div
    aria-hidden
    className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    style={{ contain: 'strict' }}
  >
    {/* 1 · 水体：底部收到靛紫 #4B0082 */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(180deg, #1aa9f2 0%, #1592ec 12%, #1276e4 30%, #0f4fd2 50%, #1a2fb4 68%, #33169c 84%, #4B0082 100%)',
      }}
    />

    {/* 3 · 三条很宽的散射光：硬边不羽化；34° 一个重复周期，转满 34° 无缝接回 */}
    <div
      className="absolute"
      // inset 拉到 -150%：原来 -70% 时元素本身不够大，旋转后它的下缘会露在画面里
      // （用户上报"光效太短、最下方边缘露出来"）。锥顶落在视口 y≈-8%：
      // 元素高 400vh、顶在 -150vh → 顶点分数 = (-8+150)/400 = 35.5%。
      style={{
        inset: '-150%',
        transformOrigin: '50% 35.5%',
        background:
          'repeating-conic-gradient(from -17deg at 50% 35.5%,' +
          ' rgba(255,255,255,0.09) 0deg 18deg,' +
          ' rgba(255,255,255,0) 18deg 34deg)',
        animation: motion ? 'p3-underwater-rays 52s linear infinite' : 'none',
        willChange: motion ? 'transform' : undefined,
      }}
    />

    {/* 2 · 水面波纹：1s / 8 帧定格 */}
    <div className="absolute inset-x-0 top-0 h-[14vh] min-h-[92px] overflow-hidden">
      <div
        className="flex h-full"
        style={{ width: '800%', animation: motion ? 'p3-underwater-ripple 1s steps(8) infinite' : 'none', willChange: motion ? 'transform' : undefined }}
      >
        {FRAMES.map((f, i) => <RippleFrame key={i} f={f} />)}
      </div>
    </div>

    {/* 4 · 半调网点三角斑 */}
    <div
      className="absolute left-0 top-[9%] h-[34%] w-[16%]"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(130,230,255,0.5) 1.8px, transparent 2.1px)',
        backgroundSize: '12px 12px',
        maskImage: 'linear-gradient(126deg, #000 2%, transparent 58%)',
        WebkitMaskImage: 'linear-gradient(126deg, #000 2%, transparent 58%)',
      }}
    />
    <div
      className="absolute right-0 top-[8%] h-[30%] w-[14%]"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(130,230,255,0.45) 1.7px, transparent 2px)',
        backgroundSize: '12px 12px',
        maskImage: 'linear-gradient(234deg, #000 2%, transparent 56%)',
        WebkitMaskImage: 'linear-gradient(234deg, #000 2%, transparent 56%)',
      }}
    />

    {/* 5 · 水底靛紫斜坡（左右不对称、不在中线交汇） */}
    <div className="absolute inset-x-0 bottom-0 h-[46%]">
      <div className="absolute inset-0" style={{ background: '#2e1290', clipPath: 'polygon(0 52%, 24% 100%, 0 100%)' }} />
      <div className="absolute inset-0" style={{ background: '#331495', clipPath: 'polygon(100% 24%, 100% 100%, 46% 100%)' }} />
      <div className="absolute inset-0" style={{ background: '#25086e', clipPath: 'polygon(100% 62%, 100% 100%, 72% 100%)' }} />
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
