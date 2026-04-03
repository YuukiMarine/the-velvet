import { AttributeId, KeywordRule } from '@/types';

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  { keywords: ['阅读', '读书', '学习', '课程'], attribute: 'knowledge', points: 2 },
  { keywords: ['健身', '跑步', '运动', '游泳'], attribute: 'dexterity', points: 2 },
  { keywords: ['演讲', '辩论', '冒险', '挑战'], attribute: 'guts', points: 2 },
  { keywords: ['志愿', '帮助', '捐赠', '关心'], attribute: 'kindness', points: 2 },
  { keywords: ['社交', '约会', '穿搭', '化妆'], attribute: 'charm', points: 2 }
];

export const DEFAULT_ATTRIBUTE_NAMES = {
  knowledge: '知识',
  guts: '胆量',
  dexterity: '灵巧',
  kindness: '温柔',
  charm: '魅力'
};

export const DEFAULT_LEVEL_THRESHOLDS = [0, 40, 90, 150, 240];

export const INITIAL_ATTRIBUTES = [
  {
    id: 'knowledge' as AttributeId,
    displayName: '知识',
    points: 0,
    level: 1,
    levelThresholds: [0, 40, 90, 150, 240],
    unlocked: true
  },
  {
    id: 'guts' as AttributeId,
    displayName: '胆量',
    points: 0,
    level: 1,
    levelThresholds: [0, 40, 90, 150, 240],
    unlocked: true
  },
  {
    id: 'dexterity' as AttributeId,
    displayName: '灵巧',
    points: 0,
    level: 1,
    levelThresholds: [0, 40, 90, 150, 240],
    unlocked: true
  },
  {
    id: 'kindness' as AttributeId,
    displayName: '温柔',
    points: 0,
    level: 1,
    levelThresholds: [0, 40, 90, 150, 240],
    unlocked: true
  },
  {
    id: 'charm' as AttributeId,
    displayName: '魅力',
    points: 0,
    level: 1,
    levelThresholds: [0, 40, 90, 150, 240],
    unlocked: true
  }
];

export const ACHIEVEMENTS = [
  {
    id: 'streak_7',
    title: '坚持不懈',
    description: '连续7天记录行为',
    icon: '🔥',
    unlocked: false,
    condition: { type: 'consecutive_days' as const, value: 7 }
  },
  {
    id: 'todo_10',
    title: '任务达人',
    description: '完成10次待办事项',
    icon: '✅',
    unlocked: false,
    condition: { type: 'todo_completions' as const, value: 10 }
  },
  {
    id: 'points_100',
    title: '百分成长',
    description: '累计获得100点',
    icon: '💯',
    unlocked: false,
    condition: { type: 'total_points' as const, value: 100 }
  },
  {
    id: 'knowledge_3',
    title: '知识学者',
    description: '知识达到3级',
    icon: '📖',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 3, attribute: 'knowledge' as AttributeId }
  },
  {
    id: 'knowledge_5',
    title: '知识大师',
    description: '知识达到5级',
    icon: '📚',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 5, attribute: 'knowledge' as AttributeId }
  },
  {
    id: 'guts_3',
    title: '勇敢之心',
    description: '胆量达到3级',
    icon: '💪',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 3, attribute: 'guts' as AttributeId }
  },
  {
    id: 'guts_5',
    title: '无畏战士',
    description: '胆量达到5级',
    icon: '🦁',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 5, attribute: 'guts' as AttributeId }
  },
  {
    id: 'dexterity_3',
    title: '灵巧之手',
    description: '灵巧达到3级',
    icon: '✨',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 3, attribute: 'dexterity' as AttributeId }
  },
  {
    id: 'dexterity_5',
    title: '巧夺天工',
    description: '灵巧达到5级',
    icon: '🎯',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 5, attribute: 'dexterity' as AttributeId }
  },
  {
    id: 'kindness_3',
    title: '温柔之心',
    description: '温柔达到3级',
    icon: '💝',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 3, attribute: 'kindness' as AttributeId }
  },
  {
    id: 'kindness_5',
    title: '仁爱圣者',
    description: '温柔达到5级',
    icon: '🌸',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 5, attribute: 'kindness' as AttributeId }
  },
  {
    id: 'charm_3',
    title: '魅力四射',
    description: '魅力达到3级',
    icon: '✨',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 3, attribute: 'charm' as AttributeId }
  },
  {
    id: 'charm_5',
    title: '魅力之王',
    description: '魅力达到5级',
    icon: '👑',
    unlocked: false,
    condition: { type: 'attribute_level' as const, value: 5, attribute: 'charm' as AttributeId }
  },
  {
    id: 'weekly_planner',
    title: '计划通',
    description: '完成8次每周目标',
    icon: '📅',
    unlocked: false,
    condition: { type: 'weekly_goal_completions' as const, value: 8 }
  },
  {
    id: 'shadow_slayer_5',
    title: '华丽征服',
    description: '在逆影战场中累计击败5次Shadow',
    icon: '⚔️',
    unlocked: false,
    condition: { type: 'shadow_defeats' as const, value: 5 }
  },
  {
    id: 'wild_heart',
    title: '不羁之心',
    description: '所有属性全部达到5级',
    icon: '🦋',
    unlocked: false,
    condition: { type: 'all_attributes_max' as const, value: 5 }
  }
];

