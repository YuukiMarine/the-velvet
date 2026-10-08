import type { Activity, AttributeId, Todo, TodoCompletion } from '@/types';
import { LIFE_QUEST_PRESETS, type LifeQuestPreset, type LifeQuestTag } from '@/constants/lifeQuestPresets';
import { peekWeatherNow, weatherConfigOf, type WeatherNow } from '@/utils/weather';

export { LIFE_QUEST_PRESETS };
export type { LifeQuestPreset, LifeQuestTag };

/**
 * 今日委托（第 13 轮用户反馈：「别人给的任务比自己设的更有意思，也省了自己设置的麻烦」；第 16 批加「看情境」和「学取舍」）
 * ——纯逻辑，零 AI。题库在 constants/lifeQuestPresets.ts（人工维护）。
 *
 *  - 每天三张、来自三个不同的维度：一张补「最近 14 天记得最少的一维」（只看今天以前，免得今天记一笔卡片当场变脸），
 *    另两张从其余几维里挑。
 *  - 看情境：过了 until 那个钟点的不出（凌晨 5 点前打开不管，一整天还在前头）；下雨、下雪、雾霾、体感太热太冷不出户外的，
 *    暴雨雷暴下雪时要出门的少出；周末多出标了 weekend 的，工作日多出标了 weekday 的。
 *    情境按当天第一次打开委托板 / 点「换一批」那一刻算，之后同一天不变脸。天气只用 90 分钟内取过的，不为出题专门发请求。
 *  - 学取舍：本机记下每张卡哪天被翻到、哪天被换掉；加没加、做没做完从清单里数（清单会同步，换设备也算数）。
 *    翻到常加、加了常做完的多出，总被换掉、翻到不加的少出；同类（要出门 / 花钱 / 社交 / 运动）一起学；
 *    补短板以外那两张里，常被选的那一维稍多出；加了常做不完就多出 1 点的小事，几乎都做完就多出 2、3 点的。只看最近 60 天。
 *  - 冷却：最近 6 天出过的不出（含今天换掉的），每维 16 条，够轮；实在轮不开才放宽。
 *  - 不出：清单里还挂着的同名任务、同一张卡（今天以前加的）；换一批时不出刚才那几张。
 *  - 点「加入今日任务」= 建一条普通的单次待办（带 lifeQuest 标记），完成照常按它的属性加点。
 *  - 两台设备可能不是同一批：各按自己打开时的情境和本机记下的取舍算。
 */

export interface LifeQuest {
  /** 预设 id + 填词序号：同一天同一张卡的稳定键 */
  key: string;
  presetId: string;
  title: string;
  attribute: AttributeId;
  points: number;
  hint: string;
}

export const LIFE_QUEST_ATTRS: readonly AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
export const LIFE_QUEST_COUNT = 3;
/** 一天最多换几批（换的次数记在本机） */
export const LIFE_QUEST_REROLLS = 2;
/** 最近几天出过的不再出（含今天前面那几批） */
export const LIFE_QUEST_COOLDOWN_DAYS = 6;
/** 学取舍只看最近多少天（老习惯自然淡出） */
export const LIFE_QUEST_LEARN_DAYS = 60;
/** 天气只用多久以内取过的 */
const WEATHER_FRESH_MS = 90 * 60_000;

const pad = (n: number) => String(n).padStart(2, '0');
export const lifeDayKeyOf = (d: Date | string): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
/** 比标题：去空白标点、小写——「看一部悬疑电影」和「看一部 悬疑 电影！」算同一条 */
export const normTitle = (t: string): string => t.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
const mulberry32 = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 今天以前 14 天里，自己记的（非系统类目、非补记）各维出现了几次；一条都没有返回 null */
export function weakestAttribute(activities: Activity[], dateKey: string, seedKey = ''): AttributeId | null {
  const end = new Date(`${dateKey}T00:00:00`).getTime();
  const start = end - 14 * 86400_000;
  const count = Object.fromEntries(LIFE_QUEST_ATTRS.map((k) => [k, 0])) as Record<AttributeId, number>;
  let any = false;
  for (const a of activities) {
    if (a.category || a.backfilled) continue;
    const t = new Date(a.date).getTime();
    if (t < start || t >= end) continue;
    any = true;
    for (const k of LIFE_QUEST_ATTRS) if ((a.pointsAwarded?.[k] ?? 0) > 0) count[k] += 1;
  }
  if (!any) return null;
  // 并列最少的按种子挑一个（不总是偏向排在前面的那维）
  const min = Math.min(...LIFE_QUEST_ATTRS.map((k) => count[k]));
  const ties = LIFE_QUEST_ATTRS.filter((k) => count[k] === min);
  return ties[Math.floor(mulberry32(fnv1a(`weak|${seedKey}|${dateKey}`))() * ties.length)];
}

