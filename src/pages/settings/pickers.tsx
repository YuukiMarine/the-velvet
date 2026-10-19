/**
 * 设置页（第 30 批）· 带皮的选择件：主题色块 / 开屏动画卡 / 属性名输入 / 等级称号输入。
 * 从旧设置页搬来（三频道各自的游戏语言已在这几件上定稿），新页直接复用。
 */
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useRipple } from '@/components/RippleEffect';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBoldness } from '@/utils/boldness';
import { P3R } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad, P5Rough, P5Star, P5AttrGlyph } from '@/components/p5r/kit';
import { P4Flower, P4Sparkle } from '@/ui/p4Kit';
import type { AttributeId } from '@/types';
import { inputClass, inputStyle, useSettingsSkin } from './kit';

/** 五维属性的展示元数据（图标 + 主色 + 默认中文名） */
export const ATTRIBUTE_META: Array<{ id: AttributeId; icon: string; color: string; defaultLabel: string }> = [
  { id: 'knowledge', icon: '📘', color: '#3B82F6', defaultLabel: '知识' },
  { id: 'guts',      icon: '🔥', color: '#EF4444', defaultLabel: '胆量' },
  { id: 'dexterity', icon: '🎯', color: '#F59E0B', defaultLabel: '灵巧' },
  { id: 'kindness',  icon: '🌿', color: '#10B981', defaultLabel: '温柔' },
  { id: 'charm',     icon: '✨', color: '#EC4899', defaultLabel: '魅力' },
];