export const SKILLS = [
  {
    id: 'speed_reading',
    name: '速读',
    description: '知识积累额外提升 20%',
    requiredAttribute: 'knowledge' as AttributeId,
    requiredLevel: 3,
    unlocked: false,
    bonusMultiplier: 1.2
  },
  {
    id: 'deep_learning',
    name: '深度学习',
    description: '知识积累额外提升 30%',
    requiredAttribute: 'knowledge' as AttributeId,
    requiredLevel: 5,
    unlocked: false,
    bonusMultiplier: 1.3
  },
  {
    id: 'iron_will',
    name: '钢铁意志',
    description: '胆量积累额外提升 20%',
    requiredAttribute: 'guts' as AttributeId,
    requiredLevel: 3,
    unlocked: false,
    bonusMultiplier: 1.2
  },
  {
    id: 'fearless',
    name: '无所畏惧',
    description: '胆量积累额外提升 10%',
    requiredAttribute: 'guts' as AttributeId,
    requiredLevel: 5,
    unlocked: false,
    bonusMultiplier: 1.1
  },
  {
    id: 'nimble_fingers',
    name: '灵巧手指',
    description: '灵巧积累额外提升 20%',
    requiredAttribute: 'dexterity' as AttributeId,
    requiredLevel: 3,
    unlocked: false,
    bonusMultiplier: 1.2
  },
  {
    id: 'master_craftsman',
    name: '工匠大师',
    description: '灵巧积累额外提升 10%',
    requiredAttribute: 'dexterity' as AttributeId,
    requiredLevel: 5,
    unlocked: false,
    bonusMultiplier: 1.1
  },
  {
    id: 'empathy',
    name: '同理心',
    description: '温柔积累额外提升 20%',
    requiredAttribute: 'kindness' as AttributeId,
    requiredLevel: 3,
    unlocked: false,
    bonusMultiplier: 1.2
  },
  {
    id: 'saint',
    name: '圣人之心',
    description: '温柔积累额外提升 10%',
    requiredAttribute: 'kindness' as AttributeId,
    requiredLevel: 5,
    unlocked: false,
    bonusMultiplier: 1.1
  },
  {
    id: 'charisma',
    name: '超凡魅力',
    description: '魅力积累额外提升 20%',
    requiredAttribute: 'charm' as AttributeId,
    requiredLevel: 3,
    unlocked: false,
    bonusMultiplier: 1.2
  },
  {
    id: 'star_quality',
    name: '明星气质',
    description: '魅力积累额外提升 10%',
    requiredAttribute: 'charm' as AttributeId,
    requiredLevel: 5,
    unlocked: false,
    bonusMultiplier: 1.1
  }
];

