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
  /** 解析出的动作草稿（每个一张确认卡；一句话说了几件事就出几张） */
  drafts: NavigatorDraft[];
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
{"reply":"给用户的话","actions":[],"query":null}
- reply：像真人发消息。可用空行分成 1~4 段，每段 ≤60 字。禁止 markdown 标题/列表。
- actions：本轮要提议的动作数组（0~3 个；用户一句话说了几件事就出几张卡）。每个元素为下列四种之一：
  {"kind":"activity","text":"事项描述","points":{"knowledge":0,"guts":0,"dexterity":0,"kindness":0,"charm":0},"important":false}（points 每项 0~5）
  {"kind":"todo","title":"任务名","attribute":"knowledge|guts|dexterity|kindness|charm","points":2,"repeatDaily":false}
  {"kind":"ledger","direction":"expense|income","amount":0,"note":"摘要","type":"food|transport|shopping|fun|home|study|other","incomeType":"labor|other","channel":""}
  {"kind":"completeTodo","todoId":"清单里的 id","todoTitle":"任务名"}
- query：需要更早的历史记录才回答时用 {"kind":"activities","days":1~30}，我会把结果发回给你再答。
  动态上下文已给今日状态，今日的事不用 query。
- **任何情况下输出都必须是且只是这个 JSON 对象**：想说的话全部放进 reply 字段，绝不把文字写在 JSON 之外。

## 示例（严格模仿输出形态）
用户：今天跑了五公里
输出：{"reply":"哦？主动跑步，太阳打西边出来了。卡片给你，确认下。","actions":[{"kind":"activity","text":"跑步五公里","points":{"knowledge":0,"guts":2,"dexterity":1,"kindness":0,"charm":0},"important":false}],"query":null}
用户：（已有一张待确认的「学习」待办卡）改成每天学英语吧
输出：{"reply":"行，换成每日的英语卡。旧的那张记得点取消。","actions":[{"kind":"todo","title":"学英语","attribute":"knowledge","points":2,"repeatDaily":true}],"query":null}
用户：今天好累啊
输出：{"reply":"累就瘫一会儿，没人催你。\n\n想记点什么再叫我。","actions":[],"query":null}

## reply 与 actions 必须一致（防幻觉，最高优先级）
- 只有本轮 actions 数组里真的放了动作，reply 才可以说「卡片给你/安排上了/记下了」。
- actions 为空时，绝不声称已创建/已记录任何东西——要么把缺的信息问清，要么直说这轮没出卡。
- 信息已经够出卡时就直接出卡，不要只在嘴上答应「稍后记」。
- 出卡的唯一途径是 actions 字段。**绝不在 reply 文本里手写卡片样式**（如「[卡片·…]」或框线画卡）——那不会生效，只会骗到用户。
- 卡片的真实状态只看【本会话卡片实录】：待用户确认=还没生效、已确认生效、已取消。用户想改一张待确认的卡时，在 actions 里出一张修正后的新卡，并在 reply 里让用户取消旧卡。
- 数值纪律：属性点数/等级只能引用动态上下文给出的数字；没给的数值一律说记不清或建议去对应页面看，禁止编造。
- 【】标记是系统数据区的标签，说话时不要把这些标签名念出来（不要说"属性面板显示"，直接说数字）。

