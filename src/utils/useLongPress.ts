import { useCallback, useRef, useState } from 'react';

export interface LongPressOptions {
  /** 触发前需要持续按压的时长（ms），默认 500 */
  durationMs?: number;
  /** 允许的手指滑动像素数；超过则自动取消。默认 10px，对触屏滚动足够宽容 */
  moveTolerancePx?: number;
  /** 是否在按下时显式 setPointerCapture；默认 false（保持滚动体验） */
  capturePointer?: boolean;
}

export interface LongPressBindings {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
}

/**
 * 长按 hook。满足：
 *   1. 按住 durationMs 后触发 onLongPress
 *   2. 中途松手 / leave / cancel / 位移 > moveTolerancePx 都会取消（不触发）
 *   3. 暴露 pressing 状态供卡片做缩放反馈
 *
 * 与原先散落各处的 setTimeout + clearTimeout 方案相比，多加了 pointermove 的位移容差判定，
 * 解决了"开始按一张卡片随后手指轻滑页面"也会误触长按的老问题。
 */
export function useLongPress(
  onLongPress: () => void,
  options: LongPressOptions = {},
): { pressing: boolean; bindings: LongPressBindings } {
  const { durationMs = 500, moveTolerancePx = 10, capturePointer = false } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [pressing, setPressing] = useState(false);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
    setPressing(false);
  }, []);

  const bindings: LongPressBindings = {
    onPointerDown: (e) => {
      // 鼠标右键 / 中键忽略
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY };
      if (capturePointer) {
        try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
      }
      setPressing(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setPressing(false);
        onLongPress();
      }, durationMs);
    },
    onPointerMove: (e) => {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (dx * dx + dy * dy > moveTolerancePx * moveTolerancePx) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };

  return { pressing, bindings };
}
