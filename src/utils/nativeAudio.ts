/**
 * 响应系统静音模式（第 30 批）· 原生 SystemAudio 插件的网页侧。
 *
 * iOS：静音拨键只管「ambient」类的音频会话。App 里的音效走 Web Audio，WebKit 默认按 ambient 处理 → 拨到静音就没声；
 *      <audio> 元素播放时 WebKit 又会把会话改成 playback → 背景音乐一响，连音效也不理拨键了。用户要一个明确的开关：
 *      开着 = 拨键说了算（会话设成 ambient）；关掉 = 像视频 App 一样不理拨键（会话设成 playback + mixWithOthers）。
 *      插件在回前台 / 中断结束时重新套一次（WebKit 可能在媒体开始 / 结束时自己改会话类别）。
 * 安卓：媒体音量本来不受静音 / 振动模式影响。开关开着 = 读铃声模式，静音 / 振动时网页侧把音效和音乐都压成 0。
 * 默认：undefined → iOS 响应（现状）、安卓不响应（现状），谁都不被动改行为。
 * 网页版 / 旧包：插件不在，一律静默。
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useAppStore } from '@/store';

type RingerMode = 'normal' | 'vibrate' | 'silent';

interface SystemAudioPlugin {
  setRespectSilent(options: { respect: boolean }): Promise<void>;
  getRingerMode(): Promise<{ mode: RingerMode }>;
  addListener(eventName: 'ringerMode', listener: (e: { mode: RingerMode }) => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<SystemAudioPlugin>('SystemAudio');
const platform = Capacitor.getPlatform();
const native = Capacitor.isNativePlatform();

let ringer: RingerMode = 'normal';
let respect = platform === 'ios';
const listeners = new Set<() => void>();
const notify = () => { for (const fn of listeners) { try { fn(); } catch { /* ignore */ } } };

/** 当前是否该按「系统静音」把 App 的声音压掉（只有安卓会为真；iOS 由系统会话自己管） */
export const isSystemMuted = (): boolean => platform === 'android' && respect && ringer !== 'normal';

export const respectSilentDefault = (): boolean => platform === 'ios';

export function subscribeSystemMute(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

let inited = false;
export function initSystemAudio(): void {
  if (inited || !native) return;
  inited = true;
  const read = () => useAppStore.getState().settings.soundRespectSilent ?? respectSilentDefault();
  const apply = (next: boolean) => {
    const changed = next !== respect;
    respect = next;
    if (platform === 'ios') {
      plugin.setRespectSilent({ respect: next }).catch(() => { /* 旧包没插件 */ });
    }
    if (changed) notify();
  };
  apply(read());
  let last = read();
  useAppStore.subscribe((st) => {
    const now = st.settings.soundRespectSilent ?? respectSilentDefault();
    if (now === last) return;
    last = now;
    apply(now);
  });
  if (platform === 'android') {
    plugin.getRingerMode().then(r => { ringer = r.mode; notify(); }).catch(() => { /* 旧包没插件 */ });
    plugin.addListener('ringerMode', (e) => { ringer = e.mode; notify(); }).catch(() => { /* ignore */ });
  }
}

/** 测试桩 */
export function _installForTest(fake: Partial<{ platform: string; ringer: RingerMode; respect: boolean }>): void {
  if (fake.ringer) ringer = fake.ringer;
  if (fake.respect !== undefined) respect = fake.respect;
  notify();
}
