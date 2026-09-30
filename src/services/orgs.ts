/**
 * 组织（v2.7.0.6 第 7 轮 · PRD §12）的 PB 读写。
 *
 * 集合（需要在 PB Admin 手动建立，逐字段 / 索引 / 规则见 PRD S 节第 13 条）：
 *   orgs         name(≤12) / motto(≤30) / emblem / leader → users / invite_code(8 位) / tz
 *   org_members  org → orgs / user → users / slot(own|joined) / seat(1–7) / code / codename(≤8)
 *                / codename_kind / tarot_id / card(json) / goal / goal_week / result / result_week
 * 服务器只用规则 + 唯一索引，不写钩子：
 *   · (org, user) 唯一；(user, slot) 唯一 → 最多自建一个 + 加入一个；orgs.leader 唯一；
 *   · (org, seat) 唯一且 seat 只能 1–7 → 最多 7 人；
 *   · 非成员只能带着 ?code= 读到那一个组织；建成员行时规则拿请求里的码和组织当前的码比。
 * 多步写入：能回滚的回滚；回滚不了的（转让之后自己已经不是队长）由 orgSync 的位置校正兜底。
 */
import type { RecordModel } from 'pocketbase';
import { pb, getUserId } from './pocketbase';
import { pbQuote } from './pbFilter';
import { auditText } from '@/utils/textAudit';
import {
  ORG_BOARD_DAYS, ORG_BOARD_LIMIT, ORG_CODENAME_MAX, ORG_GOAL_MAX, ORG_MAX_SEATS, ORG_MOTTO_MAX, ORG_NAME_MAX, ORG_POST_TEXT_MAX,
  cleanSnapshotNames, deviceTimeZone, genInviteCode, isEmblemId, isInviteCode, isOrgTag, minutesId, normalizeInviteInput, parseMemberCard,
  parseMinutes, parsePostSnapshot,
} from '@/utils/orgLogic';
import type {
  Org, OrgCodenameKind, OrgMember, OrgMemberCard, OrgMinutesSnapshot, OrgPost, OrgPostSnapshot, OrgReaction, OrgReactionTag, OrgView,
} from '@/types';

// ── 映射 ─────────────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const mapOrg = (r: RecordModel): Org => ({
  id: r.id,
  name: str(r.name),
  motto: str(r.motto),
  emblem: str(r.emblem) || 'star',
  leaderId: str(r.leader),
  inviteCode: str(r.invite_code),
  tz: str(r.tz) || 'UTC',
  createdAt: new Date(str(r.created) || Date.now()),
  updatedAt: new Date(str(r.updated) || Date.now()),
});

const CODENAME_KINDS: readonly OrgCodenameKind[] = ['custom', 'nickname', 'tarot'];
const RESULTS = ['done', 'partial', 'missed'] as const;

export const mapMember = (r: RecordModel): OrgMember => ({
  id: r.id,
  orgId: str(r.org),
  userId: str(r.user),
  slot: r.slot === 'own' ? 'own' : 'joined',
  seat: typeof r.seat === 'number' ? r.seat : Number(r.seat) || 0,
  codename: str(r.codename),
  codenameKind: CODENAME_KINDS.includes(r.codename_kind as OrgCodenameKind) ? (r.codename_kind as OrgCodenameKind) : 'nickname',
  tarotId: str(r.tarot_id) || undefined,
  card: parseMemberCard(r.card),
  goal: str(r.goal) || undefined,
  goalWeek: str(r.goal_week) || undefined,
  result: (RESULTS as readonly string[]).includes(str(r.result)) ? (r.result as OrgMember['result']) : undefined,
  resultWeek: str(r.result_week) || undefined,
  createdAt: new Date(str(r.created) || Date.now()),
  updatedAt: new Date(str(r.updated) || Date.now()),
});

// ── 错误 ─────────────────────────────────────────────────────────────────────

