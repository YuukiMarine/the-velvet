/**
 * pactSync —— 一起进步（v2.7.0.6）的本地对账：把服务器上的约定落到本机。
 *
 * loadSocial（登录 / 切前台 / 手动刷新）里跑一次 syncPacts：
 *   · 进行中的约定：本地没有对应待办就建一条（每日打卡 → 每天重复；一次性 → 普通待办）；
 *     本地已经完成、服务器没记（离线时完成的）→ 补打卡；
 *   · 到期（天数走完 / 一次性两人都完成 / 过了截止日）→ 写回 finished / expired，本地待办归档；
 *   · 被结束 / 婉拒 / 过期的 → 本地待办归档；
 *   · 在线同伴：按 pactAwards 发亲密度（事件 id 固定，重复对账不重复加）；普通好友只打卡、不涨亲密度。
 * 另有待办完成 / 撤销时的即时打卡，以及界面上发起 / 回应 / 催促 / 结束的包装。
 * 每次对账顺手把登录凭据推给后台 runner（pactBackground），App 在后台时由它弹「催一下 / 邀请」。
 * 离线或服务器报错时一律不动本地（下次对账再来）。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { useCloudStore } from '@/store/cloud';
import { db } from '@/db';
import { getUserId } from './pocketbase';
import { markNotificationRead } from './notifications';
import { configurePactRunner, pactPushEnabled } from './pactBackground';
import {
  listMyPacts, setMyDone, closePact, createPact, respondPact, nudgePact, endPact,
  pactNoticeKind, PACT_INVITE_TTL_DAYS, type CreatePactInput,
} from './coopPacts';
import {
  closingStatus, isPactLive, isPactOver, myDoneDays, myTitle, pactAwards, pactLastDay, partnerIdOf, partnerNameOf,
} from '@/utils/pactLogic';
import type { AttributeId, CoopPact, NotificationEntry } from '@/types';

// ── 本机偏好：这条约定的待办加到哪个属性、几点（各自选，不上服务器） ──────────────
const PREFS_KEY = 'velvet.pactPrefs.v1';
/** 最多两个属性：attribute 是主属性，extra 是第二个（落成待办的副奖励 extraBoosts） */
export interface PactPrefs {
  attribute: AttributeId;
  points: number;
  extra?: { attribute: AttributeId; points: number };
}
export const DEFAULT_PACT_PREFS: PactPrefs = { attribute: 'knowledge', points: 2 };
const clampPts = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

const readPrefs = (): Record<string, PactPrefs> => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Record<string, PactPrefs>; } catch { return {}; }
};
export const savePactPrefs = (pactId: string, prefs: PactPrefs): void => {
  try {
    const all = readPrefs();
    all[pactId] = prefs;
    localStorage.setItem(PREFS_KEY, JSON.stringify(all));
  } catch { /* 存不下就用默认值 */ }
};
const prefsFor = (pactId: string): PactPrefs => readPrefs()[pactId] ?? DEFAULT_PACT_PREFS;

// ── 本地待办 ─────────────────────────────────────────────────────────────────

const localTodoOf = (pactId: string) => useAppStore.getState().todos.find(t => t.pact?.id === pactId);
/** 查库而不是查内存：冷启动 / 登录拉取时内存里的 todos 可能还是空的，按内存判会再建一条 */
const localTodoInDb = async (pactId: string) => (await db.todos.toArray()).find(t => t.pact?.id === pactId);
/** 往前补打卡最多看这么多天 */
const BACKFILL_DAYS = 30;
const shiftDay = (key: string, n: number): string => { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return toLocalDateKey(d); };

/**
 * 进行中的约定：本地还没有对应待办就建一条（归档了的也算有，不重建）；云同步进行中先不建。
 * 以前待办能被手动归档：归档了、又没完成（completedAt 为空）而约定还在进行 → 放回今日任务，不然再也打不了卡（第 8 轮顺带修）。
 */
async function ensureLocalTodo(p: CoopPact, me: string): Promise<void> {
  if (useCloudStore.getState().syncStatus === 'syncing') return; // 拉取正在清表 / 重载：等下一轮
  const existing = await localTodoInDb(p.id);
  if (existing) {
    if (!existing.isActive && !existing.completedAt && p.status === 'active') {
      await useAppStore.getState().updateTodo(existing.id, { isActive: true, archivedAt: undefined });
    }
    return;
  }
  const prefs = prefsFor(p.id);
  const extra = prefs.extra && prefs.extra.attribute !== prefs.attribute ? prefs.extra : undefined;
  await useAppStore.getState().addTodo({
    title: myTitle(p, me),
    attribute: prefs.attribute,
    points: clampPts(prefs.points),
    ...(extra ? { extraBoosts: [{ attribute: extra.attribute, points: clampPts(extra.points) }] } : {}),
    frequency: 'single',
    repeatDaily: p.kind === 'daily',
    isActive: true,
    startDate: p.startDay,
    pact: { id: p.id, partnerId: partnerIdOf(p, me), partnerName: partnerNameOf(p), kind: p.kind },
  });
}

