/**
 * ShortCircuitDefault — 短路决策的通用表现层（board / tv / 兜底）。
 * 纯展示，状态机在 ShortCircuitPanel；保持阶段 2 拆分前的原始观感。
 */
import { AnimatePresence, motion } from 'motion/react';
import type { ShortCircuitVM } from './ShortCircuitPanel';

export const ShortCircuitDefault = ({ vm }: { vm: ShortCircuitVM }) => {
  const { skin, phase, empty, hasActiveTask, chosen, shuffleText, step, usedAI, encourage, decideForMe, openPick, accept, reset, redo } = vm;

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/[0.03] p-4 dark:from-primary/15">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
        <span className="text-xs font-bold tracking-wide text-primary">短路决策</span>
        <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">{skin.label}</span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            {hasActiveTask ? (
              <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                你已经有一个进行中的限时任务，先把它完成吧。
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {empty ? skin.emptyPool : skin.decideHint}
                </p>
                <div className="flex flex-wrap gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={decideForMe}
                    disabled={empty}
                    className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 disabled:opacity-40"
                  >
                    {skin.decideHero}
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={openPick}
                    disabled={empty}
                    className="rounded-xl border border-primary/40 px-4 py-3 text-sm font-medium text-primary disabled:opacity-40"
                  >
                    {skin.decideSelf}
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {phase === 'shuffling' && (
          <motion.div
            key="shuffling"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex flex-col items-center justify-center gap-1.5 overflow-hidden py-9 text-center"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 22%, rgba(0,0,0,0.5) 100%)' }} />
            <div className="relative z-[1] text-[11px] font-medium tracking-widest text-primary">终端正在替你拣选…</div>
            <motion.div
              key={shuffleText}
              initial={{ opacity: 0.35, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.09 }}
              className="relative z-[1] min-h-[1.9rem] max-w-full truncate text-lg font-black text-gray-900 dark:text-white"
            >
              {shuffleText || '…'}
            </motion.div>
          </motion.div>
        )}

        {phase === 'decomposing' && (
          <motion.div key="decomposing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500 dark:text-gray-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {skin.decomposing}
          </motion.div>
        )}

        {phase === 'result' && chosen && (
          <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                {chosen.kind === 'wish' ? '子愿望' : '待办'}
              </span>
              <span className="min-w-0 truncate">{chosen.title}</span>
            </div>
            <div className="text-[11px] font-medium text-primary">{skin.stepLead}</div>
            <p className="mt-1 text-lg font-bold leading-snug text-gray-900 dark:text-white">{step}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500">{encourage}</span>
              <span className="ml-auto text-[10px] text-gray-300 dark:text-gray-600">{usedAI ? 'AI 拆解' : '离线模板'}</span>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={accept}
              className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/30"
            >
              {skin.accept}
            </motion.button>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={reset} className="flex-1 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {skin.again}
              </button>
              <button type="button" onClick={redo} className="flex-1 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {skin.redo}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
