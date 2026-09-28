import { db } from '@/db';
import { pb, getUserId } from './pocketbase';
import { useCloudStore } from '@/store/cloud';
import { useAppStore, toLocalDateKey } from '@/store';
import { computeTotalLv } from '@/utils/lvTiers';
import { normalizeAttributeLevelTitles } from '@/utils/attributeLevelTitles';
import { resolveLevelDifficulty } from '@/utils/levelDifficulty';
import { buildPresencePatch } from '@/utils/profilePresence';
import { mergeTable, type MergeOptions, type TableMergeStats } from './syncMerge';

/**
 * 哪些表受"同伴"分组开关（syncConfidantsToCloud）管辖——
 * 归档库 counselArchives 的摘要属于"同伴"板块的延伸，一起管。
 * 注意：聊天原文 counselSessions 永远不进入云同步（1 小时后本地也会被销毁）。
 */
const CONFIDANT_TABLES = new Set<string>(['confidants', 'confidantEvents', 'counselArchives']);

/** 核心表，始终同步（即便用户把它们加进黑名单也会被忽略） */
const PROTECTED_TABLES = new Set<string>(['users', 'attributes', 'settings']);

/** 简短哈希，用于判断本地头像 dataUrl 是否变动过 */
function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36) + '_' + s.length.toString(36);
}

/** dataUrl → Blob，便于通过 FormData 走文件字段上传 */
function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [meta, b64] = dataUrl.split(',');
    if (!b64) return null;
    const mime = /:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/**
 * 头像同步：把本地 user.avatarDataUrl 推到 PB users.avatar 文件字段，
 * 通过指纹比对避免重复上传几百 KB 的 base64。
 *
 * dataUrl 已经在 ImageCropDialog 里被压到 ≤80KB（远小于 PB 默认 400KB 限制），
 * 所以直接转 Blob 上传即可，不再做二次压缩。
 *
 * 三种状态：
 *   1. 本地有 dataUrl，指纹与上次不同 → FormData 上传 + 更新指纹
 *   2. 本地没 dataUrl，但指纹非空（说明云端有过） → 清空 PB.avatar + 重置指纹为空
 *   3. 都没动 → 无操作
 */
async function syncAvatarIfChanged(userId: string): Promise<void> {
  if (!pb) return;
  const appState = useAppStore.getState();
  const localDataUrl = appState.user?.avatarDataUrl;
  const lastSig = appState.settings.lastUploadedAvatarSig ?? '';
  const currentSig = localDataUrl ? fingerprint(localDataUrl) : '';

  if (currentSig === lastSig) return;

  if (localDataUrl) {
    const blob = dataUrlToBlob(localDataUrl);
    if (!blob) {
      console.warn('[velvet-sync] avatar: dataUrl 解码失败，跳过上传');
      return;
    }
    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const formData = new FormData();
    formData.append('avatar', blob, `avatar.${ext}`);
    try {
      const updated = await pb.collection('users').update(userId, formData);
      pb.authStore.save(pb.authStore.token, updated);
    } catch (err) {
      console.warn('[velvet-sync] avatar upload rejected by PB (size=' + blob.size + 'B)', err);
      return; // 不更新指纹，下次还能重试
    }
  } else {
    // 清空云端头像
    try {
      const updated = await pb.collection('users').update(userId, { avatar: null });
      pb.authStore.save(pb.authStore.token, updated);
    } catch (err) {
      console.warn('[velvet-sync] avatar clear failed', err);
      return;
    }
  }

  // 落本地指纹（同步会把 settings 推到云端，无需手动 push）
  await appState.updateSettings({ lastUploadedAvatarSig: currentSig });
}

/**
 * 轻量推送：只更新 PB users 表的"公开档案"字段（含头像），不动 user_data 大块同步。
 * 适合用户改了昵称 / 头像这类只影响档案展示的小动作 —— 不要为这点事跑全量。
 */
/**
 * 名片状态 / 目标（v2.7.0.6 第 6 项）：只推 users 表的 status / goal 两个字段。
 * 单发：PB 上没建字段就静默跳过，不连累其它档案；目标算不出来（挂的宣告卡不在本机）就不动云端那份。
 * 资料页改完立刻调一次，pushUserProfile / pushAll 也都会顺手推。
 */
export const pushProfilePresence = async (): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;
  const userId = getUserId();
  if (!userId) return;
  const patch = buildPresencePatch(useAppStore.getState());
  try {
    await pb.collection('users').update(userId, patch);
  } catch { /* 字段还没建 / 离线：下次再推 */ }
};

export const pushUserProfile = async (): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;
  const userId = getUserId();
  if (!userId) return;

  const appState = useAppStore.getState();
  const totalLv = computeTotalLv(appState.attributes);
  const localUserName = appState.user?.name?.trim();
  const attrLevels: Record<string, number> = {};
  const attrPoints: Record<string, number> = {};
  let totalPoints = 0;
  for (const a of appState.attributes) {
    attrLevels[a.id] = a.level;
    attrPoints[a.id] = a.points;
    totalPoints += a.points ?? 0;
  }
  // 已解锁数量：不计入 blessing_* 这类手动开关型赐福
  const unlockedCount =
    appState.achievements.filter(a => a.unlocked).length +
    appState.skills.filter(s => s.unlocked && !s.id.startsWith('blessing_')).length;
  const profilePatch: Record<string, unknown> = {
    total_lv: totalLv,
    attribute_names: appState.settings.attributeNames,
    attribute_levels: attrLevels,
    attribute_level_titles: normalizeAttributeLevelTitles(
      appState.settings.attributeLevelTitles,
      appState.settings.levelThresholds?.length || 5,
    ),
    attribute_points: attrPoints,
    total_points: totalPoints,
    unlocked_count: unlockedCount,
  };
  if (localUserName) profilePatch.nickname = localUserName;

  try {
    const updated = await pb.collection('users').update(userId, profilePatch);
    pb.authStore.save(pb.authStore.token, updated);
  } catch (err) {
    console.warn('[velvet-sync] pushUserProfile failed', err);
  }
  // 难度档单发（PB 可能还没这个字段；混进上面会连累整份档案，见 pushAll 里的同款注释）
  try {
    await pb.collection('users').update(userId, {
      level_difficulty: resolveLevelDifficulty(appState.settings),
    });
  } catch { /* 字段还没建，跳过 */ }
  // 名片状态 / 目标（v2.7.0.6 第 6 项）：同样单发
  await pushProfilePresence();
  // 头像走单独的指纹比对路径
  try {
    await syncAvatarIfChanged(userId);
  } catch (err) {
    console.warn('[velvet-sync] pushUserProfile: avatar sync failed', err);
  }
};

/** 解析当前的同步豁免集合（哪些表在本次 push/pull 中应被跳过） */
function getSkipSet(): Set<string> {
  const s = useAppStore.getState().settings;
  const skip = new Set<string>();
  // 先应用用户自定义的黑名单（过滤掉受保护的核心表）
  if (Array.isArray(s.syncExcludedTables)) {
    for (const t of s.syncExcludedTables) {
      if (!PROTECTED_TABLES.has(t)) skip.add(t);
    }
  }
  // 再应用旧的"同伴开关"（仅为兼容：如果显式关闭则把两张同伴表加入）
  if (s.syncConfidantsToCloud === false) {
    for (const t of CONFIDANT_TABLES) skip.add(t);
  }
  // F3 愿望清单 opt-in：默认跳过（只存本地），仅当用户显式开启才上云
  if (s.syncWishesToCloud !== true) {
    skip.add('wishes');
  }
  // 黑猫人格与记忆 opt-in：同上口径（记忆含生活细节，默认不出本机）
  if (s.syncNavigatorToCloud !== true) {
    skip.add('navigatorPresets');
    skip.add('navigatorMemos');
  }
  return skip;
}