/** 约定结束：本地待办归档（不算完成、不加点） */
async function archiveLocalTodo(pactId: string): Promise<void> {
  const t = localTodoOf(pactId);
  if (!t || !t.isActive || t.archivedAt) return;
  await useAppStore.getState().updateTodo(t.id, { isActive: false });
}

/**
 * 本地完成了、服务器没记（离线时完成的）→ 补打卡。
 * 每日打卡按本地完成记录往前补最多 30 天：以前只看「今天」，离线完成、第二天才联网的那天就永远缺卡，
 * 同步天数、连续天数、期满同步率都跟着错。
 */
async function backfillCheckIn(p: CoopPact, me: string, today: string): Promise<CoopPact> {
  const t = localTodoOf(p.id);
  if (!t) return p;
  if (p.kind === 'daily') {
    if (!p.startDay) return p;
    const last = pactLastDay(p);
    const end = last && last < today ? last : today;
    const from = shiftDay(today, -BACKFILL_DAYS) < p.startDay ? p.startDay : shiftDay(today, -BACKFILL_DAYS);
    const target = t.frequency === 'count' ? (t.targetCount || 1) : 1;
    const completions = await db.todoCompletions.where('todoId').equals(t.id).toArray();
    let cur = p;
    for (let d = from; d <= end; d = shiftDay(d, 1)) {
      if (myDoneDays(cur, me).includes(d)) continue;
      const c = completions.find(x => x.date === d);
      if (!c || c.count < target) continue;
      cur = await setMyDone(cur.id, d, true);
    }
    return cur;
  }
  const mine = myDoneDays(p, me);
  if (t.completedAt && mine.length === 0) {
    return setMyDone(p.id, toLocalDateKey(new Date(t.completedAt)), true);
  }
  return p;
}

// ── 亲密度（只给在线同伴） ─────────────────────────────────────────────────────

async function applyAwards(p: CoopPact, me: string, today: string): Promise<void> {
  const partnerId = partnerIdOf(p, me);
  const confidant = useAppStore.getState().confidants.find(
    c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === partnerId,
  );
  if (!confidant) return; // 普通好友：一起打卡，不涨亲密度
  for (const a of pactAwards(p, today, p.mode === 'same' ? p.titleFrom : myTitle(p, me))) {
    if (useAppStore.getState().confidantEvents.some(e => e.id === a.eventId)) continue;
    await useAppStore.getState().bumpConfidantIntimacy(confidant.id, a.delta, 'intimacy_up', a.reason, { eventId: a.eventId });
  }
}

const upsert = (p: CoopPact) => useCloudSocialStore.getState().upsertPact(p);
const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400000);

/**
 * 同一份约定同一时间只对账一次：loadSocial 的整轮对账和「完成即打卡」的即时对账可能撞在一起，
 * 两路各自发奖会加两次（发奖本身现在也在事务里去重，这里是第一道闸）。
 */
const pactLocks = new Map<string, Promise<void>>();
async function reconcileOne(p0: CoopPact, me: string, today: string): Promise<void> {
  const prev = pactLocks.get(p0.id) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => reconcileOneInner(p0, me, today));
  pactLocks.set(p0.id, run);
  try {
    await run;
  } finally {
    if (pactLocks.get(p0.id) === run) pactLocks.delete(p0.id);
  }
}

/** 一份约定的对账（loadSocial 与打卡后都走这里） */
async function reconcileOneInner(p0: CoopPact, me: string, today: string): Promise<void> {
  let p = p0;
  if (p.status === 'pending' && daysSince(p.createdAt) >= PACT_INVITE_TTL_DAYS) {
    const closed = await closePact(p.id, 'expired');
    if (closed) { p = closed; upsert(p); }
  }
  if (p.status === 'active') {
    await ensureLocalTodo(p, me);
    const filled = await backfillCheckIn(p, me, today);
    if (filled !== p) { p = filled; upsert(p); }
    if (isPactOver(p, today)) {
      const closed = await closePact(p.id, closingStatus(p));
      if (closed) { p = closed; upsert(p); }
    }
  }
  if (!isPactLive(p)) await archiveLocalTodo(p.id);
  await applyAwards(p, me, today);
}

