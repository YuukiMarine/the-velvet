import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { computeSyncDiff } from '@/services/sync';
import type { SyncDiff } from '@/services/sync';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { DownloadIcon, UploadIcon } from '@/components/icons';

interface Props {
  isOpen: boolean;
  onKeepLocal: () => Promise<void> | void;
  onKeepCloud: () => Promise<void> | void;
  onClose: () => void;
}

type Choice = 'local' | 'cloud' | null;

/** 要在对比里展示的几张表（选择最有辨识度的几张，避免一屏塞满） */
const HIGHLIGHT_TABLES: Array<{ key: string; label: string }> = [
  { key: 'activities', label: '活动' },
  { key: 'todos', label: '任务' },
  { key: 'confidants', label: '同伴' },
  { key: 'summaries', label: '总结' },
  { key: 'dailyDivinations', label: '每日塔罗' },
  { key: 'longReadings', label: '中长期占卜' },
];

export const ConflictDialog = ({ isOpen, onKeepLocal, onKeepCloud, onClose }: Props) => {
  const [busy, setBusy] = useState<Choice>(null);
  const [error, setError] = useState('');

  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  /** 对账读数失败（含 SDK autocancel / 离线 / 权限）；与 diff=null 一起决定是否显示"—" */
  const [diffError, setDiffError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const localUserName = useAppStore(s => s.user?.name ?? '').toString();
  const cloudUser = useCloudStore(s => s.cloudUser);
  const cloudNickname =
    (cloudUser?.nickname as string | undefined) ||
    (cloudUser?.username as string | undefined) ||
    (cloudUser?.email as string | undefined) ||
    '云端档案';

  // 打开时加载对比数据。
  //
  // ⚠️ 失败必须显式记账（v2.7.0.4）：这里原来只 console.warn，diff 保持 null，
  // 而下面的呈现层是 `n ?? 0` —— 于是"读不到"被渲染成一排理直气壮的 **0**，
  // 用户看到「本机 0 条」很可能就选"保留云端"，把新设备上刚写的数据一把抹掉。
  // 现在读不到就是读不到：数字显示 "—"、顶上挂红字警示、给一颗重试。
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    setDiff(null);
    setError('');
    setDiffError(false);
    setLoadingDiff(true);
    computeSyncDiff()
      .then(d => {
        if (!alive) return;
        setDiff(d);
        // computeSyncDiff 也会**正常返回 null**（未登录 / 拿不到 userId），
        // 同样是"没读到数"，一起走失败态
        if (!d) setDiffError(true);
      })
      .catch(err => {
        console.warn('[ConflictDialog] computeSyncDiff failed', err);
        if (alive) setDiffError(true);
      })
      .finally(() => { if (alive) setLoadingDiff(false); });
    return () => { alive = false; };
  }, [isOpen, reloadKey]);

  const handle = async (choice: 'local' | 'cloud') => {
    setError('');
    setBusy(choice);
    try {
      if (choice === 'local') await onKeepLocal();
      else await onKeepCloud();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败，请稍后重试');
    } finally {
      setBusy(null);
    }
  };

  const tablesForDisplay =
    diff?.tables.filter(t => HIGHLIGHT_TABLES.some(h => h.key === t.key)) ?? [];

  const byKey = (key: string) => tablesForDisplay.find(t => t.key === key);

  // portal 到 body：脱离 App.tsx `relative z-10` stacking context（见 zIndex.ts 头注释）。
  // createPortal 必须包在 AnimatePresence 外侧，否则 exit 失效（参考 ConfirmDialog）。
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // z-[160]：system 段（见 zIndex.ts），值沿用
          className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
            style={{
              background: 'linear-gradient(180deg, #1a1a3e 0%, #0f0f2e 100%)',
              border: '1px solid rgba(196, 181, 253, 0.25)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 40px rgba(124,58,237,0.25)',
            }}
          >
            <div className="px-7 pt-7 pb-2 text-center">
              <div
                className="text-[11px] tracking-[0.5em] font-semibold mb-2"
                style={{ color: '#fbbf24' }}
              >
                ATTENTION, GUEST
              </div>
              <h2 className="text-xl font-serif" style={{ color: '#f5e6ff' }}>
                两个房间的档案
              </h2>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: '#a89dc0' }}>
                本机与云端都有档案。看一眼两边的大致情况，选择保留哪一份
              </p>
            </div>

            <div
              className="mx-7 my-4 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(196,181,253,0.4), transparent)',
              }}
            />

            {/* 两栏对比 */}
            <div className="px-7">
              <div className="grid grid-cols-2 gap-2">
                <SideColumn
                  title="本机"
                  name={localUserName || '（未命名）'}
                  tables={HIGHLIGHT_TABLES}
                  total={diff?.localTotal}
                  latest={diff?.localLatest}
                  loading={loadingDiff}
                  pickCount={(key) => byKey(key)?.localCount}
                  winnerKey={(key) => {
                    const t = byKey(key);
                    if (!t) return null;
                    if (t.localCount > t.cloudCount) return 'self';
                    if (t.localCount < t.cloudCount) return 'other';
                    return 'tie';
                  }}
                  tone="violet"
                />
                <SideColumn
                  title="云端"
                  name={cloudNickname}
                  tables={HIGHLIGHT_TABLES}
                  total={diff?.cloudTotal}
                  latest={diff?.cloudLatest}
                  loading={loadingDiff}
                  pickCount={(key) => byKey(key)?.cloudCount}
                  winnerKey={(key) => {
                    const t = byKey(key);
                    if (!t) return null;
                    if (t.cloudCount > t.localCount) return 'self';
                    if (t.cloudCount < t.localCount) return 'other';
                    return 'tie';
                  }}
                  tone="indigo"
                />
              </div>

              {/* 读数失败：明说读不到，并把重试放在手边。绝不拿 0 冒充"读到了" */}
              {diffError && !loadingDiff && (
                <div
                  className="mt-3 rounded-lg px-3 py-2 text-[11px] leading-relaxed"
                  style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', color: '#fca5a5' }}
                >
                  没能读到两侧的条目数（网络或登录态问题）。上面的「—」表示
                  <strong style={{ color: '#fecaca' }}>未知</strong>，不是 0；
                  在读到数字之前，请不要凭这一屏做覆盖决定。
                  <button
                    onClick={() => setReloadKey(k => k + 1)}
                    className="ml-1 underline underline-offset-2"
                    style={{ color: '#fecaca' }}
                  >
                    重试
                  </button>
                </div>
              )}

              {diff?.recommend && diff.recommend !== 'skip' && (
                <p
                  className="mt-3 text-[11px] text-center leading-relaxed"
                  style={{ color: '#86efac' }}
                >
                  建议：总条目数看上去
                  {diff.recommend === 'push' ? '本机更多' : '云端更多'}
                  ，如果不确定，优先选
                  {diff.recommend === 'push' ? '「保留本机」' : '「保留云端」'}
                </p>
              )}
            </div>

            <div className="px-7 pt-4 pb-6 text-sm leading-relaxed" style={{ color: '#c8c2e0' }}>
              <p className="text-[11px]" style={{ color: '#8b84a8' }}>
                被覆盖的一侧将永久消失，无法恢复。
                若想保险一点，可先到"设置 → 数据管理"导出本机备份。
              </p>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-xs"
                  style={{ color: '#fca5a5' }}
                >
                  {error}
                </motion.p>
              )}

              <div className="mt-5 space-y-3">
                {/* 文案改成"谁动、往哪动"的一句话（用户口径：原来的"X 覆盖 Y"绕）。
                    下载在上、上传在下（与 SyncDiffDialog 同序）；两颗钮同色系
                    **不同深浅** + 方向箭头图标——文案长得像，箭头是最快分辨方向的那一眼 */}
                <ChoiceButton
                  disabled={busy !== null}
                  loading={busy === 'cloud'}
                  onClick={() => handle('cloud')}
                  icon={<DownloadIcon className="h-[18px] w-[18px]" />}
                  title="从云端下载并覆盖"
                  subtitle="保留云端档案 · 本机现有数据会被替换"
                  tone="deep"
                />
                <ChoiceButton
                  disabled={busy !== null}
                  loading={busy === 'local'}
                  onClick={() => handle('local')}
                  icon={<UploadIcon className="h-[18px] w-[18px]" />}
                  title="上传本地数据覆盖云端"
                  subtitle="保留本机档案 · 云端现有数据会被替换"
                  tone="light"
                />
              </div>

              <div className="mt-4 text-center">
                <button
                  onClick={onClose}
                  disabled={busy !== null}
                  className="text-xs hover:opacity-80 disabled:opacity-40 transition-opacity"
                  style={{ color: '#6b7ca8' }}
                >
                  稍后再决定
                </button>
              </div>
            </div>

            <div
              className="pb-5 pt-1 text-center text-[10px] tracking-[0.3em]"
              style={{ color: '#4c4878' }}
            >
              —— THE VELVET ——
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

