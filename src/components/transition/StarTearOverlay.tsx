/**
 * StarTearOverlay —— 星形撕页转场（UI_DESIGN_BOLD_V2.5.md §4.2）。
 *
 * 跨域切页的签名演出：主题色条 -20° 斜扫入屏（黑条延迟 40ms 跟进，P5 海报式双色错缝）
 * → 新页被一枚不规则星形 polygon 从屏幕重心「撕开」铺满。GSAP MorphSVGPlugin 把一条
 * 隐藏 path 从「重心一点」morph 到「盖过四角的大星」，同顶点逐点插值 + 每点随机抖动
 * → 有机的撕裂感而非匀速缩放。总时长 ≤460ms。
 *
 * 裁切为何不用 clip-path:url()：引用 0×0 SVG 里 userSpaceOnUse 的 <clipPath> 在
 * Capacitor/Chromium WebView 下坐标系退化、把被裁元素裁成空（实测全黑）。改用 CSS
 * clip-path:path('<d>')——直接吃被裁元素自身的局部 px 坐标，可靠。MorphSVG 仍负责 morph
 * 那条隐藏 path 的 d，再由 onUpdate 把当前 d 同步写进揭示层的 clip-path。
 *
 * 层序（显式 z-index 必须）：主题色条(1) → 黑条(2) → 揭示层(3)。GSAP 给色条写
 * transform 会让它们各自成为 stacking context，若揭示层无显式更高 z 反被盖住、只见黑幕。
 *
 * 复用约定：
 *   - 纯演出层，aria-hidden；被揭示内容由 children 传入（真实接入时=新页，演示时=样板）。
 *   - 时间线 paused 创建后 play()；可用 .progress() 同步 scrub（headless 无 rAF 预览靠
 *     这个逐帧出图，onUpdate 同步 clip 在 scrub 时同样触发）。DEV 下挂到 window.__starTearTL。
 *   - D0（useBoldness=false）由调用方决定是否改走淡切；本组件只管把演出做出来。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { gsap } from '@/utils/gsap';

interface StarTearOverlayProps {
  /** 置 true 播放一次撕页；播完调 onComplete，由父级卸载 */
  active: boolean;
  onComplete?: () => void;
  /** 透过星形揭示的层（真实接入=新页 DOM，演示=样板面板） */
  children?: ReactNode;
  /** 领头色条颜色，默认主题色 */
  themeColor?: string;
}

