/**
 * TaskCardThief — 24h 限时任务卡的怪盗（红）表现层：一张「预告状」。
 *
 * 自带深色背景（红黑斜块 + halftone），是一张「贴在页面上的预告状实体」，所以在
 * 暗房（终端正文）与亮色首页都成立、不依赖周围明暗。纯展示，倒计时/完成/放弃逻辑在
 * TerminalTaskCard 容器。
 */
import { motion } from 'motion/react';
import { heavy, Halftone, StrikeButton, GhostButton } from './thiefKit';
import type { TaskCardVM } from './TerminalTaskCard';

export const TaskCardThief = ({ vm }: { vm: TaskCardVM }) => {
  const { goalTitle, title, countdown, expired, elapsedFrac, busy, compact, onComplete, requestDismiss } = vm;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden border-2 border-primary bg-[#0d0d0d] ${compact ? 'p-3.5' : 'p-4'}`}
      style={{ boxShadow: '5px 6px 0 rgba(0,0,0,0.5)' }}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primary" />
      <Halftone className="absolute right-0 top-0 h-20 w-20 opacity-35" style={{ clipPath: 'polygon(45% 0,100% 0,100% 55%)' }} />

      {/* 预告状头 */}
      <div className="relative mb-1.5 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
        <span className="text-[11px] font-black tracking-[2px]" style={heavy(1.5)}>预告状 · 潜入限时</span>
        <span className={`ml-auto text-[11px] font-black tabular-nums ${expired ? 'text-amber-400' : 'text-primary'}`}>{countdown}</span>
      </div>

      {goalTitle && <div className="relative mb-0.5 truncate text-[11px] text-white/55">为了夺回《{goalTitle}》</div>}
      <p className={`relative font-black leading-snug text-white ${compact ? 'text-sm' : 'text-lg'}`} style={compact ? undefined : heavy(2)}>{title}</p>

      {/* 时间细条 */}
      <div className="relative mt-2.5 h-1 overflow-hidden bg-primary/15">
        <div className={`h-full ${expired ? 'bg-amber-400' : 'bg-primary'}`} style={{ width: `${Math.round(elapsedFrac * 100)}%` }} />
      </div>

      <div className="relative mt-3 flex items-center gap-2">
        <StrikeButton label={busy ? '记下了…' : '夺回'} onClick={onComplete} disabled={busy} mask live={!compact} className="flex-1" />
        <GhostButton label="放弃" onClick={requestDismiss} />
      </div>
    </motion.div>
  );
};
