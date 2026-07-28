/**
 * p3rKit —— P3R「白日水面」全站视觉底座（p3-redraw/ 设计稿 1:1 复刻用）。
 *
 * 语言要素（对照 p3-component-kit-reference-v2.png）：
 *   - 底：近白水面（浅青白 + 水波 caustic 纹理，素材复用 terminal/p3-water.png）；
 *   - 形：一切容器/按钮/徽章都是「左上→右下」斜边的平行四边形（clip-path）；
 *   - 色：亮蓝 #1b57ff（CTA/选中/数字）· 深蓝墨 #0a1230（标题正文）·
 *         浅青面 #cfeaf6 / 亮青 #35d1e8（辅助/进度）· 洋红 #f0417f（危险/句点）；
 *   - 字：超大黑斜体标题（font-black italic 紧字距）+ 蓝色功能小字；
 *   - 背景幽灵大字：极浅蓝斜体英文词（MIDNIGHT / ACTION / PLAN / LOG…）。
 *
 * 仅在 channel==='p3'（蓝主题）挂载的页面变体中使用；铁律照旧：
 * 装饰 aria-hidden、命中区完整矩形、正文恒水平（斜的只有容器与装饰）。
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion, useMotionValue } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { useAppStore } from '@/store';

export const P3R = {
  blue: '#1b57ff',
  blueDeep: '#0a3bd6',
  ink: '#0a1230',
  inkSoft: '#3d4a66',
  grey: '#8a97ad',
  cyan: '#35d1e8',
  cyanPale: '#cfeaf6',
  cyanFaint: '#e2f2fa',
  magenta: '#f0417f',
  bg: '#eef5f9',
  panel: '#ffffff',
} as const;

/** 平行四边形 clip（dir: 左上→右下 = 'lead'；右上→左下 = 'tail'） */
export const slantClip = (cut = 7, dir: 'lead' | 'tail' = 'lead') =>
  dir === 'lead'
    ? `polygon(${cut}px 0, 100% 0, calc(100% - ${cut}px) 100%, 0 100%)`
    : `polygon(0 0, calc(100% - ${cut}px) 0, 100% 100%, ${cut}px 100%)`;

/**
 * 底部弹层顶缘 clip —— 极缓单斜（左低右高一条直线，约 2–2.5°）。
 * 取代早期「锯齿多峰顶」（2026-07-14 用户定：锯齿太丑，只保留 2–3° 的一点点斜度即可）。
 * 仅裁一条顶边，两侧与底边保持方正——用在从底部滑入的表单/抽屉。
 */
export const sheetTopClip = 'polygon(0 18px, 100% 0, 100% 100%, 0 100%)';

/** 页面壳：水面底（fixed 铺满视口）+ 内容层。active=false 时退化为透明直通
 *  （给"组件内 p3 分支"的页面用：恒挂同一组件、按频道开关壳，避免内联 Wrapper 每渲染重建导致子树 remount） */
