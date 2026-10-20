/**
 * 任务的同级排序（第 31 批 · 用户需求「同级任务可以上下移动」）。
 *
 * 层级不变：BIG DEAL 恒在最上，其次重要，最后普通（PRD_V2.6 §2.1）；同一层里按 sortOrder 排。
 * 从没挪过的任务没有 sortOrder：同层里排在挪过的后面，彼此保持原来的先后（数组顺序，稳定排序）——
 * 不用排序功能的人看到的顺序一点不变。第一次在某层里挪动时，把这一层当前显示的顺序整个写成 sortOrder，再交换两格。
 * 任务页和三个首页共用这一个比较函数。sortOrder 跟着任务行走，云同步 / 备份都自然带上。
 */
import type { Todo } from '@/types';

export const todoTier = (t: Pick<Todo, 'isBigDeal' | 'important'>): number => (t.isBigDeal ? 0 : t.important ? 1 : 2);

export function compareTodos(a: Todo, b: Todo): number {
  const ta = todoTier(a), tb = todoTier(b);
  if (ta !== tb) return ta - tb;
  const sa = a.sortOrder, sb = b.sortOrder;
  if (typeof sa === 'number' && typeof sb === 'number') return sa - sb;
  if (typeof sa === 'number') return -1;
  if (typeof sb === 'number') return 1;
  return 0;
}

/** 在已经排好的列表里，这条能不能往上 / 往下挪（同层里不是第一 / 最后一个） */
export function canMoveInTier(sorted: Todo[], id: string, dir: -1 | 1): boolean {
  const t = sorted.find(x => x.id === id);
  if (!t) return false;
  const tier = sorted.filter(x => todoTier(x) === todoTier(t));
  const i = tier.findIndex(x => x.id === id);
  const j = i + dir;
  return i >= 0 && j >= 0 && j < tier.length;
}

/** 挪一格：返回这一层每条任务的新 sortOrder（间隔 10，以后插队不用重排）；挪不了返回 null */
export function reorderInTier(sorted: Todo[], id: string, dir: -1 | 1): Array<{ id: string; sortOrder: number }> | null {
  if (!canMoveInTier(sorted, id, dir)) return null;
  const t = sorted.find(x => x.id === id)!;
  const order = sorted.filter(x => todoTier(x) === todoTier(t)).map(x => x.id);
  const i = order.indexOf(id);
  const j = i + dir;
  [order[i], order[j]] = [order[j], order[i]];
  return order.map((tid, idx) => ({ id: tid, sortOrder: (idx + 1) * 10 }));
}
