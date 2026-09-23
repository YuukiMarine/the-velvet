/**
 * ImagesBackupBlock — 记录配图的「图片包」导出 / 导入（v2.7.0.6）。
 *
 * 与主备份分开的一份文件（用户口径：叠进主备份的大段 base64 会拖慢重新导入）。
 * 顺序：先导主备份恢复记录，再导图片包——图片按记录 id 挂回去，找不到记录的会被跳过。
 * 三个频道的账号页共用这一块，只做最轻的皮。
 */
import { useRef, useState, useEffect } from 'react';
import { downloadImagesBackup, readBackupFile } from '@/services/backup';
import { importImagesBundle, estimateImagesBundleBytes } from '@/utils/activityImages';
import { useUiChannel } from '@/ui/useUiChannel';
import { isNative } from '@/utils/native';

const fmtBytes = (n: number) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function ImagesBackupBlock() {
  const ch = useUiChannel();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stat, setStat] = useState<{ count: number; bytes: number } | null>(null);
  const [link, setLink] = useState<{ url: string; filename: string; size: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void estimateImagesBundleBytes().then(s => { if (alive) setStat(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [msg]);

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await downloadImagesBackup();
      if (r) { setLink(r); setMsg(`图片包已生成：${r.count} 张，${r.size}`); }
      else setMsg('分享面板已打开，请选择保存位置');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '导出失败');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = await readBackupFile(file);
      const r = await importImagesBundle(text);
      setMsg(`已导入 ${r.imported} 张${r.duplicates ? `，跳过重复 ${r.duplicates} 张` : ''}${r.orphaned ? `，${r.orphaned} 张找不到所属记录（先导主备份再导图片包）` : ''}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '导入失败');
    } finally {
      setBusy(false);
    }
  };

  const ink = ch === 'p5' ? '#050505' : ch === 'p3' ? 'var(--p3r-ink, #0a1230)' : undefined;
  const sub = ch === 'p5' ? '#6b6862' : ch === 'p3' ? 'var(--p3r-grey, #8a97ad)' : undefined;
  const btn = ch === 'p5'
    ? 'bg-[#050505] text-[#f0e9df]'
    : ch === 'p3'
      ? 'bg-[#1b57ff] text-white'
      : 'bg-primary text-white';

  return (
    <div className={`mt-3 space-y-2 rounded-xl border p-3 ${ch === 'p5' ? 'border-[#050505]' : ch === 'p3' ? 'border-[rgba(27,87,255,0.35)]' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-[12px] font-black ${ink ? '' : 'text-gray-800 dark:text-gray-100'}`} style={ink ? { color: ink } : undefined}>记录配图 · 单独备份</p>
        {stat && <span className={`text-[11px] ${sub ? '' : 'text-gray-400 dark:text-gray-500'}`} style={sub ? { color: sub } : undefined}>{stat.count} 张 · 约 {fmtBytes(stat.bytes)}</span>}
      </div>
      <p className={`text-[11px] leading-relaxed ${sub ? '' : 'text-gray-500 dark:text-gray-400'}`} style={sub ? { color: sub } : undefined}>
        图片不在主备份里，也不上云。换机时先导主备份恢复记录，再导图片包，图片会按记录挂回去。
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => void handleExport()} disabled={busy || !stat?.count}
          className={`flex-1 rounded-lg py-2 text-[12px] font-black disabled:opacity-40 ${btn}`}>
          {busy ? '处理中…' : '导出图片包'}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className={`flex-1 rounded-lg py-2 text-[12px] font-black disabled:opacity-40 ${ch === 'p5' ? 'border-2 border-[#050505] text-[#050505]' : ch === 'p3' ? 'border-2 border-[#1b57ff] text-[#1b57ff]' : 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200'}`}>
          {isNative() ? '从文件导入图片包' : '导入图片包'}
        </button>
      </div>
      {link && (
        <a href={link.url} download={link.filename} target="_blank" rel="noopener noreferrer" className="block truncate text-[11px] font-bold text-primary underline underline-offset-2">
          {link.filename}（{link.size}）· 点击另存为
        </a>
      )}
      {msg && <p className={`text-[11px] ${sub ? '' : 'text-gray-500 dark:text-gray-400'}`} style={sub ? { color: sub } : undefined}>{msg}</p>}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleImport(f); }}
      />
    </div>
  );
}
