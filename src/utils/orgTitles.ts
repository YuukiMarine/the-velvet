/**
 * 组织 P2（PRD §17）：据点等级的名字、称号（内置 + 队长自定义）、称号册。纯计算。
 *
 *   · 等级名字：六级各有默认名，队长可以改（orgs.custom.levelNames）。
 *   · 称号：每周一的纪要里发，只从数据来。内置九个（出勤王 / 全勤 / 周末不打烊 / 连续 7·14·30 天 / 言出必行 / 作战完成者 / 月下同行），
 *     队长可以改名；也可以像自定义成就一样加自己的称号：选一种条件、填一个数（最多 8 个）。
 *   · 同一「家族」一周只给最高的那一档（连续 7 → 14 → 30 是替换不是叠加；全勤 > 出勤王 > 周末不打烊；自定义的同一种条件算一家，门槛高的替换门槛低的）；
 *     每人每周最多 3 个：团战 → 作战 → 言出必行 → 连续 → 出勤 → 自定义（按队长排的顺序）。
 *   · 称号册：成员牌背面第三页，按家族归类：写拿到过的最高一档、拿过几周（老纪要没有 id，按名字认回内置称号）。
 *   名字都过屏蔽词：存的时候拦，读的时候不过的当没写（用默认）。
 */
import { auditText } from './textAudit';
import type { OrgCustom, OrgCustomTitle, OrgMinutesSnapshot, OrgTitleCondType, OrgTitleId } from '@/types';

// ── 等级名字 ─────────────────────────────────────────────────────────────────

export const ORG_LEVEL_NAMES = ['据点', '秘密基地', '特别活动部', '作战本部', '要塞', '不夜城'] as const;
export const ORG_LEVEL_NAME_MAX = 6;

export function orgLevelName(custom: OrgCustom | undefined, level: number): string {
  const i = Math.max(1, Math.min(ORG_LEVEL_NAMES.length, Math.round(level))) - 1;
  return custom?.levelNames?.[i] || ORG_LEVEL_NAMES[i];
}

// ── 内置称号 ─────────────────────────────────────────────────────────────────

export interface OrgTitleDef {
  id: OrgTitleId;
  name: string;
  /** 怎么拿（设置页和称号说明里写） */
  how: string;
}

export const ORG_BUILTIN_TITLES: readonly OrgTitleDef[] = [
  { id: 'attend', name: '本周出勤王', how: '这周记录的天数全队最多（至少 5 天，并列都给）' },
  { id: 'full', name: '全勤', how: '这周 7 天都有记录' },
  { id: 'weekend', name: '周末不打烊', how: '周六、周日都有记录（全勤、出勤王的不再给这个）' },
  { id: 'streak7', name: '连续 7 天', how: '连续记录 7 天以上（那周周末有记录才算数）' },
  { id: 'streak14', name: '连续 14 天', how: '连续记录 14 天以上（换掉 7 天那个，同上）' },
  { id: 'streak30', name: '连续 30 天', how: '连续记录 30 天以上（换掉 14 天那个，同上）' },
  { id: 'promise', name: '言出必行', how: '做到了会上写的目标；连续几周做到会写「· N 周」' },
  { id: 'ops', name: '作战完成者', how: '这周有目标或作战达成，而且你在名单里' },
  { id: 'moon', name: '月下同行', how: '这周的满月团战出过手' },
];
const BUILTIN_IDS = new Set<string>(ORG_BUILTIN_TITLES.map(t => t.id));
export const isBuiltinTitle = (id: string): id is OrgTitleId => BUILTIN_IDS.has(id);

export const ORG_TITLE_NAME_MAX = 6;
export const ORG_CUSTOM_TITLES_MAX = 8;
/** 一个人一周最多几个称号（名册小牌上排一行放得下；纪要也小） */
export const ORG_TITLES_PER_MEMBER = 3;

// ── 家族：同一家族一周只给最高一档；称号册按家族归类 ─────────────────────────────────

/** 内置称号属于哪一家、在家里排第几（高的替换低的） */
const BUILTIN_FAMILY: Record<OrgTitleId, { family: string; rank: number }> = {
  weekend: { family: 'attendance', rank: 1 },
  attend: { family: 'attendance', rank: 2 },
  full: { family: 'attendance', rank: 3 },
  streak7: { family: 'streak', rank: 7 },
  streak14: { family: 'streak', rank: 14 },
  streak30: { family: 'streak', rank: 30 },
  promise: { family: 'promise', rank: 1 },
  ops: { family: 'ops', rank: 1 },
  moon: { family: 'moon', rank: 1 },
};
/** 三个名额先给谁：团战 → 作战 → 言出必行 → 连续 → 出勤，最后是自定义（按队长排的顺序） */
const FAMILY_ORDER = ['moon', 'ops', 'promise', 'streak', 'attendance'];

