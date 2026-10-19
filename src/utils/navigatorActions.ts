/**
 * navigatorActions — 助手替你做过的事：操作日志 + 撤销 + 幂等（第 28 批 · G2）。
 *
 * 以前卡片确认 = `executeDraft(draft)` 直接落库，防连点只靠界面的 busy 状态，做错了只能自己去翻着删。现在：
 *   · 每张卡一个 action_id（= 卡片消息 id）：`runCardAction` 先查日志表，已经执行过的直接回存好的回执，
 *     不再执行第二遍（连点 / 重试 / 刷新后再点都安全）；同一张卡并发中的也挡住。
 *   · 执行成功才写日志行（失败不写，重试会再执行——这是对的）；行里带撤销要用的改前值。
 *   · 撤销：回执旁「撤销」10 分钟内有效——记录删掉（点数扣回、配图一起删）、任务删掉（做过就归档）、记账删掉（奖励回滚）、
 *     完成撤回、改动还原、「记住」的删掉、「忘掉」的恢复。撤销后卡片标「已撤销」、实录写【已撤销】。
 *   · 记事本「它替你做过的事」列最近 50 条。
 * 日志表 `navigatorActions` 是本机表：不上云、不进主备份；「清空数据」清。
 */
import { create } from 'zustand';
import { db } from '@/db';
import { useAppStore } from '@/store';
import { ACTION_META, buildPreviewLines, executeDraftDetailed, type NavigatorDraft, type UndoSpec } from '@/utils/navigatorRegistry';
import type { NavigatorActionRow, Todo } from '@/types';

/** 回执旁「撤销」的有效期 */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

interface State { rows: Record<string, NavigatorActionRow> }
export const useNavigatorActions = create<State>(() => ({ rows: {} }));

const cache = (row: NavigatorActionRow) => useNavigatorActions.setState((s) => ({ rows: { ...s.rows, [row.id]: row } }));

/** 组件订阅某张卡的日志行（没有就 undefined；卡从库里恢复出来的要先 hydrateAction） */
export const useActionRow = (id: string | null | undefined): NavigatorActionRow | undefined =>
  useNavigatorActions((s) => (id ? s.rows[id] : undefined));

const hydrating = new Set<string>();
/** 从库里把一张卡的日志行读进缓存（卡片从库恢复时用；读不到就算了） */
export async function hydrateAction(id: string): Promise<NavigatorActionRow | undefined> {
  const cached = useNavigatorActions.getState().rows[id];
  if (cached) return cached;
  if (hydrating.has(id)) return undefined;
  hydrating.add(id);
  try {
    const row = await db.navigatorActions.get(id);
    if (row) cache(row);
    return row;
  } catch {
    return undefined;
  } finally {
    hydrating.delete(id);
  }
}

export const canUndo = (row: NavigatorActionRow | undefined, now: number = Date.now()): boolean =>
  !!row && !row.undoneAt && !!row.undoJson && now - row.createdAt <= UNDO_WINDOW_MS;

const inFlight = new Set<string>();

/**
 * 执行一张卡（幂等）：日志里已有且没撤销 → 直接回存好的回执；并发中的同一张卡 → 等它。
 * 返回 reused = true 表示这次没真的执行。
 */
export async function runCardAction(
  card: { id: string; draft: NavigatorDraft },
  ctx: { sessionId?: string; presetId?: string } = {},
): Promise<{ receipt: string; reused: boolean }> {
  const existing = (await db.navigatorActions.get(card.id).catch(() => undefined)) ?? useNavigatorActions.getState().rows[card.id];
  if (existing && !existing.undoneAt) { cache(existing); return { receipt: existing.receipt, reused: true }; }
  if (inFlight.has(card.id)) {
    // 同一张卡正在执行：等它写完日志再回那份回执（连点第二下落到这里）
    for (let i = 0; i < 100 && inFlight.has(card.id); i++) await new Promise((r) => setTimeout(r, 100));
    const done = useNavigatorActions.getState().rows[card.id];
    if (done && !done.undoneAt) return { receipt: done.receipt, reused: true };
    throw new Error('上一次还没执行完，稍等一下');
  }
  inFlight.add(card.id);
  try {
    const { receipt, undo } = await executeDraftDetailed(card.draft, { cardId: card.id });
    const row: NavigatorActionRow = {
      id: card.id,
      sessionId: ctx.sessionId,
      presetId: ctx.presetId,
      kind: card.draft.kind,
      label: ACTION_META[card.draft.kind].label,
      summary: buildPreviewLines(card.draft).slice(0, 2).join('；').slice(0, 120),
      draftJson: JSON.stringify(card.draft),
      undoJson: undo ? JSON.stringify(undo) : undefined,
      receipt,
      createdAt: Date.now(),
    };
    try { await db.navigatorActions.put(row); } catch (e) { console.warn('[navigator] 操作日志没写上', e); }
    cache(row);
    return { receipt, reused: false };
  } finally {
    inFlight.delete(card.id);
  }
}

