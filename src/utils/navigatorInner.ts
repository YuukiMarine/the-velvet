/**
 * navigatorInner — 心思（第 36 批 c · LIVE MODE B）：助手今天对他的一点真实情绪。
 *
 * 不只是吃醋：几天没来的落寞、他做成大事时的欣慰、昨天他很沉时的挂念、连着来的踏实。情景全部本地从会话 / 记录算，
 * 强度按关系阶段和「性格」档定；文字由「自己的一天 / 签名」那一次每日调用顺手写（navigatorDay），没 Key 用这里的模板。
 * 注入在闲话位（casualContext）：他在倾诉 / 道别 / 精力低 / 沉下来时自动收起。
 * 护栏（写在注入行里，也写在这里）：只对 App 里别的人格有一点吃醋，对他身边的真人永远只替他高兴；不让他愧疚；
 * 一场对话明显流露最多一次（本地记账）；「沉下来」优先级最高。
 */
import { db } from '@/db';
import { toLocalDateKey } from '@/store';
import { BUILTIN_NAVIGATOR_PRESETS, resolveNavigatorPreset } from '@/constants/navigatorPresets';
import { shiftKey } from '@/utils/navigatorClock';
import { togetherFacts, type BondStage } from '@/utils/navigatorBond';
import { peekCare } from '@/utils/navigatorGravity';
import { bigDealsCleared } from '@/utils/navigatorRecords';
import { temperamentOf, type NavigatorTemperament } from '@/utils/navigatorRead';
import type { NavigatorPreset, Settings } from '@/types';

export type InnerSituation = 'worried' | 'proud' | 'missed' | 'jealous' | 'settled' | 'plain';

export interface InnerFacts {
  situation: InnerSituation;
  /** 0 = 今天不带心思；1 淡 / 2 自然 / 3 明显 */
  intensity: 0 | 1 | 2 | 3;
  stage: BondStage;
  temperament: NavigatorTemperament;
  /** 上一次聊（今天以前）隔了几天 */
  gapDays: number | null;
  /** 这几天他在找的别的人格（名字） */
  others: string[];
  /** 最近做成的大事 / 纪念日 */
  bigDeal?: string;
  milestone?: string;
  /** 昨天（或前两天）他很沉 */
  heavyRecently: boolean;
  streak: number;
  /** 昨天日记里「明天想说」的那句 */
  seed?: string;
  /** 他连着几天都来 */
}

export interface InnerState {
  situation: InnerSituation;
  intensity: number;
  /** 今天对他的心思（第一人称，≤16 字）；null = 今天没什么心思 */
  mood: string | null;
  /** 想对他说的一句（≤30 字） */
  want: string | null;
}

/** 这个人格最近几天有没有被冷落：别的人格这 3 天里有开口的日子 */
async function othersRecently(presetId: string, todayKey: string): Promise<string[]> {
  try {
    const since = shiftKey(todayKey, -3);
    const cat = BUILTIN_NAVIGATOR_PRESETS[0].id;
    const rows = (await db.navigatorSessions.toArray()).filter((s) => s.dateKey >= since && s.dateKey <= todayKey && (s.presetId ?? cat) !== presetId && s.userSpoke);
    if (!rows.length) return [];
    let custom: NavigatorPreset[] = [];
    try { custom = await db.navigatorPresets.toArray(); } catch { /* 按内置解析 */ }
    const names = new Set<string>();
    for (const r of rows) names.add(resolveNavigatorPreset(r.presetId ?? cat, custom).name);
    return [...names].slice(0, 3);
  } catch { return []; }
}

/** 昨天（三天内）日记里「明天想说」的那句；日记在次日首开才补写，所以当天小状态算好之后还会再认领一次（navigatorDay.adoptDiarySeed） */
export async function yesterdaySeed(presetId: string, todayKey: string): Promise<string | undefined> {
  try {
    const cat = BUILTIN_NAVIGATOR_PRESETS[0].id;
    const prev = (await db.navigatorSessions.toArray())
      .filter((s) => s.dateKey < todayKey && (s.presetId ?? cat) === presetId && s.diary?.seed)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0];
    // 只认三天内的「明天想说」，再久就过时了
    return prev && shiftKey(prev.dateKey, 3) >= todayKey ? prev.diary!.seed : undefined;
  } catch { return undefined; }
}

