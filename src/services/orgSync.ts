/**
 * orgSync —— 组织（v2.7.0.6 第 7 轮 · PRD §12）的本机对账，挂在 loadSocial 的 syncPacts 之后。
 *   · 拉我的成员行 → 组织 → 全体成员，放进 cloudSocial.orgs；
 *   · 校正自己的位置字段：是队长的那一行该是「自建」、其余是「加入」（转让之后的最后一步在这里补上）；
 *   · 代表牌撞了、而我是后选的那位 → 清掉我的牌，等我重选；
 *   · 推自己的成员牌（连续天数 / 本周出勤 / 名片状态 / 展示的面具），指纹没变就不推；
 *   · 发现自己不在某个组织了（被请离 / 解散 / 在别的设备退出）→ 本机提示一次。
 *   · 7b：拉最近 30 天的公告板（动态 + 标签）；上一场会议结束了还没有纪要 → 用确定 id 补发一份。
 *   · 第 8 轮：拉作战 + 打卡 + 经验流水，作战待办 / 达成卡 / 奖励交给 orgOpsSync.reconcileOps。
 * 另有：记完一条记录 5 秒后顺手推一次成员牌；界面动作的包装（做完就写回 store）；本机屏蔽名单、隐藏的动态、
 * 公告板「看到哪儿了」；守则同意记录。离线或服务器报错时一律不动本地。
 */
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { getUserId } from './pocketbase';
import { computeTotalLv } from '@/utils/lvTiers';
import { masteryOf } from '@/utils/levels';
import { resolveLevelDifficulty } from '@/utils/levelDifficulty';
import { getAttributeLevelTitle, getMasteryTitle } from '@/utils/attributeLevelTitles';
import {
  createOrg, joinOrg, previewOrg, updateOrgProfile, rotateInviteCode, updateMyMember, setMySlot,
  leaveOrg, kickMember, transferLeader, dissolveOrg, listMyMemberships, listOrgMembers, fetchOrg, safeNickname,
  listOrgBoard, createMoment, setReaction, deletePost, reportPost, createMinutes, saveMeeting, deleteUserContent,
  OrgError, type OrgDraft, type OrgReportReason,
} from './orgs';
import {
  ORG_CODENAME_MAX, ORG_POSTS_PER_DAY, buildMemberCard, buildPostSnapshot, bySeat, canShareActivity, cardFingerprint, computeMinutes,
  displayCodename, hadGoalFor, meetingState, myPostsToday, nextWeekKey, personaSnapshot, shiftDayKey, shownPersonas, tarotCardOf,
  tarotConflictLosers, zonedDay, ORG_MAX_SHOWN_MASKS,
} from '@/utils/orgLogic';
import { archiveOrphanOpTodos, checkLevelUps, loadOpsSeen, reconcileOps, withOps } from './orgOpsSync';
import type { Activity, AttributeId, Org, OrgCodenameKind, OrgMember, OrgMemberCard, OrgPersonaSnapshot, OrgPost, OrgReactionTag, OrgView } from '@/types';

const social = () => useCloudSocialStore.getState();
const nickname = (): string => [...(useAppStore.getState().user?.name ?? '').trim()].slice(0, ORG_CODENAME_MAX).join('');

/** 自建的排前面 */
const orgOrder = (a: OrgView, b: OrgView): number => (a.me.slot === b.me.slot ? a.org.createdAt.getTime() - b.org.createdAt.getTime() : a.me.slot === 'own' ? -1 : 1);

/** 用写回来的我那一行替换视图里的我；写回来的行没展开 user，头像沿用原来的 */
const withMe = (v: OrgView, next: OrgMember): OrgView => {
  const me = next.avatarUrl ? next : { ...next, avatarUrl: v.me.avatarUrl };
  return { ...v, me, members: v.members.map(m => (m.id === me.id ? me : m)).sort(bySeat) };
};

// ── 本机记账：认识哪些组织（用来发现「你已不在」）、屏蔽名单、守则 ────────────────

const readJson = <T,>(key: string, fallback: T): T => {
  try { return (JSON.parse(localStorage.getItem(key) || 'null') as T) ?? fallback; } catch { return fallback; }
};
const writeJson = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 存不下就算了 */ }
};

