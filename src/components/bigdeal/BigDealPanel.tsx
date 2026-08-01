/**
 * BigDealPanel — BIG DEAL 二级面板（TASKS_MERGE_PRD §4.1）。
 *
 * 首页聚合卡 / 任务页大事卡的统一落点：子步逐条打勾（发点数）、撤勾、增删子步、
 * AI 续拆、全成后手动「收官」（批4 接结算屏演出，这里先落数据 + 轻反馈）。
 * 外壳走 SheetModal 频道皮；进度弧复用 GoalArc（批5 随终端瘦身迁址）。
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { GoalArc } from '@/components/terminal/GoalArc';
import { triggerSuccessFeedback } from '@/utils/feedback';

interface Props {
  /** null = 关闭 */
  todoId: string | null;
  onClose: () => void;
}

/** 截止日语气：剩 N 天 / 今天截止 / 已过 N 天（软时限，不惩罚只提示） */
const deadlineLabel = (deadline?: string): { text: string; urgent: boolean } | null => {
  if (!deadline) return null;
  const today = new Date(toLocalDateKey() + 'T00:00:00');
  const target = new Date(deadline + 'T00:00:00');
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days > 0) return { text: `截止还剩 ${days} 天`, urgent: days <= 2 };
  if (days === 0) return { text: '今天截止', urgent: true };
  return { text: `已过截止 ${-days} 天 · 完成都算数`, urgent: false };
};

export const BigDealPanel = ({ todoId, onClose }: Props) => {
  const { todos, settings, completeTodoStep, undoTodoStep, addTodoStep, removeTodoStep, collapseBigDeal, decomposeBigDealAI } = useAppStore();
  const todo = todoId ? todos.find(t => t.id === todoId) : undefined;
  const [newStep, setNewStep] = useState('');
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [collapsing, setCollapsing] = useState(false);

  const steps = todo?.steps ?? [];
  const done = steps.filter(s => s.done).length;
  const allDone = steps.length > 0 && done >= steps.length;
  const cleared = !!todo?.clearedActivityId;
  const dl = deadlineLabel(todo?.deadline);
  const attrName = (id?: string) => (id ? settings.attributeNames?.[id as keyof typeof settings.attributeNames] ?? id : '');

  const tick = async (stepId: string) => {
    if (!todo || busyStepId) return;
    setBusyStepId(stepId);
    try {
      const r = await completeTodoStep(todo.id, stepId);
      // 末步收官的演出由全局 BigDealClearCutIn 承担（store.bigDealClear 载荷），这里只给普通勾选反馈
      if (r && !r.collapsed) triggerSuccessFeedback();
    } finally {
      setBusyStepId(null);
    }
  };

  const untick = async (stepId: string) => {
    if (!todo || busyStepId || cleared) return;
    setBusyStepId(stepId);
    try {
      await undoTodoStep(todo.id, stepId);
    } finally {
      setBusyStepId(null);
    }
  };

  const addStep = async () => {
    const title = newStep.trim();
    if (!todo || !title) return;
    await addTodoStep(todo.id, title);
    setNewStep('');
  };

  const runAI = async () => {
    if (!todo || aiBusy) return;
    setAiBusy(true);
    setNotice(null);
    try {
      const list = await decomposeBigDealAI(todo.id);
      if (list.length === 0) {
        setNotice('AI 这次没拆出新步。手写一条也行');
      } else {
        for (const t of list) await addTodoStep(todo.id, t, { source: 'ai' });
        setNotice(`AI 续拆了 ${list.length} 条——不合适的直接删`);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'AI 没接通，手写一条也行');
    } finally {
      setAiBusy(false);
    }
  };

  const collapse = async () => {
    if (!todo || collapsing) return;
    setCollapsing(true);
    try {
      // 演出交给全局 BigDealClearCutIn（store 载荷触发）
      await collapseBigDeal(todo.id);
    } finally {
      setCollapsing(false);
    }
  };

  return (
    <SheetModal isOpen={!!todo} onClose={onClose} position="bottom" title={todo?.title ?? ''}>
      {todo && (
        <div className="space-y-4">
          {/* 头部：进度弧 + 状态行 */}
          <div className="flex items-center gap-3">
            <GoalArc done={done} total={Math.max(1, steps.length)} size={46} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-gray-800 dark:text-white">
                {done} / {steps.length} 步
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">BIG DEAL</span>
                {cleared && <span className="ml-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">已收官</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                <span>{attrName(todo.attribute)} · 每步 +{todo.points}</span>
                {dl && (
                  <span className={dl.urgent ? 'font-bold text-red-500' : ''}>{dl.text}</span>
                )}
              </div>
              {todo.currentState && (
                <p className="mt-1 truncate text-[11px] text-gray-400 dark:text-gray-500">现状：{todo.currentState}</p>
              )}
            </div>
          </div>

          {/* 子步清单 */}
          <div className="space-y-1.5">
            {steps.map(s => (
              <div key={s.id} className="flex items-center gap-2.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.85 }}
                  disabled={!!busyStepId || cleared || (!s.done && !todo.isActive)}
                  onClick={() => (s.done ? void untick(s.id) : void tick(s.id))}
                  aria-label={s.done ? '撤销这一步' : '完成这一步'}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    s.done
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-300 text-transparent dark:border-gray-600'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </motion.button>
                <span className={`min-w-0 flex-1 text-sm ${s.done ? 'text-gray-400 line-through dark:text-gray-600' : 'text-gray-700 dark:text-gray-200'}`}>
                  {s.title}
                  {s.attribute && s.attribute !== todo.attribute && (
                    <span className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">{attrName(s.attribute)}</span>
                  )}
                  {s.source === 'ai' && <span className="ml-1 text-[10px] text-gray-300 dark:text-gray-600">AI</span>}
                </span>
                {!s.done && !cleared && (
                  <button
                    type="button"
                    aria-label="删除子步"
                    onClick={() => void removeTodoStep(todo.id, s.id)}
                    className="shrink-0 rounded p-1 text-gray-300 hover:text-red-400 dark:text-gray-600"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {steps.length === 0 && (
              <p className="py-2 text-center text-sm text-gray-400 dark:text-gray-500">还没有子步——先拆第一步</p>
            )}
          </div>

          {/* 追加子步 + AI 续拆（收官后只读） */}
          {!cleared && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void addStep(); }}
                  placeholder="追加一个够得着的小步…"
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => void addStep()}
                  disabled={!newStep.trim()}
                  className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  添加
                </button>
              </div>
              <button
                type="button"
                onClick={() => void runAI()}
                disabled={aiBusy}
                className="rounded-full border border-primary/40 px-3 py-1 text-xs font-bold text-primary disabled:opacity-45"
              >
                {aiBusy ? '正在续拆…' : '✦ AI 续拆下一组'}
              </button>
            </div>
          )}

          {notice && <p className="text-xs font-medium text-primary">{notice}</p>}

          {/* 全成未收官（迁移存量 / 收官被中断）→ 手动收官 */}
          {allDone && !cleared && (
            <button
              type="button"
              onClick={() => void collapse()}
              disabled={collapsing}
              className="w-full rounded-xl bg-primary py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {collapsing ? '结算中…' : `收官 · 领取奖励（SP +${Math.min(20, steps.length * 3)}）`}
            </button>
          )}
        </div>
      )}
    </SheetModal>
  );
};