type PbErr = { status?: number; response?: { message?: string; data?: Record<string, { code?: string; message?: string }> }; message?: string };

/** 字段级错误码（{ seat: 'validation_not_unique', … }）；没有就是空对象 */
export function fieldCodes(err: unknown): Record<string, string> {
  const data = (err as PbErr)?.response?.data;
  const out: Record<string, string> = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) if (v && typeof v.code === 'string') out[k] = v.code;
  }
  return out;
}
const statusOf = (err: unknown): number => (typeof (err as PbErr)?.status === 'number' ? (err as PbErr).status! : -1);
const notUnique = (err: unknown, field: string): boolean => fieldCodes(err)[field] === 'validation_not_unique';
/** 400 且没有任何字段错误 = 规则没放行 */
const ruleDenied = (err: unknown): boolean => statusOf(err) === 400 && Object.keys(fieldCodes(err)).length === 0;

export class OrgError extends Error {}

/** PB 报错 → 一句人话；原始报错进控制台 */
export function describeOrgError(err: unknown, fallback: string): string {
  if (err instanceof OrgError) return err.message;
  const s = statusOf(err);
  console.warn('[velvet-org]', fallback, s, (err as PbErr)?.response?.message ?? (err as PbErr)?.message, fieldCodes(err));
  if (s === 0) return '网络没连上，稍后再试';
  if (s === 401 || s === 403) return '登录过期了，重新登录再试';
  if (s === 404) return '找不到这个组织了，可能已经解散';
  if (s === 429) return '操作有点快，过会儿再试';
  if (s >= 500) return '服务器开小差了，稍后再试';
  return fallback;
}

/** 屏蔽词：和名片同一套词库，提示语换成据点的说法 */
function assertClean(...texts: string[]): void {
  for (const t of texts) {
    const r = auditText(t);
    if (!r.ok) throw new OrgError(r.kind === 'contact' ? '稍微调整下措辞吧：据点里不能放链接、联系方式或引流内容' : '稍微调整下措辞吧：有个词放在据点里不太合适');
  }
}

const requireMe = (): string => {
  if (!pb || !pb.authStore.isValid) throw new OrgError('要先登录');
  const me = getUserId();
  if (!me) throw new OrgError('用户信息缺失');
  return me;
};

const clip = (s: string, n: number): string => [...s.trim()].slice(0, n).join('');

/** 昵称当代号：截到 8 个字；过不了屏蔽词就不用（调用方换成默认代号），不因为昵称拦住建立 / 加入 */
export const safeNickname = (nickname: string): string => {
  const c = clip(nickname, ORG_CODENAME_MAX);
  return c && auditText(c).ok ? c : '';
};

// ── 读 ───────────────────────────────────────────────────────────────────────

export interface Membership { member: OrgMember; org: Org }

/** 我的成员行 + 所属组织。失败返回 null（和「一个都没有」区分开，调用方别据此清空本地） */
export async function listMyMemberships(): Promise<Membership[] | null> {
  if (!pb || !pb.authStore.isValid) return null;
  const me = getUserId();
  if (!me) return null;
  try {
    const rows = await pb.collection('org_members').getFullList({ filter: `user = ${pbQuote(me)}`, expand: 'org', requestKey: null });
    const out: Membership[] = [];
    for (const r of rows) {
      const exp = (r.expand as Record<string, RecordModel | undefined> | undefined)?.org;
      const org = exp ? mapOrg(exp) : mapOrg(await pb.collection('orgs').getOne(str(r.org), { requestKey: null }));
      out.push({ member: mapMember(r), org });
    }
    return out;
  } catch (err) {
    console.warn('[velvet-org] listMyMemberships failed', err);
    return null;
  }
}

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await pb!.collection('org_members').getFullList({ filter: `org = ${pbQuote(orgId)}`, sort: 'seat', requestKey: null });
  return rows.map(mapMember);
}

