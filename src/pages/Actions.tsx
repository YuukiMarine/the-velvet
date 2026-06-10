/**
 * 「行动」页 — 任务 / 记录合并宿主（UI_DESIGN_PLAN_V2.5.md §4 + UI_DESIGN_BOLD_V2.5.md §5「行动」行）。
 *
 * 结构：
 *   大字切换头（排版即图形：激活词 30px font-black 主题色，未激活 20px 灰）
 *   + Caveat 英文水印（PageTitle 同款制式）
 *   + 斜切下划线（layoutId 共享布局动画，spring 滑到激活词下方）
 *   + 子视图区（AnimatePresence mode="wait"，D3 同域子切换 180ms，方向感：任务在左、记录在右）
 *
 * 切换头本身就是页面标题——「行动」二字不单独出现，直接看到「任务／记录」信息量更高。
 * 子页状态持久在 store（actionsSubTab），自动记忆上次停留。
 */
import { Fragment, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PanInfo } from 'motion/react';
import { useAppStore } from '@/store';
import { springSnappy, TAP } from '@/utils/motion';
import { triggerNavFeedback } from '@/utils/feedback';
import { TodosView } from '@/pages/Todos';
import { ActivitiesView } from '@/pages/Activities';

type ActionsSubTab = 'todos' | 'activities';

/** 子页定义：顺序即空间方位（任务在左、记录在右），决定切换动画的进出方向 */
const TABS: Array<{ key: ActionsSubTab; label: string }> = [
  { key: 'todos', label: '任务' },
  { key: 'activities', label: '记录' },
];

export const Actions = () => {
  const { actionsSubTab, setActionsSubTab, currentPage, setCurrentPage } = useAppStore();

  // ── legacy 路由归一 ──────────────────────────────────────────────────────
  // 旧调用点仍可能 setCurrentPage('todos'/'activities')（App 把这两个旧 id 也映射到本页）。
  // 这里先把子页对齐到旧 id 对应的视图，再把 currentPage 归一为 'actions'，
  // 保证外部旧跳转自动落到正确子页且导航高亮状态一致。
  useEffect(() => {
    if (currentPage === 'todos' || currentPage === 'activities') {
      setActionsSubTab(currentPage);
      setCurrentPage('actions');
    }
  }, [currentPage, setActionsSubTab, setCurrentPage]);

  /** 切换子页：仅在目标不同时生效（点击已激活词 / 横滑回弹不触发音效） */
  const switchTab = (tab: ActionsSubTab) => {
    if (tab === actionsSubTab) return;
    triggerNavFeedback();
    setActionsSubTab(tab);
  };

  // 切换头横滑：左滑（位移 < -40）→ 记录，右滑（> 40）→ 任务（与子页左右方位一致）
  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -40) switchTab('activities');
    else if (info.offset.x > 40) switchTab('todos');
  };

  // 子页方向偏移：每个面板从自己的"方位侧"进、向同侧出——
  // 任务→记录时旧新内容一致向左流动，反向则一致向右，形成连贯的横移方向感
  const panelDir = actionsSubTab === 'todos' ? -24 : 24;

  return (
    // 页级进出场沿用全站页面制式（App 顶层 AnimatePresence 消费 exit）
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* ── 大字切换头 ─────────────────────────────────────────────────────
          外层定高（h-10 = 激活词 30px + 间隙 4px + 下划线 6px），字号 spring 动画期间
          行高浮动被吸收，下方子视图区不抖动；落位与原 PageTitle 标题行一致 */}
      <div className="relative h-10 mb-5">
        <motion.div
          role="tablist"
          aria-label="行动子页切换"
          // 横滑切换只挂在切换头这一行（不拦截整页/列表手势）；约束 0 让行体回弹归位
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={handleDragEnd}
          className="relative inline-flex items-baseline gap-2.5 select-none cursor-grab active:cursor-grabbing"
        >
          {TABS.map((tab, i) => {
            const active = actionsSubTab === tab.key;
            return (
              <Fragment key={tab.key}>
                {/* 词间灰色分隔斜杠（纯装饰） */}
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className="text-xl font-bold leading-none text-gray-300 dark:text-gray-600"
                  >
                    ／
                  </span>
                )}
                <motion.button
                  type="button"
                  role="tab"
                  id={`actions-tab-${tab.key}`}
                  aria-selected={active}
                  aria-controls={`actions-panel-${tab.key}`}
                  whileTap={TAP}
                  onClick={() => switchTab(tab.key)}
                  className="relative flex flex-col items-start"
                >
                  {/* 激活词大（30px font-black 主题色）/ 未激活词小（20px 灰）；
                      字号走 spring 插值，颜色/字重走 className 瞬切 + transition-colors 缓动 */}
                  <motion.span
                    animate={{ fontSize: active ? '30px' : '20px' }}
                    transition={springSnappy}
                    className={`leading-none tracking-tight transition-colors ${
                      active
                        ? 'font-black text-primary'
                        : 'font-semibold text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {tab.label}
                  </motion.span>
                  {/* 下划线占位槽：恒定尺寸，激活者渲染共享 layoutId 元素在两词间滑动 */}
                  <div className="h-1.5 w-9 mt-1" aria-hidden="true">
                    {active && (
                      <motion.div
                        layoutId="actions-underline"
                        transition={springSnappy}
                        className="h-1.5 w-9"
                      >
                        {/* 斜切落在内层：layout 动画期间 Framer projection 独占外层 transform
                            （SegmentTabs 已验证做法）；D0/校直模式下 --ui-skew-ui 自动归 0 */}
                        <div
                          className="h-full w-full bg-primary"
                          style={{ transform: 'skewX(var(--ui-skew-ui))' }}
                        />
                      </motion.div>
                    )}
                  </div>
                </motion.button>
              </Fragment>
            );
          })}

          {/* Caveat 英文水印 — PageTitle 同款字体类与右下角悬挂位 */}
          <span
            aria-hidden="true"
            className="absolute text-lg leading-none text-primary pointer-events-none"
            style={{ fontFamily: "'Caveat', cursive", fontWeight: 600, right: -4, bottom: -8 }}
          >
            action
          </span>
        </motion.div>
      </div>

      {/* ── 子视图区 ───────────────────────────────────────────────────────
          D3 同域子切换 180ms 制度；initial={false} 跳过随页面首挂的滑入
          （页级入场已由根容器 opacity 承担，避免双重动画） */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={actionsSubTab}
          role="tabpanel"
          id={`actions-panel-${actionsSubTab}`}
          aria-labelledby={`actions-tab-${actionsSubTab}`}
          initial={{ opacity: 0, x: panelDir }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: panelDir }}
          transition={{ duration: 0.18 }}
        >
          {actionsSubTab === 'todos' ? <TodosView /> : <ActivitiesView />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};
