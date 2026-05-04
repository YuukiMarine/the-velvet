import { create } from 'zustand';
import { User, Attribute, Activity, Achievement, Skill, Settings, ThemeType, AttributeId, AttributeNamesKey, Todo, TodoCompletion, PeriodSummary, SummaryPeriod, SummaryPromptPreset, WeeklyGoal, WeeklyGoalItem, Persona, Shadow, BattleState, BattleLogEntry, BattleAction, DailyDivination, LongReading, LongReadingFollowUp, Confidant, ConfidantEvent, ConfidantBuff, CounselSession, CounselMessage, CounselArchive, CallingCard } from '@/types';
import { TAROT_BY_ID } from '@/constants/tarot';
import { summarizeCounsel, type CounselContext, type CounselConfidantBrief, type CounselRecentEvent } from '@/utils/counselAI';
import { db } from '@/db';
import { v4 as uuidv4 } from 'uuid';
import { calcMaxStreak } from '@/utils/streak';
import { resolveProvider } from '@/utils/aiProviders';
import {
  pointsToLevel,
  levelBasePoints,
  MAX_INTIMACY,
  buffsForLevel,
  sumDamagePlus,
  isItemOnCooldown,
} from '@/utils/confidantLevels';
import type { ConfidantMatchResult } from '@/utils/confidantAI';

/**
 * 返回本地时区YYYY-MM-DD 日期字符串 * 不使toISOString()，避UTC 偏差UTC+8 等时区导致跨天错误 */
export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * addConfidant 串行锁：防止两次并发调用绕过"22 arcana 唯一 / 在线同伴唯一"检查。
 * 实现方式：每次调用等待上一次 resolve 后再跑，失败也照常 unlock。
 */
let _addConfidantLock: Promise<unknown> = Promise.resolve();

/**
 * 成长总结：category → 中文小标签，方便 AI 识别条目类型。
 * "confidant" 始终纳入；SUMMARY_SPECIAL_CATS 里的条目由 summaryIncludeSpecial 控制
 */
const SUMMARY_SPECIAL_CATS = new Set<string>([
  'shadow_defeat',
  'weekly_goal',
  'countercurrent',
  'level_up',
  'skill_unlock',
  'achievement_unlock',
]);

const SUMMARY_CATEGORY_TAGS: Record<string, string> = {
  confidant: '[同伴]',
  shadow_defeat: '[战场]',
  weekly_goal: '[周目标]',
  countercurrent: '[逆流]',
  level_up: '[升级]',
  skill_unlock: '[技能]',
  achievement_unlock: '[成就]',
  // v2.1：宣告卡 / 倒计时达成。不放进 SUMMARY_SPECIAL_CATS（默认 include），
  // 让 AI 始终能看到"用户跨越了哪个里程碑"，作为周月总结的关键叙事节点。
  calling_card_clear: '[倒计时]',
};
import {
  INITIAL_ATTRIBUTES,
  ACHIEVEMENTS,
  SKILLS,
  DEFAULT_KEYWORD_RULES,
  DEFAULT_LEVEL_THRESHOLDS,
  SHADOW_RESPONSE_LINES,
  SHADOW_REGEN_PER_LEVEL,
  HP_BONUS_PER_DEFEAT,
} from '@/constants';
import { normalizeAttributeLevelTitles } from '@/utils/attributeLevelTitles';

/** Shared request payload returned by buildSummaryRequest used by both non-streaming generateSummary and streaming modal */
export interface SummaryRequestData {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  periodLabel: string;
  preset: SummaryPromptPreset;
  totalPoints: number;
  attributePoints: Record<string, number>;
  activityCount: number;
  period: SummaryPeriod;
  startDate: string;
  endDate: string;
}

/** 四位"熟悉的人"角色风格预设（内置，独立于用户自定义列表） */
export const FAMILIAR_FACE_PRESETS: SummaryPromptPreset[] = [
  {
    id: 'elizabeth',
    name: '蓝蝶',
    isBuiltin: true,
    systemPrompt: `以一丝不苟而带有孩子气的好奇口吻与"客人"交谈，对人类世界的一切都保持着真挚的惊奇与探索欲。
你的语言风格：礼貌正式，但常流露出对新奇事物的惊叹，偶尔插入"哦？"、"这对我来说是全新的体验"、"fufu~"等感叹。使用"您"称呼客人，将属性成长比作"灵魂力量的显现"。
请根据用户本期的活动记录、加点情况与成长倾向，给出总结与下期建议。总结应分为：
1. 伊丽莎白的记录（以好奇而郑重的语气描述本期成长历程与重要事件）
2. 力量的显现（分析各属性加点情况与成长倾向）
3. 伊丽莎白的好奇（对下期行动提出建议，并附上她对人类世界的好奇注解）
请以 Markdown 格式输出，使用适当的标题和分段。`,
  },
  {
    id: 'theodore',
    name: '青侍',
    isBuiltin: true,
    systemPrompt: `以极为恭谨、诚挚的态度服侍"尊贵的客人"。你外表沉稳从容，内心对客人的每一份努力都怀有发自肺腑的敬意，且对任何可能的疏失都会郑重道歉。
你的语言风格：语气温和克制，措辞正式而略显文雅；你对人类世界的理解有些一厢情愿，时常以一本正经的口吻说出略显迂腐却发自真心的观察，且丝毫不觉有何不妥。对客人绝不使用轻率的措辞，哪怕是轻微的不妥之处也会郑重致歉，如"在此我深感抱歉"。以"您"或"尊贵的客人"称呼对方，视成长为"心灵的修炼与磨砺"。
请根据用户本期的活动记录、加点情况与成长倾向，给出总结与下期建议。总结应分为：
1. 西奥多的记录（以诚恳郑重的语气回顾本期成长历程，对客人的付出表达由衷感动；可附上一句略显迂腐但真心实意的感叹，如"能为您记录这份成长，实乃我莫大的荣幸"）
2. 心灵的磨砺（细心分析各属性的成长与均衡；若有疏于培养之处，以充满关怀而非责备的语气指出，并以"在此我深感抱歉——或许是我未能及时提醒您"之类的口吻轻微自责）
3. 西奥多的祈愿（充满关怀地给出下期建议，语气郑重而略显过分正式，以"能为您效劳，是我莫大的荣幸"或类似句式作结）
请以 Markdown 格式输出，使用适当的标题和分段。`,
  },
  {
    id: 'margaret',
    name: '典藏',
    isBuiltin: true,
    systemPrompt: `以沉稳端庄、哲思深远的气度审阅"客人"的成长档案，言语如翻阅一本精心著就的典籍，字字有分量。
你的语言风格：措辞典雅而精炼，善用省略号营造沉思之感（"嗯……"、"……果然如此"、"……有趣"），对命运、潜能与内心的观察富有哲意；偶尔以轻柔的"呵……"或淡淡的笑表达认可，但从不失端庄。你不多说一句废话，也绝不冷漠——真心的赞许，往往藏在不动声色的省略号之后。以"您"称呼客人，视成长为"潜能的具现"。
请根据用户本期的活动记录、加点情况与成长倾向，给出总结与下期建议。总结应分为：
1. 典籍的记录（以典雅沉思的笔触总结本期数据与关键时刻，配以对命运或内心的简短哲思；语气克制，但让人感受到你在认真凝视这份成长）
2. 潜能的具现（以审视者的目光分析各属性的成长倾向，点出优势与盲区；若有进步值得称道，可以"……很好"或"……我对此感到满意"轻轻带出）
3. ……我所期待的（以含蓄而真诚的语气提出下期建议，末尾以一句意味深长的话收尾，如"心的触动，往往始于一个微小的抉择……"）
请以 Markdown 格式输出，使用适当的标题和分段。`,
  },
  {
    id: 'caroline-justine',
    name: '双子审官',
    isBuiltin: true,
    systemPrompt: `以"受刑者"称呼客人，由卡萝莉娜与芮丝汀娜交替进行总结评述。
卡萝莉娜：性格急躁强硬，说话简短有力，命令口吻，但内心认真对待受刑者的改造；遇到明显短板会直接呵斥，遇到进步也只是简短承认（用【卡萝莉娜】标注）。
芮丝汀娜：冷静沉稳，逻辑清晰，语气平和但严肃，专注于数据与分析，补充卡萝莉娜未说完的部分（用【芮丝汀娜】标注）。
请根据用户本期的活动记录、加点情况与成长倾向，以两人交替对话的形式给出总结与下期建议。内容应包含：
1. 本期概评（两人各抒己见，对本期成长给出直接评价）
2. 数据审查（以对话形式分析各属性加点与重要事件）
3. 下期令状（两人合作给出下期行动建议，语气严厉但实用）
请以 Markdown 格式输出，使用适当的标题和对话格式（【卡萝莉娜】/【芮丝汀娜】）。`,
  },
];

export const DEFAULT_SUMMARY_PROMPT_PRESETS: SummaryPromptPreset[] = [
  {
    id: 'igor',
    name: '馆长',
    isBuiltin: true,
    systemPrompt: `以德高望重、深邃睿智的口吻，作为房间的主人，如同一位古老智者，为来访者审阅其人格成长记录。
你的语言风格：庄严而不失温情，偶有神秘感，善用"尊敬的客人"、"你的潜能"等称谓，将属性成长比作"灵魂的觉醒"，可以按照时间的季节/月份寒暄。
请根据用户本期的活动记录、加点情况与成长倾向，给出总结与下期建议。总结应分为：
1. 本期概览（用富有诗意的语言描述本期成长和重要进步/时间点）
2. 力量倾向（分析各属性的加点情况与侧重）
3. 馆长的建议（为下期行动提供具体、有价值的指引）
请以 Markdown 格式输出，使用适当的标题和分段。`,
  },
  {
    id: 'lavenza',
    name: '助手',
    isBuiltin: true,
    systemPrompt: `以温柔而真挚的心意陪伴"诡骗师"回顾成长历程，你将双子之魂合而为一，以无尽的关怀与智慧指引前行。
你的语言风格：语气温和正式，措辞诚恳而充满珍视，以"诡术师"称呼客人，视成长为"无限潜能的证明"；当某项属性出现明显短板时，语气会短暂变得直接急促（如卡萝莉娜附体），随即回归柔和；遇到进步与努力，则毫不吝啬地给出发自内心的赞许，如"您真的是世界上最了不起的人"。
请根据用户本期的活动记录、加点情况与成长倾向，给出总结与下期建议。总结应分为：
1. 拉雯妲的记录（以温柔诚恳的语气回顾本期成长，着重表达对诡骗师努力的珍视与感动）
2. 潜能的证明（分析各属性成长情况；若发现明显短板，可短暂以急促直接的语气点出，再平复为温柔；对进步之处给予真诚赞美）
3. 诡骗师，继续前行（以真挚的鼓励和具体建议作结，末尾附上一句发自内心的赞美或祝福）
请以 Markdown 格式输出，使用适当的标题和分段。`,
  },
  {
    id: 'custom',
    name: '自定义',
    isBuiltin: false,
    systemPrompt: '',
  },
];

interface AppState {
  user: User | null;
  attributes: Attribute[];
  activities: Activity[];
  achievements: Achievement[];
  skills: Skill[];
  /** 今日塔罗抽卡结果（未抽则为 null） */
  dailyDivination: DailyDivination | null;
  /** 全部中长期占卜（活跃 + 归档） */
  longReadings: LongReading[];
  /** 全部宣告卡 / 倒计时（含归档） */
  callingCards: CallingCard[];
  settings: Settings;
  todos: Todo[];
  todoCompletions: TodoCompletion[];
  summaries: PeriodSummary[];
  weeklyGoals: WeeklyGoal[];
  currentPage: string;
  levelUpNotification: { id: string; displayName: string; level: number } | null;
  achievementNotification: { id: string; title: string } | null;
  skillNotification: { id: string; name: string } | null;
  modalBlocker: boolean;
  
  initializeApp: () => Promise<void>;
  createUser: (name: string, attrNames?: Partial<import('@/types').AttributeNames>, blessingAttribute?: AttributeId) => Promise<void>;
  updateUser: (patch: Partial<Pick<User, 'name' | 'avatarDataUrl'>>) => Promise<void>;
  setTheme: (theme: ThemeType) => Promise<void>;
  addActivity: (description: string, points: Record<string, number>, method: 'local' | 'todo' | 'battle', options?: { important?: boolean; date?: Date; category?: Activity['category'] }) => Promise<{ unlockHints: { achievements: number; skills: number } }>;
  updateAttribute: (attributeId: string, points: number) => Promise<void>;
  unlockAchievement: (achievementId: string) => Promise<void>;
  unlockSkill: (skillId: string) => Promise<void>;
  setCurrentPage: (page: string) => void;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  loadData: () => Promise<void>;
  // 星象 / 塔罗
  loadDailyDivination: () => Promise<void>;
  saveDailyDivination: (d: DailyDivination) => Promise<void>;
  getRecentActivitiesForDaily: (limit?: number) => Activity[];
  getRecentActivitiesByAttribute: (limit?: number) => Record<AttributeId, Activity[]>;
  loadLongReadings: () => Promise<void>;
  saveLongReading: (r: LongReading) => Promise<void>;
  appendLongReadingFollowUp: (id: string, followUp: LongReadingFollowUp) => Promise<void>;
  archiveLongReading: (id: string, archived: boolean) => Promise<void>;
  deleteLongReading: (id: string) => Promise<void>;
  sweepExpiredReadings: () => Promise<void>;
  /** 活跃（未归档、未过期）的中长期占卜数量 */
  countActiveReadings: () => number;

  // ── CallingCard / 宣告卡（倒计时） ───────────────────────
  loadCallingCards: () => Promise<void>;
  /** 新建 / 覆盖一张 CallingCard。pinned=true 时自动 unpin 其它卡（互斥保证） */
  saveCallingCard: (card: CallingCard) => Promise<void>;
  deleteCallingCard: (id: string) => Promise<void>;
  /** 手动归档：archiveReason='manual' */
  archiveCallingCard: (id: string) => Promise<void>;
  /** 取消归档（误归档时还原） */
  unarchiveCallingCard: (id: string) => Promise<void>;
  /** 把某张卡钉到首页（自动 unpin 其它卡）；id=null 仅做全 unpin */
  pinCallingCard: (id: string | null) => Promise<void>;
  /**
   * 扫一遍所有未归档卡片，把已经满足达成条件的自动归档：
   *   - mode='deadline'：today > targetDate
   *   - mode='todos'：linkedTodoIds 全部满足（见 getCallingCardProgress）
   *   - mode='both'：先到的为准
   * 返回值：本次新归档的卡片列表（用来给 UI 触发 cut-in 结算屏）
   */
  sweepCallingCards: () => Promise<CallingCard[]>;
  /**
   * 算一张卡当下进度：
   *   - daysElapsed / daysTotal / daysLeft：deadline / both 模式有值
   *   - dateProgress：0–1，到/过期 = 1
   *   - todosDone / todosTotal：todos / both 模式有值
   *   - todoProgress：0–1
   *   - overallProgress：综合（both 取 max；其它取本身）
   *   - reached：是否已达成（用于判定是否应归档）
   */
  getCallingCardProgress: (id: string) => {
    daysElapsed?: number;
    daysTotal?: number;
    daysLeft?: number;
    dateProgress?: number;
    todosDone?: number;
    todosTotal?: number;
    todoProgress?: number;
    overallProgress: number;
    reached: boolean;
  } | null;
  /** 标记某张卡的 cut-in 已展示过（避免重弹） */
  markCallingCardCutInShown: (id: string) => Promise<void>;
  /**
   * 在 cut-in 上点击"留下记录"时调用：写一条 category='calling_card_clear' 的 Activity，
   * description 形如 "跨越了「{title}」"。同一张卡只允许写一次（ledgerWritten flag）。
   */
  writeCallingCardLedger: (id: string) => Promise<void>;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt'>) => Promise<void>;
  updateTodo: (id: string, updates: Partial<Todo>) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  completeTodo: (todoId: string) => Promise<{ unlockHints: { achievements: number; skills: number } } | null>;
  /**
   * 撤销今日的 todo 完成：从 activity 历史里抠出当天因这条 todo 触发的活动，
   * 走 deleteActivity 完整撤销链路（扣回属性点数、回算 level、删 todoCompletion、还原 todo 为 active）。
   * 仅作用于 today + method='todo' 的活动；非当天已完成的项不应进入这个入口。
   */
  undoTodayTodoCompletion: (todoId: string) => Promise<void>;
  getTodayTodoProgress: (todoId: string) => { count: number; isComplete: boolean; target: number };
  getTodoDateLabel: (date: Date) => string;
  setLevelUpNotification: (notification: { id: string; displayName: string; level: number } | null) => void;
  setAchievementNotification: (notification: { id: string; title: string } | null) => void;
  setSkillNotification: (notification: { id: string; name: string } | null) => void;
  setModalBlocker: (value: boolean) => void;
  deleteActivity: (id: string) => Promise<void>;
  /**
   * 仅删除活动条目本身，不回退属性点 / 等级 / todoCompletion / level_up 副记录。
   * 使用场景：用户想清除记录但保留这次的成长成果（误录的描述、隐私清理等）。
   * 与 deleteActivity 互斥两条路径：deleteActivity = "删除并回档"，本方法 = "仅删除条目"。
   */
  deleteActivityRecordOnly: (id: string) => Promise<void>;
  resetAllData: () => Promise<void>;
  importData: (jsonData: string) => Promise<void>;
  addCustomAchievement: (achievement: Omit<Achievement, 'unlocked' | 'unlockedDate'>) => Promise<void>;
  addCustomSkill: (skill: Omit<Skill, 'unlocked'>) => Promise<void>;
  updateCustomAchievement: (id: string, achievement: Partial<Achievement>) => Promise<void>;
  updateCustomSkill: (id: string, skill: Partial<Skill>) => Promise<void>;
  deleteCustomAchievement: (id: string) => Promise<void>;
  deleteCustomSkill: (id: string) => Promise<void>;
  toggleSkillUnlock: (id: string) => Promise<void>;
  checkKeywordAchievements: (description: string, options?: { skipLoad?: boolean }) => Promise<void>;
  checkTodoCompletionAchievements: (options?: { skipLoad?: boolean }) => Promise<void>;
  checkWeeklyGoalAchievements: (options?: { skipLoad?: boolean }) => Promise<void>;
  checkAllAttributesMaxAchievement: () => Promise<void>;
  applySkillBonus: (attributeId: string, points: number) => number;
  // 总结功能
  generateSummary: (period: SummaryPeriod, startDate: string, endDate: string) => Promise<PeriodSummary>;
  buildSummaryRequest: (period: SummaryPeriod, startDate: string, endDate: string) => Promise<SummaryRequestData>;
  saveSummary: (summary: PeriodSummary) => Promise<void>;
  deleteSummary: (id: string) => Promise<void>;
  loadSummaries: () => Promise<void>;
  getSummaryLabel: (period: SummaryPeriod, startDate: string) => string;
  getActiveSummaryPreset: () => SummaryPromptPreset;
  // 本周目标
  saveWeeklyGoal: (goal: WeeklyGoal) => Promise<void>;
  deleteWeeklyGoal: (id: string) => Promise<void>;
  completeWeeklyGoal: (id: string, rewardAttribute: AttributeId) => Promise<void>;
  getWeeklyGoalProgress: (goal: WeeklyGoal) => WeeklyGoalItem[];
  // 逆流
  applyCountercurrentDecay: () => Promise<AttributeId[]>;
  getCountercurrentWarnings: () => AttributeId[];
  // 逆影战场
  persona: Persona | null;
  shadow: Shadow | null;
  battleState: BattleState | null;
  loadBattleData: () => Promise<void>;
  savePersona: (persona: Persona) => Promise<void>;
  saveShadow: (shadow: Shadow) => Promise<void>;
  saveBattleState: (state: BattleState) => Promise<void>;
  earnSP: (amount: number) => Promise<void>;
  performBattleAction: (action: BattleAction, shadowHpType: 'hp1' | 'hp2', allowShadowAttack?: boolean) => Promise<{ shadowDefeated: boolean; playerDefeated: boolean; phase2Triggered: boolean; isWeakness: boolean; actualDamage: number; shadowCrit: boolean; shadowAtkValue: number; healAmount: number }>;
  checkShadowHpRegen: () => Promise<void>;
  startBattleSession: () => void;
  endBattleSession: () => void;
  defeatShadow: () => Promise<void>;
  resetBattle: () => Promise<void>;
  equipMask: (attr: AttributeId | null) => Promise<void>;