/**
 * 需要同步到云端的 Dexie 表列表。
 * 每张表作为 user_data 表里的一条 KV 记录存储（key = 表名，value = 序列化后的行数组）。
 *
 * ── 字段账本（FS1 审计 2026-08-01）────────────────────────────────────────
 * 表是同步的最小单位：**只要表在本列表内，行上的所有字段（含后加的）自动上云**，
 * 除非在 push 的 per-key 豁免段里显式剔除。新增功能时只需回答一个问题：
 * "它的数据落在哪张表？那张表在不在这里？"
 *
 * 逐表归属（含 2026-06 以来新增字段的落点）：
 *   users/attributes/settings ····· 受保护，恒同步。新增 settings 字段一律随行上云，
 *                                   例外见下方 push 段（backgroundImage/Orientation 恒豁免、
 *                                   API Key 按 syncCloudApiKey 开关，**默认关**）。
 *                                   新字段：fateDrawState / tasksMergeMigratedAt /
 *                                   terminalDanmakuTokens（投稿权）/ cloudConsentAt。
 *   todos ························ BIG DEAL 全家：isBigDeal / steps[] / currentState /
 *                                   deadline / fateDrawnDate / clearedActivityId。
 *   activities ···················· bigDealId + category 'bigdeal_step'|'bigdeal_clear'。
 *   battleStates + strata ········· 战场 v2 与影时间高塔区层。**必须成对**——
 *                                   battleState 记着"我在第几层"，strata 才是层本身，
 *                                   漏一张就是换设备后塔空了（FS1 修复：strata 补挂）。
 *   navigatorPresets/Memos ········ 黑猫自定义人格 + 原子记忆，opt-in（syncNavigatorToCloud）。
 *
 * 故意不上云（本地专属，改动前先想清楚）：
 *   counselSessions ··············· 谏言聊天原文（1 小时后本地也销毁）
 *   navigatorSessions/Messages ···· 黑猫聊天原文，同上口径
 *   ledgerEntries/budgets/assets ·· F5 财务数据，永不上云（PRD §F5.8）
 */
const SYNC_TABLES = [
  'users',
  'attributes',
  'activities',
  'achievements',
  'skills',
  'dailyEvents',
  'dailyDivinations',
  'longReadings',
  // 窥探命运（v2.7）：7 天塔罗总占卜 + buff 生效期，与 dailyDivinations 同口径上云
  'fateGlimpses',
  'stamps',
  'settings',
  'todos',
  'todoCompletions',
  'summaries',
  'weeklyGoals',
  'personas',
  'shadows',
  'battleStates',
  'confidants',
  'confidantEvents',
  // 谏言归档摘要（≤100 字第三人称小结），受"同伴"分组开关约束
  'counselArchives',
  // 宣告卡 / 倒计时（v2.1+），按 id 双向同步，pinned 互斥由本地 saveCallingCard 保障
  'callingCards',
  // F3 治疗终端「愿望清单」：列入 SYNC_TABLES 使其「可」同步，但 opt-in——
  // getSkipSet 默认把它加入 skip，仅当 settings.syncWishesToCloud === true 才上云（默认不传）。
  'wishes',
  // 影时间高塔区层（批2）：battleStates 的伴生表，两者必须同进同出——
  // 只同步 battleState 会让新设备"层数有了、层没了"（FS1 补挂）。
  'strata',
  // 黑猫自定义人格 + 原子记忆：opt-in（getSkipSet 默认加入 skip，
  // 仅 settings.syncNavigatorToCloud === true 才上云）。聊天原文两表不在此列。
  'navigatorPresets',
  'navigatorMemos',
  // ⚠️ F5 心相记账（ledgerEntries / budgets / assets）故意不列于此：财务数据始终只存本地、永不上云（PRD §F5.8）。
] as const;

type SyncKey = (typeof SYNC_TABLES)[number];

const LAST_SYNC_KEY = 'velvet:lastSyncAt';
const LAST_AUTO_SYNC_KEY = 'velvet:lastAutoSyncAt';
/** 本机这份数据最近是和哪个账号同步的：换账号登录时用来拦「把上一个人的数据推进新账号」 */
const SYNC_OWNER_KEY = 'velvet:syncOwner';
/** 后台自动同步失败的退避记录：{ at, n }，第 n 次失败后等 30 分钟 × 2^(n-1)（封顶 24 小时）再试 */
const AUTO_SYNC_FAIL_KEY = 'velvet:autoSyncFail';
const AUTO_SYNC_BACKOFF_BASE_MS = 30 * 60 * 1000;
/** 云端 _meta 记录的 key：格式版本 + 哪些表分了片。老版本 App 不认识这个 key，会直接跳过 */
const META_KEY = '_meta';
/** 本客户端认得的云端数据格式版本：2 = 认得分片（key#n）与 _meta。云端 _meta.schema 比这大 = 更新版本的 App 写的，拒绝推拉 */
export const SYNC_SCHEMA = 2;
/** 一张表的 JSON 超过这个就分片（PB 单个 JSON 字段默认上限约 2MB） */
const CHUNK_THRESHOLD_BYTES = 1_500_000;
/** 每片大约多大 */
const CHUNK_TARGET_BYTES = 1_000_000;
/** 上次推 / 拉时看到的云端各表版本：{ key: version }。推送前再看一眼，变了 = 别处改过，不能盲目覆盖 */
const CLOUD_SEEN_KEY = 'velvet:cloudSeen';
/** 后台自动同步节流：每 24 小时至多一次 */
const AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** 表级计数差 ≥ 阈值即视为"较大差异" */
const SIGNIFICANT_DIFF_THRESHOLD = 10;

const saveLastSync = (date: Date): void => {
  try {
    localStorage.setItem(LAST_SYNC_KEY, date.toISOString());
  } catch {
    /* localStorage 不可用时静默忽略 */
  }
};

/** 读取上次同步完成时间（多设备冲突判定用） */
export const readLastSync = (): Date | null => {
  try {
    const s = localStorage.getItem(LAST_SYNC_KEY);
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const readLastAutoSync = (): Date | null => {
  try {
    const s = localStorage.getItem(LAST_AUTO_SYNC_KEY);
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const saveLastAutoSync = (date: Date): void => {
  try {
    localStorage.setItem(LAST_AUTO_SYNC_KEY, date.toISOString());
  } catch {
    /* ignore */
  }
};

export const readSyncOwner = (): string | null => {
  try { return localStorage.getItem(SYNC_OWNER_KEY); } catch { return null; }
};
const saveSyncOwner = (userId: string): void => {
  try { localStorage.setItem(SYNC_OWNER_KEY, userId); } catch { /* ignore */ }
};

const readAutoSyncFail = (): { at: number; n: number } | null => {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_FAIL_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { at?: number; n?: number };
    return typeof v.at === 'number' && typeof v.n === 'number' ? { at: v.at, n: v.n } : null;
  } catch { return null; }
};
const noteAutoSyncFail = (): void => {
  const prev = readAutoSyncFail();
  try { localStorage.setItem(AUTO_SYNC_FAIL_KEY, JSON.stringify({ at: Date.now(), n: (prev?.n ?? 0) + 1 })); } catch { /* ignore */ }
};
const clearAutoSyncFail = (): void => {
  try { localStorage.removeItem(AUTO_SYNC_FAIL_KEY); } catch { /* ignore */ }
};

/**
 * 同一时间只跑一件：推、拉、后台自动同步互不并发。
 * 以前三者可以同时跑，两路 create 同一个 key 会在云端留下重复行，拉到一半推上去的也不知道是哪份。
 */
let syncInFlight: Promise<unknown> | null = null;
export const isSyncInFlight = (): boolean => syncInFlight !== null;
async function runExclusive<T>(what: string, fn: () => Promise<T>): Promise<T> {
  if (syncInFlight) throw new Error(`正在同步中，稍等一下再${what}`);
  const run = fn();
  syncInFlight = run.then(() => undefined, () => undefined);
  try {
    return await run;
  } finally {
    syncInFlight = null;
  }
}

type Row = Record<string, unknown>;

/** 推送时发现云端有别处的更新：调用方打开「和云端对一对」 */
export class SyncConflictError extends Error {
  tables: string[];
  constructor(tables: string[]) {
    super(`云端的${tables.join('、')}在别处改过，先对一对再推`);
    this.name = 'SyncConflictError';
    this.tables = tables;
  }
}
/** 云端数据是更新版本的 App 写的（_meta.schema 比本机大） */
export class SyncSchemaError extends Error {
  constructor(message: string) { super(message); this.name = 'SyncSchemaError'; }
}

const readCloudSeen = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(CLOUD_SEEN_KEY) || '{}') as Record<string, string>; } catch { return {}; }
};
const rememberCloudSeen = (versions: Record<string, string>): void => {
  try { localStorage.setItem(CLOUD_SEEN_KEY, JSON.stringify({ ...readCloudSeen(), ...versions })); } catch { /* ignore */ }
};

