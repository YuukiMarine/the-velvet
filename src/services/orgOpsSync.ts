/**
 * orgOpsSync —— 组织作战（v2.7.0.6 第 8 轮 · PRD §13）的本机对账与界面动作，挂在 orgSync 的整轮对账里。
 *   · 拉最近 62 天的作战 + 打卡，以及全部纪要 / 达成卡（据点经验）；
 *   · 我在名单里、还在进行中的作战：任务里建一条待办（标题 = 我的那一份，截止日 = 作战截止日）；我后来写了自己那一份 → 没完成的待办标题跟着改；
 *   · 本机完成了、服务器没记（离线时完成的）→ 补打卡；
 *   · 作战达成 / 未达成 / 取消 / 我退出了 / 我不在组织了 → 没完成的待办归档（不给分）；
 *   · 达成了：没有达成卡就用确定 id 发一张；我是做完的人 → 领奖（+6 SP，在线同伴之间 +2 亲密度，都幂等），弹一次庆祝卡。
 * 写法照 pactSync：先改本机、失败下次对账补；同一场作战同一时间只对账一次；云同步正在拉取时不建待办。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { useCloudStore } from '@/store/cloud';
import { db } from '@/db';
import { getUserId } from './pocketbase';
import {
  OrgError, cancelOperation, createCheckin, createOpCard, createOperation, deleteCheckin, listOrgBoard, listOrgLedger, listOrgOps,
} from './orgs';
import {
  ORG_OP_INTIMACY, ORG_OP_SP, ORG_OP_TODO_POINTS, buildOpCard, checkOpDraft, myOpState, normalizeOpDraft, opCardId, opCardOf, opProgress,
  orgLevelOfView, taskOf, type OpDraft, type OpProgress,
} from '@/utils/orgOps';
import type { OrgCheckin, OrgOperation, OrgView } from '@/types';

const social = () => useCloudSocialStore.getState();
const viewNow = (orgId: string): OrgView | undefined => social().orgs.find(v => v.org.id === orgId);
const putView = (v: OrgView) => social().upsertOrgView(v);

const readJson = <T,>(key: string, fallback: T): T => {
  try { return (JSON.parse(localStorage.getItem(key) || 'null') as T) ?? fallback; } catch { return fallback; }
};
const writeJson = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 存不下就算了 */ }
};

// ── 拉取 ─────────────────────────────────────────────────────────────────────

/** 拉作战 + 打卡 + 经验流水；失败就沿用本机已有的（没有就留空，界面显示「还没拉到」） */
export async function withOps(view: OrgView): Promise<OrgView> {
  const prev = viewNow(view.org.id);
  let next: OrgView = view;
  try {
    const { ops, checkins } = await listOrgOps(view.org.id);
    next = { ...next, ops, checkins, opsFailed: false };
  } catch (err) {
    console.warn('[velvet-org] list ops failed', view.org.id, err);
    next = prev?.ops ? { ...next, ops: prev.ops, checkins: prev.checkins } : { ...next, opsFailed: true };
  }
  try {
    next = { ...next, ledger: await listOrgLedger(view.org.id) };
  } catch (err) {
    console.warn('[velvet-org] list ledger failed', view.org.id, err);
    if (prev?.ledger) next = { ...next, ledger: prev.ledger };
  }
  return next;
}

// ── 本地待办 ─────────────────────────────────────────────────────────────────

const localTodoOf = (opId: string) => useAppStore.getState().todos.find(t => t.orgOp?.opId === opId);
/**
 * 查库而不是查内存：冷启动 / 登录拉取时内存里的 todos 可能还是空的，按内存判会再建一条。
 * 两台设备各建了一条、云同步之后同一场作战有两条时：留完成了的（没有就留最早的），其余没完成的收起来。
 */
async function localTodoInDb(opId: string) {
  const all = (await db.todos.toArray()).filter(t => t.orgOp?.opId === opId)
    .sort((a, b) => (a.completedAt ? 0 : 1) - (b.completedAt ? 0 : 1) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const extra of all.slice(1)) {
    if (extra.isActive && !extra.completedAt) await useAppStore.getState().updateTodo(extra.id, { isActive: false });
  }
  return all[0];
}

