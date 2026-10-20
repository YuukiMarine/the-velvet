/**
 * 本地提醒设置的状态与动作（第 30 批 b 从 NotificationSettings 抽出来）：
 * 旧版竖排设置页（components/NotificationSettings）和新版宫格设置页（pages/settings/sections/NotificationsSection）共用。
 * 所有写入走 updateSettings → store.syncNotifications() 自动重排（见 utils/notifications.ts 的「快照 + 前台重排」策略）。
 */
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, DEFAULT_NOTIF_SLOTS } from '@/store';
import type { NotifContentType, NotifSlot } from '@/types';
import {
  notifPlatformSupported,
  getNotifPermission,
  requestNotifPermission,
  sendTestNotification,
  type NotifPermission,
} from '@/utils/notifications';

export const CONTENT_META: { id: NotifContentType; icon: string; label: string; hint: string }[] = [
  { id: 'tarot', icon: '🔮', label: '今日塔罗', hint: '今天还没抽塔罗时提醒' },
  { id: 'todos', icon: '✅', label: '今日待办', hint: '仍有未完成的每日待办时提醒' },
  { id: 'countercurrent', icon: '🌊', label: '逆流预警', hint: '有属性明日将逆流扣减时提醒' },
  { id: 'summary', icon: '✨', label: '成长总结', hint: '新的周报 / 月报写好时提醒一次' },
  { id: 'record', icon: '📝', label: '提醒记录', hint: '今天还没有任何记录时提醒' },
  { id: 'together', icon: '🤝', label: '一起进步', hint: '约好的事今天还没完成时提醒；好友催你、发来邀请也会尽快告诉你' },
  { id: 'quests', icon: '📜', label: '委托板', hint: '每周一委托刷新时提醒一次（委托板解锁后才会有）' },
  { id: 'meeting', icon: '🗓️', label: '据点会议', hint: '周日提醒给这周打分、写下周目标（加入组织后才会有；默认不开）' },
];

export function useNotificationSettings() {
  const { settings, updateSettings } = useAppStore(useShallow(s => ({ settings: s.settings, updateSettings: s.updateSettings })));
  const supported = notifPlatformSupported();
  const enabled = !!settings.notificationsEnabled;
  const slots = settings.notificationSlots ?? [];

  const [perm, setPerm] = useState<NotifPermission>('prompt');
  const [testSent, setTestSent] = useState(false);
  const testTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(testTimer.current), []);

  useEffect(() => {
    if (!supported) return;
    getNotifPermission().then(setPerm).catch(() => {});
  }, [supported, enabled]);

  const setSlots = (next: NotifSlot[]) => updateSettings({ notificationSlots: next });
  const updateSlot = (id: string, patch: Partial<NotifSlot>) =>
    setSlots(slots.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const handleMasterToggle = async (on: boolean) => {
    if (!on) {
      updateSettings({ notificationsEnabled: false });
      return;
    }
    if (supported) {
      const p = await requestNotifPermission();
      setPerm(p);
      if (p !== 'granted') {
        updateSettings({ notificationsEnabled: false }); // 未授权则不开启
        return;
      }
    }
    // 首次开启且尚无时段配置（现有用户的 settings 行没有该字段）→ 播种默认两槽。
    // 区分 undefined（从未设置）与 []（用户主动清空，不重播）。
    updateSettings(
      settings.notificationSlots === undefined
        ? { notificationsEnabled: true, notificationSlots: DEFAULT_NOTIF_SLOTS }
        : { notificationsEnabled: true },
    );
  };

  const toggleContent = (slot: NotifSlot, c: NotifContentType) => {
    const contents = slot.contents.includes(c)
      ? slot.contents.filter(x => x !== c)
      : [...slot.contents, c];
    updateSlot(slot.id, { contents });
  };

  const addSlot = () =>
    setSlots([...slots, { id: uuidv4(), time: '12:00', enabled: true, label: '新的提醒', contents: ['tarot'] }]);

  const removeSlot = (id: string) => setSlots(slots.filter(s => s.id !== id));

  const handleTest = async () => {
    const ok = await sendTestNotification();
    if (ok) {
      setTestSent(true);
      window.clearTimeout(testTimer.current);
      testTimer.current = window.setTimeout(() => setTestSent(false), 3000);
    }
  };

  const requestPermission = async () => setPerm(await requestNotifPermission());

  return { settings, updateSettings, supported, enabled, slots, perm, testSent, handleMasterToggle, updateSlot, toggleContent, addSlot, removeSlot, handleTest, requestPermission };
}
