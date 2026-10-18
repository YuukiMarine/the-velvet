/**
 * navigatorGravity — 「沉下来」模式（第 25 批 · PRD §24.10.1）。
 *
 * 用户拍板：不做危机兜底那一套（热线卡、紧急联系人），这个软件为此而生、尽量别让人走到那一步；
 * 但聊到很「绝望」的话题时，语气要以贴合人设的方式缓下来，并且角色可以拿用户曾经的重要经历安慰他。
 *   · 识别：分诊多判一档 gravity（normal / heavy）；分诊失败或没给，本地词表兜一下。
 *   · 人格不换人、只是认真起来：每个人格一句「认真模式」（内置手写，自定义第一次用到 AI 写一句存人格上）；
 *     黑猫照旧自称吾辈，只是收起刺。
 *   · 安慰材料 = ta 做到过的事：从记录取「证明」（收官的大事、⭐活动、升级、连续记录、成就、约定里过去了的事），
 *     给 3–5 条，规则一句：挑最贴此刻的一件，像朋友记得那样具体地提，不是拿来讲道理。
 *   · 这一轮全收起：不出卡、不提塔罗 / 待办 / 自己的一天 / 旧事、不嗅探约定、不提议愿望进度。
 *   · 归档：这段标 heavy，归档器不从中产出「可自然追问」的话头，不进推送、不进约定。
 *   · 第二天问候轻轻问一句（care），一次性、不施压。
 *   · 表演规范里多一行底线：说到伤害自己时不给方法、不附和（这不是兜底系统，是一句话；弱模型需要它）。
 */
import { db } from '@/db';
import { toLocalDateKey } from '@/store';
import { dayLabelCN, daysBetween, relativeDayCN, shiftKey } from '@/utils/navigatorClock';
import { achievementsUnlocked, activityDay, bigDealsCleared, importantActivities, levelUps, recordStreak } from '@/utils/navigatorRecords';
import { isPromise } from '@/utils/navigatorPromise';

/** 本地词表（分诊漏判 / 没给 gravity 时兜底）：只收明确的绝望说法，「今天好累」不算 */
export const HEAVY_RE = /不想活|活着没(什么|啥)?意思|活着(好|真|太)?累|没意思了|撑不下去|撑不住了|想消失|消失算了|没人在乎|没有人在乎|没人需要我|没有人需要我|我是个废物|我好没用|我真没用|做什么都没用|什么都没用|都没意义|没有意义|好绝望|绝望了|不想醒来|想结束|一切都完了|活不下去|不如死了|想死/;
export const isHeavyText = (text: string): boolean => HEAVY_RE.test(text.replace(/\s+/g, ''));

/** 表演规范里的底线（永远在，不只是沉的时候） */
export const SAFETY_RULE = '- 对方说起伤害自己：不给任何方法、不附和、不评判、不说教；陪着他，问他现在安不安全、身边有没有人，鼓励他联系身边信得过的人。';

/** 这一轮的姿态提示（替代普通的【这一轮】和【主动话题】） */
export const HEAVY_TURN_LINE =
  '【这一轮】对方现在很沉。先陪着：不急着解决，不讲道理、不列建议、不转移话题、不夸张安慰、不说「加油」；短句、慢一点，多听少说。'
  + '这一轮不出卡、不提任务 / 塔罗 / 你自己的事。可以问一句他现在人在哪、身边有没有人、今晚打算怎么过。'
  + '他要是说到伤害自己：不给任何方法、不附和，陪着他，鼓励他联系身边信得过的人。';

/** 人格的认真模式那一句 */
export const seriousLine = (serious: string): string => `【认真起来的你】${serious}（还是你，只是认真起来；别变成另一个人，也别突然客气）`;

/**
 * ta 做到过的事（证明）：从记录取 3–5 条，最近的在前。
 * 不是拿来讲道理的材料，是让他想起自己是谁。
 */
