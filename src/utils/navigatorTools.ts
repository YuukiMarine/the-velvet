/**
 * navigatorTools — 分诊的「原生 tool calling」后端（第 28 批 · PRD §24.10.4 试验模式，默认关）。
 *
 * 文本版分诊让模型回一段 JSON（actions / queries / stance…）；这里改成厂商的工具调用：每张要开的卡 = 调一次对应工具，
 * 要查 App 数据 = 调 query_* 工具（本地执行、结果回传、再来一轮），最后必须调 triage_result 报姿态。两种后端产出同一个
 * 「分诊原始对象」，都走 navigatorIntent 现成的 toDraft / parseQueries 校验——表演层永远纯文本，不碰这里。
 *   · 工具 schema 从 ACTION_TOOLS / QUERY_TOOLS 这一张表生成（文本协议是带示例的散文，不另抄一份 schema）。
 *   · 只做 OpenAI 兼容口（DeepSeek / Kimi / OpenAI / 中转）；Anthropic 协议回落文本版。
 *   · 多步：最多 2 次往返、20 秒预算；超了交回拿到的东西。
 *   · 探测即首次真用：报 400 且说的是 tools / function 不认 → 记进请求怪癖（tools: 'none'），这一轮回落文本版，以后不再试；
 *     成功一次记 tools: 'ok'。
 *   · 设置「实验：原生工具调用」（navigatorNativeTools）默认关。
 */
import { chatCompleteRaw, isAnthropic, type AIConfig, type AIMessage, type ToolDef } from '@/utils/aiClient';
import { quirksFor, rememberQuirk } from '@/utils/aiQuirks';
import { parseQueries, runQueries, MAX_QUERIES_PER_TURN } from '@/utils/navigatorQueries';
import { recordsLevelOf } from '@/utils/navigatorBriefing';
import { useAppStore } from '@/store';

const ATTR_ENUM = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const pointsSchema = {
  type: 'object',
  description: '各属性加点 0~5',
  properties: Object.fromEntries(ATTR_ENUM.map((a) => [a, { type: 'integer', minimum: 0, maximum: 5 }])),
  required: ATTR_ENUM,
};

/** 动作工具：名字 → 分诊 JSON 里的 kind（参数名与文本协议一致，toDraft 原样能吃） */
export const ACTION_TOOLS: Array<{ name: string; kind: string; description: string; parameters: Record<string, unknown> }> = [
  {
    name: 'record_activity', kind: 'activity',
    description: '记录用户已经做了的一件事（学习、运动、工作成果、阅读、创作、帮助他人、社交这类和成长有关的事，或用户明确要求记录的事）。日常琐事不记。',
    parameters: { type: 'object', properties: { text: { type: 'string', description: '事项描述' }, points: pointsSchema, important: { type: 'boolean' } }, required: ['text', 'points'] },
  },
  {
    name: 'add_todo', kind: 'todo',
    description: '给用户新建一条待办（打算做 / 要提醒的事）。任务清单里已有同一件事就不要建，改用 edit_todo。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' }, attribute: { type: 'string', enum: ATTR_ENUM }, points: { type: 'integer', minimum: 1, maximum: 5 },
        attribute2: { type: 'string', enum: ATTR_ENUM, description: '可选副奖励，须与 attribute 不同' }, points2: { type: 'integer', minimum: 1, maximum: 5 },
        repeatDaily: { type: 'boolean' },
        deadline: { type: 'string', description: '截止日 YYYY-MM-DD（可选；用户说了哪天要做完 / 要提醒）' },
        time: { type: 'string', description: '截止时刻 HH:MM（可选，必须配 deadline）' },
      },
      required: ['title', 'attribute', 'points'],
    },
  },
  {
    name: 'add_ledger', kind: 'ledger',
    description: '记一笔花钱或收入。',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['expense', 'income'] }, amount: { type: 'number' }, note: { type: 'string' },
        type: { type: 'string', enum: ['food', 'transport', 'shopping', 'fun', 'home', 'study', 'other'] },
        incomeType: { type: 'string', enum: ['labor', 'other'] }, channel: { type: 'string' },
      },
      required: ['direction', 'amount'],
    },
  },
  {
    name: 'complete_todo', kind: 'completeTodo',
    description: '用户说做完了某件今日待办。todoId 必须取自【今日未完成待办】清单。',
    parameters: { type: 'object', properties: { todoId: { type: 'string' }, todoTitle: { type: 'string' } }, required: ['todoId', 'todoTitle'] },
  },
  {
    name: 'edit_todo', kind: 'editTodo',
    description: '改一条已有任务：改名、改点数或属性、改每日 / 单次、改或取消截止日（deadline 空串 = 取消）、改或取消截止时刻（time 空串 = 取消）、不做了（archive）。只传要改的字段。todoId 取自【任务清单已有】。',
    parameters: {
      type: 'object',
      properties: {
        todoId: { type: 'string' }, title: { type: 'string' }, attribute: { type: 'string', enum: ATTR_ENUM }, points: { type: 'integer', minimum: 1, maximum: 5 },
        repeatDaily: { type: 'boolean' }, deadline: { type: 'string' }, time: { type: 'string' }, archive: { type: 'boolean' },
      },
      required: ['todoId'],
    },
  },
  {
    name: 'remember_fact', kind: 'remember',
    description: '用户明确要你记住一件关于他的事（「记住，我对花生过敏」）。不是待办、不是活动。',
    parameters: { type: 'object', properties: { text: { type: 'string', description: '关于用户的中性陈述句，≤40 字' } }, required: ['text'] },
  },
  {
    name: 'forget_fact', kind: 'forget',
    description: '用户明确要你忘掉 / 别再提某件记着的事。memoId 取自【这一轮带着的记忆】。',
    parameters: { type: 'object', properties: { memoId: { type: 'string' } }, required: ['memoId'] },
  },
];

