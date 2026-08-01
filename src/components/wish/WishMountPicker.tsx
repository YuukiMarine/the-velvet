/**
 * 「挂到某个愿望」选择位（PRD_V2.6 §1.3）。
 *
 * 记录活动 / 添加待办 / 黑猫记录卡三处共用。愿望进度（「已完成相关任务 N 次」）
 * 唯一的数据来源就是这里挂上去的 wishId —— 不挂就永远是 0，所以这个控件
 * 必须**在场且好点**，但又不能抢主输入的戏：没有在途愿望时它整个不渲染。
 *
 * 形态：一行横滑筹码。选中态用实心 + 对勾（不靠 opacity 表达状态）。
 */
import { useAppStore } from '@/store';

export function WishMountPicker({
  value,
  onChange,
  compact = false,
}: {
  value?: string;
  onChange: (wishId: string | undefined) => void;
  /** 紧凑态：黑猫卡片里空间小，去掉说明行 */
  compact?: boolean;
}) {
  const wishes = useAppStore(s => s.wishes);
  const active = wishes.filter(w => w.status === 'active' && !w.parentId);
  if (active.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {!compact && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          挂到愿望 <span className="font-normal text-gray-400/70">可不选；挂上后会计入那个愿望的进度</span>
        </div>
      )}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {active.map(w => {
          const on = value === w.id;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onChange(on ? undefined : w.id)}
              aria-pressed={on}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                on
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {on ? '✓ ' : ''}{w.title.length > 12 ? `${w.title.slice(0, 12)}…` : w.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