// ── 云端快照：认得分片（key#n）与 _meta ──────────────────────────────────────
interface CloudMeta { schema?: number; chunks?: Record<string, { n: number; at: string }> }
interface CloudTableRec {
  /** 拉全量时才有；只拉 id 时为 null */
  rows: Row[] | null;
  /** 这张表的版本：整表记录的 updated，或分片的 _meta.chunks[key].at；乐观并发按它比 */
  version: string;
  plainId: string | null;
  plainUpdated: string | null;
  chunkIds: Map<number, string>;
}
interface CloudSnapshot { tables: Map<string, CloudTableRec>; meta: CloudMeta; metaId: string | null }

const parseValue = (v: unknown): Row[] | null => {
  let parsed = v;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { return null; } }
  return Array.isArray(parsed) ? (parsed as Row[]) : null;
};
/** PB 的 updated 是「YYYY-MM-DD HH:MM:SS.mmmZ」，_meta.at 是 ISO：统一成前者再做字符串比较 */
const pbStamp = (iso: string): string => iso.replace('T', ' ');

/**
 * 把当前用户在 user_data 里的记录整理成「按表」的快照。
 * 分片：`activities#1..n` + `_meta.chunks.activities = { n, at }`。整表记录若比分片新（老版本 App 在分片之后
 * 又推过一次整表），以整表为准；否则拼分片。老版本 App 只认 SYNC_TABLES 里的 key，分片和 _meta 都会跳过，
 * 拉取时找不到整表记录就保留本地那张——不会拿到半张表。
 */
async function fetchCloudSnapshot(mode: 'ids' | 'full'): Promise<CloudSnapshot> {
  if (!pb) throw new Error('云同步未配置');
  const userId = getUserId();
  if (!userId) throw new Error('用户信息缺失');
  const records = await pb.collection('user_data').getFullList({
    filter: `user = "${userId}"`,
    ...(mode === 'ids' ? { fields: 'id,key,updated,created' } : {}),
    requestKey: null,
  });
  let meta: CloudMeta = {};
  let metaId: string | null = null;
  const metaRec = records.find(r => r.key === META_KEY);
  if (metaRec) {
    metaId = metaRec.id;
    let v: unknown = mode === 'ids' ? (await pb.collection('user_data').getOne(metaRec.id, { requestKey: null })).value : metaRec.value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = {}; } }
    if (v && typeof v === 'object' && !Array.isArray(v)) meta = v as CloudMeta;
  }
  if (typeof meta.schema === 'number' && meta.schema > SYNC_SCHEMA) {
    throw new SyncSchemaError('云端数据是更新版本的 App 写的，先更新 App 再同步');
  }
  const tables = new Map<string, CloudTableRec>();
  const rec = (key: string): CloudTableRec => {
    let t = tables.get(key);
    if (!t) { t = { rows: null, version: '', plainId: null, plainUpdated: null, chunkIds: new Map() }; tables.set(key, t); }
    return t;
  };
  const chunkValues = new Map<string, Map<number, Row[]>>();
  for (const r of records) {
    const key = r.key as string;
    if (key === META_KEY) continue;
    const hash = key.indexOf('#');
    if (hash < 0) {
      const t = rec(key);
      t.plainId = r.id;
      t.plainUpdated = (r.updated as string) || (r.created as string) || '';
      if (mode === 'full') t.rows = parseValue(r.value) ?? [];
      continue;
    }
    const base = key.slice(0, hash);
    const idx = Number(key.slice(hash + 1));
    if (!Number.isInteger(idx) || idx < 1) continue;
    rec(base).chunkIds.set(idx, r.id);
    if (mode === 'full') {
      let m = chunkValues.get(base);
      if (!m) { m = new Map(); chunkValues.set(base, m); }
      m.set(idx, parseValue(r.value) ?? []);
    }
  }
  for (const [key, t] of tables) {
    const chunkMeta = meta.chunks?.[key];
    const hasChunks = t.chunkIds.size > 0 && !!chunkMeta;
    const usePlain = !!t.plainId && (!hasChunks || (t.plainUpdated ?? '') > pbStamp(chunkMeta!.at));
    if (usePlain || !hasChunks) {
      t.version = t.plainUpdated ?? '';
    } else {
      t.version = chunkMeta!.at;
      if (mode === 'full') {
        const parts = chunkValues.get(key) ?? new Map<number, Row[]>();
        const rows: Row[] = [];
        for (let i = 1; i <= chunkMeta!.n; i++) rows.push(...(parts.get(i) ?? []));
        t.rows = rows;
      }
    }
    if (mode === 'full' && !t.rows) t.rows = [];
  }
  return { tables, meta, metaId };
}

const versionsOf = (snap: CloudSnapshot): Record<string, string> =>
  Object.fromEntries([...snap.tables].filter(([, t]) => !!t.version).map(([k, t]) => [k, t.version]));

/** 按大小切片：每片不超过 targetBytes（单行本身超过也单独成片） */
function splitRows(rows: Row[], targetBytes: number): Row[][] {
  const out: Row[][] = [];
  let cur: Row[] = [];
  let size = 2;
  for (const r of rows) {
    const b = JSON.stringify(r).length + 1;
    if (cur.length && size + b > targetBytes) { out.push(cur); cur = []; size = 2; }
    cur.push(r);
    size += b;
  }
  if (cur.length || out.length === 0) out.push(cur);
  return out;
}

/** 云端行 → 本机行：用 reviver 把 ISO 字符串还原成 Date */
const reviveRows = (rows: Row[]): Row[] => {
  try {
    const r = JSON.parse(JSON.stringify(rows), dateReviver);
    return Array.isArray(r) ? (r as Row[]) : [];
  } catch { return []; }
};

/**
 * 类型上就是 ISO **字符串**的字段（不是 Date）——reviver 必须放过它们。
 * 否则一次 pull 之后 `step.doneAt` 之流会从 string 变成 Date，类型说谎、
 * 字符串比较/切片全歪（FS1 审计发现的隐患类，目前尚无消费点，先堵住）。
 */
const ISO_STRING_KEYS = new Set<string>([
  'doneAt',            // TodoStep.doneAt
  'completedAt',       // Wish.stepHistory[].completedAt
  'tasksMergeMigratedAt',
  'lastCounselStartedAt',
  'cloudConsentAt',
  'defeatedAt',        // 战场纪念条目（ISO string 口径）
  'at',                // WishProgressPoint.at（PRD_V2.6 §8；全库唯一叫 at 的字段）
]);

/**
 * JSON reviver：把 ISO 日期字符串自动还原为 Date 对象。
 * 因为 Dexie 部分字段（如 activities.date、users.createdAt）是 Date，
 * 不做还原会导致 `.getTime()` 等调用失败。
 * 例外见 ISO_STRING_KEYS：那些字段的类型本身就是 string。
 */
const dateReviver = (key: string, value: unknown): unknown => {
  if (ISO_STRING_KEYS.has(key)) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
};

