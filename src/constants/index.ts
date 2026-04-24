import { AttributeId, KeywordRule, PersonaSkill, StatusKind } from '@/types';

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

/** 属性主色 — 与 Statistics 页保持一致，供雷达图、Shadow 染色、UI 标识复用 */
export const ATTR_COLORS: Record<AttributeId, string> = {
  knowledge: '#3B82F6', // 蓝
  guts:      '#EF4444', // 红
  dexterity: '#10B981', // 绿
  kindness:  '#F59E0B', // 琥珀
  charm:     '#8B5CF6', // 紫
};

/** Shadow 按弱点属性染色时使用的一组派生色（眼睛/发光/glitch），更深的主题以保留"阴影"质感 */
export const SHADOW_ACCENT_BY_WEAKNESS: Record<AttributeId, { eye: string; glow: string; glitch: string }> = {
  knowledge: { eye: '#60A5FA', glow: 'rgba(59,130,246,0.55)',  glitch: 'rgba(96,165,250,0.65)' },
  guts:      { eye: '#F87171', glow: 'rgba(239,68,68,0.55)',   glitch: 'rgba(248,113,113,0.65)' },
  dexterity: { eye: '#34D399', glow: 'rgba(16,185,129,0.55)',  glitch: 'rgba(52,211,153,0.65)' },
  kindness:  { eye: '#FBBF24', glow: 'rgba(245,158,11,0.55)',  glitch: 'rgba(251,191,36,0.65)' },
  charm:     { eye: '#C084FC', glow: 'rgba(139,92,246,0.55)',  glitch: 'rgba(192,132,252,0.65)' },
};

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
    description: '完成10次任务',
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
    id: 'confidants_web_5',
    title: '彼此托付',
    description: '与 5 位同伴建立联系，且每位亲密度都达到 Lv.4',
    icon: '🌼',
    unlocked: false,
    condition: { type: 'confidants_at_level' as const, value: 5, minLevel: 4 }
  },
  {
    id: 'confidants_trio_max',
    title: '三重圆满',
    description: '拥有 3 位亲密度达到 Lv.10 的同伴',
    icon: '✦',
    unlocked: false,
    condition: { type: 'confidants_at_level' as const, value: 3, minLevel: 10 }
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
  { level: 1, maxHp: 150, maxHp2: undefined as number | undefined, label: '之阴影' },
  { level: 2, maxHp: 200, maxHp2: undefined as number | undefined, label: '之深渊' },
  { level: 3, maxHp: 250, maxHp2: 120,                             label: '之执念' },
  { level: 4, maxHp: 400, maxHp2: 240,                             label: '之噩梦' },
  { level: 5, maxHp: 450, maxHp2: 260,                             label: '之深渊王' },
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

// ── 技能效果映射：属性 × type → StatusEffect ─────────────────

export interface SkillEffectDef {
  kind: StatusKind;
  target: 'player' | 'shadow';
  turns: number;
  value: number;
  stackable?: boolean;
  /** 显示在技能卡上的效果提示 */
  hint: string;
  /** 显示在状态栏的简短标签 */
  label: string;
  /** 状态栏 icon */
  icon: string;
}

/**
 * 属性 × type 的状态效果映射。未列入的组合沿用 v1.8.5 旧行为。
 * - damage / crit / charge / buff 在所有属性下行为基本一致（buff 沿用"下次×1.5"）
 * - debuff 与 attack_boost 按属性分化
 */
export const SKILL_EFFECT_MAP: Partial<Record<AttributeId, Partial<Record<PersonaSkill['type'], SkillEffectDef>>>> = {
  knowledge: {
    debuff: { kind: 'mark', target: 'shadow', turns: 2, value: 1.2, hint: '猎手标记×1.2 (2回合)', label: '标记', icon: '🎯' },
    attack_boost: { kind: 'crit_debuff', target: 'shadow', turns: 2, value: 0.5, hint: 'Shadow 暴击率−50% (2回合)', label: '洞悉', icon: '🔭' },
  },
  guts: {
    debuff: { kind: 'fear', target: 'shadow', turns: 1, value: 0.5, hint: 'Shadow 50% 概率跳过', label: '恐惧', icon: '😱' },
    // attack_boost 保留旧行为（+15 3回合）
  },
  dexterity: {
    debuff: { kind: 'poison', target: 'shadow', turns: 3, value: 3, stackable: true, hint: '中毒-3HP (3回合/可叠3层)', label: '中毒', icon: '☠️' },
    attack_boost: { kind: 'crit_buff', target: 'player', turns: 3, value: 0.25, hint: '玩家暴击率+25% (3回合)', label: '连击', icon: '⚡' },
  },
  kindness: {
    debuff: { kind: 'calm', target: 'shadow', turns: 2, value: 0.7, hint: 'Shadow 攻击×0.7 (2回合)', label: '镇静', icon: '🌿' },
    attack_boost: { kind: 'shield', target: 'player', turns: 1, value: 0.6, hint: '护盾：吸收下次伤害60%', label: '护盾', icon: '🛡️' },
  },
  charm: {
    debuff: { kind: 'beguile', target: 'shadow', turns: 1, value: 0.5, hint: 'Shadow 50% 概率自伤', label: '魅惑', icon: '💋' },
    attack_boost: { kind: 'resonance', target: 'player', turns: 1, value: 1.8, hint: '共鸣：下次伤害×1.8', label: '共鸣', icon: '🎵' },
  },
};

/** 按属性返回 heal 的实际回复量（统一 2 点） */
export const HEAL_VALUE_BY_ATTR: Record<AttributeId, number> = {
  knowledge: 2,
  guts: 2,
  dexterity: 2,
  kindness: 2,
  charm: 2,
};

/** 状态类型到展示信息（无 skill 映射时兜底使用） */
export const STATUS_LABELS: Record<StatusKind, { label: string; icon: string }> = {
  poison:      { label: '中毒', icon: '☠️' },
  mark:        { label: '标记', icon: '🎯' },
  fear:        { label: '恐惧', icon: '😱' },
  calm:        { label: '镇静', icon: '🌿' },
  beguile:     { label: '魅惑', icon: '💋' },
  shield:      { label: '护盾', icon: '🛡️' },
  crit_buff:   { label: '连击', icon: '⚡' },
  crit_debuff: { label: '洞悉', icon: '🔭' },
  resonance:   { label: '共鸣', icon: '🎵' },
};

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