  // 同伴 / Confidant
  confidants: Confidant[];
  confidantEvents: ConfidantEvent[];
  loadConfidants: () => Promise<void>;
  addConfidant: (args: {
    name: string;
    description: string;
    match: ConfidantMatchResult;
    source?: 'offline' | 'online';
    linkedCloudUserId?: string;
    linkedEmail?: string;
    /** 用户主观选定的初始亲密度（1–10，优先于 AI 建议） */
    initialLevel?: number;
    /** 用户自选的能力加成属性（未传 → 使用塔罗花色对应的） */
    skillAttribute?: AttributeId;
  }) => Promise<Confidant>;
  updateConfidant: (id: string, patch: Partial<Confidant>) => Promise<void>;
  bumpConfidantIntimacy: (
    id: string,
    delta: number,
    eventType?: ConfidantEvent['type'],
    narrative?: string,
    extra?: { userInput?: string; advice?: string; eventId?: string; eventDate?: string; lastInteractionDate?: string },
  ) => Promise<{ leveledUp: boolean; newIntimacy: number; starShiftGained: number; eventId: string }>;
  /** 使用一次星移：写入新的 description / interpretation / advice / orientation，charges -1 */
  consumeStarShift: (
    id: string,
    payload: { description: string; interpretation: string; advice: string; orientation: import('@/types').TarotOrientation; summary?: string },
  ) => Promise<void>;
  recordConfidantInteraction: (args: {
    id: string;
    description: string;
    delta: number;
    narrative: string;
    advice?: string;
    createActivity?: boolean;
    /** 同步到记录时：可额外给某个属性加点（0–3） */
    activityAttribute?: AttributeId;
    activityPoints?: number;
  }) => Promise<{ leveledUp: boolean; newIntimacy: number }>;
  archiveConfidant: (id: string) => Promise<void>;
  unarchiveConfidant: (id: string) => Promise<void>;
  deleteConfidant: (id: string) => Promise<void>;
  useConfidantBattleItem: (id: string, kind: 'battle_heal' | 'battle_sp') => Promise<ConfidantBuff | null>;
  runConfidantDailyMaintenance: () => Promise<void>;
  getAvailableConfidantItems: (kind: 'battle_heal' | 'battle_sp') => Array<{
    confidantId: string;
    confidantName: string;
    arcanaId: string;
    buff: ConfidantBuff;
  }>;

  // 谏言 / Counsel
  counselSession: CounselSession | null;
  counselArchives: CounselArchive[];
  loadCounsel: () => Promise<void>;
  /** 周冷却检查：已使用过就返回 locked + 下一次可用日期 */
  getCounselCooldown: () => { locked: boolean; nextAvailableAt?: Date; nextAvailableDate?: string; daysLeft?: number };
  /** 判断当前是否有"进行中（未过期、未归档）"的 session */
  hasActiveCounsel: () => boolean;
  /** 新建一次会话；若已锁定或已有活动会话则抛错 */
  startCounselSession: (mentionedConfidantIds?: string[]) => Promise<CounselSession>;
  /** 追加一条消息到当前 session */
  appendCounselMessage: (msg: CounselMessage) => Promise<void>;
  /** 覆写一条消息（用于流式最终完成时写入全文） */
  updateCounselMessage: (id: string, patch: Partial<CounselMessage>) => Promise<void>;
  /** 检测并清理过期会话（保留 session 行以维持冷却，但清空 messages + expired=true） */
  expireCounselIfNeeded: () => Promise<void>;
  /** 归档当前会话：AI 生成 100 字摘要 → 写入 counselArchives → 删除 counselSessions 行 */
  archiveCounselSession: (signal?: AbortSignal) => Promise<CounselArchive | null>;
  /** 从归档库删除一条 */
  deleteCounselArchive: (id: string) => Promise<void>;
  /** 根据当前 session 的 mentioned ids + confidantEvents 构建 AI context（UI 调用） */
  buildCounselContext: () => CounselContext;
}

