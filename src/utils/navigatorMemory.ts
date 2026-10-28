/**
 * navigatorMemory — F6 黑猫的记忆闭环（Batch3 第二阶段）。
 *
 * 双泵（F6_NAVIGATOR_MEMORY.md §2.3 定稿）：
 *   · 主泵 finalizeStaleSessions：开窗时对「昨日及更早、尚无摘要」的会话做会话末 compact
 *     （每天最多一次 AI 调用/会话；不足门槛走本地拼接，不产记忆）。
 *   · 阈值泵 maybeCompactLive：活跃会话 est>32k tokens 或 >120 条 → 压缩除最近 12 条外的
 *     部分（含旧 summary 滚动合并）为一条 role:'summary' 消息；est>90k 本地硬截断保险丝。
 * 原子记忆：compact 抽取 0~2 条中性事实入 navigatorMemos（人格口吻现场渲染，不持久化口吻）。
 * 检索（§2.4）：importance/时近/关键词重合/followUp 加成/过度引用降权 → top≤4 注入；
 * followUp 注入即清（宁可少提醒不重复）；遗忘（§2.5）惰性 archived，置顶免疫。
 * 所有 AI 产物过校验管线（每层护栏假设上一层会漏——Batch2 的教训）。
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db';
import { memoryIsolated, memoVisibleTo, memoOwner, ownersKey } from '@/utils/navigatorMemoryScope';
import { tokenize, queryChars } from '@/utils/navigatorIndex';
import { useAppStore, toLocalDateKey } from '@/store';
import { chatComplete, getAIConfig, type AIConfig, type AIMessage } from '@/utils/aiClient';
import { BUILTIN_NAVIGATOR_PRESETS, resolveNavigatorPreset } from '@/constants/navigatorPresets';
import { calendarTable, dayLabelCN, daysBetween, keyOfDate, relativeDayCN, shortMD } from '@/utils/navigatorClock';
import { followUpCoveredByPromise, isPromise, mentionsTopic, promisePhase, savePromisesFromCompact } from '@/utils/navigatorPromise';
import type { NavigatorMemo, NavigatorMessageRow, NavigatorPreset, ProfileBlockMeta, ProfileBlocks } from '@/types';

// ── token 估算（触发判断用，不求精确；中文≈0.6~0.9 token/字取保守 0.75） ──
export function estTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[぀-ヿ一-鿿]/.test(ch)) cjk++;
    else other++;
  }
  return Math.round(cjk * 0.75 + other * 0.3);
}

const LIVE_COMPACT_TOKENS = 32_000;
const LIVE_COMPACT_MSGS = 120;
const LIVE_KEEP_RECENT = 12;
const HARD_CAP_TOKENS = 90_000;
/** 会话末 AI compact 的最低门槛：用户消息 ≥2 条或 ≥40 字（第 13 轮从 4 条 / 120 字降下来：短聊也该留下记忆，不然「昨天才说过」就忘） */
const FINALIZE_MIN_USER_MSGS = 2;
const FINALIZE_MIN_USER_CHARS = 40;
/** 允许改写用户画像的门槛（第 13 轮之前的归档门槛）：低于它的短会话只收记忆，不动画像 */
const PROFILE_MIN_USER_MSGS = 4;
const PROFILE_MIN_USER_CHARS = 120;
/** 近 7 天记忆保底注入的冷却：同一条 6 小时内最多硬塞一次 */
const RECENT_MEMO_COOLDOWN_MS = 6 * 3600_000;

// ── compact LLM 调用 ──

/** 归档器对一条记忆的处理（第 26 批 · B1，mem0 的 ADD / UPDATE / DELETE / NOOP）：ref 指【已有的相关记忆】里的短 id */
export interface CompactMemoryOp {
  op: 'add' | 'update' | 'supersede' | 'noop';
  ref?: string;
  text: string;
  importance: number;
  colorHint?: string;
  /** 线索词：以后聊到什么时该想起这条（召回 / 联想用） */
  cues?: string[];
}
/** 「你们之间的说法」（第 26 批 · §24.11） */
export interface CompactBit { phrase: string; meaning: string; origin?: string }

interface CompactResult {
  summary: string;
  personaSummary: string;
  memories: CompactMemoryOp[];
  followUp: string | null;
  /** 画像：只有变化的块（第 26 批起分块）；无变化为 null */
  profile: Partial<ProfileBlocks> | null;
  /** 短对话里归档器标为「关键自我定义」而改的块（第 35 批 f）：短会话只认这几块 */
  keyBlocks: Array<keyof ProfileBlocks>;
  /** 归档器说过时的近况该清掉（输出了 "recent":""；只在近况确实超过 30 天没更新时生效） */
  clearRecent: boolean;
  /** 带日子、过后要问结果的事（第二批回访约定：会话末补记漏掉的） */
  promises: unknown[];
  bits: CompactBit[];
  /** 「他说话的习惯」（第 36 批）：0~1 条，存成 bit 的 style 一类 */
  styleNotes: string[];
}

// ── 用户画像（第 26 批起分五块：身份 / 目标 / 偏好与雷区 / 近况 / 相处守则；归档器只回有变化的块，留上一版可撤回） ──

const PROFILE_ID = 'navigator-user-profile';
export const PROFILE_KEYS: Array<keyof ProfileBlocks> = ['identity', 'goals', 'preferences', 'recent', 'rules'];
export const PROFILE_LABELS: Record<keyof ProfileBlocks, string> = { identity: '身份与处境', goals: '长期目标', preferences: '偏好与雷区', recent: '近况', rules: '相处守则' };
export const PROFILE_LIMITS: Record<keyof ProfileBlocks, number> = { identity: 120, goals: 120, preferences: 120, recent: 100, rules: 100 };
/** 近况超过这么多天没更新就算过时（第 35 批 f）：注入时标出来，整理时可按新材料重写、没有就清掉 */
export const PROFILE_RECENT_STALE_DAYS = 30;
/** 短会话也允许按「关键自我定义」改的几块（第 35 批 f；goals / recent 短会话不动） */
export const PROFILE_KEY_BLOCKS: Array<keyof ProfileBlocks> = ['identity', 'preferences', 'rules'];

/** 近况记了多少天了（没有来历 = 老数据，算不出来返回 null） */
export function recentAgeDays(meta: Partial<Record<keyof ProfileBlocks, ProfileBlockMeta>>, todayKey: string = toLocalDateKey()): number | null {
  const d = meta.recent?.day;
  return d ? Math.max(0, daysBetween(d, todayKey)) : null;
}
export const isRecentStale = (meta: Partial<Record<keyof ProfileBlocks, ProfileBlockMeta>>, todayKey: string = toLocalDateKey()): boolean =>
  (recentAgeDays(meta, todayKey) ?? 0) > PROFILE_RECENT_STALE_DAYS;

/** 给整理器看的画像文本（第 35 批 f）：每块带来历（谁 / 哪天 / 据什么），过时的近况标出来 */
export function profileTextForPrompt(blocks: ProfileBlocks, meta: Partial<Record<keyof ProfileBlocks, ProfileBlockMeta>>, todayKey: string = toLocalDateKey()): string {
  const lines = PROFILE_KEYS.filter((k) => blocks[k]).map((k) => {
    const m = meta[k];
    const who = m ? (m.by === 'user' ? '用户手改' : `AI ${m.from === 'records' ? '据记录' : '据聊天'}整理`) : '';
    const age = m?.day ? daysBetween(m.day, todayKey) : null;
    const when = m?.day ? `${dayLabelCN(m.day, todayKey)}${age !== null && age > 0 ? `，${age} 天前` : ''}` : '';
    const stale = k === 'recent' && isRecentStale(meta, todayKey) ? `已超过 ${PROFILE_RECENT_STALE_DAYS} 天没更新，可能过时` : '';
    const parts = [[who, when].filter(Boolean).join(' '), stale].filter(Boolean);
    return `${k}（${PROFILE_LABELS[k]}）${parts.length ? `（${parts.join('；')}）` : ''}：${blocks[k]}`;
  });
  return lines.join('\n') || '（暂无）';
}

// ── 记忆隔离（第 23 批）：判定在 navigatorMemoryScope；开了之后按人格分，没标人格的是共享 ──
export { memoryIsolated, memoVisibleTo, memoOwner, memoOwners, ownersKey, ownersPatch } from '@/utils/navigatorMemoryScope';

const profileIdFor = (presetId: string | undefined): string => (memoryIsolated() && presetId ? `${PROFILE_ID}:${presetId}` : PROFILE_ID);

