/**
 * Account —「账号与数据」子页
 * （UI_AUDIT_V2.5.md §3.4：数据管理 + 云同步两节自 Settings.tsx 手风琴迁出，平铺为独立页面）
 *
 * 迁移原则：节内 JSX 与交互行为原样照搬，仅更换容器骨架（手风琴 → EyebrowLabel 节标题 + 卡片平铺）；
 *   - 三个确认弹窗（重置数据 / 云端拉取覆盖 / 退出登录）升级为 <ConfirmDialog> 基座——
 *     同时根治原手写弹窗缺 AnimatePresence 的 B14 死 exit；
 *   - 导出 / 复制 / 读备份文件等纯数据逻辑下沉至 @/services/backup，本页只持有 UI 状态。
 */
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { triggerNavFeedback } from '@/utils/feedback';
import { isNative } from '@/utils/native';
import { PageTitle } from '@/components/PageTitle';
import { EyebrowLabel } from '@/components/EyebrowLabel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LoginModal } from '@/components/auth/LoginModal';
import { AccountManagePanel } from '@/components/auth/AccountManagePanel';
import { SyncPrivacyPanel } from '@/components/auth/SyncPrivacyPanel';
import { LVTag } from '@/components/LVTag';
import { computeTotalLv } from '@/utils/lvTiers';
import { logout as cloudLogout } from '@/services/auth';
import { pushAll, pullAll, syncOnLogin, computeSyncDiff } from '@/services/sync';
import { downloadBackup, copyBackupToClipboard, readBackupFile } from '@/services/backup';

