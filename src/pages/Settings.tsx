import { motion, AnimatePresence } from 'motion/react';
import { ModalPortal } from '@/components/ModalPortal';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore, DEFAULT_SUMMARY_PROMPT_PRESETS, FAMILIAR_FACE_PRESETS, toLocalDateKey, applyCustomThemeColor } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { triggerThemeSwitchFeedback, playSound } from '@/utils/feedback';
import { ThemeType, AttributeId, SummaryPromptPreset, AttributeLevelTitles } from '@/types';
import { LEVEL_PRESETS } from '@/constants';
import { resolveLevelDifficulty } from '@/utils/levelDifficulty';
import type { LevelDifficulty } from '@/types';
import { db } from '@/db';
import { PageTitle } from '@/components/PageTitle';
import { BackButton } from '@/components/BackButton';
import { useRipple } from '@/components/RippleEffect';
import {
  BarsIcon, BellIcon, CoinIcon, DiamondMarkIcon, GearIcon,
  ImageIcon, KeyIcon, PaletteIcon, SlidersIcon, SparklesIcon,
  SwordsIcon, TagIcon, WaveIcon,
} from '@/components/settingsIcons';
import { WeatherSettings } from '@/components/settings/WeatherSettings';
import { AIServiceSettings } from '@/components/settings/AIServiceSettings';
import { Toggle } from '@/components/Toggle';
import NotificationSettings from '@/components/NotificationSettings';
import { NavigatorSettings } from '@/components/navigator/NavigatorSettings';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBoldness } from '@/utils/boldness';
import { P3R, P3RPage, GhostWords, P3PageHeader } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad, P5Collage, P5Rough, P5Star, P5RPage, P5AttrGlyph, P5Btn } from '@/components/p5r/kit';
import {
  generateAttributeLevelTitles,
  normalizeAttributeLevelTitles,
  patchAttributeLevelTitle,
} from '@/utils/attributeLevelTitles';
import { generatePresetNameMatches, type PresetNameMatchResult } from '@/utils/presetNameMatcher';
import { P4Flower, P4Sparkle, P4SkyFan, P4ArcRings, P4_HEADER_BLEED } from '@/ui/p4Kit';
import { downscaleDataUrl } from '@/utils/imageCrop';
import { SoundVolumeRow } from '@/components/SoundVolumeRow';
import { BgmSettings } from '@/components/BgmSettings';

/** 五维属性的展示元数据（图标 + 主色 + 默认中文名），仅用于设置页 UI */
const ATTRIBUTE_META: Array<{
  id: AttributeId;
  icon: string;
  color: string;
  defaultLabel: string;
}> = [
  { id: 'knowledge', icon: '📘', color: '#3B82F6', defaultLabel: '知识' },
  { id: 'guts',      icon: '🔥', color: '#EF4444', defaultLabel: '胆量' },
  { id: 'dexterity', icon: '🎯', color: '#F59E0B', defaultLabel: '灵巧' },
  { id: 'kindness',  icon: '🌿', color: '#10B981', defaultLabel: '温柔' },
  { id: 'charm',     icon: '✨', color: '#EC4899', defaultLabel: '魅力' },
];

type PresetNameSelection = {
  achievements: Record<string, boolean>;
  skills: Record<string, boolean>;
};

type LevelTitleSelection = Record<AttributeId, boolean>;

const createLevelTitleSelection = (selected: boolean): LevelTitleSelection => ({
  knowledge: selected,
  guts: selected,
  dexterity: selected,
  kindness: selected,
  charm: selected,
});

const emptyPresetNameSelection = (): PresetNameSelection => ({ achievements: {}, skills: {} });

/**
 * 属性名输入框（兼容中文输入法）
 *
 * 中文输入法（拼音）在未上屏时也会触发 input 的 onChange，
 * 直接回写 store 会导致拼音字母被永久"吃进"持久状态——表现为"拼音重复出现"的经典 bug。
 * 对策：用 onCompositionStart/End 跟踪正在组词的状态；
 *   · 组词中只改本地 draft，**不**写 store
 *   · 组词结束（或非组词直接输入）时才一次性提交
 * 外部 value 变化时，如果当前没在组词，把 draft 同步过来；在组词中则按下不表，避免打断输入
 */
/**
 * 属性徽章卡（v2.7.1 重设计，用户口径「华丽、醒目、有动效，信息不减」）：
 *   - 菱形渐变徽章（属性色 135° 渐变 + 顶部高光 + 同色外晕），emoji 恒正居中；
 *   - 卡面属性色叙事：左缘色条 + 从左淡入的同色洗地 + 右下斜置英文 ID 幽灵水印；
 *   - 聚焦演出：边框/光环转属性色、槽底色条从左扫入、徽章微弹；
 *   - 入场按 index 逐张滑入（stagger）。全部动效走 useBoldness（D0 直出终态）。
 *   - 输入槽自带 px：P5 皮的 5px 内画黑描边不再吃掉首字（「文字与边框重合」修复）。
 */