const KNOWN_KEY = 'velvet.orgKnown.v1';
type Known = Record<string, Record<string, string>>;
const rememberOrgs = (me: string, views: OrgView[]) => {
  const all = readJson<Known>(KNOWN_KEY, {});
  all[me] = Object.fromEntries(views.map(v => [v.org.id, v.org.name]));
  writeJson(KNOWN_KEY, all);
};
/** 本机主动退出 / 解散 / 转让后退出的：从认识的名单里删掉，对账时就不会再提示「你已不在」 */
const forgetOrg = (me: string, orgId: string) => {
  const all = readJson<Known>(KNOWN_KEY, {});
  if (all[me]) { delete all[me][orgId]; writeJson(KNOWN_KEY, all); }
};

const BLOCK_KEY = 'velvet.orgBlocked.v1';
const loadBlocked = (me: string) => {
  const list = readJson<Record<string, string[]>>(BLOCK_KEY, {})[me] ?? [];
  social().setOrgBlocked(list.filter(x => typeof x === 'string'));
};
/** 屏蔽 / 解除屏蔽一位成员（只在本机生效） */
export function setMemberBlocked(userId: string, blocked: boolean): void {
  const me = getUserId();
  if (!me || userId === me) return;
  const cur = new Set(social().orgBlocked);
  if (blocked) cur.add(userId); else cur.delete(userId);
  const list = [...cur];
  social().setOrgBlocked(list);
  const all = readJson<Record<string, string[]>>(BLOCK_KEY, {});
  all[me] = list;
  writeJson(BLOCK_KEY, all);
}

/** 卡面用头像的成员（本机偏好，默认用代表牌；点一下牌面就切换） */
const FACE_KEY = 'velvet.orgFaces.v1';
const loadFaces = (me: string) => {
  const list = readJson<Record<string, string[]>>(FACE_KEY, {})[me] ?? [];
  social().setOrgAvatarFaces(list.filter(x => typeof x === 'string'));
};
export function toggleMemberFace(userId: string): void {
  const me = getUserId();
  if (!me || !userId) return;
  const cur = new Set(social().orgAvatarFaces);
  if (cur.has(userId)) cur.delete(userId); else cur.add(userId);
  const list = [...cur].slice(-100);
  social().setOrgAvatarFaces(list);
  const all = readJson<Record<string, string[]>>(FACE_KEY, {});
  all[me] = list;
  writeJson(FACE_KEY, all);
}

/** 举报过的动态：本机不再显示（7b） */
const HIDDEN_KEY = 'velvet.orgHiddenPosts.v1';
const loadHidden = (me: string) => {
  const list = readJson<Record<string, string[]>>(HIDDEN_KEY, {})[me] ?? [];
  social().setOrgHiddenPosts(list.filter(x => typeof x === 'string'));
};
function hidePost(postId: string): void {
  const me = getUserId();
  if (!me) return;
  const list = [...new Set([...social().orgHiddenPosts, postId])].slice(-300);
  social().setOrgHiddenPosts(list);
  const all = readJson<Record<string, string[]>>(HIDDEN_KEY, {});
  all[me] = list;
  writeJson(HIDDEN_KEY, all);
}

/** 公告板「看到哪儿了」（组织卡 / 地图红点）：{ 用户: { 组织: ISO } } */
const SEEN_KEY = 'velvet.orgSeen.v1';
const loadSeen = (me: string) => {
  const map = readJson<Record<string, Record<string, string>>>(SEEN_KEY, {})[me] ?? {};
  social().setOrgSeenAll(map);
};
export function markBoardSeen(orgId: string): void {
  const me = getUserId();
  if (!me) return;
  // 取「现在」和眼前最新一条的服务器时间里较晚的那个：手机时钟比服务器慢几秒时，刚看过的也别再亮
  const v = social().orgs.find(x => x.org.id === orgId);
  const newest = Math.max(0, ...(v?.posts ?? []).map(p => p.createdAt.getTime()), ...(v?.reactions ?? []).map(r => r.updatedAt.getTime()));
  const at = new Date(Math.max(Date.now(), newest)).toISOString();
  social().setOrgSeen(orgId, at);
  const all = readJson<Record<string, Record<string, string>>>(SEEN_KEY, {});
  all[me] = { ...(all[me] ?? {}), [orgId]: at };
  writeJson(SEEN_KEY, all);
}

