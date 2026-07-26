/**
 * DashboardP5 —— 红主题（p5 频道）首页，P5UI/p5-dashboard-flat-newsprint-v1.png 1:1。
 *
 * 设计稿区块（自上而下）：拼贴信纸大字「夺回今天」+「TAKE BACK ☆」黑条 + 红星爆炸背景
 * → 日期纸卡（月相 + 问候两行 + 大红日数字 + JUL/SAT）→ 宣告卡提示条
 * → 今日任务（黑楔标 + 米白大纸卡 + 红斜块底衬）→ 今日仪式（红横幅轮播：星象/逆流/终端/战场）
 * → 人格星象（黑面板 + 灰大星点轨雷达 + 中心红星，角长 = 等级）→ 2×3 统计表格卡。
 *
 * 框架基座 = DashboardP3（用户裁决：P5 重构以 P3 框架为基础，继承全部 UX 优化）：
 * 宣言卡三态 / 任务直接打卡 / 今日仪式 StackCarousel / 属性点击就地展开档案（AttrDetailInlineP5）
 * / 逆流衰减弹窗 / 临期 Toast / 终端 24h 卡。数据逻辑与 Dashboard.tsx 同源，口径零改动。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { useAppStore, toLocalDateKey } from '@/store';
import type { AttributeId, CallingCard } from '@/types';
import {
  P5R, P5_FONT, roughQuad, starPts,
  P5Panel, P5Collage, P5SubBar, P5Wedge, P5Chip, P5Star, P5StarOutline, P5Burst, P5Sparkle, P5Dots, P5Slab, P5RPage,
} from '@/components/p5r/kit';
import { TodoCompleteModal } from '@/components/TodoCompleteModal';
import { BattleDashboardWidget } from '@/components/BattleDashboardWidget';
import { StackCarousel } from '@/components/StackCarousel';
import { TerminalTaskCard } from '@/components/terminal/TerminalTaskCard';
import { getAttributeLevelTitle } from '@/utils/attributeLevelTitles';
import { calcMaxStreak } from '@/utils/streak';
import { TAROT_BY_ID } from '@/constants/tarot';
import { triggerNavFeedback, playSound } from '@/utils/feedback';

// 问候副题池（与 Dashboard.tsx SUBTEXTS 同源；设计稿日期卡上按「，」拆成两行）
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

// ── 真实月相（历元推算与 P3 版同源；渲染为设计稿的黑月牙图形）────────────────
const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
const moonPhaseOf = (date: Date) => {
  const days = (date.getTime() - NEW_MOON_EPOCH) / 86400000;
  return (((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS) / SYNODIC_DAYS; // 0 新月 → 0.5 满月
};
const moonLitPath = (phase: number, r: number, c: number) => {
  const rx = Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * phase)) * r);
  const outer = phase < 0.5 ? 1 : 0;
  const term = phase > 0.25 && phase < 0.75 ? outer : 1 - outer;
  return `M ${c} ${c - r} A ${r} ${r} 0 0 ${outer} ${c} ${c + r} A ${rx} ${r} 0 0 ${term} ${c} ${c - r} Z`;
};
/** 纸面月相块：暗面涂黑、亮面留纸色 + 黑描边圈（满月 = 亮纸圆，新月 = 黑饼——真实月龄） */
const MoonGlyph = ({ date }: { date: Date }) => {
  const phase = moonPhaseOf(date);
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 shrink-0" aria-hidden>
      <circle cx="18" cy="18" r="15" fill={P5R.ink} />
      <path d={moonLitPath(phase, 15, 18)} fill={P5R.paper} />
      <circle cx="18" cy="18" r="15" fill="none" stroke={P5R.ink} strokeWidth="2.5" />
    </svg>
  );
};

// ── 灰星点轨雷达（角长 = 等级；升级可见地「长角」）────────────────────────────
const STAR_CX = 180;
const STAR_CY = 172;
const STAR_R = 150;
const rad = (d: number) => (d * Math.PI) / 180;
const armAngle = (i: number) => -90 + i * 72;
const pt = (ang: number, r: number): [number, number] => [STAR_CX + r * Math.cos(rad(ang)), STAR_CY + r * Math.sin(rad(ang))];

const starPathAt = (radii: number[]) => {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const [ox, oy] = pt(armAngle(i), radii[i]);
    const innerR = ((radii[i] + radii[(i + 1) % 5]) / 2) * 0.4;
    const [ix, iy] = pt(armAngle(i) + 36, innerR);
    d += `${i === 0 ? 'M' : 'L'}${ox.toFixed(1)},${oy.toFixed(1)} L${ix.toFixed(1)},${iy.toFixed(1)} `;
  }
  return `${d}Z`;
};
/** 等级 → 臂长：保底 0.77R（Lv.1 也要有设计稿那种撑开面板的大星），升级仍可见地长角 */
const levelRadius = (level: number, maxLevel: number) =>
  STAR_R * (0.72 + 0.28 * Math.max(0, Math.min(1, level / Math.max(1, maxLevel))));

interface StarItem {
  id: AttributeId;
  name: string;
  level: number;
  maxLevel: number;
  title: string;
}

// 平行四边形斜切透视（P3 同款口径：上边右移、下边左移 + 高度微拉伸）
const STAR_SKEW = -13;
const STAR_SCALEY = 1.16;

