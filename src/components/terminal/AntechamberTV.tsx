/**
 * AntechamberTV — F3 玄关「TV 特别节目」皮肤（黄主题）。
 *
 * P4 频道主页按视觉稿重做：亮黄节目舞台、天空蓝斜窗、04 巨号、黑色斜题板、
 * 频道条、节目按钮与观众来信 ticker。真实交互只保留返回和进入演播厅，其他层
 * 全部 aria-hidden，避免装饰抢焦点。
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { getMotionPersonality } from '@/utils/motion';
import { triggerLightHaptic, triggerThemeSwitchFeedback } from '@/utils/feedback';
import { CRT_EASE, fancy } from './tvKit';
import type { TerminalSkin } from '@/utils/terminalSkin';

interface Props {
  skin: TerminalSkin;
  onEnter: () => void;
  onBack: () => void;
  danmakuPool: string[];
}

let _tvIntroSeen = false;

/** CRT 雪花噪点（feTurbulence 灰度），仅调谐时出。 */
const TVStatic = ({ className }: { className?: string }) => (
  <svg className={className} aria-hidden xmlns="http://www.w3.org/2000/svg">
    <filter id="tv-static-noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#tv-static-noise)" />
  </svg>
);

const Flower = ({ className = '' }: { className?: string }) => (
  <span aria-hidden className={`pointer-events-none absolute select-none font-black leading-none text-[#172100] ${className}`}>
    ✽
  </span>
);

const SparkMark = ({ className = '' }: { className?: string }) => (
  <span aria-hidden className={`pointer-events-none absolute select-none font-black leading-none text-[#172100] ${className}`}>
    ✦
  </span>
);

const SignalBars = () => (
  <div aria-hidden className="pointer-events-none absolute right-4 top-[5.8rem] z-[3] flex h-[34rem] items-stretch gap-1.5 opacity-95">
    {['#ff6a00', '#d71920', '#ffe100', '#5be04b', '#20bff2', '#0057ff'].map((color, i) => (
      <span key={color} className="block w-[5px]" style={{ background: color, transform: `translateY(${i % 2 === 0 ? 0 : 14}px)` }} />
    ))}
  </div>
);

const ChannelTag = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute -right-1 top-[4.6rem] z-[4] h-[8.6rem] w-[2.3rem] bg-black text-[#ffe100]"
    style={{ clipPath: 'polygon(0 0, 100% 0, 100% 82%, 68% 100%, 0 86%)' }}
  >
    <div className="flex h-full flex-col items-center justify-start gap-2 pt-3">
      <span className="font-black tracking-[0.18em] [writing-mode:vertical-rl]">CHANNEL 04</span>
      <span className="h-6 w-5 bg-[#ffe100]" style={{ clipPath: 'polygon(0 0, 34% 0, 100% 100%, 66% 100%)' }} />
    </div>
  </div>
);

const SkyShard = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute left-0 top-[4.9rem] z-[1] h-[15.3rem] w-[68%] overflow-hidden"
    style={{
      clipPath: 'polygon(0 24%, 100% 0, 43% 100%, 0 100%)',
    }}
  >
    <img
      src="/assets/terminal/p4-cloud-sky.png"
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: '30% 70%', filter: 'saturate(1.16) contrast(1.08)' }}
    />
    <div className="absolute inset-0 bg-[#00a6ff]/10 mix-blend-screen" />
  </div>
);

