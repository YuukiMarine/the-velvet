import { Activity, Attribute, AttributeId, DrawnCard, Fortune, LongReadingPeriod, Settings, TarotOrientation } from '@/types';
import { TarotCardData, TAROT_BY_ID, SPREAD_POSITIONS, PERIOD_LABELS } from '@/constants/tarot';
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
  const dateStr = new Date(a.date).toLocaleDateString('zh-CN');
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

// ── 每日塔罗：JSON 响应，非流式 ────────────────────────────

const DAILY_SYSTEM_PROMPT = `你是靛蓝色房间的塔罗解读者。你的语气庄严而富有诗意，带着神秘学气息，但从不故弄玄虚。
用户今日抽到一张塔罗牌，请结合以下信息为其撰写一份每日运势解读：
1. 抽到的塔罗牌（含正/逆位）的意象
2. 用户的五维属性名称与等级（这些属性代表用户当下的成长状态）
3. 用户最近 7 条成长记录（体现近况）

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

【关于五项属性的命名约束（非常重要）】
- 客人**自己定义了五项属性的名字**，这些名字会随客人喜好变化（例如可能是英文缩写、自创词、领域术语等）。
- 你接下来收到的"客人的五维属性"列表里给出的名字就是**唯一规范名**。
- 在 narration / advice 等所有正文中提到属性时，**必须严格使用客人列表中的原文**，
  不允许翻译、意译，不允许加括号注释，自然地提到即可。
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
}): AIRequestData {
  const { settings, attributes, card, orientation, recentActivities } = params;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const customNameList = ATTRIBUTE_IDS.map(id => attrNames[id] ?? id);
  const userMessage = [
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

const LONG_SYSTEM_PROMPT = `你是靛蓝色房间的塔罗解读者。语气庄严、富有意象与哲思，但行文克制不浮夸。
用户此刻提出一个具体问题，并请你依据三张塔罗牌组成的牌阵为其解读。你将：

1. 先用 1-2 句概述"三张牌合起来讲述了什么故事"。
2. 然后按牌阵位置顺序，**逐张**深入解读（每张 3-5 句），并将牌意与用户当下的属性状态、近期行为关联起来。
3. 最后给出 2-3 条具体而富有意象的行动建议，收束整段解读。

【关于五项属性的命名约束（非常重要）】
- 客人**自己定义了五项属性的名字**，这些名字可能是英文缩写、自创词或领域术语。
- 在正文中提到任何属性时，**必须严格使用客人给出的原文**，
  不允许翻译、意译，不允许加括号注释，自然地提到即可。

请用 Markdown 输出，使用二级标题 (##) 分段。语气可以稍长于每日解读，但避免空话套话。`;

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
请结合：先前的解读脉络、追问本身、以及这张新抽到的牌，给出紧凑而有力的回应（约 2-4 段）。
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
