import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore, DEFAULT_SUMMARY_PROMPT_PRESETS, FAMILIAR_FACE_PRESETS, toLocalDateKey, applyCustomThemeColor } from '@/store';
import { triggerThemeSwitchFeedback, playSound } from '@/utils/feedback';
import { ThemeType, AttributeId, SummaryPromptPreset, AttributeLevelTitles } from '@/types';
import { DEFAULT_LEVEL_THRESHOLDS } from '@/constants';
import { db } from '@/db';
import { PageTitle } from '@/components/PageTitle';
import { exportBackup, isNative } from '@/utils/native';
import { useRipple } from '@/components/RippleEffect';
import { AI_PROVIDERS, getProviderConfig, testAIConnection, type TestResult } from '@/utils/aiProviders';
import { useCloudStore } from '@/store/cloud';
import { logout as cloudLogout } from '@/services/auth';
import { LoginModal } from '@/components/auth/LoginModal';
import { pushAll, pullAll, syncOnLogin, computeSyncDiff } from '@/services/sync';
import { LVTag } from '@/components/LVTag';
import { computeTotalLv } from '@/utils/lvTiers';
import { UserProfileCard } from '@/components/UserProfileCard';
import { TrophyIcon } from '@/components/Navigation';
import { SyncPrivacyPanel } from '@/components/auth/SyncPrivacyPanel';
import { AccountManagePanel } from '@/components/auth/AccountManagePanel';
import {
  generateAttributeLevelTitles,
  normalizeAttributeLevelTitles,
  patchAttributeLevelTitle,
} from '@/utils/attributeLevelTitles';
import { generatePresetNameMatches, type PresetNameMatchResult } from '@/utils/presetNameMatcher';

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

/** 将一个过去的时间格式化为 "刚刚 / N 分钟前 / N 小时前 / N 天前" */
const formatRelative = (date: Date): string => {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};


// ── 主题颜色按钮（带涟漪点击反馈） ───────────────────────────
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

