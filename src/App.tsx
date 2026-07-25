import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
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
import { AchievementUnlockModal } from '@/components/AchievementUnlockModal';
import { SkillUnlockModal } from '@/components/SkillUnlockModal';
import { db } from '@/db';
import { Dashboard } from '@/pages/Dashboard';
// P3R（蓝主题）页面变体：p3-redraw 设计稿 1:1（channel==='p3' 时替换默认形态）
import { DashboardP3 } from '@/pages/p3/DashboardP3';
import { useUiChannel } from '@/ui/useUiChannel';
import { Achievements } from '@/pages/Achievements';
const Statistics = lazy(() => import('@/pages/Statistics').then(m => ({ default: m.Statistics })));
import { Settings } from '@/pages/Settings';
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
// 无气力症治疗终端（F3）
const Terminal = lazy(() => import('@/pages/Terminal').then(m => ({ default: m.Terminal })));
import { BattleArena } from '@/components/battle/BattleArena';
import { TerminalClearCutIn } from '@/components/terminal/TerminalClearCutIn';
// F6 黑猫对话窗（portal 到 body 的全屏 overlay；入口在 Sidebar / BottomNav 中央 ◈）
import { NavigatorWindow } from '@/components/navigator/NavigatorWindow';
import { primeCurrentTheme } from '@/utils/feedback';
import { BackgroundAnimation } from '@/components/BackgroundAnimation';
import { PWAUpdateToast } from '@/components/PWAUpdateToast';
import { CallingCardCutIn } from '@/components/callingCard/CallingCardCutIn';
import { isNative } from '@/utils/native';
import { tryHandleBack } from '@/utils/useBackHandler';
import { initBoldnessRuntime, schedulePerfSample, setStraightenMode } from '@/utils/boldness';
import { SlantTuner } from '@/components/dev/SlantTuner';
import { StarTearDemo } from '@/components/dev/StarTearDemo';
import { PersonaGallery } from '@/components/dev/PersonaGallery';
import { TransitionLayer } from '@/components/transition/HeavyTransition';
import { consumePendingCircleReveal } from '@/ui/transitionDirector';
import { P4StageDecor } from '@/ui/p4Kit';

/**
 * 页面分包预热清单。
 *
 * 上面这些页走 lazy()，chunk 直到首次导航才开始下载——用户感知就是"第一次点进某个页
 * 要顿一下、先闪一下『加载中…』"（用户上报的首开卡顿）。这里把同样的动态 import 再列
 * 一份：Vite 对同一模块说明符的 import() 是同一个 chunk，预热完 lazy() 的 promise 立刻
 * resolve，导航零等待。
 *
 * 节奏：首屏画完 + 空闲后才逐个取，一次一个，不和首屏抢带宽/主线程。
 * 顺序按底部导航的使用频度排（行动 / 菜单最常点）。
 */
