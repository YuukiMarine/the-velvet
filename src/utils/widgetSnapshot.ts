/**
 * 系统小组件的数据快照通道（PRD_V2.6 §8）。
 *
 * 【为什么必须有这一层】
 * 小组件跑在**独立进程**里，它读不到 IndexedDB，也起不了 WebView。
 * 所以真实工作量不是"画三个组件"，而是先建一条通道：
 * App 在前台时把组件需要的一小撮数据序列化好，交给原生侧存起来（Android SharedPreferences），
 * 组件只读那份快照。快照写进去的同时顺手广播一次刷新，否则组件要等到下一个
 * updatePeriodMillis（最短 30 分钟）才知道数据变了。
 *
 * 【为什么快照里带 channel/accent】
 * 小组件不在 WebView 里，拿不到 CSS 变量。主题跟随只能靠把当前频道和强调色
 * 一起写进快照，由原生侧照着画——否则用户切到红色主题，桌面上还杵着一块蓝的。
 *
 * 【隐私】
 * 快照只放**已经显示在首页上的聚合数字**：任务计数、月相、塔罗牌名、
 * 每日记录条数、宣告卡标题与进度。不放记录正文、不放记账、不放愿望、不放对话。
 * SharedPreferences 是应用私有目录，但小组件数据会出现在桌面上——
 * 能被旁人一眼看到的东西，标准就该比 App 内更严。
 * V2.7 起「清单」组件是唯一例外：它带任务标题与 BIG DEAL 标题——
 * 「显示具体任务信息」是用户点名要的能力，组件描述里写明会显示标题，
 * 加不加这一块由用户自己决定；其余组件维持只出聚合数字的口径。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { themeToChannel } from '@/ui/channel';
import { TAROT_BY_ID, FORTUNE_META } from '@/constants/tarot';
import { isNative } from '@/utils/native';
import { calcCurrentStreak, streakDates } from '@/utils/streak';

/** 热力图取多少天（4×2 组件一行放得下 ~28 格） */
const HEAT_DAYS = 28;

/** 「清单」组件最多带几条任务（4×2 满排也只画得下 5 行，多带只是白占体积） */
const AGENDA_MAX = 6;
/** 标题在快照里先粗截一刀；组件绘制时还会按实际像素宽度再截 */
const AGENDA_TITLE_MAX = 24;

