/**
 * 记忆隔离的判定（第 23 批）：navigatorMemory 与 navigatorPromise 互相 import，这两个纯函数单放一处两边都能用。
 * 开关在设置（navigatorMemoryIsolated）；记忆 / 约定 / 画像行上的 presetId 没有 = 共享。
 */
import { useAppStore } from '@/store';
import type { NavigatorMemo } from '@/types';

/** 「记忆按人格隔离」开着没有 */
export const memoryIsolated = (): boolean => !!useAppStore.getState().settings.navigatorMemoryIsolated;

/**
 * 不是「关于用户的事实」的那几类行（第 36 批）：画像、说法、印象、成长记录——召回 / 联想 / 归档材料 / 记事本记忆列表都要跳过，
 * 它们各有各的注入口。
 */
export const isMetaMemo = (m: Pick<NavigatorMemo, 'source'>): boolean =>
  m.source === 'profile' || m.source === 'bit' || m.source === 'impression' || m.source === 'growth';

/** 这条归谁（第 33 批：可以归好几位）；空 = 共享 */
export const memoOwners = (m: Pick<NavigatorMemo, 'presetId' | 'presetIds'>): string[] =>
  m.presetIds?.length ? m.presetIds : m.presetId ? [m.presetId] : [];

/** 这条记忆 / 约定 / 画像当前人格能不能读：没开隔离全能读；开了只读共享的和归自己的 */
export const memoVisibleTo = (m: Pick<NavigatorMemo, 'presetId' | 'presetIds'>, presetId: string | undefined): boolean => {
  if (!memoryIsolated() || !presetId) return true;
  const owners = memoOwners(m);
  return owners.length === 0 || owners.includes(presetId);
};

/** 归属的比较键（查重 / 合并用：归属一样才算同一条） */
export const ownersKey = (m: Pick<NavigatorMemo, 'presetId' | 'presetIds'>): string => [...memoOwners(m)].sort().join(',');

/**
 * 写归属（记事本多选）：一位 → 只写 presetId；两位及以上 → presetIds + presetId 写第一位（老版本 App 只认 presetId，
 * 只会当成那一位的，不会漏给别人）；一位都没有 / 全选 → 共享（两个字段都清掉，Dexie update 里 undefined = 删字段）
 */
export const ownersPatch = (ids: string[], all: string[]): Pick<NavigatorMemo, 'presetId' | 'presetIds'> => {
  const picked = [...new Set(ids)].filter((id) => all.includes(id));
  if (!picked.length || all.every((id) => picked.includes(id))) return { presetId: undefined, presetIds: undefined };
  if (picked.length === 1) return { presetId: picked[0], presetIds: undefined };
  return { presetId: picked[0], presetIds: picked };
};

/** 新记下的东西该标谁：开了隔离就标当前人格，否则不标（共享） */
export const memoOwner = (presetId: string | undefined): string | undefined => (memoryIsolated() && presetId ? presetId : undefined);
