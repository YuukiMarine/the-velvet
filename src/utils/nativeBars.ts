/**
 * nativeBars — 安卓沉浸式的网页侧（第 29 批 · PRD §24.19 C）。
 *
 * 原生 MainActivity 把状态栏 / 导航栏做成透明、WebView 铺到屏幕边；SystemBars 插件把系统栏的 inset 推过来，
 * 这里写进 --android-inset-top / bottom 并给 <html> 打上 data-android-edge——index.css 把它们接进全站的
 * --app-safe-top / --app-safe-bottom（底导、弹层、全屏战场、助手窗都在用）。
 * 键盘：原生把 IME 高度做成 WebView 的底 padding（等效 adjustResize），同时把 bottom inset 置 0，网页不用管键盘。
 * 图标明暗：按页面底色（夜间 / 红频道 = 深色舞台）告诉原生 setStyle。
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

/** 把 inset 落到 CSS 变量（测试也走这里） */
export function applyInsets(ins: SystemInsets): void {
  const root = document.documentElement;
  const px = (n: number) => `${Math.max(0, Math.round(n))}px`;
  root.style.setProperty('--android-inset-top', px(ins.top));
  root.style.setProperty('--android-inset-bottom', px(ins.bottom));
  root.dataset.androidEdge = '1';
  root.dataset.navMode = String(ins.navMode ?? -1);
  if (ins.imeVisible) root.dataset.imeVisible = '1'; else delete root.dataset.imeVisible;
}

let inited = false;
let lastStyle = '';

/** App 启动时调一次：拿当前 inset、订阅变化 */
export async function initSystemBars(): Promise<void> {
  if (inited || !isAndroidNative()) return;
  inited = true;
  try {
    const ins = await SystemBars.getInsets();
    applyInsets(ins);
    await SystemBars.addListener('insets', applyInsets);
  } catch (e) {
    // 旧包没有这个插件：保持原来的实心系统栏，不做沉浸式
    console.warn('[nativeBars] SystemBars 不可用', e);
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
