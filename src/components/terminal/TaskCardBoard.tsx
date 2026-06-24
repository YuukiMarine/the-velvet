/**
 * TaskCardBoard — 24h 限时任务卡的讨论板表现层：一个「置顶帖」。
 * 自带 BBS 窗口外观（固定深底），首页/终端通用、不依赖周围明暗。逻辑在 TerminalTaskCard。
 */
import { motion } from 'motion/react';
import { BevelWindow, BevelButton, INK_DIM } from './boardKit';
import type { TaskCardVM } from './TerminalTaskCard';

export const TaskCardBoard = ({ vm }: { vm: TaskCardVM }) => {
  const { goalTitle, title, countdown, expired, elapsedFrac, busy, compact, onComplete, requestDismiss } = vm;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <BevelWindow title="[置顶] 限时任务 · 24h" bodyClass={compact ? 'px-3 py-2.5' : 'px-3 py-3'}>
        <div className={compact ? 'text-[12px]' : 'text-[13px]'}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 bk-fg"><span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bk-bg" aria-hidden />进行中</span>
            <span className={`tabular-nums ${expired ? 'text-amber-400' : 'bk-fg'}`}>{countdown}</span>
          </div>
          {goalTitle && <div className="mt-1 truncate" style={{ color: INK_DIM }}>RE:《{goalTitle}》</div>}
          <p className={`mt-0.5 font-bold leading-snug ${compact ? 'text-sm' : 'text-base'}`}>{title}</p>

          <div className="mt-2 h-1 overflow-hidden bg-primary/15">
            <div className={`h-full ${expired ? 'bg-amber-400' : 'bk-bg'}`} style={{ width: `${Math.round(elapsedFrac * 100)}%` }} />
          </div>

          <div className="mt-2.5 flex gap-2">
            <BevelButton primary disabled={busy} onClick={onComplete} className="flex-1" ariaLabel="我做到了">{busy ? '记下了…' : '✓ 我做到了'}</BevelButton>
            <BevelButton onClick={requestDismiss} ariaLabel="放弃">放弃</BevelButton>
          </div>
        </div>
      </BevelWindow>
    </motion.div>
  );
};
