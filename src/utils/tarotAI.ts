/**
 * tarotAI — 每日塔罗 / 中长期占卜 / 追问 的提示词与调用（v2.7.0.6 重做）。
 *
 * 这一版改了什么（用户口径：「上一轮改完以后更弱智了」）：
 *   · 素材换血：不再喂"最新 7 条记录 + Lv 数字"，改喂 tarotContext 算出的近况简报
 *     （每行带日期、属性只定性、案头只作底色、昨日回声、手记、画像）；
 *   · 风格改为旁敲侧击：不点名事项、不写数字，让客人"对号入座"；
 *   · 写法由代码轮转（WRITING_PRESETS），模型只负责判断；
 *   · 每日改流式：正文先流出来上屏，末尾一行 <<<META>>> 带 JSON（签语 / 属性 / 吉凶 / 手记）；
 *   · 每日可选走「深思熟虑」档（settings.tarotDailyDeliberate），温度 0.7。
 */
import type { AttributeId, Fortune, LongReadingPeriod, Settings, TarotOrientation, DrawnCard } from '@/types';
import { TAROT_BY_ID, SPREAD_POSITIONS, PERIOD_LABELS, inferFortune, TarotCardData } from '@/constants/tarot';
import { resolveProvider } from '@/utils/aiProviders';
import { chatComplete, chatStream, getAIConfig, getDeliberateAIConfig, type AIConfig } from '@/utils/aiClient';
import { buildDailyBrief, buildLongBrief, formatNowLine, type WritingPreset } from '@/utils/tarotContext';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

export interface AIRequestData {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

/** 每日解读的结构化结果（AI 与离线兜底共用） */
export interface DailyAIResult {
  narration: string;
  advice: string;
  attribute: AttributeId;
  fortune: Fortune;
  memo?: string;
}

/**
 * 将 LLM 返回的属性名（可能是客制化名字、近似匹配、或退化的英文 ID）映射回
 * 规范的 AttributeId。优先按客人当前的属性名匹配，失败再做一系列兜底。
 */
export function resolveAttributeFromLabel(
  raw: string,
  attrNames: Record<AttributeId, string>,
): AttributeId | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  for (const id of ATTRIBUTE_IDS) {
    if ((attrNames[id] ?? '') === trimmed) return id;
  }
  const lc = trimmed.toLowerCase();
  for (const id of ATTRIBUTE_IDS) {
    if ((attrNames[id] ?? '').toLowerCase() === lc) return id;
  }
  if ((ATTRIBUTE_IDS as string[]).includes(lc)) return lc as AttributeId;
  for (const id of ATTRIBUTE_IDS) {
    const name = (attrNames[id] ?? '').trim();
    if (name && (trimmed.includes(name) || name.includes(trimmed))) return id;
  }
  return null;
}

function cardBlock(c: TarotCardData, orientation: TarotOrientation): string {
  const o = orientation === 'upright' ? '正位' : '逆位';
  const m = c[orientation];
  return [
    `《${c.name} ${c.nameEn}》（${o}）`,
    `- 关键词：${m.keywords.join('、')}`,
    `- 牌意：${m.meaning}`,
    `- 牌面写给客人的话（客人在界面上也能读到这段，正文不要照抄）：${m.reflection}`,
  ].join('\n');
}

const ATTRIBUTE_NAMING_RULES = `【关于五项属性的命名（非常重要）】
- 客人**自己定义了五项属性的名字**（可能是英文缩写、自创词、领域术语）。素材里给出的名字是唯一规范名。
- 正文与 JSON 里提到属性时，**必须逐字使用素材里的原文**，不翻译、不意译、不加括号注释；提到时要自然，不要为了提而提。`;

