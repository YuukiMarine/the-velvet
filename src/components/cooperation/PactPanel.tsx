/**
 * 一起进步面板（v2.7.0.6）：放在好友资料卡（普通好友 / 在线同伴都会打开它）和在线同伴详情里。
 *
 * 状态：
 *   · 没有约定 → 说明 + 「发起一起进步」
 *   · 我发出的邀请 → 等回应，可撤回
 *   · 发给我的邀请 → 查看并回应
 *   · 进行中 → 第几天 / 同步几天 / 连续几天，今天两边的完成情况，「催一下」「结束约定」
 * 在线同伴同一天都完成涨亲密度；普通好友只一起打卡。
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { P3R, slantClip } from '@/components/p3r/kit';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { toLocalDateKey } from '@/store';
import { nudgePartner, endPactFromUi } from '@/services/pactSync';
import {
  isPactLive, myTitle, pactDayIndex, pactTodayView, syncStreak, syncedDays, theirTitle,
} from '@/utils/pactLogic';
import { PactAcceptModal, PactProposeModal, PactShell, describePactTerms } from './PactModals';
import { usePactStatus } from './PactTag';

const BOND_GRAD = 'linear-gradient(135deg, rgb(var(--color-bond-rgb)), rgb(var(--color-bond-bright-rgb)))';
const md = (k: string) => { const d = new Date(`${k}T12:00:00`); return `${d.getMonth() + 1}月${d.getDate()}日`; };

/**
 * surface='night'：放在固定深紫底的好友资料卡里（不跟主题走），字色整体翻浅。
 * bare：不要外框和「TOGETHER 一起进步」小标题（放进选项卡 / 弹窗时，外面已经写着了）。
 */
