/**
 * 发起目标 / 作战（第 8 轮 · PRD §13.1 / §13.3；验收后的叫法：small = 目标，big = 作战）。
 *   · 类型：目标（任何成员）/ 作战（只有队长）；
 *   · 一句话（目标）/ 作战目标（作战），≤20 字、过屏蔽词；截止日（组织时区的今天 ~ 30 天后，带几个快捷档）；
 *   · 这次练哪个属性（参与者待办的默认属性）；参与者（成员小牌多选，默认全选，至少 2 人）；
 *   · 作战多一栏「分工」：每人一行子任务，可以空着（空着 = Ta 自己写）；「AI 拆解」一键填（没配 AI 时灰着）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SheetModal } from '@/components/SheetModal';
import { useAppStore } from '@/store';
import { P3R, slantClip } from '@/components/p3r/kit';
import { roughQuad } from '@/components/p5r/kit';
import { createOpFromUi } from '@/services/orgOpsSync';
import {
  OP_KIND_LABEL, ORG_OP_MIN_PEOPLE, ORG_OP_TASK_MAX, ORG_OP_TITLE_MAX, checkOpDraft, normalizeOpDraft, opDeadlineRange, type OpDraft,
} from '@/utils/orgOps';
import { hasOpsAI, splitOperationAI } from '@/utils/orgOpsAI';
import { displayCodename, shiftDayKey } from '@/utils/orgLogic';
import { MemberFace } from './MemberCard';
import { OrgButton, useOrgTone } from './orgUi';
import type { AttributeId, OrgOpKind, OrgView } from '@/types';

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[15px] font-bold text-gray-900 outline-none focus:border-indigo-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white';
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function OpCreateSheet({ view, open, onClose, onDone }: { view: OrgView; open: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const tone = useOrgTone();
  const settings = useAppStore(s => s.settings);
  const attrNames = settings.attributeNames;
  const leader = view.org.leaderId === view.me.userId;
  const range = useMemo(() => opDeadlineRange(view.org.tz), [view.org.tz, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [kind, setKind] = useState<OrgOpKind>('small');
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(range.min);
  const [attr, setAttr] = useState<AttributeId>('knowledge');
  const [people, setPeople] = useState<string[]>([]);
  const [tasks, setTasks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const aiAbort = useRef<AbortController | null>(null);

  // 每次打开重置：默认全员、截止一周后
  useEffect(() => {
    if (!open) { aiAbort.current?.abort(); return; }
    setKind('small');
    setTitle('');
    setDeadline(shiftDayKey(range.min, 7));
    setAttr('knowledge');
    setPeople(view.members.map(m => m.userId));
    setTasks({});
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draft: OpDraft = { kind, attr, title, deadline, participants: people, assignments: tasks };
  const problem = checkOpDraft(normalizeOpDraft(draft, view.members), view);
  const chosen = view.members.filter(m => people.includes(m.userId));
  const aiOk = hasOpsAI(settings);
  const daysLeft = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${range.min}T00:00:00Z`)) / 86400000);

  const toggle = (uid: string) => setPeople(cur => (cur.includes(uid) ? cur.filter(x => x !== uid) : [...cur, uid]));

  const runAI = async () => {
    if (aiBusy || !title.trim() || chosen.length < ORG_OP_MIN_PEOPLE) return;
    setAiBusy(true);
    setError('');
    const ac = new AbortController();
    aiAbort.current = ac;
    try {
      const out = await splitOperationAI(settings, { goal: title.trim(), daysLeft, deadline, people: chosen }, ac.signal);
      if (!ac.signal.aborted) setTasks(cur => ({ ...cur, ...out }));
    } catch (e) {
      if (!ac.signal.aborted) setError(errText(e, 'AI 拆解没成功，稍后再试，或者自己写'));
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      const op = await createOpFromUi(view.org.id, draft);
      const inIt = op.participants.includes(view.me.userId);
      onDone(inIt ? '发出去了：你的任务里也多了一条' : '发出去了');
    } catch (e) {
      setError(errText(e, '没发出去，稍后再试'));
    } finally {
      setBusy(false);
    }
  };

  const pick = (on: boolean, seed: number) => ({
    background: on ? tone.accent : 'rgba(127,127,127,0.10)',
    color: on ? '#ffffff' : 'currentColor',
    borderRadius: tone.channel === 'p3' || tone.channel === 'p5' ? 0 : 12,
    clipPath: tone.channel === 'p3' ? slantClip(6) : tone.channel === 'p5' ? roughQuad(seed + 0.4, 2.5) : undefined,
  });

  const quick: Array<[string, number]> = [['今天', 0], ['3 天', 3], ['一周', 7], ['两周', 14], ['30 天', 30]];

  return (
    <SheetModal
      isOpen={open}
      onClose={() => { if (!busy) onClose(); }}
      title={`发起${OP_KIND_LABEL[kind]}`}
      busy={busy}
      maxHeightClass="max-h-[90vh]"
      footer={(
        <div className="px-4 pb-3 pt-2">
          {error && <p role="alert" className="mb-2 text-[12px] font-bold leading-relaxed text-rose-500">{error}</p>}
          <OrgButton onClick={() => void submit()} disabled={busy || !!problem} className="w-full">
            {busy ? '发出中…' : problem && title.trim() ? problem : `发起这个${OP_KIND_LABEL[kind]}`}
          </OrgButton>
        </div>
      )}
    >
      <div className="space-y-4 px-4 pb-4">
        <Field label="类型">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setKind('small')} aria-pressed={kind === 'small'} className="px-2 py-2 text-left" style={pick(kind === 'small', 1)}>
              <div className="text-[14px] font-black">{OP_KIND_LABEL.small}</div>
              <div className="mt-0.5 text-[11px] font-semibold opacity-80">一句话，大家做同一件事</div>
            </button>
            <button type="button" onClick={() => leader && setKind('big')} aria-pressed={kind === 'big'} disabled={!leader} className="px-2 py-2 text-left disabled:opacity-45" style={pick(kind === 'big', 2)}>
              <div className="text-[14px] font-black">{OP_KIND_LABEL.big}</div>
              <div className="mt-0.5 text-[11px] font-semibold opacity-80">{leader ? '一个作战目标，每人分一份' : '只有队长能发'}</div>
            </button>
          </div>
        </Field>

        <Field label={kind === 'big' ? '作战目标' : '这次一起做什么'} count={`${[...title].length} / ${ORG_OP_TITLE_MAX}`}>
          <input
            value={title}
            onChange={e => setTitle([...e.target.value].slice(0, ORG_OP_TITLE_MAX).join(''))}
            placeholder={kind === 'big' ? '比如：一起做完期末复习' : '比如：这周每人跑一次 5 公里'}
            className={inputCls}
            aria-label={kind === 'big' ? '作战目标' : '这次一起做什么'}
          />
        </Field>

        <Field label="截止日" count={daysLeft <= 0 ? '今天截止' : `${daysLeft} 天后`}>
          <div className="flex flex-wrap gap-1.5">
            {quick.map(([label, n], i) => {
              const d = shiftDayKey(range.min, n);
              return (
                <button key={label} type="button" onClick={() => setDeadline(d)} aria-pressed={deadline === d} className="px-2.5 py-1.5 text-[12px] font-black" style={pick(deadline === d, i + 3)}>{label}</button>
              );
            })}
          </div>
          <input type="date" value={deadline} min={range.min} max={range.max} onChange={e => setDeadline(e.target.value || range.min)} className={`${inputCls} mt-2`} aria-label="截止日" />
        </Field>

        <Field label="这次练哪个属性">
          <div className="grid grid-cols-5 gap-1.5">
            {ATTRS.map((a, i) => (
              <button key={a} type="button" onClick={() => setAttr(a)} aria-pressed={attr === a} className="truncate px-1 py-1.5 text-[12px] font-black" style={pick(attr === a, i + 9)}>{attrNames[a] ?? a}</button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">每个人任务里那一条默认加这个属性（+3），自己可以改。</p>
        </Field>

        <Field label="参与者" count={`${chosen.length} / ${view.members.length}`}>
          <div className="grid grid-cols-2 gap-1.5 min-[380px]:grid-cols-3">
            {view.members.map((m, i) => {
              const on = people.includes(m.userId);
              return (
                <button key={m.id} type="button" onClick={() => toggle(m.userId)} aria-pressed={on} aria-label={`${displayCodename(m)}${on ? '（已选）' : ''}`} className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-left" style={pick(on, i + 15)}>
                  <MemberFace member={m} className="h-[30px] w-[19px] shrink-0" style={{ borderRadius: 3 }} empty={<span className="absolute inset-0 flex items-center justify-center text-[9px] font-black">{[...displayCodename(m)][0]}</span>} />
                  <span className="min-w-0 truncate text-[12px] font-black">{displayCodename(m)}</span>
                  {m.userId === view.me.userId && <span className="-ml-1 shrink-0 text-[10px] font-black opacity-80">我</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">至少 {ORG_OP_MIN_PEOPLE} 人；你自己可以不参加。发出去之后名单就定了。</p>
        </Field>

        {kind === 'big' && (
          <Field label="分工（可以空着）">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runAI()}
                disabled={!aiOk || aiBusy || !title.trim() || chosen.length < ORG_OP_MIN_PEOPLE}
                className="inline-flex shrink-0 items-center gap-1 px-3 py-1.5 text-[12px] font-black disabled:opacity-40"
                style={{ ...pick(true, 21), background: tone.channel === 'p3' ? P3R.magenta : tone.accent }}
              >
                {aiBusy ? '拆解中…' : '✦ AI 拆解分工'}
              </button>
              <span className="min-w-0 text-[11px] font-semibold leading-snug text-gray-500 dark:text-gray-400">
                {aiOk ? (title.trim() ? '按作战目标和每个人的代表牌、面具拆，拆完还能改' : '先写作战目标') : '要先在「设置 → AI 服务」里填好 API Key'}
              </span>
            </div>
            <div className="space-y-2">
              {chosen.map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-[4.5em] shrink-0 truncate text-[12px] font-black">{displayCodename(m)}</span>
                  <input
                    value={tasks[m.userId] ?? ''}
                    onChange={e => setTasks(cur => ({ ...cur, [m.userId]: [...e.target.value].slice(0, ORG_OP_TASK_MAX).join('') }))}
                    placeholder="空着 = Ta 自己写"
                    aria-label={`${displayCodename(m)} 的子任务`}
                    className={`${inputCls} !py-2 !text-[14px]`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">空着的人会在作战里「写下我的一份」；没写之前，Ta 的任务就是作战目标本身。</p>
          </Field>
        )}
      </div>
    </SheetModal>
  );
}

function Field({ label, count, children }: { label: string; count?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-black text-gray-600 dark:text-gray-300">{label}</span>
        {count && <span className="text-[11px] font-bold tabular-nums text-gray-400">{count}</span>}
      </div>
      {children}
    </div>
  );
}
