/**
 * 通知面板 —— 展示当前用户的通知列表。
 * 支持：
 *   - 查看好友申请 → 接受 / 拒绝
 *   - 查看其他类型的通知 → 标记已读 / 删除
 *   - 刷新
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { useCloudStore } from '@/store/cloud';
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '@/services/notifications';
import { acceptFriendRequest, rejectFriendRequest } from '@/services/friends';
import { rejectCoopBond } from '@/services/coopBonds';
import { loadSocial } from '@/services/social';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';
import type { CoopBond, NotificationEntry } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 点击"响应 COOP 提议"时，把对应 bond 交给外层打开 accept modal */
  onOpenCoopAccept?: (bond: CoopBond) => void;
}

export function NotificationsPanel({ isOpen, onClose, onOpenCoopAccept }: Props) {
  const dialogRef = useModalA11y(isOpen, onClose);
  const notifications = useCloudSocialStore(s => s.notifications);
  const unreadCount = useCloudSocialStore(s => s.unreadCount);
  const loading = useCloudSocialStore(s => s.loading);
  const markReadLocal = useCloudSocialStore(s => s.markNotificationRead);
  const removeLocal = useCloudSocialStore(s => s.removeNotification);
  const coopBonds = useCloudSocialStore(s => s.coopBonds);
  const updateCoopBond = useCloudSocialStore(s => s.updateCoopBond);
  const cloudUser = useCloudStore(s => s.cloudUser);

  const [working, setWorking] = useState<string | null>(null);
  // 是否隐藏"羁绊之影战斗"类通知 —— 持久化到 localStorage，用户切换后保留
  const [hideBattle, setHideBattle] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('velvet_hide_battle_notif') === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('velvet_hide_battle_notif', hideBattle ? '1' : '0');
  }, [hideBattle]);

  // 多选模式 + 选中集合
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 面板关闭时，重置多选状态（避免再次打开仍然停留在多选）
  useEffect(() => {
    if (!isOpen) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  // Android 返回键：
  //   - 多选模式下 → 先退出多选（匹配点"取消"按钮），不关闭面板
  //   - 其余 → 关闭面板（匹配点 ✕ 按钮 / 点遮罩）
  useBackHandler(isOpen, () => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      onClose();
    }
  });

  useEffect(() => {
    if (!isOpen) return;
    // 打开即刷新
    if (cloudUser) void loadSocial({ force: true });
  }, [isOpen, cloudUser]);

  const BATTLE_TYPES = new Set(['coop_shadow_spawned', 'coop_shadow_attacked', 'coop_shadow_defeated', 'coop_shadow_retreated']);
  const filteredNotifications = useMemo(() => {
    if (!hideBattle) return notifications;
    return notifications.filter(n => !BATTLE_TYPES.has(n.type));
  }, [notifications, hideBattle]);

  const battleHiddenCount = useMemo(
    () => notifications.filter(n => BATTLE_TYPES.has(n.type)).length,
    [notifications],
  );

  const grouped = useMemo(() => {
    const unread = filteredNotifications.filter(n => !n.read);
    const read = filteredNotifications.filter(n => n.read);
    return { unread, read };
  }, [filteredNotifications]);

  // markNotificationRead 现在会抛 —— UI 场景下不想打断用户操作，
  // 包一层静默 catch：本地仍然乐观更新，下次 loadSocial 如果 PB 还是 unread 会再显示红点
  const safeMarkRead = async (id: string): Promise<void> => {
    try {
      await markNotificationRead(id);
    } catch (err) {
      console.warn('[velvet-notifications] markRead failed (UI path)', id, err);
    }
  };

  const handleAccept = async (n: NotificationEntry) => {
    const friendshipId = n.payload?.friendship_id as string | undefined;
    if (!friendshipId) return;
    setWorking(n.id);
    try {
      await acceptFriendRequest(friendshipId);
      await safeMarkRead(n.id);
      markReadLocal(n.id);
      // 刷新一次，把 friendship status 更新到 linked
      await loadSocial({ force: true });
    } finally {
      setWorking(null);
    }
  };

  const handleReject = async (n: NotificationEntry) => {
    const friendshipId = n.payload?.friendship_id as string | undefined;
    if (!friendshipId) return;
    setWorking(n.id);
    try {
      await rejectFriendRequest(friendshipId);
      await safeMarkRead(n.id);
      markReadLocal(n.id);
      await loadSocial({ force: true });
    } finally {
      setWorking(null);
    }
  };

  const handleMarkRead = async (n: NotificationEntry) => {
    if (n.read) return;
    await safeMarkRead(n.id);
    markReadLocal(n.id);
  };

  const handleDelete = async (n: NotificationEntry) => {
    setWorking(n.id);
    try {
      await deleteNotification(n.id);
      removeLocal(n.id);
    } finally {
      setWorking(null);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(grouped.unread);
    for (const n of grouped.unread) markReadLocal(n.id);
  };

  // 点击"隐藏战斗消息"时：把所有未读的战斗通知一次性标记已读
  // （把红点消除，避免开关打开后用户既看不见也无法清理 unread 计数）
  const handleToggleHideBattle = () => {
    const next = !hideBattle;
    if (next) {
      const unreadBattle = notifications.filter(n => !n.read && BATTLE_TYPES.has(n.type));
      for (const n of unreadBattle) {
        void safeMarkRead(n.id);
        markReadLocal(n.id);
      }
    }
    setHideBattle(next);
  };

  // 多选：长按进入；点击卡片切换；右上角垃圾桶批量删除
  const handleLongPressEnter = (n: NotificationEntry) => {
    setSelectionMode(true);
    setSelectedIds(new Set([n.id]));
  };
  const handleToggleSelect = (n: NotificationEntry) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id);
      else next.add(n.id);
      return next;
    });
  };
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    setWorking('batch-delete');
    try {
      // 并行删除：一条失败不影响其他
      await Promise.all(
        ids.map(async id => {
          try {
            await deleteNotification(id);
            removeLocal(id);
          } catch (err) {
            console.warn('[velvet-notifications] batch delete failed', id, err);
          }
        }),
      );
    } finally {
      setSelectedIds(new Set());
      setSelectionMode(false);
      setWorking(null);
    }
  };

  const handleCoopProposalOpen = async (n: NotificationEntry) => {
    const bondId = n.payload?.coop_bond_id as string | undefined;
    if (!bondId || !onOpenCoopAccept) return;
    // 先 markRead（进入 accept 界面默认视为已看）
    if (!n.read) {
      void safeMarkRead(n.id);
      markReadLocal(n.id);
    }
    const bond = coopBonds.find(b => b.id === bondId);
    if (!bond) {
      // fallback: 本地没有 bond —— 可能数据还没同步，强制刷一次
      await loadSocial({ force: true });
      const refreshed = useCloudSocialStore.getState().coopBonds.find(b => b.id === bondId);
      if (refreshed) onOpenCoopAccept(refreshed);
      return;
    }
    onOpenCoopAccept(bond);
  };

  const handleCoopProposalReject = async (n: NotificationEntry) => {
    const bondId = n.payload?.coop_bond_id as string | undefined;
    if (!bondId) return;
    setWorking(n.id);
    try {
      const updated = await rejectCoopBond(bondId);
      updateCoopBond(bondId, updated);
      await safeMarkRead(n.id);
      markReadLocal(n.id);
      await loadSocial({ force: true });
    } finally {
      setWorking(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[180] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="modal"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="通知"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[86vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header —— 多选模式下切换到 "删除 + 取消 + 计数" */}
          <div
            className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3"
            style={{
              background: selectionMode
                ? 'linear-gradient(135deg, rgba(244,63,94,0.1), rgba(248,113,113,0.04))'
                : 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.04))',
            }}
          >
            {selectionMode ? (
              <>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="text-rose-500">☑</span>
                    多选模式
                  </h3>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 tabular-nums">
                    已选 {selectedIds.size} 条
                  </div>
                </div>
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.size === 0 || working === 'batch-delete'}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 active:scale-95 transition"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #f43f5e)' }}
                  aria-label="删除所选"
                  title={`删除 ${selectedIds.size} 条`}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
                <button
                  onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="text-indigo-500">✦</span>
                    通知
                  </h3>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {unreadCount > 0 ? `${unreadCount} 条未读` : '没有新消息'}
                  </div>
                </div>
                {grouped.unread.length > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/15"
                  >
                    全部已读
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center"
                  aria-label="关闭"
                >✕</button>
              </>
            )}
          </div>

          {/* 筛选 · 战斗消息开关（仅当存在羁绊之影相关通知时显示） */}
          {battleHiddenCount > 0 && !selectionMode && (
            <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2 text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">筛选</span>
              <button
                onClick={handleToggleHideBattle}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                  hideBattle
                    ? 'bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-400'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                <span>⚔️</span>
                <span>{hideBattle ? '已隐藏战斗消息' : '显示战斗消息'}</span>
                <span className="tabular-nums opacity-70">({battleHiddenCount})</span>
              </button>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading && notifications.length === 0 && (
              <div className="text-center text-xs text-gray-400 py-8">加载中…</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="py-16 text-center">
                <div className="text-5xl opacity-30 mb-3">✦</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  这里空无一物。
                  <br />好友申请、回应、祈愿都会在这里提醒你。
                </p>
              </div>
            )}
            {grouped.unread.length > 0 && (
              <SectionHeader label="新消息" />
            )}
            {grouped.unread.map(n => (
              <NotificationItem
                key={n.id}
                n={n}
                working={working === n.id}
                coopBondStatus={resolveCoopBondStatus(n, coopBonds)}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(n.id)}
                onLongPress={handleLongPressEnter}
                onToggleSelect={handleToggleSelect}
                onAccept={handleAccept}
                onReject={handleReject}
                onCoopOpen={handleCoopProposalOpen}
                onCoopReject={handleCoopProposalReject}
                onMarkRead={handleMarkRead}
                onDelete={handleDelete}
              />
            ))}
            {grouped.read.length > 0 && (
              <SectionHeader label="已读" />
            )}
            {grouped.read.map(n => (
              <NotificationItem
                key={n.id}
                n={n}
                working={working === n.id}
                coopBondStatus={resolveCoopBondStatus(n, coopBonds)}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(n.id)}
                onLongPress={handleLongPressEnter}
                onToggleSelect={handleToggleSelect}
                onAccept={handleAccept}
                onReject={handleReject}
                onCoopOpen={handleCoopProposalOpen}
                onCoopReject={handleCoopProposalReject}
                onMarkRead={handleMarkRead}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ── 子组件 ─────────────────────────────────────────────

const SectionHeader = ({ label }: { label: string }) => (
  <div className="text-[10px] font-bold tracking-widest text-gray-400 uppercase px-2 pt-2 pb-1">
    {label}
  </div>
);

/**
 * 对 coop_proposal 通知，把对应 bond 的最新状态抓出来。
 * 其他类型返回 null。
 * null → 通知不是 coop_proposal 或找不到 bond；其他 → bond 当前 status。
 */
function resolveCoopBondStatus(n: NotificationEntry, bonds: CoopBond[]): CoopBond['status'] | null {
  if (n.type !== 'coop_proposal') return null;
  const bondId = n.payload?.coop_bond_id as string | undefined;
  if (!bondId) return null;
  const bond = bonds.find(b => b.id === bondId);
  return bond?.status ?? null;
}

function NotificationItem({
  n,
  working,
  coopBondStatus,
  selectionMode,
  isSelected,
  onLongPress,
  onToggleSelect,
  onAccept,
  onReject,
  onCoopOpen,
  onCoopReject,
  onMarkRead,
  onDelete,
}: {
  n: NotificationEntry;
  working: boolean;
  coopBondStatus: CoopBond['status'] | null;
  selectionMode: boolean;
  isSelected: boolean;
  onLongPress: (n: NotificationEntry) => void;
  onToggleSelect: (n: NotificationEntry) => void;
  onAccept: (n: NotificationEntry) => void;
  onReject: (n: NotificationEntry) => void;
  onCoopOpen: (n: NotificationEntry) => void;
  onCoopReject: (n: NotificationEntry) => void;
  onMarkRead: (n: NotificationEntry) => void;
  onDelete: (n: NotificationEntry) => void;
}) {
  const isPendingFriend = n.type === 'friend_request';
  const isCoopProposal = n.type === 'coop_proposal';
  const coopPending = isCoopProposal && coopBondStatus === 'pending';
  const coopResolved = isCoopProposal && coopBondStatus != null && coopBondStatus !== 'pending';
  const title = TITLE_BY_TYPE[n.type] ?? '系统消息';
  const fromName = n.fromProfile?.nickname || n.fromProfile?.userId || '陌生人';
  const detail = describePayload(n);
  const timeText = formatRelative(n.createdAt);

  // 长按 480ms 进入多选；被点击的这一条预选中
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = () => {
    if (selectionMode) return; // 已在多选态下，长按无额外语义
    didLongPress.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      try { navigator.vibrate?.(10); } catch { /* noop */ }
      onLongPress(n);
    }, 480);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const handleCardClick = (e: React.MouseEvent) => {
    if (didLongPress.current) {
      didLongPress.current = false;
      e.preventDefault();
      return;
    }
    if (selectionMode) {
      e.stopPropagation();
      onToggleSelect(n);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleCardClick}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={(e) => { if (!selectionMode) { e.preventDefault(); didLongPress.current = true; onLongPress(n); } }}
      className={`relative p-3 rounded-2xl border transition-all ${
        isSelected
          ? 'bg-rose-500/10 border-rose-500/50 ring-2 ring-rose-500/30'
          : selectionMode
          ? 'bg-white dark:bg-gray-800/40 border-gray-200/70 dark:border-gray-700/60 cursor-pointer'
          : n.read
          ? 'bg-white dark:bg-gray-800/40 border-gray-100 dark:border-gray-700/50'
          : 'bg-indigo-500/5 border-indigo-500/25'
      }`}
    >
      {/* 多选态下右上角的 checkbox（视觉指示，不可独立点击） */}
      {selectionMode && (
        <div
          className={`absolute top-2 right-2 w-5 h-5 rounded-md border-2 flex items-center justify-center text-white text-[11px] font-black pointer-events-none ${
            isSelected
              ? 'bg-rose-500 border-rose-500'
              : 'bg-white/80 dark:bg-gray-900/60 border-gray-300 dark:border-gray-600'
          }`}
        >
          {isSelected && '✓'}
        </div>
      )}
      <div className="flex items-start gap-2.5">
        {/* 头像占位 */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-indigo-500/20 text-indigo-500 font-bold text-base flex items-center justify-center">
          {n.fromProfile?.avatarUrl ? (
            <img src={n.fromProfile.avatarUrl} alt={fromName} className="w-full h-full object-cover" />
          ) : (
            (fromName[0] || '?').toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-800 dark:text-white">
              {title}
            </span>
            {!n.read && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500" />
            )}
            <span className="text-[10px] text-gray-400 ml-auto">{timeText}</span>
          </div>
          <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5 leading-relaxed">
            <span className="font-semibold" style={{ color: 'var(--color-primary, #6366f1)' }}>{fromName}</span>
            {' '}
            {detail}
          </div>

          {isPendingFriend && !n.read && !selectionMode && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onAccept(n)}
                disabled={working}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white shadow-sm disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
              >
                {working ? '处理中…' : '接受'}
              </button>
              <button
                onClick={() => onReject(n)}
                disabled={working}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/30 disabled:opacity-40"
              >
                拒绝
              </button>
            </div>
          )}

          {coopPending && !selectionMode && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onCoopOpen(n)}
                disabled={working}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white shadow-sm disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #ec4899, #db2777)' }}
              >
                响应
              </button>
              <button
                onClick={() => onCoopReject(n)}
                disabled={working}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/30 disabled:opacity-40"
              >
                {working ? '…' : '拒绝'}
              </button>
            </div>
          )}

          {coopResolved && (
            <div className="mt-2 px-2.5 py-1.5 rounded-lg text-[11px]"
              style={{
                background: 'rgba(148,163,184,0.1)',
                color: '#64748b',
                border: '1px dashed rgba(148,163,184,0.3)',
              }}>
              {coopBondStatus === 'linked' ? '· 已缔结 COOP，无需再响应。'
                : coopBondStatus === 'rejected' ? '· 已拒绝这次提议。'
                : coopBondStatus === 'severed' ? '· 此 COOP 已被解除。'
                : coopBondStatus === 'expired' ? '· 提议已过期。'
                : '· 此提议已不可响应。'}
            </div>
          )}

          {!isPendingFriend && !isCoopProposal && !n.read && !selectionMode && (
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={() => onMarkRead(n)}
                className="text-[10px] text-indigo-500 hover:text-indigo-600"
              >
                标为已读
              </button>
              <button
                onClick={() => onDelete(n)}
                disabled={working}
                className="ml-auto text-[10px] text-rose-400 hover:text-rose-500 disabled:opacity-40"
              >
                删除
              </button>
            </div>
          )}

          {n.read && !selectionMode && (
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={() => onDelete(n)}
                disabled={working}
                className="ml-auto text-[10px] text-gray-400 hover:text-rose-500 disabled:opacity-40"
              >
                删除
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── 辅助 ─────────────────────────────────────────────

const TITLE_BY_TYPE: Record<string, string> = {
  friend_request: '好友申请',
  friend_accepted: '接受了你的申请',
  friend_rejected: '拒绝了你的申请',
  prayer_received: '为你祈愿',
  prayer_reciprocal: '愿望之光交汇',
  coop_proposal: 'COOP 关系提议',
  coop_accepted: '接受了 COOP 提议',
  coop_rejected: '拒绝了 COOP 提议',
  coop_severed: '解除了 COOP 关系',
  event_logged: '在共享事件里写了一笔',
  coop_event_logged: '在 COOP 历史里记下了一笔',
  coop_shadow_spawned: '羁绊之影降临',
  coop_shadow_attacked: '对羁绊之影出手了',
  coop_shadow_defeated: '共同封印了羁绊之影',
  coop_shadow_retreated: '羁绊之影已撤退',
  system: '系统消息',
};

function describePayload(n: NotificationEntry): string {
  if (n.type === 'friend_request') {
    const msg = (n.payload?.message as string | undefined)?.trim();
    return msg ? `想加你为好友：「${msg.slice(0, 60)}」` : '想加你为好友。';
  }
  if (n.type === 'friend_accepted') return '通过了好友申请，可以在同伴列表里看到对方了。';
  if (n.type === 'friend_rejected') return '这次没接受；3 天后可再试。';
  if (n.type === 'prayer_received') return n.read ? '送来了 2 点 SP（已入账）。' : '送来了 2 点 SP，待入账。';
  if (n.type === 'prayer_reciprocal') return '今天你们互相祈愿了 ——愿望之光反射回你。';
  if (n.type === 'coop_proposal') {
    const msg = (n.payload?.message as string | undefined)?.trim();
    return msg ? `想与你缔结 COOP：「${msg.slice(0, 60)}」` : '想与你缔结 COOP 关系。';
  }
  if (n.type === 'coop_accepted') return '接受了你的 COOP 提议 —— 在同伴列表里看 Ta。';
  if (n.type === 'coop_rejected') return '这次没接受你的 COOP 提议；3 天后可再试。';
  if (n.type === 'coop_severed') return '解除了 COOP 关系。';
  if (n.type === 'event_logged') return '在你们之间写了一笔。';
  if (n.type === 'coop_event_logged') {
    const narrative = (n.payload?.narrative as string | undefined)?.trim();
    return narrative ? `在历史里记下：「${narrative.slice(0, 60)}」` : '在 COOP 历史里记下了一笔（已同步到你这边）。';
  }
  if (n.type === 'coop_shadow_spawned') {
    return '一只羁绊之影降临了。10 天之内，每晚 18:00 到次日 07:00 可以挑战它。';
  }
  if (n.type === 'coop_shadow_attacked') {
    const persona = (n.payload?.persona_name as string | undefined)?.trim();
    const skill = (n.payload?.skill_name as string | undefined)?.trim();
    const dmg = typeof n.payload?.damage === 'number' ? (n.payload.damage as number) : null;
    const resonance = Boolean(n.payload?.resonance_bonus);
    const weakness = Boolean(n.payload?.weakness_bonus);
    const hpLeft = typeof n.payload?.hp_remaining === 'number' ? (n.payload.hp_remaining as number) : null;
    const badges = [resonance && '共鸣', weakness && '弱点'].filter(Boolean).join(' · ');
    const bits = [
      persona && skill ? `使用 ${persona} · ${skill}` : null,
      dmg !== null ? `造成 ${dmg} 伤害` : null,
      badges ? `(${badges})` : null,
      hpLeft !== null ? `Boss 剩余 HP ${hpLeft}` : null,
    ].filter(Boolean).join(' · ');
    return bits || '对羁绊之影出手了。';
  }
  if (n.type === 'coop_shadow_defeated') {
    return '一起封印了这只影 —— 进入「同伴」卡片中的「共战纪念」查看图章。';
  }
  if (n.type === 'coop_shadow_retreated') {
    return '羁绊之影在 10 天的期限后悄然离去。下次月相之夜再会。';
  }
  return '';
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
