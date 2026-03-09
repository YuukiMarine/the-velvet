import { motion } from 'framer-motion';
import { useRef, useState, useCallback } from 'react';
import { useAppStore, DEFAULT_SUMMARY_PROMPT_PRESETS, toLocalDateKey, applyCustomThemeColor } from '@/store';
import { triggerThemeSwitchFeedback } from '@/utils/feedback';
import { ThemeType, AttributeId, SummaryPromptPreset } from '@/types';
import { db } from '@/db';
import { PageTitle } from '@/components/PageTitle';


export const Settings = () => {
  const { 
    user, 
    settings, 
    updateSettings, 
    setTheme, 
    resetAllData, 
    importData
  } = useAppStore();
  const [activeSection, setActiveSection] = useState<string | null>('theme');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLevelWarning, setShowLevelWarning] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<number, string>>({});
  const opacityDraftRef = useRef(settings.backgroundOpacity ?? 0.3);

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
    { value: 'custom', label: '自定义', color: settings.customThemeColor || '#6366F1' }
  ];
  const [customColorDraft, setCustomColorDraft] = useState(settings.customThemeColor || '#6366F1');

  const sizeOf = (s: string) => {
    const bytes = new Blob([s]).size;
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const handleDownload = async () => {
    const jsonString = await buildExportJson();
    const blob = new Blob([jsonString], { type: 'application/json' });
    // Revoke previous URL
    if (downloadLinkUrlRef.current) URL.revokeObjectURL(downloadLinkUrlRef.current);
    const url = URL.createObjectURL(blob);
    downloadLinkUrlRef.current = url;
    const filename = `velvet-room-backup-${toLocalDateKey()}.json`;
    // Trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    const size = sizeOf(jsonString);
    setDownloadLink({ url, filename, size });
    setExportMessage(null);
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
    const data = {
      user: await db.users.toArray(),
      attributes: await db.attributes.toArray(),
      activities: await db.activities.toArray(),
      achievements: await db.achievements.toArray(),
      skills: await db.skills.toArray(),
      settings: sanitizedSettings,
      todos: await db.todos.toArray(),
      todoCompletions: await db.todoCompletions.toArray(),
      _exportedAt: new Date().toISOString(),
      _version: 2,
    };
    return JSON.stringify(data);
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
    { id: 'theme', label: '主题设置', icon: '🎨' },
    { id: 'attributes', label: '属性自定义', icon: '⚙️' },
    { id: 'keywords', label: '关键词规则', icon: '🔑' },
    { id: 'display', label: '显示设置', icon: '🖼️' },
    { id: 'summary', label: 'AI 总结', icon: '✨' },
    { id: 'data', label: '数据管理', icon: '💾' },
    { id: 'about', label: '关于', icon: '💡' }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <PageTitle title="设置" en="Settings" />

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
                  <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">选择你喜欢的主题颜色</p>
                    <div className="flex gap-2">
                      {themes.map(theme => (
                        <motion.button
                          key={theme.value}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            triggerThemeSwitchFeedback(theme.value);
                            setTheme(theme.value);
                            if (theme.value === 'custom') {
                              const color = settings.customThemeColor || customColorDraft;
                              applyCustomThemeColor(color);
                              if (!settings.customThemeColor) updateSettings({ customThemeColor: color });
                            }
                          }}
                          className={`flex-1 flex flex-col items-center gap-1.5 py-2.5 rounded-xl border-2 transition-all ${
                            user?.theme === theme.value
                              ? 'border-primary bg-primary/5 dark:bg-primary/10'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div
                            className="w-7 h-7 rounded-full shadow-sm"
                            style={{ backgroundColor: theme.color }}
                          />
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {theme.label}
                          </div>
                        </motion.button>
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
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              { value: 'blue',   label: '蓝色', hint: 'P3 风格' },
                              { value: 'yellow', label: '黄色', hint: 'P4 风格' },
                              { value: 'red',    label: '红色', hint: 'P5 风格' },
                              { value: 'pink',   label: '粉色', hint: 'P3 柔和' },
                            ] as { value: import('@/types').ThemeType; label: string; hint: string }[]).map(opt => {
                              const active = (settings.customSoundScheme ?? 'blue') === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => updateSettings({ customSoundScheme: opt.value })}
                                  className={`text-left px-3 py-2 rounded-xl border-2 transition-all ${
                                    active
                                      ? 'border-primary bg-primary/10 dark:bg-primary/20'
                                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                                  }`}
                                >
                                  <div className={`text-xs font-bold ${active ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</div>
                                  <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{opt.hint}</div>
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
                  </div>
                )}

                {section.id === 'attributes' && (
                  <div className="space-y-4">
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

                    <p className="text-gray-600 dark:text-gray-400 mb-4">自定义属性名称</p>
                    {(['knowledge', 'guts', 'dexterity', 'kindness', 'charm'] as AttributeId[]).map(attr => (
                      <div key={attr} className="flex items-center gap-3">
                        <label className="w-24 text-gray-700 dark:text-gray-300">
                          {attr}
                        </label>
                        <input
                          type="text"
                          value={settings.attributeNames[attr]}
                          onChange={(e) => updateSettings({
                            attributeNames: {
                              ...settings.attributeNames,
                              [attr]: e.target.value
                            }
                          })}
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                    ))}
                    
                    <p className="text-gray-600 dark:text-gray-400 mb-4 mt-6">升级需求点数设置</p>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">添加等级</span>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            if (settings.levelThresholds.length >= 10) return;
                            setShowLevelWarning(true);
                          }}
                        className={`px-3 py-1 rounded-lg text-sm font-medium ${
                          settings.levelThresholds.length >= 10
                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                            : 'bg-primary text-white'
                        }`}
                        disabled={settings.levelThresholds.length >= 10}
                      >
                        + 添加等级
                      </motion.button>
                    </div>
                    <div className="space-y-2">
                      {settings.levelThresholds.map((threshold, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <label className="w-32 text-sm font-medium text-gray-700 dark:text-gray-300">
                            Lv.{index + 1} 需求
                          </label>
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
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {section.id === 'keywords' && (
                  <div className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      关键词规则（点击 + 添加标签）
                    </p>
                    {settings.keywordRules.map((rule, index) => (
                      <div key={index} className="space-y-3">
                        <div className="font-medium text-gray-700 dark:text-gray-300">
                          {settings.attributeNames[rule.attribute]} (+{rule.points}点)
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {rule.keywords.map((keyword, keywordIndex) => (
                            <button
                              key={`${keyword}-${keywordIndex}`}
                              onClick={() => {
                                const newRules = [...settings.keywordRules];
                                newRules[index] = {
                                  ...rule,
                                  keywords: rule.keywords.filter((_, i) => i !== keywordIndex)
                                };
                                updateSettings({ keywordRules: newRules });
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                            >
                              <span>{keyword}</span>
                              <span className="text-xs">×</span>
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              setKeywordDrafts(prev => ({ ...prev, [index]: '' }));
                            }}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          >
                            +
                          </button>
                        </div>
                        {Object.prototype.hasOwnProperty.call(keywordDrafts, index) && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={keywordDrafts[index]}
                              onChange={(e) => {
                                const value = e.target.value;
                                setKeywordDrafts(prev => ({ ...prev, [index]: value }));
                              }}
                              placeholder="输入关键词"
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                            />
                            <button
                              onClick={() => {
                                const trimmed = (keywordDrafts[index] || '').trim();
                                if (!trimmed) return;
                                const existing = new Set(rule.keywords.map(k => k.toLowerCase()));
                                if (existing.has(trimmed.toLowerCase())) {
                                  setKeywordDrafts(prev => {
                                    const next = { ...prev };
                                    delete next[index];
                                    return next;
                                  });
                                  return;
                                }
                                const newRules = [...settings.keywordRules];
                                newRules[index] = {
                                  ...rule,
                                  keywords: [...rule.keywords, trimmed]
                                };
                                updateSettings({ keywordRules: newRules });
                                setKeywordDrafts(prev => {
                                  const next = { ...prev };
                                  delete next[index];
                                  return next;
                                });
                              }}
                              className="px-3 py-2 bg-primary text-white rounded-lg text-sm"
                            >
                              添加
                            </button>
                            <button
                              onClick={() => {
                                setKeywordDrafts(prev => {
                                  const next = { ...prev };
                                  delete next[index];
                                  return next;
                                });
                              }}
                              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm"
                            >
                              取消
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {section.id === 'display' && (
                  <div className="space-y-4">
                    {/* 夜间模式切换 */}
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

                {section.id === 'summary' && (
                  <div className="space-y-5">
                    {/* API 提供商 */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">API 提供商</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { value: 'openai', label: 'OpenAI', hint: 'gpt-4o-mini' },
                          { value: 'deepseek', label: 'DeepSeek', hint: 'deepseek-chat' },
                          { value: 'kimi', label: 'Kimi', hint: 'moonshot-v1-8k' },
                        ] as const).map(p => (
                          <button
                            key={p.value}
                            onClick={() => updateSettings({ summaryApiProvider: p.value })}
                            className={`py-2.5 rounded-xl text-xs font-bold transition-all border ${
                              (settings.summaryApiProvider ?? 'openai') === p.value
                                ? 'bg-primary text-white border-primary shadow-md'
                                : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                            }`}
                          >
                            <div>{p.label}</div>
                            <div className="opacity-60 font-normal mt-0.5">{p.hint}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* API Key */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">API 密钥</p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={summaryApiKeyDraft}
                          onChange={e => { setSummaryApiKeyDraft(e.target.value); setSummaryApiKeySaved(false); }}
                          placeholder="sk-..."
                          className="flex-1 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                        />
                        <button
                          onClick={() => { updateSettings({ summaryApiKey: summaryApiKeyDraft }); setSummaryApiKeySaved(true); }}
                          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            summaryApiKeySaved
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                              : 'bg-primary text-white'
                          }`}
                        >
                          {summaryApiKeySaved ? '✓' : '保存'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">API Key 仅保存在本地，不会上传。</p>
                    </div>

                    {/* 自定义 Base URL */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">自定义 API 地址（可选）</p>
                      <input
                        type="text"
                        value={settings.summaryApiBaseUrl ?? ''}
                        onChange={e => updateSettings({ summaryApiBaseUrl: e.target.value || undefined })}
                        placeholder={
                          (settings.summaryApiProvider ?? 'openai') === 'deepseek' ? 'https://api.deepseek.com/v1' :
                          (settings.summaryApiProvider ?? 'openai') === 'kimi' ? 'https://api.moonshot.cn/v1' :
                          'https://api.openai.com/v1'
                        }
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                      />
                    </div>

                    {/* 自定义模型名 */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">模型名称（可选）</p>
                      <input
                        type="text"
                        value={settings.summaryModel ?? ''}
                        onChange={e => updateSettings({ summaryModel: e.target.value || undefined })}
                        placeholder={
                          (settings.summaryApiProvider ?? 'openai') === 'deepseek' ? 'deepseek-chat' :
                          (settings.summaryApiProvider ?? 'openai') === 'kimi' ? 'moonshot-v1-8k' :
                          'gpt-4o-mini'
                        }
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                      />
                    </div>

                    {/* 风格预设 */}
                    <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">沟通风格预设</p>
                        <button
                          onClick={handleAddCustomPreset}
                          className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-lg hover:bg-primary/20 transition-colors"
                        >
                          + 添加
                        </button>
                      </div>

                      <div className="space-y-2">
                        {effectivePresets.map(preset => (
                          <div
                            key={preset.id}
                            className={`rounded-2xl border transition-all ${
                              (settings.summaryActivePresetId ?? 'igor') === preset.id
                                ? 'border-primary/50 bg-primary/5 dark:bg-primary/10'
                                : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-700/50'
                            }`}
                          >
                            {editingPresetId === preset.id && presetDraft ? (
                              /* 编辑模式 */
                              <div className="p-4 space-y-3">
                                <input
                                  type="text"
                                  value={presetDraft.name}
                                  onChange={e => setPresetDraft({ ...presetDraft, name: e.target.value })}
                                  placeholder="风格名称"
                                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white focus:outline-none focus:border-primary"
                                />
                                <textarea
                                  value={presetDraft.systemPrompt}
                                  onChange={e => setPresetDraft({ ...presetDraft, systemPrompt: e.target.value })}
                                  placeholder="输入 system prompt…"
                                  rows={6}
                                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white resize-none focus:outline-none focus:border-primary"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSavePreset(presetDraft)}
                                    className="flex-1 py-2 rounded-xl text-sm font-bold bg-primary text-white"
                                  >
                                    保存
                                  </button>
                                  <button
                                    onClick={() => { setEditingPresetId(null); setPresetDraft(null); }}
                                    className="flex-1 py-2 rounded-xl text-sm font-bold bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* 展示模式 */
                              <div className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => updateSettings({ summaryActivePresetId: preset.id })}
                                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
                                        (settings.summaryActivePresetId ?? 'igor') === preset.id
                                          ? 'bg-primary border-primary'
                                          : 'border-gray-300 dark:border-gray-500'
                                      }`}
                                    />
                                    <span className="text-sm font-bold text-gray-800 dark:text-white">{preset.name}</span>
                                    {preset.isBuiltin && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">内置</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => { setPresetDraft({ ...preset }); setEditingPresetId(preset.id); }}
                                      className="text-xs text-gray-400 dark:text-gray-500 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                    >
                                      编辑
                                    </button>
                                    {!preset.isBuiltin && (
                                      <button
                                        onClick={() => handleDeleteCustomPreset(preset.id)}
                                        className="text-xs text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                      >
                                        删除
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {preset.systemPrompt && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed line-clamp-2">
                                    {preset.systemPrompt}
                                  </p>
                                )}
                                {!preset.systemPrompt && (
                                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">（暂无 prompt，请编辑）</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

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

                    {/* 导出 */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">备份导出</p>
                      <div className="grid grid-cols-2 gap-2">
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
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={handleDownload}
                          className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3 rounded-xl font-semibold text-sm flex flex-col items-center gap-0.5"
                        >
                          <span>💾</span>
                          <span>下载备份</span>
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

                {section.id === 'about' && (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <div className="text-5xl mb-4">🦋</div>
                      <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">天鹅绒房间</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Persona Growth Tracker</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">v{import.meta.env.PACKAGE_VERSION || '0.0.1'}</p>
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
                    </div>
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


    </motion.div>
  );
};
