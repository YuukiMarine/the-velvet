/**
 * 影时间高塔 · 区层生成与规则（BATTLE_UPGRADE_PLAN_V2.md §2，批2）
 *
 * 塔是唯一的、常在的；本模块负责：
 *  - 周键（月相日=周一为界）
 *  - 区层地图生成（10-12 层、每层 1-3 节点选一、六类节点、保证连通）
 *  - 小影/精英规格（数值走 numbers.ts，命名走本地池零 AI）
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */
import type { AttributeId, MobSpec, Shadow, StratumNode, StratumNodeType, TowerStratum } from '../types';
import { rollAffixes } from './loot';
import {
  AFFIX_HP_MULT, MOB_HP_BY_LEVEL, ELITE_HP_BY_LEVEL,
  ABYSS_RING_FLOORS, abyssAffixCount, abyssGuardHp, GOLDEN_NODE_RATE, GOLDEN_HP_MULT,
  BOSS_ATTACK_BY_LEVEL,
} from './numbers';

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

// ── 周键：周一为界（月相日） ────────────────────────────────
export function weekKeyOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=周日
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── 小影命名池（本地零 AI；按属性向分池） ───────────────────
const MOB_NAMES: Record<AttributeId, string[]> = {
  knowledge: ['迷惘的书影', '诡辩之影', '空谈的低语', '故纸堆的怨念'],
  guts: ['退缩的暗块', '虚张的咆哮', '怯懦的巨腕', '色厉内荏之影'],
  dexterity: ['迟钝的缠足', '手忙脚乱之影', '拖沓的黏体', '错拍的舞影'],
  kindness: ['刻薄的荆棘', '冷漠的雾团', '尖刺的拥抱', '苛责之影'],
  charm: ['孤僻的背影', '聒噪的假面', '谄媚的空壳', '冷场之影'],
};
const ELITE_NAMES: Record<AttributeId, string[]> = {
  knowledge: ['僵化的执典者', '傲慢的审阅者'],
  guts: ['迟疑的巨像', '战栗的看守'],
  dexterity: ['凝滞的钟摆', '缚足的猎手'],
  kindness: ['带刺的守护像', '缄默的裁断者'],
  charm: ['空洞的宴主', '孤高的面具伶人'],
};

/** 批4 §6.7 主影主题：本周五维成长点数最少者 65% 概率成为主题属性（35% 随机其余）；弱点不硬绑（拍板 Q2） */
export function rollThemeAttribute(weekPoints: Record<AttributeId, number>, rng: () => number = Math.random): AttributeId {
  const min = Math.min(...ATTRS.map(a => weekPoints[a] ?? 0));
  const weakest = ATTRS.filter(a => (weekPoints[a] ?? 0) === min);
  const pickedWeakest = weakest[Math.floor(rng() * weakest.length)];
  if (rng() < 0.65) return pickedWeakest;
  const rest = ATTRS.filter(a => a !== pickedWeakest);
  return rest[Math.floor(rng() * rest.length)];
}

export function rollMobSpec(level: number, tier: 'mob' | 'elite', rng: () => number): MobSpec {
  const attribute = ATTRS[Math.floor(rng() * ATTRS.length)];
  const weakPool = ATTRS.filter(a => a !== attribute);
  const weakAttribute = weakPool[Math.floor(rng() * weakPool.length)];
  const [lo, hi] = (tier === 'mob' ? MOB_HP_BY_LEVEL : ELITE_HP_BY_LEVEL)[Math.min(4, Math.max(0, level - 1))];
  let maxHp = lo + Math.floor(rng() * (hi - lo + 1));
  // 批3 §5.1：强敌必带 1 条词缀；「顽固」的 HP+30% 在生成时应用
  const affixes = tier === 'elite' ? rollAffixes(1, rng) : undefined;
  if (affixes?.includes('stubborn')) maxHp = Math.round(maxHp * AFFIX_HP_MULT);
  const pool = tier === 'mob' ? MOB_NAMES[attribute] : ELITE_NAMES[attribute];
  return {
    name: pool[Math.floor(rng() * pool.length)],
    tier,
    attribute,
    weakAttribute,
    maxHp,
    affixes,
  };
}

