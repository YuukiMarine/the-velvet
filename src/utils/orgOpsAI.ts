/**
 * 大作战的「AI 拆解」（v2.7.0.6 第 8 轮 · PRD §13.1）：把一个共同目标拆成每人一条子任务、按每个人的特点分给大家。
 * 喂给模型的只有：目标、截止还剩几天、每个人的代号 + 代表牌（牌名与正位关键词）+ 展示的面具（属性与等级）。
 * 不带任何记录内容。拆出来的每条过一遍屏蔽词、截到 20 字；拆不出来就抛错，界面让队长自己写。
 */
import { chatComplete, getAIConfig } from '@/utils/aiClient';
import { tryExtractJSON, extractJSONArray } from '@/utils/aiJson';
import { auditText } from '@/utils/textAudit';
import { DEFAULT_ATTRIBUTE_NAMES } from '@/constants/index';
import { ORG_OP_TASK_MAX } from '@/utils/orgOps';
import { displayCodename, tarotCardOf } from '@/utils/orgLogic';
import type { OrgMember, Settings } from '@/types';

export const hasOpsAI = (settings: Settings): boolean => !!getAIConfig(settings);

const clip = (s: string) => [...s.replace(/\s+/g, ' ').replace(/^[\s\-*·•\d.、)）]+/, '').replace(/[。．.！!]+$/, '').trim()].slice(0, ORG_OP_TASK_MAX).join('');

function describe(m: OrgMember, i: number): string {
  const bits: string[] = [];
  const card = tarotCardOf(m.tarotId);
  if (card) bits.push(`代表牌「${card.name}」（${card.upright.keywords.slice(0, 3).join('、')}）`);
  const masks = (m.card.personas ?? (m.card.persona ? [m.card.persona] : [])).slice(0, 3);
  if (masks.length) bits.push(`擅长：${masks.map(p => `${DEFAULT_ATTRIBUTE_NAMES[p.attribute] ?? p.attribute} Lv${p.level}`).join('、')}`);
  return `${i + 1}. ${displayCodename(m)}${bits.length ? `——${bits.join('；')}` : ''}`;
}

/**
 * 拆解 → 用户 id → 子任务。只返回拆到的人（模型漏了谁，那一行就留空，让队长自己补）。
 * signal：弹层关掉时中断。
 */
export async function splitOperationAI(settings: Settings, input: { goal: string; daysLeft: number; deadline: string; people: OrgMember[] }, signal?: AbortSignal): Promise<Record<string, string>> {
  const cfg = getAIConfig(settings);
  if (!cfg) throw new Error('没配 AI：去「设置 → AI」填好 API Key 就能用');
  const people = input.people.slice(0, 7);
  const when = input.daysLeft <= 0 ? '今天就截止' : `还有 ${input.daysLeft} 天（到 ${Number(input.deadline.slice(5, 7))} 月 ${Number(input.deadline.slice(8, 10))} 日）`;
  const sys = '你是一个小组的参谋。把队长给的共同目标拆成每人一条子任务，并按每个人的特点分配。'
    + `每条子任务：一个人在截止日前做完一次就算完成；动词开头，具体、能判断做没做完；不超过 ${ORG_OP_TASK_MAX - 2} 个汉字；不写原因、不写鼓励语、不带编号和标点结尾。`
    + '各人的子任务互不重复，合起来能把目标做成。人少事多时可以合并，人多事少时可以拆细（比如一人负责一部分）。'
    + '只输出 JSON：{"tasks":[{"i":1,"task":"……"}]}，i 是成员的编号，每个成员恰好一条。';
  const usr = [
    `共同目标：${input.goal}`,
    `截止：${when}`,
    `成员（${people.length} 人）：`,
    ...people.map(describe),
  ].join('\n');
  const content = await chatComplete(cfg, [{ role: 'system', content: sys }, { role: 'user', content: usr }], { temperature: 0.5, maxTokens: 400, jsonMode: true, signal });
  const obj = tryExtractJSON(content);
  const list = Array.isArray(obj?.tasks) ? (obj!.tasks as Array<Record<string, unknown>>) : extractJSONArray(content);
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const x of list) {
    const i = Number(x?.i) - 1;
    const task = clip(String(x?.task ?? ''));
    const who = people[i];
    if (!who || !task || out[who.userId] || seen.has(task) || !auditText(task).ok) continue;
    seen.add(task);
    out[who.userId] = task;
  }
  if (!Object.keys(out).length) throw new Error('AI 这次没拆出能用的分工，换个说法再试，或者自己写');
  return out;
}
