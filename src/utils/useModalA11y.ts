import { useEffect, useRef } from 'react';

/**
 * 在 Modal 打开期间：
 *   1. 监听 keydown，按 Esc 自动调用 onClose（enabled=false 时禁用）
 *   2. 在 container 内实现简单焦点陷阱（Tab / Shift+Tab 轮转可聚焦元素）
 *   3. 返回一个 ref，挂到对话框最外层容器上
 *
 * 与其他 Modal 的现有开/关动画完全独立，不改动画、不改 DOM 结构，
 * 只增强键盘可达性与屏幕阅读器语义。
 *
 * 叠层语义：模块级栈记录打开顺序，**只有栈顶实例消费 ESC 与 Tab 陷阱**——
 * 否则二段确认（ConfirmDialog 叠在 SheetModal 上）时一次 ESC 会同时触发
 * 两层的 document keydown 监听，把两层一起关掉；下层的焦点陷阱也会和
 * 顶层抢 Tab。onClose / options 经 ref 取最新值，deps 只有 [isOpen]，
 * 保证栈顺序不被重渲染打乱（与 useBackHandler 同一套约定）。
 */

/** 打开顺序栈：元素是每个打开实例的身份 token */
const a11yStack: object[] = [];

export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
  options: { closeOnEscape?: boolean; trapFocus?: boolean } = {},
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!isOpen) return;

    const token = {};
    a11yStack.push(token);

    // 打开前的焦点，关闭时归还（嵌套弹窗逐层退栈逐层交还）
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // 打开时把焦点移进对话框（WCAG：模态打开焦点应入内）。
    // 仅当焦点尚未在容器内才移动——保住 autoFocus 输入框（它在挂载时已同步聚焦、落在容器内）。
    //
    // preventScroll 必带：入场动画期间弹窗本体常在屏外（如 P3 斜带 cut-in 从 x:110% 滑入），
    // 默认 focus() 会让浏览器把那个屏外按钮"滚进视口"——遮罩是 fixed + overflow-hidden，
    // 仍可被程序化设 scrollLeft，于是整层内容被滚偏（用户上报"稍微向左错位"）；退场时内容
    // 缩回、scrollLeft 被钳回 0，看起来就是"消失前向右抽一下"。归还焦点同理（防页面跳动）。
    const root = containerRef.current;
    if (root && !root.contains(document.activeElement)) {
      const target = root.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (target) target.focus({ preventScroll: true });
      else { root.setAttribute('tabindex', '-1'); root.focus({ preventScroll: true }); }
    }

    const handleKey = (e: KeyboardEvent) => {
      // 非栈顶实例不消费：ESC 与焦点陷阱都只属于最上层弹窗
      if (a11yStack[a11yStack.length - 1] !== token) return;
      const { closeOnEscape = true, trapFocus = true } = optionsRef.current;
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onCloseRef.current();
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
    return () => {
      document.removeEventListener('keydown', handleKey);
      const idx = a11yStack.lastIndexOf(token);
      if (idx !== -1) a11yStack.splice(idx, 1);
      // 关闭时把焦点交还给打开前的元素（仍在文档内才还）——避免键盘/读屏丢失定位
      if (previouslyFocused && previouslyFocused.isConnected && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  return containerRef;
}
