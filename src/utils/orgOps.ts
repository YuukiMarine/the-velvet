/**
 * 组织作战与据点等级（v2.7.0.6 第 8 轮 · PRD §13）的纯计算：每个人的那一份、进度与状态（进行中 / 达成 / 未达成 / 取消）、
 * 发起前的校验、达成卡、据点经验与等级、红点。不碰 store / PB，无头脚本里可以直接验。
 */
import { auditText } from '@/utils/textAudit';
import { bySeat, displayCodename, orgWeekKey, shiftDayKey, zonedDay } from '@/utils/orgLogic';
import type { AttributeId, OrgCheckin, OrgMember, OrgOpCardSnapshot, OrgOpKind, OrgOperation, OrgPost, OrgView } from '@/types';

export const ORG_OP_TITLE_MAX = 20;
export const ORG_OP_TASK_MAX = 20;
/** 截止日最远：今天起 30 天 */
export const ORG_OP_DAYS_MAX = 30;
/** 至少几个人才算作战 */
export const ORG_OP_MIN_PEOPLE = 2;
/** 同一个组织同时进行的作战最多几场；每人同时发起的最多几场（客户端拦） */
export const ORG_OP_ACTIVE_MAX = 6;
export const ORG_OP_MINE_MAX = 3;
/** 达成奖励：每人 +6 SP；在线同伴之间 +2 亲密度 */
export const ORG_OP_SP = 6;
export const ORG_OP_INTIMACY = 2;
/** 作战待办的默认分值 */
export const ORG_OP_TODO_POINTS = 3;
/** 作战区「历史」只列最近几天结束的；对账时拉最近几天建的作战（覆盖 30 天的截止期 + 30 天的历史） */
export const ORG_OP_HISTORY_DAYS = 30;
export const ORG_OP_FETCH_DAYS = 62;

export type OpStatus = 'active' | 'achieved' | 'failed' | 'cancelled';

const clipText = (s: string, n: number): string => [...s.replace(/\s+/g, ' ').trim()].slice(0, n).join('');
export const clipOpText = (s: string): string => clipText(s, ORG_OP_TITLE_MAX);

// ── 每个人的那一份 ────────────────────────────────────────────────────────────────

/** 这个人在这场作战里做什么：大作战分到的子任务 > 自己写下的那一份 > 共同目标（小作战人人都是那一句话） */
export function taskOf(op: OrgOperation, checkins: OrgCheckin[] | undefined, userId: string): { text: string; source: 'assigned' | 'plan' | 'goal' } {
  if (op.kind === 'big') {
    const a = (op.assignments[userId] ?? '').trim();
    if (a) return { text: a, source: 'assigned' };
    const plan = (checkins ?? []).find(c => c.operationId === op.id && c.userId === userId && c.kind === 'plan')?.text.trim();
    if (plan) return { text: plan, source: 'plan' };
  }
  return { text: op.title, source: 'goal' };
}

const checkinOf = (checkins: OrgCheckin[] | undefined, opId: string, userId: string, kind: OrgCheckin['kind']) =>
  (checkins ?? []).find(c => c.operationId === opId && c.userId === userId && c.kind === kind);

// ── 进度与状态 ──────────────────────────────────────────────────────────────────

export interface OpRow {
  userId: string;
  /** 还在组织里就有；已经离开的人没有 */
  member?: OrgMember;
  codename: string;
  task: string;
  source: 'assigned' | 'plan' | 'goal';
  /** done = 做完了；todo = 还没做；out = 这次不参加；gone = 已经不在组织里 */
  state: 'done' | 'todo' | 'out' | 'gone';
  /** 做完的日子 */
  day?: string;
}

export interface OpProgress {
  op: OrgOperation;
  rows: OpRow[];
  /** 还算数的人：在名单里、在组织里、没点「不参加」 */
  counted: number;
  done: number;
  status: OpStatus;
  /** 达成那天（最后一个人做完的日子） */
  achievedDay?: string;
  /** 截止还剩几天（组织时区；0 = 今天截止，负数 = 过了） */
  daysLeft: number;
}

