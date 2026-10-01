/**
 * 作战（第 8 轮 · PRD §13.3）：据点页「作战」分区。
 *   · 进行中的作战：每场一张进度板——类型、截止倒计时、一句话 / 共同目标、发起人与属性、整体进度条；
 *     参与者一人一行（牌面 + 代号 + 那一份 + 状态），我那一行高亮：没做完「去任务里完成」、大作战里没分到的「写下我的一份」；
 *     最下面「这次不参加」，发起人和队长多一个「取消作战」。
 *   · 历史：最近 30 天达成 / 未达成 / 取消的，收起来列在下面。
 *   · 右上「发起作战」→ OpCreateSheet。
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ActionSheet } from '@/components/ActionSheet';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { cancelOpFromUi, optOutFromUi, writeMyPartFromUi } from '@/services/orgOpsSync';
import { reportPostFromUi, setMemberBlocked } from '@/services/orgSync';
import type { OrgReportReason } from '@/services/orgs';
import { ORG_OP_TASK_MAX, opsForBoard, type OpProgress, type OpRow } from '@/utils/orgOps';
import { displayCodename } from '@/utils/orgLogic';
import { MemberFace } from './MemberCard';
import { OpCreateSheet } from './OpCreateSheet';
import { OrgButton, OrgPanel, orgInputSkin, useOrgTone, type OrgTone } from './orgUi';
import type { OrgView } from '@/types';

const md = (key: string) => `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

type Confirm = { kind: 'out' | 'cancel'; p: OpProgress };

const REPORT_REASONS: Array<{ id: OrgReportReason; label: string }> = [
  { id: 'harass', label: '骚扰 / 攻击' },
  { id: 'inappropriate', label: '不当内容' },
  { id: 'ads', label: '广告 / 引流' },
  { id: 'other', label: '其他' },
];

export function OpsSection({ view, blocked, onFlash }: { view: OrgView; blocked: Set<string>; onFlash: (s: string) => void }) {
  const tone = useOrgTone();
  const attrNames = useAppStore(s => s.settings.attributeNames);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const board = useMemo(() => (view.ops ? opsForBoard(view, now) : null), [view, now]);
  const [createOpen, setCreateOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  // 别人发起的作战：「⋯」里可以举报那句话 / 分工，或者屏蔽发起人（App Store 对用户内容的要求）
  const [menuFor, setMenuFor] = useState<OpProgress | null>(null);
  const [reportFor, setReportFor] = useState<OpProgress | null>(null);

  const run = async (fn: () => Promise<void>, ok: string, fallback: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); onFlash(ok); } catch (e) { onFlash(errText(e, fallback)); } finally { setBusy(false); }
  };

  const doConfirm = () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'out') void run(() => optOutFromUi(view.org.id, c.p.op.id), '这次不参加了，任务里那条已经收起来', '没退出成，稍后再试');
    else void run(() => cancelOpFromUi(view.org.id, c.p.op.id), '作战已取消', '没取消成，稍后再试');
  };

  if (!board) {
    return (
      <OrgPanel seed={61}>
        <div className="text-[13px] font-bold" style={{ color: tone.sub }}>{view.opsFailed ? '作战暂时拉不到，稍后点右上角刷新再试。' : '正在拉作战…'}</div>
      </OrgPanel>
    );
  }

  const head = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-[12px] font-black" style={{ color: tone.stageSub }}>
        {board.active.length ? `进行中 ${board.active.length} 场` : '现在没有进行中的作战'}
      </div>
      <OrgButton small onClick={() => setCreateOpen(true)}>＋ 发起作战</OrgButton>
    </div>
  );

  return (
    <div className="space-y-3">
      {head}

      {board.active.length === 0 && (
        <OrgPanel seed={63}>
          <div className="text-[15px] font-black" style={{ fontFamily: tone.titleFont }}>一起做一件事</div>
          <ul className="mt-2 space-y-1.5 text-[12px] font-semibold leading-relaxed" style={{ color: tone.sub }}>
            <li>· <b style={{ color: tone.ink }}>小作战</b>：一句话 + 截止日，选几个人，谁都能发。</li>
            <li>· <b style={{ color: tone.ink }}>大作战</b>：一个共同目标，每人分一条子任务（可以让 AI 拆），只有队长能发。</li>
            <li>· 发出去之后，每个人的任务里会多一条；做完一次就算，全员做完就是达成：每人 +6 SP，公告板上出一张达成卡。</li>
          </ul>
        </OrgPanel>
      )}

      {board.active.map(p => (
        <OpBoard
          key={p.op.id}
          view={view}
          p={p}
          tone={tone}
          attrName={attrNames[p.op.attr] ?? p.op.attr}
          blocked={blocked}
          busy={busy}
          onOut={() => setConfirm({ kind: 'out', p })}
          onCancel={() => setConfirm({ kind: 'cancel', p })}
          onWrite={(text) => run(() => writeMyPartFromUi(view.org.id, p.op.id, text), '写好了，任务里那条也跟着改了', '没存上，稍后再试')}
          onMore={p.op.initiatorId !== view.me.userId ? () => setMenuFor(p) : undefined}
        />
      ))}

      {board.history.length > 0 && (
        <div>
          <button type="button" onClick={() => setHistoryOpen(v => !v)} aria-expanded={historyOpen} className="flex w-full items-center justify-between py-1 text-left">
            <span className="text-[11px] font-black tracking-[0.2em]" style={{ color: tone.stageSub }}>最近 30 天结束的 {board.history.length} 场</span>
            <span className="text-[12px] font-black" style={{ color: tone.stageSub }}>{historyOpen ? '收起' : '展开'}</span>
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-2">
              {board.history.map(p => <OpHistoryRow key={p.op.id} p={p} tone={tone} view={view} />)}
            </div>
          )}
        </div>
      )}

      <OpCreateSheet view={view} open={createOpen} onClose={() => setCreateOpen(false)} onDone={(msg) => { setCreateOpen(false); onFlash(msg); }} />

      <ActionSheet
        isOpen={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor ? `「${menuFor.op.title}」` : undefined}
        actions={menuFor ? [
          { label: '举报这场作战', onClick: () => setReportFor(menuFor) },
          {
            label: blocked.has(menuFor.op.initiatorId) ? '解除屏蔽发起人' : '屏蔽发起人（只在本机生效）',
            onClick: () => {
              const on = blocked.has(menuFor.op.initiatorId);
              setMemberBlocked(menuFor.op.initiatorId, !on);
              onFlash(on ? '已解除屏蔽' : '已屏蔽，不再显示 Ta 的动态');
            },
          },
        ] : []}
      />
      <ActionSheet
        isOpen={!!reportFor}
        onClose={() => setReportFor(null)}
        title="举报的理由"
        actions={REPORT_REASONS.map(r => ({
          label: r.label,
          onClick: async () => {
            const p = reportFor;
            if (!p) return;
            // 原话副本：那句话 + 分工（管理员在后台看得到）
            const text = [p.op.title, ...Object.values(p.op.assignments)].join(' / ');
            try {
              await reportPostFromUi({ id: p.op.id, orgId: view.org.id, userId: p.op.initiatorId, kind: 'moment', text, snapshot: null, minutes: null, createdAt: p.op.createdAt }, r.id);
              onFlash('已举报，会在 2 天内处理');
            } catch (e) {
              onFlash(errText(e, '举报没发出去，稍后再试'));
            }
          },
        }))}
      />

      <ConfirmDialog
        isOpen={!!confirm}
        title={confirm?.kind === 'out' ? '这次不参加？' : `取消「${confirm?.p.op.title ?? ''}」？`}
        description={confirm?.kind === 'out'
          ? '你会从这场作战的名单里退出，任务里那条会收起来。退出之后不能再回来。'
          : '所有人任务里的这一条都会收起来，已经做完的不受影响。这一步不能撤销。'}
        tone="danger"
        confirmText={confirm?.kind === 'out' ? '不参加了' : '取消作战'}
        cancelText="再想想"
        onConfirm={doConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ── 进度板 ─────────────────────────────────────────────────────────────────────

function OpBoard({ view, p, tone, attrName, blocked, busy, onOut, onCancel, onWrite, onMore }: {
  view: OrgView;
  p: OpProgress;
  tone: OrgTone;
  attrName: string;
  blocked: Set<string>;
  busy: boolean;
  onOut: () => void;
  onCancel: () => void;
  onWrite: (text: string) => Promise<void>;
  /** 别人发起的才有：举报 / 屏蔽 */
  onMore?: () => void;
}) {
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const me = view.me.userId;
  const mine = p.rows.find(r => r.userId === me);
  const initiator = view.members.find(m => m.userId === p.op.initiatorId);
  const canCancel = p.op.initiatorId === me || view.org.leaderId === me;
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState('');
  const pct = p.counted ? Math.round((p.done / p.counted) * 100) : 0;
  const big = p.op.kind === 'big';
  const accent = tone.channel === 'p5' ? P5R.red : tone.accent;

  const save = async () => {
    const t = draft.trim();
    if (!t) return;
    await onWrite(t);
    setWriting(false);
  };

  return (
    <OrgPanel seed={p.op.id.charCodeAt(0) % 9 + 71}>
      <div className="flex flex-wrap items-center gap-1.5">
        <KindChip tone={tone} big={big} />
        <DueChip tone={tone} daysLeft={p.daysLeft} />
        <span className="ml-auto text-[11px] font-black tabular-nums" style={{ color: tone.sub }}>{md(p.op.deadline)}截止</span>
        {onMore && <button type="button" onClick={onMore} aria-label="更多操作" className="-mr-1 shrink-0 px-1.5 text-[18px] font-black leading-none" style={{ color: tone.sub }}>⋯</button>}
      </div>
      <div className="mt-2 break-words text-[18px] font-black leading-snug" style={{ fontFamily: tone.titleFont }}>
        {big && <span className="mr-1 text-[12px] font-black align-middle" style={{ color: accent }}>共同目标</span>}
        {p.op.title}
      </div>
      <div className="mt-1 text-[11px] font-bold" style={{ color: tone.sub }}>
        {initiator ? `${displayCodename(initiator)} 发起` : '发起人已离开'} · 练 {attrName}
      </div>

      <ProgressBar tone={tone} pct={pct} label={`${p.done} / ${p.counted} 人做完`} />

      <ul className="mt-3 space-y-1.5">
        {p.rows.map(r => (
          <OpRowItem key={r.userId} tone={tone} r={r} big={big} mine={r.userId === me} dim={blocked.has(r.userId)}>
            {r.userId === me && r.state === 'todo' && (
              <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[32px]">
                {/* 蓝频道高亮行是浅青底：幽灵按钮会融进去，换成实心的 */}
                <OrgButton small tone={tone.channel === 'p3' ? 'primary' : 'ghost'} onClick={() => setCurrentPage('todos')}>去任务里完成</OrgButton>
                {big && r.source !== 'assigned' && !writing && (
                  <OrgButton small tone={tone.channel === 'p3' ? 'primary' : 'ghost'} onClick={() => { setDraft(r.source === 'plan' ? r.task : ''); setWriting(true); }}>{r.source === 'plan' ? '改写我的一份' : '写下我的一份'}</OrgButton>
                )}
              </div>
            )}
          </OpRowItem>
        ))}
      </ul>

      {writing && mine && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-[12px] font-bold">我负责的那一份</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: tone.sub }}>{[...draft].length} / {ORG_OP_TASK_MAX}</span>
          </div>
          <input
            value={draft}
            onChange={e => setDraft([...e.target.value].slice(0, ORG_OP_TASK_MAX).join(''))}
            placeholder="比如：整理第三章的笔记"
            aria-label="我负责的那一份"
            className="block w-full px-3 py-2 text-[14px] font-bold outline-none"
            style={orgInputSkin(tone)}
          />
          <div className="mt-2 flex gap-2">
            <OrgButton small tone="ghost" onClick={() => setWriting(false)} disabled={busy}>取消</OrgButton>
            <OrgButton small onClick={() => void save()} disabled={busy || !draft.trim()}>{busy ? '保存中…' : '保存'}</OrgButton>
          </div>
        </div>
      )}

      {(mine?.state === 'todo' || canCancel) && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-2.5" style={{ borderColor: tone.channel === 'p5' ? 'rgba(0,0,0,0.12)' : 'rgba(127,127,127,0.18)' }}>
          {mine?.state === 'todo' && <TextAction tone={tone} onClick={onOut} disabled={busy}>这次不参加</TextAction>}
          {canCancel && <TextAction tone={tone} onClick={onCancel} disabled={busy} danger>取消作战</TextAction>}
        </div>
      )}
    </OrgPanel>
  );
}

