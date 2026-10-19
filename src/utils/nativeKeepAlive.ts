/**
 * nativeKeepAlive — AI 后台续命的网页侧（第 29 批 · PRD §24.19 B，§21.3 ③④）。
 *
 * iOS 退后台几秒就挂起 WebView，正在流的塔罗 / 总结 / 显形就断了；安卓看厂商。原生 BackgroundKeepAlive 插件：
 *   · iOS：UIApplication.beginBackgroundTask（系统给约 30 秒）——只救得了 30 秒内写完的，思维链模型救不了；
 *   · 安卓：PARTIAL_WAKE_LOCK 60 秒——只保 CPU 不睡，厂商省电杀进程不归它管。
 * 信号源是第 27 批的任务登记簿（aiJobs.running）：第一条任务开跑 → begin；全部结束 → end；
 * 切到后台时还有任务再 begin 一次（iOS 的 30 秒从退后台起算、安卓重新计 60 秒）。
 * 网页版 / 旧包没插件 一律静默。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useAIJobs } from '@/utils/aiJobs';

interface KeepAlivePlugin {
  begin(o: { reason: string }): Promise<void>;
  end(): Promise<void>;
}

let plugin: KeepAlivePlugin = registerPlugin<KeepAlivePlugin>('BackgroundKeepAlive');
let forceNative = false;
const nativeOk = () => forceNative || Capacitor.isNativePlatform();

let held = false;
let inited = false;

const begin = (reason: string) => {
  if (!nativeOk()) return;
  held = true;
  void plugin.begin({ reason }).catch(() => { held = false; });
};
const end = () => {
  if (!nativeOk() || !held) return;
  held = false;
  void plugin.end().catch(() => {});
};

/** App 启动时调一次 */
export function initKeepAlive(): void {
  if (inited) return;
  inited = true;
  if (!nativeOk()) return;
  let wasRunning = useAIJobs.getState().running.length > 0;
  if (wasRunning) begin('boot');
  useAIJobs.subscribe((s) => {
    const running = s.running.length > 0;
    if (running === wasRunning) return;
    wasRunning = running;
    if (running) begin(s.running.map((v) => v.key).join(','));
    else end();
  });
  document.addEventListener('visibilitychange', () => {
    // 退后台那一刻还有任务：再续一个窗口（begin 幂等，原生先 end 旧的）
    if (document.visibilityState === 'hidden' && useAIJobs.getState().running.length > 0) begin('background');
  });
}

/** 测试：换成假插件、当作原生；并允许重新 init */
export function _installForTest(fake: KeepAlivePlugin | null): void {
  plugin = fake ?? registerPlugin<KeepAlivePlugin>('BackgroundKeepAlive');
  forceNative = !!fake;
  held = false;
  inited = false;
}
