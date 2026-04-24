/**
 * 同伴匹配 AI
 *
 * 输入：用户输入的"对象名字 + 描述" + 已占用的阿卡纳列表
 * 输出：选中的大阿卡纳 + 正/逆位 + 初始亲密度 + 解读 + 相处建议
 *
 * 没配置 AI 时使用离线兜底：基于关键词 + 哈希随机挑选未占用的阿卡纳。
 */

import type { Settings, TarotOrientation } from '@/types';
import { MAJOR_ARCANA, TAROT_BY_ID } from '@/constants/tarot';
import { resolveProvider } from '@/utils/aiProviders';

export interface ConfidantMatchInput {
  settings: Settings;
  name: string;
  description: string;
  /** 用户已经占用的 arcanaId 列表（新绑定必须排除） */
  takenArcanaIds: string[];
  /** 4 个补充问题（问题 → 选中的答案） */
  traits?: Array<{ question: string; answer: string }>;
}

export interface ConfidantMatchResult {
  arcanaId: string;
  orientation: TarotOrientation;
  initialIntimacy: number;     // 0–3
  initialPoints: number;       // 初始累计点数
  interpretation: string;      // 为什么是这张牌
  advice: string;              // 如何相处 / 建议
  source: 'ai' | 'offline';
}

// ── AI 请求 ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是「馆长」——靛蓝色房间的塔罗解读者。有一位"客人"向你提起 Ta 生活中的某个人，希望你为这段关系匹配一张大阿卡纳。

你需要：
1. 从 22 张大阿卡纳中挑选**最能象征这段关系**的一张（避开客人已占用的阿卡纳）
2. **正位 / 逆位判断（请以正位为基线）**：
   - 绝大多数持续、有来有往、互相关怀的关系 → **正位**
   - 只有当描述 / 补充画像里**明确出现**以下具体负面信号时才选逆位：
     · 明确的"累 / 压抑 / 委屈 / 冷战 / 争吵 / 疏远 / 消耗 / 不敢说话 / 想逃 / 失望 / 戒不掉但受伤"
     · 明显的"单向付出 / 控制 / 依赖而不对等"
     · 或者描述中直接表达"有问题 / 不健康 / 在滑落"
   - 描述温和、普通、日常、积极，或只是"关系淡一点 / 不熟"——一律选**正位**
   - **宁可偏正位，不要过度诊断**。如果拿不准，请选正位
3. 给出初始亲密度（0–3）：普通关系 0–1，关系亲近但刚起步 2，深度信任 3
4. 用「馆长」神秘低语的口吻写一段简短解读（60–90 字）——
   · 像在烛火边谈论命运与倒影；多用意象，如"光落在哪里"、"影子停在哪里"、"谁在倒影里"
   · **少用**直白的"你们 / Ta"式心理分析语言
   · 不要讲道理、不要铺陈、不要罗列
5. 相处建议（60–90 字）——可以落地、具体可行，但语气依旧克制、含蓄；避免鸡汤与说教

请严格输出以下 JSON，不要包裹代码块，不要添加任何额外文字：

{
  "arcanaId": "<22 张大阿卡纳中的一个 id，小写英文>",
  "orientation": "<upright | reversed>",
  "initialIntimacy": <0-3 的整数>,
  "interpretation": "<神秘口吻的简短解读>",
  "advice": "<相处建议>"
}

