/**
 * overlayPause — 「有弹层盖着」的全局计数（v2.7.0.6 第 4 轮，界面性能）。
 *
 * 抽屉 / 弹窗的遮罩带 backdrop-filter 模糊：底下的背景动画每帧一动，模糊就得每帧重算一遍，
 * 弹层开着的整段时间 GPU 都在做无用功（用户批注：模糊保留，改成弹层打开时暂停背景动画）。
 * 这里只维护一个「当前有几层弹层开着」的计数；BackgroundAnimation 订阅它，>0 时把
 * 极光 / 粒子 / 波纹置成 paused，全部关掉后再重新锚定相位继续播。
 */
import { useEffect, useState } from 'react';

let openCount = 0;
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

/** 弹层组件里挂一次：open 期间计数 +1（卸载 / 关闭自动 -1） */
export function useOverlayPresence(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    openCount++;
    notify();
    return () => {
      openCount--;
      notify();
    };
  }, [open]);
}

/** 当前是否有任何弹层开着 */
export function useAnyOverlayOpen(): boolean {
  const [v, setV] = useState(openCount > 0);
  useEffect(() => {
    const l = () => setV(openCount > 0);
    listeners.add(l);
    l();
    return () => { listeners.delete(l); };
  }, []);
  return v;
}

/** 非 React 场合读一眼（测试 / 调试） */
export const overlayOpenCount = (): number => openCount;
