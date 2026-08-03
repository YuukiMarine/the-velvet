import { useAppStore } from '@/store';
import type { ThemeType } from '@/types';

type FeedbackKind = 'theme_switch' | 'nav' | 'success' | 'level';

const THEME_SOUNDS: Record<ThemeType, Record<FeedbackKind, string>> = {
  blue:   { theme_switch: '/themea-switch.mp3', nav: '/themea-nav.mp3', success: '/themea-success.mp3', level: '/themea-level.mp3' },
  pink:   { theme_switch: '/themea-switch.mp3', nav: '/themea-nav.mp3', success: '/themea-success.mp3', level: '/themea-level.mp3' },
  yellow: { theme_switch: '/themeb-switch.mp3', nav: '/themeb-nav.mp3', success: '/themeb-success.mp3', level: '/themeb-level.mp3' },
  red:    { theme_switch: '/themec-switch.mp3', nav: '/dd.mp3',    success: '/ok.mp3',   level: '/themec-level.mp3' },
  custom: { theme_switch: '/themea-switch.mp3', nav: '/themea-nav.mp3', success: '/themea-success.mp3', level: '/themea-level.mp3' },
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
/** 总线限幅器：所有音效经它汇入 destination，见 getBus() 说明 */
let _bus: DynamicsCompressorNode | null = null;
// LRU 缓存：Map 按插入顺序保序，命中时移到队尾；超出上限时从队首淘汰。
// 上限 48 够覆盖"4 主题 × 4 feedback + 战斗/同伴 所有音效"，且单文件约 100KB，最多占用 ~5MB。
const _BUFFER_CACHE_MAX = 48;
const _bufferCache = new Map<string, AudioBuffer>();
// fetch 正在进行中的 Promise，避免同一文件并发 fetch
const _fetchPromise = new Map<string, Promise<AudioBuffer | null>>();

function touchLRU(src: string, buffer: AudioBuffer): void {
  // 重新插入使其位于 Map 队尾（最近使用）
  if (_bufferCache.has(src)) _bufferCache.delete(src);
  _bufferCache.set(src, buffer);
  // 超限时淘汰最久未使用项
  while (_bufferCache.size > _BUFFER_CACHE_MAX) {
    const firstKey = _bufferCache.keys().next().value;
    if (firstKey === undefined) break;
    _bufferCache.delete(firstKey);
  }
}

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
 * 总线限幅器（v2.5 增益改造）。
 *
 * 用户反馈"音量开到最大还是不够响"。根因不是滑条，是**天花板**：
 * 原来每个音源的 gain 被 clamp 到 1.0，而 1.0 只是"原样播放"——
 * 素材本身录得偏轻，再怎么调也不会超过素材响度。
 *
 * Web Audio 的 GainNode 本来就允许 >1（数字增益），风险只有削顶失真。
 * 所以这里在 destination 前串一个 DynamicsCompressor 当**软限幅**：
 * 增益放开到 2.0，超出部分被压回来而不是硬削，听感是"更响"而不是"更破"。
 * 参数取限幅器口径——高阈值、大压缩比、极快启动、几乎无膝。
 */
function getBus(ctx: AudioContext): AudioNode {
  if (_bus) return _bus;
  try {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = -6;   // 到 -6dBFS 才开始压
    c.knee.value = 0;         // 硬拐点 = 限幅而非"温柔压缩"，不改变正常音量段的听感
    c.ratio.value = 20;       // 20:1，越界部分基本被摁住
    c.attack.value = 0.001;   // 1ms 起效，抓得住瞬态
    c.release.value = 0.08;
    c.connect(ctx.destination);
    _bus = c;
    return c;
  } catch {
    return ctx.destination; // 拿不到压缩器就直连（老 Safari），此时仍受 clamp 保护
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
      touchLRU(src, audioBuffer);
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
  if (buffer) {
    // 命中时刷新 LRU 顺序
    touchLRU(src, buffer);
  } else {
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
    gainNode.connect(getBus(ctx)); // 经限幅总线，而非直连 destination

    // 播放结束后断开节点，避免 AudioNode 泄漏（长会话下累计可至数百个）
    source.onended = () => {
      try { source.disconnect(); } catch { /* ignore */ }
      try { gainNode.disconnect(); } catch { /* ignore */ }
    };

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

// ── 音量调档（v2.5：在 v2.1 基础上再 +40%）───────────────
// 用户反馈"开到最大依旧不够响"。这一轮做了两件事，缺一不可：
//   ① 倍率各再 ×1.4：主题音 1.5→2.1、通用音 1.3→1.82
//   ② 天花板从 1.0 抬到 2.0 —— 否则倍率会被 clamp 原地吃掉，改了等于没改。
//      抬顶的安全垫是 getBus() 里的软限幅器：越界被压回来，不硬削、不破音。
// 两个倍率独立于「设置 → 体验个性化 → 音效音量」滑条（getVolume()），也不绕过 isMuted()。
const THEME_SOUND_BOOST = 2.1;
const SOUND_BOOST       = 1.82;

/** 上限 2.0（数字增益，>1 靠总线限幅器兜底）；下限 0 */
const clampVolume = (v: number) => Math.max(0, Math.min(2, v));

// ── 公开 API ─────────────────────────────────────────────

/**
 * 直接播放任意路径的音效（供外部使用）。
 * 战斗 / 塔罗 / 合作模块均走这里，统一吃 SOUND_BOOST（×1.3）。
 */
export const playSound = (src: string, volume = 0.5): void => {
  if (isMuted()) return;
  void playBuffered(src, clampVolume(volume * getVolume() * SOUND_BOOST));
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
  const baseVolume = kind === 'nav' || kind === 'theme_switch' ? 0.48 : 0.54;
  void playBuffered(src, clampVolume(baseVolume * getVolume() * THEME_SOUND_BOOST));
};

/**
 * 切主题时响**目标主题**的切换声（预听），不是当前主题的。
 * custom 自己没有声音方案，落到用户选的那套（与 getActiveTheme 同口径）——
 * 否则点「自定义」永远响蓝的那声，和它实际会用的音效对不上。
 */
export const triggerThemeSwitchFeedback = (theme: ThemeType): void => {
  const resolved = theme === 'custom'
    ? (useAppStore.getState().settings.customSoundScheme || 'blue')
    : theme;
  playThemeSound('theme_switch', resolved);
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

/** 长按 ◈ 轮盘绽放：音效复用主题切换声（用户口径——弹菜单与切主题同声），附轻触觉。 */
export const triggerWheelOpenFeedback = (): void => {
  triggerLightHaptic();
  playThemeSound('theme_switch');
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
