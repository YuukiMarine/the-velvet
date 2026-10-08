/**
 * Anthropic Messages 协议（第 14 批 · 自定义服务商的备用协议）。
 *
 * 用在三处：官方 Anthropic Key（浏览器 / WebView 里只有 /v1/messages 带 anthropic-dangerous-direct-browser-access
 * 才放行跨域，它的 OpenAI 兼容口会被跨域拦下——2026-10-07 实测）、只开放 Messages 接口的 Claude 专用中转、
 * 以及 DeepSeek 等家的 /anthropic 兼容口。
 *
 * 这里只管「请求长什么样、回包怎么读」：发送、重试、诊断、怪癖记忆（不收 temperature 等）都和 OpenAI 兼容口
 * 共用 aiClient 那一套。纯函数、不 import aiClient 的运行时代码（类型除外），免得成环。
 */
import type { AIMessage, ContentPart } from '@/utils/aiClient';
import { quirksFor } from '@/utils/aiQuirks';

export const ANTHROPIC_VERSION = '2023-06-01';

/**
 * base → 端点。官方 SDK 的 base 不带 /v1（https://api.anthropic.com、https://api.deepseek.com/anthropic），
 * 用户也常照 OpenAI 的习惯填带 /v1 的：带了就直接接，没带就补 /v1。
 */
export function anthropicEndpoint(baseUrl: string, path: 'messages' | 'models'): string {
  const b = baseUrl.replace(/\/+$/, '');
  return /\/v\d+$/i.test(b) ? `${b}/${path}` : `${b}/v1/${path}`;
}

export function anthropicHeaders(apiKey: string, stream = false): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // 官方接口只有带这个头才对浏览器放行跨域（App 的 WebView 也按浏览器算）
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(stream ? { Accept: 'text/event-stream' } : {}),
  };
}

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string } };

const textOf = (content: string | ContentPart[]): string =>
  typeof content === 'string' ? content : content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');

function toBlocks(content: string | ContentPart[]): AnthropicBlock[] {
  if (typeof content === 'string') return content.trim() ? [{ type: 'text', text: content }] : [];
  const out: AnthropicBlock[] = [];
  for (const p of content) {
    if (p.type === 'text') {
      if (p.text.trim()) out.push({ type: 'text', text: p.text });
      continue;
    }
    const url = p.image_url?.url ?? '';
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
    if (m) out.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
    else if (/^https?:\/\//i.test(url)) out.push({ type: 'image', source: { type: 'url', url } });
  }
  return out;
}

/**
 * OpenAI 风格的 messages → Messages API 请求体：
 *   - system 不在 messages 里：所有 system（助手那条夹在中间的动态上下文也是）按顺序合并成顶层 system；
 *   - 相邻同角色合并（Messages API 要求一问一答交替）；第一条必须是 user；
 *   - 最后一条若是 assistant（续写时把半截正文当前缀），去掉结尾空白（API 不收以空白结尾的预填）；
 *   - max_tokens 必填；temperature 只收 0–1，模型不收就不发（怪癖记忆，与 OpenAI 兼容口同一份）。
 */
export function buildAnthropicBody(
  cfg: { baseUrl: string; model: string },
  messages: AIMessage[],
  opts: { maxTokens: number; temperature?: number; stream: boolean },
): Record<string, unknown> {
  const system: string[] = [];
  const turns: Array<{ role: 'user' | 'assistant'; content: AnthropicBlock[] }> = [];
  for (const m of messages) {
    if (m.role === 'system') {
      const t = textOf(m.content);
      if (t.trim()) system.push(t);
      continue;
    }
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const blocks = toBlocks(m.content);
    if (!blocks.length) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else turns.push({ role, content: blocks });
  }
  if (!turns.length || turns[0].role !== 'user') turns.unshift({ role: 'user', content: [{ type: 'text', text: '（请按上面的说明开始。）' }] });
  const tail = turns[turns.length - 1];
  if (tail.role === 'assistant') {
    const lastBlock = tail.content[tail.content.length - 1];
    if (lastBlock?.type === 'text') lastBlock.text = lastBlock.text.replace(/\s+$/, '');
  }
  const quirks = quirksFor(cfg.baseUrl, cfg.model);
  const body: Record<string, unknown> = {
    // 中转站把「-thinking」版本改写成新模型不认的旧式思考参数：撞过就去掉后缀发（与 OpenAI 兼容口同一份怪癖）
    model: quirks.sendAs ?? cfg.model,
    max_tokens: Math.max(1, Math.round(opts.maxTokens)),
    messages: turns,
    stream: opts.stream,
  };
  if (system.length) body.system = system.join('\n\n');
  if (opts.temperature !== undefined && !quirks.noTemperature) {
    body.temperature = Math.min(1, Math.max(0, opts.temperature));
  }
  return body;
}

/** 非流式回包 → 正文 / 思考 / 结束原因（max_tokens 记成 OpenAI 口径的 length，便于共用加预算重试） */
export function parseAnthropicResponse(data: unknown): { text: string; reasoning: string; finish: string } {
  const d = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
  const blocks = Array.isArray(d.content) ? d.content as Array<Record<string, unknown>> : [];
  const text = blocks.filter((b) => b?.type === 'text').map((b) => String(b.text ?? '')).join('');
  const reasoning = blocks.filter((b) => b?.type === 'thinking').map((b) => String(b.thinking ?? '')).join('');
  const stop = typeof d.stop_reason === 'string' ? d.stop_reason : '';
  return { text, reasoning, finish: stop === 'max_tokens' ? 'length' : stop ? 'stop' : '' };
}

export type AnthropicStreamEvent =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'finish'; reason: string }
  | { kind: 'stop' }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'other' };

/** 流式里一条 data: JSON → 事件（text_delta / thinking_delta / message_delta.stop_reason / message_stop / error） */
export function mapAnthropicStreamEvent(json: unknown): AnthropicStreamEvent {
  const j = (json && typeof json === 'object') ? json as Record<string, unknown> : {};
  const delta = (j.delta && typeof j.delta === 'object') ? j.delta as Record<string, unknown> : {};
  switch (j.type) {
    case 'content_block_delta':
      if (delta.type === 'text_delta' && typeof delta.text === 'string') return { kind: 'text', text: delta.text };
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') return { kind: 'reasoning', text: delta.thinking };
      return { kind: 'other' };
    case 'message_delta':
      return typeof delta.stop_reason === 'string' && delta.stop_reason
        ? { kind: 'finish', reason: delta.stop_reason === 'max_tokens' ? 'length' : 'stop' }
        : { kind: 'other' };
    case 'message_stop':
      return { kind: 'stop' };
    case 'error': {
      const err = (j.error && typeof j.error === 'object') ? j.error as Record<string, unknown> : {};
      const type = String(err.type ?? '');
      const status = /overloaded/i.test(type) ? 503 : /rate_limit/i.test(type) ? 429 : /invalid_request/i.test(type) ? 400 : 500;
      return { kind: 'error', status, message: String(err.message ?? type ?? 'error') };
    }
    default:
      return { kind: 'other' };
  }
}
