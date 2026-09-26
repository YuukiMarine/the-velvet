/**
 * 「看得见才跑」的 rAF 循环（v2.7.0.6 第 4 轮，界面性能）。
 *
 * 几处装饰动画（蓝首页标题抖动、黄 / 蓝菜单的活高亮）原来是 60fps **常驻** requestAnimationFrame：
 * 页面滚到别处、元素早已不在视口里，它们照样每帧改 SVG 顶点。
 *   · 元素移出视口就整个停掉（IntersectionObserver），回来再起（用户口径：可见时保持 60fps）；
 *   · fps < 60 才跳帧（保留给以后需要降频的场合）；回调拿到真实 dt，插值系数按 dt 折算；
 *   · 标签页隐藏时浏览器本来就会挂起 rAF。
 */
export function startLowFpsLoop(
  el: Element | null,
  fps: number,
  tick: (now: number, dt: number) => void,
): () => void {
  const everyFrame = fps >= 60;
  const interval = 1000 / fps;
  let raf = 0;
  let last = 0;
  let running = false;
  let stopped = false;
  const loop = (t: number) => {
    if (stopped || !running) return;
    if (everyFrame || t - last >= interval) {
      const dt = last ? t - last : 1000 / 60;
      last = t;
      tick(t, dt);
    }
    raf = requestAnimationFrame(loop);
  };
  const start = () => {
    if (running || stopped) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  const pause = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  let io: IntersectionObserver | null = null;
  if (el && typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      const visible = entries.some((e) => e.isIntersecting);
      if (visible) start(); else pause();
    }, { threshold: 0 });
    io.observe(el);
  } else {
    start();
  }
  return () => {
    stopped = true;
    pause();
    io?.disconnect();
  };
}

/** 按帧率折算的插值系数：60fps 下每帧 base，dt 更长时补到同样的收敛速度 */
export const lerpK = (base: number, dt: number): number => 1 - Math.pow(1 - base, dt / (1000 / 60));