const trimBlocks = (b: Partial<ProfileBlocks> | undefined | null): ProfileBlocks => {
  const out: ProfileBlocks = {};
  if (!b) return out;
  for (const k of PROFILE_KEYS) {
    const v = typeof b[k] === 'string' ? b[k]!.replace(/\s+/g, ' ').trim().slice(0, PROFILE_LIMITS[k]) : '';
    if (v) out[k] = v;
  }
  return out;
};
const blocksEmpty = (b: ProfileBlocks): boolean => PROFILE_KEYS.every((k) => !b[k]);
const blocksEqual = (a: ProfileBlocks, b: ProfileBlocks): boolean => PROFILE_KEYS.every((k) => (a[k] ?? '') === (b[k] ?? ''));

/** 注入用的一段：只有「身份」一块时原样给（老画像 / 手写的整段），多块时带标签；recentAge 给了且过时 → 近况标「可能已过时」（第 35 批 f） */
export function flattenProfile(b: ProfileBlocks, recentAge?: number | null): string {
  const present = PROFILE_KEYS.filter((k) => b[k]);
  const label = (k: keyof ProfileBlocks): string =>
    k === 'recent' && typeof recentAge === 'number' && recentAge > PROFILE_RECENT_STALE_DAYS ? `近况（${recentAge} 天前记的，可能已过时）` : PROFILE_LABELS[k];
  if (!present.length) return '';
  if (present.length === 1 && present[0] === 'identity') return b.identity!;
  return present.map((k) => `${label(k)}：${b[k]}`).join('；');
}

/** 行 → 块：没分过块的老画像整段算「身份」 */
const blocksOfRow = (row: NavigatorMemo | undefined): ProfileBlocks => {
  if (!row || row.status !== 'active') return {};
  if (row.profileBlocks) return trimBlocks(row.profileBlocks);
  return row.text ? { identity: row.text.slice(0, PROFILE_LIMITS.identity) } : {};
};

/** 这个人格实际读的那一行：隔离时先取自己的，自己的还空着就退回共享的那份 */
async function readableProfileRow(presetId?: string): Promise<{ row: NavigatorMemo | undefined; own: boolean }> {
  const id = profileIdFor(presetId);
  const own = await db.navigatorMemos.get(id);
  if (!blocksEmpty(blocksOfRow(own)) || id === PROFILE_ID) return { row: own, own: true };
  return { row: await db.navigatorMemos.get(PROFILE_ID), own: false };
}

/** 画像的块：隔离时先取这个人格自己的，没有就退回共享的那份 */
export async function getProfileBlocks(presetId?: string): Promise<ProfileBlocks> {
  try {
    return blocksOfRow((await readableProfileRow(presetId)).row);
  } catch { return {}; }
}

/** 记事本要的一整套（第 33 批）：块 + 每块的来历 + 锁 + 能不能撤回 + 上次参考记录整理的日子；own = 这个人格自己有一份 */
export interface ProfileState {
  blocks: ProfileBlocks;
  meta: Partial<Record<keyof ProfileBlocks, ProfileBlockMeta>>;
  locks: Array<keyof ProfileBlocks>;
  hasPrev: boolean;
  recordsAt?: string;
  own: boolean;
}
export async function getProfileState(presetId?: string): Promise<ProfileState> {
  try {
    const { row, own } = await readableProfileRow(presetId);
    return {
      blocks: blocksOfRow(row), meta: row?.profileMeta ?? {}, locks: row?.profileLocks ?? [],
      hasPrev: !!row?.profilePrev && own, recordsAt: row?.profileRecordsAt, own,
    };
  } catch { return { blocks: {}, meta: {}, locks: [], hasPrev: false, own: true }; }
}

/** 这一笔是谁写的（不给 = 用户在记事本里手改） */
export interface ProfileWriteSource {
  by: 'ai' | 'user';
  /** AI 改的：每块按什么改的（不在里面的按 from） */
  from?: 'chat' | 'records';
  fromByKey?: Partial<Record<keyof ProfileBlocks, 'chat' | 'records'>>;
  /** 哪天（缺省今天） */
  day?: string;
  /** 顺手记下这次是「参考记录」整理的（每 5 天一次的那个钟） */
  recordsAt?: string;
}

/** 注入用的整段文字（过时的近况带标注，第 35 批 f） */
export async function getProfile(presetId?: string): Promise<string> {
  const st = await getProfileState(presetId);
  return flattenProfile(st.blocks, recentAgeDays(st.meta));
}

/**
 * 写画像的块（归档器增量 / 记事本手改 / 参考记录整理）：留上一版，撤回时换回来；改到的块记下来历（第 33 批），
 * 锁、来历、上次参考记录的日子原样留着。隔离时这个人格第一次有自己的一份：从共享那份接过来（来历 / 锁一起）
 */
export async function saveProfileBlocks(blocks: Partial<ProfileBlocks>, presetId?: string, src: ProfileWriteSource = { by: 'user' }): Promise<void> {
  const id = profileIdFor(presetId);
  const next = trimBlocks(blocks);
  let base: NavigatorMemo | undefined;
  let prev: ProfileBlocks | undefined;
  try {
    const { row, own } = await readableProfileRow(presetId);
    base = row;
    const curBlocks = blocksOfRow(row);
    prev = !blocksEmpty(curBlocks) && !blocksEqual(curBlocks, next) ? curBlocks : own ? row?.profilePrev : undefined;
  } catch { /* */ }
  const curBlocks = blocksOfRow(base);
  const day = src.day ?? toLocalDateKey();
  const meta: Partial<Record<keyof ProfileBlocks, ProfileBlockMeta>> = { ...(base?.profileMeta ?? {}) };
  for (const k of PROFILE_KEYS) {
    if ((curBlocks[k] ?? '') === (next[k] ?? '')) continue;
    if (!next[k]) { delete meta[k]; continue; }
    const from = src.by === 'ai' ? (src.fromByKey?.[k] ?? src.from) : undefined;
    meta[k] = { by: src.by, day, ...(from ? { from } : {}) };
  }
  const recordsAt = src.recordsAt ?? base?.profileRecordsAt;
  await db.navigatorMemos.put({
    id, source: 'profile', text: flattenProfile(next), importance: 5, pinned: true,
    status: blocksEmpty(next) ? 'archived' : 'active', createdAt: new Date(),
    profileBlocks: next, ...(prev && !blocksEmpty(prev) ? { profilePrev: prev } : {}),
    ...(Object.keys(meta).length ? { profileMeta: meta } : {}),
    ...(base?.profileLocks?.length ? { profileLocks: base.profileLocks } : {}),
    ...(recordsAt ? { profileRecordsAt: recordsAt } : {}),
    ...(id !== PROFILE_ID ? { presetId } : {}),
  });
}

/** 锁住 / 解开一块（第 33 批）：锁了 AI 就不动它，只有用户改。这个人格还没有自己的一份时先从共享那份接过来 */
export async function setProfileLock(key: keyof ProfileBlocks, locked: boolean, presetId?: string): Promise<void> {
  const id = profileIdFor(presetId);
  let row = await db.navigatorMemos.get(id);
  if (!row || blocksEmpty(blocksOfRow(row))) {
    const { row: base } = await readableProfileRow(presetId);
    const blocks = blocksOfRow(base);
    row = {
      id, source: 'profile', text: flattenProfile(blocks), importance: 5, pinned: true, status: blocksEmpty(blocks) ? 'archived' : 'active', createdAt: new Date(),
      profileBlocks: blocks, ...(base?.profileMeta ? { profileMeta: base.profileMeta } : {}), ...(base?.profileLocks?.length ? { profileLocks: base.profileLocks } : {}),
      ...(base?.profileRecordsAt ? { profileRecordsAt: base.profileRecordsAt } : {}), ...(id !== PROFILE_ID ? { presetId } : {}),
    };
  }
  const locks = new Set(row.profileLocks ?? []);
  if (locked) locks.add(key); else locks.delete(key);
  const list = PROFILE_KEYS.filter((k) => locks.has(k));
  const { profileLocks: _old, ...rest } = row;
  void _old;
  await db.navigatorMemos.put(list.length ? { ...rest, profileLocks: list } : rest);
}

/** 只留没锁的块（AI 写画像之前过一遍） */
export const withoutLocked = (blocks: Partial<ProfileBlocks>, locks: Array<keyof ProfileBlocks>): Partial<ProfileBlocks> => {
  const out: Partial<ProfileBlocks> = {};
  for (const k of PROFILE_KEYS) if (blocks[k] !== undefined && !locks.includes(k)) out[k] = blocks[k];
  return out;
};

/** 画像自动更新开着没有（第 33 批，默认开） */
export const profileAutoOn = (): boolean => useAppStore.getState().settings.navigatorProfileAuto !== false;

