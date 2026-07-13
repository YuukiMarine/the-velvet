import { motion } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
import { LongReading } from '@/types';
import { TAROT_BY_ID, PERIOD_LABELS } from '@/constants/tarot';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, slantClip } from '@/components/p3r/kit';

interface Props {
  onOpen: (reading: LongReading) => void;
}

export function ReadingArchive({ onOpen }: Props) {
  const { longReadings } = useAppStore();
  const p3 = useUiChannel() === 'p3';
  const today = toLocalDateKey();

  const active   = longReadings.filter(r => !r.archived && r.expiresAt >= today);
  const archived = longReadings.filter(r => r.archived || r.expiresAt < today);

  if (longReadings.length === 0) {
    // P3R 空态（p3-modal-17 稿 1:1）：青线横贯 + 三重渐隐 ▶ + 点阵 + 双斜杠大标题 + 蓝副文
    if (p3) {
      return (
        <div className="relative flex flex-col items-center pb-12 pt-16">
          <div className="relative flex w-full items-center justify-center">
            <span aria-hidden className="absolute left-[4%] right-[4%] top-1/2 h-[2px] -translate-y-1/2" style={{ background: '#35d1e8' }} />
            <span aria-hidden className="pointer-events-none absolute right-[10%] top-[-34px] h-10 w-14" style={{ backgroundImage: 'radial-gradient(circle, rgba(27,87,255,0.35) 1.5px, transparent 2px)', backgroundSize: '9px 9px' }} />
            <span aria-hidden className="pointer-events-none absolute bottom-[-30px] left-[12%] h-9 w-12" style={{ backgroundImage: 'radial-gradient(circle, rgba(53,209,232,0.4) 1.5px, transparent 2px)', backgroundSize: '9px 9px' }} />
            <span className="relative flex gap-2">
              {[0.9, 0.6, 0.35].map((o, i) => (
                <span key={i} aria-hidden className="h-0 w-0 border-y-[26px] border-l-[36px] border-y-transparent" style={{ borderLeftColor: `rgba(53,209,232,${o})` }} />
              ))}
            </span>
          </div>
          <div className="mt-12 flex items-center gap-3">
            <span aria-hidden className="flex gap-1">
              <span className="h-[14px] w-[11px]" style={{ background: '#35d1e8', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
              <span className="h-[14px] w-[11px]" style={{ background: 'rgba(53,209,232,0.5)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
            </span>
            <span className="text-[20px] font-black" style={{ color: P3R.ink }}>尚未有中长期占卜记录</span>
            <span aria-hidden className="flex gap-1">
              <span className="h-[14px] w-[11px]" style={{ background: 'rgba(53,209,232,0.5)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
              <span className="h-[14px] w-[11px]" style={{ background: '#35d1e8', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
            </span>
          </div>
          <p className="mt-2.5 text-[14px] font-bold" style={{ color: '#4b8fd9' }}>发起一次占卜后，此处会保留全部档案</p>
        </div>
      );
    }
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
          {p3 ? (
            <div className="mb-2.5 flex items-center gap-2">
              <span aria-hidden className="h-[13px] w-[7px]" style={{ background: '#35d1e8', transform: 'skewX(-18deg)' }} />
              <span className="text-[13px] font-black tracking-[0.08em]" style={{ color: P3R.blue }}>活跃 · {active.length} / 2</span>
            </div>
          ) : (
            <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">
              活跃 · {active.length} / 2
            </div>
          )}
          <div className="space-y-2.5">
            {active.map(r => <ReadingRow key={r.id} reading={r} onOpen={onOpen} state="active" p3={p3} />)}
          </div>
        </div>
      )}
      {archived.length > 0 && (
        <div>
          {p3 ? (
            <div className="mb-2.5 flex items-center gap-2">
              <span aria-hidden className="h-[13px] w-[7px]" style={{ background: 'rgba(138,151,173,0.7)', transform: 'skewX(-18deg)' }} />
              <span className="text-[13px] font-black tracking-[0.08em]" style={{ color: P3R.grey }}>归档 · {archived.length}</span>
            </div>
          ) : (
            <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
              归档 · {archived.length}
            </div>
          )}
          <div className="space-y-2.5">
            {archived.map(r => <ReadingRow key={r.id} reading={r} onOpen={onOpen} state="archived" p3={p3} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ReadingRow({
  reading, onOpen, state, p3,
}: {
  reading: LongReading;
  onOpen: (r: LongReading) => void;
  state: 'active' | 'archived';
  p3: boolean;
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
      className={p3
        ? 'relative flex cursor-pointer items-center gap-3 bg-white p-4 transition-transform active:scale-[0.99]'
        : 'relative rounded-2xl bg-black/5 dark:bg-white/5 p-4 flex items-center gap-3 cursor-pointer hover:bg-black/[0.08] dark:hover:bg-white/[0.08] transition-colors'}
      style={p3 ? { clipPath: slantClip(14), boxShadow: '0 8px 22px rgba(7,40,120,.10)' } : undefined}
    >
      {p3 ? (
        <div
          className="flex h-16 w-10 flex-shrink-0 items-center justify-center text-[13px] font-black"
          style={{
            color: P3R.ink,
            background: 'linear-gradient(115deg, transparent 44%, rgba(53,209,232,.4) 44%, rgba(53,209,232,.4) 50%, transparent 50%), linear-gradient(160deg, #daeef8 0%, #c2e3f2 100%)',
            clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
          }}
        >
          {firstCard ? firstCard.roman ?? firstCard.number : '?'}
        </div>
      ) : (
        <div className="w-10 h-16 rounded-md bg-gradient-to-b from-[#1A1530] to-[#0F0A1F] border border-[#D4AF37]/40 flex items-center justify-center text-[#F6E5B5] text-xs flex-shrink-0">
          {firstCard ? firstCard.roman ?? firstCard.number : '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          {p3 ? (
            <>
              <span className="px-2 py-0.5 text-[10px] font-black" style={state === 'active' ? { background: 'rgba(53,209,232,0.22)', color: '#0a7f97', clipPath: slantClip(5) } : { background: 'rgba(138,151,173,0.18)', color: P3R.grey, clipPath: slantClip(5) }}>
                {state === 'active' ? '活跃' : '已归档'}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-black text-white" style={{ background: P3R.blue, clipPath: slantClip(5) }}>{periodLabel}</span>
              {followCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black text-white" style={{ background: P3R.magenta, clipPath: slantClip(5) }}>+{followCount} 追问</span>
              )}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className={p3 ? 'truncate text-sm font-black' : 'text-sm font-bold text-gray-800 dark:text-gray-100 truncate'} style={p3 ? { color: P3R.ink } : undefined}>
          {reading.question}
        </div>
        <div className={p3 ? 'mt-0.5 text-[10px] font-bold' : 'text-[10px] text-gray-400 mt-0.5'} style={p3 ? { color: P3R.grey } : undefined}>
          {created} · 到期 {reading.expiresAt}
        </div>
      </div>
      <div className={p3 ? 'flex-shrink-0 text-xl font-black' : 'text-gray-300 dark:text-gray-600 text-xl flex-shrink-0'} style={p3 ? { color: P3R.blue } : undefined}>›</div>
    </motion.div>
  );
}
