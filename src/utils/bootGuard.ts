/**
 * bootGuard —— 启动看门狗（紧急修复 #1：iPhone 13 / 15「卡在首屏动画进不去」，重启手机后又好了）。
 *
 * 拿不到用户的日志，就让 App 自己记账：每次启动在 localStorage 落一条
 *   { startedAt, stage, done, failures }
 * 走到首页才标 done。下一次启动时看上一条：没 done、又是 10 分钟内重启 → failures + 1；
 * 连续两次没完成 → **安全模式**：开屏不放 3D 推进段、不预热分包、不抢着解码音效，
 * 进首页后顶部给一条横幅，一键复制诊断信息（机型 / 系统 / 内存 / 存储 / 各表行数 / 上次卡在哪一步）。
 *
 * 为什么能对上「卡在首屏动画」：WKWebView 的网页内容进程被系统杀掉（内存紧张、后台回收）后，
 * Capacitor 会直接 webView.reload()，开屏从头再放一遍——用户看到的就是动画一直在、App 进不去；
 * 重启手机腾出内存后又能进了。每次 reload 都会再走一遍 bootBegin，所以循环会被记成 failures 递增。
 *
 * 另有 index.html 里的一行内联脚本先写 velvet:boot.html：模块脚本根本没跑（老 WebView 解析不了产物）
 * 的机器上，这条会在、main 那条不会在——诊断信息里能看出来。
 */

export interface BootRecord {
  v: 1;
  startedAt: number;
  stage: string;
  stageAt: number;
  done: boolean;
  /** 连续几次没走到 done 就重启了 */
  failures: number;
  lastDurationMs?: number;
}

export interface BootInfo {
  failures: number;
  safeMode: boolean;
  /** 上一次启动最后走到的阶段（没走完时才有意义） */
  prevStage: string | null;
  prevStartedAt: number | null;
  /** 上一次 index.html 的内联脚本跑了、模块脚本却没跑（老 WebView 解析失败一类） */
  htmlOnlyLastTime: boolean;
}

const KEY = 'velvet:boot.v1';
const HTML_KEY = 'velvet:boot.html';
/** 上一次没走完、这么久内又启动 → 算「紧接着的重试」 */
const LOOP_WINDOW_MS = 10 * 60 * 1000;
/** 连续几次没完成后进安全模式 */
export const SAFE_MODE_AFTER = 2;

let info: BootInfo = { failures: 0, safeMode: false, prevStage: null, prevStartedAt: null, htmlOnlyLastTime: false };
let current: BootRecord | null = null;

const read = (): BootRecord | null => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' && v.v === 1 ? v as BootRecord : null;
  } catch { return null; }
};
const write = (r: BootRecord): void => {
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* 隐私模式 / 存储满：看门狗失效，不影响启动 */ }
};

/** main.tsx 最先调：判上一次、开这一次的账 */
export function bootBegin(): BootInfo {
  const prev = read();
  const now = Date.now();
  let htmlAt = 0;
  try { htmlAt = Number(localStorage.getItem(HTML_KEY) || 0); } catch { /* ignore */ }
  const prevUnfinished = !!prev && !prev.done;
  const recent = !!prev && now - prev.startedAt < LOOP_WINDOW_MS;
  const failures = prevUnfinished && recent ? (prev!.failures ?? 0) + 1 : prevUnfinished ? 1 : 0;
  // 上一次：html 标记比上一条记录新、而上一条又停在 main 之前 → 模块脚本没跑
  const htmlOnlyLastTime = !!prev && htmlAt > prev.startedAt && htmlAt < now - 2000 && prev.stage === 'html';
  info = {
    failures,
    safeMode: failures >= SAFE_MODE_AFTER,
    prevStage: prevUnfinished ? prev!.stage : null,
    prevStartedAt: prev?.startedAt ?? null,
    htmlOnlyLastTime,
  };
  current = { v: 1, startedAt: now, stage: 'main', stageAt: now, done: false, failures };
  write(current);
  return info;
}

/** 走到了哪一步：splash / init / migrate / tail / ready */
export function bootStage(stage: string): void {
  if (!current) return;
  current = { ...current, stage, stageAt: Date.now() };
  write(current);
}

/** 首页画出来了：这次算完成，failures 清零 */
export function bootDone(): void {
  if (!current || current.done) return;
  current = { ...current, stage: 'done', stageAt: Date.now(), done: true, failures: 0, lastDurationMs: Date.now() - current.startedAt };
  write(current);
}

export function getBootInfo(): BootInfo {
  return info;
}

/** 用户看过横幅：以后别再提这一轮 */
export function ackBootFailures(): void {
  info = { ...info, failures: 0, safeMode: info.safeMode };
}

/** 给用户复制 / 截图用的诊断信息（不含任何记录正文，只有计数与设备信息） */
export async function collectBootDiagnostics(): Promise<Record<string, unknown>> {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const out: Record<string, unknown> = {
    app: (import.meta.env.PACKAGE_VERSION as string | undefined) ?? 'unknown',
    at: new Date().toISOString(),
    ua: nav?.userAgent ?? '',
    screen: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}` : '',
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
    deviceMemory: (nav as unknown as { deviceMemory?: number } | null)?.deviceMemory ?? null,
    cores: nav?.hardwareConcurrency ?? null,
    reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    boot: { ...info, current },
  };
  try {
    if (nav?.storage?.estimate) {
      const est = await nav.storage.estimate();
      out.storage = { usageMB: est.usage != null ? Math.round(est.usage / 1048576) : null, quotaMB: est.quota != null ? Math.round(est.quota / 1048576) : null };
    }
  } catch { /* ignore */ }
  try {
    const { db } = await import('@/db');
    const names = ['users', 'activities', 'activityImages', 'activityImageData', 'todos', 'todoCompletions', 'confidants', 'battleStates', 'strata', 'summaries', 'ledgerEntries', 'wishes', 'navigatorMessages'];
    const counts: Record<string, number | string> = {};
    for (const n of names) {
      try { counts[n] = await db.table(n).count(); } catch { counts[n] = '-'; }
    }
    out.tables = counts;
    out.dbVersion = db.verno;
  } catch (e) {
    out.tables = `读不到：${e instanceof Error ? e.message : String(e)}`;
  }
  try { out.localStorageKeys = localStorage.length; } catch { /* ignore */ }
  return out;
}
