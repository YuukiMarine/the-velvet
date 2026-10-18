/**
 * navigatorPersona — 人格的派生资料（第 24 批 · PRD §24.10.7 C1 / C3）。
 *
 * 末尾人设锚：人格只在 system 开头出现一次，后面跟着几十条历史（全是它「自己」的口吻）和一大块数据，
 * 长对话里模型更像在模仿历史里的自己（Li et al. 2024：主流模型 8 轮内就明显偏离系统提示）。
 * 所以每轮在最新一句前面再贴一行「你是谁」（≤60 字）。内置人格手写在 navigatorPresets；自定义人格
 * 第一次用到时让 AI 按设定写一句存到人格上（同 navigatorDay 的固定喜好）；没 Key / 失败就用名字拼一句兜底、
 * 不存（下次再试）。编辑人格改了设定文本会清掉锚，下次重写。
 *
 * 口吻示例生成：自定义人格以前没有示例入口，只有内置三位有；这里按设定写三句，设置页里能改。
 */
import { db } from '@/db';
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { BUILTIN_NAVIGATOR_PRESETS } from '@/constants/navigatorPresets';
import type { NavigatorPreset, Settings } from '@/types';

export const ANCHOR_MAX = 60;

/** 没 Key / 还没生成时的兜底锚：只点名字，口吻交给上面的人格设定 */
export const fallbackAnchor = (preset: Pick<NavigatorPreset, 'name'>): string =>
  `你是「${preset.name}」：按上面的人格设定说话，保持它的口吻和性格。`;

/** 内置人格（设定文本没改过的）直接用代码里的锚；改过文本就当自定义处理 */
function builtinAnchor(preset: Pick<NavigatorPreset, 'id' | 'personaPrompt'>): string | null {
  const b = BUILTIN_NAVIGATOR_PRESETS.find((x) => x.id === preset.id);
  return b && b.personaPrompt === preset.personaPrompt ? (b.anchor ?? null) : null;
}

/** 同步版：拿手头有的（内置 / 已存 / 兜底），不发请求 */
export function anchorOf(preset: Pick<NavigatorPreset, 'id' | 'name' | 'personaPrompt' | 'anchor'>): string {
  return builtinAnchor(preset) ?? (preset.anchor?.trim() || fallbackAnchor(preset));
}

/** 注入行：锚 + 一句「别学历史里别的口吻」（系统回执以前是黑猫腔，模型会学过去） */
export const anchorLine = (anchor: string): string =>
  `【你是谁】${anchor}（历史里要是有别的口吻，包括系统回执的口吻，别学；照你自己的来）`;

