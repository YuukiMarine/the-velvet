/**
 * DashboardP3 —— 蓝主题（p3 频道）首页，p3-redraw/p3-dashboard-reference-v3.png 1:1。
 *
 * 设计稿区块（自上而下）：幽灵字 MIDNIGHT/STATUS → 大黑斜体「午夜状态」+青洋红句点
 * → 蓝色问候副题 → 日期块（大蓝日数字 + JUL/SAT + 斜线）→ 今日任务（白斜卡 + 接入 CTA）
 * → 星象横条 → 人格指数（白日版星象仪：淡青星 + 青点刻度 + 蓝数字标签）→ 六格统计条。
 *
 * 设计稿未画的旧首页区块（宣言卡/今日仪式横滑/引力线等）按 1:1 原则不在本形态渲染，
 * 功能入口均有替代路径（菜单/行动/轮盘）；裁决记录见 PR 描述。
 * 数据逻辑与 Dashboard.tsx 同源（问候池/今日任务过滤/六格统计口径）。
 */
import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
import type { AttributeId } from '@/types';
import { P3R, P3RPage, GhostWords, SectionMark, SlantButton, TitlePeriod, slantClip } from '@/components/p3r/kit';
import { AttributeDossier } from '@/components/AttributeDossier';
import { getAttributeLevelTitle } from '@/utils/attributeLevelTitles';
import { calcMaxStreak } from '@/utils/streak';
import { TAROT_BY_ID } from '@/constants/tarot';
import { triggerNavFeedback } from '@/utils/feedback';

// 问候副题池（与 Dashboard.tsx SUBTEXTS 同源；P3R 版去 emoji——设计稿为纯文字蓝副题）
const SUBTEXTS: Record<string, string[]> = {
  dawn: ['新的一天，从现在开始', '破晓时分，充满希望', '清晨最是宝贵的时光', '早起的鸟儿有虫吃'],
  morning: ['上午阳光正好，继续加油', '来杯茶，开始高效的上午', '今天的努力从这里出发', '专注一件事，今天就够了'],
  noon: ['记得好好吃饭休息', '午休一会儿，下午更清醒', '日正当中，能量满格', '犒劳一下自己吧'],
  afternoon: ['喝杯水，起来活动一下', '下午适合深度学习', '放首歌，找回状态', '离目标又近了一步'],
  dusk: ['今天的努力都算数', '收获感悟的黄金时刻', '傍晚散个步，清空思绪', '夕阳下的你格外有魅力'],
  evening: ['享受宁静的夜晚时光', '记录今天的收获吧', '夜晚适合沉淀与反思', '适当放松，明天更精彩'],
  night: ['注意休息，明天继续', '夜深了，给自己点掌声', '深夜努力的人终会发光', '好好睡一觉，明天见'],
};
const getSlot = (h: number) => {
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 12) return 'morning';
  if (h >= 12 && h < 14) return 'noon';
  if (h >= 14 && h < 17) return 'afternoon';
  if (h >= 17 && h < 19) return 'dusk';
  if (h >= 19 && h < 22) return 'evening';
  return 'night';
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// ── 白日版星象仪（设计稿：正立淡青星 + 臂上青点刻度 + 四周文字标签）───────────
const STAR_CX = 180;
const STAR_CY = 178;
const STAR_R = 150;
const rad = (d: number) => (d * Math.PI) / 180;
const armAngle = (i: number) => -90 + i * 72; // 正立，顶点朝上
const pt = (ang: number, r: number): [number, number] => [STAR_CX + r * Math.cos(rad(ang)), STAR_CY + r * Math.sin(rad(ang))];

const starPath = () => {
  const inner = STAR_R * 0.4;
  let d = '';
  for (let i = 0; i < 5; i++) {
    const [ox, oy] = pt(armAngle(i), STAR_R);
    const [ix, iy] = pt(armAngle(i) + 36, inner);
    d += `${i === 0 ? 'M' : 'L'}${ox.toFixed(1)},${oy.toFixed(1)} L${ix.toFixed(1)},${iy.toFixed(1)} `;
  }
  return `${d}Z`;
};

