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
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { themeToChannel } from '@/ui/channel';
import { TAROT_BY_ID } from '@/constants/tarot';
import { isNative } from '@/utils/native';

/** 热力图取多少天（4×2 组件一行放得下 ~28 格） */
const HEAT_DAYS = 28;

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
  card: { title: string; percent: number } | null;
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

  // 宣告卡：钉在首页那张优先，否则取第一张未归档的
  const cards = s.callingCards.filter(c => !c.archived);
  const hero = cards.find(c => c.pinned) ?? cards[0] ?? null;
  const prog = hero ? s.getCallingCardProgress(hero.id) : null;

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
    card: hero && prog ? { title: hero.title, percent: Math.round((prog.overallProgress ?? 0) * 100) } : null,
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
