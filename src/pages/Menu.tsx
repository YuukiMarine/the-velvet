/**
 * 「菜单」页 —— P5 式对角断层宫格（UI_DESIGN_BOLD_V2.5.md §5「菜单」行）。
 *
 * 斜界采用（全站第一个页面级使用者）：
 *   · 整页包 <PagePlane>（世界倾斜 var(--ui-axis)）；瓷砖**内容**包 <PlaneLevel>
 *     反制回正——瓷砖盒边缘随世界斜、字恒水平（护栏 §7.1）。
 *   · 一切裁切（切角 / 出血巨数）只作用于 aria-hidden 的装饰盒；
 *     瓷砖本体恒为完整矩形 button（命中区铁律 §7.2）。shadow-sm 挂在
 *     button 上而非装饰盒：clip-path 会把整圈 box-shadow 裁没。
 *
 * 断层几何（v1 近似，注明升级路径）：
 *   · 断层线角度由宫格容器宽高 atan2 计算（offsetWidth/Height 取布局盒——
 *     宫格在斜面内被旋转，getBoundingClientRect 的外接框会引入角度偏差），
 *     ResizeObserver 跟随，并同步写入容器 --fault-angle。
 *   · 瓷砖切角方向全部统一：左列切右上角、右列切左下角，尺寸
 *     calc(var(--ui-cut) * 1.6)——视觉上「线切过一刀」的 v1 近似。
 *     严格做法是让每个切角斜边平行于断层角（后续 PR 直接消费容器上
 *     已写好的 --fault-angle 派生 clip-path 顶点即可）。
 *   · D0（--boldness=0）下 --ui-cut 归零、切角自动消失；断层线是信息
 *     （频率分界）不是装饰，D0 仍在场。
 *
 * 过渡期瓷砖集合（行动/羁绊合并与终端/记账未上线，先收编现有页面）：
 *   · 「记录」：行动合并 PR 落地后此瓷砖移除；
 *   · 「占卜」：羁绊页合并后移入羁绊页。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useAppStore } from '@/store';
import { PagePlane, PlaneLevel } from '@/components/PagePlane';
import { TrophyIcon } from '@/components/Navigation';
import { isInShadowTime } from '@/constants';
import { calcCurrentStreak } from '@/utils/streak';
import { triggerNavFeedback } from '@/utils/feedback';
import { useBoldness } from '@/utils/boldness';
import { STAGGER, TAP, springSoft, fadeIn } from '@/utils/motion';

// ── 图标（24px stroke 制式，与 Navigation.tsx 同一套 heroicons outline 风格）──

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
    <path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
    <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
    <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
    <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── 入场动效 ────────────────────────────────────────────────────────────────
// 手工 delay 而非 staggerParent：级联次序是「左1→右1→左2→右2…」的沿断层对角
// 穿插，与 DOM 顺序（先整列左、后整列右）不一致，staggerChildren 给不出这个序。
// 位移几何与 motion.ts 的 cardIn 同源（斜向入场签名）。
const tileIn: Variants = {
  hidden: { opacity: 0, x: -8, y: 8 },
  show: (order: number) => ({
    opacity: 1,
    x: 0,
    y: 0,
    transition: { ...springSoft, delay: order * STAGGER },
  }),
};

// ── 瓷砖 ────────────────────────────────────────────────────────────────────

interface TileProps {
  /** 决定切角方向：左列切右上角、右列切左下角（朝断层线的那一角） */
  side: 'left' | 'right';
  /** 对角级联序号（delay = order * STAGGER） */
  order: number;
  /** D0 时改播 fadeIn（无位移） */
  bold: boolean;
  hero?: boolean;
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  /** PlaneLevel 内的真值小字（信息源与图形层解耦，护栏 §7.3） */
  sub?: ReactNode;
  /** 右上角徽章（自身需带 aria-hidden，真值并入 ariaLabel） */
  badge?: ReactNode;
  /** 注入装饰盒的出血图形：被 clip-path + overflow-hidden 裁切 */
  bleed?: ReactNode;
  onPress: () => void;
}

