/**
 * 羁绊之影 · 原型池
 *
 * 写死的 5 种档（每种绑一个弱点属性），spawn 时纯随机选一档；同一 bond 每次降临的影**可以**重复
 * （同一对人反复被同一个"心之影"纠缠的隐喻）。LLM 花名 / 台词已定不做（PRD §2.4）。
 */

import type { AttributeId } from '@/types';

export interface CoopShadowArchetype {
  /** PB 字段 shadow_id 写这个 */
  id: string;
  /** 两组候选花名 —— spawn 时随机抽一个写到 name_override */
  names: [string, string];
  /** 短描述，战斗面板副标 */
  description: string;
  /** 弱点属性（胜利奖励也是该属性；SVG 主色也跟随它） */
  weakness: AttributeId;
  /** 弱点 16 进制主色（颗粒 / 描边 / 辉光都跟随这个） */
  accent: string;
  /** 登场过场那一句 */
  line: string;
}

export const COOP_SHADOW_POOL: CoopShadowArchetype[] = [
  {
    id: 'coop:despair',
    names: ['干枯的藤蔓', '冷却的余温'],
    description: '吞噬彼此信心的重雾，喜欢在安静的时刻出现。',
    weakness: 'kindness',
    accent: '#10B981',
    line: '"你们真的知道彼此吗？"',
  },
  {
    id: 'coop:apathy',
    names: ['狂怒的火种', '无名之怒'],
    description: '把炽热变成冷水的无形之物，偏爱长时间的沉默。',
    weakness: 'guts',
    accent: '#EF4444',
    line: '"让一切停下来吧。"',
  },
  {
    id: 'coop:envy',
    names: ['破碎的镜中人', '褪色的面具'],
    description: '从沉默的缝隙里钻出的刺，最会抓对方的影子去吓你。',
    weakness: 'charm',
    accent: '#EC4899',
    line: '"Ta 一定藏着什么。"',
  },
  {
    id: 'coop:entropy',
    names: ['谬误的档案', '错乱的方程'],
    description: '逐渐把"在意"稀释成空白；在它足够厚之前几乎看不见。',
    weakness: 'knowledge',
    accent: '#3B82F6',
    line: '"不用刻意去记。"',
  },
  {
    id: 'coop:inertia',
    names: ['迟滞的箭矢', '歪斜的指针'],
    description: '每次想好好表达就绊住你的那股力气，专挑关键时刻发作。',
    weakness: 'dexterity',
    accent: '#F59E0B',
    line: '"你永远说不对那一句。"',
  },
];

/**
 * spawn 时随机挑一个 archetype。
 *
 * 之前版本用 `bondId` hash 做伪随机 —— 同一对 COOP 每次降临都是同一只影，
 * 测试时完全感受不到随机。现在改成纯随机：同一对 COOP 每次遇到的影可能不同。
 *
 * 保留参数 `bondId` 以便调用方签名一致（万一以后想加种子）。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function pickArchetypeForBond(_bondId: string): CoopShadowArchetype {
  const idx = Math.floor(Math.random() * COOP_SHADOW_POOL.length);
  return COOP_SHADOW_POOL[idx];
}

export function archetypeById(id: string): CoopShadowArchetype | undefined {
  return COOP_SHADOW_POOL.find(a => a.id === id);
}
