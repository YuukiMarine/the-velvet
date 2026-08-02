/**
 * 回归面板 —— 「欢迎回来」（PRD_V2.6 §12）。
 *
 * 【这个界面最容易做错的地方】
 * 一个 7 天以上没回来的人，大概率是忙崩了、倦了、或者正经历些什么。
 * 在他重新打开 App 的第一秒甩一张**画满空格的日历**给他，等于把他的缺席
 * 可视化成一堵洞——那不是邀请，是成绩单。很多人会当场退出去。
 *
 * 所以这里的第一屏**没有日历**：只有一句带真实数据的欢迎，和一个「我回来了」。
 * 补记是**第二层、且必须由用户主动点进去**。绝大多数回归用户只想安静地回来，
 * 这条默认路径必须是最短的那条。
 *
 * 【两档】
 *   · recent（7–14 天）：可选逐日补记，也可以只用一句话概括；
 *   · distant（14 天以上）：只给一句话。半个月前的事逐日回忆就是在编故事，
 *     给日历等于诱导用户往自己的成长记录里灌水。
 *
 * 外壳走 SheetModal（四频道皮齐全，红线：弹窗只组合三基座）。
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import type { BackfillEntry, ReturnPayload } from '@/types';
import { SheetModal } from '@/components/SheetModal';
import { BufferedTextInput } from '@/components/ui/BufferedTextInput';
import { ReturnBackfillCalendar } from './ReturnBackfillCalendar';
import { triggerSuccessFeedback } from '@/utils/feedback';

/**
 * 那句带数据的欢迎语。挑一条能用真实数字填满的——
 * 「欢迎回来」四个字本身没有分量，分量来自它后面跟着的那个数。
 */
function welcomeLine(p: ReturnPayload): string {
  const attr = p.topAttribute;
  if (attr) {
    return `你不在的 ${p.daysAway} 天里，流转的岁月并没有削减你的${attr.name}——它仍然是 Lv.${attr.level}。`;
  }
  if (p.totalRecords > 0) {
    return `${p.daysAway} 天过去了。房间里那 ${p.totalRecords} 条记录，一条都没有少。`;
  }
  return `${p.daysAway} 天过去了。灯一直亮着。`;
}

type Mode = 'welcome' | 'calendar' | 'summary';

export function ReturnPanel({ payload, onClose }: { payload: ReturnPayload | null; onClose: () => void }) {
  const commitReturn = useAppStore(s => s.commitReturn);
  const [mode, setMode] = useState<Mode>('welcome');
  const [entries, setEntries] = useState<BackfillEntry[]>([]);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  const line = useMemo(() => (payload ? welcomeLine(payload) : ''), [payload]);

  const finish = async () => {
    if (!payload || busy) return;
    setBusy(true);
    try {
      await commitReturn(payload, entries, mode === 'summary' ? summary : undefined);
      triggerSuccessFeedback();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetModal
      isOpen={!!payload}
      onClose={onClose}
      position="center"
      title="欢迎回来"
      busy={busy}
      footer={
        <button
          type="button"
          onClick={() => void finish()}
          disabled={busy}
          className="w-full rounded-2xl bg-primary py-3.5 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? '…' : '我回来了'}
        </button>
      }
    >
      {payload && (
        <div className="space-y-4">
          {/* ── 第一屏：一句带数据的欢迎 ── */}
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-[15px] font-bold leading-relaxed text-gray-800 dark:text-gray-100"
          >
            {line}
          </motion.p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500">
            <span>上次来是 {payload.lastSeenKey}</span>
            <span>·</span>
            <span>这是第 {payload.returnCount} 次回来</span>
          </div>

          {/* ── 可选的第二层。刻意做成"次要"：默认路径是直接按「我回来了」 ── */}
          {mode === 'welcome' && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                {payload.tier === 'recent'
                  ? '想补上这几天也行，不补也行——空着的日子也是日子。'
                  : '隔了有一阵子了。逐日回忆多半不准，不如用一句话说说这段时间。'}
              </p>
              <div className="flex flex-wrap gap-2">
                {payload.tier === 'recent' && (
                  <button
                    type="button"
                    onClick={() => setMode('calendar')}
                    className="rounded-full border border-primary/40 px-3.5 py-1.5 text-[12px] font-bold text-primary"
                  >
                    补记这几天
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMode('summary')}
                  className="rounded-full border border-gray-300 px-3.5 py-1.5 text-[12px] font-bold text-gray-500 dark:border-gray-600 dark:text-gray-400"
                >
                  用一句话概括
                </button>
              </div>
            </div>
          )}

          {mode === 'calendar' && (
            <ReturnBackfillCalendar
              days={payload.backfillDays}
              entries={entries}
              onChange={setEntries}
              onBack={() => { setEntries([]); setMode('welcome'); }}
            />
          )}

          {mode === 'summary' && (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <label className="text-[12px] font-bold text-gray-600 dark:text-gray-300">这段时间过得怎么样</label>
                <button
                  type="button"
                  onClick={() => { setSummary(''); setMode('welcome'); }}
                  className="text-[11px] font-bold text-gray-400 dark:text-gray-500"
                >
                  算了
                </button>
              </div>
              <BufferedTextInput
                value={summary}
                onCommit={setSummary}
                debounceMs={150}
                placeholder="一句话就够，比如：忙完了一个大项目"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                aria-label="这段时间的一句话概括"
              />
              <p className="text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
                会记在 {payload.lastSeenKey}——它讲的是那段时间的事，不是今天的。
              </p>
            </div>
          )}

          <p className="border-t border-gray-100 pt-3 text-[10px] leading-relaxed text-gray-400 dark:border-gray-700/60 dark:text-gray-500">
            补记的条目<b>不加点数</b>，也<b>不会修复连续天数</b>——
            那个数字记的是「没有断过」，补得回来它就不再代表任何东西了。
            回来这件事，本来就该有自己的名字。
          </p>
        </div>
      )}
    </SheetModal>
  );
}
