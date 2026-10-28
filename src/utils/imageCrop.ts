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

export interface CropRectOptions {
  /** 目标宽高比（W / H）：1 = 正方形，0.625 = 1:1.6 塔罗卡面 */
  aspectRatio: number;
  /** 输出长边像素，默认 320（与 ImageCropDialog 同口径） */
  longEdge?: number;
  /** 字节上限（近似），默认 80 KB（与 ImageCropDialog 同口径） */
  maxBytes?: number;
}

/**
 * 任意比例图片 → 按 aspectRatio **居中**取最大可取框 → 缩到 longEdge → jpeg 循环降质到 ≤ maxBytes。
 * 原来内联在 ImageCropDialog 的「自动居中」里；抽出来给「好友换了头像、本地卡面自动重裁」（第 35 批）复用。
 * dataUrl 必须是同源 / data: 来源，否则 canvas 被污染、toDataURL 会抛。
 */
export async function cropAndCompressRect(dataUrl: string, opts: CropRectOptions): Promise<string> {
  const { aspectRatio, longEdge = 320, maxBytes = 80_000 } = opts;
  const probe = new Image();
  probe.src = dataUrl;
  if (!probe.complete || !probe.naturalWidth) {
    await new Promise<void>((resolve, reject) => {
      probe.onload = () => resolve();
      probe.onerror = () => reject(new Error('图片解码失败'));
    });
  }
  const w = probe.naturalWidth;
  const h = probe.naturalHeight;
  if (!w || !h) throw new Error('图片尺寸无效');
  let sw: number, sh: number;
  if (w / h > aspectRatio) { sh = h; sw = Math.round(h * aspectRatio); } // 原图偏宽 → 按高度为基准
  else { sw = w; sh = Math.round(w / aspectRatio); }
  const sx = Math.round((w - sw) / 2);
  const sy = Math.round((h - sh) / 2);
  const outW = aspectRatio >= 1 ? longEdge : Math.round(longEdge * aspectRatio);
  const outH = aspectRatio >= 1 ? Math.round(longEdge / aspectRatio) : longEdge;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(probe, sx, sy, sw, sh, 0, 0, outW, outH);
  let q = 0.92;
  let out = canvas.toDataURL('image/jpeg', q);
  while (dataUrlBytes(out) > maxBytes && q > 0.55 + 0.04) {
    q = Math.max(0.55, q - 0.08);
    out = canvas.toDataURL('image/jpeg', q);
  }
  return out;
}

/**
 * 远端图片 → 居中裁切后的 dataUrl。先 fetch 成 blob 再读成 dataUrl（<img src=远端URL> 画到 canvas 会污染、
 * toDataURL 抛异常）；fetch 对 4xx/5xx 不 reject，这里自己查 res.ok。任何失败都抛，调用方决定留旧图还是放弃。
 */
export async function centerCropRemoteImage(url: string, opts: CropRectOptions): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/') && blob.size < 64) throw new Error('不是图片');
  return cropAndCompressRect(await readAsDataUrl(blob), opts);
}

/** File / Blob → dataURL */
export function readAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    // 带上浏览器给的错误名（NotReadableError / NotFoundError…），用户截图就能看出是哪一类（第 22 批）
    reader.onerror = () => reject(new Error(`读取文件失败${reader.error?.name ? `（${reader.error.name}）` : ''}`));
    reader.readAsDataURL(file);
  });
}

/**
 * 选完图**立刻**把内容读进内存，返回一份纯内存的 File（第 22 批 · 三星 S21 头像「读取文件失败」）。
 * 安卓相册给网页的是 content:// 引用，WebView 真正读的时候还会再核对一次文件信息；头像流程是先清空
 * 文件框、等裁切框打开才读，比「附一张图」晚一拍，相册处理过的图这时候就读不出来了。
 * 这里在 change 事件里就把字节拷出来，之后随便什么时候用都稳；读失败直接抛，调用方给出原因。
 */
export async function snapshotFile(file: File): Promise<File> {
  try {
    const buf = await file.arrayBuffer();
    return new File([buf], file.name || 'image', { type: file.type || 'image/jpeg', lastModified: file.lastModified || Date.now() });
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    throw new Error(`读取文件失败${name ? `（${name}）` : ''}：换一张图，或从「文件」里选`);
  }
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
      /**
       * 本来就小的图也过一遍 canvas（第 4 轮）：相机出的 JPEG 带着 EXIF（拍摄时间、机型、
       * 常常还有 GPS 坐标），原样发给视觉模型等于把这些一起交出去。重新编码会把元数据全部抹掉；
       * 小图用更高的质量重编，肉眼看不出差别。PNG（截图）没有 EXIF，保持 PNG 免得压出色块。
       */
      const small = long <= maxEdge;
      const scale = small ? 1 : maxEdge / long;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const isPng = /^data:image\/png/i.test(dataUrl);
      resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', small ? Math.max(quality, 0.92) : quality));
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
