/**
 * 「我投的弹幕过审了吗」—— 客户端自查（FINAL_SPRINT_PRD §FS4 短期 C 路线）。
 *
 * 【为什么不能由服务端推】
 * danmaku 集合是**刻意匿名**的：不存 createdBy，谁写的这条谁也不知道（见 services/danmaku.ts 头注释）。
 * 服务端因此根本没有"通知作者"所需的那个作者。要么破坏匿名去加作者字段，
 * 要么换一条不需要作者的路——这里选后者，匿名是这个功能的地基，不是可选项。
 *
 * 【自查怎么成立】
 * danmaku 的 View 规则是 `status = "approved"`：
 *   · 待审 / 被拒 → getOne(id) 返回 404
 *   · 过审        → getOne(id) 返回 200
 * 也就是说，**记录 id 本身就是一枚只有投稿者手里有的凭据**。
 * 客户端把自己投过的 id 存在本地，开 App 时挨个探一次：探到了 = 过审了。
 * 服务端全程不知道是谁在探，匿名一点没破。
 *
 * 【为什么要有上限和过期】
 * 被拒的弹幕永远返回 404，不清理的话这张表会无限攒下去，每次开 App 多打几个请求。
 * 所以：最多留 MAX_WATCH 条，超过 EXPIRE_MS 没结果就当被拒了、丢掉。
 */
import { pb } from './pocketbase';
import { isNative } from '@/utils/native';

const KEY = 'velvet:danmaku-watch';
/** 最多同时盯几条（弹幕投稿有三天冷却，正常人攒不到这个数） */
const MAX_WATCH = 12;
/** 超过这么久还没过审就当被拒了，不再探 */
const EXPIRE_MS = 14 * 24 * 60 * 60 * 1000;
/** 通知 id 段：与 utils/notifications.ts 的 41000–41999 错开，
 *  否则 cancelOurNotifications 的区间扫描会把它一起撤掉 */
const NOTIF_ID_BASE = 42000;

interface WatchItem {
  id: string;
  /** 投稿时间 ms */
  at: number;
  /** 投稿正文（通知里回显，让用户想起来是哪条） */
  text: string;
}

const read = (): WatchItem[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(arr) ? (arr as WatchItem[]).filter(x => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
};

const write = (items: WatchItem[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_WATCH)));
  } catch {
    /* 隐私模式写不进就算了，最坏结果是这次不提醒 */
  }
};

/** 投稿成功后登记一条待查。由 submitDanmaku 调用。 */
export function watchDanmaku(id: string, text: string): void {
  if (!id) return;
  const items = read().filter(x => x.id !== id);
  items.push({ id, at: Date.now(), text: text.slice(0, 20) });
  write(items);
}

/** 当前有几条在等过审（UI 可用来显示「N 条审核中」） */
export function pendingDanmakuCount(): number {
  return read().length;
}

/**
 * 探一轮。返回这一轮**新过审**的条目。
 *
 * 探测失败（断网 / 未登录 / 集合没建）一律按"还没结果"处理并保留条目——
 * 把一条只是暂时探不到的弹幕当成被拒丢掉，用户就再也等不到那条提醒了。
 */
export async function checkApprovedDanmaku(): Promise<WatchItem[]> {
  const now = Date.now();

  // 过期清理必须在 pb 判空**之前**做：没配云 / 登出之后照样要把陈年条目扫掉，
  // 否则这张表只进不出，一直挂在那儿。（驱动单测 afterExpire 就是被这一点抓到的）
  const all = read();
  const fresh = all.filter(it => now - it.at <= EXPIRE_MS);
  if (fresh.length !== all.length) write(fresh);
  if (fresh.length === 0 || !pb) return [];

  const approved: WatchItem[] = [];
  const keep: WatchItem[] = [];

  for (const it of fresh) {
    try {
      await pb.collection('danmaku').getOne(it.id, { requestKey: null });
      approved.push(it); // 200 = View 规则放行 = status 已是 approved
    } catch {
      // 404（规则挡住 = 还没过审或已被拒）与 0/401/5xx（断网 / 未登录 / 服务端抖）
      // 在这里的处置是同一个：保留，下次再探。
      // 之所以不把 404 当作"已被拒、可以丢了"——被拒和待审在 API 上完全同形，
      // 分不出来就不该猜；真被拒的那条由 EXPIRE_MS 兜底清掉。
      keep.push(it);
    }
  }
  write(keep);
  return approved;
}

/**
 * 开 App 时跑一次：探到过审就发一条本地通知（原生）或返回给调用方做 App 内提示。
 * 静默失败——这是锦上添花，不该在启动路径上冒泡任何错误。
 */
export async function sweepDanmakuApprovals(): Promise<WatchItem[]> {
  try {
    const approved = await checkApprovedDanmaku();
    if (approved.length === 0) return [];
    if (isNative()) {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display === 'granted') {
          await LocalNotifications.schedule({
            notifications: approved.slice(0, 3).map((it, i) => ({
              id: NOTIF_ID_BASE + i,
              title: '你的鼓励发出去了',
              body: `「${it.text}」已通过审核，正飘在别人的屏幕上。`,
              schedule: { at: new Date(Date.now() + 1500 + i * 400) },
              extra: { source: 'danmaku-approved' },
            })),
          });
        }
      } catch {
        /* 通知发不出去不影响返回值，调用方仍可做 App 内提示 */
      }
    }
    return approved;
  } catch {
    return [];
  }
}
