/**
 * navigatorPromise — 助手的「回访约定」（AI 助手第二批）。
 *
 * 用户提到一件带日子的事（面试、考试、体检……）→ 静默记下（不出提示；记事本「约好的事」能看能改能删）
 * → 那件事过后第一次见面问一次结果，**只问一次**。
 *
 * 状态：等着（waiting）→ 问过了（asked）/ 他自己说了结果（resolved）/ 作废（expired）；后三种永不再进上下文。
 *   · 什么时候问：上午的事当天 12 点后、白天的事当天 18 点后、晚上的事第二天 8 点后；之后三天内没问成就作废。
 *   · 问候或闲聊里把它交给模型（倾诉 / 道别 / 精力低时不交），回复里提到了就记「问过了」；
 *     交过两次都没问 → 作废，不追着问。
 *   · 推送（第二批 C）算一次问：推送送达后那句话就是当天会话的第一句。
 *   · 他在约定日前后自己说了结果，嗅探会标「他自己说了」。
 *   · 当天第一次见面可以给一句加油（不问结果），也只一次。
 * 记下的时机：用户这句话里有日子的说法、或提到了还在等着的约定，才在回复之后（后台）做一次很短的判断；
 * 会话末整理时也顺手补一遍漏掉的（navigatorMemory 的 promises 字段）。
 * 约定存在原子记忆表里（带 dueDate 的那些），普通记忆检索不收它们，由这里单独注入。
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { calendarTable, dateOfKey, daysBetween, dayLabelCN, keyOfDate, relativeDayCN, shiftKey, weekdayCN } from '@/utils/navigatorClock';
import type { NavigatorMemo, Settings } from '@/types';

export type PromiseWhen = NonNullable<NavigatorMemo['dueWhen']>;
export type PromiseMemo = NavigatorMemo & { dueDate: string; promiseTopic: string };

/** 只收今天到 60 天内的事 */
export const PROMISE_HORIZON_DAYS = 60;
/** 该问的窗口开了之后几天内没问成就作废 */
export const PROMISE_ASK_DAYS = 3;
/** 交给模型几次都没问就作废（不追着问） */
export const PROMISE_MAX_OFFERS = 2;

const WHEN_LABEL: Record<PromiseWhen, string> = { morning: '上午', day: '', evening: '晚上' };

export const isPromise = (m: NavigatorMemo): m is PromiseMemo => !!m.dueDate && !!m.promiseTopic;
const isOpen = (m: PromiseMemo) => (m.promiseState ?? 'waiting') === 'waiting';

/** 什么时候开始该问：上午的事当天 12 点、白天的事当天 18 点、晚上的事第二天 8 点 */
export function promiseDueAt(m: Pick<PromiseMemo, 'dueDate' | 'dueWhen'>): number {
  const d = dateOfKey(m.dueDate);
  if (m.dueWhen === 'morning') d.setHours(12, 0, 0, 0);
  else if (m.dueWhen === 'evening') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
  else d.setHours(18, 0, 0, 0);
  return d.getTime();
}
export const promiseExpireAt = (m: Pick<PromiseMemo, 'dueDate' | 'dueWhen'>): number => promiseDueAt(m) + PROMISE_ASK_DAYS * 86400_000;

/** 中性事实文本：「10月3日（周六）晚上：游戏公司面试」 */
export const promiseText = (topic: string, dueDate: string, when: PromiseWhen): string =>
  `${dayLabelCN(dueDate)}${WHEN_LABEL[when]}：${topic}`;

export type PromisePhase = 'upcoming' | 'today' | 'due' | 'late' | 'closed';

/** 一条约定此刻在哪一段：还没到 / 就是今天（还没到该问）/ 该问了 / 过了问的窗口 / 关了 */
export function promisePhase(m: PromiseMemo, now: number = Date.now()): PromisePhase {
  if (!isOpen(m) || m.status !== 'active') return 'closed';
  const due = promiseDueAt(m);
  if (now >= promiseExpireAt(m)) return 'late';
  if (now >= due) return 'due';
  return keyOfDate(new Date(now)) === m.dueDate ? 'today' : 'upcoming';
}

