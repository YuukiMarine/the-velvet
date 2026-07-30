/**
 * DashboardP3 —— 蓝主题（p3 频道）首页，p3-redraw/p3-dashboard-reference-v3.png 1:1。
 *
 * 设计稿区块（自上而下）：幽灵字 MIDNIGHT/STATUS → 大黑斜体「午夜状态」+青洋红句点
 * → 蓝色问候副题 → 日期块（大蓝日数字 + JUL/SAT + 斜线）→ 今日任务（白斜卡 + 接入 CTA）
 * → 人格指数（数据驱动五角星：角长 = 等级，升级变长）→ 六格统计条。
 *
 * 旧首页功能区块按用户裁决全部回归、以 P3R 语言重制（不照搬旧样式）：
 * 钉选宣言卡三态 / 任务列表可直接打卡（TodoCompleteModal）/「今日仪式」StackCarousel
 * （逆流预警 + 星象 + 治疗终端 + 逆影战场）/ 斜界引力线 / 逆流衰减弹窗 / 临期 Toast /
 * 终端 24h 限时任务卡。数据逻辑与 Dashboard.tsx 同源，口径零改动。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate as animateValue } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { useAppStore, toLocalDateKey } from '@/store';
import type { AttributeId, CallingCard } from '@/types';
import { P3R, P3RPage, GhostWords, SectionMark, SlantButton, TitlePeriod, slantClip } from '@/components/p3r/kit';
import { TodoCompleteModal } from '@/components/TodoCompleteModal';
import { BattleDashboardWidget } from '@/components/BattleDashboardWidget';
import { StackCarousel } from '@/components/StackCarousel';
import { TerminalTaskCard } from '@/components/terminal/TerminalTaskCard';
import { getAttributeLevelTitle } from '@/utils/attributeLevelTitles';
import { calcMaxStreak } from '@/utils/streak';
import { TAROT_BY_ID } from '@/constants/tarot';
import { triggerNavFeedback, playSound } from '@/utils/feedback';

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

// ── 真实月相（月龄按 2000-01-06 18:14 UTC 新月历元 + 朔望月 29.5306 天推算）──
const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);
const MOON_NAMES = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];

/** 满月专用暖黄：只有月满时亮面才翻黄，其余相位仍走频道色（红/蓝两个首页同款） */
export const MOON_YELLOW = '#ffcf1a';

const moonPhaseOf = (date: Date) => {
  const days = (date.getTime() - NEW_MOON_EPOCH) / 86400000;
  const phase = (((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS) / SYNODIC_DAYS; // 0 新月 → 0.5 满月
  const idx = Math.round(phase * 8) % 8;
  return { phase, name: MOON_NAMES[idx], illum: (1 - Math.cos(2 * Math.PI * phase)) / 2, full: idx === 4 };
};

/** 亮面路径：外缘半圆 + 明暗界线椭圆弧（两弧法，盈亏自动换边） */
const moonLitPath = (phase: number, r: number, c: number) => {
  const rx = Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * phase)) * r);
  const outer = phase < 0.5 ? 1 : 0; // 盈月亮右缘，亏月亮左缘
  const term = phase > 0.25 && phase < 0.75 ? outer : 1 - outer; // 凸月界线鼓向暗面
  return `M ${c} ${c - r} A ${r} ${r} 0 0 ${outer} ${c} ${c + r} A ${rx} ${r} 0 0 ${term} ${c} ${c - r} Z`;
};

const MoonPhase = ({ date }: { date: Date }) => {
  const { phase, name, illum, full } = moonPhaseOf(date);
  const anim = useBoldness();
  const illumPct = Math.round(illum * 100);
  // 动效（A7）：LUNAR % 数字从 0 滚动到当前亮面比；D0 直接显示终值
  const pct = useMotionValue(anim ? 0 : illumPct);
  const pctText = useTransform(pct, (v) => `${Math.round(v)}`);
  useEffect(() => {
    if (!anim) {
      pct.set(illumPct);
      return;
    }
    const ctrl = animateValue(pct, illumPct, { duration: 0.9, ease: 'easeOut', delay: 0.25 });
    return () => ctrl.stop();
  }, [anim, illumPct, pct]);
  // 亮面生长方向沿盈亏：盈月亮面在右缘（从右往左长出），亏月反之
  const waxing = phase < 0.5;
  return (
    <span className="ml-0.5 flex items-center gap-2" role="img" aria-label={`月相 ${name}，亮面 ${illumPct}%`}>
      <span className="relative flex h-11 w-12 shrink-0 items-center justify-center" style={{ background: P3R.cyanFaint, clipPath: slantClip(8) }}>
        <svg viewBox="0 0 36 36" className="h-8 w-8" aria-hidden>
          <circle cx="18" cy="18" r="15" fill={P3R.ink} />
          <motion.path
            d={moonLitPath(phase, 15, 18)}
            fill={full ? MOON_YELLOW : P3R.cyan}
            initial={anim ? { clipPath: waxing ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)', opacity: 0.4 } : false}
            animate={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.3, 0, 0.2, 1], delay: 0.2 }}
          />
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(27,87,255,0.35)" strokeWidth="1.5" />
        </svg>
        <span aria-hidden className="absolute right-[3px] top-[3px] h-[7px] w-[9px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
      </span>
      <span className="flex flex-col gap-1 leading-none">
        <span className="text-[13px] font-black" style={{ color: P3R.ink }}>{name}</span>
        <span className="text-[9px] font-black tracking-[0.16em]" style={{ color: P3R.blue }}>
          LUNAR <motion.span>{pctText}</motion.span>%
        </span>
      </span>
    </span>
  );
};

