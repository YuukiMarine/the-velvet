import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { AttributeId } from '@/types';
import { triggerSuccessFeedback } from '@/utils/feedback';
import { ATTR_IDS } from './weeklyGoalShared';

// ── CelebrationModal ────────────────────────────────────────────────────────
export const CelebrationModal = ({
  isOpen,
  onClose,
  settings,
  attributes,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  settings: ReturnType<typeof useAppStore.getState>['settings'];
  attributes: ReturnType<typeof useAppStore.getState>['attributes'];
  onConfirm: (attr: AttributeId) => void;
}) => {
  const [selectedAttr, setSelectedAttr] = useState<AttributeId | null>(null);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number; color: string }>>([]);
  const playedRef = useRef(false);

  const CONFETTI_COLORS = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'];

  useEffect(() => {
    if (isOpen) {
      setSelectedAttr(null);
      if (!playedRef.current) {
        triggerSuccessFeedback();
        playedRef.current = true;
      }
      setParticles(
        Array.from({ length: 40 }, (_, i) => ({
          id: i,
          x: (Math.random() - 0.5) * 280,
          y: (Math.random() - 0.5) * 260,
          delay: Math.random() * 0.6,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        }))
      );
    } else {
      playedRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 18, stiffness: 280 }}
            className="relative bg-gradient-to-b from-amber-50 via-white to-white dark:from-gray-800 dark:via-gray-900 dark:to-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Particle burst */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {particles.map(p => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], x: p.x, y: p.y }}
                  transition={{ duration: 1.2, delay: p.delay, ease: 'easeOut' }}
                  className="absolute w-2.5 h-2.5 rounded-full"
                  style={{ left: '50%', top: '40%', backgroundColor: p.color }}
                />
              ))}
            </div>

            {/* Header */}
            <div className="relative text-center mb-5">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: [0, 1.4, 1], rotate: 0 }}
                transition={{ duration: 0.6, delay: 0.1, type: 'spring' }}
                className="text-5xl mb-3 inline-block"
              >
                🏆
              </motion.div>
              <motion.h3
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="text-xl font-bold text-gray-900 dark:text-white"
              >
                本周目标达成！
              </motion.h3>
              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.4 }}
                className="text-sm text-gray-500 dark:text-gray-400 mt-1"
              >
                选择这周最用力的方向，领取奖励
              </motion.p>
            </div>

            {/* Attribute selection */}
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="space-y-2 mb-5"
            >
              {ATTR_IDS.map(id => {
                const selected = selectedAttr === id;
                const attrName = settings.attributeNames[id];
                const attr = attributes.find(a => a.id === id);
                const pts = (attr && attr.level >= 3) ? 7 : 5;
                return (
                  <motion.button
                    key={id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedAttr(id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                      selected
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${
                        selected ? 'border-amber-400 bg-amber-400' : 'border-gray-300 dark:border-gray-600'
                      }`} />
                      <span className={`text-sm font-semibold ${selected ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>
                        {attrName}
                      </span>
                    </div>
                    <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-lg ${
                      selected ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300' : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      +{pts} 点
                    </span>
                  </motion.button>
                );
              })}
            </motion.div>

            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="flex gap-2"
            >
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-medium"
              >
                取消
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => selectedAttr && onConfirm(selectedAttr)}
                disabled={!selectedAttr}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold shadow-md shadow-amber-500/30 disabled:opacity-40 disabled:shadow-none"
              >
                领取奖励 ✨
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
