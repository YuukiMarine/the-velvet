/**
 * navigatorBond — 助手的「相处时长」（AI 助手第二批）。
 *
 * 按人格算：认识第几天（这个人格最早一条会话的日子）、一起聊过几天（用户开过口的会话天数）、
 * 最近连着聊了几天、隔了几天没聊。熟络程度三档写进上下文的语气提示：
 *   · 初识（聊过不到 5 天）：客气一点、多问少下判断，不装熟；
 *   · 熟悉（5～29 天）：可以开玩笑、接上次的话；
 *   · 老朋友（30 天以上）：说话更直，可以翻旧账。
 * 翻旧账：熟悉以上，一周最多一次，从 30 天前、重要度 ≥3 的记忆里挑一条，只在闲聊时放进上下文。
 * 纪念日：认识满 7 / 30 / 100 / 365 天，当天（或之后三天内第一次见面）问候里提一句，每个只提一次。
 * 换人格就是重新认识（各算各的）。记账放 localStorage：节流状态，不上云、不进备份。
 */
import { db } from '@/db';
import { daysBetween, dayLabelCN, keyOfDate, shiftKey, shortMD } from '@/utils/navigatorClock';
import type { NavigatorMemo, NavigatorSessionRow } from '@/types';

export type BondStage = 'new' | 'familiar' | 'old';

export interface TogetherFacts {
  presetId: string;
  /** 最早一条会话的日子 */
  firstMet: string;
  /** 认识几天了（第一天 = 0） */
  daysKnown: number;
  /** 一起聊过几天（今天开过口也算） */
  chatDays: number;
  /** 连着聊了几天（截至今天或昨天） */
  streak: number;
  /** 上一次聊天（今天之前）隔了几天；从没聊过为 null */
  gapDays: number | null;
  stage: BondStage;
  /** 该提的纪念日（满 7 / 30 / 100 / 365 天，且还没提过） */
  milestone?: { days: number; label: string; dateKey: string };
}

export const MILESTONES: Array<{ days: number; label: string }> = [
  { days: 365, label: '一年' },
  { days: 100, label: '一百天' },
  { days: 30, label: '一个月' },
  { days: 7, label: '一周' },
];
/** 纪念日当天没见着，之后三天内第一次见面还提（「前两天是我们认识满一个月」） */
const MILESTONE_GRACE_DAYS = 3;

export const stageOf = (chatDays: number): BondStage => (chatDays < 5 ? 'new' : chatDays < 30 ? 'familiar' : 'old');

// ── 记账 ────────────────────────────────────────────────────────

const LEDGER_KEY = 'velvet.navBond.v1';

interface BondLedger {
  /** 提过的纪念日（天数） */
  milestones: number[];
  /** 本周挑中的旧事 */
  oldStory?: { week: string; memoId: string; used: boolean };
}

const readAll = (): Record<string, BondLedger> => {
  try {
    return JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}') as Record<string, BondLedger>;
  } catch {
    return {};
  }
};
const ledgerOf = (presetId: string): BondLedger => {
  const l = readAll()[presetId];
  return { milestones: l?.milestones ?? [], oldStory: l?.oldStory };
};
const writeLedger = (presetId: string, l: BondLedger) => {
  try {
    const all = readAll();
    all[presetId] = l;
    localStorage.setItem(LEDGER_KEY, JSON.stringify(all));
  } catch { /* 记不下：最多多提一次 */ }
};

export function markMilestoneMentioned(presetId: string, days: number): void {
  const l = ledgerOf(presetId);
  if (!l.milestones.includes(days)) {
    // 一次提了大的，小的也一并算过（一年那天不必再补「满一百天」）
    l.milestones = [...new Set([...l.milestones, ...MILESTONES.filter((m) => m.days <= days).map((m) => m.days)])];
    writeLedger(presetId, l);
  }
}

// ── 统计 ────────────────────────────────────────────────────────

const PLAIN_SUMMARY = '打了个照面，没聊什么。';

/**
 * 这天用户开没开过口：新会话行带 userSpoke；老行缺字段时——7 天内看消息、更早看摘要（本地拼的
 * 「打了个照面」= 没开口），补算的结果写回去（今天的不写，还会变）。
 */
async function spokeOf(row: NavigatorSessionRow, today: string): Promise<boolean> {
  if (typeof row.userSpoke === 'boolean') return row.userSpoke;
  let spoke = false;
  try {
    const n = await db.navigatorMessages.where('sessionId').equals(row.id).filter((m) => m.role === 'user').count();
    spoke = n > 0 || (!!row.compactedSummary && row.compactedSummary !== PLAIN_SUMMARY);
  } catch {
    spoke = !!row.compactedSummary && row.compactedSummary !== PLAIN_SUMMARY;
  }
  if (row.dateKey < today) void db.navigatorSessions.update(row.id, { userSpoke: spoke }).catch(() => {});
  return spoke;
}

