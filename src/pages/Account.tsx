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
import type { ReactNode } from 'react';
import { useAppStore } from '@/store';
import { resolveLevelDifficulty } from '@/utils/levelDifficulty';
import { useCloudStore } from '@/store/cloud';
import { BackButton } from '@/components/BackButton';
import { isNative } from '@/utils/native';
import { PageTitle } from '@/components/PageTitle';
import { EyebrowLabel } from '@/components/EyebrowLabel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PagePlane, PlaneLevel } from '@/components/PagePlane';
import { LoginModal } from '@/components/auth/LoginModal';
import { AccountManagePanel } from '@/components/auth/AccountManagePanel';
import { SyncPrivacyPanel } from '@/components/auth/SyncPrivacyPanel';
import { CloudConsentModal } from '@/components/auth/CloudConsentNotice';
import { LVTag } from '@/components/LVTag';
import { computeTotalLv } from '@/utils/lvTiers';
import { logout as cloudLogout } from '@/services/auth';
import { pushAll, pullAll, syncOnLogin, computeSyncDiff } from '@/services/sync';
import { downloadBackup, copyBackupToClipboard, readBackupFile } from '@/services/backup';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower, P4Sparkle } from '@/ui/p4Kit';
import { P3R, P3RPage, GhostWords, SectionMark, SlantButton, P3PageHeader, CodeChip, slantClip } from '@/components/p3r/kit';
import { P5R, P5_FONT, roughQuad, P5Panel, P5Collage, P5Rough, P5Star, P5Sparkle, P5Dots, P5Slab, P5RPage } from '@/components/p5r/kit';