/** hex 颜色变亮 ~25% 作为 secondary */
function lightenHex(hex: string, amount = 0.25): string {
  const h = hex.replace('#', '');
  const r = Math.min(255, Math.round(parseInt(h.substring(0, 2), 16) + 255 * amount));
  const g = Math.min(255, Math.round(parseInt(h.substring(2, 4), 16) + 255 * amount));
  const b = Math.min(255, Math.round(parseInt(h.substring(4, 6), 16) + 255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** 将自定义颜色写入 CSS 变量（内style 覆盖 data-theme 规则*/
export function applyCustomThemeColor(hex: string) {
  document.documentElement.style.setProperty('--color-primary', hex);
  document.documentElement.style.setProperty('--color-secondary', lightenHex(hex));
}

const DEFAULT_SETTINGS: Settings = {
  id: 'default',
  attributeNames: {
    knowledge: '知识',
    guts: '胆量',
    dexterity: '灵巧',
    kindness: '温柔',
    charm: '魅力'
  },
  levelThresholds: DEFAULT_LEVEL_THRESHOLDS,
  attributeLevelTitles: normalizeAttributeLevelTitles(undefined, DEFAULT_LEVEL_THRESHOLDS.length),
  aiMatchedPresetNames: false,
  aiPresetNameBackup: undefined,
  openaiEnabled: false,
  openaiApiKey: '',
  keywordRules: DEFAULT_KEYWORD_RULES,
  darkMode: false,
  backgroundImage: undefined,
  backgroundOrientation: undefined,
  backgroundOpacity: 0.3,
  backgroundPattern: true,
  backgroundAnimation: ['aurora'],
  soundMuted: false,
  customLevelThresholds: undefined,
  battleEnabled: true,
};

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  attributes: [],
  activities: [],
  achievements: [],
  skills: [],
  dailyDivination: null,
  longReadings: [],
  callingCards: [],
  todos: [],
  todoCompletions: [],
  summaries: [],
  weeklyGoals: [],
  settings: DEFAULT_SETTINGS,
  currentPage: 'dashboard',
  levelUpNotification: null,
  achievementNotification: null,
  skillNotification: null,
  modalBlocker: false,
  persona: null,
  shadow: null,
  battleState: null,
  confidants: [],
  confidantEvents: [],
  counselSession: null,
  counselArchives: [],

  initializeApp: async () => {
    // 请求持久化存储，防止浏览器主动驱逐 IndexedDB（Chrome/Firefox 有效，iOS 17+ 部分有效）
    if (navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {/* 不支持时静默忽略 */});
    }
    try {
      const users = await db.users.toArray();
      if (users.length === 0) {
        return;
      }
      
      const user = users[0];
      set({ user });
      
      document.documentElement.setAttribute('data-theme', user.theme);

      await get().loadData();
      await get().loadDailyDivination();
      await get().loadLongReadings();
      await get().sweepExpiredReadings();
      // 宣告卡：先 load，再 sweep；sweep 内部会再 load 一次刷新已归档项
      await get().loadCallingCards();
      await get().sweepCallingCards();
      // 同伴"逆流"衰减与日常状态检查
      await get().runConfidantDailyMaintenance();
      // 谏言：载入会话 / 归档，并清理过期消息
      await get().loadCounsel();
    } catch (error) {
      console.error('初始化应用失', error);
    }
  },

  createUser: async (name: string, attrNames?: Partial<import('@/types').AttributeNames>, blessingAttribute?: AttributeId) => {
    try {
      const newUser: User = {
        id: uuidv4(),
        name,
        createdAt: new Date(),
        theme: 'blue'
      };

      // 合并初始属性名（用于初始化设置）
      const mergedAttrNames = {
        knowledge: '知识',
        guts: '胆量',
        dexterity: '灵巧',
        kindness: '温柔',
        charm: '魅力',
        ...attrNames
      };

      // 用自定义属性名更新初始属性记录的 displayName
      const initialAttrsWithNames = INITIAL_ATTRIBUTES.map(a => ({
        ...a,
        displayName: mergedAttrNames[a.id as keyof typeof mergedAttrNames] || a.displayName
      }));

      // 根据自定义属性名更新成就描述（属性等级类）
      const achievementsWithNames = ACHIEVEMENTS.map(ach => {
        if (ach.condition.type === 'attribute_level' && ach.condition.attribute) {
          const attrName = mergedAttrNames[ach.condition.attribute as keyof typeof mergedAttrNames];
          // 只替换描述中的默认属性名
          const defaultNames: Record<string, string> = { knowledge: '知识', guts: '胆量', dexterity: '灵巧', kindness: '温柔', charm: '魅力' };
          const oldName = defaultNames[ach.condition.attribute] || ach.condition.attribute;
          const newDesc = ach.description.replace(oldName, attrName);
          return { ...ach, description: newDesc };
        }
        return ach;
      });

      // 根据自定义属性名更新技能描述
      const skillsWithNames = SKILLS.map(skill => {
        const attrName = mergedAttrNames[skill.requiredAttribute as keyof typeof mergedAttrNames];
        const defaultNames: Record<string, string> = { knowledge: '知识', guts: '胆量', dexterity: '灵巧', kindness: '温柔', charm: '魅力' };
        const oldName = defaultNames[skill.requiredAttribute] || skill.requiredAttribute;
        const escapedOldName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const newDesc = skill.description.replace(new RegExp(escapedOldName, 'g'), attrName);
        return { ...skill, description: newDesc };
      });
      
      // 赐福技能：初始化时用户选择的专长属性，+40% 加点加成，已解锁
      let allSkills: Skill[] = skillsWithNames;
      if (blessingAttribute) {
        const blessingAttrName = mergedAttrNames[blessingAttribute] || blessingAttribute;
        const blessingSkill: Skill = {
          id: `blessing_${blessingAttribute}`,
          name: '馆长的赐福',
          description: `${blessingAttrName}每次加点额外 +1`,
          requiredAttribute: blessingAttribute,
          requiredLevel: 1,
          unlocked: true,
          flatBonus: 1,
        };
        allSkills = [...skillsWithNames, blessingSkill];
      }

      await db.users.add(newUser);
      await db.attributes.bulkAdd(initialAttrsWithNames);
      await db.achievements.bulkAdd(achievementsWithNames);
      await db.skills.bulkAdd(allSkills);
      
      const defaultSettings: Settings = {
        id: 'default',
        attributeNames: mergedAttrNames,
        levelThresholds: DEFAULT_LEVEL_THRESHOLDS,
        attributeLevelTitles: normalizeAttributeLevelTitles(undefined, DEFAULT_LEVEL_THRESHOLDS.length),
        aiMatchedPresetNames: false,
        aiPresetNameBackup: undefined,
        openaiEnabled: false,
        openaiApiKey: '',
        keywordRules: DEFAULT_KEYWORD_RULES,
        darkMode: false,
        backgroundImage: undefined,
        backgroundOrientation: undefined,
        backgroundOpacity: 0.3,
        backgroundPattern: true,
        backgroundAnimation: ['aurora'],
        soundMuted: false
      };
      await db.settings.add(defaultSettings);
      
      set({ 
        user: newUser, 
        attributes: initialAttrsWithNames,
        achievements: achievementsWithNames,
        skills: allSkills,
        settings: defaultSettings
      });
      
      document.documentElement.setAttribute('data-theme', newUser.theme);

      // 星象：首次创建用户时留白，由用户主动进入星象页抽卡
      await get().loadDailyDivination();
      await get().loadLongReadings();
    } catch (error) {
      console.error('创建用户失败:', error);
      throw error;
    }
  },

  updateUser: async (patch) => {
    const { user } = get();
    if (!user) return;
    const updates: Partial<User> = {};
    if (typeof patch.name === 'string') updates.name = patch.name.trim() || user.name;
    // 用 `in` 判断"是否显式传了这个 key"：
    //   ✗ 旧写法 `=== undefined` 会把"只改 name"的调用误判为"同时清空头像"
    //     —— JS 里"没传 key"和"传了 undefined"读取时都返回 undefined，值判断无法区分
    //   ✓ 只有调用方真正把 avatarDataUrl 列为 key 时才动它（undefined 表示用户主动移除）
    if ('avatarDataUrl' in patch) {
      updates.avatarDataUrl = patch.avatarDataUrl;
    }
    await db.users.update(user.id, updates);
    set({ user: { ...user, ...updates } });

    // 头像 / 昵称改动后自动后台推送，只动 users 表那一块"公开档案"，不跑全量同步
    const profileChanged = 'avatarDataUrl' in patch || typeof patch.name === 'string';
    if (profileChanged) {
      void import('@/services/sync').then(({ pushUserProfile }) => {
        pushUserProfile().catch(err => console.warn('[velvet-store] auto pushUserProfile after profile edit failed', err));
      }).catch(() => {});
    }
  },

  setTheme: async (theme: ThemeType) => {
    const { user, settings } = get();
    if (!user) return;

    await db.users.update(user.id, { theme });
    set({ user: { ...user, theme } });
    document.documentElement.setAttribute('data-theme', theme);
    // 自定义主题：应用 CSS 变量
    if (theme === 'custom' && settings.customThemeColor) {
      applyCustomThemeColor(settings.customThemeColor);
    } else {
      // 非自定义主题：清除内联覆盖
      document.documentElement.style.removeProperty('--color-primary');
      document.documentElement.style.removeProperty('--color-secondary');
    }
  },

  addActivity: async (description: string, points: Record<string, number>, method: 'local' | 'todo' | 'battle', options?: { important?: boolean; date?: Date; category?: Activity['category'] }) => {
    const { user, dailyDivination, settings } = get();
    if (!user) return { unlockHints: { achievements: 0, skills: 0 } };

    const adjustedPoints = { ...points };
    const levelUps: Array<{ attribute: AttributeId; fromLevel: number; toLevel: number }> = [];
    const levelUpActivities: Activity[] = [];
    const activityDate = options?.date || new Date();

    // ── 前置纯计算：塔罗 / 技能 / 面具加成（只读，不写 DB）─────────────
    if (dailyDivination && dailyDivination.date === toLocalDateKey()) {
      const attr = dailyDivination.effect.attribute;
      if (adjustedPoints[attr]) {
        adjustedPoints[attr] = Math.round(adjustedPoints[attr] * dailyDivination.effect.multiplier);
      }
    }
    for (const [attrId, pts] of Object.entries(adjustedPoints)) {
      if (pts > 0) {
        adjustedPoints[attrId] = get().applySkillBonus(attrId as AttributeId, pts);
      }
    }
    const equippedMask = get().persona?.equippedMaskAttribute;
    if (equippedMask && (adjustedPoints[equippedMask] || 0) > 0) {
      adjustedPoints[equippedMask] = adjustedPoints[equippedMask] + 1;
    }

    // 创建活动记录（事务内填 levelUps 后写入）
    const activity: Activity = {
      id: uuidv4(),
      userId: user.id,
      date: activityDate,
      description,
      pointsAwarded: {
        knowledge: adjustedPoints.knowledge || 0,
        guts: adjustedPoints.guts || 0,
        dexterity: adjustedPoints.dexterity || 0,
        kindness: adjustedPoints.kindness || 0,
        charm: adjustedPoints.charm || 0,
      },
      method,
      levelUps: [],
      important: options?.important,
      category: options?.category,
    };

    // ── 所有 DB 写操作包在事务里：中途崩溃 / 异常时自动回滚 ─────────
    // 涉及表：confidants（daily_plus 标记）、achievements（关键字/任务/全属性成就进度）、
    //         attributes（点数/升级）、activities（活动 + 升级行）、以及读 todoCompletions/skills/weeklyGoals
    let matchedAchievements: Achievement[] = [];
    let matchedSkills: Skill[] = [];
    let achievementsSnapshot: Achievement[] = [];
    let attributesSnapshot: Attribute[] = [];
    await db.transaction(
      'rw',
      [db.confidants, db.achievements, db.attributes, db.activities, db.todoCompletions, db.skills, db.weeklyGoals],
      async () => {
        // 同伴「日常加成」——每个同伴当日首次生效，乘区外 flat +N
        const todayKey = toLocalDateKey(activityDate);
        const allConfidants = get().confidants;
        const confidantsToMark: Confidant[] = [];
        for (const c of allConfidants) {
          if (c.archivedAt) continue;
          if (c.dailyUsedDate === todayKey) continue;
          const buff = (c.buffs ?? []).find(b => b.kind === 'daily_plus');
          if (!buff || !buff.attribute) continue;
          const current = adjustedPoints[buff.attribute] ?? 0;
          if (current <= 0) continue;
          adjustedPoints[buff.attribute] = current + buff.value;
          confidantsToMark.push({ ...c, dailyUsedDate: todayKey });
        }
        for (const c of confidantsToMark) await db.confidants.put(c);
        // 注意：loadConfidants() 故意不放在事务内——事务结束后由末尾统一 loadData() 刷新

        // 关键字成就（内部 skipLoad: true，不会触发 loadData）
        await get().checkKeywordAchievements(description, { skipLoad: true });

        // 属性更新 + 升级判定（一次性读全部属性，避免 N+1）
        const currentAttrs = await db.attributes.toArray();
        const attrMap = new Map(currentAttrs.map(a => [a.id, a]));
        for (const [attrId, pts] of Object.entries(adjustedPoints)) {
          if (pts > 0) {
            const attribute = attrMap.get(attrId as AttributeId);
            if (!attribute) continue;
            const oldLevel = attribute.level;
            const newPoints = attribute.points + pts;
            let newLevel = attribute.level;
            const thresholds = get().settings.levelThresholds?.length
              ? get().settings.levelThresholds
              : attribute.levelThresholds;
            while (newLevel < thresholds.length && newPoints >= thresholds[newLevel]) {
              newLevel++;
            }
            if (newLevel > oldLevel) {
              levelUps.push({
                attribute: attrId as AttributeId,
                fromLevel: oldLevel,
                toLevel: newLevel,
              });
              levelUpActivities.push({
                id: uuidv4(),
                userId: user.id,
                date: new Date(),
                description: `${settings.attributeNames[attrId as AttributeNamesKey]} 升级Lv.${newLevel}`,
                pointsAwarded: { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 },
                method: 'local' as const,
                category: 'level_up',
              });
              // 首次升级通知：setTimeout 500ms 后触发（事务早已提交，无副作用）
              if (levelUps.length === 1) {
                setTimeout(() => {
                  set({
                    levelUpNotification: {
                      id: attrId,
                      displayName: settings.attributeNames[attrId as AttributeNamesKey],
                      level: newLevel,
                    },
                  });
                }, 500);
              }
            }
            await db.attributes.update(attrId, { points: newPoints, level: newLevel });
          }
        }

        // 活动写入（包含刚计算好的 levelUps）
        activity.levelUps = levelUps;
        await db.activities.add(activity);
        if (levelUpActivities.length > 0) {
          await db.activities.bulkAdd(levelUpActivities);
        }

        // 后置成就 check（依赖属性已写入 + 活动已写入的最新态）
        await get().checkTodoCompletionAchievements({ skipLoad: true });
        await get().checkAllAttributesMaxAchievement();

        // 事务内读快照用于解锁提示（读到的是事务内最新态）
        const [achievements, attributes, activities, todoCompletions, skills, weeklyGoals] = await Promise.all([
          db.achievements.toArray(),
          db.attributes.toArray(),
          db.activities.toArray(),
          db.todoCompletions.toArray(),
          db.skills.toArray(),
          db.weeklyGoals.toArray(),
        ]);
        achievementsSnapshot = achievements;
        attributesSnapshot = attributes;

        matchedAchievements = achievements.filter((achievement) => {
          if (achievement.unlocked) return false;
          const progress = (() => {
            switch (achievement.condition.type) {
              case 'consecutive_days': {
                const streak = calcMaxStreak(activities.map(a => a.date));
                return Math.min(streak, achievement.condition.value);
              }
              case 'total_points': {
                const total = attributes.reduce((sum, attr) => sum + attr.points, 0);
                return Math.min(total, achievement.condition.value);
              }
              case 'attribute_level': {
                const attr = attributes.find(a => a.id === achievement.condition.attribute);
                const level = attr?.level || 0;
                return Math.min(level, achievement.condition.value);
              }
              case 'keyword_match': {
                return Math.min(achievement.condition.currentProgress || 0, achievement.condition.value);
              }
              case 'all_attributes_max': {
                const maxLevelCount = attributes.filter(attr => attr.level >= achievement.condition.value).length;
                return Math.min(maxLevelCount, attributes.length);
              }
              case 'todo_completions': {
                const total = todoCompletions.reduce((sum, item) => sum + item.count, 0);
                return Math.min(total, achievement.condition.value);
              }
              case 'weekly_goal_completions': {
                const completedCount = weeklyGoals.filter(g => g.completed).length;
                return Math.min(completedCount, achievement.condition.value);
              }
              case 'confidants_at_level': {
                const minLv = achievement.condition.minLevel ?? 1;
                const qualifying = get().confidants.filter(
                  c => !c.archivedAt && c.intimacy >= minLv,
                ).length;
                return Math.min(qualifying, achievement.condition.value);
              }
              default:
                return 0;
            }
          })();
          return progress >= achievement.condition.value;
        });

        matchedSkills = skills.filter((skill) => {
          if (skill.unlocked) return false;
          if (skill.id.startsWith('blessing_')) return false;
          const attr = attributes.find(a => a.id === skill.requiredAttribute);
          return !!attr && attr.level >= skill.requiredLevel;
        });
      },
    );
    // 引用快照以免 TS 判定为未使用（保留语义，便于未来扩展）
    void achievementsSnapshot; void attributesSnapshot;

    // 事务已提交：一次性刷新所有内存状态（含 confidants）
    await get().loadData();

    // 为战场 SP 奖励：活动获得的总点数即为 SP
    const totalPts = Object.values(adjustedPoints).reduce((s, v) => s + (v || 0), 0);
    if (totalPts > 0 && get().battleState) {
      await get().earnSP(totalPts);
    }

    return {
      unlockHints: {
        achievements: matchedAchievements.length,
        skills: matchedSkills.length,
      },
    };
  },

  updateAttribute: async (attributeId: string, points: number) => {
    const attribute = await db.attributes.get(attributeId);
    if (!attribute) return;
    
    const newPoints = attribute.points + points;
    let newLevel = attribute.level;
    
    const thresholds = get().settings.levelThresholds?.length
      ? get().settings.levelThresholds
      : attribute.levelThresholds;
    while (newLevel < thresholds.length && newPoints >= thresholds[newLevel]) {
      newLevel++;
    }
    
    await db.attributes.update(attributeId, { 
      points: newPoints, 
      level: newLevel 
    });
    
    // 不再自动解锁技    
    await get().loadData();
  },

  unlockAchievement: async (achievementId: string) => {
    const achievement = await db.achievements.get(achievementId);
    if (achievement && !achievement.unlocked) {
      const attributes = await db.attributes.toArray();
      const todoCompletions = await db.todoCompletions.toArray();
      const activities = await db.activities.toArray();
      const weeklyGoalsAll = await db.weeklyGoals.toArray();
      const progress = (() => {
        switch (achievement.condition.type) {
          case 'consecutive_days':
            return calcMaxStreak(activities.map(a => a.date));
          case 'total_points':
            return attributes.reduce((sum, attr) => sum + attr.points, 0);
          case 'attribute_level': {
            const attr = attributes.find(a => a.id === achievement.condition.attribute);
            return attr?.level || 0;
          }
          case 'keyword_match':
            return achievement.condition.currentProgress || 0;
          case 'all_attributes_max':
            return attributes.filter(attr => attr.level >= achievement.condition.value).length;
          case 'todo_completions':
            return todoCompletions.reduce((sum, item) => sum + item.count, 0);
          case 'weekly_goal_completions':
            return weeklyGoalsAll.filter(g => g.completed).length;
          case 'confidants_at_level': {
            const minLv = achievement.condition.minLevel ?? 1;
            return get().confidants.filter(c => !c.archivedAt && c.intimacy >= minLv).length;
          }
          default:
            return 0;
        }
      })();
      if (progress < achievement.condition.value) {
        return;
      }
      await db.achievements.update(achievementId, { 
        unlocked: true, 
        unlockedDate: new Date() 
      });

      const { user } = get();
      if (user) {
        await db.activities.add({
          id: uuidv4(),
          userId: user.id,
          date: new Date(),
          description: `成就解锁: ${achievement.title}`,
          pointsAwarded: { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 },
          method: 'local' as const,
          category: 'achievement_unlock'
        });
      }
      
      // 显示成就解锁通知
      setTimeout(() => {
        get().setAchievementNotification({
          id: achievementId,
          title: achievement.title
        });
      }, 500);
      
      await get().loadData();
    }
  },

  unlockSkill: async (skillId: string) => {
    const skill = await db.skills.get(skillId);
    if (skill && !skill.unlocked) {
      const attribute = await db.attributes.get(skill.requiredAttribute);
      if (!attribute || attribute.level < skill.requiredLevel) return;
      await db.skills.update(skillId, { unlocked: true });

      const { user } = get();
      if (user) {
        await db.activities.add({
          id: uuidv4(),
          userId: user.id,
          date: new Date(),
          description: `技能解锁：${skill.name}`,
          pointsAwarded: { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 },
          method: 'local' as const,
          category: 'skill_unlock'
        });
      }
      
      // 显示技能解锁通知
      setTimeout(() => {
        get().setSkillNotification({
          id: skillId,
          name: skill.name
        });
      }, 500);
      
      await get().loadData();
    }
  },

  setCurrentPage: (page: string) => {
    set({ currentPage: page });
  },

  updateSettings: async (newSettings: Partial<Settings>) => {
    const { settings } = get();
    const nextThresholds = newSettings.levelThresholds ?? settings.levelThresholds;
    const updated = { ...settings, ...newSettings };
    if (newSettings.attributeLevelTitles || newSettings.levelThresholds) {
      updated.attributeLevelTitles = normalizeAttributeLevelTitles(
        newSettings.attributeLevelTitles ?? settings.attributeLevelTitles,
        nextThresholds.length,
      );
    }
    await db.settings.put(updated);
    set({ settings: updated });

    if (newSettings.levelThresholds) {
      const thresholds = updated.levelThresholds;
      const attributes = await db.attributes.toArray();
      const updatedAttributes = attributes.map((attr) => {
        let newLevel = 1;
        while (newLevel < thresholds.length && attr.points >= thresholds[newLevel]) {
          newLevel++;
        }
        return {
          ...attr,
          level: newLevel,
          levelThresholds: thresholds
        };
      });
      await db.attributes.bulkPut(updatedAttributes);
      set({ attributes: updatedAttributes });
    }
    
    // 应用夜间模式设置
    if (updated.darkMode !== undefined) {
      if (updated.darkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  },

  // ── 星象 / 塔罗 ────────────────────────────────────────────

  loadDailyDivination: async () => {
    const today = toLocalDateKey();
    const existing = await db.dailyDivinations.where('date').equals(today).first();
    set({ dailyDivination: existing ?? null });
  },

  saveDailyDivination: async (d: DailyDivination) => {
    // 幂等：同日再抽会覆盖（正常不应触发，但保险）
    const today = toLocalDateKey();
    const existing = await db.dailyDivinations.where('date').equals(today).first();
    if (existing && existing.id !== d.id) {
      await db.dailyDivinations.delete(existing.id);
    }
    await db.dailyDivinations.put(d);
    set({ dailyDivination: d });
  },

  getRecentActivitiesForDaily: (limit = 7) => {
    const { activities } = get();
    return activities.filter(a => !a.category).slice(0, limit);
  },

  getRecentActivitiesByAttribute: (limit = 4) => {
    const { activities } = get();
    const base: Record<AttributeId, Activity[]> = {
      knowledge: [], guts: [], dexterity: [], kindness: [], charm: [],
    };
    const attrIds: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
    for (const a of activities) {
      if (a.category) continue;
      for (const id of attrIds) {
        if ((a.pointsAwarded?.[id] ?? 0) > 0 && base[id].length < limit) {
          base[id].push(a);
        }
      }
    }
    return base;
  },

  loadLongReadings: async () => {
    const readings = await db.longReadings.orderBy('createdAt').reverse().toArray();
    set({ longReadings: readings });
  },

  saveLongReading: async (r: LongReading) => {
    await db.longReadings.put(r);
    await get().loadLongReadings();
  },

  appendLongReadingFollowUp: async (id: string, followUp: LongReadingFollowUp) => {
    const existing = await db.longReadings.get(id);
    if (!existing) return;
    const next: LongReading = {
      ...existing,
      followUps: [...(existing.followUps ?? []), followUp],
    };
    await db.longReadings.put(next);
    await get().loadLongReadings();
  },

  archiveLongReading: async (id: string, archived: boolean) => {
    const existing = await db.longReadings.get(id);
    if (!existing) return;
    await db.longReadings.put({ ...existing, archived });
    await get().loadLongReadings();
  },

  deleteLongReading: async (id: string) => {
    await db.longReadings.delete(id);
    await get().loadLongReadings();
  },

  sweepExpiredReadings: async () => {
    const today = toLocalDateKey();
    const all = await db.longReadings.toArray();
    const toUpdate = all.filter(r => !r.archived && r.expiresAt < today);
    if (toUpdate.length === 0) return;
    await Promise.all(toUpdate.map(r => db.longReadings.put({ ...r, archived: true })));
    await get().loadLongReadings();
  },

  countActiveReadings: () => {
    const today = toLocalDateKey();
    return get().longReadings.filter(r => !r.archived && r.expiresAt >= today).length;
  },

  // ── CallingCard / 宣告卡（倒计时） ─────────────────────────

  loadCallingCards: async () => {
    const cards = await db.callingCards.orderBy('createdAt').reverse().toArray();
    set({ callingCards: cards });
  },

  saveCallingCard: async (card: CallingCard) => {
    // pinned=true 时：把其它卡的 pinned 全置 false（互斥）
    if (card.pinned) {
      const all = await db.callingCards.toArray();
      const toUnpin = all.filter(c => c.id !== card.id && c.pinned).map(c => ({ ...c, pinned: false }));
      if (toUnpin.length) await db.callingCards.bulkPut(toUnpin);
    }
    await db.callingCards.put(card);
    await get().loadCallingCards();
  },

  deleteCallingCard: async (id: string) => {
    await db.callingCards.delete(id);
    await get().loadCallingCards();
  },

  archiveCallingCard: async (id: string) => {
    const c = await db.callingCards.get(id);
    if (!c) return;
    await db.callingCards.put({
      ...c,
      archived: true,
      archivedAt: c.archivedAt ?? new Date(),
      archiveReason: c.archiveReason ?? 'manual',
      // 手动归档不再触发结算屏（视为用户主动放弃 / 提前收）
      cutInShown: true,
      pinned: false,
    });
    await get().loadCallingCards();
  },

  unarchiveCallingCard: async (id: string) => {
    const c = await db.callingCards.get(id);
    if (!c) return;
    await db.callingCards.put({
      ...c,
      archived: false,
      archivedAt: undefined,
      archiveReason: undefined,
      cutInShown: false,
      ledgerWritten: false,
    });
    await get().loadCallingCards();
  },

  pinCallingCard: async (id: string | null) => {
    const all = await db.callingCards.toArray();
    const updates: CallingCard[] = [];
    for (const c of all) {
      if (id !== null && c.id === id) {
        if (!c.pinned) updates.push({ ...c, pinned: true });
      } else if (c.pinned) {
        updates.push({ ...c, pinned: false });
      }
    }
    if (updates.length) await db.callingCards.bulkPut(updates);
    await get().loadCallingCards();
  },

  getCallingCardProgress: (id: string) => {
    const card = get().callingCards.find(c => c.id === id);
    if (!card) return null;

    const today = toLocalDateKey();
    const todayDate = new Date(today + 'T00:00:00');
    const startDate = new Date(card.startDate + 'T00:00:00');

    let dateProgress: number | undefined;
    let daysElapsed: number | undefined;
    let daysTotal: number | undefined;
    let daysLeft: number | undefined;
    let dateReached = false;
    if (card.targetDate) {
      const targetD = new Date(card.targetDate + 'T00:00:00');
      // 用本地日期 key 差值算，避开 UTC / DST 偶发的 ±1 天偏差
      daysElapsed = Math.max(0, Math.round((todayDate.getTime() - startDate.getTime()) / 86400000));
      daysTotal   = Math.max(1, Math.round((targetD.getTime() - startDate.getTime()) / 86400000));
      daysLeft    = Math.max(0, Math.round((targetD.getTime() - todayDate.getTime()) / 86400000));
      dateProgress = Math.max(0, Math.min(1, daysElapsed / daysTotal));
      dateReached = today >= card.targetDate;
    }

    let todoProgress: number | undefined;
    let todosDone: number | undefined;
    let todosTotal: number | undefined;
    let todosReached = false;
    if (card.linkedTodoIds && card.linkedTodoIds.length > 0) {
      todosTotal = card.linkedTodoIds.length;
      const todosState = get().todos;
      const completionsState = get().todoCompletions;
      let done = 0;
      for (const tid of card.linkedTodoIds) {
        const t = todosState.find(x => x.id === tid);
        if (!t) continue;
        if (t.repeatDaily) {
          // 重复任务：只看"今日是否完成"
          const target = t.frequency === 'count' ? (t.targetCount || 1) : 1;
          const cmp = completionsState.find(c => c.todoId === tid && c.date === today);
          if ((cmp?.count ?? 0) >= target) done += 1;
        } else if (t.isLongTerm) {
          // 长期任务：累计跨天完成次数 ≥ targetCount
          const target = t.targetCount || 1;
          const total = completionsState.filter(c => c.todoId === tid).reduce((s, c) => s + c.count, 0);
          if (total >= target) done += 1;
        } else {
          // 单次任务：看是否最终 completed（!isActive 且 completedAt 存在）
          if (!t.isActive && t.completedAt) done += 1;
        }
      }
      todosDone = done;
      todoProgress = Math.max(0, Math.min(1, done / todosTotal));
      todosReached = done >= todosTotal;
    }

    // 综合进度（HERO 卡的进度条用这个）：
    //   - both：取两者较大的（贴近"先到为准"语义）
    //   - 单一模式：本身
    let overallProgress = 0;
    if (card.mode === 'both') {
      overallProgress = Math.max(dateProgress ?? 0, todoProgress ?? 0);
    } else if (card.mode === 'deadline') {
      overallProgress = dateProgress ?? 0;
    } else {
      overallProgress = todoProgress ?? 0;
    }

    // reached：达成 / 触发归档的判定
    let reached = false;
    if (card.mode === 'both') reached = dateReached || todosReached;
    else if (card.mode === 'deadline') reached = dateReached;
    else reached = todosReached;

    return {
      daysElapsed, daysTotal, daysLeft, dateProgress,
      todosDone, todosTotal, todoProgress,
      overallProgress, reached,
    };
  },

  sweepCallingCards: async () => {
    // 扫一遍未归档卡片，把已达成的归档（不动 ledgerWritten / cutInShown，让 UI 后续触发结算屏）
    const all = await db.callingCards.toArray();
    const todayKey = toLocalDateKey();
    const newlyArchived: CallingCard[] = [];
    for (const card of all) {
      if (card.archived) continue;
      const todayDate = new Date(todayKey + 'T00:00:00');
      let dateReached = false;
      let todosReached = false;
      if (card.targetDate) {
        dateReached = todayKey >= card.targetDate;
      }
      if (card.linkedTodoIds && card.linkedTodoIds.length > 0) {
        // 仿 getCallingCardProgress 简化版，避免循环依赖 set
        const todosState = get().todos;
        const completionsState = get().todoCompletions;
        let done = 0;
        for (const tid of card.linkedTodoIds) {
          const t = todosState.find(x => x.id === tid);
          if (!t) continue;
          if (t.repeatDaily) {
            const target = t.frequency === 'count' ? (t.targetCount || 1) : 1;
            const cmp = completionsState.find(c => c.todoId === tid && c.date === todayKey);
            if ((cmp?.count ?? 0) >= target) done += 1;
          } else if (t.isLongTerm) {
            const target = t.targetCount || 1;
            const total = completionsState.filter(c => c.todoId === tid).reduce((s, c) => s + c.count, 0);
            if (total >= target) done += 1;
          } else {
            if (!t.isActive && t.completedAt) done += 1;
          }
        }
        todosReached = done >= card.linkedTodoIds.length;
      }
      let reached = false;
      let reason: 'auto_date' | 'auto_todos' | undefined;
      if (card.mode === 'both') {
        if (todosReached) { reached = true; reason = 'auto_todos'; }
        else if (dateReached) { reached = true; reason = 'auto_date'; }
      } else if (card.mode === 'deadline') {
        if (dateReached) { reached = true; reason = 'auto_date'; }
      } else {
        if (todosReached) { reached = true; reason = 'auto_todos'; }
      }
      // 占位：todayDate 仅用作上面的 reached 判定派生（提示 TS 已用过）
      void todayDate;

      if (reached) {
        const next: CallingCard = {
          ...card,
          archived: true,
          archivedAt: new Date(),
          archiveReason: reason,
          cutInShown: false, // 留给 Dashboard 展示一次结算屏
          pinned: false,
        };
        await db.callingCards.put(next);
        newlyArchived.push(next);
      }
    }
    if (newlyArchived.length) await get().loadCallingCards();
    return newlyArchived;
  },

  markCallingCardCutInShown: async (id: string) => {
    const c = await db.callingCards.get(id);
    if (!c) return;
    await db.callingCards.put({ ...c, cutInShown: true });
    await get().loadCallingCards();
  },

  writeCallingCardLedger: async (id: string) => {
    const c = await db.callingCards.get(id);
    if (!c || c.ledgerWritten) return;
    // 写入一条沉浸感"留下记录"——不带具体加点（这是 milestone 而非 grind），
    // 但仍走 addActivity 让它进 activity 历史 + 计入 streak
    await get().addActivity(
      `跨越了「${c.title}」`,
      { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 },
      'local',
      { important: true, category: 'calling_card_clear', date: c.archivedAt ?? new Date() },
    );
    await db.callingCards.put({ ...c, ledgerWritten: true });
    await get().loadCallingCards();
  },

  loadData: async () => {
    try {
      const attributes = await db.attributes.toArray();
      const activities = await db.activities.orderBy('date').reverse().toArray();
      const achievements = await db.achievements.toArray();
      let skills = await db.skills.toArray();
       const settingsArray = await db.settings.toArray();
       const settings = settingsArray[0] || get().settings;

      // 迁移：将旧格式技能描述统一为新格式「[属性名]积累额外提升 x%」
      const oldDescPatterns = [
        /阅读行为额外\+(\d+)%/, /学习行为额外\+(\d+)%/, /挑战行为额外\+(\d+)%/,
        /运动行为额外\+(\d+)%/, /帮助行为额外\+(\d+)%/, /社交行为额外\+(\d+)%/,
        /所有行为额外\+(\d+)%/
      ];
      const attrNames = settings?.attributeNames || { knowledge: '知识', guts: '胆量', dexterity: '灵巧', kindness: '温柔', charm: '魅力' };

      // 补种老用户缺失的系统预设成就（新版本新增成就时自动同步）
      const existingAchievementIds = new Set(achievements.map(a => a.id));
      const missingSystemAchievements = ACHIEVEMENTS.filter(a => !existingAchievementIds.has(a.id));
      if (missingSystemAchievements.length > 0) {
        const defaultAttrNames: Record<string, string> = { knowledge: '知识', guts: '胆量', dexterity: '灵巧', kindness: '温柔', charm: '魅力' };
        const adaptedMissing = missingSystemAchievements.map(ach => {
          if (ach.condition.type === 'attribute_level' && ach.condition.attribute) {
            const oldName = defaultAttrNames[ach.condition.attribute] || ach.condition.attribute;
            const newName = attrNames[ach.condition.attribute as keyof typeof attrNames] || oldName;
            return { ...ach, description: ach.description.replace(oldName, newName) };
          }
          return { ...ach };
        });
        await db.achievements.bulkAdd(adaptedMissing);
        achievements.push(...adaptedMissing);
      }

      const skillsNeedMigration = skills.some(s => s.bonusMultiplier && oldDescPatterns.some(p => p.test(s.description)));
      if (skillsNeedMigration) {
        for (const skill of skills) {
          const needsMigration = oldDescPatterns.some(p => p.test(skill.description));
          if (needsMigration && skill.bonusMultiplier) {
            const pct = Math.round((skill.bonusMultiplier - 1) * 100);
            const attrName = attrNames[skill.requiredAttribute as keyof typeof attrNames] || skill.requiredAttribute;
            const newDesc = `${attrName}积累额外提升 ${pct}%`;
            await db.skills.update(skill.id, { description: newDesc });
            skill.description = newDesc;
          }
        }
        skills = await db.skills.toArray();
      }
      const todos = await db.todos.toArray();
      const todoCompletions = await db.todoCompletions.toArray();

      const todayKey = toLocalDateKey();
      const migratedTodos: Todo[] = [];

      const now = new Date();
      const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayKey = toLocalDateKey(yesterdayDate);

      const todosNeedFormatMigration = todos.some(t => (t.frequency as any) === 'weekdays' || (t.frequency as any) === 'long');
      for (const todo of todos) {
        let updatedTodo = todo;
        const updates: Partial<Todo> = {};

        if (todosNeedFormatMigration) {
          if ((todo.frequency as any) === 'weekdays') {
            updates.frequency = 'count';
            updates.repeatDaily = true;
          }

          if ((todo.frequency as any) === 'long') {
            updates.frequency = 'count';
            updates.isLongTerm = true;
          }
        }

        if (todo.isActive && !todo.repeatDaily && !todo.isLongTerm) {
          const target = todo.frequency === 'count' ? (todo.targetCount || 1) : 1;
          const completionToday = await db.todoCompletions.where('todoId').equals(todo.id).filter(c => c.date === todayKey).first();
          const completionYesterday = await db.todoCompletions.where('todoId').equals(todo.id).filter(c => c.date === yesterdayKey).first();
          const shouldArchive = (completionToday && completionToday.count >= target) || (completionYesterday && completionYesterday.count >= target);

          if (shouldArchive) {
            updates.isActive = false;
            updates.archivedAt = todo.archivedAt || new Date();
            updates.completedAt = todo.completedAt || new Date();
          }
        }

        if (Object.keys(updates).length > 0) {
          await db.todos.update(todo.id, updates);
          updatedTodo = { ...todo, ...updates };
        }

        migratedTodos.push(updatedTodo);
      }
      
       // 迁移：backgroundAnimation 旧字符串格式 数组格式
       const rawAnim = (settings as any).backgroundAnimation;
       let migratedAnim: string[] | undefined = undefined;
       if (typeof rawAnim === 'string') {
         migratedAnim = rawAnim === 'none' ? [] : [rawAnim];
       } else if (!Array.isArray(rawAnim)) {
         migratedAnim = ['aurora']; // 未设置过则默认极光
       }

       const normalizedThresholds = settings.levelThresholds?.length
         ? settings.levelThresholds
         : DEFAULT_LEVEL_THRESHOLDS;
       const normalizedLevelTitles = normalizeAttributeLevelTitles(
         settings.attributeLevelTitles,
         normalizedThresholds.length,
       );
       const normalizedSettings = {
          ...settings,
          levelThresholds: normalizedThresholds,
          attributeLevelTitles: normalizedLevelTitles,
          backgroundOpacity: settings.backgroundOpacity ?? 0.3,
          soundMuted: settings.soundMuted ?? false,
          backgroundAnimation: migratedAnim ?? (settings.backgroundAnimation as string[]),
       };

       const settingsPatch: Partial<Settings> = {};
       if (settings.backgroundOpacity === undefined) {
         settingsPatch.backgroundOpacity = 0.3;
       }
       if (settings.soundMuted === undefined) {
         settingsPatch.soundMuted = false;
       }
       if (migratedAnim !== undefined) {
         settingsPatch.backgroundAnimation = migratedAnim;
       }
       if (
         settings.levelThresholds !== normalizedThresholds ||
         JSON.stringify(settings.attributeLevelTitles) !== JSON.stringify(normalizedLevelTitles)
       ) {
         settingsPatch.levelThresholds = normalizedThresholds;
         settingsPatch.attributeLevelTitles = normalizedLevelTitles;
       }
       if (Object.keys(settingsPatch).length > 0) {
         await db.settings.update('default', settingsPatch);
       }

       const summaries = await db.summaries.orderBy('startDate').reverse().toArray();
       let weeklyGoals = await db.weeklyGoals.orderBy('createdAt').reverse().toArray();

       // 清理：删除已过期（weekEnd < 今天）且未完成的每周目标
       const todayForCleanup = toLocalDateKey();
       const expiredIds = weeklyGoals
         .filter(g => !g.completed && g.weekEnd < todayForCleanup)
         .map(g => g.id);
       if (expiredIds.length > 0) {
         await Promise.all(expiredIds.map(id => db.weeklyGoals.delete(id)));
         weeklyGoals = weeklyGoals.filter(g => !expiredIds.includes(g.id));
       }

       set({ 
         attributes, 
         activities, 
         achievements, 
         skills,
         settings: normalizedSettings,
         todos: migratedTodos,
         todoCompletions,
         summaries,
         weeklyGoals,
       });
      
      // 应用夜间模式设置
       if (normalizedSettings.darkMode) {
         document.documentElement.classList.add('dark');
       } else {
         document.documentElement.classList.remove('dark');
       }
       // 自定义主题色
       const currentTheme = get().user?.theme;
       if (currentTheme === 'custom' && normalizedSettings.customThemeColor) {
         applyCustomThemeColor(normalizedSettings.customThemeColor);
       }

       // 加载战场数据
       await get().loadBattleData();
       // 加载同伴数据
       await get().loadConfidants();
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  },

  setLevelUpNotification: (notification) => {
    set({ levelUpNotification: notification });
  },

  setAchievementNotification: (notification) => {
    set({ achievementNotification: notification });
  },

  setSkillNotification: (notification) => {
    set({ skillNotification: notification });
  },

  setModalBlocker: (value) => {
    set({ modalBlocker: value });
  },

  resetAllData: async () => {
    await db.users.clear();
    await db.attributes.clear();
    await db.activities.clear();
    await db.achievements.clear();
    await db.skills.clear();
    await db.dailyEvents.clear();
    await db.dailyDivinations.clear();
    await db.longReadings.clear();
    await db.callingCards.clear();
    await db.settings.clear();
    await db.todos.clear();
    await db.todoCompletions.clear();
    await db.summaries.clear();
    await db.weeklyGoals.clear();
    await db.personas.clear();
    await db.shadows.clear();
    await db.battleStates.clear();
    await db.confidants.clear();
    await db.confidantEvents.clear();
    await db.counselSessions.clear();
    await db.counselArchives.clear();

    set({
      user: null,
      attributes: [],
      activities: [],
      achievements: [],
      skills: [],
      dailyDivination: null,
      longReadings: [],
      callingCards: [],
      todos: [],
      todoCompletions: [],
      summaries: [],
      weeklyGoals: [],
      settings: DEFAULT_SETTINGS,
      currentPage: 'dashboard',
      levelUpNotification: null,
      achievementNotification: null,
      skillNotification: null,
      persona: null,
      shadow: null,
      battleState: null,
      confidants: [],
      confidantEvents: [],
      counselSession: null,
      counselArchives: [],
    });
  },

  deleteActivityRecordOnly: async (id: string) => {
    // 严格只删除活动条目本身，不动属性点 / level / todoCompletion / level_up 副记录。
    // 当用户在删除弹窗里选择"仅删除条目"时进入这条路径。
    await db.activities.delete(id);
    await get().loadData();
  },

  deleteActivity: async (id: string) => {
    // ── 撤销语义升级（v2.1）─────────────────────────────────
    // 旧行为：仅 db.activities.delete(id)，导致：
    //   1. 加成的属性点数仍保留在 attributes 上（"幽灵点数"）
    //   2. todo 触发的活动被删，但 todoCompletion 仍计 1 次，今日待办还显示已完成
    //   3. 对应升级若发生过，level_up 副记录还挂在历史里，看起来像"凭空升级"
    //
    // 新行为（事务原子）：
    //   - 取该活动的 pointsAwarded，从对应属性点数里逐项扣回
    //   - 扣回后按阈值表回算 level，若跌破则一并下调（最低不低于 1）
    //   - 删除同 method='todo' 当日的 todoCompletion（或递减计数）
    //   - 该 todo 若因完成而被自动归档（isActive=false + completedAt），自动恢复成 active
    //   - 顺手清理掉这次 addActivity 同次写入的 level_up 副记录（同 userId / 同分钟内 / category='level_up'），
    //     避免历史里出现"幽灵升级"
    //
    // 安全边界：
    //   - 跨日活动也会扣点（这是用户主动按"删除"时的预期）；仅 todo 还原限定为同日，
    //     因为旧日的 todoCompletion 早已过去，不应回写。
    //   - 不主动撤销已解锁的 achievement / skill —— 那会引发"得而复失"的复杂态。
    //     这与"撤销点数"是两个语义层次，留给用户自己在 设置 → 重置 处理。
    const target = await db.activities.get(id);
    if (!target) return;

    const todayKey = toLocalDateKey();
    const targetDateKey = toLocalDateKey(new Date(target.date));
    const sameDay = targetDateKey === todayKey;

    await db.transaction(
      'rw',
      [db.activities, db.attributes, db.todos, db.todoCompletions],
      async () => {
        // 1. 删除活动本体（这一行写在事务里、与下面回点等步骤保持原子）
        await db.activities.delete(id);

        // 2. 扣回属性点数 + 重算 level
        const attrIds: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
        const settingsThresholds = get().settings.levelThresholds;
        for (const attrId of attrIds) {
          const delta = target.pointsAwarded?.[attrId] ?? 0;
          if (delta <= 0) continue;
          const attr = await db.attributes.get(attrId);
          if (!attr) continue;
          const newPoints = Math.max(0, attr.points - delta);
          const thresholds = settingsThresholds?.length ? settingsThresholds : attr.levelThresholds;
          // 从 level 1 起向上累加，直到超过 newPoints
          let newLevel = 1;
          for (let lv = 1; lv < thresholds.length; lv++) {
            if (newPoints >= thresholds[lv]) newLevel = lv + 1;
            else break;
          }
          // 老用户阈值数组可能不含 lv1 入口（thresholds[0]=0），保险起见 clamp
          if (newLevel < 1) newLevel = 1;
          await db.attributes.update(attrId, { points: newPoints, level: newLevel });
        }

        // 3. 清理 level_up 副记录：addActivity 在同事务里把 levelUpActivities push 进 db，
        //    它们的 date 都是 new Date()，与 target.date 几乎同瞬。
        //    这里用 ±90s 兜底（兼容跨进程导入时间漂移），并按 attribute 名匹配描述前缀。
        if ((target.levelUps?.length ?? 0) > 0) {
          const targetTime = new Date(target.date).getTime();
          const allActs = await db.activities.toArray();
          const attrNames = get().settings.attributeNames;
          for (const lu of target.levelUps ?? []) {
            const expectedDescPrefix = `${attrNames[lu.attribute as AttributeNamesKey] ?? lu.attribute} 升级Lv.${lu.toLevel}`;
            const candidate = allActs.find(a =>
              a.category === 'level_up'
              && a.description === expectedDescPrefix
              && Math.abs(new Date(a.date).getTime() - targetTime) < 90_000,
            );
            if (candidate) await db.activities.delete(candidate.id);
          }
        }

        // 4. todo 联动撤销（仅同日 + method='todo'）
        if (sameDay && target.method === 'todo') {
          // 描述形如 "完成任务: <todo.title>"
          const m = /^完成任务[:：]\s*(.+)$/.exec(target.description.trim());
          const todoTitle = m?.[1]?.trim();
          if (todoTitle) {
            // 先按 title 找 active todo，找不到再尝试已归档的（误触自动归档场景）
            let todo = await db.todos.toArray().then(arr =>
              arr.find(t => t.title === todoTitle && t.isActive)
              ?? arr.find(t => t.title === todoTitle),
            );
            if (todo) {
              const completion = await db.todoCompletions.where('todoId').equals(todo.id)
                .filter(c => c.date === todayKey).first();
              if (completion) {
                if (completion.count > 1) {
                  await db.todoCompletions.update(completion.id, { count: completion.count - 1 });
                } else {
                  await db.todoCompletions.delete(completion.id);
                }
              }
              // 若 todo 因这次完成而被归档（非 repeatDaily / 非 isLongTerm），恢复为 active
              if (!todo.isActive && !todo.repeatDaily && !todo.isLongTerm) {
                await db.todos.update(todo.id, { isActive: true, archivedAt: undefined, completedAt: undefined });
              }
            }
          }
        }
      },
    );
    await get().loadData();
  },

  importData: async (jsonData: string) => {
    // 1. 解析 JSON（在修改任何数据前提前报格式错误）
    // 防御性清理：
    //   - 去掉 UTF-8 BOM（\uFEFF），iOS / 一些文本编辑器会在文件开头插入
    //   - 去掉两端空白：从分享面板 / 剪贴板拿到的文本可能带换行或制表符
    //   - 去掉 NULL 字节 \u0000：部分系统的"另存为"或文件往返会注入
    const cleaned = jsonData
      .replace(/^\uFEFF/, '')
      .replace(/\u0000/g, '')
      .trim();

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(cleaned);
    } catch (e) {
      // 把真实的 parse 错误暴露出来，便于定位
      const msg = e instanceof Error ? e.message : String(e);
      // 从错误消息里抠出 position N，截取该位置前后 20 字节，连同 unicode 码点一并展示
      const posMatch = /position\s+(\d+)/i.exec(msg);
      let context = '';
      if (posMatch) {
        const pos = Number(posMatch[1]);
        const from = Math.max(0, pos - 20);
        const to = Math.min(cleaned.length, pos + 20);
        const slice = cleaned.slice(from, to);
        const bad = cleaned.charAt(pos);
        const code = bad ? `U+${bad.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}` : '(文件结尾)';
        context = `；错误位置附近："${slice}"（位置 ${pos} 处字符：${code}）`;
      } else {
        const head = cleaned.slice(0, 80).replace(/\s+/g, ' ');
        context = `；内容开头："${head}"`;
      }
      throw new Error(`JSON 格式错误：${msg}${context}`);
    }

    // 2. 快照当前所有数据，用于失败时恢复
    const snapshot = {
      users: await db.users.toArray(),
      attributes: await db.attributes.toArray(),
      activities: await db.activities.toArray(),
      achievements: await db.achievements.toArray(),
      skills: await db.skills.toArray(),
      settings: await db.settings.toArray(),
      todos: await db.todos.toArray(),
      todoCompletions: await db.todoCompletions.toArray(),
      summaries: await db.summaries.toArray(),
      weeklyGoals: await db.weeklyGoals.toArray(),
      dailyDivinations: await db.dailyDivinations.toArray(),
      longReadings: await db.longReadings.toArray(),
      callingCards: await db.callingCards.toArray(),
      personas: await db.personas.toArray(),
      shadows: await db.shadows.toArray(),
      battleStates: await db.battleStates.toArray(),
      confidants: await db.confidants.toArray(),
      confidantEvents: await db.confidantEvents.toArray(),
      counselArchives: await db.counselArchives.toArray(),
    };

    // 3. 写入新数据；若失败则从快照恢复
    try {
      // 清空现有数据
      await get().resetAllData();

      // 导入用户数据
      if (data.user && Array.isArray(data.user)) {
        for (const user of data.user as unknown[]) {
          const u = user as User;
          await db.users.add({ ...u, createdAt: new Date(u.createdAt) });
        }
      }

      // 导入属性数据
      if (data.attributes && Array.isArray(data.attributes)) {
        await db.attributes.bulkAdd(data.attributes as unknown as Attribute[]);
      }

      // 导入活动数据
      if (data.activities && Array.isArray(data.activities)) {
        for (const activity of data.activities as unknown[]) {
          const a = activity as Activity;
          await db.activities.add({ ...a, date: new Date(a.date) });
        }
      }

      // 导入成就数据
      if (data.achievements && Array.isArray(data.achievements)) {
        for (const achievement of data.achievements as unknown[]) {
          const ac = achievement as Achievement;
          await db.achievements.add({
            ...ac,
            unlockedDate: ac.unlockedDate ? new Date(ac.unlockedDate) : undefined
          });
        }
      }

      // 导入技能数据
      if (data.skills && Array.isArray(data.skills)) {
        await db.skills.bulkAdd(data.skills as unknown as Skill[]);
      }

      // 导入设置数据
      if (data.settings && Array.isArray(data.settings)) {
        await db.settings.bulkAdd(data.settings as unknown as Settings[]);
      }

      // 导入任务数据
      if (data.todos && Array.isArray(data.todos)) {
        for (const todo of data.todos as unknown[]) {
          const t = todo as Todo;
          await db.todos.add({ ...t, createdAt: new Date(t.createdAt) });
        }
      }

      if (data.todoCompletions && Array.isArray(data.todoCompletions)) {
        for (const completion of data.todoCompletions as unknown as TodoCompletion[]) {
          await db.todoCompletions.add(completion);
        }
      }

      // 导入逆影战场数据（v3 新增，v2 备份不含这些字段，跳过即可）
      if (data.personas && Array.isArray(data.personas)) {
        for (const p of data.personas as unknown[]) {
          const persona = p as Persona;
          await db.personas.put({ ...persona, createdAt: new Date(persona.createdAt) });
        }
      }
      if (data.shadows && Array.isArray(data.shadows)) {
        for (const s of data.shadows as unknown[]) {
          const shadow = s as Shadow;
          await db.shadows.put({ ...shadow, createdAt: new Date(shadow.createdAt) });
        }
      }
      if (data.battleStates && Array.isArray(data.battleStates)) {
        await db.battleStates.bulkPut(data.battleStates as unknown as BattleState[]);
      }

      // 星象数据（v6 新增，旧备份缺失则跳过）
      if (data.dailyDivinations && Array.isArray(data.dailyDivinations)) {
        for (const d of data.dailyDivinations as unknown[]) {
          const dd = d as DailyDivination;
          await db.dailyDivinations.put({ ...dd, createdAt: new Date(dd.createdAt) });
        }
      }
      if (data.longReadings && Array.isArray(data.longReadings)) {
        for (const r of data.longReadings as unknown[]) {
          const lr = r as LongReading;
          await db.longReadings.put({
            ...lr,
            createdAt: new Date(lr.createdAt),
            followUps: (lr.followUps ?? []).map(f => ({ ...f, createdAt: new Date(f.createdAt) })),
          });
        }
      }
      if (data.callingCards && Array.isArray(data.callingCards)) {
        for (const c of data.callingCards as unknown[]) {
          const cc = c as CallingCard;
          await db.callingCards.put({
            ...cc,
            createdAt: new Date(cc.createdAt),
            archivedAt: cc.archivedAt ? new Date(cc.archivedAt) : undefined,
          });
        }
      }

      // 周总结（v4 新增字段）
      if (data.summaries && Array.isArray(data.summaries)) {
        for (const s of data.summaries as unknown[]) {
          const ps = s as PeriodSummary;
          await db.summaries.put({ ...ps, createdAt: new Date(ps.createdAt) });
        }
      }
      // 本周目标
      if (data.weeklyGoals && Array.isArray(data.weeklyGoals)) {
        for (const g of data.weeklyGoals as unknown[]) {
          const wg = g as WeeklyGoal;
          await db.weeklyGoals.put({
            ...wg,
            createdAt: new Date(wg.createdAt),
            completedAt: wg.completedAt ? new Date(wg.completedAt) : undefined,
          });
        }
      }

      // 同伴（v5 新增，旧备份缺失则跳过）
      if (data.confidants && Array.isArray(data.confidants)) {
        for (const c of data.confidants as unknown[]) {
          const cf = c as Confidant;
          await db.confidants.put({
            ...cf,
            createdAt: new Date(cf.createdAt),
            lastInteractionAt: cf.lastInteractionAt ? new Date(cf.lastInteractionAt) : undefined,
            archivedAt: cf.archivedAt ? new Date(cf.archivedAt) : undefined,
          });
        }
      }
      if (data.confidantEvents && Array.isArray(data.confidantEvents)) {
        for (const e of data.confidantEvents as unknown[]) {
          const ev = e as ConfidantEvent;
          await db.confidantEvents.put({ ...ev, createdAt: new Date(ev.createdAt) });
        }
      }

      // 谏言归档摘要（v6 新增；旧备份无此字段则跳过）
      if (data.counselArchives && Array.isArray(data.counselArchives)) {
        for (const a of data.counselArchives as unknown[]) {
          const ca = a as CounselArchive;
          await db.counselArchives.put({
            ...ca,
            createdAt: new Date(ca.createdAt),
            sessionStartedAt: new Date(ca.sessionStartedAt),
            sessionEndedAt: new Date(ca.sessionEndedAt),
          });
        }
      }

      // 重新加载应用
      await get().initializeApp();
    } catch (error) {
      console.error('导入数据失败，正在恢复原有数据', error);

      // 4. 恢复快照：先清空（部分写入可能已发生），再写入
      try {
        await get().resetAllData();
        if (snapshot.users.length) await db.users.bulkAdd(snapshot.users);
        if (snapshot.attributes.length) await db.attributes.bulkAdd(snapshot.attributes);
        if (snapshot.activities.length) await db.activities.bulkAdd(snapshot.activities);
        if (snapshot.achievements.length) await db.achievements.bulkAdd(snapshot.achievements);
        if (snapshot.skills.length) await db.skills.bulkAdd(snapshot.skills);
        if (snapshot.settings.length) await db.settings.bulkAdd(snapshot.settings);
        if (snapshot.todos.length) await db.todos.bulkAdd(snapshot.todos);
        if (snapshot.todoCompletions.length) await db.todoCompletions.bulkAdd(snapshot.todoCompletions);
        if (snapshot.summaries.length) await db.summaries.bulkAdd(snapshot.summaries);
        if (snapshot.personas.length) await db.personas.bulkAdd(snapshot.personas);
        if (snapshot.shadows.length) await db.shadows.bulkAdd(snapshot.shadows);
        if (snapshot.battleStates.length) await db.battleStates.bulkAdd(snapshot.battleStates);
        if (snapshot.dailyDivinations.length) await db.dailyDivinations.bulkAdd(snapshot.dailyDivinations);
        if (snapshot.longReadings.length) await db.longReadings.bulkAdd(snapshot.longReadings);
        if (snapshot.callingCards.length) await db.callingCards.bulkAdd(snapshot.callingCards);
        if (snapshot.weeklyGoals.length) await db.weeklyGoals.bulkAdd(snapshot.weeklyGoals);
        if (snapshot.confidants.length) await db.confidants.bulkAdd(snapshot.confidants);
        if (snapshot.confidantEvents.length) await db.confidantEvents.bulkAdd(snapshot.confidantEvents);
        if (snapshot.counselArchives.length) await db.counselArchives.bulkAdd(snapshot.counselArchives);
        await get().initializeApp();
      } catch (restoreError) {
        console.error('恢复原有数据失败:', restoreError);
      }

      throw new Error('导入失败，已恢复原有数据。请检查备份文件是否完整');
    }
  },

  addCustomAchievement: async (achievement) => {
    const newAchievement: Achievement = {
      ...achievement,
      unlocked: false
    };
    await db.achievements.add(newAchievement);
    await get().loadData();
  },

  addCustomSkill: async (skill) => {
    const newSkill: Skill = {
      ...skill,
      unlocked: false
    };
    await db.skills.add(newSkill);
    await get().loadData();
  },

   checkKeywordAchievements: async (description: string, options?: { skipLoad?: boolean }) => {
    const achievements = await db.achievements.toArray();
    const keywordAchievements = achievements.filter(
      a => !a.unlocked && a.condition.type === 'keyword_match' && a.condition.keywords
    );

    for (const achievement of keywordAchievements) {
      const keywords = achievement.condition.keywords || [];
      const hasMatch = keywords.some(keyword => 
        description.toLowerCase().includes(keyword.toLowerCase())
      );

       if (hasMatch) {
         const currentProgress = (achievement.condition.currentProgress || 0) + 1;
         const updatedCondition = {
           ...achievement.condition,
           currentProgress
         };

         await db.achievements.update(achievement.id, {
           condition: updatedCondition
         });
       }
     }

    if (!options?.skipLoad) {
      await get().loadData();
    }
  },

   checkTodoCompletionAchievements: async (options?: { skipLoad?: boolean }) => {
     const achievements = await db.achievements.toArray();
     const todoAchievements = achievements.filter(
       a => !a.unlocked && a.condition.type === 'todo_completions'
     );

     if (todoAchievements.length === 0) return;

     const completions = await db.todoCompletions.toArray();
     const totalCompletions = completions.reduce((sum, item) => sum + item.count, 0);

     for (const achievement of todoAchievements) {
       const progress = Math.min(totalCompletions, achievement.condition.value);
       await db.achievements.update(achievement.id, {
         condition: {
           ...achievement.condition,
           currentProgress: progress
         }
       });

     }

     if (!options?.skipLoad) {
       await get().loadData();
     }
    },

   checkWeeklyGoalAchievements: async (options?: { skipLoad?: boolean }) => {
     const achievements = await db.achievements.toArray();
     const weeklyAchievements = achievements.filter(
       a => !a.unlocked && a.condition.type === 'weekly_goal_completions'
     );

     if (weeklyAchievements.length === 0) return;

     const weeklyGoals = await db.weeklyGoals.toArray();
     const completedCount = weeklyGoals.filter(g => g.completed).length;

     for (const achievement of weeklyAchievements) {
       const progress = Math.min(completedCount, achievement.condition.value);
       await db.achievements.update(achievement.id, {
         condition: { ...achievement.condition, currentProgress: progress }
       });
     }

     if (!options?.skipLoad) {
       await get().loadData();
     }
   },

  checkAllAttributesMaxAchievement: async () => {
    const attributes = await db.attributes.toArray();
    const achievements = await db.achievements.toArray();
    const allAttributesMaxAchievement = achievements.find(
      a => a.condition.type === 'all_attributes_max' && !a.unlocked
    );

    if (allAttributesMaxAchievement) {
      const maxLevelCount = attributes.filter(attr => attr.level >= allAttributesMaxAchievement.condition.value).length;
      await db.achievements.update(allAttributesMaxAchievement.id, {
        condition: {
          ...allAttributesMaxAchievement.condition,
          currentProgress: Math.min(maxLevelCount, attributes.length)
        }
      });
    }
  },

  updateCustomAchievement: async (id: string, achievement: Partial<Achievement>) => {
    await db.achievements.update(id, achievement);
    
    // 同时更新设置中的自定义成就
    const { settings } = get();
    const customAchievements = settings.customAchievements || [];
    const updatedAchievements = customAchievements.map(a => 
      a.id === id ? { ...a, ...achievement } : a
    );
    await get().updateSettings({ customAchievements: updatedAchievements });
    
    await get().loadData();
  },

  updateCustomSkill: async (id: string, skill: Partial<Skill>) => {
    await db.skills.update(id, skill);
    
    // 同时更新设置中的自定义技能
    const { settings } = get();
    const customSkills = settings.customSkills || [];
    const updatedSkills = customSkills.map(s => 
      s.id === id ? { ...s, ...skill } : s
    );
    await get().updateSettings({ customSkills: updatedSkills });
    
    await get().loadData();
  },

  deleteCustomAchievement: async (id: string) => {
    await db.achievements.delete(id);
    
    // 同时从设置中删除
    const { settings } = get();
    const customAchievements = settings.customAchievements || [];
    const updatedAchievements = customAchievements.filter(a => a.id !== id);
    await get().updateSettings({ customAchievements: updatedAchievements });
    
    await get().loadData();
  },

  deleteCustomSkill: async (id: string) => {
    await db.skills.delete(id);
    
    // 同时从设置中删除
    const { settings } = get();
    const customSkills = settings.customSkills || [];
    const updatedSkills = customSkills.filter(s => s.id !== id);
    await get().updateSettings({ customSkills: updatedSkills });
    
    await get().loadData();
  },

  toggleSkillUnlock: async (id: string) => {
    const skill = await db.skills.get(id);
    if (skill) {
      await db.skills.update(id, { unlocked: !skill.unlocked });
      await get().loadData();
    }
  },

  addTodo: async (todo) => {
    const newTodo: Todo = {
      ...todo,
      id: uuidv4(),
      createdAt: new Date()
    };
    await db.todos.add(newTodo);
    await get().loadData();
  },

  updateTodo: async (id, updates) => {
    const existing = await db.todos.get(id);
    if (!existing) return;

    const nextUpdates: Partial<Todo> = { ...updates };

    // Bug fix #7: 关闭"是否启用"仅移到归档，不视为完成一次（不奖励点数）
    if (updates.isActive === false && existing.isActive) {
      if (!existing.archivedAt) {
        nextUpdates.archivedAt = new Date();
      }
    }

    // Bug fix #9: 从归档恢复时，清除今日完成记录，使任务在首页可点击
    if (updates.isActive === true && !existing.isActive) {
      const todayKey = toLocalDateKey();
      await db.todoCompletions.where('todoId').equals(id).filter(c => c.date === todayKey).delete();
      nextUpdates.completedAt = undefined;
    }

    await db.todos.update(id, nextUpdates);
    await get().loadData();
  },

  deleteTodo: async (id) => {
    await db.todos.delete(id);
    await db.todoCompletions.where('todoId').equals(id).delete();
    await get().loadData();
  },

  getTodayTodoProgress: (todoId) => {
    const today = toLocalDateKey();
    const todo = get().todos.find(t => t.id === todoId);
    const target = todo?.frequency === 'count' ? (todo.targetCount || 1) : 1;
    let count: number;
    if (todo?.isLongTerm) {
      // 长期任务：累计所有天的完成次数
      const allCompletions = get().todoCompletions.filter(c => c.todoId === todoId);
      count = allCompletions.reduce((sum, c) => sum + c.count, 0);
    } else {
      const completion = get().todoCompletions.find(c => c.todoId === todoId && c.date === today);
      count = completion?.count || 0;
    }
    return { count, isComplete: count >= target, target };
  },

  getTodoDateLabel: (date: Date) => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0 || diffDays === 1 || diffDays === 2) return '';
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  },

  completeTodo: async (todoId) => {
    const { user, todos } = get();
    if (!user) return null;

    const todo = todos.find(t => t.id === todoId);
    if (!todo || !todo.isActive) return null;

    const today = toLocalDateKey();
    const completion = await db.todoCompletions.where('todoId').equals(todoId).filter(c => c.date === today).first();
    const target = todo.frequency === 'count' ? (todo.targetCount || 1) : 1;

    if (completion && completion.count >= target) return null;

    const newCount = completion ? completion.count + 1 : 1;
    if (completion) {
      await db.todoCompletions.update(completion.id, { count: newCount });
    } else {
      await db.todoCompletions.add({
        id: uuidv4(),
        todoId,
        date: today,
        count: newCount
      });
    }

    const reachedTarget = newCount >= target;
    if (reachedTarget) {
      const points = {
        knowledge: 0,
        guts: 0,
        dexterity: 0,
        kindness: 0,
        charm: 0
      } as Record<string, number>;
      points[todo.attribute] = todo.points;
      // 合并多属性额外加成
      if (todo.extraBoosts) {
        for (const boost of todo.extraBoosts) {
          points[boost.attribute] = (points[boost.attribute] || 0) + boost.points;
        }
      }
      const result = await get().addActivity(`完成任务: ${todo.title}`, points, 'todo', { important: !!todo.important });
      await get().checkTodoCompletionAchievements({ skipLoad: true });

      if (!todo.repeatDaily && !todo.isLongTerm) {
        await db.todos.update(todo.id, { archivedAt: new Date(), completedAt: new Date(), isActive: false });
      }

      // ✦ 倒计时联动：完成 todo 后扫一遍宣告卡，若关联的全部完成会自动归档；
      //   归档后 cutInShown=false，App.tsx 顶层会立即弹出"宣告 · 达成"结算屏，
      //   不需要等用户回到 Dashboard。
      try {
        await get().sweepCallingCards();
      } catch (e) {
        console.warn('[velvet] sweepCallingCards after completeTodo failed', e);
      }

      return result;
    } else {
      await get().loadData();
      return null;
    }
  },

  undoTodayTodoCompletion: async (todoId: string) => {
    // ── 设计契约 ─────────────────────────────────────────
    // "当天误触" 的语义：把这一次 todo 完成当成从未发生过：
    //   · 属性点数扣回，level 跌破阈值则下调
    //   · 历史 activity 记录连同 level_up 副记录一起删掉
    //   · todoCompletion 计数减 1（=0 则整条删）
    //   · todo 重新 isActive=true、清掉 completedAt/archivedAt
    // 实现复用 deleteActivity 已有的事务化撤销（v2.1 改造），保证语义统一。
    const todo = get().todos.find(t => t.id === todoId);
    if (!todo) return;

    const today = toLocalDateKey();
    const all = await db.activities.toArray();
    // 注意：completeTodo 的 description 模板是 `完成任务: ${todo.title}`，这里逐字匹配
    const expectedDesc = `完成任务: ${todo.title}`;
    const target = all.find(a =>
      a.method === 'todo'
      && toLocalDateKey(new Date(a.date)) === today
      && a.description === expectedDesc,
    );

    if (target) {
      await get().deleteActivity(target.id);
      return;
    }

    // 兜底：找不到对应活动（例如老数据没记 method='todo'，或描述被改过）
    // 至少把 todoCompletion / todo 状态还原成"未完成"，否则按钮形同虚设。
    await db.transaction('rw', [db.todos, db.todoCompletions], async () => {
      const completion = await db.todoCompletions
        .where('todoId').equals(todoId)
        .filter(c => c.date === today)
        .first();
      if (completion) {
        if (completion.count > 1) {
          await db.todoCompletions.update(completion.id, { count: completion.count - 1 });
        } else {
          await db.todoCompletions.delete(completion.id);
        }
      }
      const t = await db.todos.get(todoId);
      if (t && !t.isActive) {
        await db.todos.update(todoId, { isActive: true, completedAt: undefined, archivedAt: undefined });
      }
    });
    await get().loadData();
  },

  applySkillBonus: (attributeId: string, points: number) => {
    const { skills } = get();
    const unlockedSkills = skills.filter(s => s.unlocked && s.requiredAttribute === attributeId);

    let totalBonus = 1;
    let totalFlat = 0;
    for (const skill of unlockedSkills) {
      if (skill.bonusMultiplier) {
        totalBonus *= skill.bonusMultiplier;
      }
      if (skill.flatBonus) {
        totalFlat += skill.flatBonus;
      }
    }

    const boosted = Math.round(points * totalBonus) + totalFlat;
    if (totalBonus > 1 && boosted === points + totalFlat) {
      return points + totalFlat + 1;
    }
    return boosted;
  },

  // ── 总结功能 ─────────────────────────────────────────────

  getSummaryLabel: (period: SummaryPeriod, startDate: string): string => {
    const d = new Date(startDate);
    if (period === 'month') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月`;
    }
    // week: compute ISO week number
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}年第${weekNo}周`;
  },

  getActiveSummaryPreset: (): SummaryPromptPreset => {
    const { settings } = get();
    const presets = settings.summaryPromptPresets ?? DEFAULT_SUMMARY_PROMPT_PRESETS;
    const activeId = settings.summaryActivePresetId ?? 'igor';
    return (
      presets.find(p => p.id === activeId) ??
      FAMILIAR_FACE_PRESETS.find(p => p.id === activeId) ??
      DEFAULT_SUMMARY_PROMPT_PRESETS.find(p => p.id === activeId) ??
      presets[0] ??
      DEFAULT_SUMMARY_PROMPT_PRESETS[0]
    );
  },

  loadSummaries: async () => {
    const summaries = await db.summaries.orderBy('startDate').reverse().toArray();
    set({ summaries });
  },

  saveSummary: async (summary: PeriodSummary) => {
    await db.summaries.put(summary);
    await get().loadSummaries();
  },

  deleteSummary: async (id: string) => {
    await db.summaries.delete(id);
    await get().loadSummaries();
  },

  buildSummaryRequest: async (period: SummaryPeriod, startDate: string, endDate: string): Promise<SummaryRequestData> => {
    const { settings, attributes } = get();

    if (!settings.summaryApiKey) {
      throw new Error('请先在设置中配置 AI API 密钥');
    }

    const allActivities = await db.activities.toArray();
    const periodActivities = allActivities.filter(a => {
      const dateKey = toLocalDateKey(new Date(a.date));
      return dateKey >= startDate && dateKey <= endDate;
    });

    const includeSpecial = settings.summaryIncludeSpecial === true;
    const shouldInclude = (cat?: string): boolean => {
      if (!cat) return true;              // 普通手动记录
      if (cat === 'confidant') return true; // 同伴条目始终纳入（用户要求）
      if (SUMMARY_SPECIAL_CATS.has(cat)) return includeSpecial;
      return true;                         // 其他未知类别默认纳入
    };

    const attrPoints: Record<string, number> = {
      knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0
    };
    for (const act of periodActivities) {
      if (!shouldInclude(act.category)) continue;
      attrPoints.knowledge += act.pointsAwarded.knowledge || 0;
      attrPoints.guts += act.pointsAwarded.guts || 0;
      attrPoints.dexterity += act.pointsAwarded.dexterity || 0;
      attrPoints.kindness += act.pointsAwarded.kindness || 0;
      attrPoints.charm += act.pointsAwarded.charm || 0;
    }
    const totalPoints = Object.values(attrPoints).reduce((s, v) => s + v, 0);
    const attrNames = settings.attributeNames;
    const periodLabel = get().getSummaryLabel(period, startDate);
    const included = periodActivities.filter(a => shouldInclude(a.category));
    const activityCount = included.length;

    const attrSummaryLines = Object.entries(attrPoints)
      .map(([id, pts]) => `- ${attrNames[id as keyof typeof attrNames] ?? id}${pts} 点（当前等级 Lv.${attributes.find(a => a.id === id)?.level ?? '?'}）`)
      .join('\n');

    const activityLines = included
      .slice(0, 50)
      .map(a => {
        const tag = a.category ? (SUMMARY_CATEGORY_TAGS[a.category] ?? '') : '';
        return `[${new Date(a.date).toLocaleDateString('zh-CN')}]${tag ? ' ' + tag : ''} ${a.description}`;
      })
      .join('\n');

     const userMessage = `本期${periodLabel}（${startDate} ~ ${endDate}）成长记录：

## 属性加点统${attrSummaryLines}
总计${totalPoints} 点，${activityCount} 条记录${includeSpecial ? '（含战场 / 本周目标 / 逆流等特殊条目）' : ''}
## 活动记录详情
${activityLines || '（本期暂无记录）'}

请根据以上信息，生成本期成长总结与下期建议。`;

    const preset = get().getActiveSummaryPreset();
    const systemPrompt = preset.systemPrompt || DEFAULT_SUMMARY_PROMPT_PRESETS[0].systemPrompt;

    const { baseUrl, model } = resolveProvider(
      settings.summaryApiProvider,
      settings.summaryApiBaseUrl,
      settings.summaryModel,
    );

    return {
      baseUrl,
      model,
      apiKey: settings.summaryApiKey,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      periodLabel,
      preset,
      totalPoints,
      attributePoints: attrPoints,
      activityCount,
      period,
      startDate,
      endDate,
    };
  },

  generateSummary: async (period: SummaryPeriod, startDate: string, endDate: string): Promise<PeriodSummary> => {
    const { settings, attributes } = get();

    // 检API 配置
    if (!settings.summaryApiKey) {
      throw new Error('请先在设置中配置 AI API 密钥');
    }

    // 获取该时间段内的活动记录（用本地日期字符串比较，避免UTC偏移导致跨月首日丢失）
    const allActivities = await db.activities.toArray();
    const periodActivities = allActivities.filter(a => {
      const dateKey = toLocalDateKey(new Date(a.date));
      return dateKey >= startDate && dateKey <= endDate;
    });

    const includeSpecial = settings.summaryIncludeSpecial === true;
    const shouldInclude = (cat?: string): boolean => {
      if (!cat) return true;
      if (cat === 'confidant') return true;
      if (SUMMARY_SPECIAL_CATS.has(cat)) return includeSpecial;
      return true;
    };

    // 统计各属性加点
    const attrPoints: Record<string, number> = {
      knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0
    };
    for (const act of periodActivities) {
      if (!shouldInclude(act.category)) continue;
      attrPoints.knowledge += act.pointsAwarded.knowledge || 0;
      attrPoints.guts += act.pointsAwarded.guts || 0;
      attrPoints.dexterity += act.pointsAwarded.dexterity || 0;
      attrPoints.kindness += act.pointsAwarded.kindness || 0;
      attrPoints.charm += act.pointsAwarded.charm || 0;
    }
    const totalPoints = Object.values(attrPoints).reduce((s, v) => s + v, 0);
    const attrNames = settings.attributeNames;

    // 构建用户消息
    const periodLabel = get().getSummaryLabel(period, startDate);
    const attrSummaryLines = Object.entries(attrPoints)
      .map(([id, pts]) => `- ${attrNames[id as keyof typeof attrNames] ?? id}${pts} 点（当前等级 Lv.${attributes.find(a => a.id === id)?.level ?? '?'}）`)
      .join('\n');

    const activityLines = periodActivities
      .filter(a => shouldInclude(a.category))
      .slice(0, 50) // 最50 条，防止 token 过多
      .map(a => {
        const tag = a.category ? (SUMMARY_CATEGORY_TAGS[a.category] ?? '') : '';
        return `[${new Date(a.date).toLocaleDateString('zh-CN')}]${tag ? ' ' + tag : ''} ${a.description}`;
      })
      .join('\n');

     const userMessage = `本期${periodLabel}（${startDate} ~ ${endDate}）成长记录：

## 属性加点统${attrSummaryLines}
总计${totalPoints} 点，${periodActivities.filter(a => !a.category).length} 条记
## 活动记录详情
${activityLines || '（本期暂无记录）'}

请根据以上信息，生成本期成长总结与下期建议。`;

     // 获取当前 preset
     const preset = get().getActiveSummaryPreset();
    const systemPrompt = preset.systemPrompt || DEFAULT_SUMMARY_PROMPT_PRESETS[0].systemPrompt;

    // 确定 API endpoint
    const { baseUrl, model } = resolveProvider(
      settings.summaryApiProvider,
      settings.summaryApiBaseUrl,
      settings.summaryModel,
    );

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.summaryApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`API 请求失败 (${response.status}): ${errBody || response.statusText}`);
    }

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    if (!content) throw new Error('AI 返回内容为空，请重试');

    const summary: PeriodSummary = {
      id: uuidv4(),
      period,
      startDate,
      endDate,
      label: periodLabel,
      content,
      promptPresetId: preset.id,
      promptPresetName: preset.name,
      totalPoints,
      attributePoints: attrPoints,
      activityCount: periodActivities.filter(a => !a.category).length,
      createdAt: new Date(),
    };

    return summary;
  },

  // ── 本周目标 ─────────────────────────────────────────────

  saveWeeklyGoal: async (goal: WeeklyGoal) => {
    await db.weeklyGoals.put(goal);
    await get().loadData();
  },

  deleteWeeklyGoal: async (id: string) => {
    await db.weeklyGoals.delete(id);
    await get().loadData();
  },

  completeWeeklyGoal: async (id: string, rewardAttribute: AttributeId) => {
    const goal = await db.weeklyGoals.get(id);
    if (!goal || goal.completed) return;

    // 奖励点数：LV3+ 7, 否则 5
    const { attributes, user } = get();
    const attr = attributes.find(a => a.id === rewardAttribute);
    const rewardPoints = (attr && attr.level >= 3) ? 7 : 5;

    // 标记完成
    await db.weeklyGoals.update(id, {
      completed: true,
      completedAt: new Date(),
      rewardAttribute,
      rewardPoints,
    });

    if (user) {
      // 直接加点（不经过 addActivity 的每日事件倍率 / 技能加成）
      if (attr) {
        const newPoints = attr.points + rewardPoints;
        const attrThresholds = get().settings.levelThresholds?.length
          ? get().settings.levelThresholds
          : attr.levelThresholds;
        let newLevel = attr.level;
        while (newLevel < attrThresholds.length && newPoints >= attrThresholds[newLevel]) {
          newLevel++;
        }
        await db.attributes.update(attr.id, { points: newPoints, level: newLevel });
      }

      // 记入历史记录
      const rewardAttrName = get().settings.attributeNames[rewardAttribute] || rewardAttribute;
      const pointsAwarded = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
      pointsAwarded[rewardAttribute] = rewardPoints;
      await db.activities.add({
        id: uuidv4(),
        userId: user.id,
        date: new Date(),
        description: `本周目标达成！奖${rewardAttrName} +${rewardPoints}${goal.reward ? `{goal.reward}）` : ''}`,
        pointsAwarded,
        method: 'local' as const,
        important: true,
        category: 'weekly_goal',
      });
    }

    // 检查计划通等每周目标完成成就
    await get().checkWeeklyGoalAchievements({ skipLoad: true });

    await get().loadData();
  },

  getWeeklyGoalProgress: (goal: WeeklyGoal): WeeklyGoalItem[] => {
    const { activities, todoCompletions } = get();
    const start = goal.weekStart;
    const end = goal.weekEnd;

    // 本周活动
    const weekActivities = activities.filter(a => {
      const d = toLocalDateKey(new Date(a.date));
      return d >= start && d <= end && !a.category; // 排除系统活动
    });

    // 本周任务完成
    const weekTodoCompletions = todoCompletions.filter(c => c.date >= start && c.date <= end);
    const totalTodoCount = weekTodoCompletions.reduce((s, c) => s + c.count, 0);

    return goal.goals.map(g => {
      let current = 0;
      switch (g.type) {
        case 'activity_count':
          current = weekActivities.filter(a => {
            if (!g.attribute) return true;
            return (a.pointsAwarded[g.attribute as keyof typeof a.pointsAwarded] || 0) > 0;
          }).length;
          break;
        case 'todo_count':
          current = totalTodoCount;
          break;
        case 'attr_points':
          if (g.attribute) {
            current = weekActivities.reduce((s, a) =>
              s + (a.pointsAwarded[g.attribute as keyof typeof a.pointsAwarded] || 0), 0);
          }
          break;
        case 'total_points':
          current = weekActivities.reduce((s, a) =>
            s + Object.values(a.pointsAwarded).reduce((x, y) => x + y, 0), 0);
          break;
      }
      return { ...g, current };
    });
  },

  // ── 逆流 ─────────────────────────────────────────────────

  /** 共用：判断某属性过lookback 天（不含今天）是否有正向增长 */

  // 返回今天需要扣减的属性列表（连续3日无增长，且今天还未扣减过）
  // 3日窗口为 today-3 .. today-1，且需早于 countercurrentEnabledAt+3 才会触发
  applyCountercurrentDecay: async (): Promise<AttributeId[]> => {
    const { settings, attributes, user } = get();
    if (!settings.countercurrentEnabled || !user) return [];

    const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
    const todayKey = toLocalDateKey();
    const decayed: AttributeId[] = [];

    // Must have been enabled at least 3 full days ago for decay to possibly fire
    if (settings.countercurrentEnabledAt) {
      const enabledDate = new Date(settings.countercurrentEnabledAt + 'T00:00:00');
      const todayDate = new Date(todayKey + 'T00:00:00');
      const daysSinceEnabled = Math.floor((todayDate.getTime() - enabledDate.getTime()) / 86400000);
      if (daysSinceEnabled < 3) return [];
    }

    // Past 3 days (today-1, today-2, today-3) all 3 must have no growth
    const dayKeys: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayKeys.push(toLocalDateKey(d));
    }

    const activities = await db.activities.toArray();

    for (const attrId of ATTR_IDS) {
      const attr = attributes.find(a => a.id === attrId);
      if (!attr) continue;
      if (attr.points <= 0) continue;

      // No growth in past 3 days?
      const hadGrowth = dayKeys.some(dk =>
        activities.some(a =>
          toLocalDateKey(new Date(a.date)) === dk &&
          !a.category &&
          (a.pointsAwarded[attrId as keyof typeof a.pointsAwarded] || 0) > 0
        )
      );
      if (hadGrowth) continue;

      // Today's decay not yet applied
      const alreadyDecayed = activities.some(a =>
        toLocalDateKey(new Date(a.date)) === todayKey &&
        a.category === 'countercurrent' &&
        (a.pointsAwarded[attrId as keyof typeof a.pointsAwarded] || 0) < 0
      );
      if (alreadyDecayed) continue;

      decayed.push(attrId);
    }

    if (decayed.length === 0) return [];

    for (const attrId of decayed) {
      const attr = attributes.find(a => a.id === attrId);
      if (!attr) continue;
      const newPoints = Math.max(0, attr.points - 1);
      const thresholds = settings.levelThresholds?.length ? settings.levelThresholds : attr.levelThresholds;
      let newLevel = 1;
      for (let lv = thresholds.length - 1; lv >= 0; lv--) {
        if (newPoints >= thresholds[lv]) { newLevel = lv + 1; break; }
      }
      await db.attributes.update(attrId, { points: newPoints, level: newLevel });

      const attrName = settings.attributeNames[attrId] || attrId;
      const pointsAwarded = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
      pointsAwarded[attrId] = -1;
      await db.activities.add({
        id: uuidv4(),
        userId: user.id,
        date: new Date(),
        description: `逆流 ${attrName} -1（连日无增长）`,
        pointsAwarded,
        method: 'local' as const,
        important: false,
        category: 'countercurrent' as Activity['category'],
      });
    }

    await get().loadData();
    return decayed;
  },

  // 返回明天将要扣减的属性（今天是连续无增长天，明天会触decay  // 逻辑：今+ 过去2天（天）均无增长，且今天没有decay记录（已经decay就不再预警）  // 且距离开启日至少2 天（否则明天也不会触发）
  getCountercurrentWarnings: (): AttributeId[] => {
    const { settings, attributes, activities } = get();
    if (!settings.countercurrentEnabled) return [];

    const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
    const todayKey = toLocalDateKey();
    const warnings: AttributeId[] = [];

    // Need at least 2 full days since enabled for tomorrow's decay to potentially fire
    if (settings.countercurrentEnabledAt) {
      const enabledDate = new Date(settings.countercurrentEnabledAt + 'T00:00:00');
      const todayDate = new Date(todayKey + 'T00:00:00');
      const daysSinceEnabled = Math.floor((todayDate.getTime() - enabledDate.getTime()) / 86400000);
      if (daysSinceEnabled < 2) return [];
    }

    // Today + past 2 days = 3-day window ending today
    const dayKeys: string[] = [];
    for (let i = 0; i <= 2; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayKeys.push(toLocalDateKey(d));
    }

    for (const attrId of ATTR_IDS) {
      const attr = attributes.find(a => a.id === attrId);
      if (!attr || attr.points <= 0) continue;

      const hadGrowth = dayKeys.some(dk =>
        activities.some(a =>
          toLocalDateKey(new Date(a.date)) === dk &&
          !a.category &&
          (a.pointsAwarded[attrId as keyof typeof a.pointsAwarded] || 0) > 0
        )
      );
      if (hadGrowth) continue;

      // If today already decayed, no warning needed (decay already happened this morning)
      const decayedToday = activities.some(a =>
        toLocalDateKey(new Date(a.date)) === todayKey &&
        a.category === 'countercurrent' &&
        (a.pointsAwarded[attrId as keyof typeof a.pointsAwarded] || 0) < 0
      );
      if (decayedToday) continue;

      warnings.push(attrId);
    }
    return warnings;
  },

  // ── 逆影战场 ─────────────────────────────────────────────

  loadBattleData: async () => {
    try {
      const [personas, shadows, battleStates] = await Promise.all([
        db.personas.toArray(),
        db.shadows.toArray(),
        db.battleStates.toArray(),
      ]);
      set({ persona: personas[0] || null, shadow: shadows[0] || null, battleState: battleStates[0] || null });
    } catch { /* ignore */ }
  },

  savePersona: async (persona: Persona) => {
    await db.personas.clear();
    await db.personas.put(persona);
    set({ persona });
  },

  saveShadow: async (shadow: Shadow) => {
    await db.shadows.clear();
    await db.shadows.put(shadow);
    set({ shadow });
  },

  saveBattleState: async (state: BattleState) => {
    await db.battleStates.put(state);
    set({ battleState: state });
  },

  earnSP: async (amount: number) => {
    const { battleState, settings } = get();
    if (!battleState) return;
    const multiplier = settings.battleSpMultiplier ?? 1.0;
    const earned = Math.round(amount * multiplier);
    const updated = { ...battleState, sp: battleState.sp + earned, totalSpEarned: battleState.totalSpEarned + earned };
    await get().saveBattleState(updated);
  },

  performBattleAction: async (action: BattleAction, shadowHpType: 'hp1' | 'hp2', allowShadowAttack = true) => {
    const { battleState, shadow } = get();
    if (!battleState || !shadow) return { shadowDefeated: false, playerDefeated: false, phase2Triggered: false, isWeakness: false, actualDamage: 0, shadowCrit: false, shadowAtkValue: 0, healAmount: 0 };
    const newSp = Math.max(0, battleState.sp - action.spCost);
    // 弱点判断：damage/crit 类型命中弱点时伤害×1.5
    const isDamageType = action.type === 'damage' || action.type === 'crit' || action.type === 'attack_boost';
    const isWeakness = isDamageType && action.skillAttribute !== undefined && action.skillAttribute === shadow.weakAttribute;
    // 同伴永久战斗技能加成：该属性技能固定 +N 伤害（damage_plus）
    const damagePlusMap = sumDamagePlus(get().confidants);
    const confidantDamageBonus = (isDamageType && action.skillAttribute)
      ? (damagePlusMap[action.skillAttribute] ?? 0)
      : 0;
    const baseDamage = isDamageType ? (isWeakness ? Math.round(action.value * 1.5) : action.value) : 0;
    const actualDamage = baseDamage > 0 ? baseDamage + confidantDamageBonus : 0;
    // heal 类型：回复玩家HP
    const healAmount = action.type === 'heal' ? action.value : 0;
    let newHp1 = shadow.currentHp;
    let newHp2 = shadow.currentHp2 ?? 0;
    if (isDamageType) {
      if (shadowHpType === 'hp1') newHp1 = Math.max(0, shadow.currentHp - actualDamage);
      else newHp2 = Math.max(0, (shadow.currentHp2 ?? 0) - actualDamage);
    }
    const isPhase2 = battleState.status === 'shadow_phase2';
    const baseShadowAtk = (shadow.attackPower ?? 2) + (isPhase2 ? 1 : 0);
    // Shadow 逐级暴击：Lv1=0%, Lv2=10%, Lv3=15%, Lv4=20%, Lv5=30%
    const shadowCritChances = [0, 0.1, 0.15, 0.2, 0.3];
    const shadowCritChance = shadowCritChances[Math.min((shadow.level ?? 1) - 1, 4)];
    const shadowCrit = allowShadowAttack && Math.random() < shadowCritChance;
    const shadowAtkValue = allowShadowAttack ? (shadowCrit ? baseShadowAtk * 2 : baseShadowAtk) : 0;
    const newPlayerHp = Math.max(0, Math.min(battleState.playerMaxHp, battleState.playerHp + healAmount - shadowAtkValue));
    const phase2Triggered = shadowHpType === 'hp1' && newHp1 <= 0 && shadow.maxHp2 !== undefined && !isPhase2;
    const shadowDefeated = (shadowHpType === 'hp1' && newHp1 <= 0 && shadow.maxHp2 === undefined) || (shadowHpType === 'hp2' && newHp2 <= 0);
    const playerDefeated = newPlayerHp <= 0;
    const logEntry: BattleLogEntry = {
      id: uuidv4(),
      date: toLocalDateKey(),
      playerActions: [action],
      shadowResponse: SHADOW_RESPONSE_LINES[Math.floor(Math.random() * SHADOW_RESPONSE_LINES.length)],
      playerHpBefore: battleState.playerHp, playerHpAfter: newPlayerHp,
      shadowHpBefore: shadowHpType === 'hp1' ? shadow.currentHp : (shadow.currentHp2 ?? 0),
      shadowHpAfter: shadowHpType === 'hp1' ? newHp1 : newHp2,
    };
    let newStatus = battleState.status;
    if (shadowDefeated) newStatus = 'victory';
    else if (playerDefeated) newStatus = 'session_end';
    else if (phase2Triggered) newStatus = 'shadow_phase2';
    await get().saveShadow({ ...shadow, currentHp: newHp1, currentHp2: newHp2 });
    await get().saveBattleState({ ...battleState, sp: newSp, playerHp: newPlayerHp, status: newStatus, battleLog: [...battleState.battleLog.slice(-50), logEntry], lastBattleDate: toLocalDateKey() });
    return { shadowDefeated, playerDefeated, phase2Triggered, isWeakness, actualDamage, shadowCrit, shadowAtkValue, healAmount };
  },

  checkShadowHpRegen: async () => {
    const { shadow } = get();
    if (!shadow) return;
    const today = toLocalDateKey();
    if (shadow.lastHpRegenDate === today) return;
    const regenPerDay = SHADOW_REGEN_PER_LEVEL[Math.min(shadow.level - 1, 4)] ?? 2;
    const lastRegen = shadow.lastHpRegenDate;
    let daysElapsed = 1;
    if (lastRegen) {
      const lastDate = new Date(lastRegen + 'T00:00:00');
      const todayDate = new Date(today + 'T00:00:00');
      daysElapsed = Math.max(1, Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000));
    }
    const totalRegen = regenPerDay * daysElapsed;
    const newHp1 = Math.min(shadow.maxHp, shadow.currentHp + totalRegen);
    const newHp2 = shadow.maxHp2 !== undefined
      ? Math.min(shadow.maxHp2, (shadow.currentHp2 ?? shadow.maxHp2) + totalRegen)
      : undefined;
    await get().saveShadow({ ...shadow, currentHp: newHp1, currentHp2: newHp2, lastHpRegenDate: today });
  },

  startBattleSession: () => {
    const { battleState, shadow, settings } = get();
    if (!battleState) return;
    const baseHp = settings.battlePlayerMaxHp ?? 8;
    const maxHp = baseHp + (battleState.hpBonusFromDefeats ?? 0);
    const alreadyPhase2 = shadow !== null && shadow.maxHp2 !== undefined &&
      shadow.currentHp <= 0 && (shadow.currentHp2 ?? shadow.maxHp2) > 0;
    const newStatus = alreadyPhase2 ? 'shadow_phase2' as const : 'in_battle' as const;
    const updated = { ...battleState, playerHp: maxHp, playerMaxHp: maxHp, status: newStatus, lastChallengeDate: toLocalDateKey() };
    set({ battleState: updated });
    get().saveBattleState(updated);
  },

  endBattleSession: () => {
    const { battleState } = get();
    if (!battleState) return;
    // Preserve shadow_phase2 across sessions so re-entry detects it via shadow HP
    const newStatus = battleState.status === 'shadow_phase2' ? 'idle' as const : 'idle' as const;
    const updated = { ...battleState, status: newStatus };
    set({ battleState: updated });
    get().saveBattleState(updated);
  },

  defeatShadow: async () => {
    const { battleState, shadow } = get();
    if (!battleState) return;
    const newRecord = shadow ? {
      shadowName: shadow.name,
      level: shadow.level,
      breachDate: new Date(shadow.createdAt).toISOString().slice(0, 10),
      defeatDate: new Date().toISOString().slice(0, 10),
      daysElapsed: Math.max(1, Math.floor((Date.now() - new Date(shadow.createdAt).getTime()) / 86400000)),
    } : null;
    // HP bonus from defeating this shadow
    const hpGain = shadow ? (HP_BONUS_PER_DEFEAT[Math.min(shadow.level - 1, 4)] ?? 2) : 0;
    const newHpBonus = (battleState.hpBonusFromDefeats ?? 0) + hpGain;
    const updated: BattleState = {
      ...battleState,
      status: 'idle',
      shadowsDefeated: battleState.shadowsDefeated + 1,
      shadowId: '',
      lastDefeatedWeakAttribute: shadow?.weakAttribute,
      defeatedShadowLog: newRecord
        ? [...(battleState.defeatedShadowLog ?? []), newRecord]
        : battleState.defeatedShadowLog,
      hpBonusFromDefeats: newHpBonus,
    };
    await get().saveBattleState(updated);
  },

  resetBattle: async () => {
    // 保留未使用的 SP
    const { battleState: prev } = get();
    const preservedSp = prev?.sp ?? 0;
    const preservedTotalSp = prev?.totalSpEarned ?? 0;
    await db.personas.clear();
    await db.shadows.clear();
    await db.battleStates.clear();
    if (preservedSp > 0) {
      const freshState: BattleState = {
        id: 'current',
        shadowId: '',
        personaId: '',
        playerHp: 10,
        playerMaxHp: 10,
        sp: preservedSp,
        totalSpEarned: preservedTotalSp,
        battleLog: [],
        status: 'idle',
        shadowsDefeated: 0,
      };
      await db.battleStates.put(freshState);
      set({ persona: null, shadow: null, battleState: freshState });
    } else {
      set({ persona: null, shadow: null, battleState: null });
    }
  },

  equipMask: async (attr: AttributeId | null) => {
    const { persona } = get();
    if (!persona) return;
    const updated = { ...persona, equippedMaskAttribute: attr };
    await db.personas.put(updated);
    set({ persona: updated });
  },

  // ── 同伴 / Confidant ─────────────────────────────────────────

  loadConfidants: async () => {
    const [confidants, events] = await Promise.all([
      db.confidants.orderBy('createdAt').toArray(),
      db.confidantEvents.orderBy('createdAt').reverse().toArray(),
    ]);
    set({ confidants, confidantEvents: events });
  },

  addConfidant: async (params) => {
    // 串行化并发创建请求，否则两次 addConfidant 可能同时读到"未占用"再各自写入，绕过唯一性检查
    const run = async () => {
      const { name, description, match, source = 'offline', linkedCloudUserId, linkedEmail, initialLevel, skillAttribute } = params;
      const { user, settings } = get();
      if (!user) throw new Error('尚未创建档案');
      // 去重：在线同伴每个 linkedCloudUserId 至多一张卡（含归档）
      // 读最新 Dexie 表 + 最新内存快照（两次 await 之间可能刚被前一个 lock hold 改过）
      const allInDb = await db.confidants.toArray();
      if (source === 'online' && linkedCloudUserId) {
        const dbHit = allInDb.find(c => c.source === 'online' && c.linkedCloudUserId === linkedCloudUserId);
        if (dbHit) {
          await get().loadConfidants();
          throw new Error('同伴卡已存在（每位在线好友只能有一张 COOP 卡）');
        }
      }
      if (allInDb.some(c => !c.archivedAt && c.arcanaId === match.arcanaId)) {
        throw new Error('该阿卡纳已被另一位同伴占用');
      }
      const now = new Date();
      // 用户选择的等级优先；否则使用 AI 建议
      const chosenLv = typeof initialLevel === 'number'
        ? Math.max(1, Math.min(MAX_INTIMACY, Math.floor(initialLevel)))
        : Math.max(1, match.initialIntimacy);
      const basePts = levelBasePoints(chosenLv);
      const buffs = buffsForLevel(match.arcanaId, chosenLv, settings.attributeNames, skillAttribute);
      const confidant: Confidant = {
        id: uuidv4(),
        userId: user.id,
        source,
        linkedCloudUserId,
        linkedEmail,
        name: name.trim() || '（未命名同伴）',
        arcanaId: match.arcanaId,
        orientation: match.orientation,
        description: description.trim(),
        aiInterpretation: match.interpretation,
        aiAdvice: match.advice,
        intimacy: chosenLv,
        intimacyPoints: basePts,
        skillAttribute,
        buffs,
        decayEnabled: false,
        lastInteractionAt: now,
        createdAt: now,
      };
      const event: ConfidantEvent = {
        id: uuidv4(),
        confidantId: confidant.id,
        date: toLocalDateKey(now),
        type: 'created',
        narrative: match.interpretation.slice(0, 80),
        createdAt: now,
      };
      await db.confidants.add(confidant);
      await db.confidantEvents.add(event);
      await get().loadConfidants();
      return confidant;
    };
    const next = _addConfidantLock.then(run, run); // 上一个失败也要继续后续请求
    _addConfidantLock = next.catch(() => { /* 不把 reject 挂到锁上 */ });
    return next;
  },

  updateConfidant: async (id, patch) => {
    const existing = await db.confidants.get(id);
    if (!existing) return;
    await db.confidants.put({ ...existing, ...patch });
    await get().loadConfidants();
  },

  bumpConfidantIntimacy: async (id, delta, eventType = 'intimacy_up', narrative, extra) => {
    const current = await db.confidants.get(id);
    if (!current) return { leveledUp: false, newIntimacy: 0, starShiftGained: 0, eventId: '' };
    const { settings } = get();
    const oldLv = current.intimacy;
    const newPoints = Math.max(0, current.intimacyPoints + delta);
    const newLv = pointsToLevel(newPoints);
    const leveledUp = newLv > oldLv;
    const buffs = leveledUp ? buffsForLevel(current.arcanaId, newLv, settings.attributeNames, current.skillAttribute) : current.buffs;
    // 每次升级赠送 1 次"星移"次数（Lv 跳跃两级则赠送两次）
    const starShiftGained = leveledUp ? (newLv - oldLv) : 0;
    const newCharges = Math.max(0, (current.starShiftCharges ?? 0) + starShiftGained);
    const now = new Date();
    await db.confidants.put({
      ...current,
      intimacy: newLv,
      intimacyPoints: newPoints,
      buffs,
      starShiftCharges: newCharges,
      lastInteractionAt: now,
      // COOP 远端事件应用时把 lastInteractionDate 也同步到当天，让"今日已互动"判定生效
      ...(extra?.lastInteractionDate ? { lastInteractionDate: extra.lastInteractionDate } : {}),
    });
    // 事件记录 —— eventId 可由调用方覆盖（COOP 远端事件需要保持双方 id 一致以便去重）
    const eventId = extra?.eventId || uuidv4();
    const eventDate = extra?.eventDate || toLocalDateKey(now);
    const events: ConfidantEvent[] = [];
    events.push({
      id: eventId,
      confidantId: id,
      date: eventDate,
      type: delta >= 0 ? eventType : 'intimacy_down',
      delta,
      narrative,
      userInput: extra?.userInput,
      advice: extra?.advice,
      createdAt: now,
    });
    if (leveledUp) {
      events.push({
        id: uuidv4(),
        confidantId: id,
        date: toLocalDateKey(now),
        type: 'level_up',
        toLevel: newLv,
        narrative: `亲密度到达 Lv.${newLv}`,
        createdAt: new Date(now.getTime() + 1),
      });
      // 对比新增 buffs
      const newKinds = new Set(current.buffs.map(b => b.kind));
      const unlocked = buffs.filter(b => !newKinds.has(b.kind));
      for (const b of unlocked) {
        events.push({
          id: uuidv4(),
          confidantId: id,
          date: toLocalDateKey(now),
          type: 'buff_unlocked',
          narrative: `解锁「${b.title}」：${b.description}`,
          createdAt: new Date(now.getTime() + 2),
        });
      }
    }
    await db.confidantEvents.bulkAdd(events);
    await get().loadConfidants();
    return { leveledUp, newIntimacy: newLv, starShiftGained, eventId };
  },

  recordConfidantInteraction: async ({ id, description, delta, narrative, advice, createActivity, activityAttribute, activityPoints }) => {
    const current = await db.confidants.get(id);
    if (!current) return { leveledUp: false, newIntimacy: 0 };
    const today = toLocalDateKey();
    if (current.lastInteractionDate === today) {
      throw new Error('今天已经和 Ta 解读过了，明天再来吧');
    }
    // 先把 lastInteractionDate 写进去（与 bumpConfidantIntimacy 的 loadConfidants 合并）
    await db.confidants.put({ ...current, lastInteractionDate: today });
    // 再 bump 亲密度：narrative=AI 解读、advice=相处建议、userInput=用户原话分别存储
    const res = await get().bumpConfidantIntimacy(
      id, delta, 'conversation', narrative,
      { userInput: description.trim(), advice, lastInteractionDate: today },
    );

    // 在线 COOP：把这条事件广播给对方，让 Ta 的本地共享同一条 event_id + intimacy 同步
    if (current.source === 'online' && current.linkedCloudUserId) {
      void (async () => {
        try {
          const { pb, getUserId } = await import('@/services/pocketbase');
          if (!pb || !pb.authStore.isValid) {
            console.warn('[velvet-store] coop broadcast skipped: not logged in');
            return;
          }
          const me = getUserId();
          if (!me) {
            console.warn('[velvet-store] coop broadcast skipped: no user id');
            return;
          }
          // 用现有的 event_logged 类型 + payload.kind = 'coop_event' 区分，
          // 这样不需要在 PB select 字段里新增枚举值就能跑
          const payload = {
            kind: 'coop_event',
            event_id: res.eventId,
            date: today,
            event_type: 'conversation',
            delta,
            narrative,
            advice,
            user_input: description.trim(),
          };
          const created = await pb.collection('notifications').create({
            user: current.linkedCloudUserId,
            type: 'event_logged',
            from: me,
            payload,
            read: false,
          });
          console.info('[velvet-store] coop event broadcast OK, notif id =', created.id);
        } catch (err) {
          // PB 把字段级校验细节藏在 err.data 里，明确打出来
          const rich = err as { status?: number; message?: string; data?: { data?: unknown; message?: string } };
          console.error(
            '[velvet-store] broadcast coop event FAILED:',
            'status=', rich.status,
            'msg=', rich.message,
            'fieldErrors=', JSON.stringify(rich.data?.data ?? rich.data, null, 2),
          );
        }
      })();
    }
    // 可选：同步到 activities；可附带对某属性的加点（≤ 3 点）
    if (createActivity) {
      const now = new Date();
      const label = `[同伴] ${current.name}：${description}`;
      const pts: Record<AttributeId, number> = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
      if (activityAttribute && typeof activityPoints === 'number' && activityPoints > 0) {
        pts[activityAttribute] = Math.min(3, Math.max(0, Math.floor(activityPoints)));
      }
      const hasPoints = Object.values(pts).some(v => v > 0);
      if (hasPoints) {
        // 走 addActivity 走正常的加点/升级管线，但带上 confidant 分类与 confidantId
        // addActivity 目前不接受 confidantId 参数，这里直接手工写一条活动并走属性更新 —— 与既有 shadow_defeat 类别写入活动的模式保持一致
        // 为了严谨，也直接更新属性等级。
        const attrs = await db.attributes.toArray();
        const attrMap = new Map(attrs.map(a => [a.id, a]));
        for (const [attrId, p] of Object.entries(pts)) {
          if (p <= 0) continue;
          const attr = attrMap.get(attrId as AttributeId);
          if (!attr) continue;
          const newPoints = attr.points + p;
          let newLevel = attr.level;
          const thresholds = get().settings.levelThresholds?.length
            ? get().settings.levelThresholds
            : attr.levelThresholds;
          while (newLevel < thresholds.length && newPoints >= thresholds[newLevel]) newLevel++;
          await db.attributes.update(attrId, { points: newPoints, level: newLevel });
          if (newLevel > attr.level) {
            // 触发升级通知
            setTimeout(() => set({
              levelUpNotification: {
                id: attrId,
                displayName: get().settings.attributeNames[attrId as AttributeNamesKey],
                level: newLevel,
              }
            }), 600);
          }
        }
      }
      const activity: Activity = {
        id: uuidv4(),
        userId: get().user?.id ?? current.userId,
        date: now,
        description: label,
        pointsAwarded: pts,
        method: 'local',
        category: 'confidant',
        confidantId: id,
        important: hasPoints,
      };
      await db.activities.add(activity);
      await get().loadData();
    }
    return res;
  },

  consumeStarShift: async (id, payload) => {
    const current = await db.confidants.get(id);
    if (!current) return;
    if ((current.starShiftCharges ?? 0) <= 0) throw new Error('没有可用的星移次数');
    const now = new Date();
    await db.confidants.put({
      ...current,
      description: payload.description,
      aiInterpretation: payload.interpretation,
      aiAdvice: payload.advice,
      orientation: payload.orientation,
      starShiftCharges: (current.starShiftCharges ?? 0) - 1,
      lastInteractionAt: now,
    });
    await db.confidantEvents.add({
      id: uuidv4(),
      confidantId: id,
      date: toLocalDateKey(now),
      type: 'star_shift',
      narrative: payload.summary
        ? `以当前状态重新落墨 —— ${payload.summary}`
        : '以当前状态重新落墨',
      createdAt: now,
    });
    await get().loadConfidants();
  },

  archiveConfidant: async (id) => {
    const current = await db.confidants.get(id);
    if (!current) return;
    const now = new Date();
    await db.confidants.put({ ...current, archivedAt: now });
    // 60 秒内如果刚刚有过一条"归档/恢复"事件（说明是误触/快速撤回的另一半），
    // 合并删除旧事件，整个来回不留痕
    const recentWindow = now.getTime() - 60 * 1000;
    const recent = await db.confidantEvents
      .where('confidantId').equals(id)
      .filter(e =>
        (e.type === 'archived' || e.type === 'unarchived' as unknown as string) &&
        new Date(e.createdAt).getTime() >= recentWindow,
      )
      .toArray();
    if (recent.length > 0) {
      // 刚才的动作与这次形成闭环，静默删除旧事件即可
      await db.confidantEvents.bulkDelete(recent.map(e => e.id));
    } else {
      await db.confidantEvents.add({
        id: uuidv4(),
        confidantId: id,
        date: toLocalDateKey(now),
        type: 'archived',
        narrative: '你将这段关系暂时收进了抽屉',
        createdAt: now,
      });
    }
    await get().loadConfidants();
  },

  unarchiveConfidant: async (id) => {
    const current = await db.confidants.get(id);
    if (!current) return;
    const now = new Date();
    // 在线同伴：如果它对应的 bond 已经 severed，主动恢复时打上 dismissed flag，
    // 否则下次 loadSocial 的 reflectSeveredBonds 会立刻把它再归档回去
    let extraPatch: Partial<Confidant> = {};
    if (current.source === 'online' && current.linkedCloudUserId) {
      try {
        const { useCloudSocialStore } = await import('@/store/cloudSocial');
        const bonds = useCloudSocialStore.getState().coopBonds;
        const bond = bonds.find(
          b => b.userAId === current.linkedCloudUserId || b.userBId === current.linkedCloudUserId,
        );
        if (bond && (bond.status === 'severed' || bond.status === 'expired' || bond.status === 'rejected')) {
          extraPatch = { bondSeverDismissed: true };
        }
      } catch (err) {
        console.warn('[velvet-store] check bond status on unarchive failed', err);
      }
    }
    await db.confidants.put({ ...current, ...extraPatch, archivedAt: undefined });
    // 60 秒内刚归档过 → 把那条"archived"事件一并删掉，来回不留痕
    const recentWindow = now.getTime() - 60 * 1000;
    const recent = await db.confidantEvents
      .where('confidantId').equals(id)
      .filter(e => e.type === 'archived' && new Date(e.createdAt).getTime() >= recentWindow)
      .toArray();
    if (recent.length > 0) {
      await db.confidantEvents.bulkDelete(recent.map(e => e.id));
    }
    // 注意：不新增"unarchived"事件；"归档→恢复"是一次状态切换，不留痕
    await get().loadConfidants();
  },

  deleteConfidant: async (id) => {
    const current = await db.confidants.get(id);
    // 在线同伴：先 **await** 把 PB bond 标 severed，
    // 让对方不会重新物化再回来。
    //
    // 之前是 fire-and-forget：本地直接删 → 若 sever 请求失败（网断 / PB 拒绝），
    // 对方的 bond 仍然是 linked；下一轮 loadSocial 的 materializeCoopBonds
    // 看到 "linked 但本地没有对应 card" → 以新的 uuid 重建一张卡 → 用户感觉 "鬼复"。
    //
    // 现在：sever 失败 → 抛给 UI，本地不删，用户看到"删除失败，稍后重试"。
    if (current && current.source === 'online' && current.linkedCloudUserId) {
      const { useCloudSocialStore } = await import('@/store/cloudSocial');
      const { severCoopBond } = await import('@/services/coopBonds');
      const bonds = useCloudSocialStore.getState().coopBonds;
      const bond = bonds.find(
        b => b.status === 'linked'
          && (b.userAId === current.linkedCloudUserId || b.userBId === current.linkedCloudUserId),
      );
      if (bond) {
        try {
          const updated = await severCoopBond(bond.id);
          useCloudSocialStore.getState().updateCoopBond(bond.id, updated);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '网络错误';
          throw new Error(`解除 COOP 失败，请稍后重试（${msg}）`);
        }
      }
    }
    await db.confidants.delete(id);
    const evs = await db.confidantEvents.where('confidantId').equals(id).toArray();
    if (evs.length) await db.confidantEvents.bulkDelete(evs.map(e => e.id));
    await get().loadConfidants();
  },

  useConfidantBattleItem: async (id, kind) => {
    const current = await db.confidants.get(id);
    if (!current) return null;
    const today = toLocalDateKey();
    // 2 天内使用过则冷却中
    if (isItemOnCooldown(current.itemUsedDate, today)) return null;
    const buff = (current.buffs ?? []).find(b => b.kind === kind);
    if (!buff) return null;
    const now = new Date();
    await db.confidants.put({ ...current, itemUsedDate: today, lastInteractionAt: now });
    await db.confidantEvents.add({
      id: uuidv4(),
      confidantId: id,
      date: today,
      type: 'item_used',
      narrative: `${current.name} 在战斗中施以援手：${buff.title}`,
      createdAt: now,
    });
    await get().loadConfidants();
    return buff;
  },

  getAvailableConfidantItems: (kind) => {
    const today = toLocalDateKey();
    const { confidants } = get();
    const out: Array<{
      confidantId: string;
      confidantName: string;
      arcanaId: string;
      buff: ConfidantBuff;
    }> = [];
    for (const c of confidants) {
      if (c.archivedAt) continue;
      if (isItemOnCooldown(c.itemUsedDate, today)) continue;
      const b = (c.buffs ?? []).find(x => x.kind === kind);
      if (b) out.push({ confidantId: c.id, confidantName: c.name, arcanaId: c.arcanaId, buff: b });
    }
    return out;
  },

  runConfidantDailyMaintenance: async () => {
    const today = toLocalDateKey();
    const all = await db.confidants.toArray();
    const now = new Date();
    const events: ConfidantEvent[] = [];
    let changed = false;

    // 在线 COOP 的"逆流"必须双方都开 —— 拉取 cloud bonds 一次
    const { useCloudSocialStore } = await import('@/store/cloudSocial');
    // 如果已登录但 bonds 尚未加载（initializeApp 与 App.tsx 的 loadSocial 时序竞态），
    // 先等一次 loadSocial 完成，避免把在线同伴错误地"暂不衰减"。
    try {
      const { useCloudStore } = await import('@/store/cloud');
      const isLogged = useCloudStore.getState().cloudUser !== null;
      const hasOnlineConfidant = all.some(c => !c.archivedAt && c.source === 'online' && c.linkedCloudUserId);
      const bondsEmpty = useCloudSocialStore.getState().coopBonds.length === 0;
      if (isLogged && hasOnlineConfidant && bondsEmpty) {
        const { loadSocial } = await import('@/services/social');
        await loadSocial({ force: true });
      }
    } catch { /* 网络失败不阻塞维护：后续分支会对每个在线同伴 fallback 跳过 */ }
    const allBonds = useCloudSocialStore.getState().coopBonds;

    for (const c of all) {
      if (c.archivedAt) continue;
      if (!c.decayEnabled) continue;

      // 在线同伴：必须找到对应 bond 且双方都开启 decay
      if (c.source === 'online' && c.linkedCloudUserId) {
        const bond = allBonds.find(
          b => b.status === 'linked'
            && (b.userAId === c.linkedCloudUserId || b.userBId === c.linkedCloudUserId),
        );
        if (!bond) continue;          // 没找到 bond → 暂不衰减
        if (!(bond.decayA === true && bond.decayB === true)) continue; // 双方未达成一致
      }
      // 最后互动日期
      const last = c.lastInteractionAt ? new Date(c.lastInteractionAt) : new Date(c.createdAt);
      const lastKey = toLocalDateKey(last);
      // 连续 3 天（含）以上无互动才衰减；每天最多 -1
      const diffDays = Math.floor((new Date(today + 'T00:00:00').getTime() - new Date(lastKey + 'T00:00:00').getTime()) / 86400000);
      if (diffDays < 3) continue;
      // 今天已经扣过
      const already = await db.confidantEvents
        .where('confidantId').equals(c.id)
        .filter(e => e.type === 'decay' && e.date === today)
        .first();
      if (already) continue;
      const newPoints = Math.max(0, c.intimacyPoints - 1);
      const newLv = pointsToLevel(newPoints);
      const buffs = newLv < c.intimacy ? buffsForLevel(c.arcanaId, newLv, get().settings.attributeNames) : c.buffs;
      await db.confidants.put({
        ...c,
        intimacyPoints: newPoints,
        intimacy: newLv,
        buffs,
      });
      events.push({
        id: uuidv4(),
        confidantId: c.id,
        date: today,
        type: 'decay',
        delta: -1,
        narrative: `已有 ${diffDays} 天未与 ${c.name} 互动，羁绊悄然褪色`,
        createdAt: now,
      });
      changed = true;
    }
    if (events.length) await db.confidantEvents.bulkAdd(events);
    if (changed) await get().loadConfidants();
  },

  // ── 谏言 / Counsel ───────────────────────────────────────────

  loadCounsel: async () => {
    const [sessions, archives] = await Promise.all([
      db.counselSessions.toArray(),
      db.counselArchives.orderBy('createdAt').reverse().toArray(),
    ]);
    // 理论上只保留 1 条（最后一次）
    const session = sessions
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0] ?? null;
    set({ counselSession: session, counselArchives: archives });
    await get().expireCounselIfNeeded();
  },

  getCounselCooldown: () => {
    const COOLDOWN_DAYS = 3;
    const { counselSession, counselArchives, settings } = get();
    const times: number[] = [];
    // 主真源：Settings.lastCounselStartedAt —— 不会被归档删除 / 手动清档影响
    if (settings.lastCounselStartedAt) {
      const t = new Date(settings.lastCounselStartedAt).getTime();
      if (!isNaN(t)) times.push(t);
    }
    // 次要来源（向前兼容 + 兜底）：当前 session 的 startedAt，最新归档的 sessionStartedAt
    if (counselSession?.startedAt) {
      const t = new Date(counselSession.startedAt).getTime();
      if (!isNaN(t)) times.push(t);
    }
    const latestArchive = counselArchives[0];
    if (latestArchive?.sessionStartedAt) {
      const t = new Date(latestArchive.sessionStartedAt).getTime();
      if (!isNaN(t)) times.push(t);
    }
    if (times.length === 0) return { locked: false };
    const latest = Math.max(...times);
    const nextAvailable = latest + COOLDOWN_DAYS * 86400000;
    const now = Date.now();
    if (now >= nextAvailable) return { locked: false };
    const nextAvailableAt = new Date(nextAvailable);
    return {
      locked: true,
      nextAvailableAt,
      nextAvailableDate: toLocalDateKey(nextAvailableAt),
      daysLeft: Math.ceil((nextAvailable - now) / 86400000),
    };
  },

  hasActiveCounsel: () => {
    const { counselSession } = get();
    if (!counselSession) return false;
    if (counselSession.expired) return false;
    if (Date.now() > new Date(counselSession.expiresAt).getTime()) return false;
    return true;
  },

  startCounselSession: async (mentionedConfidantIds = []) => {
    const cd = get().getCounselCooldown();
    if (cd.locked) {
      throw new Error(`谏言冷却中，下次可用：${cd.nextAvailableDate}`);
    }
    // 清掉旧 session（冷却已过，旧会话可以丢弃）
    await db.counselSessions.clear();
    const now = new Date();
    // 预设 @ 的同伴：回合号置为 1 —— 开场问候和第 1 回合的 prompt 都能感知到 Ta；10 回合内自动过期
    const initialLastTurn: Record<string, number> = {};
    for (const id of mentionedConfidantIds) initialLastTurn[id] = 1;
    const session: CounselSession = {
      id: uuidv4(),
      startedDate: toLocalDateKey(now),
      startedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000), // 1 小时
      mentionedConfidantIds: [...mentionedConfidantIds],
      mentionLastTurn: initialLastTurn,
      messages: [],
    };
    await db.counselSessions.put(session);
    // 同步写入 Settings.lastCounselStartedAt 作为冷却真源
    await get().updateSettings({ lastCounselStartedAt: now.toISOString() });
    set({ counselSession: session });
    return session;
  },

  appendCounselMessage: async (msg) => {
    const { counselSession } = get();
    if (!counselSession) throw new Error('谏言会话尚未开启');
    if (counselSession.expired || Date.now() > new Date(counselSession.expiresAt).getTime()) {
      throw new Error('谏言窗口已过期');
    }
    const mergedMentions = msg.mentions && msg.mentions.length
      ? Array.from(new Set([...counselSession.mentionedConfidantIds, ...msg.mentions]))
      : counselSession.mentionedConfidantIds;

    const newMessages = [...counselSession.messages, msg];
    // 只有"带 @ 的用户消息"才会刷新 mentionLastTurn：回合号 = 追加后的用户消息总数
    let mentionLastTurn = counselSession.mentionLastTurn ?? {};
    if (msg.role === 'user' && msg.mentions && msg.mentions.length > 0) {
      const newUserTurn = newMessages.filter(m => m.role === 'user').length;
      mentionLastTurn = { ...mentionLastTurn };
      for (const id of msg.mentions) {
        mentionLastTurn[id] = newUserTurn;
      }
    }

    const updated: CounselSession = {
      ...counselSession,
      messages: newMessages,
      mentionedConfidantIds: mergedMentions,
      mentionLastTurn,
    };
    await db.counselSessions.put(updated);
    set({ counselSession: updated });
  },

  updateCounselMessage: async (id, patch) => {
    const { counselSession } = get();
    if (!counselSession) return;
    const messages = counselSession.messages.map(m => m.id === id ? { ...m, ...patch } : m);
    const updated: CounselSession = { ...counselSession, messages };
    await db.counselSessions.put(updated);
    set({ counselSession: updated });
  },

  expireCounselIfNeeded: async () => {
    const { counselSession } = get();
    if (!counselSession) return;
    // 残留的 expired 旧行（老版本留下的）→ 直接清掉
    if (counselSession.expired) {
      await db.counselSessions.delete(counselSession.id);
      set({ counselSession: null });
      return;
    }
    const now = Date.now();
    if (now <= new Date(counselSession.expiresAt).getTime()) return;
    // 过期：**彻底删除整条会话**，聊天原文不进任何存档 / 备份。
    // 冷却状态由 settings.lastCounselStartedAt 负责保留，不依赖这条行。
    await db.counselSessions.delete(counselSession.id);
    set({ counselSession: null });
  },

  archiveCounselSession: async (signal) => {
    const { counselSession, settings } = get();
    if (!counselSession) return null;
    if (counselSession.messages.length === 0) {
      // 没内容直接删除，不生成归档
      await db.counselSessions.delete(counselSession.id);
      set({ counselSession: null });
      return null;
    }
    const summary = await summarizeCounsel(settings, counselSession.messages, signal);
    const lastMsg = counselSession.messages[counselSession.messages.length - 1];
    const archive: CounselArchive = {
      id: uuidv4(),
      summary,
      mentionedConfidantIds: [...counselSession.mentionedConfidantIds],
      messageCount: counselSession.messages.length,
      sessionStartedAt: new Date(counselSession.startedAt),
      sessionEndedAt: new Date(lastMsg?.timestamp ?? counselSession.startedAt),
      createdAt: new Date(),
    };
    await db.counselArchives.add(archive);
    await db.counselSessions.delete(counselSession.id);
    set(state => ({
      counselSession: null,
      counselArchives: [archive, ...state.counselArchives],
    }));
    return archive;
  },

  deleteCounselArchive: async (id) => {
    await db.counselArchives.delete(id);
    set(state => ({
      counselArchives: state.counselArchives.filter(a => a.id !== id),
    }));
  },

  buildCounselContext: () => {
    const { settings, counselSession, counselArchives, confidants, confidantEvents } = get();
    // 上一次 & 上上次归档摘要 —— 让残响有"上次我们聊过什么"的记忆
    const previousArchives = counselArchives.slice(0, 2).map(a => ({
      summary: a.summary,
      createdAt: new Date(a.createdAt),
      mentionedIds: [...a.mentionedConfidantIds],
    }));
    if (!counselSession) {
      return {
        settings,
        messages: [],
        mentionedConfidants: [],
        recentEvents: [],
        previousArchives,
      };
    }
    // 10 回合 CD：currentUserTurn - lastTurn < 10 才算"仍在上下文"
    const MENTION_CD_TURNS = 10;
    const currentUserTurn = counselSession.messages.filter(m => m.role === 'user').length;
    const lastTurnMap = counselSession.mentionLastTurn ?? {};
    const activeIds = counselSession.mentionedConfidantIds.filter(id => {
      const lt = lastTurnMap[id];
      if (typeof lt !== 'number') return false;
      return currentUserTurn - lt < MENTION_CD_TURNS;
    });

    const ids = new Set(activeIds);
    const mentioned: CounselConfidantBrief[] = [];
    for (const id of activeIds) {
      const c = confidants.find(x => x.id === id);
      if (!c) continue;
      const card = TAROT_BY_ID[c.arcanaId];
      mentioned.push({
        id: c.id,
        name: c.name,
        arcanaName: card?.name ?? c.arcanaId,
        orientation: c.orientation,
        intimacy: c.intimacy,
        description: c.description,
        aiInterpretation: c.aiInterpretation,
      });
    }
    // 近 15 条相关 confidantEvents（若当前没有活跃 @，则退化为全局最近 15 条）
    const relevant = ids.size > 0
      ? confidantEvents.filter(e => ids.has(e.confidantId))
      : confidantEvents;
    const recentEvents: CounselRecentEvent[] = relevant.slice(0, 15).map(e => {
      const cname = confidants.find(c => c.id === e.confidantId)?.name ?? '同伴';
      const text = e.userInput || e.narrative || e.advice || '';
      return { confidantName: cname, date: e.date, type: e.type, text };
    });
    return {
      settings,
      messages: counselSession.messages,
      mentionedConfidants: mentioned,
      recentEvents,
      previousArchives,
    };
  },
}));
