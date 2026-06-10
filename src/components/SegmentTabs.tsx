/**
 * SegmentTabs — 分段式 Tab 栏（UI_AUDIT_V2.5.md §3.5：替代三种各写各的 Tab 实现）。
 *
 * 斜界化要点（UI_DESIGN_BOLD_V2.5.md §2）：
 *   - 激活指示块是斜切平行四边形，斜角取 --ui-skew-ui（D0 自动归 0）；
 *   - 「字恒水平」：skew 只落在指示块上，文字层 relative z-10 永不参与形变；
 *   - 指示块滑动用 layoutId 共享布局动画 + springSnappy（D2 控件预算 <300ms）。
 *
 * 实现约束：layout 动画期间 Framer 的 projection 独占元素 transform，静态
 * skew 若直接写在 layoutId 元素上会被覆盖——因此 skew 放在其内层子 div 上。
 * 同页多实例必须传不同 layoutId（否则指示块跨实例互飞）；不传时用 useId 兜底。
 */
import { useId } from 'react';
import { motion } from 'framer-motion';
import { springSnappy, TAP } from '@/utils/motion';

interface SegmentTabItem<K extends string> {
  key: K;
  label: string;
  /** 角标（计数/状态），如成就页的待解锁数 */
  badge?: string | number;
}

interface SegmentTabsProps<K extends string> {
  items: SegmentTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  size?: 'sm' | 'md';
  /** 同页多实例时显式指定，防止指示块互飞 */
  layoutId?: string;
  className?: string;
}

export const SegmentTabs = <K extends string>({
  items,
  value,
  onChange,
  size = 'md',
  layoutId,
  className,
}: SegmentTabsProps<K>) => {
  const autoId = useId();
  const indicatorId = layoutId ?? `segment-tabs-${autoId}`;
  const sizeClass = size === 'sm' ? 'py-1.5 text-xs' : 'py-2.5 text-sm';

  return (
    <div role="tablist" className={`flex p-1 rounded-2xl bg-gray-100 dark:bg-gray-800 ${className ?? ''}`}>
      {items.map(item => {
        const active = item.key === value;
        return (
          <motion.button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            whileTap={TAP}
            onClick={() => onChange(item.key)}
            className={`relative flex-1 rounded-xl ${sizeClass}`}
          >
            {active && (
              <motion.div
                layoutId={indicatorId}
                transition={springSnappy}
                className="absolute inset-0"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-0 bg-primary rounded-xl"
                  style={{ transform: 'skewX(var(--ui-skew-ui))' }}
                />
              </motion.div>
            )}
            <span
              className={`relative z-10 flex items-center justify-center gap-1.5 transition-colors ${
                active ? 'text-white font-bold' : 'text-gray-500 dark:text-gray-400 font-semibold'
              }`}
            >
              {item.label}
              {item.badge !== undefined && (
                <span
                  className={`text-2xs leading-none px-1.5 py-0.5 rounded-full ${
                    active
                      ? 'bg-white/25 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
