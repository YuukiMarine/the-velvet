/**
 * AI 请求诊断日志（第 13 轮 · AI 服务改造）：本机记最近 40 次 AI 请求的「结果」，一键复制给开发者排查。
 *
 * 只记：时间、哪类请求、哪一档、服务商、主机名、模型名、成没成 / HTTP 状态、耗时、走没走原生通道、
 * 一句脱过敏的错误摘要。**不记**任何请求内容、回复内容和 Key；错误摘要里像 Key / Token 的串一律打码。
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
}

const KEY = 'velvet:aiDiag.v1';
const MAX = 40;

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

export function recordAIDiag(e: Omit<AIDiagEntry, 't'> & { t?: number }): void {
  try {
    const entry: AIDiagEntry = { ...e, t: e.t ?? Date.now(), err: e.err ? redactAIText(e.err) : undefined };
    const next = [...readAIDiag(), entry].slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* 存不了就算了 */ }
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
      stamp(r.t), r.kind, r.tier ?? '-', r.provider ?? '-', r.host || '-', r.model ?? '-',
      r.ok ? 'OK' : r.status ? `HTTP ${r.status}` : '连不上',
      `${r.ms}ms`, r.native ? '原生' : '',
      r.err ? `· ${r.err}` : '',
    ].filter(Boolean).join(' '));
  }
  return lines.join('\n');
}