/** 去代码块、并空白；整句被引号包着才去引号（「小雪」把书合上 这种开头的「不能剥） */
const cleanAnchor = (raw: string): string => {
  let t = raw.replace(/```[a-z]*/gi, '').replace(/\s+/g, ' ').trim();
  const pairs: Array<[string, string]> = [['"', '"'], ['“', '”'], ['「', '」'], ['『', '』']];
  for (const [l, r] of pairs) {
    if (t.startsWith(l) && t.endsWith(r) && t.indexOf(r) === t.length - 1) { t = t.slice(1, -1).trim(); break; }
  }
  return t.slice(0, ANCHOR_MAX + 20);
};

/** 单飞：同一人格并发用到时只生成一份 */
const generating = new Map<string, Promise<string>>();

/**
 * 当前人格的锚：内置 → 常量；自定义 → 存过的 / 库里的 / AI 写一句存起来 / 兜底。
 * 失败只返回兜底、不存，下次再试；永不抛。
 */
export async function ensurePersonaAnchor(preset: NavigatorPreset, settings: Settings): Promise<string> {
  const b = builtinAnchor(preset);
  if (b) return b;
  if (preset.anchor?.trim()) return preset.anchor.trim();
  try {
    const row = await db.navigatorPresets.get(preset.id);
    if (row?.anchor?.trim()) return row.anchor.trim();
  } catch { /* 读不到就生成 */ }
  const cfg = getAIConfig(settings);
  if (!cfg) return fallbackAnchor(preset);
  const inflight = generating.get(preset.id);
  if (inflight) return inflight;
  const run = (async (): Promise<string> => {
    try {
      const raw = await chatComplete(cfg, [
        {
          role: 'system',
          content: '你是人设整理员。把下面这段陪伴型角色的人格设定压成一句「你是谁」（第二人称，≤60 字）：'
            + '开头写「你是「名字」：」，接着只写最能定住口吻的三四个特征（性格、说话习惯、怎么称呼对方、一条底线）。'
            + '不写功能、不写格式要求、不写示例台词。只输出这一句。',
        },
        { role: 'user', content: `角色名：${preset.name}\n人格设定：${preset.personaPrompt.slice(0, 700)}` },
      ], { temperature: 0.4, maxTokens: 200, instant: true, purpose: 'persona-anchor' });
      const anchor = cleanAnchor(raw);
      if (anchor.length < 6) return fallbackAnchor(preset);
      try { await db.navigatorPresets.update(preset.id, { anchor }); } catch { /* 存不了下次再写 */ }
      return anchor;
    } catch {
      return fallbackAnchor(preset);
    } finally {
      generating.delete(preset.id);
    }
  })();
  generating.set(preset.id, run);
  return run;
}

// ── 认真模式（第 25 批 · 沉下来）：对方很沉时这个角色认真起来是什么样 ──

export const fallbackSerious = (preset: Pick<NavigatorPreset, 'name'>): string =>
  `「${preset.name}」收起平时的玩笑和口头禅，话少一点、慢一点，认真听他说；还是同一个人，只是认真起来。`;

function builtinSerious(preset: Pick<NavigatorPreset, 'id' | 'personaPrompt'>): string | null {
  const b = BUILTIN_NAVIGATOR_PRESETS.find((x) => x.id === preset.id);
  return b && b.personaPrompt === preset.personaPrompt ? (b.serious ?? null) : null;
}

/** 同步版：手头有的（内置 / 已存 / 兜底） */
export function seriousOf(preset: Pick<NavigatorPreset, 'id' | 'name' | 'personaPrompt' | 'serious'>): string {
  return builtinSerious(preset) ?? (preset.serious?.trim() || fallbackSerious(preset));
}

const generatingSerious = new Map<string, Promise<string>>();

/** 当前人格的认真模式：内置 → 常量；自定义 → 存过的 / 库里的 / AI 写一句存起来 / 兜底。永不抛 */
export async function ensurePersonaSerious(preset: NavigatorPreset, settings: Settings): Promise<string> {
  const b = builtinSerious(preset);
  if (b) return b;
  if (preset.serious?.trim()) return preset.serious.trim();
  try {
    const row = await db.navigatorPresets.get(preset.id);
    if (row?.serious?.trim()) return row.serious.trim();
  } catch { /* */ }
  const cfg = getAIConfig(settings);
  if (!cfg) return fallbackSerious(preset);
  const inflight = generatingSerious.get(preset.id);
  if (inflight) return inflight;
  const run = (async (): Promise<string> => {
    try {
      const raw = await chatComplete(cfg, [
        {
          role: 'system',
          content: '你是人设整理员。读下面这段陪伴型角色的人格设定，写一句「这个角色认真起来是什么样」（第二人称，≤60 字）：'
            + '对方说起很沉重、很绝望的事时，它会收起什么（玩笑 / 口头禅 / 刺 / 报告腔）、保留什么（自称、称呼、底色），语气怎么变。'
            + '它还是同一个角色，不是换成另一个人。只输出这一句，不写功能、不写建议。',
        },
        { role: 'user', content: `角色名：${preset.name}
人格设定：${preset.personaPrompt.slice(0, 700)}` },
      ], { temperature: 0.4, maxTokens: 200, instant: true, purpose: 'persona-serious' });
      const line = cleanAnchor(raw).slice(0, 90);
      if (line.length < 6) return fallbackSerious(preset);
      try { await db.navigatorPresets.update(preset.id, { serious: line }); } catch { /* */ }
      return line;
    } catch {
      return fallbackSerious(preset);
    } finally {
      generatingSerious.delete(preset.id);
    }
  })();
  generatingSerious.set(preset.id, run);
  return run;
}

/** 自定义人格的口吻示例（设置页「让 AI 写三句」）：三句 ≤40 字，只教语气和长短 */
export async function generatePersonaExamples(name: string, personaPrompt: string, settings: Settings): Promise<string[]> {
  const cfg = getAIConfig(settings);
  if (!cfg) throw new Error('未配置 AI');
  const raw = await chatComplete(cfg, [
    {
      role: 'system',
      content: '你是人设整理员。按下面这段陪伴型角色的人格设定，写 3 句这个角色平时会说的话：一句打招呼、一句接住对方的抱怨、一句催他去做事（或陪他）。'
        + '每句 ≤40 字，像真人聊天，不解释、不带引号、不写动作描写。只输出 JSON 数组：["…","…","…"]',
    },
    { role: 'user', content: `角色名：${name}\n人格设定：${personaPrompt.slice(0, 700)}` },
  ], { temperature: 0.9, maxTokens: 300, jsonMode: true, instant: true, purpose: 'persona-examples' });
  const s = raw.replace(/```(?:json)?/gi, '').trim();
  const a = s.indexOf('[');
  const b = s.lastIndexOf(']');
  if (a < 0 || b <= a) throw new Error('生成结果不是列表，换个说法再试试');
  const arr = JSON.parse(s.slice(a, b + 1)) as unknown;
  const lines = (Array.isArray(arr) ? arr : []).map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter(Boolean).slice(0, 5);
  if (!lines.length) throw new Error('生成结果为空，换个说法再试试');
  return lines;
}
