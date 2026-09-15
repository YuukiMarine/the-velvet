/**
 * tarotContext — 塔罗解读的「近况简报」与「今日写法」（v2.7.0.6）。
 *
 * 为什么单独一个模块：
 *   解读质量取决于喂给模型的是什么。之前是"最新 7 条记录 + 五维等级数字"，
 *   没有日期、没有案头、没有反馈——模型只能翻旧账、报等级。这里把"人现在的处境"
 *   算成一份确定性的、每行带日期的简报，模型只负责把牌的语言擦过它。
 *
 * 四条硬约束（用户口径）：
 *   1. 每一行都带日期与相对标注（今天 / 昨天 / N 天前），模型不可能把旧事当近况；
 *   2. 不出现任何等级 / 点数——属性只做定性（最厚的底子 / 在长的 / 没动静的）；
 *   3. 案头（任务 / 期限 / 愿望）只作底色，长期与反复事项不喂，免得天天被念；
 *   4. 手记与画像是"上次聊到哪"，不是要复述的素材。
 *
 * 全部本地计算，零 AI 调用；db 读取失败一律降级为空块，不阻断抽牌。
 */
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { getProfile } from '@/utils/navigatorMemory';
import type { Activity, AttributeId, Attribute, DailyDivination, LongReading, LongReadingPeriod, Todo, TodoCompletion, Wish } from '@/types';
import { TAROT_BY_ID, PERIOD_LABELS, FORTUNE_META } from '@/constants/tarot';
import type { TarotCardData, TarotOrientation } from '@/constants/tarot';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DAY_MS = 86400_000;

type AttrNames = Record<AttributeId, string>;

// ── 日期工具 ────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** 本地整日差：now 所在日 − d 所在日 */
const daysAgo = (d: Date, now: Date) => Math.round((dayStart(now).getTime() - dayStart(d).getTime()) / DAY_MS);
const fromKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** 9/15 周二 */
const mdLabel = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
const hmLabel = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
/** 相对标注：模型措辞的唯一依据，所以写死 */
const relLabel = (d: Date, now: Date): string => {
  const n = daysAgo(d, now);
  if (n <= 0) return '今天';
  if (n === 1) return '昨天';
  if (n === 2) return '前天';
  return `${n} 天前`;
};
/** 「今天 9/15 周二」——相对标注在前、绝对日期在后，两者同时给 */
const dateTag = (d: Date, now: Date) => `${relLabel(d, now)} ${mdLabel(d)}`;
const dayPart = (h: number): string =>
  h < 5 ? '深夜' : h < 9 ? '清晨' : h < 12 ? '上午' : h < 14 ? '午间' : h < 18 ? '午后' : h < 21 ? '傍晚' : h < 23 ? '夜里' : '深夜';

export const formatNowLine = (now: Date): string =>
  `现在：${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${WEEKDAYS[now.getDay()]} ${hmLabel(now)}（${dayPart(now.getHours())}）`;

// ── 今日写法（方案 E：变化由代码保证，模型只负责判断） ─────────────

export interface WritingPreset {
  id: string;
  label: string;
  guide: string;
  /** 需要昨日回声才成立的写法；没有回声时不会被选中 */
  needsEcho?: boolean;
}

