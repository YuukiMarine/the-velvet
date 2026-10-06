import { AttributeId, PersonaSkill, Settings } from '@/types';
import { chatComplete, chatStream, getAIConfig, getDeliberateAIConfig, rateLimitWaitMs, type AIConfig } from '@/utils/aiClient';
import type { MoonRevealData } from '@/battle/moonBoss';
export type { MoonRevealData };
import { SKILL_EFFECT_MAP } from '@/constants';
import { extractJSON, tryExtractJSON, jsonLooksClosed } from '@/utils/aiJson';
import { isNetworkError, NET_RETRY_MAX, waitBeforeNetRetry, sleepAbortable } from '@/utils/aiNet';

/** 被限流后最多再等几轮（Retry-After 或 10s → 20s → 40s）；紧急修复 #3：Kimi 召唤 429 */
const RATE_RETRY_MAX = 3;

interface AIMessage { role: 'system' | 'user' | 'assistant'; content: string; }

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

// ── 属性特化副效果说明（注入到 AI prompt） ───────────────────────────────────
// Lv4 debuff 和 Lv5 attack_boost 在不同属性下会触发 SKILL_EFFECT_MAP 里的不同效果
// （例如温柔 attack_boost = 护盾、魅力 = 共鸣）。不告诉 AI 的话，AI 会按 prompt 的
// 通用文案写"增伤/易伤"，导致 name/description 和实际触发的效果脱节。

/** 单属性：用在 reshuffle / 单属性技能生成 */
function formatSingleAttrSpecialization(attr: AttributeId, attrName: string): string {
  const debuff = SKILL_EFFECT_MAP[attr]?.debuff;
  const boost = SKILL_EFFECT_MAP[attr]?.attack_boost;
  const debuffLine = debuff
    ? `- Lv4 debuff → ${debuff.icon} ${debuff.label}：${debuff.hint}`
    : '- Lv4 debuff → 默认易伤：Shadow 下次受伤 +30%';
  const boostLine = boost
    ? `- Lv5 attack_boost → ${boost.icon} ${boost.label}：${boost.hint}`
    : '- Lv5 attack_boost → 默认增伤：3 回合内自身伤害 +6';
  return [
    `【"${attrName}"属性的专属副效果（Lv4/Lv5 的技能名称与描述必须呼应这些真实触发的效果，而不是写成通用的"增伤/易伤"）】`,
    debuffLine,
    boostLine,
    '- Lv5 charge（若出现）：蓄力，下回合伤害 ×2（所有属性统一）',
  ].join('\n');
}

/** 全量：用在 5 属性一次性生成 */
function formatAllAttrsSpecialization(attrNames: Record<AttributeId, string>): string {
  const debuffLines: string[] = [];
  const boostLines: string[] = [];
  ATTRS.forEach(attr => {
    const debuff = SKILL_EFFECT_MAP[attr]?.debuff;
    const boost = SKILL_EFFECT_MAP[attr]?.attack_boost;
    const name = attrNames[attr];
    debuffLines.push(
      debuff
        ? `  · ${name} → ${debuff.icon} ${debuff.label}：${debuff.hint}`
        : `  · ${name} → 默认易伤：Shadow 下次受伤 +30%`,
    );
    boostLines.push(
      boost
        ? `  · ${name} → ${boost.icon} ${boost.label}：${boost.hint}`
        : `  · ${name} → 默认增伤：3 回合内自身伤害 +6`,
    );
  });
  return [
    '【属性特化 —— 重要】',
    '每个属性的 Lv4 debuff 和 Lv5 attack_boost 会触发专属副效果。请让技能名称和描述明确呼应该属性的真实效果，而不是按通用的"增伤/易伤"写。',
    'Lv4 debuff 在各属性下的实际效果：',
    ...debuffLines,
    'Lv5 attack_boost 在各属性下的实际效果：',
    ...boostLines,
    'Lv5 charge（若出现）：所有属性统一，蓄力后下回合伤害 ×2',
  ].join('\n');
}

// getAIConfig / 传输 / SSE 解析 / 超时 现已统一由 @/utils/aiClient 提供。
// callAI 只剩一层薄封装，保留 battleAI 特有的「失败降温重试」语义；
// 长 JSON 生成（召唤 / 显形 / 伪神）走下面的 streamJSONResilient。

async function callAI(
  cfg: AIConfig,
  messages: AIMessage[],
  temperature = 0.8,
  maxTokens = 1500,
  jsonMode = false,
  instant = false,
): Promise<string> {
  return chatComplete(cfg, messages, { temperature, maxTokens, jsonMode, instant });
}

// ── JSON 抽取：公共实现在 utils/aiJson（第 4 轮统一，各调用点共用）────────────
// （旧的 repairTruncatedJSON / escapeInnerQuotes / fixMissingCommas / extractJSON 原样搬过去，行为不变）

/**
 * 这些错误再试也是同一个结果，别拿用户的钱和时间去撞：
 *   401/403 Key 不对、402 余额不足、404 模型不存在、413/422 请求本身不合法、429 已经被限流、
 *   以及调用方主动取消。400 只在「开着 json_object 模式」那一级放行——有些服务商就是不认这个字段。
 */
function shouldRetryAIError(e: unknown, jsonModeWasOn: boolean): boolean {
  if (e instanceof Error && e.name === 'AbortError') return false;
  const m = e instanceof Error ? e.message : String(e);
  if (/HTTP (401|402|403|404|413|422|429)\b/.test(m)) return false;
  if (/HTTP 400\b/.test(m)) return jsonModeWasOn;
  // 超时 / 5xx / 网络 / 空响应 / 思维链吃光预算 / 格式坏了 → 值得换个参数再来一发
  return true;
}

/**
 * 带重试的调用。
 *
 * json=true 时走三级梯子：严格 JSON 模式 → 关掉 JSON 模式（有些 provider 直接 400，
 * 或 DeepSeek 那种"开了反而吐空"）→ 降温再试。全站要 JSON 的战场调用都该开，
 * 这是与 store/navigatorIntent 已有的 jsonMode 兜底同一套口径。
 * 第 4 轮改动：只重试值得重试的失败（超时 / 5xx / 网络 / 空响应 / 坏 JSON）；
 * 401、402、404、429 一类立刻抛，不再连撞三次（最坏一次要等 15 分钟）；
 * json=true 时每一级都先验一遍抽得出 JSON，抽不出才算失败去下一级。
 * 抛出的是**最后一次**的错误：真正的失败原因在最后一次里。
 */
