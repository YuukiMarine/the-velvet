/**
 * navigatorProfileRefresh — 画像整理（第 33 批 · PRD §26.3b）。
 *
 * 画像以前只有一条路会改：聊天归档时归档器顺手改（够长的会话才改）。这里补两条：
 *   · 参考我的记录：每 5 天一次（开助手窗时后台跑），把记录里的事实（愿望 / 倒计时 / 宣告卡 / 做成的大事 /
 *     坚持中的每日任务 / 本周目标）交给同一套口径，**只准改「长期目标」和「近况」**——记录推不出他喜欢什么、
 *     讨厌什么、希望被怎样对待，偏好与雷区、相处守则只认聊天里亲口说的；
 *   · 现在整理一次：记事本里手动点，按最近几次聊天的摘要 + 关于他的记忆 + 记录跑一遍，先给用户看改了哪几块，确认才写。
 * 两条都绕开锁住的块；写进去的块记下「AI · 哪天 · 来自聊天 / 记录」。
 * 开关：设置「画像自动更新」（navigatorProfileAuto）管所有 AI 改画像；「参考我的记录」另受「让助手了解你的记录」管。
 */
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { chatComplete, getAIConfig, type AIMessage } from '@/utils/aiClient';
import { BUILTIN_NAVIGATOR_PRESETS } from '@/constants/navigatorPresets';
import { dayLabelCN, daysBetween } from '@/utils/navigatorClock';
import { activeCountdowns, activeWishes, attrName, bigDealsCleared, habits, wishProgress } from '@/utils/navigatorRecords';
import { briefingEnabled } from '@/utils/navigatorBriefing';
import { isPromise } from '@/utils/navigatorPromise';
import { getProfileState, isRecentStale, memoryIsolated, memoVisibleTo, PROFILE_KEYS, PROFILE_LABELS, PROFILE_LIMITS, profileAutoOn, profileTextForPrompt, saveProfileBlocks, withoutLocked } from '@/utils/navigatorMemory';
import type { ProfileBlocks, WeeklyGoalItem } from '@/types';

/** 参考记录整理画像的间隔（天；用户 10-27 定） */
export const PROFILE_RECORDS_EVERY_DAYS = 5;
/** 记录只准改这两块 */
const RECORD_KEYS: Array<keyof ProfileBlocks> = ['goals', 'recent'];

/** 「参考我的记录」现在生效没有：画像自动更新开着 + 这个开关开着 + 「让助手了解你的记录」开着 */
export const profileFromRecordsOn = (): boolean => {
  const s = useAppStore.getState().settings;
  return profileAutoOn() && s.navigatorProfileFromRecords !== false && briefingEnabled(s);
};

const goalItemText = (g: WeeklyGoalItem): string => {
  const attr = g.attribute ? attrName(g.attribute) : '';
  switch (g.type) {
    case 'activity_count': return `记 ${g.target} 次${attr}的记录（已 ${g.current}）`;
    case 'todo_count': return `完成 ${g.target} 次任务（已 ${g.current}）`;
    case 'attr_points': return `拿 ${g.target} 点${attr}（已 ${g.current}）`;
    case 'total_points': return `拿 ${g.target} 点总点数（已 ${g.current}）`;
    default: return '';
  }
};

/** 记录里能拿来写「长期目标 / 近况」的事实（纯本地，一行一类）；没什么可说的返回 [] */
export function recordFactsForProfile(todayKey: string = toLocalDateKey()): string[] {
  const s = useAppStore.getState();
  const lines: string[] = [];
  const ws = activeWishes(5);
  if (ws.length) lines.push(`- 正在追的愿望：${ws.map((w) => { const p = wishProgress(w); return `「${w.title}」${p !== undefined ? `约 ${p}%` : ''}`; }).join('、')}`);
  const cds = activeCountdowns(todayKey).slice(0, 4);
  if (cds.length) lines.push(`- 倒计时：${cds.map((c) => `「${c.card.title}」还有 ${c.daysLeft} 天（${dayLabelCN(c.card.targetDate!, todayKey)}）`).join('、')}`);
  const decl = s.callingCards.filter((c) => !c.archived && !c.targetDate).slice(0, 3);
  if (decl.length) lines.push(`- 宣告卡（立下要做的事）：${decl.map((c) => `「${c.title}」${c.subtitle ? `——${c.subtitle}` : ''}`).join('、')}`);
  const bigs = bigDealsCleared().filter((b) => daysBetween(b.dateKey, todayKey) <= 60).slice(0, 3);
  if (bigs.length) lines.push(`- 最近做成的大事：${bigs.map((b) => `「${b.todo.title}」（${dayLabelCN(b.dateKey, todayKey)}）`).join('、')}`);
  const hs = habits(5, todayKey);
  if (hs.length) lines.push(`- 坚持中的每日任务：${hs.map((h) => `「${h.todo.title}」近 30 天做到 ${h.done} 天`).join('、')}`);
  const wg = s.weeklyGoals.find((g) => g.weekStart <= todayKey && g.weekEnd >= todayKey);
  if (wg) {
    const items = wg.goals.map(goalItemText).filter(Boolean);
    if (items.length) lines.push(`- 本周目标：${items.join('、')}${wg.reward ? `（完成奖励：${wg.reward}）` : ''}${wg.completed ? '，已达成' : ''}`);
  }
  return lines;
}