export const WRITING_PRESETS: WritingPreset[] = [
  { id: 'image', label: '意象起笔', guide: '从牌面上的一个具体意象落笔（一件物、一个动作、一种光线），让它慢慢对上今天的处境；意象只能有一个，不要罗列。' },
  { id: 'verdict-first', label: '判断先行', guide: '第一句就是今天最要紧的那句判断，不铺垫；之后往回补两三笔，说清这句判断从哪来。' },
  { id: 'hour', label: '时辰起笔', guide: '从此刻的时辰与天光起头（素材里给了现在是清晨还是深夜），让时间本身成为解读的一部分。' },
  { id: 'sidelong', label: '借一件事', guide: '从近况里最近的一件事侧写开去——只写它的轮廓与气味，绝不点名；若近况是空窗，就写空窗本身。' },
  { id: 'question', label: '一问一答', guide: '以一个客人此刻心里可能盘旋的问题开头（用他的口吻，不加引号），再用牌来答。' },
  { id: 'hold-release', label: '收放两笔', guide: '先写今天该收着的，再写该放开的，最后一句把两者合拢。' },
  { id: 'three-short', label: '三短段', guide: '三个各一两行的短段，不加标题、不加序号；三段之间有递进。' },
  { id: 'prose', label: '一段散文', guide: '一整段不分段的散文，句子长短交错，不用任何列表与加粗。' },
  { id: 'two-faces', label: '正逆对照', guide: '把这张牌正位与逆位的两副面孔并排摆出来，然后让客人自己认领属于今天的那一面——你只轻轻指一下。' },
  { id: 'season', label: '物候', guide: '借当下的季节与天气意象带出今天的走向（按素材里的月份判断时节），不要写成天气预报。' },
  { id: 'motto', label: '签文展开', guide: '先给一句像签文的话（八到十四字，独立成行），再用两三句解释它落在何处。' },
  { id: 'echo', label: '接住回声', guide: '从昨日回声接过来：昨天那张牌说的与客人实际做的之间，今天这张牌是回应、反转还是延续。只点到为止，不复述昨天的解读。', needsEcho: true },
  { id: 'blank', label: '留白', guide: '短。四行以内，每句都要有分量，结尾故意留一个没说完的意思。' },
  { id: 'figure', label: '牌中人', guide: '以牌面上那个人物（或那件事物）的视角说一小段话，再转回来对客人说一句。' },
  { id: 'threshold', label: '门槛', guide: '把今天写成一道门槛：门这边是什么、门那边是什么、脚该往哪边——不要用"门槛"两个字直说。' },
  { id: 'letter', label: '短笺', guide: '写成一张留在桌上的短笺：像是解读者起身离开前留给客人的几行字，语气亲近但克制。' },
];

