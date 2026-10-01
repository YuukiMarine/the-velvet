/**
 * 组织（第 7 轮）界面共用件：四频道色调、徽记、徽记章、按钮、座位点、出勤七格。
 * 颜色全走带夜间覆盖的 CSS 变量（P3 的 --p3r-*、P4 / 中性的 --ui-*），红频道本来就没有夜间。
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useUiChannel } from '@/ui/useUiChannel';
import type { UIChannel } from '@/ui/channel';
import { P3R, SlantButton, slantClip } from '@/components/p3r/kit';
import { P5R, P5_FONT, P5_TITLE_FONT, P5Btn, roughQuad } from '@/components/p5r/kit';
import { P4Sparkle } from '@/ui/p4Kit';
import type { OrgEmblemId } from '@/utils/orgLogic';

// ── 色调 ─────────────────────────────────────────────────────────────────────

export interface OrgTone {
  channel: UIChannel;
  /** 面板（纸 / 卡）上的字 */
  ink: string;
  sub: string;
  /** 直接压在页面舞台上的字（红频道舞台是黑的） */
  stageInk: string;
  stageSub: string;
  accent: string;
  accentInk: string;
  paper: string;
  line: string;
  soft: string;
  hot: string;
  titleFont?: string;
  bodyFont?: string;
}

const TONES: Record<UIChannel, OrgTone> = {
  p3: {
    channel: 'p3', ink: P3R.ink, sub: P3R.inkSoft, stageInk: P3R.ink, stageSub: P3R.inkSoft,
    accent: P3R.blue, accentInk: '#ffffff', paper: P3R.panel, line: 'rgba(27,87,255,0.16)', soft: P3R.cyanFaint, hot: P3R.magenta,
  },
  p4: {
    channel: 'p4', ink: 'var(--ui-ink, #131313)', sub: 'var(--ui-muted, #837a58)', stageInk: 'var(--ui-ink, #131313)', stageSub: 'var(--ui-muted, #837a58)',
    accent: 'var(--ui-accent, #2e6be0)', accentInk: '#ffffff', paper: 'var(--ui-paper, #fff6d0)', line: 'var(--ui-line, #131313)', soft: 'rgba(19,19,19,0.07)', hot: 'var(--p4-orange, #f9a11b)',
  },
  p5: {
    channel: 'p5', ink: P5R.ink, sub: '#4a4640', stageInk: P5R.white, stageSub: P5R.greyLight,
    accent: P5R.red, accentInk: P5R.white, paper: P5R.paper, line: P5R.ink, soft: 'rgba(0,0,0,0.07)', hot: P5R.red,
    titleFont: P5_TITLE_FONT, bodyFont: P5_FONT,
  },
  neutral: {
    channel: 'neutral', ink: 'var(--ui-ink, #111827)', sub: 'var(--ui-muted, #6b7280)', stageInk: 'var(--ui-ink, #111827)', stageSub: 'var(--ui-muted, #6b7280)',
    accent: 'var(--ui-accent, #6366f1)', accentInk: '#ffffff', paper: 'var(--ui-paper, #ffffff)', line: 'var(--ui-line, #e5e7eb)', soft: 'rgba(127,127,127,0.09)', hot: '#f43f5e',
  },
};

export function useOrgTone(): OrgTone {
  const channel = useUiChannel();
  return useMemo(() => TONES[channel], [channel]);
}

// ── 徽记 ─────────────────────────────────────────────────────────────────────