function OpRowItem({ tone, r, big, mine, dim, children }: { tone: OrgTone; r: OpRow; big: boolean; mine: boolean; dim: boolean; children?: ReactNode }) {
  const state = r.state === 'done' ? '✓ 做完了' : r.state === 'out' ? '不参加' : r.state === 'gone' ? '已离开' : '进行中';
  const off = r.state === 'out' || r.state === 'gone';
  const hi: CSSProperties = mine && r.state === 'todo'
    ? tone.channel === 'p3'
      ? { background: P3R.cyanFaint, clipPath: slantClip(6) }
      : tone.channel === 'p5'
        ? { background: 'rgba(192,0,8,0.08)', clipPath: roughQuad(3.7, 2.5) }
        : tone.channel === 'p4'
          ? { background: 'rgba(249,161,27,0.18)', borderRadius: 10 }
          : { background: 'rgba(99,102,241,0.08)', borderRadius: 10 }
    : {};
  const doneColor = tone.channel === 'p3' ? P3R.blue : tone.channel === 'p5' ? P5R.red : tone.channel === 'p4' ? '#1668d8' : '#10b981';
  return (
    <li className="px-2 py-1.5" style={{ ...hi, opacity: dim ? 0.5 : 1 }}>
      <div className="flex items-center gap-2.5">
        <MemberFace
          member={r.member}
          className="h-[34px] w-[22px] shrink-0"
          style={{ borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 4 : 0, filter: off ? 'grayscale(1)' : undefined, opacity: off ? 0.55 : 1 }}
          empty={<span className="absolute inset-0 flex items-center justify-center text-[10px] font-black">{[...r.codename][0] ?? '?'}</span>}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`truncate text-[13px] font-black ${off ? 'line-through' : ''}`} style={{ color: off ? tone.sub : undefined }}>{r.codename}</span>
            {mine && <span className="shrink-0 text-[10px] font-black" style={{ color: tone.channel === 'p5' ? P5R.red : tone.accent }}>我</span>}
          </div>
          {big && !off && (
            <div className="truncate text-[12px] font-bold" style={{ color: r.state === 'done' ? tone.sub : tone.ink }}>
              {r.source === 'goal' ? <span style={{ color: tone.sub }}>还没写自己那一份（先做共同目标）</span> : r.task}
            </div>
          )}
        </div>
        <span className="shrink-0 text-[11px] font-black" style={{ color: r.state === 'done' ? doneColor : tone.sub }}>{state}</span>
      </div>
      {children}
    </li>
  );
}

