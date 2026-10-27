/**
 * 设置页（第 30 批）· 三频道游戏风格原语。
 *
 * 蓝 = P3R（深靛舞台语言：斜切玻璃面板 / 蓝斜块 / 青双片 / 白光扫过）、
 * 黄 = P4G（午夜频道：黑描边圆角贴纸 / 衬线标题 / 橙花 / 扫描线）、
 * 红 = P5R（剪报拼贴：撕边纸片 / 黑框硬影 / 红楔章 / 星）、
 * 粉 / 自定义 = 中性皮（主题色卡片）。
 *
 * 这里只放「壳」：宫格块、子页页头、分组卡、行、分段、按钮、输入、搜索框。
 * 每个原语按 useSettingsSkin() 分叉，调用方不写 p3 ? … : p5 ? …。
 * 动效全部经 useBoldness() 闸门（D0 直出终态）。
 */
import { motion, AnimatePresence } from 'motion/react';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBoldness } from '@/utils/boldness';
import { P3R, slantClip, GhostWords, P3Highlight } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad, P5Panel, P5Rough, P5Star, P5Btn, P5CollageTitle, P5SubBar, P5Chip } from '@/components/p5r/kit';
import { P4Flower, P4Sparkle, P4Scanlines, P4StickerPanel } from '@/ui/p4Kit';
import { Toggle } from '@/components/Toggle';

export type SettingsSkin = 'p3' | 'p4' | 'p5' | 'neutral';

/** 搜索命中要闪的行 id（Row 自己读） */
export const SettingsFlashContext = createContext<string | null>(null);
export const useSettingsSkin = (): SettingsSkin => useUiChannel();

/** 字色 / 次级字色 / 强调色：按频道取，夜间走 CSS 变量自动翻色 */
export const skinTokens = (skin: SettingsSkin) => {
  switch (skin) {
    case 'p3': return { ink: P3R.ink, sub: P3R.grey, accent: P3R.blue, chip: 'var(--p3r-chip, #ddeef7)', panel: P3R.panelGlass };
    case 'p4': return { ink: 'var(--ui-ink, #131313)', sub: 'var(--ui-ink, #131313)', accent: 'var(--p4-orange, #f9a11b)', chip: 'var(--ui-bg, #ffd900)', panel: 'var(--ui-paper, #fff6d0)' };
    case 'p5': return { ink: P5R.ink, sub: P5R.grey, accent: P5R.red, chip: P5R.paperDim, panel: P5R.paper };
    default: return { ink: 'var(--ui-ink, #111827)', sub: 'var(--ui-muted, #6b7280)', accent: 'var(--color-primary, #1b57ff)', chip: 'rgba(107,122,153,0.12)', panel: 'var(--ui-paper, #ffffff)' };
  }
};

// ── 图形（游戏菜单式单色图标：粗线、几何） ───────────────────────────────────
export type GlyphName =
  | 'palette' | 'display' | 'key' | 'spark' | 'mask' | 'bell' | 'growth' | 'play'
  | 'moon' | 'speaker' | 'music' | 'image' | 'anim' | 'splash' | 'weather' | 'sidebar'
  | 'wave' | 'coin' | 'tag' | 'bars' | 'quest' | 'swords' | 'clock' | 'search' | 'cloud' | 'legacy' | 'mute' | 'cards'
  // 30b：助手 / 通知两页用到的
  | 'check' | 'pen' | 'link' | 'calendar' | 'bubble' | 'notebook' | 'archive' | 'thought' | 'users' | 'doc' | 'wish' | 'flask' | 'chip' | 'trash' | 'plus' | 'send'
  // 第 33 批：记事本
  | 'lock' | 'unlock' | 'dots' | 'pin' | 'refresh' | 'eye';

const GLYPH_PATHS: Record<GlyphName, ReactNode> = {
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-.8 2-1.7 0-.9-.6-1.3-.6-2.1 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5Z" /><circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" /><circle cx="15" cy="7.5" r="1.1" fill="currentColor" /></>,
  display: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M7 12c1.5-2 3-2 4.5 0s3 2 4.5 0" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12 20 3M16 7l2 2M13 10l2 2" /></>,
  spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z" /></>,
  mask: <path d="M5 9 4 3l5 3h6l5-3-1 6a8 8 0 1 1-14 0Z" fill="currentColor" stroke="none" />,
  bell: <><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  growth: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  play: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 12h3M8.5 10.5v3M15 11h.01M17.5 13h.01" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  speaker: <><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="none" /><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" /></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="none" /><path d="M16 9l5 6M21 9l-5 6" /></>,
  music: <><path d="M9 18V6l11-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m4 17 5-5 4 4 3-3 4 4" /><circle cx="16" cy="9" r="1.5" /></>,
  anim: <><path d="M3 12c3-6 6-6 9 0s6 6 9 0" /><path d="M3 18c3-6 6-6 9 0s6 6 9 0" opacity=".5" /></>,
  splash: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /><circle cx="12" cy="12" r="3" /></>,
  weather: <><path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1-1 8.9H7Z" /></>,
  sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  wave: <path d="M3 9c3-4 6-4 9 0s6 4 9 0M3 15c3-4 6-4 9 0s6 4 9 0" />,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M9.5 10c0-1.1 1.1-2 2.5-2s2.5.9 2.5 2-1.1 2-2.5 2-2.5.9-2.5 2 1.1 2 2.5 2 2.5-.9 2.5-2M12 6v2M12 16v2" /></>,
  tag: <><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.4" fill="currentColor" /></>,
  bars: <path d="M5 20v-6M10 20V9M15 20v-9M20 20V4" />,
  quest: <><path d="M6 3h9l3 3v15H6Z" /><path d="M9 9h6M9 13h6M9 17h4" /></>,
  swords: <><path d="m4 4 12 12M20 4 8 16M4 20l4-4M20 20l-4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  cloud: <path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1-1 8.9H7Z" />,
  legacy: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  cards: <><rect x="4" y="5" width="11" height="15" rx="1.5" transform="rotate(-8 9.5 12.5)" /><rect x="10" y="4" width="11" height="15" rx="1.5" transform="rotate(6 15.5 11.5)" /></>,
  check: <path d="m4.5 12.5 4.5 4.5L19.5 6.5" />,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" /></>,
  bubble: <><path d="M4 5h16v11H10l-6 4.5V5Z" /><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" /></>,
  notebook: <><path d="M6 3h12v18H6Z" /><path d="M9.5 3v18M13 8h2.5M13 12h2.5" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>,
  thought: <><path d="M7.5 15.5a3.8 3.8 0 0 1-.6-7.55A5.3 5.3 0 0 1 17 7.4a3.8 3.8 0 0 1 .4 7.6H7.5Z" /><circle cx="7.5" cy="19" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="21.5" r=".9" fill="currentColor" stroke="none" /></>,
  users: <><circle cx="8" cy="8.5" r="3" /><circle cx="16.5" cy="8.5" r="3" /><path d="M2.5 20c0-3 2.4-5.2 5.5-5.2s5.5 2.2 5.5 5.2M13.5 15.2c.9-.3 1.9-.4 3-.4 3.1 0 5 2.2 5 5.2" /></>,
  doc: <><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  wish: <path d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7Z" />,
  flask: <><path d="M9 3h6M10 3v6.2L4.6 18.9A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.1L14 9.2V3" /><path d="M7.2 15h9.6" /></>,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <><path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" /><path d="m10 13 5-5" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 7.6-1.8" /></>,
  dots: <><circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  pin: <><path d="M9 3.5h6l-1 5.5 3.5 3.5h-11L10 9 9 3.5Z" /><path d="M12 12.5V21" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.65" /><path d="M20 4v4.6h-4.6" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
};

