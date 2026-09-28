import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { SheetModal } from '@/components/SheetModal';
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { TAROT_BY_ID } from '@/constants/tarot';
import type { Activity, AttributeId, DailyDivination } from '@/types';
import { loadActivityImageIndex, useActivityImages } from '@/utils/activityImages';
import { computeOnThisDay, onThisDayLabel, type OnThisDayView } from '@/utils/onThisDay';
import { useUiChannel } from '@/ui/useUiChannel';

/**
 * 「当年今日」（第 6 轮）：今日仪式轮播里的一张小卡 + 点开后的整天回看抽屉。
 *
 * 卡片保持一行高（轮播按最高页等高，这里长了别的页都会被撑出空白），细节全放抽屉里：
 * 那天的每一条记录（时间 / 内容 / 加点 / 配图）、那天抽的牌、那时连续几天，末尾一键去记录页看那一天。
 */

/** 首页用：满一年且去年今日有记录才返回；按「今天」这个日期键缓存 */
export function useOnThisDay(): OnThisDayView | null {
  const activities = useAppStore((s) => s.activities);
  const todayKey = toLocalDateKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeOnThisDay(activities), [activities, todayKey]);
}

const ATTR_ORDER: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const timeOf = (d: Date | string) =>
  new Date(d).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

/** 卡片副标题：「记了 3 条 · 跑了 5 公里…」 */
export function onThisDaySub(view: OnThisDayView): string {
  const first = (view.items[0]?.description || '').replace(/\s+/g, ' ').trim();
  const head = first.length > 18 ? `${first.slice(0, 18)}…` : first;
  return `记了 ${view.total} 条 · ${head}`;
}

