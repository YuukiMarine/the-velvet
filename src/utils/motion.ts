/**
 * 「万线归猫」斜界系统 —— 动效 token（UI_DESIGN_BOLD_V2.5.md §2/§3/§6）。
 *
 * 三条铁律：
 *   1. 时间预算硬上限：控件 <300ms、跨域转场 ≤420ms、仪式 ≤500ms（D2/D3/D4）。
 *   2. 三主题三性格：结构零差分，弹簧参数随 data-theme 切换
 *      （蓝=高阻尼漂浮无过冲 / 黄=锐利切换 / 红=低阻尼带 overshoot）。
 *   3. 入场是"斜向"的（x 与 y 同时位移）——"斜"是斜界系统的动效签名。
 *
 * 大胆度拨盘（D0）由 utils/boldness.ts 提供运行时；需要在 JS 侧降级动效的组件
 * 用 useBoldness() 判断后改用 fadeIn / 直接渲染终态。
 */
import type { Transition, Variants } from 'motion/react';
import type { ThemeType } from '@/types';

// ── 弹簧预设 ─────────────────────────────────────────────────────────────────

/** 控件级：tab 指示块滑动、chip 选中、小元素归位 */
export const springSnappy: Transition = { type: 'spring', damping: 22, stiffness: 280 };
/** 面板级：弹窗生长、抽屉滑入、卡片入场 */
export const springSoft: Transition = { type: 'spring', damping: 28, stiffness: 300 };
/** 甩出/弹射：斜轨甩尾的完成弹射（调用方可传 velocity 继承手势末速度） */
export const springFling: Transition = { type: 'spring', damping: 26, stiffness: 420 };

// ── 时间预算（秒）────────────────────────────────────────────────────────────

/** 列表/宫格级联间隔 */
export const STAGGER = 0.04;
/** D2 控件动画上限 */
export const DUR_CONTROL_MAX = 0.3;
/** D3 跨域转场上限（5 秒内反复横跳时由转场系统自行降为 0.12 淡切） */
export const DUR_TRANSITION_MAX = 0.42;
/** D4 仪式演出上限（同会话第二次起播精简版） */
export const DUR_RITUAL_MAX = 0.5;

// ── 通用手势反馈 ─────────────────────────────────────────────────────────────

/** 全站统一按压反馈（替代审计发现的 10 种散值） */
export const TAP = { scale: 0.95 } as const;

// ── 入场 variants ────────────────────────────────────────────────────────────

/** 斜向入场：状态变化时播一次；配合父级 staggerChildren 使用 */
export const cardIn: Variants = {
  hidden: { opacity: 0, x: -8, y: 8 },
  show: { opacity: 1, x: 0, y: 0, transition: springSoft },
};

/** D0 降级用 */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
};

/** 父容器：子元素按 STAGGER 级联（子元素挂 cardIn / fadeIn） */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER } },
};

// ── 三主题动效性格 ───────────────────────────────────────────────────────────

export interface MotionPersonality {
  /** 面板级过渡（弹窗 / 页内大块） */
  panel: Transition;
  /** 控件级过渡（tab / chip / 小元素） */
  control: Transition;
}

const PERSONALITIES: Record<'blue' | 'yellow' | 'red', MotionPersonality> = {
  // P3R 水感：高阻尼、无过冲、漂浮
  blue: {
    panel: { type: 'spring', damping: 30, stiffness: 240 },
    control: { type: 'spring', damping: 26, stiffness: 260 },
  },
  // P4 CRT：锐利的 tween 切换，不弹
  yellow: {
    panel: { duration: 0.22, ease: [0.85, 0, 0.15, 1] },
    control: { duration: 0.16, ease: [0.85, 0, 0.15, 1] },
  },
  // P5：低阻尼高刚度，带 overshoot 的攻击性
  red: {
    panel: { type: 'spring', damping: 16, stiffness: 320 },
    control: { type: 'spring', damping: 14, stiffness: 340 },
  },
};

/**
 * 按主题取动效性格。pink 随 blue（P3P 系），custom 由调用方先按
 * settings.customSoundScheme 解析为基础主题再传入（与音效方案同源）。
 */
export function getMotionPersonality(theme: ThemeType | undefined): MotionPersonality {
  if (theme === 'yellow' || theme === 'red') return PERSONALITIES[theme];
  return PERSONALITIES.blue;
}
