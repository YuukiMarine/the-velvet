import { useEffect } from 'react';

/**
 * 全局"返回键"订阅栈。
 *
 * 背景：Capacitor 的 Android 物理/手势返回键通过 `App.addListener('backButton', ...)`
 * 触发一次回调。我们需要一个通用机制让散落在各处的 Modal / 临时页 都能"优先拦截"这次
 * 返回——比如 BattleModal 打开时按 back 应该先关 BattleModal，而不是直接弹"回到现实"。
 *
 * 设计：
 *   - 模块级栈 `handlers`：按注册顺序维护，每个元素返回一个关闭函数
 *   - 组件通过 `useBackHandler(isActive, close)` 声明：当 `isActive=true` 时入栈，离开 / false 时出栈
 *   - 消费 back 事件时：从栈顶（最后入栈）开始，调用 close()，视为消费并返回 true
 *   - 栈为空则交还给主路由逻辑（在 App.tsx 里决定 navigate / exit）
 *
 * 这种"订阅即注册、卸载即取消"的模式有两个好处：
 *   1. Modal 的 back 行为和它的打开状态在同一处声明，不用在 App.tsx 维护"哪些 Modal 开着"
 *   2. 嵌套弹窗（比如 BattleModal 里再开 VictoryModal）自动获得"先关里层再关外层"的正确语义
 */

type BackHandler = () => void;

const handlers: BackHandler[] = [];

/**
 * 尝试消费一次"返回键"事件。供 App.tsx 的 backButton 监听调用。
 * @returns true 表示有 handler 被调用（已消费）；false 表示栈空，调用方应走默认逻辑
 */
export function tryHandleBack(): boolean {
  if (handlers.length === 0) return false;
  // 栈顶优先消费
  const top = handlers[handlers.length - 1];
  try {
    top();
  } catch (e) {
    console.warn('[useBackHandler] handler threw:', e);
  }
  return true;
}

/**
 * 注册一个"返回键"处理回调。
 *
 * @param isActive 是否参与拦截（通常传 Modal 的 `isOpen`）
 * @param onBack   返回键触发时调用的函数（通常是关闭 Modal 的 setter）
 *
 * 使用示例：
 * ```tsx
 * useBackHandler(isOpen, onClose);
 * ```
 *
 * 注意：onBack 在函数里重新声明每次渲染会变化。hook 用 ref 持续引用最新的 onBack，
 * 所以你不需要 useCallback 包裹它——效果和 "always latest" 等价。
 */
export function useBackHandler(isActive: boolean, onBack: BackHandler): void {
  useEffect(() => {
    if (!isActive) return;
    // 每次 isActive 切到 true 都重新入栈（onBack 的最新引用由闭包捕获）
    const wrapper: BackHandler = () => onBack();
    handlers.push(wrapper);
    return () => {
      const idx = handlers.lastIndexOf(wrapper);
      if (idx !== -1) handlers.splice(idx, 1);
    };
  }, [isActive, onBack]);
}