22 张大阿卡纳 id 参考：
fool, magician, high_priestess, empress, emperor, hierophant, lovers, chariot, strength, hermit, wheel_of_fortune, justice, hanged_man, death, temperance, devil, tower, star, moon, sun, judgement, world`;

export interface AIRequestData {
  baseUrl: string;
  model: string;
  apiKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

export function buildMatchRequest(input: ConfidantMatchInput): AIRequestData {
  const { settings, name, description, takenArcanaIds, traits } = input;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const avail = MAJOR_ARCANA
    .filter(c => !takenArcanaIds.includes(c.id))
    .map(c => `${c.id}（${c.name} / ${c.nameEn}）`)
    .join('、');

  const traitLines = traits && traits.length
    ? traits.map(t => `- ${t.question} → ${t.answer}`).join('\n')
    : '（未填写）';

  const userMsg = [
    `客人提到的人：${name}`,
    ``,
    `关系描述：`,
    description.trim() || '（未填写）',
    ``,
    `补充画像（客人对以下问题的选择）：`,
    traitLines,
    ``,
    `已占用的阿卡纳：${takenArcanaIds.length ? takenArcanaIds.join(', ') : '（无）'}`,
    `请从以下未占用的阿卡纳中选择：`,
    avail || '（全部已占用）',
    ``,
    `请结合关系描述与补充画像综合判断。请诚实考虑逆位的可能。请输出 JSON。`,
  ].join('\n');

  return {
    baseUrl,
    model,
    apiKey: settings.summaryApiKey || '',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  };
}

export async function callMatchAI(req: AIRequestData, signal?: AbortSignal): Promise<ConfidantMatchResult> {
  const resp = await fetch(`${req.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      temperature: 0.9,
      max_tokens: 800,
      stream: false,
    }),
    signal,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`AI 请求失败 (${resp.status}): ${body.slice(0, 200) || resp.statusText}`);
  }
  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('AI 返回为空');

  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const a = stripped.indexOf('{');
  const b = stripped.lastIndexOf('}');
  const jsonLike = a >= 0 && b > a ? stripped.slice(a, b + 1) : stripped;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    throw new Error('AI 返回不是合法 JSON');
  }

  const arcanaId = typeof parsed.arcanaId === 'string' ? parsed.arcanaId.trim().toLowerCase() : '';
  const orientationRaw = typeof parsed.orientation === 'string' ? parsed.orientation.trim().toLowerCase() : 'upright';
  const orientation: TarotOrientation = orientationRaw === 'reversed' ? 'reversed' : 'upright';
  const initialIntimacyRaw = typeof parsed.initialIntimacy === 'number' ? parsed.initialIntimacy : parseInt(String(parsed.initialIntimacy ?? '1'), 10);
  const initialIntimacy = Math.max(0, Math.min(3, Number.isFinite(initialIntimacyRaw) ? initialIntimacyRaw : 1));
  const interpretation = typeof parsed.interpretation === 'string' ? parsed.interpretation.trim() : '';
  const advice = typeof parsed.advice === 'string' ? parsed.advice.trim() : '';

  if (!arcanaId || !TAROT_BY_ID[arcanaId] || TAROT_BY_ID[arcanaId].arcana !== 'major') {
    throw new Error('AI 返回的 arcanaId 无效');
  }
  if (!interpretation || !advice) {
    throw new Error('AI 返回字段不完整');
  }

  // 初始累计点数：取对应等级阈值（即"起点累计点数"）
  const base = [0, 3, 7, 12][initialIntimacy] ?? 0;

  return {
    arcanaId,
    orientation,
    initialIntimacy,
    initialPoints: base,
    interpretation,
    advice,
    source: 'ai',
  };
}

// ── 离线兜底 ────────────────────────────────────────────────────

/**
 * 简单的哈希函数（djb2），用于根据文本决定性挑选阿卡纳。
 * 同一段文字多次计算结果一致，但不同文字分布均匀。
 */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return Math.abs(h);
}

