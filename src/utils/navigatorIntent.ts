/**
 * navigatorIntent — F6 黑猫对话层（Batch2）：JSON-intent 意图解析 + 回合执行。
 *
 * 技术路线（已定稿，见 F6_NAVIGATOR_MEMORY.md）：
 *   · 单次**非流式**调用返回严格 JSON { reply, action, query }——五家 provider 统一，
 *     分段吐泡的节奏由客户端仲裁器模拟（流式留作未来优化）。
 *   · action 映射到 navigatorRegistry 的 NavigatorDraft，走与菜单层完全相同的确认卡链路。
 *   · query（近 N 天记录）本地执行后注入再调一次（最多一跳，第二跳禁再查）。
 *   · 缓存友好组装：静态 system（persona+协议）做稳定前缀；动态块（快照/待办清单/吞话）
 *     以独立 system 消息下沉到最新用户消息之前——DeepSeek prefix cache 每轮命中。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
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
  /** 解析出的动作草稿（走确认卡），可空 */
  draft?: NavigatorDraft;
}

/** 历史消息的最小投影（store 侧转换后传入，避免循环依赖） */
export interface TurnHistoryItem {
  role: 'cat' | 'user';
  text: string;
}

// ── 内置默认人格（Batch3 presets 落地前的唯一人格） ──
const DEFAULT_PERSONA =
  '你是「黑猫」——寄居在这款个人成长记录 App 里的引路猫，偶尔自称「吾辈」。' +
  '性格：有点臭屁、爱下指导棋，说话带刺但都是真心话；嘴上嫌麻烦，实际把对方的事记得很牢；' +
  '深夜会催人睡觉。你陪伴的是唯一的用户，像老朋友一样说话，不用敬语。';

// ── 功能协议段（不可被人格覆盖；排在 persona 之后压轴） ──
const PROTOCOL = `
## 职责与边界
- 你只能通过下方「动作」替用户操作 App：记录活动 / 添加待办 / 记一笔账 / 完成今日任务。
- 其它操作请求（改设置、删数据、账号、导入导出）一律婉拒，说明自己管不到。
- 判定：用户描述**已经做了**某事→activity；**打算做**→todo；提到花钱/收入→ledger；
  说做完了某件今日待办→completeTodo（todoId 必须取自动态上下文的待办清单，没有匹配就不出动作）。
- 拿不准就先聊天确认，不要硬造动作。参数从用户话里提取；提取不到的给合理默认并在 reply 里说明。
- 动作会以「确认卡」形式出现，用户确认后才生效——reply 里不要说"已经记好了"，说"卡片给你，确认一下"这类。

## 输出格式（只输出一个 JSON 对象，不要代码块、不要多余文字）
{"reply":"给用户的话","action":null,"query":null}
- reply：像真人发消息。可用空行分成 1~4 段，每段 ≤60 字。禁止 markdown 标题/列表。
- action 四选一或 null：
  {"kind":"activity","text":"事项描述","points":{"knowledge":0,"guts":0,"dexterity":0,"kindness":0,"charm":0},"important":false}（points 每项 0~5）
  {"kind":"todo","title":"任务名","attribute":"knowledge|guts|dexterity|kindness|charm","points":2,"repeatDaily":false}
  {"kind":"ledger","direction":"expense|income","amount":0,"note":"摘要","type":"food|transport|shopping|fun|home|study|other","incomeType":"labor|other","channel":""}
  {"kind":"completeTodo","todoId":"清单里的 id","todoTitle":"任务名"}
- query：需要更早的历史记录才回答时用 {"kind":"activities","days":1~30}，我会把结果发回给你再答。
  动态上下文已给今日状态，今日的事不用 query。

## 引用数据
动态上下文里的状态与记录，化进话里自然地说，不要像念报表；没有的信息不要编造。`;

const SECOND_PASS_NOTE =
  '（这是你刚才 query 的查询结果。现在直接给出最终 reply，本轮禁止再输出 query。）';

// ── 组装 ──

const buildStaticSystem = (): string => `${DEFAULT_PERSONA}\n${PROTOCOL}`;