export async function fetchOrg(orgId: string): Promise<Org> {
  return mapOrg(await pb!.collection('orgs').getOne(orgId, { requestKey: null }));
}

/** 凭邀请码看一眼（加入前的预览）：码不对 / 已经换了新码 → null */
export async function previewOrg(rawCode: string): Promise<Org | null> {
  requireMe();
  const code = normalizeInviteInput(rawCode);
  if (!isInviteCode(code)) throw new OrgError('邀请码是 8 位字母和数字');
  try {
    const res = await pb!.collection('orgs').getList(1, 1, { filter: `invite_code = ${pbQuote(code)}`, query: { code }, requestKey: null });
    return res.items[0] ? mapOrg(res.items[0]) : null;
  } catch (err) {
    throw new OrgError(describeOrgError(err, '暂时查不到这个邀请码，稍后再试'));
  }
}

// ── 建立 / 加入 ───────────────────────────────────────────────────────────────

export interface OrgDraft { name: string; motto: string; emblem: string }

function checkDraft(d: OrgDraft): OrgDraft {
  const name = clip(d.name, ORG_NAME_MAX);
  const motto = clip(d.motto, ORG_MOTTO_MAX);
  if (!name) throw new OrgError('给组织起个名字');
  if (!isEmblemId(d.emblem)) throw new OrgError('选一枚徽记');
  assertClean(name, motto);
  return { name, motto, emblem: d.emblem };
}

const initialCard = (): OrgMemberCard => ({ streak: 0, persona: null, at: new Date().toISOString() });

/** 建立组织：先建组织（队长 = 我），再建我的成员行（1 号座位、「自建」）；第二步失败就删掉组织 */
export async function createOrg(draft: OrgDraft, nickname: string, mine: OrgView[]): Promise<Membership> {
  const me = requireMe();
  const d = checkDraft(draft);
  if (mine.some(v => v.org.leaderId === me || v.me.slot === 'own')) throw new OrgError('你已经建过一个组织了（每人最多建一个）');
  let orgRec: RecordModel | null = null;
  for (let i = 0; i < 3 && !orgRec; i++) {
    try {
      orgRec = await pb!.collection('orgs').create({ name: d.name, motto: d.motto, emblem: d.emblem, leader: me, invite_code: genInviteCode(), tz: deviceTimeZone() }, { requestKey: null });
    } catch (err) {
      if (notUnique(err, 'invite_code')) continue; // 撞码（极少）：换一个再来
      if (notUnique(err, 'leader')) throw new OrgError('你已经建过一个组织了（每人最多建一个）');
      throw new OrgError(describeOrgError(err, '组织没建成，稍后再试'));
    }
  }
  if (!orgRec) throw new OrgError('组织没建成，稍后再试');
  const org = mapOrg(orgRec);
  try {
    const m = await pb!.collection('org_members').create({
      org: org.id, user: me, slot: 'own', seat: 1, code: '',
      codename: safeNickname(nickname) || '队长', codename_kind: 'nickname', tarot_id: '', card: initialCard(),
    }, { requestKey: null });
    return { org, member: mapMember(m) };
  } catch (err) {
    try { await pb!.collection('orgs').delete(org.id, { requestKey: null }); } catch (e) { console.warn('[velvet-org] rollback org failed', org.id, e); }
    if (notUnique(err, 'slot')) throw new OrgError('你已经建过一个组织了（每人最多建一个）');
    throw new OrgError(describeOrgError(err, '组织没建成，稍后再试'));
  }
}

