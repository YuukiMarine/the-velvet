/**
 * YearRecapStage —— 年度开场（v2.7.0.6）。
 *
 * 点「生成年度总结」后先放一段「这一年的你」：一页一张卡，点屏幕翻下一张，右上「跳过」直达最后的信。
 * 信在后台写；最后一张停在「{角色}给你写了一封信」，写好了点开就是正文，还没写好可以先去看它边写。
 * 数字来自 YearRecap（utils/yearRecap 本机算、定格存进总结），某项没数据那张卡就跳过。
 *
 * 四个频道各换一身，零件全部复用现成 kit：
 *   蓝 / 粉（P3）：水面底 + 斜切白板 + 幽灵大字，卡片斜着滑入；
 *   黄（P4）    ：黄底日轮 + 奶油贴纸板 + 黑题板 + 橙数字贴纸，卡片弹入；
 *   红（P5）    ：黑舞台红碎块 + 米白碎纸板 + 剪报拼字标题，卡片砸入（红频道不跟夜间模式）；
 *   自定义      ：主题色渐变 + 干净的白卡，淡入上浮。
 * 动效只动 transform / opacity；动效开关关着（useBoldness=false）时只淡入淡出、数字直接给终值。
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { YearRecap } from '@/types';
import type { UIChannel } from '@/ui/channel';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBoldness } from '@/utils/boldness';
import { useBackHandler } from '@/utils/useBackHandler';
import { useModalA11y } from '@/utils/useModalA11y';
import { useFeedbackOnce } from '@/utils/useFeedbackOnce';
import { triggerLevelFeedback, triggerLightHaptic } from '@/utils/feedback';
import { zClass } from '@/utils/zIndex';
import { db } from '@/db';
import { TAROT_BY_ID } from '@/constants/tarot';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';
import { P3R, slantClip, GhostWords } from '@/components/p3r/kit';
import { P5R, P5_FONT, P5_TITLE_FONT, P5CollageTitle, P5Panel, P5Slab, P5Dots, P5Star, P5StarOutline } from '@/components/p5r/kit';
import { P4Sparkle, P4Flower, P4SunRings, P4StickerPanel, P4NumberSticker } from '@/ui/p4Kit';
import { Plate } from '@/components/p4r/cutins';

// ── 对外 ─────────────────────────────────────────────────────────────────────

export type RecapLetterState =
  | { kind: 'writing'; phase: 'preparing' | 'thinking' | 'streaming'; progress?: number; chars?: number }
  | { kind: 'ready' }
  | { kind: 'error'; message?: string };

interface YearRecapStageProps {
  open: boolean;
  recap: YearRecap;
  presetName: string;
  presetIcon?: string;
  userName?: string;
  letter: RecapLetterState;
  /** 拆信 / 先去看它边写：关开场、落到信的正文 */
  onOpenLetter: () => void;
  /** 返回键 / ESC */
  onClose: () => void;
}

type PageKey = 'cover' | 'days' | 'night' | 'growth' | 'streak' | 'highlights' | 'countdown' | 'fate' | 'memory' | 'letter';

const GHOST: Record<PageKey, string> = {
  cover: 'THE YEAR', days: 'DAYS', night: 'MIDNIGHT', growth: 'GROWTH', streak: 'STREAK',
  highlights: 'HIGHLIGHTS', countdown: 'COUNTDOWN', fate: 'FATE', memory: 'MEMORIES', letter: 'LETTER',
};

/** 按数据排出这一年要放的卡；没数据的跳过，首尾两张恒在 */
export function recapPages(r: YearRecap): PageKey[] {
  const p: PageKey[] = ['cover'];
  if (r.records > 0) p.push('days');
  if (r.lateNight) p.push('night');
  if (r.points > 0) p.push('growth');
  if ((r.streak && r.streak.days >= 2) || r.todos) p.push('streak');
  if (r.highlights.length || r.photoIds.length) p.push('highlights');
  if (r.countdown) p.push('countdown');
  if (r.tarot || r.wishes) p.push('fate');
  if (r.memory) p.push('memory');
  p.push('letter');
  return p;
}

