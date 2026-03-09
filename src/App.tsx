import { useEffect, useState, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore, toLocalDateKey } from '@/store';
import { Sidebar, BottomNav } from '@/components/Navigation';
import { WelcomeModal } from '@/components/WelcomeModal';
import { LevelUpModal } from '@/components/LevelUpModal';
import { SplashScreen } from '@/components/SplashScreen';
import { AchievementUnlockModal } from '@/components/AchievementUnlockModal';
import { SkillUnlockModal } from '@/components/SkillUnlockModal';
import { Dashboard } from '@/pages/Dashboard';
import { Activities } from '@/pages/Activities';
import { Achievements } from '@/pages/Achievements';
import { Statistics } from '@/pages/Statistics';
import { Settings } from '@/pages/Settings';
import { Todos } from '@/pages/Todos';
import { primeCurrentTheme } from '@/utils/feedback';
import { BackgroundAnimation } from '@/components/BackgroundAnimation';

function App() {
  const { currentPage, initializeApp, user, levelUpNotification, setLevelUpNotification, achievementNotification, setAchievementNotification, skillNotification, setSkillNotification, settings, modalBlocker } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const primedRef = useRef(false);
  // 记录上次打开时的日期，用于检测隔天回来
  const lastDateRef = useRef(toLocalDateKey());

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

  // 切回前台时检查日期是否推进，若推进则重载数据（修复隔天打开不刷新）
  useEffect(() => {
    const { loadData, generateDailyEvent } = useAppStore.getState();

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;
      const today = toLocalDateKey();
      if (today !== lastDateRef.current) {
        lastDateRef.current = today;
        await loadData();
        await generateDailyEvent();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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

  if (showSplash) {
    return <SplashScreen isVisible={showSplash} onComplete={() => setShowSplash(false)} />;
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
        return <Statistics />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className={`min-h-screen ${settings.darkMode ? 'dark' : ''}`}>
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
              
              <main className="md:ml-60 p-4 md:p-8 pb-24 md:pb-8">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
