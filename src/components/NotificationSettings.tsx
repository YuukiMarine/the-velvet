/**
 * NotificationSettings — F2a 本地通知设置面板（嵌入 Settings「通知提醒」节）。
 *
 * 总开关（开→请求系统权限）、每日时段编辑（时间 / 名称 / 启用 / 内容 chips / 增删）、
 * 测试通知、以及非 Android 平台的降级提示。所有写入走 updateSettings →
 * store.syncNotifications() 自动重排（见 utils/notifications.ts 的「快照 + 前台重排」策略）。
 */
import { BellIcon } from '@/components/settingsIcons';
import { Toggle } from '@/components/Toggle';
import { useCalendarCapabilities } from '@/utils/nativeCalendar';
import { CONTENT_META, useNotificationSettings } from '@/components/useNotificationSettings';

export default function NotificationSettings() {
  // 状态与动作在 useNotificationSettings（第 30 批 b：新版设置页共用）
  const { settings, updateSettings, supported, enabled, slots, perm, testSent, handleMasterToggle, updateSlot, toggleContent, addSlot, removeSlot, handleTest, requestPermission } = useNotificationSettings();
  // 加到日历（第 29 批）：原生且插件在才有这一块
  const calendarCaps = useCalendarCapabilities();

  return (
    <div className="space-y-5">
      {/* 子板块标题 */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700/80">
        <span aria-hidden className="text-gray-500 dark:text-gray-300"><BellIcon className="h-[18px] w-[18px]" /></span>
        <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">本地提醒</h4>
      </div>

      {/* 平台降级提示 */}
      {!supported && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 px-4 py-3 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          本地通知在 <b>Android / iOS 客户端</b> 送达（网页版没有这个能力）。你仍可在此预先配置时段与内容，装上客户端后即生效。
        </div>
      )}

      {/* 加到日历（第 29 批）：任务提醒不走 App 自己的通知，走手机日历；这里只有一个「自动」开关 */}
      {calendarCaps.calendar && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700" data-testid="auto-calendar">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className="text-sm font-bold text-gray-800 dark:text-white">保存带截止日的任务后自动加到日历</h4>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                任务页保存、或助手的任务卡确认之后，直接拉起手机日历的新建日程页（标题、截止日、时刻都填好，你点保存就行）。
                关着的话，任务长按菜单和助手回执旁也有「加到日历」可以手动点。
              </p>
            </div>
            <div className="mt-0.5 flex-shrink-0">
              <Toggle
                checked={!!settings.todoAutoCalendar}
                onChange={v => updateSettings({ todoAutoCalendar: v })}
                aria-label="保存带截止日的任务后自动加到日历"
              />
            </div>
          </div>
        </div>
      )}

      {/* 总开关卡 */}
      <div className={`rounded-xl border-2 p-4 transition-all ${
        enabled ? 'border-primary/40 bg-primary/5' : 'border-gray-200 dark:border-gray-700'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-gray-500 dark:text-gray-300"><BellIcon className="h-[18px] w-[18px]" /></span>
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
              onClick={() => void requestPermission()}
              className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/40 font-semibold whitespace-nowrap"
            >
              去授权
            </button>
          </div>
        )}
      </div>

      {/* 助手口吻（v2.7 notifVoice）：AI 接管提醒文案。开关随总开关一起出现 */}
      {enabled && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className="text-sm font-bold text-gray-800 dark:text-white">让助手来写提醒文案</h4>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                每天用<b>当前人格</b>的口吻生成一套推送文案（走助手档模型，一天一次）。
                没配 AI、离线或生成失败时自动退回内置文案，提醒本身不受影响。
              </p>
            </div>
            <div className="mt-0.5 flex-shrink-0">
              <Toggle
                checked={!!settings.notifAIVoice}
                onChange={v => updateSettings({ notifAIVoice: v })}
                aria-label="让助手来写提醒文案"
              />
            </div>
          </div>
        </div>
      )}

      {/* 助手找你（第二批 C）：默认开，跟着总开关出现 */}
      {enabled && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className="text-sm font-bold text-gray-800 dark:text-white">助手会主动找你</h4>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                每天最多一条：约好的事过后问你一句结果、认识满一个月这样的日子、好几天没见时说一次想念。
                夜里 22:30～08:30 不发；锁屏上只写「{'〈助手的名字〉'}有话想跟你说」，点开再说是什么事。
              </p>
            </div>
            <div className="mt-0.5 flex-shrink-0">
              <Toggle
                checked={settings.navigatorPushEnabled !== false}
                onChange={v => updateSettings({ navigatorPushEnabled: v })}
                aria-label="助手会主动找你"
              />
            </div>
          </div>
        </div>
      )}

      {/* AI 写完了提醒（第 27 批）：默认开，跟着总开关出现 */}
      {enabled && (
        <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className="text-sm font-bold text-gray-800 dark:text-white">AI 写完了提醒你</h4>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                塔罗解读、成长总结、区层显形这些在后台写，你把 App 切到后台时写完 → 提醒一条「写好了」，每个任务只提醒一次。
                人在 App 里时只在顶部横幅里提示，不发通知。
              </p>
            </div>
            <div className="mt-0.5 flex-shrink-0">
              <Toggle
                checked={settings.aiJobDoneNotify !== false}
                onChange={v => updateSettings({ aiJobDoneNotify: v })}
                aria-label="AI 写完了提醒你"
              />
            </div>
          </div>
        </div>
      )}

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
