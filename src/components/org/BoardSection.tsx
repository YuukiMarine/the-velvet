/**
 * 公告板（第 7 轮 7b · PRD §12.6 / §12.16）：据点页「公告板」分区。
 *   · 动态卡：代表牌小图 / 代号 / 时间，那一句，快照小签（加点用分享者自己的属性名、类型、补记、日期），
 *     六个标签（计数、我贴的高亮），下面一行列出谁贴了什么；长按或点「⋯」：举报 / 屏蔽此人 / 删除；
 *   · 纪要卡：最新一份置顶（出席、完成率、做到了、称号、下周目标、缺席），更早的按时间混在动态里；
 *   · 作战达成卡（第 8 轮）：那句话、大 / 小作战、达成那天、做完的人（大作战带各自那一份），也能贴标签；不能删（据点经验的来源）；
 *   · 屏蔽的人整条不显示、他贴的标签不计数、纪要里也不列他；举报过的动态本机不再显示。
 */
import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useLongPress } from '@/utils/useLongPress';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { P4Sparkle } from '@/ui/p4Kit';
import {
  ORG_TAGS, RESULT_LABEL, SHARE_KIND_LABEL, displayCodename, orgWeekKey, reactionSummary, shiftDayKey, timeAgo,
} from '@/utils/orgLogic';
import { deletePostFromUi, reactToPost, reportPostFromUi, setMemberBlocked } from '@/services/orgSync';
import type { OrgReportReason } from '@/services/orgs';
import { OrgButton, OrgPanel, useOrgTone, type OrgTone } from './orgUi';
import { MemberFace } from './MemberCard';
import type { Org, OrgMinutesSnapshot, OrgPost, OrgPostSnapshot, OrgReactionTag, OrgView } from '@/types';

const REPORT_REASONS: Array<{ id: OrgReportReason; label: string }> = [
  { id: 'harass', label: '骚扰 / 攻击' },
  { id: 'inappropriate', label: '不当内容' },
  { id: 'ads', label: '广告 / 引流' },
  { id: 'other', label: '其他' },
];