// ── 白日版星象仪（数据驱动五角星：角长 = 等级，升级后该角变长；满级淡青大星为底）──
const STAR_CX = 180;
const STAR_CY = 178;
const STAR_R = 150;
const rad = (d: number) => (d * Math.PI) / 180;
const armAngle = (i: number) => -90 + i * 72; // 正立五角星（"放倒/上窄下宽"由容器 3D 透视 rotateX 承担）
const STAR_SKEW = -13;    // 平行四边形斜切：上边右移、下边左移（下左上右）
const STAR_SCALEY = 1.16; // 整体高度拉伸一点
const pt = (ang: number, r: number): [number, number] => [STAR_CX + r * Math.cos(rad(ang)), STAR_CY + r * Math.sin(rad(ang))];

/** 五角星路径：radii[i] 为第 i 个外角半径；凹点随相邻两角联动，保持尖锐星形 */
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

/** 等级 → 外角半径：保底 0.24R 起步，满级顶到底星轮廓（升级即可见地"长角"） */
const levelRadius = (level: number, maxLevel: number) =>
  STAR_R * (0.24 + 0.76 * Math.max(0, Math.min(1, level / Math.max(1, maxLevel))));

interface StarItem {
  id: AttributeId;
  name: string;
  level: number;
  maxLevel: number;
  title: string;
}

