import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useBackHandler } from '@/utils/useBackHandler';
import { BattleAction, AttributeId, PersonaSkill, StatusEffect, StatusKind, ShadowActionKind } from '@/types';
import { triggerLightHaptic, playSound } from '@/utils/feedback';
import { isInShadowTime, SKILL_EFFECT_MAP, HEAL_VALUE_BY_ATTR, STATUS_LABELS } from '@/constants';
import { pickShadowLine } from '@/constants/shadowLines';
import { ShadowSVG } from '@/components/battle/ShadowSVG';
import { BattleStartOverlay } from '@/components/battle/BattleStartOverlay';
import { StatusBar } from '@/components/battle/StatusBar';
import { ConfidantSupportRow } from '@/components/cooperation/ConfidantSupportRow';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onVictory: () => void;
}

// ── Level-scaled Shadow dialogue pools ──────────────────────────────────────
// Each pool has lines per level tier: [Lv1-2 (弱), Lv3 (中), Lv4-5 (强)]
// pickByLevel selects from the appropriate tier then falls back to generic

function pickByLevel(pools: string[][], level: number): string {
  const tier = level <= 2 ? 0 : level <= 3 ? 1 : 2;
  const pool = pools[tier];
  return pool[Math.floor(Math.random() * pool.length)];
}

const PHASE2_DIALOGUE: string[][] = [
  // Lv1-2: surprised, unstable
  ['……什么？我还能……变得更强？', '不……这股力量……是从哪里来的……', '你逼我的……别怪我！'],
  // Lv3: composed but serious
  ['有趣……你比我想象的要强一些。', '……现在，才是真正的开始。', '我不得不认真起来了。'],
  // Lv4-5: overwhelming presence
  ['……愚蠢。你以为这就结束了？', '这才是我真正的力量——跪下吧。', '你亲手打开了深渊的大门。', '第二形态？不……这才是本体。'],
];

const DEFEAT_DIALOGUE: string[][] = [
  ['……不……可能……', '你……居然……', '我会记住的……总有一天……'],
  ['你……赢了……但这不是终结……', '这种力量……去往更高处吧……', '我只是……你内心的一部分……'],
  ['……不可能……我才是……你真正的……', '哼……不过是暂时的胜利罢了。', '记住我的名字……我会再度降临。', '……总有一天，你会发现……你需要我。'],
];

const SHADOW_ATTACK_DIALOGUE: string[][] = [
  // Lv1-2: taunting, childish
  ['痛吗？这只是开始哦。', '你的内心深处也有我的影子。', '别以为这就结束了！', '嘻嘻……你在发抖吗？', '再多挣扎一下吧。'],
  // Lv3: cold and calculating
  ['你的弱点……我看得清清楚楚。', '我的痛苦，你也要一起承受。', '这种程度的伤害……什么都改变不了。', '每一次攻击，我都在学习你。', '你以为你在变强？我也是。'],
  // Lv4-5: oppressive, absolute
  ['跪下。', '你的挣扎……令人厌烦。', '蝼蚁。', '这就是你所有的力量？可笑。', '我是深渊本身——你无法战胜深渊。', '感受绝望的滋味吧。', '你的恐惧……是我的养分。'],
];

const SHADOW_CRIT_DIALOGUE: string[][] = [
  ['啊哈！打中了！', '嘻嘻，疼吧？'],
  ['看到了吗？这就是差距。', '你的破绽……太多了。'],
  ['碾碎。', '弱者的命运就是如此。', '这一击……够你记住了吧。'],
];

const OFF_BALANCE_RECOVERY_DIALOGUE: string[][] = [
  ['……呜……别得意……', '不会再让你得逞了……', '……好痛……但我不会倒下！'],
  ['……有趣的手段。', '我不会再给你机会了。', '这点把戏……休想再用！'],
  ['……仅此而已。', '你以为这种程度就能让我屈膝？', '哼……不错的一击。但也仅此而已。'],
];

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

// ── Battle animation particle data ──────────────────────────────────────────
const DEATH_EXPLOSION_PARTICLES = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  angle: (i / 26) * 360,
  distance: 35 + (i % 5) * 18,
  size: 2 + (i % 3) * 1.5,
  color: (['#ef4444', '#f97316', '#fbbf24', '#ffffff'] as const)[i % 4],
  delay: (i % 7) * 0.03,
}));

function BattleFinishAnim() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'rgba(5,0,0,0.97)' }}
    >
      {/* Flash */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 0.25, delay: 0.05 }}
        style={{ background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.6), rgba(0,0,0,0.5))' }}
      />
      {/* Ripple rings */}
      {([0, 0.2, 0.38] as const).map((delay, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{ border: `${1.5 - i * 0.3}px solid rgba(239,68,68,${0.7 - i * 0.15})` }}
          initial={{ width: 0, height: 0, opacity: 1 }}
          animate={{ width: 260 + i * 70, height: 260 + i * 70, opacity: 0 }}
          transition={{ duration: 0.75, delay: 0.3 + delay, ease: 'easeOut' }}
        />
      ))}
      {/* Particle burst */}
      {DEATH_EXPLOSION_PARTICLES.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{ width: p.size, height: p.size, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
            y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
            opacity: [0, 1, 0.6, 0],
            scale: [0, 2, 1, 0],
          }}
          transition={{ duration: 0.85, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      {/* Scanlines */}
      {[0, 1].map(i => (
        <motion.div
          key={i}
          className="absolute w-full pointer-events-none"
          style={{
            height: 1.5,
            background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.9), transparent)',
            top: `${43 + i * 14}%`,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 0.3, delay: 0.22 + i * 0.08 }}
        />
      ))}
      {/* BATTLE — slides in from left */}
      <motion.div
        initial={{ x: -400 }}
        animate={{ x: [-400, 14, 0] }}
        transition={{ duration: 0.5, delay: 0.1, times: [0, 0.82, 1], ease: 'circOut' }}
        style={{
          fontSize: 'clamp(2.8rem,14vw,4.6rem)',
          fontWeight: 900,
          letterSpacing: '0.1em',
          color: 'transparent',
          WebkitTextStroke: '2px rgba(239,68,68,0.9)',
          textShadow: '0 0 30px rgba(239,68,68,0.8)',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
          lineHeight: 1.1,
          userSelect: 'none',
        }}
      >
        BATTLE
      </motion.div>
      {/* FINISH — slides in from right */}
      <motion.div
        initial={{ x: 400 }}
        animate={{ x: [400, -14, 0] }}
        transition={{ duration: 0.5, delay: 0.28, times: [0, 0.82, 1], ease: 'circOut' }}
        style={{
          fontSize: 'clamp(2.8rem,14vw,4.6rem)',
          fontWeight: 900,
          letterSpacing: '0.1em',
          color: 'white',
          WebkitTextStroke: '2px rgba(239,68,68,0.7)',
          textShadow: '0 0 20px rgba(255,255,255,0.6)',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
          lineHeight: 1.1,
          userSelect: 'none',
        }}
      >
        FINISH
      </motion.div>
    </motion.div>
  );
}

function DeathExplosion() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ border: `2px solid rgba(239,68,68,${0.8 - i * 0.2})` }}
          initial={{ width: 0, height: 0, opacity: 1 }}
          animate={{ width: 140 + i * 40, height: 140 + i * 40, opacity: 0 }}
          transition={{ duration: 0.55, delay, ease: 'easeOut' }}
        />
      ))}
      {DEATH_EXPLOSION_PARTICLES.slice(0, 16).map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * (p.distance * 0.55),
            y: Math.sin((p.angle * Math.PI) / 180) * (p.distance * 0.55),
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
          }}
          transition={{ duration: 0.65, delay: p.delay * 0.5, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

// Pokemon-style narration box
function NarrationBox({
  lines,
  index,
  onAdvance,
  canAdvance,
}: {
  lines: string[];
  index: number;
  onAdvance: () => void;
  canAdvance: boolean;
}) {
  useEffect(() => {
    if (!canAdvance) return;
    const timer = setTimeout(onAdvance, 5000);
    return () => clearTimeout(timer);
  }, [index, canAdvance, onAdvance]);

  const current = lines[index] ?? '';
  return (
    <motion.div
      className="mx-4 mb-3 p-3 rounded-xl cursor-pointer select-none"
      style={{ background: 'rgba(10,0,30,0.9)', border: '2px solid rgba(139,92,246,0.5)', minHeight: 52 }}
      onClick={canAdvance ? () => { playSound('/dd.mp3', 0.45); onAdvance(); } : undefined}
      whileTap={canAdvance ? { scale: 0.98 } : {}}
    >
      <p className="text-white text-sm leading-relaxed">{current}</p>
      {canAdvance && index < lines.length - 1 && (
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="text-purple-400 text-xs"
        >
          ▼
        </motion.span>
      )}
    </motion.div>
  );
}

// ── Status effect helpers ───────────────────────────────────────────────────

/** Find a status effect by kind */
function findStatus(effects: StatusEffect[], kind: StatusKind): StatusEffect | undefined {
  return effects.find(e => e.kind === kind);
}

/** Remove a status effect by kind (returns new array) */
function removeStatus(effects: StatusEffect[], kind: StatusKind): StatusEffect[] {
  return effects.filter(e => e.kind !== kind);
}

/** Add or stack a status effect. If stackable, increments stacks; else replaces. */
function upsertStatus(
  effects: StatusEffect[],
  newEffect: StatusEffect,
  stackable = false,
  maxStacks = 3,
): StatusEffect[] {
  const idx = effects.findIndex(e => e.kind === newEffect.kind);
  if (idx === -1) return [...effects, newEffect];
  if (!stackable) {
    // Refresh: take the higher turns/value
    const updated = {
      ...effects[idx],
      remainingTurns: Math.max(effects[idx].remainingTurns, newEffect.remainingTurns),
      value: newEffect.value,
      sourceName: newEffect.sourceName,
    };
    const copy = [...effects];
    copy[idx] = updated;
    return copy;
  }
  const updated = {
    ...effects[idx],
    stacks: Math.min(effects[idx].stacks + newEffect.stacks, maxStacks),
    remainingTurns: Math.max(effects[idx].remainingTurns, newEffect.remainingTurns),
  };
  const copy = [...effects];
  copy[idx] = updated;
  return copy;
}

/** Decrement all turn counts, drop expired */
function decayStatuses(effects: StatusEffect[]): StatusEffect[] {
  return effects
    .map(e => ({ ...e, remainingTurns: e.remainingTurns - 1 }))
    .filter(e => e.remainingTurns > 0);
}

// ── All-Out Cut-in ──────────────────────────────────────────────────────────
function AllOutCutIn({ personaName, shadowName }: { personaName: string; shadowName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ background: 'rgba(0,0,0,0.9)' }}
    >
      {/* Diagonal band */}
      <motion.div
        className="absolute w-[200%] h-24"
        initial={{ x: '-120%', rotate: -14, opacity: 0 }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.4, times: [0, 0.25, 0.75, 1], ease: 'easeOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.9), rgba(250,204,21,0.9), rgba(239,68,68,0.9), transparent)',
          boxShadow: '0 0 40px rgba(239,68,68,0.7)',
        }}
      />
      {/* Text */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
        animate={{ scale: [0.3, 1.2, 1], opacity: [0, 1, 1], rotate: [-8, -4, -4] }}
        transition={{ duration: 0.9, delay: 0.2, times: [0, 0.6, 1], ease: 'backOut' }}
        style={{
          fontSize: 'clamp(2.8rem,14vw,5rem)',
          fontWeight: 900,
          color: 'transparent',
          WebkitTextStroke: '2.5px rgba(250,204,21,0.95)',
          textShadow: '0 0 40px rgba(250,204,21,0.8), 0 0 80px rgba(239,68,68,0.5)',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
          letterSpacing: '0.08em',
          userSelect: 'none',
        }}
      >
        ALL-OUT!
      </motion.div>
      {/* Sub-line */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: [0, 1, 0], y: [50, 80, 80] }}
        transition={{ duration: 1.2, delay: 0.45 }}
        className="absolute text-white text-sm font-bold tracking-wider"
        style={{ bottom: '28%', textShadow: '0 0 10px rgba(239,68,68,0.9)' }}
      >
        {personaName} —— 向 {shadowName} 倾泻全部力量！
      </motion.div>
      {/* Diagonal slash */}
      <motion.div
        className="absolute h-1 w-[180%]"
        initial={{ scaleX: 0, rotate: 20, opacity: 0 }}
        animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.65, delay: 0.85, ease: 'circOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent, #fbbf24, #ffffff, #fbbf24, transparent)',
          boxShadow: '0 0 24px rgba(250,204,21,0.95)',
        }}
      />
      {/* Radial flash */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.8, 0] }}
        transition={{ duration: 0.35, delay: 1.05 }}
        style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.9), transparent 70%)' }}
      />
    </motion.div>
  );
}

