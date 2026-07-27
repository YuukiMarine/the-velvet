/**
 * p5rCutIns —— 红频道三张庆祝 cut-in（p5-modal-05 升级 / 06 今日完成 / 07 成就解锁）。
 *
 * 共同骨架（P5CutInStage）：
 *   黑幕 → 猩红闸门横掠全屏 → 集中线爆开 → 大板从景深砸到面前（带一次落地震屏）
 *   → 拼贴标题逐字砸落 → 主视觉巨星旋入 → 碎片迸溅 → 底部红色倒计时条。
 *   关闭三通道（自动关 / 点幕 / 右上 ✕）与基座 CelebrationCutIn 同口径。
 *
 * 造型铁律沿用全站 P5 口径：任何一块都不是板正矩形；未完成/次级一律纯色灰，不用透明度。
 * 装饰全部 aria-hidden + pointer-events-none；D0（boldness=0）直接给终态、零动画。
 */
import { useId, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import {
  P5R, P5_FONT, roughQuad, starPts, jitterStarPts,
  P5Panel, P5Star, P5StarOutline, P5RingStar, P5CollageTitle,
} from './kit';
import { useBoldness } from '@/utils/boldness';
import { triggerLevelFeedback, triggerSuccessFeedback } from '@/utils/feedback';
import { useAutoClose } from '@/utils/useAutoClose';
import { useBackHandler } from '@/utils/useBackHandler';
import { useFeedbackOnce } from '@/utils/useFeedbackOnce';
import { useModalA11y } from '@/utils/useModalA11y';
import { zClass } from '@/utils/zIndex';

// ── 通用小件 ─────────────────────────────────────────────────────────────────
/** 硬角 ✕（不用字形，免得不同平台字重不一） */
const XGlyph = ({ size = 18, color = P5R.ink }: { size?: number; color?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    <path d="M4.6 1.8 L12 9.2 L19.4 1.8 L22.2 4.6 L14.8 12 L22.2 19.4 L19.4 22.2 L12 14.8 L4.6 22.2 L1.8 19.4 L9.2 12 L1.8 4.6 Z" fill={color} />
  </svg>
);

/** 右上关闭：tile=纸片黑✕（升级/完成稿）· star=黑星纸✕（成就稿） */
const P5CloseKey = ({ onClose, variant = 'tile', className, style }: {
  onClose: () => void; variant?: 'tile' | 'star'; className?: string; style?: React.CSSProperties;
}) => {
  const anim = useBoldness();
  return (
    <motion.button
      type="button"
      onClick={onClose}
      aria-label="关闭"
      whileTap={{ scale: 0.9, rotate: -6 }}
      initial={anim ? { scale: 0, rotate: -120 } : false}
      animate={{ scale: 1, rotate: variant === 'star' ? -8 : -4 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.5 }}
      className={`group absolute z-30 flex items-center justify-center focus-visible:outline-none ${
        variant === 'star' ? '' : 'focus-visible:ring-2 focus-visible:ring-[#f0e9df]'
      } ${className ?? ''}`}
      style={style}
    >
      {variant === 'star' ? (
        <>
          {/* 星形关闭键的聚焦指示做成「外圈翻红」——方形 ring 套在星上会很脏 */}
          <svg viewBox="0 0 100 100" width={62} height={62} aria-hidden className="absolute">
            <polygon points={starPts(50, 50, 49)} fill={P5R.paper} className="group-focus-visible:hidden" />
            <polygon points={starPts(50, 50, 49)} fill={P5R.redHot} className="hidden group-focus-visible:block" />
            <polygon points={starPts(50, 50, 43)} fill={P5R.ink} />
          </svg>
          <span className="relative"><XGlyph size={18} color={P5R.paper} /></span>
        </>
      ) : (
        <>
          <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,4px)', background: P5R.ink, clipPath: roughQuad(471, 4) }} />
          <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(472, 4) }} />
          <span aria-hidden className="absolute inset-[3px]" style={{ background: P5R.paper, clipPath: roughQuad(473, 3), boxShadow: `inset 0 0 0 2.5px ${P5R.ink}` }} />
          <span className="relative"><XGlyph size={17} color={P5R.ink} /></span>
        </>
      )}
    </motion.button>
  );
};

