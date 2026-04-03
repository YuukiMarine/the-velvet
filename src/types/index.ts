export type AttributeId = 'knowledge' | 'guts' | 'dexterity' | 'kindness' | 'charm';

export type AttributeNames = {
  knowledge: string;
  guts: string;
  dexterity: string;
  kindness: string;
  charm: string;
};

export type AttributeNamesKey = keyof AttributeNames;

export type ThemeType = 'blue' | 'yellow' | 'red' | 'pink' | 'custom';

export interface User {
  id: string;
  name: string;
  createdAt: Date;
  theme: ThemeType;
}

export interface Attribute {
  id: AttributeId;
  displayName: string;
  points: number;
  level: number;
  levelThresholds: number[];
  unlocked: boolean;
}

export interface Activity {
  id: string;
  userId: string;
  date: Date;
  description: string;
  pointsAwarded: {
    knowledge: number;
    guts: number;
    dexterity: number;
    kindness: number;
    charm: number;
  };
  method: 'local' | 'todo' | 'battle';
  important?: boolean;
  category?: 'skill_unlock' | 'achievement_unlock' | 'level_up' | 'weekly_goal' | 'countercurrent' | 'shadow_defeat';
  levelUps?: Array<{
    attribute: AttributeId;
    fromLevel: number;
    toLevel: number;
  }>;
}

export type TodoFrequency = 'single' | 'count';

export interface Todo {
  id: string;
  title: string;
  attribute: AttributeId;
  points: number;
  /** 额外加成属性（最多再添加 2 个，与 attribute+points 共 3 个） */
  extraBoosts?: Array<{ attribute: AttributeId; points: number }>;
  frequency: TodoFrequency;
  repeatDaily?: boolean;
  isLongTerm?: boolean;
  targetCount?: number;
  weekdays?: number[];
  isActive: boolean;
  important?: boolean;
  /** 指定未来某日启用，格式 YYYY-MM-DD；日期未到时不会出现在今日待办 */
  startDate?: string;
  createdAt: Date;
  archivedAt?: Date;
  /** 待办被完成（达标）时的时间戳，用于区分"已完成"和"手动归档" */
  completedAt?: Date;
}

export interface TodoCompletion {
  id: string;
  todoId: string;
  date: string;
  count: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedDate?: Date;
  condition: {
    type: 'consecutive_days' | 'total_points' | 'attribute_level' | 'keyword_match' | 'all_attributes_max' | 'todo_completions' | 'weekly_goal_completions' | 'shadow_defeats';
    value: number;
    attribute?: AttributeId;
    keywords?: string[];
    currentProgress?: number;
  };
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  requiredAttribute: AttributeId;
  requiredLevel: number;
  unlocked: boolean;
  bonusMultiplier?: number; // 解锁后的额外属性提升倍数
  flatBonus?: number;       // 每次加点额外固定追加点数
}

export interface DailyEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  effect: {
    attribute: AttributeId;
    multiplier: number;
  };
}

export interface KeywordRule {
  keywords: string[];
  attribute: AttributeId;
  points: number;
}

export interface Settings {
  id?: string;
  attributeNames: AttributeNames;
  levelThresholds: number[];
  openaiEnabled: boolean;
  openaiApiKey: string;
  keywordRules: KeywordRule[];
  darkMode: boolean;
  backgroundImage?: string;
  backgroundOrientation?: 'landscape' | 'portrait';
  backgroundOpacity?: number;
  soundMuted?: boolean;
  soundVolume?: number;     // 音量大小 0–100，默认 80
  customAchievements?: Achievement[];
  customSkills?: Skill[];
  customLevelThresholds?: number[];
  backgroundPattern?: boolean; // 装饰纹理（无背景图时显示）
  backgroundAnimation?: string[]; // 背景动画风格（可多选：'aurora'|'particles'|'wave'|'pulse'）
  customThemeColor?: string;       // 自定义主题色 hex（theme='custom' 时生效）
  customSoundScheme?: ThemeType;   // 自定义音效方案（custom 主题时使用，默认跟随 blue）
  countercurrentEnabled?: boolean; // 逆流：连续3日无增长属性自动 -1/天
  countercurrentEnabledAt?: string; // 逆流开启日期 YYYY-MM-DD，防止开启当天就触发
  // AI 总结功能配置
  summaryApiProvider?: 'openai' | 'deepseek' | 'kimi';
  summaryApiKey?: string;
  summaryApiBaseUrl?: string;
  summaryModel?: string;
  summaryPromptPresets?: SummaryPromptPreset[];
  summaryActivePresetId?: string;
  // 开屏动画
  splashStyle?: 'velvet' | 'p5' | 'p3' | 'p4';
  splashSpeed?: 'fast' | 'normal' | 'slow';
  // 逆影战场
  battleEnabled?: boolean;
  battleShadowTimeStart?: number;
  battleShadowTimeEnd?: number;
  battleShadowTimeDays?: number[];
  battlePlayerMaxHp?: number;
  battleSpMultiplier?: number;
  battleShadowAttack?: number;
  battleShadowHpRegenPerDay?: number;
  // 可自定义 Prompt
  battlePersonaQuestions?: string[];        // Persona 创建3问
  battleShadowPromptTemplate?: string;      // Shadow AI生成提示模板
  battleVictoryPromptTemplate?: string;     // 胜利叙事提示模板
}

