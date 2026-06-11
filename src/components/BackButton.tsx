/**
 * BackButton —— 全站统一返回键（UI_AUDIT_V2.5.md §4.6 交互协议 / §5 共享原语）。
 *
 * 收编审计 §3.5 的「返回键 4 样式 3 去向」：统一视觉（w-9 h-9 圆角方块 + ‹ 雪佛龙）、
 * 统一按压反馈（whileTap 0.95 + triggerNavFeedback 音效/震动），去向由调用方传入
 * （宫格子页一律 onClick={() => setCurrentPage('menu')}，与硬件返回同走菜单）。
 *
 * 只管「层级回退」语义（‹）；销毁/关闭语义（✕）不归这里。
 */
import { motion } from 'motion/react';
import { triggerNavFeedback } from '@/utils/feedback';

interface BackButtonProps {
  /** 返回去向（调用方决定，如 () => setCurrentPage('menu')） */
  onClick: () => void;
  /** 无障碍标签，默认「返回」 */
  label?: string;
  className?: string;
}

export const BackButton = ({ onClick, label = '返回', className }: BackButtonProps) => (
  <motion.button
    type="button"
    whileTap={{ scale: 0.95 }}
    onClick={() => {
      triggerNavFeedback();
      onClick();
    }}
    aria-label={label}
    className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition${className ? ` ${className}` : ''}`}
  >
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  </motion.button>
);
