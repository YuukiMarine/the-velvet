import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { fetchWeatherNow, weatherReady, WeatherError, type WeatherNow } from '@/utils/weather';

/**
 * 首页「天空位」的模式与取数 —— 月相 ⇄ 天气。
 *
 * 口径：
 *   · 缺省是月相（月相是本作既有的叙事装置，天气是加料，不抢默认）；
 *   · 点一下切换，**切换写进 settings 因而被记住**（也随云同步跟到别的设备，
 *     但天气的 Key/城市不上云——换设备会停在"天气模式但没配好"，UI 需给出去设置的话）；
 *   · 没配好（缺 Key 或没选城市）时 toggle 仍可切，只是显示"去设置天气"，
 *     不做静默回退——静默回退会让用户以为点击没生效。
 *
 * 取数在 utils/weather.ts 里带 10 分钟内存缓存，这里不再自己缓存。
 * 第 13 轮：配置类错误（Host / KEY / 额度…）之后 weather.ts 不再自动重发，这里只报 errorKind='config'，
 * 角标改说「天气设置有误」。
 * 来源标注（和风「注明来源」/ Open-Meteo CC BY 4.0）只放在设置页的天气分区（WeatherSettings）：
 * 第 19 批用户要求首页不写「数据：…」。
 */
export function useSkyBadge() {
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const mode = settings.homeSkyMode ?? 'moon';

  const cfg = {
    provider: settings.weatherProvider,
    apiKey: settings.weatherApiKey,
    host: settings.weatherApiHost,
    city: settings.weatherCity,
  };
  const ready = weatherReady(cfg);

  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'config' | 'transient' | null>(null);

  useEffect(() => {
    if (mode !== 'weather' || !ready) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setErrorKind(null);
    fetchWeatherNow(cfg, { signal: ac.signal })
      .then(w => { if (!ac.signal.aborted) setWeather(w); })
      .catch(e => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : '天气取不到');
        setErrorKind(e instanceof WeatherError && e.config ? 'config' : 'transient');
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
    // cfg 是每次渲染新建的对象，进依赖会死循环——列出真正的标量来源
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready, settings.weatherProvider, settings.weatherApiKey, settings.weatherApiHost, settings.weatherCity?.id, settings.weatherCity?.lat, settings.weatherCity?.lon]);

  const toggle = useCallback(() => {
    void updateSettings({ homeSkyMode: mode === 'weather' ? 'moon' : 'weather' });
  }, [mode, updateSettings]);

  return { mode, toggle, weather, loading, error, errorKind, ready };
}