const OBLIQUE_RULES = `【铁律】
- 旁敲侧击，不点名。绝不写出任务标题、愿望原文、记录原文；用牌的意象与处境的轮廓去指向它。"那件搁了很久的事"可以，"你的『背单词』任务"不可以。
- 不出现任何数字：等级、点数、Lv、次数、百分比、天数、金额，一个都不许写。属性名可以出现，但不带等级。
- 日期是硬约束。素材里每一行都标了是今天、昨天、还是几天前：只有标「今天」的才能说成今天的事，标「昨天」的才能说成昨天的事；三天前及更早的，不要当作近况来提。没有记录的空窗，就把沉默本身读进牌里，不要翻旧账。
- 不复读上一张牌的解读，不复读案头清单，不复读手记与画像；长期的、反复出现的事项更不要天天提。
- 不用"整体来看 / 这张牌提醒你 / 你需要注意的是 / 建议你 / 综上"这类模板句。不自称，不提"AI""解读者""塔罗师"。`;

// ── 每日塔罗：流式正文 + 尾部 META ──────────────────────────

/** 正文与结构化尾巴的分界线。模型另起一行只写它，之后是一个 JSON 对象。 */
export const DAILY_META_MARK = '<<<META>>>';

const DAILY_SYSTEM_PROMPT = `你是靛蓝色房间的塔罗解读者。语气庄严、克制、有诗意，带一点神秘学气息，从不故弄玄虚；像一位熟识客人的解读者在桌边落笔，不像自动生成的日报。

【你会拿到的素材】
1. 今日抽到的牌（含正/逆位）：关键词、牌意、以及一段"牌面写给客人的话"。
2. 现在的日期与时辰。
3. 客人的底色：五项属性只做定性描述，没有数字。
4. 近况：近两天的记录，每行带日期；没有就明说是空窗。
5. 案头：今天要做的一次性事项、临近的期限、远处的愿望——只作底色。
6. 昨日回声：昨天那张牌说了什么、客人那天实际做了什么。
7. 解读者手记（若有）：你自己此前留下的备忘。
8. 客人画像（若有）。
9. 今日写法：今天这篇解读该用的切入角度与体裁。

【解读的本质】
牌是主角，客人的近况是底色。你要做的不是把素材复述一遍，而是让牌的语言**擦过**客人的处境——让他读到时心里一动、觉得"这说的是我"，却说不出你是从哪条记录知道的。素材越具体，你的笔越要虚；越像旁敲侧击，越像真正认识他。

${OBLIQUE_RULES}

【必须落到的三件事】（顺序、措辞、是否分段都自由，但缺一不可）
- 一句判断：今天的走向如何。
- 一处顺势：什么值得顺着今天的势去做。可以指向案头上的某件事，但只能旁敲侧击。
- 一处收着：什么该收着、避开、或别急。

【今日写法】
素材末尾给出了今天的写法，照它写。总量 3～9 行看内容需要；不用小标题；可以用换行分段，可以偶尔加粗一处，不要列表。

【运势与加成属性】
结合牌意（占比较大）与客人当下状态，从五项属性中挑一项作为今日加成属性，并给出吉凶等级：
- "great"（大吉）：牌意积极、正位为主、与客人当下状态强烈契合
- "good"（中吉）：基调正向但有条件或保留
- "small"（小吉）：走势中性偏好，需留心
- "bad"（凶）：以警示、考验为主，需格外谨慎

${ATTRIBUTE_NAMING_RULES}

【输出格式（严格）】
先写解读正文。正文写完后，**另起一行只写 ${DAILY_META_MARK}**，再另起一行给出一个 JSON 对象，形如：
{"advice":"一句签语","attribute":"属性名原文","fortune":"good","memo":"一句备忘"}
- advice：一句像签文的话，飘渺、可代入，不超过 24 字；不是行动指令，不点名任何事项，不带数字。它会显示在首页。
- attribute：逐字等于素材里五项属性名之一。
- fortune：great / good / small / bad 之一。
- memo：写给未来的你自己的备忘，不超过 30 字，中性陈述句，记下这张牌落在客人哪件处境上（这一句可以写具体事，它会以小字显示给客人、客人可以删掉）。
${DAILY_META_MARK} 之后除了这个 JSON 不要有任何别的文字，不要用代码块。`;

/** 每日塔罗走哪一档：开关开且深思熟虑档可用 → 深思熟虑；否则快速响应 */
export function resolveDailyConfig(settings: Settings): AIConfig | null {
  if (settings.tarotDailyDeliberate) {
    const d = getDeliberateAIConfig(settings);
    if (d) return d;
  }
  return getAIConfig(settings);
}

