/**
 * 祈愿特效层 —— 成功送出祈愿后的瞬时反馈。
 *
 * 展示：
 *   - 全屏金色辐射光晕
 *   - 中心 ✦ 四角星脉冲
 *   - 小弹窗卡片：谁 → 谁，以及"sent" / "reciprocal" 文案
 *   - 八方飞散的小星粒
 *
 * 生命周期：1.8s 后自动 dismiss（reciprocal 拉长到 2.4s）。
 */

import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

export type PrayerEffectKind = 'sent' | 'reciprocal';

interface Props {
  isOpen: boolean;
  kind: PrayerEffectKind;
  targetName: string;
  onDismiss: () => void;
}

const DURATION_SENT = 1800;
const DURATION_RECIP = 2400;

export function PrayerEffectOverlay({ isOpen, kind, targetName, onDismiss }: Props) {
  const isRecip = kind === 'reciprocal';
  const primary = isRecip ? '#fde68a' : '#fcd34d';
  const accent = isRecip ? '#f59e0b' : '#d97706';

  // 星粒的落点/尺寸只跟 kind 有关，算一次就够（原来每次 render 都重新 Math.random）
  const particles = useMemo(() => {
    const count = isRecip ? 16 : 10;
    const dist = isRecip ? 180 : 140;
    return Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (isRecip ? 0 : Math.PI / 8);
      return {
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        delay: i * 0.02,
        size: 5 + Math.random() * 4,
      };
    });
  }, [isRecip]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(onDismiss, kind === 'reciprocal' ? DURATION_RECIP : DURATION_SENT);
    return () => clearTimeout(t);
  }, [isOpen, kind, onDismiss]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="pray-fx"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[220] pointer-events-none flex items-center justify-center"
      >
        {/* 径向光晕。
            ⚠️ 性能改造（用户上报"大四角星弹窗一出来就卡"）：
            原来这里是 `inset-0` 满屏 + `mixBlendMode:'screen'` 并且同时动 opacity 与 scale。
            满屏混合模式会强制合成器**每帧把整个视口**和下面所有图层重新混一次，
            这是本组件最大的一笔开销——手机上直接掉帧。
            现在改成固定 560×560 的方块（光晕本来就只有中间那一坨有值，
            55% 之外是 transparent，满屏那部分纯属白烧），
            并去掉 mixBlendMode —— 底下是暗色遮罩，screen 混合与直接叠加几乎同色，
            观感不降级。只动 transform/opacity，交给合成器，不进主线程。 */}
        <motion.div
          key="glow"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.95, 0], scale: [0.6, 1.2, 1.6] }}
          transition={{ duration: isRecip ? 1.8 : 1.2, times: [0, 0.4, 1], ease: 'easeOut' }}
          className="absolute h-[560px] w-[560px] max-h-[110vh] max-w-[130vw]"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${primary}cc 0%, ${primary}44 26%, transparent 58%)`,
            willChange: 'transform, opacity',
          }}
        />

        {/* 外圈辐射 */}
        <motion.div
          key="ring"
          initial={{ opacity: 0.8, scale: 0.4 }}
          animate={{ opacity: 0, scale: isRecip ? 3.2 : 2.6 }}
          transition={{ duration: isRecip ? 1.4 : 1.0, ease: 'easeOut' }}
          className="absolute w-40 h-40 rounded-full"
          style={{
            border: `2px solid ${primary}`,
            boxShadow: `0 0 40px ${primary}aa, inset 0 0 30px ${primary}44`,
            willChange: 'transform, opacity',
          }}
        />

        {/* 中心大四角星 */}
        <motion.div
          key="star"
          initial={{ opacity: 0, scale: 0.3, rotate: isRecip ? -30 : 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            scale: isRecip ? [0.3, 1.1, 1.05, 0.9] : [0.3, 1.0, 0.95, 0.85],
            rotate: isRecip ? [-30, 0, 0, 10] : 0,
          }}
          transition={{ duration: isRecip ? 2.0 : 1.5, times: [0, 0.25, 0.7, 1], ease: 'easeOut' }}
          className="relative flex flex-col items-center"
          style={{ willChange: 'transform, opacity' }}
        >
          {/* 四角星。
              drop-shadow 是 filter：**filter 挂在自己动画的元素上 = 每帧重跑一次滤镜**。
              这里把动画留在父 motion.div（只有 transform/opacity），滤镜留在这个静止的 svg 上，
              浏览器就能把带辉光的星栅格化一次、之后纯合成缩放。辉光观感不变。 */}
          <svg width="120" height="120" viewBox="0 0 120 120" className="drop-shadow-[0_0_18px_#fbbf24]">
            <defs>
              <linearGradient id="prayStarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fffbeb" />
                <stop offset="60%" stopColor={primary} />
                <stop offset="100%" stopColor={accent} />
              </linearGradient>
            </defs>
            {/* 四角星形状：由 4 条细长菱形组成 */}
            <g transform="translate(60 60)">
              <path d="M 0 -54 L 10 -10 L 54 0 L 10 10 L 0 54 L -10 10 L -54 0 L -10 -10 Z"
                fill="url(#prayStarGrad)"
                stroke={accent}
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
              {/* 中心小核 */}
              <circle r="6" fill="#fffbeb" opacity="0.9" />
            </g>
          </svg>
        </motion.div>

        {/* 弹窗卡片 */}
        <motion.div
          key="card"
          initial={{ opacity: 0, y: 16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ delay: 0.3, type: 'spring', damping: 20, stiffness: 260 }}
          className="absolute bottom-[24%] px-5 py-3 rounded-2xl text-center"
          style={{
            // backdropFilter 已移除：它要在**每一帧**重新采样身后的画面，
            // 而这张卡本身带 spring 动画（y + scale），两者叠加是第二笔大开销。
            // 卡底本来就压着上面那圈强光晕，模糊与否几乎看不出来；
            // 底色不透明度从 .92/.95 提到 .96/.98 补足遮挡感。
            background: 'linear-gradient(180deg, rgba(30,20,60,0.96), rgba(12,8,30,0.98))',
            border: `1px solid ${primary}80`,
            boxShadow: `0 18px 50px ${primary}55, 0 0 30px ${primary}33`,
            minWidth: 220,
            willChange: 'transform, opacity',
          }}
        >
          <div
            className="text-[10px] tracking-[0.4em] font-bold mb-1"
            style={{ color: primary }}
          >
            {isRecip ? 'RECIPROCAL' : 'A PRAYER SENT'}
          </div>
          <div className="text-base font-serif" style={{ color: '#fef3c7' }}>
            {isRecip ? '愿望之光交汇' : '愿望已送达'}
          </div>
          <div className="text-[11px] mt-1 leading-relaxed" style={{ color: '#e0d4a8' }}>
            {isRecip
              ? <>你与 <span className="font-semibold" style={{ color: primary }}>{targetName}</span> 今日互祈</>
              : <>送给 <span className="font-semibold" style={{ color: primary }}>{targetName}</span> · 双方 +2 SP</>
            }
          </div>
        </motion.div>

        {/* 飞散的小星粒。size 原来在 render 里 Math.random()，
            父组件每重渲染一次所有星粒的尺寸就跳一次（也让 motion 白白重算）；
            改成按 kind 记忆一次。 */}
        {particles.map(({ tx, ty, delay, size }, i) => {
          return (
            <motion.div
              key={`p-${i}`}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{
                x: tx,
                y: ty,
                opacity: [0, 1, 0],
                scale: [0.4, 1, 0.3],
              }}
              transition={{ duration: isRecip ? 1.4 : 1.0, delay, ease: 'easeOut' }}
              className="absolute"
              style={{
                width: size,
                height: size,
                background: primary,
                borderRadius: '50%',
                boxShadow: `0 0 8px ${primary}`,
                willChange: 'transform, opacity',
              }}
            />
          );
        })}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