/**
 * WeakCutIn —— 模仿 Persona 3 的"弱点击破"全屏切片动画
 * 每场战斗仅在 首次 命中 Shadow 弱点时播放一次
 * 1.3s 左右，不干扰叙述节奏
 */
function WeakCutIn() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ background: 'rgba(0,0,0,0.35)' }}
    >
      {/* 黑色斜切带 */}
      <motion.div
        className="absolute w-[180%] h-28"
        initial={{ x: '-120%', rotate: -12, opacity: 0 }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.05, times: [0, 0.2, 0.75, 1], ease: 'circOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #0a0a0a 12%, #0a0a0a 88%, transparent 100%)',
          boxShadow: '0 0 30px rgba(251,191,36,0.55), inset 0 0 40px rgba(0,0,0,0.9)',
        }}
      />
      {/* 上下描边 */}
      <motion.div
        className="absolute w-[180%] h-1"
        initial={{ x: '-120%', rotate: -12, opacity: 0, top: 'calc(50% - 3.5rem)' }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.05, times: [0, 0.2, 0.75, 1], ease: 'circOut' }}
        style={{ background: 'linear-gradient(90deg, transparent, #fbbf24, #fbbf24, transparent)', boxShadow: '0 0 12px rgba(251,191,36,0.9)' }}
      />
      <motion.div
        className="absolute w-[180%] h-1"
        initial={{ x: '120%', rotate: -12, opacity: 0, top: 'calc(50% + 3.5rem)' }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.05, times: [0, 0.2, 0.75, 1], ease: 'circOut' }}
        style={{ background: 'linear-gradient(90deg, transparent, #fbbf24, #fbbf24, transparent)', boxShadow: '0 0 12px rgba(251,191,36,0.9)' }}
      />
      {/* 大 WEAK 文字 */}
      <motion.div
        initial={{ scale: 0.2, opacity: 0, rotate: -8, letterSpacing: '0.8em' }}
        animate={{ scale: [0.2, 1.25, 1.05], opacity: [0, 1, 1], rotate: [-8, -6, -6], letterSpacing: ['0.8em', '0.12em', '0.12em'] }}
        transition={{ duration: 0.7, delay: 0.18, times: [0, 0.55, 1], ease: 'backOut' }}
        style={{
          fontSize: 'clamp(3.8rem, 19vw, 7rem)',
          fontWeight: 900,
          color: '#fbbf24',
          WebkitTextStroke: '3px #000',
          textShadow: '0 0 30px rgba(251,191,36,0.9), 0 0 60px rgba(239,68,68,0.5), 6px 6px 0 #7f1d1d',
          fontFamily: '"Impact", "Arial Black", "Noto Sans SC", sans-serif',
          fontStyle: 'italic',
          userSelect: 'none',
          zIndex: 2,
        }}
      >
        WEAK!
      </motion.div>
      {/* 副标签 */}
      <motion.div
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: [0, 1, 0], y: [36, 60, 60] }}
        transition={{ duration: 0.95, delay: 0.38 }}
        className="absolute text-white text-[11px] font-bold tracking-[0.45em] uppercase"
        style={{ bottom: '32%', textShadow: '0 0 10px rgba(239,68,68,0.9)' }}
      >
        effective · weakness struck
      </motion.div>
      {/* 闪刀 */}
      <motion.div
        className="absolute h-1 w-[160%]"
        initial={{ scaleX: 0, rotate: 18, opacity: 0 }}
        animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.5, delay: 0.72, ease: 'circOut' }}
        style={{ background: 'linear-gradient(90deg, transparent, #fef3c7, #ffffff, #fef3c7, transparent)', boxShadow: '0 0 22px rgba(254,243,199,0.95)' }}
      />
      {/* 放射闪光 */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0] }}
        transition={{ duration: 0.28, delay: 0.18 }}
        style={{ background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.7), transparent 60%)' }}
      />
    </motion.div>
  );
}