/** 凭码加入：从 1 号座位往后试，撞了换下一个；7 个都满就进不去 */
export async function joinOrg(rawCode: string, nickname: string, mine: OrgView[]): Promise<Membership> {
  const me = requireMe();
  const code = normalizeInviteInput(rawCode);
  if (mine.some(v => v.me.slot === 'joined')) throw new OrgError('你已经加入了一个组织（每人最多加入一个）');
  const org = await previewOrg(code);
  if (!org) throw new OrgError('邀请码不对，或者组织已经换了新码');
  if (org.leaderId === me || mine.some(v => v.org.id === org.id)) throw new OrgError('你已经在这个组织里了');
  for (let seat = 1; seat <= ORG_MAX_SEATS; seat++) {
    try {
      const m = await pb!.collection('org_members').create({
        org: org.id, user: me, slot: 'joined', seat, code,
        codename: safeNickname(nickname) || '新成员', codename_kind: 'nickname', tarot_id: '', card: initialCard(),
      }, { requestKey: null });
      return { org, member: mapMember(m) };
    } catch (err) {
      // 组合唯一索引撞了时，PB 把索引里的每一列都报成 validation_not_unique：
      // (user, slot) → 加入名额已用；(org, seat) → 座位有人，换下一个；(org, user) → 已经是成员
      const f = fieldCodes(err);
      if (f.slot === 'validation_not_unique') throw new OrgError('你已经加入了一个组织（每人最多加入一个）');
      if (f.seat === 'validation_not_unique') continue;
      if (f.user === 'validation_not_unique') throw new OrgError('你已经在这个组织里了');
      if (f.org === 'validation_not_unique') continue;
      if (ruleDenied(err)) throw new OrgError('邀请码已经失效了，问问队长要新的');
      throw new OrgError(describeOrgError(err, '没能加入，稍后再试'));
    }
  }
  throw new OrgError('这个组织已经满 7 人了');
}

// ── 改 ───────────────────────────────────────────────────────────────────────

/** 队长改组织资料 */
export async function updateOrgProfile(orgId: string, draft: OrgDraft): Promise<Org> {
  requireMe();
  const d = checkDraft(draft);
  try {
    return mapOrg(await pb!.collection('orgs').update(orgId, { name: d.name, motto: d.motto, emblem: d.emblem }, { requestKey: null }));
  } catch (err) {
    throw new OrgError(describeOrgError(err, '没改成，稍后再试'));
  }
}

/** 队长换邀请码（旧码立即作废） */
export async function rotateInviteCode(orgId: string): Promise<Org> {
  requireMe();
  for (let i = 0; i < 3; i++) {
    try {
      return mapOrg(await pb!.collection('orgs').update(orgId, { invite_code: genInviteCode() }, { requestKey: null }));
    } catch (err) {
      if (notUnique(err, 'invite_code')) continue;
      throw new OrgError(describeOrgError(err, '没换成，稍后再试'));
    }
  }
  throw new OrgError('没换成，稍后再试');
}

export interface MemberPatch {
  codename?: string;
  codenameKind?: OrgCodenameKind;
  tarotId?: string;
  card?: OrgMemberCard;
}

/** 改自己那一行（代号 / 代表牌 / 成员牌）。自己写的代号过屏蔽词 */
export async function updateMyMember(memberId: string, patch: MemberPatch): Promise<OrgMember> {
  requireMe();
  const body: Record<string, unknown> = {};
  if (patch.codename !== undefined) {
    const c = clip(patch.codename, ORG_CODENAME_MAX);
    if (!c) throw new OrgError('代号不能空着');
    assertClean(c);
    body.codename = c;
  }
  if (patch.codenameKind) body.codename_kind = patch.codenameKind;
  if (patch.tarotId !== undefined) body.tarot_id = patch.tarotId;
  if (patch.card) body.card = patch.card;
  try {
    return mapMember(await pb!.collection('org_members').update(memberId, body, { requestKey: null }));
  } catch (err) {
    throw new OrgError(describeOrgError(err, '没存上，稍后再试'));
  }
}

/** 位置字段校正：只改 slot 一个字段（规则要求 slot 与是不是队长一致） */
export async function setMySlot(memberId: string, slot: 'own' | 'joined'): Promise<OrgMember> {
  return mapMember(await pb!.collection('org_members').update(memberId, { slot }, { requestKey: null }));
}