/** 落地迸溅的纸屑（三色律内：红 / 黑 / 纸），三角与小星混着飞 */
const SHARDS = [
  { dx: -128, dy: -74, r: -38, s: 15, c: P5R.paper, star: false, d: 0 },
  { dx: 132, dy: -58, r: 52, s: 13, c: P5R.ink, star: true, d: 0.04 },
  { dx: -104, dy: 92, r: -76, s: 12, c: P5R.red, star: false, d: 0.07 },
  { dx: 118, dy: 104, r: 40, s: 16, c: P5R.paper, star: true, d: 0.02 },
  { dx: 14, dy: -128, r: 18, s: 11, c: P5R.red, star: true, d: 0.09 },
  { dx: -146, dy: 8, r: -22, s: 14, c: P5R.ink, star: false, d: 0.05 },
  { dx: 152, dy: 30, r: 66, s: 10, c: P5R.paper, star: false, d: 0.11 },
  { dx: -44, dy: 134, r: -50, s: 12, c: P5R.ink, star: true, d: 0.06 },
  { dx: 62, dy: -118, r: 30, s: 13, c: P5R.paper, star: false, d: 0.13 },
  { dx: -76, dy: -118, r: -14, s: 10, c: P5R.red, star: true, d: 0.03 },
];

const Shards = ({ delay = 0.34 }: { delay?: number }) => (
  <>
    {SHARDS.map((b, i) => (
      <motion.span
        key={i}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-20"
        style={{ width: b.s, height: b.s, marginLeft: -b.s / 2, marginTop: -b.s / 2 }}
        initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
        animate={{ x: b.dx, y: b.dy, scale: 1, opacity: [0, 1, 1, 0], rotate: b.r }}
        transition={{ duration: 0.85, delay: delay + b.d, ease: [0.12, 0.8, 0.3, 1], times: [0, 0.16, 0.7, 1] }}
      >
        {b.star ? (
          <svg viewBox="0 0 100 100" width={b.s} height={b.s}><polygon points={starPts(50, 50, 49)} fill={b.c} /></svg>
        ) : (
          <span className="block h-full w-full" style={{ background: b.c, clipPath: 'polygon(48% 0, 100% 82%, 6% 100%)' }} />
        )}
      </motion.span>
    ))}
  </>
);

// ── 舞台 ─────────────────────────────────────────────────────────────────────
/** 背景同心星层：由中心向外一圈圈铺开的暗红/黑星带（换幕之后的主结构底噪） */
const STAGE_STAR_BANDS = ['#150001', '#3f0004', '#0f0001', '#4c0005', '#0b0000', '#340003', '#070000', '#280002', '#050000'];

interface StageProps {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  autoCloseMs: number;
  onShown?: () => void;
  /** 卡片最大宽度（今日完成那张要更宽） */
  maxW?: number;
  children: ReactNode;
}

