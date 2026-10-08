import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '@/store';
import { Toggle } from '@/components/Toggle';
import { BufferedTextInput } from '@/components/ui/BufferedTextInput';
import { ModelPickerSheet, type ModelPickerMode } from '@/components/ai/ModelPickerSheet';
import { BoltMiniIcon, EyeIcon, MicIcon, MoonIcon } from '@/components/settingsIcons';
import {
  AI_PROVIDERS, getProviderConfig, testAIConnection, fetchAvailableModels, effectiveModelName, cleanApiKey,
  type TestResult, type ApiProvider, DEFAULT_PROVIDER, CUSTOM_PRESETS, type CustomProviderPreset,
} from '@/utils/aiProviders';
import { hostOfUrl } from '@/utils/aiTransport';
import { autoFillVisionPatch, refreshAllProviderModels, liveModelOf, isModelStale } from '@/utils/aiModelCatalog';
import {
  getAIConfig, getAssistantAIConfig, getDeliberateAIConfig, getVisionAIConfig, type AIConfig,
} from '@/utils/aiClient';
import { buildAIDiagnostics, readAIDiag } from '@/utils/aiDiagnostics';
import { balanceEndpoint, fetchProviderBalance, type ProviderBalance } from '@/utils/aiBalance';

/**
 * 设置 → AI 服务（第 13 轮从「AI 总结」里拆出来的独立分区；「AI 总结」原处留了跳转入口）。
 *
 * 连接（服务商 / Key / 地址 / 测试）与模型分档原来挂在「AI 总结」下面，可它们是全 App 共用的——
 * 助手、塔罗、记账、战场都走这把钥匙，用户找「填 Key 的地方」总找错。这里收成一个分区，并加上：
 *   - 逐档测一遍：快速响应 / 深思熟虑 / 助手 / 视觉各发一个 ping（跨服务商的档位以前要等用到才知道通不通）；
 *   - 余额快用完的提醒（DeepSeek / Kimi / 硅基流动，低于 0.5 才显示）；
 *   - 诊断：本机最近 40 次 AI 请求的状态，一键复制给开发者（不含内容和 Key）。
 * 连接卡与分档卡的交互保持原样（只是搬家）。
 */
