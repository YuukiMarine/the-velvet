import PocketBase, { ClientResponseError, type AuthRecord, type SendOptions } from 'pocketbase';

const normalizeEndpoint = (url: string | undefined): string => (url ?? '').trim().replace(/\/+$/, '');

/**
 * 云同步后端地址。未配置时云同步功能完全禁用，前端以纯本地模式运行。
 * 在 .env.local 设置 VITE_PB_URL=https://your-pocketbase.example.com 启用
 */
const PB_URL = normalizeEndpoint(import.meta.env.VITE_PB_URL as string | undefined);

/**
 * 备用线路（可选）。同一个后端换一条路进来：主地址在部分地区 / 运营商的线路上会被
 * 直接重置，请求根本到不了服务器，SDK 只回一句「Something went wrong.」，换邮箱、换密码登录都一样。
 * 当前线路连不上时自动探测这里的地址并切过去，见下方 failover。
 * 逗号或空白分隔，可填多个，按顺序试；和 VITE_PB_URL 一样只写在 .env.local。
 */
const PB_FALLBACK_URLS = String(import.meta.env.VITE_PB_FALLBACK_URLS ?? '')
  .split(/[\s,]+/)
  .map(normalizeEndpoint)
  .filter((u) => /^https?:\/\//.test(u) && u !== PB_URL);

/** 主地址在前，备用按配置顺序；没配主地址就整个为空（云同步关闭） */
const PB_ENDPOINTS = PB_URL ? [PB_URL, ...new Set(PB_FALLBACK_URLS)] : [];

/** 是否启用了云同步（配置了后端地址） */
export const cloudEnabled = Boolean(PB_URL);

/** 切到备用线路后记在这里，下次启动直接走它（主地址照常不记） */
const ROUTE_KEY = 'velvet.pbRoute.v1';
/** 备用线路用了这么久之后，下次启动先在后台探一下主地址，通了就切回去（线路问题多半是暂时的） */
const ROUTE_RECHECK_MS = 12 * 60 * 60 * 1000;
/** 所有线路都探不通后，这段时间内不再重探（断网时免得每个请求都去探一轮） */
const PROBE_COOLDOWN_MS = 20 * 1000;
const PROBE_TIMEOUT_MS = 4000;

interface SavedRoute {
  url: string;
  at: number;
}

const readRoute = (): SavedRoute | null => {
  try {
    const r = JSON.parse(localStorage.getItem(ROUTE_KEY) || 'null') as Partial<SavedRoute> | null;
    return r && typeof r.url === 'string' && typeof r.at === 'number' ? { url: r.url, at: r.at } : null;
  } catch {
    return null;
  }
};

const writeRoute = (url: string): void => {
  try {
    if (url === PB_URL) localStorage.removeItem(ROUTE_KEY);
    else localStorage.setItem(ROUTE_KEY, JSON.stringify({ url, at: Date.now() }));
  } catch { /* 无痕模式等：只是下次启动不记得线路 */ }
};

const savedRoute = readRoute();
const initialEndpoint = savedRoute && PB_ENDPOINTS.includes(savedRoute.url) ? savedRoute.url : PB_URL;

/**
 * PocketBase 客户端单例。
 * SDK 会自动把 auth token 持久化到 localStorage（key: "pocketbase_auth"）
 * 刷新页面后会自动恢复登录态。切线路只改 baseURL：同一个后端，token 照样有效。
 */
export const pb = cloudEnabled ? new PocketBase(initialEndpoint) : null;

/** 探一条线路：/api/health 回 PocketBase 的 JSON 才算通——公共 Wi‑Fi 的认证页也会回 200 的 HTML */
const probeEndpoint = async (base: string): Promise<boolean> => {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/health`, { cache: 'no-store', signal: ctrl?.signal });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { code?: unknown } | null;
    return data?.code === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const switchEndpoint = (url: string, why: string): void => {
  if (!pb || pb.baseURL === url) return;
  pb.baseURL = url;
  writeRoute(url);
  console.info(`[velvet-pb] 切到${url === PB_URL ? '主地址' : `备用线路 ${PB_ENDPOINTS.indexOf(url)}`}（${why}）`);
};

let failoverRun: Promise<boolean> | null = null;
let allDownAt = 0;

/**
 * 当前线路连不上 → 按顺序探其余线路（主地址优先），找到通的就切过去。
 * 并发的失败请求共用同一轮探测；全都不通就冷却一会儿，断网时也不探。
 */
const failover = (failedBase: string): Promise<boolean> => {
  if (!pb) return Promise.resolve(false);
  if (pb.baseURL !== failedBase) return Promise.resolve(true); // 别的请求已经切过了
  if (failoverRun) return failoverRun;
  if (Date.now() - allDownAt < PROBE_COOLDOWN_MS) return Promise.resolve(false);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(false);
  const run = (async () => {
    for (const url of PB_ENDPOINTS) {
      if (url === failedBase) continue;
      if (await probeEndpoint(url)) {
        switchEndpoint(url, '当前线路连不上');
        return true;
      }
    }
    allDownAt = Date.now();
    return false;
  })();
  failoverRun = run;
  void run.finally(() => { if (failoverRun === run) failoverRun = null; });
  return run;
};

/** 请求根本没到服务器（连接被重置 / 断网 / 域名解析失败），不含主动取消 */
const isUnreachable = (err: unknown): err is ClientResponseError =>
  err instanceof ClientResponseError && err.status === 0 && !err.isAbort;

/** SDK 与服务端在没有具体原因时的英文兜底文案。有具体消息的（字段校验等）不动 */
const GENERIC_MESSAGES = ['Something went wrong.', 'Something went wrong while processing your request.'];

/** 兜底英文 → 能看懂、能照着做的话（登录框等处直接显示 err.message） */
const localize = (err: unknown): unknown => {
  if (err instanceof ClientResponseError && !err.isAbort && GENERIC_MESSAGES.includes(err.message)) {
    err.message = err.status === 0
      ? '连不上服务器：请检查网络，或在系统设置里确认本 App 允许联网，稍后再试'
      : err.status >= 500
        ? `服务器暂时出错（${err.status}），请稍后再试`
        : `服务器处理出错（${err.status}），请稍后再试`;
  }
  return err;
};

if (pb) {
  const client = pb;
  const rawSend = client.send.bind(client);
  // SDK 的每个请求（含实时订阅的提交）都走 client.send，在这里统一接住。
  // 连不上且切线路成功：GET 自动重发一次；写操作不重发——请求可能其实已经到了服务器，
  // 重发会重复建记录，交给用户再点一次（这时已经走新线路了）。
  client.send = (async (path: string, options: SendOptions) => {
    const base = client.baseURL;
    try {
      return await rawSend(path, options);
    } catch (err) {
      if (PB_ENDPOINTS.length < 2 || !isUnreachable(err) || !(await failover(base))) throw localize(err);
      const method = String(options?.method ?? 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        err.message = '网络线路已切换，请再试一次';
        throw err;
      }
      try {
        return await rawSend(path, options);
      } catch (retryErr) {
        throw localize(retryErr);
      }
    }
  }) as typeof client.send;

  // 上次切到了备用线路、而且用了一阵：后台探一下主地址，通了切回去；不通就继续用备用，过一阵再探
  if (savedRoute && initialEndpoint !== PB_URL && Date.now() - savedRoute.at > ROUTE_RECHECK_MS) {
    setTimeout(() => {
      void probeEndpoint(PB_URL).then((ok) => {
        if (ok) switchEndpoint(PB_URL, '主地址已恢复');
        else writeRoute(client.baseURL);
      });
    }, 3000);
  }
}

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
