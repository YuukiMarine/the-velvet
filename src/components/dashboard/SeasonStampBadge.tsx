import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { seasonMarkOf } from '@/utils/calendar';
import { useUiChannel } from '@/ui/useUiChannel';
import { useAppStore } from '@/store';
import { P3R } from '@/components/p3r/kit';

/**
 * 首页日期块上的岁时小签（第 6 轮）：当天是节气 / 节日才出现。
 * 用户口径：横排、和星期几一般大、不把问候区撑高。四频道各一套皮：蓝斜签 / 黄圆签 / 红朱签 / 中性签。
 * 当天记过一条就「收进岁时册」（实心），没记是虚线空签——点一下弹一行小注，顺便告诉你记一条就能收。
 */
export const SeasonStampBadge = ({ dateKey, className = '', align = 'left', pop = 'below' }: {
  dateKey: string;
  className?: string;
  /** 小注气泡朝哪边展开 */
  align?: 'left' | 'right';
  /** 小注气泡在小签上方还是下方（下方会被后面的卡压住时用上方） */
  pop?: 'above' | 'below';
}) => {
  const mark = useMemo(() => seasonMarkOf(dateKey), [dateKey]);
  const stamp = useLiveQuery(() => (mark ? db.stamps.get(mark.key) : Promise.resolve(undefined)), [mark?.key]);
  const [open, setOpen] = useState(false);
  const channel = useUiChannel();
  const dark = useAppStore((s) => !!s.settings.darkMode);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setOpen(false), 4500);
    return () => window.clearTimeout(t);
  }, [open]);
  if (!mark) return null;
  const collected = !!stamp;

  const P5_RED = '#c00008', P5_PAPER = '#f0e9df', INK = '#0b0b0b';
  let chipStyle: React.CSSProperties;
  let chipClass = 'relative inline-flex h-[18px] shrink-0 items-center whitespace-nowrap px-1.5 text-[10px] font-black leading-none tracking-[0.06em] select-none transition-transform active:scale-95';
  if (channel === 'p3') {
    // 走 P3R 变量：白天蓝、夜间浅绿、粉皮玫红跟着换（原来钉死 #1b57ff，夜间 / 粉皮里还是一块蓝）；
    // 收进岁时册的实心签字色用面板色——白天白字、夜间深靛字（浅绿底上白字看不清）
    chipStyle = collected
      ? { background: P3R.blue, color: P3R.panel, clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)' }
      : { background: 'transparent', color: P3R.blue, outline: `1.5px dashed ${P3R.blue}`, outlineOffset: -1.5 };
  } else if (channel === 'p4') {
    // 小签挂在黄 / 紫舞台上（不在天空日期牌上了），字和虚线跟着夜间翻浅
    chipClass += ' rounded-full';
    chipStyle = collected
      ? { background: 'var(--ui-accent, #2e6be0)', color: '#ffffff', boxShadow: '0 1.5px 0 rgba(19,19,19,0.25)' }
      : dark
        ? { background: 'rgba(243,236,255,0.08)', color: '#f3ecff', border: '1.5px dashed rgba(243,236,255,0.55)' }
        : { background: 'rgba(19,19,19,0.06)', color: '#131313', border: '1.5px dashed rgba(19,19,19,0.6)' };
  } else if (channel === 'p5') {
    chipStyle = collected
      ? { background: P5_RED, color: P5_PAPER, boxShadow: `1.5px 1.5px 0 ${INK}` }
      : { background: 'transparent', color: P5_RED, border: `1.5px dashed ${P5_RED}` };
  } else {
    chipClass += ' rounded';
    chipStyle = collected
      ? { background: 'var(--color-primary)', color: '#fff' }
      : { background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)', border: '1.5px dashed var(--color-primary)' };
  }
  // 小注气泡：P3 的 --ui-paper / --ui-ink 白天都是 #f6fbff（ink 是深舞台上的字色，不跟 paper 配对），
  // 拿它俩配就成了白底白字——P3 改用面板 / 墨两色（夜间、粉皮各自有值）
  const popStyle: React.CSSProperties = channel === 'p5'
    ? { background: P5_PAPER, color: INK, boxShadow: `3px 3px 0 ${INK}` }
    : channel === 'p3'
      ? { background: P3R.panel, color: P3R.ink, boxShadow: '0 10px 28px rgba(0,0,0,0.16)' }
      : { background: 'var(--ui-paper, #fff)', color: 'var(--ui-ink, #111)', boxShadow: '0 10px 28px rgba(0,0,0,0.16)' };

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label={`${mark.name}：${mark.note}${collected ? '（已收进岁时册）' : ''}`}
        aria-expanded={open}
        className={chipClass}
        style={chipStyle}
      >
        {mark.name}
      </button>
      {open && (
        <span
          role="status"
          className={`absolute z-40 w-[220px] rounded-xl px-3 py-2 text-left text-[12px] leading-relaxed ${pop === 'above' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={popStyle}
        >
          <b className="font-black">{mark.name}</b>
          <span className="mx-1 opacity-50">·</span>
          {mark.note}
          <span className="mt-1 block text-[11px] font-bold opacity-70">{collected ? '岁时册 · 已收录' : '今天记一条，就收进岁时册'}</span>
        </span>
      )}
    </span>
  );
};