async function callAIWithRetry(
  cfg: AIConfig,
  messages: AIMessage[],
  temperature = 0.8,
  maxTokens = 1500,
  json = false,
  instant = false,
): Promise<string> {
  const cooler = Math.max(0.3, temperature - 0.3);
  const ladder: Array<[number, boolean]> = json
    ? [[temperature, true], [temperature, false], [cooler, false]]
    : [[temperature, false], [cooler, false]];
  let lastErr: unknown;
  for (const [t, j] of ladder) {
    try {
      const raw = await callAI(cfg, messages, t, maxTokens, j, instant);
      if (json && !tryExtractJSON(raw)) {
        lastErr = new Error('AI 返回的 JSON 格式无效，请重试');
        continue;
      }
      return raw;
    } catch (e) {
      lastErr = e;
      if (!shouldRetryAIError(e, j)) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI 调用失败');
}


// ── 流式 JSON + 续写（v2.7.0.6：区层显形 / 伪神显形改走这条）──────────────────
//
// 非流式调用有 90 秒硬超时；深思熟虑档（v4-pro 一类）思考 2～4 分钟一个字节都不来，
// 于是"仪式失败率高、转圈四分半后报错"。流式通道的超时是**空闲**超时，思维链增量会续命。
// JSON 被截断（finish_reason=length）时不再整轮报废：抛 JSONTruncatedError 带着半截，
// 仪式卡出「让它说完」——把半截当 assistant 回传，让模型从断处续，再拼起来解析。

export class JSONTruncatedError extends Error {
  partial: string;
  constructor(partial: string) {
    super('输出在中途被截断，可以让它接着说完');
    this.name = 'JSONTruncatedError';
    this.partial = partial;
  }
}

export interface StreamJSONOpts {
  /** 这条请求被限流（429）了：调用方可据此把并行的几路收成串行 */
  onRateLimit?: () => void;
  /** 显示用的累计文本（思维链 + 正文都进来，喂滚动预览） */
  onProgress?: (shown: string) => void;
  signal?: AbortSignal;
  /** 上一次截断的半截：续写 */
  resumeFrom?: string;
  /** 测试 / 特殊场合覆盖正文预算 */
  maxTokens?: number;
  /** DeepSeek 全程关思考：单属性补位这种小请求不值得想两分钟（别家关不掉，原样） */
  noThinking?: boolean;
}

const RESUME_INSTRUCTION = '你的 JSON 输出在中途被截断了。请从截断处直接接着输出剩余部分：不要重复已经输出的内容，不要重新开头，不要解释，直到 JSON 闭合。';
/** 模型答非所问（反问 / 解释 / 客套）时的纠正语：带着它那条回复再要一次 */
const JSON_ONLY_INSTRUCTION = '上一条回复不是要求的 JSON。不要提问、不要解释、不要客套，直接按要求的格式只输出那一个 JSON 对象。';

/**
 * 韧性流式（v2.7.0.6，召唤 / 显形 / 伪神共用）。
 *
 * 用户反馈「生成容易在最后卡住然后跳出来失败」，实测拆开是几件事叠在一起：
 *   ① 手机上等两三分钟，用户切出 App → 系统挂起网页 → 流被掐断。之前断了就整份作废，
 *      再退到非流式整份重来（思考型模型两三分钟，非流式 90 秒硬超时必挂），画面停在最后几行。
 *   ② 输出被 max_tokens 截断在结尾（思考吃掉了预算）。
 *   ③ 写完了但 JSON 有瑕疵（没转义的引号、漏逗号）。
 * 这里的处理：
 *   · 已经写出正文 → 把半截当 assistant 回传，从断处续写（最多 maxResumes 次）；
 *     DeepSeek 续写时关掉思考，几秒就接上，不用再想两分钟；
 *   · 正文还没开始就断了（死在思考阶段）→ 重新开始一次；流式一个字节都拿不到 → 退非流式一次；
 *   · 写完了但解析失败 → 先走本地修复（extractJSON 的几种修法），不拿它去续写；
 *   · 关键字段齐了就收，没齐但写完了就把能用的交回去，由调用方补默认值。
 * 第 12 轮（召唤 0/5「Failed to fetch」实锤）再加两条：
 *   · 网络层失败（没连上 / 中途断开）→ 退避 1.5s → 3s → 6s 再来，离线 / 在后台时等回来再发，
 *     不占续写 / 重启的次数（以前是立刻连撞，断网那一秒里全撞光）；
 *   · 模型答非所问（反问 / 解释，正常收尾却没有 JSON）→ 带着它那条回复再要一次「只输出 JSON」，
 *     只纠正一次（以前当场判死）。
 */
async function streamJSONResilient(
  cfg: AIConfig,
  prompt: string,
  temperature: number,
  maxTokens: number,
  opts: StreamJSONOpts & { maxResumes?: number; maxRestarts?: number; parse?: (text: string) => Record<string, unknown> | null },
  essential: (parsed: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  const parse = opts.parse ?? tryExtractJSON;
  const maxResumes = opts.maxResumes ?? 2;
  const maxRestarts = opts.maxRestarts ?? 1;
  let full = opts.resumeFrom ?? '';
  let shown = full;
  let resumes = 0, restarts = 0, netRetries = 0, rateRetries = 0, triedNonStream = false;
  /** 模型答非所问（反问 / 解释）的那条回复：带着它再要一次「只输出 JSON」，只纠正一次 */
  let correction: string | null = null;
  let corrected = false;
  const push = (d: string) => { shown += d; opts.onProgress?.(shown); };
  const note = (t: string) => push(`\n${t}\n`);

  for (;;) {
    const resuming = full.trim().length > 0;
    const base: AIMessage[] = correction !== null
      ? [
          { role: 'user', content: prompt },
          { role: 'assistant', content: correction },
          { role: 'user', content: JSON_ONLY_INSTRUCTION },
        ]
      : [{ role: 'user', content: prompt }];
    const messages: AIMessage[] = resuming
      ? [...base, { role: 'assistant', content: full }, { role: 'user', content: RESUME_INSTRUCTION }]
      : base;
    // DeepSeek 关思考：续写 / 纠正只是把 JSON 接完或照格式重写，不值得再想一遍；
    // noThinking 的小请求全程不想（别家关不掉，原样）
    const skipThinking = cfg.provider === 'deepseek' && (resuming || correction !== null || !!opts.noThinking);
    let finish = '';
    let err: unknown = null;
    let cont = '';
    let sawAny = false;
    try {
      for await (const delta of chatStream(cfg, messages, {
        temperature,
        maxTokens: opts.maxTokens ?? maxTokens,
        signal: opts.signal,
        onReasoning: d => { sawAny = true; push(d); },
        onFinishReason: r => { finish = r; },
        extraBody: skipThinking ? { thinking: { type: 'disabled' } } : undefined,
      })) {
        sawAny = true;
        cont += delta;
        push(delta);
      }
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      err = e;
    }
    full = resuming ? mergeContinuation(full, cont) : cont;

    // 续写的模型偶尔会从头重写一份：两份都试
    let parsed = parse(full);
    if (resuming && !(parsed && essential(parsed))) {
      const alone = parse(cont);
      if (alone && essential(alone)) { full = cont; parsed = alone; }
    }
    if (parsed && essential(parsed)) return parsed;

    const hasContent = full.includes('{') && full.trim().length > 20;
    // ── 网络层失败（没连上 / 中途断开，见 aiNet）：退避后再来，不占续写 / 重启的次数 ──
    //    有半截就从断处续（下一轮 resuming），没有就从头来；离线 / 在后台时等回来再发。
    if (err && isNetworkError(err) && netRetries < NET_RETRY_MAX) {
      netRetries++;
      note(`（网络断了，等一下再试 ${netRetries}/${NET_RETRY_MAX}）`);
      await waitBeforeNetRetry(netRetries - 1, opts.signal);
      if (opts.signal?.aborted) throw err;
      continue;
    }
    // ── 被限流（429 / 过载 503）：按 Retry-After 或 10s → 20s → 40s 等，再从同一步接着来（紧急修复 #3）。
    //    以前 429 落到下面的「换非流式 → 重开」，几秒内连发三次，Moonshot 这种每分钟 3 次、并发 1 的账号越撞越死。
    //    不占续写 / 重启的次数；通知调用方把并行通道收成串行。
    {
      const waitMs = err ? rateLimitWaitMs(err, rateRetries) : null;
      if (waitMs != null && rateRetries < RATE_RETRY_MAX) {
        rateRetries++;
        opts.onRateLimit?.();
        note(`（服务商限流，等 ${Math.ceil(waitMs / 1000)} 秒再试 ${rateRetries}/${RATE_RETRY_MAX}）`);
        await sleepAbortable(waitMs, opts.signal);
        if (opts.signal?.aborted) throw err;
        continue;
      }
    }
    const truncated = !!err || finish === 'length' || (finish !== 'stop' && !jsonLooksClosed(full));
    // ── 答非所问：正常收尾、写了字、却没有可解析的 JSON（反问 / 解释 / 道歉，或整段 JSON 本地修不好）
    //    → 把它那条当 assistant 回传，再要一次「只输出 JSON」，只纠正一次。
    if (!err && !resuming && !corrected && finish !== 'length' && cont.trim().length > 0 && !parsed && !(truncated && hasContent)) {
      corrected = true;
      correction = cont;
      full = '';
      note('（模型没有按 JSON 作答，要求它只输出 JSON 再来一次）');
      continue;
    }
    if (truncated && hasContent && resumes < maxResumes) {
      resumes++;
      note(`（${err ? '连接断了' : '写到一半被截断'}，从断处接着写 ${resumes}/${maxResumes}）`);
      continue;
    }
    if (!hasContent && err) {
      if (!sawAny && !triedNonStream) {
        // 流式通道一个字节都没拿到（部分网关 / 开了 json 模式的思考模型会这样）→ 换非流式试一次
        triedNonStream = true;
        note('（流式通道没有返回，换一条路再试）');
        try {
          full = await chatComplete(cfg, base, { temperature, maxTokens: opts.maxTokens ?? maxTokens, signal: opts.signal, extraBody: skipThinking ? { thinking: { type: 'disabled' } } : undefined });
          push(full);
          const p = parse(full);
          if (p) return p;
        } catch (e2) {
          if (opts.signal?.aborted) throw e2;
          err = e2;
          // 非流式那一发也被限流：同样等了再来，别立刻「重新开始」再撞一次
          const waitMs = rateLimitWaitMs(err, rateRetries);
          if (waitMs != null && rateRetries < RATE_RETRY_MAX) {
            rateRetries++;
            opts.onRateLimit?.();
            note(`（服务商限流，等 ${Math.ceil(waitMs / 1000)} 秒再试 ${rateRetries}/${RATE_RETRY_MAX}）`);
            await sleepAbortable(waitMs, opts.signal);
            if (opts.signal?.aborted) throw err;
            continue;
          }
        }
      }
      if (restarts < maxRestarts) {
        restarts++;
        full = '';
        note('（连接断了，重新开始）');
        continue;
      }
      throw err;
    }
    if (parsed) return parsed;
    if (truncated && hasContent) throw new JSONTruncatedError(full);
    if (err) throw err;
    throw new Error('AI 返回的 JSON 格式无效，请重试');
  }
}

/** 续写拼接：去掉续写开头的代码块标记，以及与前文结尾重叠的那一段 */
function mergeContinuation(prev: string, cont: string): string {
  let c = cont.replace(/^\s*```(?:json|JSON)?\s*/, '');
  const tail = prev.slice(-80);
  for (let n = Math.min(tail.length, c.length); n >= 4; n--) {
    if (tail.endsWith(c.slice(0, n))) { c = c.slice(n); break; }
  }
  return prev + c;
}

// ── Persona skill validation ────────────────────────────────────────────────

const VALID_SKILL_TYPES = new Set(['damage', 'crit', 'buff', 'debuff', 'charge', 'heal', 'attack_boost']);
const EXPECTED_POWERS = [10, 15, 22, 30, 40];
const EXPECTED_COSTS = [8, 12, 18, 25, 35];

/** Validate and repair a single PersonaSkill, filling missing fields with defaults */
function repairSkill(raw: Record<string, unknown>, level: number, attrName: string, personaName: string): PersonaSkill {
  const defaultTypes: PersonaSkill['type'][] = ['damage', 'crit', 'buff', 'debuff', 'attack_boost'];
  return {
    level,
    name: (typeof raw.name === 'string' && raw.name) ? raw.name : `${attrName}之力 Lv${level}`,
    description: (typeof raw.description === 'string' && raw.description) ? raw.description : `${personaName}释放${attrName}的力量`,
    type: (typeof raw.type === 'string' && VALID_SKILL_TYPES.has(raw.type)) ? raw.type as PersonaSkill['type'] : defaultTypes[level - 1],
    power: (typeof raw.power === 'number' && raw.power > 0) ? raw.power : EXPECTED_POWERS[level - 1],
    spCost: (typeof raw.spCost === 'number' && raw.spCost > 0) ? raw.spCost : EXPECTED_COSTS[level - 1],
  };
}

/** Validate and repair an array of 5 skills for one attribute */
function repairSkills(rawSkills: unknown, attrName: string, personaName: string): PersonaSkill[] {
  const arr = Array.isArray(rawSkills) ? rawSkills : [];
  return Array.from({ length: 5 }, (_, i) => {
    const raw = (arr[i] && typeof arr[i] === 'object') ? arr[i] as Record<string, unknown> : {};
    return repairSkill(raw, i + 1, attrName, personaName);
  });
}

// ── Anti-repetition: diversity hints ────────────────────────────────────────

const CULTURE_POOLS = [
  '优先从东亚文化（中国/日本/韩国）中选取人物',
  '优先从北欧神话或凯尔特传说中选取人物',
  '优先从印度/波斯/阿拉伯文化圈中选取人物',
  '优先从美洲原住民/非洲神话中选取人物',
  '优先从古典希腊罗马文明中选取人物',
  '优先从近现代（19-20世纪）历史人物中选取',
  '优先从文艺复兴或启蒙时代的人物中选取',
  '优先从古代两河流域/埃及文明中选取人物',
];

function getDiversityHint(): string {
  return CULTURE_POOLS[Math.floor(Math.random() * CULTURE_POOLS.length)];
}

// ── Persona generation ──────────────────────────────────────────────────────

/**
 * 单属性人格的 prompt —— 规模刻意做成和「设置 → Persona 洗牌」一个量级
 * （~1600 tokens、非流式、只要一个属性），那条路在用户环境里是实测可用的。
 * 五属性一次成型失败时用它逐个补，见 generatePersonaSkills ②。
 */
function buildOneAttrPrompt(attrName: string, attr: AttributeId, context: string, diversityHint: string): string {
  return `你是Persona系列游戏的人格解析师。根据反抗者（用户）的问答，为"${attrName}"属性匹配一位最贴切的Persona人物。

【反抗者问答记录】
${context}

【要求】
1. 必须是真实存在或有据可查的一位人物（历史人物/神话人物/文学角色/宗教传说人物）
2. 人物选择必须基于上面的问答内容，而不是套用通识性的大众例子
3. 文化偏好提示：${diversityHint}
4. 禁止在名字后加"之灵""之影""化身"这类后缀

技能规格：level 1-5，power=10/15/22/30/40，spCost=8/12/18/25/35
技能类型（7种）：damage/crit/buff/debuff/charge/heal/attack_boost

${formatSingleAttrSpecialization(attr, attrName)}

五技能分布（level顺序）：damage / crit / buff或heal / debuff / attack_boost或charge
技能名称和描述须体现该人物的标志性事迹或特质

纯JSON输出，不含代码块和注释：
{"name":"真实人物名","description":"一句话说明该人物与反抗者${attrName}特质的契合点","skills":[{"level":1,"name":"技能名","description":"技能描述","type":"damage","power":10,"spCost":8},{"level":2,"name":"技能名","description":"技能描述","type":"crit","power":15,"spCost":12},{"level":3,"name":"技能名","description":"技能描述","type":"buff","power":22,"spCost":18},{"level":4,"name":"技能名","description":"技能描述","type":"debuff","power":30,"spCost":25},{"level":5,"name":"技能名","description":"技能描述","type":"attack_boost","power":40,"spCost":35}]}`;
}

/**
 * 召唤的解析：整份能解析就用整份；解析不了就**按属性逐个抢救**——
 * 在原文里找到 "knowledge": { … } 这样的块，按括号配平切出来单独解析。
 * 一条技能描述里多了个没转义的引号，不该连累另外四个属性一起作废。
 */
function parsePersonaJSON(text: string): Record<string, unknown> | null {
  const whole = tryExtractJSON(text);
  if (whole && ATTRS.some(a => whole[a])) return whole;
  const out: Record<string, unknown> = {};
  for (const attr of ATTRS) {
    const m = new RegExp(`"${attr}"\\s*:\\s*\\{`).exec(text);
    if (!m) continue;
    const start = m.index + m[0].length - 1;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const block = tryExtractJSON(end > 0 ? text.slice(start, end + 1) : text.slice(start));
    if (block) out[attr] = block;
  }
  return Object.keys(out).length ? out : null;
}

/** 召唤中途已经唤出的部分：失败时交回界面，下次只补缺的（第 12 轮 D：失败不清零） */
export interface PersonaSummonPartial {
  skills: Partial<Record<AttributeId, PersonaSkill[]>>;
  attributePersonas: Partial<Record<AttributeId, { name: string; description: string }>>;
  okAttrs: AttributeId[];
}

export interface PersonaSummonResult {
  personaName: string;
  skills: Record<AttributeId, PersonaSkill[]>;
  attributePersonas: Record<AttributeId, { name: string; description: string }>;
  usedFallback: boolean;
  errorMessage?: string;
  /** 收下了（≥3/5）但没唤出来、用默认技能补位的属性——界面提示一句，别静默 */
  missingAttrs: AttributeId[];
  /** 失败时：已经唤出的部分，下次作为 resumeFrom 传回来只补缺的 */
  partial?: PersonaSummonPartial;
}

/** 分属性补位的并行路数：以前 5 路齐发，断网那一秒 15 次 fetch 一起撞光；2 路够快也不挤 */
const LANE_PARALLEL = 2;

export async function generatePersonaSkills(
  settings: Settings,
  fallbackName: string,
  attributeNames: Record<AttributeId, string>,
  dialogHistory: string[],
  onStreamChunk?: (delta: string, fullText: string) => void,
  /** 上一次失败交回的部分：跳过整份，只补缺的属性 */
  resumeFrom?: PersonaSummonPartial,
): Promise<PersonaSummonResult> {
  /**
   * 人格生成走**深思熟虑档**，不走快速响应档。
   *
   * aiClient 里 getDeliberateAIConfig 的注释一直把"人格生成"列在这一档，
   * 但统一 API Provider 之后这里漏改，还挂在 getAIConfig 上——于是它跟着
   * 「记账解析 / 塔罗单抽 / 打分」一起被钉死在各家最便宜的那个默认模型上
   * （deepseek-v4-flash / gemini-3.1-flash-lite / gpt-5.4-mini）。
   * 而这个请求要的是一份 5 属性 × 5 技能、全中文、纯 JSON 的长输出，
   * 廉价档既容易吐不完整（validAttrCount<3 → 判失败）也容易破格式，
   * 就是用户上报的「召唤 Persona 失败几率变得非常高」。
   * 没单独配深思熟虑档的用户会自动落回快速响应档，行为与改前一致。
   */
  const cfg = getDeliberateAIConfig(settings);
  /** 紧急修复 #3：整份或某一路被限流后，分属性补缺改为串行 */
  let serializeLanes = false;
  if (!cfg) return {
    personaName: fallbackName,
    skills: generateDefaultSkills(fallbackName, attributeNames),
    attributePersonas: generateDefaultAttributePersonas(fallbackName, attributeNames),
    usedFallback: true,
    errorMessage: '未配置 AI API Key',
    missingAttrs: [...ATTRS],
  };

  const context = dialogHistory.join('\n\n');
  const diversityHint = getDiversityHint();
  const prompt = `你是Persona系列游戏的人格解析师。请仔细阅读反抗者（用户）的五轮问答，深度解析其价值观、性格底色、行为倾向，然后从人类历史与文化中找出最精准契合的五个Persona。

【反抗者问答记录】
${context}

【属性与名称对应】
${ATTRS.map(a => `${a} → ${attributeNames[a]}`).join('\n')}

【Persona选择原则】
每个属性的Persona必须是真实存在或有据可查的一位人物：
- 历史人物（科学家/哲学家/将领/艺术家等）
- 神话体系中的神明或英雄（任意文化皆可）
- 经典文学、史诗、戏剧中的标志性角色
- 宗教传说中的著名人物
禁止：名字后的任何后缀如"之灵""之影""化身"，禁止输出"某类人"或"某个流派的学者们"之类的复数人。

【关键要求】
1. 五个人物必须真正基于用户的具体回答来选择——不同的答案应当产生截然不同的人物组合
2. 从用户的文字中提炼出他/她独特的气质关键词，再据此匹配最贴切的人物
3. 五个人物尽量跨越不同时代、地域、文化，避免过度集中于同一文明
4. 人物选择要有新意，避免反复使用过于大众化的通识性例子
5. 本次生成的文化偏好提示：${diversityHint}

技能规格：level 1-5，power=10/15/22/30/40，spCost=8/12/18/25/35
技能类型说明（7种）：
- damage：直接伤害
- crit：暴击型（有概率双倍伤害+积累Shadow失衡）
- buff：增益（提升下次攻击伤害+50%）
- debuff：减益（令Shadow陷入易伤状态，下次受到额外30%伤害）
- charge：蓄力（下回合技能伤害翻倍，可能被Shadow打断）
- heal：治愈（回复玩家生命，回复量约为技能威力的30%，温柔属性额外加成）
- attack_boost：攻击增益（默认：按威力造成伤害，并令接下来3回合所有伤害+6，不可叠加。但不同属性下会触发专属副效果，详见下方）

${formatAllAttrsSpecialization(attributeNames)}

五技能分布（level顺序）：damage / crit / buff或heal / debuff / attack_boost或charge
技能名称和描述须体现该历史人物的标志性事迹或特质

必须使用纯JSON输出，不要包裹在代码块中，不含任何注释与额外文字：
{
  "knowledge":{"name":"真实人物名","description":"一句话说明该人物与反抗者${attributeNames['knowledge']}特质的契合点","skills":[{"level":1,"name":"技能名","description":"技能描述","type":"damage","power":10,"spCost":8},{"level":2,"name":"技能名","description":"技能描述","type":"crit","power":15,"spCost":12},{"level":3,"name":"技能名","description":"技能描述","type":"buff","power":22,"spCost":18},{"level":4,"name":"技能名","description":"技能描述","type":"debuff","power":30,"spCost":25},{"level":5,"name":"技能名","description":"技能描述","type":"attack_boost","power":40,"spCost":35}]},
  "guts":{"name":"真实人物名","description":"一句话说明契合${attributeNames['guts']}的原因","skills":[...同上格式共5个]},
  "dexterity":{"name":"真实人物名","description":"一句话说明契合${attributeNames['dexterity']}的原因","skills":[...同上格式共5个]},
  "kindness":{"name":"真实人物名","description":"一句话说明契合${attributeNames['kindness']}的原因","skills":[...同上格式共5个]},
  "charm":{"name":"真实人物名","description":"一句话说明契合${attributeNames['charm']}的原因","skills":[...同上格式共5个]}
}`;

  const skills = {} as Record<AttributeId, PersonaSkill[]>;
  const attributePersonas = {} as Record<AttributeId, { name: string; description: string }>;
  /** 真正拿到了技能数组的属性（不是被 repairSkills 兜出来的） */
  const okAttrs = new Set<AttributeId>();
  let lastErr = '';

  const takeAttr = (attr: AttributeId, d: { name?: string; description?: string; skills?: unknown } | undefined) => {
    if (Array.isArray(d?.skills) && d.skills.length >= 3) okAttrs.add(attr);
    skills[attr] = repairSkills(d?.skills, attributeNames[attr], fallbackName);
    attributePersonas[attr] = {
      name: (typeof d?.name === 'string' && d.name) ? d.name : `${attributeNames[attr]}之灵`,
      description: (typeof d?.description === 'string' && d.description) ? d.description : `${fallbackName}的${attributeNames[attr]}具现`,
    };
  };

  // ── ① 一次成型：5 属性一把出 ───────────────────────────────
  // 整段展示文本：①的思维链 + 正文，②的逐个唤起都往这里续（滚动预览只看尾巴）
  let feed = '';
  const show = (t: string) => { feed = t; onStreamChunk?.('', feed); };
  if (resumeFrom) {
    // 上一次失败留下的面先收进来（第 12 轮 D）：整份不再跑，直接补缺的
    for (const attr of resumeFrom.okAttrs) {
      const sk = resumeFrom.skills[attr];
      const ap = resumeFrom.attributePersonas[attr];
      if (!sk || !ap) continue;
      skills[attr] = sk;
      attributePersonas[attr] = ap;
      okAttrs.add(attr);
    }
    if (okAttrs.size === ATTRS.length) return { personaName: fallbackName, skills, attributePersonas, usedFallback: false, missingAttrs: [] };
    lastErr = '接着上次没唤出的面继续';
  } else try {
    /**
     * 预算 6000（曾经是 9000）。
     *
     * 这份输出实测落在 4000-5500 tokens（25 条技能的中文 name+description 约 2600 字
     * 加 JSON 结构）。9000 是"宁可多给"，但**很多服务商的单次输出上限就在 4096/8192**，
     * 超上限时不是报错、而是回一个空 completion —— 于是用户看到「卡很久 + AI 返回空响应」。
     * 6000 兜得住正常输出，又不容易撞上限；真被砍了会从断处续写（streamJSONResilient）。
     *
     * v2.7.0.6：改走韧性流式——断线续写、写完有瑕疵本地修、按属性逐个抢救；
     * 不再「流式失败 → 非流式整份重来」（思考型模型整份要两三分钟，非流式超时必挂）。
     */
    const PERSONA_MAX_TOKENS = 6000;
    const parsed = await streamJSONResilient(
      cfg, prompt, 0.6, PERSONA_MAX_TOKENS,
      { onProgress: show, parse: parsePersonaJSON, onRateLimit: () => { serializeLanes = true; } },
      p => ATTRS.every(a => Array.isArray((p[a] as { skills?: unknown } | undefined)?.skills) && ((p[a] as { skills: unknown[] }).skills.length >= 3)),
    ) as Record<string, { name?: string; description?: string; skills?: unknown }>;
    ATTRS.forEach(attr => { if (parsed[attr]) takeAttr(attr, parsed[attr]); });
    if (okAttrs.size === ATTRS.length) return { personaName: fallbackName, skills, attributePersonas, usedFallback: false, missingAttrs: [] };
    lastErr = `整份返回只解析出 ${okAttrs.size}/5 个属性`;
  } catch (e) {
    lastErr = e instanceof Error ? e.message : 'AI 调用失败（未知错误）';
  }

  // ── ② 分属性补齐：缺几个补几个，**并行**、流式 ─────────────────────
  /**
   * 为什么这条兜底是有依据的，而不是"再试一次撞运气"：
   * 同一把 Key、同一个模型下「设置 → Persona 洗牌」（一次只要一个属性）一直是好的，
   * 变量就剩「请求规模」，所以兜底退化成只要一个属性的小请求。
   *
   * v2.7.0.6：原来是五个**串行、非流式**的小请求——思考型模型每个六七十秒，
   * 串起来五六分钟，画面停在「唤起…之面」不动（用户眼里就是「卡住」），
   * 每个还顶着 90 秒硬超时。现在并行 + 流式，总耗时约等于一个。
   */
  const missing = ATTRS.filter(a => !okAttrs.has(a));
  // 预览只看尾巴：前文留最后一段就够，别让每次刷新都拖着两万字走
  const head = `${feed.slice(-300)}\n${resumeFrom ? '接着上次' : '整份没有写全'}，缺的 ${missing.length} 个面分头唤起（${LANE_PARALLEL} 个一组）——\n`;
  const lanes: Record<string, string> = {};
  const render = () => show(head + missing.map(a => `\n── 唤起「${attributeNames[a]}」之面 ──\n${(lanes[a] ?? '').slice(-400)}`).join(''));
  render();
  // 紧急修复 #3：任何一路被限流（429）后，剩下的改成逐个唤起——Moonshot 低档位账号并发只有 1，
  //  两路并行就是一路必 429；serialize 一旦置真，正在跑的那路跑完前其他路都等着
  let active = 0;
  const waitTurn = async () => { while (serializeLanes && active > 0) await sleepAbortable(300); };
  const lane = async (attr: AttributeId) => {
    try {
      const one = await streamJSONResilient(
        cfg, buildOneAttrPrompt(attributeNames[attr], attr, context, getDiversityHint()), 0.6, 1600,
        // 单属性的小请求不值得再想两分钟：DeepSeek 关思考，几秒就出（第 12 轮 E）；断网退避在 streamJSONResilient 里
        { onProgress: t => { lanes[attr] = t; render(); }, maxResumes: 1, noThinking: true, onRateLimit: () => { if (!serializeLanes) { serializeLanes = true; lanes[attr] = `${lanes[attr] ?? ''}\n（被服务商限流，剩下的面改为逐个唤起）`; render(); } } },
        p => Array.isArray(p.skills) && (p.skills as unknown[]).length >= 3,
      );
      takeAttr(attr, one as { name?: string; description?: string; skills?: unknown });
      if (!okAttrs.has(attr)) lastErr = `「${attributeNames[attr]}」的返回里没有可用的技能数组`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      lanes[attr] = `${lanes[attr] ?? ''}\n（${attributeNames[attr]} 失败：${lastErr}）`;
      render();
    }
  };
  // LANE_PARALLEL 路并行，跑完一个接下一个；限流后收成串行（见 waitTurn）
  const queue = [...missing];
  await Promise.all(Array.from({ length: Math.min(LANE_PARALLEL, queue.length) }, async () => {
    for (let attr = queue.shift(); attr; attr = queue.shift()) {
      await waitTurn();
      active++;
      try { await lane(attr); } finally { active--; }
    }
  }));
  const missingAttrs = ATTRS.filter(a => !okAttrs.has(a));
  if (okAttrs.size >= 3) {
    // 没唤出来的面用默认技能补位（以前这里直接返回，缺的属性是 undefined，战斗里会踩空）
    for (const a of missingAttrs) takeAttr(a, undefined);
    return { personaName: fallbackName, skills, attributePersonas, usedFallback: false, missingAttrs };
  }

  // 失败：已经唤出的面交回去，下次只补缺的，不让用户从头再答（第 12 轮 D）
  const partial: PersonaSummonPartial = { skills: {}, attributePersonas: {}, okAttrs: [...okAttrs] };
  for (const a of okAttrs) { partial.skills[a] = skills[a]; partial.attributePersonas[a] = attributePersonas[a]; }
  return {
    personaName: fallbackName,
    skills: generateDefaultSkills(fallbackName, attributeNames),
    attributePersonas: generateDefaultAttributePersonas(fallbackName, attributeNames),
    usedFallback: true,
    errorMessage: `整份与分属性两条路都没成（${okAttrs.size}/5 有效）。最后一次的原因：${lastErr}`,
    missingAttrs,
    partial,
  };
}

// ── Default Persona data ────────────────────────────────────────────────────

function generateDefaultAttributePersonas(
  _name: string,
  _attrNames: Record<AttributeId, string>
): Record<AttributeId, { name: string; description: string }> {
  const defaultPersonas: Record<AttributeId, { name: string; description: string }> = {
    knowledge: { name: '亚里士多德', description: '古希腊哲学家，逻辑学与知识体系的奠基人' },
    guts: { name: '阿喀琉斯', description: '特洛伊战争中最勇敢的英雄，代表无畏的战士精神' },
    dexterity: { name: '莫扎特', description: '音乐天才，以精湛的技艺和创造力闻名于世' },
    kindness: { name: '甘地', description: '非暴力抵抗运动的倡导者，体现慈悲与包容' },
    charm: { name: '克利奥帕特拉', description: '埃及艳后，以智慧与魅力著称的古代政治家' },
  };
  const r = {} as Record<AttributeId, { name: string; description: string }>;
  ATTRS.forEach(attr => { r[attr] = defaultPersonas[attr]; });
  return r;
}

function generateDefaultSkills(name: string, attrNames: Record<AttributeId, string>): Record<AttributeId, PersonaSkill[]> {
  const types: Array<'damage' | 'buff' | 'debuff' | 'attack_boost'> = ['damage', 'damage', 'buff', 'debuff', 'attack_boost'];
  const powers = [10, 15, 22, 30, 40];
  const costs = [8, 12, 18, 25, 35];
  const r = {} as Record<AttributeId, PersonaSkill[]>;
  ATTRS.forEach(attr => {
    r[attr] = powers.map((p, i) => ({
      level: i + 1,
      name: `${attrNames[attr]}之力 Lv${i + 1}`,
      description: `${name}释放${attrNames[attr]}的力量`,
      type: types[i],
      power: types[i] === 'attack_boost' ? 15 : p,
      spCost: costs[i],
    }));
  });
  return r;
}

/**
 * Regenerate a single attribute's Persona via AI.
 * Returns new name, description, and skills for that attribute.
 */
export async function reshuffleAttributePersonaAI(
  settings: Settings,
  attr: AttributeId,
  attrName: string,
  currentName: string,
): Promise<{ name: string; description: string; skills: PersonaSkill[] } | null> {
  // 与 generatePersonaSkills 同族（人格生成），一起走深思熟虑档
  const cfg = getDeliberateAIConfig(settings);
  if (!cfg) return null;
  const diversityHint = getDiversityHint();
  const prompt = `你是Persona系列游戏的人格解析师。请为"${attrName}"属性重新匹配一个全新的Persona人物。

【要求】
1. 必须是真实存在或有据可查的一位人物（历史人物/神话人物/文学角色/宗教传说人物）
2. 禁止与当前人物"${currentName}"相同或过于相似
3. 文化偏好提示：${diversityHint}
4. 人物要有新意，避免过于大众化的选择

技能规格：level 1-5，power=10/15/22/30/40，spCost=8/12/18/25/35
技能类型（7种）：damage/crit/buff/debuff/charge/heal/attack_boost

${formatSingleAttrSpecialization(attr, attrName)}

五技能分布（level顺序）：damage / crit / buff或heal / debuff / attack_boost或charge
技能名称和描述须体现该人物的标志性事迹或特质

纯JSON输出，不含代码块和注释：
{"name":"真实人物名","description":"一句话说明该人物与${attrName}特质的契合点","skills":[{"level":1,"name":"技能名","description":"技能描述","type":"damage","power":10,"spCost":8},{"level":2,"name":"技能名","description":"技能描述","type":"crit","power":15,"spCost":12},{"level":3,"name":"技能名","description":"技能描述","type":"buff","power":22,"spCost":18},{"level":4,"name":"技能名","description":"技能描述","type":"debuff","power":30,"spCost":25},{"level":5,"name":"技能名","description":"技能描述","type":"attack_boost","power":40,"spCost":35}]}`;

  try {
    // 单属性 persona（人物名 + 描述 + 5技能）约 600-1200 tokens，保底 2000
    const result = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }], 0.6, 2000, true);
    const parsed = extractJSON(result) as { name?: string; description?: string; skills?: unknown };
    const name = (typeof parsed.name === 'string' && parsed.name) ? parsed.name.slice(0, 15) : attrName + '之灵';
    const description = (typeof parsed.description === 'string' && parsed.description) ? parsed.description : `${name}的${attrName}具现`;
    const skills = repairSkills(parsed.skills, attrName, name);
    return { name, description, skills };
  } catch {
    return null;
  }
}

/**
 * Generate skills for a manually-named Persona (no AI, generates default skill set).
 */
export function generateSkillsForManualPersona(
  personaName: string,
  attrName: string,
): PersonaSkill[] {
  const types: Array<PersonaSkill['type']> = ['damage', 'crit', 'buff', 'debuff', 'attack_boost'];
  const powers = [10, 15, 22, 30, 40];
  const costs = [8, 12, 18, 25, 35];
  return powers.map((p, i) => ({
    level: i + 1,
    name: `${personaName}·${attrName}之力 Lv${i + 1}`,
    description: `${personaName}释放${attrName}的力量`,
    type: types[i],
    power: types[i] === 'attack_boost' ? 15 : p,
    spCost: costs[i],
  }));
}

/**
 * Generate AI-flavored skills for a user-provided persona name + attribute.
 * 若 userDescription 非空，则作为用户对该人物与属性契合点的解读注入到提示词中，
 * 帮助 AI 更贴合用户心中的 persona 形象
 */
export async function generateAISkillsForPersona(
  settings: Settings,
  personaName: string,
  attr: AttributeId,
  attrName: string,
  userDescription?: string,
): Promise<PersonaSkill[] | null> {
  // 与 generatePersonaSkills 同族（人格生成），一起走深思熟虑档
  const cfg = getDeliberateAIConfig(settings);
  if (!cfg) return null;
  const trimmedDesc = userDescription?.trim();
  const backgroundExtra = trimmedDesc
    ? `\n用户对该人物的理解与定位："${trimmedDesc}"。请让技能设计明显地呼应这段理解，而不是仅按人物通识来设计。`
    : '';
  const prompt = `你是Persona系列游戏的技能设计师。请为Persona人物"${personaName}"设计5个与"${attrName}"属性相关的战斗技能。

【人物背景】
${personaName}是一位与"${attrName}"属性高度契合的Persona。请根据这位人物的标志性事迹、特质或传说来设计技能。${backgroundExtra}

【技能规格】
- level 1-5，对应 power=10/15/22/30/40，spCost=8/12/18/25/35
- 技能类型（7种）：damage(直接伤害) / crit(暴击型,有概率双倍伤害+积累失衡) / buff(提升下次攻击+50%) / debuff(施加易伤，实际效果见下) / charge(蓄力,下回合双倍) / heal(回复约威力30%的生命) / attack_boost(实际效果见下)

${formatSingleAttrSpecialization(attr, attrName)}

- 五技能分布（按level顺序）：damage / crit / buff或heal / debuff / attack_boost或charge
- 技能名称要有创意，体现该人物的独特风格，不要使用"之力""Lv"等后缀

纯JSON输出，不含代码块和注释：
{"skills":[{"level":1,"name":"技能名","description":"一句话描述","type":"damage","power":10,"spCost":8},{"level":2,"name":"技能名","description":"一句话描述","type":"crit","power":15,"spCost":12},{"level":3,"name":"技能名","description":"一句话描述","type":"buff","power":22,"spCost":18},{"level":4,"name":"技能名","description":"一句话描述","type":"debuff","power":30,"spCost":25},{"level":5,"name":"技能名","description":"一句话描述","type":"attack_boost","power":40,"spCost":35}]}`;

  try {
    const result = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }], 0.6, 2000, true);
    const parsed = extractJSON(result) as { skills?: unknown };
    return repairSkills(parsed.skills, attrName, personaName);
  } catch {
    return null;
  }
}

// ── Shadow generation ───────────────────────────────────────────────────────

/** Pick a weakness attribute that is different from lastWeakAttribute */
function pickWeakAttribute(lastWeak?: AttributeId): AttributeId {
  const pool = lastWeak ? ATTRS.filter(a => a !== lastWeak) : ATTRS;
  return pool[Math.floor(Math.random() * pool.length)];
}

const DEFAULT_SHADOW_LINES = [
  '你以为这就能击败我？',
  '这点伤害不过如此。',
  '有趣，继续吧。',
  '你真的了解自己吗？',
  '我是你内心的一部分！',
  '就这点实力还妄想战胜我？',
  '你在变强……但还不够。',
  '小心……我也在变强。',
];

// ── 区层显形（批2）：一次调用产出 区层名/描述 + 主影 ─────────────────────────

const STRATUM_JSON_FORMAT = `
纯JSON输出，不要包裹在代码块中，不含任何注释：
{"stratumName":"xx之域","stratumDescription":"1-2句区层氛围描述","name":"主影名称（xx之xx）","description":"主影2句描述","invertedAttributes":{"knowledge":"反向描述","guts":"反向描述","dexterity":"反向描述","kindness":"反向描述","charm":"反向描述"},"responseLines":["台词1","台词2","台词3","台词4","台词5","台词6","台词7","台词8"]}`;

export interface StratumRevealData {
  stratumName: string;
  stratumDescription: string;
  name: string;
  description: string;
  invertedAttributes: Record<AttributeId, string>;
  responseLines: string[];
  weakAttribute: AttributeId;
}

/** 已定稿的仪式材料：提示词与弱点在这一步定下，续写 / 重试都用同一份（提示词里写着弱点名，不能重掷） */
export interface PreparedStratumReveal {
  cfg: AIConfig;
  prompt: string;
  level: number;
  weakAttribute: AttributeId;
}

export function prepareStratumReveal(
  settings: Settings,
  attributeNames: Record<AttributeId, string>,
  level: number,
  attrValues: Record<AttributeId, number>,
  lastWeakAttribute: AttributeId | undefined,
  toneHints: string[],
  /** 批4 §6.7 主影主题属性（本周成长最少者 65%）；缺省不注入主题 */
  themeAttribute?: AttributeId,
): PreparedStratumReveal {
  /**
   * 与人格生成同源的问题（见 generatePersonaSkills 的注释）：这也是一份长中文 JSON，
   * 却一直挂在**快速响应档**（各家最便宜的默认模型）上。上一轮只把人格生成挪到了
   * 深思熟虑档，区层显形/伪神显形漏改，于是「战场 AI 成功率很低」还在。
   * 没单配深思熟虑档的用户会自动落回快速响应档，行为与改前一致。
   */
  const cfg = getDeliberateAIConfig(settings);
  const weakAttribute = pickWeakAttribute(lastWeakAttribute);
  if (!cfg) throw new Error('未配置 AI API Key，请前往「设置 → AI摘要」填写 API Key 后重试');

  const levelPersonality = level <= 2
    ? '语气不稳定、带有挑衅和嘲讽，像一个试探性的捣蛋鬼'
    : level <= 3
    ? '语气冷静而有压迫感，像一个洞察一切的审判者'
    : '语气绝对而傲慢，像一场降临的灾厄，台词简短有力';

  const prompt = `你是Persona系游戏的"影时间高塔"区层生成器。玩家已通关下方区层，高塔上方的第${level}区层正在显形。
玩家在显形仪式中的回应（用于定调区层与主影的气质倾向）：
${toneHints.map((t, i) => `${i + 1}. ${t}`).join('\n')}

区层心魔是玩家内心负面特质的具现，其属性为玩家属性的反向：${ATTRS.map(a => `${attributeNames[a]}=${attrValues[a]}`).join('，')}。
心魔弱点属性为"${attributeNames[weakAttribute]}"。${themeAttribute ? `\n【主题】本周玩家在"${attributeNames[themeAttribute]}"方向成长最少——心魔以此为主题气质：区层名、心魔名与台词都要围绕"${attributeNames[themeAttribute]}的缺失/荒废"展开（比如荒废知识→蒙昧之域）。` : ''}

【输出要求】
- stratumName：区层名，格式"xx之域"（体现越高越危险的塔层氛围，禁止使用现实游戏专有名词）
- stratumDescription：1-2句，写这一段塔层的景观与压迫感
- name：心魔名，格式"xx之xx"
- description：2句，心魔的阴暗面来源与危险性
- responseLines：8条战斗台词，${levelPersonality}；每条风格各异，至少含1条嘲讽、1条威胁、1条对玩家弱点的点评、1条自我宣言
${STRATUM_JSON_FORMAT}`;
  return { cfg, prompt, level, weakAttribute };
}

/** 跑仪式（流式；截断抛 JSONTruncatedError，带半截可续写） */
export async function completeStratumReveal(
  prep: PreparedStratumReveal,
  attributeNames: Record<AttributeId, string>,
  opts: StreamJSONOpts = {},
): Promise<StratumRevealData> {
  const { level, weakAttribute } = prep;
  const parsed = await streamJSONResilient(
    prep.cfg, prep.prompt, 0.7, 3200, opts,
    p => typeof p.name === 'string' && !!p.name && Array.isArray(p.responseLines) && p.responseLines.length >= 4,
  );
  const stratumName = (typeof parsed.stratumName === 'string' && parsed.stratumName) ? parsed.stratumName : `第${level}之域`;
  const stratumDescription = (typeof parsed.stratumDescription === 'string' && parsed.stratumDescription)
    ? parsed.stratumDescription
    : '月光照不进的塔层，影子在栏杆间低语。';
  const name = (typeof parsed.name === 'string' && parsed.name) ? parsed.name : `区层之主Lv${level}`;
  const description = (typeof parsed.description === 'string' && parsed.description)
    ? parsed.description
    : '盘踞在区层之巅的暗影，等待着登塔者。';
  const invertedAttributes = (parsed.invertedAttributes && typeof parsed.invertedAttributes === 'object')
    ? parsed.invertedAttributes as Record<AttributeId, string>
    : Object.fromEntries(ATTRS.map(a => [a, `缺乏${attributeNames[a]}的力量`])) as Record<AttributeId, string>;
  let responseLines: string[];
  if (Array.isArray(parsed.responseLines) && parsed.responseLines.length >= 4) {
    responseLines = parsed.responseLines.filter((l): l is string => typeof l === 'string').slice(0, 8);
    while (responseLines.length < 8) {
      responseLines.push(DEFAULT_SHADOW_LINES[responseLines.length % DEFAULT_SHADOW_LINES.length]);
    }
  } else {
    responseLines = [...DEFAULT_SHADOW_LINES];
  }
  return { stratumName, stratumDescription, name, description, invertedAttributes, responseLines, weakAttribute };
}

// ── Lv6 · 最终 BOSS「伪神」（PRD_FINAL_BOSS §3）─────────────────────────────
// 只喂结构化事实、不喂记录原文（隐私口径与 generateDefeatLetter 一致）。
// 语气红线：伪神是「指认」不是「羞辱」——每句都必须是数据支持的事实推论。

export interface FinalBossFacts {
  /** 五维等级 */
  attrLevels: Record<AttributeId, number>;
  /** 五维累计点数 */
  attrPoints: Record<AttributeId, number>;
  /** 最强属性（= 伪神弱点，叙事：它站在你最得意的地方） */
  strongest: AttributeId;
  /** 最短板属性 */
  weakest: AttributeId;
  /** 逆流衰减触发次数 */
  countercurrentCount: number;
  /** 记录总条数 / 首条记录距今天数 */
  totalRecords: number;
  daysSinceFirstRecord: number;
  /** 当前连续记录天数 / 历史最长断链天数 */
  currentStreak: number;
  longestGapDays: number;
  /** 待办：已完成 / 未完成 */
  todosDone: number;
  todosOpen: number;
  /** 宣告卡：达成 / 时之至（过期） */
  cardsAchieved: number;
  cardsExpired: number;
  /** 愿望：在途数 / 平均停留天数 */
  wishesOpen: number;
  wishAvgDays: number;
  /** 已击败心魔数 */
  shadowsDefeated: number;
}

/** 缺点档位（给 AI 的候选表；它必须从中选一个 key，避免 slug 发散到无法归档） */
export const FINAL_FLAW_KEYS: Array<{ key: string; hint: string }> = [
  { key: 'inconsistency', hint: '三分钟热度——开得多，续不上' },
  { key: 'avoidance', hint: '回避——把最重要的那件事一直往后放' },
  { key: 'perfectionism', hint: '完美主义——不够好就不肯开始/不肯交付' },
  { key: 'overreach', hint: '贪多——同时铺开太多，哪个都没到底' },
  { key: 'lopsided', hint: '偏科——只在舒服的方向上用力' },
  { key: 'selfneglect', hint: '苛待自己——只记账不记人，把自己当工具' },
  { key: 'drifting', hint: '随波——被日程推着走，没有自己选过' },
];

const FINAL_BOSS_JSON = `
纯JSON输出，不要包裹在代码块中，不含任何注释：
{"stratumName":"顶阙的名字（4-6字，不带『之域』）","stratumDescription":"1-2句这一层的景观","name":"伪神 · xx","flawKey":"从候选表里选一个key","flawTitle":"缺点的名字（4-8字）","verdict":"一句指认，40字以内，第二人称","description":"2句形象描述","responseLines":["台词1","…","台词18"]}`;

export interface FinalBossData {
  stratumName: string;
  stratumDescription: string;
  name: string;
  flawKey: string;
  flawTitle: string;
  verdict: string;
  description: string;
  invertedAttributes: Record<AttributeId, string>;
  responseLines: string[];
  weakAttribute: AttributeId;
}

export interface PreparedFinalBoss {
  cfg: AIConfig;
  prompt: string;
  strongest: AttributeId;
}

export function prepareFinalBoss(
  settings: Settings,
  attributeNames: Record<AttributeId, string>,
  f: FinalBossFacts,
): PreparedFinalBoss {
  /** 同区层显形：深思熟虑档；没配就退回快速响应档 */
  const cfg = getDeliberateAIConfig(settings);
  if (!cfg) throw new Error('未配置 AI API Key，请前往「设置 → AI摘要」填写 API Key 后重试');

  const facts = [
    `五维等级：${ATTRS.map(a => `${attributeNames[a]}Lv${f.attrLevels[a]}(${f.attrPoints[a]}点)`).join('，')}`,
    `最强：${attributeNames[f.strongest]}；最短板：${attributeNames[f.weakest]}`,
    `记录：共${f.totalRecords}条，第一条在${f.daysSinceFirstRecord}天前；当前连续${f.currentStreak}天，历史最长断链${f.longestGapDays}天`,
    `逆流衰减触发${f.countercurrentCount}次`,
    `待办：完成${f.todosDone}，未完成${f.todosOpen}`,
    `宣告卡：达成${f.cardsAchieved}，过期${f.cardsExpired}`,
    `愿望：在途${f.wishesOpen}个，平均停留${f.wishAvgDays}天`,
    `已击败心魔${f.shadowsDefeated}只`,
  ].join('\n');

  const prompt = `你是Persona系游戏的最终BOSS生成器。玩家已经攻克了影时间高塔的全部五个区层，塔顶之上显形了最后一层——那里站着"伪神"：一个由玩家自己的记录喂养出来的、冒充神明的东西。它读得懂玩家的全部数据，并以玩家最主要的那一个缺点为形。

【玩家的事实档案】
${facts}

【候选缺点档位】（flawKey 必须严格取其中一个 key）
${FINAL_FLAW_KEYS.map(k => `- ${k.key}：${k.hint}`).join('\n')}

【任务】
1. 从上面的事实里推断出玩家最主要的一个缺点，选一个 flawKey，并给它一个 flawTitle（玩家能一眼认出自己的说法）。
2. verdict 是伪神对玩家的一句指认，40字以内，第二人称。必须能从事实里推出来（可以引用具体数字），冷静、精准、不留情面。
3. responseLines 需要18条，用于终局演出中它连挨18次记录攻击时的反应：前6条是傲慢与不屑，中6条是开始动摇、试图否认与讨价还价，后6条是气急败坏与崩解。每条不超过25字。

【语气红线 —— 必须遵守】
- 伪神是"指认"，不是"羞辱"。它说的每句话都要有事实依据，不许人身攻击、不许下"你这个人不行"这类总体否定。
- 不许绝望化、不许提及自伤或死亡，不许劝退。
- 它是要被打败的：全程不能出现玩家无法反驳的终局审判语气，最后几条要透出它自己的心虚。
- 禁止出现任何现实游戏的专有名词。
${FINAL_BOSS_JSON}`;
  return { cfg, prompt, strongest: f.strongest };
}

export async function completeFinalBoss(
  prep: PreparedFinalBoss,
  attributeNames: Record<AttributeId, string>,
  opts: StreamJSONOpts = {},
): Promise<FinalBossData> {
  const f = { strongest: prep.strongest };
  const parsed = await streamJSONResilient(
    prep.cfg, prep.prompt, 0.75, 3600, opts,
    p => typeof p.name === 'string' && !!p.name && typeof p.verdict === 'string' && Array.isArray(p.responseLines) && p.responseLines.length >= 6,
  );
  const str = (v: unknown, fallback: string, max = 200) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;

  const flawKey = FINAL_FLAW_KEYS.some(k => k.key === parsed.flawKey)
    ? String(parsed.flawKey)
    : 'inconsistency';
  let responseLines: string[] = Array.isArray(parsed.responseLines)
    ? parsed.responseLines.filter((l): l is string => typeof l === 'string' && !!l.trim()).map(l => l.trim())
    : [];
  // 终局演出要的是恰好 18 条：不足补池、超出截断
  while (responseLines.length < 18) {
    responseLines.push(FINAL_TAUNT_FALLBACK[responseLines.length % FINAL_TAUNT_FALLBACK.length]);
  }
  responseLines = responseLines.slice(0, 18);

  return {
    stratumName: str(parsed.stratumName, '顶阙', 12),
    stratumDescription: str(parsed.stratumDescription, '再往上没有台阶了。这里只有一张替你写好的结论，和坐在结论上的那个东西。'),
    name: str(parsed.name, '伪神 · 无名', 20),
    flawKey,
    flawTitle: str(parsed.flawTitle, FINAL_FLAW_KEYS.find(k => k.key === flawKey)?.hint.split('——')[0] ?? '未竟', 16),
    verdict: str(parsed.verdict, '你开始过很多次。你只是很少走到第二次。', 60),
    description: str(parsed.description, '它戴着神的形状，用的却全是你的材料——你写下的每一条、你没写完的每一条。'),
    invertedAttributes: (parsed.invertedAttributes && typeof parsed.invertedAttributes === 'object')
      ? parsed.invertedAttributes as Record<AttributeId, string>
      : Object.fromEntries(ATTRS.map(a => [a, `冒充成神的${attributeNames[a]}`])) as Record<AttributeId, string>,
    responseLines,
    // 弱点 = 玩家最强属性：它站在你最得意的地方，你也只能从那里把它拆下来
    weakAttribute: f.strongest,
  };
}

/** 18 条挑衅的兜底池（AI 少给时补齐；顺序即傲慢→动摇→崩解） */
export const FINAL_TAUNT_FALLBACK = [
  '就这些？你翻出来的都是些什么。',
  '一条记录而已。它救不了你。',
  '我读过它。写的时候你就已经想放弃了。',
  '继续啊。反正后面也没有了。',
  '你在拿过去当武器？过去是我的。',
  '这些字是你写的，可你早就不认得了。',
  '……等等。这一条我没有算进去。',
  '不对。你那天明明已经停了。',
  '那不算数。那天只是运气。',
  '你根本不记得这件事——别装。',
  '住手。你在翻什么？',
  '这些……你是什么时候写的？',
  '不可能。这些日子应该是空的！',
  '别再拿出来了！',
  '我是从你这里长出来的——你打我，就是打你自己！',
  '你不是一直觉得自己没做到吗？！',
  '……那你为什么还留着这些。',
  '不、不要……我还没有……',
];

// ── 满月心魔（第 6 轮 · PRD §11.6）───────────────────────────────────────
// 只喂当月结构化事实（各维点数 / 记录天数 / 类目计数 / 抽过的牌 / BIG DEAL 进展），不喂记录原文。

export interface MoonShadowFacts {
  /** YYYY-MM */
  month: string;
  attrPoints: Record<AttributeId, number>;
  recordDays: number;
  totalRecords: number;
  categoryCounts: Record<string, number>;
  tarotNames: string[];
  bigDeals: Array<{ done: number; total: number }>;
  /** 当月记得最少的属性 = 弱点 */
  weakAttribute: AttributeId;
  defeatedMoons: number;
}

export interface PreparedMoonReveal {
  cfg: AIConfig;
  prompt: string;
  weakAttribute: AttributeId;
}

const MOON_JSON_FORMAT = `
纯JSON输出，不要包裹在代码块中，不含任何注释：
{"name":"月之xx","description":"2句","invertedAttributes":{"knowledge":"...","guts":"...","dexterity":"...","kindness":"...","charm":"..."},"responseLines":["台词1","台词2","台词3","台词4","台词5","台词6","台词7","台词8"]}`;

const MOON_CATEGORY_LABELS: Record<string, string> = {
  level_up: '升级', bigdeal_step: 'BIG DEAL 推进', bigdeal_clear: 'BIG DEAL 收官', weekly_goal: '周目标达成', shadow_defeat: '击败心魔',
  countercurrent: '逆流', confidant: '同伴互动', calling_card_clear: '宣告卡达成', wish_fulfilled: '愿望实现', ledger: '记账', return: '回归',
};

function moonFactLines(f: MoonShadowFacts, names: Record<AttributeId, string>): string[] {
  const lines = [
    `${Number(f.month.slice(0, 4))} 年 ${Number(f.month.slice(5, 7))} 月（到满月这天为止）：记录 ${f.totalRecords} 条，分布在 ${f.recordDays} 天`,
    `各维点数：${ATTRS.map(a => `${names[a]} ${f.attrPoints[a]}`).join('，')}；记得最少的是「${names[f.weakAttribute]}」`,
  ];
  const cats = Object.entries(f.categoryCounts).filter(([, n]) => n > 0).map(([k, n]) => `${MOON_CATEGORY_LABELS[k] ?? k} ${n} 次`);
  if (cats.length) lines.push(`当月发生：${cats.join('，')}`);
  if (f.tarotNames.length) lines.push(`当月抽到过的牌：${f.tarotNames.join('、')}`);
  if (f.bigDeals.length) lines.push(`进行中的 BIG DEAL：${f.bigDeals.map(d => `${d.done}/${d.total} 步`).join('，')}`);
  if (f.defeatedMoons > 0) lines.push(`此前已击败 ${f.defeatedMoons} 只月度心魔`);
  return lines;
}

export function prepareMoonReveal(settings: Settings, attributeNames: Record<AttributeId, string>, facts: MoonShadowFacts): PreparedMoonReveal {
  const cfg = getDeliberateAIConfig(settings);
  if (!cfg) throw new Error('未配置 AI API Key');
  const prompt = `你是Persona系游戏"深渊回廊"的月度心魔生成器。今晚是满月，回廊底部要显形一只"月度心魔"——它由玩家这个月的行为凝成，是这个月的阴影。
【本月事实】
${moonFactLines(facts, attributeNames).map((l, i) => `${i + 1}. ${l}`).join('\n')}

心魔弱点属性固定为"${attributeNames[facts.weakAttribute]}"（这个月记得最少的一维）。

【输出要求】
- name：心魔名，必须是"月之xx"格式（xx 为 1-2 字），要能看出这个月的主题
- description：2 句，写它由本月的哪些事实凝成、危险在哪；只许引用上面的事实，不要编造具体事件
- invertedAttributes：五维各一个反向称谓（如"被月光噬去的胆量"）
- responseLines：8 条战斗台词，语气冷、像月光，简短有力；至少 1 条点评玩家本月最弱的那一维、1 条自我宣言、1 条嘲讽
${MOON_JSON_FORMAT}`;
  return { cfg, prompt, weakAttribute: facts.weakAttribute };
}

/** 跑生成（流式；截断抛 JSONTruncatedError，带半截可续写） */
export async function completeMoonReveal(prep: PreparedMoonReveal, attributeNames: Record<AttributeId, string>, opts: StreamJSONOpts = {}): Promise<MoonRevealData> {
  const parsed = await streamJSONResilient(
    prep.cfg, prep.prompt, 0.7, 2600, opts,
    p => typeof p.name === 'string' && !!p.name && Array.isArray(p.responseLines) && p.responseLines.length >= 4,
  );
  const rawName = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const name = rawName ? (rawName.startsWith('月之') ? rawName.slice(0, 5) : `月之${rawName.slice(0, 2)}`) : '月之影';
  const description = typeof parsed.description === 'string' && parsed.description ? parsed.description : '这个月的阴影在满月下凝成了形。';
  const invertedAttributes = parsed.invertedAttributes && typeof parsed.invertedAttributes === 'object'
    ? parsed.invertedAttributes as Record<AttributeId, string>
    : Object.fromEntries(ATTRS.map(a => [a, `被月光噬去的${attributeNames[a]}`])) as Record<AttributeId, string>;
  let responseLines: string[];
  if (Array.isArray(parsed.responseLines) && parsed.responseLines.length >= 4) {
    responseLines = parsed.responseLines.filter((l): l is string => typeof l === 'string').slice(0, 8);
    while (responseLines.length < 8) responseLines.push(DEFAULT_SHADOW_LINES[responseLines.length % DEFAULT_SHADOW_LINES.length]);
  } else {
    responseLines = [...DEFAULT_SHADOW_LINES];
  }
  return { name, description, invertedAttributes, responseLines, weakAttribute: prep.weakAttribute };
}

const MOON_OFFLINE_NAMES = ['月之噬', '月之潮', '月之蚀', '月之冕', '月之隙', '月之霜', '月之井', '月之钟', '月之茧', '月之棱', '月之烬', '月之渊'];
const MOON_OFFLINE_LINES = [
  '满月照着的，都是你没记下的那些夜晚。',
  '这个月你最少碰的{weak}，现在就在我手里。',
  '月亮不评判。它只是把一切照得很亮。',
  '你以为记录会保护你——它只是让影子更清楚。',
  '再来。月亮还没落。',
  '这个月的你，凝成了我。',
  '别急着回头看。回廊里没有过去，只有更深。',
  '等月亮落下，我们再算这个月的账。',
];

/** 没配 AI / 生成失败：离线模板（名字按月轮换，描述由事实拼） */
export function offlineMoonShadow(facts: MoonShadowFacts, attributeNames: Record<AttributeId, string>): MoonRevealData {
  const m = Number(facts.month.slice(5, 7)) || 1;
  const weak = attributeNames[facts.weakAttribute];
  return {
    name: MOON_OFFLINE_NAMES[(m - 1) % MOON_OFFLINE_NAMES.length],
    description: `${m} 月的 ${facts.totalRecords} 条记录在满月下凝成了它。它盘踞在你这个月记得最少的那一维——「${weak}」——的空缺处。`,
    invertedAttributes: Object.fromEntries(ATTRS.map(a => [a, `被月光噬去的${attributeNames[a]}`])) as Record<AttributeId, string>,
    responseLines: MOON_OFFLINE_LINES.map(l => l.replace('{weak}', `「${weak}」`)),
    weakAttribute: facts.weakAttribute,
  };
}

// ── Victory narrative ───────────────────────────────────────────────────────

export async function generateVictoryNarrative(
  settings: Settings,
  personaName: string,
  shadowName: string,
  level: number
): Promise<string> {
  const cfg = getAIConfig(settings);
  if (!cfg) return `你的Persona「${personaName}」击败了「${shadowName}」！\n你用成长战胜了内心的黑暗。前方还有更强大的Shadow……`;

  const customTemplate = settings.battleVictoryPromptTemplate;
  const prompt = customTemplate
    ? customTemplate.replace('{persona}', personaName).replace('{shadow}', shadowName).replace('{level}', String(level))
    : `写一段100字以内的Persona风格胜利叙事，要求：全程以第二人称"你"为主语；不使用任何括号符号（包括「」【】（）《》等）；语言充满戏剧张力；结尾暗示前方还有更强大的存在。战斗信息：你操控${personaName}，击败了${level}级Shadow ${shadowName}。`;

  try {
    return await callAIWithRetry(cfg, [{ role: 'user', content: prompt }]);
  } catch {
    return `你操控${personaName}，将Shadow ${shadowName}彻底击溃！\n黑暗在你面前碎裂，但你感知到——更深处，还有什么正在苏醒……`;
  }
}

/**
 * 批3 §4.3：召唤台词——每属性 Persona 一句，单次调用批量生成 5 条。
 * 结果缓存在 Persona.summonLines；无 Key / 失败返回 null（调用方走模板）。
 */
export async function generateSummonLines(
  settings: Settings,
  attributeNames: Record<AttributeId, string>,
  personas: Record<AttributeId, { name: string; description: string }>,
): Promise<Record<AttributeId, string> | null> {
  const cfg = getAIConfig(settings);
  if (!cfg) return null;
  const roster = ATTRS.map(a => `- ${a}（${attributeNames[a]}）：「${personas[a].name}」——${personas[a].description || '无描述'}`).join('\n');
  const prompt = `你是Persona系游戏的台词作者。玩家有五位属性 Persona，请为每一位写一句"召唤台词"——戴上面具唤出它时喊出的话。
${roster}

【要求】
- 每句 6-16 字，气势与该 Persona 的神话/人设意象强绑定；可以是宣言、低语或诗句残行
- 五句风格必须彼此不同；禁止出现"Persona/面具"字样
仅输出 JSON：{"knowledge":"…","guts":"…","dexterity":"…","kindness":"…","charm":"…"}`;
  try {
    const result = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }], 0.9, 600, true);
    const parsed = extractJSON(result);
    const out = {} as Record<AttributeId, string>;
    for (const a of ATTRS) {
      const v = parsed[a];
      if (typeof v !== 'string' || !v.trim()) return null;
      out[a] = v.trim().slice(0, 24);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * 批3 §7.3：影之评语——登塔回顾的 AI 点评（复用胜利叙事通道；可在设置关闭）。
 * R19 用户拍板：50 字太短，放到 100 字上下。
 */
export async function generateRecapComment(
  settings: Settings,
  summary: { reason: 'descend' | 'defeat' | 'clear'; floors: number; mobs: number; damage: number; maxHit: number; weakHits: number; stratumName: string },
): Promise<string | null> {
  const cfg = getAIConfig(settings);
  if (!cfg) return null;
  const reasonText = summary.reason === 'clear' ? '讨伐了区层心魔、通关区层' : summary.reason === 'defeat' ? '力竭败退（进度保留）' : '主动下塔结算';
  const prompt = `你是Persona系游戏中栖息在塔里的神秘影之声。玩家刚结束一晚"影时间高塔"攀登：${reasonText}；区层【${summary.stratumName}】；攀升${summary.floors}层、讨伐${summary.mobs}只Shadow、总伤害${summary.damage}、最大单击${summary.maxHit}、弱点命中${summary.weakHits}次。
写一段100字左右（90-120字）的点评：以影之声的口吻（低语、略带戏谑或敬意），点出这一晚最亮眼或最遗憾的一处，${summary.reason === 'defeat' ? '败退也要给出一丝不甘的鼓动' : '结尾带一点对更高处的暗示'}。不要用括号和引号，直接输出这句话。`;
  try {
    const line = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }], 0.85, 420);
    const clean = line.trim().replace(/^["「『]|["」』]$/g, '');
    // 硬上限跟着放宽：原来 prompt 要 50 字、这里再切 80，模型稍微写长一点就被拦腰截断
    return clean ? clean.slice(0, 150) : null;
  } catch {
    return null;
  }
}

/**
 * 批4 §6.6：黑猫败因信——败退当晚由黑猫写一封败因复盘站内信（战斗事件流本地拼 prompt）。
 * 无 Key / 失败 → 返回本地模板信（信必达）。
 */
export interface DefeatFacts {
  shadowName: string;
  stratumName: string;
  floor: number;          // 全塔累计层号
  damageDealt: number;
  maxSingleHit: number;
  weaknessHits: number;
  mobsDefeated: number;
  hpLostToPoisonOrThorns?: boolean;
}

export function defeatLetterFallback(f: DefeatFacts): string {
  return [
    `喵。今晚 ${f.floor}F 的事我都看见了——${f.shadowName} 把你打下来的那一下，疼吧。`,
    `但账要算清楚：你砍出了 ${f.damageDealt} 点伤害，最重的一击 ${f.maxSingleHit}，弱点戳中 ${f.weaknessHits} 次，还顺手清了 ${f.mobsDefeated} 只杂影。这些它都记得，塔也记得。`,
    `明晚把 HP 管好点，看到危险意图就防御，别嫌回合亏。它在【${f.stratumName}】等你，我也等你。`,
  ].join('\n');
}

export async function generateDefeatLetter(settings: Settings, f: DefeatFacts): Promise<string> {
  const cfg = getAIConfig(settings);
  if (!cfg) return defeatLetterFallback(f);
  const prompt = `你是Persona系游戏里的黑猫领航员（毒舌但真心为主人好）。玩家今晚在"影时间高塔"败退了，给玩家写一封100-160字的败因复盘信。
战斗事实：区层【${f.stratumName}】，倒在累计第${f.floor}层；对手是「${f.shadowName}」；本晚总伤害${f.damageDealt}、最大单击${f.maxSingleHit}、弱点命中${f.weaknessHits}次、讨伐杂影${f.mobsDefeated}只${f.hpLostToPoisonOrThorns ? '；有不少体力是被毒/反弹磨掉的' : ''}。
【要求】黑猫口吻（第一人称"我"，称玩家"你"，可带一声"喵"）；先毒舌点破最可能的败因（贪刀不防御/无视意图/回复太晚/被磨血——从事实推断一条），再给一条明晚可执行的建议，最后一句是不许认输的鼓动。不用括号不用标题，直接输出信的正文。`;
  try {
    const text = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }], 0.85, 500);
    return text.trim() || defeatLetterFallback(f);
  } catch {
    return defeatLetterFallback(f);
  }
}

/**
 * 批3 §4.4：誓约技 LLM 命名——按该属性 Persona 人设生成新技能名+描述。
 * 结果由调用方缓存到誓约石（重复装备不再调 AI）；无 Key / 失败时调用方保留模板名。
 */
export async function generateOathSkill(
  settings: Settings,
  personaName: string,
  personaDescription: string,
  attrName: string,
  oathStoneName: string,
  oathEffectText: string,
): Promise<{ name: string; description: string } | null> {
  const cfg = getAIConfig(settings);
  if (!cfg) return null;
  const prompt = `你是Persona系游戏的技能命名器。玩家将一枚「${oathStoneName}」誓约石缔结给了${attrName}属性的Persona「${personaName}」。
Persona 人设：${personaDescription || '无描述——从名字与属性气质推断'}
誓约技能的实际战斗效果（不可改动，命名与描述必须呼应它）：${oathEffectText}

【输出要求】
- name：新技能名，2-8个字，贴合该 Persona 的神话/人设意象（例如回复系誓约给阿喀琉斯可命名"斯提克斯的沐浴"）；禁止出现"誓约/之誓"字样
- description：一句话（20字内），以该 Persona 的口吻或意象描述这股力量，末尾自然点出效果
仅输出 JSON：{"name":"…","description":"…"}`;
  try {
    // 保持思考（用户口径：起名要质量；失败保留模板名，不急）
    const result = await callAIWithRetry(cfg, [{ role: 'user', content: prompt }], 0.8, 400, true);
    const parsed = extractJSON(result);
    const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 12) : null;
    const description = typeof parsed.description === 'string' && parsed.description.trim()
      ? parsed.description.trim().slice(0, 40)
      : oathEffectText;
    return name ? { name, description } : null;
  } catch {
    return null;
  }
}
