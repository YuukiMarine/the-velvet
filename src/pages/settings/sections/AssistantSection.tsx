/**
 * 助手（第 30 批 b）：人格（名册 + 新建 / 编辑）· 聊天 · 记忆 · 主动找你 · 进阶（对话模型 / 原生工具试验）。
 * 编辑器的状态与保存规则和旧版设置页共用 usePersonaEditor；这里只管长相（三频道游戏语言 + 中性）。
 * 测试钩子沿用旧版：data-persona-* / data-testid=daydream|native-tools / 各开关的 aria-label / 「编辑 名字」。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import { useNavigatorStore } from '@/store/navigator';
import { useBoldness } from '@/utils/boldness';
import { getAIConfig, getDeliberateAIConfig } from '@/utils/aiClient';
import { getProviderConfig, DEFAULT_PROVIDER } from '@/utils/aiProviders';
import { finalizeStaleSessions } from '@/utils/navigatorMemory';
import { snapshotFile } from '@/utils/imageCrop';
import { mergedNavigatorPresets, resolveNavigatorPreset } from '@/constants/navigatorPresets';
import { PresetAvatar, PRESET_GLYPH_IDS } from '@/components/navigator/PresetAvatar';
import { NavigatorNotebook } from '@/components/navigator/NavigatorNotebook';
import { TONE_WORDS, usePersonaEditor } from '@/components/navigator/usePersonaEditor';
import { ModelPickerSheet } from '@/components/ai/ModelPickerSheet';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, P5Rough, P5Star, roughQuad } from '@/components/p5r/kit';
import { P4Flower } from '@/ui/p4Kit';
import type { NavigatorPreset } from '@/types';
import { Card, Row, Divider, Toggle, Segmented, Btn, Input, Textarea, Chip, Note, Glyph, LinkValue, useSettingsSkin, skinTokens, type GlyphName } from '../kit';
import { RECORDS_LEVELS, RECORDS_LEVEL_DESC, RECORDS_LEVEL_LABELS, recordsLevelOf, recordsLevelPatch } from '@/utils/navigatorBriefing';
import { TEMPERAMENTS, TEMPERAMENT_DESC, TEMPERAMENT_LABELS, temperamentOf } from '@/utils/navigatorRead';
import { DayTrack } from '../dayTrack';
import { useSettingsNav } from '../nav';

/** 名册里一位人格：整张卡点了就切换；右边是编辑 / 删除 / 恢复默认 */
const PersonaCard = ({ preset, active, index, onSelect, actions }: {
  preset: NavigatorPreset;
  active: boolean;
  index: number;
  onSelect: () => void;
  actions: ReactNode;
}) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  const blurb = preset.personaPrompt.replace(/^你是「[^」]*」—*/, '').replace(/\s+/g, ' ').slice(0, 40);
  const tags = (
    <>
      {preset.isBuiltin && <TagChip active={active}>内置</TagChip>}
      {active && <TagChip active={active} strong>当前</TagChip>}
    </>
  );
  const ink = active ? (skin === 'p4' ? 'var(--ui-bg, #ffd900)' : skin === 'neutral' ? t.ink : '#fff') : t.ink;
  const sub = active ? (skin === 'p4' ? 'rgba(255,217,0,0.75)' : skin === 'neutral' ? t.sub : 'rgba(255,255,255,0.82)') : t.sub;
  const avatarBox = skin === 'p3'
    ? { background: active ? '#fff' : P3R.blue, color: active ? P3R.blue : '#fff', clipPath: slantClip(6) }
    : skin === 'p4'
      ? { background: active ? 'var(--ui-bg, #ffd900)' : '#131313', color: active ? '#131313' : 'var(--ui-bg, #ffd900)', borderRadius: 12 }
      : skin === 'p5'
        ? { background: active ? P5R.paper : P5R.ink, color: active ? P5R.red : P5R.paper, clipPath: roughQuad(1200 + index * 13, 3) }
        : { background: active ? 'var(--color-primary, #1b57ff)' : 'rgba(27,87,255,0.1)', color: active ? '#fff' : 'var(--color-primary, #1b57ff)', borderRadius: 12 };
  const body = (
    <button type="button" role="radio" aria-checked={active} onClick={onSelect} aria-label={`${preset.name}${active ? '（当前）' : ''}`}
      className="relative flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 text-left focus-visible:outline-none">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden" style={avatarBox}>
        <PresetAvatar avatar={preset.avatar} className={preset.avatar?.startsWith('data:') ? 'h-10 w-10' : 'h-[22px] w-[22px]'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {/* 蓝频道斜体：truncate 会按字框把斜出去的笔画裁掉（「猫」「机」右边缺一角），右边留一点内边距给斜出去的那截 */}
          <span className={`truncate text-[15px] font-black leading-tight ${skin === 'p3' ? 'pr-[0.22em]' : ''}`} style={{ color: ink, fontFamily: skin === 'p5' ? P5_TITLE_FONT : skin === 'p4' ? 'var(--p4-display-font, serif)' : undefined, fontStyle: skin === 'p3' ? 'italic' : undefined }}>{preset.name}</span>
          {tags}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] font-semibold" style={{ color: sub }}>{blurb}{blurb.length >= 40 ? '…' : ''}</span>
      </span>
    </button>
  );
  const row = (
    <div className="relative flex items-center gap-1 pr-2">
      {body}
      <span className="flex shrink-0 items-center" style={{ color: ink }}>{actions}</span>
    </div>
  );

  if (skin === 'p5') {
    return (
      <motion.div className="relative" initial={false} animate={{ rotate: active ? -0.8 : index % 2 ? 0.4 : -0.3 }} transition={{ type: 'spring', stiffness: 380, damping: 24 }} data-persona-card={preset.id}>
        <P5Rough seed={1100 + index * 11} jag={5} frame={2.5} face={active ? P5R.red : P5R.paper} shadow={{ x: active ? 4 : 2.5, y: active ? 5 : 3 }} />
        {active && (
          <motion.span aria-hidden className="absolute -right-2 -top-3" initial={anim ? { scale: 0, rotate: -40 } : false} animate={{ scale: 1, rotate: -12 }} transition={{ type: 'spring', stiffness: 480, damping: 18 }}>
            <P5Star size={26} fill={P5R.white} ring={P5R.ink} />
          </motion.span>
        )}
        {row}
      </motion.div>
    );
  }
  if (skin === 'p4') {
    return (
      <motion.div className="relative" data-persona-card={preset.id} initial={false} animate={{ rotate: active ? -0.8 : 0 }} transition={{ type: 'spring', stiffness: 380, damping: 24 }}
        style={{ borderRadius: 16, background: active ? '#131313' : 'var(--ui-paper, #fff6d0)', boxShadow: active ? '0 0 0 2.5px #131313, 0 5px 0 rgba(19,19,19,0.3)' : '0 0 0 2px #131313' }}>
        {active && (
          <motion.span aria-hidden className="absolute -right-1.5 -top-2" initial={anim ? { scale: 0, rotate: -90 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}>
            <P4Flower size={20} color="var(--p4-orange, #f9a11b)" />
          </motion.span>
        )}
        {row}
      </motion.div>
    );
  }
  if (skin === 'p3') {
    return (
      <div className="relative overflow-hidden" style={{ clipPath: slantClip(12), background: 'var(--p3r-chip, #ddeef7)' }} data-persona-card={preset.id}>
        {active && (
          <motion.span aria-hidden layoutId="settings-persona-cursor" className="absolute inset-0" style={{ background: P3R.blue }}
            transition={anim ? { type: 'spring', stiffness: 420, damping: 34 } : { duration: 0 }}>
            <span className="absolute bottom-0 right-6 h-[8px] w-[26px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          </motion.span>
        )}
        {row}
      </div>
    );
  }
  return (
    <div className={`relative rounded-2xl transition-colors ${active ? 'bg-primary/10 ring-2 ring-primary' : 'ring-1 ring-gray-200 dark:ring-gray-700'}`} data-persona-card={preset.id}>
      {row}
    </div>
  );
};

