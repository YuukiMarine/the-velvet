import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store';
import { AttributeId, WeeklyGoal, WeeklyGoalItem } from '@/types';
import { CallingCardSection } from '@/components/callingCard/CallingCardSection';
import { WeeklyGoalSection } from './WeeklyGoalSection';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Sparkle } from '@/ui/p4Kit';

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

  const isP4 = useUiChannel() === 'p4';

  return (
    <section id="calling-card-section" className="space-y-3">
      {isP4 ? (
        /* p4-actions-reference-v2：衬线「目标」+ 蓝星闪 + 蓝 blob 激活标签 */
        <div className="relative flex items-end justify-between gap-3 px-1">
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-[26px] font-black leading-none text-[#131313]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>
                目标
              </h3>
              <P4Sparkle size={14} color="var(--ui-accent)" />
            </div>
            <p className="mt-1 text-[11px] font-bold text-[#131313]/70">本周推进和重要倒计时</p>
          </div>
          <div className="flex items-center gap-1">
            {goalPanelTabs.map(tab => {
              const selected = activePanel === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => openPanel(tab.id)}
                  className={`relative z-0 px-3.5 py-2 text-[13px] font-black transition-colors ${
                    selected ? 'text-[#131313]' : 'text-[#131313]/75'
                  }`}
                >
                  {selected && (
                    <motion.span
                      layoutId="goal-panel-tab"
                      className="absolute inset-0 -z-10"
                      style={{ background: 'var(--ui-accent)', borderRadius: '58% 42% 55% 45% / 52% 58% 42% 48%', transform: 'rotate(-2deg)' }}
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  {selected && <P4Sparkle size={11} color="#ffffff" className="absolute -left-1 top-0.5" />}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white text-sm">目标</h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">本周推进和重要倒计时</p>
        </div>
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
      </div>
      )}

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
          {activePanel === 'weekly' ? (
            <WeeklyGoalSection {...props} />
          ) : (
            <CallingCardSection sectionId="calling-card-panel" />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
};
