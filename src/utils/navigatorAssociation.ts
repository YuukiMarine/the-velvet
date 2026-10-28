/**
 * navigatorAssociation — 走神位（第 26 批 · PRD §24.11）：闲聊时偶尔顺口想起一条不那么相关的旧事。
 *
 * 四种「按结构取」的方式（变化 / 快到的事 / 细节 / 后续）之外，真人还会联想：说到咖啡想起键盘事故，下雨天想起上次下雨的事，
 * 满月夜黑猫格外精神。机制只负责在对的时机把对的原料放到模型眼前，联想本身交给模型；本地不算语义。
 *   · 线索（cues）：归档器写在记忆上的 2~6 个词；读取时和三样做松匹配——当前话题簇（最近几句）、此刻情境（时段 / 天气 / 月相 / 季节）、
 *     人格兴趣（traits 的喜好）。
 *   · 稀疏触发 + 冷却：只在 chat、精力正常或高时开（intent 层按姿态门控，这里只管概率和冷却）；设置「走神」不 / 偶尔（三成）/ 经常（六成），
 *     5 轮内不重复。
 *   · 打分：线索重合（低权重）+ 人格兴趣 + 情绪色彩 + 情境 + 新鲜度 + 随机抖动。取最高一条，低于阈值不走神。
 *   · 触发时写明「可能的由头」帮弱模型把过渡说顺，并写「想不起来也行」。
 */
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { isMetaMemo, memoVisibleTo } from '@/utils/navigatorMemoryScope';
import { tokenize, queryChars } from '@/utils/navigatorIndex';
import { traitsOf } from '@/utils/navigatorDay';
import { moonPhaseOf } from '@/utils/moonPhase';
import { seasonOfDate, SEASON_META } from '@/utils/calendar';
import { peekWeatherNow, weatherConfigOf } from '@/utils/weather';
import { shortMD, keyOfDate } from '@/utils/navigatorClock';
import { isPromise } from '@/utils/navigatorPromise';
import type { NavigatorMemo, NavigatorPreset, Settings } from '@/types';

const LEDGER_KEY = 'velvet.navAssoc.v1';
const COOLDOWN_TURNS = 5;
const THRESHOLD = 1.0;

interface AssocLedger { turns: number; lastFired: number }
const readLedger = (): Record<string, AssocLedger> => {
  try { const raw = localStorage.getItem(LEDGER_KEY); return raw ? (JSON.parse(raw) as Record<string, AssocLedger>) : {}; } catch { return {}; }
};
const writeLedger = (v: Record<string, AssocLedger>) => { try { localStorage.setItem(LEDGER_KEY, JSON.stringify(v)); } catch { /* */ } };

/** 每轮记一次（store 在回合开始时调） */
export function assocTick(presetId: string): number {
  const all = readLedger();
  const cur = all[presetId] ?? { turns: 0, lastFired: -100 };
  cur.turns += 1;
  all[presetId] = cur;
  writeLedger(all);
  return cur.turns;
}

export const daydreamChance = (settings: Settings): number =>
  settings.navigatorDaydream === 'off' ? 0 : settings.navigatorDaydream === 'often' ? 0.6 : 0.3;

/** 此刻的情境词（时段 / 天气 / 月相 / 季节 / 节日） */
export function situationTokens(settings: Settings, now: Date = new Date()): { tokens: Set<string>; label: string[] } {
  const tokens = new Set<string>();
  const label: string[] = [];
  const h = now.getHours();
  const tod = h < 5 ? '深夜' : h < 11 ? '早上' : h < 14 ? '中午' : h < 18 ? '下午' : h < 23 ? '晚上' : '深夜';
  tokens.add(tod); if (tod === '深夜') { tokens.add('熬夜'); tokens.add('失眠'); }
  const moon = moonPhaseOf(now);
  if (moon.full) { tokens.add('满月'); tokens.add('月亮'); label.push('今晚满月'); }
  const season = SEASON_META[seasonOfDate(keyOfDate(now))]?.name;
  if (season) tokens.add(season);
  try {
    const w = peekWeatherNow(weatherConfigOf(settings));
    if (w) {
      const t = w.text ?? '';
      if (/雨/.test(t)) { tokens.add('雨'); tokens.add('下雨'); tokens.add('雨天'); label.push('外面在下雨'); }
      if (/雪/.test(t)) { tokens.add('雪'); tokens.add('下雪'); label.push('外面在下雪'); }
      if (/晴/.test(t)) { tokens.add('晴'); tokens.add('太阳'); tokens.add('晒太阳'); }
      if (/阴|云/.test(t)) tokens.add('阴天');
      if (typeof w.temp === 'number' && w.temp <= 8) { tokens.add('冷'); tokens.add('降温'); label.push('今天很冷'); }
      if (typeof w.temp === 'number' && w.temp >= 32) { tokens.add('热'); label.push('今天很热'); }
    }
  } catch { /* 没开天气 */ }
  return { tokens, label };
}

