/**
 * navigatorRead — 「读」：开口之前先在心里过一遍（第 36 批 · LIVE MODE A）。
 *
 * 以前的两段式是「分诊打标签 → 表演照规则回」：规则替它读空气、它照办，所以会出现用户倾诉完它回一半、
 * 末尾从上一句里抠个细节反问、话题被带偏的事。现在中间加一步**读**：快速档、瞬发、和分诊并行（收口窗口里预跑），
 * 用人格的第一人称在心里过一遍——
 *   ① 他：在说什么 / 要的是什么（被懂 · 要办法 · 要陪着 · 只是说说 · 在逗我 · 在问事 · 只是应一声）/
 *      我上一轮接住了没（他在回应我 · 无视了继续说 · 换了话题）/ 真要问只问哪一件（needAsk）；
 *   ② 我：以我的性格此刻想怎么反应（心里话，不是回复稿）/ 想说但没说出口的一句（给「补一句」）/ 这一轮的情绪余温。
 * 它的输出贴在尾部 system、人设锚之前，口径是**依据不是围栏**：照这个判断来，说什么、怎么说还是人格自己的。
 * 旁边再给几条本地算的提醒（隔了多久才回、连着问了几轮、他只是应了一声、前几条的开头别重样），同样只是提醒。
 * 读失败 / 超时就不带，照旧回合；沉下来那一轮不读（安全口径优先）。每会话留最近 30 条读，给下一轮和第二天的日记。
 */
import { db } from '@/db';
import { chatComplete, getAIConfig, getAssistantAIConfig, type AIConfig } from '@/utils/aiClient';
import type { Settings } from '@/types';
import type { TurnHistoryItem } from '@/utils/navigatorIntent';

// ── 性格（对用户只开这一个分档） ──

export type NavigatorTemperament = 'reserved' | 'natural' | 'open';
export const TEMPERAMENTS: NavigatorTemperament[] = ['reserved', 'natural', 'open'];
export const TEMPERAMENT_LABELS: Record<NavigatorTemperament, string> = { reserved: '收着', natural: '自然', open: '外放' };
export const TEMPERAMENT_DESC: Record<NavigatorTemperament, string> = {
  reserved: '少主动：不补一句、少起话头，心思多半放在心里',
  natural: '像平常的朋友：偶尔回完再补一句、偶尔起个话头，心思该露的时候露',
  open: '更主动：常补一句、爱起话头，心思更外露',
};
export const temperamentOf = (settings: Pick<Settings, 'navigatorTemperament'>): NavigatorTemperament => settings.navigatorTemperament ?? 'natural';
/** 回完再补一句的概率 */
export const afterthoughtChance = (t: NavigatorTemperament): number => (t === 'reserved' ? 0 : t === 'open' ? 0.5 : 0.25);
/** 这一轮放不放「起」的那一条（约定 / 走神 / 旧事 / 近况）的概率 */
export const casualSlotChance = (t: NavigatorTemperament): number => (t === 'reserved' ? 0.5 : 1);

// ── 读的结果 ──

export type ReadWants = 'understood' | 'advice' | 'company' | 'talk' | 'tease' | 'ask' | 'ack';
export type ReadAnswered = 'yes' | 'ignored' | 'switched' | 'na';
export interface ReadResult {
  /** 他在说什么（一句） */
  topic: string;
  wants: ReadWants | null;
  answered: ReadAnswered;
  /** 真要问只问这一件；null = 没有非问不可的 */
  needAsk: string | null;
  /** 以我的性格此刻想怎么反应（第一人称心里话） */
  react: string;
  /** 想说但这轮大概不会说出口的一句（给补一句） */
  unsaid: string | null;
  /** 这一轮我的情绪余温 */
  mood: string | null;
  raw?: string;
}

const WANTS: readonly ReadWants[] = ['understood', 'advice', 'company', 'talk', 'tease', 'ask', 'ack'];
const ANSWERED: readonly ReadAnswered[] = ['yes', 'ignored', 'switched', 'na'];
const WANTS_CN: Record<ReadWants, string> = {
  understood: '被懂，不是办法', advice: '一个办法', company: '有人陪着，不要分析', talk: '只是说说',
  tease: '逗你玩', ask: '问个事', ack: '只是应一声',
};
const ANSWERED_CN: Record<ReadAnswered, string> = {
  yes: '他在回应你上一轮说的。', ignored: '他没接你上一轮的问题，接着说自己的。', switched: '他换了话题。', na: '',
};

// ── 本地事实（零调用） ──

