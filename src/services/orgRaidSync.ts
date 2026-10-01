/**
 * orgRaidSync —— 满月团战（组织 P2 · PRD §17）的本机对账与界面动作，挂在 orgSync 的整轮对账里。
 *   · 拉这个组织全部的团战 + 出手（经验、称号、战报都从这里现算）；表还没建 / 离线 → raidsFailed，地图上不升月亮；
 *   · 三晚窗口里、这次满月还没开团 → 用确定 id 开团（首领 + 血量按这一刻的名册定，之后不变；两人同时开只留一条）；
 *   · 出手 / 总攻击：先拉一次最新的（别人刚打过、已经击退），再按规则算伤害写一条；撞了唯一索引 = 另一台设备打过了；
 *     出手按那一招的 SP 扣（普攻不扣）：先看够不够，写成功了才扣，另一台设备打过的不扣；
 *   · 击退了、我出过手 → 领奖（开团时据点 Lv.1 25 SP、每级 +5，岁时册印记；领过的记在战场状态里，换设备也不重复），弹一次庆祝卡。
 */
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { db } from '@/db';
import { getUserId } from './pocketbase';
import { OrgError, createRaid, createRaidHit, listOrgRaids } from './orgs';
import {
  allOutDamage, avgLvOf, buildRaidBoss, fullMoonDayOf, myRaidOptions, raidHpOf, raidId, raidNow, raidSpOf, raidStateOf, strikeDamage,
} from '@/utils/orgRaid';
import { orgLevelOfView } from '@/utils/orgOps';
import type { AttributeId, OrgRaid, OrgRaidHit, OrgView } from '@/types';

const social = () => useCloudSocialStore.getState();
const viewNow = (orgId: string): OrgView | undefined => social().orgs.find(v => v.org.id === orgId);
const putView = (v: OrgView) => social().upsertOrgView(v);

const readJson = <T,>(key: string, fallback: T): T => {
  try { return (JSON.parse(localStorage.getItem(key) || 'null') as T) ?? fallback; } catch { return fallback; }
};
const writeJson = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 存不下就算了 */ }
};

// ── 拉取 / 开团 ───────────────────────────────────────────────────────────────

/** 拉团战 + 出手；失败就沿用本机已有的（没有就标「没拉到」，地图上不升月亮） */
export async function withRaids(view: OrgView): Promise<OrgView> {
  const prev = viewNow(view.org.id);
  try {
    const { raids, hits } = await listOrgRaids(view.org.id);
    return { ...view, raids, raidHits: hits, raidsFailed: false };
  } catch (err) {
    console.warn('[velvet-org] list raids failed', view.org.id, err);
    return prev?.raids ? { ...view, raids: prev.raids, raidHits: prev.raidHits, raidsFailed: false } : { ...view, raids: undefined, raidHits: undefined, raidsFailed: true };
  }
}

/** 三晚窗口里（白天也算）、这次满月还没开团 → 开团 */
export async function ensureRaid(view: OrgView, now = new Date()): Promise<OrgView> {
  if (!view.raids || view.raidsFailed) return view;
  const rn = raidNow(now, view.org.tz);
  if (rn.phase !== 'open' || view.raids.some(r => r.slot === rn.slot)) return view;
  try {
    // 首领和血量按这一刻的名册和据点等级定（记进 boss.lv，击退奖励也按它）
    const lv = orgLevelOfView(view).level;
    const raid = await createRaid(view.org.id, raidId(view.org.id, rn.slot), rn.slot, buildRaidBoss(view.org.id, rn.slot, view.members, lv), raidHpOf(view.members, lv));
    return { ...view, raids: [...view.raids.filter(r => r.id !== raid.id && r.slot !== raid.slot), raid].sort((a, b) => a.slot - b.slot) };
  } catch (err) {
    console.warn('[velvet-org] open raid failed', view.org.id, err);
    return view;
  }
}

// ── 领奖 ─────────────────────────────────────────────────────────────────────

