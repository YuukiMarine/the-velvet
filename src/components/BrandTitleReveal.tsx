/**
 * BrandTitleReveal —— 首页流光品牌标题（「靛蓝色房间 / The Velvet」）。
 *
 * 审计 S6 拍板：首页豁免 PageTitle 制式，保留这块 52px 流光品牌标题作为「品牌仪式感」
 * 最高权重首屏头。本组件在原样保留视觉的同时，把入场从 framer-motion 整体淡入升级为
 * 一条 GSAP 时间线（UI_DESIGN_BOLD_V2.5.md §2 规则5「排版即图形 / 文字怪物」）：
 *   眉标落位 → 五个字带斜界微旋逐字升起（GSAP SplitText 拆字）→ The Velvet 侧滑 →
 *   分隔线自左拉出。
 *
 * 流光渐变的坑（已踩实）：background-clip:text 只裁元素「自身的直系文字」、不裁后代。
 * SplitText 把文字搬进子 <div> 后，<h1> 便无字可裁、整条渐变不画。故配方下沉到每个
 * .brand-char（各自一份渐变 + clip + 透明 fill），再按字序错开 animation-delay，复现
 * 原本那道横扫的流光，而非五字同步齐闪。<h1> 自身仍保留配方，专供 D0 未拆字时显示。
 *
 * ⚠️「无字可裁 = 整条不画」在 Blink 上并不成立（用户上报：自定义主题标题角上一块
 * 莫名其妙的黑方块，还跟着流光一起变色）。拆字后 <h1> 的直系文字确实没了，但
 * background-clip:text 的蒙版是在**整个子树的绘制结果**上取的，而每个 .brand-char 又被
 * GSAP 钉了 translate3d 提成独立合成层——蒙版取不到已经跑去合成器的那部分文字，
 * 于是 <h1> 自己那份渐变漏出一块矩形。所以拆字成功后必须给 <h1> 挂 .vr-split 把它自己的
 * 配方摘掉（revert 时再摘掉这个类），配方只留在 .brand-char 上。
 *
 * 约束（与 utils/gsap.ts、utils/boldness.ts 的约定配套）：
 *   - D0 守卫：useBoldness()=false（reduced-motion / 校直模式 / 低端机永久降级）时
 *     完全不跑时间线、不拆字，直接渲染终态——这同时也是无 JS / SSR 的兜底视图。
 *   - 逐字 stagger 用 GSAP .from 默认 immediateRender:true：真机首帧即隐藏再入场、零闪烁；
 *     headless 预览无 rAF 时停在隐藏态属正常（验证改用 eval 读 DOM 终态）。
 *   - SplitText 会改写 <h1> 的子节点，cleanup 必须 split.revert() 还原 DOM，
 *     否则 React 协调会与 GSAP 写入的 span 打架。标题文案恒为静态，darkMode 切换
 *     只改 <h1> className（属性级更新，不触碰已拆分的子 span）。
 */
import { useCallback, useLayoutEffect, useRef } from 'react';
import { gsap, SplitText, useGSAP } from '@/utils/gsap';
import { useBoldness } from '@/utils/boldness';

interface BrandTitleRevealProps {
  /** 暗色模式决定流光渐变取浅底深字还是深底浅字（沿用原 vr-title-light / -dark） */
  darkMode: boolean;
}

