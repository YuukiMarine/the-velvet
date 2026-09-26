/**
 * activityImages — 记录配图（v2.7.0.6）。
 *
 * 口径（用户拍板）：
 *   - 图片**不进 activities 行**、不上云、不进主备份：单独两张本地表 + 单独的「图片包」导出导入；
 *   - 每条记录最多 3 张；原图长边 1280、≤150KB JPEG；缩略图长边 240；
 *   - 列表只读缩略图索引（一个 zustand 小仓，整表加载一次，增删时就地更新），
 *     原图只在灯箱打开时按 id 取。
 */
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db';
import type { ActivityImage } from '@/types';
import { readAsDataUrl, dataUrlBytes } from '@/utils/imageCrop';

export const MAX_IMAGES_PER_ACTIVITY = 3;
const FULL_MAX_EDGE = 1280;
const FULL_MAX_BYTES = 150 * 1024;
const THUMB_MAX_EDGE = 240;

export interface PreparedImage {
  dataUrl: string;
  thumbDataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败：这个格式浏览器打不开，换一张 JPG / PNG 试试'));
    img.src = src;
  });

function drawScaled(img: HTMLImageElement, maxEdge: number, quality: number): { dataUrl: string; width: number; height: number } {
  const long = Math.max(img.width, img.height) || 1;
  const scale = Math.min(1, maxEdge / long);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(img, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: w, height: h };
}

/** 文件 → 压缩后的原图 + 缩略图（不落库） */
export async function prepareActivityImage(file: File | Blob): Promise<PreparedImage> {
  const raw = await readAsDataUrl(file);
  const img = await loadImage(raw);
  let quality = 0.82;
  let edge = FULL_MAX_EDGE;
  let full = drawScaled(img, edge, quality);
  // 先降质，再缩边；两条腿都走完还超就认了（真机截图通常 60~120KB 就下来了）
  while (dataUrlBytes(full.dataUrl) > FULL_MAX_BYTES && quality > 0.5) {
    quality = Math.max(0.5, quality - 0.08);
    full = drawScaled(img, edge, quality);
  }
  while (dataUrlBytes(full.dataUrl) > FULL_MAX_BYTES && edge > 720) {
    edge -= 160;
    full = drawScaled(img, edge, quality);
  }
  const thumb = drawScaled(img, THUMB_MAX_EDGE, 0.72);
  return { dataUrl: full.dataUrl, thumbDataUrl: thumb.dataUrl, width: full.width, height: full.height, bytes: dataUrlBytes(full.dataUrl) };
}

// ── 缩略图索引 ─────────────────────────────────────────────────────────────

interface IndexState {
  byActivity: Record<string, ActivityImage[]>;
  loaded: boolean;
}

export const useActivityImageIndex = create<IndexState>(() => ({ byActivity: {}, loaded: false }));

const EMPTY: ActivityImage[] = [];
/** 某条记录的配图（缩略图级）；稳定的空数组引用，避免无图记录每次都换引用 */
export const useActivityImages = (activityId: string): ActivityImage[] =>
  useActivityImageIndex(s => s.byActivity[activityId] ?? EMPTY);

let loadingPromise: Promise<void> | null = null;

export function loadActivityImageIndex(force = false): Promise<void> {
  if (!force && useActivityImageIndex.getState().loaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const rows = await db.activityImages.orderBy('createdAt').toArray();
      const byActivity: Record<string, ActivityImage[]> = {};
      for (const r of rows) (byActivity[r.activityId] ??= []).push(r);
      useActivityImageIndex.setState({ byActivity, loaded: true });
    } catch (e) {
      console.warn('[activityImages] index load failed', e);
      useActivityImageIndex.setState({ loaded: true });
    } finally {
      loadingPromise = null;
    }
  })();
  return loadingPromise;
}

const patchIndex = (activityId: string, next: ActivityImage[]) =>
  useActivityImageIndex.setState(s => {
    const byActivity = { ...s.byActivity };
    if (next.length) byActivity[activityId] = next; else delete byActivity[activityId];
    return { byActivity };
  });

