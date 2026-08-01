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
// 「TAKE YOUR TIME」剪报拼贴（P5 装载语法）：大小写不一、逐字块贴、微旋错落。
// null = 词间距；palette 索引显式给定——幕布字区是黑底，不排纯黑砖（黑上黑隐身）。
const TYT_PALETTE = [
  { bg: '#f0e9df', fg: '#c00008' },
  { bg: '#c00008', fg: '#f8f8f6' },
  { bg: '#9b9791', fg: '#050505' },
  { bg: '#f0e9df', fg: '#050505' },
] as const;
const TYT_TILES: (readonly [string, number, number, number] | null)[] = [
  // [字, 字号, 旋转deg, palette 序号]（总宽须 <430px，450 屏起点 3.5% 不裁尾）
  ['T', 25, -6, 0], ['A', 20, 5, 1], ['k', 23, -3, 2], ['E', 19, 7, 3], null,
  ['y', 20, -7, 1], ['O', 24, 4, 0], ['U', 19, -4, 3], ['r', 22, 6, 2], null,
  ['T', 23, -5, 1], ['i', 18, 8, 0], ['M', 25, -4, 3], ['E', 20, 5, 2],
];

const StarTearAct = ({ midpoint, onDone }: ActProps) => {
  const curtainRef = useRef<HTMLDivElement>(null);
  const bar1Ref = useRef<HTMLDivElement>(null);
  const bar2Ref = useRef<HTMLDivElement>(null);
  const sliverRef = useRef<HTMLDivElement>(null);
  const stampRef = useRef<HTMLDivElement>(null);
  const tytRef = useRef<HTMLDivElement>(null);
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
    // 三层斜扫入（红 / 黑 / 纸斜条）——节奏比旧版收紧约 0.1s（用户口径「太慢」）
    tl.fromTo(bar1Ref.current, { xPercent: -140, skewX: -20 }, { xPercent: 0, skewX: -20, duration: 0.18, ease: 'power3.out' }, 0);
    tl.fromTo(bar2Ref.current, { xPercent: -140, skewX: -20 }, { xPercent: 0, skewX: -20, duration: 0.18, ease: 'power3.out' }, 0.04);
    tl.fromTo(sliverRef.current, { xPercent: 150 }, { xPercent: 0, duration: 0.2, ease: 'power3.out' }, 0.06);
    // 中心星印：纸白巨星带红芯砸下（盖在黑幕上，随幕布一起被反撕带走）
    tl.fromTo(stampRef.current, { scale: 0, rotation: -40 }, { scale: 1, rotation: -8, duration: 0.18, ease: 'back.out(2.2)' }, 0.14);
    // 拼贴字逐块贴上（yPercent/opacity 单独 tween，静态 rotate 由 GSAP 原样保留）
    tl.fromTo(
      tytRef.current!.children,
      { yPercent: 130, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.15, stagger: 0.013, ease: 'back.out(2)' },
      0.12,
    );
    // 全遮时刻：切页（被幕布挡住）
    tl.call(midpoint, undefined, 0.26);
    // 幕布星形反撕离场：星 expanded → collapsed，可见幕布从四缘向中心缩没
    tl.to(path, { duration: 0.38, morphSVG: { shape: collapsed, shapeIndex: 0 }, ease: 'power2.in', onUpdate: syncClip }, 0.34);

    return () => { tl.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`fixed inset-0 ${zClass.transition} pointer-events-auto`} aria-hidden>
      <div ref={curtainRef} className="absolute inset-0">
        <div ref={bar1Ref} className="absolute top-0 bottom-0" style={{ background: 'var(--color-primary)', left: '-30%', width: '160%', zIndex: 1 }} />
        <div ref={bar2Ref} className="absolute top-0 bottom-0" style={{ background: '#0b0b12', left: '-30%', width: '160%', zIndex: 2 }} />
        {/* 纸斜条：横贯中部的一道米白撕纸（P5 拼贴语法的第三色） */}
        <div
          ref={sliverRef}
          className="absolute top-0 bottom-0"
          style={{ background: '#f0e9df', left: '-30%', width: '160%', zIndex: 3, clipPath: 'polygon(0 46%, 100% 34%, 100% 44%, 0 56%)' }}
        />
        {/* 中心星印：纸白巨星 + 红芯 + 黑锁边（随幕布反撕一起离场） */}
        <div ref={stampRef} className="absolute left-1/2 top-1/2" style={{ zIndex: 4, width: 190, height: 190, marginLeft: -95, marginTop: -95 }}>
          <svg viewBox="0 0 100 100" width={190} height={190} style={{ overflow: 'visible' }}>
            <polygon points={STAMP_OUTER} fill="#f0e9df" />
            <polygon points={STAMP_MID} fill="#0b0b12" />
            <polygon points={STAMP_CORE} fill="var(--color-primary)" />
          </svg>
        </div>
        {/* TAKE YOUR TIME 拼贴：星印下方沿撕纸斜率贴一行，随幕布反撕带走 */}
        <div
          ref={tytRef}
          className="absolute flex items-end"
          style={{ zIndex: 5, left: '3.5%', top: '66%', gap: 3, transform: 'rotate(-13deg)' }}
        >
          {TYT_TILES.map((t, i) =>
            t === null ? (
              <span key={i} aria-hidden style={{ width: 11 }} />
            ) : (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: t[1] + 9,
                  height: t[1] + 13,
                  background: TYT_PALETTE[t[3]].bg,
                  color: TYT_PALETTE[t[3]].fg,
                  fontSize: t[1],
                  fontWeight: 900,
                  fontFamily: '"Arial Black", "Noto Sans SC", sans-serif',
                  lineHeight: 1,
                  transform: `rotate(${t[2]}deg)`,
                  boxShadow: '2.5px 2.5px 0 rgba(0,0,0,0.5)',
                }}
              >
                {t[0]}
              </span>
            ),
          )}
        </div>
      </div>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <path ref={morphRef} d="M0 0Z" />
      </svg>
    </div>
  );
};