/** 旧接口：整段文字 = 「身份」一块（老测试 / 记事本整段模式） */
export async function saveProfile(text: string, presetId?: string): Promise<void> {
  await saveProfileBlocks({ identity: text.trim().slice(0, 400) }, presetId);
}

/** 撤回到上一版（有的话） */
export async function undoProfile(presetId?: string): Promise<boolean> {
  const id = profileIdFor(presetId);
  const cur = await db.navigatorMemos.get(id);
  if (!cur?.profilePrev) return false;
  const prev = trimBlocks(cur.profilePrev);
  const curBlocks = blocksOfRow(cur);
  // 撤回也是用户自己动的手：换回来的块标「你改的」
  const meta: Partial<Record<keyof ProfileBlocks, ProfileBlockMeta>> = { ...(cur.profileMeta ?? {}) };
  for (const k of PROFILE_KEYS) {
    if ((curBlocks[k] ?? '') === (prev[k] ?? '')) continue;
    if (prev[k]) meta[k] = { by: 'user', day: toLocalDateKey() }; else delete meta[k];
  }
  await db.navigatorMemos.put({ ...cur, text: flattenProfile(prev), profileBlocks: prev, profilePrev: curBlocks, status: blocksEmpty(prev) ? 'archived' : 'active', profileMeta: meta });
  return true;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const COMPACT_PROTOCOL = `你是对话归档器。把给定的「用户与陪伴 AI 的对话片段」压缩归档。
只输出这一个 JSON 对象（不要代码块、不要其它文字）：
{"summary":"","personaSummary":"","memories":[],"followUp":null,"profile":null,"keyBlocks":[],"promises":[],"bits":[],"styleNotes":[]}
- summary：中性第三人称摘要，≤120 字，保留具体事实（做了什么/提到什么/情绪如何）。
- personaSummary：同样内容，改用陪伴 AI 的第一人称口吻复述，≤100 字。
- memories：0~2 条值得长期记住的**关于用户的**原子事实（各 ≤40 字，中性陈述句），
  每条 {"op":"add|update|supersede|noop","ref":"m1","text":"","importance":1..5,"colorHint":"提起时的情绪，可空","cues":["线索词"]}。
  先对照【已有的相关记忆】：同一件事已经记过 → op=noop（ref 写那条）；这件事有了新进展、旧说法过时了（「在准备雅思」→「雅思考完了」）→ op=supersede（ref 写旧的那条，text 写新事实）；
  只是补充细节、旧的仍然对 → op=update（ref 写那条，text 写合并后的全文）；全新的事 → op=add（ref 留空）。ref 只能是列表里给出的 id。
  cues：2~6 个「以后聊到什么时该想起这条」的词——话题、物件、情绪、场景（如 咖啡、键盘、熬夜、尴尬、下雨天），别重复 text 里已有的词。
  **主语必须是用户**：陪伴 AI 自己说过的话、答应的事、它的心情一概不收（那是它的事，不是用户的事实）；用户对 AI 的评价（「你又忘了」「记性真差」）也不收。
  只收会影响未来相处的事（在准备的考试/长期困扰/重要偏好/关系变化）；日常流水不收。
  **不收操作痕迹**：对话里 [卡片·…] 这类行是工具调用留下的操作记录，不是关于用户的事实。
  「用户有一条 xxx 的记录」「用户记了一笔 xx 元」「用户加了个待办」一律不要写进 memories——
  这些 App 里本来就查得到。只有当那件事本身透露了长期信息（如反复出现的目标、身份、处境）
  才写，且要写成那条事实本身而不是"他记了什么"。
- followUp：一个值得下次自然追问的话头（≤30 字），没有就 null。
- 带 [沉] 标记的是对方很沉重时说的话：可以记成关于用户的事实（colorHint 写「沉重」），但**不要**写成 followUp、不要写进 promises、不要当成要回访的事——过几天轻飘飘地问「那天你说不想活了，后来呢」是伤人的。
- profile：【现有用户画像】分五块——identity 身份与处境 / goals 长期目标 / preferences 偏好与雷区 / recent 近况 / rules 相处守则（他希望你怎么对他）。
  拿它和本段对话对照，只输出**有变化的块**，每块写更新后的全文（identity / goals / preferences ≤120 字，recent / rules ≤100 字，中性第三人称，合并去重）：如 {"recent":"…"}；都没变化就 null。
  不要把短期琐事写进画像；rules 只在他明确表达过（「我说累的时候别催我」）时写，写成「他希望…」。
  每块后面括号里写了它上次是谁、哪天、据什么改的：**用户手改**的块只在他这段亲口说的和它明显矛盾、或有了新进展时才改，别用你的措辞重写它；
  标了「可能过时」的近况：这段对话里有新近况就重写，没有就输出 "recent":"" 把它清掉（只有这种情况才允许输出空串）。
  输入里标了【短对话】的：goals / recent 不改；identity / preferences / rules 只在他亲口说出关于自己的**关键定义**时才改
  （身份 / 处境变了、明确说出的喜好或雷区、希望被怎样对待），并把改的块名写进 keyBlocks（如 ["preferences"]）；没有就 profile 为 null。
- keyBlocks：只在【短对话】里按上一条改了画像时填块名；平常为 []。
- **日子写具体**：输入第一行写了这段对话发生在哪天。对话里「今天 / 明天 / 后天 / 周五 / 下周一 / 月底」
  这类说法，写进 summary、memories、followUp 时一律换成具体日子（如「10月3日（周五）」）——
  这些文字以后会在别的日子被读到，「明天」到那时就错了。实在定不下来的，写「10月1日提到的“下周”」。
- promises：用户提到的、他自己要经历的、日子明确、过后值得问一句结果的事（面试、考试、体检、答辩、比赛、演出、约会、搬家、出发、手术……），
  每条 {"topic":"≤8 字","date":"YYYY-MM-DD","when":"morning|day|evening"}；日子按第一行的日期和【日历】查；没有就 []。
  **这类事只写在 promises 里，不要再写成 memories 或 followUp**——会有专门的回访去问，写两处就会被问两遍。
- bits：0~2 条「你们之间的说法」：这段对话里新出现的、以后还能再用的昵称 / 代号 / 玩笑 / 反复出现的梗，包括用户自己造的词（「把拖延叫『充能』」）。
  每条 {"phrase":"≤10 字","meaning":"≤30 字","origin":"≤20 字，从哪件事来的"}。这不是关于用户的事实，不要写进 memories；平常的词、只随口说了一次的话不算；没有就 []。
- styleNotes：0~1 条「他说话的习惯」（≤24 字，如「爱用『哈哈哈』收尾，句子都很短」「喜欢用颜文字」「几乎不打标点」）：只记这段对话里明显、而且像是稳定习惯的；没有就 []。`;

/** 【已有的相关记忆】里的一条（短 id → 真 id 的映射由调用方保管） */
export interface RelatedMemo { ref: string; id: string; text: string; dateKey: string }

/** 归档前挑出和这段对话相关的旧记忆（≤8 条）：用户说的那几句做查询，词 + 二元组 + 字级兜底 */
export async function relatedMemosFor(lines: string[], presetId: string | undefined, limit = 8): Promise<RelatedMemo[]> {
  try {
    const memos = (await db.navigatorMemos.where('status').equals('active').toArray())
      .filter((m) => m.source !== 'profile' && m.source !== 'bit' && memoVisibleTo(m, presetId));
    if (!memos.length) return [];
    const userText = lines.filter((l) => l.startsWith('用户：') || l.startsWith('[沉] 用户：')).join(' ');
    const q = new Set(tokenize(userText));
    const qc = new Set(queryChars(userText));
    const scored = memos.map((m) => {
      const toks = new Set([...tokenize(m.text), ...(m.cues ?? [])]);
      let hit = 0;
      toks.forEach((t) => { if (q.has(t)) hit += 1; });
      queryChars(m.text).forEach((c) => { if (qc.has(c)) hit += 0.25; });
      return { m, hit };
    }).filter((x) => x.hit >= 1).sort((a, b) => b.hit - a.hit || new Date(a.m.createdAt).getTime() - new Date(b.m.createdAt).getTime());
    // 一字不差的重复只列最早那条（supersede 时会把同文的一起作废）
    const seen = new Set<string>();
    const out: RelatedMemo[] = [];
    for (const x of scored) {
      const key = normalizeMemoText(x.m.text);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ref: `m${out.length + 1}`, id: x.m.id, text: x.m.text, dateKey: toLocalDateKey(new Date(x.m.createdAt)) });
      if (out.length >= limit) break;
    }
    return out;
  } catch { return []; }
}

