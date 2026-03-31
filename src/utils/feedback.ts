import { useAppStore } from '@/store';
import type { ThemeType } from '@/types';

type FeedbackKind = 'theme_switch' | 'nav' | 'success' | 'level';

const THEME_SOUNDS: Record<ThemeType, Record<FeedbackKind, string>> = {
  blue:   { theme_switch: '/p3se.mp3', nav: '/p3tap.mp3', success: '/p3up.mp3', level: '/p3lv.mp3' },
  pink:   { theme_switch: '/p3se.mp3', nav: '/p3tap.mp3', success: '/p3up.mp3', level: '/p3lv.mp3' },
  yellow: { theme_switch: '/p4se.mp3', nav: '/p4tap.mp3', success: '/p4up.mp3', level: '/p4lv.mp3' },
  red:    { theme_switch: '/p5se.mp3', nav: '/dd.mp3',    success: '/ok.mp3',   level: '/p5lv.mp3' },
  custom: { theme_switch: '/p3se.mp3', nav: '/p3tap.mp3', success: '/p3up.mp3', level: '/p3lv.mp3' },
};

// ── Web Audio API 引擎 ────────────────────────────────────
//
// 策略：
//   1. 懒初始化 AudioContext（必须在用户手势内或之后创建）
//   2. 所有 MP3 文件在首次使用时 fetch + decodeAudioData，解码后缓存为 AudioBuffer
//   3. 播放时 createBufferSource().start() — 完全在内存中，延迟 < 1ms
//   4. AudioContext 若因长时间不活动被浏览器 suspend，在播放前 resume()
//   5. 降级：若 Web Audio API 不可用，回退到 new Audio()

let _ctx: AudioContext | null = null;
const _bufferCache = new Map<string, AudioBuffer>();
// fetch 正在进行中的 Promise，避免同一文件并发 fetch
const _fetchPromise = new Map<string, Promise<AudioBuffer | null>>();

function getContext(): AudioContext | null {
  if (_ctx) return _ctx;
  try {
    _ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    return _ctx;
  } catch {
    return null;
  }
}

/**
 * 预解码并缓存指定路径的音频文件。
 * 幂等：同一路径只 fetch + decode 一次。
 */
async function primeBuffer(src: string): Promise<AudioBuffer | null> {
  if (_bufferCache.has(src)) return _bufferCache.get(src)!;

  // 复用进行中的请求
  if (_fetchPromise.has(src)) return _fetchPromise.get(src)!;

  const ctx = getContext();
  if (!ctx) return null;

  const promise = (async () => {
    try {
      const resp = await fetch(src);
      if (!resp.ok) return null;
      const arrayBuffer = await resp.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      _bufferCache.set(src, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    } finally {
      _fetchPromise.delete(src);
    }
  })();

  _fetchPromise.set(src, promise);
  return promise;
}

/**
 * 用 Web Audio API 播放已缓存的 AudioBuffer。
 * 如果 buffer 尚未缓存，先 prime 再播放（首次仍有少量延迟，但只有一次）。
 */
async function playBuffered(src: string, volume: number): Promise<void> {
  const ctx = getContext();
  if (!ctx) {
    // 降级：HTMLAudioElement
    const a = new Audio(src);
    a.volume = volume;
    void a.play();
    return;
  }

  // AudioContext 被浏览器 suspend 时（长时间不活动）先 resume
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* ignore */ }
  }

  let buffer = _bufferCache.get(src);
  if (!buffer) {
    buffer = (await primeBuffer(src)) ?? undefined;
    if (!buffer) return;
  }

  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // 音量控制
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0);
  } catch {
    // ignore
  }
}

// ── 辅助函数 ─────────────────────────────────────────────

const getActiveTheme = (): ThemeType => {
  try {
    const state = useAppStore.getState();
    const theme = state.user?.theme || 'blue';
    // When using the custom color theme, delegate sound to the chosen sound scheme
    if (theme === 'custom') {
      return state.settings.customSoundScheme || 'blue';
    }
    return theme;
  } catch {
    return 'blue';
  }
};

const isMuted = (): boolean => {
  try {
    return !!useAppStore.getState().settings.soundMuted;
  } catch {
    return false;
  }
};

/** 读取用户设置的音量比例（0–1），未设置时默认 0.8 */
const getVolume = (): number => {
  try {
    const vol = useAppStore.getState().settings.soundVolume;
    return (vol === undefined || vol === null ? 80 : vol) / 100;
  } catch {
    return 0.8;
  }
};

// ── 公开 API ─────────────────────────────────────────────

/**
 * 直接播放任意路径的音效（供外部使用）。
 */
export const playSound = (src: string, volume = 0.5): void => {
  if (isMuted()) return;
  void playBuffered(src, volume * getVolume());
};

export const triggerLightHaptic = (): void => {
  try {
    if (navigator?.vibrate) navigator.vibrate(12);
  } catch { /* ignore */ }
};

const playThemeSound = (kind: FeedbackKind, themeOverride?: ThemeType): void => {
  if (isMuted()) return;
  const theme = themeOverride || getActiveTheme();
  const src = THEME_SOUNDS[theme][kind];
  const baseVolume = kind === 'nav' || kind === 'theme_switch' ? 0.4 : 0.45;
  void playBuffered(src, baseVolume * getVolume());
};

export const triggerThemeSwitchFeedback = (theme: ThemeType): void => {
  playThemeSound('theme_switch', theme);
};

export const triggerSuccessFeedback = (): void => {
  triggerLightHaptic();
  playThemeSound('success');
};

export const triggerLevelFeedback = (): void => {
  triggerLightHaptic();
  playThemeSound('level');
};

export const triggerNavFeedback = (): void => {
  playThemeSound('nav');
};

/**
 * 预加载当前主题的所有音效。
 * 在用户首次交互后调用（如 App.tsx 的 pointerdown 事件），
 * 确保后续所有点击都能零延迟播放。
 */
export const primeCurrentTheme = (): void => {
  const theme = getActiveTheme();
  const sounds = THEME_SOUNDS[theme];
  // 不 await — 后台静默预加载，失败不影响使用
  Object.values(sounds).forEach(src => void primeBuffer(src));
};
