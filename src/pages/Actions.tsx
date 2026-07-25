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
import { useUiChannel } from '@/ui/useUiChannel';
import { P4SkyCircle, P4_HEADER_BLEED } from '@/ui/p4Kit';
import { P3R, P3RPage, GhostWords, slantClip } from '@/components/p3r/kit';

type ActionsSubTab = 'todos' | 'activities';

/** 子页定义：顺序即空间方位（记录在左、任务在右），决定切换动画的进出方向 */
const TABS: Array<{ key: ActionsSubTab; label: string }> = [
  { key: 'activities', label: '记录' },
  { key: 'todos', label: '任务' },
];

export const Actions = () => {
  const { actionsSubTab, setActionsSubTab, currentPage, setCurrentPage } = useAppStore();
  const channel = useUiChannel();
  const isP4 = channel === 'p4';
  // P3R（蓝主题）形态：水面壳 + 设计稿切换头（p3-actions-reference-v3）
  const p3 = channel === 'p3';

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

  // 切换头横滑：左滑（位移 < -40）→ 任务（右），右滑（> 40）→ 记录（左），与子页左右方位一致
  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -40) switchTab('todos');
    else if (info.offset.x > 40) switchTab('activities');
  };

  // 子页方向偏移：每个面板从自己的"方位侧"进、向同侧出——
  // 记录（左）从左侧进出，任务（右）从右侧进出，形成连贯的横移方向感
  const panelDir = actionsSubTab === 'activities' ? -24 : 24;

  // ── P3R 形态（蓝主题）：设计稿切换头（蓝斜块选中 + 洋红角 / 黑字未选中）──
  if (p3) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <P3RPage className="overflow-hidden">
          <GhostWords words={['ACTION']} className="right-[8px] top-[64px] text-[72px]" />
          <div
            role="tablist"
            aria-label="行动子页切换"
            className="relative mb-6 flex items-center gap-5 pt-1"
          >
            {TABS.map((tab) => {
              const active = actionsSubTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`actions-tab-${tab.key}`}
                  aria-selected={active}
                  aria-controls={`actions-panel-${tab.key}`}
                  onClick={() => switchTab(tab.key)}
                  className="relative select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff] focus-visible:ring-offset-2"
                >
                  {active ? (
                    <span className="relative inline-block px-7 py-2.5" style={{ clipPath: slantClip(12), background: P3R.blue }}>
                      <span className="text-[22px] font-black leading-none text-white">{tab.label}</span>
                      {/* 右下洋红小角（设计稿签名细节） */}
                      <span aria-hidden className="absolute bottom-0 right-[10px] h-[7px] w-[12px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                    </span>
                  ) : (
                    <span className="text-[22px] font-black leading-none" style={{ color: P3R.ink }}>{tab.label}</span>
                  )}
                </button>
              );
            })}
          </div>
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
        </P3RPage>
      </motion.div>
    );
  }

  return (
    // 页级进出场沿用全站页面制式（App 顶层 AnimatePresence 消费 exit）
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* ── 大字切换头 ─────────────────────────────────────────────────────
          外层定高（h-10 = 激活词 30px + 间隙 4px + 下划线 6px），字号 spring 动画期间
          行高浮动被吸收，下方子视图区不抖动；落位与原 PageTitle 标题行一致。
          P4（p4-actions-reference-v2 1:1）：衬线双词 + 激活词背后橙圆 + 右上天空圆窗
          + ACTION PROGRAM 眉标；下划线退役。 */}
      {isP4 ? (
        <div className="relative -mx-4 mb-4 min-h-[126px] px-4 pb-1 pt-1" style={P4_HEADER_BLEED}>
          {/* 天空圆窗统一口径：贴容器上缘、只朝右出血；纵向由 P4_HEADER_BLEED 放行不再削顶削底 */}
          <P4SkyCircle size={150} className="absolute -right-8 -top-8" />
          <motion.div
            role="tablist"
            aria-label="行动子页切换"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="relative inline-flex select-none items-end gap-2.5 cursor-grab active:cursor-grabbing"
          >
            {TABS.map((tab, i) => {
              const active = actionsSubTab === tab.key;
              return (
                <Fragment key={tab.key}>
                  {i > 0 && (
                    <span aria-hidden className="pb-1 text-[30px] font-black leading-none text-[var(--p4-orange,#f9a11b)]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>
                      /
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
                    className="relative"
                  >
                    {/* 激活词背后的橙色太阳圆 */}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute -left-4 -top-4 h-[76px] w-[76px] rounded-full"
                        style={{ background: 'radial-gradient(circle at 45% 38%, #ffc23f 0 45%, var(--p4-orange, #f9a11b) 46% 100%)', opacity: 0.92 }}
                      />
                    )}
                    <motion.span
                      animate={{ fontSize: active ? '50px' : '28px' }}
                      transition={springSnappy}
                      className="relative block font-black leading-none tracking-tight text-[#131313]"
                      style={{ fontFamily: 'var(--p4-display-font, serif)' }}
                    >
                      {tab.label}
                    </motion.span>
                  </motion.button>
                </Fragment>
              );
            })}
          </motion.div>
          <div className="relative mt-2 text-xs font-black tracking-[0.22em] text-[#131313]">
            ACTION&nbsp;&nbsp;PROGRAM
          </div>
        </div>
      ) : (
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
      )}

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
