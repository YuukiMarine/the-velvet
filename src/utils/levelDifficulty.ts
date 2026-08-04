/**
 * 人格指数的难度档（R19）。
 *
 * 两件事：
 *   ① 阈值预设 —— 简单 / 困难（见 constants.LEVEL_PRESETS）
 *   ② 困难档是**看得见的**：等级标签换成一套按主题定的高调配色，
 *      让"我走的是难的那条路"这件事在菜单、同伴塔罗、GUEST PROFILE 上都成立。
 *
 * 颜色跟 **theme** 走而不是 uiChannel：粉和蓝共用 p3 频道，但用户点名它们要不同的颜色。
 */
import { LEVEL_PRESETS } from '@/constants';
import type { LevelDifficulty, Settings, ThemeType } from '@/types';

const eq = (a: number[] | undefined, b: readonly number[]) =>
  !!a && a.length >= b.length && b.every((v, i) => a[i] === v);

/**
 * 当前档位。
 *
 * 优先信显式设置；没有（老存档）就按阈值反推——只有和某一档的 LV1-5 **完全一致**
 * 才算数，手改过阈值的人两边都不沾，按简单档处理（不给困难档的高调配色，
 * 那个标记应当只属于真的在走困难档的人）。
 */
export function resolveLevelDifficulty(settings: Pick<Settings, 'levelDifficulty' | 'levelThresholds'>): LevelDifficulty {
  if (settings.levelDifficulty) return settings.levelDifficulty;
  if (eq(settings.levelThresholds, LEVEL_PRESETS.hard.base)) return 'hard';
  return 'easy';
}

/** 困难档的等级标签配色（按主题）；简单档返回 null = 用原本的阶位渐变 */
export interface HardTagInk {
  /** 主色（渐变两端由它派生） */
  ink: string;
  gradient: [string, string];
  /** 文字色 */
  text: string;
  glow: string;
}

const HARD_INK: Record<ThemeType, HardTagInk> = {
  // 蓝 → 红
  blue:   { ink: '#e02020', gradient: ['#ff4d4d', '#a1000f'], text: '#fff5f5', glow: 'rgba(224,32,32,0.55)' },
  // 粉 → 紫
  pink:   { ink: '#8b39d6', gradient: ['#c07af0', '#5b1899'], text: '#fbf5ff', glow: 'rgba(139,57,214,0.55)' },
  // 黄 → 紫
  yellow: { ink: '#7b2fd1', gradient: ['#b06bee', '#4d1391'], text: '#fbf5ff', glow: 'rgba(123,47,209,0.5)' },
  // 红 → 金
  red:    { ink: '#d4a017', gradient: ['#ffd970', '#a97a00'], text: '#2a1c00', glow: 'rgba(212,160,23,0.6)' },
  // 自定义：没点名，给一版与蓝同族的红（困难档总该是"热"的）
  custom: { ink: '#e02020', gradient: ['#ff4d4d', '#a1000f'], text: '#fff5f5', glow: 'rgba(224,32,32,0.55)' },
};

export function hardTagInk(theme: ThemeType | undefined): HardTagInk {
  return HARD_INK[theme ?? 'blue'] ?? HARD_INK.blue;
}

/** GUEST PROFILE 里那行 LV 的颜色：困难档 = 红，其余保持原本的淡紫 */
export const GUEST_LV_NORMAL = '#c4b5fd';
export const GUEST_LV_HARD = '#ff5f5f';
