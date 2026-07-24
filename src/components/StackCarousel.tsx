/**
 * StackCarousel — 首页「智能叠放」横滑容器（UI_DESIGN_PLAN_V2.5.md §3.2，
 * 斜界方案 UI_DESIGN_BOLD_V2.5.md §9 决议继承该决策）。
 *
 * v2：内脏换成 Embla（embla-carousel-react）。换掉原生 scroll-snap 的理由——
 * 原生方案只能"留一截"硬暗示可滑，完成度不足；Embla 给出滚动进度值，
 * 据此把非激活卡 scale + opacity 渐隐（App Store 式"下一张更小更淡"），
 * 用层次而非裸露边缘表达"还有内容"。tween 逻辑改写自 Embla 官方
 * Scale / Opacity 示例（非 loop 简化版）。
 *
 * 契约不变（与 v1 逐字一致，调用方零改动）：
 *   - itemWidthClass 默认 86%：下一张探出，配合缩放暗示可滑；
 *   - 页位记忆 localStorage（key 前缀 sl-stack-），隐私模式写入静默失败；
 *   - page 是"跳页指令"而非强受控——用户手势永远可滑走；
 *   - onPageChange 不在挂载/恢复页位时幻触发（Embla select 仅在选中项真变化时发）；
 *   - locked：锁定横滑（属性卡排序编辑等自带拖拽手势的内容用），reInit 切 watchDrag；
 *   - 等高对齐靠 items-stretch + 内层 h-full。
 *
 * D0（boldness 0 / reduced-motion）：tween 因子乘 0，所有卡回到等大不透明的朴素平铺。
 */
import { Children, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaCarouselType } from 'embla-carousel';
import { DotIndicator } from '@/components/DotIndicator';
import { useBoldness } from '@/utils/boldness';

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
   * 锁定横滑（拖拽失效）。给 slide 内部自带拖拽手势的内容用——
   * 如属性卡排序编辑模式：两套水平手势会互抢 pointer，编辑期间必须锁外层。
   */
  locked?: boolean;
  /** 自动轮播间隔毫秒（>0 开启，循环播放）；指针按下暂停、抬起重续；D0 不自动滚 */
  autoPlayMs?: number;
}