export function PactPanel({ partnerId, partnerName, isConfidant, surface = 'default', bare = false, proposeLabel = '发起一起进步' }: {
  partnerId: string; partnerName: string; isConfidant: boolean; surface?: 'default' | 'night'; bare?: boolean;
  /** 「发起」按钮的字（名片的 TOGETHER 选项卡里叫「发起共同行动」） */
  proposeLabel?: string;
}) {
  const me = useCloudStore(s => s.cloudUser?.id);
  const pact = useCloudSocialStore(s => s.pacts.find(p => isPactLive(p) && (p.fromId === partnerId || p.toId === partnerId)));
  const [proposeOpen, setProposeOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [busy, setBusy] = useState<'' | 'nudge' | 'end'>('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState('');

  const run = async (kind: 'nudge' | 'end', fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(kind);
    setError('');
    try { await fn(); } catch (err) { setError(err instanceof Error ? err.message : '操作失败'); } finally { setBusy(''); setConfirmEnd(false); }
  };

  const night = surface === 'night';
  const c = {
    shell: night ? 'border-[rgba(196,181,253,0.22)] bg-white/[0.03]' : 'border-pink-500/20 bg-pink-500/[0.04]',
    heading: night ? 'text-[#f5e6ff]' : 'text-gray-800 dark:text-white',
    title: night ? 'text-[#f5e6ff]' : 'text-gray-800 dark:text-gray-100',
    sub: night ? 'text-[#a89dc0]' : 'text-gray-500 dark:text-gray-400',
    hint: night ? 'text-[#8f86ad]' : 'text-gray-400 dark:text-gray-500',
    idle: night ? 'bg-white/[0.06] text-[#cfc6e8]' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
    ghost: night ? 'bg-white/10 text-[#e6dcff]' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
    done: night ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    nudged: night ? 'text-rose-300' : 'text-rose-500',
  };
  const today = toLocalDateKey();
  let body: JSX.Element;
  if (!me) {
    body = <p className={`text-[11px] ${c.sub}`}>登录后可以和 {partnerName} 约一起进步。</p>;
  } else if (!pact) {
    body = (
      <>
        {bare && <div className="mb-2 text-center text-2xl" style={{ color: 'rgb(var(--color-bond-bright-rgb))' }} aria-hidden>✦</div>}
        <p className={`text-[11px] leading-relaxed ${c.sub} ${bare ? 'text-center' : ''}`}>
          约好一件事各自去做：每天打卡，或者截止日前各完成一次。{isConfidant ? '同一天两人都完成，亲密度 +1。' : '互相看得到进度，没完成可以催一下。'}
        </p>
        <button onClick={() => setProposeOpen(true)} className="mt-2.5 w-full py-2 rounded-xl text-xs font-bold text-white shadow-sm" style={{ background: BOND_GRAD }}>
          {proposeLabel}
        </button>
      </>
    );
  } else if (pact.status === 'pending') {
    const mine = pact.fromId === me;
    body = mine ? (
      <>
        <div className={`text-[12px] font-bold ${c.title}`}>已邀请：「{pact.titleFrom}」</div>
        <div className={`mt-0.5 text-[11px] ${c.sub}`}>{describePactTerms(pact)} · 等 {partnerName} 回应（3 天内有效）</div>
        <button onClick={() => void run('end', () => endPactFromUi(pact.id))} disabled={!!busy}
          className={`mt-2.5 w-full py-2 rounded-xl text-xs font-semibold disabled:opacity-40 ${c.ghost}`}>
          {busy === 'end' ? '…' : '撤回邀请'}
        </button>
      </>
    ) : (
      <>
        <div className={`text-[12px] font-bold ${c.title}`}>{partnerName} 邀请你：「{pact.titleFrom}」</div>
        <div className={`mt-0.5 text-[11px] ${c.sub}`}>{describePactTerms(pact)}</div>
        <button onClick={() => setAcceptOpen(true)} className="mt-2.5 w-full py-2 rounded-xl text-xs font-bold text-white shadow-sm" style={{ background: BOND_GRAD }}>
          查看并回应
        </button>
      </>
    );
  } else {
    const v = pactTodayView(pact, me, today);
    const idx = pactDayIndex(pact, today);
    const synced = syncedDays(pact).length;
    const streak = syncStreak(pact, today);
    const titles = pact.mode === 'same'
      ? <div className={`text-[12px] font-bold ${c.title}`}>「{pact.titleFrom}」</div>
      : (
        <div className={`space-y-0.5 text-[12px] font-bold ${c.title}`}>
          <div>你：「{myTitle(pact, me)}」</div>
          <div>{partnerName}：「{theirTitle(pact, me)}」</div>
        </div>
      );
    const progress = pact.kind === 'daily'
      ? `第 ${idx} 天${pact.days ? ` / 共 ${pact.days} 天` : ''} · 同步 ${synced} 天${streak >= 2 ? ` · 连续 ${streak} 天` : ''}`
      : `截止 ${pact.deadline ? md(pact.deadline) : '—'}`;
    const doneWord = pact.kind === 'daily' ? '今天' : '';
    body = (
      <>
        {titles}
        <div className={`mt-0.5 text-[11px] ${c.sub}`}>{progress}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold">
          <div className={`rounded-xl px-2.5 py-1.5 ${v.mineDone ? c.done : c.idle}`}>
            你{doneWord}：{v.mineDone ? '已完成 ✓' : '还没完成'}
          </div>
          <div className={`rounded-xl px-2.5 py-1.5 ${v.theirsDone ? c.done : c.idle}`}>
            {partnerName}{doneWord}：{v.theirsDone ? '已完成 ✓' : '还没完成'}
          </div>
        </div>
        {v.nudgedMe && !v.mineDone && <p className={`mt-2 text-[11px] font-bold ${c.nudged}`}>{partnerName} 今天催你了</p>}
        {isConfidant && pact.kind === 'daily' && <p className={`mt-2 text-[10px] ${c.hint}`}>同一天都完成，亲密度 +1；连续同步满 7 天再 +2。</p>}
        {confirmEnd ? (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmEnd(false)} className={`py-2 rounded-xl text-xs font-semibold ${c.ghost}`}>不结束</button>
            <button onClick={() => void run('end', () => endPactFromUi(pact.id))} disabled={!!busy}
              className="py-2 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/30 disabled:opacity-40">
              {busy === 'end' ? '…' : '确定结束'}
            </button>
          </div>
        ) : (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              onClick={() => void run('nudge', () => nudgePartner(pact.id))}
              disabled={!!busy || v.theirsDone || v.iNudged}
              className="py-2 rounded-xl text-xs font-bold text-white shadow-sm disabled:opacity-40"
              style={{ background: BOND_GRAD }}
            >
              {busy === 'nudge' ? '…' : v.theirsDone ? `${partnerName} 已完成` : v.iNudged ? '今天催过了' : '催一下'}
            </button>
            <button onClick={() => setConfirmEnd(true)} className={`py-2 rounded-xl text-xs font-semibold ${c.ghost}`}>
              结束约定
            </button>
          </div>
        )}
      </>
    );
  }

  const content = (
    <>
      {body}
      {error && <p className="mt-2 text-[11px] text-rose-500">{error}</p>}
      <PactProposeModal open={proposeOpen} onClose={() => setProposeOpen(false)} partnerId={partnerId} partnerName={partnerName} isConfidant={isConfidant} />
      <PactAcceptModal open={acceptOpen} onClose={() => setAcceptOpen(false)} pact={pact ?? null} />
    </>
  );
  if (bare) return <div>{content}</div>;
  return (
    <div className={`rounded-2xl border p-3.5 ${c.shell}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] tracking-[0.3em] font-black" style={{ color: 'rgb(var(--color-bond-rgb))' }}>TOGETHER</span>
        <span className={`text-xs font-black ${c.heading}`}>一起进步</span>
      </div>
      {content}
    </div>
  );
}

/** 在线同伴详情页「一起进步」快捷入口点开的弹窗：内容就是这块面板 */
export function PactPanelModal({ open, onClose, partnerId, partnerName, isConfidant }: {
  open: boolean; onClose: () => void; partnerId: string; partnerName: string; isConfidant: boolean;
}) {
  return (
    <PactShell open={open} onClose={onClose} eyebrow="TOGETHER · 一起进步" title={`和 ${partnerName} 一起进步`}>
      <PactPanel partnerId={partnerId} partnerName={partnerName} isConfidant={isConfidant} bare />
    </PactShell>
  );
}

/**
 * 在线同伴详情页「今日互动」旁边的「立下约定」快捷入口（点开弹 PactPanelModal）。
 * 副标题是今天的约定状态；需要你动一下（待回应 / 被催）时右上角亮个点。
 * 配色和「今日互动」错开一档：P3 用比主蓝浅一档的斜块（主蓝罩一层两成白，粉 / 夜间变体跟着换）+ 青色角标，
 * 其它频道用羁绊色渐变。
 */
export function PactQuickEntry({ partnerId, onOpen, p3 }: { partnerId: string; onOpen: () => void; p3: boolean }) {
  const status = usePactStatus(partnerId);
  const sub = status?.text ?? '还没有约定';
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onOpen}
      className={p3
        ? 'relative flex h-[52px] w-full flex-col items-center justify-center text-white'
        : 'relative flex h-12 w-full flex-col items-center justify-center rounded-xl text-white shadow-lg'}
      style={p3
        ? { clipPath: slantClip(14), background: `linear-gradient(0deg, rgba(255,255,255,0.2), rgba(255,255,255,0.2)), ${P3R.blue}`, boxShadow: '0 12px 28px rgba(27,87,255,0.22)' }
        : { background: BOND_GRAD }}
    >
      <span className={p3 ? 'text-[15px] font-black leading-tight' : 'text-sm font-bold leading-tight'}>立下约定</span>
      <span className="mt-0.5 text-[10px] font-semibold leading-tight opacity-85">{sub}</span>
      {status?.tone === 'hot' && <span aria-hidden className="absolute right-4 top-2 h-2 w-2 rounded-full bg-rose-400" />}
      {p3 && (
        <span aria-hidden className="absolute bottom-0 right-4 h-[7px] w-[18px]" style={{ background: P3R.cyan, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
      )}
    </motion.button>
  );
}
