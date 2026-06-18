/**
 * Ledger — F5 心相记账（Phase ①）。
 *
 * 三层模型的 UI：
 *   · 流：NL/手动录入 → 可改确认卡 → 落账；按日分组流水列表。
 *   · 存：总余额（流动资产，可 toggle 本月余额）；预算进度环。
 *   · 纪律：本月预算（首次设置 / 编辑）；总余额对账（月限 3 次）。
 *
 * 奖励 / 统计 / 资产 / 月末结算属后续批次，本页先把核心跑通。
 */
import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
import { PageTitle } from '@/components/PageTitle';
import { BackButton } from '@/components/BackButton';
import { SheetModal } from '@/components/SheetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getAIConfig } from '@/utils/aiClient';
import { parseLedgerInput, type LedgerAIResult } from '@/utils/ledgerAI';
import { SegmentTabs } from '@/components/SegmentTabs';
import { LedgerStats } from '@/components/ledger/LedgerStats';
import { AssetBoard } from '@/components/ledger/AssetBoard';
import { catMeta, CATEGORY_KEYS, isGrowthCategory, INCOME_META, INCOME_TYPES, sym, fmtMoney, fmtSigned } from '@/utils/ledgerFormat';
import type { LedgerEntry, LedgerExpenseType, LedgerIncomeType, AttributeId, SpendWorth } from '@/types';

// ── 录入草稿 ──────────────────────────────────────────────

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

interface EntryDraft {
  direction: 'expense' | 'income';
  amount: string;
  type: LedgerExpenseType;
  incomeType: LedgerIncomeType;
  category: string;
  channel: string;
  note: string;
  date: string;
  source: 'manual' | 'ai';
  attribute?: AttributeId;   // 投资类自选加点属性
  attrPoints: number;        // 1 | 2
  evalWorth?: SpendWorth;    // 消费评估
  registerAsset: boolean;    // 流→存：同时登记为固定资产
}
const emptyDraft = (): EntryDraft => ({
  direction: 'expense', amount: '', type: 'food', incomeType: 'labor',
  category: '', channel: '', note: '', date: toLocalDateKey(), source: 'manual', attrPoints: 1, registerAsset: false,
});
const draftFromAI = (r: LedgerAIResult, source: 'manual' | 'ai'): EntryDraft => ({
  direction: r.direction,
  amount: r.amount ? String(r.amount) : '',
  type: r.type ?? 'other',
  incomeType: r.incomeType ?? 'labor',
  category: r.category ?? '',
  channel: '',
  note: r.note ?? '',
  date: toLocalDateKey(),
  source,
  attrPoints: 1,
  registerAsset: false,
});

// ── 预算环 ────────────────────────────────────────────────

