import { useRegisterSW } from 'virtual:pwa-register/react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 当 Service Worker 检测到新版本时显示一条底部 Toast，
 * 用户点击"立即更新"后重载页面应用新版本。
 * autoUpdate 模式下 SW 已在后台静默替换，此 Toast 只是提示用户刷新。
 */
export function PWAUpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22 }}
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto"
        >
          <div className="flex items-center gap-3 bg-gray-900/95 dark:bg-gray-100/95 text-white dark:text-gray-900 text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl backdrop-blur-sm whitespace-nowrap">
            <span>✦ 有新版本可用</span>
            <button
              onClick={() => updateServiceWorker(true)}
              className="bg-white/20 dark:bg-black/15 hover:bg-white/30 dark:hover:bg-black/25 px-3 py-1 rounded-xl text-xs transition-colors"
            >
              立即更新
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
