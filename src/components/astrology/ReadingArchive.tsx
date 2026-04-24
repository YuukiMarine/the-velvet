import { motion } from 'framer-motion';
import { useAppStore, toLocalDateKey } from '@/store';
import { LongReading } from '@/types';
import { TAROT_BY_ID, PERIOD_LABELS } from '@/constants/tarot';

interface Props {
  onOpen: (reading: LongReading) => void;
}

export function ReadingArchive({ onOpen }: Props) {
  const { longReadings } = useAppStore();
  const today = toLocalDateKey();

  const active   = longReadings.filter(r => !r.archived && r.expiresAt >= today);
  const archived = longReadings.filter(r => r.archived || r.expiresAt < today);

  if (longReadings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
        <div className="text-5xl mb-3">🔮</div>
        <div className="text-sm">尚未有中长期占卜记录</div>
        <div className="text-xs mt-1 opacity-70">发起一次占卜后，此处会保留全部档案</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {active.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">
            活跃 · {active.length} / 2
          </div>
          <div className="space-y-2">
            {active.map(r => <ReadingRow key={r.id} reading={r} onOpen={onOpen} state="active" />)}
          </div>
        </div>
      )}
      {archived.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
            归档 · {archived.length}
          </div>
          <div className="space-y-2">
            {archived.map(r => <ReadingRow key={r.id} reading={r} onOpen={onOpen} state="archived" />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadingRow({
  reading, onOpen, state,
}: {
  reading: LongReading;
  onOpen: (r: LongReading) => void;
  state: 'active' | 'archived';
}) {
  const firstCard = TAROT_BY_ID[reading.picked[0]?.cardId];
  const created = new Date(reading.createdAt).toLocaleDateString('zh-CN');
  const periodLabel = PERIOD_LABELS[reading.period].label;
  const followCount = reading.followUps?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpen(reading)}
      className="relative rounded-2xl bg-black/5 dark:bg-white/5 p-4 flex items-center gap-3 cursor-pointer hover:bg-black/8 dark:hover:bg-white/8 transition-colors"
    >
      <div className="w-10 h-16 rounded-md bg-gradient-to-b from-[#1A1530] to-[#0F0A1F] border border-[#D4AF37]/40 flex items-center justify-center text-[#F6E5B5] text-xs flex-shrink-0">
        {firstCard ? firstCard.roman ?? firstCard.number : '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
            state === 'active'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
          }`}>
            {state === 'active' ? '活跃' : '已归档'}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary">
            {periodLabel}
          </span>
          {followCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-bold">
              +{followCount} 追问
            </span>
          )}
        </div>
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{reading.question}</div>
        <div className="text-[10px] text-gray-400 mt-0.5">{created} · 到期 {reading.expiresAt}</div>
      </div>
      <div className="text-gray-300 dark:text-gray-600 text-xl flex-shrink-0">›</div>
    </motion.div>
  );
}
