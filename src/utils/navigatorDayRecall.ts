/**
 * navigatorDayRecall — 按日子回溯（第 24 批 · PRD §24.10.7 A2）。
 *
 * 用户说「昨天 / 上周三 / 10 月 3 日 / 国庆」时，本地解析成日期，取那几天**当前人格**的聊天摘要和那几天记下的记忆，
 * 贴进上下文；什么都没找到、而且他明显在问「记不记得」时，明说「记忆里没有，别编」。
 * 纯本地、零调用。解析只认**过去**的说法（「明天 / 下周三」不管），bare 的「周三」要有回忆口气才算过去。
 * 不用后行断言（iOS 16.4 以前的 WebKit 不认）。
 */
import { db } from '@/db';
import { BUILTIN_NAVIGATOR_PRESETS } from '@/constants/navigatorPresets';
import { dayLabelCN, daysBetween, dateOfKey, keyOfDate, relativeDayCN, shiftKey } from '@/utils/navigatorClock';
import { memoVisibleTo } from '@/utils/navigatorMemoryScope';

export interface DayRange {
  from: string;
  to: string;
  /** 「上周三」「10月3日」这类原话里的说法 */
  label: string;
}

const CN_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const cnNum = (s: string): number => {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === '十') return 10;
  if (s.length === 2 && s[0] === '十') return 10 + (CN_NUM[s[1]] ?? 0);
  if (s.length === 2 && s[1] === '十') return (CN_NUM[s[0]] ?? 0) * 10;
  if (s.length === 3 && s[1] === '十') return (CN_NUM[s[0]] ?? 0) * 10 + (CN_NUM[s[2]] ?? 0);
  return CN_NUM[s] ?? NaN;
};
const WEEKDAY_IDX: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };

/** 「还记得 / 我说过 / 你忘了」这类回忆口气 */
export const RECALL_CUE_RE = /还记得|记得吗|记不记得|记得我|我说过|我提过|我跟你说过|上次说|之前说|之前提|之前聊|你忘了|忘了吗|聊过|说起过|提到过/;
export const hasRecallCue = (text: string): boolean => RECALL_CUE_RE.test(text);

/** 这周的周一（周日算这周的最后一天） */
function mondayOf(key: string): string {
  const d = dateOfKey(key).getDay();
  return shiftKey(key, -((d + 6) % 7));
}

/**
 * 从一句话里解析出过去的日子（最多 2 段，今天不算：今天的对话本来就在历史里）。
 * 认：昨天 / 前天 / 大前天 / N 天前 / 上周（一周）/ 上周X / 这周X（已过的）/ 周X（要有回忆口气）/
 *     上个月（一个月）/ M月D日 / 国庆 / 元旦 / 五一。
 */