const P5CutInStage = ({ isOpen, onClose, ariaLabel, autoCloseMs, onShown, maxW = 384, children }: StageProps) => {
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
          transition={{ duration: 0.16 }}
          className={`fixed inset-0 ${zClass.celebration} flex items-center justify-center overflow-hidden p-3`}
          style={{ background: 'rgba(4,4,4,0.74)' }}
          onClick={onClose}
        >
          {/* 同心星层：巨大的暗红/黑星带自中心一圈圈辐射出画面 */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{ x: '-50%', y: '-50%' }}
            initial={anim ? { scale: 0.42, rotate: -22, opacity: 0 } : false}
            animate={{ scale: 1, rotate: -9, opacity: 1 }}
            transition={{ duration: 0.85, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <P5RingStar size={780} step={0.085} rings={STAGE_STAR_BANDS} />
          </motion.div>
          {/* 星形涟漪：三圈描边星接力向外扩，坐实「辐射」这件事 */}
          {anim && [0, 1, 2].map((k) => (
            <motion.svg
              key={k}
              aria-hidden
              viewBox="0 0 100 100"
              width={640}
              height={640}
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{ marginLeft: -320, marginTop: -320 }}
              initial={{ scale: 0.22, opacity: 0 }}
              animate={{ scale: 1.55, opacity: [0, 0.95, 0] }}
              transition={{ duration: 1.2, delay: 0.18 + k * 0.24, ease: 'easeOut' }}
            >
              <polygon points={starPts(50, 50, 46)} fill="none" stroke="#7d0007" strokeWidth={2.4} strokeLinejoin="miter" />
            </motion.svg>
          ))}
          {/* 大圆环（替掉原先左上角那块网点补丁） */}
          <span aria-hidden className="pointer-events-none absolute rounded-full" style={{ left: -78, top: '8%', width: 200, height: 200, border: '14px solid #45000a' }} />
          <span aria-hidden className="pointer-events-none absolute rounded-full" style={{ left: -28, top: 'calc(8% + 52px)', width: 108, height: 108, border: '11px solid #2f2d2a' }} />
          <span aria-hidden className="pointer-events-none absolute rounded-full" style={{ right: -64, bottom: '11%', width: 172, height: 172, border: '13px solid #2f2d2a' }} />
          <span aria-hidden className="pointer-events-none absolute rounded-full" style={{ right: -18, bottom: 'calc(11% + 46px)', width: 84, height: 84, border: '9px solid #45000a' }} />

          {/* 集中线：从中心爆开的黑色放射条（P5 的「命中」标点） */}
          {anim && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[210vmax] w-[210vmax]"
              style={{
                marginLeft: '-105vmax',
                marginTop: '-105vmax',
                background: 'repeating-conic-gradient(from 0deg at 50% 50%, #050505 0deg 2.2deg, transparent 2.2deg 9deg)',
                WebkitMaskImage: 'radial-gradient(circle at 50% 50%, transparent 16%, #000 44%)',
                maskImage: 'radial-gradient(circle at 50% 50%, transparent 16%, #000 44%)',
              }}
              initial={{ scale: 0.3, opacity: 0, rotate: 0 }}
              animate={{ scale: [0.3, 1, 1.12], opacity: [0, 1, 0], rotate: 7 }}
              transition={{ duration: 0.78, delay: 0.14, times: [0, 0.32, 1], ease: 'easeOut' }}
            />
          )}
          {/* 猩红闸门：一整块红从左掠出画面，是「换幕」那一下 */}
          {anim && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-[-10%] left-0 w-[150%]"
              style={{ background: P5R.red, clipPath: 'polygon(0 0, 100% 0, 84% 100%, 0 100%)' }}
              initial={{ x: '-120%' }}
              animate={{ x: '130%' }}
              transition={{ duration: 0.6, ease: [0.72, 0, 0.28, 1] }}
            />
          )}
          {/* 底噪：描边星（网点补丁已换成上面的大圆环） */}
          <P5StarOutline size={92} color="#3d0004" width={9} rot={-16} className="absolute left-[-22px] bottom-[16%]" />
          <P5StarOutline size={70} color="#3a3831" width={8} rot={14} className="absolute right-[-14px] top-[12%]" />

          {/* 砸落层（scale/rotate） */}
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full"
            style={{ maxWidth: maxW }}
            initial={anim ? { scale: 1.75, rotate: -13, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.72, rotate: 9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.15 }}
          >
            {/* 震屏层（x/y）：与砸落分层，避免两组 transform 打架 */}
            <motion.div
              className="relative"
              initial={false}
              animate={anim ? { x: [0, -8, 7, -4, 2, 0], y: [0, 5, -4, 3, -1, 0] } : undefined}
              transition={{ duration: 0.36, delay: 0.34, ease: 'linear' }}
            >
              {children}
              {anim && <Shards />}
              {/* 倒计时：黑槽 + 猩红条（也是「还能看多久」的提示） */}
              {autoCloseMs > 0 && (
                <div aria-hidden className="relative mt-3 h-[7px] overflow-hidden" style={{ background: '#2a2926', clipPath: roughQuad(490, 3) }}>
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: autoCloseMs / 1000, ease: 'linear' }}
                    className="h-full"
                    style={{ background: P5R.red }}
                  />
                </div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