const cleanCues = (raw: unknown): string[] | undefined => {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [...new Set(arr.map((x) => String(x ?? '').replace(/\s+/g, '').trim().slice(0, 10)).filter((x) => x.length >= 1))].slice(0, 6);
  return out.length ? out : undefined;
};

/** 归档时画像这头的附加信息（第 35 批 f）：每块的来历；short = 短会话（只认关键自我定义） */
interface CompactProfileOpts {
  meta?: Partial<Record<keyof ProfileBlocks, ProfileBlockMeta>>;
  short?: boolean;
}

async function compactViaAI(
  cfg: AIConfig,
  lines: string[],
  personaName: string,
  oldProfile: ProfileBlocks,
  /** 这段对话发生在哪天（YYYY-MM-DD）：模型据此把「明天 / 周五」换成具体日子 */
  dateKey: string,
  related: RelatedMemo[] = [],
  profileOpts: CompactProfileOpts = {},
): Promise<CompactResult | null> {
  try {
    let raw: string;
    const profileText = profileTextForPrompt(oldProfile, profileOpts.meta ?? {}, dateKey);
    const relatedText = related.length ? related.map((r) => `- ${r.ref}（${shortMD(r.dateKey)} 记）：${r.text}`).join('\n') : '（无）';
    const shortLine = profileOpts.short ? '【短对话】这段很短：goals / recent 不改；identity / preferences / rules 只在他亲口说出关于自己的关键定义时改，并写进 keyBlocks。\n' : '';
    const messages: AIMessage[] = [
      { role: 'system', content: COMPACT_PROTOCOL },
      { role: 'user', content: `这段对话发生在 ${dayLabelCN(dateKey)}（${dateKey}）。\n【日历】\n${calendarTable(dateKey, 21)}\n陪伴 AI 的名字：${personaName}\n${shortLine}【现有用户画像】\n${profileText}\n【已有的相关记忆】\n${relatedText}\n【对话片段】\n${lines.join('\n')}` },
    ];
    try {
      raw = await chatComplete(cfg, messages, { temperature: 0.3, maxTokens: 1100, jsonMode: true, purpose: 'compact' });
    } catch (e) {
      if (e instanceof Error && e.message.includes('空响应')) {
        raw = await chatComplete(cfg, messages, { temperature: 0.3, maxTokens: 1100, jsonMode: false, purpose: 'compact' });
      } else throw e;
    }
    const parsed = extractJson(raw);
    if (!parsed) return null;
    // noop 不占名额：最多看 6 条，真正写入的在 persistMemories 里限 3 条
    const memories = (Array.isArray(parsed.memories) ? parsed.memories : [])
      .slice(0, 6)
      .map((m) => {
        const r = m as Record<string, unknown>;
        const text = String(r.text ?? '').trim().slice(0, 60);
        const op = r.op === 'update' || r.op === 'supersede' || r.op === 'noop' ? r.op : 'add';
        if (!text && op !== 'noop') return null;
        const imp = Math.round(Number(r.importance));
        return {
          op, ref: typeof r.ref === 'string' ? r.ref.trim() : undefined, text,
          importance: Number.isFinite(imp) ? Math.min(5, Math.max(1, imp)) : 3,
          colorHint: String(r.colorHint ?? '').trim().slice(0, 30) || undefined,
          cues: cleanCues(r.cues),
        } as CompactMemoryOp;
      })
      .filter((m): m is CompactMemoryOp => !!m);
    const summary = String(parsed.summary ?? '').trim().slice(0, 200);
    if (!summary) return null;
    // 画像：对象（分块）或旧式整段字符串（当作 identity）
    let profile: Partial<ProfileBlocks> | null = null;
    let clearRecent = false;
    if (parsed.profile && typeof parsed.profile === 'object') {
      const rawProfile = parsed.profile as Record<string, unknown>;
      clearRecent = rawProfile.recent === '';
      const pb = trimBlocks(rawProfile as Partial<ProfileBlocks>);
      profile = blocksEmpty(pb) ? null : pb;
    } else if (typeof parsed.profile === 'string' && parsed.profile.trim()) {
      profile = { identity: parsed.profile.trim().slice(0, 400) };
    }
    const keyBlocks = (Array.isArray(parsed.keyBlocks) ? parsed.keyBlocks : [])
      .filter((k): k is keyof ProfileBlocks => typeof k === 'string' && (PROFILE_KEYS as string[]).includes(k));
    const bits: CompactBit[] = [];
    for (const b of (Array.isArray(parsed.bits) ? parsed.bits : []).slice(0, 2)) {
      const r = (b && typeof b === 'object') ? b as Record<string, unknown> : {};
      const phrase = String(r.phrase ?? '').replace(/^[「『"“]|[」』"”]$/g, '').trim().slice(0, 12);
      if (!phrase) continue;
      const origin = String(r.origin ?? '').trim().slice(0, 24);
      bits.push({ phrase, meaning: String(r.meaning ?? '').trim().slice(0, 40), ...(origin ? { origin } : {}) });
    }
    const styleNotes = (Array.isArray(parsed.styleNotes) ? parsed.styleNotes : [])
      .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)).filter((x) => x.length >= 4).slice(0, 1);
    return {
      summary,
      personaSummary: String(parsed.personaSummary ?? '').trim().slice(0, 180) || summary,
      memories,
      followUp: String(parsed.followUp ?? '').trim().slice(0, 40) || null,
      profile,
      keyBlocks,
      clearRecent,
      promises: Array.isArray(parsed.promises) ? parsed.promises : [],
      bits,
      styleNotes,
    };
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[navigator] compact 调用失败', e);
    return null;
  }
}

/** 评测用（tests-local/evals/memory-run.mjs）：直接跑一次归档器，不落库 */
export async function _compactForTest(lines: string[], personaName: string, oldProfile: ProfileBlocks, dateKey: string, related: RelatedMemo[]): Promise<CompactResult | null> {
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (!cfg) throw new Error('未配置 AI');
  return compactViaAI(cfg, lines, personaName, oldProfile, dateKey, related);
}

/** 消息行 → compact 输入行（卡片折叠为一行事实） */
export function rowsToLines(rows: NavigatorMessageRow[]): string[] {
  return rows
    .map((r) => {
      if (r.role === 'card') {
        const status = r.cardStatus === 'done' ? '已确认' : r.cardStatus === 'cancelled' ? '已取消' : '未确认';
        return `[卡片·${status}] ${r.receipt ?? r.text ?? ''}`.trim();
      }
      if (r.role === 'summary') return `[早前摘要] ${r.text ?? ''}`;
      return `${r.heavy ? '[沉] ' : ''}${r.role === 'user' ? '用户' : 'AI'}：${r.text ?? ''}`;
    })
    .filter((l) => l.length > 3);
}

/**
 * 这条记忆是不是「关于用户的」（第 23 批 · 串戏排查 ③）：归档器偶尔会把陪伴 AI 自己说的话 / 答应的事当成记忆存下来，
 * 换个人格读到就会以上一个人格的立场说话。带人格名、第一人称开头、「答应 / 承诺 / 会提醒」一类的都不收。
 */
export function isAboutUser(text: string, personaName: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (personaName && t.includes(personaName)) return false;
  if (/^(我|吾辈|本喵|本人|俺|咱)(?!们)/.test(t)) return false;
  if (/(答应|承诺|说好了?要|会提醒|提醒(他|她|你)|我(说过|讲过|会|要|想))/.test(t)) return false;
  return true;
}

/** 用户对 AI 的评价（第 26 批，Tolan 的教训：别反复说它健忘，否则它把「健忘」当自我形象）：不入库 */
export function isMetaComment(text: string): boolean {
  return /(你|AI|助手|机器人|它)(又|总|老是|怎么|真|好)?(忘|记不住|健忘|记性|答非所问|胡说|瞎编|不靠谱|听不懂)/.test(text) || /^用户(觉得|说|认为|抱怨)(AI|助手|它|你)/.test(text);
}

/** 敏感类（健康 / 心理 / 证件账号）：用户没说「记住」就不入长期记忆 */
const SENSITIVE_RE = /抑郁症|焦虑症|躁郁|双相|自杀|自残|精神科|心理医生|心理咨询|HIV|艾滋|性病|怀孕|流产|堕胎|身份证号|银行卡|卡号|密码|账号密码|工资卡|社保号|护照号/;
export const isSensitiveMemory = (text: string): boolean => SENSITIVE_RE.test(text);

/** 去空白与标点后的小写文本（查重用） */
export const normalizeMemoText = (t: string): string => t.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').replace(/^用户/, '');