const RULES_KEY = 'velvet.orgRulesOk.v1';
export const orgRulesAccepted = (): boolean => {
  const me = getUserId();
  return !!me && readJson<string[]>(RULES_KEY, []).includes(me);
};
export const acceptOrgRules = (): void => {
  const me = getUserId();
  if (!me) return;
  const list = readJson<string[]>(RULES_KEY, []);
  if (!list.includes(me)) writeJson(RULES_KEY, [...list, me]);
};

// ── 成员牌 ───────────────────────────────────────────────────────────────────

/** 按属性各算一张面具快照（去重，最多 3 张；没有人格就是空） */
function maskSnapshots(attrs: AttributeId[]): OrgPersonaSnapshot[] {
  const st = useAppStore.getState();
  return [...new Set(attrs)]
    .map(a => personaSnapshot(st.persona, st.attributes, a))
    .filter((p): p is OrgPersonaSnapshot => !!p)
    .slice(0, ORG_MAX_SHOWN_MASKS);
}

/**
 * 我在这个组织里该推的成员牌。展示哪几张面具记在服务器那一行上（多台设备不打架）：
 * 每次按现在的人格重算这几张（等级 / 新解锁的技能跟着变）。
 */
function myCardFor(view: OrgView): OrgMemberCard {
  const st = useAppStore.getState();
  return buildMemberCard({
    activities: st.activities,
    tz: view.org.tz,
    now: new Date(),
    status: st.settings.profileStatus,
    personas: maskSnapshots(shownPersonas(view.me.card).map(p => p.attribute)),
    tarotAt: view.me.card.tarotAt,
    prevCard: view.me.card,
    lv: computeTotalLv(st.attributes),
    // 五维：用本人起的名字（设置里的属性名），名字推之前过屏蔽词；点数 / 满级 / 精通星 / 称号和首页星图同一口径
    attrs: st.attributes.map(a => {
      const thresholds = st.settings.levelThresholds?.length ? st.settings.levelThresholds : a.levelThresholds;
      const max = thresholds.length || 5;
      const stars = a.level >= max ? (masteryOf(a.points, thresholds, resolveLevelDifficulty(st.settings))?.stars ?? 0) : 0;
      return {
        id: a.id,
        name: st.settings.attributeNames?.[a.id] ?? '',
        level: a.unlocked === false ? 0 : a.level || 0,
        ...(a.unlocked === false ? { locked: true } : {}),
        points: a.points || 0,
        max,
        ...(stars ? { stars } : {}),
        title: stars > 0 ? getMasteryTitle(a.id, stars) : getAttributeLevelTitle(st.settings.attributeLevelTitles, a.id, a.level),
      };
    }),
  });
}

/** 推成员牌（有变化才推）；昵称型代号跟着昵称走 */
async function pushMyCard(view: OrgView): Promise<OrgView> {
  const next = myCardFor(view);
  const nick = safeNickname(nickname());
  const renamed = view.me.codenameKind === 'nickname' && !!nick && nick !== view.me.codename;
  if (!renamed && cardFingerprint(next) === cardFingerprint(view.me.card)) return view;
  try {
    const me = await updateMyMember(view.me.id, { card: next, ...(renamed ? { codename: nick } : {}) });
    return withMe(view, me);
  } catch (err) {
    console.warn('[velvet-org] push card failed', view.org.id, err);
    return view;
  }
}

// ── 对账 ─────────────────────────────────────────────────────────────────────

/** 位置校正：先把「不是队长却占着自建」的降下来，再把「是队长却还是加入」的升上去（顺序反了会撞唯一索引） */
async function normalizeSlots(me: string, views: OrgView[]): Promise<OrgView[]> {
  const out = views.slice();
  const fix = async (want: 'own' | 'joined', pick: (v: OrgView) => boolean) => {
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (!pick(v)) continue;
      try {
        out[i] = withMe(v, await setMySlot(v.me.id, want));
      } catch (err) {
        console.warn('[velvet-org] slot fix failed', v.org.id, want, err);
      }
    }
  };
  await fix('joined', v => v.org.leaderId !== me && v.me.slot === 'own');
  await fix('own', v => v.org.leaderId === me && v.me.slot === 'joined');
  return out;
}