interface StarItem {
  id: AttributeId;
  name: string;
  level: number;
  maxLevel: number;
  title: string;
}

/** 标签排布（设计稿）：顶标签居中在星顶上方；左右上在两侧；下二角在下方两侧 */
const LABEL_POS: { left: string; top: string; align: 'left' | 'right' | 'center' }[] = [
  { left: '50%', top: '-2%', align: 'center' },   // 顶（知识）
  { left: '99%', top: '30%', align: 'left' },     // 右上（胆量）
  { left: '86%', top: '88%', align: 'left' },     // 右下（灵巧）
  { left: '14%', top: '88%', align: 'right' },    // 左下（温柔）
  { left: '1%', top: '30%', align: 'right' },     // 左上（魅力）
];

const StarChartP3 = ({ items, onSelect }: { items: StarItem[]; onSelect: (id: AttributeId) => void }) => (
  <div className="relative mx-auto w-full max-w-[400px]" style={{ paddingTop: '10%', paddingBottom: '6%' }}>
    <svg viewBox="0 0 360 356" className="w-full" aria-hidden>
      {/* 淡青星底（近白，透出水面底） */}
      <path d={starPath()} fill="rgba(226,243,250,0.92)" />
      {/* 臂刻度：中心→角 5 点，点亮 = level/maxLevel；角端恒亮大点 */}
      {items.slice(0, 5).map((it, i) => {
        const lit = Math.round((Math.max(0, Math.min(1, it.level / Math.max(1, it.maxLevel)))) * 5);
        const dots = Array.from({ length: 5 }, (_, k) => {
          const r = 44 + ((STAR_R * 0.72 - 44) / 4) * k;
          const [x, y] = pt(armAngle(i), r);
          const on = k < lit;
          return <circle key={k} cx={x} cy={y} r={on ? 5 : 3.6} fill={on ? P3R.cyan : 'rgba(53,209,232,0.22)'} />;
        });
        const [ex, ey] = pt(armAngle(i), STAR_R * 0.94);
        return (
          <g key={it.id}>
            {dots}
            <circle cx={ex} cy={ey} r={7} fill={P3R.cyan} />
          </g>
        );
      })}
    </svg>
    {/* 四周标签（可点击 → 属性档案） */}
    {items.slice(0, 5).map((it, i) => {
      const pos = LABEL_POS[i];
      const tx = pos.align === 'center' ? '-50%' : pos.align === 'right' ? '-100%' : '0%';
      return (
        <button
          key={it.id}
          type="button"
          onClick={() => onSelect(it.id)}
          className="absolute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff] focus-visible:ring-offset-1"
          style={{ left: pos.left, top: pos.top, transform: `translate(${tx}, 0)`, textAlign: pos.align === 'center' ? 'center' : pos.align }}
          aria-label={`${it.name} 等级 ${it.level}，${it.title}`}
        >
          <span className="flex items-baseline gap-1.5" style={{ justifyContent: pos.align === 'right' ? 'flex-end' : pos.align === 'center' ? 'center' : 'flex-start' }}>
            <span className="text-[16px] font-black leading-none" style={{ color: P3R.ink }}>{it.name}</span>
            <span className="text-[30px] font-black italic leading-none" style={{ color: P3R.blue }}>{it.level}</span>
          </span>
          <span className="mt-0.5 block text-[12px] font-semibold leading-none" style={{ color: P3R.inkSoft }}>{it.title}</span>
        </button>
      );
    })}
  </div>
);

