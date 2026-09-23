/**
 * 一起进步（v2.7.0.6）的两个弹层：发起约定 / 回应邀请。样式跟 COOP 提议弹层走同一套（羁绊色渐变）。
 *
 * 发起：选「每日打卡 / 一次性目标」×「共同目标 / 不同目标」，写任务，选天数或截止日，
 *       再选自己这条待办加到哪个属性、几点（本机偏好，不上服务器）。
 * 回应：看清对方的约定；不同目标时写自己要做的事；选属性和点数；接受或婉拒。
 */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore, toLocalDateKey } from '@/store';
import { proposePact, answerPact, DEFAULT_PACT_PREFS, type PactPrefs } from '@/services/pactSync';
import { PACT_TITLE_MAX } from '@/services/coopPacts';
import { PACT_DAYS_OPTIONS, addDays, partnerNameOf } from '@/utils/pactLogic';
import type { AttributeId, CoopPact, PactKind, PactMode } from '@/types';

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const BOND_GRAD = 'linear-gradient(135deg, rgb(var(--color-bond-rgb)), rgb(var(--color-bond-bright-rgb)))';

const md = (k: string) => { const d = new Date(`${k}T12:00:00`); return `${d.getMonth() + 1}月${d.getDate()}日`; };

/** 一份约定的一句话说明（邀请 / 面板 / 通知共用） */
export function describePactTerms(p: { kind: PactKind; mode: PactMode; days: number; deadline?: string }): string {
  const when = p.kind === 'daily' ? (p.days ? `每天打卡 · ${p.days} 天` : '每天打卡 · 不设期限') : `一次性目标 · ${p.deadline ? `${md(p.deadline)}前` : '无截止日'}`;
  return `${when} · ${p.mode === 'same' ? '共同目标' : '各做各的'}`;
}

function Shell({ open, onClose, eyebrow, title, subtitle, children, footer }: {
  open: boolean; onClose: () => void; eyebrow: string; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md max-h-[92vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div
              className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3"
              style={{ background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb) / 0.08), rgb(var(--color-bond-bright-rgb) / 0.04))' }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-[0.4em] font-bold text-indigo-500">{eyebrow}</div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white mt-0.5">{title}</h2>
                {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center" aria-label="关闭">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">{children}</div>
            {footer && <div className="p-4 border-t border-gray-100 dark:border-gray-800">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** 同一套弹层壳，给「一起进步」详情弹窗（PactPanel.PactPanelModal）用 */
export const PactShell = Shell;

function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1.5">{children}</div>;
}

/** compact：一排放得下四个的短选项（约多久），不换行、字居中 */
function Seg<T extends string | number>({ value, options, onChange, compact = false }: { value: T; options: Array<{ v: T; label: string; hint?: string }>; onChange: (v: T) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => {
        const on = o.v === value;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={on}
            className={`flex-1 min-w-[64px] rounded-xl py-2 text-xs font-bold border transition-colors ${compact ? 'px-2 text-center whitespace-nowrap' : 'px-3 text-left'} ${
              on ? 'text-white border-transparent shadow-sm' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'
            }`}
            style={on ? { background: BOND_GRAD } : undefined}
          >
            <div>{o.label}</div>
            {o.hint && <div className={`mt-0.5 text-[10px] font-medium ${on ? 'text-white/85' : 'text-gray-400 dark:text-gray-500'}`}>{o.hint}</div>}
          </button>
        );
      })}
    </div>
  );
}

