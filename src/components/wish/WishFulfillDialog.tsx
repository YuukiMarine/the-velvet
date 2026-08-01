/**
 * 「愿望已实现」确认屏（PRD_V2.6 §1.4）。
 *
 * 为什么是**长按**而不是点两下：
 *   实现一个愿望是不可逆的仪式动作——一旦确认，子愿望与在途待办一并归档。
 *   长按天然带"你确实想清楚了"的分量，而且按住的这 1.1 秒正好用来放进度环，
 *   松手即取消，不需要再叠一层"确定吗"的弹窗。
 *
 * 三频道差分靠 SKIN 表；动效两段：按住时进度环 + 卡片微缩，触发后光环炸开 + 结算行。
 * D0（reduced-motion / 低性能）下环仍走，但改成 0.3s 内完成的直给形态。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import type { Wish } from '@/types';
import { useUiChannel } from '@/ui/useUiChannel';
import { useLongPress } from '@/utils/useLongPress';
import { useBoldness } from '@/utils/boldness';
import { zClass } from '@/utils/zIndex';
import { triggerLevelFeedback, triggerLightHaptic } from '@/utils/feedback';

const HOLD_MS = 1100;

const SKIN = {
  p5: { paper: '#f0e9df', ink: '#050505', accent: '#c00008', sub: '#494540', radius: 0,
        clip: 'polygon(2% 0, 100% 1.5%, 98% 100%, 0 98%)', stamp: '夺回' },
  p4: { paper: '#fff9e3', ink: '#131313', accent: 'var(--p4-orange, #f9a11b)', sub: 'rgba(19,19,19,0.6)', radius: 20,
        clip: undefined, stamp: '达成' },
  p3: { paper: 'var(--p3r-panel, #ffffff)', ink: 'var(--p3r-ink, #0a1230)', accent: 'var(--p3r-blue, #1b57ff)',
        sub: 'var(--p3r-ink-soft, #3d4a66)', radius: 18,
        clip: 'polygon(0 3%, 100% 0, 100% 97%, 0 100%)', stamp: '归档' },
  neutral: { paper: 'var(--ui-surface, #ffffff)', ink: 'var(--ui-surface-ink, #111827)', accent: 'var(--color-primary)',
             sub: 'var(--ui-muted, #6b7280)', radius: 16, clip: undefined, stamp: '实现' },
} as const;

export function WishFulfillDialog({ wish, onClose }: { wish: Wish | null; onClose: () => void }) {
  const channel = useUiChannel();
  const sk = SKIN[channel];
  const anim = useBoldness();
  const fulfillWish = useAppStore(s => s.fulfillWish);
  const getWishProgress = useAppStore(s => s.getWishProgress);

  const [result, setResult] = useState<{ title: string; timesLogged: number; archivedTodos: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!wish) { setResult(null); setBusy(false); }
  }, [wish]);

  const { pressing, bindings } = useLongPress(async () => {
    if (!wish || busy) return;
    setBusy(true);
    triggerLevelFeedback();
    const r = await fulfillWish(wish.id);
    setResult(r);
  }, { durationMs: HOLD_MS });

  useEffect(() => {
    if (pressing) triggerLightHaptic();
  }, [pressing]);

  if (!wish) return null;
  const times = getWishProgress(wish.id);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="wish-fulfill"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className={`fixed inset-0 ${zClass.cutin} flex items-center justify-center px-6`}
        // 全局变暗：这是仪式时刻，页面其余部分应当退场
        style={{ background: 'rgba(4,6,14,0.72)' }}
        onClick={() => { if (!busy) onClose(); }}
      >
        <motion.div
          initial={{ scale: anim ? 0.9 : 1, y: anim ? 14 : 0 }}
          animate={{ scale: pressing && !result ? 0.985 : 1, y: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm px-6 py-7 text-center"
          style={{ background: sk.paper, color: sk.ink, borderRadius: sk.radius, clipPath: sk.clip }}
        >
          {result ? (
            // ── 结算态 ──
            <>
              <motion.div
                initial={{ scale: anim ? 0.4 : 1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', damping: 14, stiffness: 220 }}
                className="mx-auto mb-3 text-[40px] leading-none"
                style={{ color: sk.accent }}
              >
                ✦
              </motion.div>
              <div className="text-[11px] font-black tracking-[0.4em]" style={{ color: sk.accent }}>{sk.stamp}</div>
              <div className="mt-2 text-[20px] font-black leading-tight">{result.title}</div>
              <div className="mt-4 space-y-1 text-[12px] font-bold" style={{ color: sk.sub }}>
                <div>这一路你为它记下了 <span style={{ color: sk.accent }}>{result.timesLogged}</span> 次</div>
                {result.archivedTodos > 0 && <div>同时收起了 {result.archivedTodos} 条在途任务</div>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full py-2.5 text-[13px] font-black"
                style={{ background: sk.accent, color: sk.paper, borderRadius: sk.radius === 0 ? 0 : 12 }}
              >
                记录这一刻
              </button>
            </>
          ) : (
            // ── 长按确认态 ──
            <>
              <div className="text-[11px] font-black tracking-[0.36em]" style={{ color: sk.accent }}>WISH FULFILLED</div>
              <div className="mt-2 text-[19px] font-black leading-tight">{wish.title}</div>
              <p className="mt-3 text-[12px] leading-relaxed" style={{ color: sk.sub }}>
                {times > 0
                  ? <>你为它记下过 <span style={{ color: sk.accent }}>{times}</span> 次。确认实现后，名下的子愿望与在途任务会一并收起。</>
                  : <>确认实现后，名下的子愿望与在途任务会一并收起。</>}
              </p>

              {/* 长按按钮：环随按压填充；松手即断 */}
              <button
                type="button"
                {...bindings}
                disabled={busy}
                className="relative mt-6 w-full overflow-hidden py-3 text-[13px] font-black"
                style={{ background: 'transparent', border: `2px solid ${sk.accent}`, color: sk.accent, borderRadius: sk.radius === 0 ? 0 : 12 }}
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0"
                  style={{ background: sk.accent }}
                  initial={{ width: '0%' }}
                  animate={{ width: pressing ? '100%' : '0%' }}
                  transition={{ duration: pressing ? (anim ? HOLD_MS / 1000 : 0.3) : 0.18, ease: 'linear' }}
                />
                <span className="relative" style={{ color: pressing ? sk.paper : sk.accent }}>
                  {busy ? '正在收束…' : '长按确认实现'}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full py-2 text-[12px] font-bold"
                style={{ color: sk.sub }}
              >
                再等等
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
