/**
 * 「组织」视图（和「同伴」平级，在羁绊页点标题切过来）里的零件：
 *   · OrgNoticeBar：本机提示（被请离 / 解散 / 在别的设备退出），点「知道了」清掉；
 *   · OrgLoginPrompt：没登录时的一句话 + 去登录；
 *   · OrgEmptyPanel：还没有组织时的说明 + 「建立组织」「输入邀请码」；
 *   · OrgSwitcher：加入了两个组织时并排两枚，点哪个看哪个（有新动静的亮点、会议日挂小签）；
 *   · SlotLinks：只占了一个名额时底下一行「还可以 建立一个组织 · 加入一个组织」；
 *   · LeaderChip / MeetingDayChip：队长小签、会议日小签。
 */
import { AnimatePresence, motion } from 'motion/react';
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