/** 按日期 + 牌确定性地挑写法：连续两天不会相同，同一天重抽也稳定 */
export function pickWritingPreset(now: Date, cardId: string, hasEcho: boolean): WritingPreset {
  const pool = WRITING_PRESETS.filter(p => !p.needsEcho || hasEcho);
  const dayIndex = Math.floor(dayStart(now).getTime() / DAY_MS);
  let h = 0;
  for (const ch of cardId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[(dayIndex + h) % pool.length];
}

// ── 属性：只定性、不带数字 ───────────────────────────────────

function attributeBlock(attributes: Attribute[], activities: Activity[], attrNames: AttrNames, now: Date): string {
  const since = now.getTime() - 7 * DAY_MS;
  const gained: Record<AttributeId, number> = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
  for (const a of activities) {
    if (new Date(a.date).getTime() < since) continue;
    for (const id of ATTRIBUTE_IDS) gained[id] += a.pointsAwarded?.[id] ?? 0;
  }
  const name = (id: AttributeId) => attrNames[id] ?? id;
  const byPoints = [...attributes].sort((a, b) => b.points - a.points);
  const strongest = byPoints.filter(a => a.points > 0).slice(0, 2).map(a => name(a.id));
  const rising = ATTRIBUTE_IDS.filter(id => gained[id] > 0).sort((a, b) => gained[b] - gained[a]).slice(0, 2).map(name);
  const idle = ATTRIBUTE_IDS.filter(id => gained[id] === 0).map(name);
  const lines = [
    `客人的底色（只有这五个属性名可以出现在正文里；等级与点数一律不许写）：`,
    `- 五项属性名：${ATTRIBUTE_IDS.map(name).join('、')}`,
    `- 最厚的底子：${strongest.length ? strongest.join('、') : '尚未分出高下'}`,
    `- 近七天在往上走的：${rising.length ? rising.join('、') : '没有'}`,
    `- 近七天没什么动静的：${idle.length === ATTRIBUTE_IDS.length ? '全部' : idle.length ? idle.join('、') : '没有'}`,
  ];
  return lines.join('\n');
}

// ── 近况：按时间窗取、逐行带日期 ─────────────────────────────

const isPlainActivity = (a: Activity) => !a.category;

function activityLine(a: Activity, attrNames: AttrNames, now: Date, withTime: boolean): string {
  const d = new Date(a.date);
  const touched = ATTRIBUTE_IDS.filter(k => (a.pointsAwarded?.[k] ?? 0) > 0).map(k => attrNames[k] ?? k);
  const tail = touched.length ? `（${touched.join('、')}）` : '';
  const when = withTime ? `${dateTag(d, now)} ${hmLabel(d)}` : dateTag(d, now);
  return `- ${when}：${a.description.trim().slice(0, 60)}${tail}${a.backfilled ? '【事后补记】' : ''}`;
}

/**
 * @param windowDays 只取这么多天内的记录；窗内为空时说明"空窗"而不是往前翻
 */
function recentBlock(activities: Activity[], attrNames: AttrNames, now: Date, windowDays: number, max: number): { text: string; count: number } {
  const plain = activities.filter(isPlainActivity);
  const inWindow = plain.filter(a => daysAgo(new Date(a.date), now) < windowDays);
  const header = windowDays <= 2
    ? `近况（只有标「今天」「昨天」的才是近两天的事；三天前及更早的事不是近况）：`
    : `近 ${windowDays} 天的足迹（每行带日期；越靠前越近）：`;
  if (inWindow.length === 0) {
    const last = plain[0];
    if (!last) return { text: `${header}\n- 客人还没有任何记录。`, count: 0 };
    const gap = daysAgo(new Date(last.date), now);
    return {
      text: `${header}\n- 这 ${windowDays} 天里没有任何记录。上一条在 ${mdLabel(new Date(last.date))}（${gap} 天前），此后是空窗——把这段沉默本身读进牌里，不要引用更早的事。`,
      count: 0,
    };
  }
  const lines = inWindow.slice(0, max).map(a => activityLine(a, attrNames, now, windowDays <= 2));
  if (inWindow.length > max) lines.push(`- （另有 ${inWindow.length - max} 条略去）`);
  return { text: `${header}\n${lines.join('\n')}`, count: inWindow.length };
}

// ── 案头：一次性事项 / 期限 / 愿望 ──────────────────────────────

/** 与 store.getDueTodosToday 同口径，但接受任意日期（回声要算"昨天该做的"） */
function isDueOn(t: Todo, date: Date): boolean {
  const key = toLocalDateKey(date);
  const wd = date.getDay();
  return t.isActive
    && !t.archivedAt
    && !t.isBigDeal
    && (!t.startDate || t.startDate <= key)
    && (!t.weekdays || t.weekdays.length === 0 || t.weekdays.includes(wd));
}

/** 一次性事项：非每日、非长期、非按周重复——反复出现的事项天天喂只会天天被念（用户口径） */
const isOneOff = (t: Todo) => !t.repeatDaily && !t.isLongTerm && !(t.weekdays && t.weekdays.length > 0) && t.frequency === 'single';

const completedOn = (t: Todo, key: string, completions: TodoCompletion[]) =>
  !!t.completedAt || completions.some(c => c.todoId === t.id && c.date === key && c.count > 0);

function plateBlock(todos: Todo[], completions: TodoCompletion[], wishes: Wish[], now: Date): string {
  const todayKey = toLocalDateKey(now);
  const pending = todos.filter(t => isDueOn(t, now) && isOneOff(t) && !completedOn(t, todayKey, completions)).slice(0, 5);
  const deadlines = todos
    .filter(t => t.isActive && !t.archivedAt && !t.completedAt && t.deadline && t.deadline >= todayKey)
    .map(t => ({ t, days: daysAgo(now, fromKey(t.deadline!)) }))
    .filter(x => x.days <= 3)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  const active = wishes.filter(w => w.status === 'active' && !w.parentId);
  const longWishes = active.filter(w => (w.kind ?? 'long_term') === 'long_term').slice(0, 3);
  const pressures = active.filter(w => w.kind === 'pressure').slice(0, 2);

  const lines: string[] = [`案头（只作底色；正文里只可旁敲侧击，绝不写出下面任何一条的原文）：`];
  if (pending.length) lines.push(`- 今天要做、还没做的一次性事项：${pending.map(t => t.title.trim().slice(0, 30)).join('；')}`);
  if (deadlines.length) {
    const fmt = (d: number) => d <= 0 ? '就是今天' : d === 1 ? '明天' : d === 2 ? '后天' : `${d} 天后`;
    lines.push(`- 临近的期限：${deadlines.map(({ t, days }) => `${t.title.trim().slice(0, 30)}（${fmt(days)}）`).join('；')}`);
  }
  if (longWishes.length) lines.push(`- 远处的愿望：${longWishes.map(w => w.title.trim().slice(0, 30)).join('；')}`);
  if (pressures.length) lines.push(`- 压在心上的事：${pressures.map(w => w.title.trim().slice(0, 30)).join('；')}`);
  if (lines.length === 1) lines.push(`- 案头是空的。`);
  return lines.join('\n');
}

// ── 昨日回声：昨天的牌 + 昨天实际发生了什么（本地算，零 AI） ─────────

async function echoBlock(
  now: Date,
  attrNames: AttrNames,
  activities: Activity[],
  todos: Todo[],
  completions: TodoCompletion[],
): Promise<{ text: string; hasEcho: boolean }> {
  const todayKey = toLocalDateKey(now);
  let rows: DailyDivination[] = [];
  try {
    rows = await db.dailyDivinations.where('date').below(todayKey).toArray();
  } catch { /* 读不到就当没有 */ }
  const last = rows.sort((a, b) => b.date.localeCompare(a.date))[0];
  const header = `昨日回声（只用来判断"落地了没有"；不要复述其中的数字，不要复述上一次的解读）：`;
  if (!last) return { text: `${header}\n- 此前没有抽过牌。`, hasEcho: false };

  const drawDate = fromKey(last.date);
  const gap = daysAgo(drawDate, now);
  if (gap > 3) return { text: `${header}\n- 最近三天没有抽牌（上一次在 ${mdLabel(drawDate)}，${gap} 天前）。`, hasEcho: false };

  const card = TAROT_BY_ID[last.cardId];
  const cardName = card ? `《${card.name}》` : `《${last.cardId}》`;
  const orient = last.orientation === 'upright' ? '正位' : '逆位';
  const fortune = last.fortune ? FORTUNE_META[last.fortune]?.label ?? '' : '';
  const buffName = attrNames[last.effect.attribute] ?? last.effect.attribute;

  // 那天实际发生了什么
  const dayActs = activities.filter(a => isPlainActivity(a) && toLocalDateKey(new Date(a.date)) === last.date);
  const buffGained = dayActs.some(a => (a.pointsAwarded?.[last.effect.attribute] ?? 0) > 0);
  const due = todos.filter(t => isDueOn(t, drawDate) && isOneOff(t));
  const done = due.filter(t => completedOn(t, last.date, completions)).length;

  const what = [
    dayActs.length === 0 ? '那天没有记录' : `那天记了 ${dayActs.length} 条${buffGained ? `，加成属性「${buffName}」有增长` : `，加成属性「${buffName}」没有动`}`,
    due.length ? `一次性事项完成 ${done}/${due.length}` : '',
  ].filter(Boolean).join('；');

  const lines = [
    header,
    `- ${dateTag(drawDate, now)} 抽到 ${cardName}${orient}${fortune ? `，${fortune}` : ''}；签语「${last.advice || '（无）'}」。`,
    `- 实际：${what}。`,
  ];
  if (gap >= 2) lines.push(`- 注意：那是 ${relLabel(drawDate, now)} 的事，中间隔了 ${gap - 1} 天没抽牌；措辞不要说"昨天"。`);
  return { text: lines.join('\n'), hasEcho: gap === 1 };
}

// ── 手记：解读者自己此前写下的备忘 ─────────────────────────────

async function notesBlock(now: Date, opts: { dailyMax: number; longMax: number; excludeDate?: string }): Promise<string> {
  const items: Array<{ when: Date; text: string }> = [];
  try {
    const dailies = (await db.dailyDivinations.toArray())
      .filter(d => d.memo && d.date !== opts.excludeDate)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, opts.dailyMax);
    for (const d of dailies) items.push({ when: fromKey(d.date), text: d.memo!.trim() });
  } catch { /* 忽略 */ }
  try {
    const longs = (await db.longReadings.toArray())
      .filter(r => r.memo)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, opts.longMax);
    for (const r of longs) items.push({ when: new Date(r.createdAt), text: `（问「${r.question.trim().slice(0, 24)}」时）${r.memo!.trim()}` });
  } catch { /* 忽略 */ }
  if (items.length === 0) return '';
  items.sort((a, b) => b.when.getTime() - a.when.getTime());
  return [
    `解读者手记（你自己此前写下的备忘；是"上次聊到哪"，不是要复述的东西）：`,
    ...items.map(i => `- ${dateTag(i.when, now)}：${i.text}`),
  ].join('\n');
}

