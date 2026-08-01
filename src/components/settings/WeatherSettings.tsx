import { useState } from 'react';
import { useAppStore } from '@/store';
import { BufferedTextInput } from '@/components/ui/BufferedTextInput';
import { searchCity, fetchWeatherNow, weatherReady, type WeatherCity } from '@/utils/weather';

/**
 * 「体验个性化 → 天气」设置块。
 *
 * 隐私口径写在界面上：Key 与城市**不上云**，只随本地备份走。
 * （实现在 services/sync.ts 的 push 剔除段 + pull 回填段，与背景图同一组。）
 */
export function WeatherSettings() {
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const provider = settings.weatherProvider ?? 'qweather';

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<WeatherCity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cfg = {
    provider,
    apiKey: settings.weatherApiKey,
    host: settings.weatherApiHost,
    city: settings.weatherCity,
  };

  const doSearch = async () => {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true); setMsg(null); setHits(null);
    try {
      const list = await searchCity(query, cfg);
      setHits(list);
      if (list.length === 0) setMsg('没找到这个地名，换个写法试试（区县名通常比街道名好用）');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '检索失败');
    } finally {
      setBusy(false);
    }
  };

  const doTest = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const w = await fetchWeatherNow(cfg, { force: true });
      setMsg(`✓ ${settings.weatherCity?.name}　${w.text} ${w.temp}°C　体感 ${w.feelsLike}°C`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '取数失败');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary';

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-800 dark:text-white">天气</h4>
      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        配好之后，首页的<b>月相</b>点一下就能切成天气，切换会被记住。
        <b className="text-gray-600 dark:text-gray-300">Key 与城市只存本机</b>——不随云同步上传，但会进本地备份文件。
      </p>

      {/* 服务商 */}
      <div className="flex gap-2">
        {([
          ['qweather', '和风天气', '需 Key · 国内节点 · 区县级'],
          ['openmeteo', 'Open-Meteo', '免 Key · 服务器在欧美'],
        ] as const).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            onClick={() => updateSettings({ weatherProvider: id })}
            className={`flex-1 rounded-xl border px-3 py-2 text-left transition ${
              provider === id
                ? 'border-primary bg-primary/10'
                : 'border-gray-200 dark:border-gray-600'
            }`}
          >
            <div className={`text-sm font-bold ${provider === id ? 'text-primary' : 'text-gray-700 dark:text-gray-200'}`}>{label}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">{hint}</div>
          </button>
        ))}
      </div>

      {provider === 'qweather' && (
        <>
          <div className="space-y-1.5">
            <div className="text-xs text-gray-500 dark:text-gray-400">API Key</div>
            <BufferedTextInput
              value={settings.weatherApiKey ?? ''}
              onCommit={v => updateSettings({ weatherApiKey: v.trim() || undefined })}
              placeholder="和风控制台 → 项目 → KEY"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              API Host <span className="text-gray-400/70 font-normal">留空用 devapi.qweather.com</span>
            </div>
            <BufferedTextInput
              value={settings.weatherApiHost ?? ''}
              onCommit={v => updateSettings({ weatherApiHost: v.trim() || undefined })}
              placeholder="如 abcdefg.re.qweatherapi.com"
              className={inputCls}
            />
            <p className="text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
              和风 2026 起给每个账号发**专属域名**，旧的 devapi 在逐步退役。
              控制台能看到自己的那个，填进来最稳；报 403 多半就是这里没填。
            </p>
          </div>
        </>
      )}

      {/* 城市 */}
      <div className="space-y-1.5">
        <div className="text-xs text-gray-500 dark:text-gray-400">城市</div>
        {settings.weatherCity && (
          <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-primary">{settings.weatherCity.name}</span>
            <button
              type="button"
              onClick={() => updateSettings({ weatherCity: undefined })}
              className="shrink-0 text-xs font-bold text-gray-400 hover:text-red-500"
            >
              清除
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <BufferedTextInput
            value={q}
            onCommit={setQ}
            debounceMs={200}
            placeholder="搜城市 / 区县，如「杭州」「朝阳」"
            className={`${inputCls} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void doSearch()}
            disabled={busy}
            className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary disabled:opacity-50"
          >
            {busy ? '…' : '搜索'}
          </button>
        </div>
        {hits && hits.length > 0 && (
          <div className="space-y-1">
            {hits.map((c, i) => (
              <button
                key={`${c.id ?? ''}${c.lat}${c.lon}${i}`}
                type="button"
                onClick={() => { updateSettings({ weatherCity: c }); setHits(null); setMsg(null); }}
                className="flex w-full items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200"
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-[10px] text-gray-400">{c.lat.toFixed(2)}, {c.lon.toFixed(2)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void doTest()}
        disabled={busy || !weatherReady(cfg)}
        className="w-full rounded-xl border border-dashed border-gray-200 py-2 text-xs font-semibold text-gray-500 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400"
      >
        {weatherReady(cfg) ? '测试取数' : '先填 Key 并选好城市'}
      </button>
      {msg && (
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{msg}</p>
      )}
    </div>
  );
}
