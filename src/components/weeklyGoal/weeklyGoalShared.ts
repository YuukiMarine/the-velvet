import { toLocalDateKey } from '@/store';
import { AttributeId, WeeklyGoalItem, WeeklyGoalType } from '@/types';

// ── Helper: 本周周一/周日 ──────────────────────────────────
export function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffMon);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { weekStart: toLocalDateKey(mon), weekEnd: toLocalDateKey(sun) };
}

// 与 Todos.tsx 同源，刻意小量复制避免页面↔组件反向依赖
export const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
export const GOAL_TYPE_LABELS: Record<WeeklyGoalType, string> = {
  activity_count: '活动次数',
  todo_count: '任务完成',
  attr_points: '属性点数',
  total_points: '全属性点数',
};
export const GOAL_TYPE_DESCS: Record<WeeklyGoalType, string> = {
  activity_count: '完成指定属性的记录次数',
  todo_count: '完成任务的次数',
  attr_points: '获得指定属性的点数',
  total_points: '所有属性的总获得点数',
};
export const ALL_GOAL_TYPES: WeeklyGoalType[] = ['activity_count', 'todo_count', 'attr_points', 'total_points'];
const DEFAULT_TARGETS: Record<WeeklyGoalType, number> = {
  activity_count: 6,
  todo_count: 10,
  attr_points: 15,
  total_points: 36,
};

// Default goal items template (all 4 types, will be filtered by selection)
export const makeDefaultItem = (type: WeeklyGoalType): WeeklyGoalItem => ({
  type,
  attribute: (type === 'activity_count' || type === 'attr_points') ? 'knowledge' : undefined,
  target: DEFAULT_TARGETS[type],
  current: 0,
});
