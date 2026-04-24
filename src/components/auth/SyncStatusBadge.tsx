import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useCloudStore } from '@/store/cloud';

/**
 * 浮动的同步状态徽章。
 * 仅在已登录时呈现，会在以下状态显示：
 *  - syncing：持续显示（紫色 + 转圈）
 *  - success：显示约 2.8 秒后淡出（绿色 + 对勾 + 方向文案）
 *  - error  ：持续显示，直到下次操作（红色 + 警告）
 */
export const SyncStatusBadge = () => {
  const cloudEnabled = useCloudStore(s => s.cloudEnabled);
  const cloudUser = useCloudStore(s => s.cloudUser);
  const status = useCloudStore(s => s.syncStatus);
  const direction = useCloudStore(s => s.lastSyncDirection);
  const error = useCloudStore(s => s.lastError);

  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (status !== 'success') return;
    setShowSuccess(true);
    const t = setTimeout(() => setShowSuccess(false), 2800);
    return () => clearTimeout(t);
  }, [status]);

  if (!cloudEnabled || !cloudUser) return null;

  const visible =
    status === 'syncing' || status === 'error' || (status === 'success' && showSuccess);
  if (!visible) return null;

  const variants: Record<'syncing' | 'success' | 'error', { bg: string; icon: React.ReactNode; label: string }> = {
    syncing: {
      bg: 'rgba(124,58,237,0.95)',
      icon: (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full"
        />
      ),
      label: direction === 'pull' ? '拉取中…' : direction === 'push' ? '上传中…' : '同步中…',
    },
    success: {
      bg: 'rgba(34,197,94,0.95)',
      icon: <span className="text-sm leading-none">✓</span>,
      label: direction === 'pull' ? '已从云端拉取' : '已同步到云端',
    },
    error: {
      bg: 'rgba(239,68,68,0.95)',
      icon: <span className="text-sm leading-none">⚠</span>,
      label: '同步失败',
    },
  };

  const v = variants[status as 'syncing' | 'success' | 'error'];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${status}-${direction ?? ''}`}
        initial={{ opacity: 0, y: 12, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        className="fixed bottom-24 md:bottom-6 right-4 z-[80] pointer-events-none"
      >
        <div
          className="px-4 py-2.5 rounded-full flex items-center gap-2.5 text-sm font-medium text-white shadow-xl backdrop-blur-sm"
          style={{ background: v.bg, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}
          title={status === 'error' ? (error ?? undefined) : undefined}
        >
          {v.icon}
          <span>{v.label}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
