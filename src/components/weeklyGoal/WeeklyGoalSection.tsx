import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { useAppStore } from '@/store';
import { AttributeId, WeeklyGoal, WeeklyGoalItem } from '@/types';
import { useLongPress } from '@/utils/useLongPress';
import { v4 as uuidv4 } from 'uuid';
import { ALL_GOAL_TYPES, getCurrentWeekRange, makeDefaultItem } from './weeklyGoalShared';
import { GoalSetupForm } from './GoalSetupForm';
import { CelebrationModal } from './CelebrationModal';
import { ClaimedModal } from './ClaimedModal';

// ── 本周目标组件 ──────────────────────────────────────────
export const WeeklyGoalSection = ({
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
            ? 'border-emerald-300/70 dark:border-emerald-700/70'
            : allMet
            ? 'border-amber-300/80 dark:border-amber-600/70'
            : 'border-gray-200/80 dark:border-gray-700/80'
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
