/**
 * 战斗引擎 v2 · Shadow 意图与技能库（BATTLE_UPGRADE_PLAN_V2.md §3.5 / §3.8）
 *
 * 意图在回合开始锁定并明牌展示——预判即事实（修 review #2）。
 * 打断是意图之一而非最高优先短路（修 review #1 的"蓄力压制一切决策"）。
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */
import type { AttributeId } from '../types';
import {
  BERSERK_HP_THRESHOLD,
  EXECUTE_PLAYER_HP_RATIO,
  HEAVY_COOLDOWN_TURNS,
} from './numbers';

export type IntentKind =
  | 'attack'      // ⚔ 常规攻击
  | 'heavy'       // ⚡ 大招前摇（可被失衡打断）
  | 'heavyRelease'// ⚡ 大招释放（前摇结束）
  | 'buff'        // ✨ 自我强化
  | 'debuff'      // ☠ 施加异常（附带轻击）
  | 'guard'       // 🛡 警戒（受伤减免 + 轻击）
  | 'interrupt'   // 👁 打断（玩家蓄力中 → 取消蓄力）
  | 'execute'     // 👁 处刑（必暴击）
  | 'berserk';    // 👁 狂化转变

export interface Intent {
  kind: IntentKind;
  icon: string;
  label: string;
  /** 洞察展开的详情（含数值预告） */
  detail: string;
}

export const INTENT_META: Record<IntentKind, { icon: string; label: string }> = {
  attack:       { icon: '⚔️', label: '攻击' },
  heavy:        { icon: '⚡', label: '大招前摇' },
  heavyRelease: { icon: '⚡', label: '大招释放' },
  buff:         { icon: '✨', label: '强化' },
  debuff:       { icon: '☠️', label: '施加异常' },
  guard:        { icon: '🛡️', label: '警戒' },
  interrupt:    { icon: '👁️', label: '打断' },
  execute:      { icon: '👁️', label: '处刑' },
  berserk:      { icon: '👁️', label: '狂化' },
};

export interface IntentContext {
  rng: () => number;
  turn: number;
  playerChargeActive: boolean;
  consecutiveWeakness: number;
  shadowHpRatio: number;
  playerHpRatio: number;
  berserk: boolean;
  /** 大招冷却剩余回合（≤0 可用） */
  heavyCooldown: number;
  /** 上回合已进入前摇 → 本回合强制释放 */
  windupActive: boolean;
  /** 本场已警戒过的次数（防连发） */
  guardUsed: number;
  /** 本场已处刑过的次数（跑测微调：处刑限每场 1 次，避免濒死死亡螺旋） */
  executeUsed: number;
  /** Lv1-2 弱影不掌握大招 */
  level: number;
  /** 敌人档位（批2）：小影只会 攻击/异常，精英无狂化/处刑，主影全套 */
  tier: 'mob' | 'elite' | 'boss';
}

export function makeIntent(kind: IntentKind, detail: string): Intent {
  const meta = INTENT_META[kind];
  return { kind, icon: meta.icon, label: meta.label, detail };
}

/**
 * 意图决策（回合开始调用一次，结果锁定）。
 * 优先级：前摇释放 > 狂化转变 > 处刑 > 打断 > 警戒 > 大招前摇 > 权重（攻击/异常/强化）
 * 档位差分（§3.8）：小影 2 招（攻击/异常）；精英 3+ 招但无狂化/处刑；主影全套。
 */
export function decideIntent(ctx: IntentContext): IntentKind {
  if (ctx.tier === 'mob') {
    return ctx.rng() < 0.72 ? 'attack' : 'debuff';
  }
  if (ctx.windupActive) return 'heavyRelease';
  if (ctx.tier === 'boss') {
    if (ctx.shadowHpRatio < BERSERK_HP_THRESHOLD && !ctx.berserk) return 'berserk';
    if (ctx.playerHpRatio < EXECUTE_PLAYER_HP_RATIO && ctx.executeUsed === 0) return 'execute';
  }
  if (ctx.playerChargeActive) return 'interrupt';
  if (ctx.consecutiveWeakness >= 2 && ctx.guardUsed < 2) return 'guard';
  if (ctx.level >= 2 && ctx.turn >= 3 && ctx.heavyCooldown <= 0) return 'heavy';
  const roll = ctx.rng();
  if (roll < 0.55) return 'attack';
  if (roll < 0.8) return 'debuff';
  return 'buff';
}

// ── 意图台词（系统内置，不扩 AI；shadowLines.ts 的情境池继续复用） ──
export const INTENT_LINES: Partial<Record<IntentKind, string[]>> = {
  heavy: [
    '空气开始震颤——它在酝酿什么。',
    '深处传来低鸣，它抬起了手。',
    '阴影向它汇聚，危险的预兆。',
  ],
  buff: [
    '它的轮廓变得更加浓重。',
    '阴影在它周身盘旋上升。',
  ],
  debuff: [
    '它吐出一缕侵蚀性的黑雾。',
    '指尖的阴影渗入你的影子。',
  ],
};

export function pickIntentLine(kind: IntentKind, rng: () => number): string | null {
  const pool = INTENT_LINES[kind];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

/** 洞察详情模板（引擎生成 detail 时使用） */
export function intentDetail(
  kind: IntentKind,
  args: { name: string; attackPreview: number; weakAttrName?: string; playerAttrName?: string },
): string {
  switch (kind) {
    case 'attack': return `${args.name} 将发动常规攻击，预计 ${args.attackPreview} 点伤害。`;
    case 'heavy': return `${args.name} 正在酝酿大招——下回合将释放约 ${args.attackPreview} 点重击。趁前摇将它打入失衡可以打断！`;
    case 'heavyRelease': return `大招即将落下！预计 ${args.attackPreview} 点重击——防御、护盾或打断是仅有的选择。`;
    case 'buff': return `${args.name} 将强化自身，接下来 3 回合攻击提升。`;
    case 'debuff': return `${args.name} 将向你施加异常状态，并附带一次轻击。`;
    case 'guard': return `${args.name} 进入警戒——本回合它受到的伤害将减少。`;
    case 'interrupt': return `${args.name} 盯上了你的蓄力——若蓄力仍在，将被它打断！先把蓄力打出去。`;
    case 'execute': return `${args.name} 嗅到了你的濒死气息——这一击必定暴击（约 ${args.attackPreview} 点）。`;
    case 'berserk': return `${args.name} 的能量即将失控——狂化后攻击 ×1.5，但每回合自损。`;
  }
}

/** Shadow 属性向：存量 Shadow 没有该字段时，从 id 稳定散列派生（排除弱点属性，避免混淆） */
export function deriveShadowAttribute(id: string, weakAttribute: AttributeId): AttributeId {
  const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const pool = ATTRS.filter(a => a !== weakAttribute);
  return pool[hash % pool.length];
}

export function initialHeavyCooldown(): number {
  return HEAVY_COOLDOWN_TURNS - 2; // 首个大招最早出现在第 3-4 回合
}
