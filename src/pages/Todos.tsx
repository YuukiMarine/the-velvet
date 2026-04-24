import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { AttributeId, TodoFrequency, WeeklyGoal, WeeklyGoalItem, WeeklyGoalType } from '@/types';
import { triggerNavFeedback, triggerSuccessFeedback } from '@/utils/feedback';
import { PageTitle } from '@/components/PageTitle';
import { useRipple } from '@/components/RippleEffect';
import { useLongPress } from '@/utils/useLongPress';
import { v4 as uuidv4 } from 'uuid';

const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// Active todo card with long-press to edit
const ActiveTodoCard = ({
  todo,
  progress,
  attrName,
  allAttrNames,
  pct,
  onEdit,
  onArchive,
  renderFrequencyBadge,
}: {
  todo: ReturnType<typeof useAppStore.getState>['todos'][number];
  progress: { count: number; target: number; isComplete: boolean };
  attrName: string;
  allAttrNames: Record<string, string>;
  pct: number;
  onEdit: (id: string) => void;
  onArchive: (id: string) => void;
  renderFrequencyBadge: (frequency: import('@/types').TodoFrequency, targetCount?: number, isLongTerm?: boolean) => string;
}) => {
  const { pressing, bindings } = useLongPress(() => onEdit(todo.id));

  return (
    <motion.div
      animate={{ scale: pressing ? 0.97 : 1 }}
      transition={{ duration: 0.15 }}
      {...bindings}
      className={`rounded-xl px-4 py-3 border select-none cursor-default ${
        todo.important
          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200/70 dark:border-amber-700/40'
          : 'bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700/60'
      }`}
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
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v1.5a1 1 0 01-.4.8L9 8.5V13a1 1 0 01-1.447.894l-2-1A1 1 0 015 12V8.5L2.4 5.3A1 1 0 012 4.5V3zm1 0v1.5l3 3.75V12l2 1V8.25L11 4.5V3H3z" />
            </svg>
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
      {pressing && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-center">长按编辑…</p>
      )}
    </motion.div>
  );
};

// ── PendingWeekdayTodoCard（日期未到，在归档区显示） ───────────
const PendingWeekdayTodoCard = ({
  todo,
  attrName,
  onEdit,
  onArchive,
  onDelete,
  renderFrequencyBadge,
}: {
  todo: ReturnType<typeof useAppStore.getState>['todos'][number];
  attrName: string;
  onEdit: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  renderFrequencyBadge: (frequency: import('@/types').TodoFrequency, targetCount?: number, isLongTerm?: boolean) => string;
}) => {
  const { pressing, bindings } = useLongPress(() => onEdit(todo.id));

  return (
    <motion.div
      animate={{ scale: pressing ? 0.97 : 1 }}
      transition={{ duration: 0.15 }}
      {...bindings}
      className="rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700/60 bg-gray-50/60 dark:bg-gray-800/40 opacity-75 select-none cursor-default"
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
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v1.5a1 1 0 01-.4.8L9 8.5V13a1 1 0 01-1.447.894l-2-1A1 1 0 015 12V8.5L2.4 5.3A1 1 0 012 4.5V3zm1 0v1.5l3 3.75V12l2 1V8.25L11 4.5V3H3z" />
            </svg>
          </button>
          {/* 彻底删除 */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDelete(todo.id)}
            className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            title="删除"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
              <path d="M5 2h6l1 1H3L5 2zm-2 2h10l-1 9H4L3 4zm3 2v6h1V6H6zm3 0v6h1V6H9z" />
            </svg>
          </button>
        </div>
      </div>
      {pressing && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-center">长按编辑…</p>
      )}
    </motion.div>
  );
};

