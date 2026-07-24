/**
 * 批4 · 日常闭环工具（§6.1/6.2/6.4）：弹药 / 备战抽取 / 勤勉的光辉
 *
 * 现实记录 = 战斗资源：这里只做纯计算，store/UI 负责读写。
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */
import type { AttributeId } from '../types';
import { AMMO_ADD_PER_RECORD, AMMO_ADD_CAP, DILIGENCE_STREAK_DAYS } from './numbers';

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

// ── 6.1 弹药：今日各属性记录次数 → 该属性技能伤害加算 ────────
export interface AmmoSource {
  date: Date | string;
  pointsAwarded: Record<AttributeId, number>;
}

/** 今日记录 → 每属性弹药加算（+4%/条，封顶 +12%；一条记录给多个属性加点则各算一次） */
export function ammoFromActivities(activities: AmmoSource[], todayKey: string): Partial<Record<AttributeId, number>> {
  const counts: Partial<Record<AttributeId, number>> = {};
  for (const a of activities) {
    const d = a.date instanceof Date ? a.date : new Date(a.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (key !== todayKey) continue;
    for (const attr of ATTRS) {
      if ((a.pointsAwarded?.[attr] ?? 0) > 0) counts[attr] = (counts[attr] ?? 0) + 1;
    }
  }
  const out: Partial<Record<AttributeId, number>> = {};
  for (const attr of ATTRS) {
    const c = counts[attr] ?? 0;
    if (c > 0) out[attr] = Math.min(AMMO_ADD_CAP, c * AMMO_ADD_PER_RECORD);
  }
  return out;
}

// ── 6.2 备战抽取：进塔随机小 buff ────────────────────────────
export interface PrepBuff {
  id: string;
  label: string;
  /** 本次登塔伤害加算（走 towerSession.buffs） */
  addPct?: number;
  /** 立即发放的 SP */
  sp?: number;
}

/** 备战池（数值不给大——拍板口径） */
export const PREP_POOL: PrepBuff[] = [
  { id: 'prep-focus',    label: '磨利的专注 +6%',        addPct: 0.06 },
  { id: 'prep-moon',     label: '满月的祝福 +8%',        addPct: 0.08 },
  { id: 'prep-breath',   label: '深呼吸 +4% & +5 SP',    addPct: 0.04, sp: 5 },
  { id: 'prep-nightwind',label: '夜风入怀 +12 SP',       sp: 12 },
  { id: 'prep-tea',      label: '温热的茶 +8 SP',        sp: 8 },
  { id: 'prep-resonate', label: '弦外之音 +5%',          addPct: 0.05 },
  { id: 'prep-tide',     label: '潮汐同调 +3% & +6 SP',  addPct: 0.03, sp: 6 },
  { id: 'prep-ember',    label: '不灭余烬 +7%',          addPct: 0.07 },
  { id: 'prep-lantern',  label: '提灯的指引 +15 SP',     sp: 15 },
  { id: 'prep-quiet',    label: '静水深流 +4%',          addPct: 0.04 },
];

/** 抽取 n 个互不重复的备战 buff（今日完成待办 ≥3 → 抽 2 选 1） */
export function rollPrepDraw(n: number, rng: () => number = Math.random): PrepBuff[] {
  const pool = [...PREP_POOL];
  const out: PrepBuff[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

// ── 6.4 勤勉的光辉：连续记录天数判定 ─────────────────────────
/** 以 today 为锚的当前连续记录天数（今天没记录则从昨天起算，宽松口径） */
export function currentRecordStreak(dates: Array<Date | string>, todayKey: string): number {
  const keys = new Set(dates.map(d => {
    const dd = d instanceof Date ? d : new Date(d);
    return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
  }));
  const anchor = new Date(todayKey + 'T00:00:00');
  let streak = 0;
  let cursor = new Date(anchor);
  // 今天没有记录 → 从昨天开始数（今晚登塔前还没来得及记录的宽松口径）
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (!keys.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (keys.has(fmt(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 是否应发放一枚光辉：streak 达标 且 距上次发放 ≥ 3 天 */
export function shouldGrantDiligence(streak: number, lastGrantKey: string | undefined, todayKey: string): boolean {
  if (streak < DILIGENCE_STREAK_DAYS) return false;
  if (!lastGrantKey) return true;
  const gap = Math.floor(
    (new Date(todayKey + 'T00:00:00').getTime() - new Date(lastGrantKey + 'T00:00:00').getTime()) / 86400000,
  );
  return gap >= DILIGENCE_STREAK_DAYS;
}
