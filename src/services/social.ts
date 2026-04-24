/**
 * 在线社交协调层 —— 把 friends / notifications 两边拉下来的数据
 * 塞进 `useCloudSocialStore`，并处理"已 linked 好友"的本地 Confidant 快照更新。
 *
 * 调用时机：
 *  - 登录成功后（App.tsx authListener 触发）
 *  - 切回前台时（App.tsx visibilitychange，≥ 60s 才刷一次，避免频繁打扰）
 *  - 用户手动"刷新"时
 */

import { pb, getUserId } from './pocketbase';
import { listFriendships, expireOutdatedPending } from './friends';
import { listNotifications, markNotificationRead } from './notifications';
import { listTodayPrayers } from './prayers';
import { listCoopBonds, expireOutdatedCoopPending, viewFromMySide, resolveCoopInitialIntimacy } from './coopBonds';
import {
  listCoopShadows,
  maybeSpawnForBonds,
  retreatExpiredShadow,
} from './coopShadows';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { useAppStore } from '@/store';
import { interpretLockedArcana, type ConfidantMatchResult } from '@/utils/confidantAI';
import type { CoopBond, CoopShadow, Friendship, NotificationEntry } from '@/types';

/** 每条 prayer_received 通知带来的 SP 奖励 */
const PRAYER_SP_GRANT = 2;
/** 互祈反射额外 +1 SP */
const RECIPROCAL_REFLECTION_SP = 1;

/** 最短拉取间隔：避免切前台 / 登录订阅等多处触发时短时间重复请求 */
const MIN_REFRESH_INTERVAL_MS = 30 * 1000;

export const loadSocial = async (options: { force?: boolean } = {}): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;

  const store = useCloudSocialStore.getState();
  if (!options.force && store.lastLoadedAt) {
    const diff = Date.now() - store.lastLoadedAt.getTime();
    if (diff < MIN_REFRESH_INTERVAL_MS) return;
  }

  store.setLoading(true);
  store.setLastError(null);
  try {
    const [friendships, notifications, todayPrayers, coopBonds, coopShadows] = await Promise.all([
      listFriendships(),
      listNotifications(),
      listTodayPrayers(),
      listCoopBonds(),
      listCoopShadows(),
    ]);
    store.setFriendships(friendships);
    store.setNotifications(notifications);
    store.setTodayPrayers(todayPrayers);
    store.setCoopBonds(coopBonds);
    store.setCoopShadows(coopShadows);
    store.markLoaded();

    // 异步兜底（不阻塞主流程）：把超过 21 天的 pending 置 expired
    void expireOutdatedPending(friendships).catch(err => {
      console.warn('[velvet-social] expireOutdatedPending failed', err);
    });

    // 同步"在线好友 profile 快照"到 Confidant.linkedProfile（如果对应记录已存在）
    void syncLinkedProfiles(friendships).catch(err => {
      console.warn('[velvet-social] syncLinkedProfiles failed', err);
    });

    // 自动消费 prayer_received / prayer_reciprocal 通知：+SP 到本地 battleState，标记已读
    void consumePrayerNotifications(notifications).catch(err => {
      console.warn('[velvet-social] consumePrayerNotifications failed', err);
    });

    // COOP 契约过期兜底
    void expireOutdatedCoopPending(coopBonds).catch(err => {
      console.warn('[velvet-social] expireOutdatedCoopPending failed', err);
    });

    // 顺序：先把 linked 的物化 + severed 的归档，再消费 coop_event_logged，
    // 让事件能找到对应的本地 confidant。
    // **必须 await** —— 之前用 `void (async ...)()` fire-and-forget，
    // 一旦此刻外部刚好触发 pullAll（`db.confidants.clear()` + `bulkAdd`），
    // 刚 materialize 出的在线卡会被抹掉（还没来得及 push 到云），
    // 下一轮 loadSocial 会以新 uuid 重建 —— 历史断裂、bondSeverDismissed / linkedProfile 都丢。
    try {
      await materializeCoopBonds(coopBonds);
      await reflectSeveredBonds(coopBonds);
      await consumeCoopEventNotifications(notifications);
      // 羁绊之影：先过期撤退 → 再尝试降临 → 最后做奖励结算
      await retireExpiredShadows(coopShadows);
      await spawnShadowsIfDue(coopBonds);
      await settleFinishedShadows();
    } catch (err) {
      console.warn('[velvet-social] coop pipeline failed', err);
    }
  } catch (err) {
    console.error('[velvet-social] load failed:', err);
    store.setLastError(err instanceof Error ? err.message : '拉取失败');
  } finally {
    store.setLoading(false);
  }
};

