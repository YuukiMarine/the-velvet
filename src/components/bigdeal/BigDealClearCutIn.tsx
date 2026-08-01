/**
 * BigDealClearCutIn — 大事收官结算屏（TASKS_MERGE_PRD 批4）。
 *
 * collapseBigDeal 落库后由 store.bigDealClear 载荷触发，App 顶层全局渲染（portal 越层）。
 * 结构：斜章标题砸入 → 大事名 → 战利品行（N 步全成 / SP / 触及属性 +1）→
 * 弹幕（读：种子+云端过审飘过；写：有投稿权时一键开 DanmakuCompose，先审后发）。
 * 四频道舞台与抽签同族（p5 剪报 / p4 演播厅 / p3 水面 / neutral 虚空）；bold 降级直出。
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useBoldness } from '@/utils/boldness';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerLevelFeedback } from '@/utils/feedback';
import { TERMINAL_DANMAKU_SEEDS } from '@/constants/terminalDanmaku';
import { listApprovedDanmaku } from '@/services/danmaku';
import { cloudEnabled } from '@/services/pocketbase';
import { DanmakuCompose } from '@/components/danmaku/DanmakuCompose';
import { zClass } from '@/utils/zIndex';

interface StageSkin {
  stage: string;
  texture?: { backgroundImage: string; backgroundSize?: string; opacity: number };
  eyebrow: string;
  stamp: string;
  stampStyle?: React.CSSProperties;
  title: string;
  titleFont?: string;
  statChip: string;
  panel: string;
  panelStyle?: React.CSSProperties;
  primary: string;
  ghost: string;
  danmaku: string;
}

const SKINS: Record<'p5' | 'p4' | 'p3' | 'neutral', StageSkin> = {
  p5: {
    stage: 'radial-gradient(circle at 50% 16%, #2b070b 0%, #17040a 52%, #060203 100%)',
    texture: { backgroundImage: 'radial-gradient(circle, rgba(230,0,18,0.18) 1.2px, transparent 1.7px)', backgroundSize: '9px 9px', opacity: 0.5 },
    eyebrow: 'text-[10px] font-black uppercase tracking-[0.4em] text-[#ff2233]',
    stamp: 'inline-block border-[3px] border-[#050505] bg-[#c00008] px-4 py-1.5 text-[22px] font-black italic text-white shadow-[5px_5px_0_rgba(0,0,0,0.6)]',
    stampStyle: { transform: 'rotate(-2.5deg)', fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' },
    title: 'mt-4 break-words text-xl font-black italic leading-snug text-[#f0e9df]',
    titleFont: '"Arial Black", "Noto Sans SC", sans-serif',
    statChip: 'border-2 border-[#050505] bg-[#f0e9df] px-2.5 py-1 text-[11px] font-black text-[#131313] shadow-[2px_2px_0_rgba(0,0,0,0.55)]',
    panel: 'border-[3px] border-[#050505] bg-[#f0e9df] px-4 py-3 text-left',
    panelStyle: { boxShadow: '6px 7px 0 rgba(0,0,0,0.55)', clipPath: 'polygon(0 2%, 100% 0, 99% 100%, 1% 98%)' },
    primary: 'w-full border-[3px] border-[#050505] bg-[#c00008] py-3 text-base font-black text-white shadow-[4px_4px_0_rgba(0,0,0,0.6)] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_rgba(0,0,0,0.6)]',
    ghost: 'text-sm font-black text-[#f0e9df]/50',
    danmaku: 'text-xs font-bold text-[#f0e9df]/25',
  },
  p4: {
    stage: 'radial-gradient(circle at 50% 14%, #241542 0%, #150b2c 55%, #08040f 100%)',
    texture: { backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 4px)', opacity: 0.8 },
    eyebrow: 'text-[10px] font-black uppercase tracking-[0.4em] text-[#ffe100]',
    stamp: 'inline-block rounded-full border-[3px] border-[#131313] bg-[#ffe100] px-5 py-1.5 text-[20px] font-black text-[#131313] shadow-[0_5px_0_#ff9a00]',
    stampStyle: { fontFamily: 'var(--p4-display-font, Georgia, serif)' },
    title: 'mt-4 break-words text-xl font-black leading-snug text-white',
    titleFont: 'var(--p4-display-font, Georgia, serif)',
    statChip: 'rounded-full border-2 border-[#131313] bg-[#fff7b0] px-2.5 py-1 text-[11px] font-black text-[#131313]',
    panel: 'rounded-[16px] border-[3px] border-[#131313] bg-[#fff7b0] px-4 py-3 text-left',
    panelStyle: { boxShadow: '0 5px 0 #ff9a00' },
    primary: 'w-full rounded-full border-[3px] border-[#131313] bg-[#131313] py-3 text-base font-black tracking-[0.08em] text-[#ffe100] shadow-[0_5px_0_#ff6a00] transition active:translate-y-0.5 active:shadow-[0_1px_0_#ff6a00]',
    ghost: 'text-sm font-black text-white/50',
    danmaku: 'text-xs font-medium text-white/25',
  },
  p3: {
    stage: 'radial-gradient(circle at 50% 16%, #16294a 0%, #0d1b36 55%, #060d1d 100%)',
    texture: { backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.22) 1px, transparent 1.5px)', backgroundSize: '14px 14px', opacity: 0.25 },
    eyebrow: 'text-[10px] font-black uppercase tracking-[0.4em] text-[#35d1e8]',
    stamp: 'inline-block bg-[#1b57ff] px-5 py-1.5 text-[20px] font-black italic text-white shadow-[0_12px_28px_rgba(27,87,255,.45)] [clip-path:polygon(10px_0,100%_0,calc(100%_-_10px)_100%,0_100%)]',
    stampStyle: { fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' },
    title: 'mt-4 break-words text-xl font-black italic leading-snug text-white',
    statChip: 'bg-white/95 px-2.5 py-1 text-[11px] font-black text-[#0a1230] [clip-path:polygon(6px_0,100%_0,calc(100%_-_6px)_100%,0_100%)]',
    panel: 'bg-white px-4 py-3 text-left',
    panelStyle: { clipPath: 'polygon(0 4%, 100% 0, 98.5% 100%, 1% 100%)', boxShadow: '0 20px 48px rgba(0,0,0,0.5)' },
    primary: 'w-full bg-[#1b57ff] py-3 text-base font-black text-white shadow-[0_10px_24px_rgba(27,87,255,.4)] transition active:translate-y-0.5 [clip-path:polygon(10px_0,100%_0,calc(100%_-_10px)_100%,0_100%)]',
    ghost: 'text-sm font-black text-white/50',
    danmaku: 'text-xs font-medium text-white/25',
  },
  neutral: {
    stage: 'radial-gradient(circle at 50% 18%, rgba(36,28,80,0.97) 0%, rgba(14,10,34,0.98) 55%, rgba(4,3,12,0.99) 100%)',
    eyebrow: 'text-[10px] font-black uppercase tracking-[0.4em] text-white/40',
    stamp: 'inline-block rounded-2xl bg-white px-5 py-1.5 text-[20px] font-black text-gray-900',
    title: 'mt-4 break-words text-xl font-black leading-snug text-white',
    statChip: 'rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-gray-900',
    panel: 'rounded-2xl bg-white px-4 py-3 text-left',
    panelStyle: { boxShadow: '0 20px 48px rgba(0,0,0,0.5)' },
    primary: 'w-full rounded-2xl bg-white py-3 text-base font-black text-gray-900',
    ghost: 'text-sm font-bold text-white/50',
    danmaku: 'text-xs font-medium text-white/25',
  },
};

export const BigDealClearCutIn = () => {
  const { bigDealClear, clearBigDealClear, settings } = useAppStore();
  const cloudUser = useCloudStore((s) => s.cloudUser);
  const bold = useBoldness();
  const channel = useUiChannel();
  const sk = SKINS[channel === 'p5' || channel === 'p4' || channel === 'p3' ? channel : 'neutral'];
  const [composeOpen, setComposeOpen] = useState(false);
  const [approved, setApproved] = useState<string[]>([]);

  const open = !!bigDealClear;
  const tokens = settings.terminalDanmakuTokens ?? 0;
  const canCompose = cloudEnabled && !!cloudUser && tokens > 0;
  const attrName = (id: string) => settings.attributeNames?.[id as keyof typeof settings.attributeNames] ?? id;

  useEffect(() => {
    if (!open) return;
    triggerLevelFeedback();
    if (cloudEnabled) listApprovedDanmaku().then(setApproved).catch(() => {});
  }, [open]);

  const danmaku = useMemo(
    () => [...TERMINAL_DANMAKU_SEEDS, ...approved].sort(() => Math.random() - 0.5).slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, approved],
  );

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence>
        {open && bigDealClear && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 ${zClass.modal} flex items-center justify-center px-6`}
            style={{ background: sk.stage }}
          >
            {sk.texture && (
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: sk.texture.backgroundImage, backgroundSize: sk.texture.backgroundSize, opacity: sk.texture.opacity }} />
            )}
            {/* 弹幕环境层（读：官方种子 + 云端已过审） */}
            {bold && danmaku.map((line, i) => (
              <motion.span
                key={`${i}-${line}`}
                aria-hidden
                className={`pointer-events-none absolute whitespace-nowrap ${sk.danmaku}`}
                style={{ top: `${14 + i * 34}%` }}
                initial={{ x: '60vw' }}
                animate={{ x: '-110vw' }}
                transition={{ duration: 13 + i * 4, ease: 'linear', repeat: Infinity }}
              >
                {line}
              </motion.span>
            ))}

            <div className="w-full max-w-sm text-center">
              <motion.div
                initial={bold ? { opacity: 0, y: -18 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={sk.eyebrow}
              >
                BIG DEAL CLEAR
              </motion.div>

              {/* 斜章标题砸入 */}
              <motion.div
                initial={bold ? { scale: 1.9, opacity: 0, rotate: -8 } : false}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22, delay: bold ? 0.08 : 0 }}
                className="mt-3"
              >
                <span className={sk.stamp} style={sk.stampStyle}>大功告成</span>
              </motion.div>

              <motion.h2
                initial={bold ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: bold ? 0.24 : 0 }}
                className={sk.title}
                style={sk.titleFont ? { fontFamily: sk.titleFont } : undefined}
              >
                {bigDealClear.title}
              </motion.h2>

              {/* 战利品行 */}
              <motion.div
                initial={bold ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: bold ? 0.36 : 0 }}
                className="mt-4 flex flex-wrap items-center justify-center gap-2"
              >
                <span className={sk.statChip}>共 {bigDealClear.stepsCount} 步</span>
                {bigDealClear.sp > 0 && <span className={sk.statChip}>SP +{bigDealClear.sp}</span>}
                {bigDealClear.attrs.map(a => (
                  <span key={a} className={sk.statChip}>{attrName(a)} +1</span>
                ))}
              </motion.div>

              {/* 弹幕投稿（写：收官发的投稿权当场用；未登录/无云/无权则隐藏） */}
              {canCompose && (
                <motion.button
                  type="button"
                  initial={bold ? { opacity: 0, y: 12 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: bold ? 0.48 : 0 }}
                  onClick={() => setComposeOpen(true)}
                  className={`mx-auto mt-6 block w-full ${sk.panel}`}
                  style={sk.panelStyle}
                >
                  <span className="block text-sm font-black">✦ 写一句话，送给同样在路上的人</span>
                  <span className="mt-0.5 block text-[11px] font-semibold opacity-60">你攒了 {tokens} 次投稿机会 · 先审后发 · 匿名</span>
                </motion.button>
              )}

              <motion.div
                initial={bold ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ delay: bold ? 0.6 : 0 }}
                className="mt-6 space-y-3"
              >
                <button type="button" onClick={clearBigDealClear} className={sk.primary}>
                  记录这一刻
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 投稿窗（先审后发管线原样复用；结算屏恒暗底 → forceDark） */}
      <DanmakuCompose isOpen={composeOpen} onClose={() => setComposeOpen(false)} forceDark />
    </>,
    document.body,
  );
};
