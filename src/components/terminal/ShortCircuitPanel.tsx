/**
 * ShortCircuitPanel — F3 短路决策（PRD F3.3，Batch 2）。
 *
 * 当用户被「今天该做什么」压垮时：
 *   1. 候选池 = 活跃子愿望 + 未完成待办。
 *   2. 「替我决定」随机替他拣一件（短路）；或「我自己选」从池子里挑。
 *   3. 拆解为「最小第一步」——在线 store.decomposeStepAI，无 Key 走 terminalSkin 离线模板。
 *   4. 输出一句温柔而有力的行动指令。
 *
 * 「接受 · 落成 24h 限时任务」为 Batch 3 接（此处占位）。皮肤随主题切换。
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { terminalSkin, minimalStep, pickEncourage } from '@/utils/terminalSkin';
import type { AttributeId } from '@/types';

interface Candidate {
  kind: 'wish' | 'todo';
  id: string;
  title: string;
  attribute?: AttributeId;
  note?: string;
}

type Phase = 'idle' | 'decomposing' | 'result';

export const ShortCircuitPanel = () => {
  const { wishes, todos, todoCompletions, getDueTodosToday, getTodayTodoProgress, decomposeStepAI, createTerminalTask, getActiveTerminalTask, user, settings } = useAppStore();
  const skin = terminalSkin(user?.theme);
  const activeTask = getActiveTerminalTask();
  const attrName = (id: AttributeId) => settings.attributeNames?.[id] ?? id;

  // 候选池：活跃子愿望 + 今日「应做」且未完成的待办（与全站今日任务口径一致）
  const pool = useMemo<Candidate[]>(() => {
    const fromWishes: Candidate[] = wishes
      .filter((w) => w.parentId && w.status === 'active')
      .map((w) => ({ kind: 'wish', id: w.id, title: w.title, attribute: w.attribute, note: w.note }));
    const fromTodos: Candidate[] = getDueTodosToday()
      .filter((t) => !getTodayTodoProgress(t.id).isComplete)
      .map((t) => ({ kind: 'todo', id: t.id, title: t.title, attribute: t.attribute }));
    return [...fromWishes, ...fromTodos];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishes, todos, todoCompletions]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [step, setStep] = useState('');
  const [usedAI, setUsedAI] = useState(false);
  const [encourage, setEncourage] = useState('');

  const runDecompose = async (cand: Candidate) => {
    setChosen(cand);
    setPhase('decomposing');
    let text = '';
    let ai = false;
    try {
      text = await decomposeStepAI(cand.title, cand.note);
      if (text) ai = true;
    } catch {
      /* 无 Key / 失败 → 离线模板兜底 */
    }
    if (!text) text = minimalStep(skin, cand.title);
    setStep(text);
    setUsedAI(ai);
    setEncourage(pickEncourage(skin));
    setPhase('result');
  };

  const decideForMe = () => {
    if (pool.length === 0) return;
    runDecompose(pool[Math.floor(Math.random() * pool.length)]);
  };
  const chooseCandidate = (c: Candidate) => {
    setPicking(false);
    runDecompose(c);
  };
  const reset = () => {
    setPhase('idle');
    setChosen(null);
    setStep('');
  };
  const redo = () => {
    if (chosen) runDecompose(chosen);
  };
  const accept = async () => {
    if (!chosen) return;
    // wish 来源 → 找父终极目标作叙事标题
    let goalTitle: string | undefined;
    if (chosen.kind === 'wish') {
      const sub = wishes.find((w) => w.id === chosen.id);
      if (sub?.parentId) goalTitle = wishes.find((w) => w.id === sub.parentId)?.title;
    }
    const created = await createTerminalTask({
      stepTitle: step,
      sourceKind: chosen.kind,
      sourceId: chosen.id,
      attribute: chosen.attribute,
      goalTitle,
    });
    if (created) reset(); // 活跃任务卡会在面板外显示
  };

  const empty = pool.length === 0;

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-primary/[0.03] p-4 dark:from-primary/15">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
        <span className="text-xs font-bold tracking-wide text-primary">短路决策</span>
        <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">{skin.label}</span>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {activeTask ? (
              <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                你已经有一个进行中的限时任务，先把它完成吧。
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {empty ? skin.emptyPool : skin.decideHint}
                </p>
                <div className="flex flex-wrap gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={decideForMe}
                    disabled={empty}
                    className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 disabled:opacity-40"
                  >
                    {skin.decideHero}
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setPicking(true)}
                    disabled={empty}
                    className="rounded-xl border border-primary/40 px-4 py-3 text-sm font-medium text-primary disabled:opacity-40"
                  >
                    {skin.decideSelf}
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {phase === 'decomposing' && (
          <motion.div
            key="decomposing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500 dark:text-gray-400"
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {skin.decomposing}
          </motion.div>
        )}

        {phase === 'result' && chosen && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
                {chosen.kind === 'wish' ? '子愿望' : '待办'}
              </span>
              <span className="min-w-0 truncate">{chosen.title}</span>
            </div>
            <div className="text-[11px] font-medium text-primary">{skin.stepLead}</div>
            <p className="mt-1 text-lg font-bold leading-snug text-gray-900 dark:text-white">{step}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500">{encourage}</span>
              <span className="ml-auto text-[10px] text-gray-300 dark:text-gray-600">
                {usedAI ? 'AI 拆解' : '离线模板'}
              </span>
            </div>

            {/* 接受 → 落成 24h 限时任务 */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={accept}
              className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/30"
            >
              {skin.accept}
            </motion.button>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                {skin.again}
              </button>
              <button
                type="button"
                onClick={redo}
                className="flex-1 rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                {skin.redo}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 候选选择器 */}
      <SheetModal isOpen={picking} onClose={() => setPicking(false)} position="center" title={skin.pickTitle}>
        {empty ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{skin.emptyPool}</div>
        ) : (
          <div className="space-y-1.5">
            {pool.map((c) => (
              <button
                key={`${c.kind}-${c.id}`}
                type="button"
                onClick={() => chooseCandidate(c)}
                className="flex w-full items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-left text-sm text-gray-800 transition hover:border-primary/50 hover:bg-primary/5 dark:border-gray-700 dark:text-gray-100"
              >
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {c.kind === 'wish' ? '子愿望' : '待办'}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {c.attribute && (
                  <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                    {attrName(c.attribute)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </SheetModal>
    </div>
  );
};