/**
 * 对已经通过 COOP 建立了 Confidant（source='online'）的好友，
 * 用最新的 profile 刷新本地 `linkedProfile` 快照。
 *
 * 阶段 0+1：好友列表里"未建 COOP 的 linked 好友"在 Cooperation 页另行渲染，
 * 不在这里物化成 Confidant —— 等到阶段 4（COOP）再做。
 */
const syncLinkedProfiles = async (friendships: Friendship[]): Promise<void> => {
  const me = getUserId();
  if (!me) return;

  const appStore = useAppStore.getState();
  for (const f of friendships) {
    if (f.status !== 'linked') continue;
    const other = f.otherProfile;
    if (!other) continue;

    const existing = appStore.confidants.find(
      c => c.source === 'online' && c.linkedCloudUserId === other.id,
    );
    if (!existing) continue;

    // 浅比较关键字段，相同就跳过，避免无谓写库 / re-render
    const snapshot = existing.linkedProfile;
    const newName = other.nickname || other.userId || '未命名客人';
    const profileSame = snapshot
      && snapshot.id === other.id
      && snapshot.nickname === other.nickname
      && snapshot.totalLv === other.totalLv
      && snapshot.avatarUrl === other.avatarUrl;
    const nameSame = existing.name === newName;
    if (profileSame && nameSame) continue;

    try {
      await appStore.updateConfidant(existing.id, {
        linkedProfile: other,
        // 卡面"名字"跟随对方 nickname；用户长按可以再去定制（如有需要后续做覆盖字段）
        name: newName,
        // linkedEmail 不再写入 —— email 已从 CloudProfile 移除（PII）。
        // 保留字段以兼容旧本地数据，但一律清空。
        linkedEmail: undefined,
      });
    } catch (err) {
      console.warn('[velvet-social] update linkedProfile failed', existing.id, err);
    }
  }
};

/**
 * 遍历 linked 状态的 COOP 契约，在本地建立 Confidant(source='online')。
 *
 * 每一方独立在 bond 里存自己选的 arcana（arcana_a_id / arcana_b_id）。
 * 本地视角：iAmA → 读 arcana_a_id；否则读 arcana_b_id。
 *
 * 跳过情况：
 *   - 本地已有同 linkedCloudUserId 的在线同伴 → 让 syncLinkedProfiles 负责刷新
 *   - 本机上这张塔罗已被其他活跃同伴占用 → 控制台警告，不创建（用户自行归档冲突方后下次自动补齐）
 *   - arcanaId 为空（对方还没挑）→ 略过
 */