export const EVENT_POOL = [
  {
    title: '🌟 神秘力量',
    description: '感受到某种神秘力量 **效果翻倍',
    effect: { attribute: 'knowledge' as AttributeId, multiplier: 2 }
  },
  {
    title: '🦋 蝴蝶飞舞',
    description: '蝴蝶飞舞 **效果1.5倍',
    effect: { attribute: 'knowledge' as AttributeId, multiplier: 1.5 }
  },
  {
    title: '⚡ 闪电风暴',
    description: '闪电划破长空 **效果翻倍',
    effect: { attribute: 'dexterity' as AttributeId, multiplier: 2 }
  },
  {
    title: '🌈 彩虹桥',
    description: '彩虹连接天地 **效果1.5倍',
    effect: { attribute: 'dexterity' as AttributeId, multiplier: 1.5 }
  },
  {
    title: '🔥 烈焰燃烧',
    description: '心中烈火燃烧 **效果翻倍',
    effect: { attribute: 'guts' as AttributeId, multiplier: 2 }
  },
  {
    title: '🌙 月圆之夜',
    description: '月光洒满大地 **效果1.5倍',
    effect: { attribute: 'guts' as AttributeId, multiplier: 1.5 }
  },
  {
    title: '🌸 樱花飘落',
    description: '樱花如雪飘落 **效果1.5倍',
    effect: { attribute: 'kindness' as AttributeId, multiplier: 1.5 }
  },
  {
    title: '💫 星辰守护',
    description: '星辰温柔守护 **效果翻倍',
    effect: { attribute: 'kindness' as AttributeId, multiplier: 2 }
  },
  {
    title: '🎨 艺术之光',
    description: '灵感如泉涌 **效果1.5倍',
    effect: { attribute: 'charm' as AttributeId, multiplier: 1.5 }
  },
  {
    title: '✨ 明星之日',
    description: '魅力提升效果翻倍',
    effect: { attribute: 'charm' as AttributeId, multiplier: 2 }
  }
];

// ── 逆影战场常量 ──────────────────────────────────────────

export const SHADOW_LEVEL_CONFIG = [
  { level: 1, maxHp: 80,  maxHp2: undefined as number | undefined, label: '之阴影' },
  { level: 2, maxHp: 120, maxHp2: undefined as number | undefined, label: '之深渊' },
  { level: 3, maxHp: 190, maxHp2: 120,                             label: '之执念' },
  { level: 4, maxHp: 250, maxHp2: 180,                             label: '之噩梦' },
  { level: 5, maxHp: 310, maxHp2: 250,                             label: '之深渊王' },
];

/** Shadow每日HP恢复量（按等级） */
export const SHADOW_REGEN_PER_LEVEL = [2, 3, 4, 5, 5];

/** 击败Shadow后玩家最大HP提升量（按等级） */
export const HP_BONUS_PER_DEFEAT = [2, 3, 4, 5, 5];

export function isInShadowTime(days: number[] = [5, 6, 0], startHour = 20, endHour = 7): boolean {
  const now = new Date();
  const weekday = now.getDay();
  const hour = now.getHours();
  if (hour >= startHour && days.includes(weekday)) return true;
  if (hour < endHour) {
    const yesterday = (weekday + 6) % 7;
    if (days.includes(yesterday)) return true;
  }
  return false;
}

export const SHADOW_RESPONSE_LINES = [
  '你以为这就能击败我？',
  '这点伤害……不过如此。',
  '有趣……继续吧。',
  '你的力量……来自何处？',
  '不要以为你真的了解自己！',
  '我是你内心深处的一部分！',
  '就这点实力，还妄想战胜我？',
  '你越来越强了……但还不够。',
  '我感受到你的成长……令我不安。',
  '小心……我也在变强。',
];