/** 代表牌撞了（两人同时选中同一张）：先选的留下；我是后选的 → 清掉，等我重选 */
async function resolveTarotConflict(view: OrgView): Promise<OrgView> {
  if (!tarotConflictLosers(view.members).has(view.me.id)) return view;
  try {
    const me = await updateMyMember(view.me.id, {
      tarotId: '',
      ...(view.me.codenameKind === 'tarot' ? { codenameKind: 'nickname' as OrgCodenameKind, codename: safeNickname(nickname()) || '新成员' } : {}),
    });
    return withMe(view, me);
  } catch (err) {
    console.warn('[velvet-org] clear conflicting tarot failed', err);
    return view;
  }
}

/** 拉公告板；失败就沿用本机已有的（没有就留空，界面显示「还没拉到」） */
async function withBoard(view: OrgView): Promise<OrgView> {
  try {
    return { ...view, ...(await listOrgBoard(view.org.id)) };
  } catch (err) {
    console.warn('[velvet-org] list board failed', view.org.id, err);
    const prev = social().orgs.find(v => v.org.id === view.org.id);
    return prev?.posts ? { ...view, posts: prev.posts, reactions: prev.reactions } : view;
  }
}

/**
 * 上一场会议结束了（周一凌晨 4 点后）还没有纪要 → 按现在的名册算一份，用确定 id 发。
 * 撞了（别人刚发）就重新拉一次公告板；组织在那周之后才建的不补；只补最近一周。
 */
async function ensureMinutes(view: OrgView): Promise<OrgView> {
  if (!view.posts) return view;
  const { lastClosed } = meetingState(new Date(), view.org.tz);
  if (zonedDay(view.org.createdAt, view.org.tz).key > shiftDayKey(lastClosed, 6)) return view;
  if (view.posts.some(p => p.kind === 'minutes' && p.minutes?.week === lastClosed)) return view;
  try {
    const made = await createMinutes(view.org.id, computeMinutes(view, lastClosed));
    if (made) return { ...view, posts: [made, ...view.posts] };
    return await withBoard(view);
  } catch (err) {
    console.warn('[velvet-org] minutes failed', view.org.id, err);
    return view;
  }
}

const noticeGone = (me: string, views: OrgView[]) => {
  const known = readJson<Known>(KNOWN_KEY, {})[me] ?? {};
  const ids = new Set(views.map(v => v.org.id));
  const gone = Object.entries(known).filter(([id]) => !ids.has(id)).map(([, name]) => `「${name}」`);
  if (gone.length) social().setOrgNotice(`你已不在${gone.join('、')}了：可能被请离、组织已解散，或在别的设备上退出了。`);
  rememberOrgs(me, views);
};

let orgRun: Promise<void> | null = null;

/** loadSocial 里调用；同一时间只跑一轮 */
export function syncOrgs(): Promise<void> {
  if (!orgRun) orgRun = syncOrgsOnce().finally(() => { orgRun = null; });
  return orgRun;
}

async function syncOrgsOnce(): Promise<void> {
  const me = getUserId();
  if (!me) return;
  loadBlocked(me);
  loadHidden(me);
  loadSeen(me);
  loadOpsSeen(me);
  loadFaces(me);
  ensureAutoPush();
  const listed = await listMyMemberships();
  if (!listed) return; // 拉取失败：本地什么都不动
  let views: OrgView[] = [];
  for (const { org, member } of listed) {
    try {
      const members = (await listOrgMembers(org.id)).sort(bySeat);
      views.push({ org, members, me: members.find(m => m.id === member.id) ?? member });
    } catch (err) {
      console.warn('[velvet-org] list members failed', org.id, err);
      const prev = social().orgs.find(v => v.org.id === org.id);
      views.push(prev ? { ...prev, org } : { org, members: [member], me: member });
    }
  }
  views = await normalizeSlots(me, views);
  for (let i = 0; i < views.length; i++) views[i] = await resolveTarotConflict(views[i]);
  for (let i = 0; i < views.length; i++) views[i] = await pushMyCard(views[i]);
  // 公告板在推完成员牌之后拉：补纪要要用到大家最新的出勤；作战达成卡（「作战完成者」称号）也要先拉到
  for (let i = 0; i < views.length; i++) views[i] = await ensureMinutes(await withOps(await withBoard(views[i])));
  for (let i = 0; i < views.length; i++) views[i] = await reconcileOps(views[i]);
  social().setOrgs(views.sort(orgOrder));
  noticeGone(me, views);
  checkLevelUps(views);
  await archiveOrphanOpTodos(views);
}

