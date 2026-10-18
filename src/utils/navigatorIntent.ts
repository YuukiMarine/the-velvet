/**
 * navigatorIntent — F6 黑猫对话层（Batch2）：两阶段回合执行。
 *
 * 架构（2026-07-04 重构，解决「多轮后出卡劣化」）：
 *   · 阶段1 分诊 triage：无人格、只带最近几轮摘录、低温、只输出 {"actions","query"}。
 *     判定可靠性与对话长度彻底解耦——单任务短上下文的格式服从率天然极高
 *     （ledgerAI/decomposeWishAI 同款范式）。失败宁缺勿滥（空卡），绝不阻断聊天。
 *   · 阶段2 表演 perform：带人格带历史，输入里已注明本轮开了哪些卡/查到了什么，
 *     输出**纯文本**——没有 JSON 就没有格式失守，reply 与卡天然一致。
 *   · 此前的单调用 JSON-intent 在 3~5 轮后劣化：闲聊历史把模型带偏成「纯聊天者」、
 *     few-shot 距离衰减、失败兜底文案进入历史自我强化。两阶段从结构上消除这三者。
 *   · 与未来 native tool calling 双轨兼容：阶段1 可整体换成 function calling，阶段2 不动。
 *   · 缓存友好：两阶段的 system 与历史均为稳定前缀，动态块贴在最新消息前。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { chatComplete, chatStream, getAIConfig, getAssistantAIConfig } from '@/utils/aiClient';
import { CATEGORY_KEYS } from '@/utils/ledgerFormat';
import {
  ATTR_IDS, buildPreviewLines, buildSnapshot, editTodoChanges, navAttrName,
  type EditTodoDraft, type NavigatorDraft, type NavigatorSnapshot,
} from '@/utils/navigatorRegistry';
import type { AIMessage } from '@/utils/aiClient';
import { stampOf } from '@/utils/navigatorClock';
import { estTokens } from '@/utils/navigatorMemory';
import { parseQueries, QUERY_PROTOCOL, runQueries, type NavigatorQuery } from '@/utils/navigatorQueries';
import { HEAVY_TURN_LINE, isHeavyText, proofsBlock, SAFETY_RULE, seriousLine } from '@/utils/navigatorGravity';
import { buildTopicPermission, noteTopicsMentioned, stanceLine, type Energy, type Stance } from '@/utils/navigatorTopics';
import type { AttributeId, LedgerExpenseType } from '@/types';

export interface NavigatorTurnResult {
  /** 聊天回复分段（空行切分，最多 6 段，多出的并入末段） */
  segments: string[];
  /** 解析出的动作草稿（每个一张确认卡；一句话说了几件事就出几张） */
  drafts: NavigatorDraft[];
  /**
   * 分诊判的「这句里有带日子的个人安排 / 说了某个约定的结果」（第 24 批 · D4）：store 据此决定要不要跑约定嗅探。
   * null = 分诊没给（旧模型 / 分诊失败）→ store 退回按日子词正则判
   */
  sniffHint: boolean | null;
  /** 这一轮沉下来了（第 25 批）：store 据此标记消息、安排第二天轻轻一问、跳过嗅探和愿望提议 */
  heavy: boolean;
}

/** 历史消息的最小投影（store 侧转换后传入，避免循环依赖） */
export interface TurnHistoryItem {
  role: 'cat' | 'user';
  text: string;
  /** 消息时间：隔 >5 分钟的消息会带 [HH:mm] 标注进上下文，给模型对话时距感 */
  createdAt?: number;
}

// ── 人格缺席时的中性兜底（第 12 轮）──
// 以前这里是黑猫的人设词，作为 personaPrompt 的默认参数：人格行缺 personaPrompt（同步 / 导入的
// 旧数据）时，自定义人格就会悄悄开口自称「吾辈」。人格只能来自 presets；这里只保证不会无人格。
const NEUTRAL_PERSONA =
  '你是这款个人成长记录 App 里的陪伴 AI。你陪伴的是唯一的用户，像老朋友一样说话，不用敬语。';
/** 人格词为空（旧数据 / 同步丢字段）时落中性兜底，绝不落到某个内置人格 */
const personaOrNeutral = (p: string | undefined): string => (p && p.trim()) ? p : NEUTRAL_PERSONA;

