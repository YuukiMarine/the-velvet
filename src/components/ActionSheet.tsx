/**
 * ActionSheet — 长按上下文菜单的统一承载（UI_AUDIT_V2.5.md §4.6 交互协议：
 * 「长按一律=唤出上下文菜单，菜单内再分编辑/删除」）。
 *
 * 这是协议的过渡形态：基于 SheetModal 的底部动作单。斜界系统的最终形态是
 * 「指下绽放扇形菜单」（UI_DESIGN_BOLD_V2.5.md §4.4），届时本组件的调用面
 * 不变（actions 数组直接复用），只换呈现层。
 *
 * 协议约束（调用方无须重复实现）：
 *   - danger 动作恒红、恒在列表最末（组件内部排序兜底）；
 *   - 点任意动作后自动关闭；取消按钮常驻最底部。
 */
import type { ReactNode } from 'react';
import { SheetModal } from '@/components/SheetModal';

export interface ActionSheetAction {
  label: string;
  icon?: ReactNode;
  /** danger 恒红且恒排最末 */
  tone?: 'default' | 'danger';
  onClick: () => void;
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** 顶部小标题（如被长按对象的名称），可省 */
  title?: string;
  actions: ActionSheetAction[];
}

export const ActionSheet = ({ isOpen, onClose, title, actions }: ActionSheetProps) => {
  // danger 兜底排到最末：协议要求危险操作离手指起点最远
  const sorted = [...actions].sort(
    (a, b) => Number(a.tone === 'danger') - Number(b.tone === 'danger'),
  );

  return (
    <SheetModal isOpen={isOpen} onClose={onClose} position="bottom" showHandle>
      <div className="px-4 pb-2">
        {title && (
          <p className="px-1 pb-2 text-2xs uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500 truncate">
            {title}
          </p>
        )}
        <div className="space-y-1.5">
          {sorted.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                onClose();
                action.onClick();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-left transition-colors ${
                action.tone === 'danger'
                  ? 'text-red-500 bg-red-50 dark:bg-red-900/15 hover:bg-red-100 dark:hover:bg-red-900/30'
                  : 'text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {action.icon && <span className="flex-shrink-0">{action.icon}</span>}
              {action.label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full mt-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/60"
        >
          取消
        </button>
      </div>
    </SheetModal>
  );
};
