/**
 * appUpdate — 在线版本核验（第 12 轮）。
 *
 * 数据源（都是公开 GET、带 CORS、不用自己的服务器）：
 *   ① jsDelivr 的 GitHub 包数据接口：列出仓库全部 tag（CDN，国内可达，缓存 5 分钟）→ 取最大的语义版本；
 *   ② 取不到再问 GitHub Releases（最准，但 api.github.com 在国内时好时坏）。
 * 发版即打 tag（V2.8.0 → v2.8.0），所以「最大 tag > 当前版本」= 有新版本。
 * 每 24 小时最多查一次，结果存本地；离线 / 失败静默，不打扰。有新版本时「关于」入口亮红点，
 * 关于面板里版本号变强调色并写「有新版本 vX.Y.Z」，点了去 B 站动态（UPDATE_LINK）。
 */
import { useSyncExternalStore } from 'react';

export const CURRENT_VERSION = String(import.meta.env.PACKAGE_VERSION ?? '0.0.0');
export const UPDATE_LINK = 'https://space.bilibili.com/15727079/dynamic';

const STORE_KEY = 'velvet.updateCheck.v1';
const CHECK_INTERVAL_MS = 24 * 3600_000;
const FETCH_TIMEOUT_MS = 8_000;

type Picker = (json: unknown) => string[];
const SOURCES: Array<{ url: string; pick: Picker }> = [
  {
    url: 'https://data.jsdelivr.com/v1/package/gh/YuukiMarine/the-velvet',
    pick: (j) => { const v = (j as { versions?: unknown })?.versions; return Array.isArray(v) ? v.map(String) : []; },
  },
  {
    url: 'https://api.github.com/repos/YuukiMarine/the-velvet/releases/latest',
    pick: (j) => { const t = (j as { tag_name?: unknown })?.tag_name; return typeof t === 'string' ? [t] : []; },
  },
];

/** "v2.8.0" / "V2.8" / "2.8.0.1" → [2,8,0]；带后缀（-beta）或不像版本号的 → null */
export function parseVersion(v: string): number[] | null {
  const m = /^v?(\d+(?:\.\d+){0,3})$/i.exec(v.trim());
  if (!m) return null;
  const parts = m[1].split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 4);
}

/** 语义版本比较：a > b → 1，相等 0，a < b → -1；任一不是版本号按 0 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

interface UpdateRecord {
  /** 线上最大版本（已去掉 v 前缀）；null = 还没查到过 */
  latest: string | null;
  checkedAt: number;
}

const read = (): UpdateRecord => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const r = JSON.parse(raw) as Partial<UpdateRecord>;
      if (typeof r.checkedAt === 'number') return { latest: typeof r.latest === 'string' ? r.latest : null, checkedAt: r.checkedAt };
    }
  } catch { /* 读不到就当没查过 */ }
  return { latest: null, checkedAt: 0 };
};

let record: UpdateRecord = read();
const listeners = new Set<() => void>();
const publish = (next: UpdateRecord) => {
  record = next;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* 存不了就只活在内存里 */ }
  for (const l of listeners) l();
};

export const latestVersion = (): string | null => record.latest;
/** 线上有比当前更新的版本 */
export const hasUpdate = (): boolean => !!record.latest && compareVersions(record.latest, CURRENT_VERSION) > 0;

async function fetchJson(url: string): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

let inflight: Promise<void> | null = null;

/**
 * 查一次线上版本。24 小时内查过就不再查（force 跳过这条）；离线直接跳过；
 * 两个数据源依次试，拿到任意一个能解析的版本号就记下来。
 */
export function checkForUpdate(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - record.checkedAt < CHECK_INTERVAL_MS) return Promise.resolve();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
  inflight = (async () => {
    for (const src of SOURCES) {
      try {
        const tags = src.pick(await fetchJson(src.url)).filter((t) => parseVersion(t));
        if (!tags.length) continue;
        const best = tags.reduce((a, b) => (compareVersions(b, a) > 0 ? b : a));
        publish({ latest: best.replace(/^v/i, ''), checkedAt: Date.now() });
        return;
      } catch { /* 这一源不通，换下一个 */ }
    }
    // 都没拿到：也记一下时间，24 小时内别反复撞；上次查到的 latest 保留
    publish({ latest: record.latest, checkedAt: Date.now() });
  })().finally(() => { inflight = null; });
  return inflight;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => record;

/** 界面用：当前版本 / 线上最新 / 是否有更新；随 checkForUpdate 的结果刷新 */
export function useAppUpdate(): { current: string; latest: string | null; hasUpdate: boolean } {
  const r = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { current: CURRENT_VERSION, latest: r.latest, hasUpdate: !!r.latest && compareVersions(r.latest, CURRENT_VERSION) > 0 };
}

/** 测试 / 调试：直接灌一个结果 */
export const _setUpdateRecord = (latest: string | null, checkedAt = Date.now()) => publish({ latest, checkedAt });
