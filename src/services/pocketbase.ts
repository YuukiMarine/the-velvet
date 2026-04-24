import PocketBase, { type AuthRecord } from 'pocketbase';

/**
 * 云同步后端地址。未配置时云同步功能完全禁用，前端以纯本地模式运行。
 * 在 .env.local 设置 VITE_PB_URL=https://your-pocketbase.example.com 启用
 */
const PB_URL = (import.meta.env.VITE_PB_URL as string | undefined)?.trim() || '';

/** 是否启用了云同步（配置了后端地址） */
export const cloudEnabled = Boolean(PB_URL);

/**
 * PocketBase 客户端单例。
 * SDK 会自动把 auth token 持久化到 localStorage（key: "pocketbase_auth"）
 * 刷新页面后会自动恢复登录态
 */
export const pb = cloudEnabled ? new PocketBase(PB_URL) : null;

/** 当前是否已登录（同步读取，不触发网络） */
export const isAuthenticated = (): boolean => {
  return Boolean(pb?.authStore.isValid);
};

/**
 * 当前登录用户记录（本地缓存，未登录返回 null）
 *
 * SDK 版本差异：v0.21+ 用 `record`，旧版本用 `model`，
 * 这里兼容两种属性名，以免升级 SDK 时出现"登录看起来 OK 但拿不到用户"的问题
 */
export const getAuthRecord = (): AuthRecord | null => {
  if (!pb || !pb.authStore.isValid) return null;
  const store = pb.authStore as unknown as {
    record?: AuthRecord | null;
    model?: AuthRecord | null;
  };
  return store.record ?? store.model ?? null;
};

/** 当前用户 id，未登录返回 null */
export const getUserId = (): string | null => getAuthRecord()?.id ?? null;

/**
 * 订阅登录状态变化（登入 / 登出 / token 刷新）
 * 返回取消订阅函数
 */
export const onAuthChange = (
  callback: (record: AuthRecord | null) => void
): (() => void) => {
  if (!pb) return () => {};
  return pb.authStore.onChange((_token, record) => {
    callback(record ?? null);
  });
};

/**
 * 主动登出 —— 清除本地 token
 * 云端 token 本身无法强制作废（除非 PocketBase 做 token 黑名单，目前未启用）
 */
export const clearAuth = (): void => {
  pb?.authStore.clear();
};
