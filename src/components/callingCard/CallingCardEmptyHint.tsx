import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STORAGE_KEY = 'velvet_cc_hint_dismissed';

interface Props {
  onJump: () => void;
}

/**
 * D5：从未建过宣告卡的用户在 Dashboard 上看到的极淡引导条。
 *
 * 行为：
 *   - localStorage 持久化"已点过"标记，永久不再显示
 *   - 即便没点击，这个组件也只在"callingCards.length === 0"时渲染，
 *     一旦用户建了第一张卡就自然消失
 *   - 视觉上保持低存在感，不是模态、不抢注意力
 */
export function CallingCardEmptyHint({ onJump }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  if (dismissed) return null;

  const handleClick = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* 隐私模式忽略 */ }
    onJump();
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      <motion.button
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        onClick={handleClick}
        className="w-full text-left rounded-xl px-3 py-2 flex items-center gap-2 text-[11px] bg-white/70 dark:bg-gray-900/70 border border-dashed border-white/80 dark:border-gray-700/80 text-gray-800 dark:text-gray-100 hover:bg-white/85 dark:hover:bg-gray-900 transition-colors shadow-sm"
      >
        <span className="text-xs text-primary">✦</span>
        <span className="flex-1">为重要的事写一张「宣告卡」，倒计时随时在此映入眼帘</span>
        <span
          role="button"
          aria-label="不再提示"
          onClick={handleDismiss}
          className="text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-1 -mr-1"
        >×</span>
      </motion.button>
    </AnimatePresence>
  );
}
