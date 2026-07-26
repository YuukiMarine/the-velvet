import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore, DEFAULT_SUMMARY_PROMPT_PRESETS, FAMILIAR_FACE_PRESETS, toLocalDateKey, applyCustomThemeColor } from '@/store';
import { triggerThemeSwitchFeedback, playSound } from '@/utils/feedback';
import { ThemeType, AttributeId, SummaryPromptPreset, AttributeLevelTitles } from '@/types';
import { DEFAULT_LEVEL_THRESHOLDS } from '@/constants';
import { db } from '@/db';
import { PageTitle } from '@/components/PageTitle';
import { BackButton } from '@/components/BackButton';
import { useRipple } from '@/components/RippleEffect';
import { AI_PROVIDERS, getProviderConfig, testAIConnection, fetchAvailableModels, type TestResult, type ApiProvider } from '@/utils/aiProviders';
import { Toggle } from '@/components/Toggle';
import NotificationSettings from '@/components/NotificationSettings';
import { NavigatorSettings } from '@/components/navigator/NavigatorSettings';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, P3PageHeader } from '@/components/p3r/kit';
import {
  generateAttributeLevelTitles,
  normalizeAttributeLevelTitles,
  patchAttributeLevelTitle,
} from '@/utils/attributeLevelTitles';
import { generatePresetNameMatches, type PresetNameMatchResult } from '@/utils/presetNameMatcher';
import { P4Flower, P4Sparkle, P4SkyFan, P4ArcRings, P4_HEADER_BLEED } from '@/ui/p4Kit';

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
const AttributeNameField = ({
  id, icon, color, defaultLabel, value, onCommit,
}: {
  id: AttributeId;
  icon: string;
  color: string;
  defaultLabel: string;
  value: string;
  onCommit: (v: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) setDraft(value);
  }, [value]);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200/60 dark:border-gray-700/40">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
        style={{ background: `${color}1f`, color }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold tracking-[0.2em] text-gray-400 uppercase">
          {id}
        </div>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (!composingRef.current) onCommit(next);
          }}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            const next = (e.target as HTMLInputElement).value;
            setDraft(next);
            onCommit(next);
          }}
          onBlur={() => {
            // 兜底：极少数浏览器/IME 不触发 compositionEnd，用 blur 再提交一次
            if (draft !== value) onCommit(draft);
          }}
          className="w-full mt-0.5 px-0 py-0.5 bg-transparent text-sm font-bold text-gray-800 dark:text-white focus:outline-none border-b border-transparent focus:border-primary transition-colors"
          placeholder={defaultLabel}
        />
      </div>
    </div>
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
        <span className="whitespace-nowrap text-xs font-black" style={{ color: active ? '#1b57ff' : '#0a1230' }}>{theme.label}</span>
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
            background: active ? opt.color : '#ddeef7',
            boxShadow: active ? '0 8px 18px rgba(38,96,140,0.2)' : 'none',
          }}
        >
          {ripples}
          <span className="text-xl leading-none" style={{ opacity: active ? 0.95 : 0.6 }} aria-hidden>{opt.icon}</span>
          {/* 预览块斜纹（设计稿质感） */}
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `repeating-linear-gradient(115deg, transparent 0 14px, ${active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.5)'} 14px 17px)` }} />
        </span>
        <span className="whitespace-nowrap text-[11px] font-black leading-tight" style={{ color: active ? '#1b57ff' : '#0a1230' }}>{opt.label}</span>
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
  } = useAppStore();
  const isP4 = useUiChannel() === 'p4';
  const achievements = useAppStore(s => s.achievements);
  const skills = useAppStore(s => s.skills);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const [activeSection, setActiveSection] = useState<string | null>('theme');
  // P3R（蓝频道）：p3-settings-reference-v2 形态
  const p3 = useUiChannel() === 'p3';
  const [showLevelWarning, setShowLevelWarning] = useState(false);
  // 等级阈值：恢复默认 / 删除高等级 的确认弹窗
  const [showResetThresholdsConfirm, setShowResetThresholdsConfirm] = useState(false);
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
  const [summaryApiKeySaved, setSummaryApiKeySaved] = useState(false);
  const [summaryApiKeyDraft, setSummaryApiKeyDraft] = useState(settings.summaryApiKey ?? '');
  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [apiTestMessage, setApiTestMessage] = useState<string>('');
  // 可选模型列表：按当前 provider + Key + baseUrl 从 /models 拉取，拉到就变下拉，
  // 拉不到（网关不支持 / CORS）保持手填输入框兜底
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelFetchStatus, setModelFetchStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [modelFetchMessage, setModelFetchMessage] = useState<string>('');
  // 连接卡折叠：有 Key 时默认收起（配好后日常只跟模型分档打交道），无 Key 展开引导配置
  const [connOpen, setConnOpen] = useState(() => !settings.summaryApiKey?.trim());

  const handleFetchModels = async () => {
    const key = summaryApiKeyDraft.trim() || (settings.summaryApiKey ?? '');
    setModelFetchStatus('loading');
    setModelFetchMessage('');
    const result = await fetchAvailableModels({
      provider: settings.summaryApiProvider ?? 'openai',
      apiKey: key,
      baseUrl: settings.summaryApiBaseUrl,
    });
    if (result.ok) {
      setModelOptions(result.models);
      setModelFetchStatus('ok');
      setModelFetchMessage(`已拉取 ${result.models.length} 个可用模型`);
    } else {
      setModelOptions([]);
      setModelFetchStatus('error');
      setModelFetchMessage(result.error);
    }
  };

  // 换 provider / 改地址 → 旧列表作废（不同端点的模型集不通用）
  useEffect(() => {
    setModelOptions([]);
    setModelFetchStatus('idle');
    setModelFetchMessage('');
  }, [settings.summaryApiProvider, settings.summaryApiBaseUrl]);

  const handleTestApi = async () => {
    const keyToTest = summaryApiKeyDraft.trim() || (settings.summaryApiKey ?? '');
    if (!keyToTest) {
      setApiTestStatus('error');
      setApiTestMessage('请先填写 API 密钥');
      return;
    }
    setApiTestStatus('testing');
    setApiTestMessage('');
    const result: TestResult = await testAIConnection({
      provider: settings.summaryApiProvider ?? 'openai',
      apiKey: keyToTest,
      baseUrl: settings.summaryApiBaseUrl,
      model: settings.summaryModel,
    });
    if (result.ok) {
      setApiTestStatus('ok');
      setApiTestMessage(`连接成功 · ${result.model} · ${result.latencyMs} ms`);
      // 成功即落库：绿灯要能跨刷新/跨切换保留（用户口径「已配置」感知太弱）
      const pv = settings.summaryApiProvider ?? 'openai';
      updateSettings({
        aiProfiles: {
          ...(settings.aiProfiles ?? {}),
          [pv]: { ...(settings.aiProfiles?.[pv] ?? {}), key: keyToTest, verifiedAt: Date.now() },
        },
      });
    } else {
      setApiTestStatus('error');
      setApiTestMessage(result.error);
    }
  };

  // ── 多服务商存档：切胶囊 = 存回旧家 + 载入新家（生效位仍是 summaryApi* 四项）──
  const activeProvider = settings.summaryApiProvider ?? 'openai';
  const switchProvider = (next: ApiProvider) => {
    if (next === activeProvider) return;
    const profiles = { ...(settings.aiProfiles ?? {}) };
    profiles[activeProvider] = {
      ...(profiles[activeProvider] ?? {}),
      key: summaryApiKeyDraft.trim() || settings.summaryApiKey || undefined,
      baseUrl: settings.summaryApiBaseUrl,
      model: settings.summaryModel,
      navModel: settings.navigatorModel,
    };
    const inc = profiles[next] ?? {};
    updateSettings({
      aiProfiles: profiles,
      summaryApiProvider: next,
      summaryApiKey: inc.key ?? '',
      summaryApiBaseUrl: inc.baseUrl,
      summaryModel: inc.model,
      navigatorModel: inc.navModel,
    });
    setSummaryApiKeyDraft(inc.key ?? '');
    setApiTestStatus('idle');
    setApiTestMessage('');
  };

  /** 该服务商是否已存过 Key（胶囊上打勾） */
  const providerHasKey = (id: ApiProvider) =>
    id === activeProvider
      ? !!(summaryApiKeyDraft.trim() || settings.summaryApiKey?.trim())
      : !!settings.aiProfiles?.[id]?.key?.trim();
  /** 该服务商是否验证过（胶囊亮绿点） */
  const providerVerified = (id: ApiProvider) =>
    id === activeProvider
      ? apiTestStatus === 'ok' || !!settings.aiProfiles?.[id]?.verifiedAt
      : !!settings.aiProfiles?.[id]?.verifiedAt;

  const savedProviderCount = AI_PROVIDERS.filter(p => providerHasKey(p.id)).length;
  const keyDirty = summaryApiKeyDraft.trim() !== (settings.summaryApiKey ?? '').trim();
  const saveActiveKey = () => {
    const k = summaryApiKeyDraft.trim();
    const pv = activeProvider;
    updateSettings({
      summaryApiKey: k,
      aiProfiles: {
        ...(settings.aiProfiles ?? {}),
        // 改了 Key 就作废这家的绿灯，必须重新测
        [pv]: { ...(settings.aiProfiles?.[pv] ?? {}), key: k || undefined, verifiedAt: undefined },
      },
    });
    setSummaryApiKeySaved(true);
    setApiTestStatus('idle');
    setApiTestMessage('');
  };

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
  const sections = [
    { id: 'theme', label: '主题', icon: '🎨' },
    { id: 'personalize', label: '体验个性化', icon: '⚙️' },
    { id: 'navigator', label: '助手', icon: '◈' },
    { id: 'notifications', label: '通知提醒', icon: '🔔' },
    { id: 'summary', label: 'AI 总结', icon: '✨' }
  ];

  return (
    <P3RPage active={p3}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative space-y-6 ${isP4 ? 'p4-reskin' : ''}`}
    >
      {/* 顶部标题 + 返回按钮（设置从菜单宫格进入，与其他子页一致）。
          P4（p4-settings-reference-v2）：衬线特大「设置」+ 橙 Settings 手写角标 + 右上天空扇；
          p3（p3-settings 设计稿）：超大黑斜体 + 青片 + 青斜纹排 + CONFIG/SYSTEM 幽灵字 */}
      {isP4 ? (
        <div className="relative -mx-4 min-h-[146px] px-4 pb-1 pt-1" style={P4_HEADER_BLEED}>
          <P4ArcRings size={230} className="absolute -right-20 -top-24" />
          <P4SkyFan size={140} className="absolute right-0 top-0" />
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
          <GhostWords words={['CONFIG', 'SYSTEM']} className="right-[8px] top-[-14px] text-right text-[80px]" style={{ transform: 'rotate(0deg)', lineHeight: 1.04 }} />
          <P3PageHeader ticks title="设置" onBack={() => setCurrentPage('menu')} className="relative pt-2" />
          <div aria-hidden className="mt-2 flex gap-1 pl-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className="h-[8px] w-[10px]" style={{ background: i < 5 ? 'rgba(53,209,232,0.75)' : 'rgba(53,209,232,0.35)', clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
            ))}
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

      {/* P9-菜单批：用户资料卡上浮至菜单页第一屏；原位改为「账号与数据」入口
          （账号瓷砖从菜单宫格下沉至此，与主题快切上浮互为对调）。
          P4：黑斜章 + 奶油斜行（设计稿账号行制式）。 */}
      {isP4 ? (
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
        style={p3 ? { clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)', background: 'rgba(255,255,255,0.92)', boxShadow: '0 8px 18px rgba(38,96,140,0.07)' } : undefined}
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

      <div className="space-y-4">
        {sections.map(section => (
          <div
            key={section.id}
            className={
              isP4
                ? 'overflow-visible'
                : p3
                  ? 'overflow-hidden'
                  : 'bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden'
            }
            style={p3 ? { clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)', background: 'rgba(255,255,255,0.92)', boxShadow: '0 8px 18px rgba(38,96,140,0.07)' } : undefined}
          >
            {isP4 ? (
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
                    <P4Flower size={16} color="var(--ui-bg)" />
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
                <span className="text-2xl">{section.icon}</span>
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
                className={isP4 ? 'mt-2 rounded-[20px] bg-[var(--ui-paper)] px-5 pb-6 pt-4' : 'px-6 pb-6'}
                style={isP4 ? { boxShadow: '0 3px 0 rgba(19,19,19,0.12)' } : undefined}
              >
                {section.id === 'theme' && (
                  <div className="space-y-5">
                    {/* ── 子板块：颜色与声音 ─────────────────────────── */}
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700/80">
                      <span className="text-base">🎨</span>
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
                      </div>
                    )}

                    <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-white">静音模式</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">关闭后将没有声音反馈</div>
                      </div>
                      <Toggle
                        checked={!!settings.soundMuted}
                        onChange={(v) => updateSettings({ soundMuted: v })}
                        aria-label="静音模式"
                      />
                    </div>

                    {/* 音量大小滑块：仅非静音时显示 */}
                    {!settings.soundMuted && (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-800 dark:text-white">音量大小</div>
                          <span className="text-xs font-semibold tabular-nums text-primary">
                            {settings.soundVolume ?? 80}%
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-base select-none">🔈</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={settings.soundVolume ?? 80}
                            onChange={(e) => updateSettings({ soundVolume: Number(e.target.value) })}
                            className="flex-1 h-1.5 appearance-none rounded-full bg-gray-200 dark:bg-gray-600 accent-primary cursor-pointer"
                          />
                          <span className="text-base select-none">🔊</span>
                        </div>
                      </div>
                    )}

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
                      <span className="text-base">🖼️</span>
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">显示</h4>
                    </div>

                    {/* 背景动画 — 多选 toggle（p3：一行四个斜切预览块 + 块下标签，p3-settings 设计稿） */}
                    {!settings.backgroundImage && (
                      <div className={p3 ? 'space-y-3' : 'space-y-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'}>
                        <div>
                          <h4 className={p3 ? 'text-[15px] font-black' : 'font-medium text-gray-800 dark:text-white'} style={p3 ? { color: P3R.ink } : undefined}>背景动画</h4>
                          <p className={p3 ? 'text-[12px] font-semibold' : 'text-sm text-gray-600 dark:text-gray-400'} style={p3 ? { color: P3R.grey } : undefined}>可同时开启多个，跟随主题色</p>
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
                              const next = active
                                ? current.filter(v => v !== opt.value)
                                : [...current, opt.value];
                              updateSettings({ backgroundAnimation: next });
                            };
                            if (p3) {
                              return (
                                <button key={opt.value} onClick={toggle} aria-pressed={active} title={opt.desc} className="relative flex flex-col items-center gap-1.5">
                                  <span
                                    className="relative h-12 w-full overflow-hidden"
                                    style={{ clipPath: 'polygon(11px 0, 100% 0, calc(100% - 11px) 100%, 0 100%)', background: active ? P3R.blue : '#ddeef7', boxShadow: active ? '0 8px 18px rgba(27,87,255,0.22)' : 'none' }}
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

                    {/* 装饰纹理（无动画时才显示开关） */}
                    {!settings.backgroundImage && ((settings.backgroundAnimation ?? []) as string[]).length === 0 && (
                      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div>
                          <h4 className="font-medium text-gray-800 dark:text-white">装饰纹理</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">无背景图时显示细腻底纹</p>
                        </div>
                        <Toggle
                          checked={settings.backgroundPattern ?? true}
                          onChange={(v) => updateSettings({ backgroundPattern: v })}
                          aria-label="装饰纹理"
                        />
                      </div>
                    )}

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
                                style={p3 ? { clipPath: 'polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)', background: active ? P3R.blue : '#ddeef7', color: active ? '#fff' : P3R.ink } : undefined}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

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
                                updateSettings({ backgroundImage: event.target?.result as string });
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
                  </div>
                )}

                {section.id === 'personalize' && (
                  <div className="space-y-5">
                    {/* ── 子板块：属性 ────────────────────────────── */}
                    <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700/80">
                      <span className="text-base">⚙️</span>
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
                            <span className="text-base">🌊</span>
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
                            <span className="text-base">💰</span>
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

                    {/* 无气力症治疗终端开关（F3，默认关） */}
                    <div className={`rounded-xl border-2 p-4 transition-all ${
                      settings.terminalEnabled
                        ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base">✦</span>
                            <h4 className="text-sm font-bold text-gray-800 dark:text-white">治疗终端</h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold">新</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                            启动困难、失去记录勇气时的应急入口：先建愿望清单，再让终端替你拆到「最小第一步」。开启后首页出现入口。
                          </p>
                        </div>
                        <div className="flex-shrink-0 mt-0.5">
                          <Toggle
                            checked={!!settings.terminalEnabled}
                            onChange={(v) => updateSettings({ terminalEnabled: v })}
                            aria-label="治疗终端"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── 属性名称 ───────────────────────────── */}
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/30 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800/60 flex items-center gap-2">
                        <span className="text-base">🌈</span>
                        <h4 className="text-sm font-bold text-gray-800 dark:text-white">属性名称</h4>
                        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold">
                          5 维
                        </span>
                      </div>
                      <p className="px-4 pt-3 pb-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        给五个维度取个贴合你的名字，命名会立刻在整个房间里生效。
                      </p>
                      <div className="p-3 space-y-2">
                        {ATTRIBUTE_META.map(meta => (
                          <AttributeNameField
                            key={meta.id}
                            id={meta.id}
                            icon={meta.icon}
                            color={meta.color}
                            defaultLabel={meta.defaultLabel}
                            value={settings.attributeNames[meta.id]}
                            onCommit={(v) => updateSettings({
                              attributeNames: {
                                ...settings.attributeNames,
                                [meta.id]: v,
                              },
                            })}
                          />
                        ))}
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
                        <span className="text-base">📶</span>
                        <h4 className="text-sm font-bold text-gray-800 dark:text-white">等级需求</h4>
                        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold tabular-nums">
                          {settings.levelThresholds.length} / 10 级
                        </span>
                      </div>
                      <p className="px-4 pt-3 pb-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                        达到对应等级所需的累计点数（数值可随时调整；建议保持单调递增）。
                      </p>
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

                    {/* ── 子板块：关键词规则（默认收起，点击展开） ─────────────────────── */}
                    <button
                      type="button"
                      onClick={() => setKeywordRulesExpanded(v => !v)}
                      className="w-full flex items-center gap-2 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700/80 cursor-pointer text-left"
                      aria-expanded={keywordRulesExpanded}
                    >
                      <span className="text-base">🔑</span>
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
                              <span className="text-base">⚔️</span>
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

                {section.id === 'navigator' && <NavigatorSettings />}

                {section.id === 'notifications' && <NotificationSettings />}

                {section.id === 'summary' && (() => {
                  const provider = settings.summaryApiProvider ?? 'openai';
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
                                  className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all ${
                                    isActive
                                      ? 'border-primary bg-primary/8 dark:bg-primary/15'
                                      : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600'
                                  }`}
                                >
                                  <span className="text-[22px] leading-none">{face.icon}</span>
                                  <span className={`text-[11px] font-bold leading-tight text-center ${isActive ? 'text-primary' : 'text-gray-600 dark:text-gray-300'}`}>
                                    {face.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {activeFamiliar && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 px-1">
                              {familiarTaglines[activeFamiliar.id] ?? ''}
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

                    {/* ── 连接卡（provider / Key / 地址 / 测试 收进一张可折叠卡）──
                        配好后常态收起，只露一行状态；日常操作面是下面的「模型分档」。 */}
                    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setConnOpen(v => !v)}
                        aria-expanded={connOpen}
                        className={`w-full flex items-center gap-2.5 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 text-left ${connOpen ? 'border-b border-gray-100 dark:border-gray-700/60' : ''}`}
                      >
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">连接</span>
                        <span className="flex-1 min-w-0 flex items-center gap-1.5 text-xs font-semibold">
                          {settings.summaryApiKey?.trim() ? (
                            <>
                              {/* 绿灯 = 该服务商测过且成功（落库，跨刷新保留）；灰灯 = 存了 Key 但没验证过 */}
                              <span
                                aria-hidden
                                className={`h-2 w-2 shrink-0 rounded-full ${providerVerified(activeProvider)
                                  ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.9)]'
                                  : 'bg-gray-300 dark:bg-gray-600'}`}
                              />
                              <span className={`truncate ${providerVerified(activeProvider) ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'}`}>
                                {getProviderConfig(provider).label} · {providerVerified(activeProvider) ? '连接正常' : '待测试'}
                              </span>
                              {savedProviderCount > 1 && (
                                <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-px text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                  共 {savedProviderCount} 家
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 truncate">未配置 —— 展开填写 API Key</span>
                          )}
                        </span>
                        <span aria-hidden className={`shrink-0 text-gray-400 transition-transform ${connOpen ? 'rotate-180' : ''}`}>▾</span>
                      </button>
                      {connOpen && (
                      <div className="p-4 space-y-4 dark:bg-gray-800/20">

                        {/* 提供商：每家一份独立存档，点即切换（打勾=已存 Key，绿点=测过且成功） */}
                        <div className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">提供商</p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">各家 Key 独立保存，点一下即切换</p>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {AI_PROVIDERS.map(p => {
                              const isActive = provider === p.id;
                              const hasKey = providerHasKey(p.id);
                              const verified = providerVerified(p.id);
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => switchProvider(p.id)}
                                  className={`relative py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                    isActive
                                      ? 'bg-primary text-white border-primary shadow-sm'
                                      : hasKey
                                      ? 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-primary/35'
                                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                                  }`}
                                >
                                  {hasKey && (
                                    <span
                                      aria-hidden
                                      className={`absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-black leading-none ${
                                        verified
                                          ? 'bg-green-500 text-white shadow-[0_0_4px_rgba(34,197,94,0.85)]'
                                          : isActive ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-300'
                                      }`}
                                    >
                                      ✓
                                    </span>
                                  )}
                                  <div>{p.label}</div>
                                  <div className="opacity-55 font-normal mt-0.5">{p.hint}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* API Key */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{getProviderConfig(provider).label} 的 API 密钥</p>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={summaryApiKeyDraft}
                              onChange={e => { setSummaryApiKeyDraft(e.target.value); setSummaryApiKeySaved(false); setApiTestStatus('idle'); setApiTestMessage(''); }}
                              placeholder="sk-..."
                              className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                            />
                            {/* 保存态由「草稿 vs 已存值」实时推导，不再依赖一次性 state——
                                否则切页回来按钮又变回「保存」，用户以为没存上（用户上报感知弱） */}
                            <button
                              onClick={saveActiveKey}
                              disabled={!keyDirty && !!settings.summaryApiKey?.trim()}
                              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0 whitespace-nowrap ${
                                !keyDirty && settings.summaryApiKey?.trim()
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                  : 'bg-primary text-white'
                              }`}
                            >
                              {!keyDirty && settings.summaryApiKey?.trim()
                                ? (summaryApiKeySaved ? '✓ 已保存' : '✓ 已存')
                                : '保存'}
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleTestApi}
                              disabled={apiTestStatus === 'testing'}
                              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                                apiTestStatus === 'testing'
                                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                                  : apiTestStatus === 'ok'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                  : apiTestStatus === 'error'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
                                  : 'bg-primary/10 text-primary hover:bg-primary/20'
                              }`}
                            >
                              {apiTestStatus === 'testing' ? '测试中…' : apiTestStatus === 'ok' ? '✓ 连接正常' : apiTestStatus === 'error' ? '× 连接失败' : '测试连接'}
                            </button>
                            {apiTestMessage && (
                              <span className={`text-[11px] flex-1 min-w-0 leading-relaxed whitespace-pre-wrap break-words ${apiTestStatus === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`} title={apiTestMessage}>
                                {apiTestMessage}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">
                            Key 仅保存在本地设备，不会上传。测试连接成功后这家会亮绿灯（换 Key 需重新测试）。
                          </p>
                        </div>

                        {/* 高级：自定义地址（连接级配置，跟 provider/Key 同卡） */}
                        <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                          <p className="text-xs text-gray-500 dark:text-gray-400">自定义 API 地址（可选）</p>
                          <input
                            type="text"
                            value={settings.summaryApiBaseUrl ?? ''}
                            onChange={e => { updateSettings({ summaryApiBaseUrl: e.target.value || undefined }); setApiTestStatus('idle'); setApiTestMessage(''); }}
                            placeholder={getProviderConfig(provider).defaultBaseUrl}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                          />
                        </div>

                      </div>
                      )}
                    </div>

                    {/* ── 模型分档（日常操作面）：聊天用好模型，杂活用便宜模型 ── */}
                    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700/60">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">模型分档</span>
                        <button
                          onClick={handleFetchModels}
                          disabled={modelFetchStatus === 'loading'}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                            modelFetchStatus === 'loading'
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                              : modelFetchStatus === 'error'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
                              : 'bg-primary/10 text-primary hover:bg-primary/20'
                          }`}
                        >
                          {modelFetchStatus === 'loading' ? '拉取中…' : modelOptions.length ? '重新拉取列表' : '拉取模型列表'}
                        </button>
                      </div>
                      <div className="p-4 space-y-4 dark:bg-gray-800/20">

                        {/* 通用模型（解析档） */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">通用模型 · 杂活档</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">记账解析、塔罗、活动打分、成长总结等批量任务走这档，便宜够用就行。</p>
                          {modelOptions.length > 0 && (
                            <select
                              value={(settings.summaryModel ?? '') === '' ? '' : modelOptions.includes(settings.summaryModel!) ? settings.summaryModel : '__custom__'}
                              onChange={e => {
                                if (e.target.value === '__custom__') return;
                                updateSettings({ summaryModel: e.target.value || undefined });
                                setApiTestStatus('idle');
                                setApiTestMessage('');
                              }}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-primary"
                            >
                              <option value="">默认（{getProviderConfig(provider).defaultModel}）</option>
                              {modelOptions.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                              <option value="__custom__">自定义（用下方输入框）</option>
                            </select>
                          )}
                          <input
                            type="text"
                            value={settings.summaryModel ?? ''}
                            onChange={e => { updateSettings({ summaryModel: e.target.value || undefined }); setApiTestStatus('idle'); setApiTestMessage(''); }}
                            placeholder={`留空 = 默认（${getProviderConfig(provider).defaultModel}）`}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                          />
                        </div>

                        {/* 助手对话模型（对话档） */}
                        <div className="space-y-1.5 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">助手对话模型 · 对话档</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">聊天、每日问候、人格生成走这档——对话值得用更好的模型。留空则跟随通用档。</p>
                          {modelOptions.length > 0 && (
                            <select
                              value={(settings.navigatorModel ?? '') === '' ? '' : modelOptions.includes(settings.navigatorModel!) ? settings.navigatorModel : '__custom__'}
                              onChange={e => {
                                if (e.target.value === '__custom__') return;
                                updateSettings({ navigatorModel: e.target.value || undefined });
                              }}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-primary"
                            >
                              <option value="">跟随通用档（{settings.summaryModel?.trim() || getProviderConfig(provider).defaultModel}）</option>
                              {modelOptions.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                              <option value="__custom__">自定义（用下方输入框）</option>
                            </select>
                          )}
                          <input
                            type="text"
                            value={settings.navigatorModel ?? ''}
                            onChange={e => updateSettings({ navigatorModel: e.target.value || undefined })}
                            placeholder={`留空 = 跟随通用档（${settings.summaryModel?.trim() || getProviderConfig(provider).defaultModel}）`}
                            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                          />
                        </div>

                        {modelFetchMessage && (
                          <p className={`text-[11px] leading-relaxed whitespace-pre-wrap break-words ${modelFetchStatus === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                            {modelFetchMessage}
                          </p>
                        )}
                        {!settings.summaryApiKey?.trim() && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">先在上方「连接」卡里配好 API Key，再来选模型。</p>
                        )}

                      </div>
                    </div>

                  </div>
                  );
                })()}

              </motion.div>
            )}
          </div>
        ))}
      </div>

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

      {/* 恢复默认阈值确认 —— 升 ConfirmDialog 基座（AnimatePresence 在基座内，exit 可播，根治 B14） */}
      <ConfirmDialog
        isOpen={showResetThresholdsConfirm}
        icon="↺"
        title="恢复默认等级阈值？"
        description="将等级阈值恢复为系统默认的 5 级配置。"
        confirmText="恢复默认"
        cancelText="取消"
        onConfirm={() => {
          updateSettings({ levelThresholds: [...DEFAULT_LEVEL_THRESHOLDS] });
          setShowResetThresholdsConfirm(false);
        }}
        onCancel={() => setShowResetThresholdsConfirm(false)}
      >
        {/* 富内容：默认阈值速览 + 不可逆提示 */}
        <div className="text-center">
          <div className="mx-auto inline-flex flex-wrap gap-1.5 justify-center">
            {DEFAULT_LEVEL_THRESHOLDS.map((v, i) => (
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
          const last = settings.levelThresholds[settings.levelThresholds.length - 1] || 0;
          const nextLevel = settings.levelThresholds.length + 1;
          const incrementMap: Record<number, number> = {
            6: 250,
            7: 300,
            8: 350,
            9: 400,
            10: 600
          };
          const increment = incrementMap[nextLevel] ?? 50;
          updateSettings({ levelThresholds: [...settings.levelThresholds, last + increment] });
          setShowLevelWarning(false);
        }}
        onCancel={() => setShowLevelWarning(false)}
      />

    </motion.div>
    </P3RPage>
  );
};
