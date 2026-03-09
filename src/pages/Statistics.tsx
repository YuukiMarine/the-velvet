import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { calcMaxStreak } from '@/utils/streak';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { AttributeId } from '@/types';

// ── helpers ──────────────────────────────────────────────────────────────────
const ATTR_COLORS: Record<AttributeId, string> = {
  knowledge: '#3B82F6',
  guts:      '#EF4444',
  dexterity: '#10B981',
  kindness:  '#F59E0B',
  charm:     '#8B5CF6',
};

const formatDate = (d: Date, short = false) =>
  d.toLocaleDateString('zh-CN', short
    ? { month: 'numeric', day: 'numeric' }
    : { year: 'numeric', month: 'numeric', day: 'numeric' });

// ── stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({
  label, value, sub, accent, delay = 0
}: { label: string; value: string | number; sub?: string; accent?: string; delay?: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
    className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-4 flex flex-col gap-1"
  >
    <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">{label}</span>
    <span className={`text-3xl font-black leading-none tabular-nums ${accent ?? 'text-primary'}`}>{value}</span>
    {sub && <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</span>}
  </motion.div>
);

// ── custom tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}：<span className="font-bold tabular-nums">+{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ── growth curve: cumulative total points over time ───────────────────────────
const GrowthCurve = ({ activities }: { activities: ReturnType<typeof useAppStore.getState>['activities'] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
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

  const data = useMemo(() => {
    const sorted = [...activities].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let cumulative = 0;
    const dayMap = new Map<string, number>();
    sorted.forEach(a => {
      const key = toLocalDateKey(new Date(a.date));
      const pts = Object.values(a.pointsAwarded).reduce((s, v) => s + v, 0);
      dayMap.set(key, (dayMap.get(key) ?? 0) + pts);
    });
    return Array.from(dayMap.entries()).map(([date, pts]) => {
      cumulative += pts;
      return { date: formatDate(new Date(date), true), total: cumulative, daily: pts };
    });
  }, [activities]);

  if (data.length < 2) return (
    <div className="h-40 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
      记录更多后这里会出现成长曲线 ✨
    </div>
  );

  // compute nice domain max
  const maxTotal = Math.max(...data.map(d => d.total));

  return (
    <div ref={containerRef} className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={primaryColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={primaryColor} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(156,163,175,0.2)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, Math.ceil(maxTotal * 1.1)]}
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="total"
            name="累计点数"
            stroke={primaryColor}
            strokeWidth={2.5}
            fill="url(#growthGrad)"
            dot={false}
            activeDot={{ r: 4, fill: primaryColor, strokeWidth: 0 }}
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

type DayRecord = { date: string } & Record<string, number>;

// ── per-attribute daily bar/line ──────────────────────────────────────────────
const AttrTrendChart = ({
  data, attrIds, attrNames, range
}: {
  data: DayRecord[];
  attrIds: AttributeId[];
  attrNames: Record<string, string>;
  range: string;
}) => {
  const [activeAttrs, setActiveAttrs] = useState<Set<AttributeId>>(new Set(attrIds));
  const toggle = (id: AttributeId) => setActiveAttrs(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (data.length === 0) return (
    <div className="h-40 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
      {range === '7' ? '近7天' : range === '30' ? '近30天' : '全部'}暂无记录
    </div>
  );

  return (
    <div className="space-y-3">
      {/* legend toggles */}
      <div className="flex flex-wrap gap-1.5">
        {attrIds.map(id => {
          const on = activeAttrs.has(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                on ? 'opacity-100' : 'opacity-30'
              }`}
              style={{ color: ATTR_COLORS[id], background: `${ATTR_COLORS[id]}18` }}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: ATTR_COLORS[id] }} />
              {attrNames[id]}
            </button>
          );
        })}
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(156,163,175,0.2)" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            {attrIds.filter(id => activeAttrs.has(id)).map(id => (
              <Line
                key={id}
                type="monotone"
                dataKey={id}
                name={attrNames[id]}
                stroke={ATTR_COLORS[id]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3.5 }}
                animationDuration={800}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ── main page ─────────────────────────────────────────────────────────────────
export const Statistics = () => {
  const { activities, attributes, settings, setCurrentPage } = useAppStore();
  const [timeRange, setTimeRange] = useState<'7' | '30' | 'all'>('30');

  const filtered = useMemo(() => {
    if (timeRange === 'all') return activities;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(timeRange));
    return activities.filter(a => new Date(a.date) >= cutoff);
  }, [activities, timeRange]);

  const chartData = useMemo(() => {
    // Key by YYYY-MM-DD for correct cross-year sorting, display as M/D
    const dateMap = new Map<string, Record<string, number>>();
    filtered.forEach(a => {
      const key = toLocalDateKey(new Date(a.date));
      if (!dateMap.has(key)) dateMap.set(key, { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 });
      const day = dateMap.get(key)!;
      Object.entries(a.pointsAwarded).forEach(([attr, pts]) => { day[attr] += pts; });
    });
    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([isoKey, pts]) => ({ date: formatDate(new Date(isoKey), true), ...pts } as DayRecord));
  }, [filtered]);

  // ── summary stats ──
  const totalPoints  = attributes.reduce((s, a) => s + a.points, 0);
  const totalRecords = activities.length;
  const uniqueDays   = new Set(activities.map(a => new Date(a.date).toDateString())).size;

  const maxStreak = calcMaxStreak(activities.map(a => a.date));

  // current streak ending today or yesterday
  const ONE_DAY = 86400000;
  const todayStr = new Date().toDateString();
  const yesterStr = new Date(Date.now() - ONE_DAY).toDateString();
  const hasTodayOrYesterday = activities.some(a =>
    new Date(a.date).toDateString() === todayStr || new Date(a.date).toDateString() === yesterStr
  );
  let todayStreak = 0;
  if (hasTodayOrYesterday && activities.length > 0) {
    const uniqueTimestamps = [...new Set(activities.map(a => new Date(a.date).toDateString()))]
      .map(d => new Date(d).getTime()).sort((a, b) => a - b);
    todayStreak = 1;
    for (let i = uniqueTimestamps.length - 1; i > 0; i--) {
      if (uniqueTimestamps[i] - uniqueTimestamps[i - 1] === ONE_DAY) todayStreak++;
      else break;
    }
  }

  // avg points per active day
  const avgPerDay = uniqueDays > 0 ? Math.round(totalPoints / uniqueDays) : 0;

  // most-active attribute
  const attrIds: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
  const attrTotals = attrIds.map(id => ({
    id, total: activities.reduce((s, a) => s + (a.pointsAwarded[id] ?? 0), 0)
  }));
  const topAttr = attrTotals.sort((a, b) => b.total - a.total)[0];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {/* header */}
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setCurrentPage('dashboard')}
          className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Overview</p>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">成长概览</h2>
        </div>
      </div>

      {/* stat grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="累计点数" value={totalPoints} sub="所有属性总和" delay={0} />
        <StatCard label="记录天数" value={uniqueDays} sub={`共 ${totalRecords} 条记录`} delay={0.05} />
        <StatCard label="最长连续" value={`${maxStreak}天`} sub={todayStreak > 0 ? `当前连续 ${todayStreak} 天` : '继续加油！'} delay={0.1} />
        <StatCard label="日均点数" value={avgPerDay} sub={topAttr?.total > 0 ? `最强：${settings.attributeNames[topAttr.id]}` : ''} delay={0.15} />
      </div>

      {/* growth curve */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Progress</p>
            <h3 className="font-black text-gray-900 dark:text-white">成长轨迹</h3>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500">累计点数</span>
        </div>
        <GrowthCurve activities={activities} />
      </motion.div>

      {/* attribute trend */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Attributes</p>
            <h3 className="font-black text-gray-900 dark:text-white">属性趋势</h3>
          </div>
          {/* time range tabs */}
          <div className="flex gap-1">
            {([['7', '7天'], ['30', '30天'], ['all', '全部']] as [string, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTimeRange(v as '7' | '30' | 'all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  timeRange === v
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={timeRange}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AttrTrendChart
              data={chartData}
              attrIds={attrIds}
              attrNames={settings.attributeNames}
              range={timeRange}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* per-attribute breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-5"
      >
        <div className="mb-4">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Breakdown</p>
          <h3 className="font-black text-gray-900 dark:text-white">属性分布</h3>
        </div>
        <div className="space-y-3">
          {[...attrTotals].sort((a, b) => b.total - a.total).map((item, i) => {
            const attr = attributes.find(a => a.id === item.id);
            const maxTotal = Math.max(...attrTotals.map(a => a.total), 1);
            const pct = Math.round((item.total / maxTotal) * 100);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.45 + i * 0.06 }}
                className="space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {settings.attributeNames[item.id]} {attr ? `Lv.${attr.level}` : ''}
                  </span>
                  <span className="tabular-nums text-gray-400 dark:text-gray-500 font-medium">{item.total} pts</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: 0.5 + i * 0.06, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: ATTR_COLORS[item.id] }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
};
