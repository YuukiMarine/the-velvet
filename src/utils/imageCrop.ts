/**
 * 浏览器原生 Canvas 裁切 + 压缩。
 * 无外部依赖，成本极低；典型效果：任意比例图片 → 1:1 居中裁切 →
 * 256×256 jpeg → 20–60 KB。
 */

export interface CropAndCompressOptions {
  /** 输出边长（正方形），默认 256 */
  size?: number;
  /** 字节上限（近似），会从高画质循环降到 minQuality 直到达标 */
  maxBytes?: number;
  /** 最低 JPEG 画质，默认 0.55 —— 低于此仍超标则用最低画质输出 */
  minQuality?: number;
  /** 起始 JPEG 画质，默认 0.92 */
  initialQuality?: number;
  /** 画质步长，默认 0.08 */
  step?: number;
}

/** File / Blob → dataURL */
export function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

/** dataURL 的近似字节长度（base64 段 × 3/4） */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // 每 4 个字符编码 3 字节；末尾 '=' 占位，减去它们
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/**
 * 等比缩到长边 maxEdge 以内 + JPEG 压缩（不裁切，保全画面）。
 * 用于拍照记账：小票原图动辄 4000px/5MB，视觉模型按像素计费、base64 还会再涨 1/3；
 * 长边 1600 对小票文字足够清晰，体积通常落到 200KB 上下。
 */
export function downscaleDataUrl(
  dataUrl: string,
  maxEdge = 1600,
  quality = 0.82,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const long = Math.max(img.width, img.height);
      if (long <= maxEdge) { resolve(dataUrl); return; } // 本来就小，别二次压
      const scale = maxEdge / long;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = dataUrl;
  });
}

/**
 * 1:1 居中裁切 + 逐步降质压缩到目标字节以下。
 * 典型用法：上传头像 / 长按同伴塔罗换图。
 */
export function cropAndCompressSquare(
  dataUrl: string,
  options: CropAndCompressOptions = {},
): Promise<string> {
  const {
    size = 256,
    maxBytes = 80_000,           // 约 80 KB 足够清晰的小头像
    minQuality = 0.55,
    initialQuality = 0.92,
    step = 0.08,
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      // 1. 1:1 居中裁切的源区域
      const side = Math.min(width, height);
      const sx = Math.round((width - side) / 2);
      const sy = Math.round((height - side) / 2);

      // 2. 按目标 size 绘制到方形画布
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 不可用'));

      // 高质量缩放
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

      // 3. 由高画质向下逐步尝试，直到不超过 maxBytes（或到 minQuality 为止）
      let quality = initialQuality;
      let out = '';
      try {
        out = canvas.toDataURL('image/jpeg', quality);
        while (dataUrlBytes(out) > maxBytes && quality > minQuality + step / 2) {
          quality = Math.max(minQuality, quality - step);
          out = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(out);
      } catch (e) {
        reject(e instanceof Error ? e : new Error('压缩失败'));
      }
    };
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = dataUrl;
  });
}

/** 便捷组合：File → 裁切压缩后的 dataURL */
export async function fileToSquareDataUrl(
  file: File,
  options: CropAndCompressOptions = {},
): Promise<string> {
  const raw = await readAsDataUrl(file);
  return cropAndCompressSquare(raw, options);
}
