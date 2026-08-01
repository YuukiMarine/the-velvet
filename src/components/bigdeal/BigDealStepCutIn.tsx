/**
 * BIG DEAL 子步完成的短弹窗（PRD_V2.6 §2.2）。
 *
 * 位置：二级面板里勾掉一个子步时。此前那里只有一声 triggerSuccessFeedback，
 * 没有任何视觉——而这恰恰是最需要"看见自己在推进"的时刻。
 *
 * 与末步的 BigDealClearCutIn 分工：
 *   · 本件 = 过程反馈，短（2.2s 自动关）、轻（粒子减半）、只回答一个问题「整件事推到哪了」；
 *   · BigDealClearCutIn = 收官大戏，留给全成那一下。
 *
 * 形态照用户口径改自成就解锁弹窗（CelebrationCutIn 基座）：
 *   · **不显示等级/LV**——这里跟属性等级无关，出现 LV 只会误导；
 *   · 比成就弹窗短：去掉长描述段，只留「第 N / M 步」+ 进度条；
 *   · 全局变暗由基座的 backdrop 提供。
 */
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { triggerSuccessFeedback } from '@/utils/feedback';

export interface BigDealStepCutInPayload {
  /** 大事标题 */
  dealTitle: string;
  /** 刚完成的子步标题 */
  stepTitle: string;
  done: number;
  total: number;
}

export function BigDealStepCutIn({
  payload,
  onClose,
}: {
  payload: BigDealStepCutInPayload | null;
  onClose: () => void;
}) {
  const pct = payload ? Math.round((payload.done / Math.max(1, payload.total)) * 100) : 0;
  return (
    <CelebrationCutIn
      isOpen={!!payload}
      onClose={onClose}
      theme="violet"
      icon={<span className="text-[40px] leading-none">◆</span>}
      title={payload?.stepTitle ?? ''}
      subtitle={payload ? `大事「${payload.dealTitle}」` : undefined}
      autoCloseMs={2200}
      particles={12}
      onShown={triggerSuccessFeedback}
    >
      <div className="mt-1 w-full">
        <div className="flex items-baseline justify-between text-xs font-bold text-white/80">
          <span>整件事的进度</span>
          <span className="tabular-nums">第 {payload?.done ?? 0} / {payload?.total ?? 0} 步</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </CelebrationCutIn>
  );
}
