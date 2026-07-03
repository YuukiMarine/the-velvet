/**
 * navigator store — F6 黑猫的窗口开关 + 当日会话（Batch1：仅内存，不落库）。
 *
 * 会话延续规则（已确认）：同一天内反复开关窗口保留聊天流；跨天首开清流 + 新问候。
 * Batch3 将把会话迁入 Dexie（navigatorSessions / navigatorMessages）+ 长短期记忆 + compact，
 * 本 store 的消息结构刻意与未来表结构对齐（id / role / text / draft / createdAt）。
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { toLocalDateKey } from '@/store';
import type { NavigatorDraft } from '@/utils/navigatorRegistry';

export type NavigatorCardStatus = 'pending' | 'done' | 'cancelled';

export interface NavigatorMessage {
  id: string;
  /** cat=黑猫气泡 / user=用户气泡 / card=待确认动作卡（draft+status） */
  role: 'cat' | 'user' | 'card';
  text?: string;
  draft?: NavigatorDraft;
  cardStatus?: NavigatorCardStatus;
  /** 执行成功后的回执文案（渲染在卡片下方的黑猫签章行） */
  receipt?: string;
  createdAt: number;
}

interface NavigatorState {
  isOpen: boolean;
  /** 会话所属日期（跨天清流判据） */
  dateKey: string;
  messages: NavigatorMessage[];
  open: () => void;
  close: () => void;
  /** 跨天则清空消息并更新 dateKey；返回是否发生了清流 */
  rolloverIfNewDay: () => boolean;
  pushCat: (text: string) => void;
  pushUser: (text: string) => void;
  pushCard: (draft: NavigatorDraft) => string;
  updateCard: (id: string, patch: Partial<Pick<NavigatorMessage, 'draft' | 'cardStatus' | 'receipt'>>) => void;
}

const msg = (partial: Omit<NavigatorMessage, 'id' | 'createdAt'>): NavigatorMessage => ({
  id: uuidv4(),
  createdAt: Date.now(),
  ...partial,
});

export const useNavigatorStore = create<NavigatorState>((set, get) => ({
  isOpen: false,
  dateKey: toLocalDateKey(),
  messages: [],

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),

  rolloverIfNewDay: () => {
    const today = toLocalDateKey();
    if (get().dateKey === today) return false;
    set({ dateKey: today, messages: [] });
    return true;
  },

  pushCat: (text) => set((s) => ({ messages: [...s.messages, msg({ role: 'cat', text })] })),
  pushUser: (text) => set((s) => ({ messages: [...s.messages, msg({ role: 'user', text })] })),
  pushCard: (draft) => {
    const m = msg({ role: 'card', draft, cardStatus: 'pending' });
    set((s) => ({ messages: [...s.messages, m] }));
    return m.id;
  },
  updateCard: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
}));
