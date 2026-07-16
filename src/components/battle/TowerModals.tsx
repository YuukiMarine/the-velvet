/**
 * 影时间高塔 · 节点弹窗组（批2）：事件 / 回响 / 登塔回顾
 * 效果应用在 BattleArena（store 原语），弹窗只负责选择与结果演出。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TowerEvent, TowerEventOption, TowerEventEffect } from '@/battle/events';
import { TowerSessionStats, TowerStratum } from '@/types';
import { ECHO_HEAL_PCT } from '@/battle/numbers';
import { playSound, triggerLightHaptic } from '@/utils/feedback';

const panelStyle = {
  background: 'linear-gradient(160deg, rgba(14,6,44,0.97), rgba(8,8,34,0.97))',
  border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)',
} as const;

// ── 事件弹窗 ────────────────────────────────────────────────
interface EventProps {
  event: TowerEvent;
  /** 素材注入：{echo} 占位替换等 */
  materialize: (text: string) => string;
  onResolve: (effects: TowerEventEffect[]) => void;
  onFinish: () => void;
}

export function TowerEventModal({ event, materialize, onResolve, onFinish }: EventProps) {
  const [result, setResult] = useState<string | null>(null);

  const choose = (opt: TowerEventOption) => {
    triggerLightHaptic();
    playSound('/ui-menu.mp3', 0.5);
    let text = opt.resultText;
    let effects = opt.effects;
    if (opt.chance !== undefined && Math.random() >= opt.chance) {
      text = opt.elseResultText ?? opt.resultText;
      effects = opt.elseEffects ?? opt.effects;
    }
    onResolve(effects);
    setResult(materialize(text));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.82)' }}
    >
      <motion.div
        initial={{ scale: 0.88, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        className="w-full max-w-sm rounded-2xl p-5 space-y-4"
        style={panelStyle}
      >
        <div className="text-center">
          <p className="text-3xl">{event.icon}</p>
          <p className="text-white font-black text-base mt-1">{event.title}</p>
        </div>
        <AnimatePresence mode="wait">
          {result === null ? (
            <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <p className="text-gray-300 text-sm leading-relaxed">{event.text}</p>
              <div className="space-y-2 pt-1">
                {event.options.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => choose(opt)}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-purple-100 text-left px-4 transition-all active:scale-[0.98]"
                    style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.16)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)' }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <p className="text-gray-200 text-sm leading-relaxed">{result}</p>
              <button
                onClick={onFinish}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.35)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.6)' }}
              >
                继续攀登
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ── 回响弹窗（回复 20% / 小增益 二选一） ────────────────────
interface EchoProps {
  onChoose: (choice: 'heal' | 'buff') => void;
}

export function TowerEchoModal({ onChoose }: EchoProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.82)' }}
    >
      <motion.div
        initial={{ scale: 0.88, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        className="w-full max-w-sm rounded-2xl p-5 space-y-4 text-center"
        style={panelStyle}
      >
        <p className="text-3xl">🌙</p>
        <p className="text-white font-black text-base">月光回响</p>
        <p className="text-gray-300 text-sm leading-relaxed">一小片月光落在塔层间。它愿意回应你一次——</p>
        <div className="flex gap-2">
          <button
            onClick={() => { triggerLightHaptic(); playSound('/pi.mp3', 0.4); onChoose('heal'); }}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-emerald-200"
            style={{ background: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.45)' }}
          >
            沐浴月光
            <span className="block text-[10px] opacity-70 mt-0.5">回复 {Math.round(ECHO_HEAL_PCT * 100)}% 体力</span>
          </button>
          <button
            onClick={() => { triggerLightHaptic(); playSound('/pi.mp3', 0.4); onChoose('buff'); }}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-purple-200"
            style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.18)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.45)' }}
          >
            汲取月辉
            <span className="block text-[10px] opacity-70 mt-0.5">本次登塔伤害 +6%</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── 登塔回顾（§7.2） ────────────────────────────────────────
interface RecapProps {
  reason: 'descend' | 'defeat' | 'clear';
  stats: TowerSessionStats | undefined;
  stratum: TowerStratum;
  onClose: () => void;
}

export function TowerRecapModal({ reason, stats, stratum, onClose }: RecapProps) {
  const title = reason === 'clear' ? '区层攻略！' : reason === 'defeat' ? '败退……' : '下塔结算';
  const flavor = reason === 'clear'
    ? `【${stratum.name}】的心魔已被讨伐——上方的黑暗开始蠕动。`
    : reason === 'defeat'
      ? '体力耗尽。塔记住了你倒下的位置——进度已保留。'
      : '今晚到此为止。塔层的进度已被月光标记。';

  const rows: Array<[string, string]> = [
    ['攀升层数', `${stats?.floorsClimbed ?? 0} 层`],
    ['探索节点', `${stats?.nodesCleared ?? 0} 个`],
    ['讨伐 Shadow', `${stats?.mobsDefeated ?? 0} 只`],
    ['总伤害', `${stats?.damageDealt ?? 0}`],
    ['最大单击', `${stats?.maxSingleHit ?? 0}`],
    ['弱点命中', `${stats?.weaknessHits ?? 0} 次`],
    ['SP 收获', `+${stats?.spEarned ?? 0}`],
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.88)' }}
    >
      <motion.div
        initial={{ scale: 0.88, y: 18, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={panelStyle}
      >
        <div className="text-center">
          <p className="text-3xl">{reason === 'clear' ? '🏆' : reason === 'defeat' ? '💀' : '🌙'}</p>
          <p className="text-white font-black text-lg mt-1">{title}</p>
          <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{flavor}</p>
        </div>
        <div className="rounded-xl divide-y divide-white/5" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-4 py-2">
              <span className="text-gray-400 text-xs">{k}</span>
              <span className="text-white text-sm font-bold tabular-nums">{v}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold text-white"
          style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.35)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.6)' }}
        >
          {reason === 'clear' ? '静候上方显形' : '返回'}
        </button>
      </motion.div>
    </motion.div>
  );
}
