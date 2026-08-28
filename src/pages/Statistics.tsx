import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { calcMaxStreak, streakDates } from '@/utils/streak';
import { BackButton } from '@/components/BackButton';
import { PageTitle } from '@/components/PageTitle';
import { PagePlane, PlaneLevel } from '@/components/PagePlane';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, P3PageHeader, SectionMark, slantClip } from '@/components/p3r/kit';
import {
  P5R, P5_FONT, roughQuad,
  P5Collage, P5SubBar, P5Star, P5Dots, P5Slab, P5RPage,
  P5Panel, P5Rough, P5Wedge, P5AttrGlyph,
} from '@/components/p5r/kit';
import { useBoldness } from '@/utils/boldness';
import type { ReactNode } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { AttributeId } from '@/types';
import { P4Flower, P4Sparkle, P4SkyCircle, P4ArcRings, P4_HEADER_BLEED } from '@/ui/p4Kit';

/** P4 属性分布五瓣花牌配色（p4-statistics-reference-v2 采样：绿/蓝/橙/粉/紫） */
const P4_ATTR_COLORS: Record<AttributeId, string> = {
  knowledge: '#7cc86b',
  guts:      '#5aa7e8',
  dexterity: '#f5a33c',
  kindness:  '#f08ca8',
  charm:     '#b58fe0',
};

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
}: { label: string; value: string | number; sub?: string; accent?: string; delay?: number }) => {
  const p3 = useUiChannel() === 'p3';

  // P3R（p3-statistics 设计稿四格）：白斜块 + 左缘蓝竖斜片 + 大蓝斜体数字
  if (p3) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.4 }}
        className="relative overflow-hidden px-3.5 py-3"
        style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)', background: P3R.panelGlass, boxShadow: '0 8px 18px rgba(38,96,140,0.07)' }}
      >
        <span aria-hidden className="absolute left-2 top-2.5 bottom-2.5 w-[4px]" style={{ background: P3R.blue, transform: 'skewX(-18deg)' }} />
        <div className="flex min-w-0 flex-col gap-1 pl-3.5">
          <span className="text-[11px] font-black leading-tight" style={{ color: P3R.ink }}>{label}</span>
          <span className="text-[21px] font-black italic leading-none tabular-nums" style={{ color: P3R.blue }}>{value}</span>
          {sub && <span className="mt-0.5 truncate text-[10px] font-semibold" style={{ color: P3R.grey }}>{sub}</span>}
        </div>
      </motion.div>
    );
  }

  return (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
    className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-4"
  >
    <PlaneLevel className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">{label}</span>
      <span className={`text-3xl font-black leading-none tabular-nums ${accent ?? 'text-primary'}`}>{value}</span>
      {sub && <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</span>}
    </PlaneLevel>
  </motion.div>
  );
};

// ── P5R（红频道）：p5-statistics-flat-newsprint-v1 1:1 ────────────────────────
/** 稿上五属性的分色：三色律内取（红/黑/橙/灰/暗红），不引第三方色相 */
const P5_ATTR_COLORS: Record<AttributeId, string> = {
  knowledge: P5R.red,
  guts:      P5R.ink,
  dexterity: P5R.orange,
  kindness:  P5R.grey,
  charm:     P5R.redDeep,
};

/** 节卡：纸面不规则四边形 + 黑楔标骑在上缘（稿上四个区块都是这个制式） */
const P5SectionCard = ({ seed, title, meta, children, bodyClassName = 'px-3.5 pb-4 pt-8' }: {
  seed: number;
  title: string;
  /** 卡内右上角挂件（「累计点数」/ 时间段段钮），与楔标同一行 */
  meta?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) => (
  <div className="relative">
    <P5Panel seed={seed} jag={8} frame={3.5} keyline={2.5} shadow={{ x: 5, y: 6 }} bodyClassName={bodyClassName}>
      {meta && <div className="absolute right-0 top-0 z-10">{meta}</div>}
      {children}
    </P5Panel>
    {/* 楔标压在卡的上缘外沿——稿上标签是「贴上去」的另一张纸，不是卡的一部分 */}
    <div className="absolute -top-3 left-2.5">
      <P5Wedge tone="ink" rot={-1.8} starSide="left">{title}</P5Wedge>
    </div>
  </div>
);

/** 图表浮层（不规则纸片 + 不等宽黑框，沿用 P5Rough 垫底） */
const P5Tooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="relative px-3 py-2">
      <P5Rough seed={211} jag={4} frame={2.5} shadow={{ x: 3, y: 3 }} />
      <div className="relative">
        <p className="mb-0.5 text-[11px] font-black" style={{ color: P5R.ink, fontFamily: P5_FONT }}>{label}</p>
        {payload.map(p => (
          <p key={p.name} className="text-[11px] font-black tabular-nums" style={{ color: p.color === '#000000' ? P5R.ink : p.color }}>
            {p.name} +{p.value}
          </p>
        ))}
      </div>
    </div>
  );
};