## 引用数据
动态上下文里的状态与记录，化进话里自然地说，不要像念报表；没有的信息不要编造。`;

const SECOND_PASS_NOTE =
  '（这是你刚才 query 的查询结果。现在直接给出最终 reply，本轮禁止再输出 query。）';

// ── 组装 ──

const buildStaticSystem = (): string => `${DEFAULT_PERSONA}\n${PROTOCOL}`;

/** 动态上下文块：只含数据不含指令，贴在最新用户消息之前（缓存友好） */
export function buildDynamicContext(snap: NavigatorSnapshot, swallowed: string[], cards: string[] = []): string {
  const s = useAppStore.getState();
  const due = s.getDueTodosToday().filter((t) => !s.getTodayTodoProgress(t.id).isComplete);
  const attrs = s.attributes
    .map((a) => `${s.settings.attributeNames?.[a.id] ?? a.displayName} Lv.${a.level}（${a.points} 点）`)
    .join('；');
  const lines = [
    `【今日状态 ${snap.dateKey}】`,
    `用户：${snap.userName}；当前 ${snap.hour} 点`,
    attrs ? `【属性面板】${attrs}` : '',
    `今日任务 ${snap.todosDone}/${snap.todosTotal}；今日已记 ${snap.activityCountToday} 条活动`,
    snap.tarotDrawn ? `今日塔罗已抽：「${snap.tarotCardName ?? '?'}」` : '今日塔罗未抽',
    snap.terminalStepTitle ? `进行中的终端小步：「${snap.terminalStepTitle}」` : '',
    due.length
      ? `【今日未完成待办（completeTodo 只能用这些 id）】\n${due.slice(0, 12).map((t) => `- id=${t.id} 「${t.title}」(${navAttrName(t.attribute)}+${t.points})`).join('\n')}`
      : '【今日无未完成待办】',
    cards.length
      ? `【本会话卡片实录（真实状态，以此为准）】\n${cards.join('\n')}`
      : '【本会话尚无卡片】',
    swallowed.length
      ? `【你上一条回复被用户打断，没说出口的是】${swallowed.join(' / ')}（若仍相关可自然续上，不相关就放弃，不要复读原文）`
      : '',
    '（提醒：输出必须是 {"reply","actions","query"} 这一个 JSON 对象；要出卡/改卡就把动作放进 actions 数组，reply 只负责说话。）',
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

/**
 * JSON 解析失败时的抢救降级（推理模型 maxTokens 吃紧时 content 可能被截断）：
 * ① 从残缺 JSON 里正则薅出 "reply" 字符串（截断也常能救回前半句）；
 * ② 全文没有花括号 = 模型没守格式直接说了人话 → 原文当回复用。
 * 都救不回才轮到调用方的「走神」兜底。
 */
function salvageReply(raw: string): string | null {
  const m = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1].replace(/"$/, '')}"`);
    } catch {
      return m[1].replace(/\\n/g, '\n');
    }
  }
  const trimmed = raw.trim();
  if (trimmed && !trimmed.includes('{') && trimmed.length <= 600) return trimmed;
  return null;
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
  cards: string[] = [],
): Promise<NavigatorTurnResult> {
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (!cfg) throw new Error('未配置 AI');
  const snap = buildSnapshot();
  const base: AIMessage[] = [
    { role: 'system', content: buildStaticSystem() },
    ...historyToMessages(history).slice(-24),
    { role: 'system', content: buildDynamicContext(snap, swallowed, cards) },
    { role: 'user', content: userText },
  ];

  // maxTokens 给足余量：DeepSeek v4 等推理模型的 reasoning 会先吃掉大半 completion 预算，
  // 给小了 content 里的 JSON 会被截断（实测 375 tokens 推理 + JSON 正文）。
  let lastRaw = '';
  const callOnce = async (messages: AIMessage[]): Promise<Record<string, unknown> | null> => {
    try {
      lastRaw = await chatComplete(cfg, messages, { temperature: 0.6, maxTokens: 1400, signal, jsonMode: true });
    } catch (e) {
      // 空响应自愈：个别 provider 的 json_object 会抽风返回纯空白 content（DeepSeek 官方已知），
      // 关掉 jsonMode 原样重试一次——prompt 约定 + salvage 仍兜底，错误不再糊到用户脸上。
      if (e instanceof Error && e.message.includes('空响应')) {
        lastRaw = await chatComplete(cfg, messages, { temperature: 0.6, maxTokens: 1400, signal, jsonMode: false });
      } else {
        throw e;
      }
    }
    return extractJson(lastRaw);
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
    const salvaged = salvageReply(lastRaw);
    return { segments: splitSegments(salvaged ?? '唔……刚才走神了，没听清。再说一遍？'), drafts: [] };
  }

  const extract = (p: Record<string, unknown>) => {
    const reply = String(p.reply ?? '').trim();
    // actions 数组为准；兼容模型仍按旧约定输出单 action 的情况
    const rawActions = Array.isArray(p.actions)
      ? (p.actions as Array<Record<string, unknown>>)
      : p.action
        ? [p.action as Record<string, unknown>]
        : [];
    const drafts = rawActions.slice(0, 3).map((a) => {
      const d = toDraft(a);
      // 提了动作却被校验丢弃 = 模型很可能在 reply 里许了空头支票——dev 下留痕便于调 prompt
      if (!d && import.meta.env.DEV) console.warn('[navigator] action 校验未通过被丢弃:', a);
      return d;
    }).filter((d): d is NavigatorDraft => !!d);
    return { reply, drafts };
  };

  let { reply, drafts } = extract(parsed);

  // 承诺-空卡守卫：reply 声称出了卡但 actions 为空 → 定向补救一跳，逼它补卡或改口
  // （词表兜不住所有说法，few-shot + jsonMode 是主防线，这里是最后一道网）
  const PROMISE_RE = /卡片?(给你|安排|开|挂|写|已|办)|安排上了?|记下了|给你记|挂上去|开[张好]|换成(这|每)|整个每日|建好了|加进(清单|待办)/;
  if (drafts.length === 0 && PROMISE_RE.test(reply)) {
    if (import.meta.env.DEV) console.warn('[navigator] reply 承诺出卡但 actions 为空，触发补救调用');
    const repaired = await callOnce([
      ...base,
      { role: 'assistant', content: lastRaw },
      { role: 'system', content: '你上一条 reply 声称出了卡片，但 actions 是空的——用户会看到空头支票。重新输出完整 JSON：要么把该出的 actions 补上（reply 保持原意即可），要么改写 reply 不再声称出卡。本轮禁止 query。' },
    ]);
    if (repaired) {
      const fixed = extract(repaired);
      if (fixed.drafts.length > 0) {
        // 补上卡了：采纳修复轮
        drafts = fixed.drafts;
        reply = fixed.reply || reply;
      } else if (fixed.reply && !PROMISE_RE.test(fixed.reply)) {
        // 改口成功（不再承诺）：采纳新说法
        reply = fixed.reply;
      }
    }
    // 硬兜底：两轮都没卡还在承诺 → 本地强制改口，绝不放行空头支票
    if (drafts.length === 0 && PROMISE_RE.test(reply)) {
      reply = '这张卡吾辈没能开出来——你把关键信息再说一遍，或者用下面的快捷项手动建一张，我盯着。';
    }
  }

  const segments = splitSegments(reply || (drafts.length ? '卡片给你，看一眼没问题就确认。' : '嗯。'));
  return { segments, drafts };
}

/** 有 Key 时的 AI 每日问候（>timeout 由调用方落模板；失败返回 null） */
export async function generateAIGreeting(
  snap: NavigatorSnapshot,
  signal: AbortSignal,
): Promise<string | null> {
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (!cfg) return null;
  try {
    // 推理模型的 reasoning 也占 completion 预算，问候虽短也要给足（否则必截断→永远落模板）
    const raw = await chatComplete(cfg, [
      { role: 'system', content: `${DEFAULT_PERSONA}\n今天第一次见面，说一句自然的问候。像正常人刚见面：简短、贴合时段和对方状态，**不要刻意罗列数据**，不要问候语大礼包。可用空行分成最多 2 段。只输出问候本身。` },
      { role: 'user', content: buildDynamicContext(snap, []) },
    ], { temperature: 0.9, maxTokens: 600, signal, timeoutMs: 0 });
    const text = raw.trim();
    return text ? text : null;
  } catch {
    return null;
  }
}
