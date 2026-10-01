/**
 * navigatorPush — 「助手找你」的本地推送（AI 助手第二批 C）。
 *
 * 和时段提醒（notifications.ts，41000 段）分开排，自己一段通知 ID（43000 段）。
 *   · 一天最多一条；22:30～08:30 不发；时间就近你平时聊天的那个钟点（没有就 20:00）。
 *   · 优先级：① 回访约定（那件事过后、该问的时候）② 纪念日（认识满 7 / 30 / 100 / 365 天）
 *             ③ 久别——5 天没打开时说一次想念（这次离开只这一次，不催）。
 *   · 锁屏只写「〈当前助手的名字〉有话想跟你说」（用户口径：私事别露在锁屏上；自定义人格用它自己的名字）。
 *   · 送达（排的时刻过了）之后：记下这条推过了（同一件事不推第二次），留一个「开场」——
 *     下次打开助手窗口，第一句就是要说的那件事（问候层用 AI 现场写，没 Key 用模板）。
 *     约定在这一句真正问出口时才算「问过了」，推送本身不关它。
 *   · 每次切前台 / 数据变动都重排（与时段提醒同一个触发点）：在推送之前打开了 App、事情已经聊完，那条就撤掉。
 * 本地通知只在原生平台排；网页端排程是空操作（计划和送达的逻辑照样能测）。
 * 记账放 localStorage：节流状态，不上云、不进备份。
 */
import { db } from '@/db';
import { isNative } from '@/utils/native';
import { resolveNavigatorPreset } from '@/constants/navigatorPresets';
import { keyOfDate, dateOfKey, daysBetween, shiftKey } from '@/utils/navigatorClock';
import { listPromises, promiseDueAt, promiseExpireAt, promisePhase } from '@/utils/navigatorPromise';
import { MILESTONES, togetherFacts } from '@/utils/navigatorBond';
import type { NavigatorPreset, Settings } from '@/types';

export const PUSH_ID_BASE = 43000;
const PUSH_WINDOW_DAYS = 7;
const QUIET_START = 22 * 60 + 30; // 22:30
const QUIET_END = 8 * 60 + 30; // 08:30
/** 5 天没打开说一次想念（回归面板是 7 天：先想念，回来再接住） */
export const MISS_YOU_DAYS = 5;
/** 推送离现在太近就不排（人多半就在 App 里） */
const MIN_LEAD_MS = 30 * 60 * 1000;

export type PushKind = 'promise' | 'milestone' | 'missyou';

export interface PlannedPush {
  id: number;
  at: number;
  kind: PushKind;
  /** promise：约定 id；milestone：天数；missyou：那次离开的 lastOpenedAt */
  ref: string;
  /** 锁屏文案 */
  title: string;
  body: string;
}

export interface PushInput {
  now: number;
  presetName: string;
  promises: Array<{ id: string; dueAt: number; expireAt: number }>;
  /** 推过的约定（同一件事不推第二次） */
  pushedPromiseIds: string[];
  /** 接下来（今天起 7 天内）的纪念日，没提过、没推过的 */
  milestone: { days: number; dateKey: string } | null;
  lastOpenedAt?: string;
  /** 这次离开已经说过想念了（= 当时的 lastOpenedAt） */
  missYouSentFor?: string;
  /** 平时聊天的钟点（分钟数，0～1439） */
  habitualMin: number;
}

const minOfDay = (t: number): number => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
const atMinute = (dateKey: string, min: number): number => {
  const d = dateOfKey(dateKey);
  d.setHours(Math.floor(min / 60), min % 60, 0, 0);
  return d.getTime();
};
/** 把一个时刻挪出 22:30～08:30：深夜挪到当天 21:30（还在窗口里的话）或第二天 08:30，凌晨挪到当天 08:30 */
function outOfQuiet(t: number, notBefore: number): number {
  const m = minOfDay(t);
  const key = keyOfDate(new Date(t));
  if (m >= QUIET_END && m < QUIET_START) return t;
  if (m < QUIET_END) return atMinute(key, QUIET_END);
  const sameNight = atMinute(key, 21 * 60 + 30);
  return sameNight >= notBefore ? sameNight : atMinute(shiftKey(key, 1), QUIET_END);
}
const clampHabitual = (min: number): number => Math.min(21 * 60 + 30, Math.max(QUIET_END, min));

