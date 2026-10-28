/**
 * 备份格式的共用常量（第 31 批）：导出端（services/backup.ts）和导入端（store.importData）都要用，
 * 单独成文件——放进 backup.ts 会和 store 互相 import。
 */
import type { NavigatorSessionRow } from '@/types';

/** 当前备份格式版本：导入时比这新的直接拒绝（更新版本 App 导出的，这版读不全） */
export const BACKUP_VERSION = 11;

/**
 * 助手会话行 → 备份 / 上云用的精简行：只留摘要和相处信息。
 * swallowed（被打断没说出口的半句）和 earlySummary（今天早些时候的压缩，指着本机的消息 id）都是本机聊天的一部分，不带。
 */
export function slimSessionRow(r: NavigatorSessionRow): NavigatorSessionRow {
  // reads（每轮心里过的那一遍，第 36 批）也是本机聊天的一部分：不上云；日记随行走（和摘要同口径）
  const { swallowed: _sw, earlySummary: _es, reads: _rd, ...rest } = r;
  void _sw; void _es; void _rd;
  return rest;
}

/**
 * 一份完整备份应有的表（备份里的键 → 本机表名）。导入时文件里缺了哪张，就**保留本机那张**并告诉用户，
 * 不再清空——老版本导出的备份（v8 前没记账 / 人格 / 记忆 / 宣告卡，v10 前没窥探命运，v11 前没助手会话）
 * 以前导进来会把这些悄悄清掉还报成功。
 */
export const BACKUP_TABLE_KEYS: Array<{ key: string; table: string; label: string }> = [
  { key: 'user', table: 'users', label: '客人档案' },
  { key: 'attributes', table: 'attributes', label: '属性' },
  { key: 'activities', table: 'activities', label: '记录' },
  { key: 'achievements', table: 'achievements', label: '成就' },
  { key: 'skills', table: 'skills', label: '技能' },
  { key: 'settings', table: 'settings', label: '设置' },
  { key: 'todos', table: 'todos', label: '任务' },
  { key: 'todoCompletions', table: 'todoCompletions', label: '任务完成记录' },
  { key: 'personas', table: 'personas', label: 'Persona' },
  { key: 'shadows', table: 'shadows', label: 'Shadow' },
  { key: 'battleStates', table: 'battleStates', label: '战场状态' },
  { key: 'strata', table: 'strata', label: '高塔区层' },
  { key: 'dailyDivinations', table: 'dailyDivinations', label: '每日塔罗' },
  { key: 'longReadings', table: 'longReadings', label: '中长期占卜' },
  { key: 'summaries', table: 'summaries', label: '总结' },
  { key: 'weeklyGoals', table: 'weeklyGoals', label: '本周目标' },
  { key: 'confidants', table: 'confidants', label: '同伴' },
  { key: 'confidantEvents', table: 'confidantEvents', label: '同伴事件' },
  { key: 'counselArchives', table: 'counselArchives', label: '谏言归档' },
  { key: 'wishes', table: 'wishes', label: '愿望清单' },
  { key: 'callingCards', table: 'callingCards', label: '宣告卡' },
  { key: 'ledgerEntries', table: 'ledgerEntries', label: '记账' },
  { key: 'budgets', table: 'budgets', label: '预算' },
  { key: 'assets', table: 'assets', label: '资产' },
  { key: 'navigatorPresets', table: 'navigatorPresets', label: '助手人格' },
  { key: 'navigatorMemos', table: 'navigatorMemos', label: '助手记忆' },
  { key: 'dailyEvents', table: 'dailyEvents', label: '旧版每日事件' },
  { key: 'fateGlimpses', table: 'fateGlimpses', label: '窥探命运' },
  { key: 'stamps', table: 'stamps', label: '岁时印章' },
  { key: 'quests', table: 'quests', label: '委托板' },
  { key: 'navigatorSessions', table: 'navigatorSessions', label: '助手相处记录' },
];
