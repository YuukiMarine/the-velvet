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
 *
 * 设置拆解 PR 新增：
 *   · 「账号与数据」瓷砖 → 'account' 页（数据管理 + 云同步从 Settings 迁出）；
 *   · 「关于」入口 → 本页内 SheetModal，不跳页（原 Settings「关于」节迁来）。
 *     取舍：原定放右列末尾的小横条，但右列已是 4 块标准砖 vs 左列 hero+1 块
 *     （高度差 ≈140px），再追加横条会把缺口拉到 ≈200px——故改为跨两列的
 *     全宽矮条放宫格底部，且置于 gridRef 之外，断层线 atan2 几何不被拉长。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useAppStore } from '@/store';
import type { ThemeType } from '@/types';
import { PagePlane, PlaneLevel } from '@/components/PagePlane';
import { SheetModal } from '@/components/SheetModal';
import { UserProfileCard } from '@/components/UserProfileCard';
import { TrophyIcon } from '@/components/Navigation';
import { isInShadowTime } from '@/constants';
import { calcCurrentStreak } from '@/utils/streak';
import { triggerNavFeedback } from '@/utils/feedback';
import { useBoldness } from '@/utils/boldness';
import { STAGGER, TAP, springSoft, fadeIn } from '@/utils/motion';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower, P4Sparkle, P4Highlight } from '@/ui/p4Kit';
import { P3R, P3RPage, slantClip } from '@/components/p3r/kit';
import { computeTotalLv } from '@/utils/lvTiers';

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

// 「主题」：调色板（heroicons swatch outline，24px stroke 1.8 制式）
const PaletteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
    <path d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GearIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
    <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// 「记账」：钱包（heroicons wallet outline，24px stroke 1.8 制式）
const WalletIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-6 h-6">
    <path d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// 「关于」横条：信息圈（heroicons information-circle outline）；横条更矮故取 20px
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
    <path d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12v-.008z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
    <path d="M8.25 4.5l7.5 7.5-7.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
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
      <PlaneLevel className={`relative flex flex-col p-4 ${hero ? 'min-h-[202px]' : 'min-h-[100px] justify-between'}`}>
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

// 主题快切色板（与 index.css data-theme 色值一致；custom 显示当前自定义色）
const THEME_SWATCHES: { value: ThemeType; label: string; color?: string }[] = [
  { value: 'blue', label: '蓝', color: '#3B82F6' },
  { value: 'yellow', label: '黄', color: '#F59E0B' },
  { value: 'red', label: '红', color: '#EF4444' },
  { value: 'pink', label: '粉', color: '#EC4899' },
  { value: 'custom', label: '自定义' },
];