/** 24×24 实心字形；洞一律逆时针画（nonzero 填充下自然镂空） */
const EMBLEMS: Record<OrgEmblemId, { d: string; stroke?: boolean }> = {
  star: { d: 'M12 2.4L14.59 9.04L21.7 9.45L16.18 13.96L18 20.85L12 17L6 20.85L7.82 13.96L2.3 9.45L9.41 9.04Z' },
  moon: { d: 'M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79Z' },
  sun: {
    d: 'M12 7.2a4.8 4.8 0 1 1 0 9.6a4.8 4.8 0 1 1 0-9.6Z M18.4 10.7L22.6 12L18.4 13.3Z M13.3 18.4L12 22.6L10.7 18.4Z M5.6 13.3L1.4 12L5.6 10.7Z M10.7 5.6L12 1.4L13.3 5.6Z '
      + 'M15.61 17.45L19.5 19.5L17.45 15.61Z M6.55 15.61L4.5 19.5L8.39 17.45Z M8.39 6.55L4.5 4.5L6.55 8.39Z M17.45 8.39L19.5 4.5L15.61 6.55Z',
  },
  key: { d: 'M7.5 6.5a5 5 0 1 1 0 10a5 5 0 1 1 0-10Z M7.5 9.3a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4Z M12 10.3H22V13.3H20.2V16.3H17.6V13.3H16V15.3H13.6V13.3H12Z' },
  mask: {
    d: 'M2 9.2C4.6 7.4 8 7.2 12 8.9C16 7.2 19.4 7.4 22 9.2C22 14 20.2 17.2 17.1 17.2C15 17.2 13.7 15.8 12 14.6C10.3 15.8 9 17.2 6.9 17.2C3.8 17.2 2 14 2 9.2Z '
      + 'M9.6 11.8A2.3 1.5 0 1 0 5 11.8A2.3 1.5 0 1 0 9.6 11.8Z M19 11.8A2.3 1.5 0 1 0 14.4 11.8A2.3 1.5 0 1 0 19 11.8Z',
  },
  crow: { d: 'M20.5 3.2C13.6 3.6 8.2 8.4 7.1 15.2L4.2 20.4L5.6 20.9L8.3 16.6C14.8 15.9 19.6 10.4 20.5 3.2Z' },
  butterfly: {
    d: 'M12 8.2C10.4 4.6 5.8 3.2 3.4 4.6C1.2 6 2.6 10.4 7.4 11.6C4.4 12.6 3.4 15.6 5.2 17.2C7 18.8 10.2 16.8 12 13.6C13.8 16.8 17 18.8 18.8 17.2C20.6 15.6 19.6 12.6 16.6 11.6C21.4 10.4 22.8 6 20.6 4.6C18.2 3.2 13.6 4.6 12 8.2Z '
      + 'M11.3 7.6H12.7V17.8H11.3Z',
  },
  fox: { d: 'M3.2 3L8.6 7.6H15.4L20.8 3L20 11.2L12 20.6L4 11.2Z M8.2 11.4L8.6 13.4L10.6 12.8Z M15.8 11.4L13.4 12.8L15.4 13.4Z' },
  cat: { d: 'M4 3.5L8.4 8H15.6L20 3.5V12.5A8 8 0 0 1 4 12.5Z M10.3 13A1.3 1.8 0 1 0 7.7 13A1.3 1.8 0 1 0 10.3 13Z M16.3 13A1.3 1.8 0 1 0 13.7 13A1.3 1.8 0 1 0 16.3 13Z' },
  flame: {
    d: 'M12.4 2.2C13 5.6 17.8 7.8 17.8 13.6A5.8 5.8 0 0 1 6.2 13.6C6.2 10.8 7.8 8.8 9 7.4C9 9.4 9.9 10.6 11 11C10.6 7.6 11 4.8 12.4 2.2Z '
      + 'M12 12.6C11.2 14.2 9.6 15 9.6 16.4A2.4 2.4 0 0 0 14.4 16.4C14.4 14.8 12.9 14 12 12.6Z',
  },
  wave: { d: 'M2 8.5c2.5-2 5-2 7.5 0s5 2 7.5 0 3.3-1.4 5-1.2 M2 13c2.5-2 5-2 7.5 0s5 2 7.5 0 3.3-1.4 5-1.2 M2 17.5c2.5-2 5-2 7.5 0s5 2 7.5 0 3.3-1.4 5-1.2', stroke: true },
  crown: { d: 'M3 8.2L7.6 12.2L12 5L16.4 12.2L21 8.2L19.4 18.6H4.6Z M4.6 19.8H19.4V21.4H4.6Z' },
};