/** 本地 Dexie 是否有数据（以 users 表是否有记录为准） */
export const hasLocalData = async (): Promise<boolean> => {
  try {
    return (await db.users.count()) > 0;
  } catch {
    return false;
  }
};

/**
 * 云端 user_data 表里当前登录用户是否已有同步数据。
 * 三态：true / false / null（**查不到**——断网、服务端抖、请求被取消）。
 * 以前查失败也回 false，登录流程就把它当「云端没数据」直接推送覆盖：弱网下等于把云端那份抹了。
 */
export const hasCloudData = async (): Promise<boolean | null> => {
  if (!pb || !pb.authStore.isValid) return null;
  const userId = getUserId();
  if (!userId) return null;
  try {
    const res = await pb.collection('user_data').getList(1, 1, {
      filter: `user = "${userId}"`,
      // 同 computeSyncDiff：关掉 SDK 的同路径 autocancel
      requestKey: null,
    });
    return res.totalItems > 0;
  } catch {
    return null;
  }
};

/**
 * 上云前把「只留本机」的字段剥掉：同伴的两张头像图、设置里的背景图 / 天气 / （默认）API Key、24 小时终端卡。
 * 推送和「查阅并合并」的对账都走这里，两边比较的才是同一口径。
 */
function stripForCloud(key: string, rows: Row[], includeApiKey: boolean): Row[] {
  if (key === 'activities') {
    // 记录上的天气只留本机（第 6 轮）：它是"那台设备当时看到的天气"，不是记录内容
    return rows.map(r => {
      if (r && typeof r === 'object' && 'weather' in r) {
        const { weather: _w, ...rest } = r;
        void _w;
        return rest;
      }
      return r;
    });
  }
  if (key === 'confidants') {
    return rows.map(r => {
      if (r && typeof r === 'object' && ('customAvatarDataUrl' in r || 'cardFaceDataUrl' in r)) {
        const { customAvatarDataUrl: _omit, cardFaceDataUrl: _omit2, ...rest } = r;
        void _omit; void _omit2;
        return rest;
      }
      return r;
    });
  }
  if (key === 'settings') {
    // 默认**不**上传 Key（v2.6 起翻转）：多设备同步 Key 的便利，换不来"服务器上躺着一堆用户付费 Key"的风险。
    // 存量用户里显式打开过开关的（=== true）维持上传，其余一律剔除。
    return rows.map(r => {
      if (!r || typeof r !== 'object') return r;
      const { backgroundImage: _bg, backgroundOrientation: _bgo, weatherApiKey: _wk, weatherApiHost: _wh, weatherCity: _wc, ...rest } = r;
      void _bg; void _bgo; void _wk; void _wh; void _wc;
      if (!includeApiKey) {
        const { summaryApiKey: _s, openaiApiKey: _o, aiProfiles: _p, ...leaner } = rest;
        void _s; void _o; void _p;
        return leaner;
      }
      return rest;
    });
  }
  if (key === 'summaries') {
    // 追问用的原始 prompt（reqContext）里有愿望标题和记录原文：绕过了「愿望默认只存本地」，上云前剥掉。
    // 代价是别的设备拉到这份总结后不能再追问（那台没有上下文）；本机拉取时会把自己的补回去。
    return rows.map(r => {
      if (r && typeof r === 'object' && 'reqContext' in r) {
        const { reqContext: _rc, ...rest } = r;
        void _rc;
        return rest;
      }
      return r;
    });
  }
  // F3 终端 24h 任务存在 callingCards 表，但属临时态、且 terminal.goalTitle 复刻了愿望标题。
  // 愿望(wishes)默认本地优先(opt-in 上云)，故终端卡一律不上云，避免从 callingCards 通道泄漏愿望语义。
  if (key === 'callingCards') return rows.filter(r => !(r && typeof r === 'object' && r.terminal));
  return rows;
}

/**
 * 全量推送：把本地 Dexie 全部数据推到云端（覆盖同 key 记录）。同一时间只跑一件（见 runExclusive）。
 * 推送前先看云端各表的版本：和上次推 / 拉时看到的不一样 = 别处改过，抛 SyncConflictError 让用户先对一对；
 * force = 用户已经选了「以本机为准」。
 */
export const pushAll = (opts: { force?: boolean } = {}): Promise<void> => runExclusive('推送', () => pushAllInner(opts));

