/** 属性与成长：逆流 · 属性名称（+ AI 匹配成就 / 技能名）· 等级需求（难度档 / 阈值 / 等级称号） */
import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, toLocalDateKey, settingsAfterPendingEdits } from '@/store';
import { db } from '@/db';
import { LEVEL_PRESETS } from '@/constants';
import { resolveLevelDifficulty } from '@/utils/levelDifficulty';
import type { AttributeId, AttributeLevelTitles, LevelDifficulty } from '@/types';
import { generateAttributeLevelTitles, normalizeAttributeLevelTitles, patchAttributeLevelTitle } from '@/utils/attributeLevelTitles';
import { generatePresetNameMatches, type PresetNameMatchResult } from '@/utils/presetNameMatcher';
import { ModalPortal } from '@/components/ModalPortal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Card, Row, Divider, Toggle, Segmented, Btn, Input, useSettingsSkin, skinTokens } from '../kit';
import { ATTRIBUTE_META, AttributeNameField, LevelTitleField } from '../pickers';

type PresetNameSelection = { achievements: Record<string, boolean>; skills: Record<string, boolean> };
type LevelTitleSelection = Record<AttributeId, boolean>;
const createLevelTitleSelection = (selected: boolean): LevelTitleSelection => ({ knowledge: selected, guts: selected, dexterity: selected, kindness: selected, charm: selected });
const emptyPresetNameSelection = (): PresetNameSelection => ({ achievements: {}, skills: {} });

