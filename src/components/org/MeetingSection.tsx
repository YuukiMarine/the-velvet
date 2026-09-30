/**
 * 周日会议（第 7 轮 7b · PRD §12.7 / §12.16）：据点页「会议」分区。
 *   · 会议时间（组织时区周日全天 + 周一凌晨 4 点前）：这周立过目标的先打分（做到了 / 差一点 / 没做到），
 *     再写一句下周目标（≤30 字）；写完能改；下面是点名（谁写了）和大家写的下周目标；
 *   · 其余时间：距离周日还有几天、这周大家的目标、上一次的会议纪要。
 * 页面开着跨过边界（周日 0 点 / 周一 4 点）时每分钟对一次表、从后台回来时再对一次，自动切换。
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { submitMeeting } from '@/services/orgSync';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import {
  ORG_GOAL_MAX, RESULT_LABEL, deviceTimeZone, displayCodename, latestMinutes, meetingState, nextWeekKey, orgWeekKey,
  shiftDayKey, wroteMeeting, zonedDay,
} from '@/utils/orgLogic';
import { MinutesCard } from './BoardSection';
import { OrgButton, OrgPanel, useOrgTone, type OrgTone } from './orgUi';
import type { OrgMember, OrgView } from '@/types';

type Result = 'done' | 'partial' | 'missed';
const RESULTS: Result[] = ['done', 'partial', 'missed'];

const md = (key: string) => `${Number(key.slice(5, 7))} 月 ${Number(key.slice(8, 10))} 日`;
const mdShort = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function MeetingSection({ view, blocked, onFlash }: { view: OrgView; blocked: Set<string>; onFlash: (s: string) => void }) {
  const tone = useOrgTone();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 60_000);
    // 从后台回来（可能已经跨过周日 0 点 / 周一 4 点）立刻对一次表，不等下一分钟
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  const st = meetingState(now, view.org.tz);
  const me = view.me;
  const wrote = wroteMeeting(me, st.week);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 进入 / 退出编辑时把表单对齐到服务器上的那一行
  useEffect(() => {
    if (!st.open) return;
    if (wrote && !editing) return;
    setResult(me.resultWeek === st.week && me.result ? me.result : null);
    setGoal(wrote ? me.goal ?? '' : '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, st.open, st.week, wrote]);

  const tzNote = deviceTimeZone() !== view.org.tz ? `会议时间按组织所在的时区（${view.org.tz}）算。` : '';
  const others = view.members.filter(m => !blocked.has(m.userId));

  if (!st.open) {
    return <MeetingClosed view={view} tone={tone} now={now} others={others} blocked={blocked} tzNote={tzNote} />;
  }

  // 这周立过目标、还没打分 → 先打分；已经打过（改的时候）→ 可以改分
  const askResult = me.goalWeek === st.week && me.resultWeek !== st.week;
  const showResult = askResult || me.resultWeek === st.week;
  const goalLen = [...goal].length;
  const canSubmit = !busy && goal.trim().length > 0 && (!askResult || !!result);
  const monday = zonedDay(now, view.org.tz).weekday === 1;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await submitMeeting(view.org.id, { result: showResult && result ? result : undefined, goal });
      setEditing(false);
      onFlash(wrote ? '改好了' : '交上去了，下周见');
    } catch (e) {
      setError(errText(e, '没存上，稍后再试'));
    } finally {
      setBusy(false);
    }
  };

  const rollCall = view.members.map(m => ({ m, ok: wroteMeeting(m, st.week) }));
  const wroteCount = rollCall.filter(x => x.ok).length;
  const goals = others.filter(m => m.id !== me.id && wroteMeeting(m, st.week) && m.goal);

  return (
    <div className="space-y-3">
      <OrgPanel seed={51}>
        <div className="flex items-center gap-2">
          <LiveBadge tone={tone} />
          <span className="min-w-0 flex-1 truncate text-[16px] font-black" style={{ fontFamily: tone.titleFont }}>周日会议</span>
          <span className="shrink-0 text-[11px] font-bold" style={{ color: tone.sub }}>{monday ? '开到今天凌晨 4 点' : '开到周一凌晨 4 点'}</span>
        </div>

        {wrote && !editing ? (
          <div className="mt-3">
            <div className="text-[12px] font-bold" style={{ color: tone.sub }}>你已经交了</div>
            {me.resultWeek === st.week && me.result && (
              <div className="mt-1.5 text-[13px] font-bold">这周的目标：<span className="font-black" style={{ color: tone.channel === 'p5' ? P5R.red : tone.accent }}>{RESULT_LABEL[me.result]}</span></div>
            )}
            <div className="mt-1.5 text-[11px] font-black tracking-wider" style={{ color: tone.sub }}>下周目标</div>
            <div className="mt-0.5 break-words text-[18px] font-black leading-snug" style={{ fontFamily: tone.titleFont }}>「{me.goal}」</div>
            <div className="mt-3"><OrgButton small tone="ghost" onClick={() => setEditing(true)}>改一改</OrgButton></div>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {showResult && (
              <div>
                <div className="text-[13px] font-bold leading-relaxed">
                  {askResult && me.goal ? <>这周的目标<span className="font-black">「{me.goal}」</span>做到了吗？</> : '这周的目标做到了吗？'}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {RESULTS.map((r, i) => (
                    <Choice key={r} tone={tone} seed={i} on={result === r} onClick={() => setResult(r)}>{RESULT_LABEL[r]}</Choice>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-[13px] font-bold">下周想做到的一件事<span className="ml-1.5 whitespace-nowrap text-[11px] font-bold" style={{ color: tone.sub }}>{mdShort(nextWeekKey(st.week))} 起</span></span>
                <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: goalLen >= ORG_GOAL_MAX ? (tone.channel === 'p5' ? P5R.red : '#f43f5e') : tone.sub }}>{goalLen} / {ORG_GOAL_MAX}</span>
              </div>
              <textarea
                value={goal}
                onChange={e => setGoal([...e.target.value.replace(/\n/g, ' ')].slice(0, ORG_GOAL_MAX).join(''))}
                rows={2}
                placeholder="比如：每天背 30 个单词"
                aria-label="下周目标"
                className="block w-full resize-none px-3 py-2.5 text-[15px] font-bold leading-snug outline-none"
                style={inputSkin(tone)}
              />
            </div>
            {error && <p role="alert" className="text-[12px] font-bold leading-relaxed" style={{ color: tone.channel === 'p5' ? P5R.red : '#f43f5e' }}>{error}</p>}
            <div className="flex gap-2.5">
              {wrote && <OrgButton small tone="ghost" onClick={() => setEditing(false)} disabled={busy}>取消</OrgButton>}
              <OrgButton small onClick={submit} disabled={!canSubmit}>{busy ? '提交中…' : wrote ? '保存' : '交上去'}</OrgButton>
            </div>
            <p className="text-[11px] font-semibold leading-relaxed" style={{ color: tone.sub }}>写好的目标组织里的人都能看到；会议结束后会出一份纪要，发到公告板上。{tzNote}</p>
          </div>
        )}
      </OrgPanel>

      <OrgPanel seed={53}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-black" style={{ fontFamily: tone.titleFont }}>点名</span>
          <span className="text-[11px] font-black tabular-nums" style={{ color: tone.sub }}>已写 {wroteCount} / {view.members.length}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rollCall.map(({ m, ok }) => <RollChip key={m.id} tone={tone} ok={ok} mine={m.id === me.id}>{displayCodename(m)}</RollChip>)}
        </div>
        {goals.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {goals.map(m => <GoalRow key={m.id} tone={tone} m={m} />)}
          </ul>
        )}
      </OrgPanel>
    </div>
  );
}

function MeetingClosed({ view, tone, now, others, blocked, tzNote }: { view: OrgView; tone: OrgTone; now: Date; others: OrgMember[]; blocked: Set<string>; tzNote: string }) {
  const { weekday } = zonedDay(now, view.org.tz);
  const cur = orgWeekKey(now, view.org.tz);
  const days = 7 - weekday;
  const sunday = shiftDayKey(cur, 6);
  const goals = others.filter(m => m.goalWeek === cur && m.goal);
  const mine = view.me.goalWeek === cur ? view.me.goal : undefined;
  const minutes = latestMinutes(view, now);
  return (
    <div className="space-y-3">
      <OrgPanel seed={55}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black tracking-[0.2em]" style={{ color: tone.sub }}>NEXT MEETING</div>
            <div className="mt-1 text-[16px] font-black" style={{ fontFamily: tone.titleFont }}>下一场：周日（{md(sunday)}）</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[30px] font-black leading-none tabular-nums" style={{ fontFamily: tone.titleFont, color: tone.channel === 'p5' ? P5R.red : tone.accent }}>{days}</div>
            <div className="mt-0.5 text-[10px] font-bold" style={{ color: tone.sub }}>{days === 1 ? '明天就开' : '天后'}</div>
          </div>
        </div>
        <p className="mt-2 text-[11px] font-semibold leading-relaxed" style={{ color: tone.sub }}>周日全天（到周一凌晨 4 点）来这里：给这周的目标打个分，再写一句下周目标。{tzNote}</p>
      </OrgPanel>

      <OrgPanel seed={57}>
        <div className="text-[14px] font-black" style={{ fontFamily: tone.titleFont }}>这周大家的目标</div>
        {mine && (
          <div className="mt-2 px-3 py-2" style={mineSkin(tone)}>
            <div className="text-[10px] font-black tracking-wider opacity-80">我的</div>
            <div className="break-words text-[15px] font-black leading-snug">「{mine}」</div>
          </div>
        )}
        {goals.filter(m => m.id !== view.me.id).length > 0 ? (
          <ul className="mt-2.5 space-y-1.5">
            {goals.filter(m => m.id !== view.me.id).map(m => <GoalRow key={m.id} tone={tone} m={m} />)}
          </ul>
        ) : !mine ? (
          <div className="mt-1.5 text-[12px] font-bold" style={{ color: tone.sub }}>这周还没人立目标。周日会上写一句吧。</div>
        ) : (
          <div className="mt-2 text-[12px] font-bold" style={{ color: tone.sub }}>其他人这周还没有目标。</div>
        )}
      </OrgPanel>

      {minutes && (
        <div>
          <div className="mb-2 text-[11px] font-black tracking-[0.2em]" style={{ color: tone.stageSub }}>上一次的会议纪要</div>
          <MinutesCard org={view.org} minutes={minutes} blocked={blocked} tone={tone} />
        </div>
      )}
    </div>
  );
}

// ── 小件 ─────────────────────────────────────────────────────────────────────

function GoalRow({ tone, m }: { tone: OrgTone; m: OrgMember }) {
  return (
    <li className="flex gap-2 text-[13px] font-bold leading-snug">
      <span className="shrink-0 font-black" style={{ color: tone.channel === 'p5' ? P5R.red : tone.accent }}>{displayCodename(m)}</span>
      <span className="min-w-0 break-words">「{m.goal}」</span>
    </li>
  );
}

function LiveBadge({ tone }: { tone: OrgTone }) {
  const style = tone.channel === 'p3'
    ? { background: P3R.magenta, color: '#ffffff', clipPath: slantClip(4) }
    : tone.channel === 'p5'
      ? { background: P5R.red, color: P5R.white, clipPath: roughQuad(3.3, 2), fontFamily: P5_TITLE_FONT }
      : tone.channel === 'p4'
        ? { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 999, boxShadow: '0 0 0 1.5px #131313' }
        : { background: '#f43f5e', color: '#ffffff', borderRadius: 999 };
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-2 py-[3px] text-[11px] font-black" style={style}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
      开会中
    </span>
  );
}

function Choice({ tone, seed, on, onClick, children }: { tone: OrgTone; seed: number; on: boolean; onClick: () => void; children: string }) {
  const style = tone.channel === 'p3'
    ? { background: on ? P3R.blue : P3R.cyanFaint, color: on ? '#ffffff' : P3R.ink, clipPath: slantClip(6) }
    : tone.channel === 'p5'
      ? { background: on ? P5R.red : 'rgba(0,0,0,0.08)', color: on ? P5R.white : P5R.ink, clipPath: roughQuad(seed + 2.3, 2.5), fontFamily: P5_TITLE_FONT }
      : tone.channel === 'p4'
        ? { background: on ? 'var(--p4-orange, #f9a11b)' : 'transparent', color: on ? '#131313' : 'var(--ui-ink, #131313)', borderRadius: 12, boxShadow: `inset 0 0 0 2px ${on ? '#131313' : 'var(--ui-line, #131313)'}` }
        : { background: on ? tone.accent : 'rgba(127,127,127,0.1)', color: on ? '#ffffff' : tone.ink, borderRadius: 12 };
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="whitespace-nowrap py-2.5 text-[14px] font-black" style={style}>
      {children}
    </button>
  );
}

function RollChip({ tone, ok, mine, children }: { tone: OrgTone; ok: boolean; mine: boolean; children: string }) {
  const onBg = tone.channel === 'p3' ? P3R.blue : tone.channel === 'p5' ? P5R.ink : tone.channel === 'p4' ? '#131313' : tone.accent;
  const onFg = tone.channel === 'p4' ? '#fff6d0' : '#ffffff';
  const style = {
    background: ok ? onBg : 'transparent',
    color: ok ? onFg : tone.sub,
    boxShadow: ok ? undefined : `inset 0 0 0 1.2px ${tone.channel === 'p5' ? 'rgba(0,0,0,0.35)' : 'rgba(127,127,127,0.45)'}`,
    borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0,
    clipPath: tone.channel === 'p3' ? slantClip(4) : undefined,
  };
  return (
    <span className="inline-flex max-w-[9em] items-center gap-1 whitespace-nowrap px-2 py-1 text-[11px] font-black leading-none" style={style}>
      <span aria-hidden>{ok ? '✓' : '…'}</span>
      <span className="truncate">{children}{mine ? '（我）' : ''}</span>
    </span>
  );
}

function inputSkin(tone: OrgTone): CSSProperties {
  if (tone.channel === 'p3') return { background: P3R.cyanFaint, color: P3R.ink, clipPath: slantClip(8) };
  if (tone.channel === 'p5') return { background: '#ffffff', color: P5R.ink, boxShadow: `inset 0 0 0 2px ${P5R.ink}`, fontFamily: P5_TITLE_FONT };
  if (tone.channel === 'p4') return { background: 'rgba(127,127,127,0.1)', color: 'var(--ui-ink, #131313)', borderRadius: 12, boxShadow: 'inset 0 0 0 2px var(--ui-line, #131313)' };
  return { background: 'rgba(127,127,127,0.08)', color: tone.ink, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${tone.line}` };
}

function mineSkin(tone: OrgTone): CSSProperties {
  if (tone.channel === 'p3') return { background: P3R.blue, color: '#ffffff', clipPath: slantClip(8) };
  if (tone.channel === 'p5') return { background: P5R.ink, color: P5R.white, clipPath: roughQuad(4.1, 3), fontFamily: P5_TITLE_FONT };
  if (tone.channel === 'p4') return { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 12, boxShadow: '0 0 0 2px #131313' };
  return { background: 'var(--ui-accent, #6366f1)', color: '#ffffff', borderRadius: 12 };
}
