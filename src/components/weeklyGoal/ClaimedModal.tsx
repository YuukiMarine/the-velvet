import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

// ── ClaimedModal — reward confirmation ──────────────────────────────────────
export const ClaimedModal = ({
  data,
  onClose,
}: {
  data: { attrName: string; pts: number } | null;
  onClose: () => void;
}) => {
  const [rings, setRings] = useState<Array<{ id: number; delay: number }>>([]);

  useEffect(() => {
    if (data) {
      setRings(Array.from({ length: 5 }, (_, i) => ({ id: i, delay: i * 0.12 })));
      const t = setTimeout(onClose, 2600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
            className="relative flex flex-col items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Expanding rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {rings.map(r => (
                <motion.div
                  key={r.id}
                  initial={{ scale: 0.3, opacity: 0.8 }}
                  animate={{ scale: 3.5, opacity: 0 }}
                  transition={{ duration: 1.0, delay: r.delay, ease: 'easeOut' }}
                  className="absolute w-24 h-24 rounded-full border-4 border-amber-400"
                />
              ))}
            </div>

            {/* Center content */}
            <div className="relative bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl px-10 py-8 shadow-2xl shadow-amber-500/40 flex flex-col items-center gap-3">
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: [0, 1.3, 1], rotate: 0 }}
                transition={{ duration: 0.5, type: 'spring', delay: 0.1 }}
                className="text-5xl"
              >
                ✨
              </motion.div>
              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-white font-bold text-xl tracking-wide"
              >
                奖励已领取！
              </motion.p>
              <motion.p
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45 }}
                className="text-white/90 text-base font-semibold"
              >
                {data.attrName} <span className="text-2xl font-black">+{data.pts}</span>
              </motion.p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