// ── 画像：黑猫维护的用户画像（只读） ─────────────────────────────

async function profileBlock(): Promise<string> {
  const p = (await getProfile()).trim();
  if (!p) return '';
  return `客人画像（长期信息，只作底色；不要在正文里复述它）：\n${p.slice(0, 400)}`;
}

/** 愿望表不在 loadData 里，store 里的副本可能是初始化时的旧快照；直接读 db（表很小） */
async function loadWishes(fallback: Wish[]): Promise<Wish[]> {
  try { return await db.wishes.toArray(); } catch { return fallback; }
}

// ── 每日简报 ────────────────────────────────────────────────

export interface DailyBrief {
  text: string;
  preset: WritingPreset;
  hasEcho: boolean;
}

export async function buildDailyBrief(params: { card: TarotCardData; orientation: TarotOrientation; now?: Date }): Promise<DailyBrief> {
  const now = params.now ?? new Date();
  const s = useAppStore.getState();
  const attrNames = s.settings.attributeNames as AttrNames;

  const wishes = await loadWishes(s.wishes);
  const recent = recentBlock(s.activities, attrNames, now, 2, 6);
  const echo = await echoBlock(now, attrNames, s.activities, s.todos, s.todoCompletions);
  const notes = await notesBlock(now, { dailyMax: 5, longMax: 2, excludeDate: toLocalDateKey(now) });
  const profile = await profileBlock();
  const preset = pickWritingPreset(now, params.card.id, echo.hasEcho);

  const text = [
    formatNowLine(now),
    ``,
    attributeBlock(s.attributes, s.activities, attrNames, now),
    ``,
    recent.text,
    ``,
    plateBlock(s.todos, s.todoCompletions, wishes, now),
    ``,
    echo.text,
    notes ? `\n${notes}` : '',
    profile ? `\n${profile}` : '',
    ``,
    `今日写法：【${preset.label}】${preset.guide}`,
  ].filter(l => l !== undefined).join('\n');

  return { text, preset, hasEcho: echo.hasEcho };
}

