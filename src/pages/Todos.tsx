import { motion, AnimatePresence } from 'motion/react';
import { useMemo, useState } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
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
import { BigSlantTitle, GhostWords, P3EmptySlab, SlantButton } from '@/components/p3r/kit';
import { roughQuad, P5Wedge, P5Chip } from '@/components/p5r/kit';

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
  const [form, setForm] = useState({
    title: '',
    attribute: 'knowledge' as AttributeId,
    points: 2,
    extraBoosts: [] as Array<{ attribute: AttributeId; points: number }>,
    frequency: 'single' as TodoFrequency,
    targetCount: 1,
    repeatDaily: false,
    isLongTerm: false,
    weekdays: [] as number[],
    isActive: true,
    important: false,
    startDate: '' as string,
  });

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
    setForm({
      title: '',
      attribute: 'knowledge',
      points: 2,
      extraBoosts: [],
      frequency: 'single',
      targetCount: 1,
      repeatDaily: false,
      isLongTerm: false,
      weekdays: [],
      isActive: true,
      important: false,
      startDate: '',
    });
  };

  /** 统一关闭表单弹窗：SheetModal 的 backdrop/ESC/Android back 与"取消"按钮共用同一条路径 */
  const closeForm = () => {
    setShowAdd(false);
    setEditingTodoId(null);
    resetForm();
  };

  const [showWeekdays, setShowWeekdays] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim()) return;
    const validExtraBoosts = form.extraBoosts
      .filter(b => b.points >= 1)
      .map(b => ({ attribute: b.attribute, points: Math.max(1, Math.min(5, b.points)) }));
    const payload = {
      title: form.title.trim(),
      attribute: form.attribute,
      points: Math.max(1, Math.min(5, form.points)),
      extraBoosts: validExtraBoosts.length > 0 ? validExtraBoosts : undefined,
      frequency: form.frequency,
      targetCount: form.frequency === 'count' ? Math.max(1, form.targetCount) : undefined,
      repeatDaily: form.repeatDaily,
      isLongTerm: form.frequency === 'count' ? form.isLongTerm : false,
      weekdays: form.weekdays.sort(),
      isActive: form.isActive,
      important: form.important,
      startDate: form.startDate || undefined,
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
      attribute: todo.attribute,
      points: todo.points,
      extraBoosts: todo.extraBoosts ? [...todo.extraBoosts] : [],
      frequency: todo.frequency,
      targetCount: todo.targetCount || 1,
      repeatDaily: !!todo.repeatDaily,
      isLongTerm: !!todo.isLongTerm,
      weekdays: todo.weekdays || [],
      isActive: todo.isActive,
      important: !!todo.important,
      startDate: todo.startDate || '',
    });
    setShowAdd(true);
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
          <div className={isP4 || p3 ? 'space-y-2' : p5 ? 'relative space-y-2 px-3 pb-3 pt-5' : 'p-3 space-y-2'}>
            {p5 && (
              <>
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(4px,5px)', background: '#000000', clipPath: roughQuad(371, 8), zIndex: -1 }} />
                <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: '#050505', clipPath: roughQuad(372, 7), zIndex: -1 }} />
                <span aria-hidden className="pointer-events-none absolute inset-[3px]" style={{ background: '#f0e9df', clipPath: roughQuad(373, 5), zIndex: -1 }} />
              </>
            )}
            {activeTodos.map(todo => {
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
                ? 'h-14 w-14 text-white' // p5-redraw：纸圈黑影红八角（p5-menu 稿「+」形制）
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
          {p5 && (
            <span aria-hidden className="pointer-events-none absolute inset-0">
              <span className="absolute inset-0" style={{ transform: 'translate(3px,3.5px)', background: '#000000', clipPath: 'polygon(25% 7%, 66% 0%, 100% 25%, 94% 74%, 76% 100%, 33% 94%, 0% 76%, 7% 23%)' }} />
              <span className="absolute inset-0" style={{ background: '#f0e9df', clipPath: 'polygon(27% 5%, 69% 1%, 99% 28%, 93% 72%, 73% 99%, 30% 96%, 1% 74%, 6% 25%)' }} />
              <span className="absolute inset-[3px]" style={{ background: '#c00008', clipPath: 'polygon(27% 5%, 69% 1%, 99% 28%, 93% 72%, 73% 99%, 30% 96%, 1% 74%, 6% 25%)' }} />
            </span>
          )}
          {/* 白色加号（与记录子页 FAB 的 PlusIcon 同款笔画） */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isP4 ? 2.6 : 2} className={`relative ${isP4 ? 'w-5 h-5' : 'w-6 h-6'}`} aria-hidden="true">
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
              <div className="space-y-4">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="今日要完成什么？"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />

                {/* 重要标记：P4 = 橙色横幅 + 黑花（modal-02 v3），勾选态整条点亮；
                    p3 = 白面 + 洋红小三角 + 黑粗标签 + 青下划线（p3-modal-02 稿） */}
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
                  <label className="relative flex cursor-pointer items-center gap-3 px-3 py-3" style={{ background: 'rgba(255,255,255,0.8)', borderBottom: '2px solid rgba(53,209,232,0.7)' }}>
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

                {/* ── 多属性增长区域 ── */}
                {(() => {
                  // 当前已使用的属性集合
                  const usedAttrs = new Set<string>([
                    form.attribute,
                    ...form.extraBoosts.map(b => b.attribute),
                  ]);
                  // 还未被选中的第一个属性，用于点"+"时默认填入
                  const firstUnused = (ATTR_IDS.find(id => !usedAttrs.has(id)) ?? 'knowledge') as AttributeId;
                  const canAddMore = form.extraBoosts.length < 2 && usedAttrs.size < ATTR_IDS.length;

                  return (
                    <div className="space-y-2">
                      {/* 标签行：左边"增长属性"，右边"+"按钮 */}
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">增长属性</label>
                        {canAddMore && (
                          <motion.button
                            whileTap={{ scale: 0.88 }}
                            type="button"
                            onClick={() => setForm(prev => ({
                              ...prev,
                              extraBoosts: [...prev.extraBoosts, { attribute: firstUnused, points: 1 }],
                            }))}
                            className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-base font-bold leading-none"
                            title="添加增长属性"
                          >
                            +
                          </motion.button>
                        )}
                      </div>

                      {/* 主属性行 */}
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600">
                        <select
                          value={form.attribute}
                          onChange={(e) => setForm(prev => ({ ...prev, attribute: e.target.value as AttributeId }))}
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-primary"
                        >
                          {Object.entries(settings.attributeNames).map(([key, name]) => (
                            // 主属性：排除已被 extraBoosts 占用的选项
                            (!form.extraBoosts.some(b => b.attribute === key) || form.attribute === key) && (
                              <option key={key} value={key}>{name}</option>
                            )
                          ))}
                        </select>
                        <Stepper
                          value={form.points}
                          min={1}
                          max={5}
                          aria-label="主属性点数"
                          onChange={(v) => setForm(prev => ({ ...prev, points: v }))}
                        />
                        {/* 主属性无法删除，占位对齐 */}
                        <div className="w-7 h-7 flex-shrink-0" />
                      </div>

                      {/* 额外加成行 */}
                      {form.extraBoosts.map((boost, idx) => {
                        // 该行可选的属性：排除主属性和其他额外行已选的属性（保留自身当前值）
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
                              aria-label="额外属性点数"
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

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">完成频率</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'single', label: '单次' },
                      { value: 'count', label: '多次' }
                    ] as { value: TodoFrequency; label: string }[]).map(option => (
                      <button
                        key={option.value}
                        onClick={() => setForm(prev => ({ ...prev, frequency: option.value, isLongTerm: option.value === 'single' ? false : prev.isLongTerm }))}
                        className={p3
                          ? 'relative px-3 py-2.5 text-[15px] font-black italic transition-colors'
                          : `px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                              form.frequency === option.value
                                ? 'bg-primary text-white border-primary'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                            }`}
                        style={p3 ? {
                          clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
                          background: form.frequency === option.value ? '#1b57ff' : '#fff',
                          color: form.frequency === option.value ? '#fff' : '#0a1230',
                          boxShadow: form.frequency === option.value ? 'none' : '0 4px 12px rgba(38,96,140,0.08)',
                        } : undefined}
                      >
                        {option.label}
                        {p3 && form.frequency === option.value && (
                          <span aria-hidden className="absolute bottom-0 right-3 h-[7px] w-[16px]" style={{ background: '#f0417f', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {form.frequency === 'count' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">目标次数</label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={form.targetCount}
                      onChange={(e) => setForm(prev => ({ ...prev, targetCount: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">计划设置</label>
                  <div className="space-y-2.5">
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

                    {form.frequency === 'count' && (
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
                    )}
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => setShowWeekdays(prev => !prev)}
                    className="w-full flex items-center justify-between text-left text-sm font-medium text-gray-700 dark:text-gray-300 py-1"
                  >
                    <span>每周几执行（可选）</span>
                    <motion.span
                      animate={{ rotate: showWeekdays ? 180 : 0 }}
                      className="text-gray-400 text-xs"
                    >
                      ▼
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {showWeekdays && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-2"
                      >
                        <div className="grid grid-cols-4 gap-1.5">
                          {weekdayLabels.map((label, index) => (
                            <button
                              key={label}
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
                                background: form.weekdays.includes(index) ? '#1b57ff' : '#e2f2fa',
                                color: form.weekdays.includes(index) ? '#fff' : '#0a1230',
                              } : undefined}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {form.weekdays.length > 0 && (
                          <button
                            onClick={() => setForm(prev => ({ ...prev, weekdays: [] }))}
                            className="mt-2 text-xs text-gray-400 dark:text-gray-500 underline"
                          >
                            清除选择
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">是否启用</span>
                  {/* 统一开关基元（替代 w-12 h-7 自绘开关） */}
                  <Toggle
                    checked={form.isActive}
                    onChange={(v) => setForm(prev => ({ ...prev, isActive: v }))}
                    aria-label="是否启用"
                  />
                </div>

                {/* ── 未来启用日期 ── */}
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
                      <button
                        onClick={() => setForm(prev => ({ ...prev, startDate: '' }))}
                        className="text-xs text-gray-400 dark:text-gray-500 underline whitespace-nowrap"
                      >
                        清除
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">设定后，该任务在指定日期前不会出现在今日任务中</p>
                </div>
              </div>
      </SheetModal>

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
