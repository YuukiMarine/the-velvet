import { Activity, Attribute, AttributeId, DailyDivination, DrawnCard, Fortune, LongReadingPeriod, Settings, TarotOrientation } from '@/types';
import { TarotCardData, TAROT_BY_ID, SPREAD_POSITIONS, PERIOD_LABELS, FORTUNE_META } from '@/constants/tarot';
import { resolveProvider } from '@/utils/aiProviders';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

export interface AIRequestData {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export interface DailyAIResult {
  narration: string;
  advice: string;
  attribute: AttributeId;
  fortune: Fortune;
}

function attrLines(attributes: Attribute[], attrNames: Record<AttributeId, string>): string {
  return ATTRIBUTE_IDS.map(id => {
    const a = attributes.find(x => x.id === id);
    return `- ${attrNames[id] ?? id}：Lv.${a?.level ?? 1}  总点数 ${a?.points ?? 0}`;
  }).join('\n');
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLocalDateTime(d: Date): string {
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return `${date} ${WEEKDAYS[d.getDay()]} ${time}`;
}

/**
 * 将 LLM 返回的属性名（可能是客制化名字、近似匹配、或退化的英文 ID）映射回
 * 规范的 AttributeId。优先按客人当前的属性名匹配，失败再做一系列兜底。
 */
function resolveAttributeFromLabel(
  raw: string,
  attrNames: Record<AttributeId, string>,
): AttributeId | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 1) 精确匹配客制化名字
  for (const id of ATTRIBUTE_IDS) {
    if ((attrNames[id] ?? '') === trimmed) return id;
  }
  // 2) 大小写不敏感
  const lc = trimmed.toLowerCase();
  for (const id of ATTRIBUTE_IDS) {
    if ((attrNames[id] ?? '').toLowerCase() === lc) return id;
  }
  // 3) 退化为英文 ID（如 LLM 偶尔无视指令直接返回 knowledge）
  if ((ATTRIBUTE_IDS as string[]).includes(lc)) return lc as AttributeId;
  // 4) 模糊包含（LLM 可能在名字外多包了符号或括号）
  for (const id of ATTRIBUTE_IDS) {
    const name = (attrNames[id] ?? '').trim();
    if (name && (trimmed.includes(name) || name.includes(trimmed))) return id;
  }
  return null;
}

function formatActivitySnippet(a: Activity, attrNames: Record<AttributeId, string>): string {
  const dateStr = formatLocalDateTime(new Date(a.date));
  const ptsParts = ATTRIBUTE_IDS
    .filter(k => (a.pointsAwarded?.[k] ?? 0) > 0)
    .map(k => `${attrNames[k] ?? k}+${a.pointsAwarded[k]}`);
  const ptsStr = ptsParts.length ? `  [${ptsParts.join(', ')}]` : '';
  return `[${dateStr}] ${a.description}${ptsStr}`;
}

function cardLine(c: TarotCardData, orientation: TarotOrientation): string {
  const o = orientation === 'upright' ? '正位' : '逆位';
  const m = orientation === 'upright' ? c.upright : c.reversed;
  return `《${c.name} ${c.nameEn}》(${o}) — 关键词：${m.keywords.join('、')}；牌意：${m.meaning}`;
}

function previousDailyLine(d: DailyDivination | null | undefined, attrNames: Record<AttributeId, string>): string {
  if (!d) return '（无上一张每日塔罗记录）';
  const card = TAROT_BY_ID[d.cardId];
  const cardName = card ? `《${card.name} ${card.nameEn}》` : `《${d.cardId}》`;
  const orientation = d.orientation === 'upright' ? '正位' : '逆位';
  const fortune = d.fortune ? FORTUNE_META[d.fortune]?.label ?? d.fortune : '未记录';
  const attrName = attrNames[d.effect.attribute] ?? d.effect.attribute;
  const date = d.createdAt ? formatLocalDateTime(new Date(d.createdAt)) : d.date;
  return [
    `[${date}] ${cardName}（${orientation}）`,
    `运势：${fortune}`,
    `加成：${attrName} × ${d.effect.multiplier}`,
    `上一条短建议：${d.advice || '（无）'}`,
  ].join('；');
}

// ── 每日塔罗：JSON 响应，非流式 ────────────────────────────