const WIN_KEY = 'velvet.orgRaidWins.v1';

/** 击退了、我出过手：+SP（按开团时的据点等级）和岁时册印记，弹一次庆祝卡（每场一次；换设备不重复领、不重复弹） */
export async function claimRaidRewards(view: OrgView): Promise<void> {
  const me = getUserId();
  if (!me || !view.raids) return;
  for (const raid of view.raids) {
    const s = raidStateOf(raid, view.raidHits, view.org.tz);
    if (!s.defeated || !s.stats.has(me)) continue;
    const st = useAppStore.getState();
    const bs = st.battleState;
    let sp = 0;
    const reward = raidSpOf(raid.boss.lv ?? 1);
    if (bs && !(bs.orgRaidRewards ?? []).includes(raid.id)) {
      await st.saveBattleState({
        ...bs,
        sp: bs.sp + reward,
        totalSpEarned: bs.totalSpEarned + reward,
        orgRaidRewards: [...(bs.orgRaidRewards ?? []), raid.id].slice(-100),
      });
      sp = reward;
    }
    // 岁时册：满月那天一枚（两个组织都击退也只一枚）
    const day = fullMoonDayOf(raid.slot, view.org.tz);
    try {
      if (!(await db.stamps.get(`${day}-raid`))) {
        await db.stamps.put({ id: `${day}-raid`, kind: 'raid', name: raid.boss.name, date: day, year: Number(day.slice(0, 4)), collectedAt: new Date().toISOString() });
      }
    } catch (err) {
      console.warn('[velvet-org] raid stamp failed', raid.id, err);
    }
    const all = readJson<Record<string, string[]>>(WIN_KEY, {});
    const seen = new Set(all[me] ?? []);
    if (seen.has(raid.id) || (!sp && bs)) continue;
    all[me] = [...seen, raid.id].slice(-50);
    writeJson(WIN_KEY, all);
    social().pushOrgCelebration({ kind: 'raid', raidId: raid.id, orgId: view.org.id, orgName: view.org.name, boss: raid.boss.name, sp, finisher: s.finisher === me, hitters: s.hitters.length });
  }
}

/** 整轮对账 / 刷新里：开团、领奖 */
export async function reconcileRaids(view0: OrgView): Promise<OrgView> {
  const view = await ensureRaid(view0);
  try {
    await claimRaidRewards(view);
  } catch (err) {
    console.warn('[velvet-org] claim raid failed', view.org.id, err);
  }
  return view;
}

// ── 界面动作 ─────────────────────────────────────────────────────────────────

export async function refreshRaids(orgId: string): Promise<void> {
  const v = viewNow(orgId);
  if (!v) return;
  putView(await reconcileRaids(await withRaids(v)));
}

export interface RaidHitResult {
  hit: OrgRaidHit;
  /** 这一下花掉的 SP（另一台设备打过的、普攻、总攻击都是 0） */
  spent: number;
  /** 另一台设备这一晚已经打过了：读回来的是那一条 */
  dup: boolean;
  damage: number;
  isWeak: boolean;
  fullMoon: boolean;
  defeated: boolean;
  /** 这一下打出了最后一击 */
  finisher: boolean;
}

/** 出手前：拉一次最新的（别人刚打过 / 已经击退），找到这次满月的团战，按规则判断能不能打 */
async function freshRaid(orgId: string): Promise<{ view: OrgView; raid: OrgRaid }> {
  const v0 = viewNow(orgId);
  if (!v0) throw new OrgError('找不到这个组织了');
  const view = await reconcileRaids(await withRaids(v0));
  putView(view);
  if (view.raidsFailed) throw new OrgError('团战暂时拉不到，稍后再试');
  const rn = raidNow(new Date(), view.org.tz);
  const raid = view.raids?.find(r => r.slot === rn.slot);
  if (!raid || rn.phase !== 'open') throw new OrgError(rn.phase === 'after' ? '这次团战已经结束了' : '团战还没开始');
  return { view, raid };
}

