import type { Activity, AttributeId, Todo } from '@/types';

/**
 * 今日生活委托（第 13 轮用户反馈：「别人给的任务比自己设的更有意思，也省了自己设置的麻烦」）——纯逻辑，零 AI。
 *
 *  - 每天三张，按「日期 + 用户」做种：跨天自动换，同一天怎么刷新都是这三张（换一批除外）。
 *  - 个性化（轻量）：一张补「最近 14 天记得最少的一维」（只看今天以前，免得今天记了一笔，卡片当场变脸），
 *    另两张从其余几维里挑，三张尽量不同维。
 *  - 每一维一副洗好的牌、一天翻一张：同一维连着两天不会重样，十来天把这一维翻一遍；两台设备同一天是同一批。
 *  - 不出：清单里已经有的同名任务（今天以前建的）；换一批时不和刚才那批重复。
 *  - 点「加入今日任务」= 建一条普通的单次待办，完成照常按它的属性加点；「已加入 / 已完成」由清单推出，不另存表。
 *  - 题库只放泛用、低门槛、不分地域的小事；带 {x} 的按种子从候选里挑一个填进去（「看一部悬疑电影」）。
 */

export interface LifeQuestPreset {
  id: string;
  attribute: AttributeId;
  /** 可含 {x}，由 slots 填 */
  title: string;
  slots?: string[];
  points: 1 | 2 | 3;
  hint: string;
}

export interface LifeQuest {
  /** 预设 id + 填词序号：同一天同一张卡的稳定键 */
  key: string;
  presetId: string;
  title: string;
  attribute: AttributeId;
  points: number;
  hint: string;
}