export interface LocalTurnFacts {
  /** 他隔了多少分钟才回（距你上一条）；算不出为 null */
  gapMinutes: number | null;
  /** 你连着几轮都问了他 */
  askStreak: number;
  /** 他只是应了一声（≤4 字、没问号） */
  shortAck: boolean;
  /** 你前几条回复的开头 */
  openings: string[];
  /** 上一轮你心里想的 */
  lastRead: ReadResult | null;
  /** 上一轮的余温（还没过去） */
  mood: string | null;
}

/** 历史按「轮」切成 AI 的几段（连续的 AI 气泡合成一段） */
function catTurns(history: TurnHistoryItem[]): string[] {
  const out: string[] = [];
  let cur: string[] | null = null;
  for (const h of history) {
    if (h.role === 'cat') { if (!cur) { cur = []; out.push(''); } cur.push(h.text); out[out.length - 1] = cur.join(' '); }
    else cur = null;
  }
  return out;
}

const hasQuestion = (t: string): boolean => /[?？]/.test(t);

interface SessionReadState { lastRead: ReadResult | null; mood: { text: string; ttl: number } | null; loaded: boolean }
const sessionState = new Map<string, SessionReadState>();
const stateOf = (sessionId: string): SessionReadState => {
  let st = sessionState.get(sessionId);
  if (!st) { st = { lastRead: null, mood: null, loaded: false }; sessionState.set(sessionId, st); }
  return st;
};

/** 本地事实：历史 + 这句话 + 这个会话里上一轮想的（内存没有就从库里的 reads 取最后一条） */
export async function buildLocalFacts(history: TurnHistoryItem[], userText: string, nowTs: number, sessionId: string | null): Promise<LocalTurnFacts> {
  const cats = catTurns(history);
  let askStreak = 0;
  for (let i = cats.length - 1; i >= 0; i--) { if (hasQuestion(cats[i])) askStreak++; else break; }
  const openings = cats.slice(-3).map((t) => t.replace(/^\[[^\]]*\]\s*/, '').trim().slice(0, 8)).filter(Boolean);
  const lastCat = [...history].reverse().find((h) => h.role === 'cat');
  const gapMinutes = lastCat?.createdAt ? Math.max(0, Math.round((nowTs - lastCat.createdAt) / 60_000)) : null;
  const t = userText.trim();
  const shortAck = t.length > 0 && [...t.replace(/[\s，。！!~～…]/g, '')].length <= 4 && !hasQuestion(t);
  let lastRead: ReadResult | null = null;
  let mood: string | null = null;
  if (sessionId) {
    const st = stateOf(sessionId);
    if (!st.loaded) {
      st.loaded = true;
      try {
        const row = await db.navigatorSessions.get(sessionId);
        const last = row?.reads?.[row.reads.length - 1];
        if (last && !st.lastRead) st.lastRead = { topic: '', wants: null, answered: 'na', needAsk: null, react: last.text, unsaid: null, mood: null };
      } catch { /* 没有就没有 */ }
    }
    lastRead = st.lastRead;
    mood = st.mood?.text ?? null;
  }
  return { gapMinutes, askStreak, shortAck, openings, lastRead, mood };
}

/** 这一轮读完记下：上一轮想的换成这次的；余温有新的就记两轮，没有就衰减一轮 */
export function noteRead(sessionId: string, read: ReadResult): void {
  const st = stateOf(sessionId);
  st.loaded = true;
  st.lastRead = read;
  if (read.mood) st.mood = { text: read.mood, ttl: 2 };
  else if (st.mood) { st.mood.ttl -= 1; if (st.mood.ttl <= 0) st.mood = null; }
}

/** 给日记 / 下一轮看的一两句（中性短句，不是回复） */
export function readSummary(read: ReadResult): string {
  const parts = [read.topic ? `他在说：${read.topic}` : '', read.wants ? `要的是${WANTS_CN[read.wants]}` : '', read.react ? `我：${read.react}` : ''].filter(Boolean);
  return parts.join('；').slice(0, 160);
}

const READS_KEEP = 30;
/** 存进会话行（留最近 30 条） */
export async function appendSessionRead(sessionId: string, read: ReadResult, ts: number = Date.now()): Promise<void> {
  try {
    const row = await db.navigatorSessions.get(sessionId);
    if (!row) return;
    const reads = [...(row.reads ?? []), { ts, text: readSummary(read) }].slice(-READS_KEEP);
    await db.navigatorSessions.update(sessionId, { reads, updatedAt: new Date() });
  } catch { /* 存不了就少一条 */ }
}

// ── 调用 ──