export async function togetherFacts(presetId: string, now: Date = new Date()): Promise<TogetherFacts> {
  const today = keyOfDate(now);
  let rows: NavigatorSessionRow[] = [];
  try {
    rows = await db.navigatorSessions.where('presetId').equals(presetId).toArray();
  } catch { /* 表读不到就当初次见面 */ }
  if (rows.length === 0) {
    return { presetId, firstMet: today, daysKnown: 0, chatDays: 0, streak: 0, gapDays: null, stage: 'new' };
  }
  const firstMet = rows.reduce((m, r) => (r.dateKey < m ? r.dateKey : m), rows[0].dateKey);
  const spokeDays = new Set<string>();
  for (const r of rows) if (await spokeOf(r, today)) spokeDays.add(r.dateKey);
  const days = [...spokeDays].sort();
  let streak = 0;
  let cursor = spokeDays.has(today) ? today : shiftKey(today, -1);
  while (spokeDays.has(cursor)) { streak++; cursor = shiftKey(cursor, -1); }
  const before = days.filter((d) => d < today);
  const gapDays = before.length ? daysBetween(before[before.length - 1], today) : null;
  const daysKnown = Math.max(0, daysBetween(firstMet, today));
  const ledger = ledgerOf(presetId);
  const hit = MILESTONES.find((m) => daysKnown >= m.days && daysKnown <= m.days + MILESTONE_GRACE_DAYS && !ledger.milestones.includes(m.days));
  return {
    presetId,
    firstMet,
    daysKnown,
    chatDays: days.length,
    streak,
    gapDays,
    stage: stageOf(days.length),
    milestone: hit ? { ...hit, dateKey: shiftKey(firstMet, hit.days) } : undefined,
  };
}

/** 进上下文的「相处」行 */
export function buildTogetherLine(f: TogetherFacts, today: string = keyOfDate(new Date())): string {
  const head = f.daysKnown === 0 && f.chatDays === 0
    ? '【相处】你们今天第一次见面'
    : `【相处】你们认识第 ${f.daysKnown + 1} 天（${dayLabelCN(f.firstMet, today)}认识），一起聊过 ${f.chatDays} 天`;
  const tone = f.stage === 'new'
    ? '还在熟悉阶段：客气一点，多问少下判断，别装作很了解他。'
    : f.stage === 'familiar'
      ? '已经熟了：可以开玩笑，可以接上次的话。'
      : '是老朋友了：说话可以更直，偶尔翻翻旧账也行。';
  const extras: string[] = [];
  if (f.streak >= 3) extras.push(`这几天他天天来找你（连着 ${f.streak} 天）。`);
  if (f.gapDays !== null && f.gapDays >= 2) extras.push(`上次聊天是 ${f.gapDays} 天前。`);
  if (f.milestone) {
    const when = f.milestone.dateKey === today ? '今天' : `${dayLabelCN(f.milestone.dateKey, today)}`;
    extras.push(`${when}是你们认识满${f.milestone.label}的日子：问候里轻轻提一句就好，只提这一次，别煽情。`);
  }
  return `${head}；${tone}${extras.join('')}`;
}

// ── 翻旧账 ──────────────────────────────────────────────────────

/** 本周的周键（周一的日期） */
const weekOf = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return shiftKey(key, -((dow + 6) % 7));
};

/**
 * 这周可以顺口提的一件旧事（熟悉以上才有）：30 天以前、重要度 ≥3、没挂着话头 / 约定的记忆，
 * 挑最久没被想起来的那条。一周一条；提过就到下周再说。
 */
export async function pickOldStory(f: TogetherFacts, now: Date = new Date()): Promise<NavigatorMemo | null> {
  if (f.stage === 'new') return null;
  const today = keyOfDate(now);
  const week = weekOf(today);
  const ledger = ledgerOf(f.presetId);
  try {
    if (ledger.oldStory?.week === week) {
      if (ledger.oldStory.used) return null;
      const memo = await db.navigatorMemos.get(ledger.oldStory.memoId);
      if (memo && memo.status === 'active') return memo;
    }
    const cutoff = now.getTime() - 30 * 86400_000;
    const memos = (await db.navigatorMemos.where('status').equals('active').toArray())
      .filter((m) => m.source !== 'profile' && m.source !== 'image' && m.importance >= 3 && !m.followUp && !m.dueDate
        && new Date(m.createdAt).getTime() < cutoff)
      .sort((a, b) => new Date(a.lastRecalledAt ?? a.createdAt).getTime() - new Date(b.lastRecalledAt ?? b.createdAt).getTime()
        || b.importance - a.importance);
    const pick = memos[0];
    if (!pick) return null;
    writeLedger(f.presetId, { ...ledger, oldStory: { week, memoId: pick.id, used: false } });
    return pick;
  } catch {
    return null;
  }
}

export function buildOldStoryLine(m: NavigatorMemo): string {
  return `【可以顺口提的旧事】（${shortMD(keyOfDate(new Date(m.createdAt)))} 记）${m.text}——只在闲聊、话题接得上时提一句，像老朋友那样随口一说；接不上就别提，这周就这一次。`;
}

const bigrams = (t: string): Set<string> => {
  const c = t.replace(/[^一-鿿\w]/g, '');
  const g = new Set<string>();
  for (let i = 0; i < c.length - 1; i++) g.add(c.slice(i, i + 2));
  return g;
};

/** 回复发出后：跟那件旧事有三成以上的字面重合，就算这周提过了 */
export function noteOldStoryMentioned(text: string, presetId: string, memo: NavigatorMemo, now: Date = new Date()): void {
  const a = bigrams(memo.text);
  if (a.size === 0 || !text.trim()) return;
  const b = bigrams(text);
  let hit = 0;
  a.forEach((g) => { if (b.has(g)) hit++; });
  if (hit / a.size < 0.3) return;
  const l = ledgerOf(presetId);
  writeLedger(presetId, { ...l, oldStory: { week: weekOf(keyOfDate(now)), memoId: memo.id, used: true } });
}
