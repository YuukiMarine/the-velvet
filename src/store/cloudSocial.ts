/**
 * 在线社交 store —— 好友关系 + 通知列表的内存状态。
 *
 * 和 `cloud.ts`（同步状态 / 登录用户）分离，职责单一：
 *   - friendships / notifications 都是"PB 数据的本地视图"
 *   - 不落 Dexie（不做离线缓存），都是登录后首次拉 + 切前台再拉
 *   - 断网时对方 profile 的缓存走 `Confidant.linkedProfile`（另一个系统）
 */

import { create } from 'zustand';
import type { CoopBond, CoopPact, CoopShadow, Friendship, NotificationEntry, OrgView, Prayer } from '@/types';

/** 组织的庆祝卡（第 8 轮）：作战达成（+SP / 亲密度）、据点升级；App 顶层排队弹，一次一张 */
export type OrgCelebration =
  | { kind: 'op'; opId: string; orgId: string; orgName: string; title: string; opKind: 'small' | 'big'; sp: number; partners: string[] }
  | { kind: 'level'; orgId: string; orgName: string; level: number; mult: number };

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
  /** 重要未读（剔除祈愿这类日常问候）——页头 ✧ 菜单红点用它，见 computeImportantUnread */
  importantUnreadCount: number;
  /** 今天（本地 04:00 日界）与我相关的全部祈愿记录（from=me / to=me 都在） */
  todayPrayers: Prayer[];
  /** 所有与我相关的 COOP 契约（pending / linked / rejected / severed / expired） */
  coopBonds: CoopBond[];
  /** 所有与我相关的羁绊之影（active / defeated / retreated）—— COOP 联机 Boss */
  coopShadows: CoopShadow[];
  /** 一起进步的约定（进行中 / 等回应，以及 45 天内结束的） */
  pacts: CoopPact[];
  /** 约定是否已经拉到过（没拉到时各处不据此判断「没有约定」） */
  pactsLoaded: boolean;
  /** 组织（第 7 轮）：我所在的组织（最多两个：自建一个 + 加入一个），各带全体成员与我那一行 */
  orgs: OrgView[];
  /** 组织是否已经拉到过（没拉到时入口不据此显示「还没有组织」） */
  orgsLoaded: boolean;
  /** 本机一次性提示（被请离 / 组织解散 / 在别的设备退出）：羁绊页组织卡上方显示，点掉即清 */
  orgNotice: string | null;
  /** 据点页正在看的组织 */
  hideoutOrgId: string | null;
  /** 进据点时先打开哪一区（有新动态 → 公告板、会议日没写 → 会议、有新作战 → 作战）；据点页读一次就清掉 */
  hideoutSection: 'roster' | 'board' | 'meeting' | 'ops' | null;
  /** 本机屏蔽的成员（云端用户 id；只在本机生效） */
  orgBlocked: string[];
  /** 举报过、本机不再显示的动态（7b） */
  orgHiddenPosts: string[];
  /** 卡面用头像的成员（云端用户 id；本机偏好，默认用代表牌） */
  orgAvatarFaces: string[];
  /** 公告板「看到哪儿了」：组织 id → ISO（7b 红点） */
  orgSeen: Record<string, string>;
  /** 作战区「看到哪儿了」：组织 id → ISO（第 8 轮红点） */
  orgOpsSeen: Record<string, string>;
  /** 待弹的庆祝卡（作战达成 / 据点升级，第 8 轮） */
  orgCelebrations: OrgCelebration[];
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
  setPacts: (ps: CoopPact[]) => void;
  upsertPact: (p: CoopPact) => void;
  setOrgs: (views: OrgView[]) => void;
  upsertOrgView: (view: OrgView) => void;
  removeOrgView: (orgId: string) => void;
  setOrgNotice: (msg: string | null) => void;
  setHideoutOrgId: (orgId: string | null) => void;
  setHideoutSection: (section: 'roster' | 'board' | 'meeting' | 'ops' | null) => void;
  setOrgBlocked: (userIds: string[]) => void;
  setOrgHiddenPosts: (postIds: string[]) => void;
  setOrgAvatarFaces: (userIds: string[]) => void;
  setOrgSeen: (orgId: string, at: string) => void;
  setOrgSeenAll: (map: Record<string, string>) => void;
  setOrgOpsSeen: (orgId: string, at: string) => void;
  setOrgOpsSeenAll: (map: Record<string, string>) => void;
  pushOrgCelebration: (c: OrgCelebration) => void;
  shiftOrgCelebration: () => void;
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

/**
 * 「重要未读」——只数需要用户**做点什么**或涉及关系变动的通知。
 * 祈愿（prayer_received / prayer_reciprocal）是每天都会来的日常问候，
 * 让它去点亮页头红点等于红点常亮、红点失效；它照常出现在通知列表里，只是不催人。
 * 页头 ✧ 菜单的红点跟这个数走；菜单内「通知」项仍显示全量 unreadCount。
 */
