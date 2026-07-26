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
 * 后两档选当前连接那家时 provider 存 undefined，保持"跟随连接"的老语义。
 */
import { useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { AI_PROVIDERS, getProviderConfig, type ApiProvider } from '@/utils/aiProviders';
import { familyBadge, isAggregatorList, isChatModel, refreshAllProviderModels } from '@/utils/aiModelCatalog';

export const ModelPickerSheet = ({ mode, isOpen, onClose }: {
  mode: 'fast' | 'deliberate' | 'assistant';
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { settings, updateSettings } = useAppStore();
  const [query, setQuery] = useState('');
  const [chatOnly, setChatOnly] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

  const active = settings.summaryApiProvider ?? 'openai';
  const fast = mode === 'fast';
  const assistant = mode === 'assistant';
  const currentPv = fast ? active
    : assistant ? (settings.assistantProvider ?? settings.navigatorProvider ?? active)
    : (settings.navigatorProvider ?? active);
  const currentModel = fast ? (settings.summaryModel ?? '')
    : assistant ? (settings.assistantModel ?? '')
    : (settings.navigatorModel ?? '');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pvs = fast
      ? [active]
      : AI_PROVIDERS.map((p) => p.id).filter((id) =>
          id === active || settings.aiProfiles?.[id]?.key?.trim());
    return pvs.map((pv) => {
      const all = settings.aiProfiles?.[pv]?.models ?? [];
      const filtered = all.filter((m) => (!chatOnly || isChatModel(m)) && (!q || m.toLowerCase().includes(q)));
      return { pv, all, filtered, aggregator: isAggregatorList(all) };
    });
  }, [fast, active, settings.aiProfiles, chatOnly, query]);

  const hasAnyList = sections.some((s) => s.all.length > 0);

  const pick = (pv: ApiProvider | null, model: string | null) => {
    const scoped = pv === active ? undefined : (pv ?? undefined);
    if (fast) {
      updateSettings({ summaryModel: model || undefined });
    } else if (assistant) {
      updateSettings(model
        ? { assistantModel: model, assistantProvider: scoped }
        : { assistantModel: undefined, assistantProvider: undefined });
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
      title={fast ? '⚡ 快速响应 · 选择模型' : assistant ? '◈ 助手专属模型' : '🌙 深思熟虑 · 选择模型'}
      maxHeightClass="max-h-[82vh]"
    >
      <div className="space-y-3 pb-2">
        {assistant && (
          <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            这里只改<b>助手</b>（对话 / 每日问候 / 人格生成）用的模型，不影响中长期占卜等其它走「深思熟虑」的功能。
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
            只看对话
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
                没有匹配的条目（试试关掉「只看对话」或换个关键词）。
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
