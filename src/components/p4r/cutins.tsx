/**
 * P4R 庆祝演出（黄频道）—— 按用户给的三张定稿 1:1 转译：
 *   06 今日完成 / 记录成功：绿色四叶勾徽 + 黑题板 + 奶油旗标副文
 *   07 成就解锁：金环奖杯徽 + 黑题板 + 蓝名板 + 奶油旗标副文
 *   05 恭喜升级：橙盘 + 大属性名 + Lv.n → Lv.n 蓝圆号 + 奶油旗标副文
 *
 * 三张共用的贴纸语法（稿上每个零件都是同一套）：
 *   - 一律「奶油粗描边 + 柔投影」= STICKER_EDGE / STICKER_SHADOW，
 *     描边靠多层 drop-shadow 叠出来（比 stroke 能吃任意形状，含文字与 SVG）；
 *   - 黑色圆角题板（略微倾斜）压在主徽之上，字是奶油色；
 *   - 副文走「奶油旗标」：两端切角的横幅，压在题板下缘；
 *   - 四角星（P4Sparkle）与五瓣花（P4Flower）作点缀，蓝/黄/橙三色轮着来；
 *   - 关闭键 = 实心圆 + 一枚奶油四角星当 ✕。
 *
 * 出场统一节奏：舞台淡入 → 背景环弹开 → 主徽从 -120° 转正落位 → 题板自左拉开
 * → 副文旗标从下推入 → 四周星花迸开。D0（useBoldness=false）全部退化为终态。
 */
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { P4Flower, P4Sparkle, P4SunRings } from '@/ui/p4Kit';
import { useBoldness } from '@/utils/boldness';
import { triggerLevelFeedback, triggerSuccessFeedback } from '@/utils/feedback';
import { useAutoClose } from '@/utils/useAutoClose';
import { useBackHandler } from '@/utils/useBackHandler';
import { useFeedbackOnce } from '@/utils/useFeedbackOnce';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';

const CREAM = '#fff6d0';
const INK = '#131313';
const ORANGE = 'var(--p4-orange, #f9a11b)';
const BLUE = '#1668d8';
const GREEN = '#3faa4a';

/** 奶油粗描边 + 柔投影：稿上每个贴纸零件的统一收边。w = 描边视觉宽度（px） */
const sticker = (w = 5, shadow = '0 6px 10px rgba(19,19,19,0.32)'): CSSProperties => ({
  filter:
    `drop-shadow(0 ${w}px 0 ${CREAM}) drop-shadow(0 -${w}px 0 ${CREAM})` +
    ` drop-shadow(${w}px 0 0 ${CREAM}) drop-shadow(-${w}px 0 0 ${CREAM})` +
    ` drop-shadow(${w * 0.7}px ${w * 0.7}px 0 ${CREAM}) drop-shadow(-${w * 0.7}px ${w * 0.7}px 0 ${CREAM})` +
    ` drop-shadow(${w * 0.7}px -${w * 0.7}px 0 ${CREAM}) drop-shadow(-${w * 0.7}px -${w * 0.7}px 0 ${CREAM})` +
    ` drop-shadow(${shadow.split(' ').slice(0, 3).join(' ')} rgba(19,19,19,0.3))`,
});

/** 关闭键：实心圆 + 奶油四角星当 ✕（稿上三张都是这枚） */
const P4CloseKey = ({ onClose, tone = INK, className, style }: {
  onClose: () => void; tone?: string; className?: string; style?: CSSProperties;
}) => (
  <button
    type="button"
    onClick={onClose}
    aria-label="关闭"
    className={`absolute z-30 flex h-[52px] w-[52px] items-center justify-center rounded-full ${className ?? ''}`}
    style={{ background: tone, boxShadow: `0 0 0 5px ${CREAM}, 0 6px 12px rgba(19,19,19,0.34)`, ...style }}
  >
    <P4Sparkle size={26} color={CREAM} />
  </button>
);

/** 奶油旗标：两端切角的横幅（稿上副文都在这块上） */
const RIBBON_CLIP = 'polygon(0 0, 100% 0, calc(100% - 16px) 50%, 100% 100%, 0 100%, 16px 50%)';

const Ribbon = ({ children, delay, anim, rot = -1.5 }: {
  children: ReactNode; delay: number; anim: boolean; rot?: number;
}) => (
  <motion.div
    className="relative mx-auto mt-[-14px] w-fit max-w-full px-8 py-2"
    style={{ rotate: rot }}
    initial={anim ? { y: 22, opacity: 0 } : false}
    animate={{ y: 0, opacity: 1 }}
    transition={{ type: 'spring', stiffness: 380, damping: 26, delay }}
  >
    <span aria-hidden className="absolute inset-0" style={{ background: CREAM, clipPath: RIBBON_CLIP, boxShadow: '0 6px 12px rgba(19,19,19,0.28)' }} />
    <span className="relative block whitespace-nowrap text-[15px] font-black" style={{ color: 'rgba(19,19,19,0.82)' }}>
      {children}
    </span>
  </motion.div>
);

