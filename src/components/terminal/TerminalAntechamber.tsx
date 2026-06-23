/**
 * TerminalAntechamber — F3 治疗终端的「玄关 / 阈限层」（重设计阶段 1）。
 *
 * 点入口不直接进终端，而先落在这间「房间」：Persona 觉醒式的逐行文字揭幕（可点击跳过、
 * 本会话只全播一次、D0/reduced-motion 直接出静态）、四周漂浮的鼓励弹幕、中央一枚发光的
 * 「进入」图标——点它才正式进入终端。多一层，但把「进入一个被保护的、不同于日常的空间」
 * 做实，也给三频道（讨论板/TV/怪盗）一个专属的风格展演场。
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { getMotionPersonality } from '@/utils/motion';
import { triggerThemeSwitchFeedback, triggerLightHaptic } from '@/utils/feedback';
import { terminalSkin } from '@/utils/terminalSkin';
import { DanmakuField } from '@/components/terminal/DanmakuField';
import type { ThemeType } from '@/types';

interface Props {
  onEnter: () => void;
  onBack: () => void;
  danmakuPool: string[];
}

const ROOM_BG =
  'linear-gradient(160deg, color-mix(in hsl, var(--color-primary) 14%, #0a0a0d) 0%, color-mix(in hsl, var(--color-primary) 24%, #111118) 55%, #04040a 100%)';

// 本会话是否已全播过觉醒序列（整页刷新即重置）；二次进入直接出静态，不再每次都熬开场
let _introSeen = false;

/** 频道 → 代表性主题，用来取动效性格（怪盗=红 overshoot / TV=黄 CRT / 讨论板=蓝漂浮） */
const persoTheme = (channel: string): ThemeType =>
  channel === 'tv' ? 'yellow' : channel === 'thief' ? 'red' : 'blue';

export const TerminalAntechamber = ({ onEnter, onBack, danmakuPool }: Props) => {
  const user = useAppStore((s) => s.user);
  const skin = terminalSkin(user?.theme);
  const bold = useBoldness();
  const perso = getMotionPersonality(persoTheme(skin.channel));

  // 觉醒序列只在「允许大胆动效 且 本会话首次」时全播，否则直接进 rest 静态
  const [phase, setPhase] = useState<'intro' | 'rest'>(() => (bold && !_introSeen ? 'intro' : 'rest'));

  useEffect(() => {
    if (phase !== 'intro') return;
    _introSeen = true;
    // 三行揭幕（每行 ~0.55s 错峰）播完后自动落到 rest；可被点击跳过
    const total = skin.awaken.length * 550 + 900;
    const t = setTimeout(() => setPhase('rest'), total);
    return () => clearTimeout(t);
  }, [phase, skin.awaken.length]);

  const enter = () => {
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    onEnter();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: bold ? 0.4 : 0.2 }}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ background: ROOM_BG }}
      onClick={() => phase === 'intro' && setPhase('rest')}
    >
      {/* 四周向中心压暗的房间 vignette */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.55) 100%)' }} />

      {/* 漂浮弹幕：玄关里它是主角（房间里其他人的声音） */}
      <div aria-hidden className="absolute inset-0">
        <DanmakuField messages={danmakuPool} count={9} />
      </div>

      {/* 返回（不困住用户） */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onBack(); }}
        aria-label="返回"
        className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-white/60 hover:bg-white/10"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      <AnimatePresence mode="wait">
        {phase === 'intro' ? (
          <motion.div
            key="intro"
            className="relative z-[1] max-w-md text-center"
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
          >
            {skin.awaken.map((line, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 20, filter: 'blur(8px)', clipPath: 'inset(0 100% 0 0)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)', clipPath: 'inset(0 0% 0 0)' }}
                transition={{ delay: i * 0.55 + 0.25, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                className="mb-1 text-2xl font-black leading-relaxed text-white"
                style={{ textShadow: '0 2px 24px color-mix(in hsl, var(--color-primary) 60%, transparent)' }}
              >
                {line}
              </motion.p>
            ))}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: skin.awaken.length * 0.55 + 0.4 }}
              className="mt-6 text-[11px] tracking-widest text-white/35"
            >
              轻点跳过
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="rest"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={perso.panel}
            className="relative z-[1] flex flex-col items-center text-center"
          >
            {/* 频道台标 */}
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
              <span className="text-xs font-bold tracking-[3px] text-primary">{skin.label}</span>
            </div>
            <div className="mb-10 text-[11px] text-white/45">{skin.tagline}</div>

            {/* 进入图标：发光菱形 ◈（呼应全站消失点），呼吸 + 光环 */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); enter(); }}
              aria-label={skin.enterLabel}
              className="group relative flex h-28 w-28 items-center justify-center"
            >
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full border border-primary/40"
                animate={bold ? { scale: [1, 1.18, 1], opacity: [0.5, 0, 0.5] } : { opacity: 0.4 }}
                transition={bold ? { duration: 2.4, repeat: Infinity, ease: 'easeOut' } : undefined}
              />
              <motion.span
                aria-hidden
                className="absolute inset-3 rounded-full"
                style={{ background: 'radial-gradient(circle, color-mix(in hsl, var(--color-primary) 45%, transparent) 0%, transparent 70%)' }}
                animate={bold ? { opacity: [0.35, 0.7, 0.35] } : { opacity: 0.5 }}
                transition={bold ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
              />
              <motion.span
                className="relative text-5xl text-primary"
                style={{ textShadow: '0 0 28px color-mix(in hsl, var(--color-primary) 70%, transparent)' }}
                whileTap={{ scale: 0.9 }}
                animate={bold ? { rotate: [0, 6, 0, -6, 0] } : undefined}
                transition={bold ? { duration: 6, repeat: Infinity, ease: 'easeInOut' } : undefined}
              >
                ◈
              </motion.span>
            </button>

            <div className="mt-6 text-sm font-semibold tracking-wide text-white/85">{skin.enterLabel}</div>
            <div className="mt-1 text-[11px] text-white/35">轻点进入</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
