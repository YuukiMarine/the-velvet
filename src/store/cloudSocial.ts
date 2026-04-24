/**
 * 在线社交 store —— 好友关系 + 通知列表的内存状态。
 *
 * 和 `cloud.ts`（同步状态 / 登录用户）分离，职责单一：
 *   - friendships / notifications 都是"PB 数据的本地视图"
 *   - 不落 Dexie（不做离线缓存），都是登录后首次拉 + 切前台再拉
 *   - 断网时对方 profile 的缓存走 `Confidant.linkedProfile`（另一个系统）
 */

import { create } from 'zustand';
import type { CoopBond, CoopShadow, Friendship, NotificationEntry, Prayer } from '@/types';

/** 一个未能"物化成本地 Confidant"的 COOP 契约 —— 本地塔罗冲突时出现 */
export interface MaterializeBlocker {
  bondId: string;
  /** 塔罗 id（对应 Confidant.arcanaId，字符串即可） */
  arcanaId: string;
  otherName: string;
}

interface CloudSocialState {
  friendships: Friendship[];
  notifications: NotificationEntry[];
  unreadCount: number;
  /** 今天（本地 04:00 日界）与我相关的全部祈愿记录（from=me / to=me 都在） */
  todayPrayers: Prayer[];
  /** 所有与我相关的 COOP 契约（pending / linked / rejected / severed / expired） */
  coopBonds: CoopBond[];
  /** 所有与我相关的羁绊之影（active / defeated / retreated）—— COOP 联机 Boss */
  coopShadows: CoopShadow[];
  /**
   * 对方的 COOP 已 linked，但本机同号塔罗已被其他活跃同伴占用 → 没法在本地建卡。
   * UI 用这个列表提示用户"先把冲突的同伴归档一下再来刷新"。
   */
  materializeBlockers: MaterializeBlocker[];
  loading: boolean;
  /** 最近一次拉取成功的时间（用于"切前台时是否需要重拉"的节流） */
  lastLoadedAt: Date | null;
  lastError: string | null;

  // ── 写入接口 ──
  setLoading: (b: boolean) => void;
  setLastError: (e: string | null) => void;
  setMaterializeBlockers: (list: MaterializeBlocker[]) => void;
  setFriendships: (fs: Friendship[]) => void;
  setNotifications: (ns: NotificationEntry[]) => void;
  setTodayPrayers: (ps: Prayer[]) => void;
  addTodayPrayer: (p: Prayer) => void;
  setCoopBonds: (bonds: CoopBond[]) => void;
  addCoopBond: (b: CoopBond) => void;
  updateCoopBond: (id: string, patch: Partial<CoopBond>) => void;
  setCoopShadows: (ss: CoopShadow[]) => void;
  upsertCoopShadow: (s: CoopShadow) => void;
  markNotificationRead: (id: string) => void;
  addNotification: (n: NotificationEntry) => void;
  removeNotification: (id: string) => void;
  addFriendship: (f: Friendship) => void;
  updateFriendship: (id: string, patch: Partial<Friendship>) => void;
  removeFriendship: (id: string) => void;
  markLoaded: () => void;
  /** 登出 / 切账号时调用，清空一切 */
  reset: () => void;
}

const computeUnread = (notifications: NotificationEntry[]): number =>
  notifications.filter(n => !n.read).length;

export const useCloudSocialStore = create<CloudSocialState>(set => ({
  friendships: [],
  notifications: [],
  unreadCount: 0,
  todayPrayers: [],
  coopBonds: [],
  coopShadows: [],
  materializeBlockers: [],
  loading: false,
  lastLoadedAt: null,
  lastError: null,

  setLoading: loading => set({ loading }),
  setLastError: lastError => set({ lastError }),
  setMaterializeBlockers: materializeBlockers => set({ materializeBlockers }),

  setFriendships: friendships => set({ friendships }),

  setNotifications: notifications => set({
    notifications,
    unreadCount: computeUnread(notifications),
  }),

  setTodayPrayers: todayPrayers => set({ todayPrayers }),

  addTodayPrayer: p => set(state => {
    if (state.todayPrayers.some(x => x.id === p.id)) return state;
    return { todayPrayers: [p, ...state.todayPrayers] };
  }),

  setCoopBonds: coopBonds => set({ coopBonds }),

  addCoopBond: b => set(state => {
    if (state.coopBonds.some(x => x.id === b.id)) return state;
    return { coopBonds: [b, ...state.coopBonds] };
  }),

  updateCoopBond: (id, patch) => set(state => ({
    coopBonds: state.coopBonds.map(b => (b.id === id ? { ...b, ...patch } : b)),
  })),

  setCoopShadows: coopShadows => set({ coopShadows }),

  upsertCoopShadow: s => set(state => {
    const idx = state.coopShadows.findIndex(x => x.id === s.id);
    if (idx >= 0) {
      const next = state.coopShadows.slice();
      next[idx] = s;
      return { coopShadows: next };
    }
    return { coopShadows: [s, ...state.coopShadows] };
  }),

  markNotificationRead: id => set(state => {
    const notifications = state.notifications.map(n =>
      n.id === id ? { ...n, read: true } : n,
    );
    return { notifications, unreadCount: computeUnread(notifications) };
  }),

  addNotification: n => set(state => {
    if (state.notifications.some(x => x.id === n.id)) return state;
    const notifications = [n, ...state.notifications];
    return { notifications, unreadCount: computeUnread(notifications) };
  }),

  removeNotification: id => set(state => {
    const notifications = state.notifications.filter(n => n.id !== id);
    return { notifications, unreadCount: computeUnread(notifications) };
  }),

  addFriendship: f => set(state => {
    if (state.friendships.some(x => x.id === f.id)) return state;
    return { friendships: [f, ...state.friendships] };
  }),

  updateFriendship: (id, patch) => set(state => ({
    friendships: state.friendships.map(f => (f.id === id ? { ...f, ...patch } : f)),
  })),

  removeFriendship: id => set(state => ({
    friendships: state.friendships.filter(f => f.id !== id),
  })),

  markLoaded: () => set({ lastLoadedAt: new Date() }),

  reset: () => set({
    friendships: [],
    notifications: [],
    unreadCount: 0,
    todayPrayers: [],
    coopBonds: [],
    coopShadows: [],
    materializeBlockers: [],
    loading: false,
    lastLoadedAt: null,
    lastError: null,
  }),
}));
