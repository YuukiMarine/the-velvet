/**
 * AI 活动分析：把一段自然语言描述映射到五维点数加成。
 *
 * 设计意图：
 *   - 让用户写一句"我今天晨跑 5km"，AI 给出 {灵巧:+2, 胆量:+1} 的建议
 *   - 局部关键词规则（settings.keywordRules）只能命中字面词，遇到长句 / 比喻语
 *     就失效；这套 AI 通路用来在"分析关键词"按钮之后给出第二档智能分析
 *
 * 输入：
 *   - description：用户在记录页面输入的描述文本
 *   - attributeNames：客制化的五维属性中文名（可能被用户改过）
 *   - settings：API key / provider / model 等
 *
 * 输出：Record<AttributeId, number>，每项 0–5（与 UI 的 +/- 上限一致）
 *
 * 失败策略：抛出 Error，由调用方捕获后给 UI 显示错误。
 */

import { AttributeId, AttributeNames, Settings } from '@/types';
import { resolveProvider } from '@/utils/aiProviders';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const SYSTEM_PROMPT = `你是一个简洁的成长教练。用户会给你一段他刚做完事情的描述（一两句话，最多几行），
你要判断这件事最显著促进了哪些"五维属性"，并给出 0–5 的整数加成（含 0）。

约束：
1. 你只能从用户提供的"五项属性名（客人自定义）"里挑名字，**逐字一致**输出，不得翻译 / 加括号。
2. 评分基准：单一、明确、可观测的小事 → 主属性 +1；中等强度或耗时较长 / 需要克服阻力 → 主属性 +2；
   极具挑战或长时间专注 → 主属性 +3；很罕见的高强度突破 → 主属性 +4；几乎不可能 +5。
3. 大多数情况只挑 1 项主属性 +N。如果同时显著锻炼了第二维度，可以给次要属性 +1（最多挑 2 项）。
4. 没体现的维度一律给 0。**绝不给所有维度都打高分**。
5. 一行简短到无明显成长的描述（比如"喝了杯水"）应给全 0。

**输出必须是严格的合法 JSON**：
{ "knowledge": <0-5>, "guts": <0-5>, "dexterity": <0-5>, "kindness": <0-5>, "charm": <0-5>, "reason": "<不超过 30 字的中文理由>" }

注意：JSON 的 key 仍然用英文 ID（knowledge/guts/dexterity/kindness/charm），
"reason" 里可以自然地引用客制化属性名。
不要输出 JSON 之外的任何文字，不要用代码块包裹。`;

export interface ActivityAIResult {
  points: Record<AttributeId, number>;
  reason: string;
}

export async function analyzeActivityAI(
  description: string,
  attributeNames: AttributeNames,
  settings: Settings,
  signal?: AbortSignal,
): Promise<ActivityAIResult> {
  const trimmed = description.trim();
  if (!trimmed) throw new Error('描述为空');

  if (!settings.summaryApiKey) {
    throw new Error('请先在「设置 → AI 总结」中配置 API 密钥');
  }

  const { baseUrl, model } = resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const userMessage = [
    `用户描述：`,
    trimmed,
    ``,
    `五项属性名（客人自定义，逐字使用）：`,
    ATTRIBUTE_IDS.map(id => `- ${id}：${attributeNames[id] ?? id}`).join('\n'),
    ``,
    `请按要求输出 JSON。`,
  ].join('\n');

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.summaryApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3, // 偏稳定，少漂
      max_tokens: 200,
      stream: false,
    }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`API 请求失败 (${resp.status}): ${body.slice(0, 160) || resp.statusText}`);
  }

  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content ?? '';
  if (!raw) throw new Error('AI 返回为空');

  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  const jsonLike = firstBrace >= 0 && lastBrace > firstBrace
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    throw new Error('AI 返回不是合法 JSON');
  }

  const out: Record<AttributeId, number> = {
    knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0,
  };
  for (const id of ATTRIBUTE_IDS) {
    const v = parsed[id];
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      out[id] = Math.max(0, Math.min(5, Math.round(n)));
    }
  }
  const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
  return { points: out, reason };
}