export function parseDateMentions(text: string, todayKey: string): DayRange[] {
  const out: DayRange[] = [];
  const yesterday = shiftKey(todayKey, -1);
  const push = (from: string, to: string, label: string) => {
    if (from > to) [from, to] = [to, from];
    if (to > yesterday) to = yesterday;
    if (from > to) return;
    if (daysBetween(from, todayKey) > 400) return;
    if (out.some((r) => r.from === from && r.to === to)) return;
    out.push({ from, to, label });
  };
  const t = text.replace(/\s+/g, '');
  const recall = hasRecallCue(t) || /那天|当时|那次|上次/.test(t);

  if (/大前天/.test(t)) push(shiftKey(todayKey, -3), shiftKey(todayKey, -3), '大前天');
  else if (/前天/.test(t)) push(shiftKey(todayKey, -2), shiftKey(todayKey, -2), '前天');
  if (/昨天|昨晚|昨儿|昨日|昨夜/.test(t)) push(yesterday, yesterday, '昨天');

  let m: RegExpExecArray | null;
  const agoRe = /(\d{1,2}|[一两二三四五六七八九十]{1,3})天前/g;
  while ((m = agoRe.exec(t))) {
    const n = cnNum(m[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 60) push(shiftKey(todayKey, -n), shiftKey(todayKey, -n), m[0]);
  }

  // 周：上周X / 这周X / 周X；「下周X」不算（手动看前一个字，不用后行断言）
  const weekRe = /(上上|上|这|本)?个?(周|星期|礼拜)([一二三四五六日天])?/g;
  while ((m = weekRe.exec(t))) {
    const prev = t[m.index - 1] ?? '';
    if (prev === '下' || prev === '每') continue;
    const [, mod, , wd] = m;
    const thisMon = mondayOf(todayKey);
    if (wd === undefined) {
      // 整周：只认「上周 / 上上周」
      if (mod === '上') push(shiftKey(thisMon, -7), shiftKey(thisMon, -1), m[0]);
      else if (mod === '上上') push(shiftKey(thisMon, -14), shiftKey(thisMon, -8), m[0]);
      continue;
    }
    const idx = WEEKDAY_IDX[wd];
    const offset = (idx + 6) % 7; // 周一 = 0 … 周日 = 6
    if (mod === '上') push(shiftKey(thisMon, offset - 7), shiftKey(thisMon, offset - 7), m[0]);
    else if (mod === '上上') push(shiftKey(thisMon, offset - 14), shiftKey(thisMon, offset - 14), m[0]);
    else if (mod === '这' || mod === '本') {
      const k = shiftKey(thisMon, offset);
      if (k < todayKey) push(k, k, m[0]);
    } else if (recall) {
      // bare 周X：有回忆口气才当过去——最近的一个那天（今天就是周X → 上周的）
      let k = shiftKey(thisMon, offset);
      if (k >= todayKey) k = shiftKey(k, -7);
      push(k, k, m[0]);
    }
  }

  if (/上个月|上月/.test(t)) {
    const d = dateOfKey(todayKey);
    const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const last = new Date(d.getFullYear(), d.getMonth(), 0);
    push(keyOfDate(first), keyOfDate(last), '上个月');
  }

  // M月D日 / M月D号：过去的那一天（还没到的算去年）
  const mdRe = /(\d{1,2})月(\d{1,2})[日号]/g;
  while ((m = mdRe.exec(t))) {
    const mo = Number(m[1]);
    const da = Number(m[2]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) continue;
    const y = dateOfKey(todayKey).getFullYear();
    let k = keyOfDate(new Date(y, mo - 1, da));
    if (k >= todayKey) k = keyOfDate(new Date(y - 1, mo - 1, da));
    push(k, k, m[0]);
  }

  // 固定日期的节日（农历的不管）
  const year = dateOfKey(todayKey).getFullYear();
  const holiday = (re: RegExp, mo: number, from: number, to: number, label: string) => {
    if (!re.test(t)) return;
    let a = keyOfDate(new Date(year, mo - 1, from));
    let b = keyOfDate(new Date(year, mo - 1, to));
    if (a >= todayKey) { a = keyOfDate(new Date(year - 1, mo - 1, from)); b = keyOfDate(new Date(year - 1, mo - 1, to)); }
    push(a, b, label);
  };
  holiday(/国庆/, 10, 1, 7, '国庆');
  holiday(/元旦/, 1, 1, 1, '元旦');
  holiday(/五一|劳动节/, 5, 1, 5, '五一');

  return out.slice(0, 2);
}

export interface DayRecall {
  /** 注入块；没解析出日子时为空串 */
  block: string;
  /** 解析出了日子 */
  asked: boolean;
  /** 找到了聊天摘要或记忆 */
  found: boolean;
}

const rangeLabel = (r: DayRange, todayKey: string): string =>
  r.from === r.to
    ? `${dayLabelCN(r.from, todayKey)}，${relativeDayCN(r.from, todayKey)}`
    : `${dayLabelCN(r.from, todayKey)} 到 ${dayLabelCN(r.to, todayKey)}`;

/**
 * 取那几天当前人格的聊天摘要（最多 5 场）和那几天记下的记忆（最多 5 条），拼成注入块。
 * 老会话没 presetId 的按黑猫算（与 finalizeStaleSessions 同口径）。
 */
export async function loadDayRecall(ranges: DayRange[], presetId: string, todayKey: string): Promise<DayRecall> {
  if (!ranges.length) return { block: '', asked: false, found: false };
  const cat = BUILTIN_NAVIGATOR_PRESETS[0].id;
  const lines: string[] = [];
  let found = false;
  try {
    const sessions = (await db.navigatorSessions.toArray())
      .filter((s) => (s.presetId ?? cat) === presetId && s.dateKey < todayKey)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    const memos = (await db.navigatorMemos.where('status').equals('active').toArray())
      .filter((m) => m.source !== 'profile' && memoVisibleTo(m, presetId));
    for (const r of ranges) {
      const head = `【ta 提到的日子：${r.label} = ${rangeLabel(r, todayKey)}】`;
      const chats = sessions.filter((s) => s.dateKey >= r.from && s.dateKey <= r.to).slice(0, 5);
      const memoHits = memos
        .filter((m) => { const k = keyOfDate(new Date(m.createdAt)); return k >= r.from && k <= r.to; })
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 5);
      if (!chats.length && !memoHits.length) {
        lines.push(`${head}那几天没有聊天记录，记忆里也没有相关的：照实说不记得或记不清，可以问他一句，别编。`);
        continue;
      }
      found = true;
      lines.push(head);
      for (const s of chats) {
        const day = r.from === r.to ? '那天' : dayLabelCN(s.dateKey, todayKey);
        lines.push(`- ${day}的聊天：${s.compactedSummary ?? '聊过，但还没整理成摘要（只知道聊过）'}`);
      }
      for (const m of memoHits) lines.push(`- ${r.from === r.to ? '那天' : dayLabelCN(keyOfDate(new Date(m.createdAt)), todayKey)}记下的：${m.text}`);
    }
  } catch {
    return { block: '', asked: true, found: false };
  }
  return { block: lines.join('\n'), asked: true, found };
}

/** 一步到位：解析 + 取数 */
export async function buildDayRecall(text: string, presetId: string, todayKey: string): Promise<DayRecall> {
  return loadDayRecall(parseDateMentions(text, todayKey), presetId, todayKey);
}

/** 他在问「记不记得」、记忆和日子里都没找到：明说别编 */
export const RECALL_GAP_LINE =
  '【对方在问你记不记得某件事】记忆和记录里都没找到相关的：照实说不记得或记不清，问他一句，别编、别顺着他的话装记得。';
