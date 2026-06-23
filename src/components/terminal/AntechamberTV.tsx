/**
 * AntechamberTV — F3 玄关「TV 特别节目」皮肤（黄主题，Persona 4 深夜电视频道风）。
 *
 * 手搓综艺 / CRT 质感（不复用通用件）：满屏 CRT 显像管（扫描线 + 暗角 + 圆角管面 + 下行扫描带）、
 * 进场「接通信号 / 调谐」雪花噪点 + 垂直滚屏（觉醒等价、可点击跳过、本会话只全播一次）、
 * 播出 HUD（● LIVE 录制中 / CH 04 · 深夜 00:00）、综艺粗描边「花字」台标 + 闪烁星、
 * 把鼓励弹幕渲染成底部「观众来信」滚动字幕条（弹幕的电视本体形态）、
 * 光泽「进入演播厅」REC 按钮 + 切台白闪。D0/reduced-motion 直接进、不调谐、不滚屏、不闪。
 *
 * 黄 = P4 CRT 性格：锐利 tween、不弹（getMotionPersonality('yellow')）。
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { getMotionPersonality } from '@/utils/motion';
import { triggerLightHaptic, triggerThemeSwitchFeedback } from '@/utils/feedback';
import type { TerminalSkin } from '@/utils/terminalSkin';

interface Props {
  skin: TerminalSkin;
  onEnter: () => void;
  onBack: () => void;
  danmakuPool: string[];
}

let _tvIntroSeen = false;

/** P4 CRT 签名缓动：锐利、不弹（同 motion.ts yellow 性格） */
const CRT_EASE: [number, number, number, number] = [0.85, 0, 0.15, 1];

/** 综艺粗描边「花字」：白字 + 厚黑描边 + 黄色偏移投影（贴纸感） */
const fancy = (px = 3): React.CSSProperties => ({
  color: '#fff',
  textShadow: [
    `${-px}px ${-px}px 0 #000`, `${px}px ${-px}px 0 #000`, `${-px}px ${px}px 0 #000`, `${px}px ${px}px 0 #000`,
    `0 ${px}px 0 #000`, `${px}px 0 0 #000`, `${-px}px 0 0 #000`, `0 ${-px}px 0 #000`,
    `${px + 3}px ${px + 4}px 0 var(--color-primary)`,
  ].join(','),
});

/** CRT 雪花噪点（feTurbulence 灰度），仅调谐时出 */
const TVStatic = ({ className }: { className?: string }) => (
  <svg className={className} aria-hidden xmlns="http://www.w3.org/2000/svg">
    <filter id="tv-static-noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#tv-static-noise)" />
  </svg>
);

/** 闪烁红点（LIVE / REC 共用） */
const RecDot = ({ size = 'h-2 w-2', bold }: { size?: string; bold: boolean }) => (
  <motion.span
    aria-hidden
    className={`inline-block shrink-0 rounded-full bg-[#ff2e2e] ${size}`}
    style={{ boxShadow: '0 0 6px #ff2e2e' }}
    animate={bold ? { opacity: [1, 1, 0.15, 1] } : { opacity: 1 }}
    transition={bold ? { duration: 1.1, repeat: Infinity, ease: 'linear', times: [0, 0.55, 0.6, 1] } : undefined}
  />
);

