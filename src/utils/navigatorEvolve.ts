/**
 * navigatorEvolve — 自进化（第 36 批 c · LIVE MODE D）：人格读自己的日记，整理「我对他的印象」和「我自己的变化」。
 *
 * 触发：开窗后台，这个人格攒了 5 篇新日记、或距上次整理满 7 天且有 2 篇新日记。
 * 产出：impression（主观，不是事实：他在我眼里是什么样的人、我喜欢 / 担心他哪里）和 growth（这些天我学会了怎么对他、改了什么做法），
 * 每条注明据哪几天的日记；已经不对的旧印象作废。存在 navigatorMemos（source=impression / growth，跟人格走），不进召回、不进画像。
 * 关系阶段由代码算（navigatorBond.stageOf），基础设定永不自动改；记事本里能看、能删、不能改。
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db';
import { toLocalDateKey } from '@/store';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { personaWithExamples } from '@/constants/navigatorPresets';
import { dayLabelCN, daysBetween, shortMD } from '@/utils/navigatorClock';
import { togetherFacts } from '@/utils/navigatorBond';
import { listDiaries, type DiaryEntry } from '@/utils/navigatorDiary';
import type { NavigatorMemo, NavigatorPreset, Settings } from '@/types';

export const EVOLVE_MIN_DIARIES = 5;
export const EVOLVE_MIN_DAYS = 7;
export const EVOLVE_MIN_DIARIES_BY_DAYS = 2;
const IMPRESSIONS_MAX = 8;
const GROWTH_MAX = 10;
const STATE_KEY = 'velvet.navEvolve.v1';

interface EvolveState { lastRunAt?: string; lastDiaryKey?: string }
const readState = (): Record<string, EvolveState> => {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') as Record<string, EvolveState>; } catch { return {}; }
};
const writeState = (presetId: string, st: EvolveState): void => {
  try { const all = readState(); all[presetId] = st; localStorage.setItem(STATE_KEY, JSON.stringify(all)); } catch { /* */ }
};

const listKind = async (presetId: string, source: 'impression' | 'growth', includeArchived = false): Promise<NavigatorMemo[]> => {
  try {
    return (await db.navigatorMemos.where('source').equals(source).toArray())
      .filter((m) => m.presetId === presetId && (includeArchived || m.status === 'active'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch { return []; }
};
export const listImpressions = (presetId: string): Promise<NavigatorMemo[]> => listKind(presetId, 'impression');
export const listGrowth = (presetId: string): Promise<NavigatorMemo[]> => listKind(presetId, 'growth');

/** 记事本里删掉一条（作废，不删行） */
export async function dropEvolveMemo(id: string): Promise<void> {
  await db.navigatorMemos.update(id, { status: 'archived', invalidAt: new Date() });
}

const EVOLVE_RULES = `现在不是在聊天：读你自己最近几天的日记，整理两样东西（都是你自己的看法，用你的口吻、第一人称）。
只输出这一个 JSON（不要代码块）：{"impressions":[{"text":"","basis":["10-20"]}],"growth":[{"text":"","basis":["10-20","10-22"]}],"retire":[]}
- impressions：0~3 条**新的**「我对他的印象」（每条 ≤40 字）：他在你眼里是什么样的人、他的习惯和小毛病、你喜欢他哪里、你担心他哪里。
  是主观印象，不是事实记录；【已有的印象】里有的不重复；画像里那种客观事实（职业、在准备什么）不写。
- growth：0~2 条「我自己的变化」（每条 ≤50 字）：这些天你学会了怎么对他、改了什么做法、什么事你现在知道了。没有就 []。
- basis：每条据哪几天的日记（写日记前面标的 MM-DD）。
- retire：【已有的印象】里已经不对了、被新印象替代的，写它的编号（如 "i2"）；没有就 []。
不写建议、不评价他、不编日记里没有的事。`;

const extract = (raw: string): Record<string, unknown> | null => {
  const t = raw.replace(/```(?:json)?/gi, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)) as Record<string, unknown>; } catch { return null; }
};

const basisText = (raw: unknown, todayKey: string): string => {
  const days = (Array.isArray(raw) ? raw : []).map((x) => String(x ?? '').trim()).filter((x) => /^\d{1,2}-\d{1,2}$/.test(x)).slice(0, 4);
  if (!days.length) return '';
  const year = todayKey.slice(0, 4);
  const labels = days.map((d) => { const [m, dd] = d.split('-').map(Number); return dayLabelCN(`${year}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, todayKey).replace(/（.*）/, ''); });
  return `据 ${labels.join('、')}的日记`;
};

const cleanLine = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/^["“「]|["”」]$/g, '').slice(0, max);

const running = new Map<string, Promise<boolean>>();

