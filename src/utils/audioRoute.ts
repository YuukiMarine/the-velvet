/**
 * 音频路由看门狗（第 30 批 · 用户上报「背景音乐偶现被降调」）。
 *
 * iOS WebKit 的老毛病：AudioContext 创建时锁定采样率（44.1k 或 48k），之后硬件路由一变（连上蓝牙耳机 / 来电后
 * 从通话路由切回扬声器 / Siri），系统采样率换了，旧 Context 不重采样、按旧速率喂新设备——48k 的内容走 44.1k
 * 的时钟，整首歌慢 8% 低一个半音，正是「被降调」。音效短促听不出来，背景音乐一听一个准。
 *
 * 对策：新建一个 AudioContext 探一下当前硬件采样率（建完就关，不占资源），和在用的 Context 不一样 → 调用方重建。
 * 探测 4 秒内只做一次（pointerdown 之类的高频入口也能随便调）。
 */
let lastProbeAt = 0;
let lastRate = 0;

const Ctor = (): typeof AudioContext | undefined =>
  (typeof window !== 'undefined' ? (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined);

/** 当前硬件采样率；拿不到（没有 Web Audio）返回 null */
export function probeHardwareSampleRate(): number | null {
  const C = Ctor();
  if (!C) return null;
  const now = Date.now();
  if (lastRate && now - lastProbeAt < 4000) return lastRate;
  try {
    const probe = new C();
    const rate = probe.sampleRate;
    void probe.close().catch(() => { /* ignore */ });
    lastProbeAt = now;
    lastRate = rate;
    return rate;
  } catch {
    return null;
  }
}

/** 在用的 Context 和硬件采样率对不上 = 该重建了 */
export function sampleRateMismatch(ctx: AudioContext | null): boolean {
  if (!ctx) return false;
  const hw = probeHardwareSampleRate();
  return !!hw && hw !== ctx.sampleRate;
}

/** 给诊断页看的：最近一次探到的硬件采样率 */
export function lastProbedSampleRate(): number {
  return lastRate;
}