/** 轮播里的小卡：外皮由各频道首页自己画（render），抽屉在这里统一挂 */
export const OnThisDaySlide = ({
  view,
  render,
}: {
  view: OnThisDayView;
  render: (p: { title: string; sub: string; onClick: () => void }) => ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {render({ title: '一年前的今天', sub: onThisDaySub(view), onClick: () => setOpen(true) })}
      <OnThisDaySheet view={view} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};

/** 沙漏小图（P3 / P5 的仪式卡图标位用） */
export const OnThisDayGlyph = ({ color = 'currentColor', size = 22 }: { color?: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    <path d="M6 3h12v2.2c0 2.4-1.6 4.5-3.6 5.6L13 12l1.4 1.2c2 1.1 3.6 3.2 3.6 5.6V21H6v-2.2c0-2.4 1.6-4.5 3.6-5.6L11 12 9.6 10.8C7.6 9.7 6 7.6 6 5.2V3Zm2 2v.2c0 1.6 1.1 3.1 2.6 3.9l1.4.8 1.4-.8C14.9 8.3 16 6.8 16 5.2V5H8Zm4 9.1-1.4.8C9.1 15.7 8 17.2 8 18.8v.2h8v-.2c0-1.6-1.1-3.1-2.6-3.9L12 14.1Z" fill={color} />
  </svg>
);

/** 中性 / 黄频道的小卡（与「今日星象」入口卡同一套壳） */
export const OnThisDayNeutralCard = ({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) => {
  const isP4 = useUiChannel() === 'p4';
  if (isP4) {
    return (
      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full overflow-hidden rounded-2xl p-2 text-left"
      >
        <div className="flex items-start gap-2.5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: 'var(--ui-accent)' }}>
            <OnThisDayGlyph color="#131313" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-black leading-snug text-[#131313]">{title}</div>
            <div className="mt-0.5 truncate text-[11px] font-semibold leading-snug text-[var(--ui-muted)]">{sub}</div>
          </div>
        </div>
      </motion.button>
    );
  }
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative w-full overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 p-4 text-left dark:border-teal-700/40 dark:from-teal-950/40 dark:to-cyan-950/30"
    >
      <div className="absolute -right-3 -top-3 select-none text-6xl opacity-10">⏳</div>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 text-teal-700 dark:text-teal-200"><OnThisDayGlyph size={26} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-teal-800 dark:text-teal-200">{title}</div>
          <div className="mt-0.5 truncate text-[11px] text-teal-700/80 dark:text-teal-300/70">{sub}</div>
        </div>
        <div className="flex-shrink-0 text-xl text-teal-400 dark:text-teal-500">›</div>
      </div>
    </motion.button>
  );
};

const Thumbs = ({ activityId }: { activityId: string }) => {
  const images = useActivityImages(activityId);
  if (!images.length) return null;
  return (
    <div className="mt-2 flex gap-1.5">
      {images.map((im) => (
        <span key={im.id} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/5 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">
          <img src={im.thumbDataUrl} alt="" className="h-full w-full object-cover" draggable={false} loading="lazy" />
        </span>
      ))}
    </div>
  );
};

const Row = ({ a, names }: { a: Activity; names: Record<AttributeId, string> }) => {
  const pts = ATTR_ORDER.filter((k) => (a.pointsAwarded?.[k] ?? 0) > 0);
  return (
    <div className="rounded-xl bg-gray-50 px-3.5 py-3 dark:bg-gray-800/60">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-[11px] font-bold tabular-nums text-gray-400">{timeOf(a.date)}</span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-[14px] font-semibold leading-snug text-gray-800 dark:text-gray-100">
            {a.important && <span className="mr-1 text-amber-500">★</span>}
            {a.description}
          </p>
          {pts.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {pts.map((k) => (
                <span key={k} className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                  {names[k]} +{a.pointsAwarded[k]}
                </span>
              ))}
            </div>
          )}
          <Thumbs activityId={a.id} />
        </div>
      </div>
    </div>
  );
};

export const OnThisDaySheet = ({ view, isOpen, onClose }: { view: OnThisDayView; isOpen: boolean; onClose: () => void }) => {
  const settings = useAppStore((s) => s.settings);
  const activities = useAppStore((s) => s.activities);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const setActivitiesJumpDate = useAppStore((s) => s.setActivitiesJumpDate);
  const [tarot, setTarot] = useState<DailyDivination | null>(null);

  // 那天的全部记录（抽屉不止 3 条）
  const all = useMemo(() => {
    const ids = new Set(view.items.map((a) => a.id));
    const rest = activities.filter((a) => !ids.has(a.id) && toLocalDateKey(new Date(a.date)) === view.key && !a.backfilled && !a.category);
    return [...view.items, ...rest].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activities, view]);

  useEffect(() => {
    if (!isOpen) return;
    void loadActivityImageIndex();
    let alive = true;
    db.dailyDivinations.where('date').equals(view.key).first()
      .then((row) => { if (alive) setTarot(row ?? null); })
      .catch(() => { if (alive) setTarot(null); });
    return () => { alive = false; };
  }, [isOpen, view.key]);

  const card = tarot ? TAROT_BY_ID[tarot.cardId] : null;
  const goRecords = () => {
    setActivitiesJumpDate(view.key);
    onClose();
    setCurrentPage('activities');
  };

  return (
    <SheetModal
      isOpen={isOpen}
      onClose={onClose}
      title="一年前的今天"
      maxHeightClass="max-h-[80vh]"
      footer={
        <button
          type="button"
          onClick={goRecords}
          className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white"
        >
          去记录页看这一天 →
        </button>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="rounded-xl bg-gray-50 px-4 py-3.5 dark:bg-gray-800/60">
          <div className="text-lg font-black text-gray-900 dark:text-white">{onThisDayLabel(view.date)}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold text-gray-500 dark:text-gray-400">
            <span>那天记了 {all.length} 条</span>
            {view.streakThen > 0 && <span>那时连续 {view.streakThen} 天</span>}
            {card && <span>抽到 {card.name} · {tarot?.orientation === 'reversed' ? '逆位' : '正位'}</span>}
          </div>
        </div>
        <div className="space-y-2">
          {all.map((a) => <Row key={a.id} a={a} names={settings.attributeNames} />)}
        </div>
        <p className="px-1 text-[11px] text-gray-400 dark:text-gray-500">从第一条记录起已经过了 {view.daysSince} 天。</p>
      </div>
    </SheetModal>
  );
};