/** 黑（或任意色）圆角题板：自左拉开 + 两侧四角星 */
const Plate = ({ children, delay, anim, bg = INK, fg = CREAM, size = 34, rot = -2.5, stars = true }: {
  children: ReactNode; delay: number; anim: boolean; bg?: string; fg?: string; size?: number; rot?: number; stars?: boolean;
}) => (
  <motion.div
    className="relative mx-auto w-fit max-w-full px-7 py-2"
    style={{ rotate: rot, transformOrigin: 'left center' }}
    initial={anim ? { scaleX: 0.12, opacity: 0 } : false}
    animate={{ scaleX: 1, opacity: 1 }}
    transition={{ type: 'spring', stiffness: 420, damping: 27, delay }}
  >
    <span aria-hidden className="absolute inset-0 rounded-[14px]" style={{ background: bg, boxShadow: `0 0 0 5px ${CREAM}, 0 8px 16px rgba(19,19,19,0.34)` }} />
    <span
      className="relative block whitespace-nowrap font-black leading-none"
      style={{ color: fg, fontSize: size, fontFamily: 'var(--p4-display-font, serif)' }}
    >
      {children}
    </span>
    {stars && (
      <>
        <P4Sparkle size={22} color="var(--ui-bg, #ffd900)" className="absolute -left-[15px] top-1/2 -translate-y-1/2" />
        <P4Sparkle size={22} color="var(--ui-bg, #ffd900)" className="absolute -right-[15px] top-1/2 -translate-y-1/2" />
      </>
    )}
  </motion.div>
);

/** 主徽落地时迸开的星与花（稿上三张都有一圈） */
const CONFETTI: Array<{ dx: number; dy: number; s: number; c: string; kind: 'star' | 'flower' }> = [
  { dx: -152, dy: -74, s: 30, c: BLUE, kind: 'star' },
  { dx: 156, dy: -62, s: 24, c: 'var(--ui-bg, #ffd900)', kind: 'star' },
  { dx: -148, dy: 84, s: 34, c: 'var(--ui-bg, #ffd900)', kind: 'flower' },
  { dx: 150, dy: 92, s: 36, c: BLUE, kind: 'flower' },
  { dx: 8, dy: -136, s: 22, c: CREAM, kind: 'star' },
  { dx: -172, dy: 12, s: 18, c: ORANGE, kind: 'star' },
  { dx: 176, dy: 22, s: 20, c: ORANGE, kind: 'star' },
];

const Confetti = ({ anim }: { anim: boolean }) => {
  if (!anim) return null;
  return (
    <>
      {CONFETTI.map((b, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[38%] z-20"
          style={sticker(3, '0 4px 6px')}
          initial={{ x: 0, y: 0, scale: 0, rotate: -40, opacity: 0 }}
          animate={{ x: b.dx, y: b.dy, scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 17, delay: 0.42 + i * 0.035 }}
        >
          {b.kind === 'star' ? <P4Sparkle size={b.s} color={b.c} /> : <P4Flower size={b.s} color={b.c} />}
        </motion.span>
      ))}
    </>
  );
};

// ── 舞台 ────────────────────────────────────────────────────────────────────
const P4CutInStage = ({ isOpen, onClose, ariaLabel, autoCloseMs, onShown, ringTone, children }: {
  isOpen: boolean; onClose: () => void; ariaLabel: string; autoCloseMs: number;
  onShown: () => void; ringTone?: string; children: ReactNode;
}) => {
  const containerRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);
  useAutoClose(isOpen, autoCloseMs, onClose);
  useFeedbackOnce(isOpen, onShown);
  const anim = useBoldness();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={`fixed inset-0 ${zClass.celebration} flex items-center justify-center overflow-hidden p-5`}
          // 稿上背景是「页面被压暗」而不是纯色幕布——保留页面轮廓才有贴纸贴在界面上的感觉
          style={{ background: 'rgba(26,24,22,0.72)', backdropFilter: 'blur(2px)' }}
          onClick={onClose}
        >
          {/* 背后巨大同心环（稿上主徽后面那一圈圈橙/金弧） */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{ x: '-50%', y: '-50%', color: ringTone }}
            initial={anim ? { scale: 0.42, rotate: -26, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <P4SunRings size={430} />
          </motion.div>

          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="relative w-full max-w-[352px]"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

/** 主徽外壳：从 -120° 转正落位，落定后极慢呼吸（稿上主视觉都在这层里） */
const Badge = ({ children, anim, size }: { children: ReactNode; anim: boolean; size: number }) => (
  <motion.div
    aria-hidden
    className="pointer-events-none relative z-10 mx-auto"
    style={{ width: size, height: size }}
    initial={anim ? { scale: 0, rotate: -120, opacity: 0 } : false}
    animate={{ scale: 1, rotate: 0, opacity: 1 }}
    transition={{ type: 'spring', stiffness: 250, damping: 15, delay: 0.14 }}
  >
    <motion.div
      className="h-full w-full"
      animate={anim ? { scale: [1, 1.05, 1] } : undefined}
      transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 1.1 }}
    >
      {children}
    </motion.div>
  </motion.div>
);

