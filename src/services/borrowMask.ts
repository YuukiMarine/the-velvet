/**
 * 借面具（v2.7.0.6 第 8 轮 · PRD §13.5）的本机动作：借走 / 记一场。
 * 借来的面具只存在自己的战场状态里（BattleState.borrow），服务器上不多写任何东西；战场状态整行同步，换设备也在。
 */
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { weekKeyOf } from '@/battle/tower';
import { borrowNow, sanitizePersona } from '@/utils/orgBorrow';
import { orgLevelOfView } from '@/utils/orgOps';
import { displayCodename } from '@/utils/orgLogic';
import type { BattleState, OrgMember, OrgPersonaSnapshot, OrgView } from '@/types';

export class BorrowError extends Error {}

/** 借走一张（替换本周借着的那张；场数不清零——换着借也还是每周 3 场） */
export async function borrowMaskFromUi(view: OrgView, member: OrgMember, persona: OrgPersonaSnapshot): Promise<void> {
  const st = useAppStore.getState();
  const bs = st.battleState;
  if (!bs) throw new BorrowError('先去逆影战场唤醒你自己的人格面具，才能同调别人的');
  if (member.userId === view.me.userId) throw new BorrowError('这是你自己的面具');
  const clean = sanitizePersona(persona);
  if (!clean || !clean.skills.length) throw new BorrowError('这张面具还没有能用的技能');
  const now = new Date();
  const cur = borrowNow(bs, now);
  const next: BattleState = {
    ...bs,
    borrow: {
      weekKey: cur.weekKey,
      battles: cur.battles,
      mask: {
        orgId: view.org.id,
        orgName: view.org.name,
        ownerId: member.userId,
        ownerCodename: displayCodename(member),
        persona: clean,
        mult: orgLevelOfView(view).mult,
        at: now.toISOString(),
      },
    },
  };
  await st.saveBattleState(next);
}

/** 这一场第一次用借来的技能：本周场数 +1（读最新的战场状态再写，别把刚发的 SP 吞掉） */
export async function markBorrowBattle(now = new Date()): Promise<void> {
  const st = useAppStore.getState();
  const bs = st.battleState;
  if (!bs) return;
  const wk = weekKeyOf(now);
  const cur = bs.borrow?.weekKey === wk ? bs.borrow : { weekKey: wk, battles: 0 };
  await st.saveBattleState({ ...bs, borrow: { ...cur, battles: (cur.battles ?? 0) + 1 } });
}

/** 出战时用的系数：组织还在本机就按现在的据点等级算，不在了（退出 / 解散）就用借的时候记下的 */
export function borrowMultNow(orgId: string, fallback: number): number {
  const v = useCloudSocialStore.getState().orgs.find(x => x.org.id === orgId);
  return v?.ledger ? orgLevelOfView(v).mult : fallback;
}
