/**
 * navigatorRegistry — F6 黑猫（Navigator）的 Action Registry（Batch1 地基）。
 *
 * 在 store action 之上建一层「动作注册表」：每个动作 = 参数草稿（draft）+ 预览文案 +
 * 执行器（回执文案）。菜单层迷你表单与（Batch2 的）AI 意图解析共用同一套 draft 结构，
 * 保证「表单直填」与「AI 产卡」走完全相同的确认→执行→回执链路。
 *
 * 权限边界（PRD F6.3）：本表只注册记录类动作；resetAllData / 账号 / 导入导出等禁区
 * **不在此文件出现**——Batch2 的 AI 只能看到这里注册的动作。
 * 增强反馈免费继承：执行直接调用现有 store action，升级/成就/技能弹窗照常触发。
 */
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import { TAROT_BY_ID } from '@/constants/tarot';
import { CATEGORY_META, INCOME_META } from '@/utils/ledgerFormat';
import type { AttributeId, LedgerExpenseType, LedgerIncomeType } from '@/types';

export const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

/** 属性中文兜底（用户未自定义命名时） */
const ATTR_FALLBACK: Record<AttributeId, string> = {
  knowledge: '知识', guts: '胆量', dexterity: '灵巧', kindness: '温柔', charm: '魅力',
};

/** 取当前属性显示名（自定义命名优先） */
export const navAttrName = (id: AttributeId): string =>
  useAppStore.getState().settings.attributeNames?.[id] ?? ATTR_FALLBACK[id];

// ── 动作草稿（菜单层表单与 Batch2 AI 卡片共用） ──────────────────

export interface ActivityDraft {
  kind: 'activity';
  text: string;
  points: Record<AttributeId, number>;
  important: boolean;
}
export interface TodoDraft {
  kind: 'todo';
  title: string;
  attribute: AttributeId;
  points: number;
  /** 副奖励维度（可选）：与主属性不同的第二属性，落库进 Todo.extraBoosts */
  extraAttribute: AttributeId | null;
  extraPoints: number;
  repeatDaily: boolean;
}
export interface LedgerDraft {
  kind: 'ledger';
  direction: 'expense' | 'income';
  amount: number;
  note: string;
  type: LedgerExpenseType;
  incomeType: LedgerIncomeType;
  channel: string;
}
export interface CompleteTodoDraft {
  kind: 'completeTodo';
  todoId: string;
  todoTitle: string;
}
/** 黑猫递刀产物（TASKS_MERGE_PRD §4.4）：一件大事 + AI/离线拆好的子步，确认即立 BIG DEAL */
export interface BigDealDraft {
  kind: 'bigdeal';
  title: string;
  attribute: AttributeId;
  points: number;
  /** 现状一句话（倾诉原文截段，AI 拆解已参考） */
  currentState: string;
  /** 截止日 YYYY-MM-DD；'' = 无 */
  deadline: string;
  steps: string[];
}
export type NavigatorDraft = ActivityDraft | TodoDraft | LedgerDraft | CompleteTodoDraft | BigDealDraft;
export type NavigatorActionKind = NavigatorDraft['kind'];

export const emptyDraft = (kind: NavigatorActionKind): NavigatorDraft => {
  switch (kind) {
    case 'activity':
      return { kind, text: '', points: { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 }, important: false };
    case 'todo':
      return { kind, title: '', attribute: 'guts', points: 2, extraAttribute: null, extraPoints: 1, repeatDaily: false };
    case 'ledger':
      return { kind, direction: 'expense', amount: 0, note: '', type: 'food', incomeType: 'labor', channel: '' };
    case 'completeTodo':
      return { kind, todoId: '', todoTitle: '' };
    case 'bigdeal':
      return { kind, title: '', attribute: 'guts', points: 2, currentState: '', deadline: '', steps: [] };
  }
};

export const ACTION_META: Record<NavigatorActionKind, { label: string; icon: string }> = {
  activity: { label: '记录活动', icon: '✍️' },
  todo: { label: '添加待办', icon: '📌' },
  ledger: { label: '记账', icon: '💰' },
  completeTodo: { label: '完成任务', icon: '✅' },
  bigdeal: { label: '拆一件大事', icon: '◆' },
};