const afterHit = async (orgId: string, view: OrgView, raid: OrgRaid, hit: OrgRaidHit, dup: boolean, me: string, extra: { isWeak: boolean; fullMoon: boolean; spent: number }): Promise<RaidHitResult> => {
  const next = { ...(viewNow(orgId) ?? view), raidHits: [...((viewNow(orgId) ?? view).raidHits ?? []).filter(h => h.id !== hit.id), hit] };
  putView(next);
  const s = raidStateOf(raid, next.raidHits, next.org.tz);
  await claimRaidRewards(next);
  return { hit, dup, damage: hit.damage, ...extra, defeated: s.defeated, finisher: !dup && s.finisher === me && s.defeatedAt?.getTime() === hit.createdAt.getTime() };
};

/** 出手：选的那一招（普攻 spCost = 0）；先看 SP 够不够，伤害按规则算好再写，写成功了扣 SP */
export async function strikeFromUi(orgId: string, pick: { attr: AttributeId | null; power: number; plus: number; skill: string; spCost?: number }): Promise<RaidHitResult> {
  const me = getUserId();
  if (!me) throw new OrgError('要先登录');
  const cost = Math.max(0, Math.round(pick.spCost ?? 0));
  if (cost > 0 && (useAppStore.getState().battleState?.sp ?? 0) < cost) throw new OrgError(`SP 不够：这一招要 ${cost} SP`);
  const { view, raid } = await freshRaid(orgId);
  const rn = raidNow(new Date(), view.org.tz);
  const opt = myRaidOptions(raidStateOf(raid, view.raidHits, view.org.tz), me, rn, view.members.length);
  if (!opt.canStrike) {
    throw new OrgError(raidStateOf(raid, view.raidHits, view.org.tz).defeated ? '暗影已经击退了' : opt.struckTonight ? '今晚已经出过手了，明晚再来' : '白天不能出手，18:00 再来');
  }
  const d = strikeDamage({ power: pick.power, plus: pick.plus, attr: pick.attr, weak: raid.boss.weak, night: rn.night!, nights: rn.nights });
  const { hit, dup } = await createRaidHit(raid, { kind: 'strike', night: rn.night!, attr: pick.attr ?? undefined, skill: pick.skill, damage: d.damage, weak: d.isWeak });
  // 写成功了才扣；撞了（另一台设备这一晚已经打过）不扣
  let spent = 0;
  const bs = useAppStore.getState().battleState;
  if (!dup && cost > 0 && bs) {
    await useAppStore.getState().saveBattleState({ ...bs, sp: Math.max(0, bs.sp - cost) });
    spent = cost;
  }
  return afterHit(orgId, view, raid, hit, dup, me, { isWeak: d.isWeak, fullMoon: d.fullMoon, spent });
}

/** 总攻击：全队出手满门槛、我出过手、这次满月还没用过 */
export async function allOutFromUi(orgId: string): Promise<RaidHitResult> {
  const me = getUserId();
  if (!me) throw new OrgError('要先登录');
  const { view, raid } = await freshRaid(orgId);
  const rn = raidNow(new Date(), view.org.tz);
  const s = raidStateOf(raid, view.raidHits, view.org.tz);
  const opt = myRaidOptions(s, me, rn, view.members.length);
  if (!opt.canAllOut) {
    throw new OrgError(s.defeated ? '暗影已经击退了' : opt.allOutUsed ? '这次满月的总攻击你已经用过了' : !s.stats.has(me) ? '先出一次手，才能发动总攻击' : `全队再出手 ${opt.allOutNeed} 次才能总攻击`);
  }
  const damage = allOutDamage(avgLvOf(view.members), s.strikes);
  const { hit, dup } = await createRaidHit(raid, { kind: 'allout', night: 'allout', skill: '总攻击', damage, weak: false });
  return afterHit(orgId, view, raid, hit, dup, me, { isWeak: false, fullMoon: false, spent: 0 });
}
