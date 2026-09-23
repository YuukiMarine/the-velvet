/**
 * navigatorTopics — 助手的「主动话题」配额（v2.7.0.6）。
 *
 * 用户反馈：助手偶尔每轮都提塔罗和待办。实测同一段闲聊 15 轮里 10 轮绕回待办。
 * 原因是今日状态每轮都贴在用户最新一句前面，规则还鼓励「把动态数据说进话里」，
 * 而它不知道自己今天已经提过。这里给主动话题定配额（用户口径）：
 *   · 塔罗：一天最多主动提一次，每天都可以；
 *   · 待办：每一条只主动提一次（提过就不再提，除非对方问起）；
 *   · 报告：每一份新总结只主动提一次。
 * 另外按分诊判断的「回应姿态」收口：对方在倾诉、要走、或者精力很低时，一律不主动提。
 *
 * 记账放 localStorage：节流状态，不上云、不进备份。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { TAROT_BY_ID } from '@/constants/tarot';
import { freshUnreadSummary } from '@/utils/reportNotice';

export type Stance = 'vent' | 'chat' | 'ask' | 'report' | 'bye';
export type Energy = 'low' | 'normal' | 'high';

const KEY = 'velvet.navTopics.v1';

interface Ledger {
  /** 最近一次主动提塔罗的日期 */
  tarotDate?: string;
  /** 主动提过的待办 id */
  todoIds: string[];
  /** 主动提过的总结 id */
  reportIds: string[];
}

const read = (): Ledger => {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) as Partial<Ledger> : {};
    return { tarotDate: p.tarotDate, todoIds: p.todoIds ?? [], reportIds: p.reportIds ?? [] };
  } catch {
    return { todoIds: [], reportIds: [] };
  }
};

const write = (l: Ledger) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...l, todoIds: l.todoIds.slice(-400), reportIds: l.reportIds.slice(-60) }));
  } catch { /* 存不了就不记，最多多提一次 */ }
};

/** 今天还没完成、也还没主动提过的待办 */
function unmentionedDueTodos(ledger: Ledger) {
  const s = useAppStore.getState();
  const mentioned = new Set(ledger.todoIds);
  return s.getDueTodosToday().filter(t => !s.getTodayTodoProgress(t.id).isComplete && !mentioned.has(t.id));
}

/** 「这一轮」的回应姿态提示（分诊顺手判的；判不出来就不给） */
export function stanceLine(stance: Stance | null, energy: Energy | null): string {
  if (!stance) return '';
  const base: Record<Stance, string> = {
    vent: '对方在倾诉 / 抱怨：先接住他的情绪，说一两句懂他的话，别急着给建议，更别拐去任务。',
    chat: '对方在闲聊：顺着他的话聊，可以调侃、可以反问一句，别把话题拽回任务。',
    ask: '对方在问事 / 求助：正面回答，给具体办法；背景资料里有相关的就用上。',
    report: '对方在说他做了 / 要做的事：先回应这件事本身；开了卡就提醒他确认。',
    bye: '对方要走了 / 去忙了：简短道别，一两句就好，别再追加提醒。',
  };
  const tail = energy === 'low' ? '他现在精力低，少说，一两段就够。' : energy === 'high' ? '他这会儿兴致高，可以接住他的劲头。' : '';
  return `【这一轮】${base[stance]}${tail}`;
}

/**
 * 主动话题许可：本轮能主动提什么（每轮最多挑一个，也可以都不提）。
 * 倾诉 / 道别 / 精力低 → 一律不主动提。
 */
export function buildTopicPermission(stance: Stance | null, energy: Energy | null): string {
  if (stance === 'vent' || stance === 'bye' || energy === 'low') {
    return '【主动话题】这一轮不主动提塔罗、待办、报告，只接他的话；他问起再说。';
  }
  const s = useAppStore.getState();
  const today = toLocalDateKey();
  const ledger = read();
  const allow: string[] = [];
  const done: string[] = [];

  const tarot = s.dailyDivination && s.dailyDivination.date === today ? s.dailyDivination : null;
  if (ledger.tarotDate !== today) {
    allow.push(tarot
      ? `今天抽到的「${TAROT_BY_ID[tarot.cardId]?.name ?? '那张牌'}」（今天还没聊过）`
      : '今天的塔罗还没抽');
  } else done.push('塔罗');

  const todos = unmentionedDueTodos(ledger);
  if (todos.length) allow.push(`还没提过的待办：${todos.slice(0, 4).map(t => `「${t.title}」`).join('、')}`);
  if (ledger.todoIds.length) done.push('提过的待办');

  const report = freshUnreadSummary(s.summaries);
  if (report && !ledger.reportIds.includes(report.id)) allow.push(`新写好的「${report.label}」总结（在记录页的「成长总结」里）`);
  else if (report) done.push('那份新总结');

  const lines: string[] = [];
  lines.push(allow.length
    ? `【主动话题】这一轮最多主动提一件，只能从下面挑，也可以一件都不提；他在说别的事时别硬拐过去：\n${allow.map(a => `- ${a}`).join('\n')}`
    : '【主动话题】今天能主动提的都提过了：除非他问起，别再提塔罗、待办和报告。');
  if (done.length) lines.push(`（已经主动提过、别再提的：${done.join('、')}）`);
  return lines.join('\n');
}

/** 回复 / 问候发出后记账：看它提了哪些话题 */
export function noteTopicsMentioned(text: string): void {
  if (!text.trim()) return;
  const s = useAppStore.getState();
  const today = toLocalDateKey();
  const ledger = read();
  let changed = false;

  const tarot = s.dailyDivination && s.dailyDivination.date === today ? s.dailyDivination : null;
  const cardName = tarot ? TAROT_BY_ID[tarot.cardId]?.name : undefined;
  if (/塔罗|牌面|抽牌|抽一张|今天的牌|那张牌/.test(text) || (cardName && text.includes(cardName))) {
    if (ledger.tarotDate !== today) { ledger.tarotDate = today; changed = true; }
  }

  // 待办：点名的那几条记上；笼统说「任务 / 待办 / 清单」就把今天没完成的都记上
  const open = s.todos.filter(t => t.isActive && !t.archivedAt);
  const hit = new Set(ledger.todoIds);
  for (const t of open) {
    const title = t.title.trim();
    if (title.length >= 2 && text.includes(title) && !hit.has(t.id)) { hit.add(t.id); changed = true; }
  }
  if (/待办|任务|清单|修行/.test(text)) {
    for (const t of s.getDueTodosToday()) if (!hit.has(t.id)) { hit.add(t.id); changed = true; }
  }
  ledger.todoIds = [...hit];

  const report = freshUnreadSummary(s.summaries);
  if (report && !ledger.reportIds.includes(report.id) && (/总结|周报|月报/.test(text) || text.includes(report.label))) {
    ledger.reportIds.push(report.id);
    changed = true;
  }
  if (changed) write(ledger);
}

/** 模板问候用：哪些话题今天还能提 */
export function topicAllowance(): { tarot: boolean; todos: boolean; reportId: string | null } {
  const s = useAppStore.getState();
  const ledger = read();
  const report = freshUnreadSummary(s.summaries);
  return {
    tarot: ledger.tarotDate !== toLocalDateKey(),
    todos: unmentionedDueTodos(ledger).length > 0,
    reportId: report && !ledger.reportIds.includes(report.id) ? report.id : null,
  };
}