async function persistMemories(
  result: CompactResult,
  sessionDateKey: string,
  allowProfile = true,
  presetId?: string,
  personaName = '',
  related: RelatedMemo[] = [],
  sessionId?: string,
): Promise<void> {
  // 画像：归档器只回有变化的块 → 合并进现有的（用户手改的版本会在下次 compact 时作为"现有画像"喂回，形成闭环）。
  // 短会话（第 13 轮降门槛后）只收记忆、不让它改画像（allowProfile=false）
  // 第 33 批：设置里「画像自动更新」关着就不动画像；锁住的块不动；改到的块记下「AI · 哪天 · 来自聊天」
  // 第 35 批 f：短会话也能改——但只认归档器标为「关键自我定义」的 identity / preferences / rules；过时的近况（>30 天）它说清掉就清
  if ((result.profile || result.clearRecent) && profileAutoOn()) {
    const st = await getProfileState(presetId);
    let patch: Partial<ProfileBlocks> = { ...(result.profile ?? {}) };
    if (!allowProfile) {
      const keep = result.keyBlocks.filter((k) => PROFILE_KEY_BLOCKS.includes(k) && patch[k]);
      patch = Object.fromEntries(keep.map((k) => [k, patch[k]])) as Partial<ProfileBlocks>;
    }
    if (result.clearRecent && allowProfile && st.blocks.recent && isRecentStale(st.meta)) patch.recent = '';
    patch = withoutLocked(patch, st.locks);
    if (Object.keys(patch).length) await saveProfileBlocks({ ...st.blocks, ...patch }, presetId, { by: 'ai', from: 'chat', day: sessionDateKey }).catch(() => {});
  }
  // 回访约定：会话末补记漏掉的；话头若和约定撞了就不挂（约定那边会问，问两遍就破了「只问一次」）
  await savePromisesFromCompact(result.promises, sessionDateKey, Date.now(), presetId).catch(() => {});
  if (result.followUp && await followUpCoveredByPromise(result.followUp, presetId).catch(() => false)) result.followUp = null;
  // 「你们之间的说法」跟人格走（带口吻，不受隔离开关影响）
  if (result.bits.length && presetId) await saveBits(result.bits, presetId, sessionDateKey).catch(() => {});
  // 「他说话的习惯」（第 36 批）：也跟人格走，最多留 3 条
  if (result.styleNotes?.length && presetId) await saveStyleNotes(result.styleNotes, presetId, sessionDateKey).catch(() => {});

  const owner = memoOwner(presetId);
  // 记在那场对话的日子上（第二天开窗才归档时，以前记成了归档那天）；当天的会话照旧用此刻
  const now = new Date();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sessionDateKey) && sessionDateKey < toLocalDateKey()
    ? new Date(`${sessionDateKey}T21:00:00`)
    : now;
  const refToId = new Map(related.map((r) => [r.ref, r.id]));
  let existing: NavigatorMemo[] = [];
  try { existing = (await db.navigatorMemos.where('status').equals('active').toArray()).filter((m) => m.source !== 'profile' && m.source !== 'bit' && memoVisibleTo(m, presetId)); } catch { /* */ }
  const seen = new Set(existing.map((m) => normalizeMemoText(m.text)));
  let followUp = result.followUp ?? undefined;
  let wrote = 0;
  for (const op of result.memories) {
    if (op.op === 'noop') continue;
    if (wrote >= 3) break; // 一场对话最多写 3 条（含改写 / 替代）
    const text = op.text.trim();
    if (!text) continue;
    if (!isAboutUser(text, personaName) || isMetaComment(text)) { if (import.meta.env.DEV) console.warn('[navigator] 丢掉不是关于用户的记忆', text); continue; }
    if (isSensitiveMemory(text)) { if (import.meta.env.DEV) console.warn('[navigator] 敏感内容不入长期记忆', text); continue; }
    const refId = op.ref ? refToId.get(op.ref) : undefined;
    const old = refId ? existing.find((m) => m.id === refId) : undefined;
    if (op.op === 'update' && old) {
      await db.navigatorMemos.update(old.id, {
        text, importance: Math.max(old.importance, op.importance), colorHint: op.colorHint ?? old.colorHint,
        cues: [...new Set([...(old.cues ?? []), ...(op.cues ?? [])])].slice(0, 8), ...(followUp ? { followUp } : {}),
      });
      followUp = undefined;
      seen.add(normalizeMemoText(text));
      wrote++;
      continue;
    }
    const norm = normalizeMemoText(text);
    if (seen.has(norm) && !(op.op === 'supersede' && old)) continue; // 一字不差的已经有了
    const id = uuidv4();
    const memo: NavigatorMemo = {
      id, source: 'chat', text, colorHint: op.colorHint, importance: op.importance, cues: op.cues,
      followUp: followUp, status: 'active', createdAt: day,
      ...(owner ? { presetId: owner } : {}), ...(sessionId ? { fromSessionId: sessionId } : {}),
    };
    followUp = undefined;
    await db.navigatorMemos.put(memo);
    seen.add(norm);
    wrote++;
    if (op.op === 'supersede' && old) {
      // 旧说法作废；一字不差的同文（重复条）一起作废，别留一条继续当真
      const oldKey = normalizeMemoText(old.text);
      for (const m of existing) {
        if (m.id === old.id || normalizeMemoText(m.text) === oldKey) await db.navigatorMemos.update(m.id, { status: 'archived', invalidAt: now, supersededBy: id, followUp: undefined });
      }
    }
  }
  // 没有记忆但有话头 → 建一条 importance 3 的载体
  if (wrote === 0 && followUp) {
    await db.navigatorMemos.put({
      id: uuidv4(), source: 'chat', text: followUp, importance: 3,
      followUp, status: 'active', createdAt: day,
      ...(owner ? { presetId: owner } : {}),
    });
  }
}

// ── 主泵：会话末 compact（开窗时惰性触发） ──

/** 最近一次（今天之前）聊天的摘要和那天的日子：问候里按真实日子标注（不再一律写「昨日」） */
export interface LastChatSummary {
  summary: string;
  dateKey: string;
}

/** 主泵单飞：开窗、设置页「立即归档」、StrictMode 双跑同时触发时只跑一份（第 4 轮：以前会重复入库同一批记忆） */
let finalizing: Promise<LastChatSummary | null> | null = null;

/**
 * 归档「今天之前、尚无摘要」的会话（最多 3 条，防积压风暴）。
 * 返回最近一次（今天之前）会话的中性摘要和日子，供跨日叙事问候即取即用。
 */
/**
 * @param activePresetId 当前人格：返回的「上次聊天摘要」只取**这个人格自己**的会话（第 23 批 · 串戏排查 ①）。
 *   以前不分人格取最近一条：昨天和 A 聊、今天切到 B，B 的开场会接着 A 的话茬、摘要里还带 A 的名字。
 *   归档本身仍是所有人格的隔天会话一起整理。
 */
export function finalizeStaleSessions(activePresetId?: string): Promise<LastChatSummary | null> {
  if (finalizing) return finalizing;
  finalizing = finalizeStaleSessionsInner(activePresetId).finally(() => { finalizing = null; });
  return finalizing;
}

/** 会话所属人格的名字（compact 提示词里的「陪伴 AI 的名字」；以前写死成黑猫） */
async function personaNameOf(presetId: string | undefined, custom: NavigatorPreset[]): Promise<string> {
  return resolveNavigatorPreset(presetId, custom).name;
}

