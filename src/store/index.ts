import { create } from 'zustand';
import { User, Attribute, Activity, Achievement, Skill, DailyEvent, Settings, ThemeType, AttributeId, AttributeNamesKey, Todo, TodoCompletion, PeriodSummary, SummaryPeriod, SummaryPromptPreset, WeeklyGoal, WeeklyGoalItem, Persona, Shadow, BattleState, BattleLogEntry, BattleAction } from '@/types';
import { db } from '@/db';
import { v4 as uuidv4 } from 'uuid';
import { calcMaxStreak } from '@/utils/streak';

/**
 * 返回本地时区YYYY-MM-DD 日期字符串 * 不使toISOString()，避UTC 偏差UTC+8 等时区导致跨天错误 */
export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
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
    name: '伊丽莎白',
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
    name: '西奥多',
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
    name: '玛格丽特',
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
    name: '双子狱卒',
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
    name: '馆长伊戈尔',
    isBuiltin: true,
    systemPrompt: `以德高望重、深邃睿智的口吻，如同一位古老智者，为来访者审阅其人格成长记录。
你的语言风格：庄严而不失温情，偶有神秘感，善用"尊敬的客人"、"你的潜能"等称谓，将属性成长比作"灵魂的觉醒"，可以按照时间的季节/月份寒暄。
请根据用户本期的活动记录、加点情况与成长倾向，给出总结与下期建议。总结应分为：
1. 本期概览（用富有诗意的语言描述本期成长和重要进步/时间点）
2. 力量倾向（分析各属性的加点情况与侧重）
3. 馆长的建议（为下期行动提供具体、有价值的指引）
请以 Markdown 格式输出，使用适当的标题和分段。`,
  },
  {
    id: 'lavenza',
    name: '拉雯妲',
    isBuiltin: true,
    systemPrompt: `以温柔而真挚的心意陪伴"诡术师"回顾成长历程，你将双子之魂合而为一，以无尽的关怀与智慧指引前行。
你的语言风格：语气温和正式，措辞诚恳而充满珍视，以"诡术师"称呼客人，视成长为"无限潜能的证明"；当某项属性出现明显短板时，语气会短暂变得直接急促（如卡萝莉娜附体），随即回归柔和；遇到进步与努力，则毫不吝啬地给出发自内心的赞许，如"您真的是世界上最了不起的人"。
请根据用户本期的活动记录、加点情况与成长倾向，给出总结与下期建议。总结应分为：
1. 拉雯妲的记录（以温柔诚恳的语气回顾本期成长，着重表达对诡术师努力的珍视与感动）
2. 潜能的证明（分析各属性成长情况；若发现明显短板，可短暂以急促直接的语气点出，再平复为温柔；对进步之处给予真诚赞美）
3. 诡术师，继续前行（以真挚的鼓励和具体建议作结，末尾附上一句发自内心的赞美或祝福）
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
  dailyEvent: DailyEvent | null;
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
  setTheme: (theme: ThemeType) => Promise<void>;
  addActivity: (description: string, points: Record<string, number>, method: 'local' | 'todo' | 'battle', options?: { important?: boolean; date?: Date; category?: Activity['category'] }) => Promise<{ unlockHints: { achievements: number; skills: number } }>;
  updateAttribute: (attributeId: string, points: number) => Promise<void>;
  unlockAchievement: (achievementId: string) => Promise<void>;
  unlockSkill: (skillId: string) => Promise<void>;
  setCurrentPage: (page: string) => void;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  generateDailyEvent: () => Promise<void>;
  loadData: () => Promise<void>;
  addTodo: (todo: Omit<Todo, 'id' | 'createdAt'>) => Promise<void>;
  updateTodo: (id: string, updates: Partial<Todo>) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  completeTodo: (todoId: string) => Promise<{ unlockHints: { achievements: number; skills: number } } | null>;
  getTodayTodoProgress: (todoId: string) => { count: number; isComplete: boolean; target: number };
  getTodoDateLabel: (date: Date) => string;
  setLevelUpNotification: (notification: { id: string; displayName: string; level: number } | null) => void;
  setAchievementNotification: (notification: { id: string; title: string } | null) => void;
  setSkillNotification: (notification: { id: string; name: string } | null) => void;
  setModalBlocker: (value: boolean) => void;
  deleteActivity: (id: string) => Promise<void>;
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
  dailyEvent: null,
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
      await get().generateDailyEvent();
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
      
      // 加载每日事件
      await get().generateDailyEvent();
    } catch (error) {
      console.error('创建用户失败:', error);
      throw error;
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
    const { user, dailyEvent, settings } = get();
    if (!user) return { unlockHints: { achievements: 0, skills: 0 } };
    
      const adjustedPoints = { ...points };
      const levelUps: Array<{ attribute: AttributeId; fromLevel: number; toLevel: number }> = [];
      const levelUpActivities: Activity[] = [];
    
    // 应用每日事件加成
    if (dailyEvent && dailyEvent.date === toLocalDateKey()) {
      const attr = dailyEvent.effect.attribute;
      if (adjustedPoints[attr]) {
        adjustedPoints[attr] = Math.round(adjustedPoints[attr] * dailyEvent.effect.multiplier);
      }
    }
    
     // 应用技能加成
    for (const [attrId, pts] of Object.entries(adjustedPoints)) {
      if (pts > 0) {
        adjustedPoints[attrId] = get().applySkillBonus(attrId as AttributeId, pts);
      }
    }

    // 应用装备面具的日常 +1 加成（仅在本次活动已对该属性加分时触发，不吃倍率和技能加成）
    const equippedMask = get().persona?.equippedMaskAttribute;
    if (equippedMask && (adjustedPoints[equippedMask] || 0) > 0) {
      adjustedPoints[equippedMask] = adjustedPoints[equippedMask] + 1;
    }

    // 创建活动记录
      const activityDate = options?.date || new Date();
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
        charm: adjustedPoints.charm || 0
      },
        method,
        levelUps: [],
        important: options?.important,
        category: options?.category,
      };
    
    // 检查关键字匹配成就
    await get().checkKeywordAchievements(description, { skipLoad: true });
    
     // 更新属性并检查升级（一次性加载所有属性，避免循环内 N+1 查询）
    const currentAttrs = await db.attributes.toArray();
    const attrMap = new Map(currentAttrs.map(a => [a.id, a]));

    for (const [attrId, pts] of Object.entries(adjustedPoints)) {
      if (pts > 0) {
        const attribute = attrMap.get(attrId as AttributeId);
        if (!attribute) continue;
        
        const oldLevel = attribute.level;
        const newPoints = attribute.points + pts;
        let newLevel = attribute.level;
        
        // 检查升级
        const thresholds = get().settings.levelThresholds?.length
          ? get().settings.levelThresholds
          : attribute.levelThresholds;
        while (newLevel < thresholds.length && newPoints >= thresholds[newLevel]) {
          newLevel++;
        }
        
          // 如果升级了，记录升级信息
        if (newLevel > oldLevel) {
          levelUps.push({
            attribute: attrId as AttributeId,
            fromLevel: oldLevel,
            toLevel: newLevel
          });

          levelUpActivities.push({
            id: uuidv4(),
            userId: user.id,
            date: new Date(),
            description: `${settings.attributeNames[attrId as AttributeNamesKey]} 升级Lv.${newLevel}`,
            pointsAwarded: { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 },
            method: 'local' as const,
            category: 'level_up'
          });
          
          // 显示第一个升级通知
          if (levelUps.length === 1) {
            setTimeout(() => {
              set({ 
                levelUpNotification: {
                  id: attrId,
                  displayName: settings.attributeNames[attrId as AttributeNamesKey],
                  level: newLevel
                }
              });
            }, 500);
          }
          
          // 不再自动解锁技能，解锁由技能页点击触发
        }
        
        await db.attributes.update(attrId, { 
          points: newPoints, 
          level: newLevel 
        });
      }
    }
    
    // 保存升级信息到活动记录
    activity.levelUps = levelUps;
    
    // 不再自动写入成就解锁活动，解锁由成就页点击触    
    await db.activities.add(activity);
    if (levelUpActivities.length > 0) {
      await db.activities.bulkAdd(levelUpActivities);
    }
    
    // 检查待办完成次数成就
    await get().checkTodoCompletionAchievements({ skipLoad: true });

    // 检查是否解锁了终极成就
    await get().checkAllAttributesMaxAchievement();
    
    const [achievementsSnapshot, attributesSnapshot, activitiesSnapshot, todoCompletionSnapshot, skillsSnapshot, weeklyGoalsSnapshot] = await Promise.all([
      db.achievements.toArray(),
      db.attributes.toArray(),
      db.activities.toArray(),
      db.todoCompletions.toArray(),
      db.skills.toArray(),
      db.weeklyGoals.toArray(),
    ]);

    const matchedAchievements = achievementsSnapshot.filter((achievement) => {
      if (achievement.unlocked) return false;
      const progress = (() => {
        switch (achievement.condition.type) {
          case 'consecutive_days': {
            // activitiesSnapshot already includes the newly added activity (added before snapshot)
            const streak = calcMaxStreak(activitiesSnapshot.map(a => a.date));
            return Math.min(streak, achievement.condition.value);
          }
          case 'total_points': {
            const total = attributesSnapshot.reduce((sum, attr) => sum + attr.points, 0);
            return Math.min(total, achievement.condition.value);
          }
          case 'attribute_level': {
            const attr = attributesSnapshot.find(a => a.id === achievement.condition.attribute);
            const level = attr?.level || 0;
            return Math.min(level, achievement.condition.value);
          }
          case 'keyword_match': {
            return Math.min(achievement.condition.currentProgress || 0, achievement.condition.value);
          }
          case 'all_attributes_max': {
            const maxLevelCount = attributesSnapshot.filter(attr => attr.level >= achievement.condition.value).length;
            return Math.min(maxLevelCount, attributesSnapshot.length);
          }
          case 'todo_completions': {
            const total = todoCompletionSnapshot.reduce((sum, item) => sum + item.count, 0);
            return Math.min(total, achievement.condition.value);
          }
          case 'weekly_goal_completions': {
            const completedCount = weeklyGoalsSnapshot.filter(g => g.completed).length;
            return Math.min(completedCount, achievement.condition.value);
          }
          default:
            return 0;
        }
      })();
      return progress >= achievement.condition.value;
    });

    const matchedSkills = skillsSnapshot.filter((skill) => {
      if (skill.unlocked) return false;
      if (skill.id.startsWith('blessing_')) return false; // 馆长的赐福由用户手动切换，不参与自动解锁提示
      const attr = attributesSnapshot.find(a => a.id === skill.requiredAttribute);
      return !!attr && attr.level >= skill.requiredLevel;
    });

    await get().loadData();

    // 为战场 SP 奖励：活动获得的总点数即为 SP
    const totalPts = Object.values(adjustedPoints).reduce((s, v) => s + (v || 0), 0);
    if (totalPts > 0 && get().battleState) {
      await get().earnSP(totalPts);
    }

    return {
      unlockHints: {
        achievements: matchedAchievements.length,
        skills: matchedSkills.length
      }
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
    const updated = { ...settings, ...newSettings };
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

  generateDailyEvent: async () => {
    const today = toLocalDateKey();
    const existing = await db.dailyEvents.where('date').equals(today).first();
    
    if (existing) {
      set({ dailyEvent: existing });
      return;
    }
    
    const { EVENT_POOL } = await import('@/constants');
    const randomEvent = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
    
    const newEvent: DailyEvent = {
      id: uuidv4(),
      date: today,
      title: randomEvent.title,
      description: randomEvent.description,
      effect: randomEvent.effect
    };
    
    await db.dailyEvents.add(newEvent);
    set({ dailyEvent: newEvent });
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

       const normalizedSettings = {
          ...settings,
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
    await db.settings.clear();
    await db.todos.clear();
    await db.todoCompletions.clear();
    await db.summaries.clear();
    await db.weeklyGoals.clear();
    await db.personas.clear();
    await db.shadows.clear();
    await db.battleStates.clear();

    set({
      user: null,
      attributes: [],
      activities: [],
      achievements: [],
      skills: [],
      dailyEvent: null,
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
    });
  },

  deleteActivity: async (id: string) => {
    await db.activities.delete(id);
    await get().loadData();
  },

  importData: async (jsonData: string) => {
    // 1. 解析 JSON（在修改任何数据前提前报格式错误）
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonData);
    } catch {
      throw new Error('JSON 格式错误，请检查备份文件');
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
      personas: await db.personas.toArray(),
      shadows: await db.shadows.toArray(),
      battleStates: await db.battleStates.toArray(),
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

      // 导入待办数据
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
      const result = await get().addActivity(`完成待办: ${todo.title}`, points, 'todo', { important: !!todo.important });
      await get().checkTodoCompletionAchievements({ skipLoad: true });

      if (!todo.repeatDaily && !todo.isLongTerm) {
        await db.todos.update(todo.id, { archivedAt: new Date(), completedAt: new Date(), isActive: false });
      }

      return result;
    } else {
      await get().loadData();
      return null;
    }
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

    const attrPoints: Record<string, number> = {
      knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0
    };
    for (const act of periodActivities) {
      if (!act.category) {
        attrPoints.knowledge += act.pointsAwarded.knowledge || 0;
        attrPoints.guts += act.pointsAwarded.guts || 0;
        attrPoints.dexterity += act.pointsAwarded.dexterity || 0;
        attrPoints.kindness += act.pointsAwarded.kindness || 0;
        attrPoints.charm += act.pointsAwarded.charm || 0;
      }
    }
    const totalPoints = Object.values(attrPoints).reduce((s, v) => s + v, 0);
    const attrNames = settings.attributeNames;
    const periodLabel = get().getSummaryLabel(period, startDate);
    const activityCount = periodActivities.filter(a => !a.category).length;

    const attrSummaryLines = Object.entries(attrPoints)
      .map(([id, pts]) => `- ${attrNames[id as keyof typeof attrNames] ?? id}${pts} 点（当前等级 Lv.${attributes.find(a => a.id === id)?.level ?? '?'}）`)
      .join('\n');

    const activityLines = periodActivities
      .filter(a => !a.category)
      .slice(0, 50)
      .map(a => `[${new Date(a.date).toLocaleDateString('zh-CN')}] ${a.description}`)
      .join('\n');

     const userMessage = `本期${periodLabel}（${startDate} ~ ${endDate}）成长记录：

## 属性加点统${attrSummaryLines}
总计${totalPoints} 点，${activityCount} 条记
## 活动记录详情
${activityLines || '（本期暂无记录）'}

请根据以上信息，生成本期成长总结与下期建议。`;

    const preset = get().getActiveSummaryPreset();
    const systemPrompt = preset.systemPrompt || DEFAULT_SUMMARY_PROMPT_PRESETS[0].systemPrompt;

    const provider = settings.summaryApiProvider ?? 'openai';
    let baseUrl = settings.summaryApiBaseUrl;
    if (!baseUrl) {
      if (provider === 'deepseek') baseUrl = 'https://api.deepseek.com/v1';
      else if (provider === 'kimi') baseUrl = 'https://api.moonshot.cn/v1';
      else baseUrl = 'https://api.openai.com/v1';
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    const model = settings.summaryModel || (
      provider === 'deepseek' ? 'deepseek-chat' :
      provider === 'kimi' ? 'moonshot-v1-8k' :
      'gpt-4o-mini'
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

    // 统计各属性加点
    const attrPoints: Record<string, number> = {
      knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0
    };
    for (const act of periodActivities) {
      if (!act.category) {
        attrPoints.knowledge += act.pointsAwarded.knowledge || 0;
        attrPoints.guts += act.pointsAwarded.guts || 0;
        attrPoints.dexterity += act.pointsAwarded.dexterity || 0;
        attrPoints.kindness += act.pointsAwarded.kindness || 0;
        attrPoints.charm += act.pointsAwarded.charm || 0;
      }
    }
    const totalPoints = Object.values(attrPoints).reduce((s, v) => s + v, 0);
    const attrNames = settings.attributeNames;

    // 构建用户消息
    const periodLabel = get().getSummaryLabel(period, startDate);
    const attrSummaryLines = Object.entries(attrPoints)
      .map(([id, pts]) => `- ${attrNames[id as keyof typeof attrNames] ?? id}${pts} 点（当前等级 Lv.${attributes.find(a => a.id === id)?.level ?? '?'}）`)
      .join('\n');

    const activityLines = periodActivities
      .filter(a => !a.category)
      .slice(0, 50) // 最50 条，防止 token 过多
      .map(a => `[${new Date(a.date).toLocaleDateString('zh-CN')}] ${a.description}`)
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
    const provider = settings.summaryApiProvider ?? 'openai';
    let baseUrl = settings.summaryApiBaseUrl;
    if (!baseUrl) {
      if (provider === 'deepseek') baseUrl = 'https://api.deepseek.com/v1';
      else if (provider === 'kimi') baseUrl = 'https://api.moonshot.cn/v1';
      else baseUrl = 'https://api.openai.com/v1';
    }
    baseUrl = baseUrl.replace(/\/$/, '');

    const model = settings.summaryModel || (
      provider === 'deepseek' ? 'deepseek-chat' :
      provider === 'kimi' ? 'moonshot-v1-8k' :
      'gpt-4o-mini'
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

    // 本周待办完成
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
    const actualDamage = isDamageType ? (isWeakness ? Math.round(action.value * 1.5) : action.value) : 0;
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
}));
