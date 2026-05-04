import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { PageTitle } from '@/components/PageTitle';
import { ConfidantCard } from '@/components/cooperation/ConfidantCard';
import { ConfidantCreateModal } from '@/components/cooperation/ConfidantCreateModal';
import { ConfidantDetailModal } from '@/components/cooperation/ConfidantDetailModal';
import { CounselChatModal } from '@/components/cooperation/CounselChatModal';
import { CounselArchiveModal } from '@/components/cooperation/CounselArchiveModal';
import { NotificationsPanel } from '@/components/cooperation/NotificationsPanel';
import { AddOnlineConfidantModal } from '@/components/cooperation/AddOnlineConfidantModal';
import { OnlineConfidantProfileCard } from '@/components/cooperation/OnlineConfidantProfileCard';
import { PrayerEffectOverlay, type PrayerEffectKind } from '@/components/cooperation/PrayerEffectOverlay';
import { CoopProposeModal } from '@/components/cooperation/CoopProposeModal';
import { CoopAcceptModal } from '@/components/cooperation/CoopAcceptModal';
import { CoopShadowBattleModal } from '@/components/cooperation/CoopShadowBattleModal';
import { CoopVictoryScreen } from '@/components/cooperation/CoopVictoryScreen';
import { MAJOR_ARCANA_IDS } from '@/utils/confidantLevels';
import { sendPrayer, hasPrayedToday, hasBeenPrayedByToday } from '@/services/prayers';
import { loadSocial } from '@/services/social';
import { playSound } from '@/utils/feedback';
import type { CloudProfile, CoopBond, CoopShadow, Friendship } from '@/types';

type Filter = 'all' | 'offline' | 'online' | 'archived';

