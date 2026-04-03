import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { AttributeId, SummaryPeriod } from '@/types';
import { SaveSuccessModal } from '@/components/SaveSuccessModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageTitle } from '@/components/PageTitle';
import SummaryModal from '@/components/SummaryModal';
import { triggerNavFeedback, triggerLightHaptic } from '@/utils/feedback';
import { useRipple } from '@/components/RippleEffect';

// ---- 小组件 ----
const ChevronDown = ({ open }: { open: boolean }) => (
  <motion.svg
    animate={{ rotate: open ? 180 : 0 }}
    transition={{ duration: 0.2 }}
    viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400"
  >
    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
  </motion.svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
    <path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FilterIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
    <path d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75l2.25 2.25m0 0l2.25 2.25M15.75 15l2.25-2.25M15.75 15l2.25 2.25" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4">
    <rect x="3" y="4" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── 日历视图 ──────────────────────────────────────────────────────────────────
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CAL_KEY = 'activities-calendar-open';

interface CalendarViewProps {
  activities: ReturnType<typeof useAppStore.getState>['activities'];
  /** 外部受控的选中日期 key（YYYY-MM-DD） */
  selectedDay: string | null;
  onDaySelect: (day: string | null) => void;
}

const CalendarView = ({ activities, selectedDay, onDaySelect }: CalendarViewProps) => {
  const today = new Date();
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');

  useEffect(() => {
    const read = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
      if (raw) setPrimaryColor(raw);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // build day→points map + important set for this month
  const { monthMap, importantSet } = useMemo(() => {
    const map = new Map<string, number>();
    const imp = new Set<string>();
    activities.forEach(a => {
      const d = new Date(a.date);
      if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
        const key = toLocalDateKey(d);
        const pts = Object.values(a.pointsAwarded).reduce((s, v) => s + v, 0);
        map.set(key, (map.get(key) ?? 0) + pts);
        const isSpecial = a.important ||
          (a.levelUps && a.levelUps.length > 0) ||
          a.description.includes('成就解锁') ||
          a.description.includes('技能解锁');
        if (isSpecial) imp.add(key);
      }
    });
    return { monthMap: map, importantSet: imp };
  }, [activities, viewYear, viewMonth]);

  const maxPts = useMemo(() => Math.max(1, ...Array.from(monthMap.values())), [monthMap]);

  // build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    onDaySelect(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    onDaySelect(null);
  };

  const todayKey = toLocalDateKey(today);

  // year/month picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(viewYear);
  const [pickerMonth, setPickerMonth] = useState(viewMonth);

  // important event dot visibility — persisted
  const [showImportant, setShowImportant] = useState<boolean>(() => {
    try { return localStorage.getItem('cal-show-important') !== '0'; } catch { return true; }
  });
  const toggleImportant = () => setShowImportant(prev => {
    const next = !prev;
    try { localStorage.setItem('cal-show-important', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  const availableYears = useMemo(() => {
    const years = new Set(activities.map(a => new Date(a.date).getFullYear()));
    years.add(today.getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [activities]);

  const applyPicker = () => {
    setViewYear(pickerYear);
    setViewMonth(pickerMonth);
    onDaySelect(null);
    setShowPicker(false);
  };

  // activities for selected day
  const selectedActs = useMemo(() => {
    if (!selectedDay) return [];
    return activities.filter(a => {
      const k = toLocalDateKey(new Date(a.date));
      return k === selectedDay;
    });
  }, [activities, selectedDay]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        {/* header: month nav */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </motion.button>

          {/* clickable year/month title */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { setPickerYear(viewYear); setPickerMonth(viewMonth); setShowPicker(v => !v); }}
            className="text-center group"
          >
            <span className="text-[11px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase group-hover:text-primary transition-colors">
              {MONTH_EN[viewMonth]} {viewYear}
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <span className="font-black text-gray-900 dark:text-white text-xl leading-none">
                {viewYear}年{viewMonth + 1}月
              </span>
              <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showPicker ? 'rotate-180' : ''}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </motion.button>
        </div>

        {/* year/month picker panel */}
        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-gray-100 dark:border-gray-800"
            >
              <div className="px-5 pt-3 pb-1 flex items-center gap-3">
                <select
                  value={pickerYear}
                  onChange={e => setPickerYear(Number(e.target.value))}
                  className="flex-1 px-3 py-2 text-sm font-semibold border border-gray-200 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:outline-none focus:border-primary"
                >
                  {availableYears.map(y => (
                    <option key={y} value={y}>{y}年</option>
                  ))}
                </select>
                <select
                  value={pickerMonth}
                  onChange={e => setPickerMonth(Number(e.target.value))}
                  className="flex-1 px-3 py-2 text-sm font-semibold border border-gray-200 dark:border-gray-700 rounded-xl dark:bg-gray-800 dark:text-white focus:outline-none focus:border-primary"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={i}>{i + 1}月 · {MONTH_EN[i]}</option>
                  ))}
                </select>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={applyPicker}
                  className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl flex-shrink-0"
                >
                  跳转
                </motion.button>
              </div>
              {/* important event toggle */}
              <div className="px-5 pb-3 flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  在日历上显示重要事件
                </span>
                <button
                  onClick={toggleImportant}
                  className={`relative inline-flex items-center rounded-full transition-colors flex-shrink-0 ${showImportant ? 'bg-amber-400' : 'bg-gray-200 dark:bg-gray-700'}`}
                  style={{ width: 36, height: 20 }}
                >
                  <span
                    className="absolute bg-white rounded-full shadow-sm transition-all"
                    style={{ width: 16, height: 16, top: 2, left: showImportant ? 18 : 2 }}
                  />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* weekday labels */}
        <div className="grid grid-cols-7 px-3 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`text-center text-[10px] font-bold py-1 ${i === 0 || i === 6 ? 'text-rose-400 dark:text-rose-500' : 'text-gray-400 dark:text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* day grid */}
        <div className="grid grid-cols-7 gap-y-1 px-3 pb-4">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} />;
            const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const pts = monthMap.get(key) ?? 0;
            const saturation = pts > 0 ? Math.min(1, 0.15 + (pts / maxPts) * 0.85) : 0;
            const isToday = key === todayKey;
            const isSelected = key === selectedDay;
            const isImportant = importantSet.has(key);
            const weekdayIdx = (firstDay + day - 1) % 7;
            const isWeekend = weekdayIdx === 0 || weekdayIdx === 6;

            return (
              <motion.button
                key={key}
                whileTap={{ scale: 0.82 }}
                onClick={() => onDaySelect(selectedDay === key ? null : key)}
                className={`relative flex flex-col items-center justify-center rounded-xl py-2 transition-all ${
                  isSelected
                    ? 'bg-primary/15 dark:bg-primary/20'
                    : isToday
                    ? 'bg-primary/10 dark:bg-primary/15'
                    : ''
                }`}
              >
                {/* important event indicator — tiny amber dot top-right */}
                {isImportant && showImportant && (
                  <span className="absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 z-10" />
                )}

                {/* date number */}
                <span className={`text-[15px] font-bold z-10 leading-none ${
                  isSelected || isToday
                    ? 'text-primary'
                    : isWeekend
                    ? 'text-rose-400 dark:text-rose-500'
                    : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {day}
                </span>

                {/* fixed-height indicator slot: dot ↔ point count, no layout shift */}
                <span className="mt-1 flex items-center justify-center" style={{ height: '8px', width: '100%' }}>
                  <AnimatePresence mode="wait" initial={false}>
                    {isSelected && pts > 0 ? (
                      <motion.span
                        key="pts"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                        className="text-[9px] font-bold tabular-nums leading-none"
                        style={{ color: primaryColor }}
                      >
                        +{pts}
                      </motion.span>
                    ) : pts > 0 ? (
                      <motion.span
                        key="dot"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                        className="rounded-full"
                        style={{
                          width: `${Math.round(4 + saturation * 4)}px`,
                          height: `${Math.round(4 + saturation * 4)}px`,
                          background: primaryColor,
                          opacity: 0.35 + saturation * 0.65,
                          display: 'block',
                        }}
                      />
                    ) : (
                      <span key="empty" style={{ display: 'block', width: '4px', height: '4px' }} />
                    )}
                  </AnimatePresence>
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* selected day activities */}
        <AnimatePresence>
          {selectedDay && selectedActs.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-gray-100 dark:border-gray-800"
            >
              <div className="px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
                <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 dark:text-gray-500 mb-1">
                  {selectedDay.replace(/-/g, '/')} 的记录
                </p>
                {selectedActs.map(a => {
                  const pts = Object.values(a.pointsAwarded).reduce((s, v) => s + v, 0);
                  return (
                    <div key={a.id} className="flex items-start gap-2">
                      <span className="text-[10px] text-gray-400 mt-0.5 flex-shrink-0 tabular-nums">
                        {new Date(a.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300 flex-1">{a.description}</span>
                      {pts > 0 && (
                        <span className="text-[10px] font-semibold text-primary flex-shrink-0">+{pts}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
          {selectedDay && selectedActs.length === 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-gray-100 dark:border-gray-800"
            >
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">这天暂无记录</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ── 总结提醒逻辑 ──────────────────────────────────────────
function useSummaryReminder() {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 6=Sat
  const dom = today.getDate();
  const month = today.getMonth() + 1;

  // 周日（新一周开始前）提醒：显示周总结入口红点
  const isWeekEnd = dow === 0;
  // 每月1日（新一月开始）提醒：显示月总结红点
  const isMonthStart = dom === 1;
  // 12月31日（年末）提醒：显示月总结红点
  const isYearEnd = month === 12 && dom === 31;

  const showWeekDot = isWeekEnd;
  const showMonthDot = isMonthStart || isYearEnd;
  const showDot = showWeekDot || showMonthDot;
  const defaultPeriod: SummaryPeriod = (showMonthDot && !showWeekDot) ? 'month' : 'week';

  return { showDot, showWeekDot, showMonthDot, defaultPeriod };
}

export const Activities = () => {
  const { activities, addActivity, settings, setModalBlocker, deleteActivity } = useAppStore();

  // ---- 总结弹窗 ----
  const [showSummary, setShowSummary] = useState(false);
  const { showDot, defaultPeriod: summaryDefaultPeriod } = useSummaryReminder();

  // ---- 涟漪反馈 ----
  const { spawn: spawnAnalyze, ripples: analyzeRipples } = useRipple();
  const { spawn: spawnSave, ripples: saveRipples } = useRipple();

  // ---- 输入状态 ----
  const [showInput, setShowInput] = useState(false);
  const [description, setDescription] = useState('');
  const [analyzedPoints, setAnalyzedPoints] = useState<Record<string, number> | null>(null);
  const [manualPoints, setManualPoints] = useState<Record<string, number>>({
    knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0
  });
  const [importantOnly, setImportantOnly] = useState(false);

  // ---- 视图模式（localStorage 记忆，默认开启）----
  const [showCalendar, setShowCalendar] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(CAL_KEY);
      return v === null ? true : v === '1';
    } catch { return true; }
  });
  const toggleCalendar = () => setShowCalendar(prev => {
    const next = !prev;
    try { localStorage.setItem(CAL_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

  // ---- 筛选状态 ----
  const [filterAttributes, setFilterAttributes] = useState<string[]>([]); // empty = all
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [showImportantOnly, setShowImportantOnly] = useState(false);
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ---- 删除 ----
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- 折叠状态（年/月）---- 日默认全开 ----
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  // ---- 日历选中日期（提升状态，支持补录） ----
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);
  // ---- 补录目标日期（非今天的过去日期） ----
  const [backdateTarget, setBackdateTarget] = useState<string | null>(null);

  // ---- 保存成功弹窗 ----
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [unlockHint, setUnlockHint] = useState<{ achievements: number; skills: number }>({ achievements: 0, skills: 0 });
  const [lastSavedImportant, setLastSavedImportant] = useState(false);
  const [lastSavedDescription, setLastSavedDescription] = useState('');
  const [lastSavedPoints, setLastSavedPoints] = useState<Record<string, number>>({});

  const todayKey = toLocalDateKey();
  const now2 = new Date();
  const yesterdayKey = toLocalDateKey(new Date(now2.getFullYear(), now2.getMonth(), now2.getDate() - 1));

  const availableYears = useMemo(() => {
    const years = new Set(activities.map(a => new Date(a.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [activities]);

  const availableMonths = useMemo(() => {
    if (filterYear === 'all') return [];
    const months = new Set(
      activities
        .filter(a => new Date(a.date).getFullYear() === parseInt(filterYear))
        .map(a => new Date(a.date).getMonth() + 1)
    );
    return Array.from(months).sort((a, b) => a - b);
  }, [activities, filterYear]);

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activities.filter(activity => {
      const date = new Date(activity.date);
      if (filterAttributes.length > 0 && !filterAttributes.some(a => activity.pointsAwarded[a as AttributeId] > 0)) return false;
      if (filterYear !== 'all' && date.getFullYear() !== parseInt(filterYear)) return false;
      if (filterMonth !== 'all' && date.getMonth() + 1 !== parseInt(filterMonth)) return false;
      if (showImportantOnly) {
        const isImportant =
          (activity.levelUps && activity.levelUps.length > 0) ||
          activity.description.includes('成就解锁') ||
          activity.description.includes('技能解锁') ||
          activity.important;
        if (!isImportant) return false;
      }
      if (filterMethod !== 'all' && activity.method !== filterMethod) return false;
      if (q && !activity.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activities, filterAttributes, filterYear, filterMonth, showImportantOnly, filterMethod, searchQuery]);

  const groupedActivities = useMemo(() => {
    const map = new Map<string, { year: number; months: Map<string, { month: number; days: Map<string, { dateLabel: string; dayKey: string; items: typeof activities }> }> }>();

    filteredActivities.forEach(activity => {
      const date = new Date(activity.date);
      const yearKey = `${date.getFullYear()}`;
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const dayKey = toLocalDateKey(date);
      const dateLabel = dayKey === todayKey ? '今天'
        : dayKey === yesterdayKey ? '昨天'
        : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });

      if (!map.has(yearKey)) map.set(yearKey, { year: date.getFullYear(), months: new Map() });
      const yb = map.get(yearKey)!;
      if (!yb.months.has(monthKey)) yb.months.set(monthKey, { month: date.getMonth() + 1, days: new Map() });
      const mb = yb.months.get(monthKey)!;
      if (!mb.days.has(dayKey)) mb.days.set(dayKey, { dateLabel, dayKey, items: [] });
      mb.days.get(dayKey)!.items.push(activity);
    });

    return Array.from(map.entries())
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
      .map(([yearKey, yb]) => ({
        yearKey,
        year: yb.year,
        months: Array.from(yb.months.entries())
          .sort((a, b) => parseInt(b[0].split('-')[1]) - parseInt(a[0].split('-')[1]))
          .map(([monthKey, mb]) => ({
            monthKey,
            month: mb.month,
            days: Array.from(mb.days.entries())
              .sort((a, b) => b[0] > a[0] ? 1 : -1)
              .map(([, db]) => db)
          }))
      }));
  }, [filteredActivities, todayKey, yesterdayKey]);

  const analyzeActivity = () => {
    if (!description.trim()) return;
    const points: Record<string, number> = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
    for (const rule of settings.keywordRules) {
      for (const keyword of rule.keywords) {
        if (description.includes(keyword)) { points[rule.attribute] += rule.points; break; }
      }
    }
    setAnalyzedPoints(points);
    setManualPoints(points);
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    setLastSavedDescription(description);
    setLastSavedPoints(manualPoints);
    setLastSavedImportant(importantOnly);
    // 补录：若选中了过去日期，将时间设为当天中午 12:00，避免时区偏移
    const backdateDate = backdateTarget
      ? new Date(`${backdateTarget}T12:00:00`)
      : undefined;
    const result = await addActivity(description, manualPoints, 'local', {
      important: importantOnly,
      date: backdateDate,
    });
    setUnlockHint(result.unlockHints);
    setModalBlocker(true);
    setShowSaveSuccess(true);
    setDescription('');
    setAnalyzedPoints(null);
    setManualPoints({ knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 });
    setImportantOnly(false);
    setShowInput(false);
    setBackdateTarget(null);
  };

  const adjustPoints = (attr: string, delta: number) => {
    setManualPoints(prev => ({ ...prev, [attr]: Math.max(0, Math.min(5, prev[attr] + delta)) }));
  };

  const handleDelete = async (id: string) => {
    await deleteActivity(id);
  };

  const startPress = (id: string) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    setPressedId(id);
    pressTimerRef.current = setTimeout(() => {
      triggerLightHaptic();
      setDeleteTargetId(id);
      setPressedId(null);
    }, 620);
  };

  const cancelPress = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    setPressedId(null);
  };

  // 判断某年某月是否默认展开：今年今月 or 包含今天/昨天
  const isYearOpen = (yearKey: string) => openYears[yearKey] !== false;
  const isMonthOpen = (monthKey: string, hasToday: boolean) => {
    if (openMonths[monthKey] !== undefined) return openMonths[monthKey];
    return hasToday;
  };

  const hasActiveFilter = filterAttributes.length > 0 || filterYear !== 'all' || filterMonth !== 'all' || showImportantOnly || filterMethod !== 'all' || searchQuery.trim() !== '';

  // ── 滚动到底部：波浪动画 + 自动展开折叠月份 ────────────────────
  const [showBottomWave, setShowBottomWave] = useState(false);
  const bottomWaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didReachBottomRef = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrolledToBottom =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 32;
      if (!scrolledToBottom) {
        didReachBottomRef.current = false;
        return;
      }
      if (didReachBottomRef.current) return; // already triggered this scroll session
      didReachBottomRef.current = true;
      setShowBottomWave(true);

      if (bottomWaveTimerRef.current) clearTimeout(bottomWaveTimerRef.current);
      bottomWaveTimerRef.current = setTimeout(() => {
        setShowBottomWave(false);
        // Find the first month group that is currently closed and open it
        for (const yg of groupedActivities) {
          if (!isYearOpen(yg.yearKey)) continue;
          for (const mg of yg.months) {
            const hasToday = mg.days.some(d => d.dayKey === todayKey || d.dayKey === yesterdayKey);
            if (!isMonthOpen(mg.monthKey, hasToday)) {
              setOpenMonths(prev => ({ ...prev, [mg.monthKey]: true }));
              return;
            }
          }
        }
      }, 1200);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (bottomWaveTimerRef.current) clearTimeout(bottomWaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedActivities, openYears, openMonths, todayKey, yesterdayKey]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {/* 总结弹窗 */}
      <SummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        defaultPeriod={summaryDefaultPeriod}
      />

      {/* 页头 + 搜索 */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <PageTitle title="历史记录" en="Journal" />
          {/* 总结入口按钮 */}
          <button
            onClick={() => setShowSummary(true)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 text-xs font-semibold hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <span>✨</span>
            <span>成长总结</span>
            {showDot && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"
              />
            )}
          </button>
        </div>
        {/* 搜索框 */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索记录内容…"
            className="w-full pl-9 pr-10 py-2.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-primary dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>

        {/* 筛选按钮行 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 日历切换 — 在筛选左侧 */}
          <button
            onClick={toggleCalendar}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              showCalendar
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <CalendarIcon />
            日历
          </button>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              showFilters || (hasActiveFilter && !searchQuery.trim())
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <FilterIcon />
            筛选
            {hasActiveFilter && !searchQuery.trim() && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-white/80 inline-block" />}
          </button>

          {/* Active filter chips */}
          {filterAttributes.map(a => (
            <span key={a} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-primary/10 text-primary font-medium">
              {settings.attributeNames[a as AttributeId]}
              <button onClick={() => setFilterAttributes(prev => prev.filter(x => x !== a))} className="ml-0.5 opacity-60 hover:opacity-100">✕</button>
            </span>
          ))}
          {filterMethod !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-primary/10 text-primary font-medium">
              {filterMethod === 'local' ? '手动' : '待办'}
              <button onClick={() => setFilterMethod('all')} className="ml-0.5 opacity-60 hover:opacity-100">✕</button>
            </span>
          )}
          {filterYear !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-primary/10 text-primary font-medium">
              {filterYear}年{filterMonth !== 'all' ? `${filterMonth}月` : ''}
              <button onClick={() => { setFilterYear('all'); setFilterMonth('all'); }} className="ml-0.5 opacity-60 hover:opacity-100">✕</button>
            </span>
          )}
          {showImportantOnly && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
              ⭐ 重要
              <button onClick={() => setShowImportantOnly(false)} className="ml-0.5 opacity-60 hover:opacity-100">✕</button>
            </span>
          )}
          {hasActiveFilter && (
            <button
              onClick={() => { setFilterAttributes([]); setFilterYear('all'); setFilterMonth('all'); setShowImportantOnly(false); setFilterMethod('all'); setSearchQuery(''); }}
              className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 ml-auto"
            >
              清除全部
            </button>
          )}
        </div>
      </div>

      {/* 日历视图 */}
      <AnimatePresence>
        {showCalendar && (
          <CalendarView
            activities={activities}
            selectedDay={calendarSelectedDay}
            onDaySelect={setCalendarSelectedDay}
          />
        )}
      </AnimatePresence>

      {/* 筛选面板 */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
              {/* 属性选择 — 多选胶囊 */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-50 dark:border-gray-800">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">属性（可多选）</p>
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(settings.attributeNames).map(([key, label]) => {
                    const selected = filterAttributes.includes(key);
                    return (
                      <button
                        key={key}
                        onClick={() => setFilterAttributes(prev =>
                          selected ? prev.filter(x => x !== key) : [...prev, key]
                        )}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          selected
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  {filterAttributes.length > 0 && (
                    <button
                      onClick={() => setFilterAttributes([])}
                      className="px-3 py-1 rounded-lg text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>

              {/* 来源 */}
              <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">来源</p>
                <div className="flex gap-1.5">
                  {[{ key: 'all', label: '全部' }, { key: 'local', label: '手动记录' }, { key: 'todo', label: '待办完成' }, { key: 'battle', label: '战斗奖励' }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setFilterMethod(key)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        filterMethod === key
                          ? 'bg-primary text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 时间 */}
              <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">时间</p>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={filterYear}
                    onChange={(e) => { setFilterYear(e.target.value); setFilterMonth('all'); }}
                    className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white focus:outline-none focus:border-primary"
                  >
                    <option value="all">全部年份</option>
                    {availableYears.map(y => <option key={y} value={y}>{y}年</option>)}
                  </select>
                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    disabled={filterYear === 'all'}
                    className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-white focus:outline-none focus:border-primary disabled:opacity-40"
                  >
                    <option value="all">全部月份</option>
                    {availableMonths.map(m => <option key={m} value={m}>{m}月</option>)}
                  </select>
                </div>
              </div>

              {/* 重要 toggle */}
              <div className="px-4 py-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">仅显示重要记录</span>
                  <div
                    onClick={() => setShowImportantOnly(v => !v)}
                    className={`w-10 h-6 rounded-full transition-colors ${showImportantOnly ? 'bg-amber-400' : 'bg-gray-200 dark:bg-gray-700'}`}
                  >
                    <span className={`block w-5 h-5 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${showImportantOnly ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 记录列表 */}
      <div className="space-y-3">
        {filteredActivities.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">暂无记录，点击右下角 + 开始记录吧</p>
          </div>
        ) : (
          groupedActivities.map(yearGroup => {
            const yearOpen = isYearOpen(yearGroup.yearKey);
            const currentYear = new Date().getFullYear().toString();
            const isThisYear = yearGroup.yearKey === currentYear;
            return (
              <div key={yearGroup.yearKey}>
                {/* 年份标题（当有多年时才显示折叠按钮） */}
                {!isThisYear && (
                  <button
                    onClick={() => setOpenYears(prev => ({ ...prev, [yearGroup.yearKey]: !yearOpen }))}
                    className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400 cursor-pointer"
                  >
                    <span>{yearGroup.year} 年</span>
                    <ChevronDown open={yearOpen} />
                  </button>
                )}

                <AnimatePresence initial={false}>
                  {yearOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      {yearGroup.months.map(monthGroup => {
                        const hasToday = monthGroup.days.some(d => d.dayKey === todayKey || d.dayKey === yesterdayKey);
                        const monthOpen = isMonthOpen(monthGroup.monthKey, hasToday);

                        return (
                          <div key={monthGroup.monthKey}>
                            <button
                              onClick={() => setOpenMonths(prev => ({ ...prev, [monthGroup.monthKey]: !monthOpen }))}
                              className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300 cursor-pointer"
                            >
                              <span>{monthGroup.month} 月</span>
                              <ChevronDown open={monthOpen} />
                            </button>

                            <AnimatePresence initial={false}>
                              {monthOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="space-y-4 overflow-hidden"
                                >
                                  {monthGroup.days.map(dayGroup => (
                                    <div key={dayGroup.dayKey}>
                                      {/* 日期标签 */}
                                      <div className={`text-xs font-semibold mb-2 px-1 ${
                                        dayGroup.dayKey === todayKey
                                          ? 'text-primary'
                                          : dayGroup.dayKey === yesterdayKey
                                          ? 'text-gray-500 dark:text-gray-400'
                                          : 'text-gray-400 dark:text-gray-500'
                                      }`}>
                                        {dayGroup.dateLabel}
                                      </div>

                                      <div className="space-y-2">
                                        {dayGroup.items.map((activity) => {
                                          const isAchievement = activity.category === 'achievement_unlock' || activity.description.includes('成就解锁');
                                          const isSkill = activity.category === 'skill_unlock' || activity.description.includes('技能解锁');
                                          const isLevelUp = !!(activity.levelUps && activity.levelUps.length > 0);
                                          const isImportant = activity.important;
                                          const isTodo = activity.method === 'todo';
                                          const isWeeklyGoal = activity.category === 'weekly_goal';
                                          const isShadowDefeat = activity.category === 'shadow_defeat' || activity.method === 'battle';
                                          const isSpecial = isAchievement || isSkill || isLevelUp;

                                          // accent bar color based on type
                                          const accentColor = isAchievement
                                            ? 'bg-amber-400'
                                            : isSkill
                                            ? 'bg-violet-400'
                                            : isLevelUp
                                            ? 'bg-orange-400'
                                            : isShadowDefeat
                                            ? 'bg-red-500'
                                            : isTodo
                                            ? 'bg-sky-400'
                                            : isImportant
                                            ? 'bg-amber-400'
                                            : 'bg-gray-200 dark:bg-gray-700';

                                          const hasPoints = Object.values(activity.pointsAwarded).some(v => v > 0);

                                          return (
                                            <motion.div
                                              key={activity.id}
                                              animate={pressedId === activity.id ? { scale: 0.98 } : { scale: 1 }}
                                              transition={{ duration: 0.15 }}
                                              className={`rounded-2xl overflow-hidden cursor-pointer select-none backdrop-blur-sm ${
                                                isAchievement
                                                  ? 'border-2 border-amber-400/60 dark:border-amber-500/40'
                                                  : isSkill
                                                  ? 'border-2 border-violet-400/60 dark:border-violet-500/40'
                                                  : isLevelUp
                                                  ? 'border-2 border-orange-400/60 dark:border-orange-500/40'
                                                  : isShadowDefeat
                                                  ? 'border-2 border-red-500/60 dark:border-red-500/40'
                                                  : isImportant
                                                  ? 'border border-amber-300/60 dark:border-amber-600/40'
                                                  : 'border border-gray-100 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80'
                                              } ${pressedId === activity.id ? 'shadow-md' : 'shadow-sm'}`}
                                              style={{
                                                background: isAchievement
                                                  ? 'rgba(251,191,36,0.10)'
                                                  : isSkill
                                                  ? 'rgba(167,139,250,0.10)'
                                                  : isLevelUp
                                                  ? 'rgba(251,146,60,0.10)'
                                                  : isShadowDefeat
                                                  ? 'rgba(239,68,68,0.10)'
                                                  : isImportant
                                                  ? 'rgba(251,191,36,0.06)'
                                                  : undefined,
                                              }}
                                              onMouseDown={() => startPress(activity.id)}
                                              onMouseUp={cancelPress}
                                              onMouseLeave={cancelPress}
                                              onTouchStart={() => startPress(activity.id)}
                                              onTouchEnd={cancelPress}
                                              onTouchCancel={cancelPress}
                                            >
                                                <div className="flex">
                                                  {/* 左侧彩色竖条 */}
                                                  <div className={`w-1 flex-shrink-0 ${accentColor}`} />

                                                  {/* 主内容区 */}
                                                  <div className="flex-1 min-w-0 px-4 py-3.5">
                                                    {/* 描述 — 主角，最大字号 */}
                                                    <p className={`text-[15px] font-medium leading-snug ${
                                                      isAchievement || isSkill || isLevelUp
                                                        ? 'text-gray-900 dark:text-white'
                                                        : 'text-gray-800 dark:text-gray-100'
                                                    }`}>
                                                      {activity.description}
                                                    </p>

                                                    {/* 点数 + 时间 — 次要信息行 */}
                                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                      {hasPoints && Object.entries(activity.pointsAwarded).map(([attr, pts]) =>
                                                        pts > 0 ? (
                                                          <span key={attr} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary dark:bg-primary/20 tabular-nums">
                                                            {settings.attributeNames[attr as AttributeId]} +{pts}
                                                          </span>
                                                        ) : null
                                                      )}
                                                      <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums ml-auto">
                                                        {new Date(activity.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                                      </span>
                                                    </div>

                                                    {/* 特殊 / 来源标签 */}
                                                    {(isSpecial || isTodo || isWeeklyGoal || isShadowDefeat) && (
                                                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                                                        {isShadowDefeat && (
                                                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-300 bg-red-100/80 dark:bg-red-900/30 px-2 py-0.5 rounded-md">
                                                            👁 Shadow击破{isImportant ? ' ★首杀' : ''}
                                                          </span>
                                                        )}
                                                        {isTodo && (
                                                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-300 bg-sky-100/80 dark:bg-sky-900/30 px-2 py-0.5 rounded-md">
                                                            ✓ 待办
                                                          </span>
                                                        )}
                                                        {isWeeklyGoal && (
                                                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md">
                                                            🏆 本周目标
                                                          </span>
                                                        )}
                                                        {isLevelUp && activity.levelUps?.map((lu, idx) => (
                                                          <span key={idx} className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-300 bg-orange-100/80 dark:bg-orange-900/30 px-2 py-0.5 rounded-md">
                                                            🎉 {settings.attributeNames[lu.attribute]} {lu.fromLevel}→{lu.toLevel}
                                                          </span>
                                                        ))}
                                                        {isSkill && (
                                                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-300 bg-violet-100/80 dark:bg-violet-900/30 px-2 py-0.5 rounded-md">
                                                            ✨ 技能解锁
                                                          </span>
                                                        )}
                                                        {isAchievement && (
                                                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/30 px-2 py-0.5 rounded-md">
                                                            🏆 成就解锁
                                                          </span>
                                                        )}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              </motion.div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* FAB 悬浮按钮：选中过去七天内日期时变为"补"录模式 */}
      {(() => {
        const sevenDaysAgo = (() => {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          return toLocalDateKey(d);
        })();
        const isPastDaySelected =
          showCalendar &&
          calendarSelectedDay !== null &&
          calendarSelectedDay < todayKey &&
          calendarSelectedDay >= sevenDaysAgo;
        return (
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => {
              triggerNavFeedback();
              if (isPastDaySelected) {
                setBackdateTarget(calendarSelectedDay);
              } else {
                setBackdateTarget(null);
              }
              setShowInput(true);
            }}
            className={`fixed bottom-24 right-5 md:bottom-8 md:right-8 w-14 h-14 text-white rounded-2xl shadow-lg flex items-center justify-center z-40 cursor-pointer transition-colors ${
              isPastDaySelected
                ? 'bg-amber-500 shadow-amber-500/30'
                : 'bg-primary shadow-primary/30'
            }`}
          >
            {isPastDaySelected ? (
              <span className="text-xl font-black leading-none">补</span>
            ) : (
              <PlusIcon />
            )}
          </motion.button>
        );
      })()}

      {/* 输入抽屉弹窗 */}
      <AnimatePresence>
        {showInput && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => { setShowInput(false); setAnalyzedPoints(null); setBackdateTarget(null); }}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl px-5 pt-4 pb-8 md:max-w-lg md:left-1/2 md:-translate-x-1/2 md:rounded-2xl md:bottom-12"
              style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
            >
              {/* 拖拽指示条 */}
              <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-5" />

              {backdateTarget ? (
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">补录历史记录</h3>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                    <span>📅</span>
                    <span>记录日期：{backdateTarget.replace(/-/g, '/')}</span>
                  </p>
                </div>
              ) : (
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">记录一件事</h3>
              )}

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述你刚才做了什么..."
                className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:border-primary dark:bg-gray-800 dark:text-white resize-none"
                rows={3}
                autoFocus
              />

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={(e) => { spawnAnalyze(e); analyzeActivity(); }}
                disabled={!description.trim()}
                className="relative overflow-hidden w-full mt-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 cursor-pointer"
              >
                {analyzeRipples}
                分析关键词
              </motion.button>

              {analyzedPoints && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 space-y-3"
                >
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">调整点数</p>
                  {Object.entries(manualPoints).map(([attr, pts]) => (
                    <div key={attr} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {settings.attributeNames[attr as AttributeId]}
                      </span>
                      <div className="flex items-center gap-3">
                        <button onClick={() => adjustPoints(attr, -1)} className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full text-lg font-bold text-gray-600 dark:text-gray-300 cursor-pointer flex items-center justify-center">−</button>
                        <span className="w-5 text-center font-bold text-gray-900 dark:text-white text-sm">{pts}</span>
                        <button onClick={() => adjustPoints(attr, 1)} className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full text-lg font-bold text-gray-600 dark:text-gray-300 cursor-pointer flex items-center justify-center">+</button>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importantOnly}
                        onChange={(e) => setImportantOnly(e.target.checked)}
                        className="w-4 h-4 text-primary rounded"
                      />
                      ⭐ 这很重要
                    </label>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => { spawnSave(e); handleSave(); }}
                      className="relative overflow-hidden px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold shadow-sm shadow-primary/20 cursor-pointer"
                    >
                      {saveRipples}
                      保存
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 弹窗 */}
      <SaveSuccessModal
        isOpen={showSaveSuccess}
        onClose={() => { setShowSaveSuccess(false); setModalBlocker(false); }}
        description={lastSavedDescription}
        pointsAwarded={lastSavedPoints}
        unlockHint={unlockHint}
        tone={lastSavedImportant ? 'important' : 'default'}
      />
      <ConfirmDialog
        isOpen={!!deleteTargetId}
        title="确认删除这条记录？"
        description="删除后无法恢复。"
        confirmText="删除"
        cancelText="取消"
        tone="danger"
        onConfirm={async () => { if (deleteTargetId) await handleDelete(deleteTargetId); setDeleteTargetId(null); }}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* 滚动到底部的波浪反馈 */}
      <AnimatePresence>
        {showBottomWave && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-20 md:bottom-4 left-0 right-0 flex justify-center pointer-events-none z-30"
          >
            <div className="relative flex items-center justify-center">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  initial={{ scale: 0.4, opacity: 0.7 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 1.0, delay: i * 0.22, ease: 'easeOut' }}
                  className="absolute w-12 h-12 rounded-full border-2 border-primary"
                />
              ))}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center"
              >
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xs text-primary font-bold"
                >↓</motion.span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
