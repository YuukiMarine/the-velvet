/**
 * NotificationSettings — F2a 本地通知设置面板（嵌入 Settings「通知提醒」节）。
 *
 * 总开关（开→请求系统权限）、每日时段编辑（时间 / 名称 / 启用 / 内容 chips / 增删）、
 * 测试通知、以及非 Android 平台的降级提示。所有写入走 updateSettings →
 * store.syncNotifications() 自动重排（见 utils/notifications.ts 的「快照 + 前台重排」策略）。
 */
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, DEFAULT_NOTIF_SLOTS } from '@/store';
import { Toggle } from '@/components/Toggle';
import type { NotifContentType, NotifSlot } from '@/types';
import {
  notifPlatformSupported,
  getNotifPermission,
  requestNotifPermission,
  sendTestNotification,
  type NotifPermission,
} from '@/utils/notifications';

const CONTENT_META: { id: NotifContentType; icon: string; label: string; hint: string }[] = [
  { id: 'tarot', icon: '🔮', label: '今日塔罗', hint: '今天还没抽塔罗时提醒' },
  { id: 'todos', icon: '✅', label: '今日待办', hint: '仍有未完成的每日待办时提醒' },
  { id: 'countercurrent', icon: '🌊', label: '逆流预警', hint: '有属性明日将逆流扣减时提醒' },
  { id: 'summary', icon: '✨', label: '成长总结', hint: '有未读的成长总结时提醒' },
  { id: 'record', icon: '📝', label: '提醒记录', hint: '今天还没有任何记录时提醒' },
];

export default function NotificationSettings() {
  const { settings, updateSettings } = useAppStore();
  const supported = notifPlatformSupported();
  const enabled = !!settings.notificationsEnabled;
  const slots = settings.notificationSlots ?? [];

  const [perm, setPerm] = useState<NotifPermission>('prompt');
  const [testSent, setTestSent] = useState(false);

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
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  return (
    <div className="space-y-5">
      {/* 子板块标题 */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700/80">
        <span className="text-base">🔔</span>
        <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">本地提醒</h4>
      </div>

      {/* 平台降级提示 */}
      {!supported && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 px-4 py-3 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          本地通知目前仅在 <b>Android 客户端</b> 送达（iOS 待原生化）。你仍可在此预先配置时段与内容，装上 Android 客户端后即生效。
        </div>
      )}

      {/* 总开关卡 */}
      <div className={`rounded-xl border-2 p-4 transition-all ${
        enabled ? 'border-primary/40 bg-primary/5' : 'border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base">🔔</span>
              <h4 className="text-sm font-bold text-gray-800 dark:text-white">每日提醒</h4>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              在你选的时段提醒抽塔罗、未竟待办、逆流预警等。内容在端上生成，不经服务器。
            </p>
          </div>
          <div className="flex-shrink-0 mt-0.5">
            <Toggle checked={enabled} onChange={handleMasterToggle} aria-label="每日提醒总开关" />
          </div>
        </div>

        {/* 权限未授予提示 */}
        {supported && enabled && perm !== 'granted' && (
          <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-2">
            <span>通知权限未授予，提醒不会送达。</span>
            <button
              onClick={async () => setPerm(await requestNotifPermission())}
              className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 font-semibold whitespace-nowrap"
            >
              去授权
            </button>
          </div>
        )}
      </div>

      {/* 时段列表（仅启用时展开） */}
      {enabled && (
        <div className="space-y-3">
          {slots.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">还没有提醒时段，点下方添加一个。</p>
          )}

          {slots.map(slot => (
            <div key={slot.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/30 overflow-hidden">
              {/* 头：启用 + 时间 + 名称 + 删除 */}
              <div className="px-3 py-3 border-b border-gray-100 dark:border-gray-800/60 flex items-center gap-2">
                <Toggle checked={slot.enabled} onChange={v => updateSlot(slot.id, { enabled: v })} aria-label={`启用「${slot.label}」`} />
                <input
                  type="time"
                  value={slot.time}
                  onChange={e => updateSlot(slot.id, { time: e.target.value })}
                  aria-label={`「${slot.label}」时间`}
                  className="text-sm font-bold bg-transparent text-gray-800 dark:text-white tabular-nums border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1"
                />
                <input
                  type="text"
                  value={slot.label}
                  onChange={e => updateSlot(slot.id, { label: e.target.value })}
                  maxLength={12}
                  placeholder="名称"
                  aria-label="时段名称"
                  className="flex-1 min-w-0 text-sm bg-transparent text-gray-700 dark:text-gray-200 border-b border-transparent focus:border-gray-300 dark:focus:border-gray-600 outline-none px-1"
                />
                <button
                  onClick={() => removeSlot(slot.id)}
                  aria-label="删除时段"
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-lg flex-shrink-0"
                >
                  ×
                </button>
              </div>
              {/* 内容 chips */}
              <div className="p-3 flex flex-wrap gap-2">
                {CONTENT_META.map(c => {
                  const on = slot.contents.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleContent(slot, c.id)}
                      title={c.hint}
                      aria-pressed={on}
                      className={`text-xs px-2.5 py-1.5 rounded-full font-medium border transition-colors ${
                        on
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                      }`}
                    >
                      {c.icon} {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            onClick={addSlot}
            className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-primary/50 hover:text-primary transition-colors"
          >
            ＋ 添加提醒时段
          </button>

          {/* 测试通知（原生 + 已授权） */}
          {supported && perm === 'granted' && (
            <button
              onClick={handleTest}
              className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {testSent ? '✓ 已发送，请查看通知栏' : '发送一条测试通知'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