/** 确认卡的参数预览行 */
export function buildPreviewLines(draft: NavigatorDraft): string[] {
  switch (draft.kind) {
    case 'activity': {
      const gains = ATTR_IDS.filter((id) => draft.points[id] > 0)
        .map((id) => `${navAttrName(id)} +${draft.points[id]}`)
        .join(' · ');
      return [
        `「${draft.text}」`,
        gains ? `加点：${gains}` : '加点：暂无（可编辑补上）',
        ...(draft.important ? ['⭐ 标记为重要事件'] : []),
      ];
    }
    case 'todo':
      return [
        `「${draft.title}」`,
        `${navAttrName(draft.attribute)} +${draft.points}${draft.extraAttribute ? ` · ${navAttrName(draft.extraAttribute)} +${draft.extraPoints}` : ''} · ${draft.repeatDaily ? '每日重复' : '单次完成'}`,
      ];
    case 'ledger': {
      const head = draft.direction === 'expense'
        ? `支出 ¥${draft.amount}（${CATEGORY_META[draft.type].icon} ${CATEGORY_META[draft.type].label}）`
        : `收入 ¥${draft.amount}（${INCOME_META[draft.incomeType].label}）`;
      return [
        head,
        ...(draft.note ? [`备注：${draft.note}`] : []),
        ...(draft.channel && draft.direction === 'expense' ? [`渠道：${draft.channel}`] : []),
      ];
    }
    case 'completeTodo':
      return [`把「${draft.todoTitle}」标记为完成`, '完成加点与反馈按任务设置发放'];
    case 'bigdeal': {
      const head = draft.steps.slice(0, 3).map((s, i) => `${i + 1}. ${s}`);
      return [
        `「${draft.title}」 · BIG DEAL`,
        ...head,
        ...(draft.steps.length > 3 ? [`…共 ${draft.steps.length} 步`] : []),
        `${navAttrName(draft.attribute)} 每步 +${draft.points}${draft.deadline ? ` · 截止 ${draft.deadline}` : ''} · 全成有收官奖励`,
      ];
    }
  }
}

/** 草稿是否已可执行（确认按钮可用性） */
export function draftReady(draft: NavigatorDraft): boolean {
  switch (draft.kind) {
    case 'activity': return draft.text.trim().length > 0;
    case 'todo': return draft.title.trim().length > 0;
    case 'ledger': return draft.amount > 0;
    case 'completeTodo': return draft.todoId.length > 0;
    case 'bigdeal': return draft.title.trim().length > 0 && draft.steps.some(s => s.trim());
  }
}

/** 执行草稿 → 黑猫口吻的回执文案。直接调用现有 store action，反馈弹窗免费继承。 */
export async function executeDraft(draft: NavigatorDraft): Promise<string> {
  const s = useAppStore.getState();
  switch (draft.kind) {
    case 'activity': {
      const { unlockHints } = await s.addActivity(
        draft.text.trim(),
        draft.points,
        'local',
        { important: draft.important },
      );
      const gains = ATTR_IDS.filter((id) => draft.points[id] > 0)
        .map((id) => `${navAttrName(id)} +${draft.points[id]}`)
        .join('、');
      const unlockLine = unlockHints.achievements + unlockHints.skills > 0
        ? ' 另外，好像有什么解锁了——去看看。'
        : '';
      return gains
        ? `记下了，${gains}。行动比嘴上说说有说服力多了。${unlockLine}`
        : `记下了。没加点也算数——发生过的事就该留个痕。${unlockLine}`;
    }
    case 'todo': {
      await s.addTodo({
        title: draft.title.trim(),
        attribute: draft.attribute,
        points: draft.points,
        extraBoosts: draft.extraAttribute
          ? [{ attribute: draft.extraAttribute, points: draft.extraPoints }]
          : undefined,
        frequency: 'single',
        repeatDaily: draft.repeatDaily,
        isActive: true,
      });
      return draft.repeatDaily
        ? `放进每日清单了。我每天都会看着它的，你也是。`
        : `加进待办了。别让它在清单里积灰。`;
    }
    case 'ledger': {
      const saved = draft.direction === 'expense'
        ? await s.addLedgerEntry({
            direction: 'expense',
            amount: draft.amount,
            date: toLocalDateKey(),
            source: 'manual',
            type: draft.type,
            channel: draft.channel.trim() || undefined,
            note: draft.note.trim() || undefined,
          })
        : await s.addLedgerEntry({
            direction: 'income',
            amount: draft.amount,
            date: toLocalDateKey(),
            source: 'manual',
            incomeType: draft.incomeType,
            note: draft.note.trim() || undefined,
          });
      await s.rewardForLedgerEntry(saved);
      return draft.direction === 'expense'
        ? `记上了，¥${draft.amount}。花都花了，起码账目清楚。`
        : `进账 ¥${draft.amount}，记好了。不错嘛。`;
    }
    case 'completeTodo': {
      const result = await s.completeTodo(draft.todoId);
      if (!result) return `「${draft.todoTitle}」今天已经完成过了——重复邀功可不行。`;
      const unlockLine = result.unlockHints.achievements + result.unlockHints.skills > 0
        ? ' 顺带解锁了点什么，自己去确认。'
        : '';
      return `划掉一件：「${draft.todoTitle}」。加点我亲眼看着到账了。${unlockLine}`;
    }
    case 'bigdeal': {
      const steps = draft.steps.map(t => t.trim()).filter(Boolean);
      await s.addTodo({
        title: draft.title.trim(),
        attribute: draft.attribute,
        points: draft.points,
        frequency: 'single',
        isActive: true,
        isBigDeal: true,
        currentState: draft.currentState.trim() || undefined,
        deadline: draft.deadline || undefined,
        steps: steps.map(t => ({ id: uuidv4(), title: t, source: 'ai' as const })),
      });
      return `大事立好了，拆成 ${steps.length} 步。从第一步开始——别贪多，吾辈盯着呢。`;
    }
  }
}

