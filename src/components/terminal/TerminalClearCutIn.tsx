/**
 * TerminalClearCutIn — F3 终端任务「我做到了」后的全屏结算屏（Batch 3）。
 *
 * 专属于治疗终端（不复用宣告卡 CallingCardCutIn，以免耦合「留下记录」按钮与宣告文案）：
 * 复用其视觉语言（主题色径向冲击 + 浮升粒子 + 印章），但文案随频道皮肤切换，
 * 展示叙事 + 本次属性奖励 + 弹幕机会解锁。由 store.terminalClear 触发，关闭走 clearTerminalClear。
 */
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { zClass } from '@/utils/zIndex';
import { useBackHandler } from '@/utils/useBackHandler';
import { triggerLightHaptic, playSound } from '@/utils/feedback';
import { terminalSkin, pickEncourage } from '@/utils/terminalSkin';

const PALETTE = {
  bg: 'linear-gradient(135deg, color-mix(in hsl, var(--color-primary) 12%, #0a0a0d) 0%, color-mix(in hsl, var(--color-primary) 22%, #14141a) 60%, #02020a 100%)',
  flash: 'color-mix(in hsl, var(--color-primary) 60%, transparent)',
  particle: 'color-mix(in hsl, var(--color-primary) 70%, #fff)',
};

export const TerminalClearCutIn = () => {
  const { terminalClear, clearTerminalClear, user, settings } = useAppStore();
  const skin = terminalSkin(user?.theme);
  const encourage = useMemo(() => pickEncourage(skin), [terminalClear, skin]);
  const playedRef = useRef(false);

  useEffect(() => {
    if (terminalClear && !playedRef.current) {
      playedRef.current = true;
      triggerLightHaptic();
      playSound('/battle-fanfare.mp3', 0.5);
    }
    if (!terminalClear) playedRef.current = false;
  }, [terminalClear]);

  useBackHandler(!!terminalClear, clearTerminalClear);

  const particles = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        id: i,
        leftPct: Math.random() * 100,
        size: 1.5 + Math.random() * 2.5,
        duration: 5 + Math.random() * 5,
        delay: Math.random() * 2,
        opacity: 0.25 + Math.random() * 0.4,
      })),
    [terminalClear],
  );

  const attrName = terminalClear?.rewardAttribute
    ? settings.attributeNames?.[terminalClear.rewardAttribute] ?? terminalClear.rewardAttribute
    : '';

  return createPortal(
    <AnimatePresence>
      {terminalClear && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`fixed inset-0 ${zClass.cutin} flex items-center justify-center p-6`}
          onClick={clearTerminalClear}
          role="dialog"
          aria-modal="true"
          aria-label="终端 · 完成"
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: PALETTE.bg }} />
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0.8, 0.4, 0.5], scale: [0.4, 1.4, 1.0, 1.05] }}
            transition={{ duration: 1.3, ease: 'easeOut' }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(circle at center, ${PALETTE.flash} 0%, transparent 55%)` }}
          />
          {/* 浮升粒子 */}
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

          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1, type: 'spring', damping: 18 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md text-center"
          >
            <div className="mb-2 text-[10px] font-black tracking-[5px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {skin.label.toUpperCase()}
            </div>

            <motion.h1
              initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)', filter: 'blur(8px)' }}
              animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)', filter: 'blur(0px)' }}
              transition={{ duration: 0.55, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
              className="mb-3 font-black"
              style={{
                color: 'var(--color-primary)',
                fontFamily: "'Caveat', cursive",
                fontSize: '3rem',
                lineHeight: 1.05,
                textShadow: `0 2px 16px ${PALETTE.flash}`,
              }}
            >
              {skin.clearHeading}
            </motion.h1>

            {/* 叙事卡 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.55, type: 'spring', damping: 16 }}
              className="relative mx-auto mb-5 px-6 py-5"
              style={{
                maxWidth: 360,
                background: 'rgba(0,0,0,0.32)',
                border: '2px solid var(--color-primary)',
                borderRadius: 12,
              }}
            >
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {terminalClear.goalTitle
                  ? `你又一次接近了《${terminalClear.goalTitle}》的心愿，从虚无中拯救了自己。`
                  : '你迈出了那一步，从虚无中把自己拉了回来。'}
              </p>
              <p className="mt-2 text-xs italic" style={{ color: 'rgba(255,255,255,0.55)' }}>
                「{terminalClear.stepTitle}」
              </p>

              <div
                aria-hidden
                className="absolute -top-2 -right-2 rounded-md px-2.5 py-1 text-[10px] font-black tracking-[3px]"
                style={{
                  color: 'var(--color-primary)',
                  border: '2px solid var(--color-primary)',
                  background: 'rgba(0,0,0,0.4)',
                  textShadow: '0 0 10px var(--color-primary)',
                  transform: 'rotate(-10deg)',
                }}
              >
                {skin.clearStamp}
              </div>
            </motion.div>

            {/* 奖励 / 弹幕解锁 */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.9 }}
              className="mb-5 flex flex-col items-center gap-1.5"
            >
              {terminalClear.rewardPoints > 0 ? (
                <span className="rounded-full bg-primary/20 px-3 py-1 text-sm font-bold text-white">
                  +{terminalClear.rewardPoints} {attrName}
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  今日的属性奖励已领过，但这一步依然算数
                </span>
              )}
              {terminalClear.danmakuGranted && (
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  ✦ 解锁一次鼓励他人的机会（发送即将开放）
                </span>
              )}
              <span className="mt-1 text-xs italic" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {encourage}
              </span>
            </motion.div>

            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1.1 }}
              whileTap={{ scale: 0.96 }}
              onClick={clearTerminalClear}
              className="mx-auto block w-full max-w-[280px] rounded-2xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/40"
            >
              收下这一步
            </motion.button>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.5, delay: 1.3 }}
              className="mt-4 text-sm italic"
              style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Caveat', cursive" }}
            >
              ─ Velvet
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
