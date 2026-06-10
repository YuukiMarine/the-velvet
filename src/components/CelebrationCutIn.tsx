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
}: CelebrationCutInProps) => {
  const titleId = useId();
  const containerRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);
  useAutoClose(isOpen, autoCloseMs, onClose);
  useFeedbackOnce(isOpen, onShown);

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
            className={`relative w-full max-w-md overflow-hidden rounded-3xl p-8 shadow-2xl ${THEME_BG[theme]}`}
          >
            {/* 装饰层：纵向高光 + 斜光带（只有装饰可倾斜，文字层恒水平） */}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-transparent via-white/15 to-transparent" />
            {/* 角度同源：随 --ui-skew 总旋钮变陡、随 --boldness 归零（D0 放平） */}
            <div
              aria-hidden
              className="absolute -left-10 top-8 h-14 w-[150%] bg-white/10"
              style={{ transform: 'rotate(calc(var(--ui-skew) * 1.5 * var(--boldness)))' }}
            />
            {particles > 0 && <ParticleBurst count={particles} colors={THEME_PARTICLES[theme]} />}

            <div className="relative z-10 text-center">
              {icon && <div className="mb-4 text-7xl">{icon}</div>}
              <h2 id={titleId} className="text-3xl font-bold text-white">
                {title}
              </h2>
              {subtitle && <p className="mt-2 text-base text-white/85">{subtitle}</p>}
              {children && <div className="mt-4 text-white/90">{children}</div>}
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

            {/* 自动关闭倒计时：进度条本身也是"还能看多久"的提示，点 backdrop 随时跳过 */}
            {autoCloseMs > 0 && (
              <div aria-hidden className="absolute inset-x-0 bottom-0 z-10 h-1 bg-white/20">
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: autoCloseMs / 1000, ease: 'linear' }}
                  className="h-full bg-white/80"
                />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
