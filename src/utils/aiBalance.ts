/**
 * 账户余额（第 13 轮 · AI 服务改造）：**只在快用完时提醒**。余额低于 0.5（人民币账户 ¥0.5、美元账户 $0.5），
 * 或服务商说账户已经不能用了，连接卡上才冒出一行；平时一个字不露（用户口径：一直挂着会让人忍不住盯着看）。
 *
 * 能拿 API Key 查余额的只有这几家（按地址认，不管胶囊选的是哪家）：
 *   - DeepSeek（api.deepseek.com，人民币或美元，接口自带币种）
 *   - Kimi（api.moonshot.cn 人民币 / api.moonshot.ai 美元）
 *   - 硅基流动（自定义地址填 api.siliconflow.cn 人民币 / .com 美元）
 * OpenAI、千问（百炼）、Gemini、MiniMax 官方都没有拿 API Key 查余额的接口，只能登录控制台看；
 * 中转站不查：one-api 系的 /dashboard/billing 在部分站点配置下会把已用额度多扣一遍，算出来偏低，会误报。
 * 拿不到（网络 / 格式变了）就静默不显示。请求只带 Key，不带任何个人数据。
 */
import type { ApiProvider } from '@/utils/aiProviders';
import { aiFetch, hostOfUrl } from '@/utils/aiTransport';
import { recordAIDiag } from '@/utils/aiDiagnostics';

/** 低于这个数才提醒（按账户币种：¥0.5 / $0.5） */
export const LOW_BALANCE_THRESHOLD = 0.5;

type Currency = 'CNY' | 'USD';

export interface ProviderBalance {
  amount: number;
  currency: Currency;
  /** 「¥0.32」 */
  text: string;
  /** 余额不足：低于 0.5，或服务商说已不可用。界面只在这时显示 */
  low: boolean;
  /** 去充值的地方（控制台） */
  topUpUrl: string;
}

interface BalanceEndpoint { url: string; kind: 'deepseek' | 'kimi' | 'siliconflow'; currency: Currency; topUpUrl: string }

/** 这个地址有没有余额接口（只认官方主机） */
export function balanceEndpoint(baseUrl: string): BalanceEndpoint | null {
  const host = hostOfUrl(baseUrl);
  if (host === 'api.deepseek.com') {
    return { url: 'https://api.deepseek.com/user/balance', kind: 'deepseek', currency: 'CNY', topUpUrl: 'https://platform.deepseek.com/top_up' };
  }
  if (host === 'api.moonshot.cn') {
    return { url: 'https://api.moonshot.cn/v1/users/me/balance', kind: 'kimi', currency: 'CNY', topUpUrl: 'https://platform.moonshot.cn/console/api-keys' };
  }
  if (host === 'api.moonshot.ai') {
    return { url: 'https://api.moonshot.ai/v1/users/me/balance', kind: 'kimi', currency: 'USD', topUpUrl: 'https://platform.moonshot.ai/' };
  }
  if (host === 'api.siliconflow.cn' || host === 'api.siliconflow.com') {
    const cn = host.endsWith('.cn');
    return { url: `https://${host}/v1/user/info`, kind: 'siliconflow', currency: cn ? 'CNY' : 'USD', topUpUrl: cn ? 'https://cloud.siliconflow.cn/' : 'https://cloud.siliconflow.com/' };
  }
  return null;
}

export function formatMoney(n: number, currency: Currency): string {
  const sym = currency === 'USD' ? '$' : '¥';
  return `${n < 0 ? '-' : ''}${sym}${Math.abs(n).toFixed(2)}`;
}

/** 解析三家的返回体；认不出返回 null */
export function parseBalance(ep: BalanceEndpoint, j: unknown): Omit<ProviderBalance, 'text' | 'low' | 'topUpUrl'> & { unavailable?: boolean } | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (ep.kind === 'deepseek') {
    // { is_available, balance_infos: [{ currency, total_balance, granted_balance, topped_up_balance }] }
    const infos = Array.isArray(o.balance_infos) ? o.balance_infos as Array<Record<string, unknown>> : [];
    const info = infos.find((x) => x.currency === 'CNY') ?? infos[0];
    const amount = Number(info?.total_balance);
    if (!info || !Number.isFinite(amount)) return null;
    return { amount, currency: info.currency === 'USD' ? 'USD' : 'CNY', unavailable: o.is_available === false };
  }
  const data = (o.data && typeof o.data === 'object') ? o.data as Record<string, unknown> : null;
  if (!data) return null;
  if (ep.kind === 'kimi') {
    // { code, data: { available_balance, voucher_balance, cash_balance }, status }；available ≤ 0 就调不动了
    const amount = Number(data.available_balance);
    return Number.isFinite(amount) ? { amount, currency: ep.currency } : null;
  }
  // 硅基流动：{ code: 20000, status: true, data: { balance（赠送）, chargeBalance（充值）, totalBalance } }
  const total = Number(data.totalBalance);
  const amount = Number.isFinite(total) ? total : Number(data.balance) + Number(data.chargeBalance);
  return Number.isFinite(amount) ? { amount, currency: ep.currency } : null;
}

export async function fetchProviderBalance(
  provider: ApiProvider | undefined,
  apiKey: string,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<ProviderBalance | null> {
  const ep = balanceEndpoint(baseUrl);
  if (!ep || !apiKey.trim()) return null;
  const t0 = Date.now();
  try {
    const resp = await aiFetch(ep.url, { headers: { Authorization: `Bearer ${apiKey.trim()}` }, signal });
    recordAIDiag({ kind: 'balance', provider, host: hostOfUrl(ep.url), ok: resp.ok, status: resp.status, ms: Date.now() - t0 });
    if (!resp.ok) return null;
    const parsed = parseBalance(ep, await resp.json().catch(() => null));
    if (!parsed) return null;
    return {
      amount: parsed.amount,
      currency: parsed.currency,
      text: formatMoney(parsed.amount, parsed.currency),
      low: !!parsed.unavailable || parsed.amount < LOW_BALANCE_THRESHOLD,
      topUpUrl: ep.topUpUrl,
    };
  } catch (e) {
    // 页面关掉 / 换了服务商取消的不记；真连不上的记一笔，排查时看得到
    if (!(e instanceof Error && e.name === 'AbortError')) {
      recordAIDiag({ kind: 'balance', provider, host: hostOfUrl(ep.url), ok: false, status: 0, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) });
    }
    return null;
  }
}
