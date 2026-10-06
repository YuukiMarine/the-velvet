/**
 * bgm —— 导入音乐当系统 BGM（第 13 轮 B 组 2.8）。
 *
 * 口径（用户拍板）：最多 6 首；可分别选战斗曲目、爬塔曲目、各主题主页默认曲目；曲目本体存本机 Dexie 表
 * bgmTracks（Blob），**不上云、不进主备份**；设置里只存小字段（开关 / 音量 / 各槽位的曲目 id，按设备生效）。
 *
 * 播放：一个循环的 <audio>（URL.createObjectURL，不整首解码进内存）。iOS 忽略 <audio>.volume，音量走
 * Web Audio：createMediaElementSource → GainNode（blob 同源无跨域问题）；拿不到 AudioContext 退回 .volume。
 * 首次触屏后才开始（App.tsx 的首次手势口）；页面隐藏暂停、可见继续；录语音期间暂停；「静音模式」一起静音。
 * iOS 原生音频会话已是 .playback + mixWithOthers：静音键不影响，与用户自己的音乐混播；后台会停（不申请后台音频）。
 *
 * 版权：App 不带任何音乐、不提供曲库，文件只在本机播放；界面常态提示「请只导入你有权使用的音频」。
 */
import { db } from '@/db';
import { useAppStore } from '@/store';
import type { BgmTrack, Settings, ThemeType } from '@/types';

/** battle = 小影 / 强敌 / 遭遇战；boss = 每区层关底的心魔（用户追加的档位）；tower = 塔屏 */
export type BgmScene = 'home' | 'battle' | 'boss' | 'tower';
export const BGM_MAX_TRACKS = 6;
export const BGM_MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT_MIME = /^audio\/(mpeg|mp3|mp4|m4a|x-m4a|aac|aacp|wav|x-wav|ogg|flac|webm)$/i;
const ACCEPT_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)$/i;
const THEMES: ThemeType[] = ['blue', 'yellow', 'red', 'pink', 'custom'];

export const bgmVolumeOf = (s: Settings): number => Math.max(0, Math.min(100, s.bgmVolume ?? 60));

// ── 播放器状态（模块单例）──
let scene: BgmScene = 'home';
let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let currentId: string | null = null;
let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let unlocked = false;         // 用户手势之后才能出声
let holdRecording = false;    // 录音中
let inited = false;
let refreshing: Promise<void> | null = null;
let pendingRefresh = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });

/** 给设置块订阅「正在播放什么」 */
export function subscribeBgm(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getBgmState(): { playing: boolean; trackId: string | null; scene: BgmScene; unlocked: boolean; pipeline: 'gain' | 'volume' | 'none' } {
  return {
    playing: !!audio && !audio.paused && !audio.ended,
    trackId: currentId,
    scene,
    unlocked,
    pipeline: !audio ? 'none' : gain ? 'gain' : 'volume',
  };
}

// ── 曲库 ──
export async function listBgmTracks(): Promise<BgmTrack[]> {
  try { return await db.bgmTracks.orderBy('createdAt').toArray(); } catch { return []; }
}

/** 校验 + 落库；第一首会把所有还空着的槽位都填上（导入完立刻有声） */
export async function importBgmTrack(file: File): Promise<BgmTrack> {
  const name = file.name || '未命名';
  if (!(ACCEPT_MIME.test(file.type) || ACCEPT_EXT.test(name))) throw new Error('只支持 mp3 / m4a / aac / wav / ogg / flac');
  if (file.size > BGM_MAX_BYTES) throw new Error(`单首不超过 ${Math.round(BGM_MAX_BYTES / 1048576)} MB`);
  if (file.size === 0) throw new Error('文件是空的');
  const existing = await listBgmTracks();
  if (existing.length >= BGM_MAX_TRACKS) throw new Error(`最多存 ${BGM_MAX_TRACKS} 首，先删一首再导入`);
  const track: BgmTrack = {
    id: `bgm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || '未命名',
    size: file.size,
    mime: file.type || 'audio/mpeg',
    blob: file,
    createdAt: new Date(),
  };
  await db.bgmTracks.put(track);
  // 槽位默认值：空着的槽位填这首（只在它是第一首时；后面导入的不抢位）
  const st = useAppStore.getState();
  const s = st.settings;
  if (existing.length === 0) {
    const home: Partial<Record<ThemeType, string>> = { ...(s.bgmHomeTrackIds ?? {}) };
    for (const t of THEMES) if (!home[t]) home[t] = track.id;
    await st.updateSettings({
      bgmHomeTrackIds: home,
      bgmBattleTrackId: s.bgmBattleTrackId || track.id,
      bgmBossTrackId: s.bgmBossTrackId || track.id,
      bgmTowerTrackId: s.bgmTowerTrackId || track.id,
      bgmEnabled: s.bgmEnabled ?? true,
    });
  }
  void refreshBgm();
  return track;
}

/** 删曲：槽位里引用它的一律清掉；正在放的停下 */
export async function removeBgmTrack(id: string): Promise<void> {
  await db.bgmTracks.delete(id);
  const st = useAppStore.getState();
  const s = st.settings;
  const home: Partial<Record<ThemeType, string>> = { ...(s.bgmHomeTrackIds ?? {}) };
  let touched = false;
  for (const t of THEMES) if (home[t] === id) { delete home[t]; touched = true; }
  const patch: Partial<Settings> = {};
  if (touched) patch.bgmHomeTrackIds = home;
  if (s.bgmBattleTrackId === id) patch.bgmBattleTrackId = '';
  if (s.bgmBossTrackId === id) patch.bgmBossTrackId = '';
  if (s.bgmTowerTrackId === id) patch.bgmTowerTrackId = '';
  if (Object.keys(patch).length) await st.updateSettings(patch);
  if (currentId === id) stopPlayback();
  void refreshBgm();
}

// ── 场景 / 解锁 ──
export function setBgmScene(next: BgmScene): void {
  if (scene === next) return;
  scene = next;
  void refreshBgm();
}

/** 首次用户手势：从此允许出声（浏览器 / WebView 自动播放策略） */
export function unlockBgm(): void {
  if (unlocked) return;
  unlocked = true;
  void refreshBgm();
}

/** 录音开始 / 结束（speech.ts 派事件）：录音期间暂停 */
export function holdBgmForRecording(on: boolean): void {
  holdRecording = on;
  void refreshBgm();
}

// ── 音量 ──
const effectiveGain = (s: Settings): number => (s.soundMuted ? 0 : (bgmVolumeOf(s) / 100) * 0.9);

/** 滑块拖动中：立即生效，不等落库 */
export function previewBgmVolume(percent: number): void {
  const v = (Math.max(0, Math.min(100, percent)) / 100) * 0.9;
  applyGain(v, 0.05);
}

function applyGain(v: number, rampSec = 0.25): void {
  if (gain && ctx) {
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(v, now + rampSec);
      return;
    } catch { /* fallthrough */ }
  }
  if (audio) { try { audio.volume = Math.min(1, v); } catch { /* iOS 只读 */ } }
}

function ensureGraph(): void {
  if (!audio || gain) return;
  try {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx ?? new Ctor();
    const src = ctx.createMediaElementSource(audio);
    gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(ctx.destination);
  } catch {
    gain = null; // 接不进图：退回 .volume
  }
}

function stopPlayback(): void {
  if (audio) { try { audio.pause(); } catch { /* ignore */ } }
  if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } objectUrl = null; }
  currentId = null;
  notify();
}

/** 该放哪一首：按场景 → 槽位 → 兜底主页曲目 */
export async function resolveDesiredTrackId(s: Settings, theme: ThemeType, sc: BgmScene): Promise<string | null> {
  if (s.bgmEnabled === false) return null;
  const home = s.bgmHomeTrackIds?.[theme] || '';
  const battle = s.bgmBattleTrackId || home;
  const pick = sc === 'battle' ? battle : sc === 'boss' ? (s.bgmBossTrackId || battle) : sc === 'tower' ? (s.bgmTowerTrackId || home) : home;
  if (!pick) return null;
  try { return (await db.bgmTracks.get(pick)) ? pick : null; } catch { return null; }
}

/** 主循环：算出该放什么，和现在在放的不一样就换；该停就停。并发调用合并成一次 */
export function refreshBgm(): Promise<void> {
  if (refreshing) { pendingRefresh = true; return refreshing; }
  refreshing = (async () => {
    try { await refreshOnce(); } catch (e) { console.warn('[bgm] refresh failed', e); }
  })().finally(() => {
    refreshing = null;
    if (pendingRefresh) { pendingRefresh = false; void refreshBgm(); }
  });
  return refreshing;
}

async function refreshOnce(): Promise<void> {
  const st = useAppStore.getState();
  const s = st.settings;
  const theme = (st.user?.theme ?? 'blue') as ThemeType;
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const want = (!unlocked || hidden || holdRecording) ? null : await resolveDesiredTrackId(s, theme, scene);
  if (!want) {
    if (audio && !audio.paused) { try { audio.pause(); } catch { /* ignore */ } }
    if (want === null && (!unlocked || hidden || holdRecording)) { notify(); return; } // 只是暂时不该响：曲目留着，回来接着放
    stopPlayback();
    return;
  }
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.addEventListener('error', () => { console.warn('[bgm] 播放失败', audio?.error?.message); notify(); });
    audio.addEventListener('play', notify);
    audio.addEventListener('pause', notify);
  }
  if (currentId !== want) {
    const track = await db.bgmTracks.get(want);
    if (!track) { stopPlayback(); return; }
    if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } }
    objectUrl = URL.createObjectURL(track.blob);
    audio.src = objectUrl;
    currentId = want;
  }
  ensureGraph();
  if (ctx && ctx.state !== 'running') { try { await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 300))]); } catch { /* ignore */ } }
  applyGain(effectiveGain(s));
  if (audio.paused) {
    try { await audio.play(); } catch (e) { console.warn('[bgm] play() 被拒', e instanceof Error ? e.message : e); }
  }
  notify();
}

/** App 启动后调一次：订阅设置 / 主题变化、页面可见性、录音事件 */
export function initBgm(): void {
  if (inited) return;
  inited = true;
  let lastKey = '';
  useAppStore.subscribe((st) => {
    const s = st.settings;
    const key = JSON.stringify([s.bgmEnabled, s.bgmVolume, s.bgmBattleTrackId, s.bgmBossTrackId, s.bgmTowerTrackId, s.bgmHomeTrackIds, s.soundMuted, st.user?.theme]);
    if (key === lastKey) return;
    lastKey = key;
    void refreshBgm();
  });
  document.addEventListener('visibilitychange', () => { void refreshBgm(); });
  window.addEventListener('velvet-bgm-hold', (e) => { holdBgmForRecording(!!(e as CustomEvent).detail); });
  void refreshBgm();
}
