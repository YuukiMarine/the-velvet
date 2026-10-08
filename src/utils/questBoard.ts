import type {
  Activity, ActivityImage, AttributeId, BattleState, CoopPact, DailyDivination, LedgerEntry,
  PeriodSummary, Quest, QuestTemplateId, Todo, TodoCompletion,
} from '@/types';
import { weekKeyOf } from '@/battle/tower';
import { calcCurrentStreak, daysSinceFirstRecord, streakDates } from '@/utils/streak';
import { completedOn, isDueOn } from '@/utils/tarotContext';

/**
 * 委托板（2.7.0.6 第 6 轮 · PRD §11.3）——纯逻辑，不碰 store / Dexie。
 *
 *  - 解锁：第一条记录起 ≥ 5 天，且自己记的（非系统类目、非补记）记录 ≥ 10 条。
 *  - 刷新：按周（周一起算）生成三张，用「周键 + 用户 id」做种，两台设备同一周得到同一组。
 *  - 模板：13 个，零 AI，**绝不引用记录标题**；每个模板一个可出条件 + 一个进度函数。
 *  - 三档奖励 SP 5 / 10 / 15，一周尽量一档一张；属性委托每周最多一张。
 *  - 第 14 批：加模板「完成 3 张今日委托」；每周可「换一张」一次（swapQuestFor）。
 */

export const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
export const QUEST_UNLOCK = { minDays: 5, minRecords: 10 } as const;
export const QUEST_SLOTS = 3;

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKeyOf = (d: Date | string): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** 委托板只认用户自己记的：非系统类目、非补记 */
export const isUserRecord = (a: Activity): boolean => !a.category && !a.backfilled;

export function questBoardUnlocked(activities: Activity[], now: Date = new Date()): boolean {
  const own = activities.filter(isUserRecord);
  if (own.length < QUEST_UNLOCK.minRecords) return false;
  return daysSinceFirstRecord(streakDates(own), now) >= QUEST_UNLOCK.minDays;
}

// ── 周 ───────────────────────────────────────────────────────────────

export interface WeekRange {
  weekKey: string;
  /** 周一 00:00（本地） */
  start: Date;
  /** 下周一 00:00（本地，开区间） */
  end: Date;
  /** 七个日期键 */
  days: string[];
}