/** 一些关键词 → 阿卡纳的优先映射（用于离线匹配尽量贴合文本） */
const KEYWORD_HINTS: Array<{ keys: string[]; arcana: string; reversed?: boolean }> = [
  { keys: ['师', '老师', '导师', '长辈', '前辈'], arcana: 'hierophant' },
  { keys: ['恋人', '伴侣', '喜欢', '爱情', '男友', '女友', '对象'], arcana: 'lovers' },
  { keys: ['母亲', '妈妈', '母亲般', '温柔'], arcana: 'empress' },
  { keys: ['父亲', '爸爸', '领导', '权威'], arcana: 'emperor' },
  { keys: ['朋友', '伙伴', '队友'], arcana: 'strength' },
  { keys: ['安静', '孤独', '独处', '隐居'], arcana: 'hermit' },
  { keys: ['神秘', '直觉', '占卜', '塔罗'], arcana: 'high_priestess' },
  { keys: ['创作', '创造', '艺术', '创业'], arcana: 'magician' },
  { keys: ['冒险', '新朋友', '刚认识', '初识'], arcana: 'fool' },
  { keys: ['命运', '转机', '机会'], arcana: 'wheel_of_fortune' },
  { keys: ['公正', '律师', '法官', '理性'], arcana: 'justice' },
  { keys: ['牺牲', '放下', '僵局'], arcana: 'hanged_man' },
  { keys: ['改变', '重生', '告别', '分手'], arcana: 'death', reversed: true },
  { keys: ['平衡', '调和', '耐心'], arcana: 'temperance' },
  { keys: ['欲望', '执念', '依赖'], arcana: 'devil', reversed: true },
  { keys: ['崩塌', '剧变', '打击'], arcana: 'tower', reversed: true },
  { keys: ['希望', '星', '梦想', '灵感'], arcana: 'star' },
  { keys: ['困惑', '梦', '潜意识', '阴影'], arcana: 'moon' },
  { keys: ['阳光', '快乐', '活力', '温暖'], arcana: 'sun' },
  { keys: ['觉醒', '召唤', '审判'], arcana: 'judgement' },
  { keys: ['圆满', '完成', '世界', '宏大'], arcana: 'world' },
  { keys: ['胜利', '冲刺', '目标', '驾驭'], arcana: 'chariot' },
];

export function matchOffline(input: ConfidantMatchInput): ConfidantMatchResult {
  const { name, description, takenArcanaIds, traits } = input;
  const traitText = traits?.map(t => t.answer).join(' ') ?? '';
  const text = `${name} ${description} ${traitText}`.toLowerCase();

  // 先尝试关键词命中
  const hit = KEYWORD_HINTS.find(h => h.keys.some(k => text.includes(k)));
  let arcanaId = hit && !takenArcanaIds.includes(hit.arcana) ? hit.arcana : null;
  let orientation: TarotOrientation = hit?.reversed ? 'reversed' : 'upright';

  // 未命中或已占用 → 按哈希从剩余阿卡纳里挑
  if (!arcanaId) {
    const avail = MAJOR_ARCANA.filter(c => !takenArcanaIds.includes(c.id));
    if (avail.length === 0) {
      // 理论上 22 个用完才会走到这里；保险兜底
      arcanaId = MAJOR_ARCANA[0].id;
    } else {
      const idx = hashStr(text || 'default') % avail.length;
      arcanaId = avail[idx].id;
    }
  }

  // 逆位判定（与 AI prompt 对齐：宁可偏正位）：
  // 只有文本里出现明确的负面信号、且没有同时出现正面信号，才选逆位。
  // 其他情况一律保持正位——包括中性描述、温和关系、普通日常
  const strongNegative =
    /心累|压抑|委屈|冷战|争吵|冷暴力|消耗|戒不掉|不敢说|想逃|失望|疏远|难以承受|压得喘|滑落|单方面付出|控制欲/.test(text);
  const mildPositive =
    /开心|温暖|感动|依靠|陪伴|信任|默契|理解|支持|真心|放松|安心|踏实|舒服|自在|被接住/.test(text);
  if (strongNegative && !mildPositive) {
    orientation = 'reversed';
  }
  // 无明确信号 → 保持 upright（除非关键词命中已经指定了 reversed）

  const card = TAROT_BY_ID[arcanaId];
  const meaning = orientation === 'upright' ? card.upright : card.reversed;
  const initialIntimacy = 1; // 离线统一起点
  const interpretation = `${name} 给你的印象落在了《${card.name}》${orientation === 'upright' ? '正位' : '逆位'}——` +
    `${meaning.keywords.slice(0, 3).join('、')}。${meaning.meaning}`;
  const advice = orientation === 'upright'
    ? `不妨多分享些你自己的生活片段，让这段关系自然生长；每一次真诚的互动都会让它更稳固。`
    : `留意自己与 Ta 之间是否有未说出口的期待；缓和的第一步，常始于一句不带要求的问候。`;

  return {
    arcanaId,
    orientation,
    initialIntimacy,
    initialPoints: [0, 3, 7, 12][initialIntimacy] ?? 0,
    interpretation,
    advice,
    source: 'offline',
  };
}