export function Cooperation() {
  const { confidants, counselArchives, getCounselCooldown, hasActiveCounsel, bumpConfidantIntimacy, battleState, saveBattleState } = useAppStore();
  const cloudUser = useCloudStore(s => s.cloudUser);
  const unreadCount = useCloudSocialStore(s => s.unreadCount);
  const linkedFriendships = useCloudSocialStore(s => s.friendships);
  const todayPrayers = useCloudSocialStore(s => s.todayPrayers);
  const addTodayPrayer = useCloudSocialStore(s => s.addTodayPrayer);
  const materializeBlockers = useCloudSocialStore(s => s.materializeBlockers);
  const coopShadows = useCloudSocialStore(s => s.coopShadows);
  const [shadowBattle, setShadowBattle] = useState<{ shadow: CoopShadow; partnerName: string } | null>(null);
  const [shadowVictory, setShadowVictory] = useState<CoopShadow | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // 菜单触发按钮上的红点：unreadCount>0 时点亮；用户**打开**菜单后置 ack=true 暂时熄灭。
  // 当 unreadCount 再次上涨（来了新通知），自动复燃。
  // 注意：菜单内"通知"项的红点不受这个 ack 影响（那个由真实 unreadCount 控制）。
  const [menuDotAck, setMenuDotAck] = useState(false);
  const lastUnreadRef = useRef(0);
  useEffect(() => {
    if (unreadCount > lastUnreadRef.current) setMenuDotAck(false);
    lastUnreadRef.current = unreadCount;
  }, [unreadCount]);
  const showMenuTriggerDot = unreadCount > 0 && !menuDotAck;
  const [infoOpen, setInfoOpen] = useState(false);
  const [counselOpen, setCounselOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [addOnlineOpen, setAddOnlineOpen] = useState(false);
  const [profileCard, setProfileCard] = useState<{ profile: CloudProfile; friendship: Friendship } | null>(null);
  const [prayerEffect, setPrayerEffect] = useState<{ kind: PrayerEffectKind; name: string; seq: number } | null>(null);
  const [prayerInFlight, setPrayerInFlight] = useState<string | null>(null);
  const [prayerError, setPrayerError] = useState<{ id: string; message: string } | null>(null);
  const [coopProposeTarget, setCoopProposeTarget] = useState<CloudProfile | null>(null);
  const [coopAcceptBond, setCoopAcceptBond] = useState<CoopBond | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement>(null);

  // 清错误：祈愿错误气泡 4s 后自动消失
  useEffect(() => {
    if (!prayerError) return;
    const t = setTimeout(() => setPrayerError(null), 4000);
    return () => clearTimeout(t);
  }, [prayerError]);

  // 羁绊之影胜利 / 撤退弹窗触发：
  //   - 终结者：战斗面板里 onVictory 回调已触发
  //   - 非终结者（对方终结）：loadSocial 后 settleFinishedShadows 写了 Confidant.coopMemorials，
  //     这里扫 confidants 看有没有"新"的 memorial，弹一次对应的结算屏。
  //
  // 已弹过的用 localStorage 持久化 shadowId，避免重进同伴页重复弹。
  useEffect(() => {
    if (shadowVictory || shadowBattle) return; // 当前已有一个弹窗在显示，让它先收掉
    for (const s of coopShadows) {
      if (s.status !== 'defeated' && s.status !== 'retreated') continue;
      const key = `velvet_coop_victory_shown_${s.id}`;
      if (typeof window !== 'undefined' && window.localStorage.getItem(key) === '1') continue;

      // 找到对应的 Confidant + 确认 memorial 已落到本地（奖励已发放）
      const me = cloudUser?.id as string | undefined;
      if (!me) continue;
      const partnerId = s.userAId === me ? s.userBId : s.userAId;
      const confidant = confidants.find(
        c => c.source === 'online' && c.linkedCloudUserId === partnerId,
      );
      if (!confidant) continue;
      const hasMemorial = (confidant.coopMemorials ?? []).some(m =>
        s.status === 'defeated'
          ? m.shadowId === s.shadowId && m.defeatedAt === (s.defeatedAt?.toISOString() ?? '')
          : m.shadowId === `retreat-${s.id}`,
      );
      if (!hasMemorial) continue;

      // 标记已弹
      if (typeof window !== 'undefined') window.localStorage.setItem(key, '1');
      setShadowVictory(s);
      break; // 一次只弹一个
    }
  }, [coopShadows, confidants, shadowVictory, shadowBattle, cloudUser]);

  const executePrayer = async (profile: CloudProfile): Promise<boolean> => {
    if (!cloudUser || prayerInFlight) return false;
    if (hasPrayedToday(profile.id, todayPrayers)) return false;
    setPrayerInFlight(profile.id);
    setPrayerError(null);
    // 音效立刻打出，减少点击→反馈延迟
    playSound('/pray.mp3', 0.9);
    try {
      const { prayer, reciprocal } = await sendPrayer(profile.id, todayPrayers);
      addTodayPrayer(prayer);
      const name = profile.nickname || profile.userId || '未命名客人';
      setPrayerEffect({
        kind: reciprocal ? 'reciprocal' : 'sent',
        name,
        seq: Date.now(),
      });

      // 已 COOP 的在线同伴：每日祈愿固定 intimacy +1（互祈不加倍 —— 反射只走 SP）
      const localOnline = confidants.find(
        c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === profile.id,
      );
      if (localOnline) {
        try {
          await bumpConfidantIntimacy(
            localOnline.id,
            1,
            'conversation',
            reciprocal ? '今日互相祈愿。愿望之光交汇' : '送出今日的祈愿',
          );
        } catch (err) {
          console.warn('[cooperation] bump intimacy on prayer failed', err);
        }
      }

      // 发送方 SP：+2（送出）；若构成互祈再 +1 反射
      if (battleState) {
        const senderGrant = 2 + (reciprocal ? 1 : 0);
        try {
          await saveBattleState({
            ...battleState,
            sp: battleState.sp + senderGrant,
            totalSpEarned: battleState.totalSpEarned + senderGrant,
          });
        } catch (err) {
          console.warn('[cooperation] award sender prayer SP failed', err);
        }
      }

      void loadSocial({ force: true });
      return true;
    } catch (err) {
      setPrayerError({
        id: profile.id,
        message: err instanceof Error ? err.message : '祈愿失败，稍后再试',
      });
      return false;
    } finally {
      setPrayerInFlight(null);
    }
  };

  // 进同伴页时刷一次社交数据（30s 节流由 loadSocial 内部处理）
  useEffect(() => {
    if (!cloudUser) return;
    void loadSocial();
  }, [cloudUser]);

  // 菜单外点击关闭
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuAnchorRef.current && !menuAnchorRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const visible = useMemo(() => {
    const pickOrder = (a: typeof confidants[number], b: typeof confidants[number]) => {
      // 在线 !archived > 离线 !archived > archived；同组内按创建时间倒序
      const rank = (c: typeof confidants[number]) => {
        if (c.archivedAt) return 2;
        if (c.source === 'online') return 0;
        return 1;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0);
    };

    let list: typeof confidants;
    switch (filter) {
      case 'offline':
        list = confidants.filter(c => !c.archivedAt && c.source === 'offline');
        break;
      case 'online':
        list = confidants.filter(c => !c.archivedAt && c.source === 'online');
        break;
      case 'archived':
        list = confidants.filter(c => !!c.archivedAt);
        break;
      default:
        list = confidants.filter(c => !c.archivedAt);
    }
    return [...list].sort(pickOrder);
  }, [confidants, filter]);

  const activeCount = confidants.filter(c => !c.archivedAt).length;
  const remaining = MAJOR_ARCANA_IDS.length - activeCount;

  const cooldown = getCounselCooldown();
  const counselAvailable = !cooldown.locked || hasActiveCounsel();

  // 已 linked 好友里，还没建 COOP 的那些 —— 在"全部" / "在线"顶部做成占位卡片展示
  const onlineFriendCards = useMemo(() => {
    if (!cloudUser) return [];
    const linkedIds = new Set(
      confidants
        .filter(c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId)
        .map(c => c.linkedCloudUserId as string),
    );
    return linkedFriendships.filter(
      f => f.status === 'linked' && f.otherProfile && !linkedIds.has(f.otherProfile.id),
    );
  }, [linkedFriendships, confidants, cloudUser]);

  const showOnlineFriends = filter === 'all' || filter === 'online';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-2xl mx-auto space-y-5"
    >
      <div className="flex items-center gap-2">
        <PageTitle title="同伴" en="Cooperation" enOffset={{ right: -32 }} />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] tracking-wider text-gray-400 tabular-nums">
            {activeCount} / {MAJOR_ARCANA_IDS.length}
          </span>
          {/* ✧ 菜单按钮：关于系统 / 谏言 / 归档 */}
          <div className="relative" ref={menuAnchorRef}>
            <button
              onClick={() => {
                setMenuOpen(v => !v);
                // 仅在 "打开" 这个动作上熄灭红点；关闭操作不动 ack
                if (!menuOpen) setMenuDotAck(true);
              }}
              className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                menuOpen
                  ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                  : 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 hover:bg-indigo-500/20'
              }`}
              aria-label={showMenuTriggerDot ? `同伴系统菜单（${unreadCount} 条新通知）` : '同伴系统菜单'}
            >
              ✧
              {showMenuTriggerDot && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-gray-900 shadow"
                />
              )}
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-10 z-30 w-56 rounded-2xl overflow-hidden shadow-2xl border"
                  style={{
                    background: 'rgba(255,255,255,0.96)',
                    borderColor: 'rgba(148,163,184,0.35)',
                    backdropFilter: 'blur(18px)',
                    WebkitBackdropFilter: 'blur(18px)',
                  }}
                >
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setInfoOpen(v => !v);
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-gray-800 hover:bg-black/5 transition-colors flex items-center gap-2"
                  >
                    <span className="text-base">✦</span>
                    <div className="flex-1">
                      <div>关于同伴系统</div>
                      <div className="text-[10px] text-gray-500 font-normal">展开 / 收起简介</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setCounselOpen(true);
                    }}
                    disabled={!counselAvailable}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-indigo-700 hover:bg-indigo-500/10 transition-colors flex items-center gap-2 border-t border-black/5 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <span className="text-base">✧</span>
                    <div className="flex-1">
                      <div>谏言</div>
                      <div className="text-[10px] text-gray-500 font-normal">
                        {hasActiveCounsel()
                          ? '当前窗口仍开着'
                          : cooldown.locked
                          ? `冷却中 · ${cooldown.nextAvailableDate} 再开`
                          : '每 3 天可用一次'}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setArchiveOpen(true);
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-gray-800 hover:bg-black/5 transition-colors flex items-center gap-2 border-t border-black/5"
                  >
                    <span className="text-base">🗂</span>
                    <div className="flex-1">
                      <div>谏言归档库</div>
                      <div className="text-[10px] text-gray-500 font-normal">
                        {counselArchives.length} 条旧谈话
                      </div>
                    </div>
                  </button>

                  {/* 通知（在线社交） */}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setNotificationsOpen(true);
                    }}
                    disabled={!cloudUser}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-gray-800 hover:bg-black/5 transition-colors flex items-center gap-2 border-t border-black/5 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <span className="text-base relative">
                      🔔
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center px-0.5 shadow">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </span>
                    <div className="flex-1">
                      <div>通知</div>
                      <div className="text-[10px] text-gray-500 font-normal">
                        {!cloudUser
                          ? '登录后可查看'
                          : unreadCount > 0
                          ? `${unreadCount} 条未读`
                          : '暂无新消息'}
                      </div>
                    </div>
                  </button>

                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 说明面板：默认收起；菜单里点"关于"展开 */}
      <AnimatePresence initial={false}>
        {infoOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500/8 to-purple-500/5 border border-indigo-500/20">
              <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                每一段关系都对应一张塔罗大阿卡纳。记录下 Ta，让这段羁绊随着你的真诚一起成长——
                亲密度提升会解锁日常加成、战斗道具与永久技能。
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                · 22 张大阿卡纳，每位同伴唯一占用一张<br />
                · 长按详情页的塔罗牌可换为自定义头像（仅保留本地）<br />
                · 详情页中部右侧的灰色 ✧ 可一键进入「谏言」，直接聊聊这段关系
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 物化冲突提示：对方已和你缔结 COOP，但本地同号塔罗已被占用 */}
      {materializeBlockers.length > 0 && (
        <div className="rounded-2xl px-4 py-3 border border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-[12px] leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="text-base mt-0.5 flex-shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-amber-700 dark:text-amber-300 mb-0.5">
                有 {materializeBlockers.length} 位已缔结 COOP 的同伴因塔罗冲突未能生成本地卡片
              </div>
              <div className="text-amber-700/85 dark:text-amber-200/80">
                {materializeBlockers.map(b => `@${b.otherName}`).join('、')} 想占用的塔罗已被其他活跃同伴使用。
                请先把冲突的同伴归档（或让对方改选塔罗），然后下次刷新会自动补齐。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 过滤 Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5 text-xs font-bold">
        {([
          { id: 'all', label: '全部' },
          { id: 'offline', label: '离线' },
          { id: 'online', label: '在线' },
          { id: 'archived', label: '归档' },
        ] as const).map(t => {
          const active = filter === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`py-2 rounded-xl transition-all ${
                active
                  ? 'bg-white dark:bg-gray-900 text-primary shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 列表 */}
      <AnimatePresence mode="popLayout">
        {visible.length === 0 && (!showOnlineFriends || onlineFriendCards.length === 0) ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-16 text-center"
          >
            <div className="text-5xl mb-3 opacity-40">✧</div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filter === 'archived' ? '暂无归档的同伴' : '尚未与任何同伴建立羁绊'}
            </p>
            {filter !== 'archived' && (
              <button
                onClick={() => setCreateOpen(true)}
                className="mt-4 px-5 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold shadow-lg shadow-purple-500/20"
              >
                邀请第一位同伴
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            layout
            className="space-y-3"
          >
            {/* 顶部：在线好友占位卡（已 linked 但未建 COOP） */}
            {showOnlineFriends && onlineFriendCards.map(f => {
              const profile = f.otherProfile!;
              const prayed = hasPrayedToday(profile.id, todayPrayers);
              const beenPrayedBy = hasBeenPrayedByToday(profile.id, todayPrayers);
              const showErr = prayerError?.id === profile.id ? prayerError.message : null;
              return (
                <motion.div
                  key={`friend-${f.id}`}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                >
                  <OnlineFriendPlaceholderCard
                    profile={profile}
                    alreadyPrayed={prayed}
                    waitingReciprocity={beenPrayedBy && !prayed}
                    prayerPending={prayerInFlight === profile.id}
                    prayerError={showErr}
                    onOpen={() => setProfileCard({ profile, friendship: f })}
                    onQuickPray={() => executePrayer(profile)}
                  />
                </motion.div>
              );
            })}
            {/* 常规同伴列表 */}
            {visible.map(c => {
              const isOnlineActive = c.source === 'online' && !c.archivedAt && !!c.linkedCloudUserId;
              const prayer = isOnlineActive
                ? {
                    alreadyPrayed: hasPrayedToday(c.linkedCloudUserId!, todayPrayers),
                    waitingReciprocity: hasBeenPrayedByToday(c.linkedCloudUserId!, todayPrayers)
                      && !hasPrayedToday(c.linkedCloudUserId!, todayPrayers),
                    pending: prayerInFlight === c.linkedCloudUserId,
                    onQuickPray: () => {
                      const profile = c.linkedProfile;
                      if (!profile) return;
                      void executePrayer(profile);
                    },
                  }
                : undefined;
              return (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                >
                  <ConfidantCard
                    confidant={c}
                    onClick={() => setDetailId(c.id)}
                    prayer={prayer}
                    activeShadow={
                      c.source === 'online' && c.linkedCloudUserId
                        ? coopShadows.find(
                            s => s.status === 'active'
                              && (s.userAId === c.linkedCloudUserId || s.userBId === c.linkedCloudUserId),
                          )
                        : undefined
                    }
                    onShadowClick={() => {
                      const s = coopShadows.find(
                        x => x.status === 'active'
                          && (x.userAId === c.linkedCloudUserId || x.userBId === c.linkedCloudUserId),
                      );
                      if (s) setShadowBattle({ shadow: s, partnerName: c.name });
                    }}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 浮动新增按钮 */}
      {visible.length > 0 && remaining > 0 && filter !== 'archived' && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setCreateOpen(true)}
          className="fixed bottom-20 md:bottom-8 right-5 md:right-8 z-40 w-14 h-14 rounded-full text-white shadow-2xl flex items-center justify-center text-2xl font-bold"
          style={{
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            boxShadow: '0 12px 36px -8px rgba(168, 85, 247, 0.5)',
          }}
          aria-label="新增同伴"
        >
          +
        </motion.button>
      )}

      <ConfidantCreateModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => setDetailId(id)}
        onPickOnline={() => {
          setCreateOpen(false);
          setAddOnlineOpen(true);
        }}
      />
      <ConfidantDetailModal
        isOpen={!!detailId}
        onClose={() => setDetailId(null)}
        confidantId={detailId}
        onViewOnlineProfile={(profile, friendship) => setProfileCard({ profile, friendship })}
        onOpenCoopShadow={(shadow, partnerName) => setShadowBattle({ shadow, partnerName })}
      />
      <CounselChatModal
        isOpen={counselOpen}
        onClose={() => setCounselOpen(false)}
      />
      <CounselArchiveModal
        isOpen={archiveOpen}
        onClose={() => setArchiveOpen(false)}
      />
      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onOpenCoopAccept={(bond) => setCoopAcceptBond(bond)}
      />
      <AddOnlineConfidantModal
        isOpen={addOnlineOpen}
        onClose={() => setAddOnlineOpen(false)}
      />
      <OnlineConfidantProfileCard
        isOpen={!!profileCard}
        onClose={() => setProfileCard(null)}
        profile={profileCard?.profile ?? null}
        friendship={profileCard?.friendship ?? null}
        prayerPending={profileCard ? prayerInFlight === profileCard.profile.id : false}
        onPray={() => profileCard ? executePrayer(profileCard.profile) : Promise.resolve(false)}
        onProposeCoop={() => profileCard && setCoopProposeTarget(profileCard.profile)}
        onAcceptCoop={(bond) => setCoopAcceptBond(bond)}
      />

      <CoopProposeModal
        isOpen={!!coopProposeTarget}
        onClose={() => setCoopProposeTarget(null)}
        target={coopProposeTarget}
      />

      <CoopAcceptModal
        isOpen={!!coopAcceptBond}
        onClose={() => setCoopAcceptBond(null)}
        bond={coopAcceptBond}
      />

      <PrayerEffectOverlay
        isOpen={!!prayerEffect}
        kind={prayerEffect?.kind ?? 'sent'}
        targetName={prayerEffect?.name ?? ''}
        onDismiss={() => setPrayerEffect(null)}
      />

      {/* 羁绊之影战斗面板 */}
      <CoopShadowBattleModal
        isOpen={!!shadowBattle}
        shadow={shadowBattle?.shadow ?? null}
        partnerName={shadowBattle?.partnerName ?? ''}
        onClose={() => setShadowBattle(null)}
        onVictory={() => {
          const s = shadowBattle?.shadow;
          setShadowBattle(null);
          // 胜利屏：优先用 cloudSocial 中最新的版本（status 已是 defeated）
          if (s) {
            const fresh = useCloudSocialStore.getState().coopShadows.find(x => x.id === s.id) ?? s;
            setShadowVictory(fresh);
            // 同步标记 localStorage，让 "非终结者自动弹" 那个 effect 不会重复弹
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(`velvet_coop_victory_shown_${s.id}`, '1');
            }
          }
          // 触发一次 loadSocial 把奖励从 settleFinishedShadows 流水出来
          void loadSocial({ force: true });
        }}
      />

      {/* 胜利 / 撤退结算屏 */}
      <CoopVictoryScreen
        isOpen={!!shadowVictory}
        shadow={shadowVictory}
        partnerName={shadowVictory
          ? (confidants.find(c => c.source === 'online'
              && c.linkedCloudUserId
              && (shadowVictory.userAId === c.linkedCloudUserId || shadowVictory.userBId === c.linkedCloudUserId))?.name ?? '同伴')
          : ''
        }
        selfPbId={cloudUser?.id as string | undefined}
        onClose={() => setShadowVictory(null)}
      />
    </motion.div>
  );
}

