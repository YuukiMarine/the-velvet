/**
 * EmptyState — 行动域统一空状态（UI_AUDIT_V2.5.md §3.2：收敛 5 处 3 种空状态）。
 *
 * 替换对象（三种各写各的）：
 *   - Todos.tsx:1306-1308   纯文案 py-8（「还没有任务…」）
 *   - Todos.tsx:1531-1533   纯文案 py-8（「归档区暂无内容」）
 *   - Activities.tsx:395    纯文案 py-3（「这天暂无记录」）
 *   - Activities.tsx:965-968 卡片容器 p-12 + 📭 大 emoji + 文案
 *   - （另一处过滤结果为空的变体，同收敛于此）
 *
 * 统一制式与约束：
 *   - py-10 垂直留白、整体居中；不自带卡片底——空状态是"内容的缺席"，
 *     容器（卡片/区块）由调用方决定，避免空状态自己长出一层视觉；
 *   - icon 大号灰（text-4xl + gray-300/600）：emoji 或 SVG 均可，SVG 走
 *     currentColor 继承灰色；装饰性，aria-hidden；
 *   - text 主文案 text-sm gray-400/500；hint 辅助文案 text-2xs（字号阶梯
 *     最低档，见 tailwind.config §4.1）再降一级灰；
 *   - action 是 text-primary 文字按钮（空状态的 CTA 要轻，实心按钮会比
 *     周围真实内容还重）。
 */
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TAP } from '@/utils/motion';

export interface EmptyStateProps {
  /** 大号灰图标：emoji 字符或 SVG 节点（SVG 用 currentColor 自动继承灰色） */
  icon?: ReactNode;
  /** 主文案（必传）：说明"这里为什么是空的" */
  text: string;
  /** 辅助文案：下一步提示，如「点击右下角 + 开始记录」 */
  hint?: string;
  /** 文字按钮 CTA：能直接发起"填充内容"的动作时传入 */
  action?: { label: string; onClick: () => void };
}

export const EmptyState = ({ icon, text, hint, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-10 text-center">
    {icon !== undefined && (
      <div aria-hidden="true" className="text-4xl text-gray-300 dark:text-gray-600 mb-3">
        {icon}
      </div>
    )}
    <p className="text-sm text-gray-400 dark:text-gray-500">{text}</p>
    {hint !== undefined && (
      <p className="text-2xs text-gray-300 dark:text-gray-600 mt-1">{hint}</p>
    )}
    {action !== undefined && (
      <motion.button
        type="button"
        whileTap={TAP}
        onClick={action.onClick}
        className="mt-3 text-sm font-semibold text-primary"
      >
        {action.label}
      </motion.button>
    )}
  </div>
);