const PAGE_CHUNKS: Array<() => Promise<unknown>> = [
  () => import('@/pages/Actions'),
  () => import('@/pages/Menu'),
  () => import('@/pages/Cooperation'),
  () => import('@/pages/Statistics'),
  () => import('@/pages/Astrology'),
  () => import('@/pages/Ledger'),
  () => import('@/pages/Account'),
  () => import('@/pages/Terminal'),
];

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
  const { currentPage, initializeApp, user, levelUpNotification, setLevelUpNotification, achievementNotification, setAchievementNotification, skillNotification, setSkillNotification, settings, modalBlocker } = useAppStore();
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

  // 页面分包预热：首屏画完 + 空闲后逐个把 lazy 页的 chunk 拉进模块表，
  // 消掉"第一次点进某页要等 chunk、先闪一下加载中"的首开卡顿（见 PAGE_CHUNKS 注释）。
  useEffect(() => {
    if (isLoading || showSplash || !user) return;
    let cancelled = false;
    let i = 0;
    const step = () => {
      if (cancelled || i >= PAGE_CHUNKS.length) return;
      PAGE_CHUNKS[i++]()
        .catch(() => { /* 预热失败不影响真正导航时的重试 */ })
        .then(() => { if (!cancelled) onIdle(step); });
    };
    const kick = window.setTimeout(() => onIdle(step), 1200);
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
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
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
  // body 的背景色 —— 修复 iOS PWA standalone 模式下安全区白色条带
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

  // iOS PWA standalone has its own safe-area handling. Mark it from JS because
  // display-mode media queries are not reliable across all iOS 26 PWA launches.
  useEffect(() => {
    if (isStandalonePwa()) {
      document.documentElement.dataset.iosStandalone = 'true';
    } else {
      delete document.documentElement.dataset.iosStandalone;
    }
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

  const renderPage = (page: string) => {
    switch (page) {
      case 'dashboard':
        return uiChannel === 'p3' ? <DashboardP3 /> : <Dashboard />;
      // 'todos'/'activities' 是合并前的旧路由 id：散落的 setCurrentPage('todos') 调用点
      // （问候卡提示条等）继续可用，Actions 内部会按旧 id 落到对应子页并归一为 'actions'
      case 'actions':
      case 'todos':
      case 'activities':
        return <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}><Actions /></Suspense>;
      case 'achievements':
        return <Achievements />;
      case 'statistics':
        return <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}><Statistics /></Suspense>;
      case 'settings':
        return <Settings />;
      case 'battle':
        return <BattleArena />;
      case 'astrology':
        return <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}><Astrology /></Suspense>;
      case 'cooperation':
        return <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}><Cooperation /></Suspense>;
      case 'menu':
        return <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}><Menu /></Suspense>;
      case 'account':
        return <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}><Account /></Suspense>;
      case 'ledger':
        return <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}><Ledger /></Suspense>;
      case 'terminal':
        return <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400">加载中…</div>}><Terminal /></Suspense>;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className={`min-h-screen ${settings.darkMode ? 'dark' : ''}`}>
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
          // P4 黄频道：舞台平面直接铺 --ui-bg（p4-redraw 定稿），暗色也保持黄
          style={user?.theme === 'yellow' ? { background: 'var(--ui-bg, #ffd900)' } : undefined}
        >
          {/* 背景图片 */}
          {settings.backgroundImage && (
            <div 
            className="fixed inset-0 bg-cover bg-center bg-no-repeat"
            style={{ 
              backgroundImage: `url(${settings.backgroundImage})`,
              backgroundSize: settings.backgroundOrientation === 'landscape' ? '100% auto' : 'auto 100%',
              opacity: settings.backgroundOpacity ?? 0.3
            }}
            />
          )}

          {/* 背景动画（无背景图时，优先于纹理） */}
          {!settings.backgroundImage && (settings.backgroundAnimation ?? []).length > 0 && (
            // 用独立 will-change 容器包裹，使背景动画层与页面切换（AnimatePresence）
            // 产生的 stacking context 完全隔离，避免页面转场时背景闪烁
            <div style={{ isolation: 'isolate', willChange: 'transform', position: 'fixed', inset: 0, zIndex: 0 }}>
              <BackgroundAnimation
                styles={settings.backgroundAnimation as string[]}
                darkMode={settings.darkMode}
              />
            </div>
          )}

          {/* 装饰纹理（无背景图、无动画时；P4 黄舞台要真留白，不铺点阵） */}
          {!settings.backgroundImage
            && (settings.backgroundAnimation ?? []).length === 0
            && (settings.backgroundPattern ?? true)
            && user?.theme !== 'yellow'
            && (
              <div
                className="fixed inset-0 pointer-events-none select-none"
                style={{
                  backgroundImage: `radial-gradient(circle, ${settings.darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.055)'} 1px, transparent 1px)`,
                  backgroundSize: '24px 24px',
                }}
              />
            )
          }

          {/* P4 黄舞台背景装饰：巨型橙弧环 + 大花剪影 + 四角星，缓解纯黄大面积平铺 */}
          {user?.theme === 'yellow' && <P4StageDecor />}

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
                className="md:ml-60 px-4 md:px-8 pt-[calc(1rem+env(safe-area-inset-top))] md:pt-8 pb-[calc(4rem+var(--app-bottom-safe-padding,env(safe-area-inset-bottom,0px))+0.5rem)] md:pb-8"
              >
                {/* 页面双缓冲切换：水波纹导航=旧页垫底+新页圆形擦除（页对页，无背景闪白）；
                    普通导航=交叉淡化 */}
                <PageSwitcher
                  current={currentPage}
                  // 与 App 根的舞台底色同源（黄频道走 --ui-bg，其余走 gray-50 / gray-900）
                  stageBg={user?.theme === 'yellow' ? 'var(--ui-bg, #ffd900)' : settings.darkMode ? '#111827' : '#f9fafb'}
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

               {/* PWA 新版本更新提示 */}
               <PWAUpdateToast />
            </>
          )}

          {/* 云同步：浮动状态徽章 + 冲突解决弹窗（全局，无论 WelcomeModal 或主界面都可见） */}
          <SyncStatusBadge />
          <GlobalConflictDialog />
          <GlobalDiffDialog />
          {/* 斜界 dev 调参面板：仅开发环境，tweakpane 动态 import 不进生产包 */}
          {import.meta.env.DEV && <SlantTuner />}
          {/* 星形撕页转场 dev 演示触发器：仅开发环境，真机点按钮看实跑 */}
          {import.meta.env.DEV && <StarTearDemo />}
          {/* P7.3 UI 原语样品间：仅开发环境，三频道实时切换验收 src/ui 组件 */}
          {import.meta.env.DEV && <PersonaGallery />}
          {/* P8.2 重转场演出层：订阅 transitionDirector，轮盘跳转/仪式点经此播频道幕布 */}
          <TransitionLayer />
          {/* 宣告 · 达成 全屏结算屏：放在 App 顶层是为了"完成最后一项 todo 时立即弹出"，
              即便用户当时不在 Dashboard 也能看到 */}
          <GlobalCallingCardCutIn />
          {/* F3 终端任务「我做到了」结算屏（独立于宣告卡 cut-in） */}
          <TerminalClearCutIn />
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
/** 旧路由 id todos/activities 与 actions 同页，归一避免瞬间误 remount */
const normPageKey = (id: string) => (id === 'todos' || id === 'activities' ? 'actions' : id);

