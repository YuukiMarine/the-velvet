import { motion, AnimatePresence } from 'motion/react';
import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import { minimalStep, terminalSkin } from '@/utils/terminalSkin';
import { BigDealPanel } from '@/components/bigdeal/BigDealPanel';
import { BigDealHomeCard } from '@/components/bigdeal/BigDealHomeCard';
import { FateDrawSheet } from '@/components/fate/FateDrawSheet';
import { AttributeId, TodoFrequency } from '@/types';
import { triggerNavFeedback } from '@/utils/feedback';
import { TAP } from '@/utils/motion';
import { GoalDeck } from '@/components/weeklyGoal/GoalDeck';
// ── 行动域统一基元（UI_AUDIT_V2.5.md §3.2 + §4.6 交互协议）──
import { Toggle } from '@/components/Toggle';
import { Stepper } from '@/components/Stepper';
import { EmptyState } from '@/components/EmptyState';
import { ListCard } from '@/components/ListCard';
import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SheetModal } from '@/components/SheetModal';
import { ArchiveIcon, EditIcon, RestoreIcon, TrashIcon } from '@/components/icons';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4CountPill, P4EmptyBloom, P4SectionTitle, P4Sparkle } from '@/ui/p4Kit';
import { BigSlantTitle, GhostWords, P3EmptySlab, P3R, SlantButton } from '@/components/p3r/kit';
import { roughQuad, P5Wedge, P5Chip, P5StarFab } from '@/components/p5r/kit';

const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 今日任务卡：长按 = 唤出上下文菜单（§4.6 协议，不再直接进编辑）
const ActiveTodoCard = ({
  todo,
  progress,
  attrName,
  allAttrNames,
  pct,
  onOpenMenu,
  onArchive,
  renderFrequencyBadge,
}: {
  todo: ReturnType<typeof useAppStore.getState>['todos'][number];
  progress: { count: number; target: number; isComplete: boolean };
  attrName: string;
  allAttrNames: Record<string, string>;
  pct: number;
  onOpenMenu: (id: string) => void;
  onArchive: (id: string) => void;
  renderFrequencyBadge: (frequency: import('@/types').TodoFrequency, targetCount?: number, isLongTerm?: boolean) => string;
}) => {
  // 按压期提示：ListCard 不外露 pressing 态，外层 wrapper 旁观指针起落自行维护
  //（只旁观不拦截，事件照常冒泡给 ListCard 的长按计时；菜单弹出时由回调强制收起，防残留）
  const [pressHint, setPressHint] = useState(false);
  const hideHint = () => setPressHint(false);

  return (
    <div
      onPointerDown={(e) => {
        // 与 useLongPress 同口径：鼠标右键/中键不算按压
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        setPressHint(true);
      }}
      onPointerUp={hideHint}
      onPointerCancel={hideHint}
      onPointerLeave={hideHint}
    >
    {/* 重要性表达 = 左强调条 + 现有 ⭐pill（amber 满底填充取消，向 Activities 的强调条语言看齐） */}
    <ListCard
      accent={todo.important ? 'bg-amber-400' : undefined}
      onLongPress={() => {
        hideHint();
        onOpenMenu(todo.id);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {todo.important && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300 font-semibold">⭐ 重要</span>
            )}
            {todo.fateDrawnDate === toLocalDateKey() && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">✦ 签</span>
            )}
            <h4 className="font-semibold text-sm text-gray-800 dark:text-white truncate">{todo.title}</h4>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* 主属性 */}
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{attrName} +{todo.points}</span>
            {/* 额外属性加成 */}
            {todo.extraBoosts && todo.extraBoosts.map((b, i) => (
              <span key={i} className="text-[10px] text-gray-400 dark:text-gray-500">
                {allAttrNames[b.attribute] ?? b.attribute} +{b.points}
              </span>
            ))}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {renderFrequencyBadge(todo.frequency, todo.targetCount, todo.isLongTerm)}
            </span>
            {todo.repeatDaily && !todo.isLongTerm && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">每日</span>
            )}
            {todo.weekdays && todo.weekdays.length > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{todo.weekdays.map((d: number) => weekdayLabels[d]).join(' ')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* 归档（不启用）按钮 */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onArchive(todo.id)}
            className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-500 transition-colors"
            title="归档（不启用）"
          >
            <ArchiveIcon />
          </button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-2.5">
        <div className="flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500 mb-1">
          <span>{todo.isLongTerm ? '长期进度' : '今日进度'}</span>
          <span>{progress.count}/{progress.target}</span>
        </div>
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>
      {pressHint && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-center">长按打开菜单</p>
      )}
    </ListCard>
    </div>
  );
};

