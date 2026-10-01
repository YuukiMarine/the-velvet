/**
 * 满月团战（组织 P2 · PRD §17）——纯计算：窗口、首领、血量、伤害、战况，以及经验 / 称号要用的统计。
 * 不碰网络 / store，无头脚本里可以直接验。
 *
 *   · 窗口：满月那天（组织时区）的前一晚、当晚、后一晚；每晚 18:00 到次日 07:00 能出手。
 *   · 首领：按组织 + 满月编号确定（名字池；弱点 = 开团时全队五维等级加起来最低的一维），开团时存进 org_raids.boss。
 *   · 血量：开团时按名册定 = Σ 每人 1.6 次满威力的出手 + 人数 × 2.5 × 平均等级，再乘据点等级（每级 +5%，Lv.6 ×1.25）；之后进来的人能出手，但不加血。
 *     （平衡模拟：每人每晚出手的概率 65% 时多数能赢，50% 时少数能赢，三成基本打不赢，见 tests-local/round10/r10-raid-sim.ts）
 *   · 出手：每人每晚一次，选一招：威力 + 同伴增伤，打弱点 ×1.5，满月当晚 ×1.2。
 *   · 总攻击：全队出手满 min(5, 2×人数) 次后解锁；出过手的人每次满月一次：平均等级 × 连携 ÷ 2（连携 = 已经出手的次数，最多 10）。
 *   · 只认「那一晚、在那一晚的时间里」打的出手（服务器 created 为准，留 10 分钟余量）：补打前一晚、窗口外写的都不算。
 *   · 击退：累计伤害到血量；出过手的人 +SP（开团时的据点等级：Lv.1 25，每级 +5）、岁时册一枚印记、据点每人 +3 经验；当周出过手的人拿「月下同行」。
 *   · 出手要花 SP：按那一招的 SP（面具技能的数值）；普攻不花。
 */
import { moonInstantOfSlot, moonPhaseSlot } from './moonPhase';
import { shiftDayKey, weekKeyOfDay, zonedDay, zonedInstant } from './orgTime';
import type { AttributeId, OrgMember, OrgMemberCard, OrgRaid, OrgRaidBoss, OrgRaidHit, OrgView } from '@/types';

export const RAID_ATTRS: readonly AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
/** 每晚能出手的时间：18:00 到次日 07:00（组织时区） */
export const RAID_NIGHT_START = 18;
export const RAID_NIGHT_END = 7;
/** 判断「是不是那一晚打的」时给服务器时间留的余量 */
export const RAID_GRACE_MS = 10 * 60_000;
/** 击退奖励：开团时据点 Lv.1 是 25 SP，每高一级 +5（Lv.6 50） */
export const RAID_SP_BASE = 25;
export const RAID_SP_PER_LEVEL = 5;
export const raidSpOf = (orgLevel: number): number => RAID_SP_BASE + RAID_SP_PER_LEVEL * (Math.max(1, Math.min(6, Math.round(orgLevel))) - 1);
/** 首领血量随据点等级：每级 +5%（Lv.6 ×1.25） */
export const RAID_HP_PER_LEVEL = 0.05;
export const RAID_XP_PER_HITTER = 3;
export const RAID_WEAK_MULT = 1.5;
export const RAID_FULL_MOON_MULT = 1.2;
export const RAID_COMBO_CAP = 10;
/** 一次出手 / 总攻击记下的伤害上限（防手改数据把血条一下打空） */
export const RAID_STRIKE_CAP = 999;
export const RAID_ALLOUT_CAP = 9999;
/** 窗口结束后，地图和公告板上还挂几天战报 */
export const RAID_RESULT_DAYS = 7;
/** 人格面具技能 1–5 级的威力（和生成面具时的规格一致）；没有面具时出手用普攻 8 */
export const RAID_SKILL_POWERS = [10, 15, 22, 30, 40] as const;
export const RAID_BASIC_POWER = 8;
export const RAID_HP_MIN = 60;
export const RAID_HP_MAX = 30000;

// ── 窗口 ─────────────────────────────────────────────────────────────────────

