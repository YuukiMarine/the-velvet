import Dexie, { Table } from 'dexie';
import { User, Attribute, Activity, Achievement, Skill, DailyEvent, DailyDivination, LongReading, FateGlimpse, Settings, Todo, TodoCompletion, PeriodSummary, WeeklyGoal, Persona, Shadow, BattleState, Confidant, ConfidantEvent, CounselSession, CounselArchive, CallingCard, LedgerEntry, Budget, LedgerAsset, Wish, NavigatorSessionRow, NavigatorMessageRow, NavigatorMemo, NavigatorPreset, TowerStratum, OnlineCardFace, ActivityImage, ActivityImageData, SeasonStamp } from '@/types';

export class PGTDatabase extends Dexie {
  users!: Table<User>;
  attributes!: Table<Attribute>;
  activities!: Table<Activity>;
  achievements!: Table<Achievement>;
  skills!: Table<Skill>;
  dailyEvents!: Table<DailyEvent>;
  dailyDivinations!: Table<DailyDivination>;
  longReadings!: Table<LongReading>;
  settings!: Table<Settings>;
  todos!: Table<Todo>;
  todoCompletions!: Table<TodoCompletion>;
  summaries!: Table<PeriodSummary>;
  weeklyGoals!: Table<WeeklyGoal>;
  personas!: Table<Persona>;
  shadows!: Table<Shadow>;
  battleStates!: Table<BattleState>;
  confidants!: Table<Confidant>;
  confidantEvents!: Table<ConfidantEvent>;
  counselSessions!: Table<CounselSession>;
  counselArchives!: Table<CounselArchive>;
  callingCards!: Table<CallingCard>;
  ledgerEntries!: Table<LedgerEntry>;   // F5 心相记账
  budgets!: Table<Budget>;              // F5 月度预算
  assets!: Table<LedgerAsset>;          // F5 固定资产（phase ②）
  wishes!: Table<Wish>;                 // F3 愿望清单（终极目标 + 子愿望）
  navigatorSessions!: Table<NavigatorSessionRow>;   // F6 黑猫会话（每日每人格）
  navigatorMessages!: Table<NavigatorMessageRow>;   // F6 会话消息
  navigatorMemos!: Table<NavigatorMemo>;            // F6 原子记忆（三源 + F8 图片卡共用）
  stamps!: Table<SeasonStamp>;                      // 第 6 轮 岁时印章
  navigatorPresets!: Table<NavigatorPreset>;        // F6 自定义人格（内置随代码，不入表）
  strata!: Table<TowerStratum>;                     // 批2 影时间高塔·区层
  onlineCardFaces!: Table<OnlineCardFace>;          // 未缔结在线好友的自裁卡面（本地专属，见 v14 注释）
  fateGlimpses!: Table<FateGlimpse>;                // v2.7 窥探命运（7 天塔罗总占卜）
  activityImages!: Table<ActivityImage>;            // v2.7.0.6 记录配图（元数据 + 缩略图；本地专属）
  activityImageData!: Table<ActivityImageData>;     // v2.7.0.6 记录配图原图（灯箱才取；本地专属）

