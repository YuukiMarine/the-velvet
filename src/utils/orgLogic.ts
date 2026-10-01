/**
 * 组织（v2.7.0.6 第 7 轮 · PRD §12）的纯计算：邀请码、组织时区的日与周、出勤七格、
 * 成员牌快照与指纹、代号、代表牌撞车、座位。不碰 store / PB，无头脚本里可以直接验。
 */
import { MAJOR_ARCANA } from '@/constants/tarot';
import { DEFAULT_ATTRIBUTE_NAMES } from '@/constants/index';
import { auditText } from '@/utils/textAudit';
import { liveStatus } from '@/constants/profileStatus';
import { calcCurrentStreak, streakDates } from '@/utils/streak';
import type {
  Activity, Attribute, AttributeId, AttributeNames, OrgMember, OrgMemberAttr, OrgMemberCard, OrgMinutesSnapshot, OrgPersonaSnapshot,
  OrgPost, OrgPostSnapshot, OrgReaction, OrgReactionTag, OrgView, Persona, ProfileStatus,
} from '@/types';

export const ORG_MAX_SEATS = 7;
export const ORG_NAME_MAX = 12;
export const ORG_MOTTO_MAX = 30;
export const ORG_CODENAME_MAX = 8;

// ── 邀请码 ───────────────────────────────────────────────────────────────────

/** 8 位，字符表去掉 0 / O / 1 / I（32 个），念出来、抄下来都不容易错 */
export const INVITE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const INVITE_LEN = 8;
export const INVITE_RE = /^[2-9A-HJ-NP-Z]{8}$/;

const secureRandom = (): number => {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  } catch {
    return Math.random();
  }
};

export function genInviteCode(rand: () => number = secureRandom): string {
  let out = '';
  for (let i = 0; i < INVITE_LEN; i++) out += INVITE_ALPHABET[Math.floor(rand() * INVITE_ALPHABET.length) % INVITE_ALPHABET.length];
  return out;
}

/** 输入框里的码 → 规范形：全角转半角、大写、去掉空白 / 横线 / 间隔号 */
export const normalizeInviteInput = (s: string): string =>
  s.normalize('NFKC').toUpperCase().replace(/[\s\-_·.]/g, '');

export const isInviteCode = (s: string): boolean => INVITE_RE.test(s);

/** 显示用：四个一组 */
export const formatInviteCode = (c: string): string => (c.length === INVITE_LEN ? `${c.slice(0, 4)} ${c.slice(4)}` : c);

// ── 组织时区的日与周 ──────────────────────────────────────────────────────────

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string): Intl.DateTimeFormat {
  const hit = fmtCache.get(tz);
  if (hit) return hit;
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  } catch {
    // 时区名不认识（老设备 / 手改数据）：退回 UTC，不让整页崩
    f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
  }
  fmtCache.set(tz, f);
  return f;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** 某一刻在组织时区里是哪一天、周几（周一 = 1 … 周日 = 7）、几点（0–23） */
export function zonedDay(date: Date, tz: string): { key: string; weekday: number; hour: number } {
  const parts = fmtFor(tz).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const hour = Number(get('hour'));
  return { key: `${get('year')}-${get('month')}-${get('day')}`, weekday: WEEKDAY[get('weekday')] ?? 1, hour: Number.isFinite(hour) ? hour % 24 : 0 };
}

/** 日键平移 n 天（按日历算，与时区、夏令时无关） */
export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 组织时区里「这一周」的周键 = 那周周一的日键 */
export function orgWeekKey(date: Date, tz: string): string {
  const { key, weekday } = zonedDay(date, tz);
  return shiftDayKey(key, 1 - weekday);
}

/** 一周七天的日键（周一起） */
export const weekDayKeys = (weekKey: string): string[] => Array.from({ length: 7 }, (_, i) => shiftDayKey(weekKey, i));

/** 组织时区里今天是不是周日 */
export const isMeetingDay = (date: Date, tz: string): boolean => zonedDay(date, tz).weekday === 7;

/** 会议开到周一凌晨几点（和 App 其它地方的 4 点日界一致，给熬夜的人留一点时间） */
export const MEETING_GRACE_HOUR = 4;

/**
 * 组织时区里此刻的会议状态（7b）：
 *   · open：周日全天，以及周一 0–4 点；week = 这场会议所属的那周（周一的日键）；
 *   · 不在会议时间：week = 本周（下一场会在本周日）；
 *   · lastClosed = 最近一场已经结束的会议属于哪周——纪要就补这一周。
 */
