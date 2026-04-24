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
  /** 本地头像 data URL（上传的图片 base64） */
  avatarDataUrl?: string;
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
  category?: 'skill_unlock' | 'achievement_unlock' | 'level_up' | 'weekly_goal' | 'countercurrent' | 'shadow_defeat' | 'confidant';
  /** 同伴互动记录的关联同伴 id（category === 'confidant' 时填充） */
  confidantId?: string;
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
  /** 指定未来某日启用，格式 YYYY-MM-DD；日期未到时不会出现在今日任务 */
  startDate?: string;
  createdAt: Date;
  archivedAt?: Date;
  /** 任务被完成（达标）时的时间戳，用于区分"已完成"和"手动归档" */
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
    type: 'consecutive_days' | 'total_points' | 'attribute_level' | 'keyword_match' | 'all_attributes_max' | 'todo_completions' | 'weekly_goal_completions' | 'shadow_defeats' | 'confidants_at_level';
    value: number;
    attribute?: AttributeId;
    keywords?: string[];
    currentProgress?: number;
    /** 用于 'confidants_at_level'：至少需要达到的亲密度等级 */
    minLevel?: number;
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

/** @deprecated 被 DailyDivination 取代，保留类型仅为向前兼容旧 DB 记录 */
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

// ── 星象 / 塔罗 ─────────────────────────────────────────────

export type TarotOrientation = 'upright' | 'reversed';
export type LongReadingPeriod = 'recent' | 'midterm' | 'longterm';
/** 总体运势：大吉 / 中吉 / 小吉 / 凶 */
export type Fortune = 'great' | 'good' | 'small' | 'bad';

export interface DrawnCard {
  cardId: string;
  orientation: TarotOrientation;
}

/** 每日塔罗抽卡（替代旧的 DailyEvent） */
export interface DailyDivination {
  id: string;
  date: string;                 // YYYY-MM-DD (本地时区)
  drawnFrom: string[];          // 3 张候选 card id
  pickedIndex: number;          // 0 | 1 | 2
  cardId: string;               // 抽中的 card id (= drawnFrom[pickedIndex])
  orientation: TarotOrientation;
  effect: {
    attribute: AttributeId;
    multiplier: number;
  };
  narration: string;            // 运势主文案（AI 或离线）
  advice: string;               // 短建议
  /** 总体运势吉凶等级（AI 返回或程序兜底；旧记录可能为 undefined） */
  fortune?: Fortune;
  source: 'ai' | 'offline';
  createdAt: Date;
}

export interface LongReadingFollowUp {
  id: string;
  question: string;
  drawnFrom: string[];          // 3 候选
  cardId: string;               // 被抽中
  orientation: TarotOrientation;
  content: string;              // AI 解读（流式完成后保存）
  createdAt: Date;
}

