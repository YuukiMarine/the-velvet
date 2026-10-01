/**
 * 「组织」视图（和「同伴」平级，在羁绊页点标题切过来）里的零件：
 *   · OrgNoticeBar：本机提示（被请离 / 解散 / 在别的设备退出），点「知道了」清掉；
 *   · OrgLoginPrompt：没登录时的一句话 + 去登录；
 *   · OrgEmptyPanel：还没有组织时的说明 + 「建立组织」「输入邀请码」；
 *   · OrgSwitcher：加入了两个组织时并排两枚，点哪个看哪个（有新动静的亮点、会议日挂小签）；
 *   · SlotLinks：只占了一个名额时底下一行「还可以 建立一个组织 · 加入一个组织」；
 *   · LeaderChip / MeetingDayChip：队长小签、会议日小签；
 *   · OrgLevelLine（第 8 轮）：组织名下面一行「据点 Lv.3」+ 到下一级的进度 + 同调（借面具）系数，点开说明经验怎么来。
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ORG_XP_MEETING, ORG_XP_OPS_PER_WEEK, ORG_XP_OP_BIG, ORG_XP_OP_SMALL, orgLevelOfView } from '@/utils/orgOps';
import { RAID_XP_PER_HITTER } from '@/utils/orgRaid';
import { orgLevelName } from '@/utils/orgTitles';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { EmblemBadge, OrgButton, OrgPanel, useOrgTone, type OrgTone } from './orgUi';
import type { OrgView } from '@/types';

export function OrgNoticeBar() {
  const tone = useOrgTone();
  const notice = useCloudSocialStore(s => s.orgNotice);
  const setNotice = useCloudSocialStore(s => s.setOrgNotice);
  return (
    <AnimatePresence initial={false}>
      {notice && (
        <motion.div key="notice" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <OrgPanel padded={false} seed={11} className="px-3.5 py-2.5">
            <div className="flex items-start gap-2 text-[12px] font-bold leading-relaxed">
              <span className="min-w-0 flex-1">{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="shrink-0 font-black" style={{ color: tone.channel === 'p5' ? P5R.red : tone.accent }}>知道了</button>
            </div>
          </OrgPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function OrgLoginPrompt({ onLogin }: { onLogin: () => void }) {
  const tone = useOrgTone();
  return (
    <OrgPanel seed={7}>
      <div className="text-[15px] font-black" style={{ fontFamily: tone.titleFont }}>登录之后才能用组织</div>
      <div className="mt-1 text-[12px] font-semibold leading-relaxed" style={{ color: tone.sub }}>和几个朋友建一个据点：名册、公告板、周日会议，最多 7 人。组织放在云端，要先登录账号。</div>
      <div className="mt-3"><OrgButton small onClick={onLogin}>去登录</OrgButton></div>
    </OrgPanel>
  );
}

export function OrgEmptyPanel({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  const tone = useOrgTone();
  return (
    <OrgPanel seed={7}>
      <div className="flex items-baseline gap-2">
        <span className="text-[17px] font-black leading-none" style={{ fontFamily: tone.titleFont }}>还没有组织</span>
        <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: tone.channel === 'p5' ? P5R.red : tone.accent }}>HIDEOUT</span>
      </div>
      <div className="mt-1.5 text-[12px] font-semibold leading-relaxed" style={{ color: tone.sub }}>
        和几个朋友建一个据点：名册上挂着大家的代表牌，公告板上互相打气，每周日开个小会写下周目标。最多 7 人；每人最多自建一个、加入一个。
      </div>
      <div className="mt-3 flex gap-2.5">
        <OrgButton small onClick={onCreate}>建立组织</OrgButton>
        <OrgButton small tone="ghost" onClick={onJoin}>输入邀请码</OrgButton>
      </div>
    </OrgPanel>
  );
}

export function OrgSwitcher({ orgs, current, dots, onPick }: { orgs: OrgView[]; current: string; dots: Record<string, boolean>; onPick: (orgId: string) => void }) {
  const tone = useOrgTone();
  return (
    <div role="tablist" aria-label="我的组织" className="grid grid-cols-2 gap-2.5">
      {orgs.map((v, i) => {
        const on = v.org.id === current;
        const skin = tone.channel === 'p3'
          ? { background: on ? P3R.blue : P3R.panelGlass, color: on ? '#ffffff' : P3R.ink, clipPath: slantClip(8) }
          : tone.channel === 'p4'
            ? { background: on ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-paper, #fff6d0)', color: on ? '#131313' : 'var(--ui-ink, #131313)', borderRadius: 14, boxShadow: '0 0 0 2px var(--ui-line, #131313)' }
            : tone.channel === 'p5'
              ? { color: on ? P5R.white : P5R.ink, fontFamily: P5_TITLE_FONT }
              : { background: on ? tone.accent : tone.paper, color: on ? '#ffffff' : tone.ink, borderRadius: 14, boxShadow: on ? undefined : `0 0 0 1px ${tone.line}` };
        return (
          <button key={v.org.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(v.org.id)} className="relative flex min-w-0 items-center gap-2 px-2.5 py-2 text-left" style={skin}>
            {tone.channel === 'p5' && <span aria-hidden className="absolute inset-0" style={{ background: on ? P5R.red : P5R.paper, clipPath: roughQuad(i + 2.7, 3) }} />}
            <span className="relative"><EmblemBadge id={v.org.emblem} size={26} /></span>
            <span className="relative min-w-0 flex-1">
              <span className="block truncate text-[13px] font-black leading-tight">{v.org.name}</span>
              <span className="block text-[10px] font-bold opacity-75">{v.me.slot === 'own' ? '我建的' : '我加入的'} · {v.members.length} / 7</span>
            </span>
            {dots[v.org.id] && <span aria-hidden className="relative h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone.channel === 'p5' ? (on ? P5R.white : P5R.red) : tone.channel === 'p3' ? P3R.magenta : '#f43f5e' }} />}
          </button>
        );
      })}
    </div>
  );
}

export function SlotLinks({ orgs, onCreate, onJoin }: { orgs: OrgView[]; onCreate: () => void; onJoin: () => void }) {
  const tone = useOrgTone();
  const ownFree = !orgs.some(v => v.me.slot === 'own');
  const joinFree = !orgs.some(v => v.me.slot === 'joined');
  if (!ownFree && !joinFree) return null;
  const link = { color: tone.channel === 'p5' ? P5R.white : tone.accent };
  return (
    <div className="flex items-center justify-center gap-3 text-[11px] font-black" style={{ color: tone.stageSub }}>
      <span>还可以</span>
      {ownFree && <button type="button" onClick={onCreate} style={link}>建立一个组织</button>}
      {ownFree && joinFree && <span aria-hidden>·</span>}
      {joinFree && <button type="button" onClick={onJoin} style={link}>加入一个组织</button>}
    </div>
  );
}

/** 「会议日」小签：周日全天到周一凌晨 4 点；写完了挂个勾 */
export function MeetingDayChip({ tone, done }: { tone: OrgTone; done: boolean }) {
  const text = done ? '会议日 ✓' : '会议日';
  if (tone.channel === 'p3') return <span className="shrink-0 whitespace-nowrap px-1.5 py-[2px] text-[9px] font-black text-white" style={{ background: done ? P3R.blue : P3R.magenta, clipPath: slantClip(4) }}>{text}</span>;
  if (tone.channel === 'p4') return <span className="shrink-0 whitespace-nowrap rounded-full px-2 py-[2px] text-[9px] font-black text-[#131313]" style={{ background: 'var(--p4-orange, #f9a11b)', boxShadow: '0 0 0 1.5px #131313' }}>{text}</span>;
  if (tone.channel === 'p5') return <span className="shrink-0 whitespace-nowrap px-1.5 py-[2px] text-[9px] font-black" style={{ background: done ? P5R.ink : P5R.red, color: P5R.white, clipPath: roughQuad(3.7, 2), fontFamily: P5_TITLE_FONT }}>{text}</span>;
  return <span className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9px] font-black text-white" style={{ background: done ? 'var(--ui-accent, #6366f1)' : '#f43f5e' }}>{text}</span>;
}

