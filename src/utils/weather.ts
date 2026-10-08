/**
 * 天气取数 —— 首页「月相 ⇄ 天气」角标的数据源。
 *
 * 两家 provider，同一个出参形状：
 *   · qweather（和风天气，默认）—— 有中国大陆节点、区县级、中文天气描述。需要用户自己注册拿 KEY。
 *     2026-10 按官方文档 / 公告重做（第 13 轮）：
 *       - **API Host 必填**：每个账号专属的域名（控制台 → 设置，形如 abc123xyz.re.qweatherapi.com）。
 *         公共域名 devapi.qweather.com 已于 2026-01-01、api / geoapi.qweather.com 已于 2026-06-01 停服，
 *         以前「留空回落 devapi」的默认值现在必然 403（Invalid Host）。
 *       - 城市搜索在 API Host 下是 /geo/v2/city/lookup（以前拼成 /v2/…，填了 Host 也搜不到城市）。
 *       - 实时天气优先走新版 /weather/v1/current/{lat}/{lon}；这台 Host 上 v1 不在（404）才退回 v7
 *         （v7 天气预报接口 2027-08-01 停服）。
 *       - KEY 仍放在 `key=` 查询参数：官方同样支持，且是「简单请求」不触发 CORS 预检——
 *         换成 X-QW-Api-Key 请求头后每个请求都要预检，而个人 Host 对预检的处理没法在不登录的前提下验证。
 *       - 错误码 v2：HTTP 状态 + application/problem+json（error.title / detail），按类给出能照着做的提示；
 *         配置类错误（Host / KEY / 额度 / 应用限制…）之后**不再自动重试**，改了设置或手动「测试取数」才再发——
 *         和风会把持续的错误请求当攻击、可能冻结账号。
 *       - 额度：2025-04 起每月 5 万次免费、超出按量后付费；2027-02-01 起 API KEY 每天限 1000 次。
 *         本 App 10 分钟内存缓存，远用不到。
 *       - 必须注明来源（「天气服务由和风天气驱动」+ 链接）：WeatherNow.attribution 给出链接，界面负责显示。
 *   · openmeteo（Open-Meteo）—— 免 Key、CORS 全开、浏览器直连即可，服务器在欧美；数据 CC BY 4.0，同样要注明来源。
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
  /** 数据观测时间（新版和风接口不给，用取数时刻） */
  observedAt: Date;
  /** 这条结果来自哪家（UI 上标注来源用） */
  provider: WeatherProvider;
  /** 来源链接（注明来源时点开它）：和风给了 metadata.attributions 就用它，否则官网 */
  attribution: string;
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

export const QWEATHER_SITE = 'https://www.qweather.com';
export const QWEATHER_CONSOLE = 'https://console.qweather.com';
export const OPEN_METEO_SITE = 'https://open-meteo.com';
/** 来源标注的文字（界面统一用它） */
export const attributionLabel = (p: WeatherProvider): string => (p === 'openmeteo' ? 'Open-Meteo' : '和风天气');

// ── API Host / KEY：规整与粘贴识别 ──────────────────────────────────────

/** 已停服的公共域名（填了它们必然 403 Invalid Host） */
const LEGACY_HOSTS = new Set(['devapi.qweather.com', 'api.qweather.com', 'geoapi.qweather.com']);

