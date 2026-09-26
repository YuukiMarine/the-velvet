/**
 * 导入主备份之后：「有 N 张配图找不到记录了，删吗？」
 *
 * 只由 store.orphanImagesPrompt 驱动——那个值只在 importData **成功**且孤儿张数 > 0 时被置上，
 * 其余任何路径都不会碰它，所以这个窗不会错误弹出。默认动作是「保留」；点「删除」时再核对一遍
 * 记录确实不在（pruneOrphanActivityImages），删完给一句结果。
 */
import { useState } from 'react';
import { useAppStore } from '@/store';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function OrphanImagesPrompt() {
  const prompt = useAppStore(s => s.orphanImagesPrompt);
  const dismiss = useAppStore(s => s.dismissOrphanImagesPrompt);
  const prune = useAppStore(s => s.pruneOrphanImages);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const onDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const n = await prune();
      setResult(n > 0 ? `已删掉 ${n} 张找不到记录的配图。` : '这些配图的记录又找到了，没有删。');
    } catch (err) {
      setResult(err instanceof Error ? err.message : '删除配图失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ConfirmDialog
        isOpen={!!prompt}
        tone="danger"
        title={`有 ${prompt?.count ?? 0} 张配图找不到记录了`}
        description={`刚导入的备份里没有这些图对应的记录（共 ${formatBytes(prompt?.bytes ?? 0)}）。删掉它们吗？保留的话只占空间，不会显示在任何地方。`}
        confirmText="删除"
        cancelText="保留"
        busy={busy}
        onConfirm={() => void onDelete()}
        onCancel={dismiss}
      />
      <ConfirmDialog
        isOpen={result !== null}
        title="配图"
        description={result ?? ''}
        confirmText="好"
        cancelText="关闭"
        onConfirm={() => setResult(null)}
        onCancel={() => setResult(null)}
      />
    </>
  );
}
