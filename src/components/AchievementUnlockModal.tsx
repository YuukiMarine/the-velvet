import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { CelebrationCutIn } from '@/components/CelebrationCutIn';
import { useBoldness } from '@/utils/boldness';
import { UnlockCutInP5 } from '@/components/p5r/cutins';
import { P4Panel, P4Sparkle, P4SunRings } from '@/ui/p4Kit';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerLevelFeedback } from '@/utils/feedback';
import { useAutoClose } from '@/utils/useAutoClose';
import { useBackHandler } from '@/utils/useBackHandler';
import { useFeedbackOnce } from '@/utils/useFeedbackOnce';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';

/**
 * 成就解锁庆祝 —— P7.2 第一波收编进 CelebrationCutIn 基座。
 * 相比旧手写版新增：backdrop 点击跳过 + ESC/Android back（旧版只有 X 和自动关）。
 *
 * P3R（p3-modal-07 稿）：蓝频道换白色大菱形斜面板演出——UNLOCK 巨幽灵字 +
 * 青纸鹤徽记 + 蓝斜带压「成就解锁！」深蓝大斜体 + 成就名蓝字配青双斜杠 + 副文。
 */
interface AchievementUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  achievementTitle: string;
}

/** 青纸鹤徽记（p3-modal-07 面板顶部三角拼贴） */
const CyanCrest = () => (
  <svg viewBox="0 0 150 110" className="w-[108px]" aria-hidden>
    <polygon points="46,72 108,10 96,84" fill="#35d1e8" />
    <polygon points="46,72 96,84 60,102" fill="#0fb8d8" />
    <polygon points="108,10 118,64 96,84" fill="#7fd8ee" />
    <polygon points="96,84 132,70 122,92" fill="#f0417f" />
    <polygon points="28,80 44,74 38,92" fill="#8fe4f2" />
  </svg>
);

/** 青纸鹤落地时迸开的碎三角 */
const CREST_BURST = [
  { dx: -62, dy: -30, rot: -40, s: 11, c: '#35d1e8' },
  { dx: 66, dy: -22, rot: 60, s: 9, c: '#1b57ff' },
  { dx: -44, dy: 44, rot: -80, s: 8, c: '#8fe4f2' },
  { dx: 72, dy: 36, rot: 45, s: 10, c: '#f0417f' },
  { dx: 8, dy: -62, rot: 20, s: 8, c: '#5fd9ec' },
  { dx: -78, dy: 8, rot: -25, s: 9, c: '#1b57ff' },
];