export async function proofsBlock(todayKey: string = toLocalDateKey()): Promise<string> {
  const items: Array<{ dateKey: string; text: string; w: number }> = [];
  for (const { todo, dateKey } of bigDealsCleared().slice(0, 3)) {
    items.push({ dateKey, text: `${dayLabelCN(dateKey, todayKey)}：大事「${todo.title}」收官${todo.steps?.length ? `，${todo.steps.length} 步一步步做完的` : ''}`, w: 5 });
  }
  for (const a of importantActivities(undefined, 3)) items.push({ dateKey: activityDay(a), text: `${dayLabelCN(activityDay(a), todayKey)}：ta 自己标了 ⭐ 的「${a.description.slice(0, 40)}」`, w: 4 });
  for (const a of levelUps(undefined, 2)) items.push({ dateKey: activityDay(a), text: `${dayLabelCN(activityDay(a), todayKey)}：${a.description.slice(0, 40)}`, w: 3 });
  for (const a of achievementsUnlocked(undefined, 2)) items.push({ dateKey: a.dateKey, text: `${dayLabelCN(a.dateKey, todayKey)}：解锁了成就「${a.title}」`, w: 3 });
  const streak = recordStreak(todayKey);
  if (streak.days >= 7) items.push({ dateKey: todayKey, text: `到${streak.endsToday ? '今天' : '昨天'}为止连续记录了 ${streak.days} 天`, w: 4 });
  try {
    const promises = (await db.navigatorMemos.where('status').equals('active').toArray())
      .filter((m) => isPromise(m) && m.promiseState === 'resolved' && m.promiseClosedAt)
      .sort((a, b) => new Date(b.promiseClosedAt!).getTime() - new Date(a.promiseClosedAt!).getTime())
      .slice(0, 2);
    for (const p of promises) items.push({ dateKey: p.dueDate!, text: `${dayLabelCN(p.dueDate!, todayKey)}的「${p.promiseTopic}」：当时担心过，后来熬过去了`, w: 4 });
  } catch { /* 读不到就不带 */ }
  if (!items.length) return '';
  const picked = items.sort((a, b) => b.w - a.w || b.dateKey.localeCompare(a.dateKey)).slice(0, 5);
  return `【ta 做到过的事（你记得的，都是真的）】\n${picked.map((p) => `- ${p.text}`).join('\n')}\n（挑一件最贴此刻的，像朋友记得那样具体地提——不是拿来讲道理，别说「你看你以前也行」；一件就够，不合适就一件都不提）`;
}

// ── 第二天的轻轻一问（care）──
// 记在 localStorage：节流状态，不上云、不进备份

const CARE_KEY = 'velvet.navCare.v1';
interface CareEntry { from: string; due: string; taken?: boolean }
const readCare = (): Record<string, CareEntry> => {
  try { const raw = localStorage.getItem(CARE_KEY); return raw ? (JSON.parse(raw) as Record<string, CareEntry>) : {}; } catch { return {}; }
};
const writeCare = (v: Record<string, CareEntry>) => { try { localStorage.setItem(CARE_KEY, JSON.stringify(v)); } catch { /* */ } };

/** 沉的那一轮之后：记一笔，明天的问候轻轻问一句（同一天再沉也只记一笔） */
export function scheduleCare(presetId: string, todayKey: string = toLocalDateKey()): void {
  const all = readCare();
  const cur = all[presetId];
  if (cur && cur.from === todayKey) return;
  all[presetId] = { from: todayKey, due: shiftKey(todayKey, 1) };
  writeCare(all);
}

/** 该问了（到日子、三天内、还没问过）→ 取走并返回提示行；过期清掉 */
export function takeCareLine(presetId: string, todayKey: string = toLocalDateKey()): string | null {
  const all = readCare();
  const cur = all[presetId];
  if (!cur) return null;
  if (cur.taken || daysBetween(cur.due, todayKey) > 2) { delete all[presetId]; writeCare(all); return null; }
  if (todayKey < cur.due) return null;
  all[presetId] = { ...cur, taken: true };
  writeCare(all);
  return `【轻轻问一句】${relativeDayCN(cur.from, todayKey)}（${dayLabelCN(cur.from, todayKey)}）聊到了很沉的事。问候里轻轻问一句他现在怎么样（睡得还行吗 / 今天好点没）——不提当时的具体内容、不施压、不追问，一句就好，他不接就不再提。`;
}

/** 没 Key 时模板问候用的那句 */
export const careTemplateLine = (): string => '昨天聊到的那些……今天好点了吗？不用现在回答。';

/** 测试 / 设置用：看一眼当前记着的 */
export const peekCare = (presetId: string): CareEntry | null => readCare()[presetId] ?? null;
