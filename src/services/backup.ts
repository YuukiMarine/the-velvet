/**
 * backup.ts — 本地数据备份 / 恢复的纯数据层
 * （UI_AUDIT_V2.5.md §3.4：导出/导入逻辑自 Settings.tsx 下沉 service 层）
 *
 * 脱敏规则（与历史导出行为逐字一致，导入端依赖此约定）：
 *   - settings 表：剥离 backgroundImage（背景图 base64 体积大）与
 *     openaiApiKey / summaryApiKey（密钥绝不写入备份外泄）；
 *   - users 表：剥离 avatarDataUrl（base64 头像体积大，导入后可重新上传）；
 *   - confidants 表：剥离 customAvatarDataUrl（长按上传的自定义头像，语义上属本地私有）。
 *
 * 本文件只做纯函数 / IO（IndexedDB 读取、文件下载/分享、剪贴板、FileReader）；
 * 一切 UI 状态（提示文案、复制成功标记等 setState）由调用方（pages/Account.tsx）自行维护。
 */
import { db } from '@/db';
import { toLocalDateKey } from '@/store';
import { exportBackup } from '@/utils/native';

/** 计算字符串体积的人类可读标签（KB / MB） */
export const sizeOf = (s: string): string => {
  const bytes = new Blob([s]).size;
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

/** 备份文件名：velvet-room-backup-YYYY-MM-DD.json */
export const buildBackupFilename = (): string => `velvet-room-backup-${toLocalDateKey()}.json`;

// ── 构建导出数据 JSON 字符串（抽出公共逻辑）────────────────
export const buildExportJson = async (): Promise<string> => {
  const rawSettings = await db.settings.toArray();
  const sanitizedSettings = rawSettings.map(s => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { backgroundImage: _bg, openaiApiKey: _key, summaryApiKey: _sk, ...rest } = s as typeof s & { backgroundImage?: string; openaiApiKey?: string; summaryApiKey?: string };
    return rest;
  });
  // 用户表：剔除 base64 头像（体积太大；导入后可重新上传）
  const sanitizedUsers = (await db.users.toArray()).map(u => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { avatarDataUrl: _av, ...rest } = u as typeof u & { avatarDataUrl?: string };
    return rest;
  });
  // 同伴表：剔除长按上传的自定义头像（同理体积较大，且语义上属于本地私有）
  const sanitizedConfidants = (await db.confidants.toArray()).map(c => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { customAvatarDataUrl: _av, ...rest } = c as typeof c & { customAvatarDataUrl?: string };
    return rest;
  });
  const data = {
    user: sanitizedUsers,
    attributes: await db.attributes.toArray(),
    activities: await db.activities.toArray(),
    achievements: await db.achievements.toArray(),
    skills: await db.skills.toArray(),
    settings: sanitizedSettings,
    todos: await db.todos.toArray(),
    todoCompletions: await db.todoCompletions.toArray(),
    // 逆影战场数据（v3 新增，导入时向后兼容）
    personas: await db.personas.toArray(),
    shadows: await db.shadows.toArray(),
    battleStates: await db.battleStates.toArray(),
    strata: await db.strata.toArray(),  // 影时间高塔·区层（批2 新增，导入向后兼容）
    // 星象 / 塔罗（v4 新增）
    dailyDivinations: await db.dailyDivinations.toArray(),
    longReadings: await db.longReadings.toArray(),
    summaries: await db.summaries.toArray(),
    weeklyGoals: await db.weeklyGoals.toArray(),
    // 同伴（v5 新增）
    confidants: sanitizedConfidants,
    confidantEvents: await db.confidantEvents.toArray(),
    // 谏言归档摘要（v6 新增；聊天原文永不落盘，所以此处不包含 counselSessions）
    counselArchives: await db.counselArchives.toArray(),
    // 愿望清单（F3 v7 新增；本地全量备份始终包含，云端是否上传另由 syncWishesToCloud 控制）
    wishes: await db.wishes.toArray(),
    // ── v8 补挂（FS7 审查）：以下几张表此前**导出端整段缺失**，是真漏不是设计 ──
    //   · callingCards：导入端一直有 data.callingCards 分支，导出端却从没写过这个 key（两端不对称）
    //   · ledgerEntries/budgets/assets：F5 财务数据按 PRD §F5.8 **永不上云**，
    //     若备份也不带，用户就一条迁移路径都没有——换机/重装即全灭。
    //     它只落本地文件、由用户自己保管，与"不上云"的承诺不冲突。
    //   · navigatorPresets/navigatorMemos：黑猫人格与原子记忆默认 opt-out 不上云，同上理由。
    //     （navigatorSessions/Messages 是 7 天即焚的聊天原文，与 counselSessions 同口径，故意不带。）
    callingCards: await db.callingCards.toArray(),
    ledgerEntries: await db.ledgerEntries.toArray(),
    budgets: await db.budgets.toArray(),
    assets: await db.assets.toArray(),
    navigatorPresets: await db.navigatorPresets.toArray(),
    navigatorMemos: await db.navigatorMemos.toArray(),
    // ── v9（v2.6 上线审计）：dailyEvents 补挂 ──
    //   这张表已是旧版遗留（全站无任何读写点，SyncDiffDialog 里标着「旧版每日事件」），
    //   但它**一直在 SYNC_TABLES 里**——也就是说同步层认它是用户数据、备份层不认。
    //   两层对同一张表的判断相反，总有一层是错的。存量用户手里可能还留着旧行，
    //   按"备份是一份完整快照"的承诺，这里补上（纯字符串字段，无 Date 需还原）。
    dailyEvents: await db.dailyEvents.toArray(),
    // ── v10（v2.7）：窥探命运（7 天塔罗总占卜 + buff 生效期）──
    fateGlimpses: await db.fateGlimpses.toArray(),
    _exportedAt: new Date().toISOString(),
    _version: 10,
  };
  const json = JSON.stringify(data);
  // 出口校验：确保产生的 JSON 字符串可被原样解析回来。
  // 这能捕获 Invalid Date、非 finite 数字等极少数能让 JSON.stringify 产出"坏行"的场景，
  // 避免用户导出的备份到了导入端才发现解析失败。
  try {
    JSON.parse(json);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`导出 JSON 生成失败：${msg}。请反馈给开发者（此问题需要定位具体哪条记录异常）`);
  }
  return json;
};

