/**
 * TaskCardDefault — 24h 当前小步卡的通用表现层（兜底）。
 * 纯展示，保持频道化拆分前的原始观感；逻辑在 TerminalTaskCard 容器。
 */
import { motion } from 'motion/react';
import type { TaskCardVM } from './TerminalTaskCard';

export const TaskCardDefault = ({ vm }: { vm: TaskCardVM }) => {
  const { goalTitle, title, countdown, expired, elapsedFrac, busy, compact, onComplete, requestDismiss } = vm;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border-2 border-primary/50 bg-gradient-to-br from-primary/15 to-primary/[0.04] dark:from-primary/20 ${compact ? 'p-3.5' : 'p-4'}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
        <span className="text-[11px] font-bold tracking-wide text-primary">这一小步 · 24h</span>
        <span className={`ml-auto text-[11px] font-semibold tabular-nums ${expired ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'}`}>
          {countdown}
        </span>
      </div>

      {goalTitle && <div className="mb-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500">来自《{goalTitle}》</div>}
      <p className={`font-bold leading-snug text-gray-900 dark:text-white ${compact ? 'text-sm' : 'text-lg'}`}>{title}</p>

      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-primary/10">
        <div className={`h-full rounded-full ${expired ? 'bg-amber-400' : 'bg-primary'}`} style={{ width: `${Math.round(elapsedFrac * 100)}%` }} />
      </div>

      <div className="mt-3 flex gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onComplete}
          disabled={busy}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 disabled:opacity-60"
        >
          {busy ? '记下了…' : '我做到了'}
        </motion.button>
        <button
          type="button"
          onClick={requestDismiss}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
        >
          先放着
        </button>
      </div>
    </motion.div>
  );
};
