/**
 * notifications.ts — F2a 本地通知服务
 *
 * 本地通知由系统提前排程，到点触发时 WebView 多半未运行、IndexedDB 不可读，
 * 因此无法字面「触发时生成内容」。本模块采用业界标准的「提前排程快照 + 前台重排」：
 *   - 调用方（store.syncNotifications）在 App 打开 / 切前台 / 改设置 / 关键数据变动时，
 *     传入当前端上状态快照 NotifSnapshot；
 *   - 本模块据此算出未来 N 天 × 启用时段应推送的提醒，cancel 旧的、schedule 新的；
 *   - 文案在「排程时」由快照烤好，靠「每次前台必重排」保持新鲜（条件已满足→重排时自然不再出现）。
 *
 * 仅在原生平台（Android；iOS 待 F1 原生包）真正排程；Web 端为 no-op。
 */
import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import { isNative } from './native';
import type { AttributeId, AttributeNames, NotifContentType, NotifSlot } from '@/types';

/** 我们「拥有」的通知 ID 段：base + dayOffset*10 + slotIndex。重排时只 cancel 本段。 */
const NOTIF_ID_BASE = 41000;
/** 即时测试通知用的固定 ID（不参与排程窗口） */
const NOTIF_ID_TEST = NOTIF_ID_BASE + 999;
/** 提前排程窗口（天） */
const NOTIF_WINDOW_DAYS = 7;
/** 每天最多排程的时段数（ID 段步长为 10，留余量） */
const MAX_SLOTS = 8;

export type NotifPermission = 'granted' | 'denied' | 'prompt';

/** 排程所需的端上状态快照——由 store 在调用前一次性取好，保持本模块与 store 解耦。 */
export interface NotifSnapshot {
  enabled: boolean;
  slots: NotifSlot[];
  attributeNames: AttributeNames;
  /** 今日塔罗是否已抽 */
  tarotDrawnToday: boolean;
  /** 今日仍未完成的每日待办数 */
  incompleteTodoCount: number;
  /** 是否存在启用中的每日待办（用于「未来天」的 todos 可操作性判断） */
  hasActiveDailyTodos: boolean;
  /** 明日将逆流扣减的属性 id（store.getCountercurrentWarnings 结果） */
  countercurrentWarnings: AttributeId[];
  /** 是否有未读成长总结 */
  hasUnreadSummary: boolean;
  /** 今天是否已有任何记录（非系统类活动）；用于「提醒记录」 */
  loggedToday: boolean;
}

// ── 平台 / 权限 ────────────────────────────────────────────

/** 当前平台是否支持本地通知（仅原生；iOS 待 F1）。 */
export function notifPlatformSupported(): boolean {
  return isNative();
}

function mapPerm(display: string): NotifPermission {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'prompt'; // 'prompt' | 'prompt-with-rationale'
}

/** 查询当前通知权限（不弹窗）。Web 端恒为 'denied'。 */
export async function getNotifPermission(): Promise<NotifPermission> {
  if (!isNative()) return 'denied';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const res = await LocalNotifications.checkPermissions();
    return mapPerm(res.display);
  } catch {
    return 'denied';
  }
}

/** 向系统申请通知权限（会弹窗，Android 13+）。Web 端恒为 'denied'。 */
export async function requestNotifPermission(): Promise<NotifPermission> {
  if (!isNative()) return 'denied';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const res = await LocalNotifications.requestPermissions();
    return mapPerm(res.display);
  } catch {
    return 'denied';
  }
}

// ── Velvet 文案库 ─────────────────────────────────────────
// 触发时无法读数据，故内容在排程时烤好。{n}=待办数、{attr}=属性名 经 ctx 注入。

interface NotifText { title: string; body: string; }
interface CopyCtx { todoCount: number; attrNames: string; }
type CopyFn = (ctx: CopyCtx) => NotifText;

const COPY: Record<NotifContentType, CopyFn[]> = {
  tarot: [
    () => ({ title: '丝绒房间', body: '客人，今日的塔罗尚未翻开……命运在等你抽取。' }),
    () => ({ title: '今日塔罗', body: '牌阵已为你铺好。来翻开属于今天的那一张吧。' }),
    () => ({ title: '丝绒房间', body: '黎明的牌面还盖着。今天的指引，要现在揭晓吗？' }),
  ],
  todos: [
    (c) => ({
      title: '夜间结算',
      body: c.todoCount > 0
        ? `还有 ${c.todoCount} 件修行未竟。今夜，要不要再走一步？`
        : '今天的修行清单还空着——给自己留一笔记录吧。',
    }),
    (c) => ({
      title: '今日待办',
      body: c.todoCount > 0
        ? `${c.todoCount} 件小事仍在等你。完成它们，再合上这一天。`
        : '入夜了。今天走过的路，值得被记下一笔。',
    }),
  ],
  countercurrent: [
    (c) => ({ title: '逆流预警', body: `你的「${c.attrNames}」已数日沉睡，明日将悄然退潮。要在今夜唤醒它吗？` }),
    (c) => ({ title: '暗流将至', body: `「${c.attrNames}」连日无增长——明天它会逆流而下。现在还来得及。` }),
  ],
  summary: [
    () => ({ title: '成长总结', body: '一份新的成长总结已在房间里等你查阅。' }),
    () => ({ title: '新的回响', body: '你的旅程被记成了一篇总结。来读读这段时间的自己吧。' }),
  ],
  record: [
    () => ({ title: '夜间结算', body: '客人，今天还没有在房间里留下一笔……此刻的你，也值得被记下。' }),
    () => ({ title: '今日记录', body: '这一天就要合上了。要不要回来，记下你走过的痕迹？' }),
    () => ({ title: '丝绒房间', body: '房间为你留着灯。今天的故事，还没有人书写。' }),
  ],
};

