import type { Activity, AttributeId, BattleState, DailyDivination, Todo } from '@/types';
import { TAROT_BY_ID } from '@/constants/tarot';
import type { MoonShadowFacts } from '@/utils/battleAI';

/**
 * 满月心魔的素材（第 6 轮）：只喂当月的结构化事实，不喂记录原文（与战场 AI 的隐私口径一致）。
 * 「当月」= 满月那天所在的自然月，截到此刻。
 */
const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date | string) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

export function collectMoonFacts(input: {
  activities: Activity[];
  divinations: DailyDivination[];
  todos: Todo[];
  battleState: BattleState | null;
  now: Date;
}): MoonShadowFacts {
  const { now } = input;
  const month = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const inMonth = (d: Date | string) => keyOf(d).startsWith(month) && new Date(d).getTime() <= now.getTime();
  const own = input.activities.filter((a) => !a.category && !a.backfilled && inMonth(a.date));
  const attrPoints = Object.fromEntries(ATTRS.map((k) => [k, 0])) as Record<AttributeId, number>;
  const attrRecords = Object.fromEntries(ATTRS.map((k) => [k, 0])) as Record<AttributeId, number>;
  for (const a of own) {
    for (const k of ATTRS) {
      const v = a.pointsAwarded?.[k] ?? 0;
      attrPoints[k] += v;
      if (v > 0) attrRecords[k] += 1;
    }
  }
  const categoryCounts: Record<string, number> = {};
  for (const a of input.activities) if (a.category && inMonth(a.date)) categoryCounts[a.category] = (categoryCounts[a.category] ?? 0) + 1;
  const tarotNames = Array.from(new Set(
    input.divinations.filter((d) => d.date.startsWith(month)).map((d) => TAROT_BY_ID[d.cardId]?.name).filter((x): x is string => !!x),
  )).slice(0, 6);
  const bigDeals = input.todos
    .filter((t) => t.isBigDeal && !t.archivedAt && (t.steps?.length ?? 0) > 0)
    .map((t) => ({ done: (t.steps ?? []).filter((s) => s.done).length, total: (t.steps ?? []).length }));
  // 弱点 = 当月记得最少的一维（条数相同按点数少的；再相同按固定顺序）
  const weakAttribute = [...ATTRS].sort((a, b) => attrRecords[a] - attrRecords[b] || attrPoints[a] - attrPoints[b])[0];
  return {
    month,
    attrPoints,
    recordDays: new Set(own.map((a) => keyOf(a.date))).size,
    totalRecords: own.length,
    categoryCounts,
    tarotNames,
    bigDeals,
    weakAttribute,
    defeatedMoons: input.battleState?.moonDefeats ?? 0,
  };
}