const AMBIENT_TYPES = new Set(['prayer_received', 'prayer_reciprocal']);
const computeImportantUnread = (notifications: NotificationEntry[]): number =>
  notifications.filter(n => !n.read && !AMBIENT_TYPES.has(n.type)).length;

export const useCloudSocialStore = create<CloudSocialState>(set => ({
  friendships: [],
  notifications: [],
  unreadCount: 0,
  importantUnreadCount: 0,
  todayPrayers: [],
  coopBonds: [],
  coopShadows: [],
  pacts: [],
  pactsLoaded: false,
  orgs: [],
  orgsLoaded: false,
  orgNotice: null,
  hideoutOrgId: null,
  hideoutSection: null,
  orgBlocked: [],
  orgHiddenPosts: [],
  orgAvatarFaces: [],
  orgSeen: {},
  orgOpsSeen: {},
  orgCelebrations: [],
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
    importantUnreadCount: computeImportantUnread(notifications),
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

  setPacts: pacts => set({ pacts, pactsLoaded: true }),

  upsertPact: p => set(state => {
    const idx = state.pacts.findIndex(x => x.id === p.id);
    if (idx >= 0) {
      const next = state.pacts.slice();
      // 刚写回来的记录可能没带 expand（对方档案），沿用旧的
      next[idx] = { ...p, otherProfile: p.otherProfile ?? state.pacts[idx].otherProfile };
      return { pacts: next };
    }
    return { pacts: [p, ...state.pacts] };
  }),

  setOrgs: orgs => set({ orgs, orgsLoaded: true }),

  upsertOrgView: v => set(state => {
    const idx = state.orgs.findIndex(x => x.org.id === v.org.id);
    if (idx < 0) return { orgs: [...state.orgs, v] };
    const next = state.orgs.slice();
    next[idx] = v;
    return { orgs: next };
  }),

  removeOrgView: orgId => set(state => ({ orgs: state.orgs.filter(v => v.org.id !== orgId) })),

  setOrgNotice: orgNotice => set({ orgNotice }),

  setHideoutOrgId: hideoutOrgId => set({ hideoutOrgId }),

  setHideoutSection: hideoutSection => set({ hideoutSection }),

  setOrgBlocked: orgBlocked => set({ orgBlocked }),

  setOrgHiddenPosts: orgHiddenPosts => set({ orgHiddenPosts }),

  setOrgAvatarFaces: orgAvatarFaces => set({ orgAvatarFaces }),

  setOrgSeen: (orgId, at) => set(state => ({ orgSeen: { ...state.orgSeen, [orgId]: at } })),

  setOrgSeenAll: orgSeen => set({ orgSeen }),

  setOrgOpsSeen: (orgId, at) => set(state => ({ orgOpsSeen: { ...state.orgOpsSeen, [orgId]: at } })),

  setOrgOpsSeenAll: orgOpsSeen => set({ orgOpsSeen }),

  // 同一场作战 / 同一次升级只排一张
  pushOrgCelebration: c => set(state => {
    const dup = state.orgCelebrations.some(x => (x.kind === 'op' && c.kind === 'op' && x.opId === c.opId)
      || (x.kind === 'level' && c.kind === 'level' && x.orgId === c.orgId && x.level === c.level));
    return dup ? {} : { orgCelebrations: [...state.orgCelebrations, c] };
  }),

  shiftOrgCelebration: () => set(state => ({ orgCelebrations: state.orgCelebrations.slice(1) })),

  markNotificationRead: id => set(state => {
    const notifications = state.notifications.map(n =>
      n.id === id ? { ...n, read: true } : n,
    );
    return {
      notifications,
      unreadCount: computeUnread(notifications),
      importantUnreadCount: computeImportantUnread(notifications),
    };
  }),

  addNotification: n => set(state => {
    if (state.notifications.some(x => x.id === n.id)) return state;
    const notifications = [n, ...state.notifications];
    return {
      notifications,
      unreadCount: computeUnread(notifications),
      importantUnreadCount: computeImportantUnread(notifications),
    };
  }),

  removeNotification: id => set(state => {
    const notifications = state.notifications.filter(n => n.id !== id);
    return {
      notifications,
      unreadCount: computeUnread(notifications),
      importantUnreadCount: computeImportantUnread(notifications),
    };
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
    importantUnreadCount: 0,
    todayPrayers: [],
    coopBonds: [],
    coopShadows: [],
    pacts: [],
    pactsLoaded: false,
    orgs: [],
    orgsLoaded: false,
    orgNotice: null,
    hideoutOrgId: null,
    hideoutSection: null,
    orgBlocked: [],
    orgHiddenPosts: [],
    orgAvatarFaces: [],
    orgSeen: {},
    orgOpsSeen: {},
    orgCelebrations: [],
    materializeBlockers: [],
    loading: false,
    lastLoadedAt: null,
    lastError: null,
  }),
}));
