import { useLayoutEffect, useRef, type DependencyList } from 'react';

/**
 * 星图侧边标签防裁切（第 6 轮验收返工）。
 * 左右两角的标签往外伸：左角的大半个身子在角尖左边，等级到两位数、再带一颗精通星，就会伸出卡片被裁掉
 * （红频道原本「平平无奇」就少一个字）。这里量一下每个标签的实际宽度与落点，出了容器多少就往回挪多少。
 * 只动 left，不改原来的 translate；容器尺寸变了（转屏 / 字号）由 ResizeObserver 重算。
 */
export function useSideLabelClamp(deps: DependencyList) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labels = useRef<Array<{ el: HTMLElement; leftPct: number; tx: number } | null>>([]);
  /** tx = 该标签 translateX 的百分比（-86 左角 / -14、-42 右角 / -50 顶底） */
  const register = (i: number, leftPct: number, tx: number) => (el: HTMLElement | null) => {
    labels.current[i] = el ? { el, leftPct, tx } : null;
  };
  useLayoutEffect(() => {
    const run = () => {
      const c = containerRef.current;
      if (!c) return;
      const W = c.clientWidth;
      const PAD = 4; // 标签还要反变换回正，斜切会再带一点偏移，留一点余量
      for (const r of labels.current) {
        if (!r) continue;
        const w = r.el.offsetWidth;
        const leftEdge = (r.leftPct / 100) * W + (r.tx / 100) * w;
        const rightEdge = leftEdge + w;
        const shift = leftEdge < PAD ? PAD - leftEdge : rightEdge > W - PAD ? (W - PAD) - rightEdge : 0;
        r.el.style.left = shift ? `calc(${r.leftPct}% + ${shift.toFixed(1)}px)` : `${r.leftPct}%`;
      }
    };
    run();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run);
    if (ro && containerRef.current) ro.observe(containerRef.current);
    return () => { ro?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { containerRef, register };
}