/** 本地日期键 → 天序号（UTC 零点算，跨时区不跳号） */
const dayIndexOf = (dateKey: string): number => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400_000);
};
const isWeekendKey = (dateKey: string): boolean => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const wd = new Date(y, (m || 1) - 1, d || 1).getDay();
  return wd === 0 || wd === 6;
};

const poolOf = (attr: AttributeId) => LIFE_QUEST_PRESETS.filter((p) => p.attribute === attr);

const render = (p: LifeQuestPreset, seedKey: string, dayIdx: number): { title: string; slot: number } => {
  if (!p.slots?.length) return { title: p.title, slot: -1 };
  const slot = Math.floor(mulberry32(fnv1a(`slot|${seedKey}|${p.id}|${dayIdx}`))() * p.slots.length);
  return { title: p.title.replace('{x}', p.slots[slot]), slot };
};

// ── 情境 ─────────────────────────────────────────────────────────────────

/** 户外天气：ok 照常；bad = 下雨、雾霾、体感 ≥ 35° 或 ≤ -10°；storm = 暴雨、雷暴、下雪 */
export type OutdoorWeather = 'ok' | 'bad' | 'storm';

export interface LifeContext {
  /** 本地几点（0–23）；不给 = 不按钟点筛 */
  hour?: number;
  /** 户外天气；不给 / null = 不知道（没开天气或取不到），不按天气筛 */
  weather?: OutdoorWeather | null;
}

export function outdoorWeatherOf(w: Pick<WeatherNow, 'icon' | 'temp' | 'feelsLike'> | null | undefined): OutdoorWeather | null {
  if (!w) return null;
  if (w.icon === 'heavy-rain' || w.icon === 'thunder' || w.icon === 'snow') return 'storm';
  const feels = Number.isFinite(w.feelsLike) ? w.feelsLike : w.temp;
  if (w.icon === 'rain' || w.icon === 'haze' || feels >= 35 || feels <= -10) return 'bad';
  return 'ok';
}

/** 现在的情境：几点 + 户外天气（只看 90 分钟内取到过的天气，不为出题专门发请求） */
export function lifeContextNow(settings: Parameters<typeof weatherConfigOf>[0], now: Date = new Date()): LifeContext {
  return { hour: now.getHours(), weather: outdoorWeatherOf(peekWeatherNow(weatherConfigOf(settings), WEATHER_FRESH_MS)) };
}

/** outdoor 已经包含 out */
const tagsOf = (p: LifeQuestPreset): LifeQuestTag[] => {
  const t = p.tags ?? [];
  return t.includes('outdoor') && !t.includes('out') ? [...t, 'out'] : [...t];
};

/** 这张在这个情境下：0 = 不出（过了钟点 / 天气不适合户外）；否则是权重倍数（周末 / 工作日 / 恶劣天气少出门） */
export function contextWeight(p: LifeQuestPreset, ctx: LifeContext, weekend: boolean): number {
  const tags = tagsOf(p);
  // 凌晨 5 点前打开：一整天还在前头，不按钟点筛
  if (p.until !== undefined && ctx.hour !== undefined && ctx.hour >= 5 && ctx.hour >= p.until) return 0;
  if (tags.includes('outdoor') && (ctx.weather === 'bad' || ctx.weather === 'storm')) return 0;
  let w = 1;
  if (tags.includes('out') && ctx.weather === 'storm') w *= 0.5;
  if (tags.includes('weekend')) w *= weekend ? 1.6 : 0.5;
  if (tags.includes('weekday')) w *= weekend ? 0.5 : 1.3;
  return w;
}

