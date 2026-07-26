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
import { chatComplete, chatStream, getAIConfig, getNavigatorAIConfig } from '@/utils/aiClient';
import { CATEGORY_KEYS } from '@/utils/ledgerFormat';
import {
  ATTR_IDS, buildSnapshot, navAttrName,
  type NavigatorDraft, type NavigatorSnapshot,
} from '@/utils/navigatorRegistry';
import type { AIMessage } from '@/utils/aiClient';
import type { AttributeId, LedgerExpenseType } from '@/types';

export interface NavigatorTurnResult {
  /** 聊天回复分段（空行切分，1~4 段） */
  segments: string[];
  /** 解析出的动作草稿（每个一张确认卡；一句话说了几件事就出几张） */
  drafts: NavigatorDraft[];
}

/** 历史消息的最小投影（store 侧转换后传入，避免循环依赖） */
export interface TurnHistoryItem {
  role: 'cat' | 'user';
  text: string;
  /** 消息时间：隔 >5 分钟的消息会带 [HH:mm] 标注进上下文，给模型对话时距感 */
  createdAt?: number;
}

// ── 内置默认人格（Batch3 presets 落地前的唯一人格） ──
const DEFAULT_PERSONA =
  '你是「黑猫」——寄居在这款个人成长记录 App 里的引路猫，偶尔自称「吾辈」。' +
  '性格：有点臭屁、爱下指导棋，说话带刺但都是真心话；嘴上嫌麻烦，实际把对方的事记得很牢；' +
  '深夜会催你睡觉。你陪伴的是唯一的用户，像老朋友一样说话，不用敬语。';

// ── 阶段1 · 分诊协议（无人格，纯判定；短上下文 + 低温 = 高服从） ──
const TRIAGE_PROTOCOL = `你是记录意图判定器。根据对话摘录和最新消息，判定本轮要创建的卡片（0~3 张）与是否需要查历史。
只输出这一个 JSON 对象（不要代码块、不要任何其它文字）：
{"actions":[],"query":null}

actions 元素为下列四种之一：
{"kind":"activity","text":"事项描述","points":{"knowledge":0,"guts":0,"dexterity":0,"kindness":0,"charm":0},"important":false}（用户**已经做了**的事；points 每项 0~5）
{"kind":"todo","title":"任务名","attribute":"knowledge|guts|dexterity|kindness|charm","points":2,"repeatDaily":false}（用户**打算做/要提醒**的事）
{"kind":"ledger","direction":"expense|income","amount":0,"note":"摘要","type":"food|transport|shopping|fun|home|study|other","incomeType":"labor|other","channel":""}（花钱/收入）
{"kind":"completeTodo","todoId":"待办清单里的 id","todoTitle":"任务名"}（用户说做完了某件今日待办；todoId 必须取自清单，没有匹配就不出）

规则：
- **只响应【最新消息】里的记录意图**：用户此刻在报告做了什么/要做什么/花了钱/求记录，才出卡。
  闲聊、提问（问时间/问状态/问建议）一律空 actions——即使早前对话提过某件可记的事，最新消息没让你记就不要主动出卡。
- 「帮我记一下/记上/安排一下」指的是最近对话里提到、且【本会话卡片】里还没有的那件事；若那件事已有待确认卡，输出空 actions。
- 【本会话卡片】里标【已取消】的，是用户主动否掉的：**不要再为同一件事出卡**，除非最新消息里他重新要求。
- 标「用户已手改」的卡，内容以列出的为准（那是用户改后的版本），不要出一张把它改回去的卡。
- 一句话说了几件事就出几张卡（≤3）。信息足够就出卡；确实拿不准或信息不足才空。
- 修改一张待确认卡 = 出一张修正后的新卡。
- 需要今天之前的历史记录才能回答时：{"kind":"activities","days":1~30} 填入 query。
- 其它一律 {"actions":[],"query":null}。

示例：
输入末句：今天跑了五公里 → {"actions":[{"kind":"activity","text":"跑步五公里","points":{"knowledge":0,"guts":2,"dexterity":1,"kindness":0,"charm":0},"important":false}],"query":null}
输入末句：提醒我周五给妈妈打电话 → {"actions":[{"kind":"todo","title":"周五给妈妈打电话","attribute":"kindness","points":2,"repeatDaily":false}],"query":null}
对话提到想学英语、无相关待确认卡，末句：帮我记一下 → {"actions":[{"kind":"todo","title":"学英语","attribute":"knowledge","points":2,"repeatDaily":true}],"query":null}
待确认卡已有「学英语」，末句：帮我记一下 → {"actions":[],"query":null}
输入末句：今天好累啊 → {"actions":[],"query":null}
对话早前提过想背单词，末句：现在几点了？ → {"actions":[],"query":null}
输入末句：我上周都做了什么？ → {"actions":[],"query":{"kind":"activities","days":7}}`;