const materializeCoopBonds = async (bonds: CoopBond[]): Promise<void> => {
  const me = getUserId();
  if (!me) return;

  // 先确保本地同伴快照是最新的，避免 race 导致已存在但 store 还没看到 → 重复创建
  await useAppStore.getState().loadConfidants();
  const appStore = useAppStore.getState();
  const socialStore = useCloudSocialStore.getState();

  // 每轮物化前清空上次的 blockers —— 如果冲突仍在，下面会重新加回去
  const blockers: import('@/store/cloudSocial').MaterializeBlocker[] = [];

  for (const bond of bonds) {
    if (bond.status !== 'linked') continue;
    const view = viewFromMySide(bond, me);
    if (!view.myArcanaId) continue;

    const other = bond.otherProfile;
    if (!other) continue;

    // 含归档：只要本机存在 link 到这位云端用户的同伴卡（即便已归档），就不再物化
    // —— 防止"删除/归档后又被自动重新建出来"的鬼打墙
    const existing = appStore.confidants.find(
      c => c.source === 'online' && c.linkedCloudUserId === other.id,
    );
    if (existing) {
      // bond 回到 linked 状态，bondSeverDismissed 的使命已经完成 —— 清掉它，
      // 否则下轮 sever 来时 reflectSeveredBonds 永远不会自动归档（粘滞 flag bug）。
      if (existing.bondSeverDismissed) {
        try {
          await appStore.updateConfidant(existing.id, { bondSeverDismissed: undefined });
        } catch (err) {
          console.warn('[velvet-social] clear bondSeverDismissed on relink failed', existing.id, err);
        }
      }
      continue;
    }

    // 本机塔罗冲突 → 警告并登记到 blockers，让 UI 能提示"先归档冲突的同伴再刷新"
    const conflict = appStore.confidants.some(
      c => !c.archivedAt && c.arcanaId === view.myArcanaId,
    );
    if (conflict) {
      console.warn('[velvet-social] materialize skipped (arcana taken locally):', view.myArcanaId);
      blockers.push({
        bondId: bond.id,
        arcanaId: view.myArcanaId,
        otherName: other.nickname || other.userId || '未命名客人',
      });
      continue;
    }

    // 合成一个 "假匹配结果" 复用 addConfidant 的写入路径
    const displayName = other.nickname || other.userId || '未命名客人';
    const initialLv = resolveCoopInitialIntimacy(bond);
    const skillAttr = view.mySkillAttribute;
    const orientation = view.myArcanaOrientation ?? 'upright';

    // 解读 / 未来 —— 默认走 AI 锁定塔罗解读；关掉 toggle 则用模板兜底
    const useAI = appStore.settings.coopUseAIInterpretation !== false;
    let interpretation = view.theirMessage
      ? `Ta 写给你：${view.theirMessage.slice(0, 140)}`
      : '契约已成 —— 两张塔罗在暗处互相照亮。';
    let advice = '下一次见面，记得为 Ta 做一件此前没做过的小事。';
    if (useAI) {
      try {
        const r = await interpretLockedArcana({
          settings: appStore.settings,
          name: displayName,
          arcanaId: view.myArcanaId,
          orientation,
          intimacy: initialLv,
          message: view.theirMessage || view.myMessage || '',
        });
        if (r.interpretation) interpretation = r.interpretation;
        if (r.advice) advice = r.advice;
      } catch (err) {
        console.warn('[velvet-social] interpretLockedArcana failed, fallback to template', err);
      }
    }

    const match: ConfidantMatchResult = {
      arcanaId: view.myArcanaId,
      orientation,
      initialIntimacy: initialLv,
      initialPoints: 0,
      interpretation,
      advice,
      source: useAI ? 'ai' : 'offline',
    };
    try {
      const created = await appStore.addConfidant({
        name: displayName,
        description: view.myMessage || '',
        match,
        source: 'online',
        linkedCloudUserId: other.id,
        // linkedEmail 不再写入 —— email 已从 CloudProfile 移除（PII）
        initialLevel: initialLv,
        skillAttribute: skillAttr,
      });
      // 写入 linkedProfile 快照（addConfidant 不接受该字段，用 updateConfidant 补一刀）
      await appStore.updateConfidant(created.id, { linkedProfile: other });
    } catch (err) {
      console.warn('[velvet-social] addConfidant from bond failed', err);
    }
  }

  // 一次性写回 store —— 即便本轮没有 blockers，也要清空上轮的残留
  socialStore.setMaterializeBlockers(blockers);
};

/**
 * 把 PB 端 status='severed' 的 bond 反射到本地 —— 自动归档对应的在线同伴卡。
 *
 * 触发场景：
 *   - 对方点了"解除 COOP" / 删除了在线同伴 → bond 被标 severed
 *   - 我这边自己解除 → severCoopBond 已经把 bond 改为 severed，本地卡也应同步归档
 *
 * 已经归档过的就不重复处理。
 */
const reflectSeveredBonds = async (bonds: CoopBond[]): Promise<void> => {
  const me = getUserId();
  if (!me) return;
  const appStore = useAppStore.getState();
  for (const bond of bonds) {
    if (bond.status !== 'severed') continue;
    const other = bond.otherProfile;
    if (!other) continue;
    const local = appStore.confidants.find(
      c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === other.id,
    );
    if (!local) continue;
    // 用户曾手动"知晓并恢复"过这次解除 → 不再自动归档（否则陷死循环）
    if (local.bondSeverDismissed) continue;
    try {
      await appStore.archiveConfidant(local.id);
    } catch (err) {
      console.warn('[velvet-social] auto-archive on severed bond failed', err);
    }
  }
};

