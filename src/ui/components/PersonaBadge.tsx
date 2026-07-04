/**
 * PersonaBadge —— 标签/徽章原语（收编 LVTag / 状态章 / Rank 贴纸的统一来源）。
 *
 * 三频道三形态：P5 = 微倾贴纸（白纸黑边）；P4 = 圆角胶囊（黑边彩底）；
 * P3 = 方角细边战术标（青线）；neutral = 现有灰底圆角。
 * tone 表语义：accent 强调 / danger 危险 / muted 次要 / outline 空心。
 */
import type { ReactNode } from 'react';
import type { UIChannel } from '../channel';
import { useUiChannel } from '../useUiChannel';

export type PersonaBadgeTone = 'accent' | 'danger' | 'muted' | 'outline';

export interface PersonaBadgeProps {
  channel?: UIChannel;
  tone?: PersonaBadgeTone;
  children: ReactNode;
  className?: string;
}

const skin = (ch: UIChannel, tone: PersonaBadgeTone): { cls: string; style: React.CSSProperties } => {
  if (ch === 'p5') {
    const base = 'border-2 border-black font-black tracking-wide';
    switch (tone) {
      case 'accent': return { cls: `${base} text-white`, style: { background: 'var(--ui-accent)', transform: 'rotate(-2deg)', boxShadow: '2px 2px 0 #000' } };
      case 'danger': return { cls: `${base} bg-black text-[var(--ui-danger)]`, style: { transform: 'rotate(1.5deg)', boxShadow: '2px 2px 0 rgba(230,0,18,0.5)' } };
      case 'muted': return { cls: `${base} bg-[var(--ui-paper)] text-black`, style: { transform: 'rotate(-1deg)', boxShadow: '2px 2px 0 #000' } };
      case 'outline': return { cls: 'border-2 border-white/60 font-bold text-white/85', style: {} };
    }
  }
  if (ch === 'p4') {
    const base = 'rounded-full border-2 border-black font-black tracking-wider';
    switch (tone) {
      case 'accent': return { cls: `${base} text-black`, style: { background: 'var(--ui-accent)' } };
      case 'danger': return { cls: `${base} text-white`, style: { background: 'var(--ui-danger)' } };
      case 'muted': return { cls: `${base} text-black`, style: { background: 'var(--ui-paper)' } };
      case 'outline': return { cls: 'rounded-full border-2 border-black/50 font-bold text-black/70', style: {} };
    }
  }
  if (ch === 'p3') {
    const base = 'font-bold tracking-wide';
    switch (tone) {
      case 'accent': return { cls: `${base} text-[#05070d]`, style: { background: 'var(--ui-accent)', clipPath: 'polygon(0 0, 96% 0, 100% 100%, 4% 100%)' } };
      case 'danger': return { cls: `${base} text-white`, style: { background: 'var(--ui-danger)', clipPath: 'polygon(0 0, 96% 0, 100% 100%, 4% 100%)' } };
      // p3 accent 是固定信号色（不随主题），透明档直接写 rgba（kit 同款做法）
      case 'muted': return { cls: `${base} border text-white/85`, style: { borderColor: 'rgba(0,216,255,0.5)' } };
      case 'outline': return { cls: `${base} border text-[var(--ui-muted)]`, style: { borderColor: 'rgba(246,251,255,0.35)' } };
    }
  }
  // neutral
  switch (tone) {
    case 'accent': return { cls: 'rounded-lg bg-primary/10 font-semibold text-primary', style: {} };
    case 'danger': return { cls: 'rounded-lg bg-red-50 font-semibold text-red-500 dark:bg-red-900/20', style: {} };
    case 'muted': return { cls: 'rounded-lg bg-gray-100 font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400', style: {} };
    case 'outline': return { cls: 'rounded-lg border border-gray-300 font-medium text-gray-500 dark:border-gray-600 dark:text-gray-400', style: {} };
  }
};

export const PersonaBadge = ({ channel, tone = 'accent', children, className }: PersonaBadgeProps) => {
  const inherited = useUiChannel();
  const s = skin(channel ?? inherited, tone);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] leading-none ${s.cls} ${className ?? ''}`}
      style={s.style}
    >
      {children}
    </span>
  );
};
