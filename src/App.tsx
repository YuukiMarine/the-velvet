import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import { Activities } from '@/pages/Activities';
import { Achievements } from '@/pages/Achievements';
const Statistics = lazy(() => import('@/pages/Statistics').then(m => ({ default: m.Statistics })));
import { Settings } from '@/pages/Settings';
import { Todos } from '@/pages/Todos';
const Astrology = lazy(() => import('@/pages/Astrology').then(m => ({ default: m.Astrology })));
const Cooperation = lazy(() => import('@/pages/Cooperation').then(m => ({ default: m.Cooperation })));
import { BattleArena } from '@/components/battle/BattleArena';
import { primeCurrentTheme } from '@/utils/feedback';
import { BackgroundAnimation } from '@/components/BackgroundAnimation';
import { PWAUpdateToast } from '@/components/PWAUpdateToast';
import { CallingCardCutIn } from '@/components/callingCard/CallingCardCutIn';
import { isNative } from '@/utils/native';
import { tryHandleBack } from '@/utils/useBackHandler';

function App() {
  const { currentPage, initializeApp, user, levelUpNotification, setLevelUpNotification, achievementNotification, setAchievementNotification, skillNotification, setSkillNotification, settings, modalBlocker } = useAppStore();
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
      } catch (err) {
        console.error('App initialization error:', err);
        setError(err instanceof Error ? err.message : '初始化失败');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [initializeApp]);

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
    const { loadData, loadDailyDivination, sweepExpiredReadings, sweepCallingCards } = useAppStore.getState();

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
        const store = useAppStore.getState();
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

  // 同步 dark class 到 <html> 元素，使 index.css 中 html.dark 选择器可控制
  // body 的背景色 —— 修复 iOS PWA standalone 模式下安全区白色条带
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings.darkMode]);

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
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (meta) meta.content = color;
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
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

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'activities':
        return <Activities />;
      case 'achievements':
        return <Achievements />;
      case 'todos':
        return <Todos />;
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
            backgroundColor: settings.darkMode
              ? '#111827'
              : ((user?.theme === 'custom' && settings.customThemeColor) || '#f9fafb'),
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
            backgroundColor: settings.darkMode
              ? '#111827'
              : ((user?.theme === 'custom' && settings.customThemeColor) || '#f9fafb'),
          }}
        />

        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 relative">
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

          {/* 装饰纹理（无背景图、无动画时） */}
          {!settings.backgroundImage
            && (settings.backgroundAnimation ?? []).length === 0
            && (settings.backgroundPattern ?? true)
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
        
        <div className="relative z-10">
          <WelcomeModal />
          
          {user && (
            <>
              <Sidebar />
              <BottomNav />
              
              <main
                // 顶部 padding 用 calc(1rem + env(safe-area-inset-top)) 保证：
                //   - 桌面 / Android：env() 为 0，退化为 1rem（=原 p-4 行为）
                //   - iOS PWA / viewport-fit=cover：自动加上状态栏 / Dynamic Island 的高度，
                //     防止页面标题钻到"12:25 信号 电池"这条原生 UI 下面。
                //   - 桌面断点（md+）用 Tailwind 的 md:pt-8 覆盖为 2rem，安全区为 0 时无副作用。
                // 底部 padding 精确匹配 BottomNav 高度（4rem 图标区 + home-indicator 安全区），
                // 避免 iPhone home bar 设备上出现多余的灰色空白条。
                className="md:ml-60 px-4 md:px-8 pt-[calc(1rem+env(safe-area-inset-top))] md:pt-8 pb-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] md:pb-8"
              >
                <AnimatePresence mode="wait">
                  {renderPage()}
                </AnimatePresence>
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
          {/* 宣告 · 达成 全屏结算屏：放在 App 顶层是为了"完成最后一项 todo 时立即弹出"，
              即便用户当时不在 Dashboard 也能看到 */}
          <GlobalCallingCardCutIn />
        </div>
      </div>
    </div>
  );
}

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
