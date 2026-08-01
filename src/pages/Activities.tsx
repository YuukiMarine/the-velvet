import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { AttributeId, SummaryPeriod } from '@/types';
import { SaveSuccessModal } from '@/components/SaveSuccessModal';
import SummaryModal from '@/components/SummaryModal';
import { triggerNavFeedback, triggerLightHaptic } from '@/utils/feedback';
import { useRipple } from '@/components/RippleEffect';
// ── 行动域统一基元（UI_AUDIT_V2.5.md §3.2 + §4.6 交互协议）──
import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ListCard } from '@/components/ListCard';
import { SheetModal } from '@/components/SheetModal';
import { Stepper } from '@/components/Stepper';
import { Toggle } from '@/components/Toggle';
import { TrashIcon } from '@/components/icons';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Sparkle } from '@/ui/p4Kit';
import { SectionMark, SlantButton } from '@/components/p3r/kit';
import { P5R, P5_FONT, roughSlant, starPts, P5Star, P5StarFab } from '@/components/p5r/kit';

/** 成长总结入口：左低右高的平行四边形（P5 反板正口径，四边斜率各不相同） */
const SUMMARY_SHAPE = 'polygon(7px 0, 100% 2px, calc(100% - 6px) 100%, 0 calc(100% - 3px))';

// ---- 来源筛选选项（筛选面板与已选 chip 共用） ----
const METHOD_FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'local', label: '手动记录' },
  { key: 'todo', label: '任务完成' },
  { key: 'battle', label: '战斗奖励' },
] as const;

// ---- 列表卡强调条映射（§3.2）----
// 原卡片的 8 分支三元（边框/内联 rgba 底色/左强调条三套联动）收敛为单一映射：
// 类型判定（优先级沿用旧三元链原序）→ 完整 bg-* 字面量（Tailwind JIT 不识别拼接类名）。
// 色相沿用旧 accentColor 现状；卡底/边框不再随类型变化——统一走 ListCard 标准白卡，
// 顺带修掉审计指出的"内联 rgba 底色绕过暗色 token"。
type ActivityAccentKey =
  | 'achievement'      // 成就解锁
  | 'skill'            // 技能解锁
  | 'levelUp'          // 属性升级
  | 'shadowDefeat'     // Shadow 击破 / 战斗奖励
  | 'confidant'        // 同伴事件
  | 'weeklyGoal'       // 本周目标达成
  | 'callingCardClear' // 倒计时达成
  | 'bigdealClear'     // BIG DEAL 收官（收束卡）
  | 'todo'             // 任务完成
  | 'important'        // 手动标记重要
  | 'default';         // 普通记录

const ACTIVITY_ACCENT: Record<ActivityAccentKey, string> = {
  achievement: 'bg-amber-400',
  skill: 'bg-violet-400',
  levelUp: 'bg-orange-400',
  shadowDefeat: 'bg-red-500',
  confidant: 'bg-indigo-400',
  weeklyGoal: 'bg-emerald-500',
  callingCardClear: 'bg-primary',
  bigdealClear: 'bg-primary',
  todo: 'bg-sky-400',
  important: 'bg-amber-400',
  default: 'bg-gray-200 dark:bg-gray-700',
};

/** 收束卡时间线里的子步描述瘦身：去掉「完成小步: 」前缀与「（大事「X」第 i/n 步）」后缀 */
const stripStepDesc = (desc: string) =>
  desc.replace(/^完成小步[:：]\s*/, '').replace(/（大事「.*」第 \d+\/\d+ 步）$/, '');

/** 描述截断：ActionSheet 标题 / 删除确认文案用，防超长描述撑爆弹层 */
const truncateText = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

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
                {/* §3.2 统一开关：原 36×20 内联 style 开关收敛为 Toggle（on 色随制式统一为 primary） */}
                <Toggle
                  checked={showImportant}
                  onChange={toggleImportant}
                  aria-label="在日历上显示重要事件"
                />
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