export function LeaderChip() {
  const tone = useOrgTone();
  if (tone.channel === 'p3') return <span className="shrink-0 px-1.5 py-[2px] text-[9px] font-black tracking-wider text-white" style={{ background: P3R.magenta, clipPath: slantClip(4) }}>LEADER</span>;
  if (tone.channel === 'p4') return <span className="shrink-0 rounded-full bg-[#131313] px-2 py-[2px] text-[9px] font-black text-[#fff6d0]">队长</span>;
  if (tone.channel === 'p5') return <span className="shrink-0 px-1.5 py-[2px] text-[9px] font-black text-white" style={{ background: P5R.red, clipPath: roughQuad(4.2, 2), fontFamily: P5_TITLE_FONT }}>LEADER</span>;
  return <span className="shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-black" style={{ background: 'rgba(99,102,241,0.12)', color: tone.accent }}>队长</span>;
}

/** 据点等级（第 8 轮 · PRD §13.4）：经验流水没拉到时不显示；组织 P2 起写等级的名字（队长可以改） */
export function OrgLevelLine({ view }: { view: OrgView }) {
  const tone = useOrgTone();
  const [open, setOpen] = useState(false);
  if (!view.ledger) return null;
  const lv = orgLevelOfView(view);
  const name = orgLevelName(view.org.custom, lv.level);
  const pct = lv.next ? Math.max(0, Math.min(1, (lv.xp - lv.floor) / (lv.next - lv.floor))) : 1;
  const badge = tone.channel === 'p3'
    ? { background: P3R.blue, color: '#ffffff', clipPath: slantClip(4) }
    : tone.channel === 'p5'
      ? { background: P5R.red, color: P5R.white, clipPath: roughQuad(lv.level + 2.3, 1.5), fontFamily: P5_TITLE_FONT }
      : tone.channel === 'p4'
        ? { background: '#131313', color: '#fff6d0', borderRadius: 999 }
        : { background: 'var(--ui-accent, #6366f1)', color: '#ffffff', borderRadius: 999 };
  const track = tone.channel === 'p5' ? 'rgba(240,233,223,0.22)' : tone.channel === 'p4' ? 'rgba(19,19,19,0.14)' : 'rgba(127,127,127,0.2)';
  const fill = tone.channel === 'p3' ? P3R.blue : tone.channel === 'p5' ? P5R.red : tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-accent, #6366f1)';
  return (
    <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={`据点 Lv.${lv.level} ${name}，${lv.next ? `离 Lv.${lv.level + 1} 还差 ${lv.next - lv.xp}` : '已经满级'}，同调威力 ×${lv.mult.toFixed(1)}`} className="mt-2.5 block w-full text-left">
      <span className="flex items-center gap-2">
        <span className="inline-flex shrink-0 items-center whitespace-nowrap px-2 py-[3px] text-[11px] font-black leading-none" style={badge}>据点 Lv.{lv.level}<span className="ml-1 font-bold opacity-90">· {name}</span></span>
        <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: track }}>
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: fill }} />
        </span>
        <span className="shrink-0 text-[11px] font-black tabular-nums" style={{ color: tone.stageSub }}>{lv.next ? `${lv.xp} / ${lv.next}` : 'MAX'}</span>
      </span>
      <span className="mt-1 block text-[11px] font-bold" style={{ color: tone.stageSub }}>
        同调威力 ×{lv.mult.toFixed(1)}{lv.next ? ` · 离 Lv.${lv.level + 1} 还差 ${lv.next - lv.xp}` : ' · 已经满级'} <span aria-hidden>{open ? '▴' : '▾'}</span>
      </span>
      {open && (
        <span className="mt-1 block text-[11px] font-semibold leading-relaxed" style={{ color: tone.stageSub }}>
          经验怎么来：周日会议上每个写了下周目标的人 +{ORG_XP_MEETING}；每个达成的目标或作战，每个参与者 +{ORG_XP_OP_SMALL}（作战 +{ORG_XP_OP_BIG}），每周最多算 {ORG_XP_OPS_PER_WEEK} 个；满月团战击退暗影，每个出过手的人 +{RAID_XP_PER_HITTER}。等级越高，队友同调走的面具在战场上越强（Lv.6 ×1.5），地图上的据点也会一点点长起来。
        </span>
      )}
    </button>
  );
}