/**
 * 纯计算：往后 7 天、每天最多一条「助手找你」。同一天几件事撞了按优先级留一条。
 */
export function planAssistantPush(input: PushInput): PlannedPush[] {
  const { now } = input;
  const today = keyOfDate(new Date(now));
  const habit = clampHabitual(input.habitualMin);
  const minAt = now + MIN_LEAD_MS;
  type Cand = { at: number; kind: PushKind; ref: string; prio: number };
  const cands: Cand[] = [];

  // ① 回访约定：该问的时候（就近平时聊天的钟点）；已经过了就半小时后（还在问的窗口里、当天没到深夜）
  for (const p of input.promises) {
    if (input.pushedPromiseIds.includes(p.id)) continue;
    const dueKey = keyOfDate(new Date(p.dueAt));
    let at = Math.max(p.dueAt, atMinute(dueKey, habit));
    at = outOfQuiet(at, p.dueAt);
    if (at < minAt) at = outOfQuiet(minAt, minAt);
    if (at >= p.expireAt) continue;
    cands.push({ at, kind: 'promise', ref: p.id, prio: 0 });
  }
  // ② 纪念日：那天平时聊天的钟点（过了就不补）
  if (input.milestone) {
    const at = atMinute(input.milestone.dateKey, habit);
    if (at >= minAt) cands.push({ at, kind: 'milestone', ref: String(input.milestone.days), prio: 1 });
  }
  // ③ 久别：最后一次打开后第 5 天、平时聊天的钟点；这次离开只说一次
  if (input.lastOpenedAt && input.missYouSentFor !== input.lastOpenedAt) {
    const lastKey = keyOfDate(new Date(input.lastOpenedAt));
    const at = atMinute(shiftKey(lastKey, MISS_YOU_DAYS), habit);
    if (at >= minAt) cands.push({ at, kind: 'missyou', ref: input.lastOpenedAt, prio: 2 });
  }

  const byDay = new Map<string, Cand>();
  for (const c of cands.sort((a, b) => a.prio - b.prio || a.at - b.at)) {
    const k = keyOfDate(new Date(c.at));
    if (daysBetween(today, k) >= PUSH_WINDOW_DAYS) continue;
    if (!byDay.has(k)) byDay.set(k, c);
  }
  return [...byDay.values()].sort((a, b) => a.at - b.at).map((c, i) => ({
    id: PUSH_ID_BASE + i,
    at: c.at,
    kind: c.kind,
    ref: c.ref,
    title: '靛蓝色房间',
    body: `${input.presetName}有话想跟你说`,
  }));
}

// ── 记账 ────────────────────────────────────────────────────────

const LEDGER_KEY = 'velvet.navPush.v1';

/** 开场：送达过的推送，下次打开助手窗口时第一句就说这件事 */
export interface PushOpener {
  kind: PushKind;
  ref: string;
  /** 送达时刻 */
  at: number;
}

interface PushLedger {
  /** 已排的（送达判断用） */
  planned: PlannedPush[];
  pushedPromiseIds: string[];
  pushedMilestones: number[];
  missYouSentFor?: string;
  opener?: PushOpener;
}

const readLedger = (): PushLedger => {
  try {
    const p = JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}') as Partial<PushLedger>;
    return { planned: p.planned ?? [], pushedPromiseIds: p.pushedPromiseIds ?? [], pushedMilestones: p.pushedMilestones ?? [], missYouSentFor: p.missYouSentFor, opener: p.opener };
  } catch {
    return { planned: [], pushedPromiseIds: [], pushedMilestones: [] };
  }
};
const writeLedger = (l: PushLedger) => {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify({ ...l, pushedPromiseIds: l.pushedPromiseIds.slice(-100) }));
  } catch { /* 存不了：最多重推一次 */ }
};

/**
 * 送达判断：排过的时刻已经过了 = 推出去了。记下推过了什么，留一个开场（多条只留最新的）。
 * 返回这次判出来的送达条目（测试 / 调试用）。
 */
