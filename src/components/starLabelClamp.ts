import { useLayoutEffect, useRef, type DependencyList } from 'react';

/**
 * 星图侧边标签防裁切（第 6 轮验收返工）。
 * 左右两角的标签往外伸：左角的大半个身子在角尖左边，等级到两位数、再带一颗精通星，就会伸出卡片被裁掉
 * （红频道原本「平平无奇」就少一个字）。这里量一下每个标签的实际宽度与落点，出了容器多少就往回挪多少。
 * 只动 left，不改原来的 translate；容器尺寸变了（转屏 / 字号）由 ResizeObserver 重算。
 *
 * 第 17 批（用户反馈「红色主题五维雷达图左右两侧被截断」）：
 *   - 星和标签同处一个斜切平面（skewX + scaleY），屏幕上 X = x + k·(y − H/2)，k = tan(skew)·scaleY。
 *     以前算边界时没算这一项：上半的标签被推向右、下半的推向左（红频道最多三四十 px），量出来「没出界」，
 *     画出来却被卡片的 overflow-hidden 切掉。传 plane 进来就把这段偏移算进去。
 *   - 标签重新挂载（关掉属性档案后 showLabels 又变回 true）、标签自己变宽（字体分片加载完、系统字号放大）
 *     以前都不重算；现在每个标签也挂进 ResizeObserver，字体就绪后再算一次。调用方把 showLabels 放进 deps。
 */
export function useSideLabelClamp(deps: DependencyList, plane?: { skewXDeg: number; scaleY: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labels = useRef<Array<{ el: HTMLElement; leftPct: number; tx: number; topPct: number; ty: number } | null>>([]);
  /**
   * tx / ty = 该标签 translate 的百分比（tx：-86 左角 / -14、-42 右角 / -50 顶底；ty 同理，缺省按垂直居中）；
   * topPct = 标签锚点的 top 百分比（斜切偏移按标签中心的高度算）
   */
  const register = (i: number, leftPct: number, tx: number, topPct = 50, ty = -50) => (el: HTMLElement | null) => {
    labels.current[i] = el ? { el, leftPct, tx, topPct, ty } : null;
  };
  const k = plane ? Math.tan((plane.skewXDeg * Math.PI) / 180) * plane.scaleY : 0;
  useLayoutEffect(() => {
    let alive = true;
    const run = () => {
      const c = containerRef.current;
      if (!alive || !c) return;
      const W = c.clientWidth;
      const H = c.clientHeight;
      const PAD = 4; // 标签反变换回正后还会带一点点倾角，留一点余量
      for (const r of labels.current) {
        if (!r) continue;
        const w = r.el.offsetWidth;
        const h = r.el.offsetHeight;
        // 标签中心在平面里的高度 → 斜切把它横向推了多少
        const cy = (r.topPct / 100) * H + (r.ty / 100) * h + h / 2;
        const leftEdge = (r.leftPct / 100) * W + (r.tx / 100) * w + k * (cy - H / 2);
        const rightEdge = leftEdge + w;
        const shift = leftEdge < PAD ? PAD - leftEdge : rightEdge > W - PAD ? (W - PAD) - rightEdge : 0;
        r.el.style.left = shift ? `calc(${r.leftPct}% + ${shift.toFixed(1)}px)` : `${r.leftPct}%`;
      }
    };
    run();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run);
    if (ro && containerRef.current) ro.observe(containerRef.current);
    // 标签自己变宽 / 变高（只改 left 不会改尺寸，不会自激）
    for (const r of labels.current) if (r && ro) ro.observe(r.el);
    // 中文标题字体按字分片加载：加载完字形变宽，再算一次
    void (typeof document !== 'undefined' ? document.fonts?.ready : undefined)?.then(run);
    return () => { alive = false; ro?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, k]);
  return { containerRef, register };
}