const PageShell = ({ leaving, stageBg, children }: { leaving: boolean; stageBg: string; children: ReactNode }) => {
  const [origin] = useState(consumePendingCircleReveal); // 入场时查询一次（读取不清除，StrictMode 双挂载安全）
  const [revealing, setRevealing] = useState(!!origin);
  // 变 leaving 的瞬间若仍在水波纹窗口内：保持原样垫底等着被新页擦除盖掉；否则交叉淡出
  const holdStatic = leaving && !!consumePendingCircleReveal();
  const R = origin
    ? Math.ceil(Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y)) * 1.06)
    : 0;
  return (
    <motion.div
      className={leaving ? 'pointer-events-none absolute inset-x-0 top-0 z-0' : 'relative z-[1]'}
      aria-hidden={leaving || undefined}
      initial={origin ? { clipPath: `circle(0px at ${origin.x}px ${origin.y}px)` } : false}
      animate={{
        clipPath: origin && revealing ? `circle(${R}px at ${origin.x}px ${origin.y}px)` : 'none',
        opacity: leaving && !holdStatic ? 0 : 1,
      }}
      transition={{
        clipPath: revealing ? { duration: 0.42, ease: [0.3, 0, 0.2, 1] } : { duration: 0 },
        opacity: { duration: 0.18 },
      }}
      onAnimationComplete={() => setRevealing(false)}
    >
      {/* 擦除期给新页垫一层不透明舞台底。页面本体自己是透明的（底色由 App 根铺），
          不垫底的话圆内是"新页压在旧页上"的重影而不是擦除——用户上报的"圆形擦除
          蒙版没有正确响应"就是这个：两页标题字直接叠在一起。
          垫层在 clip 之内（跟着圆一起长），所以不会出现整屏白幕；四周出血盖住 main
          的左右内边距与短页下方，避免边缘漏出旧页。 */}
      {origin && revealing && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: -40, right: -40, top: -40, bottom: -2000, zIndex: -1, background: stageBg }}
        />
      )}
      {children}
    </motion.div>
  );
};

const PageSwitcher = ({ current, stageBg, render }: { current: string; stageBg: string; render: (page: string) => ReactNode }) => {
  const [stack, setStack] = useState<Array<{ key: string; id: string; leaving: boolean }>>(() => [
    { key: normPageKey(current), id: current, leaving: false },
  ]);
  const pruneTimer = useRef<number | null>(null);
  useEffect(() => {
    const key = normPageKey(current);
    setStack((prev) => {
      const top = prev[prev.length - 1];
      // 同页（含 todos→actions 归一）：仅同步 id，保持实例
      if (top.key === key) return top.id === current ? prev : [...prev.slice(0, -1), { ...top, id: current }];
      // 切页：先清掉上一轮残留的 leaving，再把当前顶置为 leaving 垫底、新页压顶
      return [...prev.filter((p) => !p.leaving).map((p) => ({ ...p, leaving: true })), { key, id: current, leaving: false }];
    });
    if (pruneTimer.current) clearTimeout(pruneTimer.current);
    pruneTimer.current = window.setTimeout(() => setStack((prev) => prev.filter((p) => !p.leaving)), PAGE_HOLD_MS);
    return () => {
      if (pruneTimer.current) clearTimeout(pruneTimer.current);
    };
  }, [current]);
  return (
    <div className="relative">
      {stack.map((p) => (
        <PageShell key={p.key} leaving={p.leaving} stageBg={stageBg}>
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
