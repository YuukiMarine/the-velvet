/**
 * ShortCircuitTV — 短路决策的 TV（黄）表现层：P4 综艺「转盘抽签」环节。
 *
 * idle=节目环节面板 / shuffling=转盘高速抽取（综艺花字 + 闪星 + 聚光）/ decomposing=导播剪辑 /
 * result=本期挑战卡。纯展示，状态机在 ShortCircuitPanel。黄 primary 鲜亮，可直接当强调色。
 */
import { AnimatePresence, motion } from 'motion/react';
import { TVPanel, TVButton, RecDot, Sparkle, fancy } from './tvKit';
import type { ShortCircuitVM } from './ShortCircuitPanel';

export const ShortCircuitTV = ({ vm }: { vm: ShortCircuitVM }) => {
  const { skin, bold, phase, empty, hasActiveTask, chosen, shuffleText, step, usedAI, encourage, decideForMe, openPick, accept, reset, redo } = vm;

  return (
    <TVPanel className="mb-5" title={<><RecDot size="h-1.5 w-1.5" bold={bold} />一小步启动器 · {skin.decideHero}</>}>
      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            {hasActiveTask ? (
              <p className="text-sm leading-relaxed text-white/75">手上还有一小步在录制中。先把它做掉，再开下一场。</p>
            ) : (
              <>
                <p className="mb-3 text-sm leading-relaxed text-white/85">{empty ? skin.emptyPool : skin.decideHint}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <TVButton disabled={empty} onClick={decideForMe} ariaLabel={skin.decideHero}>{skin.decideHero}</TVButton>
                  <TVButton primary={false} disabled={empty} onClick={openPick} ariaLabel={skin.decideSelf}>{skin.decideSelf}</TVButton>
                </div>
              </>
            )}
          </motion.div>
        )}

        {phase === 'shuffling' && (
          <motion.div key="shuffling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex flex-col items-center justify-center gap-2 overflow-hidden py-8 text-center">
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 18%, rgba(0,0,0,0.72) 100%)' }} />
            <Sparkle className="left-[12%] top-2 text-base" delay={0} bold={bold} />
            <Sparkle className="right-[14%] top-4 text-sm" delay={0.5} bold={bold} />
            <Sparkle className="bottom-3 left-[20%] text-lg" delay={1} bold={bold} />
            <div className="relative z-[1] text-[11px] font-black tracking-[3px] text-primary"><span aria-hidden>🎯</span> 转盘抽取中…</div>
            <motion.div key={shuffleText} initial={{ opacity: 0.4, scale: 0.94, rotate: -2 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: 0.09 }} className="relative z-[1] max-w-[15rem] truncate px-2 text-lg font-black" style={fancy(2)}>
              {shuffleText || '…'}
            </motion.div>
          </motion.div>
        )}

        {phase === 'decomposing' && (
          <motion.div key="decomposing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 py-8 text-sm font-bold tracking-wide text-primary">
            {skin.decomposing}
            <span aria-hidden className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
            </span>
          </motion.div>
        )}

        {phase === 'result' && chosen && (
          <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-white/55">
              <span className="rounded-sm bg-primary px-1.5 py-0.5 font-bold text-black">{chosen.kind === 'wish' ? '小步骤' : '待办'}</span>
              <span className="min-w-0 truncate">{chosen.title}</span>
            </div>
            <div className="border-2 border-primary/70 bg-black/45 p-3" style={{ boxShadow: '0 3px 0 #000' }}>
              <div className="text-[11px] font-black tracking-wide text-primary">{skin.stepLead}</div>
              <p className="mt-1 break-words text-base font-black leading-relaxed text-white">{step}</p>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs italic text-white/60">{encourage}</span>
              <span className="ml-auto text-[10px] tracking-wider text-white/40">{usedAI ? 'AI 拆的' : '本地拆的'}</span>
            </div>

            <div className="mt-3 flex justify-center">
              <TVButton onClick={accept} ariaLabel={skin.accept}>{skin.accept}</TVButton>
            </div>
            <div className="mt-3 flex justify-center gap-2">
              <TVButton primary={false} onClick={reset} ariaLabel={skin.again}>{skin.again}</TVButton>
              <TVButton primary={false} onClick={redo} ariaLabel={skin.redo}>{skin.redo}</TVButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </TVPanel>
  );
};
