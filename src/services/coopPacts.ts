/**
 * 一起进步（v2.7.0.6）—— 两位好友之间的打卡约定。
 *
 * PB 集合 `coop_pacts` schema（需要在 PB Admin 手动建立）：
 *   from_user        relation → users    required   cascade-delete   发起人
 *   to_user          relation → users    required   cascade-delete   受邀人
 *   kind             text     required   (daily|once)
 *   mode             text     required   (same|different)
 *   title_from       text     required
 *   title_to         text
 *   days             number              (7|14|30；0 = 不设期限 / 一次性)
 *   deadline         text                (YYYY-MM-DD，一次性目标的截止日)
 *   start_day        text                (YYYY-MM-DD，接受当天)
 *   status           text     required   (pending|active|finished|cancelled|declined|expired)
 *   done_from        json                (发起人打卡的日子 ["YYYY-MM-DD", …])
 *   done_to          json
 *   nudge_from_day   text                (发起人最近一次催对方的日子)
 *   nudge_to_day     text
 *   message          text
 *   ended_by         relation → users
 *   created / updated  autodate
 *
 *   List/View rule:  @request.auth.id = from_user || @request.auth.id = to_user
 *   Create rule:     @request.auth.id = from_user
 *   Update rule:     @request.auth.id = from_user || @request.auth.id = to_user
 *   Delete rule:     锁定（= 仅超级管理员；不提供硬删除，结束走 status）
 *   ⚠️ PB 规则三态：锁定(null) = 仅超级管理员；解锁后留空("") = 所有人都能调，别这么设。
 *
 * 双方各只写自己那一栏（done_from / done_to、nudge_from_day / nudge_to_day）：PB 的更新按字段合并，
 * 两人同时打卡也不会互相覆盖。邀请 / 接受 / 婉拒 / 催促 / 结束的消息走 notifications 表的
 * event_logged + payload.kind —— 和 COOP 互动同步同一个办法，不用改通知类型的枚举。
 */

import type { RecordModel } from 'pocketbase';
import { pb, getUserId } from './pocketbase';
import { profileFromRecord } from './coopBonds';
import { auditText } from '@/utils/textAudit';
import type { CoopPact, NotificationEntry, PactKind, PactMode, PactStatus } from '@/types';
import { isPactLive, sideOf, theirTitle, myTitle, PACT_DAYS_OPTIONS } from '@/utils/pactLogic';

/** 邀请多少天没回应算过期 */
export const PACT_INVITE_TTL_DAYS = 3;
/** 任务名长度上限 */
export const PACT_TITLE_MAX = 30;

export type PactNoticeKind = 'pact_invite' | 'pact_accepted' | 'pact_declined' | 'pact_nudge' | 'pact_ended';
const PACT_NOTICE_KINDS: readonly string[] = ['pact_invite', 'pact_accepted', 'pact_declined', 'pact_nudge', 'pact_ended'];

/** 这条站内通知是不是一起进步的消息；是则返回种类 */
export const pactNoticeKind = (n: NotificationEntry): PactNoticeKind | null => {
  const k = n.payload?.kind;
  return n.type === 'event_logged' && typeof k === 'string' && PACT_NOTICE_KINDS.includes(k) ? (k as PactNoticeKind) : null;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const asDays = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && DAY_RE.test(x)))].sort() : [];
const PACT_STATUSES: readonly PactStatus[] = ['pending', 'active', 'finished', 'cancelled', 'declined', 'expired'];

const mapPact = (r: RecordModel, viewerId: string): CoopPact => {
  const expand = (r.expand ?? {}) as Record<string, RecordModel | undefined>;
  const fromId = r.from_user as string;
  const toId = r.to_user as string;
  const other = viewerId === fromId ? expand.to_user : expand.from_user;
  const status = PACT_STATUSES.includes(r.status as PactStatus) ? (r.status as PactStatus) : 'pending';
  return {
    id: r.id,
    fromId,
    toId,
    kind: r.kind === 'once' ? 'once' : 'daily',
    mode: r.mode === 'different' ? 'different' : 'same',
    titleFrom: (r.title_from as string | undefined) || '',
    titleTo: (r.title_to as string | undefined) || undefined,
    days: typeof r.days === 'number' ? (r.days as number) : 0,
    deadline: (r.deadline as string | undefined) || undefined,
    startDay: (r.start_day as string | undefined) || undefined,
    status,
    doneFrom: asDays(r.done_from),
    doneTo: asDays(r.done_to),
    nudgeFromDay: (r.nudge_from_day as string | undefined) || undefined,
    nudgeToDay: (r.nudge_to_day as string | undefined) || undefined,
    message: (r.message as string | undefined) || undefined,
    endedBy: (r.ended_by as string | undefined) || undefined,
    createdAt: new Date(r.created as string),
    updatedAt: new Date(r.updated as string),
    otherProfile: profileFromRecord(other),
  };
};

