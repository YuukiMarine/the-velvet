/**
 * Ledger — F5 记账（Phase ①）。
 *
 * 三层模型的 UI：
 *   · 流：NL/手动录入 → 可改确认卡 → 落账；按日分组流水列表。
 *   · 存：总余额（流动资产，可 toggle 本月余额）；预算进度环。
 *   · 纪律：本月预算（首次设置 / 编辑）；总余额对账（月限 3 次）。
 *
 * 奖励 / 统计 / 资产 / 月末结算属后续批次，本页先把核心跑通。
 */
import { useEffect, useMemo, useState } from 'react';
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
import { Donut } from '@/components/ledger/Donut';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, P3PageHeader, slantClip } from '@/components/p3r/kit';
import { P5R, P5Collage, P5SubBar, P5Star, P5Dots, P5Slab, P5RPage } from '@/components/p5r/kit';
import { catMeta, CATEGORY_KEYS, isGrowthCategory, INCOME_META, sym, fmtMoney, fmtSigned, DEFAULT_CHANNELS, DEFAULT_INCOME_SOURCES, incomeTypeFromSource, shiftMonth, weekdayCN, monthLabel, ledgerDateLabel, ledgerCycle } from '@/utils/ledgerFormat';
import type { LedgerEntry, LedgerExpenseType, AttributeId, SpendWorth, Settings } from '@/types';
import { P4Flower } from '@/ui/p4Kit';

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

// ── 入场动效（明显有设计感：错落 + 弹性上浮 / 主卡缩放） ──
const riseIn = (i: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.03 + i * 0.06, type: 'spring' as const, stiffness: 380, damping: 30 },
});
const popIn = (i: number) => ({
  initial: { opacity: 0, scale: 0.93, y: 14 },
  animate: { opacity: 1, scale: 1, y: 0 },
  transition: { delay: 0.03 + i * 0.06, type: 'spring' as const, stiffness: 300, damping: 22 },
});

// ── 页面 ──────────────────────────────────────────────────

