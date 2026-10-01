/**
 * 等级与称号（组织 P2 · PRD §17.4）：据点设置里打开。
 *   · 队长：给六个等级起名字、给内置称号改名，也可以像自定义成就一样加自己的称号（选一种条件、填一个数，最多 8 个）；
 *     存的时候名字过屏蔽词，不过就拦下来说一声。
 *   · 成员：只看——每一级叫什么、每个称号怎么拿。
 * 改名只影响之后的纪要（发出去的纪要里冻结的是当时的名字）；称号册按称号 id 归类，改名前后算同一个。
 */
import { useEffect, useState } from 'react';
import { SheetModal } from '@/components/SheetModal';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, roughQuad } from '@/components/p5r/kit';
import { updateOrgCustomFromUi } from '@/services/orgSync';
import { orgLevelOfView } from '@/utils/orgOps';
import {
  ORG_BUILTIN_TITLES, ORG_CUSTOM_TITLES_MAX, ORG_LEVEL_NAMES, ORG_LEVEL_NAME_MAX, ORG_TITLE_CONDS, ORG_TITLE_NAME_MAX, condDefOf, condText,
  newCustomTitleId, titleNameOf,
} from '@/utils/orgTitles';
import { OrgButton, useOrgTone } from './orgUi';
import type { OrgCustomTitle, OrgTitleId, OrgView } from '@/types';

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const clip = (v: string, n: number) => [...v].slice(0, n).join('');
const inputCls = 'w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[14px] font-bold text-gray-900 outline-none placeholder:font-semibold placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white';

