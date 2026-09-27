/**
 * 系统小组件的数据快照通道（PRD_V2.6 §8；v2.7.0.6 第 5 轮升到 v2）。
 *
 * 【为什么必须有这一层】
 * 小组件跑在**独立进程**里，它读不到 IndexedDB，也起不了 WebView。
 * 所以真实工作量不是"画三个组件"，而是先建一条通道：
 * App 在前台时把组件需要的一小撮数据序列化好，交给原生侧存起来（Android SharedPreferences /
 * iOS App Group），组件只读那份快照。快照写进去的同时顺手广播一次刷新，否则组件要等到下一个
 * updatePeriodMillis（最短 30 分钟）才知道数据变了。
 *
 * 【v2：明日预演】
 * 组件过了零点就是旧的（日期、塔罗、任务、剩 N 天全是昨天的）。快照里现在带一份 `next`——
 * 按明天算好的同一套读数（日期 / 月相 / 明天该做的任务 / 剩 N 天减一 / 塔罗与运势为空 /
 * 连续天数按明天零点算），原生侧按当前日期在今天和明天之间挑；两份都过期就显示最后一份的内容，
 * 只把日期换成真实日期、塔罗复位成「今日未抽」、连续天数标成「待续」。
 *
 * 【为什么快照里带 channel/accent】
 * 小组件不在 WebView 里，拿不到 CSS 变量。主题跟随只能靠把当前频道和强调色
 * 一起写进快照，由原生侧照着画。
 *
 * 【隐私】
 * 快照只放**已经显示在首页上的聚合数字**：任务计数、月相、塔罗牌名、
 * 每日记录条数、宣告卡标题与进度。不放记录正文、不放记账、不放愿望、不放对话。
 * V2.7 起「清单」组件是唯一例外：它带任务标题与 BIG DEAL 标题——
 * 「显示具体任务信息」是用户点名要的能力，组件描述里写明会显示标题，
 * 加不加这一块由用户自己决定；其余组件维持只出聚合数字的口径。
 * 第 5 轮新增的三样也守同一条线：名片状态只有预设 emoji 与两三个字；一起进步只带
 * 伙伴昵称与那条约定的标题（本来就在清单里）；截止日只是日期。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { themeToChannel } from '@/ui/channel';
import { TAROT_BY_ID, FORTUNE_META } from '@/constants/tarot';
import { STATUS_TTL_MS, statusPreset } from '@/constants/profileStatus';
import { isNative } from '@/utils/native';
import { calcCurrentStreak, streakDates } from '@/utils/streak';
import { pactTodayView, pickTogetherReminder } from '@/utils/pactLogic';
import type { CoopPact, Todo } from '@/types';

/** 热力图取多少天（4×2 组件一行放得下 ~28 格） */
const HEAT_DAYS = 28;

/** 「清单」组件最多带几条任务（4×2 满排也只画得下 5 行，多带只是白占体积） */
const AGENDA_MAX = 6;
/** 标题在快照里先粗截一刀；组件绘制时还会按实际像素宽度再截 */
const AGENDA_TITLE_MAX = 24;

/** 按字符（码点）截断：按 UTF-16 单位截会把 emoji 劈成两半，iOS 那边整份 JSON 都解析不了 */
const cut = (s: string, n: number): string => Array.from(s).slice(0, n).join('');

/** 「清单」组件的一行未完成任务 */
export interface WidgetAgendaItem {
  title: string;
  /** App 内「⭐ 重要」旗标——组件侧画琥珀高亮 */
  important?: boolean;
  /** 计次任务的当前值 / 目标值（单次任务恒 0/1，组件不画） */
  count: number;
  target: number;
  /** 截止日 YYYY-MM-DD（v2）；daysLeft = 距截止几天（0=今天截止，负=已逾期） */
  deadline?: string;
  daysLeft?: number;
}

/** 最紧迫的一件 BIG DEAL（未收官里截止日最近的） */
export interface WidgetAgendaDeal {
  title: string;
  /** 步骤进度 */
  done: number;
  total: number;
  /** 距截止还有几天（0=今天截止，负=已过期）；null = 没设截止日 */
  daysLeft: number | null;
  /** 倒计时进度 0-100：立项日 → 截止日已流逝的时间占比；null = 没设截止日 */
  timeUsed: number | null;
}