// ── 06 · 今日完成 / 记录成功 ────────────────────────────────────────────────
/** 绿四叶勾徽：四瓣云朵形底 + 奶油粗勾（稿上主视觉） */
const CloverCheck = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} style={sticker(6)} aria-hidden>
    {/* 四瓣云朵：四个大圆叠出的鼓形轮廓 */}
    <path
      d="M100 18c24 0 40 14 44 32 20-6 40 8 42 30 2 22-12 38-32 42 8 20-4 42-26 46-20 4-38-8-44-26-8 18-28 28-48 22-22-6-32-28-24-48-20-6-32-24-28-46 4-20 24-32 44-26 6-18 22-32 44-32Z"
      fill={GREEN}
    />
    <polyline points="62,104 88,132 142,72" fill="none" stroke={CREAM} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TodoCompleteP4 = ({ isOpen, onClose, title, totalPoints, unlockHint, heading = '今日完成' }: {
  isOpen: boolean; onClose: () => void; title: string;
  totalPoints?: number; unlockHint?: { achievements: number; skills: number };
  heading?: string;
}) => {
  const anim = useBoldness();
  return (
    <P4CutInStage isOpen={isOpen} onClose={onClose} ariaLabel={`${heading}：${title}`} autoCloseMs={3200} onShown={triggerSuccessFeedback}>
      <div className="relative pb-6 pt-2">
        <Badge anim={anim} size={228}>
          <CloverCheck size={228} />
        </Badge>
        {/* 题板压在徽的下半（稿上是骑在勾徽上的） */}
        <div className="relative z-20 -mt-[48px]">
          <Plate delay={0.34} anim={anim}>{heading}</Plate>
          <Ribbon delay={0.5} anim={anim}>
            {title}
            {(totalPoints ?? 0) > 0 && <span style={{ color: ORANGE }}> · +{totalPoints}</span>}
          </Ribbon>
          {unlockHint && (unlockHint.achievements > 0 || unlockHint.skills > 0) && (
            <motion.p
              className="relative mt-2.5 text-center text-[13px] font-black"
              style={{ color: CREAM }}
              initial={anim ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.7 }}
            >
              ✦ 你解锁了新成就 / 新技能！
            </motion.p>
          )}
        </div>
        {/* 右侧绿花（稿上贴在题板右缘） */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute right-[2%] top-[58%] z-20"
          style={sticker(4, '0 4px 6px')}
          initial={anim ? { scale: 0, rotate: -60 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 16, delay: 0.56 }}
        >
          <P4Flower size={46} color={GREEN} />
        </motion.span>
        <Confetti anim={anim} />
        <P4CloseKey onClose={onClose} style={{ right: -6, top: 34 }} />
      </div>
    </P4CutInStage>
  );
};

// ── 07 · 成就解锁 ──────────────────────────────────────────────────────────
/** 金环奖杯徽：金盘 + 同心金环线 + 奶油奖杯 */
const TrophyBadge = ({ size }: { size: number }) => (
  <svg viewBox="0 0 200 200" width={size} height={size} style={sticker(6)} aria-hidden>
    <circle cx="100" cy="100" r="96" fill="var(--ui-bg, #ffd900)" />
    {[80, 64, 48].map((r) => (
      <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(19,19,19,0.08)" strokeWidth="7" />
    ))}
    {/* 杯身 + 双耳 + 底座 */}
    <path
      d="M68 46h64v26c0 20-14 34-32 34S68 92 68 72V46Z"
      fill={CREAM}
    />
    <path d="M68 52H54a14 14 0 0 0 0 28h14v-12H60a2 2 0 0 1 0-4h8V52Z" fill={CREAM} />
    <path d="M132 52h14a14 14 0 0 1 0 28h-14v-12h8a2 2 0 0 0 0-4h-8V52Z" fill={CREAM} />
    <rect x="92" y="104" width="16" height="24" fill={CREAM} />
    <rect x="70" y="126" width="60" height="14" rx="4" fill={CREAM} />
    <rect x="60" y="142" width="80" height="16" rx="5" fill={CREAM} />
    {/* 杯面小星 */}
    <path
      d="M100 50c2.6 8.4 6.6 12.4 15 15-8.4 2.6-12.4 6.6-15 15-2.6-8.4-6.6-12.4-15-15 8.4-2.6 12.4-6.6 15-15Z"
      fill="var(--ui-bg, #ffd900)"
    />
  </svg>
);