/** P3R 成就解锁演出（p3-modal-07 1:1） */
const AchievementUnlockP3 = ({ isOpen, onClose, achievementTitle }: AchievementUnlockModalProps) => {
  const containerRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);
  useAutoClose(isOpen, 4500, onClose);
  useFeedbackOnce(isOpen, triggerLevelFeedback);
  const anim = useBoldness();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.celebration} flex items-center justify-center overflow-hidden p-5`}
          style={{ background: 'rgba(190,228,244,0.88)', backdropFilter: 'blur(3px)' }}
          onClick={onClose}
        >
          {/* 出场 MG：三圈水波从画面中心推开（蓝频道签名动效，与长按轮盘 / 换牌同一套）。
              环用 motion 补间 SVG 的 r，描边粗细恒定。 */}
          {anim && (
            <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
              {[0, 1, 2].map((k) => (
                <motion.circle
                  key={k}
                  cx="50%"
                  cy="50%"
                  fill="none"
                  stroke={k === 1 ? '#1b57ff' : '#35d1e8'}
                  strokeWidth={k === 1 ? 14 : 9}
                  initial={{ r: 24, opacity: 0 }}
                  animate={{ r: 300 + k * 110, opacity: [0, 0.55, 0.3, 0] }}
                  transition={{ duration: 1.2, delay: 0.04 + k * 0.13, ease: [0.16, 0.7, 0.35, 1], opacity: { duration: 1.2, delay: 0.04 + k * 0.13, times: [0, 0.12, 0.6, 1] } }}
                />
              ))}
            </svg>
          )}
          {/* UNLOCK 巨幽灵字（overlay 层，横排斜置）：自左裁切揭示 + 甩入 */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-[-24px] top-[4%] select-none font-black italic leading-none"
            style={{ fontFamily: 'Arial, sans-serif', fontSize: '7.5rem', color: 'rgba(255,255,255,0.55)', rotate: -9 }}
            initial={anim ? { clipPath: 'inset(-12% 103% -12% -3%)', x: -34 } : false}
            animate={{ clipPath: 'inset(-12% -6% -12% -3%)', x: 0 }}
            transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 0.9, 0.3, 1] }}
          >
            UNLOCK
          </motion.div>
          {/* 右上蓝三角 + ✕ */}
          <span aria-hidden className="absolute right-0 top-0 h-[120px] w-[140px]" style={{ background: '#1b57ff', clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center text-2xl font-black text-white"
          >
            ×
          </motion.button>

          {/* 白色大菱形面板 */}
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`成就解锁！${achievementTitle}`}
            initial={{ scale: 0.55, opacity: 0, rotate: -5 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.75, opacity: 0 }}
            transition={{ type: 'spring', damping: 19, stiffness: 230 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden pb-10 pt-6 text-center"
            style={{
              background: 'rgba(255,255,255,0.96)',
              clipPath: 'polygon(7% 9%, 96% 0, 100% 88%, 3% 100%)',
              boxShadow: '0 24px 60px rgba(38,96,140,0.28)',
            }}
          >
            {/* 左下青三角 */}
            <span aria-hidden className="absolute bottom-1 left-2 h-0 w-0 border-b-[26px] border-r-[38px] border-r-transparent" style={{ borderBottomColor: 'rgba(53,209,232,0.8)' }} />

            <div className="relative z-10 flex flex-col items-center px-6">
              <motion.div
                className="relative"
                initial={{ scale: 0, rotate: -24 }}
                animate={{ scale: [0, 1.25, 1], rotate: 0 }}
                transition={{ duration: 0.7, delay: 0.15, type: 'spring', stiffness: 280 }}
              >
                <CyanCrest />
                {/* 徽记落地迸开的碎三角（与今日完成的勾同一套语言） */}
                {anim && CREST_BURST.map((b, i) => (
                  <motion.span
                    key={i}
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2"
                    style={{ width: b.s, height: b.s, background: b.c, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
                    animate={{ x: b.dx, y: b.dy, scale: 1, opacity: [0, 1, 0], rotate: b.rot }}
                    transition={{ duration: 0.6, delay: 0.42 + i * 0.03, ease: 'easeOut' }}
                  />
                ))}
              </motion.div>

              {/* 成就解锁！—— 蓝斜带锚定在标题行内（跟内容走，不再按面板百分比漂移压字），白描边保证跨带可读
                  B3：斜带从左拉出（scaleX）→ 标题逐字弹入 → 洋红角戳入后低频眨动 */}
              <div className="relative mt-1 w-full">
                <motion.span
                  aria-hidden
                  className="absolute left-[-15%] right-[-15%] top-1/2 h-[62px]"
                  style={{ background: '#1b57ff', y: '-50%', rotate: -7, originX: 0 }}
                  initial={anim ? { scaleX: 0, opacity: 0 } : false}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
                />
                <motion.span
                  aria-hidden
                  className="absolute right-[3%] top-[-16px] h-[16px] w-[26px]"
                  initial={anim ? { scale: 0 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.52 }}
                >
                  <motion.span
                    className="absolute inset-0"
                    style={{ background: '#f0417f', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }}
                    animate={anim ? { opacity: [1, 1, 0.3, 1] } : undefined}
                    transition={{ duration: 4.4, times: [0, 0.88, 0.93, 1], repeat: Infinity, ease: 'linear', delay: 1.5 }}
                  />
                </motion.span>
                <div
                  aria-hidden
                  className="relative text-center text-[44px] font-black italic leading-none"
                  style={{
                    color: '#0a3bd6',
                    fontFamily: '"Arial Black", "Noto Sans SC", sans-serif',
                    WebkitTextStroke: '7px #fff',
                    paintOrder: 'stroke fill',
                  }}
                >
                  {'成就解锁！'.split('').map((ch, i) => (
                    <motion.span
                      key={i}
                      className="inline-block"
                      initial={anim ? { y: 22, opacity: 0, scale: 0.5 } : false}
                      animate={{ y: 0, opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 480, damping: 24, delay: 0.3 + i * 0.055 }}
                    >
                      {ch}
                    </motion.span>
                  ))}
                </div>
              </div>

              {/* 成就名 + 青双斜杠（整行自下浮入，B3） */}
              <motion.div
                className="mt-7 flex items-center justify-center gap-3"
                initial={anim ? { y: 16, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 340, damping: 26, delay: 0.6 }}
              >
                <span aria-hidden className="flex gap-1">
                  <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.8)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                  <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.45)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                </span>
                <span className="max-w-[70%] truncate text-[30px] font-black leading-none" style={{ color: '#1b57ff' }}>{achievementTitle}</span>
                <span aria-hidden className="flex gap-1">
                  <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.45)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                  <span className="h-[12px] w-[10px]" style={{ background: 'rgba(53,209,232,0.8)', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />
                </span>
              </motion.div>

              <p className="mt-3 text-[14px] font-black" style={{ color: '#0a1230' }}>恭喜你达成新成就！继续努力解锁更多内容</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

/**
 * P4R 成就解锁演出（黄频道）—— 之前黄频道直接落到中性的 CelebrationCutIn（🏆 emoji），
 * 既没有频道皮也几乎没有出场动效。这里按黄频道语法补一张：
 * 奶油纸斜切板 + 黑题板 + 四角星徽 + 橙弧环，出场是「板子斜着落位 → 徽记转正
 * → 黑题板拉开 → 成就名逐字弹入 → 四周小星迸开」。
 */
const AchievementUnlockP4 = ({ isOpen, onClose, achievementTitle }: AchievementUnlockModalProps) => {
  const containerRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);
  useAutoClose(isOpen, 4500, onClose);
  useFeedbackOnce(isOpen, triggerLevelFeedback);
  const anim = useBoldness();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.celebration} flex items-center justify-center overflow-hidden p-5`}
          style={{ background: 'rgba(19,19,19,0.55)', backdropFilter: 'blur(3px)' }}
          onClick={onClose}
        >
          {/* 背后巨大橙弧环 + 慢转（黄频道舞台签名件） */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{ x: '-50%', y: '-50%' }}
            initial={anim ? { scale: 0.5, rotate: -30, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <P4SunRings size={560} />
          </motion.div>
          {/* UNLOCK 幽灵大字 */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-[-20px] top-[6%] select-none font-black italic leading-none"
            style={{ fontFamily: 'Arial, sans-serif', fontSize: '7rem', color: 'rgba(255,246,208,0.22)' }}
          >
            UNLOCK
          </div>

          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`成就解锁！${achievementTitle}`}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[330px]"
            initial={anim ? { scale: 0.7, rotate: -7, y: -22, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, y: 0, opacity: 1 }}
            exit={anim ? { scale: 0.86, rotate: 4, opacity: 0 } : undefined}
            transition={{ type: 'spring', stiffness: 300, damping: 17, mass: 0.9 }}
          >
            <P4Panel tone="paper" skew={-4} radius={22} contentClassName="px-5 pb-6 pt-7 text-center">
              {/* 四角星徽：从 -120° 转正 + 落定后极慢呼吸 */}
              <motion.div
                aria-hidden
                className="mx-auto flex justify-center"
                initial={anim ? { scale: 0, rotate: -120 } : false}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.2 }}
              >
                <motion.div
                  animate={anim ? { scale: [1, 1.06, 1] } : undefined}
                  transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                >
                  <P4Sparkle size={112} color="var(--ui-accent)" style={{ filter: 'drop-shadow(0 4px 0 rgba(19,19,19,0.28))' }} />
                </motion.div>
              </motion.div>

              {/* 黑题板：从左拉开 */}
              <motion.div
                className="relative mx-auto mt-3 w-fit max-w-full px-4 py-1.5"
                style={{ background: '#131313', borderRadius: 999, transformOrigin: 'left center' }}
                initial={anim ? { scaleX: 0.1, opacity: 0 } : false}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 27, delay: 0.4 }}
              >
                <span className="block text-[20px] font-black tracking-[0.14em]" style={{ color: 'var(--ui-bg, #ffd900)' }}>
                  成就解锁
                </span>
              </motion.div>

              {/* 成就名：逐字弹入 */}
              <div className="mt-3 text-[30px] font-black leading-tight" style={{ color: '#131313', fontFamily: 'var(--p4-display-font, serif)' }}>
                {[...achievementTitle].map((ch, i) => (
                  <motion.span
                    key={i}
                    className="inline-block"
                    initial={anim ? { y: 18, opacity: 0, rotate: -8 } : false}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 460, damping: 24, delay: 0.56 + i * 0.045 }}
                  >
                    {ch}
                  </motion.span>
                ))}
              </div>

              <motion.p
                className="mt-2.5 text-[13px] font-bold"
                style={{ color: 'rgba(19,19,19,0.7)' }}
                initial={anim ? { y: 10, opacity: 0 } : false}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.32, delay: 0.8 }}
              >
                恭喜你达成新成就 · 继续解锁更多
              </motion.p>

              {/* 迸开的小星（黄频道用四角星，不用碎三角） */}
              {anim && BURST_STARS.map((b, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-[28%]"
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                  animate={{ x: b.dx, y: b.dy, scale: 1, opacity: [0, 1, 0] }}
                  transition={{ duration: 0.8, delay: 0.34 + i * 0.03, ease: 'easeOut' }}
                >
                  <P4Sparkle size={b.s} color={b.c} />
                </motion.span>
              ))}
            </P4Panel>

            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="absolute -right-1 -top-3 flex h-10 w-10 items-center justify-center text-xl font-black"
              style={{ background: '#131313', color: 'var(--ui-bg, #ffd900)', borderRadius: 999 }}
            >
              ×
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