/** 拼贴标题骑在板子上缘（三张稿共用的入场位）：偏移随字号走，永远压住上边线一半 */
const StraddleTitle = ({ text, size = 50 }: { text: string; size?: number }) => (
  <div className="pointer-events-none absolute left-0 right-0 z-20 flex justify-center px-1" style={{ top: -(size * 0.56) }}>
    <P5CollageTitle text={text} size={size} star={false} />
  </div>
);

// ── 05 · 恭喜升级 ────────────────────────────────────────────────────────────
export const LevelUpP5 = ({ attributeName, newLevel, isOpen, onClose }: {
  attributeName: string; newLevel: number; isOpen: boolean; onClose: () => void;
}) => {
  const anim = useBoldness();
  return (
    <P5CutInStage
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={`恭喜升级！${attributeName} Lv.${newLevel}`}
      autoCloseMs={3600}
      onShown={triggerLevelFeedback}
    >
      <div className="relative">
        <P5Panel seed={410} jag={12} frame={4} keyline={3} face={P5R.red} shadow={{ x: 6, y: 8 }} bodyClassName="px-4 pb-4 pt-11">
          {/* 巨星：灰影星在后、纸白星在前（稿上是错位双层） */}
          {/* 位移写进 motion 的 x（用 -translate-x-1/2 会被 motion 的 transform 覆盖掉） */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[62px] h-[228px] w-[228px]"
            style={{ x: '-50%' }}
            initial={anim ? { scale: 0, rotate: -70, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 17, delay: 0.3 }}
          >
            <P5Star size={228} fill="#8d8880" className="absolute" style={{ left: -13, top: 10 }} />
            <P5Star size={228} fill={P5R.paper} className="absolute" style={{ left: 0, top: 0 }} />
          </motion.div>

          <div className="relative flex flex-col items-center pt-[26px]">
            {/* 属性名红片（压在星上） */}
            <motion.span
              className="relative px-4 py-1.5 text-[24px] font-black leading-none"
              style={{ color: P5R.paper, fontFamily: P5_FONT }}
              initial={anim ? { scale: 1.4, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 460, damping: 22, delay: 0.46 }}
            >
              <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,4px)', background: P5R.ink, clipPath: roughQuad(411, 5) }} />
              <span aria-hidden className="absolute inset-0" style={{ background: P5R.ink, clipPath: roughQuad(412, 4) }} />
              <span aria-hidden className="absolute inset-[3px]" style={{ background: P5R.red, clipPath: roughQuad(413, 3) }} />
              <span className="relative block max-w-[210px] truncate">{attributeName}</span>
            </motion.span>

            {/* Lv.N-1 → Lv.N */}
            <motion.div
              className="mt-[86px] flex items-center gap-2.5"
              initial={anim ? { y: 20, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 24, delay: 0.58 }}
            >
              <span className="relative px-3.5 py-1.5 text-[30px] font-black leading-none" style={{ color: P5R.paper, fontFamily: P5_FONT }}>
                <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,4px)', background: '#5c0004', clipPath: roughQuad(414, 5) }} />
                <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(415, 4) }} />
                <span aria-hidden className="absolute inset-[3px]" style={{ background: P5R.ink, clipPath: roughQuad(416, 3) }} />
                <span className="relative tabular-nums">Lv.{Math.max(0, newLevel - 1)}</span>
              </span>
              <span aria-hidden className="h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent" style={{ borderLeftColor: P5R.ink }} />
              <motion.span
                className="relative px-3.5 py-1.5 text-[30px] font-black leading-none"
                style={{ color: P5R.paper, fontFamily: P5_FONT }}
                animate={anim ? { scale: [1, 1.08, 1] } : undefined}
                transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.7, delay: 0.9 }}
              >
                <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,4px)', background: P5R.ink, clipPath: roughQuad(417, 5) }} />
                <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(418, 4) }} />
                <span aria-hidden className="absolute inset-[3px]" style={{ background: P5R.redHot, clipPath: roughQuad(419, 3) }} />
                <span className="relative tabular-nums">Lv.{newLevel}</span>
              </motion.span>
            </motion.div>

            {/* 底部纸带（左端尖角） */}
            <motion.div
              className="relative mt-5 w-full px-6 py-2.5 text-center"
              initial={anim ? { x: -26, opacity: 0 } : false}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26, delay: 0.7 }}
            >
              <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: P5R.ink, clipPath: 'polygon(0 52%, 16px 2px, 100% 0, calc(100% - 14px) 100%, 12px calc(100% - 3px))' }} />
              <span aria-hidden className="absolute inset-0" style={{ background: P5R.ink, clipPath: 'polygon(0 52%, 16px 2px, 100% 0, calc(100% - 14px) 100%, 12px calc(100% - 3px))' }} />
              <span aria-hidden className="absolute inset-[3px]" style={{ background: P5R.paper, clipPath: 'polygon(0 52%, 15px 2px, 100% 0, calc(100% - 13px) 100%, 11px calc(100% - 3px))' }} />
              <span className="relative text-[16px] font-black" style={{ color: P5R.ink, fontFamily: P5_FONT }}>继续加油，你越来越强了！</span>
            </motion.div>
          </div>
        </P5Panel>

        <StraddleTitle text="恭喜升级！" size={50} />
        {/* ✕ 让到标题上方：稿上它是整幅构图右上角的独立一块，不压标题 */}
        <P5CloseKey onClose={onClose} style={{ right: -6, top: -86, height: 48, width: 48 }} />
      </div>
    </P5CutInStage>
  );
};

