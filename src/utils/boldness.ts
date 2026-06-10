/**
 * 大胆度拨盘运行时（UI_DESIGN_BOLD_V2.5.md §3 / §7 规则5「降级三通道」）。
 *
 * D0（斜轴归零、装饰动效静默）由三条互相独立的通道触发，任一命中即生效：
 *   1. prefers-reduced-motion —— index.css 媒体查询直接把 --boldness 归零，JS 不参与；
 *   2. 设置「校直模式」 —— setStraightenMode 写 <html data-boldness="0">；
 *   3. 首开帧率采样 <45fps —— 永久降级（localStorage flag），优先级高于设置开关：
 *      关掉校直模式也不会在低端机上恢复大胆度。
 *
 * 采样时机：initBoldnessRuntime 只负责恢复既有 flag；真正的采样由 App 在
 * **开屏动画结束后**调用 schedulePerfSample() 触发——若锚定在挂载后固定延时，
 * 采样窗口会撞上 SplashScreen 的粒子循环与主界面首挂入场动效（慢速开屏可达
 * ~4.3s），一次启动期掉帧就会把中端机误判成永久 D0。
 *
 * CSS 几何只认 data-boldness 属性与 reduce 媒体查询（见 index.css 末尾）；
 * JS 侧动效组件用 useBoldness() 取两个信号源的合并结果，false 时改播 fadeIn /
 * 直接渲染终态（与 utils/motion.ts 的 D0 降级约定配套）。
 */
import { useSyncExternalStore } from 'react';

/** 低帧率永久降级 flag：存在即 D0，且优先级高于「校直模式」开关 */
const PERF_DEGRADE_KEY = 'sl-perf-degrade';
/** 已采样标记：一次安装只采一次，避免每次冷启都白烧 1.2s rAF */
const PERF_SAMPLED_KEY = 'sl-perf-sampled';

/** 采样窗口时长 */
const SAMPLE_MS = 1200;
/** 永久降级阈值 */
const MIN_FPS = 45;
/** schedulePerfSample 被调用后（开屏已结束）再静候主界面入场动效播完 */
const SAMPLE_SETTLE_MS = 1500;

/**
 * 永久降级的内存镜像：localStorage 不可写（隐私模式）时 writeFlag 静默失败，
 * 若只认持久 flag，用户开关一次「校直模式」就会把本会话的 perf 降级意外恢复——
 * 单向闸门必须同时认内存镜像。
 */
let perfDegraded = false;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // 存储不可用（隐私模式等）：本次会话的降级仍然生效，只是下次启动需要重采
  }
}

/** 帧率采样：rAF 计数 SAMPLE_MS，达不到 MIN_FPS 即写永久降级 flag */
function samplePerf(root: HTMLElement): void {
  let start = 0;
  let frames = 0;
  const tick = (now: number) => {
    if (start === 0) {
      start = now;
      requestAnimationFrame(tick);
      return;
    }
    frames += 1;
    if (now - start < SAMPLE_MS) {
      requestAnimationFrame(tick);
      return;
    }
    // 切后台时 rAF 被节流，测出来的"低帧率"是假象——窗口被拉长一倍以上
    // 即视为采样被污染：本次作废且不写已采样标记，留给下次启动重采
    if (now - start > SAMPLE_MS * 2 || document.visibilityState === 'hidden') return;
    writeFlag(PERF_SAMPLED_KEY);
    if ((frames * 1000) / (now - start) < MIN_FPS) {
      perfDegraded = true;
      writeFlag(PERF_DEGRADE_KEY);
      root.setAttribute('data-boldness', '0');
    }
  };
  requestAnimationFrame(tick);
}

let runtimeInited = false;

/**
 * 启动时调用一次（App 挂载 useEffect）。幂等：重复调用直接返回。
 * 只负责恢复上次的永久降级判定；帧率采样另由 schedulePerfSample 在
 * 开屏结束后触发（见文件头「采样时机」）。
 */
export function initBoldnessRuntime(): void {
  if (runtimeInited) return;
  runtimeInited = true;
  if (readFlag(PERF_DEGRADE_KEY)) {
    perfDegraded = true;
    document.documentElement.setAttribute('data-boldness', '0');
  }
}

let sampleScheduled = false;

/**
 * 触发一次首开帧率采样（App 在 SplashScreen 结束后调用）。幂等。
 * 再静候 SAMPLE_SETTLE_MS（让主界面入场动效播完）并尽量等到空闲帧，
 * 之后采样 1.2s；一次安装只采一次。
 */
export function schedulePerfSample(): void {
  if (sampleScheduled) return;
  sampleScheduled = true;
  if (perfDegraded || readFlag(PERF_DEGRADE_KEY) || readFlag(PERF_SAMPLED_KEY)) return;
  const start = () => {
    setTimeout(() => samplePerf(document.documentElement), SAMPLE_SETTLE_MS);
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => start(), { timeout: 4000 });
  } else {
    start();
  }
}

/**
 * 「校直模式」开关 → <html data-boldness>。
 * 关闭时仅在无永久降级（内存镜像 + 持久 flag 都未命中）的前提下移除属性：
 * perf 降级是单向闸门，不允许被设置开关意外恢复。
 */
export function setStraightenMode(on: boolean): void {
  const root = document.documentElement;
  if (on) {
    root.setAttribute('data-boldness', '0');
    return;
  }
  if (!perfDegraded && !readFlag(PERF_DEGRADE_KEY)) {
    root.removeAttribute('data-boldness');
  }
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** 订阅两个 D0 信号源：<html data-boldness> 属性 + reduce 媒体查询 */
function subscribeBoldness(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-boldness'],
  });
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    mql.removeEventListener('change', onChange);
  };
}

function getBoldnessSnapshot(): boolean {
  if (document.documentElement.getAttribute('data-boldness') === '0') return false;
  return !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * true = 允许大胆动效（D2+）；false = D0，组件应改播 crossfade / 直接渲染终态。
 * CSS 几何由 --boldness 自动归零，本 hook 只服务于必须在 JS 里分叉的动效
 * （Canvas 过场、Framer Motion 编排等）。
 */
export function useBoldness(): boolean {
  return useSyncExternalStore(subscribeBoldness, getBoldnessSnapshot);
}
