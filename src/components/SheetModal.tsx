import { AnimatePresence, motion } from 'motion/react';
import type { Target } from 'motion/react';
import { ReactNode, RefObject, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { springSoft } from '@/utils/motion';
import { useBackHandler } from '@/utils/useBackHandler';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower, P4Sparkle } from '@/ui/p4Kit';

/**
 * SheetModal —— 标准弹窗 / 抽屉基座（UI_AUDIT_V2.5.md §5）。
 * bottom=底部抽屉（Activities 抽屉、Todos 编辑菜单），center=居中卡片（表单/裁剪类）。
 *
 * 约束：
 *   - createPortal 到 body：根治"父级 transform 创建 containing block 吃掉 fixed"
 *     （审计 §3.6——全仓此前仅 ImageCropDialog 做对了）。
 *   - AnimatePresence 在组件内部包条件渲染，exit 才真正播放（审计 B14 根治模式）。
 *   - busy=true 锁死 backdrop / ESC / Android back 三条关闭通道（提交中防误关）。
 *   - z 用 zClass.modal（50）：上面可叠 ConfirmDialog（60）做二段确认。
 *
 * 形状记忆生长 v1（UI_DESIGN_BOLD_V2.5.md §4.3）：originRef 在场时，打开瞬间测一次
 * 触发器矩形，面板从"触发器中心、scale 0.2"长到位，关闭逆向缩回原位——transform 近似。
 * 后续升级为 clip-path 顶点插值（UI_DESIGN_BOLD §6：触发器多边形 → 面板形状的 FLIP
 * morph，顶点 ≤8，首开采样 <45fps 永久降级 scale+fade），本组件 prop 契约保持不变。
 */

export interface SheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** bottom=底部抽屉（默认），center=居中卡片 */
  position?: 'bottom' | 'center';
  title?: string;
  children: ReactNode;
  /** sticky 底部槽：放主操作按钮，内容滚动时恒在视口内 */
  footer?: ReactNode;
  /** 触发器引用：在场时面板从该元素"长出来"，关闭缩回；缺失回退默认动画 */
  originRef?: RefObject<HTMLElement | null>;
  /** 提交中锁：禁用 backdrop / ESC / Android back 关闭 */
  busy?: boolean;
  maxHeightClass?: string;
  /** 顶部 handle 条，仅 bottom 生效 */
  showHandle?: boolean;
  closeOnBackdrop?: boolean;
  /**
   * 强制暗色语境：在 portal 根加 `dark` 类，让面板按 dark: 变体渲染。
   * 用于把弹窗嵌进一个与全局明暗无关的暗色场景（如 thief 频道的 P5 暗房）——
   * 局部 `<div className="dark">` 无法染到 portal 出去的子树，必须由基座自己加。
   */
  forceDark?: boolean;
}