// ── 主题颜色按钮（p4 = 五瓣花；p5 = 斜切黑框块 + 红面白星；p3 = 斜切色块 + 白勾；中性 = 圆点卡） ──
export const ThemeColorButton = ({ theme, active, onSelect }: {
  theme: { value: string; label: string; color: string };
  active: boolean;
  onSelect: () => void;
}) => {
  const { spawn, ripples } = useRipple(theme.color);
  const channel = useUiChannel();
  if (channel === 'p4') {
    return (
      <motion.button whileTap={{ scale: 0.93 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} onClick={(e) => { spawn(e); onSelect(); }}
        className="relative flex flex-1 flex-col items-center gap-1.5 overflow-visible rounded-2xl py-2.5" aria-pressed={active}
        style={{ background: active ? 'var(--ui-bg)' : 'transparent', boxShadow: active ? '0 2px 0 rgba(19,19,19,0.2)' : undefined }}>
        {ripples}
        <span className="relative">
          <P4Flower size={36} color={active ? '#ffffff' : theme.color} />
          {active && <P4Sparkle size={17} color="var(--ui-accent)" className="absolute -right-3.5 -top-2" />}
        </span>
        <div className="whitespace-nowrap text-xs font-black" style={{ color: 'var(--ui-ink, #131313)' }}>{theme.label}</div>
      </motion.button>
    );
  }
  if (channel === 'p5') {
    return (
      <motion.button whileTap={{ scale: 0.93 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} onClick={(e) => { spawn(e); onSelect(); }}
        className="relative flex flex-1 cursor-pointer flex-col items-center gap-1.5" aria-pressed={active}>
        <span className="relative h-12 w-full" style={{ transform: 'rotate(-1.5deg)' }}>
          <span aria-hidden className="absolute inset-0" style={{ background: active ? P5R.red : '#050505', clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }} />
          <span className="absolute inset-[3px] overflow-hidden" style={{ background: active ? P5R.red : '#3a3a3a', clipPath: 'polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)' }}>
            {ripples}
            <span aria-hidden className="absolute -top-3 left-1/4 h-20 w-5" style={{ background: active ? '#d64046' : '#6f6f6f', transform: 'rotate(26deg)' }} />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[5px]" style={{ background: theme.color }} />
          </span>
          {active && <P5Star size={20} fill={P5R.white} className="absolute -right-1.5 -top-2" />}
        </span>
        <span className="whitespace-nowrap text-xs font-black" style={{ color: P5R.ink }}>{theme.label}</span>
      </motion.button>
    );
  }
  if (channel === 'p3') {
    return (
      <motion.button whileTap={{ scale: 0.93 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} onClick={(e) => { spawn(e); onSelect(); }}
        className="relative flex flex-1 flex-col items-center gap-1.5" aria-pressed={active}>
        <span className="relative flex h-11 w-full items-center justify-center overflow-hidden"
          style={{ clipPath: 'polygon(11px 0, 100% 0, calc(100% - 11px) 100%, 0 100%)', background: theme.color, boxShadow: active ? '0 8px 18px rgba(38,96,140,0.22)' : 'none' }}>
          {ripples}
          {active && (
            <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          )}
        </span>
        <span className="whitespace-nowrap text-xs font-black" style={{ color: active ? P3R.blue : P3R.ink }}>{theme.label}</span>
      </motion.button>
    );
  }
  return (
    <motion.button whileTap={{ scale: 0.93 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} onClick={(e) => { spawn(e); onSelect(); }}
      className="relative flex flex-1 flex-col items-center gap-1.5 overflow-hidden rounded-xl border-2 border-gray-200 py-2.5 dark:border-gray-700" aria-pressed={active}
      style={{ borderColor: active ? theme.color : undefined, background: active ? `${theme.color}10` : undefined }}>
      {ripples}
      <div className="h-7 w-7 rounded-full shadow-sm" style={{ backgroundColor: theme.color }} />
      <div className="whitespace-nowrap text-xs font-bold text-gray-700 dark:text-gray-300">{theme.label}</div>
    </motion.button>
  );
};

// ── 开屏动画选项卡 ────────────────────────────────────────────────────────────
export interface SplashOpt { value: 'velvet' | 'p5' | 'p3' | 'p4'; label: string; sub: string; sound: string; color: string; bg: string; border: string; icon: string }
export const SPLASH_OPTIONS: SplashOpt[] = [
  { value: 'velvet', label: '靛蓝色房间', sub: 'The Velvet', sound: '/themea-switch.mp3', color: '#7C3AED', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.5)', icon: '🌌' },
  { value: 'p5', label: '红黑剪报风', sub: 'Phantom Thief', sound: '/themec-switch.mp3', color: '#DC2626', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.5)', icon: '🃏' },
  { value: 'p3', label: '深夜月光录', sub: 'Memento Mori', sound: '/themea-switch.mp3', color: '#2563EB', bg: 'rgba(37,99,235,0.08)', border: 'rgba(37,99,235,0.5)', icon: '🕐' },
  { value: 'p4', label: '黄色警戒线', sub: 'Midnight Channel', sound: '/themeb-switch.mp3', color: '#D97706', bg: 'rgba(217,119,6,0.08)', border: 'rgba(217,119,6,0.5)', icon: '📺' },
];

export const SplashStyleButton = ({ opt, active, onSelect }: { opt: SplashOpt; active: boolean; onSelect: () => void }) => {
  const { spawn, ripples } = useRipple(opt.color);
  const skin = useSettingsSkin();
  if (skin === 'p5') {
    const seed = 560 + opt.value.length * 11 + opt.value.charCodeAt(0);
    return (
      <motion.button whileTap={{ scale: 0.96 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} onClick={(e) => { spawn(e); onSelect(); }} className="relative cursor-pointer select-none text-left" aria-pressed={active}>
        <P5Rough seed={seed} jag={5} frame={2.8} face={active ? '#f4dcd4' : P5R.paper} frameColor={active ? P5R.red : '#050505'} shadow={{ x: 3, y: 3 }} />
        <span className="relative block overflow-hidden" style={{ clipPath: roughQuad(seed + 0.47, 2.5) }}>
          {ripples}
          <span className="flex items-start justify-between px-3 pt-2.5">
            <span aria-hidden className="mt-0.5 inline-block h-4 w-4" style={{ background: active ? P5R.red : '#050505', transform: 'rotate(-3deg)', boxShadow: active ? '0 0 0 2px #050505' : undefined }} />
            {active && <P5Star size={18} fill={P5R.red} className="-mr-0.5 -mt-0.5" />}
          </span>
          <span className="block px-3 pb-2.5 pt-1.5">
            <span className="block text-[13px] font-black leading-tight" style={{ color: '#050505' }}>{opt.label}</span>
            <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide" style={{ color: active ? P5R.red : P5R.grey, fontFamily: P5_TITLE_FONT }}>{opt.sub}</span>
          </span>
        </span>
      </motion.button>
    );
  }
  if (skin === 'p3') {
    return (
      <motion.button whileTap={{ scale: 0.94 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} onClick={(e) => { spawn(e); onSelect(); }} className="relative flex select-none flex-col items-center gap-1.5" aria-pressed={active}>
        <span className="relative flex h-14 w-full items-center justify-center overflow-hidden"
          style={{ clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)', background: active ? opt.color : 'var(--p3r-chip, #ddeef7)', boxShadow: active ? '0 8px 18px rgba(38,96,140,0.2)' : 'none' }}>
          {ripples}
          <span className="text-xl leading-none" style={{ opacity: active ? 0.95 : 0.6 }} aria-hidden>{opt.icon}</span>
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `repeating-linear-gradient(115deg, transparent 0 14px, ${active ? 'rgba(255,255,255,0.16)' : 'var(--p3r-chip-stripe, rgba(255,255,255,0.5))'} 14px 17px)` }} />
        </span>
        <span className="whitespace-nowrap text-[11px] font-black leading-tight" style={{ color: active ? P3R.blue : P3R.ink }}>{opt.label}</span>
      </motion.button>
    );
  }
  if (skin === 'p4') {
    return (
      <motion.button whileTap={{ scale: 0.95, rotate: -1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} onClick={(e) => { spawn(e); onSelect(); }} className="relative select-none overflow-hidden text-left" aria-pressed={active}
        style={{ borderRadius: 14, background: active ? '#131313' : 'var(--ui-paper, #fff6d0)', color: active ? 'var(--ui-bg, #ffd900)' : 'var(--ui-ink, #131313)', boxShadow: '0 0 0 2px #131313' }}>
        {ripples}
        <span className="flex items-center justify-between px-3 pt-2.5">
          <span className="text-lg leading-none" aria-hidden>{opt.icon}</span>
          {active && <P4Sparkle size={14} color="var(--p4-orange, #f9a11b)" />}
        </span>
        <span className="block px-3 pb-2.5 pt-1">
          <span className="block text-[12px] font-black leading-tight">{opt.label}</span>
          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide opacity-70">{opt.sub}</span>
        </span>
      </motion.button>
    );
  }
  return (
    <motion.button whileTap={{ scale: 0.94 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} onClick={(e) => { spawn(e); onSelect(); }} className="relative select-none overflow-hidden rounded-2xl border-2 text-left" aria-pressed={active}
      style={{ borderColor: active ? opt.color : 'transparent', background: active ? opt.bg : 'rgba(128,128,128,0.06)', boxShadow: active ? `0 0 16px ${opt.color}22, inset 0 0 0 1px ${opt.border}` : 'none' }}>
      {ripples}
      <div className="px-3 py-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-xl leading-none">{opt.icon}</span></div>
        <div className="text-xs font-bold leading-tight" style={{ color: active ? opt.color : undefined }}><span className={active ? '' : 'text-gray-800 dark:text-white'}>{opt.label}</span></div>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: active ? `${opt.color}99` : undefined }}><span className={active ? '' : 'text-gray-400 dark:text-gray-500'}>{opt.sub}</span></div>
      </div>
    </motion.button>
  );
};

// ── 属性名输入（兼容中文输入法：组词中只改草稿，组词结束 / 失焦才提交） ──────────
export const AttributeNameField = ({ id, icon, color, defaultLabel, value, onCommit, index }: {
  id: AttributeId; icon: string; color: string; defaultLabel: string; value: string; onCommit: (v: string) => void; index: number;
}) => {
  const anim = useBoldness();
  const skin = useSettingsSkin();
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const composingRef = useRef(false);
  useEffect(() => { if (!composingRef.current) setDraft(value); }, [value]);
  const inputHandlers = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { const next = e.target.value; setDraft(next); if (!composingRef.current) onCommit(next); },
    onCompositionStart: () => { composingRef.current = true; },
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => { composingRef.current = false; const next = (e.target as HTMLInputElement).value; setDraft(next); onCommit(next); },
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); if (draft !== value) onCommit(draft); },
    placeholder: defaultLabel,
    'aria-label': `${defaultLabel}的名称`,
  };
  if (skin === 'p5') {
    return (
      <motion.div initial={anim ? { opacity: 0, x: -16, rotate: -1.5 } : false} animate={{ opacity: 1, x: 0, rotate: index % 2 ? 0.6 : -0.6 }} transition={{ type: 'spring', stiffness: 320, damping: 26, delay: anim ? index * 0.05 : 0 }} className="relative">
        <P5Rough seed={700 + index} jag={6} frame={3} face={P5R.paper} shadow={{ x: 4, y: 5 }} shadowColor={focused ? P5R.red : P5R.ink} />
        <div className="relative flex items-center gap-3 py-3 pl-3.5 pr-3">
          <span aria-hidden className="relative flex h-12 w-12 shrink-0 items-center justify-center transition-colors" style={{ background: focused ? P5R.red : P5R.ink, clipPath: roughQuad(720 + index, 5) }}>
            <P5AttrGlyph id={id} size={26} color={P5R.paper} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-[3px] text-[10px] font-black leading-none tracking-[0.16em]" style={{ background: P5R.ink, color: P5R.paper, fontFamily: P5_TITLE_FONT, clipPath: roughQuad(730 + index, 2) }}>{id.toUpperCase()}</span>
              <span className="truncate text-[11px] font-bold" style={{ color: P5R.grey }}>默认「{defaultLabel}」</span>
              <span aria-hidden className="ml-auto text-[13px] font-black leading-none tabular-nums" style={{ color: '#b9b2a4', fontFamily: P5_TITLE_FONT }}>0{index + 1}</span>
            </div>
            <input type="text" {...inputHandlers} className="mt-2 w-full px-3 text-[18px] font-black focus:outline-none" style={{ fontFamily: P5_TITLE_FONT }} />
          </div>
        </div>
      </motion.div>
    );
  }
  const frame = skin === 'p3'
    ? { clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', background: focused ? 'rgba(27,87,255,0.08)' : 'rgba(255,255,255,0.6)', boxShadow: focused ? `0 0 0 2px ${color}` : 'none' }
    : skin === 'p4'
      ? { borderRadius: 14, background: 'var(--ui-paper, #fff6d0)', boxShadow: focused ? `0 0 0 2.5px ${color}` : '0 0 0 2px #131313' }
      : { borderRadius: 12, border: `1px solid ${focused ? color : 'rgba(148,163,184,0.28)'}`, boxShadow: focused ? `0 0 0 3px ${color}26` : undefined };
  return (
    <motion.div initial={anim ? { opacity: 0, x: -16 } : false} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28, delay: anim ? index * 0.05 : 0 }}
      className="relative overflow-hidden transition-[box-shadow] duration-200" style={frame}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[4px]" style={{ background: color }} />
      <span aria-hidden className="pointer-events-none absolute -bottom-2.5 -right-1 select-none text-[32px] font-black uppercase italic leading-none tracking-tighter" style={{ color: `${color}1a` }}>{id}</span>
      <div className="relative flex items-center gap-3.5 py-3 pl-4 pr-3">
        <div className="relative flex h-11 w-11 flex-none items-center justify-center">
          <motion.span aria-hidden className="absolute h-[31px] w-[31px] rounded-[8px]" style={{ rotate: 45, background: `linear-gradient(135deg, ${color} 0%, ${color}b8 100%)`, boxShadow: `0 3px 10px ${color}59` }} animate={anim ? { scale: focused ? 1.12 : 1 } : undefined} transition={{ type: 'spring', stiffness: 420, damping: 18 }} />
          <span className="relative text-lg drop-shadow-sm">{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color }}>{id}</div>
          <input type="text" {...inputHandlers} className={inputClass(skin, 'mt-1 !py-1.5')} style={inputStyle(skin)} />
        </div>
      </div>
    </motion.div>
  );
};

export const LevelTitleField = ({ level, value, onCommit }: { level: number; value: string; onCommit: (v: string) => void }) => {
  const skin = useSettingsSkin();
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);
  useEffect(() => { if (!composingRef.current) setDraft(value); }, [value]);
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[9px] font-black tabular-nums opacity-60">LV{level}</span>
      <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => { composingRef.current = false; const next = (e.target as HTMLInputElement).value; setDraft(next); onCommit(next); }}
        onBlur={() => onCommit(draft)} className={inputClass(skin, '!py-1.5 !text-[12px]')} style={inputStyle(skin)} placeholder="四字称号" />
    </label>
  );
};
