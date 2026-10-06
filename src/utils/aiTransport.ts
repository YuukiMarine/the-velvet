/**
 * aiTransport —— AI 请求的发送通道（第 13 轮，千问 token-plan）。
 *
 * 有些服务商网关（千问套餐专属 / token-plan 的 coding.dashscope、token-plan.*.maas.aliyuncs.com）对浏览器的
 * OPTIONS 预检直接回 401、不带任何 CORS 头，WebView 里 fetch 根本发不出去。App 里有另一条路：
 * Capacitor 的 CapacitorHttp 由原生层（URLSession / OkHttp）发请求，不受 CORS 约束——代价是拿不到流式响应，
 * 整段回来再给页面。所以：
 *   · settings.aiNativeHosts 里登记的主机走原生通道（测试连接时自动探测并登记）；
 *   · aiFetch(url, init) 是 fetch 的替身：原生主机用 CapacitorHttp 并包成标准 Response，其余照旧 fetch；
 *   · chatStream 对原生主机退成非流式（见 aiClient）。
 * 网页 / PWA 没有原生层，这类主机只能提示用户换地址或经中转。
 */
import { CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';
import { isNative } from '@/utils/native';

let nativeHosts = new Set<string>();
let forceNativeForTest = false;

/** 从设置同步「走原生通道的主机」清单（aiClient 解析配置时顺手调；Settings 保存后立即生效） */
export function syncNativeHosts(hosts: string[] | undefined | null): void {
  nativeHosts = new Set((hosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean));
}

export const hostOfUrl = (url: string): string => {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
};

/** 这个地址是否该走原生通道：登记过 + 当前是原生壳（网页里没有原生层，登记了也走不了） */
export function isNativeHost(url: string): boolean {
  if (!nativeHosts.has(hostOfUrl(url))) return false;
  return forceNativeForTest || isNative();
}

/** 原生通道可用吗（原生壳里才有） */
export const nativeTransportAvailable = (): boolean => forceNativeForTest || isNative();

type NativeRequest = (opts: HttpOptions) => Promise<HttpResponse>;
let nativeRequest: NativeRequest = (opts) => CapacitorHttp.request(opts);

/** 测试桩：替换原生请求实现 / 在网页里假装自己是原生壳 */
export function _setNativeRequestForTest(fn: NativeRequest | null, pretendNative = false): void {
  nativeRequest = fn ?? ((opts) => CapacitorHttp.request(opts));
  forceNativeForTest = pretendNative;
}

const abortError = (): Error => {
  try { return new DOMException('The operation was aborted.', 'AbortError'); } catch { const e = new Error('The operation was aborted.'); e.name = 'AbortError'; return e; }
};

function normalizeHeaders(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (typeof Headers !== 'undefined' && h instanceof Headers) { h.forEach((v, k) => { out[k] = v; }); return out; }
  if (Array.isArray(h)) { for (const [k, v] of h) out[k] = v; return out; }
  for (const [k, v] of Object.entries(h)) out[k] = String(v);
  return out;
}

/**
 * 用原生层发一次请求并包成标准 Response：调用方的 resp.ok / status / text() / json() / headers.get() 照用。
 * 网络层失败抛 TypeError（与 fetch 同口径，aiNet.isNetworkError 认得）；取消抛 AbortError。
 * 注意：CapacitorHttp 发出去就收不回，signal 只能让调用方不再等它。
 */
export async function nativeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (init.signal?.aborted) throw abortError();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = normalizeHeaders(init.headers);
  const contentType = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  let data: unknown = undefined;
  if (typeof init.body === 'string') {
    // 原生层只认字符串或 JSON 对象：JSON 请求体先解析成对象交给它序列化（安卓对字符串体 + json 头的处理各版本不一）
    if (/application\/json/i.test(contentType)) { try { data = JSON.parse(init.body); } catch { data = init.body; } }
    else data = init.body;
  } else if (init.body != null) {
    throw new TypeError('Load failed (native): 原生通道只支持文本请求体');
  }
  const req = nativeRequest({ url, method, headers, data, responseType: 'text', readTimeout: 180_000, connectTimeout: 30_000 });
  let res: HttpResponse;
  try {
    res = init.signal
      ? await Promise.race([req, new Promise<never>((_, reject) => init.signal!.addEventListener('abort', () => reject(abortError()), { once: true }))])
      : await req;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new TypeError(`Load failed (native): ${msg.slice(0, 120)}`);
  }
  const status = Number(res?.status) || 0;
  if (status < 200 || status > 599) throw new TypeError(`Load failed (native): 无状态码（${status}）`);
  const text = typeof res.data === 'string' ? res.data : res.data == null ? '' : JSON.stringify(res.data);
  const h = new Headers();
  for (const [k, v] of Object.entries(res.headers ?? {})) { if (typeof v === 'string') { try { h.set(k, v); } catch { /* 非法头名 */ } } }
  return new Response(text, { status, headers: h });
}

/** fetch 的替身：原生主机（或 force）走原生通道，其余照旧 */
export function aiFetch(url: string, init: RequestInit = {}, force?: boolean): Promise<Response> {
  return (force ?? isNativeHost(url)) ? nativeFetch(url, init) : fetch(url, init);
}