export function meetingState(now: Date, tz: string): { open: boolean; week: string; lastClosed: string } {
  const { key, weekday, hour } = zonedDay(now, tz);
  const cur = shiftDayKey(key, 1 - weekday);
  if (weekday === 7) return { open: true, week: cur, lastClosed: shiftDayKey(cur, -7) };
  if (weekday === 1 && hour < MEETING_GRACE_HOUR) return { open: true, week: shiftDayKey(cur, -7), lastClosed: shiftDayKey(cur, -14) };
  return { open: false, week: cur, lastClosed: shiftDayKey(cur, -7) };
}

/** 下周的周键 */
export const nextWeekKey = (weekKey: string): string => shiftDayKey(weekKey, 7);

// ── 出勤与成员牌 ──────────────────────────────────────────────────────────────

/** 算出勤的记录：自己记的（不含系统类目），不含补记——和委托板、连续天数同一个口径 */
const isOwnRecord = (a: Pick<Activity, 'category' | 'backfilled'>): boolean => !a.category && !a.backfilled;

const localKey = (d: Date | string): string => {
  const t = typeof d === 'string' ? new Date(d) : d;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/** 七个格子的位图：bit0 = 周一。记录按本人本地日期算（和组织时区差几个小时时，最多错开半天） */
export function attendanceBits(activities: Array<Pick<Activity, 'date' | 'category' | 'backfilled'>>, weekKey: string): number {
  const days = new Set(activities.filter(isOwnRecord).map(a => localKey(a.date)));
  return weekDayKeys(weekKey).reduce((bits, k, i) => (days.has(k) ? bits | (1 << i) : bits), 0);
}

export const bitCount = (n: number): number => {
  let c = 0;
  for (let v = n; v; v &= v - 1) c++;
  return c;
};

/** 成员牌上最多展示几张面具（第 8 轮：从 1 张改成 3 张） */
export const ORG_MAX_SHOWN_MASKS = 3;

/**
 * 名册背面的面具快照：某个属性的那张（不指定就是装备中的那张，没装备取第一张），技能取已解锁里等级最高的三个。
 * 第 8 轮起可以展示最多 3 张，每张各算一份。
 */
export function personaSnapshot(persona: Persona | null | undefined, attributes: Pick<Attribute, 'id' | 'level' | 'unlocked'>[], which?: AttributeId): OrgPersonaSnapshot | null {
  if (!persona) return null;
  const masks = Object.keys(persona.attributePersonas ?? {}) as AttributeId[];
  const attr: AttributeId = which ?? persona.equippedMaskAttribute ?? masks[0] ?? 'knowledge';
  const a = attributes.find(x => x.id === attr);
  const level = a && a.unlocked !== false ? (a.level ?? 1) : 1;
  const skills = (persona.skills?.[attr] ?? [])
    .filter(s => s.unlocked ?? s.level <= level)
    .sort((x, y) => y.level - x.level || y.power - x.power)
    .slice(0, 3)
    .map(s => ({ name: s.name, type: s.type, power: s.power, level: s.level }));
  return { name: persona.attributePersonas?.[attr]?.name || persona.name, attribute: attr, level, skills };
}

/** 这张牌上展示的面具（第 8 轮的 personas；老牌子只有 persona 一张） */
export const shownPersonas = (card: Pick<OrgMemberCard, 'persona' | 'personas'> | undefined | null): OrgPersonaSnapshot[] =>
  (card?.personas?.length ? card.personas : card?.persona ? [card.persona] : []).slice(0, ORG_MAX_SHOWN_MASKS);

/** 本人这一刻该推上去的成员牌（没有记录内容，只有数字） */
export function buildMemberCard(input: {
  activities: Array<Pick<Activity, 'date' | 'category' | 'backfilled'>>;
  tz: string;
  now: Date;
  status?: ProfileStatus | null;
  /** 展示的面具（按选的顺序，最多 3 张；空 = 不展示） */
  personas: OrgPersonaSnapshot[];
  tarotAt?: string;
  /** 服务器上现在那张牌：跨周时把它的 week 挪成 prev（7b，纪要要读上周出勤） */
  prevCard?: OrgMemberCard | null;
  /** 总等级（五维之和） */
  lv?: number;
  /** 五维（本人的属性名 + 等级），推之前名字过一道屏蔽词 */
  attrs?: OrgMemberAttr[];
}): OrgMemberCard {
  const weekKey = orgWeekKey(input.now, input.tz);
  const status = liveStatus(input.status, input.now.getTime()) ? input.status ?? undefined : undefined;
  // 上一周：按记录现算（本机记录是全的，比服务器上那张可能停在周中的牌更准）；
  // 算出来是 0 而旧牌上有，就沿用旧牌（换了设备、本机记录还没同步完的情况）
  const lastWeek = shiftDayKey(weekKey, -7);
  const lastBits = attendanceBits(input.activities, lastWeek);
  const old = input.prevCard;
  const oldLast = old?.week?.key === lastWeek ? old.week.days : old?.prev?.key === lastWeek ? old.prev.days : 0;
  const prevDays = lastBits || oldLast;
  return {
    streak: calcCurrentStreak(streakDates(input.activities), input.now),
    week: { key: weekKey, days: attendanceBits(input.activities, weekKey) },
    ...(prevDays ? { prev: { key: lastWeek, days: prevDays } } : {}),
    ...(status ? { status: { id: status.id, at: status.at } } : {}),
    // persona 留给只认一张的老版本（= 第一张）；personas 是完整的
    persona: input.personas[0] ?? null,
    ...(input.personas.length ? { personas: input.personas.slice(0, ORG_MAX_SHOWN_MASKS) } : {}),
    ...(input.tarotAt ? { tarotAt: input.tarotAt } : {}),
    ...(input.lv && input.lv > 0 ? { lv: Math.floor(input.lv) } : {}),
    ...(input.attrs && input.attrs.length ? { attrs: cleanMemberAttrs(input.attrs) } : {}),
    at: input.now.toISOString(),
  };
}

/** 键按字母排好的深拷贝（指纹用：同样的内容不管键的先后都得到同一个串） */
const sortedDeep = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortedDeep);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map(k => [k, sortedDeep(o[k])]));
  }
  return v;
};