export function weekRangeOf(now: Date): WeekRange {
  const weekKey = weekKeyOf(now);
  const start = new Date(`${weekKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return dayKeyOf(d);
  });
  return { weekKey, start, end, days };
}

export const weekRangeOfKey = (weekKey: string): WeekRange => weekRangeOf(new Date(`${weekKey}T12:00:00`));

/** 上一周的周键 */
export function previousWeekKey(weekKey: string): string {
  const d = new Date(`${weekKey}T12:00:00`);
  d.setDate(d.getDate() - 7);
  return weekKeyOf(d);
}

const inRange = (d: Date | string, r: WeekRange) => {
  const t = new Date(d).getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
};

// ── 数据 ─────────────────────────────────────────────────────────────

export interface QuestData {
  activities: Activity[];
  todos: Todo[];
  completions: TodoCompletion[];
  divinations: DailyDivination[];
  images: ActivityImage[];
  summaries: PeriodSummary[];
  ledger: LedgerEntry[];
  pacts: CoopPact[];
  /** 云端账号 id（约定打卡按它认「我」） */
  myId?: string;
  battleState: BattleState | null;
  /** 配了 AI 才出「写总结」 */
  aiReady: boolean;
  now: Date;
}

// ── 模板 ─────────────────────────────────────────────────────────────

export interface QuestTemplate {
  id: QuestTemplateId;
  tier: 5 | 10 | 15;
  /** 固定目标；属性委托按数据算 */
  target?: number;
  hint: string;
}

export const QUEST_TEMPLATES: Record<QuestTemplateId, QuestTemplate> = {
  attr_least: { id: 'attr_least', tier: 10, hint: '补短：最近记得最少的一维' },
  attr_most: { id: 'attr_most', tier: 5, hint: '扬长：最近记得最多的一维' },
  bigdeal_steps: { id: 'bigdeal_steps', tier: 15, target: 2, hint: '任一进行中的 BIG DEAL，勾掉 2 个子步' },
  all_todos_3days: { id: 'all_todos_3days', tier: 15, target: 3, hint: '当天该做的都做完，才算一天' },
  record_7days: { id: 'record_7days', tier: 15, target: 7, hint: '每天至少一条自己记的' },
  streak_3days: { id: 'streak_3days', tier: 10, target: 3, hint: '从本周任意一天起，连着三天' },
  tarot_3days: { id: 'tarot_3days', tier: 5, target: 3, hint: '每天翻开今日塔罗' },
  pact_once: { id: 'pact_once', tier: 10, target: 1, hint: '在「一起进步」里打一次卡' },
  images_2: { id: 'images_2', tier: 10, target: 2, hint: '给本周的记录附上照片' },
  summary_1: { id: 'summary_1', tier: 10, target: 1, hint: '周报、月报任一份' },
  ledger_3: { id: 'ledger_3', tier: 5, target: 3, hint: '在心相记账里记 3 笔' },
  battle_once: { id: 'battle_once', tier: 10, target: 1, hint: '进逆影战场打一晚' },
  important_2: { id: 'important_2', tier: 5, target: 2, hint: '给本周的记录点两颗星' },
  life_3: { id: 'life_3', tier: 10, target: 3, hint: '在上面的今日委托里挑，加入并做完' },
};
export const QUEST_TEMPLATE_IDS = Object.keys(QUEST_TEMPLATES) as QuestTemplateId[];

export function questTitle(q: Quest, names: Record<AttributeId, string>): string {
  switch (q.templateId) {
    case 'attr_least':
    case 'attr_most': return `本周记 ${q.target} 次${names[q.params?.attribute ?? 'knowledge'] ?? ''}`;
    case 'bigdeal_steps': return '把一件 BIG DEAL 推进 2 步';
    case 'all_todos_3days': return '连续 3 天完成全部今日任务';
    case 'record_7days': return '本周 7 天都有记录';
    case 'streak_3days': return '连续记录 3 天';
    case 'tarot_3days': return '连续 3 天抽牌';
    case 'pact_once': return '和同伴完成一次约定';
    case 'images_2': return '给 2 条记录配图';
    case 'summary_1': return '写一段成长总结';
    case 'ledger_3': return '记 3 笔账';
    case 'battle_once': return '本周潜入一次战场';
    case 'important_2': return '标记 2 条重要记录';
    case 'life_3': return '完成 3 张今日委托';
  }
}

export const questHint = (q: Quest): string => QUEST_TEMPLATES[q.templateId].hint;

// ── 进度 ─────────────────────────────────────────────────────────────

/** 一组日期键里（只看到今天为止）最长的连续段 */
function longestRun(days: string[], has: (key: string) => boolean, todayKey: string): number {
  let best = 0, run = 0;
  for (const key of days) {
    if (key > todayKey) break;
    if (has(key)) { run += 1; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

export function questProgress(q: Quest, d: QuestData, r: WeekRange): number {
  const todayKey = dayKeyOf(d.now);
  const own = d.activities.filter((a) => isUserRecord(a) && inRange(a.date, r));
  switch (q.templateId) {
    case 'attr_least':
    case 'attr_most': {
      const attr = q.params?.attribute ?? 'knowledge';
      return own.filter((a) => (a.pointsAwarded?.[attr] ?? 0) > 0).length;
    }
    case 'bigdeal_steps': {
      let best = 0;
      for (const t of d.todos) {
        if (!t.isBigDeal || t.archivedAt) continue;
        const n = (t.steps ?? []).filter((s) => s.done && s.doneAt && inRange(s.doneAt, r)).length;
        best = Math.max(best, n);
      }
      return best;
    }
    case 'all_todos_3days':
      return longestRun(r.days, (key) => {
        const date = new Date(`${key}T12:00:00`);
        const due = d.todos.filter((t) => isDueOn(t, date));
        return due.length > 0 && due.every((t) => completedOn(t, key, d.completions));
      }, todayKey);
    case 'record_7days': {
      const keys = new Set(own.map((a) => dayKeyOf(a.date)));
      return r.days.filter((k) => keys.has(k)).length;
    }
    case 'streak_3days': {
      const keys = new Set(own.map((a) => dayKeyOf(a.date)));
      return longestRun(r.days, (k) => keys.has(k), todayKey);
    }
    case 'tarot_3days': {
      const keys = new Set(d.divinations.map((x) => x.date));
      return longestRun(r.days, (k) => keys.has(k), todayKey);
    }
    case 'pact_once': {
      if (!d.myId) return 0;
      let n = 0;
      for (const p of d.pacts) {
        const mine = p.fromId === d.myId ? p.doneFrom : p.toId === d.myId ? p.doneTo : [];
        n += (mine ?? []).filter((k) => r.days.includes(k)).length;
      }
      return n;
    }
    case 'images_2':
      return new Set(d.images.filter((im) => inRange(im.createdAt, r)).map((im) => im.activityId)).size;
    case 'summary_1':
      return d.summaries.filter((s) => inRange(s.createdAt, r)).length;
    case 'ledger_3':
      return d.ledger.filter((e) => r.days.includes(e.date)).length;
    case 'battle_once': {
      const bs = d.battleState;
      if (!bs) return 0;
      const entered = (bs.lastChallengeDate && r.days.includes(bs.lastChallengeDate))
        || (bs.defeatedShadowLog ?? []).some((x) => r.days.includes(x.defeatDate));
      return entered ? 1 : 0;
    }
    case 'important_2':
      return own.filter((a) => a.important).length;
    case 'life_3': {
      // 委托板「今日委托」加进来的待办（带 lifeQuest 标记）、本周做完的
      const doneThisWeek = (t: Todo) => (!!t.completedAt && inRange(t.completedAt, r))
        || d.completions.some((c) => c.todoId === t.id && c.count > 0 && r.days.includes(c.date));
      return d.todos.filter((t) => !!t.lifeQuest && doneThisWeek(t)).length;
    }
  }
}

export const questDone = (q: Quest, d: QuestData, r: WeekRange): boolean => questProgress(q, d, r) >= q.target;

// ── 生成 ─────────────────────────────────────────────────────────────

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
const mulberry32 = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 最近 4 个完整周里各维记了几次（自己记的） */
function recentAttrCounts(d: QuestData, r: WeekRange): { perWeek: Record<AttributeId, number[]>; total: Record<AttributeId, number> } {
  const perWeek = Object.fromEntries(ATTRS.map((k) => [k, [0, 0, 0, 0]])) as Record<AttributeId, number[]>;
  const total = Object.fromEntries(ATTRS.map((k) => [k, 0])) as Record<AttributeId, number>;
  const start = new Date(r.start); start.setDate(start.getDate() - 28);
  for (const a of d.activities) {
    if (!isUserRecord(a)) continue;
    const t = new Date(a.date).getTime();
    if (t < start.getTime() || t >= r.start.getTime()) continue;
    const w = Math.floor((t - start.getTime()) / (7 * 86400000));
    for (const k of ATTRS) {
      if ((a.pointsAwarded?.[k] ?? 0) > 0) { perWeek[k][Math.min(3, w)] += 1; total[k] += 1; }
    }
  }
  return { perWeek, total };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function eligible(id: QuestTemplateId, d: QuestData, r: WeekRange): boolean {
  const streak = calcCurrentStreak(streakDates(d.activities.filter(isUserRecord)), d.now);
  switch (id) {
    case 'attr_least':
    case 'attr_most': return true;
    case 'bigdeal_steps': return d.todos.some((t) => t.isBigDeal && !t.archivedAt && !t.completedAt && (t.steps ?? []).filter((s) => !s.done).length >= 2);
    case 'all_todos_3days': return d.todos.some((t) => t.isActive && !t.archivedAt && !t.isBigDeal && t.repeatDaily);
    case 'record_7days': return streak > 0;
    case 'streak_3days': return streak === 0;
    case 'tarot_3days': return true;
    case 'pact_once': return !!d.myId && d.pacts.some((p) => p.status === 'active' && (p.fromId === d.myId || p.toId === d.myId));
    case 'images_2': return true;
    case 'summary_1': return d.aiReady;
    case 'ledger_3': return d.ledger.length > 0;
    case 'battle_once': return !!d.battleState;
    case 'important_2': return true;
    // 今日委托不用解锁、天天有，谁都能做
    case 'life_3': return true;
    default: { void r; return false; }
  }
}

/**
 * 本周三张：三档各挑一张（15 / 10 / 5），某档没有可出的就从别的档补；属性委托每周最多一张。
 * 同一个 seed 得到同一组（周键 + 用户 id），两台设备各自生成也一致。
 */
export function generateWeekQuests(r: WeekRange, seed: string, d: QuestData, createdAt: Date = d.now): Quest[] {
  const rnd = mulberry32(fnv1a(`${r.weekKey}|${seed}`));
  const pool = QUEST_TEMPLATE_IDS.filter((id) => eligible(id, d, r));
  const byTier: Record<5 | 10 | 15, QuestTemplateId[]> = { 5: [], 10: [], 15: [] };
  for (const id of pool) byTier[QUEST_TEMPLATES[id].tier].push(id);
  const picked: QuestTemplateId[] = [];
  const isAttr = (id: QuestTemplateId) => id === 'attr_least' || id === 'attr_most';
  const take = (arr: QuestTemplateId[]): QuestTemplateId | null => {
    const ok = arr.filter((id) => !picked.includes(id) && !(isAttr(id) && picked.some(isAttr)));
    if (!ok.length) return null;
    const id = ok[Math.floor(rnd() * ok.length)];
    picked.push(id);
    return id;
  };
  for (const tier of [15, 10, 5] as const) take(byTier[tier]);
  while (picked.length < QUEST_SLOTS && take(pool) !== null) { /* 补满三张 */ }

  return picked.slice(0, QUEST_SLOTS).map((templateId, slot) => buildQuest(templateId, slot, r, d, createdAt));
}

/** 模板 → 一张委托（属性委托按最近四周算目标次数） */
function buildQuest(templateId: QuestTemplateId, slot: number, r: WeekRange, d: QuestData, createdAt: Date): Quest {
  const tpl = QUEST_TEMPLATES[templateId];
  let attr: AttributeId | undefined;
  let target = tpl.target ?? 1;
  if (templateId === 'attr_least' || templateId === 'attr_most') {
    const { perWeek, total } = recentAttrCounts(d, r);
    attr = templateId === 'attr_least'
      ? [...ATTRS].sort((a, b) => total[a] - total[b])[0]
      : [...ATTRS].sort((a, b) => total[b] - total[a])[0];
    target = clamp(Math.round(perWeek[attr].reduce((s, v) => s + v, 0) / 4) + 1, 2, 6);
  }
  return {
    id: `${r.weekKey}-${slot}`,
    weekKey: r.weekKey,
    slot,
    templateId,
    ...(attr ? { params: { attribute: attr } } : {}),
    target,
    rewardSp: tpl.tier,
    createdAt: createdAt.toISOString(),
  };
}

/**
 * 「换一张」（第 14 批，每周一次）：从本周还没出过的可出模板里挑一张换掉它——同档优先，没有再看别的档；
 * 属性委托照旧每周最多一张。用「周键 + 账号 + 槽位」做种，同一张在两台设备上换出来也一样。没得换返回 null。
 */
export function swapQuestFor(r: WeekRange, seed: string, d: QuestData, week: Quest[], target: Quest, createdAt: Date = d.now): Quest | null {
  const used = new Set(week.map((q) => q.templateId));
  const isAttr = (id: QuestTemplateId) => id === 'attr_least' || id === 'attr_most';
  const othersHaveAttr = week.some((q) => q.id !== target.id && isAttr(q.templateId));
  const pool = QUEST_TEMPLATE_IDS.filter((id) => !used.has(id) && eligible(id, d, r) && !(isAttr(id) && othersHaveAttr));
  if (!pool.length) return null;
  const sameTier = pool.filter((id) => QUEST_TEMPLATES[id].tier === target.rewardSp);
  const from = sameTier.length ? sameTier : pool;
  const rnd = mulberry32(fnv1a(`${r.weekKey}|swap|${target.slot}|${seed}`));
  const id = from[Math.floor(rnd() * from.length)];
  return { ...buildQuest(id, target.slot, r, d, createdAt), swapped: true };
}