const pushAllInner = async (opts: { force?: boolean } = {}): Promise<void> => {
  const cloudStore = useCloudStore.getState();
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const userId = getUserId();
  if (!userId) throw new Error('用户信息缺失（请退出重新登录）');
  const client = pb;

  cloudStore.setSyncStatus('syncing');
  cloudStore.setLastError(null);
  try {
    const snap = await fetchCloudSnapshot('ids');
    const meta: CloudMeta = { ...snap.meta, chunks: { ...(snap.meta.chunks ?? {}) } };
    /** 这一轮写完后各表的版本（记到 cloudSeen） */
    const versions: Record<string, string> = {};

    const skipSet = getSkipSet();
    const appSettings = useAppStore.getState().settings;
    const includeApiKey = appSettings.syncCloudApiKey === true;

    // 乐观并发：上次推 / 拉时看到的版本和现在不一样 → 别处改过，盲目覆盖会把那些改动抹掉
    if (!opts.force) {
      const seen = readCloudSeen();
      const changed = SYNC_TABLES.filter(k => {
        if (skipSet.has(k) || !seen[k]) return false;
        const v = snap.tables.get(k)?.version ?? '';
        return !!v && v !== seen[k];
      });
      if (changed.length) throw new SyncConflictError(changed);
    }

    const del = async (id: string) => { try { await client.collection('user_data').delete(id, { requestKey: null }); } catch (e) { console.warn('[velvet-sync] push: delete failed', id, e); } };
    /** 写一张表：小表整条记录；大表切片（key#1..n）并登记到 _meta，同时清掉另一种形态的残留 */
    const writeTable = async (key: string, rows: Row[]): Promise<void> => {
      const cur = snap.tables.get(key);
      if (JSON.stringify(rows).length <= CHUNK_THRESHOLD_BYTES) {
        const r = cur?.plainId
          ? await client.collection('user_data').update(cur.plainId, { value: rows }, { requestKey: null })
          : await client.collection('user_data').create({ user: userId, key, value: rows }, { requestKey: null });
        versions[key] = (r.updated as string) || '';
        for (const id of cur?.chunkIds.values() ?? []) await del(id);
        if (meta.chunks) delete meta.chunks[key];
        return;
      }
      const parts = splitRows(rows, CHUNK_TARGET_BYTES);
      const at = new Date().toISOString();
      for (let i = 0; i < parts.length; i++) {
        const idx = i + 1;
        const id = cur?.chunkIds.get(idx);
        if (id) await client.collection('user_data').update(id, { value: parts[i] }, { requestKey: null });
        else await client.collection('user_data').create({ user: userId, key: `${key}#${idx}`, value: parts[i] }, { requestKey: null });
      }
      for (const [idx, id] of cur?.chunkIds ?? []) if (idx > parts.length) await del(id);
      if (cur?.plainId) await del(cur.plainId);
      meta.chunks = { ...(meta.chunks ?? {}), [key]: { n: parts.length, at } };
      versions[key] = at;
    };

    /** 没传上去的表：一张表失败不中断后面的（以前第一张出错整轮就停，后面的表永远传不上去） */
    const failed: Array<{ key: string; why: string }> = [];
    for (const key of SYNC_TABLES) {
      if (skipSet.has(key)) {
        // 用户选择不上传该表。若云端还留着**上次开着开关时**推上去的那份（整表或分片），就顺手删掉——
        // 否则「关掉开关」只是停止继续上传，历史数据永远躺在服务器上，
        // 与同步隐私面板给用户的承诺（这类数据不出本机）对不上（FS7 审查）。
        const cur = snap.tables.get(key);
        if (cur?.plainId) await del(cur.plainId);
        for (const id of cur?.chunkIds.values() ?? []) await del(id);
        if (meta.chunks) delete meta.chunks[key];
        continue;
      }
      let rows = await db.table(key).toArray();
      rows = stripForCloud(key, rows as Row[], includeApiKey);
      // 直接传数组：SDK 会用 JSON.stringify 序列化请求体（Date → ISO），
      // PocketBase 的 JSON 字段存为原生数组。
      // 不要先 JSON.stringify 成字符串再传 —— 那会被 PB 解析两次，行为不一致。
      try {
        await writeTable(key, rows as Row[]);
      } catch (e) {
        const st = (e as { status?: number })?.status;
        failed.push({ key, why: st === 413 ? '太大' : st ? `服务器回 ${st}` : '网络错误' });
        console.warn('[velvet-sync] push: table failed, continuing', key, e);
      }
    }
    // _meta：格式版本 + 分片登记。分片表要靠它才读得到，写不成就当整轮没成（下次再推）
    try {
      const metaValue = { schema: SYNC_SCHEMA, chunks: meta.chunks ?? {} };
      if (snap.metaId) await client.collection('user_data').update(snap.metaId, { value: metaValue }, { requestKey: null });
      else await client.collection('user_data').create({ user: userId, key: META_KEY, value: metaValue }, { requestKey: null });
    } catch (e) {
      failed.push({ key: '_meta', why: '登记分片失败' });
      console.warn('[velvet-sync] push: meta failed', e);
    }
    rememberCloudSeen(versions);

    // 把"公开档案"一并同步到 users 表（在线同伴 / 好友页要查的就是这份数据）
    //   total_lv        —— 总等级
    //   nickname        —— 来自本地 user.name（可编辑的展示名）
    //   attribute_names —— 自定义的五维名字
    //   attribute_levels —— 五维当前等级
    //   attribute_level_titles —— 五维每级的四字称号
    //   attribute_points —— 五维当前累计点数
    //   total_points    —— 五维 points 之和
    //   unlocked_count  —— 已解锁成就 + 已解锁技能（不含 blessing_*）
    const appState = useAppStore.getState();
    const attributes = appState.attributes;
    const totalLv = computeTotalLv(attributes);
    const localUserName = appState.user?.name?.trim();
    const attrNames = appState.settings.attributeNames;
    const attrLevels: Record<string, number> = {};
    const attrPoints: Record<string, number> = {};
    let totalPoints = 0;
    for (const a of attributes) {
      attrLevels[a.id] = a.level;
      attrPoints[a.id] = a.points;
      totalPoints += a.points ?? 0;
    }
    const unlockedCount =
      appState.achievements.filter(a => a.unlocked).length +
      appState.skills.filter(s => s.unlocked && !s.id.startsWith('blessing_')).length;
    try {
      const profilePatch: Record<string, unknown> = {
        total_lv: totalLv,
        attribute_names: attrNames,
        attribute_levels: attrLevels,
        attribute_level_titles: normalizeAttributeLevelTitles(
          appState.settings.attributeLevelTitles,
          appState.settings.levelThresholds?.length || 5,
        ),
        attribute_points: attrPoints,
        total_points: totalPoints,
        unlocked_count: unlockedCount,
      };
      // 仅当本地有名字时才推（避免空字符串覆盖云端已有昵称）
      if (localUserName) profilePatch.nickname = localUserName;
      const updated = await pb.collection('users').update(userId, profilePatch);
      // 同步更新本地 authStore.record，让 cloudUser 反映最新档案
      pb.authStore.save(pb.authStore.token, updated);
    } catch (e) {
      console.warn('[velvet-sync] push: failed to update user profile fields', e);
    }

    // 名片状态 / 目标（v2.7.0.6 第 6 项）：同样单发（字段没建就跳过）
    await pushProfilePresence();

    /**
     * 难度档（R19）**单独发一次**，不并进上面那个 patch。
     * 理由：它依赖 PB users 集合里有 level_difficulty 字段，而这个字段可能还没建。
     * 混在一起发的话，缺字段会让**整份档案**（昵称/等级/称号…）一起推不上去。
     * 拆开之后最坏情况只是"别人看不到你的难度标记"，其余档案照常。
     */
    try {
      await pb.collection('users').update(userId, {
        level_difficulty: resolveLevelDifficulty(appState.settings),
      });
    } catch {
      // PB 没这个字段就静默跳过——不是错误，是还没建
    }

    // 头像同步 —— 只在本地 dataUrl 与"上次上传指纹"不一致时才推
    try {
      await syncAvatarIfChanged(userId);
    } catch (e) {
      console.warn('[velvet-sync] push: avatar upload failed', e);
    }

    if (failed.length) {
      // 传上去的表已经在云端了；没传上去的报出来，让用户知道哪几张还留在本机（下次再推）
      throw new Error(`这几张表没有传上去：${failed.map(f => `${f.key}（${f.why}）`).join('、')}`);
    }
    saveSyncOwner(userId);
    const now = new Date();
    saveLastSync(now);
    cloudStore.setLastSyncAt(now);
    cloudStore.setLastSyncDirection('push');
    cloudStore.setSyncStatus('success');
  } catch (err) {
    cloudStore.setSyncStatus('error');
    cloudStore.setLastError(err instanceof Error ? err.message : '推送失败');
    throw err;
  }
};

/**
 * settings 里按设备生效的开关：拉取时一律用本机的值。
 * 它们随 settings 整行上云，另一台设备一推、这台一拉，「这台设备不上传 Key / 愿望」的选择就被对方的覆盖回来了。
 */
const DEVICE_SETTING_KEYS = ['syncExcludedTables', 'syncConfidantsToCloud', 'syncCloudApiKey', 'syncWishesToCloud', 'syncNavigatorToCloud'] as const;

/** 全量拉取：用云端数据覆盖本地 Dexie，然后刷新 Zustand 状态。同一时间只跑一件（见 runExclusive） */
export const pullAll = (): Promise<void> => runExclusive('拉取', pullAllInner);

/**
 * 云端行 → 可以写进本机的行：把「只留本机」的东西并回去。
 *   · settings：云端没带的 API Key（及其连接三件套）、背景图、天气、按设备生效的同步开关，用本机的
 *   · confidants：自定义头像、对方头像裁图，按 id 并回
 *   · callingCards：24 小时终端卡只存本机，云端没有，并回去
 *   · dailyDivinations：云端没有今天这一张时保留本地那张（每日一抽不可逆，丢了等于可以重抽）
 * 返回 null = 这张表跳过（云端 settings 是空数组：覆盖会把本地设置抹掉）。
 * 拉取和「查阅并合并」写库前都走这里。
 */
