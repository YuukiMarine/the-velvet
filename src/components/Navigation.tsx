import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '@/store';
import { triggerNavFeedback } from '@/utils/feedback';

// SVG 图标组件
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

const CheckIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={filled ? 0 : 1.8} stroke="currentColor" className="w-6 h-6">
    {filled ? (
      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" fill="currentColor" clipRule="evenodd" />
    ) : (
      <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

const PenIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={filled ? 0 : 1.8} stroke="currentColor" className="w-6 h-6">
    {filled ? (
      <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z" fill="currentColor" />
    ) : (
      <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" strokeLinecap="round" strokeLinejoin="round" />
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

const SettingsIcon = ({ filled }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth={filled ? 0 : 1.8} stroke="currentColor" className="w-6 h-6">
    {filled ? (
      <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" fill="currentColor" clipRule="evenodd" />
    ) : (
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

// 5个核心导航项（统计并入首页，技能并入成就）
const navItems = [
  { id: 'dashboard', label: '首页', Icon: HomeIcon },
  { id: 'todos', label: '待办', Icon: CheckIcon },
  { id: 'activities', label: '记录', Icon: PenIcon },
  { id: 'achievements', label: '成就', Icon: TrophyIcon },
  { id: 'settings', label: '设置', Icon: SettingsIcon },
];

export const Sidebar = () => {
  const { currentPage, setCurrentPage } = useAppStore();

  return (
    <motion.aside
      initial={{ x: -280 }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="hidden md:flex md:flex-col md:w-60 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 h-screen fixed left-0 top-0 shadow-sm"
    >
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
            <img src="/icon.png" alt="靛蓝色房间" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-none">靛蓝色房间</h1>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">成长追踪器</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 pb-4 space-y-0.5">
        {navItems.map((item) => {
          const active = currentPage === item.id;
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                triggerNavFeedback();
                setCurrentPage(item.id);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer ${
                active
                  ? 'bg-primary/10 dark:bg-primary/15 text-primary'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <item.Icon filled={active} />
              <span className={`text-sm font-medium ${active ? 'font-semibold' : ''}`}>{item.label}</span>
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="ml-auto w-1 h-5 bg-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </nav>
    </motion.aside>
  );
};

export const BottomNav = () => {
  const { currentPage, setCurrentPage } = useAppStore();

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-100 dark:border-gray-800 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center h-16">
        {navItems.map((item) => {
          const active = currentPage === item.id;
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.88 }}
              onClick={() => {
                triggerNavFeedback();
                setCurrentPage(item.id);
              }}
              className={`relative flex flex-col items-center justify-center flex-1 h-full gap-1 cursor-pointer transition-colors duration-150 ${
                active ? 'text-primary' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              <AnimatePresence>
                {active && (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0 }}
                    transition={{ duration: 0.18 }}
                    className="absolute top-0 w-10 h-0.5 bg-primary rounded-full"
                    style={{ left: '50%', marginLeft: '-20px', transformOrigin: 'center' }}
                  />
                )}
              </AnimatePresence>
              <item.Icon filled={active} />
              <span className={`text-[10px] leading-none ${active ? 'font-semibold' : 'font-normal'}`}>
                {item.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.nav>
  );
};