// ── Helper: 本周周一/周日 ──────────────────────────────────
function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffMon);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { weekStart: toLocalDateKey(mon), weekEnd: toLocalDateKey(sun) };
}

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const GOAL_TYPE_LABELS: Record<WeeklyGoalType, string> = {
  activity_count: '活动次数',
  todo_count: '任务完成',
  attr_points: '属性点数',
  total_points: '全属性点数',
};
const GOAL_TYPE_DESCS: Record<WeeklyGoalType, string> = {
  activity_count: '完成指定属性的记录次数',
  todo_count: '完成任务任务的次数',
  attr_points: '获得指定属性的点数',
  total_points: '所有属性的总获得点数',
};
const ALL_GOAL_TYPES: WeeklyGoalType[] = ['activity_count', 'todo_count', 'attr_points', 'total_points'];
const DEFAULT_TARGETS: Record<WeeklyGoalType, number> = {
  activity_count: 6,
  todo_count: 10,
  attr_points: 15,
  total_points: 36,
};

// Default goal items template (all 4 types, will be filtered by selection)
const makeDefaultItem = (type: WeeklyGoalType): WeeklyGoalItem => ({
  type,
  attribute: (type === 'activity_count' || type === 'attr_points') ? 'knowledge' : undefined,
  target: DEFAULT_TARGETS[type],
  current: 0,
});