const AttributeNameField = ({
  id, icon, color, defaultLabel, value, onCommit, index,
}: {
  id: AttributeId;
  icon: string;
  color: string;
  defaultLabel: string;
  value: string;
  onCommit: (v: string) => void;
  index: number;
}) => {
  const anim = useBoldness();
  const p5 = useUiChannel() === 'p5';
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) setDraft(value);
  }, [value]);

  /** 两套皮共用的输入逻辑（组词中只改草稿，组词结束 / 失焦才提交） */
  const inputHandlers = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setDraft(next);
      if (!composingRef.current) onCommit(next);
    },
    onCompositionStart: () => { composingRef.current = true; },
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => {
      composingRef.current = false;
      const next = (e.target as HTMLInputElement).value;
      setDraft(next);
      onCommit(next);
    },
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      // 兜底：极少数浏览器/IME 不触发 compositionEnd，用 blur 再提交一次
      if (draft !== value) onCommit(draft);
    },
    placeholder: defaultLabel,
  };

  // 红频道：之前沿用中性皮（彩色渐变圆角卡 + 发光菱形徽章），只有输入框被全局换了黑框，
  // 整块跟红黑剪报对不上。改成米白碎纸卡 + 黑框硬影 + 黑块属性图形 + 黑体大字，
  // 与统计页「属性分布」同一套语言；不用属性色，聚焦时影子和图形块翻红。
  if (p5) {
    return (
      <motion.div
        initial={anim ? { opacity: 0, x: -16, rotate: -1.5 } : false}
        animate={{ opacity: 1, x: 0, rotate: index % 2 ? 0.6 : -0.6 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26, delay: anim ? index * 0.05 : 0 }}
        className="relative"
      >
        <P5Rough seed={700 + index} jag={6} frame={3} face={P5R.paper} shadow={{ x: 4, y: 5 }} shadowColor={focused ? P5R.red : P5R.ink} />
        <div className="relative flex items-center gap-3 py-3 pl-3.5 pr-3">
          <span
            aria-hidden
            className="relative flex h-12 w-12 shrink-0 items-center justify-center transition-colors"
            style={{ background: focused ? P5R.red : P5R.ink, clipPath: roughQuad(720 + index, 5) }}
          >
            <P5AttrGlyph id={id} size={26} color={P5R.paper} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="px-1.5 py-[3px] text-[10px] font-black leading-none tracking-[0.16em]"
                style={{ background: P5R.ink, color: P5R.paper, fontFamily: P5_TITLE_FONT, clipPath: roughQuad(730 + index, 2) }}
              >
                {id.toUpperCase()}
              </span>
              <span className="truncate text-[11px] font-bold" style={{ color: P5R.grey }}>默认「{defaultLabel}」</span>
              <span aria-hidden className="ml-auto text-[13px] font-black leading-none tabular-nums" style={{ color: '#b9b2a4', fontFamily: P5_TITLE_FONT }}>
                0{index + 1}
              </span>
            </div>
            <input
              type="text"
              {...inputHandlers}
              aria-label={`${defaultLabel}的名称`}
              className="mt-2 w-full px-3 text-[18px] font-black focus:outline-none"
              style={{ fontFamily: P5_TITLE_FONT }}
            />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={anim ? { opacity: 0, x: -16 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28, delay: anim ? index * 0.05 : 0 }}
      className="relative overflow-hidden rounded-xl border bg-gray-50 dark:bg-gray-900/40 transition-[border-color,box-shadow] duration-200"
      style={{
        borderColor: focused ? color : 'rgba(148,163,184,0.28)',
        boxShadow: focused ? `0 0 0 3px ${color}26, 0 4px 14px ${color}1f` : undefined,
      }}
    >
      {/* 属性色氛围层：左缘色条 + 向右消散的洗地 + 右下幽灵 ID（全装饰，不占布局） */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[4px]" style={{ background: `linear-gradient(180deg, ${color}, ${color}80)` }} />
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(105deg, ${color}17 0%, transparent 46%)` }} />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-2.5 -right-1 select-none text-[34px] font-black uppercase italic leading-none tracking-tighter"
        style={{ color: `${color}1a` }}
      >
        {id}
      </span>

      <div className="relative flex items-center gap-3.5 py-3 pl-4 pr-3">
        {/* 菱形徽章：45° 渐变底 + 高光线 + 同色晕，emoji 不随底旋转（字恒水平原则） */}
        <div className="relative flex h-12 w-12 flex-none items-center justify-center">
          <motion.span
            aria-hidden
            className="absolute h-[33px] w-[33px] rounded-[9px]"
            // rotate 必须走 motion 的 transform 通道：animate.scale 一接管 transform，
            // class 里的 rotate-45 就会被整体覆盖（徽章"变回正方块"的坑）
            style={{
              rotate: 45,
              background: `linear-gradient(135deg, ${color} 0%, ${color}b8 100%)`,
              boxShadow: `0 3px 10px ${color}59, inset 0 1px 0 rgba(255,255,255,0.4)`,
            }}
            animate={anim ? { scale: focused ? 1.12 : 1 } : undefined}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          />
          <span className="relative text-lg drop-shadow-sm">{icon}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-[0.24em]" style={{ color }}>
            {id}
          </div>
          {/* 输入槽：显式底座（比裸下划线醒目），px 同时解决 P5 内画描边贴字 */}
          <div className="relative mt-1">
            <input
              type="text"
              {...inputHandlers}
              className="w-full rounded-lg border border-gray-200/70 bg-white/80 px-2.5 py-1.5 text-sm font-bold text-gray-800 focus:outline-none dark:border-gray-700/60 dark:bg-gray-800/70 dark:text-white"
            />
            {/* 聚焦扫光条：属性色从左扫入槽底缘（D0 瞬切） */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
              style={{ background: color, transformOrigin: 'left center' }}
              animate={{ scaleX: focused ? 1 : 0 }}
              transition={anim ? { type: 'spring', stiffness: 380, damping: 32 } : { duration: 0 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const LevelTitleField = ({
  level,
  value,
  onCommit,
}: {
  level: number;
  value: string;
  onCommit: (v: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) setDraft(value);
  }, [value]);

  const commit = (next = draft) => {
    onCommit(next);
  };

  return (
    <label className="min-w-0">
      <span className="block mb-1 text-[9px] font-bold text-gray-400 tabular-nums">
        LV{level}
      </span>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          const next = (e.target as HTMLInputElement).value;
          setDraft(next);
          commit(next);
        }}
        onBlur={() => commit()}
        className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs font-bold text-gray-800 dark:text-white focus:outline-none focus:border-primary transition-colors"
        placeholder="四字称号"
      />
    </label>
  );
};

// ── 主题颜色按钮（带涟漪点击反馈；p3 = 设计稿平行四边形色块 + 白勾） ───────────
const ThemeColorButton = ({
  theme,
  active,
  onSelect,
}: {
  theme: { value: string; label: string; color: string };
  active: boolean;
  onSelect: () => void;
}) => {
  const { spawn, ripples } = useRipple(theme.color);
  const channel = useUiChannel();
  const isP4 = channel === 'p4';
  const p3 = channel === 'p3';

  // p4-settings-reference-v2：色板 = 彩色五瓣花，激活 = 黄tile + 白花 + 蓝星闪
  if (isP4) {
    return (
      <motion.button
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        onClick={(e) => { spawn(e); onSelect(); }}
        className="relative flex flex-1 flex-col items-center gap-1.5 overflow-visible rounded-2xl py-2.5"
        style={{ background: active ? 'var(--ui-bg)' : 'transparent', boxShadow: active ? '0 2px 0 rgba(19,19,19,0.2)' : undefined }}
      >
        {ripples}
        <span className="relative">
          <P4Flower size={36} color={active ? '#ffffff' : theme.color} />
          {active && <P4Sparkle size={17} color="var(--ui-accent)" className="absolute -right-3.5 -top-2" />}
        </span>
        <div className="whitespace-nowrap text-xs font-black text-[#131313]">{theme.label}</div>
      </motion.button>
    );
  }

  // P5UI/p5-settings：色板 = 斜切黑框灰缩略块（浅灰斜高光），选中 = 红面红框 + 白星角标
  if (channel === 'p5') {
    return (
      <motion.button
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        onClick={(e) => { spawn(e); onSelect(); }}
        className="relative flex flex-1 cursor-pointer flex-col items-center gap-1.5"
        aria-pressed={active}
      >
        <span className="relative h-12 w-full" style={{ transform: 'rotate(-1.5deg)' }}>
          <span aria-hidden className="absolute inset-0" style={{ background: active ? '#c00008' : '#050505', clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }} />
          <span className="absolute inset-[3px] overflow-hidden" style={{ background: active ? '#c00008' : '#3a3a3a', clipPath: 'polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)' }}>
            {ripples}
            {/* 斜高光切（纯色，不用透明度） */}
            <span aria-hidden className="absolute -top-3 left-1/4 h-20 w-5" style={{ background: active ? '#d64046' : '#6f6f6f', transform: 'rotate(26deg)' }} />
            {/* 主题色认色条（底缘） */}
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[5px]" style={{ background: theme.color }} />
          </span>
          {active && <P5Star size={20} fill="#f8f8f6" className="absolute -right-1.5 -top-2" />}
        </span>
        <span className="whitespace-nowrap text-xs font-black" style={{ color: '#050505' }}>{theme.label}</span>
      </motion.button>
    );
  }

  // p3-settings-reference-v2：色板 = 斜切色块 + 白勾，激活标签蓝字
  if (p3) {
    return (
      <motion.button
        whileTap={{ scale: 0.93 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        onClick={(e) => { spawn(e); onSelect(); }}
        className="relative flex flex-1 flex-col items-center gap-1.5"
        aria-pressed={active}
      >
        <span
          className="relative flex h-11 w-full items-center justify-center overflow-hidden"
          style={{ clipPath: 'polygon(11px 0, 100% 0, calc(100% - 11px) 100%, 0 100%)', background: theme.color, boxShadow: active ? '0 8px 18px rgba(38,96,140,0.22)' : 'none' }}
        >
          {ripples}
          {active && (
            <motion.svg initial={{ scale: 0 }} animate={{ scale: 1 }} viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          )}
        </span>
        <span className="whitespace-nowrap text-xs font-black" style={{ color: active ? 'var(--p3r-blue, #1b57ff)' : 'var(--p3r-ink, #0a1230)' }}>{theme.label}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.93 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      onClick={(e) => { spawn(e); onSelect(); }}
      className="relative flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl border-2 overflow-hidden transition-colors border-gray-200 dark:border-gray-700"
      style={{
        borderColor: active ? theme.color : undefined,
        background: active ? `${theme.color}10` : undefined,
      }}
    >
      {ripples}
      <div className="w-7 h-7 rounded-full shadow-sm" style={{ backgroundColor: theme.color }} />
      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
        {theme.label}
      </div>
    </motion.button>
  );
};

// ── 开屏动画选项卡（带涟漪点击反馈；p3 = 设计稿斜切预览块 + 块下标签） ─────────
const SplashStyleButton = ({
  opt,
  active,
  onSelect,
}: {
  opt: { value: string; label: string; sub: string; color: string; bg: string; border: string; icon: string };
  active: boolean;
  onSelect: () => void;
}) => {
  const { spawn, ripples } = useRipple(opt.color);
  const p3 = useUiChannel() === 'p3';
  const p5 = useUiChannel() === 'p5';

  // P5UI/p5-settings：选项卡 = 不规则黑框纸卡 + 左上方块 + 标题/英文副题；选中 = 红框浅红底 + 红星
  if (p5) {
    const seed = 560 + opt.value.length * 11 + opt.value.charCodeAt(0);
    return (
      <motion.button
        whileTap={{ scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        onClick={(e) => { spawn(e); onSelect(); }}
        className="relative cursor-pointer select-none text-left"
        aria-pressed={active}
      >
        <P5Rough seed={seed} jag={5} frame={2.8} face={active ? '#f4dcd4' : '#f0e9df'} frameColor={active ? '#c00008' : '#050505'} shadow={{ x: 3, y: 3 }} />
        <span className="relative block overflow-hidden" style={{ clipPath: roughQuad(seed + 0.47, 2.5) }}>
          {ripples}
          <span className="flex items-start justify-between px-3 pt-2.5">
            <span aria-hidden className="mt-0.5 inline-block h-4 w-4" style={{ background: active ? '#c00008' : '#050505', transform: 'rotate(-3deg)', boxShadow: active ? '0 0 0 2px #050505' : undefined }} />
            {active && <P5Star size={18} fill="#c00008" className="-mr-0.5 -mt-0.5" />}
          </span>
          <span className="block px-3 pb-2.5 pt-1.5">
            <span className="block text-[13px] font-black leading-tight" style={{ color: '#050505' }}>{opt.label}</span>
            <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wide" style={{ color: active ? '#c00008' : '#6b6862', fontFamily: P5_TITLE_FONT }}>{opt.sub}</span>
          </span>
        </span>
      </motion.button>
    );
  }

  if (p3) {
    return (
      <motion.button
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        onClick={(e) => { spawn(e); onSelect(); }}
        className="relative flex select-none flex-col items-center gap-1.5"
        aria-pressed={active}
      >
        <span
          className="relative flex h-14 w-full items-center justify-center overflow-hidden"
          style={{
            clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
            background: active ? opt.color : 'var(--p3r-chip, #ddeef7)',
            boxShadow: active ? '0 8px 18px rgba(38,96,140,0.2)' : 'none',
          }}
        >
          {ripples}
          <span className="text-xl leading-none" style={{ opacity: active ? 0.95 : 0.6 }} aria-hidden>{opt.icon}</span>
          {/* 预览块斜纹（设计稿质感） */}
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `repeating-linear-gradient(115deg, transparent 0 14px, ${active ? 'rgba(255,255,255,0.16)' : 'var(--p3r-chip-stripe, rgba(255,255,255,0.5))'} 14px 17px)` }} />
        </span>
        <span className="whitespace-nowrap text-[11px] font-black leading-tight" style={{ color: active ? P3R.blue : P3R.ink }}>{opt.label}</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      onClick={(e) => { spawn(e); onSelect(); }}
      className="relative text-left rounded-2xl border-2 overflow-hidden select-none"
      style={{
        borderColor: active ? opt.color : 'transparent',
        background: active ? opt.bg : 'rgba(128,128,128,0.06)',
        outline: active ? `0 0 0 1px ${opt.color}22` : undefined,
        boxShadow: active ? `0 0 16px ${opt.color}22, inset 0 0 0 1px ${opt.border}` : 'none',
        transition: 'border-color 0.2s, box-shadow 0.25s, background 0.2s',
      }}
    >
      {ripples}

      <div className="px-3 py-3">
        {/* 顶部图标行 */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xl leading-none">{opt.icon}</span>
          {active && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: opt.color }}
            >
              <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="white">
                <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </motion.span>
          )}
        </div>
        {/* 名称 */}
        <div
          className="text-xs font-bold leading-tight"
          style={{ color: active ? opt.color : undefined }}
        >
          <span className={active ? '' : 'text-gray-800 dark:text-white'}>{opt.label}</span>
        </div>
        {/* 英文副标题 */}
        <div className="text-[10px] mt-0.5 font-medium tracking-wide uppercase"
          style={{ color: active ? `${opt.color}99` : undefined }}
        >
          <span className={active ? '' : 'text-gray-400 dark:text-gray-500'}>{opt.sub}</span>
        </div>
      </div>

      {/* 底部色条 */}
      <div
        className="h-0.5 w-full transition-opacity duration-200"
        style={{ background: `linear-gradient(90deg, transparent, ${opt.color}, transparent)`, opacity: active ? 1 : 0 }}
      />
    </motion.button>
  );
};

export const Settings = () => {
  const {
    user,
    settings,
    updateSettings,
    setTheme,
    loadData
  } = useAppStore(useShallow(s => ({ user: s.user, settings: s.settings, updateSettings: s.updateSettings, setTheme: s.setTheme, loadData: s.loadData })));
  const isP4 = useUiChannel() === 'p4';
  const achievements = useAppStore(s => s.achievements);
  const skills = useAppStore(s => s.skills);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const [activeSection, setActiveSection] = useState<string | null>('theme');
  // 第 13 轮：从「AI 总结」里的路标跳到「AI 服务」时，顺手把连接卡展开（老教程都教「在 AI 总结里填 Key」）
  const [aiJump, setAiJump] = useState(false);
  useEffect(() => { if (activeSection !== 'ai') setAiJump(false); }, [activeSection]);
  const jumpToAIService = () => {
    setAiJump(true);
    setActiveSection('ai');
    // 手风琴换区后布局会跳：等这一帧画完再滚到「AI 服务」的区头
    window.setTimeout(() => {
      document.querySelector('[data-settings-section="ai"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };
  // P3R（蓝频道）：p3-settings-reference-v2 形态
  const p3 = useUiChannel() === 'p3';
  // P5R（红频道）：p5-settings-flat-newsprint-v1 形态（壳层 + 毯式 .p5-reskin）
  const p5 = useUiChannel() === 'p5';
  const [showLevelWarning, setShowLevelWarning] = useState(false);
  // 等级阈值：恢复默认 / 删除高等级 的确认弹窗
  const [showResetThresholdsConfirm, setShowResetThresholdsConfirm] = useState(false);

  /**
   * 人格指数难度档（R19）。
   * 换档 = 把该档整套阈值套上，**并保留玩家已经开到的级数**：
   * 开到 LV8 的人换档后还是 8 级，只是每级要的点数换了一套。
   */
  const curDifficulty = resolveLevelDifficulty(settings);
  const applyDifficulty = (d: LevelDifficulty) => {
    if (d === curDifficulty && settings.levelDifficulty === d) return;
    const count = settings.levelThresholds.length;
    const full = [...LEVEL_PRESETS[d].base, ...LEVEL_PRESETS[d].ext];
    updateSettings({
      levelDifficulty: d,
      levelThresholds: full.slice(0, Math.min(Math.max(count, 5), full.length)),
    });
  };
  const [deleteLevelIndex, setDeleteLevelIndex] = useState<number | null>(null);
  const [levelTitleRefreshing, setLevelTitleRefreshing] = useState(false);
  const [levelTitleMessage, setLevelTitleMessage] = useState<string | null>(null);
  const [levelTitleAttrIndex, setLevelTitleAttrIndex] = useState(0);
  const [levelTitleSuggestions, setLevelTitleSuggestions] = useState<AttributeLevelTitles | null>(null);
  const [levelTitleSelection, setLevelTitleSelection] = useState<LevelTitleSelection>(() => createLevelTitleSelection(false));
  const [levelTitleModalOpen, setLevelTitleModalOpen] = useState(false);
  const [levelTitleConfirmAttrIndex, setLevelTitleConfirmAttrIndex] = useState(0);
  const [presetNameRefreshing, setPresetNameRefreshing] = useState(false);
  const [presetNameMessage, setPresetNameMessage] = useState<string | null>(null);
  const [presetNameSuggestions, setPresetNameSuggestions] = useState<PresetNameMatchResult | null>(null);
  const [presetNameSelection, setPresetNameSelection] = useState<PresetNameSelection>(() => emptyPresetNameSelection());
  const [presetNameModalOpen, setPresetNameModalOpen] = useState(false);
  const [presetNameAttrIndex, setPresetNameAttrIndex] = useState(0);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<number, string>>({});
  // 关键词规则折叠状态：默认收起，点击标题展开
  const [keywordRulesExpanded, setKeywordRulesExpanded] = useState(false);
  const opacityDraftRef = useRef(settings.backgroundOpacity ?? 0.3);
  const currentLevelTitles = normalizeAttributeLevelTitles(settings.attributeLevelTitles, settings.levelThresholds.length);
  const activeLevelTitleMeta = ATTRIBUTE_META[levelTitleAttrIndex] ?? ATTRIBUTE_META[0];
  const activeLevelTitleConfirmMeta = ATTRIBUTE_META[levelTitleConfirmAttrIndex] ?? ATTRIBUTE_META[0];
  const activePresetNameMeta = ATTRIBUTE_META[presetNameAttrIndex] ?? ATTRIBUTE_META[0];
  const hasPresetNameBackup = Boolean(
    settings.aiPresetNameBackup &&
    (
      Object.keys(settings.aiPresetNameBackup.achievements ?? {}).length > 0 ||
      Object.keys(settings.aiPresetNameBackup.skills ?? {}).length > 0
    ),
  );

  const handleRefreshLevelTitles = useCallback(async () => {
    if (levelTitleRefreshing) return;
    setLevelTitleRefreshing(true);
    setLevelTitleMessage(null);
    try {
      const titles = await generateAttributeLevelTitles(settings, settings.levelThresholds.length);
      setLevelTitleSuggestions(titles);
      setLevelTitleSelection(createLevelTitleSelection(true));
      setLevelTitleConfirmAttrIndex(levelTitleAttrIndex);
      setLevelTitleModalOpen(true);
      setLevelTitleMessage('已生成建议，请选择要刷新的属性');
    } catch (err) {
      setLevelTitleMessage(err instanceof Error ? err.message : '刷新等级称号失败');
    } finally {
      setLevelTitleRefreshing(false);
    }
  }, [levelTitleAttrIndex, levelTitleRefreshing, settings]);

  const handleToggleLevelTitleAttribute = useCallback((id: AttributeId) => {
    setLevelTitleSelection(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleCloseLevelTitleModal = useCallback(() => {
    if (levelTitleRefreshing) return;
    setLevelTitleModalOpen(false);
    setLevelTitleSuggestions(null);
    setLevelTitleSelection(createLevelTitleSelection(false));
  }, [levelTitleRefreshing]);

  const handleApplyLevelTitleSuggestions = useCallback(async () => {
    if (!levelTitleSuggestions || levelTitleRefreshing) return;
    const selectedIds = ATTRIBUTE_META.map(meta => meta.id).filter(id => levelTitleSelection[id]);
    if (selectedIds.length === 0) {
      setLevelTitleMessage('请至少选择一个需要刷新的属性');
      return;
    }

    setLevelTitleRefreshing(true);
    setLevelTitleMessage(null);
    try {
      const levelCount = settings.levelThresholds.length;
      const nextTitles = normalizeAttributeLevelTitles(settings.attributeLevelTitles, levelCount);
      const normalizedSuggestions = normalizeAttributeLevelTitles(levelTitleSuggestions, levelCount);
      for (const id of selectedIds) {
        nextTitles[id] = [...normalizedSuggestions[id]];
      }
      await updateSettings({ attributeLevelTitles: nextTitles });
      setLevelTitleModalOpen(false);
      setLevelTitleSuggestions(null);
      setLevelTitleSelection(createLevelTitleSelection(false));
      setLevelTitleMessage(`已刷新 ${selectedIds.length} 个属性的等级称号`);
    } catch (err) {
      setLevelTitleMessage(err instanceof Error ? err.message : '应用等级称号失败');
    } finally {
      setLevelTitleRefreshing(false);
    }
  }, [
    levelTitleRefreshing,
    levelTitleSelection,
    levelTitleSuggestions,
    settings.attributeLevelTitles,
    settings.levelThresholds.length,
    updateSettings,
  ]);

  const handleRefreshPresetNames = useCallback(async () => {
    if (presetNameRefreshing) return;
    setPresetNameRefreshing(true);
    setPresetNameMessage(null);
    try {
      const result = await generatePresetNameMatches(settings);
      const nextSelection = emptyPresetNameSelection();
      for (const id of Object.keys(result.achievements)) nextSelection.achievements[id] = true;
      for (const id of Object.keys(result.skills)) nextSelection.skills[id] = true;
      setPresetNameSuggestions(result);
      setPresetNameSelection(nextSelection);
      setPresetNameAttrIndex(0);
      setPresetNameModalOpen(true);
      setPresetNameMessage('已生成建议，请选择要覆写的名称');
    } catch (err) {
      setPresetNameMessage(err instanceof Error ? err.message : 'AI 匹配成就/技能名称失败');
    } finally {
      setPresetNameRefreshing(false);
    }
  }, [presetNameRefreshing, settings]);

  const handleTogglePresetNameItem = useCallback((kind: keyof PresetNameSelection, id: string) => {
    setPresetNameSelection(prev => ({
      ...prev,
      [kind]: {
        ...prev[kind],
        [id]: !prev[kind][id],
      },
    }));
  }, []);

  const handleClosePresetNameModal = useCallback(() => {
    if (presetNameRefreshing) return;
    setPresetNameModalOpen(false);
    setPresetNameSuggestions(null);
    setPresetNameSelection(emptyPresetNameSelection());
  }, [presetNameRefreshing]);

  const handleApplyPresetNameSuggestions = useCallback(async () => {
    if (!presetNameSuggestions || presetNameRefreshing) return;

    const selectedAchievements: Record<string, string> = {};
    const selectedSkills: Record<string, string> = {};
    for (const [id, name] of Object.entries(presetNameSuggestions.achievements)) {
      if (presetNameSelection.achievements[id]) selectedAchievements[id] = name;
    }
    for (const [id, name] of Object.entries(presetNameSuggestions.skills)) {
      if (presetNameSelection.skills[id]) selectedSkills[id] = name;
    }

    const selectedTotal = Object.keys(selectedAchievements).length + Object.keys(selectedSkills).length;
    if (selectedTotal === 0) {
      setPresetNameMessage('请至少选择一项需要覆写的名称');
      return;
    }

    setPresetNameRefreshing(true);
    setPresetNameMessage(null);
    try {
      const currentAchievements = await db.achievements.toArray();
      const currentSkills = await db.skills.toArray();
      const backup = {
        achievements: { ...(settings.aiPresetNameBackup?.achievements ?? {}) },
        skills: { ...(settings.aiPresetNameBackup?.skills ?? {}) },
      };

      for (const item of currentAchievements) {
        if (selectedAchievements[item.id] && backup.achievements[item.id] === undefined) {
          backup.achievements[item.id] = item.title;
        }
      }
      for (const item of currentSkills) {
        if (selectedSkills[item.id] && backup.skills[item.id] === undefined) {
          backup.skills[item.id] = item.name;
        }
      }

      const nextAchievements = currentAchievements.map(item => (
        selectedAchievements[item.id] ? { ...item, title: selectedAchievements[item.id] } : item
      ));
      const nextSkills = currentSkills.map(item => (
        selectedSkills[item.id] ? { ...item, name: selectedSkills[item.id] } : item
      ));

      await db.achievements.bulkPut(nextAchievements);
      await db.skills.bulkPut(nextSkills);
      await updateSettings({ aiMatchedPresetNames: true, aiPresetNameBackup: backup });
      await loadData();
      setPresetNameModalOpen(false);
      setPresetNameSuggestions(null);
      setPresetNameSelection(emptyPresetNameSelection());
      setPresetNameMessage('已覆写所选成就/技能名称，可还原到覆写前版本');
    } catch (err) {
      setPresetNameMessage(err instanceof Error ? err.message : '应用成就/技能名称失败');
    } finally {
      setPresetNameRefreshing(false);
    }
  }, [
    loadData,
    presetNameRefreshing,
    presetNameSelection,
    presetNameSuggestions,
    settings.aiPresetNameBackup,
    updateSettings,
  ]);

  const handleRestorePresetNames = useCallback(async () => {
    setPresetNameMessage(null);
    const backup = settings.aiPresetNameBackup;
    const hasBackup = Boolean(
      backup &&
      (
        Object.keys(backup.achievements ?? {}).length > 0 ||
        Object.keys(backup.skills ?? {}).length > 0
      ),
    );
    if (!backup || !hasBackup) {
      setPresetNameMessage('没有可还原的 AI 覆写记录');
      return;
    }

    setPresetNameRefreshing(true);
    try {
      const currentAchievements = await db.achievements.toArray();
      const currentSkills = await db.skills.toArray();
      const restoredAchievements = currentAchievements.map(item => (
        backup.achievements[item.id] !== undefined ? { ...item, title: backup.achievements[item.id] } : item
      ));
      const restoredSkills = currentSkills.map(item => (
        backup.skills[item.id] !== undefined ? { ...item, name: backup.skills[item.id] } : item
      ));
      await db.achievements.bulkPut(restoredAchievements);
      await db.skills.bulkPut(restoredSkills);
      await updateSettings({ aiMatchedPresetNames: false, aiPresetNameBackup: undefined });
      await loadData();
      setPresetNameSuggestions(null);
      setPresetNameSelection(emptyPresetNameSelection());
      setPresetNameModalOpen(false);
      setPresetNameMessage('已还原到 AI 覆写前的成就/技能名称');
    } catch (err) {
      setPresetNameMessage(err instanceof Error ? err.message : '还原系统成就/技能名称失败');
    } finally {
      setPresetNameRefreshing(false);
    }
  }, [loadData, settings.aiPresetNameBackup, updateSettings]);

  const themes: { value: ThemeType; label: string; color: string }[] = [
    { value: 'blue', label: '蓝色', color: '#3B82F6' },
    { value: 'yellow', label: '黄色', color: '#F59E0B' },
    { value: 'red', label: '红色', color: '#EF4444' },
    { value: 'pink', label: '粉色', color: '#EC4899' },
    { value: 'custom', label: '自定义', color: settings.customThemeColor || '#1c1c1c' }
  ];
  const [customColorDraft, setCustomColorDraft] = useState(settings.customThemeColor || '#1c1c1c');

  // ── AI 总结设置状态 ─────────────────────────────────────
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState<SummaryPromptPreset | null>(null);
  const effectivePresets: SummaryPromptPreset[] = settings.summaryPromptPresets?.length
    ? settings.summaryPromptPresets
    : DEFAULT_SUMMARY_PROMPT_PRESETS;

  const handleSavePreset = (preset: SummaryPromptPreset) => {
    const current = effectivePresets;
    const idx = current.findIndex(p => p.id === preset.id);
    const updated = idx >= 0
      ? current.map(p => p.id === preset.id ? preset : p)
      : [...current, preset];
    updateSettings({ summaryPromptPresets: updated });
    setEditingPresetId(null);
    setPresetDraft(null);
  };

  const handleDeleteCustomPreset = (id: string) => {
    const updated = effectivePresets.filter(p => p.id !== id);
    updateSettings({
      summaryPromptPresets: updated,
      summaryActivePresetId: settings.summaryActivePresetId === id ? 'igor' : settings.summaryActivePresetId,
    });
  };

  const handleAddCustomPreset = () => {
    const newPreset: SummaryPromptPreset = {
      id: `custom-${Date.now()}`,
      name: '自定义风格',
      systemPrompt: '',
      isBuiltin: false,
    };
    const updated = [...effectivePresets, newPreset];
    updateSettings({ summaryPromptPresets: updated });
    setPresetDraft(newPreset);
    setEditingPresetId(newPreset.id);
  };

  // 「关于」已迁至菜单宫格的 SheetModal（设置拆解 PR）；「数据管理/云同步」迁至账号与数据页
  // 排序（2026-07-27 三次裁决）：AI 总结紧跟主题之后；「账号与数据」入口仍在页底。
  // 区头图标从 emoji 换 SVG（v2.7 用户口径）：emoji 在蓝/黄频道的界面语言里像贴纸，
  // 换成与底导同语言的 stroke 图标（settingsIcons）
  const sections = [
    { id: 'theme', label: '主题', Icon: PaletteIcon },
    // 第 13 轮：AI 的连接 / 模型 / 数据说明从「AI 总结」拆出来单独成区（全 App 共用，不只是总结在用）
    { id: 'ai', label: 'AI 服务', Icon: KeyIcon },
    { id: 'summary', label: 'AI 总结', Icon: SparklesIcon },
    { id: 'personalize', label: '体验个性化', Icon: SlidersIcon },
    { id: 'navigator', label: '助手', Icon: DiamondMarkIcon },
    { id: 'notifications', label: '通知提醒', Icon: BellIcon }
  ];

  return (
    <P3RPage active={p3}>
    <P5RPage active={p5}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative space-y-6 ${isP4 ? 'p4-reskin' : ''} ${p5 ? 'p5-reskin' : ''}`}
    >
      {/* 顶部标题 + 返回按钮（设置从菜单宫格进入，与其他子页一致）。
          P4（p4-settings-reference-v2）：衬线特大「设置」+ 橙 Settings 手写角标 + 右上天空扇；
          p3（p3-settings 设计稿）：超大黑斜体 + 青片 + 青斜纹排 + CONFIG/SYSTEM 幽灵字 */}
      {isP4 ? (
        <div className="relative -mx-4 min-h-[146px] px-4 pb-1 pt-1" style={P4_HEADER_BLEED}>
          {/* 天空扇/弧环向上出血过页面顶部 padding 与刘海安全区：原来 top-0 只到页头
              上缘，上方露一条舞台底色，看着像实景天空被平切（用户上报）。 */}
          <P4ArcRings size={230} className="absolute -right-20" style={{ top: 'calc(-6.5rem - env(safe-area-inset-top))' }} />
          <P4SkyFan size={140} style={{ top: 'calc(-1.25rem - env(safe-area-inset-top))' }} />
          <P4Sparkle size={18} color="#ffffff" className="absolute right-[32%] top-2" />
          <P4Sparkle size={13} color="var(--ui-accent)" className="absolute right-[38%] top-[92px]" />
          <div className="flex items-start gap-2">
            <BackButton onClick={() => setCurrentPage('menu')} className="mt-3 -ml-1" />
            <div>
              <h1
                className="text-[52px] font-black leading-[1.02] tracking-tight text-[#131313]"
                style={{ fontFamily: 'var(--p4-display-font, serif)' }}
              >
                设置
              </h1>
              <div
                className="-mt-1.5 pl-10 text-[24px] font-bold italic leading-none text-[var(--p4-orange,#f9a11b)]"
                style={{ fontFamily: "'Caveat', 'Segoe Script', cursive" }}
              >
                Settings
              </div>
            </div>
          </div>
        </div>
      ) : p3 ? (
        <div className="relative">
          {/* SYSTEM 比 CONFIG 缩一档（用户口径「缩小一点点」）：0.88em ≈ 70px */}
          <GhostWords words={['CONFIG', <span style={{ fontSize: '0.88em' }}>SYSTEM</span>]} className="right-[8px] top-[-14px] text-right text-[80px]" style={{ transform: 'rotate(0deg)', lineHeight: 1.04 }} />
          <P3PageHeader ticks title="设置" onBack={() => setCurrentPage('menu')} className="relative pt-2" />
          <div aria-hidden className="mt-2 flex gap-1 pl-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="h-[8px] w-[10px]" style={{ background: i < 5 ? 'rgba(53,209,232,0.75)' : 'rgba(53,209,232,0.35)', clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
            ))}
          </div>
        </div>
      ) : p5 ? (
        /* P5UI/p5-settings：拼贴「设置」+ SETTINGS 纸条 + 红星；左上红斜块沉底 */
        <div className="relative pt-1">
          <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-5 h-[170px]" style={{ zIndex: -1 }}>
            <span className="absolute" style={{ left: -30, top: -14, width: 250, height: 90, background: P5R.red, clipPath: 'polygon(0 0, 100% 18%, 82% 100%, 0 86%)', transform: 'rotate(-4deg)' }} />
            <span className="absolute" style={{ right: -40, top: -30, width: 300, height: 110, background: P5R.redDeep, clipPath: 'polygon(14% 0, 100% 0, 100% 74%, 0 100%)', transform: 'rotate(5deg)' }} />
            <P5Star size={16} fill={P5R.red} rot={16} className="absolute" style={{ right: 90, top: 96 }} />
            <P5Star size={12} fill="#3a3831" rot={-10} className="absolute" style={{ right: 40, top: 130 }} />
          </div>
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage('menu')}
              aria-label="返回"
              className="relative mt-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
            >
              <P5Rough seed={533} jag={3.5} frame={2.5} />
              <span aria-hidden className="relative h-0 w-0 border-y-[7px] border-y-transparent border-r-[11px]" style={{ borderRightColor: '#050505' }} />
            </button>
            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <P5Collage
                  size={44}
                  tiles={[
                    { ch: '设', bg: P5R.paper, fg: P5R.ink, rot: -3.5, dy: 0 },
                    { ch: '置', bg: P5R.paper, fg: P5R.red, rot: 3, dy: 7 },
                  ]}
                />
                <P5Star size={30} fill={P5R.red} ring2={P5R.paper} rot={-12} className="mt-1" />
              </div>
              <div className="mt-2 pl-12">
                <span className="inline-flex select-none items-center px-3 py-1 text-[15px] font-black tracking-[0.14em]" style={{ background: P5R.paper, color: '#050505', transform: 'rotate(-1.4deg)', boxShadow: '0 0 0 2.5px #050505, 4px 4px 0 #000000', fontFamily: P5_TITLE_FONT }}>
                  S<span style={{ color: P5R.red }}>E</span>TTINGS
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
      <div className="flex items-start justify-between gap-3">
        <BackButton onClick={() => setCurrentPage('menu')} className="mt-1 -ml-1" />
        <div className="flex-1">
          <PageTitle title="设置" en="Settings" />
        </div>
      </div>
      )}

      <div className="space-y-4">
        {sections.map(section => (
          <div
            key={section.id}
            data-settings-section={section.id}
            className={
              isP4 || p5
                ? 'overflow-visible'
                : p3
                  ? 'overflow-hidden'
                  : 'bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden'
            }
            style={{
              ...(p3 ? { clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)', background: P3R.panelGlass, boxShadow: '0 8px 18px rgba(38,96,140,0.07)' } : {}),
              scrollMarginTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
            }}
          >
            {p5 ? (
              /* P5 分组头：收起 = 纸长条 + 黑星方章 + ▶；展开 = 红楔章（白星 + 白字）+ ▲ */
              <motion.button
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
                className="relative block w-full cursor-pointer py-0.5 text-left"
              >
                {activeSection === section.id ? (
                  <span className="flex items-center justify-between">
                    <span className="relative inline-block" style={{ transform: 'rotate(-1deg)' }}>
                      <span aria-hidden className="absolute -inset-[2.5px]" style={{ background: P5R.paper, clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)' }} />
                      <span className="relative flex items-center gap-2 py-2 pl-4 pr-9" style={{ background: P5R.red, clipPath: 'polygon(0 0, 100% 0, calc(100% - 16px) 100%, 0 100%)' }}>
                        {/* 区头图标按功能区分（v2.7 用户裁决：星标全场一个样认不出区）——底座仍是频道章 */}
                        <span aria-hidden className="shrink-0 text-white"><section.Icon className="h-4 w-4" /></span>
                        <span className="text-[17px] font-black leading-none tracking-wide text-white" style={{ fontFamily: P5_TITLE_FONT }}>{section.label}</span>
                      </span>
                    </span>
                    <span className="pr-2 font-black" style={{ color: P5R.paper }}>▲</span>
                  </span>
                ) : (
                  <span className="relative block">
                    <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,4px)', background: '#000000', clipPath: roughQuad(500 + section.id.length * 7, 5) }} />
                    <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(501 + section.id.length * 7, 5) }} />
                    <span className="relative flex items-center gap-3 px-4 py-3">
                      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center text-white" style={{ background: '#050505' }}>
                        <section.Icon className="h-[17px] w-[17px]" />
                      </span>
                      <span className="flex-1 text-[16.5px] font-black" style={{ color: P5R.ink, fontFamily: P5_TITLE_FONT }}>{section.label}</span>
                      <span aria-hidden className="h-0 w-0 border-y-[7px] border-y-transparent border-l-[11px]" style={{ borderLeftColor: '#050505' }} />
                    </span>
                  </span>
                )}
              </motion.button>
            ) : isP4 ? (
              /* P4 分组头：黑色斜章（黄花 + 白字）+ 折叠箭头 */
              <motion.button
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
                className="flex w-full items-center justify-between py-1 text-left"
              >
                <span
                  className="flex items-center gap-2 px-5 py-2.5 font-black text-white"
                  style={{ background: '#131313', borderRadius: 14, transform: 'skewX(-8deg)' }}
                >
                  <span className="flex items-center gap-2" style={{ transform: 'skewX(8deg)' }}>
                    {/* 区头图标按功能区分（v2.7 用户裁决）——黑斜章底座保留，花标让位给功能图标 */}
                    <span aria-hidden className="shrink-0" style={{ color: 'var(--ui-bg)' }}><section.Icon className="h-4 w-4" /></span>
                    {section.label}
                  </span>
                </span>
                <span className="pr-1 font-black text-[#131313]">
                  {activeSection === section.id ? '▲' : '▼'}
                </span>
              </motion.button>
            ) : (
            <motion.button
              onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              className={`w-full px-6 py-4 flex items-center justify-between ${p3 ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={p3 ? '' : 'text-gray-500 dark:text-gray-300'}
                  style={p3 ? { color: P3R.blue } : undefined}
                >
                  <section.Icon className="h-6 w-6" />
                </span>
                <span className={p3 ? 'text-[16px] font-black' : 'font-semibold text-gray-800 dark:text-white'} style={p3 ? { color: P3R.ink } : undefined}>{section.label}</span>
              </div>
              {p3 ? (
                <span aria-hidden className="h-0 w-0" style={activeSection === section.id
                  ? { borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: `9px solid ${P3R.blue}` }
                  : { borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `9px solid ${P3R.blue}` }}
                />
              ) : (
              <span className="text-gray-400">
                {activeSection === section.id ? '▲' : '▼'}
              </span>
              )}
            </motion.button>
            )}

            {activeSection === section.id && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className={isP4 ? 'mt-2 rounded-[20px] bg-[var(--ui-paper)] px-5 pb-6 pt-4' : p5 ? 'p5-sec-body relative -mt-1 px-5 pb-6 pt-5' : 'px-6 pb-6'}
                style={isP4 ? { boxShadow: '0 3px 0 rgba(19,19,19,0.12)' } : undefined}
              >
                {/* P5：不规则纸卡垫底（反板正铁律——不用直角 border）；
                    直接子内容由 .p5-sec-body > * 提权到层上（index.css） */}
                {p5 && <P5Rough seed={540 + section.id.length * 13} jag={8} frame={3.5} shadow={{ x: 5, y: 6 }} />}
                {section.id === 'theme' && (
                  <div className="space-y-5">
                    {/* ── 子板块：颜色与声音 ─────────────────────────── */}
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700/80">
                      {p5 ? (
                        <span aria-hidden className="h-0 w-0 border-y-[6px] border-y-transparent border-l-[10px]" style={{ borderLeftColor: '#c00008' }} />
                      ) : (
                        <span aria-hidden className="text-gray-500 dark:text-gray-300"><PaletteIcon className="h-[18px] w-[18px]" /></span>
                      )}
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">颜色与声音</h4>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 -mt-2 mb-1 text-sm">选择你喜欢的主题颜色</p>
                    <div className="flex gap-2">
                      {themes.map(theme => (
                        <ThemeColorButton
                          key={theme.value}
                          theme={theme}
                          active={user?.theme === theme.value}
                          onSelect={() => {
                            triggerThemeSwitchFeedback(theme.value);
                            setTheme(theme.value);
                            if (theme.value === 'custom') {
                              const color = settings.customThemeColor || customColorDraft;
                              applyCustomThemeColor(color);
                              if (!settings.customThemeColor) updateSettings({ customThemeColor: color });
                            }
                          }}
                        />
                      ))}
                    </div>

                    {/* 自定义颜色 + 音效方案 — 选中 custom 主题时展开 */}
                    {user?.theme === 'custom' && (
                      <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700 space-y-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">自定义颜色</p>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={customColorDraft}
                              onChange={e => {
                                setCustomColorDraft(e.target.value);
                                applyCustomThemeColor(e.target.value);
                              }}
                              onBlur={() => updateSettings({ customThemeColor: customColorDraft })}
                              className="w-12 h-12 rounded-xl border-2 border-gray-200 dark:border-gray-600 cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                            />
                            <div className="flex-1">
                              <input
                                type="text"
                                value={customColorDraft}
                                onChange={e => {
                                  const v = e.target.value;
                                  setCustomColorDraft(v);
                                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                                    applyCustomThemeColor(v);
                                  }
                                }}
                                onBlur={() => {
                                  if (/^#[0-9a-fA-F]{6}$/.test(customColorDraft)) {
                                    updateSettings({ customThemeColor: customColorDraft });
                                  }
                                }}
                                placeholder="#6366F1"
                                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-primary"
                              />
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">输入 HEX 色值或使用色盘选取</p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">音效方案</p>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { value: 'blue',   label: '清亮', hint: 'P3 风格' },
                              { value: 'yellow', label: '复古', hint: 'P4 风格' },
                              { value: 'red',    label: '霓虹', hint: 'P5 风格' },
                            ] as { value: import('@/types').ThemeType; label: string; hint: string }[]).map(opt => {
                              const active = (settings.customSoundScheme ?? 'blue') === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => updateSettings({ customSoundScheme: opt.value })}
                                  className={`text-center px-3 py-2 rounded-xl border-2 transition-all ${
                                    active
                                      ? 'border-primary bg-primary/10 dark:bg-primary/20'
                                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                                  }`}
                                >
                                  <div className={`text-xs font-bold ${active ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {/* 塔罗卡面 —— 只有自定义主题需要挑：蓝/黄/红三个频道各自的牌
                            是频道视觉的一部分，钉死。自定义主题原先无条件借蓝那套水下卡。 */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">塔罗卡面</p>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { value: 'p3', label: '蓝', swatch: '#3B82F6' },
                              { value: 'p4', label: '黄', swatch: '#F9A11B' },
                              { value: 'p5', label: '红', swatch: '#C00008' },
                            ] as { value: 'p3' | 'p4' | 'p5'; label: string; swatch: string }[]).map(opt => {
                              const active = (settings.customTarotSet ?? 'p3') === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => updateSettings({ customTarotSet: opt.value })}
                                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 transition-all ${
                                    active
                                      ? 'border-primary bg-primary/10 dark:bg-primary/20'
                                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                                  }`}
                                >
                                  <span
                                    aria-hidden
                                    className="w-3.5 h-5 rounded-[3px] border border-black/15 shrink-0"
                                    style={{ background: opt.swatch }}
                                  />
                                  <span className={`text-xs font-bold ${active ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">
                            换的是星象页抽到的牌长什么样。小组件上的牌面不跟随，始终是蓝那套。
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-white">静音模式</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">开启后所有音效静音</div>
                      </div>
                      <Toggle
                        checked={!!settings.soundMuted}
                        onChange={(v) => updateSettings({ soundMuted: v })}
                        aria-label="静音模式"
                      />
                    </div>

                    {/* 音量大小滑块：仅非静音时显示（第 13 轮：草稿值 + 松手试听 + 通道小字，见 SoundVolumeRow） */}
                    {!settings.soundMuted && <SoundVolumeRow p5={p5} />}

                    {/* 夜间模式 */}
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-800 dark:text-white">夜间模式</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">降低屏幕亮度，保护眼睛</p>
                      </div>
                      <Toggle
                        checked={!!settings.darkMode}
                        onChange={(v) => updateSettings({ darkMode: v })}
                        aria-label="夜间模式"
                      />
                    </div>

                    {/* ── 子板块：显示 ────────────────────────────── */}
                    <div className="flex items-center gap-2 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700/80">
                      {p5 ? (
                        <span aria-hidden className="h-0 w-0 border-y-[6px] border-y-transparent border-l-[10px]" style={{ borderLeftColor: '#c00008' }} />
                      ) : (
                        <span aria-hidden className="text-gray-500 dark:text-gray-300"><ImageIcon className="h-[18px] w-[18px]" /></span>
                      )}
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">显示</h4>
                    </div>

                    {/* 背景动画 — 多选 toggle（p3：一行四个斜切预览块 + 块下标签，p3-settings 设计稿） */}
                    {!settings.backgroundImage && (
                      <div className={p3 ? 'space-y-3' : 'space-y-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'}>
                        <div>
                          <h4 className={p3 ? 'text-[15px] font-black' : 'font-medium text-gray-800 dark:text-white'} style={p3 ? { color: P3R.ink } : undefined}>背景动画</h4>
                          <p className={p3 ? 'text-[12px] font-semibold' : 'text-sm text-gray-600 dark:text-gray-400'} style={p3 ? { color: P3R.grey } : undefined}>
                            {user?.theme === 'red'
                              ? '最多同时开启两个。'
                              : '最多同时开启两个，跟随主题色'}
                          </p>
                        </div>
                        <div className={p3 ? 'grid grid-cols-4 gap-2' : 'grid grid-cols-2 gap-2'}>
                          {([
                            { value: 'aurora',    label: '极光',   desc: '柔和色块漂移' },
                            { value: 'particles', label: '粒子',   desc: '浮尘缓慢上升' },
                            { value: 'wave',      label: '渐变波', desc: '流动色彩背景' },
                            { value: 'pulse',     label: '脉冲',   desc: '网格线呼吸' },
                          ]).map(opt => {
                            const current = (settings.backgroundAnimation ?? []) as string[];
                            const active = current.includes(opt.value);
                            const toggle = () => {
                              // 最多两个：已满时再点第三个，挤掉最早开的那个（不做静默失败）
                              const next = active
                                ? current.filter(v => v !== opt.value)
                                : [...current, opt.value].slice(-2);
                              // 红频道背景动画默认不开（ui/bgAnim.ts）——在红主题下动这几个开关
                              // 就是"亲手开启"，把 opt-in 记下来；清空则收回。
                              // 不动 backgroundAnimation 本身，切回蓝/黄时原来的选择还在。
                              updateSettings(
                                user?.theme === 'red'
                                  ? { backgroundAnimation: next, p5BgAnimOptIn: next.length > 0 }
                                  : { backgroundAnimation: next },
                              );
                            };
                            if (p3) {
                              return (
                                <button key={opt.value} onClick={toggle} aria-pressed={active} title={opt.desc} className="relative flex flex-col items-center gap-1.5">
                                  <span
                                    className="relative h-12 w-full overflow-hidden"
                                    style={{ clipPath: 'polygon(11px 0, 100% 0, calc(100% - 11px) 100%, 0 100%)', background: active ? P3R.blue : 'var(--p3r-chip, #ddeef7)', boxShadow: active ? '0 8px 18px rgba(27,87,255,0.22)' : 'none' }}
                                  >
                                    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `repeating-linear-gradient(115deg, transparent 0 12px, ${active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)'} 12px 15px)` }} />
                                  </span>
                                  <span className="whitespace-nowrap text-[11px] font-black leading-tight" style={{ color: active ? P3R.blue : P3R.ink }}>{opt.label}</span>
                                </button>
                              );
                            }
                            return (
                              <button
                                key={opt.value}
                                onClick={toggle}
                                className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                                  active
                                    ? 'border-primary bg-primary/10 dark:bg-primary/20'
                                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                                }`}
                              >
                                <div className={`text-sm font-bold flex items-center gap-1.5 ${active ? 'text-primary' : 'text-gray-800 dark:text-white'}`}>
                                  <span className={`w-3 h-3 rounded-sm border flex-shrink-0 transition-colors ${active ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-500'}`} />
                                  {opt.label}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 pl-4">{opt.desc}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 「装饰纹理」开关已下架（用户口径「没啥用」），渲染端同步移除 */}

                    {/* 开屏动画 */}
                    <div className={p3 ? 'space-y-3' : 'space-y-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'}>
                      <div>
                        <h4 className={p3 ? 'text-[15px] font-black' : 'font-medium text-gray-800 dark:text-white'} style={p3 ? { color: P3R.ink } : undefined}>开屏动画</h4>
                        <p className={p3 ? 'text-[12px] font-semibold' : 'text-sm text-gray-600 dark:text-gray-400'} style={p3 ? { color: P3R.grey } : undefined}>启动时的过场风格与速率</p>
                      </div>
                      <div className={p3 ? 'grid grid-cols-4 gap-2' : 'grid grid-cols-2 gap-2'}>
                        {([
                          {
                            value: 'velvet',
                            label: '靛蓝色房间',
                            sub: 'The Velvet',
                            sound: '/themea-switch.mp3',
                            color: '#7C3AED',
                            bg: 'rgba(124,58,237,0.08)',
                            border: 'rgba(124,58,237,0.5)',
                            icon: '🌌',
                          },
                          {
                            value: 'p5',
                            label: '红黑剪报风',
                            sub: 'Phantom Thief',
                            sound: '/themec-switch.mp3',
                            color: '#DC2626',
                            bg: 'rgba(220,38,38,0.08)',
                            border: 'rgba(220,38,38,0.5)',
                            icon: '🃏',
                          },
                          {
                            value: 'p3',
                            label: '深夜月光录',
                            sub: 'Memento Mori',
                            sound: '/themea-switch.mp3',
                            color: '#2563EB',
                            bg: 'rgba(37,99,235,0.08)',
                            border: 'rgba(37,99,235,0.5)',
                            icon: '🕐',
                          },
                          {
                            value: 'p4',
                            label: '黄色警戒线',
                            sub: 'Midnight Channel',
                            sound: '/themeb-switch.mp3',
                            color: '#D97706',
                            bg: 'rgba(217,119,6,0.08)',
                            border: 'rgba(217,119,6,0.5)',
                            icon: '📺',
                          },
                        ] as { value: 'velvet'|'p5'|'p3'|'p4'; label: string; sub: string; sound: string; color: string; bg: string; border: string; icon: string }[]).map(opt => {
                          const active = (settings.splashStyle ?? 'velvet') === opt.value;
                          return (
                            <SplashStyleButton
                              key={opt.value}
                              opt={opt}
                              active={active}
                              onSelect={() => {
                                playSound(opt.sound, 0.55);
                                updateSettings({ splashStyle: opt.value });
                              }}
                            />
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className={p3 ? 'flex-shrink-0 text-sm font-black' : 'text-sm text-gray-600 dark:text-gray-400 flex-shrink-0'} style={p3 ? { color: P3R.ink } : undefined}>速率</span>
                        <div className={p3 ? 'flex flex-1 gap-1.5' : 'flex gap-2'}>
                          {([
                            { value: 'fast',   label: '快' },
                            { value: 'normal', label: '正常' },
                            { value: 'slow',   label: '慢' },
                          ] as { value: 'fast'|'normal'|'slow'; label: string }[]).map(opt => {
                            const active = (settings.splashSpeed ?? 'normal') === opt.value;
                            // P5：不规则黑框段钮，选中 = 红面白字 + 白星（稿「正常 ☆」）
                            if (p5) {
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => updateSettings({ splashSpeed: opt.value })}
                                  className="relative cursor-pointer px-4 py-1.5 text-sm font-black transition-all"
                                  style={{ color: active ? '#fff' : '#050505' }}
                                >
                                  <P5Rough seed={575 + opt.value.length * 9} jag={4} frame={2.5} face={active ? '#c00008' : '#f0e9df'} shadow={{ x: 2.5, y: 3 }} />
                                  <span className="relative inline-flex items-center gap-1">
                                    {opt.label}
                                    {active && <P5Star size={12} fill="#f8f8f6" />}
                                  </span>
                                </button>
                              );
                            }
                            return (
                              <button
                                key={opt.value}
                                onClick={() => updateSettings({ splashSpeed: opt.value })}
                                className={p3
                                  ? 'flex-1 py-1.5 text-sm font-black transition-all'
                                  : `px-4 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                                      active
                                        ? 'border-primary bg-primary text-white'
                                        : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                style={p3 ? { clipPath: 'polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)', background: active ? P3R.blue : 'var(--p3r-chip, #ddeef7)', color: active ? '#fff' : P3R.ink } : undefined}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* 天气（月相 ⇄ 天气切换的配置入口） */}
                    <WeatherSettings />

                    {/* 背景图片上传 */}
                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-800 dark:text-white">背景图片</h4>
                      <div className="space-y-3">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const raw = event.target?.result as string;
                                // 长边缩到 2400px、质量 0.9（第 4 轮，用户批注：压缩但保住画质）：
                                // 3 倍屏也够铺满；原图动辄 5MB，settings 每次读写都得搬它一遍
                                void downscaleDataUrl(raw, 2400, 0.9)
                                  .catch(() => raw)
                                  .then(img => updateSettings({ backgroundImage: img }));
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                        />

                        {settings.backgroundImage && (
                          <div className="space-y-2">
                            <div className="relative h-32 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                              <img
                                src={settings.backgroundImage}
                                alt="背景预览"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                透明度
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={settings.backgroundOpacity ?? 0.3}
                                onChange={(e) => {
                                  const next = parseFloat(e.target.value);
                                  opacityDraftRef.current = next;
                                  updateSettings({ backgroundOpacity: next });
                                }}
                                onPointerUp={() => {
                                  updateSettings({ backgroundOpacity: opacityDraftRef.current });
                                }}
                                onPointerCancel={() => {
                                  updateSettings({ backgroundOpacity: opacityDraftRef.current });
                                }}
                                className="w-full"
                              />
                            </div>
                            <div className="flex gap-2">
                              <select
                                value={settings.backgroundOrientation || 'landscape'}
                                onChange={(e) => updateSettings({ backgroundOrientation: e.target.value as 'landscape' | 'portrait' })}
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                              >
                                <option value="landscape">横屏模式</option>
                                <option value="portrait">竖屏模式</option>
                              </select>
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => updateSettings({ backgroundImage: undefined })}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg"
                              >
                                移除
                              </motion.button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── 子板块：导入音乐（第 13 轮 B 组 2.8，常态折叠，主题分区最下方） ── */}
                    <BgmSettings p5={p5} />
                  </div>
                )}

                {section.id === 'personalize' && (
                  <div className="space-y-5">
                    {/* ── 子板块：属性 ────────────────────────────── */}
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700/80">
                      <span aria-hidden className="text-gray-500 dark:text-gray-300"><GearIcon className="h-[18px] w-[18px]" /></span>
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">属性</h4>
                    </div>

                    {/* 逆流开关 */}
                    <div className={`rounded-xl border-2 p-4 transition-all ${
                      settings.countercurrentEnabled
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span aria-hidden className="text-gray-500 dark:text-gray-300"><WaveIcon className="h-[18px] w-[18px]" /></span>
                            <h4 className="text-sm font-bold text-gray-800 dark:text-white">逆流</h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold">实验性</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                            连续3日某属性无增长，次日起每天该属性自动 −1，并在首页提前一天预警。
                          </p>
                        </div>
                        <div className="flex-shrink-0 mt-0.5">
                          <Toggle
                            checked={!!settings.countercurrentEnabled}
                            onChange={(enabling) => {
                              updateSettings({
                                countercurrentEnabled: enabling,
                                // 记录开启日期：3 日无增长窗口从次日开始计算
                                countercurrentEnabledAt: enabling ? toLocalDateKey() : settings.countercurrentEnabledAt,
                              });
                            }}
                            aria-label="逆流"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 记账开关 + 货币（F5） */}
                    <div className={`rounded-xl border-2 p-4 transition-all ${
                      settings.ledgerEnabled !== false
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span aria-hidden className="text-gray-500 dark:text-gray-300"><CoinIcon className="h-[18px] w-[18px]" /></span>
                            <h4 className="text-sm font-bold text-gray-800 dark:text-white">记账</h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold">新</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                            低摩擦记账：总余额 / 预算 / 结转 + 四轴觉察。数据始终只存本地、不上云。
                          </p>
                        </div>
                        <div className="flex-shrink-0 mt-0.5">
                          <Toggle
                            checked={settings.ledgerEnabled !== false}
                            onChange={(v) => updateSettings({ ledgerEnabled: v })}
                            aria-label="记账"
                          />
                        </div>
                      </div>
                      {settings.ledgerEnabled !== false && (
                        <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-blue-200/60 dark:border-blue-800/40">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">货币</span>
                          <select
                            value={settings.currency ?? 'CNY'}
                            onChange={(e) => updateSettings({ currency: e.target.value })}
                            aria-label="货币"
                            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-800 dark:text-white outline-none"
                          >
                            <option value="CNY">¥ 人民币</option>
                            <option value="USD">$ 美元</option>
                            <option value="EUR">€ 欧元</option>
                            <option value="JPY">¥ 日元</option>
                            <option value="GBP">£ 英镑</option>
                            <option value="HKD">HK$ 港币</option>
                            <option value="KRW">₩ 韩元</option>
                          </select>
                        </div>
                      )}
                      {settings.ledgerEnabled !== false && (
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">消费评估</span>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">记账时可评「值 / 不值」，值得 +1 SP，比例进月报</p>
                          </div>
                          <Toggle
                            checked={!!settings.spendEvalEnabled}
                            onChange={(v) => updateSettings({ spendEvalEnabled: v })}
                            aria-label="消费评估"
                          />
                        </div>
                      )}
                      {settings.ledgerEnabled !== false && (
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">发薪日周期</span>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">预算 / 今日可花 / 规划窗按发薪日切分周期；关则按自然月。</p>
                          </div>
                          <Toggle
                            checked={!!settings.ledgerPayCycleEnabled}
                            onChange={(v) => updateSettings({ ledgerPayCycleEnabled: v })}
                            aria-label="发薪日周期"
                          />
                        </div>
                      )}
                      {settings.ledgerEnabled !== false && settings.ledgerPayCycleEnabled && (
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">发薪日</span>
                          <select
                            value={settings.ledgerResetDay ?? 1}
                            onChange={(e) => updateSettings({ ledgerResetDay: Number(e.target.value) })}
                            aria-label="发薪日"
                            className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-800 dark:text-white outline-none"
                          >
                            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                              <option key={d} value={d}>每月 {d} 号</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* F3 治疗终端开关已退役（TASKS_MERGE_PRD）：能力并入任务系统 */}

                    {/* ── 属性名称 ───────────────────────────── */}
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/30 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800/60 flex items-center gap-2">
                        <span aria-hidden className="text-gray-500 dark:text-gray-300"><TagIcon className="h-[18px] w-[18px]" /></span>
                        <h4 className="text-sm font-bold text-gray-800 dark:text-white">属性名称</h4>
                        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold">
                          5 维
                        </span>
                      </div>
                      <p className="px-4 pt-3 pb-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        给五个维度取个贴合你的名字，命名会立刻在整个房间里生效。
                      </p>
                      <div className={p5 ? 'space-y-3.5 p-3 pr-4' : 'p-3 space-y-2'}>
                        {ATTRIBUTE_META.map((meta, mi) => (
                          <AttributeNameField
                            key={meta.id}
                            id={meta.id}
                            icon={meta.icon}
                            color={meta.color}
                            defaultLabel={meta.defaultLabel}
                            value={settings.attributeNames[meta.id]}
                            index={mi}
                            onCommit={(v) => updateSettings({
                              attributeNames: {
                                ...settings.attributeNames,
                                [meta.id]: v,
                              },
                            })}
                          />
                        ))}
                        {p5 ? (
                          <div className="flex gap-3 pt-2">
                            <P5Btn tone="red" seed={741} onClick={handleRefreshPresetNames} disabled={presetNameRefreshing} className="flex-1" bodyClassName="!px-3 !py-2.5 !text-[14px]">
                              {presetNameRefreshing ? '匹配中…' : 'AI 匹配成就 / 技能名称'}
                            </P5Btn>
                            <P5Btn tone="paper" seed={742} onClick={handleRestorePresetNames} disabled={presetNameRefreshing || !hasPresetNameBackup} bodyClassName="!px-4 !py-2.5 !text-[14px]">
                              还原
                            </P5Btn>
                          </div>
                        ) : (
                        <div className="pt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={handleRefreshPresetNames}
                            disabled={presetNameRefreshing}
                            className="flex-1 py-2 rounded-xl text-xs font-bold bg-primary/10 border border-primary/30 text-primary hover:bg-primary/15 disabled:opacity-60 transition-colors"
                          >
                            {presetNameRefreshing ? '匹配中' : 'AI 匹配成就/技能名称'}
                          </button>
                          <button
                            type="button"
                            onClick={handleRestorePresetNames}
                            disabled={presetNameRefreshing || !hasPresetNameBackup}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                          >
                            还原
                          </button>
                        </div>
                        )}
                        {presetNameMessage && (
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            {presetNameMessage}
                          </p>
                        )}
                        {hasPresetNameBackup && !presetNameMessage && (
                          <p className="text-[10px] text-primary leading-relaxed">
                            当前有 AI 覆写记录，可还原到覆写前版本。
                          </p>
                        )}
                      </div>
                    </div>

                    {/* ── 等级需求 ───────────────────────────── */}
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/30 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800/60 flex items-center gap-2">
                        <span aria-hidden className="text-gray-500 dark:text-gray-300"><BarsIcon className="h-[18px] w-[18px]" /></span>
                        <h4 className="text-sm font-bold text-gray-800 dark:text-white">等级需求</h4>
                        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold tabular-nums">
                          {settings.levelThresholds.length} / 10 级
                        </span>
                      </div>
                      <p className="px-4 pt-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        达到对应等级所需的累计点数（数值可随时调整；建议保持单调递增）。
                      </p>
                      {/* 难度档（R19）：换档 = 把该档的阈值整套套上（已开到几级就套到几级） */}
                      <div className="px-3 pb-1">
                        <div className="flex gap-2">
                          {(['easy', 'hard'] as const).map(d => {
                            const on = curDifficulty === d;
                            return (
                              <button
                                key={d}
                                onClick={() => applyDifficulty(d)}
                                className={`flex-1 rounded-xl border px-3 py-2 text-left transition-colors ${
                                  on
                                    ? 'border-primary/50 bg-primary/10'
                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
                                }`}
                              >
                                <div className={`text-xs font-black ${on ? 'text-primary' : 'text-gray-700 dark:text-gray-200'}`}>
                                  {d === 'easy' ? '简单' : '困难'}
                                  {on && <span className="ml-1 text-[10px]">✓</span>}
                                </div>
                                <div className="mt-0.5 text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                                  LV5 需 {LEVEL_PRESETS[d].base[4]} 点
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
                          困难档的等级标签会换成一套专属配色——菜单、同伴塔罗、以及别人看到的你，都认得出来。
                        </p>
                      </div>
                      <div className="p-3 space-y-1.5">
                        {settings.levelThresholds.map((threshold, index) => {
                          const isLast = index === settings.levelThresholds.length - 1;
                          // Lv.1–5 受保护，不可删除；只有最高级且 index ≥ 5（即 Lv.6+）才允许移除
                          const canRemove = isLast && index >= 5;
                          return (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200/60 dark:border-gray-700/40"
                            >
                              <div className="w-12 text-center flex-shrink-0 px-1">
                                <div className="text-[9px] font-bold tracking-widest text-gray-400">LV</div>
                                <div className="text-base font-black text-primary leading-tight">{index + 1}</div>
                              </div>
                              <div className="flex-1 min-w-0 relative">
                                <input
                                  type="number"
                                  value={threshold}
                                  onChange={(e) => {
                                    const newThresholds = [...settings.levelThresholds];
                                    newThresholds[index] = parseInt(e.target.value) || 0;
                                    updateSettings({ levelThresholds: newThresholds });
                                  }}
                                  min="0"
                                  placeholder="需求点数"
                                  className="w-full pl-3 pr-10 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-primary transition-colors tabular-nums"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">点</span>
                              </div>
                              {canRemove ? (
                                <button
                                  onClick={() => setDeleteLevelIndex(index)}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-400 hover:bg-rose-500/10 flex-shrink-0 transition-colors"
                                  aria-label="移除最高等级"
                                  title="移除最高等级"
                                >
                                  <span className="text-base leading-none">−</span>
                                </button>
                              ) : (
                                <div
                                  className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-gray-300 dark:text-gray-600"
                                  title={index < 5 ? 'Lv.1–5 不可删除' : ''}
                                >
                                  {index < 5 ? <span className="text-[10px] opacity-60">🔒</span> : null}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="p-3 pt-1 flex gap-2">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            if (settings.levelThresholds.length >= 10) return;
                            setShowLevelWarning(true);
                          }}
                          disabled={settings.levelThresholds.length >= 10}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                            settings.levelThresholds.length >= 10
                              ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed'
                              : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15'
                          }`}
                        >
                          + 添加一级
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setShowResetThresholdsConfirm(true)}
                          className="py-2 px-4 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          title="恢复默认阈值"
                        >
                          ↺ 默认
                        </motion.button>
                      </div>
                      <div className="mx-3 mb-3 rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-gray-50/80 dark:bg-gray-900/35 overflow-hidden">
                        <div className="px-3 py-3 border-b border-gray-200/70 dark:border-gray-700/60 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-black text-gray-800 dark:text-white">
                              等级称号
                            </div>
                            <p className="mt-1 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                              每个属性的 Lv 会显示一个四字称号；点击 AI 刷新会先生成建议，再选择要应用的属性。
                            </p>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={handleRefreshLevelTitles}
                              disabled={levelTitleRefreshing}
                              className="px-2.5 py-1.5 rounded-lg bg-primary text-white text-[10px] font-bold disabled:opacity-60"
                            >
                              {levelTitleRefreshing ? '刷新中' : 'AI 刷新'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                updateSettings({
                                  attributeLevelTitles: normalizeAttributeLevelTitles(undefined, settings.levelThresholds.length),
                                });
                                setLevelTitleMessage('已填入默认等级称号');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-bold"
                            >
                              默认
                            </button>
                          </div>
                        </div>
                        {levelTitleMessage && (
                          <div className="px-3 pt-2 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                            {levelTitleMessage}
                          </div>
                        )}
                        <div className="p-3">
                          <div className="rounded-xl border border-gray-200/70 dark:border-gray-700/60 bg-white dark:bg-gray-900/50 overflow-hidden">
                            <div className="px-3 py-2.5 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800">
                              <button
                                type="button"
                                onClick={() => setLevelTitleAttrIndex(i => (i + ATTRIBUTE_META.length - 1) % ATTRIBUTE_META.length)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300"
                                aria-label="上一个属性"
                              >
                                ‹
                              </button>
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                                style={{ background: `${activeLevelTitleMeta.color}1f`, color: activeLevelTitleMeta.color }}
                              >
                                {activeLevelTitleMeta.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-gray-800 dark:text-white truncate">
                                  {settings.attributeNames[activeLevelTitleMeta.id] || activeLevelTitleMeta.defaultLabel}
                                </div>
                                <div className="text-[9px] font-bold tracking-[0.18em] text-gray-400 uppercase">
                                  {activeLevelTitleMeta.id}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setLevelTitleAttrIndex(i => (i + 1) % ATTRIBUTE_META.length)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300"
                                aria-label="下一个属性"
                              >
                                ›
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-3">
                              {settings.levelThresholds.map((_, levelIndex) => (
                                <LevelTitleField
                                  key={`${activeLevelTitleMeta.id}-${levelIndex}`}
                                  level={levelIndex + 1}
                                  value={currentLevelTitles[activeLevelTitleMeta.id][levelIndex]}
                                  onCommit={(value) => {
                                    updateSettings({
                                      attributeLevelTitles: patchAttributeLevelTitle(
                                        settings.attributeLevelTitles,
                                        activeLevelTitleMeta.id,
                                        levelIndex,
                                        value,
                                        settings.levelThresholds.length,
                                      ),
                                    });
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="mt-2 flex justify-center gap-1.5">
                            {ATTRIBUTE_META.map((meta, index) => (
                              <button
                                key={meta.id}
                                type="button"
                                onClick={() => setLevelTitleAttrIndex(index)}
                                className={`h-1.5 rounded-full transition-all ${
                                  index === levelTitleAttrIndex
                                    ? 'w-5 bg-primary'
                                    : 'w-1.5 bg-gray-300 dark:bg-gray-600'
                                }`}
                                aria-label={`切换到${settings.attributeNames[meta.id] || meta.defaultLabel}`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 今日委托 · 第四张 AI 卡（第 17 批，默认关）：按最近 7 天的记录写一张更贴近自己的委托 */}
                    <div className={`rounded-xl border-2 p-4 transition-all ${
                      settings.lifeQuestAiCard
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span aria-hidden className="text-gray-500 dark:text-gray-300"><SparklesIcon className="h-[18px] w-[18px]" /></span>
                            <h4 className="text-sm font-bold text-gray-800 dark:text-white">今日委托多一张 AI 写的</h4>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                            委托板的今日委托在三张题库卡之外，每天再多一张按你最近的记录写的。会把最近 7 天的记录标题发给你配的 AI 服务；没配 AI 时不出现。
                          </p>
                        </div>
                        <div className="flex-shrink-0 mt-0.5">
                          <Toggle
                            checked={!!settings.lifeQuestAiCard}
                            onChange={(v) => updateSettings({ lifeQuestAiCard: v })}
                            aria-label="今日委托多一张 AI 写的"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── 子板块：关键词规则（默认收起，点击展开） ─────────────────────── */}
                    <button
                      type="button"
                      onClick={() => setKeywordRulesExpanded(v => !v)}
                      className="w-full flex items-center gap-2 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700/80 cursor-pointer text-left"
                      aria-expanded={keywordRulesExpanded}
                    >
                      <span aria-hidden className="text-gray-500 dark:text-gray-300"><KeyIcon className="h-[18px] w-[18px]" /></span>
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">关键词规则</h4>
                      <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">命中即加分</span>
                      <motion.svg
                        animate={{ rotate: keywordRulesExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-1"
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </motion.svg>
                    </button>
                    <AnimatePresence initial={false}>
                    {keywordRulesExpanded && (
                    <motion.div
                      key="keyword-rules-body"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed pt-2">
                      记录中出现某属性的关键词时，自动为该属性 +1 点。回车或点 <span className="font-mono font-bold">+</span> 添加，点击标签可移除。
                    </p>
                    <div className="space-y-3 pt-3">
                      {settings.keywordRules.map((rule, index) => {
                        const meta = ATTRIBUTE_META.find(m => m.id === rule.attribute);
                        const accent = meta?.color ?? '#6B7280';
                        const attrName = settings.attributeNames[rule.attribute] || meta?.defaultLabel || rule.attribute;
                        const isEditing = Object.prototype.hasOwnProperty.call(keywordDrafts, index);
                        const draft = keywordDrafts[index] ?? '';

                        const commitDraft = () => {
                          const trimmed = draft.trim();
                          if (!trimmed) return;
                          const existing = new Set(rule.keywords.map(k => k.toLowerCase()));
                          if (existing.has(trimmed.toLowerCase())) {
                            // 去重：清空 draft 但保持输入框开启
                            setKeywordDrafts(prev => ({ ...prev, [index]: '' }));
                            return;
                          }
                          const newRules = [...settings.keywordRules];
                          newRules[index] = { ...rule, keywords: [...rule.keywords, trimmed] };
                          updateSettings({ keywordRules: newRules });
                          // 添加成功后清空 draft，让用户可以连续输入
                          setKeywordDrafts(prev => ({ ...prev, [index]: '' }));
                        };

                        return (
                          <div
                            key={index}
                            className="rounded-2xl border overflow-hidden"
                            style={{
                              borderColor: `${accent}40`,
                              background: `linear-gradient(180deg, ${accent}0a 0%, transparent 60%)`,
                            }}
                          >
                            {/* 头部：图标 + 名字 + 计数 */}
                            <div className="px-3.5 py-2.5 flex items-center gap-2.5">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                                style={{ background: `${accent}1f`, color: accent }}
                              >
                                {meta?.icon ?? '🏷️'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-gray-800 dark:text-white truncate">
                                  {attrName}
                                </div>
                                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                  命中后 <span className="font-bold tabular-nums" style={{ color: accent }}>+{rule.points}</span> 点
                                </div>
                              </div>
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums"
                                style={{ background: `${accent}1a`, color: accent }}
                              >
                                {rule.keywords.length} 词
                              </span>
                            </div>

                            {/* 正文：标签 + 内联输入 */}
                            <div className="px-3.5 pb-3 space-y-2">
                              {rule.keywords.length === 0 ? (
                                <div className="text-[11px] text-gray-400 italic px-1">暂无关键词，下方输入回车添加</div>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {rule.keywords.map((keyword, kIdx) => (
                                    <button
                                      key={`${keyword}-${kIdx}`}
                                      onClick={() => {
                                        const newRules = [...settings.keywordRules];
                                        newRules[index] = {
                                          ...rule,
                                          keywords: rule.keywords.filter((_, i) => i !== kIdx),
                                        };
                                        updateSettings({ keywordRules: newRules });
                                      }}
                                      className="group inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium transition-all hover:scale-[1.03] active:scale-95"
                                      style={{
                                        background: `${accent}1a`,
                                        color: accent,
                                        border: `1px solid ${accent}33`,
                                      }}
                                      title="点击移除"
                                    >
                                      <span className="max-w-[120px] truncate">{keyword}</span>
                                      <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[11px] leading-none opacity-50 group-hover:opacity-100 group-hover:bg-rose-500/15 group-hover:text-rose-500 transition">
                                        ×
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* 始终可见的内联输入 */}
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <input
                                  type="text"
                                  value={draft}
                                  onChange={(e) => setKeywordDrafts(prev => ({ ...prev, [index]: e.target.value }))}
                                  onFocus={() => {
                                    if (!isEditing) setKeywordDrafts(prev => ({ ...prev, [index]: '' }));
                                  }}
                                  onBlur={() => {
                                    // 失焦且无内容则关闭，避免到处都是空 draft 占位
                                    if (!draft.trim()) {
                                      setKeywordDrafts(prev => {
                                        const n = { ...prev };
                                        delete n[index];
                                        return n;
                                      });
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); commitDraft(); }
                                    if (e.key === 'Escape') {
                                      setKeywordDrafts(prev => {
                                        const n = { ...prev };
                                        delete n[index];
                                        return n;
                                      });
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  placeholder="输入关键词后回车 / 点 +"
                                  className="flex-1 min-w-0 px-3 py-1.5 text-xs border rounded-lg bg-white dark:bg-gray-900/60 text-gray-800 dark:text-white focus:outline-none transition-colors"
                                  style={{
                                    borderColor: isEditing && draft ? accent : 'rgba(148,163,184,0.35)',
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={commitDraft}
                                  disabled={!draft.trim()}
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-black text-white disabled:opacity-30 disabled:cursor-not-allowed transition-opacity active:scale-95"
                                  style={{ background: accent }}
                                  aria-label="添加关键词"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    </motion.div>
                    )}
                    </AnimatePresence>

                    {/* 逆影战场开关 — 关闭后在此重新开启 */}
                    {!settings.battleEnabled && (
                      <div className="rounded-xl border-2 border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-900/15 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span aria-hidden className="text-gray-500 dark:text-gray-300"><SwordsIcon className="h-[18px] w-[18px]" /></span>
                              <h4 className="text-sm font-bold text-gray-800 dark:text-white">逆影战场</h4>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-semibold">已关闭</span>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                              召唤 Persona，识破并击败内心的暗影。
                            </p>
                          </div>
                          <button
                            onClick={() => updateSettings({ battleEnabled: true })}
                            className="flex-shrink-0 mt-0.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition-colors"
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                          >
                            开启
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {section.id === 'ai' && <AIServiceSettings openConnection={aiJump} />}

                {section.id === 'navigator' && <NavigatorSettings />}

                {section.id === 'notifications' && <NotificationSettings />}

                {section.id === 'summary' && (() => {
                  const activePresetId = settings.summaryActivePresetId ?? 'igor';
                  const activeFamiliar = FAMILIAR_FACE_PRESETS.find(p => p.id === activePresetId);
                  const familiarTaglines: Record<string, string> = {
                    'elizabeth': '好奇探索，郑重记录',
                    'theodore': '恭谨诚挚，深情服侍',
                    'margaret': '典雅沉思，潜能鉴证',
                    'caroline-justine': '急峻与冷静，双声问讯',
                  };
                  return (
                  <div className="space-y-3 pb-1">

                    {/* 路标（第 13 轮）：Key / 服务商 / 模型搬去了「AI 服务」，教程里还写着「在 AI 总结里填」——点一下直接过去 */}
                    {/* 一行高（用户口径：路标别占地方） */}
                    <button
                      type="button"
                      onClick={jumpToAIService}
                      data-testid="summary-to-ai-service"
                      className="flex w-full items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-left"
                    >
                      <KeyIcon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-gray-700 dark:text-gray-200">API Key 和模型已移到「AI 服务」</span>
                      <span className="shrink-0 text-[12px] font-bold text-primary">前往 ›</span>
                    </button>

                    {/* ── 沟通风格卡片 ── */}
                    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700/60">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">沟通风格</span>
                      </div>
                      <div className="p-4 space-y-4 dark:bg-gray-800/20">

                        {/* 熟悉的人 */}
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">熟悉的人</p>
                          <div className="grid grid-cols-4 gap-2">
                            {([
                              { id: 'elizabeth', icon: '🦋', name: '蓝蝶' },
                              { id: 'theodore',  icon: '🌿', name: '青侍' },
                              { id: 'margaret',  icon: '📖', name: '典藏' },
                              { id: 'caroline-justine', icon: '⚔️', name: '双子审官' },
                            ] as const).map(face => {
                              const isActive = activePresetId === face.id;
                              return (
                                <button
                                  key={face.id}
                                  onClick={() => updateSettings({ summaryActivePresetId: face.id })}
                                  aria-label={face.name}
                                  title={face.name}
                                  /* v2.7.0.6：只留 emoji（用户口径），min-h 保住原来"图标 + 名字"的高度，方便按 */
                                  className={`flex min-h-[58px] items-center justify-center rounded-xl border-2 px-1 transition-all ${
                                    isActive
                                      ? 'border-primary bg-primary/8 dark:bg-primary/15'
                                      : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600'
                                  }`}
                                >
                                  <span className="text-[26px] leading-none">{face.icon}</span>
                                </button>
                              );
                            })}
                          </div>
                          {activeFamiliar && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 px-1">
                              <span className="font-bold text-gray-600 dark:text-gray-300">{activeFamiliar.name}</span>
                              {familiarTaglines[activeFamiliar.id] ? ` · ${familiarTaglines[activeFamiliar.id]}` : ''}
                            </p>
                          )}
                        </div>

                        {/* 内置 / 自定义预设列表 */}
                        <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">内置 / 自定义</p>
                            <button
                              onClick={handleAddCustomPreset}
                              className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-lg hover:bg-primary/20 transition-colors"
                            >
                              + 新增
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {effectivePresets.map(preset => (
                              <div key={preset.id}>
                                {editingPresetId === preset.id && presetDraft ? (
                                  /* 编辑模式 */
                                  <div className="rounded-xl border border-primary/40 bg-primary/5 dark:bg-primary/10 p-3 space-y-2.5">
                                    <input
                                      type="text"
                                      value={presetDraft.name}
                                      onChange={e => setPresetDraft({ ...presetDraft, name: e.target.value })}
                                      placeholder="风格名称"
                                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-primary"
                                    />
                                    <textarea
                                      value={presetDraft.systemPrompt}
                                      onChange={e => setPresetDraft({ ...presetDraft, systemPrompt: e.target.value })}
                                      placeholder="输入 system prompt…"
                                      rows={5}
                                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white resize-none focus:outline-none focus:border-primary"
                                    />
                                    <div className="flex gap-2">
                                      <button onClick={() => handleSavePreset(presetDraft)} className="flex-1 py-2 rounded-lg text-sm font-bold bg-primary text-white">保存</button>
                                      <button onClick={() => { setEditingPresetId(null); setPresetDraft(null); }} className="flex-1 py-2 rounded-lg text-sm font-bold bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-200">取消</button>
                                    </div>
                                  </div>
                                ) : (
                                  /* 展示模式 */
                                  <div
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${
                                      activePresetId === preset.id
                                        ? 'border-primary/40 bg-primary/5 dark:bg-primary/10'
                                        : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-700/40 hover:border-gray-200 dark:hover:border-gray-600'
                                    }`}
                                    onClick={() => updateSettings({ summaryActivePresetId: preset.id })}
                                  >
                                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-all ${
                                      activePresetId === preset.id ? 'bg-primary border-primary' : 'border-gray-300 dark:border-gray-500'
                                    }`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-semibold text-gray-800 dark:text-white">{preset.name}</span>
                                        {preset.isBuiltin && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-600 text-gray-400 dark:text-gray-400 font-medium">内置</span>}
                                      </div>
                                      {preset.systemPrompt
                                        ? <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{preset.systemPrompt.split('\n')[0]}</p>
                                        : <p className="text-[11px] text-gray-300 dark:text-gray-600 mt-0.5 italic">暂无 prompt，点击编辑</p>
                                      }
                                    </div>
                                    <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                      <button
                                        onClick={() => { setPresetDraft({ ...preset }); setEditingPresetId(preset.id); }}
                                        className="text-xs text-gray-400 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                      >编辑</button>
                                      {!preset.isBuiltin && (
                                        <button
                                          onClick={() => handleDeleteCustomPreset(preset.id)}
                                          className="text-xs text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >删除</button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* ── 自动撰写（v2.7.0.6，默认开）：新周期第一次打开时后台补写上一期总结 ── */}
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3 dark:border-gray-700/60">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-white">自动撰写上一期总结</div>
                        <div className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                          新的一周、一个月第一次打开时，上一期还没写就在后台写好，写完提醒你一次「可以查看了」。用当前选的风格。
                        </div>
                      </div>
                      <Toggle
                        checked={settings.summaryAutoWrite !== false}
                        onChange={(v) => updateSettings({ summaryAutoWrite: v })}
                        aria-label="自动撰写上一期总结"
                      />
                    </div>


                  </div>
                  );
                })()}

              </motion.div>
            )}
          </div>
        ))}
      </div>

      {/* P9-菜单批：用户资料卡上浮至菜单页第一屏；原位改为「账号与数据」入口
          （账号瓷砖从菜单宫格下沉至此，与主题快切上浮互为对调）。
          P4：黑斜章 + 奶油斜行（设计稿账号行制式）。 */}
      {p5 ? (
        /* P5UI/p5-settings 顶卡制式（我们的 IA 放页底）：红星方章 + 标题/副题 + ▶ */
        <motion.button
          type="button"
          whileTap={{ x: 2, y: 3 }}
          onClick={() => setCurrentPage('account')}
          className="relative block w-full cursor-pointer text-left"
        >
          <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: '#000000', clipPath: roughQuad(521, 7) }} />
          <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(522, 6) }} />
          <span className="relative flex items-center gap-3.5 px-4 py-3.5">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center" style={{ background: P5R.red, border: '2.5px solid #050505', transform: 'rotate(-3deg)', boxShadow: '2px 2px 0 #000000' }}>
              <P5Star size={22} fill="#f8f8f6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-black" style={{ color: P5R.ink, fontFamily: P5_TITLE_FONT }}>账号与数据</span>
              <span className="mt-0.5 block text-xs font-bold" style={{ color: P5R.grey }}>云同步 · 数据管理 · 备份导出</span>
            </span>
            <span aria-hidden className="h-0 w-0 border-y-[8px] border-y-transparent border-l-[12px]" style={{ borderLeftColor: '#050505' }} />
          </span>
        </motion.button>
      ) : isP4 ? (
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => setCurrentPage('account')}
          className="flex w-full items-stretch text-left"
        >
          <span
            className="z-10 flex shrink-0 items-center gap-2 px-4 py-3 font-black text-white"
            style={{ background: '#131313', borderRadius: 14, transform: 'skewX(-8deg)' }}
          >
            <span className="flex items-center gap-2" style={{ transform: 'skewX(8deg)' }}>
              <P4Flower size={16} color="var(--ui-bg)" />
              账号与数据
            </span>
          </span>
          <span
            className="-ml-2 flex min-w-0 flex-1 items-center gap-2 py-3 pl-6 pr-4"
            style={{ background: 'var(--ui-paper)', borderRadius: 14, transform: 'skewX(-8deg)' }}
          >
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2" style={{ transform: 'skewX(8deg)' }}>
              <span className="truncate text-xs font-bold text-[#131313]/75">云同步 · 数据管理 · 备份导出</span>
              <span aria-hidden className="font-black text-[#131313]">›</span>
            </span>
          </span>
        </motion.button>
      ) : (
      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => setCurrentPage('account')}
        className={p3
          ? 'w-full flex items-center gap-3 px-5 py-4 text-left'
          : 'w-full flex items-center gap-3 rounded-xl bg-white dark:bg-gray-800 shadow-lg px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700'}
        style={p3 ? { clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)', background: P3R.panelGlass, boxShadow: '0 8px 18px rgba(38,96,140,0.07)' } : undefined}
      >
        <span className="text-2xl" aria-hidden>☁️</span>
        <span className="flex-1 min-w-0">
          <span className={p3 ? 'block text-[16px] font-black' : 'block font-semibold text-gray-800 dark:text-white'} style={p3 ? { color: P3R.ink } : undefined}>账号与数据</span>
          <span className={p3 ? 'block text-xs font-semibold mt-0.5' : 'block text-xs text-gray-400 dark:text-gray-500 mt-0.5'} style={p3 ? { color: P3R.grey } : undefined}>云同步 · 数据管理 · 备份导出</span>
        </span>
        {p3 ? (
          <span aria-hidden className="h-0 w-0 border-y-[6px] border-y-transparent border-l-[9px]" style={{ borderLeftColor: P3R.blue }} />
        ) : (
          <span className="text-gray-400" aria-hidden>›</span>
        )}
      </motion.button>
      )}

      {/* 属性称号 / 预设命名两个确认弹窗：portal 到 body —— 页内渲染会被 PageShell
          的 stacking context 压在底部导航之下（见 components/ModalPortal.tsx）。
          页根的 p4/p5 毯式换肤类跟着搬：那套规则认祖先类，掉出去就是原始白卡 */}
      <ModalPortal className={`${isP4 ? 'p4-reskin' : ''} ${p5 ? 'p5-reskin' : ''}`.trim()}>
      <AnimatePresence>
        {levelTitleModalOpen && levelTitleSuggestions && (() => {
          const attrName = settings.attributeNames[activeLevelTitleConfirmMeta.id] || activeLevelTitleConfirmMeta.defaultLabel;
          const normalizedSuggestions = normalizeAttributeLevelTitles(levelTitleSuggestions, settings.levelThresholds.length);
          const currentTitles = currentLevelTitles[activeLevelTitleConfirmMeta.id];
          const suggestionTitles = normalizedSuggestions[activeLevelTitleConfirmMeta.id];
          const selectedCount = ATTRIBUTE_META.filter(meta => levelTitleSelection[meta.id]).length;
          const activeSelected = Boolean(levelTitleSelection[activeLevelTitleConfirmMeta.id]);

          return (
            <motion.div
              key="level-title-confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
              onClick={handleCloseLevelTitleModal}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 12 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md max-h-[86vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200/80 dark:border-gray-700"
              >
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/70 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: `${activeLevelTitleConfirmMeta.color}1f`, color: activeLevelTitleConfirmMeta.color }}
                  >
                    {activeLevelTitleConfirmMeta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-black text-gray-900 dark:text-white truncate">
                      确认刷新：{attrName}
                    </h3>
                    <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                      {levelTitleConfirmAttrIndex + 1} / {ATTRIBUTE_META.length} · 已选 {selectedCount} 个属性
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseLevelTitleModal}
                    disabled={levelTitleRefreshing}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 disabled:opacity-50"
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>

                <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700/60">
                  <button
                    type="button"
                    onClick={() => setLevelTitleConfirmAttrIndex(i => (i + ATTRIBUTE_META.length - 1) % ATTRIBUTE_META.length)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"
                    aria-label="上一个属性"
                  >
                    ‹
                  </button>
                  <div className="flex-1 flex justify-center gap-1.5">
                    {ATTRIBUTE_META.map((meta, index) => (
                      <button
                        key={meta.id}
                        type="button"
                        onClick={() => setLevelTitleConfirmAttrIndex(index)}
                        className={`h-1.5 rounded-full transition-all ${
                          index === levelTitleConfirmAttrIndex
                            ? 'w-5 bg-primary'
                            : levelTitleSelection[meta.id]
                              ? 'w-2.5 bg-primary/45'
                              : 'w-1.5 bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`切换到${settings.attributeNames[meta.id] || meta.defaultLabel}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setLevelTitleConfirmAttrIndex(i => (i + 1) % ATTRIBUTE_META.length)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"
                    aria-label="下一个属性"
                  >
                    ›
                  </button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto max-h-[56vh]">
                  <button
                    type="button"
                    onClick={() => handleToggleLevelTitleAttribute(activeLevelTitleConfirmMeta.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors ${
                      activeSelected
                        ? 'border-primary/45 bg-primary/5 dark:bg-primary/10'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/35'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-black ${
                      activeSelected
                        ? 'bg-primary border-primary text-white'
                        : 'border-gray-300 dark:border-gray-600 text-transparent'
                    }`}>
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-gray-800 dark:text-white">
                        刷新这个属性
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {attrName} · LV1-LV{settings.levelThresholds.length}
                      </div>
                    </div>
                  </button>

                  <div className="rounded-xl border border-gray-200/70 dark:border-gray-700/60 overflow-hidden">
                    <div className="grid grid-cols-[42px_1fr_1fr] px-3 py-2 bg-gray-50 dark:bg-gray-900/45 text-[10px] font-black text-gray-400">
                      <span>等级</span>
                      <span>当前</span>
                      <span>建议</span>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                      {settings.levelThresholds.map((_, index) => (
                        <div
                          key={`${activeLevelTitleConfirmMeta.id}-${index}`}
                          className="grid grid-cols-[42px_1fr_1fr] gap-2 px-3 py-2 text-[11px] items-center"
                        >
                          <span className="text-gray-400 font-bold tabular-nums">LV{index + 1}</span>
                          <span className="min-w-0 truncate font-semibold text-gray-700 dark:text-gray-200">
                            {currentTitles[index]}
                          </span>
                          <span className="min-w-0 truncate font-black text-primary">
                            {suggestionTitles[index]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-700/70 flex gap-2">
                  <button
                    type="button"
                    onClick={handleCloseLevelTitleModal}
                    disabled={levelTitleRefreshing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyLevelTitleSuggestions}
                    disabled={levelTitleRefreshing || selectedCount === 0}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {levelTitleRefreshing ? '应用中' : `应用 ${selectedCount} 个`}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {presetNameModalOpen && presetNameSuggestions && (() => {
          const attrName = settings.attributeNames[activePresetNameMeta.id] || activePresetNameMeta.defaultLabel;
          const attrAchievements = achievements.filter(item => (
            item.condition.type === 'attribute_level' &&
            item.condition.attribute === activePresetNameMeta.id &&
            Boolean(presetNameSuggestions.achievements[item.id])
          ));
          const attrSkills = skills.filter(item => (
            item.requiredAttribute === activePresetNameMeta.id &&
            Boolean(presetNameSuggestions.skills[item.id])
          ));
          const selectedCount =
            Object.values(presetNameSelection.achievements).filter(Boolean).length +
            Object.values(presetNameSelection.skills).filter(Boolean).length;

          return (
            <motion.div
              key="preset-name-confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
              onClick={handleClosePresetNameModal}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 12 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md max-h-[86vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200/80 dark:border-gray-700"
              >
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/70 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: `${activePresetNameMeta.color}1f`, color: activePresetNameMeta.color }}
                  >
                    {activePresetNameMeta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-black text-gray-900 dark:text-white truncate">
                      确认覆写：{attrName}
                    </h3>
                    <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                      {presetNameAttrIndex + 1} / {ATTRIBUTE_META.length} · 已选 {selectedCount} 项
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePresetNameModal}
                    disabled={presetNameRefreshing}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 disabled:opacity-50"
                    aria-label="关闭"
                  >
                    ×
                  </button>
                </div>

                <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700/60">
                  <button
                    type="button"
                    onClick={() => setPresetNameAttrIndex(i => (i + ATTRIBUTE_META.length - 1) % ATTRIBUTE_META.length)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"
                    aria-label="上一个属性"
                  >
                    ‹
                  </button>
                  <div className="flex-1 flex justify-center gap-1.5">
                    {ATTRIBUTE_META.map((meta, index) => (
                      <button
                        key={meta.id}
                        type="button"
                        onClick={() => setPresetNameAttrIndex(index)}
                        className={`h-1.5 rounded-full transition-all ${
                          index === presetNameAttrIndex ? 'w-5 bg-primary' : 'w-1.5 bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-label={`切换到${settings.attributeNames[meta.id] || meta.defaultLabel}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPresetNameAttrIndex(i => (i + 1) % ATTRIBUTE_META.length)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"
                    aria-label="下一个属性"
                  >
                    ›
                  </button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto max-h-[56vh]">
                  {attrAchievements.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-black tracking-[0.18em] text-gray-400 uppercase">
                        Achievements
                      </div>
                      {attrAchievements.map(item => {
                        const suggestion = presetNameSuggestions.achievements[item.id];
                        const selected = Boolean(presetNameSelection.achievements[item.id]);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleTogglePresetNameItem('achievements', item.id)}
                            className={`w-full rounded-xl border p-3 text-left transition-colors ${
                              selected
                                ? 'border-primary/45 bg-primary/5 dark:bg-primary/10'
                                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/35'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-black ${
                                selected
                                  ? 'bg-primary border-primary text-white'
                                  : 'border-gray-300 dark:border-gray-600 text-transparent'
                              }`}>
                                ✓
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm leading-none">{item.icon}</span>
                                  <span className="text-xs font-bold text-gray-800 dark:text-white truncate">
                                    {item.description}
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-[42px_1fr] gap-x-2 gap-y-1 text-[11px] leading-relaxed">
                                  <span className="text-gray-400">当前</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-200 truncate">{item.title}</span>
                                  <span className="text-gray-400">建议</span>
                                  <span className="font-black text-primary truncate">{suggestion}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {attrSkills.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-black tracking-[0.18em] text-gray-400 uppercase">
                        Skills
                      </div>
                      {attrSkills.map(item => {
                        const suggestion = presetNameSuggestions.skills[item.id];
                        const selected = Boolean(presetNameSelection.skills[item.id]);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleTogglePresetNameItem('skills', item.id)}
                            className={`w-full rounded-xl border p-3 text-left transition-colors ${
                              selected
                                ? 'border-primary/45 bg-primary/5 dark:bg-primary/10'
                                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/35'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center text-[11px] font-black ${
                                selected
                                  ? 'bg-primary border-primary text-white'
                                  : 'border-gray-300 dark:border-gray-600 text-transparent'
                              }`}>
                                ✓
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold text-gray-800 dark:text-white truncate">
                                    Lv.{item.requiredLevel} · {item.description}
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-[42px_1fr] gap-x-2 gap-y-1 text-[11px] leading-relaxed">
                                  <span className="text-gray-400">当前</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-200 truncate">{item.name}</span>
                                  <span className="text-gray-400">建议</span>
                                  <span className="font-black text-primary truncate">{suggestion}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {attrAchievements.length === 0 && attrSkills.length === 0 && (
                    <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
                      这一维没有可覆写的建议。
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 dark:border-gray-700/70 flex gap-2">
                  <button
                    type="button"
                    onClick={handleClosePresetNameModal}
                    disabled={presetNameRefreshing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyPresetNameSuggestions}
                    disabled={presetNameRefreshing || selectedCount === 0}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {presetNameRefreshing ? '应用中' : `应用 ${selectedCount} 项`}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
      </ModalPortal>

      {/* 恢复默认阈值确认 —— 升 ConfirmDialog 基座（AnimatePresence 在基座内，exit 可播，根治 B14） */}
      <ConfirmDialog
        isOpen={showResetThresholdsConfirm}
        icon="↺"
        title="恢复默认等级阈值？"
        description={`将等级阈值恢复为${curDifficulty === 'hard' ? '困难' : '简单'}档的 5 级默认配置。`}
        confirmText="恢复默认"
        cancelText="取消"
        onConfirm={() => {
          updateSettings({ levelThresholds: [...LEVEL_PRESETS[curDifficulty].base] });
          setShowResetThresholdsConfirm(false);
        }}
        onCancel={() => setShowResetThresholdsConfirm(false)}
      >
        {/* 富内容：默认阈值速览 + 不可逆提示 */}
        <div className="text-center">
          <div className="mx-auto inline-flex flex-wrap gap-1.5 justify-center">
            {LEVEL_PRESETS[curDifficulty].base.map((v, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary tabular-nums"
              >
                <span className="opacity-60">LV{i + 1}</span>
                {v}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-rose-500 mt-3">
            若你当前有 Lv.6 及以上自定义等级，它们会一并被清除。
          </p>
        </div>
      </ConfirmDialog>

      {/* 删除最高等级确认 —— 升 ConfirmDialog 基座（danger：危险键恒右由基座保证） */}
      <ConfirmDialog
        isOpen={deleteLevelIndex !== null}
        tone="danger"
        icon="⚠️"
        title={`移除 Lv.${(deleteLevelIndex ?? 0) + 1}？`}
        confirmText="确认移除"
        cancelText="再想想"
        onConfirm={() => {
          const idx = deleteLevelIndex;
          if (idx === null) return;
          // 安全兜底：仅允许移除最后一级，并且 index ≥ 5
          if (idx !== settings.levelThresholds.length - 1 || idx < 5) {
            setDeleteLevelIndex(null);
            return;
          }
          updateSettings({ levelThresholds: settings.levelThresholds.slice(0, -1) });
          setDeleteLevelIndex(null);
        }}
        onCancel={() => setDeleteLevelIndex(null)}
      >
        {/* 富内容：点数高亮需要内联样式，故放 children 而非 description */}
        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            这是当前的最高等级，所需点数{' '}
            <b className="text-primary tabular-nums">
              {deleteLevelIndex !== null ? settings.levelThresholds[deleteLevelIndex] ?? 0 : 0}
            </b>
            。移除后，已达到此等级的属性会回落到上一级。
          </p>
          <p className="text-[10px] text-gray-400 mt-2">
            （Lv.1–5 为系统保护等级，无法删除。）
          </p>
        </div>
      </ConfirmDialog>

      {/* 添加等级警告 —— 升 ConfirmDialog 基座。
          它实际承载"继续添加"动作（非纯信息），故保留确认/取消双按钮原语义；
          原实现"继续添加"在左侧，违反"取消恒左、主操作恒右"，由基座纠正排序 */}
      <ConfirmDialog
        isOpen={showLevelWarning}
        icon="⚠️"
        title="温馨提示"
        description="该操作不可逆：前方是未曾有人达到过的领域！"
        confirmText="继续添加"
        cancelText="取消"
        onConfirm={() => {
          // LV6-10 的默认阈值走当前难度档的 ext 表；
          // 超出 10 级或阈值被改过、算出来不比上一级大时，退回"上一级 +300"
          const last = settings.levelThresholds[settings.levelThresholds.length - 1] || 0;
          const nextLevel = settings.levelThresholds.length + 1;
          const preset = LEVEL_PRESETS[curDifficulty].ext[nextLevel - 6];
          const next = preset !== undefined && preset > last ? preset : last + 300;
          updateSettings({ levelThresholds: [...settings.levelThresholds, next] });
          setShowLevelWarning(false);
        }}
        onCancel={() => setShowLevelWarning(false)}
      />

    </motion.div>
    </P5RPage>
    </P3RPage>
  );
};
