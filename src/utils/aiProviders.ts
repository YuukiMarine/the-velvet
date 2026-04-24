/**
 * AI provider 配置与连接测试
 * 统一管理各 provider 的 baseUrl / defaultModel，避免分散在 store / Settings / SummaryModal 中重复
 * 所有 provider 均走 OpenAI 兼容的 /chat/completions 端点
 */

export type ApiProvider = 'openai' | 'deepseek' | 'kimi' | 'gemini' | 'minimax';

export interface ProviderConfig {
  id: ApiProvider;
  label: string;
  /** 默认 baseUrl（不含尾部斜杠） */
  defaultBaseUrl: string;
  /** 默认模型名 */
  defaultModel: string;
  /** Settings 中展示的模型提示 */
  hint: string;
}

export const AI_PROVIDERS: ProviderConfig[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    hint: 'gpt-4o-mini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    hint: 'deepseek-chat',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    hint: 'moonshot-v1-8k',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-1.5-flash',
    hint: 'gemini-1.5-flash',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    defaultBaseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'abab6.5s-chat',
    hint: 'abab6.5s-chat',
  },
];

export function getProviderConfig(provider: ApiProvider | undefined): ProviderConfig {
  return AI_PROVIDERS.find(p => p.id === provider) ?? AI_PROVIDERS[0];
}

/**
 * 解析运行时 baseUrl / model：优先使用用户在高级选项中的覆盖值，否则回退到 provider 默认
 */
export function resolveProvider(
  provider: ApiProvider | undefined,
  overrideBaseUrl?: string,
  overrideModel?: string
): { baseUrl: string; model: string } {
  const p = getProviderConfig(provider);
  const rawBase = (overrideBaseUrl?.trim() || p.defaultBaseUrl);
  const baseUrl = rawBase.replace(/\/+$/, '');
  const model = overrideModel?.trim() || p.defaultModel;
  return { baseUrl, model };
}

export type TestResult =
  | { ok: true; latencyMs: number; model: string }
  | { ok: false; error: string };

/**
 * 用最小 payload 探测 API 连接是否可用
 * - 超时 15 s，防止界面卡死
 * - 对 401 / 403 / 429 / 网络错误 / CORS 给出可读提示
 */
export async function testAIConnection(opts: {
  provider: ApiProvider;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): Promise<TestResult> {
  if (!opts.apiKey?.trim()) {
    return { ok: false, error: '请先填写 API 密钥' };
  }

  const { baseUrl, model } = resolveProvider(opts.provider, opts.baseUrl, opts.model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const start = Date.now();

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const snippet = body.slice(0, 200).trim();
      let hint = '';
      if (resp.status === 401) hint = '密钥无效或已过期';
      else if (resp.status === 403) hint = '无访问权限（Key 可能未开通该模型）';
      else if (resp.status === 404) hint = '接口地址或模型名不存在';
      else if (resp.status === 429) hint = '请求过于频繁或余额不足';
      return { ok: false, error: hint ? `${hint} (HTTP ${resp.status})` : `HTTP ${resp.status}: ${snippet || resp.statusText}` };
    }

    const data = await resp.json().catch(() => null);
    if (!data?.choices?.[0]?.message) {
      return { ok: false, error: '响应格式非 OpenAI 兼容，请检查 Base URL' };
    }
    return { ok: true, latencyMs, model };
  } catch (e) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: '连接超时（15s 无响应）' };
    }
    if (e instanceof TypeError) {
      return { ok: false, error: '网络错误：可能是 CORS 被拦截或无网络连接' };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
