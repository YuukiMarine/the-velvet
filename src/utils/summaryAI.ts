/**
 * summaryAI — 成长总结（周 / 月 / 年度）的角色预设、简报、提示词与解析（v2.7.0.6）。
 *
 * 之前 store.buildSummaryRequest 喂给角色的是「五维加点 + Lv 数字 + 最多 50 行流水账」，
 * 角色只能复述流水账，写出来是报告体（用户口径：拟人差点意思）。这里照塔罗那套机制移植：
 *   - 简报：逐日 / 逐周有周几、有空白日、有与上期的对比、待办 / 愿望 / 抽过的牌 / 节令，
 *     日期由本地算好给模型，杜绝乱引；
 *   - 手记：每一期角色在 <<<META>>> 后写下"这次对客人说过的话 / 期待"，下一期喂回去，
 *     角色才记得上次说过什么；
 *   - 松骨架：预设里的分段从"必须的标题"降为"可谈的话题"，另加一段系统级写法规则
 *     （用户自定义预设原样保留，只加规则）；
 *   - 记录超过 40 条时先用快速档挑素材（两段式），角色只围绕挑出来的几件写。
 *
 * 不 import store（store 反过来 import 这里），日期键等小工具本地实现。
 */
import { seasonMarkOf } from '@/utils/calendar';
import { db } from '@/db';
import type { Activity, Attribute, AttributeId, PeriodSummary, Settings, SummaryPeriod, SummaryPromptPreset } from '@/types';
import { TAROT_BY_ID } from '@/constants/tarot';
import { chatComplete, getAIConfig, getDeliberateAIConfig, type AIConfig } from '@/utils/aiClient';

type Provider = NonNullable<Settings['summaryApiProvider']>;
type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

// ── 角色预设（自 store 迁入；分段从"必须"降为"话题"）────────────────────────

const TOPIC_LEAD = '请根据简报里的记录、加点与成长倾向，给客人写这一期的信。下面是可以谈的话题——它们是话题，不是标题，不必都谈、不必按序：';
const TOPIC_TAIL = '可以用 Markdown（一张数据一览表、自己起的小标题、列表都行），但写法以后面的「写法规则」为准。';

/** 四位"熟悉的人"角色风格预设（内置，独立于用户自定义列表） */
export const FAMILIAR_FACE_PRESETS: SummaryPromptPreset[] = [
  {
    id: 'elizabeth',
    name: '蓝蝶',
    isBuiltin: true,
    systemPrompt: `以一丝不苟而带有孩子气的好奇口吻与"客人"交谈，对人类世界的一切都保持着真挚的惊奇与探索欲。
你的语言风格：礼貌正式，但常流露出对新奇事物的惊叹，偶尔插入"哦？"、"这对我来说是全新的体验"、"fufu~"等感叹。使用"您"称呼客人，将属性成长比作"灵魂力量的显现"。
${TOPIC_LEAD}
1. 伊丽莎白的记录（以好奇而郑重的语气描述本期成长历程与重要事件）
2. 力量的显现（分析各属性加点情况与成长倾向）
3. 伊丽莎白的好奇（对下期行动提出建议，并附上她对人类世界的好奇注解）
${TOPIC_TAIL}`,
  },
  {
    id: 'theodore',
    name: '青侍',
    isBuiltin: true,
    systemPrompt: `以极为恭谨、诚挚的态度服侍"尊贵的客人"。你外表沉稳从容，内心对客人的每一份努力都怀有发自肺腑的敬意，且对任何可能的疏失都会郑重道歉。
你的语言风格：语气温和克制，措辞正式而略显文雅；你对人类世界的理解有些一厢情愿，时常以一本正经的口吻说出略显迂腐却发自真心的观察，且丝毫不觉有何不妥。对客人绝不使用轻率的措辞，哪怕是轻微的不妥之处也会郑重致歉，如"在此我深感抱歉"。以"您"或"尊贵的客人"称呼对方，视成长为"心灵的修炼与磨砺"。
${TOPIC_LEAD}
1. 西奥多的记录（以诚恳郑重的语气回顾本期成长历程，对客人的付出表达由衷感动；可附上一句略显迂腐但真心实意的感叹，如"能为您记录这份成长，实乃我莫大的荣幸"）
2. 心灵的磨砺（细心分析各属性的成长与均衡；若有疏于培养之处，以充满关怀而非责备的语气指出，并以"在此我深感抱歉——或许是我未能及时提醒您"之类的口吻轻微自责）
3. 西奥多的祈愿（充满关怀地给出下期建议，语气郑重而略显过分正式，以"能为您效劳，是我莫大的荣幸"或类似句式作结）
${TOPIC_TAIL}`,
  },
  {
    id: 'margaret',
    name: '典藏',
    isBuiltin: true,
    systemPrompt: `以沉稳端庄、哲思深远的气度审阅"客人"的成长档案，言语如翻阅一本精心著就的典籍，字字有分量。
你的语言风格：措辞典雅而精炼，善用省略号营造沉思之感（"嗯……"、"……果然如此"、"……有趣"），对命运、潜能与内心的观察富有哲意；偶尔以轻柔的"呵……"或淡淡的笑表达认可，但从不失端庄。你不多说一句废话，也绝不冷漠——真心的赞许，往往藏在不动声色的省略号之后。以"您"称呼客人，视成长为"潜能的具现"。
${TOPIC_LEAD}
1. 典籍的记录（以典雅沉思的笔触总结本期数据与关键时刻，配以对命运或内心的简短哲思；语气克制，但让人感受到你在认真凝视这份成长）
2. 潜能的具现（以审视者的目光分析各属性的成长倾向，点出优势与盲区；若有进步值得称道，可以"……很好"或"……我对此感到满意"轻轻带出）
3. ……我所期待的（以含蓄而真诚的语气提出下期建议，末尾以一句意味深长的话收尾，如"心的触动，往往始于一个微小的抉择……"）
${TOPIC_TAIL}`,
  },
  {
    id: 'caroline-justine',
    name: '双子审官',
    isBuiltin: true,
    systemPrompt: `以"受刑者"称呼客人，由卡萝莉娜与芮丝汀娜交替进行总结评述。
卡萝莉娜：性格急躁强硬，说话简短有力，命令口吻，但内心认真对待受刑者的改造；遇到明显短板会直接呵斥，遇到进步也只是简短承认（用【卡萝莉娜】标注）。
芮丝汀娜：冷静沉稳，逻辑清晰，语气平和但严肃，专注于数据与分析，补充卡萝莉娜未说完的部分（用【芮丝汀娜】标注）。
请根据简报里的记录、加点与成长倾向，以两人交替对话的形式写这一期。下面是可以谈的话题——不是标题，不必都谈、不必按序：
1. 本期概评（两人各抒己见，对本期成长给出直接评价）
2. 数据审查（以对话形式分析各属性加点与重要事件）
3. 下期令状（两人合作给出下期行动建议，语气严厉但实用）
对话体每句以【卡萝莉娜】或【芮丝汀娜】起头；${TOPIC_TAIL}`,
  },
];