export interface AssociationPick {
  memo: NavigatorMemo;
  line: string;
}

const overlap = (a: Set<string>, b: Iterable<string>): number => { let n = 0; for (const x of b) if (a.has(x)) n++; return n; };

/**
 * 挑一条可以顺口想起的旧事。recentUser = 最近几句用户的话（新的在后）；excludeIds = 这轮已经按相关度召回的。
 * 返回 null = 这轮不走神（概率没中 / 冷却中 / 没有像样的候选）。
 */
export async function pickAssociation(
  preset: NavigatorPreset,
  settings: Settings,
  recentUser: string[],
  excludeIds: Set<string>,
  energy: 'low' | 'normal' | 'high' | null = null,
  rand: () => number = Math.random,
): Promise<AssociationPick | null> {
  const chance = daydreamChance(settings);
  if (chance <= 0) return null;
  const all = readLedger();
  const led = all[preset.id] ?? { turns: 0, lastFired: -100 };
  if (led.turns - led.lastFired < COOLDOWN_TURNS) return null;
  if (rand() > chance) return null;
  let memos: NavigatorMemo[] = [];
  try {
    memos = (await db.navigatorMemos.where('status').equals('active').toArray())
      .filter((m) => !isMetaMemo(m) && !m.muted && !excludeIds.has(m.id) && memoVisibleTo(m, preset.id))
      .filter((m) => !isPromise(m) || (m.promiseState ?? 'waiting') !== 'waiting');
  } catch { return null; }
  if (!memos.length) return null;
  const now = Date.now();
  const topic = new Set<string>();
  recentUser.slice(-3).forEach((t, i, arr) => { for (const tok of tokenize(t)) topic.add(tok); if (i === arr.length - 1) for (const c of queryChars(t)) topic.add(c); });
  const traits = traitsOf(preset);
  const interest = new Set<string>();
  for (const s of [...(traits?.likes ?? []), ...(traits?.dislikes ?? []), ...(traits?.habits ?? [])]) for (const tok of tokenize(s)) interest.add(tok);
  const situ = situationTokens(settings, new Date(now));
  let best: { m: NavigatorMemo; score: number; why: string[] } | null = null;
  for (const m of memos) {
    const toks = new Set([...tokenize(m.text), ...(m.cues ?? []).flatMap((c) => [c, ...tokenize(c)])]);
    const why: string[] = [];
    let score = 0;
    const t = overlap(topic, toks); if (t) { score += Math.min(1.2, t * 0.4); why.push('对方刚说到的事和它沾边'); }
    const i = overlap(interest, toks); if (i) { score += Math.min(1.0, i * 0.5); why.push('正好是你在意的东西'); }
    const s = overlap(situ.tokens, toks); if (s) { score += Math.min(1.0, s * 0.5); why.push(situ.label[0] ?? '此刻的情境像'); }
    const hint = m.colorHint ?? '';
    if (energy === 'high' && /开心|得意|兴奋|高兴|好笑|哈哈/.test(hint)) { score += 0.5; why.push('他现在兴致高，这事也是高兴的'); }
    if (energy === 'low' && /难过|沮丧|失落|低落/.test(hint)) score -= 0.5;
    const lastSeen = new Date(m.lastRecalledAt ?? m.createdAt).getTime();
    if (now - lastSeen > 7 * 86400_000) score += 0.5;
    if (now - lastSeen < 2 * 86400_000) score -= 0.8;
    score += rand() * 0.5;
    if (!best || score > best.score) best = { m, score, why };
  }
  if (!best || best.score < THRESHOLD) return null;
  all[preset.id] = { turns: led.turns, lastFired: led.turns };
  writeLedger(all);
  void db.navigatorMemos.update(best.m.id, { lastRecalledAt: new Date(now) }).catch(() => {});
  const day = shortMD(keyOfDate(new Date(best.m.createdAt)));
  const why = best.why.length ? `由头：${best.why.slice(0, 2).join('，')}` : '由头：想到就想到了';
  return {
    memo: best.m,
    line: `【可以顺口想起的旧事（想不起来也行；要提就一句带过、像忽然想到的那样，不解释来历，这轮之后别再提）】（${day} 记）${best.m.text}${best.m.colorHint ? `（当时${best.m.colorHint}）` : ''}——${why}`,
  };
}

/** 测试 / 调试：当前记账 */
export const peekAssoc = (presetId: string): AssocLedger | null => readLedger()[presetId] ?? null;
/** 今天的日期键（供测试对照） */
export const assocToday = (): string => toLocalDateKey();
export const assocSettings = (): Settings => useAppStore.getState().settings;