export const BrandTitleReveal = ({ darkMode }: BrandTitleRevealProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const eyebrowRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const velvetRef = useRef<HTMLSpanElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const bold = useBoldness();

  /**
   * 一行装不下就缩字号（用户上报：某些分辨率下「间」被挤到第二行，孤字换行很难看）。
   *
   * 52px × 5 个方块字 ≈ 250px，看起来 360dp 都够——但 Android WebView 默认把系统
   * 「字体大小」当 textZoom 应用，用户调到「大」就是 1.15×，250 → 287px，容器只有
   * 280px 左右，正好翻车。**不能**按 dp 宽度写死断点，只能量。
   *
   * 量法：一份 nowrap 的隐藏克隆量出自然宽（绝对定位 → shrink-to-fit → 就是 max-content）。
   * 量的是**渲染后**的 px，textZoom 对克隆和真身同倍作用，比值天然抵消，所以
   * fontSize = base × avail/natural 在任何缩放档位下都成立。
   * 真身再钉 whiteSpace:nowrap 兜底：万一量歪了也只是稍微出血，不会变成孤字换行。
   */
  const fitTitle = useCallback(() => {
    const box = rootRef.current;
    const h = titleRef.current;
    if (!box || !h) return;
    h.style.fontSize = '';
    const cs = getComputedStyle(h);
    const base = parseFloat(cs.fontSize);
    if (!base) return;

    const probe = document.createElement('div');
    probe.textContent = '靛蓝色房间';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;';
    // 逐项抄而不是用 font 简写：简写在部分内核里回读为空串，量出来就是 0
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontSize = cs.fontSize;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.fontStyle = cs.fontStyle;
    probe.style.letterSpacing = cs.letterSpacing;
    box.appendChild(probe);
    const natural = probe.getBoundingClientRect().width;
    box.removeChild(probe);

    // clientWidth 含 padding（px-1 两边各 4px）；再留 6px 余量——「The Velvet」
    // 绝对定位在 -right-1，比 h1 右缘还往外探一点，缩到严丝合缝会把它顶出屏幕
    const avail = box.clientWidth - 8 - 6;
    if (natural > 0 && avail > 0 && natural > avail) {
      h.style.fontSize = `${Math.max(24, base * (avail / natural)).toFixed(2)}px`;
    }
  }, []);

  // 布局期就位，避免先画一帧换行的再跳回来
  useLayoutEffect(() => {
    fitTitle();
    const box = rootRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fitTitle());
    ro.observe(box);
    return () => ro.disconnect();
  }, [fitTitle]);

  useGSAP(
    () => {
      // D0：降级时元素停在 natural 终态（CSS 默认即可见），不拆字、不编排
      if (!bold || !titleRef.current) return;

      // 逐字拆分；aria:'auto' 把原文写进 <h1> 的 aria-label、并对装饰 span 置 aria-hidden，
      // 读屏仍读"靛蓝色房间"整体而非五个孤立字
      const split = SplitText.create(titleRef.current, {
        type: 'chars',
        charsClass: 'brand-char',
        aria: 'auto',
      });

      // 拆成功 → 摘掉 <h1> 自己那份流光配方（见文件头：否则漏出一块黑矩形）
      titleRef.current.classList.add('vr-split');

      // 流光自左向右扫过五字：靠左的字相位领先（负 delay 把播放进度拉早）。
      // 拆字后渐变下沉到每字（h1 的 background-clip:text 不裁后代文字），相位错开
      // 才能复现原 <h1> 那道横扫的流光，而非五个字齐刷刷同步闪。
      const n = split.chars.length || 1;
      split.chars.forEach((c, i) => {
        (c as HTMLElement).style.animationDelay = `${(-(i / n) * 5).toFixed(2)}s`;
      });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from(eyebrowRef.current, { y: -10, opacity: 0, duration: 0.4 }, 0)
        .from(
          split.chars,
          {
            // 斜界味道：每个字从基线下方带 -8° 微旋升起、轻微放大落位
            yPercent: 110,
            opacity: 0,
            rotateZ: -8,
            scale: 0.92,
            transformOrigin: '50% 100%',
            duration: 0.72,
            stagger: 0.06,
          },
          0.08,
        )
        .from(velvetRef.current, { x: -8, opacity: 0, rotateZ: -4, duration: 0.5 }, 0.5)
        .from(
          dividerRef.current,
          { scaleX: 0, transformOrigin: 'left center', duration: 0.6 },
          0.55,
        );

      // 还原 <h1> 子节点，交还给 React 协调；配方也要跟着还回去（D0 兜底靠它）
      return () => {
        titleRef.current?.classList.remove('vr-split');
        split.revert();
      };
    },
    { scope: rootRef, dependencies: [bold, darkMode] },
  );

  return (
    <div ref={rootRef} className="md:hidden select-none px-1">
      <style>{`
        @keyframes vr-flow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        /* 流光配方同时作用于 <h1>（D0 未拆字时显示）与每个 .brand-char（拆字后显示）：
           background-clip:text 只裁元素自身的直系文字、不裁后代，SplitText 把文字搬进
           子 div 后 <h1> 便无字可裁，故同一配方必须下沉到每个字才能显形。
           :not(.vr-split) —— 拆字成功后 <h1> 那份必须彻底摘掉，留着会漏出黑矩形（见文件头）。 */
        .vr-title-light:not(.vr-split),
        .vr-title-light .brand-char {
          background-image: linear-gradient(90deg, #111 0%, #555 20%, #999 40%, #333 60%, #111 80%, #555 100%);
        }
        .dark .vr-title-dark:not(.vr-split),
        .dark .vr-title-dark .brand-char {
          background-image: linear-gradient(90deg, #fff 0%, #aaa 20%, #e0e0e0 40%, #bbb 60%, #fff 80%, #aaa 100%);
        }
        .vr-title-light:not(.vr-split),
        .dark .vr-title-dark:not(.vr-split),
        .vr-title-light .brand-char,
        .dark .vr-title-dark .brand-char {
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: vr-flow 5s linear infinite;
        }
        /* 拆字需 inline-block 才能受 GSAP transform（yPercent/rotate/scale）驱动 */
        .brand-char { display: inline-block; }
      `}</style>

      {/* 欢迎来到 — 与标题左边对齐，ml-0.5 微调 */}
      <span
        ref={eyebrowRef}
        className="block text-[11px] font-semibold tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-1 leading-none ml-0.5"
      >
        欢迎来到
      </span>

      {/* 主标题容器：relative 供 The Velvet 绝对定位 */}
      <div className="relative inline-block">
        <h1
          ref={titleRef}
          className={`text-[3.25rem] font-black leading-none ${darkMode ? 'vr-title-dark' : 'vr-title-light'}`}
          // whiteSpace:nowrap 是 fitTitle 的兜底：字号已经量着缩过，这里保证任何情况下
          // 都不会退化成「第二行只剩一个字」
          style={{ letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}
        >
          靛蓝色房间
        </h1>

        {/* The Velvet — 叠加在标题右下角 */}
        <span
          ref={velvetRef}
          className="absolute -bottom-1.5 -right-1 text-lg leading-none text-primary opacity-75 pointer-events-none"
          style={{ fontFamily: "'Caveat', cursive", fontWeight: 600 }}
        >
          The Velvet
        </span>
      </div>

      {/* 装饰性分隔线 */}
      <div
        ref={dividerRef}
        className="mt-2.5 h-px bg-gradient-to-r from-primary/40 via-primary/10 to-transparent"
      />
    </div>
  );
};
