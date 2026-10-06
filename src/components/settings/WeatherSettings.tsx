import { useState } from 'react';
import { useAppStore } from '@/store';
import { BufferedTextInput } from '@/components/ui/BufferedTextInput';
import {
  OPEN_METEO_SITE, QWEATHER_CONSOLE, QWEATHER_SITE,
  fetchWeatherNow, normalizeQWeatherHost, qweatherHostHint, qweatherHostIssue, qweatherKeyHint, qweatherKeyIssue,
  searchCity, weatherBlockedError, weatherMissing, weatherReady, type WeatherCity,
} from '@/utils/weather';

/**
 * 「体验个性化 → 天气」设置块。
 *
 * 隐私口径写在界面上：Key 与城市**不上云**，只随本地备份走。
 * （实现在 services/sync.ts 的 push 剔除段 + pull 回填段，与背景图同一组。）
 *
 * 第 13 轮按和风现行文档重做：API Host 必填（公共域名已停服）、三步拿 KEY 的引导、
 * 粘贴识别（Host 贴进 KEY 栏、开发者 ID / 凭据 ID / JWT 公钥当 KEY…）、按类说清楚的报错、来源标注。
 */
export function WeatherSettings() {
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const provider = settings.weatherProvider ?? 'qweather';

  const [q, setQ] = useState('');
  const [hits, setHits] = useState<WeatherCity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cfg = {
    provider,
    apiKey: settings.weatherApiKey,
    host: settings.weatherApiHost,
    city: settings.weatherCity,
  };
  const keyIssue = qweatherKeyIssue(settings.weatherApiKey);
  const hostIssue = qweatherHostIssue(settings.weatherApiHost);
  const missing = weatherMissing(cfg);
  const ready = weatherReady(cfg);
  const blocked = ready ? weatherBlockedError(cfg) : null;
  // 引导默认收起（展开占地太多，用户口径），点标题才打开
  const [guideOpen, setGuideOpen] = useState(false);

  const doSearch = async () => {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true); setMsg(null); setHits(null);
    try {
      const list = await searchCity(query, cfg);
      setHits(list);
      if (list.length === 0) setMsg({ ok: false, text: '没找到这个地名，换个写法试试（区县名通常比街道名好用）' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '检索失败' });
    } finally {
      setBusy(false);
    }
  };

  const doTest = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const w = await fetchWeatherNow(cfg, { force: true });
      setMsg({ ok: true, text: `✓ ${settings.weatherCity?.name}　${w.text} ${w.temp}°C　体感 ${w.feelsLike}°C` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '取数失败' });
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary';
  const hintCls = 'text-[11px] leading-relaxed text-amber-600 dark:text-amber-400';
  const linkCls = 'font-bold text-primary underline-offset-2 hover:underline';
  const missingLabel = { key: 'API KEY', host: 'API Host', city: '城市' } as const;

  return (
    <div className="space-y-3" data-testid="weather-settings">
      <h4 className="font-medium text-gray-800 dark:text-white">天气</h4>
      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        配好之后，首页的<b>月相</b>点一下就能切成天气，切换会被记住。
        <b className="text-gray-600 dark:text-gray-300">Key 与城市只存本机</b>——不随云同步上传，但会进本地备份文件。
      </p>

      {/* 服务商 */}
      <div className="flex gap-2">
        {([
          ['qweather', '和风天气', '需 KEY · 国内节点 · 区县级'],
          ['openmeteo', 'Open-Meteo', '免 Key · 服务器在欧美'],
        ] as const).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            onClick={() => { updateSettings({ weatherProvider: id }); setMsg(null); setHits(null); }}
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
          {/* 三步拿 KEY 和 API Host（用户最常卡住的地方：Host 在「设置」里、KEY 在「项目」里，凭据要选 API KEY） */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-600" data-testid="weather-guide">
            <button type="button" onClick={() => setGuideOpen(v => !v)} aria-expanded={guideOpen}
              className="flex w-full items-center justify-between px-3 py-2 text-left">
              <span className="text-xs font-bold text-gray-700 dark:text-gray-200">三步拿到 API KEY 和 API Host</span>
              <span aria-hidden className="text-[10px] text-gray-400">{guideOpen ? '▲' : '▼'}</span>
            </button>
            {guideOpen && (
              <div className="space-y-1.5 border-t border-gray-100 px-3 py-2.5 text-[11px] leading-relaxed text-gray-600 dark:border-gray-700 dark:text-gray-300">
                <p>① 打开 <a href={QWEATHER_CONSOLE} target="_blank" rel="noopener noreferrer" className={linkCls}>和风天气控制台 ↗</a>，注册登录后进「项目管理」→「创建项目」，名字随便填。</p>
                <p>② 进入这个项目，点「添加凭据」，身份认证方式选 <b>API KEY</b>（不要选 JSON Web Token），保存后复制那一长串 KEY。</p>
                <p>③ 回到控制台左侧「设置」，复制 <b>API Host</b>（形如 abc123xyz.re.qweatherapi.com），填到下面。</p>
                <p className="text-gray-400 dark:text-gray-500">
                  每月 5 万次以内免费，超出部分按量计费；本 App 每 10 分钟最多取一次，一般用不完。
                  不要给这条凭据设「应用限制」，否则 App 的请求会被拒。
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs text-gray-500 dark:text-gray-400">API KEY</div>
            <BufferedTextInput
              value={settings.weatherApiKey ?? ''}
              onCommit={v => updateSettings({ weatherApiKey: v.replace(/[​-‍﻿]/g, '').trim() || undefined })}
              placeholder="控制台 → 项目管理 → 凭据里的 API KEY"
              className={inputCls}
              aria-label="和风天气 API KEY"
            />
            {keyIssue && keyIssue !== 'missing' && <p className={hintCls} data-testid="weather-key-hint">{qweatherKeyHint(keyIssue)}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              API Host <span className="font-normal text-gray-400/80">必填</span>
            </div>
            <BufferedTextInput
              value={settings.weatherApiHost ?? ''}
              onCommit={v => updateSettings({ weatherApiHost: normalizeQWeatherHost(v) || undefined })}
              placeholder="如 abc123xyz.re.qweatherapi.com"
              type="url"
              inputMode="url"
              className={inputCls}
              aria-label="和风天气 API Host"
            />
            {(hostIssue && (hostIssue !== 'missing' || settings.weatherApiKey?.trim())) && (
              <p className={hintCls} data-testid="weather-host-hint">{qweatherHostHint(hostIssue)}</p>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
            不想注册？
            <button type="button" className={linkCls} onClick={() => { updateSettings({ weatherProvider: 'openmeteo' }); setMsg(null); setHits(null); }}>
              先用 Open-Meteo
            </button>
            ，免 Key，但服务器在欧美，国内偶尔连不上。
          </p>
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
            aria-label="搜索城市"
          />
          <button
            type="button"
            onClick={() => void doSearch()}
            disabled={busy || (provider === 'qweather' && (missing.includes('key') || missing.includes('host')))}
            className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary disabled:opacity-50"
          >
            {busy ? '…' : '搜索'}
          </button>
        </div>
        {provider === 'qweather' && (missing.includes('key') || missing.includes('host')) && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500">先填好 API KEY 和 API Host，才能用和风搜城市。</p>
        )}
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

      {missing.length > 0 && (
        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400" data-testid="weather-missing">
          还差：{missing.map(m => missingLabel[m]).join('、')}
        </p>
      )}
      <button
        type="button"
        onClick={() => void doTest()}
        disabled={busy || !ready}
        className="w-full rounded-xl border border-dashed border-gray-200 py-2 text-xs font-semibold text-gray-500 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400"
      >
        {ready ? '测试取数' : '填齐上面几项再测试'}
      </button>
      {/* 上次自动取数出的错（配置类错误之后不会再自动重试，改好后点一次「测试取数」） */}
      {!msg && blocked && (
        <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-red-500 dark:text-red-400" data-testid="weather-blocked">
          上次取数没成功：{blocked.message}{blocked.config ? '\n改好后点一次「测试取数」，首页才会重新取。' : ''}
        </p>
      )}
      {msg && (
        <p className={`whitespace-pre-wrap text-[11px] leading-relaxed ${msg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`} data-testid="weather-msg">{msg.text}</p>
      )}

      {/* 来源标注（和风「注明来源」与 Open-Meteo 的 CC BY 4.0 都要求显示名字 + 链接） */}
      <p className="text-[10px] text-gray-400 dark:text-gray-500" data-testid="weather-attribution-settings">
        {provider === 'qweather'
          ? <>天气服务由 <a href={QWEATHER_SITE} target="_blank" rel="noopener noreferrer" className={linkCls}>和风天气</a> 驱动</>
          : <>天气数据来自 <a href={OPEN_METEO_SITE} target="_blank" rel="noopener noreferrer" className={linkCls}>Open-Meteo</a>（CC BY 4.0）</>}
      </p>
    </div>
  );
}