/** 名册卡上的小签：内置 / 当前 */
const TagChip = ({ children, active, strong }: { children: ReactNode; active: boolean; strong?: boolean }) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const style = skin === 'p3'
    ? { background: active ? '#fff' : 'rgba(10,18,48,0.08)', color: active ? P3R.blue : t.sub, clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)' }
    : skin === 'p4'
      ? { background: active ? 'var(--ui-bg, #ffd900)' : '#131313', color: active ? '#131313' : 'var(--ui-bg, #ffd900)', borderRadius: 999 }
      : skin === 'p5'
        ? { background: active ? P5R.ink : P5R.paperDim, color: active ? P5R.white : P5R.ink, clipPath: 'polygon(2px 0, 100% 1px, calc(100% - 2px) 100%, 0 calc(100% - 1px))' }
        : { background: strong ? 'var(--color-primary, #1b57ff)' : 'rgba(107,122,153,0.14)', color: strong ? '#fff' : t.sub, borderRadius: 6 };
  return <span className="shrink-0 px-1.5 py-[1px] text-[10px] font-black leading-[15px]" style={style}>{children}</span>;
};

/** 名册右边的小图标按钮 */
const IconAct = ({ glyph, label, onClick }: { glyph: GlyphName; label: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} aria-label={label} title={label} className="flex h-8 w-8 items-center justify-center opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">
    <Glyph name={glyph} size={17} />
  </button>
);

