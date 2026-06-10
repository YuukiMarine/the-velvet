import { useEffect, useRef } from 'react';

/**
 * "每次打开只触发一次"的副作用守卫——庆祝弹窗接音效/震动的统一入口
 * （UI_AUDIT_V2.5.md §5 基座配套原语；蓝本是 AchievementUnlockModal 的 playedRef 模式）。
 *
 * 语义：isOpen 每次 false→true 的转变调用一次 fn；打开期间任何重渲染不重复触发；
 * 关闭时重置守卫，下次打开再触发。fn 走 ref 取最新引用，调用方无需 useCallback。
 */
export function useFeedbackOnce(isOpen: boolean, fn?: () => void): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const firedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    fnRef.current?.();
  }, [isOpen]);
}