/** 只刷新一个组织（界面动作之后）；组织没了就从本机拿掉 */
export async function refreshOrg(orgId: string): Promise<OrgView | null> {
  const me = getUserId();
  if (!me) return null;
  try {
    const [org, members] = await Promise.all([fetchOrg(orgId), listOrgMembers(orgId)]);
    const mine = members.find(m => m.userId === me);
    if (!mine) {
      social().removeOrgView(orgId);
      return null;
    }
    const prev = social().orgs.find(v => v.org.id === orgId);
    const base: OrgView = { org, members: members.sort(bySeat), me: mine, posts: prev?.posts, reactions: prev?.reactions, ops: prev?.ops, checkins: prev?.checkins, ledger: prev?.ledger };
    const view: OrgView = await reconcileOps(await withOps(await withBoard(base)));
    social().upsertOrgView(view);
    checkLevelUps([view]);
    social().setOrgs([...social().orgs].sort(orgOrder));
    rememberOrgs(me, social().orgs);
    return view;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      social().removeOrgView(orgId);
      return null;
    }
    console.warn('[velvet-org] refresh failed', orgId, err);
    return social().orgs.find(v => v.org.id === orgId) ?? null;
  }
}

// ── 记完记录 / 升级 / 改了名片状态：5 秒后顺手推一次成员牌 ───────────────────────

let autoPushOn = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
function ensureAutoPush(): void {
  if (autoPushOn) return;
  autoPushOn = true;
  useAppStore.subscribe((s, prev) => {
    // 等级（LV）和五维跟着属性走：属性、属性名变了也推
    if (s.activities === prev.activities && s.attributes === prev.attributes && s.settings.attributeNames === prev.settings.attributeNames && s.settings.attributeLevelTitles === prev.settings.attributeLevelTitles && s.settings.profileStatus === prev.settings.profileStatus && s.user?.name === prev.user?.name) return;
    if (!social().orgs.length) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { void pushCardsNow(); }, 5000);
  });
}

async function pushCardsNow(): Promise<void> {
  if (!getUserId()) return;
  // 整轮对账正在跑：等它跑完再推（它可能是在这次改动之前读的数据，跳过就会漏推一次）
  if (orgRun) { try { await orgRun; } catch { /* 对账失败不影响这里 */ } }
  for (const v of social().orgs) {
    const next = await pushMyCard(v);
    if (next !== v) social().upsertOrgView(next);
  }
}

// ── 界面动作 ─────────────────────────────────────────────────────────────────

const viewOf = (orgId: string): OrgView => {
  const v = social().orgs.find(x => x.org.id === orgId);
  if (!v) throw new OrgError('找不到这个组织了');
  return v;
};

export { previewOrg, OrgError };

/** 建立组织 → 返回组织 id（之后走选牌与入队仪式） */
export async function createOrgFromUi(draft: OrgDraft): Promise<string> {
  const me = getUserId();
  const { org, member } = await createOrg(draft, nickname(), social().orgs);
  social().upsertOrgView({ org, members: [member], me: member });
  social().setOrgs([...social().orgs].sort(orgOrder));
  if (me) rememberOrgs(me, social().orgs);
  return org.id;
}

/** 凭码加入 → 返回组织 id */
export async function joinOrgFromUi(code: string): Promise<string> {
  const { org, member } = await joinOrg(code, nickname(), social().orgs);
  social().upsertOrgView({ org, members: [member], me: member });
  await refreshOrg(org.id);
  return org.id;
}