// ── 排程核心 ──────────────────────────────────────────────

/** 优先级：越靠前越「该提醒」。一个时段内挑出最高优先且可操作的一条。 */
const PRIORITY: NotifContentType[] = ['countercurrent', 'summary', 'tarot', 'record', 'todos'];
/** 状态型内容（非每日重置）：整个排程窗口内只投一次，避免刷屏。 */
const ONCE_ONLY: NotifContentType[] = ['summary', 'countercurrent'];

/** 某内容类型在「第 day 天」是否可操作（基于今日快照的最佳投影）。 */
function isActionable(c: NotifContentType, snap: NotifSnapshot, day: number): boolean {
  switch (c) {
    case 'tarot':
      // 今天看是否已抽；未来天换日后必未抽
      return day === 0 ? !snap.tarotDrawnToday : true;
    case 'todos':
      // 今天看是否有未完成；未来天只要有启用的每日待办就提醒（靠前台重排纠正计数）
      return day === 0 ? snap.incompleteTodoCount > 0 : snap.hasActiveDailyTodos;
    case 'countercurrent':
      // 预警基于「明日扣减」，只对今天的已知预警投递（更远是投机，且换日后会重排）
      return day === 0 && snap.countercurrentWarnings.length > 0;
    case 'summary':
      return snap.hasUnreadSummary;
    case 'record':
      // 今天看是否已有记录；未来天换日后必无记录
      return day === 0 ? !snap.loggedToday : true;
  }
}

function pickContent(
  slot: NotifSlot,
  snap: NotifSnapshot,
  day: number,
  dayKey: string,
  placedOnce: Set<NotifContentType>,
): NotifText | null {
  const available = PRIORITY.filter(c =>
    slot.contents.includes(c) &&
    isActionable(c, snap, day) &&
    !(ONCE_ONLY.includes(c) && placedOnce.has(c)),
  );
  if (available.length === 0) return null;

  const chosen = available[0];
  if (ONCE_ONLY.includes(chosen)) placedOnce.add(chosen);

  const variants = COPY[chosen];
  const idx = stableIndex(dayKey + chosen, variants.length);
  const ctx: CopyCtx = {
    todoCount: snap.incompleteTodoCount,
    attrNames: snap.countercurrentWarnings.map(id => snap.attributeNames[id] ?? id).join('、'),
  };
  return variants[idx](ctx);
}

/**
 * 重排：根据快照算出未来 NOTIF_WINDOW_DAYS 天的提醒并同步给系统。
 * 幂等——每次都先 cancel 我们 ID 段内的旧排程，再 schedule 新的。
 * 关闭 / 无权限 / 无启用时段 → 仅清空我们的排程。
 */
export async function computeAndSchedule(snap: NotifSnapshot): Promise<void> {
  if (!isNative()) return;
  let LocalNotifications: typeof import('@capacitor/local-notifications').LocalNotifications;
  try {
    ({ LocalNotifications } = await import('@capacitor/local-notifications'));
  } catch {
    return;
  }

  await cancelOurNotifications();

  const perm = await getNotifPermission();
  if (!snap.enabled || perm !== 'granted') return;

  // 按时间升序排，使「一次性」内容落在最早一个合格时段
  const enabledSlots = snap.slots
    .filter(s => s.enabled && s.contents.length > 0)
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, MAX_SLOTS);
  if (enabledSlots.length === 0) return;

  const now = new Date();
  const placedOnce = new Set<NotifContentType>();
  const toSchedule: LocalNotificationSchema[] = [];

  for (let day = 0; day < NOTIF_WINDOW_DAYS; day++) {
    for (let si = 0; si < enabledSlots.length; si++) {
      const slot = enabledSlots[si];
      const at = slotDate(now, day, slot.time);
      // 跳过已过去 / 即将（<60s，避免排进刚好错过的点）
      if (at.getTime() <= now.getTime() + 60_000) continue;

      const text = pickContent(slot, snap, day, dateKey(at), placedOnce);
      if (!text) continue;

      toSchedule.push({
        id: NOTIF_ID_BASE + day * 10 + si,
        title: text.title,
        body: text.body,
        schedule: { at, allowWhileIdle: true },
        extra: { source: 'f2a', slotId: slot.id },
      });
    }
  }

  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
}

/** 取消我们 ID 段内的全部待发通知（含测试通知）。 */
export async function cancelOurNotifications(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = await LocalNotifications.getPending();
    const ours = (pending.notifications || []).filter(n =>
      typeof n.id === 'number' &&
      n.id >= NOTIF_ID_BASE &&
      n.id <= NOTIF_ID_TEST,
    );
    if (ours.length > 0) {
      await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
    }
  } catch {
    /* ignore */
  }
}

/** 即时（2 秒后）发一条测试通知，供设置页验证权限与展示链路。Web 端 no-op。 */
export async function sendTestNotification(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await getNotifPermission();
    if (perm !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: NOTIF_ID_TEST,
        title: '丝绒房间',
        body: '欢迎回来，客人。这是一条测试提醒——通知链路已就绪。',
        schedule: { at: new Date(Date.now() + 2000) },
        extra: { source: 'f2a-test' },
      }],
    });
    return true;
  } catch {
    return false;
  }
}

// ── 小工具 ────────────────────────────────────────────────

/** 以 base 日期为锚，偏移 dayOffset 天、设为 'HH:MM' 的本地时间。 */
function slotDate(base: Date, dayOffset: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + dayOffset,
    Number.isFinite(h) ? h : 0,
    Number.isFinite(m) ? m : 0,
    0,
    0,
  );
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** 由种子串得到稳定下标（同一天同一内容固定取同一条文案，跨天才变）。 */
function stableIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}
