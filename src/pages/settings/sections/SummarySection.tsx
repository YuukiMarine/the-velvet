/** AI 总结：路标（Key 在 AI 服务）· 熟悉的人 · 内置 / 自定义预设 · 自动撰写上一期 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, DEFAULT_SUMMARY_PROMPT_PRESETS, FAMILIAR_FACE_PRESETS } from '@/store';
import type { SummaryPromptPreset } from '@/types';
import { P3R } from '@/components/p3r/kit';
import { P5R, P5Rough, P5Star } from '@/components/p5r/kit';
import { Card, Row, Divider, Toggle, Btn, Input, Textarea, Glyph, useSettingsSkin, skinTokens } from '../kit';
import { useSettingsNav } from '../nav';

const FACES = [
  { id: 'elizabeth', icon: '🦋', name: '蓝蝶', tagline: '好奇探索，郑重记录' },
  { id: 'theodore', icon: '🌿', name: '青侍', tagline: '恭谨诚挚，深情服侍' },
  { id: 'margaret', icon: '📖', name: '典藏', tagline: '典雅沉思，潜能鉴证' },
  { id: 'caroline-justine', icon: '⚔️', name: '双子审官', tagline: '急峻与冷静，双声问讯' },
] as const;

const FaceButton = ({ icon, name, active, onClick, seed }: { icon: string; name: string; active: boolean; onClick: () => void; seed: number }) => {
  const skin = useSettingsSkin();
  if (skin === 'p5') {
    return (
      <motion.button type="button" whileTap={{ x: 2, y: 3 }} onClick={onClick} aria-label={name} aria-pressed={active} title={name} className="relative flex min-h-[58px] items-center justify-center">
        <P5Rough seed={seed} jag={5} frame={2.5} face={active ? P5R.red : P5R.paper} shadow={{ x: 3, y: 3 }} />
        <span className="relative text-[26px] leading-none">{icon}</span>
        {active && <P5Star size={14} fill={P5R.white} className="absolute right-1.5 top-1.5" />}
      </motion.button>
    );
  }
  if (skin === 'p3') {
    return (
      <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={onClick} aria-label={name} aria-pressed={active} title={name} className="flex min-h-[58px] items-center justify-center"
        style={{ clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', background: active ? P3R.blue : 'var(--p3r-chip, #ddeef7)', boxShadow: active ? '0 8px 18px rgba(27,87,255,0.22)' : 'none' }}>
        <span className="text-[26px] leading-none">{icon}</span>
      </motion.button>
    );
  }
  if (skin === 'p4') {
    return (
      <motion.button type="button" whileTap={{ scale: 0.94, rotate: -2 }} onClick={onClick} aria-label={name} aria-pressed={active} title={name} className="flex min-h-[58px] items-center justify-center rounded-2xl"
        style={{ background: active ? '#131313' : 'var(--ui-paper, #fff6d0)', boxShadow: '0 0 0 2px #131313' }}>
        <span className="text-[26px] leading-none">{icon}</span>
      </motion.button>
    );
  }
  return (
    <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={onClick} aria-label={name} aria-pressed={active} title={name}
      className={`flex min-h-[58px] items-center justify-center rounded-xl border-2 ${active ? 'border-primary bg-primary/10' : 'border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-700/50'}`}>
      <span className="text-[26px] leading-none">{icon}</span>
    </motion.button>
  );
};

export const SummarySection = () => {
  const { settings, updateSettings } = useAppStore(useShallow(s => ({ settings: s.settings, updateSettings: s.updateSettings })));
  const nav = useSettingsNav();
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState<SummaryPromptPreset | null>(null);
  const effectivePresets: SummaryPromptPreset[] = settings.summaryPromptPresets?.length ? settings.summaryPromptPresets : DEFAULT_SUMMARY_PROMPT_PRESETS;
  const activePresetId = settings.summaryActivePresetId ?? 'igor';
  const activeFamiliar = FAMILIAR_FACE_PRESETS.find(p => p.id === activePresetId);
  const faceMeta = FACES.find(f => f.id === activePresetId);

  const handleSavePreset = (preset: SummaryPromptPreset) => {
    const idx = effectivePresets.findIndex(p => p.id === preset.id);
    const updated = idx >= 0 ? effectivePresets.map(p => (p.id === preset.id ? preset : p)) : [...effectivePresets, preset];
    updateSettings({ summaryPromptPresets: updated });
    setEditingPresetId(null);
    setPresetDraft(null);
  };
  const handleDeleteCustomPreset = (id: string) => {
    updateSettings({ summaryPromptPresets: effectivePresets.filter(p => p.id !== id), summaryActivePresetId: settings.summaryActivePresetId === id ? 'igor' : settings.summaryActivePresetId });
  };
  const handleAddCustomPreset = () => {
    const newPreset: SummaryPromptPreset = { id: `custom-${Date.now()}`, name: '自定义风格', systemPrompt: '', isBuiltin: false };
    updateSettings({ summaryPromptPresets: [...effectivePresets, newPreset] });
    setPresetDraft(newPreset);
    setEditingPresetId(newPreset.id);
  };

  return (
    <>
      <Card index={0}>
        <Row id="summaryToAIService" glyph="key" label="API Key 和模型在「AI 服务」" desc="连接、服务商、模型分档都在那边" onClick={() => nav.open('ai', { aiJump: true })}
          control={<span className="text-[13px] font-black" style={{ color: t.accent }} data-testid="summary-to-ai-service">前往 ›</span>} />
      </Card>

      <Card title="沟通风格" meta={activeFamiliar ? activeFamiliar.name : '自定义'} index={1}>
        <div className="grid grid-cols-4 gap-2" data-setting-row="summaryFamiliar">
          {FACES.map((face, i) => (
            <FaceButton key={face.id} icon={face.icon} name={face.name} seed={760 + i * 5} active={activePresetId === face.id} onClick={() => updateSettings({ summaryActivePresetId: face.id })} />
          ))}
        </div>
        {activeFamiliar && (
          <p className="mt-2 px-1 text-[11px] font-semibold" style={{ color: t.sub }}>
            <span className="font-black" style={{ color: t.ink }}>{activeFamiliar.name}</span>{faceMeta ? ` · ${faceMeta.tagline}` : ''}
          </p>
        )}
        <Divider />
        <div className="flex items-center justify-between py-1" data-setting-row="summaryPresets">
          <span className="text-[13px] font-black" style={{ color: t.ink }}>内置 / 自定义</span>
          <Btn small tone="soft" onClick={handleAddCustomPreset}>+ 新增</Btn>
        </div>
        <div className="mt-2 space-y-2">
          {effectivePresets.map(preset => (
            <div key={preset.id}>
              {editingPresetId === preset.id && presetDraft ? (
                <div className="space-y-2.5 rounded-xl p-3" style={{ boxShadow: `inset 0 0 0 1.5px ${t.accent}`, background: skin === 'p5' ? P5R.paperDim : 'rgba(27,87,255,0.05)' }}>
                  <Input type="text" value={presetDraft.name} aria-label="风格名称" onChange={e => setPresetDraft({ ...presetDraft, name: e.target.value })} placeholder="风格名称" />
                  <Textarea value={presetDraft.systemPrompt} aria-label="system prompt" onChange={e => setPresetDraft({ ...presetDraft, systemPrompt: e.target.value })} placeholder="输入 system prompt…" rows={5} />
                  <div className="flex gap-2">
                    <Btn className="flex-1" onClick={() => handleSavePreset(presetDraft)}>保存</Btn>
                    <Btn className="flex-1" tone="soft" onClick={() => { setEditingPresetId(null); setPresetDraft(null); }}>取消</Btn>
                  </div>
                </div>
              ) : (
                <div role="button" tabIndex={0} onClick={() => updateSettings({ summaryActivePresetId: preset.id })} onKeyDown={(e) => { if (e.key === 'Enter') updateSettings({ summaryActivePresetId: preset.id }); }}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                  style={{ boxShadow: activePresetId === preset.id ? `inset 0 0 0 2px ${t.accent}` : `inset 0 0 0 1px ${skin === 'p5' ? P5R.ink : 'rgba(107,122,153,0.25)'}`, background: activePresetId === preset.id ? (skin === 'p5' ? '#f4dcd4' : 'rgba(27,87,255,0.06)') : 'transparent' }}>
                  <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border-2" style={{ borderColor: activePresetId === preset.id ? t.accent : t.sub, background: activePresetId === preset.id ? t.accent : 'transparent' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-black" style={{ color: t.ink }}>{preset.name}</span>
                      {preset.isBuiltin && <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: t.chip, color: t.sub }}>内置</span>}
                    </div>
                    {preset.systemPrompt
                      ? <p className="mt-0.5 truncate text-[11px] font-semibold" style={{ color: t.sub }}>{preset.systemPrompt.split('\n')[0]}</p>
                      : <p className="mt-0.5 text-[11px] font-semibold italic" style={{ color: t.sub }}>暂无 prompt，点编辑</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5" onClick={e => e.stopPropagation()}>
                    <button type="button" onClick={() => { setPresetDraft({ ...preset }); setEditingPresetId(preset.id); }} className="rounded-lg px-2 py-1 text-xs font-bold" style={{ color: t.sub }}>编辑</button>
                    {!preset.isBuiltin && <button type="button" onClick={() => handleDeleteCustomPreset(preset.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-red-500">删除</button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card index={2}>
        <Row id="summaryAutoWrite" glyph="spark" label="自动撰写上一期总结" desc="新的一周、一个月第一次打开时，上一期还没写就在后台写好，写完提醒你一次「可以查看了」。用当前选的风格"
          control={<Toggle checked={settings.summaryAutoWrite !== false} onChange={(v) => updateSettings({ summaryAutoWrite: v })} aria-label="自动撰写上一期总结" />} />
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold" style={{ color: t.sub }}><Glyph name="clock" size={13} /> 写好后会在顶部横幅提醒</p>
      </Card>
    </>
  );
};
