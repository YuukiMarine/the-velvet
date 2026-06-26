/**
 * TreasuryTV — 心之宝物殿的 TV（黄）表现层：综艺「节目单」抽屉。
 *
 * 愿望清单 = 节目单：每个终极目标是一档「节目」，子愿望是「环节」。从右滑出，综艺面板外观。
 * 逻辑经 TreasuryVM 注入。
 */
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { zClass } from '@/utils/zIndex';
import { useBackHandler } from '@/utils/useBackHandler';
import { useModalA11y } from '@/utils/useModalA11y';
import { springSoft } from '@/utils/motion';
import { MicroBurst } from './MicroBurst';
import { GoalArc } from './GoalArc';
import { TVButton } from './tvKit';
import type { TreasuryVM } from './TreasuryThief';
import type { Wish } from '@/types';

// 正文召唤入口（节目单摘要）
export const TreasuryTriggerTV = ({ goalsCount, done, total, onOpen }: { goalsCount: number; done: number; total: number; onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label="打开节目单"
    style={{ boxShadow: '0 4px 0 #000' }}
    className="mt-5 flex w-full items-center gap-2 overflow-hidden border-2 border-primary bg-[#0a0a06] px-4 py-3 text-left"
  >
    <span className="text-base text-primary" aria-hidden>▶</span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-black text-white">本季节目单</span>
      <span className="block text-[11px] text-white/55">{goalsCount} 档节目 · 已通关 {done} / {total} 关</span>
    </span>
    <span className="text-xs font-black tracking-widest text-primary">翻开 ▸</span>
  </button>
);

// 空状态
export const TVEmpty = ({ onCreate }: { onCreate: () => void }) => (
  <div style={{ boxShadow: '0 4px 0 #000' }} className="overflow-hidden border-2 border-primary bg-[#0a0a06] px-6 py-9 text-center">
    <div className="mb-2 text-3xl" aria-hidden>▶</div>
    <h3 className="mb-2 text-base font-black text-white">节目单还空着</h3>
    <p className="mx-auto mb-5 max-w-sm text-sm leading-relaxed text-white/65">
      先排一档「节目」——你最想成为/做到的方向。之后让导播替你拆成一关关的环节。
    </p>
    <div className="flex justify-center"><TVButton onClick={onCreate} ariaLabel="排第一档节目">＋ 排第一档节目</TVButton></div>
  </div>
);

// 单档节目卡
const EpisodeCard = ({ goal, vm }: { goal: Wish; vm: TreasuryVM }) => {
  const subs = vm.subsByParent[goal.id] ?? [];
  const doneCount = subs.filter((s) => s.status === 'done').length;
  const collapsed = vm.collapsed.has(goal.id);

  return (
    <div className="relative overflow-hidden border-2 border-primary/70 bg-[#0a0a06]" style={{ boxShadow: '0 3px 0 #000' }}>
      {/* 标题条 */}
      <div className="relative flex items-center gap-1.5 bg-primary px-2 py-1 text-[11px] font-black text-black">
        <button type="button" onClick={() => vm.toggleCollapse(goal.id)} className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70" aria-label={collapsed ? '展开' : '收起'}>{collapsed ? '▸' : '▾'}</button>
        <button type="button" onClick={() => vm.openEdit(goal)} className={`min-w-0 flex-1 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70 ${goal.status === 'done' ? 'line-through opacity-70' : ''}`}>{goal.title}</button>
        <button type="button" onClick={() => vm.setDeleteTarget(goal)} className="shrink-0 px-0.5 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70" aria-label="删除节目">✕</button>
        {vm.bold && vm.celebrateGoalId === goal.id && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-nowrap bg-black px-2 text-sm font-black tracking-wider text-primary"
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 100%)'] }}
            transition={{ duration: 1.1, times: [0, 0.5, 1], ease: 'easeInOut' }}
          >
            ★ 全部通关 ★
          </motion.span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {subs.length > 0 && <GoalArc done={doneCount} total={subs.length} size={34} trackClass="text-white/25" />}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-black text-primary">{subs.length > 0 ? `已通关 ${doneCount} / ${subs.length} 关` : '尚无环节'}</div>
            {goal.note && <p className="mt-0.5 truncate text-[11px] text-white/45">{goal.note}</p>}
          </div>
        </div>

        {!collapsed && (
          <div className="mt-2.5 space-y-1.5">
            {subs.map((sub) => (
              <div key={sub.id} className="flex items-center gap-2">
                <span className="relative shrink-0">
                  <motion.button
                    type="button"
                    onClick={() => vm.completeSub(sub)}
                    whileTap={{ scale: 0.85 }}
                    animate={vm.celebrateId === sub.id ? { scale: [1, 1.35, 1] } : {}}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className={`flex h-5 w-5 items-center justify-center rounded-sm border-2 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${sub.status === 'done' ? 'border-primary bg-primary text-black' : 'border-white/40 text-transparent'}`}
                    aria-label={sub.status === 'done' ? '标记未完成' : '标记完成'}
                  >
                    ✓
                  </motion.button>
                  {vm.bold && vm.celebrateId === sub.id && <MicroBurst />}
                </span>
                <button type="button" onClick={() => vm.openEdit(sub)} className={`min-w-0 flex-1 truncate text-left text-sm ${sub.status === 'done' ? 'text-white/40 line-through' : 'text-white/85'}`}>
                  {sub.title}
                  {sub.attribute && <span className="ml-1.5 rounded-sm bg-primary px-1 text-[10px] font-bold text-black">{vm.attrName(sub.attribute)}</span>}
                  {sub.source === 'ai' && <span className="ml-1 text-[10px] text-white/35">AI</span>}
                </button>
                <button type="button" onClick={() => vm.setDeleteTarget(sub)} className="shrink-0 px-1 text-xs text-white/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="删除环节">✕</button>
              </div>
            ))}

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => vm.openSubEditor(goal.id)} className="rounded-full border-2 border-primary px-3 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">＋ 环节</button>
              <button type="button" onClick={() => vm.runAI(goal)} disabled={!vm.hasAI} title={vm.hasAI ? undefined : '需先在「设置 → AI 总结」配置 API 密钥'} className="rounded-full border-2 border-primary px-3 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                ✦ AI 拆分{vm.hasAI ? '' : '（未配置）'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const TreasuryTV = ({ open, onClose, vm }: { open: boolean; onClose: () => void; vm: TreasuryVM }) => {
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
            aria-label="本季节目单"
            initial={vm.bold ? { x: '100%' } : { opacity: 0 }}
            animate={vm.bold ? { x: 0 } : { opacity: 1 }}
            exit={vm.bold ? { x: '100%' } : { opacity: 0 }}
            transition={vm.bold ? springSoft : { duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l-4 border-primary bg-[#0a0a06]"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 1px, transparent 1px, transparent 3px)' }} />

            {/* 标题栏 */}
            <div className="relative flex items-center gap-2 bg-primary px-3 py-1.5 text-sm font-black tracking-wider text-black">
              <span>▶ 本季节目单</span>
              <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto px-1 hover:opacity-70">✕</button>
            </div>

            {/* 工具条 */}
            <div className="relative flex items-center gap-2 border-b-2 border-primary/40 px-3 py-2">
              <TVButton onClick={vm.openGoalEditor} ariaLabel="排新节目" className="!px-4 !py-1 text-xs">＋ 排新节目</TVButton>
              <span className="text-[11px] text-white/55">{vm.goals.length} 档节目</span>
            </div>

            {/* 节目卡列表 */}
            <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {vm.goals.map((goal) => (
                <EpisodeCard key={goal.id} goal={goal} vm={vm} />
              ))}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
