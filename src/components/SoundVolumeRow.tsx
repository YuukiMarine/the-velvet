/**
 * SoundVolumeRow —— 设置 → 颜色与声音 → 「音量大小」（第 13 轮抽出来）。
 *
 * 三件事：
 *   · 拖动期间用草稿值画滑块（原来受控值在异步写库期间会回跳）；
 *   · 松手 / 键盘松开才落库，并按新音量播一声试听（拖到哪听到哪）；
 *   · 下面一行小字写当前音效走的通道（Web Audio 缓冲 / 元素+增益 / 裸元素）——
 *     iOS 用户截个图就能看出是不是掉进了「音量不可调」的那条路。
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { getSoundPipelineInfo, playVolumePreview, type SoundPipelineInfo } from '@/utils/feedback';

const LAST_PLAYED_LABEL: Record<NonNullable<SoundPipelineInfo['lastPlayed']>, string> = {
  'buffer': 'Web Audio 缓冲（音量可调）',
  'element+gain': '原生播放 + 增益（音量可调）',
  'element': '原生播放（本机音量不可调）',
};

export function SoundVolumeRow({ p5 }: { p5: boolean }) {
  const { volume, updateSettings } = useAppStore(useShallow(s => ({ volume: s.settings.soundVolume ?? 80, updateSettings: s.updateSettings })));
  const [draft, setDraft] = useState<number | null>(null);
  const [info, setInfo] = useState<SoundPipelineInfo>(() => getSoundPipelineInfo());
  const shown = draft ?? volume;

  // 试听后半秒刷新一次通道信息（播放是异步的，走哪条路要等它跑完才知道）
  useEffect(() => {
    const t = window.setTimeout(() => setInfo(getSoundPipelineInfo()), 700);
    return () => window.clearTimeout(t);
  }, [volume]);

  const commit = () => {
    const v = draft;
    setDraft(null);
    if (v == null || v === volume) { if (v != null) playVolumePreview(v); return; }
    void updateSettings({ soundVolume: v });
    playVolumePreview(v);
  };

  const pipelineText = !info.webAudio && info.lastPlayed === null
    ? '音效通道：还没播过音效'
    : info.lastPlayed
      ? `音效通道：${LAST_PLAYED_LABEL[info.lastPlayed]}${info.fallbacks > 0 ? ` · 降级 ${info.fallbacks} 次` : ''}`
      : `音效通道：${info.webAudio ? 'Web Audio 就绪' : '无 AudioContext'}`;

  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-800 dark:text-white">音量大小</div>
        <span className="text-xs font-semibold tabular-nums text-primary">{shown}%</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-base select-none">🔈</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={shown}
          aria-label="音量大小"
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={commit}
          onTouchEnd={commit}
          onKeyUp={(e) => { if (/^Arrow|^Home$|^End$|^Page/.test(e.key)) commit(); }}
          onBlur={() => { if (draft != null) commit(); }}
          className="flex-1 h-1.5 appearance-none rounded-full bg-gray-200 dark:bg-gray-600 accent-primary cursor-pointer"
          // p5 毯式滑杆：红/黑双色轨的分界位跟随当前值
          style={p5 ? ({ '--p5-range-fill': `${shown}%` } as CSSProperties) : undefined}
        />
        <span className="text-base select-none">🔊</span>
      </div>
      <p className="text-[10px] leading-relaxed text-gray-400 dark:text-gray-500" data-testid="sound-pipeline">
        松手会响一声试听 · {pipelineText}
        {info.lastFallback && info.fallbacks > 0 ? `（最近：${info.lastFallback.reason}）` : ''}
      </p>
    </div>
  );
}