// ── 金色回响 · 稀有影（批5 §5.5）────────────────────────────
const GOLDEN_NAMES = ['金色的回响', '镀金之影', '黄昏的余晖', '溢光的富者'];

export function rollGoldenSpec(level: number, rng: () => number): MobSpec {
  const attribute = ATTRS[Math.floor(rng() * ATTRS.length)];
  const weakPool = ATTRS.filter(a => a !== attribute);
  const [, hi] = ELITE_HP_BY_LEVEL[Math.min(4, Math.max(0, level - 1))];
  return {
    name: GOLDEN_NAMES[Math.floor(rng() * GOLDEN_NAMES.length)],
    tier: 'elite',
    attribute,
    weakAttribute: weakPool[Math.floor(rng() * weakPool.length)],
    maxHp: Math.round(hi * GOLDEN_HP_MULT),
    golden: true,
  };
}

// ── 区层地图生成 ────────────────────────────────────────────
// 结构约束：
//  - floors ∈ [10,12]；第 1 层 = 单个入门小影；顶层 = 主影（单节点）
//  - 中间层 2-3 节点选一；elite 从第 3 层起、每隔 ≥2 层至多 1 只；
//    chest 2-3 个、echo 2-3 个、event 若干；同层不重复 elite
//  - 连通：每个节点连上一层 |lane 差|≤1 的节点，空则连全部

interface GenOptions {
  level: number;
  rng: () => number;
  eventPoolIds: string[];
  /** 月匣 SP（批2 掉 SP；物品池批3 接入后改掉落表） */
  chestSp: (floor: number) => number;
}

export function generateStratumNodes(opts: GenOptions): { nodes: StratumNode[]; floors: number } {
  const { level, rng, eventPoolIds, chestSp } = opts;
  const floors = 10 + Math.floor(rng() * 3); // 10-12
  const nodes: StratumNode[] = [];
  let idSeq = 0;
  const nid = () => `n${level}-${++idSeq}`;

  // 配额（中间层可用）
  let chestQuota = 2 + Math.floor(rng() * 2); // 2-3
  let echoQuota = 2 + Math.floor(rng() * 2);  // 2-3
  let lastEliteFloor = -99;

  const byFloor: StratumNode[][] = [];

  for (let floor = 1; floor <= floors; floor++) {
    const row: StratumNode[] = [];
    if (floor === 1) {
      row.push({ id: nid(), floor, lane: 1, type: 'mob', edges: [], cleared: false, mob: rollMobSpec(level, 'mob', rng) });
    } else if (floor === floors) {
      row.push({ id: nid(), floor, lane: 1, type: 'boss', edges: [], cleared: false });
    } else {
      const count = 2 + (rng() < 0.4 ? 1 : 0); // 2-3
      const lanes = count === 2 ? [0, 2] : [0, 1, 2];
      let eliteUsedThisFloor = false;
      for (const lane of lanes) {
        let type: StratumNodeType;
        const roll = rng();
        const eliteAllowed = floor >= 3 && floor <= floors - 1 && floor - lastEliteFloor >= 3 && !eliteUsedThisFloor;
        if (eliteAllowed && roll < 0.16) {
          type = 'elite';
        } else if (chestQuota > 0 && roll >= 0.16 && roll < 0.27) {
          type = 'chest';
        } else if (echoQuota > 0 && roll >= 0.27 && roll < 0.40) {
          type = 'echo';
        } else if (roll >= 0.40 && roll < 0.60) {
          type = 'event';
        } else {
          type = 'mob';
        }
        // 批5 §5.5 金色回响：中间层 mob 节点 1.5% 转金（稀有影一战，必掉满月）
        if (type === 'mob' && rng() < GOLDEN_NODE_RATE) type = 'golden';
        const node: StratumNode = { id: nid(), floor, lane, type, edges: [], cleared: false };
        if (type === 'mob' || type === 'elite') {
          node.mob = rollMobSpec(level, type === 'elite' ? 'elite' : 'mob', rng);
          if (type === 'elite') { lastEliteFloor = floor; eliteUsedThisFloor = true; }
        } else if (type === 'golden') {
          node.mob = rollGoldenSpec(level, rng);
        } else if (type === 'event') {
          node.eventPoolId = eventPoolIds[Math.floor(rng() * eventPoolIds.length)];
        } else if (type === 'chest') {
          node.lootSp = chestSp(floor);
          chestQuota--;
        } else if (type === 'echo') {
          echoQuota--;
        }
        row.push(node);
      }
    }
    byFloor.push(row);
    nodes.push(...row);
  }

  // 连边：floor f 的节点 → floor f+1 中 |lane 差|≤1 的节点（空则连全部）
  for (let f = 0; f < byFloor.length - 1; f++) {
    for (const node of byFloor[f]) {
      const next = byFloor[f + 1];
      const adjacent = next.filter(n => Math.abs(n.lane - node.lane) <= 1);
      node.edges = (adjacent.length > 0 ? adjacent : next).map(n => n.id);
    }
  }

  return { nodes, floors };
}

