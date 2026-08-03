/**
 * Lv6 终局 · 18 张记录卡的取数（PRD_FINAL_BOSS §5.3）
 *
 * 纯函数，无 store 依赖——终局演出被杀进程后重入要能算出同一副牌。
 *
 * 取法（原始需求里「从第一条起」与「倒序」是打架的，这里按**叙事弧**定的口径）：
 *   前 12 张 = 你**最早**的 12 条（起点）
 *   后  6 张 = 你**最近**的 6 条（现在）
 * 两段都优先取 important；important 用尽后，**从用尽的那一条往下继续扫**，
 * 用普通条目补足——而不是回头从池子开头再挑，那样会把时间线打乱。
 *
 * 记录不足 18 条时不注水：有几条打几张，三轮均摊（每轮至少 1 张）。
 */
import type { Activity, AttributeId, Confidant } from '@/types';

export interface FinaleCard {
  id: string;
  /** 记录正文（渲染时再截断，取数阶段不损失信息） */
  text: string;
  /** YYYY-MM-DD（本地口径由调用方保证） */
  dateKey: string;
  important: boolean;
  /** 该条记录加点最多的属性——卡面染色用 */
  attr?: AttributeId;
}

export const FINALE_HEAD = 12;
export const FINALE_TAIL = 6;
export const FINALE_TOTAL = FINALE_HEAD + FINALE_TAIL;
export const FINALE_ROUNDS = 3;

const ts = (d: Date | string) => new Date(d).getTime();

function topAttr(a: Activity): AttributeId | undefined {
  const entries = Object.entries(a.pointsAwarded ?? {}) as Array<[AttributeId, number]>;
  let best: AttributeId | undefined;
  let max = 0;
  for (const [k, v] of entries) if (v > max) { max = v; best = k; }
  return best;
}

function toCard(a: Activity): FinaleCard {
  const d = new Date(a.date);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: a.id,
    text: (a.description ?? '').trim() || '（这一条你没写字，但你做了）',
    dateKey: key,
    important: !!a.important,
    attr: topAttr(a),
  };
}

/**
 * 从一个有序池里取 n 条：先按池序扫 important，不够再按池序扫普通条目。
 *
 * ⚠️ 不要改成「important 用尽后从它那条的下标往后接着扫」——试过，会踩两个坑：
 *  ① 头段的 important 若落在时间线末尾，游标会被拖到那里，
 *     「你最早的 12 条」里就混进了这个月的记录；
 *  ② 尾段同理，会把**最新的那一条**跳过去。
 * 段的锚点由 pool 的取窗决定，段内只做「重要优先」这一件事。
 */
function takeFrom(pool: Activity[], n: number, used: Set<string>): Activity[] {
  const out: Activity[] = [];
  for (const a of pool) {
    if (out.length >= n) break;
    if (used.has(a.id) || !a.important) continue;
    out.push(a); used.add(a.id);
  }
  for (const a of pool) {
    if (out.length >= n) break;
    if (used.has(a.id)) continue;
    out.push(a); used.add(a.id);
  }
  return out;
}

export function pickFinaleRecords(activities: Activity[]): FinaleCard[] {
  const asc = [...activities].sort((x, y) => ts(x.date) - ts(y.date));
  const n = asc.length;
  if (n === 0) return [];
  const desc = [...asc].reverse();
  const used = new Set<string>();
  // 取窗：头段锚在时间线前 60%、尾段锚在后 40%——「重要优先」只在窗内起作用，
  // 段与段之间不许串门，否则「起点」与「现在」这条叙事弧就散了
  const headPool = asc.slice(0, Math.max(FINALE_HEAD, Math.ceil(n * 0.6)));
  const tailPool = desc.slice(0, Math.max(FINALE_TAIL, Math.ceil(n * 0.4)));
  const head = takeFrom(headPool, Math.min(FINALE_HEAD, n), used);
  const tail = takeFrom(tailPool, Math.min(FINALE_TAIL, n - head.length), used);
  // 记录太少时上面两段可能仍不足 18：拿剩下的补齐，宁可短也不注水
  const rest = takeFrom(asc, Math.max(0, Math.min(FINALE_TOTAL, n) - head.length - tail.length), used);
  // 两段各自按时间正序，再首尾相接：整副牌从你的起点走到你的现在
  const sortAsc = (l: Activity[]) => l.sort((x, y) => ts(x.date) - ts(y.date));
  return [...sortAsc([...head, ...rest]), ...sortAsc(tail)].map(toCard);
}