async function ensureOpTodo(view: OrgView, op: OrgOperation, me: string): Promise<void> {
  if (useCloudStore.getState().syncStatus === 'syncing') return; // 拉取正在清表 / 重载：等下一轮
  const task = taskOf(op, view.checkins, me).text;
  const existing = await localTodoInDb(op.id);
  if (existing) {
    // 我后来自己写了那一份：还没完成的待办标题跟着改（完成了的不动，撤销要按原标题找记录）；
    // 没完成却被收起来了（别的设备上撤销后又被归档之类）而作战还在、我也还在名单里 → 放回今日任务
    if (!existing.completedAt && (existing.title !== task || !existing.isActive)) {
      await useAppStore.getState().updateTodo(existing.id, { title: task, isActive: true, archivedAt: undefined });
    }
    return;
  }
  await useAppStore.getState().addTodo({
    title: task,
    attribute: op.attr,
    points: ORG_OP_TODO_POINTS,
    frequency: 'single',
    repeatDaily: false,
    isActive: true,
    deadline: op.deadline,
    orgOp: { orgId: view.org.id, opId: op.id, orgName: view.org.name, kind: op.kind },
  });
}

/** 作战结束 / 我退出了：没完成的待办归档（不算完成、不加点） */
async function archiveOpTodo(opId: string): Promise<void> {
  const t = localTodoOf(opId);
  if (!t || !t.isActive || t.archivedAt || t.completedAt) return;
  await useAppStore.getState().updateTodo(t.id, { isActive: false });
}

/** 本机完成了、服务器没记（离线时完成的）→ 补打卡（完成那天过了截止日就不补） */
async function backfillDone(view: OrgView, op: OrgOperation, me: string): Promise<OrgView> {
  const t = localTodoOf(op.id);
  if (!t?.completedAt) return view;
  if ((view.checkins ?? []).some(c => c.operationId === op.id && c.userId === me && c.kind === 'done')) return view;
  const day = toLocalDateKey(new Date(t.completedAt));
  if (day > op.deadline) return view;
  const made = await createCheckin(op, 'done', { day });
  return made ? withCheckin(view, made) : view;
}

const withCheckin = (v: OrgView, c: OrgCheckin): OrgView => ({ ...v, checkins: [...(v.checkins ?? []).filter(x => x.id !== c.id && !(x.operationId === c.operationId && x.userId === c.userId && x.kind === c.kind)), c] });
const withoutCheckin = (v: OrgView, id: string): OrgView => ({ ...v, checkins: (v.checkins ?? []).filter(x => x.id !== id) });

// ── 达成：达成卡 + 奖励 + 庆祝卡 ─────────────────────────────────────────────────

/** 没有达成卡就发一张（确定 id；撞了说明别人刚发，重新拉一次公告板和经验流水） */
async function ensureOpCard(view: OrgView, p: OpProgress): Promise<OrgView> {
  if (opCardOf(view, p.op.id)) return view;
  try {
    const made = await createOpCard(view.org.id, opCardId(p.op.id), buildOpCard(p, view.org.tz));
    if (made) return { ...view, posts: [made, ...(view.posts ?? [])], ledger: [...(view.ledger ?? []), made] };
    const [board, ledger] = await Promise.all([listOrgBoard(view.org.id), listOrgLedger(view.org.id)]);
    return { ...view, ...board, ledger };
  } catch (err) {
    console.warn('[velvet-org] op card failed', p.op.id, err);
    return view;
  }
}

const WIN_KEY = 'velvet.orgOpWins.v1';

