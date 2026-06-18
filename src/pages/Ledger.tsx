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
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
import { PageTitle } from '@/components/PageTitle';
import { BackButton } from '@/components/BackButton';
import { SheetModal } from '@/components/SheetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getAIConfig } from '@/utils/aiClient';
import { parseLedgerBatch, type LedgerAIResult } from '@/utils/ledgerAI';
import { SegmentTabs } from '@/components/SegmentTabs';
import { LedgerStats } from '@/components/ledger/LedgerStats';
import { AssetBoard } from '@/components/ledger/AssetBoard';
import { catMeta, CATEGORY_KEYS, isGrowthCategory, INCOME_META, sym, fmtMoney, fmtSigned, DEFAULT_CHANNELS, DEFAULT_INCOME_SOURCES, incomeTypeFromSource, shiftMonth, weekdayCN, monthLabel } from '@/utils/ledgerFormat';
import type { LedgerEntry, LedgerExpenseType, AttributeId, SpendWorth, Settings } from '@/types';

// ── 录入草稿 ──────────────────────────────────────────────

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

interface EntryDraft {
  direction: 'expense' | 'income';
  amount: string;
  type: LedgerExpenseType;
  incomeSource: string;      // 收入来源标签（→ entry.category；据此派生 incomeType）
  category: string;          // 支出细分类目（二级标签，可选）
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
  direction: 'expense', amount: '', type: 'food', incomeSource: '',
  category: '', channel: '', note: '', date: toLocalDateKey(), source: 'manual', attrPoints: 1, registerAsset: false,
});
const draftFromAI = (r: LedgerAIResult, source: 'manual' | 'ai'): EntryDraft => ({
  direction: r.direction,
  amount: r.amount ? String(r.amount) : '',
  type: r.type ?? 'other',
  incomeSource: r.incomeType === 'labor' ? '工资' : '',
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

/**
 * 资金构成环：收入剩余 + 结转 = 总余额（两段精确占满「已剩」部分）。
 * base = 总余额 + 本月已花 = 月初结转 + 本月收入；空缺弧长即本月已花，次月归零→环回满。
 */
function FundRing({ income, carried, base, children }: { income: number; carried: number; base: number; children: ReactNode }) {
  const R = 84;
  const C = 2 * Math.PI * R;
  const segs = [{ v: income, c: '#34d399' }, { v: carried, c: '#818cf8' }];
  const b = Math.max(base, income + carried, 1);
  let acc = 0;
  return (
    <div className="relative w-56 h-56 mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <circle cx="100" cy="100" r={R} fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-800" />
        {segs.map((sg, i) => {
          const f = sg.v / b;
          const el = (
            <circle
              key={i} cx="100" cy="100" r={R} fill="none" stroke={sg.c} strokeWidth="12"
              strokeDasharray={`${f * C} ${C}`} strokeDashoffset={-acc * C}
              style={{ transition: 'stroke-dasharray .5s ease, stroke-dashoffset .5s ease' }}
            />
          );
          acc += f;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">{children}</div>
    </div>
  );
}

// ── 标签选择器（渠道 / 收入来源 / 细分类目共用） ─────────────
/** chips 单选 + ＋自定义(持久化) + 可折叠；clearable=再点选中项可取消。 */
function TagPicker({
  options, value, onChange, onAdd, addPlaceholder = '新类型', accent = 'primary',
  collapsedCount, expanded, onToggleExpand, clearable = true,
}: {
  options: string[]; value: string; onChange: (v: string) => void;
  onAdd?: (v: string) => void; addPlaceholder?: string; accent?: 'primary' | 'emerald';
  collapsedCount?: number; expanded?: boolean; onToggleExpand?: () => void; clearable?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const overflow = collapsedCount != null && options.length > collapsedCount;
  const collapsed = overflow && !expanded;
  const shown = collapsed ? options.slice(0, collapsedCount) : options;
  const sel = accent === 'emerald'
    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
    : 'bg-primary/10 border-primary/40 text-primary';
  const idle = 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400';
  const dashed = 'border-dashed border-gray-300 dark:border-gray-600 text-gray-400';
  const commit = () => { const v = text.trim(); if (v) { onAdd?.(v); onChange(v); } setText(''); setAdding(false); };
  return (
    <div className="flex flex-wrap gap-2">
      {shown.map(o => (
        <button key={o} type="button" onClick={() => onChange(clearable && value === o ? '' : o)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${value === o ? sel : idle}`}>
          {o}
        </button>
      ))}
      {overflow && (
        <button type="button" onClick={onToggleExpand} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${dashed}`}>
          {collapsed ? `更多 ${options.length - collapsedCount!}` : '收起'}
        </button>
      )}
      {onAdd && (adding ? (
        <input autoFocus value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setText(''); setAdding(false); } }}
          onBlur={commit} placeholder={addPlaceholder} maxLength={8}
          className="px-3 py-1.5 w-24 rounded-full text-xs bg-white dark:bg-gray-800 border border-primary/50 text-gray-800 dark:text-white outline-none" />
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${dashed} hover:text-primary hover:border-primary/40 transition-colors`}>
          ＋自定义
        </button>
      ))}
    </div>
  );
}

// ── 日期快捷选择（今天/昨天/前天 + 选择器；单笔卡 / 批量卡共用） ──
function DateQuickPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toLocalDateKey(d); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {([['今天', 0], ['昨天', 1]] as const).map(([lbl, n]) => {
        const dk = ago(n);
        return (
          <button
            key={lbl} type="button" onClick={() => onChange(dk)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              value === dk
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400'
            }`}
          >
            {lbl}
          </button>
        );
      })}
      <input
        type="date" value={value}
        onChange={e => onChange(e.target.value || toLocalDateKey())}
        className="px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 tabular-nums outline-none focus:border-primary"
      />
    </div>
  );
}

// ── 多笔录入行（Batch2③：一句多笔 → 可增减的批量卡） ──
interface BatchRow {
  direction: 'expense' | 'income';
  amount: string;
  type: LedgerExpenseType;
  channel: string;        // 支出渠道
  incomeSource: string;   // 收入来源
  note: string;
}
const rowFromResult = (r: LedgerAIResult): BatchRow => ({
  direction: r.direction,
  amount: r.amount ? String(r.amount) : '',
  type: r.type ?? 'other',
  channel: '',
  incomeSource: r.direction === 'income' ? (r.incomeType === 'labor' ? '工资' : (r.category ?? '')) : '',
  note: r.note ?? '',
});
const emptyRow = (): BatchRow => ({ direction: 'expense', amount: '', type: 'food', channel: '', incomeSource: '', note: '' });

// ── 页面 ──────────────────────────────────────────────────

export const Ledger = () => {
  const {
    settings, ledgerEntries, setCurrentPage, updateSettings,
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
  // 总余额资金构成（两段精确等于总余额）：本月支出先扣「本月收入」，花光再扣「结转」
  const monthIncome = getMonthIncome();                  // 含本月对账转入
  const opening = total - monthIncome + monthExpense;     // 月初结转（本月之前带入的真钱）
  const fundIncome = Math.max(0, monthIncome - monthExpense);                  // 收入剩余（先扣）
  const fundCarried = Math.max(0, opening - Math.max(0, monthExpense - monthIncome)); // 结转（后扣）
  const fundBase = total + monthExpense;                 // 进度环满刻度（= 月初结转 + 本月收入；空缺=本月已花）

  const [balanceView, setBalanceView] = useState<'month' | 'total'>('month');
  const [nlText, setNlText] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [budgetMode, setBudgetMode] = useState<null | 'edit' | 'newCycle'>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null);
  const [mode, setMode] = useState<'ledger' | 'assets'>('ledger');
  const [view, setView] = useState<'list' | 'stats'>('list');
  const [batch, setBatch] = useState<BatchRow[] | null>(null);   // 多笔批量卡
  const [batchDate, setBatchDate] = useState(toLocalDateKey());
  const [subCatOpen, setSubCatOpen] = useState(false);           // 细分类目默认折叠
  const [listMonth, setListMonth] = useState(() => toLocalDateKey().slice(0, 7)); // 流水筛选月份

  // ── Batch2 录入选项（可手动增删、持久化）+ 记忆 ──
  const channels = settings.ledgerChannels ?? DEFAULT_CHANNELS;
  const incomeSources = settings.ledgerIncomeSources ?? DEFAULT_INCOME_SOURCES;
  const subCategories = settings.ledgerCategories ?? [];
  const channelsExpanded = settings.ledgerChannelsExpanded ?? false;
  const addOption = (key: 'ledgerChannels' | 'ledgerIncomeSources' | 'ledgerCategories', cur: string[]) =>
    (v: string) => { if (!cur.includes(v)) updateSettings({ [key]: [...cur, v] } as Partial<Settings>); };
  // 新建草稿：支出预选「上次渠道」；细分类目重置为折叠（除非草稿已带值）
  const startDraft = (d: EntryDraft) => {
    setSubCatOpen(!!d.category);
    setDraft(d.direction === 'expense' && !d.channel ? { ...d, channel: settings.ledgerLastChannel ?? '' } : d);
  };

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

  // 流水按月筛选 + 当月收支小结
  const monthGrouped = useMemo(() => grouped.filter(([date]) => date.slice(0, 7) === listMonth), [grouped, listMonth]);
  const monthSum = useMemo(() => {
    let exp = 0, inc = 0;
    for (const [, es] of monthGrouped) for (const e of es) {
      if (e.direction === 'expense') exp += e.amount;
      else if (e.direction === 'income') inc += e.amount;
    }
    return { exp, inc };
  }, [monthGrouped]);
  const curMonth = toLocalDateKey().slice(0, 7);

  // 发薪日 / 重置日 → 当前预算周期 id；进入新周期且未确认时弹「规划窗」
  const resetDay = settings.ledgerResetDay ?? 1;
  const currentCycle = useMemo(() => {
    const d = new Date();
    const base = new Date(d.getFullYear(), d.getMonth(), 1);
    if (d.getDate() < resetDay) base.setMonth(base.getMonth() - 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
  }, [resetDay]);
  useEffect(() => {
    if (settings.ledgerEnabled === false || ledgerEntries.length === 0) return; // 新用户走开局引导
    if (settings.ledgerCycleConfirmed === currentCycle) return;
    setBudgetMode('newCycle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNL = async () => {
    const text = nlText.trim();
    if (!text || nlBusy) return;
    setNlBusy(true);
    try {
      const source: 'manual' | 'ai' = getAIConfig(settings) ? 'ai' : 'manual';
      const results = await parseLedgerBatch(text, settings);
      if (results.length >= 2) {
        // 多笔 → 批量确认卡（支出行预选上次渠道）
        const last = settings.ledgerLastChannel ?? '';
        setBatchDate(toLocalDateKey());
        setBatch(results.map(rowFromResult).map(r => (r.direction === 'expense' && !r.channel ? { ...r, channel: last } : r)));
      } else {
        // 单笔（含 0 笔兜底转手动）
        startDraft(results[0] ? draftFromAI(results[0], source) : { ...emptyDraft(), note: text });
      }
    } finally {
      setNlBusy(false);
    }
  };

  const updateRow = (i: number, patch: Partial<BatchRow>) =>
    setBatch(rows => rows ? rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) : rows);
  const saveBatch = async () => {
    if (!batch) return;
    const aiSrc: 'manual' | 'ai' = getAIConfig(settings) ? 'ai' : 'manual';
    let lastCh = '';
    for (const r of batch) {
      const amount = Math.abs(Number(r.amount));
      if (!amount || !Number.isFinite(amount)) continue;
      const saved = r.direction === 'expense'
        ? await addLedgerEntry({ direction: 'expense', amount, date: batchDate, source: aiSrc, type: r.type, channel: r.channel.trim() || undefined, note: r.note.trim() || undefined })
        : await addLedgerEntry({ direction: 'income', amount, date: batchDate, source: aiSrc, incomeType: incomeTypeFromSource(r.incomeSource), category: r.incomeSource.trim() || undefined, note: r.note.trim() || undefined });
      await rewardForLedgerEntry(saved);
      if (r.direction === 'expense' && r.channel.trim()) lastCh = r.channel.trim();
    }
    if (lastCh && settings.ledgerLastChannel !== lastCh) updateSettings({ ledgerLastChannel: lastCh });
    setListMonth(batchDate.slice(0, 7));    // 跳到批量记账所在月
    setBatch(null);
    setNlText('');
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
          incomeType: incomeTypeFromSource(draft.incomeSource),
          category: draft.incomeSource.trim() || undefined,
          note: draft.note.trim() || undefined,
        });
    await rewardForLedgerEntry(saved, { attribute: draft.attribute, attrPoints: draft.attrPoints, evalWorth: draft.evalWorth });
    if (saved.direction === 'expense' && draft.registerAsset) {
      await addAsset({ name: saved.note || '新资产', category: 'other', price: amount, purchaseDate: saved.date, status: 'inuse', linkedEntryId: saved.id });
    }
    // 记忆：支出渠道（下次新建预选）
    const ch = draft.channel.trim();
    if (saved.direction === 'expense' && ch && settings.ledgerLastChannel !== ch) updateSettings({ ledgerLastChannel: ch });
    setListMonth(saved.date.slice(0, 7));   // 跳到刚记账所在月，确保可见
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
          <FundRing income={fundIncome} carried={fundCarried} base={fundBase}>
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
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} />收入剩余 <b className="tabular-nums">{$}{fmtMoney(fundIncome)}</b></span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#818cf8' }} />结转 <b className="tabular-nums">{$}{fmtMoney(fundCarried)}</b></span>
          </div>
        )}

        <div className="flex gap-2 justify-center mt-4">
          <button
            onClick={() => setBudgetMode('edit')}
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
          onClick={() => startDraft(emptyDraft())}
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
        {/* 月份导航 + 当月收支小结 */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setListMonth(shiftMonth(listMonth, -1))}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="上个月"
          >
            ←
          </button>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-800 dark:text-gray-100 tabular-nums">{monthLabel(listMonth)}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              支出 <b className="tabular-nums text-gray-500 dark:text-gray-400">{$}{fmtMoney(monthSum.exp)}</b>
              {monthSum.inc > 0 && <> · 收入 <b className="tabular-nums text-emerald-500">{$}{fmtMoney(monthSum.inc)}</b></>}
            </div>
          </div>
          <button
            onClick={() => setListMonth(shiftMonth(listMonth, 1))}
            disabled={listMonth >= curMonth}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="下个月"
          >
            →
          </button>
        </div>

        {monthGrouped.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10">
            {ledgerEntries.length === 0 ? '还没有记录，记一笔开始吧。' : '这个月还没有记录。'}
          </div>
        )}
        {monthGrouped.map(([date, entries]) => (
          <div key={date}>
            <div className="flex items-baseline gap-1.5 mb-1 px-1">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 tabular-nums">{date}</span>
              <span className="text-xs text-gray-300 dark:text-gray-600">{weekdayCN(date)}</span>
            </div>
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
              <div className="space-y-1.5">
                <div className="text-xs text-gray-500 dark:text-gray-400">来源</div>
                <TagPicker
                  options={incomeSources} value={draft.incomeSource}
                  onChange={v => setDraft({ ...draft, incomeSource: v })}
                  onAdd={addOption('ledgerIncomeSources', incomeSources)}
                  addPlaceholder="新来源" accent="emerald"
                />
                {incomeTypeFromSource(draft.incomeSource) === 'labor' && (
                  <div className="text-xs text-emerald-500 font-semibold">劳动所得 · 记账 +10 SP</div>
                )}
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

            {/* 备注 */}
            <input
              value={draft.note}
              onChange={e => setDraft({ ...draft, note: e.target.value })}
              placeholder="备注（可选）"
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:border-primary"
            />

            {/* 支出：渠道 + 细分类目（chips，可手动加） */}
            {draft.direction === 'expense' && (
              <>
                <div className="space-y-1.5">
                  <div className="text-xs text-gray-500 dark:text-gray-400">支付渠道</div>
                  <TagPicker
                    options={channels} value={draft.channel}
                    onChange={v => setDraft({ ...draft, channel: v })}
                    onAdd={addOption('ledgerChannels', channels)}
                    addPlaceholder="新渠道"
                    collapsedCount={6} expanded={channelsExpanded}
                    onToggleExpand={() => updateSettings({ ledgerChannelsExpanded: !channelsExpanded })}
                  />
                </div>
                {subCatOpen ? (
                  <div className="space-y-1.5">
                    <div className="text-xs text-gray-500 dark:text-gray-400">细分类目 <span className="text-gray-400/70 font-normal">可选</span></div>
                    <TagPicker
                      options={subCategories} value={draft.category}
                      onChange={v => setDraft({ ...draft, category: v })}
                      onAdd={addOption('ledgerCategories', subCategories)}
                      addPlaceholder="如：早餐"
                    />
                  </div>
                ) : (
                  <button
                    type="button" onClick={() => setSubCatOpen(true)}
                    className="text-xs font-semibold text-gray-400 hover:text-primary transition-colors"
                  >
                    ＋ 细分类目（可选）
                  </button>
                )}
              </>
            )}

            {/* 日期：今天/昨天/前天 快捷 + 选择器 */}
            <div className="space-y-1.5">
              <div className="text-xs text-gray-500 dark:text-gray-400">日期</div>
              <DateQuickPicker value={draft.date} onChange={d => setDraft({ ...draft, date: d })} />
            </div>
          </div>
        )}
      </SheetModal>

      {/* 多笔批量确认卡 */}
      <SheetModal
        isOpen={!!batch}
        onClose={() => setBatch(null)}
        title={`确认 ${batch?.length ?? 0} 笔`}
        footer={
          <button
            onClick={saveBatch}
            disabled={!batch?.some(r => Number(r.amount) > 0)}
            className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white disabled:opacity-40 active:scale-[0.98]"
          >
            全部保存{batch ? `（${batch.filter(r => Number(r.amount) > 0).length}）` : ''}
          </button>
        }
      >
        {batch && (
          <div className="space-y-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">识别到多笔，逐行确认 / 增删后一次保存</div>
            <div className="space-y-2">
              {batch.map((row, i) => (
                <div key={i} className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2.5 space-y-2">
                  {/* 行 1：支/收 + 金额 + 删除 */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateRow(i, { direction: row.direction === 'expense' ? 'income' : 'expense' })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex-shrink-0 transition-colors ${
                        row.direction === 'income'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                      }`}
                    >
                      {row.direction === 'income' ? '收入' : '支出'}
                    </button>
                    <div className="flex items-center gap-1 flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                      <span className="text-gray-400 text-sm">{$}</span>
                      <input
                        type="number" inputMode="decimal" value={row.amount} placeholder="0"
                        onChange={e => updateRow(i, { amount: e.target.value })}
                        className="w-full min-w-0 bg-transparent text-base font-bold tabular-nums text-gray-900 dark:text-white outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setBatch(rows => (rows && rows.length > 1 ? rows.filter((_, j) => j !== i) : rows))}
                      className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      aria-label="删除此行"
                    >
                      ✕
                    </button>
                  </div>
                  {/* 行 2：(支出)类目 + 渠道 / (收入)来源 */}
                  <div className="flex items-center gap-2">
                    {row.direction === 'expense' ? (
                      <>
                        <select
                          value={row.type} onChange={e => updateRow(i, { type: e.target.value as LedgerExpenseType })}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-200 outline-none"
                        >
                          {CATEGORY_KEYS.map(t => <option key={t} value={t}>{catMeta(t).icon} {catMeta(t).label}</option>)}
                        </select>
                        <select
                          value={row.channel} onChange={e => updateRow(i, { channel: e.target.value })}
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-200 outline-none"
                        >
                          <option value="">渠道…</option>
                          {[...new Set([...channels, row.channel].filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </>
                    ) : (
                      <select
                        value={row.incomeSource} onChange={e => updateRow(i, { incomeSource: e.target.value })}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-200 outline-none"
                      >
                        <option value="">来源…</option>
                        {[...new Set([...incomeSources, row.incomeSource].filter(Boolean))].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>
                  {/* 行 3：备注 */}
                  <input
                    value={row.note} placeholder="备注"
                    onChange={e => updateRow(i, { note: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-800 dark:text-white placeholder-gray-400 outline-none"
                  />
                </div>
              ))}
            </div>
            {/* 加一行 */}
            <button
              type="button"
              onClick={() => setBatch(rows => (rows ? [...rows, { ...emptyRow(), channel: settings.ledgerLastChannel ?? '' }] : rows))}
              className="w-full py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-400 hover:text-primary hover:border-primary/40 transition-colors"
            >
              ＋ 添加一行
            </button>
            {/* 共享日期 */}
            <div className="space-y-1.5 pt-1">
              <div className="text-xs text-gray-500 dark:text-gray-400">日期（应用到全部）</div>
              <DateQuickPicker value={batchDate} onChange={setBatchDate} />
            </div>
          </div>
        )}
      </SheetModal>

      {/* 预算设置 */}
      <BudgetSheet
        isOpen={budgetMode !== null}
        newCycle={budgetMode === 'newCycle'}
        onClose={() => {
          if (budgetMode === 'newCycle') updateSettings({ ledgerCycleConfirmed: currentCycle });
          setBudgetMode(null);
        }}
        $={$}
        current={budget?.monthlyLimit}
        savingsCurrent={budget?.savingsGoal}
        days={daysInMonth}
        resetDay={resetDay}
        onResetDay={d => updateSettings({ ledgerResetDay: d })}
        onSave={async (monthly, savings) => {
          await setBudget(toLocalDateKey().slice(0, 7), { monthlyLimit: monthly, savingsGoal: savings });
          if (budgetMode === 'newCycle') await updateSettings({ ledgerCycleConfirmed: currentCycle });
          setBudgetMode(null);
        }}
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
  const subParts = [meta?.label, e.category, e.channel].filter(Boolean) as string[];
  const incomeLabel = e.category || INCOME_META[e.incomeType ?? 'other'].label;
  const sub = isIncome ? incomeLabel : (e.direction === 'adjust' ? '余额对账' : subParts.join(' · '));
  const title = e.note || (isIncome ? incomeLabel : (meta?.label ?? '记录'));
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

/** 月预算 ⇄ 日均 联动输入：改一个、另一个按当月天数自动算（日均更醒目）。 */
function BudgetDualInput({ $, days, monthly, setMonthly }: { $: string; days: number; monthly: string; setMonthly: (v: string) => void }) {
  const [daily, setDaily] = useState(() => { const m = Number(monthly); return m > 0 ? String(Math.round(m / days)) : ''; });
  useEffect(() => { const m = Number(monthly); setDaily(m > 0 ? String(Math.round(m / days)) : ''); }, [monthly, days]);
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-text">
        <span className="block text-[11px] text-gray-400 mb-0.5">月预算</span>
        <span className="flex items-baseline gap-1">
          <span className="text-sm font-bold text-gray-400">{$}</span>
          <input
            type="number" inputMode="decimal" value={monthly} placeholder="3000"
            onChange={e => setMonthly(e.target.value)}
            className="w-full min-w-0 bg-transparent text-lg font-black text-gray-900 dark:text-white tabular-nums outline-none"
          />
        </span>
      </label>
      <label className="rounded-xl bg-primary/5 border border-primary/30 px-3 py-2.5 cursor-text">
        <span className="block text-[11px] text-primary/70 mb-0.5">日均</span>
        <span className="flex items-baseline gap-1">
          <span className="text-sm font-bold text-primary/60">{$}</span>
          <input
            type="number" inputMode="decimal" value={daily} placeholder="100"
            onChange={e => { const v = e.target.value; setDaily(v); const d = Number(v); setMonthly(d > 0 ? String(Math.round(d * days)) : ''); }}
            className="w-full min-w-0 bg-transparent text-lg font-black text-primary tabular-nums outline-none"
          />
        </span>
      </label>
    </div>
  );
}

function BudgetSheet({ isOpen, onClose, $, current, savingsCurrent, days, resetDay, onResetDay, onSave, newCycle }: {
  isOpen: boolean; onClose: () => void; $: string;
  current?: number; savingsCurrent?: number; days: number;
  resetDay: number; onResetDay: (d: number) => void;
  onSave: (monthly: number, savings: number | undefined) => void | Promise<void>;
  newCycle?: boolean;
}) {
  const [monthly, setMonthly] = useState('');
  const [savings, setSavings] = useState('');
  useEffect(() => {
    if (isOpen) {
      setMonthly(current != null ? String(current) : '');
      setSavings(savingsCurrent != null ? String(savingsCurrent) : '');
    }
  }, [isOpen, current, savingsCurrent]);
  const m = Number(monthly);
  const sv = Number(savings);
  return (
    <SheetModal
      isOpen={isOpen}
      onClose={onClose}
      title={newCycle ? '新的一程 · 立个目标' : '本月预算'}
      footer={
        <button
          onClick={() => m > 0 && onSave(m, sv > 0 ? sv : undefined)}
          disabled={!(m > 0)}
          className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white disabled:opacity-40 active:scale-[0.98]"
        >
          {newCycle ? '就这么定' : '保存'}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {newCycle
            ? '新的一程开始了——给自己定个花费节奏，和一个想攒下的小目标。'
            : '设一个本月的花费上限——它是你的纪律线，不影响总余额。'}
        </p>
        {/* 月预算 ⇄ 日均 */}
        <div className="space-y-1.5">
          <div className="text-xs text-gray-500 dark:text-gray-400">花费目标 <span className="text-gray-400/70 font-normal">改一个，另一个按 {days} 天自动算</span></div>
          <BudgetDualInput $={$} days={days} monthly={monthly} setMonthly={setMonthly} />
        </div>
        {/* 想省 */}
        <div className="space-y-1.5">
          <div className="text-xs text-gray-500 dark:text-gray-400">这个月想省下 <span className="text-gray-400/70 font-normal">可选</span></div>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800/40">
            <span className="text-lg font-black text-emerald-500/70">{$}</span>
            <input
              type="number" inputMode="decimal" value={savings} placeholder="500"
              onChange={e => setSavings(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-xl font-black text-emerald-600 dark:text-emerald-300 tabular-nums outline-none"
            />
          </div>
        </div>
        {/* 重置日（发薪日） */}
        <div className="space-y-1.5">
          <div className="text-xs text-gray-500 dark:text-gray-400">每月重置日 <span className="text-gray-400/70 font-normal">发薪日 · 决定何时提醒你规划新一程</span></div>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={28} inputMode="numeric" value={resetDay}
              onChange={e => onResetDay(Math.max(1, Math.min(28, Math.round(Number(e.target.value) || 1))))}
              className="w-20 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-800 dark:text-white tabular-nums outline-none"
            />
            <span className="text-xs text-gray-400">号{resetDay === 1 ? '（自然月初）' : '起算'}</span>
          </div>
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