export const SheetModal = ({
  isOpen,
  onClose,
  position = 'bottom',
  title,
  children,
  footer,
  originRef,
  busy = false,
  maxHeightClass = 'max-h-[90vh]',
  showHandle = true,
  closeOnBackdrop = true,
  forceDark = false,
}: SheetModalProps) => {
  const titleId = useId();
  const containerRef = useModalA11y(isOpen, onClose, { closeOnEscape: !busy });
  useBackHandler(isOpen, () => {
    if (!busy) onClose();
  });

  // 打开瞬间测一次触发器矩形（渲染期只读 DOM，幂等，StrictMode 双调安全）。
  // 偏移存 ref 而非 state：整个打开周期不变，exit 用同一偏移缩回原位。
  const originOffset = useRef<{ x: number; y: number } | null>(null);
  const wasOpen = useRef(false);
  if (isOpen && !wasOpen.current) {
    const el = originRef?.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      // 面板最终中心的近似锚点：center=视口中心；bottom 抽屉高度未知，
      // 按"占据底部约半屏"近似取视口 75% 高度处——v1 只求方向正确，clip-path 版会精确化
      const anchorX = window.innerWidth / 2;
      const anchorY = position === 'center' ? window.innerHeight / 2 : window.innerHeight * 0.75;
      originOffset.current = {
        x: rect.left + rect.width / 2 - anchorX,
        y: rect.top + rect.height / 2 - anchorY,
      };
    } else {
      originOffset.current = null;
    }
  }
  wasOpen.current = isOpen;

  const grow = originOffset.current;
  const panelMotion: { initial: Target; animate: Target; exit: Target } = grow
    ? {
        initial: { x: grow.x, y: grow.y, scale: 0.2, opacity: 0.6 },
        animate: { x: 0, y: 0, scale: 1, opacity: 1 },
        exit: { x: grow.x, y: grow.y, scale: 0.2, opacity: 0 },
      }
    : position === 'bottom'
      ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
      : {
          initial: { opacity: 0, scale: 0.95, x: -12, y: 12 },
          animate: { opacity: 1, scale: 1, x: 0, y: 0 },
          exit: { opacity: 0, scale: 0.95, x: -12, y: 12 },
        };

  const isBottom = position === 'bottom';
  const isP4 = useUiChannel() === 'p4';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.modal} flex bg-black/55 backdrop-blur-sm ${forceDark ? 'dark' : ''} ${
            isBottom ? 'items-end justify-center' : 'items-center justify-center'
          }`}
          onClick={() => {
            if (closeOnBackdrop && !busy) onClose();
          }}
        >
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            {...panelMotion}
            transition={springSoft}
            onClick={(e) => e.stopPropagation()}
            className={`flex w-full flex-col ${maxHeightClass} ${
              isP4
                ? `relative bg-[var(--ui-bg)] ${
                    isBottom ? 'mx-2 mb-2 rounded-[28px] pb-[env(safe-area-inset-bottom)]' : 'mx-4 max-w-md rounded-[28px]'
                  }`
                : `bg-white shadow-2xl dark:bg-gray-900 ${
                    isBottom ? 'rounded-t-3xl pb-[env(safe-area-inset-bottom)]' : 'mx-4 max-w-md rounded-2xl'
                  }`
            }`}
            style={
              isP4
                ? { border: '5px solid #fff6d0', boxShadow: '0 10px 0 rgba(19, 19, 19, 0.28)' }
                : undefined
            }
          >
            {/* p4-redraw modal v3：贴纸装饰 —— 顶部橙硬币、角落蓝/黄星闪、右上天空花瓣块 */}
            {isP4 && (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-8 left-1/2 -ml-8 h-16 w-16 rounded-full border-4 border-[#fff6d0]"
                  style={{ background: 'radial-gradient(circle at 50% 40%, #ffcf3f 0 42%, var(--p4-orange, #f9a11b) 43% 100%)' }}
                >
                  <P4Sparkle size={22} color="#ffffff" className="absolute left-1/2 top-1/2 -ml-3 -mt-3" />
                </div>
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-4 top-3 h-14 w-24 overflow-hidden rounded-2xl opacity-95"
                  style={{ background: 'linear-gradient(200deg, var(--p4-sky-deep, #2196e0) 0%, var(--p4-sky, #8fd0f4) 60%, #e8f6ff 100%)' }}
                >
                  <div className="absolute left-3 top-7 h-4 w-14 rounded-full bg-white/95" style={{ filter: 'blur(1px)' }} />
                  <div className="absolute left-9 top-4 h-3 w-10 rounded-full bg-white/80" style={{ filter: 'blur(1.5px)' }} />
                  <P4Flower size={40} color="var(--ui-bg)" className="absolute -right-2 top-2" />
                </div>
                <P4Sparkle size={22} color="var(--ui-accent)" className="pointer-events-none absolute -left-2.5 top-16" />
                <P4Sparkle size={24} color="var(--ui-accent)" className="pointer-events-none absolute -bottom-2 -right-1.5" />
                <P4Sparkle size={16} color="var(--p4-orange, #f9a11b)" className="pointer-events-none absolute -bottom-2.5 left-8" />
              </>
            )}
            {isBottom && showHandle && !isP4 && (
              <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
            )}
            {title && (
              <h2
                id={titleId}
                className={`shrink-0 px-6 pt-4 ${
                  isP4 ? 'pr-32 text-[26px] font-black leading-tight text-[#131313]' : 'text-lg font-bold text-gray-800 dark:text-white'
                }`}
                style={isP4 ? { fontFamily: 'var(--p4-display-font, serif)' } : undefined}
              >
                {title}
              </h2>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
              {children}
            </div>
            {footer && (
              <div className={`shrink-0 px-6 py-3 ${isP4 ? '' : 'border-t border-gray-100 dark:border-gray-800'}`}>
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