// ── 锁定塔罗的解读 / 未来生成（供 COOP 物化时使用） ────────────

export interface LockedArcanaInterpretInput {
  settings: Settings;
  name: string;
  arcanaId: string;
  orientation: TarotOrientation;
  intimacy: number;
  /** 用户为该 COOP 留下的话（可空） */
  message?: string;
}

export interface LockedArcanaInterpretResult {
  interpretation: string;
  advice: string;
  source: 'ai' | 'offline';
}

const LOCKED_INTERPRET_SYSTEM_PROMPT = `你是「星象」——靛蓝色房间的塔罗解读者。客人已经为一段关系挑好了一张大阿卡纳，请你**只**给出"解读"和"未来"两段。

要求：
- interpretation（解读）：60–90 字，神秘低语口吻——"光落在哪里 / 影子停在哪里 / 烛火的色温" 等意象；少用"你们 / Ta"的直白分析；不要罗列、不要铺陈。
- advice（未来）：50–80 字，落地具体但语气克制含蓄；写"接下来该如何往前走"——不必鸡汤，可以直接。

输出严格 JSON，不要代码块也不要额外文字：
{
  "interpretation": "<解读>",
  "advice": "<未来>"
}`;

function buildLockedInterpretRequest(input: LockedArcanaInterpretInput): AIRequestData {
  const card = TAROT_BY_ID[input.arcanaId];
  const meaning = input.orientation === 'upright' ? card.upright : card.reversed;
  const { baseUrl, model } = resolveProvider(
    input.settings.summaryApiProvider,
    input.settings.summaryApiBaseUrl,
    input.settings.summaryModel,
  );
  const userMsg = [
    `对方：${input.name}`,
    `锁定塔罗：《${card.name}》${input.orientation === 'upright' ? '正位' : '逆位'}`,
    `牌意关键词：${meaning.keywords.join('、')}`,
    `牌意核心：${meaning.meaning}`,
    `当前羁绊期望：Lv.${input.intimacy}`,
    input.message ? `客人留言：${input.message.slice(0, 200)}` : '（客人未留言）',
    ``,
    `请输出 JSON。`,
  ].join('\n');
  return {
    baseUrl,
    model,
    apiKey: input.settings.summaryApiKey || '',
    messages: [
      { role: 'system', content: LOCKED_INTERPRET_SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  };
}

function lockedInterpretOffline(input: LockedArcanaInterpretInput): LockedArcanaInterpretResult {
  const card = TAROT_BY_ID[input.arcanaId];
  if (!card) return { interpretation: '', advice: '', source: 'offline' };
  const meaning = input.orientation === 'upright' ? card.upright : card.reversed;
  const interpretation = input.message
    ? `Ta 写给你：${input.message.slice(0, 140)}`
    : `《${card.name}》${input.orientation === 'upright' ? '正位' : '逆位'} —— ${meaning.keywords.slice(0, 3).join('、')}。${meaning.meaning.slice(0, 60)}`;
  const advice = input.orientation === 'upright'
    ? `保持你们当下的节奏 —— 这张牌已是好兆头。下一次见 Ta，多说一句"我看见了"。`
    : `先不要急着修复 —— 可能只是需要一段安静的距离，再回头时光会自己折回来。`;
  return { interpretation, advice, source: 'offline' };
}

/**
 * 为一张已选定的塔罗生成 解读 + 未来。
 * 用于 COOP 物化时（用户手动挑了塔罗，但仍希望 AI 帮写解读）。
 *
 * - 有 API key → 调 AI；失败兜底到 offline 模板
 * - 无 API key → 直接走 offline 模板
 */
export async function interpretLockedArcana(
  input: LockedArcanaInterpretInput,
  signal?: AbortSignal,
): Promise<LockedArcanaInterpretResult> {
  const hasKey = Boolean(input.settings.summaryApiKey?.trim());
  if (!hasKey) return lockedInterpretOffline(input);
  try {
    const req = buildLockedInterpretRequest(input);
    const resp = await fetch(`${req.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${req.apiKey}` },
      body: JSON.stringify({ model: req.model, messages: req.messages, temperature: 0.85, max_tokens: 600, stream: false }),
      signal,
    });
    if (!resp.ok) throw new Error(`AI 请求失败 (${resp.status})`);
    const data = await resp.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? '';
    const stripped = raw.replace(/```(?:json)?/gi, '').trim();
    const a = stripped.indexOf('{');
    const b = stripped.lastIndexOf('}');
    const jsonLike = a >= 0 && b > a ? stripped.slice(a, b + 1) : stripped;
    const parsed = JSON.parse(jsonLike) as Record<string, unknown>;
    const interpretation = typeof parsed.interpretation === 'string' ? parsed.interpretation.trim() : '';
    const advice = typeof parsed.advice === 'string' ? parsed.advice.trim() : '';
    if (!interpretation || !advice) throw new Error('AI 返回字段不完整');
    return { interpretation, advice, source: 'ai' };
  } catch (err) {
    console.warn('[velvet-confidant] interpretLockedArcana AI failed, fallback to offline', err);
    return lockedInterpretOffline(input);
  }
}

/** 统一入口：优先走 AI，失败或未配置则降级到离线。 */
export async function matchConfidant(input: ConfidantMatchInput, signal?: AbortSignal): Promise<ConfidantMatchResult> {
  const hasKey = Boolean(input.settings.summaryApiKey?.trim());
  if (!hasKey) return matchOffline(input);
  try {
    const req = buildMatchRequest(input);
    return await callMatchAI(req, signal);
  } catch (err) {
    console.warn('[confidantAI] match failed, falling back to offline:', err);
    return matchOffline(input);
  }
}

// ── 互动评估 ────────────────────────────────────────────────────

export interface InteractionEvalInput {
  settings: Settings;
  confidantName: string;
  arcanaName: string;
  orientation: TarotOrientation;
  currentLevel: number;
  description: string;       // 用户描述今天和 ta 做了什么
  relationshipSummary: string; // 已知的关系描述
  /**
   * 最近两次（或更少）"一起做的事"的用户原话。
   * 不包含 AI 的解读或建议——给馆长参考客人近来相处的轨迹，
   * 帮助他判断这次是延续、突破还是回落
   */
  recentUserInputs?: Array<{ date: string; text: string }>;
}

export interface InteractionEvalResult {
  delta: number;             // 0–5 的建议加点
  narrative: string;         // 解读（"这段关系当下的样子"）
  advice: string;            // 下一步建议
  source: 'ai' | 'offline';
}

const EVAL_SYSTEM_PROMPT = `你为客人解读 Ta 今天与一位同伴的互动。请做三件事：

1. 判断亲密度建议加点（0–5）：
   · 0 = 没变化或轻度消耗
   · 1 = 日常温和维系
   · 2 = 稳稳升温、舒适的陪伴
   · 3 = 明显靠近 / 共享 / 被看见
   · 4 = 深度共享、某种门已经推开了一条缝
   · 5 = 关键节点、深度连结、关系质变
2. 写一段 **约 60 字** 的解读，满足以下全部：
   · **不复述事件**、不总结"今天你…"
   · 用诗意且准确的意象描绘关系当下的进展、光与影
   · **侧重：这次相处给客人带来了什么力量**——可能是勇气、温柔、专注、宽容、自由、希望、信任、自我松动 等
   · 禁止自指词（馆长 / 水晶球 / 塔罗 等）
   · 禁止心理学术语、说教与鸡汤
3. 给一句约 40 字的相处建议，具体、克制。

输出严格 JSON：

{
  "delta": <0-5 整数>,
  "narrative": "<约 60 字、诗意意象、侧重力量>",
  "advice": "<约 40 字>"
}`;

export function buildEvalRequest(input: InteractionEvalInput): AIRequestData {
  const { settings, confidantName, arcanaName, orientation, currentLevel, description, relationshipSummary, recentUserInputs } = input;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const recentLines = recentUserInputs && recentUserInputs.length
    ? recentUserInputs.map(r => `- [${r.date}] ${r.text}`).join('\n')
    : '（暂无）';

  const userMsg = [
    `同伴：${confidantName}（对应《${arcanaName}》${orientation === 'upright' ? '正位' : '逆位'}）`,
    `当前亲密度：Lv.${currentLevel}`,
    ``,
    `已知的关系描述：`,
    relationshipSummary || '（客人未特别说明）',
    ``,
    `近来一起做的事（客人原话，最近 2 次）：`,
    recentLines,
    ``,
    `今日事件：`,
    description,
    ``,
    `请输出 JSON。`,
  ].join('\n');

  return {
    baseUrl,
    model,
    apiKey: settings.summaryApiKey || '',
    messages: [
      { role: 'system', content: EVAL_SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  };
}

export async function callEvalAI(req: AIRequestData, signal?: AbortSignal): Promise<InteractionEvalResult> {
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
      max_tokens: 600,
      stream: false,
    }),
    signal,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`AI 请求失败 (${resp.status}): ${body.slice(0, 200) || resp.statusText}`);
  }
  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('AI 返回为空');
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const a = stripped.indexOf('{');
  const b = stripped.lastIndexOf('}');
  const jsonLike = a >= 0 && b > a ? stripped.slice(a, b + 1) : stripped;
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(jsonLike); } catch { throw new Error('AI 返回不是合法 JSON'); }

  const deltaRaw = typeof parsed.delta === 'number' ? parsed.delta : parseInt(String(parsed.delta ?? '1'), 10);
  const delta = Math.max(0, Math.min(5, Number.isFinite(deltaRaw) ? deltaRaw : 1));
  const narrative = typeof parsed.narrative === 'string' ? parsed.narrative.trim() : '';
  const advice = typeof parsed.advice === 'string' ? parsed.advice.trim() : '';
  if (!narrative || !advice) throw new Error('AI 返回字段不完整');
  return { delta, narrative, advice, source: 'ai' };
}

/** 离线兜底：按文本长度 + 情感极性（正/负词）粗略推断 delta（0–5） */
export function evalOffline(input: InteractionEvalInput): InteractionEvalResult {
  const t = input.description.toLowerCase();
  let delta = 1;
  if (/开心|温暖|感动|谢谢|陪伴|拥抱|笑|分享|支持|一起|约定|第一次|重要/.test(t)) delta = 3;
  if (/深入|长谈|交心|被看见|懂我|共鸣|并肩|两个人的|我们之间/.test(t)) delta = 4;
  if (/无聊|冷淡|争吵|生气|失望|心累|敷衍|冷战|逃|吵|烦/.test(t)) delta = 0;
  if (/崩溃|和好|告白|坦白|真心|危机|救|决定|承诺|陪我走过|从今以后|誓/.test(t)) delta = 5;
  if (t.length < 10) delta = Math.min(delta, 1);
  const narrative = delta >= 3
    ? `烛火偏暖了一些——你们之间那层薄纱被轻轻掀起，一缕光顺着门缝探进来，把"放心"这个词悄悄还给你。`
    : delta === 2
    ? `潮汐温和地起伏。你被某种熟悉的柔软托了一下，松了半寸肩膀。`
    : delta === 1
    ? `烛火平稳地燃着。丝线没有断，也没有收紧——维系本身，就是你今天得到的那份力量。`
    : `倒影起了一丝涟漪。先让情绪像薄雾一样停留，光线会自己寻路。`;
  const advice = delta >= 3
    ? `下次见面，把今日的感动用一句具体的话告诉 Ta——越具体越好。`
    : delta >= 1
    ? `主动发起一次轻量的问候，让节奏不要断。`
    : `先处理自己的情绪，不用强行沟通。`;
  return { delta, narrative, advice, source: 'offline' };
}

export async function evaluateInteraction(
  input: InteractionEvalInput,
  signal?: AbortSignal,
  /**
   * 允许走 AI 路径。默认 true。
   * 当前用法：在线同伴且用户未登录云端时，调用方传 false → 走 offline 模板，
   * 避免无云态下的在线条目"绕过登录白嫖 AI"。
   */
  allowAI: boolean = true,
): Promise<InteractionEvalResult> {
  const hasKey = Boolean(input.settings.summaryApiKey?.trim());
  if (!hasKey || !allowAI) return evalOffline(input);
  try {
    return await callEvalAI(buildEvalRequest(input), signal);
  } catch (err) {
    console.warn('[confidantAI] eval failed, falling back to offline:', err);
    return evalOffline(input);
  }
}

// ── 星移：以当前状态重新生成同伴描述 / 解读 / 建议 ────────────────

export interface StarShiftInput {
  settings: Settings;
  confidantName: string;
  arcanaName: string;
  orientation: TarotOrientation;
  currentLevel: number;
  previousDescription: string;
  previousInterpretation: string;
  previousAdvice: string;
  /** 用户本次对关系变化的看法（可空） */
  changeNote: string;
  /** 最近的互动记录（最多 6 条，按时间倒序） */
  recentActivities: Array<{ date: string; text: string }>;
}

export interface StarShiftResult {
  orientation: TarotOrientation;  // 可能随关系走向更新
  description: string;            // 新的关系描述
  interpretation: string;         // 新的馆长解读
  advice: string;                 // 新的相处建议
  summary: string;                // 为什么这次会有这样的变化（一句话）
  source: 'ai' | 'offline';
}

const STAR_SHIFT_SYSTEM_PROMPT = `你是「馆长」。这位客人与一位同伴的羁绊刚刚更进一步（亲密度升级），水晶球里的光线也跟着变了——现在，请你以最新的相处轨迹，在羊皮卷上重新落墨。

请综合下面的信息，写出以下几段文字：

- **description（关系描述）**：60–110 字。第一人称视角，像客人自己在日记里写下的一段当下观察；平实、贴近生活，而不是分析性总结。
- **interpretation（馆长解读）**：60–90 字。**神秘低语的口吻**——"光落在哪里 / 影子停在哪里 / 谁在倒影里 / 烛火的色温"等意象；**少用**"你们 / Ta"的直白分析；不要讲道理、不要罗列、不要铺陈。
- **advice（相处建议）**：50–80 字。可以落地具体，但语气依旧克制、含蓄，避免鸡汤。
- **summary（一句话小结）**：不超过 25 字，写这一次星移"看见了什么新的光"。
- **orientation**：只有当最近的相处轨迹**明确出现**消耗 / 冷战 / 疏远 / 委屈 / 压抑 / 想逃 / 失望 / 单向付出 等具体负面信号时，才翻到 reversed；否则请保持 / 倾向 upright。

输出严格 JSON，不要代码块也不要额外文字：
{
  "orientation": "<upright | reversed>",
  "description": "<新描述>",
  "interpretation": "<神秘口吻的简短解读>",
  "advice": "<相处建议>",
  "summary": "<一句话变化小结>"
}`;

function buildStarShiftRequest(input: StarShiftInput): AIRequestData {
  const { settings } = input;
  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );
  const recentLines = input.recentActivities.length
    ? input.recentActivities.map(a => `- [${a.date}] ${a.text}`).join('\n')
    : '（最近没有新的记录）';
  const userMsg = [
    `同伴：${input.confidantName}（《${input.arcanaName}》${input.orientation === 'upright' ? '正位' : '逆位'}）`,
    `当前亲密度：Lv.${input.currentLevel}`,
    ``,
    `之前的关系描述：${input.previousDescription || '（无）'}`,
    `之前的馆长解读：${input.previousInterpretation || '（无）'}`,
    `之前的相处建议：${input.previousAdvice || '（无）'}`,
    ``,
    `客人对这段关系变化的看法：`,
    input.changeNote.trim() || '（未填写——请仅凭下方记录推断）',
    ``,
    `最近的互动记录（最多 6 条）：`,
    recentLines,
    ``,
    `请输出 JSON。`,
  ].join('\n');
  return {
    baseUrl,
    model,
    apiKey: settings.summaryApiKey || '',
    messages: [
      { role: 'system', content: STAR_SHIFT_SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  };
}

async function callStarShiftAI(req: AIRequestData, signal?: AbortSignal): Promise<StarShiftResult> {
  const resp = await fetch(`${req.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${req.apiKey}` },
    body: JSON.stringify({ model: req.model, messages: req.messages, temperature: 0.85, max_tokens: 900, stream: false }),
    signal,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`AI 请求失败 (${resp.status}): ${body.slice(0, 200) || resp.statusText}`);
  }
  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('AI 返回为空');
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const a = stripped.indexOf('{');
  const b = stripped.lastIndexOf('}');
  const jsonLike = a >= 0 && b > a ? stripped.slice(a, b + 1) : stripped;
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(jsonLike); } catch { throw new Error('AI 返回不是合法 JSON'); }
  const orientationRaw = typeof parsed.orientation === 'string' ? parsed.orientation.trim().toLowerCase() : 'upright';
  const orientation: TarotOrientation = orientationRaw === 'reversed' ? 'reversed' : 'upright';
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : '';
  const interpretation = typeof parsed.interpretation === 'string' ? parsed.interpretation.trim() : '';
  const advice = typeof parsed.advice === 'string' ? parsed.advice.trim() : '';
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  if (!description || !interpretation || !advice) throw new Error('AI 返回字段不完整');
  return { orientation, description, interpretation, advice, summary, source: 'ai' };
}

function starShiftOffline(input: StarShiftInput): StarShiftResult {
  const hasChange = input.changeNote.trim().length > 0;
  const recent = input.recentActivities[0]?.text ?? '';
  const positive = /开心|陪伴|温暖|理解|依赖|长谈|默契|相聚|好转/.test(input.changeNote + recent);
  const negative = /累|冷|疏远|别扭|失望|不敢|争吵|压|逃/.test(input.changeNote + recent);
  const orientation: TarotOrientation = negative && !positive ? 'reversed' : positive && !negative ? 'upright' : input.orientation;
  const description = hasChange
    ? `${input.previousDescription}\n\n（近况）${input.changeNote.trim()}`
    : input.previousDescription;
  const interpretation = `《${input.arcanaName}》${orientation === 'upright' ? '正位' : '逆位'} —— 亲密度到达 Lv.${input.currentLevel} 后，这段关系在 ${positive ? '向前推进' : negative ? '略有回落' : '延续其原本的节奏'}。`;
  const advice = positive
    ? `保持这样的频率，让这份默契稳稳沉淀下来。`
    : negative
    ? `给彼此一点独处时间，不必强行修复，先照顾好自己的情绪。`
    : `继续做最自然的你；关系会自己长成它该有的形状。`;
  const summary = orientation !== input.orientation
    ? (orientation === 'upright' ? '从逆位走向正位' : '从正位滑入逆位')
    : '底色延续，亲密加深';
  return { orientation, description, interpretation, advice, summary, source: 'offline' };
}

export async function starShiftConfidant(input: StarShiftInput, signal?: AbortSignal): Promise<StarShiftResult> {
  const hasKey = Boolean(input.settings.summaryApiKey?.trim());
  if (!hasKey) return starShiftOffline(input);
  try {
    return await callStarShiftAI(buildStarShiftRequest(input), signal);
  } catch (err) {
    console.warn('[confidantAI] starShift failed, falling back to offline:', err);
    return starShiftOffline(input);
  }
}