export const P3RPage = ({ children, className, active = true }: { children: ReactNode; className?: string; active?: boolean }) => {
  // 开了背景动画就不铺水面底：这层是不透明的 fixed z-0，且比 App 根的动画层后画，
  // 铺上去就把动画整块盖住了（观感 = 蓝主题下"背景动画开关没反应"）。
  const anims = useAppStore((s) => s.settings.backgroundAnimation);
  const bgImage = useAppStore((s) => s.settings.backgroundImage);
  const yieldStage = !!bgImage || (anims ?? []).length > 0;
  if (!active) return <>{children}</>;
  return (
    <div className={`relative ${className ?? ''}`}>
      {/* 水面底：浅色基底 + caustic 素材极淡平铺（页面卸载即消失，不污染其它主题） */}
      {!yieldStage && (
        <div aria-hidden className="fixed inset-0 z-0" style={{ background: P3R.bg }}>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'url(/assets/terminal/p3-water-wide.png)',
              backgroundSize: 'cover',
              backgroundPosition: 'center top',
              opacity: 0.3,
            }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(238,245,249,0.35) 0%, rgba(238,245,249,0.82) 58%, rgba(238,245,249,0.95) 100%)' }} />
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

/** 背景幽灵大字（多行，整块斜置；移动端低透明度护栏 §18.1）
 *  字重口径：Arial 合成加粗（比 Impact / Arial Black 细一档，用户定稿）
 *  动效（A3）：内层随页面滚动慢速视差漂移 + 极低频呼吸透明度；外层结构不变
 *  （调用方经 className/style 传入的定位与 rotate 覆盖全部保留），D0 静止。 */
export const GhostWords = ({ words, className, style, parallax = true }: { words: string[]; className?: string; style?: CSSProperties; parallax?: boolean }) => {
  const anim = useBoldness();
  const rootRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  // 本应用不滚 window（body overflow hidden，内容在内部容器滚动）：
  // 挂载时向上找最近的可滚祖先并监听它，找不到才退回 window
  useEffect(() => {
    if (!anim || !parallax) return;
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el && el !== document.body) {
      if (/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) break;
      el = el.parentElement;
    }
    const scroller: HTMLElement | Window = el && el !== document.body ? el : window;
    const read = () => (scroller instanceof Window ? window.scrollY : scroller.scrollTop);
    const onScroll = () => y.set(read() * -0.07);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [anim, parallax, y]);
  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`pointer-events-none absolute select-none font-black italic leading-[0.86] tracking-tight ${className ?? ''}`}
      style={{ fontFamily: 'Arial, "Noto Sans SC", sans-serif', color: 'rgba(147,190,222,0.30)', transform: 'rotate(-12deg)', ...style }}
    >
      <motion.div
        style={anim ? { y } : undefined}
        animate={anim ? { opacity: [1, 0.78, 1] } : undefined}
        transition={{ duration: 8.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {words.map((w, i) => (
          <div key={`${w}-${i}`}>{w}</div>
        ))}
      </motion.div>
    </div>
  );
};

/** 节标记：蓝色小斜块 + 标题 + 右侧 meta 槽（variant='blue'：蓝色斜体，account 页「数据管理 · DATA」式；
 *  marker='tri'：蓝色实心倒三角 + 黑粗斜体，p3-modal-03「▼ 关键词分析」式） */
export const SectionMark = ({ title, meta, variant = 'ink', marker = 'slab', className }: { title: ReactNode; meta?: ReactNode; variant?: 'ink' | 'blue'; marker?: 'slab' | 'tri'; className?: string }) => {
  const anim = useBoldness();
  // 动效（A2）：斜块从左拉出（scaleX 0→1），节题紧随其后从左裁切揭示；D0 直接终态
  const markerMotion = {
    initial: anim ? { scaleX: 0, opacity: 0 } : false,
    animate: { scaleX: 1, opacity: 1 },
    transition: { type: 'spring' as const, stiffness: 480, damping: 30 },
  };
  return (
    <div className={`flex items-center justify-between gap-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        {marker === 'tri' ? (
          <motion.span aria-hidden className="h-0 w-0 border-x-[8px] border-t-[13px] border-x-transparent" style={{ borderTopColor: P3R.blue, originX: 0 }} {...markerMotion} />
        ) : (
          <motion.span aria-hidden className="h-[18px] w-[13px]" style={{ background: P3R.blue, clipPath: 'polygon(32% 0, 100% 0, 68% 100%, 0 100%)', originX: 0 }} {...markerMotion} />
        )}
        <motion.h3
          className={`text-[19px] font-black leading-none ${variant === 'blue' || marker === 'tri' ? 'italic tracking-wide' : ''}`}
          style={{ color: variant === 'blue' ? P3R.blue : P3R.ink }}
          initial={anim ? { clipPath: 'inset(-10% 102% -10% -3%)', x: -6 } : false}
          animate={{ clipPath: 'inset(-10% -8% -10% -3%)', x: 0 }}
          transition={{ duration: 0.38, ease: [0.25, 0.1, 0.25, 1], delay: 0.06 }}
        >{title}</motion.h3>
      </div>
      {meta}
    </div>
  );
};

/** 碎裂星徽碎片表（点集 + 填色规则 + 可选透明度）；centroid 供入场"从中心炸开"计算位移向量 */
const STAR_SHARDS: Array<{ pts: string; fill: (magenta: boolean) => string; op?: number }> = [
  { pts: '112,4 150,64 94,54', fill: () => '#1b57ff' },
  { pts: '158,34 196,88 142,76', fill: (m) => (m ? '#f0417f' : '#8fdcef') },
  { pts: '26,80 68,60 54,108', fill: () => '#0a3bd6' },
  { pts: '182,124 216,152 172,168', fill: () => '#2a63ff' },
  { pts: '58,172 96,204 44,202', fill: () => '#35d1e8' },
  { pts: '150,180 180,214 130,206', fill: (m) => (m ? '#f0417f' : '#0a3bd6') },
  { pts: '14,138 42,124 38,158', fill: () => '#a8e4f2' },
  { pts: '196,60 212,92 184,84', fill: () => '#1b57ff', op: 0.75 },
];

const shardCentroid = (pts: string): [number, number] => {
  const ns = pts.split(/[\s,]+/).map(Number);
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < ns.length; i += 2) {
    sx += ns[i];
    sy += ns[i + 1];
  }
  return [sx / (ns.length / 2), sy / (ns.length / 2)];
};

/** 碎裂星徽（battle 页与升级 cutin 共用）：白描边青星 + 蓝青三角碎片；magenta=true 换入洋红碎片（庆祝演出用）
 *  动效（A5）：入场碎片从星心炸开就位（stagger spring），常态各碎片不同相位轻微悬浮；D0 静态 */
export const ShatteredStar = ({ className = 'mx-auto w-[190px]', magenta = false }: { className?: string; magenta?: boolean }) => {
  const anim = useBoldness();
  const cx = 110, cy = 120, R = 56, inner = R * 0.42;
  let d = '';
  for (let i = 0; i < 5; i++) {
    const a1 = ((-90 + i * 72) * Math.PI) / 180;
    const a2 = ((-90 + i * 72 + 36) * Math.PI) / 180;
    d += `${i === 0 ? 'M' : 'L'}${(cx + R * Math.cos(a1)).toFixed(1)},${(cy + R * Math.sin(a1)).toFixed(1)} L${(cx + inner * Math.cos(a2)).toFixed(1)},${(cy + inner * Math.sin(a2)).toFixed(1)} `;
  }
  return (
    <svg viewBox="0 0 220 230" className={className} aria-hidden>
      {/* 碎片（蓝青拼贴，围星散射）：外层 g 承担入场炸开，内层 g 承担常态悬浮 */}
      {STAR_SHARDS.map((s, i) => {
        const [px, py] = shardCentroid(s.pts);
        return (
          <motion.g
            key={s.pts}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            initial={anim ? { x: (cx - px) * 0.6, y: (cy - py) * 0.6, scale: 0.4, opacity: 0 } : false}
            animate={{ x: 0, y: 0, scale: 1, opacity: s.op ?? 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 19, delay: 0.1 + i * 0.05 }}
          >
            <motion.g
              animate={anim ? { y: [0, -2.4, 0] } : undefined}
              transition={{ duration: 3 + (i % 4) * 0.55, repeat: Infinity, ease: 'easeInOut', delay: i * 0.37 }}
            >
              <polygon points={s.pts} fill={s.fill(magenta)} />
            </motion.g>
          </motion.g>
        );
      })}
      {/* 中央星：白描边 + 青填充（入场 pop 就位，作为碎片的锚不悬浮） */}
      <motion.path
        d={`${d}Z`}
        fill="#7fd8ee"
        stroke="#ffffff"
        strokeWidth="8"
        strokeLinejoin="miter"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        initial={anim ? { scale: 0.4, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 20 }}
      />
    </svg>
  );
};

/** P3R 页头：可选返回三角 + 可选大蓝斜块前导 + 超大黑斜体标题 + 可选尾随青双片 */
export const P3PageHeader = ({
  title,
  lead = false,
  ticks = false,
  onBack,
  className,
}: {
  title: ReactNode;
  /** 标题左侧的大蓝斜块（account 页式） */
  lead?: boolean;
  /** 标题右下的青双斜片（成就/星象页式） */
  ticks?: boolean;
  onBack?: () => void;
  className?: string;
}) => {
  const anim = useBoldness();
  // 动效（A6）三段错帧：蓝斜块自上砸入 → 标题从左裁切揭示 → 青双片弹入；D0 直接终态
  const tickMotion = (delay: number) => ({
    initial: anim ? { scale: 0, x: -6, opacity: 0 } : (false as const),
    animate: { scale: 1, x: 0, opacity: 1 },
    transition: { type: 'spring' as const, stiffness: 520, damping: 22, delay },
  });
  return (
    <div className={className}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="mb-2 flex h-10 w-10 items-center justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
        >
          <span aria-hidden className="block h-[15px] w-[13px]" style={{ background: P3R.ink, clipPath: 'polygon(100% 0, 100% 100%, 0 50%)' }} />
        </button>
      )}
      <div className="flex items-end gap-2.5">
        {lead && (
          <motion.span
            aria-hidden
            className="mb-1.5 h-[40px] w-[25px] shrink-0"
            style={{ background: P3R.blue, clipPath: 'polygon(36% 0, 100% 0, 64% 100%, 0 100%)', originY: 0 }}
            initial={anim ? { y: -14, scaleY: 0.4, opacity: 0 } : false}
            animate={{ y: 0, scaleY: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 460, damping: 26 }}
          />
        )}
        <motion.h1
          className="text-[46px] font-black italic leading-[0.95] tracking-tight"
          style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}
          // 终态用负 inset 外扩:inset(0%) 会贴盒裁掉 Arial Black 斜体的右侧突出部(统计页标题截断根因)
          initial={anim ? { clipPath: 'inset(-8% 102% -8% -3%)', x: -10 } : false}
          animate={{ clipPath: 'inset(-8% -8% -8% -3%)', x: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 0.9, 0.3, 1], delay: 0.08 }}
        >
          {title}
        </motion.h1>
        {ticks && (
          <span aria-hidden className="mb-2.5 flex shrink-0 items-start gap-1">
            <motion.span className="h-[13px] w-[17px]" style={{ background: P3R.cyan, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} {...tickMotion(0.3)} />
            <motion.span className="mt-[3px] h-[11px] w-[13px]" style={{ background: '#9adcee', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} {...tickMotion(0.4)} />
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * P3「活高亮」—— 与 P5Highlight / P4Highlight 同机制（rAF 每帧朝随机目标插值，
 * 得到 60fps 的平滑震颤），但里面**只有一枚运动三角形**（用户口径：红频道那对
 * 运动四边形在蓝频道换成单枚三角）。
 *
 * 形制：左缘一条略斜的短边、两条长边收拢到右端一点 = 一枚朝右的楔。
 * 顶点抖动范围必须整个落在 viewBox(0..100, 0..50) 内——抖出去会被视口裁成
 * 不规则多边形（P4 踩过这个坑）。preserveAspectRatio="none" 由调用方拉成任意长条。
 * D0 / live=false 不跑 rAF，退化成静态楔。
 */
const P3_TRI_BOX = [[11, 18, 2, 7], [1, 7, 43, 48], [91, 98, 19, 30]];
const p3TriTarget = () => P3_TRI_BOX.flatMap((v) => [v[0] + Math.random() * (v[1] - v[0]), v[2] + Math.random() * (v[3] - v[2])]);
const p3TriPoints = (a: number[]) => `${a[0].toFixed(1)},${a[1].toFixed(1)} ${a[2].toFixed(1)},${a[3].toFixed(1)} ${a[4].toFixed(1)},${a[5].toFixed(1)}`;

export const P3Highlight = ({ className, color = 'rgba(255,255,255,0.24)', live = true }: {
  className?: string; color?: string; live?: boolean;
}) => {
  const bold = useBoldness();
  const ref = useRef<SVGPolygonElement>(null);
  useEffect(() => {
    if (!bold || !live) return;
    let cur = p3TriTarget();
    let tgt = p3TriTarget();
    let last = 0;
    let raf = 0;
    const loop = (t: number) => {
      if (t - last > 130) { tgt = p3TriTarget(); last = t; }
      for (let i = 0; i < 6; i++) cur[i] += (tgt[i] - cur[i]) * 0.18;
      ref.current?.setAttribute('points', p3TriPoints(cur));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bold, live]);
  return (
    <svg viewBox="0 0 100 50" preserveAspectRatio="none" className={className} aria-hidden>
      <polygon ref={ref} fill={color} points="14,4 4,46 95,24" />
    </svg>
  );
};

/** 行内代码片（account 云同步说明的 .env.local / VITE_PB_URL 式） */
export const CodeChip = ({ children, tone = 'grey' }: { children: ReactNode; tone?: 'grey' | 'cyan' }) => (
  <code
    className="px-1.5 py-0.5 font-mono text-[12px] font-bold"
    style={tone === 'cyan' ? { background: P3R.cyanPale, color: P3R.blueDeep } : { background: '#e6edf3', color: P3R.ink }}
  >
    {children}
  </code>
);

/** 超大黑斜体节题（今日任务 / 已归档 式），右侧计数槽 */
export const BigSlantTitle = ({ title, count, className }: { title: string; count?: ReactNode; className?: string }) => (
  <div className={`flex items-end justify-between gap-3 ${className ?? ''}`}>
    <h2
      className="text-[34px] font-black italic leading-none tracking-tight"
      style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}
    >
      {title}
    </h2>
    {count !== undefined && (
      <div className="flex items-center gap-1.5 pb-1">
        <span className="text-[17px] font-black italic leading-none" style={{ color: P3R.blue }}>{count}</span>
        <span aria-hidden className="h-3 w-3" style={{ background: P3R.cyan, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
      </div>
    )}
  </div>
);

/** 斜切按钮（设计稿四款：primary 蓝 / soft 浅青 / ghost 更浅 / danger 洋红） */
export const SlantButton = ({
  children,
  tone = 'primary',
  onClick,
  className,
  style,
  ariaLabel,
  magentaCorner = false,
  disabled = false,
}: {
  children: ReactNode;
  tone?: 'primary' | 'soft' | 'ghost' | 'danger';
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  /** 右下洋红小角（p3-modal 稿主按钮签名件） */
  magentaCorner?: boolean;
  disabled?: boolean;
}) => {
  const skin: Record<string, CSSProperties> = {
    primary: { background: P3R.blue, color: '#fff' },
    soft: { background: '#aee5f2', color: P3R.ink },
    ghost: { background: P3R.cyanFaint, color: P3R.ink },
    danger: { background: P3R.magenta, color: '#fff' },
  };
  const anim = useBoldness();
  // 动效（A4）：按下瞬间白色硬边斜光扫过（与水波纹/刀光同语言）；键盘激活（detail===0）在 click 补触发
  const [sweep, setSweep] = useState<number | null>(null);
  const fireSweep = () => setSweep(Date.now());
  return (
    <button
      type="button"
      onClick={(e) => {
        if (anim && !disabled && e.detail === 0) fireSweep();
        onClick?.();
      }}
      onPointerDown={() => {
        if (anim && !disabled) fireSweep();
      }}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`relative select-none px-6 py-2.5 text-[16px] font-black tracking-wide active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff] focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${className ?? ''}`}
      style={{ clipPath: slantClip(10), ...skin[tone], ...style }}
    >
      {children}
      {sweep !== null && (
        <motion.span
          key={sweep}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[30%]"
          style={{ background: 'rgba(255,255,255,0.5)', borderLeft: '2px solid rgba(255,255,255,0.95)', skewX: -18 }}
          initial={{ x: '-140%' }}
          animate={{ x: '480%' }}
          transition={{ duration: 0.34, ease: 'easeOut' }}
          onAnimationComplete={() => setSweep(null)}
        />
      )}
      {magentaCorner && (
        <motion.span
          aria-hidden
          className="absolute bottom-0 right-3 h-[7px] w-[18px]"
          style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }}
          animate={anim ? { opacity: [1, 1, 0.3, 1] } : undefined}
          transition={{ duration: 4.6, times: [0, 0.88, 0.93, 1], repeat: Infinity, ease: 'linear' }}
        />
      )}
    </button>
  );
};

/** 空态板：浅青大平行四边形 + 居中提示（设计稿「暂无可追踪的信号」区） */
export const P3EmptySlab = ({ text = '暂无可追踪的信号', className }: { text?: string; className?: string }) => (
  <div
    className={`flex min-h-[168px] items-center justify-center px-6 ${className ?? ''}`}
    style={{ clipPath: slantClip(26), background: 'rgba(199,231,244,0.72)' }}
  >
    <span className="text-[16px] font-black" style={{ color: P3R.ink }}>{text}</span>
  </div>
);

/** 标题句点：青片 + 洋红小片错位（午夜状态 / 任务 tab 右下的签名符号）
 *  动效（A1）：两片先后戳入（spring 回弹），落定后洋红片低频眨动 + 错位小抖——"活着的句点"；D0 静态 */
export const TitlePeriod = ({ className, style }: { className?: string; style?: CSSProperties }) => {
  const anim = useBoldness();
  return (
    <span aria-hidden className={`relative inline-block h-[14px] w-[30px] ${className ?? ''}`} style={style}>
      <motion.span
        className="absolute left-0 top-0 h-full w-[20px]"
        style={{ background: P3R.cyan, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }}
        initial={anim ? { scale: 0, x: -6, opacity: 0 } : false}
        animate={{ scale: 1, x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 24, delay: 0.12 }}
      />
      <motion.span
        className="absolute left-[16px] top-[4px] h-[10px] w-[14px]"
        initial={anim ? { scale: 0, x: -4, opacity: 0 } : false}
        animate={{ scale: 1, x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 20, delay: 0.24 }}
      >
        <motion.span
          className="absolute inset-0"
          style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }}
          animate={anim ? { opacity: [1, 1, 0.25, 1, 1], x: [0, 0, 1.5, 0, 0] } : undefined}
          transition={{ duration: 5.2, times: [0, 0.9, 0.94, 0.97, 1], repeat: Infinity, ease: 'linear', delay: 1.2 }}
        />
      </motion.span>
    </span>
  );
};
