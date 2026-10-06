import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { SheetModal } from '@/components/SheetModal';
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { getAIConfig } from '@/utils/aiClient';
import { triggerNavFeedback, triggerSuccessFeedback } from '@/utils/feedback';
import { questBoardUnlocked, questHint, questProgress, questTitle, weekRangeOf, QUEST_UNLOCK, type QuestData } from '@/utils/questBoard';
import {
  LIFE_QUEST_COUNT, LIFE_QUEST_REROLLS, lifeDayKeyOf, lifeQuestsFor, normTitle, readLifeQuestDay, writeLifeQuestDay,
  type LifeQuest, type LifeQuestDay,
} from '@/utils/lifeQuests';
import { useUiChannel } from '@/ui/useUiChannel';
import type { AttributeId, Quest } from '@/types';

/**
 * 委托板（2.7.0.6 第 6 轮 · PRD §11.3）：任务页里和「命运会替你选择」并排的入口 + 这张抽屉。
 * 每周一三张，进度按本周数据现算，做完手动领（给一个奖励时刻）。四频道各一套皮。
 */

export interface QuestBoardItem { quest: Quest; progress: number; done: boolean; claimed: boolean }

export function useQuestBoard() {
  const { activities, todos, todoCompletions, summaries, battleState, settings } = useAppStore(useShallow((s) => ({
    activities: s.activities, todos: s.todos, todoCompletions: s.todoCompletions, summaries: s.summaries, battleState: s.battleState, settings: s.settings,
  })));
  const pacts = useCloudSocialStore((s) => s.pacts);
  const myId = useCloudStore((s) => s.cloudUser?.id);
  const todayKey = toLocalDateKey();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => weekRangeOf(new Date()), [todayKey]);
  const quests = useLiveQuery(() => db.quests.where('weekKey').equals(range.weekKey).sortBy('slot'), [range.weekKey]);
  const claimedTotal = useLiveQuery(() => db.quests.filter((q) => !!q.claimedAt).count(), []);
  const aux = useLiveQuery(async () => {
    const [divinations, images, ledger] = await Promise.all([
      db.dailyDivinations.toArray(),
      db.activityImages.where('createdAt').aboveOrEqual(range.start).toArray(),
      db.ledgerEntries.toArray(),
    ]);
    return { divinations, images, ledger };
  }, [range.weekKey]);
  const unlocked = useMemo(() => questBoardUnlocked(activities), [activities]);
  const items = useMemo<QuestBoardItem[]>(() => {
    if (!quests || !aux) return [];
    const data: QuestData = {
      activities, todos, completions: todoCompletions, summaries, battleState, pacts, myId,
      divinations: aux.divinations, images: aux.images, ledger: aux.ledger,
      aiReady: !!getAIConfig(settings), now: new Date(),
    };
    return quests.map((q) => {
      const progress = questProgress(q, data, range);
      return { quest: q, progress: Math.min(progress, q.target), done: progress >= q.target, claimed: !!q.claimedAt };
    });
  }, [quests, aux, activities, todos, todoCompletions, summaries, battleState, pacts, myId, settings, range]);
  const claimable = items.filter((i) => i.done && !i.claimed).length;
  return { unlocked, range, items, claimable, claimedTotal: claimedTotal ?? 0, loaded: !!quests && !!aux, attributeNames: settings.attributeNames };
}