/**
 * 比对用的指纹：去掉推送时刻，其余一样就不必再推。
 * 注意不能用 JSON.stringify 的「键名数组」参数来排序——那个数组同时是白名单、对每一层都生效，
 * 嵌套的 status / week / persona 会被序列化成 {}，改了状态、多出勤一天都推不上去（第 7 轮测试抓到的）。
 */
export function cardFingerprint(c: OrgMemberCard | undefined | null): string {
  if (!c) return '';
  const { at: _at, ...rest } = c;
  return JSON.stringify(sortedDeep(rest));
}

/** 服务器上的 card json → 结构化（字段缺了 / 类型不对都按空处理，别让一张坏牌拖垮整页） */
export function parseMemberCard(v: unknown): OrgMemberCard {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const card: OrgMemberCard = { streak: typeof o.streak === 'number' && o.streak >= 0 ? Math.floor(o.streak) : 0 };
  const w = o.week as Record<string, unknown> | undefined;
  if (w && typeof w.key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.key) && typeof w.days === 'number') {
    card.week = { key: w.key, days: w.days & 0x7f };
  }
  const pw = o.prev as Record<string, unknown> | undefined;
  if (pw && typeof pw.key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pw.key) && typeof pw.days === 'number') {
    card.prev = { key: pw.key, days: pw.days & 0x7f };
  }
  const s = o.status as Record<string, unknown> | undefined;
  if (s && typeof s.id === 'string' && typeof s.at === 'string') card.status = { id: s.id, at: s.at };
  const p = o.persona as Record<string, unknown> | null | undefined;
  const one = parsePersona(p);
  if (one) card.persona = one;
  else if (p === null) card.persona = null;
  if (Array.isArray(o.personas)) {
    const list = (o.personas as unknown[]).map(parsePersona).filter((x): x is OrgPersonaSnapshot => !!x).slice(0, ORG_MAX_SHOWN_MASKS);
    if (list.length) card.personas = list;
  }
  if (typeof o.tarotAt === 'string') card.tarotAt = o.tarotAt;
  // 总等级：五维之和，正常不会过百；夹一下，别让手改的数字把小签撑破
  if (typeof o.lv === 'number' && Number.isFinite(o.lv) && o.lv >= 1) card.lv = Math.min(999, Math.floor(o.lv));
  if (Array.isArray(o.attrs)) {
    const list = parseMemberAttrs(o.attrs);
    if (list.length) card.attrs = list;
  }
  if (typeof o.at === 'string') card.at = o.at;
  return card;
}