/** 查询工具：名字 → queries 里的 kind */
export const QUERY_TOOLS: Array<{ name: string; kind: string; description: string; parameters: Record<string, unknown> }> = [
  { name: 'query_activities', kind: 'activities', description: '查过去几天的活动记录（今天的已在清单里）', parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 30 }, keyword: { type: 'string' } }, required: ['days'] } },
  { name: 'query_ledger', kind: 'ledger', description: '账本汇总：按天数或按月', parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90 }, month: { type: 'string', description: 'YYYY-MM' } } } },
  { name: 'query_weekly_goal', kind: 'weeklyGoal', description: '本周目标的进度', parameters: { type: 'object', properties: {} } },
  { name: 'query_countdowns', kind: 'countdowns', description: '倒计时 / 宣告卡还剩几天', parameters: { type: 'object', properties: {} } },
  { name: 'query_todo', kind: 'todo', description: '某条任务的详情与近 30 天完成情况', parameters: { type: 'object', properties: { todoId: { type: 'string' } }, required: ['todoId'] } },
  { name: 'query_tarot', kind: 'tarot', description: '最近几天抽到的塔罗', parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 30 } }, required: ['days'] } },
  { name: 'query_chats', kind: 'chats', description: '最近几天聊过什么（摘要）', parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 30 } }, required: ['days'] } },
  { name: 'query_wishes', kind: 'wishes', description: '愿望与进度', parameters: { type: 'object', properties: {} } },
  { name: 'query_summaries', kind: 'summaries', description: '最近的成长总结（只有数据）', parameters: { type: 'object', properties: {} } },
];

export const TRIAGE_RESULT_TOOL = {
  name: 'triage_result',
  description: '每轮最后必须调一次：报告对方最新这句的姿态、精力、是否带日子的要事、分量。',
  parameters: {
    type: 'object',
    properties: {
      stance: { type: 'string', enum: ['vent', 'chat', 'ask', 'report', 'bye'] },
      energy: { type: 'string', enum: ['low', 'normal', 'high'] },
      dated: { type: 'boolean' },
      gravity: { type: 'string', enum: ['normal', 'heavy'] },
    },
    required: ['stance', 'energy', 'dated', 'gravity'],
  },
};