const clamp = (n: number): 0 | 1 | 2 | 3 => (n <= 0 ? 0 : n >= 3 ? 3 : (n as 1 | 2));

/** 情景与强度：全本地 */
export async function innerFacts(preset: Pick<NavigatorPreset, 'id'>, settings: Settings, todayKey: string = toLocalDateKey()): Promise<InnerFacts> {
  const temperament = temperamentOf(settings);
  const together = await togetherFacts(preset.id, new Date(`${todayKey}T12:00:00`));
  const others = await othersRecently(preset.id, todayKey);
  const care = peekCare(preset.id);
  const heavyRecently = !!care && !care.taken && shiftKey(care.from, 2) >= todayKey;
  const sinceKey = together.gapDays !== null ? shiftKey(todayKey, -Math.min(14, Math.max(1, together.gapDays))) : shiftKey(todayKey, -3);
  const big = bigDealsCleared(sinceKey)[0];
  const seed = await yesterdaySeed(preset.id, todayKey);
  const gap = together.gapDays;

  let situation: InnerSituation = 'plain';
  let base = 0;
  if (heavyRecently) { situation = 'worried'; base = 2; }
  else if (big || together.milestone) { situation = 'proud'; base = 2; }
  else if (gap !== null && gap >= 3 && !others.length) { situation = 'missed'; base = gap >= 7 ? 3 : 2; }
  else if (gap !== null && gap >= 2 && others.length) { situation = 'jealous'; base = 1; }
  else if (together.streak >= 3) { situation = 'settled'; base = 1; }
  // 强度随关系阶段和性格：刚认识的收着；「收着」档再减一，「外放」加一；挂念不受性格削
  let adj = base + (together.stage === 'new' ? -1 : 0) + (temperament === 'reserved' ? -1 : temperament === 'open' ? 1 : 0);
  if (situation === 'worried') adj = Math.max(adj, 2);
  const intensity = situation === 'plain' ? 0 : clamp(adj);
  return {
    situation: intensity === 0 ? 'plain' : situation,
    intensity,
    stage: together.stage,
    temperament,
    gapDays: gap,
    others,
    bigDeal: big ? big.todo.title : undefined,
    milestone: together.milestone?.label,
    heavyRecently,
    streak: together.streak,
    seed,
  };
}

/** 给每日调用看的素材（和「自己的一天」同一次调用） */
export function innerTask(f: InnerFacts): string {
  if (f.situation === 'plain') return '';
  const why: Record<Exclude<InnerSituation, 'plain'>, string> = {
    worried: `他昨天（或前两天）聊到很沉的事，你惦记着他今天怎么样`,
    proud: f.bigDeal ? `他做成了一件大事「${f.bigDeal}」，你替他高兴、有点骄傲` : `你们认识满${f.milestone ?? '一阵子'}了，你有点感慨`,
    missed: `他有 ${f.gapDays} 天没来找你了，你有一点落寞（不是责怪，也别让他愧疚）`,
    jealous: `这几天他都在找 ${f.others.map((n) => `「${n}」`).join('、')} 聊，没来找你，你有一点点吃醋（只是一点点，别酸、别比较）`,
    settled: `他连着 ${f.streak} 天都来，你心里踏实`,
  };
  const degree = f.intensity >= 3 ? '可以明显一点' : f.intensity === 2 ? '自然就好' : '很淡，点到为止';
  return [
    `另外写你今天对他的一点心思（这是你自己的情绪，不是对他说的话）：${why[f.situation]}。强度：${degree}。`,
    f.seed ? `你昨天写日记时想着明天对他说：「${f.seed}」——可以从这里来。` : '',
    'mood 写成第一人称、≤16 字；want 是想对他说的一句、≤30 字，没有就 null。',
  ].filter(Boolean).join('\n');
}