// ── 中长期简报 ──────────────────────────────────────────────

const cjkBigrams = (text: string): Set<string> => {
  const clean = text.replace(/[^一-鿿\w]/g, '');
  const grams = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) grams.add(clean.slice(i, i + 2));
  return grams;
};

function overlap(q: Set<string>, text: string): number {
  let hit = 0;
  cjkBigrams(text).forEach(g => { if (q.has(g)) hit++; });
  return hit;
}

/** 与问题在字面上有交集的任务 / 大事 / 愿望——解读只能旁敲侧击，但至少知道问题落在哪 */
function cluesBlock(question: string, todos: Todo[], wishes: Wish[], now: Date): string {
  const q = cjkBigrams(question);
  const todayKey = toLocalDateKey(now);
  type Clue = { score: number; line: string };
  const clues: Clue[] = [];
  for (const t of todos) {
    if (!t.isActive || t.archivedAt || t.completedAt) continue;
    const text = `${t.title} ${t.currentState ?? ''}`;
    const score = overlap(q, text);
    if (score === 0) continue;
    const kind = t.isBigDeal ? '大事' : t.isLongTerm ? '长期事项' : '事项';
    const dl = t.deadline && t.deadline >= todayKey ? `，期限 ${t.deadline}` : '';
    clues.push({ score, line: `- ${kind}：${t.title.trim().slice(0, 30)}${t.currentState ? `（现状：${t.currentState.trim().slice(0, 40)}）` : ''}${dl}` });
  }
  for (const w of wishes) {
    if (w.status !== 'active' || w.parentId) continue;
    const text = `${w.title} ${w.note ?? ''} ${w.currentState ?? ''}`;
    const score = overlap(q, text);
    if (score === 0) continue;
    const kind = w.kind === 'pressure' ? '压在心上的事' : '愿望';
    clues.push({ score, line: `- ${kind}：${w.title.trim().slice(0, 30)}${w.currentState ? `（现状：${w.currentState.trim().slice(0, 40)}）` : ''}` });
  }
  clues.sort((a, b) => b.score - a.score);
  const picked = clues.slice(0, 4).map(c => c.line);
  // 没有字面交集时，退而给远处的愿望——问题多半和它们有关，但只作底色
  if (picked.length === 0) {
    const far = wishes.filter(w => w.status === 'active' && !w.parentId).slice(0, 3);
    if (far.length === 0) return `与问题相关的线索：没有找到；只按牌与问题本身作答。`;
    return [`与问题相关的线索（字面上没有对上；下面是客人远处的愿望，只作底色）：`, ...far.map(w => `- ${w.kind === 'pressure' ? '压在心上的事' : '愿望'}：${w.title.trim().slice(0, 30)}`)].join('\n');
  }
  return [`与问题相关的线索（只可旁敲侧击，不得写出原文）：`, ...picked].join('\n');
}

