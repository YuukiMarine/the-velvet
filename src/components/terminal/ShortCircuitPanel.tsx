/**
 * ShortCircuitPanel — F3 短路决策（PRD F3.3）的「逻辑容器」。
 *
 * 当用户被「今天该做什么」压垮时：
 *   1. 候选池 = 活跃子愿望 + 未完成待办。
 *   2. 「替我决定」随机替他拣一件（短路）；或「我自己选」从池子里挑。
 *   3. 拆解为「最小第一步」——在线 store.decomposeStepAI，无 Key 走 terminalSkin 离线模板。
 *   4. 输出一句温柔而有力的行动指令 → 接受 · 落成 24h 限时任务。
 *
 * 阶段 2 拆分：本文件只持有状态机 / store 交互 / 洗牌演出，构造 view-model 后委派给
 * 频道表现层（thief = 怪盗作战台 / 其余 = 通用皮肤）。候选选择器为三频道共用（generic）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic, triggerThemeSwitchFeedback } from '@/utils/feedback';
import { terminalSkin, terminalChannel, minimalStep, pickEncourage } from '@/utils/terminalSkin';
import type { TerminalSkin } from '@/utils/terminalSkin';
import type { AttributeId } from '@/types';
import { ShortCircuitDefault } from './ShortCircuitDefault';
import { ShortCircuitThief } from './ShortCircuitThief';
import { ShortCircuitBoard } from './ShortCircuitBoard';
import { ShortCircuitTV } from './ShortCircuitTV';

export interface Candidate {
  kind: 'wish' | 'todo';
  id: string;
  title: string;
  attribute?: AttributeId;
  note?: string;
}

export type Phase = 'idle' | 'shuffling' | 'decomposing' | 'result';

/** 频道表现层的 view-model：状态机产出 + 操作回调，皮肤组件只读它渲染 */
export interface ShortCircuitVM {
  skin: TerminalSkin;
  bold: boolean;
  phase: Phase;
  empty: boolean;
  hasActiveTask: boolean;
  chosen: Candidate | null;
  shuffleText: string;
  step: string;
  usedAI: boolean;
  encourage: string;
  decideForMe: () => void;
  openPick: () => void;
  accept: () => void | Promise<void>;
  reset: () => void;
  redo: () => void;
}

export const ShortCircuitPanel = () => {
  const { wishes, todos, todoCompletions, getDueTodosToday, getTodayTodoProgress, decomposeStepAI, createTerminalTask, getActiveTerminalTask, user, settings } = useAppStore();
  const skin = terminalSkin(user?.theme);
  const channel = terminalChannel(user?.theme);
  const bold = useBoldness();
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
  const [shuffleText, setShuffleText] = useState('');
  const shuffleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载/重置时清掉洗牌定时器，避免泄漏与已卸载 setState
  useEffect(() => () => { if (shuffleTimer.current) clearTimeout(shuffleTimer.current); }, []);

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
    if (phase !== 'idle' || pool.length === 0) return; // 重入守卫：洗牌/拆解中不再受理
    const cand = pool[Math.floor(Math.random() * pool.length)];
    // D0 / 候选太少 → 直接拆，不演出
    if (!bold || pool.length < 2) {
      runDecompose(cand);
      return;
    }
    // 短路决策演出：候选高速洗牌 → 减速 → 咔地定格在被拣中的一件 → 进入拆解
    if (shuffleTimer.current) clearTimeout(shuffleTimer.current); // 启动前必清旧链，杜绝并发
    setChosen(cand);
    setPhase('shuffling');
    const titles = pool.map((p) => p.title);
    setShuffleText(titles[Math.floor(Math.random() * titles.length)]);
    const delays = [50, 65, 85, 115, 160, 230]; // 递增 = 减速
    let i = 0;
    const tick = () => {
      if (i >= delays.length) {
        setShuffleText(cand.title); // 定格在被拣中的
        triggerLightHaptic();
        triggerThemeSwitchFeedback(user?.theme ?? 'blue'); // 频道锁定声
        shuffleTimer.current = setTimeout(() => runDecompose(cand), 380); // 聚光停留后拆解
        return;
      }
      setShuffleText(titles[Math.floor(Math.random() * titles.length)]);
      shuffleTimer.current = setTimeout(tick, delays[i++]);
    };
    // 等 shuffling 块挂载（idle 退场 ~0.12s）后再开始循环，避免开场快帧被 exit 吞掉
    shuffleTimer.current = setTimeout(tick, 150);
  };
  const chooseCandidate = (c: Candidate) => {
    setPicking(false);
    runDecompose(c);
  };
  const reset = () => {
    if (shuffleTimer.current) clearTimeout(shuffleTimer.current);
    setPhase('idle');
    setChosen(null);
    setStep('');
  };
  const redo = () => {
    if (phase !== 'result' || !chosen) return; // 重入守卫：result 退场窗口内防二次拆解
    runDecompose(chosen);
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

  const vm: ShortCircuitVM = {
    skin,
    bold,
    phase,
    empty,
    hasActiveTask: !!activeTask,
    chosen,
    shuffleText,
    step,
    usedAI,
    encourage,
    decideForMe,
    openPick: () => setPicking(true),
    accept,
    reset,
    redo,
  };

  return (
    <>
      {/* 屏幕阅读器播报：拆解中 / 拆出的「最小第一步」——四路频道共用（表现层装饰不可达 SR） */}
      <div role="status" aria-live="polite" className="sr-only">
        {phase === 'decomposing' ? skin.decomposing : phase === 'result' && chosen ? `${skin.stepLead}${step}` : ''}
      </div>

      {channel === 'thief' ? <ShortCircuitThief vm={vm} /> : channel === 'board' ? <ShortCircuitBoard vm={vm} /> : channel === 'tv' ? <ShortCircuitTV vm={vm} /> : <ShortCircuitDefault vm={vm} />}

      {/* 候选选择器（频道共用；终端房间皆暗底 → 强制暗色弹窗） */}
      <SheetModal isOpen={picking} onClose={() => setPicking(false)} position="center" title={skin.pickTitle} forceDark>
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
    </>
  );
};