/** 中长期占卜（持续 14 天，支持 1 次追问） */
export interface LongReading {
  id: string;
  question: string;
  period: LongReadingPeriod;
  drawnFrom: string[];          // 6 候选
  picked: DrawnCard[];          // 3 张抽中（顺序 = 牌阵位置）
  content: string;              // AI 主解读
  followUps: LongReadingFollowUp[];
  archived: boolean;            // 手动归档或过期自动归档
  createdAt: Date;
  /** YYYY-MM-DD — createdAt + 14 天 */
  expiresAt: string;
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
  summaryApiProvider?: 'openai' | 'deepseek' | 'kimi' | 'gemini' | 'minimax';
  summaryApiKey?: string;
  summaryApiBaseUrl?: string;
  summaryModel?: string;
  summaryPromptPresets?: SummaryPromptPreset[];
  summaryActivePresetId?: string;
  /**
   * 是否在"成长总结"里统计"特殊条目"——逆影战场击破、本周目标、逆流 等。
   * 默认 false（历史行为）；
   * 开启后这些条目会进入总结的数据统计与活动清单
   * 同伴（category=confidant）始终会被统计，不受本开关控制
   */
  summaryIncludeSpecial?: boolean;
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
  // 星象 / 塔罗
  astrologyEnabled?: boolean;               // 默认 true
  // 云同步：是否将同伴（confidants / confidantEvents）一并上传到云端
  // 默认 true；置为 false 时 push/pull 会跳过这两张表（本地依然完整保留）
  syncConfidantsToCloud?: boolean;
  /**
   * 云同步黑名单：列出不需要同步的表名。
   * 默认 undefined = 全部同步（except 由 syncConfidantsToCloud 控制的"同伴"两张表）。
   * 这里列出的表在 push/pull 时都会被跳过；本地依然完整保留。
   * 注意：以下核心表受保护，不允许加入黑名单：users / attributes / settings
   */
  syncExcludedTables?: string[];
  /**
   * AI 模型 API Key 是否随 settings 同步到云端。
   *  - true / undefined（默认）：push 会带上 summaryApiKey，pull 会接受云端的 key
   *  - false：push 时从 settings 行中剔除 summaryApiKey / openaiApiKey；
   *           pull 时若云端没有 key 则保留本地 key（不会被清空）
   * 设成 false 可以避免 API Key 离开本机（更安全），代价是新设备要重新填写。
   */
  syncCloudApiKey?: boolean;
  /**
   * 谏言冷却锚点：上一次"开启残响对话"的时间戳（ISO）。
   * 作为 3 天冷却的唯一真源 —— 不依赖 counselSessions / counselArchives 的存在与否，
   * 避免用户通过清空归档绕过冷却。
   */
  lastCounselStartedAt?: string;
  /**
   * 上次上传到 PB users.avatar 的本地头像指纹（短哈希）。
   * 用来在 pushAll 里跳过未变动的头像，避免每次同步都重新上传几百 KB。
   * 空串 = 当前云端无头像；undefined = 从未尝试过。
   */
  lastUploadedAvatarSig?: string;
  /**
   * COOP 物化时是否调 AI 生成"解读 / 未来"。
   * - true（默认）：调 AI；失败兜底用模板
   * - false：直接用 "Ta 写给你..." / 牌意模板
   * 用户在 ArcanaPickerForm 里勾选"不使用 AI 内容"会写为 false。
   */
  coopUseAIInterpretation?: boolean;
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

// ── 战斗状态效果（本地，不持久化） ─────────────────────────────

export type StatusKind =
  | 'poison'        // 中毒：每回合扣血，可叠层
  | 'mark'          // 猎手标记：受伤×mult
  | 'fear'          // 恐惧：概率跳过
  | 'calm'          // 镇静：攻击×mult
  | 'beguile'       // 魅惑：概率打自己
  | 'shield'        // 护盾：吸收下次伤害×mult
  | 'crit_buff'     // 玩家暴击率+
  | 'crit_debuff'   // Shadow 暴击率-
  | 'resonance';    // 共鸣：下次伤害×mult

export interface StatusEffect {
  kind: StatusKind;
  /** 剩余回合数，0 表示本回合结束后清除 */
  remainingTurns: number;
  /** 数值参数：DoT伤害 / 乘数 / 概率 / 护盾比例等 */
  value: number;
  /** 叠加层数，默认 1 */
  stacks: number;
  /** 触发来源的技能名（显示用） */
  sourceName?: string;
}

/** Shadow AI 决策类型 */
export type ShadowActionKind =
  | 'interrupt'   // 打断玩家蓄力
  | 'guard'       // 警戒：弱点伤害减半
  | 'enterBerserk' // 进入狂化
  | 'execute'     // 追击：必暴击
  | 'mock'        // 嘲讽（带DoT情境）
  | 'normal';     // 常规攻击

// ── 同伴 / Confidant ─────────────────────────────────────────
//
// 映射到 22 张大阿卡纳，每张牌每个用户唯一。
// 支持离线 / 在线两种模式；在线模式下可双向绑定（两位用户互为同伴）。
//
// 亲密度等级（0–10）解锁不同能力：
//   Lv 2 → 日常特殊技能（乘区外 +1 该属性加点）
//   Lv 4 → 战斗回复道具（用一次，恢复 HP 或 SP）
//   Lv 7 → 永久战斗技能（该属性技能 +1 固定伤害）
//   Lv 10 → 圆满，所有能力增强

export type ConfidantBuffKind =
  | 'daily_plus'    // 日常加点额外 +N（乘区外）
  | 'battle_heal'   // 战斗道具：回复 HP（每 2 天一次）
  | 'battle_sp'     // 战斗道具：回复 SP（每 2 天一次）
  | 'damage_plus';  // 永久战斗技能伤害 +N

export interface ConfidantBuff {
  id: string;
  kind: ConfidantBuffKind;
  attribute?: AttributeId;   // 绑定的属性（由 arcana.relatedAttribute 决定）
  value: number;             // 加成数值
  unlockAtLevel: number;     // 解锁所需亲密度等级
  title: string;             // 显示名称
  description: string;       // 描述
}

/** 同伴来源标识（离线自建 vs 绑定在线用户） */
export type ConfidantSource = 'offline' | 'online';

export interface ConfidantEvent {
  id: string;
  confidantId: string;
  date: string;                // YYYY-MM-DD
  type:
    | 'created'
    | 'intimacy_up'
    | 'intimacy_down'
    | 'level_up'
    | 'buff_unlocked'
    | 'conversation'
    | 'item_used'
    | 'archived'
    | 'decay'
    | 'bound'
    | 'unbound'
    | 'star_shift';
  delta?: number;              // 亲密点变化
  narrative?: string;          // AI / 系统生成的叙事描述（conversation 时为馆长解读）
  /** 用户在"今日互动"里原本输入的事件（仅 conversation 事件写入） */
  userInput?: string;
  /** AI 给出的相处建议（仅 conversation 事件写入；展开时与 narrative 分别展示） */
  advice?: string;
  createdAt: Date;
}

export interface Confidant {
  id: string;
  userId: string;              // 所属本地用户（user.id）
  /** 离线自建 / 在线绑定 */
  source: ConfidantSource;
  /** 在线模式下对方的云端用户 id（双向绑定时填充） */
  linkedCloudUserId?: string;
  /** 对方邮箱（在线模式下展示） */
  linkedEmail?: string;
  /** 在线同伴 —— 对方的公开档案快照（断网 / 对方长期离线仍可展示"上次同步的样子"） */
  linkedProfile?: CloudProfile;
  /** 用户给的称呼（朋友的名字 / 昵称） */
  name: string;
  /** 大阿卡纳 id，如 'fool' 'magician' 'empress'；一个用户同一张牌只能绑定一人 */
  arcanaId: string;
  /** 正位 / 逆位（AI 决定；影响叙事基调） */
  orientation: TarotOrientation;
  /** 用户输入的关系描述（与此人的关系、相处方式等） */
  description: string;
  /** AI 对牌面匹配理由的解读 */
  aiInterpretation: string;
  /** AI 给出的相处建议 / 下一步行动 */
  aiAdvice: string;
  /** 亲密等级（0–10） */
  intimacy: number;
  /** 当前等级内的亲密点进度（0 ~ pointsToNextLevel-1） */
  intimacyPoints: number;
  /**
   * 能力 buff 加成所指向的属性。
   * - 未设置 → 退化用 arcanaId 对应的 relatedAttribute（老档案 / 旧创建流程）
   * - 设置后 → 用户主动选择，可与塔罗花色不一致
   */
  skillAttribute?: AttributeId;
  /** 已解锁的能力快照（随 intimacy 提升追加） */
  buffs: ConfidantBuff[];
  /** "逆流" 模式是否启用（连续 3 天无互动 → 每日 -1） */
  decayEnabled: boolean;
  /**
   * 星移（Star Shift）可用次数。
   * 每次升级 +1，用于以当前最新状态重新生成 description / aiInterpretation / aiAdvice。
   * 每次使用 -1。
   */
  starShiftCharges?: number;
  /** 情感安全锁：归档前的二次确认标记（用户主动设置） */
  pinned?: boolean;
  /**
   * 自定义头像（data URL, jpeg）。长按塔罗牌后可上传替换。
   * ⚠ 本字段不会被同步到云端（sync.ts 会在 push 前 strip）——
   * 保证照片仅保留在本地。离线同伴始终允许自上传；在线同伴若绑定了云端账号，
   * 未来版本会自动拉取对方的官方头像覆盖此处。
   */
  customAvatarDataUrl?: string;
  /**
   * 仅在线同伴：是否在卡片上优先显示塔罗而非对方头像。
   * 默认 false（显示头像）；用户可在卡片长按菜单切换。
   */
  preferTarotOverAvatar?: boolean;
  /**
   * 仅在线同伴：用户已经"知道这条 COOP 被解除了"。
   *
   * 设为 true 时，loadSocial 的 reflectSeveredBonds 不再重复把这张卡自动归档 ——
   * 否则用户每次手动"恢复关系"都会被下一次同步立刻反向归档，陷死循环。
   *
   * true 的状态下卡片可以被恢复，但已经不再是"活的 COOP"：
   * 不再共享每日总结、不再拉对方资料；要重新建立 COOP 需走重新缔约流程。
   */
  bondSeverDismissed?: boolean;
  /**
   * 这对 COOP 曾共同击败的羁绊之影 —— 纪念图章列表。
   * 击败时本地追加一条；在 `CoopMemorialPanel` 里展示；对方同一时刻也会追加到他那张卡上。
   * 单向数据（从 coop_shadows 的 memorial_stamp 字段同步过来）。
   */
  coopMemorials?: CoopMemorialStamp[];
  /** 最近一次使用战斗回复道具的日期（每次使用后需要 2 天冷却） */
  itemUsedDate?: string;       // YYYY-MM-DD
  /** 今日是否领过日常加点奖励（避免重复触发） */
  dailyUsedDate?: string;      // YYYY-MM-DD
  /** 今日是否手动"互动"过（用于 1/天 的 AI 判断互动限制） */
  lastInteractionDate?: string; // YYYY-MM-DD
  /** 最后互动时间（用于 decay 与 "已离开" 判定） */
  lastInteractionAt?: Date;
  createdAt: Date;
  archivedAt?: Date;
}

// ── 谏言 / Counsel ───────────────────────────────────────────
//
// 客人可以向"知心"倾诉 Ta 在某段人际关系里的烦恼。
// - 每周（7 天）可用一次
// - 开启后 1 小时内可自由聊天；1 小时后消息自动清空（但冷却仍在）
// - 用户可随时归档：AI 生成 ≤100 字摘要，移入归档库
// - AI 会参考被 @ 的同伴的最近 15 条互动记录

export interface CounselMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** 用户消息中 @ 提到的同伴 id 列表 */
  mentions?: string[];
  /** AI 输出被用户打断 */
  interrupted?: boolean;
}