/** 作战达成卡的确定 id：作战 id → 15 位 [a-z0-9]（两台设备同时发只会留一份；写法同纪要） */
export function opCardId(opId: string): string {
  const src = `opcard:${opId}`;
  let out = '';
  for (let seed = 0; out.length < 15; seed++) {
    let h = (0x811c9dc5 ^ Math.imul(seed + 7, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < src.length; i++) {
      h ^= src.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(36).padStart(7, '0');
  }
  return out.slice(0, 15);
}

const dayDiff = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** 公告板 / 经验流水里有没有这场作战的达成卡（有了就算达成，之后有人撤销也不变回去） */
export function opCardOf(view: Pick<OrgView, 'posts' | 'ledger'>, opId: string): OrgPost | undefined {
  const id = opCardId(opId);
  return (view.ledger ?? []).find(p => p.id === id) ?? (view.posts ?? []).find(p => p.id === id);
}

export function opProgress(view: Pick<OrgView, 'org' | 'members' | 'checkins' | 'posts' | 'ledger'>, op: OrgOperation, now = new Date()): OpProgress {
  const today = zonedDay(now, view.org.tz).key;
  const card = opCardOf(view, op.id);
  const frozen = new Map((card?.opCard?.participants ?? []).map(p => [p.userId, p]));
  const members = new Map(view.members.map(m => [m.userId, m]));
  const rows: OpRow[] = op.participants.map((userId) => {
    const member = members.get(userId);
    const t = taskOf(op, view.checkins, userId);
    const done = checkinOf(view.checkins, op.id, userId, 'done');
    const out = checkinOf(view.checkins, op.id, userId, 'out');
    const state: OpRow['state'] = !member ? 'gone' : out ? 'out' : done && done.day <= op.deadline ? 'done' : 'todo';
    return {
      userId,
      member,
      codename: member ? displayCodename(member) : frozen.get(userId)?.codename || '已离开',
      task: frozen.get(userId)?.task || t.text,
      source: t.source,
      state,
      ...(done ? { day: done.day } : {}),
    };
  });
  // 在组织里的排前面（按座位），离开的排最后
  rows.sort((a, b) => (a.member && b.member ? bySeat(a.member, b.member) : a.member ? -1 : b.member ? 1 : 0));
  const countedRows = rows.filter(r => r.state === 'done' || r.state === 'todo');
  const done = countedRows.filter(r => r.state === 'done').length;
  const allDone = countedRows.length > 0 && done === countedRows.length;
  const achievedDay = card?.opCard?.day ?? (allDone ? countedRows.reduce((m, r) => (r.day && r.day > m ? r.day : m), '') || today : undefined);
  const status: OpStatus = card ? 'achieved'
    : op.status === 'cancelled' ? 'cancelled'
      : allDone ? 'achieved'
        : today > op.deadline ? 'failed'
          : 'active';
  return {
    op,
    rows,
    counted: countedRows.length,
    done,
    status,
    ...(status === 'achieved' && achievedDay ? { achievedDay } : {}),
    daysLeft: dayDiff(today, op.deadline),
  };
}

/** 作战什么时候「结束」的（历史排序用）：达成那天 / 截止日 / 取消的时刻 */
export function opEndedDay(p: OpProgress, tz: string): string {
  if (p.status === 'achieved' && p.achievedDay) return p.achievedDay;
  if (p.status === 'cancelled') return zonedDay(p.op.updatedAt, tz).key;
  return p.op.deadline;
}

/** 作战区要列的：进行中的（截止近的在前）+ 最近 30 天结束的（新的在前） */
export function opsForBoard(view: Pick<OrgView, 'org' | 'members' | 'checkins' | 'posts' | 'ledger' | 'ops'>, now = new Date()): { active: OpProgress[]; history: OpProgress[] } {
  const today = zonedDay(now, view.org.tz).key;
  const all = (view.ops ?? []).map(op => opProgress(view, op, now));
  const active = all.filter(p => p.status === 'active').sort((a, b) => (a.op.deadline < b.op.deadline ? -1 : a.op.deadline > b.op.deadline ? 1 : a.op.createdAt.getTime() - b.op.createdAt.getTime()));
  const since = shiftDayKey(today, -ORG_OP_HISTORY_DAYS);
  const history = all
    .filter(p => p.status !== 'active' && opEndedDay(p, view.org.tz) >= since)
    .sort((a, b) => (opEndedDay(a, view.org.tz) < opEndedDay(b, view.org.tz) ? 1 : -1));
  return { active, history };
}

/** 我在这场作战里现在是什么状态（待办对账用） */
export function myOpState(p: OpProgress, me: string): OpRow['state'] | 'none' {
  return p.rows.find(r => r.userId === me)?.state ?? 'none';
}

// ── 发起前的校验 ──────────────────────────────────────────────────────────────────

export interface OpDraft {
  kind: OrgOpKind;
  attr: AttributeId;
  title: string;
  deadline: string;
  participants: string[];
  assignments: Record<string, string>;
}

/** 截止日能选的范围（组织时区）：今天 ~ 今天 + 30 天 */
export function opDeadlineRange(tz: string, now = new Date()): { min: string; max: string } {
  const today = zonedDay(now, tz).key;
  return { min: today, max: shiftDayKey(today, ORG_OP_DAYS_MAX) };
}

const auditMessage = (kind: 'contact' | 'blocked') =>
  kind === 'contact' ? '稍微调整下措辞吧：据点里不能放链接、联系方式或引流内容' : '稍微调整下措辞吧：有个词放在据点里不太合适';

/** 发起前的检查：通过返回 null，否则返回一句人话 */
export function checkOpDraft(d: OpDraft, view: Pick<OrgView, 'org' | 'members' | 'me' | 'ops' | 'checkins' | 'posts' | 'ledger'>, now = new Date()): string | null {
  const title = clipOpText(d.title);
  if (!title) return d.kind === 'big' ? '写一句共同目标' : '写一句这次要一起做的事';
  const a = auditText(title);
  if (!a.ok) return auditMessage(a.kind);
  const { min, max } = opDeadlineRange(view.org.tz, now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.deadline) || d.deadline < min) return '截止日最早是今天';
  if (d.deadline > max) return `截止日最远是 ${ORG_OP_DAYS_MAX} 天后`;
  const ids = new Set(view.members.map(m => m.userId));
  const people = [...new Set(d.participants)].filter(id => ids.has(id));
  if (people.length < ORG_OP_MIN_PEOPLE) return `至少选 ${ORG_OP_MIN_PEOPLE} 个人`;
  if (d.kind === 'big' && view.org.leaderId !== view.me.userId) return '只有队长能发大作战';
  if (d.kind === 'big') {
    for (const [uid, t] of Object.entries(d.assignments)) {
      if (!people.includes(uid)) continue;
      const c = clipText(t, ORG_OP_TASK_MAX);
      if (!c) continue;
      const r = auditText(c);
      if (!r.ok) return auditMessage(r.kind);
    }
  }
  const active = (view.ops ?? []).filter(op => opProgress(view, op, now).status === 'active');
  if (active.length >= ORG_OP_ACTIVE_MAX) return `同时进行的作战最多 ${ORG_OP_ACTIVE_MAX} 场，等有一场结束再发`;
  if (active.filter(op => op.initiatorId === view.me.userId).length >= ORG_OP_MINE_MAX) return `你同时发起的作战最多 ${ORG_OP_MINE_MAX} 场`;
  return null;
}

/** 发出去的样子：字截好、分工只留名单里的人、空的去掉 */
export function normalizeOpDraft(d: OpDraft, members: OrgMember[]): OpDraft {
  const ids = new Set(members.map(m => m.userId));
  const people = [...new Set(d.participants)].filter(id => ids.has(id));
  const assignments: Record<string, string> = {};
  if (d.kind === 'big') {
    for (const uid of people) {
      const t = clipText(d.assignments[uid] ?? '', ORG_OP_TASK_MAX);
      if (t) assignments[uid] = t;
    }
  }
  return { ...d, title: clipOpText(d.title), participants: people, assignments };
}

// ── 达成卡 ──────────────────────────────────────────────────────────────────────

export function buildOpCard(p: OpProgress, tz: string): OrgOpCardSnapshot {
  const day = p.achievedDay ?? zonedDay(new Date(), tz).key;
  return {
    v: 1,
    opId: p.op.id,
    kind: p.op.kind,
    title: p.op.title,
    day,
    week: orgWeekKey(new Date(`${day}T12:00:00Z`), 'UTC'),
    participants: p.rows.filter(r => r.state === 'done').map(r => ({
      userId: r.userId,
      codename: r.codename,
      ...(r.member?.tarotId ? { tarotId: r.member.tarotId } : {}),
      ...(p.op.kind === 'big' ? { task: r.task } : {}),
    })),
  };
}

export function parseOpCard(v: unknown): OrgOpCardSnapshot | null {
  const o = (v && typeof v === 'object' ? v : null) as Record<string, unknown> | null;
  if (!o || typeof o.opId !== 'string' || typeof o.day !== 'string') return null;
  const arr = Array.isArray(o.participants) ? (o.participants as Array<Record<string, unknown>>).filter(x => x && typeof x === 'object') : [];
  return {
    v: 1,
    opId: o.opId.slice(0, 15),
    kind: o.kind === 'big' ? 'big' : 'small',
    title: String(o.title ?? '').slice(0, ORG_OP_TITLE_MAX),
    day: o.day.slice(0, 10),
    week: typeof o.week === 'string' ? o.week.slice(0, 10) : '',
    participants: arr.slice(0, 7).map(x => ({
      userId: String(x.userId ?? ''),
      codename: String(x.codename ?? '').slice(0, 8),
      ...(typeof x.tarotId === 'string' ? { tarotId: x.tarotId.slice(0, 40) } : {}),
      ...(typeof x.task === 'string' && x.task ? { task: x.task.slice(0, ORG_OP_TASK_MAX) } : {}),
    })),
  };
}

// ── 据点等级（PRD §13.4）─────────────────────────────────────────────────────────

/** Lv1 0 / Lv2 30 / Lv3 80 / Lv4 150 / Lv5 240 / Lv6 350（封顶） */
export const ORG_LEVEL_XP = [0, 30, 80, 150, 240, 350] as const;
export const ORG_MAX_LEVEL = ORG_LEVEL_XP.length;
export const ORG_XP_MEETING = 2;
export const ORG_XP_OP_SMALL = 5;
export const ORG_XP_OP_BIG = 8;
/** 每个组织每周最多算几场作战 */
export const ORG_XP_OPS_PER_WEEK = 3;

export interface OrgLevel {
  level: number;
  xp: number;
  /** 这一级起点 / 下一级起点（满级时 next = null） */
  floor: number;
  next: number | null;
  /** 借面具的伤害系数：Lv1 ×1.0，每级 +0.1，Lv6 ×1.5 */
  mult: number;
}

export const orgLevelMult = (level: number): number => Math.round((1 + 0.1 * (Math.max(1, Math.min(ORG_MAX_LEVEL, level)) - 1)) * 10) / 10;

export function orgLevelOf(xp: number): OrgLevel {
  let level = 1;
  for (let i = 0; i < ORG_LEVEL_XP.length; i++) if (xp >= ORG_LEVEL_XP[i]) level = i + 1;
  return {
    level,
    xp,
    floor: ORG_LEVEL_XP[level - 1],
    next: level < ORG_MAX_LEVEL ? ORG_LEVEL_XP[level] : null,
    mult: orgLevelMult(level),
  };
}

/**
 * 经验：纪要里每个出席（写了下周目标）的人 +2；每场达成的作战每个参与者 +5（大作战 +8），每周（按达成那天所在的周）最多算 3 场。
 * 输入是纪要和达成卡（同一周 / 同一场作战只认一张）。
 */
export function orgXpOf(ledger: OrgPost[] | undefined): number {
  let xp = 0;
  const weeks = new Set<string>();
  const cards = new Map<string, OrgOpCardSnapshot>();
  for (const p of ledger ?? []) {
    if (p.kind === 'minutes' && p.minutes && !weeks.has(p.minutes.week)) {
      weeks.add(p.minutes.week);
      xp += ORG_XP_MEETING * p.minutes.goals.length;
    } else if (p.kind === 'operation' && p.opCard && !cards.has(p.opCard.opId)) {
      cards.set(p.opCard.opId, p.opCard);
    }
  }
  const byWeek = new Map<string, OrgOpCardSnapshot[]>();
  for (const c of cards.values()) {
    const list = byWeek.get(c.week) ?? [];
    list.push(c);
    byWeek.set(c.week, list);
  }
  for (const list of byWeek.values()) {
    const counted = [...list].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.opId < b.opId ? -1 : 1)).slice(0, ORG_XP_OPS_PER_WEEK);
    for (const c of counted) xp += c.participants.length * (c.kind === 'big' ? ORG_XP_OP_BIG : ORG_XP_OP_SMALL);
  }
  return xp;
}

export const orgLevelOfView = (view: Pick<OrgView, 'ledger'>): OrgLevel => orgLevelOf(orgXpOf(view.ledger));

// ── 红点 ────────────────────────────────────────────────────────────────────────

/** 作战区红点：「看到哪儿」之后别人发起、而我在名单里的作战；或我参加的作战在那之后达成了（出了达成卡） */
export function opsUnread(view: Pick<OrgView, 'ops' | 'posts' | 'ledger' | 'me'>, seenIso: string | undefined): boolean {
  const seen = seenIso ? Date.parse(seenIso) : 0;
  const me = view.me.userId;
  if ((view.ops ?? []).some(op => op.status === 'active' && op.initiatorId !== me && op.participants.includes(me) && op.createdAt.getTime() > seen)) return true;
  const cards = [...(view.ledger ?? []), ...(view.posts ?? [])].filter(p => p.kind === 'operation' && p.createdAt.getTime() > seen);
  return cards.some(p => p.opCard?.participants.some(x => x.userId === me));
}