/** 定代表牌与代号（入队时 / 之后改）。换了牌就记下换牌时刻（撞牌时先选的留下） */
export async function saveMyCardFromUi(orgId: string, input: { tarotId: string; codenameKind: OrgCodenameKind; codename?: string }): Promise<void> {
  const view = viewOf(orgId);
  const others = view.members.filter(m => m.userId !== view.me.userId && m.tarotId === input.tarotId);
  if (input.tarotId && others.length) throw new OrgError('这张牌已经有人持有了，换一张吧');
  if (input.codenameKind === 'nickname' && nickname() && !safeNickname(nickname())) {
    throw new OrgError('昵称里有个词放在据点里不太合适：换成「自己写」或「用牌名」吧');
  }
  const codename = input.codenameKind === 'tarot'
    ? (tarotCardOf(input.tarotId)?.name ?? '')
    : input.codenameKind === 'nickname' ? (safeNickname(nickname()) || view.me.codename) : (input.codename ?? '');
  const changedCard = input.tarotId !== (view.me.tarotId ?? '');
  const card = changedCard ? { ...myCardFor(view), tarotAt: new Date().toISOString() } : myCardFor(view);
  const me = await updateMyMember(view.me.id, { tarotId: input.tarotId, codenameKind: input.codenameKind, codename, card });
  social().upsertOrgView(withMe(view, me));
  if (changedCard) void refreshOrg(orgId); // 看一眼是不是和谁同时选中了同一张
}

/** 在名册背面展示哪几张面具（第 8 轮：最多 3 张，按选的顺序；空 = 不展示） */
export async function setShownMasksFromUi(orgId: string, attrs: AttributeId[]): Promise<number> {
  const view = viewOf(orgId);
  const st = useAppStore.getState();
  if (attrs.length && !st.persona) throw new OrgError('还没有人格面具：先去逆影战场唤醒一张');
  if (attrs.length > ORG_MAX_SHOWN_MASKS) throw new OrgError(`最多展示 ${ORG_MAX_SHOWN_MASKS} 张`);
  const personas = maskSnapshots(attrs);
  const base = myCardFor(view);
  const { personas: _old, ...rest } = base;
  const card: OrgMemberCard = { ...rest, persona: personas[0] ?? null, ...(personas.length ? { personas } : {}) };
  const me = await updateMyMember(view.me.id, { card });
  social().upsertOrgView(withMe(view, me));
  return personas.length;
}

export async function updateOrgFromUi(orgId: string, draft: OrgDraft): Promise<void> {
  const view = viewOf(orgId);
  const org: Org = await updateOrgProfile(orgId, draft);
  social().upsertOrgView({ ...view, org });
  const me = getUserId();
  if (me) rememberOrgs(me, social().orgs);
}

export async function rotateCodeFromUi(orgId: string): Promise<void> {
  const view = viewOf(orgId);
  const org = await rotateInviteCode(orgId);
  social().upsertOrgView({ ...view, org });
}

/** 请离 → 返回是否已自动换码。alsoContent：顺手删掉 Ta 在这里的动态和标签（队长有权删） */
export async function kickFromUi(orgId: string, memberId: string, alsoContent = true): Promise<boolean> {
  const view = viewOf(orgId);
  const target = view.members.find(m => m.id === memberId);
  if (alsoContent && target && view.org.leaderId === getUserId()) await deleteUserContent(orgId, target.userId);
  const { rotated } = await kickMember(view, memberId);
  await refreshOrg(orgId);
  return !!rotated;
}

/** 转让队长。我已经加入了别的组织时，转让之后只能退出这里（界面上先说清楚） */
export const transferMustLeave = (orgId: string): boolean => social().orgs.some(v => v.org.id !== orgId && v.me.slot === 'joined');

export async function transferFromUi(orgId: string, memberId: string): Promise<void> {
  const me = getUserId();
  const mustLeave = transferMustLeave(orgId);
  await transferLeader(viewOf(orgId), memberId, mustLeave);
  if (mustLeave) {
    if (me) forgetOrg(me, orgId);
    social().removeOrgView(orgId);
    return;
  }
  await refreshOrg(orgId);
}

export async function leaveFromUi(orgId: string): Promise<void> {
  const me = getUserId();
  const view = viewOf(orgId);
  if (me && view.org.leaderId !== me) await deleteUserContent(orgId, me);
  await leaveOrg(view);
  if (me) forgetOrg(me, orgId);
  social().removeOrgView(orgId);
}

export async function dissolveFromUi(orgId: string): Promise<void> {
  const me = getUserId();
  await dissolveOrg(viewOf(orgId));
  if (me) forgetOrg(me, orgId);
  social().removeOrgView(orgId);
}

