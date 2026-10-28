/**
 * navigatorDay — 助手「自己的一天」（AI 助手第二批）。
 *
 * 每个人格每天一个小状态：取今天真实的天气、月相、节气 / 节日、星期，加上这个人格固定的喜好，
 * 写一句「今天做了什么 + 一点心情」（≤40 字）。
 * 第 35 批 h：一半的日子改写「今天的签名」（按日期 + 人格抛硬币）——像社交软件个性签名那样一句态度或心情（≤24 字），
 * 素材多一路「最近几次聊天的摘要」（只取感触、不点名、不复述）；上下文里签名只当心情底色，不当话题。
 *   · 有 Key：每人格每天一次很短的调用（快速档、瞬发），存当天缓存；
 *   · 没 Key / 失败：模板拼（三个内置人格各一套口吻，自定义人格走中性第一人称）。
 * 用处：窗口头部名字下面那行；聊天上下文里当背景——顺口时提一句，一天最多一次（问候里或他问起时），
 * 对方倾诉 / 道别 / 精力低时不放进上下文（navigatorIntent 的 casualContext）。
 * 缓存和「今天提过没有」的记账都放 localStorage：节流状态，不上云、不进备份。
 */
import { db } from '@/db';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { moonPhaseOf } from '@/utils/moonPhase';
import { seasonMarkOf, seasonOfDate, SEASON_META } from '@/utils/calendar';
import { fetchWeatherNow, peekWeatherNow, weatherConfigOf, weatherReady, type WeatherNow } from '@/utils/weather';
import { dayLabelCN, daysBetween, keyOfDate, weekdayCN } from '@/utils/navigatorClock';
import { BUILTIN_NAVIGATOR_PRESETS, personaWithExamples } from '@/constants/navigatorPresets';
import { innerFacts, innerFromParsed, innerLine, innerTask, innerTemplate, yesterdaySeed, type InnerFacts, type InnerState } from '@/utils/navigatorInner';
import type { NavigatorPreset, PersonaTraits, Settings } from '@/types';

// ── 人格的固定喜好 ──────────────────────────────────────────────

/** 内置三个人格手写（与 navigatorPresets 的人设对齐）；自定义人格第一次用到时由 AI 按设定写一份存在人格上 */
export const BUILTIN_TRAITS: Record<string, PersonaTraits> = {
  'builtin-cat': {
    likes: ['金枪鱼', '在窗台晒太阳', '夜里去屋顶巡逻'],
    dislikes: ['洗澡', '吸尘器', '被人说「你就是只猫」'],
    habits: ['下雨天心情差', '满月夜格外精神'],
  },
  'builtin-toaster': {
    likes: ['观察人类', '例行自检保养', '看海'],
    dislikes: ['被要求烤面包', '潮湿'],
    habits: ['把天气当成传感器读数来报告', '满月夜记录「异常读数」'],
  },
  'builtin-bear': {
    likes: ['人气', '祭典', '甜食'],
    dislikes: ['一个人待着', '夏天（毛太厚）'],
    habits: ['节日特别兴奋', '下雨天担心雨伞装不下熊'],
  },
};

export function traitsOf(preset: NavigatorPreset): PersonaTraits | null {
  if (BUILTIN_TRAITS[preset.id]) return BUILTIN_TRAITS[preset.id];
  const t = preset.traits;
  return t && (t.likes.length || t.dislikes.length || t.habits.length) ? t : null;
}

