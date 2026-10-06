/**
 * BgmSettings —— 设置 → 主题 分区末尾的「导入音乐」块（第 13 轮 B 组 2.8），常态折叠。
 *
 * 导入（隐藏 file input）/ 曲目列表（试听 / 删除）/ 开关 / 音量（草稿值 + 松手落库）/
 * 战斗 · 爬塔 · 各主题主页的曲目选择 / 版权提示。曲目本体只在本机（utils/bgm）。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { Toggle } from '@/components/Toggle';
import type { BgmTrack, ThemeType } from '@/types';
import {
  BGM_MAX_TRACKS, bgmVolumeOf, getBgmState, importBgmTrack, listBgmTracks, previewBgmVolume, refreshBgm, removeBgmTrack, subscribeBgm, unlockBgm,
} from '@/utils/bgm';

const THEME_LABEL: Array<[ThemeType, string]> = [['blue', '蓝'], ['yellow', '黄'], ['red', '红'], ['pink', '粉'], ['custom', '自定义']];
const fmtSize = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

export function BgmSettings({ p5 }: { p5: boolean }) {
  const { settings, updateSettings } = useAppStore(useShallow(s => ({ settings: s.settings, updateSettings: s.updateSettings })));
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState<BgmTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volDraft, setVolDraft] = useState<number | null>(null);
  const [, bump] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const volume = bgmVolumeOf(settings);
  const shownVol = volDraft ?? volume;
  const enabled = settings.bgmEnabled !== false && tracks.length > 0;
  const playing = getBgmState();

  const reload = async () => setTracks(await listBgmTracks());
  useEffect(() => { void reload(); }, []);
  useEffect(() => subscribeBgm(() => bump(n => n + 1)), []);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      unlockBgm();
      await importBgmTrack(file);
      await reload();
      if (!settings.bgmNoticeSeen) void updateSettings({ bgmNoticeSeen: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = ''; // 选同一个文件也要能再触发
    }
  };
  const commitVolume = () => {
    const v = volDraft;
    setVolDraft(null);
    if (v != null && v !== volume) void updateSettings({ bgmVolume: v });
  };
  const nameOf = (id?: string) => tracks.find(t => t.id === id)?.name;
  const selectCls = 'min-w-0 flex-1 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200 outline-none';
  const TrackSelect = ({ value, onChange, allowFollow, followLabel }: { value: string; onChange: (v: string) => void; allowFollow?: boolean; followLabel?: string }) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
      <option value="">{allowFollow ? (followLabel ?? '跟随主页曲目') : '不放'}</option>
      {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );

  return (
    <div data-testid="bgm-settings">
      {/* 折叠头：与「关键词规则」同款 */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700/80 cursor-pointer text-left"
        aria-expanded={open}
      >
        {p5 ? (
          <span aria-hidden className="h-0 w-0 border-y-[6px] border-y-transparent border-l-[10px]" style={{ borderLeftColor: '#c00008' }} />
        ) : (
          <span aria-hidden className="text-gray-500 dark:text-gray-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d="M9 18V6l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
          </span>
        )}
        <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">导入音乐</h4>
        <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
          {tracks.length ? `${tracks.length} 首 · ${enabled ? (playing.playing ? '播放中' : '已开启') : '已关闭'}` : '本机 BGM'}
        </span>
        <motion.svg animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-1">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }} className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                把自己的音乐导进来当背景音：只在本机播放，不上云、不进备份，最多 {BGM_MAX_TRACKS} 首、单首 20 MB。
                请只导入你有权使用的音频；录屏或分享时注意版权。
              </p>

              {/* 导入 */}
              <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac" className="hidden" onChange={e => void onPick(e.target.files?.[0])} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy || tracks.length >= BGM_MAX_TRACKS}
                  onClick={() => { unlockBgm(); fileRef.current?.click(); }}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40"
                >
                  {busy ? '导入中…' : tracks.length >= BGM_MAX_TRACKS ? `已满 ${BGM_MAX_TRACKS} 首` : '导入音乐'}
                </button>
                {tracks.length > 0 && (
                  <div className="flex-1 flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-800 dark:text-white">播放</span>
                    <Toggle checked={settings.bgmEnabled !== false} onChange={(v) => { unlockBgm(); void updateSettings({ bgmEnabled: v }); }} aria-label="播放背景音乐" />
                  </div>
                )}
              </div>
              {error && <p className="text-xs text-rose-500">{error}</p>}

              {/* 曲目列表 */}
              {tracks.length > 0 && (
                <ul className="space-y-1.5" data-testid="bgm-tracks">
                  {tracks.map(t => {
                    const isPlaying = playing.playing && playing.trackId === t.id;
                    return (
                      <li key={t.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
                        <span className={`text-sm ${isPlaying ? 'text-primary' : 'text-gray-400'}`} aria-hidden>{isPlaying ? '♪' : '♩'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-800 dark:text-white truncate">{t.name}</div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">{fmtSize(t.size)}{isPlaying ? ' · 播放中' : ''}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { if (confirm(`删除「${t.name}」？`)) void removeBgmTrack(t.id).then(reload); }}
                          className="text-xs text-gray-400 hover:text-rose-500 px-2 py-1"
                          aria-label={`删除 ${t.name}`}
                        >
                          删除
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {tracks.length > 0 && (
                <>
                  {/* 音量 */}
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-800 dark:text-white">音乐音量</div>
                      <span className="text-xs font-semibold tabular-nums text-primary">{shownVol}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-base select-none">🎵</span>
                      <input
                        type="range" min={0} max={100} step={5} value={shownVol} aria-label="音乐音量"
                        onChange={(e) => { const v = Number(e.target.value); setVolDraft(v); previewBgmVolume(v); }}
                        onPointerUp={commitVolume} onTouchEnd={commitVolume}
                        onKeyUp={(e) => { if (/^Arrow|^Home$|^End$|^Page/.test(e.key)) commitVolume(); }}
                        onBlur={() => { if (volDraft != null) commitVolume(); }}
                        className="flex-1 h-1.5 appearance-none rounded-full bg-gray-200 dark:bg-gray-600 accent-primary cursor-pointer"
                        style={p5 ? ({ '--p5-range-fill': `${shownVol}%` } as CSSProperties) : undefined}
                      />
                      <span className="text-base select-none">🔊</span>
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">与音效音量各自独立；「静音模式」开着时音乐也静音。</p>
                  </div>

                  {/* 曲目分配 */}
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3 space-y-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">在哪里放哪首</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-gray-500 dark:text-gray-400">战斗</span>
                      <TrackSelect value={settings.bgmBattleTrackId ?? ''} onChange={v => void updateSettings({ bgmBattleTrackId: v })} allowFollow />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-gray-500 dark:text-gray-400">Boss 战</span>
                      <TrackSelect value={settings.bgmBossTrackId ?? ''} onChange={v => void updateSettings({ bgmBossTrackId: v })} allowFollow followLabel="跟随战斗曲目" />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-gray-500 dark:text-gray-400">爬塔</span>
                      <TrackSelect value={settings.bgmTowerTrackId ?? ''} onChange={v => void updateSettings({ bgmTowerTrackId: v })} allowFollow />
                    </div>
                    <div className="pt-1 text-[10px] text-gray-400 dark:text-gray-500">各主题的主页默认曲目</div>
                    {THEME_LABEL.map(([theme, label]) => (
                      <div key={theme} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-gray-500 dark:text-gray-400">{label}主题</span>
                        <TrackSelect
                          value={settings.bgmHomeTrackIds?.[theme] ?? ''}
                          onChange={v => void updateSettings({ bgmHomeTrackIds: { ...(settings.bgmHomeTrackIds ?? {}), [theme]: v } })}
                        />
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-400 dark:text-gray-500" data-testid="bgm-now">
                      {playing.playing && playing.trackId ? `正在播放：${nameOf(playing.trackId) ?? ''}` : enabled ? '现在没有在放（当前场景没选曲，或 App 在后台）' : '已关闭'}
                    </p>
                    <button type="button" onClick={() => { unlockBgm(); void refreshBgm(); }} className="text-[11px] text-primary font-semibold">没响？点一下重放</button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
