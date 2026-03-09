import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { TodoCompleteModal } from '@/components/TodoCompleteModal';
import { PageTitle } from '@/components/PageTitle';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';

// Seeded random: picks a stable index per session (changes on every page open)
const sessionSeed = Math.random();
const pick = (arr: string[]) => arr[Math.floor(sessionSeed * arr.length)];

const GREETINGS: Record<string, string[]> = {
  dawn:    ['n，新的一天开始了', 'n，晨光已到，起身了', 'n，早安，今天也要加油', 'n，清晨的空气真好'],
  morning: ['n，上午好呀', 'n，精神抖擞地来了', 'n，今天也是充满可能的一天', 'n，感觉今天会很顺利'],
  noon:    ['n，午安', 'n，吃饭了吗', 'n，中午好，休息一下吧', 'n，下午前先补充点能量'],
  afternoon: ['n，下午好', 'n，继续保持状态', 'n，距离傍晚还有一段时光', 'n，喝点水，动一动'],
  dusk:    ['n，傍晚好', 'n，今天辛苦了', 'n，夕阳西下，你还在努力', 'n，快到收工时间了'],
  evening: ['n，晚上好', 'n，夜幕降临了', 'n，今天过得怎么样', 'n，享受安静的夜晚吧'],
  night:   ['n，还没睡呀', 'n，夜深了，注意休息', 'n，深夜的努力有人看见', 'n，该去睡觉了'],
};

const SUBTEXTS: Record<string, string[]> = {
  dawn:    ['🌅 新的一天，从现在开始', '🌄 破晓时分，充满希望', '🌿 清晨最是宝贵的时光', '☀️ 早起的鸟儿有虫吃'],
  morning: ['☀️ 上午阳光正好，继续加油', '🍵 来杯茶，开始高效的上午', '💪 今天的努力从这里出发', '🎯 专注一件事，今天就够了'],
  noon:    ['🍽️ 记得好好吃饭休息', '😴 午休一会儿，下午更清醒', '🌞 日正当中，能量满格', '🥗 犒劳一下自己吧'],
  afternoon: ['🌤️ 喝杯水，起来活动一下', '📖 下午适合深度学习', '🎵 放首歌，找回状态', '🌿 离目标又近了一步'],
  dusk:    ['🌇 今天的努力都算数', '🌆 收获感悟的黄金时刻', '🍊 傍晚散个步，清空思绪', '✨ 夕阳下的你格外有魅力'],
  evening: ['🌙 享受宁静的夜晚时光', '📝 记录今天的收获吧', '🕯️ 夜晚适合沉淀与反思', '🎮 适当放松，明天更精彩'],
  night:   ['🌟 注意休息，明天继续', '🌙 夜深了，给自己点掌声', '💫 深夜努力的人终会发光', '🛌 好好睡一觉，明天见'],
};

const getSlot = (h: number) => {
  if (h >= 5  && h < 9)  return 'dawn';
  if (h >= 9  && h < 12) return 'morning';
  if (h >= 12 && h < 14) return 'noon';
  if (h >= 14 && h < 17) return 'afternoon';
  if (h >= 17 && h < 19) return 'dusk';
  if (h >= 19 && h < 22) return 'evening';
  return 'night';
};

const getTimeGreeting = (userName: string) => {
  const slot = getSlot(new Date().getHours());
  return pick(GREETINGS[slot]).replace('n', userName);
};

const getTimeSubtext = () => {
  const slot = getSlot(new Date().getHours());
  return pick(SUBTEXTS[slot]);
};