const Tile = ({ side, order, bold, hero, label, ariaLabel, icon, sub, badge, bleed, onPress }: TileProps) => {
  // 切角尺寸全部派生自 --ui-cut（角度同源纪律）；D0 归零退化为完整矩形
  const cut = 'calc(var(--ui-cut) * 1.6)';
  const clipPath =
    side === 'left'
      ? `polygon(0 0, calc(100% - ${cut}) 0, 100% ${cut}, 100% 100%, 0 100%)`
      : `polygon(0 0, 100% 0, 100% 100%, ${cut} 100%, 0 calc(100% - ${cut}))`;

  return (
    <motion.button
      type="button"
      custom={order}
      variants={bold ? tileIn : fadeIn}
      initial="hidden"
      animate="show"
      whileTap={TAP}
      onClick={() => {
        triggerNavFeedback();
        onPress();
      }}
      aria-label={ariaLabel}
      className="relative w-full rounded-2xl text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {/* 装饰盒：承载卡面/边框/出血巨数，被切角；命中区（button 本体）不裁 */}
      <div
        aria-hidden
        className={`absolute inset-0 overflow-hidden rounded-2xl border ${
          hero
            ? 'bg-primary/10 border-primary/20'
            : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'
        }`}
        style={{ clipPath }}
      >
        {bleed}
      </div>

      {/* 内容反制回正：盒斜、字平 */}
      <PlaneLevel className={`relative flex flex-col p-4 ${hero ? 'min-h-[212px]' : 'min-h-[100px] justify-between'}`}>
        <div className="flex items-start justify-between gap-2">
          <span className={hero ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}>{icon}</span>
          {badge}
        </div>
        <div className={hero ? 'mt-2' : ''}>
          <div className="text-sm font-bold text-gray-900 dark:text-white">{label}</div>
          {sub}
        </div>
      </PlaneLevel>
    </motion.button>
  );
};

// ── 页面 ────────────────────────────────────────────────────────────────────

