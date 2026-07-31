/**
 * 影时间高塔 · 节点弹窗组（批2）：事件 / 回响 / 登塔回顾
 * 效果应用在 BattleArena（store 原语），弹窗只负责选择与结果演出。
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { TowerEvent, TowerEventOption, TowerEventEffect } from '@/battle/events';
import { TowerSessionStats, TowerStratum } from '@/types';
import { ECHO_HEAL_PCT } from '@/battle/numbers';
import type { MirrorQuestion } from '@/battle/quiz';
import { playSound, triggerLightHaptic } from '@/utils/feedback';
import { slantPoly, NoiseLayer, IconDrop, IconOrb, IconCase, IconMask, IconTower } from '@/components/battle/warKit';

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

// ── R19 #3 影之商店：商人事件的图形化店面（其余事件走通用问答面）──────────
/** 货品视觉：按效果推断图标与一句话（events.ts 的 label 里只有名字+价） */
const wareVisual = (opt: TowerEventOption): { Icon: typeof IconDrop; desc: string } => {
  const kinds = opt.effects.map(e => e.kind);
  if (kinds.includes('hpHealPct')) return { Icon: IconDrop, desc: '回复 15% 体力' };
  if (kinds.includes('randomMyth')) return { Icon: IconOrb, desc: '随机一枚迷思石' };
  return { Icon: IconCase, desc: '残月品质遗物' };
};

