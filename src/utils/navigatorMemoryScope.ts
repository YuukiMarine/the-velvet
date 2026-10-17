/**
 * 记忆隔离的判定（第 23 批）：navigatorMemory 与 navigatorPromise 互相 import，这两个纯函数单放一处两边都能用。
 * 开关在设置（navigatorMemoryIsolated）；记忆 / 约定 / 画像行上的 presetId 没有 = 共享。
 */
import { useAppStore } from '@/store';
import type { NavigatorMemo } from '@/types';

/** 「记忆按人格隔离」开着没有 */
export const memoryIsolated = (): boolean => !!useAppStore.getState().settings.navigatorMemoryIsolated;

/** 这条记忆 / 约定 / 画像当前人格能不能读：没开隔离全能读；开了只读共享的和自己的 */
export const memoVisibleTo = (m: Pick<NavigatorMemo, 'presetId'>, presetId: string | undefined): boolean =>
  !memoryIsolated() || !m.presetId || !presetId || m.presetId === presetId;

/** 新记下的东西该标谁：开了隔离就标当前人格，否则不标（共享） */
export const memoOwner = (presetId: string | undefined): string | undefined => (memoryIsolated() && presetId ? presetId : undefined);
