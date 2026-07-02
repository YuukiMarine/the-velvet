/**
 * TaskCardTV — 24h 当前小步卡的 TV 表现层：一档「本期节目 · 倒计时」。
 * 自带综艺面板（黑底黄边），首页/终端通用。逻辑在 TerminalTaskCard。
 */
import { motion } from 'motion/react';
import { TVPanel, TVButton, RecDot } from './tvKit';
import type { TaskCardVM } from './TerminalTaskCard';

export const TaskCardTV = ({ vm }: { vm: TaskCardVM }) => {
  const { goalTitle, title, countdown, expired, elapsedFrac, busy, compact, bold, onComplete, requestDismiss } = vm;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <TVPanel title={<><RecDot size="h-1.5 w-1.5" bold={bold} />这一小步 · 24h</>} bodyClass={compact ? 'px-3 py-2.5' : 'px-3 py-3'}>
        <div className="flex items-center gap-2">
          {goalTitle && <span className="min-w-0 truncate text-[11px] text-white/55">来自《{goalTitle}》</span>}
          <span className={`ml-auto shrink-0 text-[11px] font-black tabular-nums ${expired ? 'text-amber-400' : 'text-primary'}`}>{countdown}</span>
        </div>
        <p className={`mt-0.5 font-black leading-snug text-white ${compact ? 'text-sm' : 'text-base'}`}>{title}</p>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full ${expired ? 'bg-amber-400' : 'bg-primary'}`} style={{ width: `${Math.round(elapsedFrac * 100)}%` }} />
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <TVButton disabled={busy} onClick={onComplete} ariaLabel="我做到了">{busy ? '记下了…' : '我做到了'}</TVButton>
          <TVButton primary={false} onClick={requestDismiss} ariaLabel="先放着">先放着</TVButton>
        </div>
      </TVPanel>
    </motion.div>
  );
};
