import { create } from 'zustand';
import type { AuthRecord } from 'pocketbase';
import { cloudEnabled, pb, getAuthRecord } from '@/services/pocketbase';
import type { SyncDiff } from '@/services/sync';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

interface CloudState {
  /** 是否配置了云端后端地址（.env.local 中的 VITE_PB_URL） */
  cloudEnabled: boolean;
  /** 当前登录的云端用户，null = 未登录 */
  cloudUser: AuthRecord | null;
  /** 最近一次同步的状态 */
  syncStatus: SyncStatus;
  /** 最近一次同步完成的时间，null = 从未同步 */
  lastSyncAt: Date | null;
  /** 最近一次同步 / 登录 / 其他云操作的错误信息 */
  lastError: string | null;
  /** 是否存在未解决的本地/云端冲突（登录后发现两边都有数据时置为 true） */
  conflictPending: boolean;
  /** 最近一次同步的方向（用于 UI 反馈） */
  lastSyncDirection: 'push' | 'pull' | null;
  /** 本地/云端存在较大差异时的待确认提示（自动同步检测到时置为 true） */
  diffWarning: SyncDiff | null;

  setCloudUser: (u: AuthRecord | null) => void;
  setSyncStatus: (s: SyncStatus) => void;
  setLastSyncAt: (d: Date | null) => void;
  setLastError: (e: string | null) => void;
  setConflictPending: (b: boolean) => void;
  setLastSyncDirection: (d: 'push' | 'pull' | null) => void;
  setDiffWarning: (d: SyncDiff | null) => void;

  /**
   * 订阅 PocketBase authStore 变化，自动同步到本 store
   * 应用启动时调用一次即可。返回取消订阅函数。
   */
  initAuthListener: () => () => void;
}

export const useCloudStore = create<CloudState>(set => ({
  cloudEnabled,
  cloudUser: getAuthRecord(),
  syncStatus: 'idle',
  lastSyncAt: null,
  lastError: null,
  conflictPending: false,
  lastSyncDirection: null,
  diffWarning: null,

  setCloudUser: cloudUser => set({ cloudUser }),
  setSyncStatus: syncStatus => set({ syncStatus }),
  setLastSyncAt: lastSyncAt => set({ lastSyncAt }),
  setLastError: lastError => set({ lastError }),
  setConflictPending: conflictPending => set({ conflictPending }),
  setLastSyncDirection: lastSyncDirection => set({ lastSyncDirection }),
  setDiffWarning: diffWarning => set({ diffWarning }),

  initAuthListener: () => {
    if (!cloudEnabled || !pb) return () => {};
    return pb.authStore.onChange((_token, record) => {
      set({ cloudUser: record ?? null });
    });
  },
}));