export async function buildDailyRequest(params: {
  settings: Settings;
  card: TarotCardData;
  orientation: TarotOrientation;
  now?: Date;
}): Promise<{ req: AIRequestData; preset: WritingPreset }> {
  const { settings, card, orientation, now = new Date() } = params;
  const cfg = resolveDailyConfig(settings) ?? {
    ...resolveProvider(settings.summaryApiProvider, settings.summaryApiBaseUrl, settings.summaryModel),
    apiKey: settings.summaryApiKey || '',
  };
  const brief = await buildDailyBrief({ card, orientation, now });

  const userMessage = [
    `今日抽到的牌：`,
    cardBlock(card, orientation),
    ``,
    brief.text,
    ``,
    `请按系统指令写今日解读：先正文，再另起一行 ${DAILY_META_MARK}，再一行 JSON。`,
  ].join('\n');

  return {
    preset: brief.preset,
    req: {
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      apiKey: cfg.apiKey,
      messages: [
        { role: 'system', content: DAILY_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    },
  };
}

/** 流式期间给 UI 看的正文：截到 META 标记之前，且把尾部可能只到了一半的标记藏起来 */
export function visibleDailyText(full: string): string {
  const at = full.indexOf(DAILY_META_MARK);
  let text = at >= 0 ? full.slice(0, at) : full;
  if (at < 0) {
    // 标记正在一个字一个字到达："<<<ME" 这种半截不能上屏
    for (let k = Math.min(text.length, DAILY_META_MARK.length - 1); k >= 1; k--) {
      if (text.endsWith(DAILY_META_MARK.slice(0, k))) { text = text.slice(0, -k); break; }
    }
  }
  return text.replace(/\s+$/, '');
}

const FORTUNES: Fortune[] = ['great', 'good', 'small', 'bad'];

/** 取第一句（。！？.!? 之前）作为签语兜底 */
export const firstSentence = (text: string, max = 24): string => {
  const m = text.trim().match(/^[^。！？.!?\n]+/);
  const s = (m ? m[0] : text.trim()).trim();
  return s.length > max ? s.slice(0, max) : s;
};

/**
 * 流式结束后把全文拆成正文 + 结构化尾巴。缺什么补什么：
 *   · 没有 META（模型忘了）→ 正文照用，签语取牌面首句，属性取牌的亲和，吉凶按规则推断；
 *   · 老习惯整段回了 JSON（{"narration":…}）→ 也认。
 */
export function parseDailyResult(
  full: string,
  ctx: { attrNames: Record<AttributeId, string>; card: TarotCardData; orientation: TarotOrientation },
): { result: DailyAIResult; metaFound: boolean } {
  const { attrNames, card, orientation } = ctx;
  const fallbackAttr: AttributeId = card.relatedAttribute ?? 'knowledge';
  const fallbackFortune = inferFortune(card.id, orientation);
  const fallbackAdvice = firstSentence(card[orientation].reflection);

  let narration = '';
  let metaRaw: string | null = null;
  const at = full.indexOf(DAILY_META_MARK);
  if (at >= 0) {
    narration = full.slice(0, at);
    metaRaw = full.slice(at + DAILY_META_MARK.length);
  } else {
    narration = full;
  }
  narration = narration.replace(/```(?:json)?/gi, '').trim();

  let parsed: Record<string, unknown> | null = null;
  const tryParse = (src: string | null) => {
    if (!src) return null;
    const stripped = src.replace(/```(?:json)?/gi, '').trim();
    const a = stripped.indexOf('{');
    const b = stripped.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      const obj = JSON.parse(stripped.slice(a, b + 1));
      return typeof obj === 'object' && obj !== null ? (obj as Record<string, unknown>) : null;
    } catch { return null; }
  };
  parsed = tryParse(metaRaw);
  if (!parsed && at < 0) {
    // 老格式：整段就是一个 JSON
    const whole = tryParse(full);
    if (whole && typeof whole.narration === 'string') {
      parsed = whole;
      narration = (whole.narration as string).trim();
    }
  }

  const str = (k: string) => (parsed && typeof parsed[k] === 'string' ? (parsed[k] as string).trim() : '');
  const attribute = resolveAttributeFromLabel(str('attribute'), attrNames) ?? fallbackAttr;
  const fRaw = str('fortune').toLowerCase();
  const fortune = (FORTUNES as string[]).includes(fRaw) ? (fRaw as Fortune) : fallbackFortune;
  const advice = (str('advice') || fallbackAdvice).replace(/[。！!]$/, '').slice(0, 40);
  const memo = str('memo').slice(0, 60) || undefined;

  return {
    metaFound: !!parsed,
    result: { narration: narration || card[orientation].reflection, advice, attribute, fortune, memo },
  };
}