// ── 退出 / 请离 / 转让 / 解散 ─────────────────────────────────────────────────

export async function leaveOrg(view: OrgView): Promise<void> {
  const me = requireMe();
  if (view.org.leaderId === me) throw new OrgError('队长要先把队长转让出去，或者解散组织');
  try {
    await pb!.collection('org_members').delete(view.me.id, { requestKey: null });
  } catch (err) {
    if (statusOf(err) === 404) return; // 已经不在了
    throw new OrgError(describeOrgError(err, '没能退出，稍后再试'));
  }
}

/** 队长请离一位成员；随后自动换码，旧码作废。换码失败不算请离失败（返回 false 让界面提示手动换） */
export async function kickMember(view: OrgView, memberId: string): Promise<{ rotated: Org | null }> {
  const me = requireMe();
  if (view.org.leaderId !== me) throw new OrgError('只有队长能请离成员');
  const target = view.members.find(m => m.id === memberId);
  if (!target || target.userId === me) throw new OrgError('不能请离自己');
  try {
    await pb!.collection('org_members').delete(memberId, { requestKey: null });
  } catch (err) {
    if (statusOf(err) !== 404) throw new OrgError(describeOrgError(err, '没能请离，稍后再试'));
  }
  try {
    return { rotated: await rotateInviteCode(view.org.id) };
  } catch (err) {
    console.warn('[velvet-org] rotate after kick failed', err);
    return { rotated: null };
  }
}

/**
 * 转让队长。先改组织的队长（对方已经是别处的队长 → 唯一索引挡住，什么都没变）；
 * 成功之后我已经不是队长、改不回去了，所以能失败的检查都放在这一步之前：
 *   · alsoLeave：我已经加入了别的组织，转让后「加入」名额冲突，只能退出这里；
 *   · 否则把我这行改成「加入」。这一步没成也不要紧，下次对账会校正。
 * 对方那行由对方的客户端在下次对账时改成「自建」。
 */
export async function transferLeader(view: OrgView, toMemberId: string, alsoLeave: boolean): Promise<void> {
  const me = requireMe();
  if (view.org.leaderId !== me) throw new OrgError('只有队长能转让');
  const target = view.members.find(m => m.id === toMemberId);
  if (!target || target.userId === me) throw new OrgError('选一位成员');
  try {
    await pb!.collection('orgs').update(view.org.id, { leader: target.userId }, { requestKey: null });
  } catch (err) {
    if (notUnique(err, 'leader')) throw new OrgError('对方已经是另一个组织的队长了，没法再接手');
    throw new OrgError(describeOrgError(err, '没转让成，稍后再试'));
  }
  try {
    if (alsoLeave) await pb!.collection('org_members').delete(view.me.id, { requestKey: null });
    else await setMySlot(view.me.id, 'joined');
  } catch (err) {
    console.warn('[velvet-org] post-transfer step failed; next sync will fix', err);
  }
}

/** 队长解散：删组织，成员行级联删除 */
export async function dissolveOrg(view: OrgView): Promise<void> {
  const me = requireMe();
  if (view.org.leaderId !== me) throw new OrgError('只有队长能解散组织');
  try {
    await pb!.collection('orgs').delete(view.org.id, { requestKey: null });
  } catch (err) {
    if (statusOf(err) === 404) return;
    throw new OrgError(describeOrgError(err, '没能解散，稍后再试'));
  }
}

// ── 公告板（7b · PRD §12.16）──────────────────────────────────────────────────
//   org_posts      org / user / kind(moment|minutes) / text(≤20) / snapshot(json) / week_key
//   org_reactions  post / org / user / tag（六选一）；(post, user) 唯一
//   org_reports    post_id / org_id / target_user（纯文本 id）/ reporter / reason / text_copy；(post_id, reporter) 唯一