/** 这一刻属于哪一晚（组织时区的「晚上日期」）；白天（07–18 点）→ null */
export function nightKeyOf(at: Date, tz: string): string | null {
  const z = zonedDay(at, tz);
  if (z.hour >= RAID_NIGHT_START) return z.key;
  if (z.hour < RAID_NIGHT_END) return shiftDayKey(z.key, -1);
  return null;
}

/** 某次满月（编号）的满月日（组织时区） */
export const fullMoonDayOf = (slot: number, tz: string): string => zonedDay(new Date(moonInstantOfSlot(slot)), tz).key;

/** 三晚：前一晚、满月当晚、后一晚 */
export function raidNightsOf(slot: number, tz: string): [string, string, string] {
  const d = fullMoonDayOf(slot, tz);
  return [shiftDayKey(d, -1), d, shiftDayKey(d, 1)];
}

export interface RaidWindow {
  slot: number;
  nights: [string, string, string];
  /** 第一晚 18:00 */
  start: Date;
  /** 最后一晚的次日 07:00 */
  end: Date;
}

export function raidWindowOf(slot: number, tz: string): RaidWindow {
  const nights = raidNightsOf(slot, tz);
  return { slot, nights, start: zonedInstant(nights[0], RAID_NIGHT_START, tz), end: zonedInstant(shiftDayKey(nights[2], 1), RAID_NIGHT_END, tz) };
}

const isOdd = (n: number) => ((n % 2) + 2) % 2 === 1;

export interface RaidNow extends RaidWindow {
  /** before = 下一次还没开始；open = 三晚之内；after = 刚结束（RAID_RESULT_DAYS 天内） */
  phase: 'before' | 'open' | 'after';
  /** open 且正是晚上：这一晚的日期；白天 = null */
  night: string | null;
  /** 第几晚（0 / 1 / 2）；不在晚上 = -1 */
  nightIndex: number;
}

/** 现在该看哪一次满月：正在打的 > 刚结束的 > 下一次 */
export function raidNow(now: Date, tz: string): RaidNow {
  const near = moonPhaseSlot(now);
  const slots: number[] = [];
  for (let s = near - 3; s <= near + 3; s++) if (isOdd(s)) slots.push(s);
  const windows = slots.map(s => raidWindowOf(s, tz));
  const t = now.getTime();
  const open = windows.find(w => w.start.getTime() <= t && t < w.end.getTime());
  if (open) {
    const night = nightKeyOf(now, tz);
    const idx = night ? open.nights.indexOf(night) : -1;
    return { ...open, phase: 'open', night: idx >= 0 ? night : null, nightIndex: idx };
  }
  const recent = windows.filter(w => w.end.getTime() <= t && t - w.end.getTime() < RAID_RESULT_DAYS * 86400_000).pop();
  if (recent) return { ...recent, phase: 'after', night: null, nightIndex: -1 };
  const next = windows.find(w => w.start.getTime() > t) ?? raidWindowOf(slots[slots.length - 1] + 2, tz);
  return { ...next, phase: 'before', night: null, nightIndex: -1 };
}

// ── 首领与血量 ───────────────────────────────────────────────────────────────