const md = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function BoardSection({ view, blocked, onFlash }: { view: OrgView; blocked: Set<string>; onFlash: (s: string) => void }) {
  const tone = useOrgTone();
  const hidden = useCloudSocialStore(s => s.orgHiddenPosts);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const [menuFor, setMenuFor] = useState<OrgPost | null>(null);
  const [reportFor, setReportFor] = useState<OrgPost | null>(null);
  const [deleteFor, setDeleteFor] = useState<OrgPost | null>(null);
  const me = view.me.userId;
  const leader = view.org.leaderId === me;
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);

  const posts = view.posts;
  const visible = useMemo(
    () => (posts ?? []).filter(p => !hiddenSet.has(p.id) && (p.kind === 'minutes' ? !!p.minutes : p.kind === 'operation' ? !!p.opCard : !blocked.has(p.userId))),
    [posts, hiddenSet, blocked],
  );
  // 最新的一份纪要置顶，其余按时间混在动态里（列表本来就是新的在前）
  const pinned = visible.find(p => p.kind === 'minutes');
  const rest = visible.filter(p => p !== pinned);
  const blockedCount = (posts ?? []).filter(p => p.kind === 'moment' && blocked.has(p.userId)).length;

  if (!posts) {
    return <OrgPanel seed={41}><div className="text-[13px] font-bold" style={{ color: tone.sub }}>公告板还没拉到，稍后点右上角刷新。</div></OrgPanel>;
  }

  const react = async (postId: string, tag: OrgReactionTag) => {
    try { await reactToPost(view.org.id, postId, tag); } catch (e) { onFlash(errText(e, '没贴上，稍后再试')); }
  };

  const menuActions = (() => {
    const p = menuFor;
    if (!p) return [];
    const list: Array<{ label: string; onClick: () => void; tone?: 'default' | 'danger' }> = [];
    if (p.userId !== me) {
      const isBlocked = blocked.has(p.userId);
      list.push({ label: '举报这条', onClick: () => setReportFor(p) });
      list.push({ label: isBlocked ? '解除屏蔽' : '屏蔽此人（只在本机生效）', onClick: () => { setMemberBlocked(p.userId, !isBlocked); onFlash(isBlocked ? '已解除屏蔽' : '已屏蔽，不再显示 Ta 的动态和标签'); } });
    }
    // 纪要和作战达成卡不能删（据点经验的来源；服务器上也锁着）
    if (p.kind === 'moment' && (p.userId === me || leader)) list.push({ label: p.userId === me ? '删除这条' : '删除这条（队长）', onClick: () => setDeleteFor(p), tone: 'danger' });
    return list;
  })();

  return (
    <div className="space-y-3">
      {pinned?.minutes && <MinutesCard org={view.org} minutes={pinned.minutes} blocked={blocked} tone={tone} />}
      {rest.map((p, i) => (p.kind === 'minutes' && p.minutes
        ? <MinutesCard key={p.id} org={view.org} minutes={p.minutes} blocked={blocked} tone={tone} compact />
        : p.kind === 'operation' && p.opCard
          ? <OpWinCard key={p.id} post={p} view={view} tone={tone} blocked={blocked} index={i} onReact={(tag) => react(p.id, tag)} onMore={() => setMenuFor(p)} />
          : <PostCard key={p.id} post={p} view={view} tone={tone} blocked={blocked} index={i} onReact={(tag) => react(p.id, tag)} onMore={() => setMenuFor(p)} />))}
      {visible.length === 0 && (
        <OrgPanel seed={43}>
          <div className="text-[15px] font-black" style={{ fontFamily: tone.titleFont }}>还没有动态</div>
          <div className="mt-1 text-[12px] font-semibold leading-relaxed" style={{ color: tone.sub }}>在记录页长按一条记录，选「分享到据点」，就会出现在这里。分享出去的只有你写的那一句和加点，不带记录原文。</div>
          <div className="mt-3"><OrgButton small onClick={() => setCurrentPage('activities')}>去记录页</OrgButton></div>
        </OrgPanel>
      )}
      {blockedCount > 0 && <div className="text-center text-[11px] font-bold" style={{ color: tone.stageSub }}>已屏蔽 {blockedCount} 条（据点设置里可以解除）</div>}
      <div className="text-center text-[11px] font-bold" style={{ color: tone.stageSub }}>公告板只显示最近 30 天 · 长按一条可以举报或屏蔽</div>

      <ActionSheet isOpen={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor ? `「${menuFor.kind === 'operation' ? menuFor.opCard?.title ?? '' : menuFor.text}」` : undefined} actions={menuActions} />
      <ActionSheet
        isOpen={!!reportFor}
        onClose={() => setReportFor(null)}
        title="举报的理由"
        actions={REPORT_REASONS.map(r => ({
          label: r.label,
          onClick: async () => {
            const p = reportFor;
            if (!p) return;
            // 达成卡上的字是作战的那句话：举报时带它当原话副本
            const target = p.kind === 'operation' ? { ...p, text: p.opCard?.title ?? '' } : p;
            try { await reportPostFromUi(target, r.id); onFlash('已举报，这条不再显示；会在 2 天内处理'); } catch (e) { onFlash(errText(e, '举报没发出去，稍后再试')); }
          },
        }))}
      />
      <ConfirmDialog
        isOpen={!!deleteFor}
        tone="danger"
        title="删除这条动态？"
        description={deleteFor ? `「${deleteFor.text}」和它上面的标签会一起删除。` : undefined}
        confirmText="删除"
        cancelText="取消"
        onCancel={() => setDeleteFor(null)}
        onConfirm={async () => {
          const p = deleteFor;
          setDeleteFor(null);
          if (!p) return;
          try { await deletePostFromUi(view.org.id, p.id); onFlash('删掉了'); } catch (e) { onFlash(errText(e, '没删掉，稍后再试')); }
        }}
      />
    </div>
  );
}

// ── 动态卡 ───────────────────────────────────────────────────────────────────