/** 一张面具快照：属性 / 技能类型在白名单里，数字夹一夹（别人推上来的东西，别让一张坏牌拖垮整页） */
const PERSONA_ATTRS: readonly AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const SKILL_TYPES = ['damage', 'buff', 'debuff', 'crit', 'charge', 'heal', 'attack_boost'] as const;
function parsePersona(v: unknown): OrgPersonaSnapshot | null {
  const p = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!p || typeof p.name !== 'string' || !PERSONA_ATTRS.includes(p.attribute as AttributeId)) return null;
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d);
  return {
    name: p.name.slice(0, 24),
    attribute: p.attribute as AttributeId,
    level: num(p.level, 1, 99, 1),
    skills: Array.isArray(p.skills)
      ? (p.skills as Array<Record<string, unknown>>).filter(x => x && typeof x.name === 'string' && (SKILL_TYPES as readonly string[]).includes(String(x.type))).slice(0, 3).map(x => ({
        name: String(x.name).slice(0, 24),
        type: x.type as OrgPersonaSnapshot['skills'][number]['type'],
        power: num(x.power, 0, 60, 0),
        level: num(x.level, 1, 5, 1),
      }))
      : [],
  };
}

/** 这张牌上某一周的出勤：周键对得上才算数（别人一周没打开 App，格子停在上周）；上一周也认 prev */
export const weekDaysOf = (card: OrgMemberCard, weekKey: string): number =>
  (card.week?.key === weekKey ? card.week.days : card.prev?.key === weekKey ? card.prev.days : 0);

// ── 代号与代表牌 ──────────────────────────────────────────────────────────────

export const tarotCardOf = (id: string | undefined) => (id ? MAJOR_ARCANA.find(c => c.id === id) : undefined);

/** 名册上显示的代号：牌名型跟着代表牌走；其余用存下的字，空的给个占位 */
export function displayCodename(m: Pick<OrgMember, 'codename' | 'codenameKind' | 'tarotId'>): string {
  if (m.codenameKind === 'tarot') {
    const c = tarotCardOf(m.tarotId);
    if (c) return c.name;
  }
  return m.codename.trim() || '无名';
}

/**
 * 同一组织里撞了代表牌的人：先选的（tarotAt 早）留下，其余返回，要重选。
 * 服务器不设这条唯一索引（空值会互相撞），靠客户端先拦、撞了再让后来的人换。
 */
export function tarotConflictLosers(members: OrgMember[]): Set<string> {
  const byCard = new Map<string, OrgMember[]>();
  for (const m of members) {
    if (!m.tarotId) continue;
    const list = byCard.get(m.tarotId) ?? [];
    list.push(m);
    byCard.set(m.tarotId, list);
  }
  const losers = new Set<string>();
  for (const list of byCard.values()) {
    if (list.length < 2) continue;
    const at = (m: OrgMember) => Date.parse(m.card.tarotAt ?? '') || m.createdAt.getTime();
    const sorted = [...list].sort((a, b) => at(a) - at(b) || (a.id < b.id ? -1 : 1));
    for (const m of sorted.slice(1)) losers.add(m.id);
  }
  return losers;
}

/** 别人已经占了的代表牌 */
export const takenTarots = (members: OrgMember[], exceptUserId?: string): Set<string> =>
  new Set(members.filter(m => m.userId !== exceptUserId && m.tarotId).map(m => m.tarotId!));

// ── 杂项 ─────────────────────────────────────────────────────────────────────

/** 按座位排（队长 1 号在前） */
export const bySeat = (a: OrgMember, b: OrgMember): number => a.seat - b.seat;

/** 徽记（components/org/OrgEmblem 按 id 画） */
export const ORG_EMBLEMS = [
  { id: 'star', label: '星' },
  { id: 'moon', label: '月' },
  { id: 'sun', label: '日' },
  { id: 'key', label: '钥匙' },
  { id: 'mask', label: '面具' },
  { id: 'crow', label: '鸦' },
  { id: 'butterfly', label: '蝶' },
  { id: 'fox', label: '狐' },
  { id: 'cat', label: '猫' },
  { id: 'flame', label: '火' },
  { id: 'wave', label: '浪' },
  { id: 'crown', label: '冠' },
] as const;
export type OrgEmblemId = typeof ORG_EMBLEMS[number]['id'];
export const isEmblemId = (s: string): s is OrgEmblemId => ORG_EMBLEMS.some(e => e.id === s);

/** 别人能看到什么（加入前的预览、建立时的说明、据点设置里都放这一段） */
export const ORG_PRIVACY_NOTE = '组织里的其他成员能看到：你的代号、头像、代表牌、名片状态、连续天数、本周哪几天有记录、你写的目标、你选择展示的面具，以及你主动分享的动态。看不到你的属性数值、记录原文和记录列表。';