/** 稳定伪随机：同 seed 必同值，保证星形不随重渲染抖动 */
const seededRand = (s: number) => {
  const x = Math.sin(s * 99991.1234) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * 生成星形 polygon 路径（userSpaceOnUse 视口 px）。spikes 个角=spikes*2 个顶点，
 * 外/内半径交替，每点叠一份 seed 抖动 → 不规则。collapsed 与 expanded 必须同 spikes
 * （顶点数一致）MorphSVG 才能逐点对插。
 */
const buildStar = (
  cx: number,
  cy: number,
  spikes: number,
  outerR: number,
  innerR: number,
  jitter: number,
  seed: number,
) => {
  const verts = spikes * 2;
  let d = '';
  for (let i = 0; i < verts; i++) {
    const isOuter = i % 2 === 0;
    const ang = (i / verts) * Math.PI * 2 - Math.PI / 2;
    const jit = 1 + (seededRand(seed + i * 1.37) - 0.5) * jitter;
    const r = (isOuter ? outerR : innerR) * jit;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return `${d}Z`;
};

const SPIKES = 14; // 设计 §4.2「13–17 顶点不规则星形」

export const StarTearOverlay = ({
  active,
  onComplete,
  children,
  themeColor = 'var(--color-primary)',
}: StarTearOverlayProps) => {
  const bar1Ref = useRef<HTMLDivElement>(null);
  const bar2Ref = useRef<HTMLDivElement>(null);
  const morphRef = useRef<SVGPathElement>(null);
  const clipLayerRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  // onComplete 收进 ref：避免父级每次渲染传入新箭头函数时，effect 误判依赖变化而
  // 重建并重播时间线（撕开→揭示态切换会触发父级重渲）
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // 视口尺寸在 active 翻真时定格一次（转场是瞬时的，无需跟随 resize）
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    if (!active) return;
    setDims({ w: window.innerWidth, h: window.innerHeight });
  }, [active]);

  useLayoutEffect(() => {
    if (!active || !dims || !morphRef.current || !clipLayerRef.current) return;
    // MorphSVG 在运行时（effect 内）注册而非模块顶层：顶层 registerPlugin 是副作用、
    // 会锚住整个模块使其不可 tree-shake；放进 effect 后本 dev-only 组件能被 prod
    // 死代码消除连带把 MorphSVG（~21KB）摇出包。registerPlugin 幂等，重复调用安全。
    gsap.registerPlugin(MorphSVGPlugin);
    const { w, h } = dims;
    const cx = w / 2;
    const cy = h / 2;
    const maxDim = Math.max(w, h);
    // 重心一点（塌缩星）→ 盖过四角的大星（内半径都超过对角，确保终态全覆盖）
    const collapsed = buildStar(cx, cy, SPIKES, 4, 2, 0.2, 7);
    const expanded = buildStar(cx, cy, SPIKES, maxDim * 2.2, maxDim * 1.18, 0.42, 23);

    const path = morphRef.current;
    const clipEl = clipLayerRef.current;
    path.setAttribute('d', collapsed);
    // 揭示层裁切走 CSS clip-path:path()（吃揭示层自身局部 px 坐标）而非 clip-path:url()——
    // 后者引用 0×0 SVG 里的 userSpaceOnUse clipPath 在 WebView 下坐标系退化、裁成空。
    // MorphSVG 照常 morph 隐藏 path 的 d，onUpdate 把当前 d 同步成揭示层的 clip-path。
    const syncClip = () => {
      const d = path.getAttribute('d');
      if (!d) return;
      clipEl.style.clipPath = `path('${d}')`;
      (clipEl.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = `path('${d}')`;
    };
    syncClip();

    const tl = gsap.timeline({
      paused: true,
      onComplete: () => onCompleteRef.current?.(),
    });
    // 主题色条 -20° 斜扫入屏
    tl.fromTo(
      bar1Ref.current,
      { xPercent: -140, skewX: -20 },
      { xPercent: 0, skewX: -20, duration: 0.22, ease: 'power3.out' },
      0,
    );
    // 黑条延迟 40ms 跟进（双色错缝）
    tl.fromTo(
      bar2Ref.current,
      { xPercent: -140, skewX: -20 },
      { xPercent: 0, skewX: -20, duration: 0.22, ease: 'power3.out' },
      0.04,
    );
    // 星形从重心撕开（逐点 morph 到大星）；onUpdate 把 morph 中的 d 同步给 clip-path
    tl.to(
      path,
      {
        duration: 0.34,
        morphSVG: { shape: expanded, shapeIndex: 0 },
        ease: 'power2.inOut',
        onUpdate: syncClip,
      },
      0.16,
    );

    tlRef.current = tl;
    if (import.meta.env.DEV) {
      (window as unknown as { __starTearTL?: gsap.core.Timeline }).__starTearTL = tl;
    }
    tl.play();

    return () => {
      tl.kill();
      tlRef.current = null;
    };
  }, [active, dims]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none" aria-hidden>
      {/* 双色斜扫色条（被揭示层之下的转场幕布）。
          显式 z-index 是必须的：GSAP 给色条写 transform 会让它们各自成为 stacking
          context，否则会反盖在 DOM 更靠后、却无 stacking context 的揭示层之上——
          撕开后只见黑幕。层序自下而上：主题色条 → 黑条 → 揭示层。 */}
      <div
        ref={bar1Ref}
        className="absolute top-0 bottom-0"
        style={{ background: themeColor, left: '-30%', width: '160%', zIndex: 1 }}
      />
      <div
        ref={bar2Ref}
        className="absolute top-0 bottom-0"
        style={{ background: '#0b0b12', left: '-30%', width: '160%', zIndex: 2 }}
      />

      {/* 隐藏的 morph 源 path：MorphSVG 只 morph 它的 d，不参与渲染；
          0×0 SVG 不影响 d 字符串解析（坐标全在 d 里、与 SVG 视口无关）。 */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <path ref={morphRef} d="M0 0Z" />
      </svg>

      {/* 被星形揭示的层（新页 / 演示样板），恒在双色幕布之上。
          clip-path 由 morph 的 onUpdate 实时写入 CSS path()（见 effect）。 */}
      <div ref={clipLayerRef} className="absolute inset-0" style={{ zIndex: 3 }}>
        {children}
      </div>
    </div>
  );
};