// Level colors: a progression from cool to warm
const LV_COLORS = [
  { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', bar: 'bg-slate-400' },
  { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-600 dark:text-sky-400', bar: 'bg-sky-500' },
  { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-500' },
  { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-600 dark:text-purple-400', bar: 'bg-purple-500' },
  { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-600 dark:text-pink-400', bar: 'bg-pink-500' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  { bg: 'bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40', text: 'text-amber-700 dark:text-amber-300', bar: 'bg-gradient-to-r from-amber-400 to-orange-400' },
];

// Reads --color-primary from CSS and renders the radar chart
const RadarChartPanel = ({ radarData, maxLevel }: { radarData: { attribute: string; value: number }[]; maxLevel: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');

  // Re-read color whenever theme attribute changes on <html>
  useEffect(() => {
    const readColor = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
      if (raw) setPrimaryColor(raw);
    };
    readColor();
    const observer = new MutationObserver(readColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Ensure every value is a finite positive number so Recharts draws the polygon
  // (all-zero produces a single invisible point at center)
  const MIN_VIS = 0.08; // tiny sliver so shape is always visible
  const safeData = radarData.map(d => ({
    ...d,
    value: isFinite(d.value) && d.value > 0 ? d.value : MIN_VIS,
  }));

  // Don't render until we actually have data
  if (safeData.length === 0) return <div className="h-52 w-full flex items-center justify-center text-xs text-gray-400">加载中…</div>;

  return (
    <div ref={containerRef} className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={safeData} outerRadius="70%">
          <PolarGrid stroke="#d1d5db" strokeDasharray="" />
          <PolarAngleAxis
            dataKey="attribute"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
          />
          <PolarRadiusAxis angle={90} domain={[0, maxLevel]} tick={false} axisLine={false} />
          <Radar
            name="属性"
            dataKey="value"
            stroke={primaryColor}
            fill={primaryColor}
            fillOpacity={0.2}
            strokeWidth={2.5}
            animationDuration={800}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

const ATTR_ORDER_KEY = 'attr-card-order';
const ATTR_WIDE_KEY  = 'attr-card-wide';   // which id (if any) is wide (col-span-2)

// DropTarget for the last row: 'half' = normal half-width, 'wide' = full-width, null = nothing
type LastRowDrop = 'half' | 'wide' | null;

const AttributeGrid = ({ attributes, settings }: {
  attributes: ReturnType<typeof useAppStore.getState>['attributes'];
  settings: ReturnType<typeof useAppStore.getState>['settings'];
}) => {
  // --- persistent order ---
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(ATTR_ORDER_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const ids = attributes.map(a => a.id as string);
        if (parsed.length === ids.length && ids.every(id => parsed.includes(id))) return parsed;
      }
    } catch { /* ignore */ }
    return attributes.map(a => a.id as string);
  });

  // which id is wide (col-span-2); only the last positionally-odd card can be wide
  const [wideId, setWideId] = useState<string | null>(() => {
    try { return localStorage.getItem(ATTR_WIDE_KEY); } catch { return null; }
  });

  useEffect(() => {
    const ids = attributes.map(a => a.id as string);
    setOrder(prev => {
      const next = [...prev.filter(id => ids.includes(id)), ...ids.filter(id => !prev.includes(id))];
      return next;
    });
  }, [attributes]);

  useEffect(() => { localStorage.setItem(ATTR_ORDER_KEY, JSON.stringify(order)); }, [order]);
  useEffect(() => {
    if (wideId) localStorage.setItem(ATTR_WIDE_KEY, wideId);
    else localStorage.removeItem(ATTR_WIDE_KEY);
  }, [wideId]);

  // --- edit mode (tap header button to enter/exit) ---
  const [editMode, setEditMode] = useState(false);

  // --- drag state (pointer-based, only active in editMode) ---
  const [dragId, setDragId]   = useState<string | null>(null);
  const [overId, setOverId]   = useState<string | null>(null);
  // for the last-row ghost drop zone
  const [lastRowDrop, setLastRowDrop] = useState<LastRowDrop>(null);

  const isDragging = dragId !== null;
  const gridRef    = useRef<HTMLDivElement>(null);
  const cardRefs   = useRef<Map<string, HTMLDivElement>>(new Map());
  const activePointerId = useRef<number | null>(null);
  // Track whether pointer moved enough to count as a drag (vs a tap)
  const dragMoved = useRef(false);
  const dragStartX = useRef<number>(0);
  const dragStartY = useRef<number>(0);

  // Non-passive touchmove: block scroll only during active drag
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const blockScroll = (e: TouchEvent) => {
      if (isDragging) e.preventDefault();
    };
    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, [isDragging]);

  const onPointerDown = (id: string, e: React.PointerEvent) => {
    if (!editMode) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragMoved.current = false;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    activePointerId.current = e.pointerId;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(20);
    setDragId(id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    if (e.pointerId !== activePointerId.current) return;
    const x = e.clientX;
    const y = e.clientY;

    // track whether user actually moved
    if (!dragMoved.current) {
      const dist = Math.hypot(x - dragStartX.current, y - dragStartY.current);
      if (dist > 4) dragMoved.current = true;
    }

    // find which card the pointer is over
    let foundId: string | null = null;
    cardRefs.current.forEach((el, id) => {
      if (id === dragId) return;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        foundId = id;
      }
    });
    setOverId(foundId);

    // detect if we're hovering the last-row ghost zone
    if (gridRef.current) {
      const gridRect = gridRef.current.getBoundingClientRect();
      const ghostEl  = gridRef.current.querySelector('[data-ghost]') as HTMLElement | null;
      if (ghostEl) {
        const gr = ghostEl.getBoundingClientRect();
        if (x >= gr.left && x <= gr.right && y >= gr.top && y <= gr.bottom) {
          const relX = x - gr.left;
          setLastRowDrop(relX < gr.width * 0.35 ? 'half' : 'wide');
          setOverId(null);
          return;
        }
      }
      const lastRow = Array.from(cardRefs.current.values()).reduce<number>((max, el) => {
        return Math.max(max, el.getBoundingClientRect().bottom);
      }, 0);
      if (y > lastRow && x >= gridRect.left && x <= gridRect.right) {
        const relX = x - gridRect.left;
        setLastRowDrop(relX < gridRect.width * 0.35 ? 'half' : 'wide');
        setOverId(null);
        return;
      }
    }
    setLastRowDrop(null);
  };

  const onPointerUp = (id: string, _e: React.PointerEvent) => {
    if (!isDragging) { activePointerId.current = null; return; }

    // tap (no movement) on wide card → shrink it
    if (!dragMoved.current && id === wideId) {
      setWideId(null);
    } else if (dragMoved.current) {
      // commit the drop
      if (lastRowDrop !== null && dragId) {
        setOrder(prev => {
          const next = prev.filter(i => i !== dragId);
          next.push(dragId);
          return next;
        });
        setWideId(lastRowDrop === 'wide' ? dragId : null);
      } else if (overId && dragId && overId !== dragId) {
        setOrder(prev => {
          const fromIdx = prev.indexOf(dragId);
          const toIdx   = prev.indexOf(overId);
          const next    = [...prev];
          next.splice(fromIdx, 1);
          next.splice(toIdx, 0, dragId);
          return next;
        });
        if (wideId === dragId) setWideId(null);
      }
    }

    setDragId(null);
    setOverId(null);
    setLastRowDrop(null);
    activePointerId.current = null;
  };

  const onPointerCancel = () => {
    setDragId(null);
    setOverId(null);
    setLastRowDrop(null);
    activePointerId.current = null;
  };

  // sorted attrs
  const sortedAttrs = order.map(id => attributes.find(a => a.id === id)!).filter(Boolean);

  // figure out last position — the card that would be alone in its row
  const lastIdxInOddRow = sortedAttrs.length % 2 !== 0 ? sortedAttrs.length - 1 : -1;
  const lastId          = lastIdxInOddRow >= 0 ? sortedAttrs[lastIdxInOddRow].id : null;
  const effectiveWideId = lastId === wideId ? wideId : null; // only valid if it's actually last

  // show ghost zone when dragging AND dragged card is not already last
  const showGhost = isDragging && dragId !== lastId;

  return (
    <div
      ref={gridRef}
      onPointerMove={onPointerMove}
      style={{ userSelect: 'none' }}
    >
      <div className="flex items-center justify-between mb-3 px-0.5">
        <PageTitle title="人格指数" en="parameter" />
        <button
          onClick={() => { setEditMode(v => !v); setDragId(null); setOverId(null); setLastRowDrop(null); }}
          className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors select-none ${
            editMode
              ? 'bg-primary text-white'
              : 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800'
          }`}
        >
          {editMode ? '完成' : '排序'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {sortedAttrs.map((attr) => {
          const isWide     = attr.id === effectiveWideId;
          const isDragCard = attr.id === dragId;
          const isOverCard = attr.id === overId;

          const attrThresholds = settings.levelThresholds?.length ? settings.levelThresholds : attr.levelThresholds;
          const lvlMax      = attrThresholds.length;
          const isMax       = attr.level >= lvlMax;
          const curThreshold  = attr.level > 1 ? attrThresholds[attr.level - 1] : 0;
          const nextThreshold = !isMax ? attrThresholds[attr.level] : attrThresholds[lvlMax - 1];
          const pct = isMax ? 100 : Math.min(100, ((attr.points - curThreshold) / (nextThreshold - curThreshold)) * 100);
          const attrName   = settings.attributeNames[attr.id as keyof typeof settings.attributeNames];
          const colorTier  = LV_COLORS[Math.min(attr.level - 1, LV_COLORS.length - 1)];

          return (
            <motion.div
              key={attr.id}
              layout
              ref={(el) => { if (el) cardRefs.current.set(attr.id, el); else cardRefs.current.delete(attr.id); }}
              animate={{ opacity: isDragCard ? 0.35 : 1, scale: isOverCard ? 1.03 : 1 }}
              transition={{ duration: 0.15 }}
              onPointerDown={editMode ? (e) => onPointerDown(attr.id, e) : undefined}
              onPointerUp={editMode ? (e) => onPointerUp(attr.id, e) : undefined}
              onPointerCancel={editMode ? () => onPointerCancel() : undefined}
              style={{ touchAction: editMode ? 'none' : 'pan-y' }}
              className={`relative rounded-2xl bg-white dark:bg-gray-900 border shadow-sm overflow-hidden flex flex-col transition-colors ${
                editMode
                  ? isDragCard
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : ''
              } ${
                isOverCard
                  ? 'border-primary/60 dark:border-primary/50 shadow-md'
                  : editMode
                  ? 'border-primary/30 dark:border-primary/20'
                  : 'border-gray-100 dark:border-gray-800'
              } ${isWide ? 'col-span-2' : ''}`}
            >
              {/* edit mode: wide-card tap-to-shrink hint */}
              {editMode && isWide && (
                <div className="absolute top-2 right-3 text-[9px] text-primary/60 dark:text-primary/50 select-none">点击收起</div>
              )}

              {/* Card body */}
              <div className="flex items-start justify-between px-4 pt-4 pb-3">
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{attrName}</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${colorTier.text} opacity-70`}>LV</span>
                    <span
                      className={`font-black leading-none tabular-nums ${colorTier.text} ${isMax ? 'text-2xl' : 'text-4xl'}`}
                      style={{ letterSpacing: '-0.03em' }}
                    >
                      {isMax ? 'MAX' : attr.level}
                    </span>
                  </div>
                </div>
                <div className="text-right mt-1">
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
                    {isMax ? '满级' : `${attr.points}`}
                  </span>
                  {!isMax && (
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 tabular-nums">/{nextThreshold}</p>
                  )}
                </div>
              </div>

              {/* Progress bar + hint */}
              <div className="mt-auto px-4 pb-4">
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'var(--color-primary)', opacity: 0.85 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                {!isMax && (
                  <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                    差 <span className="font-semibold">{nextThreshold - attr.points}</span> 升 Lv.{attr.level + 1}
                  </p>
                )}
              </div>

              {/* Bottom accent strip */}
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 opacity-40"
                style={{ background: 'linear-gradient(to right, transparent, var(--color-primary), transparent)' }}
              />
            </motion.div>
          );
        })}

        {/* Ghost drop zone — shown when dragging a non-last card */}
        {showGhost && (
          <motion.div
            data-ghost
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={`rounded-2xl border-2 border-dashed flex items-center justify-center h-24 transition-all ${
              lastRowDrop === 'wide'
                ? 'col-span-2 border-primary bg-primary/5'
                : lastRowDrop === 'half'
                ? 'col-span-1 border-primary bg-primary/5'
                : 'col-span-2 border-gray-200 dark:border-gray-700'
            }`}
          >
            <span className="text-xs text-gray-400 dark:text-gray-500 pointer-events-none select-none">
              {lastRowDrop === 'wide' ? '放开 → 占满一行' : lastRowDrop === 'half' ? '放开 → 等宽' : '拖到这里'}
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
};

// Returns true if the hex color is perceptually light (luminance > 0.4)
const isLightColor = (hex: string): boolean => {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  // sRGB luminance
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4;
};

export const Dashboard = () => {
  const { attributes, dailyEvent, user, settings, todos, activities, achievements, skills, completeTodo, getTodayTodoProgress, setModalBlocker, setCurrentPage, applyCountercurrentDecay, getCountercurrentWarnings } = useAppStore();
  const [completedTitle, setCompletedTitle] = useState<string | null>(null);
  const [unlockHint, setUnlockHint] = useState<{ achievements: number; skills: number }>({ achievements: 0, skills: 0 });
  // 逆流衰减弹窗
  const [decayedAttrs, setDecayedAttrs] = useState<import('@/types').AttributeId[]>([]);

  // Detect primary color luminance for banner text contrast
  const [bannerLight, setBannerLight] = useState(false);
  useEffect(() => {
    const check = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
      if (raw) setBannerLight(isLightColor(raw));
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // 逆流：进入首页时检查并执行衰减
  useEffect(() => {
    if (!settings.countercurrentEnabled) return;
    applyCountercurrentDecay().then(decayed => {
      if (decayed.length > 0) setDecayedAttrs(decayed);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.countercurrentEnabled]);

  // 逆流预警（今天是第3日无增长，明天将扣减）
  const countercurrentWarnings = settings.countercurrentEnabled ? getCountercurrentWarnings() : [];

  // In dark mode the UI background is dark, so light text always reads better on the colored banner
  const useLightText = settings.darkMode || !bannerLight;
  const textClass = useLightText ? 'text-white' : 'text-black/90';
  const textMutedClass = useLightText ? 'text-white/70' : 'text-black/50';
  const textSecondaryClass = useLightText ? 'text-white/80' : 'text-black/60';
  const trackClass = useLightText ? 'bg-white/20' : 'bg-black/10';

  const thresholds = settings.levelThresholds?.length ? settings.levelThresholds : (attributes[0]?.levelThresholds ?? []);
  const maxLevel = thresholds.length || 5;

  const radarData = attributes.map(attr => {
    const attrThresholds = settings.levelThresholds?.length ? settings.levelThresholds : attr.levelThresholds;
    const lvlMax = attrThresholds.length;
    const curThreshold = attr.level > 1 ? attrThresholds[attr.level - 1] : 0;
    const nextThreshold = attr.level < lvlMax ? attrThresholds[attr.level] : attrThresholds[lvlMax - 1];
    const span = nextThreshold - curThreshold;
    const progressInLevel = attr.level < lvlMax
      ? (span > 0 ? (attr.points - curThreshold) / span : 0)
      : 1;
    const value = attr.level >= lvlMax ? lvlMax : (attr.level - 1) + progressInLevel;
    return {
      attribute: settings.attributeNames[attr.id as keyof typeof settings.attributeNames],
      value: isFinite(value) ? value : 0,
    };
  });

  const today = new Date();
  const todayWeekday = today.getDay();
  const todayKey = toLocalDateKey(today);

  const todayTodos = [...todos.filter(todo => {
    const matchesWeekday = !todo.weekdays || todo.weekdays.length === 0 || todo.weekdays.includes(todayWeekday);
    if (todo.isActive && matchesWeekday) return true;
    if (!todo.isActive && todo.archivedAt) {
      const archivedKey = toLocalDateKey(new Date(todo.archivedAt));
      if (archivedKey === todayKey && matchesWeekday) {
        const target = todo.frequency === 'count' ? (todo.targetCount || 1) : 1;
        const progress = getTodayTodoProgress(todo.id);
        return progress.count >= target;
      }
    }
    return false;
  })].sort((a, b) => {
    if (a.important && !b.important) return -1;
    if (!a.important && b.important) return 1;
    return 0;
  });

  const completedCount = todayTodos.filter(t => getTodayTodoProgress(t.id).isComplete).length;
  const totalCount = todayTodos.length;

  // 统计数据
  const totalPoints = attributes.reduce((sum, attr) => sum + attr.points, 0);
  const totalActivitiesCount = activities.length;
  const unlockedAchievementsCount = achievements.filter(a => a.unlocked).length;
  const unlockedSkillsCount = skills.filter(s => s.unlocked).length;
  const uniqueDays = new Set(activities.map(a => new Date(a.date).toDateString())).size;
  const uniqueTimestamps = [...new Set(activities.map(a => new Date(a.date).toDateString()))]
    .map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const ONE_DAY = 86400000;
  let maxStreak = uniqueTimestamps.length > 0 ? 1 : 0;
  let currentStreak = 1;
  for (let i = 1; i < uniqueTimestamps.length; i++) {
    if (uniqueTimestamps[i] - uniqueTimestamps[i - 1] === ONE_DAY) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-5 max-w-2xl mx-auto md:max-w-none"
    >
      {/* 竖屏炫酷标题 — 仅在非宽屏显示，banner正上方 */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="md:hidden select-none px-1"
      >
        <style>{`
          @keyframes vr-flow {
            0%   { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
          }
          .vr-title-light {
            background: linear-gradient(90deg, #111 0%, #555 20%, #999 40%, #333 60%, #111 80%, #555 100%);
            background-size: 200% auto;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: vr-flow 5s linear infinite;
          }
          .dark .vr-title-dark {
            background: linear-gradient(90deg, #fff 0%, #aaa 20%, #e0e0e0 40%, #bbb 60%, #fff 80%, #aaa 100%);
            background-size: 200% auto;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: vr-flow 5s linear infinite;
          }
        `}</style>

        {/* 欢迎来到 — 与标题左边对齐，ml-0.5 微调 */}
        <span className="block text-[11px] font-semibold tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-1 leading-none ml-0.5">
          欢迎来到
        </span>

        {/* 主标题容器：relative 供 Velvet Room 绝对定位 */}
        <div className="relative inline-block">
          <h1
            className={`text-[3.25rem] font-black leading-none ${settings.darkMode ? 'vr-title-dark' : 'vr-title-light'}`}
            style={{ letterSpacing: '-0.04em' }}
          >
            天鹅绒房间
          </h1>

          {/* Velvet Room — 叠加在标题右下角 */}
          <span
            className="absolute -bottom-1.5 -right-1 text-lg leading-none text-primary opacity-75 pointer-events-none"
            style={{ fontFamily: "'Caveat', cursive", fontWeight: 600 }}
          >
            Velvet Room
          </span>
        </div>

        {/* 装饰性分隔线 */}
        <div className="mt-2.5 h-px bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
      </motion.div>

      {/* 顶部问候卡 */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-5 shadow-lg shadow-primary/20"
        style={{ background: 'color-mix(in srgb, color-mix(in hsl, var(--color-primary) 30%, gray) 92%, transparent)' }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <p className={`text-xs mb-1.5 ${textMutedClass}`}>{getTimeSubtext()}</p>
            <h2 className={`text-2xl font-black tracking-tight leading-tight ${textClass}`}>{getTimeGreeting(user?.name || '朋友')}</h2>
          </div>
          <div className="flex flex-col items-center gap-0 flex-shrink-0">
            <div className={`text-4xl font-black leading-none tabular-nums ${textClass}`} style={{ letterSpacing: '-0.03em' }}>
              {String(today.getDate()).padStart(2, '0')}
            </div>
            <div className={`text-[10px] font-bold tracking-widest uppercase text-center ${textMutedClass}`}>
              {today.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
            </div>
            <div className={`text-[10px] font-medium px-1.5 py-0.5 rounded mt-1 ${useLightText ? 'bg-white/15 text-white/90' : 'bg-black/10 text-black/70'}`}>
              {today.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
            </div>
          </div>
        </div>
        {totalCount > 0 && (
          <div className="mt-4">
            <div className={`flex items-center justify-between text-sm mb-1.5 ${textSecondaryClass}`}>
              <span>今日进度</span>
              <span>{completedCount}/{totalCount} 项完成</span>
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${trackClass}`}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(to right, #EF4444, #3B82F6, #F59E0B)' }}
                initial={{ width: 0 }}
                animate={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* 今日待办 */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-0.5">Today</p>
            <h3 className="font-extrabold text-gray-900 dark:text-white">今日待办</h3>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
            {totalCount === 0 ? '暂无' : `${completedCount}/${totalCount}`}
          </span>
        </div>

        {todayTodos.length === 0 ? (
          <div className="px-5 pb-5 text-center text-sm text-gray-400 dark:text-gray-500 py-8">
            今日暂无待办，去「待办」页添加吧
          </div>
        ) : (
          <div className="px-3 pb-3 space-y-2">
            {todayTodos.map((todo, i) => {
              const progress = getTodayTodoProgress(todo.id);
              const attrName = settings.attributeNames[todo.attribute as keyof typeof settings.attributeNames];
              const pct = Math.min(100, (progress.count / progress.target) * 100);

              return (
                <motion.button
                  key={todo.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileTap={progress.isComplete ? undefined : { scale: 0.985 }}
                  disabled={progress.isComplete}
                  onClick={async () => {
                    const result = await completeTodo(todo.id);
                    const updated = getTodayTodoProgress(todo.id);
                    if (updated.isComplete) {
                      setCompletedTitle(todo.title);
                      setUnlockHint(result?.unlockHints ?? { achievements: 0, skills: 0 });
                      setModalBlocker(true);
                    }
                  }}
                  className={`w-full text-left rounded-xl px-4 py-3.5 transition-all duration-150 cursor-pointer ${
                    progress.isComplete
                      ? 'bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed'
                      : todo.important
                      ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-700/50 hover:border-amber-300 dark:hover:border-amber-600'
                      : 'bg-gray-50 dark:bg-gray-800/60 border border-transparent hover:border-primary/20 hover:bg-primary/5 dark:hover:bg-primary/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* 完成圆圈 */}
                    <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      progress.isComplete
                        ? 'bg-primary border-primary'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {progress.isComplete && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {todo.important && (
                          <span className="text-amber-500 text-xs">⭐</span>
                        )}
                        <span className={`font-medium text-sm truncate ${
                          progress.isComplete ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-white'
                        }`}>
                          {todo.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {attrName} +{todo.points}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          · {progress.count}/{progress.target}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 进度条（所有任务都显示） */}
                  <div className="mt-2.5 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'color-mix(in hsl, var(--color-primary) 70%, gray)' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* 每日事件（移到今日待办下面） */}
      {dailyEvent && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-4"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl flex-shrink-0">⚡</div>
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">{dailyEvent.title}</p>
              <p className="text-amber-700/80 dark:text-amber-400/80 text-xs mt-0.5">
                {dailyEvent.description.replace(/\*\*/g, settings.attributeNames[dailyEvent.effect.attribute as keyof typeof settings.attributeNames])}
                &nbsp;·&nbsp;
                {settings.attributeNames[dailyEvent.effect.attribute as keyof typeof settings.attributeNames]} × {dailyEvent.effect.multiplier}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* 逆流预警 */}
      {countercurrentWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-blue-200 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center gap-3"
        >
          <span className="text-lg flex-shrink-0">🌊</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">逆流预警</p>
            <p className="text-[11px] text-blue-700/80 dark:text-blue-400/80 mt-0.5">
              {countercurrentWarnings.map(id => settings.attributeNames[id]).join('、')} 已连续3日无增长，明日将{countercurrentWarnings.length > 1 ? '各' : ''}扣减 1 点
            </p>
          </div>
        </motion.div>
      )}

      {/* 属性面板 — 可拖拽卡片网格 */}
      <AttributeGrid attributes={attributes} settings={settings} />

      {/* 成长概览 — 雷达图 + 数据合一 */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm">成长概览</h3>
          <button
            onClick={() => setCurrentPage('statistics')}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            详细统计 →
          </button>
        </div>
        <RadarChartPanel radarData={radarData} maxLevel={maxLevel} />
        <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
          <div className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-primary tabular-nums">{totalPoints}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">累计点数</div>
          </div>
          <div className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-primary tabular-nums">{maxStreak}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">最长连续天</div>
          </div>
          <div className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-primary tabular-nums">{totalActivitiesCount}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">总记录数</div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
          <div className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-amber-500 tabular-nums">{unlockedAchievementsCount}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">成就已解锁</div>
          </div>
          <div className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-violet-500 tabular-nums">{unlockedSkillsCount}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">技能已解锁</div>
          </div>
          <div className="px-3 py-3 text-center">
            <div className="text-xl font-bold text-emerald-500 tabular-nums">{uniqueDays}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">记录天数</div>
          </div>
        </div>
      </div>

      <TodoCompleteModal
        isOpen={!!completedTitle}
        onClose={() => {
          setCompletedTitle(null);
          setModalBlocker(false);
        }}
        title={completedTitle || ''}
        unlockHint={unlockHint}
      />

      {/* 逆流衰减通知 */}
      <AnimatePresence>
        {decayedAttrs.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setDecayedAttrs([])}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 260 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="text-4xl mb-3">🌊</div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">逆流侵蚀</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  以下属性连续3日无增长，已各扣减 1 点
                </p>
              </div>
              <div className="space-y-2 mb-5">
                {decayedAttrs.map(id => (
                  <div key={id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                    <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">{settings.attributeNames[id]}</span>
                    <span className="text-sm font-bold text-red-500">−1</span>
                  </div>
                ))}
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setDecayedAttrs([])}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold"
              >
                知道了
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
