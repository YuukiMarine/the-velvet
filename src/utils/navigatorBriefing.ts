/**
 * navigatorBriefing — 用户简报（第 25 批 · PRD §24.10.3）：人格初始化 / 切换时「ta 是个什么样的人」的梗概，全部从记录算。
 *
 * 概念划分：**记录是用户的，记忆是关系的**。简报对所有人格可见、不受「记忆按人格隔离」影响，只受两个东西管：
 *   · 设置「让助手了解你的记录」（第 35 批 f 起三档 navigatorRecordsLevel：关 = 只有今日状态 + 该人格自己的记忆——给想要纯净角色陪伴、
 *     或按自己定的世界观行动的用户；中 = 缺省，简报 / 近况流 / 记录检索 / 按需查询 / 画像参考记录；高 = 再加塔罗块，见 navigatorTarot）；
 *   · 每个人格的「认识你多久了」（knowSince：一直都在 = 全知接手；刚认识 = 头 7 天只看得到今日状态）。
 * 本地算、约 200 token、按天 + 数据签名缓存；放天级块里跟着人格一起吃前缀缓存。首次见面另有一句「别炫耀」。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { dayLabelCN, daysBetween, keyOfDate } from '@/utils/navigatorClock';
import {
  activeCountdowns, activeWishes, attrName, attrRanking, bigDealsCleared, habits, recentSummaries, recordStreak, summaryFacts,
  usageFacts, wishProgress,
} from '@/utils/navigatorRecords';
import type { NavigatorPreset, Settings } from '@/types';

export const FRESH_DAYS = 7;

/** 「让助手了解你的记录」三档（第 35 批 f）：off 只有今日状态 + 聊天记忆；mid（缺省）= 现在这些；high 再加塔罗块 */
export type RecordsLevel = 'off' | 'mid' | 'high';
export const RECORDS_LEVELS: RecordsLevel[] = ['off', 'mid', 'high'];
export const RECORDS_LEVEL_LABELS: Record<RecordsLevel, string> = { off: '关', mid: '中', high: '高' };
/** 各档的一句说明（设置页两处共用） */
export const RECORDS_LEVEL_DESC: Record<RecordsLevel, string> = {
  off: '只知道今天的状态和聊天里记下的事——想要纯净一点的角色陪伴、或让它按你定的世界观来，就选这档',
  mid: '知道你用了多久、常练的属性、坚持的习惯、做成的大事、愿望、最近发生的事；聊到相关的会想起对应的记录，问起能查',
  high: '中档的全部，再加上最近两周抽的塔罗、进行中的占卜（含一句解读结论）和生效中的窥探命运',
};

/** 没设过档位的按旧开关折算：关 → off，否则 mid */
export const recordsLevelOf = (settings: Pick<Settings, 'navigatorBriefing' | 'navigatorRecordsLevel'>): RecordsLevel =>
  settings.navigatorRecordsLevel ?? (settings.navigatorBriefing === false ? 'off' : 'mid');

/** 改档要写的那一笔：新字段 + 旧开关同步（老版本 / 旧读点照旧） */
export const recordsLevelPatch = (level: RecordsLevel): Pick<Settings, 'navigatorBriefing' | 'navigatorRecordsLevel'> =>
  ({ navigatorRecordsLevel: level, navigatorBriefing: level !== 'off' });

export const briefingEnabled = (settings: Settings): boolean => recordsLevelOf(settings) !== 'off';
/** 高档：塔罗块等本次新增的内容 */
export const recordsHigh = (settings: Settings): boolean => recordsLevelOf(settings) === 'high';

/** 「刚认识」的人格头 7 天不看简报 */
export function briefingAllowedFor(preset: Pick<NavigatorPreset, 'knowSince' | 'createdAt' | 'isBuiltin'>, todayKey: string = toLocalDateKey()): boolean {
  if (preset.knowSince !== 'fresh') return true;
  const since = keyOfDate(new Date(preset.createdAt));
  return daysBetween(since, todayKey) >= FRESH_DAYS;
}

let cache: { sig: string; text: string } | null = null;

