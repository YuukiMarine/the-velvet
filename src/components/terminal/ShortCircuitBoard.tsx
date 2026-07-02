/**
 * ShortCircuitBoard — 短路决策的讨论板（蓝/粉/自定义）表现层：BBS「深夜抽签」窗口。
 *
 * idle=抽签面板 / shuffling=抽取楼层滚动 / decomposing=拆解中光标 / result=拟发表的帖。
 * 纯展示，状态机在 ShortCircuitPanel。窗体固定深底 + 浅墨文字，自定义主题任意 primary 仍可读。
 */
import { AnimatePresence, motion } from 'motion/react';
import { BevelWindow, BevelButton, INK_DIM } from './boardKit';
import type { ShortCircuitVM } from './ShortCircuitPanel';

export const ShortCircuitBoard = ({ vm }: { vm: ShortCircuitVM }) => {
  const { skin, phase, empty, hasActiveTask, chosen, shuffleText, step, usedAI, encourage, decideForMe, openPick, accept, reset, redo } = vm;

  return (
    <BevelWindow className="mb-5" title={`short_circuit.bbs · ${skin.decideHero}`}>
      <div className="text-[13px] leading-relaxed">
        <div className="bk-fg">» 一小步启动器 · {skin.label}</div>
        <div aria-hidden className="my-1.5 bk-fg opacity-40">────────────────────────</div>

        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
              {hasActiveTask ? (
                <p style={{ color: INK_DIM }}>手上还有一小步没做完。先把它收掉，再开下一帖。</p>
              ) : (
                <>
                  <p className="mb-3">{empty ? skin.emptyPool : skin.decideHint}</p>
                  <div className="flex flex-wrap gap-2">
                    <BevelButton primary disabled={empty} onClick={decideForMe} className="flex-1" ariaLabel={skin.decideHero}>{skin.decideHero}</BevelButton>
                    <BevelButton disabled={empty} onClick={openPick} ariaLabel={skin.decideSelf}>{skin.decideSelf}</BevelButton>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {phase === 'shuffling' && (
            <motion.div key="shuffling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-6 text-center">
              <div className="text-[11px] tracking-widest bk-fg">替你挑一件…</div>
              <motion.div key={shuffleText} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.09 }} className="mt-2 truncate text-base font-bold">
                » {shuffleText || '…'}
              </motion.div>
            </motion.div>
          )}

          {phase === 'decomposing' && (
            <motion.div key="decomposing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-6 text-center text-sm" style={{ color: INK_DIM }}>
              {skin.decomposing} <span className="animate-pulse bk-fg">▋</span>
            </motion.div>
          )}

          {phase === 'result' && chosen && (
            <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px]" style={{ color: INK_DIM }}>
                <span className="bg-primary/20 px-1.5 py-0.5 bk-fg">{chosen.kind === 'wish' ? '小步骤' : '待办'}</span>
                <span className="min-w-0 truncate">{chosen.title}</span>
              </div>
              <div className="text-[11px] font-bold bk-fg">{skin.stepLead}</div>
              <p className="mt-1 border-l-2 bk-bd pl-2 text-base font-bold leading-snug">{step}</p>
              <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: INK_DIM }}>
                <span className="italic">{encourage}</span>
                <span className="ml-auto text-[10px] bk-fg">{usedAI ? 'AI 拆的' : '本地拆的'}</span>
              </div>

              <div className="mt-3">
                <BevelButton primary onClick={accept} className="w-full" ariaLabel={skin.accept}>{skin.accept}</BevelButton>
              </div>
              <div className="mt-2 flex gap-2">
                <BevelButton onClick={reset} className="flex-1" ariaLabel={skin.again}>{skin.again}</BevelButton>
                <BevelButton onClick={redo} className="flex-1" ariaLabel={skin.redo}>{skin.redo}</BevelButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </BevelWindow>
  );
};
