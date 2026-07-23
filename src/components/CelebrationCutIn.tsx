import { AnimatePresence, motion } from 'motion/react';
import { ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';
import { ParticleBurst } from './ParticleBurst';
import { springSoft, TAP } from '@/utils/motion';
import { useAutoClose } from '@/utils/useAutoClose';
import { useBackHandler } from '@/utils/useBackHandler';
import { useFeedbackOnce } from '@/utils/useFeedbackOnce';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower, P4Sparkle } from '@/ui/p4Kit';

/**
 * CelebrationCutIn —— 庆祝弹窗基座（UI_AUDIT_V2.5.md §5：收口庆祝四件套
 * LevelUp / AchievementUnlock / SkillUnlock / TodoComplete 及后续 VictoryModal）。
 *
 * 约束：
 *   - 关闭三通道全配且永不锁死：自动关闭 + 点 backdrop 跳过 + 右上 X（审计 §4.6
 *     "庆祝类一律双通道"；庆祝没有 busy 概念，用户任何时刻可跳过）。
 *   - 音效/震动不在基座内：调用方经 onShown 接入（useFeedbackOnce 保证每次打开仅一次）。
 *   - z 用 zClass.celebration（90）：压过 modal/confirm，但让位给 cutin（120）。
 *   - AnimatePresence 在组件内部包条件渲染，exit 才真正播放（审计 B14 根治模式）。
 *   - "字恒水平"铁律：倾斜只发生在装饰光带（aria-hidden），文字层只 translate 永不 rotate/skew。
 *   - 四主题渐变必须是完整字面量（JIT），不可按 theme 拼接类名。
 */

type CelebrationTheme = 'gold' | 'violet' | 'emerald' | 'slate';

export interface CelebrationCutInProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: CelebrationTheme;
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** 自动关闭毫秒数，0=不自动关 */
  autoCloseMs?: number;
  /** 粒子数，0=关 */
  particles?: number;
  /** 每次打开只触发一次；调用方在此接音效/震动 */
  onShown?: () => void;
  showClose?: boolean;
  /** 渲染在卡片外、backdrop 层内的附加效果（如 MusicalNotes 音符雨），不受卡片 overflow 裁切 */
  overlayExtras?: ReactNode;
}

// 四主题渐变与粒子配色——完整字面量，JIT 可见
const THEME_BG: Record<CelebrationTheme, string> = {
  gold: 'bg-gradient-to-br from-yellow-400 via-orange-400 to-red-400',
  violet: 'bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600',
  emerald: 'bg-gradient-to-br from-emerald-500 via-green-600 to-teal-600',
  slate: 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800',
};

const THEME_PARTICLES: Record<CelebrationTheme, string[]> = {
  gold: ['bg-yellow-300', 'bg-amber-200', 'bg-orange-300', 'bg-white'],
  violet: ['bg-purple-300', 'bg-indigo-300', 'bg-blue-300', 'bg-white'],
  emerald: ['bg-emerald-300', 'bg-teal-200', 'bg-green-300', 'bg-white'],
  slate: ['bg-slate-300', 'bg-gray-200', 'bg-slate-400', 'bg-white'],
};