/** 「清单」组件的一行未完成任务 */
export interface WidgetAgendaItem {
  title: string;
  /** App 内「⭐ 重要」旗标——组件侧画琥珀高亮 */
  important?: boolean;
  /** 计次任务的当前值 / 目标值（单次任务恒 0/1，组件不画） */
  count: number;
  target: number;
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

export interface WidgetSnapshot {
  /** 结构版本：原生侧按它兼容旧快照 */
  v: 1;
  /** 写入时刻（ms）——组件可据此显示"数据有点旧了" */
  at: number;
  dateKey: string;
  /** 日期显示用（原生侧不做 i18n，直接用这几个串） */
  day: string;
  monthEn: string;
  weekdayEn: string;
  /**
   * id 是给原生侧找图用的：小组件按 `assets/public/tarot/p3/<id>.webp` 直接读牌面原图
   * （用户口径「抽完的塔罗牌就对应图片文件」）。小阿卡纳没有配图，原生侧读不到就退回
   * 程序化卡面——和 Web 端 tarotArtUrl 的兜底口径一致。
   */
  tarot: { id: string; name: string; roman: string; reversed: boolean } | null;
  todos: { done: number; total: number };
  moon: { name: string; illum: number; phase: number };
  /** 最近 HEAT_DAYS 天每天的记录条数（旧 → 新） */
  heat: number[];
  /** 宣告卡：daysLeft = 距目标日几天（0=今天，负=已过）；null = 卡没设目标日 */
  card: { title: string; percent: number; daysLeft: number | null } | null;
  /** 当前连续天数（与首页 / 菜单同一口径：补记条目不算） */
  streak: number;
  /**
   * 五项属性的等级 + 该档满级。**只放数字、不放属性名**——
   * 属性名是用户自己起的，可能带私人色彩，而组件是摊在桌面上给旁人看的。
   * 组件把它画成五根迷你条，读的是"能力剖面"，不泄露任何文字。
   */
  levels: number[];
  maxLevel: number;
  /** 今日运势（首页「今日仪式」已经显示的那一档） */
  fortune: { label: string; accent: string } | null;
  /**
   * 「清单」组件（V2.7）：未完成任务明细 + BIG DEAL 倒计时。
   * 唯一带任务标题的字段——隐私口径见文件头注释的 V2.7 例外说明。
   * left = 未完成任务总数（可能多于 items 长度，组件画「还有 N 项」用）。
   */
  agenda: { items: WidgetAgendaItem[]; left: number; deal: WidgetAgendaDeal | null };
  /** 夜间模式：组件读不到 CSS，只能跟着快照走 */
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

/** 从当前 store 状态组装快照。纯函数，不碰 IO。 */
export function buildWidgetSnapshot(): WidgetSnapshot {
  const s = useAppStore.getState();
  const now = new Date();
  const dateKey = toLocalDateKey(now);

  // 塔罗：只认今天这一张，昨天的不算（组件上写着"今日塔罗"）
  const dd = s.dailyDivination && s.dailyDivination.date === dateKey ? s.dailyDivination : null;
  const card = dd ? TAROT_BY_ID[dd.cardId] : undefined;

  // 今日任务：与首页同口径（getDueTodosToday 已排除未来启用日与非本周日）
  const due = s.getDueTodosToday();
  const done = due.filter(t => s.getTodayTodoProgress(t.id).isComplete).length;

  // 「清单」明细：未完成的排前面给组件，重要任务优先（与首页排序同口径）
  const unfinished = due
    .map(t => ({ t, p: s.getTodayTodoProgress(t.id) }))
    .filter(x => !x.p.isComplete)
    .sort((a, b) => (b.t.important ? 1 : 0) - (a.t.important ? 1 : 0));
  const agendaItems: WidgetAgendaItem[] = unfinished.slice(0, AGENDA_MAX).map(x => ({
    title: x.t.title.slice(0, AGENDA_TITLE_MAX),
    ...(x.t.important ? { important: true } : {}),
    count: x.p.count,
    target: x.p.target,
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
      const today0 = new Date(dateKey + 'T00:00:00').getTime();
      const dl = new Date(d0.deadline + 'T00:00:00').getTime();
      daysLeft = Math.round((dl - today0) / 86400000);
      // 倒计时进度：立项日 → 截止日已流逝比例。当天立项当天截止按用满算
      const born = new Date(toLocalDateKey(new Date(d0.createdAt)) + 'T00:00:00').getTime();
      const spanDays = Math.round((dl - born) / 86400000);
      timeUsed = spanDays <= 0
        ? 100
        : Math.max(0, Math.min(100, Math.round(((today0 - born) / 86400000) / spanDays * 100)));
    }
    agendaDeal = {
      title: d0.title.slice(0, AGENDA_TITLE_MAX),
      done: steps.filter(st => st.done).length,
      total: steps.length,
      daysLeft,
      timeUsed,
    };
  }

  // 热力图：先按日期 key 计数再展开成定长数组，避免 O(天数 × 活动数)
  const counts = new Map<string, number>();
  for (const a of s.activities) {
    const k = toLocalDateKey(new Date(a.date));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const heat: number[] = [];
  for (let i = HEAT_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    heat.push(counts.get(toLocalDateKey(d)) ?? 0);
  }

  // 宣告卡：钉在首页那张优先，否则取第一张未归档的。
  // terminal 是退役的终端任务卡存表残留（TASKS_MERGE_PRD 批5），全 App 都按 !terminal 过滤
  const cards = s.callingCards.filter(c => !c.archived && !c.terminal);
  const hero = cards.find(c => c.pinned) ?? cards[0] ?? null;
  const prog = hero ? s.getCallingCardProgress(hero.id) : null;
  const cardDaysLeft = hero?.targetDate
    ? Math.round((new Date(hero.targetDate + 'T00:00:00').getTime()
        - new Date(dateKey + 'T00:00:00').getTime()) / 86400000)
    : null;

  const channel = themeToChannel(s.user?.theme);

  return {
    v: 1,
    at: Date.now(),
    dateKey,
    day: String(now.getDate()).padStart(2, '0'),
    monthEn: now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    weekdayEn: now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    tarot: card ? { id: card.id, name: card.name, roman: card.roman ?? String(card.number), reversed: dd?.orientation === 'reversed' } : null,
    todos: { done, total: due.length },
    moon: moonOf(now),
    heat,
    card: hero && prog
      ? { title: hero.title, percent: Math.round((prog.overallProgress ?? 0) * 100), daysLeft: cardDaysLeft }
      : null,
    streak: calcCurrentStreak(streakDates(s.activities)),
    levels: s.attributes.slice(0, 5).map(a => a.level),
    maxLevel: Math.max(1, s.settings.levelThresholds?.length ?? 5),
    fortune: dd?.fortune
      ? { label: FORTUNE_META[dd.fortune].label, accent: FORTUNE_META[dd.fortune].accent }
      : null,
    agenda: { items: agendaItems, left: unfinished.length, deal: agendaDeal },
    dark: !!s.settings.darkMode,
    channel,
    accent: channel === 'neutral' ? (s.settings.customThemeColor || ACCENT.neutral) : ACCENT[channel],
  };
}

/** 上一次真正推下去的内容——一样就不写，省得每次 loadData 都惊动组件进程 */
let lastPushed = '';

/**
 * 把快照推给原生侧。Web 环境直接 no-op。
 *
 * 失败一律吞掉：小组件是锦上添花，任何原生异常都不该冒泡到正常使用路径上。
 */
export async function pushWidgetSnapshot(): Promise<void> {
  if (!isNative()) return;
  try {
    const snap = buildWidgetSnapshot();
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
