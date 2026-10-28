/**
 * navigatorTarot — 塔罗给助手看（第 35 批 f · 「让助手了解你的记录」高档）。
 *
 * 中档起助手只在被问到时才查塔罗（navigatorQueries 的 tarot）；高档把这些当背景直接摆在天级块里：
 *   · 近 14 天的每日塔罗：牌名 / 正逆 / 吉凶，今天那张带签语；
 *   · 进行中的中长期占卜：问题原话、周期、三张牌、一句结论（追问也带一行）；
 *   · 还在生效的窥探命运：结语 + 展望。
 * 全部本地算；「一句结论」有 Key 时用快速档把整篇解读压一次（每份只压一次，存 localStorage），
 * 没 Key / 失败就取解读末段的第一句。按天 + 数据签名缓存，放天级块里跟着人格一起吃前缀缓存。
 * 口径与简报一致：是背景不是汇报；主动提塔罗仍只按【主动话题】的许可；「刚认识」的人格头 7 天看不到。
 */
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { FORTUNE_META, PERIOD_LABELS, TAROT_BY_ID } from '@/constants/tarot';
import { dayLabelCN, relativeDayCN, shiftKey } from '@/utils/navigatorClock';
import { briefingAllowedFor, recordsHigh } from '@/utils/navigatorBriefing';
import type { DailyDivination, FateGlimpse, LongReading, NavigatorPreset, Settings } from '@/types';

export const TAROT_DAILY_DAYS = 14;
const CONCLUSION_MAX = 48;
const CONCLUSION_KEY = 'velvet.navTarotConclusion.v1';
/** 结论最多等这么久（第一次要调一次 AI）；超了这轮先用本地那句，下轮再带 AI 的 */
const CONCLUSION_WAIT_MS = 3000;

const cardName = (id: string): string => TAROT_BY_ID[id]?.name ?? id;
const orientCN = (o: string): string => (o === 'reversed' ? '逆位' : '正位');

// ── 一句结论（每份解读只压一次） ──

const readConclusions = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(CONCLUSION_KEY) || '{}') as Record<string, string>; } catch { return {}; }
};
const writeConclusion = (id: string, text: string): void => {
  try {
    const all = readConclusions();
    all[id] = text;
    // 只留最近的几十份（解读本身 14 天就过期）
    const keys = Object.keys(all);
    if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete all[k];
    localStorage.setItem(CONCLUSION_KEY, JSON.stringify(all));
  } catch { /* 存不了下次再压一次 */ }
};