export type SummaryPeriod = 'week' | 'month';

export interface SummaryPromptPreset {
  id: string;
  name: string;
  systemPrompt: string;
  isBuiltin?: boolean;
}

export interface PeriodSummary {
  id: string;
  period: SummaryPeriod;
  startDate: string; // ISO date string YYYY-MM-DD
  endDate: string;   // ISO date string YYYY-MM-DD
  label: string;     // e.g. "2026年第9周" / "2026年3月"
  content: string;   // AI generated markdown text
  promptPresetId: string;
  promptPresetName: string;
  totalPoints: number;
  attributePoints: Record<string, number>;
  activityCount: number;
  createdAt: Date;
}

// 本周目标
export type WeeklyGoalType = 'activity_count' | 'todo_count' | 'attr_points' | 'total_points';

export interface WeeklyGoalItem {
  type: WeeklyGoalType;
  attribute?: AttributeId;    // activity_count / attr_points 时指定属性
  target: number;
  current: number;
}

export interface WeeklyGoal {
  id: string;
  weekStart: string;          // YYYY-MM-DD（周一）
  weekEnd: string;            // YYYY-MM-DD（周日）
  goals: WeeklyGoalItem[];
  reward: string;             // 用户自定义奖励文案
  completed: boolean;
  completedAt?: Date;
  rewardAttribute?: AttributeId;  // 完成后用户选择的奖励属性
  rewardPoints?: number;          // 实际发放的奖励点数
  createdAt: Date;
}

// ── 逆影战场 ─────────────────────────────────────────────

export interface PersonaSkill {
  level: number;
  name: string;
  description: string;
  /** damage=直接伤害 | crit=暴击型伤害(10-30%双倍+失衡) | buff=提升下次伤害 | debuff=施加易伤 | charge=蓄力(下回合双倍) | heal=回复HP | attack_boost=攻击增益(伤害+3回合增伤) */
  type: 'damage' | 'buff' | 'debuff' | 'crit' | 'charge' | 'heal' | 'attack_boost';
  power: number;
  spCost: number;
}

export interface Persona {
  id: string;
  name: string;
  description?: string;
  attributePersonas?: Record<AttributeId, { name: string; description: string }>;
  equippedMaskAttribute?: AttributeId | null;
  createdViaAI: boolean;
  skills: Record<AttributeId, PersonaSkill[]>;
  createdAt: Date;
}

export interface Shadow {
  id: string;
  level: number;
  name: string;
  description: string;
  invertedAttributes: Record<AttributeId, string>;
  weakAttribute: AttributeId; // 弱点属性，对应技能伤害×1.5
  maxHp: number;
  currentHp: number;
  maxHp2?: number;
  currentHp2?: number;
  responseLines: string[];
  attackPower: number;
  lastHpRegenDate?: string;
  createdAt: Date;
}

export interface DefeatedShadowRecord {
  shadowName: string;
  level: number;
  breachDate: string;   // 识破日期 (ISO date string)
  defeatDate: string;   // 击败日期 (ISO date string)
  daysElapsed: number;  // 历时天数
}

export interface BattleState {
  id: 'current';
  shadowId: string;
  personaId: string;
  playerHp: number;
  playerMaxHp: number;
  lastBattleDate?: string;
  lastChallengeDate?: string;   // 本次挑战日期（每天只能挑战一次）
  sp: number;
  totalSpEarned: number;
  battleLog: BattleLogEntry[];
  status: 'idle' | 'in_battle' | 'shadow_phase2' | 'victory' | 'session_end';
  shadowsDefeated: number;
  lastDefeatedWeakAttribute?: AttributeId;
  defeatedShadowLog?: DefeatedShadowRecord[]; // 已击败阴影历史
  hpBonusFromDefeats?: number; // 击败Shadow累计获得的HP上限加成
}

export interface BattleLogEntry {
  id: string;
  date: string;
  playerActions: BattleAction[];
  shadowResponse: string;
  playerHpBefore: number;
  playerHpAfter: number;
  shadowHpBefore: number;
  shadowHpAfter: number;
}

export interface BattleAction {
  skillName: string;
  skillAttribute?: AttributeId; // 技能所属属性，用于判断弱点
  type: 'damage' | 'buff' | 'debuff' | 'crit' | 'charge' | 'heal' | 'attack_boost';
  value: number;
  spCost: number;
  isCrit?: boolean;      // 是否触发暴击
  isOffBalance?: boolean; // 是否造成失衡
}