/** 组织 + 满月编号 → 32 位种子（FNV-1a） */
export function raidSeed(orgId: string, slot: number): number {
  const src = `raid:${orgId}:${slot}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 团战的确定 id：15 位 [a-z0-9]（两个人同时开团只会留一条；写法同纪要 / 达成卡） */
export function raidId(orgId: string, slot: number): string {
  const src = `raid:${orgId}:${slot}`;
  let out = '';
  for (let seed = 0; out.length < 15; seed++) {
    let h = (0x811c9dc5 ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < src.length; i++) {
      h ^= src.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(36).padStart(7, '0');
  }
  return out.slice(0, 15);
}

export const RAID_BOSS_NAMES = ['月下百鬼', '千面之月', '银潮巨像', '无眠之城', '镜海之主', '长夜行列', '月影集会', '白夜巨兽', '月轮之冠', '群星之噬', '回廊之月', '潮汐王座'] as const;

/** 首领的台词（团战面板上按第几晚换一句；{weak} = 弱点那一维，用看的人自己的属性名） */
export const RAID_BOSS_LINES = [
  '一个人记下的夜晚很轻。你们的，加起来就重了。',
  '月亮把你们照在一起——那就一起来吧。今晚，{weak}是我的缺口。',
  '三个夜晚。月亮落下之前，看看你们能走多远。',
] as const;

/** 开团时的弱点：全队五维等级加起来最低的一维（成员牌上的 attrs；都没有就按种子挑） */
export function raidWeakOf(members: Pick<OrgMember, 'card'>[], seed: number): AttributeId {
  const sum = new Map<AttributeId, number>(RAID_ATTRS.map(a => [a, 0]));
  let any = false;
  for (const m of members) {
    for (const a of m.card.attrs ?? []) {
      if (!sum.has(a.id)) continue;
      any = true;
      sum.set(a.id, (sum.get(a.id) ?? 0) + (a.locked ? 0 : Math.max(0, a.level)));
    }
  }
  if (!any) return RAID_ATTRS[seed % RAID_ATTRS.length];
  const low = Math.min(...sum.values());
  const ties = RAID_ATTRS.filter(a => sum.get(a) === low);
  return ties[seed % ties.length];
}

/** 首领：名字、弱点，再记下开团时的据点等级（血量和击退奖励都按它算） */
export function buildRaidBoss(orgId: string, slot: number, members: Pick<OrgMember, 'card'>[], orgLevel = 1): OrgRaidBoss {
  const seed = raidSeed(orgId, slot);
  return { v: 1, name: RAID_BOSS_NAMES[seed % RAID_BOSS_NAMES.length], weak: raidWeakOf(members, seed >>> 3), lv: Math.max(1, Math.min(6, Math.round(orgLevel))) };
}

export const RAID_NAME_MAX = 8;
/** 服务器上读回来的首领：不认识的弱点换成知识，名字截到 8 个字 */
export function parseRaidBoss(v: unknown, fallbackSeed = 0): OrgRaidBoss {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const name = typeof o.name === 'string' && o.name.trim() ? [...o.name.trim()].slice(0, RAID_NAME_MAX).join('') : RAID_BOSS_NAMES[fallbackSeed % RAID_BOSS_NAMES.length];
  const weak = RAID_ATTRS.includes(o.weak as AttributeId) ? (o.weak as AttributeId) : 'knowledge';
  const lv = typeof o.lv === 'number' && Number.isFinite(o.lv) ? Math.max(1, Math.min(6, Math.round(o.lv))) : 1;
  return { v: 1, name, weak, lv };
}

/** 成员牌上的总等级（老版本没推就按 5 算——新账号五维各 1 级） */
export const lvOfCard = (card: Pick<OrgMemberCard, 'lv'>): number => (typeof card.lv === 'number' && card.lv > 0 ? card.lv : 5);

/** 估一个人一晚能打多少：五维里最高那一维的等级决定能用到几级技能 */
export function memberStrikePower(card: Pick<OrgMemberCard, 'lv' | 'attrs'>): number {
  const levels = (card.attrs ?? []).filter(a => !a.locked).map(a => a.level);
  const top = levels.length ? Math.max(...levels) : Math.max(1, Math.round(lvOfCard(card) / 5));
  return RAID_SKILL_POWERS[Math.max(1, Math.min(5, top)) - 1];
}

export const avgLvOf = (members: Pick<OrgMember, 'card'>[]): number =>
  members.length ? members.reduce((n, m) => n + lvOfCard(m.card), 0) / members.length : 5;

export const RAID_HP_STRIKES = 1.6;
export const RAID_HP_LV = 2.5;
/** 血量：Σ 每人 1.6 次满威力的出手 + 人数 × 2.5 × 平均等级（总攻击按平均等级打，所以血量里也按它算一份） */
export function raidHpOf(members: Pick<OrgMember, 'card'>[], orgLevel = 1): number {
  const n = Math.max(1, members.length);
  const strikes = members.reduce((s, m) => s + RAID_HP_STRIKES * memberStrikePower(m.card), 0);
  const lvMul = 1 + RAID_HP_PER_LEVEL * (Math.max(1, Math.min(6, Math.round(orgLevel))) - 1);
  const hp = Math.round((strikes + n * RAID_HP_LV * avgLvOf(members)) * lvMul);
  return Math.max(RAID_HP_MIN, Math.min(RAID_HP_MAX, hp));
}

// ── 出手与总攻击 ──────────────────────────────────────────────────────────────

/** 一次出手打多少：威力 + 同伴增伤；打弱点 ×1.5；满月当晚 ×1.2 */
export function strikeDamage(input: { power: number; plus?: number; attr: AttributeId | null; weak: AttributeId; night: string; nights: [string, string, string] }): { damage: number; isWeak: boolean; fullMoon: boolean } {
  const isWeak = !!input.attr && input.attr === input.weak;
  const fullMoon = input.night === input.nights[1];
  const base = Math.max(1, input.power + Math.max(0, input.plus ?? 0));
  const damage = Math.round(base * (isWeak ? RAID_WEAK_MULT : 1) * (fullMoon ? RAID_FULL_MOON_MULT : 1));
  return { damage: Math.max(1, Math.min(RAID_STRIKE_CAP, damage)), isWeak, fullMoon };
}

/** 全队出手满几次解锁总攻击：一个人 2 次、两个人 4 次、三个人以上 5 次 */
export const allOutThreshold = (memberCount: number): number => Math.max(2, Math.min(5, 2 * Math.max(1, memberCount)));

/** 总攻击打多少：平均等级 × 连携 ÷ 2（连携 = 已经出手的次数，最多 10） */
export const allOutDamage = (avgLv: number, combo: number): number =>
  Math.max(1, Math.min(RAID_ALLOUT_CAP, Math.round(avgLv * Math.min(RAID_COMBO_CAP, Math.max(0, combo)) / 2)));

// ── 战况 ─────────────────────────────────────────────────────────────────────

export interface RaidMemberStat {
  userId: string;
  /** 出过手的那几晚 */
  nights: string[];
  allout: boolean;
  damage: number;
  /** 第一次出手的时刻（名单按它排，不按伤害排） */
  first: number;
}

export interface RaidState {
  raid: OrgRaid;
  window: RaidWindow;
  /** 认下来的出手（按服务器时间排好） */
  valid: OrgRaidHit[];
  dealt: number;
  left: number;
  /** 打掉的比例 0–1 */
  pct: number;
  defeated: boolean;
  defeatedAt?: Date;
  /** 最后一击是谁 */
  finisher?: string;
  /** 认下来的普通出手次数（总攻击不算）= 连携 */
  strikes: number;
  stats: Map<string, RaidMemberStat>;
  /** 出过手的人（按第一次出手的时间） */
  hitters: string[];
}

/** 这条出手是不是「那一晚、在那一晚的时间里」打的 */
function strikeCounts(h: OrgRaidHit, w: RaidWindow, tz: string): boolean {
  if (h.kind !== 'strike' || !w.nights.includes(h.night)) return false;
  const t = h.createdAt.getTime();
  return nightKeyOf(h.createdAt, tz) === h.night || nightKeyOf(new Date(t - RAID_GRACE_MS), tz) === h.night;
}

export function raidStateOf(raid: OrgRaid, hits: OrgRaidHit[] | undefined, tz: string): RaidState {
  const w = raidWindowOf(raid.slot, tz);
  const mine = (hits ?? []).filter(h => h.raidId === raid.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1));
  const valid: OrgRaidHit[] = [];
  const seen = new Set<string>();
  const struck = new Set<string>();
  for (const h of mine) {
    const key = `${h.userId}|${h.night}`;
    if (seen.has(key)) continue;
    if (h.kind === 'strike') {
      if (!strikeCounts(h, w, tz)) continue;
      struck.add(h.userId);
    } else {
      // 总攻击：窗口时间里、自己出过手之后
      const t = h.createdAt.getTime();
      if (h.night !== 'allout' || t < w.start.getTime() - RAID_GRACE_MS || t > w.end.getTime() + RAID_GRACE_MS || !struck.has(h.userId)) continue;
    }
    seen.add(key);
    valid.push({ ...h, damage: Math.max(0, Math.min(h.kind === 'allout' ? RAID_ALLOUT_CAP : RAID_STRIKE_CAP, Math.round(h.damage) || 0)) });
  }
  const stats = new Map<string, RaidMemberStat>();
  let dealt = 0;
  let defeatedAt: Date | undefined;
  let finisher: string | undefined;
  let strikes = 0;
  for (const h of valid) {
    const st = stats.get(h.userId) ?? { userId: h.userId, nights: [], allout: false, damage: 0, first: h.createdAt.getTime() };
    if (h.kind === 'strike') { st.nights.push(h.night); strikes++; } else st.allout = true;
    st.damage += h.damage;
    stats.set(h.userId, st);
    if (!defeatedAt) {
      dealt += h.damage;
      if (dealt >= raid.hpMax) { defeatedAt = h.createdAt; finisher = h.userId; }
    }
  }
  dealt = Math.min(dealt, raid.hpMax);
  return {
    raid,
    window: w,
    valid,
    dealt,
    left: raid.hpMax - dealt,
    pct: raid.hpMax > 0 ? dealt / raid.hpMax : 0,
    defeated: !!defeatedAt,
    defeatedAt,
    finisher,
    strikes,
    stats,
    hitters: [...stats.values()].sort((a, b) => a.first - b.first).map(s => s.userId),
  };
}

/** 我这一晚还能不能出手 / 总攻击能不能打 */
export function myRaidOptions(state: RaidState, me: string, now: RaidNow, memberCount: number): {
  canStrike: boolean;
  struckTonight: boolean;
  canAllOut: boolean;
  allOutUsed: boolean;
  allOutNeed: number;
} {
  const st = state.stats.get(me);
  const open = now.phase === 'open' && now.slot === state.raid.slot && !state.defeated;
  const struckTonight = !!now.night && !!st?.nights.includes(now.night);
  const need = allOutThreshold(memberCount);
  const allOutUsed = !!st?.allout;
  return {
    canStrike: open && !!now.night && !struckTonight,
    struckTonight,
    canAllOut: open && !!st && st.nights.length > 0 && !allOutUsed && state.strikes >= need,
    allOutUsed,
    allOutNeed: Math.max(0, need - state.strikes),
  };
}

// ── 经验与称号要用的统计 ───────────────────────────────────────────────────────

/** 击退了的团战：每个出过手的人给据点 +3 经验 */
export function raidXpOf(view: Pick<OrgView, 'org' | 'raids' | 'raidHits'>): number {
  let xp = 0;
  for (const r of view.raids ?? []) {
    const s = raidStateOf(r, view.raidHits, view.org.tz);
    if (s.defeated) xp += RAID_XP_PER_HITTER * s.hitters.length;
  }
  return xp;
}

/** 某一周（周键）里每个人认下来的团战出手次数（按出手的那一晚算周） */
export function raidStrikesInWeek(view: Pick<OrgView, 'org' | 'raids' | 'raidHits'>, week: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of view.raids ?? []) {
    for (const h of raidStateOf(r, view.raidHits, view.org.tz).valid) {
      if (h.kind !== 'strike' || weekKeyOfDay(h.night) !== week) continue;
      out.set(h.userId, (out.get(h.userId) ?? 0) + 1);
    }
  }
  return out;
}

/** 红点：团战三晚里、正是晚上、这场还没击退、我今晚还没出手（团战没拉到 / 还没开团都不亮） */
export function raidStrikeAvailable(view: Pick<OrgView, 'org' | 'raids' | 'raidHits' | 'members' | 'me'>, now = new Date()): boolean {
  if (!view.raids) return false;
  const rn = raidNow(now, view.org.tz);
  if (rn.phase !== 'open' || !rn.night) return false;
  const raid = view.raids.find(r => r.slot === rn.slot);
  if (!raid) return false;
  return myRaidOptions(raidStateOf(raid, view.raidHits, view.org.tz), view.me.userId, rn, view.members.length).canStrike;
}
