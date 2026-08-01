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
 *
 * 频道皮肤：P4 绿胶囊白圆花 / P3 斜切双段（浅青轨+蓝平行四边形滑块）/ neutral 圆胶囊。
 */
import { motion } from 'motion/react';
import { springSnappy } from '@/utils/motion';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower } from '@/ui/p4Kit';

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
}: ToggleProps) => {
  const channel = useUiChannel();
  const isP4 = channel === 'p4';
  const p3 = channel === 'p3';

  // ── P5R（p5-settings 设计稿）：不规则黑框壳 + 状态字（关/开）+ 微斜方块滑块
  //   （关=黑块右、开=红块左，字换侧；反板正——壳与滑块都不许是板正矩形）──
  if (channel === 'p5') {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-[26px] w-[58px] flex-shrink-0 items-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {/* 不规则壳：黑框 + 纸面（双层错位多边形） */}
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute inset-0" style={{ transform: 'translate(2px,2.5px)', background: '#000000', clipPath: 'polygon(2.1px 1.4px, calc(100% - 0.8px) 2.6px, calc(100% - 2.4px) calc(100% - 1.1px), 1.2px calc(100% - 2.2px))' }} />
          <span className="absolute inset-0" style={{ background: '#050505', clipPath: 'polygon(1.6px 2.2px, calc(100% - 1.9px) 0.7px, calc(100% - 0.9px) calc(100% - 2.4px), 0.8px calc(100% - 1.3px))' }} />
          <span className="absolute inset-[2.5px]" style={{ background: disabled ? '#dcd4c4' : '#f0e9df', clipPath: 'polygon(1.2px 0.8px, calc(100% - 0.6px) 1.6px, calc(100% - 1.5px) calc(100% - 0.7px), 0.5px calc(100% - 1.4px))' }} />
        </span>
        <span
          aria-hidden
          className={`absolute text-[11px] font-black leading-none ${checked ? 'left-[7px]' : 'right-[7px]'}`}
          style={{ color: '#050505' }}
        >
          {checked ? '开' : '关'}
        </span>
        {/* 滑块方向按通用直觉：开=靠右、关=靠左（此前是反的，用户上报） */}
        <motion.span
          aria-hidden
          className="absolute top-[3px] h-[19px] w-[24px]"
          style={{ background: checked ? '#c00008' : '#050505', clipPath: 'polygon(1.5px 0.5px, calc(100% - 0.5px) 1.8px, calc(100% - 1.8px) calc(100% - 0.6px), 0.4px calc(100% - 1.6px))', rotate: checked ? -2 : 2 }}
          initial={false}
          animate={{ x: checked ? 27 : 3 }}
          transition={springSnappy}
        />
      </button>
    );
  }

  // p4-redraw 定稿：加大绿胶囊（48×28），白圆旋钮内嵌黑色五瓣花
  if (isP4) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex flex-shrink-0 w-12 h-7 rounded-full transition-colors ${
          checked ? 'bg-[var(--p4-green,#55c34f)]' : 'bg-[#d9d2ac]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ boxShadow: 'inset 0 1px 2px rgba(19,19,19,0.15)' }}
      >
        <motion.span
          aria-hidden="true"
          className="absolute top-0.5 left-0 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm"
          initial={false}
          animate={{ x: checked ? 22 : 2 }}
          transition={springSnappy}
        >
          <P4Flower size={13} color={checked ? '#131313' : 'rgba(19,19,19,0.35)'} />
        </motion.span>
      </button>
    );
  }

  // ── P3R（p3-settings 设计稿）：斜切双段开关——浅青轨 + 蓝色平行四边形滑块 ──
  if (p3) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-12 flex-shrink-0 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        style={{ clipPath: 'polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)', background: checked ? '#aee5f2' : '#dfe9f1' }}
      >
        <motion.span
          aria-hidden="true"
          className="absolute top-0 left-0 h-6 w-6"
          style={{ clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)', background: checked ? 'var(--p3r-blue, #1b57ff)' : '#9fb4c6' }}
          initial={false}
          animate={{ x: checked ? 24 : 1 }}
          transition={springSnappy}
        />
      </button>
    );
  }

  return (
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
};