// ── 06 · 今日完成 ────────────────────────────────────────────────────────────
/** 今日完成幅面形：四条明确斜边的不规则四边形（宽 > 高） */
const TODO_PANEL_SHAPE = 'polygon(0 16px, 100% 0, calc(100% - 12px) 100%, 9px calc(100% - 9px))';
export const TodoCompleteP5 = ({ isOpen, onClose, title, totalPoints, unlockHint, heading = '今日完成' }: {
  isOpen: boolean; onClose: () => void; title: string;
  totalPoints?: number; unlockHint?: { achievements: number; skills: number };
  /** 「记录成功」复用同一张演出，只换标题（与 p3 的 BandCutInP3 同一套复用口径） */
  heading?: string;
}) => {
  const anim = useBoldness();
  const checkClipId = useId();
  return (
    <P5CutInStage
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={`${heading}：${title}`}
      autoCloseMs={3000}
      onShown={triggerSuccessFeedback}
      maxW={424}
    >
      <div className="relative">
        {/* 幅面：宽 > 高 的不规则四边形（手写四条明确斜边，不用抖动——抖动只会读成毛边矩形）；
            三层同形逐层内缩 → 四边黑框天然不等宽 */}
        <div className="relative px-4 pb-4 pt-12">
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(6px,8px)', background: P5R.ink, clipPath: TODO_PANEL_SHAPE }} />
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: P5R.paper, clipPath: TODO_PANEL_SHAPE }} />
          <span aria-hidden className="pointer-events-none absolute inset-[3px]" style={{ background: P5R.ink, clipPath: TODO_PANEL_SHAPE }} />
          <span aria-hidden className="pointer-events-none absolute inset-[7px]" style={{ background: P5R.red, clipPath: TODO_PANEL_SHAPE }} />
          {/* 板内巨大同心圆环：浅暗红描边，始终缓慢向外扩散（裁在面层轮廓内） */}
          {/* 半径成 1.5 等比 + 线宽同比 → 整组放大 1.5× 后与初态自相似，
              所以 linear 循环看上去就是「永远在向外扩散的同心圆环」，没有接缝 */}
          <span aria-hidden className="pointer-events-none absolute inset-[7px] overflow-hidden" style={{ clipPath: TODO_PANEL_SHAPE }}>
            <motion.svg
              viewBox="0 0 200 200"
              className="absolute left-1/2 top-1/2"
              style={{ width: 640, height: 640, marginLeft: -320, marginTop: -320 }}
              animate={anim ? { scale: [1, 1.5] } : undefined}
              transition={anim ? { duration: 9, repeat: Infinity, ease: 'linear' } : undefined}
            >
              {[6, 9, 13.5, 20.3, 30.4, 45.6, 68.4].map((r) => (
                <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#e8464e" strokeWidth={r * 0.15} />
              ))}
            </motion.svg>
          </span>

          {/* 巨星 + 黑勾：整体斜置，贴纸叠层 = 黑硬影 / 纸白不规则粗描边 / 黑粗锁边 / 纸面 */}
          <motion.div
            aria-hidden
            className="pointer-events-none relative mx-auto"
            style={{ width: 208, height: 208 }}
            initial={anim ? { scale: 0, rotate: 60, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 250, damping: 16, delay: 0.3 }}
          >
            {/* 倾斜写在内层 svg 上：motion 会接管外层的 transform */}
            <svg viewBox="0 0 100 100" width={208} height={208} className="absolute left-0 top-0 overflow-visible" style={{ transform: 'rotate(-13deg)' }}>
              <defs>
                <clipPath id={checkClipId}>
                  <polygon points={starPts(50, 50, 39.5)} />
                </clipPath>
              </defs>
              <polygon points={jitterStarPts(50, 50, 53, 771, 0.055)} fill={P5R.ink} transform="translate(3 4)" />
              <polygon points={jitterStarPts(50, 50, 53, 772, 0.075)} fill={P5R.paper} />
              <polygon points={starPts(50, 50, 46)} fill={P5R.ink} />
              <polygon points={starPts(50, 50, 39.5)} fill={P5R.paper} />
              {/* 勾用纸面星裁一刀：稿上勾的两端就是被星缘齐口切断的 */}
              <g clipPath={`url(#${checkClipId})`}>
                <motion.polyline
                  points="36,50 46,60 75,31"
                  fill="none"
                  stroke={P5R.ink}
                  strokeWidth={11.5}
                  strokeLinejoin="miter"
                  strokeLinecap="butt"
                  initial={anim ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, delay: 0.62, ease: [0.2, 0.9, 0.3, 1] }}
                />
              </g>
            </svg>
          </motion.div>

          {/* 底部纸条：勾选框 + 任务名 + 红计数片 */}
          <motion.div
            className="relative mt-3 flex items-center gap-2 px-2.5 py-2"
            initial={anim ? { x: -24, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26, delay: 0.72 }}
          >
            <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: P5R.ink, clipPath: roughQuad(433, 6) }} />
            <span aria-hidden className="absolute inset-0" style={{ background: P5R.ink, clipPath: roughQuad(434, 5) }} />
            <span aria-hidden className="absolute inset-[3px]" style={{ background: P5R.paper, clipPath: roughQuad(435, 4) }} />
            <span aria-hidden className="relative flex h-[26px] w-[26px] shrink-0 items-center justify-center" style={{ background: P5R.paper, boxShadow: `inset 0 0 0 3px ${P5R.ink}`, clipPath: roughQuad(436, 3) }}>
              <svg viewBox="0 0 24 24" width={17} height={17}>
                <polyline points="4,12 10,18 21,4" fill="none" stroke={P5R.red} strokeWidth={4.6} strokeLinejoin="miter" strokeLinecap="butt" />
              </svg>
            </span>
            <span className="relative min-w-0 flex-1 truncate text-[14px] font-black" style={{ color: P5R.ink, fontFamily: P5_FONT }}>{title}</span>
            {(totalPoints ?? 0) > 0 && (
              <span className="relative shrink-0 px-2.5 py-1 text-[16px] font-black leading-none tabular-nums" style={{ background: P5R.red, color: P5R.paper, clipPath: roughQuad(437, 3), fontFamily: P5_FONT }}>
                +{totalPoints}
              </span>
            )}
          </motion.div>

          {unlockHint && (unlockHint.achievements > 0 || unlockHint.skills > 0) && (
            <div className="relative mt-2 text-center text-[12px] font-black" style={{ color: P5R.paper, fontFamily: P5_FONT }}>
              ★ 你解锁了新成就 / 新技能！
            </div>
          )}
        </div>

        <StraddleTitle text={heading} size={heading.length > 4 ? 50 : 60} />
        <P5CloseKey onClose={onClose} variant="star" style={{ right: -10, top: -90, height: 62, width: 62 }} />
      </div>
    </P5CutInStage>
  );
};