export interface CounselSession {
  id: string;
  /** YYYY-MM-DD（本地时区），用于周冷却判断 */
  startedDate: string;
  startedAt: Date;
  /** 1 小时后过期，过期后 messages 会被清空，但 session 本身保留用于显示状态 */
  expiresAt: Date;
  /** 进入该会话时 @ 提到过的所有同伴（union，用于归档元数据展示；不代表当前是否仍在上下文里） */
  mentionedConfidantIds: string[];
  /**
   * 每位同伴"最近一次被 @ 时所在的用户回合号"（用户消息序号，从 1 起算）。
   * AI 上下文注入只看"最近 10 回合内被 @ 过"的那些——超时会自动从 prompt 里掉出来，
   * 用户再次 @ 即刷新。预设 @（入场时选中的）会置为 1，让开场问候也能感知到 Ta。
   */
  mentionLastTurn?: Record<string, number>;
  messages: CounselMessage[];
  /** 消息过期后仍保留 session，用 expired = true 标记。UI 不再展示对话 */
  expired?: boolean;
  /** 若已归档到 counselArchives，记录归档时间（此后 session 被删除，字段其实写不到 DB 上） */
  archivedAt?: Date;
}

export interface CounselArchive {
  id: string;
  /** ≤100 字的摘要 */
  summary: string;
  /** 会话中 @ 提到的同伴 id（用于展示） */
  mentionedConfidantIds: string[];
  messageCount: number;
  /** 会话开始与结束时间，用于展示时间跨度 */
  sessionStartedAt: Date;
  sessionEndedAt: Date;
  createdAt: Date;
}