// ── 第 6 段 · 援军（PRD §5.1）────────────────────────────────

export const FINALE_ALLY_MAX = 8;
export const FINALE_ALLY_SP_CAP = 1000;
/** 无羁绊用户的兜底：房间本身上阵 */
export const FINALE_ROOM_SP = 400;

export interface FinaleAlly {
  id: string;
  name: string;
  intimacy: number;
  attr?: AttributeId;
  /** 该同伴给出的 SP（已按 1000 总封顶夹过） */
  sp: number;
  /** 兜底线（AI 生成的鼓励语回来之前 / 失败时用这句） */
  line: string;
}

const ALLY_LINE_BY_ATTR: Record<string, string[]> = {
  knowledge: ['你查过的每一件事都还在你身上。用它。', '别急着信它的结论——你自己算过的账更准。'],
  guts:      ['站起来。你以前也不是没被打趴过。', '它说的那句，你可以不认。'],
  dexterity: ['你只是慢，不是停。这两件事不一样。', '手别抖——你做过比这更难的。'],
  kindness:  ['你对别人那么有耐心，也留一点给自己。', '我在这儿。你不是一个人在爬这座塔。'],
  charm:     ['抬头。让它看看你现在的样子。', '它认识的是过去的你，不是今天这个。'],
};
const ALLY_LINE_DEFAULT = ['轮到我了。这一下算我的。', '你替我挡过一次——现在换我。'];

/**
 * 上阵援军：未归档同伴按 intimacy 降序取前 8，每人 80 + intimacy×20 SP，总额封顶 1000。
 * 一个同伴都没有的用户返回空数组 —— 调用方走「房间本身上阵」分支，不能卡在这一段。
 */
export function pickFinaleAllies(confidants: Confidant[]): FinaleAlly[] {
  const pool = confidants
    .filter(c => !c.archivedAt)
    .sort((a, b) => (b.intimacy ?? 0) - (a.intimacy ?? 0))
    .slice(0, FINALE_ALLY_MAX);
  let budget = FINALE_ALLY_SP_CAP;
  return pool.map((c, i) => {
    const raw = 80 + (c.intimacy ?? 0) * 20;
    const sp = Math.max(0, Math.min(raw, budget));
    budget -= sp;
    const pool2 = ALLY_LINE_BY_ATTR[c.skillAttribute ?? ''] ?? ALLY_LINE_DEFAULT;
    return {
      id: c.id,
      name: c.name,
      intimacy: c.intimacy ?? 0,
      attr: c.skillAttribute,
      sp,
      // 兜底句按属性分档取，同一位同伴每次拿到的是同一句（用 index 定，不掷骰）
      line: (c.aiAdvice?.trim().split(/[。！？\n]/)[0] || pool2[i % pool2.length]).slice(0, 30),
    };
  });
}

/** 把 n 张牌切成三轮（每轮至少 1 张，多的匀在前面的轮次） */
export function splitRounds(total: number, rounds = FINALE_ROUNDS): number[] {
  if (total <= 0) return Array(rounds).fill(0);
  if (total <= rounds) return Array.from({ length: rounds }, (_, i) => (i < total ? 1 : 0));
  const base = Math.floor(total / rounds);
  const extra = total % rounds;
  return Array.from({ length: rounds }, (_, i) => base + (i < extra ? 1 : 0));
}
