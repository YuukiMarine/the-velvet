import { db } from '@/db';
import { pb, getUserId } from './pocketbase';
import { useCloudStore } from '@/store/cloud';
import { useAppStore } from '@/store';
import { computeTotalLv } from '@/utils/lvTiers';
import { normalizeAttributeLevelTitles } from '@/utils/attributeLevelTitles';

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
  return skip;
}

/**
 * 需要同步到云端的 Dexie 表列表。
 * 每张表作为 user_data 表里的一条 KV 记录存储（key = 表名，value = 序列化后的行数组）。
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
] as const;

type SyncKey = (typeof SYNC_TABLES)[number];

const LAST_SYNC_KEY = 'velvet:lastSyncAt';
const LAST_AUTO_SYNC_KEY = 'velvet:lastAutoSyncAt';
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

/**
 * JSON reviver：把 ISO 日期字符串自动还原为 Date 对象。
 * 因为 Dexie 部分字段（如 activities.date、users.createdAt）是 Date，
 * 不做还原会导致 `.getTime()` 等调用失败。
 */
const dateReviver = (_key: string, value: unknown): unknown => {
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

/** 云端 user_data 表里当前登录用户是否已有同步数据 */
export const hasCloudData = async (): Promise<boolean> => {
  if (!pb || !pb.authStore.isValid) return false;
  const userId = getUserId();
  if (!userId) return false;
  try {
    const res = await pb.collection('user_data').getList(1, 1, {
      filter: `user = "${userId}"`,
    });
    return res.totalItems > 0;
  } catch {
    return false;
  }
};

/** 全量推送：把本地 Dexie 全部数据推到云端（覆盖同 key 记录） */
export const pushAll = async (): Promise<void> => {
  const cloudStore = useCloudStore.getState();
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const userId = getUserId();
  if (!userId) throw new Error('用户信息缺失（请退出重新登录）');

  cloudStore.setSyncStatus('syncing');
  cloudStore.setLastError(null);
  try {
    // 一次性拉取已有记录，避免每个 key 各查一次
    const existing = await pb.collection('user_data').getFullList({
      filter: `user = "${userId}"`,
      fields: 'id,key',
    });
    const existingByKey = new Map<string, string>(
      existing.map(r => [r.key as string, r.id as string])
    );

    const skipSet = getSkipSet();
    const appSettings = useAppStore.getState().settings;
    const includeApiKey = appSettings.syncCloudApiKey !== false; // 默认上传；开关显式关了才剔除
    for (const key of SYNC_TABLES) {
      if (skipSet.has(key)) continue; // 用户选择不上传该表
      let rows = await db.table(key).toArray();
      // 隐私豁免：confidants 的 customAvatarDataUrl 字段只保留在本地，不上云
      if (key === 'confidants') {
        rows = rows.map((r: Record<string, unknown>) => {
          if (r && typeof r === 'object' && 'customAvatarDataUrl' in r) {
            const { customAvatarDataUrl: _omit, ...rest } = r as Record<string, unknown>;
            void _omit;
            return rest;
          }
          return r;
        });
      }
      // settings 的特殊字段处理：
      //   · backgroundImage 永远不上云（base64 图片体积太大，也是纯设备偏好）
      //   · AI API Key 按开关决定
      if (key === 'settings') {
        rows = rows.map((r: Record<string, unknown>) => {
          if (!r || typeof r !== 'object') return r;
          const {
            backgroundImage: _bg,
            backgroundOrientation: _bgo,
            ...rest
          } = r as Record<string, unknown>;
          void _bg; void _bgo;
          if (!includeApiKey) {
            const { summaryApiKey: _s, openaiApiKey: _o, ...leaner } = rest;
            void _s; void _o;
            return leaner;
          }
          return rest;
        });
      }
      // 直接传数组：SDK 会用 JSON.stringify 序列化请求体（Date → ISO），
      // PocketBase 的 JSON 字段存为原生数组。
      // 不要先 JSON.stringify 成字符串再传 —— 那会被 PB 解析两次，行为不一致。
      const existingId = existingByKey.get(key);
      if (existingId) {
        await pb.collection('user_data').update(existingId, { value: rows });
      } else {
        await pb.collection('user_data').create({ user: userId, key, value: rows });
      }
    }

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

    // 头像同步 —— 只在本地 dataUrl 与"上次上传指纹"不一致时才推
    try {
      await syncAvatarIfChanged(userId);
    } catch (e) {
      console.warn('[velvet-sync] push: avatar upload failed', e);
    }

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

/** 全量拉取：用云端数据覆盖本地 Dexie，然后刷新 Zustand 状态 */
export const pullAll = async (): Promise<void> => {
  const cloudStore = useCloudStore.getState();
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const userId = getUserId();
  if (!userId) throw new Error('用户信息缺失（请退出重新登录）');

  cloudStore.setSyncStatus('syncing');
  cloudStore.setLastError(null);
  try {
    const list = await pb.collection('user_data').getFullList({
      filter: `user = "${userId}"`,
    });
    console.log('[velvet-sync] pull: fetched', list.length, 'cloud records');

    const skipSet = getSkipSet();
    let tablesRewritten = 0;
    let totalRowsWritten = 0;
    for (const item of list) {
      const key = item.key as string;
      if (!(SYNC_TABLES as readonly string[]).includes(key)) continue;
      if (skipSet.has(key)) continue; // 用户选择不从云端覆盖该表

      // PocketBase 的 JSON 字段通常直接返回原生值（数组/对象）。
      // 兼容一些旧数据可能是 JSON 字符串的情况。
      let parsedValue: unknown = item.value;
      if (typeof parsedValue === 'string') {
        try {
          parsedValue = JSON.parse(parsedValue);
        } catch (e) {
          console.warn('[velvet-sync] pull: failed to parse legacy string', key, e);
          continue;
        }
      }
      if (!Array.isArray(parsedValue)) continue;

      // 用 stringify + parse+reviver 的技巧把 ISO 字符串还原为 Date
      let rows: unknown;
      try {
        rows = JSON.parse(JSON.stringify(parsedValue), dateReviver);
      } catch (e) {
        console.warn('[velvet-sync] pull: failed to revive', key, e);
        continue;
      }
      if (!Array.isArray(rows)) continue;

      // 清空后整体写入，实现覆盖
      const table = db.table(key as SyncKey);

      // 隐私豁免：confidants.customAvatarDataUrl 永远不上云，
      // 拉取时要保留本地已有的自定义头像（按 id 匹配合并回去）
      let localAvatarById: Map<string, string> | null = null;
      if (key === 'confidants') {
        const local = await db.confidants.toArray();
        localAvatarById = new Map(
          local
            .filter(c => typeof c.customAvatarDataUrl === 'string' && c.customAvatarDataUrl)
            .map(c => [c.id, c.customAvatarDataUrl as string]),
        );
      }

      // 隐私豁免：settings 若云端没带某些字段，保留本地版本
      //   · summaryApiKey / openaiApiKey：按"AI 模型 API"开关决定是否上云，拉回来若缺失则回填本地
      //   · backgroundImage / backgroundOrientation：永远不上云，拉回来必须回填，否则会被清掉
      let localSettingsOverrides: Record<string, unknown> | null = null;
      if (key === 'settings') {
        const local = await db.settings.toArray();
        if (local.length > 0) {
          const first = local[0] as unknown as Record<string, unknown>;
          localSettingsOverrides = {
            summaryApiKey: first.summaryApiKey,
            openaiApiKey: first.openaiApiKey,
            backgroundImage: first.backgroundImage,
            backgroundOrientation: first.backgroundOrientation,
          };
        }
      }

      await table.clear();
      if (rows.length) {
        let toWrite = rows as Array<Record<string, unknown>>;
        if (localAvatarById) {
          toWrite = toWrite.map(r => {
            const id = (r as { id?: string }).id;
            if (r && typeof r === 'object' && id && localAvatarById!.has(id)) {
              return { ...r, customAvatarDataUrl: localAvatarById!.get(id) };
            }
            return r;
          });
        }
        if (localSettingsOverrides) {
          toWrite = toWrite.map((r, idx) => {
            if (idx !== 0 || !r || typeof r !== 'object') return r;
            const merged: Record<string, unknown> = { ...r };
            const ov = localSettingsOverrides!;
            // API Key：云端没带才回填（云端有值就尊重它，允许多设备同步）
            if (!merged.summaryApiKey && ov.summaryApiKey) {
              merged.summaryApiKey = ov.summaryApiKey;
            }
            if (!merged.openaiApiKey && ov.openaiApiKey) {
              merged.openaiApiKey = ov.openaiApiKey;
            }
            // 背景图：永远用本地（云端既不存也不会带回来，无条件保留设备本地偏好）
            if (ov.backgroundImage) {
              merged.backgroundImage = ov.backgroundImage;
            }
            if (ov.backgroundOrientation) {
              merged.backgroundOrientation = ov.backgroundOrientation;
            }
            return merged;
          });
        }
        await table.bulkAdd(toWrite as never[]);
      }
      tablesRewritten++;
      totalRowsWritten += rows.length;
    }
    console.log(
      '[velvet-sync] pull: rewrote',
      tablesRewritten,
      'tables,',
      totalRowsWritten,
      'total rows'
    );

    // 重载 Zustand in-memory 状态
    await useAppStore.getState().initializeApp();

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
  if (!local && !cloud) return 'skip';
  if (local && !cloud) {
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
  await pushAll();
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
  const userId = getUserId();
  if (!userId) return null;

  // 云端：读所有 user_data 记录（含 updated 字段用于时间戳）
  const cloudRecords = await pb.collection('user_data').getFullList({
    filter: `user = "${userId}"`,
    fields: 'key,value,updated,created',
  });
  const cloudByKey = new Map<string, unknown>();
  let cloudLatest: Date | null = null;
  for (const r of cloudRecords) {
    cloudByKey.set(r.key as string, r.value);
    const u = (r as unknown as { updated?: string; created?: string }).updated
      ?? (r as unknown as { updated?: string; created?: string }).created;
    if (u) {
      const d = new Date(u);
      if (!isNaN(d.getTime()) && (!cloudLatest || d > cloudLatest)) {
        cloudLatest = d;
      }
    }
  }

  const tables: SyncTableDiff[] = [];
  let localTotal = 0;
  let cloudTotal = 0;
  for (const key of SYNC_TABLES) {
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

  const recommend: SyncDiff['recommend'] =
    localTotal === cloudTotal ? 'skip' : localTotal > cloudTotal ? 'push' : 'pull';

  return { tables, hasDiff, significant, localTotal, cloudTotal, recommend, localLatest, cloudLatest };
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
 *  - 先计算 diff，如果存在"较大差异"则不直接推送，改为写入 cloudStore.diffWarning 提示 UI
 *  - 否则静默 pushAll
 *
 * 失败不抛出，仅更新 syncStatus。
 */
export const trySyncInBackground = async (): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;
  // 节流：24 小时内已经自动同步过则跳过
  const last = readLastAutoSync();
  if (last && Date.now() - last.getTime() < AUTO_SYNC_INTERVAL_MS) return;

  try {
    const diff = await computeSyncDiff();
    if (diff && diff.significant) {
      // 暂不动数据，让主线程弹窗让用户确认
      const { useCloudStore } = await import('@/store/cloud');
      useCloudStore.getState().setDiffWarning(diff);
      saveLastAutoSync(new Date()); // 标记已触发，避免反复打扰
      return;
    }
    await pushAll();
    saveLastAutoSync(new Date());
  } catch {
    /* 已由 pushAll 内部 setLastError 记录，静默不扰民 */
  }
};

/** 用户在"条目差异"提示中选择"保留本地，覆盖云端" */
export const acceptDiffKeepLocal = async (): Promise<void> => {
  await pushAll();
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
