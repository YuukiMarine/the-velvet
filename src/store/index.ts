import { create } from 'zustand';
import { User, Attribute, Activity, Achievement, Skill, Settings, ThemeType, AttributeId, AttributeNamesKey, DailyEvent, Todo, TodoCompletion, TodoStep, FateCandidate, BigDealClearPayload, PeriodSummary, SummaryPeriod, SummaryPromptPreset, WeeklyGoal, WeeklyGoalItem, Persona, Shadow, BattleState, TowerStratum, StratumNode, DailyDivination, LongReading, LongReadingFollowUp, Confidant, ConfidantEvent, ConfidantBuff, CounselSession, CounselMessage, CounselArchive, CallingCard, NotifSlot, LedgerEntry, Budget, SpendWorth, LedgerAsset, Wish, WishProgressPoint, WishProgressSource, WishProgressCutPayload, WishProposalPayload, ReturnPayload, ReturnTier, BackfillEntry, BattleArsenal, ChainKey, AffixKind, NavigatorPreset, NavigatorMemo } from '@/types';
import { TAROT_BY_ID } from '@/constants/tarot';
import { summarizeCounsel, type CounselContext, type CounselConfidantBrief, type CounselRecentEvent } from '@/utils/counselAI';
import { db } from '@/db';
import { v4 as uuidv4 } from 'uuid';
import { calcMaxStreak, streakDates } from '@/utils/streak';
import { applyUiChannel } from '@/ui/channel';
import { computeAndSchedule, type NotifSnapshot } from '@/utils/notifications';
import { pushWidgetSnapshot } from '@/utils/widgetSnapshot';
import { isGrowthCategory, cycleRangeForKey } from '@/utils/ledgerFormat';
import { resolveProvider } from '@/utils/aiProviders';
import { chatComplete, getAIConfig, type AIConfig, type AIMessage } from '@/utils/aiClient';
import {
  pointsToLevel,
  levelBasePoints,
  MAX_INTIMACY,
  buffsForLevel,
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
 * 本机全部业务表的**唯一真源**：resetAllData 清哪些、importData 快照/回滚哪些，都读这一份。
 *
 * 为什么要收成一份（FS7 审查）：这三处原本各写一遍表名，结果各漏各的——
 * resetAllData 漏了黑猫四表（"清空所有数据"后猫还记得你），
 * importData 的快照漏了记账三表（导入失败自动回滚时把整本账吃掉）。
 * 新加表只要 db 里加了、这里跟一行，三个语义就同时正确。
 *
 * 与 services/sync.ts 的 SYNC_TABLES 是两码事：那份管"上不上云"，这份管"算不算本机数据"。
 */
export const ALL_LOCAL_TABLES = [
  'users', 'attributes', 'activities', 'achievements', 'skills',
  'dailyEvents', 'dailyDivinations', 'longReadings', 'callingCards',
  'settings', 'todos', 'todoCompletions', 'summaries', 'weeklyGoals',
  'personas', 'shadows', 'battleStates', 'strata',
  'confidants', 'confidantEvents', 'counselSessions', 'counselArchives',
  'ledgerEntries', 'budgets', 'assets', 'wishes',
  // F6 黑猫：人格 / 原子记忆 / 会话与消息（聊天原文 7 天即焚，但"清空数据"必须清）
  'navigatorPresets', 'navigatorMemos', 'navigatorSessions', 'navigatorMessages',
] as const;

/**
 * addConfidant 串行锁：防止两次并发调用绕过"22 arcana 唯一 / 在线同伴唯一"检查。
 * 实现方式：每次调用等待上一次 resolve 后再跑，失败也照常 unlock。
 */
let _addConfidantLock: Promise<unknown> = Promise.resolve();

/** BIG DEAL 收官 SP（TASKS_MERGE_PRD §5）：min(20, 子步数×3)，经 earnSP 入战场钱包 */
const BIGDEAL_CLEAR_SP_PER_STEP = 3;
const BIGDEAL_CLEAR_SP_CAP = 20;
/** completeTodoStep 在途锁：同一子步双击在 addActivity 异步窗口内重入会双发点数 */
const _completingStepIds = new Set<string>();
/**
 * 迁移单飞锁：StrictMode 下 App 启动 effect 双跑，两次调用会在 settings 标记落库前
 * 双双通过防重入检查 → 大事被迁两份。同一 JS 会话内只允许第一次真正执行。
 */
let _tasksMergeMigrationPromise: Promise<void> | null = null;

type TerminalStepHistory = NonNullable<Wish['stepHistory']>[number];

const appendWishStepHistory = async (
  parentId: string,
  entry: Omit<TerminalStepHistory, 'id' | 'completedAt'> & { completedAt?: string },
) => {
  const parent = await db.wishes.get(parentId);
  if (!parent) return;
  const history = parent.stepHistory ?? [];
  const exists = history.some((h) =>
    entry.sourceStepId ? h.sourceStepId === entry.sourceStepId : h.title.trim() === entry.title.trim(),
  );
  if (exists) return;
  await db.wishes.put({
    ...parent,
    stepHistory: [
      ...history,
      {
        id: uuidv4(),
        title: entry.title.trim(),
        sourceStepId: entry.sourceStepId,
        via: entry.via,
        completedAt: entry.completedAt ?? new Date().toISOString(),
      },
    ],
  });
};

const removeWishStepHistory = async (parentId: string, sourceStepId: string) => {
  const parent = await db.wishes.get(parentId);
  if (!parent?.stepHistory?.length) return;
  await db.wishes.put({
    ...parent,
    stepHistory: parent.stepHistory.filter((h) => h.sourceStepId !== sourceStepId),
  });
};

// ── 愿望进度评估（PRD_V2.6 §8）─────────────────────────────

/** bumpWishProgress 的节流表：wishId → 上次泵的时间戳 */
const wishBumpAt = new Map<string, number>();

// ── 回归面板阈值（PRD_V2.6 §12）────────────────────────────
/** 离开多少天算"走了"。低于这个数不弹——七天以内的间断是正常生活，不是缺席 */
const RETURN_MIN_DAYS = 7;
/** 7–14 天给日历补记；再久就只给一句话概括（逐日回忆超过两周就是在编故事） */
const RETURN_RECENT_MAX_DAYS = 14;

/**
 * 无 API Key 时的离线估算。
 *
 * 形状选饱和曲线而不是线性：「离梦想的距离」本来就该越靠后越难推——
 * 线性会让第 30 条记录和第 3 条一样值钱，那是记账不是靠近。
 * 也永远够不到 100%：只有用户自己按下「愿望已实现」才算到岸。
 */
export function localWishEstimate(done: number, total: number, times: number): number {
  const act = (cap: number) => cap * (1 - Math.exp(-times / 10));
  if (total > 0) return Math.min(99, Math.round((done / total) * 60 + act(38)));
  return Math.min(92, Math.round(act(92)));
}

const WISH_EVAL_SYS =
  '你在评估用户距离一个长期愿望还有多远。只输出 JSON：{"pct":<0到100的整数>,"reason":"<不超过24个中文字的依据>"}。' +
  '判断依据是**实际推进的证据**（子任务完成情况、挂到这个愿望的记录条数与内容、用户自述现状），不是愿望本身听起来难不难。' +
  '有上次评估值时以它为锚点微调，没有新证据就别大改；证据充分才敢大步走。' +
  '100 留给"已经实现"，没实现就不要给 100。reason 用第二人称、说人话、不要复述数字。';

/** 空响应自愈：DeepSeek 的 json_object 有概率回空白 content，退一档重来 */
async function callWishJson(cfg: AIConfig, messages: AIMessage[]): Promise<string> {
  const opts = { temperature: 0.3, maxTokens: 160 };
  try {
    return await chatComplete(cfg, messages, { ...opts, jsonMode: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes('空响应')) {
      return await chatComplete(cfg, messages, { ...opts, jsonMode: false });
    }
    throw e;
  }
}

/** JSON 优先，失败退化为"抓第一个百分数"——模型加了话头也不至于整次白跑 */
function parseWishEval(content: string): { pct: number; reason?: string } | null {
  const raw = content.trim();
  const jsonText = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    const o = JSON.parse(jsonText) as Record<string, unknown>;
    const pct = Number(o.pct);
    if (Number.isFinite(pct)) {
      const reason = String(o.reason ?? '').trim().slice(0, 40);
      return { pct: Math.max(0, Math.min(100, Math.round(pct))), reason: reason || undefined };
    }
  } catch { /* 落到下面的正则兜底 */ }
  const m = raw.match(/(\d{1,3})\s*%/) ?? raw.match(/\b(\d{1,3})\b/);
  if (!m) return null;
  const pct = Number(m[1]);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return { pct: Math.round(pct) };
}

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
  // F3：终端短路决策达成（同为里程碑，默认 include），让总结叙事凸显"自救"节点。
  terminal_clear: '[终端]',
};
import {
  INITIAL_ATTRIBUTES,
  ACHIEVEMENTS,
  SKILLS,
  DEFAULT_KEYWORD_RULES,
  DEFAULT_LEVEL_THRESHOLDS,
  SHADOW_REGEN_PER_LEVEL,
  HP_BONUS_PER_DEFEAT,
} from '@/constants';
import { PLAYER_BASE_HP, nodeSpReward, bossSpReward, RELIC_SALVAGE_SP, RELIC_SLOTS_BY_STRATUM, AFFIX_HP_MULT, masteryStars } from '@/battle/numbers';
import { buildStratum, buildAbyssRing, migrationStratumName, reachableNodeIds, rollMobSpec, weekKeyOf } from '@/battle/tower';
import { TOWER_EVENT_IDS } from '@/battle/events';
import { rollNodeLoot, rollAffixes, buildOathSkill, towerRelicBonus, MYTH_POOL, rollRelic, rollMyth, lootLabel, type LootDrop } from '@/battle/loot';
import { currentRecordStreak, shouldGrantDiligence } from '@/battle/preparation';
import { DILIGENCE_MAX_CHARGES, GOLDEN_SP_MULT } from '@/battle/numbers';
import { generateDefeatLetter } from '@/utils/battleAI';
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
  /** 行动页（任务+记录合并）当前子页；菜单/首页等外部入口可在导航前指定 */
  actionsSubTab: 'todos' | 'activities';
  levelUpNotification: { id: string; displayName: string; level: number } | null;
  achievementNotification: { id: string; title: string } | null;
  skillNotification: { id: string; name: string } | null;
  modalBlocker: boolean;
  
  initializeApp: () => Promise<void>;
  createUser: (name: string, attrNames?: Partial<import('@/types').AttributeNames>, blessingAttribute?: AttributeId) => Promise<void>;
  updateUser: (patch: Partial<Pick<User, 'name' | 'avatarDataUrl'>>) => Promise<void>;
  setTheme: (theme: ThemeType) => Promise<void>;
  addActivity: (description: string, points: Record<string, number>, method: 'local' | 'todo' | 'battle', options?: { important?: boolean; date?: Date; category?: Activity['category']; bigDealId?: string; wishId?: string }) => Promise<{ unlockHints: { achievements: number; skills: number }; activityId: string }>;
  updateAttribute: (attributeId: string, points: number) => Promise<void>;
  unlockAchievement: (achievementId: string) => Promise<void>;
  unlockSkill: (skillId: string) => Promise<void>;
  setCurrentPage: (page: string) => void;
  setActionsSubTab: (tab: 'todos' | 'activities') => void;
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

  // ── F3 治疗终端 · 启动素材库 ──────────────────────
  wishes: Wish[];
  loadWishes: () => Promise<void>;
  /** 新建 / 覆盖一条素材（父级素材 parentId 空 / 小步骤带 parentId） */
  saveWish: (wish: Wish) => Promise<void>;
  /** 创建一条素材（自动补 id/createdAt/status/source 默认值），返回新建对象 */
  addWish: (input: { title: string; parentId?: string; note?: string; kind?: Wish['kind']; currentState?: string; attribute?: AttributeId; arcanaId?: string; source?: 'manual' | 'ai' }) => Promise<Wish>;
  /** 删除一条素材；删除父级素材时连带删除其全部小步骤 */
  deleteWish: (id: string) => Promise<void>;
  /** 改素材状态（active/done/archived）；done/archived 落 archivedAt */
  setWishStatus: (id: string, status: Wish['status']) => Promise<void>;
  /** 某个愿望「已完成相关任务」次数 = 挂了 wishId 的活动条数（V2.6 §1.2） */
  getWishProgress: (wishId: string) => number;
  /**
   * 「愿望已实现」（V2.6 §1.4）：写 fulfilledAt + status='done'，
   * 并把该愿望名下的子愿望与在途 BIG DEAL/待办一并归档（口径同 BIG DEAL 收官）。
   * 返回结算屏要用的载荷；没有这条愿望则返回 null。
   */
  fulfillWish: (id: string) => Promise<{ title: string; timesLogged: number; archivedTodos: number } | null>;
  /**
   * AI 拆分：把一件卡住的事拆成 3–5 个「可执行的小步骤」标题。
   * 在线走 chatComplete；无 Key 抛错由调用方兜底（手动输入）。返回标题数组，由 UI 确认后再落库。
   */
  decomposeWishAI: (parent: Wish, children?: Wish[]) => Promise<string[]>;

  // ── 愿望进度（PRD_V2.6 §8）──────────────────────────────
  /** 给愿望加一条子任务（勾掉不加点，见 Wish.steps 注释） */
  addWishStep: (wishId: string, title: string, opts?: { source?: 'manual' | 'ai' }) => Promise<void>;
  /** 勾 / 撤勾一条子任务；勾上会顺带触发一次进度重估（受 wishAutoEvaluate 管辖） */
  toggleWishStep: (wishId: string, stepId: string) => Promise<void>;
  removeWishStep: (wishId: string, stepId: string) => Promise<void>;
  /** AI 续拆愿望子任务（复用 decomposeWishAI 管线，避重/限量逻辑免费继承） */
  decomposeWishStepsAI: (wishId: string) => Promise<string[]>;
  /**
   * 评估「离这个愿望还有多远」。
   * 在线走 AI（带子步/挂载记录/上次落点作上下文）；无 Key 退化为本地估算（source='local'）。
   * `context` 供 Agent 把谈话里的新信息喂进来；
   * `dryRun` 只算不写——Agent 的提议必须等用户确认才落库，绝不先斩后奏。
   */
  evaluateWishProgress: (wishId: string, opts?: { context?: string; allowDecrease?: boolean; dryRun?: boolean }) => Promise<{ pct: number; delta: number; reason?: string; source: WishProgressSource } | null>;
  /** 直接落一个百分比（手动拖 / Agent 提议被确认后）。写轨迹、发弹窗由调用方决定 */
  setWishProgress: (wishId: string, pct: number, opts?: { reason?: string; source?: WishProgressSource }) => Promise<void>;
  /** 环要画的一切：百分比 + 是否评估过 + 子步计数 + 挂载次数 */
  getWishRing: (wishId: string) => { pct: number; evaluated: boolean; done: number; total: number; times: number };
  /**
   * 任务完成后的进度泵：立刻不阻塞地跑一次重估，出结果再弹窗（§8「每次任务完成都会评估涨了多少」）。
   * 内部自带节流与状态校验，重复调用安全。
   */
  bumpWishProgress: (wishId: string) => Promise<void>;
  /** 进度弹窗载荷（App 顶层 WishProgressCutIn 消费；null = 无待播） */
  wishProgressCut: WishProgressCutPayload | null;
  clearWishProgressCut: () => void;
  /** 黑猫的进度提议（谈话中触发，必须用户确认才落库；null = 无待决） */
  wishProposal: WishProposalPayload | null;
  setWishProposal: (p: WishProposalPayload | null) => void;

  // ── 回归面板（PRD_V2.6 §12）──────────────────────────────
  /**
   * 记一次「打开过」。每次冷启动 / 切回前台调用。
   * 返回本次是否构成一次**回归**（离开 ≥ 7 天）及其载荷；不构成则返回 null。
   * 内部只在真的构成回归时才写 lastReturnPanelAt，普通打开只刷新 lastOpenedAt。
   */
  markAppOpened: () => Promise<ReturnPayload | null>;
  /**
   * 补记候选：从近 60 天的手动记录里按出现频次挑出常做的事。
   * 回忆很难、认出来很容易——补记面板给 chip 而不是空输入框，靠的就是这份表。
   */
  getBackfillSuggestions: (limit?: number) => Array<{ text: string; points: Record<string, number> }>;
  /**
   * 完成回归仪式：写补记条目 + 写那条带 tag 的回归记录 + 回归次数 +1。
   * `entries` 为空也照样成立——「我回来了」本身就是仪式。
   */
  commitReturn: (payload: ReturnPayload, entries: BackfillEntry[], summary?: string) => Promise<void>;

  /** 今日「应做」的活跃待办（active + 未来启用日排除 + weekdays 不含今天排除）；短路决策候选与入口卡计数共用，统一全站口径。 */
  getDueTodosToday: () => Todo[];

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
  // ── BIG DEAL（任务×终端二合一，TASKS_MERGE_PRD 批1 数据底座）──
  addTodoStep: (todoId: string, title: string, opts?: { attribute?: AttributeId; source?: 'manual' | 'ai' }) => Promise<void>;
  updateTodoStep: (todoId: string, stepId: string, patch: Partial<Pick<TodoStep, 'title' | 'attribute'>>) => Promise<void>;
  removeTodoStep: (todoId: string, stepId: string) => Promise<void>;
  /** 勾一子步：发父条目点数 + 写 bigdeal_step 记录；最后一步自动收官。返回 null = 未生效 */
  completeTodoStep: (todoId: string, stepId: string) => Promise<{ collapsed: boolean } | null>;
  /** 撤勾（未收官前）：走 deleteActivity 完整回档链路 */
  undoTodoStep: (todoId: string, stepId: string) => Promise<void>;
  /** 收官：触及属性各+1（承载在收官记录上）+ SP 入账 + 归档；全子步 done 才生效 */
  collapseBigDeal: (todoId: string) => Promise<void>;
  /** 收官结算屏载荷（App 顶层 BigDealClearCutIn 消费；null = 无待播结算） */
  bigDealClear: BigDealClearPayload | null;
  clearBigDealClear: () => void;
  getBigDealProgress: (todoId: string) => { done: number; total: number; nextStep: TodoStep | null };
  /** AI 拆解大事子步（复用 decomposeWishAI 管线；无 Key 抛错由 UI 走离线模板兜底） */
  decomposeBigDealAI: (todoId: string) => Promise<string[]>;
  /** 一次性迁移：Wish 树根→BIG DEAL / 无子步根→愿望纸片 / 在途终端卡归档（防重入） */
  runTasksMergeMigration: () => Promise<void>;
  /**
   * 收官后的 BIG DEAL「重建任务」（PRD_V2.6 §2.4）。
   * 取代原来的"回退/撤销"：回退会把条目留在"全成但动不了"的僵死态
   * （clearedActivityId 已写、子步全 done、所有控件 disabled）——那条路已砍。
   * 这里改为新立一条同名同步骤的全新 BIG DEAL，旧条目原样归档留作历史。
   */
  rebuildBigDeal: (todoId: string) => Promise<string | null>;
  // ── 抽签（TASKS_MERGE_PRD §4.2 批3）──
  /** 三源奖池：今日未完成待办 + 愿望纸片 + 近 30 天手动记录去重；当日已抽中/已完成剔除 */
  getFateDrawPool: () => FateCandidate[];
  /** 纯单抽：从池随机取一张并当日沉底（无重抽；拒绝零惩罚但同条目当日不再出现） */
  drawFate: (pool?: FateCandidate[]) => Promise<FateCandidate | null>;
  /** 接受抽中：待办→钉签；愿望→转正为今日一次性任务并归档纸片；历史→同款复刻一条 */
  acceptFateDraw: (c: FateCandidate) => Promise<void>;
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
  // F2a 本地通知
  syncNotifications: () => Promise<void>;
  markSummaryViewed: (id: string) => Promise<void>;
  // F5 心相记账
  ledgerEntries: LedgerEntry[];
  budgets: Budget[];
  loadLedger: () => Promise<void>;
  addLedgerEntry: (input: Omit<LedgerEntry, 'id' | 'createdAt' | 'currency'> & { currency?: string }) => Promise<LedgerEntry>;
  deleteLedgerEntry: (id: string) => Promise<void>;
  setBudget: (period: string, patch: { monthlyLimit?: number; dailyLimit?: number; savingsGoal?: number; savingsGoalEdits?: number }) => Promise<void>;
  adjustTotalBalance: (targetTotal: number) => Promise<{ ok: boolean; reason?: string }>;
  getTotalBalance: () => number;
  getMonthExpense: (period?: string) => number;
  getMonthIncome: (period?: string) => number;
  getBudget: (period?: string) => Budget | undefined;
  getPeriodExpense: (periodKey: string) => number;
  getPeriodIncome: (periodKey: string) => number;
  getAdjustCountThisMonth: () => number;
  earnLedgerSp: (amount: number, tier?: 'regular' | 'bonus' | 'flat') => Promise<number>;
  rewardForLedgerEntry: (entry: LedgerEntry, opts?: { attribute?: AttributeId; attrPoints?: number; evalWorth?: SpendWorth }) => Promise<void>;
  // F5 资产板块
  assets: LedgerAsset[];
  addAsset: (input: Omit<LedgerAsset, 'id' | 'createdAt'>) => Promise<LedgerAsset>;
  updateAsset: (id: string, patch: Partial<LedgerAsset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  getFixedAssetTotal: () => number;
  /** 累计存款：过去每月「没花完的预算」之和 max(0, 月预算 − 当月支出)（自律攒下）。 */
  getSavings: () => number;
  /** 月度不超预算 → 发 +10 SP（仅完成月、每月一次）；返回本次是否发放。 */
  claimLedgerBudgetBonus: (period: string) => Promise<boolean>;
  /** 「省钱挑战」结算：过去月 (预算−支出) ≥ savingsGoal 且未发放 → +10SP，返回省下的金额（未达成/已发返 null）。 */
  claimLedgerChallengeBonus: (period: string) => Promise<number | null>;
  // 逆影战场
  persona: Persona | null;
  shadow: Shadow | null;
  battleState: BattleState | null;
  loadBattleData: () => Promise<void>;
  savePersona: (persona: Persona) => Promise<void>;
  saveShadow: (shadow: Shadow) => Promise<void>;
  saveBattleState: (state: BattleState) => Promise<void>;
  earnSP: (amount: number) => Promise<void>;
  checkShadowHpRegen: () => Promise<void>;
  startBattleSession: () => void;
  endBattleSession: () => void;
  defeatShadow: () => Promise<void>;
  resetBattle: () => Promise<void>;
  equipMask: (attr: AttributeId | null) => Promise<void>;
  // 影时间高塔（批2）：区层攀登
  stratum: TowerStratum | null;
  saveStratum: (s: TowerStratum) => Promise<void>;
  /** 显形新区层：写入区层 + 主影（沿用 shadows 单例=当前区层主影约定） */
  revealStratum: (params: { level: number; name: string; description: string; themeAttribute?: AttributeId; boss: Shadow }) => Promise<void>;
  /** 每日一次登塔：满 HP + 记 lastChallengeDate + 初始化当日 session 统计 */
  enterTowerToday: () => Promise<void>;
  moveToTowerNode: (nodeId: string) => Promise<StratumNode | null>;
  /** 完成节点：标记 cleared + 按类型即发 SP（返回发放量） */
  completeTowerNode: (nodeId: string, opts?: { wasMob?: boolean }) => Promise<number>;
  /** 事件效果原语：HP%增减 / SP 增减 / 登塔增益 / 被夺先手 */
  towerAdjust: (opts: { hpDeltaPct?: number; spDelta?: number; buff?: { id: string; label: string; addPct?: number }; stealFirstStrike?: boolean }) => Promise<void>;
  towerSkipNextFloor: () => Promise<void>;
  towerRerollNextFloor: () => Promise<void>;
  /** 战斗结束后回写 session 统计（伤害/最大单击/弱点数） */
  towerRecordBattleStats: (stats: { damage: number; maxHit: number; weaknessHits: number }) => Promise<void>;
  /** 月相日（周一）异变加深：主影回满 + deepenCount+1；返回是否触发（供演出） */
  deepenStratumIfNewWeek: () => Promise<boolean>;
  // ── 批3 · 养成与生态 ──
  /** 战利品掷取并入包（月匣/强敌/心魔/金色回响）；返回掉落列表（toast/演出用） */
  rollTowerLoot: (source: 'chest' | 'elite' | 'boss' | 'golden', floorRatio: number) => Promise<LootDrop[]>;
  /** （批5）踏入深渊回廊 / 深入下一环：零 AI 即时生成环+守卫（Lv5 通关后解锁） */
  enterAbyss: () => Promise<void>;
  /** 事件奖励：残月遗物 / 随机迷思 直接入包；返回展示名（结果文案用） */
  grantEventLoot: (kind: 'relicWaning' | 'randomMyth') => Promise<string>;
  /** 删除遗物 → 转化 SP（10/25/60）；返回转化量 */
  salvageRelic: (relicId: string) => Promise<number>;
  /** 装备/卸下遗物（受区层期栏位限制：Lv1期1/Lv2-4期2/Lv5期3）；返回是否成功 */
  toggleEquipRelic: (relicId: string) => Promise<boolean>;
  /** 迷思镶嵌（每技能1枚；誓约技不可镶；淬毒仅 damage/crit）；返回错误文案或 null */
  socketMyth: (attr: AttributeId, skillLevel: number, stoneId: string) => Promise<string | null>;
  /** 迷思拆下（石头返还背包，无残留；R18 觉醒烧录 permanent 不可拆） */
  unsocketMyth: (attr: AttributeId, skillLevel: number) => Promise<void>;
  /** R18 面具羁绊：战斗胜利后按本场召唤过的面具累加出战场次 */
  recordMaskBattles: (masks: AttributeId[]) => Promise<void>;
  /** R18 技能觉醒：满星 + 消耗一颗迷思 → 词条烧录永久 + 改名（空名 = 原名·觉醒）+ 星级清零进下一轮；返回错误文案或 null */
  awakenSkill: (attr: AttributeId, skillLevel: number, stoneId: string, newName?: string) => Promise<string | null>;
  /** 誓约装备：快照原技能→置换（每 Persona 限1）；返回错误文案或 null。命名由 UI 层 LLM 后置覆写 */
  equipOathStone: (attr: AttributeId, skillLevel: number, stoneId: string) => Promise<string | null>;
  /** 誓约卸下：原技能完整恢复 + 石返还（完全可逆） */
  unequipOathStone: (attr: AttributeId) => Promise<void>;
  /** 誓约技 LLM 命名回写（并缓存到石头上，重复装备不再调 AI） */
  renameOathSkill: (attr: AttributeId, name: string, description: string) => Promise<void>;
  /** 共鸣链生效切换（同时 1 条；null=全部收起） */
  setActiveChain: (key: ChainKey | null) => Promise<void>;
  /** 熟练度记录（战斗中每次技能使用；内部触发双条件解锁刷新） */
  recordSkillUses: (uses: Array<{ attr: AttributeId; level: number }>) => Promise<void>;
  /** 技能解锁刷新：存量迁移（unlocked 缺省→按当时属性等级置位，不回锁）+ 双条件（属性等级≥N 且前技满星） */
  refreshSkillUnlocks: () => Promise<void>;
  // ── 批4 · 日常闭环 ──
  /** 备战抽取应用：buff 进 session（伤害类）+ SP 即发；记 prepDrawnId 防重复 */
  applyPrepBuff: (buff: { id: string; label: string; addPct?: number; sp?: number }) => Promise<void>;
  /** 勤勉的光辉：塔内使用一枚 → 完全恢复 HP；返回是否成功 */
  claimDiligence: () => Promise<boolean>;
  /** 战场成就壮举：记入 battleFeats 并尝试解锁对应成就 */
  recordBattleFeat: (feat: string) => Promise<void>;
  /** 黑猫败因信：败退当晚生成（AI/模板兜底）→ 存 pendingCatLetter（黑猫打开时投递）+ 写 observation 记忆 */
  deliverDefeatLetter: () => Promise<void>;
  /** 月相祭坛：移除主影随机一条词缀（顽固回落 HP 上限）；返回被移除的词缀或 null */
  removeRandomShadowAffix: () => Promise<AffixKind | null>;

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

/** hex → "r g b" 三元组（供 --color-primary-rgb，Tailwind 透明度修饰符依赖它） */
function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** 将自定义颜色写入 CSS 变量（内style 覆盖 data-theme 规则*/
export function applyCustomThemeColor(hex: string) {
  document.documentElement.style.setProperty('--color-primary', hex);
  document.documentElement.style.setProperty('--color-primary-rgb', hexToRgbTriplet(hex));
  document.documentElement.style.setProperty('--color-secondary', lightenHex(hex));
}

/** F2a 默认提醒时段：新用户初始值，且现有用户首次开启通知时（notificationSlots 为 undefined）用它兜底。 */
export const DEFAULT_NOTIF_SLOTS: NotifSlot[] = [
  { id: 'morning', time: '08:00', enabled: true, label: '晨间序曲', contents: ['tarot', 'summary'] },
  { id: 'evening', time: '21:30', enabled: true, label: '夜间结算', contents: ['record', 'todos', 'countercurrent'] },
];

/** F5 记账奖励日封顶状态：锚日不是今天则视作 {0,0}（自然跨日重置）。 */
function ledgerDailyState(s: Settings, today: string): { sp: number; attr: number; bonus: number } {
  return s.ledgerRewardDate === today
    ? { sp: s.ledgerSpToday ?? 0, attr: s.ledgerAttrToday ?? 0, bonus: s.ledgerBonusSpToday ?? 0 }
    : { sp: 0, attr: 0, bonus: 0 };
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
  // F2a 本地通知：默认关，开启后用这两槽（晨间抽塔罗 / 晚间结算）
  notificationsEnabled: false,
  notificationSlots: DEFAULT_NOTIF_SLOTS,
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
  wishes: [],
  bigDealClear: null,
  todos: [],
  todoCompletions: [],
  summaries: [],
  ledgerEntries: [],
  budgets: [],
  assets: [],
  weeklyGoals: [],
  settings: DEFAULT_SETTINGS,
  currentPage: 'dashboard',
  // 每次启动首进「行动」先落记录页（内存态不持久化，会话内仍记忆上次停留）
  actionsSubTab: 'activities',
  levelUpNotification: null,
  achievementNotification: null,
  skillNotification: null,
  modalBlocker: false,
  persona: null,
  shadow: null,
  battleState: null,
  stratum: null,
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
      applyUiChannel(user.theme);

      await get().loadData();
      // F2a：历史成长总结一次性回填 viewedAt（=createdAt，视为已读），避免开启通知时旧总结被判「未读」刷屏。
      //      仅跑一次（flag 守卫）；此后新总结由保存 / 打开时各自标记已读。
      if (!get().settings.summaryViewedBackfillDone) {
        const legacy = (await db.summaries.toArray()).filter(s => !s.viewedAt);
        if (legacy.length > 0) {
          await db.summaries.bulkPut(legacy.map(s => ({ ...s, viewedAt: s.createdAt ?? new Date() })));
          await get().loadSummaries();
        }
        await get().updateSettings({ summaryViewedBackfillDone: true });
      }
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
      // F5 心相记账：载入流水与预算
      await get().loadLedger();
      // F3 治疗终端：载入启动素材库
      await get().loadWishes();
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
      applyUiChannel(newUser.theme);

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
    applyUiChannel(theme);
    // 自定义主题：应用 CSS 变量
    if (theme === 'custom' && settings.customThemeColor) {
      applyCustomThemeColor(settings.customThemeColor);
    } else {
      // 非自定义主题：清除内联覆盖
      document.documentElement.style.removeProperty('--color-primary');
      document.documentElement.style.removeProperty('--color-secondary');
    }
  },

  addActivity: async (description: string, points: Record<string, number>, method: 'local' | 'todo' | 'battle', options?: { important?: boolean; date?: Date; category?: Activity['category']; bigDealId?: string; wishId?: string }) => {
    const { user, dailyDivination, settings } = get();
    if (!user) return { unlockHints: { achievements: 0, skills: 0 }, activityId: '' };

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
      wishId: options?.wishId,
      bigDealId: options?.bigDealId,
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
                const streak = calcMaxStreak(streakDates(activities));
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

    void get().syncNotifications(); // 已记录 → 重排，撤掉「提醒记录」提醒

    // 挂了愿望的记录 → 泵一次进度（PRD_V2.6 §8「每次任务完成都会评估涨了多少」）。
    // 不 await：AI 评估要几秒，不能让"记一笔"卡在那里等；结果到了自己弹窗。
    // 愿望已实现时写的那条纪念记录也带 wishId，但那时 status 已是 'done'，泵内自会挡掉。
    if (options?.wishId) void get().bumpWishProgress(options.wishId);

    return {
      unlockHints: {
        achievements: matchedAchievements.length,
        skills: matchedSkills.length,
      },
      activityId: activity.id,
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
            return calcMaxStreak(streakDates(activities));
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
          case 'battle_feat': {
            // 批4 战场成就组：事实源 = BattleState.battleFeats（recordBattleFeat 写入）
            const feats = get().battleState?.battleFeats ?? [];
            return achievement.condition.feat && feats.includes(achievement.condition.feat) ? 1 : 0;
          }
          // 击破累计：事实源 = BattleState.defeatedShadowLog（与成就页 getProgress 同口径）。
          // 此前漏了这一 case → 落 default 0 → 卡片显示"已达成，点击解锁"但这里被 progress<value
          // 挡回，点了永远没反应（用户上报"已完成的成就无法解锁"）。
          case 'shadow_defeats':
            return get().battleState?.defeatedShadowLog?.length ?? 0;
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

  setActionsSubTab: (tab: 'todos' | 'activities') => {
    set({ actionsSubTab: tab });
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

    // F2a：仅当通知相关设置变动时重排（避免每次写设置都触发排程）
    if (newSettings.notificationsEnabled !== undefined || newSettings.notificationSlots !== undefined) {
      void get().syncNotifications();
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
    void get().syncNotifications(); // 今日塔罗已抽 → 重排，撤掉「塔罗未抽」提醒
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
    // F3 终端任务不走宣告卡的取消归档（否则会复活成可再次领奖的幽灵任务）
    if (c.terminal) return;
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
    // F3 终端任务永不占用首页钉选位（不应被当普通宣告卡 pin）
    if (id !== null) {
      const target = await db.callingCards.get(id);
      if (target?.terminal) return;
    }
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
      // F3 终端任务不走日期自动归档：完成由用户「我做到了」手动触发，过期也不自动结算
      if (card.terminal) continue;
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

  // ── F3 治疗终端 · 启动素材库 ──────────────────────
  loadWishes: async () => {
    const wishes = await db.wishes.orderBy('createdAt').toArray();
    set({ wishes });
  },

  saveWish: async (wish: Wish) => {
    await db.wishes.put(wish);
    await get().loadWishes();
  },

  addWish: async (input) => {
    const wish: Wish = {
      id: uuidv4(),
      parentId: input.parentId,
      title: input.title.trim(),
      note: input.note?.trim() || undefined,
      kind: input.parentId ? undefined : input.kind,
      currentState: input.parentId ? undefined : input.currentState?.trim() || undefined,
      attribute: input.attribute,
      arcanaId: input.arcanaId,
      status: 'active',
      source: input.source ?? 'manual',
      createdAt: new Date(),
    };
    await db.wishes.put(wish);
    await get().loadWishes();
    return wish;
  },

  deleteWish: async (id: string) => {
    // 删父级素材 → 连带删其全部小步骤（避免孤儿步骤）
    const children = await db.wishes.where('parentId').equals(id).toArray();
    if (children.length) await db.wishes.bulkDelete(children.map(c => c.id));
    await db.wishes.delete(id);
    await get().loadWishes();
  },

  setWishStatus: async (id: string, status: Wish['status']) => {
    const w = await db.wishes.get(id);
    if (!w) return;
    await db.wishes.put({
      ...w,
      status,
      archivedAt: status === 'active' ? undefined : (w.archivedAt ?? new Date()),
    });
    if (w.parentId) {
      if (status === 'done') {
        await appendWishStepHistory(w.parentId, {
          title: w.title,
          sourceStepId: w.id,
          via: 'manual',
        });
      } else if (status === 'active') {
        await removeWishStepHistory(w.parentId, w.id);
      }
    }
    await get().loadWishes();
  },

  getWishProgress: (wishId: string) => {
    // 只数"用户主动记下的事"：升级/成就解锁这类副记录不算数（它们本来就不带 wishId，
    // 这里再挡一道是防止将来有人给副记录也挂上）
    return get().activities.filter(a =>
      a.wishId === wishId
      && a.category !== 'level_up'
      && a.category !== 'achievement_unlock'
      && a.category !== 'skill_unlock',
    ).length;
  },

  fulfillWish: async (id: string) => {
    const w = await db.wishes.get(id);
    if (!w) return null;
    const timesLogged = get().getWishProgress(id);
    const now = new Date();

    // 本体：实现 + 归档。fulfilledAt 与 archivedAt 都写——
    // 前者标"这是实现不是放弃"，后者让它走既有的归档筛选
    await db.wishes.put({ ...w, status: 'done', fulfilledAt: now, archivedAt: w.archivedAt ?? now });

    // 子愿望一并离场（避免"父愿望实现了、子条目还挂在列表里"）
    const children = await db.wishes.where('parentId').equals(id).toArray();
    for (const c of children) {
      if (c.status === 'active') {
        await db.wishes.put({ ...c, status: 'archived', archivedAt: now });
      }
    }

    // 挂在这个愿望上的在途待办同样归档（口径同 BIG DEAL 收官：主体了结则从属一起收）
    const todos = await db.todos.toArray();
    let archivedTodos = 0;
    for (const t of todos) {
      if (t.wishId === id && t.isActive !== false) {
        await db.todos.put({ ...t, isActive: false });
        archivedTodos++;
      }
    }

    // 实现愿望同样发一次弹幕投稿机会（与 BIG DEAL 收官同口径）——
    // 「值得说给别人听的时刻」不该只有大事收官一种（PRD_V2.6 §3 反馈）
    await get().updateSettings({
      terminalDanmakuTokens: (get().settings.terminalDanmakuTokens ?? 0) + 1,
    });

    // 留一条纪念记录（不加点——这是 milestone 不是 grind，同 calling_card_clear 口径）
    const user = get().user;
    if (user) {
      await get().addActivity(
        `实现了愿望「${w.title}」`,
        { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 },
        'local',
        { important: true, category: 'wish_fulfilled', wishId: id },
      );
    }

    await get().loadWishes();
    await get().loadData();
    return { title: w.title, timesLogged, archivedTodos };
  },

  // ── 愿望进度（PRD_V2.6 §8）──────────────────────────────

  addWishStep: async (wishId, title, opts) => {
    const t = title.trim();
    const w = await db.wishes.get(wishId);
    if (!w || !t) return;
    const step: TodoStep = { id: uuidv4(), title: t, source: opts?.source ?? 'manual' };
    await db.wishes.put({ ...w, steps: [...(w.steps ?? []), step] });
    await get().loadWishes();
  },

  toggleWishStep: async (wishId, stepId) => {
    const w = await db.wishes.get(wishId);
    if (!w) return;
    const steps = w.steps ?? [];
    const target = steps.find(s => s.id === stepId);
    if (!target) return;
    const nowDone = !target.done;
    await db.wishes.put({
      ...w,
      steps: steps.map(s => (s.id === stepId
        ? { ...s, done: nowDone, doneAt: nowDone ? new Date().toISOString() : undefined }
        : s)),
    });
    await get().loadWishes();
    // 勾上才泵进度：撤勾是纠错动作，不该反过来弹一张"你退步了"的卡
    if (nowDone) void get().bumpWishProgress(wishId);
  },

  removeWishStep: async (wishId, stepId) => {
    const w = await db.wishes.get(wishId);
    if (!w) return;
    await db.wishes.put({ ...w, steps: (w.steps ?? []).filter(s => s.id !== stepId) });
    await get().loadWishes();
  },

  decomposeWishStepsAI: async (wishId) => {
    const w = get().wishes.find(x => x.id === wishId);
    if (!w) return [];
    // 同 decomposeBigDealAI 的手法：把 steps 映射成伪子 Wish，避重/限量/清洗全部继承
    const children: Wish[] = (w.steps ?? []).map(s => ({
      id: s.id,
      parentId: w.id,
      title: s.title,
      status: s.done ? 'done' : 'active',
      source: s.source,
      createdAt: new Date(w.createdAt),
    }));
    return get().decomposeWishAI(w, children);
  },

  getWishRing: (wishId) => {
    const w = get().wishes.find(x => x.id === wishId);
    const steps = w?.steps ?? [];
    const done = steps.filter(s => s.done).length;
    const times = get().getWishProgress(wishId);
    return {
      pct: w?.progressPct ?? localWishEstimate(done, steps.length, times),
      // 「从未评估过」和「评估结果是 0%」是两回事，环要分别画
      evaluated: typeof w?.progressPct === 'number',
      done,
      total: steps.length,
      times,
    };
  },

  setWishProgress: async (wishId, pct, opts) => {
    const w = await db.wishes.get(wishId);
    if (!w) return;
    const next = Math.max(0, Math.min(100, Math.round(pct)));
    const prev = w.progressPct;
    const point: WishProgressPoint = {
      at: new Date().toISOString(),
      pct: next,
      delta: next - (prev ?? 0),
      reason: opts?.reason,
      source: opts?.source ?? 'manual',
    };
    await db.wishes.put({
      ...w,
      progressPct: next,
      progressBasis: opts?.reason ?? w.progressBasis,
      progressUpdatedAt: point.at ? new Date(point.at) : new Date(),
      progressSource: point.source,
      progressHistory: [...(w.progressHistory ?? []), point].slice(-12),
    });
    await get().loadWishes();
  },

  evaluateWishProgress: async (wishId, opts) => {
    const w = get().wishes.find(x => x.id === wishId) ?? await db.wishes.get(wishId);
    // 已实现/已归档的愿望不再评估——那条线已经走完了
    if (!w || w.status !== 'active') return null;

    const steps = w.steps ?? [];
    const done = steps.filter(s => s.done).length;
    const times = get().getWishProgress(wishId);
    const prev = w.progressPct;

    let pct = localWishEstimate(done, steps.length, times);
    let reason: string | undefined;
    let source: WishProgressSource = 'local';

    const cfg = getAIConfig(get().settings);
    if (cfg) {
      try {
        const recent = get().activities
          .filter(a => a.wishId === wishId)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 8)
          .map(a => `· ${a.description}`.slice(0, 40));
        const usr = [
          `愿望：${w.title}`,
          w.note ? `补充：${w.note.slice(0, 80)}` : '',
          w.currentState ? `用户自述现状：${w.currentState.slice(0, 90)}` : '',
          steps.length ? `子任务：已完成 ${done} / 共 ${steps.length}（${steps.slice(0, 8).map(s => `${s.done ? '✓' : '○'}${s.title.slice(0, 18)}`).join('，')}）` : '子任务：还没拆',
          `挂到这个愿望的记录：${times} 条${recent.length ? `\n${recent.join('\n')}` : ''}`,
          typeof prev === 'number' ? `上次评估：${prev}%${w.progressBasis ? `（依据：${w.progressBasis}）` : ''}` : '此前没有评估过',
          opts?.context ? `用户刚刚在对话里说的（重要，优先据此调整）：${opts.context.slice(0, 300)}` : '',
          '请给出现在的完成度百分比。',
        ].filter(Boolean).join('\n');
        const content = await callWishJson(cfg, [
          { role: 'system', content: WISH_EVAL_SYS },
          { role: 'user', content: usr },
        ]);
        const parsed = parseWishEval(content);
        if (parsed) {
          pct = parsed.pct;
          reason = parsed.reason;
          source = 'ai';
        }
      } catch {
        // AI 没接通就用本地估算——这个功能不该因为没网就整块消失
      }
    }

    // 自动路径（任务完成后的泵）单调不降：刚做完一件事却看见环缩回去，
    // 是在惩罚用户干活。要下调只能走面板里手动的「重新评估」（allowDecrease）。
    if (!opts?.allowDecrease && typeof prev === 'number') pct = Math.max(prev, pct);
    pct = Math.max(0, Math.min(100, Math.round(pct)));

    const delta = pct - (prev ?? 0);
    // dryRun：Agent 的提议路径只要一个数字去问用户，写库要等确认（§8）
    if (!opts?.dryRun) await get().setWishProgress(wishId, pct, { reason, source });
    return { pct, delta, reason, source };
  },

  bumpWishProgress: async (wishId) => {
    const s = get();
    if (s.settings.wishAutoEvaluate === false) return;
    const w = s.wishes.find(x => x.id === wishId);
    if (!w || w.status !== 'active') return;
    // 同一愿望 20 秒内只泵一次：批量补记 / 连勾多条子步时不该弹一串卡
    const last = wishBumpAt.get(wishId) ?? 0;
    if (Date.now() - last < 20_000) return;
    wishBumpAt.set(wishId, Date.now());
    try {
      const r = await get().evaluateWishProgress(wishId);
      if (!r) return;
      set({
        wishProgressCut: {
          wishId,
          wishTitle: w.title,
          pct: r.pct,
          delta: r.delta,
          reason: r.reason,
          source: r.source,
          times: get().getWishProgress(wishId),
        },
      });
    } catch {
      // 泵失败静默：它是锦上添花，不该把"完成任务"这件事搞出错误提示
    }
  },

  wishProgressCut: null,
  clearWishProgressCut: () => set({ wishProgressCut: null }),
  wishProposal: null,
  setWishProposal: (p) => set({ wishProposal: p }),

  // ── 回归面板（PRD_V2.6 §12）──────────────────────────────

  markAppOpened: async () => {
    const s = get();
    const nowIso = new Date().toISOString();
    const last = s.settings.lastOpenedAt;

    // 第一次打开：只落时间戳。没有"上一次"就谈不上离开
    if (!last) {
      await get().updateSettings({ lastOpenedAt: nowIso });
      return null;
    }

    const lastMs = new Date(last).getTime();
    const daysAway = Math.floor((Date.now() - lastMs) / 86400000);
    await get().updateSettings({ lastOpenedAt: nowIso });
    if (!Number.isFinite(daysAway) || daysAway < RETURN_MIN_DAYS) return null;

    // 同一次回归只弹一次：面板弹过之后 lastOpenedAt 已被刷新，
    // 正常不会重入；这一道是防"同一天里反复冷启动"的兜底
    const panelAt = s.settings.lastReturnPanelAt;
    if (panelAt && Date.now() - new Date(panelAt).getTime() < 12 * 3600_000) return null;
    await get().updateSettings({ lastReturnPanelAt: nowIso });

    const tier: ReturnTier = daysAway <= RETURN_RECENT_MAX_DAYS ? 'recent' : 'distant';
    // 补记范围 = 缺席那几天，上限 14。distant 档不给日历
    const backfillDays: string[] = [];
    if (tier === 'recent') {
      for (let i = daysAway; i >= 1; i--) {
        backfillDays.push(toLocalDateKey(new Date(Date.now() - i * 86400000)));
      }
    }

    const attrs = s.attributes;
    const top = attrs.length
      ? attrs.reduce((a, b) => (b.level > a.level ? b : a))
      : null;

    return {
      daysAway,
      tier,
      returnCount: (s.settings.returnCount ?? 0) + 1,
      lastSeenKey: toLocalDateKey(new Date(lastMs)),
      backfillDays,
      totalRecords: s.activities.length,
      topAttribute: top
        ? {
            id: top.id as AttributeId,
            name: s.settings.attributeNames[top.id as AttributeNamesKey] ?? top.id,
            level: top.level,
          }
        : null,
    };
  },

  getBackfillSuggestions: (limit = 8) => {
    const since = Date.now() - 60 * 86400000;
    const freq = new Map<string, { count: number; points: Record<string, number> }>();
    for (const a of get().activities) {
      // 只数用户**自己写下的**记录：升级/成就/收官这类副记录不是"我做过的事"
      if (a.category || a.method !== 'local') continue;
      // 补记的条目不能反过来喂候选池——否则补过一次的东西会永远挂在 chip 上
      // 请你再补一次，形成一个自我强化的回路（驱动实测抓到：「补记用·跑步」进了候选）
      if (a.backfilled) continue;
      if (new Date(a.date).getTime() < since) continue;
      const text = a.description.trim();
      if (!text || text.length > 18) continue;
      const cur = freq.get(text);
      if (cur) cur.count++;
      else freq.set(text, { count: 1, points: a.pointsAwarded ?? {} });
    }
    return [...freq.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([text, v]) => ({ text, points: v.points }));
  },

  commitReturn: async (payload, entries, summary) => {
    const user = get().user;
    if (!user) return;
    const zero = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };

    // ① 补记条目。**一律不加点**（§12 红线）：
    //    追溯性地补发点数就是开了一个可以凭空造点的口子，
    //    而记录本身的价值——热力图、统计、愿望进度——不需要点数背书。
    for (const e of entries) {
      const text = e.text.trim();
      if (!text) continue;
      await db.activities.add({
        id: uuidv4(),
        userId: user.id,
        date: new Date(e.dateKey + 'T12:00:00'),
        description: text,
        pointsAwarded: { ...zero },
        method: 'local',
        backfilled: true,
      });
    }

    // ② 一句话概括：distant 档的唯一形态，recent 档也可以选它代替日历
    if (summary && summary.trim()) {
      await db.activities.add({
        id: uuidv4(),
        userId: user.id,
        // 落在"离开的最后一天"，而不是今天——它讲的是那段时间的事
        date: new Date(payload.lastSeenKey + 'T12:00:00'),
        description: summary.trim().slice(0, 200),
        pointsAwarded: { ...zero },
        method: 'local',
        backfilled: true,
      });
    }

    // ③ 那条带 tag 的回归记录。0 加点——milestone 不是 grind（同 wish_fulfilled / calling_card_clear 口径）
    await db.activities.add({
      id: uuidv4(),
      userId: user.id,
      date: new Date(),
      description:
        `你时隔 ${payload.daysAway} 天重新叩响了靛蓝色房间的房门，` +
        `第 ${payload.returnCount} 次回到了更生的旅途上。`,
      pointsAwarded: { ...zero },
      method: 'local',
      important: true,
      category: 'return',
    });

    // ④ 回归的犒赏走**非经济**路径：一次弹幕投稿机会。
    //    给点数等于在为"离开"付钱；给一次说话的机会，是请他把回来这件事说给别人听。
    await get().updateSettings({
      returnCount: payload.returnCount,
      terminalDanmakuTokens: (get().settings.terminalDanmakuTokens ?? 0) + 1,
    });

    await get().loadData();
  },

  decomposeWishAI: async (parent: Wish, children: Wish[] = []) => {
    const cfg = getAIConfig(get().settings);
    if (!cfg) throw new Error('未配置 AI，请在「设置 → AI 总结」填入 API 密钥，或手动添加小步骤');
    const compact = (text: string | undefined, max: number) =>
      (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const normalizeStep = (text: string) =>
      text.replace(/[\s，。,.!！?？、；;：:（）()《》「」『』"'“”‘’]/g, '').toLowerCase();
    const kind = parent.kind === 'pressure' ? '短期压力' : '长期愿望';
    const activeSteps = children.filter(c => c.status === 'active').map(c => c.title.trim()).filter(Boolean);
    const doneChildren = children.filter(c => c.status === 'done').map(c => c.title.trim()).filter(Boolean);
    const history = (parent.stepHistory ?? []).map(h => h.title.trim()).filter(Boolean);
    const completed = Array.from(new Set([...history, ...doneChildren])).slice(-6);
    const visibleActive = activeSteps.slice(0, 5);
    const maxSuggestions = activeSteps.length >= 3 ? 3 : 5;
    const existing = new Set([...completed, ...activeSteps].map(normalizeStep).filter(Boolean));
    const parseSteps = (content: string) => {
      const raw = content.trim();
      let candidates: string[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) candidates = parsed.map(String);
      } catch {
        candidates = [];
      }
      if (candidates.length === 0) {
        candidates = raw
          .split(/\n+/)
          .flatMap(line => line.split(/[；;]+/))
          .flatMap(seg => seg.split(/\s+(?=\d+[.、)）])/));
      }
      const seen = new Set<string>();
      const result: string[] = [];
      for (const item of candidates) {
        const cleaned = item
          .replace(/^(?:[\s\-*·•]+|\d+[.、)）]\s*)+/, '')
          .replace(/^["'「『（(]+/, '')
          .replace(/["'」』）),，。.!！?？]+$/, '')
          .trim();
        const key = normalizeStep(cleaned);
        if (!cleaned || cleaned.length > 42 || !/[\p{L}\p{N}]/u.test(cleaned)) continue;
        if (existing.has(key) || seen.has(key)) continue;
        seen.add(key);
        result.push(cleaned);
        if (result.length >= maxSuggestions) break;
      }
      return result;
    };
    const sys =
      '你是停滞诊断后的行动启动教练。用户不是来管理任务，而是从卡住里恢复流动。' +
      '只给一个方向上的下一组行动，不做长计划，不解释背景，不逐条呼应已有步骤。' +
      '若上下文里有“诊断/处理原则”，必须按它降低门槛；若已有未完成步骤，把它们视为已排队，只补充不重复的新步骤。' +
      '每条必须是单一动作、可开始、短句，不超过 28 个中文字符；不要冒号、括号、编号、鼓励语、原因说明。' +
      '只输出小步骤本身，每行一个。';
    const usr = [
      `类型：${kind}`,
      `主题：${compact(parent.title, 60)}`,
      parent.currentState ? `当前进度：${compact(parent.currentState, 90)}` : '',
      parent.note ? `补充：${compact(parent.note, 80)}` : '',
      completed.length ? `最近完成：${completed.map(s => compact(s, 30)).join('；')}` : '',
      visibleActive.length ? `已排队未完成：${visibleActive.map(s => compact(s, 30)).join('；')}${activeSteps.length > visibleActive.length ? `；另有 ${activeSteps.length - visibleActive.length} 条` : ''}` : '',
      `请补充 ${maxSuggestions} 条以内的新小步骤。`,
    ].filter(Boolean).join('\n');
    let firstError: unknown;
    let sawEmptyResponse = false;
    try {
      const content = await chatComplete(
        cfg,
        [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        { temperature: 0.45, maxTokens: 220 },
      );
      const steps = parseSteps(content);
      if (steps.length > 0) return steps;
    } catch (e) {
      sawEmptyResponse = e instanceof Error && e.message.includes('AI 返回空响应');
      firstError = e;
    }

    try {
      const content = await chatComplete(
        cfg,
        [
          { role: 'system', content: '只输出 1 到 3 行中文短行动。不要解释，不要编号，不要重复用户已有内容。' },
          { role: 'user', content: `主题：${compact(parent.title, 50)}\n当前：${compact(parent.currentState || parent.note, 80)}\n已有：${visibleActive.slice(0, 3).map(s => compact(s, 24)).join('；') || '暂无'}\n请给下一步。` },
        ],
        { temperature: 0.35, maxTokens: 140 },
      );
      const steps = parseSteps(content);
      if (steps.length > 0) return steps;
    } catch (e) {
      sawEmptyResponse = sawEmptyResponse || (e instanceof Error && e.message.includes('AI 返回空响应'));
      firstError = firstError ?? e;
    }
    if (sawEmptyResponse) {
      throw new Error('AI 这次没有返回可用的小步骤。上下文已经压短过，可以稍后重试，或先手动补一条。');
    }
    throw firstError instanceof Error ? firstError : new Error('AI 拆分没成功');
  },

  getDueTodosToday: () => {
    const todayKey = toLocalDateKey();
    const todayWeekday = new Date().getDay(); // 0=周日…6=周六，与 Todos/Dashboard 同口径
    return get().todos.filter(t =>
      t.isActive &&
      !t.archivedAt &&
      !t.isBigDeal && // BIG DEAL 不进今日清单：首页走独立聚合卡（批2），此处混入会被当单次任务误完成
      (!t.startDate || t.startDate <= todayKey) &&
      (!t.weekdays || t.weekdays.length === 0 || t.weekdays.includes(todayWeekday)),
    );
  },

  // F3 终端 24h 小步卡动作已随终端退役（TASKS_MERGE_PRD 批5）：
  // 历史卡片仍带 card.terminal 元数据（各处按 !c.terminal 过滤照旧），仅动作族删除。

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
    for (const t of ALL_LOCAL_TABLES) {
      await db.table(t).clear();
    }
    // 黑猫是独立 store：表清了，内存里的人格列表/消息流还留着，不重置会出现
    //「数据已清空但猫还在接着上一句说」的错乱。
    try {
      const { useNavigatorStore } = await import('@/store/navigator');
      useNavigatorStore.setState({ messages: [], presets: [], sessionId: null, phase: 'idle' });
    } catch { /* 尚未加载过黑猫模块则无需重置 */ }

    set({
      user: null,
      attributes: [],
      activities: [],
      achievements: [],
      skills: [],
      dailyDivination: null,
      longReadings: [],
      callingCards: [],
      wishes: [],
      bigDealClear: null,
      wishProgressCut: null,
      wishProposal: null,
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
      ledgerEntries: [],
      budgets: [],
      assets: [],
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

    // 2. 快照当前所有数据，用于失败时恢复。
    //    ⚠️ 逐表手写会漂（FS7 审查实证：旧版快照漏了 ledgerEntries/budgets/assets，
    //    而 resetAllData 会清它们 —— 于是"导入失败自动恢复"反而把整本账吃掉）。
    //    这里改成对 ALL_LOCAL_TABLES 循环，与 resetAllData 共用同一份清单，从此不会再漏。
    const snapshot: Record<string, unknown[]> = {};
    for (const t of ALL_LOCAL_TABLES) {
      snapshot[t] = await db.table(t).toArray();
    }

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
          // archivedAt / completedAt 此前没还原，导入后它们是**字符串**而类型写着 Date。
          // 目前所有消费点都恰好套了 new Date(...) 才没炸，但那是运气不是设计——
          // 下一个直接写 todo.completedAt.getTime() 的人只会在"从备份恢复过的用户"身上崩。
          await db.todos.add({
            ...t,
            createdAt: new Date(t.createdAt),
            archivedAt: t.archivedAt ? new Date(t.archivedAt) : undefined,
            completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
          });
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
      if (data.strata && Array.isArray(data.strata)) {
        for (const s of data.strata as unknown[]) {
          const st = s as TowerStratum;
          await db.strata.put({ ...st, createdAt: new Date(st.createdAt) });
        }
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

      // 启动素材库（F3 v11 新增；旧备份无此字段则跳过）
      if (data.wishes && Array.isArray(data.wishes)) {
        for (const w of data.wishes as unknown[]) {
          const wi = w as Wish;
          await db.wishes.put({
            ...wi,
            createdAt: new Date(wi.createdAt),
            archivedAt: wi.archivedAt ? new Date(wi.archivedAt) : undefined,
            // JSON 里这两个是字符串，不还原成 Date 的话归档区的「已实现」标签
            // 和进度面板的「上次评估」都会拿到 string 去调 Date 方法
            fulfilledAt: wi.fulfilledAt ? new Date(wi.fulfilledAt) : undefined,
            progressUpdatedAt: wi.progressUpdatedAt ? new Date(wi.progressUpdatedAt) : undefined,
          });
        }
      }

      // ── 备份 v8 补挂（FS7）：这几张表此前导出端整段缺失，导入端自然也没分支。
      //    对旧备份（无这些 key）全部走 if 短路跳过，向后兼容。
      // F5 心相记账：永不上云，备份文件是它唯一的迁移载体
      if (data.ledgerEntries && Array.isArray(data.ledgerEntries)) {
        for (const e of data.ledgerEntries as unknown[]) {
          const le = e as LedgerEntry;
          await db.ledgerEntries.put({ ...le, createdAt: new Date(le.createdAt) });
        }
      }
      if (data.budgets && Array.isArray(data.budgets)) {
        // Budget.createdAt 是 Date，bulkPut 原样写回会留下字符串（同 todos 的理由）
        await db.budgets.bulkPut(
          (data.budgets as unknown[]).map(b => {
            const bg = b as Budget;
            return { ...bg, createdAt: new Date(bg.createdAt) };
          }),
        );
      }
      if (data.assets && Array.isArray(data.assets)) {
        for (const a of data.assets as unknown[]) {
          const as = a as LedgerAsset;
          await db.assets.put({ ...as, createdAt: new Date(as.createdAt) });
        }
      }
      // F6 黑猫：自定义人格 + 原子记忆（聊天原文不入备份，同 counselSessions 口径）
      if (data.navigatorPresets && Array.isArray(data.navigatorPresets)) {
        for (const p of data.navigatorPresets as unknown[]) {
          const np = p as NavigatorPreset;
          await db.navigatorPresets.put({ ...np, createdAt: new Date(np.createdAt) });
        }
      }
      if (data.navigatorMemos && Array.isArray(data.navigatorMemos)) {
        for (const m of data.navigatorMemos as unknown[]) {
          const nm = m as NavigatorMemo;
          await db.navigatorMemos.put({
            ...nm,
            createdAt: new Date(nm.createdAt),
            lastRecalledAt: nm.lastRecalledAt ? new Date(nm.lastRecalledAt) : undefined,
          });
        }
      }
      // v9 补挂：旧版每日事件。全字段字符串，无 Date 需还原（见 backup.ts 同处注释）
      if (data.dailyEvents && Array.isArray(data.dailyEvents)) {
        await db.dailyEvents.bulkPut(data.dailyEvents as DailyEvent[]);
      }

      // 重新加载应用
      await get().initializeApp();
    } catch (error) {
      console.error('导入数据失败，正在恢复原有数据', error);

      // 4. 恢复快照：先清空（部分写入可能已发生），再按同一份表清单写回
      try {
        await get().resetAllData();
        for (const t of ALL_LOCAL_TABLES) {
          const rows = snapshot[t];
          if (rows && rows.length) await db.table(t).bulkAdd(rows as never[]);
        }
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
    // BIG DEAL：进度恒为 steps 派生（生涯口径），不走 todoCompletion 计数
    if (todo?.isBigDeal) {
      const steps = todo.steps ?? [];
      const done = steps.filter(s => s.done).length;
      return { count: done, isComplete: steps.length > 0 && done >= steps.length, target: Math.max(1, steps.length) };
    }
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
    if (todo.isBigDeal) return null; // 大事只能逐子步完成（completeTodoStep），整单完成路径拦死

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
      // 待办挂了愿望 → 完成它产生的活动带上同一个 wishId，愿望进度才数得到（V2.6 §1.3）
      const result = await get().addActivity(`完成任务: ${todo.title}`, points, 'todo', { important: !!todo.important, wishId: todo.wishId });
      // 命运加成（TASKS_MERGE_PRD §4.2）：当日抽中并完成 → 主属性额外 +1。
      // 独立小记录而非改主记录描述——undoTodayTodoCompletion/deleteActivity 都按
      // 「完成任务: {title}」逐字匹配，动模板会断撤销链；单删本记录也能正确回档
      if (todo.fateDrawnDate === today) {
        const bonus = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 } as Record<string, number>;
        bonus[todo.attribute] = 1;
        await get().addActivity(`命运加成: ${todo.title}`, bonus, 'todo');
      }
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

      void get().syncNotifications(); // 待办完成 → 重排，撤掉已完成的「今日待办」提醒
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

  // ── BIG DEAL（任务×终端二合一，TASKS_MERGE_PRD 批1）───────────────────

  addTodoStep: async (todoId, title, opts) => {
    const clean = title.trim();
    if (!clean) return;
    const todo = await db.todos.get(todoId);
    if (!todo?.isBigDeal || todo.clearedActivityId) return;
    const step: TodoStep = { id: uuidv4(), title: clean, attribute: opts?.attribute, source: opts?.source ?? 'manual' };
    await db.todos.update(todoId, { steps: [...(todo.steps ?? []), step] });
    await get().loadData();
  },

  updateTodoStep: async (todoId, stepId, patch) => {
    const todo = await db.todos.get(todoId);
    if (!todo?.isBigDeal) return;
    await db.todos.update(todoId, {
      steps: (todo.steps ?? []).map(s => (s.id === stepId ? { ...s, ...patch, title: (patch.title ?? s.title).trim() || s.title } : s)),
    });
    await get().loadData();
  },

  removeTodoStep: async (todoId, stepId) => {
    const todo = await db.todos.get(todoId);
    if (!todo?.isBigDeal || todo.clearedActivityId) return;
    // 已完成子步的删除 = 先撤勾（连点数回档）再移除，避免幽灵点数
    const step = (todo.steps ?? []).find(s => s.id === stepId);
    if (step?.done) await get().undoTodoStep(todoId, stepId);
    const fresh = await db.todos.get(todoId);
    if (!fresh) return;
    await db.todos.update(todoId, { steps: (fresh.steps ?? []).filter(s => s.id !== stepId) });
    await get().loadData();
  },

  completeTodoStep: async (todoId, stepId) => {
    // 在途锁：同一子步双击在 addActivity 异步窗口内重入会双发点数
    if (_completingStepIds.has(stepId)) return null;
    _completingStepIds.add(stepId);
    try {
      const { user } = get();
      if (!user) return null;
      const todo = await db.todos.get(todoId);
      if (!todo?.isBigDeal || !todo.isActive || todo.clearedActivityId) return null;
      const steps = todo.steps ?? [];
      const idx = steps.findIndex(s => s.id === stepId);
      if (idx < 0 || steps[idx].done) return null;

      const doneStep: TodoStep = { ...steps[idx], done: true, doneAt: new Date().toISOString() };
      const nextSteps = steps.map((s, i) => (i === idx ? doneStep : s));
      await db.todos.update(todoId, { steps: nextSteps });

      // 子步点数 = 父条目 points，落在子步覆写属性（缺省父属性）；
      // 描述模板固定带主任务标注（D4：Agent 读记录时识别非独立任务），改动需同步 undoTodoStep 的匹配
      const attr = doneStep.attribute ?? todo.attribute;
      const points = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 } as Record<string, number>;
      points[attr] = todo.points;
      const doneCount = nextSteps.filter(s => s.done).length;
      await get().addActivity(
        `完成小步: ${doneStep.title}（大事「${todo.title}」第 ${doneCount}/${nextSteps.length} 步）`,
        points, 'todo',
        // wishId 随行：大事挂到某个愿望上时，它的每一小步都该算进那个愿望的靠近度（§8）
        { category: 'bigdeal_step', bigDealId: todoId, wishId: todo.wishId },
      );

      if (nextSteps.every(s => s.done)) {
        await get().collapseBigDeal(todoId);
        return { collapsed: true };
      }
      return { collapsed: false };
    } finally {
      _completingStepIds.delete(stepId);
    }
  },

  undoTodoStep: async (todoId, stepId) => {
    const todo = await db.todos.get(todoId);
    // 已收官后不可逐步撤：整体撤销 = 删除收官记录（批4 给入口）
    if (!todo?.isBigDeal || todo.clearedActivityId) return;
    const steps = todo.steps ?? [];
    const step = steps.find(s => s.id === stepId);
    if (!step?.done) return;
    await db.todos.update(todoId, { steps: steps.map(s => (s.id === stepId ? { ...s, done: false, doneAt: undefined } : s)) });
    // 对应 bigdeal_step 记录 → deleteActivity 完整回档（扣点/回算等级/清 level_up 副记录）。
    // activities 已按日期倒序，find 即取最近一次命中（同名子步取最新，可接受的边界）
    const act = get().activities.find(a =>
      a.category === 'bigdeal_step' && a.bigDealId === todoId
      && a.description.startsWith(`完成小步: ${step.title}（`),
    );
    if (act) await get().deleteActivity(act.id);
    else await get().loadData();
  },

  collapseBigDeal: async (todoId) => {
    const todo = await db.todos.get(todoId);
    if (!todo?.isBigDeal || todo.clearedActivityId) return;
    const steps = todo.steps ?? [];
    if (steps.length === 0 || !steps.some(s => s.done) || !steps.every(s => s.done)) return;

    // 触及属性各 +1（D3）：直接承载在收官记录的 pointsAwarded 上——deleteActivity 撤销链路免费继承
    const touched = new Set<AttributeId>(steps.map(s => s.attribute ?? todo.attribute));
    const points = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 } as Record<string, number>;
    touched.forEach(a => { points[a] = 1; });
    const { activityId } = await get().addActivity(
      `大事收官: ${todo.title}（${steps.length} 步全成）`,
      points, 'todo',
      { important: true, category: 'bigdeal_clear', bigDealId: todoId, wishId: todo.wishId },
    );

    // 收官 SP = min(20, 子步数×3)：战场模块关闭不发；从未初始化战场（无 battleState）也不发
    const spGrant = get().settings.battleEnabled !== false && get().battleState
      ? Math.min(BIGDEAL_CLEAR_SP_CAP, steps.length * BIGDEAL_CLEAR_SP_PER_STEP)
      : 0;
    if (spGrant > 0) await get().earnSP(spGrant);
    // 收官投稿权 +1（弹幕闭环，结算屏消费）
    await get().updateSettings({ terminalDanmakuTokens: (get().settings.terminalDanmakuTokens ?? 0) + 1 });

    await db.todos.update(todoId, {
      clearedActivityId: activityId,
      completedAt: new Date(),
      archivedAt: new Date(),
      isActive: false,
    });
    await get().loadData();
    // 结算屏载荷（App 顶层 BigDealClearCutIn 消费）
    set({
      bigDealClear: {
        todoId,
        title: todo.title,
        stepsCount: steps.length,
        sp: spGrant,
        attrs: Array.from(touched),
      },
    });
    void get().syncNotifications();
  },

  clearBigDealClear: () => set({ bigDealClear: null }),

  getBigDealProgress: (todoId) => {
    const todo = get().todos.find(t => t.id === todoId);
    const steps = todo?.steps ?? [];
    return {
      done: steps.filter(s => s.done).length,
      total: steps.length,
      nextStep: steps.find(s => !s.done) ?? null,
    };
  },

  decomposeBigDealAI: async (todoId) => {
    const todo = get().todos.find(t => t.id === todoId);
    if (!todo?.isBigDeal) return [];
    // 复用 decomposeWishAI：把大事映射成伪 Wish 树，避重/限量/清洗逻辑免费继承
    const parent: Wish = {
      id: todo.id,
      title: todo.title,
      kind: todo.deadline ? 'pressure' : 'long_term',
      currentState: todo.currentState,
      status: 'active',
      source: 'manual',
      createdAt: new Date(todo.createdAt),
    };
    const children: Wish[] = (todo.steps ?? []).map(s => ({
      id: s.id,
      parentId: todo.id,
      title: s.title,
      status: s.done ? 'done' : 'active',
      source: s.source,
      createdAt: new Date(todo.createdAt),
    }));
    return get().decomposeWishAI(parent, children);
  },

  rebuildBigDeal: async (todoId: string) => {
    const old = await db.todos.get(todoId);
    if (!old || !old.isBigDeal) return null;
    // 旧的原样归档（保留 clearedActivityId，历史与统计不受影响）
    await db.todos.put({ ...old, isActive: false, archivedAt: old.archivedAt ?? new Date() });
    // 新的：同名同步骤，子步全部重置为未完成，清掉收官痕迹
    const fresh: Todo = {
      ...old,
      id: uuidv4(),
      isActive: true,
      createdAt: new Date(),
      archivedAt: undefined,
      completedAt: undefined,
      clearedActivityId: undefined,
      fateDrawnDate: undefined,
      steps: (old.steps ?? []).map(st => ({ ...st, id: uuidv4(), done: false, doneAt: undefined })),
    };
    await db.todos.put(fresh);
    await get().loadData();
    return fresh.id;
  },

  runTasksMergeMigration: async () => {
    if (_tasksMergeMigrationPromise) return _tasksMergeMigrationPromise;
    _tasksMergeMigrationPromise = (async () => {
    if (get().settings.tasksMergeMigratedAt) return;
    const wishes = await db.wishes.toArray();
    // 轻量恢复保险：原始 wishes 全量快照进 localStorage（数据量小；隐私模式失败不阻塞）
    try { localStorage.setItem('velvet:wishes-premigrate', JSON.stringify(wishes)); } catch { /* ignore */ }

    const roots = wishes.filter(w => !w.parentId);
    for (const root of roots) {
      // 已完成/已归档的根不迁移（历史在 activities 里）；对应子步一并清走避免孤儿
      const children = wishes.filter(w => w.parentId === root.id);
      if (root.status !== 'active') {
        if (children.length) for (const c of children) await db.wishes.delete(c.id);
        if (root.status === 'archived') await db.wishes.delete(root.id);
        continue;
      }
      // 无子步的活跃根 → 原地留作愿望纸片（D8）
      if (children.length === 0) continue;

      // 带子步的根 → BIG DEAL：children 全量成子步；stepHistory 里无对应 child 的完成项补录为已完成子步
      const steps: TodoStep[] = children
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(c => ({
          id: c.id,
          title: c.title,
          attribute: c.attribute,
          done: c.status === 'done',
          doneAt: c.status === 'done' ? new Date(c.archivedAt ?? c.createdAt).toISOString() : undefined,
          source: c.source,
        }));
      const childIds = new Set(children.map(c => c.id));
      for (const h of root.stepHistory ?? []) {
        if (h.sourceStepId && childIds.has(h.sourceStepId)) continue;
        steps.push({ id: h.id, title: h.title, done: true, doneAt: h.completedAt, source: 'manual' });
      }
      const todo: Todo = {
        id: uuidv4(),
        title: root.title,
        attribute: root.attribute ?? 'guts',
        points: 2,
        frequency: 'single',
        isActive: true,
        createdAt: new Date(root.createdAt),
        isBigDeal: true,
        steps,
        currentState: root.currentState,
      };
      // 注：迁移时即使 steps 全 done 也不自动收官——收官是有奖励的仪式，留给用户在批2 面板里主动按
      await db.todos.add(todo);
      await db.wishes.delete(root.id);
      for (const c of children) await db.wishes.delete(c.id);
    }

    // 在途 24h 终端卡 → 静默归档（终端不再有入口，防止孤儿活跃卡）
    const cards = await db.callingCards.toArray();
    for (const c of cards) {
      if (c.terminal && !c.archived) {
        await db.callingCards.update(c.id, { archived: true, archivedAt: new Date(), archiveReason: 'manual' as const });
      }
    }

    await get().updateSettings({ tasksMergeMigratedAt: new Date().toISOString() });
    await get().loadData();
    await get().loadWishes();
    await get().loadCallingCards();
    })();
    // 跑完即释放这把锁：它只用来防"同一时刻并发进入"，**不是**幂等守卫——
    // 幂等由 settings.tasksMergeMigratedAt 负责。原来跑完不释放，
    // 于是「云端拉回一份来自未迁移设备的数据」之后，本会话再也不会补迁移（FS7 审查）。
    _tasksMergeMigrationPromise.finally(() => { _tasksMergeMigrationPromise = null; });
    return _tasksMergeMigrationPromise;
  },

  // ── 抽签（TASKS_MERGE_PRD §4.2 批3）────────────────────────────────────

  getFateDrawPool: () => {
    const today = toLocalDateKey();
    const st = get().settings.fateDrawState;
    const sunk = new Set(st && st.date === today ? st.drawnKeys : []);
    const pool: FateCandidate[] = [];

    // ① 今日未完成待办（义务；大事已被 getDueTodosToday 排除）
    for (const t of get().getDueTodosToday()) {
      if (get().getTodayTodoProgress(t.id).isComplete) continue;
      pool.push({ key: `todo:${t.id}`, kind: 'todo', title: t.title, todoId: t.id });
    }
    // ② 愿望纸片（新鲜感；迁移后 wishes 表只剩平铺条目）
    for (const w of get().wishes) {
      if (w.parentId || w.status !== 'active') continue;
      pool.push({ key: `wish:${w.id}`, kind: 'wish', title: w.title, wishId: w.id, attribute: w.attribute ?? 'guts', points: 2 });
    }
    // ③ 近 30 天手动记录去重（做过的事，零风险；排除机器记录与加成/升级副记录）
    const since = Date.now() - 30 * 86400_000;
    const seen = new Set<string>();
    for (const a of get().activities) {
      if (a.method !== 'local' || a.category) continue;
      if (new Date(a.date).getTime() < since) continue;
      const title = a.description.trim();
      const norm = title.replace(/\s+/g, '');
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      // 属性/点数建议 = 原记录最大加点维度（无加点则勇气+2）
      const top = (Object.entries(a.pointsAwarded) as Array<[AttributeId, number]>).sort((x, y) => y[1] - x[1])[0];
      pool.push({
        key: `hist:${norm.slice(0, 40)}`,
        kind: 'history',
        title,
        attribute: top && top[1] > 0 ? top[0] : 'guts',
        points: top && top[1] > 0 ? Math.max(1, Math.min(5, top[1])) : 2,
      });
    }
    return pool.filter(c => !sunk.has(c.key));
  },

  drawFate: async (pool) => {
    const today = toLocalDateKey();
    const candidates = pool ?? get().getFateDrawPool();
    if (candidates.length === 0) return null;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const st = get().settings.fateDrawState;
    const drawnKeys = st && st.date === today ? [...st.drawnKeys, picked.key] : [picked.key];
    await get().updateSettings({ fateDrawState: { date: today, drawnKeys } });
    return picked;
  },

  acceptFateDraw: async (c) => {
    const today = toLocalDateKey();
    if (c.kind === 'todo' && c.todoId) {
      await db.todos.update(c.todoId, { fateDrawnDate: today });
      await get().loadData();
      return;
    }
    // 愿望转正 / 历史复刻 → 今日一次性任务（带签）
    const todo: Todo = {
      id: uuidv4(),
      title: c.title,
      attribute: c.attribute ?? 'guts',
      points: c.points ?? 2,
      frequency: 'single',
      isActive: true,
      createdAt: new Date(),
      fateDrawnDate: today,
    };
    await db.todos.add(todo);
    if (c.kind === 'wish' && c.wishId) {
      // 纸片转正即离场（archived；完成与否由任务本体承接）
      const w = await db.wishes.get(c.wishId);
      if (w) await db.wishes.put({ ...w, status: 'archived', archivedAt: new Date() });
      await get().loadWishes();
    }
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
    void get().syncNotifications(); // 新总结默认未读 → 安排「未读成长总结」提醒
  },

  markSummaryViewed: async (id: string) => {
    const { summaries } = get();
    const target = summaries.find(s => s.id === id);
    if (!target || target.viewedAt) return; // 不存在或已读 → 跳过
    const viewedAt = new Date();
    await db.summaries.update(id, { viewedAt });
    set({ summaries: summaries.map(s => (s.id === id ? { ...s, viewedAt } : s)) });
    void get().syncNotifications(); // 已读后撤掉「未读成长总结」提醒
  },

  syncNotifications: async () => {
    const { settings, dailyDivination, todos, summaries, activities } = get();
    const todayKey = toLocalDateKey();
    const dueTodos = todos.filter(t =>
      t.isActive && !t.archivedAt && (!t.startDate || t.startDate <= todayKey),
    );
    const snapshot: NotifSnapshot = {
      enabled: !!settings.notificationsEnabled,
      slots: settings.notificationSlots ?? [],
      attributeNames: settings.attributeNames,
      tarotDrawnToday: !!dailyDivination && dailyDivination.date === todayKey,
      incompleteTodoCount: dueTodos.filter(t => !get().getTodayTodoProgress(t.id).isComplete).length,
      hasActiveDailyTodos: dueTodos.some(t => t.repeatDaily),
      countercurrentWarnings: get().getCountercurrentWarnings(),
      hasUnreadSummary: summaries.some(s => !s.viewedAt),
      loggedToday: activities.some(a => !a.category && toLocalDateKey(new Date(a.date)) === todayKey),
    };
    try {
      await computeAndSchedule(snapshot);
    } catch (e) {
      console.warn('[notifications] sync failed', e);
    }
    // 桌面小组件快照（PRD_V2.6 §8）搭这趟车：
    // syncNotifications 的触发点（记录/勾任务/抽塔罗/改设置）恰好就是
    // 组件需要重画的时机，不必再铺一套自己的钩子。内部自带指纹去重与静默失败。
    void pushWidgetSnapshot();
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
    const cfg = getAIConfig(settings);
    if (!cfg) throw new Error('请先在「设置 → AI 总结」中配置 API 密钥');
    const content = await chatComplete(cfg, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ], { temperature: 0.8, maxTokens: 2000 });

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
  // ── F5 心相记账 ──────────────────────────────────────────
  loadLedger: async () => {
    const [ledgerEntries, budgets, assets] = await Promise.all([
      db.ledgerEntries.toArray(),
      db.budgets.toArray(),
      db.assets.toArray(),
    ]);
    set({ ledgerEntries, budgets, assets });
  },

  addLedgerEntry: async (input) => {
    const entry: LedgerEntry = {
      ...input,
      id: uuidv4(),
      currency: input.currency ?? get().settings.currency ?? 'CNY',
      createdAt: new Date(),
    };
    await db.ledgerEntries.put(entry);
    set({ ledgerEntries: [...get().ledgerEntries, entry] });
    return entry;
  },

  deleteLedgerEntry: async (id) => {
    const entry = get().ledgerEntries.find(e => e.id === id);
    // 回收落账时发放的奖励，封堵「增→删」刷分（H1/M3）
    if (entry?.reward) {
      if (entry.reward.attr) {
        try { await get().deleteActivity(entry.reward.attr.activityId); } catch { /* 活动可能已被手动删除 */ }
      }
      if (entry.reward.sp > 0 && get().battleState) {
        const bs = get().battleState!;
        await get().saveBattleState({
          ...bs,
          sp: Math.max(0, bs.sp - entry.reward.sp),
          totalSpEarned: Math.max(0, bs.totalSpEarned - entry.reward.sp),
        });
      }
      // 注意：不回退当日封顶计数（ledgerSpToday 等），使同日反复「增→删」仍被 20/日 上限挡住。
    }
    await db.ledgerEntries.delete(id);
    set({ ledgerEntries: get().ledgerEntries.filter(e => e.id !== id) });
  },

  setBudget: async (period, patch) => {
    const existing = get().budgets.find(b => b.period === period);
    const budget: Budget = existing
      ? { ...existing, ...patch }
      : { id: period, period, createdAt: new Date(), ...patch };
    await db.budgets.put(budget);
    set({ budgets: [...get().budgets.filter(b => b.period !== period), budget] });
  },

  adjustTotalBalance: async (targetTotal) => {
    if (get().getAdjustCountThisMonth() >= 3) {
      return { ok: false, reason: '本月对账已用完 3 次' };
    }
    const delta = targetTotal - get().getTotalBalance();
    if (Math.abs(delta) < 0.005) return { ok: true };
    await get().addLedgerEntry({
      direction: 'adjust',
      amount: delta,
      date: toLocalDateKey(),
      source: 'manual',
      note: '余额对账',
    });
    return { ok: true };
  },

  getTotalBalance: () => {
    return get().ledgerEntries.reduce((sum, e) => {
      if (e.direction === 'income') return sum + e.amount;
      if (e.direction === 'expense') return sum - e.amount;
      return sum + e.amount; // adjust：可正可负
    }, 0);
  },

  getMonthExpense: (period) => {
    const p = period ?? toLocalDateKey().slice(0, 7);
    return get().ledgerEntries
      .filter(e => e.direction === 'expense' && e.date.slice(0, 7) === p)
      .reduce((s, e) => s + e.amount, 0);
  },

  getMonthIncome: (period) => {
    const p = period ?? toLocalDateKey().slice(0, 7);
    // 收入 = 入账 + 本月「对账」转入的正向部分（对账补的钱算当月收入，次月自然结转为余额）
    return get().ledgerEntries
      .filter(e => e.date.slice(0, 7) === p && (e.direction === 'income' || (e.direction === 'adjust' && e.amount > 0)))
      .reduce((s, e) => s + e.amount, 0);
  },

  // 按「周期」（日历月或发薪日周期，依 settings.ledgerPayCycleEnabled）统计支出/收入（M4）
  getPeriodExpense: (periodKey) => {
    const s = get().settings;
    const [start, end] = cycleRangeForKey(!!s.ledgerPayCycleEnabled, s.ledgerResetDay ?? 1, periodKey);
    return get().ledgerEntries
      .filter(e => e.direction === 'expense' && e.date >= start && e.date <= end)
      .reduce((a, e) => a + e.amount, 0);
  },
  getPeriodIncome: (periodKey) => {
    const s = get().settings;
    const [start, end] = cycleRangeForKey(!!s.ledgerPayCycleEnabled, s.ledgerResetDay ?? 1, periodKey);
    return get().ledgerEntries
      .filter(e => e.date >= start && e.date <= end && (e.direction === 'income' || (e.direction === 'adjust' && e.amount > 0)))
      .reduce((a, e) => a + e.amount, 0);
  },

  getBudget: (period) => {
    const p = period ?? toLocalDateKey().slice(0, 7);
    return get().budgets.find(b => b.period === p);
  },

  getAdjustCountThisMonth: () => {
    const p = toLocalDateKey().slice(0, 7);
    return get().ledgerEntries.filter(e => e.direction === 'adjust' && e.date.slice(0, 7) === p).length;
  },

  // 发放记账 SP：bonus=true（劳动/值得/月末）不占每日封顶；普通每笔受 20/日封顶。
  // 无 battleState（未启用战场）→ SP 无处可放，静默跳过。
  earnLedgerSp: async (amount, tier = 'regular') => {
    if (!get().battleState || amount <= 0) return 0;
    const today = toLocalDateKey();
    const st = ledgerDailyState(get().settings, today);
    // regular（每笔 +2）受 20/日；bonus（劳动/值得）另设 20/日封顶；flat（月末奖励）不封顶、不计数
    const grant = tier === 'regular' ? Math.min(amount, Math.max(0, 20 - st.sp))
                : tier === 'bonus' ? Math.min(amount, Math.max(0, 20 - st.bonus))
                : amount;
    if (grant <= 0) return 0;
    const before = get().battleState?.sp ?? 0;
    await get().earnSP(grant);
    const added = (get().battleState?.sp ?? 0) - before; // 实发（含战场倍率）
    if (tier === 'regular') {
      await get().updateSettings({ ledgerRewardDate: today, ledgerSpToday: st.sp + grant, ledgerAttrToday: st.attr, ledgerBonusSpToday: st.bonus });
    } else if (tier === 'bonus') {
      await get().updateSettings({ ledgerRewardDate: today, ledgerSpToday: st.sp, ledgerAttrToday: st.attr, ledgerBonusSpToday: st.bonus + grant });
    }
    return added;
  },

  // 一笔记账落账后的奖励编排（saveDraft 调用，仅创建时一次）：
  //   · 每笔记账 +2 SP（封顶） · 劳动收入 +10 SP · 投资类自选属性 +1~2（封顶 2/日，走 addActivity）
  //   · 消费评估「值得」+1 SP。adjust（对账）不奖励。守「不奖励花钱」：必要/欲望/冲动只拿记账 SP。
  rewardForLedgerEntry: async (entry, opts) => {
    if (entry.direction === 'adjust') return;
    let sp = await get().earnLedgerSp(2, 'regular');
    let attr: NonNullable<LedgerEntry['reward']>['attr'];
    if (entry.direction === 'income') {
      if (entry.incomeType === 'labor') sp += await get().earnLedgerSp(10, 'bonus');
    } else {
      // expense：成长类目自选属性 +1~2（日封顶 2）
      if (isGrowthCategory(entry.type) && opts?.attribute && (opts.attrPoints ?? 0) > 0) {
        const today = toLocalDateKey();
        const st = ledgerDailyState(get().settings, today);
        const grant = Math.min(opts.attrPoints as number, Math.max(0, 2 - st.attr));
        if (grant > 0) {
          const { activityId } = await get().addActivity(`心相投资 · ${entry.note || '自我投资'}`, { [opts.attribute]: grant }, 'local', { category: 'ledger' });
          await get().updateSettings({ ledgerRewardDate: today, ledgerSpToday: st.sp, ledgerAttrToday: st.attr + grant, ledgerBonusSpToday: st.bonus });
          attr = { activityId, attribute: opts.attribute, points: grant };
        }
      }
      if (opts?.evalWorth === 'worth') sp += await get().earnLedgerSp(1, 'bonus');
    }
    // 记录实发奖励，供删除时精确回收（H1/M3）
    if (sp > 0 || attr) {
      const reward = { sp, ...(attr ? { attr } : {}) };
      await db.ledgerEntries.update(entry.id, { reward });
      set({ ledgerEntries: get().ledgerEntries.map(e => (e.id === entry.id ? { ...e, reward } : e)) });
    }
  },

  // ── F5 资产板块 ──
  addAsset: async (input) => {
    const asset: LedgerAsset = { ...input, id: uuidv4(), createdAt: new Date() };
    await db.assets.put(asset);
    set({ assets: [...get().assets, asset] });
    return asset;
  },
  updateAsset: async (id, patch) => {
    const cur = get().assets.find(a => a.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    await db.assets.put(next);
    set({ assets: get().assets.map(a => (a.id === id ? next : a)) });
  },
  deleteAsset: async (id) => {
    await db.assets.delete(id);
    set({ assets: get().assets.filter(a => a.id !== id) });
  },
  getFixedAssetTotal: () => {
    return get().assets
      .filter(a => a.status !== 'soldout')
      .reduce((s, a) => s + a.price + (a.addOns?.reduce((x, o) => x + o.amount, 0) ?? 0), 0);
  },

  getSavings: () => {
    const st = get().settings;
    const todayKey = toLocalDateKey();
    // 仅统计「已完整结束」的周期（日历月或发薪日周期）；周期内省下 = 预算 − 该周期支出
    return get().budgets
      .filter(b => b.monthlyLimit != null && cycleRangeForKey(!!st.ledgerPayCycleEnabled, st.ledgerResetDay ?? 1, b.period)[1] < todayKey)
      .reduce((acc, b) => acc + Math.max(0, (b.monthlyLimit ?? 0) - get().getPeriodExpense(b.period)), 0);
  },

  claimLedgerBudgetBonus: async (period) => {
    const s = get().settings;
    if ((s.ledgerBudgetBonusMonths ?? []).includes(period)) return false;
    if (cycleRangeForKey(!!s.ledgerPayCycleEnabled, s.ledgerResetDay ?? 1, period)[1] >= toLocalDateKey()) return false; // 仅已完整结束的周期发放
    const budget = get().getBudget(period)?.monthlyLimit;
    if (budget == null || get().getPeriodExpense(period) > budget) return false;
    const granted = await get().earnLedgerSp(10, 'flat');
    if (granted <= 0) return false; // 无战场→SP 没发，不烧名额、不弹横幅（M1）
    // 名额数组必须在 await 之后**重读**再追加：earnLedgerSp 内部也写 settings，
    // 拿 await 之前抓的 s 去展开就是一次 lost update，会把期间写进去的其它名额抹掉（FS7 审查）
    const claimed = get().settings.ledgerBudgetBonusMonths ?? [];
    if (claimed.includes(period)) return true; // 竞态下已被另一次调用记账，不重复追加
    await get().updateSettings({ ledgerBudgetBonusMonths: [...claimed, period] });
    return true;
  },

  claimLedgerChallengeBonus: async (period) => {
    const s = get().settings;
    if ((s.ledgerChallengeWonMonths ?? []).includes(period)) return null;
    if (cycleRangeForKey(!!s.ledgerPayCycleEnabled, s.ledgerResetDay ?? 1, period)[1] >= toLocalDateKey()) return null; // 仅已完整结束的周期
    const b = get().getBudget(period);
    if (b?.monthlyLimit == null || b.savingsGoal == null || b.savingsGoal <= 0) return null;
    const saved = b.monthlyLimit - get().getPeriodExpense(period);
    if (saved < b.savingsGoal) return null; // 未达成挑战
    const granted = await get().earnLedgerSp(10, 'flat');
    if (granted <= 0) return null; // 无战场→不发不烧名额（M1）
    const won = get().settings.ledgerChallengeWonMonths ?? []; // 同上：await 之后重读再追加
    if (won.includes(period)) return saved;
    await get().updateSettings({ ledgerChallengeWonMonths: [...won, period] });
    return saved;
  },

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
      const [personas, shadows, battleStates, strata] = await Promise.all([
        db.personas.toArray(),
        db.shadows.toArray(),
        db.battleStates.toArray(),
        db.strata.toArray(),
      ]);
      const latestStratum = strata
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
      set({ persona: personas[0] || null, shadow: shadows[0] || null, battleState: battleStates[0] || null, stratum: latestStratum });

      // 惰性迁移（§2.7）：存量单只 Shadow 且从未生成过区层 → 迁入同级区层（保留主影本体，区层名用模板，AI 名后置）
      const sh = shadows[0];
      if (sh && strata.length === 0) {
        const tpl = migrationStratumName(sh.name);
        const migrated = buildStratum({
          id: uuidv4(),
          level: sh.level,
          name: tpl.name,
          description: tpl.description,
          baseFloor: 0,
          now: new Date(),
          eventPoolIds: TOWER_EVENT_IDS,
          chestSp: (floor) => nodeSpReward(sh.level, floor, 0, Math.random) + 5,
        });
        await db.strata.put(migrated);
        set({ stratum: migrated });
      }
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
    const { battleState } = get();
    if (!battleState) return;
    const earned = Math.round(amount);
    const updated = { ...battleState, sp: battleState.sp + earned, totalSpEarned: battleState.totalSpEarned + earned };
    await get().saveBattleState(updated);
  },

  // 战斗结算已全部移入 src/battle/engine.ts（引擎 v2）；store 只负责跨 session 持久化。

  checkShadowHpRegen: async () => {
    const { shadow, battleState, stratum } = get();
    if (!shadow) return;
    // 塔模型下（批2）每日回血被「月相日·异变加深」取代——有区层即跳过
    if (stratum) return;
    // 已胜利但未领取奖励时不回血：否则击破的 Shadow 会被每日回血"复活"，玩家被迫重打一遍
    if (battleState?.status === 'victory') return;
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
    const baseHp = settings.battlePlayerMaxHp ?? PLAYER_BASE_HP;
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
    const { battleState, shadow, attributes, stratum } = get();
    if (!battleState) return;
    const isAbyss = !!stratum?.abyssRing; // 批5：深渊环击破——不加 HP 上限（无尽模式防膨胀）、更新最深纪录
    // 批3 阴影档案馆：新藏品带 描述/词缀/代表台词/击败时的你/区层等级（存量记录字段留空 = 首批藏品）
    const newRecord = shadow ? {
      shadowName: isAbyss ? `${shadow.name}（回廊第${stratum!.abyssRing}环）` : shadow.name,
      level: shadow.level,
      // 用本地日期口径（toLocalDateKey），不要 toISOString().slice —— 那是 UTC：
      // 东八区凌晨 0–8 点击破，档案里会写成"昨天"（FS7 审查；全站其余日期都走这个函数）
      breachDate: toLocalDateKey(new Date(shadow.createdAt)),
      defeatDate: toLocalDateKey(),
      daysElapsed: Math.max(1, Math.floor((Date.now() - new Date(shadow.createdAt).getTime()) / 86400000)),
      description: shadow.description,
      affixes: shadow.affixes,
      quote: shadow.responseLines[Math.floor(Math.random() * Math.max(1, shadow.responseLines.length))],
      playerTotalLevel: attributes.reduce((s, a) => s + (a.unlocked === false ? 0 : (a.level ?? 1)), 0),
      stratumLevel: stratum?.level,
    } : null;
    // HP bonus from defeating this shadow（深渊不加）
    const hpGain = shadow && !isAbyss ? (HP_BONUS_PER_DEFEAT[Math.min(shadow.level - 1, 4)] ?? 2) : 0;
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
      abyssHighestRing: isAbyss
        ? Math.max(battleState.abyssHighestRing ?? 0, stratum!.abyssRing!)
        : battleState.abyssHighestRing,
    };
    await get().saveBattleState(updated);
    // 批2：区层主影被击破 → 区层通关（上方新区层随「显形仪式」解锁；深渊环通关 → 同晚可深入下一环）
    const st = get().stratum;
    if (st && st.status === 'climbing') {
      await get().saveStratum({ ...st, status: 'cleared' });
    }
  },

  resetBattle: async () => {
    // 保留未使用的 SP
    const { battleState: prev } = get();
    const preservedSp = prev?.sp ?? 0;
    const preservedTotalSp = prev?.totalSpEarned ?? 0;
    await db.personas.clear();
    await db.shadows.clear();
    await db.battleStates.clear();
    await db.strata.clear();
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
      set({ persona: null, shadow: null, battleState: freshState, stratum: null });
    } else {
      set({ persona: null, shadow: null, battleState: null, stratum: null });
    }
  },

  equipMask: async (attr: AttributeId | null) => {
    const { persona } = get();
    if (!persona) return;
    const updated = { ...persona, equippedMaskAttribute: attr };
    await db.personas.put(updated);
    set({ persona: updated });
  },

  // ── 影时间高塔（批2）：区层攀登 ─────────────────────────

  saveStratum: async (s: TowerStratum) => {
    await db.strata.put(s);
    set({ stratum: s });
  },

  revealStratum: async ({ level, name, description, themeAttribute, boss: rawBoss }) => {
    // 批3 §5.1：心魔显形带 0-1 条词缀（50%）；「顽固」的 HP+30% 生成时应用
    const boss = { ...rawBoss };
    if (!boss.affixes) {
      const rolled = Math.random() < 0.5 ? rollAffixes(1, Math.random) : [];
      boss.affixes = rolled;
      if (rolled.includes('stubborn')) {
        boss.maxHp = Math.round(boss.maxHp * AFFIX_HP_MULT);
        boss.currentHp = boss.maxHp;
        if (boss.maxHp2 !== undefined) {
          boss.maxHp2 = Math.round(boss.maxHp2 * AFFIX_HP_MULT);
          boss.currentHp2 = boss.maxHp2;
        }
      }
    }
    const prev = get().stratum;
    const baseFloor = prev ? prev.baseFloor + prev.floors : 0;
    const stratum = buildStratum({
      id: uuidv4(),
      level,
      name,
      description,
      themeAttribute,
      baseFloor,
      now: new Date(),
      eventPoolIds: TOWER_EVENT_IDS,
      chestSp: (floor) => nodeSpReward(level, floor, 0, Math.random) + 5,
    });
    await get().saveShadow(boss); // shadows 单例 = 当前区层主影
    await get().saveStratum(stratum);
    const bs = get().battleState;
    if (bs) await get().saveBattleState({ ...bs, shadowId: boss.id, status: 'idle' });
  },

  enterTowerToday: async () => {
    const { stratum, battleState: prevBs, activities } = get();
    // 批3 记忆台词：在 lastChallengeDate 被覆写前快照缺席天数
    const prevKey = prevBs?.lastChallengeDate;
    const daysAway = prevKey
      ? Math.max(0, Math.floor((new Date(toLocalDateKey() + 'T00:00:00').getTime() - new Date(prevKey + 'T00:00:00').getTime()) / 86400000))
      : 0;
    // 批4 勤勉的光辉：连续记录 3 天 → +1 枚（上限 2；距上次发放 ≥3 天）
    const todayKey = toLocalDateKey();
    const streak = currentRecordStreak(activities.map(a => a.date), todayKey);
    const grantDiligence = shouldGrantDiligence(streak, prevBs?.diligenceLastGrantKey, todayKey)
      && (prevBs?.diligenceCharges ?? 0) < DILIGENCE_MAX_CHARGES;
    get().startBattleSession(); // 满 HP + lastChallengeDate
    const bs = get().battleState;
    if (!bs) return;
    const curFloor = stratum?.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0;
    await get().saveBattleState({
      ...bs,
      diligenceCharges: grantDiligence ? Math.min(DILIGENCE_MAX_CHARGES, (bs.diligenceCharges ?? 0) + 1) : bs.diligenceCharges,
      diligenceLastGrantKey: grantDiligence ? todayKey : bs.diligenceLastGrantKey,
      towerSession: {
        dateKey: todayKey,
        startFloor: curFloor,
        floorsClimbed: 0,
        nodesCleared: 0,
        mobsDefeated: 0,
        damageDealt: 0,
        maxSingleHit: 0,
        weaknessHits: 0,
        spEarned: 0,
        buffs: [],
        daysAway,
      },
    });
  },

  moveToTowerNode: async (nodeId: string) => {
    const { stratum } = get();
    if (!stratum) return null;
    if (!reachableNodeIds(stratum).includes(nodeId)) return null;
    const node = stratum.nodes.find(n => n.id === nodeId) ?? null;
    if (!node) return null;
    if (stratum.currentNodeId !== nodeId) {
      await get().saveStratum({ ...stratum, currentNodeId: nodeId });
    }
    return node;
  },

  completeTowerNode: async (nodeId: string, opts) => {
    const { stratum, battleState, shadow } = get();
    if (!stratum || !battleState) return 0;
    const node = stratum.nodes.find(n => n.id === nodeId);
    if (!node || node.cleared) return 0;
    let sp = 0;
    if (node.type === 'boss') sp = bossSpReward(stratum.level, stratum.deepenCount);
    else if (node.type === 'chest') sp = node.lootSp ?? 0;
    else if (node.type === 'mob' || node.type === 'elite') sp = nodeSpReward(stratum.level, node.floor, stratum.deepenCount, Math.random);
    else if (node.type === 'golden') sp = Math.round(nodeSpReward(stratum.level, node.floor, stratum.deepenCount, Math.random) * GOLDEN_SP_MULT); // 批5 金色回响
    // event / echo 的收益由效果本身发放
    // 批3：贪婪词缀（击败多掉 50% SP）+ 登塔者罗盘（节点 SP 收益+）
    const affixes = node.type === 'boss' ? shadow?.affixes : node.mob?.affixes;
    if (sp > 0 && affixes?.includes('greedy')) sp = Math.round(sp * 1.5);
    const { nodeSpPct } = towerRelicBonus(battleState.arsenal?.relics);
    if (sp > 0 && nodeSpPct > 0) sp = Math.round(sp * (1 + nodeSpPct));
    const nodes = stratum.nodes.map(n => (n.id === nodeId ? { ...n, cleared: true } : n));
    await get().saveStratum({ ...stratum, nodes });
    const bs = get().battleState!;
    const ts = bs.towerSession;
    const session = ts && ts.dateKey === toLocalDateKey()
      ? {
          ...ts,
          nodesCleared: ts.nodesCleared + 1,
          mobsDefeated: ts.mobsDefeated + (opts?.wasMob ? 1 : 0),
          floorsClimbed: Math.max(ts.floorsClimbed, node.floor - ts.startFloor),
          spEarned: ts.spEarned + sp,
        }
      : ts;
    await get().saveBattleState({ ...bs, sp: bs.sp + sp, towerSession: session });
    return sp;
  },

  towerAdjust: async ({ hpDeltaPct, spDelta, buff, stealFirstStrike }) => {
    const bs = get().battleState;
    if (!bs) return;
    let playerHp = bs.playerHp;
    if (hpDeltaPct) {
      playerHp = Math.max(0, Math.min(bs.playerMaxHp, playerHp + Math.round(bs.playerMaxHp * hpDeltaPct)));
    }
    const sp = Math.max(0, bs.sp + (spDelta ?? 0));
    let session = bs.towerSession;
    if (session && session.dateKey === toLocalDateKey()) {
      if (buff && !session.buffs.some(b => b.id === buff.id)) {
        session = { ...session, buffs: [...session.buffs, buff] };
      }
      if (stealFirstStrike) session = { ...session, pendingFirstStrike: true };
      if (spDelta && spDelta > 0) session = { ...session, spEarned: session.spEarned + spDelta };
    }
    await get().saveBattleState({ ...bs, playerHp, sp, towerSession: session });
  },

  towerSkipNextFloor: async () => {
    const { stratum } = get();
    if (!stratum || !stratum.currentNodeId) return;
    const cur = stratum.nodes.find(n => n.id === stratum.currentNodeId);
    if (!cur || !cur.cleared) return;
    const target = cur.edges
      .map(id => stratum.nodes.find(n => n.id === id))
      .find(n => n && n.type !== 'boss'); // 主影层不可跃过
    if (!target) return;
    const nodes = stratum.nodes.map(n => (n.id === target.id ? { ...n, cleared: true } : n));
    await get().saveStratum({ ...stratum, nodes, currentNodeId: target.id });
  },

  towerRerollNextFloor: async () => {
    const { stratum } = get();
    if (!stratum || !stratum.currentNodeId) return;
    const cur = stratum.nodes.find(n => n.id === stratum.currentNodeId);
    if (!cur) return;
    const rng = Math.random;
    const nodes = stratum.nodes.map(n => {
      if (!cur.edges.includes(n.id) || n.cleared || n.type === 'boss' || n.type === 'elite' || n.type === 'golden') return n;
      const roll = rng();
      const type: StratumNode['type'] = roll < 0.45 ? 'mob' : roll < 0.7 ? 'event' : roll < 0.85 ? 'echo' : 'chest';
      const next: StratumNode = { ...n, type, mob: undefined, eventPoolId: undefined, lootSp: undefined };
      if (type === 'mob') next.mob = rollMobSpec(stratum.level, 'mob', rng);
      else if (type === 'event') next.eventPoolId = TOWER_EVENT_IDS[Math.floor(rng() * TOWER_EVENT_IDS.length)];
      else if (type === 'chest') next.lootSp = nodeSpReward(stratum.level, n.floor, stratum.deepenCount, rng) + 5;
      return next;
    });
    await get().saveStratum({ ...stratum, nodes });
  },

  towerRecordBattleStats: async ({ damage, maxHit, weaknessHits }) => {
    const bs = get().battleState;
    if (!bs?.towerSession || bs.towerSession.dateKey !== toLocalDateKey()) return;
    const ts = bs.towerSession;
    await get().saveBattleState({
      ...bs,
      towerSession: {
        ...ts,
        damageDealt: ts.damageDealt + damage,
        maxSingleHit: Math.max(ts.maxSingleHit, maxHit),
        weaknessHits: ts.weaknessHits + weaknessHits,
        pendingFirstStrike: undefined, // 战斗已发生 → 先手债消费
      },
    });
  },

  deepenStratumIfNewWeek: async () => {
    const { stratum, shadow } = get();
    if (!stratum || stratum.status !== 'climbing') return false;
    if (stratum.abyssRing) return false; // 批5：深渊环无月相加深（每环短命，压力走词缀递增）
    const wk = weekKeyOf(new Date());
    if (wk === stratum.createdWeekKey || stratum.lastDeepenWeekKey === wk) return false;
    if (shadow) {
      // 批3 §5.1：异变加深每次 +1 词缀（不与已有重复）；新增「顽固」时血池同步扩容
      const added = rollAffixes(1, Math.random, shadow.affixes ?? []);
      const affixes = [...(shadow.affixes ?? []), ...added];
      let { maxHp, maxHp2 } = shadow;
      if (added.includes('stubborn')) {
        maxHp = Math.round(maxHp * AFFIX_HP_MULT);
        if (maxHp2 !== undefined) maxHp2 = Math.round(maxHp2 * AFFIX_HP_MULT);
      }
      await get().saveShadow({ ...shadow, affixes, maxHp, maxHp2, currentHp: maxHp, currentHp2: maxHp2 });
    }
    await get().saveStratum({ ...stratum, deepenCount: stratum.deepenCount + 1, lastDeepenWeekKey: wk });
    return true;
  },

  // ── 批3 · 养成与生态：战利品 / 迷思誓约 / 共鸣链 / 熟练度 ──

  rollTowerLoot: async (source, floorRatio) => {
    const { stratum, battleState } = get();
    if (!battleState) return [];
    const arsenal: BattleArsenal = battleState.arsenal ?? { relics: [], myths: [], oaths: [], chains: [] };
    const drops = rollNodeLoot(source, {
      stratumLevel: stratum?.level ?? 1,
      floorRatio,
      ownedChainKeys: arsenal.chains.map(c => c.key),
      ownedOathKinds: arsenal.oaths.map(o => o.kind),
      rng: Math.random,
      makeId: uuidv4,
      today: toLocalDateKey(),
    });
    if (drops.length === 0) return drops;
    const next: BattleArsenal = {
      ...arsenal,
      relics: [...arsenal.relics, ...drops.filter(d => d.kind === 'relic').map(d => (d as Extract<LootDrop, { kind: 'relic' }>).relic)],
      myths: [...arsenal.myths, ...drops.filter(d => d.kind === 'myth').map(d => (d as Extract<LootDrop, { kind: 'myth' }>).myth)],
      oaths: [...arsenal.oaths, ...drops.filter(d => d.kind === 'oath').map(d => (d as Extract<LootDrop, { kind: 'oath' }>).oath)],
      chains: [...arsenal.chains, ...drops.filter(d => d.kind === 'chain').map(d => (d as Extract<LootDrop, { kind: 'chain' }>).chain)],
    };
    const spBonus = drops.filter(d => d.kind === 'sp').reduce((s, d) => s + (d as Extract<LootDrop, { kind: 'sp' }>).amount, 0);
    const bs = get().battleState!;
    await get().saveBattleState({ ...bs, arsenal: next, sp: bs.sp + spBonus });
    return drops;
  },

  // ── 批4 · 日常闭环 ──

  applyPrepBuff: async (buff) => {
    const bs = get().battleState;
    const ts = bs?.towerSession;
    if (!bs || !ts || ts.dateKey !== toLocalDateKey() || ts.prepDrawnId) return; // 每次登塔限一次
    let session = { ...ts, prepDrawnId: buff.id };
    if (buff.addPct) {
      session = { ...session, buffs: [...session.buffs, { id: buff.id, label: buff.label, addPct: buff.addPct }] };
    }
    const sp = bs.sp + (buff.sp ?? 0);
    await get().saveBattleState({ ...bs, sp, towerSession: session });
  },

  claimDiligence: async () => {
    const bs = get().battleState;
    if (!bs || (bs.diligenceCharges ?? 0) <= 0) return false;
    await get().saveBattleState({
      ...bs,
      playerHp: bs.playerMaxHp,
      diligenceCharges: (bs.diligenceCharges ?? 0) - 1,
    });
    return true;
  },

  recordBattleFeat: async (feat) => {
    const bs = get().battleState;
    if (!bs) return;
    if (!(bs.battleFeats ?? []).includes(feat)) {
      await get().saveBattleState({ ...bs, battleFeats: [...(bs.battleFeats ?? []), feat] });
    }
    // 壮举 id 与成就 id 一一对应（constants/ACHIEVEMENTS battle_feat 条目）
    await get().unlockAchievement(`battle_${feat}`);
  },

  deliverDefeatLetter: async () => {
    const { battleState: bs, shadow, stratum, settings } = get();
    if (!bs || !shadow || !stratum) return;
    const todayKey = toLocalDateKey();
    if (bs.pendingCatLetter?.dateKey === todayKey) return; // 当晚只写一封
    const ts = bs.towerSession;
    const curFloor = stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0;
    const facts = {
      shadowName: shadow.name,
      stratumName: stratum.name,
      floor: stratum.baseFloor + curFloor,
      damageDealt: ts?.damageDealt ?? 0,
      maxSingleHit: ts?.maxSingleHit ?? 0,
      weaknessHits: ts?.weaknessHits ?? 0,
      mobsDefeated: ts?.mobsDefeated ?? 0,
    };
    // F6 observation 记忆源首发：中性事实，供黑猫日后自然提起（信正文不进记忆，避免口吻污染）
    try {
      await db.navigatorMemos.put({
        id: uuidv4(),
        source: 'observation',
        text: `${todayKey} 晚，用户在影时间高塔【${facts.stratumName}】第${facts.floor}层败退（对手「${facts.shadowName}」，本晚造成 ${facts.damageDealt} 点伤害、讨伐 ${facts.mobsDefeated} 只杂影）。`,
        importance: 3,
        status: 'active',
        createdAt: new Date(),
      });
    } catch { /* memo 失败不阻塞信 */ }
    const text = await generateDefeatLetter(settings, facts);
    const cur = get().battleState;
    if (!cur) return;
    await get().saveBattleState({ ...cur, pendingCatLetter: { text, dateKey: todayKey } });
  },

  enterAbyss: async () => {
    const { stratum, shadow, settings } = get();
    const ring = (stratum?.abyssRing ?? 0) + 1;
    const baseFloor = stratum ? stratum.baseFloor + stratum.floors : 0;
    const { stratum: ringStratum, guard } = buildAbyssRing({
      ring,
      stratumId: uuidv4(),
      guardId: uuidv4(),
      baseFloor,
      now: new Date(),
      eventPoolIds: TOWER_EVENT_IDS,
      chestSp: (floor) => nodeSpReward(5, floor, 0, Math.random) + 5,
      lastWeakAttribute: shadow?.weakAttribute,
      attrNames: settings.attributeNames as Record<AttributeId, string>,
    });
    await get().saveShadow(guard);
    await get().saveStratum(ringStratum);
    const bs = get().battleState;
    if (bs) await get().saveBattleState({ ...bs, shadowId: guard.id, status: 'idle' });
  },

  removeRandomShadowAffix: async () => {
    const { shadow } = get();
    if (!shadow || !(shadow.affixes?.length)) return null;
    const idx = Math.floor(Math.random() * shadow.affixes.length);
    const removed = shadow.affixes[idx];
    const affixes = shadow.affixes.filter((_, i) => i !== idx);
    let { maxHp, maxHp2, currentHp, currentHp2 } = shadow;
    if (removed === 'stubborn') {
      // 顽固词缀曾把血池 ×1.3——移除时回落并夹住当前值
      maxHp = Math.round(maxHp / AFFIX_HP_MULT);
      currentHp = Math.min(currentHp, maxHp);
      if (maxHp2 !== undefined) {
        maxHp2 = Math.round(maxHp2 / AFFIX_HP_MULT);
        if (currentHp2 !== undefined) currentHp2 = Math.min(currentHp2, maxHp2);
      }
    }
    await get().saveShadow({ ...shadow, affixes, maxHp, maxHp2, currentHp, currentHp2 });
    return removed;
  },

  grantEventLoot: async (kind) => {
    const { stratum, battleState } = get();
    if (!battleState) return '';
    const arsenal: BattleArsenal = battleState.arsenal ?? { relics: [], myths: [], oaths: [], chains: [] };
    const ctx = {
      stratumLevel: stratum?.level ?? 1,
      floorRatio: 0.5,
      ownedChainKeys: arsenal.chains.map(c => c.key),
      ownedOathKinds: arsenal.oaths.map(o => o.kind),
      rng: Math.random,
      makeId: uuidv4,
      today: toLocalDateKey(),
    };
    if (kind === 'relicWaning') {
      const relic = rollRelic(ctx, 'waning');
      await get().saveBattleState({ ...battleState, arsenal: { ...arsenal, relics: [...arsenal.relics, relic] } });
      return lootLabel({ kind: 'relic', relic });
    }
    const myth = rollMyth(ctx);
    await get().saveBattleState({ ...battleState, arsenal: { ...arsenal, myths: [...arsenal.myths, myth] } });
    return lootLabel({ kind: 'myth', myth });
  },

  salvageRelic: async (relicId) => {
    const bs = get().battleState;
    const arsenal = bs?.arsenal;
    if (!bs || !arsenal) return 0;
    const relic = arsenal.relics.find(r => r.id === relicId);
    if (!relic) return 0;
    const sp = RELIC_SALVAGE_SP[relic.quality];
    await get().saveBattleState({
      ...bs,
      sp: bs.sp + sp,
      arsenal: { ...arsenal, relics: arsenal.relics.filter(r => r.id !== relicId) },
    });
    return sp;
  },

  toggleEquipRelic: async (relicId) => {
    const { battleState: bs, stratum } = get();
    const arsenal = bs?.arsenal;
    if (!bs || !arsenal) return false;
    const relic = arsenal.relics.find(r => r.id === relicId);
    if (!relic) return false;
    if (!relic.equipped) {
      const slots = RELIC_SLOTS_BY_STRATUM[Math.min(4, Math.max(0, (stratum?.level ?? 1) - 1))];
      const equippedCount = arsenal.relics.filter(r => r.equipped).length;
      if (equippedCount >= slots) return false;
    }
    await get().saveBattleState({
      ...bs,
      arsenal: {
        ...arsenal,
        relics: arsenal.relics.map(r => (r.id === relicId ? { ...r, equipped: !r.equipped } : r)),
      },
    });
    return true;
  },

  socketMyth: async (attr, skillLevel, stoneId) => {
    const { persona, battleState: bs } = get();
    const arsenal = bs?.arsenal;
    if (!persona || !arsenal) return '数据未就绪';
    const stone = arsenal.myths.find(m => m.id === stoneId);
    if (!stone) return '迷思石不存在';
    const equippedElsewhere = Object.values(persona.skills).flat().some(s => s.socket?.stoneId === stoneId);
    if (equippedElsewhere) return '这枚迷思已镶嵌在其他技能上';
    const skills = persona.skills[attr];
    const idx = skills.findIndex(s => s.level === skillLevel);
    if (idx < 0) return '技能不存在';
    const target = skills[idx];
    if (target.oath) return '誓约技不可镶嵌迷思';
    if (target.socket) return '该技能已有迷思（先拆下）';
    if (MYTH_POOL[stone.kind].damageOnly && target.type !== 'damage' && target.type !== 'crit') {
      return '「淬毒之牙」只能镶入伤害/暴击技能';
    }
    const nextSkills = { ...persona.skills, [attr]: skills.map((s, i) => (i === idx ? { ...s, socket: { stoneId, kind: stone.kind, value: stone.value } } : s)) };
    await get().savePersona({ ...persona, skills: nextSkills });
    return null;
  },

  unsocketMyth: async (attr, skillLevel) => {
    const { persona } = get();
    if (!persona) return;
    const skills = persona.skills[attr];
    // R18 觉醒烧录（permanent）不可卸除
    const nextSkills = { ...persona.skills, [attr]: skills.map(s => (s.level === skillLevel && !s.socket?.permanent ? { ...s, socket: undefined } : s)) };
    await get().savePersona({ ...persona, skills: nextSkills });
  },

  // ── R18 面具羁绊：战斗胜利后按本场召唤过的面具累加出战场次 ──
  recordMaskBattles: async (masks) => {
    const bs = get().battleState;
    if (!bs || masks.length === 0) return;
    const next = { ...(bs.maskBattles ?? {}) } as Partial<Record<AttributeId, number>>;
    for (const m of masks) next[m] = (next[m] ?? 0) + 1;
    await get().saveBattleState({ ...bs, maskBattles: next });
  },

  // ── R18 技能觉醒：满星 + 消耗一颗迷思 → 词条烧录永久 + 改名 + 星级清零进下一轮 ──
  awakenSkill: async (attr, skillLevel, stoneId, newName) => {
    const { persona, battleState: bs } = get();
    const arsenal = bs?.arsenal;
    if (!persona || !bs || !arsenal) return '数据未就绪';
    const skills = persona.skills[attr];
    const idx = skills.findIndex(s => s.level === skillLevel);
    if (idx < 0) return '技能不存在';
    const target = skills[idx];
    if (target.unlocked === false) return '技能尚未解锁';
    if (masteryStars(target.mastery ?? 0, target.level) < 3) return '熟练度未满星——继续使用它吧';
    if (target.oath) return '誓约技不可觉醒';
    if (target.socket && !target.socket.permanent) return '技能镶有迷思——先拆下（或直接用它觉醒）';
    const stone = arsenal.myths.find(m => m.id === stoneId);
    if (!stone) return '迷思石不存在';
    const equippedElsewhere = Object.values(persona.skills).flat().some(s => s.socket?.stoneId === stoneId && !s.socket.permanent);
    if (equippedElsewhere) return '这枚迷思已镶嵌在其他技能上';
    if (MYTH_POOL[stone.kind].damageOnly && target.type !== 'damage' && target.type !== 'crit') {
      return '「淬毒之牙」只能烧录进伤害/暴击技能';
    }
    const name = (newName ?? '').trim() || `${target.name}·觉醒`;
    const nextSkills = {
      ...persona.skills,
      [attr]: skills.map((s, i) => (i === idx ? {
        ...s,
        name,
        mastery: 0,
        awakenRound: (s.awakenRound ?? 0) + 1,
        socket: { stoneId: stone.id, kind: stone.kind, value: stone.value, permanent: true },
      } : s)),
    };
    // 石头消耗：从背包移除（烧进技能里了）
    const nextArsenal = { ...arsenal, myths: arsenal.myths.filter(m => m.id !== stoneId) };
    await get().savePersona({ ...persona, skills: nextSkills });
    await get().saveBattleState({ ...get().battleState!, arsenal: nextArsenal });
    return null;
  },

  equipOathStone: async (attr, skillLevel, stoneId) => {
    const { persona, battleState: bs } = get();
    const arsenal = bs?.arsenal;
    if (!persona || !bs || !arsenal) return '数据未就绪';
    const stone = arsenal.oaths.find(o => o.id === stoneId);
    if (!stone) return '誓约石不存在';
    if (stone.equippedAttr) return '这枚誓约已被装备';
    const skills = persona.skills[attr];
    if (skills.some(s => s.oath)) return '每位 Persona 只能缔结一份誓约';
    const idx = skills.findIndex(s => s.level === skillLevel);
    if (idx < 0) return '技能槽不存在';
    if (skills[idx].socket) return '该技能镶有迷思——先拆下再置换';
    const personaName = persona.attributePersonas?.[attr]?.name ?? persona.name;
    let oathSkill = buildOathSkill(stone.kind, stoneId, skills[idx], personaName);
    // 命名缓存命中：重复装备不再调 AI
    const cached = stone.namedCache?.[attr];
    if (cached) oathSkill = { ...oathSkill, name: cached.name, description: cached.description };
    const nextSkills = { ...persona.skills, [attr]: skills.map((s, i) => (i === idx ? oathSkill : s)) };
    await get().savePersona({ ...persona, skills: nextSkills });
    await get().saveBattleState({
      ...get().battleState!,
      arsenal: { ...arsenal, oaths: arsenal.oaths.map(o => (o.id === stoneId ? { ...o, equippedAttr: attr } : o)) },
    });
    return null;
  },

  unequipOathStone: async (attr) => {
    const { persona, battleState: bs } = get();
    if (!persona) return;
    const skills = persona.skills[attr];
    const oathSkill = skills.find(s => s.oath);
    if (!oathSkill?.oath) return;
    const stoneId = oathSkill.oath.stoneId;
    // 完整可逆：原技能快照恢复（保留置换期间攒下的熟练度不回写——快照即当时状态）
    const nextSkills = { ...persona.skills, [attr]: skills.map(s => (s.oath ? s.oath.original : s)) };
    await get().savePersona({ ...persona, skills: nextSkills });
    const arsenal = bs?.arsenal;
    if (bs && arsenal) {
      await get().saveBattleState({
        ...get().battleState!,
        arsenal: { ...arsenal, oaths: arsenal.oaths.map(o => (o.id === stoneId ? { ...o, equippedAttr: undefined } : o)) },
      });
    }
  },

  renameOathSkill: async (attr, name, description) => {
    const { persona, battleState: bs } = get();
    if (!persona) return;
    const skills = persona.skills[attr];
    const oathSkill = skills.find(s => s.oath);
    if (!oathSkill?.oath) return;
    const nextSkills = { ...persona.skills, [attr]: skills.map(s => (s.oath ? { ...s, name, description } : s)) };
    await get().savePersona({ ...persona, skills: nextSkills });
    // 缓存到石头：重复装备不再调 AI
    const arsenal = bs?.arsenal;
    if (bs && arsenal) {
      await get().saveBattleState({
        ...get().battleState!,
        arsenal: {
          ...arsenal,
          oaths: arsenal.oaths.map(o => (o.id === oathSkill.oath!.stoneId
            ? { ...o, namedCache: { ...o.namedCache, [attr]: { name, description } } }
            : o)),
        },
      });
    }
  },

  setActiveChain: async (key) => {
    const bs = get().battleState;
    const arsenal = bs?.arsenal;
    if (!bs || !arsenal) return;
    if (key !== null && !arsenal.chains.some(c => c.key === key)) return;
    await get().saveBattleState({ ...bs, arsenal: { ...arsenal, activeChainKey: key ?? undefined } });
  },

  recordSkillUses: async (uses) => {
    const { persona } = get();
    if (!persona || uses.length === 0) return;
    const counts = new Map<string, number>();
    for (const u of uses) counts.set(`${u.attr}:${u.level}`, (counts.get(`${u.attr}:${u.level}`) ?? 0) + 1);
    const nextSkills = { ...persona.skills };
    for (const attr of Object.keys(nextSkills) as AttributeId[]) {
      nextSkills[attr] = nextSkills[attr].map(s => {
        const inc = counts.get(`${attr}:${s.level}`) ?? 0;
        return inc > 0 ? { ...s, mastery: (s.mastery ?? 0) + inc } : s;
      });
    }
    await get().savePersona({ ...persona, skills: nextSkills });
    await get().refreshSkillUnlocks();
  },

  refreshSkillUnlocks: async () => {
    const { persona, attributes } = get();
    if (!persona || attributes.length === 0) return;
    const levelOf = (attr: AttributeId) => {
      const a = attributes.find(x => x.id === attr);
      return a && a.unlocked !== false ? (a.level ?? 1) : 0;
    };
    let changed = false;
    const nextSkills = { ...persona.skills };
    for (const attr of Object.keys(nextSkills) as AttributeId[]) {
      const attrLevel = levelOf(attr);
      const sorted = [...nextSkills[attr]].sort((a, b) => a.level - b.level);
      const byLevel = new Map(sorted.map(s => [s.level, s]));
      nextSkills[attr] = nextSkills[attr].map(s => {
        let next = s;
        if (next.mastery === undefined) { next = { ...next, mastery: 0 }; changed = true; }
        if (next.unlocked === undefined) {
          // 存量迁移：按当时属性等级置位——已解锁的不回锁（拍板）
          next = { ...next, unlocked: attrLevel >= next.level };
          changed = true;
        } else if (!next.unlocked) {
          // 双条件解锁：属性等级 ≥ N 且 技能 N−1 满星
          const prev = byLevel.get(next.level - 1);
          const prevFull = next.level === 1 || (prev ? masteryStars(prev.mastery ?? 0, prev.level) === 3 : false);
          if (attrLevel >= next.level && prevFull) {
            next = { ...next, unlocked: true };
            changed = true;
          }
        }
        return next;
      });
    }
    if (changed) await get().savePersona({ ...persona, skills: nextSkills });
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