export function OrgTitlesSheet({ view, open, onClose, onFlash }: {
  view: OrgView;
  open: boolean;
  onClose: () => void;
  onFlash: (s: string) => void;
}) {
  const tone = useOrgTone();
  const leader = view.org.leaderId === view.me.userId;
  const level = orgLevelOfView(view).level;
  const custom = view.org.custom;
  const [levelNames, setLevelNames] = useState<string[]>([]);
  const [titleNames, setTitleNames] = useState<Partial<Record<OrgTitleId, string>>>({});
  const [titles, setTitles] = useState<OrgCustomTitle[]>([]);
  /** 正在加 / 改的自定义称号（null = 没在编辑） */
  const [form, setForm] = useState<OrgCustomTitle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setLevelNames(ORG_LEVEL_NAMES.map((_, i) => custom?.levelNames?.[i] ?? ''));
    setTitleNames({ ...(custom?.titleNames ?? {}) });
    setTitles([...(custom?.titles ?? [])]);
    setForm(null);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const accent = tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.blue : tone.accent;
  const pill = (on: boolean, seed: number) => ({
    background: on ? accent : 'rgba(127,127,127,0.12)',
    color: on ? '#ffffff' : undefined,
    borderRadius: tone.channel === 'p3' || tone.channel === 'p5' ? 0 : 999,
    clipPath: tone.channel === 'p3' ? slantClip(4) : tone.channel === 'p5' ? roughQuad(seed + 2.6, 1.5) : undefined,
  });
  const sectionTitle = (t: string, aside?: string) => (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <div className="text-[12px] font-black tracking-wider text-gray-500 dark:text-gray-400">{t}</div>
      {aside && <div className="shrink-0 text-[11px] font-black tabular-nums text-gray-400">{aside}</div>}
    </div>
  );

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await updateOrgCustomFromUi(view.org.id, { levelNames, titleNames, titles });
      onFlash('改好了：之后的纪要用新名字');
      onClose();
    } catch (e) {
      setError(errText(e, '没存上，稍后再试'));
    } finally {
      setBusy(false);
    }
  };

  const startNew = () => {
    const d = ORG_TITLE_CONDS[0];
    setForm({ id: newCustomTitleId(), name: '', cond: { type: d.type, value: d.def } });
  };
  const commitForm = () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) { setError('给称号起个名字'); return; }
    setError('');
    setTitles(list => (list.some(t => t.id === form.id) ? list.map(t => (t.id === form.id ? { ...form, name } : t)) : [...list, { ...form, name }]));
    setForm(null);
  };
  const formDef = form ? condDefOf(form.cond.type) : null;
  // 连点 − / + 时每一下都要算上：按上一次的值往上加（不能拿渲染时的 form，快点会丢）
  const step = (n: number) => setForm(f => {
    if (!f) return f;
    const d = condDefOf(f.cond.type);
    return { ...f, cond: { ...f.cond, value: Math.max(d.min, Math.min(d.max, f.cond.value + n)) } };
  });

  return (
    <SheetModal isOpen={open} onClose={() => { if (!busy) onClose(); }} title="等级与称号" busy={busy} maxHeightClass="max-h-[90vh]">
      <div className="space-y-6 px-4 pb-6" data-org-titles>
        <p className="text-[12px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">
          {leader
            ? '队长可以给每一级起名字、给称号改名，也可以加自己的称号。改名只影响之后的纪要，称号册里改名前后算同一个称号。'
            : '据点每一级的名字、每周纪要里发的称号都在这里。名字由队长定。'}
        </p>

        {/* 等级名字 */}
        <section>
          {sectionTitle('等级名字', `现在 Lv.${level}`)}
          <ul className="space-y-1.5">
            {ORG_LEVEL_NAMES.map((def, i) => {
              const cur = i + 1 === level;
              return (
                <li key={def} className="flex items-center gap-2">
                  <span className="w-11 shrink-0 text-center text-[12px] font-black tabular-nums" style={{ color: cur ? accent : undefined }}>Lv.{i + 1}</span>
                  {leader ? (
                    <input
                      value={levelNames[i] ?? ''}
                      onChange={e => setLevelNames(l => l.map((x, k) => (k === i ? clip(e.target.value, ORG_LEVEL_NAME_MAX) : x)))}
                      placeholder={def}
                      aria-label={`Lv.${i + 1} 的名字（默认：${def}）`}
                      className={inputCls}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[14px] font-black text-gray-900 dark:text-white">{custom?.levelNames?.[i] || def}</span>
                  )}
                  {cur && <span className="shrink-0 px-1.5 py-[2px] text-[10px] font-black" style={pill(true, i)}>现在</span>}
                </li>
              );
            })}
          </ul>
        </section>

        {/* 内置称号 */}
        <section>
          {sectionTitle('称号', `${ORG_BUILTIN_TITLES.length} 个`)}
          <ul className="space-y-3">
            {ORG_BUILTIN_TITLES.map(t => (
              <li key={t.id}>
                {leader ? (
                  <input
                    value={titleNames[t.id] ?? ''}
                    onChange={e => setTitleNames(m => ({ ...m, [t.id]: clip(e.target.value, ORG_TITLE_NAME_MAX) }))}
                    placeholder={t.name}
                    aria-label={`称号「${t.name}」改名`}
                    className={inputCls}
                  />
                ) : (
                  <div className="text-[14px] font-black text-gray-900 dark:text-white">{titleNameOf(custom, t.id)}</div>
                )}
                <div className="mt-1 text-[11px] font-semibold leading-relaxed text-gray-500 dark:text-gray-400">{t.how}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* 自定义称号 */}
        <section>
          {sectionTitle('自定义称号', `${titles.length} / ${ORG_CUSTOM_TITLES_MAX}`)}
          {titles.length > 0 ? (
            <ul className="divide-y divide-black/5 dark:divide-white/10">
              {titles.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-black text-gray-900 dark:text-white">{t.name}</div>
                    <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{condText(t.cond)}</div>
                  </div>
                  {leader && (
                    <div className="flex shrink-0 gap-2">
                      <OrgButton small tone="ghost" onClick={() => { setError(''); setForm({ ...t }); }} disabled={busy}>改</OrgButton>
                      <OrgButton small tone="danger" onClick={() => setTitles(list => list.filter(x => x.id !== t.id))} disabled={busy}>删</OrgButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">{leader ? '还没有。比如「夜猫子」：这周记录天数 ≥ 6 天。' : '队长还没加。'}</p>
          )}

          {leader && form && formDef && (
            <div className="mt-3 space-y-3 rounded-2xl p-3" style={{ background: 'rgba(127,127,127,0.08)' }} data-title-form>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: clip(e.target.value, ORG_TITLE_NAME_MAX) })}
                placeholder={`称号名字（最多 ${ORG_TITLE_NAME_MAX} 个字）`}
                aria-label="称号名字"
                className={inputCls}
              />
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="条件">
                {ORG_TITLE_CONDS.map((c, i) => (
                  <button
                    key={c.type}
                    type="button"
                    role="radio"
                    aria-checked={form.cond.type === c.type}
                    onClick={() => setForm({ ...form, cond: { type: c.type, value: c.def } })}
                    className="whitespace-nowrap px-2.5 py-1.5 text-[12px] font-black"
                    style={pill(form.cond.type === c.type, i)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {!formDef.noValue && (
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-black text-gray-700 dark:text-gray-200">{formDef.label} ≥</span>
                  <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <button type="button" onClick={() => step(-1)} disabled={form.cond.value <= formDef.min} aria-label="减一" className="px-3 py-1.5 text-[16px] font-black disabled:opacity-30">−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={form.cond.value}
                      min={formDef.min}
                      max={formDef.max}
                      onChange={e => setForm({ ...form, cond: { ...form.cond, value: Math.max(formDef.min, Math.min(formDef.max, Math.round(Number(e.target.value) || formDef.min))) } })}
                      aria-label={`${formDef.label}（${formDef.min}–${formDef.max}）`}
                      className="w-14 bg-transparent text-center text-[14px] font-black tabular-nums text-gray-900 outline-none dark:text-white"
                    />
                    <button type="button" onClick={() => step(1)} disabled={form.cond.value >= formDef.max} aria-label="加一" className="px-3 py-1.5 text-[16px] font-black disabled:opacity-30">+</button>
                  </div>
                  <span className="text-[13px] font-black text-gray-700 dark:text-gray-200">{formDef.unit}</span>
                </div>
              )}
              <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">每周一发纪要时，{condText(form.cond)}的人拿到「{form.name.trim() || '…'}」，挂一周。</div>
              <div className="flex gap-2.5">
                <OrgButton small tone="ghost" onClick={() => { setForm(null); setError(''); }} disabled={busy}>取消</OrgButton>
                <OrgButton small onClick={commitForm} disabled={busy || !form.name.trim()}>{titles.some(t => t.id === form.id) ? '改好了' : '加上'}</OrgButton>
              </div>
            </div>
          )}
          {leader && !form && titles.length < ORG_CUSTOM_TITLES_MAX && (
            <div className="mt-2"><OrgButton small tone="ghost" onClick={startNew} disabled={busy}>＋ 加一个称号</OrgButton></div>
          )}
        </section>

        {error && <p role="alert" className="text-[12px] font-bold text-rose-500">{error}</p>}
        {leader && (
          <div className="flex gap-2.5">
            <OrgButton tone="ghost" onClick={onClose} disabled={busy}>取消</OrgButton>
            <OrgButton onClick={() => void save()} disabled={busy || !!form}>{busy ? '存着…' : '保存'}</OrgButton>
          </div>
        )}
      </div>
    </SheetModal>
  );
}