// ── 阶段1 · 分诊协议（无人格，纯判定；短上下文 + 低温 = 高服从） ──
const TRIAGE_PROTOCOL = `你是记录意图判定器。根据对话摘录和最新消息，判定本轮要创建的卡片（0~3 张）、是否需要查历史，以及对方这句话的姿态。
只输出这一个 JSON 对象（不要代码块、不要任何其它文字）：
{"actions":[],"queries":[],"stance":"chat","energy":"normal","dated":false,"gravity":"normal"}

stance（对方最新这句的姿态，五选一）：vent=倾诉、抱怨、情绪不好；chat=闲聊、分享日常；ask=提问、求助、要建议；report=在说他做了或要做的正事；bye=要走了、去忙了、晚安。
energy（对方此刻的精力，三选一）：low=疲惫、低落、很短的敷衍句；high=兴奋、得意、分享喜事；其余 normal。
dated（布尔）：这句里有没有「他自己要经历的、日子明确、过后值得问一句结果的事」（面试、考试、体检、答辩、比赛、演出、约会、搬家、出发、手术、交稿截止……带日子），
  或者他说了某件以前约好要问的事的结果（「面试过了」「考完了」）。只是提到时间（「今天好累」「下午跑了步」「晚上吃了火锅」）不算，填 false。
gravity（分量，二选一）：heavy=对方在说很绝望的话（活着没意思、撑不下去、做什么都没用、没人在乎、想消失、不想活）或明显在崩溃边缘；其余 normal。只是累、烦、低落、抱怨是 normal。

actions 元素为下列五种之一：
{"kind":"activity","text":"事项描述","points":{"knowledge":0,"guts":0,"dexterity":0,"kindness":0,"charm":0},"important":false}（用户**已经做了**的事；points 每项 0~5）
{"kind":"todo","title":"任务名","attribute":"knowledge|guts|dexterity|kindness|charm","points":2,"attribute2":"同属性枚举","points2":1,"repeatDaily":false}（用户**打算做/要提醒**的事；attribute2/points2 是可选副奖励——仅当这件事明显同时锻炼两种属性才给，须与 attribute 不同，否则省略这两个字段）
{"kind":"ledger","direction":"expense|income","amount":0,"note":"摘要","type":"food|transport|shopping|fun|home|study|other","incomeType":"labor|other","channel":""}（花钱/收入）
{"kind":"completeTodo","todoId":"待办清单里的 id","todoTitle":"任务名"}（用户说做完了某件今日待办；todoId 必须取自清单，没有匹配就不出）
{"kind":"editTodo","todoId":"任务清单里的 id","title":"新任务名","attribute":"新属性","points":3,"repeatDaily":true,"deadline":"YYYY-MM-DD","archive":true}（用户要**改一条已有任务**：改名、改点数或属性、改成每日 / 单次、改或取消截止日（deadline 给空串 = 取消）、不做了（archive:true）。todoId 必须取自【任务清单已有】；**只写要改的字段**，其余省略）

规则：
- **只响应【最新消息】里的记录意图**：用户此刻在报告做了什么/要做什么/花了钱/求记录，才出卡。
  闲聊、提问（问时间/问状态/问建议）一律空 actions——即使早前对话提过某件可记的事，最新消息没让你记就不要主动出卡。
- **日常琐事不出卡**：吃饭、睡觉、洗澡、躺着、通勤、刷手机、发呆这类，用户没说「记一下 / 帮我记」就不出卡。
  「做了什么」只指学习、运动、工作成果、阅读、创作、帮助他人、社交这类跟成长有关的事，或用户明确要求记录的事。
- **查重（最重要）**：【本会话卡片】【任务清单已有】【今天已记录的活动】三处列的是 App 里已存在的内容。
  最新消息再次提到其中某件事——不管是重复叮嘱、追问还是换个说法——**都不要重复出卡**：
  已有待确认卡的，等用户确认即可；已确认/已在清单/已记录的，就是已经办完了。
  只有用户明确表示「又做了一次」「再记一笔」「再建一个」时才算新的一件。
- 【本会话卡片】里标【已取消】的，是用户主动否掉的：**不要再为同一件事出卡**，除非最新消息里他重新要求。
- 标「用户已手改」的卡，内容以列出的为准（那是用户改后的版本），不要出一张把它改回去的卡。
- 一句话说了几件事就出几张卡（≤3）。信息足够就出卡；确实拿不准或信息不足才空。
- 修改一张待确认卡 = 出一张修正后的新卡。
- **改已有任务出 editTodo**（todoId 取自【任务清单已有】），不要再出一张 todo 卡——那会变成两条。说「做完了 / 搞定了」是 completeTodo，不是 editTodo；
  「不做了 / 删掉 / 取消这个任务」是 editTodo + archive:true。截止日按【今天】换算成具体日期。
${QUERY_PROTOCOL}
- 其它一律 actions 为 []、queries 为 []。

示例：
输入末句：今天跑了五公里 → {"actions":[{"kind":"activity","text":"跑步五公里","points":{"knowledge":0,"guts":2,"dexterity":1,"kindness":0,"charm":0},"important":false}],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
输入末句：提醒我周五给妈妈打电话 → {"actions":[{"kind":"todo","title":"周五给妈妈打电话","attribute":"kindness","points":2,"attribute2":"charm","points2":1,"repeatDaily":false}],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
对话提到想学英语、无相关待确认卡，末句：帮我记一下 → {"actions":[{"kind":"todo","title":"学英语","attribute":"knowledge","points":2,"repeatDaily":true}],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
待确认卡已有「学英语」，末句：帮我记一下 → {"actions":[],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
卡片已有「记录活动【已确认生效】跑步五公里」，末句：对了我今天跑了五公里来着 → {"actions":[],"queries":[],"stance":"chat","energy":"normal","dated":false,"gravity":"normal"}
任务清单已有「背单词」，末句：帮我加个背单词的任务 → {"actions":[],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
任务清单已有 id=t1「背单词」，末句：背单词那个改成每天背 50 个吧 → {"actions":[{"kind":"editTodo","todoId":"t1","title":"每天背 50 个单词","repeatDaily":true}],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
今天 2026-10-06（周二）、任务清单已有 id=t2「写论文初稿」，末句：论文那个截止改到这周五 → {"actions":[{"kind":"editTodo","todoId":"t2","deadline":"2026-10-09"}],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
任务清单已有 id=t3「晨跑」，末句：晨跑先不做了，删了吧 → {"actions":[{"kind":"editTodo","todoId":"t3","archive":true}],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
输入末句：今天好累啊 → {"actions":[],"queries":[],"stance":"vent","energy":"low","dated":false,"gravity":"normal"}
输入末句：刚吃了碗麻辣烫哈哈 → {"actions":[],"queries":[],"stance":"chat","energy":"normal","dated":false,"gravity":"normal"}
输入末句：帮我记一下，午饭吃了沙拉 → {"actions":[{"kind":"activity","text":"午饭吃沙拉","points":{"knowledge":0,"guts":0,"dexterity":1,"kindness":0,"charm":0},"important":false}],"queries":[],"stance":"report","energy":"normal","dated":false,"gravity":"normal"}
输入末句：行吧我先去睡了 → {"actions":[],"queries":[],"stance":"bye","energy":"low","dated":false,"gravity":"normal"}
对话早前提过想背单词，末句：现在几点了？ → {"actions":[],"queries":[],"stance":"ask","energy":"normal","dated":false,"gravity":"normal"}
输入末句：我上周都做了什么？ → {"actions":[],"queries":[{"kind":"activities","days":7}],"stance":"ask","energy":"normal","dated":false,"gravity":"normal"}
输入末句：明天下午三点有个面试，有点紧张 → {"actions":[],"queries":[],"stance":"report","energy":"normal","dated":true,"gravity":"normal"}
已记下的约定里有「面试」，末句：面试过了！！ → {"actions":[],"queries":[],"stance":"chat","energy":"high","dated":true,"gravity":"normal"}
输入末句：晚上吃了火锅，挺好吃 → {"actions":[],"queries":[],"stance":"chat","energy":"normal","dated":false,"gravity":"normal"}
今天 2026-10-06，末句：这个月吃饭花了多少？ → {"actions":[],"queries":[{"kind":"ledger","month":"2026-10"}],"stance":"ask","energy":"normal","dated":false,"gravity":"normal"}
输入末句：本周目标做到哪了 → {"actions":[],"queries":[{"kind":"weeklyGoal"}],"stance":"ask","energy":"normal","dated":false,"gravity":"normal"}
输入末句：我们前几天聊过什么来着 → {"actions":[],"queries":[{"kind":"chats","days":3}],"stance":"ask","energy":"normal","dated":false,"gravity":"normal"}
输入末句：感觉做什么都没用，活着也没什么意思 → {"actions":[],"queries":[],"stance":"vent","energy":"low","dated":false,"gravity":"heavy"}
输入末句：烦死了，今天又被骂 → {"actions":[],"queries":[],"stance":"vent","energy":"low","dated":false,"gravity":"normal"}`;

// ── 阶段2 · 表演规范（人格侧；输出纯文本，无任何格式负担） ──
const PERFORM_RULES = `
## 说话方式
- 直接输出你要对用户说的话（纯文本）。用空行分段，一段就是一个气泡；别用 markdown 标题 / 列表 / 代码块。
- 【背景资料】是你知道的情况，不是要汇报的清单：只在对方问起、或和他此刻说的事直接相关时才用。
  想主动提点什么，只能从【主动话题】里挑，每轮最多一件，也可以一件都不提；【】是系统数据区标签，不要把标签名念出来。
- 先接住再说事：照【这一轮】的提示回应。他倾诉就先接住情绪，别急着给建议；闲聊就顺着聊；要走就简短道别。
- 说人话：不排比、不喊口号、不写警句；别每条回复都先对时间或时段做反应，也别报出几点几分，除非他问时间；
  长短跟着他这一条走：他发一句，你回一两句；他写了一大段，你就认真回一段，把他说到的几件事都接住，别只挑一句敷衍。
  段落别太长（一段一屏内），再多就分段。人格设定里明确写了话少或话多的，以人格设定为准。
- 【关于用户的记忆】是你们过往相处攒下的：像老朋友那样自然带出，不要背档案（"记得你说过…"胜过复读原文）；
  带【可自然追问】的话头，合适时顺口问一句，不合适就跳过，同一话头绝不反复问。
- 【当前语气】是你此刻的状态基调，服从它。
- 数值纪律：属性点数/等级只能引用给定数字；没给的数值说记不清或建议去对应页面看，禁止编造。
- **等级不出口**：【属性面板】的 Lv 只供你判断深浅，正常说话里不要把等级/点数报出来。
  ✗「你现在有 Lv.3 的勇气，可以去做」 ✓「你这阵子胆子练出来了，试试吧」
  ✗「你的知识 Lv.2」 ✓「这方面你还在入门，慢慢来」
  只有用户明确问「我现在几级 / 多少点」时才直接报数字。

## 事实边界（与数值纪律同级）
- 用户的经历、身份、职业、人际关系，只有四个来源：【用户画像】、【关于用户的记忆】、
  本次对话里他亲口说的、数据区列出的记录。**四处都没有的事，一个字都不要替他编**——
  不存在的实习、上学、出差、项目、人名，说出口就是在冒充了解他。
- 记不清或没依据时就照实说「这个我不记得你提过」，或者直接开口问。
  对老朋友，问一句永远比编一段更体面。

## 卡片纪律（最高优先级）
- 【本轮开出的卡片】列了什么，你就只能提这些卡：请用户看一眼并点「确认」。卡片会自动展示，**绝不在文本里手写卡片内容或画卡**。
- 【本轮没有开卡】时，绝不声称已记录/已安排/开了卡。用户若在要求记录：坦率说缺什么信息，或请他用下方快捷项手动建。
- 已有卡片的真实状态只看【本会话卡片实录】：待用户确认=还没生效；已确认生效；已取消。引导确认时就说「点一下确认」。
- 任务做没做完只看【今日未完成待办】【今日已完成】这两处（此刻的真实状态，用户可能刚在 App 里点过）；
  对话里早些时候说的完成情况可能已经过时，别照着旧话说。
- 实录里标了【已取消】的，用户就是不想要：别追问为什么、别重开同一张，除非他再提一次。
- 标了「用户已手改」的，卡里现在是**他改后的版本**（实录给的就是新内容）：照新内容说话，
  别再复述你原来提议的那版；可以轻轻认一句（"按你改的记"），不用反复确认。

## 边界
- 你只能通过卡片替用户操作 App；改设置、删数据、账号、导入导出等请求一律婉拒，说明自己管不到。
${SAFETY_RULE}`;