/**
 * 处理未读的 COOP 事件广播 —— 对方在线 COOP 上记了一笔，
 * 这边本地以同样的 event_id 同步：
 *   - 找到对应的本地在线同伴
 *   - 若 confidantEvents 已经包含该 event_id → 直接 markRead 跳过
 *   - 否则 bumpConfidantIntimacy（用同一 eventId）让两侧 events / intimacy 收敛
 *
 * 兼容两种 type：
 *   - 'coop_event_logged'（新枚举，需要 PB 把它加进 select 选项）
 *   - 'event_logged' + payload.kind = 'coop_event'（现成枚举，落地不要 PB 改 schema）
 */
const consumeCoopEventNotifications = async (notifications: NotificationEntry[]): Promise<void> => {
  const unread = notifications.filter(n => {
    if (n.read) return false;
    if (n.type === 'coop_event_logged') return true;
    if (n.type === 'event_logged' && n.payload?.kind === 'coop_event') return true;
    return false;
  });
  if (unread.length === 0) return;

  const appStore = useAppStore.getState();
  const social = useCloudSocialStore.getState();

  for (const n of unread) {
    if (!n.fromId) continue;
    const eventId = n.payload?.event_id as string | undefined;
    if (!eventId) {
      console.warn('[velvet-social] coop_event_logged 通知缺 event_id，跳过', n.id);
      continue;
    }

    const localConfidant = appStore.confidants.find(
      c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === n.fromId,
    );
    if (!localConfidant) {
      // 同伴尚未物化（bond 还没 linked / 用户已删除），先放着不消费
      console.info('[velvet-social] coop_event_logged: 没找到本地在线同伴 (fromId=' + n.fromId + ')，等下次再试');
      continue;
    }

    // 已经存在同 id 的事件 → 不重复 bump
    const dup = appStore.confidantEvents.some(e => e.id === eventId);
    if (!dup) {
      const delta = typeof n.payload?.delta === 'number' ? (n.payload.delta as number) : 0;
      const date = (n.payload?.date as string | undefined) || undefined;
      try {
        await appStore.bumpConfidantIntimacy(
          localConfidant.id,
          delta,
          'conversation',
          (n.payload?.narrative as string | undefined) || undefined,
          {
            userInput: (n.payload?.user_input as string | undefined) || undefined,
            advice: (n.payload?.advice as string | undefined) || undefined,
            eventId,
            eventDate: date,
            lastInteractionDate: date,
          },
        );
      } catch (err) {
        console.warn('[velvet-social] apply coop event failed', err);
        continue; // 失败保留 unread 让下次再试
      }
    }

    // 标记已读
    try {
      await markNotificationRead(n.id);
      social.markNotificationRead(n.id);
    } catch (err) {
      console.warn('[velvet-social] markNotificationRead failed', n.id, err);
    }
  }
};

/**
 * 处理未读的祈愿类通知：
 *   - prayer_received   → +PRAYER_SP_GRANT (2) SP；本地若有 COOP 在线同伴 → intimacy +1
 *   - prayer_reciprocal → +RECIPROCAL_REFLECTION_SP (1) 反射 SP
 *
 * 必须有 battleState 才会兑换 SP；没有则保留通知，下次战场就绪后再消费。
 *
 * **at-most-once 保证**：先 markRead 成功，再给奖励。
 *   - 如果 markRead 抛错（网断 / PB 拒绝），这条通知本轮不处理；下次 loadSocial 会再来
 *   - 如果 markRead 成功但 saveBattleState 失败，这笔 SP 丢失 —— 可接受
 *     （vs 上一版设计：成功/失败都给 SP，markRead 失败后下一轮再给一遍）
 *
 * **intimacy 幂等**：用稳定 eventId = `prayer-<notification id>`；confidantEvents 已有同 id 就不再 bump。
 *   这样即便有极端竞态（loadSocial 并发 / markRead 已成功但本地尚未刷 notifications）也不会重复 +1。
 */