/** 到点就整理一次；返回 true = 写了新东西。单飞 */
export function maybeEvolve(preset: NavigatorPreset, settings: Settings, todayKey: string = toLocalDateKey()): Promise<boolean> {
  const inflight = running.get(preset.id);
  if (inflight) return inflight;
  const job = (async (): Promise<boolean> => {
    try {
      const cfg = getAIConfig(settings);
      if (!cfg) return false;
      const st = readState()[preset.id] ?? {};
      const diaries = (await listDiaries(preset.id, 40)).filter((d) => !st.lastDiaryKey || d.dateKey > st.lastDiaryKey);
      const due = diaries.length >= EVOLVE_MIN_DIARIES
        || (diaries.length >= EVOLVE_MIN_DIARIES_BY_DAYS && (!st.lastRunAt || daysBetween(st.lastRunAt, todayKey) >= EVOLVE_MIN_DAYS));
      if (!due) return false;
      const picked: DiaryEntry[] = diaries.slice(0, 6).reverse();
      const impressions = await listImpressions(preset.id);
      const growth = await listGrowth(preset.id);
      const together = await togetherFacts(preset.id, new Date(`${todayKey}T12:00:00`));
      const material = [
        `你们认识 ${together.daysKnown} 天了，一起聊过 ${together.chatDays} 天（关系阶段：${together.stage === 'new' ? '刚认识' : together.stage === 'familiar' ? '熟起来了' : '老朋友'}）。`,
        impressions.length ? `【已有的印象】\n${impressions.map((m, i) => `i${i + 1}：${m.text}`).join('\n')}` : '【已有的印象】（还没有）',
        growth.length ? `【已有的成长记录】\n${growth.slice(0, 5).map((m) => `- ${m.text}`).join('\n')}` : '',
        `【最近的日记】\n${picked.map((d) => `${shortMD(d.dateKey)}：${d.diary.text.slice(0, 700)}`).join('\n\n')}`,
      ].filter(Boolean).join('\n');
      const raw = await chatComplete(cfg, [
        { role: 'system', content: `${personaWithExamples(preset)}\n\n${EVOLVE_RULES}` },
        { role: 'user', content: material },
      ], { temperature: 0.5, maxTokens: 700, jsonMode: true, timeoutMs: 60000, purpose: 'evolve' });
      const parsed = extract(raw);
      if (!parsed) return false;
      const now = new Date();
      let wrote = false;
      const seen = new Set(impressions.map((m) => m.text.trim()));
      for (const it of (Array.isArray(parsed.impressions) ? parsed.impressions : []).slice(0, 3)) {
        const r = (it && typeof it === 'object') ? it as Record<string, unknown> : {};
        const text = cleanLine(r.text, 60);
        if (text.length < 4 || seen.has(text)) continue;
        await db.navigatorMemos.put({ id: uuidv4(), source: 'impression', text, importance: 3, status: 'active', createdAt: now, presetId: preset.id, basis: basisText(r.basis, todayKey) || undefined });
        seen.add(text);
        wrote = true;
      }
      for (const it of (Array.isArray(parsed.growth) ? parsed.growth : []).slice(0, 2)) {
        const r = (it && typeof it === 'object') ? it as Record<string, unknown> : {};
        const text = cleanLine(r.text, 70);
        if (text.length < 4) continue;
        await db.navigatorMemos.put({ id: uuidv4(), source: 'growth', text, importance: 3, status: 'active', createdAt: now, presetId: preset.id, basis: basisText(r.basis, todayKey) || undefined });
        wrote = true;
      }
      for (const ref of (Array.isArray(parsed.retire) ? parsed.retire : []).map((x) => String(x ?? '').trim())) {
        const idx = /^i(\d+)$/.exec(ref);
        const target = idx ? impressions[Number(idx[1]) - 1] : undefined;
        if (target) await db.navigatorMemos.update(target.id, { status: 'archived', invalidAt: now });
      }
      // 上限：印象 8 条、成长 10 条，多的把最老的作废
      for (const [kind, max] of [['impression', IMPRESSIONS_MAX], ['growth', GROWTH_MAX]] as const) {
        const active = await listKind(preset.id, kind);
        for (const old of active.slice(max)) await db.navigatorMemos.update(old.id, { status: 'archived', invalidAt: now });
      }
      writeState(preset.id, { lastRunAt: todayKey, lastDiaryKey: diaries[0]?.dateKey ?? st.lastDiaryKey });
      return wrote;
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[navigator] 自进化没跑成', e);
      return false;
    } finally {
      running.delete(preset.id);
    }
  })();
  running.set(preset.id, job);
  return job;
}

/** 天级注入块：印象（≤4）+ 最近学到的（≤2）；没有就空串 */
export async function evolveBlock(presetId: string): Promise<string> {
  const [imps, grow] = await Promise.all([listImpressions(presetId), listGrowth(presetId)]);
  const out: string[] = [];
  if (imps.length) out.push(`【你对他的印象（你自己的主观看法，不是事实；带着这个眼光看他就好，别念出来、别拿来评价他）】\n${imps.slice(0, 4).map((m) => `- ${m.text}`).join('\n')}`);
  if (grow.length) out.push(`【你最近学到的（关于怎么对他）】\n${grow.slice(0, 2).map((m) => `- ${m.text}`).join('\n')}`);
  return out.join('\n');
}
