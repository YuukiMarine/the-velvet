/**
 * p3Kit — 蓝(board)频道的 P3R「亮蓝水面」色板原语（黑猫窗口亮皮消费）。
 * 原为 F3 终端 p3 频道套件；终端退役（TASKS_MERGE_PRD 批5）后瘦身迁此，
 * 只保留 NavigatorWindow 仍在用的 P3 tokens 与水面素材路径。
 *
 * 色板策略：大面积色一律由 --color-primary 经 color-mix 派生——蓝主题即设计稿原色；
 * 粉 / 自定义主题整室随主色变调（白面板 + 深字的结构保证任意主色可读）。
 * 青色 ACCENT 是 P3 的固定信号色，不随主题走。
 */

export const P3 = {
  /** 白面板上的深蓝标题 / 正文 */
  ink: 'color-mix(in srgb, var(--color-primary) 45%, #101b8e)',
  /** 白面板上的次级说明字 */
  inkDim: 'color-mix(in srgb, var(--color-primary) 32%, #46628f)',
  /** CTA / 底部弹幕栏的藏青底 */
  deep: 'color-mix(in srgb, var(--color-primary) 30%, #061c50)',
  /** 弹幕栏左标签、CTA 播放块的亮一档藏蓝 */
  deepSoft: 'color-mix(in srgb, var(--color-primary) 58%, #1b3a94)',
  /** 房间背景顶部强蓝 */
  hi: 'color-mix(in srgb, var(--color-primary) 72%, #0053d0)',
  /** 房间背景中段 */
  mid: 'color-mix(in srgb, var(--color-primary) 82%, #6fc2ff)',
  /** 房间背景底部浅蓝（水面处） */
  pale: 'color-mix(in srgb, var(--color-primary) 20%, #dbf0fd)',
  /** 图标块 / 进度填充 / 「打开」的亮蓝 */
  blue: 'color-mix(in srgb, var(--color-primary) 78%, #0b6cf0)',
  /** 固定青色信号色（LIVE 点、下划线段、CH 章、|||） */
  accent: '#2fd2ff',
  /** 白面板底色 */
  panel: '#f7fbff',
} as const;

export const P3_WATER_WIDE = '/assets/terminal/p3-water-wide.png';