// ── 学取舍 ───────────────────────────────────────────────────────────────

/** 本机记下的：某天出过 / 翻到过 / 翻到了却换掉的卡（预设 id） */
export interface LifeQuestLog {
  days: Record<string, { shown?: string[]; viewed?: string[]; skipped?: string[] }>;
}
export type LifeQuestEvent = 'shown' | 'viewed' | 'skipped';

export interface LifeQuestTally {
  /** 翻到过几天（本机） */
  seen: number;
  /** 加进清单几次（清单，会同步） */
  added: number;
  /** 其中做完几次 */
  done: number;
  /** 翻到了、没加就点了换一批（本机） */
  skip: number;
}

export interface LifeLearning {
  tally: Record<string, LifeQuestTally>;
  /** 最近 30 天（不含今天）加进清单的今日委托做完了几成；不到 4 张 = null（不调难度） */
  doneRate: number | null;
  /** 最近 LIFE_QUEST_COOLDOWN_DAYS 天出过的：预设 id → 几天前（今天 = 0） */
  recent: Record<string, number>;
}

export const EMPTY_LEARNING: LifeLearning = { tally: {}, doneRate: null, recent: {} };
const ZERO: LifeQuestTally = { seen: 0, added: 0, done: 0, skip: 0 };

export function learningOf(opts: {
  dateKey: string;
  log?: LifeQuestLog | null;
  todos: readonly Todo[];
  completions?: readonly TodoCompletion[];
}): LifeLearning {
  const today = dayIndexOf(opts.dateKey);
  const tally: Record<string, LifeQuestTally> = {};
  const t = (id: string) => (tally[id] ??= { ...ZERO });
  const recent: Record<string, number> = {};
  for (const [d, rec] of Object.entries(opts.log?.days ?? {})) {
    const ago = today - dayIndexOf(d);
    if (ago < 0 || ago >= LIFE_QUEST_LEARN_DAYS) continue;
    for (const id of rec.viewed ?? []) t(id).seen += 1;
    for (const id of rec.skipped ?? []) t(id).skip += 1;
    if (ago < LIFE_QUEST_COOLDOWN_DAYS) for (const id of rec.shown ?? []) recent[id] = Math.min(recent[id] ?? ago, ago);
  }
  const doneIds = new Set((opts.completions ?? []).filter((c) => c.count > 0).map((c) => c.todoId));
  let added30 = 0;
  let done30 = 0;
  for (const x of opts.todos) {
    if (!x.lifeQuest) continue;
    const ago = today - dayIndexOf(lifeDayKeyOf(x.createdAt));
    if (ago < 0 || ago >= LIFE_QUEST_LEARN_DAYS) continue;
    const done = !!x.completedAt || doneIds.has(x.id);
    const s = t(x.lifeQuest);
    s.added += 1;
    if (done) s.done += 1;
    // 难度只看今天以前加的（今天加的还没到时候）
    if (ago >= 1 && ago <= 30) { added30 += 1; if (done) done30 += 1; }
  }
  return { tally, doneRate: added30 >= 4 ? done30 / added30 : null, recent };
}

/** 一天三张、平均挑一张：默认「接受率」是 1/3 */
const PRIOR_RATE = 1 / LIFE_QUEST_COUNT;

/**
 * 平滑后的接受率 ÷ 默认接受率：没数据 = 1；常加常做完 > 1；总被换掉 / 翻到不加 < 1。
 * strength = 先验当作「已经翻到过几次、按默认率接受」，越大越要更多证据才动。
 */
export function affinity(s: LifeQuestTally, strength: number, lo: number, hi: number): number {
  const shown = Math.max(s.seen, s.added);
  const rate = (s.added + 0.5 * s.done + strength * PRIOR_RATE) / (shown + 0.5 * s.skip + strength);
  return Math.min(hi, Math.max(lo, rate / PRIOR_RATE));
}