export function processDeliveredPushes(now: number = Date.now()): PlannedPush[] {
  const l = readLedger();
  const delivered = l.planned.filter((p) => p.at <= now);
  if (!delivered.length) return [];
  for (const p of delivered) {
    if (p.kind === 'promise' && !l.pushedPromiseIds.includes(p.ref)) l.pushedPromiseIds.push(p.ref);
    if (p.kind === 'milestone') l.pushedMilestones = [...new Set([...l.pushedMilestones, Number(p.ref)])];
    if (p.kind === 'missyou') l.missYouSentFor = p.ref;
  }
  const last = delivered.sort((a, b) => a.at - b.at)[delivered.length - 1];
  l.opener = { kind: last.kind, ref: last.ref, at: last.at };
  l.planned = l.planned.filter((p) => p.at > now);
  writeLedger(l);
  return delivered;
}

/** 取走开场（打开助手窗口时用；48 小时内的才算，过期丢掉） */
export function takePushOpener(now: number = Date.now()): PushOpener | null {
  const l = readLedger();
  const o = l.opener;
  if (!o) return null;
  l.opener = undefined;
  writeLedger(l);
  return now - o.at <= 48 * 3600_000 ? o : null;
}

export function peekPushOpener(): PushOpener | null {
  return readLedger().opener ?? null;
}

// ── 排程 ────────────────────────────────────────────────────────

/** 平时聊天的钟点：最近 14 天里开口过的会话，开窗时刻的中位数；没有就 20:00 */
async function habitualMinute(): Promise<number> {
  try {
    const rows = (await db.navigatorSessions.toArray())
      .filter((s) => s.userSpoke)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, 14)
      .map((s) => minOfDay(new Date(s.createdAt).getTime()))
      .sort((a, b) => a - b);
    if (!rows.length) return 20 * 60;
    return rows[Math.floor(rows.length / 2)];
  } catch {
    return 20 * 60;
  }
}

/** 推送开关：缺省 = 开（用户口径：默认开）；总提醒关了就不推 */
export const assistantPushOn = (s: Settings): boolean => !!s.notificationsEnabled && s.navigatorPushEnabled !== false;

async function cancelOurs(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const { notifications } = await LocalNotifications.getPending();
    const ours = notifications.filter((n) => n.id >= PUSH_ID_BASE && n.id < PUSH_ID_BASE + 50);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  } catch { /* 静默 */ }
}

let syncing: Promise<PlannedPush[]> | null = null;

/**
 * 测试用：网页端也当作「排上了」（只记计划、不碰系统通知），好在无头浏览器里测送达和开场。
 * 生产代码从不调它——网页端没有本地通知，计划不记，就不会出现「没推过却当成推过」。
 */
let simulateScheduling = false;
export function simulatePushSchedulingForTest(on: boolean): void { simulateScheduling = on; }

/**
 * 判送达 → 重算 → 撤旧排新（幂等；与时段提醒同一个触发点）。返回这次的计划。
 */
