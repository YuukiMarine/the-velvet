/**
 * aiNet — AI 调用的「网络层失败」判定与退避等待（第 12 轮，召唤 0/5 实锤）。
 *
 * 用户上报「整份与分属性两条路都没成（0/5）…最后一次的原因：Failed to fetch」。复盘：整份跑了
 * 几分钟后模型答非所问，分属性五路齐发时网络正好不通（等太久切了后台 / 换网 / 休眠），每路三次
 * fetch 在同一秒内全撞光。本机实测 DeepSeek 的错误响应（401）带 CORS 头，所以 Failed to fetch
 * 不是被 CORS 遮住的 HTTP 错，是真没连上——这类失败值得等一等再试，而不是立刻连撞。
 */

/**
 * fetch 根本没连上 / 连接中途断开：浏览器抛的是 TypeError（Chrome「Failed to fetch」「network error」，
 * Safari「Load failed」「The network connection was lost」）。我们自己 new 的 HTTP 错 / 超时都是普通
 * Error，调用方取消是 AbortError——都不算。JS 运行时错误也是 TypeError，按措辞排除掉。
 */
export function isNetworkError(e: unknown): boolean {
  if (!e || (e instanceof Error && e.name === 'AbortError')) return false;
  const m = e instanceof Error ? e.message : String(e);
  if (/Failed to fetch|Load failed|NetworkError|network error|network connection was lost|net::ERR_|Could not connect|ECONNRESET|ECONNREFUSED|socket hang up/i.test(m)) return true;
  return e instanceof TypeError && !/Cannot read|is not a function|is not defined|is not iterable|undefined|null|Invalid/i.test(m);
}

const BACKOFF_MS = [1500, 3000, 6000];
/** 网络类失败最多再试这么多次（第 i 次前先等 BACKOFF_MS[i]） */
export const NET_RETRY_MAX = BACKOFF_MS.length;

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(done, ms);
  function done() { signal?.removeEventListener('abort', done); clearTimeout(t); resolve(); }
  signal?.addEventListener('abort', done, { once: true });
});

/** 等某个条件成立（靠事件唤醒），最多 maxMs；取消 / 到点都正常返回，成不成由下一次请求说话 */
function waitFor(target: EventTarget, event: string, ok: () => boolean, maxMs: number, signal?: AbortSignal): Promise<void> {
  if (ok()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(done, maxMs);
    function check() { if (ok()) done(); }
    function done() { clearTimeout(t); target.removeEventListener(event, check); signal?.removeEventListener('abort', done); resolve(); }
    target.addEventListener(event, check);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * 第 attempt 次网络重试前的等待（attempt 从 0 起）：先退避 1.5s → 3s → 6s，再看两件事——
 *   · navigator.onLine 为假 → 等 online 事件（上限 30s）；
 *   · 页面在后台（安卓切出去时 WebView 的连接会被掐，这时发了也是白发）→ 等回到前台（上限 5 分钟）。
 * 都只是「等到更可能成功的时刻」，到点照样放行。
 */
export async function waitBeforeNetRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  await sleep(BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)], signal);
  if (signal?.aborted) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await waitFor(window, 'online', () => navigator.onLine !== false, 30_000, signal);
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    await waitFor(document, 'visibilitychange', () => document.visibilityState !== 'hidden', 300_000, signal);
  }
}
