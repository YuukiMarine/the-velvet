/**
 * 谏言归档库：浏览过往被归档的 100 字摘要
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import { TAROT_BY_ID } from '@/constants/tarot';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CounselArchiveModal({ isOpen, onClose }: Props) {
  const { counselArchives, confidants, deleteCounselArchive } = useAppStore();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...counselArchives].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [counselArchives]
  );

  if (!isOpen) return null;

  const confidantById = (id: string) => confidants.find(c => c.id === id);

  const formatDate = (d: Date | string) => {
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="archive-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[180] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="archive-modal"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[86vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          <div
            className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.04))',
            }}
          >
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="text-indigo-500">✧</span>
                谏言归档库
              </h3>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {sorted.length} 次被你亲手存下的谈话
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center"
              aria-label="关闭"
            >✕</button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {sorted.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-5xl opacity-30 mb-3">✧</div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  归档库还是空的。<br />
                  聊完之后点"归档"，这次谈话的摘要会留在这里。
                </p>
              </div>
            ) : (
              sorted.map(a => {
                const mentioned = a.mentionedConfidantIds
                  .map(confidantById)
                  .filter(Boolean);
                return (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className="p-3.5 rounded-2xl border border-gray-100 dark:border-gray-700/50 bg-white dark:bg-gray-800/40"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-[10px] font-bold tracking-widest text-gray-400">
                        {formatDate(a.createdAt)} · {a.messageCount} 条
                      </div>
                      <button
                        onClick={() => setConfirmId(a.id)}
                        className="text-[10px] text-rose-400 hover:text-rose-500 px-1.5 py-0.5 rounded transition-colors"
                      >
                        删除
                      </button>
                    </div>
                    {mentioned.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {mentioned.map(c => c && (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{
                              background: `${TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1'}18`,
                              color: TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1',
                            }}
                          >
                            @{c.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[13px] text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                      {a.summary}
                    </p>
                  </motion.div>
                );
              })
            )}
          </div>

          <AnimatePresence>
            {confirmId && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
                onClick={() => setConfirmId(null)}
              >
                <motion.div
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.96, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-xs rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-5"
                >
                  <h4 className="text-base font-bold text-gray-900 dark:text-white mb-2">删除这条归档？</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    删除后不可恢复。
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => setConfirmId(null)}
                      className="py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    >
                      再想想
                    </button>
                    <button
                      onClick={async () => {
                        await deleteCounselArchive(confirmId);
                        setConfirmId(null);
                      }}
                      className="py-2 rounded-xl text-sm font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)' }}
                    >
                      删除
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
