/**
 * HeavyTransition / TransitionLayer —— 重转场演出层（PRD_V2.5_FINAL §4.3）。
 *
 * App 顶层挂 <TransitionLayer/>，向 transitionDirector 注册；仪式点调
 * playHeavyTransition(midpoint) 触发当前频道的演出：
 *   P5 star-tear   ：主题色条+黑条 -20° 斜扫铺满 → midpoint → 幕布被星形「反撕」离场
 *                    （clip 幕布为星形，expanded→collapsed morph，新页从四缘向中心显现）；
 *   P4 stripe-sweep：五色信号带横扫铺满 → midpoint → 续扫出右缘（切镜）；
 *   P3 wave-slice  ：四片深蓝斜切片左右交错合拢 → midpoint → 反向滑开（水面切片）；
 *   neutral fade   ：黑幕淡入淡出。
 * 总时长 0.7~1.0s（guide §7.1 重 cut-in 档）；只用 transform/clip-path/opacity。
 *
 * D0：Layer 拒接请求 → director 同步执行 midpoint，零演出（guide 降级铁律）。
 * 演出中再次触发同样拒接（midpoint 直接执行），防双层幕布。
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { gsap } from '@/utils/gsap';
import { useBoldness } from '@/utils/boldness';
import { zClass } from '@/utils/zIndex';
import { buildStar, STAR_SPIKES } from './starPath';
import { _registerTransitionLayer, type HeavyTransitionRequest } from '@/ui/transitionDirector';

interface ActProps {
  midpoint: () => void;
  onDone: () => void;
}

/** 时间轴工具：挂载即按 [ms, fn] 顺序执行，卸载全清 */
const useTimeline = (steps: [number, () => void][]) => {
  const stepsRef = useRef(steps);
  useEffect(() => {
    const ids = stepsRef.current.map(([ms, fn]) => window.setTimeout(fn, ms));
    return () => ids.forEach(clearTimeout);
  }, []);
};

// ── P5：星形反撕（GSAP MorphSVG，同 StarTearOverlay 技法、方向相反）────────────
const StarTearAct = ({ midpoint, onDone }: ActProps) => {
  const curtainRef = useRef<HTMLDivElement>(null);
  const bar1Ref = useRef<HTMLDivElement>(null);
  const bar2Ref = useRef<HTMLDivElement>(null);
  const morphRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    gsap.registerPlugin(MorphSVGPlugin);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxDim = Math.max(w, h);
    const expanded = buildStar(w / 2, h / 2, STAR_SPIKES, maxDim * 2.2, maxDim * 1.18, 0.42, 23);
    const collapsed = buildStar(w / 2, h / 2, STAR_SPIKES, 4, 2, 0.2, 7);

    const path = morphRef.current!;
    const curtain = curtainRef.current!;
    path.setAttribute('d', expanded);

    const syncClip = () => {
      const d = path.getAttribute('d');
      if (!d) return;
      curtain.style.clipPath = `path('${d}')`;
      (curtain.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = `path('${d}')`;
    };
    syncClip();

    const tl = gsap.timeline({ onComplete: onDone });
    // 双色条斜扫入（幕布铺满）
    tl.fromTo(bar1Ref.current, { xPercent: -140, skewX: -20 }, { xPercent: 0, skewX: -20, duration: 0.22, ease: 'power3.out' }, 0);
    tl.fromTo(bar2Ref.current, { xPercent: -140, skewX: -20 }, { xPercent: 0, skewX: -20, duration: 0.22, ease: 'power3.out' }, 0.04);
    // 全遮时刻：切页（被幕布挡住）
    tl.call(midpoint, undefined, 0.3);
    // 幕布星形反撕离场：星 expanded → collapsed，可见幕布从四缘向中心缩没
    tl.to(path, { duration: 0.42, morphSVG: { shape: collapsed, shapeIndex: 0 }, ease: 'power2.in', onUpdate: syncClip }, 0.38);

    return () => { tl.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`fixed inset-0 ${zClass.transition} pointer-events-auto`} aria-hidden>
      <div ref={curtainRef} className="absolute inset-0">
        <div ref={bar1Ref} className="absolute top-0 bottom-0" style={{ background: 'var(--color-primary)', left: '-30%', width: '160%', zIndex: 1 }} />
        <div ref={bar2Ref} className="absolute top-0 bottom-0" style={{ background: '#0b0b12', left: '-30%', width: '160%', zIndex: 2 }} />
      </div>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <path ref={morphRef} d="M0 0Z" />
      </svg>
    </div>
  );
};

// ── P4：五色信号带切镜 ─────────────────────────────────────────────────────
const STRIPES = ['#d71920', '#ffe100', '#ff6a00', '#20bff2', '#0057ff'];

const StripeSweepAct = ({ midpoint, onDone }: ActProps) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  useTimeline([
    [520, () => { midpoint(); setPhase('out'); }],
    [1040, onDone],
  ]);
  return (
    <div className={`fixed inset-0 ${zClass.transition} pointer-events-auto overflow-hidden`} aria-hidden>
      {STRIPES.map((c, i) => (
        <motion.div
          key={c}
          className="absolute left-0 w-full"
          style={{ background: c, height: '20.5%', top: `${i * 20}%` }}
          initial={{ x: '-102%' }}
          animate={{ x: phase === 'in' ? '0%' : '102%' }}
          transition={{ duration: 0.3, delay: i * 0.05, ease: [0.85, 0, 0.15, 1] }}
        />
      ))}
    </div>
  );
};

// ── P3：深蓝斜切片合拢/滑开 ────────────────────────────────────────────────
const SLICES = [
  { bg: '#0057ff', from: '-120%' },
  { bg: '#001c7a', from: '120%' },
  { bg: '#05070d', from: '-120%' },
  { bg: '#0053d0', from: '120%' },
];