/** 一天的读数：今天与「明日预演」共用同一形状 */
export interface WidgetDayView {
  dateKey: string;
  /** 日期显示用（原生侧不做 i18n，直接用这几个串） */
  day: string;
  monthEn: string;
  weekdayEn: string;
  /**
   * id 是给原生侧找图用的：小组件按 `assets/public/tarot/p3/<id>.webp` 直接读牌面原图
   * （用户口径「抽完的塔罗牌就对应图片文件」）。小阿卡纳没有配图，原生侧读不到就退回
   * 程序化卡面——和 Web 端 tarotArtUrl 的兜底口径一致。明日预演里恒为 null（明天还没抽）。
   */
  tarot: { id: string; name: string; roman: string; reversed: boolean } | null;
  todos: { done: number; total: number };
  moon: { name: string; illum: number; phase: number };
  /** 最近 HEAT_DAYS 天每天的记录条数（旧 → 新） */
  heat: number[];
  /**
   * 宣告卡：daysLeft = 距目标日几天（0=今天，负=已过）；null = 卡没设目标日。
   * mode（v2）= 卡的类型：deadline 是纯倒计时（组件直接读「剩 N 天」），todos 按任务完成度，both 两者都有
   */
  card: { title: string; percent: number; daysLeft: number | null; mode: 'deadline' | 'todos' | 'both' } | null;
  /** 当前连续天数（与首页 / 菜单同一口径：补记条目不算） */
  streak: number;
  /** 今日运势（首页「今日仪式」已经显示的那一档）；明日预演里恒为 null */
  fortune: { label: string; accent: string } | null;
  /**
   * 「清单」组件（V2.7）：未完成任务明细 + BIG DEAL 倒计时。
   * 唯一带任务标题的字段——隐私口径见文件头注释的 V2.7 例外说明。
   * left = 未完成任务总数（可能多于 items 长度，组件画「还有 N 项」用）。
   */
  agenda: { items: WidgetAgendaItem[]; left: number; deal: WidgetAgendaDeal | null };
}

export interface WidgetSnapshot extends WidgetDayView {
  /** 结构版本：原生侧按它兼容旧快照（v2 = 带 next / 截止日 / 状态 / 一起进步） */
  v: 2;
  /** 写入时刻（ms）——组件可据此显示"数据有点旧了" */
  at: number;
  /** 明日预演（见文件头） */
  next: WidgetDayView;
  /**
   * 五项属性的等级 + 该档满级。**只放数字、不放属性名**——
   * 属性名是用户自己起的，可能带私人色彩，而组件是摊在桌面上给旁人看的。
   * 组件把它画成五根迷你条，读的是"能力剖面"，不泄露任何文字。
   */
  levels: number[];
  maxLevel: number;
  /** 名片状态（预设 emoji + 两三个字）；until = 到期时刻 ms，过了原生侧自己收掉 */
  status: { emoji: string; label: string; until: number } | null;
  /**
   * 一起进步：今天最该提醒的那份约定（被催过的优先）。
   * state：nudged=对方催你了；partnerDone=对方已完成、你还没；mineDone=你完成了在等对方；
   * both=今天都完成了；none=都还没动
   */
  pact: { partner: string; title: string; state: 'nudged' | 'partnerDone' | 'mineDone' | 'both' | 'none' } | null;
  /** 夜间模式：组件读不到 CSS，只能跟着快照走（红频道永远 false：它本来就不进夜间） */
  dark: boolean;
  channel: 'p3' | 'p4' | 'p5' | 'neutral';
  /** 强调色 hex（原生侧描边/进度条用） */
  accent: string;
}

const MOON_NAMES = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];
const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