  constructor() {
    super('PGTDatabase');
    this.version(1).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      settings: 'id'
    });
    this.version(2).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date'
    });
    this.version(3).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt'
    });
    this.version(4).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt'
    });
    this.version(5).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt',
      personas: 'id, name, createdAt',
      shadows: 'id, level, createdAt',
      battleStates: 'id'
    });
    // v6: 星象/塔罗
    this.version(6).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      dailyDivinations: 'id, date',
      longReadings: 'id, createdAt, archived, expiresAt',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt',
      personas: 'id, name, createdAt',
      shadows: 'id, level, createdAt',
      battleStates: 'id'
    });
    // v7: 同伴 / Confidant
    this.version(7).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      dailyDivinations: 'id, date',
      longReadings: 'id, createdAt, archived, expiresAt',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt',
      personas: 'id, name, createdAt',
      shadows: 'id, level, createdAt',
      battleStates: 'id',
      confidants: 'id, userId, arcanaId, source, intimacy, createdAt, archivedAt',
      confidantEvents: 'id, confidantId, date, type, createdAt'
    });
    // v8: 谏言 / Counsel
    this.version(8).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      dailyDivinations: 'id, date',
      longReadings: 'id, createdAt, archived, expiresAt',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt',
      personas: 'id, name, createdAt',
      shadows: 'id, level, createdAt',
      battleStates: 'id',
      confidants: 'id, userId, arcanaId, source, intimacy, createdAt, archivedAt',
      confidantEvents: 'id, confidantId, date, type, createdAt',
      counselSessions: 'id, startedDate, startedAt',
      counselArchives: 'id, createdAt'
    });
    // v9: CallingCard / 宣告卡（倒计时）
    this.version(9).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      dailyDivinations: 'id, date',
      longReadings: 'id, createdAt, archived, expiresAt',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt',
      personas: 'id, name, createdAt',
      shadows: 'id, level, createdAt',
      battleStates: 'id',
      confidants: 'id, userId, arcanaId, source, intimacy, createdAt, archivedAt',
      confidantEvents: 'id, confidantId, date, type, createdAt',
      counselSessions: 'id, startedDate, startedAt',
      counselArchives: 'id, createdAt',
      callingCards: 'id, pinned, archived, createdAt, targetDate'
    });
    // v10: 心相记账（F5）—— ledgerEntries(进/出/调整) + budgets(月度预算) + assets(固定资产)
    this.version(10).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      dailyDivinations: 'id, date',
      longReadings: 'id, createdAt, archived, expiresAt',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt',
      personas: 'id, name, createdAt',
      shadows: 'id, level, createdAt',
      battleStates: 'id',
      confidants: 'id, userId, arcanaId, source, intimacy, createdAt, archivedAt',
      confidantEvents: 'id, confidantId, date, type, createdAt',
      counselSessions: 'id, startedDate, startedAt',
      counselArchives: 'id, createdAt',
      callingCards: 'id, pinned, archived, createdAt, targetDate',
      ledgerEntries: 'id, direction, type, channel, date, createdAt',
      budgets: 'id, period, createdAt',
      assets: 'id, category, status, createdAt'
    });
    // v11: F3 无气力症治疗终端 —— wishes(愿望清单：终极目标 parentId=null + 子愿望)
    this.version(11).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      dailyDivinations: 'id, date',
      longReadings: 'id, createdAt, archived, expiresAt',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt',
      personas: 'id, name, createdAt',
      shadows: 'id, level, createdAt',
      battleStates: 'id',
      confidants: 'id, userId, arcanaId, source, intimacy, createdAt, archivedAt',
      confidantEvents: 'id, confidantId, date, type, createdAt',
      counselSessions: 'id, startedDate, startedAt',
      counselArchives: 'id, createdAt',
      callingCards: 'id, pinned, archived, createdAt, targetDate',
      ledgerEntries: 'id, direction, type, channel, date, createdAt',
      budgets: 'id, period, createdAt',
      assets: 'id, category, status, createdAt',
      wishes: 'id, parentId, attribute, status, createdAt, archivedAt'
    });
    // v12: F6 黑猫 Navigator —— 会话/消息持久化 + 原子记忆 + 自定义人格（Batch3）
    this.version(12).stores({
      users: 'id, name, createdAt, theme',
      attributes: 'id, displayName, points, level, unlocked',
      activities: 'id, userId, date, description, method',
      achievements: 'id, unlocked, unlockedDate',
      skills: 'id, requiredAttribute, requiredLevel, unlocked',
      dailyEvents: 'id, date',
      dailyDivinations: 'id, date',
      longReadings: 'id, createdAt, archived, expiresAt',
      settings: 'id',
      todos: 'id, attribute, frequency, isActive, createdAt',
      todoCompletions: 'id, todoId, date',
      summaries: 'id, period, startDate, endDate, createdAt',
      weeklyGoals: 'id, weekStart, weekEnd, completed, createdAt',
      personas: 'id, name, createdAt',
      shadows: 'id, level, createdAt',
      battleStates: 'id',
      confidants: 'id, userId, arcanaId, source, intimacy, createdAt, archivedAt',
      confidantEvents: 'id, confidantId, date, type, createdAt',
      counselSessions: 'id, startedDate, startedAt',
      counselArchives: 'id, createdAt',
      callingCards: 'id, pinned, archived, createdAt, targetDate',
      ledgerEntries: 'id, direction, type, channel, date, createdAt',
      budgets: 'id, period, createdAt',
      assets: 'id, category, status, createdAt',
      wishes: 'id, parentId, attribute, status, createdAt, archivedAt',
      navigatorSessions: 'id, dateKey, presetId, createdAt, updatedAt',
      navigatorMessages: 'id, sessionId, createdAt',
      navigatorMemos: 'id, source, status, importance, createdAt',
      navigatorPresets: 'id, isBuiltin, createdAt'
    });

    // v13（批2 影时间高塔）：新增区层表
    this.version(13).stores({
      strata: 'id, level, status, createdWeekKey, createdAt'
    });

    // v14：未缔结在线好友的自裁卡面（专辑墙 friend 卡）。
    // 主键 = 对方云端 user id ——未缔结的好友本地没有 Confidant 行，只能按云端身份索引；
    // 缔结时 materializeCoopBonds 会把它搬进新建同伴的 cardFaceDataUrl（services/social.ts）。
    // **故意不进 sync.ts 的 SYNC_TABLES**：与 confidants.customAvatarDataUrl 同口径——
    // base64 大图 + 他人肖像，只留本机，不上云。
    this.version(14).stores({
      onlineCardFaces: 'userId'
    });

    // v15：窥探命运（7 天塔罗集齐后的总占卜 + 3 天 buff）。
    // 小表（每 7 天至多 1 行），列入 SYNC_TABLES 与备份（与 dailyDivinations 同口径）。
    this.version(15).stores({
      fateGlimpses: 'id, createdAt'
    });

    // v16（v2.7.0.6）：记录配图。两张表拆开——列表只读 activityImages（缩略图几 KB 一张），
    // 原图（≤150KB）放 activityImageData，灯箱打开时按 id 取，避免 toArray 把几十 MB 拉进内存。
    // **故意不进 SYNC_TABLES 也不进主备份**：与 onlineCardFaces / 同伴自定义头像同口径，
    // 单独走「图片包」导出导入（services/backup），免得主备份塞满 base64 拖慢导入。
    this.version(16).stores({
      activityImages: 'id, activityId, createdAt',
      activityImageData: 'id'
    });

    // v17（v2.7.0.6 第 6 轮）：岁时印章。小表（一年几十行），进 SYNC_TABLES 与备份。
    this.version(17).stores({
      stamps: 'id, kind, year'
    });
  }
}

export const db = new PGTDatabase();

// 数据库连接测试
db.open().catch(error => {
  console.error('数据库连接失败:', error);
});
