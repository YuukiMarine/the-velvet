export type AttributeId = 'knowledge' | 'guts' | 'dexterity' | 'kindness' | 'charm';

export type AttributeNames = {
  knowledge: string;
  guts: string;
  dexterity: string;
  kindness: string;
  charm: string;
};

export type AttributeLevelTitles = Record<AttributeId, string[]>;

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
  category?: 'skill_unlock' | 'achievement_unlock' | 'level_up' | 'weekly_goal' | 'countercurrent' | 'shadow_defeat' | 'confidant' | 'calling_card_clear' | 'ledger' | 'terminal_clear';
  /** 同伴互动记录的关联同伴 id（category === 'confidant' 时填充） */
  confidantId?: string;
  levelUps?: Array<{
    attribute: AttributeId;
    fromLevel: number;
    toLevel: number;
  }>;
}

// ── F3 治疗终端 · 启动素材库 ──
export type WishStatus = 'active' | 'done' | 'archived';
export type TerminalProblemKind = 'long_term' | 'pressure';

export interface TerminalStepHistoryEntry {
  id: string;
  title: string;
  completedAt: string;
  sourceStepId?: string;
  via: 'manual' | 'terminal';
}

/**
 * 启动素材库条目。parentId 为空 → 一件卡住的事 / 想做到的方向；
 * 否则为该素材下的小步骤（可手动输入，或由 AI 拆分而来）。
 */
