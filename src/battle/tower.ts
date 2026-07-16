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
import type { AttributeId, MobSpec, StratumNode, StratumNodeType, TowerStratum } from '../types';
import {
  MOB_HP_BY_LEVEL, ELITE_HP_BY_LEVEL,
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

export function rollMobSpec(level: number, tier: 'mob' | 'elite', rng: () => number): MobSpec {
  const attribute = ATTRS[Math.floor(rng() * ATTRS.length)];
  const weakPool = ATTRS.filter(a => a !== attribute);
  const weakAttribute = weakPool[Math.floor(rng() * weakPool.length)];
  const [lo, hi] = (tier === 'mob' ? MOB_HP_BY_LEVEL : ELITE_HP_BY_LEVEL)[Math.min(4, Math.max(0, level - 1))];
  const maxHp = lo + Math.floor(rng() * (hi - lo + 1));
  const pool = tier === 'mob' ? MOB_NAMES[attribute] : ELITE_NAMES[attribute];
  return {
    name: pool[Math.floor(rng() * pool.length)],
    tier,
    attribute,
    weakAttribute,
    maxHp,
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
        const node: StratumNode = { id: nid(), floor, lane, type, edges: [], cleared: false };
        if (type === 'mob' || type === 'elite') {
          node.mob = rollMobSpec(level, type === 'elite' ? 'elite' : 'mob', rng);
          if (type === 'elite') { lastEliteFloor = floor; eliteUsedThisFloor = true; }
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
