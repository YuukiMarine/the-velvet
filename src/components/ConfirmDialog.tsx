import { AnimatePresence, motion } from 'motion/react';
import { ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';
import { springSoft, TAP } from '@/utils/motion';
import { useBackHandler } from '@/utils/useBackHandler';
import { useModalA11y } from '@/utils/useModalA11y';
import { useUiChannel } from '@/ui/useUiChannel';
import { zClass } from '@/utils/zIndex';
import { P4Flower, P4Sparkle, P4StickerPanel } from '@/ui/p4Kit';
import { PersonaButton } from '@/ui/components/PersonaButton';

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
  const channel = useUiChannel();
  const isP4 = channel === 'p4' && !forceDark;

  /** p4 动作按钮 tone → PersonaButton 形态（default=奶油 / primary=橙确认 / danger=红） */
  const p4Action = (t: NonNullable<ConfirmAction['tone']> | undefined) =>
    t === 'danger'
      ? { variant: 'danger' as const, active: false }
      : t === 'primary'
        ? { variant: 'primary' as const, active: true }
        : { variant: 'secondary' as const, active: false };
  // P3R（蓝频道）：白斜卡面板 + 斜切双钮（取消浅青 / 确认蓝、危险洋红）
  const p3 = channel === 'p3' && !forceDark;
  // P5R（p5-modal-01 稿）：微斜纸卡 + 右上大红星 + 不规则双钮（取消纸 / 确认红）
  const p5 = channel === 'p5' && !forceDark;
  const p5BtnClip = 'polygon(3px 1px, calc(100% - 1px) 3px, calc(100% - 3px) calc(100% - 1px), 1px calc(100% - 3px))';
  const p3Clip = 'polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)';
  const p3ConfirmBg: Record<ConfirmTone, string> = { default: 'var(--p3r-blue, #1b57ff)', danger: 'var(--p3r-magenta, #f0417f)', warning: '#f5a623' };
  const p3ActionStyle = (t: NonNullable<ConfirmAction['tone']>) =>
    t === 'primary' ? { clipPath: p3Clip, background: 'var(--p3r-blue, #1b57ff)', color: '#fff' }
    : t === 'danger' ? { clipPath: p3Clip, background: 'var(--p3r-magenta, #f0417f)', color: '#fff' }
    : { clipPath: p3Clip, background: 'var(--p3r-cyan-pale, #cfeaf6)', color: 'var(--p3r-ink, #0a1230)' };

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
            className={
              isP4
                ? 'relative w-full max-w-sm'
                : p5
                  ? 'p5-reskin relative w-full max-w-sm p-6'
                : p3
                  ? 'w-full max-w-sm bg-white p-6 shadow-2xl'
                  : 'w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900'
            }
            style={p5
              ? { background: '#f0e9df', clipPath: 'polygon(9px 6px, 38% 1px, calc(100% - 5px) 9px, calc(100% - 10px) calc(100% - 6px), 55% calc(100% - 1px), 5px calc(100% - 10px))', boxShadow: '0 0 0 3px #050505, 7px 8px 0 #000000', transform: 'rotate(-0.6deg)' }
              : p3 ? { clipPath: 'polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%)' } : undefined}
          >
            {/* P5：右上大红星（纸描边）+ 左下黑星贴 */}
            {p5 && (
              <>
                <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute -right-5 -top-6 h-16 w-16">
                  <polygon points="50,2 61.8,38.2 100,38.2 69.1,60.6 80.9,96.8 50,74.4 19.1,96.8 30.9,60.6 0,38.2 38.2,38.2" fill="#c00008" stroke="#f0e9df" strokeWidth="6" />
                </svg>
                <svg aria-hidden viewBox="0 0 100 100" className="pointer-events-none absolute -bottom-4 -left-3 h-9 w-9" style={{ transform: 'rotate(-14deg)' }}>
                  <polygon points="50,2 61.8,38.2 100,38.2 69.1,60.6 80.9,96.8 50,74.4 19.1,96.8 30.9,60.6 0,38.2 38.2,38.2" fill="#050505" />
                </svg>
              </>
            )}
            {isP4 ? (
              /* p4-redraw modal-01 v3：黑色八角贴纸 + 奶油描边，橙圆图标 + 衬线标题，
                 周身贴橙硬币/蓝星闪/蓝花贴纸；按钮走 PersonaButton 斜切胶囊 */
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-9 right-12 h-20 w-20 rounded-full border-4 border-[#fff6d0]"
                  style={{ background: 'radial-gradient(circle at 50% 40%, #ffcf3f 0 42%, var(--p4-orange, #f9a11b) 43% 100%)' }}
                >
                  <P4Sparkle size={26} color="#ffffff" className="absolute left-1/2 top-1/2 -ml-3.5 -mt-3.5" />
                </div>
                <P4Sparkle size={24} color="var(--ui-accent)" className="pointer-events-none absolute -left-2 top-16" />
                <span aria-hidden className="pointer-events-none absolute -bottom-5 -right-1 block h-16 w-16">
                  <P4Flower size={62} color="#fff6d0" className="absolute -left-1 -top-1" />
                  <P4Flower size={50} color="var(--ui-accent)" className="absolute left-1.5 top-1.5" />
                </span>

                <P4StickerPanel className="relative" contentClassName="p-5 pb-6">
                  {!busy && (
                    <button
                      type="button"
                      aria-label="关闭"
                      onClick={onCancel}
                      className="absolute right-3.5 top-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#fff6d0] text-base font-black text-[#131313]"
                    >
                      ✕
                    </button>
                  )}
                  <div className="flex items-center gap-3 pr-9">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--p4-orange, #f9a11b)' }}>
                      {icon ?? <P4Sparkle size={20} color="#ffffff" />}
                    </span>
                    <h2
                      id={titleId}
                      className="text-[22px] font-black leading-tight text-[#fff6d0]"
                      style={{ fontFamily: 'var(--p4-display-font, serif)' }}
                    >
                      {title}
                    </h2>
                  </div>
                  {description && (
                    <p id={descId} className="mt-3 whitespace-pre-line text-sm font-semibold leading-relaxed text-[#fff6d0]/90">
                      {description}
                    </p>
                  )}
                  {children && <div className="mt-3">{children}</div>}

                  <div className="mt-5 flex gap-3">
                    {visibleActions ? (
                      visibleActions.map((action, i) => {
                        const s = p4Action(action.tone);
                        return (
                          <PersonaButton
                            key={i}
                            variant={s.variant}
                            active={s.active}
                            disabled={busy}
                            onClick={action.onClick}
                            className="flex-1"
                          >
                            {action.label}
                          </PersonaButton>
                        );
                      })
                    ) : (
                      <>
                        <PersonaButton
                          variant="secondary"
                          disabled={busy}
                          onClick={onCancel}
                          leadingIcon={<P4Flower size={14} />}
                          className="flex-1"
                        >
                          {cancelText}
                        </PersonaButton>
                        <PersonaButton
                          variant={tone === 'default' ? 'primary' : 'danger'}
                          active={tone === 'default'}
                          busy={busy}
                          onClick={onConfirm}
                          className="flex-1"
                        >
                          {confirmText}
                        </PersonaButton>
                      </>
                    )}
                  </div>
                </P4StickerPanel>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="mb-3 text-4xl">{icon ?? (tone === 'default' ? '❓' : '⚠️')}</div>
                  <h2
                    id={titleId}
                    className={p3 ? 'mb-2 text-lg font-black italic tracking-tight text-[#0a1230]' : 'mb-2 text-lg font-bold text-gray-800 dark:text-white'}
                  >
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
                        className={p3 || p5 ? 'flex-1 py-2.5 text-sm font-black disabled:opacity-50' : `flex-1 rounded-xl py-2.5 text-sm font-bold disabled:opacity-50 ${ACTION_BTN[action.tone ?? 'default']}`}
                        style={p5
                          ? ((action.tone ?? 'default') === 'primary' || (action.tone ?? 'default') === 'danger'
                              ? { clipPath: p5BtnClip, background: '#c00008', color: '#fff', boxShadow: '0 0 0 2.5px #050505, 3px 3px 0 #000000' }
                              : { clipPath: p5BtnClip, background: '#f0e9df', color: '#050505', boxShadow: '0 0 0 2.5px #050505, 3px 3px 0 #000000' })
                          : p3 ? p3ActionStyle(action.tone ?? 'default') : undefined}
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
                        className={p3 || p5 ? 'flex-1 py-2.5 text-sm font-black disabled:opacity-50' : 'flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-bold text-gray-700 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200'}
                        style={p5
                          ? { clipPath: p5BtnClip, background: '#f0e9df', color: '#050505', boxShadow: '0 0 0 2.5px #050505, 3px 3px 0 #000000', transform: 'rotate(-0.8deg)' }
                          : p3 ? { clipPath: p3Clip, background: 'var(--p3r-cyan-pale, #cfeaf6)', color: 'var(--p3r-ink, #0a1230)' } : undefined}
                      >
                        {cancelText}
                      </motion.button>
                      <motion.button
                        whileTap={TAP}
                        disabled={busy}
                        onClick={onConfirm}
                        className={p3 || p5 ? 'flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-black text-white disabled:opacity-50' : `flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${CONFIRM_BTN[tone]}`}
                        style={p5
                          ? { clipPath: p5BtnClip, background: '#c00008', boxShadow: '0 0 0 2.5px #050505, 3px 3px 0 #000000', transform: 'rotate(0.8deg)' }
                          : p3 ? { clipPath: p3Clip, background: p3ConfirmBg[tone] } : undefined}
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
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
