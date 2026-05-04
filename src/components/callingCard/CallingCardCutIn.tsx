import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useBackHandler } from '@/utils/useBackHandler';
import { triggerLightHaptic, playSound } from '@/utils/feedback';
import type { CallingCard } from '@/types';

interface Props {
  card: CallingCard | null;
  onClose: () => void;
}

/**
 * 宣告·达成 / 时之至 全屏结算屏（v2.2 cinematic 重写）。
 *
 * 触发：
 *   - sweepCallingCards 把达成 / 过期的卡 archive → cutInShown=false
 *   - completeTodo 完成最后一项关联待办时也会 sweep，立即弹出（不必等回 Dashboard）
 *   - App.tsx 顶层 GlobalCallingCardCutIn 取队首一张渲染
 *
 * 动画分镜（约 1.6s 入场）：
 *   ① 0.00–0.25s: 黑底 flash + 主题色 radial 冲击波从中心扩散，斜条纹底纹随后铺入
 *   ② 0.25–0.55s: "CALLING CARD" tracking 字符 stagger 揭出
 *   ③ 0.40–0.80s: "宣告·达成 / 时之至" 大字带 motion-blur shutter 揭幕（clip-path 横向开合）
 *   ④ 0.65–1.05s: 卡身 box 弹入；title spring，subtitle 跟入；同时一道斜向 sweep 高光从左上掠到右下
 *   ⑤ 1.00–1.30s: 印章 SLAM —— 从 scale 3 砸到 1，触发径向 shockwave ring + 粒子四溅
 *   ⑥ 1.30–1.70s: 操作按钮淡入；底部"─ Velvet"落款渐显
 *
 * 持续效果：
 *   - 微小相机抖动 (印章 SLAM 后 350ms)
 *   - 浮升金粒子（fixed inset 12 颗）
 *   - 主题色径向光晕 1.6s 慢呼吸
 */

// 配色：完全跟随主题 var(--color-primary)
const PALETTE = {
  bgGradient:
    'linear-gradient(135deg, color-mix(in hsl, var(--color-primary) 12%, #0a0a0d) 0%, color-mix(in hsl, var(--color-primary) 22%, #14141a) 60%, #02020a 100%)',
  stamp: 'var(--color-primary)',
  flash: 'color-mix(in hsl, var(--color-primary) 60%, transparent)',
  flashSoft: 'color-mix(in hsl, var(--color-primary) 25%, transparent)',
  particle: 'color-mix(in hsl, var(--color-primary) 70%, #fff)',
};

