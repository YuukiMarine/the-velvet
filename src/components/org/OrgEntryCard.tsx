/**
 * 羁绊页上的组织入口（第 7 轮 · PRD §12.4）：放在过滤条上方。
 *   · 没加入：一行说明 + 「建立组织」「输入邀请码」；
 *   · 加入了：每个组织一张卡（徽记 / 名字 / 口号 / 座位点），点进据点；只占了一个名额时下面给一行「还可以…」；
 *     公告板有新动态 / 会议日还没写时徽记上亮红点，周日（到周一凌晨 4 点）挂「会议日」角标（7b）；
 *     点进去直接打开有新东西的那一区；
 *   · 未登录：一行提示，点了去账号页。
 * 本机提示（被请离 / 解散）挂在最上面，点「知道了」清掉。
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { cloudEnabled } from '@/services/pocketbase';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { P4Sparkle } from '@/ui/p4Kit';
import { boardUnread, meetingPending, meetingState } from '@/utils/orgLogic';
import { EmblemBadge, OrgButton, OrgPanel, SeatDots, useOrgTone, type OrgTone } from './orgUi';
import { OrgOnboardingSheet, type OnboardingMode } from './OrgOnboardingSheet';
import type { OrgView } from '@/types';

export function OrgEntryCard() {
  const tone = useOrgTone();
  const cloudUser = useCloudStore(s => s.cloudUser);
  const { orgs, orgsLoaded, orgNotice, orgSeen, orgBlocked, setOrgNotice, setHideoutOrgId, setHideoutSection } = useCloudSocialStore(useShallow(s => ({
    orgs: s.orgs, orgsLoaded: s.orgsLoaded, orgNotice: s.orgNotice, orgSeen: s.orgSeen, orgBlocked: s.orgBlocked,
    setOrgNotice: s.setOrgNotice, setHideoutOrgId: s.setHideoutOrgId, setHideoutSection: s.setHideoutSection,
  })));
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const [mode, setMode] = useState<OnboardingMode | null>(null);
  const blocked = useMemo(() => new Set(orgBlocked), [orgBlocked]);

  if (!cloudEnabled) return null;

  const open = (orgId: string, section: 'board' | 'meeting' | null = null) => {
    setHideoutOrgId(orgId);
    setHideoutSection(section);
    setCurrentPage('hideout');
  };

  if (!cloudUser) {
    return (
      <button type="button" onClick={() => setCurrentPage('account')} className="flex w-full items-center gap-2 text-left text-[12px] font-bold" style={{ color: tone.stageSub }}>
        <span className="shrink-0 font-black" style={{ color: tone.stageInk, fontFamily: tone.titleFont }}>组织</span>
        <span className="min-w-0 flex-1 truncate">登录后可以和朋友建立或加入一个组织</span>
        <span aria-hidden>›</span>
      </button>
    );
  }

  const ownFree = !orgs.some(v => v.me.slot === 'own');
  const joinFree = !orgs.some(v => v.me.slot === 'joined');

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {orgNotice && (
          <motion.div
            key="notice"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <OrgPanel padded={false} seed={11} className="px-3.5 py-2.5">
              <div className="flex items-start gap-2 text-[12px] font-bold leading-relaxed">
                <span className="min-w-0 flex-1">{orgNotice}</span>
                <button type="button" onClick={() => setOrgNotice(null)} className="shrink-0 font-black" style={{ color: tone.accent }}>知道了</button>
              </div>
            </OrgPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {orgs.length === 0 ? (
        orgsLoaded && (
          <OrgPanel padded={false} seed={7} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[16px] font-black leading-none" style={{ fontFamily: tone.titleFont }}>组织</span>
                  <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: tone.accent }}>HIDEOUT</span>
                </div>
                <div className="mt-1 text-[11px] font-semibold leading-snug" style={{ color: tone.sub }}>和几个朋友建一个据点：名册、公告板、周日会议，最多 7 人</div>
              </div>
            </div>
            <div className="mt-2.5 flex gap-2.5">
              <OrgButton small onClick={() => setMode('create')}>建立组织</OrgButton>
              <OrgButton small tone="ghost" onClick={() => setMode('join')}>输入邀请码</OrgButton>
            </div>
          </OrgPanel>
        )
      ) : (
        <>
          {orgs.map((v, i) => {
            const unread = boardUnread(v, orgSeen[v.org.id], blocked);
            const pending = meetingPending(v);
            return <OrgBanner key={v.org.id} view={v} index={i} unread={unread} pending={pending} onOpen={() => open(v.org.id, pending ? 'meeting' : unread ? 'board' : null)} />;
          })}
          {(ownFree || joinFree) && (
            <div className="flex items-center justify-end gap-3 text-[11px] font-black" style={{ color: tone.stageSub }}>
              <span>还可以</span>
              {ownFree && <button type="button" onClick={() => setMode('create')} style={{ color: tone.channel === 'p5' ? P5R.white : tone.accent }}>建立一个组织</button>}
              {ownFree && joinFree && <span aria-hidden>·</span>}
              {joinFree && <button type="button" onClick={() => setMode('join')} style={{ color: tone.channel === 'p5' ? P5R.white : tone.accent }}>加入一个组织</button>}
            </div>
          )}
        </>
      )}

      <OrgOnboardingSheet
        mode={mode}
        onClose={() => setMode(null)}
        onDone={(orgId) => { setMode(null); open(orgId); }}
      />
    </div>
  );
}

/** 一个组织的横幅卡 */
function OrgBanner({ view, index, unread, pending, onOpen }: { view: OrgView; index: number; unread: boolean; pending: boolean; onOpen: () => void }) {
  const tone = useOrgTone();
  const { org, members, me } = view;
  const leader = org.leaderId === me.userId;
  const seats = members.map(m => m.seat);
  const needCard = !me.tarotId;
  const meetingDay = meetingState(new Date(), org.tz).open;

  const body = (
    <div className="flex items-center gap-3">
      <span className="relative shrink-0">
        <EmblemBadge id={org.emblem} size={46} />
        {(unread || pending) && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full" style={{ background: tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.magenta : '#f43f5e', boxShadow: `0 0 0 2px ${tone.channel === 'p5' ? P5R.paper : '#ffffff'}` }} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[17px] font-black leading-tight" style={{ fontFamily: tone.titleFont }}>{org.name}</span>
          {leader && <LeaderChip />}
        </div>
        {org.motto && <div className="mt-0.5 truncate text-[11px] font-semibold" style={{ color: tone.sub }}>{org.motto}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <SeatDots seats={seats} mine={me.seat} color={tone.channel === 'p4' ? 'var(--ui-ink, #131313)' : tone.accent} empty={tone.channel === 'p5' ? 'rgba(0,0,0,0.35)' : tone.line} />
          <span className="whitespace-nowrap text-[10px] font-black tabular-nums" style={{ color: tone.sub }}>{members.length} / 7</span>
          {meetingDay && <MeetingDayChip tone={tone} done={!pending} />}
          {unread && <span className="whitespace-nowrap text-[10px] font-black" style={{ color: tone.hot }}>· 有新动态</span>}
          {needCard && <span className="whitespace-nowrap text-[10px] font-black" style={{ color: tone.hot }}>· 还没选代表牌</span>}
        </div>
      </div>
      <span aria-hidden className="shrink-0 text-[22px] font-black leading-none" style={{ color: tone.channel === 'p4' ? 'var(--ui-ink, #131313)' : tone.accent }}>›</span>
    </div>
  );

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      className="block w-full text-left"
      aria-label={`进入据点：${org.name}${unread ? '，有新动态' : ''}${pending ? '，今天开会还没写目标' : ''}`}
    >
      {tone.channel === 'p3' ? (
        <div className="relative py-3 pl-5 pr-4" style={{ background: P3R.panelGlass, clipPath: slantClip(12), boxShadow: '0 10px 24px rgba(38,96,140,0.10)', color: tone.ink }}>
          <span aria-hidden className="absolute bottom-0 left-2 top-0 w-[5px]" style={{ background: P3R.blue, transform: 'skewX(-12deg)' }} />
          {body}
        </div>
      ) : tone.channel === 'p4' ? (
        <div className="relative px-4 py-3" style={{ background: tone.paper, borderRadius: 20, transform: `rotate(${index % 2 ? 0.6 : -0.6}deg)`, boxShadow: '0 0 0 2.5px var(--ui-line, #131313), 0 4px 0 2.5px rgba(19,19,19,0.22)', color: tone.ink }}>
          {body}
          <P4Sparkle size={14} color="var(--p4-orange, #f9a11b)" className="absolute -left-1.5 -top-1.5" />
        </div>
      ) : tone.channel === 'p5' ? (
        <OrgPanel padded={false} seed={21 + index} className="px-4 py-3">{body}</OrgPanel>
      ) : (
        <OrgPanel padded={false} className="px-4 py-3">{body}</OrgPanel>
      )}
    </motion.button>
  );
}

/** 「会议日」角标：周日全天到周一凌晨 4 点；写完了挂个勾 */
function MeetingDayChip({ tone, done }: { tone: OrgTone; done: boolean }) {
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
