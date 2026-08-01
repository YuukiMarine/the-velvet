/**
 * 天气取数 —— 首页「月相 ⇄ 天气」角标的数据源。
 *
 * 两家 provider，同一个出参形状：
 *   · qweather（和风天气，默认）—— 非商用免费、有中国大陆节点、区县级、中文天气描述。
 *     需要用户自己注册拿 Key。注意 **API Host 因账号而异**：
 *     和风 2026 起把 api.qweather.com / devapi.qweather.com 换成了每个账号专属的域名
 *     （控制台里能看到，形如 abcdefg.re.qweatherapi.com），所以 host 做成可填字段，
 *     留空时回落到旧的 devapi.qweather.com。
 *   · openmeteo（Open-Meteo）—— 免 Key、CORS 全开、浏览器直连即可，
 *     但服务器只在欧美，国内访问的延迟与稳定性要自己掂量。作为"没 Key 也能看"的兜底。
 *
 * 【隐私】城市与 Key 都只存本机：sync.ts 的 push 段把 weather* 字段整组剔除，
 * 但它们照常进本地备份（buildExportJson）。理由同背景图——设备偏好 + 位置语义。
 */

export type WeatherProvider = 'qweather' | 'openmeteo';

export interface WeatherNow {
  /** 摄氏度，已取整 */
  temp: number;
  /** 中文天气描述（「多云」「小雨」…） */
  text: string;
  /** 归一化图标键，UI 自己映射成三频道各自的画法 */
  icon: WeatherIcon;
  /** 体感温度，拿不到则与 temp 相同 */
  feelsLike: number;
  /** 相对湿度 %（拿不到为 null） */
  humidity: number | null;
  /** 数据观测时间 */
  observedAt: Date;
  /** 这条结果来自哪家（UI 上标注来源用） */
  provider: WeatherProvider;
}

export type WeatherIcon =
  | 'clear-day' | 'clear-night' | 'partly' | 'cloudy' | 'overcast'
  | 'rain' | 'heavy-rain' | 'thunder' | 'snow' | 'fog' | 'haze' | 'wind' | 'unknown';

export interface WeatherCity {
  /** 和风的 location id（如 101010100）；Open-Meteo 用不到 */
  id?: string;
  name: string;
  lat: number;
  lon: number;
}

const DEFAULT_QWEATHER_HOST = 'devapi.qweather.com';

/** 和风的 icon code → 我们的归一化键。编码表见和风「天气图标」文档。 */
function qweatherIcon(code: string): WeatherIcon {
  const n = Number(code);
  if (n === 100) return 'clear-day';
  if (n === 150) return 'clear-night';
  if (n === 101 || n === 102 || n === 103 || n === 151 || n === 152 || n === 153) return 'partly';
  if (n === 104 || n === 154) return 'overcast';
  if (n >= 300 && n <= 399) return n >= 310 ? 'heavy-rain' : 'rain';
  if (n >= 200 && n <= 299) return 'wind';
  if (n === 302 || n === 303 || n === 304) return 'thunder';
  if (n >= 400 && n <= 499) return 'snow';
  if (n === 501 || n === 509 || n === 510 || n === 514 || n === 515) return 'fog';
  if (n >= 502 && n <= 508 || n === 511 || n === 512 || n === 513) return 'haze';
  if (n >= 800) return 'cloudy';
  return 'unknown';
}

/** Open-Meteo 的 WMO weather code → 归一化键 */
function wmoIcon(code: number, isDay: boolean): WeatherIcon {
  if (code === 0) return isDay ? 'clear-day' : 'clear-night';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'rain';
  if (code >= 61 && code <= 67) return code >= 65 ? 'heavy-rain' : 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return code === 82 ? 'heavy-rain' : 'rain';
  if (code >= 85 && code <= 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'unknown';
}

const WMO_TEXT: Record<number, string> = {
  0: '晴', 1: '晴间多云', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '小雨', 55: '中雨', 61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '强阵雨', 82: '暴雨', 85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷阵雨伴冰雹',
};

export interface WeatherConfig {
  provider?: WeatherProvider;
  apiKey?: string;
  /** 和风的账号专属 API Host，留空用默认 */
  host?: string;
  city?: WeatherCity;
}

/** 配置是否足以取数（UI 用来决定要不要显示"去设置"提示） */
export function weatherReady(cfg: WeatherConfig): boolean {
  if (!cfg.city) return false;
  if ((cfg.provider ?? 'qweather') === 'qweather') return !!cfg.apiKey?.trim();
  return true; // Open-Meteo 免 Key
}

async function fetchQWeather(cfg: WeatherConfig, signal?: AbortSignal): Promise<WeatherNow> {
  const host = (cfg.host?.trim() || DEFAULT_QWEATHER_HOST).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const loc = cfg.city!.id?.trim() || `${cfg.city!.lon.toFixed(2)},${cfg.city!.lat.toFixed(2)}`;
  const url = `https://${host}/v7/weather/now?location=${encodeURIComponent(loc)}&key=${encodeURIComponent(cfg.apiKey!.trim())}`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`和风天气 HTTP ${resp.status}`);
  const j = await resp.json() as { code?: string; now?: Record<string, string> };
  // 和风把业务错误放在 200 响应的 code 字段里（402=超额, 403=无权限, 401=Key 错）
  if (j.code && j.code !== '200') throw new Error(qweatherCodeHint(j.code));
  const n = j.now;
  if (!n) throw new Error('和风天气返回里没有 now 段');
  return {
    temp: Math.round(Number(n.temp)),
    text: String(n.text ?? ''),
    icon: qweatherIcon(String(n.icon ?? '')),
    feelsLike: Math.round(Number(n.feelsLike ?? n.temp)),
    humidity: n.humidity != null ? Number(n.humidity) : null,
    observedAt: n.obsTime ? new Date(n.obsTime) : new Date(),
    provider: 'qweather',
  };
}

