/**
 * ListCard — 行动域统一列表卡容器（UI_AUDIT_V2.5.md §3.2：合并两套列表卡语言）。
 *
 * 融合对象：
 *   - Todos.tsx:36-45    rounded-xl 灰底（bg-gray-50）无强调条 + 长按 scale 0.97
 *   - Activities.tsx:1096/1123-1128 rounded-2xl 白底 + 左侧 w-1 彩色竖条
 * 统一取向：Activities 的「左强调条 + 标准白卡底」做骨架，Todos 的长按手感做交互。
 *
 * 制式与约束：
 *   - 卡底 rounded-2xl border-gray-100/800 bg-white/gray-900 px-4 py-3；
 *     有 accent 时左 padding 升为 pl-5（给 w-1 竖条留出呼吸位）；
 *   - accent 传完整 bg-* 字面量（如 'bg-amber-400'）——Tailwind JIT 无法识别
 *     拼接类名，调用方负责给全；竖条 absolute left-0 inset-y-0 w-1，纯装饰
 *     aria-hidden；
 *   - onLongPress 内部接 @/utils/useLongPress（500ms 全站统一，自带 10px 位移
 *     容差：滑动列表不会误触）。该 hook 不抑制长按成功后的原生 click，由本组件
 *     用 ref 标记吞掉那一次 click——否则 onClick 与 onLongPress 共存时长按松手
 *     会连带触发点击；
 *   - 按压反馈分两路，互斥不叠加：
 *       有 onLongPress → pressing 期 animate scale 0.97（沿用 Todos 手感，
 *         短按/长按都有反馈）；
 *       仅 onClick   → whileTap=TAP（全站统一 0.95）。
 *     两路同挂会在按压期打架（whileTap 抢占 animate），故二选一；
 *   - 根元素语义：有 onClick 用 button（w-full text-left），否则 div。卡内的
 *     操作按钮需自行 e.stopPropagation()（onPointerDown + onClick，Todos 现有
 *     约定）——既挡冒泡点击，也挡卡片长按计时的启动；
 *   - dimmed（归档/完成态）= opacity-75 整体降明度，内容结构不变。
 */
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TAP } from '@/utils/motion';
import { useLongPress } from '@/utils/useLongPress';

export interface ListCardProps {
  /** 左强调条颜色：完整 bg-* 字面量（如 'bg-amber-400'）。不传则无条 */
  accent?: string;
  onClick?: () => void;
  onLongPress?: () => void;
  /** 归档/完成态降明度（opacity-75） */
  dimmed?: boolean;
  className?: string;
  children: ReactNode;
}

export const ListCard = ({
  accent,
  onClick,
  onLongPress,
  dimmed = false,
  className,
  children,
}: ListCardProps) => {
  // 长按成功标记：吞掉随后的原生 click（useLongPress 自身不做 click 抑制）
  const longPressedRef = useRef(false);

  // rules of hooks：无条件调用；没传 onLongPress 时不挂 bindings 即可
  const { pressing, bindings } = useLongPress(() => {
    longPressedRef.current = true;
    onLongPress?.();
  });

  const pressProps = onLongPress
    ? {
        ...bindings,
        onPointerDown: (e: React.PointerEvent) => {
          // 每轮按压开始时清标记：长按后若浏览器没派发 click（手指大幅滑走），
          // 残留的 true 不能吞掉下一次正常点击
          longPressedRef.current = false;
          bindings.onPointerDown(e);
        },
        // pressing 期 scale 0.97（Todos 现有手感：duration 0.15 直达，不用弹簧）
        animate: { scale: pressing ? 0.97 : 1 },
        transition: { duration: 0.15 },
      }
    : {};

  const handleClick = () => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return; // 这次 click 是长按的"尾巴"，吞掉
    }
    onClick?.();
  };

  const cardClass = [
    'relative overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800',
    'bg-white dark:bg-gray-900 py-3',
    accent ? 'pl-5 pr-4' : 'px-4',
    // 可长按的卡禁掉文字选区，否则按住 500ms 会先拉出蓝色选区
    onLongPress ? 'select-none' : '',
    dimmed ? 'opacity-75' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      {accent && (
        <span aria-hidden="true" className={`absolute left-0 inset-y-0 w-1 ${accent}`} />
      )}
      {children}
    </>
  );

  if (onClick) {
    return (
      <motion.button
        type="button"
        onClick={handleClick}
        // 仅 onClick 时给全站统一 TAP；有 onLongPress 时按压反馈由 pressing 承担
        {...(onLongPress ? {} : { whileTap: TAP })}
        {...pressProps}
        className={`w-full text-left ${cardClass}`}
      >
        {inner}
      </motion.button>
    );
  }

  return (
    <motion.div {...pressProps} className={cardClass}>
      {inner}
    </motion.div>
  );
};
