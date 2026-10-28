/**
 * navigatorDiary — 日记（第 36 批 c · LIVE MODE C）：助手以自己的口吻写「今天和他相处的这一天」。
 *
 * 写在第二天首开（主泵归档之后、后台、不挡问候）：这个人格 14 天内、那天用户开过口（问候不算）、还没写过也没被删的会话，
 * 每次最多补 3 篇。单独一次调用（不塞进归档器的 JSON，防截断）：300–400 字左右、不做字数检定；同时出 60 字缩略和一句
 * 「明天想对他说」（第二天心思的种子，navigatorInner）。材料 = 那天的对话原文（节选）+ 那天心里过的几遍（reads）+ 归档摘要。
 * 那天沉下来过：只写陪伴，不复述原话、不分析。
 * 注入替掉「最近几次聊天的摘要」：近 3 天全文、4–14 天一行缩略、更早不带（沉进印象 / 成长记录 / 画像）；没日记的日子退回摘要行。
 * 存在会话行上（diary），随会话行上云；记事本「日记」页签每人格一本、可删（删了不重写）。
 */
import { db } from '@/db';
import { toLocalDateKey } from '@/store';
import { chatComplete, getAIConfig, getAssistantAIConfig } from '@/utils/aiClient';
import { BUILTIN_NAVIGATOR_PRESETS, personaWithExamples, resolveNavigatorPreset } from '@/constants/navigatorPresets';
import { dayLabelCN, daysBetween, relativeDayCN } from '@/utils/navigatorClock';
import { rowsToLines } from '@/utils/navigatorMemory';
import type { NavigatorDiary, NavigatorPreset, NavigatorSessionRow, Settings } from '@/types';

export const DIARY_FULL_DAYS = 3;
export const DIARY_BRIEF_DAYS = 14;
const DIARY_PER_RUN = 3;

const catId = BUILTIN_NAVIGATOR_PRESETS[0].id;
const ownerOf = (s: Pick<NavigatorSessionRow, 'presetId'>): string => s.presetId ?? catId;

export interface DiaryEntry {
  sessionId: string;
  dateKey: string;
  diary: NavigatorDiary;
}

/** 这个人格的日记（新的在前） */
export async function listDiaries(presetId: string, limit = 60): Promise<DiaryEntry[]> {
  try {
    return (await db.navigatorSessions.toArray())
      .filter((s) => ownerOf(s) === presetId && !!s.diary && !s.diaryDeleted)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, limit)
      .map((s) => ({ sessionId: s.id, dateKey: s.dateKey, diary: s.diary! }));
  } catch { return []; }
}

/** 删掉这一篇（不重写） */
export async function deleteDiary(sessionId: string): Promise<void> {
  await db.navigatorSessions.update(sessionId, { diary: undefined, diaryDeleted: true, updatedAt: new Date() });
}

const DIARY_RULES = (dateLabel: string, heavy: boolean): string => [
  `现在不是在聊天：写你 ${dateLabel} 的日记——以你自己的身份、你平时的口吻，写这一天和他相处的样子。`,
  '要求：三百到四百字上下，第一人称，像写给自己看的，不是写给他看的；写他这天的样子、你当时的感受、你注意到的小事、你没说出口的话，也可以有一点你自己的事。',
  '不复述整段对话、不列清单、不写标题、不写日期开头；不写卡片 / 待办确认这类功能；不编材料里没有的事。',
  heavy ? '这天他很沉：只写你陪着他的心情和你对他的在意，**不复述他说的任何原话，不分析他为什么**。' : '',
  '只输出这一个 JSON（不要代码块）：{"diary":"正文","brief":"≤60 字的中性第三人称缩略（这天聊了什么、他状态如何）","seed":"明天想对他说的一句（≤30 字，你的口吻）或 null"}',
].filter(Boolean).join('\n');

const extract = (raw: string): Record<string, unknown> | null => {
  const t = raw.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
};

