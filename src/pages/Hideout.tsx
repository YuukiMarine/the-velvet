/**
 * 「组织」视图（第 7 轮 · PRD §12.4；验收后改成和「同伴」平级：在羁绊页点标题切过来，点「组织」标题切回去）。
 *   没登录 → 提示登录；还没有组织 → 建立 / 输入邀请码；加入了两个 → 顶上一条切换；
 *   每个组织：组织名 / 口号 / 人数 → 地图（三个地标即页签）→ 分区内容 → 邀请码。
 *   名册：成员牌按座位排，点一下放大翻面，「⋯」查看 / 屏蔽；空座位提示发邀请码。
 *   公告板（7b）：分享来的动态 + 标签，最新的会议纪要置顶；进公告板就算看过了（组织卡 / 地图红点熄灭）。
 *   会议（7b）：周日全天到周一凌晨 4 点开；其余时间看这周大家的目标和上一次纪要。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, SectionMark, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, P5CollageTitle, P5RPage, P5Slab, P5SubBar, roughQuad } from '@/components/p5r/kit';
import { P4SectionTitle, P4Sparkle } from '@/ui/p4Kit';
import { ActionSheet } from '@/components/ActionSheet';
import { FlipCardView } from '@/components/codex/FlipCardView';
import { HideoutMap, type HideoutSection } from '@/components/org/HideoutMap';
import { MemberCardBack, MemberCardFront, MemberTile } from '@/components/org/MemberCard';
import { BoardSection } from '@/components/org/BoardSection';
import { MeetingSection } from '@/components/org/MeetingSection';
import { OrgSettingsSheet } from '@/components/org/OrgSettingsSheet';
import { OrgOnboardingSheet } from '@/components/org/OrgOnboardingSheet';
import { BondTitle } from '@/components/org/BondTitle';
import { LeaderChip, MeetingDayChip, OrgEmptyPanel, OrgLoginPrompt, OrgNoticeBar, OrgSwitcher, SlotLinks } from '@/components/org/OrgHome';
import { OrgButton, OrgPanel, useOrgTone, type OrgTone } from '@/components/org/orgUi';
import { markBoardSeen, refreshBoard, refreshOrg, setMemberBlocked } from '@/services/orgSync';
import { boardUnread, displayCodename, formatInviteCode, latestMinutes, meetingPending, meetingState, tarotConflictLosers } from '@/utils/orgLogic';
import type { OrgMember, OrgView } from '@/types';

const SECTION_TITLE: Record<HideoutSection, { t: string; en: string }> = {
  roster: { t: '名册', en: 'MEMBERS' },
  board: { t: '公告板', en: 'BOARD' },
  meeting: { t: '会议', en: 'MEETING' },
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function shareInvite(view: OrgView): Promise<'shared' | 'copied' | 'failed'> {
  const text = `来「${view.org.name}」一起吧：打开靛蓝色房间 → 羁绊 → 点标题切到「组织」→ 输入邀请码 ${view.org.inviteCode}`;
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: `加入「${view.org.name}」`, text, dialogTitle: '把邀请码发给朋友' });
      return 'shared';
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: `加入「${view.org.name}」`, text });
      return 'shared';
    }
  } catch {
    // 用户取消分享面板也会走到这里：退回复制
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export function Hideout() {
  const channel = useUiChannel();
  const tone = useOrgTone();
  const signedIn = useCloudStore(s => !!s.cloudUser);
  const orgs = useCloudSocialStore(s => s.orgs);
  const orgsLoaded = useCloudSocialStore(s => s.orgsLoaded);
  const orgSeen = useCloudSocialStore(s => s.orgSeen);
  const orgId = useCloudSocialStore(s => s.hideoutOrgId);
  const blockedList = useCloudSocialStore(s => s.orgBlocked);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const view = orgs.find(v => v.org.id === orgId);
  const seenAt = orgId ? orgSeen[orgId] : undefined;
  // 从羁绊页切过来 / 分享完「去公告板看看」时，先打开有新东西的那一区（读一次就清掉）
  const [section, setSection] = useState<HideoutSection>(() => useCloudSocialStore.getState().hideoutSection ?? 'roster');
  useEffect(() => { useCloudSocialStore.getState().setHideoutSection(null); }, []);
  const [flip, setFlip] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<OrgMember | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [homeMode, setHomeMode] = useState<'create' | 'join' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState('');
  const blocked = useMemo(() => new Set(blockedList), [blockedList]);

  // 选着的组织不在了（退出 / 解散 / 被请离），或者还没选过 → 换成第一个（自建的排前面）
  useEffect(() => {
    if (orgs.length && !orgs.some(v => v.org.id === orgId)) useCloudSocialStore.getState().setHideoutOrgId(orgs[0].org.id);
  }, [orgs, orgId]);

  // 进页面 / 换组织时刷一次这个组织（别人刚加入 / 刚换了牌 / 新动态）
  useEffect(() => {
    if (!orgId) return;
    setRefreshing(true);
    void refreshOrg(orgId).finally(() => setRefreshing(false));
  }, [orgId]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  // 切到公告板时再拉一次（进页面那次 refreshOrg 已经带上了公告板，首屏不重复拉）
  const firstSection = useRef(true);
  useEffect(() => {
    if (firstSection.current) { firstSection.current = false; return; }
    if (section === 'board' && orgId) void refreshBoard(orgId);
  }, [section, orgId]);

  // 看着公告板就算看过了：新动态 / 新标签到了也跟着记一笔，红点不会在眼皮底下亮起来
  const posts = view?.posts;
  const reactions = view?.reactions;
  useEffect(() => {
    if (section === 'board' && orgId && posts) markBoardSeen(orgId);
  }, [section, orgId, posts, reactions]);

  // 两个组织时切换条上的红点
  const dots = useMemo(
    () => Object.fromEntries(orgs.map(v => [v.org.id, boardUnread(v, orgSeen[v.org.id], blocked) || meetingPending(v)])),
    [orgs, orgSeen, blocked],
  );

  const p3 = channel === 'p3';
  const p5 = channel === 'p5';
  const leader = !!view && view.org.leaderId === view.me.userId;
  const minutes = view ? latestMinutes(view) : null;
  const flipMember = view?.members.find(m => m.id === flip);

  const refresh = () => {
    if (refreshing || !orgId) return;
    setRefreshing(true);
    void refreshOrg(orgId).finally(() => setRefreshing(false));
  };

  const menuActions = (() => {
    const m = menuFor;
    if (!m || !view) return [];
    const list: Array<{ label: string; onClick: () => void; tone?: 'default' | 'danger' }> = [
      { label: '查看成员牌', onClick: () => setFlip(m.id) },
    ];
    if (m.id === view.me.id) {
      list.push({ label: '修改我的牌', onClick: () => setCardOpen(true) });
    } else {
      const isBlocked = blocked.has(m.userId);
      list.push({ label: isBlocked ? '解除屏蔽' : '屏蔽此人（只在本机生效）', onClick: () => { setMemberBlocked(m.userId, !isBlocked); setFlash(isBlocked ? '已解除屏蔽' : '已屏蔽，之后不再显示 Ta 的动态'); } });
      if (leader) list.push({ label: '转让队长 / 请离…', onClick: () => setSettingsOpen(true) });
    }
    return list;
  })();

  const body = (() => {
    if (!signedIn) return <OrgLoginPrompt onLogin={() => setCurrentPage('account')} />;
    if (!orgsLoaded) return <OrgPanel seed={9}><div className="text-[13px] font-bold" style={{ color: tone.sub }}>正在找你的组织…</div></OrgPanel>;
    if (!orgs.length) return <OrgEmptyPanel onCreate={() => setHomeMode('create')} onJoin={() => setHomeMode('join')} />;
    if (!view) return null;
    const { org, members, me } = view;
    const conflict = tarotConflictLosers(members).has(me.id);
    const empty = Math.max(0, 7 - members.length);
    return (
      <>
        <TitleBlock view={view} leader={leader} tone={tone} />

        {(conflict || !me.tarotId) && (
          <OrgPanel padded={false} seed={17} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 text-[12px] font-bold leading-relaxed">
                {conflict ? '你的代表牌和别人同时选中了同一张，先选的人留下了。重新选一张吧。' : '还没选代表牌：选一张，名册上才有你的牌面。'}
              </div>
              <OrgButton small onClick={() => setCardOpen(true)}>去选</OrgButton>
            </div>
          </OrgPanel>
        )}

        <HideoutMap view={view} section={section} onSection={setSection} blocked={blocked} dots={{ board: section !== 'board' && boardUnread(view, seenAt, blocked), meeting: meetingPending(view) }} />

        <SectionTitle tone={tone} section={section} meta={section === 'roster' ? `${members.length} / 7` : section === 'meeting' && !meetingState(new Date(), org.tz).open ? '每周日' : undefined} />

        {section === 'roster' ? (
          <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            {members.map(m => (
              <MemberTile key={m.id} view={view} member={m} minutes={minutes} blocked={blocked.has(m.userId)} onOpen={() => setFlip(m.id)} onMore={() => setMenuFor(m)} />
            ))}
            {empty > 0 && (
              <button
                type="button"
                onClick={async () => { const r = await shareInvite(view); setFlash(r === 'copied' ? '邀请语已复制，发给朋友吧' : r === 'failed' ? '没复制成，手动抄一下邀请码吧' : ''); }}
                className="flex min-h-[104px] flex-col items-center justify-center gap-1 text-center"
                style={{ border: `2px dashed ${channel === 'p5' ? 'rgba(240,233,223,0.45)' : tone.line}`, borderRadius: channel === 'p4' ? 16 : channel === 'neutral' ? 16 : 0, color: tone.stageSub }}
              >
                <span className="text-[20px] font-black leading-none">＋</span>
                <span className="text-[12px] font-black">还有 {empty} 个空座位</span>
                <span className="text-[10px] font-bold">点这里把邀请码发给朋友</span>
              </button>
            )}
          </div>
        ) : section === 'board' ? (
          <BoardSection view={view} blocked={blocked} onFlash={setFlash} />
        ) : (
          <MeetingSection view={view} blocked={blocked} onFlash={setFlash} />
        )}

        <InvitePanel view={view} tone={tone} onFlash={setFlash} />
      </>
    );
  })();

  return (
    <P3RPage active={p3}>
      <P5RPage active={p5}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`relative mx-auto max-w-2xl space-y-5 ${p5 ? 'p5-reskin p5-onink' : ''} ${channel === 'p4' ? 'p4-onbright' : ''}`}
        >
          {p5 && (
            <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-6 h-[170px]" style={{ zIndex: -1 }}>
              <P5Slab color={P5R.red} seed={431} rot={-9} style={{ right: -50, top: -24, width: 230, height: 130 }} />
            </div>
          )}

          {/* 页头：「组织」标题（点了切回同伴）+ 刷新 / 设置 */}
          <div className="flex items-center gap-2">
            <BondTitle view="orgs" />
            {view && (
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <HeaderIcon tone={tone} label={refreshing ? '刷新中' : '刷新'} onClick={refresh}>
                  <motion.span animate={refreshing ? { rotate: 360 } : { rotate: 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0 }} className="inline-block">↻</motion.span>
                </HeaderIcon>
                <HeaderIcon tone={tone} label="据点设置" onClick={() => setSettingsOpen(true)}>⚙</HeaderIcon>
              </div>
            )}
          </div>
          {p3 && (
            <div aria-hidden className="relative h-7">
              <GhostWords words={['HIDEOUT']} className="left-[6px] top-[-34px] text-[84px]" />
            </div>
          )}

          <OrgNoticeBar />
          {signedIn && orgs.length > 1 && orgId && <OrgSwitcher orgs={orgs} current={orgId} dots={dots} onPick={(id) => useCloudSocialStore.getState().setHideoutOrgId(id)} />}
          {body}
          {signedIn && orgs.length > 0 && <SlotLinks orgs={orgs} onCreate={() => setHomeMode('create')} onJoin={() => setHomeMode('join')} />}

          {flash && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="fixed inset-x-0 bottom-28 z-40 mx-auto w-fit max-w-[88vw] rounded-full bg-black/80 px-4 py-2 text-center text-[12px] font-bold text-white" role="status">
              {flash}
            </motion.div>
          )}
        </motion.div>

        {view && (
          <>
            <FlipCardView
              open={!!flipMember}
              onClose={() => setFlip(null)}
              label={flipMember ? `${displayCodename(flipMember)} 的成员牌` : '成员牌'}
              resetKey={flip ?? undefined}
              front={(w, h) => (flipMember ? <MemberCardFront view={view} member={flipMember} minutes={minutes} width={w} height={h} /> : null)}
              back={(w, h) => (flipMember ? <MemberCardBack view={view} member={flipMember} width={w} height={h} /> : null)}
            />
            <ActionSheet isOpen={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor ? displayCodename(menuFor) : undefined} actions={menuActions} />
          </>
        )}
        <OrgSettingsSheet
          view={view}
          open={settingsOpen && !!view}
          onClose={() => setSettingsOpen(false)}
          onEditCard={() => { setSettingsOpen(false); setCardOpen(true); }}
          // 退出 / 解散之后留在「组织」：还有别的组织就换过去，没有了就显示建立 / 加入
          onGone={() => setSettingsOpen(false)}
        />
        <OrgOnboardingSheet
          mode={cardOpen ? 'card' : homeMode}
          orgId={cardOpen ? view?.org.id : undefined}
          onClose={() => { setCardOpen(false); setHomeMode(null); }}
          onDone={(id) => {
            if (!cardOpen) useCloudSocialStore.getState().setHideoutOrgId(id);
            setCardOpen(false);
            setHomeMode(null);
          }}
        />
      </P5RPage>
    </P3RPage>
  );
}

