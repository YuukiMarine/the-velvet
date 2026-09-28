import type { Attribute, LevelDifficulty, Settings } from '@/types';

/**
 * 人格指数的「点数 → 等级」与满级后的「精通」（2.7.0.6 第 6 轮）。
 *
 * 以前这段 while 循环在 store 里复制了七遍（记一笔 / 改点 / 改阈值 / 删记录 / 周目标 /
 * 逆流衰减 / 同伴互动），各自的起算点还不一样；现在只认这一处：从 1 级起按阈值表数，
 * `thresholds[n-1]` = 到达 Lv.n 需要的累计点数。
 */
export function levelForPoints(points: number, thresholds: readonly number[]): number {
  let lv = 1;
  while (lv < thresholds.length && points >= thresholds[lv]) lv++;
  return lv;
}

/** 生效的阈值表：settings 里有就用它（全属性共用），没有（极老存档）才退回属性自带的那份 */
export function thresholdsOf(
  settings: Pick<Settings, 'levelThresholds'>,
  attr?: Pick<Attribute, 'levelThresholds'> | null,
): number[] {
  if (settings.levelThresholds?.length) return settings.levelThresholds;
  return attr?.levelThresholds ?? [];
}

/** 精通只在曲线开满 10 级、且已经站在 Lv.10 上时才计 */
export const MASTERY_MAX_LEVEL = 10;
/** 每颗精通星要的点数：简单 500、困难 700（用户拍板） */
export const MASTERY_STEP: Record<LevelDifficulty, number> = { easy: 500, hard: 700 };

export interface Mastery {
  /** 已点亮的星数（可以是 0：刚满级、还没攒够第一颗） */
  stars: number;
  step: number;
  /** 距下一颗还差多少点 */
  toNext: number;
  /** 当前这颗的进度 0–1 */
  progress: number;
}

/**
 * 满级后的精通读数；曲线不满 10 级或还没到 Lv.10 时返回 null（那时该显示的是普通升级进度）。
 * 不改等级曲线、不发奖励——它只是给重度用户满级之后一个还在往前走的读数。
 */
export function masteryOf(
  points: number,
  thresholds: readonly number[],
  difficulty: LevelDifficulty,
): Mastery | null {
  if (thresholds.length < MASTERY_MAX_LEVEL) return null;
  const base = thresholds[MASTERY_MAX_LEVEL - 1];
  if (!(points >= base)) return null;
  const step = MASTERY_STEP[difficulty] ?? MASTERY_STEP.easy;
  const over = points - base;
  const stars = Math.floor(over / step);
  const into = over - stars * step;
  return { stars, step, toNext: step - into, progress: into / step };
}