export function BattleModal({ isOpen, onClose, onVictory }: Props) {
  const {
    user,
    persona,
    shadow,
    battleState,
    attributes,
    settings,
    startBattleSession,
    endBattleSession,
    performBattleAction,
    saveBattleState,
  } = useAppStore();

  // ── Narration state ───────────────────────────────────
  const [phase, setPhase] = useState<'battle_start' | 'intro' | 'waiting' | 'animating' | 'defeat'>('intro');
  const [showRetreatConfirm, setShowRetreatConfirm] = useState(false);
  const [narLines, setNarLines] = useState<string[]>([]);
  const [narIndex, setNarIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [phase2Animation, setPhase2Animation] = useState(false);
  const [selectedSkillAttrIdx, setSelectedSkillAttrIdx] = useState(0);
  const [pendingVictory, setPendingVictory] = useState(false);

  // ── Battle visual effects state ───────────────────────
  const [offBalance, setOffBalance] = useState(false);
  const offBalanceCdRef = useRef(0); // 失衡触发后 4 回合 CD
  const shadowGuardRemainingRef = useRef(0); // Shadow 警戒剩余回合（2 = 新触发, 0 = 无/已消耗）
  const consecutiveWeaknessRef = useRef(0); // 连续弱点命中（用于 guard 决策，非弱点时清零）
  const [isHurt, setIsHurt] = useState(false);
  const [showWeak, setShowWeak] = useState(false);
  const [damageNums, setDamageNums] = useState<Array<{ id: number; value: number; isWeak: boolean }>>([]);
  const [playerDamageNums, setPlayerDamageNums] = useState<Array<{ id: number; value: number; isCrit: boolean }>>([]);
  const damageIdRef = useRef(0);
  const pendingPlayerDmgRef = useRef<{ value: number; isCrit: boolean; hpAfter: number } | null>(null);
  const [displayPlayerHp, setDisplayPlayerHp] = useState<number | null>(null); // null = follow store
  const [hpBarFlash, setHpBarFlash] = useState(false);
  const [shadowAttackAnim, setShadowAttackAnim] = useState(false);
  const [pendingDefeat, setPendingDefeat] = useState(false);

  // ── Battle intro / finish animation state ─────────────────
  const [showBattleFinishAnim, setShowBattleFinishAnim] = useState(false);
  const [showDeathExplosion, setShowDeathExplosion] = useState(false);

  // Android 返回键：严格对齐左上角"✕ 撤退"按钮的语义：
  //   - 开场 / 结算动画（battle_start / battleFinish）阶段：动画中覆盖了按钮，点击也不会生效 → back 也 no-op
  //   - showRetreatConfirm 已打开：关闭确认（等同点 "继续战斗"）
  //   - 其余：打开撤退确认（等同点 "✕ 撤退"）
  useBackHandler(isOpen, () => {
    if (phase === 'battle_start' || showBattleFinishAnim) return; // 动画阻断期：no-op
    if (showRetreatConfirm) {
      setShowRetreatConfirm(false);
    } else {
      setShowRetreatConfirm(true);
    }
  });

  // ── Mask state ─────────────────────────────────────────
  const [maskTurnCount, setMaskTurnCount] = useState(0);
  const [maskCharmUsed, setMaskCharmUsed] = useState(false);
  const [maskKindnessRevived, setMaskKindnessRevived] = useState(false);
  const [extraTurnActive, setExtraTurnActive] = useState(false);

  // ── Skill effect states ────────────────────────────────
  const [attackBuff, setAttackBuff] = useState(false);      // buff: next damage ×1.5
  const [vulnerableActive, setVulnerableActive] = useState(false); // debuff: shadow 易伤, next damage ×1.3 (兜底)
  const [chargeActive, setChargeActive] = useState(false);  // charge: next damage ×2
  const [attackBoostTurns, setAttackBoostTurns] = useState(0); // attack_boost: 剩余增伤回合
  const [comboCount, setComboCount] = useState(0);          // consecutive weakness/crit hits
  const [skillUsedCount, setSkillUsedCount] = useState(0);  // total skills used this battle

  // ── v1.9 Status effects ────────────────────────────────
  const [playerStatusEffects, setPlayerStatusEffects] = useState<StatusEffect[]>([]);
  const [shadowStatusEffects, setShadowStatusEffects] = useState<StatusEffect[]>([]);
  const [shadowBerserk, setShadowBerserk] = useState(false);       // Shadow 狂化态
  const [shadowGuardTurn, setShadowGuardTurn] = useState(false);    // 本回合 Shadow 警戒（玩家即将施展技能受此影响）
  const [defenseThisTurn, setDefenseThisTurn] = useState(false);    // 玩家本回合防御
  const [weaknessStreak, setWeaknessStreak] = useState(0);          // 连续弱点命中（用于 All-Out 解锁）
  const [allOutCutIn, setAllOutCutIn] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [weakCutIn, setWeakCutIn] = useState(false);
  const firstWeakHitRef = useRef(false); // 每场战斗首次弱点命中触发大 WEAK 特效
  const [insightPreview, setInsightPreview] = useState<{ kind: ShadowActionKind; label: string } | null>(null);
  const [confidantSupportToast, setConfidantSupportToast] = useState<string | null>(null);

  const shadowTime = isInShadowTime(
    settings.battleShadowTimeDays ?? [5, 6, 0],
    settings.battleShadowTimeStart ?? 20,
    settings.battleShadowTimeEnd ?? 7
  );

  const selectedSkillAttr = ATTR_IDS[selectedSkillAttrIdx] ?? 'knowledge';

  // Build intro lines when battle opens
  const buildIntroLines = useCallback(() => {
    if (!persona || !shadow) return [];
    const attrNames = settings.attributeNames as Record<string, string>;
    const weakName = attrNames[shadow.weakAttribute] ?? shadow.weakAttribute;
    const userName = user?.name ?? '你';
    const isPhase2Entry = shadow.maxHp2 !== undefined && shadow.currentHp <= 0 &&
      (shadow.currentHp2 ?? shadow.maxHp2) > 0;

    const equippedMask = persona.equippedMaskAttribute;
    const displayPersonaName = equippedMask
      ? (persona.attributePersonas?.[equippedMask]?.name ?? '反抗者')
      : '反抗者';

    const lines: string[] = [
      `${userName}！是时候了！`,
      equippedMask
        ? `${userName} 召唤了 Persona ${displayPersonaName}！`
        : `${userName}怀揣着反抗之心开启了战斗！`,
      `${shadow.name} 出现了！`,
      shadow.description,
      `Shadow 的弱点——${weakName}属性！`,
    ];

    if (isPhase2Entry) {
      lines.push(`${shadow.name} 已进入第二形态……`);
      lines.push('小心，它的攻击力已经提升！');
    }

    const responseLine = shadow.responseLines[Math.floor(Math.random() * Math.min(3, shadow.responseLines.length))] ?? '……';
    lines.push(`${shadow.name}：「${responseLine}」`);
    return lines;
  }, [persona, shadow, settings, user]);

  useEffect(() => {
    if (!isOpen) {
      setPhase('intro');
      setNarLines([]);
      setNarIndex(0);
      setOffBalance(false);
      offBalanceCdRef.current = 0;
      shadowGuardRemainingRef.current = 0;
      consecutiveWeaknessRef.current = 0;
      setIsHurt(false);
      setShowWeak(false);
      setDamageNums([]);
      setPlayerDamageNums([]);
      pendingPlayerDmgRef.current = null;
      setDisplayPlayerHp(null);
      setHpBarFlash(false);
      setShadowAttackAnim(false);
      setPendingDefeat(false);
      setPendingVictory(false);
      setMaskTurnCount(0);
      setMaskCharmUsed(false);
      setMaskKindnessRevived(false);
      setExtraTurnActive(false);
      setAttackBuff(false);
      setVulnerableActive(false);
      setChargeActive(false);
      setAttackBoostTurns(0);
      setComboCount(0);
      setSkillUsedCount(0);
      setPlayerStatusEffects([]);
      setShadowStatusEffects([]);
      setShadowBerserk(false);
      setShadowGuardTurn(false);
      setDefenseThisTurn(false);
      setWeaknessStreak(0);
      setAllOutCutIn(false);
      setActionMenuOpen(false);
      setWeakCutIn(false);
      firstWeakHitRef.current = false;
      setInsightPreview(null);
      setShowBattleFinishAnim(false);
      setShowDeathExplosion(false);
      return;
    }
    if (persona && shadow && battleState && (battleState.status === 'idle' || battleState.status === 'shadow_phase2') && shadowTime) {
      startBattleSession();
    }
    const intro = buildIntroLines();
    setNarLines(intro);
    setNarIndex(0);
    setPhase('battle_start');
    playSound('/battle-start.mp3');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-transition battle_start → intro
  useEffect(() => {
    if (phase !== 'battle_start') return;
    const t = setTimeout(() => setPhase('intro'), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  // BATTLE FINISH 动画结束后自动关闭并回调胜利
  useEffect(() => {
    if (!showBattleFinishAnim) return;
    const t = setTimeout(() => {
      setShowBattleFinishAnim(false);
      setShowDeathExplosion(false);
      onVictory();
      onClose();
    }, 2600);
    return () => clearTimeout(t);
  }, [showBattleFinishAnim, onVictory, onClose]);

  // 死亡爆炸粒子独立自动清除（不再与 BATTLE FINISH 绑定）
  useEffect(() => {
    if (!showDeathExplosion) return;
    const t = setTimeout(() => setShowDeathExplosion(false), 1200);
    return () => clearTimeout(t);
  }, [showDeathExplosion]);

  const advanceNarration = useCallback(() => {
    if (narIndex < narLines.length - 1) {
      setNarIndex(i => i + 1);
    } else if (phase === 'intro') {
      setPhase('waiting');
    } else if (phase === 'animating') {
      if (pendingVictory) {
        // 胜利 narration 已全部放完 → 现在播 BATTLE FINISH 动画（其 useEffect 会收尾关闭）
        setPendingVictory(false);
        setShowBattleFinishAnim(true);
        playSound('/battle-fanfare.mp3');
        return;
      }
      if (pendingDefeat) {
        setPendingDefeat(false);
        setPhase('defeat');
        return;
      }
      setPhase('waiting');
      setIsAnimating(false);
    }
  }, [narIndex, narLines.length, phase, pendingVictory, pendingDefeat]);

  // ── Shadow counter-attack sequence: synced with narration ──
  // When narration reaches "发动了攻击/暴击" line:
  //   1. Shadow attack anim (immediately)
  //   2. After 350ms: damage number pops + HP bar drops + red flash
  useEffect(() => {
    const pending = pendingPlayerDmgRef.current;
    if (!pending) return;
    const line = narLines[narIndex] ?? '';
    if (line.includes('发动了') && line.includes('点伤害')) {
      pendingPlayerDmgRef.current = null;
      // Phase 1: Shadow attack visual
      setShadowAttackAnim(true);
      playSound('/themea-nav.mp3');
      // Phase 2: Damage lands after delay
      const timer = setTimeout(() => {
        setShadowAttackAnim(false);
        // Shadow 攻击命中瞬间的掉血音效
        playSound('/shadowattack.mp3', 0.7);
        // Damage number
        const pid = ++damageIdRef.current;
        setPlayerDamageNums(prev => [...prev, { id: pid, value: pending.value, isCrit: pending.isCrit }]);
        setTimeout(() => setPlayerDamageNums(prev => prev.filter(d => d.id !== pid)), 2200);
        // HP bar drops
        setDisplayPlayerHp(pending.hpAfter);
        // HP bar red flash
        setHpBarFlash(true);
        setTimeout(() => {
          setHpBarFlash(false);
          // After flash, release display HP back to store
          setDisplayPlayerHp(null);
        }, 600);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [narIndex, narLines]);

  if (!isOpen || !persona || !shadow || !battleState) return null;

  const attrLevels = Object.fromEntries(attributes.map(a => [a.id, a.level])) as Record<AttributeId, number>;
  const attrNamesMap = settings.attributeNames as Record<AttributeId, string>;
  const hp1Pct = (shadow.currentHp / shadow.maxHp) * 100;
  const hp2Pct = shadow.maxHp2 ? ((shadow.currentHp2 ?? shadow.maxHp2) / shadow.maxHp2) * 100 : 0;
  const isPhase2 = battleState.status === 'shadow_phase2';
  const shadowHpType: 'hp1' | 'hp2' = isPhase2 ? 'hp2' : 'hp1';

  const availableSkills: PersonaSkill[] =
    persona.skills[selectedSkillAttr]?.filter(s => s.level <= (attrLevels[selectedSkillAttr] || 1)) || [];

  const isWeakAttr = selectedSkillAttr === shadow.weakAttribute;
  const maskAttr = persona.equippedMaskAttribute;

  /**
   * Shadow AI 决策树（读取当前上下文，不修改 state）
   * 按优先级返回第一条命中的 action
   * 注：不用 useCallback，因早于此函数有条件早返回（hook 顺序问题）
   */
  const decideShadowAction = (opts: {
    chargeActive: boolean;
    weaknessStreak: number;
    playerHasDot: boolean;
  }): ShadowActionKind => {
    if (!shadow || !battleState) return 'normal';
    const shadowHp = shadowHpType === 'hp1' ? shadow.currentHp : (shadow.currentHp2 ?? shadow.maxHp2 ?? shadow.maxHp);
    const shadowMaxHp = shadowHpType === 'hp1' ? shadow.maxHp : (shadow.maxHp2 ?? shadow.maxHp);
    const shadowHpRatio = shadowHp / Math.max(1, shadowMaxHp);
    const playerHpRatio = battleState.playerHp / Math.max(1, battleState.playerMaxHp);

    if (opts.chargeActive) return 'interrupt';
    if (opts.weaknessStreak >= 2) return 'guard';
    if (shadowHpRatio < 0.3 && !shadowBerserk) return 'enterBerserk';
    if (playerHpRatio < 0.25) return 'execute';
    if (opts.playerHasDot) return 'mock';
    return 'normal';
  };

  /** 计算玩家当前暴击率调整（来自 crit_buff / crit_debuff） */
  const getPlayerCritBonus = (effects: StatusEffect[]) => {
    const buff = findStatus(effects, 'crit_buff');
    return buff ? buff.value : 0;
  };

  /** 计算 Shadow 当前暴击率调整（来自 crit_debuff） */
  const getShadowCritPenalty = (effects: StatusEffect[]) => {
    const debuff = findStatus(effects, 'crit_debuff');
    return debuff ? debuff.value : 0;
  };

  // ── 战术按钮：防御 ────────────────────────────────────────
  const handleDefend = async () => {
    if (isAnimating || phase !== 'waiting') return;
    setIsAnimating(true);
    triggerLightHaptic();
    playSound('/ui-menu.mp3', 0.6);

    setDefenseThisTurn(true);
    consecutiveWeaknessRef.current = 0; // 防御是非弱点动作，清空连续弱点计数（不影响累计 weaknessStreak）
    const lines: string[] = ['你稳固了身形，进入防御姿态。'];
    lines.push('本回合所受伤害将减半，回合结束恢复 3 SP。');

    // Shadow counter (allowed, but we'll halve the damage)
    const playerHasDot = playerStatusEffects.some(e => e.kind === 'poison');
    const decision = decideShadowAction({ chargeActive, weaknessStreak: consecutiveWeaknessRef.current, playerHasDot });
    await runShadowCounter({ lines, decision, halveDamage: true });
    finalizeTurn(lines);
    // Restore SP
    const latest = useAppStore.getState().battleState;
    if (latest) {
      await saveBattleState({ ...latest, sp: Math.min(999, latest.sp + 3) });
    }
  };

  // ── 战术按钮：普通攻击（"平A"） ─────────────────────────
  // 0 SP，伤害 = 当前总等级（五维 level 之和），不带属性 → 永不触发弱点 ×1.5。
  // 设计意图：在 SP 见底 / 没有合适技能时给玩家一个保底输出按钮，
  // 但故意不掺合"连续弱点"和 All-Out 解锁，避免成为代替策略的廉价捷径。
  const handleNormalAttack = async () => {
    if (isAnimating || phase !== 'waiting') return;
    setIsAnimating(true);
    triggerLightHaptic();
    // 出招音：复用菜单导航音（短促 / 与现有按钮一致）
    playSound('/themea-nav.mp3', 0.5);

    const userLv = attributes.reduce((s, a) => s + (a.unlocked === false ? 0 : (a.level ?? 1)), 0);
    const damage = Math.max(1, userLv);

    const action: BattleAction = {
      skillName: '普通攻击',
      skillAttribute: undefined, // 无属性：performBattleAction 内不会判定弱点
      type: 'damage',
      value: damage,
      spCost: 0,
      isCrit: false,
    };

    // 关闭 store 内置 shadow 反击，由本组件统一走 runShadowCounter
    const result = await performBattleAction(action, shadowHpType, false);

    const lines: string[] = [];
    lines.push(`你向 ${shadow.name} 发起了普通攻击！`);
    lines.push(`造成了 ${result.actualDamage} 点伤害。`);

    if (result.actualDamage > 0) {
      setIsHurt(true);
      // 命中音：复用技能命中音
      playSound('/pi.mp3', 0.6);
      setTimeout(() => setIsHurt(false), 400);
      const id = ++damageIdRef.current;
      setDamageNums(prev => [...prev, { id, value: result.actualDamage, isWeak: false }]);
      setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1500);
    }

    // 普通攻击算"非弱点"动作：清空连续弱点（与 防御/洞察 的语义一致）
    consecutiveWeaknessRef.current = 0;

    if (result.phase2Triggered) {
      lines.push(`${shadow.name} 的形态……发生了变化！`);
      lines.push(`${shadow.name}：${pickShadowLine('phase2Open', shadow.name) || pickByLevel(PHASE2_DIALOGUE, shadow.level)}`);
      lines.push('攻击力提升……小心！');
      setPhase2Animation(true);
      playSound('/battle-impact.mp3');
      setTimeout(() => setPhase2Animation(false), 1500);
    }

    if (result.shadowDefeated) {
      lines.push(`${shadow.name} 倒下了！`);
      lines.push(`${shadow.name}：${pickByLevel(DEFEAT_DIALOGUE, shadow.level)}`);
      setShowDeathExplosion(true);
      setPendingVictory(true);
      finalizeTurn(lines);
      return;
    }

    // Shadow 反击（普通攻击不享受失衡跳过 / 强化回合等特权）
    const playerHasDot = playerStatusEffects.some(e => e.kind === 'poison');
    const decision = decideShadowAction({ chargeActive, weaknessStreak: consecutiveWeaknessRef.current, playerHasDot });
    await runShadowCounter({ lines, decision, halveDamage: false });
    finalizeTurn(lines);
  };

  // ── 战术按钮：洞察 ────────────────────────────────────────
  const handleInsight = async () => {
    if (isAnimating || phase !== 'waiting') return;
    if (battleState.sp < 2) return;
    setIsAnimating(true);
    triggerLightHaptic();
    playSound('/themea-nav.mp3', 0.5);

    // Consume SP
    await saveBattleState({ ...battleState, sp: battleState.sp - 2 });
    consecutiveWeaknessRef.current = 0; // 洞察是非弱点动作，清空连续弱点计数

    // Predict Shadow's next action
    const playerHasDot = playerStatusEffects.some(e => e.kind === 'poison');
    const decision = decideShadowAction({ chargeActive, weaknessStreak: consecutiveWeaknessRef.current, playerHasDot });
    const actionLabel: Record<ShadowActionKind, string> = {
      interrupt: '打断你的蓄力',
      guard: '进入警戒（弱点减伤）',
      enterBerserk: '狂化转变',
      execute: '必暴击追击',
      mock: '嘲讽 + 常规攻击',
      normal: '常规攻击',
    };
    setInsightPreview({ kind: decision, label: actionLabel[decision] });

    // Apply crit_debuff to Shadow (−50% for 2 turns)
    setShadowStatusEffects(prev => upsertStatus(prev, {
      kind: 'crit_debuff',
      remainingTurns: 2,
      value: 0.5,
      stacks: 1,
      sourceName: '洞察',
    }));

    const lines: string[] = [`你凝神洞察 ${shadow.name} 的气息……`];
    lines.push(`预判：它下回合将 ${actionLabel[decision]}。`);
    lines.push('施加【洞悉】，Shadow 暴击率 −50%（2回合）。');
    lines.push(`${shadow.name}：${pickShadowLine('insightUsed', shadow.name) || '哼……你也只是在看罢了。'}`);

    // Shadow still attacks (normal behavior, no special decision consumption)
    await runShadowCounter({ lines, decision: 'normal', halveDamage: false });
    finalizeTurn(lines);
  };

  // ── 战术按钮：All-Out Attack ───────────────────────────────
  // 解锁条件：本场战斗累计命中弱点 5 次。释放后 streak 归零 → 按钮重新隐藏。
  const handleAllOut = async () => {
    if (isAnimating || phase !== 'waiting') return;
    if (weaknessStreak < 5 || battleState.sp <= 0) return;
    setIsAnimating(true);
    triggerLightHaptic();
    playSound('/battle-fanfare.mp3', 0.8);

    // Compute damage: sum of Lv5 skill powers × 0.6
    const allLv5Powers = Object.values(persona.skills || {})
      .flat()
      .filter(s => s.level === 5)
      .reduce((sum, s) => sum + s.power, 0);
    const rawDamage = Math.round(allLv5Powers * 0.6);

    // Cut-in animation
    setAllOutCutIn(true);
    await new Promise(r => setTimeout(r, 1600));
    setAllOutCutIn(false);

    const lines: string[] = [`${shadow.name}：${pickShadowLine('allOutReady', shadow.name) || '那是……禁忌的力量！'}`];
    lines.push('极限贯彻！你将全部 SP 凝为一击！');

    // Apply damage directly (ignore defensive multipliers)
    const action: BattleAction = {
      skillName: 'All-Out Attack',
      skillAttribute: undefined,
      type: 'damage',
      value: rawDamage,
      spCost: battleState.sp,
      isCrit: true,
    };
    // 消耗所有 SP，造成伤害
    const result = await performBattleAction(action, shadowHpType, false);
    lines.push(`造成 ${result.actualDamage} 点巨额伤害！`);

    if (result.actualDamage > 0) {
      setIsHurt(true);
      setShowWeak(true);
      setTimeout(() => setIsHurt(false), 400);
      setTimeout(() => setShowWeak(false), 800);
      const id = ++damageIdRef.current;
      setDamageNums(prev => [...prev, { id, value: result.actualDamage, isWeak: true }]);
      setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1800);
    }

    // Reset weakness streak → 重新进入未解锁状态；combo 累计不清（仅战斗结束清零）
    setWeaknessStreak(0);
    consecutiveWeaknessRef.current = 0;

    if (result.phase2Triggered) {
      lines.push(`${shadow.name} 的形态……发生了变化！`);
      lines.push(`${shadow.name}：${pickByLevel(PHASE2_DIALOGUE, shadow.level)}`);
      setPhase2Animation(true);
      playSound('/battle-impact.mp3');
      setTimeout(() => setPhase2Animation(false), 1500);
    }
    if (result.shadowDefeated) {
      lines.push(`${shadow.name} 倒下了！`);
      lines.push(`${shadow.name}：${pickByLevel(DEFEAT_DIALOGUE, shadow.level)}`);
      setShowDeathExplosion(true);
      setPendingVictory(true);
      finalizeTurn(lines); // narration 全部放完后，advanceNarration 会触发 BATTLE FINISH
      return;
    }
    // Shadow gets to counter
    const playerHasDot = playerStatusEffects.some(e => e.kind === 'poison');
    const decision = decideShadowAction({ chargeActive: false, weaknessStreak: 0, playerHasDot });
    await runShadowCounter({ lines, decision, halveDamage: false });
    finalizeTurn(lines);
  };

  // ── Shadow 反击流程（抽取为统一函数） ─────────────────────
  // 读取优先级：args.playerSnap/shadowSnap > 闭包快照（调用方可传入"本回合已应用"的本地数组）
  // 所有状态写入用函数式 setState，避免覆盖 useSkill 刚 upsert 的新状态
  const runShadowCounter = async (args: {
    lines: string[];
    decision: ShadowActionKind;
    halveDamage: boolean;
    playerSnap?: StatusEffect[];
    shadowSnap?: StatusEffect[];
  }) => {
    const { lines, decision, halveDamage } = args;
    if (!shadow || !battleState) return;

    const shadowSnap = args.shadowSnap ?? shadowStatusEffects;
    const playerSnap = args.playerSnap ?? playerStatusEffects;

    // ── Guard 决策：Shadow 提高警戒（下次玩家弱点攻击伤害 ×0.5），本回合仍继续反击
    if (decision === 'guard') {
      setShadowGuardTurn(true);
      shadowGuardRemainingRef.current = 2; // 2 回合内未被消耗则自动到期
      consecutiveWeaknessRef.current = 0; // 打破"连续弱点"，累计 weaknessStreak 不受影响
      lines.push(`${shadow.name} 警戒起来 —— 下次弱点伤害将减半。`);
      lines.push(`${shadow.name}：${pickShadowLine('guarding', shadow.name)}`);
      // 不 return，继续走下方的 fear / beguile / 正常攻击流程
    }

    // ── Berserk 转变（当回合继续走 normal 攻击，附带 ×1.5）
    if (decision === 'enterBerserk') {
      setShadowBerserk(true);
      lines.push(`${shadow.name} 的能量开始失控……`);
      lines.push(`${shadow.name}：${pickShadowLine('berserk', shadow.name)}`);
      lines.push('Shadow 进入【狂化】！攻击 ×1.5，每回合自损1点。');
    }

    // ── fear 检查
    const fear = findStatus(shadowSnap, 'fear');
    if (fear && Math.random() < fear.value) {
      lines.push(`${shadow.name} 被恐惧所缚……${pickShadowLine('feared', shadow.name)}`);
      lines.push(`${shadow.name} 动弹不得，跳过这一回合！`);
      setShadowStatusEffects(prev => removeStatus(prev, 'fear'));
      await tickEndOfTurn({ lines });
      return;
    }

    // ── beguile 检查
    const beguile = findStatus(shadowSnap, 'beguile');
    if (beguile && Math.random() < beguile.value) {
      lines.push(`${shadow.name}：${pickShadowLine('beguiled', shadow.name)}`);
      const selfDamage = Math.max(1, Math.round((shadow.attackPower ?? 2) * 1.2));
      lines.push(`${shadow.name} 在魅惑中自伤 ${selfDamage} 点！`);
      const sh = useAppStore.getState().shadow;
      if (sh) {
        if (shadowHpType === 'hp1') {
          await useAppStore.getState().saveShadow({ ...sh, currentHp: Math.max(0, sh.currentHp - selfDamage) });
        } else if (shadowHpType === 'hp2' && sh.currentHp2 !== undefined) {
          await useAppStore.getState().saveShadow({ ...sh, currentHp2: Math.max(0, (sh.currentHp2 ?? 0) - selfDamage) });
        }
        setIsHurt(true);
        setTimeout(() => setIsHurt(false), 400);
        const id = ++damageIdRef.current;
        setDamageNums(prev => [...prev, { id, value: selfDamage, isWeak: false }]);
        setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1500);
      }
      setShadowStatusEffects(prev => removeStatus(prev, 'beguile'));
      await tickEndOfTurn({ lines });
      return;
    }

    // ── 正常攻击路径：计算最终伤害
    const isPhase2Local = battleState.status === 'shadow_phase2';
    let baseAtk = (shadow.attackPower ?? 2) + (isPhase2Local ? 1 : 0);
    if (shadowBerserk || decision === 'enterBerserk') baseAtk = Math.round(baseAtk * 1.5);

    // calm
    const calm = findStatus(shadowSnap, 'calm');
    if (calm) baseAtk = Math.max(1, Math.round(baseAtk * calm.value));

    // 暴击
    const shadowCritChances = [0, 0.1, 0.15, 0.2, 0.3];
    let shadowCritChance = shadowCritChances[Math.min((shadow.level ?? 1) - 1, 4)];
    shadowCritChance = Math.max(0, shadowCritChance - getShadowCritPenalty(shadowSnap));
    const shadowCrit = decision === 'execute' ? true : Math.random() < shadowCritChance;
    let atkValue = shadowCrit ? baseAtk * 2 : baseAtk;

    // shield 吸收
    const shield = findStatus(playerSnap, 'shield');
    let shieldedAmount = 0;
    if (shield) {
      shieldedAmount = Math.round(atkValue * shield.value);
      atkValue = Math.max(0, atkValue - shieldedAmount);
      setPlayerStatusEffects(prev => removeStatus(prev, 'shield'));
    }

    // 防御减半
    if (halveDamage) atkValue = Math.round(atkValue * 0.5);

    const hpBeforeShadow = useAppStore.getState().battleState?.playerHp ?? battleState.playerHp;
    const newPlayerHp = Math.max(0, hpBeforeShadow - atkValue);
    // 冻结玩家 HP 显示至触发回合前的值：narration 读到"XX发动了攻击"时再通过
    // narration-sync useEffect 同步滑到 newPlayerHp，避免"HP 先掉后叙述"的非回合制观感
    if (atkValue > 0) setDisplayPlayerHp(hpBeforeShadow);
    const curState = useAppStore.getState().battleState;
    if (curState) await saveBattleState({ ...curState, playerHp: newPlayerHp });

    // flavor
    const flavor: Record<ShadowActionKind, string> = {
      interrupt: pickShadowLine('interrupt', shadow.name) || '打断你的节奏！',
      guard: '',
      enterBerserk: '',
      execute: pickShadowLine('playerLowHp', shadow.name) || '结束了。',
      mock: pickShadowLine('dotTick', shadow.name) || '毒性正在加剧……',
      normal: '',
    };
    if (flavor[decision]) lines.push(`${shadow.name}：${flavor[decision]}`);

    if (shieldedAmount > 0) lines.push(`护盾吸收了 ${shieldedAmount} 点伤害！`);
    if (halveDamage && atkValue > 0) lines.push('防御生效：伤害减半！');

    if (shadowCrit) {
      lines.push(`${shadow.name} 发动了暴击！造成 ${atkValue} 点伤害！`);
      lines.push(`${shadow.name}：${pickByLevel(SHADOW_CRIT_DIALOGUE, shadow.level)}`);
    } else {
      lines.push(`${shadow.name} 发动了攻击！造成 ${atkValue} 点伤害。`);
      lines.push(`${shadow.name}：${pickByLevel(SHADOW_ATTACK_DIALOGUE, shadow.level)}`);
    }

    if (atkValue > 0) {
      pendingPlayerDmgRef.current = { value: atkValue, isCrit: shadowCrit, hpAfter: newPlayerHp };
    }

    // Defeat 处理
    if (newPlayerHp <= 0) {
      if (maskAttr === 'kindness' && !maskKindnessRevived) {
        setMaskKindnessRevived(true);
        if (pendingPlayerDmgRef.current) pendingPlayerDmgRef.current.hpAfter = 1;
        const latest = useAppStore.getState().battleState;
        if (latest) await saveBattleState({ ...latest, playerHp: 1, status: 'in_battle' });
        lines.push('面具之力：绝境中回复了1点体力！');
        lines.push('战斗还未结束……！');
      } else {
        const latest = useAppStore.getState().battleState;
        if (latest) await saveBattleState({ ...latest, status: 'session_end' });
        lines.push('体力耗尽……');
        setPendingDefeat(true);
        playSound('/themea-nav.mp3');
      }
    }

    await tickEndOfTurn({ lines });
  };

  /** 回合末 tick：Shadow DoT、狂化自损、衰减所有状态（使用函数式 setState 避免覆盖） */
  const tickEndOfTurn = async (args: { lines: string[] }) => {
    const { lines } = args;

    // ── 狂化自损
    if (shadowBerserk && shadow) {
      const sh = useAppStore.getState().shadow;
      if (sh) {
        if (shadowHpType === 'hp1') {
          await useAppStore.getState().saveShadow({ ...sh, currentHp: Math.max(0, sh.currentHp - 1) });
        } else if (shadowHpType === 'hp2' && sh.currentHp2 !== undefined) {
          await useAppStore.getState().saveShadow({ ...sh, currentHp2: Math.max(0, (sh.currentHp2 ?? 0) - 1) });
        }
      }
      lines.push(`狂化反噬：${shadow.name} 自损 1 点。`);
    }

    // ── Shadow DoT（poison）—— 读取当前（未衰减）的 shadowStatusEffects 快照
    const poison = findStatus(shadowStatusEffects, 'poison');
    if (poison && shadow) {
      const dotDamage = poison.value * poison.stacks;
      const sh = useAppStore.getState().shadow;
      if (sh) {
        if (shadowHpType === 'hp1') {
          await useAppStore.getState().saveShadow({ ...sh, currentHp: Math.max(0, sh.currentHp - dotDamage) });
        } else if (shadowHpType === 'hp2' && sh.currentHp2 !== undefined) {
          await useAppStore.getState().saveShadow({ ...sh, currentHp2: Math.max(0, (sh.currentHp2 ?? 0) - dotDamage) });
        }
        setIsHurt(true);
        setTimeout(() => setIsHurt(false), 400);
        const id = ++damageIdRef.current;
        setDamageNums(prev => [...prev, { id, value: dotDamage, isWeak: false }]);
        setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1500);
      }
      lines.push(`中毒持续侵蚀：${shadow.name} 失去 ${dotDamage} 点HP。`);
    }

    // ── 状态衰减（函数式 setState：保留 useSkill 刚 upsert 的新状态）
    setShadowStatusEffects(prev => decayStatuses(prev));
    setPlayerStatusEffects(prev => decayStatuses(prev));

    // CD 衰减
    if (offBalanceCdRef.current > 0) offBalanceCdRef.current--;
    if (attackBoostTurns > 0) setAttackBoostTurns(t => t - 1);
    setDefenseThisTurn(false);
    setOffBalance(false); // 失衡状态仅存在于触发那一回合，tick 后立即消失（防止 tag 误导玩家）
    // 警戒衰减（未被消耗时最多持续 2 回合）
    if (shadowGuardRemainingRef.current > 0) {
      shadowGuardRemainingRef.current--;
      if (shadowGuardRemainingRef.current === 0) setShadowGuardTurn(false);
    }

    // 检查 Shadow 是否因 DoT/狂化自损 被击败
    const freshShadow = useAppStore.getState().shadow;
    const freshBattle = useAppStore.getState().battleState;
    if (freshShadow && freshBattle) {
      const hp1 = freshShadow.currentHp;
      const hp2 = freshShadow.currentHp2 ?? 0;
      const hasPhase2 = freshShadow.maxHp2 !== undefined;
      const ph2Triggered = shadowHpType === 'hp1' && hp1 <= 0 && hasPhase2 && freshBattle.status !== 'shadow_phase2';
      const defeated = (shadowHpType === 'hp1' && hp1 <= 0 && !hasPhase2) || (shadowHpType === 'hp2' && hp2 <= 0);
      if (ph2Triggered) {
        lines.push(`${shadow?.name} 的形态……发生了变化！`);
        lines.push(`${shadow?.name}：${pickByLevel(PHASE2_DIALOGUE, shadow?.level ?? 1)}`);
        await saveBattleState({ ...freshBattle, status: 'shadow_phase2' });
        setPhase2Animation(true);
        playSound('/battle-impact.mp3');
        setTimeout(() => setPhase2Animation(false), 1500);
      } else if (defeated) {
        lines.push(`${shadow?.name} 倒下了！`);
        lines.push(`${shadow?.name}：${pickByLevel(DEFEAT_DIALOGUE, shadow?.level ?? 1)}`);
        await saveBattleState({ ...freshBattle, status: 'victory' });
        setShowDeathExplosion(true);
        setPendingVictory(true);
        // 注意：tickEndOfTurn 由 runShadowCounter 调用，上层会紧接着 finalizeTurn(lines)，narration 全部出完后 advanceNarration 触发 FINISH
      }
    }
  };

  /** 把台词写入 narration 并切到 animating phase */
  const finalizeTurn = (lines: string[]) => {
    // 若已触发 victory 动画，不覆盖
    if (showBattleFinishAnim) return;
    setNarLines(lines);
    setNarIndex(0);
    setPhase('animating');
  };

  const useSkill = async (skill: PersonaSkill) => {
    if (isAnimating || phase !== 'waiting') return;
    const newTurnCount = maskTurnCount + 1;
    setMaskTurnCount(newTurnCount);

    // Charm mask: once per battle, 0 SP cost
    const effectiveSpCost = (maskAttr === 'charm' && !maskCharmUsed) ? 0 : skill.spCost;
    if (battleState.sp < effectiveSpCost) return;
    if (maskAttr === 'charm' && !maskCharmUsed && effectiveSpCost === 0) {
      setMaskCharmUsed(true);
    }

    setIsAnimating(true);
    triggerLightHaptic();
    playSound('/themea-nav.mp3');

    const lines: string[] = [];
    // ── 本回合状态本地累积（保证本回合新施加的状态能被 runShadowCounter 看到）
    let localPlayerEffects = playerStatusEffects;
    let localShadowEffects = shadowStatusEffects;

    // Charm mask announcement
    if (maskAttr === 'charm' && effectiveSpCost === 0 && skill.spCost > 0) {
      lines.push('面具之力：本次技能不消耗SP！');
    }

    // Dexterity mask: extra turn every 5th
    const isDextraTurn = maskAttr === 'dexterity' && newTurnCount > 0 && newTurnCount % 5 === 0;
    if (isDextraTurn && !extraTurnActive) {
      setExtraTurnActive(true);
      lines.push('面具之力：获得强化回合！可以再行动一次！');
    }

    const isDamageSkill = skill.type === 'damage' || skill.type === 'crit' || skill.type === 'attack_boost';
    const willBeWeakness = isDamageSkill && selectedSkillAttr === shadow.weakAttribute;

    // ── Compute skill value with active modifiers ──────────
    let skillValue = skill.power;

    if (isDamageSkill) {
      // attack_boost 持续增伤效果（+15）
      if (attackBoostTurns > 0 && skill.type !== 'attack_boost') {
        skillValue += 15;
        lines.push(`攻击增益效果：伤害+15！（剩余${attackBoostTurns}回合）`);
      }
      // Charge: next damage ×2
      if (chargeActive) {
        skillValue = Math.round(skillValue * 2);
        setChargeActive(false);
        lines.push('蓄力爆发！伤害翻倍！');
      }
      // Attack buff: next damage ×1.5
      if (attackBuff) {
        skillValue = Math.round(skillValue * 1.5);
        setAttackBuff(false);
        lines.push('攻击强化效果触发！');
      }
      // Vulnerable: shadow 易伤, next damage ×1.3 (fallback if no new status)
      if (vulnerableActive) {
        skillValue = Math.round(skillValue * 1.3);
        setVulnerableActive(false);
        lines.push('易伤效果触发！');
      }
      // ── v1.9 status effects ──
      // Resonance（魅力 attack_boost 遗产）: 下次伤害 ×1.8
      const resonance = findStatus(localPlayerEffects, 'resonance');
      if (resonance) {
        skillValue = Math.round(skillValue * resonance.value);
        localPlayerEffects = removeStatus(localPlayerEffects, 'resonance');
        setPlayerStatusEffects(prev => removeStatus(prev, 'resonance'));
        lines.push(`【共鸣】触发！伤害 ×${resonance.value.toFixed(1)}！`);
      }
      // Mark（Shadow 猎手标记）: 受伤 × value
      const mark = findStatus(localShadowEffects, 'mark');
      if (mark) {
        skillValue = Math.round(skillValue * mark.value);
        lines.push(`【猎手标记】触发！Shadow 受伤 ×${mark.value.toFixed(1)}！`);
      }
      // Shadow 警戒：下次弱点伤害 ×0.5（消耗一次）
      if (shadowGuardRemainingRef.current > 0 && willBeWeakness) {
        skillValue = Math.round(skillValue * 0.5);
        shadowGuardRemainingRef.current = 0;
        setShadowGuardTurn(false);
        lines.push(`${shadow.name} 警戒发动：你的弱点伤害减半！`);
      }
      // Knowledge mask: +2 weakness damage
      if (maskAttr === 'knowledge' && selectedSkillAttr === shadow.weakAttribute) {
        skillValue += 2;
      }
    }

    // ── 暴击计算：基础 crit 类技能概率 + Guts 面具 + 灵巧 crit_buff 加成
    let isCritHit = false;
    const critBuff = getPlayerCritBonus(localPlayerEffects);
    if (isDamageSkill && maskAttr === 'guts' && Math.random() < 0.15 + critBuff) {
      isCritHit = true;
      skillValue = Math.round(skillValue * 2);
    }
    if (skill.type === 'crit' && !isCritHit) {
      const critChances = [0.1, 0.15, 0.2, 0.25, 0.3];
      const effective = critChances[Math.min(skill.level - 1, 4)] + critBuff;
      if (Math.random() < effective) {
        isCritHit = true;
        skillValue = Math.round(skillValue * 2);
      }
    }
    // 非 crit-type 也能受 crit_buff 少量加成
    if (isDamageSkill && !isCritHit && skill.type !== 'crit' && critBuff > 0) {
      if (Math.random() < critBuff * 0.5) {
        isCritHit = true;
        skillValue = Math.round(skillValue * 1.5);
      }
    }

    // ── Non-damage skill types: compute value & set state ──
    if (skill.type === 'buff') {
      setAttackBuff(true);
      skillValue = 0;
    } else if (skill.type === 'debuff') {
      const mapped = SKILL_EFFECT_MAP[selectedSkillAttr]?.debuff;
      if (mapped) {
        const eff: StatusEffect = {
          kind: mapped.kind,
          remainingTurns: mapped.turns,
          value: mapped.value,
          stacks: 1,
          sourceName: skill.name,
        };
        localShadowEffects = upsertStatus(localShadowEffects, eff, mapped.stackable);
        setShadowStatusEffects(prev => upsertStatus(prev, eff, mapped.stackable));
      } else {
        setVulnerableActive(true);
      }
      skillValue = 0;
    } else if (skill.type === 'charge') {
      setChargeActive(true);
      skillValue = 0;
    } else if (skill.type === 'heal') {
      skillValue = HEAL_VALUE_BY_ATTR[selectedSkillAttr] ?? 5;
    } else if (skill.type === 'attack_boost') {
      const mapped = SKILL_EFFECT_MAP[selectedSkillAttr]?.attack_boost;
      if (mapped) {
        const eff: StatusEffect = {
          kind: mapped.kind,
          remainingTurns: mapped.turns,
          value: mapped.value,
          stacks: 1,
          sourceName: skill.name,
        };
        if (mapped.target === 'player') {
          localPlayerEffects = upsertStatus(localPlayerEffects, eff);
          setPlayerStatusEffects(prev => upsertStatus(prev, eff));
        } else {
          localShadowEffects = upsertStatus(localShadowEffects, eff);
          setShadowStatusEffects(prev => upsertStatus(prev, eff));
        }
      } else {
        if (attackBoostTurns <= 0) setAttackBoostTurns(3);
      }
    }

    const actualAction: BattleAction = {
      skillName: skill.name,
      skillAttribute: selectedSkillAttr,
      type: skill.type,
      value: skillValue,
      spCost: effectiveSpCost,
      isCrit: isCritHit,
    };

    // store 的 performBattleAction 会计算弱点 1.5 倍并扣血。关闭 shadow 反击，由本组件统一处理。
    const result = await performBattleAction(actualAction, shadowHpType, false);

    const skillPersonaName = maskAttr
      ? (persona.attributePersonas?.[selectedSkillAttr]?.name ?? '反抗者')
      : '反抗者';
    lines.push(`${skillPersonaName} 使用了 ${skill.name}！`);

    // ── Narration per skill type ────────────────────────────
    if (skill.type === 'buff') {
      lines.push('攻击力强化！下次伤害技能威力×1.5！');
    } else if (skill.type === 'debuff') {
      const mapped = SKILL_EFFECT_MAP[selectedSkillAttr]?.debuff;
      if (mapped) {
        lines.push(`对 ${shadow.name} 施加【${STATUS_LABELS[mapped.kind].label}】！${mapped.hint}`);
      } else {
        lines.push(`${shadow.name} 陷入易伤状态！下次攻击将造成额外伤害！`);
      }
    } else if (skill.type === 'charge') {
      lines.push('正在蓄力……下次技能伤害将翻倍！');
    } else if (skill.type === 'heal') {
      lines.push(`回复了 ${skillValue} 点体力！`);
    } else if (skill.type === 'attack_boost') {
      const mapped = SKILL_EFFECT_MAP[selectedSkillAttr]?.attack_boost;
      lines.push(`造成了 ${result.actualDamage} 点伤害！`);
      if (mapped) {
        lines.push(`同时触发【${STATUS_LABELS[mapped.kind].label}】：${mapped.hint}`);
      } else if (attackBoostTurns <= 0) {
        lines.push('攻击增益发动！接下来3回合伤害+15！');
      } else {
        lines.push('攻击增益已生效中，不可叠加。');
      }
    } else if (isDamageSkill) {
      if (result.isWeakness) {
        lines.push(`效果拔群！造成了 ${result.actualDamage} 点伤害！`);
        if (maskAttr === 'knowledge') lines.push('面具之力：弱点伤害+2！');
      } else if (isCritHit) {
        lines.push(`暴击！造成了 ${result.actualDamage} 点伤害！`);
      } else {
        lines.push(`造成了 ${result.actualDamage} 点伤害。`);
      }
    }

    // ── Off-balance: 弱点/暴击命中立即触发失衡，本回合 Shadow 跳过反击
    // CD 在触发瞬间启动（4 回合内不可再次进入该状态）
    // 注：不保留"趁此机会再来一次"的跨回合 bonus，避免与 guard 叠加导致 Shadow 长期无法行动
    let justTriggeredOffBalance = false;
    if ((result.isWeakness || isCritHit) && offBalanceCdRef.current === 0 && !offBalance && isDamageSkill) {
      justTriggeredOffBalance = true;
      setOffBalance(true);
      offBalanceCdRef.current = 4; // 4 回合 CD 立即启动
      lines.push(`${shadow.name} 失去了平衡！`);
      lines.push('本回合无法反击！');
    }

    // Combo counter: 累计（本场战斗内只增不减，直到战斗结束清零）
    if (isDamageSkill && (result.isWeakness || isCritHit)) {
      setComboCount(c => c + 1);
    }

    // ── Weakness hit total for All-Out unlock ──
    // 累计语义："本场战斗命中弱点 5 次"解锁 All-Out。
    // 不再在非弱点命中时清零（只在 All-Out 释放或战斗结束时才归零）
    if (isDamageSkill && result.isWeakness) {
      setWeaknessStreak(s => {
        const next = s + 1;
        if (next === 5) {
          lines.push('⚡ 弱点累计击破 5 次！【All-Out Attack】已解锁！');
        }
        return next;
      });
    }

    // ── 连续弱点 ref（独立于 streak，用于 guard 决策） ──
    if (isDamageSkill && result.isWeakness) {
      consecutiveWeaknessRef.current += 1;
    } else {
      consecutiveWeaknessRef.current = 0;
    }

    setSkillUsedCount(c => c + 1);

    if (result.isWeakness) {
      setShowWeak(true);
      setTimeout(() => setShowWeak(false), 800);
      // 每场战斗首次命中弱点 → 播放 P3 风格的大 WEAK cut-in（约 1.3s）
      if (!firstWeakHitRef.current) {
        firstWeakHitRef.current = true;
        setWeakCutIn(true);
        playSound('/battle-mask-swap.mp3', 0.7);
        setTimeout(() => setWeakCutIn(false), 1300);
      }
    }

    if (result.actualDamage > 0) {
      setIsHurt(true);
      playSound('/pi.mp3', 0.6);
      setTimeout(() => setIsHurt(false), 400);
      const id = ++damageIdRef.current;
      setDamageNums(prev => [...prev, { id, value: result.actualDamage, isWeak: result.isWeakness || isCritHit }]);
      setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1500);
    }

    if (result.phase2Triggered) {
      lines.push(`${shadow.name} 的形态……发生了变化！`);
      lines.push(`${shadow.name}：${pickShadowLine('phase2Open', shadow.name) || pickByLevel(PHASE2_DIALOGUE, shadow.level)}`);
      lines.push('攻击力提升……小心！');
      setPhase2Animation(true);
      playSound('/battle-impact.mp3');
      setTimeout(() => setPhase2Animation(false), 1500);
    }

    if (result.shadowDefeated) {
      lines.push(`${shadow.name} 倒下了！`);
      lines.push(`${shadow.name}：${pickByLevel(DEFEAT_DIALOGUE, shadow.level)}`);
      setShowDeathExplosion(true);
      setPendingVictory(true);
      finalizeTurn(lines); // narration 全部放完后 advanceNarration 触发 BATTLE FINISH
      return;
    }

    // ── Shadow counter-attack turn ───────────────────────────
    // Dexterity extra turn — shadow skips
    if (extraTurnActive) {
      setExtraTurnActive(false);
      lines.push('强化回合结束。');
      await tickEndOfTurn({ lines });
      finalizeTurn(lines);
      return;
    }

    // 仅在触发的那一回合跳过 Shadow 反击（不再有跨回合 bonus）
    if (justTriggeredOffBalance) {
      lines.push(`${shadow.name}：${pickByLevel(OFF_BALANCE_RECOVERY_DIALOGUE, shadow.level)}`);
      await tickEndOfTurn({ lines });
      finalizeTurn(lines);
      return;
    }

    // ── Shadow 决策 + 反击 ──
    const playerHasDot = localPlayerEffects.some(e => e.kind === 'poison');
    // guard 判断用"连续弱点"（ref，已在上面更新），而非累计 weaknessStreak
    const decision = decideShadowAction({
      chargeActive: skill.type === 'charge' || chargeActive,
      weaknessStreak: consecutiveWeaknessRef.current,
      playerHasDot,
    });
    await runShadowCounter({ lines, decision, halveDamage: false, playerSnap: localPlayerEffects, shadowSnap: localShadowEffects });
    finalizeTurn(lines);
  };

  const visibleHp = displayPlayerHp ?? battleState.playerHp;
  const playerMaxHp = battleState.playerMaxHp;

  // Card attr navigation
  const prevAttr = () => { playSound('/ui-menu.mp3', 0.5); setSelectedSkillAttrIdx(i => (i - 1 + ATTR_IDS.length) % ATTR_IDS.length); };
  const nextAttr = () => { playSound('/ui-menu.mp3', 0.5); setSelectedSkillAttrIdx(i => (i + 1) % ATTR_IDS.length); };
  const attrPersonaName = maskAttr ? persona.attributePersonas?.[selectedSkillAttr]?.name : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'linear-gradient(180deg, #0a0014 0%, #1a0030 50%, #0a0014 100%)' }}
    >
      {/* 同伴援助 Toast */}
      <AnimatePresence>
        {confidantSupportToast && (
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-5 py-2 rounded-full backdrop-blur-md shadow-xl"
            style={{ background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.5)' }}
          >
            <span className="text-white font-bold text-sm">
              {confidantSupportToast}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Retreat confirmation */}
      <AnimatePresence>
        {showRetreatConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.85)' }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="w-full max-w-xs rounded-2xl p-6 text-center space-y-4"
              style={{ background: 'rgba(10,0,30,0.95)', border: '1px solid rgba(139,92,246,0.4)' }}
            >
              {skillUsedCount === 0 ? (
                <>
                  <p className="text-2xl">🔄</p>
                  <p className="text-white font-bold text-base">重整旗鼓？</p>
                  <p className="text-gray-400 text-sm leading-relaxed">你还未出手，可以先撤退准备一下。<br />本次挑战机会将保留。</p>
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setShowRetreatConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-300"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      继续战斗
                    </button>
                    <button
                      onClick={() => {
                        setShowRetreatConfirm(false);
                        // Reset lastChallengeDate so the user can re-enter today
                        if (battleState) {
                          const restored = { ...battleState, status: 'idle' as const, lastChallengeDate: undefined };
                          saveBattleState(restored);
                        }
                        onClose();
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-purple-300"
                      style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)' }}
                    >
                      重整旗鼓
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-2xl">🌑</p>
                  <p className="text-white font-bold text-base">确认撤退？</p>
                  <p className="text-gray-400 text-sm leading-relaxed">今天的影时间挑战将会结束，明天才能再次进入战斗。</p>
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setShowRetreatConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-300"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      继续战斗
                    </button>
                    <button
                      onClick={() => { setShowRetreatConfirm(false); endBattleSession(); onClose(); }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-400"
                      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
                    >
                      撤退
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insight preview modal */}
      <AnimatePresence>
        {insightPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setInsightPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9 }}
              className="max-w-xs w-full rounded-2xl p-5 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(10,0,30,0.95))',
                border: '1px solid rgba(16,185,129,0.5)',
                boxShadow: '0 0 30px rgba(16,185,129,0.3)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <p className="text-emerald-300 text-xs tracking-wider font-bold mb-2">🔍 INSIGHT</p>
              <p className="text-white text-base font-semibold mb-1">{shadow.name} 的下一步——</p>
              <p className="text-emerald-200 text-sm leading-relaxed mb-4">{insightPreview.label}</p>
              <button
                onClick={() => setInsightPreview(null)}
                className="px-5 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(16,185,129,0.25)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.5)' }}
              >
                已知悉
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* All-Out Cut-in */}
      <AnimatePresence>
        {allOutCutIn && (
          <AllOutCutIn
            personaName={maskAttr ? (persona.attributePersonas?.[maskAttr]?.name ?? '反抗者') : (persona.name ?? '反抗者')}
            shadowName={shadow.name}
          />
        )}
      </AnimatePresence>

      {/* 首次弱点命中 Cut-in */}
      <AnimatePresence>
        {weakCutIn && <WeakCutIn />}
      </AnimatePresence>

      {/* Battle Start Animation */}
      <AnimatePresence>
        {phase === 'battle_start' && <BattleStartOverlay />}
      </AnimatePresence>

      {/* Battle Finish Animation */}
      <AnimatePresence>
        {showBattleFinishAnim && <BattleFinishAnim />}
      </AnimatePresence>

      {/* Phase 2 Flash */}
      <AnimatePresence>
        {phase2Animation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.8, 0] }}
            transition={{ duration: 1.5 }}
            className="absolute inset-0 z-10 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse, rgba(239,68,68,0.8) 0%, rgba(0,0,0,0.9) 70%)' }}
          >
            <div className="flex items-center justify-center h-full">
              <motion.p initial={{ scale: 0 }} animate={{ scale: [0, 1.5, 1] }} className="text-red-300 text-2xl font-black">
                ！第二形态！
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header: Shadow info */}
      <div className="p-4 pt-6 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowRetreatConfirm(true)}
            className="text-gray-400 text-sm px-2 py-1 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            ✕ 撤退
          </button>
          <div className="text-center">
            <span className="text-red-400 font-bold text-sm">👁 {shadow.name}</span>
            <span className="ml-2 text-gray-500 text-xs">Lv{shadow.level}</span>
            {isPhase2 && (
              <span className="ml-1 text-xs font-bold text-orange-400"> II</span>
            )}
          </div>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(239,68,68,0.25)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)' }}
          >
            弱 {attrNamesMap[shadow.weakAttribute]}
          </span>
        </div>

        {/* HP Bar 1 */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>HP</span><span>{shadow.currentHp}/{shadow.maxHp}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${hp1Pct}%` }}
              transition={{ duration: 0.4 }}
              style={{ background: isPhase2 ? 'rgba(107,114,128,0.5)' : 'linear-gradient(90deg, #ef4444, #dc2626)' }}
            />
          </div>
        </div>

        {/* HP Bar 2 */}
        {shadow.maxHp2 !== undefined && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>HP2{isPhase2 ? ' ▶' : ''}</span>
              <span>{shadow.currentHp2 ?? shadow.maxHp2}/{shadow.maxHp2}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${hp2Pct}%` }}
                transition={{ duration: 0.4 }}
                style={{ background: isPhase2 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'rgba(107,114,128,0.3)' }}
              />
            </div>
          </motion.div>
        )}

        {/* Shadow status bar + 狂化/警戒 标签 */}
        {(shadowStatusEffects.length > 0 || shadowBerserk || shadowGuardTurn) && (
          <div className="flex flex-wrap gap-1 items-center mt-1">
            {shadowBerserk && (
              <motion.span
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(239,68,68,0.35)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.6)', lineHeight: 1.2 }}
              >
                🔥 狂化
              </motion.span>
            )}
            {shadowGuardTurn && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(156,163,175,0.3)', color: '#e5e7eb', border: '1px solid rgba(156,163,175,0.5)', lineHeight: 1.2 }}
              >
                🛡 警戒
              </span>
            )}
            <StatusBar effects={shadowStatusEffects} side="shadow" />
          </div>
        )}
      </div>

      {/* Defeat screen */}
      {phase === 'defeat' && (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <p className="text-6xl mb-4">💀</p>
            <p className="text-white text-xl font-bold mb-2">影时间结束</p>
            <p className="text-gray-400 text-sm mb-6">
              体力不支，被迫撤退。<br />Shadow 的HP将随时间恢复。
            </p>
            <button
              onClick={() => { endBattleSession(); onClose(); }}
              className="px-6 py-3 rounded-xl text-white font-semibold"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              返回
            </button>
          </motion.div>
        </div>
      )}

      {/* Main battle content */}
      {phase !== 'defeat' && (
        <>
          {/* Shadow sprite */}
          <div className="flex-shrink-0 relative flex items-center justify-center" style={{ height: 160 }}>
            <ShadowSVG
              level={shadow.level}
              isHurt={isHurt}
              isWeak={showWeak}
              offBalance={offBalance}
              damageNumbers={damageNums}
              weakAttribute={shadow.weakAttribute}
            />
            <AnimatePresence>
              {showDeathExplosion && <DeathExplosion />}
            </AnimatePresence>
            {/* Combo counter */}
            <AnimatePresence>
              {comboCount >= 2 && (
                <motion.div
                  key={comboCount}
                  initial={{ opacity: 0, scale: 0.5, x: 10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    pointerEvents: 'none', zIndex: 10,
                  }}
                >
                  <span style={{
                    fontSize: 28, fontWeight: 900, color: '#fbbf24',
                    textShadow: '0 0 12px rgba(251,191,36,0.8), 0 0 24px rgba(251,191,36,0.4)',
                    lineHeight: 1, fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}>
                    {comboCount}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: '#fbbf24', letterSpacing: '0.1em',
                    textShadow: '0 0 8px rgba(251,191,36,0.6)',
                    marginTop: -2,
                  }}>
                    COMBO
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Shadow attack flash overlay */}
          <AnimatePresence>
            {shadowAttackAnim && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.7, 0.3, 0.6, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="absolute inset-0 z-20 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 80%, rgba(239,68,68,0.5), transparent 70%)' }}
              />
            )}
          </AnimatePresence>

          {/* Player HP */}
          <motion.div
            className="px-4 mt-1 flex-shrink-0 relative"
            animate={{
              backgroundColor: hpBarFlash ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0)',
            }}
            transition={{ duration: 0.3 }}
            style={{ borderRadius: 12, margin: '4px 0', padding: '6px 16px' }}
          >
            <div className="flex items-center gap-2 w-full">
              {/* HP 可视化：≤12 用心形 emoji（经典感）；>12 自动切换到可伸缩的像素柱条（防止撑出屏幕） */}
              {playerMaxHp <= 12 ? (
                <div className="flex items-center gap-1 flex-wrap min-w-0">
                  {Array.from({ length: playerMaxHp }, (_, i) => (
                    <motion.span
                      key={i}
                      animate={{
                        scale: i < visibleHp ? 1 : 0.7,
                        filter: hpBarFlash && i >= visibleHp ? 'brightness(2)' : 'brightness(1)',
                      }}
                      transition={{ duration: 0.3 }}
                      className="text-sm"
                    >
                      {i < visibleHp ? '❤️' : '🖤'}
                    </motion.span>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-[2px] flex-1 min-w-0">
                  {Array.from({ length: playerMaxHp }, (_, i) => (
                    <motion.div
                      key={i}
                      animate={{
                        filter: hpBarFlash && i >= visibleHp ? 'brightness(2.2)' : 'brightness(1)',
                      }}
                      transition={{ duration: 0.3 }}
                      style={{
                        flex: '1 1 0',
                        minWidth: 2,
                        maxWidth: 10,
                        height: 10,
                        borderRadius: 2,
                        background: i < visibleHp ? '#ef4444' : 'rgba(255,255,255,0.15)',
                        boxShadow: i < visibleHp ? '0 0 4px rgba(239,68,68,0.6)' : 'none',
                      }}
                    />
                  ))}
                </div>
              )}
              {/* 右侧固定标签（flex-shrink-0 保证不被挤出视口） */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-gray-400 text-xs whitespace-nowrap">HP {visibleHp}/{playerMaxHp}</span>
                {maskAttr && (
                  <span className="text-purple-400/60 text-xs whitespace-nowrap">🎭 {attrNamesMap[maskAttr]}</span>
                )}
                {defenseThisTurn && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap"
                        style={{ background: 'rgba(59,130,246,0.25)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.5)', lineHeight: 1.2 }}>
                    🛡️ 防御
                  </span>
                )}
              </div>
            </div>
            {playerStatusEffects.length > 0 && (
              <div className="mt-1">
                <StatusBar effects={playerStatusEffects} side="player" />
              </div>
            )}
            {/* Floating player damage numbers */}
            <AnimatePresence>
              {playerDamageNums.map(dn => (
                <motion.div
                  key={dn.id}
                  initial={{ opacity: 1, y: 0, scale: 0.6 }}
                  animate={{ opacity: 0, y: -60, scale: dn.isCrit ? 1.4 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    top: '-14px',
                    left: `${30 + (dn.id % 5) * 8}%`,
                    color: dn.isCrit ? '#ff1111' : '#ef4444',
                    fontWeight: 900,
                    fontSize: dn.isCrit ? 38 : 30,
                    textShadow: dn.isCrit
                      ? '0 0 20px #ff0000, 0 0 40px rgba(255,0,0,0.6), 0 2px 4px rgba(0,0,0,0.8)'
                      : '0 0 14px rgba(239,68,68,0.9), 0 2px 4px rgba(0,0,0,0.8)',
                    pointerEvents: 'none',
                    zIndex: 10,
                    letterSpacing: '-0.02em',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}
                >
                  -{dn.value}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* Narration box */}
          {(phase === 'intro' || phase === 'animating') && (
            <div className="flex-shrink-0 mt-2">
              <NarrationBox
                lines={narLines}
                index={narIndex}
                onAdvance={advanceNarration}
                canAdvance={true}
              />
            </div>
          )}

          {/* Battle controls */}
          {phase === 'waiting' && (
            <>
              <div className="px-4 mt-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-yellow-300 text-sm font-bold">SP: {battleState.sp}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {extraTurnActive && (
                      <motion.span
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(139,92,246,0.3)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.5)' }}
                      >
                        ✦ 强化回合
                      </motion.span>
                    )}
                    {attackBuff && (
                      <motion.span
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.9, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(250,204,21,0.2)', color: '#fde047', border: '1px solid rgba(250,204,21,0.4)' }}
                      >
                        ✨ 攻击×1.5
                      </motion.span>
                    )}
                    {vulnerableActive && (
                      <motion.span
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.9, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}
                      >
                        🔻 易伤×1.3
                      </motion.span>
                    )}
                    {chargeActive && (
                      <motion.span
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.7, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(167,139,250,0.25)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.5)' }}
                      >
                        🔮 蓄力×2
                      </motion.span>
                    )}
                    {attackBoostTurns > 0 && (
                      <motion.span
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(244,63,94,0.2)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.4)' }}
                      >
                        🔥 增伤+15 ({attackBoostTurns})
                      </motion.span>
                    )}
                    {isWeakAttr && (
                      <motion.span
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(239,68,68,0.3)', color: '#fca5a5' }}
                      >
                        ⚡ 弱点 ×1.5
                      </motion.span>
                    )}
                  </div>
                </div>

                {/* Card-style attribute navigation */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={prevAttr}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white transition-colors text-lg flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    ‹
                  </button>
                  <div
                    className="flex-1 px-3 py-2 rounded-xl text-center transition-all"
                    style={{
                      background: isWeakAttr ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.2)',
                      border: isWeakAttr ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(139,92,246,0.4)',
                    }}
                  >
                    <p className="text-white text-sm font-bold">
                      {attrNamesMap[selectedSkillAttr]}
                      {isWeakAttr && <span className="ml-1.5 text-red-400 text-xs">⚡弱点</span>}
                    </p>
                    {attrPersonaName && <p className="text-white/40 text-xs mt-0.5">{attrPersonaName}</p>}
                  </div>
                  <button
                    onClick={nextAttr}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white transition-colors text-lg flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    ›
                  </button>
                </div>

                {/* 行动菜单 + All-Out（解锁才显示） */}
                <div className="flex gap-2 mb-3">
                  {/* 行动按钮 —— 点击弹出子菜单：防御 / 洞察 / 同伴支援 */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setActionMenuOpen(v => !v)}
                    disabled={isAnimating}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                    style={{
                      background: actionMenuOpen ? 'rgba(167,139,250,0.3)' : 'rgba(139,92,246,0.18)',
                      border: `1px solid ${actionMenuOpen ? 'rgba(167,139,250,0.6)' : 'rgba(139,92,246,0.4)'}`,
                      color: '#c4b5fd',
                    }}
                  >
                    ⚙️ 行动 {actionMenuOpen ? '▴' : '▾'}
                    <span className="block text-[9px] opacity-60 mt-0.5">普通攻击 / 防御 / 洞察 / 同伴支援</span>
                  </motion.button>

                  {/* All-Out —— 累计弱点击破 5 次时可见 + 发光 */}
                  <AnimatePresence>
                    {weaknessStreak >= 5 && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8, width: 0 }}
                        animate={{ opacity: 1, scale: [1, 1.05, 1], width: 'auto' }}
                        exit={{ opacity: 0, scale: 0.7, width: 0 }}
                        transition={{ scale: { duration: 1, repeat: Infinity }, opacity: { duration: 0.35 } }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleAllOut}
                        disabled={isAnimating || battleState.sp <= 0}
                        className="flex-1 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-35"
                        style={{
                          background: 'linear-gradient(90deg, rgba(239,68,68,0.35), rgba(250,204,21,0.35))',
                          border: '1px solid rgba(250,204,21,0.7)',
                          color: '#fde047',
                          boxShadow: '0 0 18px rgba(250,204,21,0.45), inset 0 0 10px rgba(250,204,21,0.15)',
                        }}
                      >
                        ⚡ All-Out
                        <span className="block text-[9px] opacity-90 mt-0.5">
                          {battleState.sp} SP · 释放全力
                        </span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                {/* 行动子菜单：展开时显示 防御 / 洞察 / 同伴支援 */}
                <AnimatePresence initial={false}>
                  {actionMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="rounded-xl p-2 space-y-2"
                        style={{
                          background: 'rgba(10,0,30,0.55)',
                          border: '1px solid rgba(139,92,246,0.25)',
                        }}
                      >
                        <div className="flex gap-2">
                          {/* 普通攻击：0 SP，伤害=用户总等级。SP 见底时的保底打点。 */}
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setActionMenuOpen(false); handleNormalAttack(); }}
                            disabled={isAnimating}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{
                              background: 'rgba(244,114,182,0.16)',
                              border: '1px solid rgba(244,114,182,0.4)',
                              color: '#fbcfe8',
                            }}
                          >
                            ⚔️ 普通攻击
                            <span className="block text-[9px] opacity-60 mt-0.5">
                              0 SP · {Math.max(1, attributes.reduce((s, a) => s + (a.unlocked === false ? 0 : (a.level ?? 1)), 0))} 伤害
                            </span>
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setActionMenuOpen(false); handleDefend(); }}
                            disabled={isAnimating}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{
                              background: 'rgba(59,130,246,0.18)',
                              border: '1px solid rgba(59,130,246,0.4)',
                              color: '#93c5fd',
                            }}
                          >
                            🛡️ 防御
                            <span className="block text-[9px] opacity-60 mt-0.5">0 SP · 伤害×0.5</span>
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setActionMenuOpen(false); handleInsight(); }}
                            disabled={isAnimating || battleState.sp < 2}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                            style={{
                              background: 'rgba(16,185,129,0.16)',
                              border: '1px solid rgba(16,185,129,0.4)',
                              color: '#6ee7b7',
                            }}
                          >
                            🔍 洞察
                            <span className="block text-[9px] opacity-60 mt-0.5">2 SP · 预判</span>
                          </motion.button>
                        </div>
                        {/* 同伴援助道具（若有可用） */}
                        <ConfidantSupportRow
                          disabled={isAnimating}
                          onHealHp={(amount, name) => {
                            setActionMenuOpen(false);
                            const cur = useAppStore.getState().battleState;
                            if (!cur) return;
                            const maxHp = cur.playerMaxHp;
                            const newHp = Math.min(maxHp, cur.playerHp + amount);
                            saveBattleState({ ...cur, playerHp: newHp });
                            setConfidantSupportToast(`${name} 的慰藉 · +${newHp - cur.playerHp} HP`);
                            playSound('/themea-nav.mp3', 0.5);
                            triggerLightHaptic();
                            setTimeout(() => setConfidantSupportToast(null), 1600);
                          }}
                          onRestoreSp={(amount, name) => {
                            setActionMenuOpen(false);
                            const cur = useAppStore.getState().battleState;
                            if (!cur) return;
                            saveBattleState({ ...cur, sp: cur.sp + amount });
                            setConfidantSupportToast(`${name} 的余韵 · +${amount} SP`);
                            playSound('/themea-nav.mp3', 0.5);
                            triggerLightHaptic();
                            setTimeout(() => setConfidantSupportToast(null), 1600);
                          }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1 px-4 overflow-y-auto pb-6 space-y-2">
                {availableSkills.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    提升{attrNamesMap[selectedSkillAttr]}等级以解锁技能
                  </p>
                ) : (
                  availableSkills.map(skill => {
                    const isDmg = skill.type === 'damage' || skill.type === 'crit' || skill.type === 'attack_boost';
                    const isWeak = isDmg && selectedSkillAttr === shadow.weakAttribute;
                    const effectiveSpCost = (maskAttr === 'charm' && !maskCharmUsed) ? 0 : skill.spCost;
                    const canAfford = battleState.sp >= effectiveSpCost;

                    // Compute display power with active modifiers
                    let displayPower = skill.power;
                    if (isDmg) {
                      if (attackBoostTurns > 0 && skill.type !== 'attack_boost') displayPower += 15;
                      if (chargeActive) displayPower = Math.round(displayPower * 2);
                      if (attackBuff) displayPower = Math.round(displayPower * 1.5);
                      if (vulnerableActive) displayPower = Math.round(displayPower * 1.3);
                      if (maskAttr === 'knowledge' && isWeak) displayPower += 2;
                    }

                    const ICON: Record<string, string> = { damage: '⚔️', crit: '⚡', buff: '✨', debuff: '🔻', charge: '🔮', heal: '💚', attack_boost: '🔥' };
                    // 深色面板内的 tag 徽章色调（比 Persona 页更亮一档，确保对比度）
                    const TYPE_TAG: Record<string, { label: string; color: string; bg: string }> = {
                      damage:       { label: '伤害',     color: '#fca5a5', bg: 'rgba(239,68,68,0.2)' },
                      crit:         { label: '暴击',     color: '#fbbf24', bg: 'rgba(245,158,11,0.2)' },
                      buff:         { label: '增伤',     color: '#93c5fd', bg: 'rgba(59,130,246,0.2)' },
                      debuff:       { label: '易伤',     color: '#fdba74', bg: 'rgba(249,115,22,0.2)' },
                      charge:       { label: '蓄力',     color: '#c4b5fd', bg: 'rgba(139,92,246,0.2)' },
                      heal:         { label: '回复',     color: '#6ee7b7', bg: 'rgba(16,185,129,0.2)' },
                      attack_boost: { label: '攻击增益', color: '#fda4af', bg: 'rgba(244,63,94,0.2)' },
                    };
                    const mappedDebuff = SKILL_EFFECT_MAP[selectedSkillAttr]?.debuff;
                    const mappedBoost = SKILL_EFFECT_MAP[selectedSkillAttr]?.attack_boost;
                    const healAmount = HEAL_VALUE_BY_ATTR[selectedSkillAttr] ?? 5;
                    // 特化效果：按当前属性查 SKILL_EFFECT_MAP，优先展示风味 label / hint
                    const mappedEffect = SKILL_EFFECT_MAP[selectedSkillAttr]?.[skill.type];
                    const baseTag = TYPE_TAG[skill.type];
                    const tagLabel = mappedEffect?.label ?? baseTag?.label;
                    const tagIcon = mappedEffect?.icon;
                    const EFFECT_HINT: Record<string, string> = {
                      buff: '下次伤害×1.5',
                      debuff: mappedDebuff ? mappedDebuff.hint : '施加易伤×1.3',
                      charge: '下次伤害×2',
                      heal: `回复${healAmount}HP`,
                      attack_boost: mappedBoost ? mappedBoost.hint : '15伤害+3回合+15',
                    };
                    const isActive = (skill.type === 'buff' && attackBuff) || (skill.type === 'debuff' && vulnerableActive) || (skill.type === 'charge' && chargeActive);

                    return (
                      <motion.button
                        key={skill.name}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => useSkill(skill)}
                        disabled={!canAfford}
                        className="w-full p-3 rounded-xl text-left transition-all disabled:opacity-50"
                        style={{
                          background: isWeak ? 'rgba(239,68,68,0.15)' : isActive ? 'rgba(250,204,21,0.1)' : 'rgba(139,92,246,0.15)',
                          border: isWeak ? '1px solid rgba(239,68,68,0.4)' : isActive ? '1px solid rgba(250,204,21,0.35)' : '1px solid rgba(139,92,246,0.3)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <span className="text-white text-sm font-semibold inline-flex items-center flex-wrap gap-x-1.5 gap-y-0.5">
                              <span>{ICON[skill.type] ?? '⚔️'} {skill.name}</span>
                              {isWeak && <span className="text-xs text-red-400 font-bold">⚡弱点</span>}
                              {/* 非 damage 挂副效果徽章 —— 特化 label 优先（灵巧 attack_boost 显示"⚡ 连击"而非统一的"攻击增益"） */}
                              {skill.type !== 'damage' && baseTag && tagLabel && (
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ color: baseTag.color, background: baseTag.bg }}
                                >
                                  {tagIcon ? `${tagIcon} ${tagLabel}` : tagLabel}
                                </span>
                              )}
                            </span>
                            <p className="text-gray-400 text-xs mt-0.5">{skill.description}</p>
                          </div>
                          <div className="text-right ml-2 flex-shrink-0">
                            {isDmg ? (
                              <div className={`text-xs font-bold ${isWeak ? 'text-red-400' : (chargeActive || attackBuff || vulnerableActive) ? 'text-yellow-400' : 'text-purple-300'}`}>
                                威力 {isWeak ? `${displayPower}×1.5` : displayPower}
                              </div>
                            ) : (
                              <div className="text-xs font-bold text-emerald-400">
                                {EFFECT_HINT[skill.type] ?? baseTag?.label}
                              </div>
                            )}
                            <div className="text-yellow-300 text-xs">
                              SP -{effectiveSpCost}
                              {effectiveSpCost === 0 && skill.spCost > 0 && <span className="text-purple-300 ml-1">🎭</span>}
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
