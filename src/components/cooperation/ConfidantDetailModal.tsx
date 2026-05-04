import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, toLocalDateKey } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { TAROT_BY_ID } from '@/constants/tarot';
import {
  INTIMACY_LABELS,
  INTIMACY_THRESHOLDS,
  MAX_INTIMACY,
  levelBasePoints,
  pointsToNextLevel,
  formatBuffDisplay,
} from '@/utils/confidantLevels';
import { useCloudStore } from '@/store/cloud';
import { ConfidantInteractionModal } from '@/components/cooperation/ConfidantInteractionModal';
import { ConfidantStarShiftModal } from '@/components/cooperation/ConfidantStarShiftModal';
import { CounselChatModal } from '@/components/cooperation/CounselChatModal';
import { CoopMemorialPanel } from '@/components/cooperation/CoopMemorialPanel';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';
import { triggerLightHaptic } from '@/utils/feedback';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';
import type { Confidant, ConfidantEvent } from '@/types';

type Tab = 'info' | 'abilities' | 'history';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  confidantId: string | null;
  /** 点击 @userId 时让父组件打开 OnlineConfidantProfileCard */
  onViewOnlineProfile?: (profile: import('@/types').CloudProfile, friendship: import('@/types').Friendship) => void;
  /** 点击 ⚔️ SHADOW 标签时让父组件打开 CoopShadowBattleModal */
  onOpenCoopShadow?: (shadow: import('@/types').CoopShadow, partnerName: string) => void;
}

const LEVEL_UP_CELEBRATED_PREFIX = 'velvet_confidant_level_celebrated';

const levelCelebrationKey = (confidantId: string, level: number) =>
  `${LEVEL_UP_CELEBRATED_PREFIX}_${confidantId}_${level}`;