function HeaderIcon({ tone, label, onClick, children }: { tone: OrgTone; label: string; onClick: () => void; children: ReactNode }) {
  const skin = tone.channel === 'p3'
    ? { background: P3R.cyanPale, color: P3R.blueDeep, clipPath: slantClip(6) }
    : tone.channel === 'p4'
      ? { background: 'var(--ui-paper, #fff6d0)', color: 'var(--ui-ink, #131313)', borderRadius: 12, boxShadow: '0 0 0 2px var(--ui-line, #131313)' }
      : tone.channel === 'p5'
        ? { background: P5R.paper, color: P5R.ink, clipPath: roughQuad(label.length + 0.4, 3) }
        : { borderRadius: 12 };
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`flex h-9 w-9 items-center justify-center text-[16px] font-black ${tone.channel === 'neutral' ? 'bg-black/5 text-gray-600 dark:bg-white/10 dark:text-gray-300' : ''}`} style={skin}>
      {children}
    </button>
  );
}

function TitleBlock({ view, leader, tone }: { view: OrgView; leader: boolean; tone: OrgTone }) {
  const { org, members, me } = view;
  const meetingDay = meetingState(new Date(), org.tz).open;
  const meta = (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black" style={{ color: tone.stageSub }}>
      <span className="tabular-nums">{members.length} / 7 人</span>
      <span aria-hidden>·</span>
      {leader ? <LeaderChip /> : <span>你是 {String(me.seat).padStart(2, '0')} 号成员</span>}
      {meetingDay && <MeetingDayChip tone={tone} done={!meetingPending(view)} />}
    </div>
  );
  if (tone.channel === 'p5') {
    return (
      <div className="relative">
        <P5CollageTitle text={org.name} size={26} />
        {org.motto && <div className="mt-3 pl-1"><P5SubBar segs={[{ t: org.motto }]} star={false} rot={-1.2} className="!px-2.5 !py-0.5" /></div>}
        {meta}
      </div>
    );
  }
  if (tone.channel === 'p4') {
    return (
      <div className="relative">
        <h2 className="text-[32px] font-black leading-[1.05] text-[#131313]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>{org.name}</h2>
        {org.motto && <div className="mt-1 text-[13px] font-bold text-[#131313]/70">「{org.motto}」</div>}
        <P4Sparkle size={18} color="var(--ui-accent)" className="absolute right-2 top-2" />
        {meta}
      </div>
    );
  }
  if (tone.channel === 'p3') {
    return (
      <div className="relative">
        <h2 className="relative text-[28px] font-black italic leading-tight tracking-tight" style={{ color: P3R.ink, fontFamily: '"Noto Sans SC Black", "Velvet Sans SC", sans-serif' }}>{org.name}</h2>
        {org.motto && <div className="relative mt-0.5 text-[13px] font-bold" style={{ color: P3R.inkSoft }}>{org.motto}</div>}
        {meta}
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-[26px] font-black leading-tight text-gray-900 dark:text-white">{org.name}</h2>
      {org.motto && <div className="mt-0.5 text-[13px] font-semibold text-gray-500 dark:text-gray-400">{org.motto}</div>}
      {meta}
    </div>
  );
}

function SectionTitle({ tone, section, meta }: { tone: OrgTone; section: HideoutSection; meta?: string }) {
  const s = SECTION_TITLE[section];
  if (tone.channel === 'p3') return <SectionMark title={s.t} meta={meta ? <span className="text-[13px] font-black italic" style={{ color: P3R.blue }}>{meta}</span> : undefined} />;
  if (tone.channel === 'p4') return <P4SectionTitle meta={meta ? <span className="text-[13px] font-black text-[#131313]">{meta}</span> : undefined}>{s.t}</P4SectionTitle>;
  if (tone.channel === 'p5') {
    return (
      <div className="flex items-center justify-between">
        <P5SubBar segs={[{ t: s.t }, { t: s.en }]} rot={-1} />
        {meta && <span className="text-[14px] font-black" style={{ color: P5R.white, fontFamily: P5_TITLE_FONT }}>{meta}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[17px] font-black text-gray-900 dark:text-white">{s.t} <span className="ml-1 text-[10px] font-bold tracking-[0.2em] text-gray-400">{s.en}</span></h2>
      {meta && <span className="text-[12px] font-black text-gray-500 dark:text-gray-400">{meta}</span>}
    </div>
  );
}

function InvitePanel({ view, tone, onFlash }: { view: OrgView; tone: OrgTone; onFlash: (s: string) => void }) {
  const code = view.org.inviteCode;
  return (
    <OrgPanel seed={33}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black tracking-[0.2em]" style={{ color: tone.sub }}>INVITE · 邀请码</div>
          <div className="mt-1 whitespace-nowrap font-mono text-[20px] font-black tracking-[0.18em] min-[380px]:text-[24px]" style={{ color: tone.channel === 'p5' ? P5R.red : tone.accent }}>{formatInviteCode(code)}</div>
          <div className="mt-0.5 text-[11px] font-semibold" style={{ color: tone.sub }}>{view.members.length >= 7 ? '已经满 7 人了' : '羁绊页点标题切到「组织」输入'}</div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <OrgButton small onClick={async () => { const r = await shareInvite(view); onFlash(r === 'copied' ? '邀请语已复制，发给朋友吧' : r === 'failed' ? '没复制成，手动抄一下邀请码吧' : ''); }}>分享</OrgButton>
          <OrgButton small tone="ghost" onClick={async () => onFlash((await copyText(code)) ? '邀请码已复制' : '没复制成，手动抄一下吧')}>复制</OrgButton>
        </div>
      </div>
    </OrgPanel>
  );
}
