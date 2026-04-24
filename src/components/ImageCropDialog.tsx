import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cropAndCompressSquare, readAsDataUrl } from '@/utils/imageCrop';

/**
 * 用户交互式头像裁切弹窗
 * - 可指定宽高比 aspectRatio (W/H)，默认 1（正方形）
 * - 滑块缩放 + 拖动定位
 * - 计算基于 CSS transform，确认时用 Canvas 绘制最终图
 * - 自适应压缩到 ≤ 80 KB（默认）再返回给调用方
 * - 通过 React Portal 直接挂到 body，避开父级 transform 的定位陷阱
 */

const VIEW_LONG = 280;   // 视窗长边像素
const OUT_LONG = 320;    // 输出长边像素
const MAX_BYTES = 80_000;

interface Props {
  isOpen: boolean;
  /** 原始文件；null/undefined 时弹窗不会渲染 */
  file: File | null;
  /** 标题（默认"调整头像"） */
  title?: string;
  /**
   * 目标宽高比（W / H）。
   * 1   → 1:1 正方形（默认，头像）
   * 0.625 → 1:1.6（塔罗牌比例，适合替换卡面）
   */
  aspectRatio?: number;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void | Promise<void>;
}

export function ImageCropDialog({
  isOpen,
  file,
  title = '调整头像',
  aspectRatio = 1,
  onCancel,
  onConfirm,
}: Props) {
  // 视窗尺寸：短边按长边缩放
  const VIEW_W = aspectRatio >= 1 ? VIEW_LONG : Math.round(VIEW_LONG * aspectRatio);
  const VIEW_H = aspectRatio >= 1 ? Math.round(VIEW_LONG / aspectRatio) : VIEW_LONG;
  // 输出尺寸：按相同比例
  const OUT_W = aspectRatio >= 1 ? OUT_LONG : Math.round(OUT_LONG * aspectRatio);
  const OUT_H = aspectRatio >= 1 ? Math.round(OUT_LONG / aspectRatio) : OUT_LONG;

  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setErr(null);

    if (!isOpen || !file) return;
    if (file.size > 12 * 1024 * 1024) {
      setErr('图片超过 12MB');
      return;
    }
    if (!/^image\//.test(file.type)) {
      setErr('请选择图片文件');
      return;
    }

    (async () => {
      try {
        const url = await readAsDataUrl(file);
        if (cancelled) return;
        const probe = new Image();
        probe.onload = () => {
          if (cancelled) return;
          setSrc(url);
          setNatural({ w: probe.naturalWidth, h: probe.naturalHeight });
        };
        probe.onerror = () => { if (!cancelled) setErr('图片解析失败'); };
        probe.src = url;
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '读取失败');
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, file]);

  // 视窗为矩形时，按长边取 cover 系数
  const baseScale = natural
    ? Math.max(VIEW_W / natural.w, VIEW_H / natural.h)
    : 1;
  const displayedW = natural ? natural.w * baseScale * zoom : 0;
  const displayedH = natural ? natural.h * baseScale * zoom : 0;
  const minOffsetX = Math.min(0, VIEW_W - displayedW);
  const minOffsetY = Math.min(0, VIEW_H - displayedH);

  const clampOffset = useCallback((x: number, y: number) => {
    const cx = Math.max(minOffsetX, Math.min(0, x));
    const cy = Math.max(minOffsetY, Math.min(0, y));
    return { x: cx, y: cy };
  }, [minOffsetX, minOffsetY]);

  useEffect(() => {
    setOffset(o => clampOffset(o.x, o.y));
  }, [zoom, clampOffset]);

  // 拿到 natural 时自动把图片居中到视窗（而不是默认靠左上角，避免"看起来像被拉伸"）
  useEffect(() => {
    if (!natural) return;
    const scale = Math.max(VIEW_W / natural.w, VIEW_H / natural.h);
    const dW = natural.w * scale;
    const dH = natural.h * scale;
    setOffset({
      x: (VIEW_W - dW) / 2, // 图比视窗宽时为负数，居中
      y: (VIEW_H - dH) / 2,
    });
    setZoom(1);
  }, [natural, VIEW_W, VIEW_H]);

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!src) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset(clampOffset(dragStartRef.current.ox + dx, dragStartRef.current.oy + dy));
  };
  const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // 自动居中：不使用户裁切，直接按 aspectRatio 居中裁 + 压缩
  const useAutoCenter = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const raw = await readAsDataUrl(file);
      if (aspectRatio === 1) {
        const out = await cropAndCompressSquare(raw, { size: OUT_LONG, maxBytes: MAX_BYTES });
        await onConfirm(out);
      } else {
        // 矩形居中裁
        const probe = new Image();
        probe.src = raw;
        if (!probe.complete) {
          await new Promise<void>((resolve, reject) => {
            probe.onload = () => resolve();
            probe.onerror = () => reject(new Error('图片重载失败'));
          });
        }
        const w = probe.naturalWidth;
        const h = probe.naturalHeight;
        // 目标源矩形：按 aspectRatio 居中取最大可取框
        const targetRatio = aspectRatio; // w/h
        let sw: number, sh: number;
        if (w / h > targetRatio) {
          // 原图偏宽 → 按高度为基准
          sh = h;
          sw = Math.round(h * targetRatio);
        } else {
          sw = w;
          sh = Math.round(w / targetRatio);
        }
        const sx = Math.round((w - sw) / 2);
        const sy = Math.round((h - sh) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = OUT_W;
        canvas.height = OUT_H;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 不可用');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(probe, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

        let q = 0.92;
        let out = canvas.toDataURL('image/jpeg', q);
        while (bytesOf(out) > MAX_BYTES && q > 0.55 + 0.04) {
          q = Math.max(0.55, q - 0.08);
          out = canvas.toDataURL('image/jpeg', q);
        }
        await onConfirm(out);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '处理失败');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!src || !natural) return;
    setBusy(true);
    try {
      const effectiveScale = baseScale * zoom;
      const sx = (-offset.x) / effectiveScale;
      const sy = (-offset.y) / effectiveScale;
      const sideW = VIEW_W / effectiveScale;
      const sideH = VIEW_H / effectiveScale;

      const canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 不可用');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const probe = new Image();
      probe.src = src;
      if (!probe.complete) {
        await new Promise<void>((resolve, reject) => {
          probe.onload = () => resolve();
          probe.onerror = () => reject(new Error('图片重载失败'));
        });
      }
      ctx.drawImage(probe, sx, sy, sideW, sideH, 0, 0, OUT_W, OUT_H);

      let q = 0.92;
      let out = canvas.toDataURL('image/jpeg', q);
      while (bytesOf(out) > MAX_BYTES && q > 0.55 + 0.04) {
        q = Math.max(0.55, q - 0.08);
        out = canvas.toDataURL('image/jpeg', q);
      }
      await onConfirm(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '裁切失败');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen || !file) return null;

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        style={{ position: 'fixed' }}
        onClick={() => !busy && onCancel()}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-3xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900 z-10">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                拖动定位 · 滑块缩放 · 输出为 {aspectRatio === 1 ? '1:1' : aspectRatio < 1 ? `1:${(1 / aspectRatio).toFixed(1)}` : `${aspectRatio.toFixed(1)}:1`} 画幅
              </p>
            </div>
            <button
              onClick={() => !busy && onCancel()}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center"
              aria-label="取消"
            >✕</button>
          </div>

          <div className="p-6 space-y-4">
            {/* 预览视窗 */}
            <div className="flex justify-center">
              <div
                className="relative overflow-hidden rounded-2xl select-none"
                style={{
                  width: VIEW_W,
                  height: VIEW_H,
                  background:
                    'repeating-conic-gradient(rgba(148,163,184,0.18) 0% 25%, rgba(148,163,184,0.06) 0% 50%) 50% / 20px 20px',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  touchAction: 'none',
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {src && natural ? (
                  // 关键点：
                  // 1. 仅显式给 width，height 用 'auto' 交给浏览器按自然比例算出
                  // 2. 追加 aspect-ratio CSS 作为第二道保险（若浏览器不支持 auto height 计算）
                  // 3. 外层 transform 统一用 scale(zoom) 放大，不会破坏内部比例
                  <img
                    ref={imgRef}
                    src={src}
                    alt="preview"
                    draggable={false}
                    width={Math.round(natural.w * baseScale)}
                    height={Math.round(natural.h * baseScale)}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: natural.w * baseScale,
                      height: 'auto',
                      aspectRatio: `${natural.w} / ${natural.h}`,
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                      transformOrigin: '0 0',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      maxWidth: 'none',
                      maxHeight: 'none',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                    {err ? err : '加载中…'}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 ring-2 ring-white/50 rounded-2xl" />
                <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{
                  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
                }} />
              </div>
            </div>

            {/* 缩放滑块 */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-400">缩小</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.02}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                disabled={!src || busy}
                className="flex-1 accent-primary"
              />
              <span className="text-[10px] text-gray-400">放大</span>
              <button
                onClick={reset}
                disabled={busy}
                className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                重置
              </button>
            </div>

            {err && (
              <div className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                {err}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => !busy && onCancel()}
                disabled={busy}
                className="py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={useAutoCenter}
                disabled={!file || busy}
                className="py-2.5 rounded-xl text-sm font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                自动居中
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={confirm}
                disabled={!src || busy}
                className="py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-50 bg-gradient-to-br from-indigo-500 to-purple-600"
              >
                {busy ? '处理中…' : '完成裁切'}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  // Portal 到 document.body，避免父级 motion.div (transform) 创建的 containing block 把 fixed 定位卡在祖先内部
  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

/** dataURL 近似字节数 */
function bytesOf(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}