export function OrgEmblem({ id, size = 20, color = 'currentColor', className, style }: {
  id: string; size?: number; color?: string; className?: string; style?: CSSProperties;
}) {
  const e = EMBLEMS[id as OrgEmblemId] ?? EMBLEMS.star;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className} style={{ display: 'block', ...style }}>
      {e.stroke
        ? <path d={e.d} fill="none" stroke={color} strokeWidth={2.3} strokeLinecap="round" />
        : <path d={e.d} fill={color} />}
    </svg>
  );
}

/** 徽记章：各频道一种造型（蓝＝菱形、黄＝橙贴纸、红＝不规则红块、中性＝圆） */
export function EmblemBadge({ id, size = 40, className }: { id: string; size?: number; className?: string }) {
  const tone = useOrgTone();
  const glyph = Math.round(size * 0.52);
  if (tone.channel === 'p3') {
    return (
      <span className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`} style={{ width: size, height: size }}>
        <span aria-hidden className="absolute inset-[9%]" style={{ background: P3R.blue, transform: 'rotate(45deg)', boxShadow: '0 6px 14px rgba(27,87,255,0.28)' }} />
        <span aria-hidden className="absolute" style={{ right: '4%', bottom: '10%', width: size * 0.3, height: size * 0.12, background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
        <OrgEmblem id={id} size={glyph} color="#ffffff" className="relative" />
      </span>
    );
  }
  if (tone.channel === 'p4') {
    return (
      <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${className ?? ''}`} style={{ width: size, height: size, background: 'var(--p4-orange, #f9a11b)', boxShadow: '0 0 0 2.5px #131313, 0 3px 0 2.5px rgba(19,19,19,0.28)' }}>
        <OrgEmblem id={id} size={glyph} color="#131313" />
        <P4Sparkle size={Math.max(10, size * 0.3)} color="#ffffff" className="absolute -right-1 -top-1" />
      </span>
    );
  }
  if (tone.channel === 'p5') {
    return (
      <span className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`} style={{ width: size, height: size }}>
        <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(2px,3px)', background: P5R.ink, clipPath: roughQuad(id.length + 0.3, 4) }} />
        <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(id.length + 0.5, 3) }} />
        <span aria-hidden className="absolute inset-[3px]" style={{ background: P5R.red, clipPath: roughQuad(id.length + 0.7, 3) }} />
        <OrgEmblem id={id} size={glyph} color={P5R.white} className="relative" />
      </span>
    );
  }
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${className ?? ''}`} style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--ui-accent, #6366f1), rgb(var(--color-bond-bright-rgb, 168 85 247)))', boxShadow: '0 6px 16px -6px rgba(99,102,241,0.55)' }}>
      <OrgEmblem id={id} size={glyph} color="#ffffff" />
    </span>
  );
}

// ── 按钮 ─────────────────────────────────────────────────────────────────────