/** 给记录追加图片（超过上限的部分丢弃），返回实际写入的行 */
export async function addActivityImages(activityId: string, prepared: PreparedImage[]): Promise<ActivityImage[]> {
  const existing = await db.activityImages.where('activityId').equals(activityId).toArray();
  const room = Math.max(0, MAX_IMAGES_PER_ACTIVITY - existing.length);
  const take = prepared.slice(0, room);
  if (!take.length) return [];
  const now = Date.now();
  const rows: ActivityImage[] = take.map((p, i) => ({
    id: uuidv4(),
    activityId,
    thumbDataUrl: p.thumbDataUrl,
    width: p.width,
    height: p.height,
    bytes: p.bytes,
    createdAt: new Date(now + i),
  }));
  await db.transaction('rw', db.activityImages, db.activityImageData, async () => {
    await db.activityImages.bulkPut(rows);
    await db.activityImageData.bulkPut(rows.map((r, i) => ({ id: r.id, dataUrl: take[i].dataUrl })));
  });
  const all = [...existing, ...rows].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  patchIndex(activityId, all);
  return rows;
}

export async function removeActivityImage(id: string): Promise<void> {
  const row = await db.activityImages.get(id);
  await db.transaction('rw', db.activityImages, db.activityImageData, async () => {
    await db.activityImages.delete(id);
    await db.activityImageData.delete(id);
  });
  if (row) {
    const cur = useActivityImageIndex.getState().byActivity[row.activityId] ?? [];
    patchIndex(row.activityId, cur.filter(r => r.id !== id));
  }
}

/** 删记录时联动（store.deleteActivity / deleteActivityRecordOnly 调） */
export async function deleteImagesOfActivity(activityId: string): Promise<void> {
  try {
    const rows = await db.activityImages.where('activityId').equals(activityId).toArray();
    if (!rows.length) return;
    await db.transaction('rw', db.activityImages, db.activityImageData, async () => {
      await db.activityImages.bulkDelete(rows.map(r => r.id));
      await db.activityImageData.bulkDelete(rows.map(r => r.id));
    });
    patchIndex(activityId, []);
  } catch (e) {
    console.warn('[activityImages] cascade delete failed', e);
  }
}

/**
 * 记录已经不存在的配图（导入了较旧的主备份之后会有：图按 activityId 挂着，记录却不在了）。
 * 只数不删；给导入后的询问窗用。
 */
export async function findOrphanActivityImages(): Promise<{ count: number; bytes: number }> {
  const acts = new Set((await db.activities.toArray()).map(a => a.id));
  const rows = await db.activityImages.toArray();
  const orphans = rows.filter(r => !acts.has(r.activityId));
  return { count: orphans.length, bytes: orphans.reduce((s, r) => s + (r.bytes || 0), 0) };
}

/**
 * 删掉记录已不存在的配图。用户在询问窗里点了「删除」才会调。
 * 事务里再核对一遍：只删此刻记录确实不在的那些（数完到点删之间要是又导入了记录，宁可少删）。返回删掉的张数。
 */
export async function pruneOrphanActivityImages(): Promise<number> {
  let deleted = 0;
  await db.transaction('rw', db.activityImages, db.activityImageData, db.activities, async () => {
    const acts = new Set((await db.activities.toArray()).map(a => a.id));
    const rows = await db.activityImages.toArray();
    const ids = rows.filter(r => !acts.has(r.activityId)).map(r => r.id);
    if (!ids.length) return;
    await db.activityImages.bulkDelete(ids);
    await db.activityImageData.bulkDelete(ids);
    deleted = ids.length;
  });
  if (deleted) await loadActivityImageIndex(true);
  return deleted;
}

/** 原图（灯箱用） */
export async function getActivityImageData(id: string): Promise<string | undefined> {
  const row = await db.activityImageData.get(id);
  return row?.dataUrl;
}

