import { AnimatePresence, motion } from 'motion/react';
import { ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';
import { springSoft, TAP } from '@/utils/motion';
import { useBackHandler } from '@/utils/useBackHandler';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';

/**
 * ConfirmDialog —— 确认弹窗基座（UI_AUDIT_V2.5.md §5：收口全仓 11 处手写确认弹窗）。
 *
 * 约束：
 *   - 铁律：取消恒在左、危险/主操作恒在右（§4.6 交互协议）。actions 模式下排序权在
 *     调用方，必须遵守同一约定。
 *   - z 用 zClass.confirm（60）：可叠在 SheetModal（50）之上做二段确认。
 *   - AnimatePresence 在组件内部包条件渲染，exit 才真正播放（审计 B14 根治模式——
 *     绝不允许 if(!isOpen) return null 写在它外侧）。
 *   - busy=true 时三条关闭通道（backdrop / ESC / Android back）与全部按钮一并锁死，
 *     防止提交中误关导致状态分叉。
 *   - 入场斜向位移（x:-12, y:12）是斜界系统动效签名；只 translate 不 rotate/skew，
 *     "字恒水平"天然满足。
 */

type ConfirmTone = 'default' | 'danger' | 'warning';

export interface ConfirmAction {
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'primary';
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  /** 富内容槽：渲染在描述下方（输入框 / 列表 / 进度等） */
  children?: ReactNode;
  /** 缺省按 tone 取 ⚠️ / ❓ */
  icon?: ReactNode;
  tone?: ConfirmTone;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 提供时取代双按钮（最多 3 个，多余裁掉）；排序须守"取消在左、危险/主操作在右" */
  actions?: ConfirmAction[];
  busy?: boolean;
  /** 强制暗色语境：portal 根加 `dark` 类，使弹窗按 dark: 变体渲染（嵌入暗色场景用） */
  forceDark?: boolean;
}

// 确认键底色按 tone 取——完整字面量，JIT 可见
const CONFIRM_BTN: Record<ConfirmTone, string> = {
  default: 'bg-primary',
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
};

const ACTION_BTN: Record<NonNullable<ConfirmAction['tone']>, string> = {
  default: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  primary: 'bg-primary text-white',
  danger: 'bg-red-500 text-white',
};

export const ConfirmDialog = ({
  isOpen,
  title = '确认操作',
  description,
  children,
  icon,
  tone = 'default',
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  actions,
  busy = false,
  forceDark = false,
}: ConfirmDialogProps) => {
  const titleId = useId();
  const descId = useId();
  const containerRef = useModalA11y(isOpen, onCancel, { closeOnEscape: !busy });
  useBackHandler(isOpen, () => {
    if (!busy) onCancel();
  });

  const visibleActions = actions?.slice(0, 3);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.confirm} flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm ${forceDark ? 'dark' : ''}`}
          onClick={() => {
            if (!busy) onCancel();
          }}
        >
          <motion.div
            ref={containerRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            initial={{ opacity: 0, scale: 0.92, x: -12, y: 12 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, x: -12, y: 12 }}
            transition={springSoft}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900"
          >
            <div className="text-center">
              <div className="mb-3 text-4xl">{icon ?? (tone === 'default' ? '❓' : '⚠️')}</div>
              <h2 id={titleId} className="mb-2 text-lg font-bold text-gray-800 dark:text-white">
                {title}
              </h2>
              {description && (
                <p id={descId} className="whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">
                  {description}
                </p>
              )}
            </div>
            {children && <div className="mt-3">{children}</div>}

            <div className="mt-6 flex gap-3">
              {visibleActions ? (
                visibleActions.map((action, i) => (
                  <motion.button
                    key={i}
                    whileTap={TAP}
                    disabled={busy}
                    onClick={action.onClick}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 ${ACTION_BTN[action.tone ?? 'default']}`}
                  >
                    {action.label}
                  </motion.button>
                ))
              ) : (
                <>
                  <motion.button
                    whileTap={TAP}
                    disabled={busy}
                    onClick={onCancel}
                    className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-bold text-gray-700 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200"
                  >
                    {cancelText}
                  </motion.button>
                  <motion.button
                    whileTap={TAP}
                    disabled={busy}
                    onClick={onConfirm}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${CONFIRM_BTN[tone]}`}
                  >
                    {busy && (
                      <span
                        aria-hidden
                        className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                      />
                    )}
                    {confirmText}
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
