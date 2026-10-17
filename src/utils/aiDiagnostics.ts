/**
 * AI 请求诊断日志（第 13 轮 · AI 服务改造；第 24 批加用量）：本机记最近 200 次 AI 请求的「结果」，一键复制给开发者排查。
 *
 * 只记：时间、哪类请求、用途（分诊 / 表演 / 归档…）、哪一档、服务商、主机名、模型名、成没成 / HTTP 状态、耗时、
 * 首字耗时、token 用量（输入 / 命中缓存 / 输出 / 思考）、走没走原生通道、一句脱过敏的错误摘要。
 * **不记**任何请求内容、回复内容和 Key；错误摘要里像 Key / Token 的串一律打码。
 * 存 localStorage（按设备，不上云、不进备份）；任何异常都吞掉——诊断不能影响正常请求。
 */
import type { Settings } from '@/types';

export type AIDiagKind = 'chat' | 'stream' | 'test' | 'models' | 'balance' | 'audio';

export interface AIDiagEntry {
  /** 时间戳 */
  t: number;
  kind: AIDiagKind;
  /** 档位（fast / deliberate / assistant / vision / audio）；测试连接等没有 */
  tier?: string;
  provider?: string;
  host: string;
  model?: string;
  ok: boolean;
  /** HTTP 状态；网络层失败为 0 */
  status: number;
  ms: number;
  native?: boolean;
  /** 脱敏后的错误摘要（≤140 字） */
  err?: string;
  /** 用途（第 24 批）：triage / perform / greet / compact / sniff / ownday / early-summary / tarot…；调用方给 */
  purpose?: string;
  /** 首个正文字到达的毫秒数（流式才有） */
  firstMs?: number;
  /** 输入 token（含命中缓存的） */
  inTok?: number;
  /** 命中缓存的输入 token（DeepSeek prompt_cache_hit_tokens / OpenAI cached_tokens / Anthropic cache_read） */
  cacheTok?: number;
  /** 输出 token（含思考） */
  outTok?: number;
  /** 思考 token */
  reasonTok?: number;
}

const KEY = 'velvet:aiDiag.v1';
const MAX = 200;

/** 打码：sk-xxx、Bearer xxx、key=xxx、长串字母数字（≥28 位，多半是 Key / Token） */
export function redactAIText(s: string): string {
  return String(s ?? '')
    .replace(/sk-[A-Za-z0-9_\-*.]{4,}/g, 'sk-***')
    .replace(/Bearer\s+[^\s"',]+/gi, 'Bearer ***')
    .replace(/([?&]key=)[^&\s"']+/gi, '$1***')
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g, '***')
    .slice(0, 140);
}

export const hostOf = (url: string): string => {
  try { return new URL(url).host; } catch { return ''; }
};

export function readAIDiag(): AIDiagEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr as AIDiagEntry[] : [];
  } catch { return []; }
}

export function recordAIDiag(e: Omit<AIDiagEntry, 't'> & { t?: number }): number {
  const t = e.t ?? Date.now();
  try {
    const entry: AIDiagEntry = { ...e, t, err: e.err ? redactAIText(e.err) : undefined };
    const next = [...readAIDiag(), entry].slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* 存不了就算了 */ }
  return t;
}

/** 回包读完后把用量补到那条记录上（按 recordAIDiag 返回的时间戳认；找不到就算了） */
export function patchAIDiag(t: number, patch: Partial<Pick<AIDiagEntry, 'firstMs' | 'inTok' | 'cacheTok' | 'outTok' | 'reasonTok' | 'ms'>>): void {
  try {
    const rows = readAIDiag();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].t === t) {
        rows[i] = { ...rows[i], ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
        localStorage.setItem(KEY, JSON.stringify(rows));
        return;
      }
    }
  } catch { /* */ }
}

/** OpenAI 兼容口 / Anthropic 的 usage → 四个数（认不出来的字段就不写） */
export function usageFromResponse(usage: unknown): Pick<AIDiagEntry, 'inTok' | 'cacheTok' | 'outTok' | 'reasonTok'> {
  const u = (usage && typeof usage === 'object') ? usage as Record<string, unknown> : {};
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const details = (k: string): Record<string, unknown> => (u[k] && typeof u[k] === 'object' ? u[k] as Record<string, unknown> : {});
  // Anthropic：input_tokens 不含命中的那部分，合起来才是「输入」
  const anthroIn = num(u.input_tokens);
  const anthroCache = num(u.cache_read_input_tokens);
  const anthroCreate = num(u.cache_creation_input_tokens);
  const inTok = num(u.prompt_tokens) ?? (anthroIn !== undefined ? anthroIn + (anthroCache ?? 0) + (anthroCreate ?? 0) : undefined);
  const cacheTok = num(u.prompt_cache_hit_tokens) ?? num(details('prompt_tokens_details').cached_tokens) ?? anthroCache;
  const outTok = num(u.completion_tokens) ?? num(u.output_tokens);
  const reasonTok = num(details('completion_tokens_details').reasoning_tokens);
  return { inTok, cacheTok, outTok, reasonTok };
}

