import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { LongReading } from '@/types';
import { PageTitle } from '@/components/PageTitle';
import { DailyDraw } from '@/components/astrology/DailyDraw';
import { LongReadingFlow } from '@/components/astrology/LongReadingFlow';
import { ReadingArchive } from '@/components/astrology/ReadingArchive';

type Tab = 'daily' | 'long' | 'archive';

export function Astrology() {
  const { setCurrentPage, loadDailyDivination, loadLongReadings, sweepExpiredReadings, longReadings } = useAppStore();
  const [tab, setTab] = useState<Tab>('daily');

  // 选中的归档项（进入详情）
  const [detailReading, setDetailReading] = useState<LongReading | null>(null);

  useEffect(() => {
    void loadDailyDivination();
    void loadLongReadings().then(() => sweepExpiredReadings());
  }, []);

  const tabs: Array<{ id: Tab; label: string; hint: string }> = [
    { id: 'daily',   label: '今日塔罗', hint: '每日一抽' },
    { id: 'long',    label: '中长期占卜', hint: '14 天' },
    { id: 'archive', label: '档案',     hint: `${longReadings.length}` },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-xl mx-auto space-y-5"
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCurrentPage('dashboard')}
          className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center text-lg"
          aria-label="返回首页"
        >‹</button>
        <PageTitle title="星象" en="Arcana" />
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5">
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setDetailReading(null); }}
              className={`relative py-2.5 rounded-xl text-xs font-bold transition-all ${
                active
                  ? 'bg-white dark:bg-gray-900 text-primary shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <div>{t.label}</div>
              <div className={`text-[10px] mt-0.5 font-normal ${active ? 'text-gray-400' : 'text-gray-400/70'}`}>
                {t.hint}
              </div>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'daily' && (
          <motion.div
            key="daily"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pb-8"
          >
            <DailyDraw />
          </motion.div>
        )}

        {tab === 'long' && !detailReading && (
          <motion.div
            key="long"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pb-8"
          >
            <LongReadingFlow onBack={() => setTab('archive')} />
          </motion.div>
        )}

        {tab === 'long' && detailReading && (
          <motion.div
            key="long-detail"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pb-8"
          >
            <LongReadingFlow
              initialReading={detailReading}
              onBack={() => setDetailReading(null)}
            />
          </motion.div>
        )}

        {tab === 'archive' && !detailReading && (
          <motion.div
            key="archive"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pb-8"
          >
            <ReadingArchive onOpen={r => { setDetailReading(r); setTab('long'); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
