/**
 * 把一行标题压进它的盒子里——宁可缩小，也不换行。
 *
 * 为什么要量而不是写死断点：字号、字体、字数（用户可改的房间名）三者都不固定，
 * 任何一组媒体查询都会在某个真机宽度上漏掉。做法是拿一个 nowrap 的隐藏探针
 * 量出「不换行时的自然宽度」，超了就按比例把 font-size 收下来。
 *
 * ⚠️ 逐项抄样式而不是用 `font` 简写：简写在部分内核里回读为空串，量出来就是 0。
 * 这个坑 BrandTitleReveal 里踩过一次，别再踩第二次。
 */
export interface FitOneLineOptions {
  /** 收到多小为止（px），默认 24 */
  min?: number;
  /** 右侧要给别的元素让出的空间（px），默认 0 */
  reserveRight?: number;
  /** 基准字号（px）。不传则读元素当前的 computed font-size ——
   *  注意反复调用时要传，否则会在已缩小的基础上继续缩 */
  baseFontSize?: number;
}

export function fitOneLine(el: HTMLElement | null, opts: FitOneLineOptions = {}): void {
  if (!el) return;
  const box = el.parentElement;
  if (!box) return;
  const { min = 24, reserveRight = 0 } = opts;

  const cs = getComputedStyle(el);
  const base = opts.baseFontSize ?? (parseFloat(cs.fontSize) || 0);
  if (!base) return;

  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;';
  probe.style.fontFamily = cs.fontFamily;
  probe.style.fontSize = `${base}px`;
  probe.style.fontWeight = cs.fontWeight;
  probe.style.fontStyle = cs.fontStyle;
  probe.style.letterSpacing = cs.letterSpacing;
  probe.textContent = el.textContent ?? '';
  document.body.appendChild(probe);
  const natural = probe.getBoundingClientRect().width;
  probe.remove();

  const avail = el.getBoundingClientRect().width - reserveRight;
  el.style.whiteSpace = 'nowrap';
  el.style.fontSize = natural > avail && avail > 0
    ? `${Math.max(min, base * (avail / natural)).toFixed(2)}px`
    : `${base}px`;
}