export interface AIUsageSummary {
  calls: number;
  ok: number;
  inTok: number;
  cacheTok: number;
  outTok: number;
  reasonTok: number;
  /** 有用量数据的请求数（算命中率的分母） */
  metered: number;
  byPurpose: Array<{ purpose: string; calls: number; avgMs: number; avgIn: number; hitRate: number | null; avgOut: number }>;
}

/** 最近 N 天的用量汇总（设置页「最近用量」用；全部本地算） */
export function summarizeAIUsage(days = 7, rows: AIDiagEntry[] = readAIDiag()): AIUsageSummary {
  const since = Date.now() - days * 86400_000;
  const recent = rows.filter((r) => r.t >= since && (r.kind === 'chat' || r.kind === 'stream'));
  const sum: AIUsageSummary = { calls: recent.length, ok: 0, inTok: 0, cacheTok: 0, outTok: 0, reasonTok: 0, metered: 0, byPurpose: [] };
  const groups = new Map<string, AIDiagEntry[]>();
  for (const r of recent) {
    if (r.ok) sum.ok++;
    if (r.inTok !== undefined) { sum.metered++; sum.inTok += r.inTok; sum.cacheTok += r.cacheTok ?? 0; sum.outTok += r.outTok ?? 0; sum.reasonTok += r.reasonTok ?? 0; }
    const k = r.purpose ?? '其他';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  for (const [purpose, list] of groups) {
    const metered = list.filter((r) => r.inTok !== undefined);
    const inSum = metered.reduce((n, r) => n + (r.inTok ?? 0), 0);
    const hit = metered.reduce((n, r) => n + (r.cacheTok ?? 0), 0);
    sum.byPurpose.push({
      purpose,
      calls: list.length,
      avgMs: Math.round(list.reduce((n, r) => n + r.ms, 0) / list.length),
      avgIn: metered.length ? Math.round(inSum / metered.length) : 0,
      hitRate: inSum > 0 ? hit / inSum : null,
      avgOut: metered.length ? Math.round(metered.reduce((n, r) => n + (r.outTok ?? 0), 0) / metered.length) : 0,
    });
  }
  sum.byPurpose.sort((a, b) => b.calls - a.calls);
  return sum;
}

export function clearAIDiag(): void {
  try { localStorage.removeItem(KEY); } catch { /* */ }
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

/**
 * 复制给开发者的诊断文本：版本 / 平台 / 各档配置（只有服务商、主机、模型名，没有 Key）/ 原生通道 / 最近请求。
 */
export function buildAIDiagnostics(settings: Settings, env: { version?: string; platform?: string } = {}): string {
  const active = settings.summaryApiProvider ?? 'deepseek';
  const host = (url?: string) => (url ? hostOf(url) || url : '默认地址');
  const lines: string[] = [
    `靛蓝色房间 AI 诊断 · ${new Date().toLocaleString('zh-CN')}`,
    `版本 ${env.version ?? '-'} · ${env.platform ?? '-'}`,
    `当前服务商：${active} · ${host(settings.summaryApiBaseUrl)} · 模型 ${settings.summaryModel || '默认'} · Key ${settings.summaryApiKey?.trim() ? '已填' : '未填'}`,
    `深思熟虑：${settings.navigatorProvider ?? '跟随'} · ${settings.navigatorModel || '跟随'}；助手：${settings.assistantProvider ?? '跟随'} · ${settings.assistantModel || '跟随'}`,
    `视觉：${settings.visionModel ? `${settings.visionProvider ?? active} · ${settings.visionModel}` : '未启用'}；听觉：${settings.audioModel ? `${settings.audioProvider ?? active} · ${settings.audioModel}` : '未启用'}`,
    `已存 Key 的服务商：${Object.entries(settings.aiProfiles ?? {}).filter(([, v]) => v?.key?.trim()).map(([k]) => k).join('、') || '无'}`,
    `走原生通道的主机：${(settings.aiNativeHosts ?? []).join('、') || '无'}`,
    '',
    `最近 ${MAX} 次请求（旧 → 新；不含内容和 Key）：`,
  ];
  const rows = readAIDiag();
  if (!rows.length) lines.push('（还没有记录）');
  for (const r of rows) {
    lines.push([
      stamp(r.t), r.kind, r.purpose ?? '-', r.tier ?? '-', r.provider ?? '-', r.host || '-', r.model ?? '-',
      r.ok ? 'OK' : r.status ? `HTTP ${r.status}` : '连不上',
      `${r.ms}ms`, r.firstMs !== undefined ? `首字 ${r.firstMs}ms` : '',
      r.inTok !== undefined ? `in ${r.inTok}${r.cacheTok !== undefined ? `(命中 ${r.cacheTok})` : ''} out ${r.outTok ?? '-'}${r.reasonTok !== undefined ? `(思考 ${r.reasonTok})` : ''}` : '',
      r.native ? '原生' : '',
      r.err ? `· ${r.err}` : '',
    ].filter(Boolean).join(' '));
  }
  return lines.join('\n');
}