/** 星印三层点集（模块级算一次；正五角星，逐层缩半径） */
const starPts5 = (R: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    const b = ((-90 + i * 72 + 36) * Math.PI) / 180;
    pts.push(`${(50 + R * Math.cos(a)).toFixed(1)},${(50 + R * Math.sin(a)).toFixed(1)}`);
    pts.push(`${(50 + R * 0.42 * Math.cos(b)).toFixed(1)},${(50 + R * 0.42 * Math.sin(b)).toFixed(1)}`);
  }
  return pts.join(' ');
};
const STAMP_OUTER = starPts5(50);
const STAMP_MID = starPts5(41);
const STAMP_CORE = starPts5(33);

// ── P4：斜楔切镜 v2 ─────────────────────────────────────────────────────────
// 旧版是五条水平色带横扫（与频道现行语汇脱节，用户口径「不符合主题风格/太简陋」）。
// 现在：墨楔自上、黄楔自下沿斜缝合拢（各带奶油棱线），缝上一条六色彩虹缎带扫过，
// 中心奶油四角星砸下 → midpoint → 楔沿原方向继续滑出（切镜）。
// 楔的 clip 顶点用负/超界百分比外扩，滑入滑出全程无露缝。
const P4_RAINBOW = ['#e94b4b', '#f9a11b', '#ffd900', '#57c15e', '#39a8e0', '#8d6bc7'];
/** 长尖四角星（与轮盘同形：二次曲线、腰收 0.14R） */
const p4StarD = (() => {
  const R = 46, q = R * 0.14, c = 50;
  return `M${c} ${c - R} Q${c + q} ${c - q} ${c + R} ${c} Q${c + q} ${c + q} ${c} ${c + R} Q${c - q} ${c + q} ${c - R} ${c} Q${c - q} ${c - q} ${c} ${c - R}Z`;
})();

