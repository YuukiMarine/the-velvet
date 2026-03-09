import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { AttributeId } from '@/types';

interface CounterflowEntry {
  attribute: AttributeId;
  attrName: string;
  penalty: number;
}

interface CounterflowModalProps {
  isOpen: boolean;
  entries: CounterflowEntry[];
  onClose: () => void;
}

export const CounterflowModal = ({ isOpen, entries, onClose }: CounterflowModalProps) => {
  const [drops, setDrops] = useState<Array<{ id: number; x: number; delay: number }>>([]);

  useEffect(() => {
    if (isOpen) {
      setDrops(
        Array.from({ length: 20 }, (_, i) => ({
          id: i,
          x: Math.random() * 100,
          delay: Math.random() * 1.2,
        }))
      );
      const t = setTimeout(onClose, 6000);
      return () => clearTimeout(t);
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
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          {/* Rain drops */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {drops.map(d => (
              <motion.div
                key={d.id}
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: '110vh', opacity: [0, 0.6, 0.6, 0] }}
                transition={{ duration: 2.5, delay: d.delay, ease: 'linear', repeat: Infinity }}
                className="absolute w-0.5 h-8 bg-gradient-to-b from-transparent via-blue-400/60 to-blue-300/30 rounded-full"
                style={{ left: `${d.x}%` }}
              />
            ))}
          </div>

          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            className="relative bg-gradient-to-b from-slate-900 to-gray-900 border border-slate-700/60 rounded-3xl p-6 max-w-sm w-full shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Subtle inner glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />

            <div className="relative text-center mb-5">
              <motion.div
                initial={{ scale: 0, rotate: 20 }}
                animate={{ scale: [0, 1.3, 1], rotate: 0 }}
                transition={{ duration: 0.6, delay: 0.1, type: 'spring' }}
                className="text-5xl mb-3 inline-block"
              >
                🌊
              </motion.div>
              <motion.h3
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="text-lg font-bold text-white"
              >
                逆流警告
              </motion.h3>
              <motion.p
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.38 }}
                className="text-sm text-slate-400 mt-1"
              >
                长时间未增长的属性已被扣除点数
              </motion.p>
            </div>

            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="space-y-2 mb-5"
            >
              {entries.map((entry, i) => (
                <motion.div
                  key={entry.attribute}
                  initial={{ x: -12, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/50"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-white">{entry.attrName}</span>
                  </div>
                  <span className="text-sm font-bold text-red-400 tabular-nums">−{entry.penalty}</span>
                </motion.div>
              ))}
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-center text-xs text-slate-500 mb-4"
            >
              持续记录成长，对抗逆流的侵蚀
            </motion.p>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition-colors"
            >
              我知道了
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
