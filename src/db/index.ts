import Dexie, { Table } from 'dexie';
import { User, Attribute, Activity, Achievement, Skill, DailyEvent, Settings, Todo, TodoCompletion, PeriodSummary, WeeklyGoal } from '@/types';

export class PGTDatabase extends Dexie {
  users!: Table<User>;
  attributes!: Table<Attribute>;
  activities!: Table<Activity>;
  achievements!: Table<Achievement>;
  skills!: Table<Skill>;
  dailyEvents!: Table<DailyEvent>;
  settings!: Table<Settings>;
  todos!: Table<Todo>;
  todoCompletions!: Table<TodoCompletion>;
  summaries!: Table<PeriodSummary>;
  weeklyGoals!: Table<WeeklyGoal>;

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
  }
}

export const db = new PGTDatabase();

// 数据库连接测试
db.open().catch(error => {
  console.error('数据库连接失败:', error);
});