export const LIFE_QUEST_PRESETS: readonly LifeQuestPreset[] = [
  // ── 知识 ──
  { id: 'k01', attribute: 'knowledge', title: '学半小时一样新东西', points: 2, hint: '任何你好奇的都算' },
  { id: 'k02', attribute: 'knowledge', title: '读完一本书里的 20 页', points: 2, hint: '纸书、电子书都行' },
  { id: 'k03', attribute: 'knowledge', title: '看一部{x}纪录片', slots: ['历史', '自然', '美食', '科技', '人物', '城市'], points: 2, hint: '挑一部短的也行' },
  { id: 'k04', attribute: 'knowledge', title: '记住 10 个外语单词', points: 1, hint: '睡前再过一遍' },
  { id: 'k05', attribute: 'knowledge', title: '听一期{x}播客', slots: ['历史', '科普', '商业', '文化', '心理学'], points: 1, hint: '通勤路上就能做' },
  { id: 'k06', attribute: 'knowledge', title: '查清一个一直好奇的问题', points: 1, hint: '查完用三句话讲给自己听' },
  { id: 'k07', attribute: 'knowledge', title: '写 100 字今日学习笔记', points: 1, hint: '今天学到的任何一件事' },
  { id: 'k08', attribute: 'knowledge', title: '去书店或图书馆待半小时', points: 2, hint: '随手翻翻也算' },
  { id: 'k09', attribute: 'knowledge', title: '学会一个新的软件技巧', points: 1, hint: '快捷键、公式、剪辑都行' },
  { id: 'k10', attribute: 'knowledge', title: '专注 25 分钟做一件正事', points: 2, hint: '一个番茄钟，手机放远点' },
  { id: 'k11', attribute: 'knowledge', title: '读一篇{x}长文', slots: ['科普', '历史', '人物', '城市观察'], points: 1, hint: '读完记一句最有意思的' },
  { id: 'k12', attribute: 'knowledge', title: '认识一种路边的植物', points: 1, hint: '拍下来查查它叫什么' },
  // ── 胆量 ──
  { id: 'g01', attribute: 'guts', title: '把拖了一周的那件小事做掉', points: 2, hint: '越小越好，做完就算' },
  { id: 'g02', attribute: 'guts', title: '去一家没去过的{x}吃一顿', slots: ['面馆', '小吃店', '川菜馆', '粤菜馆', '日料店', '西餐厅', '火锅店'], points: 2, hint: '附近的就行' },
  { id: 'g03', attribute: 'guts', title: '{x} 20 分钟', slots: ['跑步', '跳绳', '快走', '骑车', '徒手训练'], points: 2, hint: '量力而行，出汗就好' },
  { id: 'g04', attribute: 'guts', title: '尝一道从没吃过的菜', points: 1, hint: '点外卖也算' },
  { id: 'g05', attribute: 'guts', title: '一个人去看一场电影', points: 2, hint: '选一部你自己想看的' },
  { id: 'g06', attribute: 'guts', title: '换一条没走过的路回家', points: 1, hint: '顺便看看沿路有什么' },
  { id: 'g07', attribute: 'guts', title: '爬一次楼梯代替电梯', points: 1, hint: '几层都算' },
  { id: 'g08', attribute: 'guts', title: '报名一件一直想试的事', points: 3, hint: '课程、比赛、活动、兴趣班' },
  { id: 'g09', attribute: 'guts', title: '比平时早起 30 分钟', points: 2, hint: '起来先别刷手机' },
  { id: 'g10', attribute: 'guts', title: '关掉手机一小时', points: 1, hint: '做点别的，不看也不回' },
  { id: 'g11', attribute: 'guts', title: '主动提一个问题', points: 2, hint: '课上、会上或群里都行' },
  { id: 'g12', attribute: 'guts', title: '把一个想了很久的想法说给一个人听', points: 2, hint: '说出来就算' },
  // ── 灵巧 ──
  { id: 'd01', attribute: 'dexterity', title: '给自己做一份{x}', slots: ['早餐', '家常菜', '甜点', '便当'], points: 2, hint: '简单的也算' },
  { id: 'd02', attribute: 'dexterity', title: '收拾好书桌', points: 1, hint: '只收桌面也算' },
  { id: 'd03', attribute: 'dexterity', title: '拉伸 15 分钟', points: 1, hint: '跟着视频做' },
  { id: 'd04', attribute: 'dexterity', title: '学一个小手工：{x}', slots: ['折纸', '编手绳', '简笔画', '新的叠衣服方法'], points: 2, hint: '跟着教程做一个' },
  { id: 'd05', attribute: 'dexterity', title: '拍一组「{x}」主题照片', slots: ['光影', '红色', '窗外', '影子', '街角', '天空'], points: 1, hint: '三张就够' },
  { id: 'd06', attribute: 'dexterity', title: '练字 15 分钟', points: 1, hint: '抄一段喜欢的话' },
  { id: 'd07', attribute: 'dexterity', title: '修好一件小东西', points: 2, hint: '松掉的螺丝、开线的扣子' },
  { id: 'd08', attribute: 'dexterity', title: '画一张速写', points: 1, hint: '画什么都行，十分钟就好' },
  { id: 'd09', attribute: 'dexterity', title: '清理手机相册', points: 1, hint: '删掉 50 张不要的' },
  { id: 'd10', attribute: 'dexterity', title: '规划一条周末小路线', points: 1, hint: '把想去的两三个地方连起来' },
  { id: 'd11', attribute: 'dexterity', title: '跟着视频学一段简单的舞步', points: 2, hint: '一小段就好' },
  { id: 'd12', attribute: 'dexterity', title: '把衣柜整理出一格', points: 1, hint: '顺手挑出不穿的' },
  // ── 温柔 ──
  { id: 'n01', attribute: 'kindness', title: '给家人打个电话', points: 2, hint: '聊聊近况' },
  { id: 'n02', attribute: 'kindness', title: '给很久没联系的朋友发条消息', points: 1, hint: '问一句最近好吗' },
  { id: 'n03', attribute: 'kindness', title: '认真夸一个人一次', points: 1, hint: '说具体的地方' },
  { id: 'n04', attribute: 'kindness', title: '帮身边的人做一件小事', points: 2, hint: '递个东西、搭把手都算' },
  { id: 'n05', attribute: 'kindness', title: '写下今天感激的三件事', points: 1, hint: '小事也行' },
  { id: 'n06', attribute: 'kindness', title: '整理出一件可以送人的闲置', points: 1, hint: '给需要的人' },
  { id: 'n07', attribute: 'kindness', title: '今晚 23 点前睡', points: 2, hint: '对自己温柔一点' },
  { id: 'n08', attribute: 'kindness', title: '听一个人把一件事说完', points: 1, hint: '不打断，不急着给建议' },
  { id: 'n09', attribute: 'kindness', title: '照顾一株植物或一只小动物', points: 1, hint: '浇水、喂食、陪它玩' },
  { id: 'n10', attribute: 'kindness', title: '给明天的自己留一句话', points: 1, hint: '写在便签或备忘录里' },
  { id: 'n11', attribute: 'kindness', title: '给朋友推荐一样你喜欢的东西', points: 1, hint: '一首歌、一本书、一家店' },
  { id: 'n12', attribute: 'kindness', title: '认真吃一顿饭，不看手机', points: 1, hint: '慢一点' },
  // ── 魅力 ──
  { id: 'c01', attribute: 'charm', title: '看一部{x}电影', slots: ['悬疑', '喜剧', '动画', '科幻', '老', '外语', '高分冷门'], points: 2, hint: '看完想想最喜欢哪一幕' },
  { id: 'c02', attribute: 'charm', title: '听完一张完整的专辑', points: 1, hint: '按顺序，从头到尾' },
  { id: 'c03', attribute: 'charm', title: '换一身认真搭配的衣服出门', points: 1, hint: '给自己看的也算' },
  { id: 'c04', attribute: 'charm', title: '去一家没去过的咖啡店坐坐', points: 2, hint: '奶茶店也行' },
  { id: 'c05', attribute: 'charm', title: '和一个人好好聊 10 分钟', points: 2, hint: '面对面或打电话' },
  { id: 'c06', attribute: 'charm', title: '发一条分享生活的动态', points: 1, hint: '分享一件今天的小事' },
  { id: 'c07', attribute: 'charm', title: '给朋友或自己拍一张好看的照片', points: 1, hint: '找找光' },
  { id: 'c08', attribute: 'charm', title: '尝一种没喝过的饮品', points: 1, hint: '茶、咖啡、果汁都行' },
  { id: 'c09', attribute: 'charm', title: '给房间换一个小布置', points: 1, hint: '挪挪摆件、换张海报' },
  { id: 'c10', attribute: 'charm', title: '去一个线下活动', points: 3, hint: '展览、市集、讲座都行' },
  { id: 'c11', attribute: 'charm', title: '花 15 分钟打理一下自己', points: 1, hint: '发型、护肤、修指甲' },
  { id: 'c12', attribute: 'charm', title: '学一首歌，能完整哼下来', points: 1, hint: '挑一首最近在听的' },
];

