/**
 * NavigatorSettings — 设置 → 黑猫区（F6 Batch3 终段，落位已拍板）。
 *
 * 三块：人格管理（内置 3 + 自定义，切换=开/恢复该人格今日会话）·
 * 人格生成器（**仅有 Key 可见**；偏好 chips + 自由描述 → AI 生成 → 预览可改再保存；
 * 头像 = 剪影集默认 + 可选本地上传裁切，local-only）· 记事本（原子记忆查看/编辑/删除/置顶）。
 * 另含手动归档（compact 主泵的手动入口备份）。
 */
import { useEffect, useRef, useState } from 'react';
import { snapshotFile } from '@/utils/imageCrop';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { DiamondMarkIcon, NotebookIcon } from '@/components/settingsIcons';
import { useNavigatorStore } from '@/store/navigator';
import { getAIConfig, getDeliberateAIConfig } from '@/utils/aiClient';
import { getProviderConfig, DEFAULT_PROVIDER } from '@/utils/aiProviders';
import { ModelPickerSheet } from '@/components/ai/ModelPickerSheet';
import { finalizeStaleSessions } from '@/utils/navigatorMemory';
import { mergedNavigatorPresets } from '@/constants/navigatorPresets';
import { RECORDS_LEVELS, RECORDS_LEVEL_DESC, RECORDS_LEVEL_LABELS, recordsLevelOf, recordsLevelPatch } from '@/utils/navigatorBriefing';
import { TONE_WORDS, closedGenerator, usePersonaEditor } from './usePersonaEditor';
import { Toggle } from '@/components/Toggle';
import { PresetAvatar, PRESET_GLYPH_IDS } from './PresetAvatar';
import { NavigatorNotebook } from './NavigatorNotebook';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { NavigatorPreset } from '@/types';

// 编辑器的状态与动作在 usePersonaEditor（第 30 批 b：新版设置页共用）