/** 过时的邀请（已回应 / 过期）自动标已读，免得一直挂着「响应」按钮 */
async function tidyInviteNotices(notifications: NotificationEntry[], pacts: CoopPact[]): Promise<void> {
  for (const n of notifications) {
    if (n.read || pactNoticeKind(n) !== 'pact_invite') continue;
    const p = pacts.find(x => x.id === n.payload?.pact_id);
    if (!p || p.status === 'pending') continue;
    try {
      await markNotificationRead(n.id);
      useCloudSocialStore.getState().markNotificationRead(n.id);
    } catch { /* 下次再说 */ }
  }
}

/** loadSocial 里调用：拉约定、逐份对账、收拾过时的邀请、重排提醒 */
export async function syncPacts(notifications: NotificationEntry[]): Promise<void> {
  const me = getUserId();
  if (!me) return;
  // 后台刷新（档 2）：把最新的登录凭据和「已经看到哪一条」交给后台 runner
  void configurePactRunner(notifications, pactPushEnabled(useAppStore.getState().settings));
  const listed = await listMyPacts();
  if (!listed) return; // 拉取失败：本地什么都不动
  useCloudSocialStore.getState().setPacts(listed);
  const today = toLocalDateKey();
  // 服务器上已经没有的约定（对方注销级联删除、结束超过 45 天没联网、换了账号）：本地待办归档，别一直挂着、天天提醒
  const ids = new Set(listed.map(p => p.id));
  for (const t of useAppStore.getState().todos) {
    if (!t.pact || !t.isActive || ids.has(t.pact.id)) continue;
    try {
      await useAppStore.getState().updateTodo(t.id, { isActive: false });
    } catch (err) {
      console.warn('[velvet-pact] archive orphan todo failed', t.id, err);
    }
  }
  for (const p of listed) {
    try {
      await reconcileOne(p, me, today);
    } catch (err) {
      console.warn('[velvet-pact] reconcile failed', p.id, err);
    }
  }
  await tidyInviteNotices(notifications, useCloudSocialStore.getState().pacts);
  void useAppStore.getState().syncNotifications();
}

// ── 待办完成 / 撤销：即时打卡 ───────────────────────────────────────────────────

export async function onPactTodoCompleted(pactId: string, day: string): Promise<void> {
  const me = getUserId();
  if (!me) return;
  try {
    const p = await setMyDone(pactId, day, true);
    upsert(p);
    await reconcileOne(p, me, toLocalDateKey());
  } catch (err) {
    // 离线 / 服务器报错：本地照常完成，下次对账补打卡
    console.warn('[velvet-pact] check-in failed, will backfill later', pactId, err);
  }
}

export async function onPactTodoUndone(pactId: string, day: string): Promise<void> {
  try {
    upsert(await setMyDone(pactId, day, false));
  } catch (err) {
    console.warn('[velvet-pact] undo check-in failed', pactId, err);
  }
}

// ── 界面动作 ─────────────────────────────────────────────────────────────────

export async function proposePact(input: Omit<CreatePactInput, 'today'>, prefs: PactPrefs): Promise<CoopPact> {
  const p = await createPact({ ...input, today: toLocalDateKey() }, useCloudSocialStore.getState().pacts);
  savePactPrefs(p.id, prefs);
  upsert(p);
  return p;
}

export async function answerPact(pactId: string, accept: boolean, opts: { titleTo?: string; prefs?: PactPrefs } = {}): Promise<CoopPact> {
  const me = getUserId();
  if (accept && opts.prefs) savePactPrefs(pactId, opts.prefs);
  const p = await respondPact(pactId, accept, { today: toLocalDateKey(), titleTo: opts.titleTo });
  upsert(p);
  if (accept && me) await ensureLocalTodo(p, me);
  // 这份邀请的通知标已读
  const social = useCloudSocialStore.getState();
  for (const n of social.notifications) {
    if (!n.read && pactNoticeKind(n) === 'pact_invite' && n.payload?.pact_id === pactId) {
      try { await markNotificationRead(n.id); social.markNotificationRead(n.id); } catch { /* 下次对账会收拾 */ }
    }
  }
  void useAppStore.getState().syncNotifications();
  return p;
}

export async function nudgePartner(pactId: string): Promise<CoopPact> {
  const p = await nudgePact(pactId, toLocalDateKey());
  upsert(p);
  return p;
}

export async function endPactFromUi(pactId: string): Promise<CoopPact> {
  const p = await endPact(pactId);
  upsert(p);
  await archiveLocalTodo(pactId);
  void useAppStore.getState().syncNotifications();
  return p;
}