// ── GoalSetupForm (shared between create & edit) ────────────────────────────
const GoalSetupForm = ({
  initialItems,
  initialReward,
  weekStart,
  weekEnd,
  settings,
  onConfirm,
  onCancel,
}: {
  initialItems: WeeklyGoalItem[];
  initialReward: string;
  weekStart: string;
  weekEnd: string;
  settings: ReturnType<typeof useAppStore.getState>['settings'];
  onConfirm: (items: WeeklyGoalItem[], reward: string) => void;
  onCancel: () => void;
}) => {
  // Which types are toggled on
  const [selectedTypes, setSelectedTypes] = useState<Set<WeeklyGoalType>>(
    () => new Set(initialItems.map(g => g.type))
  );
  // Config per type (target + attribute)
  const [itemConfigs, setItemConfigs] = useState<Record<WeeklyGoalType, WeeklyGoalItem>>(() => {
    const base: Record<string, WeeklyGoalItem> = {};
    ALL_GOAL_TYPES.forEach(t => {
      const existing = initialItems.find(g => g.type === t);
      base[t] = existing ?? makeDefaultItem(t);
    });
    return base as Record<WeeklyGoalType, WeeklyGoalItem>;
  });
  const [reward, setReward] = useState(initialReward);

  const toggleType = (type: WeeklyGoalType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size <= 2) return prev; // min 2
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const updateConfig = (type: WeeklyGoalType, patch: Partial<WeeklyGoalItem>) => {
    setItemConfigs(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  };

  const Stepper = ({ value, onChange, min = 1, max = 999 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onChange(Math.max(min, value - 1)); }}
        className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm flex items-center justify-center"
      >−</button>
      <span className="w-10 text-center text-sm font-bold tabular-nums text-gray-800 dark:text-white">{value}</span>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onChange(Math.min(max, value + 1)); }}
        className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm flex items-center justify-center"
      >+</button>
    </div>
  );

  const canConfirm = selectedTypes.size >= 2;

  const handleConfirm = () => {
    const items = ALL_GOAL_TYPES
      .filter(t => selectedTypes.has(t))
      .map(t => itemConfigs[t]);
    onConfirm(items, reward);
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
        <h3 className="font-bold text-gray-900 dark:text-white text-sm">设定本周目标</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{weekStart} ~ {weekEnd}　· 至少选择 2 项</p>
      </div>
      <div className="p-4 space-y-2">
        {ALL_GOAL_TYPES.map(type => {
          const isSelected = selectedTypes.has(type);
          const cfg = itemConfigs[type];
          const needsAttr = type === 'activity_count' || type === 'attr_points';
          return (
            <div
              key={type}
              className={`rounded-xl border-2 transition-all overflow-hidden ${
                isSelected
                  ? 'border-primary/60 bg-primary/5 dark:bg-primary/10'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40'
              }`}
            >
              {/* Toggle header row */}
              <button
                type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => toggleType(type)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    isSelected ? 'border-primary bg-primary' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {isSelected && (
                      <svg viewBox="0 0 10 8" className="w-3 h-3" fill="none">
                        <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isSelected ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>
                      {GOAL_TYPE_LABELS[type]}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{GOAL_TYPE_DESCS[type]}</p>
                  </div>
                </div>
                {!isSelected && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">点击添加</span>
                )}
              </button>

              {/* Expanded config (only when selected) */}
              <AnimatePresence initial={false}>
                {isSelected && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-3 flex items-center justify-between gap-3 border-t border-primary/10">
                      <div className="flex items-center gap-2 pt-2.5 flex-wrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400">目标</span>
                        {needsAttr && (
                          <select
                            value={cfg.attribute || 'knowledge'}
                            onChange={e => updateConfig(type, { attribute: e.target.value as AttributeId })}
                            onClick={e => e.stopPropagation()}
                            className="text-xs px-2 py-1 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 focus:outline-none"
                          >
                            {ATTR_IDS.map(id => (
                              <option key={id} value={id}>{settings.attributeNames[id]}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="pt-2.5">
                        <Stepper value={cfg.target} onChange={v => updateConfig(type, { target: v })} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}

        <div className="pt-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">完成奖励（选填）</label>
          <input
            type="text"
            value={reward}
            onChange={e => setReward(e.target.value)}
            placeholder="给自己一个奖励吧…"
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-800 dark:text-white focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium">取消</button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-40"
          >
            确认（{selectedTypes.size} 项）
          </motion.button>
        </div>
      </div>
    </div>
  );
};

// ── CelebrationModal ────────────────────────────────────────────────────────
const CelebrationModal = ({
  isOpen,
  onClose,
  settings,
  attributes,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  settings: ReturnType<typeof useAppStore.getState>['settings'];
  attributes: ReturnType<typeof useAppStore.getState>['attributes'];
  onConfirm: (attr: AttributeId) => void;
}) => {
  const [selectedAttr, setSelectedAttr] = useState<AttributeId | null>(null);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number; color: string }>>([]);
  const playedRef = useRef(false);

  const CONFETTI_COLORS = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'];

  useEffect(() => {
    if (isOpen) {
      setSelectedAttr(null);
      if (!playedRef.current) {
        triggerSuccessFeedback();
        playedRef.current = true;
      }
      setParticles(
        Array.from({ length: 40 }, (_, i) => ({
          id: i,
          x: (Math.random() - 0.5) * 280,
          y: (Math.random() - 0.5) * 260,
          delay: Math.random() * 0.6,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        }))
      );
    } else {
      playedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 18, stiffness: 280 }}
            className="relative bg-gradient-to-b from-amber-50 via-white to-white dark:from-gray-800 dark:via-gray-900 dark:to-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Particle burst */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {particles.map(p => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], x: p.x, y: p.y }}
                  transition={{ duration: 1.2, delay: p.delay, ease: 'easeOut' }}
                  className="absolute w-2.5 h-2.5 rounded-full"
                  style={{ left: '50%', top: '40%', backgroundColor: p.color }}
                />
              ))}
            </div>

            {/* Header */}
            <div className="relative text-center mb-5">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: [0, 1.4, 1], rotate: 0 }}
                transition={{ duration: 0.6, delay: 0.1, type: 'spring' }}
                className="text-5xl mb-3 inline-block"
              >
                🏆
              </motion.div>
              <motion.h3
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="text-xl font-bold text-gray-900 dark:text-white"
              >
                本周目标达成！
              </motion.h3>
              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.4 }}
                className="text-sm text-gray-500 dark:text-gray-400 mt-1"
              >
                选择这周最用力的方向，领取奖励
              </motion.p>
            </div>

            {/* Attribute selection */}
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="space-y-2 mb-5"
            >
              {ATTR_IDS.map(id => {
                const selected = selectedAttr === id;
                const attrName = settings.attributeNames[id];
                const attr = attributes.find(a => a.id === id);
                const pts = (attr && attr.level >= 3) ? 7 : 5;
                return (
                  <motion.button
                    key={id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedAttr(id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                      selected
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
                        selected ? 'border-amber-400 bg-amber-400' : 'border-gray-300 dark:border-gray-600'
                      }`} />
                      <span className={`text-sm font-semibold ${selected ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>
                        {attrName}
                      </span>
                    </div>
                    <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-lg ${
                      selected ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300' : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      +{pts} 点
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>

            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="flex gap-2"
            >
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-medium"
              >
                取消
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => selectedAttr && onConfirm(selectedAttr)}
                disabled={!selectedAttr}
                className="flex-2 flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold shadow-md shadow-amber-500/30 disabled:opacity-40 disabled:shadow-none"
              >
                领取奖励 ✨
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── ClaimedModal — reward confirmation ──────────────────────────────────────
const ClaimedModal = ({
  data,
  onClose,
}: {
  data: { attrName: string; pts: number } | null;
  onClose: () => void;
}) => {
  const [rings, setRings] = useState<Array<{ id: number; delay: number }>>([]);

  useEffect(() => {
    if (data) {
      setRings(Array.from({ length: 5 }, (_, i) => ({ id: i, delay: i * 0.12 })));
      const t = setTimeout(onClose, 2600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
            className="relative flex flex-col items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Expanding rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {rings.map(r => (
                <motion.div
                  key={r.id}
                  initial={{ scale: 0.3, opacity: 0.8 }}
                  animate={{ scale: 3.5, opacity: 0 }}
                  transition={{ duration: 1.0, delay: r.delay, ease: 'easeOut' }}
                  className="absolute w-24 h-24 rounded-full border-4 border-amber-400"
                />
              ))}
            </div>

            {/* Center content */}
            <div className="relative bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl px-10 py-8 shadow-2xl shadow-amber-500/40 flex flex-col items-center gap-3">
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: [0, 1.3, 1], rotate: 0 }}
                transition={{ duration: 0.5, type: 'spring', delay: 0.1 }}
                className="text-5xl"
              >
                ✨
              </motion.div>
              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-white font-bold text-xl tracking-wide"
              >
                奖励已领取！
              </motion.p>
              <motion.p
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
                className="text-white/90 text-base font-semibold"
              >
                {data.attrName} <span className="text-2xl font-black">+{data.pts}</span>
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── 本周目标组件 ──────────────────────────────────────────
const WeeklyGoalSection = ({
  settings, attributes, weeklyGoals,
  saveWeeklyGoal, deleteWeeklyGoal, completeWeeklyGoal, getWeeklyGoalProgress,
}: {
  settings: ReturnType<typeof useAppStore.getState>['settings'];
  attributes: ReturnType<typeof useAppStore.getState>['attributes'];
  weeklyGoals: WeeklyGoal[];
  saveWeeklyGoal: (g: WeeklyGoal) => Promise<void>;
  deleteWeeklyGoal: (id: string) => Promise<void>;
  completeWeeklyGoal: (id: string, attr: AttributeId) => Promise<void>;
  getWeeklyGoalProgress: (g: WeeklyGoal) => WeeklyGoalItem[];
}) => {
  const { weekStart, weekEnd } = getCurrentWeekRange();
  const currentGoal = weeklyGoals.find(g => g.weekStart === weekStart && g.weekEnd === weekEnd);

  // setup form
  const [showSetup, setShowSetup] = useState(false);
  // edit mode — re-open form with existing data
  const [showEditForm, setShowEditForm] = useState(false);

  // completion modals
  const [showComplete, setShowComplete] = useState(false);
  // claimed confirmation (shown after successful reward claim)
  const [showClaimed, setShowClaimed] = useState<{ attrName: string; pts: number } | null>(null);

  // long-press state
  const [showEditMenu, setShowEditMenu] = useState(false);
  const { pressing, bindings: pressBindings } = useLongPress(() => setShowEditMenu(true));

  const handleCreate = async (items: WeeklyGoalItem[], reward: string) => {
    const goal: WeeklyGoal = {
      id: uuidv4(),
      weekStart,
      weekEnd,
      goals: items,
      reward,
      completed: false,
      createdAt: new Date(),
    };
    await saveWeeklyGoal(goal);
    setShowSetup(false);
  };

  const handleEdit = async (items: WeeklyGoalItem[], reward: string) => {
    if (!currentGoal) return;
    const updated: WeeklyGoal = { ...currentGoal, goals: items, reward };
    await saveWeeklyGoal(updated);
    setShowEditForm(false);
    setShowEditMenu(false);
  };

  const handleReset = async () => {
    if (currentGoal) await deleteWeeklyGoal(currentGoal.id);
    // Reset all local UI state so nothing stale remains after deletion
    setShowEditMenu(false);
    setShowSetup(false);
    setShowEditForm(false);
  };

  const handleComplete = async (attr: AttributeId) => {
    if (!currentGoal) return;
    // Compute reward pts to show in the claimed modal (mirror store logic)
    const rewardAttr = attributes.find(a => a.id === attr);
    const pts = (rewardAttr && rewardAttr.level >= 3) ? 7 : 5;
    const attrName = settings.attributeNames[attr] || attr;
    await completeWeeklyGoal(currentGoal.id, attr);
    setShowComplete(false);
    setShowClaimed({ attrName, pts });
  };

  // Progress
  const progressItems = currentGoal ? getWeeklyGoalProgress(currentGoal) : [];
  const allMet = currentGoal && !currentGoal.completed && progressItems.length > 0 && progressItems.every(g => g.current >= g.target);

  const goalLabel = (g: WeeklyGoalItem) => {
    const attrName = g.attribute ? (settings.attributeNames[g.attribute as keyof typeof settings.attributeNames] || g.attribute) : '';
    switch (g.type) {
      case 'activity_count': return `完成 ${g.target} 次${attrName}活动`;
      case 'todo_count': return `完成 ${g.target} 次任务`;
      case 'attr_points': return `获得 ${g.target} 点${attrName}`;
      case 'total_points': return `获得 ${g.target} 点总点数`;
    }
  };

  // ── Render ──
  // No goal set yet
  if (!currentGoal) {
    if (!showSetup) {
      return (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowSetup(true)}
          className="w-full rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 py-5 text-center text-sm text-gray-400 dark:text-gray-500 hover:border-primary hover:text-primary transition-colors"
        >
          + 设定本周目标
        </motion.button>
      );
    }
    return (
      <GoalSetupForm
        initialItems={ALL_GOAL_TYPES.map(makeDefaultItem)}
        initialReward=""
        weekStart={weekStart}
        weekEnd={weekEnd}
        settings={settings}
        onConfirm={handleCreate}
        onCancel={() => setShowSetup(false)}
      />
    );
  }

  // Edit form (from "修改选项")
  if (showEditForm) {
    return (
      <GoalSetupForm
        initialItems={currentGoal.goals}
        initialReward={currentGoal.reward || ''}
        weekStart={weekStart}
        weekEnd={weekEnd}
        settings={settings}
        onConfirm={handleEdit}
        onCancel={() => setShowEditForm(false)}
      />
    );
  }

  // Goal exists — show progress
  const rewardAttr = currentGoal.completed && currentGoal.rewardAttribute
    ? (settings.attributeNames[currentGoal.rewardAttribute as keyof typeof settings.attributeNames] || currentGoal.rewardAttribute)
    : null;

  return (
    <>
      <motion.div
        animate={{ scale: pressing ? 0.97 : 1 }}
        transition={{ duration: 0.15 }}
        className={`rounded-2xl bg-white dark:bg-gray-900 border shadow-sm overflow-hidden select-none cursor-default ${
          currentGoal.completed
            ? 'border-emerald-200 dark:border-emerald-800'
            : allMet
            ? 'border-amber-300 dark:border-amber-700'
            : 'border-gray-100 dark:border-gray-800'
        }`}
        {...pressBindings}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">本周目标</h3>
            {currentGoal.completed && (
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">已完成</span>
            )}
          </div>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{weekStart} ~ {weekEnd}</span>
        </div>
        <div className="px-5 pb-4 space-y-2.5">
          {progressItems.map((g, idx) => {
            const pct = Math.min(100, g.target > 0 ? (g.current / g.target) * 100 : 0);
            const done = g.current >= g.target;
            return (
              <div key={idx}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs ${done ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                    {done ? '✓ ' : ''}{goalLabel(g)}
                  </span>
                  <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">{g.current}/{g.target}</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {currentGoal.reward && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-1">
              🎁 奖励：{currentGoal.reward}
            </p>
          )}
          {currentGoal.completed && rewardAttr && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium pt-1">
              ✨ 已获得 {rewardAttr} +{currentGoal.rewardPoints}
            </p>
          )}
          {allMet && !currentGoal.completed && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setShowComplete(true)}
              className="w-full mt-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold shadow-md shadow-amber-500/20"
            >
              🎉 目标达成！领取奖励
            </motion.button>
          )}
          {pressing && (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-0.5">
              {currentGoal.completed ? '松手删除记录…' : '松手打开菜单…'}
            </p>
          )}
        </div>
      </motion.div>

      {/* 编辑/重置菜单 */}
      <AnimatePresence>
        {showEditMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-end justify-center z-50"
            onClick={() => setShowEditMenu(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white dark:bg-gray-900 rounded-t-2xl w-full max-w-lg p-5 space-y-2"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-sm font-bold text-gray-800 dark:text-white mb-3">本周目标</p>
              {!currentGoal.completed && (
                <button
                  onClick={() => { setShowEditMenu(false); setShowEditForm(true); }}
                  className="w-full py-3 rounded-xl bg-primary/10 text-primary dark:text-primary text-sm font-semibold"
                >
                  修改选项
                </button>
              )}
              <button onClick={handleReset} className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium">
                {currentGoal.completed ? '删除本周目标记录' : '重置本周目标'}
              </button>
              <button onClick={() => setShowEditMenu(false)} className="w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm">取消</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 庆祝完成弹窗 */}
      <CelebrationModal
        isOpen={showComplete}
        onClose={() => setShowComplete(false)}
        settings={settings}
        attributes={attributes}
        onConfirm={handleComplete}
      />

      {/* 奖励已领取确认动画 */}
      <ClaimedModal
        data={showClaimed}
        onClose={() => setShowClaimed(null)}
      />
    </>
  );
};

export const Todos = () => {
  const { todos, settings, attributes, addTodo, updateTodo, deleteTodo, getTodayTodoProgress, getTodoDateLabel, weeklyGoals, saveWeeklyGoal, deleteWeeklyGoal, completeWeeklyGoal, getWeeklyGoalProgress } = useAppStore();
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

  const { spawn: spawnAddRipple, ripples: addRipples } = useRipple();

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

  // 点数加减组件
  const PointsControl = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
    <div className="flex items-center gap-2">
      <motion.button
        whileTap={{ scale: 0.9 }}
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300 font-bold flex items-center justify-center"
      >
        −
      </motion.button>
      <span className="w-8 text-center font-bold text-gray-800 dark:text-white">{value}</span>
      <motion.button
        whileTap={{ scale: 0.9 }}
        type="button"
        onClick={() => onChange(Math.min(5, value + 1))}
        className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300 font-bold flex items-center justify-center"
      >
        +
      </motion.button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <PageTitle title="任务清单" en="To-do" />
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            spawnAddRipple(e);
            triggerNavFeedback();
            setEditingTodoId(null);
            resetForm();
            setShowAdd(true);
          }}
          className="relative overflow-hidden px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold shadow-sm shadow-primary/20"
        >
          {addRipples}
          + 添加任务
        </motion.button>
      </div>

      {/* ── 本周目标 ───────────────────────────────────── */}
      <WeeklyGoalSection
        settings={settings}
        attributes={attributes}
        weeklyGoals={weeklyGoals}
        saveWeeklyGoal={saveWeeklyGoal}
        deleteWeeklyGoal={deleteWeeklyGoal}
        completeWeeklyGoal={completeWeeklyGoal}
        getWeeklyGoalProgress={getWeeklyGoalProgress}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 今日任务 */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white">今日任务</h3>
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
              {activeTodos.length} 项
            </span>
          </div>
          <div className="p-3 space-y-2">
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
                  onEdit={handleEdit}
                  onArchive={(id) => updateTodo(id, { isActive: false })}
                  renderFrequencyBadge={renderFrequencyBadge}
                />
              );
            })}
            {activeTodos.length === 0 && (
              <div className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                还没有任务，添加一个开始吧
              </div>
            )}
          </div>
        </div>

        {/* 已归档 */}
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="font-bold text-gray-900 dark:text-white">已归档</h3>
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
              {completedArchivedTodos.length + inactiveArchivedTodos.length + pendingDateTodos.length} 项
            </span>
          </div>
          <div className="p-3 space-y-2">

            {/* ── 未到日期（startDate 在未来 / 今日不在指定星期内）── */}
            {pendingDateTodos.length > 0 && (
              <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 pt-1 pb-0.5">未到日期</div>
            )}
            {pendingDateTodos.map(todo => (
              <PendingWeekdayTodoCard
                key={todo.id}
                todo={todo}
                attrName={settings.attributeNames[todo.attribute]}
                onEdit={handleEdit}
                onArchive={(id) => updateTodo(id, { isActive: false })}
                onDelete={(id) => deleteTodo(id)}
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
              <motion.div
                key={todo.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl px-4 py-3 border bg-gray-50 dark:bg-gray-800/60 border-gray-100 dark:border-gray-700/60"
              >
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
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                        <path d="M11.5 2.5a1.5 1.5 0 012.121 2.121L5.561 12.682l-2.829.707.707-2.829L11.5 2.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                      title="删除"
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                        <path d="M5 2h6l1 1H3L5 2zm-2 2h10l-1 9H4L3 4zm3 2v6h1V6H6zm3 0v6h1V6H9z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => updateTodo(todo.id, { isActive: true, archivedAt: undefined })}
                      className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                      title="恢复（重置为未完成）"
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <g transform="rotate(110 8 8)">
                          <path d="M13.5 8A5.5 5.5 0 103 5.5" strokeLinecap="round" />
                          <path d="M3 2.5v3h3" strokeLinecap="round" strokeLinejoin="round" />
                        </g>
                      </svg>
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* ── 已完成 ── */}
            {completedArchivedTodos.length > 0 && (
              <>
                {(pendingDateTodos.length > 0 || inactiveArchivedTodos.length > 0) && <div className="border-t border-gray-100 dark:border-gray-800 my-1" />}
                <div className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider px-1 pt-1 pb-0.5">已完成</div>
              </>
            )}
            {(expandCompleted ? completedArchivedTodos : completedArchivedTodos.slice(0, 5)).map(todo => {
              const archivedProgress = getTodayTodoProgress(todo.id);
              const wasCompletedToday = archivedProgress.isComplete;
              return (
                <motion.div
                  key={todo.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl px-4 py-3 border bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200/50 dark:border-emerald-800/40"
                >
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
                        onClick={() => deleteTodo(todo.id)}
                        className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                        title="删除"
                      >
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                          <path d="M5 2h6l1 1H3L5 2zm-2 2h10l-1 9H4L3 4zm3 2v6h1V6H6zm3 0v6h1V6H9z" />
                        </svg>
                      </button>
                      {wasCompletedToday ? (
                        <button
                          onClick={() => updateTodo(todo.id, { isActive: true, completedAt: undefined, archivedAt: undefined })}
                          className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                          title="恢复"
                        >
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <g transform="rotate(110 8 8)">
                              <path d="M13.5 8A5.5 5.5 0 103 5.5" strokeLinecap="round" />
                              <path d="M3 2.5v3h3" strokeLinecap="round" strokeLinejoin="round" />
                            </g>
                          </svg>
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
              <div className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                归档区暂无内容
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-5 text-gray-900 dark:text-white">
                {editingTodoId ? '编辑任务' : '添加任务'}
              </h3>

              <div className="space-y-4">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="今日要完成什么？"
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />

                {/* 重要标记 */}
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
                        <PointsControl
                          value={form.points}
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
                            <PointsControl
                              value={boost.points}
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
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                          form.frequency === option.value
                            ? 'bg-primary text-white border-primary'
                            : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        {option.label}
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
                              className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                form.weekdays.includes(index)
                                  ? 'bg-primary text-white border-primary'
                                  : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                              }`}
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
                  <button
                    onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                    className={`w-12 h-7 rounded-full transition-colors ${
                      form.isActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`block w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${
                        form.isActive ? 'translate-x-5' : 'translate-x-1'
                      }`}
                    />
                  </button>
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

              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSave}
                  className="flex-1 bg-primary text-white py-2.5 rounded-xl font-medium"
                >
                  {editingTodoId ? '保存' : '添加'}
                </button>
                <button
                  onClick={() => {
                    setShowAdd(false);
                    setEditingTodoId(null);
                    resetForm();
                  }}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
