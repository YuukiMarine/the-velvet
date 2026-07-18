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
import { slantPoly, NoiseLayer } from '@/components/battle/warKit';

/** 斜切描边面板（clipPath 会切掉 border → 双层法） */
function SlantPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="w-full max-w-sm p-[1px]" style={{ clipPath: slantPoly(16), background: 'rgb(var(--color-battle-bright-rgb) / 0.5)' }}>
      <div
        className={`relative overflow-hidden ${className ?? ''}`}
        style={{ clipPath: slantPoly(16), background: 'linear-gradient(160deg, rgba(14,6,44,0.98), rgba(8,8,34,0.98))' }}
      >
        <NoiseLayer opacity={0.04} />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

// ── 事件弹窗 ────────────────────────────────────────────────
interface EventProps {
  event: TowerEvent;
  /** 素材注入：{echo} 占位替换等 */
  materialize: (text: string) => string;
  onResolve: (effects: TowerEventEffect[]) => void;
  onFinish: () => void;
  /** （批3）当前 SP：标价选项不足时置灰 */
  playerSp?: number;
}

export function TowerEventModal({ event, materialize, onResolve, onFinish, playerSp }: EventProps) {
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
        className="w-full flex justify-center"
      >
        <SlantPanel className="p-5 space-y-4">
        <div className="text-center">
          <p className="text-3xl">{event.icon}</p>
          <p className="text-white font-black text-base mt-1">{event.title}</p>
        </div>
        <AnimatePresence mode="wait">
          {result === null ? (
            <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              <p className="text-gray-300 text-sm leading-relaxed">{event.text}</p>
              <div className="space-y-2 pt-1">
                {event.options.map(opt => {
                  const short = opt.costSp !== undefined && playerSp !== undefined && playerSp < opt.costSp;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => !short && choose(opt)}
                      disabled={short}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-purple-100 text-left px-4 transition-all active:scale-[0.98] disabled:opacity-40"
                      style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.16)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)' }}
                    >
                      {opt.label}
                      {short && <span className="ml-2 text-[10px] text-gray-400">SP 不足</span>}
                    </button>
                  );
                })}
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
        </SlantPanel>
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
        className="w-full flex justify-center"
      >
        <SlantPanel className="p-5 space-y-4 text-center">
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
        </SlantPanel>
      </motion.div>
    </motion.div>
  );
}

// ── 登塔回顾（§7.2） ────────────────────────────────────────
interface RecapProps {
  reason: 'descend' | 'defeat' | 'clear';
  stats: TowerSessionStats | undefined;
  stratum: TowerStratum;
  /** 批3 §7.3 影之评语（AI 50字点评；null=未到/已关） */
  comment?: string | null;
  onClose: () => void;
}

export function TowerRecapModal({ reason, stats, stratum, comment, onClose }: RecapProps) {
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
        className="w-full flex justify-center"
      >
        <SlantPanel className="p-6 space-y-4">
        <div className="text-center">
          <p className="text-3xl">{reason === 'clear' ? '🏆' : reason === 'defeat' ? '💀' : '🌙'}</p>
          <p className="text-white font-black text-lg mt-1">{title}</p>
          <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{flavor}</p>
        </div>
        <div className="divide-y divide-white/5" style={{ background: 'rgba(255,255,255,0.04)', clipPath: slantPoly(10) }}>
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-4 py-2">
              <span className="text-gray-400 text-[11px] font-semibold">{k}</span>
              <span className="text-white text-lg font-black tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>{v}</span>
            </div>
          ))}
        </div>
        {comment && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="px-3.5 py-2.5"
            style={{ clipPath: slantPoly(10), background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.0)' }}
          >
            <p className="text-[10px] font-black tracking-[0.2em] text-indigo-300/70 mb-1">影之评语</p>
            <p className="text-[12px] leading-relaxed text-indigo-100/90 italic">{comment}</p>
          </motion.div>
        )}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold text-white"
          style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.35)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.6)' }}
        >
          {reason === 'clear' ? '静候上方显形' : '返回'}
        </button>
        </SlantPanel>
      </motion.div>
    </motion.div>
  );
}