// ── 公告板（7b · PRD §12.16）─────────────────────────────────────────────────

export const ORG_POST_TEXT_MAX = 20;
/** 同一个组织每人每天最多分享几条（客户端拦；小而安静） */
export const ORG_POSTS_PER_DAY = 3;
/** 公告板只拉 / 只显示最近多少天 */
export const ORG_BOARD_DAYS = 30;
export const ORG_BOARD_LIMIT = 100;

/** 六个预设标签（顺序即显示顺序） */
export const ORG_TAGS: ReadonlyArray<{ id: OrgReactionTag; label: string }> = [
  { id: 'strong', label: '太强了' },
  { id: 'same', label: '🤣👉' },
  { id: 'steady', label: '稳' },
  { id: 'envy', label: '羡慕' },
  { id: 'metoo', label: '带我一个' },
  { id: 'hug', label: '别似' },
];
export const isOrgTag = (s: unknown): s is OrgReactionTag => typeof s === 'string' && ORG_TAGS.some(t => t.id === s);

/**
 * 这条记录能不能分享、分享出去挂什么类型（7b 拍板：自己记的 + 收官 / 愿望实现 / 宣告卡达成 / 周目标完成；
 * 升级、解锁、记账、同伴互动这类系统记录不能分享）。null = 不能分享。
 */
export function shareKindOf(a: Pick<Activity, 'category' | 'important'>): OrgPostSnapshot['kind'] | undefined | null {
  if (!a.category) return a.important ? 'important' : undefined;
  switch (a.category) {
    case 'bigdeal_clear': return 'bigdeal';
    case 'wish_fulfilled': return 'wish';
    case 'calling_card_clear': return 'card';
    case 'weekly_goal': return 'weekly';
    default: return null;
  }
}
export const canShareActivity = (a: Pick<Activity, 'category' | 'important'>): boolean => shareKindOf(a) !== null;

export const SHARE_KIND_LABEL: Record<NonNullable<OrgPostSnapshot['kind']>, string> = {
  important: '重要', bigdeal: 'BIG DEAL 收官', wish: '愿望实现', card: '宣告卡达成', weekly: '周目标完成',
};

/** 分享那一句的默认值：记录原文前 20 个字（按码点，不劈开表情） */
export const defaultShareText = (description: string): string => [...description.replace(/\s+/g, ' ').trim()].slice(0, ORG_POST_TEXT_MAX).join('');

/** 分享快照：日期、加点（带分享者自己的属性名）、类型、补记、是谁——不带记录原文 */
export function buildPostSnapshot(a: Pick<Activity, 'date' | 'pointsAwarded' | 'category' | 'important' | 'backfilled'>, names: AttributeNames, by: { codename: string; tarotId?: string }): OrgPostSnapshot {
  const pts: Partial<Record<AttributeId, number>> = {};
  const nm: Partial<Record<AttributeId, string>> = {};
  for (const [k, v] of Object.entries(a.pointsAwarded ?? {}) as Array<[AttributeId, number]>) {
    if (typeof v === 'number' && v !== 0) { pts[k] = v; nm[k] = names[k]; }
  }
  const kind = shareKindOf(a);
  return {
    v: 1,
    date: localKey(a.date),
    pts,
    names: nm,
    ...(kind ? { kind } : {}),
    ...(a.backfilled ? { backfilled: true } : {}),
    by: { codename: by.codename, ...(by.tarotId ? { tarotId: by.tarotId } : {}) },
  };
}

/**
 * 快照里的属性名是用户自己起的，会给组织里的人看到：过不了屏蔽词的换回默认名（不拦分享，只换小签上的字）。
 * 分享卡的预览和真正发出去的都走这一道，两边看到的一样。
 */
export function cleanSnapshotNames(snap: OrgPostSnapshot): OrgPostSnapshot {
  const names: Partial<Record<AttributeId, string>> = {};
  for (const [k, v] of Object.entries(snap.names) as Array<[AttributeId, string | undefined]>) {
    const n = [...(v ?? '').trim()].slice(0, 12).join('');
    names[k] = n && auditText(n).ok ? n : DEFAULT_ATTRIBUTE_NAMES[k] ?? k;
  }
  return { ...snap, names };
}