/** 称号 id → 家族（自定义的按条件分家；队长删掉了的自定义称号没有家族，自己单独算） */
export function titleFamilyOf(tid: string, custom: OrgCustom | undefined): { family: string; rank: number } | null {
  if (isBuiltinTitle(tid)) return BUILTIN_FAMILY[tid];
  const c = custom?.titles?.find(t => t.id === tid);
  return c ? { family: `c:${c.cond.type}`, rank: c.cond.value } : null;
}

export function titleNameOf(custom: OrgCustom | undefined, id: OrgTitleId): string {
  return custom?.titleNames?.[id] || ORG_BUILTIN_TITLES.find(t => t.id === id)!.name;
}

// ── 自定义称号的条件 ──────────────────────────────────────────────────────────

export interface OrgTitleCondDef {
  type: OrgTitleCondType;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** 新建时的默认值 */
  def: number;
  /** weekend 不用填数 */
  noValue?: boolean;
}

export const ORG_TITLE_CONDS: readonly OrgTitleCondDef[] = [
  { type: 'week_days', label: '这周记录天数', unit: '天', min: 1, max: 7, def: 5 },
  { type: 'weekend', label: '周六周日都记', unit: '', min: 0, max: 0, def: 0, noValue: true },
  { type: 'streak', label: '连续记录天数', unit: '天', min: 2, max: 365, def: 21 },
  { type: 'goal_weeks', label: '连续做到会上的目标', unit: '周', min: 1, max: 52, def: 3 },
  { type: 'ops', label: '这周完成的作战', unit: '场', min: 1, max: 9, def: 2 },
  { type: 'raid', label: '这周团战出手', unit: '次', min: 1, max: 3, def: 3 },
  { type: 'lv', label: '总等级', unit: '级', min: 2, max: 999, def: 20 },
];
export const condDefOf = (type: OrgTitleCondType): OrgTitleCondDef => ORG_TITLE_CONDS.find(c => c.type === type) ?? ORG_TITLE_CONDS[0];

/** 「这周记录天数 ≥ 6 天」这样的一句 */
export function condText(cond: OrgCustomTitle['cond']): string {
  const d = condDefOf(cond.type);
  return d.noValue ? d.label : `${d.label} ≥ ${cond.value} ${d.unit}`;
}

// ── 读 / 存 ──────────────────────────────────────────────────────────────────

const clipName = (v: unknown, max: number): string => {
  if (typeof v !== 'string') return '';
  const s = [...v.replace(/\s+/g, ' ').trim()].slice(0, max).join('');
  return s && auditText(s).ok ? s : '';
};
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(min, Math.min(max, n));
};