/** 只有数据的简报正文（不含标签行）；没什么可说的返回空串 */
export function buildBriefing(todayKey: string = toLocalDateKey()): string {
  const s = useAppStore.getState();
  const orgs = useCloudSocialStore.getState().orgs;
  const sig = [todayKey, s.activities.length, s.todos.length, s.todoCompletions.length, s.wishes.length, s.callingCards.length, s.confidants.length, s.summaries.length, orgs.length, s.attributes.map((a) => a.points).join(',')].join('|');
  if (cache && cache.sig === sig) return cache.text;
  const lines: string[] = [];
  const use = usageFacts(todayKey);
  if (use.records > 0) {
    const streak = recordStreak(todayKey);
    lines.push(`- 用这个 App 第 ${use.days} 天，一共记了 ${use.records} 条${streak.days >= 3 ? `，最近连续记了 ${streak.days} 天` : ''}`);
  }
  const rank = attrRanking();
  if (rank.length >= 2 && rank[0].points > 0) {
    const top = rank[0];
    const low = rank[rank.length - 1];
    lines.push(`- 练得最多的是${attrName(top.id)}（Lv.${top.level}）${low.points < top.points ? `，最少动的是${attrName(low.id)}` : ''}`);
  }
  const hs = habits(3, todayKey);
  if (hs.length) lines.push(`- 坚持中的每日任务：${hs.map((h) => `「${h.todo.title}」近 30 天做到 ${h.done} 天`).join('、')}`);
  const bigs = bigDealsCleared().slice(0, 3);
  if (bigs.length) lines.push(`- 做成过的大事：${bigs.map((b) => `「${b.todo.title}」（${dayLabelCN(b.dateKey, todayKey)}）`).join('、')}`);
  const ws = activeWishes(3);
  if (ws.length) lines.push(`- 正在追的愿望：${ws.map((w) => { const p = wishProgress(w); return `「${w.title}」${p !== undefined ? `约 ${p}%` : ''}`; }).join('、')}`);
  const cds = activeCountdowns(todayKey).filter((c) => c.daysLeft <= 30).slice(0, 3);
  if (cds.length) lines.push(`- 倒计时：${cds.map((c) => `「${c.card.title}」还有 ${c.daysLeft} 天（${dayLabelCN(c.card.targetDate!, todayKey)}）`).join('、')}`);
  const cons = [...s.confidants].sort((a, b) => b.intimacy - a.intimacy).slice(0, 3).map((c) => c.name).filter(Boolean);
  if (cons.length) lines.push(`- 羁绊页里记着的人：${cons.join('、')}`);
  const orgNames = orgs.map((o) => o.org?.name).filter(Boolean).slice(0, 2);
  if (orgNames.length) lines.push(`- 组织：${orgNames.map((n) => `「${n}」`).join('、')}`);
  const sums = recentSummaries(2);
  if (sums.length) lines.push(`- 最近的成长总结（只有数据）：${sums.map((x) => summaryFacts(x, todayKey)).join('；')}`);
  const text = lines.join('\n');
  cache = { sig, text };
  return text;
}

/** 天级块：标签 + 正文；设置关着 / 人格还在「刚认识」期 / 没内容 → 空串 */
export function briefingBlock(preset: NavigatorPreset, settings: Settings, todayKey: string = toLocalDateKey()): string {
  if (!briefingEnabled(settings) || !briefingAllowedFor(preset, todayKey)) return '';
  const body = buildBriefing(todayKey);
  if (!body) return '';
  return `【关于 ta（来自 ta 在 App 里的记录；是你早就知道的背景，别拿来炫耀、别一口气复述，他说起什么再接什么）】\n${body}`;
}

/** 「刚认识」期的说明（简报关着时不需要） */
export function freshIntroLine(preset: NavigatorPreset, settings: Settings, todayKey: string = toLocalDateKey()): string {
  if (!briefingEnabled(settings) || preset.knowSince !== 'fresh' || briefingAllowedFor(preset, todayKey)) return '';
  const left = FRESH_DAYS - daysBetween(keyOfDate(new Date(preset.createdAt)), todayKey);
  return `【你们刚认识不久】ta 的记录你还没看过（再过 ${left} 天才会熟悉起来），现在只知道今天的状态和他亲口说的：别装熟、别猜他的过去。`;
}

/** 这个人格第一次见面、而且手上有简报：知道但别炫耀 */
export const FIRST_MEET_LINE =
  '【第一次见面】你手上有 ta 的记录，但别第一句就把 ta 的事全抖出来；像早就在这里的人那样自然，他说起什么再接什么。';
