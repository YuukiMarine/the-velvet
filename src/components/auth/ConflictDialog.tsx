import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { computeSyncDiff } from '@/services/sync';
import type { SyncDiff } from '@/services/sync';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';

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

  const localUserName = useAppStore(s => s.user?.name ?? '').toString();
  const cloudUser = useCloudStore(s => s.cloudUser);
  const cloudNickname =
    (cloudUser?.nickname as string | undefined) ||
    (cloudUser?.username as string | undefined) ||
    (cloudUser?.email as string | undefined) ||
    '云端档案';

  // 打开时加载对比数据
  useEffect(() => {
    if (!isOpen) return;
    setDiff(null);
    setError('');
    setLoadingDiff(true);
    computeSyncDiff()
      .then(d => setDiff(d))
      .catch(err => {
        console.warn('[ConflictDialog] computeSyncDiff failed', err);
      })
      .finally(() => setLoadingDiff(false));
  }, [isOpen]);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
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
                <ChoiceButton
                  disabled={busy !== null}
                  loading={busy === 'local'}
                  onClick={() => handle('local')}
                  title="保留本机档案"
                  subtitle="上传覆盖云端（云端数据将被本机替换）"
                  tone="violet"
                />
                <ChoiceButton
                  disabled={busy !== null}
                  loading={busy === 'cloud'}
                  onClick={() => handle('cloud')}
                  title="保留云端档案"
                  subtitle="下载覆盖本机（本机数据将被云端替换）"
                  tone="indigo"
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
    </AnimatePresence>
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
                {loading ? '…' : n ?? 0}
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
  title,
  subtitle,
  tone,
}: {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  tone: 'violet' | 'indigo';
}) => {
  const bg =
    tone === 'violet'
      ? 'linear-gradient(135deg, #7c3aed, #6d28d9)'
      : 'linear-gradient(135deg, #4f46e5, #4338ca)';
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      whileTap={{ scale: disabled ? 1 : 0.99 }}
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-lg overflow-hidden text-left disabled:opacity-50"
      style={{ background: bg, boxShadow: '0 4px 18px rgba(124,58,237,0.25)' }}
    >
      <div className="px-4 py-3">
        <div className="text-sm font-medium text-white">
          {loading ? '处理中…' : title}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
          {subtitle}
        </div>
      </div>
    </motion.button>
  );
};
