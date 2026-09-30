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
  dedupeShadows,
  reconcileActiveShadow,
} from './coopShadows';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { useCloudStore } from '@/store/cloud';
import { useAppStore } from '@/store';
import { getOnlineCardFace, clearOnlineCardFace } from './onlineCardFace';
import { syncPacts } from './pactSync';
import { syncOrgs } from './orgSync';
import { interpretLockedArcana, type ConfidantMatchResult } from '@/utils/confidantAI';
import type { CoopBond, CoopShadow, Friendship, NotificationEntry } from '@/types';

/** 每条 prayer_received 通知带来的 SP 奖励 */
const PRAYER_SP_GRANT = 2;
/** 互祈反射额外 +1 SP */
const RECIPROCAL_REFLECTION_SP = 1;

/** 最短拉取间隔：避免切前台 / 登录订阅等多处触发时短时间重复请求 */
const MIN_REFRESH_INTERVAL_MS = 30 * 1000;

const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * 同一时间只跑一轮。以前各处（App 登录、同伴衰减维护、切前台、同伴页、各弹层）各发各的，
 * 冷启动时就有两轮并行——30 秒节流拦不住（lastLoadedAt 要等一轮跑完才记），
 * 整条流水线（降临 / 撤退 / 结算 / 约定对账）跟着跑两遍：同一个月夜降临两只影、
 * 撤退慰问的 SP 发两次（用户上报「SHADOW RETREATED 重复弹」的源头之一）。
 * 现在：正在跑时，普通调用搭这一轮；force 调用（刚改过数据、要新结果）排在这一轮之后
 * 再跑一轮，多个 force 合并成同一轮。
 */
let socialRun: Promise<void> | null = null;
let socialRerun: Promise<void> | null = null;

export const loadSocial = (options: { force?: boolean } = {}): Promise<void> => {
  if (!socialRun) {
    socialRun = loadSocialOnce(options).finally(() => { socialRun = null; });
    return socialRun;
  }
  if (!options.force) return socialRun;
  if (!socialRerun) {
    socialRerun = socialRun.catch(() => undefined).then(() => {
      socialRerun = null;
      return loadSocial({ force: true });
    });
  }
  return socialRerun;
};

