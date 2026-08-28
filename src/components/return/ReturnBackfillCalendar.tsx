/**
 * 回归补记日历（PRD_V2.6 §12，仅 recent 档 7–14 天）。
 *
 * 【为什么不是一排空输入框】
 * 让人凭空写出 10 天的日记是不可能完成的任务——**回忆很难，认出来很容易**。
 * 所以每天点开给的是一排 chip：从用户自己近 60 天的记录里按频次挑出来的常做的事。
 * 「跑步」「读书」「加班」，一点即记。自由输入留着，但不是主路径。
 *
 * 【别把日子画成空的】
 * 每一格都带上 App 已知的信息（周几、是不是周末）。给每天一点纹理，
 * 它才是记忆的抓手；十个一模一样的空格子只是一堵洞。
 *
 * 【「那天在休息」】
 * 一键把某天标成休息。不加点、不算数，但那一格从"空"变成了"我选择的"。
 * 这一下的心理差别很大：从"我没做到"变成"我在休息"。
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import type { BackfillEntry } from '@/types';
import { BufferedTextInput } from '@/components/ui/BufferedTextInput';
import { triggerLightHaptic } from '@/utils/feedback';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const RESTING = '那几天在休息';

export function ReturnBackfillCalendar({
  days, entries, onChange, onBack,
}: {
  days: string[];
  entries: BackfillEntry[];
  onChange: (next: BackfillEntry[]) => void;
  onBack: () => void;
}) {
  const getBackfillSuggestions = useAppStore(s => s.getBackfillSuggestions);
  const suggestions = useMemo(() => getBackfillSuggestions(8), [getBackfillSuggestions]);
  const [openDay, setOpenDay] = useState<string | null>(days[days.length - 1] ?? null);
  const [draft, setDraft] = useState('');

  const countOf = (k: string) => entries.filter(e => e.dateKey === k).length;
  const add = (dateKey: string, text: string) => {
    if (!text.trim()) return;
    if (entries.some(e => e.dateKey === dateKey && e.text === text)) return;
    onChange([...entries, { dateKey, text }]);
    triggerLightHaptic();
  };
  const removeAt = (dateKey: string, text: string) =>
    onChange(entries.filter(e => !(e.dateKey === dateKey && e.text === text)));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-bold text-gray-600 dark:text-gray-300">
          补记 · 已记 {entries.length} 条
        </span>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 dark:text-gray-500">
          {/* 带回箭头：这是一步「返回」，不带箭头看起来像不可逆的放弃 */}
          <span aria-hidden>←</span>
          算了
        </button>
      </div>

      {/* 日期格 */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map(k => {
          const d = new Date(k + 'T00:00:00');
          const n = countOf(k);
          const isOpen = openDay === k;
          const weekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <button
              key={k}
              type="button"
              onClick={() => { setOpenDay(isOpen ? null : k); setDraft(''); }}
              className="flex flex-col items-center rounded-lg py-1.5 transition-colors"
              style={{
                background: isOpen
                  ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)'
                  : n > 0
                    ? 'color-mix(in srgb, var(--color-primary) 9%, transparent)'
                    : 'var(--ui-surface-2, rgba(127,127,127,0.09))',
                boxShadow: isOpen ? 'inset 0 0 0 1.5px var(--color-primary)' : undefined,
              }}
            >
              <span className={`text-[9px] leading-none ${weekend ? 'text-primary/70' : 'text-gray-400 dark:text-gray-500'}`}>
                {WEEK[d.getDay()]}
              </span>
              <span className="mt-0.5 text-[13px] font-black leading-none tabular-nums text-gray-700 dark:text-gray-200">
                {d.getDate()}
              </span>
              {/* 有几条就画几个点——不用数字，格子太小 */}
              <span className="mt-1 flex h-1.5 items-center gap-[2px]">
                {Array.from({ length: Math.min(3, n) }).map((_, i) => (
                  <span key={i} className="h-1 w-1 rounded-full bg-primary" />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* 展开的那一天 */}
      <AnimatePresence mode="wait">
        {openDay && (
          <motion.div
            key={openDay}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              {/* 已记下的 */}
              {countOf(openDay) > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {entries.filter(e => e.dateKey === openDay).map(e => (
                    <button
                      key={e.text}
                      type="button"
                      onClick={() => removeAt(openDay, e.text)}
                      className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white"
                    >
                      {e.text} ×
                    </button>
                  ))}
                </div>
              )}

              {/* 常做的事 —— 靠识别不靠回忆 */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions
                    .filter(s => !entries.some(e => e.dateKey === openDay && e.text === s.text))
                    .map(s => (
                      <button
                        key={s.text}
                        type="button"
                        onClick={() => add(openDay, s.text)}
                        className="rounded-full border border-gray-300 px-2.5 py-1 text-[11px] font-bold text-gray-500 dark:border-gray-600 dark:text-gray-300"
                      >
                        ＋ {s.text}
                      </button>
                    ))}
                </div>
              )}

              <div className="flex gap-1.5">
                <BufferedTextInput
                  value={draft}
                  onCommit={setDraft}
                  debounceMs={150}
                  placeholder="那天还做了什么…"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[13px] outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  aria-label={`${openDay} 的记录`}
                />
                <button
                  type="button"
                  onClick={() => { add(openDay, draft); setDraft(''); }}
                  disabled={!draft.trim()}
                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
                >
                  记下
                </button>
              </div>

              {/* 把"空"变成"我选择的" */}
              <button
                type="button"
                onClick={() => add(openDay, RESTING)}
                disabled={entries.some(e => e.dateKey === openDay && e.text === RESTING)}
                className="w-full rounded-lg border border-dashed border-gray-300 py-1.5 text-[11px] font-bold text-gray-400 disabled:opacity-40 dark:border-gray-600 dark:text-gray-500"
              >
                那天在休息
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