export function AIServiceSettings({ openConnection = false }: {
  /** 从「AI 总结」里的路标跳过来：连接卡直接展开（来的人多半是照老教程找填 Key 的地方） */
  openConnection?: boolean;
} = {}) {
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);

  const [summaryApiKeySaved, setSummaryApiKeySaved] = useState(false);
  const [summaryApiKeyDraft, setSummaryApiKeyDraft] = useState(settings.summaryApiKey ?? '');
  const [apiTestStatus, setApiTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [apiTestMessage, setApiTestMessage] = useState<string>('');
  // 可选模型列表：按当前 provider + Key + baseUrl 从 /models 拉取，拉到就变下拉，
  // 拉不到（网关不支持 / CORS）保持手填输入框兜底
  const [modelFetchStatus, setModelFetchStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [modelFetchMessage, setModelFetchMessage] = useState<string>('');
  // 连接卡折叠：有 Key 时默认收起（配好后日常只跟模型分档打交道），无 Key 展开引导配置
  const [connOpen, setConnOpen] = useState(() => openConnection || !settings.summaryApiKey?.trim());
  // 模型选择面板（四档共用一个 Sheet，靠 mode 区分）
  const [modelPicker, setModelPicker] = useState<ModelPickerMode | null>(null);
  // 模型分档整卡收进「高级设置」（FS3.1 用户口径）：默认收起，只留一行摘要。
  // 日常用户配完连接就不用再来这儿；要调档的人点开即可。
  const [tiersOpen, setTiersOpen] = useState(false);
  /** 自定义服务商先拉列表、待选模型时的提示（第 14 批） */
  const [customModelNote, setCustomModelNote] = useState('');

  // 一键刷新**所有**已配 Key 的服务商的模型列表，按家落进 aiProfiles[].models
  //（用户口径：重新拉取 = 全 provider 同步更新；不支持 /models 的跳过并注明）。
  // 列表持久化在 settings 里，跨刷新/跨服务商切换都在，深思熟虑档的跨平台下拉直接读它。
  const handleFetchModels = async () => {
    setModelFetchStatus('loading');
    setModelFetchMessage('');
    const out = await refreshAllProviderModels(settings, summaryApiKeyDraft);
    if (!out) {
      setModelFetchStatus('error');
      setModelFetchMessage('还没有任何服务商配好 Key');
      return;
    }
    // 视觉档空缺 + 表里识别到能看图的模型 → 自动填上（用户口径：表更新完就直接填）
    const auto = autoFillVisionPatch(settings, out.profiles);
    updateSettings({ aiProfiles: out.profiles, ...(auto?.patch ?? {}) });
    setModelFetchStatus(out.okParts.length ? 'ok' : 'error');
    setModelFetchMessage([
      out.okParts.length ? `已更新：${out.okParts.join('、')}` : '',
      out.skipped.length ? `跳过：${out.skipped.join('；')}` : '',
      auto ? `👁 视觉档原来空着，已自动填入 ${auto.label}（可在「视觉」档更换或停用）` : '',
      out.stale.length ? `⚠ 这些档在用的模型已不在官方最新列表里，可能下线了，建议换一个：${out.stale.join('；')}` : '',
    ].filter(Boolean).join('\n'));
  };

  const handleTestApi = async () => {
    const rawKey = summaryApiKeyDraft.trim() || (settings.summaryApiKey ?? '');
    if (!rawKey) {
      setApiTestStatus('error');
      setApiTestMessage('请先填写 API 密钥');
      return;
    }
    // 紧急修复 #2：密钥里混进看不见的字符 / 全角字母时，fetch 发都发不出去，以前报成「没放行 CORS」
    const cleaned = cleanApiKey(rawKey);
    const keyToTest = cleaned.key;
    if (cleaned.removed > 0) setSummaryApiKeyDraft(keyToTest);
    const cleanNote = cleaned.removed > 0 ? `密钥里混进了 ${cleaned.removed} 个看不见的空格 / 全角字符，已自动清理——测完记得点保存。\n` : '';
    setApiTestStatus('testing');
    setApiTestMessage('');
    // 自定义服务商还没选模型（它没有默认模型）：先用地址 + Key 拉一次列表，拉到就把选模型的面板打开（第 14 批）
    if (settings.summaryApiProvider === 'custom' && !settings.summaryModel?.trim()) {
      if (!settings.summaryApiBaseUrl?.trim()) { setApiTestStatus('error'); setApiTestMessage('先填 API 地址（或点上面的预设）'); return; }
      const listed = await fetchAvailableModels({ provider: 'custom', apiKey: keyToTest, baseUrl: settings.summaryApiBaseUrl, nativeHosts: settings.aiNativeHosts, protocol: customProto });
      if (listed.ok) {
        updateSettings({
          aiProfiles: {
            ...(settings.aiProfiles ?? {}),
            custom: { ...(settings.aiProfiles?.custom ?? {}), key: keyToTest, models: listed.models, modelCaps: listed.caps },
          },
        });
        setApiTestStatus('idle');
        setApiTestMessage('');
        setCustomModelNote(`${cleanNote}地址和 Key 都没问题，拉到 ${listed.models.length} 个模型：挑一个，再点一次「测试连接」。`);
        setModelPicker('fast');
      } else {
        setApiTestStatus('error');
        setApiTestMessage(`${cleanNote}${listed.error}\n它要是不给模型列表，就在「模型分档 → 快速响应」里直接手填模型名。`);
      }
      return;
    }
    setCustomModelNote('');
    const result0: TestResult = await testAIConnection({
      provider: settings.summaryApiProvider ?? DEFAULT_PROVIDER,
      apiKey: keyToTest,
      baseUrl: settings.summaryApiBaseUrl,
      model: settings.summaryModel,
      nativeHosts: settings.aiNativeHosts,
      ...(settings.summaryApiProvider === 'custom' ? { protocol: customProto } : {}),
    });
    const result: TestResult = result0;
    // 第 13 轮 · 原生通道：浏览器发不出去（对方不放行跨域预检）、App 原生层才通 → 把这台主机登记下来，之后的请求都走原生通道；
    // 反过来，登记过的主机这次浏览器通道直接通了（对方放行了）→ 注销，恢复流式
    const hostsNow = settings.aiNativeHosts ?? [];
    let nativeHosts = hostsNow;
    let nativeNote = '';
    if (result.nativeHost) {
      nativeNote = '这个地址不放行跨域，已改走 App 原生通道（不支持流式，回复会整段出现）。\n';
      if (!hostsNow.includes(result.nativeHost)) nativeHosts = [...hostsNow, result.nativeHost];
    } else if (result.ok && hostsNow.includes(hostOfUrl(result.baseUrlUsed))) {
      nativeNote = '这个地址现在放行跨域了，已改回普通通道（恢复流式）。\n';
      nativeHosts = hostsNow.filter((h) => h !== hostOfUrl(result.baseUrlUsed));
    }
    if (nativeHosts !== hostsNow) updateSettings({ aiNativeHosts: nativeHosts });
    if (result.ok) {
      setApiTestStatus('ok');
      setBalanceTick(t => t + 1); // 测通了顺手刷新余额
      // 地址少写了 /v1、补上才通（中转站最常见）：把校正后的地址替换进设置，之后所有请求都用它
      if (result.corrected) updateSettings({ summaryApiBaseUrl: result.baseUrlUsed });
      // 成功顺手拉一次该家的模型列表（用户口径）；不支持 /models 的注明跳过，不算失败
      const pv = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
      const listed = await fetchAvailableModels({ provider: pv, apiKey: keyToTest, baseUrl: result.baseUrlUsed, nativeHosts, ...(pv === 'custom' ? { protocol: customProto } : {}) });
      setApiTestMessage(
        cleanNote + nativeNote + `连接成功 · ${result.model} · ${result.latencyMs} ms` +
        (listed.ok ? ` · 模型列表已更新（${listed.models.length} 个）` : ' · 该服务商不支持拉取列表，模型请手填') +
        (result.corrected ? `\n地址少了 /v1，已自动补上并替换为 ${result.baseUrlUsed}` : '') +
        (result.notes?.length ? `\n${result.notes.join('\n')}` : ''),
      );
      // 成功即落库：绿灯要能跨刷新/跨切换保留（用户口径「已配置」感知太弱）
      updateSettings({
        aiProfiles: {
          ...(settings.aiProfiles ?? {}),
          [pv]: {
            ...(settings.aiProfiles?.[pv] ?? {}),
            key: keyToTest,
            verifiedAt: Date.now(),
            ...(listed.ok ? { models: listed.models, modelCaps: listed.caps } : {}),
          },
        },
      });
    } else {
      setApiTestStatus('error');
      setApiTestMessage(cleanNote + nativeNote + result.error);
    }
  };

  // ── 多服务商存档：切胶囊 = 存回旧家 + 载入新家（生效位仍是 summaryApi* 四项）──
  const activeProvider = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
  const switchProvider = (next: ApiProvider) => {
    if (next === activeProvider) return;
    const profiles = { ...(settings.aiProfiles ?? {}) };
    profiles[activeProvider] = {
      ...(profiles[activeProvider] ?? {}),
      key: cleanApiKey(summaryApiKeyDraft).key || cleanApiKey(settings.summaryApiKey).key || undefined,
      baseUrl: settings.summaryApiBaseUrl,
      model: settings.summaryModel,
      navModel: settings.navigatorModel,
      navProvider: settings.navigatorProvider,
    };
    const inc = profiles[next] ?? {};
    updateSettings({
      aiProfiles: profiles,
      summaryApiProvider: next,
      summaryApiKey: inc.key ?? '',
      summaryApiBaseUrl: inc.baseUrl,
      summaryModel: inc.model,
      // 深思熟虑档的「指向哪家 + 哪个模型」成对载入（第 17 批）：以前只换模型、指向还留着旧家，
      // 设置页写「跟随快速响应」，实际调用的却是旧家（用户反馈「换了好模型，风格还是差的那家」）
      navigatorModel: inc.navModel,
      navigatorProvider: inc.navModel ? inc.navProvider : undefined,
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
    const k = cleanApiKey(summaryApiKeyDraft).key; // 紧急修复 #2：落库前清掉看不见的字符 / 全角字母
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

  // ── 第 13 轮新增：逐档测一遍 / 余额提醒 / 诊断 ──
  const [tierTesting, setTierTesting] = useState(false);
  const [tierResults, setTierResults] = useState<Array<{ id: string; label: string; model: string; ok?: boolean; text: string }> | null>(null);
  const [diagCopied, setDiagCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const diagCount = readAIDiag().length;

  // 余额（DeepSeek / Kimi / 硅基流动的官方地址才查得到）：有 Key 就取一次，测通后再刷新。
  // 只在快用完（< ¥0.5 / $0.5）时显示——平时不露，免得让人老惦记着看（用户口径）
  const [balance, setBalance] = useState<ProviderBalance | null>(null);
  const [balanceTick, setBalanceTick] = useState(0);
  const balanceUrlBase = getAIConfig(settings)?.baseUrl ?? '';
  const balancePv = (settings.summaryApiProvider ?? DEFAULT_PROVIDER) as ApiProvider;
  const savedKey = settings.summaryApiKey?.trim() ?? '';
  useEffect(() => {
    setBalance(null);
    if (!savedKey || !balanceEndpoint(balanceUrlBase)) return;
    const ac = new AbortController();
    void fetchProviderBalance(balancePv, savedKey, balanceUrlBase, ac.signal).then((b) => { if (!ac.signal.aborted) setBalance(b); });
    return () => ac.abort();
  }, [balancePv, savedKey, balanceUrlBase, balanceTick]);

  /** 每档发一个 ping，按顺序测，免得低档位账号并发被限流 */
  const runTierTests = async () => {
    if (tierTesting) return;
    setTierTesting(true);
    const defs: Array<{ id: string; label: string; cfg: AIConfig | null; skip: string }> = [
      { id: 'fast', label: '快速响应', cfg: getAIConfig(settings), skip: '还没填 Key' },
      { id: 'deliberate', label: '深思熟虑', cfg: settings.navigatorModel?.trim() ? getDeliberateAIConfig(settings) : null, skip: '跟随快速响应' },
      { id: 'assistant', label: '助手', cfg: settings.assistantModel?.trim() ? getAssistantAIConfig(settings) : null, skip: '跟随深思熟虑' },
      { id: 'vision', label: '视觉', cfg: getVisionAIConfig(settings), skip: settings.visionModel?.trim() ? '那家没存 Key' : '未启用' },
    ];
    const out: Array<{ id: string; label: string; model: string; ok?: boolean; text: string }> = [];
    let hosts = settings.aiNativeHosts ?? [];
    for (const d of defs) {
      if (!d.cfg) { out.push({ id: d.id, label: d.label, model: '', text: d.skip }); setTierResults([...out]); continue; }
      const pv = (d.cfg.provider ?? DEFAULT_PROVIDER) as ApiProvider;
      const r = await testAIConnection({ provider: pv, apiKey: d.cfg.apiKey, baseUrl: d.cfg.baseUrl, model: d.cfg.model, nativeHosts: hosts, ...(d.cfg.protocol ? { protocol: d.cfg.protocol } : {}) });
      if (r.nativeHost && !hosts.includes(r.nativeHost)) hosts = [...hosts, r.nativeHost];
      out.push({
        id: d.id, label: d.label, model: `${getProviderConfig(pv).label} · ${d.cfg.model}`, ok: r.ok,
        text: r.ok ? `✓ 通了 · ${r.latencyMs} ms${r.transport === 'native' ? ' · 走原生通道' : ''}${r.notes?.length ? ` · ${r.notes.join('；')}` : ''}` : `✗ ${r.error}`,
      });
      setTierResults([...out]);
    }
    out.push({ id: 'audio', label: '听觉', model: settings.audioModel?.trim() ?? '', text: settings.audioModel?.trim() ? '要按住话筒说一句才测得了：在助手输入栏试' : '未启用' });
    setTierResults([...out]);
    if (hosts !== (settings.aiNativeHosts ?? [])) updateSettings({ aiNativeHosts: hosts });
    setTierTesting(false);
  };

  const copyDiagnostics = async () => {
    const text = buildAIDiagnostics(settings, { version: String(import.meta.env.PACKAGE_VERSION ?? ''), platform: Capacitor.getPlatform() });
    try { await navigator.clipboard.writeText(text); setDiagCopied('ok'); } catch { setDiagCopied('fail'); }
    window.setTimeout(() => setDiagCopied('idle'), 2500);
  };

  const provider = settings.summaryApiProvider ?? DEFAULT_PROVIDER;
  // ── 第 14 批 · 自定义服务商 ──
  const customProto: 'openai' | 'anthropic' = settings.customProviderProtocol === 'anthropic' ? 'anthropic' : 'openai';
  const activePreset = CUSTOM_PRESETS.find(p => p.id === (settings.customProviderPreset ?? 'relay'));
  /** 自定义还差什么（地址 / 模型都没有默认值） */
  const customMissing = provider === 'custom'
    ? [!settings.summaryApiBaseUrl?.trim() && '地址', !settings.summaryModel?.trim() && '模型'].filter(Boolean) as string[]
    : [];
  const applyPreset = (pr: CustomProviderPreset) => {
    const prev = CUSTOM_PRESETS.find(p => p.id === settings.customProviderPreset);
    // 显示名没手改过（空 / 等于上一个预设名）就跟着换
    const nameFollows = !settings.customProviderName?.trim() || settings.customProviderName.trim() === prev?.name;
    const platformChanged = (!!prev && prev.id !== pr.id) || (!!pr.baseUrl && pr.baseUrl !== settings.summaryApiBaseUrl);
    updateSettings({
      customProviderPreset: pr.id,
      customProviderProtocol: pr.protocol,
      ...(nameFollows ? { customProviderName: pr.id === 'relay' ? undefined : pr.name } : {}),
      ...(pr.baseUrl ? { summaryApiBaseUrl: pr.baseUrl } : {}),
      // 换了平台：上一家的模型名、模型列表、绿灯都对不上了 → 清掉，测通后从新拉的列表里重选
      ...(platformChanged ? {
        summaryModel: undefined,
        aiProfiles: { ...(settings.aiProfiles ?? {}), custom: { ...(settings.aiProfiles?.custom ?? {}), models: undefined, modelCaps: undefined, verifiedAt: undefined } },
      } : {}),
    });
    setApiTestStatus('idle');
    setApiTestMessage('');
  };
  // 折叠态摘要：一行报四档现状（收起时唯一的信息来源）。
  // emoji → SVG（v2.7 用户口径）：改为 [图标+文案] 的 JSX 片段
  const tierSummary = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {([
        [BoltMiniIcon, liveModelOf(settings, provider)],
        [MoonIcon, settings.navigatorModel?.trim() ? effectiveModelName(settings.navigatorModel) : '跟随'],
        [EyeIcon, settings.visionModel?.trim() ? effectiveModelName(settings.visionModel) : '未启用'],
        [MicIcon, settings.audioModel?.trim() || '未启用'],
      ] as Array<[typeof BoltMiniIcon, string]>).map(([Ic, text], i) => (
        <span key={i} className="inline-flex min-w-0 items-center gap-0.5">
          <Ic className="h-3 w-3 shrink-0" />
          <span className="truncate">{text}</span>
        </span>
      ))}
    </span>
  );
  return (
    <div className="space-y-3 pb-1" data-testid="ai-service">
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
            {settings.summaryApiKey?.trim() && customMissing.length > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 truncate" data-testid="custom-missing">{getProviderConfig(provider).label} · 还差{customMissing.join('和')}——展开填写</span>
            ) : settings.summaryApiKey?.trim() ? (
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
        {/* 余额快用完了：卡片收着也看得见（平时不显示） */}
        {balance?.low && (
          <div className={`flex items-center justify-between gap-2 bg-red-50 px-4 py-2 dark:bg-red-900/20 ${connOpen ? 'border-b border-red-100 dark:border-red-900/40' : ''}`} data-testid="ai-balance">
            <span className="min-w-0 text-[12px] font-bold leading-snug text-red-600 dark:text-red-400">
              {getProviderConfig(provider).label} 账户余额只剩 {balance.text}，用完后 AI 功能会停下
            </span>
            <a href={balance.topUpUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[12px] font-bold text-red-600 underline dark:text-red-400">
              去充值 ↗
            </a>
          </div>
        )}
        {connOpen && (
        <div className="p-4 space-y-4 dark:bg-gray-800/20">

          {/* 首次引导：一家都没配时，最卡人的一步不是"填哪儿"而是"去哪儿拿"。
              这里直接把 DeepSeek 的控制台顶到前面——国内可直连、注册即送额度、
              按量计费最便宜，是起步成本最低的一家。其余各家的入口在下面 Key 输入框旁边。 */}
          {savedProviderCount === 0 && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-[12px] font-bold text-gray-700 dark:text-gray-200">还没有 API Key？</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                去 DeepSeek 注册一个，复制 Key 回来粘进下面的输入框就能用。
                国内可直连，按量计费，日常用量一个月通常也就几块钱。
              </p>
              <a
                href={getProviderConfig('deepseek').keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => switchProvider('deepseek')}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[12px] font-bold text-white"
              >
                打开 platform.deepseek.com
                <span aria-hidden>↗</span>
              </a>
            </div>
          )}

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
                const isCustom = p.id === 'custom';
                return (
                  <button
                    key={p.id}
                    onClick={() => switchProvider(p.id)}
                    data-testid={`provider-${p.id}`}
                    className={`relative py-2.5 rounded-xl text-xs font-bold transition-all border ${isCustom ? 'col-span-3 ' : ''}${
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
                    <div>{isCustom ? `${getProviderConfig('custom').label === '自定义' ? '＋ ' : ''}${getProviderConfig('custom').label}` : p.label}</div>
                    {/* 灰字 = 这家**正在用**的模型（v2.7.0.6：原来是写死的预设名；退役名显示继任者）。
                        刷新列表后若它已不在官方列表里，前面挂 ⚠ */}
                    {(() => {
                      const live = liveModelOf(settings, p.id);
                      if (isCustom && !live) {
                        return <div className="mt-0.5 px-1 text-[10px] font-normal leading-tight opacity-60">中转站 · 硅基流动 · 智谱 · OpenRouter · Anthropic…</div>;
                      }
                      const stale = isModelStale(settings, p.id, live);
                      return (
                        <div
                          /* 三列格子在手机上很窄：字号收一档、允许折两行，名字要能看全（截成 deepseek-fl… 就失去意义了） */
                          className={`mt-0.5 line-clamp-2 break-all px-1 text-[10px] font-normal leading-tight ${stale ? 'opacity-90' : 'opacity-60'}`}
                          title={stale ? `${live} 已不在这家最新的模型列表里，可能下线了` : live}
                        >
                          {stale && <span aria-label="可能已下线">⚠ </span>}{live}
                        </div>
                      );
                    })()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 自定义服务商（第 14 批）：接哪一家 / 显示名 / 协议 */}
          {provider === 'custom' && (
            <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-3" data-testid="custom-provider">
              <p className="text-xs font-bold text-gray-600 dark:text-gray-300">接哪一家</p>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_PRESETS.map(pr => {
                  const on = (settings.customProviderPreset ?? 'relay') === pr.id;
                  return (
                    <button
                      key={pr.id}
                      type="button"
                      data-testid={`custom-preset-${pr.id}`}
                      onClick={() => applyPreset(pr)}
                      className={`rounded-lg border px-2.5 py-1 text-[12px] font-bold ${on ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                    >
                      {pr.name}
                    </button>
                  );
                })}
              </div>
              {activePreset?.hint && <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{activePreset.hint}</p>}
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[12px] text-gray-500 dark:text-gray-400">名字</span>
                <BufferedTextInput
                  value={settings.customProviderName ?? ''}
                  onCommit={v => { const next = v.trim() || undefined; if (next !== (settings.customProviderName?.trim() || undefined)) updateSettings({ customProviderName: next }); }}
                  placeholder={activePreset && activePreset.id !== 'relay' ? activePreset.name : '起个名字，如「我的中转站」'}
                  aria-label="自定义服务商名字"
                  className="min-w-0 flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[12px] text-gray-500 dark:text-gray-400">协议</span>
                <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600" role="radiogroup" aria-label="请求协议">
                  {(['openai', 'anthropic'] as const).map(pt => (
                    <button
                      key={pt}
                      type="button"
                      role="radio"
                      aria-checked={customProto === pt}
                      data-testid={`custom-protocol-${pt}`}
                      onClick={() => { if (customProto !== pt) { updateSettings({ customProviderProtocol: pt }); setApiTestStatus('idle'); setApiTestMessage(''); } }}
                      className={`px-3 py-1 text-[12px] font-bold ${customProto === pt ? 'bg-primary text-white' : 'bg-white text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
                    >
                      {pt === 'openai' ? 'OpenAI 兼容' : 'Anthropic'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                {customProto === 'anthropic'
                  ? 'Anthropic 协议走 /v1/messages（官方 Claude、只给 Anthropic 格式地址的中转站、DeepSeek 等的 /anthropic 口）；听觉档在这个协议上用不了。'
                  : '绝大多数中转站和平台都是 OpenAI 兼容（/chat/completions）。'}
              </p>
            </div>
          )}

          {/* API Key */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{getProviderConfig(provider).label} 的 API 密钥</p>
              {/* 当前这一家的控制台直达。跟着 provider 走，切哪家给哪家的门 */}
              {getProviderConfig(provider).keyUrl && (
                <a
                  href={getProviderConfig(provider).keyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11px] font-bold text-primary hover:underline"
                >
                  去申请 ↗
                </a>
              )}
            </div>
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
            {customModelNote && provider === 'custom' && (
              <p className="text-[11px] font-bold leading-relaxed text-primary" data-testid="custom-model-note">{customModelNote}</p>
            )}
            <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
              Key 保存在这台设备上，也会跟着本地备份走；默认不上云，在「账号与数据」的「云同步 · 数据类目选择」里打开「AI 模型 API」才会随同步上传。
              测试连接成功后这家会亮绿灯（换 Key 需重新测试）。
            </p>
          </div>

          {/* 高级：自定义地址（连接级配置，跟 provider/Key 同卡） */}
          <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-700/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">{provider === 'custom' ? 'API 地址（必填）' : '自定义 API 地址（可选）'}</p>
            <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
              {provider === 'custom' && customProto === 'anthropic'
                ? '填它给的 Anthropic 地址（如 https://api.anthropic.com、https://api.deepseek.com/anthropic），带不带 /v1 都行。'
                : '用中转站就填它给的接口地址，一般以 /v1 结尾；多贴的 /chat/completions 会自动去掉，少了 /v1 测试连接时会自动补上。'}
            </p>
            {/* 本地缓冲（停手 / 失焦才落库）：以前每敲一个字就写一次设置，中途半截地址会被余额、
                原生通道判断这些依赖地址的逻辑拿去用；失焦时没改就不重置测试结果 */}
            <BufferedTextInput
              type="url"
              inputMode="url"
              aria-label="自定义 API 地址"
              value={settings.summaryApiBaseUrl ?? ''}
              onCommit={v => {
                const next = v.trim() || undefined;
                if (next === (settings.summaryApiBaseUrl?.trim() || undefined)) return;
                // 换了地址：绿灯作废（要重新测）；自定义的模型列表属于旧地址，一并清掉（第 14 批）
                const prof = settings.aiProfiles?.[provider] ?? {};
                updateSettings({
                  summaryApiBaseUrl: next,
                  aiProfiles: { ...(settings.aiProfiles ?? {}), [provider]: { ...prof, verifiedAt: undefined, ...(provider === 'custom' ? { models: undefined, modelCaps: undefined } : {}) } },
                });
                setApiTestStatus('idle');
                setApiTestMessage('');
              }}
              placeholder={provider === 'custom' ? (activePreset?.baseUrl || 'https://…/v1') : getProviderConfig(provider).defaultBaseUrl}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
            />
            {(settings.aiNativeHosts ?? []).includes(hostOfUrl((settings.summaryApiBaseUrl ?? '').trim() || getProviderConfig(provider).defaultBaseUrl)) && (
              <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400" data-testid="native-host-note">
                这个地址不放行跨域，App 里走原生通道：能用，但没有流式，回复会整段出现。对方放行后再点一次「测试连接」即可改回。
              </p>
            )}
          </div>

        </div>
        )}
      </div>

      {/* ── 模型分档（FS3.1 收进「高级设置」折叠）──
          快速响应=当前连接的便宜快模型；深思熟虑=可跨服务商的强模型；
          视觉=看图；听觉=听写。默认收起，摘要行直接报当前四档。 */}
      <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
        <button
          type="button"
          onClick={() => setTiersOpen(v => !v)}
          aria-expanded={tiersOpen}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 text-left"
        >
          <span className="min-w-0">
            <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              模型分档
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-gray-400 dark:text-gray-500">
              {tierSummary}
            </span>
          </span>
          <span className="shrink-0 text-xs text-gray-400">{tiersOpen ? '▲' : '▼'}</span>
        </button>
        {tiersOpen && (
        <>
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-y border-gray-100 dark:border-gray-700/60 dark:bg-gray-800/40">
          <button
            type="button"
            onClick={() => void runTierTests()}
            disabled={tierTesting || !settings.summaryApiKey?.trim()}
            data-testid="ai-tier-test"
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-primary/10 text-primary transition-all hover:bg-primary/20 disabled:opacity-40"
          >
            {tierTesting ? '逐档测试中…' : '逐档测一遍'}
          </button>
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
            {modelFetchStatus === 'loading' ? '拉取中…' : '刷新全部模型列表'}
          </button>
        </div>
        <div className="p-4 space-y-4 dark:bg-gray-800/20">
          {/* 逐档测一遍的结果（第 13 轮）：每档各发一个 ping，跨服务商的档位也测到 */}
          {tierResults && (
            <div className="space-y-1 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60" data-testid="ai-tier-results">
              {tierResults.map((r) => (
                <div key={r.id} className="text-[11px] leading-relaxed">
                  <span className="font-bold text-gray-700 dark:text-gray-200">{r.label}</span>
                  {r.model && <span className="text-gray-400 dark:text-gray-500"> · {r.model}</span>}
                  <span className={`block break-words ${r.ok === true ? 'text-green-600 dark:text-green-400' : r.ok === false ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>{r.text}</span>
                </div>
              ))}
            </div>
          )}
          {(() => {
            const delibPv = settings.navigatorProvider ?? provider;
            const fastFallback = liveModelOf(settings, provider);
            return (
              <>
                {/* 快速响应：绑定当前连接（换服务商 = 换连接） */}
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"><BoltMiniIcon className="h-3.5 w-3.5" /> 快速响应</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    记账解析、每日塔罗、活动打分、成长总结等批量任务走这档——要快、便宜够用。
                    跑在当前连接（{getProviderConfig(provider).label}）上。
                  </p>
                  <button
                    type="button"
                    onClick={() => setModelPicker('fast')}
                    className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <span className="min-w-0 flex-1 truncate text-left">
                      {settings.summaryModel?.trim() ? effectiveModelName(settings.summaryModel) : provider === 'custom' ? '还没选（必填）' : `默认（${getProviderConfig(provider).defaultModel}）`}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-primary">选择模型 ›</span>
                  </button>
                  <BufferedTextInput
                    value={settings.summaryModel ?? ''}
                    onCommit={v => { updateSettings({ summaryModel: v || undefined }); setApiTestStatus('idle'); setApiTestMessage(''); }}
                    placeholder={provider === 'custom' ? '模型名（必填）：测通后从「选择模型」里挑，或直接手填' : `留空 = 默认（${getProviderConfig(provider).defaultModel}）`}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                </div>

                {/* 每日塔罗默认走快速响应；这里可以让它单独升到深思熟虑（v2.7.0.6，默认关） */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">每日塔罗改走深思熟虑</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">
                      每天一次，多等几秒换更贴的解读；深思熟虑没配时自动退回快速响应。
                    </div>
                  </div>
                  <Toggle
                    checked={!!settings.tarotDailyDeliberate}
                    onChange={(v) => updateSettings({ tarotDailyDeliberate: v })}
                    aria-label="每日塔罗改走深思熟虑"
                  />
                </div>

                {/* 成长总结同理（v2.7.0.6，默认关）：一期一封信，多等一两分钟换更贴的写法 */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">成长总结改走深思熟虑</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">
                      周报月报一期一封，多等一两分钟换更贴的信；它在后台写，关掉页面也不会断。
                    </div>
                  </div>
                  <Toggle
                    checked={!!settings.summaryDeliberate}
                    onChange={(v) => updateSettings({ summaryDeliberate: v })}
                    aria-label="成长总结改走深思熟虑"
                  />
                </div>

                {/* 深思熟虑：可跨服务商（按厂家分组），Key 已配好即可直选别家模型 */}
                <div className="space-y-1.5 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                  <p className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"><MoonIcon className="h-3.5 w-3.5" /> 深思熟虑</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    助手对话、中长期占卜，以及逆影战场的生成（召唤 Persona、区层 / 伪神 / 满月心魔显形）走这档——
                    值得等的深答案，可跨服务商选更强的模型（用那家已存的 Key 直连）。留空跟随快速响应。
                  </p>
                  <button
                    type="button"
                    onClick={() => setModelPicker('deliberate')}
                    className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <span className="min-w-0 flex-1 truncate text-left">
                      {settings.navigatorModel?.trim()
                        ? `${getProviderConfig(delibPv).label} · ${settings.navigatorModel}`
                        : `跟随快速响应（${fastFallback}）`}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-primary">选择模型 ›</span>
                  </button>
                  <BufferedTextInput
                    value={settings.navigatorModel ?? ''}
                    onCommit={v => updateSettings({ navigatorModel: v || undefined })}
                    placeholder={`留空 = 跟随快速响应（${fastFallback}）`}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                  {/* 生效行：跨平台时明确写出实际调用哪家（防"我以为在用A其实在用B"） */}
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    实际调用：{settings.navigatorModel
                      ? `${getProviderConfig(delibPv).label} · ${settings.navigatorModel}${settings.navigatorProvider && !settings.aiProfiles?.[settings.navigatorProvider]?.key?.trim() ? '（该家没存 Key，已临时回落快速响应）' : ''}`
                      : `跟随快速响应（${getProviderConfig(provider).label} · ${fastFallback}）`}
                  </p>
                </div>

                {/* 👁 视觉（FS3）：看图。没配就是没配——不回落文本模型（发图过去只会报错） */}
                <div className="space-y-1.5 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                  <p className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"><EyeIcon className="h-3.5 w-3.5" /> 视觉</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    拍小票记账等看图任务走这档。没配也能用——记账会退到本机离线识字（需原生 App），
                    再不行就手输。图片只发给你自己配的服务商。
                  </p>
                  <button
                    type="button"
                    onClick={() => setModelPicker('vision')}
                    className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <span className="min-w-0 flex-1 truncate text-left">
                      {settings.visionModel?.trim()
                        ? `${getProviderConfig(settings.visionProvider ?? provider).label} · ${settings.visionModel}`
                        : '未启用'}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-primary">选择模型 ›</span>
                  </button>
                  <BufferedTextInput
                    value={settings.visionModel ?? ''}
                    onCommit={v => updateSettings({ visionModel: v || undefined })}
                    placeholder="留空 = 不启用（如 deepseek-flash / qwen-vl-plus / gpt-6-luna）"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                </div>

                {/* 🎤 听觉（FS3）：语音转写，走 /audio/transcriptions */}
                <div className="space-y-1.5 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                  <p className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"><MicIcon className="h-3.5 w-3.5" /> 听觉</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    配好后助手输入栏出现话筒：按住说话、松手转成文字填进输入框（发不发你决定）。
                    走 /audio/transcriptions 端点，模型名如 whisper-1 / SenseVoiceSmall / qwen3-asr-flash。
                    不配也没关系——输入法自带的语音键一直都能用。
                  </p>
                  <button
                    type="button"
                    onClick={() => setModelPicker('audio')}
                    className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <span className="min-w-0 flex-1 truncate text-left">
                      {settings.audioModel?.trim()
                        ? `${getProviderConfig(settings.audioProvider ?? provider).label} · ${settings.audioModel}`
                        : '未启用'}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-primary">选择模型 ›</span>
                  </button>
                  <BufferedTextInput
                    value={settings.audioModel ?? ''}
                    onCommit={v => updateSettings({ audioModel: v || undefined })}
                    placeholder="留空 = 不启用（如 whisper-1 / qwen3-asr-flash）"
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                </div>
              </>
            );
          })()}

          {modelFetchMessage && (
            <p className={`text-[11px] leading-relaxed whitespace-pre-wrap break-words ${modelFetchStatus === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {modelFetchMessage}
            </p>
          )}
          {!settings.summaryApiKey?.trim() && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">先在上方「连接」卡里配好 API Key，再来选模型。</p>
          )}

        </div>
        </>
        )}
      </div>

      {/* ── 诊断（第 13 轮）：最近 40 次 AI 请求的状态，一键复制给开发者 ── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3 dark:border-gray-700/60" data-testid="ai-diagnostics">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-800 dark:text-white">复制 AI 诊断信息</div>
          <div className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
            最近 {diagCount} 次请求的成败、耗时和服务商，不含聊天内容和 Key。遇到连不上时复制给我们。
          </div>
        </div>
        <button type="button" onClick={() => void copyDiagnostics()}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold ${diagCopied === 'ok' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : diagCopied === 'fail' ? 'bg-red-100 text-red-500' : 'bg-primary/10 text-primary'}`}>
          {diagCopied === 'ok' ? '已复制' : diagCopied === 'fail' ? '复制失败' : '复制'}
        </button>
      </div>

      {/* 模型选择面板（SheetModal，portal 渲染） */}
      <ModelPickerSheet
        mode={modelPicker ?? 'fast'}
        isOpen={modelPicker !== null}
        onClose={() => setModelPicker(null)}
      />
    </div>
  );
}
