/**
 * 在线同伴小名片 —— 从"全部 / 在线" Tab 的占位卡或 Confidant 详情入口打开。
 *
 * 展示：
 *   - 昵称 / UserID / 头像 / 总 LV
 *   - 五维雷达图（使用对方的自定义属性名；缺失退化默认名）
 *   - 最近同步时间
 *
 * 操作：
 *   - 祈愿（每日一次，+3 SP 给对方；双向互祈会额外显示）
 *   - 邀请 COOP（占位，disabled，"即将开放"）
 *   - 解除好友（移到"更多"里，二次确认）
 */

import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OnlineStarBadge } from './OnlineStarBadge';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
// 雷达图（recharts，400KB 上下）按需分包：只有打开资料卡才下载（第 4 轮）
const ConfidantRadar = lazy(() => import('./ConfidantRadar'));
import { useCloudSocialStore } from '@/store/cloudSocial';
import { useCloudStore } from '@/store/cloud';
import { useAppStore } from '@/store';
import { severFriendship } from '@/services/friends';
import {
  hasPrayedToday,
  hasBeenPrayedByToday,
  getNextResetTime,
} from '@/services/prayers';
import { getAttributeLevelTitle } from '@/utils/attributeLevelTitles';
import type { AttributeId, CloudProfile, Friendship } from '@/types';
import { GUEST_LV_HARD, GUEST_LV_NORMAL } from '@/utils/levelDifficulty';
import { PactPanel } from './PactPanel';
import { usePactStatus } from './PactTag';
import { GoalLine, PRESENCE_NIGHT, SwapFaces, swapTagProps, useStatusSwap } from '@/components/profile/PresenceLine';

const ATTR_ORDER: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const DEFAULT_ATTR_LABELS: Record<AttributeId, string> = {
  knowledge: '知识',
  guts: '胆量',
  dexterity: '灵巧',
  kindness: '温柔',
  charm: '魅力',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: CloudProfile | null;
  friendship: Friendship | null;
  /** 由外层（Cooperation 页）统一驱动：播放音效 + 触发特效层 */
  onPray: () => Promise<boolean>;
  prayerPending: boolean;
  /** 点击"邀请 COOP" —— 由外层打开 CoopProposeModal */
  onProposeCoop: () => void;
  /** 点击"响应对方提议" —— 由外层打开 CoopAcceptModal，bond 从 profile card 内部的 relatedBond 传出 */
  onAcceptCoop: (bond: import('@/types').CoopBond) => void;
}