export const Ledger = () => {
  const isP4 = useUiChannel() === 'p4';
  const {
    settings, ledgerEntries, setCurrentPage, updateSettings,
    addLedgerEntry, deleteLedgerEntry, setBudget, adjustTotalBalance, rewardForLedgerEntry, addAsset,
    getTotalBalance, getPeriodExpense, getPeriodIncome, getBudget, getAdjustCountThisMonth, getSavings,
  } = useAppStore();

  const currency = settings.currency ?? 'CNY';
  const $ = sym(currency);

  const total = getTotalBalance();
  // 当前周期：日历月（默认），或开启「发薪日周期」后按 ledgerResetDay 切分（M4）
  const todayKey = toLocalDateKey();
  const cycle = useMemo(
    () => ledgerCycle(settings.ledgerPayCycleEnabled === true, settings.ledgerResetDay ?? 1, todayKey),
    [settings.ledgerPayCycleEnabled, settings.ledgerResetDay, todayKey],
  );
  const monthExpense = getPeriodExpense(cycle.key);
  const savings = getSavings();
  const budget = getBudget(cycle.key);
  const hasBudget = budget?.monthlyLimit != null;
  const lim = budget?.monthlyLimit ?? 0;
  const budgetLeft = lim - monthExpense;
  const over = hasBudget && budgetLeft < 0;
  const remainingRatio = hasBudget && lim > 0 ? budgetLeft / lim : 1;
  const ringColor = !hasBudget ? '#cbd5e1' : over ? '#ef4444' : remainingRatio <= 0.2 ? '#f59e0b' : '#10b981';
  // 今日还可花 =（本周期预算剩）/ 周期剩余天数
  const cdt = (k: string) => { const [yy, mm, dd] = k.split('-').map(Number); return new Date(yy, mm - 1, dd); };
  const daysInMonth = Math.max(1, Math.round((cdt(cycle.end).getTime() - cdt(cycle.start).getTime()) / 86400000) + 1);
  const daysLeft = Math.max(1, Math.round((cdt(cycle.end).getTime() - cdt(todayKey < cycle.end ? todayKey : cycle.end).getTime()) / 86400000) + 1);
  const todayLeft = hasBudget && budgetLeft > 0 ? budgetLeft / daysLeft : 0;
  // 开局引导：无任何流水时先提示设初始余额（避免首笔变负）
  const needsSetup = ledgerEntries.length === 0;

  // 月余额（默认显示）= 本周期预算 − 本周期已花（流动资金，下期重算）
  const monthBalance = budgetLeft;
  // 总余额资金构成（两段精确等于总余额）：本期支出先扣「本期收入」，花光再扣「结转」
  const monthIncome = getPeriodIncome(cycle.key);                  // 含本期对账转入
  const opening = total - monthIncome + monthExpense;     // 月初结转（本月之前带入的真钱）
  const fundIncome = Math.max(0, monthIncome - monthExpense);                  // 收入剩余（先扣）
  const fundCarried = Math.max(0, opening - Math.max(0, monthExpense - monthIncome)); // 结转（后扣）
  const fundBase = total + monthExpense;                 // 进度环满刻度（= 月初结转 + 本月收入；空缺=本月已花）

  const [balanceView, setBalanceView] = useState<'month' | 'total'>('month');
  // P3R（蓝频道）：p3-ledger-reference-v2 形态
  const p3 = useUiChannel() === 'p3';
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

  // 当前预算周期 id = cycle.key（日历月或发薪日周期）；进入新周期且未确认时弹「规划窗」
  const resetDay = settings.ledgerResetDay ?? 1;
  const currentCycle = cycle.key;
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

  const p5 = useUiChannel() === 'p5';

  return (
    <P3RPage active={p3}>
    <P5RPage active={p5}>
    <motion.div
      initial={false} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={`relative max-w-2xl mx-auto pb-8 ${isP4 ? 'p4-reskin' : ''} ${p5 ? 'p5-reskin' : ''}`}
    >
      {p5 && (
        <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-6 h-[200px]" style={{ zIndex: -1 }}>
          <P5Slab color={P5R.red} seed={261} rot={9} style={{ right: -60, top: -24, width: 240, height: 150 }} />
          <P5Star size={26} fill={P5R.red} rot={-10} className="absolute" style={{ right: 30, top: 120 }} />
          <P5Dots className="absolute" style={{ left: 0, top: 60, width: 70, height: 90 }} color="#4a4741" />
        </div>
      )}
      {/* 页头：P4 = 衬线特大 + LEDGER SHOW 橙眉标（p4-ledger-reference-v2）；
          p3 = 大黑斜体 + 左上双青片装饰（p3-ledger 设计稿） */}
      {p5 ? (
        <motion.div {...riseIn(0)} className="flex items-start gap-2 pt-1">
          <button
            type="button"
            onClick={() => setCurrentPage('menu')}
            aria-label="返回"
            className="relative mt-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
            style={{ background: P5R.paper, border: '2.5px solid #050505', boxShadow: '3px 3px 0 #000000', clipPath: 'polygon(2px 1px, calc(100% - 1px) 3px, calc(100% - 3px) calc(100% - 1px), 1px calc(100% - 3px))' }}
          >
            <span aria-hidden className="h-0 w-0 border-y-[7px] border-y-transparent border-r-[11px]" style={{ borderRightColor: '#050505' }} />
          </button>
          <div className="min-w-0">
            <P5Collage
              size={30}
              tiles={[
                { ch: '心', bg: P5R.paper, fg: P5R.red, scale: 1.06, rot: -4, dy: 0 },
                { ch: '相', bg: '#9b9791', fg: P5R.ink, rot: 3, dy: 6 },
                { ch: '记', bg: P5R.red, fg: P5R.ink, rot: -2, dy: 2 },
                { ch: '账', bg: P5R.paper, fg: P5R.ink, rot: 2.5, dy: 8 },
              ]}
            />
            <div className="mt-2 pl-9">
              <P5SubBar segs={[{ t: 'LEDGER' }]} star={false} rot={-1.2} className="!px-2.5 !py-0.5" />
            </div>
          </div>
        </motion.div>
      ) : isP4 ? (
        <motion.div {...riseIn(0)} className="flex items-start gap-2">
          <BackButton onClick={() => setCurrentPage('menu')} className="mt-3 -ml-1" />
          <div>
            <h1
              className="text-[42px] font-black leading-[1.05] tracking-tight text-[#131313]"
              style={{ fontFamily: 'var(--p4-display-font, serif)' }}
            >
              心相记账
            </h1>
            <div className="mt-0.5 text-xs font-black tracking-[0.22em] text-[var(--p4-orange,#f9a11b)]">LEDGER SHOW</div>
          </div>
        </motion.div>
      ) : p3 ? (
        <motion.div {...riseIn(0)} className="relative">
          <span aria-hidden className="absolute left-[2px] top-[34px] flex gap-1">
            <span className="h-[11px] w-[15px]" style={{ background: P3R.blue, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
            <span className="h-[11px] w-[12px]" style={{ background: '#9adcee', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          </span>
          <P3PageHeader ticks title="记账" onBack={() => setCurrentPage('menu')} className="pt-2" />
        </motion.div>
      ) : (
      <motion.div {...riseIn(0)} className="flex items-start justify-between gap-3">
        <BackButton onClick={() => setCurrentPage('menu')} className="mt-1 -ml-1" />
        <div className="flex-1">
          <PageTitle title="记账" en="Ledger" enOffset={{ right: -20 }} />
        </div>
      </motion.div>
      )}

      {/* 顶层：记账 / 资产（平级） */}
      <motion.div {...riseIn(1)} className="mt-4">
        <SegmentTabs
          items={[{ key: 'ledger', label: '记账' }, { key: 'assets', label: '资产' }]}
          value={mode}
          onChange={setMode}
          layoutId="ledger-mode"
        />
      </motion.div>

      {mode === 'ledger' && (
        <>
      {/* 开局引导：无流水时先设初始余额（避免首笔变负）
          p3（设计稿）：浅青斜条 + ⚠ + 蓝粗标题 + 右缘青三角 */}
      {needsSetup && (
        isP4 ? (
          /* p4：奶油话泡（左下小尾巴），橙色标题黑正文 */
          <button
            onClick={() => setAdjustOpen(true)}
            className="relative mt-4 w-full px-5 py-3.5 text-left active:scale-[0.99] transition"
            style={{ background: 'var(--ui-paper)', borderRadius: 22 }}
          >
            <div className="text-sm font-black text-[var(--p4-orange,#f9a11b)]">👋 先设置你当前的余额</div>
            <div className="mt-0.5 text-xs font-semibold text-[#131313]/80">告诉我你现在大概有多少钱，记账才准——之后随时可「对账」修正。</div>
            <span
              aria-hidden
              className="absolute -bottom-2 left-10 h-5 w-5"
              style={{ background: 'var(--ui-paper)', clipPath: 'polygon(0 0, 100% 0, 30% 100%)' }}
            />
          </button>
        ) : p3 ? (
          <button
            onClick={() => setAdjustOpen(true)}
            className="relative mt-4 w-full px-4 py-3 text-left transition active:scale-[0.99]"
            style={{ clipPath: slantClip(12), background: P3R.cyanPale }}
          >
            <div className="flex items-center gap-2 text-[14px] font-black" style={{ color: P3R.blue }}>
              <span aria-hidden>⚠️</span> 先设置你当前的余额
            </div>
            <div className="mt-0.5 pl-6 text-[12px] font-semibold" style={{ color: P3R.ink }}>告诉我你现在大概有多少钱，记账才准——之后随时可「对账」修正。</div>
            <span aria-hidden className="absolute right-2 top-1/2 h-4 w-5 -translate-y-1/2" style={{ background: 'rgba(53,209,232,0.9)', clipPath: 'polygon(0 100%, 100% 0, 100% 100%)' }} />
          </button>
        ) : (
        <button
          onClick={() => setAdjustOpen(true)}
          className="mt-4 w-full rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left active:scale-[0.99] transition"
        >
          <div className="text-sm font-bold text-primary">👋 先设置你当前的余额</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">告诉我你现在大概有多少钱，记账才准——之后随时可「对账」修正。</div>
        </button>
        )
      )}

      {/* 总余额 + 预算环（环显示本月预算「剩余」，花钱往下消耗）。
          P4：卡壳退役 —— 向日葵舞台（橙花瓣环 + 放射短线）直压黄底；
          p3：白大斜卡 + 左侧青斜纹梯级 + 超大蓝斜体金额 + 分割线（点数字切换月/总视图）。 */}
      {p3 ? (
        <motion.section {...popIn(2)} className="mt-5">
          <div className="relative px-6 py-7" style={{ clipPath: 'polygon(34px 0, 100% 0, calc(100% - 34px) 100%, 0 100%)', background: 'rgba(255,255,255,0.96)', boxShadow: '0 18px 40px rgba(38,96,140,0.10)' }}>
            {/* 左侧青斜纹梯级（设计稿装饰） */}
            <div aria-hidden className="absolute bottom-6 left-7 top-6 flex w-[54px] flex-col justify-between">
              {Array.from({ length: 9 }).map((_, i) => (
                <span
                  key={i}
                  className="h-[9px]"
                  style={{
                    width: 46 - i * 1.6,
                    marginLeft: i * 2.2,
                    background: i % 2 ? `rgba(53,209,232,${0.85 - i * 0.05})` : `rgba(27,87,255,${0.8 - i * 0.05})`,
                    clipPath: 'polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)',
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setBalanceView(v => (v === 'month' ? 'total' : 'month'))}
              aria-label={balanceView === 'month' ? '切换到总余额' : '切换到月余额'}
              className="relative mx-auto block w-full pl-14 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
            >
              {balanceView === 'month' ? (
                <>
                  <div className="text-[16px] font-black" style={{ color: P3R.blue }}>{hasBudget ? '月余额' : '本月已花'}</div>
                  <div className="mt-1 text-[56px] font-black italic leading-none tabular-nums" style={{ color: P3R.blue }}>
                    {hasBudget ? fmtSigned(monthBalance, $) : `${$}${fmtMoney(monthExpense)}`}
                  </div>
                  <div aria-hidden className="mx-auto mt-3.5 flex h-[2px] w-[210px] items-center" style={{ background: 'rgba(27,87,255,0.45)' }}>
                    <span className="h-[4px] w-8" style={{ background: P3R.blue }} />
                  </div>
                  <div className="mt-2.5 text-[14px] font-bold" style={{ color: P3R.grey }}>
                    {hasBudget ? `预算 ${$}${fmtMoney(lim)}` : '未设预算'}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[16px] font-black" style={{ color: P3R.blue }}>总余额</div>
                  <div className="mt-1 text-[56px] font-black italic leading-none tabular-nums" style={{ color: P3R.blue }}>{fmtSigned(total, $)}</div>
                  <div aria-hidden className="mx-auto mt-3.5 flex h-[2px] w-[210px] items-center" style={{ background: 'rgba(27,87,255,0.45)' }}>
                    <span className="h-[4px] w-8" style={{ background: P3R.blue }} />
                  </div>
                  <div className="mt-2.5 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] font-bold" style={{ color: P3R.inkSoft }}>
                    <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2.5" style={{ background: '#34d399', clipPath: slantClip(2) }} />收入剩余 <b className="tabular-nums">{$}{fmtMoney(fundIncome)}</b></span>
                    <span className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2.5" style={{ background: '#818cf8', clipPath: slantClip(2) }} />结转 <b className="tabular-nums">{$}{fmtMoney(fundCarried)}</b></span>
                    {savings > 0 && <span>🐷 攒下 {$}{fmtMoney(savings)}</span>}
                  </div>
                </>
              )}
            </button>
            {/* 卡右下青三角 */}
            <span aria-hidden className="absolute bottom-0 right-10 h-5 w-9" style={{ background: 'rgba(53,209,232,0.85)', clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
          </div>

          {cycle.payCycle && (
            <div className="mt-1.5 text-center text-[11px] font-bold" style={{ color: P3R.grey }}>本周期 {cycle.label}</div>
          )}

          {/* 预算消耗进度条（p3 补：斜切横条，已花蓝青渐变 / 超支洋红；width 弹入动画） */}
          {balanceView === 'month' && hasBudget && (
            <div className="mt-3.5 px-6">
              <div className="relative h-[11px] w-full overflow-hidden" style={{ background: 'rgba(207,234,246,0.8)', clipPath: slantClip(3) }}>
                <motion.div
                  className="absolute inset-y-0 left-0"
                  style={{ background: over ? P3R.magenta : `linear-gradient(90deg, ${P3R.blue}, ${P3R.cyan})`, clipPath: slantClip(3) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(3, Math.min(100, lim > 0 ? (monthExpense / lim) * 100 : 0))}%` }}
                  transition={{ type: 'spring', stiffness: 110, damping: 20, delay: 0.1 }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] font-black" style={{ color: P3R.grey }}>
                <span>已花 {$}{fmtMoney(monthExpense)}</span>
                <span>{lim > 0 ? Math.round((monthExpense / lim) * 100) : 0}%</span>
              </div>
            </div>
          )}

          {/* 预算态提示行（超支洋红 / 今日还可花青） */}
          {balanceView === 'month' && hasBudget && (
            over ? (
              <div className="mt-2.5 flex flex-col items-center gap-1">
                <div className="inline-flex items-baseline gap-1.5 px-4 py-1" style={{ clipPath: slantClip(8), background: 'rgba(240,65,127,0.1)' }}>
                  <span className="text-[12px] font-bold" style={{ color: P3R.magenta }}>本月已超</span>
                  <span className="text-lg font-black tabular-nums" style={{ color: P3R.magenta }}>{$}{fmtMoney(-budgetLeft)}</span>
                </div>
                <span className="text-[12px] font-semibold" style={{ color: P3R.grey }}>预算 {$}{fmtMoney(lim)} · 已花 {$}{fmtMoney(monthExpense)}</span>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-col items-center gap-1">
                {todayLeft > 0 && (
                  <div className="inline-flex items-baseline gap-1.5 px-4 py-1" style={{ clipPath: slantClip(8), background: 'rgba(53,209,232,0.16)' }}>
                    <span className="text-[12px] font-bold" style={{ color: P3R.blueDeep }}>今日还可花</span>
                    <span className="text-lg font-black tabular-nums" style={{ color: P3R.blueDeep }}>{$}{fmtMoney(todayLeft)}</span>
                  </div>
                )}
                <span className="text-[12px] font-semibold" style={{ color: P3R.grey }}>本月预算剩 <b className="tabular-nums">{$}{fmtMoney(budgetLeft)}</b> / {$}{fmtMoney(lim)}</span>
              </div>
            )
          )}

          {/* 设置预算 / 对账（白斜块钮） */}
          <div className="mt-3.5 flex justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setBudgetMode('edit')}
              className="px-5 py-2 text-[14px] font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
              style={{ clipPath: slantClip(9), background: 'rgba(255,255,255,0.92)', color: P3R.ink, boxShadow: '0 6px 14px rgba(38,96,140,0.08)' }}
            >
              {hasBudget ? '编辑预算' : '设置预算'}
            </button>
            <button
              type="button"
              onClick={() => setAdjustOpen(true)}
              className="px-5 py-2 text-[14px] font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
              style={{ clipPath: slantClip(9), background: 'rgba(255,255,255,0.92)', color: P3R.ink, boxShadow: '0 6px 14px rgba(38,96,140,0.08)' }}
            >
              对账
            </button>
          </div>
        </motion.section>
      ) : (
      <motion.section
        {...popIn(2)}
        className={
          isP4
            ? 'relative mt-4 p-5'
            : 'mt-4 bg-gradient-to-b from-white to-gray-50/60 dark:from-gray-800 dark:to-gray-800/60 rounded-2xl shadow-lg ring-1 ring-gray-100/80 dark:ring-gray-700/40 p-5'
        }
      >
        {/* P4 舞台装饰与进度环必须**同心**：以前装饰是 `top-[118px]` 硬写死，而 hero 环的
            真圆心是 p-5(20) + 224/2 = 132px，整整偏 14px（用户上报"进度环和底部装饰圆圈
            错位"）。这里改成把环包进一个 relative 盒子、装饰用 absolute inset-0 居中，
            圆心由布局保证，环尺寸怎么改都不会再错开。
            花瓣按用户口径退役，换成两圈同心圆装饰（外圈粗、再外一圈细）。 */}
        <div className="relative mx-auto w-56">
          {/* zIndex -1：装饰环比 224 的环盒大一圈，不沉到负层就会盖住下方
              「本月还没设预算」那行字（绝对定位元素默认画在无定位内容之上） */}
          {isP4 && (
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: -1 }}>
              {/* shrink-0 必带：外层是 flex 居中盒且只有 224px 宽，不锁的话 300px 的
                  svg 会被 flex 压到 224，两圈装饰跟着缩进去贴上进度环 */}
              <svg width="300" height="300" viewBox="-150 -150 300 300" className="shrink-0">
                <circle r="92" fill="#fff9dd" />
                {/* 两圈同心装饰：橙粗环贴着进度环外缘，再外一圈奶油细环——
                    浅橙描边在黄底上几乎看不见，所以外圈用奶油而不是淡橙 */}
                <circle r="118" fill="none" stroke="var(--p4-orange, #f9a11b)" strokeWidth="12" />
                <circle r="140" fill="none" stroke="#fff6d0" strokeWidth="7" />
              </svg>
            </div>
          )}
          {balanceView === 'month' ? (
            <Donut variant="hero" segments={[{ value: Math.max(0, Math.min(1, remainingRatio)), color: ringColor }]} total={1}>
              <button onClick={() => setBalanceView('total')} className="flex flex-col items-center focus:outline-none active:scale-95 transition-transform" aria-label="切换到总余额">
                <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">{hasBudget ? '月余额' : '本月已花'} <span className="text-[10px] opacity-70">⇄ 总余额</span></span>
                <span className="text-3xl font-black text-gray-900 dark:text-white tabular-nums mt-0.5">{hasBudget ? fmtSigned(monthBalance, $) : `${$}${fmtMoney(monthExpense)}`}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hasBudget ? `预算 ${$}${fmtMoney(lim)}` : '未设预算'}</span>
              </button>
            </Donut>
          ) : (
            <Donut variant="hero" segments={[{ value: fundIncome, color: '#34d399' }, { value: fundCarried, color: '#818cf8' }]} total={fundBase}>
              <button onClick={() => setBalanceView('month')} className="flex flex-col items-center focus:outline-none active:scale-95 transition-transform" aria-label="切换到月余额">
                <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">总余额 <span className="text-[10px] opacity-70">⇄ 月余额</span></span>
                <span className="text-3xl font-black text-gray-900 dark:text-white tabular-nums mt-0.5">{fmtSigned(total, $)}</span>
                {savings > 0 && <span className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 mt-0.5">🐷 攒下 {$}{fmtMoney(savings)}</span>}
              </button>
            </Donut>
          )}
        </div>

        {cycle.payCycle && (
          <div className="text-center text-[11px] text-gray-400 dark:text-gray-500 -mt-1 mb-1.5">本周期 {cycle.label}</div>
        )}

        {balanceView === 'month' ? (
          hasBudget ? (
            over ? (
              <div className="-mt-1 flex flex-col items-center gap-1.5">
                <div className="inline-flex items-baseline gap-1.5 px-3.5 py-1 rounded-full bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/40">
                  <span className="text-xs text-rose-500/80">本月已超</span>
                  <span className="text-lg font-black tabular-nums text-rose-500">{$}{fmtMoney(-budgetLeft)}</span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">预算 {$}{fmtMoney(lim)} · 已花 {$}{fmtMoney(monthExpense)}</span>
              </div>
            ) : (
              <div className="-mt-1 flex flex-col items-center gap-1.5">
                {todayLeft > 0 && (
                  <div className="inline-flex items-baseline gap-1.5 px-3.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40">
                    <span className="text-xs text-emerald-600/80 dark:text-emerald-300/80">今日还可花</span>
                    <span className="text-lg font-black tabular-nums text-emerald-600 dark:text-emerald-300">{$}{fmtMoney(todayLeft)}</span>
                  </div>
                )}
                <span className="text-xs text-gray-400 dark:text-gray-500">本月预算剩 <b className="tabular-nums text-gray-500 dark:text-gray-400">{$}{fmtMoney(budgetLeft)}</b> / {$}{fmtMoney(lim)}</span>
              </div>
            )
          ) : (
            <div className="text-center text-xs text-gray-400 -mt-1">本月还没设预算</div>
          )
        ) : (
          <div className="flex justify-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 -mt-1">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} />收入剩余 <b className="tabular-nums">{$}{fmtMoney(fundIncome)}</b></span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#818cf8' }} />结转 <b className="tabular-nums">{$}{fmtMoney(fundCarried)}</b></span>
          </div>
        )}

        <div className="relative flex gap-2.5 justify-center mt-4">
          {isP4 ? (
            /* p4：设置预算=蓝斜板白花 / 对账=橙斜板白花 */
            <>
              <button
                onClick={() => setBudgetMode('edit')}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-black text-white transition-transform active:scale-95"
                style={{ background: 'var(--ui-accent)', borderRadius: 14, transform: 'skewX(-8deg)', boxShadow: '0 3px 0 rgba(19,19,19,0.22)' }}
              >
                <span className="flex items-center gap-1.5" style={{ transform: 'skewX(8deg)' }}>
                  <P4Flower size={14} color="#ffffff" />
                  {hasBudget ? '编辑预算' : '设置预算'}
                </span>
              </button>
              <button
                onClick={() => setAdjustOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-black text-white transition-transform active:scale-95"
                style={{ background: '#f06a13', borderRadius: 14, transform: 'skewX(-8deg)', boxShadow: '0 3px 0 rgba(19,19,19,0.22)' }}
              >
                <span className="flex items-center gap-1.5" style={{ transform: 'skewX(8deg)' }}>
                  <P4Flower size={14} color="#ffffff" />
                  对账
                </span>
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </motion.section>
      )}

      {/* 录入条（p3：白斜输入条 + 蓝斜块「记一笔」+洋红角 + 白斜块「手动」，GUI 主体地位照旧） */}
      {p3 ? (
        <motion.section {...riseIn(3)} className="mt-5 flex items-stretch gap-0">
          <div className="min-w-0 flex-1" style={{ clipPath: slantClip(12), background: '#fff', boxShadow: '0 8px 18px rgba(38,96,140,0.07)' }}>
            <input
              value={nlText}
              onChange={e => setNlText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNL(); }}
              placeholder="28 咖啡 / 工资 8000（可多笔）"
              className="h-full w-full bg-transparent px-5 py-3.5 text-[14px] font-semibold focus:outline-none"
              style={{ color: P3R.ink }}
            />
          </div>
          <button
            onClick={handleNL}
            disabled={nlBusy || !nlText.trim()}
            className="relative -ml-2 shrink-0 px-5 py-3.5 text-[15px] font-black text-white transition-transform active:scale-[0.96] disabled:opacity-40"
            style={{ clipPath: slantClip(12), background: P3R.blue }}
          >
            {nlBusy ? '…' : '记一笔'}
            <span aria-hidden className="absolute bottom-0 right-3 h-[6px] w-[14px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          </button>
          <button
            onClick={() => startDraft(emptyDraft())}
            aria-label="手动记一笔"
            className="-ml-2 shrink-0 whitespace-nowrap px-4 py-3.5 text-[15px] font-black transition active:scale-[0.96]"
            style={{ clipPath: slantClip(12), background: '#fff', color: P3R.ink, boxShadow: '0 8px 18px rgba(38,96,140,0.07)' }}
          >
            手动
          </button>
        </motion.section>
      ) : (
      <motion.section {...riseIn(3)} className="mt-4 flex gap-2">
        <input
          value={nlText}
          onChange={e => setNlText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleNL(); }}
          placeholder="28 咖啡 / 工资 8000（可多笔）"
          className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary transition-colors"
        />
        <button
          onClick={handleNL}
          disabled={nlBusy || !nlText.trim()}
          className={
            isP4
              ? 'relative flex h-[72px] w-[72px] -my-2 shrink-0 items-center justify-center text-sm font-black text-white disabled:opacity-40 active:scale-[0.96] transition-transform'
              : 'px-4 py-3 rounded-xl text-sm font-bold bg-primary text-white disabled:opacity-40 active:scale-[0.96] transition-transform'
          }
        >
          {isP4 && (
            /* p4：蓝色五瓣花形按钮（p4-ledger-reference-v2「记一笔」） */
            <P4Flower size={76} color="var(--ui-accent)" className="absolute inset-0 -left-0.5 -top-0.5" style={{ filter: 'drop-shadow(0 2px 0 rgba(19,19,19,0.25))' }} />
          )}
          <span className="relative">{nlBusy ? '…' : '记一笔'}</span>
        </button>
        <button
          onClick={() => startDraft(emptyDraft())}
          aria-label="手动记一笔"
          className="px-3 py-3 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-[0.96] transition whitespace-nowrap"
        >
          手动
        </button>
      </motion.section>
      )}

      {/* 流水 / 统计 切换 */}
      <motion.div {...riseIn(4)} className="mt-4">
        <SegmentTabs
          items={[{ key: 'list', label: '流水' }, { key: 'stats', label: '统计' }]}
          value={view}
          onChange={setView}
          layoutId="ledger-view"
        />
      </motion.div>

      {/* 流水 */}
      {view === 'list' && (
      <motion.section {...riseIn(5)} className="mt-5 space-y-4">
        {/* 月份导航 + 当月收支小结（p3：蓝实心三角 + 黑粗月份 + 青下划线，p3-ledger 设计稿） */}
        {p3 ? (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setListMonth(shiftMonth(listMonth, -1))}
              className="flex h-10 w-10 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
              aria-label="上个月"
            >
              <span aria-hidden className="h-0 w-0 border-y-[9px] border-y-transparent border-r-[13px]" style={{ borderRightColor: P3R.blue }} />
            </button>
            <div className="text-center">
              <div className="inline-block text-[19px] font-black tabular-nums" style={{ color: P3R.ink }}>
                {monthLabel(listMonth)}
                <span aria-hidden className="mx-auto mt-0.5 block h-[3px] w-full" style={{ background: 'rgba(53,209,232,0.7)', transform: 'skewX(-24deg)' }} />
              </div>
              <div className="mt-1 text-[12px] font-bold" style={{ color: P3R.grey }}>
                支出 <b className="tabular-nums" style={{ color: P3R.blue }}>{$}{fmtMoney(monthSum.exp)}</b>
                {monthSum.inc > 0 && <> · 收入 <b className="tabular-nums text-emerald-500">{$}{fmtMoney(monthSum.inc)}</b></>}
              </div>
            </div>
            <button
              onClick={() => setListMonth(shiftMonth(listMonth, 1))}
              disabled={listMonth >= curMonth}
              className="flex h-10 w-10 items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
              aria-label="下个月"
            >
              <span aria-hidden className="h-0 w-0 border-y-[9px] border-y-transparent border-l-[13px]" style={{ borderLeftColor: P3R.blue }} />
            </button>
          </div>
        ) : (
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
        )}

        {monthGrouped.length === 0 && (
          p3 ? (
            <div className="flex flex-col items-center gap-4 py-10">
              <span aria-hidden className="flex flex-col items-start gap-1.5">
                <span className="h-0 w-0 border-y-[13px] border-y-transparent border-l-[20px]" style={{ borderLeftColor: 'rgba(53,209,232,0.75)' }} />
                <span className="ml-5 h-0 w-0 border-y-[10px] border-y-transparent border-l-[16px]" style={{ borderLeftColor: 'rgba(127,216,238,0.75)' }} />
                <span className="ml-1 h-0 w-0 border-y-[7px] border-y-transparent border-l-[11px]" style={{ borderLeftColor: 'rgba(53,209,232,0.45)' }} />
              </span>
              <div className="text-[15px] font-black" style={{ color: P3R.grey }}>
                {ledgerEntries.length === 0 ? '暂无可追踪的信号' : '这个月还没有记录。'}
              </div>
            </div>
          ) : (
          <div className="text-center text-sm text-gray-400 py-10">
            {ledgerEntries.length === 0 ? '还没有记录，记一笔开始吧。' : '这个月还没有记录。'}
          </div>
          )
        )}
        {monthGrouped.map(([date, entries], gi) => (
          <motion.div
            key={date}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 + gi * 0.05, type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="flex items-baseline gap-1.5 mb-1 px-1">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{ledgerDateLabel(date)}</span>
              <span className="text-xs text-gray-300 dark:text-gray-600">{weekdayCN(date)}</span>
            </div>
            <div
              className={p3 ? 'divide-y divide-[#eef5fa]' : 'bg-white dark:bg-gray-800 rounded-xl shadow-sm divide-y divide-gray-50 dark:divide-gray-700/40'}
              style={p3 ? { clipPath: slantClip(12), background: '#fff', boxShadow: '0 10px 24px rgba(38,96,140,0.08)' } : undefined}
            >
              {entries.map(e => <LedgerRow key={e.id} entry={e} $={$} onClick={() => setDeleteTarget(e)} />)}
            </div>
          </motion.div>
        ))}
      </motion.section>
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
        savingsEditsLeft={Math.max(0, 2 - (budget?.savingsGoalEdits ?? 0))}
        days={daysInMonth}
        resetDay={resetDay}
        onResetDay={d => updateSettings({ ledgerResetDay: d })}
        onSave={async (monthly, savings) => {
          const p = cycle.key;
          const cur = getBudget(p);
          const patch: { monthlyLimit: number; savingsGoal?: number; savingsGoalEdits?: number } = { monthlyLimit: monthly };
          // 省钱挑战目标每月限改 2 次：仅当值变化且未超限才写入并计数
          if (savings !== cur?.savingsGoal && (cur?.savingsGoalEdits ?? 0) < 2) {
            patch.savingsGoal = savings;
            patch.savingsGoalEdits = (cur?.savingsGoalEdits ?? 0) + 1;
          }
          await setBudget(p, patch);
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

      {/* P3R：LEDGER 巨幽灵字（页底，设计稿） */}
      {p3 && (
        <div aria-hidden className="relative h-16">
          <GhostWords words={['LEDGER']} className="left-[6px] top-[-6px] text-[74px]" style={{ color: 'rgba(53,209,232,0.30)' }} />
        </div>
      )}
    </motion.div>
    </P5RPage>
    </P3RPage>
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

function BudgetSheet({ isOpen, onClose, $, current, savingsCurrent, savingsEditsLeft, days, resetDay, onResetDay, onSave, newCycle }: {
  isOpen: boolean; onClose: () => void; $: string;
  current?: number; savingsCurrent?: number; savingsEditsLeft: number; days: number;
  resetDay: number; onResetDay: (d: number) => void;
  onSave: (monthly: number, savings: number | undefined) => void | Promise<void>;
  newCycle?: boolean;
}) {
  const [monthly, setMonthly] = useState('');
  const [savings, setSavings] = useState('');
  const [challengeOpen, setChallengeOpen] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setMonthly(current != null ? String(current) : '');
      setSavings(savingsCurrent != null ? String(savingsCurrent) : '');
      setChallengeOpen(savingsCurrent != null);   // 默认收起，已设过才展开
    }
  }, [isOpen, current, savingsCurrent]);
  const savingsLocked = savingsEditsLeft <= 0;
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
        {/* 省钱挑战（默认收起） */}
        {challengeOpen ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <div className="text-xs text-gray-500 dark:text-gray-400">🏆 省钱挑战 · 这个月想省下</div>
              <span className="text-[10px] text-gray-400">{savingsLocked ? '本月修改次数已用完' : `还可改 ${savingsEditsLeft} 次`}</span>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${savingsLocked ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-70' : 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800/40'}`}>
              <span className="text-lg font-black text-emerald-500/70">{$}</span>
              <input
                type="number" inputMode="decimal" value={savings} placeholder="500" disabled={savingsLocked}
                onChange={e => setSavings(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-xl font-black text-emerald-600 dark:text-emerald-300 tabular-nums outline-none disabled:cursor-not-allowed"
              />
            </div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500">月底「预算 − 实际花费」达到这个数，次月结算 +10 SP 🎉</div>
          </div>
        ) : (
          <button
            type="button" onClick={() => setChallengeOpen(true)}
            className="text-xs font-semibold text-gray-400 hover:text-emerald-500 transition-colors"
          >
            ＋ 立个省钱挑战（可选）
          </button>
        )}
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