/** OpenAI 兼容口的 tools 数组（从上面三张表生成） */
export function buildTriageTools(): ToolDef[] {
  const wrap = (t: { name: string; description: string; parameters: Record<string, unknown> }): ToolDef => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } });
  return [...ACTION_TOOLS.map(wrap), ...QUERY_TOOLS.map(wrap), wrap(TRIAGE_RESULT_TOOL)];
}

/** 工具版的系统提示：规则与文本版同源，只是「出卡 = 调工具」 */
export const TOOLS_SYSTEM = `你是记录意图判定器（工具版）。根据对话摘录和最新消息判定：本轮要开哪几张卡（0~3 张）、要不要查 App 里的数据、对方这句话的姿态。
- 每张要开的卡 = 调一次对应的工具（record_activity / add_todo / add_ledger / complete_todo / edit_todo / remember_fact / forget_fact）；不该开卡就一个都不调。
- 需要查 App 里的数据才能判定时，先调 query_* 工具（最多 ${MAX_QUERIES_PER_TURN} 个），结果会回给你，再决定开不开卡。
- **每轮最后必须调一次 triage_result**：stance（vent 倾诉 / chat 闲聊 / ask 提问求助 / report 说他做了或要做的正事 / bye 要走了）、energy（low / normal / high）、dated（这句里有没有他自己要经历的、日子明确、过后值得问一句结果的事）、gravity（heavy = 很绝望的话或崩溃边缘；累 / 烦 / 低落是 normal）。
- 只响应【最新消息】里的记录意图；闲聊、提问一律不开卡。日常琐事（吃饭、睡觉、通勤、刷手机）不记。
- 查重：【本会话卡片】【任务清单已有】【今天已记录的活动】里已有的事不要重复开卡；改已有任务用 edit_todo，不要再 add_todo；「做完了」是 complete_todo。
- 「提醒我 X」「几点要做 X」：App 不发通知，只把日子 / 几点记在任务上——清单里没有就 add_todo 带 deadline / time，已有就 edit_todo。截止日按【今天】换算成具体日期（给了【日历】就查表）。
- 不要用文字回答，只调工具。**开了卡的那一轮也要调 triage_result**（在说他做了 / 要做的正事 = report）。
示例（末句 → 该调的工具）：
- 今天跑了五公里 → record_activity + triage_result(report, normal)
- 今天好累啊 → 只调 triage_result(vent, low)
- 刚吃了碗麻辣烫哈哈 → 只调 triage_result(chat, normal)
- 现在几点了？ → 只调 triage_result(ask, normal)
- 行吧我先去睡了 → 只调 triage_result(bye, low)
- 任务清单已有「背单词」，末句：帮我加个背单词的任务 → 不开卡（已有），triage_result(report, normal)
- 我上周都做了什么？ → query_activities(days=7)，拿到结果后 triage_result(ask, normal)`;

export interface ToolsTriageOutcome {
  /** 与文本版 extractJson(raw) 同形：{ actions, queries, stance, energy, dated, gravity } */
  parsed: Record<string, unknown>;
  /** 往返次数（1 = 没查；2 = 查了再判） */
  rounds: number;
  /** 调试：每轮的工具调用名 */
  trace: string[];
}

const TOOLS_BUDGET_MS = 20_000;
const MAX_ROUNDS = 2;

/** 这个模型（在这个主机上）能不能走工具：怪癖记过 none 就不试；Anthropic 协议第一阶段不做 */
export function toolsBackendUsable(cfg: AIConfig): boolean {
  if (isAnthropic(cfg)) return false;
  return quirksFor(cfg.baseUrl, cfg.model).tools !== 'none';
}

const looksLikeToolsRejected = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message : String(e);
  return /HTTP 4\d\d/.test(msg) && /tool|function/i.test(msg);
};

const parseArgs = (s: string): Record<string, unknown> => {
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}; } catch { return {}; }
};

/**
 * 工具版分诊：返回与文本版同形的原始对象（校验仍交给 navigatorIntent）。
 * 任何失败都抛出——调用方回落文本版；400 说不认 tools 的顺手记进怪癖。
 */