// ── Side column ─────────────────────────────────────────

function SideColumn({
  title,
  name,
  tables,
  total,
  latest,
  loading,
  pickCount,
  winnerKey,
  tone,
}: {
  title: string;
  name: string;
  tables: Array<{ key: string; label: string }>;
  total?: number;
  latest?: Date | null;
  loading: boolean;
  pickCount: (key: string) => number | undefined;
  winnerKey: (key: string) => 'self' | 'other' | 'tie' | null;
  tone: 'violet' | 'indigo';
}) {
  const accent = tone === 'violet' ? '#a78bfa' : '#818cf8';
  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{
        background: `linear-gradient(180deg, ${accent}15, ${accent}05)`,
        border: `1px solid ${accent}50`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: accent }}>
          {title}
        </span>
      </div>
      <div
        className="text-sm font-bold truncate"
        style={{ color: '#f5e6ff' }}
        title={name}
      >
        {name}
      </div>
      <div className="text-[10px]" style={{ color: '#a89dc0' }}>
        {loading ? '读取中…' : `合计 ${total ?? '—'} 条`}
      </div>
      <div className="text-[10px]" style={{ color: '#a89dc0' }}>
        最近活动：{formatLatest(latest)}
      </div>
      <div
        className="mt-1.5 pt-2 space-y-1 border-t"
        style={{ borderColor: `${accent}30` }}
      >
        {tables.map(t => {
          const n = pickCount(t.key);
          const w = winnerKey(t.key);
          return (
            <div key={t.key} className="flex items-center justify-between text-[11px]">
              <span style={{ color: '#a89dc0' }}>{t.label}</span>
              <span
                className="tabular-nums"
                style={{
                  color:
                    w === 'self' ? '#86efac'
                    : w === 'other' ? '#8b84a8'
                    : '#f5e6ff',
                  fontWeight: w === 'self' ? 700 : 400,
                }}
              >
                {/* n === undefined = 没读到，显示 — 而非 0（见上方 useEffect 注释：
                    伪造的 0 会诱导用户按"对面更多"去覆盖，直接丢数据） */}
                {loading ? '…' : n ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatLatest(d: Date | null | undefined): string {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  const diff = Date.now() - dt.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const ChoiceButton = ({
  disabled,
  loading,
  onClick,
  icon,
  title,
  subtitle,
  tone,
}: {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  icon?: ReactNode;
  title: string;
  subtitle: string;
  tone: 'light' | 'deep';
}) => {
  // 同一紫色系的两档深浅（原来是紫/靛两种色相，深浅几乎一样，两颗钮看着像同一颗）。
  // 浅档配深紫墨字、深档配纸白字——不这么翻，白字压在浅紫上只有 2:1 对比度。
  const bg =
    tone === 'light'
      ? 'linear-gradient(135deg, #c4b5fd, #a78bfa)'
      : 'linear-gradient(135deg, #4c1d95, #35146b)';
  const ink = tone === 'light' ? '#2e1065' : '#ffffff';
  const subInk = tone === 'light' ? 'rgba(46,16,101,0.72)' : 'rgba(255,255,255,0.72)';
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      whileTap={{ scale: disabled ? 1 : 0.99 }}
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-lg overflow-hidden text-left disabled:opacity-50"
      style={{ background: bg, boxShadow: '0 4px 18px rgba(124,58,237,0.25)' }}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        {icon && (
          <span className="shrink-0" style={{ color: ink }} aria-hidden>
            {icon}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-sm font-bold" style={{ color: ink }}>
            {loading ? '处理中…' : title}
          </span>
          <span className="block text-[11px] mt-0.5" style={{ color: subInk }}>
            {subtitle}
          </span>
        </span>
      </div>
    </motion.button>
  );
};