/** 我做完了的达成作战：+6 SP（领过的记在战场状态里，换设备也不重复）、在线同伴之间 +2 亲密度（固定事件 id），弹一次庆祝卡 */
async function claimOpReward(view: OrgView, p: OpProgress, me: string): Promise<void> {
  const mine = p.rows.find(r => r.userId === me);
  const cardHasMe = opCardOf(view, p.op.id)?.opCard?.participants.some(x => x.userId === me);
  if (mine?.state !== 'done' && !cardHasMe) return;
  const st = useAppStore.getState();
  let sp = 0;
  const bs = st.battleState;
  if (bs && !(bs.orgOpRewards ?? []).includes(p.op.id)) {
    await st.saveBattleState({
      ...bs,
      sp: bs.sp + ORG_OP_SP,
      totalSpEarned: bs.totalSpEarned + ORG_OP_SP,
      orgOpRewards: [...(bs.orgOpRewards ?? []), p.op.id].slice(-200),
    });
    sp = ORG_OP_SP;
  }
  const partners: string[] = [];
  for (const r of p.rows) {
    if (r.userId === me || r.state !== 'done') continue;
    const cur = useAppStore.getState();
    const c = cur.confidants.find(x => x.source === 'online' && !x.archivedAt && x.linkedCloudUserId === r.userId);
    if (!c) continue; // 普通成员：一起完成，不涨亲密度
    const eventId = `org-op-${p.op.id}-${r.userId}`;
    if (cur.confidantEvents.some(e => e.id === eventId)) continue;
    try {
      await cur.bumpConfidantIntimacy(c.id, ORG_OP_INTIMACY, 'intimacy_up', `一起完成了作战「${p.op.title}」`, { eventId });
      partners.push(c.name);
    } catch (err) {
      console.warn('[velvet-org] op intimacy failed', p.op.id, err);
    }
  }
  // 庆祝卡：这台设备刚领到 SP（或者没有战场、这台设备还没弹过）才弹，每场一次
  const all = readJson<Record<string, string[]>>(WIN_KEY, {});
  const seen = new Set(all[me] ?? []);
  if (seen.has(p.op.id) || (!sp && bs)) return;
  all[me] = [...seen, p.op.id].slice(-200);
  writeJson(WIN_KEY, all);
  social().pushOrgCelebration({ kind: 'op', opId: p.op.id, orgId: view.org.id, orgName: view.org.name, title: p.op.title, opKind: p.op.kind, sp, partners });
}

// ── 对账 ─────────────────────────────────────────────────────────────────────

/** 一场作战的对账（整轮对账与完成打卡后都走这里） */
async function reconcileOneInner(view0: OrgView, op: OrgOperation, me: string): Promise<OrgView> {
  let view = view0;
  let p = opProgress(view, op);
  const state = myOpState(p, me);
  if (p.status === 'active' && state === 'todo') {
    await ensureOpTodo(view, op, me);
    view = await backfillDone(view, op, me);
    p = opProgress(view, op);
  }
  if (p.status === 'achieved' && (state === 'done' || state === 'todo')) {
    view = await ensureOpCard(view, p);
    p = opProgress(view, op);
    await claimOpReward(view, p, me);
  }
  if (p.status !== 'active' || (state !== 'todo' && state !== 'done')) await archiveOpTodo(op.id);
  return view;
}

/**
 * 同一场作战同一时间只对账一次：整轮对账、进组织页的刷新、完成打卡可能撞在一起，
 * 两路都查不到本地待办就会各建一条（测试抓到过）；排队之后后一路能查到前一路建好的。
 */