// ── 区层实例构造 ────────────────────────────────────────────
export interface StratumSeed {
  id: string;
  level: number;
  name: string;
  description: string;
  themeAttribute?: AttributeId;
  baseFloor: number;
  now: Date;
  rng?: () => number;
  eventPoolIds: string[];
  chestSp: (floor: number) => number;
}

export function buildStratum(seed: StratumSeed): TowerStratum {
  const rng = seed.rng ?? Math.random;
  const { nodes, floors } = generateStratumNodes({
    level: seed.level, rng, eventPoolIds: seed.eventPoolIds, chestSp: seed.chestSp,
  });
  return {
    id: seed.id,
    level: seed.level,
    name: seed.name,
    description: seed.description,
    themeAttribute: seed.themeAttribute,
    createdWeekKey: weekKeyOf(seed.now),
    baseFloor: seed.baseFloor,
    floors,
    nodes,
    currentNodeId: null,
    deepenCount: 0,
    status: 'climbing',
    createdAt: seed.now,
  };
}

/** 当前可移动的目标节点：入口（currentNodeId=null）→ 第 1 层全部；
 *  当前节点未完成（战斗撤离/事件未处理）→ 只能重试当前节点；完成后 → edges */
export function reachableNodeIds(stratum: TowerStratum): string[] {
  if (stratum.status !== 'climbing') return [];
  if (!stratum.currentNodeId) {
    return stratum.nodes.filter(n => n.floor === 1).map(n => n.id);
  }
  const cur = stratum.nodes.find(n => n.id === stratum.currentNodeId);
  if (!cur) return [];
  if (!cur.cleared) return [cur.id];
  return cur.edges;
}

/** 全塔累计层号（显示用） */
export function absoluteFloor(stratum: TowerStratum, floor: number): number {
  return stratum.baseFloor + floor;
}

/** 迁移：存量单只 Shadow → 同级区层（保留 boss 本体；区层名用模板，AI 名后置） */
export function migrationStratumName(shadowName: string): { name: string; description: string } {
  return {
    name: `${shadowName.slice(0, 6)}之域`,
    description: '旧日的暗影盘踞于此——高塔在影时间中显形，它在区层之巅等你。',
  };
}

// ── 批5 · 深渊回廊（§13 批5）────────────────────────────────
// Lv5 通关后解锁的无尽环域：每环 = 5 层直线小图（战斗×2-3 + 事件/回响/月匣 + 顶端守卫）。
// 零 AI 即时生成；守卫 HP +5%/环、词缀 1→4 条 cap；无月相加深；通关不锁日（同晚可连环）。

const ABYSS_GUARD_NAMES = [
  '无貌的巡廊者', '底部的凝视', '回声之壁', '褪色的门扉',
  '静默的秤', '逆写的碑文', '不眠的灯座', '深处的合唱',
];

const ABYSS_GUARD_LINES = [
  '再往下，连月光都要迷路了。',
  '你一路带下来的每一声喘息，我都听见了。',
  '回廊没有尽头——只有还没认输的人。',
  '把面具收好。下面的风，会撕掉伪装。',
  '第几环了？数字早就不重要了吧。',
  '在这里倒下的家伙，都说过和你一样的话。',
];

export interface AbyssRingSeed {
  ring: number;
  stratumId: string;
  guardId: string;
  baseFloor: number;
  now: Date;
  rng?: () => number;
  eventPoolIds: string[];
  chestSp: (floor: number) => number;
  /** 守卫弱点排除上次（沿主塔口径） */
  lastWeakAttribute?: AttributeId;
  attrNames: Record<AttributeId, string>;
}