/** 剪影头像选择：一格一个，选中的按频道高亮 */
const AvatarTile = ({ selected, onClick, label, children, index }: { selected: boolean; onClick: () => void; label: string; children: ReactNode; index: number }) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  if (skin === 'p5') {
    return (
      <motion.button type="button" whileTap={{ x: 1.5, y: 2 }} onClick={onClick} aria-label={label} aria-pressed={selected} className="relative flex h-11 w-11 items-center justify-center" style={{ color: selected ? P5R.white : P5R.ink }}>
        <P5Rough seed={1300 + index * 7} jag={3.5} frame={2} face={selected ? P5R.red : P5R.paper} shadow={{ x: 2, y: 2.5 }} />
        <span className="relative">{children}</span>
      </motion.button>
    );
  }
  const style = skin === 'p3'
    ? { clipPath: slantClip(6), background: selected ? P3R.blue : 'var(--p3r-chip, #ddeef7)', color: selected ? '#fff' : t.ink }
    : skin === 'p4'
      ? { borderRadius: 12, background: selected ? '#131313' : 'var(--ui-paper, #fff6d0)', color: selected ? 'var(--ui-bg, #ffd900)' : 'var(--ui-ink, #131313)', boxShadow: '0 0 0 2px #131313' }
      : { borderRadius: 12, background: selected ? 'var(--color-primary, #1b57ff)' : 'rgba(107,122,153,0.12)', color: selected ? '#fff' : t.sub };
  return (
    <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onClick} aria-label={label} aria-pressed={selected} className="flex h-11 w-11 items-center justify-center overflow-hidden" style={style}>
      {children}
    </motion.button>
  );
};

/** 编辑器里的小标题 */
const FieldLabel = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-[12px] font-black" style={{ color: t.ink, fontFamily: skin === 'p5' ? P5_TITLE_FONT : undefined }}>{children}</span>
      {extra}
    </div>
  );
};