/** 一个属性名：本人起的，过不了屏蔽词或是空的就用默认名；最多 12 个字 */
const cleanAttrName = (id: AttributeId, name: string | undefined): string => {
  const n = [...(name ?? '').trim()].slice(0, 12).join('');
  return n && auditText(n).ok ? n : DEFAULT_ATTRIBUTE_NAMES[id] ?? id;
};

/** 推之前：五维按固定顺序、名字过屏蔽词、等级夹在 0～99 */
export function cleanMemberAttrs(list: OrgMemberAttr[]): OrgMemberAttr[] {
  return PERSONA_ATTRS.map(id => list.find(a => a.id === id))
    .filter((a): a is OrgMemberAttr => !!a)
    .map(a => attrExtras(a, { id: a.id, name: cleanAttrName(a.id, a.name), level: Math.max(0, Math.min(99, Math.floor(a.level || 0))), ...(a.locked ? { locked: true } : {}) }));
}

/** 点数 / 满级 / 精通星 / 称号：数字夹一夹，称号过屏蔽词（不过就不带，看的人那边不显示称号） */
function attrExtras(src: Partial<Record<'points' | 'max' | 'stars' | 'title', unknown>>, out: OrgMemberAttr): OrgMemberAttr {
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : undefined);
  const points = num(src.points, 0, 9_999_999);
  const max = num(src.max, 1, 99);
  const stars = num(src.stars, 0, 99);
  const t = typeof src.title === 'string' ? [...src.title.trim()].slice(0, 10).join('') : '';
  return {
    ...out,
    ...(points !== undefined ? { points } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(stars ? { stars } : {}),
    ...(t && auditText(t).ok ? { title: t } : {}),
  };
}

/** 别人推上来的五维：id 在白名单里、名字是字符串、等级是数字；看的时候名字也再过一道屏蔽词 */
export function parseMemberAttrs(v: unknown[]): OrgMemberAttr[] {
  const out: OrgMemberAttr[] = [];
  for (const x of v) {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const id = o.id as AttributeId;
    if (!PERSONA_ATTRS.includes(id) || out.some(a => a.id === id)) continue;
    const level = typeof o.level === 'number' && Number.isFinite(o.level) ? Math.max(0, Math.min(99, Math.floor(o.level))) : 0;
    out.push(attrExtras(o, { id, name: cleanAttrName(id, typeof o.name === 'string' ? o.name : undefined), level, ...(o.locked === true ? { locked: true } : {}) }));
  }
  return PERSONA_ATTRS.map(id => out.find(a => a.id === id)).filter((a): a is OrgMemberAttr => !!a);
}

/** 这个人自己起的五维名字（牌子上没有就用默认名）：成员牌背面、同调弹层里写面具属性时用 */
export function memberAttrNames(card: OrgMemberCard | undefined | null): Record<AttributeId, string> {
  const names = { ...DEFAULT_ATTRIBUTE_NAMES } as Record<AttributeId, string>;
  for (const a of card?.attrs ?? []) names[a.id] = a.name;
  return names;
}

/** 服务器上的 snapshot json → 结构化（坏数据当没有，不让一条动态拖垮整个公告板） */
export function parsePostSnapshot(v: unknown): OrgPostSnapshot | null {
  const o = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!o || typeof o.date !== 'string') return null;
  const pick = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
  const pts: Partial<Record<AttributeId, number>> = {};
  const names: Partial<Record<AttributeId, string>> = {};
  for (const [k, n] of Object.entries(pick(o.pts))) if (typeof n === 'number') pts[k as AttributeId] = n;
  for (const [k, n] of Object.entries(pick(o.names))) if (typeof n === 'string') names[k as AttributeId] = n.slice(0, 12);
  const by = pick(o.by);
  const kinds = ['important', 'bigdeal', 'wish', 'card', 'weekly'];
  return {
    v: 1,
    date: o.date.slice(0, 10),
    pts,
    names,
    ...(typeof o.kind === 'string' && kinds.includes(o.kind) ? { kind: o.kind as OrgPostSnapshot['kind'] } : {}),
    ...(o.backfilled === true ? { backfilled: true } : {}),
    by: { codename: typeof by.codename === 'string' ? by.codename.slice(0, 8) : '', ...(typeof by.tarotId === 'string' ? { tarotId: by.tarotId } : {}) },
  };
}