export interface Wish {
  id: string;
  /** 所属父级素材 id；为空表示自身即父级素材 */
  parentId?: string;
  title: string;
  note?: string;
  /** 父级素材类型：长期愿望 / 短期压力。旧数据缺省按长期愿望处理。 */
  kind?: TerminalProblemKind;
  /** 用户描述的当前进度、水平、压力位置；AI 续拆时会带入上下文。 */
  currentState?: string;
  /** 父级素材下的小步骤完成历史。完成小步时自动追加，供下一次 AI 拆解避重与续接。 */
  stepHistory?: TerminalStepHistoryEntry[];
  /** 轻绑定属性：完成该素材派生的 24h 小步卡时，加点落到此属性（未绑定则归「勇气」） */
  attribute?: AttributeId;
  /** 可选关联的 arcana（同伴）id */
  arcanaId?: string;
  status: WishStatus;
  /** 小步骤来源：手动输入 / AI 拆分 */
  source: 'manual' | 'ai';
  createdAt: Date;
  archivedAt?: Date;
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

/**
 * F2a 本地通知——单条提醒的「内容类型」。排程时各自读端上数据判断是否「可操作」：
 *  - tarot：今日塔罗未抽
 *  - todos：今日仍有未完成的每日待办
 *  - countercurrent：有属性明日将逆流扣减（连日无增长）
 *  - summary：有未读的成长总结
 *  - record：今天还没有任何记录（提醒回来记录）
 */
export type NotifContentType = 'tarot' | 'todos' | 'countercurrent' | 'summary' | 'record';

/**
 * F2a 本地通知——一个「每日时段」。每个时段在自己的时间点检查 contents 里
 * 列出的内容类型，挑出最值得提醒的一条以 Velvet 口吻推送。
 * 注：本地通知由系统提前排程，触发时 App 多半未运行；内容在「排程时」由端上
 * 快照烤好，靠「切前台必重排 + 条件已满足即撤销」保持新鲜（见 utils/notifications.ts）。
 */
export interface NotifSlot {
  id: string;
  /** 'HH:MM' 24h 本地时间 */
  time: string;
  enabled: boolean;
  /** 用户可见名，如「晨间序曲」「夜间结算」 */
  label: string;
  contents: NotifContentType[];
}

export interface Settings {
  id?: string;
  attributeNames: AttributeNames;
  levelThresholds: number[];
  /** 五维各等级的四字称号；下标 0 对应 Lv.1。缺失时使用默认兜底。 */
  attributeLevelTitles?: AttributeLevelTitles;
  /** 是否正在使用 AI 按当前属性名匹配过的系统成就/技能名称。 */
  aiMatchedPresetNames?: boolean;
  /** AI 覆写系统成就/技能名称前的本地快照；用于只撤回 AI 覆写，不覆盖用户自己的改名。 */
  aiPresetNameBackup?: {
    achievements: Record<string, string>;
    skills: Record<string, string>;
  };
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
  // ── F2a 本地通知 ─────────────────────────────────────────
  /** 本地通知总开关。默认 false = 关；开启需用户授予系统通知权限（仅原生平台生效）。 */
  notificationsEnabled?: boolean;
  /** 每日提醒时段列表；缺省时回退到 DEFAULT_SETTINGS 的两槽（晨/晚）。 */
  notificationSlots?: NotifSlot[];
  /** F2a 一次性回填标记：历史成长总结的 viewedAt 已补齐（视为已读），避免开启通知时旧总结被判未读。 */
  summaryViewedBackfillDone?: boolean;
  // ── F5 心相记账 ──
  /** 记账总开关。默认 undefined=开（功能可见、入口可见）；置 false 隐藏入口与数据。 */
  ledgerEnabled?: boolean;
  /** 货币代码，默认 'CNY'（¥）。 */
  currency?: string;
  /** F5 消费评估开关（默认关）：开后每笔支出可评「值 / 不值」，值得 +1 SP。 */
  spendEvalEnabled?: boolean;
  /** F5 记账奖励日封顶计数的锚日（YYYY-MM-DD）。 */
  ledgerRewardDate?: string;
  /** F5 今日已发记账 SP（日封顶 20）。 */
  ledgerSpToday?: number;
  /** F5 今日已发投资加点（日封顶 2）。 */
  ledgerAttrToday?: number;
  /** F5 今日已发 bonus SP（劳动/值得；日封顶 20，与普通记账 SP 分开计）。 */
  ledgerBonusSpToday?: number;
  /** F5 月度「不超预算」+10SP 已发放的月份（YYYY-MM），防重复发放。 */
  ledgerBudgetBonusMonths?: string[];
  /** F5 渠道选项（支付宝/微信…）；undefined 时回退 DEFAULT_CHANNELS，可手动增删。 */
  ledgerChannels?: string[];
  /** F5 收入来源选项（工资/兼职…）；undefined 时回退 DEFAULT_INCOME_SOURCES，可手动增删。 */
  ledgerIncomeSources?: string[];
  /** F5 自定义细分类目（用户自建二级标签），默认空。 */
  ledgerCategories?: string[];
  /** F5 记忆：上次使用的渠道（新支出草稿预选）。 */
  ledgerLastChannel?: string;
  /** F5 记忆：渠道选择器是否展开（超过折叠数时）。 */
  ledgerChannelsExpanded?: boolean;
  /** F5 每月预算重置 / 规划日（发薪日，1–28）；默认 1=自然月初。决定「新周期规划窗」何时弹。 */
  ledgerResetDay?: number;
  /** F5 启用「发薪日周期」（默认关）：开后预算/今日可花/规划窗/标签按 ledgerResetDay 切分的日期周期，而非日历月。 */
  ledgerPayCycleEnabled?: boolean;
  /** F5 已确认 / 略过的「新周期规划窗」周期 id（cycle 起始月 YYYY-MM）。 */
  ledgerCycleConfirmed?: string;
  /** F5 已达成「省钱挑战」并发放 +10SP 的月份（防重复发放）。 */
  ledgerChallengeWonMonths?: string[];
  /** F5 资产页「存款」条目是否隐藏（默认显示）。 */
  ledgerSavingsHidden?: boolean;
  // ── F3 无气力症治疗终端 ──
  /** 治疗终端总开关（默认关）：开后首页出现「终端」入口。常驻应急工具，不 gating。 */
  terminalEnabled?: boolean;
  /** 终端任务奖励日封顶锚日（YYYY-MM-DD）：每日首次完成才给属性点 + 弹幕机会，防刷。 */
  terminalRewardDate?: string;
  /** 已累积但未发送的「鼓励弹幕」机会数（在线发送随 F2b 后端批开放）。 */
  terminalDanmakuTokens?: number;
  // ── F6 万能记录 AI「黑猫」（Navigator） ──
  /** 最近一次「每日首开问候」的本地日期（YYYY-MM-DD）：跨天首开播完整问候，当日重开只简短招呼。 */
  navigatorLastGreetDate?: string;
  /** 当前激活的人格 preset id（缺省 = 内置黑猫）。切人格 = 开新会话。 */
  navigatorPresetId?: string;
  /** 拟真增强：回复走流式 + 按标点切碎气泡（句号删并断、——删并断、问叹/括号保留断；逗号不断），泡间 1.2s。 */
  navigatorImmersive?: boolean;
  /** 羁绊页视图：专辑墙（默认）/ 列表；右上角切换、持久记忆（PRD_V2.5_FINAL §5.3） */
  confidantViewMode?: 'wall' | 'list';
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
  /** （引擎v2）Shadow 全局攻击倍率%（金手指），默认 100；攻击基础值走 BOSS_ATTACK_BY_LEVEL 等级表 */
  battleAttackScale?: number;
  /** （批3）登塔回顾的影之评语（AI 50字点评）。默认 undefined=开；置 false 关闭。 */
  battleCommentEnabled?: boolean;
  // 可自定义 Prompt
  battleShadowPromptTemplate?: string;      // Shadow AI生成提示模板
  battleVictoryPromptTemplate?: string;     // 胜利叙事提示模板
  // 星象 / 塔罗
  astrologyEnabled?: boolean;               // 默认 true
  // 云同步：是否将同伴（confidants / confidantEvents）一并上传到云端
  // 默认 true；置为 false 时 push/pull 会跳过这两张表（本地依然完整保留）
  syncConfidantsToCloud?: boolean;
  /**
   * 云同步：是否将治疗终端「启动素材库」(wishes) 上传到云端。
   * F3 opt-in：默认 undefined / false = 不上云（仅存本地）；仅当用户显式勾选才 push/pull。
   */
  syncWishesToCloud?: boolean;
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
  /**
   * 「校直模式」——true 时全站 D0：斜轴归零、装饰动效静默。
   * 与 prefers-reduced-motion / 低帧率永久降级相互独立，三者任一命中即 D0
   * （UI_DESIGN_BOLD_V2.5.md §3）。设置 UI 随后续设置页迁移 PR 提供。
   */
  straightenMode?: boolean;
}

export type SummaryPeriod = 'week' | 'month';

export interface SummaryPromptPreset {
  id: string;
  name: string;
  systemPrompt: string;
  isBuiltin?: boolean;
}

/**
 * 归档总结里的"追问 Q&A"对：
 * - 用户在生成完总结后追问一次；问答内容随总结一起持久化到 db.summaries
 * - 旧记录里没有这两个字段是合法的（undefined），打开时按"未追问"渲染并保留追问入口
 */
export interface PeriodSummaryFollowUp {
  question: string;
  answer: string;
  createdAt: Date;
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
  /** v2.1+：归档时把追问问答一并存下；老记录此字段为 undefined */
  followUp?: PeriodSummaryFollowUp;
  /** v2.5+：用户首次打开该总结的时间；undefined = 未读（F2a「未读成长总结」提醒源）。 */
  viewedAt?: Date;
  /**
   * 重建追问所需的"原始 prompt 上下文"：
   * 不存就没法在归档里再次追问（要重新组 prompt 太麻烦），所以一同存下。
   * 老记录无此字段时，归档详情里"追问"按钮置灰并显示提示。
   */
  reqContext?: {
    baseUrl: string;
    model: string;
    /** system + user 原始消息（不含 assistant），重新追问时再 push 上次 streamedText 与新 question */
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  };
}

// ── CallingCard / 宣告卡（倒计时） ───────────────────────────
//
// 设计契机：参考 P5 的"预告函"——玩家"宣告"要拿下某件事，把它从抽象目标
// 拍打成一张带日期 / 任务清单的实体卡片。本系统支持三种模式：
//   - deadline：纯日期倒计时（高考 / 婚礼 / 截稿日）
//   - todos：完成一组手选的待办（最多 7 条）
//   - both：两者皆有，先达成的一头先关掉这张卡
//
// 上限语义（todos / both）：
//   - 关联的 repeatDaily todo → 当日是否完成 算一格
//   - 关联的单次 todo → 是否最终 completed (!isActive && completedAt) 算一格
//   - 进度 = 满足格子 / linkedTodoIds.length
//   - both 模式下：日期到了 OR 任务全清，先到的一方触发归档
//
// pinned 互斥：保存时 pinned=true 会把其它 unpin（store 层处理）

export type CallingCardMode = 'deadline' | 'todos' | 'both';
/**
 * 纹理类型（v2.1 起 tone 字段语义改为"纹理"，颜色全部跟随当前主题 primary）：
 *   - lines / grid / dots / plain：新值，纹理形态
 *   - red / blue / gold：legacy 兼容值（旧用户的卡片仍能正常展示，渲染时映射为 lines/grid/dots）
 */
export type CallingCardTone = 'lines' | 'grid' | 'dots' | 'plain' | 'red' | 'blue' | 'gold';

export interface CallingCard {
  id: string;
  /** 主标题：宣告"要做什么" */
  title: string;
  /** 副标题 / 宣告台词，可空。占位 placeholder 鼓励但不强制 */
  subtitle?: string;