const moonOf = (date: Date) => {
  const days = (date.getTime() - NEW_MOON_EPOCH) / 86400000;
  const phase = (((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS) / SYNODIC_DAYS;
  const idx = Math.round(phase * 8) % 8;
  return { phase, name: MOON_NAMES[idx], illum: (1 - Math.cos(2 * Math.PI * phase)) / 2 };
};

/** 频道 → 强调色。与各频道 CSS 变量同值，硬编在这里是因为原生侧读不到 CSS。 */
const ACCENT: Record<WidgetSnapshot['channel'], string> = {
  p5: '#c00008',
  p4: '#f9a11b',
  p3: '#1b57ff',
  neutral: '#6366f1',
};

const DAY_MS = 86400000;
const midnightOf = (key: string): number => new Date(key + 'T00:00:00').getTime();
const daysBetween = (fromKey: string, toKey: string): number => Math.round((midnightOf(toKey) - midnightOf(fromKey)) / DAY_MS);

/**
 * 截止日排序（用户批注：多条截止日要有取舍规则）：
 * 重要 → 逾期 / 今天截止 → 三天内 → 其余按剩余天数（没截止日的排最后），同档保持原顺序。
 */
export function agendaRank(it: { important?: boolean; daysLeft?: number }): number {
  const d = it.daysLeft;
  const tier = d === undefined ? 3 : d <= 0 ? 0 : d <= 3 ? 1 : 2;
  // 同档内按剩余天数升序：逾期越久越靠前，然后今天截止，然后剩得少的
  const within = d === undefined ? 99 : Math.max(-49, Math.min(49, d)) + 49;
  return (it.important ? 0 : 1) * 1000 + tier * 100 + within;
}

/** 某一天该做的任务（与 store.getDueTodosToday 同一套过滤，只是日期可指定） */
function dueTodosOn(todos: Todo[], dateKey: string, weekday: number): Todo[] {
  return todos.filter(t =>
    t.isActive &&
    !t.archivedAt &&
    !t.isBigDeal &&
    (!t.startDate || t.startDate <= dateKey) &&
    (!t.weekdays || t.weekdays.length === 0 || t.weekdays.includes(weekday)),
  );
}

/**
 * 算某一天的读数。today=true 用 store 的今日口径（进度 / 塔罗 / 运势）；
 * 明日预演：进度从零起（长期累计任务沿用今天的累计）、塔罗与运势为空、剩 N 天减一。
 */
function buildDayView(date: Date, isToday: boolean): WidgetDayView {
  const s = useAppStore.getState();
  const dateKey = toLocalDateKey(date);
  const weekday = date.getDay();

  // 塔罗：只认当天这一张（组件上写着"今日塔罗"）；预演里恒空
  const dd = isToday && s.dailyDivination && s.dailyDivination.date === dateKey ? s.dailyDivination : null;
  const card = dd ? TAROT_BY_ID[dd.cardId] : undefined;

  const due = isToday ? s.getDueTodosToday() : dueTodosOn(s.todos, dateKey, weekday);
  const progressOf = (t: Todo) => {
    const p = s.getTodayTodoProgress(t.id);
    if (isToday) return p;
    // 明天：计次 / 单次从零起；长期任务的累计不会因为过夜清零
    const count = t.isLongTerm ? p.count : 0;
    return { count, isComplete: count >= p.target, target: p.target };
  };
  const withProgress = due.map(t => ({ t, p: progressOf(t) }));
  const done = withProgress.filter(x => x.p.isComplete).length;

  // 「清单」明细：未完成的排前面给组件，重要 → 逾期 / 今天截止 → 三天内 → 其余（与首页排序同口径）
  const unfinished = withProgress
    .filter(x => !x.p.isComplete)
    .map(x => ({
      ...x,
      daysLeft: x.t.deadline ? daysBetween(dateKey, x.t.deadline) : undefined,
    }))
    .sort((a, b) => agendaRank({ important: a.t.important, daysLeft: a.daysLeft }) - agendaRank({ important: b.t.important, daysLeft: b.daysLeft }));
  const agendaItems: WidgetAgendaItem[] = unfinished.slice(0, AGENDA_MAX).map(x => ({
    title: cut(x.t.title, AGENDA_TITLE_MAX),
    ...(x.t.important ? { important: true } : {}),
    count: x.p.count,
    target: x.p.target,
    ...(x.t.deadline ? { deadline: x.t.deadline, daysLeft: x.daysLeft } : {}),
  }));

  // BIG DEAL：未收官的里挑最紧迫的一件——截止日最近优先，没设截止日的排后，再按立项先后
  const deals = s.todos
    .filter(t => t.isBigDeal && t.isActive && !t.archivedAt && !t.clearedActivityId)
    .sort((a, b) => {
      const da = a.deadline ?? '9999-99-99';
      const db = b.deadline ?? '9999-99-99';
      if (da !== db) return da < db ? -1 : 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  let agendaDeal: WidgetAgendaDeal | null = null;
  if (deals[0]) {
    const d0 = deals[0];
    const steps = d0.steps ?? [];
    let daysLeft: number | null = null;
    let timeUsed: number | null = null;
    if (d0.deadline) {
      const today0 = midnightOf(dateKey);
      const dl = midnightOf(d0.deadline);
      daysLeft = Math.round((dl - today0) / DAY_MS);
      // 倒计时进度：立项日 → 截止日已流逝比例。当天立项当天截止按用满算
      const born = midnightOf(toLocalDateKey(new Date(d0.createdAt)));
      const spanDays = Math.round((dl - born) / DAY_MS);
      timeUsed = spanDays <= 0
        ? 100
        : Math.max(0, Math.min(100, Math.round(((today0 - born) / DAY_MS) / spanDays * 100)));
    }
    agendaDeal = {
      title: cut(d0.title, AGENDA_TITLE_MAX),
      done: steps.filter(st => st.done).length,
      total: steps.length,
      daysLeft,
      timeUsed,
    };
  }

  // 热力图：先按日期 key 计数再展开成定长数组，避免 O(天数 × 活动数)；以 date 为最后一格
  const counts = new Map<string, number>();
  for (const a of s.activities) {
    const k = toLocalDateKey(new Date(a.date));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const heat: number[] = [];
  for (let i = HEAT_DAYS - 1; i >= 0; i--) {
    heat.push(counts.get(toLocalDateKey(new Date(date.getTime() - i * DAY_MS))) ?? 0);
  }

  // 宣告卡：钉在首页那张优先，否则取第一张未归档的。
  // terminal 是退役的终端任务卡存表残留（TASKS_MERGE_PRD 批5），全 App 都按 !terminal 过滤
  const cards = s.callingCards.filter(c => !c.archived && !c.terminal);
  const hero = cards.find(c => c.pinned) ?? cards[0] ?? null;
  const prog = hero ? s.getCallingCardProgress(hero.id) : null;
  const cardDaysLeft = hero?.targetDate ? daysBetween(dateKey, hero.targetDate) : null;

  return {
    dateKey,
    day: String(date.getDate()).padStart(2, '0'),
    monthEn: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    weekdayEn: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    tarot: card ? { id: card.id, name: card.name, roman: card.roman ?? String(card.number), reversed: dd?.orientation === 'reversed' } : null,
    todos: { done, total: due.length },
    moon: moonOf(date),
    heat,
    card: hero && prog
      ? { title: cut(hero.title, 40), percent: Math.round((prog.overallProgress ?? 0) * 100), daysLeft: cardDaysLeft, mode: hero.mode ?? 'both' }
      : null,
    // 明天零点的连续天数：今天有记录 → 链还在；今天没记 → 到明天就断了
    streak: calcCurrentStreak(streakDates(s.activities), date),
    fortune: dd?.fortune
      ? { label: FORTUNE_META[dd.fortune].label, accent: FORTUNE_META[dd.fortune].accent }
      : null,
    agenda: { items: agendaItems, left: unfinished.length, deal: agendaDeal },
  };
}

/** 一起进步：今天最该提醒的那份约定 + 它的状态 */
function buildPact(pacts: CoopPact[], todayKey: string): WidgetSnapshot['pact'] {
  const s = useAppStore.getState();
  const pick = pickTogetherReminder(s.todos, pacts, todayKey, id => s.getTodayTodoProgress(id).isComplete);
  if (!pick) return null;
  const todo = s.todos.find(t => t.pact && t.title === pick.title && t.pact.partnerName === pick.partnerName);
  const p = todo?.pact ? pacts.find(x => x.id === todo.pact!.id) : undefined;
  let state: NonNullable<WidgetSnapshot['pact']>['state'] = pick.doneToday ? 'mineDone' : 'none';
  if (p && todo?.pact) {
    const me = p.fromId === todo.pact.partnerId ? p.toId : p.fromId;
    const v = pactTodayView(p, me, todayKey);
    state = v.nudgedMe && !v.mineDone ? 'nudged'
      : !v.mineDone ? (v.theirsDone ? 'partnerDone' : 'none')
        : (v.theirsDone ? 'both' : 'mineDone');
  } else if (pick.nudged && !pick.doneToday) {
    state = 'nudged';
  }
  return { partner: cut(pick.partnerName, 12), title: cut(pick.title, AGENDA_TITLE_MAX), state };
}

/** 从当前 store 状态组装快照。纯函数，不碰 IO；pacts 由调用方传入（避免与 cloudSocial 互相引用）。 */
export function buildWidgetSnapshot(pacts: CoopPact[] = []): WidgetSnapshot {
  const s = useAppStore.getState();
  const now = new Date();
  const today = buildDayView(now, true);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const next = buildDayView(tomorrow, false);

  const channel = themeToChannel(s.user?.theme);

  // 名片状态：预设 emoji + 标签，24 小时后过期（原生侧到点自己收）
  let status: WidgetSnapshot['status'] = null;
  const ps = s.settings.profileStatus;
  const preset = statusPreset(ps?.id);
  if (ps && preset) {
    const until = new Date(ps.at).getTime() + STATUS_TTL_MS;
    if (Number.isFinite(until) && until > Date.now()) status = { emoji: preset.emoji, label: preset.label, until };
  }

  return {
    ...today,
    v: 2,
    at: Date.now(),
    next,
    levels: s.attributes.slice(0, 5).map(a => a.level),
    maxLevel: Math.max(1, s.settings.levelThresholds?.length ?? 5),
    status,
    pact: buildPact(pacts, today.dateKey),
    // 红频道本来就不进夜间（ui/channel.syncDarkClass 同一条规则）：组件也不该自己变黑
    dark: !!s.settings.darkMode && channel !== 'p5',
    channel,
    accent: channel === 'neutral' ? (s.settings.customThemeColor || ACCENT.neutral) : ACCENT[channel],
  };
}

/** 上一次真正推下去的内容——一样就不写，省得每次 loadData 都惊动组件进程 */
let lastPushed = '';
let pushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 把快照推给原生侧。Web 环境直接 no-op。
 * 连发合并：一次操作往往连着几次写库（loadData 一次、通知重排一次），300ms 内只推最后一次。
 *
 * 失败一律吞掉：小组件是锦上添花，任何原生异常都不该冒泡到正常使用路径上。
 */
export function pushWidgetSnapshot(): Promise<void> {
  if (!isNative()) return Promise.resolve();
  return new Promise(resolve => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      void pushWidgetSnapshotNow().finally(resolve);
    }, 300);
  });
}

/** 立刻推（切到后台时用：等不了 300ms） */
export async function pushWidgetSnapshotNow(): Promise<void> {
  if (!isNative()) return;
  try {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    let pacts: CoopPact[] = [];
    try {
      const { useCloudSocialStore } = await import('@/store/cloudSocial');
      pacts = useCloudSocialStore.getState().pacts;
    } catch { /* 社交层没起来就当没有约定 */ }
    const snap = buildWidgetSnapshot(pacts);
    // at 每次都不同，比对时要摘掉，否则永远"有变化"
    const fingerprint = JSON.stringify({ ...snap, at: 0 });
    if (fingerprint === lastPushed) return;
    lastPushed = fingerprint;

    const { registerPlugin } = await import('@capacitor/core');
    const VelvetWidget = registerPlugin<{ push(o: { json: string }): Promise<void> }>('VelvetWidget');
    await VelvetWidget.push({ json: JSON.stringify(snap) });
  } catch {
    /* 没装插件 / 旧版原生包 / 权限异常 —— 静默 */
  }
}