function MerchantFront({ event, playerSp, onPick }: {
  event: TowerEvent; playerSp?: number; onPick: (opt: TowerEventOption) => void;
}) {
  const wares = event.options.filter(o => o.costSp !== undefined);
  const pass = event.options.find(o => o.costSp === undefined);
  return (
    <div className="space-y-3">
      {/* 遮篷：斜纹布 + 垂穗 */}
      <motion.div
        initial={{ y: -26, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        className="relative -mx-5 -mt-5"
      >
        <div className="h-6" style={{ background: 'repeating-linear-gradient(100deg, rgba(139,124,246,0.55) 0 16px, rgba(24,16,58,0.9) 16px 32px)' }} />
        <div className="flex">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="h-2.5 flex-1" style={{ clipPath: 'polygon(0 0, 100% 0, 50% 100%)', background: i % 2 ? 'rgba(24,16,58,0.9)' : 'rgba(139,124,246,0.55)' }} />
          ))}
        </div>
        {/* 招牌 */}
        <motion.span
          initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}
          className="absolute left-1/2 top-[7px] -translate-x-1/2 whitespace-nowrap px-3 py-1 text-[12px] font-black tracking-[0.4em] text-white"
          style={{ clipPath: slantPoly(6), background: 'rgba(12,7,30,0.95)', border: '1px solid rgba(139,124,246,0.6)' }}
        >
          影之商店
        </motion.span>
      </motion.div>
      {/* 摊主：面具剪影 + 开场白 */}
      <div className="flex items-start gap-2.5 px-0.5">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.12 }}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-indigo-200"
          style={{ clipPath: slantPoly(7), background: 'rgba(139,124,246,0.2)', border: '1px solid rgba(139,124,246,0.5)' }}
        >
          <IconMask size={20} />
        </motion.span>
        <p className="text-[12px] leading-relaxed text-gray-300">{event.text}</p>
      </div>
      {/* 货架 */}
      <div className="space-y-2">
        {wares.map((opt, i) => {
          const { Icon, desc } = wareVisual(opt);
          const name = opt.label.split('（')[0];
          const short = opt.costSp !== undefined && playerSp !== undefined && playerSp < opt.costSp;
          return (
            <motion.button
              key={opt.label}
              initial={{ x: -22, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.16 + i * 0.09, type: 'spring', stiffness: 380, damping: 28 }}
              whileTap={short ? undefined : { scale: 0.97 }}
              onClick={() => !short && onPick(opt)}
              disabled={short}
              className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left disabled:opacity-45"
              style={{ clipPath: slantPoly(8), background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(139,124,246,0.35)' }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center text-indigo-200" style={{ clipPath: slantPoly(6), background: 'rgba(139,124,246,0.16)' }}>
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-black leading-tight text-white">{name}</span>
                <span className="block text-[10px] text-white/50">{desc}</span>
              </span>
              <motion.span
                initial={{ rotate: -6 }} animate={{ rotate: [-6, 3, -6] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.3 }}
                className="shrink-0 px-2 py-1 text-[11px] font-black tabular-nums"
                style={{
                  clipPath: slantPoly(5),
                  background: short ? 'rgba(255,255,255,0.08)' : 'rgba(250,204,21,0.18)',
                  color: short ? 'rgba(255,255,255,0.4)' : '#fde047',
                  border: `1px solid ${short ? 'rgba(255,255,255,0.15)' : 'rgba(250,204,21,0.5)'}`,
                }}
              >
                {opt.costSp} SP
              </motion.span>
            </motion.button>
          );
        })}
      </div>
      {pass && (
        <button onClick={() => onPick(pass)} className="w-full py-1.5 text-center text-[11px] font-semibold text-white/40">
          {pass.label} ›
        </button>
      )}
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
        {event.id !== 'shadow-merchant' && (
          <div className="text-center">
            <p className="text-3xl">{event.icon}</p>
            <p className="text-white font-black text-base mt-1">{event.title}</p>
          </div>
        )}
        <AnimatePresence mode="wait">
          {result === null ? (
            <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {event.id === 'shadow-merchant' ? (
                <MerchantFront event={event} playerSp={playerSp} onPick={choose} />
              ) : (
                <>
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
                </>
              )}
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

// ── 镜之自问弹窗（批3：真实两题问答，全对发奖、答错无惩罚） ──
interface QuizProps {
  questions: MirrorQuestion[];
  reward: number;
  onDone: (allCorrect: boolean) => void;
}

export function TowerQuizModal({ questions, reward, onDone }: QuizProps) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const q = questions[idx];
  const last = idx >= questions.length - 1;

  const pick = (i: number) => {
    if (picked !== null) return;
    triggerLightHaptic();
    playSound(i === q.correctIdx ? '/battle-seal.mp3' : '/ui-menu.mp3', 0.5);
    setPicked(i);
    if (i === q.correctIdx) setCorrectCount(c => c + 1);
  };

  const advance = () => {
    if (last) {
      onDone(correctCount === questions.length); // pick 时已计入本题
      return;
    }
    setIdx(i => i + 1);
    setPicked(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.85)' }}
    >
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full flex justify-center">
        <SlantPanel className="p-5 space-y-4">
          <div className="text-center">
            <p className="text-3xl">🪞</p>
            <p className="text-white font-black text-base mt-1">镜之自问</p>
            <p className="text-[10px] font-bold text-indigo-300/60 mt-0.5">
              第 {idx + 1}/{questions.length} 问 · 全对 +{reward} SP · 答错无惩罚
            </p>
          </div>
          <p className="text-gray-200 text-sm leading-relaxed">{q.q}</p>
          <div className="space-y-2">
            {q.options.map((opt, i) => {
              const revealed = picked !== null;
              const isCorrect = i === q.correctIdx;
              const isPicked = i === picked;
              return (
                <button
                  key={i}
                  onClick={() => pick(i)}
                  disabled={revealed}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-left px-4 transition-all active:scale-[0.98]"
                  style={{
                    background: revealed && isCorrect ? 'rgba(16,185,129,0.25)'
                      : revealed && isPicked ? 'rgba(239,68,68,0.22)'
                      : 'rgb(var(--color-battle-bright-rgb) / 0.16)',
                    border: revealed && isCorrect ? '1px solid rgba(16,185,129,0.6)'
                      : revealed && isPicked ? '1px solid rgba(239,68,68,0.5)'
                      : '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)',
                    color: revealed && isCorrect ? '#6ee7b7' : '#e9d5ff',
                  }}
                >
                  {opt}
                  {revealed && isCorrect && <span className="ml-2 text-[10px]">✓</span>}
                  {revealed && isPicked && !isCorrect && <span className="ml-2 text-[10px]">✗</span>}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <button
              onClick={advance}
              className="w-full py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.35)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.6)' }}
            >
              {last ? '面对答案' : '下一问'}
            </button>
          )}
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

/** motion 补间 SVG r：环放大描边恒粗（LootReveal 同技法，结算终幕用） */
const RecapRing = ({ r1, stroke, width, delay, duration }: { r1: number; stroke: string; width: number; delay: number; duration: number }) => (
  <motion.circle
    cx="50%" cy="50%" fill="none" stroke={stroke} strokeWidth={width}
    initial={{ r: 16, opacity: 0 }}
    animate={{ r: r1, opacity: [0, 0.85, 0.35, 0] }}
    transition={{ duration, delay, ease: [0.16, 0.7, 0.35, 1], opacity: { duration, delay, times: [0, 0.1, 0.42, 0.78] } }}
  />
);

/** R19 #1 重做：三档语气（攻略金 / 败退红 / 下塔靛）+ 分层级联——
 *  斜章大标题砸入 → 英雄三格（层数/讨伐/SP）→ 次要 2×2 → 评语 → CTA；
 *  攻略档追加全屏金环爆。portal 到 body（战斗层层叠语境修复同族）。 */
export function TowerRecapModal({ reason, stats, stratum, comment, onClose }: RecapProps) {
  const tone = reason === 'clear'
    ? { accent: '#fbbf24', rgb: '251,191,36', title: '区层攻略', ink: '#1a1203' }
    : reason === 'defeat'
      ? { accent: '#f87171', rgb: '248,113,113', title: '败退……', ink: '#ffffff' }
      : { accent: '#a5b4fc', rgb: '165,180,252', title: '下塔结算', ink: '#12102e' };
  const flavor = reason === 'clear'
    ? `【${stratum.name}】的心魔已被讨伐——上方的黑暗开始蠕动。`
    : reason === 'defeat'
      ? '体力耗尽。塔记住了你倒下的位置——进度已保留。'
      : '今晚到此为止。塔层的进度已被月光标记。';

  const hero: Array<[string, string]> = [
    ['攀升层数', `${stats?.floorsClimbed ?? 0}`],
    ['讨伐 Shadow', `${stats?.mobsDefeated ?? 0}`],
    ['SP 收获', `+${stats?.spEarned ?? 0}`],
  ];
  const minor: Array<[string, string]> = [
    ['探索节点', `${stats?.nodesCleared ?? 0}`],
    ['总伤害', `${stats?.damageDealt ?? 0}`],
    ['最大单击', `${stats?.maxSingleHit ?? 0}`],
    ['弱点命中', `${stats?.weaknessHits ?? 0}`],
  ];

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden p-5"
      style={{ background: 'radial-gradient(circle at 50% 40%, rgba(21,16,50,0.96) 0%, rgba(4,3,12,0.98) 64%)' }}
    >
      {/* 攻略档：金环爆 */}
      {reason === 'clear' && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
          <RecapRing r1={330} stroke="rgba(251,191,36,0.9)" width={14} delay={0.05} duration={1.0} />
          <RecapRing r1={430} stroke="rgba(255,255,255,0.6)" width={8} delay={0.16} duration={1.15} />
          <RecapRing r1={540} stroke="rgba(251,191,36,0.45)" width={18} delay={0.28} duration={1.3} />
        </svg>
      )}
      <motion.div
        initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="w-full flex justify-center"
      >
        <SlantPanel className="p-5">
          {/* ① 斜章标题：色块砸入 + 微斜 */}
          <motion.div
            initial={{ clipPath: 'inset(-10% 102% -10% -2%)', x: 24 }}
            animate={{ clipPath: 'inset(-10% -4% -10% -2%)', x: 0 }}
            transition={{ duration: 0.38, delay: 0.08, ease: [0.2, 0.9, 0.25, 1] }}
            className="relative -mx-1 px-4 py-2.5"
            style={{ clipPath: slantPoly(10), background: `linear-gradient(100deg, ${tone.accent}, rgba(${tone.rgb},0.65))`, rotate: '-1.5deg' }}
          >
            <p className="text-[26px] font-black leading-none tracking-wide" style={{ color: tone.ink, fontFamily: 'Georgia, "Noto Serif SC", serif' }}>
              {tone.title}{reason === 'clear' && <span className="ml-1 align-top text-[15px]">！</span>}
            </p>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 opacity-25" style={{ color: tone.ink }}>
              <IconTower size={30} />
            </span>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="mt-2.5 px-0.5 text-[11px] leading-relaxed text-gray-400"
          >
            {flavor}
          </motion.p>

          {/* ② 英雄三格：大数字 */}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {hero.map(([k, v], i) => (
              <motion.div
                key={k}
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.38 + i * 0.09, type: 'spring', stiffness: 380, damping: 24 }}
                className="px-1 py-2.5 text-center"
                style={{ clipPath: slantPoly(8), background: `rgba(${tone.rgb},0.1)`, border: `1px solid rgba(${tone.rgb},0.35)` }}
              >
                <p className="text-[24px] font-black italic leading-none tabular-nums" style={{ color: tone.accent, letterSpacing: '-0.03em' }}>{v}</p>
                <p className="mt-1 text-[9px] font-bold tracking-[0.14em] text-white/50">{k}</p>
              </motion.div>
            ))}
          </div>

          {/* ③ 次要 2×2 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.66 }}
            className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2"
            style={{ clipPath: slantPoly(8), background: 'rgba(255,255,255,0.04)' }}
          >
            {minor.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between">
                <span className="text-[10px] font-semibold text-gray-500">{k}</span>
                <span className="text-[14px] font-black tabular-nums text-white/85">{v}</span>
              </div>
            ))}
          </motion.div>

          {/* ④ 影之评语 */}
          {comment && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
              className="mt-2 px-3.5 py-2.5"
              style={{ clipPath: slantPoly(10), background: 'rgba(99,102,241,0.12)' }}
            >
              <p className="mb-1 text-[10px] font-black tracking-[0.2em] text-indigo-300/70">影之评语</p>
              <p className="text-[12px] italic leading-relaxed text-indigo-100/90">{comment}</p>
            </motion.div>
          )}

          {/* ⑤ CTA */}
          <motion.button
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: comment ? 0.92 : 0.8 }}
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            className="mt-3 w-full py-3 text-sm font-black"
            style={{
              clipPath: slantPoly(10),
              background: reason === 'clear' ? `linear-gradient(90deg, ${tone.accent}, rgba(${tone.rgb},0.7))` : `rgba(${tone.rgb},0.22)`,
              color: reason === 'clear' ? tone.ink : '#ffffff',
              border: reason === 'clear' ? 'none' : `1px solid rgba(${tone.rgb},0.5)`,
            }}
          >
            {reason === 'clear' ? '静候上方显形' : '返回'}
          </motion.button>
        </SlantPanel>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