/** 预算环：ratio=本月预算「剩余」比例（满=未花，花钱往下消耗）；color 由调用方按预算状态给。 */
function BudgetRing({ ratio, color, children }: { ratio: number; color: string; children: ReactNode }) {
  const R = 84;
  const C = 2 * Math.PI * R;
  const r = Math.max(0, Math.min(1, ratio));
  return (
    <div className="relative w-56 h-56 mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-800" />
        <circle
          cx="100" cy="100" r={R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - r)}
          style={{ transition: 'stroke-dashoffset .5s ease, stroke .3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">{children}</div>
    </div>
  );
}

/** 资金类型环：流动(本月预算剩) / 收入(本月) / 余额(结转) 按比例分色。 */
function FundRing({ liquid, income, carried, children }: { liquid: number; income: number; carried: number; children: ReactNode }) {
  const R = 84;
  const C = 2 * Math.PI * R;
  const segs = [{ v: liquid, c: '#38bdf8' }, { v: income, c: '#34d399' }, { v: carried, c: '#818cf8' }];
  const tot = segs.reduce((s, x) => s + x.v, 0) || 1;
  let acc = 0;
  return (
    <div className="relative w-56 h-56 mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-800" />
        {segs.map((sg, i) => {
          const f = sg.v / tot;
          const el = <circle key={i} cx="100" cy="100" r={R} fill="none" stroke={sg.c} strokeWidth="12" strokeDasharray={`${f * C} ${C}`} strokeDashoffset={-acc * C} />;
          acc += f;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">{children}</div>
    </div>
  );
}

// ── 页面 ──────────────────────────────────────────────────

export const Ledger = () => {
  const {
    settings, ledgerEntries, setCurrentPage,
    addLedgerEntry, deleteLedgerEntry, setBudget, adjustTotalBalance, rewardForLedgerEntry, addAsset,
    getTotalBalance, getMonthExpense, getMonthIncome, getBudget, getAdjustCountThisMonth, getSavings,
  } = useAppStore();

  const currency = settings.currency ?? 'CNY';
  const $ = sym(currency);

  const total = getTotalBalance();
  const monthExpense = getMonthExpense();
  const savings = getSavings();
  const budget = getBudget();
  const hasBudget = budget?.monthlyLimit != null;
  const lim = budget?.monthlyLimit ?? 0;
  const budgetLeft = lim - monthExpense;
  const over = hasBudget && budgetLeft < 0;
  const remainingRatio = hasBudget && lim > 0 ? budgetLeft / lim : 1;
  const ringColor = !hasBudget ? '#cbd5e1' : over ? '#ef4444' : remainingRatio <= 0.2 ? '#f59e0b' : '#10b981';
  // 今日还可花 =（本月预算剩）/ 当月剩余天数
  const nowDate = new Date();
  const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - nowDate.getDate() + 1);
  const todayLeft = hasBudget && budgetLeft > 0 ? budgetLeft / daysLeft : 0;
  // 开局引导：无任何流水时先提示设初始余额（避免首笔变负）
  const needsSetup = ledgerEntries.length === 0;

  // 月余额（默认显示）= 本月预算 − 本月已花（流动资金，次月重算）
  const monthBalance = budgetLeft;
  // 总余额的资金类型构成：流动(本月预算剩) / 本月收入 / 结转余额(本月之前带入)
  const monthIncome = getMonthIncome();
  const carried = total - (monthIncome - monthExpense);
  const fundLiquid = Math.max(0, budgetLeft);
  const fundIncome = Math.max(0, monthIncome);
  const fundCarried = Math.max(0, carried);

  const [balanceView, setBalanceView] = useState<'month' | 'total'>('month');
  const [nlText, setNlText] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null);
  const [mode, setMode] = useState<'ledger' | 'assets'>('ledger');
  const [view, setView] = useState<'list' | 'stats'>('list');

  // 流水按日分组（日期降序、同日按 createdAt 降序）
  const grouped = useMemo(() => {
    const sorted = [...ledgerEntries].sort((a, b) =>
      b.date.localeCompare(a.date) || (Number(b.createdAt) - Number(a.createdAt)),
    );
    const map = new Map<string, LedgerEntry[]>();
    for (const e of sorted) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return [...map.entries()];
  }, [ledgerEntries]);

  const handleNL = async () => {
    const text = nlText.trim();
    if (!text || nlBusy) return;
    setNlBusy(true);
    try {
      const r = await parseLedgerInput(text, settings);
      const source: 'manual' | 'ai' = getAIConfig(settings) ? 'ai' : 'manual';
      setDraft(r ? draftFromAI(r, source) : { ...emptyDraft(), note: text });
    } finally {
      setNlBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    const amount = Math.abs(Number(draft.amount));
    if (!amount || !Number.isFinite(amount)) return;
    const saved = draft.direction === 'expense'
      ? await addLedgerEntry({
          direction: 'expense', amount, date: draft.date, source: draft.source,
          type: draft.type,
          category: draft.category.trim() || undefined,
          channel: draft.channel.trim() || undefined,
          note: draft.note.trim() || undefined,
          attribute: isGrowthCategory(draft.type) ? draft.attribute : undefined,
          evalWorth: draft.evalWorth,
        })
      : await addLedgerEntry({
          direction: 'income', amount, date: draft.date, source: draft.source,
          incomeType: draft.incomeType,
          note: draft.note.trim() || undefined,
        });
    await rewardForLedgerEntry(saved, { attribute: draft.attribute, attrPoints: draft.attrPoints, evalWorth: draft.evalWorth });
    if (saved.direction === 'expense' && draft.registerAsset) {
      await addAsset({ name: saved.note || '新资产', category: 'other', price: amount, purchaseDate: saved.date, status: 'inuse', linkedEntryId: saved.id });
    }
    setDraft(null);
    setNlText('');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-2xl mx-auto pb-8"
    >
      {/* 页头 */}
      <div className="flex items-start justify-between gap-3">
        <BackButton onClick={() => setCurrentPage('menu')} className="mt-1 -ml-1" />
        <div className="flex-1">
          <PageTitle title="心相记账" en="Ledger" enOffset={{ right: -20 }} />
        </div>
      </div>

      {/* 顶层：记账 / 资产（平级） */}
      <div className="mt-4">
        <SegmentTabs
          items={[{ key: 'ledger', label: '记账' }, { key: 'assets', label: '资产' }]}
          value={mode}
          onChange={setMode}
          layoutId="ledger-mode"
        />
      </div>

      {mode === 'ledger' && (
        <>
      {/* 开局引导：无流水时先设初始余额（避免首笔变负） */}
      {needsSetup && (
        <button
          onClick={() => setAdjustOpen(true)}
          className="mt-4 w-full rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left active:scale-[0.99] transition"
        >
          <div className="text-sm font-bold text-primary">👋 先设置你当前的余额</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">告诉我你现在大概有多少钱，记账才准——之后随时可「对账」修正。</div>
        </button>
      )}

      {/* 总余额 + 预算环（环显示本月预算「剩余」，花钱往下消耗） */}
      <section className="mt-4 bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
        {balanceView === 'month' ? (
          <BudgetRing ratio={remainingRatio} color={ringColor}>
            <button onClick={() => setBalanceView('total')} className="flex flex-col items-center focus:outline-none" aria-label="切换到总余额">
              <span className="text-xs text-gray-400 dark:text-gray-500">月余额 ⇄</span>
              <span className="text-3xl font-black text-gray-900 dark:text-white tabular-nums mt-0.5">{fmtSigned(monthBalance, $)}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hasBudget ? `预算 ${$}${fmtMoney(lim)}` : '未设预算'}</span>
            </button>
          </BudgetRing>
        ) : (
          <FundRing liquid={fundLiquid} income={fundIncome} carried={fundCarried}>
            <button onClick={() => setBalanceView('month')} className="flex flex-col items-center focus:outline-none" aria-label="切换到月余额">
              <span className="text-xs text-gray-400 dark:text-gray-500">总余额 ⇄</span>
              <span className="text-3xl font-black text-gray-900 dark:text-white tabular-nums mt-0.5">{fmtSigned(total, $)}</span>
              {savings > 0 && <span className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 mt-0.5">🐷 攒下 {$}{fmtMoney(savings)}</span>}
            </button>
          </FundRing>
        )}

        {balanceView === 'month' ? (
          <div className="text-center text-xs text-gray-500 dark:text-gray-400 -mt-1">
            {hasBudget ? (
              over ? (
                <span className="text-rose-500 font-semibold">本月已超 {$}{fmtMoney(-budgetLeft)}</span>
              ) : (
                <>本月预算剩 <b className="tabular-nums">{$}{fmtMoney(budgetLeft)}</b> / {$}{fmtMoney(lim)}{todayLeft > 0 && <> · 今日还可花 <b className="tabular-nums text-emerald-600 dark:text-emerald-400">{$}{fmtMoney(todayLeft)}</b></>}</>
              )
            ) : (
              <span>本月还没设预算</span>
            )}
          </div>
        ) : (
          <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 -mt-1">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#38bdf8' }} />流动 <b className="tabular-nums">{$}{fmtMoney(fundLiquid)}</b></span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} />本月收入 <b className="tabular-nums">{$}{fmtMoney(fundIncome)}</b></span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#818cf8' }} />结转 <b className="tabular-nums">{$}{fmtMoney(fundCarried)}</b></span>
          </div>
        )}

        <div className="flex gap-2 justify-center mt-4">
          <button
            onClick={() => setBudgetOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {hasBudget ? '编辑预算' : '设置预算'}
          </button>
          <button
            onClick={() => setAdjustOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            对账
          </button>
        </div>
      </section>

      {/* 录入条 */}
      <section className="mt-4 flex gap-2">
        <input
          value={nlText}
          onChange={e => setNlText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleNL(); }}
          placeholder="记一笔：28 咖啡 / 工资 8000"
          className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary"
        />
        <button
          onClick={handleNL}
          disabled={nlBusy || !nlText.trim()}
          className="px-4 py-3 rounded-xl text-sm font-bold bg-primary text-white disabled:opacity-40 active:scale-[0.98] transition"
        >
          {nlBusy ? '…' : '记一笔'}
        </button>
        <button
          onClick={() => setDraft(emptyDraft())}
          className="px-3 py-3 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors whitespace-nowrap"
        >
          手动
        </button>
      </section>

      {/* 流水 / 统计 切换 */}
      <div className="mt-4">
        <SegmentTabs
          items={[{ key: 'list', label: '流水' }, { key: 'stats', label: '统计' }]}
          value={view}
          onChange={setView}
          layoutId="ledger-view"
        />
      </div>

      {/* 流水 */}
      {view === 'list' && (
      <section className="mt-5 space-y-4">
        {grouped.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10">还没有记录，记一笔开始吧。</div>
        )}
        {grouped.map(([date, entries]) => (
          <div key={date}>
            <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-1 px-1">{date}</div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm divide-y divide-gray-50 dark:divide-gray-700/40">
              {entries.map(e => <LedgerRow key={e.id} entry={e} $={$} onClick={() => setDeleteTarget(e)} />)}
            </div>
          </div>
        ))}
      </section>
      )}

      {view === 'stats' && <div className="mt-4"><LedgerStats /></div>}
        </>
      )}

      {mode === 'assets' && <div className="mt-4"><AssetBoard /></div>}

      {/* 录入确认卡 */}
      <SheetModal
        isOpen={!!draft}
        onClose={() => setDraft(null)}
        title="确认这一笔"
        footer={
          <button
            onClick={saveDraft}
            disabled={!draft || !Number(draft.amount)}
            className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white disabled:opacity-40 active:scale-[0.98]"
          >
            保存
          </button>
        }
      >
        {draft && (
          <div className="space-y-4">
            {/* 进 / 出 */}
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as const).map(dir => (
                <button
                  key={dir}
                  onClick={() => setDraft({ ...draft, direction: dir })}
                  className={`py-2 rounded-xl text-sm font-bold border transition-colors ${
                    draft.direction === dir
                      ? 'bg-primary/10 border-primary/50 text-primary'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                  }`}
                >
                  {dir === 'expense' ? '支出' : '收入'}
                </button>
              ))}
            </div>

            {/* 金额 */}
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <span className="text-xl font-black text-gray-400">{$}</span>
              <input
                type="number" inputMode="decimal" autoFocus
                value={draft.amount}
                onChange={e => setDraft({ ...draft, amount: e.target.value })}
                placeholder="0"
                className="flex-1 min-w-0 bg-transparent text-2xl font-black text-gray-900 dark:text-white tabular-nums outline-none"
              />
            </div>

            {/* 类别 */}
            {draft.direction === 'expense' ? (
              <div className="flex flex-wrap gap-2">
                {CATEGORY_KEYS.map(t => (
                  <button
                    key={t}
                    onClick={() => setDraft({ ...draft, type: t })}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      draft.type === t
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                    }`}
                  >
                    {catMeta(t).icon} {catMeta(t).label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {INCOME_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setDraft({ ...draft, incomeType: t })}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      draft.incomeType === t
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                    }`}
                  >
                    {INCOME_META[t].label}
                  </button>
                ))}
              </div>
            )}

            {/* 学习（成长类目）→ 自选属性加点 */}
            {draft.direction === 'expense' && isGrowthCategory(draft.type) && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800/40 p-3 space-y-2">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  这笔学习投入，让哪一维成长？<span className="font-normal text-emerald-600/60"> 选了才加点</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ATTR_IDS.map(id => (
                    <button
                      key={id}
                      onClick={() => setDraft({ ...draft, attribute: draft.attribute === id ? undefined : id })}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        draft.attribute === id
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-white dark:bg-gray-800 border-emerald-200 dark:border-emerald-800/60 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {settings.attributeNames[id]}
                    </button>
                  ))}
                </div>
                {draft.attribute && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">加点</span>
                    {[1, 2].map(p => (
                      <button
                        key={p}
                        onClick={() => setDraft({ ...draft, attrPoints: p })}
                        className={`w-7 h-7 rounded-lg font-bold transition-colors ${
                          draft.attrPoints === p ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                        }`}
                      >+{p}</button>
                    ))}
                    <span className="text-gray-400">每日封顶 +2</span>
                  </div>
                )}
              </div>
            )}

            {/* 消费评估（spendEvalEnabled 开时显示） */}
            {draft.direction === 'expense' && settings.spendEvalEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">这笔值得吗？</span>
                {(['worth', 'notWorth'] as const).map(w => (
                  <button
                    key={w}
                    onClick={() => setDraft({ ...draft, evalWorth: draft.evalWorth === w ? undefined : w })}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      draft.evalWorth === w
                        ? (w === 'worth'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                            : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 border-rose-300 dark:border-rose-700')
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
                    }`}
                  >
                    {w === 'worth' ? '值得' : '不值'}
                  </button>
                ))}
                {draft.evalWorth === 'worth' && <span className="text-xs text-emerald-500 font-semibold">+1 SP</span>}
              </div>
            )}

            {/* 流→存桥接：大额支出可登记为固定资产 */}
            {draft.direction === 'expense' && Number(draft.amount) >= 300 && (
              <button
                type="button"
                onClick={() => setDraft({ ...draft, registerAsset: !draft.registerAsset })}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  draft.registerAsset
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
                }`}
              >
                <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] flex-shrink-0 ${draft.registerAsset ? 'bg-amber-500 text-white' : 'border border-gray-300 dark:border-gray-600'}`}>
                  {draft.registerAsset ? '✓' : ''}
                </span>
                同时登记为固定资产
              </button>
            )}

            {/* 备注 + （支出）渠道 + 日期 */}
            <input
              value={draft.note}
              onChange={e => setDraft({ ...draft, note: e.target.value })}
              placeholder="备注（可选）"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              {draft.direction === 'expense' && (
                <input
                  value={draft.channel}
                  onChange={e => setDraft({ ...draft, channel: e.target.value })}
                  placeholder="渠道（支付宝/微信…）"
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:border-primary"
                />
              )}
              <input
                type="date"
                value={draft.date}
                onChange={e => setDraft({ ...draft, date: e.target.value || toLocalDateKey() })}
                className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 tabular-nums outline-none focus:border-primary"
              />
            </div>
          </div>
        )}
      </SheetModal>

      {/* 预算设置 */}
      <BudgetSheet
        isOpen={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        $={$}
        current={budget?.monthlyLimit}
        onSave={async (v) => { await setBudget(toLocalDateKey().slice(0, 7), { monthlyLimit: v }); setBudgetOpen(false); }}
      />

      {/* 余额对账 */}
      <AdjustSheet
        isOpen={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        $={$}
        current={total}
        remaining={3 - getAdjustCountThisMonth()}
        onSave={async (target) => { await adjustTotalBalance(target); setAdjustOpen(false); }}
      />

      {/* 删除确认 */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        tone="danger"
        title="删除这一笔？"
        description={deleteTarget ? `${deleteTarget.note || (deleteTarget.direction === 'income' ? '收入' : '支出')} · ${$}${fmtMoney(deleteTarget.amount)}` : undefined}
        confirmText="删除"
        onConfirm={async () => { if (deleteTarget) await deleteLedgerEntry(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </motion.div>
  );
};

// ── 子组件 ────────────────────────────────────────────────

function LedgerRow({ entry: e, $, onClick }: { entry: LedgerEntry; $: string; onClick: () => void }) {
  const isExpense = e.direction === 'expense';
  const isIncome = e.direction === 'income';
  const meta = isExpense ? catMeta(e.type) : null;
  const sign = isIncome ? '+' : isExpense ? '−' : (e.amount < 0 ? '−' : '+');
  const subParts = [meta?.label, e.channel].filter(Boolean) as string[];
  const sub = isIncome ? INCOME_META[e.incomeType ?? 'other'].label : (e.direction === 'adjust' ? '余额对账' : subParts.join(' · '));
  const title = e.note || (isIncome ? INCOME_META[e.incomeType ?? 'other'].label : (meta?.label ?? '记录'));
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors first:rounded-t-xl last:rounded-b-xl">
      <span className="w-6 text-center text-lg flex-shrink-0">{isExpense ? meta!.icon : isIncome ? '💰' : '⚖️'}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{title}</div>
        {sub && <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{sub}</div>}
      </div>
      <div className={`text-sm font-bold tabular-nums flex-shrink-0 ${isIncome ? 'text-emerald-500' : e.direction === 'adjust' ? 'text-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>
        {sign}{$}{fmtMoney(e.amount)}
      </div>
    </button>
  );
}

function BudgetSheet({ isOpen, onClose, $, current, onSave }: {
  isOpen: boolean; onClose: () => void; $: string; current?: number; onSave: (v: number) => Promise<void>;
}) {
  const [val, setVal] = useState('');
  const v = Number(val);
  return (
    <SheetModal
      isOpen={isOpen}
      onClose={onClose}
      title="本月预算"
      footer={
        <button
          onClick={() => v > 0 && onSave(v)}
          disabled={!(v > 0)}
          className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white disabled:opacity-40 active:scale-[0.98]"
        >
          保存
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          设一个本月的花费上限——它是你的纪律线，不影响总余额。{current != null && `当前：${$}${fmtMoney(current)}`}
        </p>
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className="text-xl font-black text-gray-400">{$}</span>
          <input
            type="number" inputMode="decimal" autoFocus
            value={val} onChange={e => setVal(e.target.value)}
            placeholder={current != null ? String(current) : '3000'}
            className="flex-1 min-w-0 bg-transparent text-2xl font-black text-gray-900 dark:text-white tabular-nums outline-none"
          />
        </div>
      </div>
    </SheetModal>
  );
}

function AdjustSheet({ isOpen, onClose, $, current, remaining, onSave }: {
  isOpen: boolean; onClose: () => void; $: string; current: number; remaining: number; onSave: (target: number) => Promise<void>;
}) {
  const [val, setVal] = useState('');
  const target = Number(val);
  const canSave = remaining > 0 && val.trim() !== '' && Number.isFinite(target);
  return (
    <SheetModal
      isOpen={isOpen}
      onClose={onClose}
      title="余额对账"
      footer={
        <button
          onClick={() => canSave && onSave(target)}
          disabled={!canSave}
          className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white disabled:opacity-40 active:scale-[0.98]"
        >
          {remaining > 0 ? '校准为此余额' : '本月对账已用完'}
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          把总余额校准到你的真实余额（比如对一下支付宝/钱包）。本月还可对账 <b>{Math.max(0, remaining)}</b> 次。
        </p>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          当前总余额：<span className="font-bold text-gray-800 dark:text-gray-100 tabular-nums">{fmtSigned(current, $)}</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className="text-xl font-black text-gray-400">{$}</span>
          <input
            type="number" inputMode="decimal" autoFocus
            value={val} onChange={e => setVal(e.target.value)}
            placeholder={String(current)}
            className="flex-1 min-w-0 bg-transparent text-2xl font-black text-gray-900 dark:text-white tabular-nums outline-none"
          />
        </div>
      </div>
    </SheetModal>
  );
}