/** 把改前值写回去；返回给用户看的一句话 */
async function applyUndo(spec: UndoSpec): Promise<string> {
  const s = useAppStore.getState();
  switch (spec.kind) {
    case 'activity': {
      const exists = s.activities.some((a) => a.id === spec.activityId);
      if (exists) await s.deleteActivity(spec.activityId);
      return exists ? '那条记录删掉了，点数已扣回。' : '那条记录已经不在了。';
    }
    case 'todo': {
      const t = s.todos.find((x) => x.id === spec.todoId);
      if (!t) return '那条任务已经不在了。';
      const done = await db.todoCompletions.where('todoId').equals(spec.todoId).count();
      if (done > 0 || t.completedAt) { await s.updateTodo(spec.todoId, { isActive: false }); return `「${t.title}」做过了，所以收进归档而不是删掉。`; }
      await s.deleteTodo(spec.todoId);
      return `「${t.title}」删掉了。`;
    }
    case 'ledger': {
      const exists = s.ledgerEntries.some((e) => e.id === spec.entryId);
      if (exists) await s.deleteLedgerEntry(spec.entryId);
      return exists ? '那笔账删掉了，奖励已回滚。' : '那笔账已经不在了。';
    }
    case 'completeTodo': {
      await s.undoTodayTodoCompletion(spec.todoId);
      return '完成撤回了，点数已扣回。';
    }
    case 'editTodo': {
      const t = s.todos.find((x) => x.id === spec.todoId);
      if (!t) return '那条任务已经不在了。';
      // null = 原来没有这个字段：写回 undefined（Dexie update 会把它清掉）
      const before = Object.fromEntries(Object.entries(spec.before).map(([k, v]) => [k, v === null ? undefined : v])) as Partial<Todo>;
      await s.updateTodo(spec.todoId, before);
      return `「${t.title}」改回原来的样子了。`;
    }
    case 'memoDelete': {
      await db.navigatorMemos.delete(spec.memoId);
      return '那条记忆删掉了。';
    }
    case 'memoRestore': {
      const m = await db.navigatorMemos.get(spec.memoId);
      if (!m) return '那条记忆已经不在了。';
      await db.navigatorMemos.update(spec.memoId, { status: 'active', muted: spec.before.muted ?? false, pinned: spec.before.pinned ?? false, invalidAt: undefined });
      return '那条记忆恢复了。';
    }
  }
}

/** 撤销一张卡的执行（10 分钟内；日志行记 undoneAt） */
export async function undoCardAction(id: string): Promise<{ ok: boolean; message: string }> {
  const row = (await hydrateAction(id)) ?? useNavigatorActions.getState().rows[id];
  if (!row) return { ok: false, message: '找不到这次操作的记录。' };
  if (row.undoneAt) return { ok: false, message: '已经撤销过了。' };
  if (!row.undoJson) return { ok: false, message: '这一步没法撤销。' };
  if (Date.now() - row.createdAt > UNDO_WINDOW_MS) return { ok: false, message: '超过 10 分钟了，去对应的页面里改吧。' };
  try {
    const spec = JSON.parse(row.undoJson) as UndoSpec;
    const message = await applyUndo(spec);
    const updated: NavigatorActionRow = { ...row, undoneAt: Date.now() };
    try { await db.navigatorActions.put(updated); } catch { /* 记不上也先按撤销算 */ }
    cache(updated);
    return { ok: true, message };
  } catch (e) {
    const err = e instanceof Error ? e.message : '撤销失败';
    const updated: NavigatorActionRow = { ...row, undoError: err };
    try { await db.navigatorActions.put(updated); } catch { /* ignore */ }
    cache(updated);
    return { ok: false, message: `没撤成：${err}` };
  }
}

/** 记事本「它替你做过的事」：最近 N 条（新的在前） */
export async function listActions(limit = 50): Promise<NavigatorActionRow[]> {
  try {
    const rows = await db.navigatorActions.orderBy('createdAt').reverse().limit(limit).toArray();
    for (const r of rows) cache(r);
    return rows;
  } catch {
    return [];
  }
}
