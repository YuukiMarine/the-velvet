/**
 * 「查阅并合并」的合并引擎（v2.7.0.6 第 3 轮）——纯函数，不碰网络和数据库。
 *
 * 云端是整表 KV，本机是 Dexie：两边各拿一份行数组，按行键分成四类
 *   只本机有 / 只云端有 / 两边都有且一样 / 两边都有但不同（冲突）
 * 合并规则：
 *   · 只本机有 → 留（这台设备新写的）
 *   · 只云端有 → 默认留（多半是别的设备新写的）；用户确认是自己在这台删掉的，可以按表选「丢弃」
 *   · 冲突 → 行上没有修改时间，分不出谁新：按用户选的一边（默认本机）；几张表有更好的规则：
 *       成就 / 技能 = 解锁的一边赢；任务完成 = 同一天取次数大的；每日塔罗 = 同一天取最早抽的那张
 * 行键：绝大多数表是 id；任务完成按 (todoId, date)（两台设备各自完成同一天会生成两个 id，不能都留）；
 * 每日塔罗按 date；设置 / 客人档案 / 战场状态是单行表，整表当一行。
 */

export type MergeSide = 'local' | 'cloud';

export interface MergeOptions {
  /** 两边都有但不同的行，用哪一边 */
  conflictWins: MergeSide;
  /** 这些表里「只云端有」的行丢掉（用户确认是自己删的） */
  dropOnlyCloud: ReadonlySet<string>;
}

export interface TableMergeStats {
  key: string;
  local: number;
  cloud: number;
  onlyLocal: number;
  onlyCloud: number;
  same: number;
  conflict: number;
  /** 界面上给用户看的几条样本（标题） */
  samples: { onlyLocal: string[]; onlyCloud: string[]; conflict: string[] };
}

export interface TableMergeResult {
  rows: Record<string, unknown>[];
  stats: TableMergeStats;
}

type Row = Record<string, unknown>;

/** 单行表：整张表就是一行 */
const SINGLE_ROW_TABLES = new Set(['settings', 'users', 'battleStates']);
const SAMPLE_MAX = 8;

/** 不用 instanceof：IndexedDB 读出来的 Date 可能来自另一个 realm（iframe / 测试壳换过 Date），instanceof 会判错 */
const isDate = (v: unknown): v is Date => Object.prototype.toString.call(v) === '[object Date]';

/** 稳定序列化：键排序、Date 变 ISO，两边内容一样就得到同一串 */
export function stableStringify(v: unknown): string {
  return JSON.stringify(normalize(v));
}
function normalize(v: unknown): unknown {
  if (isDate(v)) return isNaN(v.getTime()) ? null : v.toISOString();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Row).sort()) {
      const val = (v as Row)[k];
      if (val === undefined) continue;
      out[k] = normalize(val);
    }
    return out;
  }
  return v;
}

/** 行键 */
export function rowKeyOf(table: string, row: Row): string {
  if (SINGLE_ROW_TABLES.has(table)) return '__single__';
  if (table === 'todoCompletions') return `${String(row.todoId ?? '')}|${String(row.date ?? '')}`;
  if (table === 'dailyDivinations' || table === 'dailyEvents') return String(row.date ?? row.id ?? '');
  return String(row.id ?? stableStringify(row));
}

