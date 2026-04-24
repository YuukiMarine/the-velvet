import { useRegisterSW } from 'virtual:pwa-register/react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 当 Service Worker 检测到新版本时显示一条底部 Toast，
 * 用户点击"立即更新"后触发 SKIP_WAITING 并重载页面应用新版本。
 *
 * vite.config 用 registerType: 'prompt' 模式。
 *
 * 更新检测策略：**仅在每次打开应用时检测一次**。这里的 "打开" 定义：
 *   - 浏览器：每次新开标签页 / 刷新 / 导航到本站 = 本组件重新挂载 = update() 调用一次
 *   - PWA：每次冷启动（从主屏图标打开已关闭的 PWA）= 同上
 *   - Android APK：用的是 bundle 内资源不走 SW 更新，这段逻辑不受影响
 *
 * 为什么主动调 update() 而不依赖浏览器默认行为：
 *   - 桌面 Chrome / Edge：每次导航都会做 SW 差异检查，我们的手动调用基本是冗余，无副作用
 *   - iOS Safari PWA：**浏览器默认 24 小时才检查一次 SW**；如果用户每天打开数次都在 24h 内，
 *     就会持续用老版本。手动 update() 强制绕过这个 24h 节流
 *   - Firefox / Safari macOS：行为类似桌面 Chrome，手动调用是安全兜底
 *
 * 不再做后台轮询 / visibilitychange 监听 —— 半小时频率对电量和流量不友好，
 * 且"每次打开检测"已覆盖常见使用路径。
 */
export function PWAUpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // 启动时主动跑一次：覆盖 iOS PWA 的 24h 节流 + 对其他平台也是 harmless 的二次确认
      registration.update().catch(() => { /* 网络失败静默，下次打开还有机会 */ });
    },
  });

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
