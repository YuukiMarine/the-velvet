import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { create } from 'zustand';
import { SheetModal } from '@/components/SheetModal';
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { getAIConfig } from '@/utils/aiClient';
import { triggerNavFeedback, triggerSuccessFeedback } from '@/utils/feedback';
import { questBoardUnlocked, questHint, questProgress, questTitle, weekRangeOf, QUEST_UNLOCK, type QuestData } from '@/utils/questBoard';
import {
  LIFE_QUEST_COUNT, LIFE_QUEST_REROLLS, lifeContextNow, lifeDayKeyOf, lifeQuestDaySig, lifeQuestsFor, normTitle, readLifeQuestDay, readLifeQuestLog,
  recordLifeQuestEvent, writeLifeQuestDay,
  type LifeQuest, type LifeQuestDay,
} from '@/utils/lifeQuests';
import { fetchWeatherNow, weatherConfigOf, weatherReady } from '@/utils/weather';
import { lifeAttrMapSig, lifeAttrSigOf, resolveLifeAttrs } from '@/utils/lifeQuestAttrMap';
import { ensureLifeQuestAiCard, ensureLifeQuestAttrMap, lifeAttrMapStatus, readLifeQuestAiCard } from '@/utils/lifeQuestAI';
import { aiConfigured } from '@/utils/aiClient';
import { useUiChannel } from '@/ui/useUiChannel';
import { P5R, P5_TITLE_FONT, P5Btn, P5Chip, P5Rough, roughSlant } from '@/components/p5r/kit';
import type { AttributeId, Quest } from '@/types';

/**
 * 委托板（2.7.0.6 第 6 轮 · PRD §11.3）：任务页里和「命运会替你选择」并排的入口 + 这张抽屉。
 * 每周一三张，进度按本周数据现算，做完手动领（给一个奖励时刻）。四频道各一套皮。
 */

export interface QuestBoardItem { quest: Quest; progress: number; done: boolean; claimed: boolean }

/**
 * 「本周委托看过了没」（第 14 批）：周一刷出新的三张后，任务页的「委托」入口挂红点，打开抽屉就消。
 * 记在本机（按设备）；用一个小 store 让入口和抽屉同步刷新。
 */
const QUEST_SEEN_KEY = 'velvet:questBoardSeenWeek.v1';
const readSeenWeek = (): string => { try { return localStorage.getItem(QUEST_SEEN_KEY) ?? ''; } catch { return ''; } };
export const useQuestSeen = create<{ week: string; mark: (week: string) => void }>((set) => ({
  week: readSeenWeek(),
  mark: (week) => { try { localStorage.setItem(QUEST_SEEN_KEY, week); } catch { /* 存不了就只在这次运行里消 */ } set({ week }); },
}));

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
  const seenWeek = useQuestSeen((s) => s.week);
  /** 这周刷出了新委托、还没打开看过 → 入口挂红点 */
  const unseen = unlocked && items.length > 0 && seenWeek !== range.weekKey;
  return { unlocked, range, items, claimable, unseen, claimedTotal: claimedTotal ?? 0, loaded: !!quests && !!aux, attributeNames: settings.attributeNames };
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

/**
 * 红频道的卡（第 14 批用户口径「方框和按钮太板正」）：守 P5 的反板正铁律——不规则纸面 + 不等宽黑框 + 错位硬影，
 * 每张再歪一点点（不同 seed / 角度，挨着放也不会一模一样）。其余频道原样。
 */
const P5Card = ({ seed, rot = 0, className = '', children, testId, dim = false }: { seed: number; rot?: number; className?: string; children: ReactNode; testId?: string; dim?: boolean }) => (
  <div className={`relative ${className}`} data-testid={testId} style={{ transform: rot ? `rotate(${rot}deg)` : undefined, opacity: dim ? 0.72 : 1, color: P5R.ink }}>
    <P5Rough seed={seed} jag={7} frame={3} face={P5R.paper} shadow={{ x: 4, y: 5 }} />
    <div className="relative p-4">{children}</div>
  </div>
);