/** 自己这条待办加到哪些属性：最多两个，各自几点（第二个落成待办的副奖励） */
function PrefsPicker({ value, onChange }: { value: PactPrefs; onChange: (v: PactPrefs) => void }) {
  const names = useAppStore(s => s.settings.attributeNames);
  const picked: Array<{ attribute: AttributeId; points: number }> = [
    { attribute: value.attribute, points: value.points },
    ...(value.extra ? [value.extra] : []),
  ];
  const emit = (list: typeof picked) => onChange({
    attribute: list[0].attribute,
    points: list[0].points,
    ...(list[1] ? { extra: list[1] } : {}),
  });
  const toggle = (a: AttributeId) => {
    const idx = picked.findIndex(x => x.attribute === a);
    if (idx >= 0) {
      if (picked.length > 1) emit(picked.filter((_, i) => i !== idx)); // 至少留一个
      return;
    }
    // 已经选了两个：换掉后选的那个
    emit(picked.length >= 2 ? [picked[0], { attribute: a, points: picked[1].points }] : [...picked, { attribute: a, points: 1 }]);
  };
  const setPoints = (i: number, n: number) =>
    emit(picked.map((x, j) => (j === i ? { ...x, points: Math.max(1, Math.min(5, n)) } : x)));
  return (
    <div>
      <Label>完成时加到（最多两项）</Label>
      <div className="flex flex-wrap gap-1.5">
        {ATTRS.map(a => {
          const on = picked.some(x => x.attribute === a);
          return (
            <button
              key={a}
              type="button"
              onClick={() => toggle(a)}
              aria-pressed={on}
              className={`rounded-full px-3 py-1.5 text-xs font-bold border ${
                on ? 'text-white border-transparent' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}
              style={on ? { background: BOND_GRAD } : undefined}
            >
              {names[a]}
            </button>
          );
        })}
      </div>
      <div className="mt-2 space-y-1.5">
        {picked.map((x, i) => (
          <div key={x.attribute} className="flex items-center gap-3">
            <span className="w-14 truncate text-[11px] font-bold text-gray-600 dark:text-gray-300">{names[x.attribute]}</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">每次</span>
            <button type="button" aria-label={`${names[x.attribute]}减一点`} onClick={() => setPoints(i, x.points - 1)}
              className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-black">−</button>
            <span className="w-8 text-center text-sm font-black tabular-nums text-gray-800 dark:text-white">+{x.points}</span>
            <button type="button" aria-label={`${names[x.attribute]}加一点`} onClick={() => setPoints(i, x.points + 1)}
              className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-black">＋</button>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">点</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

// ── 发起 ─────────────────────────────────────────────────────────────────────

export function PactProposeModal({ open, onClose, partnerId, partnerName, isConfidant }: {
  open: boolean; onClose: () => void; partnerId: string; partnerName: string; isConfidant: boolean;
}) {
  const today = toLocalDateKey();
  const [kind, setKind] = useState<PactKind>('daily');
  const [mode, setMode] = useState<PactMode>('same');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState<number>(7);
  const [deadline, setDeadline] = useState(addDays(today, 7));
  const [message, setMessage] = useState('');
  const [prefs, setPrefs] = useState<PactPrefs>(DEFAULT_PACT_PREFS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('daily'); setMode('same'); setTitle(''); setDays(7); setDeadline(addDays(toLocalDateKey(), 7));
    setMessage(''); setPrefs(DEFAULT_PACT_PREFS); setBusy(false); setError(''); setSent(false);
  }, [open]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await proposePact({ toId: partnerId, kind, mode, title, days: kind === 'daily' ? days : 0, deadline: kind === 'once' ? deadline : undefined, message }, prefs);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setBusy(false);
    }
  };

  const canSend = title.trim().length > 0 && (kind === 'daily' || deadline >= today);

  return (
    <Shell
      open={open}
      onClose={onClose}
      eyebrow="TOGETHER · 一起进步"
      title={`和 ${partnerName} 一起进步`}
      subtitle={isConfidant
        ? '约好一件事各自去做。同一天两人都完成，你们的亲密度 +1；连续同步满 7 天再 +2。'
        : '约好一件事各自去做，互相看得到进度，没完成可以催一下。（普通好友不涨亲密度）'}
      footer={sent ? (
        <button onClick={onClose} className="w-full py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">好的</button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} disabled={busy} className="py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-40">再想想</button>
          <button onClick={() => void submit()} disabled={!canSend || busy} className="py-2.5 rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-40" style={{ background: BOND_GRAD }}>
            {busy ? '发送中…' : '发出邀请'}
          </button>
        </div>
      )}
    >
      {sent ? (
        <div className="text-center py-6">
          <div className="text-5xl mb-3">✦</div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">邀请已送出</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            {partnerName} 接受后，这件事会出现在你们各自的今日任务里。<br />3 天没回应会自动过期。
          </p>
        </div>
      ) : (
        <>
          <div>
            <Label>怎么约</Label>
            <Seg value={kind} onChange={setKind} options={[
              { v: 'daily', label: '每日打卡', hint: '一段时间里每天各做一次' },
              { v: 'once', label: '一次性目标', hint: '截止日前各完成一次' },
            ]} />
          </div>
          <div>
            <Label>目标</Label>
            <Seg value={mode} onChange={setMode} options={[
              { v: 'same', label: '共同目标', hint: '两人做同一件事' },
              { v: 'different', label: '不同目标', hint: `各做各的，${partnerName} 接受时写 Ta 的` },
            ]} />
          </div>
          <div>
            <Label>{mode === 'same' ? '一起做的事' : '你这边要做的事'}</Label>
            <input
              className={inputCls}
              value={title}
              maxLength={PACT_TITLE_MAX}
              onChange={e => setTitle(e.target.value)}
              placeholder={kind === 'daily' ? (mode === 'same' ? '比如：背 50 个单词' : '比如：晨跑 3 公里') : (mode === 'same' ? '比如：读完一本书' : '比如：把简历改完')}
            />
          </div>
          {kind === 'daily' ? (
            <div>
              <Label>约多久</Label>
              <Seg compact value={days} onChange={setDays} options={PACT_DAYS_OPTIONS.map(d => ({ v: d as number, label: d ? `${d} 天` : '不设期限' }))} />
            </div>
          ) : (
            <div>
              <Label>截止日</Label>
              <input type="date" className={inputCls} value={deadline} min={today} onChange={e => setDeadline(e.target.value)} />
            </div>
          )}
          <PrefsPicker value={prefs} onChange={setPrefs} />
          <div>
            <Label>对 {partnerName} 说一句（可选）</Label>
            <input className={inputCls} value={message} maxLength={120} onChange={e => setMessage(e.target.value)} placeholder="比如：这次一起坚持下来" />
          </div>
          {error && <p className="text-[11px] text-rose-500">{error}</p>}
        </>
      )}
    </Shell>
  );
}

// ── 回应 ─────────────────────────────────────────────────────────────────────

export function PactAcceptModal({ open, onClose, pact }: { open: boolean; onClose: () => void; pact: CoopPact | null }) {
  const [titleTo, setTitleTo] = useState('');
  const [prefs, setPrefs] = useState<PactPrefs>(DEFAULT_PACT_PREFS);
  const [busy, setBusy] = useState<'' | 'accept' | 'decline'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<'' | 'accepted' | 'declined'>('');

  useEffect(() => {
    if (!open) return;
    setTitleTo(''); setPrefs(DEFAULT_PACT_PREFS); setBusy(''); setError(''); setDone('');
  }, [open, pact?.id]);

  if (!pact) return null;
  const name = partnerNameOf(pact);
  const expired = pact.status !== 'pending';

  const answer = async (accept: boolean) => {
    if (busy) return;
    setBusy(accept ? 'accept' : 'decline');
    setError('');
    try {
      await answerPact(pact.id, accept, { titleTo, prefs });
      setDone(accept ? 'accepted' : 'declined');
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy('');
    }
  };

  return (
    <Shell
      open={open}
      onClose={onClose}
      eyebrow="TOGETHER · 邀请"
      title={`${name} 想和你一起进步`}
      subtitle={describePactTerms(pact)}
      footer={done || expired ? (
        <button onClick={onClose} className="w-full py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">好的</button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => void answer(false)} disabled={!!busy} className="py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/30 disabled:opacity-40">
            {busy === 'decline' ? '…' : '婉拒'}
          </button>
          <button
            onClick={() => void answer(true)}
            disabled={!!busy || (pact.mode === 'different' && !titleTo.trim())}
            className="py-2.5 rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-40"
            style={{ background: BOND_GRAD }}
          >
            {busy === 'accept' ? '处理中…' : '接受'}
          </button>
        </div>
      )}
    >
      {done ? (
        <div className="text-center py-6">
          <div className="text-5xl mb-3">{done === 'accepted' ? '✦' : '·'}</div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">{done === 'accepted' ? '约好了' : '已婉拒'}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            {done === 'accepted' ? '这件事已经放进你的今日任务，完成就算打卡。' : `${name} 会收到你的回应。`}
          </p>
        </div>
      ) : expired ? (
        <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">这份邀请已经不能回应了（已处理或过期）。</p>
      ) : (
        <>
          <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-4">
            <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{pact.mode === 'same' ? '一起做的事' : `${name} 要做的事`}</div>
            <div className="mt-1 text-sm font-black text-gray-900 dark:text-white">「{pact.titleFrom}」</div>
            {pact.message && <div className="mt-2 text-[12px] text-gray-600 dark:text-gray-300">「{pact.message}」</div>}
          </div>
          {pact.mode === 'different' && (
            <div>
              <Label>你这边要做的事</Label>
              <input className={inputCls} value={titleTo} maxLength={PACT_TITLE_MAX} onChange={e => setTitleTo(e.target.value)} placeholder="比如：每天读 20 页书" />
            </div>
          )}
          <PrefsPicker value={prefs} onChange={setPrefs} />
          {error && <p className="text-[11px] text-rose-500">{error}</p>}
        </>
      )}
    </Shell>
  );
}
