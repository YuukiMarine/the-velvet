import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { readLastSync, trySyncInBackground, resolveConflictKeepLocal, resolveConflictKeepCloud, acceptDiffKeepLocal, acceptDiffKeepCloud } from '@/services/sync';
import { pb as pbClient } from '@/services/pocketbase';
import { SyncStatusBadge } from '@/components/auth/SyncStatusBadge';
import { ConflictDialog } from '@/components/auth/ConflictDialog';
import { SyncDiffDialog } from '@/components/auth/SyncDiffDialog';
import { Sidebar, BottomNav } from '@/components/Navigation';
import { WelcomeModal } from '@/components/WelcomeModal';
import { LevelUpModal } from '@/components/LevelUpModal';
import { SplashScreen } from '@/components/SplashScreen';
import type { SplashScreenProps } from '@/components/SplashScreen';
import type { ReturnPayload } from '@/types';
import { AchievementUnlockModal } from '@/components/AchievementUnlockModal';
import { SkillUnlockModal } from '@/components/SkillUnlockModal';
import { db } from '@/db';
// 首页三个频道变体：中性/黄用这份（也是 default 路由的兜底，故静态），
// 蓝/红各有一份 1:1 重绘稿——**一次会话只可能用到其中一份**，全静态导入等于
// 让每个用户都下载并解析另外两套自己永远看不到的首页（v2.6.5 性能整改 C10）。
import { Dashboard } from '@/pages/Dashboard';
// P3R（蓝主题）页面变体：p3-redraw 设计稿 1:1（channel==='p3' 时替换默认形态）
const DashboardP3 = lazy(() => import('@/pages/p3/DashboardP3').then(m => ({ default: m.DashboardP3 })));
// P5R（红主题）页面变体：P5UI 设计稿 1:1（channel==='p5' 时替换默认形态）
const DashboardP5 = lazy(() => import('@/pages/p5/DashboardP5').then(m => ({ default: m.DashboardP5 })));
import { useUiChannel } from '@/ui/useUiChannel';
import { syncDarkClass, themeToChannel } from '@/ui/channel';
const Achievements = lazy(() => import('@/pages/Achievements').then(m => ({ default: m.Achievements })));
const Statistics = lazy(() => import('@/pages/Statistics').then(m => ({ default: m.Statistics })));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
// 行动页（任务+记录合并，v2.5 五格 IA）；旧 'todos'/'activities' 路由也映射到它（见 renderPage）
const Actions = lazy(() => import('@/pages/Actions').then(m => ({ default: m.Actions })));
const Astrology = lazy(() => import('@/pages/Astrology').then(m => ({ default: m.Astrology })));
const Cooperation = lazy(() => import('@/pages/Cooperation').then(m => ({ default: m.Cooperation })));
// 菜单宫格页（v2.5 五格 IA）：activities / settings / achievements 等入口收纳于此
const Menu = lazy(() => import('@/pages/Menu').then(m => ({ default: m.Menu })));
// 账号与数据页（设置拆解 PR）：「数据管理 + 云同步」从 Settings 迁出，入口在菜单宫格
const Account = lazy(() => import('@/pages/Account').then(m => ({ default: m.Account })));
// 心相记账页（F5）
const Ledger = lazy(() => import('@/pages/Ledger').then(m => ({ default: m.Ledger })));
const BattleArena = lazy(() => import('@/components/battle/BattleArena').then(m => ({ default: m.BattleArena })));
import { BigDealClearCutIn } from '@/components/bigdeal/BigDealClearCutIn';
import { sweepDanmakuApprovals } from '@/services/danmakuWatch';
import { ReturnPanel } from '@/components/return/ReturnPanel';
import { WishProgressCutIn } from '@/components/wish/WishProgressCutIn';
import { WishProposalDialog } from '@/components/wish/WishProposalDialog';
// F6 黑猫对话窗（portal 到 body 的全屏 overlay；入口在 Sidebar / BottomNav 中央 ◈）
import { NavigatorWindow } from '@/components/navigator/NavigatorWindow';
import { primeCurrentTheme } from '@/utils/feedback';
import { BackgroundAnimation } from '@/components/BackgroundAnimation';
import { PWAUpdateToast } from '@/components/PWAUpdateToast';
import { CallingCardCutIn } from '@/components/callingCard/CallingCardCutIn';
import { isNative } from '@/utils/native';
import { warmDisplayFontShards } from '@/utils/fontWarmup';
import { tryHandleBack } from '@/utils/useBackHandler';
import { initBoldnessRuntime, schedulePerfSample, setStraightenMode, useBoldness } from '@/utils/boldness';
import { TransitionLayer } from '@/components/transition/HeavyTransition';
import { consumePendingCircleReveal, consumeCurtainMidpoint } from '@/ui/transitionDirector';
import { P4StageDecor } from '@/ui/p4Kit';
import { bgAnimStyles } from '@/ui/bgAnim';

/**
 * 页面分包预热清单，分**烫**与**温**两档。
 *
 * 这些页走 lazy()，chunk 直到首次导航才开始下载——用户感知就是"第一次点进某个页
 * 要顿一下、先闪一下『加载中…』"。这里把同样的动态 import 再列一份：Vite 对同一
 * 模块说明符的 import() 是同一个 chunk，预热完 lazy() 的 promise 立刻 resolve，
 * 导航零等待。
 *
 * ── 烫：底部导航的三个去处 ──────────────────────────────
 * 行动 / 羁绊 / 菜单是用户离开首页的**唯一三个高频落点**，等空闲再取来不及
 * （用户上报：切页时闪到了"正在加载"）。开屏一结束就连着取，不走 requestIdleCallback
 * ——闲不闲不重要，这三个反正一定会用到，早取早完事。
 */
const HOT_CHUNKS: Array<() => Promise<unknown>> = [
  () => import('@/pages/Actions'),
  () => import('@/pages/Menu'),
  () => import('@/pages/Cooperation'),
];

/**
 * ── 温：菜单宫格后面那一层 ────────────────────────────
 * 进这些页至少要多点一步，用户对"第一次进去顿一下"的容忍度高得多。
 * 保持原来的节奏：空闲时一次一个，不和首屏抢主线程。
 */
const WARM_CHUNKS: Array<() => Promise<unknown>> = [
  () => import('@/pages/Statistics'),
  () => import('@/pages/Astrology'),
  () => import('@/pages/Ledger'),
  () => import('@/pages/Account'),
  () => import('@/pages/Settings'),
  () => import('@/pages/Achievements'),
  () => import('@/components/battle/BattleArena'),
];

/**
 * 首页变体的**即时**预热（与上面那份空闲预热不同）。
 *
 * 首页是落地页，不能等空闲——但也不该三份全打进主包。折中：知道频道的那一刻
 * 立刻取对应那一份。开屏动画有 2.6s，本地读一个 chunk 远用不了那么久，
 * 用户看到的仍是「开屏结束即首页」。切主题也会走这里，提前把新皮取好。
 */
const DASHBOARD_CHUNK: Record<string, (() => Promise<unknown>) | undefined> = {
  p3: () => import('@/pages/p3/DashboardP3'),
  p5: () => import('@/pages/p5/DashboardP5'),
};

