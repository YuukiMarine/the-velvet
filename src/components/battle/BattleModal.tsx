import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { BattleAction, AttributeId, PersonaSkill } from '@/types';
import { triggerLightHaptic, playSound } from '@/utils/feedback';
import { isInShadowTime } from '@/constants';
import { ShadowSVG } from '@/components/battle/ShadowSVG';

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
const BATTLE_START_PARTICLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  angle: (i / 20) * 360,
  distance: 50 + (i % 4) * 22,
  size: 2 + (i % 3) * 1.5,
  color: (['#8b5cf6', '#c4b5fd', '#e9d5ff'] as const)[i % 3],
  delay: 0.42 + (i % 6) * 0.04,
}));

const DEATH_EXPLOSION_PARTICLES = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  angle: (i / 26) * 360,
  distance: 35 + (i % 5) * 18,
  size: 2 + (i % 3) * 1.5,
  color: (['#ef4444', '#f97316', '#fbbf24', '#ffffff'] as const)[i % 4],
  delay: (i % 7) * 0.03,
}));

function BattleStartAnim() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'rgba(3,0,12,0.97)' }}
    >
      {/* Initial flash */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.22, delay: 0.08 }}
        style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(88,28,135,0.4))' }}
      />
      {/* Ripple rings */}
      {([0, 0.15, 0.32] as const).map((delay, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{ border: `${1.5 - i * 0.3}px solid rgba(139,92,246,${0.75 - i * 0.18})` }}
          initial={{ width: 0, height: 0, opacity: 1 }}
          animate={{ width: 260 + i * 70, height: 260 + i * 70, opacity: 0 }}
          transition={{ duration: 0.75, delay: 0.48 + delay, ease: 'easeOut' }}
        />
      ))}
      {/* Particle burst */}
      {BATTLE_START_PARTICLES.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{ width: p.size, height: p.size, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
            y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
            opacity: [0, 1, 0.7, 0],
            scale: [0, 1.8, 1.2, 0],
          }}
          transition={{ duration: 0.9, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      {/* Scanlines */}
      {[0, 1].map(i => (
        <motion.div
          key={i}
          className="absolute w-full pointer-events-none"
          style={{
            height: 1.5,
            background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.9), transparent)',
            top: `${43 + i * 14}%`,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 0.35, delay: 0.38 + i * 0.08 }}
        />
      ))}
      {/* BATTLE — slides in from left with overshoot */}
      <motion.div
        initial={{ x: -400 }}
        animate={{ x: [-400, 14, 0] }}
        transition={{ duration: 0.55, delay: 0.12, times: [0, 0.82, 1], ease: 'circOut' }}
        style={{
          fontSize: 'clamp(2.8rem,14vw,4.6rem)',
          fontWeight: 900,
          letterSpacing: '0.1em',
          color: 'white',
          WebkitTextStroke: '2px rgba(139,92,246,0.9)',
          textShadow: '0 0 35px rgba(139,92,246,0.85)',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
          lineHeight: 1.1,
          userSelect: 'none',
        }}
      >
        BATTLE
      </motion.div>
      {/* START — slides in from right with overshoot */}
      <motion.div
        initial={{ x: 400 }}
        animate={{ x: [400, -14, 0] }}
        transition={{ duration: 0.55, delay: 0.32, times: [0, 0.82, 1], ease: 'circOut' }}
        style={{
          fontSize: 'clamp(2.8rem,14vw,4.6rem)',
          fontWeight: 900,
          letterSpacing: '0.1em',
          color: 'transparent',
          WebkitTextStroke: '2px rgba(255,255,255,0.95)',
          textShadow: '0 0 25px rgba(255,255,255,0.7)',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
          lineHeight: 1.1,
          userSelect: 'none',
        }}
      >
        START
      </motion.div>
    </motion.div>
  );
}

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
  const offBalanceCdRef = useRef(0); // 失衡 3 回合 CD
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
  const pendingVictoryLinesRef = useRef<string[]>([]);

  // ── Mask state ─────────────────────────────────────────
  const [maskTurnCount, setMaskTurnCount] = useState(0);
  const [maskCharmUsed, setMaskCharmUsed] = useState(false);
  const [maskKindnessRevived, setMaskKindnessRevived] = useState(false);
  const [extraTurnActive, setExtraTurnActive] = useState(false);

  // ── Skill effect states ────────────────────────────────
  const [attackBuff, setAttackBuff] = useState(false);      // buff: next damage ×1.5
  const [vulnerableActive, setVulnerableActive] = useState(false); // debuff: shadow 易伤, next damage ×1.3
  const [chargeActive, setChargeActive] = useState(false);  // charge: next damage ×2
  const [attackBoostTurns, setAttackBoostTurns] = useState(0); // attack_boost: 剩余增伤回合
  const [comboCount, setComboCount] = useState(0);          // consecutive weakness/crit hits
  const [skillUsedCount, setSkillUsedCount] = useState(0);  // total skills used this battle

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
      setShowBattleFinishAnim(false);
      setShowDeathExplosion(false);
      pendingVictoryLinesRef.current = [];
      return;
    }
    if (persona && shadow && battleState && (battleState.status === 'idle' || battleState.status === 'shadow_phase2') && shadowTime) {
      startBattleSession();
    }
    const intro = buildIntroLines();
    setNarLines(intro);
    setNarIndex(0);
    setPhase('battle_start');
    playSound('/battle-expression.mp3');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-transition battle_start → intro
  useEffect(() => {
    if (phase !== 'battle_start') return;
    const t = setTimeout(() => setPhase('intro'), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  // Auto-transition battle finish animation → victory narration
  useEffect(() => {
    if (!showBattleFinishAnim) return;
    const t = setTimeout(() => {
      setShowBattleFinishAnim(false);
      setShowDeathExplosion(false);
      setNarLines(pendingVictoryLinesRef.current);
      setNarIndex(0);
      setPhase('animating');
      setPendingVictory(true);
    }, 2600);
    return () => clearTimeout(t);
  }, [showBattleFinishAnim]);

  const advanceNarration = useCallback(() => {
    if (narIndex < narLines.length - 1) {
      setNarIndex(i => i + 1);
    } else if (phase === 'intro') {
      setPhase('waiting');
    } else if (phase === 'animating') {
      if (pendingVictory) {
        onVictory();
        onClose();
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
  }, [narIndex, narLines.length, phase, pendingVictory, pendingDefeat, onVictory, onClose]);

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
      playSound('/p3tap.mp3');
      // Phase 2: Damage lands after delay
      const timer = setTimeout(() => {
        setShadowAttackAnim(false);
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
    playSound('/p3tap.mp3');

    const lines: string[] = [];

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
      // Vulnerable: shadow 易伤, next damage ×1.3
      if (vulnerableActive) {
        skillValue = Math.round(skillValue * 1.3);
        setVulnerableActive(false);
        lines.push('易伤效果触发！');
      }
      // Off-balance: +5
      if (offBalance) skillValue += 5;
      // Knowledge mask: +2 weakness damage
      if (maskAttr === 'knowledge' && selectedSkillAttr === shadow.weakAttribute) {
        skillValue += 2;
      }
    }

    // ── Guts mask crit (15% chance, ×2 damage) ────────────
    let isCritHit = false;
    if (isDamageSkill && maskAttr === 'guts' && Math.random() < 0.15) {
      isCritHit = true;
      skillValue = Math.round(skillValue * 2);
    }

    // ── Crit-type skill: roll crit chance ─────────────────
    // Lv1=10%, Lv2=15%, Lv3=20%, Lv4=25%, Lv5=30%
    if (skill.type === 'crit' && !isCritHit) {
      const critChances = [0.1, 0.15, 0.2, 0.25, 0.3];
      if (Math.random() < critChances[Math.min(skill.level - 1, 4)]) {
        isCritHit = true;
        skillValue = Math.round(skillValue * 2);
      }
    }

    // ── Non-damage skill types: compute value & set state ──
    if (skill.type === 'buff') {
      setAttackBuff(true);
      skillValue = 0;
    } else if (skill.type === 'debuff') {
      setVulnerableActive(true);
      skillValue = 0;
    } else if (skill.type === 'charge') {
      setChargeActive(true);
      skillValue = 0;
    } else if (skill.type === 'heal') {
      skillValue = 5;
    } else if (skill.type === 'attack_boost') {
      // attack_boost: deal damage (skillValue already computed above) + grant 3 turns of +15 (non-stackable)
      if (attackBoostTurns <= 0) {
        setAttackBoostTurns(3);
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

    const hpBeforeAction = battleState.playerHp;
    // Pre-compute: will this attack trigger off-balance? If yes, shadow should NOT counter.
    const willBeWeakness = isDamageSkill && selectedSkillAttr === shadow.weakAttribute;
    const willTriggerOffBalance = (willBeWeakness || isCritHit) && offBalanceCdRef.current === 0 && !offBalance;
    const allowShadowAtk = !offBalance && !extraTurnActive && !willTriggerOffBalance;
    const result = await performBattleAction(actualAction, shadowHpType, allowShadowAtk);

    // Freeze displayed HP between player's action and shadow's counter
    // For heal: show the heal first, then shadow damage later
    if (result.shadowAtkValue > 0) {
      const hpAfterPlayerOnly = skill.type === 'heal'
        ? Math.min(hpBeforeAction + skillValue, playerMaxHp)
        : hpBeforeAction;
      setDisplayPlayerHp(hpAfterPlayerOnly);
    }

    const skillPersonaName = maskAttr
      ? (persona.attributePersonas?.[selectedSkillAttr]?.name ?? '反抗者')
      : '反抗者';
    lines.push(`${skillPersonaName} 使用了 ${skill.name}！`);

    // ── Narration per skill type ────────────────────────────
    if (skill.type === 'buff') {
      lines.push('攻击力强化！下次伤害技能威力×1.5！');
    } else if (skill.type === 'debuff') {
      lines.push(`${shadow.name} 陷入易伤状态！下次攻击将造成额外伤害！`);
    } else if (skill.type === 'charge') {
      lines.push('正在蓄力……下次技能伤害将翻倍！');
    } else if (skill.type === 'heal') {
      lines.push(`回复了 ${skillValue} 点体力！`);
    } else if (skill.type === 'attack_boost') {
      lines.push(`造成了 ${result.actualDamage} 点伤害！`);
      if (attackBoostTurns <= 0) {
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

    // ── Off-balance: triggered by weakness hit or crit (3回合CD) ─────
    let justTriggeredOffBalance = false;
    if ((result.isWeakness || isCritHit) && offBalanceCdRef.current === 0 && !offBalance && isDamageSkill) {
      justTriggeredOffBalance = true;
      setOffBalance(true);
      lines.push(`${shadow.name} 失去了平衡！`);
      lines.push('趁此机会，再来一次！');
    }

    // Combo counter: increment on weakness/crit, reset otherwise
    if (isDamageSkill && (result.isWeakness || isCritHit)) {
      setComboCount(c => c + 1);
    } else if (isDamageSkill) {
      setComboCount(0);
    }
    setSkillUsedCount(c => c + 1);

    if (result.isWeakness) {
      setShowWeak(true);
      setTimeout(() => setShowWeak(false), 800);
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
      lines.push(`${shadow.name}：${pickByLevel(PHASE2_DIALOGUE, shadow.level)}`);
      lines.push('攻击力提升……小心！');
      setPhase2Animation(true);
      playSound('/battle-p4-upright.mp3');
      setTimeout(() => setPhase2Animation(false), 1500);
    }

    if (result.shadowDefeated) {
      lines.push(`${shadow.name} 倒下了！`);
      lines.push(`${shadow.name}：${pickByLevel(DEFEAT_DIALOGUE, shadow.level)}`);
      pendingVictoryLinesRef.current = lines;
      setShowDeathExplosion(true);
      setShowBattleFinishAnim(true);
      playSound('/battle-shuffle-time.mp3');
      return;
    }

    // ── Shadow counter-attack turn ───────────────────────────
    // Dexterity extra turn — shadow skips
    if (extraTurnActive) {
      setExtraTurnActive(false);
      lines.push('强化回合结束。');
      setNarLines(lines);
      setNarIndex(0);
      setPhase('animating');
      return;
    }

    // Off-balance — shadow skips this turn
    // Covers two cases:
    //   1. justTriggeredOffBalance: triggered THIS turn (closure offBalance is still false)
    //   2. offBalance (state): carried over from a previous trigger (shouldn't normally happen, but safety net)
    if (justTriggeredOffBalance || offBalance) {
      // If this is a carried-over offBalance, clear it and start CD
      if (offBalance) {
        setOffBalance(false);
        offBalanceCdRef.current = 3;
      }
      lines.push(`${shadow.name}：${pickByLevel(OFF_BALANCE_RECOVERY_DIALOGUE, shadow.level)}`);
      setNarLines(lines);
      setNarIndex(0);
      setPhase('animating');
      return;
    }

    // 失衡 CD 递减
    if (offBalanceCdRef.current > 0) offBalanceCdRef.current--;
    // 攻击增益回合数递减
    if (attackBoostTurns > 0) setAttackBoostTurns(t => t - 1);

    // Shadow attacks — build narration lines (damage is deferred to narration sync)
    const hpAfterAction = useAppStore.getState().battleState?.playerHp ?? 0;
    if (result.shadowAtkValue > 0) {
      pendingPlayerDmgRef.current = { value: result.shadowAtkValue, isCrit: !!result.shadowCrit, hpAfter: hpAfterAction };
    }

    if (result.shadowCrit) {
      lines.push(`${shadow.name} 发动了暴击！造成 ${result.shadowAtkValue} 点伤害！`);
      lines.push(`${shadow.name}：${pickByLevel(SHADOW_CRIT_DIALOGUE, shadow.level)}`);
    } else {
      lines.push(`${shadow.name} 发动了攻击！造成 ${result.shadowAtkValue} 点伤害。`);
      lines.push(`${shadow.name}：${pickByLevel(SHADOW_ATTACK_DIALOGUE, shadow.level)}`);
    }

    const latestState = useAppStore.getState().battleState;
    const lastLog = latestState?.battleLog.slice(-1)[0];
    if (lastLog?.shadowResponse) {
      lines.push(`${shadow.name}：「${lastLog.shadowResponse}」`);
    }

    // Player defeated — show the full shadow attack sequence, THEN defeat
    if (result.playerDefeated) {
      if (maskAttr === 'kindness' && !maskKindnessRevived) {
        setMaskKindnessRevived(true);
        if (pendingPlayerDmgRef.current) pendingPlayerDmgRef.current.hpAfter = 1;
        const currentState = useAppStore.getState().battleState;
        if (currentState) {
          await saveBattleState({ ...currentState, playerHp: 1, status: 'in_battle' });
        }
        lines.push('面具之力：绝境中回复了1点体力！');
        lines.push('战斗还未结束……！');
        setNarLines(lines);
        setNarIndex(0);
        setPhase('animating');
        return;
      }
      lines.push('体力耗尽……');
      setPendingDefeat(true);
      playSound('/p3tap.mp3');
    }

    setNarLines(lines);
    setNarIndex(0);
    setPhase('animating');
  };

  const visibleHp = displayPlayerHp ?? battleState.playerHp;
  const playerMaxHp = battleState.playerMaxHp;

  // Card attr navigation
  const prevAttr = () => { playSound('/battle-menu-flip.mp3', 0.5); setSelectedSkillAttrIdx(i => (i - 1 + ATTR_IDS.length) % ATTR_IDS.length); };
  const nextAttr = () => { playSound('/battle-menu-flip.mp3', 0.5); setSelectedSkillAttrIdx(i => (i + 1) % ATTR_IDS.length); };
  const attrPersonaName = maskAttr ? persona.attributePersonas?.[selectedSkillAttr]?.name : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'linear-gradient(180deg, #0a0014 0%, #1a0030 50%, #0a0014 100%)' }}
    >
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

      {/* Battle Start Animation */}
      <AnimatePresence>
        {phase === 'battle_start' && <BattleStartAnim />}
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
            <div className="flex items-center gap-1 flex-wrap">
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
              <span className="text-gray-400 text-xs ml-1">HP {visibleHp}/{playerMaxHp}</span>
              {maskAttr && (
                <span className="ml-2 text-purple-400/60 text-xs">🎭 {attrNamesMap[maskAttr]}</span>
              )}
            </div>
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
                    {offBalance && (
                      <motion.span
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)' }}
                      >
                        ⚡ 失衡 +5
                      </motion.span>
                    )}
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
                      if (offBalance) displayPower += 5;
                      if (maskAttr === 'knowledge' && isWeak) displayPower += 2;
                    }

                    const ICON: Record<string, string> = { damage: '⚔️', crit: '⚡', buff: '✨', debuff: '🔻', charge: '🔮', heal: '💚', attack_boost: '🔥' };
                    const TYPE_LABEL: Record<string, string> = { damage: '伤害', crit: '暴击', buff: '增益', debuff: '减益', charge: '蓄力', heal: '治愈', attack_boost: '攻击增益' };
                    const EFFECT_HINT: Record<string, string> = {
                      buff: '下次伤害×1.5',
                      debuff: '施加易伤×1.3',
                      charge: '下次伤害×2',
                      heal: '回复5HP',
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
                            <span className="text-white text-sm font-semibold">
                              {ICON[skill.type] ?? '⚔️'} {skill.name}
                              {isWeak && <span className="ml-1.5 text-xs text-red-400 font-bold">⚡弱点</span>}
                            </span>
                            <p className="text-gray-400 text-xs mt-0.5">{skill.description}</p>
                          </div>
                          <div className="text-right ml-2 flex-shrink-0">
                            {isDmg ? (
                              <div className={`text-xs font-bold ${isWeak ? 'text-red-400' : (chargeActive || attackBuff || vulnerableActive || offBalance) ? 'text-yellow-400' : 'text-purple-300'}`}>
                                威力 {isWeak ? `${displayPower}×1.5` : displayPower}
                              </div>
                            ) : (
                              <div className="text-xs font-bold text-emerald-400">
                                {EFFECT_HINT[skill.type] ?? TYPE_LABEL[skill.type]}
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
