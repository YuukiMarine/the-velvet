/**
 * Terminal — F3 治疗终端。
 *
 * 产品定位：不是另一套任务列表，而是「卡住时的一小步启动器」。
 * 它从用户已有待办 / 长期方向里抽一件，拆成当前能开始的小动作；
 * 完成这一步只代表启动成功，不等同于原任务完成。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { cloudEnabled } from '@/services/pocketbase';
import { listApprovedDanmaku } from '@/services/danmaku';
import { TERMINAL_DANMAKU_SEEDS } from '@/constants/terminalDanmaku';
import { PageTitle } from '@/components/PageTitle';
import { BackButton } from '@/components/BackButton';
import { SheetModal } from '@/components/SheetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getAIConfig } from '@/utils/aiClient';
import { terminalSkin } from '@/utils/terminalSkin';
import { StagnationConsole } from '@/components/terminal/StagnationConsole';
import { TerminalTaskCard } from '@/components/terminal/TerminalTaskCard';
import { DanmakuField } from '@/components/terminal/DanmakuField';
import { DanmakuCompose } from '@/components/terminal/DanmakuCompose';
import { AntechamberThief } from '@/components/terminal/AntechamberThief';
import { AntechamberBoard } from '@/components/terminal/AntechamberBoard';
import { AntechamberTV } from '@/components/terminal/AntechamberTV';
import { TerminalRoom } from '@/components/terminal/TerminalRoom';
import { TreasuryThief, TreasuryTrigger } from '@/components/terminal/TreasuryThief';
import { TreasuryBoard, TreasuryTriggerBoard } from '@/components/terminal/TreasuryBoard';
import { TreasuryTV, TreasuryTriggerTV } from '@/components/terminal/TreasuryTV';
import { P3DanmakuBar } from '@/components/terminal/p3Kit';
import type { TreasuryVM } from '@/components/terminal/TreasuryThief';
import { MicroBurst } from '@/components/terminal/MicroBurst';
import { GoalArc } from '@/components/terminal/GoalArc';
import { GoalCompletePop } from '@/components/terminal/GoalCompletePop';
import { useBoldness } from '@/utils/boldness';
import { triggerSuccessFeedback, triggerLevelFeedback } from '@/utils/feedback';
import type { AttributeId, TerminalProblemKind, Wish } from '@/types';

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const problemKindLabel = (kind?: TerminalProblemKind) => (kind === 'pressure' ? '短期压力' : '长期愿望');
const currentStatePlaceholder = (kind: TerminalProblemKind) =>
  kind === 'pressure'
    ? '压力来自哪里？最急的点是什么？现在做到哪了？'
    : '现在到哪一步了？水平如何？卡在哪里？';

interface EditorState {
  open: boolean;
  mode: 'goal' | 'sub';
  parentId?: string;
  editId?: string;
  title: string;
  note: string;
  kind: TerminalProblemKind;
  currentState: string;
  attribute?: AttributeId;
}
const closedEditor: EditorState = { open: false, mode: 'goal', title: '', note: '', kind: 'long_term', currentState: '' };

interface AIState {
  open: boolean;
  parentId: string;
  parentTitle: string;
  loading: boolean;
  error?: string;
  suggestions: { text: string; picked: boolean }[];
}
const closedAI: AIState = { open: false, parentId: '', parentTitle: '', loading: false, suggestions: [] };

export const Terminal = () => {
  const { wishes, addWish, saveWish, deleteWish, setWishStatus, decomposeWishAI, getActiveTerminalTask, completeTerminalTask, dismissTerminalTask, settings, user, setCurrentPage } =
    useAppStore();
  const activeTask = getActiveTerminalTask();
  const cloudUser = useCloudStore((s) => s.cloudUser);
  const danmakuTokens = settings.terminalDanmakuTokens ?? 0;
  const [approvedDanmaku, setApprovedDanmaku] = useState<string[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [treasuryOpen, setTreasuryOpen] = useState(false); // 启动素材库抽屉
  const [entered, setEntered] = useState(false); // 先经过玄关，点「进入」才正式进终端
  const bold = useBoldness();
  const [celebrateId, setCelebrateId] = useState<string | null>(null); // 刚完成、正在播 juice 的小步骤
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [goalCelebrate, setGoalCelebrate] = useState<{ id: string; title: string } | null>(null); // 一个方向下的小步骤全达成 → 用户决定完成或继续
  const [celebrateGoalId, setCelebrateGoalId] = useState<string | null>(null); // 正在播标题划过特效的目标
  const goalSlideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allClearSeenRef = useRef<Set<string>>(new Set());
  useEffect(() => () => {
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    if (goalSlideTimer.current) clearTimeout(goalSlideTimer.current);
  }, []);

  // 勾选小步骤：完成→done 时给即时反馈（音+触感+粒子小爆），取消则静默
  const completeSub = (sub: Wish) => {
    const next = sub.status === 'done' ? 'active' : 'done';
    setWishStatus(sub.id, next); // 自动持久化到 IndexedDB
    if (next === 'done') {
      triggerSuccessFeedback();
      setCelebrateId(sub.id);
      // 复位由本组件计时（不依赖只在 bold 下挂载的 MicroBurst.onDone）：D0 也能清态、可重复触发
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setCelebrateId(null), 600);
    }
  };
  useEffect(() => {
    if (cloudEnabled) listApprovedDanmaku().then(setApprovedDanmaku).catch(() => {});
  }, []);
  // 稳定弹幕池：只在拉取完成（approvedDanmaku 变化）时重算，避免每次重渲染让漂浮弹幕跳变
  const danmakuPool = useMemo(() => [...TERMINAL_DANMAKU_SEEDS, ...approvedDanmaku], [approvedDanmaku]);

  const skin = terminalSkin(user?.theme);
  const isDarkRoom = skin.channel === 'thief' || skin.channel === 'board' || skin.channel === 'tv'; // 暗房频道：portal 弹窗需强制暗色，与房间一致
  const hasAI = !!getAIConfig(settings);
  const attrName = (id: AttributeId) => settings.attributeNames?.[id] ?? id;

  const goals = useMemo(
    () => wishes.filter((w) => !w.parentId && w.status !== 'archived'),
    [wishes],
  );
  const subsByParent = useMemo(() => {
    const m: Record<string, Wish[]> = {};
    for (const w of wishes) {
      if (w.parentId && w.status !== 'archived') (m[w.parentId] ??= []).push(w);
    }
    return m;
  }, [wishes]);

  useEffect(() => {
    if (goalCelebrate) return;
    const allDoneIds = new Set<string>();
    for (const goal of goals) {
      if (goal.status === 'done') continue;
      const subs = subsByParent[goal.id] ?? [];
      const allDone = subs.length > 0 && subs.every((s) => s.status === 'done');
      if (!allDone) continue;
      allDoneIds.add(goal.id);
      if (allClearSeenRef.current.has(goal.id)) continue;
      allClearSeenRef.current.add(goal.id);
      triggerLevelFeedback();
      setCelebrateGoalId(goal.id);
      if (goalSlideTimer.current) clearTimeout(goalSlideTimer.current);
      goalSlideTimer.current = setTimeout(() => setCelebrateGoalId(null), 1300);
      setGoalCelebrate({ id: goal.id, title: goal.title });
      break;
    }
    allClearSeenRef.current.forEach((id) => {
      if (!allDoneIds.has(id)) allClearSeenRef.current.delete(id);
    });
  }, [goals, subsByParent, goalCelebrate]);

  const [editor, setEditor] = useState<EditorState>(closedEditor);
  const [ai, setAi] = useState<AIState>(closedAI);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Wish | null>(null);
  const [busy, setBusy] = useState(false);

  // ── 编辑器（新建 / 编辑，父级素材与小步骤共用） ──
  const openGoalEditor = () => setEditor({ ...closedEditor, open: true, mode: 'goal' });
  const openSubEditor = (parentId: string) =>
    setEditor({ ...closedEditor, open: true, mode: 'sub', parentId });
  const openEdit = (w: Wish) =>
    setEditor({
      open: true,
      mode: w.parentId ? 'sub' : 'goal',
      parentId: w.parentId,
      editId: w.id,
      title: w.title,
      note: w.note ?? '',
      kind: w.kind ?? 'long_term',
      currentState: w.currentState ?? '',
      attribute: w.attribute,
    });

  const saveEditor = async () => {
    const title = editor.title.trim();
    if (!title) return;
    setBusy(true);
    try {
      if (editor.editId) {
        const orig = wishes.find((w) => w.id === editor.editId);
        if (orig) {
          await saveWish({
            ...orig,
            title,
            note: editor.note.trim() || undefined,
            kind: editor.mode === 'goal' ? editor.kind : undefined,
            currentState: editor.mode === 'goal' ? editor.currentState.trim() || undefined : undefined,
            attribute: editor.attribute,
          });
        }
      } else {
        await addWish({
          title,
          parentId: editor.parentId,
          note: editor.note.trim() || undefined,
          kind: editor.mode === 'goal' ? editor.kind : undefined,
          currentState: editor.mode === 'goal' ? editor.currentState.trim() || undefined : undefined,
          attribute: editor.attribute,
          source: 'manual',
        });
      }
      setEditor(closedEditor);
    } finally {
      setBusy(false);
    }
  };

  // ── AI 拆分 ──
  const runAI = async (goal: Wish) => {
    setAi({ open: true, parentId: goal.id, parentTitle: goal.title, loading: true, suggestions: [] });
    try {
      const list = await decomposeWishAI(goal, subsByParent[goal.id] ?? []);
      if (list.length === 0) {
        setAi((s) => ({ ...s, loading: false, error: 'AI 这次没拆出能用的小步骤。换个说法，或自己加一条吧' }));
        return;
      }
      setAi((s) => ({ ...s, loading: false, suggestions: list.map((text) => ({ text, picked: true })) }));
    } catch (e) {
      setAi((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'AI 拆分没成功' }));
    }
  };
  const addPicked = async () => {
    const picked = ai.suggestions.filter((s) => s.picked);
    if (picked.length === 0) {
      setAi(closedAI);
      return;
    }
    setBusy(true);
    try {
      for (const s of picked) {
        await addWish({ title: s.text, parentId: ai.parentId, source: 'ai' });
      }
      setAi(closedAI);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteWish(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const finishCelebratedGoal = async () => {
    if (!goalCelebrate) return;
    const id = goalCelebrate.id;
    setGoalCelebrate(null);
    await setWishStatus(id, 'done');
  };

  const continueCelebratedGoal = () => {
    if (!goalCelebrate) return;
    const goal = goals.find((g) => g.id === goalCelebrate.id);
    setGoalCelebrate(null);
    if (!goal) return;
    if (hasAI) {
      void runAI(goal);
    } else {
      openSubEditor(goal.id);
    }
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const isEmpty = goals.length === 0;

  // 玄关：点入口先落在这间房间，点「进入」才正式进终端。三频道各有专属皮肤：
  // 红=怪盗 P5 剪报 / 蓝·粉=千禧 BBS 论坛 / 黄=P4 综艺 CRT 电视频道。
  if (!entered) {
    const enterProps = { onEnter: () => setEntered(true), onBack: () => setCurrentPage('dashboard') };
    if (skin.channel === 'thief') return <AntechamberThief skin={skin} {...enterProps} />;
    if (skin.channel === 'board') return <AntechamberBoard skin={skin} danmakuPool={danmakuPool} {...enterProps} />;
    return <AntechamberTV skin={skin} danmakuPool={danmakuPool} {...enterProps} />; // tv(黄)
  }

  // ── 共享原子块（两套外壳复用） ──
  const activeCard = activeTask ? (
    <div className="mb-5">
      <TerminalTaskCard
        card={activeTask}
        onComplete={() => completeTerminalTask(activeTask.id)}
        onDismiss={() => dismissTerminalTask(activeTask.id)}
      />
    </div>
  ) : null;

  const danmakuBtn =
    cloudEnabled && cloudUser && danmakuTokens > 0 ? (
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setComposeOpen(true)}
        className="mb-5 flex w-full items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-left dark:bg-primary/10"
      >
        <span className="text-base">✦</span>
        <span className="flex-1 text-sm font-medium text-primary">
          你攒了 {danmakuTokens} 次回应机会 · 写一句话，送给同样卡住的人
        </span>
        <span className="text-primary/50">›</span>
      </motion.button>
    ) : null;

  // 停滞记忆 view-model（抽屉复用全部目标逻辑，作为后台记忆入口）
  const treasuryVM: TreasuryVM = {
    goals, subsByParent, collapsed, celebrateId, celebrateGoalId, bold, hasAI, attrName,
    toggleCollapse, completeSub, openEdit, openGoalEditor, openSubEditor, runAI, setDeleteTarget,
  };
  const totalSubs = goals.reduce((n, g) => n + (subsByParent[g.id]?.length ?? 0), 0);
  const totalDone = goals.reduce((n, g) => n + (subsByParent[g.id]?.filter((s) => s.status === 'done').length ?? 0), 0);

  // 启动素材库（通用外壳内联版；暗房频道走抽屉）
  const wishListInline = (
    <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">启动素材库</h3>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={openGoalEditor}
              className="rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary"
            >
              + 新素材
            </motion.button>
          </div>

          {goals.map((goal) => {
            const subs = subsByParent[goal.id] ?? [];
            const doneCount = subs.filter((s) => s.status === 'done').length;
            const isCollapsed = collapsed.has(goal.id);
            return (
              <motion.div
                key={goal.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                {/* 素材头 */}
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(goal.id)}
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-black/5 dark:hover:bg-white/10"
                    aria-label={isCollapsed ? '展开' : '收起'}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                  {subs.length > 0 && <GoalArc done={doneCount} total={subs.length} />}
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openEdit(goal)}
                      className={`block text-left text-base font-bold ${
                        goal.status === 'done'
                          ? 'text-gray-400 line-through dark:text-gray-600'
                          : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {goal.title}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {problemKindLabel(goal.kind)}
                      </span>
                      {goal.currentState && (
                        <span className="min-w-0 truncate rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          当前：{goal.currentState}
                        </span>
                      )}
                    </div>
                    {goal.note && (
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{goal.note}</p>
                    )}
                    <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                      {subs.length > 0 ? `完成 ${doneCount} / ${subs.length}` : '还没有小步骤'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(goal)}
                    className="shrink-0 rounded-md p-1 text-gray-300 hover:bg-black/5 hover:text-red-400 dark:text-gray-600 dark:hover:bg-white/10"
                    aria-label="删除素材"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                    </svg>
                  </button>
                </div>

                {!isCollapsed && (
                  <div className="mt-3 space-y-1.5 pl-8">
                    {subs.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        <span className="relative shrink-0">
                          <motion.button
                            type="button"
                            onClick={() => completeSub(sub)}
                            whileTap={{ scale: 0.85 }}
                            animate={celebrateId === sub.id ? { scale: [1, 1.35, 1] } : {}}
                            transition={{ duration: 0.35, ease: 'easeOut' }}
                            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                              sub.status === 'done'
                                ? 'border-primary bg-primary text-white'
                                : 'border-gray-300 text-transparent dark:border-gray-600'
                            }`}
                            aria-label={sub.status === 'done' ? '标记未完成' : '标记完成'}
                          >
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          </motion.button>
                          {bold && celebrateId === sub.id && <MicroBurst />}
                        </span>
                        <button
                          type="button"
                          onClick={() => openEdit(sub)}
                          className={`min-w-0 flex-1 truncate text-left text-sm ${
                            sub.status === 'done'
                              ? 'text-gray-400 line-through dark:text-gray-600'
                              : 'text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {sub.title}
                          {sub.attribute && (
                            <span className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary">
                              {attrName(sub.attribute)}
                            </span>
                          )}
                          {sub.source === 'ai' && (
                            <span className="ml-1 text-[10px] text-gray-300 dark:text-gray-600">AI</span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(sub)}
                          className="shrink-0 rounded p-1 text-gray-300 hover:text-red-400 dark:text-gray-600"
                          aria-label="删除小步骤"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openSubEditor(goal.id)}
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:border-primary/40 hover:text-primary dark:border-gray-700 dark:text-gray-400"
                      >
                        + 小步骤
                      </button>
                      <button
                        type="button"
                        onClick={() => runAI(goal)}
                        disabled={!hasAI}
                        title={hasAI ? undefined : '需先在「设置 → AI 总结」配置 API 密钥'}
                        className="rounded-full border border-primary/30 px-3 py-1 text-xs font-medium text-primary disabled:opacity-50"
                      >
                        ✦ AI 拆分{hasAI ? '' : '（未配置）'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
          </div>
  );

  // 通用外壳正文（当前三频道均在下方暗房分支接管，此块不可达；保留作频道兜底——
  // body/wishListInline/emptyRitual 仍被下方兜底 return 引用以满足 noUnusedLocals）
  const body = (
    <>
      {activeCard}
      {danmakuBtn}
      <StagnationConsole onOpenMemory={() => setTreasuryOpen(true)} />
      {wishListInline}
    </>
  );

  // 共享模态（编辑器 / AI 拆分 / 删除确认 / 弹幕投稿）——均 portal，两套外壳共用
  const modals = (
    <>
      {/* 素材编辑器 */}
      <SheetModal
        isOpen={editor.open}
        onClose={() => setEditor(closedEditor)}
        position="center"
        busy={busy}
        forceDark={isDarkRoom}
        title={
          editor.editId
            ? editor.mode === 'goal'
              ? '编辑素材'
              : '编辑小步骤'
            : editor.mode === 'goal'
              ? '新素材'
              : '新小步骤'
        }
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditor(closedEditor)}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveEditor}
              disabled={busy || !editor.title.trim()}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              保存
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <input
            autoFocus
            value={editor.title}
            onChange={(e) => setEditor((s) => ({ ...s, title: e.target.value }))}
            placeholder={editor.mode === 'goal' ? '现在卡住你的事是…' : '一个够得着的小步骤…'}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          {editor.mode === 'goal' && (
            <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/60">
              <div>
                <div className="mb-1.5 text-xs text-gray-400 dark:text-gray-500">这件事更像</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['long_term', 'pressure'] as TerminalProblemKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setEditor((s) => ({ ...s, kind }))}
                      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        editor.kind === kind
                          ? 'bg-primary text-white shadow-sm shadow-primary/20'
                          : 'border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                      }`}
                    >
                      {problemKindLabel(kind)}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={editor.currentState}
                onChange={(e) => setEditor((s) => ({ ...s, currentState: e.target.value }))}
                placeholder={currentStatePlaceholder(editor.kind)}
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
            </div>
          )}
          <textarea
            value={editor.note}
            onChange={(e) => setEditor((s) => ({ ...s, note: e.target.value }))}
            placeholder={editor.mode === 'goal' ? '补充说明（可选）：背景、限制、想避开的压力感' : '补充说明（可选）'}
            rows={2}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <div>
            <div className="mb-1.5 text-xs text-gray-400 dark:text-gray-500">
              关联属性（可选）· 完成这一小步时，加点落到这里
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setEditor((s) => ({ ...s, attribute: undefined }))}
                className={`rounded-full px-3 py-1 text-xs ${
                  !editor.attribute
                    ? 'bg-primary text-white'
                    : 'border border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                不绑定
              </button>
              {ATTR_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEditor((s) => ({ ...s, attribute: id }))}
                  className={`rounded-full px-3 py-1 text-xs ${
                    editor.attribute === id
                      ? 'bg-primary text-white'
                      : 'border border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'
                  }`}
                >
                  {attrName(id)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </SheetModal>

      {/* AI 拆分结果 */}
      <SheetModal
        isOpen={ai.open}
        onClose={() => setAi(closedAI)}
        position="center"
        busy={busy}
        forceDark={isDarkRoom}
        title="AI 续拆下一组"
        footer={
          ai.loading || ai.error ? undefined : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAi(closedAI)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
              >
                取消
              </button>
              <button
                type="button"
                onClick={addPicked}
                disabled={busy}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                添加选中（{ai.suggestions.filter((s) => s.picked).length}）
              </button>
            </div>
          )
        }
      >
        <div className="mb-2 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          来自《{ai.parentTitle}》 · 会避开已完成和已排队的小步骤，只补充同一方向上的下一组。
        </div>
        {ai.loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            正在拆…
          </div>
        ) : ai.error ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{ai.error}</div>
        ) : (
          <div className="space-y-1.5">
            {ai.suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setAi((prev) => ({
                    ...prev,
                    suggestions: prev.suggestions.map((x, j) => (j === i ? { ...x, picked: !x.picked } : x)),
                  }))
                }
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  s.picked
                    ? 'border-primary/50 bg-primary/5 text-gray-900 dark:text-white'
                    : 'border-gray-200 text-gray-400 dark:border-gray-700'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                    s.picked ? 'border-primary bg-primary text-white' : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {s.picked && (
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">{s.text}</span>
              </button>
            ))}
          </div>
        )}
      </SheetModal>

      {/* 删除确认 */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        tone="danger"
        title={deleteTarget?.parentId ? '删除这个小步骤？' : '删除这件素材？'}
        description={
          deleteTarget?.parentId
            ? undefined
            : '它下面的小步骤也会一起删掉。'
        }
        confirmText="删除"
        cancelText="取消"
        busy={busy}
        forceDark={isDarkRoom}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 弹幕投稿（先审后发） */}
      <DanmakuCompose isOpen={composeOpen} onClose={() => setComposeOpen(false)} forceDark={isDarkRoom} />

      {/* 一个方向下的小步骤全达成后，由用户决定完成目标或继续推进 */}
      <GoalCompletePop pop={goalCelebrate} onCompleteGoal={finishCelebratedGoal} onContinue={continueCelebratedGoal} />
    </>
  );

  // 暗房频道（红=怪盗 P5 据点 / 蓝·粉·自定义=千禧 BBS 桌面 / 黄=P4 综艺 CRT 演播厅）：
  // 房间外壳 + Velvet 接引 + 召唤抽屉。强制 dark 语境让房内通用件按暗色渲染；各频道用各自皮肤。
  if (skin.channel === 'thief' || skin.channel === 'board' || skin.channel === 'tv') {
    const ch = skin.channel;
    const Trigger = ch === 'board' ? TreasuryTriggerBoard : ch === 'tv' ? TreasuryTriggerTV : TreasuryTrigger;
    const Drawer = ch === 'board' ? TreasuryBoard : ch === 'tv' ? TreasuryTV : TreasuryThief;
    return (
      <>
        <TerminalRoom
          channel={skin.channel}
          title={skin.roomTitle}
          channelLabel={skin.label}
          onBack={() => setCurrentPage('dashboard')}
        >
          <div className="dark relative">
            {/* 房里其他人的声音：board = 底部弹幕栏（P3R 设计稿），其余频道 = 漂浮弹幕氛围层 */}
            {ch === 'board' ? (
              <P3DanmakuBar messages={danmakuPool} bold={bold} />
            ) : (
              <DanmakuField messages={danmakuPool} />
            )}
            {ch === 'board' ? (
              <div className="mb-6">
                <div className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-[5px] h-4 w-1.5 shrink-0" style={{ background: '#2fd2ff' }} />
                  <p className="text-[15px] font-semibold leading-relaxed text-white">{skin.velvet}</p>
                </div>
                <div className="mt-3 flex items-center gap-2" aria-hidden>
                  <span className="h-px flex-1 bg-white/40" />
                  <span className="h-[3px] w-6 bg-white/85" />
                </div>
              </div>
            ) : ch === 'tv' ? (
              null
            ) : (
              <div className="mb-5 border-l-2 border-primary/60 pl-3 text-sm italic leading-relaxed text-white/80">{skin.velvet}</div>
            )}
            {activeCard}
            <StagnationConsole onOpenMemory={() => setTreasuryOpen(true)} />
            {!isEmpty && (
              <Trigger goalsCount={goals.length} done={totalDone} total={totalSubs} onOpen={() => setTreasuryOpen(true)} />
            )}
            {danmakuBtn}
          </div>
        </TerminalRoom>
        <Drawer open={treasuryOpen} onClose={() => setTreasuryOpen(false)} vm={treasuryVM} />
        {modals}
      </>
    );
  }

  // 兜底（理论不可达：thief/board/tv 三频道均在上方暗房分支处理）。保留以防未来新增频道。
  return (
    <div className="relative mx-auto max-w-2xl px-4 pb-24 pt-3">
      {/* 漂浮弹幕（官方精选池 + 云端已过审，氛围层，置于内容之下） */}
      <DanmakuField messages={danmakuPool} />

      {/* 顶栏 */}
      <div className="mb-4 flex items-center gap-2">
        <BackButton onClick={() => setCurrentPage('dashboard')} />
        <PageTitle title="治疗终端" en="Terminal" enOffset={{ right: -2 }} />
      </div>

      {/* 仪式入口带：频道差分 + 振作语 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-4 dark:bg-primary/10"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
          <span className="text-xs font-semibold tracking-wide text-primary">{skin.label}</span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{skin.tagline}</span>
        </div>
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          如果你今天很困扰、甚至失去了记录的勇气——可以来这里看看。
          先把「最想成为的人 / 最想做到的事」放进来，剩下的，让终端替你拆。
        </p>
      </motion.div>

      {body}
      {modals}
    </div>
  );
};