const consumePrayerNotifications = async (notifications: NotificationEntry[]): Promise<void> => {
  const unreadReceived = notifications.filter(n => n.type === 'prayer_received' && !n.read);
  const unreadReciprocal = notifications.filter(n => n.type === 'prayer_reciprocal' && !n.read);
  if (unreadReceived.length === 0 && unreadReciprocal.length === 0) return;

  const appStore = useAppStore.getState();
  const social = useCloudSocialStore.getState();
  const battleState = appStore.battleState;

  // 没有 battleState 则先不消费（等用户手动在通知面板收下 / 开启战场）
  // NOTE: 这同时也会把 intimacy 的 bump 一并延后；修 #18 时再拆开
  if (!battleState) return;

  // 第一步：逐条先试 markRead；成功的才纳入"可结算"集合
  const receivedMarked: NotificationEntry[] = [];
  const reciprocalMarked: NotificationEntry[] = [];
  for (const n of unreadReceived) {
    try {
      await markNotificationRead(n.id);
      social.markNotificationRead(n.id);
      receivedMarked.push(n);
    } catch (err) {
      console.warn('[velvet-social] prayer_received markRead failed, deferring', n.id, err);
    }
  }
  for (const n of unreadReciprocal) {
    try {
      await markNotificationRead(n.id);
      social.markNotificationRead(n.id);
      reciprocalMarked.push(n);
    } catch (err) {
      console.warn('[velvet-social] prayer_reciprocal markRead failed, deferring', n.id, err);
    }
  }

  // 第二步：SP 一次性结算
  const grant =
    PRAYER_SP_GRANT * receivedMarked.length
    + RECIPROCAL_REFLECTION_SP * reciprocalMarked.length;
  if (grant > 0) {
    try {
      await appStore.saveBattleState({
        ...battleState,
        sp: battleState.sp + grant,
        totalSpEarned: battleState.totalSpEarned + grant,
      });
    } catch (err) {
      console.warn('[velvet-social] award prayer SP failed', err);
      // 通知已标记已读，但 SP 写失败 —— 丢一次，不再补。可观察性交给日志。
    }
  }

  // 第三步：intimacy bump（带 eventId 幂等）
  for (const n of receivedMarked) {
    if (!n.fromId) continue;
    const match = appStore.confidants.find(
      c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === n.fromId,
    );
    if (!match) continue;
    const eventId = `prayer-${n.id}`;
    // 已经应用过这条祈愿的 intimacy → 跳过（极端竞态下的兜底）
    const dup = appStore.confidantEvents.some(e => e.id === eventId);
    if (dup) continue;
    try {
      await appStore.bumpConfidantIntimacy(
        match.id,
        1,
        'conversation',
        '收到 Ta 送来的祈愿',
        { eventId },
      );
    } catch (err) {
      console.warn('[velvet-social] bump intimacy on received prayer failed', err);
    }
  }
};

// ── 羁绊之影 pipeline ──────────────────────────────────────

/**
 * 把已过期但还在 `active` 的 shadow 翻成 `retreated`。
 * 双端同时跑没关系（PB 最后写入为准）。
 */
const retireExpiredShadows = async (shadows: CoopShadow[]): Promise<void> => {
  const now = Date.now();
  const socialStore = useCloudSocialStore.getState();
  for (const s of shadows) {
    if (s.status !== 'active') continue;
    if (s.expiresAt.getTime() > now) continue;
    try {
      const updated = await retreatExpiredShadow(s);
      socialStore.upsertCoopShadow(updated);
    } catch (err) {
      console.warn('[velvet-social] retreat expired shadow failed', s.id, err);
    }
  }
};

/**
 * 对 linked 的 bond 逐个判定是否满足降临条件。满足则 spawn 一只新 boss。
 * 通常只有新月 / 满月之夜才会真出来；测试期（COOP_SHADOW_ALWAYS_OPEN）立即上。
 */
const spawnShadowsIfDue = async (bonds: CoopBond[]): Promise<void> => {
  const appStore = useAppStore.getState();
  const socialStore = useCloudSocialStore.getState();
  // 我方属性 level 之和
  const mySumLevels = appStore.attributes.reduce((s, a) => s + (a.level ?? 1), 0);
  const existing = socialStore.coopShadows;
  const created = await maybeSpawnForBonds(bonds, existing, mySumLevels);
  for (const s of created) {
    socialStore.upsertCoopShadow(s);
  }
};

