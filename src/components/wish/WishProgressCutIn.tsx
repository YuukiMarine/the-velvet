/**
 * WishProgressCutIn —— 任务完成后的「离愿望又近了多少」弹窗（PRD_V2.6 §8）。
 *
 * 挂在 App 顶层，由 store.wishProgressCut 载荷驱动（同 BigDealClearCutIn 的形制）。
 * 为什么要单独一张卡而不是并进「今日完成」：那张卡回答的是"这件事做完了"，
 * 这张回答的是"那个远处的东西近了"——后者是愿望功能存在的全部理由，不能被前者吞掉。
 *
 * 四频道分派与庆祝四件套同源：
 *   · p5 → UnlockCutInP5（P5R 纸板不规则四边形；通用基座在红频道会渲染成一张绿卡）
 *   · p4 → CelebrationCutIn 的橙色贴纸圆，**内容层用墨色**——基座在 P4 下不给 children
 *          染白，沿用白字会变成橙底白字
 *   · p3 / 中性 → 基座默认白字
 *
 * delta=0 时照实说「这次没往前」——编一个假的涨幅比不弹还糟。
 */
import { useAppStore } from '@/store';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { UnlockCutInP5 } from '@/components/p5r/cutins';
import { useUiChannel } from '@/ui/useUiChannel';
import { WishRing } from './WishRing';
import { triggerSuccessFeedback } from '@/utils/feedback';

const deltaLabel = (d: number) => (d > 0 ? `+${d}%` : d < 0 ? `${d}%` : '持平');

export function WishProgressCutIn() {
  const payload = useAppStore(s => s.wishProgressCut);
  const clear = useAppStore(s => s.clearWishProgressCut);
  const channel = useUiChannel();

  const delta = payload?.delta ?? 0;
  const deltaText = deltaLabel(delta);
  const reason = payload?.reason
    ?? (delta > 0 ? '这一下是真的往前了。' : '这次没往前，但路还在脚下。');

  if (channel === 'p5') {
    return (
      <UnlockCutInP5
        isOpen={!!payload}
        onClose={clear}
        heading="又近了一步"
        name={payload?.wishTitle ?? ''}
        lines={[`离这个愿望 ${payload?.pct ?? 0}% · ${deltaText}`, reason]}
      />
    );
  }

  const isP4 = channel === 'p4';
  // P4 是橙底纸感贴纸，其余频道是深色渐变卡——两套完全相反的字色
  const ink = isP4 ? '#131313' : '#ffffff';
  const sub = isP4 ? 'rgba(19,19,19,0.68)' : 'rgba(255,255,255,0.85)';
  const faint = isP4 ? 'rgba(19,19,19,0.5)' : 'rgba(255,255,255,0.6)';

  return (
    <CelebrationCutIn
      isOpen={!!payload}
      onClose={clear}
      theme="emerald"
      icon={<span className="text-[38px] leading-none">✧</span>}
      title={payload?.wishTitle ?? ''}
      subtitle="离这个愿望"
      autoCloseMs={2600}
      particles={14}
      onShown={triggerSuccessFeedback}
    >
      <div className="mt-1 flex w-full items-center gap-3.5">
        <WishRing
          pct={payload?.pct ?? 0}
          size={64}
          strokeWidth={5}
          color={ink}
          track={isP4 ? 'rgba(19,19,19,0.2)' : 'rgba(255,255,255,0.28)'}
          ink={ink}
        />
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[22px] font-black leading-none tabular-nums" style={{ color: ink }}>
            {deltaText}
          </div>
          <p className="mt-1 text-[11px] font-bold leading-relaxed" style={{ color: sub }}>
            {reason}
          </p>
          <p className="mt-0.5 text-[10px] font-bold" style={{ color: faint }}>
            已完成相关任务 {payload?.times ?? 0} 次
            {payload?.source === 'local' && ' · 本地估算'}
          </p>
        </div>
      </div>
    </CelebrationCutIn>
  );
}