export function parseMinutes(v: unknown): OrgMinutesSnapshot | null {
  const o = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!o || typeof o.week !== 'string') return null;
  const arr = (x: unknown) => (Array.isArray(x) ? (x as Array<Record<string, unknown>>).filter(i => i && typeof i === 'object') : []);
  const who = (i: Record<string, unknown>) => ({ userId: String(i.userId ?? ''), codename: String(i.codename ?? '').slice(0, 8) });
  const rate = (o.rate && typeof o.rate === 'object' ? o.rate : {}) as Record<string, unknown>;
  return {
    v: 1,
    week: o.week.slice(0, 10),
    rate: { done: Number(rate.done) || 0, total: Number(rate.total) || 0 },
    done: arr(o.done).map(who),
    goals: arr(o.goals).map(i => ({ ...who(i), goal: String(i.goal ?? '').slice(0, 30) })),
    titles: arr(o.titles).map(i => ({ ...who(i), title: String(i.title ?? '').slice(0, 12) })),
    absent: arr(o.absent).map(who),
  };
}

/** 今天（本地）我在这个组织已经分享了几条 */
export function myPostsToday(posts: OrgPost[] | undefined, me: string, now = new Date()): number {
  const today = localKey(now);
  return (posts ?? []).filter(p => p.kind === 'moment' && p.userId === me && localKey(p.createdAt) === today).length;
}