// ── 开屏动画选项卡（带涟漪点击反馈） ─────────────────────────
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
    resetAllData,
    importData,
    loadData
  } = useAppStore();
  const attributes = useAppStore(s => s.attributes);
  const achievements = useAppStore(s => s.achievements);
  const skills = useAppStore(s => s.skills);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const totalLv = computeTotalLv(attributes);
  const [activeSection, setActiveSection] = useState<string | null>('theme');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
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
  // LV 徽章点击展开总点数明细
  const [showPointsBreakdown, setShowPointsBreakdown] = useState(false);
  // UserID 复制到剪贴板的轻提示
  const [userIdCopied, setUserIdCopied] = useState(false);
  // 账号管理面板
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // 读取当前主题主色（用于成就入口行的辉光），并跟随 data-theme / 自定义色变化
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  useEffect(() => {
    const readColor = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary')
        .trim();
      if (raw) setPrimaryColor(raw);
    };
    readColor();
    const obs = new MutationObserver(readColor);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    });
    return () => obs.disconnect();
  }, []);

  // 云同步
  const cloudEnabled = useCloudStore(s => s.cloudEnabled);
  const cloudUser = useCloudStore(s => s.cloudUser);
  const syncStatus = useCloudStore(s => s.syncStatus);
  const lastSyncAt = useCloudStore(s => s.lastSyncAt);
  const lastCloudError = useCloudStore(s => s.lastError);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [syncChoiceOpen, setSyncChoiceOpen] = useState(false);

  // 复制到剪贴板状态
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  // 下载后显示的蓝链
  const [downloadLink, setDownloadLink] = useState<{ url: string; filename: string; size: string } | null>(null);
  const downloadLinkUrlRef = useRef<string | null>(null); // keep URL alive until replaced
  // 导入文本框（用于粘贴 JSON）


  const themes: { value: ThemeType; label: string; color: string }[] = [
    { value: 'blue', label: '蓝色', color: '#3B82F6' },
    { value: 'yellow', label: '黄色', color: '#F59E0B' },
    { value: 'red', label: '红色', color: '#EF4444' },
    { value: 'pink', label: '粉色', color: '#EC4899' },
    { value: 'custom', label: '自定义', color: settings.customThemeColor || '#1c1c1c' }
  ];
  const [customColorDraft, setCustomColorDraft] = useState(settings.customThemeColor || '#1c1c1c');

  const sizeOf = (s: string) => {
    const bytes = new Blob([s]).size;
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const handleDownload = async () => {
    const jsonString = await buildExportJson();
    const filename = `velvet-room-backup-${toLocalDateKey()}.json`;
    try {
      const result = await exportBackup(filename, jsonString);
      if (result) {
        // Web 端：返回 Blob 下载链接
        if (downloadLinkUrlRef.current) URL.revokeObjectURL(downloadLinkUrlRef.current);
        downloadLinkUrlRef.current = result.url;
        setDownloadLink(result);
        setExportMessage(null);
      } else {
        // 原生端：分享面板已弹出，给一个友好提示
        setExportMessage('分享面板已打开，请选择保存位置（文件管理 / 云盘 / 邮件 等）');
        setDownloadLink(null);
      }
    } catch (err) {
      setExportMessage(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCopy = async () => {
    const jsonString = await buildExportJson();
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopyState('ok');
      setExportMessage(`已复制到剪贴板（${sizeOf(jsonString)}）`);
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('err');
      setExportMessage('复制失败，请尝试下载');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  };



  const handleResetData = async () => {
    await resetAllData();
    setShowResetConfirm(false);
  };

  // ── 构建导出数据 JSON 字符串（抽出公共逻辑）────────────────
  const buildExportJson = useCallback(async (): Promise<string> => {
    const rawSettings = await db.settings.toArray();
    const sanitizedSettings = rawSettings.map(s => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { backgroundImage: _bg, openaiApiKey: _key, summaryApiKey: _sk, ...rest } = s as typeof s & { backgroundImage?: string; openaiApiKey?: string; summaryApiKey?: string };
      return rest;
    });
    // 用户表：剔除 base64 头像（体积太大；导入后可重新上传）
    const sanitizedUsers = (await db.users.toArray()).map(u => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { avatarDataUrl: _av, ...rest } = u as typeof u & { avatarDataUrl?: string };
      return rest;
    });
    // 同伴表：剔除长按上传的自定义头像（同理体积较大，且语义上属于本地私有）
    const sanitizedConfidants = (await db.confidants.toArray()).map(c => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { customAvatarDataUrl: _av, ...rest } = c as typeof c & { customAvatarDataUrl?: string };
      return rest;
    });
    const data = {
      user: sanitizedUsers,
      attributes: await db.attributes.toArray(),
      activities: await db.activities.toArray(),
      achievements: await db.achievements.toArray(),
      skills: await db.skills.toArray(),
      settings: sanitizedSettings,
      todos: await db.todos.toArray(),
      todoCompletions: await db.todoCompletions.toArray(),
      // 逆影战场数据（v3 新增，导入时向后兼容）
      personas: await db.personas.toArray(),
      shadows: await db.shadows.toArray(),
      battleStates: await db.battleStates.toArray(),
      // 星象 / 塔罗（v4 新增）
      dailyDivinations: await db.dailyDivinations.toArray(),
      longReadings: await db.longReadings.toArray(),
      summaries: await db.summaries.toArray(),
      weeklyGoals: await db.weeklyGoals.toArray(),
      // 同伴（v5 新增）
      confidants: sanitizedConfidants,
      confidantEvents: await db.confidantEvents.toArray(),
      // 谏言归档摘要（v6 新增；聊天原文永不落盘，所以此处不包含 counselSessions）
      counselArchives: await db.counselArchives.toArray(),
      _exportedAt: new Date().toISOString(),
      _version: 6,
    };
    const json = JSON.stringify(data);
    // 出口校验：确保产生的 JSON 字符串可被原样解析回来。
    // 这能捕获 Invalid Date、非 finite 数字等极少数能让 JSON.stringify 产出"坏行"的场景，
    // 避免用户导出的备份到了导入端才发现解析失败。
    try {
      JSON.parse(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`导出 JSON 生成失败：${msg}。请反馈给开发者（此问题需要定位具体哪条记录异常）`);
    }
    return json;
  }, []);



  // 处理文件选择或粘贴导入
  const handleImportData = async () => {
    if (!importJson.trim()) return;
    setImportLoading(true);
    try {
      await importData(importJson);
      setImportJson('');
      setExportMessage('导入成功！数据已恢复。');
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImportLoading(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      setExportMessage('请选择 JSON 格式的备份文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      if (text) setImportJson(text);
    };
    reader.readAsText(file, 'utf-8');
  };


  // ── AI 总结设置状态 ─────────────────────────────────────
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState<SummaryPromptPreset | null>(null);
  const [summaryApiKeySaved, setSummaryApiKeySaved] = useState(false);
  const [summaryApiKeyDraft, setSummaryApiKeyDraft] = useState(settings.summaryApiKey ?? '');
  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [apiTestMessage, setApiTestMessage] = useState<string>('');

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
    } else {
      setApiTestStatus('error');
      setApiTestMessage(result.error);
    }
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

  const sections = [
    { id: 'theme', label: '主题', icon: '🎨' },
    { id: 'personalize', label: '体验个性化', icon: '⚙️' },
    { id: 'summary', label: 'AI 总结', icon: '✨' },
    { id: 'data', label: '数据管理', icon: '💾' },
    { id: 'cloud', label: '云同步', icon: '☁️' },
    { id: 'about', label: '关于', icon: '💡' }
  ];

  // ── 成就入口的"待解锁"高亮判定 ─────────────────────────
  // 简化逻辑：只统计"基础属性条件已满足、但尚未解锁"的成就/技能；
  // 复杂条件（连续天数、关键字命中数、暗影击败等）需要更重的计算，
  // 此处只做轻量提示，详细进度仍以成就页为准。
  const pendingSkillsCount = skills.filter(s => {
    // 馆长的赐福（blessing_*）由用户手动开/关，不算"待解锁"
    if (s.id.startsWith('blessing_')) return false;
    const attr = attributes.find(a => a.id === s.requiredAttribute);
    return !!attr && attr.level >= s.requiredLevel && !s.unlocked;
  }).length;
  const pendingAchievementsCount = achievements.filter(a => {
    if (a.unlocked) return false;
    switch (a.condition.type) {
      case 'attribute_level': {
        const attr = attributes.find(x => x.id === a.condition.attribute);
        return !!attr && attr.level >= a.condition.value;
      }
      case 'total_points':
        return attributes.reduce((s, x) => s + (x.points ?? 0), 0) >= a.condition.value;
      case 'all_attributes_max':
        return attributes.filter(x => x.level >= a.condition.value).length >= attributes.length;
      default:
        return false;
    }
  }).length;
  const totalPendingUnlocks = pendingSkillsCount + pendingAchievementsCount;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <PageTitle title="设置" en="Settings" />

      {/* 用户资料卡（头像 / 用户名 / LV / 五维） */}
      <UserProfileCard />

      {/* ── 成就入口行（取代 dock 中的成就 tab） ─────────────────── */}
      <motion.button
        whileTap={{ scale: 0.985 }}
        onClick={() => { triggerThemeSwitchFeedback(user?.theme ?? 'blue'); setCurrentPage('achievements'); }}
        className="group relative w-full overflow-hidden rounded-2xl px-5 py-4 flex items-center gap-4 text-left transition-all border bg-white dark:bg-gray-800"
        style={{
          // 高亮态用更强的主题色辉光；常态用 ~15% 透明度
          background: totalPendingUnlocks > 0
            ? `linear-gradient(90deg, ${primaryColor}26 0%, ${primaryColor}14 35%, transparent 100%)`
            : undefined,
          borderColor: totalPendingUnlocks > 0 ? `${primaryColor}80` : `${primaryColor}33`,
          boxShadow: totalPendingUnlocks > 0
            ? `0 0 26px -6px ${primaryColor}8c, 0 0 0 1px ${primaryColor}2e`
            : `0 0 22px -6px ${primaryColor}26, 0 0 0 1px ${primaryColor}0a`,
        }}
      >
        {/* 高亮态下的扫光：从全屏左侧扫到全屏右侧 */}
        {/* 元素自身宽度为父容器的 40% → 用 translateX 走 -100% → +250% 才能完整跨过父容器 */}
        {totalPendingUnlocks > 0 && (
          <motion.div
            aria-hidden
            className="absolute inset-y-0 left-0 pointer-events-none"
            initial={{ x: '-100%' }}
            animate={{ x: '250%' }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.6 }}
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
              width: '40%',
            }}
          />
        )}

        {/* 图标 */}
        <div
          className="relative flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
          style={{
            background: totalPendingUnlocks > 0
              ? `linear-gradient(135deg, ${primaryColor}, ${primaryColor}d9)`
              : `${primaryColor}1a`,
            color: totalPendingUnlocks > 0 ? '#fff' : primaryColor,
            boxShadow: totalPendingUnlocks > 0
              ? `0 4px 14px -2px ${primaryColor}66`
              : undefined,
          }}
        >
          <TrophyIcon filled={totalPendingUnlocks > 0} />
          {totalPendingUnlocks > 0 && (
            <motion.span
              aria-hidden
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.15, 1] }}
              transition={{ duration: 0.4 }}
            >
              {totalPendingUnlocks > 99 ? '99+' : totalPendingUnlocks}
            </motion.span>
          )}
        </div>

        {/* 文案 */}
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-base font-bold ${
                totalPendingUnlocks > 0 ? '' : 'text-gray-800 dark:text-white'
              }`}
              style={totalPendingUnlocks > 0 ? { color: primaryColor } : undefined}
            >成就 / 技能</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              Achievements
            </span>
          </div>
          <div
            className={`text-[11px] mt-0.5 ${
              totalPendingUnlocks > 0
                ? 'font-semibold'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            style={totalPendingUnlocks > 0 ? { color: primaryColor } : undefined}
          >
            {totalPendingUnlocks > 0
              ? `有 ${totalPendingUnlocks} 项已达成 · 点击前往领取`
              : '查看进度 / 解锁里程碑 / 切换赐福'}
          </div>
        </div>

        {/* 右侧箭头 */}
        <span
          className={`relative flex-shrink-0 text-lg leading-none transition-transform group-hover:translate-x-0.5 ${
            totalPendingUnlocks > 0 ? '' : 'text-gray-400 dark:text-gray-500'
          }`}
          style={totalPendingUnlocks > 0 ? { color: primaryColor } : undefined}
        >
          ›
        </span>
      </motion.button>

      <div className="space-y-4">
        {sections.map(section => (
          <div key={section.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            <motion.button
              onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{section.icon}</span>
                <span className="font-semibold text-gray-800 dark:text-white">{section.label}</span>
              </div>
              <span className="text-gray-400">
                {activeSection === section.id ? '▲' : '▼'}
              </span>
            </motion.button>

            {activeSection === section.id && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                className="px-6 pb-6"
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
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!settings.soundMuted}
                          onChange={(e) => updateSettings({ soundMuted: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:bg-primary"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                      </label>
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
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => updateSettings({ darkMode: !settings.darkMode })}
                        className={`w-14 h-8 rounded-full transition-colors ${
                          settings.darkMode ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                      >
                        <motion.div
                          animate={{ x: settings.darkMode ? 24 : 4 }}
                          className="w-6 h-6 bg-white rounded-full shadow-md"
                        />
                      </motion.button>
                    </div>

                    {/* ── 子板块：显示 ────────────────────────────── */}
                    <div className="flex items-center gap-2 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700/80">
                      <span className="text-base">🖼️</span>
                      <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">显示</h4>
                    </div>

                    {/* 背景动画 — 多选 toggle */}
                    {!settings.backgroundImage && (
                      <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div>
                          <h4 className="font-medium text-gray-800 dark:text-white">背景动画</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">可同时开启多个，跟随主题色</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: 'aurora',    label: '极光',   desc: '柔和色块漂移' },
                            { value: 'particles', label: '粒子',   desc: '浮尘缓慢上升' },
                            { value: 'wave',      label: '渐变波', desc: '流动色彩背景' },
                            { value: 'pulse',     label: '脉冲',   desc: '网格线呼吸' },
                          ]).map(opt => {
                            const current = (settings.backgroundAnimation ?? []) as string[];
                            const active = current.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  const next = active
                                    ? current.filter(v => v !== opt.value)
                                    : [...current, opt.value];
                                  updateSettings({ backgroundAnimation: next });
                                }}
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
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => updateSettings({ backgroundPattern: !(settings.backgroundPattern ?? true) })}
                          className={`w-14 h-8 rounded-full transition-colors ${
                            (settings.backgroundPattern ?? true) ? 'bg-primary' : 'bg-gray-300'
                          }`}
                        >
                          <motion.div
                            animate={{ x: (settings.backgroundPattern ?? true) ? 24 : 4 }}
                            className="w-6 h-6 bg-white rounded-full shadow-md"
                          />
                        </motion.button>
                      </div>
                    )}

                    {/* 开屏动画 */}
                    <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-800 dark:text-white">开屏动画</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">启动时的过场风格与速率</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
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
                        <span className="text-sm text-gray-600 dark:text-gray-400 flex-shrink-0">速率</span>
                        <div className="flex gap-2">
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
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                                  active
                                    ? 'border-primary bg-primary text-white'
                                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                }`}
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
                        <button
                          onClick={() => {
                            const enabling = !settings.countercurrentEnabled;
                            updateSettings({
                              countercurrentEnabled: enabling,
                              // Record the date it was enabled so the 3-day window starts from tomorrow
                              countercurrentEnabledAt: enabling ? toLocalDateKey() : settings.countercurrentEnabledAt,
                            });
                          }}
                          className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors mt-0.5 ${
                            settings.countercurrentEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              settings.countercurrentEnabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
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

                    {/* ── API 配置卡片 ── */}
                    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
                      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700/60">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">API 配置</span>
                      </div>
                      <div className="p-4 space-y-4 dark:bg-gray-800/20">

                        {/* 提供商 */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">提供商</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {AI_PROVIDERS.map(p => (
                              <button
                                key={p.id}
                                onClick={() => { updateSettings({ summaryApiProvider: p.id }); setApiTestStatus('idle'); setApiTestMessage(''); }}
                                className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                                  provider === p.id
                                    ? 'bg-primary text-white border-primary shadow-sm'
                                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                                }`}
                              >
                                <div>{p.label}</div>
                                <div className="opacity-55 font-normal mt-0.5">{p.hint}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* API Key */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">API 密钥</p>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={summaryApiKeyDraft}
                              onChange={e => { setSummaryApiKeyDraft(e.target.value); setSummaryApiKeySaved(false); setApiTestStatus('idle'); setApiTestMessage(''); }}
                              placeholder="sk-..."
                              className="flex-1 min-w-0 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                            />
                            <button
                              onClick={() => { updateSettings({ summaryApiKey: summaryApiKeyDraft }); setSummaryApiKeySaved(true); }}
                              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0 whitespace-nowrap ${
                                summaryApiKeySaved
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                  : 'bg-primary text-white'
                              }`}
                            >
                              {summaryApiKeySaved ? '✓ 已保存' : '保存'}
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
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">Key 仅保存在本地设备，不会上传。测试前请先保存 Key。</p>
                        </div>

                        {/* 高级：URL + 模型 */}
                        <div className="space-y-3 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">高级选项（可选）</p>
                          <div className="space-y-1.5">
                            <p className="text-xs text-gray-500 dark:text-gray-400">自定义 API 地址</p>
                            <input
                              type="text"
                              value={settings.summaryApiBaseUrl ?? ''}
                              onChange={e => { updateSettings({ summaryApiBaseUrl: e.target.value || undefined }); setApiTestStatus('idle'); setApiTestMessage(''); }}
                              placeholder={getProviderConfig(provider).defaultBaseUrl}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <p className="text-xs text-gray-500 dark:text-gray-400">模型名称</p>
                            <input
                              type="text"
                              value={settings.summaryModel ?? ''}
                              onChange={e => { updateSettings({ summaryModel: e.target.value || undefined }); setApiTestStatus('idle'); setApiTestMessage(''); }}
                              placeholder={getProviderConfig(provider).defaultModel}
                              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                            />
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>
                  );
                })()}

                {section.id === 'data' && (
                  <div className="space-y-5">
                    {/* 消息提示 */}
                    {exportMessage && (
                      <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200">
                        <div className="flex items-start justify-between gap-2">
                          <span className="leading-snug">{exportMessage}</span>
                          <button onClick={() => setExportMessage(null)} className="text-gray-400 flex-shrink-0 mt-0.5">✕</button>
                        </div>
                      </div>
                    )}

                    {/* 非安卓端提示 */}
                    {!isNative() && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                        数据保存在本地，已构建防护但以防万一如需清理浏览器缓存请注意备份数据哦
                      </p>
                    )}

                    {/* 导出 */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">备份导出</p>
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={handleDownload}
                          className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3 rounded-xl font-semibold text-sm flex flex-col items-center gap-0.5"
                        >
                          <span>{isNative() ? '📤' : '💾'}</span>
                          <span>{isNative() ? '分享备份' : '下载备份'}</span>
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={handleCopy}
                          className={`py-3 rounded-xl font-semibold text-sm flex flex-col items-center gap-0.5 transition-colors ${
                            copyState === 'ok'
                              ? 'bg-emerald-500 text-white'
                              : copyState === 'err'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
                              : 'bg-primary text-white'
                          }`}
                        >
                          <span>{copyState === 'ok' ? '✓' : '📋'}</span>
                          <span>{copyState === 'ok' ? '已复制' : '复制 JSON'}</span>
                        </motion.button>
                      </div>

                      {/* 下载完成后显示可点击蓝链 */}
                      {downloadLink && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                          <span className="text-base">📄</span>
                          <div className="flex-1 min-w-0">
                            <a
                              href={downloadLink.url}
                              download={downloadLink.filename}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-2 truncate block"
                            >
                              {downloadLink.filename}
                            </a>
                            <span className="text-xs text-gray-400 dark:text-gray-500">{downloadLink.size} · 点击打开或另存为</span>
                          </div>
                          <button onClick={() => setDownloadLink(null)} className="text-gray-400 flex-shrink-0 text-sm">✕</button>
                        </div>
                      )}

                      <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                        背景图与 API Key 不含在备份中。
                      </p>
                    </div>

                    {/* 导入 */}
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">从备份恢复</p>

                      {/* 粘贴文本导入 */}
                      <textarea
                        rows={4}
                        placeholder='粘贴备份 JSON 文本（以 {"user":... 开头）'
                        value={importJson}
                        onChange={e => setImportJson(e.target.value)}
                        className="w-full px-3 py-2.5 text-xs border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-800 dark:text-white resize-none focus:outline-none focus:border-primary font-mono"
                      />

                      {/* 文件上传区 */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
                      />
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3.5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-primary hover:text-primary dark:hover:border-primary dark:hover:text-primary transition-colors"
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
                      >
                        {importJson ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ 文件已加载</span>
                        ) : isNative() ? (
                          <span>📁 从文件管理器选择备份文件</span>
                        ) : (
                          <span>📁 选择备份文件 <span className="opacity-60">或拖拽</span></span>
                        )}
                      </motion.button>

                      {importJson && (
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={handleImportData}
                          disabled={importLoading}
                          className="w-full bg-emerald-500 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-60"
                        >
                          {importLoading ? '正在导入…' : '确认导入（会覆盖当前数据）'}
                        </motion.button>
                      )}

                      <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                        ⚠️ 导入会清空并覆盖当前所有数据，操作前请先导出备份。
                      </p>
                    </div>

                    {/* 重置 */}
                    <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 mb-2">危险区域</p>
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setShowResetConfirm(true)}
                        className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 py-3 rounded-xl font-semibold text-sm"
                      >
                        重置所有数据
                      </motion.button>
                      <p className="text-xs text-red-400 dark:text-red-500 mt-1.5">
                        删除全部数据，无法恢复。
                      </p>
                    </div>
                  </div>
                )}

                {section.id === 'cloud' && (
                  <div className="space-y-4">
                    {!cloudEnabled ? (
                      <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                          云同步功能未配置。如需启用，请在 <code className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 font-mono text-xs">.env.local</code> 中设置 <code className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 font-mono text-xs">VITE_PB_URL</code>。
                        </p>
                      </div>
                    ) : !cloudUser ? (
                      <>
                        <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            登录后，您在本机的数据可以同步到云端，让多台设备共享同一份成长记录。
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            — 登录仅需邮箱验证码，不需要密码 —
                          </p>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setShowLoginModal(true)}
                          className="w-full py-3 rounded-lg font-medium text-white"
                          style={{
                            background: 'linear-gradient(135deg, #7c3aed, #6d28d9, #4f46e5)',
                            boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
                          }}
                        >
                          登录云端
                        </motion.button>
                      </>
                    ) : (
                      <>
                        <div className="p-4 rounded-lg bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-800">
                          <div className="flex items-center gap-3 mb-3">
                            {/* 与顶部 UserProfileCard 保持一致：本地用户头像 */}
                            <div
                              className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center text-xl font-bold text-white flex-shrink-0 ring-2 ring-white/60 dark:ring-white/10"
                              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                            >
                              {user?.avatarDataUrl ? (
                                <img src={user.avatarDataUrl} alt={user.name} className="w-full h-full object-cover" />
                              ) : (
                                (user?.name || (cloudUser.nickname as string) || (cloudUser.email as string) || '?')[0].toUpperCase()
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-800 dark:text-white truncate">
                                {user?.name || (cloudUser.nickname as string) || '未命名的客人'}
                              </div>
                              {cloudUser.username ? (
                                <button
                                  onClick={() => {
                                    const uid = cloudUser.username as string;
                                    navigator.clipboard?.writeText(uid).catch(() => {});
                                    setUserIdCopied(true);
                                    setTimeout(() => setUserIdCopied(false), 1500);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 truncate max-w-full"
                                  title="点击复制"
                                >
                                  <span className="opacity-70">@</span>
                                  <span className="font-mono font-semibold truncate">{cloudUser.username as string}</span>
                                  <span className="text-[10px] opacity-70">
                                    {userIdCopied ? '✓ 已复制' : '· 点击复制'}
                                  </span>
                                </button>
                              ) : null}
                              <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                ☁ {cloudUser.email as string}
                              </div>
                            </div>
                            {/* 齿轮：账号管理入口（UserID 未设置时打红点） */}
                            <button
                              onClick={() => setAccountPanelOpen(true)}
                              className="relative w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
                              aria-label="账号管理"
                              title="账号管理"
                            >
                              <span className="text-sm">⚙</span>
                              {!cloudUser.username && (
                                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-gray-900" />
                              )}
                            </button>
                          </div>

                          {/* 未设置 UserID 的横幅提示 */}
                          {!cloudUser.username && (
                            <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                              <span className="text-sm leading-none mt-0.5">⚠</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 leading-relaxed">
                                  你还没设置 UserID，好友系统无法找到你。
                                </div>
                                <button
                                  onClick={() => setAccountPanelOpen(true)}
                                  className="mt-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 underline hover:opacity-80"
                                >
                                  现在就设一个 →
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2 relative">
                            <button
                              onClick={() => setShowPointsBreakdown(v => !v)}
                              className="focus:outline-none"
                              aria-label="查看总点数"
                            >
                              <LVTag level={totalLv} size="md" subdued />
                            </button>
                            <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                              {syncStatus === 'syncing' ? '同步中…' : lastSyncAt ? `最近同步：${formatRelative(lastSyncAt)}` : '尚未同步'}
                            </span>
                            {showPointsBreakdown && (
                              <motion.div
                                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="absolute left-0 top-full mt-2 z-30 w-64 p-3 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <div className="text-[9px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase">总点数</div>
                                    <div className="text-xl font-black text-primary tabular-nums leading-tight">
                                      {attributes.reduce((sum, a) => sum + (a.points ?? 0), 0)}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => setShowPointsBreakdown(false)}
                                    className="w-6 h-6 rounded-md text-gray-400 dark:text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center"
                                  >✕</button>
                                </div>
                                <div className="space-y-1 pt-1.5 border-t border-gray-100 dark:border-gray-700">
                                  {attributes.map(a => (
                                    <div key={a.id} className="flex items-center justify-between text-[11px]">
                                      <span className="text-gray-600 dark:text-gray-300 font-medium">{a.displayName}</span>
                                      <span className="text-gray-800 dark:text-gray-100 font-bold tabular-nums">
                                        {a.points}
                                        <span className="text-[9px] text-gray-400 dark:text-gray-500 ml-1">· Lv.{a.level}</span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </div>

                        {lastCloudError && syncStatus === 'error' && (
                          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                            同步失败：{lastCloudError}
                          </div>
                        )}

                        {/* 同步 / 拉取 两个主按钮一行排列 */}
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            disabled={syncStatus === 'syncing'}
                            onClick={async () => {
                              console.log('[velvet-sync] push clicked');
                              try {
                                await pushAll();
                                console.log('[velvet-sync] push done');
                              } catch (err) {
                                console.error('[velvet-sync] push failed:', err);
                              }
                            }}
                            className="py-2.5 rounded-lg font-medium text-sm text-white disabled:opacity-50"
                            style={{
                              background: 'linear-gradient(135deg, #7c3aed, #6d28d9, #4f46e5)',
                              boxShadow: '0 2px 10px rgba(124,58,237,0.25)',
                            }}
                          >
                            {syncStatus === 'syncing' ? '同步中…' : '立即同步到云端'}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            disabled={syncStatus === 'syncing'}
                            onClick={() => setSyncChoiceOpen(true)}
                            className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            ↓ 拉取
                          </motion.button>
                        </div>

                        <button
                          disabled={syncStatus === 'syncing'}
                          onClick={async () => {
                            try {
                              const diff = await computeSyncDiff();
                              if (diff) {
                                useCloudStore.getState().setDiffWarning(diff);
                              }
                            } catch (err) {
                              console.error('[velvet-sync] diff check failed:', err);
                            }
                          }}
                          className="w-full py-2 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50 border border-dashed border-gray-200 dark:border-gray-700"
                        >
                          检查条目差异（避免误覆盖）
                        </button>

                        {/* 同步隐私：按类目选择上传哪些数据 */}
                        <SyncPrivacyPanel
                          excluded={settings.syncExcludedTables ?? []}
                          syncConfidantsToCloud={settings.syncConfidantsToCloud}
                          syncCloudApiKey={settings.syncCloudApiKey}
                          onChange={(patch) => updateSettings(patch)}
                        />

                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setShowLogoutConfirm(true)}
                          className="w-full py-2.5 rounded-lg font-medium text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          退出登录
                        </motion.button>
                      </>
                    )}
                  </div>
                )}

                {section.id === 'about' && (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <div className="text-5xl mb-4">🦋</div>
                      <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">靛蓝色房间</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Persona Growth Tracker</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">v2.1</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">作者</span>
                        <span className="text-sm font-medium text-gray-800 dark:text-white">IIInk</span>
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-600"></div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">GitHub</span>
                        <a
                          href="https://github.com/YuukiMarine"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          @YuukiMarine
                        </a>
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-600"></div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Bilibili</span>
                        <a
                          href="https://space.bilibili.com/15727079"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          @IIInk
                        </a>
                      </div>
                    </div>
                    <p className="text-xs text-center text-gray-400 dark:text-gray-500 leading-relaxed">
                      100%用爱发电，用得习惯欢迎点个star或者关注b站获取更新动态喵
                    </p>
                    <p className="text-xs text-center text-gray-400 dark:text-gray-500">
                      I am thou, thou art I...
                    </p>
                  </div>
                )}

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

      {/* 重置确认弹窗 */}
      {showResetConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <h3 className="text-xl font-bold mb-4 text-red-600 dark:text-red-400">
              确认重置数据
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              此操作将删除所有用户数据，包括：
              <br />• 所有行为记录
              <br />• 所有成就进度
              <br />• 所有技能解锁
              <br />• 所有属性进度
              <br />
              <strong className="text-red-500">此操作无法撤销！</strong>
            </p>
            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleResetData}
                className="flex-1 bg-red-500 text-white py-3 rounded-lg font-medium"
              >
                确认重置
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 bg-gray-500 text-white py-3 rounded-lg font-medium"
              >
                取消
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* 恢复默认阈值确认 */}
      {showResetThresholdsConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowResetThresholdsConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-3xl mb-2">↺</div>
              <h3 className="text-base font-bold text-gray-800 dark:text-white mb-2">恢复默认等级阈值？</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                将等级阈值恢复为系统默认的 5 级配置。
              </p>
              <div className="mt-3 mx-auto inline-flex flex-wrap gap-1.5 justify-center">
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
            <div className="flex gap-2 mt-5">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowResetThresholdsConfirm(false)}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 rounded-xl text-sm font-semibold"
              >
                取消
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  updateSettings({ levelThresholds: [...DEFAULT_LEVEL_THRESHOLDS] });
                  setShowResetThresholdsConfirm(false);
                }}
                className="flex-1 bg-primary text-white py-2 rounded-xl text-sm font-bold"
              >
                恢复默认
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* 删除高等级确认 */}
      {deleteLevelIndex !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteLevelIndex(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-3xl mb-2">⚠️</div>
              <h3 className="text-base font-bold text-gray-800 dark:text-white mb-1.5">
                移除 Lv.{deleteLevelIndex + 1}？
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                这是当前的最高等级，所需点数 <b className="text-primary tabular-nums">{settings.levelThresholds[deleteLevelIndex] ?? 0}</b>。移除后，已达到此等级的属性会回落到上一级。
              </p>
              <p className="text-[10px] text-gray-400 mt-2">
                （Lv.1–5 为系统保护等级，无法删除。）
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setDeleteLevelIndex(null)}
                className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 rounded-xl text-sm font-semibold"
              >
                再想想
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
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
                className="flex-1 bg-rose-500 text-white py-2 rounded-xl text-sm font-bold shadow-md"
              >
                确认移除
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {showLevelWarning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">温馨提示</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                该操作不可逆：前方是未曾有人达到过的领域！
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
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
                className="flex-1 bg-primary text-white py-2 rounded-lg font-medium"
              >
                继续添加
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowLevelWarning(false)}
                className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 py-2 rounded-lg font-medium"
              >
                取消
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* 云同步登录弹窗 */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        origin="settings"
        onSuccess={async () => {
          try {
            const result = await syncOnLogin();
            if (result === 'conflict') {
              useCloudStore.getState().setConflictPending(true);
            }
          } catch {
            /* already recorded to cloudStore.lastError */
          }
        }}
      />

      {/* 账号管理面板（齿轮入口） */}
      <AccountManagePanel
        isOpen={accountPanelOpen}
        onClose={() => setAccountPanelOpen(false)}
      />

      {/* 从云端拉取确认（会覆盖本机数据） */}
      {syncChoiceOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSyncChoiceOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              从云端拉取数据？
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
              会用云端数据**覆盖本机**。如果本机有未同步的改动，请先点"立即同步到云端"。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSyncChoiceOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  setSyncChoiceOpen(false);
                  console.log('[velvet-sync] pull clicked');
                  try {
                    await pullAll();
                    console.log('[velvet-sync] pull done');
                  } catch (err) {
                    console.error('[velvet-sync] pull failed:', err);
                  }
                }}
                className="flex-1 py-2.5 rounded-lg bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
              >
                确认拉取
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* 退出登录确认 */}
      {showLogoutConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
              退出登录？
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5 leading-relaxed">
              退出后此设备将停止同步，但本机数据不会被删除。下次登录同一账号可继续。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  cloudLogout();
                  setShowLogoutConfirm(false);
                }}
                className="flex-1 py-2.5 rounded-lg bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
              >
                确认退出
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

    </motion.div>
  );
};