async function localizeCloudRows(key: string, rows: Row[]): Promise<Row[] | null> {
  if (key === 'settings' && rows.length === 0) {
    console.warn('[velvet-sync] pull: 云端 settings 为空数组，跳过覆盖以保护本地设置');
    return null;
  }
  let toWrite = rows;
  if (key === 'confidants') {
    const local = await db.confidants.toArray();
    const avatarById = new Map(local.filter(c => typeof c.customAvatarDataUrl === 'string' && c.customAvatarDataUrl).map(c => [c.id, c.customAvatarDataUrl as string]));
    const faceById = new Map(local.filter(c => typeof c.cardFaceDataUrl === 'string' && c.cardFaceDataUrl).map(c => [c.id, c.cardFaceDataUrl as string]));
    toWrite = toWrite.map(r => {
      const id = r?.id as string | undefined;
      if (!r || !id) return r;
      let next = r;
      if (avatarById.has(id)) next = { ...next, customAvatarDataUrl: avatarById.get(id) };
      if (faceById.has(id)) next = { ...next, cardFaceDataUrl: faceById.get(id) };
      return next;
    });
  }
  if (key === 'activities') {
    // 云端不存记录天气（见 stripForCloud）：本机原来有的按 id 补回来
    const local = await db.activities.toArray();
    const wById = new Map(local.filter(a => !!a.weather).map(a => [a.id, a.weather]));
    if (wById.size) {
      toWrite = toWrite.map(r => {
        const id = r?.id as string | undefined;
        if (!r || !id || r.weather || !wById.has(id)) return r;
        return { ...r, weather: wById.get(id) };
      });
    }
  }
  if (key === 'summaries') {
    // 云端不存追问上下文（见 stripForCloud）：本机原来有的补回来，追问功能不因一次拉取而失效
    const local = await db.summaries.toArray();
    const rcById = new Map(local.filter(s => !!s.reqContext).map(s => [s.id, s.reqContext]));
    toWrite = toWrite.map(r => {
      const id = r?.id as string | undefined;
      if (!r || !id || r.reqContext || !rcById.has(id)) return r;
      return { ...r, reqContext: rcById.get(id) };
    });
  }
  if (key === 'callingCards') {
    const terminal = (await db.callingCards.toArray()).filter(c => !!(c as { terminal?: unknown }).terminal) as unknown as Row[];
    if (terminal.length) {
      const ids = new Set(toWrite.map(r => r?.id));
      toWrite = [...toWrite, ...terminal.filter(c => !ids.has(c.id))];
    }
  }
  if (key === 'dailyDivinations') {
    const today = toLocalDateKey();
    // 取**最早**的那一张，与 store 的 loadDailyDivination 同口径：同一天可能存着两行（原抽 + 重抽）
    const sameDay = await db.dailyDivinations.where('date').equals(today).toArray();
    const localToday = sameDay.length
      ? sameDay.reduce((x, y) => (new Date(x.createdAt).getTime() <= new Date(y.createdAt).getTime() ? x : y))
      : undefined;
    if (localToday && !toWrite.some(r => r && r.date === today)) {
      const fb = localToday as unknown as Row;
      // 先剔掉同 id 的再追加：同一事务里主键重复会让整张表回滚
      toWrite = [...toWrite.filter(r => !(r && r.id === fb.id)), fb];
      console.warn('[velvet-sync] pull: 云端没有今日塔罗，保留本地这一张（避免可重抽）');
    }
  }
  if (key === 'settings') {
    const local = await db.settings.toArray();
    if (local.length > 0) {
      const ov = local[0] as unknown as Row;
      toWrite = toWrite.map((r, idx) => {
        if (idx !== 0 || !r) return r;
        const merged: Row = { ...r };
        // API Key：云端没带才回填（云端有值就尊重它，允许多设备同步）
        if (!merged.summaryApiKey && ov.summaryApiKey) merged.summaryApiKey = ov.summaryApiKey;
        if (!merged.openaiApiKey && ov.openaiApiKey) merged.openaiApiKey = ov.openaiApiKey;
        if (!merged.aiProfiles && ov.aiProfiles) merged.aiProfiles = ov.aiProfiles;
        // 连接三件套跟着 Key 走：这一次实际用的是本地 Key 时，provider / baseUrl / model 也用本地那套，否则错配
        if (!r.summaryApiKey && ov.summaryApiKey) {
          if (ov.summaryApiProvider) merged.summaryApiProvider = ov.summaryApiProvider;
          if (ov.summaryApiBaseUrl) merged.summaryApiBaseUrl = ov.summaryApiBaseUrl;
          if (ov.summaryModel) merged.summaryModel = ov.summaryModel;
        }
        // 背景图、天气：永远用本地（云端根本不存这几个字段）
        if (ov.backgroundImage) merged.backgroundImage = ov.backgroundImage;
        if (ov.backgroundOrientation) merged.backgroundOrientation = ov.backgroundOrientation;
        if (ov.weatherApiKey) merged.weatherApiKey = ov.weatherApiKey;
        if (ov.weatherApiHost) merged.weatherApiHost = ov.weatherApiHost;
        if (ov.weatherCity) merged.weatherCity = ov.weatherCity;
        // 按设备生效的同步开关：一律用本机的（本机没设过就删掉云端带来的，回到默认）
        for (const k of DEVICE_SETTING_KEYS) {
          if (ov[k] === undefined) delete merged[k]; else merged[k] = ov[k];
        }
        return merged;
      });
    }
  }
  return toWrite;
}

/** 把算好的各表一次性写进本机（一个事务，任何一张失败整体回滚），再重载内存态 */
async function writePlansLocally(plans: Array<{ key: SyncKey; rows: Row[] }>): Promise<void> {
  await db.transaction('rw', plans.map(p => db.table(p.key)), async () => {
    for (const p of plans) {
      const table = db.table(p.key);
      await table.clear();
      if (p.rows.length) await table.bulkAdd(p.rows as never[]);
    }
  });
  // 重载 Zustand in-memory 状态
  await useAppStore.getState().initializeApp();
  // 拉回来的可能是**未做过任务×终端合并迁移**的老设备数据，这里补跑一次；已迁移则读到标记瞬时返回
  try {
    await useAppStore.getState().runTasksMergeMigration();
  } catch (e) {
    console.warn('[velvet-sync] pull: tasks-merge 迁移补跑失败，下次启动续跑', e);
  }
}

const pullAllInner = async (): Promise<void> => {
  const cloudStore = useCloudStore.getState();
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const userId = getUserId();
  if (!userId) throw new Error('用户信息缺失（请退出重新登录）');

  cloudStore.setSyncStatus('syncing');
  cloudStore.setLastError(null);
  try {
    const snap = await fetchCloudSnapshot('full');
    console.log('[velvet-sync] pull: fetched', snap.tables.size, 'cloud tables');

    const skipSet = getSkipSet();
    let totalRowsWritten = 0;
    /**
     * 两段式：先把每张表要写的行算好（解析、还原日期、本机专属字段回填），
     * 最后放进**一个**事务写。任何一张失败整体回滚，本地维持拉取前的样子。
     */
    const plans: Array<{ key: SyncKey; rows: Row[] }> = [];
    for (const key of SYNC_TABLES) {
      if (skipSet.has(key)) continue; // 用户选择不从云端覆盖该表
      const t = snap.tables.get(key);
      if (!t || !t.rows) continue;    // 云端没有这张表（老版本分片前的表 / 从没推过）：保留本地
      const rows = reviveRows(t.rows);
      const toWrite = await localizeCloudRows(key, rows);
      if (!toWrite) continue;
      plans.push({ key, rows: toWrite });
      totalRowsWritten += rows.length;
    }
    await writePlansLocally(plans);
    console.log('[velvet-sync] pull: rewrote', plans.length, 'tables,', totalRowsWritten, 'total rows');

    rememberCloudSeen(versionsOf(snap));
    saveSyncOwner(userId);
    const now = new Date();
    saveLastSync(now);
    cloudStore.setLastSyncAt(now);
    cloudStore.setLastSyncDirection('pull');
    cloudStore.setSyncStatus('success');
  } catch (err) {
    cloudStore.setSyncStatus('error');
    cloudStore.setLastError(err instanceof Error ? err.message : '拉取失败');
    throw err;
  }
};

// ── 查阅并合并（v2.7.0.6 第 3 轮） ────────────────────────────────────────────

export interface MergePreview { tables: TableMergeStats[] }
export interface MergeTotals { onlyLocal: number; onlyCloud: number; conflict: number }

/** 对一遍账：每张表两边差在哪（不动数据） */
export const previewMerge = (): Promise<MergePreview> => runExclusive('对账', async () => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const snap = await fetchCloudSnapshot('full');
  const skipSet = getSkipSet();
  const includeApiKey = useAppStore.getState().settings.syncCloudApiKey === true;
  const tables: TableMergeStats[] = [];
  for (const key of SYNC_TABLES) {
    if (skipSet.has(key)) continue;
    const local = stripForCloud(key, (await db.table(key).toArray()) as Row[], includeApiKey);
    const cloud = reviveRows(snap.tables.get(key)?.rows ?? []);
    tables.push(mergeTable(key, local, cloud, { conflictWins: 'local', dropOnlyCloud: new Set() }).stats);
  }
  return { tables };
});

