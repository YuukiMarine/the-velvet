/**
 * StackCarousel — 首页「智能叠放」横滑容器（UI_DESIGN_PLAN_V2.5.md §3.2，
 * 斜界方案 UI_DESIGN_BOLD_V2.5.md §9 决议继承该决策）。
 *
 * 约束与取舍：
 *   - 原生 scroll-snap + 惯性滚动，不引手势库；本组件就是基底规则 1 里
 *     「不参与旋转的外层滚动容器」，斜轨甩尾等表现层后续叠在 slide 内部；
 *   - itemWidthClass 默认 86%：下一张探出边缘，「可滑」由几何自己开口说话；
 *   - 页位记忆走 localStorage（key 前缀 sl-stack-），隐私模式写入抛错一律静默；
 *   - activeIndex 由 scroll 事件驱动（passive + rAF 节流取最近卡），程序化
 *     跳页（圆点 / 受控 page）只负责 scrollTo，状态统一从滚动位置回算，
 *     避免双源打架；page 是"跳页指令"而非强受控——用户手势永远可滑走；
 *   - 等高对齐靠 items-stretch 撑开 slide 包裹层，卡片内容自取 h-full。
 */
import { Children, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DotIndicator } from '@/components/DotIndicator';

interface StackCarouselProps {
  /** 页位记忆 key（组件内部加 'sl-stack-' 前缀） */
  id: string;
  children: ReactNode[];
  className?: string;
  /** slide 宽度类；默认 86% 留出边缘探出 */
  itemWidthClass?: string;
  onPageChange?: (index: number) => void;
  /** 受控跳页：值变化时平滑滚到对应页 */
  page?: number;
  /**
   * 锁定横滑（snap 失效 + 不可滚动）。给 slide 内部自带拖拽手势的内容用——
   * 如属性卡的排序编辑模式：两套水平手势会互抢 pointer，编辑期间必须锁外层。
   */
  locked?: boolean;
}

/** 取视口中心最近的 slide 下标（snap-center 对齐，按子元素中点算距离） */
const nearestIndex = (el: HTMLElement): number => {
  const center = el.scrollLeft + el.clientWidth / 2;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i] as HTMLElement;
    const dist = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
};

const readStoredIndex = (key: string): number | null => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
};

export const StackCarousel = ({
  id,
  children,
  className,
  itemWidthClass = 'w-[86%]',
  onPageChange,
  page,
  locked = false,
}: StackCarouselProps) => {
  const storageKey = `sl-stack-${id}`;
  const scrollerRef = useRef<HTMLDivElement>(null);
  // 恢复页位在首次渲染就完成（惰性初始化）：若放到挂载 effect 里 setState，
  // 会多一次渲染，且"跳过挂载首跑"的守卫会被第一次 commit 消耗掉，
  // 导致带记忆页位进入时 onPageChange 被幻触发一次
  const [activeIndex, setActiveIndex] = useState(() => {
    const initial = page ?? readStoredIndex(storageKey);
    if (initial == null) return 0;
    return Math.max(0, Math.min(initial, Children.count(children) - 1));
  });
  // ref 镜像供事件回调读最新值，避免 scroll 监听随 state 反复重挂
  const activeIndexRef = useRef(activeIndex);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  const slides = Children.toArray(children);

  const scrollToIndex = (index: number, behavior: ScrollBehavior) => {
    const el = scrollerRef.current;
    if (!el) return;
    const child = el.children[index] as HTMLElement | undefined;
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior });
  };

  // 挂载时把滚动位置对齐到恢复的页位；'auto' 保证首帧前到位不闪
  useLayoutEffect(() => {
    if (activeIndexRef.current > 0) scrollToIndex(activeIndexRef.current, 'auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // scroll 驱动 activeIndex：passive + rAF 节流
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const next = nearestIndex(el);
        if (next !== activeIndexRef.current) {
          activeIndexRef.current = next;
          setActiveIndex(next);
        }
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // 页位落库 + 对外回调；跳过挂载首跑（恢复页位不算"变化"）
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    try {
      localStorage.setItem(storageKey, String(activeIndex));
    } catch {
      // 隐私模式下 localStorage 不可写，静默放弃记忆
    }
    onPageChangeRef.current?.(activeIndex);
  }, [activeIndex, storageKey]);

  // 受控跳页：只响应 page 值变化，不与用户手势抢方向盘
  useEffect(() => {
    if (page == null) return;
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(page, el.children.length - 1));
    if (target !== activeIndexRef.current) scrollToIndex(target, 'smooth');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // 卡片数动态减少时夹紧展示值，避免圆点越界
  const shownIndex = Math.min(activeIndex, Math.max(0, slides.length - 1));

  return (
    <div className={className}>
      <div
        ref={scrollerRef}
        className={`flex gap-3 items-stretch no-scrollbar ${
          locked ? 'overflow-x-hidden' : 'overflow-x-auto snap-x snap-mandatory'
        }`}
      >
        {slides.map((child, i) => (
          <div key={i} className={`flex-none snap-center ${itemWidthClass}`}>
            {child}
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <DotIndicator
          className="mt-2"
          count={slides.length}
          activeIndex={shownIndex}
          onSelect={locked ? undefined : (i => scrollToIndex(i, 'smooth'))}
        />
      )}
    </div>
  );
};