/** 将一个过去的时间格式化为 "刚刚 / N 分钟前 / N 小时前 / N 天前"（随云同步节自 Settings 迁来） */
const formatRelative = (date: Date): string => {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const Account = () => {
  const {
    user,
    settings,
    updateSettings,
    resetAllData,
    importData,
  } = useAppStore();
  const attributes = useAppStore(s => s.attributes);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const totalLv = computeTotalLv(attributes);

  // ── 数据管理：导出 / 导入 / 重置 ─────────────────────────
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 复制到剪贴板状态
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  // 下载后显示的蓝链
  const [downloadLink, setDownloadLink] = useState<{ url: string; filename: string; size: string } | null>(null);
  const downloadLinkUrlRef = useRef<string | null>(null); // keep URL alive until replaced

  // ── 云同步 ───────────────────────────────────────────────
  const cloudEnabled = useCloudStore(s => s.cloudEnabled);
  const cloudUser = useCloudStore(s => s.cloudUser);
  const syncStatus = useCloudStore(s => s.syncStatus);
  const lastSyncAt = useCloudStore(s => s.lastSyncAt);
  const lastCloudError = useCloudStore(s => s.lastError);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [syncChoiceOpen, setSyncChoiceOpen] = useState(false);
  // LV 徽章点击展开总点数明细
  const [showPointsBreakdown, setShowPointsBreakdown] = useState(false);
  // UserID 复制到剪贴板的轻提示
  const [userIdCopied, setUserIdCopied] = useState(false);
  // 账号管理面板
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);

  const handleDownload = async () => {
    try {
      const result = await downloadBackup();
      if (result) {
        // Web 端：返回 Blob 下载链接
        if (downloadLinkUrlRef.current) URL.revokeObjectURL(downloadLinkUrlRef.current);
        downloadLinkUrlRef.current = result.url;
        setDownloadLink(result);
        setExportMessage(null);
      } else {
        // 原生端：分享面板已弹出，给一个友好提示
        setExportMessage('分享面板已打开，请选择保存位置（文件管理 / 云盘 / 邮件 等）');
        setDownloadLink(null);
      }
    } catch (err) {
      setExportMessage(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCopy = async () => {
    try {
      const size = await copyBackupToClipboard();
      setCopyState('ok');
      setExportMessage(`已复制到剪贴板（${size}）`);
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('err');
      setExportMessage('复制失败，请尝试下载');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  const handleResetData = async () => {
    await resetAllData();
    setShowResetConfirm(false);
  };

  // 处理文件选择或粘贴导入
  const handleImportData = async () => {
    if (!importJson.trim()) return;
    setImportLoading(true);
    try {
      await importData(importJson);
      setImportJson('');
      setExportMessage('导入成功！数据已恢复。');
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImportLoading(false);
    }
  };

  const handleFileSelect = async (file: File) => {
    try {
      const text = await readBackupFile(file);
      if (text) setImportJson(text);
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : '读取备份文件失败');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {/* 顶部标题 + 返回按钮（与其他子页保持一致的视觉） */}
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => { triggerNavFeedback(); setCurrentPage('menu'); }}
          className="flex-shrink-0 mt-1 w-9 h-9 -ml-1 rounded-xl flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition"
          aria-label="返回"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex-1">
          <PageTitle title="账号与数据" en="Account" />
        </div>
      </div>

      {/* ── 数据管理 ─────────────────────────────────────── */}
      <section className="space-y-2">
        <EyebrowLabel className="px-0.5">数据管理 · Data</EyebrowLabel>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="space-y-5">
            {/* 消息提示 */}
            {exportMessage && (
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200">
                <div className="flex items-start justify-between gap-2">
                  <span className="leading-snug">{exportMessage}</span>
                  <button onClick={() => setExportMessage(null)} className="text-gray-400 flex-shrink-0 mt-0.5">✕</button>
                </div>
              </div>
            )}

            {/* 非安卓端提示 */}
            {!isNative() && (
              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                数据保存在本地，已构建防护但以防万一如需清理浏览器缓存请注意备份数据哦
              </p>
            )}

            {/* 导出 */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">备份导出</p>
              <div className="grid grid-cols-2 gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownload}
                  className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3 rounded-xl font-semibold text-sm flex flex-col items-center gap-0.5"
                >
                  <span>{isNative() ? '📤' : '💾'}</span>
                  <span>{isNative() ? '分享备份' : '下载备份'}</span>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleCopy}
                  className={`py-3 rounded-xl font-semibold text-sm flex flex-col items-center gap-0.5 transition-colors ${
                    copyState === 'ok'
                      ? 'bg-emerald-500 text-white'
                      : copyState === 'err'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
                      : 'bg-primary text-white'
                  }`}
                >
                  <span>{copyState === 'ok' ? '✓' : '📋'}</span>
                  <span>{copyState === 'ok' ? '已复制' : '复制 JSON'}</span>
                </motion.button>
              </div>

              {/* 下载完成后显示可点击蓝链 */}
              {downloadLink && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <span className="text-base">📄</span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={downloadLink.url}
                      download={downloadLink.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-2 truncate block"
                    >
                      {downloadLink.filename}
                    </a>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{downloadLink.size} · 点击打开或另存为</span>
                  </div>
                  <button onClick={() => setDownloadLink(null)} className="text-gray-400 flex-shrink-0 text-sm">✕</button>
                </div>
              )}

              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                背景图与 API Key 不含在备份中。
              </p>
            </div>

            {/* 导入 */}
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">从备份恢复</p>

              {/* 粘贴文本导入 */}
              <textarea
                rows={4}
                placeholder='粘贴备份 JSON 文本（以 {"user":... 开头）'
                value={importJson}
                onChange={e => setImportJson(e.target.value)}
                className="w-full px-3 py-2.5 text-xs border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-800 dark:text-white resize-none focus:outline-none focus:border-primary font-mono"
              />

              {/* 文件上传区 */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-primary hover:text-primary dark:hover:border-primary dark:hover:text-primary transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
              >
                {importJson ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ 文件已加载</span>
                ) : isNative() ? (
                  <span>📁 从文件管理器选择备份文件</span>
                ) : (
                  <span>📁 选择备份文件 <span className="opacity-60">或拖拽</span></span>
                )}
              </motion.button>

              {importJson && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleImportData}
                  disabled={importLoading}
                  className="w-full bg-emerald-500 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-60"
                >
                  {importLoading ? '正在导入…' : '确认导入（会覆盖当前数据）'}
                </motion.button>
              )}

              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                ⚠️ 导入会清空并覆盖当前所有数据，操作前请先导出备份。
              </p>
            </div>

            {/* 重置 */}
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 mb-2">危险区域</p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowResetConfirm(true)}
                className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 py-3 rounded-xl font-semibold text-sm"
              >
                重置所有数据
              </motion.button>
              <p className="text-xs text-red-400 dark:text-red-500 mt-1.5">
                删除全部数据，无法恢复。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 云同步 ───────────────────────────────────────── */}
      <section className="space-y-2">
        <EyebrowLabel className="px-0.5">云同步 · Cloud</EyebrowLabel>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="space-y-4">
            {!cloudEnabled ? (
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  云同步功能未配置。如需启用，请在 <code className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 font-mono text-xs">.env.local</code> 中设置 <code className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-600 font-mono text-xs">VITE_PB_URL</code>。
                </p>
              </div>
            ) : !cloudUser ? (
              <>
                <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    登录后，您在本机的数据可以同步到云端，让多台设备共享同一份成长记录。
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    — 登录仅需邮箱验证码，不需要密码 —
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setShowLoginModal(true)}
                  className="w-full py-3 rounded-lg font-medium text-white"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9, #4f46e5)',
                    boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
                  }}
                >
                  登录云端
                </motion.button>
              </>
            ) : (
              <>
                <div className="p-4 rounded-lg bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-800">
                  <div className="flex items-center gap-3 mb-3">
                    {/* 与个人资料卡保持一致：本地用户头像 */}
                    <div
                      className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center text-xl font-bold text-white flex-shrink-0 ring-2 ring-white/60 dark:ring-white/10"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                    >
                      {user?.avatarDataUrl ? (
                        <img src={user.avatarDataUrl} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        (user?.name || (cloudUser.nickname as string) || (cloudUser.email as string) || '?')[0].toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 dark:text-white truncate">
                        {user?.name || (cloudUser.nickname as string) || '未命名的客人'}
                      </div>
                      {cloudUser.username ? (
                        <button
                          onClick={() => {
                            const uid = cloudUser.username as string;
                            navigator.clipboard?.writeText(uid).catch(() => {});
                            setUserIdCopied(true);
                            setTimeout(() => setUserIdCopied(false), 1500);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 truncate max-w-full"
                          title="点击复制"
                        >
                          <span className="opacity-70">@</span>
                          <span className="font-mono font-semibold truncate">{cloudUser.username as string}</span>
                          <span className="text-[10px] opacity-70">
                            {userIdCopied ? '✓ 已复制' : '· 点击复制'}
                          </span>
                        </button>
                      ) : null}
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        ☁ {cloudUser.email as string}
                      </div>
                    </div>
                    {/* 齿轮：账号管理入口（UserID 未设置时打红点） */}
                    <button
                      onClick={() => setAccountPanelOpen(true)}
                      className="relative w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
                      aria-label="账号管理"
                      title="账号管理"
                    >
                      <span className="text-sm">⚙</span>
                      {!cloudUser.username && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-gray-900" />
                      )}
                    </button>
                  </div>

                  {/* 未设置 UserID 的横幅提示 */}
                  {!cloudUser.username && (
                    <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                      <span className="text-sm leading-none mt-0.5">⚠</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 leading-relaxed">
                          你还没设置 UserID，好友系统无法找到你。
                        </div>
                        <button
                          onClick={() => setAccountPanelOpen(true)}
                          className="mt-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 underline hover:opacity-80"
                        >
                          现在就设一个 →
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 relative">
                    <button
                      onClick={() => setShowPointsBreakdown(v => !v)}
                      className="focus:outline-none"
                      aria-label="查看总点数"
                    >
                      <LVTag level={totalLv} size="md" subdued />
                    </button>
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {syncStatus === 'syncing' ? '同步中…' : lastSyncAt ? `最近同步：${formatRelative(lastSyncAt)}` : '尚未同步'}
                    </span>
                    {showPointsBreakdown && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full mt-2 z-30 w-64 p-3 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="text-[9px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase">总点数</div>
                            <div className="text-xl font-black text-primary tabular-nums leading-tight">
                              {attributes.reduce((sum, a) => sum + (a.points ?? 0), 0)}
                            </div>
                          </div>
                          <button
                            onClick={() => setShowPointsBreakdown(false)}
                            className="w-6 h-6 rounded-md text-gray-400 dark:text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center"
                          >✕</button>
                        </div>
                        <div className="space-y-1 pt-1.5 border-t border-gray-100 dark:border-gray-700">
                          {attributes.map(a => (
                            <div key={a.id} className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-600 dark:text-gray-300 font-medium">{a.displayName}</span>
                              <span className="text-gray-800 dark:text-gray-100 font-bold tabular-nums">
                                {a.points}
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 ml-1">· Lv.{a.level}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {lastCloudError && syncStatus === 'error' && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                    同步失败：{lastCloudError}
                  </div>
                )}

                {/* 同步 / 拉取 两个主按钮一行排列 */}
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    disabled={syncStatus === 'syncing'}
                    onClick={async () => {
                      console.log('[velvet-sync] push clicked');
                      try {
                        await pushAll();
                        console.log('[velvet-sync] push done');
                      } catch (err) {
                        console.error('[velvet-sync] push failed:', err);
                      }
                    }}
                    className="py-2.5 rounded-lg font-medium text-sm text-white disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed, #6d28d9, #4f46e5)',
                      boxShadow: '0 2px 10px rgba(124,58,237,0.25)',
                    }}
                  >
                    {syncStatus === 'syncing' ? '同步中…' : '立即同步到云端'}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    disabled={syncStatus === 'syncing'}
                    onClick={() => setSyncChoiceOpen(true)}
                    className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    ↓ 拉取
                  </motion.button>
                </div>

                <button
                  disabled={syncStatus === 'syncing'}
                  onClick={async () => {
                    try {
                      const diff = await computeSyncDiff();
                      if (diff) {
                        useCloudStore.getState().setDiffWarning(diff);
                      }
                    } catch (err) {
                      console.error('[velvet-sync] diff check failed:', err);
                    }
                  }}
                  className="w-full py-2 rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50 border border-dashed border-gray-200 dark:border-gray-700"
                >
                  检查条目差异（避免误覆盖）
                </button>

                {/* 同步隐私：按类目选择上传哪些数据 */}
                <SyncPrivacyPanel
                  excluded={settings.syncExcludedTables ?? []}
                  syncConfidantsToCloud={settings.syncConfidantsToCloud}
                  syncCloudApiKey={settings.syncCloudApiKey}
                  onChange={(patch) => updateSettings(patch)}
                />

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full py-2.5 rounded-lg font-medium text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  退出登录
                </motion.button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 重置数据确认（ConfirmDialog 基座：tone=danger；取消恒左、危险恒右，自带 exit 动画） */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        tone="danger"
        title="确认重置数据"
        description={'此操作将删除所有用户数据，包括：\n• 所有行为记录\n• 所有成就进度\n• 所有技能解锁\n• 所有属性进度'}
        confirmText="确认重置"
        cancelText="取消"
        onConfirm={handleResetData}
        onCancel={() => setShowResetConfirm(false)}
      >
        <p className="text-center text-sm font-bold text-red-500">此操作无法撤销！</p>
      </ConfirmDialog>

      {/* 云同步登录弹窗 */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        origin="settings"
        onSuccess={async () => {
          try {
            const result = await syncOnLogin();
            if (result === 'conflict') {
              useCloudStore.getState().setConflictPending(true);
            }
          } catch {
            /* already recorded to cloudStore.lastError */
          }
        }}
      />

      {/* 账号管理面板（齿轮入口） */}
      <AccountManagePanel
        isOpen={accountPanelOpen}
        onClose={() => setAccountPanelOpen(false)}
      />

      {/* 从云端拉取确认（会覆盖本机数据；ConfirmDialog 基座） */}
      <ConfirmDialog
        isOpen={syncChoiceOpen}
        tone="danger"
        title="从云端拉取数据？"
        description={'会用云端数据**覆盖本机**。如果本机有未同步的改动，请先点"立即同步到云端"。'}
        confirmText="确认拉取"
        cancelText="取消"
        onConfirm={async () => {
          setSyncChoiceOpen(false);
          console.log('[velvet-sync] pull clicked');
          try {
            await pullAll();
            console.log('[velvet-sync] pull done');
          } catch (err) {
            console.error('[velvet-sync] pull failed:', err);
          }
        }}
        onCancel={() => setSyncChoiceOpen(false)}
      />

      {/* 退出登录确认（ConfirmDialog 基座） */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        tone="danger"
        title="退出登录？"
        description="退出后此设备将停止同步，但本机数据不会被删除。下次登录同一账号可继续。"
        confirmText="确认退出"
        cancelText="取消"
        onConfirm={() => {
          cloudLogout();
          setShowLogoutConfirm(false);
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </motion.div>
  );
};