// ── 在线社交 / 好友 / 通知 ─────────────────────────────────
//
// 这些类型完全承载在云端（PocketBase 集合），本地不存 Dexie 表，
// 只在内存里保留 zustand state（useCloudSocialStore）。
// 断网 / 对方长期离线时，对方的 profile 快照会留在 Confidant.linkedProfile 里。

/** 对方的公开档案快照（会被缓存到 Confidant.linkedProfile） */
export interface CloudProfile {
  /** PB user.id */
  id: string;
  /** PB username（UserID，小写 3-18 位） */
  userId?: string;
  /** 展示名（本地 user.name 同步过来的） */
  nickname?: string;
  /** 云端头像（PB file URL） */
  avatarUrl?: string;
  /** 总等级（五维 level 之和） */
  totalLv?: number;
  /** 对方自己的属性自定义名 */
  attributeNames?: Partial<Record<AttributeId, string>>;
  /** 对方五维各自的 level */
  attributeLevels?: Partial<Record<AttributeId, number>>;
  /** 对方五维各自的 points */
  attributePoints?: Partial<Record<AttributeId, number>>;
  /** 五维 points 之和（冗余字段，避免每次都重新求和；对方推上来时已算好） */
  totalPoints?: number;
  /** 已解锁成就 + 已解锁技能的总数（不含 blessing_*） */
  unlockedCount?: number;
  /** 最近一次拉取到这份档案的时间（用于"上次同步 X 天前"的戳） */
  lastSyncedAt?: Date;
}

