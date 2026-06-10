/**
 * Stepper — 行动域统一数值步进器（UI_AUDIT_V2.5.md §3.2：收敛 3 套步进器实现）。
 *
 * 替换对象：
 *   - Todos.tsx:288-302   局部 `Stepper`（w-7 rounded-lg，定义在 GoalSetup 组件体内）
 *   - Todos.tsx:1219-1239 局部 `PointsControl`（w-8 rounded-full，定义在页面组件体内）
 *   - Activities.tsx:1360-1362 内联 ± 按钮对（无组件抽象）
 *
 * 关键约束（审计红线）：
 *   - 必须定义在模块顶层。旧实现定义在组件函数体内，每次父组件 render 都生成
 *     新的组件类型，导致 React 卸载重建整棵子树（输入态丢失 + 动画闪烁）；
 *   - ± 按钮 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800，whileTap=TAP
 *     （全站统一按压反馈）；到达边界时 disabled + opacity-40（disabled 后浏览器
 *     不再派发 pointer 事件，whileTap 自然失效，无需额外判断）；
 *   - 中间数值 w-8 text-center font-bold tabular-nums（等宽数字防抖动）；
 *   - min/max 不传即无界；onChange 始终输出夹紧后的值，调用方无需再 clamp。
 */
import { motion } from 'framer-motion';
import { TAP } from '@/utils/motion';

export interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  /** 下界（含）。不传则无下界 */
  min?: number;
  /** 上界（含）。不传则无上界 */
  max?: number;
  /** 步长，默认 1 */
  step?: number;
  /** 数值代表的含义（如「点数」「目标次数」），供读屏器使用 */
  'aria-label': string;
}

/** 消除浮点步长（如 0.1）累加产生的 0.30000000000000004 类尾差 */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const BTN_CLASS =
  'w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 ' +
  'font-bold text-lg flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed';

export const Stepper = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  'aria-label': ariaLabel,
}: StepperProps) => {
  const canDec = min === undefined || value > min;
  const canInc = max === undefined || value < max;

  const nudge = (dir: 1 | -1) => {
    const next = round6(value + dir * step);
    // 双向夹紧：value 本身越界（外部数据脏）时也能被一步拉回合法区间
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
    onChange(clamped);
  };

  return (
    <div role="group" aria-label={ariaLabel} className="flex items-center gap-1">
      <motion.button
        type="button"
        whileTap={TAP}
        disabled={!canDec}
        onClick={() => nudge(-1)}
        aria-label="减少"
        className={BTN_CLASS}
      >
        −
      </motion.button>
      {/* aria-live：步进后读屏器播报新值（按钮焦点不动，值在旁边变） */}
      <span
        aria-live="polite"
        className="w-8 text-center font-bold tabular-nums text-gray-800 dark:text-white"
      >
        {value}
      </span>
      <motion.button
        type="button"
        whileTap={TAP}
        disabled={!canInc}
        onClick={() => nudge(1)}
        aria-label="增加"
        className={BTN_CLASS}
      >
        +
      </motion.button>
    </div>
  );
};