/** 段标题：红频道是一块歪着的黑底白字楔，其余频道照旧 */
const SectionTitle = ({ tone, children }: { tone: ReturnType<typeof useTone>; children: ReactNode }) => (
  tone.channel === 'p5' ? (
    <span className="inline-block px-3 py-1 text-[14px] font-black leading-none" style={{ background: P5R.ink, color: P5R.white, fontFamily: P5_TITLE_FONT, clipPath: roughSlant(31, 7, 2), transform: 'rotate(-1.5deg)' }}>
      {children}
    </span>
  ) : <div className="text-[14px] font-black">{children}</div>
);

const TierBadge = ({ sp, tone }: { sp: number; tone: ReturnType<typeof useTone> }) => (
  tone.channel === 'p5' ? <P5Chip tone="red" rot={-2} className="!px-2 !py-0.5 !text-[11px] tabular-nums">+{sp} SP</P5Chip> :
  <span
    className="inline-flex shrink-0 items-center px-2 py-0.5 text-[11px] font-black tabular-nums"
    style={{ background: tone.accent, color: '#fff', clipPath: tone.clip, borderRadius: tone.clip ? 0 : Math.max(4, tone.radius - 8) }}
  >
    +{sp} SP
  </span>
);

const QuestCard = ({ item, tone, names, onClaim, flash, onSwap }: {
  item: QuestBoardItem;
  tone: ReturnType<typeof useTone>;
  names: Record<'knowledge' | 'guts' | 'dexterity' | 'kindness' | 'charm', string>;
  onClaim: () => void;
  flash: number | null;
  /** 本周还能换、这张也能换时才给（第 14 批） */
  onSwap?: () => void;
}) => {
  const { quest, progress, done, claimed } = item;
  const pct = Math.round((progress / Math.max(1, quest.target)) * 100);
  const p5 = tone.channel === 'p5';
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <TierBadge sp={quest.rewardSp} tone={tone} />
            {quest.autoClaimed && <span className="text-[10px] font-bold" style={{ color: tone.sub }}>上周替你领的</span>}
            {quest.swapped && <span className="text-[10px] font-bold" style={{ color: tone.sub }} data-testid="quest-swapped">换来的</span>}
          </div>
          <div className="mt-1.5 text-[15px] font-black leading-snug">{questTitle(quest, names)}</div>
          <div className="mt-0.5 text-[11px] font-semibold" style={{ color: tone.sub }}>{questHint(quest)}</div>
          {onSwap && (
            <button type="button" onClick={onSwap} data-testid="quest-swap" className="mt-1.5 text-[11px] font-black underline" style={{ color: tone.accent }}>
              换一张
            </button>
          )}
        </div>
        <div className="shrink-0 text-right">
          {claimed ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-black" style={{ color: tone.accent }}>✓ 已领取</span>
          ) : done ? (
            p5 ? (
              <P5Btn tone="red" seed={40 + quest.slot} rot={-2} onClick={onClaim} bodyClassName="!px-4 !py-1.5 !text-[14px]">领取</P5Btn>
            ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onClaim}
              className="px-3 py-1.5 text-[13px] font-black"
              style={{ background: tone.accent, color: '#fff', clipPath: tone.clip, borderRadius: tone.clip ? 0 : Math.max(6, tone.radius - 6) }}
            >
              领取
            </motion.button>
            )
          ) : (
            <span className="text-[12px] font-black tabular-nums" style={{ color: tone.sub }}>{progress} / {quest.target}</span>
          )}
        </div>
      </div>
      {p5 ? (
        // 红频道：斜切的进度条（不是圆头药丸）
        <div className="mt-3 h-2 w-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.16)', clipPath: roughSlant(50 + quest.slot, 4, 1) }}>
          <motion.div className="h-full" style={{ background: P5R.red }} initial={{ width: 0 }} animate={{ width: `${claimed ? 100 : pct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
        </div>
      ) : (
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: tone.bar }}>
        <motion.div className="h-full rounded-full" style={{ background: tone.accent }} initial={{ width: 0 }} animate={{ width: `${claimed ? 100 : pct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
      </div>
      )}
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
    </>
  );
  if (p5) return <P5Card seed={20 + quest.slot * 7} rot={[-0.8, 0.6, -0.4][quest.slot % 3]} dim={claimed}>{body}</P5Card>;
  return (
    <div className="relative p-3.5" style={{ background: tone.card, borderRadius: tone.radius, color: tone.ink, opacity: claimed ? 0.72 : 1 }}>
      {body}
    </div>
  );
};


// ── 今日生活委托（第 13 轮）：每天三张生活小事，点一下进今日任务 ──────────────

type LifeStatus = 'new' | 'added' | 'done';

/**
 * open：抽屉开着才定今天这批（任务页一挂载就会跑这个 hook，那时记录可能还没读完，个性化会落空）。
 * 第 16 批：出题看情境（几点、天气）和本机记下的取舍；翻到哪张、换掉哪张都记一笔（lifeQuests.ts 的 recordLifeQuestEvent）。
 */
export function useLifeQuests(open: boolean) {
  const { activities, todos, todoCompletions, user, settings, addTodo, getTodayTodoProgress, updateSettings } = useAppStore(useShallow((s) => ({
    activities: s.activities, todos: s.todos, todoCompletions: s.todoCompletions, user: s.user, settings: s.settings,
    addTodo: s.addTodo, getTodayTodoProgress: s.getTodayTodoProgress, updateSettings: s.updateSettings,
  })));
  const todayKey = toLocalDateKey();
  const seedKey = user?.id ?? user?.name ?? 'me';
  const [day, setDay] = useState<LifeQuestDay | null>(() => readLifeQuestDay());
  /** 本机记的是不是今天、这个用户的（第 16 批前存的没有 seed：当作本人的，升级当天不变脸） */
  const isToday = (d: LifeQuestDay | null): d is LifeQuestDay => !!d && d.date === todayKey && (d.seed ?? seedKey) === seedKey && d.items.length > 0;
  const hasToday = isToday(day);
  // 今天这批还没定：先把天气取好，打开委托板时情境里就有它（10 分钟缓存；没开天气 / 出错退避中什么都不做）
  const weatherKey = `${settings.weatherProvider ?? ''}|${settings.weatherApiHost ?? ''}|${settings.weatherCity?.lat ?? ''}|${settings.weatherCity?.lon ?? ''}|${settings.weatherApiKey ? 1 : 0}`;
  useEffect(() => {
    if (hasToday) return;
    const cfg = weatherConfigOf(settings);
    if (!weatherReady(cfg)) return;
    fetchWeatherNow(cfg).catch(() => { /* 取不到就不按天气筛 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToday, weatherKey]);
  /**
   * 题目 ↔ 自定义属性的对应（第 17 批）：任务页一挂载就在后台要（属性名或题库变了会自动重要，失败的隔一阵再试），
   * 打开委托板时多半已经好了。要回来 / 失败了都 bump 一下，让下面按新状态重算。
   */
  const [mapTick, setMapTick] = useState(0);
  const mapSig = lifeAttrMapSig(settings.attributeNames);
  const aiReady = aiConfigured(settings);
  useEffect(() => {
    let alive = true;
    void ensureLifeQuestAttrMap(settings, updateSettings).then(() => { if (alive) setMapTick((t) => t + 1); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSig, aiReady, settings.lifeQuestAttrMap?.sig]);
  const mapStatus = lifeAttrMapStatus(settings);
  const attrs = resolveLifeAttrs(settings);
  // 今天这批还没定、对应关系在路上：先等一会儿（最多 12 秒），别用「改过名的几类不出」的残缺版定下一整天
  const [waitExpired, setWaitExpired] = useState(false);
  const storedNow = open ? readLifeQuestDay() : null;
  const waiting = open && !isToday(storedNow) && !hasToday && mapStatus === 'pending' && !waitExpired;
  useEffect(() => {
    if (!waiting) return;
    const t = window.setTimeout(() => setWaitExpired(true), 12_000);
    return () => window.clearTimeout(t);
  }, [waiting]);
  // 今天这批：本机记过就用它（同一天卡片不变脸）；没记过按此刻的情境、取舍和属性对应算一批，下面的 effect 记下来
  const current = useMemo<LifeQuestDay>(() => {
    // 抽签可能已经替今天定好了一批（第 17 批）：打开时以本机记的为准；内容和手上这份一样就沿用手上这份（不换对象，免得来回重渲染）
    const stored = open ? readLifeQuestDay() : null;
    const base = isToday(stored) && !(isToday(day) && lifeQuestDaySig(day) === lifeQuestDaySig(stored)) ? stored : isToday(day) ? day : null;
    const wantSig = lifeAttrSigOf(attrs);
    if (base) {
      // 属性名改了、对应变了（第 17 批）：打开时把还没加入的那几张按新的对应重出，已加入的留着；对应还在路上就先不动
      if (open && mapStatus !== 'pending' && (base.attrSig ?? 'stock') !== wantSig) {
        const addedToday = (q: LifeQuest) => todos.some((t) => lifeDayKeyOf(t.createdAt) === todayKey && (t.lifeQuest === q.presetId || normTitle(t.title) === normTitle(q.title)));
        const kept = base.items.filter(addedToday);
        const fresh = lifeQuestsFor({
          dateKey: todayKey, seedKey, activities, todos, completions: todoCompletions, reroll: base.reroll,
          ctx: lifeContextNow(settings), log: readLifeQuestLog(seedKey), attrOf: attrs.attrOf,
          count: LIFE_QUEST_COUNT - kept.length, avoidAttrs: new Set(kept.map((q) => q.attribute)),
        }).filter((q) => !kept.some((k) => k.presetId === q.presetId));
        return { ...base, attrSource: attrs.source, attrSig: wantSig, items: [...kept, ...fresh].slice(0, LIFE_QUEST_COUNT) };
      }
      return base;
    }
    if (waiting) return { date: todayKey, seed: seedKey, reroll: 0, items: [] };
    return {
      date: todayKey, seed: seedKey, reroll: 0, attrSource: attrs.source, attrSig: wantSig,
      items: lifeQuestsFor({
        dateKey: todayKey, seedKey, activities, todos, completions: todoCompletions, reroll: 0,
        ctx: lifeContextNow(settings), log: readLifeQuestLog(seedKey), attrOf: attrs.attrOf,
      }),
    };
    // 记录 / 清单 / 设置不进依赖（同一天不变脸）；open 进依赖：打开那一刻按读完的记录重算一次再记下；
    // 对应关系要回来（mapTick / sig）、等待结束（waiting）时也重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, todayKey, seedKey, open, waiting, mapTick, settings.lifeQuestAttrMap?.sig, mapSig]);
  useEffect(() => {
    if (!open || waiting || !current.items.length) return;
    if (lifeQuestDaySig(day) !== lifeQuestDaySig(current)) {
      writeLifeQuestDay(current);
      setDay(current);
      recordLifeQuestEvent(seedKey, current.date, 'shown', current.items.map((q) => q.presetId));
    }
  }, [open, current, day, seedKey]);
  /** 轮播翻到哪张记哪张（学取舍：翻到了不加 / 换掉，和根本没翻到是两回事） */
  const markViewed = useCallback((q: LifeQuest) => {
    if (open) recordLifeQuestEvent(seedKey, todayKey, 'viewed', [q.presetId]);
  }, [open, seedKey, todayKey]);
  const statusOf = (q: LifeQuest): LifeStatus => {
    const t = todos.find((x) => lifeDayKeyOf(x.createdAt) === todayKey && (x.lifeQuest === q.presetId || normTitle(x.title) === normTitle(q.title)));
    if (!t) return 'new';
    return t.completedAt || getTodayTodoProgress(t.id).isComplete ? 'done' : 'added';
  };
  const add = async (q: LifeQuest) => {
    if (statusOf(q) !== 'new') return;
    // lifeQuest 标记：本周委托「完成 3 张今日委托」按它数（第 14 批）
    await addTodo({ title: q.title, attribute: q.attribute, points: q.points, frequency: 'single', isActive: true, lifeQuest: q.presetId });
    triggerSuccessFeedback();
  };
  /**
   * 第四张：AI 按最近记录写的（设置 → 体验个性化，默认关）。等今天这批真正定下来（记进本机）再在后台写——
   * 打开委托板前那份只是预览，拿它去比「别和另外三张重复」会比错；写好了接在后面
   */
  const [aiCard, setAiCard] = useState<LifeQuest | null>(() => readLifeQuestAiCard(seedKey, todayKey));
  const settled = hasToday ? day : null;
  const batchKey = settled ? settled.items.map((q) => q.key).join('|') : '';
  useEffect(() => {
    setAiCard(readLifeQuestAiCard(seedKey, todayKey));
    if (!settings.lifeQuestAiCard || !settled) return;
    let alive = true;
    void ensureLifeQuestAiCard({ settings, seedKey, todayKey, activities, todos, others: settled.items }).then((q) => { if (alive && q) setAiCard(q); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, todayKey, settings.lifeQuestAiCard, batchKey, aiReady]);
  const showAi = !!settings.lifeQuestAiCard && !!aiCard && !waiting;
  /** 改过名的属性对不上、AI 又帮不上（没配 / 刚失败）：说一句为什么少了几类 */
  const attrNote = attrs.source === 'fallback' && mapStatus === 'unavailable' && attrs.custom.length
    ? (aiReady
      ? '有几项属性名是你自己起的，题目和属性的对应还没准备好，先不出这几类；过一会儿会自动再试。'
      : '有几项属性名是你自己起的，题库对不上就先不出这几类；配好 AI 服务后会自动对好。')
    : '';
  const rerollsLeft = Math.max(0, LIFE_QUEST_REROLLS - current.reroll);
  const reroll = () => {
    if (rerollsLeft <= 0) return;
    // 已经加进清单的那几张留着，只换没动过的
    const kept = current.items.filter((q) => statusOf(q) !== 'new');
    // 翻到了、没加就换掉的记一笔「不太想要」；没翻到的那几张不算
    const viewed = new Set(readLifeQuestLog(seedKey).days[todayKey]?.viewed ?? []);
    const skipped = current.items.filter((q) => statusOf(q) === 'new' && viewed.has(q.presetId)).map((q) => q.presetId);
    const log = skipped.length ? recordLifeQuestEvent(seedKey, todayKey, 'skipped', skipped) : readLifeQuestLog(seedKey);
    const fresh = lifeQuestsFor({
      dateKey: todayKey, seedKey, activities, todos, completions: todoCompletions, reroll: current.reroll + 1,
      previousIds: current.items.map((q) => q.presetId), ctx: lifeContextNow(settings), log,
      count: LIFE_QUEST_COUNT - kept.length, avoidAttrs: new Set(kept.map((q) => q.attribute)), attrOf: attrs.attrOf,
    }).filter((q) => !kept.some((k) => k.presetId === q.presetId));
    const next: LifeQuestDay = { date: todayKey, seed: seedKey, reroll: current.reroll + 1, attrSource: attrs.source, attrSig: lifeAttrSigOf(attrs), items: [...kept, ...fresh].slice(0, LIFE_QUEST_COUNT) };
    recordLifeQuestEvent(seedKey, todayKey, 'shown', next.items.map((q) => q.presetId));
    triggerNavFeedback();
    writeLifeQuestDay(next);
    setDay(next);
  };
  return {
    items: showAi && aiCard ? [...current.items, aiCard] : current.items,
    statusOf, add, reroll, rerollsLeft, markViewed, waiting, attrNote,
    allTouched: current.items.length > 0 && current.items.every((q) => statusOf(q) !== 'new'),
  };
}

const LifeQuestCard = ({ q, status, tone, names, onAdd, index, total }: {
  q: LifeQuest;
  status: LifeStatus;
  tone: ReturnType<typeof useTone>;
  names: Record<AttributeId, string>;
  onAdd: () => void;
  index: number;
  total: number;
}) => {
  const p5 = tone.channel === 'p5';
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[11px] font-black" style={{ color: tone.sub, fontFamily: p5 ? P5_TITLE_FONT : undefined }}>
        <span className="flex items-center gap-1.5">
          {names[q.attribute] ?? q.attribute} +{q.points}
          {/* 第四张：AI 按最近记录写的（第 17 批） */}
          {q.ai && (
            <span data-testid="life-ai-tag" className="px-1.5 py-[1px] text-[9.5px] font-black leading-none" style={p5 ? { background: P5R.ink, color: P5R.white, clipPath: 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)' } : { background: tone.accent, color: '#fff', borderRadius: 999 }}>AI</span>
          )}
        </span>
        <span className="tabular-nums">{index + 1} / {total}</span>
      </div>
      <div className="mt-1.5 text-[17px] font-black leading-snug" data-testid="life-quest-title">{q.title}</div>
      <div className="mt-1 text-[12px] font-semibold" style={{ color: tone.sub }}>{q.hint}</div>
      <div className="mt-3">
        {status === 'new' ? (
          p5 ? (
            <P5Btn tone="red" seed={60 + index} rot={-1} onClick={onAdd} className="w-full" bodyClassName="!py-2 !text-[15px]">加入今日任务</P5Btn>
          ) : (
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={onAdd}
            className="w-full py-2 text-[13px] font-black"
            style={{ background: tone.accent, color: '#fff', clipPath: tone.clip, borderRadius: tone.clip ? 0 : Math.max(6, tone.radius - 6) }}
          >
            加入今日任务
          </motion.button>
          )
        ) : (
          <div className="py-2 text-center text-[13px] font-black" style={{ color: tone.accent, fontFamily: p5 ? P5_TITLE_FONT : undefined }}>{status === 'done' ? '✓ 已完成' : '✓ 已加入今日任务'}</div>
        )}
      </div>
    </>
  );
  if (p5) return <P5Card seed={10 + index * 5} rot={[-0.7, 0.5, -0.3][index % 3]} testId="life-quest">{body}</P5Card>;
  return (
    <div className="p-4" data-testid="life-quest" style={{ background: tone.card, borderRadius: tone.radius, color: tone.ink }}>
      {body}
    </div>
  );
};

/**
 * 今日委托合成一张（第 14 批用户口径）：左右滑 / 点箭头切换，带滑入滑出动画；底下的圆点能直接跳，
 * 已加入的那张圆点换成实心勾。换一批后回到第一张。
 */
const LifeQuestCarousel = ({ items, statusOf, onAdd, onView, tone, names }: {
  items: LifeQuest[];
  statusOf: (q: LifeQuest) => LifeStatus;
  onAdd: (q: LifeQuest) => void;
  /** 翻到这张（学取舍用） */
  onView?: (q: LifeQuest) => void;
  tone: ReturnType<typeof useTone>;
  names: Record<AttributeId, string>;
}) => {
  const n = items.length;
  const batch = items.map((q) => q.key).join('|');
  // 页码带着它属于哪一批：换一批后自动回到第一张（不靠 effect 回拨，免得新批的第 N 张闪一帧、还被记成「翻到了」）
  const [page, setPage] = useState<{ idx: number; dir: number; batch: string }>({ idx: 0, dir: 0, batch });
  const same = page.batch === batch;
  const cur = n ? Math.min(same ? page.idx : 0, n - 1) : 0;
  const dir = same ? page.dir : 0;
  const q = n ? items[cur] : null;
  useEffect(() => { if (q) onView?.(q); }, [q?.key, onView]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!n || !q) return null;
  const go = (d: number) => setPage((p) => ({ idx: (((p.batch === batch ? p.idx : 0) + d) % n + n) % n, dir: d, batch }));
  const jump = (to: number) => setPage((p) => ({ idx: to, dir: to >= (p.batch === batch ? p.idx : 0) ? 1 : -1, batch }));
  const p5 = tone.channel === 'p5';
  const arrowCls = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[18px] font-black outline-none focus-visible:ring-2 focus-visible:ring-current disabled:opacity-30';
  return (
    <div>
      <div className="relative overflow-hidden" style={{ touchAction: 'pan-y' }}>
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={q.key}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d >= 0 ? '60%' : '-60%', opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d >= 0 ? '-60%' : '60%', opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            drag={n > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.5}
            onDragEnd={(_, info) => {
              if (info.offset.x < -50 || info.velocity.x < -350) go(1);
              else if (info.offset.x > 50 || info.velocity.x > 350) go(-1);
            }}
          >
            <LifeQuestCard q={q} status={statusOf(q)} tone={tone} names={names} onAdd={() => onAdd(q)} index={cur} total={n} />
          </motion.div>
        </AnimatePresence>
      </div>
      {n > 1 && (
        <div className={`flex items-center justify-between gap-2 ${p5 ? 'mt-3' : 'mt-2'}`}>
          {p5
            ? <P5Chip tone="ink" rot={-3} onClick={() => go(-1)} ariaLabel="上一张" className="!px-3 !text-[16px]" style={{ fontFamily: P5_TITLE_FONT }}><span data-testid="life-prev">‹</span></P5Chip>
            : <button type="button" className={arrowCls} style={{ color: tone.accent }} onClick={() => go(-1)} aria-label="上一张" data-testid="life-prev">‹</button>}
          <div className="flex items-center gap-2">
            {items.map((x, i) => {
              const st = statusOf(x);
              const on = i === cur;
              return (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => jump(i)}
                  aria-label={`第 ${i + 1} 张${st !== 'new' ? '（已加入）' : ''}`}
                  data-testid="life-dot"
                  className="flex h-4 items-center justify-center text-[9px] font-black leading-none text-white transition-all"
                  style={p5 ? {
                    // 红频道：斜切小块，选中是长红块，已加入是带勾的黑块
                    width: on ? 24 : st !== 'new' ? 15 : 10,
                    height: on ? 12 : 9,
                    background: on ? P5R.red : st !== 'new' ? P5R.ink : 'rgba(0,0,0,0.28)',
                    clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)',
                  } : {
                    width: on ? 22 : st !== 'new' ? 14 : 8,
                    borderRadius: 999,
                    background: on || st !== 'new' ? tone.accent : tone.bar,
                    opacity: on ? 1 : st !== 'new' ? 0.75 : 1,
                  }}
                >
                  {st !== 'new' && !on ? '✓' : ''}
                </button>
              );
            })}
          </div>
          {p5
            ? <P5Chip tone="ink" rot={3} onClick={() => go(1)} ariaLabel="下一张" className="!px-3 !text-[16px]" style={{ fontFamily: P5_TITLE_FONT }}><span data-testid="life-next">›</span></P5Chip>
            : <button type="button" className={arrowCls} style={{ color: tone.accent }} onClick={() => go(1)} aria-label="下一张" data-testid="life-next">›</button>}
        </div>
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
  const [swapNote, setSwapNote] = useState('');
  const swapQuest = useAppStore((s) => s.swapQuest);
  const markSeen = useQuestSeen((s) => s.mark);
  useEffect(() => { if (open) void refreshQuests(); }, [open, refreshQuests]);
  // 打开就算看过本周的委托：入口的红点消掉
  useEffect(() => { if (open && board.unlocked && board.items.length) markSeen(board.range.weekKey); }, [open, board.unlocked, board.items.length, board.range.weekKey, markSeen]);
  const swapUsed = board.items.some((i) => i.quest.swapped);
  const swap = async (id: string) => {
    triggerNavFeedback();
    const res = await swapQuest(id);
    setSwapNote(res.ok ? '' : (res.reason ?? '换不了'));
  };

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
        {/* 今日委托（第 13 轮加，第 14 批改名并合成一张可左右切的卡）：不用解锁，每天三张 */}
        <div className="flex items-baseline justify-between gap-2">
          <SectionTitle tone={tone}>今日委托</SectionTitle>
          <div className="text-[11px] font-bold" style={{ color: tone.sub }}>{life.items.some((q) => q.ai) ? '三张题库 + 一张 AI 写的' : '每天三张 · 左右滑着挑'}</div>
        </div>
        <div className="mt-2.5" data-testid="life-quests">
          {life.waiting ? (
            // 自定义属性名、题目和属性的对应还在路上（第 17 批）：多半一两秒就好
            <div data-testid="life-waiting" className="flex items-center gap-2.5 px-4 py-6 text-[12.5px] font-bold" style={{ background: tone.card, borderRadius: tone.radius, color: tone.sub }}>
              <motion.span aria-hidden className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} />
              正在按你的属性准备今日委托…
            </div>
          ) : (
            <LifeQuestCarousel items={life.items} statusOf={life.statusOf} onAdd={(q) => void life.add(q)} onView={life.markViewed} tone={tone} names={board.attributeNames} />
          )}
        </div>
        {life.attrNote && !life.waiting && (
          <div data-testid="life-attr-note" className="mt-2 text-[11px] font-bold leading-relaxed" style={{ color: tone.sub }}>{life.attrNote}</div>
        )}
        {!life.waiting && life.items.length > 0 && !life.allTouched && (
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={life.reroll}
              disabled={life.rerollsLeft <= 0}
              className="text-[11.5px] font-black disabled:opacity-40"
              style={{ color: tone.accent }}
              data-testid="life-reroll"
            >
              {/* 一开始只写「换一批」；换过一次才写剩几次（第 16 批用户口径） */}
              {life.rerollsLeft <= 0 ? '今天换不了了，明天再来' : life.rerollsLeft < LIFE_QUEST_REROLLS ? `换一批（今天剩 ${life.rerollsLeft} 次）` : '换一批'}
            </button>
          </div>
        )}

        <div className="mt-5"><SectionTitle tone={tone}>本周委托</SectionTitle></div>
        {!board.unlocked ? (
          tone.channel === 'p5' ? (
            <P5Card seed={77} rot={-0.5} className="mt-3">
              <div className="text-[12px] font-bold leading-relaxed" style={{ color: tone.sub }}>
                自己记满 {QUEST_UNLOCK.minDays} 天、{QUEST_UNLOCK.minRecords} 条记录后解锁：每周一刷新三张，做完来领 SP。
              </div>
            </P5Card>
          ) : (
          <div className="mt-2 px-3 py-3 text-[12px] font-bold leading-relaxed" style={{ background: tone.card, borderRadius: tone.radius, color: tone.sub }}>
            自己记满 {QUEST_UNLOCK.minDays} 天、{QUEST_UNLOCK.minRecords} 条记录后解锁：每周一刷新三张，做完来领 SP。
          </div>
          )
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
              className="relative mt-3 flex items-start gap-2 px-3 py-2 text-[12px] font-bold leading-relaxed"
              style={tone.channel === 'p5'
                ? { background: P5R.ink, color: P5R.white, clipPath: roughSlant(83, 6, 2) }
                : { background: tone.card, borderRadius: Math.max(6, tone.radius - 4) }}
            >
              <span className="min-w-0 flex-1">{questNotice}</span>
              <button type="button" onClick={clearQuestNotice} aria-label="知道了" className="shrink-0 text-[14px] leading-none opacity-60">×</button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3 space-y-2.5">
          {board.items.map((item) => (
            <QuestCard
              key={item.quest.id}
              item={item}
              tone={tone}
              names={board.attributeNames}
              onClaim={() => claim(item.quest.id)}
              flash={flash[item.quest.id] ?? null}
              onSwap={!swapUsed && !item.done && !item.claimed ? () => void swap(item.quest.id) : undefined}
            />
          ))}
          {board.items.length > 0 && (
            <div className="text-right text-[11px] font-bold" style={{ color: tone.sub }} data-testid="quest-swap-note">
              {swapNote || (swapUsed ? '本周的「换一张」用过了，下周一再来' : '不想做的那张可以「换一张」，每周一次')}
            </div>
          )}
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
