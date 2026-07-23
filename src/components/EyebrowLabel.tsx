/**
 * EyebrowLabel — 区块眉标（UI_DESIGN_BOLD_V2.5.md §2 规则 3「角度同源」）。
 *
 * 替代审计发现的三种区块标题写法：平行四边形色条 + 10px 全大写宽字距标签。
 * 色条斜切角取 --ui-skew-ui（D0 / 校直模式下由 CSS 变量归 0，组件无需感知）；
 * skew 只作用于装饰色条，文字层永不倾斜（护栏「字恒水平」）。
 */
import type { ReactNode } from 'react';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower } from '@/ui/p4Kit';

interface EyebrowLabelProps {
  children: ReactNode;
  /** 色条颜色类，域色场景传入如 'bg-battle'；默认主题色 */
  barClass?: string;
  className?: string;
}

export const EyebrowLabel = ({ children, barClass = 'bg-primary', className }: EyebrowLabelProps) => {
  const isP4 = useUiChannel() === 'p4';

  // p4-redraw 眉标制式：黑五瓣花 + 黑粗标签 + 右延虚线（account/settings 区题同款）
  if (isP4) {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <P4Flower size={16} color="#131313" />
        <span className="text-[13px] font-black tracking-wide text-[#131313]">{children}</span>
        <span aria-hidden className="ml-1 flex-1 border-b-2 border-dotted border-[#131313]/30" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
      <span
        aria-hidden="true"
        className={`w-2.5 h-1.5 flex-none ${barClass}`}
        style={{ transform: 'skewX(var(--ui-skew-ui))' }}
      />
      <span className="text-2xs uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500">
        {children}
      </span>
    </div>
  );
};