// ── PendingWeekdayTodoCard（日期未到，在归档区显示）：长按同款菜单 ───────────
const PendingWeekdayTodoCard = ({
  todo,
  attrName,
  onOpenMenu,
  onArchive,
  onDelete,
  renderFrequencyBadge,
}: {
  todo: ReturnType<typeof useAppStore.getState>['todos'][number];
  attrName: string;
  onOpenMenu: (id: string) => void;
  onArchive: (id: string) => void;
  /** 快捷删除钮：交给页面级 ConfirmDialog 二段确认（§4.6 删除协议） */
  onDelete: (id: string) => void;
  renderFrequencyBadge: (frequency: import('@/types').TodoFrequency, targetCount?: number, isLongTerm?: boolean) => string;
}) => {
  // 同 ActiveTodoCard：wrapper 旁观指针起落，维护"长按打开菜单"提示
  const [pressHint, setPressHint] = useState(false);
  const hideHint = () => setPressHint(false);

  return (
    <div
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        setPressHint(true);
      }}
      onPointerUp={hideHint}
      onPointerCancel={hideHint}
      onPointerLeave={hideHint}
    >
    {/* 未到日期 = dimmed 降明度（统一替代旧的灰底 + opacity-75 自绘） */}
    <ListCard
      dimmed
      onLongPress={() => {
        hideHint();
        onOpenMenu(todo.id);
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {/* 未到日期标签 */}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
              {todo.startDate ? `📅 ${todo.startDate} 启用` : '📅 未到日期'}
            </span>
            {todo.important && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300">⭐</span>
            )}
            <h4 className="font-semibold text-sm text-gray-500 dark:text-gray-400 truncate">{todo.title}</h4>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{attrName} +{todo.points}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200/60 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500">
              {renderFrequencyBadge(todo.frequency, todo.targetCount, todo.isLongTerm)}
            </span>
            {todo.weekdays && todo.weekdays.length > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {todo.weekdays.map((d: number) => weekdayLabels[d]).join(' ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* 归档（禁用）按钮 */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onArchive(todo.id)}
            className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-500 transition-colors"
            title="归档"
          >
            <ArchiveIcon />
          </button>
          {/* 彻底删除：唤起页面级 ConfirmDialog（旧"二次点按确认"机制已移除） */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(todo.id)}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
            title="删除"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
      {pressHint && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-center">长按打开菜单</p>
      )}
    </ListCard>
    </div>
  );
};

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

// 行动页子视图（任务）：页头/页级转场由宿主 Actions.tsx 承担，本组件只渲染内容
export const TodosView = () => {
  const { todos, settings, attributes, addTodo, updateTodo, deleteTodo, getTodayTodoProgress, getTodoDateLabel, weeklyGoals, saveWeeklyGoal, deleteWeeklyGoal, completeWeeklyGoal, getWeeklyGoalProgress, undoTodayTodoCompletion } = useAppStore();
  const channel = useUiChannel();
  const isP4 = channel === 'p4';
  // P5R：红主题 FAB 换八角红块（p5-menu 稿「+」形制）
  const p5 = channel === 'p5';
  // P3R（蓝主题）形态：设计稿 p3-actions-reference-v3——节直接铺水面底、大斜体节题、浅青空态板
  const p3 = channel === 'p3';
  const [showAdd, setShowAdd] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  /** 表单模式（三段式表单第二段）：single/count 映射 frequency；big = BIG DEAL（frequency 恒 single） */
  const emptyForm = {
    title: '',
    mode: 'single' as 'single' | 'count' | 'big',
    attribute: 'knowledge' as AttributeId,
    points: 2,
    extraBoosts: [] as Array<{ attribute: AttributeId; points: number }>,
    targetCount: 1,
    repeatDaily: false,
    isLongTerm: false,
    weekdays: [] as number[],
    isActive: true,
    important: false,
    startDate: '' as string,
    // BIG DEAL 专属
    currentState: '' as string,
    deadline: '' as string,
    steps: [] as Array<{ id?: string; title: string; attribute?: AttributeId; done?: boolean; doneAt?: string; source: 'manual' | 'ai' }>,
  };
  const [form, setForm] = useState(emptyForm);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const todayWeekday = new Date().getDay();
  const todayDateKey = toLocalDateKey();
  const activeTodos = useMemo(() => {
    const active = todos.filter(t => {
      if (!t.isActive) return false;
      // 未来启用日期的任务不出现在今日任务
      if (t.startDate && t.startDate > todayDateKey) return false;
      const matchesWeekday = !t.weekdays || t.weekdays.length === 0 || t.weekdays.includes(todayWeekday);
      return matchesWeekday;
    });
    // 重要任务置顶
    return [...active].sort((a, b) => {
      if (a.important && !b.important) return -1;
      if (!a.important && b.important) return 1;
      return 0;
    });
  }, [todos, todayWeekday, todayDateKey]);

  /** 未到日期的任务：startDate 在未来，或 isActive 但今天不是指定的星期几 */
  const pendingDateTodos = useMemo(() =>
    todos.filter(t =>
      t.isActive && (
        (t.startDate && t.startDate > todayDateKey) ||
        (t.weekdays && t.weekdays.length > 0 && !t.weekdays.includes(todayWeekday))
      )
    ),
  [todos, todayWeekday, todayDateKey]);

  /** 已完成的归档任务（按完成时间倒序） */
  const completedArchivedTodos = useMemo(() =>
    todos.filter(t => !t.isActive && t.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()),
  [todos]);
  /** 手动归档（未启用）的任务 */
  const inactiveArchivedTodos = useMemo(() => todos.filter(t => !t.isActive && !t.completedAt), [todos]);
  const [expandCompleted, setExpandCompleted] = useState(false);

  // ── §4.6 交互协议状态 ──
  //   menuTodoId      长按菜单的目标任务：单个 ActionSheet 按 id 寻址，所有卡共用
  //   pendingDeleteId 待删除任务：单个 ConfirmDialog 二段确认，
  //                   替代旧"3 秒内再点一次"机制（confirmDeleteId/Timer 已整体移除）
  const [menuTodoId, setMenuTodoId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const menuTodo = menuTodoId ? todos.find(t => t.id === menuTodoId) : undefined;
  const pendingDeleteTodo = pendingDeleteId ? todos.find(t => t.id === pendingDeleteId) : undefined;

  const resetForm = () => {
    setForm(emptyForm);
    setAiError(null);
    setShowMore(false);
  };

  /** 统一关闭表单弹窗：SheetModal 的 backdrop/ESC/Android back 与"取消"按钮共用同一条路径 */
  const closeForm = () => {
    setShowAdd(false);
    setEditingTodoId(null);
    resetForm();
  };

  /** 更多设置折叠区（重要/每日/周几/启用/启用日期）；编辑带非默认值的任务时自动展开 */
  const [showMore, setShowMore] = useState(false);
  /** BIG DEAL 二级面板（聚合卡点击落点） */
  const [dealPanelId, setDealPanelId] = useState<string | null>(null);
  /** 抽签仪式面板 */
  const [fateOpen, setFateOpen] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    const isBig = form.mode === 'big';
    const validExtraBoosts = form.extraBoosts
      .filter(b => b.points >= 1)
      .map(b => ({ attribute: b.attribute, points: Math.max(1, Math.min(5, b.points)) }));
    const payload = {
      title: form.title.trim(),
      attribute: form.attribute,
      points: Math.max(1, Math.min(5, form.points)),
      extraBoosts: validExtraBoosts.length > 0 ? validExtraBoosts : undefined,
      frequency: (form.mode === 'count' ? 'count' : 'single') as TodoFrequency,
      targetCount: form.mode === 'count' ? Math.max(1, form.targetCount) : undefined,
      repeatDaily: isBig ? false : form.repeatDaily,
      isLongTerm: form.mode === 'count' ? form.isLongTerm : false,
      weekdays: isBig ? [] : form.weekdays.sort(),
      isActive: form.isActive,
      important: form.important,
      startDate: form.startDate || undefined,
      // BIG DEAL：已有子步保留 id/done/doneAt（编辑不清进度），新行补 uuid
      isBigDeal: isBig || undefined,
      currentState: isBig ? form.currentState.trim() || undefined : undefined,
      deadline: isBig ? form.deadline || undefined : undefined,
      steps: isBig
        ? form.steps
            .map(s => ({ ...s, title: s.title.trim() }))
            .filter(s => s.title)
            .map(s => ({ id: s.id ?? uuidv4(), title: s.title, attribute: s.attribute, done: s.done, doneAt: s.doneAt, source: s.source }))
        : undefined,
    };

    if (editingTodoId) {
      await updateTodo(editingTodoId, payload);
      setEditingTodoId(null);
    } else {
      await addTodo(payload);
    }
    setShowAdd(false);
    resetForm();
  };

  const handleEdit = (todoId: string) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;
    setEditingTodoId(todoId);
    setForm({
      title: todo.title,
      mode: todo.isBigDeal ? 'big' : todo.frequency === 'count' ? 'count' : 'single',
      attribute: todo.attribute,
      points: todo.points,
      extraBoosts: todo.extraBoosts ? [...todo.extraBoosts] : [],
      targetCount: todo.targetCount || 1,
      repeatDaily: !!todo.repeatDaily,
      isLongTerm: !!todo.isLongTerm,
      weekdays: todo.weekdays || [],
      isActive: todo.isActive,
      important: !!todo.important,
      startDate: todo.startDate || '',
      currentState: todo.currentState || '',
      deadline: todo.deadline || '',
      steps: (todo.steps ?? []).map(s => ({ ...s })),
    });
    setAiError(null);
    setShowMore(!!(todo.important || todo.repeatDaily || (todo.weekdays?.length ?? 0) > 0 || !todo.isActive || todo.startDate));
    setShowAdd(true);
  };

  /** BIG DEAL「帮我拆」：复用 decomposeWishAI（伪 Wish 树），失败落一条离线模板步 */
  const runFormAI = async () => {
    const title = form.title.trim();
    if (!title || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const parent = {
        id: 'draft',
        title,
        kind: (form.deadline ? 'pressure' : 'long_term') as 'pressure' | 'long_term',
        currentState: form.currentState.trim() || undefined,
        status: 'active' as const,
        source: 'manual' as const,
        createdAt: new Date(),
      };
      const children = form.steps
        .filter(s => s.title.trim())
        .map((s, i) => ({
          id: s.id ?? `draft-${i}`,
          parentId: 'draft',
          title: s.title.trim(),
          status: (s.done ? 'done' : 'active') as 'done' | 'active',
          source: s.source,
          createdAt: new Date(),
        }));
      const list = await useAppStore.getState().decomposeWishAI(parent, children);
      if (list.length === 0) {
        setAiError('这次没拆出能用的小步。换个说法，或手写一条吧');
      } else {
        setForm(prev => ({ ...prev, steps: [...prev.steps, ...list.map(t => ({ title: t, source: 'ai' as const }))] }));
      }
    } catch {
      // 无 Key / 网络失败 → 离线模板兜底一条（minimalStep，批5 随终端瘦身迁址）
      const fallback = minimalStep(terminalSkin(useAppStore.getState().user?.theme), title);
      setForm(prev => ({ ...prev, steps: [...prev.steps, { title: fallback, source: 'manual' as const }] }));
      setAiError('AI 未接通，先放了一条离线拆步——可改可删');
    } finally {
      setAiBusy(false);
    }
  };

  const toggleWeekday = (day: number) => {
    setForm(prev => {
      const exists = prev.weekdays.includes(day);
      const updated = exists ? prev.weekdays.filter(d => d !== day) : [...prev.weekdays, day];
      return { ...prev, weekdays: updated };
    });
  };

  const renderFrequencyBadge = (frequency: TodoFrequency, targetCount?: number, isLongTerm?: boolean) => {
    if (frequency === 'single') return '单次';
    if (frequency === 'count') {
      if (isLongTerm) return `长期 · ${targetCount || 1}次`;
      return `多次 · ${targetCount || 1}次`;
    }
    return '';
  };

  return (
    // 子视图化：页级 motion 容器（opacity 进出场）移交宿主 Actions 的 tabpanel 包装层，
    // 自身退化为纯 div——若保留 exit 会拖长宿主 AnimatePresence mode="wait" 的 180ms 切换预算
    <div className="space-y-6">
      {/* ── 目标区：本周目标 / 倒计时 ───────────────────── */}
      <GoalDeck
        settings={settings}
        attributes={attributes}
        weeklyGoals={weeklyGoals}
        saveWeeklyGoal={saveWeeklyGoal}
        deleteWeeklyGoal={deleteWeeklyGoal}
        completeWeeklyGoal={completeWeeklyGoal}
        getWeeklyGoalProgress={getWeeklyGoalProgress}
      />

      <div className={isP4 ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : p3 ? 'relative mt-8 space-y-10' : 'grid grid-cols-1 lg:grid-cols-2 gap-4'}>
        {p3 && <GhostWords words={['PLAN']} className="left-[6px] top-[36%] text-[84px]" />}
        {/* 今日任务：P4 = 无卡壳，衬线区题直压黄底 + 黑胶囊计数（p4-actions-reference-v2）；p3 = 水面底大斜体节题 */}
        <div className={isP4 ? '' : p3 ? 'relative' : p5 ? 'relative' : 'rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden'}>
          {p5 ? (
            /* p5-modal-04 稿：黑楞区标 + 右缘红计数章（坐在纸卡顶缘上） */
            <div className="relative z-10 mb-[-6px] flex items-center justify-between pl-1 pr-2">
              <P5Wedge tone="ink" rot={-1.4}>今日任务</P5Wedge>
              <P5Chip tone="red" rot={1.6}>{activeTodos.length} 项</P5Chip>
            </div>
          ) : isP4 ? (
            <P4SectionTitle meta={<P4CountPill>{activeTodos.length} 项</P4CountPill>} className="px-1 pb-2">
              今日任务
            </P4SectionTitle>
          ) : p3 ? (
            <BigSlantTitle title="今日任务" count={`${activeTodos.length} 项`} className="mb-4" />
          ) : (
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white">今日任务</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                {activeTodos.length} 项
              </span>
            </div>
          )}
          {/* 抽签入口（TASKS_MERGE_PRD §4.2）：决策短路——不知道先做哪个，交给命运单抽 */}
          <button
            type="button"
            onClick={() => setFateOpen(true)}
            className={`mb-2 flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold transition ${
              p3
                ? ''
                : isP4
                  ? 'rounded-full border-2 border-[#131313]/70 bg-[var(--p4-paper,#fff7b0)] text-[#131313]'
                  : p5
                    ? 'relative z-10 border-2 border-[#050505] bg-[#f0e9df] text-[#131313] shadow-[3px_3px_0_rgba(0,0,0,0.45)]'
                    : 'mx-3 mt-3 w-[calc(100%-1.5rem)] rounded-xl border border-dashed border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400'
            }`}
            style={p3 ? { clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', background: 'var(--p3r-panel-glass, rgba(255,255,255,0.85))', color: P3R.ink, boxShadow: '0 4px 12px rgba(38,96,140,0.08)' } : undefined}
          >
            <span aria-hidden className={p5 ? 'text-[#c00008]' : isP4 ? 'text-[#f9a11b]' : 'text-primary'}>✦</span>
            <span className="min-w-0 flex-1 truncate">不知道从哪开始？抽一张，只做这一件</span>
            <span aria-hidden className="opacity-50">›</span>
          </button>
          <div className={isP4 || p3 ? 'space-y-2' : p5 ? 'relative space-y-2 px-3 pb-3 pt-5' : 'p-3 space-y-2'}>
            {p5 && (
              <>
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(4px,5px)', background: '#000000', clipPath: roughQuad(371, 8), zIndex: -1 }} />
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: '#050505', clipPath: roughQuad(372, 7), zIndex: -1 }} />
                <span aria-hidden className="pointer-events-none absolute inset-[3px]" style={{ background: '#f0e9df', clipPath: roughQuad(373, 5), zIndex: -1 }} />
              </>
            )}
            {activeTodos.map(todo => {
              // BIG DEAL：聚合卡（进度=子步派生，点击进二级面板；⋯ 走同一长按菜单）
              if (todo.isBigDeal) {
                return (
                  <BigDealHomeCard
                    key={todo.id}
                    todo={todo}
                    channel={p3 ? 'p3' : isP4 ? 'p4' : p5 ? 'p5' : 'plain'}
                    onOpen={() => setDealPanelId(todo.id)}
                    onMenu={() => setMenuTodoId(todo.id)}
                  />
                );
              }
              const progress = getTodayTodoProgress(todo.id);
              const attrName = settings.attributeNames[todo.attribute];
              const pct = Math.min(100, (progress.count / progress.target) * 100);
              return (
                <ActiveTodoCard
                  key={todo.id}
                  todo={todo}
                  progress={progress}
                  attrName={attrName}
                  allAttrNames={settings.attributeNames}
                  pct={pct}
                  onOpenMenu={setMenuTodoId}
                  onArchive={(id) => updateTodo(id, { isActive: false })}
                  renderFrequencyBadge={renderFrequencyBadge}
                />
              );
            })}
            {activeTodos.length === 0 && (
              isP4 ? <P4EmptyBloom text="还没有任务，添加一个开始吧" /> : p3 ? <P3EmptySlab /> : <EmptyState text="还没有任务，添加一个开始吧" />
            )}
          </div>
        </div>

        {/* 已归档 */}
        <div className={isP4 ? '' : p3 ? 'relative' : p5 ? 'relative' : 'rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden'}>
          {p5 ? (
            <div className="relative z-10 mb-[-6px] flex items-center justify-between pl-1 pr-2">
              <P5Wedge tone="ink" rot={-1.2}>已归档</P5Wedge>
              <P5Chip tone="red" rot={1.4}>{completedArchivedTodos.length + inactiveArchivedTodos.length + pendingDateTodos.length} 项</P5Chip>
            </div>
          ) : isP4 ? (
            <P4SectionTitle
              meta={<P4CountPill>{completedArchivedTodos.length + inactiveArchivedTodos.length + pendingDateTodos.length} 项</P4CountPill>}
              className="px-1 pb-2"
            >
              已归档
            </P4SectionTitle>
          ) : p3 ? (
            <BigSlantTitle
              title="已归档"
              count={`${completedArchivedTodos.length + inactiveArchivedTodos.length + pendingDateTodos.length} 项`}
              className="mb-4"
            />
          ) : (
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-white">已归档</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                {completedArchivedTodos.length + inactiveArchivedTodos.length + pendingDateTodos.length} 项
              </span>
            </div>
          )}
          <div className={isP4 || p3 ? 'space-y-2' : p5 ? 'relative space-y-2 px-3 pb-3 pt-5' : 'p-3 space-y-2'}>
            {p5 && (
              <>
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(4px,5px)', background: '#000000', clipPath: roughQuad(381, 8), zIndex: -1 }} />
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: '#050505', clipPath: roughQuad(382, 7), zIndex: -1 }} />
                <span aria-hidden className="pointer-events-none absolute inset-[3px]" style={{ background: '#f0e9df', clipPath: roughQuad(383, 5), zIndex: -1 }} />
              </>
            )}

            {/* ── 未到日期（startDate 在未来 / 今日不在指定星期内）── */}
            {pendingDateTodos.length > 0 && (
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 pt-1 pb-0.5">未到日期</div>
            )}
            {pendingDateTodos.map(todo => (
              <PendingWeekdayTodoCard
                key={todo.id}
                todo={todo}
                attrName={settings.attributeNames[todo.attribute]}
                onOpenMenu={setMenuTodoId}
                onArchive={(id) => updateTodo(id, { isActive: false })}
                onDelete={setPendingDeleteId}
                renderFrequencyBadge={renderFrequencyBadge}
              />
            ))}

            {/* ── 未启用（手动归档）── */}
            {inactiveArchivedTodos.length > 0 && (
              <>
                {pendingDateTodos.length > 0 && <div className="border-t border-gray-100 dark:border-gray-800 my-1" />}
                <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 pt-1 pb-0.5">未启用</div>
              </>
            )}
            {inactiveArchivedTodos.map(todo => (
              // 入场微动效留在外层 wrapper（ListCard 不承载动画 props）；未启用 = dimmed
              <motion.div key={todo.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <ListCard dimmed>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      {todo.archivedAt && getTodoDateLabel(new Date(todo.archivedAt)) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {getTodoDateLabel(new Date(todo.archivedAt))}
                        </span>
                      )}
                      {todo.important && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300">⭐</span>
                      )}
                      <span className="font-semibold text-sm truncate text-gray-700 dark:text-gray-200">
                        {todo.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {settings.attributeNames[todo.attribute]} +{todo.points}
                      </span>
                      {todo.extraBoosts && todo.extraBoosts.map((b, i) => (
                        <span key={i} className="text-[10px] text-gray-400 dark:text-gray-500">
                          {settings.attributeNames[b.attribute] ?? b.attribute} +{b.points}
                        </span>
                      ))}
                      {todo.weekdays && todo.weekdays.length > 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{todo.weekdays.map(d => weekdayLabels[d]).join(' ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(todo.id)}
                      className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      title="编辑"
                    >
                      <EditIcon />
                    </button>
                    <button
                      onClick={() => setPendingDeleteId(todo.id)}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-colors bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                      title="删除"
                    >
                      <TrashIcon />
                    </button>
                    <button
                      onClick={() => updateTodo(todo.id, { isActive: true, archivedAt: undefined })}
                      className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                      title="恢复（重置为未完成）"
                    >
                      <RestoreIcon />
                    </button>
                  </div>
                </div>
              </ListCard>
              </motion.div>
            ))}

            {/* ── 已完成 ── */}
            {completedArchivedTodos.length > 0 && (
              <>
                {(pendingDateTodos.length > 0 || inactiveArchivedTodos.length > 0) && <div className="border-t border-gray-100 dark:border-gray-800 my-1" />}
                <div className={`px-1 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider ${p5 ? 'font-black' : 'text-emerald-500 dark:text-emerald-400'}`} style={p5 ? { color: '#c00008' } : undefined}>已完成</div>
              </>
            )}
            {(expandCompleted ? completedArchivedTodos : completedArchivedTodos.slice(0, 5)).map(todo => {
              const archivedProgress = getTodayTodoProgress(todo.id);
              const wasCompletedToday = archivedProgress.isComplete;
              return (
                // 已完成 = dimmed（emerald 满底取消，完成态由 ✓ 徽章 + 删除线表达）
                <motion.div key={todo.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                <ListCard dimmed>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {wasCompletedToday ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">✓ 今日已完成</span>
                        ) : (
                          todo.completedAt && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              ✓ {new Date(todo.completedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}完成
                            </span>
                          )
                        )}
                        {todo.important && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300">⭐</span>
                        )}
                        <span className="font-semibold text-sm truncate line-through text-gray-400 dark:text-gray-500">
                          {todo.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {settings.attributeNames[todo.attribute]} +{todo.points}
                        </span>
                        {todo.extraBoosts && todo.extraBoosts.map((b, i) => (
                          <span key={i} className="text-[10px] text-gray-400 dark:text-gray-500">
                            {settings.attributeNames[b.attribute] ?? b.attribute} +{b.points}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setPendingDeleteId(todo.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-colors bg-red-50 dark:bg-red-900/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                        title="删除"
                      >
                        <TrashIcon />
                      </button>
                      {wasCompletedToday ? (
                        <button
                          // 当天的"恢复" = "撤销"：连点数 + 历史记录 + todoCompletion 一并回滚
                          onClick={() => undoTodayTodoCompletion(todo.id)}
                          className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                          title="撤销今日完成（同时回退点数和记录）"
                        >
                          <RestoreIcon />
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            await addTodo({
                              title: todo.title,
                              attribute: todo.attribute,
                              points: todo.points,
                              extraBoosts: todo.extraBoosts,
                              frequency: todo.frequency,
                              repeatDaily: todo.repeatDaily,
                              isLongTerm: todo.isLongTerm,
                              targetCount: todo.targetCount,
                              weekdays: todo.weekdays,
                              important: todo.important,
                              isActive: true,
                            });
                          }}
                          className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                          title="按此配置新建任务"
                        >
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2.5 8A5.5 5.5 0 1 1 13 5.5" strokeLinecap="round" />
                            <path d="M13 2.5v3h-3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </ListCard>
                </motion.div>
              );
            })}
            {completedArchivedTodos.length > 5 && (
              <button
                onClick={() => setExpandCompleted(v => !v)}
                className="w-full py-1.5 text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors border-t border-dashed border-gray-200 dark:border-gray-700"
              >
                {expandCompleted ? '收起' : `展开全部（共 ${completedArchivedTodos.length} 项）`}
              </button>
            )}

            {completedArchivedTodos.length === 0 && inactiveArchivedTodos.length === 0 && pendingDateTodos.length === 0 && (
              isP4 ? <P4EmptyBloom text="归档区暂无内容" /> : p3 ? <P3EmptySlab /> : <EmptyState text="归档区暂无内容" />
            )}
          </div>
        </div>
        {p3 && <GhostWords words={['LOG']} className="bottom-[6px] right-[8px] text-[84px]" />}
      </div>

      {/* 添加任务 FAB：替代原页头「+ 添加任务」按钮。
          与记录子页 FAB 同制式（fixed bottom-24 right-5 z-40 w-14 h-14 圆形 bg-primary），
          子页切换时两枚 FAB 静止视觉完全一致、不跳变 */}
      {p3 ? (
        /* P3R：右下蓝色斜切「接入」（设计稿 CTA 形态） */
        <div className="fixed bottom-24 right-5 z-40 md:bottom-8 md:right-8">
          <SlantButton
            tone="primary"
            ariaLabel="添加任务"
            className="text-[20px]"
            style={{ paddingTop: 14, paddingBottom: 14, paddingLeft: 34, paddingRight: 34, boxShadow: '0 14px 28px rgba(27,87,255,0.32)' }}
            onClick={() => {
              triggerNavFeedback();
              setEditingTodoId(null);
              resetForm();
              setShowAdd(true);
            }}
          >
            接入
          </SlantButton>
        </div>
      ) : (
        <motion.button
          whileTap={TAP}
          onClick={() => {
            triggerNavFeedback();
            setEditingTodoId(null);
            resetForm();
            setShowAdd(true);
          }}
          aria-label="添加任务"
          className={`fixed bottom-24 right-5 md:bottom-8 md:right-8 z-40 flex items-center justify-center cursor-pointer ${
            isP4
              ? 'h-16 w-16 text-white' // p4-redraw：蓝色四角星 FAB（星形本体当按钮面）
              : p5
                ? 'h-16 w-16 text-white' // p5-redraw：纸边黑影红五角星
                : 'w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30'
          }`}
        >
          {isP4 && (
            <P4Sparkle
              size={64}
              color="var(--ui-accent)"
              className="absolute inset-0"
              style={{ filter: 'drop-shadow(0 3px 0 rgba(19,19,19,0.3))' }}
            />
          )}
          {p5 && <P5StarFab seed={11} />}
          {/* 白色加号（与记录子页 FAB 的 PlusIcon 同款笔画） */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isP4 || p5 ? 2.6 : 2} className={`relative ${isP4 ? 'w-5 h-5' : 'w-6 h-6'}`} aria-hidden="true">
            <path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      )}

      {/* 添加/编辑任务：SheetModal 底部抽屉——自带 backdrop 点关/ESC/Android back
          （修审计"遮罩不可点关、无返回键处理"问题），exit 动画由其内部 AnimatePresence 承担 */}
      <SheetModal
        isOpen={showAdd}
        onClose={closeForm}
        position="bottom"
        title={editingTodoId ? '编辑任务' : '添加任务'}
        footer={
          /* 协议铁律：取消恒在左，主操作（bg-primary）恒在右 */
          p3 ? (
            <div className="flex gap-3">
              <SlantButton tone="ghost" onClick={closeForm} className="flex-1">取消</SlantButton>
              <SlantButton tone="primary" magentaCorner onClick={handleSave} className="flex-1">
                {editingTodoId ? '保存' : '添加'}
              </SlantButton>
            </div>
          ) : (
          <div className="flex gap-3">
            <button
              onClick={closeForm}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="flex-1 bg-primary text-white py-2.5 rounded-xl font-medium"
            >
              {editingTodoId ? '保存' : '添加'}
            </button>
          </div>
          )
        }
      >
              <div className="space-y-5">
                {/* ── ① 标题 ─────────────────────────────────────────── */}
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder={form.mode === 'big' ? '想搞定的一件大事…' : '今日要完成什么？'}
                  className="w-full px-3.5 py-3 text-[16px] font-semibold border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />

                {/* ── ② 模式三卡（三段式第二段；编辑中锁定防止子步/计数语义悬空） ── */}
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: 'single', name: '单次', hint: '做完即归档', glyph: '✓' },
                      { key: 'count', name: '计数', hint: '重复 N 次', glyph: '∞' },
                      { key: 'big', name: 'BIG DEAL', hint: '大事拆小步', glyph: '◆' },
                    ] as const).map(m => {
                      const active = form.mode === m.key;
                      return (
                        <button
                          key={m.key}
                          type="button"
                          disabled={!!editingTodoId && !active}
                          onClick={() => setForm(prev => ({ ...prev, mode: m.key }))}
                          className={`flex flex-col items-start gap-0.5 px-3 py-2.5 text-left transition-colors disabled:opacity-35 ${
                            p3
                              ? ''
                              : isP4
                                ? `rounded-[14px] border-[3px] border-[#131313] ${active ? 'bg-[#131313] text-[#ffe100]' : 'bg-[var(--p4-paper, #fff7b0)] text-[#131313]'}`
                                : p5
                                  ? `border-2 border-[#050505] ${active ? 'bg-[#c00008] text-white shadow-[3px_3px_0_#050505]' : 'bg-white text-[#131313]'}`
                                  : `rounded-xl border ${active ? 'bg-primary text-white border-primary' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'}`
                          }`}
                          style={p3 ? {
                            clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                            background: active ? P3R.blue : P3R.panel,
                            color: active ? '#fff' : P3R.ink,
                            boxShadow: active ? 'none' : '0 4px 12px rgba(38,96,140,0.08)',
                          } : undefined}
                        >
                          <span aria-hidden className="text-base font-black leading-none">{m.glyph}</span>
                          <span className="text-[13px] font-black leading-tight">{m.name}</span>
                          <span className="text-[10px] font-semibold leading-tight opacity-60">{m.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                  {editingTodoId && (
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">编辑中不可切换模式</p>
                  )}
                </div>

                {/* 模式附属 · 计数 */}
                {form.mode === 'count' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2.5">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">目标次数</span>
                      <Stepper
                        value={form.targetCount}
                        min={1}
                        max={99}
                        aria-label="目标次数"
                        onChange={(v) => setForm(prev => ({ ...prev, targetCount: v }))}
                      />
                    </div>
                    <label className={`flex items-start gap-2.5 text-sm rounded-xl px-3 py-2.5 cursor-pointer ${
                      form.isLongTerm
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={form.isLongTerm}
                        onChange={(e) => setForm(prev => ({ ...prev, isLongTerm: e.target.checked, repeatDaily: e.target.checked ? false : prev.repeatDaily }))}
                        className="w-4 h-4 text-indigo-500 mt-0.5 rounded"
                      />
                      <div>
                        <span className="font-medium">长期任务</span>
                        <p className="text-xs opacity-70 mt-0.5">进度长期保留，不随时间刷新，直到完成为止</p>
                      </div>
                    </label>
                  </div>
                )}

                {/* 模式附属 · BIG DEAL：现状 + 截止日 + 子步编辑器 + 帮我拆 */}
                {form.mode === 'big' && (
                  <div className="space-y-2.5 rounded-2xl border border-primary/25 bg-primary/5 dark:bg-primary/10 p-3">
                    <input
                      type="text"
                      value={form.currentState}
                      onChange={(e) => setForm(prev => ({ ...prev, currentState: e.target.value }))}
                      placeholder="现在到哪一步了？一句话（可选，AI 拆解会参考）"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-primary"
                    />
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">截止日（可选）</span>
                      <input
                        type="date"
                        value={form.deadline}
                        min={todayDateKey}
                        onChange={(e) => setForm(prev => ({ ...prev, deadline: e.target.value }))}
                        className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-white"
                      />
                      {form.deadline && (
                        <button type="button" onClick={() => setForm(prev => ({ ...prev, deadline: '' }))} className="text-xs text-gray-400 underline">清除</button>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-0.5">
                      {form.steps.map((s, i) => (
                        <div key={s.id ?? `new-${i}`} className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className={`flex h-4.5 w-4.5 h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-black ${
                              s.done ? 'border-primary bg-primary text-white' : 'border-gray-300 dark:border-gray-600 text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <input
                            value={s.title}
                            disabled={s.done}
                            onChange={(e) => setForm(prev => {
                              const next = [...prev.steps];
                              next[i] = { ...next[i], title: e.target.value };
                              return { ...prev, steps: next };
                            })}
                            placeholder="一个够得着的小步…"
                            className={`min-w-0 flex-1 px-2.5 py-1.5 text-sm border rounded-lg outline-none ${
                              s.done
                                ? 'border-transparent bg-transparent text-gray-400 line-through dark:text-gray-500'
                                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white focus:border-primary'
                            }`}
                          />
                          {s.source === 'ai' && <span className="shrink-0 text-[10px] font-bold text-primary/60">AI</span>}
                          {!s.done && (
                            <button
                              type="button"
                              aria-label="删除子步"
                              onClick={() => setForm(prev => ({ ...prev, steps: prev.steps.filter((_, j) => j !== i) }))}
                              className="shrink-0 rounded p-1 text-gray-300 hover:text-red-400 dark:text-gray-600"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, steps: [...prev.steps, { title: '', source: 'manual' }] }))}
                          className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-500 dark:border-gray-600 dark:text-gray-400"
                        >
                          + 手写一步
                        </button>
                        <button
                          type="button"
                          onClick={() => void runFormAI()}
                          disabled={aiBusy || !form.title.trim()}
                          className="rounded-full border border-primary/40 px-3 py-1 text-xs font-bold text-primary disabled:opacity-45"
                        >
                          {aiBusy ? '正在拆…' : '✦ AI 帮我拆'}
                        </button>
                      </div>
                      {aiError && <p className="text-xs text-amber-600 dark:text-amber-400">{aiError}</p>}
                      <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                        每完成一子步得主属性 +{form.points}；全部完成触发收官奖励（SP + 触及属性各 +1）
                      </p>
                    </div>
                  </div>
                )}

                {/* ── ③ 奖励：主属性 chips + 点数 + 副奖励 ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">奖励 · 主属性</label>
                    <Stepper
                      value={form.points}
                      min={1}
                      max={5}
                      aria-label="主属性点数"
                      onChange={(v) => setForm(prev => ({ ...prev, points: v }))}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ATTR_IDS.map(id => {
                      const usedByExtra = form.extraBoosts.some(b => b.attribute === id);
                      const active = form.attribute === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={usedByExtra}
                          onClick={() => setForm(prev => ({ ...prev, attribute: id }))}
                          className={`px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-35 ${
                            p3
                              ? ''
                              : isP4
                                ? `rounded-full border-2 border-[#131313] ${active ? 'bg-[#131313] text-[#ffe100]' : 'bg-white text-[#131313]'}`
                                : p5
                                  ? `border-2 border-[#050505] ${active ? 'bg-[#c00008] text-white' : 'bg-white text-[#131313]'}`
                                  : `rounded-full ${active ? 'bg-primary text-white' : 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`
                          }`}
                          style={p3 ? {
                            clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
                            background: active ? P3R.blue : P3R.panel,
                            color: active ? '#fff' : P3R.ink,
                          } : undefined}
                        >
                          {settings.attributeNames[id] ?? id}
                        </button>
                      );
                    })}
                  </div>

                  {/* 副奖励（最多 2 条） */}
                  {(() => {
                    const usedAttrs = new Set<string>([form.attribute, ...form.extraBoosts.map(b => b.attribute)]);
                    const firstUnused = (ATTR_IDS.find(id => !usedAttrs.has(id)) ?? 'knowledge') as AttributeId;
                    const canAddMore = form.extraBoosts.length < 2 && usedAttrs.size < ATTR_IDS.length;
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">副奖励（可选，最多 2 条）</span>
                          {canAddMore && (
                            <motion.button
                              whileTap={{ scale: 0.88 }}
                              type="button"
                              onClick={() => setForm(prev => ({
                                ...prev,
                                extraBoosts: [...prev.extraBoosts, { attribute: firstUnused, points: 1 }],
                              }))}
                              className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-base font-bold leading-none"
                              title="添加副奖励"
                            >
                              +
                            </motion.button>
                          )}
                        </div>
                        {form.extraBoosts.map((boost, idx) => {
                          const otherUsed = new Set<string>([
                            form.attribute,
                            ...form.extraBoosts.filter((_, i) => i !== idx).map(b => b.attribute),
                          ]);
                          return (
                            <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30">
                              <select
                                value={boost.attribute}
                                onChange={(e) => setForm(prev => {
                                  const next = [...prev.extraBoosts];
                                  next[idx] = { ...next[idx], attribute: e.target.value as AttributeId };
                                  return { ...prev, extraBoosts: next };
                                })}
                                className="flex-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-primary"
                              >
                                {Object.entries(settings.attributeNames).map(([key, name]) =>
                                  (!otherUsed.has(key) || boost.attribute === key) && (
                                    <option key={key} value={key}>{name}</option>
                                  )
                                )}
                              </select>
                              <Stepper
                                value={boost.points}
                                min={1}
                                max={5}
                                aria-label="副奖励点数"
                                onChange={(v) => setForm(prev => {
                                  const next = [...prev.extraBoosts];
                                  next[idx] = { ...next[idx], points: v };
                                  return { ...prev, extraBoosts: next };
                                })}
                              />
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                type="button"
                                onClick={() => setForm(prev => ({
                                  ...prev,
                                  extraBoosts: prev.extraBoosts.filter((_, i) => i !== idx),
                                }))}
                                className="w-7 h-7 flex-shrink-0 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center text-base font-bold"
                              >
                                −
                              </motion.button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* ── ④ 更多设置（折叠：重要 / 每日 / 周几 / 启用 / 启用日期） ── */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowMore(prev => !prev)}
                    className="w-full flex items-center justify-between text-left text-sm font-medium text-gray-700 dark:text-gray-300 py-1"
                  >
                    <span>更多设置</span>
                    <motion.span animate={{ rotate: showMore ? 180 : 0 }} className="text-gray-400 text-xs">▼</motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {showMore && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2.5 pt-2">
                          {/* 重要标记（三频道皮沿用） */}
                          {isP4 ? (
                            <label
                              className="flex cursor-pointer items-center gap-3 rounded-2xl p-3.5 transition-colors"
                              style={{ background: form.important ? 'var(--p4-orange, #f9a11b)' : 'rgba(249, 161, 27, 0.55)' }}
                            >
                              <input
                                type="checkbox"
                                checked={form.important}
                                onChange={(e) => setForm(prev => ({ ...prev, important: e.target.checked }))}
                                className="peer sr-only"
                              />
                              <span
                                aria-hidden
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                                  form.important ? 'bg-[#131313]' : 'bg-white/70'
                                }`}
                              >
                                <P4Sparkle size={14} color={form.important ? 'var(--ui-bg)' : '#131313'} />
                              </span>
                              <div>
                                <span className="text-sm font-black text-[#131313]">标记为重要</span>
                                <p className="mt-0.5 text-xs font-semibold text-[#131313]/70">重要任务将在首页置顶显示，并记录在历史中</p>
                              </div>
                            </label>
                          ) : p3 ? (
                            <label className="relative flex cursor-pointer items-center gap-3 px-3 py-3" style={{ background: 'var(--p3r-panel-glass, rgba(255,255,255,0.8))', borderBottom: '2px solid rgba(53,209,232,0.7)' }}>
                              <input
                                type="checkbox"
                                checked={form.important}
                                onChange={(e) => setForm(prev => ({ ...prev, important: e.target.checked }))}
                                className="h-5 w-5"
                                style={{ accentColor: '#1b57ff' }}
                              />
                              <span aria-hidden className="h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent" style={{ borderLeftColor: '#f0417f' }} />
                              <div>
                                <span className="text-sm font-black text-[#0a1230]">标记为重要</span>
                                <p className="mt-0.5 text-xs font-semibold text-[#8a97ad]">重要任务将在首页置顶显示，并记录在历史中</p>
                              </div>
                            </label>
                          ) : (
                            <label className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.important}
                                onChange={(e) => setForm(prev => ({ ...prev, important: e.target.checked }))}
                                className="w-5 h-5 text-amber-500"
                              />
                              <div>
                                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">⭐ 标记为重要</span>
                                <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">重要任务将在首页置顶显示，并记录在历史中</p>
                              </div>
                            </label>
                          )}

                          {form.mode !== 'big' && (
                            <label className={`flex items-start gap-2.5 text-sm rounded-xl px-3 py-2.5 cursor-pointer ${
                              form.repeatDaily
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                : 'text-gray-600 dark:text-gray-300'
                            }`}>
                              <input
                                type="checkbox"
                                checked={form.repeatDaily}
                                onChange={(e) => setForm(prev => ({ ...prev, repeatDaily: e.target.checked, isLongTerm: e.target.checked ? false : prev.isLongTerm }))}
                                className="w-4 h-4 text-emerald-500 mt-0.5 rounded"
                              />
                              <div>
                                <span className="font-medium">每日重置</span>
                                <p className="text-xs opacity-70 mt-0.5">每天刷新任务，包括进度</p>
                              </div>
                            </label>
                          )}

                          {form.mode !== 'big' && (
                            <div>
                              <span className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400">每周几执行（可选）</span>
                              <div className="grid grid-cols-4 gap-1.5">
                                {weekdayLabels.map((label, index) => (
                                  <button
                                    key={label}
                                    type="button"
                                    onClick={() => toggleWeekday(index)}
                                    className={p3
                                      ? 'px-2 py-1.5 text-xs font-black transition-colors'
                                      : `px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                          form.weekdays.includes(index)
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                                        }`}
                                    style={p3 ? {
                                      clipPath: 'polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)',
                                      background: form.weekdays.includes(index) ? P3R.blue : P3R.cyanFaint,
                                      color: form.weekdays.includes(index) ? '#fff' : P3R.ink,
                                    } : undefined}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              {form.weekdays.length > 0 && (
                                <button type="button" onClick={() => setForm(prev => ({ ...prev, weekdays: [] }))} className="mt-2 text-xs text-gray-400 dark:text-gray-500 underline">
                                  清除选择
                                </button>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between py-1">
                            <span className="text-sm text-gray-600 dark:text-gray-400">是否启用</span>
                            <Toggle
                              checked={form.isActive}
                              onChange={(v) => setForm(prev => ({ ...prev, isActive: v }))}
                              aria-label="是否启用"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">指定启用日期（可选）</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="date"
                                value={form.startDate}
                                min={todayDateKey}
                                onChange={(e) => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              {form.startDate && (
                                <button type="button" onClick={() => setForm(prev => ({ ...prev, startDate: '' }))} className="text-xs text-gray-400 dark:text-gray-500 underline whitespace-nowrap">
                                  清除
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">设定后，该任务在指定日期前不会出现在今日任务中</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
      </SheetModal>

      {/* BIG DEAL 二级面板（聚合卡统一落点） */}
      <BigDealPanel todoId={dealPanelId} onClose={() => setDealPanelId(null)} />

      {/* 抽签仪式 */}
      <FateDrawSheet open={fateOpen} onClose={() => setFateOpen(false)} />

      {/* ── §4.6 长按上下文菜单：全页单实例，按 menuTodoId 寻址目标任务。
          关闭后 SheetModal 的 AnimatePresence 会用上一帧的子树播 exit，
          所以 menuTodo 为空时传空 actions 也不会让退场内容闪空 ── */}
      <ActionSheet
        isOpen={!!menuTodo}
        onClose={() => setMenuTodoId(null)}
        title={menuTodo?.title}
        actions={
          menuTodo
            ? [
                { label: '编辑', icon: <EditIcon />, onClick: () => handleEdit(menuTodo.id) },
                { label: '归档', icon: <ArchiveIcon />, onClick: () => updateTodo(menuTodo.id, { isActive: false }) },
                // active 卡此前没有删除入口，按协议补上；真正删除走下方 ConfirmDialog
                { label: '删除', icon: <TrashIcon />, tone: 'danger', onClick: () => setPendingDeleteId(menuTodo.id) },
              ]
            : []
        }
      />

      {/* ── 删除协议：所有删除入口（长按菜单 + 归档区快捷钮）汇于此单实例确认 ── */}
      <ConfirmDialog
        isOpen={!!pendingDeleteTodo}
        tone="danger"
        title="删除任务"
        description={pendingDeleteTodo ? `任务「${pendingDeleteTodo.title}」将被永久删除，无法撤销。` : undefined}
        confirmText="删除"
        onConfirm={() => {
          if (pendingDeleteTodo) deleteTodo(pendingDeleteTodo.id);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
};
