/**
 * ledgerFormat.ts — F5 心相记账的共享展示常量与金额格式化。
 *
 * 抽出供 pages/Ledger 与 components/ledger/* 复用（页面 import 组件、组件又需页面常量
 * 会形成循环依赖，故落在独立模块）。
 */
import type { LedgerExpenseType, LedgerIncomeType } from '@/types';

export const CATEGORY_META: Record<LedgerExpenseType, { icon: string; label: string; dot: string; bar: string; hex: string }> = {
  food:      { icon: '🍜', label: '餐饮', dot: 'bg-amber-400',  bar: 'bg-amber-400',  hex: '#fbbf24' },
  transport: { icon: '🚇', label: '交通', dot: 'bg-sky-400',    bar: 'bg-sky-400',    hex: '#38bdf8' },
  shopping:  { icon: '🛍️', label: '购物', dot: 'bg-pink-400',   bar: 'bg-pink-400',   hex: '#f472b6' },
  fun:       { icon: '🎮', label: '娱乐', dot: 'bg-violet-400', bar: 'bg-violet-400', hex: '#a78bfa' },
  home:      { icon: '🏠', label: '居住', dot: 'bg-teal-400',   bar: 'bg-teal-400',   hex: '#2dd4bf' },
  study:     { icon: '📚', label: '提升', dot: 'bg-indigo-400', bar: 'bg-indigo-400', hex: '#818cf8' },
  other:     { icon: '📦', label: '其它', dot: 'bg-slate-400',  bar: 'bg-slate-400',  hex: '#94a3b8' },
};
/** 安全取类目元数据（老数据 / 未知值兜底为「其它」）。 */
export const catMeta = (t?: LedgerExpenseType) => CATEGORY_META[t as LedgerExpenseType] ?? CATEGORY_META.other;
/** 成长类目：触发投资属性加点奖励。 */
export const GROWTH_CATEGORIES: LedgerExpenseType[] = ['study'];
export const isGrowthCategory = (t?: LedgerExpenseType) => !!t && GROWTH_CATEGORIES.includes(t);
export const INCOME_META: Record<LedgerIncomeType, { label: string }> = {
  labor: { label: '劳动所得' },
  other: { label: '其它收入' },
};
export const CATEGORY_KEYS: LedgerExpenseType[] = ['food', 'transport', 'shopping', 'fun', 'home', 'study', 'other'];
export const INCOME_TYPES: LedgerIncomeType[] = ['labor', 'other'];

// ── 录入选项（可在确认卡手动增删、持久化到 settings；undefined 时回退以下默认） ──
export const DEFAULT_CHANNELS = ['支付宝', '微信', '现金', '银行卡', '信用卡'];
export const DEFAULT_INCOME_SOURCES = ['工资', '兼职', '投资理财', '红包', '报销', '退款'];
/** 收入来源 → 是否算「劳动所得」（记账 +10SP）；匹配 labor 关键词即算。 */
const LABOR_SOURCE_RE = /工资|薪|兼职|劳务|奖金|提成|外快|加班/;
export const incomeTypeFromSource = (src?: string): LedgerIncomeType =>
  src && LABOR_SOURCE_RE.test(src) ? 'labor' : 'other';

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

const WEEKDAYS_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/** 'YYYY-MM-DD' → 周几。 */
export function weekdayCN(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return WEEKDAYS_CN[new Date(y, m - 1, d).getDay()] ?? '';
}

/** 'YYYY-MM' → 'YYYY年M月'。 */
export function monthLabel(period: string): string {
  const [y, m] = period.split('-');
  return `${y}年${Number(m)}月`;
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
