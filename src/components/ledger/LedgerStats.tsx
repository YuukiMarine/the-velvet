/**
 * LedgerStats — F5 心相记账「统计」视图（Phase ②）。
 *
 * 看钱去哪：四轴占比、月度趋势、二级类目排行、渠道分布、收入构成。
 * 原则「填了才统计、没填不催」——无数据的板块直接不渲染。
 * 轻量自绘（CSS/SVG 条形），不引 recharts，保持 ledger chunk 轻。
 * 值/不值 计数依赖 phase ③ 的消费评估，待其落地后补。
 */
import { useMemo, useState } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { EXPENSE_META, EXPENSE_TYPES, sym, fmtMoney, fmtSigned, shiftMonth } from '@/utils/ledgerFormat';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
      <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3">{title}</h3>
      {children}
    </div>
  );
}

/** 横向排行条（类目 / 渠道） */
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
  const { settings, ledgerEntries } = useAppStore();
  const $ = sym(settings.currency);
  const [period, setPeriod] = useState(() => toLocalDateKey().slice(0, 7));

  const s = useMemo(() => {
    const inMonth = ledgerEntries.filter(e => e.date.slice(0, 7) === period);
    const expenses = inMonth.filter(e => e.direction === 'expense');
    const incomes = inMonth.filter(e => e.direction === 'income');
    const totalExpense = expenses.reduce((a, e) => a + e.amount, 0);
    const totalIncome = incomes.reduce((a, e) => a + e.amount, 0);

    const byAxis = EXPENSE_TYPES
      .map(t => ({ type: t, amount: expenses.filter(e => e.type === t).reduce((a, e) => a + e.amount, 0) }))
      .filter(x => x.amount > 0);

    const sumBy = (key: 'category' | 'channel') => {
      const m = new Map<string, number>();
      for (const e of expenses) {
        const k = (e[key] ?? '').trim();
        if (k) m.set(k, (m.get(k) ?? 0) + e.amount);
      }
      return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
    };
    const byCategory = sumBy('category').slice(0, 6);
    const byChannel = sumBy('channel');

    const incomeLabor = incomes.filter(e => e.incomeType === 'labor').reduce((a, e) => a + e.amount, 0);
    const incomeOther = totalIncome - incomeLabor;

    return { totalExpense, totalIncome, byAxis, byCategory, byChannel, incomeLabor, incomeOther };
  }, [ledgerEntries, period]);

  const trend = useMemo(() => {
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(period, -i));
    return months.map(mk => ({
      month: mk,
      expense: ledgerEntries
        .filter(e => e.direction === 'expense' && e.date.slice(0, 7) === mk)
        .reduce((a, e) => a + e.amount, 0),
    }));
  }, [ledgerEntries, period]);

  const maxTrend = Math.max(1, ...trend.map(t => t.expense));
  const maxCat = Math.max(1, ...s.byCategory.map(c => c.amount));
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

      {/* 概览 */}
      <Card title="本月概览">
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

      {!hasAny && (
        <div className="text-center text-sm text-gray-400 py-8">这个月还没有记录。</div>
      )}

      {/* 四轴占比 */}
      {s.byAxis.length > 0 && (
        <Card title="支出去向（四轴）">
          <div className="flex h-3 rounded-full overflow-hidden">
            {s.byAxis.map(x => (
              <div key={x.type} className={EXPENSE_META[x.type].bar} style={{ width: `${(x.amount / s.totalExpense) * 100}%` }} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
            {s.byAxis.map(x => (
              <div key={x.type} className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EXPENSE_META[x.type].dot}`} />
                <span className="text-gray-600 dark:text-gray-300">{EXPENSE_META[x.type].label}</span>
                <span className="ml-auto tabular-nums text-gray-500 dark:text-gray-400">
                  {Math.round((x.amount / s.totalExpense) * 100)}% · {$}{fmtMoney(x.amount)}
                </span>
              </div>
            ))}
          </div>
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
                  <div
                    className={`w-full rounded-t ${isCur ? 'bg-primary' : 'bg-primary/35'}`}
                    style={{ height: `${t.expense > 0 ? Math.max(h, 4) : 0}%` }}
                  />
                  <span className={`text-[10px] ${isCur ? 'text-primary font-bold' : 'text-gray-400'}`}>{Number(t.month.slice(5))}月</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 类目排行 */}
      {s.byCategory.length > 0 && (
        <Card title="二级类目 Top">
          <div className="space-y-2">
            {s.byCategory.map(c => <BarRow key={c.name} label={c.name} amount={c.amount} max={maxCat} $={$} />)}
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
    </div>
  );
}