export const Glyph = ({ name, size = 22, className, style }: { name: GlyphName; size?: number; className?: string; style?: CSSProperties }) => (
  <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    {GLYPH_PATHS[name]}
  </svg>
);

// ── 白光扫过（P3R 菜单选中的那道光；按下即扫） ───────────────────────────────
export const useSweep = () => {
  const anim = useBoldness();
  const [sweep, setSweep] = useState<number | null>(null);
  const fire = () => { if (anim) setSweep(Date.now()); };
  const element = sweep !== null ? (
    <motion.span
      key={sweep}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-[28%]"
      style={{ background: 'rgba(255,255,255,0.55)', borderLeft: '2px solid rgba(255,255,255,0.95)', skewX: -18 }}
      initial={{ x: '-140%' }}
      animate={{ x: '520%' }}
      transition={{ duration: 0.36, ease: 'easeOut' }}
      onAnimationComplete={() => setSweep(null)}
    />
  ) : null;
  return { fire, element };
};

// ── 宫格块 ───────────────────────────────────────────────────────────────────
export interface SectionMeta {
  id: string;
  title: string;
  /** 英文副题（P3 幽灵字 / P4 手写角标 / P5 黑条） */
  en: string;
  glyph: GlyphName;
  desc: string;
}

/**
 * 方块标题（第 33 批：标题放大到 20px、挪到图标右边）：一行放不下就按比例缩到放得下（窄屏上五个字的标题），最小 14px。
 * 只量一次 + 跟着宽度变（转屏 / 拖窗口）；字宽和字号成正比，一次就算准。
 */
const TILE_TITLE_PX = 20;
const FitTitle = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [px, setPx] = useState(TILE_TITLE_PX);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = `${TILE_TITLE_PX}px`;
      const need = el.scrollWidth, room = el.clientWidth;
      // 留 3% 余量：scrollWidth 取整、斜体最后一个字的出头都会多吃一点
      const next = need > room + 0.5 && need > 0 ? Math.max(14, Math.floor((TILE_TITLE_PX * room / need) * 0.97 * 10) / 10) : TILE_TITLE_PX;
      el.style.fontSize = `${next}px`;
      setPx(next);
    };
    fit();
    // 展示字体（思源黑体 Black 分片 / P5 标题字）晚到会改字宽：到了再量一次
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) fit(); });
    if (typeof ResizeObserver === 'undefined') return () => { alive = false; };
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement ?? el);
    return () => { alive = false; ro.disconnect(); };
  }, [children]);
  return (
    <span ref={ref} data-tile-title className={`block min-w-0 flex-1 overflow-hidden whitespace-nowrap leading-tight ${className ?? ''}`} style={{ ...style, fontSize: px }}>
      {children}
    </span>
  );
};

