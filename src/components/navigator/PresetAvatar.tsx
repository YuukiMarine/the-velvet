/**
 * PresetAvatar — 人格头像（Batch3）：内置剪影集 + 本地上传 dataUrl 双轨（已拍板）。
 * 剪影与底部导航 ◈ 同源视觉语言（实心 currentColor，颜色交给使用处）。
 * avatar 字段：剪影 id（'cat'|'toaster'|'bear'|'butterfly'|'star'）或 'data:image/...'。
 */

const GLYPH_PATHS: Record<string, string> = {
  // 猫头：双耳圆脸（◈ 同源）
  cat: 'M4.5 9.5 3 3.5l5 3.2a7.6 7.6 0 0 1 8 0l5-3.2-1.5 6a8.4 8.4 0 0 1 1.5 4.9c0 4.6-3.9 7.6-9 7.6s-9-3-9-7.6c0-1.8.55-3.5 1.5-4.9Z',
  // 烤面包机：圆角机身 + 投面包口 + 旋钮
  toaster: 'M4 10a8 8 0 0 1 16 0v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-7Zm4-1.5h8a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2ZM7.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  // 熊：圆耳圆脸
  bear: 'M6.5 3.5a3 3 0 0 1 2.9 2.2 8.4 8.4 0 0 1 5.2 0 3 3 0 1 1 4.1 3.6A8.3 8.3 0 0 1 20 13c0 4.4-3.6 7.5-8 7.5S4 17.4 4 13c0-1.3.3-2.6.9-3.7A3 3 0 0 1 6.5 3.5Z',
  // 蓝蝶系：蝴蝶
  butterfly: 'M12 6c1.5-3 5.5-4 7.5-2s1 6-2 7.5c3 1.5 4 5.5 2 7.5s-6 1-7.5-2c-1.5 3-5.5 4-7.5 2s-1-6 2-7.5C3.5 10 2.5 6 4.5 4s6-1 7.5 2Z',
  // 星
  star: 'M12 2.5 14.6 8l6 .7-4.4 4.1 1.2 5.9L12 15.8 6.6 18.7l1.2-5.9L3.4 8.7l6-.7L12 2.5Z',
};

export const PRESET_GLYPH_IDS = Object.keys(GLYPH_PATHS);

export const PresetAvatar = ({ avatar, className }: { avatar?: string; className?: string }) => {
  if (avatar?.startsWith('data:')) {
    return <img src={avatar} alt="" className={`${className ?? ''} rounded-full object-cover`} aria-hidden />;
  }
  const d = GLYPH_PATHS[avatar ?? 'cat'] ?? GLYPH_PATHS.cat;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
};
