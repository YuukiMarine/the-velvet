/**
 * settingsIcons — 设置域标题图标（v2.7：设置页标题的 emoji 全量换 SVG，用户口径）。
 *
 * 制式（与底导 Navigation 图标同语言，区别于 icons.tsx 的 16-viewBox 微图标）：
 *   - viewBox="0 0 24 24"，stroke currentColor / strokeWidth 1.8，round 端点；
 *   - 一律 currentColor：颜色交给父级（蓝频道给 P3R.blue，中性给灰阶）；
 *   - 默认 w-5 h-5（区头处调用方放大到 w-6），装饰性 aria-hidden——
 *     语义由旁边的标题文字承担。
 */

import type { ReactNode } from 'react';

export interface SettingsIconProps {
  className?: string;
}

const Base = ({ className = 'w-5 h-5', children }: SettingsIconProps & { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/** 🎨 调色盘（主题 / 颜色与声音） */
export const PaletteIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M12 3a9 9 0 100 18h1.1a2 2 0 001.5-3.3 1.9 1.9 0 011.4-3.1H19a2.9 2.9 0 002.9-2.9C21.9 6.7 17.5 3 12 3z" />
    <circle cx="7.6" cy="10.6" r="1" fill="currentColor" stroke="none" />
    <circle cx="10.6" cy="7" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.8" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </Base>
);

/** ✨ 四角星辉（AI 总结） */
export const SparklesIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M11 5.5l1.4 4.1 4.1 1.4-4.1 1.4L11 16.5l-1.4-4.1-4.1-1.4 4.1-1.4L11 5.5z" />
    <path d="M18.5 3.8l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z" fill="currentColor" stroke="none" />
  </Base>
);

/** 🎚 三轨调节（体验个性化） */
export const SlidersIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    {/* 轨道在滑钮处断开（分段画线），滑钮才不是"串在线上的珠子" */}
    <path d="M4 7h3.1M10.9 7H20M4 12h9.6M17.4 12H20M4 17h1.1M8.9 17H20" />
    <circle cx="9" cy="7" r="1.9" />
    <circle cx="15.5" cy="12" r="1.9" />
    <circle cx="7" cy="17" r="1.9" />
  </Base>
);

/** ◈ 菱形徽记（助手——底导黑猫菱形壳的图标化） */
export const DiamondMarkIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <rect x="6.2" y="6.2" width="11.6" height="11.6" rx="1.4" transform="rotate(45 12 12)" />
    <rect x="10.4" y="10.4" width="3.2" height="3.2" transform="rotate(45 12 12)" fill="currentColor" stroke="none" />
  </Base>
);

/** 🔔 铃铛（通知提醒） */
export const BellIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M12 4a5 5 0 00-5 5v3.3l-1.5 2.7a.6.6 0 00.5.9h12a.6.6 0 00.5-.9L17 12.3V9a5 5 0 00-5-5z" />
    <path d="M10 18.8a2 2 0 004 0" />
  </Base>
);

/** ⚡ 闪电（快速响应档） */
export const BoltMiniIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M5.5 13.2L14 4l-1.8 6.5h6.3L10 20l1.8-6.8H5.5z" />
  </Base>
);

/** 🌙 弦月（深思熟虑档） */
export const MoonIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M19.5 14.2A8 8 0 019.8 4.5 8 8 0 1019.5 14.2z" />
  </Base>
);

/** 👁 眼（视觉档） */
export const EyeIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M3 12s3.5-6.2 9-6.2S21 12 21 12s-3.5 6.2-9 6.2S3 12 3 12z" />
    <circle cx="12" cy="12" r="2.6" />
  </Base>
);

/** 📷 相机（聊天发图 / 拍摄入口） */
export const CameraIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M4 8.2A1.7 1.7 0 015.7 6.5h2.1l1.3-2h5.8l1.3 2h2.1A1.7 1.7 0 0120 8.2v9.1a1.7 1.7 0 01-1.7 1.7H5.7A1.7 1.7 0 014 17.3V8.2z" />
    <circle cx="12" cy="12.4" r="3.4" />
  </Base>
);

/** 🎤 话筒（听觉档） */
export const MicIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <rect x="9.4" y="3.4" width="5.2" height="10" rx="2.6" />
    <path d="M6.4 11.5a5.6 5.6 0 0011.2 0M12 17.2v3M9.2 20.2h5.6" />
  </Base>
);

/** 🖼 画框（显示 / 背景图） */
export const ImageIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="8.6" cy="9.6" r="1.3" fill="currentColor" stroke="none" />
    <path d="M5.5 17l4.4-4.6 3.1 3.2 2.4-2.4 3.1 3.4" />
  </Base>
);

/** ⚙️ 齿轮（属性等机制向子板块） */
export const GearIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5" />
  </Base>
);

/** 🌊 波浪（逆流） */
export const WaveIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M3 9.5c2.2-2.6 4.3-2.6 6.5 0s4.3 2.6 6.5 0 3-2.2 5-1M3 15.5c2.2-2.6 4.3-2.6 6.5 0s4.3 2.6 6.5 0 3-2.2 5-1" />
  </Base>
);

/** 💰 硬币（记账相关） */
export const CoinIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M9 9.2l3 3.4 3-3.4M12 12.6v4M9.8 14.4h4.4" />
  </Base>
);

/** 🏷 标签（属性名称） */
export const TagIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M4 5.5A1.5 1.5 0 015.5 4h5.2c.4 0 .8.16 1.1.44l7.3 7.3a1.5 1.5 0 010 2.12l-5.24 5.24a1.5 1.5 0 01-2.12 0l-7.3-7.3A1.5 1.5 0 014 10.7V5.5z" />
    <circle cx="8.6" cy="8.6" r="1.1" fill="currentColor" stroke="none" />
  </Base>
);

/** 📶 阶梯柱（等级需求） */
export const BarsIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M5 19v-3.4M10 19v-7M15 19V8.4M20 19V4.8" />
  </Base>
);

/** 🔑 钥匙（关键词规则） */
export const KeyIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <circle cx="8" cy="8.8" r="3.8" />
    <path d="M10.8 11.6L19.5 20.3M16.2 17l2.4-2.4M13.4 14.2l2-2" />
  </Base>
);

/** ⚔️ 交叉双剑（逆影战场） */
export const SwordsIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <path d="M4.5 4.5l10.6 10.6M4.5 4.5l3.4.5.5 3.4M19.5 4.5L8.9 15.1M19.5 4.5l-3.4.5-.5 3.4M6.8 17.2l-2 2M17.2 17.2l2 2M8.2 15.8l-3 3M15.8 15.8l3 3" />
  </Base>
);

/** 📔 笔记本（记事本） */
export const NotebookIcon = (p: SettingsIconProps) => (
  <Base {...p}>
    <rect x="5.5" y="3.8" width="13" height="16.4" rx="1.6" />
    <path d="M9 3.8v16.4M12.2 8.6h3.6M12.2 12h3.6" />
  </Base>
);