export const Menu = () => {
  const { activities, achievements, skills, attributes, settings, user, setTheme, setCurrentPage } = useAppStore();
  const bold = useBoldness();
  const isP4 = useUiChannel() === 'p4';

  // 「关于」Sheet：本页内打开、不跳页；触发器 ref 供 SheetModal 形状记忆生长
  //（面板从横条"长出来"，关闭缩回——UI_DESIGN_BOLD_V2.5.md §4.3）
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);
  // 「主题」Sheet：主题瓷砖点开的色板选择（快切上浮的第二形态：block 入口 + 面板选色）
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const currentThemeLabel = THEME_SWATCHES.find((t) => t.value === user?.theme)?.label ?? '默认';
  // P3R（蓝频道）：p3-menu-reference-v2 阶梯瀑布形态；资料卡收进 Sheet（形按稿走、改名/头像功能不减配）
  const p3 = useUiChannel() === 'p3';
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  // P3R 菜单选项「游戏化选择」：selectedKey 驱动高亮（深蓝从左揭入 + 长度伸缩）；
  // pointerdown 即选中预览、松手延时进入（让滑入动效播完）。默认选中首项「统计」。
  const [selectedKey, setSelectedKey] = useState<string>('statistics');
  const enterTimer = useRef<number | null>(null);
  const press = useRef({ active: false, key: '', moved: false });
  useEffect(() => () => { if (enterTimer.current) window.clearTimeout(enterTimer.current); }, []);

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
  const ledgerVisible = settings.ledgerEnabled !== false; // F5 记账总开关（默认开）
  // 对角级联序：左列第 i 块 = 2i，右列第 i 块 = 2i+1（战场隐藏时右列顺位前移）
  const orderOf = (side: 'left' | 'right', i: number) => (side === 'left' ? i * 2 : i * 2 + 1);

  const streakDigits = String(currentStreak).length;

  // P4 学生证数据：LV = 五维等级和，总点数 = 点数和，入学 = 建号日期
  const totalLevel = attributes.reduce((s, a) => s + a.level, 0);
  const p4TotalPoints = attributes.reduce((s, a) => s + (a.points ?? 0), 0);
  const p4Admission = user?.createdAt
    ? (() => {
        const d = new Date(user.createdAt);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
      })()
    : '—';

  /** P4 黑血块菜单行定义（设计稿自上而下序；battle/ledger 跟随开关） */
  const p4Rows: Array<{
    key: string;
    label: string;
    caption?: string;
    big?: boolean;
    icon?: ReactNode;
    badge?: ReactNode;
    indent: number;
    onPress: () => void;
    triggerRef?: React.RefObject<HTMLButtonElement | null>;
  }> = [
    {
      key: 'statistics', label: '统计', caption: `连续 ${currentStreak} 天`, big: true, indent: 56,
      onPress: () => setCurrentPage('statistics'),
    },
    ...(battleVisible
      ? [{ key: 'battle', label: '逆影战场', indent: 26, icon: <span className="text-[var(--ui-bg)]"><BoltIcon /></span>,
          badge: inShadowTime ? <span aria-hidden className="animate-pulse text-base leading-none text-[var(--p4-orange,#f9a11b)]">✦</span> : undefined,
          onPress: () => setCurrentPage('battle') }]
      : []),
    {
      key: 'theme', label: '主题', caption: `当前 · ${currentThemeLabel}`, indent: 36,
      icon: <span className="text-[var(--ui-bg)]"><PaletteIcon /></span>,
      onPress: () => setThemeSheetOpen(true),
    },
    {
      key: 'achievements', label: '成就 · 技能', indent: 44,
      icon: <span className="text-[var(--ui-bg)]"><TrophyIcon /></span>,
      badge: totalPendingUnlocks > 0
        ? <span className="rounded-full bg-[var(--p4-orange,#f9a11b)] px-2 py-0.5 text-xs font-black text-[#131313]">{totalPendingUnlocks}</span>
        : undefined,
      onPress: () => setCurrentPage('achievements'),
    },
    { key: 'astrology', label: '占卜', indent: 30, icon: <span className="text-[var(--ui-bg)]"><MoonIcon /></span>, onPress: () => setCurrentPage('astrology') },
    ...(ledgerVisible
      ? [{ key: 'ledger', label: '心相记账', indent: 38, icon: <P4Flower size={24} color="var(--p4-green, #55c34f)" />, onPress: () => setCurrentPage('ledger') }]
      : []),
    { key: 'settings', label: '设置', indent: 26, icon: <span className="text-[var(--ui-accent)]"><GearIcon /></span>, onPress: () => setCurrentPage('settings') },
    { key: 'about', label: '关于', indent: 34, icon: <P4Sparkle size={22} color="#ff7a2f" />, onPress: () => setAboutOpen(true), triggerRef: aboutTriggerRef },
  ];

  // ── 「关于」/「主题」Sheet（p3 与默认形态共用）────────────────────────────
  const sheetsJsx = (
    <>
      {/* ── 「关于」Sheet：复刻 Settings 原「关于」节（设置拆解 PR 后此处为唯一入口）。
          文案与外链 URL 逐字保留；仅信息卡底色随 Sheet 面板（dark:bg-gray-900）
          把 dark:bg-gray-700/border-gray-600 调整为 gray-800/gray-700 以维持层级对比。 */}
      <SheetModal
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
        position="bottom"
        title="关于"
        originRef={aboutTriggerRef}
      >
        <div className="space-y-4">
          {/* 居中头部：logo / 应用名 / 副题 / 版本 */}
          <div className="text-center py-2">
            <div className="text-5xl mb-4">🦋</div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-1">靛蓝色房间</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Persona Growth Tracker</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">v{import.meta.env.PACKAGE_VERSION}</p>
          </div>
          {/* 信息行列表：作者 / GitHub / Bilibili */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">作者</span>
              <span className="text-sm font-medium text-gray-800 dark:text-white">IIInk</span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700"></div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">GitHub</span>
              <a
                href="https://github.com/YuukiMarine"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                @YuukiMarine
              </a>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700"></div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Bilibili</span>
              <a
                href="https://space.bilibili.com/15727079"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                @IIInk
              </a>
            </div>
          </div>
          {/* 寄语：逐字保留 */}
          <p className="text-xs text-center text-gray-400 dark:text-gray-500 leading-relaxed">
            100%用爱发电，用得习惯欢迎点个star或者关注b站获取更新动态喵
          </p>
          <p className="text-xs text-center text-gray-400 dark:text-gray-500">
            I am thou, thou art I...
          </p>
        </div>
      </SheetModal>

      {/* ── 「主题」Sheet：色板选择（点击即切）+ 精调入口（自定义色/音效仍在设置）── */}
      <SheetModal
        isOpen={themeSheetOpen}
        onClose={() => setThemeSheetOpen(false)}
        position="bottom"
        title="主题"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">选择你喜欢的主题，整个房间随之换色。</p>
          <div className="grid grid-cols-5 gap-3">
            {THEME_SWATCHES.map((t) => {
              const selected = user?.theme === t.value;
              const swatch =
                t.value === 'custom'
                  ? settings.customThemeColor ||
                    'conic-gradient(#3B82F6, #F59E0B, #EF4444, #EC4899, #3B82F6)'
                  : t.color!;
              return (
                <motion.button
                  key={t.value}
                  type="button"
                  whileTap={TAP}
                  onClick={() => {
                    triggerNavFeedback();
                    void setTheme(t.value);
                  }}
                  aria-label={`切换主题：${t.label}`}
                  aria-pressed={selected}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`relative h-12 w-12 rounded-2xl border-2 transition-shadow ${
                      selected ? 'border-gray-900 shadow-md dark:border-white' : 'border-black/10 dark:border-white/15'
                    }`}
                    style={{ background: swatch }}
                  >
                    {selected && (
                      <span aria-hidden className="absolute inset-0 flex items-center justify-center text-lg font-black text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                        ✓
                      </span>
                    )}
                  </span>
                  <span className={`text-[11px] font-semibold ${selected ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}`}>{t.label}</span>
                </motion.button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              setThemeSheetOpen(false);
              setCurrentPage('settings');
            }}
            className="w-full rounded-xl bg-gray-100 dark:bg-gray-800 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300"
          >
            更多主题设置（自定义色 / 音效）→
          </button>
        </div>
      </SheetModal>
    </>
  );

  // ── P3R（蓝频道）形态：p3-menu-reference-v2 1:1 ── 蓝斜块大标 → 用户区 →
  //    阶梯瀑布入口列（首项蓝实心+洋红角，逐项右缩进）；SYSTEM 竖排巨幽灵字
  if (p3) {
    const totalLv = computeTotalLv(attributes);
    const totalPoints = attributes.reduce((s, a) => s + (a.points ?? 0), 0);
    const menuItems: {
      key: string; label: string; icon: ReactNode; onPress: () => void;
      extra?: (sel: boolean) => ReactNode; aria: string;
    }[] = [
      {
        key: 'statistics', label: '统计', icon: <ChartIcon />, onPress: () => setCurrentPage('statistics'),
        extra: (sel) => <span className="shrink-0 text-[11px] font-bold" style={{ color: sel ? 'rgba(255,255,255,0.85)' : P3R.grey }}>连续 {currentStreak} 天</span>,
        aria: `统计：当前连续 ${currentStreak} 天`,
      },
      ...(battleVisible ? [{
        key: 'battle', label: '逆影战场', icon: <BoltIcon />, onPress: () => setCurrentPage('battle'),
        extra: (sel: boolean) => inShadowTime ? (
          <motion.span animate={{ opacity: [1, 0.55, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="shrink-0 px-2 py-0.5 text-[11px] font-black" style={{ clipPath: slantClip(5), background: sel ? '#fff' : P3R.blue, color: sel ? P3R.blue : '#fff' }}>
            影时间
          </motion.span>
        ) : undefined,
        aria: inShadowTime ? '逆影战场：影时间进行中' : '逆影战场',
      }] : []),
      {
        key: 'theme', label: '主题', icon: <PaletteIcon />, onPress: () => setThemeSheetOpen(true),
        extra: (sel) => <span className="shrink-0 text-[11px] font-bold" style={{ color: sel ? 'rgba(255,255,255,0.85)' : P3R.grey }}>当前 {currentThemeLabel}</span>,
        aria: `主题：当前 ${currentThemeLabel}`,
      },
      {
        key: 'achievements', label: '成就·技能', icon: <TrophyIcon />, onPress: () => setCurrentPage('achievements'),
        extra: (sel) => totalPendingUnlocks > 0 ? (
          <span className="shrink-0 px-2 py-0.5 text-[11px] font-black" style={{ clipPath: slantClip(5), background: sel ? '#fff' : P3R.magenta, color: sel ? P3R.magenta : '#fff' }}>{totalPendingUnlocks} 待解锁</span>
        ) : undefined,
        aria: totalPendingUnlocks > 0 ? `成就·技能：${totalPendingUnlocks} 项待解锁` : '成就·技能',
      },
      { key: 'astrology', label: '占卜', icon: <MoonIcon />, onPress: () => setCurrentPage('astrology'), aria: '占卜' },
      ...(ledgerVisible ? [{ key: 'ledger', label: '记账', icon: <WalletIcon />, onPress: () => setCurrentPage('ledger'), aria: '记账' }] : []),
      { key: 'settings', label: '设置', icon: <GearIcon />, onPress: () => setCurrentPage('settings'), aria: '设置' },
      { key: 'about', label: '关于', icon: <InfoIcon />, onPress: () => setAboutOpen(true), aria: '关于' },
    ];
    return (
      <P3RPage className="overflow-hidden">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="relative mx-auto max-w-2xl pb-8">
          {/* SYSTEM 巨幽灵字（p3-menu 设计稿：整行横排词整体顺时针旋转 90°，沿左缘纵向纵贯中下部——竖屏侧边字样） */}
          {/* 容器宽必须 ≥ 旋转后字样占的横向尺寸（= 行高 ≈ 9.5rem），否则 overflow-hidden
              会把字母左右两边齐齐削掉（用户上报"SYSTEM 被错误截断"）。这里放到 168px
              并撤掉裁切，横向出血交给 P3RPage 自己的 overflow-hidden 兜。 */}
          <div aria-hidden className="pointer-events-none absolute left-0 top-[300px] flex h-[760px] w-[168px] select-none items-center justify-center">
            <span
              className="whitespace-nowrap font-black italic leading-none"
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '9.5rem', color: 'rgba(53,209,232,0.20)', transform: 'rotate(90deg)' }}
            >
              SYSTEM
            </span>
          </div>

          {/* 蓝斜块大标题 + 洋红角 */}
          <div className="relative inline-block pt-2">
            <h1 className="relative px-9 py-2.5 text-[32px] font-black italic leading-none text-white" style={{ clipPath: slantClip(16), background: P3R.blue }}>
              菜单
            </h1>
            <span aria-hidden className="absolute bottom-0 right-2 h-[10px] w-[24px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          </div>

          {/* 用户区（设计稿排版；点击开资料 Sheet——改名/头像功能都在里面） */}
          <button
            type="button"
            onClick={() => setProfileSheetOpen(true)}
            aria-label="用户资料"
            className="relative mt-6 block pl-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden className="h-[20px] w-[13px]" style={{ background: P3R.blue, clipPath: 'polygon(32% 0, 100% 0, 68% 100%, 0 100%)' }} />
              <span className="text-[22px] font-black leading-none" style={{ color: P3R.ink }}>{user?.name ?? '旅行者'}</span>
            </span>
            <span className="mt-2 inline-flex items-baseline gap-1.5 px-5 py-1.5" style={{ clipPath: slantClip(9), background: 'rgba(207,234,246,0.85)' }}>
              <span className="text-[13px] font-black tracking-wider" style={{ color: P3R.inkSoft }}>LV</span>
              <span className="text-[18px] font-black italic leading-none tabular-nums" style={{ color: P3R.blue }}>{totalLv}</span>
            </span>
            <span className="mt-2 block text-[14px] font-black" style={{ color: P3R.ink }}>
              总点数 <span className="italic tabular-nums" style={{ color: P3R.blue }}>{totalPoints}</span>
            </span>
          </button>

          {/* 游戏化入口列：selectedKey 高亮（深蓝从左揭入 + 长度伸缩）；按下预览、上下拖拽切换、松手进入 */}
          <nav
            className="relative mt-7 space-y-2.5"
            aria-label="功能入口"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              const el = (e.target as HTMLElement).closest('[data-menu-key]');
              if (!el) return;
              const key = el.getAttribute('data-menu-key') || '';
              press.current = { active: true, key, moved: false };
              setSelectedKey(key);
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
            }}
            onPointerMove={(e) => {
              if (!press.current.active) return;
              const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-menu-key]');
              const key = el?.getAttribute('data-menu-key');
              if (key && key !== press.current.key) {
                press.current.key = key;
                press.current.moved = true;
                triggerNavFeedback();
                setSelectedKey(key);
              }
            }}
            onPointerUp={() => {
              if (!press.current.active) return;
              const key = press.current.key;
              press.current.active = false;
              triggerNavFeedback();
              if (enterTimer.current) window.clearTimeout(enterTimer.current);
              enterTimer.current = window.setTimeout(() => { menuItems.find((m) => m.key === key)?.onPress(); }, 200);
            }}
            onPointerCancel={() => { press.current.active = false; }}
          >
            {menuItems.map((m, i) => {
              const selected = m.key === selectedKey;
              const indent = i * 5;                                     // 基础阶梯缩进（%）
              const ml = selected ? 0 : indent;                         // 选中左伸到 0 → 变长
              const w = selected ? 100 : Math.max(46, 100 - indent - 6); // 未选中右侧再缩 → 变短
              const content = (white: boolean) => (
                <>
                  <span aria-hidden style={{ color: white ? '#fff' : P3R.blue }}>{m.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-[17px] font-black" style={{ color: white ? '#fff' : P3R.ink }}>{m.label}</span>
                  {m.extra?.(white)}
                </>
              );
              return (
                <motion.div
                  key={m.key}
                  initial={bold ? { opacity: 0, x: 24 } : { opacity: 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...springSoft, delay: i * 0.045 }}
                >
                  <motion.button
                    type="button"
                    data-menu-key={m.key}
                    whileTap={TAP}
                    onClick={(e) => { if (e.detail === 0) { setSelectedKey(m.key); m.onPress(); } }}
                    aria-label={m.aria}
                    aria-current={selected ? 'true' : undefined}
                    className="relative block overflow-hidden py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                    style={{
                      clipPath: slantClip(16),
                      background: i % 2 ? 'rgba(232,245,251,0.95)' : 'rgba(255,255,255,0.92)',
                      boxShadow: selected ? '0 12px 28px rgba(27,87,255,0.28)' : '0 8px 18px rgba(38,96,140,0.06)',
                      marginLeft: `${ml}%`,
                      width: `${w}%`,
                      transition: 'margin-left 0.36s cubic-bezier(0.16,1,0.3,1), width 0.36s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease',
                    }}
                  >
                    {/* 底层常态（浅底墨字） */}
                    <span className="flex items-center gap-3.5 pl-7 pr-5">{content(false)}</span>
                    {/* 高亮层：深蓝从左揭入（CSS animation，稳过 rAF 节流）、离开淡出 */}
                    <AnimatePresence>
                      {selected && (
                        <motion.span
                          key="hl"
                          className="absolute inset-0 flex items-center gap-3.5 pl-7 pr-5"
                          style={{ background: P3R.blue, animation: 'p3MenuReveal 0.34s cubic-bezier(0.16,1,0.3,1)' }}
                          exit={{ opacity: 0, transition: { duration: 0.2 } }}
                        >
                          {content(true)}
                          <span aria-hidden className="absolute bottom-0 right-3 h-[9px] w-[22px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </motion.div>
              );
            })}
          </nav>

          {sheetsJsx}

          {/* 资料 Sheet（UserProfileCard 全功能收纳） */}
          <SheetModal isOpen={profileSheetOpen} onClose={() => setProfileSheetOpen(false)} position="bottom" title="用户资料">
            <UserProfileCard />
          </SheetModal>
        </motion.div>
      </P3RPage>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-2xl mx-auto"
    >
      {isP4 ? (
        /* ── P4 舞台（三轮改版，p4-menu-reference-v2 靠拢）──
           页头一行两栏：左=衬线巨标题 + CHANNEL DIRECTORY，右=学生证吊牌（原整幅
           学生证压缩成微旋小卡，让出纵向空间给菜单本体）；
           下半是真正的有机黑色块——右缘用 SVG 拉伸路径画成起伏波，菜单行沿波起落缩进；
           实景天空块垫在黑块右侧，被波缘咬出交错。 */
        <div className="relative" style={{ isolation: 'isolate' }}>
          {/* 蓝天大楔（用户红线口径 / P4G 原作构图）：覆盖右上大半，尖端斜插到左缘约
              四成高处，左下与下方留黄——不是贴右缘的一小片。挂在页根而不是内容舞台里，
              才能一路顶到屏幕上缘（main 有 px-4/pt，用负向 inset 抵消）。
              z-index -1 + 父层 isolation:isolate：压在标题/学生证/笔记本之下、
              又不会掉到 App 根的黄底后面。 */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[-1rem] right-[-4rem] md:left-[-2rem] md:right-[-5rem]"
            style={{
              // 上/右多留一截：楔顺时针转 15° 后右上会甩空，靠外扩兜住不露黄角
              top: 'calc(-1rem - env(safe-area-inset-top, 0px) - 80px)',
              height: '54vh',
              zIndex: -1,
              clipPath: 'polygon(56% 0, 100% 0, 100% 39%, 0 100%)',
              transform: 'translateY(56px) rotate(15deg)',
            }}
          >
            <img
              src="/assets/terminal/p4-cloud-sky.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              // objectPosition 的 Y 越大越取素材下半部——原来 42% 只截到纯蓝天，看不见云
              style={{ objectPosition: '52% 74%', filter: 'saturate(1.15) contrast(1.06)' }}
            />
            <div className="absolute inset-0 bg-[#00a6ff]/10 mix-blend-screen" />
          </div>

          {/* 页头 */}
          <div className="relative flex items-start justify-between gap-2 px-1 pt-1">
            <P4Sparkle size={18} color="#ffffff" className="absolute left-[44%] top-1" />
            <div className="min-w-0">
              <h1
                className="text-[56px] font-black leading-[1.02] tracking-tight text-[#131313]"
                style={{ fontFamily: 'var(--p4-display-font, serif)' }}
              >
                菜单
              </h1>
              {/* 学生证放大 30% 后左栏变窄，字距/字号同步收一档才不折行 */}
              <div className="mt-1 whitespace-nowrap text-[10px] font-black tracking-[0.14em] text-[#131313]">
                CHANNEL DIRECTORY <span className="text-[var(--p4-orange,#f9a11b)]">04</span>
              </div>
            </div>

            {/* 学生证吊牌：黑校条 + 小照片 + 名/LV/点数/连续，微旋压在标题右侧 */}
            <motion.button
              type="button"
              onClick={() => { triggerNavFeedback(); setProfileSheetOpen(true); }}
              aria-label={`用户资料：${user?.name || '客人'}，等级 ${totalLevel}`}
              initial={{ opacity: 0, y: -8, rotate: 3 }}
              animate={{ opacity: 1, y: 0, rotate: 3 }}
              whileTap={TAP}
              className="relative mt-1 w-[247px] shrink-0 overflow-hidden rounded-[18px] bg-[#fff6d0] text-left"
              style={{ boxShadow: '0 4px 0 rgba(19,19,19,0.2)' }}
            >
              <div className="flex items-center justify-between bg-[#131313] px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[12px] font-black tracking-[0.14em] text-[var(--ui-bg)]">
                  <P4Flower size={12} color="var(--ui-bg)" />
                  STUDENT PASS
                </span>
                <span className="text-[12px] font-black tracking-[0.12em] text-white/80">CH 04</span>
              </div>
              <div className="flex gap-2.5 px-3 py-2.5">
                <div
                  className="relative h-[60px] w-[50px] shrink-0 overflow-hidden rounded-lg bg-[var(--ui-accent)]"
                  style={{ boxShadow: '0 0 0 3px #131313' }}
                >
                  {user?.avatarDataUrl ? (
                    <img src={user.avatarDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <P4Flower size={31} color="#fff6d0" className="absolute left-1/2 top-1/2 -ml-4 -mt-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1">
                    <span
                      className="min-w-0 flex-1 truncate text-[19px] font-black leading-tight text-[#131313]"
                      style={{ fontFamily: 'var(--p4-display-font, serif)' }}
                    >
                      {user?.name || '客人'}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#131313] px-2 py-[4px] text-[12px] font-black leading-none text-white">
                      LV <span className="tabular-nums">{totalLevel}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2 text-[13px] font-black text-[#131313]">
                    <span>总点数</span>
                    <span aria-hidden className="flex-1 border-b-2 border-dotted border-[#131313]/30" />
                    <span className="tabular-nums text-[var(--p4-orange,#f9a11b)]">{p4TotalPoints}</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2 text-[13px] font-black text-[#131313]">
                    <span>入学</span>
                    <span aria-hidden className="flex-1 border-b-2 border-dotted border-[#131313]/30" />
                    <span className="tabular-nums">{p4Admission}</span>
                  </div>
                </div>
              </div>
              <div aria-hidden className="flex h-4 items-stretch gap-[3px] px-3 pb-2.5 opacity-75">
                {[3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3].map((w, bi) => (
                  <span key={bi} className="bg-[#131313]" style={{ width: w }} />
                ))}
              </div>
            </motion.button>
          </div>

          {/* 舞台：右上角天空锥垫底 → 斜置笔记本压上 → 花/星缀饰 */}
          <div className="relative -mx-4 mt-7 pb-2" style={{ clipPath: 'inset(-40px 0 -60px 0)' }}>
            <P4Flower size={96} color="var(--p4-orange, #f9a11b)" className="pointer-events-none absolute right-3 top-6" />
            <P4Flower size={82} color="rgba(255,246,208,0.7)" className="pointer-events-none absolute bottom-16 right-4" />
            <P4Sparkle size={22} color="var(--ui-accent)" className="pointer-events-none absolute bottom-8 right-20" />
            <P4Sparkle size={16} color="#ffffff" className="pointer-events-none absolute bottom-44 right-2" />

            {/* 笔记本（拟物）：斜置的活页纸 —— 左缘装订条 + 打孔 + 橙色页边线 +
                纸张厚度（两层错位垫底）。整本一起斜，行不再各自 rotate，
                行间黄虚线就是横格线。替代原先那块"黑色波浪"（用户口径）。 */}
            <div
              className="relative ml-[-14px] w-[81%] max-w-[500px]"
              style={{ transform: 'rotate(-3.2deg)', transformOrigin: 'left top' }}
            >
              <div aria-hidden className="absolute inset-0 translate-x-[7px] translate-y-[9px] rounded-r-[22px] bg-[#131313]/35" />
              <div aria-hidden className="absolute inset-0 translate-x-[3px] translate-y-[4px] rounded-r-[22px] bg-[#efe0ac]" />
              {/* 内页改米黄（用户口径）：字仍是黄的，靠墨色硬阴影压出来；选中翻黑 */}
              <nav
                aria-label="功能入口"
                className="relative overflow-hidden rounded-r-[22px] bg-[var(--ui-paper)] pb-7 pl-[74px] pr-5 pt-6"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                  const el = (e.target as HTMLElement).closest('[data-menu-key]');
                  if (!el) return;
                  const key = el.getAttribute('data-menu-key') || '';
                  press.current = { active: true, key, moved: false };
                  setSelectedKey(key);
                  triggerNavFeedback();
                  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
                }}
                onPointerMove={(e) => {
                  if (!press.current.active) return;
                  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-menu-key]');
                  const key = el?.getAttribute('data-menu-key');
                  if (key && key !== press.current.key) {
                    press.current.key = key;
                    press.current.moved = true;
                    triggerNavFeedback();
                    setSelectedKey(key);
                  }
                }}
                onPointerUp={() => {
                  if (!press.current.active) return;
                  const key = press.current.key;
                  press.current.active = false;
                  triggerNavFeedback();
                  if (enterTimer.current) window.clearTimeout(enterTimer.current);
                  // 留 200ms 让高亮演出走完再跳（与 p3 同口径：按下预览、拖拽换行、松手进入）
                  enterTimer.current = window.setTimeout(() => { p4Rows.find((r) => r.key === key)?.onPress(); }, 200);
                }}
                onPointerCancel={() => { press.current.active = false; }}
              >
                {/* 装订条 + 打孔（孔洞透出黄舞台色） */}
                <div aria-hidden className="absolute inset-y-0 left-0 w-[52px] bg-[#0a0a0a]">
                  <span
                    className="absolute inset-0"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 26px 23px, var(--ui-bg) 0 6.5px, transparent 7px)',
                      backgroundSize: '52px 46px',
                    }}
                  />
                </div>
                {/* 橙色页边线 */}
                <div aria-hidden className="absolute inset-y-0 left-[62px] w-[2px] bg-[var(--p4-orange,#f9a11b)]/65" />
                {p4Rows.map((row, i) => {
                  const selected = row.key === selectedKey;
                  return (
                  <motion.button
                    key={row.key}
                    ref={row.triggerRef as React.Ref<HTMLButtonElement> | undefined}
                    type="button"
                    data-menu-key={row.key}
                    custom={i}
                    variants={bold ? tileIn : fadeIn}
                    initial="hidden"
                    animate="show"
                    whileTap={TAP}
                    aria-current={selected ? 'true' : undefined}
                    // 指针路径已由 nav 统管；这里只接键盘激活（e.detail === 0）
                    onClick={(e) => { if (e.detail === 0) { setSelectedKey(row.key); row.onPress(); } }}
                    className="relative block w-full py-1 pl-1 text-left"
                  >
                    <div className={`relative flex items-center gap-3 pr-6 ${row.big ? 'pb-1 pt-1' : 'py-1'}`}>
                      {/* 高亮层：选中时从左「变长」铺出（p3 同款伸缩），里面是运动三角形活高亮 */}
                      <AnimatePresence>
                        {selected && (
                          <motion.span
                            key="hl"
                            aria-hidden
                            // 长边再 -30%、整体再 -20%；overflow 放开，避免把抖动中的顶点切平
                            className="absolute -inset-y-0.5 -left-3 w-[40%]"
                            style={{ transformOrigin: 'left center' }}
                            initial={{ scaleX: 0, opacity: 0 }}
                            animate={{ scaleX: 1, opacity: 0.5 }}
                            exit={{ scaleX: 0, opacity: 0, transition: { duration: 0.18 } }}
                            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <P4Highlight className="block h-full w-full" />
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {/* 统计行的蓝色泼溅 */}
                      {row.big && (
                        <P4Sparkle size={44} color="var(--ui-accent)" className="absolute -left-8 top-1" style={{ transform: 'rotate(-12deg)' }} />
                      )}
                      {row.icon && (
                        // 常态 brightness(0) 把各色图标一律压成墨色与黑字统一；选中放回本色
                        <span
                          className="relative shrink-0"
                          style={{ filter: selected ? undefined : 'brightness(0)' }}
                        >
                          {row.icon}
                        </span>
                      )}
                      {/* 配色（用户定稿）：未高亮黑字、高亮黄字，都不带阴影 */}
                      <span
                        className={`relative font-black leading-none ${row.big ? 'text-[44px]' : 'text-[32px]'}`}
                        style={{
                          fontFamily: 'var(--p4-display-font, serif)',
                          color: selected ? 'var(--ui-bg)' : '#131313',
                        }}
                      >
                        {row.label}
                      </span>
                      {row.badge && <span className="relative shrink-0">{row.badge}</span>}
                    </div>
                    {row.caption && (
                      <div
                        className="mt-0.5 pl-9 text-[13px] font-black leading-none"
                        // 副行恒橙：它落在高亮三角之外的米黄纸上，跟着翻黄就看不清了
                        style={{ color: 'var(--p4-orange, #f9a11b)' }}
                      >
                        {row.caption}
                      </div>
                    )}
                    {/* 横格线（笔记本页的行线；末行不画） */}
                    {i < p4Rows.length - 1 && (
                      <div aria-hidden className="mt-2.5 w-full border-b border-dashed border-[rgba(19,19,19,0.2)]" />
                    )}
                  </motion.button>
                  );
                })}
              </nav>{/* /笔记本内页 */}
            </div>{/* /笔记本（斜置层） */}
          </div>{/* /舞台 */}
        </div>
      ) : (
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

          {/* ── 用户资料卡（P9-菜单批：从设置页第一屏上浮到菜单一级）──
              整体包 PlaneLevel 回正：卡与字都不随世界斜（玻璃卡的柔和气质不吃斜界） */}
          <PlaneLevel>
            <UserProfileCard />
          </PlaneLevel>

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
                {ledgerVisible && (
                  <Tile
                    side="left"
                    order={orderOf('left', 2)}
                    bold={bold}
                    label="记账"
                    ariaLabel="记账"
                    icon={<WalletIcon />}
                    onPress={() => setCurrentPage('ledger')}
                  />
                )}
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
                {/* 主题：从设置上浮的入口 block（放逆影战场下方），点开主题色板 Sheet */}
                <Tile
                  side="right"
                  order={orderOf('right', battleVisible ? 1 : 0)}
                  bold={bold}
                  label="主题"
                  ariaLabel={`主题：当前 ${currentThemeLabel}`}
                  icon={<PaletteIcon />}
                  sub={
                    <div className="mt-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      当前 · {currentThemeLabel}
                    </div>
                  }
                  onPress={() => setThemeSheetOpen(true)}
                />
                {/* 过渡：羁绊页合并后移入羁绊页 */}
                <Tile
                  side="right"
                  order={orderOf('right', battleVisible ? 2 : 1)}
                  bold={bold}
                  label="占卜"
                  ariaLabel="占卜"
                  icon={<MoonIcon />}
                  onPress={() => setCurrentPage('astrology')}
                />
                <Tile
                  side="right"
                  order={orderOf('right', battleVisible ? 3 : 2)}
                  bold={bold}
                  label="设置"
                  ariaLabel="设置"
                  icon={<GearIcon />}
                  onPress={() => setCurrentPage('settings')}
                />
                {/* P9-菜单批：「账号与数据」瓷砖下沉进设置页（与主题快切上浮对调） */}
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

            {/* ── 「关于」全宽矮条（取舍见文件头注释）──
                · 置于 gridRef 之外：断层线 atan2 只量瓷砖宫格本体，不被横条拉长；
                · mt-10 = 右列 translate-y-7 的 28px 视觉下探 + 12px 网格间距节奏；
                · 点击不跳页，打开本页内关于 Sheet；横条位于断层下方（低频区），
                  沿用右列制式的左下切角，装饰盒被裁、命中区完整（护栏 §7.2）。 */}
            <motion.button
              ref={aboutTriggerRef}
              type="button"
              custom={orderOf('right', battleVisible ? 4 : 3) + 1}
              variants={bold ? tileIn : fadeIn}
              initial="hidden"
              animate="show"
              whileTap={TAP}
              onClick={() => {
                triggerNavFeedback();
                setAboutOpen(true);
              }}
              aria-label="关于"
              aria-haspopup="dialog"
              className="relative mt-10 w-full rounded-2xl text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <div
                aria-hidden
                className="absolute inset-0 overflow-hidden rounded-2xl border bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800"
                style={{
                  clipPath:
                    'polygon(0 0, 100% 0, 100% 100%, calc(var(--ui-cut) * 1.6) 100%, 0 calc(100% - calc(var(--ui-cut) * 1.6)))',
                }}
              />
              {/* 内容反制回正：盒斜、字平（与 Tile 同一护栏） */}
              <PlaneLevel className="relative flex items-center gap-3 px-4 py-3">
                <span className="text-gray-500 dark:text-gray-400"><InfoIcon /></span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">关于</span>
                <span aria-hidden className="ml-auto text-gray-400 dark:text-gray-500"><ChevronRightIcon /></span>
              </PlaneLevel>
            </motion.button>
          </section>
        </div>
      </PagePlane>
      )}

      {sheetsJsx}

      {/* 资料 Sheet：P4 的学生证吊牌点开走这里（默认形态页内已有 UserProfileCard，不会触发） */}
      <SheetModal isOpen={profileSheetOpen} onClose={() => setProfileSheetOpen(false)} position="bottom" title="用户资料">
        <UserProfileCard />
      </SheetModal>
    </motion.div>
  );
};
