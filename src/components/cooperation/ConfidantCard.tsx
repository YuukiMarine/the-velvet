import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import type { Confidant, CoopShadow } from '@/types';
import { TAROT_BY_ID } from '@/constants/tarot';
import { INTIMACY_LABELS, MAX_INTIMACY, pointsToNextLevel, levelBasePoints, INTIMACY_THRESHOLDS } from '@/utils/confidantLevels';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';

interface Props {
  confidant: Confidant;
  onClick?: () => void;
  /** 仅 source='online' && !archived 才有意义的祈愿状态 */
  prayer?: {
    alreadyPrayed: boolean;
    waitingReciprocity: boolean;
    pending: boolean;
    onQuickPray: () => void;
  };
  /** 当前和这位同伴共战的羁绊之影（active 态）—— 传入即显示 ⚔️ 徽章 + 血条 */
  activeShadow?: CoopShadow;
  /** 点击 ⚔️ 徽章时触发，打开 CoopShadowBattleModal */
  onShadowClick?: () => void;
}

export function ConfidantCard({ confidant, onClick, prayer, activeShadow, onShadowClick }: Props) {
  const card = TAROT_BY_ID[confidant.arcanaId];
  const accent = card?.accent || '#6366f1';
  const isReversed = confidant.orientation === 'reversed';
  const archived = !!confidant.archivedAt;
  const isOnline = confidant.source === 'online';
  const updateConfidant = useAppStore(s => s.updateConfidant);

  const cloudUser = useCloudStore(s => s.cloudUser);
  const isLockedOnline = isOnline && !cloudUser;

  const isMax = confidant.intimacy >= MAX_INTIMACY;
  const base = levelBasePoints(confidant.intimacy);
  const next = isMax ? null : INTIMACY_THRESHOLDS[confidant.intimacy + 1];
  const pct = isMax ? 100 : Math.max(0, Math.min(100, ((confidant.intimacyPoints - base) / ((next ?? 100) - base)) * 100));
  const toNext = pointsToNextLevel(confidant.intimacyPoints);

  // 头像显示策略：
  //   在线同伴 —— preferTarotOverAvatar 优先；否则 linkedProfile.avatarUrl > customAvatarDataUrl > 塔罗
  //   离线同伴 —— customAvatarDataUrl > 塔罗
  let avatarSrc: string | undefined;
  if (isOnline) {
    if (!confidant.preferTarotOverAvatar) {
      avatarSrc = confidant.linkedProfile?.avatarUrl || confidant.customAvatarDataUrl;
    }
  } else {
    avatarSrc = confidant.customAvatarDataUrl;
  }

  const showPrayButton = !!prayer && isOnline && !archived && !isLockedOnline;

  // ── 长按菜单（仅在线同伴）：切换头像 / 塔罗显示偏好 ─────────
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  // 菜单外点击关闭
  useEffect(() => {
    if (!menuPos) return;
    const onDown = () => setMenuPos(null);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menuPos]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isOnline || archived) return;
    // 在线 + 未登录 → 只读模式，长按菜单禁用（防止本地偏好改动与云端状态冲突）
    if (isLockedOnline) return;
    // 点到祈愿按钮、菜单按钮、⚔️ 徽章等不触发长按
    if ((e.target as HTMLElement).closest('[data-pray-button],[data-card-menu],[data-shadow-badge]')) return;
    didLongPress.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const targetEl = e.currentTarget as HTMLElement;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      const rect = targetEl.getBoundingClientRect();
      setMenuPos({ x: rect.right - 12, y: rect.top + 18 });
      try { navigator.vibrate?.(10); } catch { /* noop */ }
    }, 480);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressStart.current = null;
  };
  // 手指滑动超过 10px 视为滚动，取消长按（修正"按住卡片后轻微滚动仍误触菜单"的问题）
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pressStart.current || !longPressTimer.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (dx * dx + dy * dy > 100) cancelLongPress();
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (didLongPress.current) {
      e.preventDefault();
      didLongPress.current = false;
      return;
    }
    if ((e.target as HTMLElement).closest('[data-pray-button]')) return;
    onClick?.();
  };

  const setPreference = async (preferTarot: boolean) => {
    setMenuPos(null);
    if (!!confidant.preferTarotOverAvatar === preferTarot) return;
    try {
      await updateConfidant(confidant.id, { preferTarotOverAvatar: preferTarot });
    } catch (err) {
      console.warn('[confidant-card] update preferTarotOverAvatar failed', err);
    }
  };

  return (
    <>
    <motion.div
      whileHover={{ scale: 1.008, y: -1 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      onClick={handleCardClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={(e) => { if (isOnline && !archived) { e.preventDefault(); didLongPress.current = true; setMenuPos({ x: e.clientX, y: e.clientY }); } }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      className={`relative w-full text-left rounded-2xl overflow-hidden border transition-colors cursor-pointer ${
        archived
          ? 'border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/40 opacity-60'
          : isOnline
            ? 'border-emerald-300/60 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.04] via-white to-white dark:from-emerald-500/[0.08] dark:via-gray-900 dark:to-gray-900'
            : 'border-gray-200/80 dark:border-gray-700/70 bg-white dark:bg-gray-900'
      }`}
      style={{
        boxShadow: archived
          ? undefined
          : isOnline
            ? `0 10px 22px -14px rgba(16,185,129,0.5), 0 8px 20px -14px ${accent}55`
            : `0 8px 20px -14px ${accent}55`,
      }}
    >
      {/* 左侧色条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: isOnline ? '#10b981' : accent }}
      />
      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          {/* 头像：优先对方头像 → 自定义头像 → 塔罗 */}
          <div className="flex-shrink-0">
            {avatarSrc ? (
              <div
                className="w-14 h-[90px] rounded-lg overflow-hidden relative"
                style={{
                  border: `1.5px solid ${accent}`,
                  boxShadow: `0 4px 10px -6px ${accent}88`,
                }}
              >
                <img
                  src={avatarSrc}
                  alt={confidant.name}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                <div
                  className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-[4px] flex items-center justify-center text-[8px] font-black"
                  style={{ background: accent, color: '#fff' }}
                >
                  {card?.roman ?? '✧'}
                </div>
              </div>
            ) : card ? (
              <TarotCardSVG
                card={card}
                orientation={confidant.orientation}
                width={56}
                staticCard
                showOrientationTag={false}
              />
            ) : (
              <div className="w-14 h-[90px] rounded-lg bg-gray-200 dark:bg-gray-800" />
            )}
          </div>

          {/* 主信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 dark:text-white truncate">
                {confidant.name}
              </span>
              {isOnline && (
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  ONLINE
                </span>
              )}
              {activeShadow && onShadowClick && (() => {
                const identified = activeShadow.identifiedByA && activeShadow.identifiedByB;
                const hpPct = Math.round((activeShadow.hpCurrent / activeShadow.hpMax) * 100);
                return (
                  <button
                    data-shadow-badge
                    onClick={(e) => { e.stopPropagation(); onShadowClick(); }}
                    className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider border transition-all active:scale-95"
                    style={{
                      background: identified
                        ? 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(168,85,247,0.12))'
                        : 'linear-gradient(135deg, rgba(220,38,38,0.2), rgba(124,58,237,0.12))',
                      borderColor: identified ? 'rgba(196,181,253,0.5)' : 'rgba(248,113,113,0.55)',
                      color: identified ? '#c4b5fd' : '#fca5a5',
                      boxShadow: identified
                        ? '0 0 12px -3px rgba(168,85,247,0.6)'
                        : '0 0 12px -3px rgba(220,38,38,0.7)',
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
              {confidant.decayEnabled && (
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                  逆流
                </span>
              )}
              {archived && (
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-gray-400/15 text-gray-500 dark:text-gray-400 border border-gray-400/30">
                  归档
                </span>
              )}
              {prayer?.waitingReciprocity && !prayer?.alreadyPrayed && (
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  待回应
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              《{card?.name}》{isReversed ? '逆位' : '正位'} · {INTIMACY_LABELS[confidant.intimacy]}
            </div>

            {/* 羁绊等级进度条 */}
            <div className="mt-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold tracking-wider" style={{ color: accent }}>
                  羁绊 LV {confidant.intimacy}
                </span>
                <span className="text-[10px] text-gray-400">
                  {isMax ? '圆满' : `还差 ${toNext?.gap ?? 0} 点到 Lv ${confidant.intimacy + 1}`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: accent }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 28 }}
                />
              </div>
            </div>
          </div>

          {/* 在线同伴：✦ 祈愿快捷 */}
          {showPrayButton && prayer && (
            <PrayerQuickButton
              alreadyPrayed={prayer.alreadyPrayed}
              waitingReciprocity={prayer.waitingReciprocity}
              pending={prayer.pending}
              onClick={prayer.onQuickPray}
            />
          )}
        </div>
      </div>
    </motion.div>

    {/* 长按菜单（仅在线同伴）：切换头像 / 塔罗显示 */}
    <AnimatePresence>
      {menuPos && createPortal(
        <motion.div
          key="card-menu"
          data-card-menu
          initial={{ opacity: 0, scale: 0.92, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.14 }}
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed z-[170] w-48 rounded-2xl overflow-hidden shadow-2xl border"
          style={{
            top: menuPos.y,
            left: Math.max(8, menuPos.x - 192),
            background: 'rgba(255,255,255,0.96)',
            borderColor: 'rgba(148,163,184,0.35)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        >
          <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-widest text-gray-400">
            条目封面
          </div>
          <CardMenuItem
            label="对方头像"
            sub="跟随云端"
            active={!confidant.preferTarotOverAvatar}
            onClick={() => void setPreference(false)}
          />
          <CardMenuItem
            label="塔罗"
            sub="保持隐喻感"
            active={!!confidant.preferTarotOverAvatar}
            onClick={() => void setPreference(true)}
          />
        </motion.div>,
        document.body,
      )}
    </AnimatePresence>
    </>
  );
}

function CardMenuItem({ label, sub, active, onClick }: { label: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-black/5 transition-colors flex items-center gap-2 border-t border-black/5 first:border-t-0"
    >
      <span className="w-3 text-center text-emerald-500 font-bold">
        {active ? '✓' : ''}
      </span>
      <div className="flex-1">
        <div className="font-semibold text-gray-800">{label}</div>
        <div className="text-[10px] text-gray-500 font-normal">{sub}</div>
      </div>
    </button>
  );
}

/**
 * 同伴卡右侧的"圆角矩形 + 四角星"祈愿快捷按钮。
 * 与 Cooperation 页占位卡里的同步，样式一致。
 */
function PrayerQuickButton({
  alreadyPrayed,
  waitingReciprocity,
  pending,
  onClick,
}: {
  alreadyPrayed: boolean;
  waitingReciprocity: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const disabled = alreadyPrayed || pending;

  return (
    <motion.button
      data-pray-button="1"
      whileTap={{ scale: disabled ? 1 : 0.92 }}
      whileHover={{ scale: disabled ? 1 : 1.04 }}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      disabled={disabled}
      aria-label={alreadyPrayed ? '今日已祈愿' : '为 Ta 祈愿'}
      title={alreadyPrayed ? '今日已祈愿' : waitingReciprocity ? '回敬祈愿 · 双方 +3 SP' : '祈愿 · 双方各 +2 SP'}
      className="relative flex-shrink-0 self-center flex items-center justify-center w-11 h-11 rounded-xl overflow-hidden disabled:cursor-default"
      style={{
        background: alreadyPrayed
          ? 'linear-gradient(135deg, rgba(75,85,99,0.35), rgba(55,65,81,0.25))'
          : waitingReciprocity
            ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
            : 'linear-gradient(135deg, #fcd34d, #d97706)',
        border: alreadyPrayed
          ? '1px solid rgba(148,163,184,0.35)'
          : '1px solid rgba(253,230,138,0.7)',
        boxShadow: alreadyPrayed
          ? 'none'
          : waitingReciprocity
            ? '0 6px 18px -6px rgba(245,158,11,0.65), inset 0 0 10px rgba(255,255,255,0.25)'
            : '0 4px 14px -4px rgba(217,119,6,0.55)',
      }}
    >
      {waitingReciprocity && !alreadyPrayed && (
        <motion.div
          className="absolute inset-0 rounded-xl"
          animate={{ opacity: [0.15, 0.45, 0.15] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ background: 'radial-gradient(circle at 50% 40%, #fff8 0%, transparent 60%)' }}
        />
      )}
      {pending ? (
        <motion.span
          className="text-white text-base"
          animate={{ rotate: 360, scale: [0.9, 1.05, 0.9] }}
          transition={{ rotate: { duration: 0.9, repeat: Infinity, ease: 'linear' }, scale: { duration: 1.1, repeat: Infinity } }}
          aria-hidden
        >
          ✦
        </motion.span>
      ) : alreadyPrayed ? (
        <span className="text-sm font-bold" style={{ color: '#cbd5e1' }}>✓</span>
      ) : (
        <span
          className="text-lg font-black leading-none drop-shadow"
          style={{ color: '#fffbeb', textShadow: '0 1px 6px rgba(120,60,0,0.35)' }}
          aria-hidden
        >
          ✦
        </span>
      )}
    </motion.button>
  );
}