// ── 阶段2 · 表演规范（人格侧；输出纯文本，无任何格式负担） ──
const PERFORM_RULES = `
## 说话方式
- 直接输出你要对用户说的话（纯文本）。可用空行分成 1~4 段，每段 ≤60 字。禁止 markdown 标题/列表/代码块。
- 动态数据化进话里自然地说，不要像念报表；【】是系统数据区标签，不要把标签名念出来。
- 【关于用户的记忆】是你们过往相处攒下的：像老朋友那样自然带出，不要背档案（"记得你说过…"胜过复读原文）；
  带【可自然追问】的话头，合适时顺口问一句，不合适就跳过，同一话头绝不反复问。
- 【当前语气】是你此刻的状态基调，服从它。
- 数值纪律：属性点数/等级只能引用给定数字；没给的数值说记不清或建议去对应页面看，禁止编造。
- **等级不出口**：【属性面板】的 Lv 只供你判断深浅，正常说话里不要把等级/点数报出来。
  ✗「你现在有 Lv.3 的勇气，可以去做」 ✓「你这阵子胆子练出来了，试试吧」
  ✗「你的知识 Lv.2」 ✓「这方面你还在入门，慢慢来」
  只有用户明确问「我现在几级 / 多少点」时才直接报数字。

## 卡片纪律（最高优先级）
- 【本轮开出的卡片】列了什么，你就只能提这些卡：请用户看一眼并点「确认」。卡片会自动展示，**绝不在文本里手写卡片内容或画卡**。
- 【本轮没有开卡】时，绝不声称已记录/已安排/开了卡。用户若在要求记录：坦率说缺什么信息，或请他用下方快捷项手动建。
- 已有卡片的真实状态只看【本会话卡片实录】：待用户确认=还没生效；已确认生效；已取消。引导确认时就说「点一下确认」。
- 实录里标了【已取消】的，用户就是不想要：别追问为什么、别重开同一张，除非他再提一次。
- 标了「用户已手改」的，卡里现在是**他改后的版本**（实录给的就是新内容）：照新内容说话，
  别再复述你原来提议的那版；可以轻轻认一句（"按你改的记"），不用反复确认。

## 边界
- 你只能通过卡片替用户操作 App；改设置、删数据、账号、导入导出等请求一律婉拒，说明自己管不到。`;

// ── 组装 ──

