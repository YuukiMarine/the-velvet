/**
 * TerminalTaskCard — F3 短路决策落成的 24h 限时任务卡（Batch 3）。
 *
 * 复用 CallingCard 数据（card.terminal 元数据），但自带「小时级倒计时 + 我做到了 + 放弃」，
 * 区别于普通宣告卡（天级、无完成按钮）。首页与终端页共用，首页传 compact。
 *
 * 设计：24h 是温柔的限时而非硬门——过期后仍可「我做到了」（完成永远不晚），
 * 仅倒计时显示「时限已过」。完成走 store.completeTerminalTask。
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { CallingCard } from '@/types';

interface Props {
  card: CallingCard;
  onComplete: () => void | Promise<void>;
  onDismiss: () => void;
  compact?: boolean;
}

export const TerminalTaskCard = ({ card, onComplete, onDismiss, compact }: Props) => {
  const t = card.terminal;
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!t) return null;

  const handleComplete = async () => {
    if (busy) return; // 防双击重入（store 侧另有在途锁兜底）
    setBusy(true);
    try {
      await onComplete();
    } finally {
      setBusy(false);
    }
  };

  const startTs = new Date(t.startedAt).getTime();
  const expireTs = new Date(t.expiresAt).getTime();
  const remaining = expireTs - nowTs;
  const expired = remaining <= 0;
  const hours = Math.floor(remaining / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60_000);
  const countdown = expired
    ? '时限已过 · 完成永远不晚'
    : hours > 0
      ? `还剩 ${hours} 小时 ${mins} 分`
      : `还剩 ${mins} 分`;
  // 时间进度（已过 / 24h），仅作氛围，不参与完成判定
  const elapsedFrac = Math.min(1, Math.max(0, (nowTs - startTs) / (expireTs - startTs || 1)));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border-2 border-primary/50 bg-gradient-to-br from-primary/15 to-primary/[0.04] dark:from-primary/20 ${compact ? 'p-3.5' : 'p-4'}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
        <span className="text-[11px] font-bold tracking-wide text-primary">限时任务 · 24h</span>
        <span className={`ml-auto text-[11px] font-semibold tabular-nums ${expired ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {countdown}
        </span>
      </div>

      {t.goalTitle && (
        <div className="mb-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500">为了《{t.goalTitle}》</div>
      )}
      <p className={`font-bold leading-snug text-gray-900 dark:text-white ${compact ? 'text-sm' : 'text-lg'}`}>
        {card.title}
      </p>

      {/* 时间细条 */}
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-primary/10">
        <div
          className={`h-full rounded-full ${expired ? 'bg-amber-400' : 'bg-primary'}`}
          style={{ width: `${Math.round(elapsedFrac * 100)}%` }}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={handleComplete}
          disabled={busy}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 disabled:opacity-60"
        >
          {busy ? '记下了…' : '我做到了'}
        </motion.button>
        <button
          type="button"
          onClick={() => setConfirmDismiss(true)}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
        >
          放弃
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirmDismiss}
        tone="warning"
        title="放弃这一步？"
        description="它会被丢掉，但你随时可以再来终端拣一件。"
        confirmText="放弃"
        cancelText="再想想"
        onConfirm={() => { setConfirmDismiss(false); onDismiss(); }}
        onCancel={() => setConfirmDismiss(false)}
      />
    </motion.div>
  );
};
