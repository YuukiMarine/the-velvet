/**
 * DotIndicator — 横滑页位指示器（UI_AUDIT_V2.5.md §5 共享原语）。
 *
 * 激活点拉长为胶囊（w-2.5 h-1），未激活为圆点；transition-all 让两态互变时
 * 宽度与颜色一起滑过去。可交互与纯展示两形态：
 *   - 有 onSelect：每个点是 button，外包 24px 固定命中框（护栏「命中区与视觉解耦」——
 *     视觉点只有 4px，命中框不许跟着缩）；
 *   - 无 onSelect：纯装饰 aria-hidden，当前页信息由 sr-only 文本兜底。
 * 两形态共用同一尺寸的包裹框，保证切换形态不跳版。
 */
interface DotIndicatorProps {
  count: number;
  activeIndex: number;
  /** 传入即变为可点击跳页形态 */
  onSelect?: (index: number) => void;
  className?: string;
}

export const DotIndicator = ({ count, activeIndex, onSelect, className }: DotIndicatorProps) => {
  if (count <= 0) return null;

  const dotClass = (active: boolean) =>
    `rounded-full transition-all duration-200 ${
      active ? 'w-2.5 h-1 bg-primary' : 'w-1 h-1 bg-gray-300 dark:bg-gray-600'
    }`;

  return (
    <div className={`flex items-center justify-center ${className ?? ''}`}>
      {Array.from({ length: count }, (_, i) =>
        onSelect ? (
          <button
            key={i}
            type="button"
            aria-label={`第 ${i + 1} 页`}
            aria-current={i === activeIndex || undefined}
            onClick={() => onSelect(i)}
            className="flex h-6 w-6 items-center justify-center"
          >
            <span className={dotClass(i === activeIndex)} />
          </button>
        ) : (
          <span key={i} aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
            <span className={dotClass(i === activeIndex)} />
          </span>
        )
      )}
      {!onSelect && (
        <span className="sr-only">{`第 ${activeIndex + 1} 页，共 ${count} 页`}</span>
      )}
    </div>
  );
};