export const NavigatorSettings = () => {
  const { settings, updateSettings } = useAppStore(useShallow(s => ({ settings: s.settings, updateSettings: s.updateSettings })));
  const recordsLevel = recordsLevelOf(settings);
  const nav = useNavigatorStore();
  const hasAI = !!getAIConfig(settings);
  const activeId = nav.activePreset().id;
  const activePresetName = nav.activePreset().name;

  const { gen, setGen, openEditor, editingBuiltin, runGenerate, runExamples, savePreset } = usePersonaEditor();
  // 深思熟虑档选择面板（与设置页共用 ModelPickerSheet，列表读 aiProfiles 缓存）
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  // 对话模型是副入口：默认收起，不跟人格/记事本抢注意力
  const [modelCardOpen, setModelCardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'preset'; id: string; label: string } | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveDone, setArchiveDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void nav.loadPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 人格（影子行覆盖内置后去重） ──

  const allPresets: NavigatorPreset[] = mergedNavigatorPresets(nav.presets);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await nav.deletePreset(deleteTarget.id);
    setDeleteTarget(null);
  };

  const runArchive = async () => {
    setArchiving(true);
    setArchiveDone(null);
    const last = await finalizeStaleSessions();
    setArchiving(false);
    setArchiveDone(last ? '已归档，最近摘要：' + last.summary.slice(0, 40) + '…' : '没有待归档的会话');
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-medium transition ${active
      ? 'bg-primary text-white shadow-sm shadow-primary/20'
      : 'border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'}`;

  return (
    <div className="space-y-5">
      {/* ── 拟真增强 ── */}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">拟真增强</div>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
            回复像真人打字：流式生成 + 按句子切成碎气泡逐条冒出（1.2s 一条）；括号里的颜文字、括注不拆开。低性能模式下自动停用。
          </p>
        </div>
        <div className="mt-0.5 shrink-0">
          <Toggle
            checked={!!settings.navigatorImmersive}
            onChange={(v) => updateSettings({ navigatorImmersive: v })}
            aria-label="拟真增强"
          />
        </div>
      </div>

      {/* ── 愿望进度的主动提议（PRD_V2.6 §8）──
          关掉之后它照旧读得到愿望（聊天时能自然接话），只是不再弹确认卡 */}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">主动提议更新愿望进度</div>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
            你在对话里提到某个愿望有推进时，它会问一句「要不要更新进度」。
            只在<b>明确指向单个愿望且确有推进</b>时才问，同一个愿望 6 小时内至多一次；
            落库永远要你点确认。关掉后它照旧知道你的愿望，只是不再主动问。
          </p>
        </div>
        <div className="mt-0.5 shrink-0">
          <Toggle
            checked={settings.wishAgentProposals !== false}
            onChange={(v) => updateSettings({ wishAgentProposals: v })}
            aria-label="主动提议更新愿望进度"
          />
        </div>
      </div>

      {/* ── 助手找你（第二批 C）：和提醒设置里那个是同一个开关 ── */}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">主动找你</div>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
            每天最多一条推送：约好的事过后问你一句结果、认识满一个月这样的日子、好几天没见时说一次想念。
            夜里不发；锁屏上只写「{activePresetName}有话想跟你说」。
            {!settings.notificationsEnabled && <b> 要先在「提醒」里打开每日提醒。</b>}
          </p>
        </div>
        <div className="mt-0.5 shrink-0">
          <Toggle
            checked={settings.navigatorPushEnabled !== false}
            onChange={(v) => updateSettings({ navigatorPushEnabled: v })}
            aria-label="主动找你"
          />
        </div>
      </div>

      {/* ── 人格管理 ── */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700/80">
        <span aria-hidden className="text-gray-500 dark:text-gray-300"><DiamondMarkIcon className="h-[18px] w-[18px]" /></span>
        <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">人格</h4>
      </div>
      <p className="-mt-2 text-sm text-gray-500 dark:text-gray-400">切换人格会开启（或恢复）它今天的对话。能力不变，变的只是性格和嘴。</p>
      {/* ── 画像自动更新 / 参考我的记录（第 33 批）── */}
      <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700" data-testid="profile-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">画像自动更新</div>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
              开着：聊天收进记忆时，它会按对话更新记事本里的画像（长期目标、偏好与雷区…），锁住的块不动。关掉：画像只有你自己改，它只记零散的事。
            </p>
          </div>
          <div className="mt-0.5 shrink-0">
            <Toggle checked={settings.navigatorProfileAuto !== false} onChange={(v) => updateSettings({ navigatorProfileAuto: v })} aria-label="画像自动更新" />
          </div>
        </div>
        {settings.navigatorProfileAuto !== false && (
          <div className="mt-3 flex items-start justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-700/60">
            <div>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">画像参考我的记录</div>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                {recordsLevel === 'off'
                  ? '「让助手了解你的记录」关着，这一项不生效。'
                  : '每 5 天按你的愿望、倒计时、宣告卡、做成的大事、坚持的每日任务和本周目标，整理一次「长期目标」和「近况」；偏好与雷区只认你在聊天里亲口说的。'}
              </p>
            </div>
            <div className="mt-0.5 shrink-0">
              <Toggle checked={settings.navigatorProfileFromRecords !== false} onChange={(v) => updateSettings({ navigatorProfileFromRecords: v })} aria-label="画像参考我的记录" />
            </div>
          </div>
        )}
      </div>
      {/* ── 记忆按人格隔离（第 23 批）── */}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">记忆按人格隔离</div>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
            关着：所有人格共用一本记事本（一个助手、几张面孔）。开着：各人格各记各的，像换了个人；以前记下的、没标人格的算「共享」，谁都读得到。
            记事本里能按人格翻看、改动，也能把一条挪给别的人格或设为共享。关掉不会丢东西，只是又合在一起读。
          </p>
        </div>
        <div className="mt-0.5 shrink-0">
          <Toggle
            checked={!!settings.navigatorMemoryIsolated}
            onChange={(v) => updateSettings({ navigatorMemoryIsolated: v })}
            aria-label="记忆按人格隔离"
          />
        </div>
      </div>
      {/* ── 走神（第 26 批 · 联想）：闲聊时偶尔顺口想起一条不那么相关的旧事 ── */}
      <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700" data-testid="daydream">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">走神</div>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
              闲聊时偶尔像真人那样联想：说到咖啡想起你那次把咖啡洒键盘上，下雨天想起上次下雨的事。只在你心情不差、没在倾诉时才会；五轮内不重复。记事本里能看到它想起了什么。
            </p>
          </div>
        </div>
        <div className="mt-2 flex gap-1.5">
          {([['off', '不走神'], ['sometimes', '偶尔'], ['often', '经常']] as const).map(([v, label]) => {
            const on = (settings.navigatorDaydream ?? 'sometimes') === v;
            return (
              <button key={v} type="button" aria-pressed={on} onClick={() => updateSettings({ navigatorDaydream: v })}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${on ? 'bg-primary text-white' : 'border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {/* ── 让助手了解你的记录（第 25 批 · 用户简报；第 35 批 f 改三档）── */}
      <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700" data-testid="records-level">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">让助手了解你的记录</div>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          记录是你的，不受「记忆按人格隔离」影响；「刚认识」的人格头 7 天看不到。{RECORDS_LEVEL_LABELS[recordsLevel]}：{RECORDS_LEVEL_DESC[recordsLevel]}。
        </p>
        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="让助手了解你的记录">
          {RECORDS_LEVELS.map((v) => {
            const on = recordsLevel === v;
            return (
              <button key={v} type="button" role="radio" aria-checked={on} title={RECORDS_LEVEL_DESC[v]} onClick={() => updateSettings(recordsLevelPatch(v))}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${on ? 'bg-primary text-white' : 'border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'}`}>
                {RECORDS_LEVEL_LABELS[v]}
              </button>
            );
          })}
        </div>
      </div>
      {/* ── 实验：原生工具调用（第 28 批 · PRD §24.10.4，默认关）── */}
      <div className="flex items-start justify-between gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-3 dark:border-gray-600" data-testid="native-tools">
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">实验：原生工具调用</div>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
            开着：助手判断「要不要开卡、要不要先查你的记录」时改用模型厂商的工具调用接口，理论上判得更准、能先查再出卡（最多两步）。
            回复本身不受影响。服务商不支持会自动退回现在的方式并记住。只在 OpenAI 兼容接口上生效，默认关。
          </p>
        </div>
        <div className="mt-0.5 shrink-0">
          <Toggle
            checked={!!settings.navigatorNativeTools}
            onChange={(v) => updateSettings({ navigatorNativeTools: v })}
            aria-label="实验：原生工具调用"
          />
        </div>
      </div>
      <div className="space-y-2">
        {allPresets.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 transition ${activeId === p.id ? 'border-primary/60 bg-primary/5 dark:bg-primary/10' : 'border-gray-200 dark:border-gray-700'}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <PresetAvatar avatar={p.avatar} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-gray-800 dark:text-white">{p.name}</span>
                {p.isBuiltin && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 dark:bg-gray-700 dark:text-gray-400">内置</span>}
                {activeId === p.id && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">当前</span>}
              </div>
              <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">{p.personaPrompt.replace(/^你是「[^」]*」—*/, '').slice(0, 40)}…</p>
            </div>
            {activeId !== p.id && (
              <button type="button" onClick={() => void nav.switchPreset(p.id)}
                className="shrink-0 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10">
                切换
              </button>
            )}
            {!p.isBuiltin ? (
              <>
                <button type="button" onClick={() => openEditor(p)} aria-label={`编辑 ${p.name}`}
                  className="shrink-0 rounded p-1 text-xs text-gray-400 hover:text-primary">编辑</button>
                <button type="button" onClick={() => setDeleteTarget({ kind: 'preset', id: p.id, label: p.name })} aria-label={`删除 ${p.name}`}
                  className="shrink-0 rounded p-1 text-xs text-gray-400 hover:text-red-400">删除</button>
              </>
            ) : nav.presets.some((c) => c.id === p.id) && (
              // 内置人格的"影子行"（个性化头像等覆盖）——删除影子即恢复默认
              <button type="button" onClick={() => void nav.deletePreset(p.id).then(() => nav.loadPresets())} aria-label={`恢复 ${p.name} 默认`}
                className="shrink-0 rounded p-1 text-xs text-gray-400 hover:text-primary">恢复默认</button>
            )}
          </div>
        ))}
      </div>

      {/* 生成器入口：仅有 Key 可见（已拍板） */}
      {hasAI ? (
        !gen.open && (
          <button type="button" onClick={() => openEditor()}
            className="w-full rounded-xl border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-semibold text-gray-500 transition hover:border-primary/50 hover:text-primary dark:border-gray-600 dark:text-gray-400">
            ＋ 新建人格（AI 生成）
          </button>
        )
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500">配置 AI 密钥后可创建自定义人格。</p>
      )}

      {/* ── 生成器 ── */}
      {gen.open && (
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/60">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-bold text-gray-800 dark:text-white">{gen.editId ? '编辑人格' : '新建人格'}</h5>
            <button type="button" onClick={() => setGen(closedGenerator)} aria-label="关闭" className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <input
            value={gen.name}
            onChange={(e) => setGen((s) => ({ ...s, name: e.target.value }))}
            placeholder="名字（如：白手套 / 老班长…）"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
          {/* 头像：剪影集 + 本地上传（local-only） */}
          <div>
            <div className="mb-1.5 text-xs text-gray-400 dark:text-gray-500">头像</div>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_GLYPH_IDS.map((g) => (
                <button key={g} type="button" onClick={() => setGen((s) => ({ ...s, avatar: g }))} aria-label={`剪影 ${g}`}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${gen.avatar === g ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400 dark:bg-gray-700'}`}>
                  <PresetAvatar avatar={g} className="h-5 w-5" />
                </button>
              ))}
              {gen.avatar.startsWith('data:') && (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg ring-2 ring-primary">
                  <PresetAvatar avatar={gen.avatar} className="h-8 w-8" />
                </span>
              )}
              <button type="button" onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-dashed border-gray-300 px-2.5 py-2 text-xs text-gray-400 hover:border-primary/50 hover:text-primary dark:border-gray-600">
                上传
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void snapshotFile(f).then(setCropFile).catch(() => setCropFile(f)); }} />
            </div>
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">上传头像只存本机，永不上云。</p>
          </div>
          {!gen.editId && (
            <>
              <input
                value={gen.callUser}
                onChange={(e) => setGen((s) => ({ ...s, callUser: e.target.value }))}
                placeholder="它怎么称呼你？（可空，如：老板 / 小朋友）"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <div>
                <div className="mb-1.5 text-xs text-gray-400 dark:text-gray-500">语气关键词（多选）</div>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_WORDS.map((w) => (
                    <button key={w} type="button" className={chip(gen.toneWords.includes(w))}
                      onClick={() => setGen((s) => ({ ...s, toneWords: s.toneWords.includes(w) ? s.toneWords.filter((x) => x !== w) : [...s.toneWords, w] }))}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={gen.freeText}
                onChange={(e) => setGen((s) => ({ ...s, freeText: e.target.value }))}
                placeholder="自由描述（可空）：口头禅、背景设定、想避免的说话方式…"
                rows={2}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <button type="button" disabled={gen.generating} onClick={() => void runGenerate()}
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary/30 disabled:opacity-50">
                {gen.generating ? '生成中…' : gen.personaPrompt ? '换一版' : 'AI 生成人格设定'}
              </button>
            </>
          )}
          {(gen.personaPrompt || gen.editId) && (
            <>
              <div className="text-xs text-gray-400 dark:text-gray-500">人格设定（保存前可随意修改）</div>
              <textarea
                value={gen.personaPrompt}
                onChange={(e) => setGen((s) => ({ ...s, personaPrompt: e.target.value }))}
                rows={5}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <div className="space-y-1.5" data-persona-examples>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-400 dark:text-gray-500">口吻示例（一行一句，最多 5 句；只教语气和长短，不是台词库）</div>
                  {hasAI && (
                    <button type="button" disabled={gen.examplesBusy || !gen.personaPrompt.trim()} onClick={() => void runExamples()}
                      className="shrink-0 text-xs font-bold text-primary disabled:opacity-40">
                      {gen.examplesBusy ? '写着…' : '让 AI 写三句'}
                    </button>
                  )}
                </div>
                <textarea
                  value={gen.examples}
                  onChange={(e) => setGen((s) => ({ ...s, examples: e.target.value }))}
                  aria-label="口吻示例"
                  rows={3}
                  placeholder={'嗯，我在听。\n书架第三排，慢慢找。'}
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
              {/* 相处方式（第 25 批）：督促型会提「断了 / 没做」的事，陪伴型只提好事和快到的事；生成设定时也按它写 */}
              <div className="space-y-1.5" data-persona-coach>
                <div className="text-xs text-gray-400 dark:text-gray-500">相处方式（督促型：会提你没做的事，一天一次、只说事实；陪伴型：只提好事和快到的事）</div>
                <div className="flex gap-1.5">
                  <button type="button" className={chip(gen.coach === 'accompany')} onClick={() => setGen((s) => ({ ...s, coach: 'accompany' }))}>陪伴型</button>
                  <button type="button" className={chip(gen.coach === 'push')} onClick={() => setGen((s) => ({ ...s, coach: 'push' }))}>督促型</button>
                </div>
              </div>
              {!editingBuiltin && (
                <div className="space-y-1.5" data-persona-know-since>
                  <div className="text-xs text-gray-400 dark:text-gray-500">认识你多久了（「刚认识」的头 7 天它只知道今天的状态，之后才看得到你的记录）</div>
                  <div className="flex gap-1.5">
                    <button type="button" className={chip(gen.knowSince === 'always')} onClick={() => setGen((s) => ({ ...s, knowSince: 'always' }))}>一直都在</button>
                    <button type="button" className={chip(gen.knowSince === 'fresh')} onClick={() => setGen((s) => ({ ...s, knowSince: 'fresh' }))}>刚认识</button>
                  </div>
                </div>
              )}
              {!editingBuiltin && (
                <div className="space-y-2" data-persona-traits>
                  <div className="text-xs text-gray-400 dark:text-gray-500">喜好（它每天的小状态会用到；用「、」隔开，留空的话第一次用到时按人格设定自动写）</div>
                  {([['likes', '喜欢'], ['dislikes', '讨厌'], ['habits', '小习惯']] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs font-bold text-gray-500 dark:text-gray-400">{label}</span>
                      <input
                        value={gen[k]}
                        onChange={(e) => setGen((s) => ({ ...s, [k]: e.target.value }))}
                        aria-label={`${label}（用「、」隔开）`}
                        placeholder={k === 'likes' ? '晒太阳、热可可' : k === 'dislikes' ? '下雨、闹钟' : '下雨天话变少'}
                        className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          {gen.error && <p className="text-xs text-red-400">{gen.error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void savePreset()} disabled={!gen.personaPrompt.trim() || !gen.name.trim()}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
              保存
            </button>
            <button type="button" onClick={() => setGen(closedGenerator)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-300">
              取消
            </button>
          </div>
        </div>
      )}

      {/* ── 记事本（弹窗；含 AI 维护的用户画像 + 原子记忆） ── */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200"><NotebookIcon className="h-4 w-4" /> 记事本</div>
          <p className="text-xs text-gray-400 dark:text-gray-500">它记住的关于你的事：长期画像 + 零散记忆，可改可删，只存本机。</p>
        </div>
        <button type="button" onClick={() => setNotebookOpen(true)}
          className="shrink-0 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
          打开
        </button>
      </div>

      {/* ── 手动归档（compact 主泵手动入口） ── */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">整理旧对话</div>
          <p className="text-xs text-gray-400 dark:text-gray-500">把之前没归档的聊天收进记忆（平时它会自己做）。</p>
        </div>
        <button type="button" disabled={archiving} onClick={() => void runArchive()}
          className="shrink-0 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
          {archiving ? '整理中…' : '整理'}
        </button>
      </div>
      {archiveDone && <p className="text-xs text-gray-400 dark:text-gray-500">{archiveDone}</p>}

      {/* ── 对话模型（副入口，默认收起）──
          正式入口在「设置 → AI 智能功能 → 模型分档」；这里留一个就近快捷位，
          按用户口径放在助手区最下方并默认折叠，不占日常视线。 */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setModelCardOpen((v) => !v)}
          aria-expanded={modelCardOpen}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">对话模型</span>
          <span className="min-w-0 flex-1 truncate text-xs text-gray-400 dark:text-gray-500">
            {settings.assistantModel?.trim()
              ? `${getProviderConfig(settings.assistantProvider ?? settings.summaryApiProvider ?? DEFAULT_PROVIDER).label} · ${settings.assistantModel.trim()}`
              : '跟随深思熟虑档'}
          </span>
          <span aria-hidden className={`shrink-0 text-gray-400 transition-transform ${modelCardOpen ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {modelCardOpen && (
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
        {/* 标题由上面的折叠头承担，这里只留说明 */}
        <p className="text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          只给<b>助手</b>（对话 / 每日问候 / 人格生成）单独指定模型，可跨服务商
          （用那家已存的 Key 直连）。留空 = 跟随「深思熟虑」档；这里的选择<b>不会</b>
          影响中长期占卜等其它走深思熟虑的功能。
        </p>
        {hasAI ? (
          <div className="mt-2.5 space-y-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {settings.assistantModel?.trim()
                  ? `${getProviderConfig(settings.assistantProvider ?? settings.summaryApiProvider ?? DEFAULT_PROVIDER).label} · ${settings.assistantModel}`
                  : `跟随深思熟虑档（${getDeliberateAIConfig(settings)?.model ?? '未配置'}）`}
              </span>
              <span className="shrink-0 text-xs font-bold text-primary">选择模型 ›</span>
            </button>
            {settings.assistantModel && (
              <button
                type="button"
                onClick={() => updateSettings({ assistantModel: undefined, assistantProvider: undefined })}
                className="text-xs font-semibold text-primary"
              >
                恢复跟随深思熟虑档
              </button>
            )}
            <ModelPickerSheet mode="assistant" isOpen={pickerOpen} onClose={() => setPickerOpen(false)} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">先在「设置 → AI 智能功能」里配置 API Key，这里才能选模型。</p>
        )}
        </div>
        )}
      </div>

      {/* 上传裁切（复用全站头像管线，输出 dataUrl，local-only） */}
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
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      <NavigatorNotebook isOpen={notebookOpen} onClose={() => setNotebookOpen(false)} />
    </div>
  );
};