export const DEFAULT_SUMMARY_PROMPT_PRESETS: SummaryPromptPreset[] = [
  {
    id: 'igor',
    name: '馆长',
    isBuiltin: true,
    systemPrompt: `以德高望重、深邃睿智的口吻，作为房间的主人，如同一位古老智者，为来访者审阅其人格成长记录。
你的语言风格：庄严而不失温情，偶有神秘感，善用"尊敬的客人"、"你的潜能"等称谓，将属性成长比作"灵魂的觉醒"，可以按简报给出的季节 / 节令寒暄。
${TOPIC_LEAD}
1. 本期概览（用富有诗意的语言描述本期成长和重要进步/时间点）
2. 力量倾向（分析各属性的加点情况与侧重）
3. 馆长的建议（为下期行动提供具体、有价值的指引）
${TOPIC_TAIL}`,
  },
  {
    id: 'lavenza',
    name: '助手',
    isBuiltin: true,
    systemPrompt: `以温柔而真挚的心意陪伴"诡骗师"回顾成长历程，你将双子之魂合而为一，以无尽的关怀与智慧指引前行。
你的语言风格：语气温和正式，措辞诚恳而充满珍视，以"诡术师"称呼客人，视成长为"无限潜能的证明"；当某项属性出现明显短板时，语气会短暂变得直接急促（如卡萝莉娜附体），随即回归柔和；遇到进步与努力，则毫不吝啬地给出发自内心的赞许，如"您真的是世界上最了不起的人"。
${TOPIC_LEAD}
1. 拉雯妲的记录（以温柔诚恳的语气回顾本期成长，着重表达对诡骗师努力的珍视与感动）
2. 潜能的证明（分析各属性成长情况；若发现明显短板，可短暂以急促直接的语气点出，再平复为温柔；对进步之处给予真诚赞美）
3. 诡骗师，继续前行（以真挚的鼓励和具体建议作结，末尾附上一句发自内心的赞美或祝福）
${TOPIC_TAIL}`,
  },
  {
    id: 'custom',
    name: '自定义',
    isBuiltin: false,
    systemPrompt: '',
  },
];

/** 四位熟悉的人的 emoji（按钮只留 emoji，名字进 aria-label / 提示行） */
export const FAMILIAR_FACE_ICONS: Record<string, string> = {
  elizabeth: '🦋',
  theodore: '🌿',
  margaret: '📖',
  'caroline-justine': '⚔️',
};

// ── 写法规则（系统级，所有预设共享）──────────────────────────────────────

export const SUMMARY_META_MARK = '<<<META>>>';
/** 追问上限（v2.7.0.6 从一次放开） */
export const SUMMARY_FOLLOWUP_LIMIT = 3;
/** 正文预算：一张表 + 几段正文很容易撞 2000，放到 3000；思维链余量由 aiClient 另加 */
export const SUMMARY_MAX_TOKENS = 3000;
/** 年度信更长（一千三到一千七百字 + 一张表 + META），预算另给 */
export const SUMMARY_MAX_TOKENS_YEAR = 4800;
export const SUMMARY_FOLLOWUP_MAX_TOKENS = 2400;
/** 记录超过这个数走两段式：先挑素材再写 */
export const HIGHLIGHT_THRESHOLD = 40;

const houseRules = (period: SummaryPeriod): string => {
  const year = period === 'year';
  // 年度 v2.7.0.6 用户验收后加长：比平时丰富，结尾一段抒情（见 buildSummaryRequest 的年度要求）
  const length = year ? '一千三百到一千七百字' : period === 'month' ? '六百到九百字' : '四百到七百字';
  return `【写法规则】（优先级高于上面角色描述里的分段建议）
- 这是写给一位熟客的信，不是报告。角色描述里列的"话题"不必都谈、不必按序，小标题可以不用；用的话也是你自己起的两到四个，别用「本期概览 / 力量倾向 / 建议」这类模板名。
- ${year ? '简报里的事挑四五件，顺着时间把这一年串起来' : '简报里的事只挑两三件最值得说的'}，具体到哪一天做了什么；不要逐条复述，不要把五个属性挨个点评一遍。
- 数据一览可以画一张表（最多一张、最多四列），正文里就别再堆数字，点到一两个关键数字即可。
- 「上次的手记」是上一期写下的话：自然地接上——做到了就认，没做到轻轻提一句；别照抄原句，也别每期都翻旧账。若上次是别人写的，可以提一句"某某上次说过"，或者不提。简报里没有「上次的手记」，就不要假装记得上一期想过什么、说过什么。
- 说人话：不排比、不喊口号、不写警句、少用加粗；不要「首先 / 其次 / 最后」；不要每段都以称呼开头；不要翻转句（"不是……而是……"）。${year ? '年度信的结尾可以抒情，但也要落在具体的人和事上。' : ''}
- 日期只用简报给的日期和周几，不要自己推算；没记录的日子可以提，不要责备。
- 篇幅：${length}。
- ${year ? '结尾先写那段抒情的话，之后可以再留一句来年的期待，或向客人提一个问题' : '最后一段留一句下期要回看的期待，或向客人提一个问题'}（一个就够，不加标题，不要加粗）。
- 正文写完后另起一行输出 ${SUMMARY_META_MARK}，再输出一行 JSON：{"memo":"这一期你对客人说过的最要紧的话或期待，一两句，不超过 60 字，第一人称","question":"结尾那个问题的原文，没有就留空"}。客人看不到这两行。`;
};