const StarRadarP5 = ({ items, onSelect, showLabels = true }: {
  items: StarItem[];
  onSelect: (id: AttributeId, e: ReactMouseEvent) => void;
  showLabels?: boolean;
}) => {
  const radii = items.slice(0, 5).map((it) => levelRadius(it.level, it.maxLevel));
  const dataPath = starPathAt(radii);
  // 标签锚点：贴各自臂端外侧（随等级臂长走），按方位智能对齐（左角右靠、右角左靠、顶底居中）
  const labelAt = (i: number) => {
    const [x, y] = pt(armAngle(i), Math.min(radii[i] * 1.06 + 14, STAR_R * 1.02));
    const dx = x - STAR_CX;
    const dy = y - STAR_CY;
    const tx = dx < -30 ? -86 : dx > 30 ? -42 : -50;
    const ty = dy < -30 ? -96 : dy > 30 ? -6 : -50;
    return { leftPct: (x / 360) * 100, topPct: (y / 344) * 100, tx, ty };
  };
  return (
    <div className="relative mx-auto w-full max-w-[364px]" style={{ paddingTop: 48, paddingBottom: 44 }}>
      {/* 星与标签同处一个斜切平面，标签再反变换回正（字恒水平） */}
      <div className="relative" style={{ transform: `skewX(${STAR_SKEW}deg) scaleY(${STAR_SCALEY})` }}>
        <svg viewBox="0 0 360 344" className="w-full overflow-visible" aria-hidden>
          {/* 硬影星（纯黑，右下错位） */}
          <path d={dataPath} fill="#000000" transform="translate(7 9)" />
          {/* 灰星本体 */}
          <path d={dataPath} fill={P5R.grey} strokeLinejoin="miter" />
          {/* 中心红星 */}
          <polygon points={starPts(STAR_CX, STAR_CY, 40)} fill={P5R.red} />
        </svg>
        {showLabels && items.slice(0, 5).map((it, i) => {
          const pos = labelAt(i);
          return (
            <button
              key={it.id}
              type="button"
              onClick={(e) => onSelect(it.id, e)}
              className="absolute flex flex-col items-start whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008] focus-visible:ring-offset-1"
              style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%`, transform: `translate(${pos.tx}%, ${pos.ty}%) skewX(${-STAR_SKEW}deg) scaleY(${1 / STAR_SCALEY})` }}
              aria-label={`${it.name} 等级 ${it.level}，${it.title}`}
            >
              <span className="flex items-center gap-1.5">
                <P5Chip tone="red" rot={-2}>{it.name}</P5Chip>
                <span className="text-[30px] font-black italic leading-none" style={{ color: P5R.white, fontFamily: P5_FONT, textShadow: '2px 2px 0 #000000' }}>{it.level}</span>
              </span>
              <span className="mt-1 block text-[12px] font-bold leading-none" style={{ color: P5R.white, textShadow: '1.5px 1.5px 0 #000000' }}>{it.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * AttrDetailInlineP5 —— 点击维度后「原地展开」的属性档案（P3 框架同源，P5 语言重绘）：
 * 属性名大字 + 红 LV 徽章 → 进度条（红）→ 称号阶梯 → 关联成就横滑；黑面板上纸色排印。
 */
const AttrDetailInlineP5 = ({ attrId, level: fallbackLevel, onBack }: { attrId: AttributeId; level: number; onBack: () => void }) => {
  const { attributes, achievements, settings } = useAppStore();
  const attr = attributes.find((a) => a.id === attrId);
  const thresholds = settings.levelThresholds?.length ? settings.levelThresholds : attr?.levelThresholds ?? [];
  const lvlMax = thresholds.length || 5;
  const level = attr?.level ?? fallbackLevel;
  const isMax = level >= lvlMax;
  const curThreshold = level > 1 ? thresholds[level - 1] : 0;
  const nextThreshold = !isMax ? thresholds[level] : thresholds[lvlMax - 1];
  const points = attr?.points ?? 0;
  const progress = isMax ? 1 : Math.max(0, Math.min(1, (points - curThreshold) / Math.max(1, nextThreshold - curThreshold)));
  const name = settings.attributeNames?.[attrId] || attr?.displayName || '';
  const curTitle = getAttributeLevelTitle(settings.attributeLevelTitles, attrId, level);
  const related = achievements.filter((a) => a.condition.attribute === attrId || a.condition.type === 'all_attributes_max');
  const unlockedCount = related.filter((a) => a.unlocked).length;
  const achScrollRef = useRef<HTMLDivElement>(null);
  const achDrag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  const container = {
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
    hide: { transition: { staggerChildren: 0.05, staggerDirection: -1 as const } },
  };
  const fromLeft = { hide: { x: '-116%' }, show: { x: '0%' } };
  const fromRight = { hide: { x: '118%' }, show: { x: '0%' } };
  const spring = { type: 'spring' as const, stiffness: 250, damping: 26 };

  return (
    <motion.div
      className="relative z-10 cursor-pointer px-4 pt-1 pb-3"
      onClick={onBack}
      variants={container}
      initial="hide"
      animate="show"
      exit="hide"
    >
      {/* 属性名大字 + 红 LV 徽章（进：曲线位移+缩放；退：渐隐） */}
      <motion.div
        className="relative origin-top-left"
        initial={{ x: '34%', y: 44, scale: 0.56 }}
        animate={{ x: ['34%', '9%', '0%'], y: [44, -10, 0], scale: [0.56, 0.94, 1], transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1], times: [0, 0.58, 1] } }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
      >
        <div className="text-[50px] font-black leading-none" style={{ color: P5R.paper, fontFamily: P5_FONT, textShadow: '4px 4px 0 #8e0000' }}>{name}</div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="relative inline-flex items-baseline gap-1 px-3.5 py-1" style={{ background: P5R.red, clipPath: 'polygon(4px 0, 100% 2px, calc(100% - 4px) 100%, 0 calc(100% - 2px))', boxShadow: `3px 3px 0 ${P5R.ink}` }}>
            <span className="text-[11px] font-black tracking-wider text-white/90">LV</span>
            <span className="text-[20px] font-black leading-none tabular-nums text-white">{level}</span>
          </span>
          <span className="text-[16px] font-black" style={{ color: P5R.paper }}>{curTitle}</span>
          <span className="ml-auto text-[12px] font-bold tabular-nums" style={{ color: P5R.greyLight }}>{points} pt</span>
        </div>
      </motion.div>

      {/* 进度（从右飞入） */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1 flex items-baseline justify-between text-[11px] font-black" style={{ color: P5R.greyLight }}>
          <span>{isMax ? '已达最高等级' : `距 Lv.${level + 1}`}</span>
          <span className="tabular-nums">{isMax ? 'MAX' : `${points - curThreshold}/${nextThreshold - curThreshold}`}</span>
        </div>
        <div className="relative h-[12px] w-full" style={{ background: '#3a3831', clipPath: roughQuad(41, 3) }}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: P5R.red, clipPath: roughQuad(42, 3) }} />
        </div>
      </motion.div>

      {/* 称号阶梯（从右飞入） */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1.5 text-[12px] font-black" style={{ color: P5R.greyLight }}>称号阶梯</div>
        <div className="space-y-1">
          {Array.from({ length: lvlMax }, (_, i) => {
            const lv = i + 1;
            const reached = level >= lv;
            const current = level === lv;
            return (
              <div
                key={lv}
                className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]"
                style={{
                  background: current ? P5R.red : reached ? P5R.paper : '#242320',
                  clipPath: roughQuad(60 + lv, 4),
                  color: current ? '#fff' : reached ? P5R.ink : P5R.greyLight,
                }}
              >
                <span className="w-9 shrink-0 text-[11px] font-black tabular-nums">Lv.{lv}</span>
                <span className="flex-1 font-black">{getAttributeLevelTitle(settings.attributeLevelTitles, attrId, lv)}</span>
                {current && <span className="text-[10px] font-black">◀ 现在</span>}
                {!reached && <span className="text-[10px] tabular-nums">{thresholds[i] ?? 0} pt</span>}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* 关联成就（从右飞入；横滑拖拽） */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1.5 text-[12px] font-black" style={{ color: P5R.greyLight }}>关联成就（{unlockedCount}/{related.length}）</div>
        {related.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] font-bold" style={{ background: '#242320', clipPath: roughQuad(77, 6), color: P5R.greyLight }}>这个方向还没有专属成就</div>
        ) : (
          <div
            ref={achScrollRef}
            className="flex cursor-grab gap-2 overflow-x-auto pb-1 active:cursor-grabbing"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x' }}
            onPointerDown={(e) => {
              const el = achScrollRef.current; if (!el) return;
              achDrag.current = { down: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
              try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
            }}
            onPointerMove={(e) => {
              const el = achScrollRef.current; if (!el || !achDrag.current.down) return;
              const dx = e.clientX - achDrag.current.startX;
              if (Math.abs(dx) > 3) achDrag.current.moved = true;
              el.scrollLeft = achDrag.current.startScroll - dx;
            }}
            onPointerUp={(e) => {
              const el = achScrollRef.current; achDrag.current.down = false;
              try { el?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            }}
            onClickCapture={(e) => { if (achDrag.current.moved) { e.stopPropagation(); } }}
          >
            {related.map((a, ai) => (
              // 未解锁 = 纯灰实色卡（不用透明度表达状态——用户口径）
              <div key={a.id} className="flex w-[126px] shrink-0 select-none flex-col gap-1 px-3 py-2.5" style={{ background: a.unlocked ? P5R.paper : '#8f8b82', clipPath: roughQuad(90 + ai, 5) }}>
                <div className="flex items-center justify-between">
                  <span className="text-lg leading-none" aria-hidden>{a.icon}</span>
                  <span className="shrink-0 text-[9px] font-black" style={{ color: a.unlocked ? P5R.red : '#403d38' }}>{a.unlocked ? '已解锁' : '未解锁'}</span>
                </div>
                <div className="truncate text-[12px] font-black" style={{ color: P5R.ink }}>{a.title}</div>
                <div className="line-clamp-2 text-[10px] font-bold leading-tight" style={{ color: a.unlocked ? P5R.grey : '#403d38' }}>{a.description}</div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* 返回（从左飞入；点击倒放） */}
      <motion.div className="relative mt-5" variants={fromLeft} transition={spring}>
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-[15px] font-black" style={{ color: P5R.paper }}>
          <span aria-hidden className="h-0 w-0 border-y-[6px] border-y-transparent border-r-[9px]" style={{ borderRightColor: P5R.red }} />
          返回
        </button>
      </motion.div>
    </motion.div>
  );
};

// ── 红横幅仪式条（「今日星象尚未展开」式）：左黑星块 + 白字两行 + 右饰件 ──────
const RitualSlabP5 = ({ icon, title, sub, onClick, trailing, seed = 21 }: {
  /** 左侧黑块内的图形（默认纸星） */
  icon?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
  /** 右端饰件（塔罗小卡堆 / › …） */
  trailing?: ReactNode;
  seed?: number;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="relative block h-full min-h-[86px] w-full cursor-pointer select-none text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
  >
    {/* 影 + 暗红衬 + 红面（撕边八点形） */}
    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(5px, 6px)', background: P5R.ink, clipPath: roughOctLocal(seed + 0.7) }} />
    <span aria-hidden className="pointer-events-none absolute -inset-x-1 -top-1 bottom-1" style={{ background: P5R.redDeep, clipPath: roughOctLocal(seed + 0.4) }} />
    <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: P5R.red, clipPath: roughOctLocal(seed) }} />
    <span className="relative flex h-full min-h-[86px] items-center gap-3.5 py-3 pl-3 pr-4">
      <span aria-hidden className="relative flex h-14 w-14 shrink-0 items-center justify-center" style={{ background: P5R.ink, clipPath: roughQuad(seed + 1.3, 6), boxShadow: `0 0 0 2.5px ${P5R.paper}` }}>
        {icon ?? <P5Star size={30} fill={P5R.paper} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[17px] font-black leading-tight" style={{ color: P5R.white, fontFamily: P5_FONT, textShadow: '2px 2px 0 #000000' }}>{title}</span>
        {sub && <span className="mt-1 block truncate text-[12px] font-bold" style={{ color: P5R.white }}>{sub}</span>}
      </span>
      {trailing ?? <span aria-hidden className="shrink-0 text-xl font-black" style={{ color: P5R.white }}>›</span>}
    </span>
  </button>
);
/** RitualSlabP5 专用撕边形（模块级函数便于 seed 派生） */
const roughOctLocal = (seed: number) => {
  // 横幅左右两端斜切更狠（设计稿红幅两端是斜刀口）
  const r = ((n: number) => {
    let a = (Math.round(n * 1000) ^ 0x9e3779b9) >>> 0 || 1;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })(seed);
  const j = (amp: number) => (r() * amp).toFixed(1);
  return `polygon(${j(14)}px ${j(8)}px, 40% ${j(5)}px, calc(100% - ${j(16)}px) ${j(8)}px, calc(100% - ${j(6)}px) calc(50% + ${j(8)}px), calc(100% - ${j(18)}px) calc(100% - ${j(8)}px), 55% calc(100% - ${j(5)}px), ${j(16)}px calc(100% - ${j(9)}px), ${j(5)}px calc(50% - ${j(8)}px))`;
};

/** 塔罗三连小卡堆（横幅右端饰件） */
const TarotStackGlyph = () => (
  <span aria-hidden className="relative mr-1 block h-12 w-14 shrink-0">
    {[{ r: -14, x: 0 }, { r: -4, x: 9 }, { r: 8, x: 18 }].map((c, i) => (
      <span
        key={i}
        className="absolute top-1/2 h-11 w-8 -translate-y-1/2"
        style={{ left: c.x, transform: `translateY(-50%) rotate(${c.r}deg)`, background: P5R.ink, border: `2px solid ${P5R.paper}`, borderRadius: 2 }}
      >
        {i === 2 && <P5Star size={16} fill={P5R.red} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />}
      </span>
    ))}
  </span>
);

/** 剪贴板空态图标（今日任务空态，灰 + 角落黑星） */
const ClipboardGlyph = () => (
  <span aria-hidden className="relative inline-block">
    <svg viewBox="0 0 64 64" className="h-16 w-16" fill="none">
      <rect x="10" y="8" width="44" height="50" rx="4" fill={P5R.grey} />
      <rect x="15" y="15" width="34" height="38" rx="2" fill={P5R.paper} />
      <rect x="24" y="4" width="16" height="10" rx="3" fill={P5R.grey} />
      <circle cx="32" cy="8" r="2.6" fill={P5R.paper} />
      <g stroke={P5R.grey} strokeWidth="3.4" strokeLinecap="square">
        <line x1="20" y1="24" x2="36" y2="24" />
        <line x1="20" y1="32" x2="42" y2="32" />
        <line x1="20" y1="40" x2="33" y2="40" />
      </g>
    </svg>
    <P5Star size={22} fill={P5R.ink} className="absolute -bottom-0.5 -right-1" />
  </span>
);

// ── 页面 ────────────────────────────────────────────────────────────────────
export const DashboardP5 = () => {
  const {
    user, todos, activities, achievements, skills, attributes, settings, dailyDivination,
    completeTodo, getTodayTodoProgress, setModalBlocker, setCurrentPage,
    applyCountercurrentDecay, getCountercurrentWarnings, callingCards,
    getActiveTerminalTask, completeTerminalTask, dismissTerminalTask,
    wishes, getDueTodosToday,
  } = useAppStore();
  const anim = useBoldness();
  const activeTerminalTask = getActiveTerminalTask();
  const [dossierAttr, setDossierAttr] = useState<AttributeId | null>(null);
  const [completedTitle, setCompletedTitle] = useState<string | null>(null);
  const [completedPoints, setCompletedPoints] = useState(1);
  const [unlockHint, setUnlockHint] = useState<{ achievements: number; skills: number }>({ achievements: 0, skills: 0 });
  const [decayedAttrs, setDecayedAttrs] = useState<AttributeId[]>([]);
  const [starRipples, setStarRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const starSectionRef = useRef<HTMLDivElement>(null);
  const [ccHintDismissed, setCcHintDismissed] = useState(() => {
    try { return localStorage.getItem('velvet_cc_hint_dismissed') === '1'; } catch { return false; }
  });

  const now = new Date();
  const subtext = useMemo(() => {
    const pool = SUBTEXTS[getSlot(now.getHours())];
    return pool[Math.floor(Math.random() * pool.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 日期卡两行问候：按第一个「，」拆行（设计稿「夜深了 / 给自己点掌声」）
  const [subLine1, subLine2] = useMemo(() => {
    const i = subtext.indexOf('，');
    return i > 0 ? [subtext.slice(0, i), subtext.slice(i + 1)] : [subtext, ''];
  }, [subtext]);

  // ── 今日任务（口径同 Dashboard）────────────────────────────────────────────
  const todayWeekday = now.getDay();
  const todayKey = toLocalDateKey(now);
  const todayTodos = [...todos.filter((todo) => {
    const matchesWeekday = !todo.weekdays || todo.weekdays.length === 0 || todo.weekdays.includes(todayWeekday);
    if (todo.startDate && todo.startDate > todayKey) return false;
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
  const completedCount = todayTodos.filter((t) => getTodayTodoProgress(t.id).isComplete).length;
  const totalCount = todayTodos.length;

  // ── 宣言卡（钉选三态）─────────────────────────────────────────────────────
  const realCallingCards = callingCards.filter((c) => !c.terminal);
  const pinned: CallingCard | null = realCallingCards.find((c) => c.pinned && !c.archived) ?? null;
  const unpinnedCount = realCallingCards.filter((c) => !c.archived).length;
  const daysLeft = pinned?.targetDate
    ? Math.max(0, Math.round((new Date(pinned.targetDate + 'T00:00:00').getTime() - new Date(todayKey + 'T00:00:00').getTime()) / 86400000))
    : null;

  // 临期 Toast（≤3 天当日首见弹一次；口径同 Dashboard）
  const [urgentToast, setUrgentToast] = useState<string | null>(null);
  useEffect(() => {
    if (!pinned || !pinned.targetDate) return;
    const today = new Date(toLocalDateKey() + 'T00:00:00');
    const target = new Date(pinned.targetDate + 'T00:00:00');
    const left = Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
    if (left > 3 || left <= 0) return;
    const storageKey = `velvet_cc_urgent_${pinned.id}_${toLocalDateKey()}`;
    try {
      if (localStorage.getItem(storageKey) === '1') return;
      localStorage.setItem(storageKey, '1');
    } catch { /* 隐私模式 → 跳过节流 */ }
    setUrgentToast(`「${pinned.title}」还剩 ${left} 天`);
    playSound('/themec-switch.mp3', 0.6);
    const t = setTimeout(() => setUrgentToast(null), 3600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned?.id, pinned?.targetDate]);

  const jumpToCallingCardSection = () => {
    try {
      sessionStorage.setItem('velvet:todos-goal-panel', 'countdown');
    } catch { /* ignore */ }
    setCurrentPage('todos');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('velvet:open-calling-card-panel'));
        document.getElementById('calling-card-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  // ── 逆流：进入首页执行衰减；预警 false→true 沿仪式组跳回第一页 ────────────
  useEffect(() => {
    if (!settings.countercurrentEnabled) return;
    applyCountercurrentDecay().then((decayed) => {
      if (decayed.length > 0) setDecayedAttrs(decayed);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.countercurrentEnabled]);
  const countercurrentWarnings = settings.countercurrentEnabled ? getCountercurrentWarnings() : [];
  const hasCountercurrentWarning = countercurrentWarnings.length > 0;
  const [ritualPage, setRitualPage] = useState<number | undefined>(undefined);
  const prevWarningRef = useRef(false);
  useEffect(() => {
    const prev = prevWarningRef.current;
    prevWarningRef.current = hasCountercurrentWarning;
    if (prev || !hasCountercurrentWarning) return;
    setRitualPage(0);
    const t = setTimeout(() => setRitualPage(undefined), 600);
    return () => clearTimeout(t);
  }, [hasCountercurrentWarning]);

  const drawn = dailyDivination && dailyDivination.date === toLocalDateKey() ? dailyDivination : null;
  const drawnCard = drawn ? TAROT_BY_ID[drawn.cardId] : null;

  // 星角方位定序（顶=知识 → 顺时针 胆量/灵巧/温柔/魅力），与 store 属性顺序解耦
  const starItems: StarItem[] = useMemo(() => {
    const order: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
    const byId = new Map(attributes.map((a) => [a.id as AttributeId, a]));
    return order
      .map((id) => byId.get(id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => {
        const th = settings.levelThresholds?.length ? settings.levelThresholds : a.levelThresholds;
        const id = a.id as AttributeId;
        return {
          id,
          name: settings.attributeNames[id] || a.displayName,
          level: a.level,
          maxLevel: th.length || 5,
          title: getAttributeLevelTitle(settings.attributeLevelTitles, id, a.level),
        };
      });
  }, [attributes, settings.levelThresholds, settings.attributeNames, settings.attributeLevelTitles]);

  // 六格统计（2×3 表格卡——p5-dashboard 设计稿布局）
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

  // ── 治疗终端入口副行数据（口径同 Dashboard）───────────────────────────────
  const terminalGoals = wishes.filter((w) => !w.parentId && w.status !== 'archived');
  const terminalSteps =
    wishes.filter((w) => w.parentId && w.status === 'active').length +
    getDueTodosToday().filter((t) => !getTodayTodoProgress(t.id).isComplete).length;

  // ──「今日仪式」slides（条件在组装处拦截）──────────────────────────────────
  const ritualSlides: ReactNode[] = [];
  if (hasCountercurrentWarning) {
    ritualSlides.push(
      <div key="countercurrent" className="h-full [&>*]:h-full">
        <RitualSlabP5
          seed={31}
          icon={<span className="text-2xl" aria-hidden>🌊</span>}
          title="逆流预警"
          sub={`${countercurrentWarnings.map((id) => settings.attributeNames[id]).join('、')} 已连续3日无增长，明日将${countercurrentWarnings.length > 1 ? '各' : ''}扣减 1 点`}
        />
      </div>,
    );
  }
  ritualSlides.push(
    <div key="astrology" className="h-full [&>*]:h-full">
      <RitualSlabP5
        seed={21}
        onClick={() => go('astrology')}
        title={drawn && drawnCard ? `${drawnCard.name} · ${drawn.orientation === 'upright' ? '正位' : '逆位'}` : '今日星象尚未展开'}
        sub={
          drawn && drawnCard
            ? `${settings.attributeNames[drawn.effect.attribute]} × ${drawn.effect.multiplier}${drawn.advice ? ` · ${drawn.advice}` : ''}`
            : '点击进入星象，从三张塔罗中抽取一张'
        }
        trailing={(
          <span className="flex items-center gap-1">
            <TarotStackGlyph />
            <span aria-hidden className="text-xl font-black" style={{ color: P5R.white }}>›</span>
          </span>
        )}
      />
    </div>,
  );
  if (settings.terminalEnabled) {
    ritualSlides.push(
      <div key="terminal" className="h-full [&>*]:h-full">
        <RitualSlabP5
          seed={41}
          icon={<P5Sparkle size={26} color={P5R.paper} />}
          onClick={() => go('terminal')}
          title="治疗终端"
          sub={terminalGoals.length === 0 ? '失去记录的勇气时，来这里许下第一个愿望' : `${terminalGoals.length} 个目标 · ${terminalSteps} 个待迈出的一步`}
        />
      </div>,
    );
  }
  if (settings.battleEnabled !== false) {
    ritualSlides.push(
      <div key="battle" className="h-full [&>*]:h-full">
        <BattleDashboardWidget />
      </div>,
    );
  }

  const enter = (delay: number) => ({
    initial: anim ? { opacity: 0, y: 26 } : false,
    animate: { opacity: 1, y: 0 },
    transition: { type: 'spring' as const, stiffness: 260, damping: 26, delay },
  });

  return (
    <P5RPage className="overflow-hidden">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative pb-6">
        {/* ── 页头：拼贴标题 + 红星爆炸背景 + 日期纸卡 ── */}
        <header className="relative pt-3">
          {/* 头部局部装饰（沉底）：红斜块 + 爆炸星 + 半调 */}
          <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-4 h-[300px]" style={{ zIndex: -1 }}>
            <P5Slab color={P5R.red} seed={51} rot={-7} style={{ left: -36, top: -20, width: 250, height: 180 }} />
            <P5Slab color={P5R.redDeep} seed={52} rot={12} style={{ left: 90, top: 60, width: 200, height: 160 }} />
            <svg viewBox="0 0 100 100" className="absolute" style={{ left: -30, top: 20, width: 240, height: 240 }} aria-hidden>
              <polygon points={starPts(50, 50, 50, -90 + 14)} fill={P5R.red} opacity={0.92} />
            </svg>
            <P5Dots className="absolute" style={{ left: 8, top: 0, width: 90, height: 90 }} color="#000000" />
            <P5Slab color={P5R.grey} seed={53} rot={20} style={{ right: 100, top: -30, width: 120, height: 90 }} />
          </div>

          <div className="flex items-start justify-between gap-3">
            {/* 拼贴大字（设计稿瓷砖配色：夺=红底黑字 / 回=纸底黑 / 今=纸底灰 / 天=黑底灰白） */}
            <div className="min-w-0 pt-1">
              <P5Collage
                size={49}
                tiles={[
                  { ch: '夺', bg: P5R.red, fg: P5R.ink, scale: 1.14, rot: -4, dy: 0 },
                  { ch: '回', bg: P5R.paper, fg: P5R.ink, rot: 2.5, dy: 10 },
                  { ch: '今', bg: P5R.paper, fg: P5R.grey, rot: -2, dy: 3 },
                  { ch: '天', bg: P5R.ink, fg: P5R.greyLight, rot: 3, dy: 12 },
                ]}
              />
              <div className="mt-3 pl-8">
                <P5SubBar segs={[{ t: 'TAKE', c: P5R.red }, { t: 'BACK', c: P5R.white }]} />
              </div>
            </div>

            {/* 日期纸卡：切角 + 月相 + 两行问候 + 大红日数字 + JUL / SAT */}
            <motion.div className="relative w-[152px] shrink-0" {...enter(0.12)}>
              <div aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: P5R.ink, clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%, 0 18px)' }} />
              <div aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: 'polygon(18px 0, 100% 0, 100% 100%, 0 100%, 0 18px)', boxShadow: `inset 0 0 0 2.5px ${P5R.ink}` }} />
              <div className="relative px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <MoonGlyph date={now} />
                  {subLine2 ? (
                    <div className="min-w-0 text-[12px] font-black leading-[1.35]" style={{ color: P5R.ink }}>
                      <div className="truncate">{subLine1}</div>
                      <div className="truncate">{subLine2}</div>
                    </div>
                  ) : (
                    <div className="line-clamp-2 min-w-0 text-[12px] font-black leading-[1.35]" style={{ color: P5R.ink }}>{subLine1}</div>
                  )}
                </div>
                <div className="mt-1.5 flex items-end justify-end gap-1.5">
                  <span className="text-[54px] font-black leading-none tabular-nums" style={{ color: P5R.redHot, fontFamily: P5_FONT }}>{now.getDate()}</span>
                  <span className="flex flex-col items-center gap-1 pb-1">
                    <span className="text-[14px] font-black leading-none" style={{ color: P5R.ink }}>{MONTHS[now.getMonth()]}</span>
                    <span className="px-1.5 py-0.5 text-[11px] font-black leading-none text-white" style={{ background: P5R.red }}>{WEEKDAYS[now.getDay()]}</span>
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* ── 宣告卡三态提示条（设计稿：✦ 白条嵌在头部纸卡组里）── */}
          {pinned ? (
            <motion.button
              type="button"
              onClick={jumpToCallingCardSection}
              className="relative mt-4 block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
              {...enter(0.18)}
            >
              <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: P5R.ink, clipPath: roughQuad(55, 6) }} />
              <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(56, 5) }} />
              <span className="relative flex items-center gap-2.5 px-4 py-2.5">
                <P5Sparkle size={15} color={P5R.red} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black tracking-[0.18em]" style={{ color: P5R.grey }}>PINNED · 宣言</span>
                  <span className="block truncate text-[15px] font-black" style={{ color: P5R.ink }}>{pinned.title}</span>
                </span>
                {daysLeft !== null ? (
                  <span className="flex shrink-0 items-baseline gap-1">
                    <span className="text-[11px] font-bold" style={{ color: P5R.grey }}>剩</span>
                    <span className="text-[26px] font-black leading-none tabular-nums" style={{ color: P5R.redHot }}>{daysLeft}</span>
                    <span className="text-[11px] font-bold" style={{ color: P5R.grey }}>天</span>
                  </span>
                ) : (
                  <span aria-hidden className="shrink-0 text-lg font-black" style={{ color: P5R.red }}>›</span>
                )}
              </span>
            </motion.button>
          ) : unpinnedCount > 0 ? (
            <motion.button
              type="button"
              onClick={jumpToCallingCardSection}
              className="relative mt-4 block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
              {...enter(0.18)}
            >
              <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,4px)', background: P5R.ink, clipPath: roughQuad(57, 5) }} />
              <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(58, 5) }} />
              <span className="relative flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-black" style={{ color: P5R.ink }}>
                <P5Sparkle size={13} color={P5R.red} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">你有 {unpinnedCount} 张倒计时未钉到主页</span>
                <span aria-hidden style={{ color: P5R.red }}>›</span>
              </span>
            </motion.button>
          ) : ccHintDismissed ? null : (
            <motion.div className="relative mt-4" {...enter(0.18)}>
              <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,4px)', background: P5R.ink, clipPath: roughQuad(59, 5) }} />
              <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(60, 5) }} />
              <div className="relative flex items-center gap-1 py-2.5 pl-4 pr-2">
                <button
                  type="button"
                  onClick={jumpToCallingCardSection}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left text-[12.5px] font-black leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                  style={{ color: P5R.ink }}
                >
                  <P5Sparkle size={13} color={P5R.red} className="shrink-0" />
                  <span className="min-w-0 flex-1">为重要的事写一张「宣告卡」，倒计时随时在此映入眼帘</span>
                </button>
                <button
                  type="button"
                  aria-label="不再提示"
                  onClick={() => {
                    try { localStorage.setItem('velvet_cc_hint_dismissed', '1'); } catch { /* 隐私模式忽略 */ }
                    setCcHintDismissed(true);
                  }}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center text-base font-black leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                  style={{ color: P5R.ink }}
                >×</button>
              </div>
            </motion.div>
          )}
        </header>

        {/* 进行中的治疗终端 24h 限时任务（特殊风格，原样复用） */}
        {settings.terminalEnabled && activeTerminalTask && (
          <div className="mt-5">
            <TerminalTaskCard
              card={activeTerminalTask}
              onComplete={() => completeTerminalTask(activeTerminalTask.id)}
              onDismiss={() => dismissTerminalTask(activeTerminalTask.id)}
              compact
            />
          </div>
        )}

        {/* ── 今日任务：黑楔标 + 红斜块底衬上的米白大纸卡 ── */}
        <motion.section className="relative mt-7" aria-label="今日任务" {...enter(0.22)}>
          {/* 区块底衬：红斜块从卡后冲出（沉底） */}
          <div aria-hidden className="pointer-events-none absolute -inset-x-5 -inset-y-4" style={{ zIndex: -1 }}>
            <P5Slab color={P5R.red} seed={61} rot={-2} style={{ left: 0, top: 10, right: 14, bottom: 12 }} />
            <P5Slab color={P5R.redDeep} seed={62} rot={4} style={{ right: 0, top: 30, width: 130, height: 110 }} />
            <P5Slab color={P5R.ink} seed={63} rot={-8} style={{ left: 6, bottom: 0, width: 150, height: 60 }} />
            <P5Dots className="absolute" style={{ right: 10, top: 0, width: 80, height: 70 }} color="#000000" />
          </div>

          <div className="flex items-center justify-between px-1">
            <P5Wedge tone="ink">今日任务</P5Wedge>
            <button
              type="button"
              onClick={() => go('todos')}
              className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
              aria-label="打开任务页"
            >
              <P5Chip tone="ink" rot={1.5}>
                {totalCount > 0 ? (
                  <span className="tabular-nums">{completedCount} / {totalCount}</span>
                ) : '暂无'}
              </P5Chip>
            </button>
          </div>

          <P5Panel seed={64} jag={9} frame={5} keyline={0} shadow={{ x: 5, y: 6 }} className="mt-2" bodyClassName="px-4 py-4">
            {/* 纸面右侧大描边星水印 */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: roughQuad(64.57, 5) }}>
              <P5StarOutline size={190} color={P5R.paperDim} width={9} rot={-12} className="absolute -right-8 top-1/2 -translate-y-1/2" />
            </div>
            {todayTodos.length === 0 ? (
              <div className="relative flex min-h-[150px] flex-col items-center justify-center gap-3 py-3 text-center">
                <ClipboardGlyph />
                <span className="text-[14.5px] font-black" style={{ color: P5R.grey }}>今日暂无任务，去「任务」页添加吧</span>
              </div>
            ) : (
              <div className="relative flex flex-col gap-0.5 py-0.5">
                {todayTodos.map((todo) => {
                  const progress = getTodayTodoProgress(todo.id);
                  const attrName = settings.attributeNames[todo.attribute as keyof typeof settings.attributeNames];
                  const done = progress.isComplete;
                  return (
                    <button
                      key={todo.id}
                      type="button"
                      disabled={done}
                      onClick={async () => {
                        const result = await completeTodo(todo.id);
                        const updated = getTodayTodoProgress(todo.id);
                        if (updated.isComplete) {
                          setCompletedTitle(todo.title);
                          const pts = todo.points + (todo.extraBoosts?.reduce((s, b) => s + b.points, 0) ?? 0);
                          setCompletedPoints(pts);
                          setUnlockHint(result?.unlockHints ?? { achievements: 0, skills: 0 });
                          setModalBlocker(true);
                        }
                      }}
                      className={`flex w-full items-center gap-3 px-1 py-2 text-left transition-colors ${done ? 'cursor-not-allowed' : 'cursor-pointer active:bg-[#e3dccd]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]`}
                    >
                      {/* 方黑框勾选：完成 = 红底白勾（完成态整行不降透明度，用灰字+删除线表达） */}
                      <span aria-hidden className="relative h-[19px] w-[19px] shrink-0" style={{ border: `2.5px solid ${done ? P5R.grey : P5R.ink}`, background: done ? P5R.red : P5R.paper, transform: 'rotate(-2deg)' }}>
                        {done && (
                          <svg viewBox="0 0 12 12" className="absolute inset-0 m-auto h-3 w-3" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2.4" strokeLinecap="square" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {todo.important && <P5Star size={12} fill={P5R.red} className="shrink-0" />}
                          <span className={`truncate text-[15px] font-black ${done ? 'line-through' : ''}`} style={{ color: done ? P5R.grey : P5R.ink }}>
                            {todo.title}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-bold" style={{ color: P5R.grey }}>
                          {attrName} +{todo.points}
                          {todo.extraBoosts?.map((b, bi) => (
                            <span key={bi}> · {settings.attributeNames[b.attribute as keyof typeof settings.attributeNames]} +{b.points}</span>
                          ))}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] font-black tabular-nums" style={{ color: done ? P5R.red : P5R.grey }}>
                        {progress.count}/{progress.target}
                      </span>
                    </button>
                  );
                })}
                {/* 卡底整体进度条 */}
                {totalCount > 0 && (
                  <div aria-hidden className="mt-2 h-[7px] w-full" style={{ background: P5R.paperDim }}>
                    <motion.div
                      className="h-full"
                      style={{ background: P5R.red }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(completedCount / totalCount) * 100}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                )}
              </div>
            )}
          </P5Panel>
        </motion.section>

        {/* ──「今日仪式」红横幅轮播 ── */}
        <motion.section className="mt-7" aria-label="今日仪式" {...enter(0.28)}>
          <StackCarousel id="ritual-p5" page={ritualPage} itemWidthClass="w-full" autoPlayMs={6000}>
            {ritualSlides}
          </StackCarousel>
        </motion.section>

        {/* ── 人格星象：黑面板 + 灰星点轨雷达 ── */}
        <motion.section className="relative mt-7" aria-label="人格星象" {...enter(0.34)}>
          <P5Panel seed={71} jag={7} frame={2.5} keyline={0} face={P5R.panel} frameColor={P5R.paper} shadow={{ x: 5, y: 7, color: 'rgba(192,0,8,0.5)' }} bodyClassName="pb-2">
            {/* 面板角饰（裁在面板形内）：暗红角斜块 + 半调 + 右缘红爆炸星 */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: roughQuad(71.57, 5) }}>
              <P5Slab color="#1c1c1c" seed={72} rot={-16} style={{ left: -50, top: -40, width: 170, height: 120 }} />
              <P5Dots className="absolute" style={{ left: 0, top: 40, width: 70, height: 90 }} color="#4a4741" />
              <P5Burst size={130} seed={7} fill={P5R.red} ring={P5R.paper} className="absolute" style={{ right: -56, bottom: 26 }} />
              <P5Slab color="#161616" seed={73} rot={9} style={{ right: -40, bottom: -30, width: 150, height: 100 }} />
            </div>

            <div className="relative flex items-start justify-between px-2.5 pt-2.5">
              <P5Wedge tone="paper" rot={-1} keyline={false}>人格星象</P5Wedge>
              <P5Chip tone="red" rot={1.2} onClick={() => go('statistics')} ariaLabel="打开详细统计" className="mt-1 mr-1 !px-3 !py-1.5">
                详细统计 <span aria-hidden className="ml-0.5">→</span>
              </P5Chip>
            </div>

            {/* 五角星 ⇄ 档案：共存 + 纯位移切换（P3 框架同款交互）。
                min-h 必须 ≥ 雷达总高（svg 348 + 上下 padding 92），否则 absolute 星层底部标签被裁 */}
            <div ref={starSectionRef} className="relative min-h-[442px] overflow-hidden">
              <motion.div
                className="absolute inset-x-0 top-0 z-0"
                animate={dossierAttr ? { scale: 1.4, rotate: -118, x: '12%', y: '14%', opacity: 0.1 } : { scale: 1, rotate: 0, x: '0%', y: '0%', opacity: 1 }}
                transition={{ type: 'spring', stiffness: 190, damping: 24 }}
                style={{ transformOrigin: 'center', pointerEvents: dossierAttr ? 'none' : 'auto' }}
              >
                <StarRadarP5
                  items={starItems}
                  onSelect={(id, e) => {
                    const rect = starSectionRef.current?.getBoundingClientRect();
                    if (rect) setStarRipples((rs) => [...rs, { id: Date.now(), x: e.clientX - rect.left, y: e.clientY - rect.top }]);
                    setDossierAttr(id);
                  }}
                  showLabels={!dossierAttr}
                />
              </motion.div>
              <motion.div
                className="relative z-10 overflow-hidden"
                initial={false}
                animate={{ height: dossierAttr ? 'auto' : 0 }}
                transition={{ duration: 0.34, ease: [0.3, 0, 0.2, 1] }}
              >
                <AnimatePresence>
                  {dossierAttr && (
                    <AttrDetailInlineP5
                      key={dossierAttr}
                      attrId={dossierAttr}
                      level={starItems.find((it) => it.id === dossierAttr)?.level ?? 1}
                      onBack={() => setDossierAttr(null)}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
              {/* 点击波纹（红圈） */}
              <AnimatePresence>
                {starRipples.map((rp) => (
                  <motion.span
                    key={rp.id}
                    aria-hidden
                    className="pointer-events-none absolute z-30 rounded-full"
                    style={{ left: rp.x, top: rp.y, border: `3px solid ${P5R.red}` }}
                    initial={{ width: 16, height: 16, x: '-50%', y: '-50%', opacity: 0.9 }}
                    animate={{ width: 250, height: 250, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    onAnimationComplete={() => setStarRipples((rs) => rs.filter((r) => r.id !== rp.id))}
                  />
                ))}
              </AnimatePresence>
            </div>
          </P5Panel>
        </motion.section>

        {/* ── 2×3 统计表格卡（设计稿：黑细线分格，数字红/橙/黑）── */}
        <motion.div className="relative mt-6" {...enter(0.4)}>
          <P5Panel seed={81} jag={9} frame={4} shadow={{ x: 5, y: 6 }} bodyClassName="px-2 py-1">
            {/* 左右灰星水印 */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: roughQuad(81.57, 6) }}>
              <P5Star size={84} fill={P5R.paperDim} rot={-14} className="absolute -left-5 top-3" />
              <P5Star size={72} fill={P5R.paperDim} rot={12} className="absolute -right-4 top-6" />
            </div>
            <div className="relative grid grid-cols-3">
              {[
                { v: stats.totalPoints, label: '累计点数', color: P5R.redHot },
                { v: stats.maxStreak, label: '最长连续天', color: P5R.redHot },
                { v: stats.totalActivities, label: '总记录数', color: P5R.redHot },
                { v: stats.unlockedAchievements, label: '成就已解锁', color: P5R.orange },
                { v: stats.unlockedSkills, label: '技能已解锁', color: P5R.ink },
                { v: stats.uniqueDays, label: '记录天数', color: P5R.ink },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className="flex flex-col items-center gap-1 px-1 py-3"
                  style={{
                    borderLeft: i % 3 !== 0 ? `2px solid ${P5R.ink}` : undefined,
                    borderTop: i >= 3 ? `2px solid ${P5R.ink}` : undefined,
                  }}
                >
                  <span className="text-[27px] font-black leading-none tabular-nums" style={{ color: s.color, fontFamily: P5_FONT }}>{s.v}</span>
                  <span className="text-center text-[11.5px] font-black leading-tight" style={{ color: P5R.ink }}>{s.label}</span>
                </div>
              ))}
            </div>
          </P5Panel>
        </motion.div>

        {/* ── 弹窗 / Toast 族 ── */}
        <TodoCompleteModal
          isOpen={!!completedTitle}
          onClose={() => {
            setCompletedTitle(null);
            setModalBlocker(false);
          }}
          title={completedTitle || ''}
          totalPoints={completedPoints}
          unlockHint={unlockHint}
        />

        {/* 临期 Toast（≤3 天，每卡每天最多一次） */}
        <AnimatePresence>
          {urgentToast && (
            <motion.div
              key={urgentToast}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="pointer-events-none fixed left-1/2 z-[140] -translate-x-1/2"
              style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
            >
              <div className="flex items-center gap-2 whitespace-nowrap px-5 py-2.5 text-sm font-black text-white" style={{ background: P5R.red, clipPath: roughQuad(95, 5), boxShadow: `4px 4px 0 ${P5R.ink}` }}>
                <span aria-hidden>⏳</span>
                <span>{urgentToast}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 逆流衰减通知（纸面板 + 黑框） */}
        <AnimatePresence>
          {decayedAttrs.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onClick={() => setDecayedAttrs([])}
            >
              <motion.div
                initial={{ scale: 0.85, opacity: 0, y: 16, rotate: -2 }}
                animate={{ scale: 1, opacity: 1, y: 0, rotate: -1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', damping: 18, stiffness: 260 }}
                className="w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <P5Panel seed={97} jag={8} frame={3.5} keyline={2.5} shadow={{ x: 6, y: 7 }} bodyClassName="p-6">
                  <div className="mb-4 text-center">
                    <div className="mb-3 text-4xl" aria-hidden>🌊</div>
                    <h3 className="text-lg font-black" style={{ color: P5R.ink }}>逆流侵蚀</h3>
                    <p className="mt-1 text-sm font-bold" style={{ color: P5R.grey }}>以下属性连续3日无增长，已各扣减 1 点</p>
                  </div>
                  <div className="mb-5 space-y-2">
                    {decayedAttrs.map((id, di) => (
                      <div key={id} className="flex items-center justify-between px-4 py-2.5" style={{ clipPath: roughQuad(98 + di, 5), background: '#e3dccd' }}>
                        <span className="text-sm font-black" style={{ color: P5R.ink }}>{settings.attributeNames[id]}</span>
                        <span className="text-sm font-black" style={{ color: P5R.red }}>−1</span>
                      </div>
                    ))}
                  </div>
                  <motion.button
                    type="button"
                    whileTap={{ x: 2, y: 3 }}
                    onClick={() => setDecayedAttrs([])}
                    className="relative w-full cursor-pointer py-3 text-[16px] font-black tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                    style={{ background: P5R.red, clipPath: roughQuad(99, 6), boxShadow: `4px 4px 0 ${P5R.ink}` }}
                  >
                    知道了
                  </motion.button>
                </P5Panel>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 读屏可达的问候（视觉由拼贴标题承担） */}
        <h2 className="sr-only">{user?.name ? `${user.name}的靛蓝色房间` : '靛蓝色房间'}</h2>
      </motion.div>
    </P5RPage>
  );
};