/** 徽记落地时迸开的小四角星（黄频道：不用碎三角） */
const BURST_STARS = [
  { dx: -96, dy: -30, s: 20, c: '#131313' },
  { dx: 92, dy: -18, s: 17, c: 'var(--ui-accent)' },
  { dx: -70, dy: 58, s: 14, c: 'var(--p4-orange, #f9a11b)' },
  { dx: 84, dy: 62, s: 18, c: '#131313' },
  { dx: 4, dy: -78, s: 15, c: 'var(--p4-orange, #f9a11b)' },
  { dx: -118, dy: 22, s: 12, c: 'var(--ui-accent)' },
];

export const AchievementUnlockModal = (props: AchievementUnlockModalProps) => {
  const channel = useUiChannel();
  // P5R（p5-modal-07 稿；面板按用户定稿改成不规则四边形）
  if (channel === 'p5') {
    return (
      <UnlockCutInP5
        isOpen={props.isOpen}
        onClose={props.onClose}
        heading="成就解锁！"
        name={props.achievementTitle}
        lines={['恭喜你达成新成就！', '继续努力解锁更多内容']}
      />
    );
  }
  if (channel === 'p3') return <AchievementUnlockP3 {...props} />;
  if (channel === 'p4') return <AchievementUnlockP4 {...props} />;
  const { isOpen, onClose, achievementTitle } = props;
  return (
  <CelebrationCutIn
    isOpen={isOpen}
    onClose={onClose}
    theme="gold"
    autoCloseMs={4500}
    particles={16}
    onShown={triggerLevelFeedback}
    icon={
      <motion.span
        className="inline-block"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ duration: 0.8, delay: 0.2, type: 'spring', stiffness: 300 }}
      >
        🏆
      </motion.span>
    }
    title="成就解锁！"
  >
    <p className="text-2xl font-semibold text-white/95">{achievementTitle}</p>
    <p className="mt-4 text-base text-white/80">恭喜你达成新成就！继续努力解锁更多内容</p>
  </CelebrationCutIn>
  );
};