/** 用来学偏好的几类（outdoor 并进 out） */
const LEARN_TAGS: readonly LifeQuestTag[] = ['out', 'spend', 'social', 'move'];
const addTally = (into: LifeQuestTally, s: LifeQuestTally) => {
  into.seen += s.seen; into.added += s.added; into.done += s.done; into.skip += s.skip;
};

/** 每类 / 每维的取舍合计（同一批出题里算一次） */
function groupTallies(L: LifeLearning): { tag: Record<string, LifeQuestTally>; attr: Record<string, LifeQuestTally> } {
  const tag: Record<string, LifeQuestTally> = {};
  const attr: Record<string, LifeQuestTally> = {};
  for (const p of LIFE_QUEST_PRESETS) {
    const s = L.tally[p.id];
    if (!s) continue;
    addTally(attr[p.attribute] ??= { ...ZERO }, s);
    for (const g of tagsOf(p)) if (LEARN_TAGS.includes(g)) addTally(tag[g] ??= { ...ZERO }, s);
  }
  return { tag, attr };
}

/** 这张自己的取舍 × 它所属几类的取舍（几何平均，标签多的不会被罚得更重） */
export function learnWeight(p: LifeQuestPreset, L: LifeLearning, tagTally: Record<string, LifeQuestTally> = groupTallies(L).tag): number {
  const own = affinity(L.tally[p.id] ?? ZERO, 3, 0.2, 2.5);
  const tags = tagsOf(p).filter((g) => LEARN_TAGS.includes(g));
  const byTag = tags.length
    ? Math.pow(tags.reduce((acc, g) => acc * affinity(tagTally[g] ?? ZERO, 6, 0.4, 2), 1), 1 / tags.length)
    : 1;
  return Math.min(3, Math.max(0.15, own * byTag));
}

/** 加了常做不完 → 多出 1 点的小事；几乎都做完 → 多出 2、3 点的 */
export function difficultyWeight(points: number, doneRate: number | null): number {
  if (doneRate === null) return 1;
  if (doneRate < 0.4) return points <= 1 ? 1.5 : points === 2 ? 0.85 : 0.5;
  if (doneRate > 0.75) return points <= 1 ? 0.8 : points === 2 ? 1.15 : 1.5;
  return 1;
}

// ── 出题 ─────────────────────────────────────────────────────────────────

export interface PickInput {
  dateKey: string;
  /** 用户 id（或名字）：不同人同一天拿到不同的三张 */
  seedKey: string;
  weakest: AttributeId | null;
  /** 不出的预设 id（换一批前那一批、清单里还挂着的） */
  excludeIds?: ReadonlySet<string>;
  /** 清单里已有的任务（规整后的标题） */
  existingTitles?: ReadonlySet<string>;
  /** 今天换过几批 */
  reroll?: number;
  /** 情境；不给 = 不按钟点 / 天气筛（周末照算，看的是日期） */
  ctx?: LifeContext;
  /** 取舍；不给 = 一视同仁、不冷却 */
  learning?: LifeLearning | null;
  /** 要几张（换一批时已加入的留着，只补空位）；默认三张 */
  count?: number;
  /** 这几维排到最后（已加入的卡占着的维度，补位时尽量不重） */
  avoidAttrs?: ReadonlySet<AttributeId>;
}

/**
 * 今天这批：最弱一维先占一张，其余几维按「常被选中」加权洗个顺序再挑；每一维在自己的题库里按
 * 情境 × 取舍 × 难度 的权重抽一张，最近 6 天出过的先躲开。同样的输入抽出同样的结果（按日期、用户、第几批做种）。
 */