const parseLevelUpLevel = (event: ConfidantEvent): number | null => {
  if (typeof event.toLevel === 'number' && Number.isFinite(event.toLevel)) return event.toLevel;
  const match = event.narrative?.match(/Lv\.?\s*(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const wasLevelCelebrated = (confidantId: string, level: number) => {
  try {
    return localStorage.getItem(levelCelebrationKey(confidantId, level)) === '1';
  } catch {
    return false;
  }
};

const markLevelCelebrated = (confidantId: string, level: number) => {
  try {
    localStorage.setItem(levelCelebrationKey(confidantId, level), '1');
  } catch { /* ignore unavailable localStorage */ }
};

const findUncelebratedLevelUps = (confidant: Confidant, events: ConfidantEvent[]) => {
  const seen = new Set<number>();
  return events
    .filter(e => e.confidantId === confidant.id && e.type === 'level_up')
    .map(event => ({ event, level: parseLevelUpLevel(event) }))
    .filter((item): item is { event: ConfidantEvent; level: number } =>
      item.level !== null
      && item.level > 1
      && item.level <= confidant.intimacy
      && !seen.has(item.level)
      && !wasLevelCelebrated(confidant.id, item.level),
    )
    .sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return new Date(a.event.createdAt).getTime() - new Date(b.event.createdAt).getTime();
    })
    .filter(item => {
      if (seen.has(item.level)) return false;
      seen.add(item.level);
      return true;
    });
};

export function ConfidantDetailModal({
  isOpen,
  onClose,
  confidantId,
  onViewOnlineProfile,
  onOpenCoopShadow,
}: Props) {
  const dialogRef = useModalA11y(isOpen, onClose);
  const {
    settings,
    confidants,
    confidantEvents,
    updateConfidant,
    archiveConfidant,
    unarchiveConfidant,
    deleteConfidant,
  } = useAppStore();

  const confidant = useMemo(
    () => confidants.find(c => c.id === confidantId) || null,
    [confidants, confidantId],
  );

  const events = useMemo(
    () => confidantEvents.filter(e => e.confidantId === confidantId).slice(0, 50),
    [confidantEvents, confidantId],
  );

  const coopBonds = useCloudSocialStore(s => s.coopBonds);
  const coopShadows = useCloudSocialStore(s => s.coopShadows);
  const friendships = useCloudSocialStore(s => s.friendships);
  const cloudUser = useCloudStore(s => s.cloudUser);

  // 在线同伴 + 未登录云端 → 全部编辑类操作都禁用；仅允许查看
  const isLockedOnline = !!confidant && confidant.source === 'online' && !cloudUser;

  // 关联到这位在线同伴的活跃羁绊之影（如果有）
  const activeShadow = useMemo(() => {
    if (!confidant || confidant.source !== 'online' || !confidant.linkedCloudUserId) return null;
    return coopShadows.find(
      s => s.status === 'active'
        && (s.userAId === confidant.linkedCloudUserId || s.userBId === confidant.linkedCloudUserId),
    ) ?? null;
  }, [coopShadows, confidant]);
  // 关联到这位在线同伴的 bond（如果有）
  const relatedBond = useMemo(() => {
    if (!confidant || confidant.source !== 'online' || !confidant.linkedCloudUserId) return null;
    return coopBonds.find(
      b => b.status === 'linked'
        && (b.userAId === confidant.linkedCloudUserId || b.userBId === confidant.linkedCloudUserId),
    ) ?? null;
  }, [coopBonds, confidant]);

  // 关联的 friendship（用于打开 GUEST PROFILE 面板）
  const relatedFriendship = useMemo(() => {
    if (!confidant || confidant.source !== 'online' || !confidant.linkedCloudUserId) return null;
    return friendships.find(
      f => f.status === 'linked'
        && (f.userAId === confidant.linkedCloudUserId || f.userBId === confidant.linkedCloudUserId),
    ) ?? null;
  }, [friendships, confidant]);

  const handleOpenProfileCard = () => {
    if (!confidant?.linkedProfile || !relatedFriendship || !onViewOnlineProfile) return;
    onViewOnlineProfile(confidant.linkedProfile, relatedFriendship);
  };

  // 在线 COOP：判定我和对方是否都开了"逆流"
  const otherSideDecay = useMemo(() => {
    if (!relatedBond || !confidant?.linkedCloudUserId) return null;
    const otherIsA = relatedBond.userAId === confidant.linkedCloudUserId;
    return otherIsA ? (relatedBond.decayA === true) : (relatedBond.decayB === true);
  }, [relatedBond, confidant]);

  const [tab, setTab] = useState<Tab>('info');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [starShiftOpen, setStarShiftOpen] = useState(false);
  const [starShiftMode, setStarShiftMode] = useState<'celebrate' | 'shift'>('celebrate');
  const [counselOpen, setCounselOpen] = useState(false);
  const [memorialOpen, setMemorialOpen] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarWrapperRef = useRef<HTMLDivElement>(null);
  const longPressFiredRef = useRef(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  // 切换到另一个同伴 / 重开弹窗时，重置所有临时 UI 状态，避免残留
  useEffect(() => {
    if (!isOpen) return;
    setTab('info');
    setDeleteConfirmOpen(false);
    setExpandedEventId(null);
    setAvatarMenuOpen(false);
    setAvatarErr(null);
    setCounselOpen(false);
  }, [isOpen, confidantId]);

  // Android 返回键：逐层回退（与点 ✕ 按钮语义保持一致）
  //   - avatarMenuOpen 打开 → 关菜单（匹配点外面关闭）
  //   - deleteConfirmOpen 打开 → 关确认（匹配点"取消"）
  //   - memorialOpen 打开 → 关纪念面板
  //   - 其余 → 关整个详情（匹配右上角 ✕）
  // 注意：interaction / starShift / counsel 是独立子 Modal，它们各自注册 back handler
  //       会位于栈顶，优先消费 back，轮不到这里。
  useBackHandler(isOpen, () => {
    if (avatarMenuOpen) { setAvatarMenuOpen(false); return; }
    if (deleteConfirmOpen) { setDeleteConfirmOpen(false); return; }
    if (memorialOpen) { setMemorialOpen(false); return; }
    onClose();
  });

  // 长按菜单：点外面任何地方关闭它
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (avatarWrapperRef.current && !avatarWrapperRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [avatarMenuOpen]);
  // 以 level_up 事件为事实来源：首次达到某等级后，打开详情时补弹升级祝贺。
  useEffect(() => {
    if (!isOpen || !confidant || starShiftOpen) return;
    const pendingLevelUps = findUncelebratedLevelUps(confidant, confidantEvents);
    if (pendingLevelUps.length === 0) return;
    pendingLevelUps.forEach(item => markLevelCelebrated(confidant.id, item.level));
    setStarShiftMode('celebrate');
    setStarShiftOpen(true);
  }, [isOpen, confidant, confidantEvents, starShiftOpen]);

  if (!isOpen || !confidant) return null;

  const card = TAROT_BY_ID[confidant.arcanaId];
  const accent = card?.accent || '#6366f1';
  const isReversed = confidant.orientation === 'reversed';

  const isMax = confidant.intimacy >= MAX_INTIMACY;
  const base = levelBasePoints(confidant.intimacy);
  const next = isMax ? null : INTIMACY_THRESHOLDS[confidant.intimacy + 1];
  const pct = isMax ? 100 : Math.max(0, Math.min(100, ((confidant.intimacyPoints - base) / ((next ?? 100) - base)) * 100));
  const toNext = pointsToNextLevel(confidant.intimacyPoints);

  const interactedToday = confidant.lastInteractionDate === toLocalDateKey();

  const toggleDecay = async () => {
    const next = !confidant.decayEnabled;
    await updateConfidant(confidant.id, { decayEnabled: next });
    // 在线 COOP：把我这一侧的偏好同步到 PB bond，让对方也能感知
    if (confidant.source === 'online' && confidant.linkedCloudUserId) {
      try {
        const { useCloudSocialStore } = await import('@/store/cloudSocial');
        const { setCoopDecayPreference } = await import('@/services/coopBonds');
        const bond = useCloudSocialStore.getState().coopBonds.find(
          b => b.status === 'linked'
            && (b.userAId === confidant.linkedCloudUserId || b.userBId === confidant.linkedCloudUserId),
        );
        if (bond) {
          const updated = await setCoopDecayPreference(bond.id, next);
          useCloudSocialStore.getState().updateCoopBond(bond.id, updated);
        }
      } catch (err) {
        console.warn('[confidant-detail] sync coop decay preference failed', err);
      }
    }
  };

  const handleArchive = async () => {
    if (confidant.archivedAt) {
      await unarchiveConfidant(confidant.id);
    } else {
      await archiveConfidant(confidant.id);
    }
  };

  const handleDelete = async () => {
    await deleteConfidant(confidant.id);
    setDeleteConfirmOpen(false);
    onClose();
  };

  // ── 长按塔罗牌：唤出替换头像菜单 ────────────────
  const LONG_PRESS_MS = 500;
  const startLongPress = (e: React.PointerEvent) => {
    if (isLockedOnline) return; // 只读模式：整个长按菜单禁用
    longPressFiredRef.current = false;
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      triggerLightHaptic();
      setAvatarMenuOpen(true);
    }, LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
  };
  // 手指位移 > 10px 视为滚动，取消长按
  const onLongPressMove = (e: React.PointerEvent) => {
    if (!pressStartRef.current || !longPressTimerRef.current) return;
    const dx = e.clientX - pressStartRef.current.x;
    const dy = e.clientY - pressStartRef.current.y;
    if (dx * dx + dy * dy > 100) cancelLongPress();
  };
  const handleTarotTap = () => {
    if (longPressFiredRef.current) return; // 已触发长按就不做点击反馈
    triggerLightHaptic();
  };

  const handleAvatarFilePick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setAvatarErr('请选择图片');
      setTimeout(() => setAvatarErr(null), 2200);
      e.target.value = '';
      return;
    }
    setPendingAvatarFile(file);
    setAvatarMenuOpen(false);
    e.target.value = '';
  };

  const handleAvatarCropConfirm = async (dataUrl: string) => {
    setPendingAvatarFile(null);
    setAvatarUploading(true);
    try {
      await updateConfidant(confidant.id, { customAvatarDataUrl: dataUrl });
    } catch (err) {
      setAvatarErr(err instanceof Error ? err.message : '上传失败');
      setTimeout(() => setAvatarErr(null), 2200);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRestoreTarot = async () => {
    setAvatarMenuOpen(false);
    await updateConfidant(confidant.id, { customAvatarDataUrl: undefined });
  };

  return (
    <AnimatePresence>
      <motion.div
        key="cd-modal-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="同伴详情"
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-3xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部：大牌面（不加 overflow-hidden，否则长按菜单会被截断） */}
          <div
            className="relative px-6 pt-8 pb-6"
            style={{
              background: `linear-gradient(160deg, ${accent}25, ${accent}08 70%, transparent)`,
            }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 text-gray-500 flex items-center justify-center z-10"
              aria-label="关闭"
            >✕</button>

            {/* 快捷谏言入口：半透明四角星，点击直接打开「谏言」并预先 @ 这位同伴。
                外层 div 负责定位（避免 framer-motion 的 scale 覆盖掉 translate，从而导致点击时按钮偏移）
                在线 + 未登录时隐藏 —— 谏言会带上这位同伴的数据，走 AI 聊天 */}
            {!isLockedOnline && (
              <div className="absolute z-[5] top-1/2 -translate-y-1/2 right-1 pointer-events-none">
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setCounselOpen(true)}
                  className="pointer-events-auto w-16 h-16 rounded-full flex items-center justify-center text-[60px] leading-none font-thin select-none text-slate-400/30 hover:text-slate-200/70 active:text-white/85 transition-colors"
                  aria-label="谏言 · 关于这段关系"
                  title="谏言：关于这段关系"
                >
                  ✧
                </motion.button>
              </div>
            )}

            <div className="flex items-center gap-4">
              {/* 塔罗 / 自定义头像（长按替换） */}
              <div className="flex-shrink-0 relative" ref={avatarWrapperRef}>
                <motion.div
                  whileTap={{ scale: 0.94 }}
                  onPointerDown={startLongPress}
                  onPointerMove={onLongPressMove}
                  onPointerUp={() => {
                    cancelLongPress();
                    handleTarotTap();
                  }}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                  onContextMenu={e => e.preventDefault()}
                  className="cursor-pointer select-none"
                  style={{ touchAction: 'manipulation' }}
                >
                  {confidant.customAvatarDataUrl ? (
                    <div
                      className="w-[86px] h-[138px] rounded-xl overflow-hidden relative"
                      style={{
                        border: `2px solid ${accent}`,
                        boxShadow: `0 12px 30px -14px ${accent}80, inset 0 0 0 1px ${accent}55`,
                      }}
                    >
                      <img
                        src={confidant.customAvatarDataUrl}
                        alt={confidant.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                      {/* 右下小牌角标 */}
                      <div
                        className="absolute bottom-1 right-1 w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black"
                        style={{
                          background: accent,
                          color: '#fff',
                          boxShadow: `0 2px 6px ${accent}88`,
                        }}
                      >
                        {card?.roman ?? '✧'}
                      </div>
                    </div>
                  ) : (
                    card && (
                      <TarotCardSVG
                        card={card}
                        orientation={confidant.orientation}
                        width={86}
                        staticCard
                        showOrientationTag={false}
                      />
                    )
                  )}
                  {avatarUploading && (
                    <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center z-10">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
                      />
                    </div>
                  )}
                </motion.div>

                {/* 长按菜单 */}
                <AnimatePresence>
                  {avatarMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      transition={{ duration: 0.14 }}
                      className="absolute z-30 left-0 top-[150px] w-48 rounded-xl overflow-hidden shadow-2xl border"
                      style={{
                        background: 'rgba(255,255,255,0.96)',
                        borderColor: 'rgba(148,163,184,0.35)',
                        backdropFilter: 'blur(18px)',
                        WebkitBackdropFilter: 'blur(18px)',
                      }}
                    >
                      <div className="px-3 py-1.5 text-[10px] font-bold tracking-widest text-gray-500 bg-gray-100/50 border-b border-gray-200/60">
                        {confidant.source === 'online' ? '在线同伴' : '离线同伴'}
                      </div>
                      <button
                        onClick={() => {
                          setAvatarMenuOpen(false);
                          avatarFileInputRef.current?.click();
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-semibold text-gray-800 hover:bg-black/5 transition-colors flex items-center gap-2"
                      >
                        <span className="text-base">📷</span>
                        {confidant.customAvatarDataUrl ? '更换头像' : '上传头像替换塔罗'}
                      </button>
                      {confidant.customAvatarDataUrl && (
                        <button
                          onClick={handleRestoreTarot}
                          className="w-full px-3 py-2 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-500/10 transition-colors flex items-center gap-2 border-t border-black/5"
                        >
                          <span className="text-base">🂠</span>
                          取消头像 · 恢复为塔罗牌
                        </button>
                      )}
                      <div className="px-3 py-1.5 text-[10px] text-gray-500 bg-gray-50 border-t border-gray-200/60 leading-relaxed">
                        图片仅保留在本地
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {avatarErr && (
                  <div className="absolute left-0 top-[150px] z-30 w-48 text-[10px] px-2 py-1.5 rounded-lg bg-rose-500/90 text-white shadow-lg">
                    {avatarErr}
                  </div>
                )}
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFilePick}
                  className="hidden"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {confidant.name}
                </h2>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  《{card?.name}》{isReversed ? '逆位' : '正位'}
                </div>
                <div className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: `${accent}22`, color: accent }}>
                  Lv.{confidant.intimacy} · {INTIMACY_LABELS[confidant.intimacy]}
                </div>
                {confidant.source === 'online' && (
                  <div className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 flex-wrap">
                    <span>ONLINE ·</span>
                    {confidant.linkedProfile?.userId && relatedFriendship ? (
                      <button
                        onClick={handleOpenProfileCard}
                        className="px-1.5 py-0.5 rounded-md hover:bg-emerald-500/15 transition-colors font-bold underline decoration-dotted underline-offset-2"
                        title="点击查看 GUEST PROFILE"
                      >
                        @{confidant.linkedProfile.userId}
                      </button>
                    ) : (
                      <span>{confidant.linkedCloudUserId ? '已缔结 COOP' : '（待绑定）'}</span>
                    )}
                  </div>
                )}
                {/* 羁绊之影状态行 —— 只有 active 时出现 */}
                {activeShadow && onOpenCoopShadow && (() => {
                  const identified = activeShadow.identifiedByA && activeShadow.identifiedByB;
                  const hpPct = Math.round((activeShadow.hpCurrent / activeShadow.hpMax) * 100);
                  return (
                    <button
                      onClick={() => onOpenCoopShadow(activeShadow, confidant.name)}
                      className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-black tracking-wider border transition-all active:scale-95"
                      style={{
                        background: identified
                          ? 'linear-gradient(135deg, rgba(124,58,237,0.22), rgba(168,85,247,0.12))'
                          : 'linear-gradient(135deg, rgba(220,38,38,0.22), rgba(124,58,237,0.12))',
                        borderColor: identified ? 'rgba(196,181,253,0.55)' : 'rgba(248,113,113,0.55)',
                        color: identified ? '#c4b5fd' : '#fca5a5',
                        boxShadow: identified
                          ? '0 0 10px -2px rgba(168,85,247,0.5)'
                          : '0 0 10px -2px rgba(220,38,38,0.6)',
                      }}
                      title={identified ? `羁绊之影 · HP ${hpPct}%` : '羁绊之影 · 未识破'}
                    >
                      <span>⚔️</span>
                      <span>SHADOW</span>
                      <span className="tabular-nums opacity-80">
                        {identified ? `${hpPct}%` : '未识破'}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* 羁绊等级进度条 */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1.5">
                <span>羁绊等级</span>
                <span>
                  {isMax
                    ? '已达圆满'
                    : `${confidant.intimacyPoints - base} / ${(next ?? 100) - base}（到 Lv.${confidant.intimacy + 1} 还差 ${toNext?.gap ?? 0} 点）`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: accent }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 150, damping: 25 }}
                />
              </div>
            </div>
          </div>

          {/* 未登录云端时对在线同伴的只读提示 */}
          {isLockedOnline && (
            <div className="mx-6 mt-3 px-3 py-2.5 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2"
              style={{
                background: 'rgba(14,165,233,0.08)',
                borderColor: 'rgba(14,165,233,0.3)',
                color: '#0369a1',
              }}
            >
              <span className="text-base leading-none flex-shrink-0 mt-0.5">🔒</span>
              <span className="flex-1">
                <span className="font-bold">只读模式 · 未登录云端</span>
                <br />
                这是一位在线同伴，任何编辑操作都需要登录后才能同步给对方 —— 暂时只能查看，登录后可恢复全部功能。
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 mx-6 mt-4 rounded-xl bg-black/5 dark:bg-white/5">
            {([
              { id: 'info', label: '信息' },
              { id: 'abilities', label: '能力' },
              { id: 'history', label: '历史' },
            ] as const).map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    active ? 'bg-white dark:bg-gray-900 text-primary shadow-sm' : 'text-gray-500'
                  }`}
                  style={active ? { color: accent } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="p-6 pt-4 space-y-4">
            <AnimatePresence mode="wait">
              {tab === 'info' && (
                <motion.div
                  key="info"
                  variants={INFO_CONTAINER_VARIANTS}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  <motion.div variants={INFO_ITEM_VARIANTS}>
                    <Section title="关系描述">
                      <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {confidant.description || '（未填写）'}
                      </p>
                    </Section>
                  </motion.div>
                  <motion.div variants={INFO_ITEM_VARIANTS}>
                    <Section title="解读">
                      <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                        {confidant.aiInterpretation}
                      </p>
                    </Section>
                  </motion.div>
                  <motion.div variants={INFO_ITEM_VARIANTS}>
                    <Section title="未来">
                      <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                        {confidant.aiAdvice}
                      </p>
                    </Section>
                  </motion.div>

                  {/* 共战纪念入口：仅在线同伴，且至少有一枚胜利图章 */}
                  {confidant.source === 'online' && (confidant.coopMemorials?.filter(m => !m.shadowId.startsWith('retreat-')).length ?? 0) > 0 && (
                    <motion.button
                      variants={INFO_ITEM_VARIANTS}
                      onClick={() => setMemorialOpen(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all active:scale-[0.98]"
                      style={{
                        background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(168,85,247,0.05))',
                        borderColor: 'rgba(251,191,36,0.3)',
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                        style={{
                          background: 'radial-gradient(circle at 30% 30%, rgba(251,191,36,0.3), rgba(168,85,247,0.15))',
                          border: '1px solid rgba(251,191,36,0.3)',
                        }}
                      >
                        📿
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-bold text-gray-800 dark:text-white">
                          共战纪念
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {confidant.coopMemorials?.filter(m => !m.shadowId.startsWith('retreat-')).length ?? 0} 次共同封印羁绊之影
                        </div>
                      </div>
                      <span className="text-gray-400">›</span>
                    </motion.button>
                  )}
                </motion.div>
              )}

              {tab === 'abilities' && (
                <motion.div key="abilities" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                  {confidant.buffs.length === 0 ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                      亲密度到 Lv.2 将解锁日常加成。
                    </div>
                  ) : (
                    confidant.buffs.map(b => {
                      const disp = formatBuffDisplay(b, confidant.arcanaId, settings.attributeNames);
                      return (
                        <div
                          key={b.id}
                          className="p-3 rounded-xl border"
                          style={{
                            background: `${accent}08`,
                            borderColor: `${accent}33`,
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${accent}22`, color: accent }}>
                              Lv.{b.unlockAtLevel}
                            </span>
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                              {disp.title}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 ml-1">
                            {disp.description}
                          </p>
                        </div>
                      );
                    })
                  )}
                  {/* 下一解锁提示 */}
                  {confidant.intimacy < MAX_INTIMACY && (
                    <div className="mt-3 p-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                      <div className="text-[10px] font-bold tracking-wider text-gray-400 mb-1">
                        即将解锁
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {nextUnlockHint(confidant.intimacy)}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {tab === 'history' && (
                <motion.div key="history" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                  {events.length === 0 ? (
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                      还没有记录
                    </div>
                  ) : (
                    events.map(e => {
                      const isConversation = e.type === 'conversation';
                      const primary = isConversation
                        ? (e.userInput || e.narrative || '（未填写事件）')
                        : e.narrative;
                      const hasReading = isConversation && (e.narrative || e.advice);
                      const expanded = expandedEventId === e.id;
                      return (
                        <div key={e.id} className="flex gap-3 py-2">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: accent }} />
                            <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700" />
                          </div>
                          <div className="flex-1 pb-2">
                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                              <span>{e.date}</span>
                              <span className="uppercase tracking-widest">{eventLabel(e.type)}</span>
                              {typeof e.delta === 'number' && e.delta !== 0 && (
                                <span className={e.delta > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                  {e.delta > 0 ? `+${e.delta}` : e.delta}
                                </span>
                              )}
                              {hasReading && (
                                <button
                                  onClick={() => setExpandedEventId(expanded ? null : e.id)}
                                  className="ml-auto text-[10px] font-semibold transition-colors"
                                  style={{ color: accent }}
                                >
                                  {expanded ? '收起 ▲' : '查看解读 ▼'}
                                </button>
                              )}
                            </div>
                            {primary && (
                              <p className="text-xs text-gray-800 dark:text-gray-100 mt-0.5 whitespace-pre-wrap leading-relaxed">
                                {primary}
                              </p>
                            )}
                            <AnimatePresence initial={false}>
                              {expanded && hasReading && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden mt-2 space-y-2"
                                >
                                  {e.narrative && (
                                    <div className="p-2.5 rounded-lg" style={{ background: `${accent}10`, border: `1px solid ${accent}33` }}>
                                      <div className="text-[9px] font-bold tracking-widest mb-1" style={{ color: accent }}>
                                        解读
                                      </div>
                                      <p className="text-[11px] text-gray-700 dark:text-gray-200 leading-relaxed">
                                        {e.narrative}
                                      </p>
                                    </div>
                                  )}
                                  {e.advice && (
                                    <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                                      <div className="text-[9px] font-bold tracking-widest text-gray-400 mb-1">
                                        未来
                                      </div>
                                      <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed">
                                        {e.advice}
                                      </p>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      );
                    })
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── 操作区：主 CTA → 次要 → 偏好（逆流） ── */}
            {/* 在线同伴 + 未登录 → 整块操作区隐藏，只保留只读查看 */}
            {!isLockedOnline && (
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              {!confidant.archivedAt && (
                <>
                  {/* Row 1: 主要 CTA —— 今日互动 */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setInteractionOpen(true)}
                    disabled={confidant.intimacy >= MAX_INTIMACY || interactedToday}
                    className="w-full py-3 rounded-xl text-white text-sm font-bold shadow-lg disabled:opacity-40"
                    style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 10px 28px -12px ${accent}80` }}
                  >
                    {confidant.intimacy >= MAX_INTIMACY
                      ? '已圆满 ✧'
                      : interactedToday
                      ? '今日已解读'
                      : '今日互动 · 由 AI 解读加点'}
                  </motion.button>

                  {/* Row 2: 次要 CTA —— 星移（仅有可用次数时展示） */}
                  {(confidant.starShiftCharges ?? 0) > 0 && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setStarShiftMode('shift');
                        setStarShiftOpen(true);
                      }}
                      className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                      style={{
                        background: `${accent}18`,
                        color: accent,
                        border: `1px solid ${accent}44`,
                      }}
                    >
                      <span>✧ 星移</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ background: accent, color: '#fff' }}>
                        ×{confidant.starShiftCharges}
                      </span>
                      <span className="text-[11px] font-normal opacity-80">以当前状态重新落墨</span>
                    </motion.button>
                  )}
                </>
              )}

              {/* Row 3: 归档 / 删除 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleArchive}
                  className="py-2 rounded-xl text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                >
                  {confidant.archivedAt ? '恢复关系' : '暂时归档'}
                </button>
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="py-2 rounded-xl text-xs font-medium bg-transparent border border-rose-300 text-rose-500 hover:bg-rose-500/10 transition-colors"
                >
                  彻底删除
                </button>
              </div>

              {/* 在线同伴专属：解除 COOP 契约 —— 比"删除"更明确，会同步通知对方 */}
              {confidant.source === 'online' && confidant.linkedCloudUserId && !confidant.archivedAt && relatedBond?.status === 'linked' && (
                <SeverCoopButton
                  bondId={relatedBond.id}
                  partnerName={confidant.linkedProfile?.nickname || confidant.linkedProfile?.userId || confidant.name}
                  onSevered={() => { void archiveConfidant(confidant.id); }}
                />
              )}

              {/* Row 4: 逆流 chip（小而克制） */}
              {!confidant.archivedAt && (
                <div className="flex items-center justify-between px-1 pt-1">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    {confidant.source === 'online' && confidant.linkedCloudUserId
                      ? confidant.decayEnabled
                        ? otherSideDecay
                          ? '逆流 · 双方同意，3 天无互动 −1/天'
                          : '逆流 · 你已开启，等 Ta 同意'
                        : otherSideDecay
                          ? '逆流 · 对方已开启，等你同意'
                          : '逆流未开启'
                      : confidant.decayEnabled ? '逆流 · 3 天无互动 −1/天' : '逆流未开启'}
                  </span>
                  <button
                    onClick={toggleDecay}
                    className="relative w-10 h-5 rounded-full transition-colors flex-shrink-0"
                    style={{
                      background: confidant.decayEnabled ? '#f43f5e' : 'rgba(148,163,184,0.4)',
                    }}
                    aria-label="切换逆流"
                  >
                    <motion.span
                      layout
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow"
                      style={{ left: confidant.decayEnabled ? 'calc(100% - 18px)' : '2px' }}
                    />
                  </button>
                </div>
              )}

              {confidant.archivedAt && (
                <p className="text-[10px] text-gray-400 text-center">
                  归档后能力暂停生效，但历史记录仍会保留
                </p>
              )}
            </div>
            )}
          </div>

        </motion.div>
      </motion.div>
      {/* AI 判断互动弹窗 */}
      <ConfidantInteractionModal
        key="cd-interaction"
        isOpen={interactionOpen}
        onClose={() => setInteractionOpen(false)}
        confidant={confidant}
      />
      {/* 升级恭喜 + 星移弹窗 */}
      <ConfidantStarShiftModal
        key="cd-starshift"
        isOpen={starShiftOpen}
        confidant={confidant}
        initialMode={starShiftMode}
        onClose={() => setStarShiftOpen(false)}
      />

      {/* 同伴头像裁切弹窗（可取消，支持拖动 / 缩放）
          使用塔罗牌比例 1:1.6，避免替换后被 object-cover 再次截取 */}
      <ImageCropDialog
        key="cd-crop"
        isOpen={!!pendingAvatarFile}
        file={pendingAvatarFile}
        title={`为 ${confidant.name} 设置头像`}
        aspectRatio={1 / 1.6}
        onCancel={() => setPendingAvatarFile(null)}
        onConfirm={handleAvatarCropConfirm}
      />

      {/* 快捷谏言：预先 @ 这位同伴 */}
      <CounselChatModal
        key="cd-counsel"
        isOpen={counselOpen}
        onClose={() => setCounselOpen(false)}
        initialMentionId={confidant.id}
      />

      {/* 共战纪念册 */}
      <CoopMemorialPanel
        isOpen={memorialOpen}
        confidant={confidant}
        onClose={() => setMemorialOpen(false)}
      />

      {/* 删除确认弹窗 */}
      <AnimatePresence key="cd-del-presence">
        {deleteConfirmOpen && (
          <motion.div
            key="cd-del"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[190] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
            onClick={() => setDeleteConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 pt-6 pb-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                       style={{ background: 'rgba(244,63,94,0.15)', color: '#e11d48' }}>
                    ⚠
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">
                      确认彻底删除 {confidant.name}？
                    </h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      此操作不可撤销
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-3">
                <ul className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed space-y-1.5 list-disc list-inside">
                  <li>这位同伴的档案、亲密度、能力解锁将一并被抹去</li>
                  <li>所有互动记录与星移痕迹也会被清空</li>
                  <li>Ta 所占用的塔罗大阿卡纳将被释放，可重新分配给新的同伴</li>
                  <li>如果只是暂时不想看见 Ta，建议使用「暂时归档」</li>
                </ul>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setDeleteConfirmOpen(false)}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    再想想
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleDelete}
                    className="py-2.5 rounded-xl text-sm font-bold text-white shadow-md"
                    style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)' }}
                  >
                    确认删除
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}

/**
 * 在线同伴专属：解除 COOP 契约。
 * 二次确认后调 severCoopBond → bond 在 PB 端 status='severed'，
 * 对方 loadSocial 时 reflectSeveredBonds 会把对方那张本地卡也归档。
 * 本端则在父组件回调里也归档自己的卡。
 */
function SeverCoopButton({
  bondId,
  partnerName,
  onSevered,
}: {
  bondId: string;
  partnerName: string;
  onSevered: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doSever = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { severCoopBond } = await import('@/services/coopBonds');
      const { useCloudSocialStore } = await import('@/store/cloudSocial');
      const updated = await severCoopBond(bondId);
      useCloudSocialStore.getState().updateCoopBond(bondId, updated);
      setConfirming(false);
      onSevered();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '解除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1">
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="w-full py-2 rounded-xl text-xs font-medium border text-rose-500 hover:bg-rose-500/10 transition-colors"
          style={{ borderColor: 'rgba(244,63,94,0.5)' }}
        >
          解除与 {partnerName} 的 COOP 契约
        </button>
      ) : (
        <div className="p-3 rounded-xl space-y-2"
          style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.3)' }}
        >
          <p className="text-[11px] leading-relaxed text-rose-600 dark:text-rose-300">
            解除后，本端的同伴卡会自动归档；对方下次同步时，那边的卡也会归档。<br />
            7 天内无法再次缔结 COOP。已积累的羁绊与历史会保留在归档里。
          </p>
          {err && <p className="text-[10px] text-rose-500">{err}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setConfirming(false); setErr(null); }}
              disabled={busy}
              className="py-1.5 rounded-md text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-40"
            >
              再想想
            </button>
            <button
              onClick={doSever}
              disabled={busy}
              className="py-1.5 rounded-md text-[11px] font-bold text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}
            >
              {busy ? '处理中…' : '确认解除'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const INFO_CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.14, delayChildren: 0.05 },
  },
};

const INFO_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
      <div className="text-[10px] font-bold tracking-widest text-gray-400 mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function nextUnlockHint(level: number): string {
  if (level < 2) return `到 Lv.2 解锁「Ta 的指引」：该属性每次加点乘区外 +1`;
  if (level < 4) return `到 Lv.4 解锁「Ta 的慰藉」：战斗中回复 5 点 HP（每 2 天一次）`;
  if (level < 7) return `到 Lv.7 解锁「Ta 的共鸣」：该属性技能永久 +1 固定伤害`;
  if (level < 10) return `到 Lv.10 达成圆满，所有能力增强并解锁 SP 回复`;
  return '';
}

function eventLabel(type: string): string {
  switch (type) {
    case 'created': return '初识';
    case 'intimacy_up': return '增进';
    case 'intimacy_down': return '波折';
    case 'level_up': return '升级';
    case 'buff_unlocked': return '解锁能力';
    case 'conversation': return '互动';
    case 'item_used': return '战斗援助';
    case 'archived': return '归档';
    case 'decay': return '逆流';
    case 'bound': return '绑定';
    case 'unbound': return '解绑';
    default: return type;
  }
}