/** 聊天这一路的材料：最近几次聊天的摘要（隔离开着只看这个人格的）+ 它读得到的、关于用户的记忆 */
async function chatMaterial(presetId: string | undefined, todayKey: string): Promise<string[]> {
  const cat = BUILTIN_NAVIGATOR_PRESETS[0].id;
  const out: string[] = [];
  try {
    const sessions = (await db.navigatorSessions.toArray())
      .filter((x) => !!x.compactedSummary && daysBetween(x.dateKey, todayKey) <= 21 && (!presetId || !memoryIsolated() || (x.presetId ?? cat) === presetId))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, 6);
    for (const x of sessions) out.push(`- ${dayLabelCN(x.dateKey, todayKey)}聊的：${x.compactedSummary}`);
    const memos = (await db.navigatorMemos.where('status').equals('active').toArray())
      .filter((m) => m.source !== 'profile' && m.source !== 'bit' && !isPromise(m) && memoVisibleTo(m, presetId))
      .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || b.importance - a.importance || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);
    for (const m of memos) out.push(`- 记得：${m.text}`);
  } catch { /* 材料少一点而已 */ }
  return out;
}

const REFRESH_PROTOCOL = `你是用户画像整理员。给你【现有用户画像】和几份材料，更新画像。
只输出这一个 JSON 对象（不要代码块、不要其它文字）：{"profile":null,"from":{}}
- 画像五块：identity 身份与处境 / goals 长期目标 / preferences 偏好与雷区 / recent 近况 / rules 相处守则（他希望你怎么对他）。
  只输出**有变化的块**，每块写更新后的全文（identity / goals / preferences ≤120 字，recent / rules ≤100 字，中性第三人称，合并去重）：如 {"profile":{"recent":"…"},"from":{"recent":"records"}}；都没变化就 {"profile":null}。
- from：每个改了的块按什么改的，chat（聊天里的材料）或 records（App 里的记录）。
- 【App 里的记录】只能用来改 goals 和 recent：goals 写他长期在追的事，recent 写最近这阵子在忙什么、状态怎样。
  记录推不出他喜欢什么、讨厌什么、希望被怎样对待——identity、preferences、rules 不要根据记录改。
- 【聊天里的材料】里他亲口说过的，几块都可以据此改；rules 只在他明确表达过时写，写成「他希望…」。
- 【只能改这几块】之外的块一个字都不要输出。
- 每块后面括号里写了它上次是谁、哪天、据什么改的：**用户手改**的块只在材料里他亲口说的和它明显矛盾、或有了新进展时才改，别用你的措辞重写它。
- 标了「可能过时」的近况：材料里有新近况就重写；没有就输出 "recent":"" 把它清掉（只有这种情况才允许输出空串）。
- 旧内容仍然对就保留，过时的改掉；一次性的琐事不进画像；不编材料里没有的事。`;

export interface ProfileProposal {
  /** 改完以后的整份（没改的块原样） */
  next: ProfileBlocks;
  /** 改了哪几块 */
  changed: Array<keyof ProfileBlocks>;
  fromByKey: Partial<Record<keyof ProfileBlocks, 'chat' | 'records'>>;
}

/**
 * 跑一次整理，**不写库**（记事本先给用户看改了哪几块）。chat / records = 用哪几路材料。
 * 返回 null = 没配 AI / 调用失败 / 材料为空；changed 为空 = 跑了但没什么要改。
 */