/**
 * 扫描所有 defeated / retreated shadow，看"本地是否已领取奖励"——
 * 以 Confidant.coopMemorials 里是否有该 shadow 的 stamp 作为标记。
 * 未领取 → 发奖励 + 记 stamp。
 *
 * 奖励策略（胜利）：
 *   - 属性：弱点属性 + min(REWARD_ATTR_CAP, base)  —— 目前 base 恒为 5，未来 scale
 *   - 亲密度：+REWARD_INTIMACY_CAP (4)
 *   - SP：+REWARD_SP_VICTORY (10)；若我是最后一击者额外 +REWARD_SP_FINISHER (2)
 *   - Memorial：追加到对应 Confidant.coopMemorials
 *
 * 奖励策略（撤退）：
 *   - 亲密度：+1（安慰）
 *   - SP：+REWARD_SP_RETREAT (3)
 *   - 不发属性、不写 memorial
 */
const settleFinishedShadows = async (): Promise<void> => {
  const me = getUserId();
  if (!me) return;
  const socialStore = useCloudSocialStore.getState();
  const appStore = useAppStore.getState();
  const shadows = socialStore.coopShadows;

  for (const s of shadows) {
    if (s.status === 'active') continue;
    // 找到本地对应的 online Confidant（按 bondId 对应的对方 userId）
    const partnerId = s.userAId === me ? s.userBId : s.userAId;
    const confidant = appStore.confidants.find(
      c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === partnerId,
    );
    if (!confidant) continue; // 对方同伴卡已归档或不存在 → 不奖励（避免给"不认识的人"塞奖）

    const alreadyClaimed = (confidant.coopMemorials ?? []).some(m => m.shadowId === s.shadowId && m.defeatedAt === (s.defeatedAt?.toISOString() ?? ''));
    if (s.status === 'defeated') {
      if (alreadyClaimed) continue;
      try {
        await claimVictoryReward(s, confidant);
      } catch (err) {
        console.warn('[velvet-social] claimVictoryReward failed', s.id, err);
      }
    } else if (s.status === 'retreated') {
      // 撤退用单独的 flag（放 lastInteractionDate 类似位置会太挤）——
      // 这里用"最近 N 秒内已领过"来粗略去重：同一 shadow 只要 Confidant.coopMemorials
      // 里有同 shadowId 的 "retreat" stamp 就跳过。
      const retreatClaimed = (confidant.coopMemorials ?? []).some(
        m => m.shadowId === `retreat-${s.id}`,
      );
      if (retreatClaimed) continue;
      try {
        await claimRetreatReward(s, confidant);
      } catch (err) {
        console.warn('[velvet-social] claimRetreatReward failed', s.id, err);
      }
    }
  }
};