// 行动页子视图（记录）：页头/页级转场由宿主 Actions.tsx 承担，本组件只渲染内容
export const ActivitiesView = () => {
  const { activities, addActivity, settings, setModalBlocker, deleteActivity, deleteActivityRecordOnly } = useAppStore();
  const isP4 = useUiChannel() === 'p4';
  // P5R：红主题 FAB 换八角红块（p5-menu 稿「+」形制）
  const p5 = useUiChannel() === 'p5';

  // ---- 总结弹窗 ----
  const [showSummary, setShowSummary] = useState(false);
  const { showDot, defaultPeriod: summaryDefaultPeriod } = useSummaryReminder();

  // ---- 涟漪反馈 ----
  const { spawn: spawnAnalyze, ripples: analyzeRipples } = useRipple();
  const { spawn: spawnSave, ripples: saveRipples } = useRipple();

  // ---- 输入状态 ----
  const [showInput, setShowInput] = useState(false);
  // P3R（蓝频道）：p3-modal-03 稿——字段/步进器经基座与通用件自动换装，此处只管按钮与节标
  const p3 = useUiChannel() === 'p3';
  const [description, setDescription] = useState('');
  const [analyzedPoints, setAnalyzedPoints] = useState<Record<string, number> | null>(null);
  const [manualPoints, setManualPoints] = useState<Record<string, number>>({
    knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0
  });
  const [importantOnly, setImportantOnly] = useState(false);

  // ---- AI 二次分析 ----
  // analyzedPoints 非 null 时（说明已经做过本地关键词分析），按钮文案切到 "AI 分析"
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReason, setAiReason] = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

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

  // ---- 长按菜单 / 删除确认（§4.6 协议）----
  // 长按卡片（ListCard 内置 useLongPress：500ms 全站统一 + 位移容差）
  //   → ActionSheet 上下文菜单（z=50）
  //   → 「删除」→ ConfirmDialog（z=60，叠在其上）确认后才执行删除。
  const [menuActivityId, setMenuActivityId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

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

  // 收束（TASKS_MERGE_PRD D4）：已收官大事的子步记录从列表隐藏（DB 保留），
  // 由对应收束卡（bigdeal_clear）展开时间线时按需展示
  const clearedDealIds = useMemo(
    () => new Set(activities.filter(a => a.category === 'bigdeal_clear' && a.bigDealId).map(a => a.bigDealId as string)),
    [activities],
  );
  /** 收束卡展开态（按 bigDealId 寻址） */
  const [expandedDeals, setExpandedDeals] = useState<Set<string>>(new Set());
  const toggleDealExpand = (id: string) =>
    setExpandedDeals(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activities.filter(activity => {
      if (activity.category === 'bigdeal_step' && activity.bigDealId && clearedDealIds.has(activity.bigDealId)) return false;
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
  }, [activities, filterAttributes, filterYear, filterMonth, showImportantOnly, filterMethod, searchQuery, clearedDealIds]);

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
    setAiError(null);
    setAiReason(null);
  };

  const analyzeWithAI = async () => {
    if (!description.trim()) return;
    if (aiAnalyzing) return;
    setAiAnalyzing(true);
    setAiError(null);
    aiAbortRef.current?.abort();
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    try {
      const { analyzeActivityAI } = await import('@/utils/activityAI');
      const { points, reason } = await analyzeActivityAI(
        description,
        settings.attributeNames,
        settings,
        ctrl.signal,
      );
      setManualPoints(points);
      setAnalyzedPoints(points);
      setAiReason(reason || null);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiAnalyzing(false);
    }
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
    setAiError(null);
    setAiReason(null);
  };

  // 原删除逻辑照搬：回档（收回点数）/ 仅删条目两条通路保持不变
  const handleDeleteAndRollback = async (id: string) => {
    await deleteActivity(id);
  };
  const handleDeleteRecordOnly = async (id: string) => {
    await deleteActivityRecordOnly(id);
  };
  const closeDeleteDialog = () => setDeleteTargetId(null);

  // 被长按 / 待删除记录的实体（ActionSheet 标题与确认文案需要描述全文）
  const menuActivity = menuActivityId ? activities.find(a => a.id === menuActivityId) : undefined;
  const deleteTarget = deleteTargetId ? activities.find(a => a.id === deleteTargetId) : undefined;

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
    // 子视图化：页级 motion 容器（opacity 进出场）移交宿主 Actions 的 tabpanel 包装层，
    // 自身退化为纯 div——若保留 exit 会拖长宿主 AnimatePresence mode="wait" 的 180ms 切换预算
    <div className="space-y-4">
      {/* 总结弹窗 */}
      <SummaryModal
        isOpen={showSummary}
        onClose={() => setShowSummary(false)}
        defaultPeriod={summaryDefaultPeriod}
      />

      {/* 页头 + 搜索（PageTitle 移除：标题职责由宿主 Actions 的大字切换头承担；
          成长总结入口保留并维持右对齐位置） */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-end">
          {/* 总结入口按钮 */}
          <button
            onClick={() => setShowSummary(true)}
            className={
              p5
                ? 'relative flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-black'
                : 'relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 text-xs font-semibold hover:bg-primary/10 hover:text-primary transition-colors'
            }
            style={p5 ? { color: P5R.ink, fontFamily: P5_FONT } : undefined}
          >
            {/* P5：半透明底色在红频道读成「脏灰块」——换成纸白平行四边形 + 不等宽黑描边 */}
            {p5 && (
              <>
                <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,3px)', background: P5R.ink, clipPath: SUMMARY_SHAPE }} />
                <span aria-hidden className="absolute inset-0" style={{ background: P5R.ink, clipPath: SUMMARY_SHAPE }} />
                <span aria-hidden className="absolute inset-[2.5px]" style={{ background: P5R.paper, clipPath: SUMMARY_SHAPE }} />
              </>
            )}
            {p5 ? <P5Star size={13} fill={P5R.red} className="relative shrink-0" /> : <span>✨</span>}
            <span className="relative">成长总结</span>
            {showDot && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={p5 ? 'absolute -top-1.5 -right-1.5 h-3 w-3' : 'absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm'}
                style={p5 ? { background: P5R.red, clipPath: 'polygon(2px 0, 100% 1px, calc(100% - 2px) 100%, 0 calc(100% - 1px))', boxShadow: `0 0 0 2px ${P5R.ink}` } : undefined}
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
              {METHOD_FILTER_OPTIONS.find(o => o.key === filterMethod)?.label ?? filterMethod}
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
                  {METHOD_FILTER_OPTIONS.map(({ key, label }) => (
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
                  {/* §3.2 统一开关：原 div 实现无语义无键盘 → Toggle（button role=switch，label 文字可代理激活） */}
                  <Toggle
                    checked={showImportantOnly}
                    onChange={setShowImportantOnly}
                    aria-label="仅显示重要记录"
                  />
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 记录列表 */}
      <div className="space-y-3">
        {filteredActivities.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm px-6">
            {/* §3.2 统一空状态：卡片容器保留、内部收敛为 EmptyState（垂直留白由其 py-10 提供）；
                文案不再指认 FAB 位置（"右下角 +"一类位置词随布局重排会说谎）；
                按是否有筛选给出不同主因——空≠没搜到 */}
            <EmptyState
              icon="📭"
              text={hasActiveFilter ? '没有符合条件的记录' : '还没有任何记录'}
              hint={hasActiveFilter ? '试试调整或清除筛选条件' : '把今天做过的一件小事记下来吧'}
            />
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
                                    <div
                                      key={dayGroup.dayKey}
                                      // content-visibility:auto 让浏览器在该日块滚出视口时跳过渲染/布局；
                                      // contain-intrinsic-size 给出占位尺寸，防止滚动条跳动。
                                      // 单月展开后含大量活动时，可显著降低首屏工作量（支持度：Chrome/Edge/Safari 17.2+；
                                      // 不支持的浏览器会忽略这两条属性，视觉与功能完全一致）。
                                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 220px' }}
                                    >
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
                                          const isConfidant = activity.category === 'confidant';
                                          // v2.1：倒计时达成（calling_card_clear）—— 用主题 primary 强调，
                                          // 表达"用户跨越的里程碑"，与 LevelUp / Achievement 同等重要的视觉权重
                                          const isCallingCardClear = activity.category === 'calling_card_clear';
                                          // BIG DEAL 收束卡：默认重要 + 可展开子步时间线（隐藏记录按需展示）
                                          const isBigDealClear = activity.category === 'bigdeal_clear' && !!activity.bigDealId;
                                          const isSpecial = isAchievement || isSkill || isLevelUp || isConfidant || isWeeklyGoal || isCallingCardClear || isBigDealClear;

                                          // §3.2：原"边框/内联 rgba 底色/强调条"三套联动收敛为
                                          // accentKey → ACTIVITY_ACCENT 单次查表；类型优先级保持旧三元链原序
                                          const accentKey: ActivityAccentKey = isAchievement
                                            ? 'achievement'
                                            : isSkill
                                            ? 'skill'
                                            : isLevelUp
                                            ? 'levelUp'
                                            : isShadowDefeat
                                            ? 'shadowDefeat'
                                            : isConfidant
                                            ? 'confidant'
                                            : isWeeklyGoal
                                            ? 'weeklyGoal'
                                            : isCallingCardClear
                                            ? 'callingCardClear'
                                            : isBigDealClear
                                            ? 'bigdealClear'
                                            : isTodo
                                            ? 'todo'
                                            : isImportant
                                            ? 'important'
                                            : 'default';

                                          const hasPoints = Object.values(activity.pointsAwarded).some(v => v > 0);

                                          return (
                                            <ListCard
                                              key={activity.id}
                                              accent={ACTIVITY_ACCENT[accentKey]}
                                              onLongPress={() => {
                                                // §4.6 长按统一：ListCard 内置 useLongPress（500ms+位移容差）
                                                // 替换手写 620ms setTimeout；震感反馈沿用旧实现
                                                triggerLightHaptic();
                                                setMenuActivityId(activity.id);
                                              }}
                                            >
                                              {/* 描述 — 主角，最大字号 */}
                                              <p className={`text-[15px] font-medium leading-snug ${
                                                isAchievement || isSkill || isLevelUp
                                                  ? 'text-gray-900 dark:text-white'
                                                  : 'text-gray-800 dark:text-gray-100'
                                              }`}>
                                                {isBigDealClear && (
                                                  <span className="mr-1.5 inline-block translate-y-[-1px] rounded-full bg-primary/10 px-1.5 py-0.5 align-middle text-[9px] font-black uppercase text-primary">BIG DEAL</span>
                                                )}
                                                {activity.description}
                                              </p>

                                              {/* 收束卡：子步时间线（点击展开；隐藏的 bigdeal_step 记录按需展示） */}
                                              {isBigDealClear && (() => {
                                                const dealId = activity.bigDealId!;
                                                const opened = expandedDeals.has(dealId);
                                                const steps = activities
                                                  .filter(a => a.category === 'bigdeal_step' && a.bigDealId === dealId)
                                                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                                                return (
                                                  <div className="mt-2">
                                                    <button
                                                      type="button"
                                                      onPointerDown={(e) => e.stopPropagation()}
                                                      onClick={(e) => { e.stopPropagation(); toggleDealExpand(dealId); }}
                                                      className="flex items-center gap-1 text-[11px] font-bold text-primary"
                                                    >
                                                      子步时间线（{steps.length}）
                                                      <ChevronDown open={opened} />
                                                    </button>
                                                    <AnimatePresence initial={false}>
                                                      {opened && (
                                                        <motion.div
                                                          initial={{ height: 0, opacity: 0 }}
                                                          animate={{ height: 'auto', opacity: 1 }}
                                                          exit={{ height: 0, opacity: 0 }}
                                                          className="overflow-hidden"
                                                        >
                                                          <div className="mt-1.5 space-y-1 border-l-2 border-primary/20 pl-3">
                                                            {steps.map(s => (
                                                              <div key={s.id} className="flex items-baseline gap-2 text-[12px]">
                                                                <span aria-hidden className="text-primary">✓</span>
                                                                <span className="min-w-0 flex-1 truncate text-gray-600 dark:text-gray-300">{stripStepDesc(s.description)}</span>
                                                                <span className="shrink-0 tabular-nums text-[10px] text-gray-400 dark:text-gray-500">
                                                                  {new Date(s.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} {new Date(s.date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                              </div>
                                                            ))}
                                                            {steps.length === 0 && (
                                                              <div className="text-[11px] text-gray-400 dark:text-gray-500">子步记录已被单独清理</div>
                                                            )}
                                                          </div>
                                                        </motion.div>
                                                      )}
                                                    </AnimatePresence>
                                                  </div>
                                                );
                                              })()}

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
                                                  {isConfidant && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md">
                                                      ✧ 同伴
                                                    </span>
                                                  )}
                                                  {isShadowDefeat && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-300 bg-red-100/80 dark:bg-red-900/30 px-2 py-0.5 rounded-md">
                                                      👁 Shadow击破{isImportant ? ' ★首杀' : ''}
                                                    </span>
                                                  )}
                                                  {isTodo && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-300 bg-sky-100/80 dark:bg-sky-900/30 px-2 py-0.5 rounded-md">
                                                      ✓ 任务
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
                                                  {isCallingCardClear && (
                                                    <span
                                                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md text-primary"
                                                      style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)' }}
                                                    >
                                                      ✦ 倒计时
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </ListCard>
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
            aria-label={isPastDaySelected ? '补录历史记录' : '添加记录'}
            // 制式统一（rounded-2xl → rounded-full）：与任务子页 FAB 同款圆形 bg-primary，
            // 子页切换时 FAB 静止视觉不跳变；双态（+/补记）行为与位置保持原样
            className={`fixed bottom-24 right-5 md:bottom-8 md:right-8 flex items-center justify-center z-40 cursor-pointer transition-colors ${
              isP4 && !isPastDaySelected
                ? 'h-16 w-16 text-white' // p4-redraw：蓝色四角星 FAB（与任务子页一致）
                : p5
                  ? 'h-16 w-16 text-white' // p5-redraw：纸边黑影五角星（红 / 补录橙）
                  : `w-14 h-14 text-white rounded-full shadow-lg ${
                      isPastDaySelected ? 'bg-amber-500 shadow-amber-500/30' : 'bg-primary shadow-primary/30'
                    }`
            }`}
          >
            {isP4 && !isPastDaySelected && (
              <P4Sparkle
                size={64}
                color="var(--ui-accent)"
                className="absolute inset-0"
                style={{ filter: 'drop-shadow(0 3px 0 rgba(19,19,19,0.3))' }}
              />
            )}
            {p5 && <P5StarFab face={isPastDaySelected ? '#e08a00' : '#c00008'} seed={6} />}
            {isPastDaySelected ? (
              <span className="relative text-xl font-black leading-none">补</span>
            ) : (
              <span className="relative"><PlusIcon /></span>
            )}
          </motion.button>
        );
      })()}

      {/* 输入抽屉：原 backdrop+sheet 手写兄弟节点 → SheetModal 基座
          （portal 到 body、内置 AnimatePresence/焦点陷阱/ESC/安卓返回键；FAB 仍是唯一触发入口） */}
      <SheetModal
        isOpen={showInput}
        onClose={() => { setShowInput(false); setAnalyzedPoints(null); setBackdateTarget(null); }}
        position="bottom"
        title={backdateTarget ? '补录历史记录' : '记录一件事'}
        footer={
          // 主操作区入 footer 槽（内容滚动时恒在视口内）；
          // "分析关键词→才出现保存"的门控逻辑本次保持原样（审计另案）
          analyzedPoints ? (
            <div className="flex items-center justify-between">
              <label className={`flex items-center gap-2 text-sm cursor-pointer ${p3 ? 'font-black text-[#0a1230]' : 'text-gray-700 dark:text-gray-300'}`}>
                <input
                  type="checkbox"
                  checked={importantOnly}
                  onChange={(e) => setImportantOnly(e.target.checked)}
                  className="w-4 h-4 text-primary rounded"
                />
                ⭐ 这很重要
              </label>
              {p3 ? (
                <SlantButton tone="primary" magentaCorner onClick={() => handleSave()} className="px-8" ariaLabel="保存记录">
                  保存记录
                </SlantButton>
              ) : (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={(e) => { spawnSave(e); handleSave(); }}
                className="relative overflow-hidden px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold shadow-sm shadow-primary/20 cursor-pointer"
              >
                {saveRipples}
                保存
              </motion.button>
              )}
            </div>
          ) : undefined
        }
      >
        {backdateTarget && (
          <p className="text-xs text-amber-600 dark:text-amber-400 -mt-1 mb-3 flex items-center gap-1">
            <span>📅</span>
            <span>记录日期：{backdateTarget.replace(/-/g, '/')}</span>
          </p>
        )}

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述你刚才做了什么..."
          className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:border-primary dark:bg-gray-800 dark:text-white resize-none"
          rows={3}
          autoFocus
        />

        {/*
          ── 分析按钮：双形态 ─────────────────────────────────────
          1) 首次点击 → "分析关键词"：本地 keywordRules 命中规则，立即生效
          2) 之后 → "AI 分析"：把同一段描述交给 AI 给出五维评分，覆写 调整点数
          AI 失败 / 描述太短时按钮仍可重复点（错误提示在下面单独显示）。
        */}
        {!analyzedPoints ? (
          p5 ? (
            /* p5-modal-03 稿：黑长条 + 白字 + 右端灰星，黑硬影错位 */
            <motion.button
              whileTap={{ x: 2, y: 3 }}
              onClick={() => analyzeActivity()}
              disabled={!description.trim()}
              aria-label="分析关键词"
              className="relative mt-4 block w-full cursor-pointer py-3 text-[16px] font-black tracking-wider text-white disabled:cursor-not-allowed"
              style={{ fontFamily: P5_FONT }}
            >
              {/* 禁用态走纯灰面，不用透明度表达状态（用户铁律） */}
              <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: '#000000', clipPath: roughSlant(451, 14, 3) }} />
              <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughSlant(451, 14, 3) }} />
              <span aria-hidden className="absolute inset-[3px]" style={{ background: description.trim() ? '#050505' : '#6b6862', clipPath: roughSlant(452, 13, 2.5) }} />
              <span className="relative">分析关键词</span>
              <svg viewBox="0 0 100 100" className="pointer-events-none absolute -right-2 -top-3 h-12 w-12" aria-hidden>
                <polygon points={starPts(50, 50, 48)} fill="#9b9791" stroke={P5R.paper} strokeWidth="6" strokeLinejoin="miter" />
              </svg>
            </motion.button>
          ) : p3 ? (
            <div className="mt-4 flex justify-center">
              <SlantButton tone="primary" disabled={!description.trim()} onClick={() => analyzeActivity()} className="px-12 text-[17px]" ariaLabel="分析关键词">
                分析关键词
              </SlantButton>
            </div>
          ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={(e) => { spawnAnalyze(e); analyzeActivity(); }}
            disabled={!description.trim()}
            className="relative overflow-hidden w-full mt-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 cursor-pointer"
          >
            {analyzeRipples}
            分析关键词
          </motion.button>
          )
        ) : (
          p3 ? (
            <div className="mt-4 flex justify-center">
              <SlantButton tone="soft" disabled={!description.trim() || aiAnalyzing} onClick={() => void analyzeWithAI()} className="px-12 text-[16px]" ariaLabel="AI 分析">
                {aiAnalyzing ? '⋯ AI 思考中' : '✦ AI 分析'}
              </SlantButton>
            </div>
          ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={(e) => { spawnAnalyze(e); void analyzeWithAI(); }}
            disabled={!description.trim() || aiAnalyzing}
            className="relative overflow-hidden w-full mt-3 bg-gradient-to-r from-primary/15 to-purple-500/15 text-primary dark:text-primary border border-primary/30 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer"
          >
            {analyzeRipples}
            {aiAnalyzing ? '⋯ AI 思考中' : '✦ AI 分析'}
          </motion.button>
          )
        )}

        {/* AI 错误 / 解释提示 */}
        {aiError && (
          <div className="mt-2 text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            AI 分析失败：{aiError}
          </div>
        )}
        {!aiError && aiReason && (
          <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 rounded-lg leading-relaxed">
            <span className="text-primary font-semibold mr-1">AI:</span>
            {aiReason}
          </div>
        )}

        {analyzedPoints && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 space-y-3"
          >
            {p3 ? (
              <SectionMark marker="tri" title="关键词分析" className="pb-1" />
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">调整点数</p>
            )}
            {Object.entries(manualPoints).map(([attr, pts]) => (
              <div key={attr} className="flex items-center justify-between">
                <span className={p3 ? 'text-sm font-black text-[#0a1230]' : 'text-sm text-gray-700 dark:text-gray-300'}>
                  {settings.attributeNames[attr as AttributeId]}
                </span>
                {/* §3.2 统一步进器：0–5 区间沿用原 adjustPoints 的夹紧限制 */}
                <Stepper
                  value={pts}
                  min={0}
                  max={5}
                  onChange={(v) => setManualPoints(prev => ({ ...prev, [attr]: v }))}
                  aria-label={`${settings.attributeNames[attr as AttributeId]}点数`}
                />
              </div>
            ))}
          </motion.div>
        )}
      </SheetModal>

      {/* 弹窗 */}
      <SaveSuccessModal
        isOpen={showSaveSuccess}
        onClose={() => { setShowSaveSuccess(false); setModalBlocker(false); }}
        description={lastSavedDescription}
        pointsAwarded={lastSavedPoints}
        unlockHint={unlockHint}
        tone={lastSavedImportant ? 'important' : 'default'}
      />

      {/*
        ── 长按 → 菜单 → 删除确认（§4.6 协议统一）─────────────────
        旧"两段式删除弹窗"（confirm→choose 状态机）整体移除，改为：
        ActionSheet（z=50）唤出上下文菜单 → ConfirmDialog（z=60）单屏确认。
        三按钮 [取消][仅删除条目][删除并回档] 完整保留旧弹窗的两种删除语义，
        "回档 = 收回该记录获得的点数"的提示并入 description。
      */}
      <ActionSheet
        isOpen={menuActivityId !== null}
        onClose={() => setMenuActivityId(null)}
        title={menuActivity ? truncateText(menuActivity.description, 24) : undefined}
        actions={[
          {
            label: '删除',
            icon: <TrashIcon className="w-4 h-4" />,
            tone: 'danger',
            // 闭包里的 menuActivityId 取自菜单尚在打开的那次渲染；
            // ActionSheet 内部先 onClose 再调本回调，state 置空不影响本次取值
            onClick: () => setDeleteTargetId(menuActivityId),
          },
        ]}
      />
      <ConfirmDialog
        isOpen={deleteTargetId !== null}
        tone="danger"
        title="确认删除这条记录？"
        description={
          deleteTarget
            ? `「${truncateText(deleteTarget.description, 40)}」\n「删除并回档」会同时收回这条记录获得的点数；「仅删除条目」只移除记录本身。`
            : undefined
        }
        actions={[
          // 铁律：取消恒在左、危险操作恒在右
          { label: '取消', onClick: closeDeleteDialog },
          {
            label: '仅删除条目',
            onClick: () => {
              const id = deleteTargetId;
              // 先关弹窗再删：删除后实体即从列表消失，避免退场动画期间文案闪空
              closeDeleteDialog();
              if (id) void handleDeleteRecordOnly(id);
            },
          },
          {
            label: '删除并回档',
            tone: 'danger',
            onClick: () => {
              const id = deleteTargetId;
              closeDeleteDialog();
              if (id) void handleDeleteAndRollback(id);
            },
          },
        ]}
        // actions 模式下不渲染默认双按钮，以下两个回调仅满足必填 props，
        // 并兜底 backdrop / ESC / 安卓返回三条关闭通道
        onConfirm={closeDeleteDialog}
        onCancel={closeDeleteDialog}
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
    </div>
  );
};
