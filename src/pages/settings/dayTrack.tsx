/**
 * 一天 24 小时的小轨道（第 30 批 b）：通知提醒页标出今天的几个提醒时段，助手页标出夜里不打扰的那段。
 * 三频道按游戏语言画：蓝 = 斜切条 + 蓝斜块标记 + 洋红 NOW 线；黄 = 黑描边胶囊 + 黑钉；红 = 纸条 + 红星；中性 = 主题色点。
 * 动效经 useBoldness 闸门：标记依次弹出、夜段从左往右铺开。
 */
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { P3R } from '@/components/p3r/kit';
import { P5R, P5Star, P5_TITLE_FONT } from '@/components/p5r/kit';
import { Glyph, useSettingsSkin, skinTokens } from './kit';

/** "HH:MM" → 当天第几分钟（格式不对给 0） */
export const minutesOf = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return 0;
  return Math.min(1439, Math.max(0, Number(m[1]) * 60 + Number(m[2])));
};

export interface DayTrackMark { id: string; time: string; on: boolean; label?: string }
export interface DayTrackBand { from: string; to: string; label?: string }

const pct = (min: number) => `${(min / 1440) * 100}%`;

export const DayTrack = ({ marks = [], bands = [], now, ariaLabel }: {
  marks?: DayTrackMark[];
  /** 夜段：to 比 from 小就是跨过 0 点（22:30 → 08:30） */
  bands?: DayTrackBand[];
  /** 现在几点（分钟）；不给就不画 NOW 线 */
  now?: number;
  ariaLabel: string;
}) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  // 跨 0 点的夜段拆成两截
  const segs = bands.flatMap((b) => {
    const a = minutesOf(b.from), z = minutesOf(b.to);
    return a <= z ? [{ a, z, label: b.label }] : [{ a, z: 1440, label: b.label }, { a: 0, z, label: undefined }];
  });
  const track = skin === 'p3'
    ? { background: 'var(--p3r-chip, #ddeef7)', clipPath: 'polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)' }
    : skin === 'p4'
      ? { background: 'var(--ui-paper, #fff6d0)', borderRadius: 999, boxShadow: '0 0 0 2px #131313' }
      : skin === 'p5'
        ? { background: P5R.paperDim, clipPath: 'polygon(0 1px, 100% 0, 99.6% 100%, 0.4% calc(100% - 1px))', boxShadow: `0 2px 0 ${P5R.ink}` }
        : { background: 'rgba(107,122,153,0.14)', borderRadius: 999 };
  // 蓝：P3R.ink 夜间会翻成浅色（夜段反倒发亮），夜段固定用深靛斜纹，白天黑夜都读作「夜里」
  const bandColor = skin === 'p3' ? 'repeating-linear-gradient(115deg, #0a1230 0 6px, #22346b 6px 9px)' : skin === 'p4' ? '#131313' : skin === 'p5' ? P5R.ink : 'rgba(30,41,59,0.78)';
  const nowColor = skin === 'p3' ? P3R.magenta : skin === 'p4' ? 'var(--p4-orange, #f9a11b)' : skin === 'p5' ? P5R.red : '#f43f5e';
  const sorted = [...marks].sort((x, y) => minutesOf(x.time) - minutesOf(y.time));

  const markEl = (m: DayTrackMark, i: number) => {
    const style = { left: pct(minutesOf(m.time)) };
    const pop = {
      initial: anim ? { scale: 0, y: -6 } : (false as const),
      animate: { scale: 1, y: 0 },
      transition: { type: 'spring' as const, stiffness: 520, damping: 22, delay: anim ? 0.15 + i * 0.07 : 0 },
    };
    if (skin === 'p5') {
      return (
        <motion.span key={m.id} {...pop} className="absolute top-[-9px] -translate-x-1/2" style={style} data-track-mark={m.on ? 'on' : 'off'} title={m.label ? `${m.time} ${m.label}` : m.time}>
          <P5Star size={22} fill={m.on ? P5R.red : P5R.paper} ring={P5R.ink} />
        </motion.span>
      );
    }
    if (skin === 'p4') {
      return (
        <motion.span key={m.id} {...pop} className="absolute top-[-5px] block h-[20px] w-[20px] -translate-x-1/2 rounded-full" data-track-mark={m.on ? 'on' : 'off'} title={m.label ? `${m.time} ${m.label}` : m.time}
          style={{ ...style, background: m.on ? '#131313' : 'var(--ui-paper, #fff6d0)', boxShadow: '0 0 0 2px #131313' }}>
          {m.on && <span className="absolute inset-[5px] rounded-full" style={{ background: 'var(--ui-bg, #ffd900)' }} />}
        </motion.span>
      );
    }
    if (skin === 'p3') {
      return (
        <motion.span key={m.id} {...pop} className="absolute top-[-7px] block h-[24px] w-[13px] -translate-x-1/2" data-track-mark={m.on ? 'on' : 'off'} title={m.label ? `${m.time} ${m.label}` : m.time}
          style={{ ...style, clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)', background: m.on ? P3R.blue : P3R.grey, opacity: m.on ? 1 : 0.55 }} />
      );
    }
    return (
      <motion.span key={m.id} {...pop} className="absolute top-[-4px] block h-[18px] w-[18px] -translate-x-1/2 rounded-full border-[3px]" data-track-mark={m.on ? 'on' : 'off'} title={m.label ? `${m.time} ${m.label}` : m.time}
        style={{ ...style, borderColor: 'var(--color-primary, #1b57ff)', background: m.on ? 'var(--color-primary, #1b57ff)' : 'var(--ui-paper, #fff)' }} />
    );
  };

  return (
    <div role="img" aria-label={ariaLabel} className={`relative select-none ${now !== undefined ? 'pt-7' : 'pt-3'}`} data-day-track>
      <div className="relative h-[10px] overflow-visible">
        <div className="absolute inset-0 overflow-hidden" style={track}>
          {segs.map((s, i) => (
            <motion.span key={i} aria-hidden className="absolute inset-y-0 origin-left" style={{ left: pct(s.a), width: pct(s.z - s.a), background: bandColor, opacity: skin === 'p3' ? 0.9 : 1 }}
              initial={anim ? { scaleX: 0 } : false} animate={{ scaleX: 1 }} transition={{ duration: 0.45, ease: 'easeOut', delay: anim ? 0.1 + i * 0.12 : 0 }} data-track-band />
          ))}
        </div>
        {now !== undefined && (
          <span aria-hidden className="absolute top-[-6px] bottom-[-6px] w-[2px] -translate-x-1/2" style={{ left: pct(now), background: nowColor }} data-track-now>
            <span className="absolute -top-[13px] left-1/2 -translate-x-1/2 whitespace-nowrap px-1 text-[8px] font-black leading-[11px] tracking-wider"
              style={{ background: nowColor, color: skin === 'p4' ? '#131313' : '#fff', fontFamily: skin === 'p5' ? P5_TITLE_FONT : undefined, borderRadius: skin === 'p4' || skin === 'neutral' ? 4 : 0 }}>NOW</span>
          </span>
        )}
        {sorted.map(markEl)}
      </div>
      <div aria-hidden className="relative mt-2 h-[12px] text-[9.5px] font-black tabular-nums" style={{ color: t.sub, opacity: skin === 'p4' ? 0.7 : 1 }}>
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="absolute" style={{ left: `${(h / 24) * 100}%`, transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{h}</span>
        ))}
      </div>
      {segs[0]?.label && (
        <div aria-hidden className="mt-1 flex items-center justify-end gap-1 text-[10.5px] font-black" style={{ color: t.sub, opacity: skin === 'p4' ? 0.75 : 1 }}>
          <Glyph name="moon" size={11} /> {segs[0].label}
        </div>
      )}
    </div>
  );
};
