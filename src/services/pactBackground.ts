/**
 * 一起进步 · 后台刷新的网页端（v2.7.0.6，档 2）。
 *
 * App 在后台时由原生代码拉新到的「催一下 / 邀请 / 答应」并发本地通知：
 *   iOS  —— ios/App/App/PactRefreshPlugin.swift（BGAppRefreshTask，系统决定什么时候跑）
 *   安卓 —— android/.../PactRefresh*.java（JobScheduler，最短 15 分钟一次，要联网）
 * 原生那边拿不到 PocketBase SDK 的登录态，所以每次社交同步后把「服务器地址 / 登录凭据 /
 * 我已经看到哪一条了 / 提醒开没开」推过去；登出时清空。
 * 凭据存在原生的键值区（iOS UserDefaults / 安卓 SharedPreferences），和网页 localStorage 一样在 App 沙盒里。
 *
 * 只在原生平台生效；旧安装包里没有这个插件、或调用失败，一律静默——前台的提醒（档 1）不受影响。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { pb, getUserId } from './pocketbase';
import type { NotificationEntry, Settings } from '@/types';

interface PactRefreshPlugin {
  configure(o: { pbUrl: string; token: string; userId: string; since: string; enabled: boolean }): Promise<void>;
  setEnabled(o: { enabled: boolean }): Promise<void>;
  clear(): Promise<void>;
  /** 立刻拉一次（自检用） */
  checkNow(): Promise<{ ok: boolean }>;
}

const PactRefresh = registerPlugin<PactRefreshPlugin>('PactRefresh');

/** PocketBase created 的格式：2026-09-24 04:00:00.123Z（原生那边按字符串比先后） */
const pbStamp = (d: Date) => d.toISOString().replace('T', ' ');

/** 提醒总开关开着，且至少一个启用的时段勾了「一起进步」 */
export const pactPushEnabled = (settings: Settings): boolean =>
  !!settings.notificationsEnabled &&
  (settings.notificationSlots ?? []).some(s => s.enabled && s.contents.includes('together'));

async function call(fn: () => Promise<unknown>): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await fn();
    return true;
  } catch (err) {
    console.warn('[velvet-pact] background refresh bridge failed', err);
    return false;
  }
}

/** 上次推过去的开关状态（只在变化时单独推，免得每次重排提醒都过一趟桥） */
let lastEnabled: boolean | null = null;

/**
 * 社交同步后调用。since = App 这次拉到的最新一条通知：这些已经在 App 里看过了，后台不再重复弹。
 */
export async function configurePactRunner(notifications: NotificationEntry[], enabled: boolean): Promise<void> {
  const me = getUserId();
  const token = pb?.authStore.token;
  if (!pb || !me || !token) return;
  const newest = notifications.reduce<Date | null>((m, n) => (!m || n.createdAt > m ? n.createdAt : m), null);
  const ok = await call(() => PactRefresh.configure({
    pbUrl: pb!.baseURL,
    token,
    userId: me,
    since: pbStamp(newest ?? new Date()),
    enabled,
  }));
  if (ok) lastEnabled = enabled;
}

/** 提醒设置变了（重排提醒时调用）：只改开关，别的不动 */
export async function setPactRunnerEnabled(enabled: boolean): Promise<void> {
  if (lastEnabled === null || lastEnabled === enabled) return;
  if (await call(() => PactRefresh.setEnabled({ enabled }))) lastEnabled = enabled;
}

/** 登出 / 注销：清掉原生那边的凭据，停掉后台任务 */
export async function clearPactRunner(): Promise<void> {
  if (await call(() => PactRefresh.clear())) lastEnabled = null;
}