const onIdle = (cb: () => void, timeout = 2000) => {
  const w = window as Window & { requestIdleCallback?: (cb: IdleRequestCallback, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') return w.requestIdleCallback(cb, { timeout });
  return window.setTimeout(cb, 200);
};

const isStandalonePwa = () => (
  window.matchMedia('(display-mode: standalone)').matches
  || window.matchMedia('(display-mode: fullscreen)').matches
  || ('standalone' in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
);

function App() {
  /**
   * 逐字段订阅（v2.6.5 性能整改 A2）。
   *
   * 这里原本是一句无选择器的 `useAppStore()`：zustand 于是把**整个 state 对象**
   * 当订阅目标，任何一次 set() 都让 App 重渲染——而 App 是全站的根，它一动，
   * 侧栏、底导、当前页、背景动画层全部跟着 reconcile。记一笔账、勾一个任务、
   * 同步落库、逆流衰减……每一下都是一次全树重算。
   *
   * 拆开之后每个订阅各自用 Object.is 比对：动作（initializeApp/setXxx）是建 store
   * 时定死的引用，永远相等；currentPage / modalBlocker 是标量；只有 user / settings
   * 这两个对象在各自被写时才触发，这是应该的。
   */
  const currentPage = useAppStore(s => s.currentPage);
  const initializeApp = useAppStore(s => s.initializeApp);
  const user = useAppStore(s => s.user);
  const settings = useAppStore(s => s.settings);
  const modalBlocker = useAppStore(s => s.modalBlocker);
  const levelUpNotification = useAppStore(s => s.levelUpNotification);
  const setLevelUpNotification = useAppStore(s => s.setLevelUpNotification);
  const achievementNotification = useAppStore(s => s.achievementNotification);
  const setAchievementNotification = useAppStore(s => s.setAchievementNotification);
  const skillNotification = useAppStore(s => s.skillNotification);
  const setSkillNotification = useAppStore(s => s.setSkillNotification);
  // P3R 页面变体分流：蓝主题 → p3-redraw 设计稿形态
  const uiChannel = useUiChannel();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [splashPrefs, setSplashPrefs] = useState<Pick<SplashScreenProps, 'splashStyle' | 'splashSpeed'> | null>(null);
  const primedRef = useRef(false);
  // 记录上次打开时的日期，用于检测隔天回来
  const lastDateRef = useRef(toLocalDateKey());
  // Android 返回键：双击退出提示
  const [showBackToast, setShowBackToast] = useState(false);
  const lastBackPressRef = useRef(0);
  const backToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 旧版密码重置邮件兜底：过去的 PB 默认模板会生成
  // `https://the-velvet.com/_/#/auth/confirm-password-reset/TOKEN` 形式的链接。
  // 迁移到 /reset-password 之后这些旧邮件点进来会落到 SPA fallback，
  // 进入主 App 看起来"啥也没发生"。这里做一次启动检测 → 显示顶部横幅提示。
  // token 在 hash 里，nginx 看不见无法重定向，所以兜底只能做到"告知并引导"。
  const [staleResetNotice, setStaleResetNotice] = useState(false);
  useEffect(() => {
    try {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path.startsWith('/_/') && /confirm-password-reset/i.test(hash)) {
        setStaleResetNotice(true);
        // 清理 URL，避免用户刷新后再次看到同一条提示
        window.history.replaceState(null, '', '/');
      }
    } catch { /* SSR / 异常环境直接忽略 */ }
  }, []);

  // 首页变体即时预热：频道一确定就取那一份（见 DASHBOARD_CHUNK）。
  // 放在所有提前 return 之上——开屏期间正是最该预热的时候。
  useEffect(() => { void DASHBOARD_CHUNK[uiChannel]?.(); }, [uiChannel]);

  // 快速预加载开屏动画设置，确保 splash 使用用户选中的样式
  useEffect(() => {
    db.settings.get('default').then(s => {
      if (s) setSplashPrefs({ splashStyle: s.splashStyle, splashSpeed: s.splashSpeed });
      else setSplashPrefs({});
    }).catch(() => setSplashPrefs({}));
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);
        await initializeApp();
        // 任务×终端二合一（TASKS_MERGE_PRD 批1）：一次性数据迁移（内部防重入，已迁则瞬时返回）。
        // 失败不阻塞启动：按根逐个迁移天然可重入，下次启动续跑
        try {
          await useAppStore.getState().runTasksMergeMigration();
        } catch (e) {
          console.warn('[velvet] tasks-merge migration failed; will retry next boot', e);
        }
        void useAppStore.getState().syncNotifications(); // F2a：启动后排程本地通知
      } catch (err) {
        console.error('App initialization error:', err);
        setError(err instanceof Error ? err.message : '初始化失败');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [initializeApp]);

  /**
   * 页面分包预热。两条时间线，都锚在**开屏结束**那一刻（本 effect 的 showSplash 闸）。
   *
   * 烫档（行动/羁绊/菜单）：立刻起跑、连着取，不等空闲。
   * 温档：5200ms 之后再空闲逐个取。
   *
   * 为什么温档要压到 5200ms —— 预热不只是下载：import() 还要在主线程 compile +
   * 执行模块顶层，单个 chunk 的编译**不可打断**（Cooperation 连带 404K 图表库，
   * 低端安卓上是个 100~300ms 的 long task）。而 boldness 的首开帧率采样窗就在
   * 开屏结束之后不远，采到的低帧率若其实是预热造成的，会被写成**永久** D0 标记，
   * 且「校直模式」开关撤不掉（boldness.ts 的单向闸）——中端机被无辜降级。
   * 烫档同样绕开采样窗：它跑在窗口**之前**（配套把 SAMPLE_SETTLE_MS 抬到 3000ms，
   * 见 boldness.ts），温档跑在窗口**之后**，采样窗夹在两者中间的安静地带。
   */
  useEffect(() => {
    if (isLoading || showSplash || !user) return;
    let cancelled = false;

    // 烫：连着取，取完一个立刻取下一个
    let h = 0;
    const hot = () => {
      if (cancelled || h >= HOT_CHUNKS.length) return;
      HOT_CHUNKS[h++]()
        .catch(() => { /* 预热失败不影响真正导航时的重试 */ })
        .then(() => { if (!cancelled) hot(); });
    };
    hot();

    // 温：等采样窗过去，再空闲逐个取
    let w = 0;
    const warm = () => {
      if (cancelled || w >= WARM_CHUNKS.length) return;
      WARM_CHUNKS[w++]()
        .catch(() => { /* 同上 */ })
        .then(() => { if (!cancelled) onIdle(warm); });
    };
    const kick = window.setTimeout(() => onIdle(warm), 5200);
    return () => { cancelled = true; clearTimeout(kick); };
  }, [isLoading, showSplash, user]);

  // 订阅云端登录状态变化（PocketBase token 刷新 / 登出）
  useEffect(() => {
    const unsub = useCloudStore.getState().initAuthListener();
    return unsub;
  }, []);

  // 登录状态切换时拉 / 清 social 数据（好友 + 通知）
  useEffect(() => {
    import('@/services/social').then(({ loadSocial, resetSocial }) => {
      let isLogged = useCloudStore.getState().cloudUser !== null;
      if (isLogged) void loadSocial({ force: true });
      const unsub = useCloudStore.subscribe((state) => {
        const nowLogged = state.cloudUser !== null;
        if (nowLogged === isLogged) return;
        isLogged = nowLogged;
        if (nowLogged) {
          void loadSocial({ force: true });
        } else {
          resetSocial();
        }
      });
      return unsub;
    });
  }, []);

  // 启动时若已有有效 token，静默刷新一次以延长有效期（避免每次进入都要重登）
  // 刷新失败（token 过期 / 服务端拒绝）→ 清除本地 token，用户下次再登录
  useEffect(() => {
    const client = pbClient;
    if (!client || !client.authStore.isValid) return;
    client
      .collection('users')
      .authRefresh()
      .catch(() => {
        client.authStore.clear();
      });
  }, []);

  // 恢复上次同步时间 + 监听切到后台时静默推送到云端
  useEffect(() => {
    const last = readLastSync();
    if (last) useCloudStore.getState().setLastSyncAt(last);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // 切到后台：静默推送本地最新数据（失败不扰民）
        void trySyncInBackground();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    // 页面关闭前尝试一次（best-effort，浏览器可能不会等待异步完成）
    window.addEventListener('pagehide', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
    };
  }, []);

  // 切回前台时检查日期是否推进，若推进则重载数据（修复隔天打开不刷新）
  useEffect(() => {
    const { loadData, loadDailyDivination, sweepExpiredReadings, sweepCallingCards, syncNotifications } = useAppStore.getState();

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      // 切回前台顺手刷新 social（好友 + 通知）；30 秒节流在 loadSocial 内部已做
      if (useCloudStore.getState().cloudUser) {
        import('@/services/social').then(({ loadSocial }) => {
          void loadSocial();
        });
      }
      const today = toLocalDateKey();
      if (today !== lastDateRef.current) {
        lastDateRef.current = today;
        await loadData();
        await loadDailyDivination(); // 换日后重置今日塔罗状态
        await sweepExpiredReadings();
        // 跨日：扫一遍宣告卡，把跨过 targetDate 的自动归档（→ Dashboard 会触发 cut-in）
        await sweepCallingCards();
      }
      // F2a：每次切回前台重排本地通知，保持「快照」新鲜（条件已满足的提醒自然不再排程）
      void syncNotifications();
      // FS4 短期 C 路线：没有厂商推送通道，「你的弹幕过审了」靠开 App 时自查
      // （danmaku 集合刻意匿名，服务端根本不知道该推给谁）
      void sweepDanmakuApprovals();
      // 回归面板（§12）：也要挂在切回前台上——App 一直没被杀、只是在后台放了十天，
      // 这种情况冷启动那条 effect 永远不会再跑，只有这里能接住
      void useAppStore.getState().markAppOpened().then(p => { if (p) setReturnPayload(p); });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    // 冷启动也扫一次：visibilitychange 只在"切回来"时触发，第一次打开不会响
    void sweepDanmakuApprovals();
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ── Android 返回键：分层处理 ───────────────────────────────
  // 优先级：
  //   1. 有注册的 back handler（Modal / 临时页）→ 关闭最顶层
  //   2. 当前 currentPage 不是 dashboard → 回到 dashboard
  //   3. 已经在 dashboard → "再次点击回到现实"，2 秒内再按则退出
  useEffect(() => {
    if (!isNative()) return; // 仅在原生平台生效

    let pluginListener: { remove: () => void } | null = null;

    const setup = async () => {
      const { App: CapApp } = await import('@capacitor/app');
      pluginListener = await CapApp.addListener('backButton', () => {
        // 步骤 1：交给栈顶注册的 back handler（BattleModal / VictoryModal 等）
        if (tryHandleBack()) return;

        // 步骤 2：非 dashboard 页 → 返回 dashboard
        // 例外：宫格子页（成就 / 统计 / 战场 / 设置 / 账号与数据）的入口都在「菜单」宫格
        // （v2.5 五格 IA），系统返回与 UI 返回必须同走菜单，避免「界面返回去菜单、系统返回
        // 去首页」的分裂。即便首页 widget 也能直达战场/统计，宫格化后这些页的归属是菜单。
        // menu 页本身不设特例：落入下方默认分支回 dashboard
        const store = useAppStore.getState();
        const gridSubPages = ['achievements', 'statistics', 'battle', 'settings', 'account', 'ledger'];
        if (gridSubPages.includes(store.currentPage)) {
          store.setCurrentPage('menu');
          return;
        }
        if (store.currentPage !== 'dashboard') {
          store.setCurrentPage('dashboard');
          return;
        }

        // 步骤 3：dashboard 上执行双击退出
        const now = Date.now();
        const DOUBLE_PRESS_MS = 2000;
        if (now - lastBackPressRef.current < DOUBLE_PRESS_MS) {
          if (backToastTimerRef.current) clearTimeout(backToastTimerRef.current);
          setShowBackToast(false);
          CapApp.exitApp();
        } else {
          lastBackPressRef.current = now;
          setShowBackToast(true);
          if (backToastTimerRef.current) clearTimeout(backToastTimerRef.current);
          backToastTimerRef.current = setTimeout(() => {
            setShowBackToast(false);
            lastBackPressRef.current = 0;
          }, DOUBLE_PRESS_MS);
        }
      });
    };

    setup();

    return () => {
      pluginListener?.remove();
      if (backToastTimerRef.current) clearTimeout(backToastTimerRef.current);
    };
  }, []);

  // 斜界系统：大胆度拨盘运行时——恢复低帧率永久降级 flag（幂等）
  useEffect(() => {
    initBoldnessRuntime();
  }, []);

  // 首开帧率采样推迟到开屏动画结束后：采样窗口若撞上 splash 粒子循环
  // 会把启动期掉帧误判成永久降级（boldness.ts 文件头「采样时机」）
  useEffect(() => {
    if (!showSplash) schedulePerfSample();
  }, [showSplash]);

  // 「校直模式」→ <html data-boldness>；perf 永久降级优先级更高（boldness.ts 内保证）
  useEffect(() => {
    setStraightenMode(!!settings.straightenMode);
  }, [settings.straightenMode]);

  // 同步 dark class 到 <html> 元素，使 index.css 中 html.dark 选择器可控制
  // body 的背景色 —— 修复 iOS PWA standalone 模式下安全区白色条带。
  // 经 syncDarkClass 闸门：红频道（P5）铁律不响应夜间，依赖里挂 theme 是因为
  // 切进/切出红主题时 .dark 要跟着摘/还（data-ui-channel 由 store 写点先行更新）。
  useEffect(() => {
    syncDarkClass(settings.darkMode);
  }, [settings.darkMode, user?.theme]);

  // iOS PWA standalone has its own safe-area handling. Mark it from JS because
  // display-mode media queries are not reliable across all iOS 26 PWA launches.
  useEffect(() => {
    if (isStandalonePwa()) {
      document.documentElement.dataset.iosStandalone = 'true';
    } else {
      delete document.documentElement.dataset.iosStandalone;
    }
  }, []);

  // 标题字分片预热（仅原生壳，开屏期间后台拉全）：见 fontWarmup.ts 头注释
  useEffect(() => {
    warmDisplayFontShards();
  }, []);

  // 同步主题色到三个地方：
  //   1. <meta name="theme-color"> —— 旧版 iOS / Android Chrome 顶部状态栏 tint
  //   2. <html> 和 <body> 的 background-color —— iOS 26 Safari 双指缩放时
  //      暴露的 HTML 区域；以及当 fixed sampler 取色不到时的 fallback
  //   3. iOS PWA standalone 模式下的安全区背景
  //
  // 双指缩放白条的解释：
  //   · 缩放时，"左右白边" = 浏览器 chrome（视口外），iOS 26 从最近 fixed 元素采样 → 我们的 1px sampler 起作用 ✓
  //   · "上下白边" = HTML/Body 自身的 background-color（属于内容缩放范围内的部分）
  //   · index.css 里 html/body 的 bg-color 是写死的 #f9fafb / #111827，不会跟自定义主题色变
  //   · 所以这里用 JS 在运行时动态覆盖，让上下也响应主题
  useEffect(() => {
    let color = settings.darkMode ? '#111827' : '#f9fafb';
    if (user?.theme === 'custom' && settings.customThemeColor) {
      color = settings.customThemeColor;
    }
    // P4 黄频道（p4-redraw）：舞台就是高饱和黄平面，html/body 同步染黄防缩放白条
    if (user?.theme === 'yellow') {
      color = '#ffd900';
    }
    // iOS standalone + 移动端：html/body 是系统安全区（状态栏/Home Bar）的着色来源，
    // 用中性面色而非主题色，避免顶/底被主题色染出「彩条」——用户真机手改口径
  const isStandalone = isStandalonePwa();
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const systemAreaColor = isStandalone && isMobile
      ? (settings.darkMode ? '#111827' : '#ffffff')
      : color;
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = color;
    document.documentElement.style.backgroundColor = systemAreaColor;
    document.body.style.backgroundColor = systemAreaColor;
  }, [settings.darkMode, settings.customThemeColor, user?.theme]);

  // 在首次用户交互时预加载当前主题音效，之后所有点击都是零延迟播放
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (primedRef.current) return;
      primedRef.current = true;
      primeCurrentTheme();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // 稳定的回调引用，防止 Android 返回键等触发的 re-render 导致开屏动画定时器重启
  const handleSplashComplete = useCallback(() => setShowSplash(false), []);

  // ── 回归面板（PRD_V2.6 §12）────────────────────────────────
  // 触发时机刻意压到「开屏结束 + 数据加载完 + 有档案」之后：
  // 这个面板要说的是"你不在的 N 天里，你的◯◯还是 Lv.X"，
  // 数据没就位就弹，那句话会变成一句空话。
  const [returnPayload, setReturnPayload] = useState<ReturnPayload | null>(null);
  useEffect(() => {
    if (showSplash || isLoading || !user) return;
    let cancelled = false;
    void useAppStore.getState().markAppOpened().then(p => {
      if (!cancelled && p) setReturnPayload(p);
    });
    return () => { cancelled = true; };
  }, [showSplash, isLoading, user]);

  // 背景动画是否开着——口径收在 ui/bgAnim.ts（含 P5 的"默认不开"闸）。
  // 擦除垫底层也按它决定是否复刻，两边必须同源，否则切页时会一层在画一层不画。
  // **必须 useMemo**：BackgroundAnimation 是 memo 化的，styles 是数组 prop，
  // 每次渲染新建一个引用就会把那道 memo 边界原地打穿（v2.6.5 性能整改）。
  // ⚠️ 必须待在**所有提前 return 之上**——下面 showSplash / isLoading / error
  //    三处会直接 return，hook 写在它们后面就会出现「渲染次数不同、hook 数量不同」，
  //    React 直接抛 Rendered more hooks than during the previous render。
  const bgAnimStyleList = useMemo(
    () => bgAnimStyles(settings, user?.theme),
    [settings.backgroundImage, settings.backgroundAnimation, settings.p5BgAnimOptIn, user?.theme, settings],
  );

  if (showSplash) {
    if (!splashPrefs) return null; // 等待开屏设置加载
    return <SplashScreen isVisible={showSplash} onComplete={handleSplashComplete} splashStyle={splashPrefs.splashStyle} splashSpeed={splashPrefs.splashSpeed} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-red-600 mb-4">出错了</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const bgAnimOn = bgAnimStyleList.length > 0;
  // 背景图开着：三个频道的页面壳都要给它让位，擦除垫底层也要把它复刻一份
  const bgImageOn = !!settings.backgroundImage;
  const bgImageLayer = bgImageOn ? (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${settings.backgroundImage})`,
        backgroundSize: settings.backgroundOrientation === 'landscape' ? '100% auto' : 'auto 100%',
        opacity: settings.backgroundOpacity ?? 0.3,
      }}
    />
  ) : null;
  /** lazy 页的统一外壳。首页变体走 lazyPage(..., true)：预热基本保证它已就绪，
   *  真没就绪也不该闪一行「加载中…」在落地页上，留白比字更安静。 */
  const lazyPage = (node: ReactNode, blank = false) => (
    <Suspense fallback={blank ? <div className="h-64" /> : <div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}>
      {node}
    </Suspense>
  );
  const renderPage = (page: string) => {
    switch (page) {
      case 'dashboard':
        return uiChannel === 'p3' ? lazyPage(<DashboardP3 />, true)
          : uiChannel === 'p5' ? lazyPage(<DashboardP5 />, true)
            : <Dashboard />;
      // 'todos'/'activities' 是合并前的旧路由 id：散落的 setCurrentPage('todos') 调用点
      // （问候卡提示条等）继续可用，Actions 内部会按旧 id 落到对应子页并归一为 'actions'
      case 'actions':
      case 'todos':
      case 'activities':
        return lazyPage(<Actions />);
      case 'achievements':
        return lazyPage(<Achievements />);
      case 'statistics':
        return lazyPage(<Statistics />);
      case 'settings':
        return lazyPage(<Settings />);
      case 'battle':
        return lazyPage(<BattleArena />);
      case 'astrology':
        return lazyPage(<Astrology />);
      case 'cooperation':
        return lazyPage(<Cooperation />);
      case 'menu':
        return lazyPage(<Menu />);
      case 'account':
        return lazyPage(<Account />);
      case 'ledger':
        return lazyPage(<Ledger />);
      case 'terminal':
        // F3 终端已并入任务系统（TASKS_MERGE_PRD）：旧跳转一律落回首页
        return <Dashboard />;
      default:
        return <Dashboard />;
    }
  };

  return (
    // 红频道（P5）不响应夜间：这层局部 dark 作用域与 <html> 的 .dark 同一口径闸门
    <div className={`min-h-screen ${settings.darkMode && themeToChannel(user?.theme) !== 'p5' ? 'dark' : ''}`}>
      {/* Android 返回键双击退出 Toast */}
      <AnimatePresence>
        {showBackToast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
          >
            <div className="bg-gray-900/90 dark:bg-gray-100/90 text-white dark:text-gray-900 text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl backdrop-blur-sm whitespace-nowrap">
              再次点击回到现实
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 旧版重置密码邮件链接的兜底提示（PB 模板迁移前发出、未点击的链接会落到这里） */}
      <AnimatePresence>
        {staleResetNotice && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="fixed left-1/2 -translate-x-1/2 z-[210] max-w-md w-[calc(100%-2rem)]"
            style={{ top: 'calc(1rem + env(safe-area-inset-top))' }}
            role="alert"
          >
            <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-500/95 text-white shadow-xl backdrop-blur-sm">
              <span className="text-lg flex-shrink-0">⚠</span>
              <div className="flex-1 text-xs leading-relaxed">
                <div className="font-semibold mb-0.5">这条密码重置链接已不再支持</div>
                <div className="opacity-90">
                  重置密码的入口已迁移到新的页面。请到登录弹窗点"忘记密码"重新申请一份邮件，直接点击新邮件里的按钮即可完成重置。
                </div>
              </div>
              <button
                onClick={() => setStaleResetNotice(false)}
                aria-label="关闭提示"
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-sm flex-shrink-0"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

        {/* iOS 26 Safari "Liquid Glass" 工具栏取色源 ────────────────────────
            Apple 在 iOS 26 移除了 <meta name="theme-color"> 的支持，改成
            "采集页面顶部最近 fixed/sticky 元素的 background-color" 作为
            浏览器顶部状态栏 / 底部地址栏的 tint。这里挂一个 1px 高度的
            fixed top-0 元素专门当采样源，背景色跟随 darkMode 和 custom
            主题色变化。z-index 介于 BackgroundAnimation(0) 和内容(10) 之间，
            视觉上几乎不可见，仅供 Safari 取色。 */}
        <div
          aria-hidden
          className="fixed left-0 right-0 pointer-events-none"
          style={{
            top: 0,
            height: '1px',
            zIndex: 1,
            backgroundColor: settings.darkMode ? '#111827' : '#ffffff',
          }}
        />
        {/* 同样为底部地址栏 / Tab 栏 tint 提供一个采样源（兜底，防止 Safari
            优先采到 BottomNav 的半透明色后产生灰条）。位置紧贴底部。 */}
        <div
          aria-hidden
          className="fixed left-0 right-0 pointer-events-none"
          style={{
            bottom: 0,
            height: '1px',
            zIndex: 1,
            backgroundColor: settings.darkMode ? '#111827' : '#ffffff',
          }}
        />

        <div
          className="min-h-screen bg-gray-50 dark:bg-gray-900 relative"
          // 擦除垫底层的取色锚点：PageShell 开擦时直接量这个节点的计算色当垫底色，
          // 夜间频道毯式规则怎么翻（蓝→靛/黄→紫），垫底就跟着是什么，永不脱钩
          data-app-stage
          // P4 黄频道：舞台平面直接铺 --ui-bg（p4-redraw 定稿），暗色也保持黄
          // 用户自定义了背景图时让位——这层不透明黄会把图整块盖没（"背景图片没反应"）
          // 舞台底走 --p4-stage（夜间=紫），fallback 到 --ui-bg（白天=黄，黄同时兼任强调色）
          style={user?.theme === 'yellow' && !settings.backgroundImage ? { background: 'var(--p4-stage, var(--ui-bg, #ffd900))' } : undefined}
        >
          {/* 背景图片（与擦除垫底层复刻的是同一个节点，见 bgImageLayer） */}
          {bgImageLayer}

          {/* 背景动画（无背景图时，优先于纹理；红频道默认不开，见 ui/bgAnim.ts） */}
          {bgAnimOn && (
            // 用独立 will-change 容器包裹，使背景动画层与页面切换（AnimatePresence）
            // 产生的 stacking context 完全隔离，避免页面转场时背景闪烁
            // 不写 will-change：这个 wrapper 自身没有 transform 动画，钉一次纯属白占
            // 一层后备存储；BackgroundAnimation 根上的 translateZ(0) 已经完成提升
            <div data-bg-anim style={{ isolation: 'isolate', position: 'fixed', inset: 0, zIndex: 0 }}>
              <BackgroundAnimation
                styles={bgAnimStyleList}
                darkMode={settings.darkMode}
              />
            </div>
          )}

          {/* 「装饰纹理」（无背景图无动画时铺的 24px 点阵）已下架 —— 用户口径「没啥用」。
              它是全屏一张 24px 平铺渐变，四个频道各自的舞台装饰早就把这层盖过去了。 */}

          {/* P4 黄舞台背景装饰：巨型橙弧环 + 大花剪影 + 四角星，缓解纯黄大面积平铺 */}
          {user?.theme === 'yellow' && !bgImageOn && <P4StageDecor />}

        <div className="relative z-10">
          <WelcomeModal />
          
          {user && (
            <>
              <Sidebar />
              <BottomNav />
              {/* F6 黑猫：窗口本体挂一次（portal 到 body），Sidebar/BottomNav 只负责 open() */}
              <NavigatorWindow />

              <main
                // 顶部 padding 用 calc(1rem + env(safe-area-inset-top)) 保证：
                //   - 桌面 / Android：env() 为 0，退化为 1rem（=原 p-4 行为）
                //   - iOS PWA / viewport-fit=cover：自动加上状态栏 / Dynamic Island 的高度，
                //     防止页面标题钻到"12:25 信号 电池"这条原生 UI 下面。
                //   - 桌面断点（md+）用 Tailwind 的 md:pt-8 覆盖为 2rem，安全区为 0 时无副作用。
                // 底部 padding 精确匹配 BottomNav 高度（4rem 图标区 + home-indicator 安全区），
                // 避免 iPhone home bar 设备上出现多余的灰色空白条。
                // --bottom-nav-overhang 是 BottomNav 运行时实测写入的错位补偿：常规平台恒为
                // 0px（此式与改动前逐像素相同），只有 iOS PWA 的 100vh/内缩视口错位才 > 0。
                className="md:ml-60 px-4 md:px-8 pt-[calc(1rem+env(safe-area-inset-top))] md:pt-8 pb-[calc(4rem+var(--app-bottom-safe-padding,env(safe-area-inset-bottom,0px))+var(--bottom-nav-overhang,0px)+0.5rem)] md:pb-8"
                // 横向兜底：页面的出血装饰（P5 的红斜块、P4 的头图 bleed）用负偏移探出屏缘，
                // 这些绝对定位层会把 shell 的 scrollWidth 撑大，用户就能把整页往左划出 70~90px 空白。
                // overflow-x:clip 只裁不滚——不建立滚动容器，不影响 sticky，也不影响页内自己的横滑组件。
                // 裁切发生在 main 的 padding box（含 px-4），所以 -mx-4 这类"贴到屏缘"的满幅设计不受影响。
                style={{ overflowX: 'clip', overflowY: 'visible' }}
              >
                {/* 页面双缓冲切换：水波纹导航=旧页垫底+新页圆形擦除（页对页，无背景闪白）；
                    普通导航=交叉淡化 */}
                <PageSwitcher
                  current={currentPage}
                  // 与 App 根的舞台底色同源（黄频道走 --ui-bg，其余走 gray-50 / gray-900）
                  // 背景图开着时黄频道不能再垫不透明黄：擦除瞬间一块黄盖住背景图
                  // 再消失，就是"蒙版闪烁"（垫底层里已复刻了 bgImageLayer，用中性底即可）
                  stageBg={
                    user?.theme === 'yellow' && !bgImageOn
                      ? 'var(--p4-stage, var(--ui-bg, #ffd900))'
                      : settings.darkMode ? '#111827' : '#f9fafb'
                  }
                  // 擦除垫底层要把**所有全局背景层**都复刻一份，否则垫层期间它们被盖成
                  // 纯色、垫层一卸又跳回来——这就是"切页时背景动画闪一下"的全部原因
                  // （P4StageDecor 早就这么做了，背景动画一直漏在外面）。
                  stageDecor={
                    (user?.theme === 'yellow' || bgAnimOn || bgImageOn) ? (
                      <>
                        {user?.theme === 'yellow' && !bgImageOn && <P4StageDecor />}
                        {/* 复刻份原样跟着活层跑，**不冻结**。相位靠 BackgroundAnimation 里
                            的 -sync 负 delay 对齐，两份逐帧同相，垫层卸载无痕。
                            v2.6.5 曾为省帧预算把它冻住（先摘 animation、后改 paused），
                            两版都被用户判为"切页闪一下 / 顿一下再跳"，已撤回：
                            那 420ms 的帧预算不值得拿每次切页都看得见的闪烁去换。 */}
                        {bgAnimOn && <BackgroundAnimation styles={bgAnimStyleList} darkMode={settings.darkMode} />}
                        {bgImageLayer}
                      </>
                    ) : undefined
                  }
                  render={renderPage}
                />
              </main>

               {/* 升级弹窗 */}
               {levelUpNotification && !modalBlocker && (
                 <LevelUpModal
                   attributeName={levelUpNotification.displayName}
                   newLevel={levelUpNotification.level}
                   isOpen={!!levelUpNotification}
                   onClose={() => setLevelUpNotification(null)}
                 />
               )}

               {/* 成就解锁弹窗 */}
               {achievementNotification && !modalBlocker && !levelUpNotification && (
                 <AchievementUnlockModal
                   achievementTitle={achievementNotification.title}
                   isOpen={!!achievementNotification}
                   onClose={() => setAchievementNotification(null)}
                 />
               )}

               {/* 技能解锁弹窗 */}
               {skillNotification && !modalBlocker && !levelUpNotification && !achievementNotification && (
                 <SkillUnlockModal
                   skillName={skillNotification.name}
                   isOpen={!!skillNotification}
                   onClose={() => setSkillNotification(null)}
                 />
               )}

               {/* PWA 新版本更新提示。
                   **原生容器里不挂**——useRegisterSW 是在组件里跑的，不渲染即不注册。
                   Capacitor 的 androidScheme:'https' 让 WebView 从 https://localhost 加载，
                   Service Worker 在那里是会正常注册的。于是装了新 APK 之后：
                   新 sw.js 的预缓存清单变了 → 新 SW 进 waiting → registerType:'prompt'
                   弹出「有新版本可用 · 立即更新」，而在此之前**旧 SW 仍在供旧资源**。
                   用户刚更新完 App 却被告知有新版本、且实际跑的还是上一版 JS——
                   这条链在原生里只会添乱，安装包本来就是整包替换。 */}
               {!isNative() && <PWAUpdateToast />}
            </>
          )}

          {/* 云同步：浮动状态徽章 + 冲突解决弹窗（全局，无论 WelcomeModal 或主界面都可见） */}
          <SyncStatusBadge />
          <GlobalConflictDialog />
          <GlobalDiffDialog />
          {/* dev 临时件已随收官下架（2026-08-01 用户口径）；斜界调参（SlantTuner）仍在
              components/dev/ 备查。星形撕页演示与原语样品间连同其专属库
              （StarTearOverlay/motifs）已删（v2.7 审计：生产零引用，星形技法在
              HeavyTransition 另有实现，starPath.ts 为存活的共用层） */}
          {/* P8.2 重转场演出层：订阅 transitionDirector，轮盘跳转/仪式点经此播频道幕布 */}
          <TransitionLayer />
          {/* 宣告 · 达成 全屏结算屏：放在 App 顶层是为了"完成最后一项 todo 时立即弹出"，
              即便用户当时不在 Dashboard 也能看到 */}
          <GlobalCallingCardCutIn />
          {/* BIG DEAL 收官结算屏（批4）：collapseBigDeal 落库后全局弹出，不依赖当前页面 */}
          <BigDealClearCutIn />
          {/* 愿望进度（PRD_V2.6 §8）：任务完成后的「又近了多少」弹窗 +
              黑猫在谈话里提议改数值的确认卡。两者都可能在任意页面触发，故挂顶层 */}
          <WishProgressCutIn />
          <WishProposalDialog />
          {/* 回归面板（PRD_V2.6 §12）：离开 ≥7 天后的第一次打开 */}
          <ReturnPanel payload={returnPayload} onClose={() => setReturnPayload(null)} />
        </div>
      </div>
    </div>
  );
}

/**
 * 水波纹转场配套（P8.4）：页面双缓冲切换器。
 * 水波纹导航（800ms 内登记过原点）：旧页**原样垫底**，新页以点击点为圆心经扩散
 * 圆形蒙版直接擦出来——页对页擦除，中间不露背景（用户口径：不要白色遮罩）。
 * 普通导航：旧页快速淡出 + 新页自身入场动画（原交叉淡化口径）。
 * 擦除完旧页出栈、clip 撤为 none：clip-path 会给 fixed 子孙创建 containing block
 * （P3RPage 的水面底就是 fixed inset-0），不撤会让页面背景错位。
 * 同实例约束：active→leaving 必须由同一个 PageShell 承载（换组件类型会 remount
 * 页面、on-mount 数据副作用重跑——逆流衰减等不可重放）。
 */
const PAGE_HOLD_MS = 520;
/** 圆形揭示时长（原生 CSS transition 驱动，见 PageShell 内注释） */
const REVEAL_MS = 460;
/** 旧路由 id todos/activities 与 actions 同页，归一避免瞬间误 remount */
const normPageKey = (id: string) => (id === 'todos' || id === 'activities' ? 'actions' : id);

const PageShell = ({ leaving, coveredByWipe, stageBg, stageDecor, onRevealed, children }: {
  leaving: boolean; coveredByWipe: boolean; stageBg: string; stageDecor?: ReactNode; onRevealed?: () => void; children: ReactNode;
}) => {
  // D0（reduced-motion / 校直 / 低帧永久降级）：圆形揭示是装饰动效，按降级铁律直出
  // ——origin 置 null 走普通淡切路径（与 TransitionLayer 拒接波纹演出同一口径，
  // 否则 D0 用户只剩一个没有波纹陪衬的裸 clip 扩散，观感是"莫名其妙的圆"）
  const bold = useBoldness();
  const [origin] = useState(() => (bold ? consumePendingCircleReveal() : null)); // 入场时查询一次（读取不清除，StrictMode 双挂载安全）
  // 垫底色以 App 根的**实际计算色**为准：夜间频道毯式规则会把根的 dark:bg-gray-900
  // 翻成频道色（蓝→靛/黄→紫），stageBg 里写死的 #111827 与之差一档——垫层一卸就是
  // 一次底色跳变，即夜间开背景动画/背景图时的"切页背景闪烁"。量不到再退回 stageBg。
  const [measuredBg] = useState(() => {
    if (!origin) return null;
    const el = document.querySelector('[data-app-stage]');
    const c = el ? getComputedStyle(el).backgroundColor : '';
    return c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)' ? c : null;
  });
  /**
   * 圆形揭示改三相：pending（新页隐藏，等首帧画完）→ revealing（圆扩散中）→ done。
   *
   * 为什么不再挂载即开擦：clip 动画在低端机上切页那一刻会被新页挂载/布局整段饿死，
   * 等主线程空出来时进度已 ≥1，蒙版从半截跳到消失（用户上报「圆圈扩散到屏幕一半
   * 就消失」，3:4 低端机稳定复现）。现在先把挂载成本付掉（双 rAF = 首帧已上屏），
   * 再开 0.46s 的擦除，全程都有帧可画。
   *
   * 坐标系：clip-path 画在**本元素**的 border box 里，而点击原点是视口坐标——开擦前
   * 量一次自身 rect 做换算（main 的 padding 普通机型 16px，iOS 刘海机安全区 ~60px）。
   *
   * 驱动改原生 CSS transition、完成判定改定时器（v2.7.1，用户上报「蒙版一闪而过/
   * 圆心和波纹圆环对不上」的根因）：此前 clip 走 framer 的 animate 插值 +
   * onAnimationComplete 收尾，但该回调**分不清完成的是哪段动画**——挂载期 pending
   * 目标那个零时长动画的完成回调若迟到落在 revealing 相内，守卫照样放行，蒙版开擦
   * 即被掐成 'none'（本机日志实锤：complete 的 def 还是 pending 值、phase 已是
   * revealing）。CSS transition 起终点写死同一个本地圆心，半径是唯一变化量，圆心
   * 恒定；时长已知，定时器收尾没有回调歧义。clip 样式全程手写在 el.style 上，
   * React/framer 不参与（framer 只管这层的 opacity，按属性写入，互不相扰）。
   */
  const shellRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'pending' | 'revealing' | 'done'>(origin ? 'pending' : 'done');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;
  // 首帧即隐藏：paint 前把 r=0 的 clip 写上（r=0 全裁，位置无关紧要）。不写进 JSX
  // style——那样每次 re-render 都会把手写的 transition 中间值冲掉
  useLayoutEffect(() => {
    if (origin && shellRef.current) shellRef.current.style.clipPath = 'circle(0px at 0px 0px)';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!origin) return;
    let doneTimer = 0;
    let started = false;
    const start = () => {
      const el = shellRef.current;
      if (started || phaseRef.current !== 'pending' || !el) return;
      started = true;
      const rect = el.getBoundingClientRect();
      // 半径按**视口**几何算（原点到最远屏角 ×1.1 吸收换算与安全区余量），圆画在本元素坐标系
      const R = Math.ceil(Math.hypot(
        Math.max(origin.x, window.innerWidth - origin.x),
        Math.max(origin.y, window.innerHeight - origin.y),
      ) * 1.1);
      const lx = Math.round(origin.x - rect.left);
      const ly = Math.round(origin.y - rect.top);
      if (import.meta.env.DEV) console.debug('[reveal] origin=', origin, 'rect=', { l: rect.left, t: rect.top }, 'local=', { lx, ly, R });
      el.style.transition = 'none';
      el.style.clipPath = `circle(0px at ${lx}px ${ly}px)`;
      // ⚠️ 这里不要加 will-change: clip-path（v2.7.0.2 加过、v2.7.0.3 撤回）：
      // 它把**整页**强提成一张巨型合成层，恰在挂载最忙的瞬间要求整层重栅格化，
      // 低端 GPU 来不及就闪未就绪的白 tile——用户复验「闪烁依旧」且形态是闪不是卡，
      // 该层嫌疑大于收益。不提层时 clip 过渡走主线程重绘：慢帧表现为擦得钝，不闪。
      void el.offsetWidth; // 强制 reflow 钉住起点，下一条赋值才会被当作 transition 终点
      el.style.transition = `clip-path ${REVEAL_MS}ms cubic-bezier(0.3, 0, 0.2, 1)`;
      el.style.clipPath = `circle(${R}px at ${lx}px ${ly}px)`;
      setPhase('revealing');
      doneTimer = window.setTimeout(() => {
        if (phaseRef.current !== 'revealing') return;
        setPhase('done');
        onRevealedRef.current?.();
      }, REVEAL_MS + 40);
    };
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(start); });
    // rAF 断供保险丝（后台化/个别 WebView 暂停 rAF）：500ms 内没开擦就强启，
    // 蒙版宁可少一段扩散，也绝不把新页锁在隐藏态
    const fuse = window.setTimeout(start, 500);
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); clearTimeout(fuse); clearTimeout(doneTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 连点保护：上一张还没擦完就被顶成 leaving 时立刻收掉它的圆蒙版，
  // 否则它会带着半截圆停在垫底层上，看起来就是"两个界面卡在一起"（用户上报）。
  useEffect(() => { if (leaving) setPhase('done'); }, [leaving]);
  // done 的样式收尾（定时器到点 / leaving 截断都汇到这里）：clip 撤干净——
  // clip-path 会给 fixed 子孙创建 containing block，不撤会让页面背景错位。
  // layout effect：连点截断的半圆必须在下一次 paint 前消失，不能多挂一帧
  useLayoutEffect(() => {
    if (phase !== 'done') return;
    const el = shellRef.current;
    if (el) { el.style.transition = ''; el.style.clipPath = ''; }
  }, [phase]);
  /**
   * 变 leaving 时是否"原样垫底等着被擦掉"。
   *
   * ⚠️ 这里不能自己去问 consumePendingCircleReveal()——**有没有人来擦我，只有
   * PageSwitcher 知道**：连点时新页可能是被复活的旧实例（origin 是它上次挂载时的，
   * 不会再擦一次），此时若我还把 opacity 钉在 1 等擦除，就永远等不到，
   * 两张页面就都不透明地叠在一起（用户上报的"1 秒点 3~4 次出现两个页面"）。
   * 所以改由外部传 coveredByWipe。
   */
  const holdStatic = leaving && coveredByWipe;
  // 兜底：leaving 超过这个时长仍没被出栈（擦除没来 / prune 被连点冲掉），强制淡出。
  // 宁可少一次"垫底等擦除"的观感，也不能留一张不透明的旧页压在新页上。
  const [forceFade, setForceFade] = useState(false);
  useEffect(() => {
    if (!leaving) { setForceFade(false); return; }
    const t = setTimeout(() => setForceFade(true), 260);
    return () => clearTimeout(t);
  }, [leaving]);
  /**
   * 滚动复位 + 离场冻结（v2.7.0.2，用户上报「转场时上一个页面突然闪现一帧」的根因）。
   *
   * 旧做法是 PageSwitcher 里一个按 current 键控的 layout effect 复位 #root 滚动。
   * 但 current 变化的那次 commit 里**页面栈还没换**（栈更新在普通 effect 里，晚一拍）：
   * 于是存在整整一帧——旧页仍是场上唯一一页、却已被拽回 scrollTop 0，滚动过的页面
   * 就闪出一帧自己的顶部。桌面 Chrome 常把两次 commit 合进一次 paint 看不出来，
   * 安卓主线程慢、两次分开画，这一帧就露了（「安卓端比 chrome 更明显」的来源）。
   *
   * 现在两件事都搬进**换栈那次 commit**、由 PageShell 自理，并且靠兄弟间 layout effect
   * 的树序保证先后（离场页在栈数组前面，先执行）：
   *   ① 离场页：在滚动被复位**之前**量下 root.scrollTop，把自己钉在 top:-S ——
   *      absolute 化后展示的正是用户离开瞬间看到的那一屏，而不是页面顶部；
   *      擦除揭示的底衬内容从此也是对的（此前垫底的一直是旧页顶部）。
   *   ② 新页（挂载时 leaving=false）：复位 root.scrollTop。
   * 行动页子 tab 互切（todos⇄activities 同 key 同实例）leaving 不变，effect 不重跑，
   * 阅读位置照旧不被冲掉——与旧行为一致。复活（reviving，leaving→false）也走 ②。
   */
  /**
   * 离场冻结几何（v2.7.0.3 三稿）：离场瞬间量下壳的视口 rect（top/left/width），
   * fixed 壳就钉在这个几何上——像素级复刻用户离开时看到的画面。
   * 此前二稿用 fixed inset-x-0 top-0 + 内层 -frozenTop 位移：inset-x-0 是**视口**全宽，
   * 而壳原本活在 main 的 px-4 / safe-area padding / md:ml-60 内容盒里——转场瞬间旧页
   * 变宽上移、内容重排，观感就是「切换时莫名其妙的缩放」（用户上报）。量 rect 发生在
   * 滚动复位之前（离场页 layout effect 树序先于新页，见下方注释），量到的正是离开
   * 瞬间的几何，frozenTop/内层位移机制随之整体退役。
   */
  /** 本壳左上角的视口坐标（滚动复位后量）：垫底层里装饰复刻份的锚点校正用，见下 */
  const [shellPos, setShellPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    const el = shellRef.current;
    if (leaving) {
      // 冻结几何直接手写到 DOM，**不走 state**（v2.7.0.3 四稿）：此前 setFrozenRect 在
      // layout effect 里 setState，React 会在 paint 前同步再渲染一整轮——新页（P5 首页
      // 这类重树）被 double render，framer 的 stagger 入场起步被推后，再叠上圆擦的全页
      // 重绘，真机上入场块全程停在屏外等主线程（用户截图实锤「内容晚很多才出现」）。
      // 几何从 main 的 padding box 推导（壳的流内几何 ≡ main 内容盒：PageSwitcher 是
      // main 唯一子、壳是其首子），零样式还原、单次读取；React 不管理 top/left/width
      // 这几个键（style prop 从未含有），后续 re-render 不会清掉手写值。
      const main = document.querySelector('main');
      if (el) {
        if (main) {
          const r = main.getBoundingClientRect();
          const cs = getComputedStyle(main);
          const padL = parseFloat(cs.paddingLeft) || 0;
          el.style.top = `${r.top + (parseFloat(cs.paddingTop) || 0)}px`;
          el.style.left = `${r.left + padL}px`;
          el.style.width = `${main.clientWidth - padL - (parseFloat(cs.paddingRight) || 0)}px`;
        } else {
          el.style.top = '0px';
          el.style.left = '0px';
          el.style.width = '100vw';
        }
      }
    } else {
      if (el) {
        el.style.top = '';
        el.style.left = '';
        el.style.width = '';
      }
      if (root && root.scrollTop !== 0) root.scrollTop = 0;
      // 量壳位必须在滚动复位**之后**（同一 effect 保序）：壳的视口位置随滚动走
      if (origin && shellRef.current) {
        const r = shellRef.current.getBoundingClientRect();
        setShellPos({ x: r.left, y: r.top });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);
  /**
   * 垫底层驻留淡出（v2.7.0.3，「切页闪烁」的收尾针）。
   *
   * 此前 done 的同一次 commit 里三件事同时发生：裁切撤除 + 垫底层卸载 + 旧页出栈。
   * 页面本体是透明的——垫层一卸，页面底下瞬间从「垫层里的复刻舞台」换成「活舞台」，
   * 复刻份与活层但凡有一点相位/颜色差（背景动画在低端机上会被卡出相位漂移），
   * 这一换就是一帧全屏闪变；旧页出栈的重排也恰好挤在同一帧。
   * 现在垫层在 done 后原样多驻留 200ms（旧页在它的不透明掩护下出栈），再用 240ms
   * 淡出——换底从一帧硬切变成软融，相位差被摊进渐变里。垫层 pointer-events-none
   * 且在页面内容之下（zIndex -1），驻留期间不挡任何交互。
   */
  const [backingFade, setBackingFade] = useState(false);
  const [backingGone, setBackingGone] = useState(false);
  useEffect(() => {
    if (!origin || backingGone) return;
    if (leaving) { setBackingGone(true); return; }
    if (phase !== 'done') return;
    const t1 = window.setTimeout(() => setBackingFade(true), 200);
    const t2 = window.setTimeout(() => setBackingGone(true), 480);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, leaving]);
  const masked = !!origin && !backingGone;
  return (
    <motion.div
      ref={shellRef}
      /**
       * 离场壳（v2.7.0.3 传染性过滚修复，二稿）：原先是 absolute + top:-frozenTop 的
       * **整页高**盒子——绝对定位元素的溢出计入 #root 的 scrollHeight，转场在途的
       * 520~1150ms 里滚动区被撑到旧页大小：切页后立刻快滑就滚进透明旧页的"空白区"，
       * 旧页出栈 scrollHeight 骤缩、滚动位置超界 = 弹回卡死，且每次切页都有窗口。
       * 一稿用 h-screen+overflow-hidden 裁切壳，过滚是治住了，但矩形硬裁把离场页的
       * 出血装饰切出一圈空白、长页离场画面被切成一屏（用户上报「外圈方形错误裁切/
       * 羁绊页下半方框」）。二稿改 **fixed**——fixed 脱离滚动布局、天然不计入
       * scrollHeight（过滚仍治），且完全不需要裁切；但 inset-x-0 是视口全宽，丢了
       * main 内容盒的 padding，旧页转场瞬间变宽上移（「莫名其妙的缩放」）。
       * 三稿：fixed + **离场瞬间的冻结几何**（四稿起由 layout effect 直接手写
       * top/left/width 到 DOM，不走 state，见上方 effect 注释）——壳钉在离开画面的
       * 原几何上，宽度/位置逐像素不变。
       * fixed 的包含块劫持在此无虞：本壳无 transform/clip-path（framer 只动 opacity），
       * 壳内旧页自己的 fixed 装饰仍相对视口，与原 absolute 时代行为一致。
       */
      className={leaving ? 'pointer-events-none fixed z-0' : 'relative z-[1]'}
      aria-hidden={leaving || undefined}
      // clip-path 不在这里声明：蒙版全程由上方 effect 手写 el.style（原生 CSS
      // transition），JSX/framer 只碰 opacity——两条通道井水不犯河水
      animate={{ opacity: leaving && (!holdStatic || forceFade) ? 0 : 1 }}
      transition={{ opacity: { duration: 0.18 } }}
    >
      {/* 恒存直通层（避免 leaving 切换时子树 remount）：三稿后壳自身已钉在冻结几何上，
          此层不再承担位移 */}
      <div>
      {/* 擦除期给新页垫一层不透明舞台底。页面本体自己是透明的（底色由 App 根铺），
          不垫底的话圆内是"新页压在旧页上"的重影而不是擦除。
          垫层在 clip 之内（跟着圆一起长），所以不会出现整屏白幕；四周出血盖住 main
          的左右内边距与短页下方，避免边缘漏出旧页。
          stageDecor：把全局背景装饰层原样复刻一份进来。装饰是 fixed inset-0，两份
          落点完全重合——不复刻的话垫底层会把它盖成纯色，擦除结束垫层一卸，装饰"跳"
          回来就是用户看到的"背景错误闪烁"。 */}
      {masked && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            // bottom 原是 -2000（盖住"比新页高的旧页从底部露出"）——离场壳改为视口高
            // 裁切壳后旧页永不超底，这 2000px 的向下出血反而成了转场期的过滚源
            //（absolute 溢出计入 scrollHeight），收敛到 0；左右/顶部出血照旧（顶部与
            // 横向溢出不产生滚动区，由 main 的 overflow-x:clip 兜横向）。
            left: -40, right: -40, top: -40, bottom: 0, zIndex: -1,
            background: measuredBg ?? stageBg,
            // 驻留淡出（见上方 backingFade 注释）：done 后 200ms 原样撑住、240ms 融走
            opacity: backingFade ? 0 : 1,
            transition: 'opacity 0.24s linear',
          }}
        >
          {/* 复刻装饰的锚点校正（v2.7.0.2g，黄主题残余闪烁的真根因与正解）：
              复刻份内部是 fixed inset-0，而揭示期间本壳带 clip-path——clip-path 会劫持
              fixed 后代的包含块：复刻份被错位锚在壳上（右移/下移一个页边距+页头的量），
              done 撤裁切的瞬间又跳回视口锚——巨弧/花剪影可见地跳一下。装饰本是全页一致
              的静态层，正解不是遮掩跳变（v2.7.0.2f 曾改成 done 即撤+淡入，用户裁决：
              「没必要加淡入，它们本来就不该动」），而是让复刻份**始终**与活装饰逐像素
              重合：套一层带 transform 的包装（任何非 none 的 transform 自身就是 fixed
              后代的包含块，裁切在与不在都轮不到壳），包装按量得的壳位反偏移、恰好铺满
              视口——复刻份与活装饰全程重合，垫底层怎么卸怎么淡都不可见。 */}
          {shellPos && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 40 - shellPos.x,
                top: 40 - shellPos.y,
                width: '100vw',
                height: '100vh',
                transform: 'translate(0px)',
              }}
            >
              {stageDecor}
            </div>
          )}
        </div>
      )}
      {children}
      </div>
    </motion.div>
  );
};

const PageSwitcher = ({ current, stageBg, stageDecor, render }: {
  current: string; stageBg: string; stageDecor?: ReactNode; render: (page: string) => ReactNode;
}) => {
  /**
   * 页面栈。**每个 key 至多一条** —— 这是本组件最重要的不变量。
   *
   * 之前是"旧条目标 leaving + 直接 push 新条目"，来回快点同两个 tab 时
   * （1 秒 3~4 下，用户上报）栈会变成 [A, B] → [B, A] → [A, B]…：
   * React 按 key 复用实例并**交换顺序**，于是刚才那张 leaving 的被原地复活成 active，
   * 却带着上一次挂载的内部状态（origin/revealing 都是旧的、不会再擦一次），
   * 而新变 leaving 的那张又在 holdStatic 里等一个永远不来的擦除 —— 两张都不透明，叠住。
   *
   * 现在遇到"目标页已在栈里"就**原地复活**它（reviving=true 告诉即将离场的那张：
   * 别等擦除了，直接淡出），而不是再压一条同 key 的进来。
   */
  const [stack, setStack] = useState<Array<{ key: string; id: string; leaving: boolean; reviving: boolean }>>(() => [
    { key: normPageKey(current), id: current, leaving: false, reviving: false },
  ]);
  const pruneTimer = useRef<number | null>(null);
  const prune = useCallback(() => setStack((prev) => (prev.some((p) => p.leaving) ? prev.filter((p) => !p.leaving) : prev)), []);
  // 切页的滚动复位不在这里做了（v2.7.0.2）：按 current 键控会比换栈早一拍 commit，
  // 那一帧旧页还是唯一在场的页、却被拽回顶部——正是「转场时上一个页面闪一帧」。
  // 现在由 PageShell 在换栈 commit 内自理：离场页先量 scrollTop 冻结自身（top:-S），
  // 新页挂载再复位——见 PageShell 里 frozenTop 的注释。
  useEffect(() => {
    const key = normPageKey(current);
    // 本次 current 变化是否由幕布演出的 midpoint 引发（v2.7.0.2d 事件驱动标记，
    // 见 transitionDirector.consumeCurtainMidpoint 注释）：是 → **原子换页**，直接
    // 只留新页、不留 leaving 垫底。旧判据「幕布此刻是否正遮着屏」是定时窗口，
    // 本 effect 被卡到窗口外就退回旧页 0.18s 淡出——幕布已离场，半透明残影叠在
    // 新页上，正是「偶尔切页旧页闪一下」。标记不参与竞速：effect 多晚都消费得到。
    const atomicSwap = consumeCurtainMidpoint();
    setStack((prev) => {
      const top = prev[prev.length - 1];
      // 同页（含 todos→actions 归一）：仅同步 id，保持实例
      if (top.key === key) return top.id === current ? prev : [...prev.slice(0, -1), { ...top, id: current }];
      if (atomicSwap) {
        // 目标页在栈里则复活其实例（保持内部状态），否则全新；其余全部立即出栈
        const existing = prev.find((p) => p.key === key);
        return [existing ? { ...existing, id: current, leaving: false, reviving: true } : { key, id: current, leaving: false, reviving: false }];
      }
      // 目标页仍在栈里（连点回头）：原地复活它，其余全部标 leaving 且不等擦除
      const existing = prev.find((p) => p.key === key);
      if (existing) {
        return [
          ...prev.filter((p) => p.key !== key).map((p) => ({ ...p, leaving: true, reviving: true })),
          { ...existing, id: current, leaving: false, reviving: true },
        ];
      }
      // 常规切页：清掉上一轮残留的 leaving，当前顶置为 leaving 垫底、新页压顶
      return [
        ...prev.filter((p) => !p.leaving).map((p) => ({ ...p, leaving: true, reviving: false })),
        { key, id: current, leaving: false, reviving: false },
      ];
    });
    // 兜底出栈（新页没有圆擦除时走这条）；有擦除时由 onRevealed 提前收。
    // ⚠️ 擦除在途时兜底必须让路（v2.7.0.2e）：擦除正常完成在 ~533ms（onRevealed 收），
    // 被卡时启动保险丝还能再推最多 500ms——而旧口径 520ms 的兜底会**先到**：旧页在
    // 圆还没扩满时被提前抽走，圆外区域闪一帧裸舞台底。黄主题的亮黄底 + 满屏字卡
    // 最放大这一闪（用户上报「小标题等元素闪、黄主题尤甚」的一份）。兜底只须兜
    //「onRevealed 永远不来」的病态场景，擦除在途时放到 1150ms（500+460+40+余量）之外。
    if (pruneTimer.current) clearTimeout(pruneTimer.current);
    const wipeInFlight = bold && !!consumePendingCircleReveal();
    pruneTimer.current = window.setTimeout(prune, wipeInFlight ? 1150 : PAGE_HOLD_MS);
    return () => {
      if (pruneTimer.current) clearTimeout(pruneTimer.current);
    };
  }, [current, prune]);
  // 本轮切页是否登记过水波纹原点：只在 current 变化时取一次快照，
  // 不要让每张 shell 各问一遍（各问各的会拿到不同答案，正是叠页的来源之一）。
  // D0 下 PageShell 不放圆擦除（见其 origin 初始化），这里同口径按"无擦除"走，
  // 否则旧页会垫底空等一个不会来的擦除（虽有 260ms forceFade 兜底，但何必）
  const bold = useBoldness();
  const hasPendingWipe = bold && !!consumePendingCircleReveal();
  return (
    <div className="relative">
      {stack.map((p) => (
        <PageShell
          key={p.key}
          leaving={p.leaving}
          // 只有"新页确实会放圆形擦除"时，离场页才值得原样垫底等着被盖掉。
          // 复活场景（reviving）不会再擦一次 —— 必须直接淡出，否则两张页面都留在屏上。
          coveredByWipe={!p.reviving && hasPendingWipe}
          stageBg={stageBg}
          stageDecor={stageDecor}
          // 擦除一到位就把旧页出栈。原先固定等 PAGE_HOLD_MS(520ms)，比擦除(420ms)晚
          // 100ms——这段时间垫底层已卸、旧页还在，比新页高的部分就从底部露出来一帧
          //（用户上报的"转完后底部闪一下原来的界面"）。
          onRevealed={p.leaving ? undefined : prune}
        >
          {render(p.id)}
        </PageShell>
      ))}
    </div>
  );
};

/**
 * 全局宣告·达成结算屏：渲染在 App 顶层，确保用户在任何页面完成最后一项关联待办时
 * 都能立即看到 cut-in，不需要先回到 Dashboard。
 *
 * 选择策略：
 *   - 取最早 archivedAt 的"已归档但 cutInShown=false"那张卡
 *   - 关闭时调 markCallingCardCutInShown，下一张自然顶上来
 */
const GlobalCallingCardCutIn = () => {
  const callingCards = useAppStore(s => s.callingCards);
  const pending = callingCards
    .filter(c => c.archived && c.cutInShown === false)
    .sort((a, b) => {
      const ta = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
      const tb = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
      return ta - tb;
    })[0] ?? null;

  const [activeId, setActiveId] = useState<string | null>(null);
  // 当队首切换时（新归档进入 / 当前一张关闭）把 activeId 同步到队首
  useEffect(() => {
    if (pending && pending.id !== activeId) setActiveId(pending.id);
    if (!pending && activeId) setActiveId(null);
  }, [pending, activeId]);

  return (
    <CallingCardCutIn
      card={pending}
      onClose={() => {
        // markCallingCardCutInShown 在 CutIn 内部已调用；这里只是触发 state 切换
        setActiveId(null);
      }}
    />
  );
};

/** 订阅 cloudStore.conflictPending 全局呈现冲突解决弹窗 */
const GlobalConflictDialog = () => {
  const pending = useCloudStore(s => s.conflictPending);
  const setPending = useCloudStore(s => s.setConflictPending);
  return (
    <ConflictDialog
      isOpen={pending}
      onClose={() => setPending(false)}
      onKeepLocal={async () => {
        await resolveConflictKeepLocal();
        setPending(false);
      }}
      onKeepCloud={async () => {
        await resolveConflictKeepCloud();
        setPending(false);
      }}
    />
  );
};

/** 订阅 cloudStore.diffWarning 全局呈现条目差异提示 */
const GlobalDiffDialog = () => {
  const diff = useCloudStore(s => s.diffWarning);
  const setDiff = useCloudStore(s => s.setDiffWarning);
  return (
    <SyncDiffDialog
      isOpen={!!diff}
      diff={diff}
      onKeepLocal={async () => {
        await acceptDiffKeepLocal();
        setDiff(null);
      }}
      onKeepCloud={async () => {
        await acceptDiffKeepCloud();
        setDiff(null);
      }}
      onDismiss={() => setDiff(null)}
    />
  );
};

export default App;