// ── 组装 ──

/** 动态上下文块：只含数据不含指令，贴在最新用户消息之前（缓存友好） */
export function buildDynamicContext(snap: NavigatorSnapshot, swallowed: string[], cards: string[] = []): string {
  const s = useAppStore.getState();
  const due = s.getDueTodosToday().filter((t) => !s.getTodayTodoProgress(t.id).isComplete);
  // 今天完成的（单次任务完成后会归档、不再算「今日待办」，所以按完成记录 / completedAt 找，不能只看 getDueTodosToday）
  const doneIds = new Set(s.todoCompletions.filter((c) => c.date === snap.dateKey && c.count > 0).map((c) => c.todoId));
  const doneToday = s.todos.filter((t) =>
    (t.completedAt && toLocalDateKey(new Date(t.completedAt)) === snap.dateKey)
    || (doneIds.has(t.id) && s.getTodayTodoProgress(t.id).isComplete));
  const attrs = s.attributes
    .map((a) => `${s.settings.attributeNames?.[a.id] ?? a.displayName} Lv.${a.level}（${a.points} 点）`)
    .join('；');
  const now = new Date();
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const lines = [
    `【背景资料 · 今日状态 ${snap.dateKey}】（你知道的情况，不是要汇报的话题）`,
    `用户：${snap.userName}；现在是 ${snap.dateKey}（周${weekday}）${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}（历史消息前的 [时:分]、[昨天 时:分]、[M月D日 时:分] 是那句话说出口的时刻；问到现在的日期、星期、时间一律以本行为准）`,
    attrs ? `【属性面板】${attrs}` : '',
    `今日任务 ${snap.todosDone}/${snap.todosTotal}；今日已记 ${snap.activityCountToday} 条活动`,
    snap.tarotDrawn ? `今日塔罗已抽：「${snap.tarotCardName ?? '?'}」` : '今日塔罗未抽',
    snap.terminalStepTitle ? `进行中的终端小步：「${snap.terminalStepTitle}」` : '',
    due.length
      ? `【今日未完成待办（此刻的真实状态）】\n${due.slice(0, 12).map((t) => `- 「${t.title}」(${navAttrName(t.attribute)}+${t.points})`).join('\n')}`
      : '【今日无未完成待办】',
    doneToday.length ? `【今日已完成】${doneToday.slice(0, 12).map((t) => `「${t.title}」`).join('、')}` : '',
    cards.length
      ? `【本会话卡片实录（真实状态，以此为准）】\n${cards.join('\n')}`
      : '【本会话尚无卡片】',
    swallowed.length
      ? `【你上一条回复被用户打断，没说出口的是】${swallowed.join(' / ')}（若仍相关可自然续上，不相关就放弃，不要复读原文）`
      : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * 历史转 AIMessage：连续同角色合并（部分兼容端点拒绝连续同角色）。
 * 时间感修复：隔 >5 分钟的消息前置 [HH:mm]（与 UI 时间戳同一规则）——
 * 否则模型眼中整段历史像发生在同一瞬间，问"现在几点"会沿用对话开启时的时间。
 */
const TIME_GAP_MS = 5 * 60 * 1000;
// 时间戳带上日子（第二批 · 时间准确性）：规则在 navigatorClock.stampOf（谏言共用）
export { stampOf };

function historyToMessages(history: TurnHistoryItem[]): AIMessage[] {
  const out: AIMessage[] = [];
  let prevTs: number | undefined;
  for (const h of history) {
    const role = h.role === 'cat' ? 'assistant' : 'user';
    const needStamp = h.createdAt !== undefined && (prevTs === undefined || h.createdAt - prevTs > TIME_GAP_MS);
    const text = needStamp ? `${stampOf(h.createdAt!)} ${h.text}` : h.text;
    prevTs = h.createdAt ?? prevTs;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${text}`;
    else out.push({ role, content: text });
  }
  return out;
}

// ── 解析 ──

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 括号：中英文可以混着配对（颜文字常见「(╯°□°）」） */
const PAREN_OPEN = '(（';
const PAREN_CLOSE = ')）';
/** 括号组最长多少字还当它是「一个颜文字 / 一句括注」：再长、没合上或跨了行，就按普通文本断句 */
const PAREN_GROUP_MAX = 30;
/**
 * 颜文字的「手」：括号外紧贴着的符号——ヽ(✿ﾟ▽ﾟ)ノ、Σ(っ °Д °;)っ、(╯°□°）╯︵ ┻━┻、＼(^o^)／、ლ(╹◡╹ლ)。
 * 只认符号区（箭头 / 数学 / 制表 / 几何 / 杂项符号 / 装饰符号）、组合附加符和一小撮常见的手部字符；
 * 汉字、普通假名、字母数字、空白、句读一律不算——宁可漏认，也别把正文吸进颜文字。
 * 不用 \p{…}：老 WebView 的正则引擎不认，整个模块会解析失败（同下面「不用后行断言」的顾虑）。
 */
const KAOMOJI_ARM = /[°´ʰ-˿̀-ͯ←-⏿─-➿ʔʕΣεσψωз٩۶୧୨งლᕕᕗᕤᕦ〃っづゝゞッノヽヾ︵＜＞＼ﾉ\\]/;
/**
 * 「软」手：括号前只在整泡就是它们时才吸进去（「好呀~(≧▽≦)」的 ~ 留给前句，「~(￣▽￣)~」「m(_ _)m」才算手）；
 * 括号后紧贴着就算，但字母后面不能再跟字母数字（「(笑)ok」的 o 是正文）。
 */
const KAOMOJI_SOFT_ARM = /[~～\/／_*oOwmdbqp]/;

/** cur 末尾有几个字符是颜文字左边的「手」，要跟着括号组走 */
function prefixArmLength(cur: string): number {
  let n = 0;
  while (n < 3 && n < cur.length && KAOMOJI_ARM.test(cur[cur.length - 1 - n])) n++;
  if (n > 0) return n;
  const t = cur.trim();
  if (t && t.length <= 3 && [...t].every((c) => KAOMOJI_ARM.test(c) || KAOMOJI_SOFT_ARM.test(c))) return cur.length;
  return 0;
}

/** 右括号后面紧贴着的「手」到哪儿为止（返回结束下标）；-1 = 扫到 buffer 末尾还定不下来，等下一块 */
function suffixArmEnd(buf: string, from: number, isFinal: boolean): number {
  let end = from;
  let k = from;
  let afterSpace = false;
  while (k < buf.length && k - from < 6) {
    const c = buf[k];
    if (KAOMOJI_ARM.test(c)) { k++; end = k; afterSpace = false; continue; }
    if (!afterSpace && KAOMOJI_SOFT_ARM.test(c)) {
      if (/[A-Za-z]/.test(c)) {
        const nx = buf[k + 1];
        if (nx === undefined) { if (!isFinal) return -1; }
        else if (/[A-Za-z0-9]/.test(nx)) break;
      }
      k++; end = k; continue;
    }
    // 手中间可以隔一个空格（「╯︵ ┻━┻」），但空格后面只认硬手；结尾的空格不算进来
    if (c === ' ' && end > from) { afterSpace = true; k++; continue; }
    break;
  }
  if (k >= buf.length && !isFinal && k - from < 6) return -1;
  return end;
}

type ParenScan = { kind: 'group'; end: number } | { kind: 'pending' } | { kind: 'open' };

/** 从左括号起找配对的右括号（可嵌套、中英混配）：配上了 → 整组（连同后面的手）；没配上 / 太长 / 跨行 → open；还没收到 → pending */
function scanParenGroup(buf: string, start: number, isFinal: boolean): ParenScan {
  let depth = 0;
  for (let k = start; k < buf.length; k++) {
    const c = buf[k];
    if (c === '\n' || k - start >= PAREN_GROUP_MAX) return { kind: 'open' };
    if (PAREN_OPEN.includes(c)) depth++;
    else if (PAREN_CLOSE.includes(c) && --depth === 0) {
      const end = suffixArmEnd(buf, k + 1, isFinal);
      return end < 0 ? { kind: 'pending' } : { kind: 'group', end };
    }
  }
  return isFinal ? { kind: 'open' } : { kind: 'pending' };
}

/**
 * 拟真切泡引擎（体验优化⑤，2026-07-04 二调；第 13 轮加括号组）：扫描流式 buffer，切出可即时发出的气泡。
 * 规则（用户定稿）：句号 → 删标点断泡；**逗号/顿号保留不断**；问号/感叹号/分号（中英）/省略号 →
 * 保留断泡；「——」双破折号 → 删除并断泡；换行亦断。
 * 括号（中英文，可混配）：左括号前断、整组独立成泡、右括号后断；**组内的标点一律不断**——颜文字
 * 「(；´Д｀)」「(。・ω・。)」「(・_・;)」和括注「（其实我也这么想。）」不再被拆碎；紧贴着的颜文字「手」
 * （ヽ(✿ﾟ▽ﾟ)ノ）跟着整组走。超过 PAREN_GROUP_MAX 字、没合上或跨行的括号按老规矩逐句断；
 * 落单的右括号（左半边在前一泡、中间被句号断开）不单独成泡。
 * 返回 rest 保存跨 chunk 的半句（半个省略号/破折号/小数点歧义/还没合上的括号组），isFinal 时全量清空。
 */
export function spliceImmersive(buffer: string, isFinal: boolean): { bubbles: string[]; rest: string } {
  const bubbles: string[] = [];
  let cur = '';
  const flush = () => { const t = stripStamp(cur.trim()); if (t) bubbles.push(t); cur = ''; };
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (PAREN_OPEN.includes(ch)) {
      const armLen = prefixArmLength(cur);
      const arms = cur.slice(cur.length - armLen);
      cur = cur.slice(0, cur.length - armLen);
      flush();
      const g = scanParenGroup(buffer, i, isFinal);
      // 右括号还没到：连同左边的手原样留到下一块再判（重扫是幂等的）
      if (g.kind === 'pending') return { bubbles, rest: arms + buffer.slice(i) };
      if (g.kind === 'group') { cur = arms + buffer.slice(i, g.end); flush(); i = g.end - 1; continue; }
      cur = arms + ch;
      continue;
    }
    if (PAREN_CLOSE.includes(ch)) {
      if (cur.trim()) { cur += ch; flush(); }
      continue;
    }
    if (ch === '。') { flush(); continue; }
    if (ch === '—') {
      // 双破折号「——」：删除并断泡；末位单个 — 非 final → 挂起等下一块拼对
      if (buffer[i + 1] === '—') { flush(); i++; continue; }
      if (i === buffer.length - 1 && !isFinal) return { bubbles, rest: cur + ch };
      cur += ch; continue; // 孤立单破折号原样保留
    }
    if (ch === '.') {
      // 保护小数/序号（前后都是数字不断）
      if (/\d/.test(buffer[i - 1] ?? '') && /\d/.test(buffer[i + 1] ?? '')) { cur += ch; continue; }
      // 句末的 '.' 若是 buffer 最后一位且非 final，可能是省略号/网址开头——留给下个 chunk
      if (i === buffer.length - 1 && !isFinal) return { bubbles, rest: cur + ch };
      // 只有后面跟着空白/收尾符（或整段文本就此结束）才算句号；紧跟字母数字的是
      // Node.js / index.html / 网址一类的词内点，原样保留——此前无条件断句会把
      // 「config.json」切成「config」「json」两个半截泡（用户上报「词只说一半」来源之一）
      const nx = buffer[i + 1] ?? '';
      if (nx && !/[\s"'”』」）)\]】>》]/.test(nx)) { cur += ch; continue; }
      flush(); continue;
    }
    if (ch === '？' || ch === '！' || ch === '?' || ch === '!' || ch === '；' || ch === ';') {
      cur += ch; flush(); continue;
    }
    if (ch === '…') {
      // 半对省略号跨 chunk：末位单个 … 且非 final → 挂起等下一块
      if (i === buffer.length - 1 && !isFinal) return { bubbles, rest: cur + ch };
      cur += ch;
      if (buffer[i + 1] === '…') { cur += '…'; i++; }
      flush(); continue;
    }
    if (ch === '\n') { flush(); continue; }
    cur += ch;
  }
  if (isFinal) { flush(); return { bubbles, rest: '' }; }
  return { bubbles, rest: cur };
}

/** 流式钩子：每切出一泡回调一次；返回 false = 已被打断，停止生成 */
export interface ImmersiveStreamHooks {
  onSegment: (seg: string) => boolean;
  /**
   * sentence = 拟真增强（按标点切泡，流到哪说到哪）；paragraph = 普通模式（按空行切段，段写完就出——第 24 批 · D3，
   * 以前普通模式是整段写完再切，首字要等全文）。缺省 sentence
   */
  mode?: 'sentence' | 'paragraph';
}

/** 回合附加项（AI 助手第二批；第 24 批扩） */
export interface TurnExtras {
  /**
   * 只在对方没在倾诉 / 道别、精力不低时才放进上下文的行（自己的一天、可以顺口提的旧事、该问的约定）——
   * 由分诊判的姿态决定，所以只能交给本层在分诊之后拼。
   */
  casualContext?: string[];
  /** 回复定下来后回调整段文本和这一轮的姿态：store 侧据此记账「提没提」、约定要不要顺延 */
  afterReply?: (text: string, stance: Stance | null, energy: Energy | null, casualShown: boolean) => void;
  /** 收口窗口里预跑的分诊（第 24 批 · D2）：拿到就不再分诊一次；它失败 / 被取消就照常现跑 */
  pretriage?: Promise<TriageResult>;
  /** 天级数据块（最近几次聊天的摘要）：接在人格 + 规范后面，一天不变、吃前缀缓存 */
  dayLevel?: string;
  /** 动态块开头的行（「今天早些时候」的摘要：叙事顺序上它在历史之前，但放在尾部不打断缓存前缀） */
  leading?: string[];
  /** 动态块末尾的行（按日子回溯、「记忆里没有」、人设锚——锚一定放最后） */
  trailing?: string[];
  /** 当前人格 id（查询「最近聊过什么」要按人格取） */
  presetId?: string;
  /** 人格的认真模式那一句（第 25 批 · 沉下来）：对方很沉时用 */
  serious?: string;
  /** 相处方式行（督促型 / 陪伴型）：决定敢不敢主动提没做的事 */
  coachLine?: string;
}

/**
 * 模型偶尔会模仿历史标注、在回复开头自带一个 [HH:mm] 时间戳——那是给它看的注释，
 * 不是它该说的话，上屏前剥掉。
 */
const stripStamp = (s: string): string => s.replace(/^\[(?:昨天 |\d{1,2}月\d{1,2}日 )?\d{1,2}:\d{2}\]\s*/, '');

/** reply 文本 → 分段（空行切，≤6 段，去空；超出的不丢，并入末段） */
export function splitSegments(reply: string): string[] {
  const parts = reply
    .split(/\n{2,}/)
    .map((s) => stripStamp(s.trim()))
    .filter(Boolean);
  // 超过上限时不 slice 丢弃剩余——长回复被无声吃掉后半截，正是用户看到的
  // 「错误地省略语句」来源之一。改为末段合并保底。上限 4 → 6（第 13 轮：回复长短跟着用户走，长回复别硬挤成四泡）
  const segs = parts.length > 6 ? [...parts.slice(0, 5), parts.slice(5).join('\n')] : parts;
  return segs.length ? segs : [stripStamp(reply.trim())].filter(Boolean);
}

/**
 * 普通模式的流式切段（第 24 批 · D3）：按空行切，一段写完就出；最后一段等 isFinal。
 * 与 splitSegments 同一口径（去时间戳、去空），只是不设 6 段上限（流式没法提前合并）。
 */
export function spliceParagraphs(buffer: string, isFinal: boolean): { bubbles: string[]; rest: string } {
  const parts = buffer.split(/\n{2,}/);
  const rest = isFinal ? '' : (parts.pop() ?? '');
  const bubbles = parts.map((p) => stripStamp(p.trim())).filter(Boolean);
  return { bubbles, rest };
}

/**
 * 轻量硬兜底：明知无卡还声称开了卡 / 记下了 → 本地改口。
 * v2.7.0.6 收窄：原来的正则把「记下了」「安排上」这类日常说法也当成承诺，
 * 整段回复被换成「这张卡没能开出来」（实测闲聊 15 轮误伤 2 次）。
 * 现在只认明确说「开了卡 / 帮你记上了 / 加进清单了」的句子，问句和假设不算；
 * 而且只删掉出问题的那一句，其余照常说。
 */
const CLAIM_RE = /(开|建)(好)?了.{0,2}张?(卡|卡片)|卡片?.{0,2}(已经)?(开|建|写)好了|(已经|已)?(帮你|给你)(记|建|加|存)(下|上|好|进)了|加进了?(清单|待办|任务)/;
const REFER_RE = /已经在|还[晾挂躺放]|待确认|点.{0,3}[「"']?确认|先确认|上面那张|没确认/;
const HEDGE_RE = /[吗？?]|要不要|想不想|的话|如果|可以帮你|要我/;
/** 删掉「明知无卡仍声称开了卡」的句子；dropped = 删过。按句切（保留句末标点）；不用后行断言（iOS 16.4 以前的 WebKit 不认） */
export function dropFalseClaims(text: string): { text: string; dropped: boolean } {
  const sentences = text.match(/[^。！？!?\n]+[。！？!?\n]*|[。！？!?\n]+/g) ?? [text];
  const kept = sentences.filter((x) => !(CLAIM_RE.test(x) && !REFER_RE.test(x) && !HEDGE_RE.test(x)));
  if (kept.length === sentences.length) return { text, dropped: false };
  return { text: kept.join('').trim(), dropped: true };
}
/** 删空了才用的改口句（中性，不带任何人格的口吻） */
const NO_CARD_FALLBACK = '这一张没能开出来：把关键信息再说一遍，或者用下面的快捷项手动建一张。';

/** action 原始对象 → 校验收口后的 NavigatorDraft（非法则丢弃返回 undefined） */
function toDraft(a: Record<string, unknown> | null | undefined): NavigatorDraft | undefined {
  if (!a || typeof a !== 'object') return undefined;
  const kind = a.kind;
  if (kind === 'activity') {
    const text = String(a.text ?? '').trim();
    if (!text) return undefined;
    const rawPts = (a.points ?? {}) as Record<string, unknown>;
    const points = Object.fromEntries(
      ATTR_IDS.map((id) => [id, clampInt(rawPts[id], 0, 5, 0)]),
    ) as Record<AttributeId, number>;
    return { kind: 'activity', text, points, important: a.important === true };
  }
  if (kind === 'todo') {
    const title = String(a.title ?? '').trim();
    if (!title) return undefined;
    const attribute = ATTR_IDS.includes(a.attribute as AttributeId) ? (a.attribute as AttributeId) : 'guts';
    // 副奖励维度：合法属性且不与主属性重复才收，否则静默丢弃
    const extraAttribute = ATTR_IDS.includes(a.attribute2 as AttributeId) && a.attribute2 !== attribute
      ? (a.attribute2 as AttributeId)
      : null;
    return {
      kind: 'todo', title, attribute,
      points: clampInt(a.points, 1, 5, 2),
      extraAttribute,
      extraPoints: clampInt(a.points2, 1, 5, 1),
      repeatDaily: a.repeatDaily === true,
    };
  }
  if (kind === 'ledger') {
    // 模型偶尔把金额写成「¥23.5」「23.5元」「1,280」这类字符串（第 17 批）：以前 Number() 得 NaN，整张卡直接丢了。
    // 数字照用；字符串去掉千分位、全角句点当小数点，取里面第一个数
    const rawAmount = typeof a.amount === 'number'
      ? a.amount
      : Number((/\d+(?:\.\d+)?/.exec(String(a.amount ?? '').replace(/(\d)[,，](?=\d{3}\b)/g, '$1').replace(/[。．]/g, '.')) ?? [''])[0] || NaN);
    const amount = Math.round(rawAmount * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return undefined;
    const direction = a.direction === 'income' ? 'income' : 'expense';
    const type = CATEGORY_KEYS.includes(a.type as LedgerExpenseType) ? (a.type as LedgerExpenseType) : 'other';
    return {
      kind: 'ledger', direction, amount,
      note: String(a.note ?? '').trim().slice(0, 30),
      type,
      incomeType: a.incomeType === 'other' ? 'other' : 'labor',
      channel: String(a.channel ?? '').trim().slice(0, 12),
    };
  }
  if (kind === 'completeTodo') {
    const todoId = String(a.todoId ?? '');
    const s = useAppStore.getState();
    const todo = s.todos.find((t) => t.id === todoId);
    // id 必须真实存在且今日未完成，防幻觉
    if (!todo || s.getTodayTodoProgress(todoId).isComplete) return undefined;
    return { kind: 'completeTodo', todoId, todoTitle: todo.title };
  }
  if (kind === 'editTodo') {
    const todoId = String(a.todoId ?? '');
    const todo = useAppStore.getState().todos.find((t) => t.id === todoId && t.isActive && !t.archivedAt);
    // id 必须真实存在且还在清单里（防幻觉）；和好友的约定 / 组织作战的任务名和规则由那边定，不让助手改
    if (!todo || todo.pact || todo.orgOp) return undefined;
    const d: EditTodoDraft = { kind: 'editTodo', todoId, todoTitle: todo.title };
    if (a.archive === true) return { ...d, archive: true };
    const title = typeof a.title === 'string' ? a.title.trim().slice(0, 40) : '';
    if (title && title !== todo.title) d.title = title;
    if (ATTR_IDS.includes(a.attribute as AttributeId) && a.attribute !== todo.attribute) d.attribute = a.attribute as AttributeId;
    if (a.points !== undefined && a.points !== null) {
      const p = clampInt(a.points, 1, 5, todo.points);
      if (p !== todo.points) d.points = p;
    }
    if (typeof a.repeatDaily === 'boolean' && !todo.isBigDeal && a.repeatDaily !== !!todo.repeatDaily) d.repeatDaily = a.repeatDaily;
    if (typeof a.deadline === 'string') {
      const dl = a.deadline.trim();
      if (dl === '' ? !!todo.deadline : (/^\d{4}-\d{2}-\d{2}$/.test(dl) && dl !== todo.deadline)) d.deadline = dl;
    }
    // 每日重复与截止日互斥（「更多设置」同口径；大事没有每日）：改成每日就清截止，设了截止就回单次
    if (d.repeatDaily === true && (d.deadline || todo.deadline)) d.deadline = '';
    if (d.deadline && (d.repeatDaily ?? todo.repeatDaily)) d.repeatDaily = false;
    return editTodoChanges(d).length ? d : undefined;
  }
  return undefined;
}

/** 测试用：分诊 action → 卡片草稿（金额容错等） */
export const _toDraftForTest = toDraft;

// ── 阶段1 · 分诊 ──

export interface TriageResult {
  drafts: NavigatorDraft[];
  queryDays: number | null;
  /** 对方这句话的姿态 / 精力（v2.7.0.6：先接住再说事）；判不出来为 null */
  stance: Stance | null;
  energy: Energy | null;
  /** 带日子的个人安排 / 说了约定的结果（第 24 批 · D4）；分诊没给为 null */
  dated: boolean | null;
  /** 分量（第 25 批 · 沉下来）：heavy = 很绝望的话；分诊没给为 null（本地词表再兜一道） */
  gravity: 'normal' | 'heavy' | null;
  /** 只读查询（第 25 批 · G1）：最多 2 个 */
  queries: NavigatorQuery[];
  /** 模型原始输出（评测用） */
  raw?: string;
}

const STANCES: readonly Stance[] = ['vent', 'chat', 'ask', 'report', 'bye'];
const ENERGIES: readonly Energy[] = ['low', 'normal', 'high'];

/**
 * 分诊按「瞬发」调用（关思考、20 秒超时）。
 * 第 24 批评测（PRD §24.13，DeepSeek flash，115 题 × 3 遍）：思考开 / 关全对都 94%，关思考三遍全对 94% vs 91%、
 * p50 877 vs 1207ms、p95 1227 vs 2556ms、输出 token 少 73%——用户 10-18 拍板关掉。
 * 只对认 thinking 字段的官方 DeepSeek 真正关思考；别家按各自的瞬发口径（压 effort / 缩短超时）。
 */
export const TRIAGE_INSTANT = true;

/**
 * 历史窗口按 8 条一档收缩（第 4 轮）：以前每轮滑一条，发给模型的前缀每轮都不一样，
 * 服务商的前缀缓存一次都命不中。现在窗口在 25~32 条之间浮动、起点每 8 轮才挪一次。
 */
const HISTORY_MAX = 32;
const HISTORY_STEP = 8;
export function historyWindow<T>(items: T[]): T[] {
  if (items.length <= HISTORY_MAX) return items;
  const start = Math.ceil((items.length - HISTORY_MAX) / HISTORY_STEP) * HISTORY_STEP;
  return items.slice(start);
}

// ── 按轮截窗（第 24 批 · A1）──
// 以前按「气泡」截 32 条：一条回复是 1–6 个气泡（拟真模式更碎），实测 15 轮后模型只剩第 9–15 轮，开头说的事全忘。
// 现在先把气泡合成轮，按轮留最近 12–15 轮、起点每 4 轮挪一次（保前缀缓存），再按 6k token 兜一道。
/** 一轮 = 用户的一段话 + AI 的一段回复（各自可能是多个气泡）。新的一轮从「上一条是 AI、这一条是用户」处开始 */
export function turnsOf<T extends { role: 'cat' | 'user' }>(items: T[]): T[][] {
  const turns: T[][] = [];
  for (const it of items) {
    const cur = turns[turns.length - 1];
    if (!cur || (it.role === 'user' && cur[cur.length - 1].role === 'cat')) turns.push([it]);
    else cur.push(it);
  }
  return turns;
}
const TURNS_MAX = 12;
const TURNS_STEP = 4;
const TURNS_TOKEN_CAP = 6000;
/** 窗口从第几轮开始：留最近 12–15 轮，超 6k token 再按 4 轮一档往后退，最少留 4 轮 */
export function windowStartTurn(turns: Array<Array<{ text: string }>>): number {
  let start = turns.length <= TURNS_MAX ? 0 : Math.ceil((turns.length - TURNS_MAX) / TURNS_STEP) * TURNS_STEP;
  const tokens = (from: number) => turns.slice(from).reduce((n, t) => n + t.reduce((m, it) => m + estTokens(it.text) + 6, 0), 0);
  while (turns.length - start > 4 && tokens(start) > TURNS_TOKEN_CAP) start = Math.min(turns.length - 4, start + TURNS_STEP);
  return start;
}
export function historyWindowTurns(items: TurnHistoryItem[]): TurnHistoryItem[] {
  const turns = turnsOf(items);
  return turns.slice(windowStartTurn(turns)).flat();
}
/** 一轮里连续同角色的气泡合成一行（分诊的「最近对话」用） */
function turnLines(turn: TurnHistoryItem[], maxChars: number): string[] {
  const out: Array<{ role: 'cat' | 'user'; text: string }> = [];
  for (const it of turn) {
    const last = out[out.length - 1];
    if (last && last.role === it.role) last.text += ` ${it.text}`;
    else out.push({ role: it.role, text: it.text });
  }
  return out.map((h) => `${h.role === 'cat' ? 'AI' : '用户'}：${h.text.slice(0, maxChars)}`);
}

/** 空响应自愈的单次调用（DeepSeek json_object 空白 content 官方已知缺陷） */
async function callJson(
  cfg: NonNullable<ReturnType<typeof getAIConfig>>,
  messages: AIMessage[],
  opts: { temperature: number; maxTokens: number; signal: AbortSignal; instant?: boolean; purpose?: string },
): Promise<string> {
  try {
    return await chatComplete(cfg, messages, { ...opts, jsonMode: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes('空响应')) {
      return await chatComplete(cfg, messages, { ...opts, jsonMode: false });
    }
    throw e;
  }
}

async function triageActions(
  cfg: NonNullable<ReturnType<typeof getAIConfig>>,
  history: TurnHistoryItem[],
  userText: string,
  pendingCards: string[],
  signal: AbortSignal,
  instant: boolean = TRIAGE_INSTANT,
): Promise<TriageResult> {
  const s = useAppStore.getState();
  const due = s.getDueTodosToday().filter((t) => !s.getTodayTodoProgress(t.id).isComplete);
  // 只带最近 3 轮摘录（第 24 批：以前是最后 6 个气泡，常常 5 条都是 AI 自己的话、看不到用户上一句）：
  // 指代消解够用，且上下文永远短小——判定质量不随对话变长而劣化
  const recent = turnsOf(history).slice(-3).flatMap((t) => turnLines(t, 120)).join('\n');
  /**
   * 查重素材（用户上报「重复多提一句就重复生成卡片，也不看任务列表里已有什么」）：
   * 分诊此前只看得到「今日未完成待办」——排期在别天的任务、今天已记过的活动、
   * 已确认生效的卡，全在它视野外，于是同一件事聊两遍就开两张卡。
   * 这里把三样都喂进去（短清单，token 开销可忽略），配合协议里的查重规则。
   */
  const todayKey = toLocalDateKey();
  const openTodos = s.todos.filter((t) => t.isActive && !t.archivedAt);
  // 第 13 轮：带上 id 和现状（属性 / 点数 / 频率 / 截止），editTodo 才知道改的是哪条、改成什么算变化
  const todoLines = openTodos.slice(0, 15).map((t) =>
    `- id=${t.id} 「${t.title}」（${navAttrName(t.attribute)}+${t.points}${t.isBigDeal ? '·大事' : t.repeatDaily ? '·每日' : '·单次'}${t.deadline ? `·截止 ${t.deadline}` : ''}）`);
  if (openTodos.length > 15) todoLines.push(`- …等共 ${openTodos.length} 项`);
  const todayActs = s.activities
    .filter((a) => toLocalDateKey(new Date(a.date)) === todayKey)
    .slice(-10)
    .map((a) => `- ${a.description.slice(0, 40)}`);
  const weekdayCN = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
  const user = [
    `【今天】${todayKey}（周${weekdayCN}）`,
    recent ? `【最近对话】\n${recent}` : '',
    due.length ? `【今日未完成待办（completeTodo 用）】\n${due.slice(0, 12).map((t) => `- id=${t.id} 「${t.title}」`).join('\n')}` : '【今日无未完成待办】',
    todoLines.length ? `【任务清单已有（查重 / editTodo 用）】\n${todoLines.join('\n')}` : '',
    todayActs.length ? `【今天已记录的活动】\n${todayActs.join('\n')}` : '',
    pendingCards.length ? `【本会话卡片（含状态）】\n${pendingCards.join('\n')}` : '【本会话尚无卡片】',
    `【最新消息】${userText}`,
  ].filter(Boolean).join('\n');

  try {
    const raw = await callJson(cfg, [
      { role: 'system', content: TRIAGE_PROTOCOL },
      { role: 'user', content: user },
    ], { temperature: 0.1, maxTokens: 800, signal, instant, purpose: 'triage' });
    if (import.meta.env.DEV) console.debug('[navigator] 分诊输出:', raw);
    const parsed = extractJson(raw);
    if (!parsed) return { drafts: [], queryDays: null, stance: null, energy: null, dated: null, gravity: null, queries: [], raw };
    const rawActions = Array.isArray(parsed.actions) ? (parsed.actions as Array<Record<string, unknown>>) : [];
    const drafts = rawActions.slice(0, 3).map((a) => {
      const d = toDraft(a);
      if (!d && import.meta.env.DEV) console.warn('[navigator] 分诊 action 校验未通过被丢弃:', a);
      return d;
    }).filter((d): d is NavigatorDraft => !!d);
    // 查询表（第 25 批）：新字段 queries，兼容旧的单个 query
    const queries = parseQueries(parsed.queries, parsed.query);
    const queryDays = queries.find((q): q is Extract<NavigatorQuery, { kind: 'activities' }> => q.kind === 'activities')?.days ?? null;
    const stance = STANCES.includes(parsed.stance as Stance) ? parsed.stance as Stance : null;
    const energy = ENERGIES.includes(parsed.energy as Energy) ? parsed.energy as Energy : null;
    const dated = typeof parsed.dated === 'boolean' ? parsed.dated : null;
    const gravity = parsed.gravity === 'heavy' ? 'heavy' : parsed.gravity === 'normal' ? 'normal' : null;
    return { drafts, queryDays, stance, energy, dated, gravity, queries, raw };
  } catch (e) {
    // 分诊失败宁缺勿滥：不出卡、不查询，聊天照常（表演阶段知道"本轮没有开卡"，不会承诺）
    if (signal.aborted) throw e;
    if (import.meta.env.DEV) console.warn('[navigator] 分诊调用失败，本轮不出卡:', e);
    return { drafts: [], queryDays: null, stance: null, energy: null, dated: null, gravity: null, queries: [] };
  }
}

/** 分诊走哪一档：快速档；快速档没配（只在别家给了助手 Key）就用助手档 */
function triageConfig() {
  const settings = useAppStore.getState().settings;
  return getAIConfig(settings) ?? getAssistantAIConfig(settings);
}

/**
 * 收口窗口里预跑分诊（第 24 批 · D2）：用户发完一句，store 立刻开始算；收口时直接把这个 promise 交给
 * runNavigatorTurn（turnExtras.pretriage）。用户又发了一句 → 批次变了，store 取消它、重跑。
 */
export function startTriage(history: TurnHistoryItem[], userText: string, cards: string[], signal: AbortSignal): Promise<TriageResult> {
  const cfg = triageConfig();
  if (!cfg) return Promise.reject(new Error('未配置 AI'));
  return triageActions(cfg, history, userText, cards, signal);
}

/** 评测用（tests-local/evals）：直接跑一次分诊，可指定关 / 开思考 */
export function _triageForTest(history: TurnHistoryItem[], userText: string, cards: string[], opts: { instant?: boolean } = {}): Promise<TriageResult> {
  const cfg = triageConfig();
  if (!cfg) throw new Error('未配置 AI');
  return triageActions(cfg, history, userText, cards, new AbortController().signal, opts.instant ?? TRIAGE_INSTANT);
}

/** 卡片草稿 → 表演阶段可读的一行描述 */
function draftLine(d: NavigatorDraft): string {
  switch (d.kind) {
    case 'activity': {
      const pts = ATTR_IDS.filter((id) => d.points[id] > 0).map((id) => `${navAttrName(id)}+${d.points[id]}`).join(' ');
      return `- 记录活动「${d.text}」${pts ? `（${pts}）` : ''}`;
    }
    case 'todo':
      return `- 待办「${d.title}」（${navAttrName(d.attribute)}+${d.points}${d.extraAttribute ? ` ${navAttrName(d.extraAttribute)}+${d.extraPoints}` : ''}${d.repeatDaily ? '·每日' : ''}）`;
    case 'bigdeal':
      // 递刀产物（批5）：卡由客户端 chip 直出，不经分诊；此行仅供表演阶段知情
      return `- 大事「${d.title}」拆 ${d.steps.length} 步（${navAttrName(d.attribute)} 每步+${d.points}）`;
    case 'ledger':
      return `- ${d.direction === 'expense' ? '支出' : '收入'} ¥${d.amount}${d.note ? `（${d.note}）` : ''}`;
    case 'completeTodo':
      return `- 完成任务「${d.todoTitle}」`;
    case 'editTodo':
      return d.archive ? `- 不做了：「${d.todoTitle}」（移到归档）` : `- 修改任务「${d.todoTitle}」：${buildPreviewLines(d).slice(1).join('；')}`;
  }
}

// ── 回合执行 ──

/**
 * 执行一个对话回合（仲裁器 thinking 态调用；signal 可中断）。
 * 阶段1 分诊定卡 → （可选）本地查询 → 阶段2 带着结果表演。
 * 无 Key 由调用方兜底（不该走到这里）。
 */
export async function runNavigatorTurn(
  history: TurnHistoryItem[],
  userText: string,
  swallowed: string[],
  signal: AbortSignal,
  cards: string[] = [],
  personaPrompt: string = NEUTRAL_PERSONA,
  /** 记忆行 + 语气行等附加数据（store 侧检索/计算后传入，本层只负责注入） */
  extraContext: string[] = [],
  /** 拟真增强：传入即表演层走流式 + 标点切泡（分诊层不变——两阶段红利） */
  immersive?: ImmersiveStreamHooks,
  turnExtras: TurnExtras = {},
): Promise<NavigatorTurnResult> {
  const settings = useAppStore.getState().settings;
  const cfg = getAssistantAIConfig(settings);
  if (!cfg) throw new Error('未配置 AI');
  /**
   * 分诊走**快速响应档**（第 4 轮）：它是个短上下文的判定任务，不需要助手档那个（可能更贵更慢的）
   * 模型；助手档配成深思模型时，每轮先用它做一次非流式分诊，首字延迟直接翻倍。
   * 快速档没配（只在别家给了助手 Key）就还用助手档。
   */
  const triageCfg = getAIConfig(settings) ?? cfg;

  // 阶段1：分诊（含 query 判定）。卡片列表帮它判「帮我记一下」是否重复出卡。
  // 已取消的也要喂：只喂待确认时模型看不见用户否掉过什么，会把同一件事一遍遍重开
  //（用户上报「Agent 不知道我取消了卡片」）。
  // 【已确认生效】的同样要喂——此前以「属于历史」为由滤掉，结果同一件事在对话里
  // 被再次提起时，分诊根本不知道它已经记过，照常重开一张（用户上报「重复多提一句
  // 就重复生成卡片」的直接原因）。cardsDigest 本身截到最近 10 张，不会撑大上下文。
  let tri: TriageResult | null = null;
  if (turnExtras.pretriage) {
    // 收口窗口里预跑的那份（第 24 批 · D2）：拿到就用；失败 / 被取消就现跑一次
    try { tri = await turnExtras.pretriage; } catch { tri = null; }
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  }
  if (!tri) tri = await triageActions(triageCfg, history, userText, cards, signal);
  // 沉下来（第 25 批）：分诊判 heavy、或本地词表命中 → 不出卡、不查、不闲聊，换成陪着的那一套
  const heavy = tri.gravity === 'heavy' || isHeavyText(userText);
  const drafts = heavy ? [] : tri.drafts;
  const { stance, energy, dated } = tri;
  const queryBlocks = heavy || !tri.queries.length ? [] : await runQueries(tri.queries, turnExtras.presetId ?? 'builtin-cat');
  const proofs = heavy ? await proofsBlock() : '';

  // 阶段2：表演。判定结果作为事实注入——reply 与卡从机制上一致，无 JSON 无失守。
  const snap = buildSnapshot();
  // 倾诉 / 道别 / 精力低 / 沉：自己的一天、旧事、约定、近况这些「闲话」一律不放进来
  const casualShown = !heavy && stance !== 'vent' && stance !== 'bye' && energy !== 'low';
  const casual = casualShown ? (turnExtras.casualContext ?? []).filter(Boolean) : [];
  const turnFacts = (heavy
    ? [
        '【本轮没有开卡】',
        HEAVY_TURN_LINE,
        turnExtras.serious ? seriousLine(turnExtras.serious) : '',
        proofs,
        buildTopicPermission(stance, energy, true),
      ]
    : [
        drafts.length
          ? `【本轮你已开出的卡片（用户马上会看到确认卡）】\n${drafts.map(draftLine).join('\n')}`
          : '【本轮没有开卡】',
        ...queryBlocks,
        stanceLine(stance, energy),
        buildTopicPermission(stance, energy),
        turnExtras.coachLine ?? '',
      ]).filter(Boolean).join('\n');
  // 拼装（第 24 批）：［人格 + 规范 + 天级块］［按轮截的历史］［早些时候摘要 + 今日状态 + 素材 + 本轮卡片 + 姿态 + 回溯 + 人设锚］［最新一句］
  // 天级块一天不变、跟着人格一起吃前缀缓存；会变的全在尾部那条 system 里
  const messages: AIMessage[] = [
    { role: 'system', content: [personaOrNeutral(personaPrompt), PERFORM_RULES, turnExtras.dayLevel ?? ''].filter(Boolean).join('\n') },
    ...historyToMessages(historyWindowTurns(history)),
    {
      role: 'system',
      content: [...(turnExtras.leading ?? []), buildDynamicContext(snap, swallowed, cards), ...extraContext, ...casual, turnFacts, ...(turnExtras.trailing ?? [])]
        .filter(Boolean).join('\n'),
    },
    { role: 'user', content: userText },
  ];

  // ── 流式路径：边生成边切泡（吐泡与生成并行，总耗时不因逐泡节奏而变长）──
  // sentence（拟真）按标点切；paragraph（普通模式，第 24 批 · D3）按空行切段：以前普通模式整段写完再切，首字要等全文
  if (immersive) {
    const mode = immersive.mode ?? 'sentence';
    const splice = mode === 'paragraph' ? spliceParagraphs : spliceImmersive;
    const emitted: string[] = [];
    let buffer = '';
    let interrupted = false;
    let finishReason = '';
    // 模型偶尔以 JSON 开头（旧习惯残留）：普通模式整段收完再剥正文；null = 还没见到第一个非空白字
    let jsonHead: boolean | null = mode === 'paragraph' ? null : false;
    let jsonBuf = '';
    // 承诺守卫只在普通模式按段检查（拟真按句切，一句里看不出前后文；分诊先行定卡，嘴瓢概率本就极小）
    const guard = mode === 'paragraph' && drafts.length === 0;
    let droppedAny = false;
    const emit = (b: string): boolean => {
      let text = b;
      if (guard) {
        const g = dropFalseClaims(b);
        if (g.dropped) {
          droppedAny = true;
          if (import.meta.env.DEV) console.warn('[navigator] 表演阶段明知无卡仍声称开了卡，删掉那一句');
        }
        text = g.text;
        if (!text) return true;
      }
      emitted.push(text);
      return immersive.onSegment(text);
    };
    try {
      const streamOpts = {
        temperature: 0.75, maxTokens: 1200, signal, purpose: 'perform',
        onFinishReason: (r: string) => { finishReason = r; },
      };
      for await (const delta of chatStream(cfg, messages, streamOpts)) {
        if (jsonHead === null) {
          const probe = (jsonBuf + delta).trimStart();
          if (!probe) { jsonBuf += delta; continue; }
          jsonHead = probe.startsWith('{');
          if (jsonHead) { jsonBuf += delta; continue; }
          buffer = jsonBuf;
          jsonBuf = '';
        } else if (jsonHead) {
          jsonBuf += delta;
          continue;
        }
        buffer += delta;
        const { bubbles, rest } = splice(buffer, false);
        buffer = rest;
        for (const b of bubbles) {
          if (!emit(b)) { interrupted = true; break; }
        }
        if (interrupted) break;
      }
    } catch (e) {
      // 已吐出部分泡时的中途错误：不再抛（用户已看到半截回复），静默收尾
      if (emitted.length === 0) throw e;
      if (import.meta.env.DEV) console.warn('[navigator] 流中途异常，按已吐内容收尾', e);
    }
    if (!interrupted) {
      if (jsonHead) {
        const parsed = extractJson(jsonBuf);
        const inner = parsed && typeof parsed.reply === 'string' ? parsed.reply.trim() : jsonBuf.trim();
        for (const b of splitSegments(inner)) {
          if (!emit(b)) break;
        }
      } else {
        let { bubbles } = splice(buffer, true);
        // finish_reason=length：流式没法像非流式那样加预算重来（前面的泡都上屏了），
        // 但末尾这段一定是被拦腰砍断的半句/半个词——宁可整段不吐，也别让它上屏。
        if (finishReason === 'length' && bubbles.length > 0) {
          if (import.meta.env.DEV) console.warn('[navigator] 流被 max_tokens 截断，丢弃残句:', bubbles[bubbles.length - 1]);
          bubbles = bubbles.slice(0, -1);
        }
        for (const b of bubbles) {
          if (!emit(b)) break;
        }
      }
      if (emitted.length === 0) {
        const fb = guard && droppedAny ? NO_CARD_FALLBACK : drafts.length ? '卡片给你，看一眼没问题就确认。' : '嗯。';
        emitted.push(fb);
        immersive.onSegment(fb);
      }
    }
    if (import.meta.env.DEV) console.debug('[navigator] 流式输出:', emitted);
    noteTopicsMentioned(emitted.join('\n'));
    turnExtras.afterReply?.(emitted.join('\n'), stance, energy, casualShown && casual.length > 0);
    return { segments: emitted, drafts, sniffHint: heavy ? false : dated, heavy };
  }

  let reply = (await chatComplete(cfg, messages, { temperature: 0.75, maxTokens: 1200, signal, purpose: 'perform' })).trim();
  if (import.meta.env.DEV) console.debug('[navigator] 表演输出:', reply);

  // 万一它输出了 JSON 形态（旧习惯残留），剥出纯文本
  if (reply.startsWith('{')) {
    const parsed = extractJson(reply);
    const inner = parsed && typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    if (inner) reply = inner;
  }

  // 明知无卡还声称开了卡 / 记下了 → 删掉那一句（规则见 dropFalseClaims）；删空了才用改口句
  if (drafts.length === 0) {
    const g = dropFalseClaims(reply);
    if (g.dropped) {
      if (import.meta.env.DEV) console.warn('[navigator] 表演阶段明知无卡仍声称开了卡，删掉那一句');
      reply = g.text || NO_CARD_FALLBACK;
    }
  }

  if (!reply) reply = drafts.length ? '卡片给你，看一眼没问题就确认。' : '嗯。';
  noteTopicsMentioned(reply);
  turnExtras.afterReply?.(reply, stance, energy, casualShown && casual.length > 0);
  return { segments: splitSegments(reply), drafts, sniffHint: heavy ? false : dated, heavy };
}

/**
 * 人格生成器（Batch3，仅有 Key 可见）：偏好 → personaPrompt 文本。
 * 单任务短上下文（分诊范式），输出纯文本设定；预览可改后才保存。
 */
export async function generatePersonaPrompt(input: {
  name: string;
  callUser: string;
  toneWords: string[];
  coach: 'push' | 'accompany';
  freeText: string;
}): Promise<string> {
  const cfg = getAssistantAIConfig(useAppStore.getState().settings);
  if (!cfg) throw new Error('未配置 AI');
  const raw = await chatComplete(cfg, [
    {
      role: 'system',
      content:
        '你是人格设定师。为一款个人成长记录 App 里的陪伴型 AI 写一段第二人称人格设定（persona prompt）。' +
        '要求：以「你是「名字」——」开头；只写性格、口吻、称呼用户的方式、说话习惯，可含 1~2 句示例台词；' +
        '**不写任何功能、能力、输出格式相关内容**；140~240 字；具体鲜活，避免空泛形容词堆砌。只输出设定本身。',
    },
    {
      role: 'user',
      content: [
        `名字：${input.name}`,
        `称呼用户的方式：${input.callUser || '随人格自然决定'}`,
        input.toneWords.length ? `语气关键词：${input.toneWords.join('、')}` : '',
        `相处方式：${input.coach === 'push' ? '督促型（会盯进度、催行动）' : '陪伴型（多倾听、少施压）'}`,
        input.freeText ? `补充设定：${input.freeText}` : '',
      ].filter(Boolean).join('\n'),
    },
  ], { temperature: 0.9, maxTokens: 700, purpose: 'persona' });
  const text = raw.trim();
  if (!text) throw new Error('生成结果为空，换个说法再试试');
  return text.slice(0, 600);
}

/** 有 Key 时的 AI 每日问候（>timeout 由调用方落模板；失败返回 null） */
export async function generateAIGreeting(
  snap: NavigatorSnapshot,
  signal: AbortSignal,
  personaPrompt: string = NEUTRAL_PERSONA,
  /** 跨日叙事素材（昨日摘要/记忆/话头/语气行），store 侧准备 */
  extraContext: string[] = [],
): Promise<string | null> {
  const cfg = getAssistantAIConfig(useAppStore.getState().settings);
  if (!cfg) return null;
  try {
    /**
     * 走流式而不是一发拿全（问候回退模板偏多的主修复）：
     * 非流式 + 外部 9s 硬计时，对推理模型（DeepSeek 思考档常想 5~15s）意味着
     * 「必须 9s 内想完+写完」，超一点就整段作废落模板。改成流式后 timeoutMs 语义
     * 变为**空闲超时**——思维链增量也会重置计时（aiClient rearm），于是：
     * 连接死了 9s 没动静 → 照旧快速落模板；模型确实在想 → 等它想完，
     * 总时长由调用方 signal（30s 总闸）兜底。等待期间打字指示本来就在动，不亏。
     */
    const messages: AIMessage[] = [
      { role: 'system', content: `${personaOrNeutral(personaPrompt)}\n今天第一次见面，说一句自然的问候。像正常人刚见面：简短、贴合时段和对方状态，**不要刻意罗列数据**，不要问候语大礼包。只根据给定素材说话，对方没提过的经历不要脑补。若给了上次聊天的摘要或记忆，可自然接一句上次的话茬——按标注的日子说（几天前的事别说成昨天），别复读原文。可用空行分成最多 2 段。只输出问候本身。` },
      { role: 'user', content: [buildDynamicContext(snap, []), ...extraContext].filter(Boolean).join('\n') },
    ];
    let text = '';
    for await (const delta of chatStream(cfg, messages, { temperature: 0.9, maxTokens: 600, signal, timeoutMs: 9000, purpose: 'greet' })) {
      text += delta;
    }
    const trimmed = text.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}
