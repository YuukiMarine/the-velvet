/**
 * BigDealHomeCard — BIG DEAL 聚合卡（TASKS_MERGE_PRD §4.1 / D5）。
 *
 * 首页与任务页共用：只露总进度 + 未完成第一步，点击进二级面板（不在卡上直接打勾）。
 * channel 皮：p3=白斜面板+蓝 / p4=纸卡+黑描边 / p5=纸底+黑描边硬影 / plain=中性白卡。
 */
import { useRef } from 'react';
import { motion } from 'motion/react';
import { useLongPress } from '@/utils/useLongPress';
import { triggerLightHaptic } from '@/utils/feedback';
import { toLocalDateKey } from '@/store';
import type { Todo } from '@/types';

interface Props {
  todo: Todo;
  channel: 'p3' | 'p4' | 'p5' | 'plain';
  onOpen: () => void;
  /** 任务页管理入口（⋯ 长按菜单同源）；首页不传 */
  onMenu?: () => void;
}

export const BigDealHomeCard = ({ todo, channel, onOpen, onMenu }: Props) => {
  /**
   * 长按 = 唤出管理菜单（PRD_V2.6 反馈 §9）。
   * 卡上本来只有右上角一枚 ⋯ 按钮，而同列表里的**普通待办是长按出菜单**的
   * （§4.6 交互协议）——同一个列表两种手势，肌肉记忆对不上。
   * 现在两条路都通：⋯ 仍在（可发现性），长按补上（一致性）。
   * 长按触发后吞掉随后的 click，否则松手会顺带把二级面板也打开。
   */
  const suppressClickRef = useRef(false);
  const { pressing, bindings } = useLongPress(() => {
    if (!onMenu) return;
    suppressClickRef.current = true;
    triggerLightHaptic();
    onMenu();
  }, { durationMs: 480 });

  const steps = todo.steps ?? [];
  const done = steps.filter(s => s.done).length;
  const total = steps.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const next = steps.find(s => !s.done);

  const dlDays = todo.deadline
    ? Math.round((new Date(todo.deadline + 'T00:00:00').getTime() - new Date(toLocalDateKey() + 'T00:00:00').getTime()) / 86400000)
    : null;

  const p3 = channel === 'p3';
  const p4 = channel === 'p4';
  const p5 = channel === 'p5';

  const shell = p4
    ? 'relative w-full overflow-hidden rounded-[20px] bg-[var(--ui-paper,#fff7b0)] p-4 text-left'
    : p5
      ? 'relative w-full overflow-hidden border-[3px] border-[#050505] bg-[#f0e9df] p-4 text-left text-[#131313] shadow-[6px_6px_0_rgba(0,0,0,0.5)]'
      : p3
        ? 'relative w-full overflow-hidden p-4 text-left'
        : 'relative w-full overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm dark:border-gray-800 dark:bg-gray-900';

  const shellStyle = p3
    ? {
        background: 'var(--p3r-panel-glass, rgba(255,255,255,0.9))',
        clipPath: 'polygon(0 6%, 100% 0, 99% 100%, 1% 100%)',
        boxShadow: '0 10px 26px rgba(7,40,120,.12)',
      }
    : p4
      ? { boxShadow: '0 3px 0 rgba(19,19,19,0.12)' }
      : undefined;

  const ink = p3 ? 'text-[color:var(--p3r-ink,#0a1230)]' : p4 || p5 ? 'text-[#131313]' : 'text-gray-800 dark:text-white';
  const dim = p3 ? 'text-[color:var(--p3r-ink-soft,#8a97ad)]' : p4 || p5 ? 'text-[#131313]/55' : 'text-gray-400 dark:text-gray-500';
  const barTrack = p5 ? 'bg-[#131313]/15' : p4 ? 'bg-[#131313]/12' : p3 ? 'bg-[color:var(--p3r-track,#dcecf6)]' : 'bg-gray-200 dark:bg-gray-700';
  const barFill = p5 ? 'bg-[#c00008]' : p4 ? 'bg-[#131313]' : 'bg-primary';
  const tag = p5
    ? 'border-2 border-[#050505] bg-[#c00008] px-1.5 py-0.5 text-[9px] font-black uppercase text-white'
    : p4
      ? 'rounded-full border-2 border-[#131313] bg-[#131313] px-2 py-0.5 text-[9px] font-black uppercase text-[#ffe100]'
      : 'rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase text-primary';

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.985 }}
      animate={{ scale: pressing ? 0.97 : 1 }}
      transition={{ type: 'spring', damping: 24, stiffness: 320 }}
      {...(onMenu ? bindings : {})}
      onClick={() => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        onOpen();
      }}
      className={shell}
      style={shellStyle}
    >
      {/* 频道签名角饰 */}
      {p5 && <span aria-hidden className="pointer-events-none absolute -right-2 -top-2 text-4xl font-black opacity-10 select-none">◆</span>}
      {p3 && <span aria-hidden className="pointer-events-none absolute bottom-0 right-[8%] h-[8px] w-[18px]" style={{ background: 'var(--p3r-magenta, #f0417f)', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={tag}>BIG DEAL</span>
            {dlDays !== null && (
              <span className={`text-[10px] font-bold ${dlDays <= 2 ? 'text-red-500' : dim}`}>
                {dlDays > 0 ? `剩 ${dlDays} 天` : dlDays === 0 ? '今天截止' : '已过截止'}
              </span>
            )}
          </div>
          <h4 className={`mt-1 truncate text-[15px] font-black ${ink}`}>{todo.title}</h4>
        </div>
        {onMenu && (
          <span
            role="button"
            tabIndex={0}
            aria-label="管理这件大事"
            onClick={(e) => { e.stopPropagation(); onMenu(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onMenu(); } }}
            className={`shrink-0 rounded-full px-2 py-0.5 text-base font-black leading-none ${dim} hover:bg-black/5 dark:hover:bg-white/10`}
          >
            ⋯
          </span>
        )}
      </div>

      {/* 总进度条 */}
      <div className="mt-2.5">
        <div className={`mb-1 flex items-center justify-between text-[10px] ${dim}`}>
          <span>总进度</span>
          <span className="font-bold tabular-nums">{done}/{total}</span>
        </div>
        <div className={`h-1.5 overflow-hidden rounded-full ${barTrack}`}>
          <motion.div
            className={`h-full rounded-full ${barFill}`}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* 下一步预览（永远只亮一个入口） */}
      <div className={`mt-2 flex items-center gap-1.5 text-xs ${next ? ink : dim}`}>
        <span aria-hidden className={`h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent ${next ? '' : 'opacity-40'}`} style={{ borderLeftColor: p5 ? '#c00008' : p4 ? '#131313' : 'var(--color-primary)' }} />
        <span className="min-w-0 truncate font-bold">
          {total === 0 ? '去拆第一步' : next ? `下一步：${next.title}` : '全部完成——进去收官'}
        </span>
      </div>
    </motion.button>
  );
};