function qweatherCodeHint(code: string): string {
  if (code === '401') return '和风天气：Key 无效或签名错误（401）';
  if (code === '402') return '和风天气：今日请求额度用完了（402）';
  if (code === '403') return '和风天气：这个 Key 没有该接口权限，或 API Host 填错了（403）';
  if (code === '404') return '和风天气：查不到这个城市（404）';
  if (code === '429') return '和风天气：请求太频繁（429）';
  return `和风天气返回 ${code}`;
}

async function fetchOpenMeteo(cfg: WeatherConfig, signal?: AbortSignal): Promise<WeatherNow> {
  const { lat, lon } = cfg.city!;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code&timezone=auto';
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`);
  const j = await resp.json() as { current?: Record<string, number | string> };
  const c = j.current;
  if (!c) throw new Error('Open-Meteo 返回里没有 current 段');
  const code = Number(c.weather_code);
  return {
    temp: Math.round(Number(c.temperature_2m)),
    text: WMO_TEXT[code] ?? '—',
    icon: wmoIcon(code, Number(c.is_day) === 1),
    feelsLike: Math.round(Number(c.apparent_temperature ?? c.temperature_2m)),
    humidity: c.relative_humidity_2m != null ? Number(c.relative_humidity_2m) : null,
    observedAt: c.time ? new Date(String(c.time)) : new Date(),
    provider: 'openmeteo',
  };
}

// ── 取数 + 缓存 ────────────────────────────────────────────────────────
// 天气 10 分钟内不会有意义地变化，而首页每次进出都会挂载一次角标。
// 内存缓存按 provider+城市 归键，避免白烧配额（和风非商用是 1000 次/天）。
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: WeatherNow }>();

const cacheKey = (cfg: WeatherConfig) =>
  `${cfg.provider ?? 'qweather'}|${cfg.city?.id ?? ''}|${cfg.city?.lat}|${cfg.city?.lon}`;

export async function fetchWeatherNow(
  cfg: WeatherConfig,
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<WeatherNow> {
  if (!weatherReady(cfg)) throw new Error('天气还没配好（缺城市或 Key）');
  const key = cacheKey(cfg);
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = (cfg.provider ?? 'qweather') === 'openmeteo'
    ? await fetchOpenMeteo(cfg, opts.signal)
    : await fetchQWeather(cfg, opts.signal);
  cache.set(key, { at: Date.now(), data });
  return data;
}

// ── 城市检索 ──────────────────────────────────────────────────────────
// 和风有 GeoAPI（同一把 Key，host 是 geoapi.qweather.com 或账号专属域名）；
// Open-Meteo 有免 Key 的 geocoding。两边统一成 WeatherCity[]。

export async function searchCity(
  q: string,
  cfg: WeatherConfig,
  signal?: AbortSignal,
): Promise<WeatherCity[]> {
  const query = q.trim();
  if (!query) return [];
  if ((cfg.provider ?? 'qweather') === 'qweather' && cfg.apiKey?.trim()) {
    const host = (cfg.host?.trim() || 'geoapi.qweather.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const url = `https://${host}/v2/city/lookup?location=${encodeURIComponent(query)}&key=${encodeURIComponent(cfg.apiKey.trim())}&number=10`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) throw new Error(`和风城市检索 HTTP ${resp.status}`);
    const j = await resp.json() as { code?: string; location?: Array<Record<string, string>> };
    if (j.code === '404') return [];
    if (j.code && j.code !== '200') throw new Error(qweatherCodeHint(j.code));
    return (j.location ?? []).map(l => ({
      id: l.id,
      // 「朝阳, 北京」这种带上级行政区的写法，避免同名区县分不清
      name: l.adm2 && l.adm2 !== l.name ? `${l.name}·${l.adm2}` : l.name,
      lat: Number(l.lat),
      lon: Number(l.lon),
    }));
  }
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=zh`;
  const resp = await fetch(url, { signal });
  if (!resp.ok) throw new Error(`Open-Meteo 城市检索 HTTP ${resp.status}`);
  const j = await resp.json() as { results?: Array<Record<string, string | number>> };
  return (j.results ?? []).map(r => ({
    name: r.admin1 && r.admin1 !== r.name ? `${r.name}·${r.admin1}` : String(r.name),
    lat: Number(r.latitude),
    lon: Number(r.longitude),
  }));
}

/** 归一化图标键 → emoji。三频道要各自画图时可以不用它，先给个通用形。 */
export function weatherEmoji(icon: WeatherIcon | undefined): string {
  switch (icon) {
    case 'clear-day': return '☀️';
    case 'clear-night': return '🌙';
    case 'partly': return '⛅';
    case 'cloudy': return '☁️';
    case 'overcast': return '☁️';
    case 'rain': return '🌧️';
    case 'heavy-rain': return '⛈️';
    case 'thunder': return '⛈️';
    case 'snow': return '❄️';
    case 'fog': return '🌫️';
    case 'haze': return '😷';
    case 'wind': return '🌬️';
    default: return '🌡️';
  }
}
