/**
 * 名片状态 / 目标（v2.7.0.6 第 6 项）的纯计算：
 *   · 本机的选择（settings.profileStatus / profileGoal）→ 推到云端的快照（users.status / users.goal）
 *   · 云端读回来的任意 JSON → 认得的形状（对方 App 版本不同 / 字段没建都不会炸）
 *   · 快照 → 名片上那一行字
 */
import { liveStatus } from '@/constants/profileStatus';
import { auditText } from '@/utils/textAudit';
import type { CallingCard, ProfileGoalSnapshot, ProfileStatus, Settings } from '@/types';

/** 目标「对外显示为」那一句的上限 */
export const PROFILE_GOAL_MAX = 30;

export interface PresenceSource {
  settings: Settings;
  callingCards: CallingCard[];
  getCallingCardProgress: (id: string) => { overallProgress: number; daysLeft?: number } | null;
}

/**
 * 目标快照。
 *   null      = 没有目标 → 云端清掉
 *   undefined = 这台设备算不出来（挂的宣告卡不在本机：宣告卡跟「任务与总结」同步组走，可能没同步）→ 云端不动
 */
export function buildGoalSnapshot(s: PresenceSource): ProfileGoalSnapshot | null | undefined {
  const pick = s.settings.profileGoal;
  if (!pick || pick.kind !== 'card' || !pick.cardId) return null;
  const card = s.callingCards.find(c => c.id === pick.cardId);
  if (!card) return undefined;
  const alias = pick.alias?.trim().slice(0, PROFILE_GOAL_MAX) || '';
  // 有「对外显示为」就只给别人看那一句（原标题和副标题都不带出去）；没有就用卡上的标题
  const title = alias || card.title.trim();
  const subtitle = alias ? undefined : card.subtitle?.trim() || undefined;
  if (!title || !auditText(title).ok || (subtitle && !auditText(subtitle).ok)) return null;
  const done = !!card.archived && (card.archiveReason === 'auto_todos' || card.archiveReason === 'auto_date');
  if (card.archived && !done) return null; // 手动收存 = 不再展示
  const prog = card.archived ? null : s.getCallingCardProgress(card.id);
  return {
    kind: 'card',
    title,
    subtitle,
    targetDate: card.targetDate || undefined,
    progress: done ? 100 : prog ? Math.round(Math.max(0, Math.min(1, prog.overallProgress)) * 100) : undefined,
    daysLeft: done ? undefined : prog?.daysLeft,
    done: done || undefined,
    at: new Date().toISOString(),
  };
}

/** 进度条用的百分比（0–100；达成算 100；算不出按 0） */
export const goalPercent = (g: ProfileGoalSnapshot): number =>
  g.done ? 100 : Math.max(0, Math.min(100, Math.round(g.progress ?? 0)));

/** 推到 users 表的那两个字段；目标算不出来就不带 goal 键 */
export function buildPresencePatch(s: PresenceSource): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: liveStatus(s.settings.profileStatus) ? s.settings.profileStatus : null,
  };
  const goal = buildGoalSnapshot(s);
  if (goal !== undefined) patch.goal = goal;
  return patch;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** 云端 users.status → ProfileStatus（形状不对就当没有） */
export function parseProfileStatus(v: unknown): ProfileStatus | undefined {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.at !== 'string' || !v.id || !v.at) return undefined;
  return { id: v.id, at: v.at };
}

/** 云端 users.goal → ProfileGoalSnapshot（形状不对就当没有） */
export function parseGoalSnapshot(v: unknown): ProfileGoalSnapshot | undefined {
  if (!isObj(v) || typeof v.title !== 'string' || !v.title.trim()) return undefined;
  const kind = v.kind === 'card' ? 'card' : 'text';
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  return {
    kind,
    title: v.title.trim().slice(0, 60),
    subtitle: typeof v.subtitle === 'string' && v.subtitle.trim() ? v.subtitle.trim().slice(0, 60) : undefined,
    targetDate: typeof v.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.targetDate) ? v.targetDate : undefined,
    progress: num(v.progress),
    daysLeft: num(v.daysLeft),
    done: v.done === true || undefined,
    at: typeof v.at === 'string' ? v.at : '',
  };
}

/** 目标那一行的补充信息：还有几天 / 进度 / 已达成；自己写的目标没有 */
export function goalLineText(g: ProfileGoalSnapshot): string {
  if (g.done) return '已达成 ✓';
  if (g.kind !== 'card') return '';
  const parts: string[] = [];
  if (typeof g.daysLeft === 'number') parts.push(g.daysLeft === 0 ? '就是今天' : `还有 ${g.daysLeft} 天`);
  if (typeof g.progress === 'number' && (parts.length === 0 || g.progress > 0)) parts.push(`${g.progress}%`);
  return parts.join(' · ');
}