const StarChartP3 = ({ items, onSelect, showLabels = true }: { items: StarItem[]; onSelect: (id: AttributeId, e: ReactMouseEvent) => void; showLabels?: boolean }) => {
  const dataPath = starPathAt(items.slice(0, 5).map((it) => levelRadius(it.level, it.maxLevel)));
  // 同心等级星环（用户定稿）：每一档一圈同色系五角星、内浅外深（最多 10 档），
  // 由外到内实心覆盖形成环带——升级即数据星角尖走向更深的一圈，档位一眼可读
  const ringCount = Math.min(10, Math.max(1, items[0]?.maxLevel ?? 5));
  // 内圈浅 → 外圈深：两端点走 CSS 变量、中间档 color-mix 插值——JS 不感知亮暗，
  // 夜间只在 CSS 覆盖两端点（浅青系 → 深蓝系），星环整族自动跟随
  const ringColor = (lvl: number) => {
    const t = Math.round((lvl / ringCount) * 100);
    return `color-mix(in srgb, var(--p3r-star-ring-deep, rgb(124, 201, 234)) ${t}%, var(--p3r-star-ring-pale, rgb(233, 247, 252)))`;
  };
  // 标签锚点：紧贴角端外侧（viewBox 坐标 → 百分比），在同一个 rotateX 透视平面内自动跟随；
  // 按锚点相对中心的方位智能对齐——左角右靠、右角左靠、顶底居中
  const labelAt = (i: number) => {
    const [x, y] = pt(armAngle(i), STAR_R * 1.04);
    const dx = x - STAR_CX;
    const dy = y - STAR_CY;
    const tx = dx < -30 ? -86 : dx > 30 ? -14 : -50;
    const ty = dy < -30 ? -74 : dy > 30 ? -26 : -50;
    return { leftPct: (x / 360) * 100, topPct: (y / 356) * 100, tx, ty };
  };
  return (
    // padding 用固定 px：百分比 padding 按父宽解析，宽屏下会把星整体顶下去裁掉底部标签（用户上报）
    <div className="relative mx-auto w-full max-w-[288px]" style={{ paddingTop: 23, paddingBottom: 32 }}>
      {/* 平行四边形斜切(下左上右) + 高度拉伸；星与标签同处一个 transform，标签再反变换回正 */}
      <div className="relative" style={{ transform: `skewX(${STAR_SKEW}deg) scaleY(${STAR_SCALEY})` }}>
        <svg viewBox="0 0 360 356" className="w-full overflow-visible" aria-hidden>
          {/* 同心星环：从最外档画到最内档，后画的小星盖出环带 */}
          {Array.from({ length: ringCount }).map((_, k) => {
            const lvl = ringCount - k;
            const r = levelRadius(lvl, ringCount);
            return <path key={lvl} d={starPathAt([r, r, r, r, r])} fill={ringColor(lvl)} />;
          })}
          {/* 角端 → 标签方向的臂延长细线（设计稿细节） */}
          {items.slice(0, 5).map((it, i) => {
            const [x1, y1] = pt(armAngle(i), STAR_R * 0.99);
            const [x2, y2] = pt(armAngle(i), STAR_R + 12);
            return <line key={it.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(53,209,232,0.55)" strokeWidth={1.5} />;
          })}
          {/* 数据星：深蓝纯色实心（去描边，用户定稿——深蓝形状即可） */}
          <path d={dataPath} fill={P3R.blueDeep} strokeLinejoin="miter" />
        </svg>
        {/* 五属性标签（可点击 → 属性档案）；rotateX(-θ) 把文字从后仰平面转正对屏幕 */}
        {showLabels && items.slice(0, 5).map((it, i) => {
          const pos = labelAt(i);
          return (
            <button
              key={it.id}
              type="button"
              onClick={(e) => onSelect(it.id, e)}
              className="absolute flex flex-col items-center whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff] focus-visible:ring-offset-1"
              style={{ left: `${pos.leftPct}%`, top: `${pos.topPct}%`, transform: `translate(${pos.tx}%, ${pos.ty}%) skewX(${-STAR_SKEW}deg) scaleY(${1 / STAR_SCALEY})` }}
              aria-label={`${it.name} 等级 ${it.level}，${it.title}`}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="text-[15px] font-black leading-none" style={{ color: P3R.ink }}>{it.name}</span>
                <span className="text-[26px] font-black italic leading-none" style={{ color: P3R.blue }}>{it.level}</span>
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-none" style={{ color: P3R.inkSoft }}>{it.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * AttrDetailInline —— 点击维度后「原地展开」的属性详情（替代 AttributeDossier 弹窗）：
 * 属性名放大移入最左 + 背景大五角星旋转放大填深蓝纯色 + 进度/称号阶梯/关联成就逐条淡入；
 * 再点「返回」由 AnimatePresence 反向倒放回五角星。数据逻辑与 AttributeDossier 同源。
 */
const AttrDetailInline = ({ attrId, level: fallbackLevel, onBack }: { attrId: AttributeId; level: number; onBack: () => void }) => {
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

  // 纯位移进出（无淡入淡出）：属性名/返回从左飞入，数据从右飞入；exit 反向倒放
  const container = {
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
    hide: { transition: { staggerChildren: 0.05, staggerDirection: -1 as const } },
  };
  const fromLeft = { hide: { x: '-116%' }, show: { x: '0%' } };
  const fromRight = { hide: { x: '118%' }, show: { x: '0%' } };
  const spring = { type: 'spring' as const, stiffness: 250, damping: 26 };

  return (
    <motion.div
      className="relative z-10 cursor-pointer pt-1 pb-2"
      onClick={onBack}
      variants={container}
      initial="hide"
      animate="show"
      exit="hide"
    >
      {/* 属性名大字 + Lv（进：曲线位移+缩放到左上；退：渐隐——避免曲线倒放卡顿） */}
      <motion.div
        className="relative origin-top-left"
        initial={{ x: '34%', y: 44, scale: 0.56 }}
        animate={{ x: ['34%', '9%', '0%'], y: [44, -10, 0], scale: [0.56, 0.94, 1], transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1], times: [0, 0.58, 1] } }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
      >
        <div className="text-[52px] font-black italic leading-none" style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}>{name}</div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="relative inline-flex items-baseline gap-1 px-4 py-1 text-white" style={{ clipPath: slantClip(8), background: P3R.blue }}>
            <span className="text-[11px] font-black tracking-wider text-white/85">LV</span>
            <span className="text-[20px] font-black italic leading-none tabular-nums">{level}</span>
            <span aria-hidden className="absolute -bottom-[2px] right-1 h-[5px] w-[12px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          </span>
          <span className="text-[16px] font-black" style={{ color: P3R.ink }}>{curTitle}</span>
          <span className="ml-auto text-[12px] font-bold tabular-nums" style={{ color: P3R.grey }}>{points} pt</span>
        </div>
      </motion.div>

      {/* 进度（从右飞入） */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1 flex items-baseline justify-between text-[11px] font-black" style={{ color: P3R.blue }}>
          <span>{isMax ? '已达最高等级' : `距 Lv.${level + 1}`}</span>
          <span className="tabular-nums">{isMax ? 'MAX' : `${points - curThreshold}/${nextThreshold - curThreshold}`}</span>
        </div>
        <div className="relative h-[10px] w-full overflow-hidden" style={{ background: 'rgba(var(--p3r-wash, 207,234,246), 0.85)', clipPath: slantClip(3) }}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${P3R.blue}, ${P3R.cyan})`, clipPath: slantClip(3) }} />
        </div>
      </motion.div>

      {/* 称号阶梯（从右飞入） */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1.5 text-[12px] font-black" style={{ color: P3R.inkSoft }}>称号阶梯</div>
        <div className="space-y-1">
          {Array.from({ length: lvlMax }, (_, i) => {
            const lv = i + 1;
            const reached = level >= lv;
            const current = level === lv;
            return (
              <div key={lv} className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]" style={{ background: current ? P3R.blue : reached ? 'rgba(var(--p3r-wash, 207,234,246), 0.7)' : 'transparent', clipPath: current || reached ? slantClip(6) : undefined, color: current ? '#fff' : reached ? P3R.ink : P3R.grey }}>
                <span className="w-9 shrink-0 text-[11px] font-black tabular-nums">Lv.{lv}</span>
                <span className="flex-1 font-bold">{getAttributeLevelTitle(settings.attributeLevelTitles, attrId, lv)}</span>
                {current && <span className="text-[10px] font-black">◀ 现在</span>}
                {!reached && <span className="text-[10px] tabular-nums">{thresholds[i] ?? 0} pt</span>}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* 关联成就（从右飞入） */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1.5 text-[12px] font-black" style={{ color: P3R.inkSoft }}>关联成就（{unlockedCount}/{related.length}）</div>
        {related.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] font-semibold" style={{ background: 'rgba(var(--p3r-wash, 207,234,246), 0.5)', clipPath: slantClip(8), color: P3R.grey }}>这个方向还没有专属成就</div>
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
            {related.map((a) => (
              <div key={a.id} className="flex w-[124px] shrink-0 select-none flex-col gap-1 px-3 py-2.5" style={{ background: a.unlocked ? 'rgba(var(--p3r-cyan-rgb, 53,209,232), 0.14)' : 'rgba(var(--p3r-wash, 207,234,246), 0.4)', clipPath: slantClip(8), opacity: a.unlocked ? 1 : 0.72 }}>
                <div className="flex items-center justify-between">
                  <span className="text-lg leading-none" aria-hidden>{a.icon}</span>
                  <span className="shrink-0 text-[9px] font-black" style={{ color: a.unlocked ? P3R.magenta : P3R.grey }}>{a.unlocked ? '已解锁' : '未解锁'}</span>
                </div>
                <div className="truncate text-[12px] font-black" style={{ color: P3R.ink }}>{a.title}</div>
                <div className="line-clamp-2 text-[10px] font-semibold leading-tight" style={{ color: P3R.grey }}>{a.description}</div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* 返回（从左飞入；点击倒放） */}
      <motion.div className="relative mt-5" variants={fromLeft} transition={spring}>
        <button type="button" onClick={onBack} className="flex items-center gap-2 text-[15px] font-black" style={{ color: P3R.blue }}>
          <span aria-hidden className="h-0 w-0 border-y-[6px] border-y-transparent border-r-[9px]" style={{ borderRightColor: P3R.blue }} />
          返回
        </button>
      </motion.div>
    </motion.div>
  );
};

// ── P3R 仪式横条（今日仪式 StackCarousel 的统一卡形：浅青斜条 + 左标 + 副行 + ›）──
const RitualSlab = ({
  icon,
  title,
  sub,
  onClick,
  accent,
}: {
  icon: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
  accent?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex h-full min-h-[76px] w-full items-center gap-3 px-5 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
    style={{ clipPath: slantClip(12), background: P3R.cyanPale }}
  >
    <span aria-hidden className="h-9 w-[4px] shrink-0" style={{ background: accent ?? P3R.blue, transform: 'skewX(-20deg)' }} />
    <span aria-hidden className="shrink-0 text-xl leading-none">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-black" style={{ color: P3R.ink }}>{title}</span>
      {sub && <span className="mt-0.5 block truncate text-[12px] font-semibold" style={{ color: P3R.inkSoft }}>{sub}</span>}
    </span>
    <span aria-hidden className="shrink-0 text-lg font-black" style={{ color: P3R.blue }}>›</span>
  </button>
);

// ── 页面 ────────────────────────────────────────────────────────────────────
export const DashboardP3 = () => {
  const {
    user, todos, activities, achievements, skills, attributes, settings, dailyDivination,
    completeTodo, getTodayTodoProgress, setModalBlocker, setCurrentPage,
    applyCountercurrentDecay, getCountercurrentWarnings, callingCards,
    getActiveTerminalTask, completeTerminalTask, dismissTerminalTask,
    wishes, getDueTodosToday,
  } = useAppStore();
  const activeTerminalTask = getActiveTerminalTask();
  const [dossierAttr, setDossierAttr] = useState<AttributeId | null>(null);
  const [completedTitle, setCompletedTitle] = useState<string | null>(null);
  const [completedPoints, setCompletedPoints] = useState(1);
  const [unlockHint, setUnlockHint] = useState<{ achievements: number; skills: number }>({ achievements: 0, skills: 0 });
  const [decayedAttrs, setDecayedAttrs] = useState<AttributeId[]>([]);
  // 五维点击波纹：状态放在维度区（不在会被旋转/淡出的星层内），才看得见
  const [starRipples, setStarRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const starSectionRef = useRef<HTMLDivElement>(null);
  // 首页空态「无宣言卡」虚线框可关闭（与非蓝主题 CallingCardEmptyHint 共用同一 localStorage 键）
  const [ccHintDismissed, setCcHintDismissed] = useState(() => {
    try { return localStorage.getItem('velvet_cc_hint_dismissed') === '1'; } catch { return false; }
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const subtext = useMemo(() => {
    const pool = SUBTEXTS[getSlot(now.getHours())];
    return pool[Math.floor(Math.random() * pool.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 问候语开头自带 emoji（夜间是 🌙/🌟）。首页日期卡旁边就是真实月相图形，
  // 再挂一个系统黄色月亮 emoji 既撞义又破配色——这里摘掉开头的 emoji 只留文字。
  const greeting = useMemo(() => subtext.replace(/^\s*\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*\s*/u, ''), [subtext]);

  // ── 今日任务（口径同 Dashboard：启用+星期匹配+未来启用日过滤；今天完成后归档的仍显示；重要在前）──
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

  // ── 宣言卡（钉选三态；终端任务卡存表但不是宣言卡）──────────────────────
  const realCallingCards = callingCards.filter((c) => !c.terminal);
  const pinned: CallingCard | null = realCallingCards.find((c) => c.pinned && !c.archived) ?? null;
  const unpinnedCount = realCallingCards.filter((c) => !c.archived).length;
  const daysLeft = pinned?.targetDate
    ? Math.max(0, Math.round((new Date(pinned.targetDate + 'T00:00:00').getTime() - new Date(todayKey + 'T00:00:00').getTime()) / 86400000))
    : null;

  // 临期 Toast（D1）：≤ 3 天且当日首次见到时弹一次（localStorage 防骚扰；逻辑同 Dashboard）
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

  // 跳转任务页 + 滚到宣言卡区（同 Dashboard）
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

  // ── 逆流：进入首页执行衰减；预警条 false→true 沿触发仪式组跳回第一页（同 Dashboard）──
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

  // 星角方位按设计稿定序（顶=知识 → 顺时针 胆量/灵巧/温柔/魅力），与 store 内属性顺序解耦
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

  // 六格统计（口径同 Dashboard）
  const stats = useMemo(() => {
    const totalPoints = attributes.reduce((s, a) => s + (a.points ?? 0), 0);
    const totalLevel = attributes.reduce((s, a) => s + (a.level ?? 0), 0);
    const uniqueDays = new Set(activities.map((a) => toLocalDateKey(new Date(a.date)))).size;
    return {
      totalPoints,
      totalLevel,
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

  // ── 治疗终端入口副行数据（口径同 Dashboard.TerminalEntryCard）─────────────
  const terminalGoals = wishes.filter((w) => !w.parentId && w.status !== 'archived');
  const terminalSteps =
    wishes.filter((w) => w.parentId && w.status === 'active').length +
    getDueTodosToday().filter((t) => !getTodayTodoProgress(t.id).isComplete).length;

  // ──「今日仪式」slides（约束照旧：条件在组装处拦截，不让内部 return null 的组件变空白页）──
  const ritualSlides: ReactNode[] = [];
  if (hasCountercurrentWarning) {
    ritualSlides.push(
      <div key="countercurrent" className="h-full [&>*]:h-full">
        <RitualSlab
          icon="🌊"
          accent={P3R.magenta}
          title={<span style={{ color: P3R.magenta }}>逆流预警</span>}
          sub={`${countercurrentWarnings.map((id) => settings.attributeNames[id]).join('、')} 已连续3日无增长，明日将${countercurrentWarnings.length > 1 ? '各' : ''}扣减 1 点`}
        />
      </div>,
    );
  }
  ritualSlides.push(
    <div key="astrology" className="h-full [&>*]:h-full">
      <RitualSlab
        icon={
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
            {/* 塔罗仪式卡的月亮：整站唯一一处暖黄，作为「今日星象」的记号色 */}
            <path d="M20.5 15.2A9 9 0 1 1 9.2 3.8a7.2 7.2 0 0 0 11.3 11.4Z" fill={MOON_YELLOW} />
          </svg>
        }
        onClick={() => go('astrology')}
        title={drawn && drawnCard ? `${drawnCard.name} · ${drawn.orientation === 'upright' ? '正位' : '逆位'}` : '今日星象尚未展开'}
        sub={
          drawn && drawnCard
            ? `${settings.attributeNames[drawn.effect.attribute]} × ${drawn.effect.multiplier}${drawn.advice ? ` · ${drawn.advice}` : ''}`
            : '点击进入星象，从三张塔罗中抽取一张'
        }
      />
    </div>,
  );
  if (settings.terminalEnabled) {
    ritualSlides.push(
      <div key="terminal" className="h-full [&>*]:h-full">
        <RitualSlab
          icon="✦"
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

  return (
    <P3RPage className="overflow-hidden">
      <motion.div ref={rootRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative pb-6">
        {/* 斜界引力线已按用户裁决移除（2026-07-12："删除主页背景那条莫名其妙的生长线"） */}

        {/* 幽灵字（右上，随页滚动） */}
        <GhostWords words={['THE', 'VELVET']} className="right-[10px] top-[10px] text-right text-[58px]" />
        {/* 幽灵字（左缘竖排：顺时针 90° 贴左侧；关视差防竖排字横漂） */}
        {/* 竖排 WILD HEART：放大到 104px 并整体下移到首屏下半（用户口径"平移到屏幕底部、
            放大一些"）。rotate(90deg)+origin:left top 下，字样占的横向宽度 = 行高
            (104 × leading .86 ≈ 90px)，所以 left 必须 ≥ 90 才不被页面左缘削掉。 */}
        <GhostWords words={['WILD HEART']} parallax={false} className="left-[104px] top-[336px] text-[104px] whitespace-nowrap" style={{ transform: 'rotate(90deg)', transformOrigin: 'left top' }} />

        {/* ── 页头 ── */}
        <header className="relative pt-4">
          <h1
            className="inline-flex items-end text-[54px] font-black italic leading-[0.95] tracking-tight"
            style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}
          >
            靛蓝色房间
            <TitlePeriod className="mb-1.5 ml-1.5" />
          </h1>
          <p className="mt-2 text-[15px] font-bold" style={{ color: P3R.blue }}>{greeting}</p>

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
            <MoonPhase date={now} />
          </div>
        </header>

        {/* ── 钉选宣言卡 / 倒计时（三态，P3R 横条形）── */}
        {pinned ? (
          <button
            type="button"
            onClick={jumpToCallingCardSection}
            className="mt-5 flex w-full items-center gap-3 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
            style={{ clipPath: slantClip(10), background: P3R.panel, boxShadow: '0 10px 24px rgba(38,96,140,0.10)' }}
          >
            <span aria-hidden className="h-9 w-[4px] shrink-0" style={{ background: P3R.blue, transform: 'skewX(-20deg)' }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black tracking-[0.18em]" style={{ color: P3R.grey }}>PINNED · 宣言</span>
              <span className="mt-0.5 block truncate text-[15px] font-black" style={{ color: P3R.ink }}>{pinned.title}</span>
              {pinned.subtitle && <span className="mt-0.5 block truncate text-[11px] font-semibold" style={{ color: P3R.inkSoft }}>{pinned.subtitle}</span>}
            </span>
            {daysLeft !== null ? (
              <span className="flex shrink-0 items-baseline gap-1">
                <span className="text-[11px] font-bold" style={{ color: P3R.inkSoft }}>剩</span>
                <span className="text-[26px] font-black italic leading-none tabular-nums" style={{ color: daysLeft <= 3 ? P3R.magenta : P3R.blue }}>{daysLeft}</span>
                <span className="text-[11px] font-bold" style={{ color: P3R.inkSoft }}>天</span>
              </span>
            ) : (
              <span aria-hidden className="shrink-0 text-lg font-black" style={{ color: P3R.blue }}>›</span>
            )}
          </button>
        ) : unpinnedCount > 0 ? (
          <button
            type="button"
            onClick={jumpToCallingCardSection}
            className="mt-5 flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[12px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
            style={{ clipPath: slantClip(8), background: P3R.cyanFaint, color: P3R.inkSoft }}
          >
            <span className="min-w-0 flex-1 truncate">你有 {unpinnedCount} 张倒计时未钉到主页</span>
            <span aria-hidden style={{ color: P3R.blue }}>›</span>
          </button>
        ) : ccHintDismissed ? null : (
          <div
            className="relative mt-5 flex w-full items-center gap-1 py-2.5 pl-5 pr-2 text-[12px] font-bold"
            style={{ clipPath: slantClip(8), background: 'transparent', border: '1.5px dashed rgba(27,87,255,0.4)', color: P3R.inkSoft }}
          >
            <button
              type="button"
              onClick={jumpToCallingCardSection}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
            >
              <span className="min-w-0 flex-1 truncate">还没有宣言卡——立下一个倒计时或目标宣言</span>
              <span aria-hidden style={{ color: P3R.blue }}>›</span>
            </button>
            {/* 关闭：拆成并列 button（不嵌套），主体 min-w-0 可收缩，× 不会被挤出被裁 */}
            <button
              type="button"
              aria-label="不再提示"
              onClick={() => {
                try { localStorage.setItem('velvet_cc_hint_dismissed', '1'); } catch { /* 隐私模式忽略 */ }
                setCcHintDismissed(true);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-base leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
              style={{ color: P3R.grey }}
            >×</button>
          </div>
        )}

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

        {/* ── 今日任务（白斜卡列表：直接打卡；接入 CTA 探出右缘）── */}
        <section className="mt-7" aria-label="今日任务">
          <SectionMark
            title="今日任务"
            meta={
              <button type="button" onClick={() => go('todos')} className="flex items-baseline gap-1.5 text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]" style={{ color: P3R.blue }} aria-label="打开任务页">
                {totalCount > 0 && (
                  <span className="font-black italic tabular-nums">
                    {completedCount}<span className="mx-0.5" style={{ color: P3R.grey }}>/</span>{totalCount}
                  </span>
                )}
                <span aria-hidden>›</span>
              </button>
            }
          />
          <div className="relative mt-3 flex items-stretch">
            <div
              className="relative min-h-[96px] flex-1"
              style={{ clipPath: slantClip(14), background: P3R.panel, boxShadow: '0 14px 30px rgba(38,96,140,0.10)' }}
            >
              {todayTodos.length === 0 ? (
                <div className="flex h-full min-h-[96px] items-center gap-2.5 pl-7 pr-4">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: P3R.cyan }} />
                  <span className="text-[17px] font-black" style={{ color: P3R.ink }}>暂无可追踪的信号</span>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 py-3 pl-6 pr-3">
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
                        className={`flex w-full items-center gap-3 px-1.5 py-2 text-left transition-colors ${done ? 'cursor-not-allowed opacity-55' : 'active:bg-[#e2f2fa]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]`}
                      >
                        {/* 斜切勾选框（P3R：完成 = 亮青底白勾） */}
                        <span aria-hidden className="relative h-[18px] w-[18px] shrink-0" style={{ clipPath: slantClip(4), background: done ? P3R.cyan : 'rgba(53,209,232,0.45)' }}>
                          {!done && <span className="absolute inset-[2.5px]" style={{ clipPath: slantClip(3), background: P3R.panel }} />}
                          {done && (
                            <svg viewBox="0 0 12 12" className="absolute inset-0 m-auto h-3 w-3" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            {todo.important && <span aria-hidden className="h-2 w-2 shrink-0" style={{ background: P3R.magenta, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }} />}
                            <span className={`truncate text-[15px] font-black ${done ? 'line-through' : ''}`} style={{ color: done ? P3R.grey : P3R.ink }}>
                              {todo.title}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] font-semibold" style={{ color: P3R.grey }}>
                            {attrName} +{todo.points}
                            {todo.extraBoosts?.map((b, bi) => (
                              <span key={bi}> · {settings.attributeNames[b.attribute as keyof typeof settings.attributeNames]} +{b.points}</span>
                            ))}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: done ? P3R.cyan : P3R.grey }}>
                          {progress.count}/{progress.target}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* 卡底整体进度细条（completed/total） */}
              {totalCount > 0 && (
                <div aria-hidden className="absolute bottom-0 left-0 right-0 h-[5px]" style={{ background: 'rgba(var(--p3r-wash, 207,234,246), 0.9)' }}>
                  <motion.div
                    className="h-full"
                    style={{ background: P3R.cyan }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(completedCount / totalCount) * 100}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ──「今日仪式」横滑组（逆流预警[条件] / 星象 / 治疗终端[条件] / 逆影战场[条件]）── */}
        <section className="mt-7" aria-label="今日仪式">
          <SectionMark title="今日仪式" meta={<span className="text-[11px] font-bold" style={{ color: P3R.grey }}>滑动切换</span>} />
          <div className="mt-3">
            {/* 全局裁决（2026-07-12）：仪式卡撑满一屏 + 自动轮播（第二张不再探出一截） */}
            <StackCarousel id="ritual-p3" page={ritualPage} itemWidthClass="w-full" autoPlayMs={6000}>
              {ritualSlides}
            </StackCarousel>
          </div>
        </section>

        {/* ── 人格指数（数据驱动五角星）── */}
        <section className="mt-7" aria-label="人格指数">
          <SectionMark
            title="人格指数"
            meta={
              <button type="button" onClick={() => go('statistics')} className="text-[14px] font-bold" style={{ color: P3R.blue }}>
                详细统计 <span aria-hidden>›</span>
              </button>
            }
          />
          {/* 五角星 ⇄ 详情：共存 + 纯位移切换（不淡入淡出，像游戏 UI 移动位置）
              星 absolute 浮在顶层、详情相对流撑开高度（内容不被裁），父只裁水平飞入 */}
          <div ref={starSectionRef} className="relative min-h-[344px] overflow-hidden">
            {/* 五角星层：选中时旋转 + 放大成深蓝大星背景（移动，非淡出；填充随 opacity 沉为衬底） */}
            <motion.div
              className="absolute inset-x-0 top-2 z-0"
              animate={dossierAttr ? { scale: 1.42, rotate: -122, x: '14%', y: '16%', opacity: 0.16 } : { scale: 1, rotate: 0, x: '0%', y: '0%', opacity: 1 }}
              transition={{ type: 'spring', stiffness: 190, damping: 24 }}
              style={{ transformOrigin: 'center', pointerEvents: dossierAttr ? 'none' : 'auto' }}
            >
              <StarChartP3
                items={starItems}
                onSelect={(id, e) => {
                  const rect = starSectionRef.current?.getBoundingClientRect();
                  if (rect) setStarRipples((rs) => [...rs, { id: Date.now(), x: e.clientX - rect.left, y: e.clientY - rect.top }]);
                  setDossierAttr(id);
                }}
                showLabels={!dossierAttr}
              />
            </motion.div>
            {/* 详情层：选中时字段从两侧滑入（纯位移 stagger，返回倒放）。
                外层高度动画：展开 0→auto / 收合 auto→0 与内部倒放同播——
                否则详情 exit 播完瞬间卸载,区块从高位直接跳回 344,底部先空一截再卡回（用户上报） */}
            <motion.div
              className="relative z-10 overflow-hidden"
              initial={false}
              animate={{ height: dossierAttr ? 'auto' : 0 }}
              transition={{ duration: 0.34, ease: [0.3, 0, 0.2, 1] }}
            >
              <AnimatePresence>
                {dossierAttr && (
                  <AttrDetailInline
                    key={dossierAttr}
                    attrId={dossierAttr}
                    level={starItems.find((it) => it.id === dossierAttr)?.level ?? 1}
                    onBack={() => setDossierAttr(null)}
                  />
                )}
              </AnimatePresence>
            </motion.div>
            {/* 点击波纹：独立叠层(z-30)，不随星层旋转/淡出——以点击维度字位置为圆心，全不透明清晰可见 */}
            <AnimatePresence>
              {starRipples.map((rp) => (
                <motion.span
                  key={rp.id}
                  aria-hidden
                  className="pointer-events-none absolute z-30 rounded-full"
                  style={{ left: rp.x, top: rp.y, border: `3px solid ${P3R.blue}`, background: 'radial-gradient(circle, rgba(53,209,232,0.4) 0%, rgba(27,87,255,0) 70%)' }}
                  initial={{ width: 16, height: 16, x: '-50%', y: '-50%', opacity: 0.85 }}
                  animate={{ width: 250, height: 250, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  onAnimationComplete={() => setStarRipples((rs) => rs.filter((r) => r.id !== rp.id))}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>

        {/* ── 四格统计条（累计点数/总记录数/总等级/记录天数；成就·技能已挪至详细统计页）── */}
        <div className="mt-2 grid grid-cols-4 py-3.5" style={{ clipPath: slantClip(12), background: 'var(--p3r-statstrip, rgba(207,234,246,0.75))' }}>
          {[
            { v: stats.totalPoints, label: '累计点数', color: P3R.blue },
            { v: stats.totalActivities, label: '总记录数', color: P3R.blue },
            { v: stats.totalLevel, label: '总等级', color: P3R.blue },
            { v: stats.uniqueDays, label: '记录天数', color: '#10b981' },
          ].map((s, i) => (
            <div key={s.label} className={`flex flex-col items-center gap-1 px-1 ${i > 0 ? 'border-l' : ''}`} style={i > 0 ? { borderColor: 'var(--p3r-statstrip-div, rgba(255,255,255,0.7))' } : undefined}>
              <span className="text-[26px] font-black italic leading-none tabular-nums" style={{ color: s.color }}>{s.v}</span>
              <span className="text-center text-[11px] font-bold leading-tight" style={{ color: P3R.inkSoft }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── 弹窗 / Toast 族（复用现有基座；P3R 弹窗形态属 modals 批次）── */}

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

        {/* 临期 Toast（D1）：≤ 3 天，每张卡每天最多弹一次 */}
        <AnimatePresence>
          {urgentToast && (
            <motion.div
              key={urgentToast}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="fixed left-1/2 -translate-x-1/2 z-[140] pointer-events-none"
              style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
            >
              <div className="flex items-center gap-2 whitespace-nowrap px-5 py-2.5 text-sm font-black text-white shadow-2xl" style={{ clipPath: slantClip(8), background: P3R.blue }}>
                <span aria-hidden>⏳</span>
                <span>{urgentToast}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 逆流衰减通知（弹窗基座复用；内容与 Dashboard 相同） */}
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
                className="w-full max-w-sm bg-white p-6 shadow-2xl"
                style={{ clipPath: slantClip(16) }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 text-center">
                  <div className="mb-3 text-4xl" aria-hidden>🌊</div>
                  <h3 className="text-lg font-black" style={{ color: P3R.ink }}>逆流侵蚀</h3>
                  <p className="mt-1 text-sm font-semibold" style={{ color: P3R.inkSoft }}>以下属性连续3日无增长，已各扣减 1 点</p>
                </div>
                <div className="mb-5 space-y-2">
                  {decayedAttrs.map((id) => (
                    <div key={id} className="flex items-center justify-between px-4 py-2.5" style={{ clipPath: slantClip(8), background: P3R.cyanFaint }}>
                      <span className="text-sm font-black" style={{ color: P3R.ink }}>{settings.attributeNames[id]}</span>
                      <span className="text-sm font-black" style={{ color: P3R.magenta }}>−1</span>
                    </div>
                  ))}
                </div>
                <SlantButton tone="primary" onClick={() => setDecayedAttrs([])} className="w-full">
                  知道了
                </SlantButton>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 读屏可达的问候（视觉由上方标题承担） */}
        <h2 className="sr-only">{user?.name ? `${user.name}的靛蓝色房间` : '靛蓝色房间'}</h2>
      </motion.div>
    </P3RPage>
  );
};