// ── 历史 ─────────────────────────────────────────────────────────────────────────

function OpHistoryRow({ p, tone, view }: { p: OpProgress; tone: OrgTone; view: OrgView }) {
  const label = p.status === 'achieved' ? '达成' : p.status === 'failed' ? '未达成' : '已取消';
  const day = p.status === 'achieved' ? p.achievedDay : p.status === 'cancelled' ? undefined : p.op.deadline;
  const on = p.status === 'achieved';
  const chip: CSSProperties = on
    ? tone.channel === 'p3' ? { background: P3R.blue, color: '#fff', clipPath: slantClip(3) }
      : tone.channel === 'p5' ? { background: P5R.red, color: P5R.white, clipPath: roughQuad(2.4, 1.5), fontFamily: P5_TITLE_FONT }
        : tone.channel === 'p4' ? { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 999, boxShadow: '0 0 0 1px #131313' }
          : { background: '#10b981', color: '#fff', borderRadius: 999 }
    : { color: tone.channel === 'p5' ? P5R.greyLight : tone.stageSub, boxShadow: `inset 0 0 0 1px ${tone.channel === 'p5' ? 'rgba(240,233,223,0.4)' : 'rgba(127,127,127,0.45)'}`, borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0 };
  return (
    <div className="flex items-center gap-2.5 py-1" style={{ color: tone.stageInk }}>
      <span className="inline-flex shrink-0 items-center whitespace-nowrap px-1.5 py-[3px] text-[10px] font-black leading-none" style={chip}>{label}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{p.op.kind === 'big' ? '大作战 · ' : ''}{p.op.title}</span>
      <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: tone.stageSub }}>
        {p.done}/{Math.max(p.counted, p.done)} 人{day ? ` · ${md(day)}` : ''}{view.org.tz ? '' : ''}
      </span>
    </div>
  );
}

