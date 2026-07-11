/**
 * PersonaProgress —— 进度/资源线原语（PERSONA_UI_REWRITE_GUIDE §8.10）。
 *
 * tone 表资源语义（P 系血统）：hp=青、sp=黄/绿、neutral=频道主强调、danger=告警。
 * 三频道三形态：P5 = 黑槽红条、填充端斜切（撕裂感）；P4 = 黑壳圆角嵌高饱和条 + 高光；
 * P3 = 细长资源线（h-1.5），列表行内可平铺。
 * 填充动画内置 useBoldness 门控：D0 直接到位不补间。
 */
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { UIChannel } from '../channel';
import { useUiChannel } from '../useUiChannel';
import { useBoldness } from '@/utils/boldness';

export type PersonaProgressTone = 'hp' | 'sp' | 'neutral' | 'danger';

export interface PersonaProgressProps {
  channel?: UIChannel;
  /** 0~1（或配合 max 使用原始值） */
  value: number;
  max?: number;
  tone?: PersonaProgressTone;
  /** 左侧小标签（HP / SP / 今日 …） */
  label?: ReactNode;
  /** 右侧数值文本（如 32/50） */
  valueText?: ReactNode;
  className?: string;
}

/** 各频道的 tone → 填充色 */
const FILL: Record<UIChannel, Record<PersonaProgressTone, string>> = {
  p5: { hp: 'var(--ui-accent)', sp: 'var(--ui-accent-2)', neutral: 'var(--ui-accent)', danger: 'var(--ui-danger)' },
  p4: { hp: '#20bff2', sp: '#5be04b', neutral: 'var(--ui-bg)', danger: 'var(--ui-danger)' },
  p3: { hp: 'var(--ui-accent)', sp: 'var(--ui-accent-2)', neutral: 'var(--ui-accent)', danger: 'var(--ui-danger)' },
  neutral: { hp: 'var(--color-primary)', sp: '#10b981', neutral: 'var(--color-primary)', danger: '#ef4444' },
};

export const PersonaProgress = ({
  channel,
  value,
  max = 1,
  tone = 'neutral',
  label,
  valueText,
  className,
}: PersonaProgressProps) => {
  const inherited = useUiChannel();
  const ch = channel ?? inherited;
  const bold = useBoldness();
  const ratio = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  const fill = FILL[ch][tone];

  const track =
    ch === 'p5'
      ? { cls: 'h-3 border-2 border-black bg-black', style: {} as React.CSSProperties }
      : ch === 'p4'
        ? { cls: 'h-3.5 rounded-full border-2 border-black bg-[#111111]', style: { boxShadow: '0 2px 0 #000' } as React.CSSProperties }
        : ch === 'p3'
          ? { cls: 'h-2 bg-[#d9eef7]', style: {} as React.CSSProperties }
          : { cls: 'h-2 rounded-full bg-gray-100 dark:bg-gray-800', style: {} as React.CSSProperties };

  return (
    <div className={className}>
      {(label || valueText) && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px] font-bold leading-none opacity-85">
          <span>{label}</span>
          <span className="tabular-nums">{valueText}</span>
        </div>
      )}
      <div className={`relative w-full overflow-hidden ${track.cls}`} style={track.style} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <motion.div
          className="relative h-full"
          style={{
            background: fill,
            // P5 填充端斜切（撕裂感）；P4 圆角随壳
            clipPath: ch === 'p5' ? 'polygon(0 0, 100% 0, calc(100% - 5px) 100%, 0 100%)' : undefined,
            borderRadius: ch === 'p4' ? 9999 : undefined,
          }}
          initial={false}
          animate={{ width: `${ratio * 100}%` }}
          transition={bold ? { type: 'spring', stiffness: 160, damping: 26 } : { duration: 0 }}
        >
          {/* P4 高光线 */}
          {ch === 'p4' && (
            <span aria-hidden className="absolute inset-x-1 top-[2px] h-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.5)' }} />
          )}
        </motion.div>
      </div>
    </div>
  );
};