const toTime = (v: unknown): number => {
  if (isDate(v)) return v.getTime();
  if (typeof v === 'string' || typeof v === 'number') { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
  return 0;
};

/** 冲突时的特殊规则；返回 null 表示按用户选的一边 */
function resolveSpecial(table: string, local: Row, cloud: Row): Row | null {
  if (table === 'achievements' || table === 'skills') {
    const lu = local.unlocked === true, cu = cloud.unlocked === true;
    if (lu && !cu) return local;
    if (cu && !lu) return cloud;
    if (lu && cu) {
      // 都解锁了：解锁时间早的那份（unlockedDate 是 Date 或缺省）
      const lt = toTime(local.unlockedDate), ct = toTime(cloud.unlockedDate);
      return lt && ct ? (lt <= ct ? local : cloud) : (lt ? local : ct ? cloud : null);
    }
    return null;
  }
  if (table === 'todoCompletions') {
    const lc = Number(local.count ?? 0), cc = Number(cloud.count ?? 0);
    return lc >= cc ? local : cloud;
  }
  if (table === 'dailyDivinations') {
    const lt = toTime(local.createdAt), ct = toTime(cloud.createdAt);
    return lt && ct ? (lt <= ct ? local : cloud) : null;
  }
  return null;
}

/**
 * 战场状态冲突时按用户选的一边，但两样东西两边都要（第 8 轮）：
 *   · 借面具：同一周取用得多的那边（借着的面具取新借的），不同周取新的那周——不然两台设备各用一场，合并后又能多用；
 *   · 领过奖励的作战 id：取并集——不然另一台设备会再领一次。
 */
type BorrowRow = { weekKey?: string; battles?: number; mask?: { at?: string } };
function mergeBattleExtras(pick: Row, other: Row): Row {
  const a = pick.borrow as BorrowRow | undefined;
  const b = other.borrow as BorrowRow | undefined;
  let borrow: BorrowRow | undefined = a ?? b;
  if (a && b) {
    if (a.weekKey !== b.weekKey) borrow = String(a.weekKey) > String(b.weekKey) ? a : b;
    else {
      const [hi, lo] = (a.battles ?? 0) >= (b.battles ?? 0) ? [a, b] : [b, a];
      const mask = hi.mask && lo.mask ? (String(hi.mask.at ?? '') >= String(lo.mask.at ?? '') ? hi.mask : lo.mask) : hi.mask ?? lo.mask;
      borrow = { ...hi, ...(mask ? { mask } : {}) };
    }
  }
  const rewards = [...new Set([...((pick.orgOpRewards as string[] | undefined) ?? []), ...((other.orgOpRewards as string[] | undefined) ?? [])])].slice(-200);
  return { ...pick, ...(borrow ? { borrow } : {}), ...(rewards.length ? { orgOpRewards: rewards } : {}) };
}

/** 样本标题：给界面看的一句 */
export function rowTitle(table: string, row: Row): string {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };
  const date = (v: unknown): string => {
    if (isDate(v)) return `${v.getFullYear()}/${v.getMonth() + 1}/${v.getDate()}`;
    if (typeof v === 'string') return v.length >= 10 ? v.slice(5, 10).replace('-', '/') : v;
    return '';
  };
  switch (table) {
    case 'activities': return `${date(row.date)} ${pick('description')}`.trim().slice(0, 40);
    case 'todoCompletions': return `${date(row.date)} ×${String(row.count ?? 1)}`;
    case 'dailyDivinations': case 'dailyEvents': return date(row.date) || String(row.id ?? '');
    case 'confidantEvents': return `${date(row.date)} ${pick('narrative', 'type')}`.trim().slice(0, 40);
    case 'settings': return '设置';
    case 'users': return pick('name') || '客人档案';
    case 'battleStates': return '战场状态';
    case 'attributes': return String(row.id ?? '');
    default: {
      const t = pick('title', 'name', 'label', 'description', 'narrative', 'content');
      return (t || String(row.id ?? '')).slice(0, 40);
    }
  }
}

/** 合并一张表 */
export function mergeTable(table: string, localRows: Row[], cloudRows: Row[], opts: MergeOptions): TableMergeResult {
  const localBy = new Map<string, Row>();
  const cloudBy = new Map<string, Row>();
  const order: string[] = [];
  for (const r of localRows) { const k = rowKeyOf(table, r); if (!localBy.has(k)) { localBy.set(k, r); order.push(k); } }
  for (const r of cloudRows) { const k = rowKeyOf(table, r); if (!cloudBy.has(k)) { cloudBy.set(k, r); if (!localBy.has(k)) order.push(k); } }
  const stats: TableMergeStats = {
    key: table, local: localRows.length, cloud: cloudRows.length,
    onlyLocal: 0, onlyCloud: 0, same: 0, conflict: 0,
    samples: { onlyLocal: [], onlyCloud: [], conflict: [] },
  };
  const rows: Row[] = [];
  const keep = !opts.dropOnlyCloud.has(table);
  for (const k of order) {
    const l = localBy.get(k), c = cloudBy.get(k);
    if (l && !c) {
      stats.onlyLocal++;
      if (stats.samples.onlyLocal.length < SAMPLE_MAX) stats.samples.onlyLocal.push(rowTitle(table, l));
      rows.push(l);
    } else if (c && !l) {
      stats.onlyCloud++;
      if (stats.samples.onlyCloud.length < SAMPLE_MAX) stats.samples.onlyCloud.push(rowTitle(table, c));
      if (keep) rows.push(c);
    } else if (l && c) {
      if (stableStringify(l) === stableStringify(c)) { stats.same++; rows.push(l); continue; }
      stats.conflict++;
      if (stats.samples.conflict.length < SAMPLE_MAX) stats.samples.conflict.push(rowTitle(table, l));
      const picked = resolveSpecial(table, l, c) ?? (opts.conflictWins === 'cloud' ? c : l);
      rows.push(table === 'battleStates' ? mergeBattleExtras(picked, picked === l ? c : l) : picked);
    }
  }
  return { rows, stats };
}

export const TABLE_LABELS: Record<string, string> = {
  users: '客人档案', attributes: '属性', activities: '记录', achievements: '成就', skills: '技能',
  dailyEvents: '每日事件', dailyDivinations: '每日塔罗', longReadings: '中长期占卜', fateGlimpses: '命运一瞥',
  settings: '设置', todos: '任务', todoCompletions: '任务完成', summaries: '总结', weeklyGoals: '本周目标',
  personas: '人格面具', shadows: '心魔', battleStates: '战场状态', confidants: '同伴', confidantEvents: '羁绊事件',
  counselArchives: '谏言归档', callingCards: '宣告卡', wishes: '愿望', strata: '区层',
  navigatorPresets: '助手人格', navigatorMemos: '助手记忆', stamps: '岁时印章', quests: '委托',
};
export const tableLabel = (key: string): string => TABLE_LABELS[key] ?? key;