export const HubTile = ({ section, summary, status, index, onOpen }: {
  section: SectionMeta;
  summary: string;
  status?: 'ok' | 'warn' | 'off';
  index: number;
  onOpen: () => void;
}) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  const { fire, element: sweep } = useSweep();
  const enter = {
    initial: anim ? { opacity: 0, y: 16, scale: 0.96 } : (false as const),
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { type: 'spring' as const, stiffness: 380, damping: 28, delay: anim ? 0.05 + index * 0.045 : 0 },
  };
  const dot = status && status !== 'off' ? (
    <motion.span
      aria-hidden
      className="absolute h-2.5 w-2.5"
      style={{ right: 10, top: 10, background: status === 'ok' ? '#22c55e' : '#f59e0b', clipPath: skin === 'p5' ? roughQuad(90 + index, 2) : skin === 'p3' ? slantClip(2) : undefined, borderRadius: skin === 'p4' || skin === 'neutral' ? 999 : 0 }}
      animate={anim ? { scale: [1, 1.25, 1], opacity: [1, 0.7, 1] } : undefined}
      transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
    />
  ) : null;
  const iconId = `settings-glyph-${section.id}`;

  if (skin === 'p3') {
    return (
      <motion.button
        type="button"
        {...enter}
        whileTap={{ scale: 0.965 }}
        onPointerDown={fire}
        onClick={onOpen}
        data-settings-tile={section.id}
        className="relative block w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
        style={{ clipPath: slantClip(13), background: t.panel, boxShadow: '0 8px 18px rgba(38,96,140,0.08)' }}
      >
        {/* 青斜纹底（P3R 面板质感；夜间整层压到一成，见 index.css .p3-hub-stripes） */}
        <span aria-hidden className="p3-hub-stripes pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(115deg, transparent 0 18px, rgba(var(--p3r-cyan-rgb, 53, 209, 232), 0.07) 18px 21px)' }} />
        <span className="relative flex flex-col gap-2.5 px-3.5 pb-3.5 pt-3.5">
          <span className="flex items-center gap-2">
            <motion.span
              layoutId={iconId}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-white"
              style={{ background: P3R.blue, clipPath: slantClip(6) }}
            >
              <Glyph name={section.glyph} size={20} />
            </motion.span>
            <FitTitle className="pr-1 font-black italic" style={{ color: t.ink }}>{section.title}</FitTitle>
          </span>
          <span className="block min-h-[32px] text-[11.5px] font-semibold leading-snug" style={{ color: t.sub }}>{summary}</span>
          <span aria-hidden className="absolute bottom-3 right-3 flex gap-1">
            <span className="h-[9px] w-[12px]" style={{ background: P3R.cyan, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
            <span className="mt-[2px] h-[8px] w-[10px]" style={{ background: '#9adcee', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          </span>
        </span>
        {dot}
        {sweep}
      </motion.button>
    );
  }

  if (skin === 'p4') {
    return (
      <motion.button
        type="button"
        {...enter}
        whileTap={{ scale: 0.955, rotate: -1.2 }}
        onClick={onOpen}
        data-settings-tile={section.id}
        className="relative block w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#131313]"
        style={{ background: t.panel, borderRadius: 20, boxShadow: '0 0 0 2.5px #131313, 0 6px 0 rgba(19,19,19,0.22)', transform: `rotate(${index % 2 ? 0.6 : -0.6}deg)` }}
      >
        {/* 午夜频道：顶端一条黑带 + 扫描线 */}
        <span aria-hidden className="relative block h-[22px] overflow-hidden" style={{ background: '#131313' }}>
          <P4Scanlines opacity={0.35} line="#fff6d0" />
          <span className="absolute left-3 top-[5px] text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--ui-bg, #ffd900)', fontFamily: 'var(--p4-display-font, serif)' }}>{section.en}</span>
        </span>
        <span className="relative flex flex-col gap-2 px-3.5 pb-3.5 pt-3">
          <span className="flex items-center gap-2">
            <motion.span
              layoutId={iconId}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
              style={{ background: '#131313', color: 'var(--ui-bg, #ffd900)' }}
            >
              <Glyph name={section.glyph} size={20} />
            </motion.span>
            <FitTitle className="font-black" style={{ color: t.ink, fontFamily: 'var(--p4-display-font, serif)' }}>{section.title}</FitTitle>
          </span>
          <span className="block min-h-[32px] text-[11.5px] font-bold leading-snug" style={{ color: t.sub, opacity: 0.68 }}>{summary}</span>
        </span>
        <P4Flower size={16} color="var(--p4-orange, #f9a11b)" className="absolute bottom-3 right-3" />
        {dot}
      </motion.button>
    );
  }

  if (skin === 'p5') {
    return (
      <motion.button
        type="button"
        {...enter}
        whileTap={{ x: 3, y: 4 }}
        onClick={onOpen}
        data-settings-tile={section.id}
        className="relative block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
        style={{ rotate: index % 2 ? 0.8 : -0.8 }}
      >
        <P5Rough seed={400 + index * 7} jag={7} frame={3} face={P5R.paper} shadow={{ x: 4, y: 5 }} />
        <span className="relative flex flex-col gap-2 px-3.5 pb-4 pt-4">
          <span className="flex items-center gap-2">
            <motion.span
              layoutId={iconId}
              className="flex h-9 w-9 shrink-0 items-center justify-center"
              style={{ background: P5R.red, color: P5R.white, clipPath: roughQuad(430 + index, 4), boxShadow: `2px 2px 0 ${P5R.ink}` }}
            >
              <Glyph name={section.glyph} size={20} />
            </motion.span>
            <FitTitle className="font-black" style={{ color: P5R.ink, fontFamily: P5_TITLE_FONT }}>{section.title}</FitTitle>
          </span>
          <span className="block min-h-[32px] text-[11.5px] font-bold leading-snug" style={{ color: P5R.grey }}>{summary}</span>
        </span>
        <P5Star size={13} fill={P5R.ink} rot={-12} className="absolute bottom-3 right-3" />
        {dot}
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      {...enter}
      whileTap={{ scale: 0.965 }}
      onClick={onOpen}
      data-settings-tile={section.id}
      className="relative block w-full overflow-hidden rounded-[18px] bg-white text-left shadow-[0_10px_24px_rgba(27,87,255,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-gray-800"
    >
      <span aria-hidden className="pointer-events-none absolute -right-3 -top-3 h-14 w-14" style={{ background: 'rgba(53,209,232,0.18)', clipPath: 'polygon(40% 0, 100% 0, 100% 60%)' }} />
      <span className="relative flex flex-col gap-2.5 px-3.5 pb-3.5 pt-3.5">
        <span className="flex items-center gap-2">
          <motion.span layoutId={iconId} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
            <Glyph name={section.glyph} size={20} />
          </motion.span>
          <FitTitle className="font-extrabold text-gray-900 dark:text-white">{section.title}</FitTitle>
        </span>
        <span className="block min-h-[32px] text-[12px] leading-snug text-gray-500 dark:text-gray-400">{summary}</span>
      </span>
      {dot}
    </motion.button>
  );
};

// ── 宫格页头 ─────────────────────────────────────────────────────────────────
export const HubHeader = ({ onBack }: { onBack: () => void }) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  const back = (
    <BackTriangle onClick={onBack} dataBack="hub" />
  );
  if (skin === 'p3') {
    return (
      <div className="relative">
        <GhostWords words={['CONFIG', <span style={{ fontSize: '0.86em' }}>MENU</span>]} className="right-[6px] top-[-12px] text-right text-[78px]" style={{ lineHeight: 1.04 }} />
        <div className="relative flex items-end gap-3 pt-2">
          {back}
          {/* P3R 菜单条：蓝斜带里的白字 + 洋红角 */}
          <motion.h1
            className="relative px-7 py-2 text-[34px] font-black italic leading-none text-white"
            style={{ clipPath: slantClip(16), background: P3R.blue }}
            initial={anim ? { x: -40, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            设置
            <span aria-hidden className="absolute bottom-0 right-2 h-[9px] w-[22px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          </motion.h1>
          <P3Highlight className="mb-2 h-[16px] w-[64px]" />
        </div>
        <p className="mt-2 pl-1 text-[12px] font-bold tracking-[0.18em]" style={{ color: P3R.grey }}>SYSTEM · CONFIG</p>
      </div>
    );
  }
  if (skin === 'p4') {
    return (
      <div className="relative pt-1">
        <div className="flex items-start gap-3">
          {back}
          <P4StickerPanel rotate={-1.5} cuts={[16, 10, 18, 8]} contentClassName="px-5 py-2.5" className="inline-block">
            <div className="relative overflow-hidden">
              <P4Scanlines opacity={0.25} line="#fff6d0" />
              <h1 className="relative text-[40px] font-black leading-none" style={{ color: 'var(--ui-bg, #ffd900)', fontFamily: 'var(--p4-display-font, serif)' }}>设置</h1>
            </div>
          </P4StickerPanel>
          <span className="mt-1 text-[22px] font-bold italic leading-none" style={{ color: 'var(--p4-orange, #f9a11b)', fontFamily: "'Caveat', 'Segoe Script', cursive" }}>Midnight Config</span>
        </div>
      </div>
    );
  }
  if (skin === 'p5') {
    return (
      <div className="relative pt-1">
        <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-6 h-[150px]" style={{ zIndex: -1 }}>
          <span className="absolute" style={{ left: -40, top: -10, width: 260, height: 80, background: P5R.red, clipPath: 'polygon(0 0, 100% 16%, 84% 100%, 0 90%)', transform: 'rotate(-5deg)' }} />
          <span className="absolute" style={{ right: -50, top: -26, width: 280, height: 100, background: P5R.redDeep, clipPath: 'polygon(12% 0, 100% 0, 100% 72%, 0 100%)', transform: 'rotate(6deg)' }} />
        </div>
        <div className="flex items-start gap-3">
          {back}
          <div>
            <P5CollageTitle text="设置" size={34} />
            <P5SubBar segs={[{ t: 'SET' }, { t: 'UP', c: P5R.red }]} className="mt-2 ml-2" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="flex items-end gap-3">
        {back}
        <h1 className="text-[40px] font-black italic leading-none" style={{ color: t.ink }}>设置</h1>
        <span aria-hidden className="mb-2 flex gap-1"><span className="h-[10px] w-[14px] bg-primary" style={{ clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} /><span className="h-[10px] w-[14px] bg-primary/50" style={{ clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} /></span>
      </div>
    </div>
  );
};

export const BackTriangle = ({ onClick, label = '返回', dataBack }: { onClick: () => void; label?: string; /** 测试用：hub = 离开设置页，sub = 回宫格 */ dataBack?: string }) => {
  const skin = useSettingsSkin();
  if (skin === 'p5') {
    return (
      <button type="button" onClick={onClick} aria-label={label} data-settings-back={dataBack} className="relative mt-1 flex h-9 w-9 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]">
        <P5Rough seed={533} jag={3.5} frame={2.5} />
        <span aria-hidden className="relative h-0 w-0 border-y-[7px] border-y-transparent border-r-[11px]" style={{ borderRightColor: P5R.ink }} />
      </button>
    );
  }
  if (skin === 'p4') {
    return (
      <button type="button" onClick={onClick} aria-label={label} data-settings-back={dataBack} className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#131313]" style={{ background: '#131313', color: 'var(--ui-bg, #ffd900)' }}>
        <span aria-hidden className="h-0 w-0 border-y-[6px] border-y-transparent border-r-[9px]" style={{ borderRightColor: 'currentColor' }} />
      </button>
    );
  }
  const color = skin === 'p3' ? P3R.ink : 'var(--ui-ink, #111827)';
  return (
    <button type="button" onClick={onClick} aria-label={label} data-settings-back={dataBack} className="mb-1 flex h-10 w-8 shrink-0 items-center justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span aria-hidden className="block h-[15px] w-[13px]" style={{ background: color, clipPath: 'polygon(100% 0, 100% 100%, 0 50%)' }} />
    </button>
  );
};

// ── 子页页头（图标从宫格飞来） ────────────────────────────────────────────────
export const SubHero = ({ section, onBack }: { section: SectionMeta; onBack: () => void }) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  const iconId = `settings-glyph-${section.id}`;
  const titleMotion = {
    initial: anim ? { opacity: 0, x: 18 } : (false as const),
    animate: { opacity: 1, x: 0 },
    transition: { type: 'spring' as const, stiffness: 380, damping: 30, delay: 0.06 },
  };
  if (skin === 'p3') {
    return (
      <div className="relative">
        <GhostWords words={[section.en.split(' ')[0] ?? '', <span style={{ fontSize: '0.8em' }}>{section.en.split(' ').slice(1).join(' ')}</span>]} className="right-[4px] top-[-10px] text-right text-[64px]" style={{ lineHeight: 1.02 }} />
        <div className="relative flex items-center gap-3 pt-1">
          <BackTriangle onClick={onBack} dataBack="sub" />
          <motion.span layoutId={iconId} className="flex h-14 w-14 shrink-0 items-center justify-center text-white" style={{ background: P3R.blue, clipPath: slantClip(9) }}>
            <Glyph name={section.glyph} size={30} />
          </motion.span>
          <motion.div {...titleMotion} className="min-w-0">
            <h2 className="text-[28px] font-black italic leading-none" style={{ color: t.ink }}>{section.title}</h2>
            <p className="mt-1.5 text-[12px] font-semibold" style={{ color: t.sub }}>{section.desc}</p>
          </motion.div>
        </div>
      </div>
    );
  }
  if (skin === 'p4') {
    return (
      <div className="relative flex items-center gap-3 pt-1">
        <BackTriangle onClick={onBack} dataBack="sub" />
        <motion.span layoutId={iconId} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px]" style={{ background: '#131313', color: 'var(--ui-bg, #ffd900)', boxShadow: '0 4px 0 rgba(19,19,19,0.25)' }}>
          <Glyph name={section.glyph} size={30} />
        </motion.span>
        <motion.div {...titleMotion} className="min-w-0">
          <h2 className="text-[30px] font-black leading-none" style={{ color: t.ink, fontFamily: 'var(--p4-display-font, serif)' }}>{section.title}</h2>
          <p className="mt-1 text-[13px] font-bold italic leading-none" style={{ color: 'var(--p4-orange, #f9a11b)', fontFamily: "'Caveat', 'Segoe Script', cursive" }}>{section.en}</p>
        </motion.div>
      </div>
    );
  }
  if (skin === 'p5') {
    return (
      <div className="relative flex items-center gap-3 pt-1">
        <BackTriangle onClick={onBack} dataBack="sub" />
        <motion.span layoutId={iconId} className="flex h-14 w-14 shrink-0 items-center justify-center" style={{ background: P5R.red, color: P5R.white, clipPath: roughQuad(471, 5), boxShadow: `3px 3px 0 ${P5R.ink}` }}>
          <Glyph name={section.glyph} size={30} />
        </motion.span>
        <motion.div {...titleMotion} className="min-w-0">
          <h2 className="text-[26px] font-black leading-none" style={{ color: P5R.white, fontFamily: P5_TITLE_FONT, textShadow: `2px 2px 0 ${P5R.ink}` }}>{section.title}</h2>
          <P5SubBar segs={[{ t: section.en }]} star={false} rot={-1.2} className="mt-1.5 !px-2.5 !py-0.5 [&_span]:!text-[12px]" />
        </motion.div>
      </div>
    );
  }
  return (
    <div className="relative flex items-center gap-3 pt-1">
      <BackTriangle onClick={onBack} dataBack="sub" />
      <motion.span layoutId={iconId} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-primary text-white">
        <Glyph name={section.glyph} size={30} />
      </motion.span>
      <motion.div {...titleMotion} className="min-w-0">
        <h2 className="text-[26px] font-black italic leading-none" style={{ color: t.ink }}>{section.title}</h2>
        <p className="mt-1.5 text-[12px]" style={{ color: t.sub }}>{section.desc}</p>
      </motion.div>
    </div>
  );
};

// ── 分组卡 ───────────────────────────────────────────────────────────────────
export const Card = ({ title, meta, children, index = 0, className }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; index?: number; className?: string }) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  const enter = {
    initial: anim ? { opacity: 0, y: 14 } : (false as const),
    animate: { opacity: 1, y: 0 },
    transition: { type: 'spring' as const, stiffness: 360, damping: 30, delay: anim ? 0.12 + index * 0.06 : 0 },
  };
  const head = title ? (
    skin === 'p3' ? (
      <div className="mb-3 flex items-center gap-2">
        <span aria-hidden className="h-[14px] w-[9px]" style={{ background: P3R.blue, clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
        <h3 className="text-[14px] font-black tracking-wide" style={{ color: t.ink }}>{title}</h3>
        {meta && <span className="ml-auto text-[11px] font-bold" style={{ color: t.sub }}>{meta}</span>}
      </div>
    ) : skin === 'p4' ? (
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[18px] font-black leading-none" style={{ color: t.ink, fontFamily: 'var(--p4-display-font, serif)' }}>{title}</h3>
        <P4Sparkle size={13} color="var(--ui-accent)" />
        {meta && <span className="ml-auto text-[11px] font-bold" style={{ color: t.sub, opacity: 0.7 }}>{meta}</span>}
      </div>
    ) : skin === 'p5' ? (
      <div className="mb-3 flex items-center gap-2">
        <P5Chip tone="ink" rot={-1.5}>{title}</P5Chip>
        {meta && <span className="ml-auto text-[11px] font-bold" style={{ color: P5R.grey }}>{meta}</span>}
      </div>
    ) : (
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[13px] font-extrabold tracking-wide" style={{ color: t.sub }}>{title}</h3>
        {meta && <span className="ml-auto text-[11px] font-bold" style={{ color: t.sub }}>{meta}</span>}
      </div>
    )
  ) : null;

  if (skin === 'p5') {
    return (
      <motion.div {...enter} className={className}>
        <P5Panel seed={610 + index * 3} jag={7} frame={3} keyline={2} shadow={{ x: 5, y: 6 }} bodyClassName="px-4 py-4">
          {head}
          {children}
        </P5Panel>
      </motion.div>
    );
  }
  if (skin === 'p4') {
    return (
      <motion.div {...enter} className={`relative px-4 py-4 ${className ?? ''}`} style={{ background: t.panel, borderRadius: 18, boxShadow: '0 0 0 2.5px #131313, 0 6px 0 rgba(19,19,19,0.2)', transform: `rotate(${index % 2 ? 0.35 : -0.35}deg)` }}>
        {head}
        {children}
      </motion.div>
    );
  }
  if (skin === 'p3') {
    return (
      <motion.div {...enter} className={`relative px-4 py-4 ${className ?? ''}`} style={{ clipPath: slantClip(14), background: t.panel, boxShadow: '0 8px 18px rgba(38,96,140,0.07)' }}>
        {head}
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div {...enter} className={`relative rounded-[18px] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(27,87,255,0.08)] dark:bg-gray-800 ${className ?? ''}`}>
      {head}
      {children}
    </motion.div>
  );
};

// ── 行 ───────────────────────────────────────────────────────────────────────
export const Row = ({ id, glyph, label, desc, control, onClick, children, flash }: {
  id?: string;
  glyph?: GlyphName;
  label: ReactNode;
  desc?: ReactNode;
  /** 右侧控件（开关 / 链接文字 / 小按钮） */
  control?: ReactNode;
  onClick?: () => void;
  /** 行下方的展开内容（分段 / 滑杆 / 色片） */
  children?: ReactNode;
  /** 搜索命中：高亮一下 */
  flash?: boolean;
}) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const flashCtx = useContext(SettingsFlashContext);
  const flashing = flash ?? (!!id && flashCtx === id);
  const iconBox: CSSProperties = skin === 'p3'
    ? { background: 'rgba(27,87,255,0.1)', color: P3R.blue, clipPath: slantClip(5) }
    : skin === 'p4'
      ? { background: '#131313', color: 'var(--ui-bg, #ffd900)', borderRadius: 10 }
      : skin === 'p5'
        ? { background: P5R.ink, color: P5R.paper, clipPath: roughQuad(880 + (id?.length ?? 0), 3) }
        : { background: 'rgba(27,87,255,0.08)', color: 'var(--color-primary, #1b57ff)', borderRadius: 10 };
  const body = (
    <>
      {glyph && <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center" style={iconBox}><Glyph name={glyph} size={19} /></span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-black leading-tight" style={{ color: t.ink, fontFamily: skin === 'p5' ? P5_TITLE_FONT : undefined }}>{label}</span>
        {desc && <span className="mt-0.5 block text-[12px] font-semibold leading-snug" style={{ color: t.sub, opacity: skin === 'p4' ? 0.68 : 1 }}>{desc}</span>}
      </span>
      {control && <span className="shrink-0">{control}</span>}
    </>
  );
  const cls = `relative flex items-center gap-3 py-2.5 ${onClick ? 'cursor-pointer' : ''}`;
  return (
    <motion.div
      data-setting-row={id}
      className="relative"
      animate={flashing ? { backgroundColor: ['rgba(53,209,232,0)', 'rgba(53,209,232,0.35)', 'rgba(53,209,232,0)'] } : undefined}
      transition={{ duration: 1.4 }}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className={`${cls} w-full text-left focus-visible:outline-none`}>{body}</button>
      ) : (
        <div className={cls}>{body}</div>
      )}
      {children && <div className="pb-2.5 pt-0.5">{children}</div>}
    </motion.div>
  );
};

/** 行与行之间的分隔线（按频道） */
export const Divider = () => {
  const skin = useSettingsSkin();
  const color = skin === 'p3' ? 'rgba(53,209,232,0.35)' : skin === 'p4' ? 'rgba(19,19,19,0.18)' : skin === 'p5' ? P5R.ink : 'rgba(107,122,153,0.16)';
  return <div aria-hidden className="my-0.5" style={{ height: skin === 'p5' ? 2 : 1, background: skin === 'p3' ? `repeating-linear-gradient(90deg, ${color} 0 10px, transparent 10px 16px)` : color }} />;
};

/** 右侧「当前值 ›」链接文字 */
export const LinkValue = ({ children }: { children: ReactNode }) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  return <span className="text-[13px] font-black" style={{ color: skin === 'p4' ? t.ink : t.accent }}>{children} <span aria-hidden>›</span></span>;
};

// ── 多选小签（30b：提醒内容 / 语气关键词）─────────────────────────────────────
export const Chip = ({ on, onClick, children, ariaLabel, title, glyph, seed = 0 }: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
  title?: string;
  glyph?: GlyphName;
  /** P5 撕边形状的种子（同一排的签各不相同） */
  seed?: number;
}) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const icon = glyph ? <Glyph name={glyph} size={14} /> : null;
  if (skin === 'p5') {
    return (
      <motion.button type="button" whileTap={{ x: 1.5, y: 2 }} onClick={onClick} aria-pressed={on} aria-label={ariaLabel} title={title}
        className="relative inline-flex items-center px-3 py-1.5 text-[12.5px] font-black" style={{ color: on ? P5R.white : P5R.ink, fontFamily: P5_TITLE_FONT }}>
        <P5Rough seed={960 + seed * 7} jag={3.5} frame={2} face={on ? P5R.red : P5R.paper} shadow={on ? { x: 2, y: 2.5 } : { x: 1.5, y: 1.5 }} />
        <span className="relative inline-flex items-center gap-1">{icon}{children}</span>
      </motion.button>
    );
  }
  if (skin === 'p3') {
    // 未选：白面 + 青色斜框（放在淡蓝的时段卡上、白色的分组卡上都看得清）；选中：实心蓝
    const clip = 'polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)';
    return (
      <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={onClick} aria-pressed={on} aria-label={ariaLabel} title={title}
        className="relative inline-flex items-center px-3.5 py-1.5 text-[12.5px] font-black transition-colors"
        style={{ clipPath: clip, background: on ? P3R.blue : 'rgba(53,209,232,0.65)', color: on ? '#fff' : t.ink }}>
        {!on && <span aria-hidden className="absolute inset-[1.5px]" style={{ clipPath: clip, background: 'var(--p3r-panel, #fff)' }} />}
        <span className="relative inline-flex items-center gap-1">{icon}{children}</span>
      </motion.button>
    );
  }
  if (skin === 'p4') {
    return (
      <motion.button type="button" whileTap={{ scale: 0.94, rotate: -1.5 }} onClick={onClick} aria-pressed={on} aria-label={ariaLabel} title={title}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-[12.5px] font-black"
        style={{ borderRadius: 999, background: on ? '#131313' : 'var(--ui-paper, #fff6d0)', color: on ? 'var(--ui-bg, #ffd900)' : 'var(--ui-ink, #131313)', boxShadow: '0 0 0 2px #131313' }}>
        {icon}{children}
      </motion.button>
    );
  }
  return (
    <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={onClick} aria-pressed={on} aria-label={ariaLabel} title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition-colors ${on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
      {icon}{children}
    </motion.button>
  );
};

// ── 提示条（30b：网页版说明 / 权限没给）────────────────────────────────────────
export const Note = ({ tone = 'info', children, action }: { tone?: 'info' | 'warn'; children: ReactNode; action?: ReactNode }) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const warn = tone === 'warn';
  const inner = (
    <>
      <span className="min-w-0 flex-1 text-[12px] font-bold leading-snug">{children}</span>
      {action && <span className="shrink-0">{action}</span>}
    </>
  );
  if (skin === 'p5') {
    return (
      <div className="relative flex items-center gap-3 px-3.5 py-2.5" style={{ color: P5R.white, fontFamily: P5_TITLE_FONT }}>
        <P5Rough seed={warn ? 991 : 987} jag={4} frame={2} face={warn ? P5R.red : P5R.ink} frameColor={P5R.ink} shadow={{ x: 2, y: 3 }} />
        <span className="relative flex w-full items-center gap-3">{inner}</span>
      </div>
    );
  }
  if (skin === 'p3') {
    return (
      <div className="relative flex items-center gap-3 py-2.5 pl-4 pr-3" style={{ clipPath: slantClip(8), background: warn ? 'rgba(240,65,127,0.12)' : P3R.cyanFaint, color: warn ? P3R.magenta : t.ink }}>
        <span aria-hidden className="absolute inset-y-0 left-0 w-[5px]" style={{ background: warn ? P3R.magenta : P3R.blue }} />
        {inner}
      </div>
    );
  }
  if (skin === 'p4') {
    return (
      <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderRadius: 14, background: warn ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-paper, #fff6d0)', color: warn ? '#131313' : 'var(--ui-ink, #131313)', boxShadow: '0 0 0 2px #131313' }}>
        {inner}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${warn ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300'}`}>
      {inner}
    </div>
  );
};

// ── 分段选择 ─────────────────────────────────────────────────────────────────
export const Segmented = <V extends string>({ value, options, onChange, ariaLabel, size = 'md' }: {
  value: V;
  options: Array<{ value: V; label: ReactNode; hint?: string }>;
  onChange: (v: V) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  const pad = size === 'sm' ? 'py-1.5 text-[12px]' : 'py-2 text-[13px]';
  if (skin === 'p3') {
    return (
      <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1.5">
        {options.map(o => {
          const on = o.value === value;
          return (
            <motion.button key={o.value} type="button" role="radio" aria-checked={on} whileTap={{ scale: 0.95 }} onClick={() => onChange(o.value)} title={o.hint}
              className={`flex-1 font-black transition-colors ${pad}`}
              style={{ clipPath: 'polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)', background: on ? P3R.blue : t.chip, color: on ? '#fff' : t.ink }}>
              {o.label}
            </motion.button>
          );
        })}
      </div>
    );
  }
  if (skin === 'p5') {
    return (
      <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <motion.button key={o.value} type="button" role="radio" aria-checked={on} whileTap={{ x: 2, y: 3 }} onClick={() => onChange(o.value)} title={o.hint}
              className={`relative flex-1 cursor-pointer px-3 font-black ${pad}`} style={{ color: on ? P5R.white : P5R.ink, fontFamily: P5_TITLE_FONT }}>
              <P5Rough seed={575 + i * 9 + String(o.value).length} jag={4} frame={2.5} face={on ? P5R.red : P5R.paper} shadow={{ x: 2.5, y: 3 }} />
              <span className="relative inline-flex items-center justify-center gap-1">{o.label}{on && <P5Star size={11} fill={P5R.white} />}</span>
            </motion.button>
          );
        })}
      </div>
    );
  }
  // P4 / 中性：滑动高亮块
  const hl = skin === 'p4' ? { background: '#131313', color: 'var(--ui-bg, #ffd900)' } : { background: 'var(--color-primary, #1b57ff)', color: '#fff' };
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="relative flex gap-1 p-1" style={{ background: skin === 'p4' ? 'rgba(19,19,19,0.08)' : t.chip, borderRadius: skin === 'p4' ? 999 : 12, boxShadow: skin === 'p4' ? 'inset 0 0 0 2px #131313' : undefined }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)} title={o.hint}
            className={`relative flex-1 font-black ${pad}`} style={{ color: on ? hl.color : t.ink, borderRadius: skin === 'p4' ? 999 : 10 }}>
            {on && (
              <motion.span layoutId={`seg-${ariaLabel}`} aria-hidden className="absolute inset-0" style={{ background: hl.background, borderRadius: skin === 'p4' ? 999 : 10 }} transition={anim ? { type: 'spring', stiffness: 420, damping: 32 } : { duration: 0 }} />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
};

// ── 按钮 ─────────────────────────────────────────────────────────────────────
export const Btn = ({ children, tone = 'primary', onClick, disabled, className, ariaLabel, small }: {
  children: ReactNode;
  tone?: 'primary' | 'soft' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  small?: boolean;
}) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const { fire, element: sweep } = useSweep();
  if (skin === 'p5') {
    return (
      <P5Btn tone={tone === 'primary' || tone === 'danger' ? 'red' : 'paper'} seed={700 + (ariaLabel?.length ?? 3)} onClick={onClick} disabled={disabled} className={className} ariaLabel={ariaLabel} bodyClassName={small ? '!px-3 !py-2 !text-[13px]' : '!px-4 !py-2.5 !text-[14px]'}>
        {children}
      </P5Btn>
    );
  }
  if (skin === 'p3') {
    const skinStyle: CSSProperties = tone === 'primary' ? { background: P3R.blue, color: '#fff' } : tone === 'danger' ? { background: P3R.magenta, color: '#fff' } : { background: P3R.cyanFaint, color: P3R.ink };
    return (
      <button type="button" onClick={onClick} onPointerDown={fire} disabled={disabled} aria-label={ariaLabel}
        className={`relative select-none overflow-hidden font-black disabled:cursor-not-allowed disabled:opacity-40 ${small ? 'px-3 py-1.5 text-[12px]' : 'px-5 py-2.5 text-[14px]'} ${className ?? ''}`}
        style={{ clipPath: slantClip(8), ...skinStyle }}>
        {children}{sweep}
      </button>
    );
  }
  if (skin === 'p4') {
    const bg = tone === 'primary' ? '#131313' : tone === 'danger' ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-paper, #fff6d0)';
    const fg = tone === 'primary' ? 'var(--ui-bg, #ffd900)' : tone === 'danger' ? '#131313' : 'var(--ui-ink, #131313)';
    return (
      <motion.button type="button" whileTap={anim ? { scale: 0.95 } : undefined} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
        className={`select-none rounded-full font-black disabled:cursor-not-allowed disabled:opacity-40 ${small ? 'px-3 py-1.5 text-[12px]' : 'px-5 py-2.5 text-[14px]'} ${className ?? ''}`}
        style={{ background: bg, color: fg, boxShadow: '0 0 0 2px #131313, 0 3px 0 rgba(19,19,19,0.3)' }}>
        {children}
      </motion.button>
    );
  }
  const cls = tone === 'primary' ? 'bg-primary text-white' : tone === 'danger' ? 'bg-rose-500 text-white' : 'bg-primary/10 text-primary';
  return (
    <motion.button type="button" whileTap={anim ? { scale: 0.95 } : undefined} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className={`select-none rounded-xl font-bold disabled:cursor-not-allowed disabled:opacity-40 ${small ? 'px-3 py-1.5 text-[12px]' : 'px-5 py-2.5 text-[14px]'} ${cls} ${className ?? ''}`}>
      {children}
    </motion.button>
  );
};

// ── 输入 ─────────────────────────────────────────────────────────────────────
export const inputClass = (skin: SettingsSkin, extra = '') => {
  const base = 'w-full px-3 py-2 text-[14px] font-bold focus:outline-none transition-colors';
  if (skin === 'p3') return `${base} border-2 ${extra}`;
  if (skin === 'p4') return `${base} rounded-xl border-2 border-[#131313] ${extra}`;
  if (skin === 'p5') return `${base} ${extra}`; // .p5-reskin 毯式黑框
  return `${base} rounded-xl border border-gray-200 bg-white text-gray-800 focus:border-primary dark:border-gray-600 dark:bg-gray-800 dark:text-white ${extra}`;
};
export const inputStyle = (skin: SettingsSkin): CSSProperties | undefined => {
  if (skin === 'p3') return { borderColor: 'rgba(53,209,232,0.55)', background: P3R.panel, color: P3R.ink, clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' };
  // 黄：.p4-reskin 的毯式皮会把 border 清成透明、底色刷成奶油（和卡片同色），描边只能走 box-shadow
  if (skin === 'p4') return { background: 'var(--ui-paper, #fff6d0)', color: 'var(--ui-ink, #131313)', boxShadow: '0 0 0 2px #131313' };
  return undefined;
};

export const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
  const skin = useSettingsSkin();
  return <input {...props} className={inputClass(skin, props.className ?? '')} style={{ ...inputStyle(skin), ...props.style }} />;
};
export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const skin = useSettingsSkin();
  return <textarea {...props} className={inputClass(skin, `resize-none ${props.className ?? ''}`)} style={{ ...inputStyle(skin), ...props.style }} />;
};
export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => {
  const skin = useSettingsSkin();
  return <select {...props} className={inputClass(skin, `!w-auto ${props.className ?? ''}`)} style={{ ...inputStyle(skin), ...props.style }} />;
};

