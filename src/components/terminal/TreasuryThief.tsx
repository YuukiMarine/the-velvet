/**
 * TreasuryThief — F3 怪盗（红）正文「启动素材库」可召唤抽屉。
 *
 * 把长期方向 / 卡住事项从首屏主体降为可召唤素材库：正文只留摘要面板，
 * 点开滑出右侧抽屉；终端从这些素材中抽一件，拆成当前一小步。
 *
 * 纯展示：所有逻辑（增删改 / AI 拆分 / 完成 / 折叠）由 Terminal.tsx 经 TreasuryVM 注入。
 * 用显式深色（不靠 dark: 变体），故与全局明暗无关；抽屉滑动尊重 bold 降级。
 */
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { zClass } from '@/utils/zIndex';
import { useBackHandler } from '@/utils/useBackHandler';
import { useModalA11y } from '@/utils/useModalA11y';
import { springSoft } from '@/utils/motion';
import { heavy, Halftone } from './thiefKit';
import { GoalArc } from './GoalArc';
import { MicroBurst } from './MicroBurst';
import type { AttributeId, Wish } from '@/types';

export interface TreasuryVM {
  goals: Wish[];
  subsByParent: Record<string, Wish[]>;
  collapsed: Set<string>;
  celebrateId: string | null;
  /** 正在播「标题划过 COMPLETE」特效的素材 id（全小步骤达成时） */
  celebrateGoalId: string | null;
  bold: boolean;
  hasAI: boolean;
  attrName: (id: AttributeId) => string;
  toggleCollapse: (id: string) => void;
  completeSub: (sub: Wish) => void;
  openEdit: (w: Wish) => void;
  openGoalEditor: () => void;
  openSubEditor: (parentId: string) => void;
  runAI: (goal: Wish) => void;
  setDeleteTarget: (w: Wish) => void;
}

// ── 正文内的召唤入口（摘要面板） ──
export const TreasuryTrigger = ({ goalsCount, done, total, onOpen }: { goalsCount: number; done: number; total: number; onOpen: () => void }) => (
  <motion.button
    type="button"
    whileTap={{ scale: 0.98 }}
    onClick={onOpen}
    aria-label="打开作战档案"
    className="relative mt-5 flex w-full items-center gap-3 overflow-hidden border-2 border-primary/60 bg-[#0d0d0d] px-4 py-3 text-left"
    style={{ boxShadow: '4px 5px 0 rgba(0,0,0,0.5)' }}
  >
    <Halftone className="absolute right-0 top-0 h-16 w-16 opacity-40" style={{ clipPath: 'polygon(45% 0,100% 0,100% 55%)' }} />
    <span className="text-2xl" aria-hidden>✦</span>
    <span className="relative min-w-0 flex-1">
      <span className="block text-sm font-black tracking-wide" style={heavy(1.5)}>作战档案</span>
      <span className="block text-[11px] text-white/55">{goalsCount} 个目标 · 已夺回 {done} / {total} 小步</span>
    </span>
    <span className="relative text-xs font-black tracking-widest text-primary">查看 ›</span>
  </motion.button>
);

// ── 怪盗化空状态（无目标时） ──
export const ThiefEmpty = ({ onCreate }: { onCreate: () => void }) => (
  <div className="relative overflow-hidden border-2 border-primary/50 bg-[#0d0d0d] px-6 py-10 text-center" style={{ boxShadow: '5px 6px 0 rgba(0,0,0,0.5)' }}>
    <Halftone className="absolute right-0 top-0 h-24 w-24 opacity-40" style={{ clipPath: 'polygon(45% 0,100% 0,100% 55%)' }} />
    <div className="relative mb-3 text-4xl" aria-hidden>✦</div>
    <h3 className="relative mb-2 text-lg font-black" style={heavy(2)}>现在最卡住你的，是什么？</h3>
    <p className="relative mx-auto mb-6 max-w-sm text-sm leading-relaxed text-white/60">
      先放进一件事。它不会变成新的压力，只会被终端拆成当下能做的一小步。
    </p>
    <button
      type="button"
      onClick={onCreate}
      className="relative border-2 border-black bg-primary px-6 py-2.5 text-sm font-black tracking-wider text-black"
      style={{ boxShadow: '3px 3px 0 #000' }}
    >
      写下第一件事
    </button>
  </div>
);