/**
 * 合并：两边都留（规则见 syncMerge.ts），写进本机，再推到云端。
 * 推的时候乐观并发照常生效：对账之后云端若又被别处改过，会被拦下来让用户再对一次。
 */
export const applyMerge = (opts: MergeOptions): Promise<MergeTotals> => runExclusive('合并', async () => {
  const cloudStore = useCloudStore.getState();
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const userId = getUserId();
  if (!userId) throw new Error('用户信息缺失（请退出重新登录）');
  cloudStore.setSyncStatus('syncing');
  cloudStore.setLastError(null);
  try {
    const snap = await fetchCloudSnapshot('full');
    const skipSet = getSkipSet();
    const includeApiKey = useAppStore.getState().settings.syncCloudApiKey === true;
    const totals: MergeTotals = { onlyLocal: 0, onlyCloud: 0, conflict: 0 };
    const plans: Array<{ key: SyncKey; rows: Row[] }> = [];
    for (const key of SYNC_TABLES) {
      if (skipSet.has(key)) continue;
      const local = stripForCloud(key, (await db.table(key).toArray()) as Row[], includeApiKey);
      const cloud = reviveRows(snap.tables.get(key)?.rows ?? []);
      const { rows, stats } = mergeTable(key, local, cloud, opts);
      totals.onlyLocal += stats.onlyLocal;
      totals.onlyCloud += opts.dropOnlyCloud.has(key) ? 0 : stats.onlyCloud;
      totals.conflict += stats.conflict;
      // 剥掉的本机专属字段并回去（settings 的 Key / 背景图、同伴头像、终端卡…）
      const localized = await localizeCloudRows(key, rows);
      if (!localized) continue;
      plans.push({ key, rows: localized });
    }
    await writePlansLocally(plans);
    rememberCloudSeen(versionsOf(snap));
    saveSyncOwner(userId);
    // 推到云端：已经持有 runExclusive 的锁，直接调内层
    await pushAllInner({ force: false });
    return totals;
  } catch (err) {
    cloudStore.setSyncStatus('error');
    cloudStore.setLastError(err instanceof Error ? err.message : '合并失败');
    throw err;
  }
});

export type LoginSyncResult = 'pulled' | 'pushed' | 'conflict' | 'skip';

/**
 * 登录成功后调用。根据本地/云端数据情况决定同步方向：
 *  - 两边都没数据   → skip
 *  - 只有本地有数据 → 推送（新账号首次使用）
 *  - 只有云端有数据 → 拉取（换设备登录）
 *  - 两边都有数据   → conflict（调用方负责弹出 ConflictDialog 让用户选）
 */
export const syncOnLogin = async (): Promise<LoginSyncResult> => {
  const [local, cloud] = await Promise.all([hasLocalData(), hasCloudData()]);
  if (cloud === null) {
    // 查不到云端有没有数据：不能当成「没有」去推送（弱网下会把云端那份抹掉）。报出来，让用户稍后手动同步
    useCloudStore.getState().setLastError('连不上云端，先不同步；网络好了再到账号页手动同步');
    throw new Error('连不上云端，稍后再试');
  }
  if (!local && !cloud) return 'skip';
  if (local && !cloud) {
    // 本机这份数据上次是和另一个账号同步的（换号登录）：不能自动推进新账号，交给用户选
    const owner = readSyncOwner();
    const me = getUserId();
    if (owner && me && owner !== me) return 'conflict';
    await pushAll();
    return 'pushed';
  }
  if (!local && cloud) {
    await pullAll();
    return 'pulled';
  }
  return 'conflict';
};

/** 冲突解决：保留本地数据，推送覆盖云端 */
export const resolveConflictKeepLocal = async (): Promise<void> => {
  await pushAll({ force: true });
};

/** 冲突解决：保留云端数据，拉取覆盖本地 */
export const resolveConflictKeepCloud = async (): Promise<void> => {
  await pullAll();
};

// ── 条目差异检查 ──────────────────────────────────────────────────

export interface SyncTableDiff {
  key: string;
  localCount: number;
  cloudCount: number;
  /** cloudCount - localCount；正数表示云端多 */
  diff: number;
}

export interface SyncDiff {
  tables: SyncTableDiff[];
  /** 是否存在任何条目差异（含数量差） */
  hasDiff: boolean;
  /** 是否存在较大差异（任一表差 ≥ SIGNIFICANT_DIFF_THRESHOLD 或 一侧空另一侧非空） */
  significant: boolean;
  /**
   * 任一表的**云端条数多于本地** —— 即"一次自动推送会毁掉云端已有数据"。
   *
   * 与 significant 的区别是**方向**，这是本次自动同步该不该放行的唯一判据：
   * · 本地多于云端 → 正常使用积累出来的新数据，推上去正是我们要的，不该拦；
   * · 云端多于本地 → 另一台设备写过东西、或本地被清过，此时静默 push 就是数据丢失。
   *
   * 原来 trySyncInBackground 读的是 significant，而 significant 用的是
   * `Math.abs(diff) >= 10` —— 对称的。后果有两层：
   *   ① 正常用一阵子（本地比云端多 10 条）就再也不自动推送了，只反复弹「条目差异」，
   *      后台自动备份形同虚设；
   *   ② 反过来云端比本地多 9 条时**低于阈值，直接静默推送覆盖**，
   *      那 9 条无声消失 —— 恰恰是最该拦的那一侧漏了。
   */
  cloudExceedsLocal: boolean;
  /** 总本地记录数 */
  localTotal: number;
  /** 总云端记录数 */
  cloudTotal: number;
  /** 建议方向（localTotal > cloudTotal: push；反之 pull；相同 skip） */
  recommend: 'push' | 'pull' | 'skip';
  /** 本地最新一条记录的 createdAt / date（找不到则为 null） */
  localLatest: Date | null;
  /** 云端 user_data 最新 updated 时间 */
  cloudLatest: Date | null;
}

/**
 * 不落库地统计当前用户在云端/本地每张同步表的记录条数，供 UI 在全量覆盖前让用户确认。
 * 只拉取 fields=value 的最小数据，并通过 JSON.parse 后 .length 得到 array 大小——
 * 对比单张表的数量，足以判断"是否出现丢失/错位"。
 */