/** 深渊环节点：5 层直线（1=Shadow / 2=补给 / 3=Shadow或强敌 / 4=随机 / 5=守卫）；金色掷取同主塔 */
export function generateAbyssNodes(ring: number, rng: () => number, eventPoolIds: string[], chestSp: (floor: number) => number): StratumNode[] {
  const nodes: StratumNode[] = [];
  let idSeq = 0;
  const nid = () => `a${ring}-${++idSeq}`;
  const supply = (): StratumNodeType => {
    const r = rng();
    return r < 0.36 ? 'event' : r < 0.7 ? 'echo' : 'chest';
  };
  for (let floor = 1; floor <= ABYSS_RING_FLOORS; floor++) {
    let type: StratumNodeType;
    if (floor === ABYSS_RING_FLOORS) type = 'boss';
    else if (floor === 2) type = supply();
    else if (floor === 3) type = rng() < 0.5 ? 'elite' : 'mob';
    else if (floor === 4) type = rng() < 0.45 ? supply() : 'mob';
    else type = 'mob';
    if (type === 'mob' && rng() < GOLDEN_NODE_RATE) type = 'golden';
    const node: StratumNode = { id: nid(), floor, lane: 1, type, edges: [], cleared: false };
    if (type === 'mob' || type === 'elite') node.mob = rollMobSpec(5, type === 'elite' ? 'elite' : 'mob', rng);
    else if (type === 'golden') node.mob = rollGoldenSpec(5, rng);
    else if (type === 'event') node.eventPoolId = eventPoolIds[Math.floor(rng() * eventPoolIds.length)];
    else if (type === 'chest') node.lootSp = chestSp(floor);
    nodes.push(node);
  }
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].edges = [nodes[i + 1].id];
  return nodes;
}

/** 深渊环 + 守卫（零 AI）：环 = TowerStratum(abyssRing)；守卫 = shadows 单例（Lv5 档、无二形态） */
export function buildAbyssRing(seed: AbyssRingSeed): { stratum: TowerStratum; guard: Shadow } {
  const rng = seed.rng ?? Math.random;
  const { ring } = seed;
  const nodes = generateAbyssNodes(ring, rng, seed.eventPoolIds, seed.chestSp);
  const weakPool = ATTRS.filter(a => a !== seed.lastWeakAttribute);
  const weakAttribute = weakPool[Math.floor(rng() * weakPool.length)];
  const affixes = rollAffixes(abyssAffixCount(ring), rng);
  let maxHp = abyssGuardHp(ring);
  if (affixes.includes('stubborn')) maxHp = Math.round(maxHp * AFFIX_HP_MULT);
  const guardBase = ABYSS_GUARD_NAMES[(ring - 1) % ABYSS_GUARD_NAMES.length];
  const guard: Shadow = {
    id: seed.guardId,
    level: 5,
    name: `${guardBase}`,
    description: `盘踞在回廊第${ring}环底部的守卫。它不是谁的心魔——它是"继续往下"这个念头本身的重量。`,
    invertedAttributes: Object.fromEntries(ATTRS.map(a => [a, `被回廊吞没的${seed.attrNames[a]}`])) as Record<AttributeId, string>,
    weakAttribute,
    maxHp,
    currentHp: maxHp,
    maxHp2: undefined,
    currentHp2: undefined,
    responseLines: [...ABYSS_GUARD_LINES].sort(() => rng() - 0.5),
    attackPower: BOSS_ATTACK_BY_LEVEL[4],
    affixes,
    createdAt: seed.now,
  };
  const stratum: TowerStratum = {
    id: seed.stratumId,
    level: 5,
    name: `回廊·第${ring}环`,
    description: ring === 1
      ? '塔顶之上没有天空——只有向下盘旋的回廊。月光在这里是往上坠的。'
      : `回廊的第${ring}道弯。空气比上一环更稠，脚步声回来得更慢。`,
    createdWeekKey: weekKeyOf(seed.now),
    baseFloor: seed.baseFloor,
    floors: ABYSS_RING_FLOORS,
    nodes,
    currentNodeId: null,
    deepenCount: 0,
    status: 'climbing',
    abyssRing: ring,
    createdAt: seed.now,
  };
  return { stratum, guard };
}