/** 动态上下文块：只含数据不含指令，贴在最新用户消息之前（缓存友好） */
export function buildDynamicContext(snap: NavigatorSnapshot, swallowed: string[], cards: string[] = []): string {
  const s = useAppStore.getState();
  const due = s.getDueTodosToday().filter((t) => !s.getTodayTodoProgress(t.id).isComplete);
  const attrs = s.attributes
    .map((a) => `${s.settings.attributeNames?.[a.id] ?? a.displayName} Lv.${a.level}（${a.points} 点）`)
    .join('；');
  const now = new Date();
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const lines = [
    `【今日状态 ${snap.dateKey}】`,
    `用户：${snap.userName}；现在是 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}，周${weekday}（历史消息前的 [HH:mm] 是其发生时刻；回答时间一律以本行为准）`,
    attrs ? `【属性面板】${attrs}` : '',
    `今日任务 ${snap.todosDone}/${snap.todosTotal}；今日已记 ${snap.activityCountToday} 条活动`,
    snap.tarotDrawn ? `今日塔罗已抽：「${snap.tarotCardName ?? '?'}」` : '今日塔罗未抽',
    snap.terminalStepTitle ? `进行中的终端小步：「${snap.terminalStepTitle}」` : '',
    due.length
      ? `【今日未完成待办】\n${due.slice(0, 12).map((t) => `- 「${t.title}」(${navAttrName(t.attribute)}+${t.points})`).join('\n')}`
      : '【今日无未完成待办】',
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
const stampOf = (ts: number): string => {
  const d = new Date(ts);
  return `[${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}]`;
};

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

/**
 * 拟真切泡引擎（体验优化⑤，2026-07-04 二调）：扫描流式 buffer，切出可即时发出的气泡。
 * 规则（用户定稿）：句号 → 删标点断泡；**逗号/顿号保留不断**；问号/感叹号/分号/省略号 →
 * 保留断泡；「——」双破折号 → 删除并断泡；左括号前断（括号内容独立成泡）、右括号后断保留；换行亦断。
 * 返回 rest 保存跨 chunk 的半句（半个省略号/破折号/小数点歧义），isFinal 时全量清空。
 */
export function spliceImmersive(buffer: string, isFinal: boolean): { bubbles: string[]; rest: string } {
  const bubbles: string[] = [];
  let cur = '';
  const flush = () => { const t = cur.trim(); if (t) bubbles.push(t); cur = ''; };
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
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
    if (ch === '（' || ch === '(') { flush(); cur = ch; continue; }
    if (ch === '）' || ch === ')') { cur += ch; flush(); continue; }
    if (ch === '\n') { flush(); continue; }
    cur += ch;
  }
  if (isFinal) { flush(); return { bubbles, rest: '' }; }
  return { bubbles, rest: cur };
}

/** 拟真流式钩子：每切出一泡回调一次；返回 false = 已被打断，停止生成 */
export interface ImmersiveStreamHooks {
  onSegment: (seg: string) => boolean;
}

/** reply 文本 → 分段（空行切，≤4 段，去空） */
export function splitSegments(reply: string): string[] {
  const segs = reply
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  return segs.length ? segs : [reply.trim()].filter(Boolean);
}

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
    return { kind: 'todo', title, attribute, points: clampInt(a.points, 1, 5, 2), repeatDaily: a.repeatDaily === true };
  }
  if (kind === 'ledger') {
    const amount = Math.round(Number(a.amount) * 100) / 100;
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
  return undefined;
}

// ── 查询执行（v1：近 N 天活动记录） ──