/** 动态上下文块：只含数据不含指令，贴在最新用户消息之前（缓存友好） */
export function buildDynamicContext(snap: NavigatorSnapshot, swallowed: string[]): string {
  const s = useAppStore.getState();
  const due = s.getDueTodosToday().filter((t) => !s.getTodayTodoProgress(t.id).isComplete);
  const lines = [
    `【今日状态 ${snap.dateKey}】`,
    `用户：${snap.userName}；当前 ${snap.hour} 点`,
    `今日任务 ${snap.todosDone}/${snap.todosTotal}；今日已记 ${snap.activityCountToday} 条活动`,
    snap.tarotDrawn ? `今日塔罗已抽：「${snap.tarotCardName ?? '?'}」` : '今日塔罗未抽',
    snap.terminalStepTitle ? `进行中的终端小步：「${snap.terminalStepTitle}」` : '',
    due.length
      ? `【今日未完成待办（completeTodo 只能用这些 id）】\n${due.slice(0, 12).map((t) => `- id=${t.id} 「${t.title}」(${navAttrName(t.attribute)}+${t.points})`).join('\n')}`
      : '【今日无未完成待办】',
    swallowed.length
      ? `【你上一条回复被用户打断，没说出口的是】${swallowed.join(' / ')}（若仍相关可自然续上，不相关就放弃，不要复读原文）`
      : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/** 历史转 AIMessage：连续同角色合并（部分兼容端点拒绝连续同角色） */
function historyToMessages(history: TurnHistoryItem[]): AIMessage[] {
  const out: AIMessage[] = [];
  for (const h of history) {
    const role = h.role === 'cat' ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n${h.text}`;
    else out.push({ role, content: h.text });
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

// ── 回合执行 ──

/**
 * 执行一个对话回合（仲裁器 thinking 态调用；signal 可中断）。
 * 无 Key 由调用方兜底（不该走到这里）。
 */
export async function runNavigatorTurn(
  history: TurnHistoryItem[],
  userText: string,
  swallowed: string[],
  signal: AbortSignal,
): Promise<NavigatorTurnResult> {
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (!cfg) throw new Error('未配置 AI');
  const snap = buildSnapshot();
  const base: AIMessage[] = [
    { role: 'system', content: buildStaticSystem() },
    ...historyToMessages(history).slice(-24),
    { role: 'system', content: buildDynamicContext(snap, swallowed) },
    { role: 'user', content: userText },
  ];

  const callOnce = async (messages: AIMessage[]): Promise<Record<string, unknown> | null> => {
    const raw = await chatComplete(cfg, messages, { temperature: 0.6, maxTokens: 700, signal });
    return extractJson(raw);
  };

  let parsed = await callOnce(base);

  // query 链（最多一跳）：本地执行 → 结果注入 → 再调一次
  const q = parsed?.query as Record<string, unknown> | null | undefined;
  if (q && q.kind === 'activities') {
    const result = runActivitiesQuery(clampInt(q.days, 1, 30, 7));
    parsed = await callOnce([
      ...base,
      { role: 'assistant', content: JSON.stringify({ reply: '', action: null, query: q }) },
      { role: 'system', content: `${result}\n${SECOND_PASS_NOTE}` },
    ]) ?? parsed;
  }

  if (!parsed) {
    return { segments: ['唔……刚才走神了，没听清。再说一遍？'] };
  }
  const reply = String(parsed.reply ?? '').trim();
  const draft = toDraft(parsed.action as Record<string, unknown> | null);
  const segments = splitSegments(reply || (draft ? '卡片给你，看一眼没问题就确认。' : '嗯。'));
  return { segments, draft };
}

/** 有 Key 时的 AI 每日问候（>timeout 由调用方落模板；失败返回 null） */
export async function generateAIGreeting(
  snap: NavigatorSnapshot,
  signal: AbortSignal,
): Promise<string | null> {
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (!cfg) return null;
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: `${DEFAULT_PERSONA}\n今天第一次见面，说一句自然的问候。像正常人刚见面：简短、贴合时段和对方状态，**不要刻意罗列数据**，不要问候语大礼包。可用空行分成最多 2 段。只输出问候本身。` },
      { role: 'user', content: buildDynamicContext(snap, []) },
    ], { temperature: 0.9, maxTokens: 160, signal, timeoutMs: 0 });
    const text = raw.trim();
    return text ? text : null;
  } catch {
    return null;
  }
}