// ── 小件 ─────────────────────────────────────────────────────────────────────────

function KindChip({ tone, big }: { tone: OrgTone; big: boolean }) {
  const text = big ? '大作战' : '小作战';
  const style: CSSProperties = tone.channel === 'p3'
    ? { background: big ? P3R.magenta : P3R.blue, color: '#ffffff', clipPath: slantClip(4) }
    : tone.channel === 'p5'
      ? { background: big ? P5R.red : P5R.ink, color: P5R.white, clipPath: roughQuad(big ? 3.1 : 2.1, 2), fontFamily: P5_TITLE_FONT }
      : tone.channel === 'p4'
        ? { background: big ? 'var(--p4-orange, #f9a11b)' : '#131313', color: big ? '#131313' : '#fff6d0', borderRadius: 999, boxShadow: big ? '0 0 0 1.5px #131313' : undefined }
        : { background: big ? '#f43f5e' : 'var(--ui-accent, #6366f1)', color: '#ffffff', borderRadius: 999 };
  return <span className="inline-flex shrink-0 items-center whitespace-nowrap px-2 py-[3px] text-[11px] font-black leading-none" style={style}>{text}</span>;
}

function DueChip({ tone, daysLeft }: { tone: OrgTone; daysLeft: number }) {
  const urgent = daysLeft <= 1;
  const text = daysLeft <= 0 ? '今天截止' : daysLeft === 1 ? '明天截止' : `还剩 ${daysLeft} 天`;
  const style: CSSProperties = {
    color: urgent ? (tone.channel === 'p5' ? P5R.red : tone.hot) : tone.sub,
    boxShadow: `inset 0 0 0 1.2px ${urgent ? (tone.channel === 'p5' ? P5R.red : tone.hot) : 'rgba(127,127,127,0.45)'}`,
    borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0,
    clipPath: tone.channel === 'p3' ? slantClip(4) : undefined,
  };
  return <span className="inline-flex shrink-0 items-center whitespace-nowrap px-2 py-[3px] text-[11px] font-black leading-none tabular-nums" style={style}>{text}</span>;
}

