/**
 * native.ts — Capacitor 原生平台工具
 *
 * 所有原生 API 均做懒加载，在 Web 环境中不会引入任何 native bundle。
 */

import { Capacitor } from '@capacitor/core';

/** 是否运行在 Android/iOS 原生 Capacitor 容器中 */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * 导出备份文件：
 *  - Android/iOS：写入 Cache 目录后调起系统分享面板
 *  - Web：降级为 Blob 下载
 *
 * @returns 成功时返回 null；Web 端下载时返回 { url, filename, size }；
 *          发生错误时 throw
 */
export async function exportBackup(
  filename: string,
  jsonString: string,
): Promise<{ url: string; filename: string; size: string } | null> {
  if (isNative()) {
    // ── 原生平台：写文件 → 分享 ──────────────────────────
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    // 写入 Cache 目录（无需权限申请）
    await Filesystem.writeFile({
      path: filename,
      data: jsonString,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    // 获取原生 URI
    const { uri } = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });

    // 调起系统分享面板（可发往微信、邮件、文件管理等）
    await Share.share({
      title: '靛蓝色房间 · 数据备份',
      text: `备份文件：${filename}`,
      files: [uri],
      dialogTitle: '分享/保存备份文件',
    });

    return null; // 原生分享，无需返回 Blob URL
  } else {
    // ── Web 端：Blob 下载 ─────────────────────────────────
    const sizeOf = (s: string) => {
      const bytes = new Blob([s]).size;
      return bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return { url, filename, size: sizeOf(jsonString) };
  }
}

/**
 * 保存 / 分享一张图片（记录配图灯箱的「保存」）：
 *  - 原生：写进 Cache 后调系统分享面板（iOS 面板里有「存储图像」，安卓可存到相册 / 发给别人）
 *  - Web：触发下载
 */
export async function shareImage(dataUrl: string, filename: string): Promise<void> {
  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = dataUrl.split(',')[1] ?? '';
    await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: '记录配图', files: [uri], dialogTitle: '保存 / 分享图片' });
    return;
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