export type FriendshipStatus =
  | 'pending'   // 正在等待对方响应
  | 'linked'    // 已建立双向关系
  | 'rejected'  // 被拒绝（3 天冷却）
  | 'severed'   // 已解除（7 天冷却）
  | 'expired';  // 申请 21 天未响应自动作废

export interface Friendship {
  id: string;                 // PB record id
  userAId: string;            // 归一化后的较小 id 在前
  userBId: string;
  initiatorId: string;        // 发起方
  status: FriendshipStatus;
  message?: string;           // 申请留言（≤200 字）
  expiresAt?: Date;           // pending 状态的过期时间（申请后 21 天）
  respondedAt?: Date;         // linked / rejected / severed 的时间
  reRequestAfter?: Date;      // rejected → 3 天后可再申请
  reLinkAfter?: Date;         // severed → 7 天后可再建
  createdAt: Date;
  updatedAt: Date;
  /** 另一方的 profile 快照（按当前登录者反推出谁是"另一方"） */
  otherProfile?: CloudProfile;
}

export type NotificationType =
  | 'friend_request'          // 收到好友申请
  | 'friend_accepted'         // 对方接受了我的好友申请
  | 'friend_rejected'         // 对方拒绝了我的好友申请
  | 'prayer_received'         // 对方给我祈愿 (+3 SP)
  | 'prayer_reciprocal'       // 你和对方今天互相祈愿
  | 'coop_proposal'           // 收到 COOP 关系提议
  | 'coop_accepted'           // 对方接受了我的 COOP 提议
  | 'coop_rejected'           // 对方拒绝了我的 COOP 提议
  | 'coop_severed'            // 对方解除了 COOP 关系
  | 'event_logged'            // 对方在共享事件里记下了一笔
  | 'coop_event_logged'       // 对方在线 COOP 上记录了一次互动（共享事件 / 共享亲密度同步）
  | 'coop_shadow_spawned'     // 羁绊之影降临
  | 'coop_shadow_attacked'    // 对方对羁绊之影出手了
  | 'coop_shadow_defeated'    // 羁绊之影被封印
  | 'coop_shadow_retreated'   // 羁绊之影撤退（10 天未击败）
  | 'system';                 // 系统公告

