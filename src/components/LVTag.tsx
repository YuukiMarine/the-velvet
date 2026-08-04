import { motion } from 'motion/react';
import { resolveTier } from '@/utils/lvTiers';
import { hardTagInk } from '@/utils/levelDifficulty';
import type { LevelDifficulty, ThemeType } from '@/types';

interface Props {
  /** 用户总等级（五项属性等级之和） */
  level: number;
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否显示英文称谓（如 "Trickster"）；默认 md/lg 显示，sm 隐藏 */
  showLabel?: boolean;
  /** 是否使用"柔和"版渐变：降低饱和与发光，用于不那么抢眼的场合（例如设置页） */
  subdued?: boolean;
  /** 额外 className */
  className?: string;
  /**
   * 难度档（R19）。'hard' 时整枚徽章换成按主题定的高调配色，
   * 盖掉原本按总等级走的阶位渐变——那身颜色是"我走的是难的那条路"的标记。
   */
  difficulty?: LevelDifficulty;
  /** 配色跟主题走而不是 uiChannel：粉与蓝共用 p3 频道，但两者要不同的颜色 */
  theme?: ThemeType;
}

const SIZE_MAP = {
  sm: {
    padX: 'px-2',
    padY: 'py-0.5',
    lvFont: 'text-[10px]',
    numFont: 'text-xs font-bold',
    labelFont: 'text-[9px]',
    gap: 'gap-1',
    radius: 'rounded-md',
    minW: 'min-w-[48px]',
  },
  md: {
    padX: 'px-2.5',
    padY: 'py-1',
    lvFont: 'text-[11px]',
    numFont: 'text-sm font-bold',
    labelFont: 'text-[10px]',
    gap: 'gap-1.5',
    radius: 'rounded-lg',
    minW: 'min-w-[64px]',
  },
  lg: {
    padX: 'px-3.5',
    padY: 'py-1.5',
    lvFont: 'text-xs',
    numFont: 'text-base font-black',
    labelFont: 'text-[11px]',
    gap: 'gap-2',
    radius: 'rounded-xl',
    minW: 'min-w-[88px]',
  },
} as const;

/**
 * 彩色 LV 徽章。
 * 根据 total_lv 自动选择视觉阶位（每 5 级变色，25+ 炫彩流动）。
 */
export const LVTag = ({ level, size = 'md', showLabel, subdued = false, className = '', difficulty, theme }: Props) => {
  const tier = resolveTier(level);
  const sz = SIZE_MAP[size];

  const shouldShowLabel = showLabel ?? size !== 'sm';

  // 困难档：整枚换色，且不再流动——高调但不喧宾夺主
  const hard = difficulty === 'hard' ? hardTagInk(theme) : null;

  // 组装渐变（多色时用于流动动画，两色用于静态渐变）
  const gradientStr = hard
    ? `linear-gradient(90deg, ${hard.gradient[0]}, ${hard.gradient[1]})`
    : `linear-gradient(90deg, ${tier.gradient.join(', ')})`;
  const animated = tier.animated && !subdued && !hard;
  const backgroundSize = animated ? '300% 100%' : '100% 100%';

  const boxShadow = subdued
    ? undefined
    : hard
      ? `0 0 12px ${hard.glow}, 0 0 2px rgba(255,255,255,0.3) inset`
      : tier.glow && tier.glowColor
        ? `0 0 12px ${tier.glowColor}, 0 0 2px rgba(255,255,255,0.3) inset`
        : undefined;

  return (
    <motion.div
      className={`inline-flex items-center ${sz.gap} ${sz.padX} ${sz.padY} ${sz.radius} ${sz.minW} select-none ${className}`}
      style={{
        background: gradientStr,
        backgroundSize,
        color: hard ? hard.text : tier.textColor,
        boxShadow,
        border: (hard || tier.glow) && !subdued ? '1px solid rgba(255,255,255,0.25)' : undefined,
        filter: subdued ? 'saturate(0.55) brightness(0.96)' : undefined,
      }}
      animate={animated ? { backgroundPosition: ['0% 50%', '300% 50%'] } : undefined}
      transition={animated ? { duration: tier.id === 'foolsJourney' ? 5 : 6, repeat: Infinity, ease: 'linear' } : undefined}
    >
      <span className={`${sz.lvFont} opacity-70 tracking-wider font-semibold`}>LV</span>
      <span className={sz.numFont}>{level}</span>
      {shouldShowLabel && (
        <span className={`${sz.labelFont} tracking-wider opacity-85 uppercase ml-0.5`}>
          {tier.label}
        </span>
      )}
    </motion.div>
  );
};
