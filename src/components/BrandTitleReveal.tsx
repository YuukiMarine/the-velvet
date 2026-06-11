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
 * 约束（与 utils/gsap.ts、utils/boldness.ts 的约定配套）：
 *   - D0 守卫：useBoldness()=false（reduced-motion / 校直模式 / 低端机永久降级）时
 *     完全不跑时间线、不拆字，直接渲染终态——这同时也是无 JS / SSR 的兜底视图。
 *   - 逐字 stagger 用 GSAP .from 默认 immediateRender:true：真机首帧即隐藏再入场、零闪烁；
 *     headless 预览无 rAF 时停在隐藏态属正常（验证改用 eval 读 DOM 终态）。
 *   - SplitText 会改写 <h1> 的子节点，cleanup 必须 split.revert() 还原 DOM，
 *     否则 React 协调会与 GSAP 写入的 span 打架。标题文案恒为静态，darkMode 切换
 *     只改 <h1> className（属性级更新，不触碰已拆分的子 span）。
 */
import { useRef } from 'react';
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

      // 还原 <h1> 子节点，交还给 React 协调
      return () => split.revert();
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
           子 div 后 <h1> 便无字可裁，故同一配方必须下沉到每个字才能显形。 */
        .vr-title-light,
        .vr-title-light .brand-char {
          background-image: linear-gradient(90deg, #111 0%, #555 20%, #999 40%, #333 60%, #111 80%, #555 100%);
        }
        .dark .vr-title-dark,
        .dark .vr-title-dark .brand-char {
          background-image: linear-gradient(90deg, #fff 0%, #aaa 20%, #e0e0e0 40%, #bbb 60%, #fff 80%, #aaa 100%);
        }
        .vr-title-light,
        .dark .vr-title-dark,
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
          style={{ letterSpacing: '-0.04em' }}
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