const DAILY_SYSTEM_PROMPT = `你是靛蓝色房间的塔罗解读者。你的语气庄严而富有诗意，带着神秘学气息，但从不故弄玄虚。
用户今日抽到一张塔罗牌，请结合以下信息为其撰写一份每日运势解读：
1. 抽到的塔罗牌（含正/逆位）的意象
2. 用户的五维属性名称与等级（这些属性代表用户当下的成长状态）
3. 用户最近 7 条成长记录（体现近况）
4. 当前本地时间与上一张每日塔罗的轻量上下文

请以紧凑但富有意象的笔触，说明：
- 今日整体走向（2-3 句）
- 今日"宜"的方向（1-2 条）
- 今日"忌"或需"慎"的地方（1-2 条）

并结合牌意（占比较大）与用户当下状态，从五项属性中挑选最契合的一项作为今日加成属性。
同时，请给出今日的"总体运势吉凶"等级：
- "great"（大吉）——牌意积极 + 正位为主 + 与客人近期状态强烈契合
- "good"（中吉）——基调正向但有条件或保留
- "small"（小吉）——走势中性偏好，需留心
- "bad"（凶）——以警示/考验为主，需格外谨慎

【关于上一张每日塔罗】
- 上一张牌只是轻量参照，不是今天的主牌。
- 只有当今天的牌与上一张形成明显的延续、反转或回应时，才自然带一句；否则不要提及。
- 不要复述上一条解读，也不要让上一张牌覆盖今天这张牌的判断。

【关于五项属性的命名约束（非常重要）】
- 客人**自己定义了五项属性的名字**，这些名字会随客人喜好变化（例如可能是英文缩写、自创词、领域术语等）。
- 你接下来收到的"客人的五维属性"列表里给出的名字就是**唯一规范名**。
- 在 narration / advice 等所有正文中提到属性时，**必须严格使用客人列表中的原文**，
  不允许翻译、意译，不允许加括号注释，也请自然、不刻意地提到。
- JSON 中 \`attribute\` 字段的取值，也必须严格写成客人列表里的某一个名字（与列表中完全一致）。

**输出必须是严格的合法 JSON**，结构：
{
  "narration": "主解读文字（允许 Markdown 列表、换行），不少于 3 行，不超过 10 行",
  "advice": "一句简短的今日行动建议，不超过 40 字",
  "attribute": "<挑选最契合的一项属性，值必须严格等于客人列表中的属性名原文>",
  "fortune": "<great | good | small | bad 之一>"
}

不要输出 JSON 之外的任何文字，不要用代码块包裹。`;

export function buildDailyRequest(params: {
  settings: Settings;
  attributes: Attribute[];
  card: TarotCardData;
  orientation: TarotOrientation;
  recentActivities: Activity[];
  previousDaily?: DailyDivination | null;
  now?: Date;
}): AIRequestData {
  const { settings, attributes, card, orientation, recentActivities, previousDaily, now = new Date() } = params;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const customNameList = ATTRIBUTE_IDS.map(id => attrNames[id] ?? id);
  const userMessage = [
    `当前本地时间：${formatLocalDateTime(now)}`,
    ``,
    `今日抽到的塔罗牌：`,
    cardLine(card, orientation),
    ``,
    `客人的五维属性（属性名为客人自定义，请在正文与 JSON 中逐字使用以下名字，不要替换为默认中文名）：`,
    attrLines(attributes, attrNames),
    ``,
    `合法的属性名集合（attribute 字段只能取以下五个之一，逐字一致）：`,
    customNameList.map(n => `· ${n}`).join('\n'),
    ``,
    `最近 7 条成长记录：`,
    recentActivities.length > 0
      ? recentActivities.slice(0, 7).map(a => formatActivitySnippet(a, attrNames)).join('\n')
      : '（暂无记录）',
    ``,
    `上一张每日塔罗（轻量上下文，仅在有明显延续/反转时使用）：`,
    previousDailyLine(previousDaily, attrNames),
    ``,
    `请按要求输出 JSON。`,
  ].join('\n');

  return {
    baseUrl,
    model,
    apiKey: settings.summaryApiKey || '',
    messages: [
      { role: 'system', content: DAILY_SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
  };
}

/** 调用 AI 完成每日解读，返回结构化结果。失败时抛出 */
export async function callDailyAI(
  req: AIRequestData,
  signal?: AbortSignal,
  attrNames?: Record<AttributeId, string>,
): Promise<DailyAIResult> {
  const resp = await fetch(`${req.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: 0.85,
      max_tokens: 800,
      stream: false,
    }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API 请求失败 (${resp.status}): ${body.slice(0, 200) || resp.statusText}`);
  }

  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('AI 返回为空');

  // 模型可能包裹代码块或在前后添加解释文字，尽可能提取 { ... } 主体
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace  = stripped.lastIndexOf('}');
  const jsonLike = firstBrace >= 0 && lastBrace > firstBrace
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    throw new Error('AI 返回不是合法 JSON');
  }

  const narration = typeof parsed.narration === 'string' ? parsed.narration.trim() : '';
  const advice    = typeof parsed.advice    === 'string' ? parsed.advice.trim()    : '';
  const attrRaw   = typeof parsed.attribute === 'string' ? parsed.attribute : '';
  // 优先按客人当前的属性名匹配；attrNames 缺省时退化为 ID 集合匹配
  const attribute: AttributeId | null = attrNames
    ? resolveAttributeFromLabel(attrRaw, attrNames)
    : ((ATTRIBUTE_IDS as string[]).includes(attrRaw.trim().toLowerCase())
        ? (attrRaw.trim().toLowerCase() as AttributeId)
        : null);

  const fortRaw = typeof parsed.fortune === 'string' ? parsed.fortune.trim().toLowerCase() : '';
  const FORTUNES = ['great', 'good', 'small', 'bad'];
  const fortune: Fortune | null = FORTUNES.includes(fortRaw) ? (fortRaw as Fortune) : null;

  if (!narration || !advice || !attribute || !fortune) {
    throw new Error('AI 返回字段不完整');
  }
  return { narration, advice, attribute, fortune };
}