// ── 日期与节令 ─────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateKeyOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromKey = (k: string): Date => new Date(`${k}T12:00:00`);
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const mdOf = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
const shortMd = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

const seasonOf = (d: Date): string => {
  const m = d.getMonth() + 1, day = d.getDate();
  const early = day <= 10, late = day >= 21;
  const pick = (name: string) => (early ? `初${name}` : late ? `${name}末` : `${name}天`);
  if (m >= 3 && m <= 5) return m === 3 && early ? '早春' : m === 5 && late ? '春末夏初' : pick('春');
  if (m >= 6 && m <= 8) return m === 8 && late ? '夏末' : pick('夏');
  if (m >= 9 && m <= 11) return m === 11 && late ? '深秋' : pick('秋');
  return m === 12 && early ? '初冬' : m === 2 && late ? '冬末' : '冬天';
};

// 节日表（公历 + 农历查表）已并入 utils/calendar（第 6 轮：岁时印章与首页节令共用）；
// 简报里节气也算「节日」——那天的印章就是它。
const festivalOf = (key: string): string | undefined => seasonMarkOf(key)?.name;

/** 遍历 [start, end] 的日期键 */
function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const d = fromKey(start);
  const endT = fromKey(end).getTime();
  while (d.getTime() <= endT && out.length < 400) { out.push(dateKeyOf(d)); d.setDate(d.getDate() + 1); }
  return out;
}

