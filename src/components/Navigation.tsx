import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppStore } from '@/store';
import { useNavigatorStore } from '@/store/navigator';
import { triggerLightHaptic, triggerNavFeedback } from '@/utils/feedback';
import { springSnappy } from '@/utils/motion';
import { zClass } from '@/utils/zIndex';
import { RadialQuickNav } from '@/components/RadialQuickNav';
import { playHeavyTransition } from '@/ui/transitionDirector';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Sparkle } from '@/ui/p4Kit';
import { P3R, slantClip, TitlePeriod } from '@/components/p3r/kit';
import { P5R, roughQuad, starPts } from '@/components/p5r/kit';

// P5 侧栏选中角标的五角星点集（模块级算一次）
const starPtsSidebar = starPts(50, 50, 48);

// ── SVG 图标组件（24px viewBox / stroke 1.8 / filled 双态制式）──────────────

const HomeIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={filled ? 0 : 1.8} stroke="currentColor" className="w-6 h-6">
    {filled ? (
      <>
        <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" fill="currentColor" />
        <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625A1.875 1.875 0 013.75 19.875v-6.198a.75.75 0 01.091-.086L12 5.432z" fill="currentColor" />
      </>
    ) : (
      <path d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

// 「行动」：闪电——任务与记录合并后的统一隐喻（行动即放电）
const BoltIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={filled ? 0 : 1.8} stroke="currentColor" className="w-6 h-6">
    {filled ? (
      <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" fill="currentColor" clipRule="evenodd" />
    ) : (
      <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

// 「菜单」：2×2 圆角方块宫格——对应菜单页的非均匀宫格
const MenuGridIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={filled ? 0 : 1.8} stroke="currentColor" className="w-6 h-6">
    {filled ? (
      <path fillRule="evenodd" d="M3 6a3 3 0 013-3h2.25a3 3 0 013 3v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm9.75 0a3 3 0 013-3H18a3 3 0 013 3v2.25a3 3 0 01-3 3h-2.25a3 3 0 01-3-3V6zM3 15.75a3 3 0 013-3h2.25a3 3 0 013 3V18a3 3 0 01-3 3H6a3 3 0 01-3-3v-2.25zm9.75 0a3 3 0 013-3H18a3 3 0 013 3V18a3 3 0 01-3 3h-2.25a3 3 0 01-3-3v-2.25z" fill="currentColor" clipRule="evenodd" />
    ) : (
      <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

const TrophyIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={filled ? 0 : 1.8} stroke="currentColor" className="w-6 h-6">
    {filled ? (
      <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 00-.584.859 6.753 6.753 0 006.138 5.6 6.73 6.73 0 002.743 1.346A6.707 6.707 0 019.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 00-2.25 2.25c0 .414.336.75.75.75h15a.75.75 0 00.75-.75 2.25 2.25 0 00-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 01-1.112-3.173 6.73 6.73 0 002.743-1.347 6.753 6.753 0 006.139-5.6.75.75 0 00-.585-.858 47.077 47.077 0 00-3.07-.543V2.62a.75.75 0 00-.658-.744 49.798 49.798 0 00-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 00-.657.744zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 013.16 5.337a45.6 45.6 0 012.006-.343v.256zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 01-2.863 3.207 6.72 6.72 0 00.857-3.294z" fill="currentColor" clipRule="evenodd" />
    ) : (
      <path d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

const ConfidantIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={filled ? 0 : 1.8} stroke="currentColor" className="w-6 h-6">
    {filled ? (
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.003-.003.001a.752.752 0 01-.704 0l-.003-.001z"
        fill="currentColor"
      />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    )}
  </svg>
);

// 黑猫剪影：猫头轮廓 + 双耳的最小表达（实心 currentColor，颜色交给使用处）。
// 路径手工绘制：双耳直线锚定头顶，头部用单段椭圆弧合拢——顶点少，缩放到任意尺寸都干净。
const CatSilhouetteIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M6.6 2.3 L10 5.55 Q12 5.1 14 5.55 L17.4 2.3 L18.33 7.3 A8 8.5 0 1 1 5.67 7.3 Z" />
  </svg>
);

// 四格常规导航（B+C 混合 IA 定稿）：首页 / 行动 / 羁绊 / 菜单，中央第 3 槽固定为黑猫 ◈（非路由）。
// settings 已撤出导航（经「菜单」宫格到达）；任务+记录已合并为「行动」页。
const navItems = [
  { id: 'dashboard', label: '首页', Icon: HomeIcon },
  { id: 'actions', label: '行动', Icon: BoltIcon },
  { id: 'cooperation', label: '羁绊', Icon: ConfidantIcon },
  { id: 'menu', label: '菜单', Icon: MenuGridIcon },
];

type NavItem = (typeof navItems)[number];

/** 行动 tab 的激活判定要兼容旧路由 id（散落的 setCurrentPage('todos'/'activities') 调用点） */
const isNavActive = (itemId: string, currentPage: string): boolean =>
  currentPage === itemId ||
  (itemId === 'actions' && (currentPage === 'todos' || currentPage === 'activities'));

// 导出供 Settings 页面复用图标（成就入口行）
export { TrophyIcon };

export const Sidebar = () => {
  const { currentPage, setCurrentPage, actionsSubTab, setActionsSubTab } = useAppStore();
  // F6：黑猫对话窗（NavigatorWindow 挂在 App 顶层，这里只负责打开）
  const openNavigator = useNavigatorStore((s) => s.open);
  // P3R：蓝主题侧栏换形（水面底 + 蓝斜块选中 + 洋红角），其余主题不受影响
  const p3 = useUiChannel() === 'p3';
  // P5R：红主题侧栏换形（纯黑底 + 猩红斜块选中 + 纸色字）
  const p5 = useUiChannel() === 'p5';

  const renderItem = (item: NavItem) => {
    const active = isNavActive(item.id, currentPage);
    return (
      <motion.button
        key={item.id}
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          triggerNavFeedback();
          // 已在「行动」再点：记录 ⇄ 任务 互切（与底导同口径）
          if (active && item.id === 'actions') {
            setActionsSubTab(actionsSubTab === 'activities' ? 'todos' : 'activities');
            return;
          }
          setCurrentPage(item.id);
        }}
        className={p3
          ? `relative w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-150 cursor-pointer text-sm font-black ${
              active ? 'text-white' : 'hover:bg-[#e2f2fa]'
            }`
          : p5
            ? `relative w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-150 cursor-pointer text-sm font-black ${
                active ? 'text-white' : 'text-[#d9d3c7] hover:bg-[#1f1e1c]'
              }`
          : `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer ${
              active
                ? 'bg-primary/10 dark:bg-primary/15 text-primary'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
        style={p3
          ? (active ? { clipPath: slantClip(10), background: P3R.blue } : { clipPath: slantClip(10), color: P3R.inkSoft })
          : p5
            ? (active ? { clipPath: roughQuad(310 + item.id.charCodeAt(0), 5), background: P5R.red } : { clipPath: roughQuad(310 + item.id.charCodeAt(0), 5) })
            : undefined}
      >
        <item.Icon filled={active} />
        <span className={p3 || p5 ? 'text-sm' : `text-sm font-medium ${active ? 'font-semibold' : ''}`}>{item.label}</span>
        {p3 ? (
          active && <span aria-hidden className="absolute bottom-0 right-4 h-[6px] w-[15px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
        ) : p5 ? (
          active && <span aria-hidden className="absolute bottom-1 right-4"><svg viewBox="0 0 100 100" width={12} height={12}><polygon points={starPtsSidebar} fill="#fff" /></svg></span>
        ) : (
          active && (
            <motion.div
              layoutId="sidebar-active"
              className="ml-auto w-1 h-5 bg-primary rounded-full"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )
        )}
      </motion.button>
    );
  };

  return (
    <motion.aside
      initial={{ x: -280 }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      // zClass.nav：p3 页面壳带 fixed 全屏水面底（绘制序在侧栏后），无 z 的侧栏会被整条盖住（横屏上报根因）
      className={`hidden md:flex md:flex-col md:w-60 h-screen fixed left-0 top-0 ${zClass.nav} ${
        p3 || p5 ? '' : 'bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 shadow-sm'
      }`}
      style={p3
        ? { background: 'linear-gradient(175deg, #f8fcff 0%, #eaf5fb 60%, #dfeff8 100%)', borderRight: '1px solid rgba(53,209,232,0.4)', boxShadow: '0 0 24px rgba(38,96,140,0.08)' }
        : p5
          ? { background: '#050505', borderRight: '2px solid rgba(240,233,223,0.35)' }
          : undefined}
    >
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 overflow-hidden flex-shrink-0 ${p3 ? '' : 'rounded-xl'}`} style={p3 ? { clipPath: slantClip(5) } : undefined}>
            <img src="/icon.png" alt="靛蓝色房间" className="w-full h-full object-cover" />
          </div>
          <div>
            {p3 ? (
              <h1 className="inline-flex items-end text-[17px] font-black italic leading-none tracking-tight" style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}>
                靛蓝色房间
                <TitlePeriod className="mb-0 ml-1 scale-[0.6]" style={{ transformOrigin: 'left bottom' }} />
              </h1>
            ) : p5 ? (
              <h1 className="text-[16px] font-black leading-none" style={{ color: P5R.paper }}>靛蓝色房间</h1>
            ) : (
              <h1 className="text-base font-bold text-gray-900 dark:text-white leading-none">靛蓝色房间</h1>
            )}
            <p className={p3 || p5 ? 'mt-0.5 text-[10px] font-black tracking-[0.14em]' : 'text-[11px] text-gray-400 dark:text-gray-500 mt-0.5'} style={p3 ? { color: P3R.blue } : p5 ? { color: P5R.red } : undefined}>THE VELVET</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 space-y-0.5">
        {navItems.slice(0, 2).map(renderItem)}

        {/* 黑猫项：非页面路由，无激活态——打开 NavigatorWindow，与 BottomNav 中央 ◈ 同一去处。
            小号菱形 = rotate-45 圆角方块内嵌 -rotate-45 猫剪影（字恒水平原则同样适用于图标内容） */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            triggerNavFeedback();
            openNavigator();
          }}
          className={p3
            ? 'w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-150 cursor-pointer text-sm font-black hover:bg-[#e2f2fa]'
            : p5
              ? 'w-full flex items-center gap-3 px-4 py-2.5 transition-all duration-150 cursor-pointer text-sm font-black text-[#d9d3c7] hover:bg-[#1f1e1c]'
              : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'}
          style={p3 ? { clipPath: slantClip(10), color: P3R.inkSoft } : p5 ? { clipPath: roughQuad(333, 5) } : undefined}
        >
          <span className="w-6 h-6 flex items-center justify-center flex-none" aria-hidden="true">
            {p3 ? (
              <span className="flex h-[20px] w-[20px] items-center justify-center" style={{ background: P3R.cyan, clipPath: slantClip(4) }}>
                <CatSilhouetteIcon className="h-3.5 w-3.5 text-[#0a1230]" />
              </span>
            ) : p5 ? (
              <span className="flex h-[20px] w-[20px] items-center justify-center" style={{ background: '#050505', border: '1.5px solid rgba(240,233,223,0.7)' }}>
                <CatSilhouetteIcon className="h-3.5 w-3.5 text-[#c00008]" />
              </span>
            ) : (
              <span className="w-[18px] h-[18px] rotate-45 rounded-[5px] bg-primary shadow-sm shadow-primary/40 flex items-center justify-center">
                <CatSilhouetteIcon className="w-3 h-3 -rotate-45 text-white" />
              </span>
            )}
          </span>
          <span className={p3 || p5 ? 'text-sm' : 'text-sm font-medium'}>助手</span>
        </motion.button>

        {navItems.slice(2).map(renderItem)}
      </nav>
    </motion.aside>
  );
};

/** 常规 tab（移动端）：激活指示条 = 斜切平行四边形，layoutId 在四格之间滑动。
 *  P4：奶油圆顶瓷砖 + 橙星角标；P3：整格蓝斜块白字；其余：顶部小条。 */
const NavTab = ({ item, active, onSelect, p3 = false, p5 = false }: { item: NavItem; active: boolean; onSelect: (e: ReactMouseEvent<HTMLButtonElement>) => void; p3?: boolean; p5?: boolean }) => {
  const isP4 = useUiChannel() === 'p4';

  if (p5) {
    // P5R（p5-dashboard 设计稿底导）：黑舞台上每格 = 纸白描边斜块，选中格整块猩红；
    // 首页格图标按稿用描边五角星（设计稿首格 ☆），其余格沿用功能图标
    const seed = 300 + item.id.length * 7 + item.id.charCodeAt(0);
    return (
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={onSelect}
        className={`relative mx-1 flex h-[54px] flex-1 cursor-pointer flex-col items-center justify-center self-center ${active ? 'text-white' : 'text-[#f0e9df]'}`}
      >
        <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(seed, 5) }} />
        <span aria-hidden className="absolute inset-[2.5px]" style={{ background: active ? P5R.red : '#050505', clipPath: roughQuad(seed + 0.3, 4) }} />
        <div
          className="relative flex flex-col items-center justify-center gap-1"
          style={{ transform: 'translateY(var(--bottom-nav-content-shift, 0px))' }}
        >
          {item.id === 'dashboard' ? (
            <svg viewBox="0 0 100 100" className="h-6 w-6" aria-hidden>
              <polygon points={starPtsSidebar} fill="none" stroke="currentColor" strokeWidth={9} strokeLinejoin="miter" />
            </svg>
          ) : (
            <item.Icon filled={active} />
          )}
          <span className="text-[10px] font-black leading-none">{item.label}</span>
        </div>
      </motion.button>
    );
  }

  if (isP4) {
    return (
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onSelect}
        className="relative mx-0.5 flex h-full flex-1 cursor-pointer flex-col items-center justify-center rounded-t-2xl bg-[var(--ui-paper)] text-[#131313]"
      >
        {active && (
          <P4Sparkle
            size={14}
            color="var(--p4-orange, #f9a11b)"
            className="absolute right-1.5 top-1.5"
          />
        )}
        <div
          className="flex flex-col items-center justify-center gap-1"
          style={{ transform: 'translateY(var(--bottom-nav-content-shift, 0px))' }}
        >
          <item.Icon filled={active} />
          <span className="text-[10px] font-black leading-none">{item.label}</span>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onSelect}
      className={`relative flex flex-col items-center justify-center flex-1 h-full cursor-pointer transition-colors duration-150 ${
        active ? (p3 ? 'text-white' : 'text-primary') : 'text-gray-400 dark:text-gray-500'
      }`}
    >
      {active && (
        // 约束（同 SegmentTabs 已验证做法）：layout 动画期间 Framer 的 projection
        // 独占本元素 transform——静态 skew 直接写在 layoutId 元素上会被覆盖，
        // 必须放内层子 div；水平居中也因此只能用负 margin，不能用 -translate-x-1/2
        p3 ? (
          // P3R（p3-dashboard 设计稿底导）：选中项 = 亮蓝实心斜块填满整格
          <motion.div layoutId="bottomnav-active" transition={springSnappy} aria-hidden="true" className="absolute inset-x-0.5 top-1 bottom-1.5">
            <div className="absolute inset-0" style={{ background: P3R.blue, clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)' }} />
          </motion.div>
        ) : (
          <motion.div
            layoutId="bottomnav-active"
            transition={springSnappy}
            aria-hidden="true"
            className="absolute top-0 w-9 h-1.5"
            style={{ left: '50%', marginLeft: '-18px' }}
          >
            <div className="absolute inset-0 bg-primary" style={{ transform: 'skewX(var(--ui-skew-ui))' }} />
          </motion.div>
        )
      )}
      {/* iOS standalone 下由 --bottom-nav-content-shift 微调内容基线（行高压缩为 48px 时回正视觉重心）
          relative：p3 的整格指示块是 positioned 元素，内容必须同为 positioned 才能压在其上 */}
      <div
        className="relative flex flex-col items-center justify-center gap-1"
        style={{ transform: 'translateY(var(--bottom-nav-content-shift, 0px))' }}
      >
        <item.Icon filled={active} />
        <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-normal'}`}>
          {item.label}
        </span>
      </div>
    </motion.button>
  );
};

export const BottomNav = () => {
  const { currentPage, setCurrentPage, actionsSubTab, setActionsSubTab } = useAppStore();
  // F6：黑猫对话窗（NavigatorWindow 挂在 App 顶层，这里只负责打开）
  const openNavigator = useNavigatorStore((s) => s.open);
  const channel = useUiChannel();
  const isP4 = channel === 'p4';
  // P3R：蓝主题底导换形（选中整格蓝斜块 / 黑猫去菱形壳），红黄频道不受影响
  const p3 = channel === 'p3';
  // P5R：红主题底导换形（黑舞台 + 纸描边斜块 tab + 中央六边形黑基座红猫）
  const p5 = channel === 'p5';

  // P8.3 长按轮盘：◈ 按住 500ms 绽放快捷跳转半环（guide §22.5 长按时长统一口径）；
  // 短按语义不变（开黑猫）。suppressClick 挡掉长按触发后随 pointerup 而来的那次 click。
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelOrigin, setWheelOrigin] = useState<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const cancelHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  useEffect(() => cancelHold, []);

  const startHold = (e: React.PointerEvent<HTMLButtonElement>) => {
    suppressClick.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    cancelHold();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      suppressClick.current = true;
      triggerLightHaptic();
      setWheelOrigin({ x: cx, y: cy });
      setWheelOpen(true);
    }, 500);
  };

  const wheelNavigate = (pageId: string) => {
    triggerNavFeedback();
    // 松手瞬间衔接频道幕布：midpoint（全遮时刻）执行真正的切页
    playHeavyTransition(() => setCurrentPage(pageId));
  };

  const renderTab = (item: NavItem) => {
    const active = isNavActive(item.id, currentPage);
    return (
      <NavTab
        key={item.id}
        item={item}
        p3={p3}
        p5={p5}
        active={active}
        onSelect={(e) => {
          triggerNavFeedback();
          if (active) {
            // 已在「行动」再点：记录 ⇄ 任务 互切（用户口径）；其余 tab 原地点击无操作
            if (item.id === 'actions') setActionsSubTab(actionsSubTab === 'activities' ? 'todos' : 'activities');
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          // P8.4 试验：底部栏切换走水波纹转场（从点击的 tab 涨潮铺满 → 幕布后切页 → 退潮露新页）
          playHeavyTransition(() => setCurrentPage(item.id), { effect: 'water', origin });
        }}
      />
    );
  };

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      // iOS PWA 完整覆盖方案：
      //   · 使用**不透明 bg**（不再 /95），消除 iOS Safari 在 backdrop-filter + padding 区的
      //     渲染不一致（这是之前所有"灰条"的根源）
      //   · padding-bottom: env(safe-area-inset-bottom) → 让 BottomNav 物理延伸到 home bar 区
      //     iOS 的 home indicator pill 会半透明地叠加在 Tab 栏 bg 上，视觉融为一体
      //   · 牺牲：失去原本的毛玻璃半透明感。换来：iOS PWA 上 100% 无分隔条
      //   · 如果要恢复毛玻璃，把下面 bg-white → bg-white/95，加 backdrop-blur-md，
      //     接受 iOS PWA home bar 区可能再次出现轻微色差
      //
      // z-index 从 z-50 收编为 zClass.nav（40）：标准弹窗（modal=50）必须能盖住导航。
      // 前提是旧的树内浮层（PWAUpdateToast / CallingCardCutIn / auth 弹窗）已 portal 到
      // body——本 PR 的并行任务负责，层级表见 utils/zIndex.ts
      //
      // 图标区和 Home Indicator safe-area 分层渲染；iOS standalone 下 safe 层由 CSS 置 0，
      // 避免系统已避让后再叠一层底部空白（iOS 26 bottom chin gap，用户真机手改口径）。
      className={`md:hidden fixed bottom-0 left-0 right-0 ${zClass.nav} flex flex-col ${
        isP4
          ? 'bg-transparent px-1' // p4-redraw：瓷砖直接坐在黄底上，缝隙露出舞台色
          : p5
            ? 'bg-black px-0.5' // p5-redraw：纯黑舞台条，纸描边瓷砖浮在其上
            : 'bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800'
      }`}
    >
      <div className="flex items-center h-[var(--bottom-nav-item-height,4rem)]">
        {navItems.slice(0, 2).map(renderTab)}

        {/* 中央 ◈：黑猫入口（NavigatorWindow）。
            凸起约束：按钮 absolute 定位于中槽、-top-3 上浮 12px——脱离 flex 流，
            h-16 容器高度不被 w-14 按钮撑破，安全区 padding 与四格 tab 布局零跳动 */}
        <div className="relative flex-1 h-full">
          <motion.button
            aria-label="助手（长按打开快捷跳转）"
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              // 长按已触发轮盘：吞掉随 pointerup 而来的这次 click（短按语义不受影响）
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              triggerNavFeedback();
              openNavigator();
            }}
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onContextMenu={(e) => e.preventDefault()}
            // rotate 走 motion style 而非 Tailwind rotate-45：whileTap 会接管 transform，
            // class 里的 rotate 在按压瞬间会被覆盖掉；motion 的 rotate / scale 独立合成。
            // 水平居中用 -ml-7（w-14 的一半）同理——translate 类靠不住；垂直居中同理走 my-auto。
            // touchAction none：长按-上滑手势期间禁掉浏览器滚动/长按系统行为。
            // P4：蓝色正圆 + 白描边 + 头顶三道黄色小放射线，不转菱形。P3R：黑猫去菱形壳——深蓝墨猫头直接坐在栏上，与四格图标同水平。
            // P5R：六边形黑基座 + 纸描边（设计稿中键形制），猫剪影转红——造型稿定、图标保猫（用户裁决）。
            style={{ rotate: isP4 || p3 || p5 ? 0 : 45, touchAction: 'none' }}
            className={`absolute left-1/2 flex items-center justify-center cursor-pointer select-none ${
              isP4
                ? '-top-3 -ml-7 w-14 h-14 rounded-full bg-[var(--ui-accent)] border-[3px] border-white text-[#131313]'
                : p3
                  ? 'top-0 bottom-0 my-auto -ml-7 w-14 h-14 text-[color:var(--p3-cat,#0a1230)]'
                  : p5
                    ? '-top-3.5 -ml-9 w-[72px] h-[68px] text-[#c00008]'
                    : '-top-3 -ml-7 w-14 h-14 rounded-2xl bg-primary shadow-lg shadow-primary/30 text-white'
            }`}
          >
            {p5 && (
              // 六边形基座：纸白外圈 + 纯黑内面（设计稿中键），猫压在其上
              <span aria-hidden className="pointer-events-none absolute inset-0">
                <span className="absolute inset-0" style={{ background: P5R.paper, clipPath: 'polygon(23% 6%, 71% 0%, 100% 44%, 79% 98%, 30% 94%, 1% 56%)' }} />
                <span className="absolute inset-[3.5px]" style={{ background: '#050505', clipPath: 'polygon(23% 6%, 71% 0%, 100% 44%, 79% 98%, 30% 94%, 1% 56%)' }} />
              </span>
            )}
            {isP4 && (
              // 头顶放射线（设计稿黑猫圈上的三道黄色短线）
              <svg
                aria-hidden
                viewBox="0 0 40 12"
                className="pointer-events-none absolute -top-3.5 left-1/2 -ml-5 w-10"
              >
                <g stroke="var(--ui-bg)" strokeWidth="3" strokeLinecap="round">
                  <line x1="8" y1="10" x2="4" y2="3" />
                  <line x1="20" y1="8" x2="20" y2="1" />
                  <line x1="32" y1="10" x2="36" y2="3" />
                </g>
              </svg>
            )}
            {/* 内层 -rotate-45 回正：菱形是壳，猫保持水平（字恒水平的图形版）；P4 圆壳 / P3 无壳 / P5 六边形壳无需回正 */}
            <span className={`${isP4 || p3 || p5 ? '' : '-rotate-45'} relative flex items-center justify-center`} aria-hidden="true">
              <CatSilhouetteIcon className={p3 ? 'w-9 h-9' : p5 ? 'w-8 h-8' : 'w-7 h-7'} />
            </span>
          </motion.button>
        </div>

        {navItems.slice(2).map(renderTab)}
      </div>
      <div
        aria-hidden
        className={isP4 ? 'bg-[var(--ui-paper)]' : p5 ? 'bg-black' : 'bg-white dark:bg-gray-900'}
        style={{ height: 'var(--bottom-nav-safe-height, env(safe-area-inset-bottom, 0px))' }}
      />
      {/* P8.3 轮盘（portal 到 body；手势在 window 级跟踪，与 ◈ 的长按触发配套） */}
      <RadialQuickNav
        open={wheelOpen}
        origin={wheelOrigin}
        onClose={() => setWheelOpen(false)}
        onNavigate={wheelNavigate}
      />
    </motion.nav>
  );
};