export const AssistantSection = () => {
  const { settings, updateSettings } = useAppStore(useShallow(s => ({ settings: s.settings, updateSettings: s.updateSettings })));
  const recordsLevel = recordsLevelOf(settings);
  const temperament = temperamentOf(settings);
  const presets = useNavigatorStore(s => s.presets);
  // 和 store.activePreset() 同一个解析（自定义人格缺失时回落黑猫），直接用订阅到的设置和名册算，换人格立刻跟上
  const activePreset = resolveNavigatorPreset(settings.navigatorPresetId, presets);
  const nav = useSettingsNav();
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const hasAI = !!getAIConfig(settings);
  const editor = usePersonaEditor();
  const { gen, setGen } = editor;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveDone, setArchiveDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { void useNavigatorStore.getState().loadPresets(); }, []);
  // 打开编辑器时滚过去（名册长的时候编辑器在屏幕外）
  useEffect(() => {
    if (!gen.open) return;
    const id = window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    return () => window.clearTimeout(id);
  }, [gen.open, gen.editId]);

  const allPresets = mergedNavigatorPresets(presets);
  const activeId = activePreset.id;
  const modelText = settings.assistantModel?.trim()
    ? `${getProviderConfig(settings.assistantProvider ?? settings.summaryApiProvider ?? DEFAULT_PROVIDER).label} · ${settings.assistantModel.trim()}`
    : `跟随深思熟虑档${hasAI ? `（${getDeliberateAIConfig(settings)?.model ?? '未配置'}）` : ''}`;

  const runArchive = async () => {
    setArchiving(true);
    setArchiveDone(null);
    const last = await finalizeStaleSessions();
    setArchiving(false);
    setArchiveDone(last ? '已归档，最近摘要：' + last.summary.slice(0, 40) + '…' : '没有待归档的会话');
  };

  return (
    <>
      {/* ── 人格 ── */}
      <Card title="人格" meta={`当前 · ${activePreset.name}`} index={0}>
        <p className="mb-3 text-[12px] font-semibold leading-snug" style={{ color: t.sub, opacity: skin === 'p4' ? 0.72 : 1 }}>
          点一下就换人格，会开启（或恢复）它今天的对话。能力不变，变的只是性格和嘴。
        </p>
        <div role="radiogroup" aria-label="人格" className="space-y-2.5" data-setting-row="navigatorPersonas">
          {allPresets.map((p, i) => (
            <PersonaCard
              key={p.id}
              preset={p}
              index={i}
              active={activeId === p.id}
              onSelect={() => { if (activeId !== p.id) void useNavigatorStore.getState().switchPreset(p.id); }}
              actions={!p.isBuiltin ? (
                <>
                  <IconAct glyph="pen" label={`编辑 ${p.name}`} onClick={() => editor.openEditor(p)} />
                  <IconAct glyph="trash" label={`删除 ${p.name}`} onClick={() => setDeleteTarget({ id: p.id, label: p.name })} />
                </>
              ) : presets.some((c) => c.id === p.id) ? (
                // 内置人格的「影子行」（换过头像等）：删掉影子就恢复默认
                <button type="button" onClick={() => void useNavigatorStore.getState().deletePreset(p.id).then(() => useNavigatorStore.getState().loadPresets())} aria-label={`恢复 ${p.name} 默认`}
                  className="px-1.5 text-[11px] font-black opacity-80 hover:opacity-100">恢复默认</button>
              ) : null}
            />
          ))}
        </div>
        <div className="mt-3.5">
          {hasAI ? (
            !gen.open && <Btn tone="soft" className="w-full" onClick={() => editor.openEditor()}><span className="inline-flex items-center justify-center gap-1.5"><Glyph name="plus" size={16} />新建人格（AI 生成）</span></Btn>
          ) : (
            <Note action={<Btn small tone="soft" onClick={() => nav.open('ai', { aiJump: true })}>去配置</Btn>}>配好 AI 服务的 Key 之后才能创建自定义人格。</Note>
          )}
        </div>
      </Card>

      {/* ── 新建 / 编辑人格 ── */}
      <AnimatePresence initial={false}>
        {gen.open && (
          <motion.div key={gen.editId ?? 'new'} ref={editorRef} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="scroll-mt-4" data-persona-editor>
            <Card index={1} title={gen.editId ? '编辑人格' : '新建人格'} meta={<button type="button" onClick={editor.closeEditor} aria-label="关闭" className="flex h-7 w-7 items-center justify-center text-[15px] font-black" style={{ color: t.ink }}>✕</button>}>
              <div className="space-y-4">
                <div>
                  <FieldLabel>名字</FieldLabel>
                  <Input value={gen.name} aria-label="名字" onChange={(e) => setGen((s) => ({ ...s, name: e.target.value }))} placeholder="比如：白手套 / 老班长" />
                </div>
                <div>
                  <FieldLabel>头像</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    {PRESET_GLYPH_IDS.map((g, i) => (
                      <AvatarTile key={g} index={i} label={`剪影 ${g}`} selected={gen.avatar === g} onClick={() => setGen((s) => ({ ...s, avatar: g }))}>
                        <PresetAvatar avatar={g} className="h-[22px] w-[22px]" />
                      </AvatarTile>
                    ))}
                    {gen.avatar.startsWith('data:') && (
                      <AvatarTile index={9} label="上传的头像" selected onClick={() => {}}>
                        <PresetAvatar avatar={gen.avatar} className="h-11 w-11" />
                      </AvatarTile>
                    )}
                    <Btn small tone="soft" onClick={() => fileRef.current?.click()} ariaLabel="上传头像">上传</Btn>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" data-plain="1"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void snapshotFile(f).then(setCropFile).catch(() => setCropFile(f)); }} />
                  </div>
                  <p className="mt-1.5 text-[11px] font-semibold" style={{ color: t.sub }}>上传的头像只存本机，永不上云。</p>
                </div>

                {!gen.editId && (
                  <>
                    <div>
                      <FieldLabel>它怎么称呼你</FieldLabel>
                      <Input value={gen.callUser} aria-label="它怎么称呼你" onChange={(e) => setGen((s) => ({ ...s, callUser: e.target.value }))} placeholder="可空，比如：老板 / 小朋友" />
                    </div>
                    <div>
                      <FieldLabel>语气关键词（多选）</FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {TONE_WORDS.map((w, i) => (
                          <Chip key={w} seed={i} on={gen.toneWords.includes(w)}
                            onClick={() => setGen((s) => ({ ...s, toneWords: s.toneWords.includes(w) ? s.toneWords.filter((x) => x !== w) : [...s.toneWords, w] }))}>
                            {w}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div>
                      <FieldLabel>自由描述</FieldLabel>
                      <Textarea value={gen.freeText} aria-label="自由描述" rows={2} onChange={(e) => setGen((s) => ({ ...s, freeText: e.target.value }))} placeholder="可空：口头禅、背景设定、想避免的说话方式…" />
                    </div>
                    <Btn className="w-full" disabled={gen.generating} onClick={() => void editor.runGenerate()}>
                      {gen.generating ? '生成中…' : gen.personaPrompt ? '换一版' : 'AI 生成人格设定'}
                    </Btn>
                  </>
                )}

                {(gen.personaPrompt || gen.editId) && (
                  <>
                    <div>
                      <FieldLabel>人格设定（保存前可随意修改）</FieldLabel>
                      <Textarea value={gen.personaPrompt} aria-label="人格设定" rows={6} onChange={(e) => setGen((s) => ({ ...s, personaPrompt: e.target.value }))} />
                    </div>
                    <div data-persona-examples>
                      <FieldLabel extra={hasAI && (
                        <Btn small tone="soft" disabled={gen.examplesBusy || !gen.personaPrompt.trim()} onClick={() => void editor.runExamples()}>{gen.examplesBusy ? '写着…' : '让 AI 写三句'}</Btn>
                      )}>口吻示例</FieldLabel>
                      <Textarea value={gen.examples} aria-label="口吻示例" rows={3} onChange={(e) => setGen((s) => ({ ...s, examples: e.target.value }))} placeholder={'嗯，我在听。\n书架第三排，慢慢找。'} />
                      <p className="mt-1 text-[11px] font-semibold" style={{ color: t.sub }}>一行一句，最多 5 句；只教语气和长短，不是台词库。</p>
                    </div>
                    <div data-persona-coach>
                      <FieldLabel>相处方式</FieldLabel>
                      <Segmented ariaLabel="相处方式" value={gen.coach} onChange={(v) => setGen((s) => ({ ...s, coach: v }))}
                        options={[{ value: 'accompany', label: '陪伴型' }, { value: 'push', label: '督促型' }]} />
                      <p className="mt-1.5 text-[11px] font-semibold" style={{ color: t.sub }}>督促型会提你没做的事（一天一次、只说事实）；陪伴型只提好事和快到的事。</p>
                    </div>
                    {!editor.editingBuiltin && (
                      <div data-persona-know-since>
                        <FieldLabel>认识你多久了</FieldLabel>
                        <Segmented ariaLabel="认识你多久了" value={gen.knowSince} onChange={(v) => setGen((s) => ({ ...s, knowSince: v }))}
                          options={[{ value: 'always', label: '一直都在' }, { value: 'fresh', label: '刚认识' }]} />
                        <p className="mt-1.5 text-[11px] font-semibold" style={{ color: t.sub }}>「刚认识」的头 7 天它只知道今天的状态，之后才看得到你的记录。</p>
                      </div>
                    )}
                    {!editor.editingBuiltin && (
                      <div data-persona-traits>
                        <FieldLabel>喜好</FieldLabel>
                        <div className="space-y-2">
                          {([['likes', '喜欢', '晒太阳、热可可'], ['dislikes', '讨厌', '下雨、闹钟'], ['habits', '小习惯', '下雨天话变少']] as const).map(([k, label, ph]) => (
                            <label key={k} className="flex items-center gap-2.5">
                              <span className="w-12 shrink-0 text-[12px] font-black" style={{ color: t.sub }}>{label}</span>
                              <Input value={gen[k]} aria-label={`${label}（用「、」隔开）`} placeholder={ph} onChange={(e) => setGen((s) => ({ ...s, [k]: e.target.value }))} />
                            </label>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[11px] font-semibold" style={{ color: t.sub }}>它每天的小状态会用到；用「、」隔开，留空的话第一次用到时按人格设定自动写。</p>
                      </div>
                    )}
                  </>
                )}

                {gen.error && <Note tone="warn">{gen.error}</Note>}
                <div className="flex gap-2.5">
                  <Btn className="flex-1" disabled={!gen.personaPrompt.trim() || !gen.name.trim()} onClick={() => void editor.savePreset()}>保存</Btn>
                  <Btn tone="soft" onClick={editor.closeEditor}>取消</Btn>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 聊天 ── */}
      <Card title="聊天" index={2}>
        <Row id="navigatorImmersive" glyph="bubble" label="拟真增强" desc="回复像真人打字：一句句冒出来，括号里的颜文字不拆开；低性能模式下自动停用"
          control={<Toggle checked={!!settings.navigatorImmersive} onChange={(v) => updateSettings({ navigatorImmersive: v })} aria-label="拟真增强" />} />
        <Divider />
        <div data-testid="records-level">
          <Row id="navigatorBriefing" glyph="doc" label="让助手了解你的记录" desc={`${RECORDS_LEVEL_LABELS[recordsLevel]}：${RECORDS_LEVEL_DESC[recordsLevel]}`}>
            <Segmented ariaLabel="让助手了解你的记录" size="sm" value={recordsLevel} onChange={(v) => updateSettings(recordsLevelPatch(v))}
              options={RECORDS_LEVELS.map((v) => ({ value: v, label: RECORDS_LEVEL_LABELS[v], hint: RECORDS_LEVEL_DESC[v] }))} />
          </Row>
        </div>
        <Divider />
        <div data-testid="temperament">
          <Row id="navigatorTemperament" glyph="bubble" label="性格" desc={`${TEMPERAMENT_LABELS[temperament]}：${TEMPERAMENT_DESC[temperament]}。读空气不受它管`}>
            <Segmented ariaLabel="性格" size="sm" value={temperament} onChange={(v) => updateSettings({ navigatorTemperament: v })}
              options={TEMPERAMENTS.map((v) => ({ value: v, label: TEMPERAMENT_LABELS[v], hint: TEMPERAMENT_DESC[v] }))} />
          </Row>
        </div>
        <Divider />
        <div data-testid="daydream">
          <Row id="navigatorDaydream" glyph="thought" label="走神" desc="闲聊时偶尔像真人那样想起一件旧事；你心情不好、在倾诉时不会，五轮内不重复">
            <Segmented ariaLabel="走神" size="sm" value={settings.navigatorDaydream ?? 'sometimes'} onChange={(v) => updateSettings({ navigatorDaydream: v })}
              options={[{ value: 'off', label: '不走神' }, { value: 'sometimes', label: '偶尔' }, { value: 'often', label: '经常' }]} />
          </Row>
        </div>
        <Divider />
        <Row id="wishAgentProposals" glyph="wish" label="主动提议更新愿望进度" desc="你提到某个愿望有推进时问一句要不要更新；同一个愿望 6 小时内最多一次，落库永远要你点确认"
          control={<Toggle checked={settings.wishAgentProposals !== false} onChange={(v) => updateSettings({ wishAgentProposals: v })} aria-label="主动提议更新愿望进度" />} />
      </Card>

      {/* ── 记忆 ── */}
      <Card title="记忆" index={3}>
        <Row id="navigatorNotebook" glyph="notebook" label="记事本" desc="它记住的关于你的事：长期画像 + 零散记忆，可改可删，只存本机"
          control={<Btn small onClick={() => setNotebookOpen(true)} ariaLabel="打开记事本">打开</Btn>} />
        <Divider />
        <Row id="navigatorProfileAuto" glyph="pen" label="画像自动更新"
          desc="开着：聊天收进记忆时，它会按对话更新记事本里的画像（长期目标、偏好与雷区…），锁住的块不动。关掉：画像只有你自己改，它只记零散的事"
          control={<Toggle checked={settings.navigatorProfileAuto !== false} onChange={(v) => updateSettings({ navigatorProfileAuto: v })} aria-label="画像自动更新" />} />
        {settings.navigatorProfileAuto !== false && (
          <>
            <Divider />
            <Row id="navigatorProfileFromRecords" glyph="doc" label="画像参考我的记录"
              desc={recordsLevel === 'off'
                ? '「让助手了解你的记录」关着，这一项不生效'
                : '每 5 天按你的愿望、倒计时、宣告卡、做成的大事、坚持的每日任务和本周目标，整理一次「长期目标」和「近况」；偏好与雷区只认你在聊天里亲口说的'}
              control={<Toggle checked={settings.navigatorProfileFromRecords !== false} onChange={(v) => updateSettings({ navigatorProfileFromRecords: v })} aria-label="画像参考我的记录" />} />
          </>
        )}
        <Divider />
        <Row id="navigatorMemoryIsolated" glyph="users" label="记忆按人格隔离"
          desc="关着：所有人格共用一本记事本。开着：各记各的，像换了个人；以前没标人格的算「共享」，谁都读得到。关掉不会丢东西"
          control={<Toggle checked={!!settings.navigatorMemoryIsolated} onChange={(v) => updateSettings({ navigatorMemoryIsolated: v })} aria-label="记忆按人格隔离" />} />
        <Divider />
        <Row id="navigatorArchive" glyph="archive" label="整理旧对话" desc="把之前没归档的聊天收进记忆（平时它会自己做）"
          control={<Btn small tone="soft" disabled={archiving} onClick={() => void runArchive()} ariaLabel="整理旧对话">{archiving ? '整理中…' : '整理'}</Btn>} />
        {archiveDone && <p className="pb-1 text-[11.5px] font-semibold" style={{ color: t.sub }}>{archiveDone}</p>}
      </Card>

      {/* ── 主动找你 ── */}
      <Card title="主动找你" index={4}>
        <Row id="navigatorPush" glyph="bell" label="主动找你"
          desc={`每天最多一条：约好的事过后问一句结果、认识满一个月这样的日子、好几天没见时说一次想念。锁屏上只写「${activePreset.name}有话想跟你说」`}
          control={<Toggle checked={settings.navigatorPushEnabled !== false} onChange={(v) => updateSettings({ navigatorPushEnabled: v })} aria-label="主动找你" />} />
        {settings.navigatorPushEnabled !== false && (
          <div className="pb-1 pt-1">
            <DayTrack ariaLabel="夜里 22:30 到早上 8:30 不发" bands={[{ from: '22:30', to: '08:30', label: '22:30–08:30 不打扰' }]} />
          </div>
        )}
        {!settings.notificationsEnabled && (
          <div className="mt-2.5">
            <Note tone="warn" action={<Btn small tone="soft" onClick={() => nav.open('notifications', { row: 'notificationsEnabled' })}>去打开</Btn>}>要先打开「每日提醒」，它才发得出来。</Note>
          </div>
        )}
      </Card>

      {/* ── 进阶 ── */}
      <Card title="进阶" index={5}>
        <Row id="assistantModel" glyph="chip" label="对话模型" desc="只给助手（对话 / 问候 / 人格生成）单独指定，可跨服务商；不影响其它走深思熟虑的功能"
          onClick={() => (hasAI ? setPickerOpen(true) : nav.open('ai', { aiJump: true }))}
          control={<LinkValue>{hasAI ? (settings.assistantModel?.trim() ? '已指定' : '跟随') : '先配 Key'}</LinkValue>} />
        <p className="-mt-1 pb-2 pl-12 text-[11.5px] font-bold" style={{ color: t.ink }} data-testid="assistant-model-value">{modelText}</p>
        {settings.assistantModel && (
          <div className="pb-2 pl-12">
            <Btn small tone="soft" onClick={() => updateSettings({ assistantModel: undefined, assistantProvider: undefined })}>恢复跟随深思熟虑档</Btn>
          </div>
        )}
        <Divider />
        <div data-testid="native-tools">
          <Row id="navigatorNativeTools" glyph="flask" label="实验：原生工具调用"
            desc="开着：判断要不要开卡、要不要先查你的记录时改用厂商的工具调用接口（最多两步）；回复不受影响，不支持会自动退回。只在 OpenAI 兼容接口上生效"
            control={<Toggle checked={!!settings.navigatorNativeTools} onChange={(v) => updateSettings({ navigatorNativeTools: v })} aria-label="实验：原生工具调用" />} />
        </div>
      </Card>

      <ModelPickerSheet mode="assistant" isOpen={pickerOpen} onClose={() => setPickerOpen(false)} />
      <ImageCropDialog
        isOpen={!!cropFile}
        file={cropFile}
        title="调整人格头像"
        onCancel={() => setCropFile(null)}
        onConfirm={(dataUrl) => { setGen((s) => ({ ...s, avatar: dataUrl })); setCropFile(null); }}
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        tone="danger"
        title={`删除人格「${deleteTarget?.label ?? ''}」？`}
        description="它的历史会话仍会保留。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={() => { const tgt = deleteTarget; setDeleteTarget(null); if (tgt) void useNavigatorStore.getState().deletePreset(tgt.id); }}
        onCancel={() => setDeleteTarget(null)}
      />
      <NavigatorNotebook isOpen={notebookOpen} onClose={() => setNotebookOpen(false)} />
    </>
  );
};
