import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useLongPress } from '@/utils/useLongPress';
import { triggerLightHaptic } from '@/utils/feedback';
import { CallingCardCard } from './CallingCardCard';
import { CallingCardEditor } from './CallingCardEditor';
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

  const active = callingCards.filter(c => !c.archived).sort((a, b) => {
    // 钉选的放最前；其次按 createdAt desc
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime()) -
           (a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime());
  });
  const archived = callingCards.filter(c => c.archived).sort((a, b) =>
    (b.archivedAt instanceof Date ? b.archivedAt.getTime() : new Date(b.archivedAt ?? 0).getTime()) -
    (a.archivedAt instanceof Date ? a.archivedAt.getTime() : new Date(a.archivedAt ?? 0).getTime())
  );

  const openCreate = () => { setEditingCard(null); setEditorOpen(true); };
  const openEdit = (card: CallingCard) => { setEditingCard(card); setEditorOpen(true); };

  return (
    <section id={sectionId} className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-baseline gap-2">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm">倒计时</h3>
          <span className="text-[10px] font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase">
            Calling Card
          </span>
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
            <span>还没有倒计时 — 立一张</span>
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
              className="w-full flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1 py-1.5 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onToggle}
        className="w-7 h-7 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="菜单"
        aria-expanded={open}
      >
        ⋯
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={onClose} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.14 }}
              className="absolute right-0 top-9 z-20 w-40 rounded-xl overflow-hidden shadow-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            >
              {onPin && (
                <button
                  onClick={onPin}
                  className="w-full px-3 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {card.pinned ? '取消钉选' : '📌 钉到主页'}
                </button>
              )}
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="w-full px-3 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5 border-t border-black/5 dark:border-white/5"
                >
                  编辑
                </button>
              )}
              {onArchive && (
                <button
                  onClick={onArchive}
                  className="w-full px-3 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5 border-t border-black/5 dark:border-white/5"
                >
                  手动归档
                </button>
              )}
              {onUnarchive && (
                <button
                  onClick={onUnarchive}
                  className="w-full px-3 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/5 border-t border-black/5 dark:border-white/5"
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
          </>
        )}
      </AnimatePresence>
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

      {/* 长按删除确认弹窗（与 Activities 删除二级风格一致：背景遮罩 + 居中卡片） */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="text-4xl mb-3 text-red-500">⚠️</div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">
                  删除「{card.title}」？
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  归档的倒计时不可恢复。<br />
                  历史"留下记录"保留不动。
                </p>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 py-2 rounded-lg font-medium"
                >
                  取消
                </button>
                <button
                  onClick={async () => { await onDelete(); setConfirmOpen(false); }}
                  className="flex-1 py-2 rounded-lg font-medium text-white bg-red-500"
                >
                  删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