export async function triageViaTools(
  cfg: AIConfig,
  userBlock: string,
  presetId: string,
  opts: { signal?: AbortSignal; instant?: boolean; purpose?: string } = {},
): Promise<ToolsTriageOutcome> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TOOLS_BUDGET_MS);
  const onOuter = () => ac.abort();
  opts.signal?.addEventListener('abort', onOuter);
  const tools = buildTriageTools();
  const actionByName = new Map(ACTION_TOOLS.map((t) => [t.name, t.kind]));
  const queryByName = new Map(QUERY_TOOLS.map((t) => [t.name, t.kind]));
  const messages: AIMessage[] = [
    { role: 'system', content: TOOLS_SYSTEM },
    { role: 'user', content: userBlock },
  ];
  const actions: Record<string, unknown>[] = [];
  const queries: Record<string, unknown>[] = [];
  let result: Record<string, unknown> | null = null;
  const trace: string[] = [];
  let rounds = 0;
  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      rounds = round;
      let res;
      try {
        res = await chatCompleteRaw(cfg, messages, { temperature: 0.1, maxTokens: 800, signal: ac.signal, instant: opts.instant, purpose: opts.purpose ?? 'triage-tools', tools, toolChoice: 'auto' });
      } catch (e) {
        if (looksLikeToolsRejected(e)) rememberQuirk(cfg.baseUrl, cfg.model, { tools: 'none' });
        throw e;
      }
      trace.push(res.toolCalls.map((c) => c.name).join(',') || '(no tools)');
      const pendingQueries: Array<{ id: string; q: Record<string, unknown> }> = [];
      for (const call of res.toolCalls) {
        const args = parseArgs(call.args);
        if (call.name === TRIAGE_RESULT_TOOL.name) { result = args; continue; }
        const ak = actionByName.get(call.name);
        if (ak) { actions.push({ kind: ak, ...args }); continue; }
        const qk = queryByName.get(call.name);
        if (qk && pendingQueries.length < MAX_QUERIES_PER_TURN) pendingQueries.push({ id: call.id, q: { kind: qk, ...args } });
      }
      // 没有再要查的东西：这轮就是结论
      if (!pendingQueries.length || round === MAX_ROUNDS) break;
      // 查了就回传结果，再来一轮（动作工具这轮若已经调了也算数，不重复）
      const qs = parseQueries(pendingQueries.map((p) => p.q));
      queries.push(...pendingQueries.map((p) => p.q));
      // 「让助手了解你的记录」关着（第 35 批 f）：记录类查询不跑（chats 是聊天记忆，照查），回传「没有数据」
      const allowed = recordsLevelOf(useAppStore.getState().settings) === 'off' ? qs.map((q) => (q.kind === 'chats' ? q : null)) : qs;
      const ran = await runQueries(allowed.filter((q): q is NonNullable<typeof q> => !!q), presetId);
      const blocks: string[] = [];
      for (const q of allowed) blocks.push(q ? (ran.shift() ?? '') : '（这一项没有开放给助手查看）');
      messages.push({ role: 'assistant', content: res.content || '', tool_calls: res.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })) });
      res.toolCalls.forEach((c, i) => {
        const pq = pendingQueries.findIndex((p) => p.id === c.id);
        const text = pq >= 0 ? (blocks[pq] ?? '（没有数据）') : (c.name === TRIAGE_RESULT_TOOL.name ? '收到' : '已记下，会出确认卡');
        messages.push({ role: 'tool', tool_call_id: c.id, content: text || `（第 ${i + 1} 个工具没有结果）` });
      });
      messages.push({ role: 'user', content: '以上是查到的数据。现在给出最终判定：要开的卡各调一次工具，最后调 triage_result。' });
    }
    rememberQuirk(cfg.baseUrl, cfg.model, { tools: 'ok' });
    // 模型开了卡却忘了调 triage_result（实测 DeepSeek 四成会漏）：开卡 = 在说他做了 / 要做的正事，姿态按 report 兜底
    const fallbackStance = actions.length ? 'report' : 'chat';
    return {
      parsed: {
        actions,
        queries,
        stance: result?.stance ?? fallbackStance,
        energy: result?.energy ?? 'normal',
        dated: result?.dated ?? false,
        gravity: result?.gravity ?? 'normal',
      },
      rounds,
      trace,
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuter);
  }
}