export { Toggle };

// ── 搜索框 + 结果 ────────────────────────────────────────────────────────────
export interface SearchHit { sectionId: string; rowId?: string; label: string; sectionTitle: string }

export const SearchBox = ({ value, onChange, hits, onPick, placeholder = '搜索设置项，比如「夜间」「音量」「人格」' }: {
  value: string;
  onChange: (v: string) => void;
  hits: SearchHit[];
  onPick: (h: SearchHit) => void;
  placeholder?: string;
}) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const anim = useBoldness();
  const ref = useRef<HTMLInputElement>(null);
  const box: CSSProperties = skin === 'p3'
    ? { clipPath: slantClip(10), background: t.panel, boxShadow: '0 8px 18px rgba(38,96,140,0.08)' }
    : skin === 'p4'
      ? { background: 'var(--ui-paper, #fff6d0)', borderRadius: 999, boxShadow: '0 0 0 2.5px #131313' }
      : skin === 'p5'
        ? { background: P5R.paper, clipPath: roughQuad(910, 4), boxShadow: `3px 3px 0 ${P5R.ink}` }
        : { background: 'var(--ui-paper, #fff)', borderRadius: 14, boxShadow: '0 10px 24px rgba(27,87,255,0.08)' };
  return (
    <div className="relative">
      <label className="relative flex items-center gap-2.5 px-4 py-2.5" style={box}>
        <span aria-hidden style={{ color: skin === 'p5' ? P5R.ink : t.accent }}><Glyph name="search" size={18} /></span>
        <input
          ref={ref}
          type="search"
          data-plain="1"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label="搜索设置项"
          className="min-w-0 flex-1 bg-transparent text-[14px] font-bold placeholder:font-semibold focus:outline-none"
          style={{ color: t.ink }}
        />
        {value && (
          <button type="button" aria-label="清空搜索" onClick={() => { onChange(''); ref.current?.focus(); }} className="text-[12px] font-black" style={{ color: t.sub }}>×</button>
        )}
      </label>
      <AnimatePresence>
        {value.trim() && (
          <motion.ul
            initial={anim ? { opacity: 0, y: -6 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            data-settings-search-results
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto px-1 py-1"
            style={{ ...box, clipPath: undefined, borderRadius: skin === 'p4' ? 18 : skin === 'neutral' ? 14 : 0 }}
          >
            {hits.length === 0 && <li className="px-3 py-2 text-[12px] font-bold" style={{ color: t.sub }}>没有这一项</li>}
            {hits.map(h => (
              <li key={`${h.sectionId}:${h.rowId ?? ''}:${h.label}`}>
                <button type="button" onClick={() => onPick(h)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                  <span className="text-[13px] font-black" style={{ color: t.ink }}>{h.label}</span>
                  <span className="ml-auto shrink-0 text-[11px] font-bold" style={{ color: t.sub }}>{h.sectionTitle} ›</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

/** 命中行滚过去 + 闪一下：返回 flash 的行 id（1.4 秒后清掉） */
export const useRowFlash = () => {
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!flashId) return;
    const t = window.setTimeout(() => setFlashId(null), 1500);
    return () => window.clearTimeout(t);
  }, [flashId]);
  const flashRow = (rowId: string | undefined) => {
    if (!rowId) return;
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-setting-row="${rowId}"]`) ?? document.querySelector<HTMLElement>(`[aria-label="${rowId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(rowId);
    }, 420);
  };
  return { flashId, flashRow };
};
