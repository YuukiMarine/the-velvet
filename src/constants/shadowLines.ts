/**
 * Shadow 情境化台词库。
 * 新情境（打断/狂化/DoT等）不扩 AI prompt，直接由系统按类别抽取。
 */
export const SHADOW_CONTEXTUAL_LINES: Record<string, string[]> = {
  interrupt: [
    '就是现在……你的破绽！',
    '蓄力？太天真了。',
    '让我来打破你的节奏。',
    '那一瞬的空隙，足够了。',
    '愚蠢——把自己完全暴露给我。',
  ],
  guarding: [
    '我也学乖了。',
    '你的弱点我已看穿。',
    '两次？够了。',
    '别以为同样的招式能奏效第三次。',
  ],
  berserk: [
    '{name} 的力量在暗处暴涨……！',
    '不够，还远远不够！',
    '你唤醒了我真正的样子。',
    '我不再顾忌——连同自己一起焚毁也好！',
  ],
  phase2Open: [
    '这才是我真正的形态……',
    '你以为这就结束了？',
    '从现在开始，才是真正的交锋。',
  ],
  playerLowHp: [
    '苟延残喘罢了。',
    '结束了。',
    '就到这里吧。',
    '再挣扎一下也好——绝望的味道更浓。',
  ],
  selfLowHp: [
    '还没……还没结束！',
    '我不会就这么消散。',
    '你以为你赢了？',
  ],
  dotTick: [
    '毒性正在侵蚀你……',
    '疼吗？',
    '慢慢品味这份无力吧。',
    '你的挣扎只会加速结束。',
  ],
  playerDefense: [
    '龟缩无用。',
    '防御撑不了几回合。',
    '躲藏到何时？',
  ],
  insightUsed: [
    '你以为看穿我就够了？',
    '知道了又如何？',
    '窥视我？代价是巨大的。',
  ],
  allOutReady: [
    '不……你不会——！',
    '那是……禁忌的力量……！',
    '停下！那会连同你自己一起——',
  ],
  beguiled: [
    '……我的身体……！',
    '不是我想做的……！',
    '你做了什么……！',
  ],
  feared: [
    '……可恶，动不了……',
    '身体……僵住了……',
    '不该退缩，但……',
  ],
};

/** 随机抽取一条，替换 {name} 占位符 */
export function pickShadowLine(category: string, shadowName: string): string {
  const pool = SHADOW_CONTEXTUAL_LINES[category] || [];
  if (pool.length === 0) return '';
  return pool[Math.floor(Math.random() * pool.length)].replace(/\{name\}/g, shadowName);
}