export const Menu = () => {
  const { activities, achievements, skills, attributes, settings, setCurrentPage } = useAppStore();
  const bold = useBoldness();

  const currentStreak = useMemo(() => calcCurrentStreak(activities.map(a => a.date)), [activities]);

  // 待解锁数：与 Settings.tsx 成就入口同一份轻量判定口径——只算「基础属性条件
  // 已满足但未解锁」的三类（attribute_level / total_points / all_attributes_max），
  // blessing_* 由用户手动开关、不算待解锁；重计算条件（连续天数等）以成就页为准。
  const totalPendingUnlocks = useMemo(() => {
    const pendingSkills = skills.filter(s => {
      if (s.id.startsWith('blessing_')) return false;
      const attr = attributes.find(a => a.id === s.requiredAttribute);
      return !!attr && attr.level >= s.requiredLevel && !s.unlocked;
    }).length;
    const pendingAchievements = achievements.filter(a => {
      if (a.unlocked) return false;
      switch (a.condition.type) {
        case 'attribute_level': {
          const attr = attributes.find(x => x.id === a.condition.attribute);
          return !!attr && attr.level >= a.condition.value;
        }
        case 'total_points':
          return attributes.reduce((s, x) => s + (x.points ?? 0), 0) >= a.condition.value;
        case 'all_attributes_max':
          return attributes.filter(x => x.level >= a.condition.value).length >= attributes.length;
        default:
          return false;
      }
    }).length;
    return pendingSkills + pendingAchievements;
  }, [skills, achievements, attributes]);

  // 影时间判定：与 BattleDashboardWidget 同一份口径（默认 周五六日 20:00–7:00，
  // 60s 轮询跨界变化）。battleEnabled === false 时瓷砖整块不渲染，hook 仍无条件跑。
  const [inShadowTime, setInShadowTime] = useState(false);
  useEffect(() => {
    const check = () => {
      setInShadowTime(
        isInShadowTime(
          settings.battleShadowTimeDays ?? [5, 6, 0],
          settings.battleShadowTimeStart ?? 20,
          settings.battleShadowTimeEnd ?? 7
        )
      );
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [settings.battleShadowTimeDays, settings.battleShadowTimeStart, settings.battleShadowTimeEnd]);

  // 断层线：角度/长度按宫格布局盒 atan2 计算，--fault-angle 写回容器
  // 供断层线旋转与后续「切角平行断层」升级消费。
  const gridRef = useRef<HTMLDivElement>(null);
  const [fault, setFault] = useState({ angle: 0, length: 0 });
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w <= 0 || h <= 0) return;
      const angle = (Math.atan2(h, w) * 180) / Math.PI;
      setFault({ angle, length: Math.hypot(w, h) });
      el.style.setProperty('--fault-angle', `${angle.toFixed(2)}deg`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const battleVisible = settings.battleEnabled !== false;
  // 对角级联序：左列第 i 块 = 2i，右列第 i 块 = 2i+1（战场隐藏时右列顺位前移）
  const orderOf = (side: 'left' | 'right', i: number) => (side === 'left' ? i * 2 : i * 2 + 1);

  const streakDigits = String(currentStreak).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-2xl mx-auto"
    >
      <PagePlane>
        <div className="space-y-5">
          {/* ── 页头：镂空斜带标题（本页的「文字怪物」，§2 规则5） ──
              SVG mask 真镂空：白 rect 显带、黑色粗体字挖洞透出页面背景。
              mask 挂在不带变换的 <g> 上、skew 只作用于带形 rect——
              带斜、字不斜；整块再包 PlaneLevel 反制世界倾角，文字本体恒水平。 */}
          <header className="relative">
            <PlaneLevel className="relative inline-block select-none">
              <svg viewBox="0 0 260 76" className="block h-auto w-[248px]" aria-hidden="true" focusable="false">
                <defs>
                  <mask id="menu-banner-knockout" maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="76">
                    <rect width="260" height="76" fill="#fff" />
                    <text x="34" y="52" fontSize="40" fontWeight="900" letterSpacing="10" fill="#000">
                      菜单
                    </text>
                  </mask>
                </defs>
                <g mask="url(#menu-banner-knockout)">
                  {/* 带形 skew 引用 --ui-skew-ui（D0 自动归零）；旧引擎兜底 -10deg 近似 */}
                  <rect
                    x="16"
                    y="8"
                    width="212"
                    height="56"
                    fill="var(--color-primary)"
                    style={{
                      transform: 'skewX(var(--ui-skew-ui, -10deg))',
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                    }}
                  />
                </g>
              </svg>
              {/* 英文水印：照搬 PageTitle 的 Caveat 字体与主题色处理 */}
              <span
                className="absolute text-lg leading-none text-primary pointer-events-none"
                style={{ fontFamily: "'Caveat', cursive", fontWeight: 600, right: 8, bottom: -10 }}
              >
                menu
              </span>
            </PlaneLevel>
            {/* 镂空字是图形层：真标题给读屏 */}
            <h2 className="sr-only">菜单</h2>
          </header>

          {/* ── 对角断层宫格 ── */}
          <section aria-label="功能入口">
            <div ref={gridRef} className="relative grid grid-cols-2 gap-3">
              {/* 左列：断层上方 = 高频 */}
              <div className="flex flex-col gap-3">
                <Tile
                  side="left"
                  order={orderOf('left', 0)}
                  bold={bold}
                  hero
                  label="统计"
                  ariaLabel={`统计：当前连续 ${currentStreak} 天`}
                  icon={<ChartIcon />}
                  sub={
                    <div className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      连续 {currentStreak} 天
                    </div>
                  }
                  bleed={
                    /* 出血巨数：图形层复本（装饰盒 aria-hidden 已覆盖）。
                       护栏 §7.3：首位必须完整——多位数只向右出血裁尾位，
                       一位数（即首位）不做横向出血；纵向 0.12em 基本只裁
                       数字基线以下的空白区。 */
                    <span
                      className="absolute bottom-0 right-0 font-black italic leading-none text-primary/20 select-none"
                      style={{
                        fontSize: '7.5rem',
                        transform: `translate(${streakDigits > 1 ? '0.16em' : '0em'}, 0.12em)`,
                      }}
                    >
                      {currentStreak}
                    </span>
                  }
                  onPress={() => setCurrentPage('statistics')}
                />
                <Tile
                  side="left"
                  order={orderOf('left', 1)}
                  bold={bold}
                  label="成就·技能"
                  ariaLabel={totalPendingUnlocks > 0 ? `成就·技能：${totalPendingUnlocks} 项待解锁` : '成就·技能'}
                  icon={<TrophyIcon />}
                  badge={
                    totalPendingUnlocks > 0 ? (
                      /* 斜边徽章：平行四边形 pill 用 --ui-skew-ui，数字反向 skew 回正（字不斜） */
                      <span
                        aria-hidden
                        className="inline-block bg-amber-400/95 dark:bg-amber-500/95 px-2 py-0.5"
                        style={{ transform: 'skewX(var(--ui-skew-ui))' }}
                      >
                        <span
                          className="inline-block text-2xs font-black text-amber-950"
                          style={{ transform: 'skewX(calc(-1 * var(--ui-skew-ui)))' }}
                        >
                          {totalPendingUnlocks}
                        </span>
                      </span>
                    ) : undefined
                  }
                  onPress={() => setCurrentPage('achievements')}
                />
              </div>

              {/* 右列：断层下方整体下移 28px 形成砖砌错位（规格"半格"≈50px 的视觉收敛值，
                  全量下移会让右列底部越过左列过多） */}
              <div className="flex flex-col gap-3 translate-y-7">
                {battleVisible && (
                  <Tile
                    side="right"
                    order={orderOf('right', 0)}
                    bold={bold}
                    label="逆影战场"
                    ariaLabel={inShadowTime ? '逆影战场：影时间进行中' : '逆影战场'}
                    icon={<BoltIcon />}
                    badge={
                      inShadowTime ? (
                        <span aria-hidden className="text-sm leading-none text-purple-500 dark:text-purple-400 animate-pulse">
                          ✦
                        </span>
                      ) : undefined
                    }
                    onPress={() => setCurrentPage('battle')}
                  />
                )}
                {/* 过渡：羁绊页合并后移入羁绊页 */}
                <Tile
                  side="right"
                  order={orderOf('right', battleVisible ? 1 : 0)}
                  bold={bold}
                  label="占卜"
                  ariaLabel="占卜"
                  icon={<MoonIcon />}
                  onPress={() => setCurrentPage('astrology')}
                />
                <Tile
                  side="right"
                  order={orderOf('right', battleVisible ? 2 : 1)}
                  bold={bold}
                  label="设置"
                  ariaLabel="设置"
                  icon={<GearIcon />}
                  onPress={() => setCurrentPage('settings')}
                />
              </div>

              {/* 双描断层线（§2 规则2 制式：2px 主题色 + 偏移 3px 的 1px 中性回声）。
                  画在瓷砖之上、宫格盒内裁切；纯装饰层不拦截命中。 */}
              <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: fault.length || '100%',
                    transform: 'translate(-50%, -50%) rotate(var(--fault-angle, 0deg))',
                  }}
                >
                  <div className="h-[2px] bg-primary" />
                  <div className="mt-px h-px bg-gray-400/60 dark:bg-gray-500/60" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </PagePlane>
    </motion.div>
  );
};
