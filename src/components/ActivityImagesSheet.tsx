/**
 * ActivityImagesSheet — 已有记录的「管理图片」抽屉（v2.7.0.6）。
 * 长按记录 → 菜单 → 这里：缩略图九宫（最多 3 张）+ 添加 + 删除；点缩略图进灯箱。
 */
import { useRef, useState } from 'react';
import { SheetModal } from '@/components/SheetModal';
import { ImageLightbox } from '@/components/ImageLightbox';
import {
  useActivityImages, prepareActivityImage, addActivityImages, removeActivityImage, MAX_IMAGES_PER_ACTIVITY,
} from '@/utils/activityImages';
import { triggerLightHaptic } from '@/utils/feedback';

interface Props {
  activityId: string | null;
  title?: string;
  onClose: () => void;
}

export function ActivityImagesSheet({ activityId, title, onClose }: Props) {
  const images = useActivityImages(activityId ?? '');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const room = MAX_IMAGES_PER_ACTIVITY - images.length;

  const handleFiles = async (files: File[]) => {
    if (!activityId || !files.length || busy) return;
    setBusy(true);
    setHint(null);
    try {
      const take = files.slice(0, Math.max(0, room));
      const prepared = [];
      for (const f of take) prepared.push(await prepareActivityImage(f));
      const added = await addActivityImages(activityId, prepared);
      triggerLightHaptic();
      if (files.length > take.length) setHint(`每条记录最多 ${MAX_IMAGES_PER_ACTIVITY} 张，多出的没有加`);
      else if (!added.length) setHint('已经满了');
    } catch (e) {
      setHint(e instanceof Error ? e.message : '图片处理失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    await removeActivityImage(id);
    triggerLightHaptic();
    setConfirmId(null);
  };

  return (
    <>
      <SheetModal isOpen={!!activityId} onClose={onClose} position="bottom" title={title ?? '记录图片'}>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {images.map((im, i) => (
              <div key={im.id} className="relative aspect-square overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
                <button type="button" onClick={() => setLightbox(i)} className="block h-full w-full" aria-label={`查看第 ${i + 1} 张`}>
                  <img src={im.thumbDataUrl} alt="" className="h-full w-full object-cover" draggable={false} />
                </button>
                {confirmId === im.id ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/70 text-[11px] font-bold text-white">
                    <button type="button" onClick={() => void handleRemove(im.id)} className="rounded-full bg-red-500 px-3 py-1">删除</button>
                    <button type="button" onClick={() => setConfirmId(null)} className="rounded-full bg-white/20 px-3 py-1">取消</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(im.id)}
                    aria-label="删除这张图"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {room > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 disabled:opacity-50 dark:border-gray-600 dark:text-gray-500"
              >
                <span className="text-2xl leading-none">＋</span>
                <span className="text-[11px] font-bold">{busy ? '处理中…' : `添加（还可 ${room} 张）`}</span>
              </button>
            )}
          </div>
          {!images.length && room === MAX_IMAGES_PER_ACTIVITY && (
            <p className="text-center text-[11px] text-gray-400 dark:text-gray-500">这条记录还没有图片。图片只存在本机，不上云，可在「账号与数据」单独导出图片包。</p>
          )}
          {hint && <p className="text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            // 先拷出文件再清 value（Chromium 清 value 会原地清空 FileList）
            onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void handleFiles(files); }}
          />
        </div>
      </SheetModal>
      {lightbox !== null && images[lightbox] && (
        <ImageLightbox
          images={images}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
          onDeleted={() => setLightbox(v => (v === null ? null : images.length <= 1 ? null : Math.max(0, Math.min(v, images.length - 2))))}
        />
      )}
    </>
  );
}
