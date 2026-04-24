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

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
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
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(onDismiss, kind === 'reciprocal' ? DURATION_RECIP : DURATION_SENT);
    return () => clearTimeout(t);
  }, [isOpen, kind, onDismiss]);

  if (!isOpen) return null;

  const isRecip = kind === 'reciprocal';
  const primary = isRecip ? '#fde68a' : '#fcd34d';
  const accent = isRecip ? '#f59e0b' : '#d97706';
  const particleCount = isRecip ? 16 : 10;

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
        {/* 径向光晕 */}
        <motion.div
          key="glow"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.95, 0], scale: [0.6, 1.2, 1.6] }}
          transition={{ duration: isRecip ? 1.8 : 1.2, times: [0, 0.4, 1], ease: 'easeOut' }}
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 48%, ${primary}aa 0%, ${primary}33 25%, transparent 55%)`,
            mixBlendMode: 'screen',
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
        >
          {/* 四角星 */}
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
            background: 'linear-gradient(180deg, rgba(30,20,60,0.92), rgba(12,8,30,0.95))',
            border: `1px solid ${primary}80`,
            boxShadow: `0 18px 50px ${primary}55, 0 0 30px ${primary}33`,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            minWidth: 220,
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

        {/* 飞散的小星粒 */}
        {Array.from({ length: particleCount }).map((_, i) => {
          const angle = (Math.PI * 2 * i) / particleCount + (isRecip ? 0 : Math.PI / 8);
          const dist = isRecip ? 180 : 140;
          const tx = Math.cos(angle) * dist;
          const ty = Math.sin(angle) * dist;
          const delay = i * 0.02;
          const size = 5 + Math.random() * 4;
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
              }}
            />
          );
        })}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
