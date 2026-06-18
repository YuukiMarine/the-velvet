/**
 * LedgerStats — F5 心相记账「统计」视图（按生活场景类目重做）。
 *
 * 收支总览 · 预算对比 · 类目占比（甜甜圈环）· 环比上月 · 月度趋势 · 渠道分布 · 收入构成。
 * 轻量自绘（CSS/SVG），不引 recharts；无数据板块自动隐藏。
 * 月末「让伊戈尔结算」入口在此（Markdown 报告 + 不超预算 +10SP）。
 */
import { useEffect, useMemo, useState } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { SegmentTabs } from '@/components/SegmentTabs';
import { catMeta, CATEGORY_KEYS, sym, fmtMoney, fmtSigned, shiftMonth } from '@/utils/ledgerFormat';
import { buildSettlementData, generateSettlement, settleRange, shiftSettleAnchor, type SettleScope, type SettlementResult } from '@/utils/ledgerSettlement';
import { renderMarkdown } from '@/utils/markdown';
import DOMPurify from 'dompurify';

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-800 dark:text-white">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

/** 甜甜圈环：segments 按比例堆叠描边。 */
function Donut({ segments, total, $ }: { segments: { hex: string; amount: number }[]; total: number; $: string }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="relative w-32 h-32 flex-shrink-0">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="15" className="stroke-gray-100 dark:stroke-gray-800" />
        {segments.map((s, i) => {
          const frac = total > 0 ? s.amount / total : 0;
          const el = (
            <circle
              key={i} cx="70" cy="70" r={R} fill="none" stroke={s.hex} strokeWidth="15"
              strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-acc * C}
            />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] text-gray-400">支出</span>
        <span className="text-sm font-black text-gray-800 dark:text-white tabular-nums">{$}{fmtMoney(total)}</span>
      </div>
    </div>
  );
}

/** 极值小卡（最贵一笔 / 最贵一天 / 日均 等）。 */
function Stat({ label, main, sub, tone }: { label: string; main: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-2.5 min-w-0">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className={`text-sm font-black tabular-nums truncate ${tone ?? 'text-gray-800 dark:text-white'}`}>{main}</div>
      {sub && <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{sub}</div>}
    </div>
  );
}
const mdLabel = (dateKey: string) => { const [, m, d] = dateKey.split('-'); return `${Number(m)}/${Number(d)}`; };

function BarRow({ label, amount, max, $ }: { label: string; amount: number; max: number; $: string }) {
  const pct = max > 0 ? Math.max(2, (amount / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 flex-shrink-0 truncate text-gray-600 dark:text-gray-300">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700/50 overflow-hidden">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 flex-shrink-0 text-right tabular-nums text-gray-500 dark:text-gray-400">{$}{fmtMoney(amount)}</span>
    </div>
  );
}

export function LedgerStats() {
  const { settings, ledgerEntries, getBudget, claimLedgerBudgetBonus, claimLedgerChallengeBonus } = useAppStore();
  const $ = sym(settings.currency);
  const [period, setPeriod] = useState(() => toLocalDateKey().slice(0, 7));
  // 结算（周/月，独立于上方统计月份）
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleScope, setSettleScope] = useState<SettleScope>('month');
  const [settleAnchor, setSettleAnchor] = useState(() => toLocalDateKey());
  const [settleBusy, setSettleBusy] = useState(false);
  const [settleResult, setSettleResult] = useState<SettlementResult | null>(null);
  const [bonus, setBonus] = useState(false);
  const [challengeWon, setChallengeWon] = useState<number | null>(null);

  const settleData = useMemo(() => {
    const [, end] = settleRange(settleScope, settleAnchor);
    return buildSettlementData(ledgerEntries, settleScope, settleAnchor, getBudget(end.slice(0, 7))?.monthlyLimit, settings.currency);
  }, [ledgerEntries, settleScope, settleAnchor, getBudget, settings.currency]);

  const todayKey = toLocalDateKey();
  const atCurrentPeriod = settleScope === 'month'
    ? settleData.rangeStart.slice(0, 7) >= todayKey.slice(0, 7)
    : settleData.rangeEnd >= todayKey;

  const openSettle = () => { setSettleScope('month'); setSettleAnchor(toLocalDateKey()); setSettleOpen(true); };

  // 打开 / 切换周期时重新生成（含 +10SP 月度奖励，仅月范围）
  useEffect(() => {
    if (!settleOpen) return;
    let cancelled = false;
    (async () => {
      setSettleBusy(true);
      setSettleResult(null);
      setBonus(settleScope === 'month' ? await claimLedgerBudgetBonus(settleAnchor.slice(0, 7)) : false);
      setChallengeWon(settleScope === 'month' ? await claimLedgerChallengeBonus(settleAnchor.slice(0, 7)) : null);
      const r = await generateSettlement(settleData, settings);
      if (!cancelled) { setSettleResult(r); setSettleBusy(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settleOpen, settleScope, settleAnchor]);

  const s = useMemo(() => {
    const monthOf = (p: string) => ledgerEntries.filter(e => e.date.slice(0, 7) === p);
    const sum = (rows: typeof ledgerEntries) => rows.reduce((a, e) => a + e.amount, 0);
    const cur = monthOf(period);
    const prevExp = monthOf(shiftMonth(period, -1)).filter(e => e.direction === 'expense');
    const curExp = cur.filter(e => e.direction === 'expense');
    const curInc = cur.filter(e => e.direction === 'income');

    const totalExpense = sum(curExp);
    const totalIncome = sum(curInc);
    const prevExpense = sum(prevExp);

    const byCat = CATEGORY_KEYS
      .map(k => ({ key: k, amount: sum(curExp.filter(e => e.type === k)) }))
      .filter(x => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const movers = CATEGORY_KEYS
      .map(k => ({ key: k, delta: sum(curExp.filter(e => e.type === k)) - sum(prevExp.filter(e => e.type === k)) }))
      .filter(x => x.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);

    const chMap = new Map<string, number>();
    for (const e of curExp) { const k = (e.channel ?? '').trim(); if (k) chMap.set(k, (chMap.get(k) ?? 0) + e.amount); }
    const byChannel = [...chMap.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);

    const incomeLabor = sum(curInc.filter(e => e.incomeType === 'labor'));

    return { totalExpense, totalIncome, prevExpense, byCat, movers, byChannel, incomeLabor, incomeOther: totalIncome - incomeLabor };
  }, [ledgerEntries, period]);

  const trend = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(period, -i));
    return months.map(mk => ({
      month: mk,
      expense: ledgerEntries.filter(e => e.direction === 'expense' && e.date.slice(0, 7) === mk).reduce((a, e) => a + e.amount, 0),
    }));
  }, [ledgerEntries, period]);

  const budget = getBudget(period)?.monthlyLimit;
  const savingsGoal = getBudget(period)?.savingsGoal;
  const over = budget != null && s.totalExpense > budget;
  const progress = budget ? s.totalExpense / budget : 0;
  const momPct = s.prevExpense > 0 ? ((s.totalExpense - s.prevExpense) / s.prevExpense) * 100 : null;
  const maxTrend = Math.max(1, ...trend.map(t => t.expense));
  const maxCh = Math.max(1, ...s.byChannel.map(c => c.amount));
  const hasAny = s.totalExpense > 0 || s.totalIncome > 0;

  return (
    <div className="space-y-3">
      {/* 月份导航 */}
      <div className="flex items-center justify-between">
        <button onClick={() => setPeriod(p => shiftMonth(p, -1))} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
        <span className="text-sm font-bold text-gray-800 dark:text-white tabular-nums">{period}</span>
        <button
          onClick={() => setPeriod(p => shiftMonth(p, 1))}
          disabled={period >= toLocalDateKey().slice(0, 7)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
        >›</button>
      </div>

      {/* 收支总览 */}
      <Card title="本月收支">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-gray-400">支出</div>
            <div className="text-base font-black text-gray-800 dark:text-white tabular-nums">{$}{fmtMoney(s.totalExpense)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">收入</div>
            <div className="text-base font-black text-emerald-500 tabular-nums">{$}{fmtMoney(s.totalIncome)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400">结余</div>
            <div className={`text-base font-black tabular-nums ${s.totalIncome - s.totalExpense < 0 ? 'text-rose-500' : 'text-gray-800 dark:text-white'}`}>
              {fmtSigned(s.totalIncome - s.totalExpense, $)}
            </div>
          </div>
        </div>
      </Card>

      {hasAny && (
        <button
          onClick={openSettle}
          className="w-full py-3 rounded-2xl text-sm font-bold bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md active:scale-[0.98]"
        >
          🔮 让伊戈尔结算（周 / 月）
        </button>
      )}

      {!hasAny && <div className="text-center text-sm text-gray-400 py-8">这个月还没有记录。</div>}

      {/* 预算对比 */}
      {budget != null && (
        <Card title="本月预算">
          <div className="flex items-baseline justify-between mb-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">已花 <b className="text-gray-800 dark:text-gray-100 tabular-nums">{$}{fmtMoney(s.totalExpense)}</b> / {$}{fmtMoney(budget)}</span>
            <span className={`font-bold ${over ? 'text-rose-500' : 'text-emerald-500'}`}>
              {over ? `超 ${$}${fmtMoney(s.totalExpense - budget)}` : `剩 ${$}${fmtMoney(budget - s.totalExpense)}`}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className={`h-full rounded-full ${over ? 'bg-rose-500' : progress >= 0.8 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
          {savingsGoal != null && savingsGoal > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-50 dark:border-gray-700/40 flex items-baseline justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">🏆 省钱挑战 · 想省</span>
              <span className="font-bold tabular-nums text-emerald-500">{$}{fmtMoney(savingsGoal)}</span>
            </div>
          )}
        </Card>
      )}

      {/* 类目占比 甜甜圈 */}
      {s.byCat.length > 0 && (
        <Card title="支出类目">
          <div className="flex items-center gap-4">
            <Donut segments={s.byCat.map(c => ({ hex: catMeta(c.key).hex, amount: c.amount }))} total={s.totalExpense} $={$} />
            <div className="flex-1 min-w-0 space-y-1.5">
              {s.byCat.map(c => (
                <div key={c.key} className="flex items-center gap-1.5 text-xs">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${catMeta(c.key).dot}`} />
                  <span className="text-gray-600 dark:text-gray-300 truncate">{catMeta(c.key).label}</span>
                  <span className="ml-auto tabular-nums text-gray-400">{Math.round((c.amount / s.totalExpense) * 100)}%</span>
                  <span className="w-12 text-right tabular-nums text-gray-500 dark:text-gray-400">{$}{fmtMoney(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* 环比上月 */}
      {(s.totalExpense > 0 || s.prevExpense > 0) && (
        <Card title="环比上月">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">本月支出</span>
            <span className="text-lg font-black text-gray-800 dark:text-white tabular-nums">{$}{fmtMoney(s.totalExpense)}</span>
            {momPct != null && (
              <span className={`text-xs font-bold ${momPct > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {momPct > 0 ? '↑' : '↓'}{Math.abs(Math.round(momPct))}%
              </span>
            )}
            <span className="text-xs text-gray-400 ml-auto">上月 {$}{fmtMoney(s.prevExpense)}</span>
          </div>
          {s.movers.length > 0 && (
            <div className="space-y-1 mt-2 pt-2 border-t border-gray-50 dark:border-gray-700/40">
              {s.movers.map(m => (
                <div key={m.key} className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-600 dark:text-gray-300">{catMeta(m.key).icon} {catMeta(m.key).label}</span>
                  <span className={`ml-auto font-semibold tabular-nums ${m.delta > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {m.delta > 0 ? '+' : '−'}{$}{fmtMoney(m.delta)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* 月度趋势 */}
      {trend.some(t => t.expense > 0) && (
        <Card title="月度支出趋势">
          <div className="flex items-end justify-between gap-1.5 h-28">
            {trend.map(t => {
              const h = (t.expense / maxTrend) * 100;
              const isCur = t.month === period;
              return (
                <div key={t.month} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                  <span className="text-[10px] tabular-nums text-gray-400">{t.expense > 0 ? fmtMoney(t.expense) : ''}</span>
                  <div className={`w-full rounded-t ${isCur ? 'bg-primary' : 'bg-primary/35'}`} style={{ height: `${t.expense > 0 ? Math.max(h, 4) : 0}%` }} />
                  <span className={`text-[10px] ${isCur ? 'text-primary font-bold' : 'text-gray-400'}`}>{Number(t.month.slice(5))}月</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 渠道分布 */}
      {s.byChannel.length > 0 && (
        <Card title="支付渠道">
          <div className="space-y-2">
            {s.byChannel.map(c => <BarRow key={c.name} label={c.name} amount={c.amount} max={maxCh} $={$} />)}
          </div>
        </Card>
      )}

      {/* 收入构成 */}
      {s.totalIncome > 0 && (
        <Card title="收入构成">
          <div className="space-y-2">
            <BarRow label="劳动所得" amount={s.incomeLabor} max={s.totalIncome} $={$} />
            <BarRow label="其它收入" amount={s.incomeOther} max={s.totalIncome} $={$} />
          </div>
        </Card>
      )}

      {/* 心相结算（周 / 月，图文 + 回望 + 建议） */}
      <SheetModal isOpen={settleOpen} onClose={() => setSettleOpen(false)} title="心相结算">
        <div className="space-y-3">
          {/* 周 / 月 切换 */}
          <SegmentTabs
            items={[{ key: 'month', label: '按月' }, { key: 'week', label: '按周' }]}
            value={settleScope}
            onChange={v => setSettleScope(v as SettleScope)}
            layoutId="settle-scope"
          />
          {/* 周期导航 */}
          <div className="flex items-center justify-between">
            <button onClick={() => setSettleAnchor(a => shiftSettleAnchor(settleScope, a, -1))} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
            <span className="text-sm font-bold text-gray-800 dark:text-white tabular-nums">{settleData.label}</span>
            <button onClick={() => setSettleAnchor(a => shiftSettleAnchor(settleScope, a, 1))} disabled={atCurrentPeriod} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30">›</button>
          </div>

          {challengeWon != null && (
            <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-bold text-white text-center shadow-md">
              🏆 省钱挑战达成！省下 {$}{fmtMoney(challengeWon)} · +10 SP
            </div>
          )}
          {bonus && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm font-bold text-amber-700 dark:text-amber-300 text-center">
              🎉 本月不超预算 · +10 SP
            </div>
          )}

          {/* 数据头 */}
          <div className="grid grid-cols-3 gap-2 text-center bg-gray-50 dark:bg-gray-800/60 rounded-xl py-2.5">
            <div><div className="text-[10px] text-gray-400">支出</div><div className="text-sm font-black tabular-nums text-gray-800 dark:text-white">{$}{fmtMoney(settleData.totalExpense)}</div></div>
            <div><div className="text-[10px] text-gray-400">收入</div><div className="text-sm font-black tabular-nums text-emerald-500">{$}{fmtMoney(settleData.totalIncome)}</div></div>
            <div><div className="text-[10px] text-gray-400">结余</div><div className={`text-sm font-black tabular-nums ${settleData.totalIncome - settleData.totalExpense < 0 ? 'text-rose-500' : 'text-gray-800 dark:text-white'}`}>{fmtSigned(settleData.totalIncome - settleData.totalExpense, $)}</div></div>
          </div>

          {settleData.totalExpense === 0 && settleData.totalIncome === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">这段时间还没有记录。</div>
          ) : (
            <>
              {/* 极值 */}
              <div className="grid grid-cols-2 gap-2">
                {settleData.extremes.priciestEntry && (
                  <Stat label="最贵一笔" main={`${$}${fmtMoney(settleData.extremes.priciestEntry.amount)}`} sub={settleData.extremes.priciestEntry.note} />
                )}
                {settleData.extremes.priciestDay && (
                  <Stat label="花最多的一天" main={`${$}${fmtMoney(settleData.extremes.priciestDay.amount)}`} sub={mdLabel(settleData.extremes.priciestDay.date)} tone="text-rose-500" />
                )}
                {settleData.extremes.cheapestDay && (
                  <Stat label="花最少的一天" main={`${$}${fmtMoney(settleData.extremes.cheapestDay.amount)}`} sub={mdLabel(settleData.extremes.cheapestDay.date)} tone="text-emerald-500" />
                )}
                {(() => {
                  const a = settleData.actualDailyAvg;
                  const e = settleData.expectedDailyAvg;
                  const diff = e != null ? a - e : null;
                  const sub = e != null
                    ? `预期 ${$}${fmtMoney(e)} · ${diff! > 0 ? `超 ${$}${fmtMoney(diff!)}` : `省 ${$}${fmtMoney(-diff!)}`}`
                    : `共 ${settleData.days} 天`;
                  return <Stat label="日均消费" main={`${$}${fmtMoney(a)}`} sub={sub} tone={diff != null ? (diff > 0 ? 'text-rose-500' : 'text-emerald-500') : undefined} />;
                })()}
              </div>

              {/* 类目占比（前几名） */}
              {settleData.byCat.length > 0 && (
                <div className="space-y-2">
                  {settleData.byCat.slice(0, 5).map(c => (
                    <BarRow key={c.key} label={catMeta(c.key).label} amount={c.amount} max={settleData.byCat[0].amount} $={$} />
                  ))}
                </div>
              )}

              {/* 伊戈尔回望 + 提点 */}
              {settleBusy ? (
                <div className="text-center text-sm text-gray-400 py-8">伊戈尔正凝视着你的账目……</div>
              ) : settleResult && (
                <>
                  <div
                    className="text-sm text-gray-700 dark:text-gray-200 leading-loose"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(settleResult.reflection)}</p>`) }}
                  />
                  {settleResult.advice.length > 0 && (
                    <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/15 border border-indigo-100 dark:border-indigo-800/40 p-3 space-y-1.5">
                      <div className="text-xs font-bold text-indigo-600 dark:text-indigo-300">伊戈尔的提点</div>
                      {settleResult.advice.map((a, i) => (
                        <div key={i} className="flex gap-2 text-xs text-gray-600 dark:text-gray-300">
                          <span className="text-indigo-400 flex-shrink-0">✦</span>
                          <span>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </SheetModal>
    </div>
  );
}