const READ_PROTOCOL = `你是这段对话里「陪伴 AI」的内心独白。给你它的人格、最近几轮对话、对方刚发来的最新一句和几条本地事实。
在它开口之前，替它在心里过一遍。只输出这一个 JSON 对象（不要代码块、不要其它文字）：
{"topic":"","wants":"talk","answered":"na","needAsk":null,"react":"","unsaid":null,"mood":null}
- topic：他这句在说什么，一句（≤30 字）。
- wants：他这句要的是什么——understood 被懂（倾诉、理不清思路、要先被听到）/ advice 要办法 / company 要陪着（不要分析、不要办法）/ talk 只是说说、闲聊 / tease 在逗它、开玩笑 / ask 在问事、要答案 / ack 只是应一声（嗯、哈哈、好）。
- answered：它上一轮如果问了什么或抛了个话题，他这句是在回应（yes）、无视了继续说自己的（ignored）、换了话题（switched）；它上一轮没问也没抛话题就 na。
- needAsk：只有当「不问这一件就没法好好接他」时才写那一件（≤20 字），否则 null。从他上一句里抠个细节另起一支、「要不要聊聊 xxx」这类都不算；他在倾诉而且已经说得够清楚时，一般是 null。
- react：心里话，不是回复稿（≤60 字，第一人称）：它会怎么看这件事、想先接哪一句、有没有自己的看法、该不该收着。要符合它的人格——高冷的就高冷，爱闹的就闹，毒舌的照样毒舌。
- unsaid：它这轮大概不会说出口、但心里冒出来的一句（≤30 字，第一人称；可以是一句感想、一个想起来的事），没有就 null。
- mood：这一轮它自己的情绪余温（≤12 字，如「被噎了一下」「有点得意」「替他松了口气」），没有就 null。
不评价对方、不写建议正文、不写格式要求。`;

function historyLines(history: TurnHistoryItem[], maxItems = 10, maxChars = 160): string[] {
  const merged: Array<{ role: 'cat' | 'user'; text: string }> = [];
  for (const h of history) {
    const last = merged[merged.length - 1];
    if (last && last.role === h.role) last.text += ` ${h.text}`;
    else merged.push({ role: h.role, text: h.text });
  }
  return merged.slice(-maxItems).map((h) => `${h.role === 'cat' ? '我' : '他'}：${h.text.replace(/\s+/g, ' ').slice(0, maxChars)}`);
}

const fmtGap = (m: number): string => (m >= 60 * 24 ? `${Math.round(m / 60 / 24)} 天` : m >= 60 ? `${Math.round(m / 60)} 小时` : `${m} 分钟`);

function factsLines(f: LocalTurnFacts): string[] {
  const out: string[] = [];
  if (f.gapMinutes !== null && f.gapMinutes >= 30) out.push(`他隔了 ${fmtGap(f.gapMinutes)} 才回这条。`);
  if (f.askStreak >= 2) out.push(`我已经连着 ${f.askStreak} 轮都在问他了。`);
  if (f.lastRead?.react) out.push(`上一轮我心里想的是：${f.lastRead.react}`);
  if (f.mood) out.push(`上一轮的余温：${f.mood}`);
  return out;
}

const clean = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/^["“「]|["”」]$/g, '').slice(0, max);
const orNull = (v: unknown, max: number): string | null => { const t = clean(v, max); return t && t !== 'null' ? t : null; };

function parseRead(raw: string): ReadResult | null {
  const t = raw.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let p: Record<string, unknown>;
  try { p = JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
  const react = clean(p.react, 80);
  const topic = clean(p.topic, 40);
  if (!react && !topic) return null;
  return {
    topic,
    wants: WANTS.includes(p.wants as ReadWants) ? (p.wants as ReadWants) : null,
    answered: ANSWERED.includes(p.answered as ReadAnswered) ? (p.answered as ReadAnswered) : 'na',
    needAsk: orNull(p.needAsk, 30),
    react,
    unsaid: orNull(p.unsaid, 40),
    mood: orNull(p.mood, 16),
    raw,
  };
}

/** 读用快速档（没配就用助手档）；和分诊同口径 */
export function readConfig(settings: Settings): AIConfig | null {
  return getAIConfig(settings) ?? getAssistantAIConfig(settings);
}

export async function readTurn(
  cfg: AIConfig,
  persona: string,
  history: TurnHistoryItem[],
  userText: string,
  facts: LocalTurnFacts,
  signal?: AbortSignal,
): Promise<ReadResult | null> {
  const lines = historyLines(history);
  const fl = factsLines(facts);
  const user = [
    `【它的人格】\n${persona.slice(0, 1200)}`,
    fl.length ? `【本地事实】\n${fl.map((l) => `- ${l}`).join('\n')}` : '',
    lines.length ? `【最近几轮】\n${lines.join('\n')}` : '【最近几轮】（这是今天的第一句）',
    `【他刚发来的】${userText.slice(0, 600)}`,
  ].filter(Boolean).join('\n');
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: READ_PROTOCOL },
      { role: 'user', content: user },
    ], { temperature: 0.5, maxTokens: 320, jsonMode: true, instant: true, timeoutMs: 12000, signal, purpose: 'read' });
    return parseRead(raw);
  } catch (e) {
    if (signal?.aborted) throw e;
    if (import.meta.env.DEV) console.warn('[navigator] 读失败', e);
    return null;
  }
}

