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

/**
 * 低帧率永久降级 flag：存在即 D0，且优先级高于「校直模式」开关。
 *
 * v2 换 key 的原因（用户上报「长按轮盘被错误降级，机器并无卡顿」）：v1 的判定是
 * **一次采样定终身**，而它的污染防线只挡「窗口被拉长 >2×」——一个 ~1s 的 long task
 * （HMR 编译 / GC / 首屏懒加载）把 1.2s 窗口拖到 2.3s 仍算有效样本，平均 fps 被
 * 记成 20 出头，好机器就此永久 D0，且没有任何恢复路径。换 key 让所有 v1 判定作废、
 * 按下面的 v2 规则重评：真低端机会在一两次启动内重新降级，被误伤的机器自动恢复。
 */
const PERF_DEGRADE_KEY = 'sl-perf-degrade-v2';
/** 已采样标记：拿到一次干净样本后不再重采，避免每次冷启都白烧 1.2s rAF */
const PERF_SAMPLED_KEY = 'sl-perf-sampled-v2';
/** 坏样本计数：连续两次启动都测出低帧才写永久 flag（单次抖动只降本次会话） */
const PERF_STRIKE_KEY = 'sl-perf-strike';
/** v1 遗留 key：启动时清掉（见上，v1 判定不可信） */
const LEGACY_KEYS = ['sl-perf-degrade', 'sl-perf-sampled'];

/** 采样窗口时长 */
const SAMPLE_MS = 1200;
/** 永久降级阈值 */
const MIN_FPS = 45;
/** 单帧间隔超过它视为 long task 污染（低端机是慢帧连绵，不是孤立巨帧）——样本作废 */
const POLLUTED_FRAME_MS = 250;
/**
 * schedulePerfSample 被调用后（开屏已结束）再静候主界面入场动效播完。
 *
 * 1500 → 3000：App 现在会在开屏一结束就连着预热行动/羁绊/菜单三个 chunk
 * （见 App.tsx HOT_CHUNKS——用户上报切页闪「加载中」，等空闲来不及）。
 * 编译是不可打断的 long task，撞进采样窗就会把预热的开销记到设备头上，
 * 一次误判就是**永久** D0。抬到 3000ms 让采样窗落在烫档预热之后、温档（5200ms）之前
 * 那段安静地带；顺带这个时间点也更接近稳态，比刚进首页时更能代表真实帧率。
 */
const SAMPLE_SETTLE_MS = 3000;

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

function readStrike(): number {
  try {
    return Number(localStorage.getItem(PERF_STRIKE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeStrike(n: number): void {
  try {
    if (n <= 0) localStorage.removeItem(PERF_STRIKE_KEY);
    else localStorage.setItem(PERF_STRIKE_KEY, String(n));
  } catch { /* 同 writeFlag */ }
}

/**
 * 帧率采样（v2）。设备能力的度量用**帧间隔中位数**而不是平均 fps：
 * 低端机的特征是慢帧连绵（中位数就高），而好机器偶发的 long task / GC 只是
 * 几个孤立巨帧，会把平均值拖穿阈值、却动不了中位数——v1 的误判全部来自这里。
 *
 * 样本作废（不写已采样标记，下次启动重采）的条件：
 *   - 窗口被拉长 >2× 或结束时页面不可见（后台 rAF 节流，v1 已有）；
 *   - 采样中途页面隐藏过（visibilitychange——只在结束时查会漏掉"中途切走又切回"）；
 *   - 出现 >250ms 的单帧（long task 污染：编译/懒加载/GC，不是设备慢）；
 *   - 用户开始操作（pointerdown：交互推起的渲染负载不该记到设备头上）。
 *
 * 判定为慢（中位帧间隔 < MIN_FPS）时**两振出局**：第一次只降本次会话并记一振，
 * 下次启动重采仍慢才写永久 flag。单次环境抖动永远不会再一锤定音。
 */
function samplePerf(root: HTMLElement): void {
  let last = 0;
  let start = 0;
  const deltas: number[] = [];
  let aborted = false;
  const abort = () => { aborted = true; };
  document.addEventListener('visibilitychange', abort, { once: true });
  window.addEventListener('pointerdown', abort, { once: true });
  const cleanup = () => {
    document.removeEventListener('visibilitychange', abort);
    window.removeEventListener('pointerdown', abort);
  };
  const tick = (now: number) => {
    if (aborted) return cleanup();
    if (start === 0) {
      start = now;
      last = now;
      requestAnimationFrame(tick);
      return;
    }
    const dt = now - last;
    last = now;
    if (dt > POLLUTED_FRAME_MS) return cleanup(); // long task 污染，样本作废
    deltas.push(dt);
    if (now - start < SAMPLE_MS) {
      requestAnimationFrame(tick);
      return;
    }
    cleanup();
    if (now - start > SAMPLE_MS * 2 || document.visibilityState === 'hidden') return;
    if (deltas.length < 10) return; // 帧太少不足以下判断（极端节流环境）
    const sorted = [...deltas].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const slow = 1000 / median < MIN_FPS;
    if (!slow) {
      writeFlag(PERF_SAMPLED_KEY); // 干净的合格样本：一锤定音，不再重采
      writeStrike(0);
      return;
    }
    // 慢：本次会话立即降级保护体验；连续两振才落永久 flag
    perfDegraded = true;
    root.setAttribute('data-boldness', '0');
    const strikes = readStrike() + 1;
    writeStrike(strikes);
    if (strikes >= 2) {
      writeFlag(PERF_DEGRADE_KEY);
      writeFlag(PERF_SAMPLED_KEY);
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
  // v1 遗留判定作废（见 PERF_DEGRADE_KEY 注释）：清 key，被误伤的设备即刻恢复，
  // 真低端机由 v2 采样在一两次启动内重新降级
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch { /* 存储不可用则无 v1 flag 可清 */ }
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

/**
 * 只问「用户是否在系统里明确要求减少动效」，不掺帧率推断。
 *
 * 给那些**一次性、不可交互期间**的演出用（开屏就是唯一一例）：
 * 帧率降级是一个替用户做的猜测，不该由它决定要不要放这个 App 的开场；
 * 而 reduced-motion 是用户自己按下的开关，必须听。
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

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