const loadSocialOnce = async (options: { force?: boolean }): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;

  const store = useCloudSocialStore.getState();
  if (!options.force && store.lastLoadedAt) {
    const diff = Date.now() - store.lastLoadedAt.getTime();
    if (diff < MIN_REFRESH_INTERVAL_MS) return;
  }

  store.setLoading(true);
  store.setLastError(null);
  try {
    const [friendships, notifications, todayPrayers, coopBonds, rawShadows] = await Promise.all([
      listFriendships(),
      listNotifications(),
      listTodayPrayers(),
      listCoopBonds(),
      listCoopShadows(),
    ]);
    // 同一对、同一个月夜重复降临的影只认一只（其余不显示、不撤退、不结算、不弹屏）；
    // 进行中的按出手日志把血量算准：两端缓存互相覆盖时丢掉的那一下从日志补回来，算到归零就补记击败
    const coopShadows = await Promise.all(dedupeShadows(rawShadows).map(s => (s.status === 'active'
      ? reconcileActiveShadow(s).catch(err => { console.warn('[velvet-social] reconcile shadow failed', s.id, err); return s; })
      : Promise.resolve(s))));
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
      await consumePrayerNotifications(notifications);
      await reflectSeveredBonds(coopBonds);
      await consumeCoopEventNotifications(notifications);
      // 羁绊之影：先过期撤退 → 再尝试降临 → 最后做奖励结算
      await retireExpiredShadows(coopShadows);
      await spawnShadowsIfDue(coopBonds);
      await settleFinishedShadows();
    } catch (err) {
      console.warn('[velvet-social] coop pipeline failed', err);
    }
    // 一起进步：约定落到本机（建 / 收尾待办、补打卡、在线同伴发亲密度）。
    // 放在 COOP 物化之后：在线同伴卡要先建好，亲密度才找得到人
    try {
      await syncPacts(notifications);
    } catch (err) {
      console.warn('[velvet-social] pact sync failed', err);
    }
    // 组织（第 7 轮）：拉成员、校正位置、推成员牌；放在最后，失败不影响前面任何一步
    try {
      await syncOrgs();
    } catch (err) {
      console.warn('[velvet-social] org sync failed', err);
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
      && snapshot.avatarUrl === other.avatarUrl
      && sameJson(snapshot.attributeNames, other.attributeNames)
      && sameJson(snapshot.attributeLevels, other.attributeLevels)
      && sameJson(snapshot.attributeLevelTitles, other.attributeLevelTitles)
      && sameJson(snapshot.attributePoints, other.attributePoints)
      && snapshot.totalPoints === other.totalPoints
      && snapshot.unlockedCount === other.unlockedCount
      && sameJson(snapshot.status, other.status)
      && sameJson(snapshot.goal, other.goal);
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
 *   - 本机上这张塔罗已被**别人**占用 → 控制台警告，不创建（用户自行归档冲突方后下次自动补齐）
 *   - arcanaId 为空（对方还没挑）→ 略过
 *
 * ── 并发（用户上报：云同步时偶发误报「已缔结的好友塔罗被占用」）────────────
 * 本函数一跑就是几秒：每个新 bond 都要 await 一次 AI 解读。原来的写法在开头
 * 拿一次 `useAppStore.getState()` 当**整轮**的判据，而循环里的 addConfidant
 * 自己就在改这份状态，pullAll 又会在别的时间线上整表重写 confidants 并随后
 * 重载 store——判据早就过期了。过期的判据同时喂给「已存在吗」和「这张牌被占了吗」
 * 两个问题，就可能给出自相矛盾的答案：认不出这位好友已有的卡，却认得出那张卡
 * 占着牌 → 误报占用。
 *
 * 三道防线：
 *   ① 每个 bond 判定前**重新读一次** store，不用整轮快照；
 *   ② 占着这张牌的若正是这位好友自己的卡，就不是冲突（口径与 existing 对齐）；
 *   ③ 云同步在途时（pullAll 正在整表重写）算出来的结论一律不采信，保留上一轮的
 *      blockers，等同步落定后的下一轮再说。
 */
/** 防重入：两次 loadSocial 叠在一起时，第二次直接让路（否则会重复物化同一个 bond） */
let materializing = false;

const materializeCoopBonds = async (bonds: CoopBond[]): Promise<void> => {
  const me = getUserId();
  if (!me) return;
  if (materializing) {
    console.warn('[velvet-social] materializeCoopBonds 已在运行，本次跳过');
    return;
  }
  materializing = true;
  try {

  // 先确保本地同伴快照是最新的，避免 race 导致已存在但 store 还没看到 → 重复创建
  await useAppStore.getState().loadConfidants();
  const socialStore = useCloudSocialStore.getState();

  // 每轮物化前清空上次的 blockers —— 如果冲突仍在，下面会重新加回去
  const blockers: import('@/store/cloudSocial').MaterializeBlocker[] = [];

  for (const bond of bonds) {
    if (bond.status !== 'linked') continue;
    const view = viewFromMySide(bond, me);
    if (!view.myArcanaId) continue;

    const other = bond.otherProfile;
    if (!other) continue;

    // ① 每个 bond 现读现判：上一圈的 addConfidant 已经改过 store 了
    const appStore = useAppStore.getState();

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

    // ② 占着这张牌的是谁？是这位好友自己的卡就不算冲突——
    //    existing 认的是 linkedCloudUserId，这里也认它，两个判据口径必须一致
    const holder = appStore.confidants.find(
      c => !c.archivedAt && c.arcanaId === view.myArcanaId,
    );
    if (holder && holder.linkedCloudUserId !== other.id) {
      // 把占位者的身份一起打出来：再复现时能直接看出是谁占的、是不是又一次误报
      console.warn('[velvet-social] materialize skipped (arcana taken locally):', {
        arcanaId: view.myArcanaId,
        holderId: holder.id,
        holderName: holder.name,
        holderSource: holder.source,
        holderLinkedTo: holder.linkedCloudUserId ?? null,
        wantedBy: other.id,
      });
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
      // 写入 linkedProfile 快照（addConfidant 不接受该字段，用 updateConfidant 补一刀）。
      // 顺带把这位好友在「未缔结」阶段自己裁过的卡面搬过来——那张图是按云端 id 存的
      // （db.onlineCardFaces），缔结后本地有了 Confidant 行就该归它，否则用户裁过的图
      // 会在缔结那一刻凭空消失。搬完清掉原行，不留孤儿。
      const carried = await getOnlineCardFace(other.id);
      await appStore.updateConfidant(created.id, {
        linkedProfile: other,
        ...(carried ? { cardFaceDataUrl: carried, avatarAsCardFace: true } : {}),
      });
      if (carried) await clearOnlineCardFace(other.id);
    } catch (err) {
      console.warn('[velvet-social] addConfidant from bond failed', err);
    }
  }

  // ③ 云同步在途 = pullAll 可能正在整表重写 confidants（它写完才重载 store），
  //    这一轮的判据建立在半新半旧的视图上，不采信：保留上一轮的 blockers，
  //    等同步落定后的下一轮再算。宁可晚一轮提示，也不要弹一次假的。
  if (useCloudStore.getState().syncStatus === 'syncing') {
    if (blockers.length > 0) {
      console.warn('[velvet-social] 云同步在途，本轮塔罗占用判定不采信', blockers);
    }
    return;
  }
  // 一次性写回 store —— 即便本轮没有 blockers，也要清空上轮的残留
  socialStore.setMaterializeBlockers(blockers);

  } finally {
    materializing = false;
  }
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

  const social = useCloudSocialStore.getState();

  for (const n of unread) {
    if (!n.fromId) continue;
    const eventId = n.payload?.event_id as string | undefined;
    if (!eventId) {
      console.warn('[velvet-social] coop_event_logged 通知缺 event_id，跳过', n.id);
      continue;
    }

    const currentStore = useAppStore.getState();
    const localConfidant = currentStore.confidants.find(
      c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === n.fromId,
    );
    if (!localConfidant) {
      // 同伴尚未物化（bond 还没 linked / 用户已删除），先放着不消费
      console.info('[velvet-social] coop_event_logged: 没找到本地在线同伴 (fromId=' + n.fromId + ')，等下次再试');
      continue;
    }

    // 已经存在同 id 的事件 → 不重复 bump
    const dup = currentStore.confidantEvents.some(e => e.id === eventId);
    if (!dup) {
      const delta = typeof n.payload?.delta === 'number' ? (n.payload.delta as number) : 0;
      const date = (n.payload?.date as string | undefined) || undefined;
      try {
        await currentStore.bumpConfidantIntimacy(
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
 * 亲密度不依赖 battleState；SP 必须有 battleState 才会兑换。
 * 没有 battleState 时会先应用亲密度并保留通知，下次战场就绪后再消费 SP。
 *
 * **SP at-most-once 保证**：先 markRead 成功，再给 SP。
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

  const social = useCloudSocialStore.getState();
  const receivedReadyForSp: NotificationEntry[] = [];

  // 第一步：亲密度先独立结算，不再被 battleState 阻塞。
  // 通知暂时保持 unread；这样没有战斗状态时不会丢 SP，下一轮仍可继续结算。
  for (const n of unreadReceived) {
    const fromId = n.fromId;
    if (!fromId) {
      receivedReadyForSp.push(n);
      continue;
    }

    const freshStore = useAppStore.getState();
    const localConfidant = freshStore.confidants.find(
      c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === fromId,
    );
    const hasLinkedCoop = social.coopBonds.some(
      b => b.status === 'linked' && (b.userAId === fromId || b.userBId === fromId),
    );

    // 有 COOP 但本地同伴尚未物化时先不 markRead，避免这次 +1 被读掉后再也补不回来。
    if (!localConfidant) {
      if (hasLinkedCoop) continue;
      receivedReadyForSp.push(n);
      continue;
    }

    const eventId = `prayer-${n.id}`;
    const alreadyApplied = freshStore.confidantEvents.some(e => e.id === eventId);
    if (!alreadyApplied) {
      try {
        await freshStore.bumpConfidantIntimacy(
          localConfidant.id,
          1,
          'conversation',
          '收到 Ta 送来的祈愿',
          { eventId },
        );
      } catch (err) {
        console.warn('[velvet-social] bump intimacy on received prayer failed', err);
        continue;
      }
    }
    receivedReadyForSp.push(n);
  }

  const battleState = useAppStore.getState().battleState;
  if (!battleState) return;

  // 第二步：有 battleState 时再 markRead；成功的才纳入 SP 结算集合。
  const receivedMarked: NotificationEntry[] = [];
  const reciprocalMarked: NotificationEntry[] = [];
  for (const n of receivedReadyForSp) {
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

  // 第三步：SP 一次性结算
  const grant =
    PRAYER_SP_GRANT * receivedMarked.length
    + RECIPROCAL_REFLECTION_SP * reciprocalMarked.length;
  if (grant > 0) {
    try {
      await useAppStore.getState().saveBattleState({
        ...battleState,
        sp: battleState.sp + grant,
        totalSpEarned: battleState.totalSpEarned + grant,
      });
    } catch (err) {
      console.warn('[velvet-social] award prayer SP failed', err);
      // 通知已标记已读，但 SP 写失败 —— 丢一次，不再补。可观察性交给日志。
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
 * 只有新月 / 满月之夜才会真出来。
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
  const shadows = socialStore.coopShadows;

  for (const s of shadows) {
    if (s.status === 'active') continue;
    // 找到本地对应的 online Confidant（按 bondId 对应的对方 userId）。
    // ⚠️ 状态快照必须**每轮重取**：zustand 的 getState() 是一次性快照，此前在循环外
    // 取一次——同一位同伴名下有多只已结束的影时，第二轮拿到的还是第一轮 claim 之前
    // 的 confidant，其 coopMemorials 缺第一枚 stamp，追加时把它整个覆盖丢——下次
    // 同步/进页 settle 又认为第一只"没领过"，奖励重发、结算屏在新设备上重放
    //（用户上报「shadow retreated 弹窗重复弹出多次」的放大器之一）。
    const appStore = useAppStore.getState();
    const partnerId = s.userAId === me ? s.userBId : s.userAId;
    const confidant = appStore.confidants.find(
      c => c.source === 'online' && !c.archivedAt && c.linkedCloudUserId === partnerId,
    );
    if (!confidant) continue; // 对方同伴卡已归档或不存在 → 不奖励（避免给"不认识的人"塞奖）

    // 去重先看记录 id；老图章没有 recordId，再按「原型 + 击败时间」认
    const memorials = confidant.coopMemorials ?? [];
    const alreadyClaimed = memorials.some(m => m.recordId === s.id || (m.shadowId === s.shadowId && m.defeatedAt === (s.defeatedAt?.toISOString() ?? '')));
    if (s.status === 'defeated') {
      if (alreadyClaimed) continue;
      try {
        await claimVictoryReward(s, confidant);
      } catch (err) {
        console.warn('[velvet-social] claimVictoryReward failed', s.id, err);
      }
    } else if (s.status === 'retreated') {
      // 没识破 = 没参战：不发安慰奖励、不弹结算屏（用户拍板）。以前不看这个，一对好友谁都没管的影
      // 也每个月夜各弹一次「撤退」、各发一次奖
      if (!((s.userAId === me) ? s.identifiedByA : s.identifiedByB)) continue;
      const retreatClaimed = memorials.some(m => m.recordId === s.id || m.shadowId === `retreat-${s.id}`);
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
  const { listAttacksFor, bondStreak, coopVictoryReward } = await import('./coopShadows');
  const { archetypeById } = await import('@/constants/coopShadowPool');
  const me = getUserId();
  if (!me) return;
  const appStore = useAppStore.getState();

  const archetype = archetypeById(shadow.shadowId);
  const shadowName = shadow.nameOverride || archetype?.names?.[0] || '羁绊之影';

  // 0) 先算贡献和终结者：拉一次 coop_attacks（-created 排序，第一条是最后一击）
  let myDamage = 0;
  let totalDamage = shadow.hpMax;
  // 拉不到日志时：先信击杀时冻进图章的终结者，再退回共鸣印记（总攻击不写印记，老图章会认错）
  let isFinisher = shadow.memorialStamp?.finisherId ? shadow.memorialStamp.finisherId === me : shadow.resonanceBy === me;
  try {
    const attacks = await listAttacksFor(shadow.id);
    const sum = attacks.reduce((acc, a) => acc + (a.damageFinal ?? 0), 0);
    myDamage = attacks.filter(a => a.attackerId === me).reduce((acc, a) => acc + (a.damageFinal ?? 0), 0);
    totalDamage = sum > 0 ? sum : shadow.hpMax;
    if (attacks[0]) isFinisher = attacks[0].attackerId === me;
  } catch (err) {
    console.warn('[velvet-social] fetch attacks for memorial failed', err);
    myDamage = Math.round(shadow.hpMax / 2); // 兜底：至少参与了 → 给一个保守的 50%
  }

  // 第 6 轮 奖励成长：连胜（击杀时冻进图章；老图章没有就按本机的降临史现算）+ 羁绊等级 + 终结者
  const streak = shadow.memorialStamp?.streak ?? bondStreak(useCloudSocialStore.getState().coopShadows, shadow.bondId, shadow.id);
  const reward = coopVictoryReward({ streak, bondLevel: confidant.intimacy ?? 0, isFinisher });

  // 1) 先盖章（= 领奖标记），再发奖。反过来的话图章没写成会在下次同步再发一遍奖
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
    recordId: shadow.id,
    totalDamage,
    myDamage,
    streak: reward.streak,
    reward: { attr: reward.attr, intimacy: reward.intimacy, sp: reward.sp, streak: reward.streak, finisher: reward.isFinisher },
  };
  // 写前重读最新 coopMemorials：拿参数里的旧对象追加会把并发新增的 stamp 覆盖丢（见 settleFinishedShadows 注释）
  const fresh = useAppStore.getState().confidants.find(c => c.id === confidant.id);
  const current = fresh?.coopMemorials ?? confidant.coopMemorials ?? [];
  await appStore.updateConfidant(confidant.id, { coopMemorials: [...current, stamp] }); // 失败就抛：下次同步重来

  // 2) 属性：弱点属性 +min(REWARD_ATTR_CAP, base)。base 先恒定 5（= cap）；走 addActivity 让记录进活动流
  const attrPoints = reward.attr;
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

  // 3) 亲密度 +4（带 eventId 幂等 —— 以 shadow.id 为锚）
  try {
    await appStore.bumpConfidantIntimacy(
      confidant.id,
      reward.intimacy,
      'conversation',
      reward.streak >= 2 ? `共同封印了 ${shadowName}（连胜 ×${reward.streak}）` : `共同封印了 ${shadowName}`,
      { eventId: `coop-shadow-victory-${shadow.id}` },
    );
  } catch (err) {
    console.warn('[velvet-social] coop victory intimacy bump failed', err);
  }

  // 4) SP。battleState 要读最新的：上面 addActivity 已经按记录发过 SP，拿函数开头的快照写回会把那份吞掉
  const spGain = reward.sp;
  const battleState = useAppStore.getState().battleState;
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
}

async function claimRetreatReward(
  shadow: CoopShadow,
  confidant: import('@/types').Confidant,
): Promise<void> {
  const { REWARD_SP_RETREAT } = await import('./coopShadows');
  const appStore = useAppStore.getState();

  // 0) 先盖章（领奖标记；不走展示层），再发奖
  const retreatStamp: import('@/types').CoopMemorialStamp = {
    shadowId: `retreat-${shadow.id}`,
    recordId: shadow.id,
    shadowName: shadow.nameOverride || '（撤退）',
    weaknessAttribute: shadow.weaknessAttribute,
    defeatedAt: new Date().toISOString(),
    winners: [],
  };
  const fresh = useAppStore.getState().confidants.find(c => c.id === confidant.id);
  const current = fresh?.coopMemorials ?? confidant.coopMemorials ?? [];
  await appStore.updateConfidant(confidant.id, { coopMemorials: [...current, retreatStamp] });

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

  // 2) SP（读最新的 battleState）
  const battleState = useAppStore.getState().battleState;
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
}

/** 清空内存态 —— 登出时调用 */
export const resetSocial = (): void => {
  useCloudSocialStore.getState().reset();
};