/** 写一篇（材料不够 / 没 Key / 失败返回 null） */
export async function composeDiary(preset: NavigatorPreset, session: NavigatorSessionRow, settings: Settings, todayKey: string = toLocalDateKey()): Promise<NavigatorDiary | null> {
  const cfg = getAssistantAIConfig(settings) ?? getAIConfig(settings);
  if (!cfg) return null;
  let lines: string[] = [];
  let heavy = false;
  try {
    const rows = await db.navigatorMessages.where('sessionId').equals(session.id).sortBy('createdAt');
    heavy = rows.some((r) => !!r.heavy);
    lines = rowsToLines(rows).slice(-80);
  } catch { /* 原文可能已过保存期 */ }
  const reads = (session.reads ?? []).slice(-12).map((r) => `- ${r.text}`);
  if (!lines.length && !session.compactedSummary && !reads.length) return null;
  const material = [
    `这天是 ${dayLabelCN(session.dateKey, todayKey)}（${relativeDayCN(session.dateKey, todayKey)}）。`,
    session.compactedSummary ? `【归档摘要】${session.compactedSummary}` : '',
    reads.length ? `【你当时心里过的几遍】\n${reads.join('\n')}` : '',
    lines.length ? `【对话原文（节选）】\n${lines.map((l) => l.slice(0, 200)).join('\n')}` : '',
  ].filter(Boolean).join('\n');
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: `${personaWithExamples(preset)}\n\n${DIARY_RULES(dayLabelCN(session.dateKey, todayKey), heavy)}` },
      { role: 'user', content: material },
    ], { temperature: 0.8, maxTokens: 1100, jsonMode: true, timeoutMs: 90000, purpose: 'diary' });
    const parsed = extract(raw);
    const text = String(parsed?.diary ?? '').trim();
    if (text.length < 40) return null;
    const brief = String(parsed?.brief ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || text.slice(0, 60);
    const seedRaw = String(parsed?.seed ?? '').replace(/\s+/g, ' ').trim().replace(/^["“「]|["”」]$/g, '');
    const seed = seedRaw && seedRaw !== 'null' ? seedRaw.slice(0, 40) : undefined;
    return { text: text.slice(0, 1200), brief, ...(seed ? { seed } : {}), writtenAt: new Date().toISOString(), source: 'ai', ...(heavy ? { heavy: true } : {}) };
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[navigator] 日记没写成', e);
    return null;
  }
}

const writing = new Map<string, Promise<number>>();

/** 第二天首开后台补写：这个人格 14 天内该写还没写的，每次最多 3 篇；返回写成几篇。单飞 */
export function writeDiaries(presetId: string, settings: Settings, todayKey: string = toLocalDateKey()): Promise<number> {
  const running = writing.get(presetId);
  if (running) return running;
  const job = (async (): Promise<number> => {
    try {
      if (!(getAssistantAIConfig(settings) ?? getAIConfig(settings))) return 0;
      let custom: NavigatorPreset[] = [];
      try { custom = await db.navigatorPresets.toArray(); } catch { /* 按内置解析 */ }
      const preset = resolveNavigatorPreset(presetId, custom);
      const targets = (await db.navigatorSessions.toArray())
        .filter((s) => ownerOf(s) === presetId && s.dateKey < todayKey && daysBetween(s.dateKey, todayKey) <= DIARY_BRIEF_DAYS && s.userSpoke && !s.diary && !s.diaryDeleted)
        .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
        .slice(0, DIARY_PER_RUN);
      let n = 0;
      for (const s of targets) {
        const diary = await composeDiary(preset, s, settings, todayKey);
        if (!diary) continue;
        await db.navigatorSessions.update(s.id, { diary, updatedAt: new Date() });
        n++;
      }
      return n;
    } catch {
      return 0;
    } finally {
      writing.delete(presetId);
    }
  })();
  writing.set(presetId, job);
  return job;
}

/**
 * 天级注入块：近 3 天全文、4–14 天一行缩略；没日记的日子退回归档摘要那一行（和以前的「最近几次聊天」一样）。
 * 一天不变，接在人格规范后面吃前缀缓存。
 */
export async function diaryBlock(presetId: string, todayKey: string = toLocalDateKey()): Promise<string> {
  try {
    const rows = (await db.navigatorSessions.toArray())
      .filter((s) => ownerOf(s) === presetId && s.dateKey < todayKey && daysBetween(s.dateKey, todayKey) <= DIARY_BRIEF_DAYS && ((s.diary && !s.diaryDeleted) || s.compactedSummary))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, 6);
    if (!rows.length) return '';
    const full: string[] = [];
    const brief: string[] = [];
    for (const s of rows) {
      const when = `${dayLabelCN(s.dateKey, todayKey)}，${relativeDayCN(s.dateKey, todayKey)}`;
      const d = s.diary && !s.diaryDeleted ? s.diary : null;
      if (d && daysBetween(s.dateKey, todayKey) <= DIARY_FULL_DAYS && full.length < DIARY_FULL_DAYS) full.push(`【你 ${when} 的日记】\n${d.text}`);
      else brief.push(`- ${when}：${d ? d.brief : s.compactedSummary}`);
    }
    const head = '【你的日记（你自己写的；是你知道的背景，不是要念给他听的；别复述里面的话，更别把日记当话题）】';
    return [head, ...full, brief.length ? `更早几天（缩略）：\n${brief.join('\n')}` : ''].filter(Boolean).join('\n');
  } catch {
    return '';
  }
}
