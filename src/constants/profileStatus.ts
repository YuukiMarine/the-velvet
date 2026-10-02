/**
 * 名片「状态」预设（v2.7.0.6 第 6 项）：像微信状态那样从一组里挑一个，设定后 24 小时自动消失。
 * 只有预设、没有自由文本，所以不用过审核；文案全在这里，要加减就改这张表。
 */
import type { ProfileStatus } from '@/types';

export interface StatusPreset {
  id: string;
  emoji: string;
  label: string;
}

export const STATUS_PRESETS: readonly StatusPreset[] = [
  { id: 'focus', emoji: '🎯', label: '专注中' },
  { id: 'study', emoji: '📘', label: '在学习' },
  { id: 'work', emoji: '💼', label: '加班中' },
  { id: 'sprint', emoji: '⚡', label: '冲刺冲' },
  { id: 'create', emoji: '🎨', label: '在创作' },
  { id: 'read', emoji: '📖', label: '在读书' },
  { id: 'run', emoji: '🏃', label: '别急' },
  { id: 'travel', emoji: '🧭', label: '在路上' },
  { id: 'cook', emoji: '🍳', label: '在做饭' },
  { id: 'music', emoji: '🎧', label: '听歌中' },
  { id: 'game', emoji: '🎮', label: '打游戏' },
  { id: 'movie', emoji: '🎬', label: '看番' },
  { id: 'coffee', emoji: '☕', label: '摸鱼中' },
  { id: 'happy', emoji: '✨', label: '元气满满' },
  { id: 'calm', emoji: '🌙', label: '想静静' },
  { id: 'heal', emoji: '🌿', label: '慢慢来' },
  { id: 'lowbat', emoji: '🔋', label: '电量不足' },
  { id: 'rest', emoji: '🛌', label: '休息中' },
  { id: 'sleepy', emoji: '😴', label: '似了' },
] as const;

/** 有效期：设定后 24 小时 */
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

export const statusPreset = (id: string | undefined): StatusPreset | undefined =>
  id ? STATUS_PRESETS.find(p => p.id === id) : undefined;

/** 还在有效期内、且是认识的预设 → 返回预设；否则 null（过期 / 没设 / 对方 App 更新有新预设本机不认识） */
export function liveStatus(s: ProfileStatus | undefined | null, now = Date.now()): StatusPreset | null {
  if (!s || !s.id || !s.at) return null;
  const at = Date.parse(s.at);
  if (!Number.isFinite(at) || now - at >= STATUS_TTL_MS || at - now > 60 * 60 * 1000) return null;
  return statusPreset(s.id) ?? null;
}

/** 设了多久：刚刚 / N 分钟前 / N 小时前 */
export function statusAgeText(s: ProfileStatus, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(s.at));
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return `${Math.floor(diff / 3600_000)} 小时前`;
}
