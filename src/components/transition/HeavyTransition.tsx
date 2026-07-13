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

// ── water：线条波纹 + 圆形蒙版擦除（P8.4 试验，底部栏切换指定）────────────────
// 不铺蓝：只有粗细相间的线条波纹从点击点外扩；切页由一块中性圆形蒙版承担——
// 圆 clip 涨满遮住切页瞬间，再缩回把新页从边缘"擦除"露出。
const RIPPLE_LINES = [
  { w: 2, c: 'rgba(27,87,255,0.70)',   reach: 1.02, d: 0.80, delay: 0.00, o: 0.70 },
  { w: 6, c: 'rgba(53,209,232,0.85)',  reach: 0.88, d: 0.72, delay: 0.07, o: 0.85 },
  { w: 3, c: 'rgba(27,87,255,0.55)',   reach: 1.10, d: 0.86, delay: 0.15, o: 0.68 },
  { w: 9, c: 'rgba(53,209,232,0.42)',  reach: 0.76, d: 0.66, delay: 0.22, o: 0.72 },
  { w: 2, c: 'rgba(207,234,246,0.95)', reach: 1.16, d: 0.92, delay: 0.11, o: 0.80 },
];

const WaterRippleAct = ({ midpoint, onDone, origin }: ActProps & { origin?: { x: number; y: number } }) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  useTimeline([
    [320, () => { midpoint(); setPhase('out'); }],
    [720, onDone],
  ]);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const ox = origin?.x ?? w / 2;
  const oy = origin?.y ?? h - 40;
  const reachPx = Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy)); // 圆心→最远屏角
  const cover = reachPx * 1.12; // 半径留余量，scale=1 时兜住全屏
  const D = cover * 2;
  return (
    <div className={`fixed inset-0 ${zClass.transition} pointer-events-auto overflow-hidden`} aria-hidden>
      {/* 圆形蒙版幕布（中性水色，不铺蓝）：从点击点 scale 涨满遮住切页 → 缩回把新页从边缘擦除露出
          （用 scale 而非 clip-path：framer 不插值 circle() 的混合 %/px，clip-path 会卡在初值） */}
      <motion.div
        className="absolute rounded-full"
        style={{
          left: ox, top: oy, width: D, height: D, marginLeft: -cover, marginTop: -cover,
          background: 'linear-gradient(160deg, #f6fbff 0%, #e4f2fb 56%, #d2eaf6 100%)',
        }}
        initial={{ scale: 0 }}
        animate={{ scale: phase === 'in' ? 1 : 0 }}
        transition={{ duration: phase === 'in' ? 0.3 : 0.38, ease: [0.4, 0, 0.2, 1] }}
      />
      {/* 线条波纹（有粗有细）：从点击点逐圈外扩，进/退各播一轮（key 带 phase 触发重放） */}
      {RIPPLE_LINES.map((ln, k) => (
        <motion.span
          key={`${phase}-${k}`}
          className="absolute rounded-full"
          style={{ left: ox, top: oy, x: '-50%', y: '-50%', border: `${ln.w}px solid ${ln.c}` }}
          initial={{ width: 22, height: 22, opacity: ln.o }}
          animate={{ width: reachPx * 2 * ln.reach, height: reachPx * 2 * ln.reach, opacity: 0 }}
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
  if (req.effect === 'water') return <WaterRippleAct key={req.id} {...props} origin={req.origin} />;
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
