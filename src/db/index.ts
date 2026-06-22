import Dexie, { Table } from 'dexie';
import { User, Attribute, Activity, Achievement, Skill, DailyEvent, DailyDivination, LongReading, Settings, Todo, TodoCompletion, PeriodSummary, WeeklyGoal, Persona, Shadow, BattleState, Confidant, ConfidantEvent, CounselSession, CounselArchive, CallingCard, LedgerEntry, Budget, LedgerAsset, Wish } from '@/types';

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
  }
}

export const db = new PGTDatabase();

// 数据库连接测试
db.open().catch(error => {
  console.error('数据库连接失败:', error);
});
