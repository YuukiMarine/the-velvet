import { motion, AnimatePresence } from 'framer-motion';
import type { SyncDiff } from '@/services/sync';

/** 中文表名映射（只展示有差异的条目） */
const TABLE_LABELS: Record<string, string> = {
  users: '用户档案',
  attributes: '五维属性',
  activities: '成长记录',
  achievements: '成就',
  skills: '技能',
  dailyEvents: '旧版每日事件',
  dailyDivinations: '每日塔罗',
  longReadings: '中长期塔罗',
  settings: '设置',
  todos: '任务',
  todoCompletions: '任务完成',
  summaries: '周/月总结',
  weeklyGoals: '本周目标',
  personas: 'Persona',
  shadows: 'Shadow',
  battleStates: '战斗状态',
  confidants: '同伴',
  confidantEvents: '同伴事件',
};

interface Props {
  isOpen: boolean;
  diff: SyncDiff | null;
  onKeepLocal: () => Promise<void> | void;
  onKeepCloud: () => Promise<void> | void;
  onDismiss: () => void;
}

function formatTimestamp(d: Date | null): string {
  if (!d) return '—';
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function SyncDiffDialog({ isOpen, diff, onKeepLocal, onKeepCloud, onDismiss }: Props) {
  if (!isOpen || !diff) return null;
  const changed = diff.tables.filter(t => t.diff !== 0);
  const isConsistent = !diff.hasDiff;
  const isMinor = diff.hasDiff && !diff.significant;

  const headline = isConsistent
    ? '本地与云端数据一致'
    : isMinor
    ? '存在小幅差异，不会自动覆盖'
    : '本地与云端存在较大差异';
  const subline = isConsistent
    ? '所有同步表的条目数量相同，可放心跳过。'
    : isMinor
    ? '差距较小，通常是最近几条增减；如需同步请手动选择方向。'
    : '为避免误覆盖，请参考时间戳与条目差后确认同步方向。';
  const iconBg = isConsistent
    ? { bg: 'rgba(16,185,129,0.15)', color: '#059669', glyph: '✓' }
    : isMinor
    ? { bg: 'rgba(59,130,246,0.15)', color: '#2563eb', glyph: 'ⓘ' }
    : { bg: 'rgba(245,158,11,0.15)', color: '#d97706', glyph: '⚠' };

  const recommendLabel = diff.recommend === 'push'
    ? '本地记录更多 → 可选择推送到云端'
    : diff.recommend === 'pull'
    ? '云端记录更多 → 可选择拉取到本地'
    : '两侧记录总数相同';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[170] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="w-full max-w-md max-h-[88vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-3xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-6 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                   style={{ background: iconBg.bg, color: iconBg.color }}>
                {iconBg.glyph}
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {headline}
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {subline}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard
                label="本地"
                total={diff.localTotal}
                accent="#3B82F6"
                latest={diff.localLatest}
              />
              <SummaryCard
                label="云端"
                total={diff.cloudTotal}
                accent="#10B981"
                latest={diff.cloudLatest}
              />
            </div>

            {!isConsistent && (
              <div className={`p-3 rounded-xl text-xs ${
                isMinor
                  ? 'bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300'
                  : 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300'
              }`}>
                {recommendLabel}
              </div>
            )}

            {/* 差异明细 */}
            {changed.length > 0 && (
              <div className="space-y-1 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-[10px] font-bold tracking-widest text-gray-500 dark:text-gray-400">
                  条目差异（按云端 - 本地）
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {changed.map(t => {
                    const label = TABLE_LABELS[t.key] || t.key;
                    const sign = t.diff > 0 ? '+' : '';
                    const colorClass = t.diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
                    return (
                      <div key={t.key} className="px-3 py-2 flex items-center gap-3 text-xs">
                        <span className="flex-1 text-gray-700 dark:text-gray-200 font-medium">{label}</span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400 text-[11px]">
                          本地 {t.localCount}
                        </span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400 text-[11px]">
                          云端 {t.cloudCount}
                        </span>
                        <span className={`tabular-nums font-bold ${colorClass} w-10 text-right`}>
                          {sign}{t.diff}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
              自动同步已改为每 24 小时至多一次；若差异明显会弹出本窗口确认，不再静默全量覆盖。
            </p>

            {isConsistent ? (
              <button
                onClick={onDismiss}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                知道了
              </button>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => void onKeepCloud()}
                    className="py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-sm font-bold"
                  >
                    用云端覆盖本地
                  </button>
                  <button
                    onClick={() => void onKeepLocal()}
                    className="py-2.5 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300 text-sm font-bold"
                  >
                    用本地覆盖云端
                  </button>
                </div>
                <button
                  onClick={onDismiss}
                  className="w-full py-2 rounded-xl text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  暂不处理
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SummaryCard({ label, total, accent, latest }: { label: string; total: number; accent: string; latest: Date | null }) {
  return (
    <div
      className="p-3 rounded-xl border"
      style={{ borderColor: `${accent}44`, background: `${accent}08` }}
    >
      <div className="text-[10px] font-bold tracking-widest" style={{ color: accent }}>
        {label}
      </div>
      <div className="text-2xl font-black tabular-nums mt-0.5" style={{ color: accent }}>
        {total}
      </div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400">
        条目总数
      </div>
      <div className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400 truncate">
        最新：<span className="font-semibold text-gray-700 dark:text-gray-300">{formatTimestamp(latest)}</span>
      </div>
    </div>
  );
}