/** 角落闪烁星（综艺花字点缀） */
const Sparkle = ({ className, delay = 0, bold }: { className?: string; delay?: number; bold: boolean }) => (
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

export const AntechamberTV = ({ skin, onEnter, onBack, danmakuPool }: Props) => {
  const user = useAppStore((s) => s.user);
  const bold = useBoldness();
  const perso = getMotionPersonality('yellow');
  const [phase, setPhase] = useState<'tune' | 'live'>(() => (bold && !_tvIntroSeen ? 'tune' : 'live'));
  const [popping, setPopping] = useState(false);
  const tuning = phase === 'tune';

  // 接通信号 → 调谐 → 落到「live」直播态；可点击跳过，本会话只全播一次
  useEffect(() => {
    if (!tuning) return;
    _tvIntroSeen = true;
    const total = skin.awaken.length * 520 + 1000;
    const t = setTimeout(() => setPhase('live'), total);
    return () => clearTimeout(t);
  }, [tuning, skin.awaken.length]);

  // 进入黄色频道时播一次黄主题切换音（"接通信号"）
  useEffect(() => {
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = () => {
    if (popping) return;
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    if (!bold) { onEnter(); return; } // D0：不演切台，直接进
    setPopping(true);
    setTimeout(onEnter, 240);
  };

  const posts = (danmakuPool.length ? danmakuPool : ['有人也在熬这个夜。']).slice(0, 8);
  const ticker = posts.join('　•　');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: bold ? 0.25 : 0.12 }}
      className="fixed inset-0 z-40 overflow-hidden bg-[#0a0a06]"
      onClick={() => tuning && setPhase('live')}
    >
      {/* CRT 显像管：黄色管面辉光 + 暗角 + 圆角 */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 42%, color-mix(in srgb, var(--color-primary) 12%, transparent) 0%, transparent 55%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 48%, rgba(0,0,0,0.78) 100%)' }} />
      {/* 扫描线 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 1px, transparent 1px, transparent 3px)' }} />
      {/* 管面内阴影（弧形玻璃边） */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 140px 30px rgba(0,0,0,0.85)', borderRadius: 18 }} />
      {/* 缓慢下行扫描带 */}
      {bold && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-24"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.045), transparent)' }}
          initial={{ top: '-15%' }}
          animate={{ top: '115%' }}
          transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* 返回 */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onBack(); }} aria-label="返回" className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-xl text-white/70 hover:bg-white/10">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      {/* 播出 HUD 条 */}
      <div className="absolute inset-x-0 top-3 z-20 flex items-center justify-between px-14 text-[11px] font-bold tracking-widest">
        <span className="flex items-center gap-1.5 text-white/90"><RecDot bold={bold} />LIVE · 录制中</span>
        <span className="font-mono text-primary/90">CH 04 ▏深夜 00:00</span>
      </div>

      <AnimatePresence mode="wait">
        {tuning ? (
          // ── 调谐：雪花噪点 + 垂直滚屏 + 广播字幕觉醒 ──
          <motion.div key="tune" className="absolute inset-0 z-10" exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            <motion.div className="absolute inset-0" animate={{ opacity: [0.55, 0.25, 0.5, 0.18, 0.4] }} transition={{ duration: 0.5, repeat: Infinity }}>
              <TVStatic className="h-full w-full" />
            </motion.div>
            {/* 垂直滚屏亮带（vertical-hold 失步） */}
            <motion.div aria-hidden className="absolute inset-x-0 h-16" style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.16), transparent)' }} initial={{ top: '-20%' }} animate={{ top: '120%' }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} />

            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <div className="mb-5 text-[11px] font-bold tracking-[4px] text-primary/80">接通信号 · 调谐中…</div>
              {skin.awaken.map((line, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)', x: -6 }}
                  animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)', x: 0 }}
                  transition={{ delay: i * 0.52 + 0.2, duration: 0.26, ease: CRT_EASE }}
                  className="mb-1 text-2xl font-black leading-relaxed"
                  style={fancy(2.5)}
                >
                  {line}
                </motion.p>
              ))}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: skin.awaken.length * 0.52 + 0.3 }} className="mt-6 text-[11px] tracking-widest text-white/40">
                轻点跳过
              </motion.div>
            </div>
          </motion.div>
        ) : (
          // ── 直播：台标 + 综艺花字 + 进入演播厅 ──
          <motion.div key="live" initial={{ opacity: 0, scale: bold ? 0.985 : 1 }} animate={{ opacity: 1, scale: 1 }} transition={perso.panel} className="absolute inset-0 z-10 flex flex-col items-center justify-center px-7 text-center">
            {/* 频道台标 chip */}
            <div className="mb-5 flex items-center gap-2 rounded-full border border-primary/50 bg-black/40 px-3 py-1">
              <RecDot size="h-1.5 w-1.5" bold={bold} />
              <span className="text-xs font-bold tracking-[3px] text-primary">{skin.label}</span>
            </div>

            {/* 综艺花字台标（带星 + ON AIR 斜章） */}
            <div className="relative mb-4">
              <Sparkle className="-left-5 -top-3 text-lg" delay={0} bold={bold} />
              <Sparkle className="-right-4 top-1 text-sm" delay={0.7} bold={bold} />
              <Sparkle className="-bottom-2 left-6 text-base" delay={1.3} bold={bold} />
              <motion.h2
                initial={bold ? { rotate: -3, scale: 0.96 } : false}
                animate={{ rotate: -3, scale: 1 }}
                transition={perso.panel}
                className="text-[2rem] font-black leading-[1.05] sm:text-[2.4rem]"
                style={fancy(3.5)}
              >
                {skin.heroTitle}
              </motion.h2>
              <span className="absolute -right-8 -top-4 rotate-12 rounded border-2 border-[#ff2e2e] px-1.5 py-0.5 text-[10px] font-black tracking-wider text-[#ff2e2e]" style={{ boxShadow: '0 0 8px rgba(255,46,46,0.5)' }}>ON AIR</span>
            </div>

            {/* 副标语：电视下三分之一字幕条 */}
            <div className="mb-9 inline-block bg-black/70 px-3 py-1 text-sm font-semibold text-white" style={{ boxShadow: '3px 3px 0 color-mix(in srgb, var(--color-primary) 80%, #000)' }}>
              {skin.heroSub}
            </div>

            {/* 进入演播厅：光泽 REC 大按钮 + 切台白闪 */}
            <motion.button
              type="button"
              onClick={(e) => { e.stopPropagation(); enter(); }}
              aria-label={skin.enterLabel}
              animate={popping ? { scale: [1, 1.18, 0.92, 1.04, 1] } : { scale: 1 }}
              transition={popping ? { duration: 0.24, ease: 'easeOut' } : perso.control}
              whileTap={popping ? undefined : { scale: 0.95 }}
              className="relative overflow-hidden rounded-full border-[3px] border-black px-8 py-3"
              style={{ background: 'var(--color-primary)', boxShadow: '0 5px 0 #000, 0 8px 14px rgba(0,0,0,0.5)' }}
            >
              {/* 顶部高光 */}
              <span aria-hidden className="pointer-events-none absolute inset-x-1 top-0.5 h-1/2 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.6), transparent)' }} />
              {/* 光泽扫掠 */}
              {bold && (
                <motion.span aria-hidden className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)' }} initial={{ left: '-40%' }} animate={{ left: ['-40%', '140%'] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }} />
              )}
              <span className="relative flex items-center gap-2.5 text-xl font-black tracking-widest text-black">
                <RecDot size="h-3 w-3" bold={bold} />
                {skin.enterLabel}
              </span>
            </motion.button>
            <div className="mt-3 text-[11px] tracking-widest text-white/45">轻点开播 · 进入</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部「观众来信」滚动字幕条（弹幕的电视形态） */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t-2 border-primary/60 bg-black/80 py-1.5">
        <span className="ml-2 shrink-0 bg-primary px-2 py-0.5 text-[11px] font-black tracking-wider text-black">❯ 观众来信</span>
        <div className="relative flex-1 overflow-hidden">
          {bold ? (
            <motion.div className="flex whitespace-nowrap text-xs text-primary/90" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}>
              <span className="pr-8">{ticker}</span>
              <span className="pr-8" aria-hidden>{ticker}</span>
            </motion.div>
          ) : (
            <div className="truncate text-xs text-primary/90">{posts[0]}</div>
          )}
        </div>
      </div>

      {/* 切台白闪（进入瞬间） */}
      {popping && bold && (
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-40 bg-white" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.85, 0] }} transition={{ duration: 0.24, ease: 'easeOut' }} />
      )}
    </motion.div>
  );
};
