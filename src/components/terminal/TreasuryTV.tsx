/**
 * TreasuryTV — 启动素材库的 TV（黄）表现层。
 *
 * 素材库 = 方向 / 卡住事项 + 小步骤。从右滑出，保留综艺面板外观。
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
import { Marquee, TVButton } from './tvKit';
import type { TreasuryVM } from './TreasuryThief';
import type { Wish } from '@/types';
import { useBoldness } from '@/utils/boldness';

const episodeKind = (goal: Wish) => (goal.kind === 'pressure' ? '压力特辑' : '愿望连载');

// 正文召唤入口（素材库摘要）
export const TreasuryTriggerTV = ({ goalsCount, done, total, onOpen }: { goalsCount: number; done: number; total: number; onOpen: () => void }) => {
  const bold = useBoldness();
  const posts = [
    `${goalsCount}，加油`,
    '第一步真是又难又轻松，继续播出',
    '慢一点也在往前',
    '今天也在收看你的节目',
  ];
  return (
    <>
    <button
      type="button"
      onClick={onOpen}
      aria-label="打开节目单"
      className="relative mt-7 flex w-full items-center gap-5 overflow-hidden rounded-[1.5rem] border-[3px] border-[#ffe100] bg-[#fff4b8] px-6 py-6 text-left text-[#1a1710] shadow-[0_4px_0_#a67b00] transition hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#a67b00]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30 tv-crt-scanlines" />
      <div aria-hidden className="pointer-events-none absolute right-8 top-6 h-14 w-36 opacity-25" style={{ backgroundImage: 'radial-gradient(circle, #1a1710 1.5px, transparent 2px)', backgroundSize: '9px 9px' }} />
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full border-[14px] border-[#ff9a00]/35" />
      <span className="relative flex h-16 w-12 shrink-0 items-center justify-center border-r-2 border-dotted border-[#1a1710]/65 pr-5 text-3xl text-[#ffd400]" style={{ textShadow: '2px 2px 0 #1a1710' }} aria-hidden>
        ▶
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.28em] text-[#8d6f00]">MIDNIGHT PROGRAM</span>
        <span className="block text-3xl font-black leading-none text-[#1a1710]">节目单</span>
        <span className="mt-2 block text-sm font-black text-[#5d4a12]">
          {goalsCount} 档节目 · 完成 {done} / <span className="font-black text-[#1a1710]">{total}</span> 小步
        </span>
        <span aria-hidden className="mt-4 flex h-3 max-w-[22rem] overflow-hidden rounded-full border border-[#1a1710] bg-[#fff8d6]">
          <span className="h-full w-[22%] bg-[#ff2e00]" />
          <span className="h-full w-[31%] bg-[#ffe100]" />
          <span className="h-full w-[22%] bg-[#0088ff]" />
          <span className="h-full w-[25%] bg-[#13cde3]" />
        </span>
      </span>
      <span className="relative flex shrink-0 flex-col items-end gap-8">
        <span className="rounded-full border-2 border-[#1a1710] bg-[#24c8f2] px-3 py-1 text-[0.76rem] font-black uppercase tracking-[0.14em] text-[#1a1710]">CH 04</span>
        <span className="text-xl font-black tracking-widest text-[#1a1710]">翻开 &gt;</span>
      </span>
    </button>

    <div className="mt-8">
      <Marquee posts={posts} bold={bold} label="观众来信 ▶" />
    </div>
    </>
  );
};

// 空状态
export const TVEmpty = ({ onCreate }: { onCreate: () => void }) => (
  <div className="relative overflow-hidden rounded-[1.4rem] border-[3px] border-[#111] bg-[#fff4b8] px-6 py-9 text-center text-[#111] shadow-[0_4px_0_#ff9a00]">
    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30 tv-crt-scanlines" />
    <div className="relative mb-2 text-3xl" aria-hidden>▶</div>
    <h3 className="relative mb-2 text-base font-black">节目单还空着</h3>
    <p className="relative mx-auto mb-5 max-w-sm text-sm font-bold leading-relaxed text-[#5d4a12]">
      先放进一件卡住你的事。之后让终端替你拆成当下能做的一小步。
    </p>
    <div className="relative flex justify-center"><TVButton onClick={onCreate} ariaLabel="追加节目">＋ 追加节目</TVButton></div>
  </div>
);

// 单档节目卡
const EpisodeCard = ({ goal, vm }: { goal: Wish; vm: TreasuryVM }) => {
  const subs = vm.subsByParent[goal.id] ?? [];
  const doneCount = subs.filter((s) => s.status === 'done').length;
  const collapsed = vm.collapsed.has(goal.id);

  return (
    <div className="relative overflow-hidden rounded-[1.1rem] border-[2px] border-[#111] bg-[#fff8d6] text-[#111] shadow-[0_3px_0_#ff9a00]">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-25 tv-crt-scanlines" />
      {/* 标题条 */}
      <div className="relative flex items-center gap-1.5 border-b-2 border-[#111] bg-primary px-2 py-1 text-[11px] font-black text-black">
        <button type="button" onClick={() => vm.toggleCollapse(goal.id)} className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70" aria-label={collapsed ? '展开' : '收起'}>{collapsed ? '▸' : '▾'}</button>
        <button type="button" onClick={() => vm.openEdit(goal)} className={`min-w-0 flex-1 truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70 ${goal.status === 'done' ? 'line-through opacity-70' : ''}`}>{goal.title}</button>
        <span className="shrink-0 rounded-full border border-[#111] bg-[#fff4b8] px-1.5 py-0.5 text-[10px] text-black/80">{episodeKind(goal)}</span>
        <button type="button" onClick={() => vm.setDeleteTarget(goal)} className="shrink-0 px-0.5 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70" aria-label="删除素材">✕</button>
        {vm.bold && vm.celebrateGoalId === goal.id && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-nowrap bg-[#24c8f2] px-2 text-sm font-black tracking-wider text-[#111]"
            initial={{ clipPath: 'inset(0 100% 0 0)' }}
            animate={{ clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)', 'inset(0 0% 0 100%)'] }}
            transition={{ duration: 1.1, times: [0, 0.5, 1], ease: 'easeInOut' }}
          >
            ★ 全部完成 ★
          </motion.span>
        )}
      </div>

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {subs.length > 0 && <GoalArc done={doneCount} total={subs.length} size={34} trackClass="text-black/20" />}
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-black text-[#8d6f00]">{subs.length > 0 ? `完成 ${doneCount} / ${subs.length}` : '还没有小步骤'}</div>
            {goal.currentState && <p className="mt-0.5 truncate text-[11px] font-bold text-black/60">进度：{goal.currentState}</p>}
            {goal.note && <p className="mt-0.5 truncate text-[11px] text-black/45">{goal.note}</p>}
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
                    className={`flex h-5 w-5 items-center justify-center rounded-sm border-2 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/70 ${sub.status === 'done' ? 'border-primary bg-primary text-black' : 'border-black/35 text-transparent'}`}
                    aria-label={sub.status === 'done' ? '标记未完成' : '标记完成'}
                  >
                    ✓
                  </motion.button>
                  {vm.bold && vm.celebrateId === sub.id && <MicroBurst />}
                </span>
                <button type="button" onClick={() => vm.openEdit(sub)} className={`min-w-0 flex-1 truncate text-left text-sm ${sub.status === 'done' ? 'text-black/38 line-through' : 'text-black/82'}`}>
                  {sub.title}
                  {sub.attribute && <span className="ml-1.5 rounded-sm bg-primary px-1 text-[10px] font-bold text-black">{vm.attrName(sub.attribute)}</span>}
                  {sub.source === 'ai' && <span className="ml-1 text-[10px] text-[#8d6f00]">AI</span>}
                </button>
                <button type="button" onClick={() => vm.setDeleteTarget(sub)} className="shrink-0 px-1 text-xs text-black/40 hover:text-[#ff4a17] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" aria-label="删除小步骤">✕</button>
              </div>
            ))}

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => vm.openSubEditor(goal.id)} className="rounded-full border-2 border-[#111] bg-[#fff4b8] px-3 py-0.5 text-[11px] font-bold text-[#111] hover:bg-[#24c8f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">＋ 小步骤</button>
              <button type="button" onClick={() => vm.runAI(goal)} disabled={!vm.hasAI} title={vm.hasAI ? undefined : '需先在「设置 → AI 总结」配置 API 密钥'} className="rounded-full border-2 border-[#111] bg-[#fff4b8] px-3 py-0.5 text-[11px] font-bold text-[#111] hover:bg-[#24c8f2] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">
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
            aria-label="节目单"
            initial={vm.bold ? { x: '100%' } : { opacity: 0 }}
            animate={vm.bold ? { x: 0 } : { opacity: 1 }}
            exit={vm.bold ? { x: '100%' } : { opacity: 0 }}
            transition={vm.bold ? springSoft : { duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l-4 border-[#111] bg-[#ffe100] text-[#111]"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30 tv-crt-scanlines" />

            {/* 标题栏 */}
            <div className="relative flex items-center gap-2 bg-primary px-3 py-1.5 text-sm font-black tracking-wider text-black">
              <span>▶ 节目单</span>
              <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto px-1 hover:opacity-70">✕</button>
            </div>

            {/* 工具条 */}
            <div className="relative flex items-center gap-2 border-b-2 border-[#111]/35 px-3 py-2">
              <TVButton onClick={vm.openGoalEditor} ariaLabel="追加节目" className="!px-4 !py-1 text-xs">＋ 追加节目</TVButton>
              <span className="text-[11px] font-black text-[#5d4a12]">{vm.goals.length} 档节目</span>
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