export const GrowthSection = () => {
  const { settings, updateSettings, loadData, achievements, skills } = useAppStore(useShallow(s => ({ settings: s.settings, updateSettings: s.updateSettings, loadData: s.loadData, achievements: s.achievements, skills: s.skills })));
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const isP4 = skin === 'p4';
  const p5 = skin === 'p5';

  // ── 等级 / 难度 ──
  const curDifficulty = resolveLevelDifficulty(settings);
  const applyDifficulty = (d: LevelDifficulty) => {
    if (d === curDifficulty && settings.levelDifficulty === d) return;
    const count = settings.levelThresholds.length;
    const full = [...LEVEL_PRESETS[d].base, ...LEVEL_PRESETS[d].ext];
    updateSettings({ levelDifficulty: d, levelThresholds: full.slice(0, Math.min(Math.max(count, 5), full.length)) });
  };
  const [showLevelWarning, setShowLevelWarning] = useState(false);
  const [showResetThresholdsConfirm, setShowResetThresholdsConfirm] = useState(false);
  const [deleteLevelIndex, setDeleteLevelIndex] = useState<number | null>(null);

  // ── 等级称号 ──
  const [levelTitleRefreshing, setLevelTitleRefreshing] = useState(false);
  const [levelTitleMessage, setLevelTitleMessage] = useState<string | null>(null);
  const [levelTitleAttrIndex, setLevelTitleAttrIndex] = useState(0);
  const [levelTitleSuggestions, setLevelTitleSuggestions] = useState<AttributeLevelTitles | null>(null);
  const [levelTitleSelection, setLevelTitleSelection] = useState<LevelTitleSelection>(() => createLevelTitleSelection(false));
  const [levelTitleModalOpen, setLevelTitleModalOpen] = useState(false);
  const [levelTitleConfirmAttrIndex, setLevelTitleConfirmAttrIndex] = useState(0);
  const currentLevelTitles = normalizeAttributeLevelTitles(settings.attributeLevelTitles, settings.levelThresholds.length);
  const activeLevelTitleMeta = ATTRIBUTE_META[levelTitleAttrIndex] ?? ATTRIBUTE_META[0];
  const activeLevelTitleConfirmMeta = ATTRIBUTE_META[levelTitleConfirmAttrIndex] ?? ATTRIBUTE_META[0];

  const handleRefreshLevelTitles = useCallback(async () => {
    if (levelTitleRefreshing) return;
    setLevelTitleRefreshing(true);
    setLevelTitleMessage(null);
    try {
      const fresh = await settingsAfterPendingEdits(); // 同「AI 匹配」：改完名字直接点也按新名字（第 34 批）
      const titles = await generateAttributeLevelTitles(fresh, fresh.levelThresholds.length);
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
  }, [levelTitleAttrIndex, levelTitleRefreshing]);
  const handleCloseLevelTitleModal = useCallback(() => {
    if (levelTitleRefreshing) return;
    setLevelTitleModalOpen(false);
    setLevelTitleSuggestions(null);
    setLevelTitleSelection(createLevelTitleSelection(false));
  }, [levelTitleRefreshing]);
  const handleApplyLevelTitleSuggestions = useCallback(async () => {
    if (!levelTitleSuggestions || levelTitleRefreshing) return;
    const selectedIds = ATTRIBUTE_META.map(meta => meta.id).filter(id => levelTitleSelection[id]);
    if (selectedIds.length === 0) { setLevelTitleMessage('请至少选择一个需要刷新的属性'); return; }
    setLevelTitleRefreshing(true);
    setLevelTitleMessage(null);
    try {
      const levelCount = settings.levelThresholds.length;
      const nextTitles = normalizeAttributeLevelTitles(settings.attributeLevelTitles, levelCount);
      const normalizedSuggestions = normalizeAttributeLevelTitles(levelTitleSuggestions, levelCount);
      for (const id of selectedIds) nextTitles[id] = [...normalizedSuggestions[id]];
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
  }, [levelTitleRefreshing, levelTitleSelection, levelTitleSuggestions, settings.attributeLevelTitles, settings.levelThresholds.length, updateSettings]);

  // ── AI 匹配成就 / 技能名称 ──
  const [presetNameRefreshing, setPresetNameRefreshing] = useState(false);
  const [presetNameMessage, setPresetNameMessage] = useState<string | null>(null);
  const [presetNameSuggestions, setPresetNameSuggestions] = useState<PresetNameMatchResult | null>(null);
  const [presetNameSelection, setPresetNameSelection] = useState<PresetNameSelection>(() => emptyPresetNameSelection());
  const [presetNameModalOpen, setPresetNameModalOpen] = useState(false);
  const [presetNameAttrIndex, setPresetNameAttrIndex] = useState(0);
  const activePresetNameMeta = ATTRIBUTE_META[presetNameAttrIndex] ?? ATTRIBUTE_META[0];
  const hasPresetNameBackup = Boolean(settings.aiPresetNameBackup && (Object.keys(settings.aiPresetNameBackup.achievements ?? {}).length > 0 || Object.keys(settings.aiPresetNameBackup.skills ?? {}).length > 0));

  const handleRefreshPresetNames = useCallback(async () => {
    if (presetNameRefreshing) return;
    setPresetNameRefreshing(true);
    setPresetNameMessage(null);
    try {
      // 改完名字直接点：先让还在输入的框上屏、等写完再读最新名字（第 34 批）
      const result = await generatePresetNameMatches(await settingsAfterPendingEdits());
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
  }, [presetNameRefreshing]);
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
    for (const [id, name] of Object.entries(presetNameSuggestions.achievements)) if (presetNameSelection.achievements[id]) selectedAchievements[id] = name;
    for (const [id, name] of Object.entries(presetNameSuggestions.skills)) if (presetNameSelection.skills[id]) selectedSkills[id] = name;
    const selectedTotal = Object.keys(selectedAchievements).length + Object.keys(selectedSkills).length;
    if (selectedTotal === 0) { setPresetNameMessage('请至少选择一项需要覆写的名称'); return; }
    setPresetNameRefreshing(true);
    setPresetNameMessage(null);
    try {
      const currentAchievements = await db.achievements.toArray();
      const currentSkills = await db.skills.toArray();
      const backup = { achievements: { ...(settings.aiPresetNameBackup?.achievements ?? {}) }, skills: { ...(settings.aiPresetNameBackup?.skills ?? {}) } };
      for (const item of currentAchievements) if (selectedAchievements[item.id] && backup.achievements[item.id] === undefined) backup.achievements[item.id] = item.title;
      for (const item of currentSkills) if (selectedSkills[item.id] && backup.skills[item.id] === undefined) backup.skills[item.id] = item.name;
      await db.achievements.bulkPut(currentAchievements.map(item => (selectedAchievements[item.id] ? { ...item, title: selectedAchievements[item.id] } : item)));
      await db.skills.bulkPut(currentSkills.map(item => (selectedSkills[item.id] ? { ...item, name: selectedSkills[item.id] } : item)));
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
  }, [loadData, presetNameRefreshing, presetNameSelection, presetNameSuggestions, settings.aiPresetNameBackup, updateSettings]);
  const handleRestorePresetNames = useCallback(async () => {
    setPresetNameMessage(null);
    const backup = settings.aiPresetNameBackup;
    if (!backup || !(Object.keys(backup.achievements ?? {}).length > 0 || Object.keys(backup.skills ?? {}).length > 0)) { setPresetNameMessage('没有可还原的 AI 覆写记录'); return; }
    setPresetNameRefreshing(true);
    try {
      const currentAchievements = await db.achievements.toArray();
      const currentSkills = await db.skills.toArray();
      await db.achievements.bulkPut(currentAchievements.map(item => (backup.achievements[item.id] !== undefined ? { ...item, title: backup.achievements[item.id] } : item)));
      await db.skills.bulkPut(currentSkills.map(item => (backup.skills[item.id] !== undefined ? { ...item, name: backup.skills[item.id] } : item)));
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

  const modalCard = 'w-full max-w-md max-h-[86vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200/80 dark:border-gray-700';
  const attrNav = (index: number, setIndex: (f: (i: number) => number) => void, selected?: (id: AttributeId) => boolean) => (
    <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700/60">
      <button type="button" onClick={() => setIndex(i => (i + ATTRIBUTE_META.length - 1) % ATTRIBUTE_META.length)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300" aria-label="上一个属性">‹</button>
      <div className="flex flex-1 justify-center gap-1.5">
        {ATTRIBUTE_META.map((meta, i) => (
          <button key={meta.id} type="button" onClick={() => setIndex(() => i)} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : selected?.(meta.id) ? 'w-2.5 bg-primary/45' : 'w-1.5 bg-gray-300 dark:bg-gray-600'}`} aria-label={`切换到${settings.attributeNames[meta.id] || meta.defaultLabel}`} />
        ))}
      </div>
      <button type="button" onClick={() => setIndex(i => (i + 1) % ATTRIBUTE_META.length)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300" aria-label="下一个属性">›</button>
    </div>
  );

  return (
    <>
      <Card title="逆流" meta="实验性" index={0}>
        <Row id="countercurrentEnabled" glyph="wave" label="逆流" desc="连续 3 日某属性无增长，次日起每天该属性自动 −1，并在首页提前一天预警"
          control={<Toggle checked={!!settings.countercurrentEnabled} onChange={(enabling) => updateSettings({ countercurrentEnabled: enabling, countercurrentEnabledAt: enabling ? toLocalDateKey() : settings.countercurrentEnabledAt })} aria-label="逆流" />} />
      </Card>

      <Card title="属性名称" meta="5 维" index={1}>
        <p className="mb-3 text-[12px] font-semibold" style={{ color: t.sub }}>给五个维度取个贴合你的名字，命名会立刻在整个房间里生效。</p>
        <div className={p5 ? 'space-y-3.5 pr-1' : 'space-y-2'} data-setting-row="attributeNames">
          {ATTRIBUTE_META.map((meta, mi) => (
            <AttributeNameField key={meta.id} id={meta.id} icon={meta.icon} color={meta.color} defaultLabel={meta.defaultLabel} value={settings.attributeNames[meta.id]} index={mi}
              onCommit={(v) => updateSettings({ attributeNames: { ...settings.attributeNames, [meta.id]: v } })} />
          ))}
        </div>
        <div className="mt-3 flex gap-2" data-setting-row="aiPresetNames">
          <Btn className="flex-1" onClick={handleRefreshPresetNames} disabled={presetNameRefreshing}>{presetNameRefreshing ? '匹配中…' : 'AI 匹配成就 / 技能名称'}</Btn>
          <Btn tone="soft" onClick={handleRestorePresetNames} disabled={presetNameRefreshing || !hasPresetNameBackup}>还原</Btn>
        </div>
        {presetNameMessage && <p className="mt-2 text-[11px] font-semibold" style={{ color: t.sub }}>{presetNameMessage}</p>}
        {hasPresetNameBackup && !presetNameMessage && <p className="mt-2 text-[11px] font-semibold" style={{ color: t.accent }}>当前有 AI 覆写记录，可还原到覆写前版本。</p>}
      </Card>

      <Card title="等级需求" meta={`${settings.levelThresholds.length} / 10 级`} index={2}>
        <p className="mb-3 text-[12px] font-semibold" style={{ color: t.sub }}>达到对应等级所需的累计点数；数值随时可调，建议保持单调递增。</p>
        <div data-setting-row="levelDifficulty">
          <Segmented ariaLabel="难度档" value={curDifficulty}
            options={[{ value: 'easy', label: `简单 · LV5 需 ${LEVEL_PRESETS.easy.base[4]} 点` }, { value: 'hard', label: `困难 · LV5 需 ${LEVEL_PRESETS.hard.base[4]} 点` }]}
            onChange={(d) => applyDifficulty(d)} />
          <p className="mt-1.5 text-[11px] font-semibold" style={{ color: t.sub }}>困难档的等级标签会换成一套专属配色——菜单、同伴塔罗、以及别人看到的你，都认得出来。</p>
        </div>
        <div className="mt-3 space-y-1.5" data-setting-row="levelThresholds">
          {settings.levelThresholds.map((threshold, index) => {
            const isLast = index === settings.levelThresholds.length - 1;
            const canRemove = isLast && index >= 5;
            return (
              <div key={index} className="flex items-center gap-2">
                <div className="w-12 shrink-0 text-center">
                  <div className="text-[9px] font-black tracking-widest" style={{ color: t.sub }}>LV</div>
                  <div className="text-base font-black leading-tight" style={{ color: isP4 ? t.ink : t.accent }}>{index + 1}</div>
                </div>
                <div className="relative min-w-0 flex-1">
                  <Input type="number" value={threshold} min="0" placeholder="需求点数" aria-label={`LV${index + 1} 需求点数`} className="tabular-nums !pr-9"
                    onChange={(e) => { const next = [...settings.levelThresholds]; next[index] = parseInt(e.target.value) || 0; updateSettings({ levelThresholds: next }); }} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold" style={{ color: t.sub }}>点</span>
                </div>
                {canRemove ? (
                  <button type="button" onClick={() => setDeleteLevelIndex(index)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500" aria-label="移除最高等级" title="移除最高等级"><span className="text-base leading-none">−</span></button>
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center" title={index < 5 ? 'Lv.1–5 不可删除' : ''} style={{ color: t.sub }}>{index < 5 ? <span className="text-[10px] opacity-60">🔒</span> : null}</div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Btn className="flex-1" tone="soft" disabled={settings.levelThresholds.length >= 10} onClick={() => { if (settings.levelThresholds.length < 10) setShowLevelWarning(true); }}>+ 添加一级</Btn>
          <Btn tone="soft" onClick={() => setShowResetThresholdsConfirm(true)} ariaLabel="恢复默认阈值">↺ 默认</Btn>
        </div>
        <Divider />
        <div data-setting-row="levelTitles">
          <div className="flex items-start gap-3 py-1">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-black" style={{ color: t.ink }}>等级称号</div>
              <p className="mt-0.5 text-[11px] font-semibold" style={{ color: t.sub }}>每个属性的 Lv 显示一个四字称号；AI 刷新会先生成建议，再选要应用的属性。</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Btn small onClick={handleRefreshLevelTitles} disabled={levelTitleRefreshing}>{levelTitleRefreshing ? '刷新中' : 'AI 刷新'}</Btn>
              <Btn small tone="soft" onClick={() => { updateSettings({ attributeLevelTitles: normalizeAttributeLevelTitles(undefined, settings.levelThresholds.length) }); setLevelTitleMessage('已填入默认等级称号'); }}>默认</Btn>
            </div>
          </div>
          {levelTitleMessage && <div className="pt-1 text-[11px] font-semibold" style={{ color: t.sub }}>{levelTitleMessage}</div>}
          <div className="mt-2 flex items-center gap-2 py-1">
            <button type="button" onClick={() => setLevelTitleAttrIndex(i => (i + ATTRIBUTE_META.length - 1) % ATTRIBUTE_META.length)} className="flex h-8 w-8 items-center justify-center rounded-lg font-black" style={{ background: t.chip, color: t.ink }} aria-label="上一个属性">‹</button>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: `${activeLevelTitleMeta.color}1f`, color: activeLevelTitleMeta.color }}>{activeLevelTitleMeta.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-black" style={{ color: t.ink }}>{settings.attributeNames[activeLevelTitleMeta.id] || activeLevelTitleMeta.defaultLabel}</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: t.sub }}>{activeLevelTitleMeta.id}</div>
            </div>
            <button type="button" onClick={() => setLevelTitleAttrIndex(i => (i + 1) % ATTRIBUTE_META.length)} className="flex h-8 w-8 items-center justify-center rounded-lg font-black" style={{ background: t.chip, color: t.ink }} aria-label="下一个属性">›</button>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            {settings.levelThresholds.map((_, levelIndex) => (
              <LevelTitleField key={`${activeLevelTitleMeta.id}-${levelIndex}`} level={levelIndex + 1} value={currentLevelTitles[activeLevelTitleMeta.id][levelIndex]}
                onCommit={(value) => updateSettings({ attributeLevelTitles: patchAttributeLevelTitle(settings.attributeLevelTitles, activeLevelTitleMeta.id, levelIndex, value, settings.levelThresholds.length) })} />
            ))}
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {ATTRIBUTE_META.map((meta, index) => (
              <button key={meta.id} type="button" onClick={() => setLevelTitleAttrIndex(index)} className="h-1.5 rounded-full transition-all" style={{ width: index === levelTitleAttrIndex ? 20 : 6, background: index === levelTitleAttrIndex ? t.accent : t.chip }} aria-label={`切换到${settings.attributeNames[meta.id] || meta.defaultLabel}`} />
            ))}
          </div>
        </div>
      </Card>

      {/* ── 两个确认弹窗：portal 到 body（页内会被底导的 stacking context 压住） ── */}
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
              <motion.div key="level-title-confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={handleCloseLevelTitleModal}>
                <motion.div initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 12 }} onClick={(e) => e.stopPropagation()} className={modalCard}>
                  <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700/70">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: `${activeLevelTitleConfirmMeta.color}1f`, color: activeLevelTitleConfirmMeta.color }}>{activeLevelTitleConfirmMeta.icon}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-gray-900 dark:text-white">确认刷新：{attrName}</h3>
                      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{levelTitleConfirmAttrIndex + 1} / {ATTRIBUTE_META.length} · 已选 {selectedCount} 个属性</p>
                    </div>
                    <button type="button" onClick={handleCloseLevelTitleModal} disabled={levelTitleRefreshing} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300" aria-label="关闭">×</button>
                  </div>
                  {attrNav(levelTitleConfirmAttrIndex, (f) => setLevelTitleConfirmAttrIndex(f), (id) => levelTitleSelection[id])}
                  <div className="max-h-[56vh] space-y-3 overflow-y-auto p-4">
                    <button type="button" onClick={() => setLevelTitleSelection(prev => ({ ...prev, [activeLevelTitleConfirmMeta.id]: !prev[activeLevelTitleConfirmMeta.id] }))}
                      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${activeSelected ? 'border-primary/45 bg-primary/5 dark:bg-primary/10' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/35'}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-black ${activeSelected ? 'border-primary bg-primary text-white' : 'border-gray-300 text-transparent dark:border-gray-600'}`}>✓</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-gray-800 dark:text-white">刷新这个属性</div>
                        <div className="truncate text-[10px] text-gray-500 dark:text-gray-400">{attrName} · LV1-LV{settings.levelThresholds.length}</div>
                      </div>
                    </button>
                    <div className="overflow-hidden rounded-xl border border-gray-200/70 dark:border-gray-700/60">
                      <div className="grid grid-cols-[42px_1fr_1fr] bg-gray-50 px-3 py-2 text-[10px] font-black text-gray-400 dark:bg-gray-900/45"><span>等级</span><span>当前</span><span>建议</span></div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {settings.levelThresholds.map((_, index) => (
                          <div key={`${activeLevelTitleConfirmMeta.id}-${index}`} className="grid grid-cols-[42px_1fr_1fr] items-center gap-2 px-3 py-2 text-[11px]">
                            <span className="font-bold tabular-nums text-gray-400">LV{index + 1}</span>
                            <span className="min-w-0 truncate font-semibold text-gray-700 dark:text-gray-200">{currentTitles[index]}</span>
                            <span className="min-w-0 truncate font-black text-primary">{suggestionTitles[index]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-gray-100 p-4 dark:border-gray-700/70">
                    <button type="button" onClick={handleCloseLevelTitleModal} disabled={levelTitleRefreshing} className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-bold text-gray-700 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200">取消</button>
                    <button type="button" onClick={handleApplyLevelTitleSuggestions} disabled={levelTitleRefreshing || selectedCount === 0} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{levelTitleRefreshing ? '应用中' : `应用 ${selectedCount} 个`}</button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        <AnimatePresence>
          {presetNameModalOpen && presetNameSuggestions && (() => {
            const attrName = settings.attributeNames[activePresetNameMeta.id] || activePresetNameMeta.defaultLabel;
            const attrAchievements = achievements.filter(item => item.condition.type === 'attribute_level' && item.condition.attribute === activePresetNameMeta.id && Boolean(presetNameSuggestions.achievements[item.id]));
            const attrSkills = skills.filter(item => item.requiredAttribute === activePresetNameMeta.id && Boolean(presetNameSuggestions.skills[item.id]));
            const selectedCount = Object.values(presetNameSelection.achievements).filter(Boolean).length + Object.values(presetNameSelection.skills).filter(Boolean).length;
            const toggleItem = (kind: keyof PresetNameSelection, id: string) => setPresetNameSelection(prev => ({ ...prev, [kind]: { ...prev[kind], [id]: !prev[kind][id] } }));
            const itemCard = (selected: boolean, onClick: () => void, head: React.ReactNode, current: string, suggestion: string, key: string) => (
              <button key={key} type="button" onClick={onClick} className={`w-full rounded-xl border p-3 text-left transition-colors ${selected ? 'border-primary/45 bg-primary/5 dark:bg-primary/10' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/35'}`}>
                <div className="flex items-start gap-2.5">
                  <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border text-[11px] font-black ${selected ? 'border-primary bg-primary text-white' : 'border-gray-300 text-transparent dark:border-gray-600'}`}>✓</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-white">{head}</div>
                    <div className="mt-2 grid grid-cols-[42px_1fr] gap-x-2 gap-y-1 text-[11px] leading-relaxed">
                      <span className="text-gray-400">当前</span><span className="truncate font-semibold text-gray-700 dark:text-gray-200">{current}</span>
                      <span className="text-gray-400">建议</span><span className="truncate font-black text-primary">{suggestion}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
            return (
              <motion.div key="preset-name-confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={handleClosePresetNameModal}>
                <motion.div initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 12 }} onClick={(e) => e.stopPropagation()} className={modalCard}>
                  <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700/70">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: `${activePresetNameMeta.color}1f`, color: activePresetNameMeta.color }}>{activePresetNameMeta.icon}</div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-gray-900 dark:text-white">确认覆写：{attrName}</h3>
                      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">{presetNameAttrIndex + 1} / {ATTRIBUTE_META.length} · 已选 {selectedCount} 项</p>
                    </div>
                    <button type="button" onClick={handleClosePresetNameModal} disabled={presetNameRefreshing} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300" aria-label="关闭">×</button>
                  </div>
                  {attrNav(presetNameAttrIndex, (f) => setPresetNameAttrIndex(f))}
                  <div className="max-h-[56vh] space-y-3 overflow-y-auto p-4">
                    {attrAchievements.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Achievements</div>
                        {attrAchievements.map(item => itemCard(Boolean(presetNameSelection.achievements[item.id]), () => toggleItem('achievements', item.id), <><span className="text-sm leading-none">{item.icon}</span><span className="truncate">{item.description}</span></>, item.title, presetNameSuggestions.achievements[item.id], item.id))}
                      </div>
                    )}
                    {attrSkills.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Skills</div>
                        {attrSkills.map(item => itemCard(Boolean(presetNameSelection.skills[item.id]), () => toggleItem('skills', item.id), <span className="truncate">Lv.{item.requiredLevel} · {item.description}</span>, item.name, presetNameSuggestions.skills[item.id], item.id))}
                      </div>
                    )}
                    {attrAchievements.length === 0 && attrSkills.length === 0 && <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">这一维没有可覆写的建议。</div>}
                  </div>
                  <div className="flex gap-2 border-t border-gray-100 p-4 dark:border-gray-700/70">
                    <button type="button" onClick={handleClosePresetNameModal} disabled={presetNameRefreshing} className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-bold text-gray-700 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200">取消</button>
                    <button type="button" onClick={handleApplyPresetNameSuggestions} disabled={presetNameRefreshing || selectedCount === 0} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{presetNameRefreshing ? '应用中' : `应用 ${selectedCount} 项`}</button>
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </ModalPortal>

      <ConfirmDialog isOpen={showResetThresholdsConfirm} icon="↺" title="恢复默认等级阈值？" description={`将等级阈值恢复为${curDifficulty === 'hard' ? '困难' : '简单'}档的 5 级默认配置。`} confirmText="恢复默认" cancelText="取消"
        onConfirm={() => { updateSettings({ levelThresholds: [...LEVEL_PRESETS[curDifficulty].base] }); setShowResetThresholdsConfirm(false); }} onCancel={() => setShowResetThresholdsConfirm(false)}>
        <div className="text-center">
          <div className="mx-auto inline-flex flex-wrap justify-center gap-1.5">
            {LEVEL_PRESETS[curDifficulty].base.map((v, i) => <span key={i} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary"><span className="opacity-60">LV{i + 1}</span>{v}</span>)}
          </div>
          <p className="mt-3 text-[10px] text-rose-500">若你当前有 Lv.6 及以上自定义等级，它们会一并被清除。</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog isOpen={deleteLevelIndex !== null} tone="danger" icon="⚠️" title={`移除 Lv.${(deleteLevelIndex ?? 0) + 1}？`} confirmText="确认移除" cancelText="再想想"
        onConfirm={() => { const idx = deleteLevelIndex; if (idx === null) return; if (idx !== settings.levelThresholds.length - 1 || idx < 5) { setDeleteLevelIndex(null); return; } updateSettings({ levelThresholds: settings.levelThresholds.slice(0, -1) }); setDeleteLevelIndex(null); }}
        onCancel={() => setDeleteLevelIndex(null)}>
        <div className="text-center">
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">这是当前的最高等级，所需点数 <b className="tabular-nums text-primary">{deleteLevelIndex !== null ? settings.levelThresholds[deleteLevelIndex] ?? 0 : 0}</b>。移除后，已达到此等级的属性会回落到上一级。</p>
          <p className="mt-2 text-[10px] text-gray-400">（Lv.1–5 为系统保护等级，无法删除。）</p>
        </div>
      </ConfirmDialog>

      <ConfirmDialog isOpen={showLevelWarning} icon="⚠️" title="温馨提示" description="该操作不可逆：前方是未曾有人达到过的领域！" confirmText="继续添加" cancelText="取消"
        onConfirm={() => {
          const last = settings.levelThresholds[settings.levelThresholds.length - 1] || 0;
          const nextLevel = settings.levelThresholds.length + 1;
          const preset = LEVEL_PRESETS[curDifficulty].ext[nextLevel - 6];
          const next = preset !== undefined && preset > last ? preset : last + 300;
          updateSettings({ levelThresholds: [...settings.levelThresholds, next] });
          setShowLevelWarning(false);
        }}
        onCancel={() => setShowLevelWarning(false)} />
    </>
  );
};
