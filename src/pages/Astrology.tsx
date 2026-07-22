import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { LongReading } from '@/types';
import { PageTitle } from '@/components/PageTitle';
import { BackButton } from '@/components/BackButton';
import { DailyDraw } from '@/components/astrology/DailyDraw';
import { LongReadingFlow } from '@/components/astrology/LongReadingFlow';
import { ReadingArchive } from '@/components/astrology/ReadingArchive';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, P3PageHeader, slantClip } from '@/components/p3r/kit';

type Tab = 'daily' | 'long' | 'archive';

export function Astrology() {
  const { setCurrentPage, loadDailyDivination, loadLongReadings, sweepExpiredReadings, longReadings } = useAppStore();
  const [tab, setTab] = useState<Tab>('daily');
  const p3 = useUiChannel() === 'p3';

  // 选中的归档项（进入详情）
  const [detailReading, setDetailReading] = useState<LongReading | null>(null);

  useEffect(() => {
    void loadDailyDivination();
    void loadLongReadings().then(() => sweepExpiredReadings());
  }, []);

  const tabs: Array<{ id: Tab; label: string; hint: string }> = [
    { id: 'daily',   label: '今日塔罗', hint: '每日一抽' },
    { id: 'long',    label: '中长期占卜', hint: '14 天效力' },
    { id: 'archive', label: '档案',     hint: `${longReadings.length}` },
  ];

  // ── P3R（蓝频道）切换头：p3-astrology-reference-v2（双行 tab：选中蓝斜块白字+洋红角 / 未选白斜块）──
  const p3Tabs = (
    <div className="relative flex items-stretch">
      {tabs.map((t, i) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setDetailReading(null); }}
            className="relative flex-1 px-1 py-2.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
            style={{
              clipPath: slantClip(12),
              background: active ? P3R.blue : P3R.panel,
              marginLeft: i > 0 ? -7 : 0,
              zIndex: active ? 2 : 1,
            }}
          >
            <div className="text-[15px] font-black leading-tight" style={{ color: active ? '#fff' : P3R.ink }}>{t.label}</div>
            <div className="mt-0.5 text-[11px] font-semibold leading-none" style={{ color: active ? 'rgba(255,255,255,0.85)' : P3R.grey }}>{t.hint}</div>
            {active && (
              <span aria-hidden className="absolute bottom-0 right-3 h-[8px] w-[20px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
            )}
          </button>
        );
      })}
    </div>
  );

  if (p3) {
    return (
      <P3RPage className="overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative mx-auto max-w-xl space-y-5 pb-6"
        >
          <GhostWords words={['ARCANA']} className="right-[8px] top-[-12px] text-right text-[72px]" />
          <P3PageHeader ticks title="星象" onBack={() => setCurrentPage('dashboard')} className="relative pt-2" />
          {p3Tabs}

          <AnimatePresence mode="wait">
            {tab === 'daily' && (
              <motion.div key="daily" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-4">
                <DailyDraw />
              </motion.div>
            )}
            {tab === 'long' && !detailReading && (
              <motion.div key="long" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-4">
                <LongReadingFlow onBack={() => setTab('archive')} />
              </motion.div>
            )}
            {tab === 'archive' && detailReading && (
              <motion.div key="archive-detail" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-4">
                <LongReadingFlow initialReading={detailReading} onBack={() => setDetailReading(null)} />
              </motion.div>
            )}
            {tab === 'archive' && !detailReading && (
              <motion.div key="archive" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pb-4">
                <ReadingArchive onOpen={r => { setDetailReading(r); }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* 底部幽灵字 */}
          <div aria-hidden className="relative h-14">
            <GhostWords words={['DESTINY']} className="left-[6px] top-[-2px] text-[64px]" />
          </div>
        </motion.div>
      </P3RPage>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-xl mx-auto space-y-5"
    >
      <div className="flex items-center gap-2">
        <BackButton onClick={() => setCurrentPage('dashboard')} label="返回首页" />
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

        {/*
          归档详情：保持在 archive tab 下渲染，详情 onBack 退回到归档列表。
          以前 onOpen 把 tab 切到 'long' → 用户 back 后会落到"新建中长期占卜"的表单，
          不符合"看完归档应回到归档"。这里把详情挂回 archive tab。
        */}
        {tab === 'archive' && detailReading && (
          <motion.div
            key="archive-detail"
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
            <ReadingArchive onOpen={r => { setDetailReading(r); /* 不切 tab：保留在 archive */ }} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