// ── 读写 ────────────────────────────────────────────────────────

export async function listPromises(): Promise<PromiseMemo[]> {
  try {
    return (await db.navigatorMemos.toArray()).filter(isPromise)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch {
    return [];
  }
}

async function closePromise(id: string, state: 'asked' | 'resolved' | 'expired'): Promise<void> {
  await db.navigatorMemos.update(id, { promiseState: state, promiseClosedAt: new Date() });
}

/** 过了问的窗口还没问成的 → 作废（惰性，开窗 / 每轮前跑一下） */
export async function sweepPromises(now: number = Date.now()): Promise<void> {
  for (const m of await listPromises()) {
    if (promisePhase(m, now) === 'late') await closePromise(m.id, 'expired');
  }
}

const bigrams = (t: string): Set<string> => {
  const c = t.replace(/[^一-鿿\w]/g, '');
  const g = new Set<string>();
  for (let i = 0; i < c.length - 1; i++) g.add(c.slice(i, i + 2));
  if (c.length === 1) g.add(c);
  return g;
};
/** a 的字有几成出现在 b 里 */
const overlap = (a: string, b: string): number => {
  const ga = bigrams(a);
  if (ga.size === 0) return 0;
  const gb = bigrams(b);
  let hit = 0;
  ga.forEach((g) => { if (gb.has(g)) hit++; });
  return hit / ga.size;
};
/**
 * 回复里提没提到这件事：事情名的字有一半以上出现（「游戏公司面试」→ 回复里说「面试」就够），
 * 或者用了这件事的说法（「考得怎么样」「面完了吗」「体检结果」）。
 */
export const mentionsTopic = (text: string, topic: string): boolean =>
  !!text && (text.includes(topic) || overlap(topic, text) >= 0.5 || keyWord(topic).some((k) => text.includes(k) || (STEMS[k]?.test(text) ?? false)));
/** 事情名里最像「事」的词（面试 / 考试 / 体检……），用来判提没提 */
function keyWord(topic: string): string[] {
  const m = topic.match(/(面试|考试|体检|复查|手术|答辩|比赛|演出|约会|搬家|出发|旅行|发布|汇报|签约|见家长|婚礼|开学|入职|离职|评审|上线|截止|交稿|考)/g);
  return m ?? [];
}
/** 问结果时常见的说法（不含事情名本身） */
const STEMS: Record<string, RegExp> = {
  面试: /面得|面完|面了|面上了|过了吗|结果出来/,
  考试: /考得|考完|考了|成绩|分数/,
  考: /考得|考完|考了|成绩|分数/,
  体检: /检查结果|报告出来|身体没事/,
  复查: /检查结果|报告出来/,
  手术: /术后|恢复得/,
  答辩: /辩得|辩完|过了吗/,
  比赛: /比得|赛况|赢了|输了|名次/,
  演出: /演得|演完|上台/,
  约会: /约得|见得怎么样|聊得怎么样/,
  搬家: /搬完|新家/,
  出发: /到了吗|路上|玩得/,
  旅行: /玩得|回来了/,
  发布: /上线了|发出去/,
  上线: /上线了|发出去/,
  汇报: /汇报得|讲得/,
  入职: /新公司|第一天/,
};

export interface PromiseDraft {
  topic: string;
  dueDate: string;
  dueWhen: PromiseWhen;
}

/** 记下一批约定：同一件事（名字像、日子差一天以内）只留一条，日子以新说的为准 */
export async function savePromises(drafts: PromiseDraft[], now: number = Date.now()): Promise<number> {
  if (!drafts.length) return 0;
  const today = keyOfDate(new Date(now));
  const existing = (await listPromises()).filter((m) => isOpen(m));
  let added = 0;
  for (const d of drafts) {
    const dup = existing.find((m) => Math.abs(daysBetween(m.dueDate, d.dueDate)) <= 1
      && (overlap(m.promiseTopic, d.topic) >= 0.5 || overlap(d.topic, m.promiseTopic) >= 0.5));
    if (dup) {
      if (dup.dueDate !== d.dueDate || dup.dueWhen !== d.dueWhen) {
        await db.navigatorMemos.update(dup.id, { dueDate: d.dueDate, dueWhen: d.dueWhen, text: promiseText(dup.promiseTopic, d.dueDate, d.dueWhen) });
      }
      continue;
    }
    // 已经过了问的窗口的不收（会话末整理补记时可能遇到）
    if (promiseExpireAt(d) <= now || daysBetween(today, d.dueDate) > PROMISE_HORIZON_DAYS) continue;
    const memo: NavigatorMemo = {
      id: uuidv4(),
      source: 'chat',
      text: promiseText(d.topic, d.dueDate, d.dueWhen),
      importance: 3,
      status: 'active',
      createdAt: new Date(now),
      dueDate: d.dueDate,
      dueWhen: d.dueWhen,
      promiseTopic: d.topic,
      promiseState: 'waiting',
      promiseDeferred: 0,
    };
    await db.navigatorMemos.put(memo);
    existing.push(memo as PromiseMemo);
    added++;
  }
  return added;
}

/** 校验一条模型给的约定（不合法返回 null） */
export function toPromiseDraft(raw: unknown, today: string, opts: { allowPast?: boolean } = {}): PromiseDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const topic = String(r.topic ?? '').trim().replace(/[「」"“”]/g, '').slice(0, 12);
  const date = String(r.date ?? '').trim();
  if (!topic || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (isNaN(dateOfKey(date).getTime()) || keyOfDate(dateOfKey(date)) !== date) return null;
  const ahead = daysBetween(today, date);
  if (ahead > PROMISE_HORIZON_DAYS) return null;
  if (ahead < 0 && !opts.allowPast) return null;
  const when: PromiseWhen = r.when === 'morning' || r.when === 'evening' ? r.when : 'day';
  return { topic, dueDate: date, dueWhen: when };
}

// ── 嗅探（后台，回复之后） ─────────────────────────────────────

/** 有日子的说法才值得判一次（没有日子的话不花这次调用） */
export const PROMISE_CUE_RE = /今天|今晚|今早|明天|明早|明晚|后天|大后天|周[一二三四五六日天末]|星期[一二三四五六日天]|礼拜[一二三四五六日天]|下(个)?(周|星期|礼拜|月)|这(个)?(周|星期|礼拜)末?|月底|月初|月中|年底|过两天|过几天|几天后|\d{1,2}\s*[号日]|\d{1,2}\s*月|[一二三四五六七八九十]{1,3}\s*[号日]|[一二三四五六七八九十]{1,2}\s*月|下午|上午|晚上|早上|\d{1,2}\s*[:：点]/;

const SNIFF_PROTOCOL = `你是约定嗅探器：从用户最新这句话里找出「带日子、过后值得问一句结果的事」，并判断他有没有说起已记下的约定的结果。
只输出这一个 JSON 对象（不要代码块、不要别的字）：{"items":[],"resolved":[]}
- items：用户**自己**要经历的、日子明确的事——面试、考试、体检 / 看病、答辩、比赛、演出、约会、见家长、搬家、出发 / 旅行、手术、发布 / 上线、交稿截止……
  每条 {"topic":"≤8 字，用他的说法","date":"YYYY-MM-DD","when":"morning|day|evening"}。
  · date 按下面【日历】查，不要自己推算星期；只收今天到 60 天内；说不准是哪天的不收。
  · when：上午 / 早上 = morning，晚上 = evening，其余或没说 = day。
  · 不收：日常小事（吃饭、上课、开会、健身、睡觉）——除非他说很在意；别人的事；已经过去的事；【已记下的约定】里已有的同一件事。
- resolved：【已记下的约定】里，他这句话已经说了结果的（「面试过了」「考完了，一般」「体检没事」）那几条的 id；没有就 []。`;

let sniffing: Promise<boolean> | null = null;

/**
 * 回复之后（后台）判一次：有日子的说法、或提到了还在等着的约定才调用。
 * 模型用快速档（保持思考：后台跑，不赶时间，日子要算准）。所有失败静默。
 */
export function sniffPromises(text: string, settings: Settings, now: number = Date.now()): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const t = text.trim();
    if (!t) return false;
    const open = (await listPromises()).filter((m) => promisePhase(m, now) !== 'closed');
    const touchesOpen = open.some((m) => mentionsTopic(t, m.promiseTopic));
    if (!PROMISE_CUE_RE.test(t) && !touchesOpen) return false;
    const cfg = getAIConfig(settings);
    if (!cfg) return false;
    const today = keyOfDate(new Date(now));
    const d = new Date(now);
    const nowLine = `${today} ${weekdayCN(today)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const user = [
      `【现在】${nowLine}`,
      `【日历】\n${calendarTable(today, 21)}`,
      open.length
        ? `【已记下的约定】\n${open.map((m) => `- id=${m.id} ${dayLabelCN(m.dueDate, today)}${WHEN_LABEL[m.dueWhen ?? 'day']}：${m.promiseTopic}`).join('\n')}`
        : '【已记下的约定】（无）',
      `【最新消息】${t.slice(0, 400)}`,
    ].join('\n');
    try {
      let raw: string;
      const messages = [
        { role: 'system' as const, content: SNIFF_PROTOCOL },
        { role: 'user' as const, content: user },
      ];
      try {
        raw = await chatComplete(cfg, messages, { temperature: 0.1, maxTokens: 400, jsonMode: true });
      } catch (e) {
        if (e instanceof Error && e.message.includes('空响应')) raw = await chatComplete(cfg, messages, { temperature: 0.1, maxTokens: 400 });
        else throw e;
      }
      const s = raw.replace(/```(?:json)?/gi, '').trim();
      const parsed = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)) as Record<string, unknown>;
      const drafts = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 2)
        .map((x) => toPromiseDraft(x, today))
        .filter((x): x is PromiseDraft => !!x);
      const added = drafts.length ? await savePromises(drafts, now) : 0;
      const ids = new Set((Array.isArray(parsed.resolved) ? parsed.resolved : []).map((x) => String(x)));
      let resolved = 0;
      for (const m of open) if (ids.has(m.id)) { await closePromise(m.id, 'resolved'); resolved++; }
      return added + resolved > 0 || drafts.length > 0;
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[navigator] 约定嗅探失败（这句不记）', e);
      return false;
    }
  };
  // 串行：上一句还在判，这一句排在后面（同一件事别并发记两条）
  const next: Promise<boolean> = (sniffing ?? Promise.resolve(false)).then(run, run);
  sniffing = next;
  void next.finally(() => { if (sniffing === next) sniffing = null; });
  return next;
}