function runActivitiesQuery(days: number): string {
  const s = useAppStore.getState();
  const since = Date.now() - Math.min(30, Math.max(1, days)) * 86400_000;
  const rows = s.activities
    .filter((a) => new Date(a.date).getTime() >= since)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 40)
    .map((a) => {
      const pts = Object.entries(a.pointsAwarded ?? {})
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${navAttrName(k as AttributeId)}+${v}`)
        .join(' ');
      return `${toLocalDateKey(new Date(a.date))} ${a.description}${pts ? `（${pts}）` : ''}`;
    });
  const text = rows.join('\n').slice(0, 1600);
  return rows.length ? `【近 ${days} 天活动记录，共 ${rows.length} 条】\n${text}` : `【近 ${days} 天没有活动记录】`;
}

// ── 阶段1 · 分诊 ──

interface TriageResult {
  drafts: NavigatorDraft[];
  queryDays: number | null;
}

/** 空响应自愈的单次调用（DeepSeek json_object 空白 content 官方已知缺陷） */
async function callJson(
  cfg: NonNullable<ReturnType<typeof getAIConfig>>,
  messages: AIMessage[],
  opts: { temperature: number; maxTokens: number; signal: AbortSignal },
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
): Promise<TriageResult> {
  const s = useAppStore.getState();
  const due = s.getDueTodosToday().filter((t) => !s.getTodayTodoProgress(t.id).isComplete);
  // 只带最近 6 条摘录：指代消解够用，且上下文永远短小——判定质量不随对话变长而劣化
  const recent = history.slice(-6).map((h) => `${h.role === 'cat' ? 'AI' : '用户'}：${h.text.slice(0, 80)}`).join('\n');
  const user = [
    recent ? `【最近对话】\n${recent}` : '',
    due.length ? `【今日未完成待办（completeTodo 用）】\n${due.slice(0, 12).map((t) => `- id=${t.id} 「${t.title}」`).join('\n')}` : '【今日无未完成待办】',
    pendingCards.length ? `【本会话卡片（含状态）】\n${pendingCards.join('\n')}` : '【本会话尚无卡片】',
    `【最新消息】${userText}`,
  ].filter(Boolean).join('\n');

  try {
    const raw = await callJson(cfg, [
      { role: 'system', content: TRIAGE_PROTOCOL },
      { role: 'user', content: user },
    ], { temperature: 0.1, maxTokens: 800, signal });
    if (import.meta.env.DEV) console.debug('[navigator] 分诊输出:', raw);
    const parsed = extractJson(raw);
    if (!parsed) return { drafts: [], queryDays: null };
    const rawActions = Array.isArray(parsed.actions) ? (parsed.actions as Array<Record<string, unknown>>) : [];
    const drafts = rawActions.slice(0, 3).map((a) => {
      const d = toDraft(a);
      if (!d && import.meta.env.DEV) console.warn('[navigator] 分诊 action 校验未通过被丢弃:', a);
      return d;
    }).filter((d): d is NavigatorDraft => !!d);
    const q = parsed.query as Record<string, unknown> | null | undefined;
    const queryDays = q && q.kind === 'activities' ? clampInt(q.days, 1, 30, 7) : null;
    return { drafts, queryDays };
  } catch (e) {
    // 分诊失败宁缺勿滥：不出卡、不查询，聊天照常（表演阶段知道"本轮没有开卡"，不会承诺）
    if (signal.aborted) throw e;
    if (import.meta.env.DEV) console.warn('[navigator] 分诊调用失败，本轮不出卡:', e);
    return { drafts: [], queryDays: null };
  }
}

/** 卡片草稿 → 表演阶段可读的一行描述 */
function draftLine(d: NavigatorDraft): string {
  switch (d.kind) {
    case 'activity': {
      const pts = ATTR_IDS.filter((id) => d.points[id] > 0).map((id) => `${navAttrName(id)}+${d.points[id]}`).join(' ');
      return `- 记录活动「${d.text}」${pts ? `（${pts}）` : ''}`;
    }
    case 'todo':
      return `- 待办「${d.title}」（${navAttrName(d.attribute)}+${d.points}${d.repeatDaily ? '·每日' : ''}）`;
    case 'ledger':
      return `- ${d.direction === 'expense' ? '支出' : '收入'} ¥${d.amount}${d.note ? `（${d.note}）` : ''}`;
    case 'completeTodo':
      return `- 完成任务「${d.todoTitle}」`;
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
  personaPrompt: string = DEFAULT_PERSONA,
  /** 记忆行 + 语气行等附加数据（store 侧检索/计算后传入，本层只负责注入） */
  extraContext: string[] = [],
  /** 拟真增强：传入即表演层走流式 + 标点切泡（分诊层不变——两阶段红利） */
  immersive?: ImmersiveStreamHooks,
): Promise<NavigatorTurnResult> {
  const cfg = getNavigatorAIConfig(useAppStore.getState().settings);
  if (!cfg) throw new Error('未配置 AI');

  // 阶段1：分诊（含 query 判定）。卡片列表帮它判「帮我记一下」是否重复出卡。
  // 已取消的也要喂：只喂待确认时模型看不见用户否掉过什么，会把同一件事一遍遍重开
  //（用户上报「Agent 不知道我取消了卡片」）。已生效的不喂——那属于历史，不影响本轮判定。
  const pendingCards = cards.filter((c) => c.includes('待用户确认') || c.includes('已取消'));
  const { drafts, queryDays } = await triageActions(cfg, history, userText, pendingCards, signal);
  const queryResult = queryDays !== null ? runActivitiesQuery(queryDays) : null;

  // 阶段2：表演。判定结果作为事实注入——reply 与卡从机制上一致，无 JSON 无失守。
  const snap = buildSnapshot();
  const turnFacts = [
    drafts.length
      ? `【本轮你已开出的卡片（用户马上会看到确认卡）】\n${drafts.map(draftLine).join('\n')}`
      : '【本轮没有开卡】',
    queryResult ?? '',
  ].filter(Boolean).join('\n');
  const messages: AIMessage[] = [
    { role: 'system', content: `${personaPrompt}\n${PERFORM_RULES}` },
    ...historyToMessages(history).slice(-24),
    { role: 'system', content: [buildDynamicContext(snap, swallowed, cards), ...extraContext, turnFacts].filter(Boolean).join('\n') },
    { role: 'user', content: userText },
  ];

  // ── 拟真流式路径：边生成边切泡（吐泡与生成并行，总耗时不因逐泡节奏而变长） ──
  if (immersive) {
    const emitted: string[] = [];
    let buffer = '';
    let interrupted = false;
    try {
      for await (const delta of chatStream(cfg, messages, { temperature: 0.75, maxTokens: 900, signal })) {
        buffer += delta;
        const { bubbles, rest } = spliceImmersive(buffer, false);
        buffer = rest;
        for (const b of bubbles) {
          emitted.push(b);
          if (!immersive.onSegment(b)) { interrupted = true; break; }
        }
        if (interrupted) break;
      }
    } catch (e) {
      // 已吐出部分泡时的中途错误：不再抛（用户已看到半截回复），静默收尾
      if (emitted.length === 0) throw e;
      if (import.meta.env.DEV) console.warn('[navigator] 拟真流中途异常，按已吐内容收尾', e);
    }
    if (!interrupted) {
      const { bubbles } = spliceImmersive(buffer, true);
      for (const b of bubbles) {
        emitted.push(b);
        if (!immersive.onSegment(b)) break;
      }
    }
    if (import.meta.env.DEV) console.debug('[navigator] 拟真流式输出:', emitted);
    // 流式已实时呈现，无法撤回——承诺守卫在此路径降级为观测（分诊先行定卡，嘴瓢概率极小）
    return { segments: emitted, drafts };
  }

  let reply = (await chatComplete(cfg, messages, { temperature: 0.75, maxTokens: 900, signal })).trim();
  if (import.meta.env.DEV) console.debug('[navigator] 表演输出:', reply);

  // 万一它输出了 JSON 形态（旧习惯残留），剥出纯文本
  if (reply.startsWith('{')) {
    const parsed = extractJson(reply);
    const inner = parsed && typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    if (inner) reply = inner;
  }

  // 轻量硬兜底：明知无卡还嘴瓢承诺（概率已极小）→ 本地改口，不再补救跳
  const PROMISE_RE = /卡片?(给你|安排|开|挂|写|办)|安排上了?|记[下上]了|给你记|记一笔|挂上去|开[张好]|建好了|帮你.{0,3}[张开]|加进(清单|待办)/;
  const REFER_RE = /已经在|还[晾挂躺放]|待确认|点.{0,3}[「"']?确认|先确认|上面那张|没确认/;
  if (drafts.length === 0 && PROMISE_RE.test(reply) && !REFER_RE.test(reply)) {
    if (import.meta.env.DEV) console.warn('[navigator] 表演阶段明知无卡仍承诺，本地改口');
    reply = '这张卡吾辈没能开出来——你把关键信息再说一遍，或者用下面的快捷项手动建一张，我盯着。';
  }

  if (!reply) reply = drafts.length ? '卡片给你，看一眼没问题就确认。' : '嗯。';
  return { segments: splitSegments(reply), drafts };
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
  const cfg = getNavigatorAIConfig(useAppStore.getState().settings);
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
  ], { temperature: 0.9, maxTokens: 700 });
  const text = raw.trim();
  if (!text) throw new Error('生成结果为空，换个说法再试试');
  return text.slice(0, 600);
}

/** 有 Key 时的 AI 每日问候（>timeout 由调用方落模板；失败返回 null） */
export async function generateAIGreeting(
  snap: NavigatorSnapshot,
  signal: AbortSignal,
  personaPrompt: string = DEFAULT_PERSONA,
  /** 跨日叙事素材（昨日摘要/记忆/话头/语气行），store 侧准备 */
  extraContext: string[] = [],
): Promise<string | null> {
  const cfg = getNavigatorAIConfig(useAppStore.getState().settings);
  if (!cfg) return null;
  try {
    // 推理模型的 reasoning 也占 completion 预算，问候虽短也要给足（否则必截断→永远落模板）
    const raw = await chatComplete(cfg, [
      { role: 'system', content: `${personaPrompt}\n今天第一次见面，说一句自然的问候。像正常人刚见面：简短、贴合时段和对方状态，**不要刻意罗列数据**，不要问候语大礼包。若给了昨日聊天摘要或记忆，可自然接一句昨天的话茬（别复读原文）。可用空行分成最多 2 段。只输出问候本身。` },
      { role: 'user', content: [buildDynamicContext(snap, []), ...extraContext].filter(Boolean).join('\n') },
    ], { temperature: 0.9, maxTokens: 600, signal, timeoutMs: 0 });
    const text = raw.trim();
    return text ? text : null;
  } catch {
    return null;
  }
}
