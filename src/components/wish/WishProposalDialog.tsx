/**
 * WishProposalDialog —— 黑猫在谈话里提议改愿望进度时的确认卡（PRD_V2.6 §8）。
 *
 * 用户的原话是「达到某个阈值后则会询问用户是否更新数值，这个操作同样不能频繁被错误触发」。
 * 这一句里有两条硬约束，都落在这里和 utils/navigatorWishProgress.ts：
 *   ① **询问**，不是替他改——所以这是 ConfirmDialog，不是一条 toast；
 *      拒绝路径和确认路径一样显眼，关掉窗 = 不改。
 *   ② **不能频繁误触**——闸门全在 navigatorWishProgress 那边（命中唯一愿望 + 努力信号词
 *      + 6 小时冷却 + 变化量 ≥ 8 个百分点 + 一轮只提一个 + 用户可整体关闭）。
 *      这里只负责：既然弹出来了，就把「凭什么」说清楚。
 *
 * 挂在 App 顶层，由 store.wishProposal 载荷驱动。
 */
import { useAppStore } from '@/store';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { WishRing } from './WishRing';
import { triggerLightHaptic } from '@/utils/feedback';

export function WishProposalDialog() {
  const proposal = useAppStore(s => s.wishProposal);
  const setWishProposal = useAppStore(s => s.setWishProposal);
  const setWishProgress = useAppStore(s => s.setWishProgress);

  const from = proposal?.fromPct;
  const to = proposal?.toPct ?? 0;
  const delta = to - (from ?? 0);

  return (
    <ConfirmDialog
      isOpen={!!proposal}
      title="要更新这个愿望的进度吗？"
      description={
        proposal
          ? `听你刚才说的，「${proposal.wishTitle}」好像比记录里更靠前了。`
          : undefined
      }
      icon={<span className="text-[26px] leading-none">✧</span>}
      confirmText="更新"
      cancelText="先不用"
      onConfirm={() => {
        if (!proposal) return;
        void setWishProgress(proposal.wishId, proposal.toPct, {
          reason: proposal.reason,
          source: 'agent',
        });
        triggerLightHaptic();
        setWishProposal(null);
      }}
      onCancel={() => setWishProposal(null)}
    >
      <div className="mt-2 flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
        <WishRing
          pct={to}
          size={48}
          strokeWidth={4}
          color="var(--color-primary)"
          track="rgba(148,163,184,0.35)"
        />
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[13px] font-black text-gray-800 dark:text-white tabular-nums">
            {typeof from === 'number' ? `${from}% → ${to}%` : `定为 ${to}%`}
            <span className="ml-1.5 text-[11px] text-primary">
              {delta > 0 ? `+${delta}` : delta}
            </span>
          </div>
          {proposal?.reason && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
              {proposal.reason}
            </p>
          )}
          <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
            不想被问可以在「设置 → 助手」里关掉主动提议。
          </p>
        </div>
      </div>
    </ConfirmDialog>
  );
}