export const AchievementUnlockP4 = ({ isOpen, onClose, achievementTitle }: {
  isOpen: boolean; onClose: () => void; achievementTitle: string;
}) => {
  const anim = useBoldness();
  return (
    <P4CutInStage isOpen={isOpen} onClose={onClose} ariaLabel={`成就解锁！${achievementTitle}`} autoCloseMs={4500} onShown={triggerLevelFeedback}>
      <div className="relative pb-6 pt-2">
        <Badge anim={anim} size={236}>
          <TrophyBadge size={236} />
        </Badge>
        <div className="relative z-20 -mt-[52px]">
          <Plate delay={0.34} anim={anim}>成就解锁</Plate>
          {/* 成就名走蓝板（稿上第二块），比题板略小、反向倾斜 */}
          <div className="mt-[-6px]">
            <Plate delay={0.48} anim={anim} bg={BLUE} size={30} rot={2} stars={false}>
              {achievementTitle}
            </Plate>
          </div>
          <Ribbon delay={0.62} anim={anim} rot={-1}>恭喜你达成新成就！继续努力解锁更多内容</Ribbon>
        </div>
        <Confetti anim={anim} />
        <P4CloseKey onClose={onClose} tone={ORANGE} style={{ right: -6, top: 30 }} />
      </div>
    </P4CutInStage>
  );
};

// ── 05 · 恭喜升级 ──────────────────────────────────────────────────────────
export const LevelUpP4 = ({ isOpen, onClose, attributeName, newLevel }: {
  isOpen: boolean; onClose: () => void; attributeName: string; newLevel: number;
}) => {
  const anim = useBoldness();
  return (
    <P4CutInStage isOpen={isOpen} onClose={onClose} ariaLabel={`恭喜升级！${attributeName} Lv.${newLevel}`} autoCloseMs={4200} onShown={triggerLevelFeedback}>
      <div className="relative pb-6 pt-2">
        {/* 橙盘 + 顶部大奶油四角星（稿上主视觉） */}
        <Badge anim={anim} size={260}>
          <div className="relative h-full w-full">
            <svg viewBox="0 0 200 200" width={260} height={260} style={sticker(6)} aria-hidden>
              <circle cx="100" cy="100" r="96" fill={ORANGE} />
              {[80, 62].map((r) => (
                <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(255,246,208,0.28)" strokeWidth="8" />
              ))}
            </svg>
            <span aria-hidden className="absolute left-1/2 top-[-12%] -translate-x-1/2" style={sticker(4, '0 4px 6px')}>
              <P4Sparkle size={78} color={CREAM} />
            </span>
          </div>
        </Badge>

        {/* 属性大字 + Lv 变化：叠在橙盘上（稿上是压在盘心的） */}
        <div className="pointer-events-none absolute inset-x-0 top-[26%] z-20 text-center">
          <motion.div
            className="text-[64px] font-black leading-none"
            style={{ color: INK, fontFamily: 'var(--p4-display-font, serif)' }}
            initial={anim ? { scale: 0.6, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.32 }}
          >
            {attributeName}
          </motion.div>
          <motion.div
            className="mt-1 flex items-center justify-center gap-2 text-[30px] font-black leading-none"
            style={{ color: INK, fontFamily: 'Arial, sans-serif' }}
            initial={anim ? { y: 12, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.46 }}
          >
            <span>Lv.{Math.max(1, newLevel - 1)}</span>
            <span style={{ color: CREAM }}>→</span>
            <span>Lv.</span>
            {/* 新等级：蓝圆号（稿上这一枚是黄字蓝底） */}
            <motion.span
              className="flex h-[46px] w-[46px] items-center justify-center rounded-full text-[28px]"
              style={{ background: BLUE, color: 'var(--ui-bg, #ffd900)', boxShadow: `0 0 0 5px ${CREAM}, 0 6px 12px rgba(19,19,19,0.3)` }}
              initial={anim ? { scale: 0, rotate: -40 } : false}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.62 }}
            >
              {newLevel}
            </motion.span>
          </motion.div>
        </div>

        <div className="relative z-20 -mt-[30px]">
          <Plate delay={0.28} anim={anim} size={26} rot={-3} stars={false}>恭喜升级！</Plate>
          <Ribbon delay={0.76} anim={anim}>继续加油，你越来越强了！</Ribbon>
        </div>
        <Confetti anim={anim} />
        <P4CloseKey onClose={onClose} tone={ORANGE} style={{ right: -6, top: 40 }} />
      </div>
    </P4CutInStage>
  );
};
