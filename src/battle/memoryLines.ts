/**
 * 批3 §5.3 · 记忆台词（本地拼接零 AI）
 *
 * 心魔战开场时引用玩家的真实履历事实——撤离史 / 缺席天数 / 档案馆战绩 / 异变加深，
 * 让 Shadow "记得你"。只在主影战注入，一场至多一句。
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */

export interface MemoryFacts {
  /** 曾下塔撤离 / 败退（BattleState.everRetreatedDown） */
  everRetreated: boolean;
  /** 距上次登塔的天数（0=今天连续） */
  daysSinceLastClimb: number;
  /** 档案馆藏品数（已讨伐心魔数） */
  archiveCount: number;
  /** 本区层异变加深次数 */
  deepenCount: number;
}

/** 召唤台词模板兜底（无 Key / 未生成时） */
export const SUMMON_FALLBACK: Record<string, string> = {
  knowledge: '来吧——用真理撕开黑暗。',
  guts: '燃烧吧，我的胆魄！',
  dexterity: '看不清的，才是致命的。',
  kindness: '温柔，也是一种锋利。',
  charm: '目光聚来——舞台是我的。',
};

/** 按事实优先级挑一句记忆台词；无事实或掷空返回 null */
export function pickMemoryLine(facts: MemoryFacts, shadowName: string, rng: () => number = Math.random): string | null {
  const pool: string[] = [];
  if (facts.deepenCount > 0) {
    pool.push(
      `${shadowName}：月亮圆了又缺。你迟到的每一周，都在喂养我。`,
      `${shadowName}：异变第${facts.deepenCount}重——这是你拖延的形状。`,
    );
  }
  if (facts.daysSinceLastClimb >= 3) {
    pool.push(
      `${shadowName}：${facts.daysSinceLastClimb}天没来了。我还以为你认输了。`,
      `${shadowName}：缺席的日子里，塔又长高了一寸。`,
    );
  }
  if (facts.everRetreated) {
    pool.push(
      `${shadowName}：又是你。上次转身下塔的背影，我记得很清楚。`,
      `${shadowName}：逃跑的滋味如何？这次的楼梯，不会再让你轻易下去。`,
    );
  }
  if (facts.archiveCount >= 1) {
    pool.push(
      `${shadowName}：斩落${facts.archiveCount}座心魔又如何——我和它们不同。`,
    );
  }
  if (pool.length === 0) return null;
  // 60% 概率注入，避免每场都念旧
  if (rng() > 0.6) return null;
  return pool[Math.floor(rng() * pool.length)];
}
