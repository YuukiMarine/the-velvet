/**
 * tvKit — F3 TV（黄主题）频道的共享 P4 综艺 / CRT 原语。
 *
 * 玄关（AntechamberTV）与正文（转盘抽签 / 节目倒计时帖 / 通关结算 / 节目单抽屉）共用：
 * 综艺粗描边「花字」、闪烁 REC 点、闪烁星、CRT 扫描线/暗角叠层、综艺面板、光泽节目按钮、
 * 「观众来信」滚动字幕条。黄是固定鲜亮主题（非自定义），primary 直接当强调色即可读。
 */
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

/** P4 CRT 签名缓动：锐利、不弹（同 motion.ts yellow 性格） */
export const CRT_EASE: [number, number, number, number] = [0.85, 0, 0.15, 1];

/** 综艺粗描边「花字」：白字 + 厚黑描边 + 黄色偏移投影（贴纸感） */
export const fancy = (px = 3): React.CSSProperties => ({
  color: '#fff',
  textShadow: [
    `${-px}px ${-px}px 0 #000`, `${px}px ${-px}px 0 #000`, `${-px}px ${px}px 0 #000`, `${px}px ${px}px 0 #000`,
    `0 ${px}px 0 #000`, `${px}px 0 0 #000`, `${-px}px 0 0 #000`, `0 ${-px}px 0 #000`,
    `${px + 3}px ${px + 4}px 0 var(--color-primary)`,
  ].join(','),
});

/** 闪烁红点（LIVE / REC 共用） */
export const RecDot = ({ size = 'h-2 w-2', bold }: { size?: string; bold: boolean }) => (
  <motion.span
    aria-hidden
    className={`inline-block shrink-0 rounded-full bg-[#ff2e2e] ${size}`}
    style={{ boxShadow: '0 0 6px #ff2e2e' }}
    animate={bold ? { opacity: [1, 1, 0.15, 1] } : { opacity: 1 }}
    transition={bold ? { duration: 1.1, repeat: Infinity, ease: 'linear', times: [0, 0.55, 0.6, 1] } : undefined}
  />
);

/** 角落闪烁星（综艺花字点缀） */
export const Sparkle = ({ className, delay = 0, bold }: { className?: string; delay?: number; bold: boolean }) => (
  <motion.span
    aria-hidden
    className={`pointer-events-none absolute select-none text-primary ${className ?? ''}`}
    style={{ textShadow: '0 0 8px color-mix(in srgb, var(--color-primary) 70%, transparent)' }}
    animate={bold ? { scale: [0.7, 1.1, 0.7], opacity: [0.4, 1, 0.4] } : { opacity: 0.7 }}
    transition={bold ? { duration: 2.2, delay, repeat: Infinity, ease: 'easeInOut' } : undefined}
  >
    ✦
  </motion.span>
);

/** CRT 叠层：扫描线 + 暗角（放在 relative 容器内） */
export const CRTOverlay = ({ scanOpacity = 0.4, vignette = 0.5 }: { scanOpacity?: number; vignette?: number }) => (
  <>
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ opacity: scanOpacity, backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 1px, transparent 1px, transparent 3px)' }} />
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at center, transparent 55%, rgba(0,0,0,${vignette}) 100%)` }} />
  </>
);

/** 综艺面板：黑底 + 黄边 + 黄色节目标题条（综艺感）+ 扫描线 */
export const TVPanel = ({ title, children, className, bodyClass }: { title?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) => (
  <div className={`relative overflow-hidden border-2 border-primary bg-[#0a0a06] ${className ?? ''}`} style={{ boxShadow: '0 4px 0 #000, 0 8px 16px rgba(0,0,0,0.5)' }}>
    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) 1px, transparent 1px, transparent 3px)' }} />
    {title && (
      <div className="relative flex items-center gap-1.5 bg-primary px-3 py-1 text-xs font-black tracking-wider text-black">
        {title}
      </div>
    )}
    <div className={`relative ${bodyClass ?? 'px-3 py-3'}`}>{children}</div>
  </div>
);

/** 光泽综艺按钮：primary=黄底黑字主操作（顶部高光 + 光泽扫掠）/ 否则黑底黄字次操作。
 *  光泽扫掠自带 useBoldness 门控——D0 静态、不烧帧。 */
export const TVButton = ({ children, onClick, disabled, primary = true, className, ariaLabel }: { children: ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean; className?: string; ariaLabel?: string }) => {
  const bold = useBoldness();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      className={`relative overflow-hidden rounded-full border-[3px] border-black px-5 py-2 text-sm font-black tracking-widest disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${primary ? 'text-black' : 'text-primary'} ${className ?? ''}`}
      style={{ background: primary ? 'var(--color-primary)' : '#0a0a06', boxShadow: '0 4px 0 #000' }}
    >
      {primary && <span aria-hidden className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.55), transparent)' }} />}
      {primary && bold && (
        <motion.span aria-hidden className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)' }} initial={{ left: '-40%' }} animate={{ left: ['-40%', '140%'] }} transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }} />
      )}
      <span className="relative">{children}</span>
    </motion.button>
  );
};

/** 「❯ 观众来信」滚动字幕条（弹幕的电视形态）。bold=false → 静态首条。 */
export const Marquee = ({ posts, bold, label = '❯ 观众来信' }: { posts: string[]; bold: boolean; label?: string }) => {
  const ticker = (posts.length ? posts : ['有人也在熬这个夜。']).join('　•　');
  return (
    <div className="relative flex h-16 items-center overflow-hidden rounded-xl border-2 border-[#ffe100] bg-[#fff4b8] text-[#1a1710] shadow-[0_3px_0_#8d6f00]">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-35 tv-crt-scanlines" />
      <span className="relative flex h-full shrink-0 items-center border-r-2 border-[#1a1710] bg-[#ffe100] px-5 text-base font-black tracking-wide text-[#1a1710]">{label}</span>
      <div className="relative flex-1 overflow-hidden">
        {bold ? (
          <motion.div className="flex whitespace-nowrap text-sm font-black tracking-wide text-[#1a1710]" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}>
            <span className="pr-8">{ticker}</span>
            <span className="pr-8" aria-hidden>{ticker}</span>
          </motion.div>
        ) : (
          <div className="truncate px-4 text-sm font-black text-[#1a1710]">{posts[0] ?? ''}</div>
        )}
      </div>
      <span className="relative shrink-0 px-4 text-2xl font-black text-[#1a1710]" aria-hidden>✽</span>
    </div>
  );
};