// ── 注入与记账 ──────────────────────────────────────────────────

export interface PromiseContext {
  /** 还没到的约定（背景：知道这回事，别追问结果） */
  upcoming: PromiseMemo[];
  /** 今天就是那件事的日子、还没到该问的时候：问候里可以给一句加油（只一次） */
  cheer: PromiseMemo | null;
  /** 该问的那一条（一次只交一条，最早的） */
  ask: PromiseMemo | null;
}

export async function promiseContext(now: number = Date.now()): Promise<PromiseContext> {
  await sweepPromises(now);
  const today = keyOfDate(new Date(now));
  const all = (await listPromises()).filter((m) => m.status === 'active');
  const phases = all.map((m) => ({ m, p: promisePhase(m, now) }));
  return {
    upcoming: phases.filter((x) => (x.p === 'upcoming' || x.p === 'today') && daysBetween(today, x.m.dueDate) <= 7).map((x) => x.m),
    cheer: phases.find((x) => x.p === 'today' && !x.m.promiseCheered)?.m ?? null,
    ask: phases.filter((x) => x.p === 'due').sort((a, b) => promiseDueAt(a.m) - promiseDueAt(b.m))[0]?.m ?? null,
  };
}

/** 背景行（总是放）：快到的约定，知道就行，别追问 */
export function buildUpcomingLine(ctx: PromiseContext, today: string): string {
  const list = ctx.upcoming.filter((m) => m.id !== ctx.cheer?.id);
  if (!list.length) return '';
  return `【约好的事（还没到）】${list.map((m) => `${relativeDayCN(m.dueDate, today)}（${dayLabelCN(m.dueDate, today)}）${WHEN_LABEL[m.dueWhen ?? 'day']}：${m.promiseTopic}`).join('；')}——你知道这回事就行，他提起时接得上；还没到日子，别追问结果。`;
}