export const computeSyncDiff = async (): Promise<SyncDiff | null> => {
  if (!pb || !pb.authStore.isValid) return null;
  if (!getUserId()) return null;

  // 云端：读所有 user_data 记录（含 updated 字段用于时间戳）
  //
  // requestKey: null（v2.7.0.4，用户上报「新设备首次登录，对账窗里条目数全是 0」）：
  // PocketBase SDK 默认按 method+path 自动生成 requestKey，**同路径的后一个请求会
  // 取消前一个**。登录那一下 syncOnLogin() 刚用 hasCloudData() 打过
  // /collections/user_data/records，紧接着弹出的对账窗又打同一条路径——两者一旦
  // 首尾相接就有一个被判 autocancel，getFullList 抛 ClientResponseError 0，
  // 上层只 console.warn 掉，于是窗里一个数都没有（详见 ConflictDialog 的呈现修复）。
  // 第二次登录时请求已被缓存/时序错开，所以"复现一次就好了"。全仓早有同款前科：
  // friends / coopBonds / notifications / danmaku 都显式关过 autocancel。
  const snap = await fetchCloudSnapshot('full');
  const cloudByKey = new Map<string, unknown>();
  let cloudLatest: Date | null = null;
  for (const [k, t] of snap.tables) {
    cloudByKey.set(k, t.rows ?? []);
    if (t.version) {
      const d = new Date(t.version.replace(' ', 'T'));
      if (!isNaN(d.getTime()) && (!cloudLatest || d > cloudLatest)) cloudLatest = d;
    }
  }

  // ⚠️ 必须套用与 push/pull 相同的豁免集（FS7 审查发现的真漏）：
  // 不套的话，任何"本地有、按用户意愿故意不上云"的表（愿望 / 黑猫记忆 / 用户自选排除的分类）
  // 都会算成「本地 N 条 vs 云端 0 条」，直接把 significant 顶成 true——后果有两层：
  //   ① trySyncInBackground 从此**永远不推送**，只反复弹「条目差异」，后台自动备份等于废掉；
  //   ② 用户在「检查条目差异」里看到一排 0，像是云端把数据弄丢了，实际是自己关了开关。
  const skipSet = getSkipSet();
  const tables: SyncTableDiff[] = [];
  let localTotal = 0;
  let cloudTotal = 0;
  for (const key of SYNC_TABLES) {
    if (skipSet.has(key)) continue; // 这张表两边本就不该一致，不参与比对
    const localCount = await db.table(key).count();
    let cloudCount = 0;
    const cloudVal = cloudByKey.get(key);
    if (Array.isArray(cloudVal)) {
      cloudCount = cloudVal.length;
    } else if (typeof cloudVal === 'string') {
      try {
        const parsed = JSON.parse(cloudVal);
        if (Array.isArray(parsed)) cloudCount = parsed.length;
      } catch {
        cloudCount = 0;
      }
    }
    tables.push({ key, localCount, cloudCount, diff: cloudCount - localCount });
    localTotal += localCount;
    cloudTotal += cloudCount;
  }

  // 本地最新时间：从"常变动"的几张表里取最近一条（活动 / 同伴事件 / 塔罗）
  const localLatest = await computeLocalLatest();

  const hasDiff = tables.some(t => t.diff !== 0);
  const significant = tables.some(t => {
    if (Math.abs(t.diff) >= SIGNIFICANT_DIFF_THRESHOLD) return true;
    if (t.localCount === 0 && t.cloudCount > 0) return true;
    if (t.cloudCount === 0 && t.localCount > 0) return true;
    return false;
  });

  // 方向性判据：只要有**任何一张表**云端比本地多，自动推送就会造成丢失（见字段注释）。
  // 不设容差 —— 少一条也是丢，且在整表覆盖模型下"云端多出来的是什么"本就无法自动判断。
  const cloudExceedsLocal = tables.some(t => t.cloudCount > t.localCount);

  const recommend: SyncDiff['recommend'] =
    localTotal === cloudTotal ? 'skip' : localTotal > cloudTotal ? 'push' : 'pull';

  return { tables, hasDiff, significant, cloudExceedsLocal, localTotal, cloudTotal, recommend, localLatest, cloudLatest };
};

/** 从常变动的几张表里采样最近一条记录的 createdAt / date，用作本地"最后活跃时间"。 */
async function computeLocalLatest(): Promise<Date | null> {
  const candidates: Array<Promise<Date | null>> = [
    db.activities.orderBy('date').reverse().limit(1).toArray()
      .then(rs => rs[0]?.date ? new Date(rs[0].date) : null).catch(() => null),
    db.confidantEvents.orderBy('createdAt').reverse().limit(1).toArray()
      .then(rs => rs[0]?.createdAt ? new Date(rs[0].createdAt) : null).catch(() => null),
    db.dailyDivinations.orderBy('date').reverse().limit(1).toArray()
      .then(rs => rs[0]?.date ? new Date(rs[0].date) : null).catch(() => null),
    db.todoCompletions.orderBy('date').reverse().limit(1).toArray()
      .then(rs => rs[0]?.date ? new Date(rs[0].date) : null).catch(() => null),
  ];
  const results = await Promise.all(candidates);
  let best: Date | null = null;
  for (const d of results) {
    if (d && !isNaN(d.getTime()) && (!best || d > best)) best = d;
  }
  return best;
}

/**
 * 后台自动同步（切到后台 / 页面关闭时调用）。
 *
 * 行为：
 *  - 每 24 小时最多触发一次（localStorage 节流）
 *  - 先计算 diff，如果**云端某张表比本地多**（推上去会毁掉云端数据）则不推，
 *    改为写入 cloudStore.diffWarning 交给用户定夺
 *  - 否则静默 pushAll
 *
 * 判据用 cloudExceedsLocal 而**不是** significant：后者是对称的，
 * 会把"本地正常积累出新数据"这种最该推送的情况也拦下来（详见 SyncDiff.cloudExceedsLocal）。
 *
 * 失败不抛出，仅更新 syncStatus。
 */
export const trySyncInBackground = async (): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;
  if (isSyncInFlight()) return; // 用户正在手动推 / 拉：别插队
  // 节流：24 小时内已经自动同步过则跳过
  const last = readLastAutoSync();
  if (last && Date.now() - last.getTime() < AUTO_SYNC_INTERVAL_MS) return;
  // 退避：上次失败后按 30 分钟 × 2^(n-1) 等（封顶 24 小时），不再每次退后台都全量重来
  const fail = readAutoSyncFail();
  if (fail && Date.now() - fail.at < Math.min(AUTO_SYNC_INTERVAL_MS, AUTO_SYNC_BACKOFF_BASE_MS * 2 ** Math.max(0, fail.n - 1))) return;

  try {
    const diff = await computeSyncDiff();
    if (diff && diff.cloudExceedsLocal) {
      // 暂不动数据，让主线程弹窗让用户确认
      const { useCloudStore } = await import('@/store/cloud');
      useCloudStore.getState().setDiffWarning(diff);
      saveLastAutoSync(new Date()); // 标记已触发，避免反复打扰
      return;
    }
    await pushAll();
    saveLastAutoSync(new Date());
    clearAutoSyncFail();
  } catch (err) {
    if (err instanceof SyncConflictError) {
      // 云端有别处的更新：不是故障，是要用户对一对
      useCloudStore.getState().openMerge(err.tables);
      saveLastAutoSync(new Date()); // 别每次退后台都弹
      return;
    }
    noteAutoSyncFail(); // 已由 pushAll 内部 setLastError 记录，静默不扰民
  }
};

/** 用户在"条目差异"提示中选择"保留本地，覆盖云端" */
export const acceptDiffKeepLocal = async (): Promise<void> => {
  await pushAll({ force: true });
  saveLastAutoSync(new Date());
};

/**
 * 删除当前用户在云端的全部 user_data 记录。
 * 本地数据不动；删完之后立即把 lastSyncAt 清空（避免状态徽章显示"已同步"）。
 * 调用方（UI）应当先展示确认弹窗，不要默认直接调用。
 */
export const deleteAllCloudData = async (): Promise<{ deleted: number }> => {
  const cloudStore = useCloudStore.getState();
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const userId = getUserId();
  if (!userId) throw new Error('用户信息缺失');

  cloudStore.setSyncStatus('syncing');
  cloudStore.setLastError(null);
  try {
    const records = await pb.collection('user_data').getFullList({
      filter: `user = "${userId}"`,
      fields: 'id',
    });
    let deleted = 0;
    for (const r of records) {
      await pb.collection('user_data').delete(r.id);
      deleted += 1;
    }
    // 清除云端 total_lv（users 表本身不动，避免 RLS 问题）
    try {
      const updated = await pb.collection('users').update(userId, {
        total_lv: 0,
        attribute_level_titles: {},
      });
      pb.authStore.save(pb.authStore.token, updated);
    } catch (e) {
      console.warn('[velvet-sync] deleteAllCloudData: failed to reset total_lv', e);
    }
    cloudStore.setLastSyncAt(null);
    cloudStore.setLastSyncDirection(null);
    cloudStore.setSyncStatus('idle');
    try { localStorage.removeItem(LAST_SYNC_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(LAST_AUTO_SYNC_KEY); } catch { /* ignore */ }
    return { deleted };
  } catch (err) {
    cloudStore.setSyncStatus('error');
    cloudStore.setLastError(err instanceof Error ? err.message : '删除云端数据失败');
    throw err;
  }
};

/** 用户在"条目差异"提示中选择"保留云端，覆盖本地" */
export const acceptDiffKeepCloud = async (): Promise<void> => {
  await pullAll();
  saveLastAutoSync(new Date());
};
