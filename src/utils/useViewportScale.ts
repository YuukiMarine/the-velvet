/**
 * useShortViewportScale —— 矮视口自适应缩放（v2.7 · 3:4 竖屏适配）。
 *
 * 背景：同伴专辑墙这类**不滚动的立式构图**（卡墙 + 铭牌 + 应援行）按 19.5:9 长屏
 * 排的版，在 3:4 竖屏（视口高往往只有 ~500 CSS px）下垂直装不下，信息被削。
 * 约束在纵向，所以以「视口高度」为基准返回 [minScale, 1] 的缩放系数：
 *   vh ≥ baselineH → 1（常规长屏分毫不动）；更矮按比例线性缩，封底 minScale。
 *
 * 用法（迁移到其它页面也是同一句）：
 *   const s = useShortViewportScale(760);            // 760px 及以上不缩
 *   const cardW = Math.round(BASE_CARD_W * s);       // 派生一切固定尺寸
 *
 * 订阅 resize / orientationchange；模块级单监听多订阅，SSR 下恒返回 1。
 */
import { useSyncExternalStore } from 'react';

const subs = new Set<() => void>();
let listening = false;
const ensureListen = () => {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const fire = () => subs.forEach(f => f());
  window.addEventListener('resize', fire);
  window.addEventListener('orientationchange', fire);
};
const subscribe = (cb: () => void) => {
  ensureListen();
  subs.add(cb);
  return () => { subs.delete(cb); };
};

const getVh = () => (typeof window === 'undefined' ? 0 : window.innerHeight);

export function useShortViewportScale(baselineH = 760, minScale = 0.72): number {
  const vh = useSyncExternalStore(subscribe, getVh, () => baselineH);
  if (!vh || vh >= baselineH) return 1;
  // 取两位小数：避免键盘弹出等 1px 级抖动引发连续重渲染
  return Math.max(minScale, Math.round((vh / baselineH) * 100) / 100);
}
