/**
 * NavigatorSettings — 设置 → 黑猫区（F6 Batch3 终段，落位已拍板）。
 *
 * 三块：人格管理（内置 3 + 自定义，切换=开/恢复该人格今日会话）·
 * 人格生成器（**仅有 Key 可见**；偏好 chips + 自由描述 → AI 生成 → 预览可改再保存；
 * 头像 = 剪影集默认 + 可选本地上传裁切，local-only）· 记事本（原子记忆查看/编辑/删除/置顶）。
 * 另含手动归档（compact 主泵的手动入口备份）。
 */
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { useNavigatorStore } from '@/store/navigator';
import { v4 as uuidv4 } from 'uuid';
import { getAIConfig, getDeliberateAIConfig } from '@/utils/aiClient';
import { getProviderConfig } from '@/utils/aiProviders';
import { ModelPickerSheet } from '@/components/ai/ModelPickerSheet';
import { generatePersonaPrompt } from '@/utils/navigatorIntent';
import { finalizeStaleSessions } from '@/utils/navigatorMemory';
import { mergedNavigatorPresets } from '@/constants/navigatorPresets';
import { Toggle } from '@/components/Toggle';
import { PresetAvatar, PRESET_GLYPH_IDS } from './PresetAvatar';
import { NavigatorNotebook } from './NavigatorNotebook';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { NavigatorPreset } from '@/types';

const TONE_WORDS = ['温柔', '毒舌', '元气', '冷淡', '正经', '幽默', '腹黑', '天然'];

interface GeneratorState {
  open: boolean;
  editId?: string;
  name: string;
  callUser: string;
  toneWords: string[];
  coach: 'push' | 'accompany';
  freeText: string;
  personaPrompt: string;
  avatar: string;
  generating: boolean;
  error?: string;
}
const closedGenerator: GeneratorState = {
  open: false, name: '', callUser: '', toneWords: [], coach: 'accompany',
  freeText: '', personaPrompt: '', avatar: 'star', generating: false,
};

export const NavigatorSettings = () => {
  const { settings, updateSettings } = useAppStore();
  const nav = useNavigatorStore();
  const hasAI = !!getAIConfig(settings);
  const activeId = nav.activePreset().id;

  const [gen, setGen] = useState<GeneratorState>(closedGenerator);
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

  const openEditor = (p?: NavigatorPreset) =>
    setGen(p
      ? { ...closedGenerator, open: true, editId: p.id, name: p.name, personaPrompt: p.personaPrompt, avatar: p.avatar ?? 'star' }
      : { ...closedGenerator, open: true });

  const runGenerate = async () => {
    if (!gen.name.trim()) { setGen((s) => ({ ...s, error: '先给它起个名字' })); return; }
    setGen((s) => ({ ...s, generating: true, error: undefined }));
    try {
      const text = await generatePersonaPrompt({
        name: gen.name.trim(), callUser: gen.callUser.trim(),
        toneWords: gen.toneWords, coach: gen.coach, freeText: gen.freeText.trim(),
      });
      setGen((s) => ({ ...s, generating: false, personaPrompt: text }));
    } catch (e) {
      setGen((s) => ({ ...s, generating: false, error: e instanceof Error ? e.message : '生成失败' }));
    }
  };

  const savePreset = async () => {
    const name = gen.name.trim();
    const prompt = gen.personaPrompt.trim();
    if (!name || !prompt) { setGen((s) => ({ ...s, error: '名字和人格设定都不能为空' })); return; }
    await nav.savePreset({
      id: gen.editId ?? uuidv4(),
      name, personaPrompt: prompt, avatar: gen.avatar,
      isBuiltin: false,
      createdAt: gen.editId ? nav.presets.find((p) => p.id === gen.editId)?.createdAt ?? new Date() : new Date(),
    });
    setGen(closedGenerator);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await nav.deletePreset(deleteTarget.id);
    setDeleteTarget(null);
  };

  const runArchive = async () => {
    setArchiving(true);
    setArchiveDone(null);
    const summary = await finalizeStaleSessions();
    setArchiving(false);
    setArchiveDone(summary ? '已归档，最近摘要：' + summary.slice(0, 40) + '…' : '没有待归档的会话');
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
            回复像真人打字：流式生成 + 按句子切成碎气泡逐条冒出（1.2s 一条）。低性能模式下自动停用。
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

      {/* ── 人格管理 ── */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700/80">
        <span className="text-base">◈</span>
        <h4 className="text-sm font-bold text-gray-800 dark:text-white tracking-wide">人格</h4>
      </div>
      <p className="-mt-2 text-sm text-gray-500 dark:text-gray-400">切换人格会开启（或恢复）它今天的对话。能力不变，变的只是性格和嘴。</p>
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
                onChange={(e) => { setCropFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
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
              <div className="flex gap-1.5">
                <button type="button" className={chip(gen.coach === 'accompany')} onClick={() => setGen((s) => ({ ...s, coach: 'accompany' }))}>陪伴型</button>
                <button type="button" className={chip(gen.coach === 'push')} onClick={() => setGen((s) => ({ ...s, coach: 'push' }))}>督促型</button>
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
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">📔 记事本</div>
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
              ? `${getProviderConfig(settings.assistantProvider ?? settings.summaryApiProvider ?? 'openai').label} · ${settings.assistantModel.trim()}`
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
                  ? `${getProviderConfig(settings.assistantProvider ?? settings.summaryApiProvider ?? 'openai').label} · ${settings.assistantModel}`
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
