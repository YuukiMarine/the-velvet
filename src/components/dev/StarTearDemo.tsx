/**
 * StarTearDemo —— 星形撕页转场的 DEV 演示触发器（仅 import.meta.env.DEV 挂载）。
 *
 * 真机上点「▶ 星形撕页」即可看 StarTearOverlay 实跑（真机 rAF 正常）；headless 预览
 * 里 rAF 冻结/零星跳帧、播放不可控，改用 window.__starTearTL.progress(x) 逐帧 scrub 出图。
 *
 * 演出后**停在揭示态不自动消失**：让人看清「新页盖上来了」，再点 ✕ 收回、可重放——
 * 比一闪即逝的真实转场更适合"先看效果"，也让逐帧 scrub 稳定（overlay 不被卸载）。
 * 这是隔离演示，暂不接真实导航；效果确认后再谈接进 setCurrentPage 转场。
 */
import { useCallback, useState } from 'react';
import { StarTearOverlay } from '@/components/transition/StarTearOverlay';
import { useAppStore } from '@/store';

/**
 * 被星形揭示的样板「新页」——用鲜亮渐变底 + 白字，刻意与黑色转场幕布拉满对比，
 * 这样星形撕开黑幕、露出亮色内容时撕裂边缘一眼可见（演示用配色，非真实页面）。
 */
const DemoNewPage = ({ onClose }: { onClose: () => void }) => (
  <div
    className="w-full h-full text-white flex flex-col"
    style={{
      background:
        'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 55%, #db2777 100%)',
    }}
  >
    <div className="px-6 pt-[calc(2rem+env(safe-area-inset-top))] pb-4 flex items-start justify-between">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.3em] text-white/80 uppercase">
          Transition
        </p>
        <h2 className="text-4xl font-black mt-1 drop-shadow">新页面 ✦</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="pointer-events-auto mt-1 w-9 h-9 rounded-full bg-black/25 text-white text-lg leading-none flex items-center justify-center active:scale-90 transition-transform"
        aria-label="关闭演示"
      >
        ✕
      </button>
    </div>
    <div className="flex-1 px-6 space-y-3">
      {['星形从重心撕开', '主题色条 -20° 斜扫', '黑条延迟 40ms 错缝', '逐点 morph 的撕裂感'].map((t, i) => (
        <div
          key={i}
          className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 flex items-center gap-3 backdrop-blur-sm"
        >
          <span className="w-8 h-8 rounded-xl bg-white/30 flex items-center justify-center text-sm font-bold">
            {i + 1}
          </span>
          <span className="text-sm text-white font-medium">{t}</span>
        </div>
      ))}
    </div>
  </div>
);

export const StarTearDemo = () => {
  const currentPage = useAppStore((s) => s.currentPage);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'revealed'>('idle');
  const handleComplete = useCallback(() => setPhase('revealed'), []);

  if (currentPage === 'terminal') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setPhase('playing')}
        className="fixed left-3 top-1/2 -translate-y-1/2 z-[260] rounded-full bg-gray-900/90 text-white text-xs font-semibold px-3 py-2 shadow-lg backdrop-blur-sm active:scale-95 transition-transform"
        style={{ writingMode: 'vertical-rl' }}
      >
        ▶ 星形撕页
      </button>

      <StarTearOverlay active={phase !== 'idle'} onComplete={handleComplete}>
        <DemoNewPage onClose={() => setPhase('idle')} />
      </StarTearOverlay>
    </>
  );
};