export interface NotificationEntry {
  id: string;                         // PB record id
  userId: string;                     // 收件人 id（= 当前登录用户）
  type: NotificationType;
  fromId?: string;                    // 发件人 id（系统通知可为空）
  fromProfile?: CloudProfile;         // 展开后的发件人档案
  payload?: Record<string, unknown>;  // 附加数据：friendship_id / prayer_id / coop_link_id 等
  read: boolean;
  createdAt: Date;
}

// ── COOP 契约（在线同伴羁绊） ───────────────────────────
//
// 两位好友都同意把关系升级为"在线同伴"后，本地各自会多一张 Confidant(source='online')。
// 每一方都独立选择自己看到的那张塔罗 —— A 眼里 Ta 是什么，B 眼里 A 又是什么，
// 所以 bond 里同时保存 arcana_a / arcana_b。
//
// 生命周期：
//   pending  → 已发出提议，等对方响应（14 天未响应过期）
//   linked   → 双方各自确认，本地同伴卡已建立
//   rejected → 对方拒绝（3 天冷却）
//   severed  → 任一方主动解除（7 天冷却，旧同伴卡归档）
//   expired  → 自动过期

export type CoopBondStatus = 'pending' | 'linked' | 'rejected' | 'severed' | 'expired';

export interface CoopBond {
  id: string;                 // PB record id
  userAId: string;            // 归一化后字典序较小者
  userBId: string;
  initiatorId: string;        // 提议发起方
  status: CoopBondStatus;
  /** A 眼里的对方是哪张塔罗 */
  arcanaAId?: string;
  arcanaAOrientation?: TarotOrientation;
  /** B 眼里的对方是哪张塔罗（linked 之前可能为空） */
  arcanaBId?: string;
  arcanaBOrientation?: TarotOrientation;
  /** 两侧各自希望的初始亲密度（1-10）；物化时取 Math.floor((a+b)/2) */
  intimacyALevel?: number;
  intimacyBLevel?: number;
  /** 两侧各自选定的"能力加成属性"（物化时取任一侧的非空值，都有则取自己的） */
  skillAttributeA?: AttributeId;
  skillAttributeB?: AttributeId;
  /** 两侧各自的"逆流"开关；只有两边都为 true 时才真正衰减亲密度 */
  decayA?: boolean;
  decayB?: boolean;
  /** 提议 / 接受时附带的短消息 */
  messageA?: string;
  messageB?: string;
  expiresAt?: Date;
  respondedAt?: Date;
  reRequestAfter?: Date;
  reLinkAfter?: Date;
  createdAt: Date;
  updatedAt: Date;
  /** 另一方的 profile 快照 */
  otherProfile?: CloudProfile;
}

// ── 祈愿 / Prayer ────────────────────────────────────────────
//
// 在线好友之间互送的轻量小动作。
// - 每个"祈愿日"（本地 04:00 到次日 04:00）对同一人只能发送一次
// - 收件方本地战斗状态 +3 SP（无战斗状态时静默丢弃，不阻塞）
// - 双向互祈 → 系统通知 prayer_reciprocal 给双方

export interface Prayer {
  id: string;                 // PB record id
  fromId: string;             // 发起者 user.id
  toId: string;               // 接收者 user.id
  /** "祈愿日" key：YYYY-MM-DD，以本地 04:00 为日界 */
  day: string;
  createdAt: Date;
  /** 发起 / 接收方的档案快照（可选） */
  fromProfile?: CloudProfile;
  toProfile?: CloudProfile;
}

