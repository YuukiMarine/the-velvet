/**
 * Toggle — 行动域统一开关（UI_AUDIT_V2.5.md §3.2：收敛 3 套开关实现）。
 *
 * 替换对象（三套制式各不相同）：
 *   - Todos.tsx:961-973 / 1812-1823（同款复制两份）w-12 h-7 / on=bg-emerald-500
 *     / translate-x-1↔5 / CSS transition / button 无 role
 *   - Activities.tsx:949-954  w-10 h-6 / on=bg-amber-400 / translate-x-0.5↔[18px]
 *     / div 无语义无键盘
 *   - Activities.tsx:1369-1372  原生 input[type=checkbox]（视觉上是方框非开关）
 *
 * 统一制式与约束：
 *   - 轨道 w-11 h-6（44×24px），off=bg-gray-200 dark:bg-gray-700，on=bg-primary；
 *   - 滑块 w-5 h-5（20px），垂直居中 top-0.5（2px），水平位移 2px ↔ 22px
 *     （= translate-x-[2px] ↔ translate-x-[22px]；44 − 20 − 2 = 22，两端留白对称）；
 *   - 位移由 framer `animate.x` 驱动 + springSnappy（D2 控件预算 <300ms）。
 *     取舍：framer 写 inline transform 会覆盖 Tailwind 的 translate-x-* 类
 *     （两者互斥，类会变死代码），因此位移只走 motion，不重复挂类；
 *   - 轨道底色用 CSS transition-colors（颜色不参与弹簧）；
 *   - 语义：button role="switch" + aria-checked，aria-label 必传（开关旁的
 *     文字 label 往往在调用方布局里，不能指望它被关联上）。
 */
import { motion } from 'framer-motion';
import { springSnappy } from '@/utils/motion';

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** 开关代表的设置项名称（如「仅显示重要记录」），供读屏器使用 */
  'aria-label': string;
}

export const Toggle = ({
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex flex-shrink-0 w-11 h-6 rounded-full transition-colors ${
      checked ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    {/* 滑块：x = 2px(off) ↔ 22px(on)，initial=false 避免挂载时空播一次弹簧 */}
    <motion.span
      aria-hidden="true"
      className="absolute top-0.5 left-0 w-5 h-5 bg-white rounded-full shadow-sm"
      initial={false}
      animate={{ x: checked ? 22 : 2 }}
      transition={springSnappy}
    />
  </button>
);