export async function proposeProfileRefresh(presetId: string | undefined, opts: { chat: boolean; records: boolean }, todayKey: string = toLocalDateKey()): Promise<ProfileProposal | null> {
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (!cfg) return null;
  const st = await getProfileState(presetId);
  const facts = opts.records ? recordFactsForProfile(todayKey) : [];
  const talk = opts.chat ? await chatMaterial(presetId, todayKey) : [];
  if (!facts.length && !talk.length) return { next: st.blocks, changed: [], fromByKey: {} };
  const allowed = (opts.chat ? PROFILE_KEYS : RECORD_KEYS).filter((k) => !st.locks.includes(k));
  if (!allowed.length) return { next: st.blocks, changed: [], fromByKey: {} };
  const profileText = profileTextForPrompt(st.blocks, st.meta, todayKey);
  const messages: AIMessage[] = [
    { role: 'system', content: REFRESH_PROTOCOL },
    {
      role: 'user',
      content: [
        `今天是 ${dayLabelCN(todayKey)}（${todayKey}）。`,
        `【现有用户画像】\n${profileText}`,
        `【只能改这几块】${allowed.map((k) => `${k}（${PROFILE_LABELS[k]}）`).join('、')}`,
        facts.length ? `【App 里的记录】\n${facts.join('\n')}` : '',
        talk.length ? `【聊天里的材料】\n${talk.join('\n')}` : '',
      ].filter(Boolean).join('\n'),
    },
  ];
  let raw: string;
  try {
    try {
      raw = await chatComplete(cfg, messages, { temperature: 0.3, maxTokens: 700, jsonMode: true, purpose: 'profile-refresh' });
    } catch (e) {
      if (e instanceof Error && e.message.includes('空响应')) raw = await chatComplete(cfg, messages, { temperature: 0.3, maxTokens: 700, jsonMode: false, purpose: 'profile-refresh' });
      else throw e;
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[navigator] 画像整理失败', e);
    return null;
  }
  const parsed = (() => {
    const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
  })();
  if (!parsed) return null;
  const patch: Partial<ProfileBlocks> = {};
  const fromByKey: ProfileProposal['fromByKey'] = {};
  const prof = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile as Record<string, unknown> : {};
  const from = parsed.from && typeof parsed.from === 'object' ? parsed.from as Record<string, unknown> : {};
  for (const k of allowed) {
    const v = typeof prof[k] === 'string' ? (prof[k] as string).replace(/\s+/g, ' ').trim().slice(0, PROFILE_LIMITS[k]) : '';
    // 过时的近况（>30 天）它说清掉（输出了空串）→ 清（第 35 批 f）；别的块空串一律当没改
    if (!v && !(k === 'recent' && prof.recent === '' && st.blocks.recent && isRecentStale(st.meta, todayKey))) continue;
    if (v === (st.blocks[k] ?? '')) continue;
    patch[k] = v;
    // 只给了记录这一路就是 records；两路都有按模型说的，没说的算聊天
    fromByKey[k] = !opts.chat ? 'records' : from[k] === 'records' ? 'records' : 'chat';
  }
  const safe = withoutLocked(patch, st.locks);
  const changed = PROFILE_KEYS.filter((k) => safe[k] !== undefined);
  return { next: { ...st.blocks, ...safe }, changed, fromByKey };
}

/** 把整理结果写进去（记事本「确认」/ 后台参考记录） */
export async function applyProfileProposal(presetId: string | undefined, p: ProfileProposal, opts: { recordsRun?: boolean } = {}): Promise<void> {
  const today = toLocalDateKey();
  // 写之前再看一眼锁（预览到确认之间用户可能刚锁上一块）
  const st = await getProfileState(presetId);
  const keep = p.changed.filter((k) => !st.locks.includes(k));
  if (!keep.length && !opts.recordsRun) return;
  const next: ProfileBlocks = { ...st.blocks };
  for (const k of keep) next[k] = p.next[k];
  await saveProfileBlocks(next, presetId, { by: 'ai', fromByKey: p.fromByKey, day: today, ...(opts.recordsRun ? { recordsAt: today } : {}) });
}

let refreshing: Promise<boolean> | null = null;

/**
 * 每 5 天参考一次记录（开助手窗时后台调，不挡问候）：到点才跑；跑过（哪怕没什么要改）就记下今天；调用失败不记、下次开窗再试。
 * 返回 true = 改了画像。
 */
export function maybeRefreshProfileFromRecords(presetId: string | undefined, todayKey: string = toLocalDateKey()): Promise<boolean> {
  if (refreshing) return refreshing;
  const run = (async () => {
    try {
      if (!profileFromRecordsOn() || !getAIConfig(useAppStore.getState().settings)) return false;
      const st = await getProfileState(presetId);
      if (st.recordsAt && daysBetween(st.recordsAt, todayKey) < PROFILE_RECORDS_EVERY_DAYS) return false;
      const p = await proposeProfileRefresh(presetId, { chat: false, records: true }, todayKey);
      if (!p) return false;
      // 画像还一块都没有、记录也没给出东西：不建空行，等以后再说
      if (!p.changed.length && !PROFILE_KEYS.some((k) => st.blocks[k])) return false;
      await applyProfileProposal(presetId, p, { recordsRun: true });
      return p.changed.length > 0;
    } catch {
      return false;
    }
  })();
  // 单飞：同时开两次窗只跑一份（finally 挂在外面：里面同步 return 时赋值还没发生，挂里面会把锁永远留住）
  refreshing = run;
  void run.finally(() => { if (refreshing === run) refreshing = null; });
  return run;
}