export const LIFE_QUEST_ATTRS: readonly AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
export const LIFE_QUEST_COUNT = 3;
/** 一天最多换几批（换的次数记在本机） */
export const LIFE_QUEST_REROLLS = 2;

const pad = (n: number) => String(n).padStart(2, '0');
export const lifeDayKeyOf = (d: Date | string): string => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
/** 比标题：去空白标点、小写——「看一部悬疑电影」和「看一部 悬疑 电影！」算同一条 */
export const normTitle = (t: string): string => t.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
const mulberry32 = (seed: number) => {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const shuffled = <T,>(arr: readonly T[], rnd: () => number): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** 今天以前 14 天里，自己记的（非系统类目、非补记）各维出现了几次；一条都没有返回 null */
export function weakestAttribute(activities: Activity[], dateKey: string, seedKey = ''): AttributeId | null {
  const end = new Date(`${dateKey}T00:00:00`).getTime();
  const start = end - 14 * 86400_000;
  const count = Object.fromEntries(LIFE_QUEST_ATTRS.map((k) => [k, 0])) as Record<AttributeId, number>;
  let any = false;
  for (const a of activities) {
    if (a.category || a.backfilled) continue;
    const t = new Date(a.date).getTime();
    if (t < start || t >= end) continue;
    any = true;
    for (const k of LIFE_QUEST_ATTRS) if ((a.pointsAwarded?.[k] ?? 0) > 0) count[k] += 1;
  }
  if (!any) return null;
  // 并列最少的按种子挑一个（不总是偏向排在前面的那维）
  const min = Math.min(...LIFE_QUEST_ATTRS.map((k) => count[k]));
  const ties = LIFE_QUEST_ATTRS.filter((k) => count[k] === min);
  return ties[Math.floor(mulberry32(fnv1a(`weak|${seedKey}|${dateKey}`))() * ties.length)];
}

/** 本地日期键 → 天序号（UTC 零点算，跨时区不跳号） */
const dayIndexOf = (dateKey: string): number => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400_000);
};

/**
 * 每一维一副「牌」：按（用户, 维度, 第几轮）洗一次，一天翻一张。同一维连着两天被选中也是相邻两张、不会重样；
 * 洗下一轮时，若新一轮第一张恰好是上一轮最后一张，跟第二张换个位置（轮与轮的接缝也不重样）。
 * 跨设备只看日期和用户，所以两台设备同一天看到的是同一批。
 */