export function OnlineConfidantProfileCard({
  isOpen, onClose, profile, friendship, onPray, prayerPending,
  onProposeCoop, onAcceptCoop,
}: Props) {
  const todayPrayers = useCloudSocialStore(s => s.todayPrayers);
  const coopBonds = useCloudSocialStore(s => s.coopBonds);
  const updateFriendship = useCloudSocialStore(s => s.updateFriendship);
  const cloudUser = useCloudStore(s => s.cloudUser);
  const battleState = useAppStore(s => s.battleState);
  // 一起进步：这位是不是在线同伴（同一天都完成才涨亲密度）
  const isConfidant = useAppStore(s => !!profile && s.confidants.some(c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === profile.id));

  // 当前与这位的 COOP bond（最多一条活跃）
  const relatedBond = useMemo(() => {
    if (!profile || !cloudUser) return null;
    return coopBonds.find(
      b => (b.userAId === profile.id || b.userBId === profile.id)
        && (b.userAId === cloudUser.id || b.userBId === cloudUser.id),
    ) ?? null;
  }, [coopBonds, profile, cloudUser]);

  const coopStatus: 'none' | 'pending_mine' | 'pending_theirs' | 'linked' | 'cooldown_rejected' | 'cooldown_severed' = useMemo(() => {
    if (!relatedBond) return 'none';
    if (relatedBond.status === 'linked') return 'linked';
    if (relatedBond.status === 'pending') {
      return relatedBond.initiatorId === cloudUser?.id ? 'pending_mine' : 'pending_theirs';
    }
    if (relatedBond.status === 'rejected') {
      const until = relatedBond.reRequestAfter?.getTime() ?? 0;
      return until > Date.now() ? 'cooldown_rejected' : 'none';
    }
    if (relatedBond.status === 'severed') {
      const until = relatedBond.reLinkAfter?.getTime() ?? 0;
      return until > Date.now() ? 'cooldown_severed' : 'none';
    }
    return 'none';
  }, [relatedBond, cloudUser]);

  const [severing, setSevering] = useState(false);
  const [severConfirm, setSeverConfirm] = useState(false);
  const [severError, setSeverError] = useState('');
  const [selectedAttr, setSelectedAttr] = useState<AttributeId>('knowledge');
  // 选项卡：五维（默认）/ 一起进步（v2.7.0.6：面板从卡底挪进来，名片不再拉得很长）
  const [tab, setTab] = useState<'attrs' | 'pact'>('attrs');
  useEffect(() => { if (isOpen) setTab('attrs'); }, [isOpen, profile?.id]);
  const pactStatus = usePactStatus(friendship && profile ? profile.id : undefined);
  // LV 与名片状态共用一枚（第 6 项）
  const lvSwap = useStatusSwap(profile?.status);
  // 一起进步那一页至少和五维一样高：切换时下面的按钮不跳
  const attrsRef = useRef<HTMLDivElement>(null);
  const [attrsHeight, setAttrsHeight] = useState(0);
  useLayoutEffect(() => {
    if (tab === 'attrs' && attrsRef.current) setAttrsHeight(attrsRef.current.offsetHeight);
  }, [tab, isOpen, profile]);

  // ── 衍生状态 ───────────────────────────────────────────
  const alreadyPrayed = profile ? hasPrayedToday(profile.id, todayPrayers) : false;
  const beenPrayedByThem = profile ? hasBeenPrayedByToday(profile.id, todayPrayers) : false;
  const resetText = useMemo(() => formatReset(getNextResetTime()), [todayPrayers]);

  const { axes: radarData, domainMax: radarMax } = useMemo(() => buildRadarData(profile), [profile]);
  const levelsSum = useMemo(
    () => ATTR_ORDER.reduce(
      (acc, id) => acc + (profile?.attributeLevels?.[id] ?? 0),
      0,
    ),
    [profile],
  );
  const totalLv = profile?.totalLv ?? levelsSum;
  const selectedLevel = profile?.attributeLevels?.[selectedAttr] ?? 0;
  const selectedName = profile?.attributeNames?.[selectedAttr] || DEFAULT_ATTR_LABELS[selectedAttr];
  const selectedTitle = getAttributeLevelTitle(profile?.attributeLevelTitles, selectedAttr, selectedLevel);

  // ── 操作 ───────────────────────────────────────────────
  const handlePray = async () => {
    if (!profile || prayerPending || alreadyPrayed) return;
    await onPray();
  };

  const handleSever = async () => {
    if (!friendship || severing) return;
    setSeverError('');
    setSevering(true);
    try {
      const updated = await severFriendship(friendship.id);
      updateFriendship(friendship.id, {
        status: updated.status,
        respondedAt: updated.respondedAt,
        reLinkAfter: updated.reLinkAfter,
      });
      setSeverConfirm(false);
      onClose();
    } catch (err) {
      setSeverError(err instanceof Error ? err.message : '解除失败');
    } finally {
      setSevering(false);
    }
  };

  if (!isOpen || !profile) return null;

  const name = profile.nickname || profile.userId || '未命名客人';
  const initial = (profile.nickname?.[0] || profile.userId?.[0] || '?').toUpperCase();
  const canPrayDisabledReason = !cloudUser
    ? '登录后可祈愿'
    : alreadyPrayed
      ? `今天已祈愿 · ${resetText}刷新`
      : '';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[190] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(180deg, #1c1b3a 0%, #0e0e25 100%)',
            border: '1px solid rgba(196,181,253,0.22)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 50px rgb(var(--color-battle-rgb) / 0.22)',
          }}
        >
          {/* Header */}
          <div className="relative px-5 pt-5 pb-4">
            <div
              className="text-[10px] tracking-[0.5em] font-bold mb-2"
              style={{ color: '#fbbf24' }}
            >
              GUEST PROFILE
            </div>
            <div className="flex items-start gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-500/20 text-indigo-200 font-black text-2xl flex items-center justify-center flex-shrink-0 border border-white/10">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={name} className="w-full h-full object-cover" draggable={false} />
                ) : (
                  initial
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex min-w-0 items-center gap-1.5 text-lg font-serif" style={{ color: '#f5e6ff' }}>
                  <OnlineStarBadge glow={beenPrayedByThem && !alreadyPrayed} ink="#c9a6ff" size={13} />
                  {/* 同 ConfidantCard：行内 overflow:hidden 会按字体内容区裁掉字的下沿 */}
                  <span className="block truncate">{name}</span>
                </div>
                <div className="text-[11px] truncate" style={{ color: '#a89dc0' }}>
                  @{profile.userId ?? '—'}
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                  <span
                    className="px-1.5 py-0.5 rounded-full font-bold tracking-widest"
                    style={{
                      background: 'rgba(16,185,129,0.15)',
                      color: '#6ee7b7',
                      border: '1px solid rgba(16,185,129,0.35)',
                    }}
                  >
                    ONLINE
                  </span>
                  {/* 困难档的人，等级在别人眼里也是红的（R19）。
                      对方档位靠 CloudProfile.levelDifficulty 带过来；拿不到就按普通显示。 */}
                  <span
                    className={`tabular-nums font-bold ${lvSwap.preset ? 'cursor-pointer' : ''}`}
                    style={{ color: profile.levelDifficulty === 'hard' ? GUEST_LV_HARD : GUEST_LV_NORMAL }}
                    {...swapTagProps(lvSwap, `LV ${totalLv}`)}
                  >
                    <SwapFaces swap={lvSwap} lv={<>LV {totalLv}</>} />
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#c8c2e0' }}
                aria-label="关闭"
              >✕</button>
            </div>
            {/* 名片目标（v2.7.0.6 第 6 项） */}
            {profile.goal && (
              <div className="mt-3 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(196,181,253,0.18)' }}>
                <GoalLine goal={profile.goal} colors={PRESENCE_NIGHT} />
                {profile.goal.subtitle && <div className="mt-0.5 truncate text-[10px]" style={{ color: '#8f86ad' }}>{profile.goal.subtitle}</div>}
              </div>
            )}
          </div>

          <div
            className="mx-5 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(196,181,253,0.35), transparent)' }}
          />

          {/* 选项卡：FIVE ATTRIBUTES / TOGETHER（不是好友就只有五维） */}
          <div className="px-5 pt-3 pb-2">
            <div className="flex items-end justify-between mb-1.5">
              {friendship ? (
                <div role="tablist" className="flex items-end gap-4">
                  <ProfileTab on={tab === 'attrs'} onClick={() => setTab('attrs')}>FIVE ATTRIBUTES</ProfileTab>
                  <ProfileTab on={tab === 'pact'} onClick={() => setTab('pact')} dot={pactStatus?.tone === 'hot'}>TOGETHER</ProfileTab>
                </div>
              ) : (
                <div
                  className="text-[10px] tracking-[0.3em] font-bold"
                  style={{ color: '#8b84a8' }}
                >
                  FIVE ATTRIBUTES
                </div>
              )}
              {tab === 'attrs' && (
                <div className="pb-1.5 text-[9px] tracking-wider" style={{ color: '#6b6591' }}>
                  外圈 = LV {radarMax}
                </div>
              )}
            </div>
            {tab === 'pact' && friendship ? (
              <div className="flex flex-col justify-center pt-1" style={{ minHeight: attrsHeight || undefined }}>
                <PactPanel partnerId={profile.id} partnerName={name} isConfidant={isConfidant} surface="night" bare proposeLabel="发起共同行动" />
              </div>
            ) : (
            <div ref={attrsRef}>
            <div className="h-48 -mx-2">
              <Suspense fallback={null}>
                <ConfidantRadar radarData={radarData} radarMax={radarMax} />
              </Suspense>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mt-1">
              {radarData.map(axis => {
                const active = axis.id === selectedAttr;
                return (
                  <button
                    key={axis.id}
                    type="button"
                    onClick={() => setSelectedAttr(axis.id)}
                    className="min-w-0 rounded-lg px-1.5 py-1.5 text-center border transition-colors"
                    style={{
                      background: active ? 'rgb(var(--color-battle-rgb) / 0.26)' : 'rgba(255,255,255,0.04)',
                      borderColor: active ? 'rgba(196,181,253,0.5)' : 'rgba(196,181,253,0.14)',
                      color: active ? '#f5e6ff' : '#a89dc0',
                    }}
                  >
                    <div className="text-[9px] font-bold truncate">{axis.axis}</div>
                    <div className="text-[9px] tabular-nums opacity-75">LV{axis.value}</div>
                  </button>
                );
              })}
            </div>
            <div
              className="mt-2 rounded-xl px-3 py-2 text-center border"
              style={{
                background: 'linear-gradient(135deg, rgba(196,181,253,0.14), rgb(var(--color-battle-rgb) / 0.06))',
                borderColor: 'rgba(196,181,253,0.25)',
              }}
            >
              <div className="text-[9px] tracking-[0.18em] font-bold uppercase" style={{ color: '#8b84a8' }}>
                {selectedName}
              </div>
              <div className="mt-0.5 text-sm font-black tabular-nums" style={{ color: '#f5e6ff' }}>
                LV{selectedLevel}: {selectedTitle}
              </div>
            </div>
            {/* 两枚迷你统计：总点数 / 已解锁 */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div
                className="rounded-xl px-3 py-2 text-center border"
                style={{
                  background: 'linear-gradient(135deg, rgb(var(--color-battle-rgb) / 0.18), rgb(var(--color-battle-rgb) / 0.06))',
                  borderColor: 'rgba(196,181,253,0.25)',
                }}
              >
                <div className="text-[9px] tracking-[0.18em] font-bold" style={{ color: '#8b84a8' }}>
                  TOTAL POINTS
                </div>
                <div className="text-base font-black tabular-nums mt-0.5" style={{ color: '#e9d5ff' }}>
                  {(profile.totalPoints ?? 0).toLocaleString()}
                </div>
              </div>
              <div
                className="rounded-xl px-3 py-2 text-center border"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06))',
                  borderColor: 'rgba(252,211,77,0.25)',
                }}
              >
                <div className="text-[9px] tracking-[0.18em] font-bold" style={{ color: '#a89070' }}>
                  UNLOCKED
                </div>
                <div className="text-base font-black tabular-nums mt-0.5" style={{ color: '#fde68a' }}>
                  {profile.unlockedCount ?? 0}
                </div>
              </div>
            </div>
            {profile.lastSyncedAt && (
              <div className="text-[10px] text-center mt-2" style={{ color: '#6b6591' }}>
                最近同步：{formatLastSync(profile.lastSyncedAt)}
              </div>
            )}
            </div>
            )}
          </div>

          {/* 行动区 */}
          <div className="px-5 pt-3 pb-5">
            <div className="grid grid-cols-2 gap-2">
              {/* 祈愿按钮 */}
              <motion.button
                whileTap={{ scale: alreadyPrayed || prayerPending ? 1 : 0.97 }}
                onClick={handlePray}
                disabled={!cloudUser || alreadyPrayed || prayerPending}
                className="relative py-3 rounded-xl overflow-hidden text-sm font-bold text-white disabled:opacity-55"
                style={{
                  background: alreadyPrayed
                    ? 'linear-gradient(135deg, #4b5563, #374151)'
                    : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  boxShadow: alreadyPrayed ? 'none' : '0 6px 20px rgba(245,158,11,0.35)',
                }}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-base">✦</span>
                  <span>{prayerPending ? '祈愿中…' : alreadyPrayed ? '今日已祈愿' : '为 Ta 祈愿'}</span>
                </div>
                <div className="text-[10px] opacity-80 mt-0.5">
                  {alreadyPrayed ? `${resetText}刷新` : '双方各 +2 SP'}
                </div>
                {/* 对方已为我祈愿 / 双向互祈 提示徽标 */}
                {!alreadyPrayed && beenPrayedByThem && (
                  <span
                    className="absolute top-1.5 right-1.5 px-1 py-[1px] rounded text-[9px] font-black tracking-wider"
                    style={{
                      background: 'rgba(255,255,255,0.9)',
                      color: '#b45309',
                    }}
                  >
                    RECIP?
                  </span>
                )}
              </motion.button>

              {/* COOP 按钮：根据 bond 状态分岔 */}
              {coopStatus === 'linked' ? (
                <button
                  disabled
                  className="py-3 rounded-xl text-sm font-bold text-white cursor-default"
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 6px 20px rgba(16,185,129,0.35)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base">✦</span>
                    <span>已缔结 COOP</span>
                  </div>
                  <div className="text-[10px] opacity-80 mt-0.5">在同伴列表里找 Ta</div>
                </button>
              ) : coopStatus === 'pending_mine' ? (
                <button
                  disabled
                  className="py-3 rounded-xl text-sm font-bold text-gray-200 cursor-default"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb) / 0.6), rgba(79,70,229,0.5))',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base animate-pulse">…</span>
                    <span>等 Ta 响应</span>
                  </div>
                  <div className="text-[10px] opacity-75 mt-0.5">14 天内未响应过期</div>
                </button>
              ) : coopStatus === 'pending_theirs' ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { if (relatedBond) onAcceptCoop(relatedBond); }}
                  className="py-3 rounded-xl text-sm font-bold text-white shadow-md"
                  style={{
                    background: 'linear-gradient(135deg, #ec4899, #db2777)',
                    boxShadow: '0 6px 20px rgba(236,72,153,0.4)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base">✦</span>
                    <span>响应 COOP</span>
                  </div>
                  <div className="text-[10px] opacity-85 mt-0.5">Ta 发来了提议</div>
                </motion.button>
              ) : coopStatus === 'cooldown_rejected' || coopStatus === 'cooldown_severed' ? (
                <button
                  disabled
                  className="py-3 rounded-xl text-sm font-bold text-gray-400 cursor-default"
                  style={{
                    background: 'linear-gradient(135deg, rgba(148,163,184,0.15), rgba(148,163,184,0.1))',
                    border: '1px dashed rgba(148,163,184,0.3)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base">⌛</span>
                    <span>冷却中</span>
                  </div>
                  <div className="text-[10px] opacity-70 mt-0.5">
                    {coopStatus === 'cooldown_rejected' ? '3 天后可重试' : '7 天后可重试'}
                  </div>
                </button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onProposeCoop}
                  className="py-3 rounded-xl text-sm font-bold text-white shadow-md"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb)), rgb(var(--color-bond-bright-rgb)))',
                    boxShadow: '0 6px 20px rgb(var(--color-bond-rgb) / 0.35)',
                  }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-base">⚔</span>
                    <span>邀请 COOP</span>
                  </div>
                  <div className="text-[10px] opacity-85 mt-0.5">缔结在线同伴</div>
                </motion.button>
              )}
            </div>

            {/* SP 归处提示 */}
            {!battleState && (
              <p className="mt-3 text-[10px] text-center leading-relaxed" style={{ color: '#6b6591' }}>
                Ta 给你的 SP 会先攒在通知里；开启逆影战场后自动入账。
              </p>
            )}
            {canPrayDisabledReason && (
              <p className="mt-3 text-[10px] text-center" style={{ color: '#6b6591' }}>
                {canPrayDisabledReason}
              </p>
            )}
          </div>

          <div
            className="mx-5 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(196,181,253,0.2), transparent)' }}
          />

          {/* 更多 / 解除 */}
          <div className="px-5 pt-3 pb-5">
            {!severConfirm ? (
              <button
                onClick={() => setSeverConfirm(true)}
                disabled={!friendship}
                className="w-full py-2 rounded-lg text-[11px] disabled:opacity-40"
                style={{
                  background: 'rgba(239,68,68,0.05)',
                  color: '#fca5a5',
                  border: '1px solid rgba(239,68,68,0.15)',
                }}
              >
                解除好友关系
              </button>
            ) : (
              <div
                className="p-3 rounded-lg space-y-2"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <p className="text-[11px] leading-relaxed" style={{ color: '#fecaca' }}>
                  确认要与 {name} 解除好友？<br />
                  解除后 7 天内无法再次相互邀请。
                </p>
                {severError && (
                  <p className="text-[10px]" style={{ color: '#fca5a5' }}>{severError}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setSeverConfirm(false); setSeverError(''); }}
                    disabled={severing}
                    className="py-1.5 rounded-md text-[11px] disabled:opacity-40"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#c8c2e0' }}
                  >
                    再想想
                  </button>
                  <button
                    onClick={handleSever}
                    disabled={severing}
                    className="py-1.5 rounded-md text-[11px] font-bold text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}
                  >
                    {severing ? '处理中…' : '确认解除'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            className="pb-4 pt-1 text-center text-[10px] tracking-[0.3em]"
            style={{ color: '#4c4878' }}
          >
            —— THE VELVET ——
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ── helpers ─────────────────────────────────────────────

/** 名片上的选项卡：选中的字亮、下面一道战斗色细线；dot = 需要你动一下（待回应 / 被催） */
function ProfileTab({ on, onClick, dot, children }: { on: boolean; onClick: () => void; dot?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className="relative pb-1.5 text-[10px] font-bold tracking-[0.22em]"
      style={{ color: on ? '#f5e6ff' : '#8b84a8' }}
    >
      {children}
      {dot && <span aria-hidden className="absolute -right-2 top-0 h-1.5 w-1.5 rounded-full bg-rose-400" />}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[2px] rounded-full transition-opacity"
        style={{ background: 'rgb(var(--color-battle-rgb))', opacity: on ? 1 : 0 }}
      />
    </button>
  );
}

/** radar 数据 + 当前刻度上限。max 跟着对方"最高那维 LV"走（至少 5、至多 10）。 */
function buildRadarData(profile: CloudProfile | null): {
  axes: Array<{ id: AttributeId; axis: string; value: number; fullMark: number; title: string }>;
  domainMax: number;
} {
  if (!profile) {
    return {
      axes: ATTR_ORDER.map(id => ({
        id,
        axis: DEFAULT_ATTR_LABELS[id],
        value: 0,
        fullMark: 5,
        title: getAttributeLevelTitle(undefined, id, 0),
      })),
      domainMax: 5,
    };
  }
  const names = profile.attributeNames ?? {};
  const levels = profile.attributeLevels ?? {};
  const numericLevels = ATTR_ORDER.map(id => Math.max(0, Math.min(10, levels[id] ?? 0)));
  const peak = Math.max(0, ...numericLevels);
  // scale: 至少 5（避免 LV 1-2 时 radar 太挤），至多 10（满级），否则跟着对方最高 LV
  const domainMax = Math.max(5, Math.min(10, peak));
  return {
    axes: ATTR_ORDER.map((id, i) => ({
      id,
      axis: (names[id] || DEFAULT_ATTR_LABELS[id]).slice(0, 4),
      value: numericLevels[i],
      fullMark: domainMax,
      title: getAttributeLevelTitle(profile.attributeLevelTitles, id, numericLevels[i]),
    })),
    domainMax,
  };
}

function formatLastSync(d: Date): string {
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

function formatReset(next: Date): string {
  const diff = next.getTime() - Date.now();
  if (diff <= 0) return '凌晨 4 点';
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  if (h > 0) return `${h} 小时后`;
  if (m > 0) return `${m} 分钟后`;
  return '马上';
}
