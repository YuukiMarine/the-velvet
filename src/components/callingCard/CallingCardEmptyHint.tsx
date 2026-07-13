import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

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
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-white/80 bg-white/70 px-3 py-2 text-[11px] text-gray-800 shadow-sm dark:border-gray-700/80 dark:bg-gray-900/70 dark:text-gray-100"
      >
        {/* 主体与关闭拆成两个并列 button，不再嵌套（嵌套 button 导致 × 点不动） */}
        <button type="button" onClick={handleClick} className="flex flex-1 items-center gap-2 text-left transition-opacity hover:opacity-80">
          <span className="text-xs text-primary">✦</span>
          <span className="flex-1">为重要的事写一张「宣告卡」，倒计时随时在此映入眼帘</span>
        </button>
        <button
          type="button"
          aria-label="不再提示"
          onClick={handleDismiss}
          className="shrink-0 px-1.5 py-0.5 text-base leading-none text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >×</button>
      </motion.div>
    </AnimatePresence>
  );
}
