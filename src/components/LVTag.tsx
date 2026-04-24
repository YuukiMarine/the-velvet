import { motion } from 'framer-motion';
import { resolveTier } from '@/utils/lvTiers';

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
export const LVTag = ({ level, size = 'md', showLabel, subdued = false, className = '' }: Props) => {
  const tier = resolveTier(level);
  const sz = SIZE_MAP[size];

  const shouldShowLabel = showLabel ?? size !== 'sm';

  // 组装渐变（多色时用于流动动画，两色用于静态渐变）
  const gradientStr = `linear-gradient(90deg, ${tier.gradient.join(', ')})`;
  const backgroundSize = tier.animated && !subdued ? '300% 100%' : '100% 100%';

  const boxShadow = !subdued && tier.glow && tier.glowColor
    ? `0 0 12px ${tier.glowColor}, 0 0 2px rgba(255,255,255,0.3) inset`
    : undefined;

  return (
    <motion.div
      className={`inline-flex items-center ${sz.gap} ${sz.padX} ${sz.padY} ${sz.radius} ${sz.minW} select-none ${className}`}
      style={{
        background: gradientStr,
        backgroundSize,
        color: tier.textColor,
        boxShadow,
        border: tier.glow && !subdued ? '1px solid rgba(255,255,255,0.25)' : undefined,
        filter: subdued ? 'saturate(0.55) brightness(0.96)' : undefined,
      }}
      animate={
        tier.animated && !subdued
          ? { backgroundPosition: ['0% 50%', '300% 50%'] }
          : undefined
      }
      transition={
        tier.animated && !subdued
          ? { duration: tier.id === 'foolsJourney' ? 5 : 6, repeat: Infinity, ease: 'linear' }
          : undefined
      }
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
