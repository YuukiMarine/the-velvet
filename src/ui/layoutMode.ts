/**
 * 宽屏布局（左侧栏）开关 + 手机布局铺满（第 20 批 · iPad）。
 *
 * 以前窗口宽度 ≥ 768 就一律切成「左侧栏 + 内容列」；在 iPad 横屏上内容列浮在中间、元素还是手机尺寸。现在分两种：
 *   - 左侧栏（<html class="layout-wide">）：照旧。原来写 md: / lg: 的样式改成 wide: / wide-lg:
 *     （tailwind.config.js），只在这个 class 在的时候生效；
 *   - 手机布局：不管多宽都是底部导航的手机布局。触屏设备上窗口比手机宽时，把 viewport 宽度定成一个手机级的数，
 *     由系统原生等比放大铺满——点击坐标、vh、手势动画都还是同一套坐标（CSS zoom 会错位，不用）。
 *     电脑浏览器不认 viewport，关了就是不放大的手机布局。
 * 设置项只在 iPad 或宽横屏窗口里出现；偏好存本机、不随云同步（同一个账号的手机和平板各管各的）。
 * 默认：iPad = 手机布局（以前 iPad 跑的是放大的 iPhone 版，看到的就是手机布局，只是现在铺满了），其他 = 左侧栏。
 * index.html 里有一段同口径的内联脚本，首帧前就把 class 和 viewport 定好，免得启动闪一下侧栏；改这里要一起改那里。
 */

const KEY = 'velvet:sidebarLayout.v1';
/** 原样的 viewport（index.html 里那句） */
const BASE_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
/** 窗口比这个窄就是手机尺寸，不放大（分屏 1/3、台前调度的小窗口都落在这里） */
const SCALE_FROM_PT = 640;
/** 放大后的 CSS 宽度大约是这个——手机布局内容列（max-w-2xl 672 + 两侧留白）刚好铺满 */
const TARGET_CSS = 768;
const MIN_SCALE = 1.25;
const MAX_SCALE = 1.6;

type Pref = 'on' | 'off' | null;

const readPref = (): Pref => {
  try { const v = localStorage.getItem(KEY); return v === 'on' || v === 'off' ? v : null; } catch { return null; }
};

/** iPadOS：移动版网页视图 UA 带 iPad；Safari 默认桌面版时报成 Mac，但有多点触控 */
export const isIPad = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

const isTouch = (): boolean => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

/**
 * 窗口的真实宽度（点）。放大后 innerWidth 是 CSS 宽度，乘上页面缩放（visualViewport.scale）才是窗口宽度；
 * 拿不到缩放时退回屏幕宽度（全屏时两者相同）。
 */
const windowPt = (): number => {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  const w = vv && vv.scale > 0 ? vv.width * vv.scale : window.innerWidth;
  return Math.round(w);
};

const sidebarDefault = (): boolean => !isIPad();

/** 现在用不用左侧栏（偏好优先，没设过按设备默认） */
export const sidebarEnabled = (): boolean => {
  const p = readPref();
  return p === 'on' ? true : p === 'off' ? false : sidebarDefault();
};

/** 设置里要不要出现这个开关：iPad，或宽横屏窗口（≥ 768 且横着） */
export const sidebarSettingVisible = (): boolean => {
  if (isIPad()) return true;
  const w = windowPt();
  return w >= 768 && window.innerWidth > window.innerHeight;
};

/** 此刻是不是手机布局（左侧栏关了，或窗口本来就窄）——替代原来的 matchMedia('(max-width: 767px)') */
export const isPhoneLayout = (): boolean =>
  !document.documentElement.classList.contains('layout-wide') || window.innerWidth < 768;

/** 手机布局下给宽窗口算 viewport：返回 null = 用原样（不放大） */
const scaledViewport = (wPt: number): string | null => {
  if (!isTouch() || wPt <= SCALE_FROM_PT) return null;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, wPt / TARGET_CSS));
  const cssWidth = Math.round(wPt / scale);
  return `width=${cssWidth}, user-scalable=no, viewport-fit=cover`;
};

const listeners = new Set<() => void>();
let version = 0;

/** 按当前偏好和窗口把 class / viewport 定好（启动、改设置、转屏、拖窗口时调） */
export function applyLayoutMode(): void {
  if (typeof document === 'undefined') return;
  const wide = sidebarEnabled();
  document.documentElement.classList.toggle('layout-wide', wide);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) {
    const next = wide ? BASE_VIEWPORT : (scaledViewport(windowPt()) ?? BASE_VIEWPORT);
    if (meta.content !== next) meta.content = next;
  }
  version++;
  listeners.forEach(fn => fn());
}

/** 设置页的开关 */
export function setSidebarEnabled(on: boolean): void {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 隐私模式：本次会话里照样生效 */ }
  applyLayoutMode();
}

let inited = false;
/** 挂一次：之后转屏 / 拖窗口自动重算（viewport 变了会再触发 resize，结果相同就不再改，不会来回抖） */
export function initLayoutMode(): void {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  applyLayoutMode();
  let t = 0;
  const onResize = () => { window.clearTimeout(t); t = window.setTimeout(applyLayoutMode, 120); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
}

/** React 订阅：版本号变了（改设置 / 转屏）就重渲染 */
export const subscribeLayoutMode = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getLayoutModeVersion = () => version;