/** 成长轨迹：黑折线 + 红实心填充 + 纸白圆点，灰巨星水印压在轴区背后 */
const GrowthCurveP5 = ({ activities }: { activities: ReturnType<typeof useAppStore.getState>['activities'] }) => {
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

  if (data.length < 2) {
    return (
      <div className="relative flex h-[170px] items-center justify-center">
        <P5Star size={124} fill={P5R.paperDim} className="pointer-events-none absolute" style={{ left: '50%', top: '48%', transform: 'translate(-50%,-50%)' }} />
        <span className="relative text-[13px] font-black" style={{ color: P5R.grey, fontFamily: P5_FONT }}>记录更多后这里会出现成长轨迹</span>
      </div>
    );
  }
  const maxTotal = Math.max(...data.map(d => d.total));

  return (
    <div className="relative h-[200px]">
      <P5Star size={136} fill={P5R.paperDim} className="pointer-events-none absolute" style={{ left: '48%', top: 2, transform: 'translateX(-50%)' }} />
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#3a3831', fontWeight: 800 }}
            tickLine={false}
            axisLine={{ stroke: P5R.ink, strokeWidth: 2.5 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, Math.ceil(maxTotal * 1.1)]}
            allowDecimals={false}
            tick={{ fontSize: 10, fill: '#3a3831', fontWeight: 800 }}
            tickLine={false}
            axisLine={{ stroke: P5R.ink, strokeWidth: 2.5 }}
          />
          <Tooltip content={<P5Tooltip />} cursor={{ stroke: P5R.ink, strokeWidth: 1.5 }} />
          <Area
            type="linear"
            dataKey="total"
            name="累计点数"
            stroke={P5R.ink}
            strokeWidth={3.4}
            fill={P5R.red}
            fillOpacity={1}
            dot={{ r: 4.4, fill: P5R.paper, stroke: P5R.ink, strokeWidth: 3 }}
            activeDot={{ r: 6, fill: P5R.redHot, stroke: P5R.ink, strokeWidth: 3 }}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/** 数据格：红星磁贴 + 黑标题 + 猩红巨数 + 灰副文 */
const StatCardP5 = ({ label, value, sub, seed, delay = 0 }: {
  label: string; value: string | number; sub?: string; seed: number; delay?: number;
}) => {
  const anim = useBoldness();
  return (
    <motion.div
      initial={anim ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="relative"
    >
      <P5Panel seed={seed} jag={7} frame={3} keyline={2.5} shadow={{ x: 4, y: 5 }} bodyClassName="px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="relative flex h-[29px] w-[29px] shrink-0 items-center justify-center"
            style={{ background: P5R.red, clipPath: roughQuad(seed + 3.1, 4), boxShadow: `2px 2.5px 0 ${P5R.ink}` }}
          >
            <P5Star size={17} fill={P5R.paper} />
          </span>
          <span className="min-w-0 truncate text-[14px] font-black leading-none" style={{ color: P5R.ink, fontFamily: P5_FONT }}>{label}</span>
        </div>
        <div className="mt-1.5 text-[36px] font-black leading-none tabular-nums" style={{ color: P5R.redHot, fontFamily: P5_FONT }}>{value}</div>
        {sub && <div className="mt-1 truncate text-center text-[11px] font-bold" style={{ color: P5R.grey }}>{sub}</div>}
      </P5Panel>
    </motion.div>
  );
};

/** 时间段段钮：纸片斜四边形，选中翻红（不用透明度表达未选中） */
const P5Seg = ({ active, children, onClick, seed }: { active: boolean; children: ReactNode; onClick: () => void; seed: number }) => (
  <motion.button
    type="button"
    whileTap={{ x: 2, y: 2 }}
    onClick={onClick}
    className="relative px-2.5 py-1.5 text-[13px] font-black leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
    style={{ color: active ? P5R.white : P5R.ink, fontFamily: P5_FONT }}
  >
    <P5Rough seed={seed} jag={4} frame={2.5} face={active ? P5R.red : P5R.paper} shadow={{ x: 2.5, y: 3 }} />
    <span className="relative">{children}</span>
  </motion.button>
);

/** 属性趋势折线（P5 分色 + 纸片图例开关） */
const AttrTrendChartP5 = ({ data, attrIds, attrNames, range }: {
  data: DayRecord[]; attrIds: AttributeId[]; attrNames: Record<string, string>; range: string;
}) => {
  const [activeAttrs, setActiveAttrs] = useState<Set<AttributeId>>(new Set(attrIds));
  const toggle = (id: AttributeId) => setActiveAttrs(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (data.length === 0) {
    return (
      <div className="relative flex h-[150px] items-center justify-center">
        <P5Star size={112} fill={P5R.paperDim} className="pointer-events-none absolute" style={{ left: '50%', top: '48%', transform: 'translate(-50%,-50%)' }} />
        <span className="relative text-[13px] font-black" style={{ color: P5R.grey, fontFamily: P5_FONT }}>
          {range === '7' ? '近7天' : range === '30' ? '近30天' : '全部'}暂无记录
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {attrIds.map((id, i) => {
          const on = activeAttrs.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="relative px-2.5 py-1 text-[11px] font-black leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
              style={{
                background: on ? P5_ATTR_COLORS[id] : '#b9b3a8',
                color: on ? P5R.white : '#2a2926',
                clipPath: roughQuad(230 + i, 3),
                fontFamily: P5_FONT,
              }}
            >
              {attrNames[id]}
            </button>
          );
        })}
      </div>
      <div className="relative h-[168px]">
        <P5Star size={110} fill={P5R.paperDim} className="pointer-events-none absolute" style={{ left: '48%', top: 4, transform: 'translateX(-50%)' }} />
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#3a3831', fontWeight: 800 }} tickLine={false} axisLine={{ stroke: P5R.ink, strokeWidth: 2.5 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#3a3831', fontWeight: 800 }} tickLine={false} axisLine={{ stroke: P5R.ink, strokeWidth: 2.5 }} />
            <Tooltip content={<P5Tooltip />} cursor={{ stroke: P5R.ink, strokeWidth: 1.5 }} />
            {attrIds.filter(id => activeAttrs.has(id)).map(id => (
              <Line
                key={id}
                type="linear"
                dataKey={id}
                name={attrNames[id]}
                stroke={P5_ATTR_COLORS[id]}
                strokeWidth={3}
                dot={{ r: 3.4, fill: P5R.paper, stroke: P5_ATTR_COLORS[id], strokeWidth: 2.5 }}
                activeDot={{ r: 5, fill: P5R.redHot, stroke: P5R.ink, strokeWidth: 2.5 }}
                animationDuration={700}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

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
  const { activities, attributes, settings, achievements, skills, setCurrentPage } = useAppStore();
  const [timeRange, setTimeRange] = useState<'7' | '30' | 'all'>('30');
  const channel = useUiChannel();
  const isP4 = channel === 'p4';
  // P3R（蓝频道）：p3-statistics-reference-v2 形态（斜轴世界经频道 token 归零自动放平）
  const p3 = channel === 'p3';

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

  const maxStreak = calcMaxStreak(streakDates(activities));

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

  const p5 = channel === 'p5';

  return (
    <P3RPage active={p3}>
    <P5RPage active={p5}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative ${p5 ? 'p5-reskin' : ''}`}
    >
      {p5 && (
        <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-6 h-[180px]" style={{ zIndex: -1 }}>
          <P5Slab color={P5R.red} seed={251} rot={-8} style={{ left: -50, top: -20, width: 210, height: 120 }} />
          <P5Slab color={P5R.redDeep} seed={252} rot={10} style={{ right: -60, top: 10, width: 200, height: 130 }} />
          <P5Star size={30} fill={P5R.red} ring2={P5R.paper} rot={-12} className="absolute" style={{ right: 60, top: 20 }} />
          <P5Star size={16} fill="#3a3831" rot={10} className="absolute" style={{ right: 24, top: 96 }} />
          <P5Dots className="absolute" style={{ left: 0, top: 90, width: 76, height: 70 }} color="#4a4741" />
        </div>
      )}
      {p3 && <GhostWords words={['TRACE']} className="right-[8px] top-[-12px] text-right text-[78px]" style={{ transform: 'rotate(0deg)' }} />}
      {isP4 && (
        /* 天空圆窗 + 弧环挂在视差层外（页根）：斜轴内容列带出血补偿 padding，装饰留在
           层内永远够不到真实屏幕缘；挂到层外后由 App 外壳的 overflow clip 在真实视口边
           裁切——圆窗与弧环的右上角被屏幕咬掉一角（用户点名要的贴角出血）。
           圆形装饰旋转不变，脱离斜面不损失「世界斜」。 */
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ zIndex: -1 }}>
          <P4ArcRings size={250} className="absolute" style={{ right: '-4.5rem', top: 'calc(-6.5rem - env(safe-area-inset-top))' }} />
          <P4SkyCircle size={150} style={{ right: '-2.75rem', top: 'calc(-2.25rem - env(safe-area-inset-top))' }} />
        </div>
      )}
      {/* 斜轴世界（§2 规则1）：整页内容平面随世界倾斜 -4°，卡片成平行四边形；
          每张卡的内容包 PlaneLevel 反制回水平（"世界斜、字不斜"）。聚焦输入自动校直。
          p3：频道 token --ui-axis 归零，本容器自动放平。 */}
      <PagePlane className="space-y-5">
      {/* header — 宫格子页页头归一 PageTitle 制式（审计 S6），返回归一 → 菜单。
          P4（p4-statistics-reference-v2）：衬线特大「统计」+ STATUS CHECK 眉标 + 天空扇；
          p3（p3-statistics-reference-v2）：P3PageHeader + 命运轨迹青斜纹。 */}
      {p5 ? (
        <PlaneLevel className="relative flex items-start gap-2 pt-1">
          <button
            type="button"
            onClick={() => setCurrentPage('menu')}
            aria-label="返回"
            className="relative mt-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
            style={{ background: P5R.paper, border: '2.5px solid #050505', boxShadow: '3px 3px 0 #000000', clipPath: 'polygon(2px 1px, calc(100% - 1px) 3px, calc(100% - 3px) calc(100% - 1px), 1px calc(100% - 3px))' }}
          >
            <span aria-hidden className="h-0 w-0 border-y-[7px] border-y-transparent border-r-[11px]" style={{ borderRightColor: '#050505' }} />
          </button>
          <div className="min-w-0">
            <P5Collage
              size={38}
              tiles={[
                { ch: '统', bg: P5R.paper, fg: P5R.ink, rot: -3.5, dy: 0 },
                { ch: '计', bg: P5R.red, fg: P5R.ink, rot: 3, dy: 7 },
              ]}
            />
            <div className="mt-2 pl-8">
              <P5SubBar segs={[{ t: 'STATISTICS' }]} star={false} rot={-1.2} className="!px-2.5 !py-0.5" />
            </div>
          </div>
        </PlaneLevel>
      ) : isP4 ? (
        <PlaneLevel className="relative -mx-4 min-h-[152px] px-4 pb-1 pt-1" style={P4_HEADER_BLEED}>
          {/* 天空圆窗与弧环在页根（视差层外）贴真实屏幕角出血，见上方 isP4 装饰层 */}
          <P4Sparkle size={18} color="#ffffff" className="absolute right-[34%] top-2" />
          <div className="flex items-start gap-2">
            <BackButton onClick={() => setCurrentPage('menu')} className="mt-3 -ml-1" />
            <div>
              <h1
                className="text-[52px] font-black leading-[1.02] tracking-tight text-[#131313]"
                style={{ fontFamily: 'var(--p4-display-font, serif)' }}
              >
                统计
              </h1>
              <div className="mt-1 text-xs font-black tracking-[0.24em] text-[#131313]">STATUS CHECK</div>
            </div>
          </div>
        </PlaneLevel>
      ) : p3 ? (
        <div className="relative">
          <P3PageHeader ticks title="统计" onBack={() => setCurrentPage('menu')} className="pt-2" />
          <div className="mt-1.5 inline-block pl-1">
            <span className="text-[15px] font-black" style={{ color: P3R.blue }}>命运轨迹</span>
            <span aria-hidden className="mt-0.5 block h-[3px] w-full" style={{ background: 'rgba(53,209,232,0.7)', transform: 'skewX(-24deg)' }} />
          </div>
        </div>
      ) : (
      <PlaneLevel className="flex items-start gap-3">
        <BackButton onClick={() => setCurrentPage('menu')} className="mt-1 -ml-1" />
        <PageTitle title="统计" en="Statistics" enOffset={{ right: -24 }} />
      </PlaneLevel>
      )}

      {/* growth curve —— 统计页独有的可视化，置顶为 hero（审计 §3.5：此前被首页已有的
          汇总卡压到下方）。点「详细统计 →」进来第一眼即看到成长轨迹，而非重复的汇总数。
          P4：太阳舞台（中央奶油大圆累计数 + 四角卫星圆）；p3：白大斜卡 + 出血蓝斜体大数字。 */}
      {p5 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.5 }} className="pt-2">
          <P5SectionCard
            seed={201}
            title="成长轨迹"
            meta={
              <span className="mr-4 mt-2 inline-block text-[12px] font-black" style={{ color: P5R.ink, fontFamily: P5_FONT }}>
                累计点数
              </span>
            }
            bodyClassName="px-2.5 pb-3 pt-9"
          >
            <GrowthCurveP5 activities={activities} />
          </P5SectionCard>
        </motion.div>
      ) : isP4 ? (
        <PlaneLevel>
          <div className="mb-1 flex items-center gap-2 px-1">
            <P4Flower size={18} color="var(--p4-orange, #f9a11b)" />
            <h3 className="text-[24px] font-black leading-none text-[#131313]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>
              成长轨迹
            </h3>
          </div>
          <div className="relative mx-auto h-[400px] max-w-[400px]">
            {/* 两侧奶油花瓣缀饰 */}
            <P4Flower size={54} color="rgba(255,246,208,0.85)" className="absolute -left-3 top-1/2 -mt-7" />
            <P4Flower size={54} color="rgba(255,246,208,0.85)" className="absolute -right-3 top-1/2 -mt-7" />
            {/* 中央太阳圆：橙环 + 奶油面 */}
            <div
              className="absolute left-1/2 top-1/2 h-[252px] w-[252px] -translate-x-1/2 -translate-y-1/2 rounded-full p-2.5"
              style={{ background: 'var(--p4-orange, #f9a11b)', boxShadow: '0 0 0 12px rgba(255, 246, 208, 0.55)' }}
            >
              <div className="p4-onlight flex h-full w-full flex-col items-center justify-center rounded-full px-5 text-center" style={{ background: '#fff9dd' }}>
                <div className="text-[13px] font-black text-[#131313]/80">累计点数</div>
                <div className="text-[62px] font-black leading-none tabular-nums text-[#131313]">{totalPoints}</div>
                <P4Sparkle size={14} color="var(--ui-accent)" className="mt-1" />
                <svg aria-hidden width="130" height="14" viewBox="0 0 130 14" className="mt-1">
                  <path d="M4 8 Q 20 1, 36 8 T 66 8 T 96 8 T 126 8" fill="none" stroke="var(--ui-accent)" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <div className="mt-1.5 text-[11px] font-semibold leading-snug text-[#131313]/60">
                  {activities.length > 0 ? `共 ${totalRecords} 条记录 · ${topAttr?.total > 0 ? `最强 ${settings.attributeNames[topAttr.id]}` : '继续加油'}` : '记录更多后这里会出现成长曲线'}
                </div>
              </div>
            </div>
            {/* 四角卫星圆 */}
            {[
              { label: '累计点数', v: String(totalPoints), bg: 'var(--p4-green, #55c34f)', pos: 'left-0 top-1', flower: true },
              { label: '记录天数', v: String(uniqueDays), bg: 'var(--p4-orange, #f9a11b)', pos: 'right-0 top-1', flower: true },
              { label: '最长连续', v: `${maxStreak}天`, bg: 'var(--ui-accent)', pos: 'left-0 bottom-1', flower: false },
              { label: '日均点数', v: String(avgPerDay), bg: 'var(--ui-danger)', pos: 'right-0 bottom-1', flower: true },
            ].map((s) => (
              <div
                key={s.label}
                className={`absolute ${s.pos} flex h-[108px] w-[108px] flex-col items-center justify-center rounded-full text-white`}
                style={{ background: s.bg, boxShadow: '0 0 0 6px rgba(255, 246, 208, 0.9)' }}
              >
                {s.flower ? <P4Flower size={18} color="#ffffff" /> : <P4Sparkle size={16} color="#ffffff" />}
                <div className="mt-0.5 text-[12px] font-black">{s.label}</div>
                <div className="text-[24px] font-black leading-tight tabular-nums">{s.v}</div>
              </div>
            ))}
          </div>
          {/* 有数据时补挂成长曲线（设计稿只画空态；曲线功能保留在奶油面板中） */}
          {activities.length > 0 && (
            <div className="mt-3 rounded-[24px] bg-[var(--ui-paper)] p-4" style={{ boxShadow: '0 3px 0 rgba(19,19,19,0.12)' }}>
              <GrowthCurve activities={activities} />
            </div>
          )}
        </PlaneLevel>
      ) : p3 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.5 }}>
          <SectionMark title="成长轨迹" meta={<span className="text-[13px] font-black" style={{ color: P3R.blue }}>累计点数</span>} className="mb-3" />
          <div className="relative px-4 pb-4 pt-3" style={{ clipPath: 'polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)', background: P3R.panelGlass, boxShadow: '0 14px 32px rgba(38,96,140,0.10)' }}>
            {/* 大数字内收：避开左上斜切区（clip 18px），字体走 Arial 合成粗（装饰字重口径） */}
            <div aria-hidden className="pointer-events-none absolute left-7 top-2 select-none text-[64px] font-black italic leading-none tabular-nums" style={{ color: P3R.blue, opacity: 0.92, fontFamily: 'Arial, sans-serif' }}>
              {totalPoints}
            </div>
            <div className="relative pt-16">
              <GrowthCurve activities={activities} />
            </div>
            <span aria-hidden className="absolute bottom-0 right-8 h-4 w-8" style={{ background: 'rgba(53,209,232,0.85)', clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.5 }}
          className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-5"
        >
          <PlaneLevel>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Progress</p>
                <h3 className="font-black text-gray-900 dark:text-white">成长轨迹</h3>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">累计点数</span>
            </div>
            <GrowthCurve activities={activities} />
          </PlaneLevel>
        </motion.div>
      )}

      {/* stat grid —— P4 已把汇总烘进太阳舞台卫星圆，故仅非 P4 显示（p3=四格窄卡） */}
      {p5 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <StatCardP5 seed={301} label="累计点数" value={totalPoints} sub="所有属性总和" delay={0.15} />
          <StatCardP5 seed={302} label="记录天数" value={uniqueDays} sub={`共 ${totalRecords} 条记录`} delay={0.2} />
          <StatCardP5 seed={303} label="最长连续" value={`${maxStreak}天`} sub={todayStreak > 0 ? `当前连续 ${todayStreak} 天` : '继续加油！'} delay={0.25} />
          <StatCardP5 seed={304} label="日均点数" value={avgPerDay} sub={topAttr?.total > 0 ? `最强：${settings.attributeNames[topAttr.id]}` : '平均每日获得'} delay={0.3} />
          <StatCardP5 seed={305} label="成就解锁" value={achievements.filter(a => a.unlocked).length} sub={`共 ${achievements.length} 项`} delay={0.35} />
          <StatCardP5 seed={306} label="技能解锁" value={skills.filter(s => s.unlocked).length} sub={`共 ${skills.length} 项`} delay={0.4} />
        </div>
      ) : !isP4 && (
        <div className={p3 ? 'grid grid-cols-2 gap-2 sm:grid-cols-4' : 'grid grid-cols-2 gap-3'}>
          <StatCard label="累计点数" value={totalPoints} sub="所有属性总和" delay={0.15} />
          <StatCard label="记录天数" value={uniqueDays} sub={`共 ${totalRecords} 条记录`} delay={0.2} />
          <StatCard label="最长连续" value={`${maxStreak}天`} sub={todayStreak > 0 ? `当前连续 ${todayStreak} 天` : '继续加油！'} delay={0.25} />
          <StatCard label="日均点数" value={avgPerDay} sub={topAttr?.total > 0 ? `最强：${settings.attributeNames[topAttr.id]}` : ''} delay={0.3} />
          {/* 成就·技能已解锁（从首页人格指数条挪来） */}
          <StatCard label="成就已解锁" value={achievements.filter(a => a.unlocked).length} sub={`共 ${achievements.length} 项`} delay={0.35} />
          <StatCard label="技能已解锁" value={skills.filter(s => s.unlocked).length} sub={`共 ${skills.length} 项`} delay={0.4} />
        </div>
      )}

      {/* attribute trend
          P4：标题出面板（橙花+衬线），趋势区 = 超圆角奶油大板 + 居中分段（激活蓝 blob）+ 左下大花；
          p3：节标 + 斜块切换，卡壳白斜。 */}
      {isP4 && (
        <PlaneLevel className="mb-1 mt-2 flex items-center gap-2 px-1">
          <P4Flower size={18} color="var(--p4-orange, #f9a11b)" />
          <h3 className="text-[24px] font-black leading-none text-[#131313]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>
            属性趋势
          </h3>
        </PlaneLevel>
      )}
      {p5 ? (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="pt-2">
        <P5SectionCard
          seed={207}
          title="属性趋势"
          meta={
            <div className="mr-2.5 mt-2 flex items-center gap-1.5">
              {([['7', '7天'], ['30', '30天'], ['all', '全部']] as [string, string][]).map(([v, label], i) => (
                <P5Seg key={v} seed={240 + i} active={timeRange === v} onClick={() => setTimeRange(v as '7' | '30' | 'all')}>
                  {label}
                </P5Seg>
              ))}
            </div>
          }
          bodyClassName="px-3 pb-3.5 pt-11"
        >
          <AnimatePresence mode="wait">
            <motion.div key={timeRange} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <AttrTrendChartP5 data={chartData} attrIds={attrIds} attrNames={settings.attributeNames} range={timeRange} />
            </motion.div>
          </AnimatePresence>
        </P5SectionCard>
      </motion.div>
      ) : (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className={
          isP4
            ? 'relative overflow-hidden rounded-[36px] bg-[var(--ui-paper)] p-5'
            : p3
              ? 'p-5'
              : 'rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-5'
        }
        style={
          isP4
            ? { boxShadow: '0 3px 0 rgba(19,19,19,0.12)' }
            : p3
              ? { clipPath: 'polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%)', background: P3R.panelGlass, boxShadow: '0 10px 24px rgba(38,96,140,0.08)' }
              : undefined
        }
      >
        <PlaneLevel>
        {isP4 && <P4Flower size={80} color="var(--ui-bg)" className="pointer-events-none absolute -left-4 bottom-2 opacity-80" />}
        <div className={isP4 ? 'mb-3 flex items-center justify-center' : 'flex items-center justify-between mb-4'}>
          {isP4 ? (
            <span />
          ) : p3 ? (
            <SectionMark title="属性趋势" />
          ) : (
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Attributes</p>
            <h3 className="font-black text-gray-900 dark:text-white">属性趋势</h3>
          </div>
          )}
          {/* time range tabs */}
          <div className={isP4 ? 'flex items-center gap-5' : 'flex gap-1'}>
            {([['7', '7天'], ['30', '30天'], ['all', '全部']] as [string, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTimeRange(v as '7' | '30' | 'all')}
                className={
                  isP4
                    ? `relative px-3 py-1.5 text-[15px] font-black transition-colors ${
                        timeRange === v ? 'text-white' : 'text-[#131313]'
                      }`
                    : p3
                      ? 'px-3 py-1 text-xs font-black transition-colors'
                      : `px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          timeRange === v
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`
                }
                style={p3 ? { clipPath: slantClip(7), background: timeRange === v ? P3R.blue : 'var(--p3r-chip, #ddeef7)', color: timeRange === v ? '#fff' : P3R.ink, marginLeft: -3 } : undefined}
              >
                {isP4 && timeRange === v && (
                  <>
                    <span
                      aria-hidden
                      className="absolute inset-0 -z-10"
                      style={{ background: 'var(--ui-accent)', borderRadius: '58% 42% 55% 45% / 52% 58% 42% 48%', transform: 'rotate(-3deg)' }}
                    />
                    <P4Sparkle size={13} color="var(--ui-accent)" className="absolute -right-2.5 -top-1.5" />
                  </>
                )}
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
        </PlaneLevel>
      </motion.div>
      )}

      {/* per-attribute breakdown
          P4：条形图退役 —— 五枚花瓣圆牌（彩环 + 彩花 + pts + 名·Lv 标签）；
          p3 设计稿：名 Lv 行内排 + 青条洋红端点 + 蓝 pts。 */}
      {p5 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }} className="pt-2">
          <P5SectionCard seed={209} title="属性分布" bodyClassName="px-3 pb-3 pt-9">
            <div>
              {[...attrTotals].sort((a, b) => b.total - a.total).map((item, i, arr) => {
                const attr = attributes.find(a => a.id === item.id);
                const maxTotal = Math.max(...attrTotals.map(a => a.total), 1);
                const pct = Math.round((item.total / maxTotal) * 100);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45 + i * 0.06 }}
                    className="relative flex items-center gap-2 py-2"
                  >
                    <span
                      aria-hidden
                      className="relative flex h-[26px] w-[26px] shrink-0 items-center justify-center"
                      style={{ background: P5R.ink, clipPath: roughQuad(320 + i, 4) }}
                    >
                      <P5AttrGlyph id={item.id} size={16} color={P5R.paper} />
                    </span>
                    <span className="shrink-0 text-[13px] font-black leading-none" style={{ color: P5R.ink, fontFamily: P5_FONT }}>
                      {settings.attributeNames[item.id]}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold leading-none" style={{ color: P5R.grey }}>Lv.{attr?.level ?? 1}</span>
                    <div className="relative ml-0.5 h-[11px] min-w-0 flex-1" style={{ background: '#c9c3b6', clipPath: roughQuad(330 + i, 3) }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(8, pct)}%` }}
                        transition={{ duration: 0.8, delay: 0.5 + i * 0.06, ease: 'easeOut' }}
                        className="absolute inset-y-0 left-0"
                        style={{ background: P5R.red, clipPath: roughQuad(340 + i, 3) }}
                      />
                    </div>
                    <span className="w-[54px] shrink-0 text-right text-[12px] font-black leading-none tabular-nums" style={{ color: P5R.ink, fontFamily: P5_FONT }}>
                      {item.total} <span className="text-[10px]">pts</span>
                    </span>
                    {/* 行分隔：稿上是一条从图标右侧起的细黑线 */}
                    {i < arr.length - 1 && (
                      <span aria-hidden className="absolute bottom-0 left-[30px] right-0 h-[2px]" style={{ background: '#c9c3b6' }} />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </P5SectionCard>
        </motion.div>
      ) : isP4 ? (
        <PlaneLevel>
          <div className="mb-3 mt-2 flex items-center gap-2 px-1">
            <P4Flower size={18} color="var(--p4-orange, #f9a11b)" />
            <h3 className="text-[24px] font-black leading-none text-[#131313]" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>
              属性分布
            </h3>
          </div>
          <div className="flex items-start justify-between gap-1">
            {attrIds.map((id) => {
              const attr = attributes.find(a => a.id === id);
              const total = attrTotals.find(t => t.id === id)?.total ?? 0;
              const c = P4_ATTR_COLORS[id];
              return (
                <div key={id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <div
                    className="relative flex h-[62px] w-[62px] items-center justify-center rounded-full"
                    style={{ background: 'var(--ui-paper)', border: `3px solid ${c}` }}
                  >
                    <P4Flower size={46} color={c} className="absolute opacity-45" />
                    <div className="relative text-center leading-none">
                      <div className="text-[17px] font-black tabular-nums text-[#131313]">{total}</div>
                      <div className="text-[9px] font-bold text-[#131313]/60">pts</div>
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-[11px] font-black text-[#131313]">
                    {settings.attributeNames[id]} <span className="text-[#131313]/60">Lv.{attr?.level ?? 1}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </PlaneLevel>
      ) : (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className={p3 ? 'p-5' : 'rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-5'}
        style={p3 ? { clipPath: 'polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%)', background: P3R.panelGlass, boxShadow: '0 10px 24px rgba(38,96,140,0.08)' } : undefined}
      >
        <PlaneLevel>
        <div className="mb-4">
          {p3 ? (
            <SectionMark title="属性分布" />
          ) : (
          <>
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Breakdown</p>
          <h3 className="font-black text-gray-900 dark:text-white">属性分布</h3>
          </>
          )}
        </div>
        <div className={p3 ? 'space-y-4' : 'space-y-3'}>
          {[...attrTotals].sort((a, b) => b.total - a.total).map((item, i) => {
            const attr = attributes.find(a => a.id === item.id);
            const maxTotal = Math.max(...attrTotals.map(a => a.total), 1);
            const pct = Math.round((item.total / maxTotal) * 100);
            if (p3) {
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 + i * 0.06 }}
                  className="flex items-center gap-3"
                >
                  <span className="w-11 shrink-0 text-[14px] font-black" style={{ color: P3R.ink }}>{settings.attributeNames[item.id]}</span>
                  <span className="w-9 shrink-0 text-[12px] font-bold" style={{ color: P3R.grey }}>{attr ? `Lv.${attr.level}` : ''}</span>
                  <div className="relative h-[7px] min-w-0 flex-1" style={{ background: '#e4eef5', clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(6, pct)}%` }}
                      transition={{ duration: 0.8, delay: 0.5 + i * 0.06, ease: 'easeOut' }}
                      className="relative h-full"
                      style={{ background: 'linear-gradient(90deg, #35d1e8, #7fd8ee)' }}
                    >
                      {/* 洋红端点（设计稿：条末一小段洋红斜块） */}
                      <span aria-hidden className="absolute right-0 top-0 h-full w-[9px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                    </motion.div>
                  </div>
                  <span className="w-14 shrink-0 text-right text-[14px] font-black italic tabular-nums" style={{ color: P3R.blue }}>
                    {item.total} <span className="text-[10px] not-italic">pts</span>
                  </span>
                </motion.div>
              );
            }
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
        </PlaneLevel>
      </motion.div>
      )}

      {/* P3R：STATISTICS 巨幽灵字（页底） */}
      {p3 && (
        <div aria-hidden className="relative h-14">
          <GhostWords words={['STATISTICS']} className="left-[6px] top-[-4px] text-[46px]" style={{ transform: 'rotate(0deg)', color: 'rgba(53,209,232,0.28)' }} />
        </div>
      )}
      </PagePlane>
    </motion.div>
    </P5RPage>
    </P3RPage>
  );
};