function PostCard({ post, view, tone, blocked, index, onReact, onMore }: {
  post: OrgPost; view: OrgView; tone: OrgTone; blocked: Set<string>; index: number;
  onReact: (tag: OrgReactionTag) => void; onMore: () => void;
}) {
  // 长按 = 「⋯」菜单；长按松手后浏览器还会补一个 click，别让它顺手把标签也点了
  const longFired = useRef(false);
  const { pressing, bindings } = useLongPress(() => { longFired.current = true; onMore(); });
  const author = view.members.find(m => m.userId === post.userId);
  const mine = post.userId === view.me.userId;
  const codename = author ? displayCodename(author) : (post.snapshot?.by.codename || '已退出的成员');
  const snap = post.snapshot;
  const { mine: myTag, byTag } = reactionSummary(view.reactions, post.id, view.me.userId, blocked);
  const nameOf = (uid: string) => {
    const m = view.members.find(x => x.userId === uid);
    return m ? (m.userId === view.me.userId ? '我' : displayCodename(m)) : '已退出的成员';
  };
  const whoLine = ORG_TAGS.filter(t => byTag.get(t.id)?.length).map(t => `${byTag.get(t.id)!.map(nameOf).join('、')}：${t.label}`).join(' · ');
  const chips = snapChips(snap);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, scale: pressing ? 0.985 : 1 }}
      transition={{ delay: pressing ? 0 : Math.min(index, 6) * 0.03, duration: 0.18 }}
      className="select-none"
      {...bindings}
      onPointerDown={(e) => { longFired.current = false; bindings.onPointerDown(e); }}
      onClickCapture={(e) => { if (longFired.current) { longFired.current = false; e.stopPropagation(); e.preventDefault(); } }}
      onContextMenu={(e) => { e.preventDefault(); longFired.current = true; onMore(); }}
    >
      <OrgPanel padded={false} seed={60 + (index % 9)} className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <MemberFace
            member={author}
            fallbackTarot={post.snapshot?.by.tarotId}
            empty={<span aria-hidden className="absolute inset-0 flex items-center justify-center text-[13px] font-black" style={{ color: tone.sub, fontFamily: tone.titleFont }}>{[...codename][0] ?? '?'}</span>}
            className="h-[42px] w-[26px] shrink-0"
            style={{ borderRadius: tone.channel === 'p4' ? 5 : tone.channel === 'neutral' ? 4 : 0, clipPath: tone.channel === 'p5' ? roughQuad(index + 0.4, 1.5) : undefined, boxShadow: tone.channel === 'p4' ? '0 0 0 1.5px #131313' : undefined }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-black" style={{ fontFamily: tone.titleFont }}>{codename}</span>
              {mine && <span className="shrink-0 px-1 py-[1px] text-[9px] font-black leading-none" style={{ background: tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.magenta : tone.channel === 'p4' ? '#131313' : tone.accent, borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0, color: tone.channel === 'p4' ? '#fff6d0' : '#ffffff' }}>我</span>}
            </div>
            <div className="text-[10px] font-bold" style={{ color: tone.sub }}>{timeAgo(post.createdAt)}</div>
          </div>
          <button type="button" onClick={onMore} aria-label="更多操作" className="-mr-1 shrink-0 px-1.5 py-1 text-[18px] font-black leading-none" style={{ color: tone.sub }}>⋯</button>
        </div>
        <div className="mt-2 break-words text-[17px] font-black leading-snug" style={{ fontFamily: tone.titleFont }}>{post.text}</div>
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c, i) => <SnapChip key={i} tone={tone}>{c}</SnapChip>)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ORG_TAGS.map((t, i) => (
            <TagChip key={t.id} tone={tone} seed={i} label={t.label} count={byTag.get(t.id)?.length ?? 0} on={myTag?.tag === t.id} onClick={() => onReact(t.id)} />
          ))}
        </div>
        {whoLine && <div className="mt-1.5 text-[11px] font-bold leading-relaxed" style={{ color: tone.sub }}>{whoLine}</div>}
      </OrgPanel>
    </motion.div>
  );
}