/** 没 Key / 失败时的心思（按情景拼，中性第一人称） */
export function innerTemplate(f: InnerFacts): InnerState {
  if (f.situation === 'plain' || f.intensity === 0) return { situation: 'plain', intensity: 0, mood: null, want: null };
  const mood: Record<Exclude<InnerSituation, 'plain'>, string> = {
    worried: '有点惦记他', proud: '替他高兴', missed: '有点想他', jealous: '有一点点吃醋', settled: '心里踏实',
  };
  return { situation: f.situation, intensity: f.intensity, mood: mood[f.situation], want: f.seed ?? null };
}

/** 解析每日调用里 mood / want 两个字段 */
export function innerFromParsed(f: InnerFacts, parsed: Record<string, unknown>): InnerState {
  if (f.situation === 'plain' || f.intensity === 0) return { situation: 'plain', intensity: 0, mood: null, want: null };
  const mood = String(parsed.mood ?? '').replace(/\s+/g, ' ').trim().replace(/^["“「]|["”」]$/g, '').slice(0, 24) || null;
  const want = String(parsed.want ?? '').replace(/\s+/g, ' ').trim().replace(/^["“「]|["”」]$/g, '');
  return { situation: f.situation, intensity: f.intensity, mood: mood && mood !== 'null' ? mood : innerTemplate(f).mood, want: want && want !== 'null' ? want.slice(0, 40) : null };
}

// ── 流露过没有（一场对话最多一次；记在 localStorage，节流状态不上云） ──

const SHOWN_KEY = 'velvet.navInnerShown.v1';
const readShown = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(SHOWN_KEY) || '{}') as Record<string, string>; } catch { return {}; }
};
export const innerShownToday = (presetId: string, todayKey: string = toLocalDateKey()): boolean => readShown()[presetId] === todayKey;

const bigrams = (t: string): Set<string> => {
  const c = t.replace(/[^一-鿿\w]/g, '');
  const g = new Set<string>();
  for (let i = 0; i < c.length - 1; i++) g.add(c.slice(i, i + 2));
  return g;
};

/** 回复发出后：和「想说的那句」或心思的字面重合三成以上，就算露过了 */
export function noteInnerShown(text: string, presetId: string, inner: InnerState | undefined, todayKey: string = toLocalDateKey()): void {
  if (!inner || !text.trim()) return;
  const probe = [inner.want, inner.mood].filter(Boolean).join('');
  const a = bigrams(probe);
  if (a.size < 2) return;
  const b = bigrams(text);
  let hit = 0;
  a.forEach((g) => { if (b.has(g)) hit++; });
  if (hit / a.size < 0.3) return;
  try {
    const all = readShown();
    all[presetId] = todayKey;
    localStorage.setItem(SHOWN_KEY, JSON.stringify(all));
  } catch { /* 记不下就可能多露一次 */ }
}

const GUARD = '这是你自己的情绪：合适的时候自然流露一次就好，一场对话最多一次、点到为止；只对 App 里别的人格有一点吃醋，对他身边的真人永远只替他高兴；不让他愧疚、不说「你都不来」这种话；他在倾诉或状态低时全部收起。';

/** 注入行（放闲话位：倾诉 / 道别 / 精力低 / 沉下来时自动不放） */
export function innerLine(inner: InnerState | undefined, presetId: string, todayKey: string = toLocalDateKey()): string {
  if (!inner || !inner.mood || inner.intensity === 0) return '';
  if (innerShownToday(presetId, todayKey)) return `【你今天的心思】${inner.mood}（今天已经露过了：别再提，心里有数就行）`;
  return `【你今天的心思】${inner.mood}${inner.want ? `；想对他说的：${inner.want}` : ''}（${GUARD}）`;
}