async function priorReadingsBlock(now: Date, excludeId?: string): Promise<string> {
  let rows: LongReading[] = [];
  try { rows = await db.longReadings.toArray(); } catch { return ''; }
  const prior = rows
    .filter(r => r.id !== excludeId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 2);
  if (prior.length === 0) return '';
  return [
    `此前的问询（"上次问到哪"；不要复述当时的解读）：`,
    ...prior.map(r => `- ${dateTag(new Date(r.createdAt), now)}，${PERIOD_LABELS[r.period].label}：「${r.question.trim().slice(0, 40)}」${r.memo ? `；当时的手记：${r.memo.trim()}` : ''}`),
  ].join('\n');
}

export async function buildLongBrief(params: { question: string; period: LongReadingPeriod; now?: Date }): Promise<string> {
  const now = params.now ?? new Date();
  const s = useAppStore.getState();
  const attrNames = s.settings.attributeNames as AttrNames;
  const windowDays = params.period === 'recent' ? 7 : 14;

  const wishes = await loadWishes(s.wishes);
  const recent = recentBlock(s.activities, attrNames, now, windowDays, 16);
  const clues = cluesBlock(params.question, s.todos, wishes, now);
  const prior = await priorReadingsBlock(now);
  const notes = await notesBlock(now, { dailyMax: 4, longMax: 0 });
  const profile = await profileBlock();

  return [
    formatNowLine(now),
    ``,
    attributeBlock(s.attributes, s.activities, attrNames, now),
    ``,
    recent.text,
    ``,
    clues,
    prior ? `\n${prior}` : '',
    notes ? `\n${notes}` : '',
    profile ? `\n${profile}` : '',
  ].join('\n');
}