const opLocks = new Map<string, Promise<unknown>>();
async function withOpLock<T>(opId: string, fn: () => Promise<T>): Promise<T> {
  const prev = opLocks.get(opId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  opLocks.set(opId, run);
  try {
    return await run;
  } finally {
    if (opLocks.get(opId) === run) opLocks.delete(opId);
  }
}

/** 界面动作之后：拿本机最新的视图对账这一场 */
const reconcileOne = (view: OrgView, op: OrgOperation, me: string): Promise<OrgView> =>
  withOpLock(op.id, () => reconcileOneInner(viewNow(view.org.id) ?? view, op, me));

/** 整轮对账 / 刷新里调用（作战已经拉好，视图还没放回 store）：逐场排队对账 */
export async function reconcileOps(view0: OrgView): Promise<OrgView> {
  const me = getUserId();
  if (!me || !view0.ops) return view0;
  let view = view0;
  for (const op of view0.ops) {
    try {
      const cur = view;
      view = await withOpLock(op.id, () => reconcileOneInner(cur, op, me));
    } catch (err) {
      console.warn('[velvet-org] reconcile op failed', op.id, err);
    }
  }
  return view;
}

/** 整轮对账最后：本机还挂着、但已经不在任何一个组织的作战列表里的待办（组织解散 / 被请离 / 太久以前的）→ 归档 */
export async function archiveOrphanOpTodos(views: OrgView[]): Promise<void> {
  const loaded = views.filter(v => v.ops);
  if (loaded.length !== views.length) return; // 有组织没拉到作战：这轮不判，免得误归档
  const live = new Set(loaded.flatMap(v => v.ops!.map(op => op.id)));
  for (const t of useAppStore.getState().todos) {
    if (!t.orgOp || !t.isActive || t.completedAt || live.has(t.orgOp.opId)) continue;
    try {
      await useAppStore.getState().updateTodo(t.id, { isActive: false });
    } catch (err) {
      console.warn('[velvet-org] archive orphan op todo failed', t.id, err);
    }
  }
}

// ── 待办完成 / 撤销：即时打卡 ───────────────────────────────────────────────────

const findOp = (orgId: string, opId: string): { view: OrgView; op: OrgOperation } | null => {
  const view = viewNow(orgId);
  const op = view?.ops?.find(o => o.id === opId);
  return view && op ? { view, op } : null;
};

export async function onOrgOpTodoCompleted(orgId: string, opId: string, day: string): Promise<void> {
  const me = getUserId();
  if (!me) return;
  const hit = findOp(orgId, opId);
  if (!hit) return; // 本机还没拉到这个组织：下次对账补打卡
  try {
    const made = await createCheckin(hit.op, 'done', { day });
    let view = viewNow(orgId) ?? hit.view;
    if (made) view = withCheckin(view, made);
    putView(view);
    putView(await reconcileOne(view, hit.op, me));
  } catch (err) {
    // 离线 / 服务器报错：本地照常完成，下次对账补打卡
    console.warn('[velvet-org] op check-in failed, will backfill later', opId, err);
  }
}

export async function onOrgOpTodoUndone(orgId: string, opId: string): Promise<void> {
  const me = getUserId();
  if (!me) return;
  const hit = findOp(orgId, opId);
  if (!hit) return;
  // 已经达成（出了达成卡）就定下来了：服务器上的打卡不撤，免得进度板和达成卡对不上
  if (opProgress(hit.view, hit.op).status === 'achieved') return;
  const mine = (hit.view.checkins ?? []).find(c => c.operationId === opId && c.userId === me && c.kind === 'done');
  if (!mine) return;
  try {
    await deleteCheckin(mine.id);
    putView(withoutCheckin(viewNow(orgId) ?? hit.view, mine.id));
  } catch (err) {
    console.warn('[velvet-org] undo op check-in failed', opId, err);
  }
}

// ── 界面动作 ─────────────────────────────────────────────────────────────────

const mustView = (orgId: string): OrgView => {
  const v = viewNow(orgId);
  if (!v) throw new OrgError('找不到这个组织了');
  return v;
};

/** 作战区刷新（进作战区 / 点刷新） */
export async function refreshOps(orgId: string): Promise<void> {
  const v = viewNow(orgId);
  if (!v) return;
  const next = await reconcileOps(await withOps(v));
  putView(next);
  checkLevelUps([next]);
}

/** 发起作战 → 返回作战；我在名单里就顺手建好我的待办 */
export async function createOpFromUi(orgId: string, draft: OpDraft): Promise<OrgOperation> {
  const me = getUserId();
  let view = mustView(orgId);
  const d = normalizeOpDraft(draft, view.members);
  const err = checkOpDraft(d, view);
  if (err) throw new OrgError(err);
  const op = await createOperation(orgId, d);
  view = viewNow(orgId) ?? view;
  view = { ...view, ops: [...(view.ops ?? []).filter(o => o.id !== op.id), op] };
  putView(view);
  if (me) putView(await reconcileOne(view, op, me));
  return op;
}

export async function cancelOpFromUi(orgId: string, opId: string): Promise<void> {
  const op = await cancelOperation(opId);
  const view = mustView(orgId);
  putView({ ...view, ops: (view.ops ?? []).map(o => (o.id === op.id ? op : o)) });
  await archiveOpTodo(opId);
}

/** 这次不参加：写一条 out，我的待办归档 */
export async function optOutFromUi(orgId: string, opId: string): Promise<void> {
  const hit = findOp(orgId, opId);
  if (!hit) throw new OrgError('找不到了，可能已经取消');
  const made = await createCheckin(hit.op, 'out');
  if (!made) throw new OrgError('已经结束了');
  putView(withCheckin(viewNow(orgId) ?? hit.view, made));
  await archiveOpTodo(opId);
}

/** 作战里没分到子任务的我：写下 / 改写自己那一份（改写 = 删掉旧的再写） */
export async function writeMyPartFromUi(orgId: string, opId: string, text: string): Promise<void> {
  const me = getUserId();
  const hit = findOp(orgId, opId);
  if (!me || !hit) throw new OrgError('找不到了，可能已经取消');
  const old = (hit.view.checkins ?? []).find(c => c.operationId === opId && c.userId === me && c.kind === 'plan');
  if (old) {
    await deleteCheckin(old.id);
    putView(withoutCheckin(viewNow(orgId) ?? hit.view, old.id));
  }
  const made = await createCheckin(hit.op, 'plan', { text });
  if (!made) throw new OrgError('已经结束了');
  const view = withCheckin(viewNow(orgId) ?? hit.view, made);
  putView(view);
  putView(await reconcileOne(view, hit.op, me));
}

// ── 据点等级：升级时弹一次小卡（本机记着每个组织见过的最高等级；第一次见不弹）──────────────

const LEVEL_KEY = 'velvet.orgLevels.v1';
export function checkLevelUps(views: OrgView[]): void {
  const me = getUserId();
  if (!me) return;
  const all = readJson<Record<string, Record<string, number>>>(LEVEL_KEY, {});
  const mine = { ...(all[me] ?? {}) };
  let changed = false;
  for (const v of views) {
    if (!v.ledger) continue; // 经验流水没拉到：这轮不判
    const lv = orgLevelOfView(v);
    const prev = mine[v.org.id];
    if (prev !== undefined && lv.level > prev) {
      social().pushOrgCelebration({ kind: 'level', orgId: v.org.id, orgName: v.org.name, level: lv.level, mult: lv.mult });
    }
    // 记见过的最高：卡被删了等级回落、再涨回来不重复弹
    if (prev === undefined || lv.level > prev) { mine[v.org.id] = lv.level; changed = true; }
  }
  if (changed) { all[me] = mine; writeJson(LEVEL_KEY, all); }
}

// ── 作战区「看到哪儿了」（地标 / 组织入口红点）────────────────────────────────────

const OPS_SEEN_KEY = 'velvet.orgOpsSeen.v1';
export function loadOpsSeen(me: string): void {
  const map = readJson<Record<string, Record<string, string>>>(OPS_SEEN_KEY, {})[me] ?? {};
  social().setOrgOpsSeenAll(map);
}
export function markOpsSeen(orgId: string): void {
  const me = getUserId();
  if (!me) return;
  // 取「现在」和眼前最新一条的服务器时间里较晚的那个：手机时钟比服务器慢几秒时，刚看过的也别再亮
  const v = viewNow(orgId);
  const newest = Math.max(
    0,
    ...(v?.ops ?? []).map(o => o.createdAt.getTime()),
    ...[...(v?.ledger ?? []), ...(v?.posts ?? [])].filter(p => p.kind === 'operation').map(p => p.createdAt.getTime()),
  );
  const at = new Date(Math.max(Date.now(), newest)).toISOString();
  social().setOrgOpsSeen(orgId, at);
  const all = readJson<Record<string, Record<string, string>>>(OPS_SEEN_KEY, {});
  all[me] = { ...(all[me] ?? {}), [orgId]: at };
  writeJson(OPS_SEEN_KEY, all);
}
