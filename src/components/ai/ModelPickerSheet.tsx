/**
 * ModelPickerSheet —— 模型选择面板（快速响应 / 深思熟虑 两档共用）。
 *
 * 取代原生 <select>：optgroup 在移动端选择器里视觉极弱，且聚合平台（千问 237 个）
 * 的大列表在一维下拉里没法收拾。这里做成 SheetModal：
 *   · 按**平台**分区（谁计费/用哪把 Key），聚合平台打「聚合」标；
 *   · 区内给**血统徽标**——托管的外族模型标出身（千问里的 deepseek-r1 → 「DeepSeek 系」），
 *     一眼分清"DeepSeek 官方"和"别家托管的开源版"；
 *   · 默认「只看对话模型」（滤掉 embedding/语音/图像等，237 → 几十）；
 *   · 搜索框子串过滤；空态内置「拉取全部列表」。
 *
 * mode='fast'：只列当前连接那家，写 summaryModel；
 * mode='deliberate'：列所有已配 Key 的家，写 navigatorModel + navigatorProvider；
 * mode='assistant'：同上但写 assistantModel + assistantProvider——助手那条线单独指定，
 *   不连带改中长期占卜（用户口径：快捷入口只该管它自己）。
 * mode='vision' / 'audio'（FS3）：同 deliberate 的跨平台结构，写 visionModel / audioModel；
 *   默认筛选换成「只看能看图 / 能听写的」，两档都允许留空 = 不启用该能力。
 * 除 fast 外，选当前连接那家时 provider 存 undefined，保持"跟随连接"的老语义。
 */
import { useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { AI_PROVIDERS, getProviderConfig, type ApiProvider, DEFAULT_PROVIDER } from '@/utils/aiProviders';
import { familyBadge, isAggregatorList, isAudioModel, isChatModel, isVisionModel, refreshAllProviderModels } from '@/utils/aiModelCatalog';

export type ModelPickerMode = 'fast' | 'deliberate' | 'assistant' | 'vision' | 'audio';

export const ModelPickerSheet = ({ mode, isOpen, onClose }: {
  mode: ModelPickerMode;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { settings, updateSettings } = useAppStore();
  const [query, setQuery] = useState('');
  const [chatOnly, setChatOnly] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

  const active = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
  const fast = mode === 'fast';
  const assistant = mode === 'assistant';
  const vision = mode === 'vision';
  const audio = mode === 'audio';
  const currentPv = fast ? active
    : assistant ? (settings.assistantProvider ?? settings.navigatorProvider ?? active)
    : vision ? (settings.visionProvider ?? active)
    : audio ? (settings.audioProvider ?? active)
    : (settings.navigatorProvider ?? active);
  const currentModel = fast ? (settings.summaryModel ?? '')
    : assistant ? (settings.assistantModel ?? '')
    : vision ? (settings.visionModel ?? '')
    : audio ? (settings.audioModel ?? '')
    : (settings.navigatorModel ?? '');

  /** 本档的默认筛选器（"只看…"开关按下时生效） */
  const capabilityFilter = vision ? isVisionModel : audio ? isAudioModel : isChatModel;
  const filterLabel = vision ? '只看能看图' : audio ? '只看能听写' : '只看对话';

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pvs = fast
      ? [active]
      : AI_PROVIDERS.map((p) => p.id).filter((id) =>
          id === active || settings.aiProfiles?.[id]?.key?.trim());
    return pvs.map((pv) => {
      const all = settings.aiProfiles?.[pv]?.models ?? [];
      const filtered = all.filter((m) => (!chatOnly || capabilityFilter(m)) && (!q || m.toLowerCase().includes(q)));
      return { pv, all, filtered, aggregator: isAggregatorList(all) };
    });
  }, [fast, active, settings.aiProfiles, chatOnly, query, capabilityFilter]);

  const hasAnyList = sections.some((s) => s.all.length > 0);

  const pick = (pv: ApiProvider | null, model: string | null) => {
    const scoped = pv === active ? undefined : (pv ?? undefined);
    if (fast) {
      updateSettings({ summaryModel: model || undefined });
    } else if (assistant) {
      updateSettings(model
        ? { assistantModel: model, assistantProvider: scoped }
        : { assistantModel: undefined, assistantProvider: undefined });
    } else if (vision) {
      updateSettings(model
        ? { visionModel: model, visionProvider: scoped }
        : { visionModel: undefined, visionProvider: undefined });
    } else if (audio) {
      updateSettings(model
        ? { audioModel: model, audioProvider: scoped }
        : { audioModel: undefined, audioProvider: undefined });
    } else {
      updateSettings(model
        ? { navigatorModel: model, navigatorProvider: scoped }
        : { navigatorModel: undefined, navigatorProvider: undefined });
    }
    onClose();
  };

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMsg('');
    const out = await refreshAllProviderModels(settings);
    setRefreshing(false);
    if (!out) { setRefreshMsg('还没有任何服务商配好 Key——先去「连接」卡填 Key'); return; }
    updateSettings({ aiProfiles: out.profiles });
    setRefreshMsg([
      out.okParts.length ? `已更新：${out.okParts.join('、')}` : '',
      out.skipped.length ? `跳过：${out.skipped.join('；')}` : '',
    ].filter(Boolean).join('\n'));
  };

  const fastModel = settings.summaryModel?.trim() || getProviderConfig(active).defaultModel;
  const delibLabel = settings.navigatorModel?.trim()
    ? `${getProviderConfig(settings.navigatorProvider ?? active).label} · ${settings.navigatorModel.trim()}`
    : fastModel;
  const followLabel = fast
    ? `默认（${getProviderConfig(active).defaultModel}）`
    : assistant
      ? `跟随深思熟虑档（${delibLabel}）`
      : vision
        ? '不启用（拍照记账退回本地 OCR / 手输）'
        : audio
          ? '不启用（不显示语音话筒）'
          : `跟随快速响应（${fastModel}）`;

  const rowCls = (selected: boolean) =>
    `flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
      selected
        ? 'border-primary bg-primary/8 dark:bg-primary/15 text-primary font-bold'
        : 'border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
    }`;

  return (
    <SheetModal
      isOpen={isOpen}
      onClose={onClose}
      position="bottom"
      title={
        fast ? '⚡ 快速响应 · 选择模型'
        : assistant ? '◈ 助手专属模型'
        : vision ? '👁 视觉 · 选择模型'
        : audio ? '🎤 听觉 · 选择模型'
        : '🌙 深思熟虑 · 选择模型'
      }
      maxHeightClass="max-h-[82vh]"
    >
      <div className="space-y-3 pb-2">
        {assistant && (
          <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            这里只改<b>助手</b>（对话 / 每日问候 / 人格生成）用的模型，不影响中长期占卜等其它走「深思熟虑」的功能。
          </p>
        )}
        {vision && (
          <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            拍小票记账等<b>看图</b>任务用这档。/models 不告诉我们谁能看图，下面是按名字猜的——
            猜错了调用会报错，不影响别的功能；关掉筛选可以看全量、也能直接手填。
          </p>
        )}
        {audio && (
          <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            <b>语音转写</b>用这档（走 /audio/transcriptions 端点）。配好后助手输入栏会出现话筒，
            按住说话、松手转成文字填进输入框——发不发还是你决定。
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
          按<b>平台</b>分区——模型跑在哪家、用哪把 Key 计费；条目右侧的徽标是模型<b>出身</b>：
          聚合平台（如千问）会托管别家的开源版，带「DeepSeek 系」徽标的是托管版，官方 API 请去 DeepSeek 分区选。
        </p>

        {/* 工具行：搜索 + 只看对话 + 刷新 */}
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索模型名…"
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-primary focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
          <button
            type="button"
            onClick={() => setChatOnly((v) => !v)}
            className={`shrink-0 rounded-xl px-2.5 py-2 text-xs font-bold transition ${
              chatOnly ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            }`}
            aria-pressed={chatOnly}
          >
            {filterLabel}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="shrink-0 rounded-xl bg-primary/10 px-2.5 py-2 text-xs font-bold text-primary disabled:opacity-50"
          >
            {refreshing ? '拉取中…' : '刷新'}
          </button>
        </div>
        {refreshMsg && (
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">{refreshMsg}</p>
        )}

        {/* 跟随/默认 */}
        <button type="button" onClick={() => pick(null, null)} className={rowCls(!currentModel)}>
          <span className="min-w-0 flex-1 truncate">{followLabel}</span>
          {!currentModel && <span aria-hidden>✓</span>}
        </button>

        {/* 分区列表 */}
        {sections.map(({ pv, all, filtered, aggregator }) => (
          <div key={pv} className="space-y-1.5">
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{getProviderConfig(pv).label}</span>
              {pv === active && <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-bold text-primary">当前连接</span>}
              {aggregator && <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">聚合平台</span>}
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {all.length === 0 ? '未拉取' : chatOnly || query ? `${filtered.length} / ${all.length} 个` : `${all.length} 个`}
              </span>
            </div>
            {all.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-[11px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
                还没拉过这家的模型列表——点上方「刷新」（不支持 /models 的第三方网关会提示跳过，直接手填即可）。
              </p>
            ) : filtered.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-[11px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
                没有匹配的条目（试试关掉「{filterLabel}」或换个关键词）。
              </p>
            ) : (
              filtered.map((m) => {
                const badge = familyBadge(pv, m);
                const selected = currentModel === m && currentPv === pv;
                return (
                  <button key={`${pv}::${m}`} type="button" onClick={() => pick(pv, m)} className={rowCls(selected)}>
                    <span className="min-w-0 flex-1 truncate">{m}</span>
                    {badge && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-px text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        {badge}
                      </span>
                    )}
                    {selected && <span aria-hidden>✓</span>}
                  </button>
                );
              })
            )}
          </div>
        ))}

        {!hasAnyList && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            提示：「测试连接」成功时会自动拉一次当前家的列表。
          </p>
        )}
      </div>
    </SheetModal>
  );
};