// ── 页面 ────────────────────────────────────────────────────────────────────
export const DashboardP3 = () => {
  const { user, todos, activities, achievements, skills, attributes, settings, dailyDivination, getTodayTodoProgress, setCurrentPage } = useAppStore();
  const [dossierAttr, setDossierAttr] = useState<AttributeId | null>(null);

  const now = new Date();
  const subtext = useMemo(() => {
    const pool = SUBTEXTS[getSlot(now.getHours())];
    return pool[Math.floor(Math.random() * pool.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 今日任务（口径同 Dashboard：启用 + 符合星期 + 未到期日过滤 + 未完成在前）
  const todayTodos = useMemo(() => {
    const wd = now.getDay();
    const todayKey = toLocalDateKey(now);
    return todos.filter((t) => {
      if (!t.isActive) return false;
      const wdOk = !t.weekdays || t.weekdays.length === 0 || t.weekdays.includes(wd);
      const startOk = !t.startDate || toLocalDateKey(new Date(t.startDate)) <= todayKey;
      return wdOk && startOk;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos]);
  const pending = todayTodos.filter((t) => {
    const p = getTodayTodoProgress(t.id);
    return p.count < p.target;
  });

  const drawn = dailyDivination && dailyDivination.date === toLocalDateKey() ? dailyDivination : null;
  const drawnCard = drawn ? TAROT_BY_ID[drawn.cardId] : null;

  const starItems: StarItem[] = useMemo(
    () =>
      attributes.map((a) => {
        const th = settings.levelThresholds?.length ? settings.levelThresholds : a.levelThresholds;
        const id = a.id as AttributeId;
        return {
          id,
          name: settings.attributeNames[id] || a.displayName,
          level: a.level,
          maxLevel: th.length || 5,
          title: getAttributeLevelTitle(settings.attributeLevelTitles, id, a.level),
        };
      }),
    [attributes, settings.levelThresholds, settings.attributeNames, settings.attributeLevelTitles],
  );

  // 六格统计（口径同 Dashboard）
  const stats = useMemo(() => {
    const totalPoints = attributes.reduce((s, a) => s + (a.points ?? 0), 0);
    const uniqueDays = new Set(activities.map((a) => toLocalDateKey(new Date(a.date)))).size;
    return {
      totalPoints,
      maxStreak: calcMaxStreak(activities.map((a) => a.date)),
      totalActivities: activities.length,
      unlockedAchievements: achievements.filter((a) => a.unlocked).length,
      unlockedSkills: skills.filter((s) => s.unlocked).length,
      uniqueDays,
    };
  }, [attributes, activities, achievements, skills]);

  const go = (page: string) => {
    triggerNavFeedback();
    setCurrentPage(page);
  };

  return (
    <P3RPage className="overflow-hidden">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative pb-6">
        {/* 幽灵字（右上，随页滚动） */}
        <GhostWords words={['MIDNIGHT', 'STATUS']} className="right-[-44px] top-[8px] text-right text-[64px]" />

        {/* ── 页头 ── */}
        <header className="relative pt-4">
          <h1
            className="inline-flex items-end text-[54px] font-black italic leading-[0.95] tracking-tight"
            style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}
          >
            午夜状态
            <TitlePeriod className="mb-1.5 ml-1.5" />
          </h1>
          <p className="mt-2 text-[15px] font-bold" style={{ color: P3R.blue }}>{subtext}</p>

          {/* 日期块 */}
          <div className="mt-4 flex items-center gap-2.5">
            <span className="text-[56px] font-black italic leading-none" style={{ color: P3R.blue }}>
              {now.getDate()}
            </span>
            <span className="flex flex-col gap-0.5 text-[13px] font-black leading-none" style={{ color: P3R.blue }}>
              <span>{MONTHS[now.getMonth()]}</span>
              <span>{WEEKDAYS[now.getDay()]}</span>
            </span>
            <span aria-hidden className="ml-1 h-10 w-[3px]" style={{ background: P3R.blue, transform: 'skewX(-24deg)' }} />
          </div>
        </header>

        {/* ── 今日任务 ── */}
        <section className="mt-7" aria-label="今日任务">
          <SectionMark title="今日任务" />
          <div className="relative mt-3 flex items-stretch">
            {/* 白斜卡（命中区完整；点击 → 行动页任务子页） */}
            <button
              type="button"
              onClick={() => go('todos')}
              className="relative min-h-[96px] flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
              style={{ clipPath: slantClip(14), background: P3R.panel, boxShadow: '0 14px 30px rgba(38,96,140,0.10)' }}
            >
              <div className="flex h-full flex-col justify-center gap-1.5 py-4 pl-7 pr-4">
                {pending.length === 0 ? (
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: P3R.cyan }} />
                    <span className="text-[17px] font-black" style={{ color: P3R.ink }}>暂无可追踪的信号</span>
                  </div>
                ) : (
                  pending.slice(0, 3).map((t) => {
                    const p = getTodayTodoProgress(t.id);
                    return (
                      <div key={t.id} className="flex items-center gap-2.5">
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: P3R.cyan }} />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-black" style={{ color: P3R.ink }}>{t.title}</span>
                        <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: P3R.grey }}>
                          {p.count}/{p.target}
                        </span>
                      </div>
                    );
                  })
                )}
                {pending.length > 3 && (
                  <div className="pl-5 text-[12px] font-bold" style={{ color: P3R.blue }}>还有 {pending.length - 3} 项…</div>
                )}
              </div>
              {/* 卡右下角小青斜线（设计稿细节） */}
              <span aria-hidden className="absolute bottom-2 right-6 h-[3px] w-6" style={{ background: P3R.cyan, transform: 'skewX(-30deg)' }} />
            </button>
            {/* 接入 CTA（探出卡右缘） */}
            <SlantButton
              tone="primary"
              onClick={() => go('todos')}
              className="-ml-3 self-center text-[19px]"
              style={{ paddingTop: 16, paddingBottom: 16, paddingLeft: 30, paddingRight: 30 }}
              ariaLabel="接入今日任务"
            >
              接入
            </SlantButton>
          </div>
        </section>

        {/* ── 星象横条 ── */}
        <button
          type="button"
          onClick={() => go('astrology')}
          className="mt-6 flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
          style={{ clipPath: slantClip(10), background: P3R.cyanPale }}
        >
          <span className="text-xl" aria-hidden>🌙</span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-black" style={{ color: P3R.ink }}>
            {drawn && drawnCard ? `今日星象 · ${drawnCard.name}${drawn.effect ? ` · ${settings.attributeNames[drawn.effect.attribute]}好运` : ''}` : '今日星象尚未展开'}
          </span>
          <span aria-hidden className="text-lg font-black" style={{ color: P3R.blue }}>›</span>
        </button>

        {/* ── 人格指数 ── */}
        <section className="mt-7" aria-label="人格指数">
          <SectionMark
            title="人格指数"
            meta={
              <button type="button" onClick={() => go('statistics')} className="text-[14px] font-bold" style={{ color: P3R.blue }}>
                详细统计 <span aria-hidden>›</span>
              </button>
            }
          />
          <StarChartP3 items={starItems} onSelect={(id) => setDossierAttr(id)} />
        </section>

        {/* ── 六格统计条 ── */}
        <div className="mt-2 grid grid-cols-6 py-3.5" style={{ clipPath: slantClip(12), background: 'rgba(207,234,246,0.75)' }}>
          {[
            { v: stats.totalPoints, label: '累计点数', color: P3R.blue },
            { v: stats.maxStreak, label: '最长连续天', color: P3R.blue },
            { v: stats.totalActivities, label: '总记录数', color: P3R.blue },
            { v: stats.unlockedAchievements, label: '成就已解锁', color: '#f59e0b' },
            { v: stats.unlockedSkills, label: '技能已解锁', color: '#8b5cf6' },
            { v: stats.uniqueDays, label: '记录天数', color: '#10b981' },
          ].map((s, i) => (
            <div key={s.label} className={`flex flex-col items-center gap-1 px-0.5 ${i > 0 ? 'border-l border-white/70' : ''}`}>
              <span className="text-[24px] font-black italic leading-none tabular-nums" style={{ color: s.color }}>{s.v}</span>
              <span className="text-center text-[10px] font-bold leading-tight" style={{ color: P3R.inkSoft }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* 属性档案弹窗（点星象仪标签） */}
        <AttributeDossier attrId={dossierAttr} onClose={() => setDossierAttr(null)} />

        {/* 读屏可达的问候（视觉由上方标题承担） */}
        <h2 className="sr-only">{user?.name ? `${user.name}的午夜状态` : '午夜状态'}</h2>
      </motion.div>
    </P3RPage>
  );
};