// ── 07 · 成就 / 技能解锁 ─────────────────────────────────────────────────────
/** 稿上是缺角多边形，用户定稿改为「不规则四边形」：四角各自错动的纸板 + 不等宽黑框 */
export const UnlockCutInP5 = ({ isOpen, onClose, heading, name, lines }: {
  isOpen: boolean; onClose: () => void; heading: string; name: string; lines: [string, string];
}) => {
  const anim = useBoldness();
  return (
    <P5CutInStage isOpen={isOpen} onClose={onClose} ariaLabel={`${heading}${name}`} autoCloseMs={4500} onShown={triggerLevelFeedback}>
      <div className="relative">
        {/* 纸板背后探出的红/黑碎块 */}
        <span aria-hidden className="pointer-events-none absolute -left-4 -top-2 h-[64%] w-[52%]" style={{ background: P5R.red, clipPath: roughQuad(451, 14), transform: 'rotate(-4deg)' }} />
        <span aria-hidden className="pointer-events-none absolute -right-5 top-[18%] h-[58%] w-[46%]" style={{ background: P5R.ink, clipPath: roughQuad(452, 14), transform: 'rotate(5deg)' }} />
        <span aria-hidden className="pointer-events-none absolute -bottom-4 left-[12%] h-[26%] w-[70%]" style={{ background: '#5c0004', clipPath: roughQuad(453, 13), transform: 'rotate(-2deg)' }} />

        <P5Panel seed={450} jag={13} frame={4} keyline={0} face={P5R.paper} shadow={{ x: 6, y: 8 }} bodyClassName="px-5 pb-6 pt-12">
          {/* 多环巨星（黑/纸/红/纸/黑）+ 两侧小星与斜刺 */}
          <motion.div
            aria-hidden
            className="pointer-events-none relative mx-auto"
            style={{ width: 186, height: 186 }}
            initial={anim ? { scale: 0, rotate: -90, opacity: 0 } : false}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.32 }}
          >
            <P5RingStar size={186} className="absolute left-0 top-0" />
            <P5Star size={30} fill={P5R.grey} rot={-14} className="absolute" style={{ left: -14, bottom: 26 }} />
            <P5Star size={24} fill={P5R.red} rot={12} className="absolute" style={{ right: -8, top: 14 }} />
            <span className="absolute" style={{ right: -14, top: 96, width: 42, height: 5, background: P5R.red, transform: 'rotate(24deg)' }} />
            <span className="absolute" style={{ right: -18, top: 108, width: 34, height: 5, background: P5R.ink, transform: 'rotate(38deg)' }} />
          </motion.div>

          {/* 名称黑条 */}
          <motion.div
            className="relative mx-auto mt-4 w-fit max-w-full px-4 py-2"
            initial={anim ? { scaleX: 0.2, opacity: 0 } : false}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26, delay: 0.56 }}
          >
            <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: P5R.red, clipPath: roughQuad(454, 5) }} />
            <span aria-hidden className="absolute inset-0" style={{ background: P5R.ink, clipPath: roughQuad(455, 4) }} />
            <span className="relative block truncate text-[26px] font-black leading-none" style={{ color: P5R.paper, fontFamily: P5_FONT }}>{name}</span>
          </motion.div>

          <motion.div
            className="relative mt-3.5 text-center"
            initial={anim ? { y: 14, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26, delay: 0.68 }}
          >
            <p className="text-[15px] font-black leading-snug" style={{ color: P5R.ink, fontFamily: P5_FONT }}>{lines[0]}</p>
            <p className="text-[15px] font-black leading-snug" style={{ color: P5R.ink, fontFamily: P5_FONT }}>{lines[1]}</p>
            <span className="mt-2 flex justify-center"><P5Star size={16} fill={P5R.ink} /></span>
          </motion.div>
        </P5Panel>

        <StraddleTitle text={heading} size={50} />
        <P5CloseKey onClose={onClose} variant="star" style={{ right: -14, top: -100, height: 64, width: 64 }} />
      </div>
    </P5CutInStage>
  );
};
