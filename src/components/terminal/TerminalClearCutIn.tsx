/**
 * TerminalClearCutIn — F3 终端任务「我做到了」后的全屏结算屏「逻辑容器」。
 *
 * 专属于治疗终端（不复用宣告卡 CallingCardCutIn）：本文件持有触发 / 音效 / 返回拦截 /
 * 主题色径向冲击 + 浮升粒子 + portal 等共享外层，构造 view-model 后按频道委派内容层
 * （thief = 夺回成功·印章爆破 / 其余 = 通用结算）。由 store.terminalClear 触发，
 * 关闭走 clearTerminalClear。
 */
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { zClass } from '@/utils/zIndex';
import { useBackHandler } from '@/utils/useBackHandler';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic, playSound } from '@/utils/feedback';
import { terminalSkin, terminalChannel, pickEncourage } from '@/utils/terminalSkin';
import { ClearContentDefault } from './ClearContentDefault';
import { ClearContentThief, ThiefClearBg } from './ClearContentThief';
import { ClearContentBoard } from './ClearContentBoard';
import { ClearContentTV } from './ClearContentTV';
import type { ClearVM } from './ClearContentDefault';

const PALETTE = {
  bg: 'linear-gradient(135deg, color-mix(in hsl, var(--color-primary) 12%, #0a0a0d) 0%, color-mix(in hsl, var(--color-primary) 22%, #14141a) 60%, #02020a 100%)',
  flash: 'color-mix(in hsl, var(--color-primary) 60%, transparent)',
  particle: 'color-mix(in hsl, var(--color-primary) 70%, #fff)',
};

export const TerminalClearCutIn = () => {
  const { terminalClear, clearTerminalClear, user, settings } = useAppStore();
  const skin = terminalSkin(user?.theme);
  const channel = terminalChannel(user?.theme);
  const bold = useBoldness();
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

  const vm: ClearVM | null = terminalClear
    ? {
        skin,
        goalTitle: terminalClear.goalTitle,
        stepTitle: terminalClear.stepTitle,
        rewardPoints: terminalClear.rewardPoints,
        attrName,
        danmakuGranted: !!terminalClear.danmakuGranted,
        encourage,
        bold,
        flash: PALETTE.flash,
        onClose: clearTerminalClear,
      }
    : null;

  return createPortal(
    <AnimatePresence>
      {terminalClear && vm && (
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
          {/* 浮升粒子（仅 bold；D0 不挂无限动画） */}
          {bold && (
            <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
              {particles.map((p) => (
                <motion.span
                  key={p.id}
                  className="absolute rounded-full"
                  style={{ left: `${p.leftPct}%`, bottom: -8, width: p.size, height: p.size, background: PALETTE.particle, opacity: p.opacity, boxShadow: `0 0 ${p.size * 3}px ${PALETTE.particle}` }}
                  animate={{ y: [0, -window.innerHeight - 40] }}
                  transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
                />
              ))}
            </div>
          )}

          {/* 怪盗专属动态背景（仅 bold；D0 退回纯渐变+冲击） */}
          {channel === 'thief' && bold && <ThiefClearBg />}

          {channel === 'thief' ? <ClearContentThief vm={vm} /> : channel === 'board' ? <ClearContentBoard vm={vm} /> : channel === 'tv' ? <ClearContentTV vm={vm} /> : <ClearContentDefault vm={vm} />}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
