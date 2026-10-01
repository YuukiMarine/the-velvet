/**
 * 羁绊的两个平级视图（第 7 轮验收）：同伴 ⇄ 组织。
 * 页面标题本身就是开关：点「同伴」切到组织，点「组织」切回同伴；标题旁一枚小签写着另一边，
 * 组织里有新动静（新动态 / 新标签 / 会议日还没写 / 被请离之类的提示）时小签亮红点。
 * 没配云端的构建不出现开关；登录了但组织还没拉到（包括线上还没建组织的表）时也先不出现。
 */
import { useMemo, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { cloudEnabled } from '@/services/pocketbase';
import { PageTitle } from '@/components/PageTitle';
import { P3PageHeader, P3R, slantClip } from '@/components/p3r/kit';
import { P5Collage, P5R, P5SubBar, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { boardUnread, meetingPending } from '@/utils/orgLogic';
import { useOrgTone } from './orgUi';

export type BondView = 'companions' | 'orgs';

/** 开关能不能用、要不要亮红点 */
export function useOrgSwitch(): { available: boolean; dot: boolean } {
  const signedIn = useCloudStore(s => !!s.cloudUser);
  const { orgs, orgsLoaded, orgNotice, orgSeen, orgBlocked } = useCloudSocialStore(useShallow(s => ({
    orgs: s.orgs, orgsLoaded: s.orgsLoaded, orgNotice: s.orgNotice, orgSeen: s.orgSeen, orgBlocked: s.orgBlocked,
  })));
  const blocked = useMemo(() => new Set(orgBlocked), [orgBlocked]);
  const available = cloudEnabled && (!signedIn || orgsLoaded);
  const dot = available && (!!orgNotice || orgs.some(v => boardUnread(v, orgSeen[v.org.id], blocked) || meetingPending(v)));
  return { available, dot };
}

/** 切到另一边。进组织时停在上次看的那个（没有就第一个），并直接打开有新东西的那一区 */
export function goBondView(to: BondView): void {
  const app = useAppStore.getState();
  if (to === 'companions') {
    app.setCurrentPage('cooperation');
    return;
  }
  const social = useCloudSocialStore.getState();
  const cur = social.orgs.find(v => v.org.id === social.hideoutOrgId) ?? social.orgs[0];
  if (cur) {
    const blocked = new Set(social.orgBlocked);
    social.setHideoutOrgId(cur.org.id);
    social.setHideoutSection(meetingPending(cur) ? 'meeting' : boardUnread(cur, social.orgSeen[cur.org.id], blocked) ? 'board' : null);
  }
  app.setCurrentPage('hideout');
}

/** 页面标题 + 切换小签（四频道各一套，和原来的页头同一个样子） */
export function BondTitle({ view }: { view: BondView }) {
  const tone = useOrgTone();
  const { available, dot } = useOrgSwitch();
  const orgs = view === 'orgs';
  const other = orgs ? (tone.channel === 'p5' ? '羁绊' : '同伴') : '组织';

  const title: ReactNode = tone.channel === 'p5' ? (
    <div className="min-w-0 pt-1">
      <P5Collage
        size={40}
        tiles={orgs
          ? [{ ch: '组', bg: P5R.red, fg: P5R.ink, scale: 1.05, rot: -3.5, dy: 0 }, { ch: '织', bg: P5R.paper, fg: P5R.ink, rot: 2.5, dy: 7 }]
          : [{ ch: '羁', bg: P5R.red, fg: P5R.ink, scale: 1.05, rot: -3.5, dy: 0 }, { ch: '绊', bg: P5R.paper, fg: P5R.ink, rot: 2.5, dy: 7 }]}
      />
      <div className="mt-2 pl-8">
        <P5SubBar segs={[{ t: orgs ? 'HIDEOUT' : 'COOPERATION' }]} star={false} rot={-1.2} className="!px-2.5 !py-0.5" />
      </div>
    </div>
  ) : tone.channel === 'p4' ? (
    <div>
      <h1 className="text-[50px] font-black leading-[1.02] tracking-tight text-[#131313]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>
        {orgs ? '组织' : '同伴'}
      </h1>
      <div className="mt-1 text-xs font-black tracking-[0.2em] text-[#131313]">
        {orgs ? 'HIDEOUT' : 'COOPERATION'} <span className="text-[var(--p4-orange,#f9a11b)]">FILE</span>
      </div>
    </div>
  ) : tone.channel === 'p3' ? (
    <P3PageHeader ticks title={orgs ? '组织' : '同伴'} className="pt-1" />
  ) : (
    <PageTitle title={orgs ? '组织' : '同伴'} en={orgs ? 'Hideout' : 'Cooperation'} enOffset={{ right: -32 }} />
  );

  if (!available) return <div className="min-w-0">{title}</div>;

  const go = () => goBondView(orgs ? 'companions' : 'orgs');
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}
      aria-label={`${orgs ? '组织' : '同伴'}：点一下切换到${other}${dot && !orgs ? '（组织里有新动静）' : ''}`}
      className="flex min-w-0 cursor-pointer items-center gap-2.5 outline-none"
    >
      {title}
      <SwitchChip label={other} dot={dot && !orgs} />
    </div>
  );
}

function SwitchChip({ label, dot }: { label: string; dot: boolean }) {
  const tone = useOrgTone();
  const text = <span className="whitespace-nowrap">⇄ {label}</span>;
  const dotEl = dot ? (
    <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full" style={{ background: tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.magenta : '#f43f5e', boxShadow: `0 0 0 2px ${tone.channel === 'p5' ? P5R.paper : '#ffffff'}` }} />
  ) : null;
  if (tone.channel === 'p3') {
    return (
      <span className="relative shrink-0">
        <span className="block px-2.5 py-1 text-[12px] font-black" style={{ background: P3R.cyanPale, color: P3R.blueDeep, clipPath: slantClip(6) }}>{text}</span>
        {dotEl}
      </span>
    );
  }
  if (tone.channel === 'p4') {
    return (
      <span className="relative shrink-0 rounded-full px-3 py-1 text-[12px] font-black" style={{ background: 'var(--ui-paper, #fff6d0)', color: 'var(--ui-ink, #131313)', boxShadow: '0 0 0 2px var(--ui-line, #131313)' }}>
        {text}
        {dotEl}
      </span>
    );
  }
  if (tone.channel === 'p5') {
    return (
      <span className="relative shrink-0 px-2.5 py-1 text-[12px] font-black" style={{ fontFamily: P5_TITLE_FONT }}>
        <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(label.length + 3.3, 2.5) }} />
        <span className="relative" style={{ color: P5R.ink }}>{text}</span>
        {dotEl}
      </span>
    );
  }
  return (
    <span className="relative shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-[12px] font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300">
      {text}
      {dotEl}
    </span>
  );
}