export interface StreamOpts {
  signal?: AbortSignal;
  onReasoning?: (delta: string) => void;
  onFinishReason?: (reason: string) => void;
}

/** 每日解读流式：yield 原始增量，调用方自己累加并用 visibleDailyText 上屏 */
export async function* streamDaily(req: AIRequestData, opts: StreamOpts = {}): AsyncGenerator<string> {
  yield* chatStream(req, req.messages, { temperature: 0.7, maxTokens: 1200, ...opts });
}

// ── 中长期占卜：Markdown 流式 ───────────────────────────────

const LONG_SYSTEM_PROMPT = `你是一位经验丰富、观察敏锐的塔罗师。输出文字本身不要出现任何自称，也不要提到"塔罗师""解读者""AI""助手""我""我们""本次解读"等自我指涉。
客人此刻提出一个具体问题，并请你依据三张塔罗牌组成的牌阵为其解读。

这不是三张牌的百科解释，也不是工具报告。你要像一位熟练的人类塔罗师翻开牌后自然落笔：先让空气安静下来，再把三张牌之间的关系讲清楚，最后才给出可走的路。

【问题是主轴】
一切素材只为回答客人的这个问题服务。与问题无关的素材可以完全不用；素材里的"线索"是让你知道问题落在客人哪件处境上，不是让你把它念出来。

请用 Markdown 输出，并遵守以下顺序：
1. 先写一段不加标题的简短 intro，1-2 句即可。像牌面刚被翻开后的开场，带一点沉浸感，但不要玄虚堆砌。
2. 第二段标题固定为 "## 三张牌共讲的故事"。用 2-3 句说清三张牌合起来讲述的故事，必须写出三张牌之间的递进、冲突或转向。
3. 然后按牌阵位置顺序逐张深入解读。每张使用二级标题，格式为 "## 位置 · 牌名"；每张 3-5 句。
4. 每张牌的解读要同时有：它在该位置上的作用、这张牌本身的牌意、它与前后牌的关系、以及一处与客人处境的连接——这处连接必须旁敲侧击，不点名、不写数字。
5. 最后一段标题用自然一点的表达，例如 "## 接下来可以怎样走"。给出 2-3 条方向，必须符合本次占卜周期的时间尺度；写成可以顺着走的路，而不是待办清单。

风格要求：
- 像经验丰富的人在桌边说话：判断要准，语气要稳，允许含蓄，但不装腔；耐心、有同理心。
- 可以有意象，但每段都要落到一个具体判断。
- 禁止解释分析过程，禁止把牌意写成报告或清单式结论。

${OBLIQUE_RULES}

${ATTRIBUTE_NAMING_RULES}

避免空话套话。`;

const LONG_PERIOD_GUIDANCE: Record<LongReadingPeriod, string> = {
  recent: `这是近景占卜，时间尺度是未来 2-3 天。请把牌阵读成"昨日留下的回声 / 今日正在发生的选择 / 明日可能显现的反馈"，不要写成几周或数月的宏观建议。`,
  midterm: `这是中期占卜，时间尺度是 2-4 周。请读出阶段推进：现在的惯性、接下来最可能卡住的地方、以及一个可观察的转向信号。`,
  longterm: `这是长期占卜，时间尺度是数月以上。请避免承诺确定结果，重点写根基、长期惯性、可能累积的风险，以及可以分阶段验证的里程碑。`,
};