const WedgeCutAct = ({ midpoint, onDone }: ActProps) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  useTimeline([
    [300, midpoint],
    [430, () => setPhase('out')],
    [780, onDone],
  ]);
  const EASE: [number, number, number, number] = [0.85, 0, 0.15, 1];
  return (
    <div className={`fixed inset-0 ${zClass.transition} pointer-events-auto overflow-hidden`} aria-hidden>
      {/* 墨楔（带奶油底衬露出棱线）：自上砸下，out 继续向下走完（切镜，不回头） */}
      <motion.div
        className="absolute inset-0"
        initial={{ y: '-115%' }}
        animate={{ y: phase === 'in' ? '0%' : '118%' }}
        transition={{ duration: phase === 'in' ? 0.24 : 0.3, ease: EASE }}
      >
        <div className="absolute inset-0" style={{ background: '#fff6d0', clipPath: 'polygon(-40% -40%, 140% -40%, 140% 45%, -40% 77%)' }} />
        <div className="absolute inset-0" style={{ background: '#131313', clipPath: 'polygon(-40% -40%, 140% -40%, 140% 42.5%, -40% 74.5%)' }} />
        {/* 彩虹缎带：贴着墨楔下缘（同一层里，跟着楔进出） */}
        <div
          className="absolute left-[-30%] right-[-30%]"
          style={{
            top: '54%',
            height: 13,
            transform: 'rotate(-11.3deg)',
            background: `linear-gradient(180deg, ${P4_RAINBOW.map((c, i) => `${c} ${(i / 6) * 100}% ${((i + 1) / 6) * 100}%`).join(', ')})`,
          }}
        />
      </motion.div>
      {/* 黄楔：自下顶上，out 继续向上走完 */}
      <motion.div
        className="absolute inset-0"
        initial={{ y: '115%' }}
        animate={{ y: phase === 'in' ? '0%' : '-118%' }}
        transition={{ duration: phase === 'in' ? 0.24 : 0.3, delay: phase === 'in' ? 0.03 : 0, ease: EASE }}
      >
        <div className="absolute inset-0" style={{ background: '#fff6d0', clipPath: 'polygon(-40% 71%, 140% 39%, 140% 140%, -40% 140%)' }} />
        <div className="absolute inset-0" style={{ background: 'var(--ui-bg, #ffd900)', clipPath: 'polygon(-40% 73.5%, 140% 41.5%, 140% 140%, -40% 140%)' }} />
      </motion.div>
      {/* 斜向彩虹缎带擦过：全遮期从左扫到右（signal sweep），在楔滑开露新页前淡尽。
          rotate 放外层静态容器——motion 接管 transform，同元素上写死的 rotate 会被覆盖 */}
      <div aria-hidden className="pointer-events-none absolute left-[-45%] right-[-45%]" style={{ top: '43%', height: 56, transform: 'rotate(-16deg)' }}>
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{
            width: '40%',
            background: `linear-gradient(180deg, ${P4_RAINBOW.map((c, i) => `${c} ${(i / 6) * 100}% ${((i + 1) / 6) * 100}%`).join(', ')})`,
            boxShadow: '0 3px 0 rgba(19,19,19,0.35), 0 -3px 0 rgba(19,19,19,0.35)',
          }}
          initial={{ x: '-130%', opacity: 0 }}
          animate={{ x: ['-130%', '40%', '230%', '340%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.4, delay: 0.14, times: [0, 0.22, 0.8, 1], ease: 'easeInOut' }}
        />
      </div>
      {/* 中心四角星：合拢后砸下，out 随黄楔方向甩出 */}
      <motion.div
        className="absolute left-1/2 top-1/2"
        style={{ width: 170, height: 170, marginLeft: -85, marginTop: -85 }}
        initial={{ scale: 0, rotate: -120 }}
        animate={phase === 'in' ? { scale: 1, rotate: 0, y: 0 } : { scale: 0.7, rotate: 40, y: '-140vh' }}
        transition={phase === 'in' ? { type: 'spring', stiffness: 320, damping: 17, delay: 0.2 } : { duration: 0.3, ease: EASE }}
      >
        <svg viewBox="0 0 100 100" width={170} height={170} style={{ overflow: 'visible' }}>
          <path d={p4StarD} fill="#fff6d0" />
        </svg>
      </motion.div>
    </div>
  );
};

// ── P3：白日水面斜栅 v2 ─────────────────────────────────────────────────────
// 旧版四片深蓝在近白的「白日水面」频道里像换了个 App（用户口径「不符合主题风格」），
// 且逐片各自 skew 时屏角会露缝。现在：白/浅青/亮蓝/青交替的五条竖栅左右交错合拢，
// skew 写在**外层容器**上（容器 inset -30% 出血）——所有栅条同一坐标系，
// 任何高度上的水平偏移都一致，几何上不可能开缝。合拢后中心洋红双片一戳，
// 栅条反向滑开。总时长 0.74s。
const P3_SLATS = [
  { bg: '#ffffff', from: -1 },
  { bg: '#cfeaf6', from: 1 },
  { bg: '#1b57ff', from: -1 },
  { bg: '#35d1e8', from: 1 },
  { bg: '#eef5f9', from: -1 },
];

const WaveSliceAct = ({ midpoint, onDone }: ActProps) => {
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  useTimeline([
    [300, midpoint],
    [400, () => setPhase('out')],
    [740, onDone],
  ]);
  return (
    <div className={`fixed inset-0 ${zClass.transition} pointer-events-auto overflow-hidden`} aria-hidden>
      <div className="absolute inset-[-30%]" style={{ transform: 'skewX(-12deg)' }}>
        {P3_SLATS.map((sl, i) => (
          <motion.div
            key={i}
            className="absolute bottom-0 top-0"
            style={{ background: sl.bg, width: '21%', left: `${i * 20}%`, borderRight: i % 2 ? undefined : '2px solid rgba(53,209,232,0.55)' }}
            initial={{ x: `${sl.from * 160}vw` }}
            animate={{ x: phase === 'in' ? '0vw' : `${-sl.from * 160}vw` }}
            transition={{ duration: phase === 'in' ? 0.26 : 0.3, delay: i * 0.035, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      {/* 中心签名句点：青片 + 洋红片错位戳入（频道句点语法），随栅条滑开一并淡走 */}
      <motion.div
        className="absolute left-1/2 top-1/2"
        style={{ width: 84, height: 40, marginLeft: -42, marginTop: -20 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={phase === 'in' ? { scale: 1, opacity: 1 } : { scale: 0.6, opacity: 0 }}
        transition={phase === 'in' ? { type: 'spring', stiffness: 420, damping: 18, delay: 0.24 } : { duration: 0.16 }}
      >
        <span className="absolute left-0 top-0 h-full w-[52px]" style={{ background: '#35d1e8', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
        <span className="absolute left-[44px] top-[10px] h-[26px] w-[36px]" style={{ background: '#f0417f', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
      </motion.div>
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
      return <WedgeCutAct key={req.id} {...props} />;
    case 'p3':
      return <WaveSliceAct key={req.id} {...props} />;
    default:
      return <FadeAct key={req.id} {...props} />;
  }
};
