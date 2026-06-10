import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useAppStore } from '@/store';
import { AttributeId, WeeklyGoalItem, WeeklyGoalType } from '@/types';
import { Stepper } from '@/components/Stepper';
import { ALL_GOAL_TYPES, ATTR_IDS, GOAL_TYPE_DESCS, GOAL_TYPE_LABELS, makeDefaultItem } from './weeklyGoalShared';

// ── GoalSetupForm (shared between create & edit) ────────────────────────────
export const GoalSetupForm = ({
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

  const canConfirm = selectedTypes.size >= 2;

  const handleConfirm = () => {
    const items = ALL_GOAL_TYPES
      .filter(t => selectedTypes.has(t))
      .map(t => itemConfigs[t]);
    onConfirm(items, reward);
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800/80">
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
                  ? 'border-primary/60 bg-primary/5 dark:border-gray-600 dark:bg-primary/10'
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
                    <div className="px-4 pb-3 flex items-center justify-between gap-3 border-t border-primary/10 dark:border-gray-700/70">
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
                        {/* 共享 Stepper（旧组件体内子组件已删——那会让每次 render 重建子树）。
                            展开区是头部 toggle 按钮的兄弟节点，外层无 onClick，无需 stopPropagation */}
                        <Stepper
                          value={cfg.target}
                          min={1}
                          max={999}
                          aria-label={`${GOAL_TYPE_LABELS[type]}目标`}
                          onChange={v => updateConfig(type, { target: v })}
                        />
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