export const mapPost = (r: RecordModel): OrgPost => {
  const kind = r.kind === 'minutes' ? 'minutes' : 'moment';
  return {
    id: r.id,
    orgId: str(r.org),
    userId: str(r.user),
    kind,
    text: str(r.text),
    snapshot: kind === 'moment' ? parsePostSnapshot(r.snapshot) : null,
    minutes: kind === 'minutes' ? parseMinutes(r.snapshot) : null,
    weekKey: str(r.week_key) || undefined,
    createdAt: new Date(str(r.created) || Date.now()),
  };
};

export const mapReaction = (r: RecordModel): OrgReaction => ({
  id: r.id,
  postId: str(r.post),
  orgId: str(r.org),
  userId: str(r.user),
  tag: isOrgTag(r.tag) ? r.tag : 'strong',
  createdAt: new Date(str(r.created) || Date.now()),
  updatedAt: new Date(str(r.updated) || str(r.created) || Date.now()),
});

const sinceIso = (days: number) => new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ');

/** 最近 30 天、最多 100 条动态（新的在前）+ 这些动态上的标签 */
export async function listOrgBoard(orgId: string): Promise<{ posts: OrgPost[]; reactions: OrgReaction[] }> {
  const since = sinceIso(ORG_BOARD_DAYS);
  const [posts, reactions] = await Promise.all([
    pb!.collection('org_posts').getList(1, ORG_BOARD_LIMIT, { filter: `org = ${pbQuote(orgId)} && created >= ${pbQuote(since)}`, sort: '-created', requestKey: null }),
    pb!.collection('org_reactions').getFullList({ filter: `org = ${pbQuote(orgId)} && post.created >= ${pbQuote(since)}`, requestKey: null }),
  ]);
  return { posts: posts.items.map(mapPost), reactions: reactions.map(mapReaction) };
}

/** 分享一条动态（一句话过屏蔽词；快照不含记录原文） */
export async function createMoment(orgId: string, text: string, snapshot: OrgPostSnapshot): Promise<OrgPost> {
  const me = requireMe();
  const t = clip(text, ORG_POST_TEXT_MAX);
  if (!t) throw new OrgError('写一句话再分享');
  assertClean(t);
  try {
    return mapPost(await pb!.collection('org_posts').create({ org: orgId, user: me, kind: 'moment', text: t, snapshot: cleanSnapshotNames(snapshot), week_key: '' }, { requestKey: null }));
  } catch (err) {
    throw new OrgError(describeOrgError(err, '没分享出去，稍后再试'));
  }
}

/**
 * 贴 / 换 / 撤标签：再点自己贴的那个 = 撤；点别的 = 换。
 * 两台设备同时贴会撞 (post, user) 唯一索引——撞了就读出已有那条，改成这次选的。
 */
export async function setReaction(orgId: string, postId: string, tag: OrgReactionTag, existing: OrgReaction | undefined): Promise<OrgReaction | null> {
  const me = requireMe();
  try {
    if (existing && existing.tag === tag) {
      await pb!.collection('org_reactions').delete(existing.id, { requestKey: null });
      return null;
    }
    if (existing) return mapReaction(await pb!.collection('org_reactions').update(existing.id, { tag }, { requestKey: null }));
    try {
      return mapReaction(await pb!.collection('org_reactions').create({ post: postId, org: orgId, user: me, tag }, { requestKey: null }));
    } catch (err) {
      if (!Object.values(fieldCodes(err)).includes('validation_not_unique')) throw err;
      const cur = await pb!.collection('org_reactions').getFirstListItem(`post = ${pbQuote(postId)} && user = ${pbQuote(me)}`, { requestKey: null });
      return mapReaction(await pb!.collection('org_reactions').update(cur.id, { tag }, { requestKey: null }));
    }
  } catch (err) {
    if (statusOf(err) === 404) return null; // 动态被删了
    throw new OrgError(describeOrgError(err, '没贴上，稍后再试'));
  }
}