/** 缩放/透明度内插区间：非激活卡缩到 0.84、淡到 0.4（激活卡 1 / 1） */
const SCALE_MIN = 0.84;
const OPACITY_MIN = 0.4;
/** 因子基数：乘 snap 数，让相邻卡的视觉缩放程度与卡数无关（Embla 示例同款思路） */
const TWEEN_FACTOR_BASE = 0.3;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const readStoredIndex = (key: string, count: number): number => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return 0;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, Math.min(parsed, count - 1));
  } catch {
    return 0;
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
  autoPlayMs = 0,
}: StackCarouselProps) => {
  const storageKey = `sl-stack-${id}`;
  const slides = Children.toArray(children);
  const bold = useBoldness();

  // 初始页位在首次渲染就定（startIndex），避免挂载后 setState 多一帧 + 幻触发回调
  const initialIndexRef = useRef(
    page ?? readStoredIndex(storageKey, slides.length),
  );
  const lockedInitRef = useRef(locked);

  // options 必须稳定引用：embla-carousel-react 在 options 变化时会 reInit，
  // 字面量每次渲染都是新对象——useMemo 锁死，运行期的 locked/页位变化全交给下方
  // 显式 reInit effect，避免"自动 reInit × 手动 reInit"打架（Embla React 最佳实践）
  const emblaOptions = useMemo(
    () => ({
      align: 'center' as const,
      containScroll: 'trimSnaps' as const,
      startIndex: initialIndexRef.current,
      watchDrag: !lockedInitRef.current,
    }),
    [],
  );
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);

  const [activeIndex, setActiveIndex] = useState(initialIndexRef.current);

  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const boldRef = useRef(bold);
  boldRef.current = bold;

  // ── Scale / Opacity tween（Embla 官方示例改写，非 loop） ──────────────────
  const tweenFactor = useRef(0);
  const tweenNodes = useRef<HTMLElement[]>([]);

  const setTweenNodes = useCallback((api: EmblaCarouselType) => {
    tweenNodes.current = api
      .slideNodes()
      .map((n) => n.querySelector('.sl-stack-tween') as HTMLElement);
  }, []);

  const setTweenFactor = useCallback((api: EmblaCarouselType) => {
    tweenFactor.current = TWEEN_FACTOR_BASE * api.scrollSnapList().length;
  }, []);

  const applyTween = useCallback((api: EmblaCarouselType, eventName?: string) => {
    const factor = boldRef.current ? 1 : 0; // D0：因子归零 → 所有卡 scale1/opacity1
    const scrollProgress = api.scrollProgress();
    const slidesInView = api.slidesInView();
    const isScroll = eventName === 'scroll';
    api.scrollSnapList().forEach((snap, snapIndex) => {
      const diffToTarget = snap - scrollProgress;
      const slidesInSnap = api.internalEngine().slideRegistry[snapIndex];
      slidesInSnap.forEach((slideIndex) => {
        if (isScroll && !slidesInView.includes(slideIndex)) return;
        const t = clamp01(1 - Math.abs(diffToTarget * tweenFactor.current) * factor);
        const node = tweenNodes.current[slideIndex];
        if (!node) return;
        node.style.transform = `scale(${SCALE_MIN + (1 - SCALE_MIN) * t})`;
        node.style.opacity = String(OPACITY_MIN + (1 - OPACITY_MIN) * t);
      });
    });
  }, []);

  // 初始化 + 事件绑定
  useEffect(() => {
    if (!emblaApi) return;
    setTweenNodes(emblaApi);
    setTweenFactor(emblaApi);
    applyTween(emblaApi);

    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setActiveIndex(idx);
      try {
        localStorage.setItem(storageKey, String(idx));
      } catch {
        /* 隐私模式 localStorage 不可写：静默放弃记忆 */
      }
      onPageChangeRef.current?.(idx);
    };

    const onReInit = (api: EmblaCarouselType) => {
      setTweenNodes(api);
      setTweenFactor(api);
      applyTween(api);
      setActiveIndex(api.selectedScrollSnap());
    };

    emblaApi
      .on('select', onSelect)
      .on('scroll', applyTween)
      .on('slideFocus', applyTween)
      .on('reInit', onReInit);

    return () => {
      emblaApi.off('select', onSelect).off('scroll', applyTween).off('slideFocus', applyTween).off('reInit', onReInit);
    };
  }, [emblaApi, setTweenNodes, setTweenFactor, applyTween, storageKey]);

  // ── 自动轮播（autoPlayMs>0）：循环下一页；指针按下暂停、抬起重续；D0 静止 ──
  useEffect(() => {
    if (!emblaApi || !autoPlayMs || autoPlayMs <= 0 || locked) return;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => {
        if (!boldRef.current) return;
        if (emblaApi.canScrollNext()) emblaApi.scrollNext();
        else emblaApi.scrollTo(0);
      }, autoPlayMs);
    };
    start();
    const node = emblaApi.rootNode();
    const onDown = () => stop();
    const onUp = () => start();
    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
    return () => {
      stop();
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
    };
  }, [emblaApi, autoPlayMs, locked]);

  // locked 切换：reInit 改 watchDrag，startIndex 取当前位置避免跳页
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit({ watchDrag: !locked, startIndex: emblaApi.selectedScrollSnap() });
  }, [emblaApi, locked]);

  // 卡片数量变化（如战场隐藏 → 仪式叠放 3→2）：reInit 让 Embla 重新测量
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit({ startIndex: Math.min(emblaApi.selectedScrollSnap(), slides.length - 1) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, emblaApi]);

  // boldness 变化：tween 因子随之变（D0 → 平铺），手动重算一次（无 scroll 也生效）
  useEffect(() => {
    if (emblaApi) applyTween(emblaApi);
  }, [bold, emblaApi, applyTween]);

  // 受控跳页：只响应 page 值变化，不与用户手势抢方向盘
  useEffect(() => {
    if (page == null || !emblaApi) return;
    if (page !== emblaApi.selectedScrollSnap()) emblaApi.scrollTo(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const shownIndex = Math.min(activeIndex, Math.max(0, slides.length - 1));

  return (
    <div className={className}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-3 items-stretch">
          {slides.map((child, i) => (
            <div key={i} className={`min-w-0 flex-none ${itemWidthClass}`}>
              {/* tween 目标：scale/opacity 作用在内层，不动 flex 布局尺寸 */}
              <div className="sl-stack-tween h-full will-change-transform">{child}</div>
            </div>
          ))}
        </div>
      </div>
      {slides.length > 1 && (
        <DotIndicator
          className="mt-2"
          count={slides.length}
          activeIndex={shownIndex}
          onSelect={locked ? undefined : (i) => emblaApi?.scrollTo(i)}
        />
      )}
    </div>
  );
};