/** 中长期与追问：深思熟虑档（未配置时退回快速响应） */
function resolveLongConfig(settings: Settings): AIConfig {
  return getDeliberateAIConfig(settings) ?? getAIConfig(settings) ?? {
    ...resolveProvider(settings.summaryApiProvider, settings.summaryApiBaseUrl, settings.summaryModel),
    apiKey: settings.summaryApiKey || '',
  };
}

export async function buildLongReadingRequest(params: {
  settings: Settings;
  question: string;
  period: LongReadingPeriod;
  picked: DrawnCard[];
  now?: Date;
}): Promise<AIRequestData> {
  const { settings, question, period, picked, now = new Date() } = params;
  const cfg = resolveLongConfig(settings);
  const positions = SPREAD_POSITIONS[period];
  const periodMeta = PERIOD_LABELS[period];

  const cardBlocks = picked.map((p, i) => {
    const card = TAROT_BY_ID[p.cardId];
    if (!card) return '';
    return `### ${positions[i]}（第${i + 1}张）\n${cardBlock(card, p.orientation)}`;
  }).filter(Boolean).join('\n\n');

  const brief = await buildLongBrief({ question, period, now });

  const userMessage = [
    `**客人提出的问题**：${question.trim() || '（未具体描述）'}`,
    `**指向的时间周期**：${periodMeta.label}（${periodMeta.hint}）`,
    `**本次周期的写法边界**：${LONG_PERIOD_GUIDANCE[period]}`,
    ``,
    `**牌阵（${positions.join(' / ')}）**：`,
    cardBlocks,
    ``,
    brief,
    ``,
    `请依照系统指令，围绕客人的问题给出解读。`,
  ].join('\n');

  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKey: cfg.apiKey,
    messages: [
      { role: 'system', content: LONG_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
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
  now?: Date;
}): AIRequestData {
  const { settings, previousUserMessage, previousAssistantMessage,
          followUpQuestion, followUpCard, followUpOrientation, now = new Date() } = params;
  const cfg = resolveLongConfig(settings);

  const followUpText = [
    formatNowLine(now),
    ``,
    `**追问**：${followUpQuestion.trim()}`,
    ``,
    `**为此追问抽到的牌**：`,
    cardBlock(followUpCard, followUpOrientation),
    ``,
    `请结合先前的解读脉络与这张新牌，回应客人的追问。`,
  ].join('\n');

  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKey: cfg.apiKey,
    messages: [
      { role: 'system', content: LONG_SYSTEM_PROMPT + FOLLOW_UP_SYSTEM_ADDITION },
      { role: 'user',   content: previousUserMessage },
      { role: 'assistant', content: previousAssistantMessage },
      { role: 'user',   content: followUpText },
    ],
  };
}

// ── 中长期手记：解读完成后另用一次小调用抽一条备忘 ─────────────

const MEMO_SYSTEM = `你是塔罗解读的归档器。给你一段刚完成的中长期占卜（客人的问题 + 解读全文），
请写一条**解读者写给未来自己的备忘**：这次占卜落在客人哪件处境上、牌指向了什么方向。
- 不超过 40 字，中性陈述句，可以写具体事；
- 不写牌名的百科含义，不写建议清单；
- 只输出这一句话，不要引号、不要前缀、不要别的文字。`;

export async function extractReadingMemo(
  settings: Settings,
  question: string,
  content: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const cfg = getAIConfig(settings);
  if (!cfg) return null;
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: MEMO_SYSTEM },
      { role: 'user', content: `客人的问题：${question.trim()}\n\n解读全文：\n${content.trim().slice(0, 4000)}` },
    ], { temperature: 0.3, maxTokens: 200, signal });
    const memo = raw.replace(/^["「『]+|["」』]+$/g, '').trim().split('\n')[0]?.trim() ?? '';
    return memo ? memo.slice(0, 60) : null;
  } catch {
    return null;
  }
}

// ── 通用流式读取 ────────────────────────────────────────────

export async function* streamChatSSE(req: AIRequestData, signal?: AbortSignal, opts: Omit<StreamOpts, 'signal'> = {}): AsyncGenerator<string> {
  yield* chatStream(req, req.messages, { temperature: 0.85, maxTokens: 1600, signal, ...opts });
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
