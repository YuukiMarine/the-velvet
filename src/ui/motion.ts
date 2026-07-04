/**
 * 频道动效 preset（PERSONA_UI_REWRITE_GUIDE §7 / §20）。
 *
 * 三频道三性格：P5 撞入（快、带旋转）、P4 节目推镜（弹性）、P3 斜切拼合（冷、skew）。
 * 消费端用法：<motion.div {...channelMotion(ch).panelIn} />。
 *
 * 约束：
 *   - skewX 只给容器，不给文本节点（guide §20 注意项；字恒水平铁律）。
 *   - D0 / reduced-motion 降级由消费端 useBoldness() 门控（全站惯例）——
 *     bold=false 时不要展开 panelIn，改用 opacity 渐变或直接静态。
 *   - 基础 spring 常量沿用 utils/motion.ts（springSnappy 等），这里只放频道差分。
 */
import type { TargetAndTransition, Transition } from 'motion/react';
import type { UIChannel } from './channel';

interface PanelPreset {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit: TargetAndTransition;
  transition: Transition;
}

export interface ChannelMotionPreset {
  /** 面板/卡片进出场 */
  panelIn: PanelPreset;
  /** 按压反馈（whileTap） */
  hit: TargetAndTransition;
  /** 列表行 stagger 间隔（秒） */
  stagger: number;
}

export const p5Motion: ChannelMotionPreset = {
  panelIn: {
    initial: { opacity: 0, x: -24, rotate: -2, scale: 0.98 },
    animate: { opacity: 1, x: 0, rotate: 0, scale: 1 },
    exit: { opacity: 0, x: 24, rotate: 2, scale: 0.98 },
    transition: { duration: 0.22, ease: [0.2, 0.9, 0.2, 1] },
  },
  hit: { x: 3, y: 3, scale: 0.98 },
  stagger: 0.03,
};

export const p4Motion: ChannelMotionPreset = {
  panelIn: {
    initial: { opacity: 0, y: 18, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 12, scale: 0.98 },
    transition: { type: 'spring', stiffness: 260, damping: 28 },
  },
  hit: { scale: 0.95 },
  stagger: 0.04,
};

export const p3Motion: ChannelMotionPreset = {
  panelIn: {
    initial: { opacity: 0, x: -18, skewX: -4 },
    animate: { opacity: 1, x: 0, skewX: 0 },
    exit: { opacity: 0, x: 18, skewX: 4 },
    transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
  },
  hit: { x: 3, scale: 0.98 },
  stagger: 0.035,
};

export const neutralMotion: ChannelMotionPreset = {
  panelIn: {
    initial: { opacity: 0, y: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 8, scale: 0.99 },
    transition: { type: 'spring', stiffness: 300, damping: 30 },
  },
  hit: { scale: 0.97 },
  stagger: 0.03,
};

const PRESETS: Record<UIChannel, ChannelMotionPreset> = {
  p5: p5Motion,
  p4: p4Motion,
  p3: p3Motion,
  neutral: neutralMotion,
};

export const channelMotion = (channel: UIChannel): ChannelMotionPreset => PRESETS[channel];
