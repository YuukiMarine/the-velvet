/**
 * ledgerFormat.ts — F5 心相记账的共享展示常量与金额格式化。
 *
 * 抽出供 pages/Ledger 与 components/ledger/* 复用（页面 import 组件、组件又需页面常量
 * 会形成循环依赖，故落在独立模块）。
 */
import type { LedgerExpenseType, LedgerIncomeType } from '@/types';

export const EXPENSE_META: Record<LedgerExpenseType, { label: string; dot: string; chip: string; bar: string }> = {
  necessary: { label: '必要', dot: 'bg-slate-400', bar: 'bg-slate-400', chip: 'bg-slate-100 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600' },
  investment: { label: '投资', dot: 'bg-emerald-400', bar: 'bg-emerald-400', chip: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' },
  desire: { label: '欲望', dot: 'bg-violet-400', bar: 'bg-violet-400', chip: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 border-violet-300 dark:border-violet-700' },
  impulse: { label: '冲动', dot: 'bg-rose-400', bar: 'bg-rose-400', chip: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 border-rose-300 dark:border-rose-700' },
};
export const INCOME_META: Record<LedgerIncomeType, { label: string }> = {
  labor: { label: '劳动所得' },
  other: { label: '其它收入' },
};
export const EXPENSE_TYPES: LedgerExpenseType[] = ['necessary', 'investment', 'desire', 'impulse'];
export const INCOME_TYPES: LedgerIncomeType[] = ['labor', 'other'];

const CURRENCY_SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$', EUR: '€', JPY: '¥', GBP: '£', HKD: 'HK$', KRW: '₩' };
export const sym = (code?: string) => CURRENCY_SYMBOLS[code ?? 'CNY'] ?? code ?? '¥';

/** 绝对值 + 千分位；整数不带小数，否则两位。 */
export function fmtMoney(n: number): string {
  const v = Math.abs(n);
  return Number.isInteger(v)
    ? v.toLocaleString('en-US')
    : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 带符号格式：负值前缀 −（用于总余额/结余等可负的数）。 */
export function fmtSigned(n: number, $: string): string {
  return `${n < 0 ? '−' : ''}${$}${fmtMoney(n)}`;
}

/** 把 'YYYY-MM' 偏移 delta 个月。 */
export function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── 资产板块（F5③）：类目绑定 emoji 图标（替代图标库，零依赖、零存储） ──
export const ASSET_CATEGORIES: { key: string; icon: string; label: string }[] = [
  { key: 'digital', icon: '📱', label: '数码' },
  { key: 'computer', icon: '💻', label: '电脑' },
  { key: 'camera', icon: '📷', label: '影像' },
  { key: 'instrument', icon: '🎸', label: '乐器' },
  { key: 'audio', icon: '🎧', label: '音频' },
  { key: 'game', icon: '🎮', label: '游戏' },
  { key: 'transport', icon: '🚲', label: '出行' },
  { key: 'home', icon: '🪑', label: '家居' },
  { key: 'wearable', icon: '⌚', label: '穿戴' },
  { key: 'book', icon: '📚', label: '书籍' },
  { key: 'sport', icon: '🏋️', label: '运动' },
  { key: 'other', icon: '📦', label: '其它' },
];
export const assetIcon = (category: string) => ASSET_CATEGORIES.find(c => c.key === category)?.icon ?? '📦';

export const ASSET_STATUS: Record<'inuse' | 'idle' | 'soldout', { label: string; cls: string }> = {
  inuse: { label: '在用', cls: 'text-emerald-500' },
  idle: { label: '闲置', cls: 'text-amber-500' },
  soldout: { label: '已出', cls: 'text-gray-400' },
};