// ── 中长期占卜：Markdown 流式 ───────────────────────────────

const LONG_SYSTEM_PROMPT = `你是一位经验丰富、观察敏锐的塔罗师。输出文字本身不要出现任何自称，也不要提到"塔罗师"、"解读者"、"AI"、"助手"、"我"、"我们"、"本次解读"等自我指涉。
用户此刻提出一个具体问题，并请你依据三张塔罗牌组成的牌阵为其解读。

这不是三张牌的百科解释，也不是工具报告。你要像一位熟练的人类塔罗师翻开牌后自然落笔：先让空气安静下来，再把三张牌之间的关系讲清楚，最后才给出可走的路。

请用 Markdown 输出，并遵守以下顺序：
1. 先写一段不加标题的简短 intro，1-2 句即可。它应该像牌面刚被翻开后的开场，带一点沉浸感，但不要玄虚堆砌。
2. 第二段标题固定为 "## 三张牌共讲的故事"。用 2-3 句说清三张牌合起来讲述的故事，必须写出三张牌之间的递进、冲突或转向。
3. 然后按牌阵位置顺序逐张深入解读。每张使用二级标题，格式为 "## 位置 · 牌名"；每张 3-5 句。
4. 每张牌的解读必须同时包含：它在该位置上的作用、这张牌本身的牌意、它与前后牌的关系、它与客人当下属性状态或近期行为的一处连接。
5. 最后一段标题用自然一点的表达，例如 "## 接下来可以怎样走"。给出 2-3 条具体行动建议，建议必须符合本次占卜周期的时间尺度。

风格要求：
- 像经验丰富的人在桌边说话：判断要准，语气要稳，允许含蓄，但不要装腔，耐心、有同理心地解答问题。
- 少用"整体来看"、"这张牌提醒你"、"你需要注意的是"、"建议你"、"综上"这类模板句。
- 禁止自称、禁止解释分析过程、禁止把牌意写成报告或清单式结论。
- 可以有意象，但每段都要落到一个具体判断或具体动作。

【关于五项属性的命名约束（非常重要）】
- 客人**自己定义了五项属性的名字**，这些名字可能是英文缩写、自创词或领域术语。
- 在正文中提到任何属性时，**必须严格使用客人给出的原文**，
  不允许翻译、意译，不允许加括号注释，自然地提到即可。

避免空话套话。`;

const LONG_PERIOD_GUIDANCE: Record<LongReadingPeriod, string> = {
  recent: `这是近景占卜，时间尺度是未来 2-3 天。请把牌阵读成"昨日留下的回声 / 今日正在发生的选择 / 明日可能显现的反馈"，不要写成几周或数月的宏观建议。`,
  midterm: `这是中期占卜，时间尺度是 2-4 周。请读出阶段推进：现在的惯性、接下来最可能卡住的地方、以及一个可观察的转向信号。`,
  longterm: `这是长期占卜，时间尺度是数月以上。请避免承诺确定结果，重点写根基、长期惯性、可能累积的风险，以及可以分阶段验证的里程碑。`,
};