// ── 公告板与会议的界面动作（7b）──────────────────────────────────────────────────

const putView = (v: OrgView) => social().upsertOrgView(v);

/** 公告板刷新（进公告板 / 点刷新） */
export async function refreshBoard(orgId: string): Promise<void> {
  const v = social().orgs.find(x => x.org.id === orgId);
  if (!v) return;
  putView(await withBoard(v));
}

/** 把一条记录分享到据点：先拉一次最新的，数今天分享了几条（每人每天 3 条） */
export async function shareActivity(orgId: string, activity: Activity, text: string): Promise<OrgPost> {
  if (!canShareActivity(activity)) throw new OrgError('这类记录不能分享');
  const me = getUserId();
  let view = viewOf(orgId);
  view = await withBoard(view);
  putView(view);
  if (me && myPostsToday(view.posts, me) >= ORG_POSTS_PER_DAY) throw new OrgError(`今天已经在「${view.org.name}」分享了 ${ORG_POSTS_PER_DAY} 条，明天再来`);
  const snap = buildPostSnapshot(activity, useAppStore.getState().settings.attributeNames, { codename: displayCodename(view.me), tarotId: view.me.tarotId });
  const post = await createMoment(orgId, text, snap);
  const cur = social().orgs.find(x => x.org.id === orgId) ?? view;
  putView({ ...cur, posts: [post, ...(cur.posts ?? []).filter(p => p.id !== post.id)] });
  return post;
}

/** 贴 / 换 / 撤标签（先改本机，失败再改回来） */
export async function reactToPost(orgId: string, postId: string, tag: OrgReactionTag): Promise<void> {
  const me = getUserId();
  if (!me) return;
  const view = viewOf(orgId);
  const existing = (view.reactions ?? []).find(r => r.postId === postId && r.userId === me);
  const before = view.reactions ?? [];
  const now = new Date();
  const optimistic = existing && existing.tag === tag
    ? before.filter(r => r.id !== existing.id)
    : existing
      ? before.map(r => (r.id === existing.id ? { ...r, tag, updatedAt: now } : r))
      : [...before, { id: `tmp-${postId}`, postId, orgId, userId: me, tag, createdAt: now, updatedAt: now }];
  putView({ ...view, reactions: optimistic });
  try {
    const saved = await setReaction(orgId, postId, tag, existing);
    const cur = social().orgs.find(x => x.org.id === orgId);
    if (!cur) return;
    const rest = (cur.reactions ?? []).filter(r => !(r.postId === postId && r.userId === me));
    putView({ ...cur, reactions: saved ? [...rest, saved] : rest });
  } catch (err) {
    const cur = social().orgs.find(x => x.org.id === orgId);
    if (cur) putView({ ...cur, reactions: before });
    throw err;
  }
}

export async function deletePostFromUi(orgId: string, postId: string): Promise<void> {
  await deletePost(postId);
  const cur = social().orgs.find(x => x.org.id === orgId);
  if (cur) putView({ ...cur, posts: (cur.posts ?? []).filter(p => p.id !== postId), reactions: (cur.reactions ?? []).filter(r => r.postId !== postId) });
}

/** 举报：写举报表（带原话副本），这条在本机隐藏 */
export async function reportPostFromUi(post: OrgPost, reason: OrgReportReason): Promise<void> {
  await reportPost(post, reason);
  hidePost(post.id);
}

/** 周日会议：这周立过目标就带上自评；只在会议时间里能写 */
export async function submitMeeting(orgId: string, input: { result?: 'done' | 'partial' | 'missed'; goal: string }): Promise<void> {
  const view = viewOf(orgId);
  const st = meetingState(new Date(), view.org.tz);
  if (!st.open) throw new OrgError('会议在周日开（到周一凌晨 4 点），到时候再来写');
  const needResult = hadGoalFor(view.me, st.week) && view.me.resultWeek !== st.week;
  if (needResult && !input.result) throw new OrgError('先给这周的目标打个分');
  const me = await saveMeeting(view.me.id, { week: st.week, result: input.result, goal: input.goal, nextWeek: nextWeekKey(st.week) });
  putView(withMe(social().orgs.find(x => x.org.id === orgId) ?? view, me));
  // 写完了：今天的会议提醒要撤掉
  void useAppStore.getState().syncNotifications();
}