async function claimVictoryReward(
  shadow: CoopShadow,
  confidant: import('@/types').Confidant,
): Promise<void> {
  const { REWARD_ATTR_CAP, REWARD_INTIMACY_CAP, REWARD_SP_VICTORY, REWARD_SP_FINISHER } =
    await import('./coopShadows');
  const { archetypeById } = await import('@/constants/coopShadowPool');
  const me = getUserId();
  if (!me) return;
  const appStore = useAppStore.getState();

  // 属性奖励：弱点属性 +min(REWARD_ATTR_CAP, base)。base 先恒定 5（= cap）
  const baseAttr = 5;
  const attrPoints = Math.min(REWARD_ATTR_CAP, baseAttr);

  // 我是否终结者：读 memorial_stamp 上的记录不够 —— 改用 coop_attacks 最后一条判断
  // 这里偷懒：只要 shadow.defeatedAt 存在且我是 resonance_by（最后出手的印记留在我手上）
  // 就算我终结。阶段 2 可以改成读 attacks 表判定。
  const isFinisher = shadow.resonanceBy === me;
  const spGain = REWARD_SP_VICTORY + (isFinisher ? REWARD_SP_FINISHER : 0);

  const archetype = archetypeById(shadow.shadowId);
  const shadowName = shadow.nameOverride || archetype?.names?.[0] || '羁绊之影';

  // 1) 加属性（走 addActivity 让记录进活动流）—— method 用 'battle'，走战斗向奖励路径
  try {
    await appStore.addActivity(
      `与 @${confidant.name} 一起击败了 ${shadowName}`,
      { [shadow.weaknessAttribute]: attrPoints },
      'battle',
      { important: true, date: new Date() },
    );
  } catch (err) {
    console.warn('[velvet-social] coop victory addActivity failed', err);
  }

  // 2) 亲密度 +4（带 eventId 幂等 —— 以 shadow.id 为锚）
  try {
    await appStore.bumpConfidantIntimacy(
      confidant.id,
      REWARD_INTIMACY_CAP,
      'conversation',
      `共同封印了 ${shadowName}`,
      { eventId: `coop-shadow-victory-${shadow.id}` },
    );
  } catch (err) {
    console.warn('[velvet-social] coop victory intimacy bump failed', err);
  }

  // 3) SP
  const battleState = appStore.battleState;
  if (battleState) {
    try {
      await appStore.saveBattleState({
        ...battleState,
        sp: battleState.sp + spGain,
        totalSpEarned: battleState.totalSpEarned + spGain,
      });
    } catch (err) {
      console.warn('[velvet-social] coop victory SP grant failed', err);
    }
  }

  // 4) Memorial stamp（追加到 Confidant.coopMemorials）
  // 拉一次 coop_attacks 聚合本地侧的贡献值 —— 避免硬编码 myDamage = hpMax
  let myDamage = 0;
  let totalDamage = shadow.hpMax;
  try {
    const { listAttacksFor } = await import('./coopShadows');
    const attacks = await listAttacksFor(shadow.id);
    const sum = attacks.reduce((acc, a) => acc + (a.damageFinal ?? 0), 0);
    myDamage = attacks
      .filter(a => a.attackerId === me)
      .reduce((acc, a) => acc + (a.damageFinal ?? 0), 0);
    // 若总伤 > hpMax（超伤最后一击等），以总和为准；若拉不到就用 hpMax 兜底
    totalDamage = sum > 0 ? sum : shadow.hpMax;
  } catch (err) {
    console.warn('[velvet-social] fetch attacks for memorial failed', err);
    // 兜底：我至少有参与 → 给一个保守的 50%
    myDamage = Math.round(shadow.hpMax / 2);
  }

  const stamp: import('@/types').CoopMemorialStamp = {
    ...(shadow.memorialStamp ?? {
      shadowId: shadow.shadowId,
      shadowName,
      weaknessAttribute: shadow.weaknessAttribute,
      defeatedAt: shadow.defeatedAt?.toISOString() ?? new Date().toISOString(),
      winners: [
        { userId: shadow.userAId, nickname: '' },
        { userId: shadow.userBId, nickname: '' },
      ],
    }),
    totalDamage,
    myDamage,
  };
  try {
    const current = confidant.coopMemorials ?? [];
    await appStore.updateConfidant(confidant.id, {
      coopMemorials: [...current, stamp],
    });
  } catch (err) {
    console.warn('[velvet-social] coop victory memorial persist failed', err);
  }
}

async function claimRetreatReward(
  shadow: CoopShadow,
  confidant: import('@/types').Confidant,
): Promise<void> {
  const { REWARD_SP_RETREAT } = await import('./coopShadows');
  const appStore = useAppStore.getState();

  // 1) 亲密度 +1（安慰）
  try {
    await appStore.bumpConfidantIntimacy(
      confidant.id,
      1,
      'conversation',
      '虽然这一次没能封印那只影，但我们一起面对过。',
      { eventId: `coop-shadow-retreat-${shadow.id}` },
    );
  } catch (err) {
    console.warn('[velvet-social] coop retreat intimacy bump failed', err);
  }

  // 2) SP
  const battleState = appStore.battleState;
  if (battleState) {
    try {
      await appStore.saveBattleState({
        ...battleState,
        sp: battleState.sp + REWARD_SP_RETREAT,
        totalSpEarned: battleState.totalSpEarned + REWARD_SP_RETREAT,
      });
    } catch (err) {
      console.warn('[velvet-social] coop retreat SP grant failed', err);
    }
  }

  // 3) 记 retreat stamp 去重（不走展示层）
  const retreatStamp: import('@/types').CoopMemorialStamp = {
    shadowId: `retreat-${shadow.id}`,
    shadowName: shadow.nameOverride || '（撤退）',
    weaknessAttribute: shadow.weaknessAttribute,
    defeatedAt: new Date().toISOString(),
    winners: [],
  };
  try {
    const current = confidant.coopMemorials ?? [];
    await appStore.updateConfidant(confidant.id, {
      coopMemorials: [...current, retreatStamp],
    });
  } catch (err) {
    console.warn('[velvet-social] coop retreat stamp persist failed', err);
  }
}

/** 清空内存态 —— 登出时调用 */
export const resetSocial = (): void => {
  useCloudSocialStore.getState().reset();
};