  mode: CallingCardMode;

  /** deadline / both 模式：目标日期 (YYYY-MM-DD)，避 UTC 偏移用本地 key */
  targetDate?: string;
  /** 起算日期：默认创建日，用于算"已征途 X / 共 N 天"百分比 */
  startDate: string;

  /** todos / both 模式：关联的 todoId 顺序数组，最多 7 条 */
  linkedTodoIds?: string[];

  /** 视觉调性 —— 背景情绪色（红 / 蓝 / 金）；强调色随当前主题 primary */
  tone: CallingCardTone;
  /** 卡片图标 emoji，默认 ✦ */
  icon?: string;

  /** 钉到首页 HERO 卡（互斥，仅 1 张） */
  pinned: boolean;

  /** 归档 / 完成态 */
  archived: boolean;
  archivedAt?: Date;
  /**
   * 归档原因：
   *   - auto_date：targetDate 已过 → 自动归档（cut-in 文案"宣告 · 时之至"）
   *   - auto_todos：linked todos 全部满足 → 自动归档（cut-in 文案"宣告 · 达成"）
   *   - manual：用户在 ⋯ 菜单里手动归档
   */
  archiveReason?: 'auto_date' | 'auto_todos' | 'manual';

  /**
   * 完成结算屏是否已展示过。避免每次进 Dashboard 都重弹，
   * sweep 自动归档时第一次设 false → CutIn 渲染后置 true。
   */
  cutInShown?: boolean;