export const AntechamberTV = ({ skin, onEnter, onBack, danmakuPool }: Props) => {
  const user = useAppStore((s) => s.user);
  const bold = useBoldness();
  const perso = getMotionPersonality('yellow');
  const [phase, setPhase] = useState<'tune' | 'live'>(() => (bold && !_tvIntroSeen ? 'tune' : 'live'));
  const [popping, setPopping] = useState(false);
  const tuning = phase === 'tune';

  useEffect(() => {
    if (!tuning) return;
    _tvIntroSeen = true;
    const total = skin.awaken.length * 520 + 1000;
    const t = setTimeout(() => setPhase('live'), total);
    return () => clearTimeout(t);
  }, [tuning, skin.awaken.length]);

  useEffect(() => {
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = () => {
    if (popping) return;
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    if (!bold) {
      onEnter();
      return;
    }
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
      className="fixed inset-0 z-[220] overflow-hidden bg-[#ffe100] text-[#172100]"
      onClick={() => tuning && setPhase('live')}
    >
      <AnimatePresence mode="wait">
        {tuning ? (
          <motion.div key="tune" className="absolute inset-0 z-30 bg-[#080804]" exit={{ opacity: 0, transition: { duration: 0.18 } }}>
            <motion.div className="absolute inset-0" animate={{ opacity: [0.55, 0.25, 0.5, 0.18, 0.4] }} transition={{ duration: 0.5, repeat: Infinity }}>
              <TVStatic className="h-full w-full" />
            </motion.div>
            <motion.div aria-hidden className="absolute inset-x-0 h-16" style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.16), transparent)' }} initial={{ top: '-20%' }} animate={{ top: '120%' }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} />

            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
              <div className="mb-5 text-[11px] font-bold tracking-[4px] text-[#ffe100]/80">接通信号 · 调谐中…</div>
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
          <motion.div
            key="live"
            initial={{ opacity: 0, scale: bold ? 0.99 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={perso.panel}
            className="absolute inset-0 z-10 overflow-hidden"
          >
            {/* yellow broadcast stage */}
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#ffe100]" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage: 'radial-gradient(circle, rgba(23,33,0,0.2) 1px, transparent 1.2px)',
                backgroundSize: '7px 7px',
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute left-[-16%] top-[10.3rem] h-[33rem] w-[132%] opacity-80"
              style={{
                background: 'repeating-radial-gradient(circle at 50% 34%, transparent 0 44px, rgba(255,255,255,0.5) 46px 50px, transparent 52px 84px)',
              }}
            />
            <SkyShard />
            <SignalBars />
            <ChannelTag />
            <Flower className="left-[2.7rem] top-[12.2rem] text-[2.7rem]" />
            <Flower className="right-[4.3rem] top-[11.2rem] text-[2.5rem]" />
            <Flower className="bottom-[2.55rem] left-[2.4rem] text-[2.55rem]" />
            <SparkMark className="left-7 top-[19.7rem] text-[1.4rem]" />
            <SparkMark className="right-[3.1rem] top-[29rem] text-[1.7rem]" />

            {/* back + HUD */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBack(); }}
              aria-label="返回"
              className="absolute left-2 top-4 z-30 flex h-9 w-9 items-center justify-center text-[#172100]/80 hover:bg-[#172100]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172100]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <div className="absolute inset-x-0 top-7 z-20 flex items-center justify-between pl-12 pr-8 text-[13px] font-black tracking-[0.12em] text-[#172100] sm:text-[14px]">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#172100]" aria-hidden />
                LIVE · 录制中
              </span>
              <span className="font-mono">CH 04 / 深夜 00:00</span>
            </div>

            {/* huge program number */}
            <div
              aria-hidden
              className="absolute left-[4.2rem] top-[13.1rem] z-[2] select-none text-[9.8rem] font-black italic leading-none text-black sm:left-[5.8rem]"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: '-0.13em',
                textShadow: '0 2px 0 rgba(0,0,0,0.12)',
              }}
            >
              04
            </div>
            <div aria-hidden className="absolute left-[8.6rem] top-[19.9rem] z-[2] h-24 w-28 opacity-70" style={{ backgroundImage: 'radial-gradient(circle, #ffe100 1px, transparent 1.5px)', backgroundSize: '6px 6px', transform: 'skewX(-13deg)' }} />
            <div className="absolute right-[1.15rem] top-[20.9rem] z-[5] rotate-[-6deg] border-2 border-[#172100] bg-[#ffe100] px-2.5 py-0.5 text-[0.82rem] font-black tracking-wide text-[#172100]">
              ON AIR
            </div>

            {/* main title board */}
            <section
              aria-label="本期节目"
              className="absolute left-5 right-[-0.6rem] top-[21.25rem] z-[4] min-h-[11.5rem] bg-[#172100] px-7 pb-7 pt-7 text-left text-white"
              style={{
                clipPath: 'polygon(0 10%, 98% 0, 100% 75%, 93% 100%, 0 88%)',
                transform: 'rotate(-4deg)',
                boxShadow: '0 7px 0 rgba(23,33,0,0.28)',
              }}
            >
              <div aria-hidden className="absolute inset-x-10 bottom-7 h-0.5 bg-[#ffe100]" />
              <h2 className="whitespace-nowrap text-[2.32rem] font-black leading-[1.02] tracking-normal">
                本期节目·录制中
              </h2>
              <div className="mt-4 h-1 w-[78%] bg-[#ffe100]" />
              <p className="mt-3 text-center text-[1.17rem] font-black leading-tight text-[#ffe100]">
                {skin.heroSub}
              </p>
              <div aria-hidden className="absolute bottom-3 left-7 h-16 w-24 opacity-45" style={{ backgroundImage: 'radial-gradient(circle, #ffe100 1px, transparent 1.5px)', backgroundSize: '6px 6px' }} />
            </section>

            {/* enter CTA */}
            <motion.button
              type="button"
              onClick={(e) => { e.stopPropagation(); enter(); }}
              aria-label={skin.enterLabel}
              animate={popping ? { scale: [1, 1.12, 0.93, 1.04, 1] } : { scale: 1 }}
              transition={popping ? { duration: 0.24, ease: 'easeOut' } : perso.control}
              whileTap={popping ? undefined : { scale: 0.96 }}
              className="absolute left-[4.8rem] right-[4.8rem] top-[34.65rem] z-[6] bg-[#ffe100] px-5 py-4 text-center text-[1.82rem] font-black leading-none text-[#172100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#172100]"
              style={{
                clipPath: 'polygon(5% 0, 96% 0, 100% 82%, 92% 100%, 0 100%, 4% 18%)',
                boxShadow: '0 0 0 5px #172100, 9px 9px 0 #172100',
              }}
            >
              <span className="relative z-[1]">{skin.enterLabel} ▶</span>
              <span aria-hidden className="absolute inset-x-6 top-2 h-1 bg-[#172100]/80" />
              <span aria-hidden className="absolute inset-x-6 bottom-2 h-1 bg-[#172100]/80" />
            </motion.button>
            {/* lower broadcast metadata */}
            <div className="absolute bottom-[4.25rem] left-7 z-[4] text-left">
              <div className="mb-2 flex items-center gap-2 text-[0.9rem] font-black tracking-wide">
                <span className="inline-block h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-[#172100]" aria-hidden />
                NEXT SCENE
              </div>
              <div className="h-0.5 w-[7.2rem] bg-[#172100]" />
              <div className="mt-3 flex gap-2">
                <span className="h-3 w-3 bg-[#172100]" />
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="h-3 w-3 border border-[#172100]" />
                ))}
              </div>
            </div>
            <div
              aria-hidden
              className="absolute bottom-[0.45rem] right-[-6.8rem] z-[3] h-[8.9rem] w-[18.4rem] bg-[#172100] text-[#ffe100]"
              style={{ clipPath: 'polygon(20% 15%, 100% 0, 100% 100%, 0 100%, 0 44%)' }}
            >
              <div className="absolute left-[4.65rem] top-[2.35rem] text-[0.68rem] font-black tracking-wide">STATUS CHECK</div>
              <div className="absolute left-[5.65rem] top-[4.05rem] text-[3.4rem] font-black italic leading-none opacity-80" style={{ backgroundImage: 'radial-gradient(circle, #ffe100 1px, transparent 1.5px)', backgroundSize: '6px 6px', WebkitBackgroundClip: 'text', color: 'transparent' }}>
                04
              </div>
              <div className="absolute left-[4.55rem] top-[3.05rem] text-[1.92rem] font-black italic opacity-65">ON CH.</div>
            </div>

            {/* subtle CRT / print texture, much lighter than the previous dark TV screen */}
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[8] opacity-[0.12]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(23,33,0,0.48) 0px, rgba(23,33,0,0.48) 1px, transparent 1px, transparent 3px)' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* bottom ticker */}
      <div className="absolute inset-x-0 bottom-0 z-30 flex h-[3.7rem] items-center gap-3 border-y-2 border-[#ffe100]/70 bg-black px-2">
        <span className="shrink-0 bg-[#ffe100] px-3 py-2 text-[0.86rem] font-black tracking-wide text-black">观众来信 ▶</span>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          {bold ? (
            <motion.div className="flex whitespace-nowrap text-[0.9rem] font-bold text-[#ffe100]" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 27, repeat: Infinity, ease: 'linear' }}>
              <span className="pr-8">{ticker}</span>
              <span className="pr-8" aria-hidden>{ticker}</span>
            </motion.div>
          ) : (
            <div className="truncate text-[0.9rem] font-bold text-[#ffe100]">{posts[0]}</div>
          )}
        </div>
      </div>

      {popping && bold && (
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-40 bg-white" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.85, 0] }} transition={{ duration: 0.24, ease: 'easeOut' }} />
      )}
    </motion.div>
  );
};
