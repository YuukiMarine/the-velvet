/**
 * useUiChannel —— 订阅 <html data-ui-channel> 的响应式频道值。
 *
 * 频道由 store 在 data-theme 写点同步挂载（src/ui/channel.ts）；原语组件用本 hook
 * 自动继承当前频道，也可被显式 channel prop 覆盖（见各 Persona* 组件）。
 * 用 useSyncExternalStore + MutationObserver：与页面里既有的 data-theme 观察者
 * 同一套模式，但集中一处、去重订阅。
 */
import { useSyncExternalStore } from 'react';
import type { UIChannel } from './channel';

const subscribe = (onChange: () => void) => {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-channel'] });
  return () => obs.disconnect();
};

const getSnapshot = (): UIChannel =>
  (document.documentElement.getAttribute('data-ui-channel') as UIChannel | null) ?? 'neutral';

export const useUiChannel = (): UIChannel => useSyncExternalStore(subscribe, getSnapshot);