export function pickLifeQuests(input: PickInput): LifeQuest[] {
  const dayIdx = dayIndexOf(input.dateKey);
  const reroll = input.reroll ?? 0;
  const count = input.count ?? LIFE_QUEST_COUNT;
  const ctx = input.ctx ?? {};
  const L = input.learning ?? EMPTY_LEARNING;
  const weekend = isWeekendKey(input.dateKey);
  const groups = groupTallies(L);
  const rnd = mulberry32(fnv1a(`life|${input.seedKey}|${input.dateKey}|${reroll}`));
  // 加权洗牌（Efraimidis–Spirakis）：权重大的更容易排前面，但不是每次都排前面
  const others = LIFE_QUEST_ATTRS.filter((k) => k !== input.weakest)
    .map((k) => ({ k, key: Math.pow(rnd(), 1 / affinity(groups.attr[k] ?? ZERO, 9, 0.6, 1.6)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.k);
  let order = input.weakest ? [input.weakest, ...others] : others;
  const avoid = input.avoidAttrs;
  if (avoid?.size) order = [...order.filter((a) => !avoid.has(a)), ...order.filter((a) => avoid.has(a))];

  const out: LifeQuest[] = [];
  const take = (attr: AttributeId, ignoreWeather: boolean): boolean => {
    const pool = poolOf(attr)
      .filter((p) => !input.excludeIds?.has(p.id) && !out.some((q) => q.presetId === p.id))
      .map((p) => ({ p, r: render(p, input.seedKey, dayIdx) }))
      .filter(({ r }) => !input.existingTitles?.has(normTitle(r.title)));
    const c = ignoreWeather ? { ...ctx, weather: null } : ctx;
    // 先躲开最近 6 天出过的；躲不开就只躲今天和昨天的；再不行谁都行
    for (const cooldown of [LIFE_QUEST_COOLDOWN_DAYS, 2, 0]) {
      const ws = pool.map(({ p }) => {
        const ago = L.recent[p.id];
        if (ago !== undefined && ago < cooldown) return 0;
        const cw = contextWeight(p, c, weekend);
        return cw > 0 ? cw * learnWeight(p, L, groups.tag) * difficultyWeight(p.points, L.doneRate) : 0;
      });
      const total = ws.reduce((a, b) => a + b, 0);
      if (total <= 0) continue;
      let x = rnd() * total;
      let idx = -1;
      for (let i = 0; i < ws.length; i++) {
        if (ws[i] <= 0) continue;
        idx = i;
        x -= ws[i];
        if (x < 0) break;
      }
      const { p, r } = pool[idx];
      out.push({ key: `${p.id}#${r.slot}`, presetId: p.id, title: r.title, attribute: p.attribute, points: p.points, hint: p.hint });
      return true;
    }
    return false;
  };
  for (const attr of order) {
    if (out.length >= count) break;
    take(attr, false);
  }
  // 极少数凑不满（深夜 + 恶劣天气 + 清单撞名）：还没出牌的维度放宽天气再挑；钟点不放宽（过了点的事今天做不成）
  for (const attr of order) {
    if (out.length >= count) break;
    if (out.some((q) => q.attribute === attr)) continue;
    take(attr, true);
  }
  return out;
}

/** 某天（第几批）的卡；清单里今天以前就有的同名任务 / 同一张卡不出 */
export function lifeQuestsFor(opts: {
  dateKey: string;
  seedKey: string;
  activities: Activity[];
  todos: Todo[];
  /** 完成记录（数「做完没有」用；单次待办做完会带 completedAt，这里兜计数类） */
  completions?: TodoCompletion[];
  reroll: number;
  /** 换一批时：刚才那批的预设 id */
  previousIds?: string[];
  ctx?: LifeContext;
  log?: LifeQuestLog | null;
  count?: number;
  avoidAttrs?: ReadonlySet<AttributeId>;
}): LifeQuest[] {
  const weakest = weakestAttribute(opts.activities, opts.dateKey, opts.seedKey);
  const before = opts.todos.filter((t) => t.isActive && !t.archivedAt && lifeDayKeyOf(t.createdAt) < opts.dateKey);
  const existingTitles = new Set(before.map((t) => normTitle(t.title)));
  const excludeIds = new Set([...(opts.previousIds ?? []), ...before.flatMap((t) => (t.lifeQuest ? [t.lifeQuest] : []))]);
  return pickLifeQuests({
    dateKey: opts.dateKey, seedKey: opts.seedKey, weakest, existingTitles, excludeIds, reroll: opts.reroll,
    ctx: opts.ctx, count: opts.count, avoidAttrs: opts.avoidAttrs,
    learning: learningOf({ dateKey: opts.dateKey, log: opts.log, todos: opts.todos, completions: opts.completions }),
  });
}

// ── 本机记一下今天这批（同一天卡片不变脸；换一批的次数）──
const STORE_KEY = 'velvet:lifeQuests.v1';
export interface LifeQuestDay {
  date: string;
  reroll: number;
  items: LifeQuest[];
  /** 哪个用户的（同一台设备换账号不串）；第 16 批前存的没有 */
  seed?: string;
}

export function readLifeQuestDay(): LifeQuestDay | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LifeQuestDay;
    return v && typeof v.date === 'string' && Array.isArray(v.items) ? v : null;
  } catch { return null; }
}
export function writeLifeQuestDay(v: LifeQuestDay): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* 存不了就每次现算（种子固定，结果一样） */ }
}

