/**
 * nativeBars — 安卓沉浸式的网页侧（第 29 批 · PRD §24.19 C）。
 *
 * 原生 MainActivity 把状态栏 / 导航栏做成透明、WebView 铺到屏幕边；SystemBars 插件把系统栏的 inset 推过来，
 * 这里写进 --android-inset-top / bottom 并给 <html> 打上 data-android-edge——index.css 把它们接进全站的
 * --app-safe-top / --app-safe-bottom（底导、弹层、全屏战场、助手窗都在用）。
 * 键盘：原生把 IME 高度做成 WebView 的底外边距（等效 adjustResize），同时把 bottom inset 置 0，网页不用管键盘。
 * 图标明暗：按页面底色（夜间 / 红频道 = 深色舞台）告诉原生 setStyle。
 * 首帧（第 33 批）：上一次的系统栏高度记在本机，index.html 的内联脚本在第一帧之前就套上；
 * initSystemBars 在 main.tsx 最前面调（以前排在启动尾巴后面，数据多的机器上头几秒页面顶在状态栏底下、然后整页下移）。
 * 只在安卓原生生效；旧包没插件 / 网页版 一律静默。
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface SystemInsets {
  /** 状态栏高度（CSS px） */
  top: number;
  /** 导航栏高度（CSS px）；键盘弹起时原生给 0 */
  bottom: number;
  imeVisible?: boolean;
  /** 0 三键 / 1 两键 / 2 手势（Settings.Secure navigation_mode；取不到 -1） */
  navMode?: number;
}

interface SystemBarsPlugin {
  getInsets(): Promise<SystemInsets>;
  setStyle(o: { statusDark: boolean; navDark: boolean }): Promise<void>;
  addListener(event: 'insets', fn: (ins: SystemInsets) => void): Promise<PluginListenerHandle>;
}

const SystemBars = registerPlugin<SystemBarsPlugin>('SystemBars');

const isAndroidNative = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/** 上一次的系统栏高度（index.html 内联脚本首帧前读它；键名两处要一致） */
export const INSETS_CACHE_KEY = 'velvet:androidInsets.v1';

/** 把 inset 落到 CSS 变量（测试也走这里） */
export function applyInsets(ins: SystemInsets): void {
  const root = document.documentElement;
  const px = (n: number) => `${Math.max(0, Math.round(n))}px`;
  root.style.setProperty('--android-inset-top', px(ins.top));
  root.style.setProperty('--android-inset-bottom', px(ins.bottom));
  root.dataset.androidEdge = '1';
  root.dataset.navMode = String(ins.navMode ?? -1);
  if (ins.imeVisible) root.dataset.imeVisible = '1'; else delete root.dataset.imeVisible;
  // 键盘弹着时 bottom 是 0，不记（下次冷启动没有键盘）；只有原生壳记（测试 / 网页不写，免得网页首帧也套上）
  if (!ins.imeVisible && ins.top > 0 && isAndroidNative()) {
    try { localStorage.setItem(INSETS_CACHE_KEY, JSON.stringify({ top: Math.round(ins.top), bottom: Math.round(ins.bottom), navMode: ins.navMode ?? -1 })); } catch { /* 隐私模式 / 配额：下次照常等原生 */ }
  }
}

/** 首帧套过缓存的高度、原生却不支持（装回了没有沉浸式的旧包）：撤掉，免得空出一条 */
function dropCachedInsets(): void {
  const root = document.documentElement;
  root.style.removeProperty('--android-inset-top');
  root.style.removeProperty('--android-inset-bottom');
  delete root.dataset.androidEdge;
  delete root.dataset.navMode;
  try { localStorage.removeItem(INSETS_CACHE_KEY); } catch { /* 同上 */ }
}

let inited = false;
let lastStyle = '';

/** 启动时调一次（main.tsx 最前面，不等 React）：拿当前 inset、订阅变化 */
export async function initSystemBars(): Promise<void> {
  if (inited || !isAndroidNative()) return;
  inited = true;
  try {
    await SystemBars.addListener('insets', applyInsets);
    const ins = await SystemBars.getInsets();
    // 原生还没量到（窗口刚建好时根 inset 可能还是空的，插件回 0）：首帧已经套着上次的值，别用 0 冲掉，等监听推过来
    if (ins.top > 0 || document.documentElement.dataset.androidEdge !== '1') applyInsets(ins);
  } catch (e) {
    // 旧包没有这个插件：保持原来的实心系统栏，不做沉浸式
    console.warn('[nativeBars] SystemBars 不可用', e);
    dropCachedInsets();
  }
}

/** 页面底色变了（夜间 / 换频道）告诉原生改状态栏 / 导航栏图标明暗；值没变不过桥 */
export function setBarStyle(statusDark: boolean, navDark: boolean): void {
  if (!isAndroidNative()) return;
  const key = `${statusDark}|${navDark}`;
  if (key === lastStyle) return;
  lastStyle = key;
  void SystemBars.setStyle({ statusDark, navDark }).catch(() => {});
}

export const _applyInsetsForTest = applyInsets;
