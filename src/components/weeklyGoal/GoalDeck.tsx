import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { AttributeId, WeeklyGoal, WeeklyGoalItem } from '@/types';
import { CallingCardSection } from '@/components/callingCard/CallingCardSection';
import { WeeklyGoalSection } from './WeeklyGoalSection';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, slantClip } from '@/components/p3r/kit';

type GoalPanel = 'weekly' | 'countdown';

type GoalDeckProps = {
  settings: ReturnType<typeof useAppStore.getState>['settings'];
  attributes: ReturnType<typeof useAppStore.getState>['attributes'];
  weeklyGoals: WeeklyGoal[];
  saveWeeklyGoal: (g: WeeklyGoal) => Promise<void>;
  deleteWeeklyGoal: (id: string) => Promise<void>;
  completeWeeklyGoal: (id: string, attr: AttributeId) => Promise<void>;
  getWeeklyGoalProgress: (g: WeeklyGoal) => WeeklyGoalItem[];
};

const goalPanelTabs: Array<{ id: GoalPanel; label: string }> = [
  { id: 'weekly', label: '本周目标' },
  { id: 'countdown', label: '倒计时' },
];

const goalPanelVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 18 : -18 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -18 : 18 }),
};

export const GoalDeck = (props: GoalDeckProps) => {
  // P3R（蓝主题）壳：黑粗标题 + 蓝下划线文字 tabs + 白斜卡面板（p3-actions-reference-v3「目标」节）
  const p3 = useUiChannel() === 'p3';
  const [activePanel, setActivePanel] = useState<GoalPanel>(() => {
    try {
      const requestedPanel = sessionStorage.getItem('velvet:todos-goal-panel');
      if (requestedPanel === 'countdown') {
        sessionStorage.removeItem('velvet:todos-goal-panel');
        return 'countdown';
      }
    } catch { /* ignore unavailable sessionStorage */ }
    return 'weekly';
  });
  const [direction, setDirection] = useState(1);

  const openPanel = (next: GoalPanel) => {
    if (next === activePanel) return;
    setDirection(next === 'countdown' ? 1 : -1);
    setActivePanel(next);
  };

  useEffect(() => {
    const openCountdown = () => openPanel('countdown');
    window.addEventListener('velvet:open-calling-card-panel', openCountdown);
    return () => window.removeEventListener('velvet:open-calling-card-panel', openCountdown);
  }, [activePanel]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -48 || info.velocity.x < -420) openPanel('countdown');
    if (info.offset.x > 48 || info.velocity.x > 420) openPanel('weekly');
  };

  return (
    <section id="calling-card-section" className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        {p3 ? (
          <div>
            <h3 className="text-[22px] font-black leading-none" style={{ color: P3R.ink }}>目标</h3>
            <p className="mt-1 text-[12px] font-semibold" style={{ color: P3R.grey }}>本周推进和重要倒计时</p>
          </div>
        ) : (
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">目标</h3>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">本周推进和重要倒计时</p>
          </div>
        )}
        {p3 ? (
          /* 设计稿 tabs：选中 = 蓝字 + 蓝下划线；未选中 = 深字 */
          <div className="flex items-center gap-5 pb-0.5">
            {goalPanelTabs.map(tab => {
              const selected = activePanel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => openPanel(tab.id)}
                  className="relative pb-1.5 text-[14px] font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                  style={{ color: selected ? P3R.blue : P3R.ink }}
                >
                  {tab.label}
                  {selected && (
                    <motion.span
                      layoutId="goal-panel-tab-p3"
                      className="absolute inset-x-0 bottom-0 h-[3px]"
                      style={{ background: P3R.blue }}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/70">
            {goalPanelTabs.map(tab => {
              const selected = activePanel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => openPanel(tab.id)}
                  className={`relative z-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                    selected
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="goal-panel-tab"
                      className="absolute inset-0 -z-10 rounded-lg bg-white dark:bg-gray-700 shadow-sm"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={activePanel}
          custom={direction}
          variants={goalPanelVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.2, ease: 'easeOut' }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.16}
          onDragEnd={handleDragEnd}
          className="touch-pan-y"
        >
          {p3 ? (
            /* 白色大平行四边形卡壳 + 左上青倒三角（设计稿目标卡）；内容原组件不动。
               clip 只落在装饰底层——曾直接切内容容器，把内部长按菜单/编辑器等浮层
               裁进平行四边形（用户实测 bug），内容层必须保持无裁切。 */
            <div className="relative px-4 py-4">
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ clipPath: slantClip(18), background: '#ffffff', boxShadow: '0 14px 30px rgba(38,96,140,0.10)' }}
              />
              <span
                aria-hidden
                className="absolute left-6 top-0 h-[26px] w-[34px]"
                style={{ background: P3R.cyan, clipPath: 'polygon(0 0, 100% 0, 50% 100%)', opacity: 0.85 }}
              />
              <div className="relative">
                {activePanel === 'weekly' ? (
                  <WeeklyGoalSection {...props} />
                ) : (
                  <CallingCardSection sectionId="calling-card-panel" />
                )}
              </div>
            </div>
          ) : activePanel === 'weekly' ? (
            <WeeklyGoalSection {...props} />
          ) : (
            <CallingCardSection sectionId="calling-card-panel" />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
};