/** 两批是不是同一批（比内容，不比对象：每次从本机读出来都是新对象） */
export const lifeQuestDaySig = (d: LifeQuestDay | null | undefined): string =>
  d ? `${d.date}|${d.seed ?? ''}|${d.reroll}|${d.items.map((q) => q.key).join(',')}` : '';

/**
 * 今天这批：本机记过就用它；没记过就按此刻的情境和取舍算一批、记下来（第 17 批）。
 * 委托板和抽签共用：抽签先打开也替今天定好这一批，之后打开委托板看到的是同一批。
 */
export function ensureLifeQuestDay(opts: {
  todayKey: string;
  seedKey: string;
  activities: Activity[];
  todos: Todo[];
  completions?: TodoCompletion[];
  settings: Parameters<typeof weatherConfigOf>[0];
}): LifeQuestDay {
  const stored = readLifeQuestDay();
  if (stored && stored.date === opts.todayKey && (stored.seed ?? opts.seedKey) === opts.seedKey && stored.items.length) return stored;
  const day: LifeQuestDay = {
    date: opts.todayKey, seed: opts.seedKey, reroll: 0,
    items: lifeQuestsFor({
      dateKey: opts.todayKey, seedKey: opts.seedKey, activities: opts.activities, todos: opts.todos, completions: opts.completions,
      reroll: 0, ctx: lifeContextNow(opts.settings), log: readLifeQuestLog(opts.seedKey),
    }),
  };
  writeLifeQuestDay(day);
  recordLifeQuestEvent(opts.seedKey, opts.todayKey, 'shown', day.items.map((q) => q.presetId));
  return day;
}

// ── 本机记下的取舍（按用户分开；只留最近 60 天；不上云、不进备份）──
const LOG_KEY = 'velvet:lifeQuestLog.v1';
const readLogStore = (): Record<string, LifeQuestLog> => {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const v = raw ? JSON.parse(raw) as unknown : null;
    return v && typeof v === 'object' ? v as Record<string, LifeQuestLog> : {};
  } catch { return {}; }
};

export function readLifeQuestLog(seedKey: string): LifeQuestLog {
  const v = readLogStore()[seedKey];
  return v && typeof v === 'object' && v.days && typeof v.days === 'object' ? v : { days: {} };
}

/** 纯函数：在 log 上记一笔（同一天同一张只记一次），顺手丢掉 60 天以前的 */
export function withLifeQuestEvent(log: LifeQuestLog, dateKey: string, kind: LifeQuestEvent, ids: readonly string[]): LifeQuestLog {
  const today = dayIndexOf(dateKey);
  const days: LifeQuestLog['days'] = {};
  for (const [d, rec] of Object.entries(log.days ?? {})) {
    const ago = today - dayIndexOf(d);
    if (ago >= 0 && ago < LIFE_QUEST_LEARN_DAYS) days[d] = rec;
  }
  const rec = { ...(days[dateKey] ?? {}) };
  rec[kind] = [...new Set([...(rec[kind] ?? []), ...ids])];
  days[dateKey] = rec;
  return { days };
}

export function recordLifeQuestEvent(seedKey: string, dateKey: string, kind: LifeQuestEvent, ids: readonly string[]): LifeQuestLog {
  const next = withLifeQuestEvent(readLifeQuestLog(seedKey), dateKey, kind, ids);
  try {
    const all = readLogStore();
    all[seedKey] = next;
    localStorage.setItem(LOG_KEY, JSON.stringify(all));
  } catch { /* 存不了就这次不学 */ }
  return next;
}
