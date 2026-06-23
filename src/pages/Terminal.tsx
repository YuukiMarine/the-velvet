/**
 * Terminal — F3 无气力症治疗终端（Batch 1：愿望清单 + 仪式入口骨架）。
 *
 * 本批范围：
 *   · 首次进入且愿望为空 → 仪式化引导，建立第一个「终极目标」。
 *   · 愿望清单管理：终极目标 + 子愿望（手动输入 / AI 拆分），轻绑定属性，完成 / 删除。
 *   · 主题差分：按当前主题色给出频道名（蓝=匿名讨论板 / 黄=TV 特别节目 / 红·其他=怪盗 channel）。
 *
 * 下一批（Batch 2/3）：短路决策 + 拆解为「最小第一步」→ 24h 限时任务（复用 CallingCard）→
 * 完成叙事 + 弹幕。本页底部以占位卡预告其位置。
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
import { ShortCircuitPanel } from '@/components/terminal/ShortCircuitPanel';
import { TerminalTaskCard } from '@/components/terminal/TerminalTaskCard';
import { DanmakuField } from '@/components/terminal/DanmakuField';
import { DanmakuCompose } from '@/components/terminal/DanmakuCompose';
import { AntechamberThief } from '@/components/terminal/AntechamberThief';
import { AntechamberBoard } from '@/components/terminal/AntechamberBoard';
import { AntechamberTV } from '@/components/terminal/AntechamberTV';
import { TerminalRoom } from '@/components/terminal/TerminalRoom';
import { TreasuryThief, TreasuryTrigger, ThiefEmpty } from '@/components/terminal/TreasuryThief';
import type { TreasuryVM } from '@/components/terminal/TreasuryThief';
import { MicroBurst } from '@/components/terminal/MicroBurst';
import { GoalArc } from '@/components/terminal/GoalArc';
import { GoalCompletePop } from '@/components/terminal/GoalCompletePop';
import { useBoldness } from '@/utils/boldness';
import { triggerSuccessFeedback, triggerLevelFeedback } from '@/utils/feedback';
import type { AttributeId, Wish } from '@/types';

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

interface EditorState {
  open: boolean;
  mode: 'goal' | 'sub';
  parentId?: string;
  editId?: string;
  title: string;
  note: string;
  attribute?: AttributeId;
}
const closedEditor: EditorState = { open: false, mode: 'goal', title: '', note: '' };

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
  const [treasuryOpen, setTreasuryOpen] = useState(false); // 心之宝物殿抽屉（thief 正文）
  const [entered, setEntered] = useState(false); // 先经过玄关，点「进入」才正式进终端
  const bold = useBoldness();
  const [celebrateId, setCelebrateId] = useState<string | null>(null); // 刚完成、正在播 juice 的子愿望
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [goalCelebrate, setGoalCelebrate] = useState<{ title: string } | null>(null); // 终极目标全达成 → 庆祝弹窗
  const [celebrateGoalId, setCelebrateGoalId] = useState<string | null>(null); // 正在播标题划过特效的目标
  const goalSlideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    if (goalSlideTimer.current) clearTimeout(goalSlideTimer.current);
  }, []);

  // 勾选子愿望：完成→done 时给即时反馈（音+触感+粒子小爆），取消则静默
  const completeSub = (sub: Wish) => {
    const next = sub.status === 'done' ? 'active' : 'done';
    setWishStatus(sub.id, next); // 自动持久化到 IndexedDB
    if (next === 'done') {
      triggerSuccessFeedback();
      setCelebrateId(sub.id);
      // 复位由本组件计时（不依赖只在 bold 下挂载的 MicroBurst.onDone）：D0 也能清态、可重复触发
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setCelebrateId(null), 600);
      // 若这一勾让某终极目标的全部子愿望都达成 → 标题划过 COMPLETE + 庆祝弹窗
      if (sub.parentId) {
        const sibs = subsByParent[sub.parentId] ?? [];
        const allDone = sibs.length > 0 && sibs.every((s) => s.id === sub.id || s.status === 'done');
        if (allDone) {
          triggerLevelFeedback();
          setCelebrateGoalId(sub.parentId);
          if (goalSlideTimer.current) clearTimeout(goalSlideTimer.current);
          goalSlideTimer.current = setTimeout(() => setCelebrateGoalId(null), 1300);
          setGoalCelebrate({ title: goals.find((g) => g.id === sub.parentId)?.title ?? '一个目标' });
        }
      }
    }
  };
  useEffect(() => {
    if (cloudEnabled) listApprovedDanmaku().then(setApprovedDanmaku).catch(() => {});
  }, []);
  // 稳定弹幕池：只在拉取完成（approvedDanmaku 变化）时重算，避免每次重渲染让漂浮弹幕跳变
  const danmakuPool = useMemo(() => [...TERMINAL_DANMAKU_SEEDS, ...approvedDanmaku], [approvedDanmaku]);

  const skin = terminalSkin(user?.theme);
  const isThief = skin.channel === 'thief'; // 怪盗暗房：portal 弹窗需强制暗色，与房间一致
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

  const [editor, setEditor] = useState<EditorState>(closedEditor);
  const [ai, setAi] = useState<AIState>(closedAI);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Wish | null>(null);
  const [busy, setBusy] = useState(false);

  // ── 编辑器（新建 / 编辑，终极目标与子愿望共用） ──
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
            attribute: editor.attribute,
          });
        }
      } else {
        await addWish({
          title,
          parentId: editor.parentId,
          note: editor.note.trim() || undefined,
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
      const list = await decomposeWishAI(goal.title, goal.note);
      if (list.length === 0) {
        setAi((s) => ({ ...s, loading: false, error: 'AI 没有给出可用的拆分，换个说法或手动添加吧' }));
        return;
      }
      setAi((s) => ({ ...s, loading: false, suggestions: list.map((text) => ({ text, picked: true })) }));
    } catch (e) {
      setAi((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'AI 拆分失败' }));
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
          你有 {danmakuTokens} 次鼓励机会 · 写一句送给还在低谷的人
        </span>
        <span className="text-primary/50">›</span>
      </motion.button>
    ) : null;

  // 心之宝物殿 view-model（thief 抽屉复用全部愿望清单逻辑）
  const treasuryVM: TreasuryVM = {
    goals, subsByParent, collapsed, celebrateId, celebrateGoalId, bold, hasAI, attrName,
    toggleCollapse, completeSub, openEdit, openGoalEditor, openSubEditor, runAI, setDeleteTarget,
  };
  const totalSubs = goals.reduce((n, g) => n + (subsByParent[g.id]?.length ?? 0), 0);
  const totalDone = goals.reduce((n, g) => n + (subsByParent[g.id]?.filter((s) => s.status === 'done').length ?? 0), 0);

  // 首次仪式引导（通用版空状态）
  const emptyRitual = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-dashed border-primary/40 px-6 py-10 text-center"
    >
      <div className="mb-3 text-4xl">✦</div>
      <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-white">
        你最想成为的人，是什么样子？
      </h3>
      <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        写下一个「终极目标」——不必宏大，只要是你心里真正向往的方向。
        之后可以手动、或让 AI 把它拆成够得着的小愿望。
      </p>
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={openGoalEditor}
        className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/30"
      >
        许下第一个愿望
      </motion.button>
    </motion.div>
  );

  // 愿望清单（通用外壳内联版；thief 走 TreasuryThief 抽屉）
  const wishListInline = (
    <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400">愿望清单</h3>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={openGoalEditor}
              className="rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary"
            >
              + 新终极目标
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
                {/* 终极目标头 */}
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
                    {goal.note && (
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{goal.note}</p>
                    )}
                    <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                      {subs.length > 0 ? `已夺回 ${doneCount} / ${subs.length}` : '尚无子愿望'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(goal)}
                    className="shrink-0 rounded-md p-1 text-gray-300 hover:bg-black/5 hover:text-red-400 dark:text-gray-600 dark:hover:bg-white/10"
                    aria-label="删除终极目标"
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
                          aria-label="删除子愿望"
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
                        + 子愿望
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

  // 通用外壳正文（board / tv）
  const body = (
    <>
      {activeCard}
      {danmakuBtn}
      {isEmpty ? (
        emptyRitual
      ) : (
        <>
          <ShortCircuitPanel />
          {wishListInline}
        </>
      )}
    </>
  );

  // 共享模态（编辑器 / AI 拆分 / 删除确认 / 弹幕投稿）——均 portal，两套外壳共用
  const modals = (
    <>
      {/* 愿望编辑器 */}
      <SheetModal
        isOpen={editor.open}
        onClose={() => setEditor(closedEditor)}
        position="center"
        busy={busy}
        forceDark={isThief}
        title={
          editor.editId
            ? editor.mode === 'goal'
              ? '编辑终极目标'
              : '编辑子愿望'
            : editor.mode === 'goal'
              ? '新的终极目标'
              : '新的子愿望'
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
            placeholder={editor.mode === 'goal' ? '我最想成为 / 做到的是…' : '一个够得着的小愿望…'}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <textarea
            value={editor.note}
            onChange={(e) => setEditor((s) => ({ ...s, note: e.target.value }))}
            placeholder="补充说明（可选）"
            rows={2}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <div>
            <div className="mb-1.5 text-xs text-gray-400 dark:text-gray-500">
              绑定属性（可选）· 完成它派生的限时任务时加点落到这里
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
        forceDark={isThief}
        title="AI 拆分子愿望"
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
        <div className="mb-2 text-xs text-gray-400 dark:text-gray-500">
          来自《{ai.parentTitle}》
        </div>
        {ai.loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            正在拆分…
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
        title={deleteTarget?.parentId ? '删除这个子愿望？' : '删除这个终极目标？'}
        description={
          deleteTarget?.parentId
            ? undefined
            : '它名下的所有子愿望也会一并删除。'
        }
        confirmText="删除"
        cancelText="取消"
        busy={busy}
        forceDark={isThief}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* 弹幕投稿（先审后发） */}
      <DanmakuCompose isOpen={composeOpen} onClose={() => setComposeOpen(false)} forceDark={isThief} />

      {/* 终极目标全达成庆祝弹窗（主题差分；自动消失） */}
      <GoalCompletePop pop={goalCelebrate} onClose={() => setGoalCelebrate(null)} />
    </>
  );

  // 怪盗（红）正文：P5 据点房间外壳 + Velvet 接引；强制 dark 语境，让房内通用件按暗色渲染
  if (skin.channel === 'thief') {
    return (
      <>
        <TerminalRoom
          channel="thief"
          title={skin.roomTitle}
          channelLabel={skin.label}
          onBack={() => setCurrentPage('dashboard')}
        >
          <div className="dark relative">
            {/* 漂浮弹幕（据点里其他人的声音；氛围层，置于内容之下） */}
            <DanmakuField messages={danmakuPool} />
            <div className="mb-5 border-l-2 border-primary/60 pl-3 text-sm italic leading-relaxed text-white/80">
              {skin.velvet}
            </div>
            {activeCard}
            {isEmpty ? (
              <ThiefEmpty onCreate={openGoalEditor} />
            ) : (
              <>
                <ShortCircuitPanel />
                <TreasuryTrigger goalsCount={goals.length} done={totalDone} total={totalSubs} onOpen={() => setTreasuryOpen(true)} />
              </>
            )}
            {danmakuBtn}
          </div>
        </TerminalRoom>
        <TreasuryThief open={treasuryOpen} onClose={() => setTreasuryOpen(false)} vm={treasuryVM} />
        {modals}
      </>
    );
  }

  // 其余频道（board / tv）：暂用通用正文外壳（各自轮次再皮肤化）
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
