import { motion, AnimatePresence } from 'framer-motion';
import { StatusEffect } from '@/types';
import { STATUS_LABELS } from '@/constants';

interface Props {
  effects: StatusEffect[];
  /** Affects tint: player=蓝/紫，shadow=红 */
  side: 'player' | 'shadow';
}

export function StatusBar({ effects, side }: Props) {
  if (effects.length === 0) return null;
  const tint = side === 'player' ? 'rgba(139,92,246,0.3)' : 'rgba(239,68,68,0.3)';
  const border = side === 'player' ? 'rgba(139,92,246,0.5)' : 'rgba(239,68,68,0.5)';
  const color = side === 'player' ? '#c4b5fd' : '#fca5a5';

  return (
    <div className="flex flex-wrap gap-1 items-center">
      <AnimatePresence>
        {effects.map((eff, idx) => {
          const meta = STATUS_LABELS[eff.kind];
          const stackTag = eff.stacks > 1 ? `×${eff.stacks}` : '';
          return (
            <motion.span
              key={`${eff.kind}-${idx}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
              style={{
                background: tint,
                color,
                border: `1px solid ${border}`,
                lineHeight: 1.2,
              }}
              title={eff.sourceName ? `${meta.label} · 来自 ${eff.sourceName}` : meta.label}
            >
              {meta.icon} {meta.label}{stackTag}
              <span className="ml-0.5 opacity-60">({eff.remainingTurns})</span>
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