/** 没 Key / 失败时：解读末段的第一句（去 markdown 记号） */
export function localConclusion(content: string): string {
  const paras = content.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/).map((p) => p.replace(/^[#>*\-\s]+/, '').replace(/[*_`]/g, '').trim()).filter((p) => p.length >= 6);
  const last = paras[paras.length - 1] ?? '';
  const first = last.split(/(?<=[。！？!?])/)[0]?.trim() ?? '';
  return (first || last).slice(0, CONCLUSION_MAX);
}

const inflight = new Map<string, Promise<string>>();

/** 这份解读的一句结论：缓存 → AI（快速档、瞬发、只压一次）→ 本地兜底 */
export function conclusionOf(reading: Pick<LongReading, 'id' | 'question' | 'content'>, settings: Settings): Promise<string> {
  const hit = readConclusions()[reading.id];
  if (hit) return Promise.resolve(hit);
  const fallback = localConclusion(reading.content);
  const cfg = getAIConfig(settings);
  if (!cfg || !reading.content.trim()) return Promise.resolve(fallback);
  const running = inflight.get(reading.id);
  if (running) return running;
  const job = (async (): Promise<string> => {
    try {
      const raw = await chatComplete(cfg, [
        {
          role: 'system',
          content: '把下面这篇塔罗解读压成**一句结论**（≤40 字，陈述句）：说清牌对这个问题给出的判断或建议本身，'
            + '不罗列牌名、不写「这张牌表示」、不加引号、不加前缀。只输出这一句。',
        },
        { role: 'user', content: `问题：${reading.question.trim().slice(0, 60)}\n解读：\n${reading.content.slice(0, 2400)}` },
      ], { temperature: 0.3, maxTokens: 120, instant: true, timeoutMs: 15000, purpose: 'tarot-conclusion' });
      const text = raw.replace(/```[a-z]*/gi, '').trim().replace(/^["“「]|["”」]$/g, '').split('\n')[0].trim().slice(0, CONCLUSION_MAX);
      if (text.length < 4) return fallback;
      writeConclusion(reading.id, text);
      return text;
    } catch {
      return fallback;
    } finally {
      inflight.delete(reading.id);
    }
  })();
  inflight.set(reading.id, job);
  return job;
}

// ── 块 ──

let cache: { sig: string; text: string } | null = null;

const dayTag = (key: string, todayKey: string): string => `${dayLabelCN(key, todayKey)}${key === todayKey ? '' : `，${relativeDayCN(key, todayKey)}`}`;

/** 只有数据的正文（不含标签行）；什么都没抽过返回空串 */
export async function buildTarotFacts(settings: Settings, todayKey: string = toLocalDateKey()): Promise<string> {
  let dailies: DailyDivination[] = [];
  let readings: LongReading[] = [];
  try {
    const since = shiftKey(todayKey, -(TAROT_DAILY_DAYS - 1));
    dailies = (await db.dailyDivinations.toArray()).filter((d) => d.date >= since && d.date <= todayKey).sort((a, b) => b.date.localeCompare(a.date));
  } catch { /* 读不到就当没有 */ }
  try {
    readings = (await db.longReadings.toArray())
      .filter((r) => !r.archived && r.expiresAt >= todayKey && r.content?.trim())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 2);
  } catch { /* */ }
  const glimpses: FateGlimpse[] = useAppStore.getState().fateGlimpses.filter((g) => g.buffEnd >= todayKey && g.buffStart <= todayKey);
  const sig = [todayKey, dailies.map((d) => `${d.date}:${d.cardId}`).join(','), readings.map((r) => r.id + (r.followUps?.length ?? 0)).join(','), glimpses.map((g) => g.id).join(',')].join('|');
  if (cache && cache.sig === sig) return cache.text;

  const lines: string[] = [];
  if (dailies.length) {
    lines.push(`每日塔罗（近 ${TAROT_DAILY_DAYS} 天，新的在上）：`);
    for (const d of dailies.slice(0, TAROT_DAILY_DAYS)) {
      const fortune = d.fortune ? FORTUNE_META[d.fortune]?.label : '';
      const today = d.date === todayKey;
      lines.push(`- ${dayTag(d.date, todayKey)}：「${cardName(d.cardId)}」${orientCN(d.orientation)}${fortune ? `，${fortune}` : ''}${today && d.advice ? `；签语「${d.advice.trim().slice(0, 40)}」` : ''}`);
    }
  }
  if (readings.length) {
    lines.push('进行中的占卜（问的是 ta 自己的原话）：');
    for (const r of readings) {
      const conclusion = await Promise.race([conclusionOf(r, settings), new Promise<string>((res) => setTimeout(() => res(localConclusion(r.content)), CONCLUSION_WAIT_MS))]);
      const cards = r.picked.map((c) => `「${cardName(c.cardId)}」${orientCN(c.orientation)}`).join('、');
      const created = toLocalDateKey(new Date(r.createdAt));
      lines.push(`- ${dayTag(created, todayKey)}问的「${r.question.trim().slice(0, 60)}」（${PERIOD_LABELS[r.period]?.label ?? r.period}，到 ${dayLabelCN(r.expiresAt, todayKey)}）：抽到 ${cards}${conclusion ? `；结论：${conclusion}` : ''}`);
      for (const f of (r.followUps ?? []).slice(0, 1)) {
        lines.push(`  追问「${f.question.trim().slice(0, 40)}」→「${cardName(f.cardId)}」${orientCN(f.orientation)}`);
      }
    }
  }
  for (const g of glimpses.slice(0, 1)) {
    const span = g.days.length ? `${dayLabelCN(g.days[0].date, todayKey)}–${dayLabelCN(g.days[g.days.length - 1].date, todayKey)}` : '';
    lines.push(`窥探命运（七天牌阵${span ? `，${span}` : ''}；加成到 ${dayLabelCN(g.buffEnd, todayKey)}）：结语「${g.verdict.trim().slice(0, 24)}」${g.outlook ? `；展望：${g.outlook.replace(/\s+/g, ' ').trim().slice(0, 60)}` : ''}`);
  }
  const text = lines.join('\n');
  cache = { sig, text };
  return text;
}

/** 天级块：标签 + 正文；不是高档 / 人格还在「刚认识」期 / 没抽过 → 空串 */
export async function tarotBlock(preset: NavigatorPreset, settings: Settings, todayKey: string = toLocalDateKey()): Promise<string> {
  if (!recordsHigh(settings) || !briefingAllowedFor(preset, todayKey)) return '';
  const body = await buildTarotFacts(settings, todayKey);
  if (!body) return '';
  return `【ta 最近的塔罗（App 里的记录；是你知道的背景，不是要汇报的：他问起、或和他此刻说的事正好对上时再提，别解牌、别复述解读；主动提塔罗仍只按【主动话题】的许可）】\n${body}`;
}
