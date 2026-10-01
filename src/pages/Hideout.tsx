/**
 * 「组织」视图（第 7 轮 · PRD §12.4；验收后改成和「同伴」平级：在羁绊页点标题切过来，点「组织」标题切回去）。
 *   没登录 → 提示登录；还没有组织 → 建立 / 输入邀请码；加入了两个 → 顶上一条切换；
 *   每个组织：组织名 / 口号 / 人数 → 地图（三个地标即页签）→ 分区内容 → 邀请码。
 *   名册：成员牌按座位排，点一下放大翻面，「⋯」查看 / 屏蔽；空座位提示发邀请码。
 *     点「名册」标题在两种样式之间切换（格子 / 专辑墙，标题换色表示现在是哪种），记在设置里。
 *   公告板（7b）：分享来的动态 + 标签，最新的会议纪要置顶；进公告板就算看过了（组织卡 / 地图红点熄灭）。
 *   会议（7b）：周日全天到周一凌晨 4 点开；其余时间看这周大家的目标和上一次纪要。
 *   作战（第 8 轮）：进行中的作战进度板 + 发起 + 最近 30 天的历史；进作战区就算看过了（地标 / 组织入口红点熄灭）。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
import { OpsSection } from '@/components/org/OpsSection';
import { OrgSettingsSheet } from '@/components/org/OrgSettingsSheet';
import { OrgOnboardingSheet } from '@/components/org/OrgOnboardingSheet';
import { BondTitle } from '@/components/org/BondTitle';
import { LeaderChip, MeetingDayChip, OrgEmptyPanel, OrgLevelLine, OrgLoginPrompt, OrgNoticeBar, OrgSwitcher, SlotLinks } from '@/components/org/OrgHome';
import { BorrowMaskSheet } from '@/components/org/BorrowMaskSheet';
import { RosterWall } from '@/components/org/RosterWall';
import { triggerLightHaptic } from '@/utils/feedback';
import { OrgButton, OrgPanel, useOrgTone, type OrgTone } from '@/components/org/orgUi';
import { markBoardSeen, refreshBoard, refreshOrg, setMemberBlocked } from '@/services/orgSync';
import { markOpsSeen, refreshOps } from '@/services/orgOpsSync';
import { opsUnread } from '@/utils/orgOps';
import { boardUnread, displayCodename, formatInviteCode, latestMinutes, meetingPending, meetingState, shownPersonas, tarotConflictLosers } from '@/utils/orgLogic';
import type { OrgMember, OrgView } from '@/types';

const SECTION_TITLE: Record<HideoutSection, { t: string; en: string }> = {
  roster: { t: '名册', en: 'MEMBERS' },
  board: { t: '公告板', en: 'BOARD' },
  meeting: { t: '会议', en: 'MEETING' },
  ops: { t: '作战', en: 'OPERATIONS' },
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
  const orgOpsSeen = useCloudSocialStore(s => s.orgOpsSeen);
  const orgId = useCloudSocialStore(s => s.hideoutOrgId);
  const blockedList = useCloudSocialStore(s => s.orgBlocked);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const rosterView = useAppStore(s => s.settings.orgRosterView ?? 'grid');
  const updateSettings = useAppStore(s => s.updateSettings);
  const view = orgs.find(v => v.org.id === orgId);
  const seenAt = orgId ? orgSeen[orgId] : undefined;
  const opsSeenAt = orgId ? orgOpsSeen[orgId] : undefined;
  // 从羁绊页切过来 / 分享完「去公告板看看」时，先打开有新东西的那一区（读一次就清掉）
  const [section, setSection] = useState<HideoutSection>(() => useCloudSocialStore.getState().hideoutSection ?? 'roster');
  useEffect(() => { useCloudSocialStore.getState().setHideoutSection(null); }, []);
  const [flip, setFlip] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<OrgMember | null>(null);
  // 第 8 轮：同调 = 借面具（从放大牌下面 /「⋯」打开）
  const [borrowFor, setBorrowFor] = useState<OrgMember | null>(null);
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
    if (section === 'ops' && orgId) void refreshOps(orgId);
  }, [section, orgId]);

  // 看着公告板就算看过了：新动态 / 新标签到了也跟着记一笔，红点不会在眼皮底下亮起来
  const posts = view?.posts;
  const reactions = view?.reactions;
  useEffect(() => {
    if (section === 'board' && orgId && posts) markBoardSeen(orgId);
  }, [section, orgId, posts, reactions]);
  // 作战区同理：看着就算看过了（新作战 / 刚达成的卡到了也跟着记）
  const ops = view?.ops;
  const ledger = view?.ledger;
  useEffect(() => {
    if (section === 'ops' && orgId && ops) markOpsSeen(orgId);
  }, [section, orgId, ops, ledger, posts]);

  // 两个组织时切换条上的红点
  const dots = useMemo(
    () => Object.fromEntries(orgs.map(v => [v.org.id, boardUnread(v, orgSeen[v.org.id], blocked) || meetingPending(v) || opsUnread(v, orgOpsSeen[v.org.id])])),
    [orgs, orgSeen, orgOpsSeen, blocked],
  );

  const p3 = channel === 'p3';
  const p5 = channel === 'p5';
  const leader = !!view && view.org.leaderId === view.me.userId;
  const minutes = view ? latestMinutes(view) : null;
  const flipMember = view?.members.find(m => m.id === flip);

  const toggleRosterView = () => {
    triggerLightHaptic();
    void updateSettings({ orgRosterView: rosterView === 'wall' ? 'grid' : 'wall' });
  };
  const invite = async () => {
    if (!view) return;
    const r = await shareInvite(view);
    setFlash(r === 'copied' ? '邀请语已复制，发给朋友吧' : r === 'failed' ? '没复制成，手动抄一下邀请码吧' : '');
  };

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
      if (shownPersonas(m.card).length) list.push({ label: '同调', onClick: () => setBorrowFor(m) });
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

        <HideoutMap view={view} section={section} onSection={setSection} blocked={blocked} dots={{ board: section !== 'board' && boardUnread(view, seenAt, blocked), meeting: meetingPending(view), ops: section !== 'ops' && opsUnread(view, opsSeenAt) }} />

        <SectionTitle
          tone={tone}
          section={section}
          meta={section === 'roster' ? `${members.length} / 7` : section === 'meeting' && !meetingState(new Date(), org.tz).open ? '每周日' : undefined}
          onTitle={section === 'roster' ? toggleRosterView : undefined}
          alt={section === 'roster' && rosterView === 'wall'}
        />

        {section === 'roster' && rosterView === 'wall' ? (
          <RosterWall view={view} minutes={minutes} blocked={blocked} onMore={(m) => setMenuFor(m)} onSync={(m) => setBorrowFor(m)} onInvite={() => void invite()} />
        ) : section === 'roster' ? (
          <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            {members.map(m => (
              <MemberTile key={m.id} view={view} member={m} minutes={minutes} blocked={blocked.has(m.userId)} onOpen={() => setFlip(m.id)} onMore={() => setMenuFor(m)} />
            ))}
            {empty > 0 && (
              <button
                type="button"
                onClick={() => void invite()}
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
        ) : section === 'ops' ? (
          <OpsSection view={view} blocked={blocked} onFlash={setFlash} />
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
                  <motion.span animate={refreshing ? { rotate: 360 } : { rotate: 0 }} transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0 }} className="flex">
                    <RefreshGlyph />
                  </motion.span>
                </HeaderIcon>
                <HeaderIcon tone={tone} label="据点设置" onClick={() => setSettingsOpen(true)}><GearGlyph /></HeaderIcon>
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
              footer={flipMember && flipMember.id !== view.me.id && shownPersonas(flipMember.card).length > 0
                ? <OrgButton small onClick={() => { const m = flipMember; setFlip(null); setBorrowFor(m); }}>同调</OrgButton>
                : undefined}
            />
            <BorrowMaskSheet view={view} member={borrowFor} open={!!borrowFor} onClose={() => setBorrowFor(null)} onFlash={setFlash} />
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

/** 页头右上角的图标按钮（刷新 / 据点设置）：几何图标 + 四频道外框（和同伴页右上角的菜单按钮一套做法） */
function HeaderIcon({ tone, label, onClick, children }: { tone: OrgTone; label: string; onClick: () => void; children: ReactNode }) {
  if (tone.channel === 'p5') {
    return (
      <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onClick} aria-label={label} title={label} className="relative flex h-9 w-9 items-center justify-center" style={{ color: P5R.ink }}>
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute inset-0" style={{ transform: 'translate(2.5px,3px)', background: '#050505', clipPath: roughQuad(label.length + 0.3, 2) }} />
          <span className="absolute inset-0" style={{ background: '#050505', clipPath: roughQuad(label.length + 0.6, 2) }} />
          <span className="absolute inset-[2.5px]" style={{ background: P5R.paper, clipPath: roughQuad(label.length + 0.9, 1.5) }} />
        </span>
        <span className="relative">{children}</span>
      </motion.button>
    );
  }
  const skin: CSSProperties = tone.channel === 'p3'
    ? { background: P3R.cyanPale, color: P3R.blueDeep, clipPath: slantClip(6), boxShadow: '0 6px 14px rgba(38,96,140,0.08)' }
    : tone.channel === 'p4'
      ? { background: 'var(--ui-paper, #fff6d0)', color: 'var(--ui-ink, #131313)', borderRadius: 12, boxShadow: '0 0 0 2px var(--ui-line, #131313), 3px 3px 0 0 var(--ui-line, #131313)' }
      : { borderRadius: 12 };
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 items-center justify-center ${tone.channel === 'neutral' ? 'border border-indigo-500/30 bg-indigo-500/10 text-indigo-500 dark:text-indigo-300' : ''}`}
      style={skin}
    >
      {children}
    </motion.button>
  );
}

/** 刷新：两段弧 + 箭头 */
function RefreshGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 0 0-14.3-4.9" />
      <path d="M5.2 2.8v3.6h3.6" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9" />
      <path d="M18.8 21.2v-3.6h-3.6" />
    </svg>
  );
}

/** 设置：齿轮（8 个齿 + 中间的孔，按角度算出来） */
const GEAR_D = (() => {
  const n = 32;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2 + Math.PI / n;
    const r = i % 4 === 0 || i % 4 === 1 ? 10.6 : 8.1;
    pts.push(`${(12 + r * Math.cos(ang)).toFixed(2)},${(12 + r * Math.sin(ang)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z M12 8.4 A3.6 3.6 0 1 0 12.01 8.4 Z`;
})();
function GearGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path fill="currentColor" fillRule="evenodd" d={GEAR_D} />
    </svg>
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
        <OrgLevelLine view={view} />
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
        <OrgLevelLine view={view} />
      </div>
    );
  }
  if (tone.channel === 'p3') {
    return (
      <div className="relative">
        <h2 className="relative text-[28px] font-black italic leading-tight tracking-tight" style={{ color: P3R.ink, fontFamily: '"Noto Sans SC Black", "Velvet Sans SC", sans-serif' }}>{org.name}</h2>
        {org.motto && <div className="relative mt-0.5 text-[13px] font-bold" style={{ color: P3R.inkSoft }}>{org.motto}</div>}
        {meta}
        <OrgLevelLine view={view} />
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-[26px] font-black leading-tight text-gray-900 dark:text-white">{org.name}</h2>
      {org.motto && <div className="mt-0.5 text-[13px] font-semibold text-gray-500 dark:text-gray-400">{org.motto}</div>}
      {meta}
      <OrgLevelLine view={view} />
    </div>
  );
}

/**
 * 分区标题。名册的标题可以点（onTitle）：在格子 / 专辑墙之间切换，alt = 现在是专辑墙，
 * 标题换成强调色表示（蓝频道蓝字、黄频道主色、红频道红字、中性主色）。
 */
function SectionTitle({ tone, section, meta, onTitle, alt = false }: { tone: OrgTone; section: HideoutSection; meta?: string; onTitle?: () => void; alt?: boolean }) {
  const s = SECTION_TITLE[section];
  const label = onTitle ? `${s.t}：现在是${alt ? '专辑墙' : '格子'}样式，点一下换成${alt ? '格子' : '专辑墙'}` : undefined;
  const tap = (node: ReactNode, style?: CSSProperties) => (onTitle
    ? <button type="button" onClick={onTitle} aria-label={label} aria-pressed={alt} className="cursor-pointer text-left" style={{ color: 'inherit', font: 'inherit', ...style }}>{node}</button>
    : node);
  if (tone.channel === 'p3') return <SectionMark title={tap(s.t)} variant={alt ? 'blue' : 'ink'} meta={meta ? <span className="text-[13px] font-black italic" style={{ color: P3R.blue }}>{meta}</span> : undefined} />;
  if (tone.channel === 'p4') return <P4SectionTitle meta={meta ? <span className="text-[13px] font-black text-[#131313]">{meta}</span> : undefined}>{tap(s.t, alt ? { color: 'var(--ui-accent, #2e6be0)' } : undefined)}</P4SectionTitle>;
  if (tone.channel === 'p5') {
    const bar = <P5SubBar segs={[{ t: s.t, c: alt ? P5R.red : undefined }, { t: s.en, c: alt ? P5R.red : undefined }]} rot={-1} />;
    return (
      <div className="flex items-center justify-between">
        {onTitle ? <button type="button" onClick={onTitle} aria-label={label} aria-pressed={alt}>{bar}</button> : bar}
        {meta && <span className="text-[14px] font-black" style={{ color: P5R.white, fontFamily: P5_TITLE_FONT }}>{meta}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[17px] font-black text-gray-900 dark:text-white">{tap(<>{s.t} <span className="ml-1 text-[10px] font-bold tracking-[0.2em] text-gray-400">{s.en}</span></>, alt ? { color: 'var(--ui-accent, #6366f1)' } : undefined)}</h2>
      {meta && <span className="text-[12px] font-black text-gray-500 dark:text-gray-400">{meta}</span>}
    </div>
  );
}

/** 邀请码：默认收起成一行，点一下才展开邀请码和「分享 / 复制」（一直开着太占地方） */
function InvitePanel({ view, tone, onFlash }: { view: OrgView; tone: OrgTone; onFlash: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const code = view.org.inviteCode;
  const full = view.members.length >= 7;
  const padX = tone.channel === 'p5' ? 'px-5' : 'px-4';
  return (
    <OrgPanel seed={33} padded={false}>
      <button
        type="button"
        onClick={() => { triggerLightHaptic(); setOpen(o => !o); }}
        aria-expanded={open}
        aria-controls="org-invite-body"
        className={`flex w-full items-center justify-between gap-3 py-3 text-left ${padX}`}
      >
        <span className="text-[11px] font-black tracking-[0.2em]" style={{ color: tone.sub }}>INVITE · 邀请码</span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-black" style={{ color: tone.sub }}>
          {open ? '收起' : full ? '已满 7 人' : '展开'}
          <motion.svg aria-hidden viewBox="0 0 12 12" width={12} height={12} animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <path d="M2.5 4.5L6 8L9.5 4.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="org-invite-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={`flex items-center justify-between gap-3 pb-4 ${padX}`}>
              <div className="min-w-0">
                <div className="whitespace-nowrap font-mono text-[20px] font-black tracking-[0.18em] min-[380px]:text-[24px]" style={{ color: tone.channel === 'p5' ? P5R.red : tone.accent }}>{formatInviteCode(code)}</div>
                <div className="mt-0.5 text-[11px] font-semibold" style={{ color: tone.sub }}>{full ? '已经满 7 人了' : '羁绊页点标题切到「组织」输入'}</div>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <OrgButton small onClick={async () => { const r = await shareInvite(view); onFlash(r === 'copied' ? '邀请语已复制，发给朋友吧' : r === 'failed' ? '没复制成，手动抄一下邀请码吧' : ''); }}>分享</OrgButton>
                <OrgButton small tone="ghost" onClick={async () => onFlash((await copyText(code)) ? '邀请码已复制' : '没复制成，手动抄一下吧')}>复制</OrgButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </OrgPanel>
  );
}
