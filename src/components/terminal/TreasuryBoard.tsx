/**
 * TreasuryBoard — 心之宝物殿的讨论板（蓝/粉/自定义）表现层：BBS「我的主题板」抽屉。
 *
 * 愿望清单 = 帖子板块：每个终极目标是一个「主题帖」，子愿望是「回复」。从右滑出，
 * 老式窗口外观、固定深底 + 浅墨文字（自定义任意 primary 仍可读）。逻辑经 TreasuryVM 注入。
 */
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { zClass } from '@/utils/zIndex';
import { useBackHandler } from '@/utils/useBackHandler';
import { useModalA11y } from '@/utils/useModalA11y';
import { springSoft } from '@/utils/motion';
import { MicroBurst } from './MicroBurst';
import { BevelButton, MONO, PANEL, INK, INK_DIM } from './boardKit';
import type { TreasuryVM } from './TreasuryThief';
import type { Wish } from '@/types';

const bar = (done: number, total: number) => {
  const filled = total > 0 ? Math.round((done / total) * 5) : 0;
  return '■'.repeat(filled) + '□'.repeat(Math.max(0, 5 - filled));
};

// 正文召唤入口（摘要面板）
export const TreasuryTriggerBoard = ({ goalsCount, done, total, onOpen }: { goalsCount: number; done: number; total: number; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label="打开我的主题板"
    style={{ fontFamily: MONO, background: PANEL, border: '2px solid', borderColor: 'color-mix(in srgb, var(--color-primary) 70%, #fff) var(--color-primary) var(--color-primary) color-mix(in srgb, var(--color-primary) 70%, #fff)', boxShadow: '4px 5px 0 rgba(0,0,0,0.5)' }}
    className="mt-5 flex w-full items-center gap-2 px-3 py-2.5 text-left"
  >
    <span className="text-base bk-fg" aria-hidden>▣</span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-bold" style={{ color: INK }}>我的主题板</span>
      <span className="block text-[11px]" style={{ color: INK_DIM }}>{goalsCount} 个主题 · 已夺回 {done} / {total} 楼</span>
    </span>
    <span className="text-xs font-bold tracking-widest bk-fg">打开 »</span>
  </button>
);

// 空状态
export const BoardEmpty = ({ onCreate }: { onCreate: () => void }) => (
  <div style={{ fontFamily: MONO, background: PANEL, border: '2px solid', borderColor: 'color-mix(in srgb, var(--color-primary) 70%, #fff) var(--color-primary) var(--color-primary) color-mix(in srgb, var(--color-primary) 70%, #fff)', boxShadow: '5px 6px 0 rgba(0,0,0,0.5)' }} className="px-6 py-9 text-center">
    <div className="mb-2 text-3xl" aria-hidden>▣</div>
    <h3 className="mb-2 text-base font-bold" style={{ color: INK }}>板块还空着</h3>
    <p className="mx-auto mb-5 max-w-sm text-sm leading-relaxed" style={{ color: INK_DIM }}>
      先发一个「主题帖」——你最想成为/做到的方向。之后让终端替你拆成够得着的回复。
    </p>
    <div className="flex justify-center"><BevelButton primary onClick={onCreate} ariaLabel="立第一个主题">+ 立第一个主题</BevelButton></div>
  </div>
);

// 单个主题帖
const Thread = ({ goal, vm }: { goal: Wish; vm: TreasuryVM }) => {
  const subs = vm.subsByParent[goal.id] ?? [];
  const doneCount = subs.filter((s) => s.status === 'done').length;
  const collapsed = vm.collapsed.has(goal.id);

  return (
    <div style={{ background: '#0c1320', border: '1px solid color-mix(in srgb, var(--color-primary) 50%, transparent)' }} className="px-2.5 py-2">
      <div className="flex items-start gap-1.5">
        <button type="button" onClick={() => vm.toggleCollapse(goal.id)} className="mt-0.5 shrink-0 bk-fg" aria-label={collapsed ? '展开' : '收起'}>
          <span className="inline-block w-3 text-center text-xs">{collapsed ? '+' : '−'}</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="relative">
            <button type="button" onClick={() => vm.openEdit(goal)} className={`block w-full truncate text-left text-sm font-bold ${goal.status === 'done' ? 'line-through' : ''}`} style={{ color: goal.status === 'done' ? INK_DIM : INK }}>
              ▸ {goal.title}
            </button>
            {vm.bold && vm.celebrateGoalId === goal.id && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-nowrap bg-primary px-1.5 text-sm font-black tracking-wider text-white"
                initial={{ clipPath: 'inset(0 100% 0 0)' }}
                animate={{ clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 100%)'] }}
                transition={{ duration: 1.1, times: [0, 0.5, 1], ease: 'easeInOut' }}
              >
                ✓ 已完结
              </motion.span>
            )}
          </div>
          {goal.note && <p className="mt-0.5 truncate text-[11px]" style={{ color: INK_DIM }}>{goal.note}</p>}
          <div className="mt-0.5 text-[11px] font-bold tracking-wide bk-fg">
            <span aria-hidden>[{bar(doneCount, subs.length)}]</span> {subs.length > 0 ? `已夺回 ${doneCount}/${subs.length}` : '尚无回复'}
          </div>
        </div>
        <button type="button" onClick={() => vm.setDeleteTarget(goal)} className="shrink-0 px-1 text-xs bk-fg" aria-label="删除主题">✕</button>
      </div>

      {!collapsed && (
        <div className="mt-2 space-y-1 pl-4">
          {subs.map((sub) => (
            <div key={sub.id} className="flex items-center gap-1.5">
              <span className="relative shrink-0">
                <motion.button
                  type="button"
                  onClick={() => vm.completeSub(sub)}
                  whileTap={{ scale: 0.85 }}
                  animate={vm.celebrateId === sub.id ? { scale: [1, 1.35, 1] } : {}}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`flex h-4 w-4 items-center justify-center border text-[10px] ${sub.status === 'done' ? 'border-primary bk-bg text-white' : 'bk-bd text-transparent'}`}
                  aria-label={sub.status === 'done' ? '标记未完成' : '标记完成'}
                >
                  ✓
                </motion.button>
                {vm.bold && vm.celebrateId === sub.id && <MicroBurst />}
              </span>
              <button type="button" onClick={() => vm.openEdit(sub)} className={`min-w-0 flex-1 truncate text-left text-[13px] ${sub.status === 'done' ? 'line-through' : ''}`} style={{ color: sub.status === 'done' ? INK_DIM : INK }}>
                {sub.title}
                {sub.attribute && <span className="ml-1 bg-primary/20 px-1 text-[10px] bk-fg">{vm.attrName(sub.attribute)}</span>}
                {sub.source === 'ai' && <span className="ml-1 text-[10px] bk-fg">AI</span>}
              </button>
              <button type="button" onClick={() => vm.setDeleteTarget(sub)} className="shrink-0 px-1 text-[11px] bk-fg" aria-label="删除回复">✕</button>
            </div>
          ))}

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <button type="button" onClick={() => vm.openSubEditor(goal.id)} className="border bk-bd px-2 py-0.5 text-[11px] font-bold bk-fg hover:bg-primary/10">+ 回复</button>
            <button type="button" onClick={() => vm.runAI(goal)} disabled={!vm.hasAI} title={vm.hasAI ? undefined : '需先在「设置 → AI 总结」配置 API 密钥'} className="border bk-bd px-2 py-0.5 text-[11px] font-bold bk-fg hover:bg-primary/10 disabled:opacity-40">
              ✦ AI 拆分{vm.hasAI ? '' : '（未配置）'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const TreasuryBoard = ({ open, onClose, vm }: { open: boolean; onClose: () => void; vm: TreasuryVM }) => {
  const containerRef = useModalA11y(open, onClose, { closeOnEscape: true });
  useBackHandler(open, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`fixed inset-0 ${zClass.modal} flex justify-end bg-black/60 backdrop-blur-sm`} onClick={onClose}>
          <motion.aside
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label="我的主题板"
            initial={vm.bold ? { x: '100%' } : { opacity: 0 }}
            animate={vm.bold ? { x: 0 } : { opacity: 1 }}
            exit={vm.bold ? { x: '100%' } : { opacity: 0 }}
            transition={vm.bold ? springSoft : { duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-full w-full max-w-md flex-col overflow-hidden"
            style={{ fontFamily: MONO, background: PANEL, borderLeft: '3px solid var(--color-primary)' }}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-3 py-1.5 text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>
              <span className="truncate tracking-wide">▓ treasure.bbs · 我的主题板</span>
              <span className="ml-2 flex shrink-0 items-center gap-1 text-white/90">
                <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none">_</span>
                <span aria-hidden className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none">□</span>
                <button type="button" onClick={onClose} aria-label="关闭" className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none hover:bg-white/20">✕</button>
              </span>
            </div>

            {/* 工具条 */}
            <div className="flex items-center gap-2 border-b border-primary/30 px-3 py-2">
              <BevelButton primary onClick={vm.openGoalEditor} ariaLabel="立新主题">+ 立新主题</BevelButton>
              <span className="text-[11px]" style={{ color: INK_DIM }}>{vm.goals.length} 个主题</span>
            </div>

            {/* 主题帖列表 */}
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {vm.goals.map((goal) => (
                <Thread key={goal.id} goal={goal} vm={vm} />
              ))}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