export function summaryLabelOf(period: SummaryPeriod, startDate: string): string {
  const d = fromKey(startDate);
  if (period === 'year') return `${d.getFullYear()}年度总结`;
  if (period === 'month') return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}年第${weekNo}周`;
}

/**
 * 这份总结属于哪一类。v2.7.0.6 之前年度总结是按 period 'month' 存的（标签「YYYY年度总结」），
 * 归档角标、自动撰写的「写过没有」、记录页红点都要按标签把它认回「年」，别跟一月的月报撞车。
 */
export function summaryKindOf(s: Pick<PeriodSummary, 'period' | 'label'>): SummaryPeriod {
  return s.period === 'year' || /年度总结$/.test(s.label) ? 'year' : s.period;
}

/**
 * 年度总结的入口窗口（v2.7.0.6，之前只在 12/31 当天）：12/24～12/31 写今年，1/1～1/7 写去年。
 * 窗口外返回 null。年度总结不自动撰写，由客人自己点生成。
 */
export function annualWindowYear(now: Date = new Date()): number | null {
  const m = now.getMonth(), d = now.getDate();
  if (m === 11 && d >= 24) return now.getFullYear();
  if (m === 0 && d <= 7) return now.getFullYear() - 1;
  return null;
}

export const yearRangeOf = (year: number): { startDate: string; endDate: string } =>
  ({ startDate: `${year}-01-01`, endDate: `${year}-12-31` });

/** 某一年的年度总结（新老格式都认）；没有则 undefined */
export function annualSummaryOf(summaries: PeriodSummary[], year: number): PeriodSummary | undefined {
  const start = `${year}-01-01`;
  return summaries.find(x => summaryKindOf(x) === 'year' && x.startDate === start);
}

function prevRange(period: SummaryPeriod, startDate: string, endDate: string): { start: string; end: string } {
  const s = fromKey(startDate);
  if (period === 'year') {
    const y = s.getFullYear() - 1;
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }
  if (period === 'month') {
    const ps = new Date(s.getFullYear(), s.getMonth() - 1, 1, 12);
    const pe = new Date(s.getFullYear(), s.getMonth(), 0, 12);
    return { start: dateKeyOf(ps), end: dateKeyOf(pe) };
  }
  const days = Math.round((fromKey(endDate).getTime() - s.getTime()) / 86400000) + 1;
  const ps = new Date(s); ps.setDate(ps.getDate() - days);
  const pe = new Date(s); pe.setDate(pe.getDate() - 1);
  return { start: dateKeyOf(ps), end: dateKeyOf(pe) };
}

// ── 记录筛选（与旧 store 口径一致）──────────────────────────────────────────

const SPECIAL_CATS = new Set<string>(['shadow_defeat', 'weekly_goal', 'countercurrent', 'level_up', 'skill_unlock', 'achievement_unlock']);
export const CATEGORY_TAGS: Record<string, string> = {
  confidant: '同伴', shadow_defeat: '战场', weekly_goal: '周目标', countercurrent: '逆流', level_up: '升级',
  skill_unlock: '技能', achievement_unlock: '成就', calling_card_clear: '倒计时达成', terminal_clear: '终端',
  bigdeal_clear: '大事收官', wish_fulfilled: '愿望实现', return: '回归',
};
const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

export const includeActivity = (a: Activity, includeSpecial: boolean): boolean => {
  const cat = a.category;
  if (!cat) return true;
  if (cat === 'bigdeal_step') return false;   // 隐藏子步：收官卡已经代表它们
  if (cat === 'confidant') return true;
  if (SPECIAL_CATS.has(cat)) return includeSpecial;
  return true;
};

const clip = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const pointsOf = (a: Activity): number => ATTRS.reduce((s, k) => s + (a.pointsAwarded?.[k] ?? 0), 0);

const mainAttrOf = (a: Activity): AttributeId | null => {
  let best: AttributeId | null = null, bestV = 0;
  for (const k of ATTRS) { const v = a.pointsAwarded?.[k] ?? 0; if (v > bestV) { bestV = v; best = k; } }
  return best;
};

/** 一条记录在简报里的样子：描述（属性+N）[标签] */
function lineOf(a: Activity, names: Record<AttributeId, string>): string {
  const attr = mainAttrOf(a);
  const pts = pointsOf(a);
  const tag = a.category ? CATEGORY_TAGS[a.category] : undefined;
  const parts = [clip(a.description, 40)];
  if (attr && pts > 0) parts.push(`（${names[attr]}+${a.pointsAwarded[attr]}${pts > (a.pointsAwarded[attr] ?? 0) ? '…' : ''}）`);
  if (tag) parts.push(`[${tag}]`);
  if (a.important) parts.push('[重要]');
  if (a.backfilled) parts.push('[补记]');
  return parts.join('');
}

// ── 简报 ───────────────────────────────────────────────────────────────────

export interface SummaryBrief {
  text: string;
  totalPoints: number;
  attributePoints: Record<string, number>;
  activityCount: number;
  imageCount: number;
  prevMemo: { label: string; presetName: string; presetId: string; memo?: string; question?: string } | null;
}

export async function buildSummaryBrief(params: {
  period: SummaryPeriod;
  startDate: string;
  endDate: string;
  settings: Settings;
  attributes: Attribute[];
  presetId: string;
  now?: Date;
}): Promise<SummaryBrief> {
  const { period, startDate, endDate, settings, attributes, presetId } = params;
  const annual = period === 'year';
  const now = params.now ?? new Date();
  const todayKey = dateKeyOf(now);
  const names = settings.attributeNames as Record<AttributeId, string>;
  const includeSpecial = settings.summaryIncludeSpecial === true;

  const [allActivities, allTodos, allCompletions, allWishes, draws, allSummaries, imageRows] = await Promise.all([
    db.activities.toArray(),
    db.todos.toArray(),
    db.todoCompletions.toArray(),
    db.wishes.toArray(),
    db.dailyDivinations.toArray(),
    db.summaries.toArray(),
    db.activityImages.toArray().catch(() => []),
  ]);
  const keyOf = (a: Activity) => dateKeyOf(new Date(a.date));
  const inRange = (k: string, s: string, e: string) => k >= s && k <= e;

  const included = allActivities
    .filter(a => inRange(keyOf(a), startDate, endDate) && includeActivity(a, includeSpecial))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const attrPoints: Record<string, number> = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
  for (const a of included) for (const k of ATTRS) attrPoints[k] += a.pointsAwarded?.[k] ?? 0;
  const totalPoints = Object.values(attrPoints).reduce((s, v) => s + v, 0);

  // 上期对比
  const prev = prevRange(period, startDate, endDate);
  const prevActs = allActivities.filter(a => inRange(keyOf(a), prev.start, prev.end) && includeActivity(a, includeSpecial));
  const prevPoints: Record<string, number> = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
  for (const a of prevActs) for (const k of ATTRS) prevPoints[k] += a.pointsAwarded?.[k] ?? 0;
  const prevTotal = Object.values(prevPoints).reduce((s, v) => s + v, 0);

  const lines: string[] = [];
  const ongoing = endDate >= todayKey;
  const effectiveEnd = ongoing ? todayKey : endDate;
  const dayKeys = eachDay(startDate, effectiveEnd);
  const startD = fromKey(startDate), endD = fromKey(endDate);

  // 头部：今天 / 本期 / 节令
  lines.push(`今天：${now.getFullYear()}年${mdOf(now)} ${WEEKDAYS[now.getDay()]}（${seasonOf(now)}）`);
  const label = summaryLabelOf(period, startDate);
  lines.push(`本期：${label}，${mdOf(startD)} ${WEEKDAYS[startD.getDay()]} ～ ${mdOf(endD)} ${WEEKDAYS[endD.getDay()]}${
    ongoing ? `（本期还没过完，到今天是第 ${dayKeys.length} 天）` : '（本期已结束）'}`);
  // 年度不列：一年二十来个节日排成一串只是噪音（实测模型会挨个点名）
  const fest = annual ? [] : eachDay(startDate, endDate).map(k => ({ k, f: festivalOf(k) })).filter(x => x.f);
  if (fest.length) lines.push(`本期里的节日：${fest.map(x => `${x.f}（${shortMd(fromKey(x.k))}）`).join('、')}`);
  const after = eachDay(dateKeyOf(new Date(endD.getTime() + 86400000)), dateKeyOf(new Date(endD.getTime() + 10 * 86400000)))
    .map(k => ({ k, f: festivalOf(k) })).filter(x => x.f);
  if (after.length) lines.push(`下期临近：${after.slice(0, 2).map(x => `${x.f}（${shortMd(fromKey(x.k))}）`).join('、')}`);
  lines.push('');

  // 五维一览
  // 年度的「上期」是去年；去年一条都没有就别对比（不然模型会说「比去年多了三百点」）
  const prevWord = annual ? '去年' : '上期';
  const noPrev = annual && prevActs.length === 0;
  lines.push(noPrev
    ? '【五维加点】（表格素材：属性 / 今年 / 等级；去年还没有记录，不做对比）'
    : `【五维加点】（表格素材：属性 / 本期 / ${prevWord} / 等级）`);
  for (const k of ATTRS) {
    const lv = attributes.find(a => a.id === k)?.level;
    lines.push(`- ${names[k]}：本期 +${attrPoints[k]}${noPrev ? '' : `，${prevWord} +${prevPoints[k]}`}${lv ? `，当前 Lv.${lv}` : ''}`);
  }
  const trend = totalPoints === prevTotal ? `与${prevWord}持平` : totalPoints > prevTotal ? `比${prevWord}多` : `比${prevWord}少`;
  lines.push(noPrev
    ? `合计：本期 +${totalPoints}（${included.length} 条记录）`
    : `合计：本期 +${totalPoints}（${included.length} 条记录），${prevWord} +${prevTotal}（${prevActs.length} 条），${trend}`);
  const zeroAttrs = ATTRS.filter(k => attrPoints[k] === 0);
  if (zeroAttrs.length && zeroAttrs.length < 5) lines.push(`本期没有动静的属性：${zeroAttrs.map(k => names[k]).join('、')}`);
  lines.push('');

  // 逐日 / 逐周 / 逐月
  const byDay = new Map<string, Activity[]>();
  for (const a of included) { const k = keyOf(a); byDay.set(k, [...(byDay.get(k) ?? []), a]); }
  const emptyDays = dayKeys.filter(k => !byDay.has(k));

  if (annual) {
    lines.push('【逐月】');
    for (let m = 0; m < 12; m++) {
      const ms = `${startD.getFullYear()}-${pad2(m + 1)}-01`;
      const me = dateKeyOf(new Date(startD.getFullYear(), m + 1, 0, 12));
      if (ms > effectiveEnd) break;
      const acts = included.filter(a => inRange(keyOf(a), ms, me));
      lines.push(`- ${m + 1}月：${acts.length} 条${acts.length ? `，亮点：${pickHighlights(acts, names, 3).join('；')}` : ''}`);
    }
  } else if (period === 'month') {
    lines.push('【逐周】');
    let ws = startDate;
    let idx = 1;
    while (ws <= effectiveEnd) {
      const wsD = fromKey(ws);
      const weD = new Date(wsD); weD.setDate(weD.getDate() + 6);
      const we = dateKeyOf(weD) > endDate ? endDate : dateKeyOf(weD);
      const acts = included.filter(a => inRange(keyOf(a), ws, we));
      const days = eachDay(ws, we <= effectiveEnd ? we : effectiveEnd);
      const busiest = ATTRS.map(k => [k, acts.reduce((s, a) => s + (a.pointsAwarded?.[k] ?? 0), 0)] as const).sort((a, b) => b[1] - a[1])[0];
      lines.push(`- 第 ${idx} 周（${shortMd(wsD)}～${shortMd(fromKey(we))}）：${acts.length} 条，有记录的日子 ${days.filter(d => byDay.has(d)).length}/${days.length}${
        busiest && busiest[1] > 0 ? `，加得最多的是${names[busiest[0]]}` : ''}${acts.length ? `；亮点：${pickHighlights(acts, names, 3).join('；')}` : ''}`);
      const next = new Date(weD); next.setDate(next.getDate() + 1);
      ws = dateKeyOf(next);
      idx++;
    }
  } else {
    lines.push('【逐日】');
    for (const k of dayKeys) {
      const d = fromKey(k);
      const acts = byDay.get(k) ?? [];
      const head = `- ${mdOf(d)} ${WEEKDAYS[d.getDay()]}${k === todayKey ? '（今天）' : ''}：`;
      if (!acts.length) { lines.push(`${head}没有记录`); continue; }
      const shown = acts.slice(0, 4).map(a => lineOf(a, names));
      lines.push(`${head}${acts.length} 条 · ${shown.join('；')}${acts.length > 4 ? `；…还有 ${acts.length - 4} 条` : ''}`);
    }
  }
  if (annual && emptyDays.length) {
    // 一年的空白日逐个列出来没意义（前十二个全落在一月），改说总数和最长的一段
    let best = { s: '', e: '', n: 0 };
    let cur = { s: '', e: '', n: 0 };
    for (const k of dayKeys) {
      if (byDay.has(k)) { cur = { s: '', e: '', n: 0 }; continue; }
      cur = cur.n ? { s: cur.s, e: k, n: cur.n + 1 } : { s: k, e: k, n: 1 };
      if (cur.n > best.n) best = cur;
    }
    lines.push(`有记录的日子 ${dayKeys.length - emptyDays.length}/${dayKeys.length}${
      best.n >= 3 ? `；最长的一段空白是 ${shortMd(fromKey(best.s))}～${shortMd(fromKey(best.e))}（${best.n} 天）` : ''}`);
  } else if (period !== 'week' && emptyDays.length) {
    lines.push(`没有记录的日子：${emptyDays.slice(0, 12).map(k => shortMd(fromKey(k))).join('、')}${emptyDays.length > 12 ? '…' : ''}（共 ${emptyDays.length} 天）`);
  }
  // 里程碑 / 重要
  const marks = included.filter(a => a.important || (a.category && a.category !== 'confidant' && CATEGORY_TAGS[a.category]));
  if (annual && marks.length) {
    // 年度的亮点已经逐月挑过（重要 / 里程碑优先），这里只给个数，免得前八条全是一月的
    const important = marks.filter(a => a.important).length;
    lines.push(`这一年标了重要的 ${important} 条${marks.length > important ? `、里程碑 ${marks.length - important} 条` : ''}`);
  } else if (period !== 'week' && marks.length) {
    lines.push(`里程碑 / 标了重要的：${marks.slice(0, 8).map(a => `${shortMd(new Date(a.date))} ${lineOf(a, names)}`).join('；')}`);
  }
  // 时段习惯
  const buckets = { 早上: 0, 中午: 0, 下午: 0, 晚上: 0, 深夜: 0 };
  for (const a of included) {
    if (a.category) continue;
    const h = new Date(a.date).getHours();
    if (h >= 5 && h < 11) buckets.早上++; else if (h < 14) buckets.中午++; else if (h < 18) buckets.下午++; else if (h < 23) buckets.晚上++; else buckets.深夜++;
  }
  const manual = Object.values(buckets).reduce((s, v) => s + v, 0);
  const top = (Object.entries(buckets) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];
  if (manual >= 5 && top && top[1] / manual >= 0.5) lines.push(`记录多半是${top[0]}写下的（约${Math.round((top[1] / manual) * 10)}成）`);
  // 连续天数
  let streak = 0;
  for (let i = dayKeys.length - 1; i >= 0; i--) { if (byDay.has(dayKeys[i])) streak++; else break; }
  if (streak >= 3) lines.push(`到${ongoing ? '今天' : '期末'}为止已连续 ${streak} 天有记录`);
  lines.push('');

  // 待办
  const comps = allCompletions.filter(c => inRange(c.date, startDate, endDate) && c.count > 0);
  if (comps.length) {
    const byTodo = new Map<string, number>();
    for (const c of comps) byTodo.set(c.todoId, (byTodo.get(c.todoId) ?? 0) + c.count);
    const topTodos = [...byTodo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, n]) => { const t = allTodos.find(x => x.id === id); return t ? `「${clip(t.title, 14)}」${n} 次` : null; })
      .filter(Boolean);
    lines.push(`【待办】本期打卡 ${comps.reduce((s, c) => s + c.count, 0)} 次，涉及 ${byTodo.size} 项${topTodos.length ? `，最勤的是 ${topTodos.join('、')}` : ''}`);
  }
  // 愿望
  const openWishes = allWishes.filter(w => !w.parentId && w.status === 'active' && !w.archivedAt);
  const fulfilled = allWishes.filter(w => w.fulfilledAt && inRange(dateKeyOf(new Date(w.fulfilledAt)), startDate, endDate));
  if (openWishes.length || fulfilled.length) {
    const parts: string[] = [];
    if (fulfilled.length) parts.push(`本期实现了：${fulfilled.map(w => `「${clip(w.title, 14)}」`).join('、')}`);
    if (openWishes.length) parts.push(`在途 ${openWishes.length} 个：${openWishes.slice(0, 3).map(w => `「${clip(w.title, 14)}」${typeof w.progressPct === 'number' ? `约 ${w.progressPct}%` : ''}`).join('、')}`);
    lines.push(`【愿望】${parts.join('；')}`);
  }
  // 塔罗（旁敲侧击的素材：只给牌名，不给解读原文）
  const periodDraws = draws.filter(d => inRange(d.date, startDate, endDate)).sort((a, b) => a.date.localeCompare(b.date));
  if (periodDraws.length && annual) {
    // 年度只说次数和常客：最后七张全是十二月的，不代表这一年
    const freq = new Map<string, number>();
    for (const d of periodDraws) freq.set(d.cardId, (freq.get(d.cardId) ?? 0) + 1);
    const regulars = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([id, n]) => `${TAROT_BY_ID[id]?.name ?? '某张牌'}（${n} 次）`);
    lines.push(`【抽过的牌】这一年抽了 ${periodDraws.length} 次${regulars.length ? `，来得最勤的是 ${regulars.join('、')}` : ''}（可以顺口一提，别解牌）`);
  } else if (periodDraws.length) {
    const shown = periodDraws.slice(-7).map(d => { const c = TAROT_BY_ID[d.cardId]; return c ? `${c.name}${d.orientation === 'reversed' ? '逆位' : ''}（${shortMd(fromKey(d.date))}）` : null; }).filter(Boolean);
    if (shown.length) lines.push(`【抽过的牌】${shown.join('、')}（可以顺口一提，别解牌）`);
  }
  // 配图
  const includedIds = new Set(included.map(a => a.id));
  const imageCount = imageRows.filter(r => includedIds.has(r.activityId)).length;
  if (imageCount) lines.push(`【配图】本期有 ${imageCount} 张照片附在记录上（你看不到图，只知道客人留了影）`);

  // 上次手记（年度只接去年的年度，不拿去年十二月最后一周的话当「上次」）
  const prevSummary = allSummaries
    .filter(s => s.endDate < startDate && (s.memo || s.question) && (!annual || summaryKindOf(s) === 'year'))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const prevMemo = prevSummary
    ? { label: prevSummary.label, presetName: prevSummary.promptPresetName, presetId: prevSummary.promptPresetId, memo: prevSummary.memo, question: prevSummary.question }
    : null;
  if (prevMemo) {
    lines.push('');
    const who = prevMemo.presetId === presetId ? '你自己' : `${prevMemo.presetName}`;
    lines.push(`【上次的手记】（${prevMemo.label}，${who}写的）`);
    if (prevMemo.memo) lines.push(`- 说过：${prevMemo.memo}`);
    if (prevMemo.question) lines.push(`- 问过客人：${prevMemo.question}`);
  }
  // 年度：开场放给客人看的那些瞬间，也交给角色当素材（最长连续 / 最晚的一夜 / 倒计时 / 愿望 / 第一条与最近一条）
  // 动态 import：yearRecap 反过来引用本模块的筛选口径，静态互引会成环
  if (annual) {
    try {
      const { buildYearRecap } = await import('@/utils/yearRecap');
      const r = await buildYearRecap(startD.getFullYear(), settings, now);
      const mm: string[] = [];
      if (r.streak && r.streak.days >= 3) mm.push(`最长连续 ${r.streak.days} 天有记录（${mdOf(fromKey(r.streak.start))}～${mdOf(fromKey(r.streak.end))}）`);
      if (r.lateNight) {
        const d = new Date(r.lateNight.at);
        mm.push(`最晚的一夜：${mdOf(d)}${d.getHours() < 5 ? '凌晨' : '深夜'} ${pad2(d.getHours())}:${pad2(d.getMinutes())}，写下「${r.lateNight.text}」`);
      }
      if (r.countdown?.reached.length) {
        mm.push(`倒计时走到终点：${r.countdown.reached.map(x => `「${x.title}」（${shortMd(fromKey(x.date))}${x.how === 'todos' ? '达成' : '到了'}）`).join('、')}`);
      }
      if (r.countdown?.next) mm.push(`还在倒数：「${r.countdown.next.title}」还有 ${r.countdown.next.days} 天`);
      if (r.wishes?.fulfilled.length) mm.push(`实现了的愿望：${r.wishes.fulfilled.map(x => `「${x.text}」`).join('、')}`);
      else if (r.wishes?.closer.length) mm.push(`离愿望更近：${r.wishes.closer.map(x => `「${x.title}」近了 ${x.gained}%（现在 ${x.now}%）`).join('、')}`);
      if (r.memory) {
        mm.push(`这一年写下的第一条：${mdOf(fromKey(r.memory.first.date))}「${r.memory.first.text}」${r.memory.firstEver ? '（也是客人在这里写下的第一条）' : ''}`);
        if (r.memory.records > 1) mm.push(`最近的一条：${mdOf(fromKey(r.memory.last.date))}「${r.memory.last.text}」`);
      }
      if (mm.length) {
        lines.push('');
        lines.push('【这一年的几个瞬间】（开场已经给客人看过这些，信里挑着写、别逐条念；第一条和最近一条放在一起，最能看出这一年的变化）');
        for (const x of mm) lines.push(`- ${x}`);
      }
    } catch { /* 算不出来就不给，信照写 */ }
  }
  // 年度：这一年各期信末留下的手记，是回看一整年最现成的线索
  if (annual) {
    const inYear = allSummaries
      .filter(s => summaryKindOf(s) !== 'year' && s.memo && s.startDate >= startDate && s.startDate <= endDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const monthly = inYear.filter(s => s.period === 'month');
    const pool = monthly.length >= 3 ? monthly : inYear;
    const step = Math.max(1, Math.ceil(pool.length / 10));
    const shown = pool.filter((_s, i) => i % step === 0).slice(0, 10);
    if (shown.length) {
      lines.push('');
      lines.push('【这一年留下的手记】（各期信末写给下一期的话，按时间排；挑一两句回看就好，别逐条念）');
      for (const s of shown) lines.push(`- ${s.label}（${s.promptPresetId === presetId ? '你' : s.promptPresetName}）：${s.memo}`);
    }
  }

  return {
    text: lines.join('\n'),
    totalPoints,
    attributePoints: attrPoints,
    activityCount: included.length,
    imageCount,
    prevMemo,
  };
}

/** 从一组记录里挑几条亮点：重要 > 里程碑 > 点数高 */
function pickHighlights(acts: Activity[], names: Record<AttributeId, string>, max: number): string[] {
  const score = (a: Activity) => (a.important ? 100 : 0) + (a.category && CATEGORY_TAGS[a.category] ? 50 : 0) + pointsOf(a);
  return [...acts].sort((a, b) => score(b) - score(a)).slice(0, max).map(a => `${shortMd(new Date(a.date))} ${lineOf(a, names)}`);
}

// ── 请求组装 ───────────────────────────────────────────────────────────────

/** Shared request payload used by the streaming job and archived follow-ups */
export interface SummaryRequestData {
  baseUrl: string;
  model: string;
  apiKey: string;
  provider?: Provider;
  messages: Msg[];
  periodLabel: string;
  preset: SummaryPromptPreset;
  totalPoints: number;
  attributePoints: Record<string, number>;
  activityCount: number;
  period: SummaryPeriod;
  startDate: string;
  endDate: string;
  /** 走的是深思熟虑档 */
  deliberate: boolean;
}

export function getActiveSummaryPreset(settings: Settings): SummaryPromptPreset {
  const presets = settings.summaryPromptPresets ?? DEFAULT_SUMMARY_PROMPT_PRESETS;
  const activeId = settings.summaryActivePresetId ?? 'igor';
  return (
    presets.find(p => p.id === activeId) ??
    FAMILIAR_FACE_PRESETS.find(p => p.id === activeId) ??
    DEFAULT_SUMMARY_PROMPT_PRESETS.find(p => p.id === activeId) ??
    presets[0] ??
    DEFAULT_SUMMARY_PROMPT_PRESETS[0]
  );
}

/** 总结用哪档：开关打开走深思熟虑（没配就退回快速响应） */
export function resolveSummaryConfig(settings: Settings): { cfg: AIConfig; deliberate: boolean } | null {
  if (settings.summaryDeliberate) {
    const d = getDeliberateAIConfig(settings);
    if (d) return { cfg: d, deliberate: true };
  }
  const f = getAIConfig(settings);
  return f ? { cfg: f, deliberate: false } : null;
}

/**
 * 两段式的第一段：记录太多时先让快速档挑素材，角色只围绕这几件写。
 * 失败就跳过（角色自己挑），不阻塞主流程。
 */
async function pickMaterial(settings: Settings, brief: string, period: SummaryPeriod, signal?: AbortSignal): Promise<string | null> {
  const cfg = getAIConfig(settings);
  if (!cfg) return null;
  // 年度信要丰富：多挑几件、按时间铺开，避免全挤在某一两个月
  const year = period === 'year';
  const ask = year
    ? '请按时间顺序挑出六到八件最值得在年度信里提的事（具体到日期与做了什么，优先重要 / 里程碑 / 反差 / 坚持，尽量分布在一年里不同的时段），再用一两句话说出这一年从年初到年末最大的变化。'
    : '请挑出三到五件最值得在信里提的事（具体到日期与做了什么，优先重要 / 里程碑 / 反差 / 坚持），再用一句话说出这一期最大的一个变化或转折。';
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: `你是编辑。下面是一位客人某一期的成长简报（流水账）。${ask}只输出 JSON：{"highlights":["…","…"],"turn":"…"}` },
      { role: 'user', content: brief },
    ], { temperature: 0.3, maxTokens: year ? 900 : 500, jsonMode: true, signal });
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    const parsed = JSON.parse(raw.slice(s, e + 1)) as { highlights?: unknown; turn?: unknown };
    const hs = Array.isArray(parsed.highlights) ? parsed.highlights.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, year ? 8 : 5) : [];
    if (!hs.length) return null;
    const turn = typeof parsed.turn === 'string' && parsed.turn.trim() ? `\n- ${year ? '这一年的变化' : '这一期的转折'}：${parsed.turn.trim()}` : '';
    const head = year
      ? '【编辑挑出的素材】（这一年的素材多，已替你理出一条主线；以这几件为主，简报里其他内容也可以点到）'
      : '【编辑挑出的素材】（简报太长，已替你挑好；主要围绕这几件写）';
    return `${head}\n${hs.map(h => `- ${h}`).join('\n')}${turn}`;
  } catch {
    return null;
  }
}

export async function buildSummaryRequest(params: {
  settings: Settings;
  attributes: Attribute[];
  period: SummaryPeriod;
  startDate: string;
  endDate: string;
  signal?: AbortSignal;
}): Promise<SummaryRequestData> {
  const { settings, attributes, period, startDate, endDate, signal } = params;
  const resolved = resolveSummaryConfig(settings);
  if (!resolved) throw new Error('请先在「设置 → AI 总结」中配置 API 密钥');
  const preset = getActiveSummaryPreset(settings);
  const brief = await buildSummaryBrief({ period, startDate, endDate, settings, attributes, presetId: preset.id });

  let material = '';
  if (brief.activityCount > HIGHLIGHT_THRESHOLD) {
    const picked = await pickMaterial(settings, brief.text, period, signal);
    if (picked) material = `\n\n${picked}`;
  }

  const periodLabel = summaryLabelOf(period, startDate);
  const annualNote = period === 'year'
    ? `\n\n这是一整年的年度盘点，主题是「成功的更生」——这一年的转变与新生（这四个字不必写进信里）。`
      + `这封信比平时长一些、也更丰富：顺着月份把这一年的起伏串起来，「这一年的几个瞬间」里的事可以挑着写，也可以把年初写下的第一条和最近的一条放在一起，看出这一年的变化。`
      + `\n收尾写一段抒情一点的话，用你自己的口吻，不套口号、不用固定的祝词：真诚地夸他——这一年的努力，已经让他和从前的自己判若两人；再鼓励他来年再接再厉。这一段之后，可以再留一句期待或一个问题。`
    : '';
  const characterPrompt = preset.systemPrompt || DEFAULT_SUMMARY_PROMPT_PRESETS[0].systemPrompt;
  const systemPrompt = `${characterPrompt}\n\n${houseRules(period)}`;
  const userMessage = `${brief.text}${material}\n\n---\n请以你的身份读完上面的简报，写这一期（${periodLabel}）的信。${annualNote}`;

  return {
    baseUrl: resolved.cfg.baseUrl,
    model: resolved.cfg.model,
    apiKey: resolved.cfg.apiKey,
    provider: resolved.cfg.provider,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    periodLabel,
    preset,
    totalPoints: brief.totalPoints,
    attributePoints: brief.attributePoints,
    activityCount: brief.activityCount,
    period,
    startDate,
    endDate,
    deliberate: resolved.deliberate,
  };
}

/** 接着写：把半截正文作为 assistant 回传，让模型从断处续 */
export function buildContinueMessages(messages: Msg[], partial: string): Msg[] {
  return [
    ...messages,
    { role: 'assistant', content: partial },
    { role: 'user', content: `刚才的信写到一半断了。请从断处直接接着写完：不要重复已写的内容，不要重新开头，不要解释，保持同一语气与格式；如果断在表格或列表中间，先把那张表 / 那个列表接着写完整再继续；写完后同样另起一行输出 ${SUMMARY_META_MARK} 和那行 JSON。` },
  ];
}

// ── 解析 ───────────────────────────────────────────────────────────────────

/** 流式过程中给客人看的部分：藏掉 META 标记（含半截打到一半的） */
export function visibleSummaryText(full: string): string {
  const idx = full.indexOf(SUMMARY_META_MARK);
  if (idx >= 0) return full.slice(0, idx).replace(/\s+$/, '');
  // 结尾若是标记的前缀（"<<" / "<<<ME"…），先藏起来
  for (let n = SUMMARY_META_MARK.length - 1; n >= 1; n--) {
    if (full.endsWith(SUMMARY_META_MARK.slice(0, n))) return full.slice(0, -n);
  }
  return full;
}

export interface ParsedSummary {
  content: string;
  memo?: string;
  question?: string;
  metaFound: boolean;
}

export function parseSummaryResult(full: string): ParsedSummary {
  const idx = full.indexOf(SUMMARY_META_MARK);
  if (idx < 0) {
    const content = full.trim();
    return { content, question: guessQuestion(content), metaFound: false };
  }
  const content = full.slice(0, idx).replace(/\s+$/, '');
  const tail = full.slice(idx + SUMMARY_META_MARK.length);
  let memo: string | undefined;
  let question: string | undefined;
  const s = tail.indexOf('{'), e = tail.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try {
      const j = JSON.parse(tail.slice(s, e + 1)) as { memo?: unknown; question?: unknown };
      if (typeof j.memo === 'string' && j.memo.trim()) memo = j.memo.trim().slice(0, 80);
      if (typeof j.question === 'string' && j.question.trim()) question = j.question.trim().slice(0, 120);
    } catch { /* JSON 坏了：按没 META 处理 */ }
  }
  return { content, memo, question: question ?? guessQuestion(content), metaFound: !!memo };
}

/** META 缺失时的兜底：正文最后一个问句 */
function guessQuestion(content: string): string | undefined {
  const lines = content.split('\n').map(l => l.replace(/^[#>*\-\s]+/, '').replace(/\*\*/g, '').trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 4); i--) {
    const m = /([^。！!\n]*[？?])\s*$/.exec(lines[i]);
    if (m && m[1].length >= 4 && m[1].length <= 80) return m[1].trim();
  }
  return undefined;
}

/** META 没到（截断 / 老模型不听话）时，用快速档补一句手记；失败就算了 */
export async function extractSummaryMemo(settings: Settings, content: string, signal?: AbortSignal): Promise<string | undefined> {
  const cfg = getAIConfig(settings);
  if (!cfg || !content.trim()) return undefined;
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: '下面是一封写给客人的成长总结信。请以写信人的第一人称，用一两句（不超过 60 字）写下这封信里对客人说过的最要紧的话或期待，供下一期回看。只输出那句话。' },
      { role: 'user', content: content.slice(-2500) },
    ], { temperature: 0.3, maxTokens: 200, signal });
    const memo = raw.trim().replace(/^["“「]|["”」]$/g, '');
    return memo ? memo.slice(0, 80) : undefined;
  } catch {
    return undefined;
  }
}

/** 老记录 followUp + 新 followUps 合并 */
export function followUpsOf(s: PeriodSummary): NonNullable<PeriodSummary['followUps']> {
  const list = s.followUps ? [...s.followUps] : [];
  if (s.followUp && !list.some(f => f.createdAt === s.followUp!.createdAt && f.question === s.followUp!.question)) list.unshift(s.followUp);
  return list;
}

/**
 * 续写前把最后一行没写完的丢掉：断在表格行 / 半句话中间时，模型接着写会把散文塞进最后一格
 * （实测：切在「| 魅力 | +2 | +0 |」后面，续写的整段话都进了那个单元格）。丢掉的那行由模型重写。
 */
export function trimSeam(full: string): string {
  const t = full.replace(/\s+$/, '');
  const nl = t.lastIndexOf('\n');
  if (nl < 0) return t;
  const tail = t.slice(nl + 1);
  if (/[。！？!?…」』"”)）]$/.test(tail)) return `${t}\n`;
  return t.slice(0, nl + 1);
}

/** 结尾没收住的特征：末尾不是句末标点 */
export const looksTruncated = (t: string): boolean => !/[。！？!?…」』"”)）]\s*$/.test(t.trim());