export function OrgButton({ children, onClick, tone = 'primary', disabled = false, small = false, className, ariaLabel }: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  small?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const channel = useUiChannel();
  if (channel === 'p3') {
    return (
      <SlantButton
        tone={tone === 'primary' ? 'primary' : tone === 'danger' ? 'danger' : 'ghost'}
        onClick={onClick}
        disabled={disabled}
        ariaLabel={ariaLabel}
        magentaCorner={tone === 'primary' && !small}
        className={`shrink-0 whitespace-nowrap ${small ? '!px-4 !py-1.5 !text-[13px]' : ''} ${className ?? ''}`}
      >
        {children}
      </SlantButton>
    );
  }
  if (channel === 'p5') {
    return (
      <P5Btn
        tone={tone === 'primary' ? 'red' : tone === 'danger' ? 'ink' : 'paper'}
        onClick={onClick}
        disabled={disabled}
        ariaLabel={ariaLabel}
        className={`shrink-0 whitespace-nowrap ${className ?? ''}`}
        bodyClassName={small ? '!px-4 !py-2 !text-[13px]' : '!px-5 !py-2.5 !text-[15px]'}
      >
        {children}
      </P5Btn>
    );
  }
  if (channel === 'p4') {
    const bg = tone === 'primary' ? 'var(--ui-accent, #2e6be0)' : tone === 'danger' ? 'var(--ui-danger, #e8452c)' : 'var(--ui-paper, #fff6d0)';
    const fg = tone === 'ghost' ? 'var(--ui-ink, #131313)' : '#ffffff';
    return (
      <motion.button
        type="button"
        whileTap={disabled ? undefined : { y: 2 }}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`relative shrink-0 whitespace-nowrap font-black disabled:opacity-40 ${small ? 'px-4 py-1.5 text-[13px]' : 'px-5 py-2.5 text-[15px]'} ${className ?? ''}`}
        style={{ background: bg, color: fg, borderRadius: 16, skewX: -6, boxShadow: '0 3px 0 rgba(19,19,19,0.25)' }}
      >
        <span className="inline-block" style={{ transform: 'skewX(6deg)' }}>{children}</span>
      </motion.button>
    );
  }
  const cls = tone === 'primary'
    ? 'text-white shadow-lg shadow-indigo-500/20'
    : tone === 'danger'
      ? 'bg-rose-500 text-white'
      : 'bg-black/5 text-gray-700 dark:bg-white/10 dark:text-gray-200';
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`shrink-0 whitespace-nowrap rounded-xl font-bold disabled:opacity-40 ${small ? 'px-3.5 py-1.5 text-[13px]' : 'px-5 py-2.5 text-[15px]'} ${cls} ${className ?? ''}`}
      style={tone === 'primary' ? { background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb)), rgb(var(--color-bond-bright-rgb)))' } : undefined}
    >
      {children}
    </motion.button>
  );
}

// ── 小件 ─────────────────────────────────────────────────────────────────────

/** 七个座位点：有人的实心，我的那个带圈 */
export function SeatDots({ seats, mine, color, empty, size = 7 }: { seats: number[]; mine?: number; color: string; empty: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`${seats.length} / 7 人`}>
      {Array.from({ length: 7 }, (_, i) => {
        const seat = i + 1;
        const on = seats.includes(seat);
        return (
          <span
            key={seat}
            aria-hidden
            className="inline-block rounded-full"
            style={{
              width: size, height: size,
              background: on ? color : 'transparent',
              boxShadow: seat === mine ? `0 0 0 1.5px ${color}, 0 0 0 3px ${empty}` : on ? undefined : `inset 0 0 0 1.2px ${empty}`,
            }}
          />
        );
      })}
    </span>
  );
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 本周出勤七格（bit0 = 周一）；today = 今天是第几格（0–6），不在本周就不标 */
export function WeekDots({ days, today, on, off, labels = false, size = 9 }: { days: number; today?: number; on: string; off: string; labels?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-label={`本周出勤 ${WEEK_LABELS.filter((_, i) => days & (1 << i)).length} 天`}>
      {WEEK_LABELS.map((l, i) => {
        const hit = !!(days & (1 << i));
        return (
          <span key={l} className="inline-flex flex-col items-center gap-[2px]">
            <span
              aria-hidden
              className="inline-block"
              style={{
                width: size, height: size, borderRadius: 2,
                background: hit ? on : off,
                outline: today === i ? `1.5px solid ${on}` : undefined,
                outlineOffset: 1,
              }}
            />
            {labels && <span aria-hidden className="text-[8px] font-bold leading-none" style={{ opacity: 0.7 }}>{l}</span>}
          </span>
        );
      })}
    </span>
  );
}