// ── 小工具 ───────────────────────────────────────────────────────────────────

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const md = (k: string) => { const d = new Date(`${k}T12:00:00`); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const mdw = (k: string) => { const d = new Date(`${k}T12:00:00`); return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`; };
const shortMd = (k: string) => { const d = new Date(`${k}T12:00:00`); return `${d.getMonth() + 1}/${d.getDate()}`; };
/** 开场只放一小会儿，读一次当下的夜间模式就够 */
const isDarkMode = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

/** 数字从 0 滚到终值（动效关着直接给终值） */
function useCountUp(target: number, run: boolean, ms = 900): number {
  const [v, setV] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run || target <= 0) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

// ── 频道皮 ───────────────────────────────────────────────────────────────────

interface Skin {
  /** 舞台上（卡片外）的字色 */
  onStage: string;
  onStageSub: string;
  /** 卡面上的字色 / 强调色 */
  ink: string;
  sub: string;
  accent: string;
  accent2: string;
  track: string;
  font: string;
  numFont: string;
  numStyle?: CSSProperties;
  /** 引文块（最晚的一夜 / 你的记忆） */
  quote: CSSProperties;
  /** 小日期签 */
  chip: CSSProperties;
  enter: {
    initial: Record<string, number | string>;
    animate: Record<string, number | string>;
    exit: Record<string, number | string>;
    transition: Record<string, unknown>;
  };
}

const P3_TITLE_FONT = '"Noto Sans SC Black", "Velvet Sans SC", sans-serif';

const SKINS: Record<UIChannel, Skin> = {
  p3: {
    onStage: P3R.ink, onStageSub: P3R.inkSoft,
    ink: P3R.ink, sub: P3R.grey, accent: P3R.blue, accent2: P3R.cyan, track: 'rgba(53,209,232,0.2)',
    font: 'inherit', numFont: P3_TITLE_FONT, numStyle: { fontStyle: 'italic' },
    quote: { background: P3R.cyanFaint, clipPath: slantClip(10), color: P3R.ink },
    chip: { background: P3R.blue, color: '#fff', clipPath: slantClip(5) },
    enter: {
      initial: { x: 72, opacity: 0, skewX: -8 },
      animate: { x: 0, opacity: 1, skewX: 0 },
      exit: { x: -72, opacity: 0, skewX: 6 },
      transition: { type: 'spring', stiffness: 320, damping: 30 },
    },
  },
  p4: {
    // 舞台上的字跟频道墨色走：夜间黄频道舞台换深紫（--p4-stage），墨色翻浅
    onStage: 'var(--ui-ink, #131313)', onStageSub: 'var(--ui-muted, #837a58)',
    ink: '#131313', sub: 'rgba(19,19,19,0.6)', accent: 'var(--p4-orange, #f9a11b)', accent2: '#1668d8', track: 'rgba(19,19,19,0.12)',
    font: 'inherit', numFont: 'inherit',
    quote: { background: '#fffbe8', borderRadius: 16, border: '3px solid #131313', color: '#131313' },
    chip: { background: '#131313', color: '#fff6d0', borderRadius: 999 },
    enter: {
      initial: { scale: 0.78, rotate: -6, opacity: 0 },
      animate: { scale: 1, rotate: 0, opacity: 1 },
      exit: { scale: 0.9, rotate: 5, opacity: 0 },
      transition: { type: 'spring', stiffness: 330, damping: 18 },
    },
  },
  p5: {
    onStage: P5R.white, onStageSub: P5R.greyLight,
    ink: P5R.ink, sub: P5R.grey, accent: P5R.red, accent2: P5R.ink, track: P5R.paperDim,
    font: P5_FONT, numFont: P5_TITLE_FONT, numStyle: { textShadow: `3px 3px 0 ${P5R.ink}` },
    quote: { background: P5R.ink, color: P5R.paper, clipPath: 'polygon(1% 4%, 99% 0, 100% 94%, 0 100%)' },
    chip: { background: P5R.red, color: P5R.white, clipPath: 'polygon(6% 0, 100% 8%, 94% 100%, 0 90%)' },
    enter: {
      initial: { scale: 1.3, rotate: 7, opacity: 0 },
      animate: { scale: 1, rotate: 0, opacity: 1 },
      exit: { x: -44, rotate: -6, opacity: 0 },
      transition: { type: 'spring', stiffness: 430, damping: 24 },
    },
  },
  neutral: {
    onStage: '#ffffff', onStageSub: 'rgba(255,255,255,0.78)',
    ink: '#111827', sub: '#6b7280', accent: 'rgb(var(--color-primary-rgb, 59 130 246))', accent2: '#f59e0b', track: 'rgba(17,24,39,0.08)',
    font: 'inherit', numFont: 'inherit',
    quote: { background: 'rgba(17,24,39,0.05)', borderRadius: 16, color: '#111827' },
    chip: { background: 'rgb(var(--color-primary-rgb, 59 130 246))', color: '#fff', borderRadius: 999 },
    enter: {
      initial: { y: 28, opacity: 0 },
      animate: { y: 0, opacity: 1 },
      exit: { y: -20, opacity: 0 },
      transition: { type: 'spring', stiffness: 260, damping: 28 },
    },
  },
};

/** 舞台底（整屏，aria-hidden） */
function StageBackdrop({ channel, page, anim }: { channel: UIChannel; page: number; anim: boolean }) {
  if (channel === 'p3') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: P3R.bg }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'url(/assets/terminal/p3-water-wide.png)', backgroundSize: 'cover', backgroundPosition: 'center top', opacity: 0.3 }} />
        <div className="absolute inset-0" style={{ background: 'var(--p3r-veil-grad, linear-gradient(180deg, rgba(238,245,249,0.35) 0%, rgba(238,245,249,0.82) 58%, rgba(238,245,249,0.95) 100%))' }} />
        {/* 翻页时从中心推开一圈水波（蓝频道签名动效） */}
        {anim && (
          <motion.div key={page} className="absolute left-1/2 top-1/2 rounded-full" style={{ width: 40, height: 40, x: '-50%', y: '-50%', border: `10px solid ${P3R.cyan}` }}
            initial={{ scale: 0.2, opacity: 0.55 }} animate={{ scale: 18, opacity: 0 }} transition={{ duration: 1.1, ease: [0.16, 0.7, 0.35, 1] }} />
        )}
      </div>
    );
  }
  if (channel === 'p4') {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: 'var(--p4-stage, var(--ui-bg, #ffd900))' }}>
        {/* 夜间舞台换深紫、字翻浅：日轮压暗，不然浅字压在橙盘上看不清 */}
        <motion.div className="absolute left-1/2 top-[46%]" style={{ x: '-50%', y: '-50%', opacity: isDarkMode() ? 0.28 : 1 }}
          animate={anim ? { rotate: 360 } : undefined} transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}>
          <P4SunRings size={620} />
        </motion.div>
        <P4Sparkle size={34} color="#1668d8" className="absolute left-[8%] top-[16%]" />
        <P4Flower size={46} color="#fff6d0" className="absolute right-[7%] top-[22%]" />
        <P4Sparkle size={24} color="#fff6d0" className="absolute right-[12%] bottom-[16%]" />
        <P4Flower size={34} color="#1668d8" className="absolute left-[10%] bottom-[12%]" />
      </div>
    );
  }
  if (channel === 'p5') {
    const rot = [14, -9, 6, -12, 10, -7, 12, -10, 8, -5][page % 10];
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: P5R.ink }}>
        <motion.div className="absolute inset-0" key={page} initial={anim ? { opacity: 0, x: 40 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
          <P5Slab color={P5R.red} seed={21 + page} rot={rot} style={{ right: -80, top: -40, width: 260, height: 230 }} />
          <P5Slab color={P5R.redDeep} seed={41 + page} rot={-rot} style={{ left: -100, bottom: -60, width: 280, height: 240 }} />
        </motion.div>
        <P5Dots className="absolute" style={{ left: 0, top: 110, width: 90, height: 140 }} color="#57534c" />
        <P5Dots className="absolute" style={{ right: 0, bottom: '22%', width: 80, height: 150 }} dot={1.3} gap={8} color="#4a4741" />
        <P5StarOutline size={30} color="#57534c" rot={-14} className="absolute" style={{ right: 26, top: '34%' }} />
        <P5Star size={16} fill="#5c0004" rot={12} className="absolute" style={{ left: 22, top: '62%' }} />
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{
      // 渐变叠在一层实色上：舞台必须不透明，否则会透出底下的总结弹层
      background: 'radial-gradient(120% 70% at 20% 0%, rgb(var(--color-primary-rgb, 59 130 246)) 0%, rgb(var(--color-primary-rgb, 59 130 246) / 0.45) 45%, transparent 78%), #111827',
    }} />
  );
}

/** 每页背景的一个英文大字（蓝：幽灵字；红：黑底浅灰大字；黄 / 中性：极淡） */
function PageGhost({ channel, word }: { channel: UIChannel; word: string }) {
  if (channel === 'p3') {
    return <GhostWords words={[word]} parallax={false} className="left-[-18px] top-[10%]" style={{ fontSize: '4.6rem' }} />;
  }
  const color = channel === 'p5' ? 'rgba(248,248,246,0.07)' : channel === 'p4' ? 'rgba(19,19,19,0.07)' : 'rgba(255,255,255,0.08)';
  return (
    <div aria-hidden className="pointer-events-none absolute left-[-12px] top-[9%] select-none whitespace-nowrap font-black italic leading-none"
      style={{ fontSize: '4.4rem', color, transform: 'rotate(-10deg)', fontFamily: channel === 'p5' ? P5_TITLE_FONT : undefined }}>
      {word}
    </div>
  );
}

/** 卡面容器 */
function Panel({ channel, seed, children }: { channel: UIChannel; seed: number; children: ReactNode }) {
  if (channel === 'p3') {
    return (
      <div className="relative" style={{ filter: 'drop-shadow(0 16px 28px rgba(38,96,140,0.16))' }}>
        <div className="relative px-7 pb-7 pt-6" style={{ clipPath: slantClip(22), background: P3R.panelGlass }}>
          <span aria-hidden className="absolute bottom-0 right-4 h-4 w-6" style={{ background: P3R.cyan, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
          {children}
        </div>
      </div>
    );
  }
  if (channel === 'p4') {
    return (
      <P4StickerPanel bg="#fff6d0" outline="#131313" pad={4} rotate={-1} cuts={[22, 12, 26, 12]} contentClassName="px-6 pb-7 pt-6">
        {children}
      </P4StickerPanel>
    );
  }
  if (channel === 'p5') {
    return (
      <P5Panel seed={600 + seed} jag={12} frame={4} keyline={3} face={P5R.paper} shadow={{ x: 7, y: 9, color: P5R.red }} bodyClassName="px-6 pb-7 pt-6">
        {children}
      </P5Panel>
    );
  }
  return <div className="rounded-3xl bg-white px-6 pb-7 pt-6 shadow-2xl">{children}</div>;
}

/** 卡片标题 */
function CardTitle({ channel, text, anim }: { channel: UIChannel; text: string; anim: boolean }) {
  if (channel === 'p3') {
    return (
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="h-[26px] w-[11px] shrink-0" style={{ background: P3R.blue, clipPath: slantClip(4) }} />
        <span className="text-[26px] font-black italic leading-none" style={{ color: P3R.ink, fontFamily: P3_TITLE_FONT }}>{text}</span>
      </div>
    );
  }
  if (channel === 'p4') {
    return <div className="-ml-1 inline-block"><Plate delay={0.12} anim={anim} size={24} rot={-2}>{text}</Plate></div>;
  }
  if (channel === 'p5') {
    return (
      <>
        <P5CollageTitle text={text} size={22} />
        <span className="sr-only">{text}</span>
      </>
    );
  }
  return <div className="text-[24px] font-black leading-tight text-gray-900">{text}</div>;
}

function Eyebrow({ skin, text }: { skin: Skin; text: string }) {
  return <div className="mb-2 text-[11px] font-black tracking-[0.28em]" style={{ color: skin.accent, fontFamily: skin.font }}>{text}</div>;
}

/** 大数字 + 单位；黄频道装进橙色数字贴纸 */
function Big({ channel, skin, value, unit, anim, prefix = '' }: { channel: UIChannel; skin: Skin; value: number | string; unit?: string; anim: boolean; prefix?: string }) {
  const n = typeof value === 'number' ? value : 0;
  const counted = useCountUp(n, anim && typeof value === 'number');
  const shown = typeof value === 'number' ? `${prefix}${counted}` : value;
  const num = (
    <span className="tabular-nums" style={{ fontFamily: skin.numFont, ...skin.numStyle }}>{shown}</span>
  );
  if (channel === 'p4') {
    return (
      <div className="mt-4">
        <P4NumberSticker><span className="text-[46px]">{num}{unit && <span className="ml-1 text-[20px]">{unit}</span>}</span></P4NumberSticker>
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-baseline gap-1.5 leading-none" style={{ color: channel === 'p5' ? P5R.redHot : skin.accent }}>
      <span className="text-[56px] font-black">{num}</span>
      {unit && <span className="text-[20px] font-black" style={{ color: skin.ink, fontFamily: skin.font }}>{unit}</span>}
    </div>
  );
}

function Sub({ skin, children }: { skin: Skin; children: ReactNode }) {
  return <div className="mt-2 text-[14px] font-bold leading-relaxed" style={{ color: skin.ink, fontFamily: skin.font }}>{children}</div>;
}

function Caption({ skin, children }: { skin: Skin; children: ReactNode }) {
  return <div className="mt-4 text-[12.5px] font-semibold leading-relaxed" style={{ color: skin.sub, fontFamily: skin.font }}>{children}</div>;
}

/** 条目逐条浮入 */
const stagger = (anim: boolean, i: number) => (anim
  ? { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.25 + i * 0.12, type: 'spring' as const, stiffness: 300, damping: 26 } }
  : {});

// ── 各页内容 ─────────────────────────────────────────────────────────────────

interface Ctx {
  r: YearRecap;
  skin: Skin;
  channel: UIChannel;
  anim: boolean;
  presetName: string;
  presetIcon?: string;
  userName?: string;
  letter: RecapLetterState;
  onOpenLetter: () => void;
}

function CoverPage({ r, skin, channel, anim, userName }: Ctx) {
  const whole = r.asOf === `${r.year}-12-31`;
  return (
    <div className="text-center">
      <div className="text-[12px] font-black tracking-[0.4em]" style={{ color: channel === 'p5' ? P5R.red : skin.accent, fontFamily: skin.font }}>THE VELVET · {r.year}</div>
      <motion.div
        className="mt-3 font-black leading-none tabular-nums"
        style={{ fontSize: 'min(34vw, 150px)', color: channel === 'p5' ? P5R.white : channel === 'p4' ? 'var(--ui-ink, #131313)' : channel === 'p3' ? P3R.blue : '#fff', fontFamily: skin.numFont, fontStyle: channel === 'p3' ? 'italic' : undefined,
          textShadow: channel === 'p5' ? `6px 6px 0 ${P5R.red}` : channel === 'p4' ? `5px 5px 0 ${isDarkMode() ? '#ffd900' : '#fff6d0'}` : undefined }}
        initial={anim ? { scale: 0.6, opacity: 0, letterSpacing: '0.2em' } : false}
        animate={{ scale: 1, opacity: 1, letterSpacing: '0em' }}
        transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 0.1 }}
      >
        {r.year}
      </motion.div>
      <motion.div className="mt-5 flex justify-center" {...stagger(anim, 1)}>
        {channel === 'p5' ? <P5CollageTitle text="这一年的你" size={26} /> : channel === 'p4' ? <Plate delay={0.3} anim={anim} size={28}>这一年的你</Plate> : (
          <span className="text-[26px] font-black" style={{ color: channel === 'p3' ? P3R.ink : '#fff', fontStyle: channel === 'p3' ? 'italic' : undefined, fontFamily: channel === 'p3' ? P3_TITLE_FONT : undefined }}>这一年的你</span>
        )}
      </motion.div>
      <motion.div className="mt-4 text-[13px] font-bold" style={{ color: skin.onStageSub, fontFamily: skin.font }} {...stagger(anim, 2)}>
        {userName ? `${userName}，` : ''}{whole ? `这是你的一整个 ${r.year}` : `从1月1日到${md(r.asOf)}，一共 ${r.spanDays} 天`}
      </motion.div>
    </div>
  );
}

function DaysPage({ r, skin, channel, anim }: Ctx) {
  const max = Math.max(1, ...r.monthly);
  const peak = r.monthly.indexOf(Math.max(...r.monthly));
  return (
    <Panel channel={channel} seed={1}>
      <Eyebrow skin={skin} text="DAYS" />
      <CardTitle channel={channel} text="来过的日子" anim={anim} />
      <Big channel={channel} skin={skin} value={r.daysRecorded} unit="天" anim={anim} />
      <Sub skin={skin}>{r.spanDays} 天里来过 {r.daysRecorded} 天，记下 {r.records} 条</Sub>
      <div className="mt-5 flex h-[72px] items-end gap-[5px]" aria-hidden>
        {r.monthly.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <motion.div className="w-full"
              style={{ background: i === peak ? skin.accent : skin.track, height: `${Math.max(6, (n / max) * 56)}px`, transformOrigin: 'bottom', borderRadius: channel === 'neutral' || channel === 'p4' ? 4 : 0 }}
              initial={anim ? { scaleY: 0 } : false} animate={{ scaleY: 1 }} transition={{ delay: 0.3 + i * 0.04, type: 'spring', stiffness: 260, damping: 22 }} />
            <span className="text-[9px] font-bold tabular-nums" style={{ color: skin.sub }}>{i + 1}</span>
          </div>
        ))}
      </div>
      <Caption skin={skin}>
        {r.monthly[peak] > 0 ? `${peak + 1} 月来得最勤（${r.monthly[peak]} 条）` : ''}
        {r.habit ? `${r.monthly[peak] > 0 ? '；' : ''}多半是${r.habit.label}写下的` : ''}
      </Caption>
    </Panel>
  );
}

function NightPage({ r, skin, channel, anim }: Ctx) {
  const ln = r.lateNight!;
  const d = new Date(ln.at);
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return (
    <Panel channel={channel} seed={2}>
      <Eyebrow skin={skin} text="MIDNIGHT" />
      <CardTitle channel={channel} text="最晚的一夜" anim={anim} />
      <Big channel={channel} skin={skin} value={`${hh}:${mm}`} anim={anim} />
      <Sub skin={skin}>{mdw(key)} · {d.getHours() < 5 ? '凌晨' : '深夜'}</Sub>
      <motion.div className="mt-4 px-4 py-3 text-[15px] font-bold leading-relaxed" style={{ ...skin.quote, fontFamily: skin.font }} {...stagger(anim, 1)}>
        “{ln.text}”
      </motion.div>
      <Caption skin={skin}>那天夜里，你写下了这一句。</Caption>
    </Panel>
  );
}

function GrowthPage({ r, skin, channel, anim }: Ctx) {
  const top = [...r.attrs].sort((a, b) => b.points - a.points)[0];
  const max = Math.max(1, ...r.attrs.map(a => a.points));
  const prev = r.prevPoints;
  return (
    <Panel channel={channel} seed={3}>
      <Eyebrow skin={skin} text="GROWTH" />
      <CardTitle channel={channel} text="长成的样子" anim={anim} />
      <Big channel={channel} skin={skin} value={r.points} prefix="+" unit="点" anim={anim} />
      {top && top.points > 0 && <Sub skin={skin}>长得最多的是「{top.name}」，+{top.points}</Sub>}
      <div className="mt-4 space-y-2">
        {r.attrs.map((a, i) => (
          <div key={a.id} className="flex items-center gap-2.5">
            <span className="w-11 shrink-0 truncate text-[12px] font-black" style={{ color: skin.ink, fontFamily: skin.font }}>{a.name}</span>
            <div className="h-[9px] flex-1 overflow-hidden" style={{ background: skin.track, borderRadius: channel === 'neutral' || channel === 'p4' ? 999 : 0 }}>
              <motion.div className="h-full" style={{ background: a.id === top?.id ? skin.accent : channel === 'p5' ? P5R.ink : skin.accent2, transformOrigin: 'left', width: `${(a.points / max) * 100}%` }}
                initial={anim ? { scaleX: 0 } : false} animate={{ scaleX: 1 }} transition={{ delay: 0.3 + i * 0.07, type: 'spring', stiffness: 220, damping: 26 }} />
            </div>
            <span className="w-9 shrink-0 text-right text-[12px] font-black tabular-nums" style={{ color: skin.ink }}>+{a.points}</span>
          </div>
        ))}
      </div>
      {prev !== undefined && (
        <Caption skin={skin}>
          {r.points > prev ? `比去年多 ${r.points - prev} 点（去年 +${prev}）` : r.points < prev ? `比去年少 ${prev - r.points} 点（去年 +${prev}）` : `和去年一样，都是 +${prev}`}
        </Caption>
      )}
    </Panel>
  );
}

function StreakPage({ r, skin, channel, anim }: Ctx) {
  const s = r.streak && r.streak.days >= 2 ? r.streak : undefined;
  return (
    <Panel channel={channel} seed={4}>
      <Eyebrow skin={skin} text="STREAK" />
      <CardTitle channel={channel} text="没断过的日子" anim={anim} />
      {s ? (
        <>
          <Big channel={channel} skin={skin} value={s.days} unit="天" anim={anim} />
          <Sub skin={skin}>{`${md(s.start)}到${md(s.end)}，一天没落下`}</Sub>
        </>
      ) : r.todos ? (
        <>
          <Big channel={channel} skin={skin} value={r.todos.checkins} unit="次" anim={anim} />
          <Sub skin={skin}>这一年的待办打卡</Sub>
        </>
      ) : null}
      {s && r.todos && (
        <motion.div className="mt-4 px-4 py-3 text-[14px] font-bold leading-relaxed" style={{ ...skin.quote, fontFamily: skin.font }} {...stagger(anim, 1)}>
          待办打卡 {r.todos.checkins} 次{r.todos.top ? `，最勤的是「${r.todos.top.title}」（${r.todos.top.count} 次）` : ''}
        </motion.div>
      )}
      {!s && r.todos?.top && <Caption skin={skin}>最勤的是「{r.todos.top.title}」，{r.todos.top.count} 次</Caption>}
    </Panel>
  );
}

/** 配图缩略图：只在本机有（不上云），重温时本机没有就不画 */
function PhotoStrip({ ids, skin, anim }: { ids: string[]; skin: Skin; anim: boolean }) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    if (!ids.length) return;
    let alive = true;
    db.activityImages.where('activityId').anyOf(ids).toArray()
      .then(rows => {
        if (!alive) return;
        const first = new Map<string, string>();
        for (const row of rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())) {
          if (!first.has(row.activityId)) first.set(row.activityId, row.thumbDataUrl);
        }
        setThumbs(ids.map(id => first.get(id)).filter((x): x is string => !!x).slice(0, 6));
      })
      .catch(() => { /* 取不到就不画 */ });
    return () => { alive = false; };
  }, [ids]);
  if (!thumbs.length) return null;
  return (
    <div className="mt-4 grid grid-cols-3 gap-2" aria-label={`这一年留下的 ${thumbs.length} 张照片`}>
      {thumbs.map((src, i) => (
        <motion.img key={i} src={src} alt="" className="aspect-square w-full object-cover" style={{ borderRadius: 10, boxShadow: `0 0 0 2px ${skin.track}` }} {...stagger(anim, i + 3)} />
      ))}
    </div>
  );
}

function HighlightsPage({ r, skin, channel, anim }: Ctx) {
  return (
    <Panel channel={channel} seed={5}>
      <Eyebrow skin={skin} text="HIGHLIGHTS" />
      <CardTitle channel={channel} text="高光时刻" anim={anim} />
      <ul className="mt-5 space-y-3">
        {r.highlights.map((h, i) => (
          <motion.li key={i} className="flex items-start gap-3" {...stagger(anim, i)}>
            <span className="mt-0.5 shrink-0 px-2 py-0.5 text-[11px] font-black tabular-nums" style={{ ...skin.chip, fontFamily: skin.font }}>{shortMd(h.date)}</span>
            <span className="text-[15px] font-bold leading-snug" style={{ color: skin.ink, fontFamily: skin.font }}>{h.text}</span>
          </motion.li>
        ))}
      </ul>
      <PhotoStrip ids={r.photoIds} skin={skin} anim={anim} />
    </Panel>
  );
}

function CountdownPage({ r, skin, channel, anim }: Ctx) {
  const c = r.countdown!;
  return (
    <Panel channel={channel} seed={6}>
      <Eyebrow skin={skin} text="COUNTDOWN" />
      <CardTitle channel={channel} text="倒计时" anim={anim} />
      {c.reached.length ? (
        <>
          <Big channel={channel} skin={skin} value={c.reached.length} unit="个" anim={anim} />
          <Sub skin={skin}>倒计时走到了终点</Sub>
          <ul className="mt-4 space-y-2.5">
            {c.reached.map((x, i) => (
              <motion.li key={i} className="flex items-center gap-3" {...stagger(anim, i)}>
                <span className="shrink-0 px-2 py-0.5 text-[11px] font-black tabular-nums" style={{ ...skin.chip, fontFamily: skin.font }}>{shortMd(x.date)}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold" style={{ color: skin.ink, fontFamily: skin.font }}>「{x.title}」</span>
                <span className="shrink-0 text-[12px] font-black" style={{ color: skin.accent }}>{x.how === 'todos' ? '达成' : '到了'}</span>
              </motion.li>
            ))}
          </ul>
        </>
      ) : c.created ? (
        <>
          <Big channel={channel} skin={skin} value={c.created} unit="个" anim={anim} />
          <Sub skin={skin}>这一年立下的倒计时</Sub>
        </>
      ) : c.next ? (
        <>
          <Big channel={channel} skin={skin} value={c.next.days} unit="天" anim={anim} />
          <Sub skin={skin}>「{c.next.title}」还在倒数</Sub>
        </>
      ) : null}
      {(c.reached.length > 0 || c.created > 0) && c.next && (
        <motion.div className="mt-4 px-4 py-3 text-[14px] font-bold" style={{ ...skin.quote, fontFamily: skin.font }} {...stagger(anim, 4)}>
          还在倒数：「{c.next.title}」还有 {c.next.days} 天
        </motion.div>
      )}
      {c.reached.length > 0 && c.created > 0 && <Caption skin={skin}>这一年一共立下 {c.created} 个倒计时</Caption>}
    </Panel>
  );
}

function FatePage({ r, skin, channel, anim }: Ctx) {
  const t = r.tarot;
  const card = t ? TAROT_BY_ID[t.cardId] : undefined;
  const w = r.wishes;
  const title = t && w ? '命运与愿望' : t ? '命运之牌' : '离愿望更近';
  return (
    <Panel channel={channel} seed={7}>
      <Eyebrow skin={skin} text="FATE" />
      <CardTitle channel={channel} text={title} anim={anim} />
      {t && (
        <div className="mt-4 flex items-center gap-4">
          {card && (
            <motion.div className="shrink-0" style={{ perspective: 600 }}
              initial={anim ? { rotateY: 90, opacity: 0 } : false} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 0.25, duration: 0.6, ease: [0.2, 0.8, 0.3, 1] }}>
              <TarotCardSVG card={card} width={96} staticCard showOrientationTag={false} />
            </motion.div>
          )}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 leading-none" style={{ color: channel === 'p5' ? P5R.redHot : skin.accent }}>
              <span className="text-[44px] font-black tabular-nums" style={{ fontFamily: skin.numFont, ...skin.numStyle }}>{t.draws}</span>
              <span className="text-[16px] font-black" style={{ color: skin.ink, fontFamily: skin.font }}>次</span>
            </div>
            <div className="mt-1 text-[13px] font-bold" style={{ color: skin.sub, fontFamily: skin.font }}>这一年抽过的牌</div>
            {card && (
              <div className="mt-2 text-[14px] font-bold leading-snug" style={{ color: skin.ink, fontFamily: skin.font }}>
                {t.count >= 2 ? `来得最勤的是「${card.name}」，${t.count} 次` : `最近一张是「${card.name}」`}
              </div>
            )}
          </div>
        </div>
      )}
      {w && (
        <motion.div className="mt-4 space-y-1.5 px-4 py-3 text-[14px] font-bold leading-relaxed" style={{ ...skin.quote, fontFamily: skin.font }} {...stagger(anim, 2)}>
          {w.fulfilled.length ? (
            <div>实现了 {w.fulfilled.length} 个愿望：{w.fulfilled.map(x => `「${x.text}」`).join('、')}</div>
          ) : (
            w.closer.map((x, i) => <div key={i}>离「{x.title}」近了 {x.gained}%<span className="whitespace-nowrap">（现在 {x.now}%）</span></div>)
          )}
        </motion.div>
      )}
    </Panel>
  );
}

function MemoryItem({ skin, anim, label, line, i }: { skin: Skin; anim: boolean; label: string; line: { date: string; text: string }; i: number }) {
  return (
    <motion.div {...stagger(anim, i)}>
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 text-[11px] font-black" style={{ ...skin.chip, fontFamily: skin.font }}>{md(line.date)}</span>
        <span className="text-[12px] font-black" style={{ color: skin.sub, fontFamily: skin.font }}>{label}</span>
      </div>
      <div className="mt-2 px-4 py-3 text-[15px] font-bold leading-relaxed" style={{ ...skin.quote, fontFamily: skin.font }}>“{line.text}”</div>
    </motion.div>
  );
}

function MemoryPage({ r, skin, channel, anim }: Ctx) {
  const m = r.memory!;
  const single = m.records <= 1;
  return (
    <Panel channel={channel} seed={8}>
      <Eyebrow skin={skin} text="MEMORIES" />
      <CardTitle channel={channel} text="你的记忆" anim={anim} />
      <div className="mt-5">
        <MemoryItem skin={skin} anim={anim} label={m.firstEver ? '你写下的第一条' : single ? '这一年唯一的一条' : '这一年的第一条'} line={m.first} i={0} />
        {!single && (
          <>
            <motion.div className="my-2 flex items-center gap-3 pl-3" {...stagger(anim, 1)}>
              <span aria-hidden className="h-8 w-[3px]" style={{ background: `repeating-linear-gradient(180deg, ${skin.accent} 0 5px, transparent 5px 9px)` }} />
              <span className="text-[12.5px] font-black" style={{ color: skin.accent, fontFamily: skin.font }}>中间隔着 {m.days} 天、{m.records - 2 > 0 ? `${m.records - 2} 条` : '没有别的记录'}</span>
            </motion.div>
            <MemoryItem skin={skin} anim={anim} label="最近的一条" line={m.last} i={2} />
          </>
        )}
      </div>
    </Panel>
  );
}

/** 信封：写好了封舌翻开 */
function Envelope({ skin, channel, ready, anim }: { skin: Skin; channel: UIChannel; ready: boolean; anim: boolean }) {
  const body = channel === 'p5' ? P5R.paper : channel === 'p4' ? '#fff6d0' : '#ffffff';
  // 黄频道封舌用蓝：橙色压在橙色日轮上看不出来
  const flap = channel === 'p5' ? P5R.red : channel === 'p4' ? skin.accent2 : skin.accent;
  const edge = channel === 'p4' || channel === 'p5' ? '#131313' : 'transparent';
  return (
    <motion.div aria-hidden className="relative mx-auto h-[120px] w-[176px]" style={{ perspective: 700 }}
      animate={anim && ready ? { y: [0, -8, 0] } : undefined} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
      <svg viewBox="0 0 176 120" className="absolute inset-0 h-full w-full" style={{ filter: 'drop-shadow(0 14px 18px rgba(0,0,0,0.22))', overflow: 'visible' }}>
        <rect x="1.5" y="1.5" width="173" height="117" rx={channel === 'neutral' ? 12 : channel === 'p4' ? 10 : 0} fill={body} stroke={edge === 'transparent' ? 'none' : edge} strokeWidth="3" />
        <path d="M3 4 L82 66 L3 116 Z" fill="rgba(0,0,0,0.05)" />
        <path d="M173 4 L94 66 L173 116 Z" fill="rgba(0,0,0,0.05)" />
        <path d="M3 117 L88 60 L173 117 Z" fill="rgba(0,0,0,0.09)" />
      </svg>
      <motion.div className="absolute inset-x-0 top-0 h-[62%]" style={{ background: flap, clipPath: 'polygon(0 0, 100% 0, 50% 100%)', transformOrigin: 'top', transformStyle: 'preserve-3d' }}
        animate={{ rotateX: ready ? 180 : 0 }} transition={{ duration: anim ? 0.7 : 0, ease: [0.3, 0.8, 0.3, 1] }} />
      <motion.div className="absolute left-1/2 top-[44%] flex h-9 w-9 items-center justify-center rounded-full text-[16px]" style={{ x: '-50%', background: channel === 'p5' ? P5R.ink : channel === 'p4' ? '#131313' : skin.accent, color: '#fff' }}
        animate={{ scale: ready ? 0 : 1, opacity: ready ? 0 : 1 }} transition={{ duration: anim ? 0.3 : 0 }}>
        ✦
      </motion.div>
    </motion.div>
  );
}

function LetterPage({ skin, channel, anim, presetName, presetIcon, letter, onOpenLetter }: Ctx) {
  const ready = letter.kind === 'ready';
  const heading = `${presetIcon ?? ''}${presetName}给你写了一封信`;
  const writingLine = letter.kind === 'writing'
    ? letter.phase === 'streaming' ? `正在落笔，已经写了 ${letter.chars ?? 0} 字…` : letter.phase === 'thinking' ? '还在想这封信怎么开头…' : '正在把这一年的简报交给它…'
    : '';
  return (
    <div className="text-center">
      <Envelope skin={skin} channel={channel} ready={ready} anim={anim} />
      <div className="mt-7 flex justify-center">
        {channel === 'p5' ? <P5CollageTitle text="一封信" size={24} /> : channel === 'p4' ? <Plate delay={0.1} anim={anim} size={26}>一封信</Plate> : (
          <span className="text-[26px] font-black" style={{ color: channel === 'p3' ? P3R.ink : '#fff', fontStyle: channel === 'p3' ? 'italic' : undefined, fontFamily: channel === 'p3' ? P3_TITLE_FONT : undefined }}>一封信</span>
        )}
      </div>
      <div className="mt-4 text-[16px] font-black" style={{ color: skin.onStage, fontFamily: skin.font }}>{heading}</div>
      {letter.kind === 'writing' && (
        <div className="mx-auto mt-4 max-w-[260px]">
          <div className="text-[13px] font-bold" style={{ color: skin.onStageSub, fontFamily: skin.font }}>{writingLine}</div>
          <div className="mt-3 h-[5px] overflow-hidden" style={{ background: channel === 'p5' ? '#2a2a2a' : 'rgba(0,0,0,0.12)', borderRadius: 999 }}>
            {typeof letter.progress === 'number' ? (
              <motion.div className="h-full" style={{ background: channel === 'p5' ? P5R.red : skin.accent, width: `${Math.round(Math.min(1, letter.progress) * 100)}%` }} />
            ) : (
              <motion.div className="h-full w-1/3" style={{ background: channel === 'p5' ? P5R.red : skin.accent }}
                animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
            )}
          </div>
          <button type="button" onClick={e => { e.stopPropagation(); onOpenLetter(); }}
            className="mt-5 text-[13px] font-black underline underline-offset-4" style={{ color: skin.onStage, fontFamily: skin.font }}>
            先去看它边写 ›
          </button>
        </div>
      )}
      {ready && (
        <motion.button type="button" onClick={e => { e.stopPropagation(); onOpenLetter(); }}
          className="mt-6 px-8 py-3 text-[16px] font-black"
          style={channel === 'p5'
            ? { background: P5R.red, color: P5R.white, fontFamily: P5_TITLE_FONT, clipPath: 'polygon(4% 0, 100% 6%, 96% 100%, 0 92%)' }
            : channel === 'p4'
              ? { background: '#131313', color: '#fff6d0', borderRadius: 14, boxShadow: '0 0 0 4px #fff6d0' }
              : channel === 'p3'
                ? { background: P3R.blue, color: '#fff', clipPath: slantClip(12) }
                : { background: '#fff', color: '#111827', borderRadius: 999 }}
          initial={anim ? { scale: 0.6, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 20, delay: 0.3 }}>
          拆开这封信
        </motion.button>
      )}
      {letter.kind === 'error' && (
        <div className="mx-auto mt-4 max-w-[280px]">
          <div className="text-[13px] font-bold" style={{ color: skin.onStageSub, fontFamily: skin.font }}>信没写成{letter.message ? `：${letter.message}` : ''}</div>
          <button type="button" onClick={e => { e.stopPropagation(); onOpenLetter(); }}
            className="mt-4 text-[13px] font-black underline underline-offset-4" style={{ color: skin.onStage, fontFamily: skin.font }}>
            回去看看 ›
          </button>
        </div>
      )}
    </div>
  );
}

const PAGE_VIEW: Record<PageKey, (c: Ctx) => JSX.Element> = {
  cover: CoverPage, days: DaysPage, night: NightPage, growth: GrowthPage, streak: StreakPage,
  highlights: HighlightsPage, countdown: CountdownPage, fate: FatePage, memory: MemoryPage, letter: LetterPage,
};

// ── 舞台 ─────────────────────────────────────────────────────────────────────

export default function YearRecapStage({ open, recap, presetName, presetIcon, userName, letter, onOpenLetter, onClose }: YearRecapStageProps) {
  const channel = useUiChannel();
  const skin = SKINS[channel];
  const anim = useBoldness();
  const pages = useMemo(() => recapPages(recap), [recap]);
  const [idx, setIdx] = useState(0);
  const last = pages.length - 1;
  const page = pages[Math.min(idx, last)];

  useEffect(() => { if (open) setIdx(0); }, [open, recap]);

  const containerRef = useModalA11y(open, onClose);
  useBackHandler(open, onClose);
  useFeedbackOnce(open, triggerLevelFeedback);

  const next = useCallback(() => {
    if (idx < last) { setIdx(i => Math.min(last, i + 1)); triggerLightHaptic(); return; }
    if (letter.kind === 'ready') onOpenLetter();
  }, [idx, last, letter.kind, onOpenLetter]);
  const prev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement | null)?.closest?.('button')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev]);

  const ctx: Ctx = { r: recap, skin, channel, anim, presetName, presetIcon, userName, letter, onOpenLetter };
  const PageView = PAGE_VIEW[page];
  const variants = anim ? skin.enter : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${recap.year} 年度回顾`}
          className={`fixed inset-0 ${zClass.celebration} flex select-none flex-col overflow-hidden`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={next}
        >
          <StageBackdrop channel={channel} page={idx} anim={anim} />
          <PageGhost channel={channel} word={GHOST[page]} />

          {/* 顶部：进度段 + 跳过 */}
          <div className="relative z-10 flex items-center gap-3 px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
            <div className="flex flex-1 gap-1" aria-hidden>
              {pages.map((_p, i) => (
                <span key={i} className="h-[4px] flex-1" style={{
                  background: i <= idx ? (channel === 'p5' || channel === 'neutral' ? '#fff' : skin.accent) : (channel === 'p5' ? '#3a3a3a' : channel === 'neutral' ? 'rgba(255,255,255,0.3)' : 'rgba(128,128,128,0.28)'),
                  borderRadius: channel === 'neutral' || channel === 'p4' ? 999 : 0,
                }} />
              ))}
            </div>
            {page !== 'letter' && (
              <button type="button" onClick={e => { e.stopPropagation(); setIdx(last); }}
                className="shrink-0 px-2 py-1 text-[13px] font-black" style={{ color: skin.onStage, fontFamily: skin.font }}>
                跳过 ›
              </button>
            )}
          </div>

          {/* 卡片 */}
          <div className="relative z-10 flex flex-1 items-center justify-center overflow-hidden px-5 pb-4 pt-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.section
                key={page}
                className="w-full max-w-[380px]"
                aria-live="polite"
                initial={variants.initial}
                animate={variants.animate}
                exit={variants.exit}
                transition={variants.transition}
              >
                <PageView {...ctx} />
              </motion.section>
            </AnimatePresence>
          </div>

          {/* 底部提示 */}
          <div className="relative z-10 h-12 text-center" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
            {page !== 'letter' && (
              <motion.span key={idx} className="text-[12px] font-bold" style={{ color: skin.onStageSub, fontFamily: skin.font }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                点击屏幕继续 · {idx + 1}/{pages.length}
              </motion.span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
