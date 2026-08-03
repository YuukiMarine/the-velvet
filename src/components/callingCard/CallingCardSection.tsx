import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { useUiChannel } from '@/ui/useUiChannel';
import { useLongPress } from '@/utils/useLongPress';
import { triggerLightHaptic } from '@/utils/feedback';
import { CallingCardCard } from './CallingCardCard';
import { CallingCardEditor } from './CallingCardEditor';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { zClass } from '@/utils/zIndex';
import type { CallingCard } from '@/types';

/**
 * 任务页的宣告卡管理区。
 *
 * UI 结构：
 *   - 标题 + "新建" 按钮
 *   - 活跃 (未归档) 列表
 *   - 已归档列表（默认折叠）
 *   - 卡片右上角 ⋯ 菜单：[编辑 / 钉到主页 / 归档 / 删除]
 *
 * 默认提供 id="calling-card-section" 锚点，HERO 卡进度条点击会滚到这里。
 */
export function CallingCardSection({ sectionId = 'calling-card-section' }: { sectionId?: string } = {}) {
  const { callingCards, pinCallingCard, archiveCallingCard, unarchiveCallingCard, deleteCallingCard } = useAppStore();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CallingCard | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  // 红频道：本区块的标题裸露在黑舞台上，需要单独配色（见下方注释）
  const p5 = useUiChannel() === 'p5';

  // F3 终端任务虽存于 callingCards 表，但有专属 TerminalTaskCard 渲染，不应进宣告卡列表
  const active = callingCards.filter(c => !c.archived && !c.terminal).sort((a, b) => {
    // 钉选的放最前；其次按 createdAt desc
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()) -
           (a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime());
  });
  const archived = callingCards.filter(c => c.archived && !c.terminal).sort((a, b) =>
    (b.archivedAt instanceof Date ? b.archivedAt.getTime() : new Date(b.archivedAt ?? 0).getTime()) -
    (a.archivedAt instanceof Date ? a.archivedAt.getTime() : new Date(a.archivedAt ?? 0).getTime())
  );

  const openCreate = () => { setEditingCard(null); setEditorOpen(true); };
  const openEdit = (card: CallingCard) => { setEditingCard(card); setEditorOpen(true); };

  return (
    <section id={sectionId} className="space-y-2">
      <div className="flex items-center justify-between px-1">
        {/* 红频道单列：这两行是**裸露在黑舞台上**的区块标题，不在任何纸卡里，
            所以吃不到 p5 的「灰系转黑」毯式规则——反而正是那条规则把 text-gray-900
            压成 #050505，黑字压黑底（实测 titleColor rgb(5,5,5) / stageBg 纯黑），
            用户上报的「calling card 和它左侧的字是黑色和灰色的」就是这里。
            与 GoalDeck 的「目标」同口径：纸色 + 墨色硬阴影。 */}
        <div className="flex items-baseline gap-2">
          {p5 ? (
            <>
              <h3 className="text-sm font-black" style={{ color: '#f0e9df', textShadow: '2px 2px 0 #000000' }}>倒计时</h3>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#c00008' }}>
                Calling Card
              </span>
            </>
          ) : (
            <>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">倒计时</h3>
              <span className="text-[10px] font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase">
                Calling Card
              </span>
            </>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={openCreate}
          className="px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-[11px] font-semibold hover:bg-primary/20 transition-colors"
        >
          + 新建
        </motion.button>
      </div>

      <div className="space-y-2">
        {active.length === 0 && archived.length === 0 && (
          <button
            onClick={openCreate}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/70 dark:bg-gray-900/70 border border-dashed border-gray-300 dark:border-gray-700 text-[12px] text-gray-600 dark:text-gray-300 hover:bg-primary/5 dark:hover:bg-primary/10 hover:border-primary/40 dark:hover:border-primary/50 transition-colors shadow-sm dark:shadow-none"
          >
            <span className="text-primary">✦</span>
            <span>还没有倒计时 — 立下约定</span>
          </button>
        )}

        {active.map(card => (
          <div key={card.id} className="relative">
            <CallingCardCard
              card={card}
              variant="list"
              onClick={() => openEdit(card)}
              menuSlot={
                <CardMenu
                  card={card}
                  open={openMenuId === card.id}
                  onToggle={() => setOpenMenuId(openMenuId === card.id ? null : card.id)}
                  onClose={() => setOpenMenuId(null)}
                  onPin={async () => { await pinCallingCard(card.pinned ? null : card.id); setOpenMenuId(null); }}
                  onEdit={() => { openEdit(card); setOpenMenuId(null); }}
                  onArchive={async () => { await archiveCallingCard(card.id); setOpenMenuId(null); }}
                  onDelete={async () => { await deleteCallingCard(card.id); setOpenMenuId(null); }}
                />
              }
            />
          </div>
        ))}

        {/* 已归档 */}
        {archived.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setArchivedExpanded(v => !v)}
              className={`w-full flex items-center gap-2 text-xs px-1 py-1.5 transition-colors ${
                p5 ? 'font-black' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              style={p5 ? { color: '#9b9791' } : undefined}
              aria-expanded={archivedExpanded}
            >
              <motion.span
                animate={{ rotate: archivedExpanded ? 90 : 0 }}
                transition={{ duration: 0.18 }}
                className="inline-block"
              >›</motion.span>
              <span className="font-semibold tracking-wider uppercase">归档</span>
              <span className="opacity-70">· {archived.length}</span>
            </button>
            <AnimatePresence initial={false}>
              {archivedExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  className="overflow-hidden space-y-2 pt-2"
                >
                  {archived.map(card => (
                    <ArchivedRow
                      key={card.id}
                      card={card}
                      onUnarchive={async () => { await unarchiveCallingCard(card.id); }}
                      onDelete={async () => { await deleteCallingCard(card.id); }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <CallingCardEditor
        isOpen={editorOpen}
        initialCard={editingCard}
        onClose={() => { setEditorOpen(false); setEditingCard(null); }}
      />
    </section>
  );
}

// ── 卡片右上角 ⋯ 菜单 ───────────────────────────────────
/**
 * ⚠️ 下拉层**必须 portal 到 body**，不能留在卡片里。
 *
 * 用户上报「⋯ 菜单点不了 / 红主题下被截断看不到 / 归档区的也一样」，实测量到两处裁切：
 *   ① 归档区外壳是 `overflow-hidden`（AnimatePresence 折叠高度动画要它），
 *      容器只有 66px 高，而下拉有 76~149px —— 直接被裁掉，且中心点命中的是别的元素；
 *   ② 红频道 index.css 有一条毯式规则
 *      `:root[data-ui-channel="p5"] .p5-reskin :is(.shadow-sm, …) { clip-path: polygon(…) }`，
 *      CallingCardCard 的根正好带 `shadow-sm`，于是整张卡被裁成 58px 高的斜片，
 *      长在里面的下拉一并被切没。
 * 这两处都不是"调 z-index 能解决"的问题：clip-path 与 overflow 裁的是**渲染与命中区**。
 * 唯一稳妥的解法是把浮层挪出这棵子树 —— 与本文件里 ConfirmDialog 早先的结论同源。
 *
 * 位置按触发按钮的视口坐标算，右对齐；下方放不下就翻到按钮上方；左右钳进视口。
 */
function CardMenu({
  card, open, onToggle, onClose,
  onPin, onEdit, onArchive, onUnarchive, onDelete,
}: {
  card: CallingCard;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPin?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const MENU_W = 160;
  const place = () => {
    const btn = rootRef.current?.getBoundingClientRect();
    if (!btn) return;
    const estH = 44 * [onPin, onEdit, onArchive, onUnarchive, true].filter(Boolean).length;
    const below = btn.bottom + 6;
    const flip = below + estH > window.innerHeight - 8;
    setPos({
      left: Math.max(8, Math.min(window.innerWidth - MENU_W - 8, btn.right - MENU_W)),
      top: flip ? Math.max(8, btn.top - estH - 6) : below,
    });
  };

  // 开启时定位；滚动/改尺寸时跟随（capture=true 才能收到内层滚动容器的事件）
  useEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 点外关闭：浮层已 portal 出去，判定要同时认「触发按钮」与「浮层本体」两棵子树
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onClose]);

  const itemCls = 'w-full px-3 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5';

  return (
    <div ref={rootRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        /**
         * 必须拦住 pointerdown 不让它冒到 GoalDeck。
         *
         * 这个区块整个被 GoalDeck 的 `motion.div drag="x"`（weeklyGoal/GoalDeck.tsx:194）
         * 包着，用来做「本周目标 ⇄ 倒计时」的横滑切换，容器还挂着 touch-action: pan-y
         * ——横向位移全归 Framer Motion。手指点这个 28px 的小目标时几乎必然带几 px 横移，
         * FM 判成拖拽起手，随后就会吃掉这一次 click，表现就是用户说的「蓝/黄主题下点不了」。
         * 同文件的 WeeklyGoalSection.tsx:247 早就为同一个坑加过这行，这里漏了。
         */
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggle}
        className="w-9 h-9 -my-1 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="菜单"
        aria-expanded={open}
      >
        ⋯
      </button>
      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={popRef}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.14 }}
              style={{ position: 'fixed', left: pos.left, top: pos.top, width: MENU_W }}
              className={`${zClass.cutin} rounded-xl overflow-hidden shadow-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700`}
            >
              {onPin && (
                <button
                  onClick={onPin}
                  className={itemCls}
                >
                  {card.pinned ? '取消钉选' : '📌 钉到主页'}
                </button>
              )}
              {onEdit && (
                <button
                  onClick={onEdit}
                  className={`${itemCls} border-t border-black/5 dark:border-white/5`}
                >
                  编辑
                </button>
              )}
              {onArchive && (
                <button
                  onClick={onArchive}
                  className={`${itemCls} border-t border-black/5 dark:border-white/5`}
                >
                  手动归档
                </button>
              )}
              {onUnarchive && (
                <button
                  onClick={onUnarchive}
                  className={`${itemCls} border-t border-black/5 dark:border-white/5`}
                >
                  取消归档
                </button>
              )}
              <button
                onClick={() => confirmDel ? onDelete() : setConfirmDel(true)}
                className={`w-full px-3 py-2.5 text-left text-xs font-semibold border-t border-black/5 dark:border-white/5 ${
                  confirmDel ? 'bg-red-500 text-white' : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                {confirmDel ? '确认删除' : '删除'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/**
 * 归档区单行组件：
 *   - 不再支持点击进入编辑（已经达成 / 过期，编辑无意义）
 *   - 长按 500ms → 弹出删除二次确认（取消 / 删除）
 *   - 仍保留右上 ⋯ 菜单的"取消归档 / 删除"作为备用入口（兼容键盘 / 桌面）
 */
function ArchivedRow({
  card,
  onUnarchive,
  onDelete,
}: {
  card: CallingCard;
  onUnarchive: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(
    () => {
      triggerLightHaptic();
      setConfirmOpen(true);
    },
    { durationMs: 500 },
  );

  return (
    <div className="relative">
      <motion.div
        animate={longPress.pressing ? { scale: 0.985 } : { scale: 1 }}
        transition={{ duration: 0.12 }}
        {...longPress.bindings}
        className="select-none"
      >
        <CallingCardCard
          card={card}
          variant="list"
          // 归档卡：不再 onClick 进入编辑；长按由父 div 接管
          menuSlot={
            <CardMenu
              card={card}
              open={menuOpen}
              onToggle={() => setMenuOpen(v => !v)}
              onClose={() => setMenuOpen(false)}
              onUnarchive={async () => { await onUnarchive(); setMenuOpen(false); }}
              onDelete={async () => { await onDelete(); setMenuOpen(false); }}
            />
          }
        />
      </motion.div>

      {/* 长按删除确认——换 ConfirmDialog 基座：portal 到 body（治 GoalDeck drag transform
          捕获树内 fixed 的全局 bug）+ p3 白斜卡/斜切双钮自动换装 */}
      <ConfirmDialog
        isOpen={confirmOpen}
        tone="danger"
        title={`删除「${card.title}」？`}
        description={'归档的倒计时不可恢复。\n历史"留下记录"保留不动。'}
        confirmText="删除"
        cancelText="取消"
        onConfirm={async () => { await onDelete(); setConfirmOpen(false); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