async function finalizeStaleSessionsInner(activePresetId?: string): Promise<LastChatSummary | null> {
  const today = toLocalDateKey();
  let last: LastChatSummary | null = null;
  // 「上次聊天」只认当前人格的会话；老数据没有 presetId 的按黑猫算（当年只有黑猫）
  const mine = (s: { presetId?: string }): boolean => !activePresetId || (s.presetId ?? BUILTIN_NAVIGATOR_PRESETS[0].id) === activePresetId;
  try {
    const stale = (await db.navigatorSessions.toArray())
      .filter((s) => s.dateKey < today)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    const targets = stale.filter((s) => !s.compactedSummary).slice(0, 3);
    // 已归档过的最近一条（当前人格的）直接可用
    const done = stale.find((s) => s.compactedSummary && mine(s));
    last = done ? { summary: done.compactedSummary!, dateKey: done.dateKey } : null;

    const cfg = getAIConfig(useAppStore.getState().settings);
    let custom: NavigatorPreset[] = [];
    try { custom = await db.navigatorPresets.toArray(); } catch { /* 按内置解析 */ }
    for (const session of targets) {
      const rows = await db.navigatorMessages.where('sessionId').equals(session.id).sortBy('createdAt');
      const userMsgs = rows.filter((r) => r.role === 'user');
      const userChars = userMsgs.reduce((n, r) => n + (r.text?.length ?? 0), 0);
      let summary: string;
      let personaSummary: string | undefined;
      if (cfg && (userMsgs.length >= FINALIZE_MIN_USER_MSGS || userChars >= FINALIZE_MIN_USER_CHARS)) {
        const sessionPreset = session.presetId ?? BUILTIN_NAVIGATOR_PRESETS[0].id;
        const personaName = await personaNameOf(session.presetId, custom);
        const lines = rowsToLines(rows).slice(-80);
        const related = await relatedMemosFor(lines, sessionPreset);
        const allowProfile = userMsgs.length >= PROFILE_MIN_USER_MSGS || userChars >= PROFILE_MIN_USER_CHARS;
        const profileState = await getProfileState(sessionPreset);
        const result = await compactViaAI(cfg, lines, personaName, profileState.blocks, session.dateKey, related, { meta: profileState.meta, short: !allowProfile });
        if (result) {
          summary = result.summary;
          personaSummary = result.personaSummary;
          await persistMemories(result, session.dateKey, allowProfile, sessionPreset, personaName, related, session.id);
        } else {
          summary = localSummary(rows);
        }
      } else {
        summary = localSummary(rows);
      }
      await db.navigatorSessions.update(session.id, {
        compactedSummary: summary,
        personaSummary,
        updatedAt: new Date(),
      });
      // 最近的一条 stale（当前人格的）就是跨日叙事素材（带着它自己的日子）
      if (mine(session) && (!last || session.dateKey > last.dateKey)) last = { summary, dateKey: session.dateKey };
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[navigator] 会话末 compact 失败', e);
  }
  return last;
}

/** 无 Key / 不足门槛的本地拼接摘要 */
function localSummary(rows: NavigatorMessageRow[]): string {
  const users = rows.filter((r) => r.role === 'user' && r.text);
  const first = users[0]?.text?.slice(0, 30) ?? '';
  return users.length
    ? `简短聊了 ${users.length} 句${first ? `（开头是「${first}…」）` : ''}。`
    : '打了个照面，没聊什么。';
}

// ── 「今天早些时候」（第 24 批 · A1）：掉出对话窗的早些轮次，压成一段滚动更新的中性摘要 ──

const EARLY_PROTOCOL = `你是对话摘要员。把「今天早些时候」的一段对话压成中性第三人称摘要（≤150 字）：保留具体事实、决定、数字和日子；不写口吻、不评价、不写建议。
给了【已有摘要】就把新内容并进去，输出更新后的全文（仍 ≤150 字，旧内容可以压得更短）。只输出摘要本身，不要标题、不要引号。`;

/** 有 Key 走 AI（快速档、瞬发）；没 Key / 失败返回 null，调用方用 localEarlySummary */
export async function summarizeEarlyToday(prev: string, lines: string[], dateKey: string): Promise<string | null> {
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (!cfg || !lines.length) return null;
  try {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: EARLY_PROTOCOL },
      { role: 'user', content: `这段对话发生在 ${dayLabelCN(dateKey)}。\n【已有摘要】${prev || '（无）'}\n【新掉出窗口的对话】\n${lines.join('\n')}` },
    ], { temperature: 0.2, maxTokens: 400, instant: true, purpose: 'early-summary' });
    const t = raw.replace(/```[a-z]*/gi, '').trim().replace(/^["“「]|["”」]$/g, '').slice(0, 240);
    return t || null;
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[navigator] 早些时候摘要失败', e);
    return null;
  }
}

/** 没 Key / 失败时的本地拼接：只说又聊了几句、说到什么 */
export function localEarlySummary(prev: string, rows: NavigatorMessageRow[]): string {
  const users = rows.filter((r) => r.role === 'user' && r.text);
  const first = users[0]?.text?.slice(0, 24) ?? '';
  const piece = users.length ? `又聊了 ${users.length} 句${first ? `（说到「${first}…」）` : ''}` : '';
  return [prev, piece].filter(Boolean).join('；').slice(0, 300);
}

// ── 最近几次聊天（第 24 批 · A2）：当前人格今天之前、已归档的几场摘要，一天不变 → 接在人格规范后面吃前缀缓存 ──

export async function recentChatsBlock(presetId: string, todayKey: string, limit = 3): Promise<string> {
  try {
    const cat = BUILTIN_NAVIGATOR_PRESETS[0].id;
    const rows = (await db.navigatorSessions.toArray())
      .filter((s) => s.dateKey < todayKey && (s.presetId ?? cat) === presetId && !!s.compactedSummary)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, limit);
    if (!rows.length) return '';
    return `【最近几次聊天（新的在上；是你知道的背景，不是要汇报的清单）】\n${rows
      .map((s) => `- ${dayLabelCN(s.dateKey, todayKey)}，${relativeDayCN(s.dateKey, todayKey)}：${s.compactedSummary}`)
      .join('\n')}`;
  } catch {
    return '';
  }
}

// ── 阈值泵：活跃会话内 compact ──

export interface LiveCompactOutcome {
  /** 压缩后的新消息数组（含 summary 占位）；null = 未触发 */
  summaryText: string | null;
  removedIds: string[];
}

/** 阈值泵按会话加锁：一次 AI 摘要要十几秒，期间再来一轮对话不能再开一份（否则同一批消息压两次、记忆入库两次） */
const liveCompacting = new Set<string>();

/**
 * 检查并压缩活跃会话（fire-and-forget 由 store 调用后自行更新内存流）。
 * 有 Key 走 AI 摘要，无 Key/失败走本地拼接；90k 硬截断永不等 AI。
 */
export async function maybeCompactLive(
  sessionId: string,
  rows: NavigatorMessageRow[],
  personaName = '陪伴 AI',
  presetId?: string,
): Promise<LiveCompactOutcome> {
  const total = rows.reduce((n, r) => n + estTokens(r.text ?? '') + 8, 0);
  const over = total > LIVE_COMPACT_TOKENS || rows.length > LIVE_COMPACT_MSGS;
  if (!over) return { summaryText: null, removedIds: [] };
  if (liveCompacting.has(sessionId)) return { summaryText: null, removedIds: [] };

  const squash = rows.slice(0, rows.length - LIVE_KEEP_RECENT);
  if (squash.length === 0) return { summaryText: null, removedIds: [] };

  liveCompacting.add(sessionId);
  try {
    return await compactLiveInner(sessionId, rows, squash, total, personaName, presetId);
  } finally {
    liveCompacting.delete(sessionId);
  }
}

async function compactLiveInner(
  sessionId: string,
  rows: NavigatorMessageRow[],
  squash: NavigatorMessageRow[],
  total: number,
  personaName: string,  presetId?: string,
): Promise<LiveCompactOutcome> {
  void rows;
  let summaryText: string;
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (cfg && total <= HARD_CAP_TOKENS) {
    const lines = rowsToLines(squash).slice(-100);
    const related = await relatedMemosFor(lines, presetId);
    const profileState = await getProfileState(presetId);
    const result = await compactViaAI(cfg, lines, personaName, profileState.blocks, toLocalDateKey(), related, { meta: profileState.meta });
    if (result) {
      await persistMemories(result, toLocalDateKey(), true, presetId, personaName, related, sessionId);
      summaryText = result.summary;
    } else {
      summaryText = localSummary(squash);
    }
  } else {
    // 无 Key 或超保险丝：本地硬截断（绝不等 AI）
    summaryText = localSummary(squash);
  }

  const summaryRow: NavigatorMessageRow = {
    id: uuidv4(),
    sessionId,
    role: 'summary',
    text: summaryText,
    createdAt: (squash[squash.length - 1]?.createdAt ?? Date.now()) ,
  };
  await db.navigatorMessages.bulkDelete(squash.map((r) => r.id));
  await db.navigatorMessages.put(summaryRow);
  await db.navigatorSessions.update(sessionId, { updatedAt: new Date() });
  return { summaryText, removedIds: squash.map((r) => r.id) };
}

// ── 检索与注入（§2.4；第 26 批 · B2 改造：词 + 二元组 + 字级兜底的相关度、近因按上次想起、强度随召回累积、分段预算、去重） ──

export interface RecallResult {
  /** 注入动态块的记忆行（含 colorHint 与话头提示） */
  lines: string[];
  /** 注入的记忆 id（挂到回复第一泡上：「想起了两件事」） */
  ids: string[];
}

/** 两段相关度：查询词 / 二元组命中按 idf 近似加权（记忆少，用简单的 log(N/n)），再加字级兜底 */
function relevance(q: Set<string>, qc: Set<string>, memo: NavigatorMemo, df: Map<string, number>, N: number): number {
  const toks = new Set([...tokenize(memo.text), ...(memo.cues ?? []).flatMap((c) => [c, ...tokenize(c)])]);
  let score = 0;
  toks.forEach((t) => {
    if (!q.has(t)) return;
    const n = df.get(t) ?? 1;
    // 平滑的 idf：记忆库很小时（N=1、2）经典公式会塌到 0.3 以下，一个词都对上了却过不了相关门槛
    score += Math.log(1 + (N + 1) / (n + 0.5));
  });
  const chars = new Set(queryChars(memo.text + (memo.cues ?? []).join('')));
  let charHits = 0;
  chars.forEach((c) => { if (qc.has(c)) charHits++; });
  score += Math.min(1.0, charHits * 0.35);
  return score;
}

/**
 * 评分检索：置顶（≤2）常驻 → 近 7 天（≤2）保底 → 相关（≤3）；总数 ≤6，去重；followUp **注入即清**（宁可少提醒不重复）。
 * 纯本地零 AI；异常返回空（记忆失效不阻断对话）。prevUser = 之前几句用户的话（新的在后），权重减半。
 */
export async function recallMemories(queryText: string, presetId?: string, prevUser: string[] = []): Promise<RecallResult> {
  try {
    const all = (await db.navigatorMemos.where('status').equals('active').toArray())
      .filter((m) => m.source !== 'profile' && m.source !== 'bit' && !m.muted) // 画像另行常驻注入，说法另有一块，别再提的不进
      .filter((m) => memoVisibleTo(m, presetId)); // 记忆隔离（第 23 批）：只读共享的和自己的
    // 回访约定由 navigatorPromise 单独注入（什么时候问、只问一次）：还在等着的不进普通检索
    const promises = all.filter(isPromise);
    const memos = all.filter((m) => !isPromise(m) || (m.promiseState ?? 'waiting') !== 'waiting');
    if (memos.length === 0) return { lines: [], ids: [] };
    const q = new Set(tokenize(queryText));
    const qc = new Set(queryChars(queryText));
    const qPrev = new Set(prevUser.slice(-2).flatMap((t) => tokenize(t)));
    const df = new Map<string, number>();
    for (const m of memos) for (const t of new Set([...tokenize(m.text), ...(m.cues ?? [])])) df.set(t, (df.get(t) ?? 0) + 1);
    const N = memos.length;
    const now = Date.now();
    const scored = memos.map((m) => {
      const rel = relevance(q, qc, m, df, N) + 0.5 * relevance(qPrev, new Set<string>(), m, df, N);
      const seenAt = new Date(m.lastRecalledAt ?? m.createdAt).getTime();
      const ageDays = (now - seenAt) / 86400_000;
      const score =
        rel * 1.6 +
        m.importance * 0.5 +
        Math.exp(-ageDays / 14) * 1.2 +                       // 近因按「上次想起」算（Generative Agents）
        Math.min(0.6, (m.recallCount ?? 0) * 0.1) +            // 被想起一次就加强一点（MemoryBank）
        (m.followUp ? 1.5 : 0) +
        (m.pinned ? 2 : 0);
      // 刚提过（30 分钟内）又不特别相关的，这轮歇一歇，别每轮都是同一条
      const cooling = m.lastRecalledAt && now - new Date(m.lastRecalledAt).getTime() < 30 * 60_000 && rel < 1.0 && !m.pinned;
      return { m, score: cooling ? score - 2.5 : score, rel };
    });
    const picked: typeof scored = [];
    const seenText = new Set<string>();
    const take = (list: typeof scored, max: number) => {
      for (const x of list) {
        if (picked.length >= 6 || max <= 0) return;
        const key = normalizeMemoText(x.m.text);
        if (seenText.has(key) || picked.includes(x)) continue;
        seenText.add(key); picked.push(x); max--;
      }
    };
    // 分段预算：常驻 + 相关 ≤4（置顶的、或 rel ≥ 0.8 的，按分数；和这句话不沾边的置顶最多占 2 个位）→ 近 7 天保底 ≤2（按重要度；同一条 6 小时内不重复硬塞）
    // 没有查询（问候）时按分数取：开场带几条最要紧的，和聊到什么无关
    const noQuery = !queryText.trim();
    let pinnedIdle = 0;
    const head = scored
      .filter((x) => x.m.pinned || x.rel >= 0.8 || (noQuery && x.score > 0.8))
      .sort((a, b) => b.score - a.score)
      .filter((x) => { if (x.m.pinned && x.rel < 0.8) { if (pinnedIdle >= 2) return false; pinnedIdle++; } return true; });
    take(head, 4);
    const recent = scored
      .filter((x) => !x.m.pinned && (x.m.recallCount ?? 0) < 4 && now - new Date(x.m.createdAt).getTime() <= 7 * 86400_000
        && (!x.m.lastRecalledAt || now - new Date(x.m.lastRecalledAt).getTime() >= RECENT_MEMO_COOLDOWN_MS))
      .sort((a, b) => b.m.importance - a.m.importance || new Date(b.m.createdAt).getTime() - new Date(a.m.createdAt).getTime());
    const recentIds = new Set(recent.map((x) => x.m.id));
    take(recent, 2);
    const lines: string[] = [];
    const ids: string[] = [];
    for (const { m, rel } of picked) {
      // 带上哪天记下的（第二批 · 时间准确性）：「明天」类的说法即便漏网，模型也能对上日子
      const day = shortMD(keyOfDate(new Date(m.createdAt)));
      // 跟回访约定是同一件事的：注明结果另有人问 / 已经聊过（「只问一次」——别让模型从普通记忆里再翻出来问）
      const related = promises.find((p) => p.id === m.id || mentionsTopic(m.text, p.promiseTopic));
      const phase = related ? promisePhase(related) : null;
      const promiseNote = !related ? ''
        : related.promiseState === 'expired' || phase === 'late' ? '（这件事已经过去了，别再问结果）'
          : phase === 'closed' ? '（这件事的结果已经聊过了，别再问）'
            : phase === 'due' ? '（结果会另外问，这里别问）'
              : '（还没到日子，别追问结果）';
      lines.push(`- （${day} 记）${m.text}${m.colorHint ? `（${m.colorHint}）` : ''}${promiseNote}${m.followUp && !related ? `【可自然追问：${m.followUp}】` : ''}`);
      ids.push(m.id);
      // 保底注入**不计 recall 次数**（不拖低它以后的评分），只记 lastRecalledAt；按相关度 / 置顶进来的记一次
      const patch: Partial<NavigatorMemo> = recentIds.has(m.id) && rel < 0.8
        ? { lastRecalledAt: new Date() }
        : { lastRecalledAt: new Date(), recallCount: (m.recallCount ?? 0) + 1 };
      if (m.followUp) patch.followUp = undefined; // 一次性
      void db.navigatorMemos.update(m.id, patch).catch(() => {});
    }
    return { lines, ids };
  } catch {
    return { lines: [], ids: [] };
  }
}

// ── 「你们之间的说法」（第 26 批 · §24.11）：黑话 / 梗 / 昵称 / 代号，跟人格走，不是事实 ──

export async function saveBits(bits: CompactBit[], presetId: string, dateKey: string): Promise<number> {
  const existing = await listBits(presetId, true);
  const seen = new Set(existing.map((b) => normalizeMemoText(b.text)));
  let n = 0;
  for (const b of bits) {
    const key = normalizeMemoText(b.phrase);
    if (!key || seen.has(key)) continue;
    const created = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey < toLocalDateKey() ? new Date(`${dateKey}T21:00:00`) : new Date();
    await db.navigatorMemos.put({
      id: uuidv4(), source: 'bit', text: b.phrase, bitMeaning: b.meaning, bitOrigin: b.origin, importance: 3,
      status: 'active', createdAt: created, presetId, usedCount: 0,
    });
    seen.add(key);
    n++;
  }
  return n;
}

export type BitKind = NonNullable<NavigatorMemo['bitKind']>;
/** 这个人格的说法（只看它自己的；includeArchived 给整理 / 记事本用；kind 缺省只取说法，style = 他说话的习惯，all = 都要） */
export async function listBits(presetId: string, includeArchived = false, kind: BitKind | 'all' = 'phrase'): Promise<NavigatorMemo[]> {
  try {
    return (await db.navigatorMemos.where('source').equals('bit').toArray())
      .filter((m) => m.presetId === presetId && (includeArchived || m.status === 'active') && (kind === 'all' || (m.bitKind ?? 'phrase') === kind))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch { return []; }
}

const STYLE_NOTES_MAX = 3;
/** 「他说话的习惯」（第 36 批）：存成 bit 的 style 一类，同文不重复，超过 3 条把最老的归档 */
export async function saveStyleNotes(notes: string[], presetId: string, dateKey: string): Promise<number> {
  const existing = await listBits(presetId, true, 'style');
  const seen = new Set(existing.map((b) => normalizeMemoText(b.text)));
  let n = 0;
  for (const note of notes) {
    const key = normalizeMemoText(note);
    if (!key || seen.has(key)) continue;
    const created = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey < toLocalDateKey() ? new Date(`${dateKey}T21:00:00`) : new Date();
    await db.navigatorMemos.put({ id: uuidv4(), source: 'bit', bitKind: 'style', text: note, importance: 2, status: 'active', createdAt: created, presetId, usedCount: 0 });
    seen.add(key);
    n++;
  }
  if (n) {
    const active = (await listBits(presetId, false, 'style')).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    for (const old of active.slice(STYLE_NOTES_MAX)) await db.navigatorMemos.update(old.id, { status: 'archived', invalidAt: new Date() });
  }
  return n;
}

/** 注入行：他说话的习惯（跟着节奏，别模仿得刻意） */
export async function styleLine(presetId: string): Promise<string> {
  const notes = await listBits(presetId, false, 'style');
  if (!notes.length) return '';
  return `【他说话的习惯】${notes.map((b) => b.text).join('；')}（可以轻轻跟着他的节奏，别模仿得刻意、别点破）`;
}

/** 注入块：≤3 条，轮换（久没用的先），带用法规则 */
export async function bitsBlock(presetId: string, rand: () => number = Math.random): Promise<{ block: string; bits: NavigatorMemo[] }> {
  const all = await listBits(presetId);
  if (!all.length) return { block: await styleLine(presetId), bits: [] };
  const ranked = [...all].sort((a, b) => {
    const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return ta - tb || rand() - 0.5;
  }).slice(0, 3);
  const lines = ranked.map((b) => `- 「${b.text}」${b.bitMeaning ? ` = ${b.bitMeaning}` : ''}${b.bitOrigin ? `（${b.bitOrigin}）` : ''}`);
  const style = await styleLine(presetId);
  return {
    bits: ranked,
    block: [`【你们之间的说法（可以自然地用；不解释来历；对方用了你就接；别每轮都用，一轮最多一个）】\n${lines.join('\n')}`, style].filter(Boolean).join('\n'),
  };
}

/** 回复 / 用户的话里用到了哪条说法：复用计数 +1、记上次用到（久不用的会淡出） */
export async function noteBitsUsed(text: string, bits: NavigatorMemo[]): Promise<void> {
  if (!text.trim()) return;
  for (const b of bits) {
    if (b.text.length >= 2 && text.includes(b.text)) {
      await db.navigatorMemos.update(b.id, { usedCount: (b.usedCount ?? 0) + 1, lastUsedAt: new Date() }).catch(() => {});
    }
  }
}

// ── 存量整理（第 26 批 · B1）：一字不差的本地合并；近似的记事本「整理」按钮提议、用户确认 ──

const bigramSet = (t: string): Set<string> => { const n = normalizeMemoText(t); const out = new Set<string>(); for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2)); return out; };
const jaccard = (a: Set<string>, b: Set<string>): number => { if (!a.size || !b.size) return 0; let inter = 0; a.forEach((x) => { if (b.has(x)) inter++; }); return inter / (a.size + b.size - inter); };

export interface MergeProposal { keep: NavigatorMemo; drop: NavigatorMemo; similarity: number }

/** 近似重复（二元组 Jaccard ≥ threshold，或一条包含另一条）：留早的那条（信息多的话留长的） */
export async function findDuplicateMemos(presetId?: string, threshold = 0.6): Promise<MergeProposal[]> {
  const memos = (await db.navigatorMemos.where('status').equals('active').toArray())
    .filter((m) => m.source !== 'profile' && m.source !== 'bit' && !isPromise(m) && (presetId === undefined || memoVisibleTo(m, presetId)))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const out: MergeProposal[] = [];
  const used = new Set<string>();
  for (let i = 0; i < memos.length; i++) {
    for (let j = i + 1; j < memos.length; j++) {
      const a = memos[i], b = memos[j];
      if (used.has(a.id) || used.has(b.id)) continue;
      if (ownersKey(a) !== ownersKey(b)) continue;
      const na = normalizeMemoText(a.text), nb = normalizeMemoText(b.text);
      const contains = na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na));
      const sim = contains ? 1 : jaccard(bigramSet(a.text), bigramSet(b.text));
      if (sim < threshold) continue;
      const [keep, drop] = a.text.length >= b.text.length ? [a, b] : [b, a];
      out.push({ keep, drop, similarity: sim });
      used.add(a.id); used.add(b.id);
    }
  }
  return out;
}

/** 合并：被合掉的那条作废（指向留下的那条）；留下的吸收重要度 / 线索 / 置顶 */
export async function mergeMemos(keepId: string, dropId: string): Promise<void> {
  const [keep, drop] = await Promise.all([db.navigatorMemos.get(keepId), db.navigatorMemos.get(dropId)]);
  if (!keep || !drop) return;
  await db.navigatorMemos.update(keep.id, {
    importance: Math.max(keep.importance, drop.importance), pinned: keep.pinned || drop.pinned,
    cues: [...new Set([...(keep.cues ?? []), ...(drop.cues ?? [])])].slice(0, 8),
    recallCount: (keep.recallCount ?? 0) + (drop.recallCount ?? 0),
    followUp: keep.followUp ?? drop.followUp,
  });
  await db.navigatorMemos.update(drop.id, { status: 'archived', invalidAt: new Date(), supersededBy: keep.id, followUp: undefined });
}

/**
 * 惰性遗忘（§2.5）：低价值久未召回 → archived（置顶免疫；不删除）。
 * 第 26 批加：一字不差的重复本地合并；说法（bit）没人用过 60 天 / 120 天没再用 → 淡出。
 */
export async function lazySweepMemos(): Promise<void> {
  try {
    const cutoff = Date.now() - 90 * 86400_000;
    const memos = await db.navigatorMemos.where('status').equals('active').toArray();
    const stale = memos.filter((m) =>
      m.source !== 'bit' && m.source !== 'profile' &&
      !m.pinned &&
      m.importance <= 2 &&
      new Date(m.lastRecalledAt ?? m.createdAt).getTime() < cutoff,
    );
    for (const m of stale) void db.navigatorMemos.update(m.id, { status: 'archived' });
    // 一字不差的重复：留最早那条
    const byKey = new Map<string, NavigatorMemo[]>();
    for (const m of memos) {
      if (m.source === 'profile' || m.source === 'bit' || isPromise(m)) continue;
      const k = `${ownersKey(m)}|${normalizeMemoText(m.text)}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(m);
    }
    for (const group of byKey.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const dup of group.slice(1)) await mergeMemos(group[0].id, dup.id);
    }
    const now = Date.now();
    for (const b of memos.filter((m) => m.source === 'bit')) {
      const age = now - new Date(b.createdAt).getTime();
      const idle = now - new Date(b.lastUsedAt ?? b.createdAt).getTime();
      if (((b.usedCount ?? 0) === 0 && age > 60 * 86400_000) || idle > 120 * 86400_000) void db.navigatorMemos.update(b.id, { status: 'archived', invalidAt: new Date(now) });
    }
  } catch { /* 静默 */ }
}