const requireMe = (): string => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  return me;
};

/** 给对方发一条一起进步的站内消息；失败只记日志（主操作已经成功） */
const notify = async (to: string, kind: PactNoticeKind, payload: Record<string, unknown>): Promise<void> => {
  const me = getUserId();
  if (!pb || !me) return;
  try {
    await pb.collection('notifications').create({
      user: to,
      type: 'event_logged',
      from: me,
      payload: { kind, ...payload },
      read: false,
    });
  } catch (err) {
    console.warn('[velvet-pact] notify failed', kind, err);
  }
};

/** 读一份约定的最新状态（打卡 / 催促前先读，避免拿旧数据覆盖） */
const fetchPact = async (id: string, me: string): Promise<CoopPact> => {
  const r = await pb!.collection('coop_pacts').getOne(id, { expand: 'from_user,to_user', requestKey: null });
  return mapPact(r, me);
};

/**
 * 与我相关、还有意义的约定：进行中 / 等回应的全部，结束了的留 45 天（历史与对账用）。
 * 失败返回 null（和「一条都没有」区分开，调用方别据此把本地待办归档）。
 */
export const listMyPacts = async (): Promise<CoopPact[] | null> => {
  if (!pb || !pb.authStore.isValid) return null;
  const me = getUserId();
  if (!me) return null;
  const since = new Date(Date.now() - 45 * 86400000).toISOString().replace('T', ' ');
  try {
    const records = await pb.collection('coop_pacts').getFullList({
      filter: `(from_user = "${me}" || to_user = "${me}") && (status = "pending" || status = "active" || updated >= "${since}")`,
      expand: 'from_user,to_user',
      sort: '-updated',
      requestKey: null,
    });
    return records.map(r => mapPact(r, me));
  } catch (err) {
    console.warn('[velvet-pact] listMyPacts failed', err);
    return null;
  }
};

export interface CreatePactInput {
  toId: string;
  kind: PactKind;
  mode: PactMode;
  title: string;
  /** 每日打卡天数（7/14/30，0 = 不设期限） */
  days: number;
  /** 一次性目标截止日 YYYY-MM-DD */
  deadline?: string;
  message?: string;
  today: string;
}

/** 发起约定：写一条 pending 记录，给对方发邀请 */
export const createPact = async (input: CreatePactInput, existing: CoopPact[]): Promise<CoopPact> => {
  const me = requireMe();
  const to = input.toId.trim();
  if (!to || to === me) throw new Error('对方信息缺失');
  const title = input.title.trim().slice(0, PACT_TITLE_MAX);
  if (!title) throw new Error('写一下要一起做的事');
  for (const t of [title, input.message ?? '']) {
    const audit = auditText(t);
    if (!audit.ok) throw new Error(audit.reason);
  }
  if (existing.some(p => isPactLive(p) && (p.fromId === to || p.toId === to))) {
    throw new Error('你们已经有一个进行中的约定了');
  }
  const days = input.kind === 'daily' && (PACT_DAYS_OPTIONS as readonly number[]).includes(input.days) ? input.days : 0;
  if (input.kind === 'once' && (!input.deadline || !DAY_RE.test(input.deadline) || input.deadline < input.today)) {
    throw new Error('截止日要选今天或以后');
  }
  const r = await pb!.collection('coop_pacts').create({
    from_user: me,
    to_user: to,
    kind: input.kind,
    mode: input.mode,
    title_from: title,
    days,
    deadline: input.kind === 'once' ? input.deadline : '',
    status: 'pending',
    done_from: [],
    done_to: [],
    message: input.message?.trim().slice(0, 120) || '',
  }, { expand: 'from_user,to_user', requestKey: null });
  const pact = mapPact(r, me);
  await notify(to, 'pact_invite', {
    pact_id: pact.id,
    title,
    pact_kind: pact.kind,
    mode: pact.mode,
    days: pact.days,
    deadline: pact.deadline ?? '',
    message: pact.message ?? '',
  });
  return pact;
};

