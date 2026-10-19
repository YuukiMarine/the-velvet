/**
 * nativeCalendar — 「加到日历 / 加到闹钟」的网页侧（第 29 批 · PRD §24.19 A）。
 *
 * 用户口径：任务提醒不走 App 自己的通知，走手机的日历 / 闹钟。原生 SystemCalendar 插件：
 *   · addEvent：安卓拉起系统日历的「新建日程」页（ACTION_INSERT，预填标题 / 备注 / 起止，不要权限，用户点保存）；
 *     iOS 弹系统日程编辑页（EKEventEditViewController，iOS 17+ 不需要日历权限）。
 *   · addAlarm：安卓拉起系统时钟建闹钟（ACTION_SET_ALARM，用户点确认）；iOS 这批不做（AlarmKit 以后看）。
 *   · capabilities：网页按它显示按钮（网页版 / 旧包都没有）。
 * 不做同步：删任务 / 改时间不会去动日历里那条。
 * 设置「保存带截止日的任务后自动加到日历」（todoAutoCalendar，缺省关）：任务页保存 / 助手卡确认后自动拉起一次。
 */
import { create } from 'zustand';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useAppStore } from '@/store';

export interface CalendarCapabilities { calendar: boolean; alarm: boolean }

export interface CalendarEvent {
  title: string;
  notes?: string;
  /** epoch ms（本地时区） */
  startAt: number;
  endAt?: number;
  allDay: boolean;
}

interface SystemCalendarPlugin {
  capabilities(): Promise<CalendarCapabilities>;
  addEvent(e: CalendarEvent): Promise<{ opened?: boolean; saved?: boolean; eventId?: string }>;
  addAlarm(o: { hour: number; minute: number; message: string }): Promise<{ supported: boolean }>;
}

let plugin: SystemCalendarPlugin = registerPlugin<SystemCalendarPlugin>('SystemCalendar');
let forceNative = false;
const nativeOk = () => forceNative || Capacitor.isNativePlatform();

const NONE: CalendarCapabilities = { calendar: false, alarm: false };
export const useCalendarCaps = create<{ caps: CalendarCapabilities; ready: boolean }>(() => ({ caps: NONE, ready: false }));

/** App 启动时问一次原生「能不能」；网页版 / 旧包 → 都不能 */
export async function initNativeCalendar(): Promise<CalendarCapabilities> {
  if (!nativeOk()) { useCalendarCaps.setState({ caps: NONE, ready: true }); return NONE; }
  try {
    const caps = await plugin.capabilities();
    const safe = { calendar: !!caps?.calendar, alarm: !!caps?.alarm };
    useCalendarCaps.setState({ caps: safe, ready: true });
    return safe;
  } catch {
    useCalendarCaps.setState({ caps: NONE, ready: true });
    return NONE;
  }
}

/** 组件用：当前能不能加日历 / 闹钟 */
export const useCalendarCapabilities = (): CalendarCapabilities => useCalendarCaps((s) => s.caps);

export interface TodoLike { title: string; deadline?: string; deadlineTime?: string }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 任务 → 日历事件：有时刻 = 那一刻起 1 小时；没时刻 = 全天。备注写来处，提醒提前量交给系统日历自己定。
 * 全天的 endAt 给「次日 0 点」（安卓日历模型里结束是排他的，正好一天）；iOS 侧 EventKit 结束含当天，插件自己减一秒。
 * 没有截止日返回 null。
 */
export function todoCalendarEvent(t: TodoLike): CalendarEvent | null {
  if (!t.deadline || !DAY_RE.test(t.deadline)) return null;
  const [y, m, d] = t.deadline.split('-').map(Number);
  const title = t.title.trim();
  if (!title) return null;
  if (t.deadlineTime && TIME_RE.test(t.deadlineTime)) {
    const [hh, mm] = t.deadlineTime.split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
    return { title, notes: '来自「靛蓝色房间」的任务截止时刻。', startAt: start, endAt: start + 60 * 60 * 1000, allDay: false };
  }
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  return { title, notes: '来自「靛蓝色房间」的任务截止日。', startAt: start, endAt: start + 24 * 60 * 60 * 1000, allDay: true };
}

/** 拉起系统日历的新建页；返回 false = 这里做不了（网页 / 没截止日 / 插件不在） */
export async function addTodoToCalendar(t: TodoLike): Promise<boolean> {
  const ev = todoCalendarEvent(t);
  if (!ev || !nativeOk() || !useCalendarCaps.getState().caps.calendar) return false;
  try {
    await plugin.addEvent(ev);
    return true;
  } catch (e) {
    console.warn('[nativeCalendar] addEvent 失败', e);
    return false;
  }
}

/** 拉起系统时钟建闹钟（只有带时刻的任务；iOS 不支持） */
export async function addTodoAlarm(t: TodoLike): Promise<boolean> {
  if (!t.deadlineTime || !TIME_RE.test(t.deadlineTime) || !nativeOk() || !useCalendarCaps.getState().caps.alarm) return false;
  const [hour, minute] = t.deadlineTime.split(':').map(Number);
  try {
    const r = await plugin.addAlarm({ hour, minute, message: t.title.trim() });
    return !!r?.supported;
  } catch (e) {
    console.warn('[nativeCalendar] addAlarm 失败', e);
    return false;
  }
}

/**
 * 设置开着时，保存 / 确认带截止日的任务后自动拉起一次日历（只在截止日或时刻是新的 / 变了的时候）。
 * 返回是否拉起了。
 */
export async function maybeAutoCalendar(t: TodoLike, prev?: TodoLike | null): Promise<boolean> {
  if (!useAppStore.getState().settings.todoAutoCalendar) return false;
  if (!t.deadline) return false;
  if (prev && prev.deadline === t.deadline && (prev.deadlineTime ?? '') === (t.deadlineTime ?? '')) return false;
  return addTodoToCalendar(t);
}

/** 测试：换成假插件、当作原生 */
export function _installForTest(fake: SystemCalendarPlugin | null, native = true): void {
  plugin = fake ?? registerPlugin<SystemCalendarPlugin>('SystemCalendar');
  forceNative = native && !!fake;
  useCalendarCaps.setState({ caps: NONE, ready: false });
}