// ── warmth 状态浮动（§4，零持久化纯计算） ──

export function buildWarmthLine(): string {
  const s = useAppStore.getState();
  const today = toLocalDateKey();
  const dayMs = 86400_000;
  // 近 3 日记录活跃度
  const recent = s.activities.filter((a) => Date.now() - new Date(a.date).getTime() < 3 * dayMs).length;
  // 连续记录天数（从今天往回数）
  const dates = new Set(s.activities.map((a) => toLocalDateKey(new Date(a.date))));
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = toLocalDateKey(new Date(Date.now() - i * dayMs));
    if (dates.has(d)) streak++;
    else if (i > 0) break;
    else if (!dates.has(today)) break;
    if (i > 60) break;
  }
  const hour = new Date().getHours();
  let warmth = 0.5 + Math.min(0.3, streak * 0.05) + Math.min(0.2, recent * 0.03);
  if (hour >= 23 || hour < 5) warmth -= 0.15;
  if (recent === 0) warmth -= 0.25;

  if (warmth >= 0.8) return '【当前语气】关系热络：语气松弛，可以调侃、可以连发短句。';
  if (warmth >= 0.5) return '【当前语气】日常：自然放松，正常发挥。';
  return '【当前语气】对方最近状态低落或久未记录：少说、多听、别催，收着说（1~2 段）。';
}