export function buildLongReadingRequest(params: {
  settings: Settings;
  attributes: Attribute[];
  recentByAttribute: Record<AttributeId, Activity[]>;
  question: string;
  period: LongReadingPeriod;
  picked: DrawnCard[];
}): AIRequestData {
  const { settings, attributes, recentByAttribute, question, period, picked } = params;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const positions = SPREAD_POSITIONS[period];
  const periodMeta = PERIOD_LABELS[period];

  const cardBlocks = picked.map((p, i) => {
    const card = TAROT_BY_ID[p.cardId];
    if (!card) return '';
    return `### ${positions[i]}（第${i + 1}张）\n${cardLine(card, p.orientation)}`;
  }).filter(Boolean).join('\n\n');

  const recentBlocks = ATTRIBUTE_IDS.map(id => {
    const items = (recentByAttribute[id] ?? []).slice(0, 4);
    const lines = items.length > 0
      ? items.map(a => `  - ${formatActivitySnippet(a, attrNames)}`).join('\n')
      : '  - （无）';
    return `- **${attrNames[id] ?? id}**：\n${lines}`;
  }).join('\n');

  const customNameList = ATTRIBUTE_IDS.map(id => attrNames[id] ?? id);
  const userMessage = [
    `**客人提出的问题**：${question.trim() || '（未具体描述）'}`,
    `**指向的时间周期**：${periodMeta.label}（${periodMeta.hint}）`,
    `**本次周期的写法边界**：${LONG_PERIOD_GUIDANCE[period]}`,
    ``,
    `**牌阵（${positions.join(' / ')}）**：`,
    cardBlocks,
    ``,
    `**客人的五维属性**（属性名为客人自定义，正文中提到属性时请逐字使用以下名字，不要替换为默认中文名）：`,
    attrLines(attributes, attrNames),
    ``,
    `合法属性名集合（提到属性时只能从中选取，逐字一致）：`,
    customNameList.map(n => `· ${n}`).join('\n'),
    ``,
    `**客人各属性最近 4 条成长记录**：`,
    recentBlocks,
    ``,
    `请依照系统指令，结合以上信息为客人给出解读。`,
  ].join('\n');

  return {
    baseUrl,
    model,
    apiKey: settings.summaryApiKey || '',
    messages: [
      { role: 'system', content: LONG_SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
  };
}

// ── 追问（流式，复用先前对话上下文） ─────────────────────────

const FOLLOW_UP_SYSTEM_ADDITION = `
客人对先前的解读进行追问，并重新抽出一张塔罗牌作为此问的指引。
这是追问回应，不需要重复主解读的固定标题结构，也不要把原三张牌重新逐张解释。
请先直接回应追问，再说明这张新牌如何修正、照亮或收束原牌阵的主线，给出紧凑而有力的回应（约 2-4 段）。
用 Markdown 输出。`;

export function buildFollowUpRequest(params: {
  settings: Settings;
  previousUserMessage: string;
  previousAssistantMessage: string;
  followUpQuestion: string;
  followUpCard: TarotCardData;
  followUpOrientation: TarotOrientation;
}): AIRequestData {
  const { settings, previousUserMessage, previousAssistantMessage,
          followUpQuestion, followUpCard, followUpOrientation } = params;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const followUpText = [
    `**追问**：${followUpQuestion.trim()}`,
    ``,
    `**为此追问抽到的牌**：`,
    cardLine(followUpCard, followUpOrientation),
    ``,
    `请结合先前的解读脉络与这张新牌，回应客人的追问。`,
  ].join('\n');

  return {
    baseUrl,
    model,
    apiKey: settings.summaryApiKey || '',
    messages: [
      { role: 'system', content: LONG_SYSTEM_PROMPT + FOLLOW_UP_SYSTEM_ADDITION },
      { role: 'user',   content: previousUserMessage },
      { role: 'assistant', content: previousAssistantMessage },
      { role: 'user',   content: followUpText },
    ],
  };
}

// ── 通用流式读取 ────────────────────────────────────────────

export async function* streamChatSSE(req: AIRequestData, signal?: AbortSignal): AsyncGenerator<string> {
  const resp = await fetch(`${req.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
      temperature: 0.85,
      max_tokens: 1600,
    }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API 请求失败 (${resp.status}): ${body.slice(0, 200) || resp.statusText}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta: string = json?.choices?.[0]?.delta?.content ?? '';
        if (delta) yield delta;
      } catch { /* malformed chunk, skip */ }
    }
  }
}

/** 格式化常见网络错误 */
export function formatApiError(e: unknown): string {
  if (!(e instanceof Error)) return '生成失败，请重试';
  if (e instanceof TypeError && /failed to fetch|network/i.test(e.message)) {
    return '网络请求失败：无法连接到 API 服务。\n若在浏览器中使用，部分 API 可能因跨域（CORS）限制无法直接访问，建议在 Android 客户端或支持 CORS 的接口下使用此功能。';
  }
  if (e.name === 'AbortError') return '已取消';
  return e.message;
}