function ProgressBar({ tone, pct, label }: { tone: OrgTone; pct: number; label: string }) {
  const track: CSSProperties = tone.channel === 'p3'
    ? { background: P3R.cyanFaint, clipPath: slantClip(4) }
    : tone.channel === 'p5'
      ? { background: 'rgba(0,0,0,0.12)', clipPath: roughQuad(5.3, 1.5) }
      : tone.channel === 'p4'
        ? { background: '#ffffff', borderRadius: 999, boxShadow: '0 0 0 2px #131313' }
        : { background: 'rgba(127,127,127,0.16)', borderRadius: 999 };
  const fill = tone.channel === 'p3' ? P3R.blue : tone.channel === 'p5' ? P5R.red : tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-accent, #6366f1)';
  return (
    <div className="mt-3">
      <div className="relative h-2.5 overflow-hidden" style={track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <motion.div className="absolute inset-y-0 left-0" style={{ background: fill, borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0 }} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.45, ease: 'easeOut' }} />
      </div>
      <div className="mt-1 text-right text-[11px] font-black tabular-nums" style={{ color: tone.sub }}>{label}</div>
    </div>
  );
}

function TextAction({ tone, onClick, disabled, danger = false, children }: { tone: OrgTone; onClick: () => void; disabled?: boolean; danger?: boolean; children: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="px-1.5 py-1 text-[12px] font-black disabled:opacity-40" style={{ color: danger ? (tone.channel === 'p5' ? P5R.red : '#e11d48') : tone.sub }}>
      {children}
    </button>
  );
}