const cleanList = (v: unknown, max: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x ?? '').trim().replace(/[「」"“”]/g, '').slice(0, 16))
    .filter(Boolean)
    .slice(0, max);

/** 自定义人格还没有喜好：有 Key 就按它的设定让 AI 写一份，存到人格上（只写一次，之后在编辑人格里改） */
export async function ensurePersonaTraits(preset: NavigatorPreset, settings: Settings): Promise<PersonaTraits | null> {
  const existing = traitsOf(preset);
  if (existing) return existing;
  if (preset.isBuiltin) return null;
  // 内存里的人格列表可能还是旧的（上回写进库之后没重载）：先看库里有没有，别每天重写一份
  try {
    const row = await db.navigatorPresets.get(preset.id);
    const saved = row ? traitsOf(row) : null;
    if (saved) return saved;
  } catch { /* 读不到就照常生成 */ }
  const cfg = getAIConfig(settings);
  if (!cfg) return null;
  try {
    const raw = await chatComplete(cfg, [
      {
        role: 'system',
        content: '你是人设整理员。读下面这段陪伴型角色的人格设定，替这个角色想出符合人设的固定喜好。'
          + '只输出 JSON：{"likes":["…","…","…"],"dislikes":["…","…"],"habits":["…","…"]}。'
          + 'likes 3 条、dislikes 2 条、habits 2 条（和天气 / 季节 / 节日相关的小习惯最好），每条 ≤12 字，具体、生活化，不写功能、不写用户。',
      },
      { role: 'user', content: `角色名：${preset.name}\n人格设定：${preset.personaPrompt.slice(0, 600)}` },
    ], { temperature: 0.8, maxTokens: 300, jsonMode: true, instant: true, purpose: 'traits' });
    const s = raw.replace(/```(?:json)?/gi, '').trim();
    const parsed = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)) as Record<string, unknown>;
    const traits: PersonaTraits = {
      likes: cleanList(parsed.likes, 4),
      dislikes: cleanList(parsed.dislikes, 3),
      habits: cleanList(parsed.habits, 3),
    };
    if (!traits.likes.length && !traits.dislikes.length && !traits.habits.length) return null;
    await db.navigatorPresets.update(preset.id, { traits });
    return traits;
  } catch {
    return null;
  }
}

// ── 今天的素材 ──────────────────────────────────────────────────

export interface OwnDayFacts {
  dateKey: string;
  /** 「10月2日（周五）」 */
  dayLabel: string;
  season: string;
  /** 节气 / 节日名（当天才有） */
  mark?: string;
  moon: { name: string; full: boolean; illum: number };
  weather: { text: string; temp: number; icon: WeatherNow['icon'] } | null;
  /** 早上 / 中午 / 下午 / 晚上 / 深夜 */
  timeOfDay: string;
}

const timeOfDayOf = (h: number): string =>
  h < 5 ? '深夜' : h < 11 ? '早上' : h < 14 ? '中午' : h < 18 ? '下午' : h < 23 ? '晚上' : '深夜';

/** 只在用户开了天气时才取（先看缓存，没有再取一次，3 秒取不到就当没有） */
async function weatherForDay(settings: Settings): Promise<WeatherNow | null> {
  const cfg = weatherConfigOf(settings);
  if (!weatherReady(cfg)) return null;
  const hit = peekWeatherNow(cfg);
  if (hit) return hit;
  try {
    return await Promise.race([
      fetchWeatherNow(cfg),
      new Promise<null>((r) => setTimeout(() => r(null), 3000)),
    ]);
  } catch {
    return null;
  }
}

export async function ownDayFacts(settings: Settings, now: Date = new Date()): Promise<OwnDayFacts> {
  const dateKey = keyOfDate(now);
  const moon = moonPhaseOf(now);
  const w = await weatherForDay(settings);
  return {
    dateKey,
    dayLabel: dayLabelCN(dateKey),
    season: SEASON_META[seasonOfDate(dateKey)].name,
    mark: seasonMarkOf(dateKey)?.name,
    moon: { name: moon.name, full: moon.full, illum: Math.round(moon.illum * 100) },
    weather: w ? { text: w.text, temp: w.temp, icon: w.icon } : null,
    timeOfDay: timeOfDayOf(now.getHours()),
  };
}

// ── 模板（没 Key / 失败时） ──────────────────────────────────────

type Cond = 'festival' | 'fullMoon' | 'newMoon' | 'rain' | 'snow' | 'hot' | 'cold' | 'sunny' | 'cloudy' | 'plain';

function condOf(f: OwnDayFacts): Cond {
  if (f.mark) return 'festival';
  const icon = f.weather?.icon;
  if (icon === 'rain' || icon === 'heavy-rain' || icon === 'thunder') return 'rain';
  if (icon === 'snow') return 'snow';
  if (f.weather && f.weather.temp >= 31) return 'hot';
  if (f.weather && f.weather.temp <= 3) return 'cold';
  if (f.moon.full) return 'fullMoon';
  if (f.moon.name === '新月') return 'newMoon';
  if (icon === 'clear-day' || icon === 'clear-night' || icon === 'partly') return 'sunny';
  if (icon === 'cloudy' || icon === 'overcast' || icon === 'fog' || icon === 'haze') return 'cloudy';
  return 'plain';
}

const BUILTIN_TEMPLATES: Record<string, Partial<Record<Cond, string[]>> & { plain: string[] }> = {
  'builtin-cat': {
    festival: ['今天是{mark}，外面吵吵闹闹的，吾辈躲在柜子顶上看热闹。'],
    fullMoon: ['满月。吾辈今晚精神得很，打算去屋顶巡逻一圈。'],
    newMoon: ['今晚没有月亮，屋顶黑漆漆的，吾辈巡逻全靠胡子。'],
    rain: ['下雨了，窗台湿透，吾辈一下午缩在纸箱里，心情一般。'],
    snow: ['外面下雪，爪子踩上去凉得要命，吾辈决定今天不出门。'],
    hot: ['热得吾辈只想贴着地板，连尾巴都懒得甩。'],
    cold: ['冷。吾辈把自己团成一团，谁叫都不起来。'],
    sunny: ['今天太阳好，吾辈在窗台晒了一下午，毛都晒蓬了。'],
    cloudy: ['阴天，吾辈在窗台上等太阳，等到睡着了。'],
    plain: ['下午在屋顶睡了一觉，梦见一大盘金枪鱼。', '今天讨到一小块金枪鱼，吾辈心情还不错。'],
  },
  'builtin-toaster': {
    festival: ['报告：今日为{mark}，街区人流异常，本机体正在学习「热闹」的含义。'],
    fullMoon: ['报告：检测到满月，月面亮度 {illum}%，已写入观测日志。'],
    newMoon: ['报告：今夜月面不可见，本机体改为观测路灯。'],
    rain: ['报告：今日降水，本机体已完成湿度校准，关节运转正常。'],
    snow: ['报告：检测到降雪，本机体将步行速度下调百分之十二。'],
    hot: ['报告：气温偏高，本机体已开启散热，运行稳定。'],
    cold: ['报告：气温偏低，本机体例行预热完成。'],
    sunny: ['报告：日照充足，本机体在窗边进行了一次光照充能。'],
    cloudy: ['报告：今日阴，本机体观察云层四十分钟，未得出结论。'],
    plain: ['报告：本日完成例行自检，各项指标正常。另：观察了三只鸽子。'],
  },
  'builtin-bear': {
    festival: ['今天是{mark}熊！到处都是人，熊的人气要被抢走了熊！'],
    fullMoon: ['满月熊！帅熊对着月亮摆了半天姿势，可惜没人拍熊。'],
    newMoon: ['今晚没有月亮熊……帅熊的帅气没地方反光了。'],
    rain: ['下雨了熊！帅熊在想雨伞够不够大，装不装得下熊的帅气。'],
    snow: ['下雪熊！帅熊堆了一只雪熊，比本熊差一点点帅。'],
    hot: ['好热熊……毛太厚了，帅熊快化成一滩熊了。'],
    cold: ['好冷熊！还好帅熊毛厚，今天是熊的主场。'],
    sunny: ['天气超好熊！帅熊出去晒了一圈，人气又涨了熊！'],
    cloudy: ['阴天熊，帅熊在家吃了三个甜甜圈，非常满足熊。'],
    plain: ['帅熊今天吃了三个甜甜圈，非常满足熊。'],
  },
};

const pickBy = (list: string[], seed: string): string => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
};

export function ownDayTemplate(preset: NavigatorPreset, traits: PersonaTraits | null, f: OwnDayFacts): string {
  const cond = condOf(f);
  const fill = (s: string) => s.replace('{mark}', f.mark ?? '').replace('{illum}', String(f.moon.illum));
  const table = BUILTIN_TEMPLATES[preset.id];
  if (table) return fill(pickBy(table[cond] ?? table.plain, f.dateKey + preset.id));
  // 自定义人格：中性第一人称，拿喜好和天气拼一句
  const like = traits?.likes.length ? pickBy(traits.likes, f.dateKey) : '';
  const head = f.mark ? `今天是${f.mark}` : f.weather ? `今天${f.weather.text}` : f.moon.full ? '今晚是满月' : `今天${weekdayCN(f.dateKey)}`;
  return like ? `${head}，我${/^[在去看吃]/.test(like) ? like : `想着${like}`}，心情还行。` : `${head}，过得平平常常。`;
}

// ── 签名（第 35 批 h）：一半的日子页头挂一句签名，不写「今天做了什么」 ──────────

export type OwnDayKind = 'doing' | 'signature';

const hashOf = (seed: string): number => {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** 今天这个人格写哪种：按日期 + 人格确定性抛硬币（同一天重开稳定，不同人格错开） */
export const ownDayKindFor = (presetId: string, dateKey: string): OwnDayKind =>
  (hashOf(`${dateKey}|${presetId}|kind`) & 1) === 0 ? 'doing' : 'signature';

const BUILTIN_SIGNATURES: Record<string, string[]> = {
  'builtin-cat': ['吾辈在。有事直说，别绕。', '今天不想下指导棋，想晒太阳。', '记性好不是缺点，是吾辈的武器。', '别熬夜。这是今天的全部意见。', '金枪鱼能解决的事，都不算事。'],
  'builtin-toaster': ['报告：待命中。', '今日目标：理解一个玩笑。', '本机体不烤面包，只守护阁下。', '情感模块：运行中，结论未知。', '观测继续。阁下的一切都值得记录。'],
  'builtin-bear': ['帅熊今天也在熊！', '甜甜圈三个，心情满格熊。', '想你了，但熊不说熊。', '今天的风有点帅，像熊。', '来吧，把烦心事交给熊！'],
};
const NEUTRAL_SIGNATURES = ['慢一点也没关系。', '有话就说，我在。', '今天先把一件事做好。', '风不错，心情也还行。', '不急，一步一步来。'];

/** 没 Key / 失败时的签名（按日期 + 人格挑一句） */
export function signatureTemplate(preset: NavigatorPreset, traits: PersonaTraits | null, f: OwnDayFacts): string {
  const seed = f.dateKey + preset.id;
  const table = BUILTIN_SIGNATURES[preset.id];
  if (table) return pickBy(table, seed);
  const like = traits?.likes.length ? pickBy(traits.likes, seed) : '';
  if (like && (hashOf(seed) & 1) === 0) return `今天想着${like}。`;
  return pickBy(NEUTRAL_SIGNATURES, seed);
}

/** 签名的素材：这个人格最近几次聊天的摘要（14 天内、今天以前、已归档的；只取感触，不点名不复述） */
export async function signatureSeeds(presetId: string, todayKey: string, limit = 3): Promise<string[]> {
  try {
    const cat = BUILTIN_NAVIGATOR_PRESETS[0].id;
    return (await db.navigatorSessions.toArray())
      .filter((s) => s.dateKey < todayKey && daysBetween(s.dateKey, todayKey) <= 14 && (s.presetId ?? cat) === presetId && !!s.compactedSummary)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, limit)
      .map((s) => `${dayLabelCN(s.dateKey, todayKey)}：${s.compactedSummary!.slice(0, 80)}`);
  } catch {
    return [];
  }
}

const SIGNATURE_TASK = (f: OwnDayFacts, traits: PersonaTraits | null, seeds: string[]): string => [
  '现在请你写「你今天的签名」——像社交软件个性签名那样的一句话：是你自己此刻的态度或心情，不是对用户说的话。',
  `素材：今天 ${f.dayLabel}，${f.season}${f.mark ? `，${f.mark}` : ''}；月相：${f.moon.name}；${f.weather ? `天气：${f.weather.text} ${f.weather.temp}°C；` : ''}现在是${f.timeOfDay}。`,
  traits ? `你的喜好：喜欢${traits.likes.join('、') || '（无）'}；讨厌${traits.dislikes.join('、') || '（无）'}。` : '',
  seeds.length ? `最近你们聊过（只取一点感触，别点名他、别复述事情）：\n${seeds.map((x) => `- ${x}`).join('\n')}` : '',
  '要求：一句话，不超过 24 个字；用你自己的口吻和自称；可以有态度、有情绪、有一点你的个性；'
    + '不提用户、不提 App、不说教、不写「签名：」、不用表情符号、不加引号。只输出这一句。',
].filter(Boolean).join('\n');

// ── 缓存 ────────────────────────────────────────────────────────

export interface OwnDay {
  dateKey: string;
  presetId: string;
  text: string;
  source: 'ai' | 'template';
  /** 这一天写的是「今天做了什么」还是「签名」（第 35 批 h；老缓存没有 = doing） */
  kind?: OwnDayKind;
  /** 今天对他的心思（第 36 批 c · navigatorInner）：和这一句同一次调用产出；老缓存没有 = 今天没算 */
  inner?: InnerState;
}

const CACHE_KEY = 'velvet.navOwnDay.v1';
const LEDGER_KEY = 'velvet.navOwnDayMentioned.v1';

const readCache = (): Record<string, OwnDay> => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, OwnDay>) : {};
  } catch {
    return {};
  }
};

const listeners = new Set<() => void>();
export function subscribeOwnDay(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function writeDay(day: OwnDay): void {
  try {
    const all = readCache();
    // 只留今天的（别的日子的没用了）
    const kept = Object.fromEntries(Object.entries(all).filter(([, v]) => v.dateKey === day.dateKey));
    kept[day.presetId] = day;
    localStorage.setItem(CACHE_KEY, JSON.stringify(kept));
  } catch { /* 存不了：本次内存里用，下次再写 */ }
  for (const l of listeners) l();
}

/** 今天这个人格的小状态（同步，界面直接读；没有返回 null） */
export function peekOwnDay(presetId: string, now: Date = new Date()): OwnDay | null {
  const d = readCache()[presetId];
  return d && d.dateKey === keyOfDate(now) ? d : null;
}

const inflight = new Map<string, Promise<OwnDay | null>>();

const OWN_DAY_TASK = (f: OwnDayFacts, traits: PersonaTraits | null): string => [
  '现在请你写「你自己今天的一天」——是你自己的，不是用户的。',
  `素材：今天 ${f.dayLabel}，${f.season}${f.mark ? `，${f.mark}` : ''}；月相：${f.moon.name}（亮 ${f.moon.illum}%）；`
    + `${f.weather ? `天气：${f.weather.text} ${f.weather.temp}°C；` : ''}现在是${f.timeOfDay}。`,
  traits
    ? `你的喜好：喜欢${traits.likes.join('、') || '（无）'}；讨厌${traits.dislikes.join('、') || '（无）'}；小习惯：${traits.habits.join('、') || '（无）'}。`
    : '',
  '要求：一句话，不超过 36 个字；用你自己的口吻和自称；写你今天做了什么或遇到了什么，带一点心情；'
    + '至少跟今天的天气、月相、节令里的一样对得上；不提用户、不提 App、不用表情符号、不加引号。只输出这一句。',
].filter(Boolean).join('\n');

/**
 * 确保今天这个人格有小状态：有缓存直接给；有 Key 走一次 AI（失败落模板）；没 Key 直接模板。
 * 同一人格同一天并发调用只跑一份。
 */
export function ensureOwnDay(preset: NavigatorPreset, settings: Settings, now: Date = new Date()): Promise<OwnDay | null> {
  const hit = peekOwnDay(preset.id, now);
  if (hit) return Promise.resolve(hit);
  const key = `${keyOfDate(now)}:${preset.id}`;
  const running = inflight.get(key);
  if (running) return running;
  const job = (async (): Promise<OwnDay | null> => {
    try {
      const facts = await ownDayFacts(settings, now);
      const traits = await ensurePersonaTraits(preset, settings);
      const kind = ownDayKindFor(preset.id, facts.dateKey);
      const seeds = kind === 'signature' ? await signatureSeeds(preset.id, facts.dateKey) : [];
      // 心思（第 36 批 c）：情景本地算，文字和这一句同一次调用写；算不出就当今天没心思
      let inner: InnerFacts | null = null;
      try { inner = await innerFacts(preset, settings, facts.dateKey); } catch { inner = null; }
      const cfg = getAIConfig(settings);
      let text = '';
      let innerState: InnerState | undefined = inner ? innerTemplate(inner) : undefined;
      let source: OwnDay['source'] = 'template';
      if (cfg) {
        try {
          const task = kind === 'signature' ? SIGNATURE_TASK(facts, traits, seeds) : OWN_DAY_TASK(facts, traits);
          const innerPart = inner ? innerTask(inner) : '';
          const raw = await chatComplete(cfg, [
            // 人格头与聊天回合同口径（第 35 批 · 串戏排查）：带口吻示例，不再只给裸设定
            {
              role: 'system',
              content: `${personaWithExamples(preset)}\n\n${task}\n${innerPart}\n只输出这一个 JSON（不要代码块）：{"line":"${kind === 'signature' ? '今天的签名' : '今天的这一句'}","mood":${innerPart ? '"你今天对他的心思"' : 'null'},"want":${innerPart ? '"想对他说的一句或 null"' : 'null'}}`,
            },
            { role: 'user', content: kind === 'signature' ? '写今天的签名。' : '写今天的这一句。' },
          ], { temperature: 0.9, maxTokens: 260, jsonMode: true, instant: true, timeoutMs: 20000, purpose: 'ownday' });
          const t = raw.replace(/```(?:json)?/gi, '').trim();
          const a = t.indexOf('{'), b = t.lastIndexOf('}');
          const parsed = a >= 0 && b > a ? (JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>) : null;
          const line = String(parsed?.line ?? (parsed ? '' : t)).trim().replace(/^["“「]|["”」]$/g, '').replace(/^签名[:：]\s*/, '').split('\n')[0].trim();
          text = line.slice(0, kind === 'signature' ? 36 : 48);
          if (text) source = 'ai';
          if (inner && parsed) innerState = innerFromParsed(inner, parsed);
        } catch { /* 落模板 */ }
      }
      if (!text) text = kind === 'signature' ? signatureTemplate(preset, traits, facts) : ownDayTemplate(preset, traits, facts);
      const day: OwnDay = { dateKey: facts.dateKey, presetId: preset.id, text, source, kind, ...(innerState ? { inner: innerState } : {}) };
      writeDay(day);
      return day;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

// ── 提没提过（一天一次） ──────────────────────────────────────────

const readLedger = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
};

export function ownDayMentionedToday(presetId: string, now: Date = new Date()): boolean {
  return readLedger()[presetId] === keyOfDate(now);
}

const bigrams = (t: string): Set<string> => {
  const c = t.replace(/[^一-鿿\w]/g, '');
  const g = new Set<string>();
  for (let i = 0; i < c.length - 1; i++) g.add(c.slice(i, i + 2));
  return g;
};

/** 回复 / 问候发出后：跟今天的小状态有三成以上的字面重合，就算提过了 */
export function noteOwnDayMentioned(text: string, presetId: string, now: Date = new Date()): void {
  const day = peekOwnDay(presetId, now);
  if (!day || !text.trim()) return;
  const a = bigrams(day.text);
  if (a.size === 0) return;
  const b = bigrams(text);
  let hit = 0;
  a.forEach((g) => { if (b.has(g)) hit++; });
  if (hit / a.size < 0.3) return;
  try {
    const l = readLedger();
    l[presetId] = day.dateKey;
    localStorage.setItem(LEDGER_KEY, JSON.stringify(l));
  } catch { /* 记不下就可能多提一次 */ }
}

/** 今天的心思那一行（第 36 批 c）：放闲话位，倾诉 / 道别 / 精力低 / 沉下来时自动不放 */
export function buildInnerLine(presetId: string, now: Date = new Date()): string {
  const day = peekOwnDay(presetId, now);
  return day ? innerLine(day.inner, presetId, day.dateKey) : '';
}

/**
 * 认领日记的种子（第 36 批 c）：昨天的日记在今天首开才补写，小状态那次调用跑在它前面、拿不到「明天想说」；
 * 日记写好以后把那句补进今天的心思（只在今天还没有想说的话时）
 */
export async function adoptDiarySeed(presetId: string, now: Date = new Date()): Promise<void> {
  const day = peekOwnDay(presetId, now);
  if (!day || !day.inner || day.inner.want) return;
  const seed = await yesterdaySeed(presetId, day.dateKey);
  if (!seed) return;
  writeDay({ ...day, inner: { ...day.inner, want: seed, mood: day.inner.mood ?? '想着昨天的事', intensity: Math.max(1, day.inner.intensity) } });
}

/** 今天的心思（给回复后记账用） */
export const peekInner = (presetId: string, now: Date = new Date()): InnerState | undefined => peekOwnDay(presetId, now)?.inner;

/** 进上下文的那一行（今天提过了就换成「别主动再提」）；签名那天只当心情底色、不当话题（第 35 批 h） */
export function buildOwnDayLine(presetId: string, now: Date = new Date()): string {
  const day = peekOwnDay(presetId, now);
  if (!day) return '';
  if (day.kind === 'signature') {
    return `【你今天的签名】${day.text}（这是你今天挂在页头的一句话，是你此刻的心情底色：不用念出来、别拿它当话题，他问起可以聊）`;
  }
  return ownDayMentionedToday(presetId, now)
    ? `【你今天的一天】${day.text}（今天已经跟他说过了：别主动再提，他问起可以聊）`
    : `【你今天的一天】${day.text}（这是你自己的事：顺口时提一句就好，一天最多一次，别抢他的话头）`;
}