// ── 羁绊之影 · 联机暗影狩猎 ──────────────────────────────
//
// 挂在某对 COOP bond 上的专属 Boss。每逢新月/满月（~15 天一次）18:00 降临，
// 每天 18:00–次日 07:00 可攻击；10 天内未击败则撤退。
// 共享 HP，独立 Persona，共鸣印记提供 ×1.5 接力加成。

export type CoopShadowStatus = 'active' | 'defeated' | 'retreated';

export interface CoopShadow {
  id: string;                     // PB record id
  bondId: string;                 // → coop_bonds.id
  userAId: string;                // 两位讨伐者（冗余字段）
  userBId: string;
  shadowId: string;               // 取自 COOP_SHADOW_POOL 或 'coop:<archetype>'
  nameOverride?: string;          // 阶段 2：LLM 花名
  spawnedAt: Date;
  expiresAt: Date;                // spawnedAt + 10d
  hpMax: number;
  hpCurrent: number;
  status: CoopShadowStatus;
  weaknessAttribute: AttributeId; // 弱点属性（胜利奖励也是该属性）
  resonanceUntil?: Date;          // 共鸣印记过期时间（未过期 → 下个接力者吃 ×1.5）
  resonanceBy?: string;           // 印记由谁留下的（user id）
  /** 共享 COMBO 计数器 —— 弱点命中 +1，不因换手 / 未命中 而衰减 */
  comboCount: number;
  /** 每位讨伐者一次性的总攻击（All-Out）使用标记 */
  allOutByA: boolean;
  allOutByB: boolean;
  /** 识破标记：两人都点击"识破 SHADOW"后，战斗正式开启（入场动画 → 战斗主界面） */
  identifiedByA: boolean;
  identifiedByB: boolean;
  /**
   * 共享 buff 状态 —— buff 类技能命中即登记；伤害类攻击消耗 1 回合。
   * 同 kind 不叠加数值，只延长持续时间（加到 remainingTurns 上，封顶 6）。
   */
  sharedBuffs: SharedBuffs;
  defeatedAt?: Date;
  /** 胜利时写入：纪念图章 JSON（展示用） */
  memorialStamp?: CoopMemorialStamp;
}

/** 羁绊之影共享 buff —— 双方都吃 */
export interface SharedBuffs {
  /** 攻击强化：所有伤害 ×1.2 */
  attack_up?: { remainingTurns: number };
  /** 易伤：Boss 受到的所有伤害 ×1.15 */
  vulnerability?: { remainingTurns: number };
}

/** 一次 COOP 攻击的事件日志；落在 coop_attacks 集合 */
export interface CoopAttack {
  id: string;
  shadowId: string;               // → coop_shadows.id
  attackerId: string;             // user id
  /** 本地日 YYYY-MM-DD，用于 PB 唯一索引 (shadow_id, attacker, day) 硬性限速 */
  day: string;
  personaId: string;              // 本地 Persona id 快照
  personaName: string;
  skillKind: 'damage' | 'buff' | 'debuff' | 'crit' | 'charge' | 'heal' | 'attack_boost';
  skillName: string;
  damageRaw: number;              // 未加成前
  damageFinal: number;            // 加成后（共鸣 ×1.5 / 弱点 ×1.3 等）
  resonanceBonus: boolean;        // 本次是否吃到共鸣加成
  weaknessBonus: boolean;         // 本次是否吃到弱点加成
  counterDamage: number;          // Boss 反击造成的伤害
  createdAt: Date;
}

/**
 * 羁绊纪念图章 —— 胜利时生成并写到 coop_shadows.memorial_stamp（PB）+
 * 本地 Confidant.coopMemorials 里。在 CoopMemorialPanel 里展示。
 */
export interface CoopMemorialStamp {
  shadowId: string;
  shadowName: string;             // 展示用名
  weaknessAttribute: AttributeId;
  defeatedAt: string;             // ISO string
  /** 两位讨伐者的快照（名字即可） */
  winners: { userId: string; nickname: string }[];
  /** 自己这一方累计造成的伤害（用来算贡献百分比） */
  myDamage?: number;
  /** 双方合计伤害（= hpMax） */
  totalDamage?: number;
}
