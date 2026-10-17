/**
 * FAB 让位（第 22 批 · 用户反馈「+ 号挡住已完成任务的恢复 / 删除」）。
 *
 * 右下角的「+」是 fixed 定位，归档区卡片右侧那排小钮（编辑 / 删除 / 恢复）贴卡片右缘，
 * 条目少、页面不滚的时候正好落在它底下，点不到。给会被盖的那排钮打 `data-fab-avoid`，
 * FAB 一旦和它们相交就往上滑到那排钮上面，离开再滑回；只动 FAB 自己的 transform，不改卡片布局。
 *
 * 测量时机：滚动（capture，任何滚动容器都收得到）、窗口尺寸变化、文档高度变化（ResizeObserver）、
 * 列表增删（MutationObserver 只看 childList）。全部合并到一帧里算，避免抖。
 * 用法：把返回的 ref / style 挂在 FAB 的 fixed 外壳上（motion 元件自己管 transform，外壳要是普通 div）。
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

const GAP = 10;
/** 最多抬这么高：几排钮叠在一起时抬过两排就够用了，再高「+」就像飞走了 */
const MAX_SHIFT = 200;
const SELECTOR = '[data-fab-avoid]';

export function useFabDodge(enabled = true): { ref: RefObject<HTMLDivElement>; style: CSSProperties } {
  const ref = useRef<HTMLDivElement>(null);
  const shiftRef = useRef(0);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (!enabled) { shiftRef.current = 0; setShift(0); return; }
    let raf = 0;
    const measure = () => {
      raf = 0;
      const fab = ref.current;
      if (!fab) return;
      const r = fab.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // 壳上带着位移（还可能正在 220ms 的滑动过渡中）：按**此刻实际生效**的 transform 还原成「不让位」时的位置，
      // 不能拿 shiftRef 去减——过渡中途矩形和目标位移对不上，会一路叠加着往上飞
      let live = 0;
      try {
        const tf = getComputedStyle(fab).transform;
        if (tf && tf !== 'none') live = new DOMMatrixReadOnly(tf).m42;
      } catch { live = -shiftRef.current; }
      const base = { left: r.left, right: r.right, top: r.top - live, bottom: r.bottom - live };
      let next = 0;
      // 从下往上推：每找到一排挡住的钮，就把 FAB 抬到它上面，再看抬完会不会撞上更上面的那排
      const targets = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))
        .map(el => el.getBoundingClientRect())
        .filter(t => t.width > 0 && t.height > 0 && t.left < base.right + GAP && t.right > base.left - GAP)
        .sort((a, b) => b.top - a.top);
      for (let pass = 0; pass < 4; pass++) {
        const top = base.top - next, bottom = base.bottom - next;
        const hit = targets.find(t => t.top < bottom + GAP && t.bottom > top - GAP);
        if (!hit) break;
        next = base.bottom - hit.top + GAP;
      }
      // 别抬出屏幕、也别飞太高
      next = Math.max(0, Math.min(next, MAX_SHIFT, base.top - 8));
      if (Math.abs(next - shiftRef.current) < 0.5) return;
      shiftRef.current = next;
      setShift(next);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };

    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(document.documentElement);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions);
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
      mo.disconnect();
    };
  }, [enabled]);

  return {
    ref,
    style: shift ? { transform: `translateY(-${shift}px)`, transition: 'transform 220ms ease' } : { transition: 'transform 220ms ease' },
  };
}