export function CallingCardCutIn({ card, onClose }: Props) {
  const { writeCallingCardLedger, markCallingCardCutInShown } = useAppStore();
  const [ledgerWriting, setLedgerWriting] = useState(false);
  const [ledgered, setLedgered] = useState(false);
  // 印章是否已经 SLAM（控制 shockwave 触发时机）
  const [stampLanded, setStampLanded] = useState(false);
  const cardKeyRef = useRef<string | null>(null);

  // 进入时播一次主题音 + 触感
  useEffect(() => {
    if (!card) {
      cardKeyRef.current = null;
      setStampLanded(false);
      return;
    }
    if (cardKeyRef.current === card.id) return;
    cardKeyRef.current = card.id;
    setStampLanded(false);
    triggerLightHaptic();
    playSound('/battle-fanfare.mp3', 0.6);
    setLedgered(!!card.ledgerWritten);
    // 印章 SLAM 时间点：约 1.05s（与 framer-motion delay 对齐）
    const t = setTimeout(() => {
      setStampLanded(true);
      // SLAM 时再来一次轻触感，制造"砸下来"的物理感
      triggerLightHaptic();
    }, 1050);
    return () => clearTimeout(t);
  }, [card?.id]);

  const handleClose = async () => {
    if (card) await markCallingCardCutInShown(card.id);
    onClose();
  };

  useBackHandler(!!card, handleClose);

  const onLedger = async () => {
    if (!card || ledgered || ledgerWriting) return;
    setLedgerWriting(true);
    try {
      await writeCallingCardLedger(card.id);
      setLedgered(true);
    } finally {
      setLedgerWriting(false);
    }
  };

  // 浮升粒子的随机参数（card 切换时重算）
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        leftPct: Math.random() * 100,
        size: 1.5 + Math.random() * 2.5,
        duration: 5 + Math.random() * 5,
        delay: Math.random() * 2,
        opacity: 0.25 + Math.random() * 0.4,
      })),
    [card?.id],
  );
  // 印章 SLAM 时四溅的尘屑（8 片，由 stampLanded 触发）
  const dust = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
        return {
          id: i,
          x: Math.cos(angle) * (60 + Math.random() * 40),
          y: Math.sin(angle) * (60 + Math.random() * 40),
          size: 2 + Math.random() * 2,
          duration: 0.6 + Math.random() * 0.3,
        };
      }),
    [card?.id, stampLanded],
  );

  if (!card) return null;
  const reasonHeading =
    card.archiveReason === 'auto_date'
      ? '宣告 · 时之至'
      : card.archiveReason === 'auto_todos'
      ? '宣告 · 达成'
      : '宣告 · 已收';
  const reasonStamp = card.archiveReason === 'auto_date' ? 'EXPIRED' : 'CLEARED';
  const reasonHint =
    card.archiveReason === 'auto_date'
      ? '约定的那一日已经到来。'
      : card.archiveReason === 'auto_todos'
      ? '所有任务已被你跨过。'
      : '收存于档案。';

  // ── 字符 stagger 用：把"✦ CALLING CARD ✦"切碎 ──
  const headerLetters = ['✦', ' ', 'C', 'A', 'L', 'L', 'I', 'N', 'G', ' ', 'C', 'A', 'R', 'D', ' ', '✦'];

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          key={card.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-6"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="宣告卡 · 达成"
        >
          {/* ① 黑底 + 主题色径向冲击波（从中心向外脉冲） */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: PALETTE.bgGradient }} />
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0.85, 0.4, 0.5], scale: [0.4, 1.4, 1.0, 1.05] }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${PALETTE.flash} 0%, transparent 55%)`,
            }}
          />
          {/* 慢呼吸（持续） */}
          <motion.div
            aria-hidden
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${PALETTE.flashSoft} 0%, transparent 55%)`,
            }}
          />

          {/* 斜条纹底纹（从顶部滑入） */}
          <motion.svg
            aria-hidden
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 0.55, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            <defs>
              <pattern id="cutin-stripes" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(-45)">
                <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cutin-stripes)" />
          </motion.svg>

          {/* 浮升粒子层（持续） */}
          <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map(p => (
              <motion.span
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: `${p.leftPct}%`,
                  bottom: -8,
                  width: p.size,
                  height: p.size,
                  background: PALETTE.particle,
                  opacity: p.opacity,
                  boxShadow: `0 0 ${p.size * 3}px ${PALETTE.particle}`,
                }}
                animate={{ y: [0, -window.innerHeight - 40] }}
                transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
              />
            ))}
          </div>

          {/* ── 内容（带 SLAM 后的相机抖动） ── */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={
              stampLanded
                ? {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    x: [0, -3, 3, -2, 2, 0],
                  }
                : { opacity: 1, y: 0, scale: 1 }
            }
            transition={{
              opacity: { duration: 0.4, delay: 0.1 },
              y: { duration: 0.5, delay: 0.1, type: 'spring', damping: 18 },
              scale: { duration: 0.5, delay: 0.1, type: 'spring', damping: 18 },
              x: { duration: 0.35, ease: 'easeOut' }, // 相机抖动
            }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md text-center"
          >
            {/* ② 顶端 ✦ CALLING CARD ✦ —— 字符 stagger 揭幕 */}
            <div className="text-[10px] font-black tracking-[6px] mb-2 flex justify-center" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {headerLetters.map((ch, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: 0.25 + i * 0.025 }}
                  className="inline-block"
                  style={{ minWidth: ch === ' ' ? '0.4em' : undefined }}
                >
                  {ch === ' ' ? ' ' : ch}
                </motion.span>
              ))}
            </div>

            {/* ③ 宣告·达成 大字 —— shutter 揭幕（clipPath 从右往左收尾） */}
            <motion.h1
              initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)', filter: 'blur(8px)' }}
              animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)', filter: 'blur(0px)' }}
              transition={{ duration: 0.55, delay: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-3xl font-black mb-1"
              style={{
                color: 'var(--color-primary)',
                fontFamily: "'Caveat', cursive",
                fontSize: '3rem',
                lineHeight: 1.05,
                textShadow: `0 2px 16px ${PALETTE.flash}`,
              }}
            >
              {reasonHeading}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.65 }}
              className="text-sm mb-6"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              {reasonHint}
            </motion.div>

            {/* ④ 核心 title block —— 弹入 + 内部斜向 sweep 高光

                结构：外层 motion.div（不裁切，让印章 / 尘屑可以悬于卡身之上）
                     + 内层"裁剪层" .absolute inset-0 overflow-hidden（关住 sweep 光不溢出圆角）
                     + 内容（带 relative 抢到比裁剪层更高的层级） */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.75, type: 'spring', damping: 16 }}
              className="relative mb-6 mx-auto"
              style={{
                padding: '20px 24px',
                background: 'rgba(0,0,0,0.32)',
                border: `2px solid ${PALETTE.stamp}`,
                borderRadius: 12,
                maxWidth: 340,
              }}
            >
              {/* 裁剪子层：仅约束 sweep 光不超出圆角；印章 / shockwave / 尘屑都在这层之外 */}
              <div className="absolute inset-0 rounded-[10px] overflow-hidden pointer-events-none">
                {/* 斜向 sweep 光：左上 → 右下，宽窄渐变模拟金属反光 */}
                <motion.div
                  aria-hidden
                  initial={{ x: '-150%', opacity: 0 }}
                  animate={{ x: '150%', opacity: [0, 0.7, 0] }}
                  transition={{ duration: 0.9, delay: 0.95, ease: 'easeOut' }}
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(115deg, transparent 30%, ${PALETTE.flash} 48%, rgba(255,255,255,0.55) 50%, ${PALETTE.flash} 52%, transparent 70%)`,
                    mixBlendMode: 'screen',
                  }}
                />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.85 }}
                className="text-2xl mb-1 relative"
                style={{ color: 'rgba(255,255,255,0.85)' }}
              >
                {card.icon || '✦'}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.5, delay: 0.9 }}
                className="text-3xl font-black relative"
                style={{
                  color: '#fff',
                  fontFamily: "'Caveat', cursive",
                  fontSize: '2.4rem',
                  lineHeight: 1.1,
                  textShadow: `0 0 24px ${PALETTE.flash}`,
                }}
              >
                {card.title}
              </motion.div>
              {card.subtitle && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 1.05 }}
                  className="text-xs italic mt-2 relative"
                  style={{ color: 'rgba(255,255,255,0.6)' }}
                >
                  「{card.subtitle}」
                </motion.div>
              )}

              {/* ⑤ 印章 SLAM：scale 3 → 1，伴随 shockwave + 尘屑 */}
              <motion.div
                initial={{ opacity: 0, scale: 3, rotate: -28 }}
                animate={{ opacity: 0.94, scale: 1, rotate: -12 }}
                transition={{ duration: 0.45, delay: 1.05, type: 'spring', damping: 12 }}
                className="absolute -top-2 -right-2 px-2.5 py-1 rounded-md text-[10px] font-black tracking-[3px]"
                style={{
                  color: PALETTE.stamp,
                  border: `2px solid ${PALETTE.stamp}`,
                  background: 'rgba(0,0,0,0.4)',
                  textShadow: `0 0 10px ${PALETTE.stamp}`,
                }}
              >
                {reasonStamp}
              </motion.div>

              {/* 印章砸下时的 shockwave ring + 尘屑（仅在 stampLanded=true 时挂载） */}
              {stampLanded && (
                <>
                  <motion.div
                    aria-hidden
                    initial={{ opacity: 0.7, scale: 0.4 }}
                    animate={{ opacity: 0, scale: 4 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="absolute -top-2 -right-2 w-12 h-12 rounded-full pointer-events-none"
                    style={{
                      border: `2px solid ${PALETTE.stamp}`,
                      transform: 'translate(50%, -50%)',
                    }}
                  />
                  {dust.map(d => (
                    <motion.span
                      key={d.id}
                      aria-hidden
                      initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      animate={{ opacity: 0, x: d.x, y: d.y, scale: 0.4 }}
                      transition={{ duration: d.duration, ease: 'easeOut' }}
                      className="absolute pointer-events-none rounded-full"
                      style={{
                        top: 0,
                        right: 0,
                        width: d.size,
                        height: d.size,
                        background: PALETTE.particle,
                        boxShadow: `0 0 ${d.size * 2}px ${PALETTE.particle}`,
                      }}
                    />
                  ))}
                </>
              )}
            </motion.div>

            {/* ⑥ 操作按钮 */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1.4 }}
              className="flex flex-col gap-2 max-w-[280px] mx-auto"
            >
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onLedger}
                disabled={ledgered || ledgerWriting}
                className={`w-full py-3 rounded-2xl font-bold text-sm transition-all ${
                  ledgered
                    ? 'bg-primary/30 text-white/80'
                    : 'bg-primary text-white shadow-lg shadow-primary/40'
                }`}
              >
                {ledgered ? '✓ 已留下记录' : ledgerWriting ? '正在落墨…' : '留下记录'}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleClose}
                className="w-full py-2.5 rounded-2xl text-sm font-medium"
                style={{
                  color: 'rgba(255,255,255,0.7)',
                  background: 'rgba(255,255,255,0.06)',
                }}
              >
                收下卡片
              </motion.button>
            </motion.div>

            {/* 底部落款 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.5, delay: 1.6 }}
              className="mt-4 italic text-sm"
              style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Caveat', cursive" }}
            >
              ─ Velvet
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