/** 刚刚 / N 分钟前 / N 小时前 / 昨天 / M月D日 */
export function timeAgo(d: Date, now = new Date()): string {
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  const today = localKey(now);
  if (localKey(d) === today && diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (localKey(d) === localKey(y)) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 一条动态上的标签：按标签分组（带贴的人），我贴的是哪个；屏蔽的人不算 */
export function reactionSummary(reactions: OrgReaction[] | undefined, postId: string, me: string, blocked: Set<string>) {
  const mine = (reactions ?? []).find(r => r.postId === postId && r.userId === me);
  const byTag = new Map<OrgReactionTag, string[]>();
  for (const r of reactions ?? []) {
    if (r.postId !== postId || blocked.has(r.userId)) continue;
    const list = byTag.get(r.tag) ?? [];
    list.push(r.userId);
    byTag.set(r.tag, list);
  }
  return { mine, byTag };
}

// ── 周日会议与纪要（7b）────────────────────────────────────────────────────────

export const ORG_GOAL_MAX = 30;
export const RESULT_LABEL: Record<'done' | 'partial' | 'missed', string> = { done: '做到了', partial: '差一点', missed: '没做到' };

/** 纪要的确定 id：组织 + 周键 → 15 位 [a-z0-9]（两台设备同时发只会留一份；写法同羁绊之影的 shadowSlotId） */
export function minutesId(orgId: string, weekKey: string): string {
  const src = `minutes:${orgId}:${weekKey}`;
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

/** 这个人这一场会议写过了没有（写的是下周的目标） */
export const wroteMeeting = (m: Pick<OrgMember, 'goalWeek'>, meetingWeek: string): boolean => m.goalWeek === nextWeekKey(meetingWeek);
/** 这一周他有没有立过目标（要不要先问一句「做到了吗」） */
export const hadGoalFor = (m: Pick<OrgMember, 'goalWeek' | 'resultWeek'>, week: string): boolean => m.goalWeek === week || m.resultWeek === week;

/**
 * 纪要（周一 4 点后第一个上线的人生成）：
 *   · 立过目标的人 = 这周有自评的 + 目标还停在这周（会上没来、没自评）的；做到了 = 自评「做到了」；
 *   · 下周目标 = 会上写了的；缺席 = 这周以前加入、会上没写的；
 *   · 称号：出勤王（这周出勤 ≥5 天里最多的，并列都给）、连续 7 / 14 / 30 天（取最高一档）、言出必行、
 *     作战完成者（第 8 轮：那周有作战达成的参与者，读达成卡）。
 *     连续天数是本人客户端推上来的，人不打开 App 就停在旧值：那周周六或周日有记录（到周末还没断）才算数。
 */
export function computeMinutes(view: Pick<OrgView, 'org' | 'members' | 'posts' | 'ledger'>, week: string): OrgMinutesSnapshot {
  const next = nextWeekKey(week);
  const lastDay = shiftDayKey(week, 6);
  const who = (m: OrgMember) => ({ userId: m.userId, codename: displayCodename(m) });
  const members = [...view.members].sort(bySeat);
  const eligible = members.filter(m => zonedDay(m.createdAt, view.org.tz).key <= lastDay);
  const hadGoal = members.filter(m => m.resultWeek === week || m.goalWeek === week);
  const done = members.filter(m => m.resultWeek === week && m.result === 'done');
  const attendees = members.filter(m => m.goalWeek === next && !!m.goal);
  const titles: OrgMinutesSnapshot['titles'] = [];
  const days = members.map(m => ({ m, n: bitCount(weekDaysOf(m.card, week)) }));
  const best = Math.max(0, ...days.map(x => x.n));
  if (best >= 5) for (const x of days) if (x.n === best) titles.push({ ...who(x.m), title: '本周出勤王' });
  const WEEKEND = (1 << 5) | (1 << 6);
  for (const m of members) {
    if (!(weekDaysOf(m.card, week) & WEEKEND)) continue;
    const tier = m.card.streak >= 30 ? 30 : m.card.streak >= 14 ? 14 : m.card.streak >= 7 ? 7 : 0;
    if (tier) titles.push({ ...who(m), title: `连续 ${tier} 天` });
  }
  for (const m of done) titles.push({ ...who(m), title: '言出必行' });
  const opWinners = new Set<string>();
  for (const p of [...(view.ledger ?? []), ...(view.posts ?? [])]) {
    if (p.kind !== 'operation' || p.opCard?.week !== week) continue;
    for (const x of p.opCard.participants) opWinners.add(x.userId);
  }
  for (const m of members) if (opWinners.has(m.userId)) titles.push({ ...who(m), title: '作战完成者' });
  return {
    v: 1,
    week,
    rate: { done: done.length, total: hadGoal.length },
    done: done.map(who),
    goals: attendees.map(m => ({ ...who(m), goal: m.goal! })),
    titles,
    absent: eligible.filter(m => !attendees.includes(m)).map(who),
  };
}

/** 最新一份纪要（上一场会议那周的）：名册上的称号和「本周缺席」读它 */
export function latestMinutes(view: Pick<OrgView, 'org' | 'posts'>, now = new Date()): OrgMinutesSnapshot | null {
  const { lastClosed } = meetingState(now, view.org.tz);
  const p = (view.posts ?? []).find(x => x.kind === 'minutes' && x.minutes?.week === lastClosed);
  return p?.minutes ?? null;
}

/** 这一场会议还没写（组织卡红点、周日提醒用） */
export function meetingPending(view: Pick<OrgView, 'org' | 'me'>, now = new Date()): boolean {
  const st = meetingState(now, view.org.tz);
  return st.open && !wroteMeeting(view.me, st.week);
}

/** 周日提醒（本地通知快照）：这一场（或下一场）会议还没写下周目标的第一个组织；都写了 / 不在组织里 → null */
export function meetingReminder(orgs: Array<Pick<OrgView, 'org' | 'me'>>, now = new Date()): { orgName: string } | null {
  for (const v of orgs) {
    if (!wroteMeeting(v.me, meetingState(now, v.org.tz).week)) return { orgName: v.org.name };
  }
  return null;
}

/**
 * 公告板红点：别人在「看到哪儿」之后发的动态、新出的纪要 / 作战达成卡（不管是谁的客户端发的——发的人自己也还没看过），
 * 或别人在那之后给我的动态贴的标签（屏蔽的人不算）。
 */
export function boardUnread(view: Pick<OrgView, 'posts' | 'reactions' | 'me'>, seenIso: string | undefined, blocked: Set<string>): boolean {
  const seen = seenIso ? Date.parse(seenIso) : 0;
  const me = view.me.userId;
  // 纪要和作战达成卡是自动发的：不管是谁的客户端发的都算新（发的人自己也还没看过）
  const fresh = (p: OrgPost) => p.createdAt.getTime() > seen && (p.kind === 'minutes' || p.kind === 'operation' || (p.userId !== me && !blocked.has(p.userId)));
  if ((view.posts ?? []).some(fresh)) return true;
  const mine = new Set((view.posts ?? []).filter(p => p.userId === me).map(p => p.id));
  return (view.reactions ?? []).some(r => mine.has(r.postId) && r.userId !== me && !blocked.has(r.userId) && r.updatedAt.getTime() > seen);
}

/** 据点守则（第一次建立 / 加入组织时同意一次；App Store 对用户内容的要求） */
export const ORG_RULES: readonly string[] = [
  '这里是一小群人互相打气的地方。不发广告、不留联系方式和链接。',
  '不骚扰、不攻击任何人，不发色情、暴力、违法或让人不适的内容。',
  '违反守则的内容会被删除；队长可以请离成员，严重的账号会被限制使用。',
  '看到不合适的内容，长按就能举报或屏蔽；举报会在 2 天内处理。',
];
