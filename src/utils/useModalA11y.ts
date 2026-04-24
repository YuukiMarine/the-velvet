import { useEffect, useRef } from 'react';

/**
 * 在 Modal 打开期间：
 *   1. 监听 keydown，按 Esc 自动调用 onClose（enabled=false 时禁用）
 *   2. 在 container 内实现简单焦点陷阱（Tab / Shift+Tab 轮转可聚焦元素）
 *   3. 返回一个 ref，挂到对话框最外层容器上
 *
 * 与其他 Modal 的现有开/关动画完全独立，不改动画、不改 DOM 结构，
 * 只增强键盘可达性与屏幕阅读器语义。
 */
export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
  options: { closeOnEscape?: boolean; trapFocus?: boolean } = {},
) {
  const { closeOnEscape = true, trapFocus = true } = options;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (!trapFocus || e.key !== 'Tab') return;
      const root = containerRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, closeOnEscape, trapFocus]);

  return containerRef;
}