// P3R 备份双钮图标（设计稿：白色软盘 / 蓝色文档，线稿风）
const DiskIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden>
    <path d="M5 4h11l3 3v13H5z" strokeLinejoin="round" />
    <path d="M8 4v5h7V4" strokeLinejoin="round" />
    <rect x="8" y="13" width="8" height="6" strokeLinejoin="round" />
  </svg>
);
const DocIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden>
    <path d="M7 3h7l4 4v14H7z" strokeLinejoin="round" />
    <path d="M14 3v4h4" strokeLinejoin="round" />
    <path d="M10 12h5M10 16h5" strokeLinecap="round" />
  </svg>
);

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
  const isP4 = useUiChannel() === 'p4';
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
  // 免责声明补弹（FS1.2）：声明上线前就登录了的存量用户，进这一页补看一次。
  // 本次会话内可「先不同意」关掉，不阻断任何功能；下次进来再问。
  const [consentDismissed, setConsentDismissed] = useState(false);
  const consentCatchupOpen = cloudEnabled && !!cloudUser && !settings.cloudConsentAt && !consentDismissed;

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

  const p3 = useUiChannel() === 'p3';

  // ── 已登录云面板（p3 / 默认两形态共用内容，外壳各自提供；云端紫为跨主题身份色）──
  const cloudLoggedInJsx = cloudEnabled && cloudUser ? (
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
            <LVTag level={totalLv} size="md" subdued difficulty={resolveLevelDifficulty(settings)} theme={user?.theme} />
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
        syncWishesToCloud={settings.syncWishesToCloud}
        syncNavigatorToCloud={settings.syncNavigatorToCloud}
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
  ) : null;

  // ── 弹窗族（portal 基座，两形态共用）──────────────────────────────────
  const dialogs = (
    <>
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

      {/* 云同步免责声明 · 存量用户补弹 */}
      <CloudConsentModal
        isOpen={consentCatchupOpen}
        onAccept={() => { void updateSettings({ cloudConsentAt: new Date().toISOString() }); }}
        onDecline={() => setConsentDismissed(true)}
      />

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
    </>
  );

  // ── P5R（红频道）形态：P5UI/p5-account-flat-newsprint-v1 1:1；功能逻辑与默认形态完全同源 ──
  if (useUiChannel() === 'p5') {
    // 黑楔节标（左红星 + 白字 + 灰缀）
    const WedgeHead = ({ zh, en }: { zh: string; en: string }) => (
      <div className="relative inline-block" style={{ transform: 'rotate(-1deg)' }}>
        <span aria-hidden className="absolute -inset-[2.5px]" style={{ background: P5R.paper, clipPath: 'polygon(14px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)' }} />
        <span className="relative flex items-center gap-2 py-1.5 pl-5 pr-9" style={{ background: '#050505', clipPath: 'polygon(14px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)' }}>
          <P5Star size={15} fill={P5R.red} className="shrink-0" />
          <span className="text-[17px] font-black leading-none tracking-wide text-white" style={{ fontFamily: P5_FONT }}>{zh}</span>
          <span className="text-[12px] font-black leading-none" style={{ color: P5R.greyLight }}>· {en}</span>
        </span>
      </div>
    );
    // 小黑楔子标（备份导出 / 从备份恢复 / 危险区域）
    const SubWedge = ({ children }: { children: ReactNode }) => (
      <span className="inline-block px-3 py-1 text-[13px] font-black leading-none text-white" style={{ background: '#050505', clipPath: 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', fontFamily: P5_FONT }}>{children}</span>
    );
    // 代码片（黑底白 mono）
    const Code5 = ({ children }: { children: ReactNode }) => (
      <code className="px-1.5 py-0.5 font-mono text-[12px] font-bold text-white" style={{ background: '#050505' }}>{children}</code>
    );
    return (
      <P5RPage className="overflow-hidden">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative pb-10">
          {/* ── 页头：拼贴「账号与数据」+ ACCOUNT 纸条（O=红星）+ 红斜块星群 ── */}
          <header className="relative pt-2">
            <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-6 h-[240px]" style={{ zIndex: -1 }}>
              <P5Slab color={P5R.red} seed={171} rot={-11} style={{ left: -50, top: 40, width: 240, height: 150 }} />
              <P5Slab color={P5R.redDeep} seed={172} rot={16} style={{ right: -70, top: -20, width: 260, height: 180 }} />
              <P5Star size={30} fill={P5R.red} rot={-14} className="absolute" style={{ left: 4, top: 0 }} />
              <P5Star size={22} fill={P5R.red} rot={12} className="absolute" style={{ right: 10, top: 8 }} />
              <P5Star size={18} fill="#050505" rot={20} className="absolute" style={{ right: 60, top: 130 }} />
              <P5Dots className="absolute" style={{ left: 0, top: 130, width: 80, height: 80 }} color="#5c0004" />
            </div>
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage('menu')}
                aria-label="返回"
                className="relative mt-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
              >
                <P5Rough seed={169} jag={3.5} frame={2.5} />
                <span aria-hidden className="relative h-0 w-0 border-y-[7px] border-y-transparent border-r-[11px]" style={{ borderRightColor: '#050505' }} />
              </button>
              <div className="min-w-0">
                <P5Collage
                  size={35}
                  tiles={[
                    { ch: '账', bg: P5R.paper, fg: P5R.red, scale: 1.08, rot: -4, dy: 0 },
                    { ch: '号', bg: P5R.paper, fg: P5R.ink, rot: 3, dy: 8 },
                    { ch: '与', bg: P5R.paper, fg: P5R.ink, scale: 0.82, rot: -2, dy: 4 },
                    { ch: '数', bg: P5R.red, fg: P5R.ink, scale: 1.06, rot: 2.5, dy: 10 },
                    { ch: '据', bg: P5R.paper, fg: P5R.ink, rot: -3, dy: 2 },
                  ]}
                />
                <div className="mt-2 pl-10">
                  <span className="inline-flex select-none items-center gap-0.5 px-3 py-1 text-[15px] font-black tracking-[0.12em]" style={{ background: P5R.paper, color: '#050505', transform: 'rotate(-1.5deg)', boxShadow: '0 0 0 2.5px #050505, 4px 4px 0 #000000', fontFamily: P5_FONT }}>
                    ACC<P5Star size={13} fill={P5R.red} className="mx-0.5" />UNT
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* ── 数据管理 · DATA ── */}
          <section className="relative mt-6" aria-label="数据管理">
            <WedgeHead zh="数据管理" en="DATA" />
            <P5Panel seed={175} jag={9} frame={4} shadow={{ x: 5, y: 6 }} className="mt-2" bodyClassName="space-y-5 px-4 py-5">
              {exportMessage && (
                <div className="relative flex items-start gap-2 px-3.5 py-2.5">
                  <P5Rough seed={176} jag={4.5} frame={2.5} shadow={null} />
                  <span className="relative min-w-0 flex-1 text-[13px] font-bold leading-snug" style={{ color: P5R.ink }}>{exportMessage}</span>
                  <button type="button" onClick={() => setExportMessage(null)} className="relative shrink-0 cursor-pointer text-[13px] font-black" style={{ color: P5R.grey }} aria-label="关闭提示">✕</button>
                </div>
              )}

              {!isNative() && (
                <p className="text-[13.5px] font-black leading-relaxed" style={{ color: P5R.ink }}>
                  数据保存在本地，已构建防护但以防万一如需清理浏览器缓存请注意备份数据哦
                </p>
              )}

              {/* 备份导出 */}
              <div className="space-y-2.5">
                <SubWedge>备份导出</SubWedge>
                <div className="grid grid-cols-2 gap-3">
                  <motion.button
                    type="button"
                    whileTap={{ x: 2, y: 3 }}
                    onClick={handleDownload}
                    className="relative flex cursor-pointer flex-col items-center gap-1.5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                    style={{ color: P5R.ink }}
                  >
                    <P5Rough seed={177} jag={6} frame={3} shadow={{ x: 4, y: 4 }} />
                    <span className="relative"><DiskIcon /></span>
                    <span className="relative text-[15.5px] font-black" style={{ fontFamily: P5_FONT }}>{isNative() ? '分享备份' : '下载备份'}</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ x: 2, y: 3 }}
                    onClick={handleCopy}
                    className="relative flex cursor-pointer flex-col items-center gap-1.5 py-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                  >
                    <P5Rough seed={178} jag={6} frame={3} face={copyState === 'ok' ? '#050505' : P5R.red} shadow={{ x: 4, y: 4 }} />
                    <span className="relative"><DocIcon /></span>
                    <span className="relative text-[15.5px] font-black" style={{ fontFamily: P5_FONT }}>{copyState === 'ok' ? '已复制' : copyState === 'err' ? '复制失败' : '复制 JSON'}</span>
                  </motion.button>
                </div>

                {downloadLink && (
                  <div className="relative flex items-center gap-2.5 px-3.5 py-2.5">
                    <P5Rough seed={179} jag={4.5} frame={2.5} shadow={null} />
                    <div className="relative min-w-0 flex-1">
                      <a
                        href={downloadLink.url}
                        download={downloadLink.filename}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[13px] font-black underline underline-offset-2"
                        style={{ color: P5R.red }}
                      >
                        {downloadLink.filename}
                      </a>
                      <span className="text-[11px] font-bold" style={{ color: P5R.grey }}>{downloadLink.size} · 点击打开或另存为</span>
                    </div>
                    <button type="button" onClick={() => setDownloadLink(null)} className="relative shrink-0 cursor-pointer text-[13px] font-black" style={{ color: P5R.grey }} aria-label="关闭下载提示">✕</button>
                  </div>
                )}

                <p className="text-[12px] font-bold" style={{ color: P5R.grey }}>背景图与 API Key 不会在备份中。</p>
              </div>

              {/* 从备份恢复 */}
              <div className="space-y-2.5 pt-1">
                <SubWedge>从备份恢复</SubWedge>
                <div className="relative">
                  <P5Rough seed={183} jag={5.5} frame={3} shadow={null} />
                  <textarea
                    rows={5}
                    placeholder='粘贴备份 JSON 文本（以 {"user":.... 开头）'
                    value={importJson}
                    onChange={e => setImportJson(e.target.value)}
                    className="relative w-full resize-none bg-transparent px-4 py-3 font-mono text-[12px] focus:outline-none"
                    style={{ color: P5R.ink }}
                  />
                  <span aria-hidden className="pointer-events-none absolute bottom-[4px] right-[4px] h-8 w-8" style={{ background: P5R.red, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
                />
                <motion.button
                  type="button"
                  whileTap={{ x: 2, y: 3 }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
                  className="relative flex w-full cursor-pointer items-center justify-center gap-2.5 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                >
                  <P5Rough seed={184} jag={6} frame={3} shadow={{ x: 4, y: 4 }} />
                  <svg viewBox="0 0 24 24" className="relative h-5 w-5 shrink-0" fill="#050505" aria-hidden>
                    <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h5l2 2.5h9A1.5 1.5 0 0 1 21 8v10a1.5 1.5 0 0 1-1.5 1.5h-16A1.5 1.5 0 0 1 2 18V5.5z" />
                  </svg>
                  <span className="relative text-[15px] font-black" style={{ color: importJson ? P5R.red : P5R.ink, fontFamily: P5_FONT }}>
                    {importJson ? '✓ 文件已加载' : isNative() ? '从文件管理器选择备份文件' : '选择备份文件'}
                  </span>
                  {!importJson && !isNative() && <span className="relative text-[13px] font-bold" style={{ color: P5R.grey }}>或拖拽</span>}
                </motion.button>

                {importJson && (
                  <motion.button
                    type="button"
                    whileTap={{ x: 2, y: 3 }}
                    onClick={handleImportData}
                    disabled={importLoading}
                    className="relative w-full cursor-pointer py-3.5 text-[16px] font-black tracking-wider text-white disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                    style={{ fontFamily: P5_FONT }}
                  >
                    <P5Rough seed={185} jag={6.5} frame={3} face={importLoading ? P5R.grey : P5R.red} shadow={{ x: 4, y: 4 }} />
                    <span className="relative">{importLoading ? '正在导入…' : '确认导入（会覆盖当前数据）'}</span>
                  </motion.button>
                )}

                <p className="flex items-start gap-1.5 text-[12.5px] font-black leading-relaxed" style={{ color: P5R.redHot }}>
                  <span aria-hidden>⚠</span>
                  <span>导入会清空并覆盖当前所有数据，操作前请先导出备份。</span>
                </p>
              </div>

              {/* 危险区域 */}
              <div className="space-y-2.5 pt-1">
                <SubWedge>危险区域</SubWedge>
                <motion.button
                  type="button"
                  whileTap={{ x: 2, y: 3 }}
                  onClick={() => setShowResetConfirm(true)}
                  className="relative block w-full cursor-pointer py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                >
                  <P5Rough seed={186} jag={7.5} frame={3} face={P5R.red} shadow={{ x: 5, y: 5 }} />
                  {/* 右端黑色半调渐入（设计稿签名件；裁进面层形内） */}
                  <span aria-hidden className="pointer-events-none absolute inset-[3px]" style={{ clipPath: roughQuad(186.47, 5) }}>
                    <P5Dots className="absolute inset-y-0 right-0 w-[86px]" color="#050505" dot={2.2} gap={9} />
                  </span>
                  <span className="relative flex items-center justify-center gap-3">
                    <P5Star size={24} fill="#f8f8f6" />
                    <span className="text-[19px] font-black tracking-wider text-white" style={{ fontFamily: P5_FONT }}>重置所有数据</span>
                  </span>
                </motion.button>
                <p className="text-[12.5px] font-black" style={{ color: P5R.redHot }}>删除全部数据，无法恢复。</p>
              </div>
            </P5Panel>
          </section>

          {/* ── 云同步 · CLOUD ── */}
          <section className="relative mt-7" aria-label="云同步">
            <WedgeHead zh="云同步" en="CLOUD" />
            <P5Panel seed={181} jag={9} frame={4} shadow={{ x: 5, y: 6 }} className="mt-2" bodyClassName="px-4 py-4">
              {!cloudEnabled ? (
                <div className="relative flex items-center gap-3.5 px-3.5 py-3.5">
                  <P5Rough seed={187} jag={5} frame={3} shadow={null} />
                  {/* 云朵 + 红箭头图标 */}
                  <svg viewBox="0 0 48 48" className="relative h-11 w-11 shrink-0" aria-hidden>
                    <path d="M14 34a9 9 0 0 1-1.4-17.9A12 12 0 0 1 36 19a8 8 0 0 1-1 15.9H14z" fill="#050505" />
                    <path d="M24 38 V27 M24 27 l-5 5.5 M24 27 l5 5.5" stroke={P5R.red} strokeWidth="4.5" strokeLinecap="square" fill="none" />
                  </svg>
                  <p className="relative min-w-0 flex-1 text-[13.5px] font-black leading-relaxed" style={{ color: P5R.ink }}>
                    云同步功能未配置。如需启用，请在 <Code5>.env.local</Code5> 中设置 <Code5>VITE_PB_URL</Code5>。
                  </p>
                </div>
              ) : !cloudUser ? (
                <div className="space-y-3">
                  <div className="relative px-3.5 py-3.5">
                    <P5Rough seed={188} jag={5} frame={3} shadow={null} />
                    <p className="relative text-[13.5px] font-black leading-relaxed" style={{ color: P5R.ink }}>
                      登录后，您在本机的数据可以同步到云端，让多台设备共享同一份成长记录。
                    </p>
                    <p className="relative mt-2 text-[12px] font-bold" style={{ color: P5R.grey }}>— 登录仅需邮箱验证码，不需要密码 —</p>
                  </div>
                  <motion.button
                    type="button"
                    whileTap={{ x: 2, y: 3 }}
                    onClick={() => setShowLoginModal(true)}
                    className="relative w-full cursor-pointer py-3.5 text-[16px] font-black tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                    style={{ fontFamily: P5_FONT }}
                  >
                    <P5Rough seed={189} jag={6.5} frame={3} face={P5R.red} shadow={{ x: 4, y: 4 }} />
                    <span className="relative">登录云端</span>
                  </motion.button>
                </div>
              ) : (
                <div className="space-y-4">{cloudLoggedInJsx}</div>
              )}
            </P5Panel>
            {/* 底部角饰 */}
            <div aria-hidden className="relative mt-4 h-10">
              <P5Sparkle size={16} color={P5R.red} className="absolute left-2 top-0" />
              <P5Star size={20} fill="#3a3831" rot={14} className="absolute right-6 top-1" />
            </div>
          </section>

          {dialogs}
        </motion.div>
      </P5RPage>
    );
  }

  // ── P3R（蓝频道）形态：p3-account-reference-v2 1:1；功能逻辑与默认形态完全同源 ──
  if (p3) {
    return (
      <P3RPage>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative pb-10">
          <GhostWords words={['DATA']} className="right-[8px] top-[-6px] text-right text-[72px]" />

          <P3PageHeader lead title="账号与数据" onBack={() => setCurrentPage('menu')} className="relative pt-3" />

          {/* ── 数据管理 · DATA ── */}
          <section className="relative mt-7 space-y-4" aria-label="数据管理">
            <SectionMark variant="blue" title={<>数据管理 <span className="text-[15px]">· DATA</span></>} />

            {exportMessage && (
              <div className="flex items-start gap-2 px-4 py-3" style={{ clipPath: slantClip(10), background: P3R.panel }}>
                <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug" style={{ color: P3R.ink }}>{exportMessage}</span>
                <button type="button" onClick={() => setExportMessage(null)} className="shrink-0 text-[13px] font-black" style={{ color: P3R.grey }} aria-label="关闭提示">✕</button>
              </div>
            )}

            {!isNative() && (
              <p className="px-1 text-[13px] font-semibold leading-relaxed" style={{ color: P3R.ink }}>
                数据保存在本地，已构建防护但以防万一如需清理浏览器缓存请注意备份数据哦
              </p>
            )}

            {/* 备份导出（设计稿：蓝实心 + 浅青 双高钮，图标在上） */}
            <div className="space-y-2.5">
              <p className="text-[14px] font-black" style={{ color: P3R.blue }}>备份导出</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex flex-col items-center gap-1.5 py-4 text-white active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff] focus-visible:ring-offset-2"
                  style={{ clipPath: slantClip(12), background: P3R.blue }}
                >
                  <DiskIcon />
                  <span className="text-[16px] font-black">{isNative() ? '分享备份' : '下载备份'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex flex-col items-center gap-1.5 py-4 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                  style={{
                    clipPath: slantClip(12),
                    background: copyState === 'ok' ? P3R.cyan : '#bfe9f5',
                    color: copyState === 'ok' ? '#fff' : P3R.blueDeep,
                  }}
                >
                  <DocIcon />
                  <span className="text-[16px] font-black">{copyState === 'ok' ? '已复制' : copyState === 'err' ? '复制失败' : '复制 JSON'}</span>
                </button>
              </div>

              {downloadLink && (
                <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ clipPath: slantClip(10), background: P3R.cyanFaint }}>
                  <div className="min-w-0 flex-1">
                    <a
                      href={downloadLink.url}
                      download={downloadLink.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[13px] font-black underline underline-offset-2"
                      style={{ color: P3R.blue }}
                    >
                      {downloadLink.filename}
                    </a>
                    <span className="text-[11px] font-semibold" style={{ color: P3R.inkSoft }}>{downloadLink.size} · 点击打开或另存为</span>
                  </div>
                  <button type="button" onClick={() => setDownloadLink(null)} className="shrink-0 text-[13px] font-black" style={{ color: P3R.grey }} aria-label="关闭下载提示">✕</button>
                </div>
              )}

              <p className="text-[12px] font-semibold" style={{ color: P3R.grey }}>背景图与 API Key 不会在备份中。</p>
            </div>

            {/* 从备份恢复（白斜 textarea + 右下青斜纹角 + 浅青文件条） */}
            <div className="space-y-2.5 pt-2">
              <p className="text-[14px] font-black" style={{ color: P3R.blue }}>从备份恢复</p>
              <div className="relative" style={{ clipPath: slantClip(14), background: P3R.panel }}>
                <textarea
                  rows={5}
                  placeholder='粘贴备份 JSON 文本（以 {"user":... 开头）'
                  value={importJson}
                  onChange={e => setImportJson(e.target.value)}
                  className="w-full resize-none bg-transparent px-5 py-4 font-mono text-[12px] focus:outline-none"
                  style={{ color: P3R.ink }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute bottom-0 right-0 h-11 w-11"
                  style={{
                    background: `repeating-linear-gradient(45deg, ${P3R.cyan} 0 5px, rgba(53,209,232,0.12) 5px 11px)`,
                    clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
                  }}
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelect(f); }}
                className="flex w-full items-center justify-center gap-2.5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                style={{ clipPath: slantClip(12), background: P3R.cyanPale }}
              >
                <span aria-hidden className="h-0 w-0 border-y-[7px] border-y-transparent border-l-[12px]" style={{ borderLeftColor: P3R.blue }} />
                <span className="text-[15px] font-black" style={{ color: importJson ? P3R.blueDeep : P3R.ink }}>
                  {importJson ? '✓ 文件已加载' : isNative() ? '从文件管理器选择备份文件' : '选择备份文件'}
                </span>
                {!importJson && !isNative() && <span className="text-[13px] font-semibold" style={{ color: P3R.grey }}>或拖拽</span>}
              </button>

              {importJson && (
                <SlantButton tone="primary" onClick={handleImportData} className="w-full" style={importLoading ? { opacity: 0.6 } : undefined}>
                  {importLoading ? '正在导入…' : '确认导入（会覆盖当前数据）'}
                </SlantButton>
              )}

              <p className="flex items-start gap-1.5 text-[12px] font-bold leading-relaxed" style={{ color: '#e08a00' }}>
                <span aria-hidden>⚠</span>
                <span>导入会清空并覆盖当前所有数据，操作前请先导出备份。</span>
              </p>
            </div>

            {/* 危险区域（洋红实心大钮） */}
            <div className="space-y-2.5 pt-2">
              <p className="text-[15px] font-black italic" style={{ color: P3R.blue }}>危险区域</p>
              <SlantButton tone="danger" onClick={() => setShowResetConfirm(true)} className="w-full text-[17px]" style={{ paddingTop: 14, paddingBottom: 14 }}>
                重置所有数据
              </SlantButton>
              <p className="text-[12px] font-bold" style={{ color: P3R.magenta }}>删除全部数据，无法恢复。</p>
            </div>
          </section>

          {/* ── 云同步 · CLOUD ── */}
          <section className="relative mt-8 space-y-4" aria-label="云同步">
            <SectionMark variant="blue" title={<>云同步 <span className="text-[15px]">· CLOUD</span></>} />
            {!cloudEnabled ? (
              <div className="px-5 py-4" style={{ clipPath: slantClip(12), background: P3R.cyanFaint }}>
                <p className="text-[13px] font-semibold leading-relaxed" style={{ color: P3R.ink }}>
                  云同步功能未配置。如需启用，请在 <CodeChip>.env.local</CodeChip> 中设置 <CodeChip tone="cyan">VITE_PB_URL</CodeChip>。
                </p>
              </div>
            ) : !cloudUser ? (
              <div className="space-y-3">
                <div className="px-5 py-4" style={{ clipPath: slantClip(12), background: P3R.panel }}>
                  <p className="text-[13px] font-semibold leading-relaxed" style={{ color: P3R.ink }}>
                    登录后，您在本机的数据可以同步到云端，让多台设备共享同一份成长记录。
                  </p>
                  <p className="mt-2 text-[12px] font-semibold" style={{ color: P3R.grey }}>— 登录仅需邮箱验证码，不需要密码 —</p>
                </div>
                <SlantButton tone="primary" onClick={() => setShowLoginModal(true)} className="w-full">登录云端</SlantButton>
              </div>
            ) : (
              <div className="p-4" style={{ clipPath: slantClip(16), background: P3R.panel }}>
                <div className="space-y-4">{cloudLoggedInJsx}</div>
              </div>
            )}

            {/* 底部幽灵字 */}
            <div aria-hidden className="relative h-16">
              <GhostWords words={['CLOUD']} className="left-[6px] top-[-4px] text-[68px]" />
            </div>
          </section>

          {dialogs}
        </motion.div>
      </P3RPage>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 斜轴世界（§2 规则1）：内容平面随世界倾斜，卡片成平行四边形；各卡内容 + 眉标
          包 PlaneLevel 反制回水平（"世界斜、字不斜"）。ConfirmDialog 走 portal 基座、
          在平面之外，不受倾斜影响。聚焦输入框时整页 :focus-within 自动校直。 */}
      <PagePlane className={`space-y-4 ${isP4 ? 'p4-reskin' : ''}`}>
      {/* 顶部标题 + 返回按钮（与其他子页保持一致的视觉）。
          P4（p4-account-reference-v2）：衬线特大标题 + Account 手写橙角标。 */}
      {isP4 ? (
        <PlaneLevel className="flex items-start gap-2">
          <BackButton onClick={() => setCurrentPage('menu')} className="mt-3 -ml-1" />
          <div>
            <h1
              className="text-[42px] font-black leading-[1.05] tracking-tight text-[#131313]"
              style={{ fontFamily: 'var(--p4-display-font, serif)' }}
            >
              账号与数据
            </h1>
            <div
              className="-mt-1 pl-6 text-[22px] font-bold italic leading-none text-[var(--p4-orange,#f9a11b)]"
              style={{ fontFamily: "'Caveat', 'Segoe Script', cursive" }}
            >
              Account
            </div>
          </div>
        </PlaneLevel>
      ) : (
      <PlaneLevel className="flex items-start justify-between gap-3">
        <BackButton onClick={() => setCurrentPage('menu')} className="mt-1 -ml-1" />
        <div className="flex-1">
          <PageTitle title="账号与数据" en="Account" />
        </div>
      </PlaneLevel>
      )}

      {/* ── 数据管理 ─────────────────────────────────────── */}
      <section className="space-y-2">
        <EyebrowLabel className="sl-level px-0.5">数据管理 · Data</EyebrowLabel>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="sl-level space-y-5">
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
                {isP4 ? (
                  /* p4-account-reference-v2：下载备份=黑斜板黄花黄字 / 复制 JSON=蓝斜板白星白字 */
                  <>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleDownload}
                      className="py-3.5 text-sm font-black"
                      style={{ background: '#131313', color: 'var(--ui-bg)', borderRadius: 16, transform: 'skewX(-6deg)', boxShadow: '0 3px 0 rgba(19,19,19,0.3)' }}
                    >
                      <span className="flex items-center justify-center gap-2" style={{ transform: 'skewX(6deg)' }}>
                        <P4Flower size={18} color="var(--ui-bg)" />
                        {isNative() ? '分享备份' : '下载备份'}
                      </span>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={handleCopy}
                      className="py-3.5 text-sm font-black text-white"
                      style={{
                        background: copyState === 'ok' ? 'var(--p4-green, #55c34f)' : copyState === 'err' ? 'var(--ui-danger)' : 'var(--ui-accent)',
                        borderRadius: 16,
                        transform: 'skewX(-6deg)',
                        boxShadow: '0 3px 0 rgba(19,19,19,0.25)',
                      }}
                    >
                      <span className="flex items-center justify-center gap-2" style={{ transform: 'skewX(6deg)' }}>
                        <P4Sparkle size={15} color="#ffffff" />
                        {copyState === 'ok' ? '已复制' : '复制 JSON'}
                      </span>
                    </motion.button>
                  </>
                ) : (
                <>
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
                </>
                )}
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
              {isP4 ? (
                /* p4-account-reference-v2：红色斜板 + 奶油花 + 白星角 */
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowResetConfirm(true)}
                  className="relative w-full py-3.5 text-[15px] font-black text-white"
                  style={{ background: 'var(--ui-danger)', borderRadius: 16, transform: 'skewX(-6deg)', boxShadow: '0 3px 0 rgba(19,19,19,0.25)' }}
                >
                  <span className="flex items-center justify-center gap-2.5" style={{ transform: 'skewX(6deg)' }}>
                    <P4Flower size={18} color="#fff6d0" />
                    重置所有数据
                  </span>
                  <P4Sparkle size={16} color="#fff6d0" className="absolute -top-1.5 right-3" />
                </motion.button>
              ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowResetConfirm(true)}
                className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 py-3 rounded-xl font-semibold text-sm"
              >
                重置所有数据
              </motion.button>
              )}
              <p className="text-xs text-red-400 dark:text-red-500 mt-1.5">
                删除全部数据，无法恢复。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 云同步 ───────────────────────────────────────── */}
      <section className="space-y-2">
        <EyebrowLabel className="sl-level px-0.5">云同步 · Cloud</EyebrowLabel>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-5">
          <div className="sl-level space-y-4">
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
              cloudLoggedInJsx
            )}
          </div>
        </div>
      </section>
      </PagePlane>

      {dialogs}
    </motion.div>
  );
};