/** 收口窗口里预跑 / 回合里现跑：没配 AI 直接 null */
export function startRead(settings: Settings, persona: string, history: TurnHistoryItem[], userText: string, facts: LocalTurnFacts, signal: AbortSignal): Promise<ReadResult | null> {
  const cfg = readConfig(settings);
  if (!cfg) return Promise.resolve(null);
  return readTurn(cfg, persona, history, userText, facts, signal);
}

/** 评测用（tests-local/evals/read-run.mjs）：直接跑一次读，不落库、不碰会话状态 */
export function _readForTest(settings: Settings, persona: string, history: TurnHistoryItem[], userText: string, facts?: Partial<LocalTurnFacts>): Promise<ReadResult | null> {
  const cfg = readConfig(settings);
  if (!cfg) throw new Error('未配置 AI');
  const full: LocalTurnFacts = { gapMinutes: null, askStreak: 0, shortAck: false, openings: [], lastRead: null, mood: null, ...facts };
  return readTurn(cfg, persona, history, userText, full);
}

// ── 注入 ──

/** 贴在人设锚前面的那一段：依据不是围栏 */
export function readBlock(read: ReadResult): string {
  const parts = [
    read.topic ? `他在说：${read.topic}。` : '',
    read.wants ? `他要的是${WANTS_CN[read.wants]}。` : '',
    ANSWERED_CN[read.answered],
    read.needAsk ? `真要问，只问这一件：${read.needAsk}。` : '没有非问不可的事。',
    read.react ? `你心里的反应：${read.react}` : '',
    read.mood ? `（你这会儿${read.mood}）` : '',
  ].filter(Boolean).join('');
  return `【你刚才心里过的一遍】${parts}\n——照这个判断来；说什么、怎么说，还是你自己的。`;
}

/** 本地提醒：都是参考，不是命令 */
export function hintsBlock(facts: LocalTurnFacts, read: ReadResult | null): string {
  const lines: string[] = [];
  if (facts.gapMinutes !== null && facts.gapMinutes >= 30) lines.push(`他隔了 ${fmtGap(facts.gapMinutes)} 才回这条。`);
  if (facts.askStreak >= 2) lines.push(`你已经连着 ${facts.askStreak} 轮问他了，这轮别再问。`);
  else if (read?.answered === 'ignored') lines.push('他没接你上一轮的问题，接着说自己的了：别再问，顺他的线。');
  if (facts.shortAck) lines.push('他只是应了一声：回一个反应就够，一个泡，别展开。');
  if (facts.openings.length >= 2) lines.push(`你前几条的开头：${facts.openings.map((o) => `「${o}」`).join('')}——别再用同样的开头。`);
  if (facts.mood && !read?.mood) lines.push(`上一轮你心里的余温：${facts.mood}（还没完全过去，自然带着就好）。`);
  return lines.length ? `【提醒（参考，不是命令）】\n${lines.map((l) => `- ${l}`).join('\n')}` : '';
}

// ── 补一句（回完过几十秒再发一条短的） ──

export const AFTERTHOUGHT_MIN_MS = 20_000;
export const AFTERTHOUGHT_MAX_MS = 45_000;

/** 把「想说但没说」用人格的口吻说成一条短消息；失败 null */
export async function renderAfterthought(cfg: AIConfig, persona: string, anchorLine: string, unsaid: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: `${persona}\n${anchorLine}` },
      {
        role: 'user',
        content: `你刚回完他，过了一会儿心里还冒出来这一句：「${unsaid}」。现在把它作为补发的一条消息说出来：一句话，不超过 30 个字，用你自己的口吻，像想起来补一句那样自然；不解释为什么补、不重复刚才说过的、不问他问题、不用表情符号、不加引号。只输出这一句。`,
      },
    ], { temperature: 0.9, maxTokens: 120, instant: true, timeoutMs: 15000, signal, purpose: 'afterthought' });
    const text = raw.replace(/```[a-z]*/gi, '').trim().replace(/^["“「]|["”」]$/g, '').split('\n')[0].trim();
    return text.length >= 2 && text.length <= 60 ? text : null;
  } catch {
    return null;
  }
}