export const CelebrationCutIn = ({
  isOpen,
  onClose,
  theme = 'gold',
  icon,
  title,
  subtitle,
  children,
  autoCloseMs = 3500,
  particles = 24,
  onShown,
  showClose = true,
  overlayExtras,
}: CelebrationCutInProps) => {
  const titleId = useId();
  const containerRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);
  useAutoClose(isOpen, autoCloseMs, onClose);
  useFeedbackOnce(isOpen, onShown);
  // p4-redraw modal-05/06/07 v3：庆祝一律「橙色大圆贴纸」——奶油描边圆 + 黑斜章标题 + 花/星贴饰
  const isP4 = useUiChannel() === 'p4';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.celebration} flex items-center justify-center bg-black/60 p-4`}
          onClick={onClose}
        >
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ scale: 0.5, opacity: 0, x: -12, y: 12 }}
            animate={{ scale: 1, opacity: 1, x: 0, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, x: -12, y: 12 }}
            transition={springSoft}
            onClick={(e) => e.stopPropagation()}
            className={
              isP4
                ? 'p4-cutin relative aspect-square w-full max-w-[350px] overflow-visible p-8'
                : `relative w-full max-w-md overflow-hidden rounded-3xl p-8 shadow-2xl ${THEME_BG[theme]}`
            }
            style={
              isP4
                ? {
                    background: 'radial-gradient(circle at 50% 42%, #ffc93f 0 42%, var(--p4-orange, #f9a11b) 43% 100%)',
                    borderRadius: '50%',
                    boxShadow: '0 0 0 4px #ffd900, 0 0 0 11px #fff6d0, 0 10px 0 11px rgba(19,19,19,0.25)',
                  }
                : undefined
            }
          >
            {/* 装饰层：纵向高光 + 斜光带（只有装饰可倾斜，文字层恒水平） */}
            {!isP4 && (
              <>
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-transparent via-white/15 to-transparent" />
                {/* 角度同源：随 --ui-skew 总旋钮变陡、随 --boldness 归零（D0 放平） */}
                <div
                  aria-hidden
                  className="absolute -left-10 top-8 h-14 w-[150%] bg-white/10"
                  style={{ transform: 'rotate(calc(var(--ui-skew) * 1.5 * var(--boldness)))' }}
                />
              </>
            )}
            {isP4 && (
              <>
                <P4Sparkle size={34} color="#ffffff" className="pointer-events-none absolute left-1/2 -top-5 -ml-4" />
                <P4Sparkle size={24} color="var(--ui-accent)" className="pointer-events-none absolute -left-2 top-16" />
                <P4Sparkle size={20} color="#ffd900" className="pointer-events-none absolute -right-1 top-14" />
                <P4Flower size={54} color="#ffd900" className="pointer-events-none absolute -right-4 bottom-20" />
                <P4Flower size={60} color="var(--ui-accent)" className="pointer-events-none absolute -left-6 bottom-10" />
              </>
            )}
            {particles > 0 && <ParticleBurst count={particles} colors={THEME_PARTICLES[theme]} />}

            <div className={`relative z-10 text-center ${isP4 ? 'flex h-full flex-col items-center justify-center' : ''}`}>
              {icon && !isP4 && <div className="mb-4 text-7xl">{icon}</div>}
              {isP4 ? (
                <div className="inline-block -rotate-3 bg-[#131313] px-5 py-2" style={{ borderRadius: 10 }}>
                  <h2
                    id={titleId}
                    className="text-[20px] font-black leading-none text-[var(--ui-bg,#ffd900)]"
                    style={{ fontFamily: 'var(--p4-display-font, serif)' }}
                  >
                    {title}
                  </h2>
                </div>
              ) : (
                <h2 id={titleId} className="text-3xl font-bold text-white">
                  {title}
                </h2>
              )}
              {subtitle && <p className={`mt-2 text-base ${isP4 ? 'font-black text-[#131313]' : 'text-white/85'}`}>{subtitle}</p>}
              {children && <div className={`mt-4 ${isP4 ? '' : 'text-white/90'}`}>{children}</div>}
            </div>

            {showClose && (
              <motion.button
                whileTap={TAP}
                onClick={onClose}
                aria-label="关闭"
                className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-xl text-white/80 transition-colors hover:bg-white/30 hover:text-white"
              >
                ×
              </motion.button>
            )}

            {/* 自动关闭倒计时：进度条本身也是"还能看多久"的提示，点 backdrop 随时跳过。
                P4 圆贴纸下沿放短条（圆形卡裁不下全宽直条）。 */}
            {autoCloseMs > 0 && (
              <div
                aria-hidden
                className={`absolute z-10 overflow-hidden ${
                  isP4 ? 'inset-x-16 bottom-6 h-1.5 rounded-full bg-[#131313]/20' : 'inset-x-0 bottom-0 h-1 bg-white/20'
                }`}
              >
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: autoCloseMs / 1000, ease: 'linear' }}
                  className={`h-full ${isP4 ? 'rounded-full bg-[#131313]/70' : 'bg-white/80'}`}
                />
              </div>
            )}
          </motion.div>
          {overlayExtras}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
