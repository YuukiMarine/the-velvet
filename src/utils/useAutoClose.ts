import { useEffect, useRef } from 'react';

/**
 * 弹窗自动关闭定时器（UI_AUDIT_V2.5.md §3.6：自动关闭时长 5 档散值的统一收口点）。
 *
 * 约束：
 *   - ms <= 0 视为"不自动关"，完全 no-op（CelebrationCutIn 的 autoCloseMs=0 语义）
 *   - 关闭 / 卸载 / ms 变化都会清掉旧定时器——不存在"已手动关了、又被残留定时器关一次"的竞态
 *   - onClose 走 ref 取最新引用：调用方传内联箭头函数不会导致倒计时重置，无需 useCallback
 */
export function useAutoClose(isOpen: boolean, ms: number, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || ms <= 0) return;
    const timer = setTimeout(() => onCloseRef.current(), ms);
    return () => clearTimeout(timer);
  }, [isOpen, ms]);
}