// ── 在线好友占位卡 ─────────────────────────────────────
// 已加好友但尚未建立 COOP 关系时，显示这张卡：昵称 / 头像 / LV + "已连接" 徽章
// 点击暂不触发动作（小名片 / COOP 流程在阶段 2-4 实现）

function OnlineFriendPlaceholderCard({
  profile,
  alreadyPrayed,
  waitingReciprocity,
  prayerPending,
  prayerError,
  onOpen,
  onQuickPray,
}: {
  profile: import('@/types').CloudProfile;
  alreadyPrayed: boolean;
  waitingReciprocity: boolean;
  prayerPending: boolean;
  prayerError: string | null;
  onOpen: () => void;
  onQuickPray: () => void;
}) {
  const name = profile.nickname || profile.userId || '未命名客人';
  const lv = profile.totalLv ?? 0;

  const handleCardClick = (e: React.MouseEvent) => {
    // 点到按钮的事件不让它冒泡，这里只响应卡片空白区域
    if ((e.target as HTMLElement).closest('[data-pray-button]')) return;
    onOpen();
  };

  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
      className="relative w-full text-left rounded-2xl overflow-hidden border border-emerald-300/50 bg-gradient-to-br from-emerald-500/8 to-indigo-500/5 hover:from-emerald-500/12 hover:to-indigo-500/8 transition-colors cursor-pointer"
      style={{ boxShadow: '0 8px 20px -14px rgba(16,185,129,0.45)' }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
      <div className="p-4 pl-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-emerald-500/20 text-emerald-600 font-black text-lg flex items-center justify-center flex-shrink-0">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={name} className="w-full h-full object-cover" draggable={false} />
            ) : (
              (name[0] || '?').toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 dark:text-white truncate">{name}</span>
              <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                ONLINE
              </span>
              {waitingReciprocity && (
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  待回应
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              @{profile.userId ?? '—'} · LV {lv}
            </div>
            <div className="text-[10px] text-gray-400 mt-1 leading-relaxed">
              {prayerError
                ? <span className="text-rose-500">{prayerError}</span>
                : alreadyPrayed
                  ? '今日已为 Ta 祈愿 · 点开查看详情'
                  : waitingReciprocity
                    ? 'Ta 今天为你祈愿了，回敬一下？'
                    : '点开看名片 · 或直接祈愿（双方各 +2 SP）'}
            </div>
          </div>

          {/* ✦ 祈愿快捷按钮 */}
          <PrayerQuickButton
            alreadyPrayed={alreadyPrayed}
            waitingReciprocity={waitingReciprocity}
            pending={prayerPending}
            onClick={onQuickPray}
          />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * 列表条目右侧的"圆角矩形 + 四角星"快捷祈愿按钮。
 *
 * 状态：
 *   - 默认：金色渐变，✦ 发光
 *   - 待回应（对方已祈愿）：更亮的橙金色边 + 轻微脉冲
 *   - 今日已祈愿：灰调 + ✓
 *   - 发送中：转圈星星
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
      className="relative flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl overflow-hidden disabled:cursor-default"
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
      {/* 待回应时柔和脉冲高光 */}
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