/**
 * 导出并下载 / 分享备份：
 *  - 原生端：写入 Cache 后调起系统分享面板，返回 null；
 *  - Web 端：触发 Blob 下载，返回 { url, filename, size } 供 UI 展示蓝链
 *    （调用方负责 revoke 旧 URL 的时机）。
 * 失败时 throw，由调用方决定提示文案。
 */
export const downloadBackup = async (): Promise<{ url: string; filename: string; size: string } | null> => {
  const jsonString = await buildExportJson();
  return exportBackup(buildBackupFilename(), jsonString);
};

/**
 * 导出并复制到剪贴板；成功返回体积标签（如 "1.2 MB"）供提示文案拼接，
 * 失败（构建失败 / 剪贴板权限被拒）时 throw。
 */
export const copyBackupToClipboard = async (): Promise<string> => {
  const jsonString = await buildExportJson();
  await navigator.clipboard.writeText(jsonString);
  return sizeOf(jsonString);
};

/**
 * 读取备份文件文本（UTF-8）。
 * 非 JSON 文件（按扩展名 / MIME 双重判断）直接 reject；
 * 与历史行为保持一致：读到空内容时 resolve('')，由调用方决定是否忽略。
 */
export const readBackupFile = (file: File): Promise<string> => {
  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    return Promise.reject(new Error('请选择 JSON 格式的备份文件'));
  }
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string) ?? '');
    reader.readAsText(file, 'utf-8');
  });
};