// ── 今日快照（问候拼接 + Batch2 上下文无感附送共用） ──────────────

export interface NavigatorSnapshot {
  dateKey: string;
  hour: number;
  userName: string;
  todosDone: number;
  todosTotal: number;
  tarotDrawn: boolean;
  tarotCardName?: string;
  activityCountToday: number;
  terminalStepTitle?: string;
}

export function buildSnapshot(): NavigatorSnapshot {
  const s = useAppStore.getState();
  const dateKey = toLocalDateKey();
  const due = s.getDueTodosToday();
  const done = due.filter((t) => s.getTodayTodoProgress(t.id).isComplete).length;
  const tarot = s.dailyDivination && s.dailyDivination.date === dateKey ? s.dailyDivination : null;
  const activityCountToday = s.activities.filter((a) => toLocalDateKey(new Date(a.date)) === dateKey).length;
  return {
    dateKey,
    hour: new Date().getHours(),
    userName: s.user?.name ?? '客人',
    todosDone: done,
    todosTotal: due.length,
    tarotDrawn: !!tarot,
    tarotCardName: tarot ? TAROT_BY_ID[tarot.cardId]?.name : undefined,
    activityCountToday,
    // terminalStepTitle 字段保留在类型上（navigatorIntent 仍引用），终端退役后恒 undefined
  };
}

const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

/** 每日首开的完整问候（模板层：无 Key / 有 Key Batch1 统一用它；Batch2 有 Key 换 AI 生成） */
export function buildDailyGreeting(snap: NavigatorSnapshot): string {
  const hello = snap.hour < 5
    ? pick([`这个点还醒着？行吧，${snap.userName}，正好我也睡不着。`, `凌晨了。夜里想说的话，我都接着。`])
    : snap.hour < 11
      ? pick([`早，${snap.userName}。今天从哪件事开刀？`, `早上好。趁脑子还清醒，先定一件事。`])
      : snap.hour < 14
        ? pick([`中午好。吃了吗——顺便，今天过半了。`, `午安，${snap.userName}。上半天的账我可都记着。`])
        : snap.hour < 19
          ? pick([`下午好。犯困的话，跟我说两句提提神。`, `午后了。今天还有想推进的事吗？`])
          : pick([`晚上好，${snap.userName}。今天过得怎么样？`, `夜里好。今天的事，记完就放下。`]);

  const status: string[] = [];
  if (snap.todosTotal > 0) {
    status.push(snap.todosDone >= snap.todosTotal
      ? `今日任务全清了，${snap.todosDone}/${snap.todosTotal}——少见，值得记一笔。`
      : `今日任务 ${snap.todosDone}/${snap.todosTotal}，还有得做。`);
  }
  if (snap.tarotDrawn && snap.tarotCardName) status.push(`今天的牌面是「${snap.tarotCardName}」，我瞄过了。`);
  else if (!snap.tarotDrawn) status.push(`今天的塔罗还没抽。`);
  if (snap.terminalStepTitle) status.push(`那件「${snap.terminalStepTitle}」还在进行中，别忘了。`);

  return [hello, ...status.slice(0, 2)].join('\n');
}

/** 当日再次打开（会话被清空 / App 重启）时的简短招呼 */
export function buildShortGreeting(snap: NavigatorSnapshot): string {
  return pick([
    `又来了？坐。`,
    `我还在。想记点什么？`,
    `${snap.userName}，回来啦。继续。`,
  ]);
}

/** Batch1：自由输入的模板接话（对话层 Batch2 接管前） */
export function buildFallbackReply(): string {
  return pick([
    `这句我先记在心里——不过眼下我还接不住自由对话，用下面的快捷项吧。等你配好 AI 密钥，我就能听懂整句话了。`,
    `唔，我懂你想说话。但我的「翻译水晶」还没接上（设置 → AI 总结 配好密钥就行）。先用下面的快捷项，一样管用。`,
    `先别急着跟我聊天——快捷项在下面，点一下就能记。等密钥配好，你说人话我办事。`,
  ]);
}
