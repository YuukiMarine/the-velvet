import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { PageTitle } from '@/components/PageTitle';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, P3PageHeader, SlantButton, slantClip } from '@/components/p3r/kit';
import { P5R, P5_FONT, P5Collage, P5SubBar, P5Star, P5Dots, P5Slab, P5RPage, P5StarFab } from '@/components/p5r/kit';
import { ConfidantCard } from '@/components/cooperation/ConfidantCard';
import { ConfidantAlbumWall } from '@/components/cooperation/ConfidantAlbumWall';
import { ConfidantCreateModal } from '@/components/cooperation/ConfidantCreateModal';
import { ConfidantDetailModal } from '@/components/cooperation/ConfidantDetailModal';
import { CounselChatModal } from '@/components/cooperation/CounselChatModal';
import { CounselArchiveModal } from '@/components/cooperation/CounselArchiveModal';
import { NotificationsPanel } from '@/components/cooperation/NotificationsPanel';
import { AddOnlineConfidantModal } from '@/components/cooperation/AddOnlineConfidantModal';
import { OnlineConfidantProfileCard } from '@/components/cooperation/OnlineConfidantProfileCard';
import { OnlineStarBadge } from '@/components/cooperation/OnlineStarBadge';
import type { FriendWallItem } from '@/components/cooperation/ConfidantAlbumWall';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { getAllOnlineCardFaces, setOnlineCardFace } from '@/services/onlineCardFace';
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
import { P4Sparkle } from '@/ui/p4Kit';

type Filter = 'all' | 'offline' | 'online' | 'archived';

