import { motion, AnimatePresence } from 'motion/react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { calcMaxStreak } from '@/utils/streak';
import { BackButton } from '@/components/BackButton';
import { PageTitle } from '@/components/PageTitle';
import { PagePlane, PlaneLevel } from '@/components/PagePlane';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, P3PageHeader, SectionMark, slantClip } from '@/components/p3r/kit';
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
        style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)', background: 'rgba(255,255,255,0.92)', boxShadow: '0 8px 18px rgba(38,96,140,0.07)' }}
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
  // P3R（蓝频道）：p3-statistics-reference-v2 形态（斜轴世界经频道 token 归零自动放平）
  const p3 = useUiChannel() === 'p3';

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
    <P3RPage active={p3}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative"
    >
      {p3 && <GhostWords words={['TRACE']} className="right-[-22px] top-[-12px] text-right text-[78px]" style={{ transform: 'rotate(0deg)' }} />}
      {/* 斜轴世界（§2 规则1）：整页内容平面随世界倾斜 -4°，卡片成平行四边形；
          每张卡的内容包 PlaneLevel 反制回水平（"世界斜、字不斜"）。聚焦输入自动校直。
          p3：频道 token --ui-axis 归零，本容器自动放平。 */}
      <PagePlane className="space-y-5">
      {/* header — 宫格子页页头归一 PageTitle 制式（审计 S6），返回归一 → 菜单 */}
      {p3 ? (
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
          p3（设计稿）：白大斜卡 + 左上出血超大蓝斜体累计数字 + 曲线 */}
      {p3 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.5 }}>
          <SectionMark title="成长轨迹" meta={<span className="text-[13px] font-black" style={{ color: P3R.blue }}>累计点数</span>} className="mb-3" />
          <div className="relative px-4 pb-4 pt-3" style={{ clipPath: 'polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)', background: 'rgba(255,255,255,0.94)', boxShadow: '0 14px 32px rgba(38,96,140,0.10)' }}>
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

      {/* stat grid —— 汇总数（累计/记录天数/最长连续与首页成长概览同值，但此处附带
          「共 N 条记录 / 当前连续 N 天」等子上下文；日均点数为本页独有）。作为曲线下的摘要。
          p3：一行四格窄卡（设计稿） */}
      <div className={p3 ? 'grid grid-cols-2 gap-2 sm:grid-cols-4' : 'grid grid-cols-2 gap-3'}>
        <StatCard label="累计点数" value={totalPoints} sub="所有属性总和" delay={0.15} />
        <StatCard label="记录天数" value={uniqueDays} sub={`共 ${totalRecords} 条记录`} delay={0.2} />
        <StatCard label="最长连续" value={`${maxStreak}天`} sub={todayStreak > 0 ? `当前连续 ${todayStreak} 天` : '继续加油！'} delay={0.25} />
        <StatCard label="日均点数" value={avgPerDay} sub={topAttr?.total > 0 ? `最强：${settings.attributeNames[topAttr.id]}` : ''} delay={0.3} />
        {/* 成就·技能已解锁（从首页人格指数条挪来） */}
        <StatCard label="成就已解锁" value={achievements.filter(a => a.unlocked).length} sub={`共 ${achievements.length} 项`} delay={0.35} />
        <StatCard label="技能已解锁" value={skills.filter(s => s.unlocked).length} sub={`共 ${skills.length} 项`} delay={0.4} />
      </div>

      {/* attribute trend（p3：节标 + 斜块切换，卡壳白斜） */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className={p3 ? 'p-5' : 'rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-5'}
        style={p3 ? { clipPath: 'polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%)', background: 'rgba(255,255,255,0.92)', boxShadow: '0 10px 24px rgba(38,96,140,0.08)' } : undefined}
      >
        <PlaneLevel>
        <div className="flex items-center justify-between mb-4">
          {p3 ? (
            <SectionMark title="属性趋势" />
          ) : (
          <div>
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Attributes</p>
            <h3 className="font-black text-gray-900 dark:text-white">属性趋势</h3>
          </div>
          )}
          {/* time range tabs */}
          <div className="flex gap-1">
            {([['7', '7天'], ['30', '30天'], ['all', '全部']] as [string, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTimeRange(v as '7' | '30' | 'all')}
                className={p3
                  ? 'px-3 py-1 text-xs font-black transition-colors'
                  : `px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      timeRange === v
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                style={p3 ? { clipPath: slantClip(7), background: timeRange === v ? P3R.blue : '#ddeef7', color: timeRange === v ? '#fff' : P3R.ink, marginLeft: -3 } : undefined}
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
        </PlaneLevel>
      </motion.div>

      {/* per-attribute breakdown（p3 设计稿：名 Lv 行内排 + 青条洋红端点 + 蓝 pts） */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className={p3 ? 'p-5' : 'rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-5'}
        style={p3 ? { clipPath: 'polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%)', background: 'rgba(255,255,255,0.92)', boxShadow: '0 10px 24px rgba(38,96,140,0.08)' } : undefined}
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

      {/* P3R：STATISTICS 巨幽灵字（页底） */}
      {p3 && (
        <div aria-hidden className="relative h-14">
          <GhostWords words={['STATISTICS']} className="left-[-26px] top-[-4px] text-[58px]" style={{ transform: 'rotate(0deg)', color: 'rgba(53,209,232,0.28)' }} />
        </div>
      )}
      </PagePlane>
    </motion.div>
    </P3RPage>
  );
};
