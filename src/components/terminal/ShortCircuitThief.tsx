/**
 * ShortCircuitThief — 短路决策的怪盗（红）表现层：P5「作战台」。
 *
 * idle=锁定面板 / shuffling=目标锁定演出（十字准星 + 聚光 + 高速翻拣 + 咔定格）/
 * decomposing=制定潜入路线 / result=预告状草案。纯展示，逻辑在 ShortCircuitPanel。
 * 所有装饰动效靠容器的 bold 守卫（shuffling 仅 bold 时进入）；急救 2 秒路径不受阻。
 */
import { AnimatePresence, motion } from 'motion/react';
import { heavy, Halftone, StrikeButton, GhostButton } from './thiefKit';
import type { ShortCircuitVM } from './ShortCircuitPanel';

/** 十字准星 + 四角锁定括弧（小图标用：台头 / loading 旋转） */
const Reticle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
    <path d="M3 8V4a1 1 0 011-1h4M16 3h4a1 1 0 011 1v4M21 16v4a1 1 0 01-1 1h-4M8 21H4a1 1 0 01-1-1v-4" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 6.5v2M12 15.5v2M6.5 12h2M15.5 12h2" />
  </svg>
);

/** 四角锁定括弧框：只在四角、中央留空——用来框住目标文字而不压字 */
const ReticleFrame = ({ className }: { className?: string }) => (
  <span aria-hidden className={`pointer-events-none block ${className ?? ''}`}>
    <span className="absolute left-0 top-0 h-3.5 w-3.5 border-l-2 border-t-2 border-current" />
    <span className="absolute right-0 top-0 h-3.5 w-3.5 border-r-2 border-t-2 border-current" />
    <span className="absolute bottom-0 left-0 h-3.5 w-3.5 border-b-2 border-l-2 border-current" />
    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-current" />
  </span>
);

export const ShortCircuitThief = ({ vm }: { vm: ShortCircuitVM }) => {
  const { skin, phase, empty, hasActiveTask, chosen, shuffleText, step, usedAI, encourage, decideForMe, openPick, accept, reset, redo } = vm;

  return (
    <div className="relative mb-5 overflow-hidden border-2 border-[color:var(--color-primary)] bg-[#0d0d0d] p-4" style={{ boxShadow: '5px 6px 0 rgba(0,0,0,0.55)' }}>
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primary" />
      <Halftone className="absolute right-0 top-0 h-20 w-20 opacity-40" style={{ clipPath: 'polygon(45% 0, 100% 0, 100% 55%)' }} />

      {/* 台头 */}
      <div className="relative mb-3 flex items-center gap-2">
        <Reticle className="h-4 w-4 text-primary" />
        <span className="text-xs font-black tracking-[2px]" style={heavy(1.5)}>短路决策 · 锁定目标</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold tracking-widest text-primary">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />{skin.label}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}>
            {hasActiveTask ? (
              <p className="text-sm leading-relaxed text-white/65">预告状已经发出——先把手上这单潜入完成。</p>
            ) : (
              <>
                <p className="mb-3 text-sm leading-relaxed text-white/75">{empty ? skin.emptyPool : skin.decideHint}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <StrikeButton label={skin.decideHero} mask onClick={decideForMe} disabled={empty} />
                  <GhostButton label={skin.decideSelf} onClick={openPick} disabled={empty} />
                </div>
              </>
            )}
          </motion.div>
        )}

        {phase === 'shuffling' && (
          <motion.div key="shuffling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative flex flex-col items-center justify-center gap-3 overflow-hidden py-8 text-center">
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 18%, rgba(0,0,0,0.72) 100%)' }} />
            <div className="relative z-[1] text-[11px] font-black tracking-[3px] text-primary">锁定目标中…</div>
            {/* 四角锁定括弧框住文字，中央留空——准星不再压字 */}
            <div className="relative z-[1] flex min-h-[2.6rem] w-full max-w-[16rem] items-center justify-center px-6 text-primary">
              <ReticleFrame className="absolute inset-0" />
              <motion.div
                key={shuffleText}
                initial={{ opacity: 0.4, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.09 }}
                className="relative z-[1] max-w-full truncate text-lg font-black text-white"
                style={heavy(2)}
              >
                {shuffleText || '…'}
              </motion.div>
            </div>
          </motion.div>
        )}

        {phase === 'decomposing' && (
          <motion.div key="decomposing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2.5 py-8 text-sm font-bold tracking-wide text-primary">
            <Reticle className="h-5 w-5 animate-spin text-primary" />
            {skin.decomposing}
          </motion.div>
        )}

        {phase === 'result' && chosen && (
          <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* 预告状草案 */}
            <div className="relative border-2 border-primary/50 bg-black/40 p-3" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 92%, 96% 100%, 0 100%)' }}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-white/55">
                <span className="rounded-[2px] bg-primary/20 px-1.5 py-0.5 font-bold text-primary">{chosen.kind === 'wish' ? '心之宝物' : '待办'}</span>
                <span className="min-w-0 truncate">{chosen.title}</span>
              </div>
              <div className="text-[11px] font-black tracking-widest text-primary">{skin.stepLead}</div>
              <p className="mt-1 text-lg font-black leading-snug" style={heavy(2)}>{step}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs italic text-white/55">{encourage}</span>
                <span className="ml-auto text-[10px] tracking-wider text-white/35">{usedAI ? 'AI 拆解' : '离线模板'}</span>
              </div>
            </div>

            <div className="mt-3 flex justify-center">
              <StrikeButton label={skin.accept} onClick={accept} />
            </div>
            <div className="mt-3 flex gap-2">
              <GhostButton label={skin.again} onClick={reset} className="flex-1" />
              <GhostButton label={skin.redo} onClick={redo} className="flex-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