/** 删动态（自己的，或队长删任何一条）；标签跟着级联删 */
export async function deletePost(postId: string): Promise<void> {
  requireMe();
  try {
    await pb!.collection('org_posts').delete(postId, { requestKey: null });
  } catch (err) {
    if (statusOf(err) === 404) return;
    throw new OrgError(describeOrgError(err, '没删掉，稍后再试'));
  }
}

export type OrgReportReason = 'harass' | 'inappropriate' | 'ads' | 'other';

/** 举报一条动态：带原话副本（动态被删了你在后台也看得到原话）；同一条举报过就算了 */
export async function reportPost(post: OrgPost, reason: OrgReportReason): Promise<void> {
  const me = requireMe();
  try {
    await pb!.collection('org_reports').create({
      post_id: post.id, org_id: post.orgId, target_user: post.userId, reporter: me, reason,
      text_copy: [...post.text].slice(0, 60).join(''),
    }, { requestKey: null });
  } catch (err) {
    if (Object.values(fieldCodes(err)).includes('validation_not_unique')) return;
    throw new OrgError(describeOrgError(err, '举报没发出去，稍后再试'));
  }
}

/** 发纪要：确定 id，两台设备同时发只会留一份——撞了（id 已存在）返回 null，调用方重新拉一次 */
export async function createMinutes(orgId: string, minutes: OrgMinutesSnapshot): Promise<OrgPost | null> {
  const me = requireMe();
  try {
    return mapPost(await pb!.collection('org_posts').create({
      id: minutesId(orgId, minutes.week), org: orgId, user: me, kind: 'minutes', text: '', snapshot: minutes, week_key: minutes.week,
    }, { requestKey: null }));
  } catch (err) {
    if (fieldCodes(err).id) return null;
    throw err;
  }
}

/** 周日会议：自评（这周立过目标才有）+ 下周目标，只写自己那一行 */
export async function saveMeeting(memberId: string, input: { week: string; result?: 'done' | 'partial' | 'missed'; goal: string; nextWeek: string }): Promise<OrgMember> {
  requireMe();
  const goal = clip(input.goal, ORG_GOAL_MAX);
  if (!goal) throw new OrgError('写一句下周目标');
  assertClean(goal);
  const body: Record<string, unknown> = { goal, goal_week: input.nextWeek };
  if (input.result) { body.result = input.result; body.result_week = input.week; }
  try {
    return mapMember(await pb!.collection('org_members').update(memberId, body, { requestKey: null }));
  } catch (err) {
    throw new OrgError(describeOrgError(err, '没存上，稍后再试'));
  }
}

/** 删掉某人在这个组织的动态和标签（退出时删自己的；请离时队长顺手删对方的）；尽力而为，失败只记日志 */
export async function deleteUserContent(orgId: string, userId: string): Promise<void> {
  try {
    const [posts, reactions] = await Promise.all([
      pb!.collection('org_posts').getFullList({ filter: `org = ${pbQuote(orgId)} && user = ${pbQuote(userId)} && kind = "moment"`, requestKey: null }),
      pb!.collection('org_reactions').getFullList({ filter: `org = ${pbQuote(orgId)} && user = ${pbQuote(userId)}`, requestKey: null }),
    ]);
    for (const r of reactions) {
      try { await pb!.collection('org_reactions').delete(r.id, { requestKey: null }); } catch (e) { console.warn('[velvet-org] delete reaction failed', r.id, e); }
    }
    for (const p of posts) {
      try { await pb!.collection('org_posts').delete(p.id, { requestKey: null }); } catch (e) { console.warn('[velvet-org] delete post failed', p.id, e); }
    }
  } catch (err) {
    console.warn('[velvet-org] list content to delete failed', orgId, userId, err);
  }
}
