/**
 * ocr.ts —— 图片取字（FINAL_SPRINT_PRD FS3.2 的第二级降级）。
 *
 * 三级链里这一级的定位：**免费、离线、无 Key**。走原生本地识别引擎——
 * Android = ML Kit Text Recognition（中文包用 bundled 变体，模型打进 APK，
 * 不依赖 Google Play 服务，国产无 GMS 机型照样能跑）；iOS = Vision Framework。
 *
 * ⚠️ 这里**不 import 任何 OCR 插件包**，而是运行时探 Capacitor 桥：
 *   · 插件没装（现状）→ available() 为 false，调用方走视觉模型或手输，Web 打包零影响；
 *   · FS8 起原生工程里装上 `@capacitor-community/image-to-text` 后，
 *     桥上自动出现 ImageToText，本文件无需改动即生效。
 * 这样 Web/PWA 包里不会多出一个永远用不上的原生依赖。
 */

type Bridgeable = {
  Plugins?: Record<string, { detectText?: (opts: unknown) => Promise<unknown> } | undefined>;
  isNativePlatform?: () => boolean;
};

/** 拿 Capacitor 桥上的 OCR 插件对象（没有则 null） */
async function getPlugin() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const bridge = Capacitor as unknown as Bridgeable;
    const p = bridge.Plugins?.ImageToText;
    return p && typeof p.detectText === 'function' ? p : null;
  } catch {
    return null;
  }
}

/** 本机是否具备离线 OCR 能力（原生容器 + 插件已装） */
export async function ocrAvailable(): Promise<boolean> {
  return (await getPlugin()) !== null;
}

/**
 * 识别图片里的文字。
 * @param dataUrl data:image/*;base64,… （相机/相册选出来的原图）
 * @returns 识别到的纯文本（多行合并为空格分隔）；不可用或识别失败返回 null
 */
export async function recognizeText(dataUrl: string): Promise<string | null> {
  const plugin = await getPlugin();
  if (!plugin?.detectText) return null;
  try {
    // 插件接受 base64（去掉 data URL 前缀）
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    const res = (await plugin.detectText({ base64 })) as { text?: string; textDetections?: Array<{ text?: string }> } | null;
    const direct = typeof res?.text === 'string' ? res.text : '';
    const joined = Array.isArray(res?.textDetections)
      ? res!.textDetections!.map((d) => d?.text ?? '').filter(Boolean).join(' ')
      : '';
    const text = (direct || joined).replace(/\s+/g, ' ').trim();
    return text || null;
  } catch {
    return null;
  }
}