/** 服务器上读回来的 / 要存的 custom：名字截长度、过屏蔽词（不过当没写）；条件夹到范围；空了就是 undefined */
export function parseOrgCustom(v: unknown): OrgCustom | undefined {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : null) as Record<string, unknown> | null;
  if (!o) return undefined;
  const out: OrgCustom = {};
  if (Array.isArray(o.levelNames)) {
    const names = ORG_LEVEL_NAMES.map((_, i) => clipName((o.levelNames as unknown[])[i], ORG_LEVEL_NAME_MAX));
    if (names.some(Boolean)) out.levelNames = names;
  }
  if (o.titleNames && typeof o.titleNames === 'object') {
    const src = o.titleNames as Record<string, unknown>;
    const names: Partial<Record<OrgTitleId, string>> = {};
    for (const t of ORG_BUILTIN_TITLES) {
      const n = clipName(src[t.id], ORG_TITLE_NAME_MAX);
      if (n && n !== t.name) names[t.id] = n;
    }
    if (Object.keys(names).length) out.titleNames = names;
  }
  if (Array.isArray(o.titles)) {
    const seen = new Set<string>();
    const titles: OrgCustomTitle[] = [];
    for (const x of o.titles as unknown[]) {
      const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      const id = typeof r.id === 'string' && /^c[a-z0-9]{2,12}$/.test(r.id) ? r.id : '';
      const name = clipName(r.name, ORG_TITLE_NAME_MAX);
      const c = (r.cond && typeof r.cond === 'object' ? r.cond : {}) as Record<string, unknown>;
      const def = ORG_TITLE_CONDS.find(d => d.type === c.type);
      if (!id || !name || !def || seen.has(id)) continue;
      seen.add(id);
      titles.push({ id, name, cond: { type: def.type, value: def.noValue ? 0 : clampInt(c.value, def.min, def.max, def.def) } });
      if (titles.length >= ORG_CUSTOM_TITLES_MAX) break;
    }
    if (titles.length) out.titles = titles;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 新自定义称号的 id */
export const newCustomTitleId = (rand: () => number = Math.random): string => `c${Math.floor(rand() * 36 ** 8).toString(36).padStart(8, '0')}`;

// ── 一周的称号 ───────────────────────────────────────────────────────────────

/** 发纪要时每个人这周的数据（computeMinutes 算好传进来） */
export interface OrgWeekFacts {
  userId: string;
  codename: string;
  /** 这周出勤位图（bit0 = 周一） */
  days: number;
  /** 本人推上来的连续天数 */
  streak: number;
  /** 连续做到会上目标的周数（含这周；这周没做到 = 0） */
  goalWeeks: number;
  /** 这周达成、名单里有他的目标 / 作战场数 */
  ops: number;
  /** 这周认下来的团战出手次数 */
  raid: number;
  lv: number;
}

const WEEKEND = (1 << 5) | (1 << 6);
const count = (n: number): number => { let c = 0; for (let v = n; v; v &= v - 1) c++; return c; };

function customHit(f: OrgWeekFacts, cond: OrgCustomTitle['cond']): boolean {
  switch (cond.type) {
    case 'week_days': return count(f.days) >= cond.value;
    case 'weekend': return (f.days & WEEKEND) === WEEKEND;
    // 连续天数是本人客户端推上来的，人不打开 App 就停在旧值：那周周末有记录才算数（和内置的一样）
    case 'streak': return !!(f.days & WEEKEND) && f.streak >= cond.value;
    case 'goal_weeks': return f.goalWeeks >= cond.value;
    case 'ops': return f.ops >= cond.value;
    case 'raid': return f.raid >= cond.value;
    case 'lv': return f.lv >= cond.value;
    default: return false;
  }
}

/**
 * 这周的称号：每个家族先挑出这个人够得上的最高一档，再按「团战 → 作战 → 言出必行 → 连续 → 出勤 → 自定义」给前三个。
 * 名字用发纪要这一刻的（之后改名不影响旧纪要）；输出按家族排（纪要卡上同一种称号挨在一起）。
 */
export function resolveWeekTitles(facts: OrgWeekFacts[], custom: OrgCustom | undefined): OrgMinutesSnapshot['titles'] {
  const best = Math.max(0, ...facts.map(f => count(f.days)));
  // 每个人：家族 → 这一档（tid + 名字）
  const picks = new Map<string, Map<string, { tid: string; title: string }>>();
  const put = (f: OrgWeekFacts, family: string, tid: string, title: string) => {
    const m = picks.get(f.userId) ?? new Map<string, { tid: string; title: string }>();
    m.set(family, { tid, title });
    picks.set(f.userId, m);
  };
  for (const f of facts) {
    const n = count(f.days);
    if (n === 7) put(f, 'attendance', 'full', titleNameOf(custom, 'full'));
    else if (best >= 5 && n === best) put(f, 'attendance', 'attend', titleNameOf(custom, 'attend'));
    else if ((f.days & WEEKEND) === WEEKEND) put(f, 'attendance', 'weekend', titleNameOf(custom, 'weekend'));
    if (f.days & WEEKEND) {
      const tier = f.streak >= 30 ? 30 : f.streak >= 14 ? 14 : f.streak >= 7 ? 7 : 0;
      if (tier) put(f, 'streak', `streak${tier}`, titleNameOf(custom, `streak${tier}` as OrgTitleId));
    }
    if (f.goalWeeks >= 1) {
      const base = titleNameOf(custom, 'promise');
      put(f, 'promise', 'promise', f.goalWeeks >= 2 ? `${base} · ${f.goalWeeks} 周` : base);
    }
    if (f.ops > 0) put(f, 'ops', 'ops', titleNameOf(custom, 'ops'));
    if (f.raid > 0) put(f, 'moon', 'moon', titleNameOf(custom, 'moon'));
    // 自定义：同一种条件里，够得上的门槛最高的那个（一样高取队长排在前面的）
    const byType = new Map<string, OrgCustomTitle>();
    for (const t of custom?.titles ?? []) {
      if (!customHit(f, t.cond)) continue;
      const cur = byType.get(t.cond.type);
      if (!cur || t.cond.value > cur.cond.value) byType.set(t.cond.type, t);
    }
    for (const [type, t] of byType) put(f, `c:${type}`, t.id, t.name);
  }
  // 家族的先后：内置五家，再按队长的自定义顺序
  const order = [...FAMILY_ORDER];
  for (const t of custom?.titles ?? []) if (!order.includes(`c:${t.cond.type}`)) order.push(`c:${t.cond.type}`);
  // 每人取前三个家族
  const keep = new Map<string, Set<string>>();
  for (const f of facts) {
    const m = picks.get(f.userId);
    if (!m) continue;
    keep.set(f.userId, new Set(order.filter(fam => m.has(fam)).slice(0, ORG_TITLES_PER_MEMBER)));
  }
  const out: OrgMinutesSnapshot['titles'] = [];
  for (const fam of order) {
    for (const f of facts) {
      const hit = picks.get(f.userId)?.get(fam);
      if (hit && keep.get(f.userId)?.has(fam)) out.push({ userId: f.userId, codename: f.codename, title: hit.title, tid: hit.tid });
    }
  }
  return out;
}

// ── 称号册 ──────────────────────────────────────────────────────────────────

/** 老纪要（没有 tid）按名字认回内置称号 */
export function legacyTitleId(title: string): OrgTitleId | null {
  if (title === '本周出勤王') return 'attend';
  const m = /^连续 (7|14|30) 天$/.exec(title);
  if (m) return `streak${m[1]}` as OrgTitleId;
  if (title === '言出必行' || title.startsWith('言出必行 · ')) return 'promise';
  if (title === '作战完成者') return 'ops';
  return null;
}

export interface TitleBookEntry {
  key: string;
  /** 这一家拿到过的最高一档的名字（内置 / 还在的自定义称号用现在的名字；删掉了的用当时的名字） */
  name: string;
  /** 拿过几周（同一家族一周算一次） */
  count: number;
  /** 最近一次是哪一周 */
  last: string;
  /** 言出必行：最长连续了几周 */
  bestWeeks?: number;
  /** 自定义称号已经被队长删掉了 */
  retired?: boolean;
}

/** 这个人在这个组织拿过的称号（全部纪要；同一周只认一份纪要）：按家族归在一起，写最高一档；次数多的在前 */
export function titleBook(minutes: OrgMinutesSnapshot[], userId: string, custom: OrgCustom | undefined): TitleBookEntry[] {
  const weeks = new Set<string>();
  const map = new Map<string, TitleBookEntry & { rank: number; weeksSeen: Set<string> }>();
  for (const m of [...minutes].sort((a, b) => (a.week < b.week ? -1 : 1))) {
    if (weeks.has(m.week)) continue;
    weeks.add(m.week);
    for (const t of m.titles) {
      if (t.userId !== userId) continue;
      const tid = t.tid || legacyTitleId(t.title) || '';
      const fam = tid ? titleFamilyOf(tid, custom) : null;
      const key = fam ? fam.family : tid ? `id:${tid}` : `t:${t.title}`;
      const rank = fam?.rank ?? 0;
      const name = tid && isBuiltinTitle(tid) ? titleNameOf(custom, tid) : tid ? (custom?.titles?.find(x => x.id === tid)?.name ?? t.title) : t.title;
      const cur = map.get(key) ?? { key, name, count: 0, last: m.week, rank: -1, weeksSeen: new Set<string>() };
      if (!cur.weeksSeen.has(m.week)) { cur.weeksSeen.add(m.week); cur.count++; }
      cur.last = m.week;
      // 高一档替换低一档（一样高的保留先拿到的那个名字）
      if (rank > cur.rank) { cur.rank = rank; cur.name = name; }
      if (tid === 'promise') {
        const n = Number(/· (\d+) 周$/.exec(t.title)?.[1] ?? 1);
        cur.bestWeeks = Math.max(cur.bestWeeks ?? 1, n);
      }
      if (tid && !isBuiltinTitle(tid) && !fam) cur.retired = true;
      map.set(key, cur);
    }
  }
  return [...map.values()]
    .map(({ rank: _r, weeksSeen: _w, ...e }) => e)
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}