// ── 作战达成卡（第 8 轮）────────────────────────────────────────────────────────

function OpWinCard({ post, view, tone, blocked, index, onReact, onMore }: {
  post: OrgPost; view: OrgView; tone: OrgTone; blocked: Set<string>; index: number;
  onReact: (tag: OrgReactionTag) => void; onMore: () => void;
}) {
  const card = post.opCard!;
  const { mine: myTag, byTag } = reactionSummary(view.reactions, post.id, view.me.userId, blocked);
  const nameOf = (uid: string) => {
    const m = view.members.find(x => x.userId === uid);
    return m ? (m.userId === view.me.userId ? '我' : displayCodename(m)) : '已退出的成员';
  };
  const whoLine = ORG_TAGS.filter(t => byTag.get(t.id)?.length).map(t => `${byTag.get(t.id)!.map(nameOf).join('、')}：${t.label}`).join(' · ');
  const badge = tone.channel === 'p3'
    ? { background: P3R.magenta, color: '#ffffff', clipPath: slantClip(5) }
    : tone.channel === 'p5'
      ? { background: P5R.red, color: P5R.white, clipPath: roughQuad(4.2, 2), fontFamily: P5_TITLE_FONT }
      : tone.channel === 'p4'
        ? { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 999, boxShadow: '0 0 0 1.5px #131313' }
        : { background: '#10b981', color: '#ffffff', borderRadius: 999 };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 6) * 0.03, duration: 0.18 }} onContextMenu={(e) => { e.preventDefault(); onMore(); }}>
      <OrgPanel padded={false} seed={80 + (index % 7)} className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-2 py-[3px] text-[11px] font-black leading-none" style={badge}>✦ 作战达成</span>
          <span className="min-w-0 truncate text-[11px] font-black" style={{ color: tone.sub }}>{card.kind === 'big' ? '大作战' : '小作战'} · {md(card.day)}</span>
          <button type="button" onClick={onMore} aria-label="更多操作" className="-mr-1 ml-auto shrink-0 px-1.5 py-1 text-[18px] font-black leading-none" style={{ color: tone.sub }}>⋯</button>
        </div>
        <div className="mt-1.5 break-words text-[18px] font-black leading-snug" style={{ fontFamily: tone.titleFont }}>{card.title}</div>
        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-2">
          {card.participants.filter(x => !blocked.has(x.userId)).map((x) => {
            const m = view.members.find(y => y.userId === x.userId);
            return (
              <li key={x.userId} className="flex min-w-0 max-w-full items-center gap-1.5">
                <MemberFace member={m} fallbackTarot={x.tarotId} className="h-[30px] w-[19px] shrink-0" style={{ borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 3 : 0 }} empty={<span className="absolute inset-0 flex items-center justify-center text-[9px] font-black">{[...x.codename][0] ?? '?'}</span>} />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-black leading-tight">{m ? displayCodename(m) : x.codename}</span>
                  {x.task && <span className="block truncate text-[10px] font-bold leading-tight" style={{ color: tone.sub }}>{x.task}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ORG_TAGS.map((t, i) => (
            <TagChip key={t.id} tone={tone} seed={i} label={t.label} count={byTag.get(t.id)?.length ?? 0} on={myTag?.tag === t.id} onClick={() => onReact(t.id)} />
          ))}
        </div>
        {whoLine && <div className="mt-1.5 text-[11px] font-bold leading-relaxed" style={{ color: tone.sub }}>{whoLine}</div>}
      </OrgPanel>
    </motion.div>
  );
}

/** 快照小签：各属性加点（用分享者自己的属性名）、类型、补记、不是今天的写上日期 */
export function snapChips(snap: OrgPostSnapshot | null | undefined): string[] {
  const chips: string[] = [];
  if (!snap) return chips;
  for (const [k, v] of Object.entries(snap.pts)) if (typeof v === 'number') chips.push(`${snap.names[k as keyof typeof snap.names] ?? k} ${v > 0 ? '+' : ''}${v}`);
  if (snap.kind) chips.push(SHARE_KIND_LABEL[snap.kind]);
  if (snap.backfilled) chips.push('补记');
  if (snap.date !== localToday()) chips.push(md(snap.date));
  return chips;
}

export function SnapChip({ tone, children }: { tone: OrgTone; children: string }) {
  const style = tone.channel === 'p3'
    ? { background: P3R.cyanFaint, color: P3R.blueDeep, clipPath: slantClip(4) }
    : tone.channel === 'p4'
      ? { background: 'rgba(127,127,127,0.14)', color: 'var(--ui-ink, #131313)', borderRadius: 999 }
      : tone.channel === 'p5'
        ? { background: P5R.ink, color: P5R.white, clipPath: roughQuad(children.length + 0.3, 1.5) }
        : { background: 'rgba(127,127,127,0.12)', color: tone.ink, borderRadius: 999 };
  return <span className="inline-flex items-center whitespace-nowrap px-2 py-[3px] text-[11px] font-black leading-none tabular-nums" style={style}>{children}</span>;
}

function TagChip({ tone, seed, label, count, on, onClick }: { tone: OrgTone; seed: number; label: string; count: number; on: boolean; onClick: () => void }) {
  const text = (
    <>
      {label}
      {count > 0 && <span className="tabular-nums opacity-80">{count}</span>}
    </>
  );
  const common = {
    type: 'button' as const,
    whileTap: { scale: 0.92 },
    onClick,
    'aria-pressed': on,
    'aria-label': `${label}${count ? `，${count} 人` : ''}`,
  };
  if (tone.channel === 'p5') {
    return (
      <motion.button {...common} className="relative inline-flex items-center whitespace-nowrap px-2.5 py-1 text-[12px] font-black leading-none" style={{ fontFamily: P5_TITLE_FONT }}>
        <span aria-hidden className="absolute inset-0" style={{ background: on ? P5R.red : P5R.ink, clipPath: roughQuad(seed + 1.7, 2) }} />
        {!on && <span aria-hidden className="absolute inset-[1.5px]" style={{ background: P5R.paper, clipPath: roughQuad(seed + 1.9, 1.5) }} />}
        <span className="relative inline-flex items-center gap-1" style={{ color: on ? P5R.white : P5R.ink }}>{text}</span>
      </motion.button>
    );
  }
  const style = tone.channel === 'p3'
    ? { background: on ? P3R.blue : P3R.cyanFaint, color: on ? '#ffffff' : P3R.ink, clipPath: slantClip(5) }
    : tone.channel === 'p4'
      ? { background: on ? 'var(--p4-orange, #f9a11b)' : 'transparent', color: on ? '#131313' : 'var(--ui-ink, #131313)', borderRadius: 999, boxShadow: `inset 0 0 0 1.5px ${on ? '#131313' : 'var(--ui-line, #131313)'}` }
      : { background: on ? tone.accent : 'rgba(127,127,127,0.1)', color: on ? '#ffffff' : tone.ink, borderRadius: 999 };
  return (
    <motion.button {...common} className="relative inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 text-[12px] font-black leading-none" style={style}>
      {text}
      {on && tone.channel === 'p4' && <P4Sparkle size={9} color="#ffffff" className="absolute -right-1 -top-1" />}
    </motion.button>
  );
}

// ── 纪要卡 ───────────────────────────────────────────────────────────────────

/** 组织的第几周（建组织那周算第 1 周） */
export const orgWeekNo = (org: Pick<Org, 'createdAt' | 'tz'>, week: string): number =>
  Math.round((Date.parse(week) - Date.parse(orgWeekKey(org.createdAt, org.tz))) / (7 * 86400000)) + 1;

export function MinutesCard({ org, minutes, blocked, tone, compact = false }: {
  org: Pick<Org, 'createdAt' | 'tz'>; minutes: OrgMinutesSnapshot; blocked: Set<string>; tone: OrgTone; compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const ok = (x: { userId: string }) => !blocked.has(x.userId);
  const goals = minutes.goals.filter(ok);
  const done = minutes.done.filter(ok);
  const titles = minutes.titles.filter(ok);
  const absent = minutes.absent.filter(ok);
  const attended = minutes.goals.length;
  const eligible = minutes.goals.length + minutes.absent.length;
  const n = orgWeekNo(org, minutes.week);
  const range = `${md(minutes.week)}–${md(shiftDayKey(minutes.week, 6))}`;
  const pct = minutes.rate.total ? Math.round((minutes.rate.done / minutes.rate.total) * 100) : 0;
  const bar = tone.channel === 'p5' ? P5R.red : tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : tone.accent;
  const label = (t: string) => <div className="text-[11px] font-black tracking-wider" style={{ color: tone.sub }}>{t}</div>;
  const badgeStyle = tone.channel === 'p3'
    ? { background: bar, color: '#ffffff', clipPath: slantClip(4) }
    : tone.channel === 'p5'
      ? { background: bar, color: P5R.white, clipPath: roughQuad(2.9, 2), fontFamily: P5_TITLE_FONT }
      : tone.channel === 'p4'
        ? { background: bar, color: '#131313', borderRadius: 999, boxShadow: '0 0 0 1.5px #131313' }
        : { background: bar, color: '#ffffff', borderRadius: 999 };
  return (
    <OrgPanel padded={false} seed={77 + (n % 5)} className="px-4 py-3.5">
      <button type="button" onClick={() => compact && setOpen(v => !v)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <span className="shrink-0 whitespace-nowrap px-2 py-[3px] text-[11px] font-black" style={badgeStyle}>会议纪要</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-black" style={{ fontFamily: tone.titleFont }}>{n >= 1 ? `第 ${n} 周` : '这一周'}<span className="ml-1.5 text-[11px] font-bold" style={{ color: tone.sub }}>{range}</span></span>
        <span className="shrink-0 text-[11px] font-black tabular-nums" style={{ color: tone.sub }}>出席 {attended}{eligible ? ` / ${eligible}` : ''}</span>
        {compact && <span aria-hidden className="shrink-0 text-[11px] font-black" style={{ color: tone.sub }}>{open ? '收起' : '展开'}</span>}
      </button>

      {open && (
        <>
          <div className="mt-3">
            {label('这周的目标')}
            {minutes.rate.total > 0 ? (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-[24px] font-black leading-none tabular-nums" style={{ fontFamily: tone.titleFont }}>{minutes.rate.done}<span className="text-[14px]" style={{ color: tone.sub }}> / {minutes.rate.total}</span></span>
                  <span className="text-[12px] font-bold" style={{ color: tone.sub }}>人做到了</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: tone.channel === 'p5' ? 'rgba(0,0,0,0.12)' : 'rgba(127,127,127,0.2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bar }} />
                </div>
                {done.length > 0 && <div className="mt-1.5 text-[12px] font-bold">{RESULT_LABEL.done}：{done.map(d => d.codename).join('、')}</div>}
              </>
            ) : (
              <div className="mt-1 text-[12px] font-bold" style={{ color: tone.sub }}>这周还没人立过目标</div>
            )}
          </div>

          {titles.length > 0 && (
            <div className="mt-3">
              {label('本周称号')}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {titles.map((t, i) => <SnapChip key={i} tone={tone}>{`${t.codename} · ${t.title}`}</SnapChip>)}
              </div>
            </div>
          )}

          <div className="mt-3">
            {label('下周目标')}
            {goals.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {goals.map((g, i) => (
                  <li key={i} className="flex gap-2 text-[13px] font-bold leading-snug">
                    <span className="shrink-0 font-black" style={{ color: tone.channel === 'p5' ? P5R.red : tone.accent }}>{g.codename}</span>
                    <span className="min-w-0 break-words">「{g.goal}」</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-[12px] font-bold" style={{ color: tone.sub }}>这次会上没人写</div>
            )}
          </div>

          {absent.length > 0 && <div className="mt-3 text-[11px] font-bold" style={{ color: tone.sub }}>缺席：{absent.map(a => a.codename).join('、')}</div>}
        </>
      )}
    </OrgPanel>
  );
}