/** 该问的那一条（问候 / 闲聊时交给模型） */
export function buildAskLine(m: PromiseMemo, today: string): string {
  return `【该问的约定】${relativeDayCN(m.dueDate, today)}（${dayLabelCN(m.dueDate, today)}）${WHEN_LABEL[m.dueWhen ?? 'day']}他有「${m.promiseTopic}」，现在已经过了：这一轮自然地问一句结果（像朋友惦记着那样，一句就好），只问这一次；他要是已经说了结果，就接着他的话说，别再问。`;
}

/** 当天的加油（只在问候里给） */
export function buildCheerLine(m: PromiseMemo): string {
  return `【今天的约定】今天${WHEN_LABEL[m.dueWhen ?? 'day']}是他「${m.promiseTopic}」的日子：问候里给一句简短的加油就好（只这一次），别问结果、别说教。`;
}

export async function markCheered(id: string): Promise<void> {
  await db.navigatorMemos.update(id, { promiseCheered: true });
}

/**
 * 交给模型之后（问候或一轮回复定下来）：回复里提到了 → 问过了；没提 → 记一次「给过机会」，
 * 给过两次都没问 → 作废（不追着问）。
 */
export async function noteAskResult(m: PromiseMemo, replyText: string): Promise<'asked' | 'deferred' | 'expired'> {
  if (mentionsTopic(replyText, m.promiseTopic)) {
    await closePromise(m.id, 'asked');
    return 'asked';
  }
  const n = (m.promiseDeferred ?? 0) + 1;
  if (n >= PROMISE_MAX_OFFERS) {
    await closePromise(m.id, 'expired');
    return 'expired';
  }
  await db.navigatorMemos.update(m.id, { promiseDeferred: n });
  return 'deferred';
}