/** 频道的卡片外框：蓝＝斜切白卡、黄＝奶油贴纸、红＝纸面不规则块、中性＝圆角卡 */
export function OrgPanel({ children, className, style, seed = 3, padded = true }: { children: ReactNode; className?: string; style?: CSSProperties; seed?: number; padded?: boolean }) {
  const tone = useOrgTone();
  const pad = padded ? 'p-4' : '';
  if (tone.channel === 'p3') {
    return (
      <div className={`relative ${pad} ${className ?? ''}`} style={{ background: P3R.panelGlass, clipPath: slantClip(10), boxShadow: '0 10px 24px rgba(38,96,140,0.10)', color: tone.ink, ...style }}>
        {children}
      </div>
    );
  }
  if (tone.channel === 'p4') {
    return (
      <div className={`relative ${pad} ${className ?? ''}`} style={{ background: tone.paper, borderRadius: 18, boxShadow: '0 0 0 2px var(--ui-line, #131313), 0 4px 0 2px rgba(19,19,19,0.2)', color: tone.ink, ...style }}>
        {children}
      </div>
    );
  }
  if (tone.channel === 'p5') {
    return (
      <div className={`relative ${className ?? ''}`} style={{ color: P5R.ink, fontFamily: P5_FONT, ...style }}>
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(4px,5px)', background: P5R.red, clipPath: roughQuad(seed + 0.13, 6) }} />
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: P5R.ink, clipPath: roughQuad(seed + 0.29, 5) }} />
        <span aria-hidden className="pointer-events-none absolute inset-[3px]" style={{ background: P5R.paper, clipPath: roughQuad(seed + 0.47, 4) }} />
        <div className={`relative ${padded ? 'px-5 py-4' : ''}`}>{children}</div>
      </div>
    );
  }
  return (
    <div className={`relative rounded-2xl ${pad} ${className ?? ''}`} style={{ background: tone.paper, border: `1px solid ${tone.line}`, boxShadow: '0 10px 28px -18px rgba(0,0,0,0.35)', color: tone.ink, ...style }}>
      {children}
    </div>
  );
}

/** 单选小块（会议打分、作战类型 / 属性）：选中的实心 */
export function OrgChoice({ seed = 0, on, onClick, children, disabled = false, small = false }: { seed?: number; on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; small?: boolean }) {
  const tone = useOrgTone();
  const style = tone.channel === 'p3'
    ? { background: on ? P3R.blue : P3R.cyanFaint, color: on ? '#ffffff' : P3R.ink, clipPath: slantClip(6) }
    : tone.channel === 'p5'
      ? { background: on ? P5R.red : 'rgba(0,0,0,0.08)', color: on ? P5R.white : P5R.ink, clipPath: roughQuad(seed + 2.3, 2.5), fontFamily: P5_TITLE_FONT }
      : tone.channel === 'p4'
        ? { background: on ? 'var(--p4-orange, #f9a11b)' : 'transparent', color: on ? '#131313' : 'var(--ui-ink, #131313)', borderRadius: 12, boxShadow: `inset 0 0 0 2px ${on ? '#131313' : 'var(--ui-line, #131313)'}` }
        : { background: on ? tone.accent : 'rgba(127,127,127,0.1)', color: on ? '#ffffff' : tone.ink, borderRadius: 12 };
  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={disabled} className={`whitespace-nowrap font-black disabled:opacity-40 ${small ? 'px-2.5 py-1.5 text-[12px]' : 'py-2.5 text-[14px]'}`} style={style}>
      {children}
    </button>
  );
}

/** 输入框的皮（会议目标、作战标题 / 分工） */
export function orgInputSkin(tone: OrgTone): CSSProperties {
  if (tone.channel === 'p3') return { background: P3R.cyanFaint, color: P3R.ink, clipPath: slantClip(8) };
  if (tone.channel === 'p5') return { background: '#ffffff', color: P5R.ink, boxShadow: `inset 0 0 0 2px ${P5R.ink}`, fontFamily: P5_TITLE_FONT };
  if (tone.channel === 'p4') return { background: 'rgba(127,127,127,0.1)', color: 'var(--ui-ink, #131313)', borderRadius: 12, boxShadow: 'inset 0 0 0 2px var(--ui-line, #131313)' };
  return { background: 'rgba(127,127,127,0.08)', color: tone.ink, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${tone.line}` };
}