const poolOf = (attr: AttributeId) => LIFE_QUEST_PRESETS.filter((p) => p.attribute === attr);
function deckOf(attr: AttributeId, seedKey: string, cycle: number): LifeQuestPreset[] {
  const pool = poolOf(attr);
  const deck = shuffled(pool, mulberry32(fnv1a(`deck|${seedKey}|${attr}|${cycle}`)));
  const prev = shuffled(pool, mulberry32(fnv1a(`deck|${seedKey}|${attr}|${cycle - 1}`)));
  if (deck.length > 1 && deck[0].id === prev[prev.length - 1].id) [deck[0], deck[1]] = [deck[1], deck[0]];
  return deck;
}
function deckAt(attr: AttributeId, seedKey: string, idx: number): LifeQuestPreset {
  const n = poolOf(attr).length;
  const cycle = Math.floor(idx / n);
  return deckOf(attr, seedKey, cycle)[((idx % n) + n) % n];
}

const render = (p: LifeQuestPreset, seedKey: string, dayIdx: number): { title: string; slot: number } => {
  if (!p.slots?.length) return { title: p.title, slot: -1 };
  const slot = Math.floor(mulberry32(fnv1a(`slot|${seedKey}|${p.id}|${dayIdx}`))() * p.slots.length);
  return { title: p.title.replace('{x}', p.slots[slot]), slot };
};

export interface PickInput {
  dateKey: string;
  /** 用户 id（或名字）：不同人同一天拿到不同的三张 */
  seedKey: string;
  weakest: AttributeId | null;
  /** 不出的预设 id（换一批前那一批） */
  excludeIds?: ReadonlySet<string>;
  /** 清单里已有的任务（规整后的标题） */
  existingTitles?: ReadonlySet<string>;
  /** 今天换过几批 */
  reroll?: number;
}

/**
 * 今天这批：最弱一维先占一张，其余几维按日子洗个顺序再挑两张；每一维从自己那副牌里取今天这张。
 * 撞上清单里已有的同名任务 / 换一批前那张，就往后跳半副牌找（不跳相邻的，免得和明天那张撞）。
 */
export function pickLifeQuests(input: PickInput): LifeQuest[] {
  const dayIdx = dayIndexOf(input.dateKey);
  const reroll = input.reroll ?? 0;
  const rnd = mulberry32(fnv1a(`life|${input.seedKey}|${input.dateKey}|${reroll}`));
  const others = shuffled(LIFE_QUEST_ATTRS.filter((k) => k !== input.weakest), rnd);
  const order = input.weakest ? [input.weakest, ...others] : others;
  const out: LifeQuest[] = [];
  for (const attr of order) {
    if (out.length >= LIFE_QUEST_COUNT) break;
    const n = poolOf(attr).length;
    const half = Math.max(1, Math.floor(n / 2));
    // 换一批往后错 5 张（避开明天的那张：明天是 +1）
    const base = dayIdx + reroll * 5;
    for (let step = 0; step < n; step++) {
      const p = deckAt(attr, input.seedKey, base + step * half + (step >= 2 ? step : 0));
      if (input.excludeIds?.has(p.id) || out.some((q) => q.presetId === p.id)) continue;
      const r = render(p, input.seedKey, dayIdx);
      if (input.existingTitles?.has(normTitle(r.title))) continue;
      out.push({ key: `${p.id}#${r.slot}`, presetId: p.id, title: r.title, attribute: p.attribute, points: p.points, hint: p.hint });
      break;
    }
  }
  return out;
}

/** 某天（第几批）的三张；清单里今天以前就有的同名任务不出 */
export function lifeQuestsFor(opts: {
  dateKey: string;
  seedKey: string;
  activities: Activity[];
  todos: Todo[];
  reroll: number;
  /** 换一批时：刚才那批的预设 id */
  previousIds?: string[];
}): LifeQuest[] {
  const weakest = weakestAttribute(opts.activities, opts.dateKey, opts.seedKey);
  const existingTitles = new Set(
    opts.todos.filter((t) => t.isActive && !t.archivedAt && lifeDayKeyOf(t.createdAt) < opts.dateKey).map((t) => normTitle(t.title)),
  );
  return pickLifeQuests({
    dateKey: opts.dateKey, seedKey: opts.seedKey, weakest, existingTitles, reroll: opts.reroll,
    excludeIds: new Set(opts.previousIds ?? []),
  });
}

// ── 本机记一下今天这批（同一天卡片不变脸；换一批的次数）──
const STORE_KEY = 'velvet:lifeQuests.v1';
export interface LifeQuestDay { date: string; reroll: number; items: LifeQuest[] }

export function readLifeQuestDay(): LifeQuestDay | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LifeQuestDay;
    return v && typeof v.date === 'string' && Array.isArray(v.items) ? v : null;
  } catch { return null; }
}
export function writeLifeQuestDay(v: LifeQuestDay): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* 存不了就每次现算（种子固定，结果一样） */ }
}