/** 推送送达 = 问过了（第二批 C） */
export async function markAskedByPush(id: string): Promise<void> {
  await closePromise(id, 'asked');
}

/** 记事本：改日子 / 删掉 */
export async function updatePromiseDate(id: string, dueDate: string, dueWhen?: PromiseWhen): Promise<void> {
  const m = await db.navigatorMemos.get(id);
  if (!m || !isPromise(m)) return;
  const when = dueWhen ?? m.dueWhen ?? 'day';
  await db.navigatorMemos.update(id, {
    dueDate, dueWhen: when, text: promiseText(m.promiseTopic, dueDate, when),
    // 改了日子 = 重新等着（之前作废的也复活，问的机会清零）
    promiseState: 'waiting', promiseDeferred: 0, promiseCheered: false, promiseClosedAt: undefined,
  });
}
export async function deletePromise(id: string): Promise<void> {
  await db.navigatorMemos.delete(id);
}

/** 会话末整理补记：日子按那段对话发生的那天换算；过了问的窗口的不收（savePromises 里拦） */
export async function savePromisesFromCompact(raw: unknown, sessionDateKey: string, now: number = Date.now()): Promise<void> {
  const items = (Array.isArray(raw) ? raw : []).slice(0, 3)
    .map((x) => toPromiseDraft(x, sessionDateKey, { allowPast: false }))
    .filter((x): x is PromiseDraft => !!x);
  if (items.length) await savePromises(items, now);
}

/** 话头和约定撞了（「问问面试结果」）就别再挂话头——约定那边会问，问两遍就破了「只问一次」 */
export async function followUpCoveredByPromise(followUp: string): Promise<boolean> {
  const list = await listPromises();
  return list.some((m) => mentionsTopic(followUp, m.promiseTopic));
}

/** 往前推一天的日期键（推送「第二天早上」用） */
export const nextDayKey = (key: string): string => shiftKey(key, 1);