/** 回应邀请：接受（不同目标时填自己的任务）/ 婉拒 */
export const respondPact = async (
  pactId: string,
  accept: boolean,
  opts: { today: string; titleTo?: string },
): Promise<CoopPact> => {
  const me = requireMe();
  const cur = await fetchPact(pactId, me);
  if (cur.toId !== me) throw new Error('这份邀请不是发给你的');
  if (cur.status !== 'pending') throw new Error('这份邀请已经不能回应了');
  let patch: Record<string, unknown>;
  if (accept) {
    const titleTo = cur.mode === 'different' ? (opts.titleTo ?? '').trim().slice(0, PACT_TITLE_MAX) : '';
    if (cur.mode === 'different' && !titleTo) throw new Error('写一下你这边要做的事');
    const audit = auditText(titleTo);
    if (!audit.ok) throw new Error(audit.reason);
    patch = { status: 'active', start_day: opts.today, ...(titleTo ? { title_to: titleTo } : {}) };
  } else {
    patch = { status: 'declined' };
  }
  const r = await pb!.collection('coop_pacts').update(pactId, patch, { expand: 'from_user,to_user', requestKey: null });
  const next = mapPact(r, me);
  await notify(cur.fromId, accept ? 'pact_accepted' : 'pact_declined', { pact_id: pactId, title: cur.titleFrom });
  return next;
};

/** 打卡 / 撤回打卡：只改自己那一栏 */
export const setMyDone = async (pactId: string, day: string, done: boolean): Promise<CoopPact> => {
  const me = requireMe();
  const cur = await fetchPact(pactId, me);
  const field = sideOf(cur, me) === 'from' ? 'done_from' : 'done_to';
  const mine = new Set(sideOf(cur, me) === 'from' ? cur.doneFrom : cur.doneTo);
  if (done === mine.has(day)) return cur;
  if (done) mine.add(day); else mine.delete(day);
  const r = await pb!.collection('coop_pacts').update(pactId, { [field]: [...mine].sort() }, { expand: 'from_user,to_user', requestKey: null });
  return mapPact(r, me);
};

/** 催一下：记下今天催过，给对方发消息 */
export const nudgePact = async (pactId: string, today: string): Promise<CoopPact> => {
  const me = requireMe();
  const cur = await fetchPact(pactId, me);
  if (cur.status !== 'active') throw new Error('约定已经结束了');
  const field = sideOf(cur, me) === 'from' ? 'nudge_from_day' : 'nudge_to_day';
  if ((sideOf(cur, me) === 'from' ? cur.nudgeFromDay : cur.nudgeToDay) === today) throw new Error('今天已经催过了');
  const r = await pb!.collection('coop_pacts').update(pactId, { [field]: today }, { expand: 'from_user,to_user', requestKey: null });
  const next = mapPact(r, me);
  const partner = cur.fromId === me ? cur.toId : cur.fromId;
  await notify(partner, 'pact_nudge', { pact_id: pactId, day: today, title: theirTitle(cur, me) });
  return next;
};

/** 结束约定（撤回邀请也走这里） */
export const endPact = async (pactId: string): Promise<CoopPact> => {
  const me = requireMe();
  const cur = await fetchPact(pactId, me);
  if (!isPactLive(cur)) return cur;
  const r = await pb!.collection('coop_pacts').update(pactId, { status: 'cancelled', ended_by: me }, { expand: 'from_user,to_user', requestKey: null });
  const next = mapPact(r, me);
  const partner = cur.fromId === me ? cur.toId : cur.fromId;
  await notify(partner, 'pact_ended', { pact_id: pactId, title: myTitle(cur, me) });
  return next;
};

/** 到期收尾（达成 / 过期）：两边谁先发现谁写，重复写同一个值无害 */
export const closePact = async (pactId: string, status: 'finished' | 'expired'): Promise<CoopPact | null> => {
  const me = requireMe();
  try {
    const cur = await fetchPact(pactId, me);
    if (!isPactLive(cur)) return cur;
    const r = await pb!.collection('coop_pacts').update(pactId, { status }, { expand: 'from_user,to_user', requestKey: null });
    return mapPact(r, me);
  } catch (err) {
    console.warn('[velvet-pact] closePact failed', pactId, err);
    return null;
  }
};