// ── 图片包：与主备份分开导出 / 导入 ──────────────────────────────────────
// 用户口径：叠在主备份里的大段 base64 会拖慢重新导入；分开两份文件，先导数据再导图。

export interface ImagesBundleItem extends Omit<ActivityImage, 'createdAt'> {
  createdAt: string;
  dataUrl: string;
  /** 只作人读：导入时按 activityId 对号，不看这两个字段 */
  activityDescription?: string;
  activityDate?: string;
}

export interface ImagesBundle {
  _kind: 'velvet-images';
  _version: 1;
  _exportedAt: string;
  images: ImagesBundleItem[];
}

export async function buildImagesBundle(): Promise<ImagesBundle> {
  const [metas, acts] = await Promise.all([db.activityImages.orderBy('createdAt').toArray(), db.activities.toArray()]);
  const actById = new Map(acts.map(a => [a.id, a]));
  const images: ImagesBundleItem[] = [];
  for (const m of metas) {
    const data = await db.activityImageData.get(m.id);
    if (!data) continue;
    const act = actById.get(m.activityId);
    images.push({
      ...m,
      createdAt: new Date(m.createdAt).toISOString(),
      dataUrl: data.dataUrl,
      activityDescription: act?.description.slice(0, 40),
      activityDate: act ? new Date(act.date).toISOString() : undefined,
    });
  }
  return { _kind: 'velvet-images', _version: 1, _exportedAt: new Date().toISOString(), images };
}

export const isImagesBundleJson = (text: string): boolean => /"_kind"\s*:\s*"velvet-images"/.test(text.slice(0, 400));

export interface ImportImagesResult {
  imported: number;
  /** 本机已有同 id 的图 */
  duplicates: number;
  /** 找不到所属记录（先导主备份再导图片包） */
  orphaned: number;
}

export async function importImagesBundle(text: string): Promise<ImportImagesResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, '').trim());
  } catch {
    throw new Error('图片包不是合法 JSON');
  }
  const bundle = parsed as Partial<ImagesBundle>;
  if (!bundle || bundle._kind !== 'velvet-images' || !Array.isArray(bundle.images)) {
    throw new Error('这不是图片包文件（应以 {"_kind":"velvet-images" 开头）');
  }
  const result: ImportImagesResult = { imported: 0, duplicates: 0, orphaned: 0 };
  const acts = new Set((await db.activities.toArray()).map(a => a.id));
  for (const it of bundle.images) {
    if (!it || typeof it.id !== 'string' || typeof it.activityId !== 'string' || typeof it.dataUrl !== 'string' || typeof it.thumbDataUrl !== 'string') continue;
    if (!acts.has(it.activityId)) { result.orphaned++; continue; }
    if (await db.activityImages.get(it.id)) { result.duplicates++; continue; }
    const have = await db.activityImages.where('activityId').equals(it.activityId).count();
    if (have >= MAX_IMAGES_PER_ACTIVITY) { result.duplicates++; continue; }
    const row: ActivityImage = {
      id: it.id,
      activityId: it.activityId,
      thumbDataUrl: it.thumbDataUrl,
      width: Number(it.width) || 0,
      height: Number(it.height) || 0,
      bytes: Number(it.bytes) || dataUrlBytes(it.dataUrl),
      createdAt: it.createdAt ? new Date(it.createdAt) : new Date(),
    };
    await db.transaction('rw', db.activityImages, db.activityImageData, async () => {
      await db.activityImages.put(row);
      await db.activityImageData.put({ id: row.id, dataUrl: it.dataUrl });
    });
    result.imported++;
  }
  await loadActivityImageIndex(true);
  return result;
}

/** 图片包体积估算（导出前给用户看一眼） */
export async function estimateImagesBundleBytes(): Promise<{ count: number; bytes: number }> {
  const rows = await db.activityImages.toArray();
  return { count: rows.length, bytes: rows.reduce((s, r) => s + (r.bytes || 0) + r.thumbDataUrl.length, 0) };
}