export function syncAssistantPush(settings: Settings, now: number = Date.now()): Promise<PlannedPush[]> {
  const run = async (): Promise<PlannedPush[]> => {
    processDeliveredPushes(now);
    const l = readLedger();
    if (!assistantPushOn(settings)) {
      await cancelOurs();
      writeLedger({ ...l, planned: [] });
      return [];
    }
    let custom: NavigatorPreset[] = [];
    try { custom = await db.navigatorPresets.toArray(); } catch { /* 按内置 */ }
    const preset = resolveNavigatorPreset(settings.navigatorPresetId, custom);
    const open = (await listPromises()).filter((m) => m.status === 'active' && promisePhase(m, now) !== 'closed' && promisePhase(m, now) !== 'late');
    const together = await togetherFacts(preset.id, new Date(now));
    // 接下来 7 天里的纪念日（提过 / 推过的不算）
    const today = keyOfDate(new Date(now));
    let milestone: PushInput['milestone'] = null;
    const bondLedger = (() => { try { return JSON.parse(localStorage.getItem('velvet.navBond.v1') || '{}')[preset.id]?.milestones ?? []; } catch { return []; } })() as number[];
    for (const m of [...MILESTONES].reverse()) {
      const key = shiftKey(together.firstMet, m.days);
      const ahead = daysBetween(today, key);
      if (ahead >= 0 && ahead < PUSH_WINDOW_DAYS && !bondLedger.includes(m.days) && !l.pushedMilestones.includes(m.days) && together.chatDays > 0) {
        milestone = { days: m.days, dateKey: key };
        break;
      }
    }
    const plan = planAssistantPush({
      now,
      presetName: preset.name,
      promises: open.map((m) => ({ id: m.id, dueAt: promiseDueAt(m), expireAt: promiseExpireAt(m) })),
      pushedPromiseIds: l.pushedPromiseIds,
      milestone,
      lastOpenedAt: settings.lastOpenedAt,
      missYouSentFor: l.missYouSentFor,
      habitualMin: await habitualMinute(),
    });
    await cancelOurs();
    const canSchedule = isNative() || simulateScheduling;
    if (isNative() && plan.length) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        await LocalNotifications.schedule({
          notifications: plan.map((p) => ({
            id: p.id,
            title: p.title,
            body: p.body,
            schedule: { at: new Date(p.at), allowWhileIdle: true },
            extra: { content: 'assistant', pushKind: p.kind },
          })),
        });
      } catch (e) {
        console.warn('[navigatorPush] 排程失败', e);
      }
    }
    // 真排上了才记计划（网页端没有本地通知：不记，免得之后把没推过的当成送达）
    writeLedger({ ...readLedger(), planned: canSchedule ? plan : [] });
    return plan;
  };
  syncing = (syncing ?? Promise.resolve([] as PlannedPush[])).then(run, run).finally(() => { syncing = null; });
  return syncing;
}

// ── 开场的模板（没 Key 时；有 Key 由问候层用 AI 现场写） ─────────────────

/** 开场那件事交给 AI 问候时的说明 */
export function openerInstruction(kind: PushKind, presetName: string, detail: { topic?: string; label?: string }): string {
  const head = `【开场】你给他发过一条推送（锁屏上只写着「${presetName}有话想跟你说」），他现在进来了：第一句就说那件事——`;
  if (kind === 'promise') return `${head}问一句「${detail.topic ?? '那件事'}」的结果（只问这一句，别的晚点再说）。`;
  if (kind === 'milestone') return `${head}今天是你们认识满${detail.label ?? ''}的日子，轻轻提一句，别煽情。`;
  return `${head}你前几天说过想他了，他现在才来：先说一句惦记他、高兴他来了；别追问去哪了，别催他补记录。`;
}

const VOICE: Record<string, { promise: (rel: string, topic: string) => string; milestone: (label: string) => string; missyou: string }> = {
  'builtin-cat': {
    promise: (rel, topic) => `${rel}的${topic}怎么样了？回来跟吾辈说说。`,
    milestone: (label) => `今天是我们认识满${label}的日子。……吾辈只是顺口一说。`,
    missyou: '几天没见了。吾辈把你的位置一直留着。',
  },
  'builtin-toaster': {
    promise: (rel, topic) => `报告：阁下${rel}的${topic}已结束。本机体想知道结果。`,
    milestone: (label) => `报告：今日为本机体与阁下相识满${label}的纪念日，已写入核心记忆。`,
    missyou: '报告：已有数日未检测到阁下。本机体……有些在意。',
  },
  'builtin-bear': {
    promise: (rel, topic) => `${rel}的${topic}怎么样了熊？快跟熊说说！`,
    milestone: (label) => `今天是我们认识满${label}的日子熊！熊记得清清楚楚！`,
    missyou: '好几天没见到你了熊……熊有点想你。',
  },
};
const NEUTRAL_VOICE = {
  promise: (rel: string, topic: string) => `${rel}的${topic}怎么样了？回来跟我说说。`,
  milestone: (label: string) => `今天是我们认识满${label}的日子。`,
  missyou: '好几天没见了，有点想你。不用急，我在这儿。',
};

/** 开场的模板句（按人格口吻；自定义人格走中性） */
export function openerTemplate(kind: PushKind, presetId: string, detail: { rel?: string; topic?: string; label?: string }): string {
  const v = VOICE[presetId] ?? NEUTRAL_VOICE;
  if (kind === 'promise') return v.promise(detail.rel ?? '前两天', detail.topic ?? '那件事');
  if (kind === 'milestone') return v.milestone(detail.label ?? '');
  return v.missyou;
}