// 不规则四边形纸片轮廓（漫画分镜感）
const CARD_CLIP = 'polygon(0% 4%, 97% 0%, 100% 96%, 3% 100%)';
const dossierKind = (goal: Wish) => (goal.kind === 'pressure' ? 'PRESSURE' : 'WISH');

// ── 抽屉内单个素材卡（白纸 + 黑描边 + 不规则四边形 + 右上灰半调圆，漫画风） ──
const TreasureCard = ({ goal, vm }: { goal: Wish; vm: TreasuryVM }) => {
  const subs = vm.subsByParent[goal.id] ?? [];
  const doneCount = subs.filter((s) => s.status === 'done').length;
  const collapsed = vm.collapsed.has(goal.id);

  return (
    <div className="relative" style={{ filter: 'drop-shadow(4px 5px 0 rgba(0,0,0,0.55))' }}>
      {/* 黑描边底 + 白纸面（不规则四边形裁切） */}
      <div aria-hidden className="absolute -inset-[3px] bg-black" style={{ clipPath: CARD_CLIP }} />
      <div aria-hidden className="absolute inset-0 bg-white" style={{ clipPath: CARD_CLIP }} />
      {/* 右上灰色半调圆装饰 */}
      <Halftone className="absolute right-0 top-0 h-16 w-16" style={{ clipPath: 'circle(64% at 100% 0%)', opacity: 0.4 }} dot={1.1} gap={6} />

      <div className="relative px-3.5 py-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => vm.toggleCollapse(goal.id)}
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-gray-400 hover:text-gray-800"
            aria-label={collapsed ? '展开' : '收起'}
          >
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          {subs.length > 0 && <GoalArc done={doneCount} total={subs.length} trackClass="text-gray-300" />}
          <div className="min-w-0 flex-1">
            <div className="relative">
              <button type="button" onClick={() => vm.openEdit(goal)} className={`block w-full truncate text-left text-base font-black ${goal.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {goal.title}
              </button>
              {/* 全小步骤达成：COMPLETE 横幅划过标题 */}
              {vm.bold && vm.celebrateGoalId === goal.id && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-nowrap bg-primary px-1.5 text-sm font-black tracking-wider text-white"
                  initial={{ clipPath: 'inset(0 100% 0 0)' }}
                  animate={{ clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 100%)'] }}
                  transition={{ duration: 1.1, times: [0, 0.5, 1], ease: 'easeInOut' }}
                >
                  ✓ COMPLETE
                </motion.span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold tracking-wide text-gray-700">
              <span aria-hidden className="inline-block -rotate-3 border border-primary/70 px-1 text-[9px] tracking-[2px] text-primary">{dossierKind(goal)}</span>
              {subs.length > 0 ? `完成 ${doneCount} / ${subs.length}` : '还没有小步骤'}
            </div>
            {goal.currentState && <p className="mt-0.5 truncate text-[11px] font-bold text-gray-600">NOW: {goal.currentState}</p>}
            {goal.note && <p className="mt-0.5 text-xs text-gray-500">{goal.note}</p>}
          </div>
          <button type="button" onClick={() => vm.setDeleteTarget(goal)} className="shrink-0 p-1 text-gray-400 hover:text-red-500" aria-label="删除素材">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" /></svg>
          </button>
        </div>

        {!collapsed && (
          <div className="mt-3 space-y-1.5 pl-8">
            {subs.map((sub) => (
              <div key={sub.id} className="flex items-center gap-2">
                <span className="relative shrink-0">
                  <motion.button
                    type="button"
                    onClick={() => vm.completeSub(sub)}
                    whileTap={{ scale: 0.85 }}
                    animate={vm.celebrateId === sub.id ? { scale: [1, 1.35, 1] } : {}}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className={`flex h-5 w-5 items-center justify-center border-2 ${sub.status === 'done' ? 'border-primary bg-primary text-white' : 'border-gray-400 text-transparent'}`}
                    aria-label={sub.status === 'done' ? '标记未完成' : '标记完成'}
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </motion.button>
                  {vm.bold && vm.celebrateId === sub.id && <MicroBurst />}
                </span>
                <button type="button" onClick={() => vm.openEdit(sub)} className={`min-w-0 flex-1 truncate text-left text-sm ${sub.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {sub.title}
                  {sub.attribute && <span className="ml-1.5 bg-primary/15 px-1 py-0.5 text-[10px] font-medium text-primary">{vm.attrName(sub.attribute)}</span>}
                  {sub.source === 'ai' && <span className="ml-1 text-[10px] text-gray-400">AI</span>}
                </button>
                <button type="button" onClick={() => vm.setDeleteTarget(sub)} className="shrink-0 p-1 text-gray-400 hover:text-red-500" aria-label="删除小步骤">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => vm.openSubEditor(goal.id)} className="border-2 border-black px-3 py-1 text-xs font-bold text-gray-800 transition hover:bg-black hover:text-white">+ 小步骤</button>
              <button
                type="button"
                onClick={() => vm.runAI(goal)}
                disabled={!vm.hasAI}
                title={vm.hasAI ? undefined : '需先在「设置 → AI 总结」配置 API 密钥'}
                className="border-2 border-black px-3 py-1 text-xs font-bold text-gray-800 transition hover:bg-black hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-800"
              >
                ✦ AI 拆分{vm.hasAI ? '' : '（未配置）'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 抽屉 ──
export const TreasuryThief = ({ open, onClose, vm }: { open: boolean; onClose: () => void; vm: TreasuryVM }) => {
  const containerRef = useModalA11y(open, onClose, { closeOnEscape: true });
  useBackHandler(open, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.modal} flex justify-end bg-black/60 backdrop-blur-sm`}
          onClick={onClose}
        >
          <motion.aside
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label="作战档案"
            initial={vm.bold ? { x: '100%' } : { opacity: 0 }}
            animate={vm.bold ? { x: 0 } : { opacity: 1 }}
            exit={vm.bold ? { x: '100%' } : { opacity: 0 }}
            transition={vm.bold ? springSoft : { duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l-4 border-primary bg-[#0d0d0d]"
          >
            <Halftone className="absolute right-0 top-0 h-28 w-28 opacity-30" style={{ clipPath: 'polygon(45% 0,100% 0,100% 55%)' }} />

            {/* 抽屉头 */}
            <div className="relative flex items-center gap-2 border-b-2 border-primary/40 px-4 py-3">
              <span className="shrink-0 text-xl" aria-hidden>✦</span>
              <h2 className="min-w-0 flex-1 truncate text-lg font-black tracking-wide" style={heavy(2)}>作战档案</h2>
              <span className="hidden shrink-0 text-[10px] font-black tracking-[3px] text-primary/60 sm:inline">TARGET</span>
              <button
                type="button"
                onClick={vm.openGoalEditor}
                className="shrink-0 border-2 border-primary bg-primary px-3 py-1 text-xs font-black tracking-wide text-black"
                style={{ boxShadow: '2px 2px 0 #000' }}
              >
                + 登记目标
              </button>
              <button type="button" onClick={onClose} aria-label="关闭" className="flex h-8 w-8 shrink-0 items-center justify-center text-white/70 hover:text-primary">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* 目标卡列表 */}
            <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {vm.goals.map((goal) => (
                <TreasureCard key={goal.id} goal={goal} vm={vm} />
              ))}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