  /**
   * 是否已"留下记录"——cut-in 上点了"留下记录"会写一条 Activity，
   * 同一张卡片只允许写一次，避免重复刷成长记录。
   */
  ledgerWritten?: boolean;

  /**
   * F3 治疗终端小步卡标记。存在即表示这是「短路决策」生成的 24h 当前小步，
   * 与普通宣告卡区分：不占 pinned、被 sweepCallingCards 跳过（完成由用户手动
   * 「我做到了」触发 completeTerminalTask，不靠日期到期自动归档）。
   */
  terminal?: {
    sourceKind: 'wish' | 'todo';
    sourceId: string;
    /** 完成奖励落点属性；缺省 → 归「勇气」(guts) */
    attribute?: AttributeId;
    /** 叙事用的父级素材标题（wish 来源为父级素材；todo 来源可空） */
    goalTitle?: string;
    /** 起算 / 24h 到期时间（ISO） */
    startedAt: string;
    expiresAt: string;
  };

  createdAt: Date;
}

// ── F6 黑猫 Navigator · 持久化（Batch3） ──

/** 人格 preset：人格是皮肤，能力是骨架——personaPrompt 只影响口吻，功能协议不可触。 */
export interface NavigatorPreset {
  id: string;
  name: string;
  /** 内置剪影 id（'cat'|'toaster'|'bear'…）或本地头像 dataUrl（local-only，永不上云） */
  avatar?: string;
  personaPrompt: string;
  /** 切换/新会话开场的一句接管语（内置手写；自定义可空走通用） */
  handoffLine?: string;
  isBuiltin: boolean;
  createdAt: Date;
}

/** 会话行：每日每人格最多一条活跃会话（跨天清流、切人格开新会话） */
export interface NavigatorSessionRow {
  id: string;
  dateKey: string;
  presetId: string;
  /** compact 双产物：中性摘要（检索/续接用）+ 人格口吻版（注入用；人格绑定随会话归档） */
  compactedSummary?: string;
  personaSummary?: string;
  /** 被打断没说出口的段落（吞话回捞，跨重启存活） */
  swallowed?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** 消息行：与内存态 NavigatorMessage 对齐；draft 序列化存 JSON */
export interface NavigatorMessageRow {
  id: string;
  sessionId: string;
  role: 'cat' | 'user' | 'card' | 'summary';
  text?: string;
  draftJson?: string;
  cardStatus?: 'pending' | 'done' | 'cancelled';
  receipt?: string;
  createdAt: number;
}

/** 原子记忆（三源：对话沉淀/观察日记/手动；F8 图片记忆卡共用此表 source='image'；
 *  source='profile' 为特殊单行 = AI 维护的用户画像总览（常驻注入，用户可编辑） */
export interface NavigatorMemo {
  id: string;
  source: 'chat' | 'observation' | 'manual' | 'image' | 'profile';
  /** 中性事实文本（不带人格口吻——口吻在 prompt 组装时现场渲染） */
  text: string;
  /** 情绪元数据（"用户提起时很沮丧"），可选 */
  colorHint?: string;
  /** 1..5；置顶=拉满且免疫遗忘 */
  importance: number;
  /** 未完话头（一次性：被黑猫提起后清空） */
  followUp?: string;
  status: 'active' | 'archived';
  pinned?: boolean;
  createdAt: Date;
  lastRecalledAt?: Date;
  recallCount?: number;
}

/** F3 终端任务完成结算屏（TerminalClearCutIn）的载荷 */
export interface TerminalClearPayload {
  stepTitle: string;
  goalTitle?: string;
  /** 本次实际加点的属性；当日已领过封顶则为 undefined */
  rewardAttribute?: AttributeId;
  /** 本次实发属性点（0 = 当日已领过，仅叙事） */
  rewardPoints: number;
  /** 是否解锁了一次发弹幕机会 */
  danmakuGranted: boolean;
  /** 同一目标在本次会话内连续完成的次数，用于短期压力的连击反馈 */
  comboCount?: number;
  /** 同一父目标下还有排队的小步骤时，可从结算屏直接接下一击 */
  nextComboTask?: {
    stepTitle: string;
    sourceKind: 'wish';
    sourceId: string;
    attribute?: AttributeId;
    goalTitle?: string;
  };
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

// ── F5 心相记账 ──────────────────────────────────────────

/** 一笔记账的方向：支出 / 收入 / 总余额对账调整 */
export type LedgerDirection = 'expense' | 'income' | 'adjust';
/** 支出类目（生活场景；study=成长项，触发属性加点奖励） */
export type LedgerExpenseType = 'food' | 'transport' | 'shopping' | 'fun' | 'home' | 'study' | 'other';
/** 收入类 */
export type LedgerIncomeType = 'labor' | 'other';
/** 消费评估（可选，默认关）：这笔值不值 */
export type SpendWorth = 'worth' | 'notWorth';

export interface LedgerEntry {
  id: string;
  direction: LedgerDirection;
  /** 金额，正数；direction='adjust' 时可正可负（对账增减） */
  amount: number;
  /** 货币代码，如 'CNY'；默认随 settings.currency */
  currency: string;
  note?: string;
  /** 'YYYY-MM-DD' 本地日期 */
  date: string;
  source: 'manual' | 'ai';
  createdAt: Date;
  // ── 支出专属 ──
  type?: LedgerExpenseType;
  /** 二级类目（餐饮/交通/娱乐…），可选 */
  category?: string;
  /** 渠道（支付宝/微信/卡/现金…），可选 */
  channel?: string;
  /** 投资类自选加点属性（phase ③ 奖励用） */
  attribute?: AttributeId;
  /** 消费评估（phase ③） */
  evalWorth?: SpendWorth;
  /** 已登记为资产则回链（phase ②） */
  assetId?: string;
  /** 图片导入回链记忆卡（F8a） */
  sourceMemoId?: string;
  // ── 收入专属 ──
  incomeType?: LedgerIncomeType;
  // ── 奖励回收（删除时精确逆转）──
  /** 落账时实际发放的奖励快照（SP + 投资属性加点的活动 id），删除该条目时据此精确回收。 */
  reward?: {
    sp: number;
    attr?: { activityId: string; attribute: AttributeId; points: number };
  };
}

/** 月度预算（纪律层，独立于总余额）。一个 period 一条。 */
export interface Budget {
  id: string;        // = period
  period: string;    // 'YYYY-MM'
  monthlyLimit?: number;
  /** 每日额定预算；缺省时取 monthlyLimit / 当月天数 */
  dailyLimit?: number;
  /** 「省钱挑战」目标：本月想省下多少（预算−支出 ≥ 此值即达成，次月结算 +10SP） */
  savingsGoal?: number;
  /** 「省钱挑战」目标已修改次数（每月限 2 次） */
  savingsGoalEdits?: number;
  createdAt: Date;
}

/** 固定资产登记（phase ② 资产板块用；类型先定、表 v10 已建） */
export interface LedgerAsset {
  id: string;
  name: string;
  /** 类目 → 绑定开源图标（不存照片） */
  category: string;
  price: number;
  purchaseDate: string;  // 'YYYY-MM-DD'
  status: 'inuse' | 'idle' | 'soldout';
  /** 附加费用（如手机壳） */
  addOns?: Array<{ name: string; amount: number }>;
  /** 由某笔消费登记则回链 */
  linkedEntryId?: string;
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
  // ── 批3 · 养成扩展（全部可选，AI schema 不变） ──
  /** 熟练度：累计使用次数。星级由 numbers.masteryStars 派生（每星 +5% 加算） */
  mastery?: number;
  /** 解锁标记：只会 false→true（存量迁移按当时属性等级置位=不回锁；此后走双条件） */
  unlocked?: boolean;
  /** 迷思镶嵌（denormalized 快照；stoneId 指向 arsenal.myths；誓约技不可镶） */
  socket?: { stoneId: string; kind: MythKind; value: number };
  /** 誓约置换：本体已是誓约技；original 为被替换技能的完整快照（卸下时恢复） */
  oath?: { stoneId: string; kind: OathKind; original: PersonaSkill };
  /** 誓约技行为扩展（本地定义，不进 AI schema） */
  oathEffect?: OathEffectKind;
}

export interface Persona {
  id: string;
  name: string;
  description?: string;
  attributePersonas?: Record<AttributeId, { name: string; description: string }>;
  equippedMaskAttribute?: AttributeId | null;
  createdViaAI: boolean;
  skills: Record<AttributeId, PersonaSkill[]>;
  /** （批3）召唤台词：每属性一句，AI 批量生成后缓存；无 Key 用模板 */
  summonLines?: Partial<Record<AttributeId, string>>;
  createdAt: Date;
}

// ── 批3 · 战利品与养成（遗物/迷思/誓约/共鸣链/词缀） ────────────

/** 品质三档：残月 / 弦月 / 满月 */
export type LootQuality = 'waning' | 'half' | 'full';

export type RelicKind =
  | 'monocle'      // 猎手的单片镜：弱点伤害+
  | 'pocketwatch'  // 月光怀表：回合开始+SP
  | 'bulwark'      // 铁壁徽记：格挡时回复HP
  | 'venomfang'    // 蚀骨之牙：中毒伤害+
  | 'starchart'    // 观星者的星图：暴击率+
  | 'hourglass'    // 逆流沙漏：蓄力伤害额外+
  | 'bandage'      // 执念绷带：HP<30% 时受伤−
  | 'tuningfork'   // 共鸣音叉：加算段总和+
  | 'lightningrod' // 引雷针：1More 后下次伤害+
  | 'compass'      // 登塔者罗盘：塔内节点 SP 收益+
  | 'maskstrap'    // 面具挂绳：切换面具后首次攻击+
  | 'handwarmer';  // 影之怀炉：回响节点回复+

export interface RelicInstance {
  id: string;
  kind: RelicKind;
  quality: LootQuality;
  /** 词条值（百分比类存小数 0.08=8%；SP/HP 类存整数） */
  value: number;
  equipped?: boolean;
  obtainedAt: string; // YYYY-MM-DD
}

export type MythKind =
  | 'charge_echo'   // 蓄力余韵：命中后概率获得蓄力
  | 'life_siphon'   // 生命虹吸：命中回复HP
  | 'venom_bite'    // 淬毒之牙：附带1层中毒（仅 damage/crit 可镶）
  | 'keen_eye'      // 慧眼：该技能暴击率+
  | 'amp_circuit'   // 增幅回路：命中后下次伤害+
  | 'calm_ripple'   // 镇静涟漪：命中后概率施加镇静
  | 'flaw_insight'  // 破绽洞察：该技能弱点伤害+
  | 'moon_echo'     // 月光余响：该技能 SP 消耗−（下限1）
  | 'stagger_boost';// 失衡助推：该技能失衡充能+

export interface MythStone {
  id: string;
  kind: MythKind;
  quality: LootQuality;
  value: number;
  obtainedAt: string;
}

export type OathKind =
  | 'abyss'      // 深渊之誓：heal 25% 最大HP
  | 'storedbolt' // 蓄雷之誓：charge ×2.3
  | 'soulfire'   // 燃魂之誓：高威伤害，自损10%当前HP
  | 'shadowrot'  // 蚀影之誓：3层中毒+镇静
  | 'aegis'      // 铁壁之誓：护盾60%+视为完全格挡
  | 'moonlight'; // 月光之誓：+18 SP，每场1次

export type OathEffectKind =
  | 'heal_pct_max' | 'charge_23' | 'self_hp_cost' | 'poison_calm' | 'shield_block' | 'sp_once';

export interface OathStone {
  id: string;
  kind: OathKind;
  /** 已装备到哪个属性 Persona（每 Persona 限1；未装备 = undefined） */
  equippedAttr?: AttributeId;
  /** LLM 按人设命名缓存：attr → 名称/描述（重复装备不再调 AI） */
  namedCache?: Partial<Record<AttributeId, { name: string; description: string }>>;
  obtainedAt: string;
}

/** 共鸣链组合键：两属性按克制环顺序拼接 */
export type ChainKey =
  | 'knowledge+guts' | 'knowledge+dexterity' | 'knowledge+kindness' | 'knowledge+charm'
  | 'guts+dexterity' | 'guts+kindness' | 'guts+charm'
  | 'dexterity+kindness' | 'dexterity+charm' | 'kindness+charm';

export interface ResonanceChain {
  key: ChainKey;
  obtainedAt: string;
}

/** 战斗背包（挂在 BattleState 上，跟随备份/恢复，无需新 Dexie 表） */
export interface BattleArsenal {
  relics: RelicInstance[];
  myths: MythStone[];
  oaths: OathStone[];
  chains: ResonanceChain[];
  /** 生效中的共鸣链（可保有多条，同时生效1条） */
  activeChainKey?: ChainKey;
}

/** Shadow 词缀（本地零 AI）：强敌1条、心魔0-1条（异变加深每次+1） */
export type AffixKind =
  | 'stubborn'  // 顽固：HP+30%（生成时应用）
  | 'keen'      // 敏锐：暴击+10%
  | 'vengeful'  // 记仇：你曾下塔撤离→攻击+15%
  | 'thorns'    // 荆棘：反弹10%所受直接伤害
  | 'slippery'  // 湿滑：失衡条+50%长
  | 'swift'     // 迅捷：开场先制
  | 'eclipse'   // 月蚀：弱点隐藏（洞察或误打命中可揭示）
  | 'greedy';   // 贪婪：击败多掉 SP+50%

export interface Shadow {
  id: string;
  level: number;
  name: string;
  description: string;
  invertedAttributes: Record<AttributeId, string>;
  weakAttribute: AttributeId; // 弱点属性，对应技能伤害×1.5
  /** （引擎v2）属性向：承伤/输出的克制环判定用；存量数据缺省时由 id 稳定派生 */
  attribute?: AttributeId;
  /** （引擎v2）二形态更换后的弱点/耐性（跨 session 恢复战斗时需要） */
  phase2WeakAttribute?: AttributeId;
  phase2ResistAttribute?: AttributeId;
  maxHp: number;
  currentHp: number;
  maxHp2?: number;
  currentHp2?: number;
  responseLines: string[];
  attackPower: number;
  lastHpRegenDate?: string;
  /** （批3）词缀：显形时 0-1 条，月相日异变加深每次 +1 */
  affixes?: AffixKind[];
  createdAt: Date;
}

export interface DefeatedShadowRecord {
  shadowName: string;
  level: number;
  breachDate: string;   // 识破日期 (ISO date string)
  defeatDate: string;   // 击败日期 (ISO date string)
  daysElapsed: number;  // 历时天数
  // ── 批3 · 阴影档案馆扩展（存量记录缺省 = 首批藏品，字段留空） ──
  description?: string;
  affixes?: AffixKind[];
  /** 代表台词（响应池抽一句） */
  quote?: string;
  /** 击败时的你：五维总等级快照 */
  playerTotalLevel?: number;
  stratumLevel?: number;
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
  /** （批2）当日登塔 session 统计与临时增益 */
  towerSession?: TowerSessionStats;
  /** （批3）战斗背包：遗物/迷思/誓约/共鸣链 */
  arsenal?: BattleArsenal;
  /** （批3）曾下塔撤离/败退过（「记仇」词缀与记忆台词的事实源） */
  everRetreatedDown?: boolean;
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

// ── 影时间高塔 · 区层（引擎v2 批2）────────────────────────────
// 塔是唯一的、常在的；可解锁单位是"区层"（Lv1-5，层号全塔累计）。
// 单只 shadows 表记录 = 当前区层主影（沿用既有单例约定，避免大迁移）。

export type StratumNodeType = 'mob' | 'elite' | 'event' | 'echo' | 'chest' | 'boss';
export type StratumStatus = 'climbing' | 'cleared';

export interface MobSpec {
  name: string;                 // 本地命名池（零 AI）
  tier: 'mob' | 'elite';
  attribute: AttributeId;       // 属性向（克制环 / 剪影色）
  weakAttribute: AttributeId;
  maxHp: number;
  /** （批3）词缀：强敌必带 1 条，Shadow 无 */
  affixes?: AffixKind[];
}

export interface StratumNode {
  id: string;
  floor: number;                // 区层内层号 1..floors（boss 层 = floors）
  lane: number;                 // 0-2 横向位
  type: StratumNodeType;
  edges: string[];              // 可通往的上一层节点 id
  cleared: boolean;
  mob?: MobSpec;
  eventPoolId?: string;         // 事件池 id（src/battle/events.ts）
  lootSp?: number;              // 月匣：批2 掉 SP（物品池批3 接入）
}

export interface TowerStratum {
  id: string;
  level: number;                // 区层 1-5
  name: string;                 // AI 生成 "xx之域"（迁移/无 Key 用模板名）
  description: string;
  themeAttribute?: AttributeId; // 主影主题属性（65% 短板逻辑批4 接入）
  createdWeekKey: string;       // 显形周（周一为界）
  lastDeepenWeekKey?: string;   // 最近一次月相日加深的周键
  baseFloor: number;            // 全塔累计起始层号（区层2 ≈ 从 13F 起）
  floors: number;               // 本区层层数（10-12）
  nodes: StratumNode[];
  currentNodeId: string | null; // null = 区层入口（尚未踏入第 1 层）
  deepenCount: number;
  status: StratumStatus;
  createdAt: Date;
}

/** 当日登塔 session 统计（登塔回顾用；挂在 BattleState 上跨杀进程持久） */
export interface TowerSessionStats {
  dateKey: string;
  startFloor: number;
  floorsClimbed: number;
  nodesCleared: number;
  mobsDefeated: number;
  damageDealt: number;
  maxSingleHit: number;
  weaknessHits: number;
  spEarned: number;
  /** 本次登塔的临时增益（事件/回响来源；伤害类进引擎加算段） */
  buffs: Array<{ id: string; label: string; addPct?: number }>;
  /** 事件「被夺先手」：下一场战斗 Shadow 先攻（战斗开场消费并清除） */
  pendingFirstStrike?: boolean;
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
  | 'resonance'     // 共鸣：下次伤害×mult
  | 'atk_up'        // （引擎v2）攻击强化：攻击×mult
  | 'guard_stance'; // （引擎v2）警戒姿态：受伤×mult

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
  /** level_up 事件到达的等级；旧数据可从 narrative 的 Lv.X 兼容解析 */
  toLevel?: number;
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
  /** 对方五维各等级的四字称号；下标 0 对应 Lv.1。 */
  attributeLevelTitles?: Partial<Record<AttributeId, string[]>>;
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