const WaveSliceAct = ({ midpoint, onDone }: ActProps) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  useTimeline([
    [500, () => { midpoint(); setPhase('out'); }],
    [1020, onDone],
  ]);
  return (
    <div className={`fixed inset-0 ${zClass.transition} pointer-events-auto overflow-hidden`} aria-hidden>
      {SLICES.map((s, i) => (
        <motion.div
          key={i}
          className="absolute top-[-10%] bottom-[-10%] border-r-2"
          style={{
            background: s.bg,
            borderRightColor: 'rgba(0,216,255,0.5)',
            width: '31%',
            left: `${i * 25 - 3}%`,
            skewX: -12,
          }}
          initial={{ x: s.from }}
          animate={{ x: phase === 'in' ? '0%' : s.from === '-120%' ? '120%' : '-120%' }}
          transition={{ duration: 0.32, delay: i * 0.045, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
};

// ── water：纯粗波纹擦洗（P8.4 试验，底部栏切换指定）──────────────────────────
// 无蒙版无填充：2 圈粗蓝系波纹从点击点外扩、速率各异；切页与波纹**同帧开始**
// （0ms midpoint，不等波列——先动画后切页会不跟手，用户口径）。新页本体由
// App 层 CircleRevealOnEnter 以同一原点做扩散圆形蒙版揭示（真正的"蒙版转场"）。
// 波纹只扩到屏高一半（半径 50%vh）即衰减殆尽；波纹层不拦截指针，连点由 busyRef 兜底。
// 环宽与起手直径：initial 的 width/height 是**内径**，外径还要加两倍边框——
// 旧口径 24px 内径 + 60px 边框 = 起手就是 144px 的近实心大圆盘（用户上报"底部栏
// 那个圆形填充有点大"）。收到 12 + 2×32 = 76px，一上来就读得出是"环"而不是"盘"。
const RIPPLE_LINES = [
  { w: 32, reach: 1.00, d: 0.45, delay: 0.00, o: 0.85 },
  { w: 52, reach: 0.88, d: 0.60, delay: 0.07, o: 0.78 },
];

/** 波纹配色随频道走：P3 蓝青（原口径）／P4 橙黄（黄舞台上蓝波纹是异色，用户口径）／
 *  P5 主题红＋墨／neutral 主题色。两条波纹 = [粗内圈, 细外圈]。 */
const RIPPLE_PALETTE: Record<string, [string, string]> = {
  p3: ['rgba(27,87,255,0.78)', 'rgba(53,209,232,0.65)'],
  p4: ['rgba(249,161,27,0.85)', 'rgba(255,246,208,0.72)'],
  p5: ['rgba(215,25,32,0.78)', 'rgba(19,19,19,0.55)'],
};
const rippleColors = (channel: string): [string, string] =>
  RIPPLE_PALETTE[channel] ?? ['color-mix(in srgb, var(--color-primary) 78%, transparent)', 'rgba(148,163,184,0.6)'];

const WaterRippleAct = ({ midpoint, onDone, origin, channel }: ActProps & { origin?: { x: number; y: number }; channel: string }) => {
  useTimeline([
    [0, midpoint],
    [700, onDone],
  ]);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ox = origin?.x ?? w / 2;
  const oy = origin?.y ?? h - 40;
  const colors = rippleColors(channel);
  return (
    <div className={`fixed inset-0 ${zClass.transition} pointer-events-none overflow-hidden`} aria-hidden>
      {RIPPLE_LINES.map((ln, k) => (
        <motion.span
          key={k}
          className="absolute rounded-full"
          style={{ left: ox, top: oy, x: '-50%', y: '-50%', border: `${ln.w}px solid ${colors[k]}` }}
          initial={{ width: 12, height: 12, opacity: ln.o }}
          animate={{ width: h * ln.reach, height: h * ln.reach, opacity: 0 }}
          transition={{ duration: ln.d, delay: ln.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
};

// ── neutral：黑幕淡切 ──────────────────────────────────────────────────────
const FadeAct = ({ midpoint, onDone }: ActProps) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  useTimeline([
    [220, () => { midpoint(); setPhase('out'); }],
    [560, onDone],
  ]);
  return (
    <motion.div
      className={`fixed inset-0 ${zClass.transition} pointer-events-auto bg-black`}
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === 'in' ? 1 : 0 }}
      transition={{ duration: phase === 'in' ? 0.18 : 0.28 }}
    />
  );
};

// ── Layer：订阅 director，按频道分发演出 ──────────────────────────────────
export const TransitionLayer = () => {
  const bold = useBoldness();
  const boldRef = useRef(bold);
  boldRef.current = bold;
  const [req, setReq] = useState<HeavyTransitionRequest | null>(null);
  const busyRef = useRef(false);

  useEffect(
    () =>
      _registerTransitionLayer((r) => {
        if (busyRef.current || !boldRef.current) return false; // 忙 / D0 → director 直接执行 midpoint
        busyRef.current = true;
        setReq(r);
        return true;
      }),
    [],
  );

  if (!req) return null;
  const done = () => {
    busyRef.current = false;
    setReq(null);
  };
  const props = { midpoint: req.midpoint, onDone: done };
  // 指定效果优先于频道默认（底部栏切换 → 水波纹试验）
  if (req.effect === 'water') return <WaterRippleAct key={req.id} {...props} origin={req.origin} channel={req.channel} />;
  switch (req.channel) {
    case 'p5':
      return <StarTearAct key={req.id} {...props} />;
    case 'p4':
      return <StripeSweepAct key={req.id} {...props} />;
    case 'p3':
      return <WaveSliceAct key={req.id} {...props} />;
    default:
      return <FadeAct key={req.id} {...props} />;
  }
};