export function Cooperation() {
  const isP4 = useUiChannel() === 'p4';
  const { confidants, counselArchives, getCounselCooldown, hasActiveCounsel, bumpConfidantIntimacy, battleState, saveBattleState, settings, updateSettings } = useAppStore();
  // P9 专辑墙：视图偏好持久记忆（PRD §5.3），默认墙
  const viewMode = settings.confidantViewMode ?? 'wall';
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
  // P3R（蓝频道）：p3-cooperation-reference-v2 形态
  const p3 = useUiChannel() === 'p3';
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  /**
   * ✧ 菜单触发按钮上的红点。两处修过（用户上报"有未读却不亮"）：
   *
   * ① 数的是 **importantUnreadCount** 而不是全量 unreadCount——
   *    祈愿是每天都来的日常问候，让它点亮红点等于红点常亮、红点失效。
   *    按设计口径：好友申请 / COOP / 羁绊之影 / 共享事件这些"关系相关"的才催人，祈愿不催。
   *
   * ② ack 记的是**当时的未读数**，不是一个布尔闩。
   *    旧写法是 `menuDotAck` 布尔 + "只有未读数比历史峰值更高才复燃"：
   *    有 3 条未读 → 打开菜单（ack=true，灭）→ 在别处读掉 1 条 → 未读变 2 →
   *    `2 > 3` 不成立 → **ack 永远不解除，剩下的 2 条再也点不亮**，除非涨过 3。
   *    现在只要"当前重要未读 ≠ 上次确认时的数"，红点就该亮。
   */
  const importantUnread = useCloudSocialStore(s => s.importantUnreadCount);
  const [ackedAt, setAckedAt] = useState<number | null>(null);
  const showMenuTriggerDot = importantUnread > 0 && ackedAt !== importantUnread;
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
  /** 未缔结好友的自裁卡面（db.onlineCardFaces，按对方云端 id 索引；本地专属不上云） */
  const [friendFaces, setFriendFaces] = useState<Record<string, string>>({});
  /** 正在裁切卡面的好友 + 已 fetch 成 File 的原图 */
  const [friendCrop, setFriendCrop] = useState<{ userId: string; name: string; file: File } | null>(null);
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

  /**
   * 逐个同伴算祈愿状态。专辑墙与列表两个视图**共用这一个**构造函数——
   * 以前这段逻辑内联在列表分支里，于是专辑墙（v2.5 起是默认视图）根本没有祈愿入口，
   * 用户要祈愿得先切到列表或点进详情页。返回 undefined = 不是在线同伴，不显示按钮。
   */
  const buildPrayer = (c: typeof confidants[number]) => {
    const isOnlineActive = c.source === 'online' && !c.archivedAt && !!c.linkedCloudUserId;
    if (!isOnlineActive) return undefined;
    const uid = c.linkedCloudUserId!;
    return {
      alreadyPrayed: hasPrayedToday(uid, todayPrayers),
      waitingReciprocity: hasBeenPrayedByToday(uid, todayPrayers) && !hasPrayedToday(uid, todayPrayers),
      pending: prayerInFlight === uid,
      onQuickPray: () => {
        const profile = c.linkedProfile;
        if (!profile) return;
        void executePrayer(profile);
      },
    };
  };

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

  // 自裁卡面表：进页面读一次；裁完由 setFriendFaces 就地更新，不必重读
  useEffect(() => {
    let cancelled = false;
    void getAllOnlineCardFaces().then(m => { if (!cancelled) setFriendFaces(m); });
    return () => { cancelled = true; };
  }, []);

  /**
   * 未缔结好友 → 牌阵条目（用户口径：占位卡横在墙上方太奇怪，让它们进牌阵）。
   * 只在**专辑墙**视图用；列表视图仍走上方的 OnlineFriendPlaceholderCard——
   * 列表本来就是一行行的，占位卡在那儿不违和。
   */
  const friendWallItems: FriendWallItem[] = useMemo(() => {
    if (!showOnlineFriends) return [];
    return onlineFriendCards.map(f => {
      const profile = f.otherProfile!;
      const prayed = hasPrayedToday(profile.id, todayPrayers);
      const beenPrayedBy = hasBeenPrayedByToday(profile.id, todayPrayers);
      return {
        kind: 'friend' as const,
        id: `friend-${f.id}`,
        profile,
        friendship: f,
        faceDataUrl: friendFaces[profile.id],
        prayer: {
          alreadyPrayed: prayed,
          waitingReciprocity: beenPrayedBy && !prayed,
          pending: prayerInFlight === profile.id,
          onPray: () => { void executePrayer(profile); },
        },
      };
    });
  }, [showOnlineFriends, onlineFriendCards, todayPrayers, friendFaces, prayerInFlight]);

  /**
   * 裁好友卡面 —— 与同伴卡面同一条路径（ConfidantDetailModal.openCardFaceCrop）：
   * 远端 URL 先 fetch 成 blob 再包 File，避免 <img src=远端URL> 污染 canvas 导致
   * toDataURL 抛异常；fetch 不因 4xx/5xx reject，必须自己查 res.ok。
   */
  const openFriendCrop = async (item: FriendWallItem) => {
    const src = item.faceDataUrl || item.profile.avatarUrl;
    const name = item.profile.nickname || item.profile.userId || '未命名客人';
    if (!src) {
      setPrayerError({ id: item.profile.id, message: '还没取到 Ta 的头像，稍后再试' });
      setTimeout(() => setPrayerError(null), 3000);
      void loadSocial({ force: true }).catch(() => { /* 静默 */ });
      return;
    }
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      setFriendCrop({ userId: item.profile.id, name, file: new File([blob], 'friend-face', { type: blob.type || 'image/jpeg' }) });
    } catch {
      setPrayerError({ id: item.profile.id, message: '取不到原图，换个网络再试' });
      setTimeout(() => setPrayerError(null), 3000);
    }
  };

  const p5 = useUiChannel() === 'p5';

  return (
    <P3RPage active={p3}>
    <P5RPage active={p5}>
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      // p5-onink：羁绊页的铭牌（称呼 / 牌名 / RANK）直接坐在纯黑舞台上，
      //   只有 .p5-reskin 时那套「灰系→黑」会把它们压成黑字隐形；
      // p4-onbright：同理，灰系小字压在纯黄舞台上对比度只有 1.9:1，翻成墨色浓淡
      className={`relative max-w-2xl mx-auto space-y-5 ${p5 ? 'p5-reskin p5-onink' : ''} ${isP4 ? 'p4-onbright' : ''}`}
    >
      {/* P5 页头装饰（沉底）：右上红斜块群 + 半调 */}
      {p5 && (
        <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-6 h-[190px]" style={{ zIndex: -1 }}>
          <P5Slab color={P5R.red} seed={231} rot={12} style={{ right: -60, top: -30, width: 250, height: 150 }} />
          <P5Slab color={P5R.redDeep} seed={232} rot={-8} style={{ left: -70, top: 50, width: 180, height: 120 }} />
          <P5Star size={22} fill={P5R.red} rot={14} className="absolute" style={{ right: 40, top: 110 }} />
          <P5Dots className="absolute" style={{ right: 0, top: 0, width: 90, height: 84 }} color="#000000" />
        </div>
      )}
      <div className="flex items-center gap-2">
        {p5 ? (
          /* P5UI/p5-cooperation：拼贴「羁绊」（羁=红底黑字/绊=纸底黑字）+ COOPERATION 黑条 */
          <div className="min-w-0 pt-1">
            <P5Collage
              size={40}
              tiles={[
                { ch: '羁', bg: P5R.red, fg: P5R.ink, scale: 1.05, rot: -3.5, dy: 0 },
                { ch: '绊', bg: P5R.paper, fg: P5R.ink, rot: 2.5, dy: 7 },
              ]}
            />
            <div className="mt-2 pl-8">
              <P5SubBar segs={[{ t: 'COOPERATION' }]} star={false} rot={-1.2} className="!px-2.5 !py-0.5" />
            </div>
          </div>
        ) : isP4 ? (
          /* p4-cooperation-reference-v2：衬线特大「同伴」+ COOPERATION FILE 眉标（FILE 橙染） */
          <div>
            <h1
              className="text-[50px] font-black leading-[1.02] tracking-tight text-[#131313]"
              style={{ fontFamily: 'var(--p4-display-font, serif)' }}
            >
              同伴
            </h1>
            <div className="mt-1 text-xs font-black tracking-[0.2em] text-[#131313]">
              COOPERATION <span className="text-[var(--p4-orange,#f9a11b)]">FILE</span>
            </div>
          </div>
        ) : p3 ? (
          <P3PageHeader ticks title="同伴" className="pt-1" />
        ) : (
          <PageTitle title="同伴" en="Cooperation" enOffset={{ right: -32 }} />
        )}
        <div className="ml-auto flex items-center gap-2">
          {p5 ? (
            /* P5UI/p5-cooperation：N / 22 黑底斜章 + 白星 */
            <span className="flex items-center gap-1.5 px-2.5 py-1" style={{ background: '#050505', clipPath: 'polygon(6px 0, 100% 2px, calc(100% - 5px) 100%, 0 calc(100% - 3px))', boxShadow: '0 0 0 2px #f0e9df' }} aria-label={`已缔结 ${activeCount} / ${MAJOR_ARCANA_IDS.length}`}>
              <span className="text-[14px] font-black leading-none tabular-nums text-white" style={{ fontFamily: P5_FONT }}>{activeCount} / {MAJOR_ARCANA_IDS.length}</span>
              <P5Star size={13} fill="#f8f8f6" />
            </span>
          ) : isP4 ? (
            <span className="text-[13px] font-black tracking-wider tabular-nums text-[#131313]">
              {activeCount} / {MAJOR_ARCANA_IDS.length}
            </span>
          ) : p3 ? (
            <span className="flex items-center gap-1" aria-label={`已缔结 ${activeCount} / ${MAJOR_ARCANA_IDS.length}`}>
              <span className="text-[20px] font-black italic leading-none tabular-nums" style={{ color: P3R.blue }}>{activeCount}</span>
              <span className="text-[13px] font-black" style={{ color: P3R.grey }}>/ {MAJOR_ARCANA_IDS.length}</span>
              <span aria-hidden className="ml-0.5 h-2.5 w-2.5" style={{ background: P3R.blue, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
            </span>
          ) : (
          <span className="text-[11px] tracking-wider text-gray-400 tabular-nums">
            {activeCount} / {MAJOR_ARCANA_IDS.length}
          </span>
          )}
          {/* ✧ 菜单按钮：关于系统 / 谏言 / 归档 */}
          <div className="relative" ref={menuAnchorRef}>
            <button
              onClick={() => {
                setMenuOpen(v => !v);
                // 仅在 "打开" 这个动作上熄灭红点；关闭操作不动 ack。
                // 记下"确认时的重要未读数"——之后这个数一变（涨或跌）红点都会重新亮。
                if (!menuOpen) setAckedAt(importantUnread);
              }}
              className={
                p5
                  ? 'relative flex h-9 w-9 items-center justify-center text-[15px] font-black'
                  : p3
                    ? 'relative flex h-8 w-9 items-center justify-center text-sm font-black transition-all'
                    : `relative w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        menuOpen
                          ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                          : 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 hover:bg-indigo-500/20'
                      }`}
              // P5：原来落在通用分支 = 半透明靛蓝圆 + 靛蓝字，压在黑舞台上几乎看不见。
              // 换成纸底 + 不规则黑描边（两层异形错位），✧ 用黑 / 打开时翻猩红。
              style={p5
                ? { color: menuOpen ? '#f0e9df' : '#050505' }
                : p3 ? { clipPath: slantClip(6), background: menuOpen ? P3R.blue : P3R.cyanPale, color: menuOpen ? '#fff' : P3R.blueDeep } : undefined}
              aria-label={showMenuTriggerDot ? `同伴系统菜单（${unreadCount} 条新通知）` : '同伴系统菜单'}
            >
              {p5 && (
                <span aria-hidden className="pointer-events-none absolute inset-0">
                  <span className="absolute inset-0" style={{ transform: 'translate(2.5px,3px)', background: '#050505', clipPath: 'polygon(2px 1px, calc(100% - 1px) 3px, calc(100% - 3px) calc(100% - 1px), 1px calc(100% - 3px))' }} />
                  <span className="absolute inset-0" style={{ background: '#050505', clipPath: 'polygon(1.5px 2.5px, calc(100% - 2px) 0.5px, calc(100% - 0.5px) calc(100% - 2.5px), 0.5px calc(100% - 1px))' }} />
                  <span className="absolute inset-[2.5px]" style={{ background: menuOpen ? '#c00008' : '#f0e9df', clipPath: 'polygon(1px 0.5px, calc(100% - 0.5px) 1.5px, calc(100% - 1.5px) calc(100% - 0.5px), 0.5px calc(100% - 1.5px))' }} />
                </span>
              )}
              <span className="relative">✧</span>
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
                  className={`absolute right-0 top-10 z-30 w-56 rounded-2xl overflow-hidden shadow-2xl border bg-white/95 dark:bg-gray-800/95 border-slate-400/35 dark:border-white/10${p5 ? ' p5-onpaper' : ''}`}
                  style={{
                    backdropFilter: 'blur(18px)',
                    WebkitBackdropFilter: 'blur(18px)',
                  }}
                >
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setInfoOpen(v => !v);
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <span className="text-base">✦</span>
                    <div className="flex-1">
                      <div>关于同伴系统</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">展开 / 收起简介</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setCounselOpen(true);
                    }}
                    disabled={!counselAvailable}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 transition-colors flex items-center gap-2 border-t border-black/5 dark:border-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <span className="text-base">✧</span>
                    <div className="flex-1">
                      <div>谏言</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">
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
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-2 border-t border-black/5 dark:border-white/10"
                  >
                    <span className="text-base">🗂</span>
                    <div className="flex-1">
                      <div>谏言归档库</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">
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
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-gray-800 dark:text-gray-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-2 border-t border-black/5 dark:border-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
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
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">
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

      {/* P3R：LINK 巨幽灵字（标题下横贯，设计稿主视觉） */}
      {p3 && (
        <div aria-hidden className="relative h-7">
          <GhostWords words={['LINK']} className="left-[6px] top-[-34px] text-[92px]" />
        </div>
      )}

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

      {/* 过滤 Tabs + 视图切换（P9：专辑墙 ⇄ 列表，右上角、持久记忆）。
          P4：激活项 = 蓝色花形 blob（白星闪），其余为黑粗文字；
          p3（设计稿）：选中 = 蓝斜块白字 + 洋红角；未选 = 黑字 + 底部小青杠 */}
      <div className="flex items-center gap-2">
        {p3 ? (
          <div className="flex flex-1 items-center gap-1">
            {([
              { id: 'all', label: '全部' },
              { id: 'offline', label: '离线' },
              { id: 'online', label: '在线' },
              { id: 'archived', label: '归档' },
            ] as const).map(t => {
              const active = filter === t.id;
              return active ? (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className="relative flex-1 py-2 text-[15px] font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                  style={{ clipPath: slantClip(10), background: P3R.blue }}
                >
                  {t.label}
                  <span aria-hidden className="absolute bottom-0 right-2.5 h-[7px] w-[16px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                </button>
              ) : (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className="flex flex-1 flex-col items-center gap-1 py-1.5 text-[15px] font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                  style={{ color: P3R.ink }}
                >
                  {t.label}
                  <span aria-hidden className="h-[3px] w-5" style={{ background: 'rgba(53,209,232,0.65)', transform: 'skewX(-24deg)' }} />
                </button>
              );
            })}
          </div>
        ) : (
        <div
          className={`grid flex-1 grid-cols-4 gap-1 text-xs font-bold ${
            isP4 ? '' : 'p-1 rounded-2xl bg-black/5 dark:bg-white/5'
          }`}
        >
          {([
            { id: 'all', label: '全部' },
            { id: 'offline', label: '离线' },
            { id: 'online', label: '在线' },
            { id: 'archived', label: '归档' },
          ] as const).map(t => {
            const active = filter === t.id;
            if (p5) {
              // P5UI/p5-cooperation：选中 = 猩红不规则块白字，未选中 = 黑底纸描边块
              return (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={`relative mx-0.5 cursor-pointer py-2 text-[13px] font-black transition-colors ${active ? 'text-white' : 'text-[#d9d3c7]'}`}
                >
                  <span aria-hidden className="absolute inset-0" style={{ background: '#f0e9df', clipPath: `polygon(${3 + (t.id.length % 3)}px 1px, calc(100% - 1px) 3px, calc(100% - 4px) calc(100% - 1px), 1px calc(100% - 3px))` }} />
                  <span aria-hidden className="absolute inset-[2px]" style={{ background: active ? '#c00008' : '#050505', clipPath: `polygon(2px 1px, calc(100% - 1px) 2px, calc(100% - 3px) calc(100% - 1px), 1px calc(100% - 2px))` }} />
                  <span className="relative">{t.label}</span>
                </button>
              );
            }
            if (isP4) {
              return (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={`relative py-2.5 text-[13px] font-black transition-all ${active ? 'text-[#131313]' : 'text-[#131313]/70'}`}
                >
                  {active && (
                    <>
                      <span
                        aria-hidden
                        className="absolute inset-x-1 inset-y-0 -z-10"
                        style={{ background: 'var(--ui-accent)', borderRadius: '62% 38% 55% 45% / 48% 62% 38% 52%', transform: 'rotate(-3deg)' }}
                      />
                      <P4Sparkle size={12} color="#ffffff" className="absolute left-1 top-0.5" />
                    </>
                  )}
                  {t.label}
                </button>
              );
            }
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
        )}
        <button
          type="button"
          onClick={() => void updateSettings({ confidantViewMode: viewMode === 'wall' ? 'list' : 'wall' })}
          aria-label={viewMode === 'wall' ? '切换到列表视图' : '切换到专辑墙视图'}
          title={viewMode === 'wall' ? '列表视图' : '专辑墙视图'}
          className={p3 ? 'shrink-0 p-2.5 text-base leading-none' : 'shrink-0 rounded-xl bg-black/5 dark:bg-white/5 p-2.5 text-base leading-none text-gray-500 dark:text-gray-400'}
          style={p3 ? { clipPath: slantClip(8), background: P3R.panel, color: P3R.blueDeep, boxShadow: '0 6px 14px rgba(38,96,140,0.08)' } : undefined}
        >
          {viewMode === 'wall' ? '☰' : '🃏'}
        </button>
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
            {isP4 ? (
              <P4Sparkle size={44} color="var(--ui-paper)" className="mx-auto mb-3" />
            ) : (
              <div className="text-5xl mb-3 opacity-40">✧</div>
            )}
            <p className={`text-sm ${isP4 ? 'font-black text-[#131313]' : 'text-gray-500 dark:text-gray-400'}`}>
              {filter === 'archived' ? '暂无归档的同伴' : '尚未与任何同伴建立羁绊'}
            </p>
            {filter !== 'archived' && (
              p3 ? (
                <SlantButton tone="primary" onClick={() => setCreateOpen(true)} className="mt-4">邀请第一位同伴</SlantButton>
              ) : (
              <button
                onClick={() => setCreateOpen(true)}
                className={
                  isP4
                    ? 'mt-4 px-6 py-2.5 text-sm font-black text-white'
                    : p5
                      ? 'relative mt-4 cursor-pointer px-6 py-2.5 text-sm font-black text-white'
                      : 'mt-4 px-5 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-sm font-bold shadow-lg shadow-purple-500/20'
                }
                style={isP4
                  ? { background: 'var(--ui-accent)', borderRadius: 16, transform: 'skewX(-6deg)', boxShadow: '0 3px 0 rgba(19,19,19,0.25)' }
                  : p5
                    ? { background: '#c00008', clipPath: 'polygon(5px 2px, calc(100% - 2px) 5px, calc(100% - 5px) calc(100% - 2px), 2px calc(100% - 5px))', boxShadow: '0 0 0 2.5px #f0e9df, 4px 4px 0 #000000', transform: 'rotate(-1deg)' }
                    : undefined}
              >
                <span style={isP4 ? { display: 'inline-block', transform: 'skewX(6deg)' } : undefined}>邀请第一位同伴</span>
              </button>
              )
            )}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            layout
            className="space-y-3"
          >
            {/* 顶部：在线好友占位卡（已 linked 但未建 COOP）。
                **仅列表视图**——专辑墙下它们已经作为好友牌进了牌阵，
                再在墙上方横一排就是用户说的「很奇怪」。 */}
            {showOnlineFriends && viewMode !== 'wall' && onlineFriendCards.map(f => {
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
            {/* 常规同伴：专辑墙（默认）/ 列表（P9 §5.3；快捷祈祷等在线操作走列表或详情页） */}
            {viewMode === 'wall' ? (
              <ConfidantAlbumWall
                confidants={visible}
                onOpenDetail={(id) => setDetailId(id)}
                onCreate={() => setCreateOpen(true)}
                canCreate={remaining > 0 && filter !== 'archived'}
                prayerFor={(c) => {
                  const p = buildPrayer(c);
                  return p ? { ...p, onPray: p.onQuickPray } : undefined;
                }}
                friends={friendWallItems}
                onOpenFriend={(f) => setProfileCard({ profile: f.profile, friendship: f.friendship })}
                onCropFriend={(f) => void openFriendCrop(f)}
              />
            ) : (
            visible.map(c => {
              const prayer = buildPrayer(c);
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
            })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* P3R：ARCANA 幽灵字 —— 改成右缘顺时针 90° 的竖排大字。
          原来用 GhostWords 横排铺在卡墙下方，它自带随滚动的视差位移，
          结果就是"跟着正文上下抖"（用户上报）；这里换成固定在页面右缘的
          旋转大字，脱离滚动联动，也不再和卡墙抢横向空间。
          锚点是一个零尺寸的定位点，字以 left/top 为轴转 90°：
          局部 +x（右）→ 屏幕下，局部 +y（下）→ 屏幕左，所以字从锚点向下排、
          字身向左展开，正好贴着右边缘。 */}
      {p3 && (
        <div aria-hidden className="pointer-events-none absolute right-[-6px] top-[430px] z-0 h-0 w-0 select-none">
          <span
            className="absolute left-0 top-0 whitespace-nowrap font-black italic leading-none tracking-tight"
            style={{
              fontFamily: 'Arial, "Noto Sans SC", sans-serif',
              fontSize: 74,
              color: 'rgba(147,190,222,0.30)',
              transformOrigin: 'left top',
              transform: 'rotate(90deg)',
            }}
          >
            ARCANA
          </span>
        </div>
      )}

      {/* 浮动新增按钮（P4 = 蓝色四角星 FAB / p3 = 右下大青斜块 +，与行动页同制式） */}
      {remaining > 0 && filter !== 'archived' && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setCreateOpen(true)}
          className={`fixed bottom-24 md:bottom-8 right-5 md:right-8 z-40 flex items-center justify-center text-white ${
            isP4
              ? 'h-16 w-16 text-2xl font-bold'
              : p5
                ? 'h-16 w-16 text-3xl font-black leading-none'
              : p3
                ? 'h-14 w-[76px] text-3xl font-black'
                : 'w-14 h-14 rounded-full text-2xl font-bold shadow-2xl'
          }`}
          style={
            isP4
              ? undefined
              : p5
                ? undefined
              : p3
                ? {
                    clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
                    background: 'linear-gradient(135deg, #35d1e8, #7fd8ee)',
                    boxShadow: '0 12px 30px rgba(53,209,232,0.45)',
                  }
                : {
                    background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb)), rgb(var(--color-bond-bright-rgb)))',
                    boxShadow: '0 12px 36px -8px rgb(var(--color-bond-bright-rgb) / 0.5)',
                  }
          }
          aria-label="新增同伴"
        >
          {isP4 && (
            <P4Sparkle size={64} color="var(--ui-accent)" className="absolute inset-0" style={{ filter: 'drop-shadow(0 3px 0 rgba(19,19,19,0.3))' }} />
          )}
          {p5 && <P5StarFab seed={17} />}
          {p5 ? (
            // 与记录 / 任务两页的星形 FAB 用同一枚加号笔画，三处形制才真的统一
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="relative h-6 w-6" aria-hidden="true">
              <path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span className="relative">+</span>
          )}
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
      {/* 好友卡面裁切：与同伴卡面同一个 1:1.6 塔罗比例，落库到 db.onlineCardFaces
          （本地专属，不上云；缔结 COOP 时由 social.ts 搬进新同伴的 cardFaceDataUrl） */}
      <ImageCropDialog
        key="friend-crop"
        isOpen={!!friendCrop}
        file={friendCrop?.file ?? null}
        title={friendCrop ? `裁切 ${friendCrop.name} 的卡面` : '裁切卡面'}
        aspectRatio={1 / 1.6}
        onCancel={() => setFriendCrop(null)}
        onConfirm={async (dataUrl) => {
          const uid = friendCrop?.userId;
          setFriendCrop(null);
          if (!uid) return;
          await setOnlineCardFace(uid, dataUrl);
          setFriendFaces(prev => ({ ...prev, [uid]: dataUrl }));
        }}
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
    </P5RPage>
    </P3RPage>
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
              {/* 在线好友统一带四角星；今日祈愿没回应就闪（同列表 / 专辑墙口径） */}
              <OnlineStarBadge glow={waitingReciprocity && !alreadyPrayed} />
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
