/**
 * 「和云端对一对」（查阅并合并，v2.7.0.6 第 3 轮）。
 *
 * 由 cloudStore.mergeOpen 驱动、挂在 App 顶层（推送发现云端有别处的更新时也会打开）。
 * 打开就对一遍账：按表列出 只本机有 / 只云端有 / 两边不同 的条数，点一张表能看几条样本；
 * 然后三选一：合并（两边都留，冲突按选的一边）/ 以本机为准（覆盖云端）/ 以云端为准（覆盖本机）。
 * 没有删除记录之前，「只云端有」分不清是别处新加的还是本机删掉的：默认留，用户可以按表勾「丢弃」。
 */
import { useEffect, useState } from 'react';
import { SheetModal } from '@/components/SheetModal';
import { useCloudStore } from '@/store/cloud';
import { applyMerge, previewMerge, pushAll, pullAll, type MergePreview } from '@/services/sync';
import { tableLabel, type MergeSide } from '@/services/syncMerge';

export function SyncMergeSheet() {
  const open = useCloudStore(s => s.mergeOpen);
  const hint = useCloudStore(s => s.mergeHint);
  const setOpen = useCloudStore(s => s.setMergeOpen);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'merge' | 'local' | 'cloud' | null>(null);
  const [conflictWins, setConflictWins] = useState<MergeSide>('local');
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPreview(null); setError(''); setDone(null); setDrop(new Set()); setExpanded(null); setConflictWins('local');
    setLoading(true);
    previewMerge()
      .then(p => { if (alive) setPreview(p); })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : '对账失败'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  const close = () => { if (!busy) setOpen(false); };
  const run = async (kind: 'merge' | 'local' | 'cloud') => {
    if (busy) return;
    setBusy(kind); setError('');
    try {
      if (kind === 'merge') {
        const r = await applyMerge({ conflictWins, dropOnlyCloud: drop });
        setDone(`合并完成：留下本机独有 ${r.onlyLocal} 条、云端独有 ${r.onlyCloud} 条，两边不同的 ${r.conflict} 条按${conflictWins === 'local' ? '本机' : '云端'}；已经推到云端。`);
      } else if (kind === 'local') {
        await pushAll({ force: true });
        setDone('已用本机数据覆盖云端。');
      } else {
        await pullAll();
        setDone('已用云端数据覆盖本机。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setBusy(null);
    }
  };

  const diffTables = preview?.tables.filter(t => t.onlyLocal || t.onlyCloud || t.conflict) ?? [];
  const totalConflict = diffTables.reduce((s, t) => s + t.conflict, 0);
  const totalOnlyCloud = diffTables.reduce((s, t) => s + t.onlyCloud, 0);
  const allSame = !!preview && diffTables.length === 0;
  const btn = 'rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50';

  return (
    <SheetModal
      isOpen={open}
      onClose={close}
      position="bottom"
      title="和云端对一对"
      busy={!!busy}
      footer={
        done ? (
          <button type="button" onClick={close} className={`${btn} w-full bg-primary text-white`}>好</button>
        ) : (
          <div className="space-y-2">
            {totalConflict > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs">
                <span className="text-gray-600 dark:text-gray-300">两边都改过的 {totalConflict} 条，用哪边</span>
                <div className="flex gap-1">
                  {(['local', 'cloud'] as MergeSide[]).map(side => (
                    <button key={side} type="button" onClick={() => setConflictWins(side)} aria-pressed={conflictWins === side}
                      className={`rounded-lg px-2.5 py-1 font-bold ${conflictWins === side ? 'bg-primary text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-200'}`}>
                      {side === 'local' ? '本机' : '云端'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button type="button" disabled={!preview || !!busy} onClick={() => void run('cloud')} className={`${btn} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200`}>{busy === 'cloud' ? '拉取中…' : '以云端为准'}</button>
              <button type="button" disabled={!preview || !!busy} onClick={() => void run('local')} className={`${btn} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200`}>{busy === 'local' ? '推送中…' : '以本机为准'}</button>
              <button type="button" disabled={!preview || !!busy || allSame} onClick={() => void run('merge')} className={`${btn} bg-primary text-white`}>{busy === 'merge' ? '合并中…' : '合并'}</button>
            </div>
          </div>
        )
      }
    >
      <div className="space-y-3 text-sm">
        {hint && hint.length > 0 && !done && (
          <p className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            推送时发现云端的{hint.map(tableLabel).join('、')}在别处改过。先看看两边差在哪，再决定怎么合。
          </p>
        )}
        {loading && <p className="text-xs text-gray-400">正在对账…</p>}
        {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
        {done && <p className="text-xs text-gray-600 dark:text-gray-300">{done}</p>}
        {preview && !done && (
          allSame ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">两边一样，没什么要合的。</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-100 dark:border-gray-800">
              {diffTables.map(t => (
                <li key={t.key} className="px-3 py-2">
                  <button type="button" onClick={() => setExpanded(expanded === t.key ? null : t.key)} aria-expanded={expanded === t.key} className="flex w-full items-center justify-between text-left">
                    <span className="font-bold text-gray-800 dark:text-white">{tableLabel(t.key)}</span>
                    <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                      本机 {t.local} · 云端 {t.cloud}
                      {t.onlyLocal > 0 && <span className="ml-1.5 text-emerald-600 dark:text-emerald-300">只本机 {t.onlyLocal}</span>}
                      {t.onlyCloud > 0 && <span className="ml-1.5 text-sky-600 dark:text-sky-300">只云端 {t.onlyCloud}</span>}
                      {t.conflict > 0 && <span className="ml-1.5 text-amber-600 dark:text-amber-300">不同 {t.conflict}</span>}
                    </span>
                  </button>
                  {expanded === t.key && (
                    <div className="mt-2 space-y-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                      {t.samples.onlyLocal.length > 0 && <p><span className="font-bold text-emerald-600 dark:text-emerald-300">只本机：</span>{t.samples.onlyLocal.join('；')}{t.onlyLocal > t.samples.onlyLocal.length ? ' …' : ''}</p>}
                      {t.samples.onlyCloud.length > 0 && <p><span className="font-bold text-sky-600 dark:text-sky-300">只云端：</span>{t.samples.onlyCloud.join('；')}{t.onlyCloud > t.samples.onlyCloud.length ? ' …' : ''}</p>}
                      {t.samples.conflict.length > 0 && <p><span className="font-bold text-amber-600 dark:text-amber-300">两边不同：</span>{t.samples.conflict.join('；')}{t.conflict > t.samples.conflict.length ? ' …' : ''}</p>}
                      {t.onlyCloud > 0 && (
                        <label className="flex items-center gap-2 pt-1">
                          <input type="checkbox" checked={drop.has(t.key)} onChange={e => setDrop(prev => { const n = new Set(prev); if (e.target.checked) n.add(t.key); else n.delete(t.key); return n; })} className="h-4 w-4 rounded" />
                          <span>合并时丢掉云端多出来的 {t.onlyCloud} 条（确认是我在这台设备上删掉的）</span>
                        </label>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
        {preview && !done && !allSame && (
          <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
            合并 = 两边都留：只本机有的留，只云端有的默认留{totalOnlyCloud > 0 ? '（可按表丢弃）' : ''}，两边不同的按上面选的一边；成就和技能取解锁的那边，同一天的任务完成取次数多的。合并完会推到云端。
          </p>
        )}
      </div>
    </SheetModal>
  );
}