/** 用户贴进来的 Host → 纯域名：去 https://、路径、查询串、端口后的斜杠、首尾空白和全角点 */
export function normalizeQWeatherHost(raw: string | undefined | null): string {
  let s = String(raw ?? '').trim().replace(/[​-‍﻿\s]/g, '').replace(/。/g, '.');
  s = s.replace(/^[a-z]+:\/\//i, '');
  s = (s.split(/[/?#]/)[0] ?? '').replace(/:\d+$/, '');
  return s.replace(/\.+$/, '').toLowerCase();
}

export type QWeatherHostIssue = 'missing' | 'legacy' | 'looks-like-key' | 'format' | 'unusual';

/** Host 有什么问题；null = 看起来没问题。'unusual' 只是提醒（不是 *.qweatherapi.com，可能是企业专属域名），不拦 */
export function qweatherHostIssue(host: string | undefined | null): QWeatherHostIssue | null {
  const h = normalizeQWeatherHost(host);
  if (!h) return 'missing';
  if (LEGACY_HOSTS.has(h)) return 'legacy';
  if (!h.includes('.')) return /^[0-9a-z]{16,}$/i.test(h) ? 'looks-like-key' : 'format';
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) return 'format';
  if (!h.endsWith('.qweatherapi.com')) return 'unusual';
  return null;
}

export function qweatherHostHint(issue: QWeatherHostIssue | null): string {
  switch (issue) {
    case 'missing': return '还没填 API Host：在和风控制台 → 设置里复制（形如 abc123xyz.re.qweatherapi.com）。';
    case 'legacy': return '这是和风已经停用的公共地址（2026 年起陆续停服），请换成控制台 → 设置里属于你自己的 API Host。';
    case 'looks-like-key': return '这里要填的是一个域名（形如 abc123xyz.re.qweatherapi.com），这串看起来像 KEY，应该填在上面的 API KEY 栏。';
    case 'format': return 'API Host 格式不对：只填域名本身，例如 abc123xyz.re.qweatherapi.com。';
    case 'unusual': return '提醒：一般的 API Host 以 .qweatherapi.com 结尾。如果这是和风给你的专属域名可以不管。';
    default: return '';
  }
}

export type QWeatherKeyIssue = 'missing' | 'looks-like-host' | 'pem' | 'developer-id' | 'too-short' | 'spaces';

/** KEY 有什么问题（只提示不拦）：最常见的是把 Host、开发者 ID、凭据 ID、JWT 公钥贴进了 KEY 栏 */
export function qweatherKeyIssue(key: string | undefined | null): QWeatherKeyIssue | null {
  const k = String(key ?? '').trim();
  if (!k) return 'missing';
  if (/qweather(api)?\.com|^https?:/i.test(k)) return 'looks-like-host';
  if (/BEGIN|PRIVATE KEY|PUBLIC KEY/i.test(k)) return 'pem';
  if (/^Q[A-Z0-9]{9}$/.test(k)) return 'developer-id';
  if (/\s/.test(k)) return 'spaces';
  if (k.length < 20) return 'too-short';
  return null;
}

export function qweatherKeyHint(issue: QWeatherKeyIssue | null): string {
  switch (issue) {
    case 'missing': return '还没填 API KEY。';
    case 'looks-like-host': return '这像是 API Host（域名），应该填在下面的 API Host 栏；KEY 是控制台 → 项目管理 → 凭据里的那一长串字母数字。';
    case 'pem': return '这是 JWT 用的公钥 / 私钥。本 App 用 API KEY：在项目里添加凭据时，身份认证方式选「API KEY」。';
    case 'developer-id': return '这像是开发者 ID（Q 开头的 10 位），不是 API KEY。';
    case 'too-short': return '这串太短了，像是凭据 ID 或项目 ID。API KEY 是凭据详情里那一长串字母数字。';
    case 'spaces': return 'KEY 中间有空格，多半是复制时带进来的，删掉再保存。';
    default: return '';
  }
}

// ── 图标 ────────────────────────────────────────────────────────────────

/**
 * 和风天气现象代码 → 归一化键。新版（v1）只给 100–104 / 3xx / 4xx / 5xx / 900 / 901 / 999，
 * 不分昼夜（夜晚的 15x 只在 v7 里有）：晴天按当地时刻自己判昼夜。
 * 第 13 轮顺手修：雷阵雨 302–304 以前被前面的「3xx 都是雨」那条截走了，永远显示不出雷。
 */
function qweatherIcon(code: string, now: Date = new Date()): WeatherIcon {
  const n = Number(code);
  const night = now.getHours() < 6 || now.getHours() >= 18;
  if (n === 100) return night ? 'clear-night' : 'clear-day';
  if (n === 150) return 'clear-night';
  if (n === 101 || n === 102 || n === 103 || n === 151 || n === 152 || n === 153) return 'partly';
  if (n === 104 || n === 154) return 'overcast';
  if (n === 302 || n === 303 || n === 304) return 'thunder';
  if (n >= 300 && n <= 399) return [301, 307, 308, 310, 311, 312, 315, 316, 317, 318].includes(n) ? 'heavy-rain' : 'rain';
  if (n >= 200 && n <= 299) return 'wind';
  if (n >= 400 && n <= 499) return 'snow';
  if (n === 500 || n === 501 || n === 509 || n === 510 || n === 514 || n === 515) return 'fog';
  if ((n >= 502 && n <= 508) || n === 511 || n === 512 || n === 513) return 'haze';
  if (n >= 800 && n < 900) return 'cloudy';
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

// ── 错误 ────────────────────────────────────────────────────────────────

/**
 * 和风错误的分类。config = 配置问题（自动取数先停，改了设置或手动测试才再发）；
 * 其余是一时的（网络 / 限流 / 服务端），过一会儿可以再试。
 */
export type QWeatherErrorKind =
  | 'host' | 'auth' | 'billing' | 'restricted' | 'suspended' | 'deprecated' | 'forbidden'
  | 'location' | 'params' | 'no-data' | 'rate' | 'server' | 'network' | 'unknown';

const CONFIG_KINDS: ReadonlySet<QWeatherErrorKind> = new Set(['host', 'auth', 'billing', 'restricted', 'suspended', 'deprecated', 'forbidden', 'location']);

export class WeatherError extends Error {
  kind: QWeatherErrorKind;
  /** 配置类错误：不自动重试 */
  config: boolean;
  status?: number;
  constructor(kind: QWeatherErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'WeatherError';
    this.kind = kind;
    this.config = CONFIG_KINDS.has(kind);
    this.status = status;
  }
}

const KIND_BY_TITLE: Array<[RegExp, QWeatherErrorKind]> = [
  [/invalid[\s-]?host/i, 'host'],
  [/unauthori[sz]ed/i, 'auth'],
  [/no[\s-]?credit|overdue/i, 'billing'],
  [/security[\s-]?restriction/i, 'restricted'],
  [/account[\s-]?suspension|suspend/i, 'suspended'],
  [/deprecated/i, 'deprecated'],
  [/forbidden/i, 'forbidden'],
  [/no[\s-]?such[\s-]?location|not[\s-]?found/i, 'location'],
  [/data[\s-]?not[\s-]?available/i, 'no-data'],
  [/invalid[\s-]?param|missing[\s-]?param/i, 'params'],
  [/too[\s-]?many|over[\s-]?monthly/i, 'rate'],
  [/unknown[\s-]?error/i, 'server'],
];

/** 一个分类 → 能照着做的提示（host 用来点名是哪个域名） */
export function weatherErrorMessage(kind: QWeatherErrorKind, host = '', detail = ''): string {
  switch (kind) {
    case 'host': return `API Host 不对：请到和风控制台 → 设置，复制属于你自己的 API Host（形如 abc123xyz.re.qweatherapi.com）。`;
    case 'auth': return 'API KEY 无效：检查是否复制完整；添加凭据时身份认证方式要选「API KEY」（选 JWT 的凭据没有 KEY）；KEY 和 API Host 要属于同一个和风账号。';
    case 'billing': return '和风账户暂时不能取数：额度用完或有逾期账单（每月 5 万次以内免费，超出部分按量付费）。到控制台 → 财务看看。';
    case 'restricted': return '这把 KEY 设了应用限制（网址 / IP / iOS / Android），本 App 的请求不在白名单里：到控制台 → 项目管理 → 这条凭据，把应用限制清空。';
    case 'suspended': return '和风账号被冻结了：登录和风控制台查看原因或提交申诉。';
    case 'deprecated': return '和风已停用这个接口：请把 App 更新到最新版。';
    case 'forbidden': return '这把 KEY 没有天气接口的权限：检查这条凭据的「API 限制」是不是只勾了部分接口。';
    case 'location': return '和风查不到这个地点：在下面重新搜一次城市再选。';
    case 'params': return `请求参数有误${detail ? `（${detail}）` : ''}：请把这条提示截图反馈给我们。`;
    case 'no-data': return '这个地点暂时没有实时天气数据，换个附近的城市试试。';
    case 'rate': return '请求太频繁或本月额度已用完：稍后再试（本 App 每 10 分钟最多取一次）。';
    case 'server': return '和风天气服务暂时出错，稍后再试。';
    case 'network': return `连不上 ${host || '和风天气'}：多半是 API Host 抄错了（多一个或少一个字母都会这样），也可能是当前网络到不了它。`;
    default: return `和风天气返回了没见过的错误${detail ? `：${detail}` : ''}`;
  }
}

/** 旧版错误码（200 响应里带 code 字段）→ 分类 */
function kindOfLegacyCode(code: string): QWeatherErrorKind {
  if (code === '401') return 'auth';
  if (code === '402') return 'billing';
  if (code === '403') return 'forbidden';
  if (code === '404') return 'location';
  if (code === '429') return 'rate';
  if (code === '400') return 'params';
  if (code === '204') return 'no-data';
  return code.startsWith('5') ? 'server' : 'unknown';
}

/** 非 2xx 响应 → WeatherError（读 problem+json 的 error.title / type / detail / invalidParams） */
async function errorFromResponse(resp: Response, host: string): Promise<WeatherError> {
  let title = '', type = '', detail = '', params = '';
  try {
    const j = await resp.json() as { error?: { title?: string; type?: string; detail?: string; invalidParams?: string[] }; code?: string };
    title = j.error?.title ?? '';
    type = j.error?.type ?? '';
    detail = j.error?.detail ?? '';
    params = (j.error?.invalidParams ?? []).join('、');
    if (!title && j.code) return new WeatherError(kindOfLegacyCode(String(j.code)), weatherErrorMessage(kindOfLegacyCode(String(j.code)), host), resp.status);
  } catch { /* 空 body / 不是 JSON */ }
  const probe = `${title} ${type.split('#')[1] ?? ''}`;
  let kind: QWeatherErrorKind = KIND_BY_TITLE.find(([re]) => re.test(probe))?.[1] ?? 'unknown';
  if (kind === 'unknown') {
    if (resp.status === 401) kind = 'auth';
    else if (resp.status === 429) kind = 'rate';
    else if (resp.status >= 500) kind = 'server';
    else if (resp.status === 403) kind = 'forbidden';
  }
  return new WeatherError(kind, weatherErrorMessage(kind, host, params || detail || title), resp.status);
}

/** fetch 本身失败（TypeError：网络 / 跨域 / 域名不存在）→ network；取消原样抛 */
function errorFromThrown(e: unknown, host: string): unknown {
  if (e instanceof Error && e.name === 'AbortError') return e;
  return new WeatherError('network', weatherErrorMessage('network', host));
}

// ── 配置 ────────────────────────────────────────────────────────────────

export interface WeatherConfig {
  provider?: WeatherProvider;
  apiKey?: string;
  /** 和风的账号专属 API Host（必填） */
  host?: string;
  city?: WeatherCity;
}

/** 和风还缺哪些（UI 用来列「还差：…」）；Open-Meteo 只看城市 */
export function weatherMissing(cfg: WeatherConfig): Array<'key' | 'host' | 'city'> {
  const out: Array<'key' | 'host' | 'city'> = [];
  if ((cfg.provider ?? 'qweather') === 'qweather') {
    if (!cfg.apiKey?.trim()) out.push('key');
    const hi = qweatherHostIssue(cfg.host);
    if (hi && hi !== 'unusual') out.push('host');
  }
  if (!cfg.city) out.push('city');
  return out;
}

/** 配置是否足以取数（UI 用来决定要不要显示"去设置"提示） */
export function weatherReady(cfg: WeatherConfig): boolean {
  return weatherMissing(cfg).length === 0;
}

// ── 取数 ────────────────────────────────────────────────────────────────

/** 这台 Host 上 v1 实时天气不在（404）→ 本次运行里直接走 v7，不再每次先撞一下 v1 */
const v7Hosts = new Set<string>();

const qkey = (cfg: WeatherConfig) => encodeURIComponent(cfg.apiKey!.trim());

async function getJson(url: string, host: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { signal });
  } catch (e) {
    throw errorFromThrown(e, host);
  }
}

async function fetchQWeather(cfg: WeatherConfig, signal?: AbortSignal): Promise<WeatherNow> {
  const host = normalizeQWeatherHost(cfg.host);
  const city = cfg.city!;
  if (!v7Hosts.has(host)) {
    // 新版 v1：经纬度最多两位小数；不给观测时间、不分昼夜
    const url = `https://${host}/weather/v1/current/${city.lat.toFixed(2)}/${city.lon.toFixed(2)}?lang=zh&key=${qkey(cfg)}`;
    const resp = await getJson(url, host, signal);
    if (resp.ok) {
      const j = await resp.json().catch(() => null) as null | {
        metadata?: { attributions?: string[] };
        condition?: { text?: string; code?: string };
        temperature?: { value?: number };
        feelsLike?: { value?: number };
        humidity?: number;
      };
      if (!j?.condition || typeof j.temperature?.value !== 'number') throw new WeatherError('unknown', weatherErrorMessage('unknown', host, '返回里没有实时天气'));
      const temp = Math.round(j.temperature.value);
      return {
        temp,
        text: String(j.condition.text ?? ''),
        icon: qweatherIcon(String(j.condition.code ?? '')),
        feelsLike: typeof j.feelsLike?.value === 'number' ? Math.round(j.feelsLike.value) : temp,
        humidity: typeof j.humidity === 'number' ? Math.round(j.humidity * 100) : null,
        observedAt: new Date(),
        provider: 'qweather',
        attribution: j.metadata?.attributions?.find((u) => /^https:\/\//.test(u)) ?? QWEATHER_SITE,
      };
    }
    if (resp.status !== 404) throw await errorFromResponse(resp, host);
    v7Hosts.add(host);
  }
  // v7（2027-08-01 停服前的退路）：location 是 LocationID 或「经度,纬度」
  const loc = city.id?.trim() || `${city.lon.toFixed(2)},${city.lat.toFixed(2)}`;
  const resp = await getJson(`https://${host}/v7/weather/now?location=${encodeURIComponent(loc)}&key=${qkey(cfg)}`, host, signal);
  if (!resp.ok) throw await errorFromResponse(resp, host);
  const j = await resp.json().catch(() => null) as { code?: string; now?: Record<string, string> } | null;
  if (j?.code && j.code !== '200') {
    const kind = kindOfLegacyCode(String(j.code));
    throw new WeatherError(kind, weatherErrorMessage(kind, host));
  }
  const n = j?.now;
  if (!n) throw new WeatherError('unknown', weatherErrorMessage('unknown', host, '返回里没有 now 段'));
  return {
    temp: Math.round(Number(n.temp)),
    text: String(n.text ?? ''),
    icon: qweatherIcon(String(n.icon ?? '')),
    feelsLike: Math.round(Number(n.feelsLike ?? n.temp)),
    humidity: n.humidity != null ? Number(n.humidity) : null,
    observedAt: n.obsTime ? new Date(n.obsTime) : new Date(),
    provider: 'qweather',
    attribution: QWEATHER_SITE,
  };
}

async function fetchOpenMeteo(cfg: WeatherConfig, signal?: AbortSignal): Promise<WeatherNow> {
  const { lat, lon } = cfg.city!;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code&timezone=auto';
  let resp: Response;
  try { resp = await fetch(url, { signal }); } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new WeatherError('network', '连不上 Open-Meteo：它的服务器在欧美，当前网络可能到不了，换个网络或改用和风天气。');
  }
  if (!resp.ok) throw new WeatherError(resp.status === 429 ? 'rate' : resp.status >= 500 ? 'server' : 'unknown', `Open-Meteo 暂时取不到（HTTP ${resp.status}），稍后再试。`, resp.status);
  const j = await resp.json() as { current?: Record<string, number | string> };
  const c = j.current;
  if (!c) throw new WeatherError('unknown', 'Open-Meteo 返回里没有 current 段');
  const code = Number(c.weather_code);
  return {
    temp: Math.round(Number(c.temperature_2m)),
    text: WMO_TEXT[code] ?? '—',
    icon: wmoIcon(code, Number(c.is_day) === 1),
    feelsLike: Math.round(Number(c.apparent_temperature ?? c.temperature_2m)),
    humidity: c.relative_humidity_2m != null ? Number(c.relative_humidity_2m) : null,
    observedAt: c.time ? new Date(String(c.time)) : new Date(),
    provider: 'openmeteo',
    attribution: OPEN_METEO_SITE,
  };
}

// ── 取数 + 缓存 + 出错后的退避 ───────────────────────────────────────────
// 天气 10 分钟内不会有意义地变化，而首页每次进出都会挂载一次角标。
// 内存缓存按 provider+城市 归键，避免白烧配额。
const CACHE_MS = 10 * 60 * 1000;
/** 一时的错误（网络 / 限流 / 服务端）之后多久再自动试 */
const TRANSIENT_BACKOFF_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; data: WeatherNow }>();

const cacheKey = (cfg: WeatherConfig) =>
  `${cfg.provider ?? 'qweather'}|${cfg.city?.id ?? ''}|${cfg.city?.lat}|${cfg.city?.lon}`;

/** 退避按「整套配置」算：换了 KEY / Host / 城市 / 服务商就是新的一套，立刻可以再试。只存指纹，不存 KEY 本身 */
const configSig = (cfg: WeatherConfig): string => {
  const raw = `${cfg.provider ?? 'qweather'}|${normalizeQWeatherHost(cfg.host)}|${cfg.apiKey?.trim() ?? ''}|${cfg.city?.lat}|${cfg.city?.lon}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
};
interface Block { sig: string; until: number; kind: QWeatherErrorKind; message: string }
const BLOCK_KEY = 'velvet:weatherBlock.v1';
let block: Block | null = (() => {
  try { const raw = localStorage.getItem(BLOCK_KEY); return raw ? JSON.parse(raw) as Block : null; } catch { return null; }
})();
const saveBlock = (b: Block | null) => {
  block = b;
  try { if (b) localStorage.setItem(BLOCK_KEY, JSON.stringify(b)); else localStorage.removeItem(BLOCK_KEY); } catch { /* 存不了只在本次运行里生效 */ }
};

/** 这套配置现在是不是在「出错后先别自动取」的状态；返回那次的错误（UI 显示用） */
export function weatherBlockedError(cfg: WeatherConfig): WeatherError | null {
  if (!block || block.sig !== configSig(cfg) || Date.now() >= block.until) return null;
  return new WeatherError(block.kind, block.message);
}

export async function fetchWeatherNow(
  cfg: WeatherConfig,
  opts: { force?: boolean; signal?: AbortSignal } = {},
): Promise<WeatherNow> {
  if (!weatherReady(cfg)) throw new WeatherError('host', '天气还没配好（缺城市、KEY 或 API Host）');
  const key = cacheKey(cfg);
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  if (!opts.force) {
    const blocked = weatherBlockedError(cfg);
    if (blocked) throw blocked;
  }
  try {
    const data = (cfg.provider ?? 'qweather') === 'openmeteo'
      ? await fetchOpenMeteo(cfg, opts.signal)
      : await fetchQWeather(cfg, opts.signal);
    cache.set(key, { at: Date.now(), data });
    if (block) saveBlock(null);
    return data;
  } catch (e) {
    if (e instanceof WeatherError) {
      // 配置类：直到改了设置（指纹变了）或手动测试，都不再自动发；一时的：15 分钟后再试
      saveBlock({ sig: configSig(cfg), until: e.config ? Number.MAX_SAFE_INTEGER : Date.now() + TRANSIENT_BACKOFF_MS, kind: e.kind, message: e.message });
    }
    throw e;
  }
}

/**
 * 只看缓存、不发请求：记录保存时附天气用——10 分钟内的才算，没有就返回 null，绝不为等天气拖慢保存（第 6 轮）。
 * maxAgeMs：调用方能接受更旧的（今日委托只问「下没下雨」，90 分钟内取过的就够，第 16 批）
 */
export function peekWeatherNow(cfg: WeatherConfig, maxAgeMs: number = CACHE_MS): WeatherNow | null {
  if (!weatherReady(cfg)) return null;
  const hit = cache.get(cacheKey(cfg));
  return hit && Date.now() - hit.at < maxAgeMs ? hit.data : null;
}

/** settings 里的四个天气字段 → WeatherConfig（首页天气角标与记录附天气共用一个口径） */
export const weatherConfigOf = (s: {
  weatherProvider?: WeatherProvider; weatherApiKey?: string; weatherApiHost?: string; weatherCity?: WeatherCity;
}): WeatherConfig => ({ provider: s.weatherProvider, apiKey: s.weatherApiKey, host: s.weatherApiHost, city: s.weatherCity });

// ── 城市检索 ──────────────────────────────────────────────────────────
// 和风 GeoAPI：同一把 KEY，路径是 API Host 下的 /geo/v2/city/lookup；
// Open-Meteo 有免 Key 的 geocoding。两边统一成 WeatherCity[]。

export async function searchCity(
  q: string,
  cfg: WeatherConfig,
  signal?: AbortSignal,
): Promise<WeatherCity[]> {
  const query = q.trim();
  if (!query) return [];
  if ((cfg.provider ?? 'qweather') === 'qweather') {
    const host = normalizeQWeatherHost(cfg.host);
    const hi = qweatherHostIssue(host);
    if (!cfg.apiKey?.trim()) throw new WeatherError('auth', '先填 API KEY 再搜城市。');
    if (hi && hi !== 'unusual') throw new WeatherError('host', qweatherHostHint(hi));
    const url = `https://${host}/geo/v2/city/lookup?location=${encodeURIComponent(query)}&number=10&lang=zh&key=${qkey(cfg)}`;
    const resp = await getJson(url, host, signal);
    if (!resp.ok) {
      const err = await errorFromResponse(resp, host);
      if (err.kind === 'location') return [];
      throw err;
    }
    const j = await resp.json().catch(() => null) as { code?: string; location?: Array<Record<string, string>> } | null;
    if (j?.code === '404') return [];
    if (j?.code && j.code !== '200') {
      const kind = kindOfLegacyCode(String(j.code));
      throw new WeatherError(kind, weatherErrorMessage(kind, host));
    }
    return (j?.location ?? []).map(l => ({
      id: l.id,
      // 「朝阳·北京」这种带上级行政区的写法，避免同名区县分不清
      name: l.adm2 && l.adm2 !== l.name ? `${l.name}·${l.adm2}` : l.name,
      lat: Number(l.lat),
      lon: Number(l.lon),
    }));
  }
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=zh`;
  let resp: Response;
  try { resp = await fetch(url, { signal }); } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new WeatherError('network', '连不上 Open-Meteo 的城市检索，换个网络再试。');
  }
  if (!resp.ok) throw new WeatherError('server', `Open-Meteo 城市检索暂时不可用（HTTP ${resp.status}）`, resp.status);
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

/** 测试用：清掉缓存 / 退避 / v7 记忆 */
export function _resetWeatherForTest(): void {
  cache.clear();
  v7Hosts.clear();
  saveBlock(null);
}
