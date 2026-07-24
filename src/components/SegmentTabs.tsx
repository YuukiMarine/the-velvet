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
import { motion } from 'motion/react';
import { springSnappy, TAP } from '@/utils/motion';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower } from '@/ui/p4Kit';

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
  const isP4 = useUiChannel() === 'p4';
  const sizeClass = size === 'sm' ? 'py-1.5 text-xs' : 'py-2.5 text-sm';
  const p3 = useUiChannel() === 'p3';

  // ── P3R（蓝频道，p3-redraw 设计稿切换头）：全员白斜块底，选中 = 蓝斜块白字 + 右下洋红角 ──
  if (p3) {
    const p3Size = size === 'sm' ? 'py-2 text-[13px]' : 'py-3 text-[16px]';
    return (
      <div role="tablist" className={`flex ${className ?? ''}`}>
        {items.map((item, i) => {
          const active = item.key === value;
          return (
            <motion.button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              whileTap={TAP}
              onClick={() => onChange(item.key)}
              className={`relative flex-1 font-black ${p3Size}`}
              style={{ marginLeft: i > 0 ? -7 : 0, zIndex: active ? 2 : 1 }}
            >
              {/* 白斜块底（全员；layout 指示块盖其上） */}
              <span aria-hidden className="absolute inset-0" style={{ clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)', background: '#ffffff', boxShadow: '0 6px 14px rgba(38,96,140,0.06)' }} />
              {active && (
                <motion.div layoutId={indicatorId} transition={springSnappy} className="absolute inset-0" aria-hidden="true">
                  {/* clip / 装饰放内层：layout 动画期间 projection 独占外层 transform（同 skew 约束） */}
                  <div className="absolute inset-0" style={{ clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)', background: '#1b57ff' }} />
                  <span className="absolute bottom-0 right-3 h-[8px] w-[20px]" style={{ background: '#f0417f', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                </motion.div>
              )}
              <span className={`relative z-10 flex items-center justify-center gap-1.5 transition-colors ${active ? 'text-white' : 'text-[#0a1230]'}`}>
                {item.label}
                {item.badge !== undefined && (
                  <span
                    className="text-2xs leading-none px-1.5 py-0.5"
                    style={{
                      clipPath: 'polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)',
                      background: active ? 'rgba(255,255,255,0.25)' : '#cfeaf6',
                      color: active ? '#fff' : '#0a3bd6',
                    }}
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
  }

  return (
    <div
      role="tablist"
      className={`flex ${
        isP4 ? 'rounded-full bg-[var(--ui-paper)] p-0 overflow-hidden' : 'p-1 rounded-2xl bg-gray-100 dark:bg-gray-800'
      } ${className ?? ''}`}
      style={isP4 ? { boxShadow: '0 2px 0 rgba(19,19,19,0.1)' } : undefined}
    >
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
            className={`relative flex-1 ${isP4 ? '' : 'rounded-xl'} ${sizeClass}`}
          >
            {active && (
              <motion.div
                layoutId={indicatorId}
                transition={springSnappy}
                className="absolute inset-0"
                aria-hidden="true"
              >
                {isP4 ? (
                  // p4-redraw：黑色斜切块（左右各溢出 2px 吃掉胶囊端头的缝）
                  <div
                    className="absolute -inset-x-1 inset-y-0 bg-[#131313]"
                    style={{ transform: 'skewX(-10deg)', borderRadius: 16 }}
                  />
                ) : (
                  <div
                    className="absolute inset-0 bg-primary rounded-xl"
                    style={{ transform: 'skewX(var(--ui-skew-ui))' }}
                  />
                )}
              </motion.div>
            )}
            <span
              className={`relative z-10 flex items-center justify-center gap-1.5 transition-colors ${
                isP4
                  ? active
                    ? 'font-black text-[var(--ui-bg)]'
                    : 'font-black text-[#131313]'
                  : active
                    ? 'text-white font-bold'
                    : 'text-gray-500 dark:text-gray-400 font-semibold'
              }`}
            >
              {isP4 && active && <P4Flower size={13} color="var(--ui-bg)" />}
              {item.label}
              {item.badge !== undefined && (
                <span
                  className={`text-2xs leading-none px-1.5 py-0.5 rounded-full ${
                    isP4
                      ? active
                        ? 'bg-[var(--ui-bg)]/20 text-[var(--ui-bg)]'
                        : 'bg-black/10 text-[#131313]'
                      : active
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