const useTone = () => {
  const channel = useUiChannel();
  return useMemo(() => {
    switch (channel) {
      case 'p3': return { channel, accent: '#1b57ff', ink: '#0a1230', sub: '#3d4a66', card: '#eef5fb', bar: '#cfeaf6', radius: 6, clip: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' };
      case 'p4': return { channel, accent: 'var(--ui-accent, #ff8a2b)', ink: '#131313', sub: 'rgba(19,19,19,0.62)', card: 'var(--p4-paper, #fff7b0)', bar: 'rgba(19,19,19,0.10)', radius: 18, clip: undefined as string | undefined };
      case 'p5': return { channel, accent: '#c00008', ink: '#131313', sub: '#4a4640', card: '#f0e9df', bar: 'rgba(0,0,0,0.12)', radius: 2, clip: undefined as string | undefined };
      default: return { channel, accent: 'var(--color-primary)', ink: 'var(--ui-ink, #111827)', sub: 'var(--ui-muted, #6b7280)', card: 'rgba(0,0,0,0.04)', bar: 'rgba(0,0,0,0.08)', radius: 14, clip: undefined as string | undefined };
    }
  }, [channel]);
};

const md = (key: string) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;

const TierBadge = ({ sp, tone }: { sp: number; tone: ReturnType<typeof useTone> }) => (
  <span
    className="inline-flex shrink-0 items-center px-2 py-0.5 text-[11px] font-black tabular-nums"
    style={{ background: tone.accent, color: '#fff', clipPath: tone.clip, borderRadius: tone.clip ? 0 : Math.max(4, tone.radius - 8) }}
  >
    +{sp} SP
  </span>
);

const QuestCard = ({ item, tone, names, onClaim, flash }: {
  item: QuestBoardItem;
  tone: ReturnType<typeof useTone>;
  names: Record<'knowledge' | 'guts' | 'dexterity' | 'kindness' | 'charm', string>;
  onClaim: () => void;
  flash: number | null;
}) => {
  const { quest, progress, done, claimed } = item;
  const pct = Math.round((progress / Math.max(1, quest.target)) * 100);
  const p5 = tone.channel === 'p5';
  return (
    <div
      className="relative p-3.5"
      style={{
        background: tone.card,
        borderRadius: tone.radius,
        color: tone.ink,
        opacity: claimed ? 0.72 : 1,
        boxShadow: p5 ? '3px 3px 0 #0b0b0b' : undefined,
        border: p5 ? '2px solid #0b0b0b' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <TierBadge sp={quest.rewardSp} tone={tone} />
            {quest.autoClaimed && <span className="text-[10px] font-bold" style={{ color: tone.sub }}>上周替你领的</span>}
          </div>
          <div className="mt-1.5 text-[15px] font-black leading-snug">{questTitle(quest, names)}</div>
          <div className="mt-0.5 text-[11px] font-semibold" style={{ color: tone.sub }}>{questHint(quest)}</div>
        </div>
        <div className="shrink-0 text-right">
          {claimed ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-black" style={{ color: tone.accent }}>✓ 已领取</span>
          ) : done ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onClaim}
              className="px-3 py-1.5 text-[13px] font-black"
              style={{ background: tone.accent, color: '#fff', clipPath: tone.clip, borderRadius: tone.clip ? 0 : Math.max(6, tone.radius - 6), boxShadow: p5 ? '2px 2px 0 #0b0b0b' : undefined }}
            >
              领取
            </motion.button>
          ) : (
            <span className="text-[12px] font-black tabular-nums" style={{ color: tone.sub }}>{progress} / {quest.target}</span>
          )}
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: tone.bar }}>
        <motion.div className="h-full rounded-full" style={{ background: tone.accent }} initial={{ width: 0 }} animate={{ width: `${claimed ? 100 : pct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
      </div>
      <AnimatePresence>
        {flash !== null && (
          <motion.span
            key="flash"
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: -18, scale: 1.1 }}
            exit={{ opacity: 0, y: -34 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="pointer-events-none absolute right-4 top-2 text-[15px] font-black"
            style={{ color: tone.accent }}
          >
            {flash > 0 ? `+${flash} SP` : '已收下'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};


// ── 今日生活委托（第 13 轮）：每天三张生活小事，点一下进今日任务 ──────────────

type LifeStatus = 'new' | 'added' | 'done';

/** open：抽屉开着才定今天这批（任务页一挂载就会跑这个 hook，那时记录可能还没读完，个性化会落空） */
export function useLifeQuests(open: boolean) {
  const { activities, todos, user, addTodo, getTodayTodoProgress } = useAppStore(useShallow((s) => ({
    activities: s.activities, todos: s.todos, user: s.user, addTodo: s.addTodo, getTodayTodoProgress: s.getTodayTodoProgress,
  })));
  const todayKey = toLocalDateKey();
  const seedKey = user?.id ?? user?.name ?? 'me';
  const [day, setDay] = useState<LifeQuestDay | null>(() => readLifeQuestDay());
  // 今天这批：本机记过就用它（同一天卡片不变脸）；没记过按种子算一批，下面的 effect 记下来
  const current = useMemo<LifeQuestDay>(() => {
    if (day && day.date === todayKey && day.items.length) return day;
    return { date: todayKey, reroll: 0, items: lifeQuestsFor({ dateKey: todayKey, seedKey, activities, todos, reroll: 0 }) };
    // 记录 / 清单不进依赖（同一天不变脸）；open 进依赖：打开那一刻按读完的记录重算一次再记下
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, todayKey, seedKey, open]);
  useEffect(() => {
    if (!open) return;
    if (!day || day.date !== current.date || day.items !== current.items) { writeLifeQuestDay(current); setDay(current); }
  }, [open, current, day]);
  const statusOf = (q: LifeQuest): LifeStatus => {
    const t = todos.find((x) => normTitle(x.title) === normTitle(q.title) && lifeDayKeyOf(x.createdAt) === todayKey);
    if (!t) return 'new';
    return t.completedAt || getTodayTodoProgress(t.id).isComplete ? 'done' : 'added';
  };
  const add = async (q: LifeQuest) => {
    if (statusOf(q) !== 'new') return;
    await addTodo({ title: q.title, attribute: q.attribute, points: q.points, frequency: 'single', isActive: true });
    triggerSuccessFeedback();
  };
  const rerollsLeft = Math.max(0, LIFE_QUEST_REROLLS - current.reroll);
  const reroll = () => {
    if (rerollsLeft <= 0) return;
    // 已经加进清单的那几张留着，只换没动过的
    const kept = current.items.filter((q) => statusOf(q) !== 'new');
    const fresh = lifeQuestsFor({ dateKey: todayKey, seedKey, activities, todos, reroll: current.reroll + 1, previousIds: current.items.map((q) => q.presetId) })
      .filter((q) => !kept.some((k) => k.presetId === q.presetId));
    const next: LifeQuestDay = { date: todayKey, reroll: current.reroll + 1, items: [...kept, ...fresh].slice(0, LIFE_QUEST_COUNT) };
    triggerNavFeedback();
    writeLifeQuestDay(next);
    setDay(next);
  };
  return { items: current.items, statusOf, add, reroll, rerollsLeft, allTouched: current.items.every((q) => statusOf(q) !== 'new') };
}

const LifeQuestCard = ({ q, status, tone, names, onAdd }: {
  q: LifeQuest;
  status: LifeStatus;
  tone: ReturnType<typeof useTone>;
  names: Record<AttributeId, string>;
  onAdd: () => void;
}) => {
  const p5 = tone.channel === 'p5';
  return (
    <div
      className="flex items-center gap-3 p-3"
      data-testid="life-quest"
      style={{ background: tone.card, borderRadius: tone.radius, color: tone.ink, boxShadow: p5 ? '3px 3px 0 #0b0b0b' : undefined, border: p5 ? '2px solid #0b0b0b' : undefined }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-black leading-snug">{q.title}</div>
        <div className="mt-0.5 text-[11px] font-semibold" style={{ color: tone.sub }}>
          {names[q.attribute] ?? q.attribute} +{q.points} · {q.hint}
        </div>
      </div>
      {status === 'new' ? (
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onAdd}
          className="shrink-0 px-3 py-1.5 text-[12.5px] font-black"
          style={{ background: tone.accent, color: '#fff', clipPath: tone.clip, borderRadius: tone.clip ? 0 : Math.max(6, tone.radius - 6), boxShadow: p5 ? '2px 2px 0 #0b0b0b' : undefined }}
        >
          加入今日任务
        </motion.button>
      ) : (
        <span className="shrink-0 text-[12px] font-black" style={{ color: tone.accent }}>{status === 'done' ? '✓ 已完成' : '已加入'}</span>
      )}
    </div>
  );
};

export const QuestBoardSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const board = useQuestBoard();
  const tone = useTone();
  const { claimQuest, refreshQuests, questNotice, clearQuestNotice } = useAppStore(useShallow((s) => ({
    claimQuest: s.claimQuest, refreshQuests: s.refreshQuests, questNotice: s.questNotice, clearQuestNotice: s.clearQuestNotice,
  })));
  const [flash, setFlash] = useState<Record<string, number>>({});
  useEffect(() => { if (open) void refreshQuests(); }, [open, refreshQuests]);

  const claim = async (id: string) => {
    triggerNavFeedback();
    const res = await claimQuest(id);
    if (!res.ok) return;
    triggerSuccessFeedback();
    setFlash((f) => ({ ...f, [id]: res.sp }));
    window.setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[id]; return n; }), 1200);
  };

  const allClaimed = board.items.length > 0 && board.items.every((i) => i.claimed);
  const life = useLifeQuests(open);
  return (
    <SheetModal isOpen={open} onClose={onClose} title="委托板">
      <div className="px-4 pb-6" style={{ color: tone.ink }}>
        {/* 今日生活委托（第 13 轮）：不用解锁，每天换三张 */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[14px] font-black">今日生活委托</div>
          <div className="text-[11px] font-bold" style={{ color: tone.sub }}>每天换三张 · 点一下放进今日任务</div>
        </div>
        <div className="mt-2.5 space-y-2" data-testid="life-quests">
          {life.items.map((q) => (
            <LifeQuestCard key={q.key} q={q} status={life.statusOf(q)} tone={tone} names={board.attributeNames} onAdd={() => void life.add(q)} />
          ))}
        </div>
        {!life.allTouched && (
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={life.reroll}
              disabled={life.rerollsLeft <= 0}
              className="text-[11.5px] font-black disabled:opacity-40"
              style={{ color: tone.accent }}
            >
              {life.rerollsLeft > 0 ? `换一批（今天还能换 ${life.rerollsLeft} 次）` : '今天换不了了，明天再来'}
            </button>
          </div>
        )}

        <div className="mt-5 text-[14px] font-black">本周委托</div>
        {!board.unlocked ? (
          <div className="mt-2 px-3 py-3 text-[12px] font-bold leading-relaxed" style={{ background: tone.card, borderRadius: tone.radius, color: tone.sub }}>
            自己记满 {QUEST_UNLOCK.minDays} 天、{QUEST_UNLOCK.minRecords} 条记录后解锁：每周一刷新三张，做完来领 SP。
          </div>
        ) : (
        <>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <div className="text-[12px] font-bold" style={{ color: tone.sub }}>
            本周 {md(board.range.days[0])} – {md(board.range.days[6])} · 周一刷新
          </div>
          <div className="text-[11px] font-bold tabular-nums" style={{ color: tone.sub }}>累计领取 {board.claimedTotal} 次</div>
        </div>

        <AnimatePresence>
          {questNotice && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 flex items-start gap-2 px-3 py-2 text-[12px] font-bold leading-relaxed"
              style={{ background: tone.card, borderRadius: Math.max(6, tone.radius - 4) }}
            >
              <span className="min-w-0 flex-1">{questNotice}</span>
              <button type="button" onClick={clearQuestNotice} aria-label="知道了" className="shrink-0 text-[14px] leading-none opacity-60">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3 space-y-2.5">
          {board.items.map((item) => (
            <QuestCard key={item.quest.id} item={item} tone={tone} names={board.attributeNames} onClaim={() => claim(item.quest.id)} flash={flash[item.quest.id] ?? null} />
          ))}
          {board.loaded && board.items.length === 0 && (
            <div className="py-8 text-center text-[13px] font-bold" style={{ color: tone.sub }}>本周的委托还在路上，稍后再来。</div>
          )}
        </div>

        <div className="mt-4 text-center text-[11px] font-bold leading-relaxed" style={{ color: tone.sub }}>
          {allClaimed ? '本周三张都收下了，岁时册里多了一枚「委托全清」。' : '做完的委托要自己来领；上周没领的，下周一会替你领。'}
          <br />
          成就「受人之托」：领取 {Math.min(board.claimedTotal, 10)} / 10
        </div>
        </>
        )}
      </div>
    </SheetModal>
  );
};
