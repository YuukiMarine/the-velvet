/**
 * ImageLightbox — 记录配图的全屏灯箱（v2.7.0.6）。
 *
 * 黑底，原图按 id 从 activityImageData 取（列表只拿缩略图）；左右横拖切图，
 * 点空白处 / ✕ / 返回键关闭；可保存（原生走分享面板，Web 下载）；管理场景下可删除。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import type { ActivityImage } from '@/types';
import { getActivityImageData, removeActivityImage } from '@/utils/activityImages';
import { shareImage } from '@/utils/native';
import { useBackHandler } from '@/utils/useBackHandler';
import { triggerLightHaptic } from '@/utils/feedback';

interface Props {
  images: ActivityImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  /** 传了就显示「删除」；删完回调（父层据此收起或换图） */
  onDeleted?: (id: string) => void;
  caption?: string;
}

export function ImageLightbox({ images, index, onClose, onIndexChange, onDeleted, caption }: Props) {
  const cur = images[index];
  const cache = useRef(new Map<string, string>());
  const [src, setSrc] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useBackHandler(true, onClose);

  // 取原图（带缓存），顺手预取左右邻居
  useEffect(() => {
    let alive = true;
    setConfirmDel(false);
    setHint(null);
    if (!cur) { setSrc(null); return; }
    const load = async (img: ActivityImage) => {
      if (cache.current.has(img.id)) return cache.current.get(img.id)!;
      const d = await getActivityImageData(img.id);
      const v = d ?? img.thumbDataUrl;
      cache.current.set(img.id, v);
      return v;
    };
    setSrc(cache.current.get(cur.id) ?? cur.thumbDataUrl);
    void load(cur).then(v => { if (alive) setSrc(v); });
    for (const n of [images[index - 1], images[index + 1]]) if (n) void load(n);
    return () => { alive = false; };
  }, [cur, images, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && index < images.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndexChange]);

  const handleSave = async () => {
    if (!src || busy) return;
    setBusy(true);
    try {
      await shareImage(src, `velvet-${cur.activityId.slice(0, 8)}-${index + 1}.jpg`);
    } catch (e) {
      setHint(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!cur || busy) return;
    setBusy(true);
    try {
      await removeActivityImage(cur.id);
      triggerLightHaptic();
      onDeleted?.(cur.id);
    } finally {
      setBusy(false);
      setConfirmDel(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {cur && (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label="查看图片"
          onClick={onClose}
        >
          {/* 顶栏 */}
          <div
            className="flex items-center justify-between px-4 pb-2 text-xs"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={onClose} className="h-9 w-9 rounded-full bg-white/10 text-lg leading-none" aria-label="关闭">×</button>
            <div className="tabular-nums text-white/70">{index + 1} / {images.length}</div>
            <div className="flex items-center gap-2">
              {onDeleted && (
                confirmDel ? (
                  <button onClick={() => void handleDelete()} disabled={busy} className="rounded-full bg-red-500 px-3 py-1.5 font-bold disabled:opacity-50">确认删除</button>
                ) : (
                  <button onClick={() => setConfirmDel(true)} className="rounded-full bg-white/10 px-3 py-1.5 font-bold">删除</button>
                )
              )}
              <button onClick={() => void handleSave()} disabled={busy || !src} className="rounded-full bg-white/10 px-3 py-1.5 font-bold disabled:opacity-50">保存</button>
            </div>
          </div>

          {/* 图 */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img
                key={cur.id}
                src={src ?? cur.thumbDataUrl}
                alt=""
                draggable={false}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                drag={images.length > 1 ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.35}
                onDragEnd={(_e, info) => {
                  if (info.offset.x < -60 && index < images.length - 1) { triggerLightHaptic(); onIndexChange(index + 1); }
                  else if (info.offset.x > 60 && index > 0) { triggerLightHaptic(); onIndexChange(index - 1); }
                }}
                onClick={e => e.stopPropagation()}
                className="max-h-full max-w-full select-none object-contain"
                style={{ touchAction: 'pan-y' }}
              />
            </AnimatePresence>
            {images.length > 1 && index > 0 && (
              <button onClick={e => { e.stopPropagation(); onIndexChange(index - 1); }} className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 rounded-full bg-white/10 text-xl sm:block" aria-label="上一张">‹</button>
            )}
            {images.length > 1 && index < images.length - 1 && (
              <button onClick={e => { e.stopPropagation(); onIndexChange(index + 1); }} className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 rounded-full bg-white/10 text-xl sm:block" aria-label="下一张">›</button>
            )}
          </div>

          {/* 底栏 */}
          <div
            className="px-5 pt-2 text-center text-[11px] text-white/60"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)' }}
            onClick={e => e.stopPropagation()}
          >
            {hint ?? caption ?? (images.length > 1 ? '左右滑动切换 · 点空白处关闭' : '点空白处关闭')}
            {images.length > 1 && (
              <div className="mt-2 flex justify-center gap-1.5">
                {images.map((im, i) => (
                  <button
                    key={im.id}
                    aria-label={`第 ${i + 1} 张`}
                    onClick={() => onIndexChange(i)}
                    className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/35'}`}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
