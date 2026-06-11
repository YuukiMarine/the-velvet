/**
 * SlantGuideLine —— 斜界系统「引导线 / 动线」（UI_DESIGN_BOLD_V2.5.md §2 规则2、§5）。
 *
 * 在两个页面元素之间画一条"先竖后斜"的折线，串起视线（如首页：问候卡的今日日期
 * → 今日任务，"从今天 → 今天要做的事"）。线由 DOM 实测位置生成，ResizeObserver
 * 跟随重排；用 GSAP DrawSVGPlugin 做一次"描线生长"入场。
 *
 * 约束：
 *   - 纯装饰：aria-hidden + pointer-events-none，绝不拦截命中。
 *   - 颜色走 --color-primary（随主题）；线宽用 --ui-accent-w（动线是信息不是装饰，
 *     §2 规则：不乘 --boldness，D0 仍在场）。
 *   - 生长动画 immediateRender:false——headless/无 rAF 下停在终态可见（线照常显示），
 *     动画只在真实 rAF 播放；D0（boldness 0）直接终态、不生长。
 *   - 定位参照 containerRef 必须 position:relative；本组件绝对铺满它。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { gsap, useGSAP } from '@/utils/gsap';
import { useBoldness } from '@/utils/boldness';

type Anchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface SlantGuideLineProps {
  /** 定位参照（须 relative）；线在此元素坐标系内绘制 */
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  fromAnchor?: Anchor;
  toAnchor?: Anchor;
  /** 竖→斜转折点的纵向占比（0=起点处转，1=终点处转） */
  bend?: number;
  /** 锚点向内缩进，避免压在元素正角上 */
  inset?: number;
  className?: string;
}

const anchorOf = (rect: DOMRect, cont: DOMRect, anchor: Anchor, inset: number) => {
  const [v, h] = anchor.split('-');
  const x =
    h === 'left' ? rect.left + inset
    : h === 'right' ? rect.right - inset
    : rect.left + rect.width / 2;
  const y = v === 'top' ? rect.top + inset : rect.bottom - inset;
  return { x: x - cont.left, y: y - cont.top };
};

export const SlantGuideLine = ({
  containerRef,
  fromRef,
  toRef,
  fromAnchor = 'bottom-right',
  toAnchor = 'top-left',
  bend = 0.45,
  inset = 14,
  className,
}: SlantGuideLineProps) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [geom, setGeom] = useState<{ w: number; h: number; d: string } | null>(null);
  const bold = useBoldness();

  useLayoutEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      const f = fromRef.current;
      const t = toRef.current;
      if (!c || !f || !t) return;
      const cr = c.getBoundingClientRect();
      const p1 = anchorOf(f.getBoundingClientRect(), cr, fromAnchor, inset);
      const p2 = anchorOf(t.getBoundingClientRect(), cr, toAnchor, inset);
      // 先竖后斜：从起点垂直下降到 bend 处，再斜插到终点——斜界"先竖后斜"动线
      const midY = p1.y + (p2.y - p1.y) * bend;
      const d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p1.x.toFixed(1)} ${midY.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      setGeom({ w: cr.width, h: cr.height, d });
    };
    compute();
    const ro = new ResizeObserver(compute);
    [containerRef, fromRef, toRef].forEach((r) => r.current && ro.observe(r.current));
    return () => ro.disconnect();
  }, [containerRef, fromRef, toRef, fromAnchor, toAnchor, bend, inset]);

  useGSAP(
    () => {
      if (!geom || !pathRef.current || !bold) return;
      gsap.from(pathRef.current, {
        drawSVG: '0%',
        duration: 0.9,
        ease: 'power2.out',
        immediateRender: false,
        delay: 0.25,
      });
    },
    { dependencies: [geom, bold] },
  );

  if (!geom) return null;
  return (
    <svg
      aria-hidden
      className={`pointer-events-none absolute inset-0${className ? ` ${className}` : ''}`}
      width={geom.w}
      height={geom.h}
      style={{ overflow: 'visible' }}
    >
      <path
        ref={pathRef}
        d={geom.d}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="var(--ui-accent-w)"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
};
