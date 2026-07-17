/**
 * 逆影战场 · 战斗界面（引擎 v2 驱动版，批1 重写）
 *
 * 职责边界：本组件只做「演出与输入」——
 *  - 所有战斗逻辑在 src/battle/engine.ts（纯引擎，可模拟战复测）
 *  - 引擎 act() 返回 { lines, fx, persist }：叙事逐行播放，fx 按 atLine 对齐触发演出，
 *    persist 补丁写回 store（store 是跨 session 的事实源，引擎是战斗内的事实源）
 *
 * 引擎 v2 玩法：出战位面具（B案·自由切换）/ 意图明牌+洞察 / 1More / 失衡→总攻击QTE /
 * 五维克制环 / 双向打断 / 格挡反击 / 回合压力 / 二形态差分
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
import { useBackHandler } from '@/utils/useBackHandler';
import { AttributeId, PersonaSkill, MobSpec } from '@/types';
import { triggerLightHaptic, playSound } from '@/utils/feedback';
import { isInShadowTime, SKILL_EFFECT_MAP } from '@/constants';
import { useBoldness } from '@/utils/boldness';
import { BattleEngine, PlayerActionInput, FxEvent, TurnResult } from '@/battle/engine';
import { QTE_FALLBACK_MULT, healAmount } from '@/battle/numbers';
import { ShadowSVG } from '@/components/battle/ShadowSVG';
import { BattleStartOverlay } from '@/components/battle/BattleStartOverlay';
import { StatusBar } from '@/components/battle/StatusBar';
import { ConfidantSupportRow } from '@/components/cooperation/ConfidantSupportRow';
import { TugQTE } from '@/components/battle/TugQTE';
import {
  BattleFinishAnim, DeathExplosion, NarrationBox, AllOutCutIn, WeakCutIn,
  OneMoreFlash, MaskCutIn,
} from '@/components/battle/cutins';
import {
  NoiseLayer, WarGhost, SlantCard, SkillGlyph, slantPoly,
  IconSword, IconGuard, IconInsight, IconMask, IconBolt,
} from '@/components/battle/warKit';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onVictory: () => void;
  /** 塔内小影/精英遭遇战（批2）：临时敌人，不落 shadows 表；结束走 onEncounterEnd */
  encounter?: { mob: MobSpec; level: number } | null;
  onEncounterEnd?: (outcome: 'victory' | 'defeat' | 'retreat') => void;
}

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const MASK_PASSIVE_HINT: Record<AttributeId, string> = {
  knowledge: '弱点攻击 +2',
  guts: '暴击率 +15%',
  dexterity: '每 5 次技能追加行动',
  kindness: '致命伤保留 1 HP（每场一次）',
  charm: '首个技能免 SP',
};

export function BattleModal({ isOpen, onClose, onVictory, encounter, onEncounterEnd }: Props) {
  const {
    user, persona, shadow, battleState, attributes, settings,
    startBattleSession, endBattleSession, saveBattleState, equipMask,
    stratum, towerRecordBattleStats,
  } = useAppStore();
  const bold = useBoldness();
  const isEncounter = !!encounter;

  // ── 引擎实例与渲染版本 ──────────────────────────────────
  const engineRef = useRef<BattleEngine | null>(null);
  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  // ── 叙事与阶段 ──────────────────────────────────────────
  const [phase, setPhase] = useState<'battle_start' | 'intro' | 'waiting' | 'animating' | 'defeat'>('intro');
  const [narLines, setNarLines] = useState<string[]>([]);
  const [narIndex, setNarIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const fxBatchRef = useRef<FxEvent[]>([]);
  const firedFxRef = useRef<Set<number>>(new Set());
  const pendingOutcomeRef = useRef<'ongoing' | 'victory' | 'defeat'>('ongoing');
  const actionsTakenRef = useRef(0);
  /** 弱点演出已在点击瞬间预触发（验收反馈：WEAK 应即点即现，不等叙事行） */
  const weakPreFiredRef = useRef(false);

  // ── 演出状态 ────────────────────────────────────────────
  const [showRetreatConfirm, setShowRetreatConfirm] = useState(false);
  const [isHurt, setIsHurt] = useState(false);
  const [showWeak, setShowWeak] = useState(false);
  const [weakCutIn, setWeakCutIn] = useState(false);
  const firstWeakHitRef = useRef(false);
  const [damageNums, setDamageNums] = useState<Array<{ id: number; value: number; isWeak: boolean; isHeal?: boolean }>>([]);
  const [playerDamageNums, setPlayerDamageNums] = useState<Array<{ id: number; value: number; isCrit: boolean }>>([]);
  const damageIdRef = useRef(0);
  const [displayPlayerHp, setDisplayPlayerHp] = useState<number | null>(null);
  const [hpBarFlash, setHpBarFlash] = useState(false);
  const [shadowAttackAnim, setShadowAttackAnim] = useState(false);
  const [phase2Animation, setPhase2Animation] = useState(false);
  const [showBattleFinishAnim, setShowBattleFinishAnim] = useState(false);
  const [showDeathExplosion, setShowDeathExplosion] = useState(false);
  const [oneMoreFlash, setOneMoreFlash] = useState(false);
  const [allOutCutIn, setAllOutCutIn] = useState(false);
  const [maskCutIn, setMaskCutIn] = useState<{ attr: AttributeId; full: boolean } | null>(null);
  const [qteOpen, setQteOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [confidantSupportToast, setConfidantSupportToast] = useState<string | null>(null);

  const shadowTime = isInShadowTime(
    settings.battleShadowTimeDays ?? [5, 6, 0],
    settings.battleShadowTimeStart ?? 20,
    settings.battleShadowTimeEnd ?? 7
  );

  const attrNamesMap = settings.attributeNames as Record<AttributeId, string>;
  const snap = engineRef.current?.snapshot ?? null;

  // Android 返回键：对齐 ✕ 撤退语义
  useBackHandler(isOpen, () => {
    if (phase === 'battle_start' || showBattleFinishAnim || qteOpen) return;
    setShowRetreatConfirm(v => !v);
  });

  // 登塔统计回写（回顾用）：任何一场战斗收尾时调用一次
  const recordTowerStats = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !stratum) return;
    void towerRecordBattleStats({
      damage: engine.totalDamageDealt,
      maxHit: engine.maxSingleHit,
      weaknessHits: engine.weaknessHits,
    });
  }, [stratum, towerRecordBattleStats]);

  // ── 开场：建引擎 + 叙事 ─────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      engineRef.current = null;
      setPhase('intro'); setNarLines([]); setNarIndex(0);
      setIsAnimating(false); setShowRetreatConfirm(false);
      setIsHurt(false); setShowWeak(false); setWeakCutIn(false);
      firstWeakHitRef.current = false;
      setDamageNums([]); setPlayerDamageNums([]);
      setDisplayPlayerHp(null); setHpBarFlash(false);
      setShadowAttackAnim(false); setPhase2Animation(false);
      setShowBattleFinishAnim(false); setShowDeathExplosion(false);
      setOneMoreFlash(false); setAllOutCutIn(false); setMaskCutIn(null);
      setQteOpen(false); setActionMenuOpen(false);
      fxBatchRef.current = []; firedFxRef.current = new Set();
      pendingOutcomeRef.current = 'ongoing';
      actionsTakenRef.current = 0;
      return;
    }
    if (!persona || !battleState) return;
    if (!isEncounter && !shadow) return;
    // 塔模式下 HP 跨节点持续，每日回满只发生在 enterTowerToday；
    // 仅旧模型（无区层）保留进场自动开 session
    if (!isEncounter && !stratum && (battleState.status === 'idle' || battleState.status === 'shadow_phase2') && shadowTime) {
      startBattleSession();
    }
    const bs = useAppStore.getState().battleState!;
    const sh = useAppStore.getState().shadow!;

    // 同伴 damage_plus 汇总
    const damagePlus = Object.fromEntries(ATTR_IDS.map(a => [a, 0])) as Record<AttributeId, number>;
    for (const c of useAppStore.getState().confidants) {
      if (c.archivedAt) continue;
      for (const b of c.buffs) {
        if (b.kind === 'damage_plus' && b.attribute) damagePlus[b.attribute] += b.value;
      }
    }

    const attrLevels = Object.fromEntries(
      attributes.map(a => [a.id, a.unlocked === false ? 0 : (a.level ?? 1)])
    ) as Record<AttributeId, number>;
    const basicAttackPower = Object.values(attrLevels).reduce((s, v) => s + v, 0);
    const personaNames = Object.fromEntries(
      ATTR_IDS.map(a => [a, persona.attributePersonas?.[a]?.name ?? '反抗者'])
    ) as Record<AttributeId, string>;
    // 出战位：优先佩戴面具，否则等级最高的属性
    const initialMask = persona.equippedMaskAttribute
      ?? ATTR_IDS.reduce((best, a) => (attrLevels[a] > attrLevels[best] ? a : best), 'knowledge' as AttributeId);

    // 登塔 session 增益 / 被夺先手（事件来源，boss 与小影战通用）
    const towerTs = stratum && bs.towerSession && bs.towerSession.dateKey === toLocalDateKey() ? bs.towerSession : undefined;
    const sessionAddPct = towerTs?.buffs.reduce((sum, b) => sum + (b.addPct ?? 0), 0) ?? 0;
    const firstStrikeStolen = !!towerTs?.pendingFirstStrike;

    const engineShadow = isEncounter
      ? {
          id: `encounter-${Date.now()}`,
          name: encounter!.mob.name,
          level: encounter!.level,
          weakAttribute: encounter!.mob.weakAttribute,
          attribute: encounter!.mob.attribute,
          hp: encounter!.mob.maxHp, maxHp: encounter!.mob.maxHp,
          hp2: undefined, maxHp2: undefined,
          phase: 1 as const,
          attackScalePct: settings.battleAttackScale ?? 100,
          responseLines: [] as string[],
          tier: encounter!.mob.tier,
        }
      : {
          id: sh.id,
          name: sh.name,
          level: sh.level,
          weakAttribute: sh.weakAttribute,
          attribute: sh.attribute,
          hp: sh.currentHp, maxHp: sh.maxHp,
          hp2: sh.currentHp2, maxHp2: sh.maxHp2,
          phase: (bs.status === 'shadow_phase2' ? 2 : 1) as 1 | 2,
          phase2WeakAttribute: sh.phase2WeakAttribute,
          phase2ResistAttribute: sh.phase2ResistAttribute,
          attackScalePct: settings.battleAttackScale ?? 100,
          responseLines: sh.responseLines,
          tier: 'boss' as const,
        };

    const engine = new BattleEngine({
      userName: user?.name ?? '你',
      attrNames: attrNamesMap,
      personaNames,
      attrLevels,
      skills: persona.skills,
      damagePlus,
      basicAttackPower,
      initialMask,
      playerHp: bs.playerHp,
      playerMaxHp: bs.playerMaxHp,
      sp: bs.sp,
      shadow: engineShadow,
      effectMap: SKILL_EFFECT_MAP,
      sessionAddPct,
      firstStrikeStolen,
    });
    engineRef.current = engine;
    // 属性向派生后写回（存量主影无此字段；小影不落表）
    if (!isEncounter && !sh.attribute) {
      void useAppStore.getState().saveShadow({ ...sh, attribute: engine.snapshot.shadowAttribute });
    }

    const s = engine.snapshot;
    const userName = user?.name ?? '你';
    const maskPersona = personaNames[s.activeMask];
    let intro: string[];
    if (isEncounter) {
      intro = [
        `${encounter!.mob.name} 挡住了去路！`,
        `属性向【${attrNamesMap[encounter!.mob.attribute]}】——弱点是【${attrNamesMap[s.weakAttribute]}】！`,
      ];
      if (encounter!.mob.tier === 'elite') intro.splice(1, 0, '危险的气息……是强敌！');
    } else {
      intro = [
        `${userName}！是时候了！`,
        `${userName} 戴上了【${attrNamesMap[s.activeMask]}】的面具——Persona ${maskPersona}，出战！`,
        `${sh.name} 出现了！`,
        sh.description,
        `Shadow 的弱点——${attrNamesMap[s.weakAttribute]}属性！`,
      ];
      if (s.phase === 2) {
        intro.push(`${sh.name} 已进入第二形态……小心！`);
      }
      const respLine = sh.responseLines[Math.floor(Math.random() * Math.min(3, sh.responseLines.length))] ?? '……';
      intro.push(`${sh.name}：「${respLine}」`);
    }
    const opening = engine.openingTurn();
    fxBatchRef.current = [];
    firedFxRef.current = new Set();
    setNarLines([...intro, ...opening.lines]);
    setNarIndex(0);
    setPhase('battle_start');
    playSound('/battle-start.mp3');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // battle_start → intro
  useEffect(() => {
    if (phase !== 'battle_start') return;
    const t = setTimeout(() => setPhase('intro'), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  // BATTLE FINISH 收尾（主影战）
  useEffect(() => {
    if (!showBattleFinishAnim) return;
    const t = setTimeout(() => {
      setShowBattleFinishAnim(false);
      setShowDeathExplosion(false);
      recordTowerStats();
      onVictory();
      onClose();
    }, 2600);
    return () => clearTimeout(t);
  }, [showBattleFinishAnim, onVictory, onClose, recordTowerStats]);

  useEffect(() => {
    if (!showDeathExplosion) return;
    const t = setTimeout(() => setShowDeathExplosion(false), 1200);
    return () => clearTimeout(t);
  }, [showDeathExplosion]);

  // ── store 持久化适配器 ─────────────────────────────────
  const persistResult = useCallback(async (res: TurnResult) => {
    const bs = useAppStore.getState().battleState;
    if (!bs) return;
    const p = res.persist;
    if (isEncounter) {
      // 小影战：临时敌人不落表；败退锁定当晚，胜利/进行中不动 session 状态
      const status = res.outcome === 'defeat' ? 'session_end' as const : bs.status;
      await saveBattleState({ ...bs, playerHp: p.playerHp, sp: p.sp, status });
      return;
    }
    const sh = useAppStore.getState().shadow;
    if (!sh) return;
    const status = res.outcome === 'victory' ? 'victory' as const
      : res.outcome === 'defeat' ? 'session_end' as const
      : p.phase === 2 ? 'shadow_phase2' as const
      : 'in_battle' as const;
    await useAppStore.getState().saveShadow({
      ...sh,
      currentHp: p.shadowHp,
      currentHp2: p.shadowHp2,
      weakAttribute: p.phase === 2 ? sh.weakAttribute : p.weakAttribute,
      phase2WeakAttribute: p.phase2WeakAttribute,
      phase2ResistAttribute: p.phase2ResistAttribute,
    });
    await saveBattleState({ ...bs, playerHp: p.playerHp, sp: p.sp, status });
  }, [saveBattleState, isEncounter]);

  // ── 行动派发 ────────────────────────────────────────────
  const runAction = useCallback(async (input: PlayerActionInput) => {
    const engine = engineRef.current;
    if (!engine || isAnimating || (phase !== 'waiting' && phase !== 'intro')) return;
    // WEAK 即点即现：弱点判定是确定性的（出战属性 === 当前弱点），点击瞬间先出演出
    weakPreFiredRef.current = false;
    if (input.kind === 'skill') {
      const t = input.skill.type;
      const isDmg = t === 'damage' || t === 'crit' || t === 'attack_boost';
      const s = engine.snapshot;
      if (isDmg && s.activeMask === s.weakAttribute && s.sp >= engine.skillCost(input.skill)) {
        weakPreFiredRef.current = true;
        setShowWeak(true);
        setTimeout(() => setShowWeak(false), 800);
        if (!firstWeakHitRef.current) {
          firstWeakHitRef.current = true;
          setWeakCutIn(true);
          playSound('/battle-mask-swap.mp3', 0.7);
          setTimeout(() => setWeakCutIn(false), 1300);
        }
      }
    }
    const prevHp = useAppStore.getState().battleState?.playerHp;
    const res = engine.act(input);
    bump();
    if (res.consumedTurn) actionsTakenRef.current++;
    await persistResult(res);
    if (res.lines.length === 0) return;
    // 有玩家掉血演出 → 冻结显示 HP 到叙事命中行
    if (res.fx.some(f => f.type === 'playerHit') && prevHp !== undefined) {
      setDisplayPlayerHp(prevHp);
    }
    fxBatchRef.current = res.fx;
    firedFxRef.current = new Set();
    pendingOutcomeRef.current = res.outcome;
    setIsAnimating(true);
    setNarLines(res.lines);
    setNarIndex(0);
    setPhase('animating');
  }, [isAnimating, phase, persistResult]);

  // ── 叙事推进 ────────────────────────────────────────────
  const advanceNarration = useCallback(() => {
    if (narIndex < narLines.length - 1) {
      setNarIndex(i => i + 1);
      return;
    }
    if (phase === 'intro') {
      setPhase('waiting');
      return;
    }
    if (phase === 'animating') {
      if (pendingOutcomeRef.current === 'victory') {
        pendingOutcomeRef.current = 'ongoing';
        if (isEncounter) {
          // 小影战胜利：不播大 FINISH（每节点一场，2.6s 太重）——短促收线回地图
          recordTowerStats();
          playSound('/battle-fanfare.mp3', 0.5);
          onEncounterEnd?.('victory');
          onClose();
          return;
        }
        setShowBattleFinishAnim(true);
        playSound('/battle-fanfare.mp3');
        return;
      }
      if (pendingOutcomeRef.current === 'defeat') {
        pendingOutcomeRef.current = 'ongoing';
        setPhase('defeat');
        return;
      }
      setPhase('waiting');
      setIsAnimating(false);
      setDisplayPlayerHp(null);
    }
  }, [narIndex, narLines.length, phase, isEncounter, recordTowerStats, onEncounterEnd, onClose]);

  // ── fx 触发（叙事行对齐） ───────────────────────────────
  useEffect(() => {
    if (phase !== 'animating') return;
    const fxs = fxBatchRef.current;
    for (let i = 0; i < fxs.length; i++) {
      const f = fxs[i];
      if (f.atLine !== narIndex || firedFxRef.current.has(i)) continue;
      firedFxRef.current.add(i);
      fireFx(f);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narIndex, phase]);

  const fireFx = (f: FxEvent) => {
    switch (f.type) {
      case 'shadowHit': {
        setIsHurt(true);
        playSound('/pi.mp3', 0.6);
        setTimeout(() => setIsHurt(false), 400);
        const id = ++damageIdRef.current;
        setDamageNums(prev => [...prev, { id, value: f.value ?? 0, isWeak: !!(f.isWeak || f.isCrit) }]);
        setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1500);
        break;
      }
      case 'weak': {
        // 点击瞬间已预触发过则跳过（叙事行时刻只留 1More 等后续演出）
        if (weakPreFiredRef.current) break;
        setShowWeak(true);
        setTimeout(() => setShowWeak(false), 800);
        if (!firstWeakHitRef.current) {
          firstWeakHitRef.current = true;
          setWeakCutIn(true);
          playSound('/battle-mask-swap.mp3', 0.7);
          setTimeout(() => setWeakCutIn(false), 1300);
        }
        break;
      }
      case 'playerHit': {
        setShadowAttackAnim(true);
        playSound('/themea-nav.mp3');
        setTimeout(() => {
          setShadowAttackAnim(false);
          playSound('/shadowattack.mp3', 0.7);
          const id = ++damageIdRef.current;
          setPlayerDamageNums(prev => [...prev, { id, value: f.value ?? 0, isCrit: !!f.isCrit }]);
          setTimeout(() => setPlayerDamageNums(prev => prev.filter(d => d.id !== id)), 2200);
          if (f.hpAfter !== undefined) setDisplayPlayerHp(f.hpAfter);
          setHpBarFlash(true);
          setTimeout(() => setHpBarFlash(false), 600);
        }, 350);
        break;
      }
      case 'heal': {
        const id = ++damageIdRef.current;
        setDamageNums(prev => [...prev, { id, value: f.value ?? 0, isWeak: false, isHeal: true }]);
        setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1500);
        if (f.hpAfter !== undefined) setDisplayPlayerHp(f.hpAfter);
        break;
      }
      case 'stagger': {
        playSound('/battle-impact.mp3', 0.8);
        triggerLightHaptic();
        break;
      }
      case 'oneMore': {
        // 右上角小飘带：短促、不占中心（与 WEAK cut-in 区分）、不阻塞操作
        setOneMoreFlash(true);
        playSound('/battle-mask-swap.mp3', 0.6);
        setTimeout(() => setOneMoreFlash(false), 680);
        break;
      }
      case 'phase2': {
        setPhase2Animation(true);
        playSound('/battle-impact.mp3');
        setTimeout(() => setPhase2Animation(false), 1500);
        break;
      }
      case 'shadowDeath': {
        setShowDeathExplosion(true);
        break;
      }
      case 'berserk': {
        playSound('/battle-impact.mp3', 0.6);
        break;
      }
      case 'chargeCancel': {
        playSound('/dd.mp3', 0.6);
        break;
      }
      default: break;
    }
  };

  // ── 出战位切换（自由行动） ──────────────────────────────
  const handleSwitchMask = async (attr: AttributeId) => {
    const engine = engineRef.current;
    if (!engine || isAnimating || phase !== 'waiting' || qteOpen) return;
    if (attr === engine.snapshot.activeMask) return;
    const res = engine.act({ kind: 'switchMask', attribute: attr });
    bump();
    const fx = res.fx.find(f => f.type === 'maskSwitch');
    const full = !!fx?.isCrit; // 首次切换 = 完整 cut-in
    playSound('/battle-mask-swap.mp3', full ? 0.8 : 0.4);
    triggerLightHaptic();
    setMaskCutIn({ attr, full });
    setTimeout(() => setMaskCutIn(null), full ? 900 : 650);
    equipMask(attr); // 出战面具即佩戴面具（B案）
  };

  // ── 总攻击（QTE 门） ────────────────────────────────────
  const handleAllOut = () => {
    if (!snap?.canAllOut || isAnimating || phase !== 'waiting') return;
    if (!bold) {
      // D0：跳过 QTE 直接结算
      setAllOutCutIn(true);
      setTimeout(() => setAllOutCutIn(false), 1400);
      void runAction({ kind: 'allOut', qteMult: QTE_FALLBACK_MULT });
      return;
    }
    playSound('/battle-fanfare.mp3', 0.7);
    setQteOpen(true);
  };

  if (!isOpen || !persona || !battleState || !snap) return null;
  if (!isEncounter && !shadow) return null;
  const foeName = isEncounter ? encounter!.mob.name : shadow!.name;
  const foeLevel = isEncounter ? encounter!.level : shadow!.level;

  const attrLevels = Object.fromEntries(
    attributes.map(a => [a.id, a.unlocked === false ? 0 : (a.level ?? 1)])
  ) as Record<AttributeId, number>;
  const availableSkills: PersonaSkill[] =
    persona.skills[snap.activeMask]?.filter(s => s.level <= (attrLevels[snap.activeMask] || 1)) || [];
  const isWeakAttr = snap.activeMask === snap.weakAttribute;
  const hp1Pct = (snap.shadowHp / Math.max(1, snap.shadowMaxHp)) * 100;
  const hp2Pct = snap.shadowMaxHp2 ? ((snap.shadowHp2 ?? 0) / snap.shadowMaxHp2) * 100 : 0;
  const isPhase2 = snap.phase === 2;
  const visibleHp = displayPlayerHp ?? snap.playerHp;
  const activePersonaName = persona.attributePersonas?.[snap.activeMask]?.name ?? '反抗者';
  const basicPower = Math.max(1, Object.values(attrLevels).reduce((s, v) => s + v, 0));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0a0014 0%, #1a0030 50%, #0a0014 100%)' }}
    >
      {/* 质感层（批2c-i）：噪点 + 幽灵字 */}
      <NoiseLayer opacity={0.06} />
      <WarGhost
        text="SHADOW TIME"
        style={{ right: -12, top: '30%', fontSize: 58, transform: 'rotate(90deg)', transformOrigin: 'right top' }}
      />
      <WarGhost text={isEncounter ? 'ENCOUNTER' : 'SHOWDOWN'} style={{ left: -6, bottom: 4, fontSize: 46, transform: 'rotate(-4deg)' }} />

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
            <span className="text-white font-bold text-sm">{confidantSupportToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 撤退确认 */}
      <AnimatePresence>
        {showRetreatConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.85)' }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
              className="w-full max-w-xs rounded-2xl p-6 text-center space-y-4"
              style={{ background: 'rgba(10,0,30,0.95)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)' }}
            >
              {isEncounter ? (
                <>
                  <p className="text-2xl">💨</p>
                  <p className="text-white font-bold text-base">撤离节点？</p>
                  <p className="text-gray-400 text-sm leading-relaxed">退回塔层地图。这只影会恢复元气，<br />今晚仍可重新挑战该节点。</p>
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
                        recordTowerStats();
                        onEncounterEnd?.('retreat');
                        onClose();
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-purple-300"
                      style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.2)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)' }}
                    >
                      撤离
                    </button>
                  </div>
                </>
              ) : stratum ? (
                <>
                  <p className="text-2xl">🌑</p>
                  <p className="text-white font-bold text-base">暂时撤离心魔？</p>
                  <p className="text-gray-400 text-sm leading-relaxed">对它造成的伤害会保留。<br />今晚体力尚存时仍可再次挑战。</p>
                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => setShowRetreatConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-300"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      继续战斗
                    </button>
                    <button
                      onClick={() => { setShowRetreatConfirm(false); recordTowerStats(); onClose(); }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-400"
                      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
                    >
                      撤离
                    </button>
                  </div>
                </>
              ) : actionsTakenRef.current === 0 ? (
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
                        const bs = useAppStore.getState().battleState;
                        if (bs) saveBattleState({ ...bs, status: 'idle', lastChallengeDate: undefined });
                        onClose();
                      }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-purple-300"
                      style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.2)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)' }}
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

      {/* QTE */}
      <AnimatePresence>
        {qteOpen && (
          <TugQTE
            shadowLevel={foeLevel}
            shadowName={foeName}
            onDone={(mult) => {
              setQteOpen(false);
              setAllOutCutIn(true);
              setTimeout(() => setAllOutCutIn(false), 1400);
              void runAction({ kind: 'allOut', qteMult: mult });
            }}
          />
        )}
      </AnimatePresence>

      {/* Cut-ins */}
      <AnimatePresence>{allOutCutIn && <AllOutCutIn personaName={activePersonaName} shadowName={foeName} />}</AnimatePresence>
      <AnimatePresence>{weakCutIn && <WeakCutIn />}</AnimatePresence>
      <AnimatePresence>{oneMoreFlash && <OneMoreFlash />}</AnimatePresence>
      <AnimatePresence>
        {maskCutIn && (
          <MaskCutIn
            attrName={attrNamesMap[maskCutIn.attr]}
            personaName={persona.attributePersonas?.[maskCutIn.attr]?.name ?? '反抗者'}
            full={maskCutIn.full}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{phase === 'battle_start' && <BattleStartOverlay />}</AnimatePresence>
      <AnimatePresence>{showBattleFinishAnim && <BattleFinishAnim />}</AnimatePresence>

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

      {/* ── Header：Shadow 信息 + 意图 + 失衡条 ── */}
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
            <span className="text-red-400 font-bold text-sm">👁 {foeName}</span>
            <span className="ml-2 text-gray-500 text-xs">Lv{foeLevel}</span>
            {isPhase2 && <span className="ml-1 text-xs font-bold text-orange-400"> II</span>}
          </div>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(239,68,68,0.25)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)' }}
          >
            弱 {attrNamesMap[snap.weakAttribute]}
          </span>
        </div>

        {/* 意图明牌 */}
        <div className="flex items-center gap-2">
          {snap.intent && phase !== 'battle_start' && (
            <motion.button
              key={`${snap.turn}-${snap.intent.kind}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => snap.insightAvailable && phase === 'waiting' && !isAnimating && runAction({ kind: 'insight' })}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold"
              style={{
                background: snap.windup ? 'rgba(250,204,21,0.2)' : 'rgba(255,255,255,0.08)',
                border: snap.windup ? '1px solid rgba(250,204,21,0.55)' : '1px solid rgba(255,255,255,0.15)',
                color: snap.windup ? '#fde047' : '#d1d5db',
              }}
            >
              <span>意图</span>
              <motion.span
                animate={snap.windup ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.7, repeat: Infinity }}
              >
                {snap.intent.icon}
              </motion.span>
              <span>{snap.intent.label}</span>
              {snap.insightAvailable && phase === 'waiting' && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-300/80"><IconInsight size={11} />2SP</span>
              )}
            </motion.button>
          )}
          {snap.staggerImmune > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: 'rgba(156,163,175,0.25)', color: '#d1d5db', lineHeight: 1.2 }}>
              失衡免疫 {snap.staggerImmune}
            </span>
          )}
          {snap.berserk && (
            <motion.span
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
              style={{ background: 'rgba(239,68,68,0.35)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.6)', lineHeight: 1.2 }}
            >
              🔥 狂化
            </motion.span>
          )}
        </div>

        {/* HP 条 1 */}
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>HP</span><span>{snap.shadowHp}/{snap.shadowMaxHp}</span>
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
        {/* HP 条 2 */}
        {snap.shadowMaxHp2 !== undefined && (
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>HP2{isPhase2 ? ' ▶' : ''}</span>
              <span>{snap.shadowHp2 ?? snap.shadowMaxHp2}/{snap.shadowMaxHp2}</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${hp2Pct}%` }}
                transition={{ duration: 0.4 }}
                style={{ background: isPhase2 ? 'linear-gradient(90deg, #f97316, #ef4444)' : 'rgba(107,114,128,0.3)' }}
              />
            </div>
          </div>
        )}

        {/* 失衡条 */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-yellow-200/70 flex-shrink-0">失衡</span>
          <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-full"
              animate={{
                width: `${snap.staggerGauge}%`,
                opacity: snap.staggerWindow ? [1, 0.5, 1] : 1,
              }}
              transition={{ width: { duration: 0.3 }, opacity: { duration: 0.6, repeat: snap.staggerWindow ? Infinity : 0 } }}
              style={{ background: 'linear-gradient(90deg, #f59e0b, #fde047)', boxShadow: '0 0 8px rgba(250,204,21,0.5)' }}
            />
          </div>
          {snap.staggerWindow && (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="text-[10px] font-black text-yellow-300 flex-shrink-0"
            >
              总攻击窗口！
            </motion.span>
          )}
        </div>

        {/* Shadow 状态栏 */}
        {snap.shadowStatuses.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center mt-1">
            <StatusBar effects={snap.shadowStatuses} side="shadow" />
          </div>
        )}
      </div>

      {/* ── 败北屏 ── */}
      {phase === 'defeat' && (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <p className="text-6xl mb-4">💀</p>
            <p className="text-white text-xl font-bold mb-2">影时间结束</p>
            <p className="text-gray-400 text-sm mb-6">
              体力不支，被迫撤退。<br />对它造成的伤害将被保留——明晚再来。
            </p>
            <button
              onClick={() => {
                recordTowerStats();
                if (isEncounter) {
                  onEncounterEnd?.('defeat');
                  onClose();
                  return;
                }
                // 塔模式：败退锁定当晚（status 已是 session_end），不重置为 idle
                if (!stratum) endBattleSession();
                onClose();
              }}
              className="px-6 py-3 rounded-xl text-white font-semibold"
              style={{ background: 'rgba(255,255,255,0.15)' }}
            >
              返回
            </button>
          </motion.div>
        </div>
      )}

      {/* ── 主战斗区 ── */}
      {phase !== 'defeat' && (
        <>
          <div className="flex-shrink-0 relative flex items-center justify-center" style={{ height: 150 }}>
            <ShadowSVG
              level={foeLevel}
              isHurt={isHurt}
              isWeak={showWeak}
              offBalance={snap.staggerWindow}
              damageNumbers={damageNums.filter(d => !d.isHeal)}
              weakAttribute={snap.weakAttribute}
            />
            <AnimatePresence>{showDeathExplosion && <DeathExplosion />}</AnimatePresence>
            {/* Combo */}
            <AnimatePresence>
              {snap.comboCount >= 2 && (
                <motion.div
                  key={snap.comboCount}
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
                    {snap.comboCount}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: '#fbbf24', letterSpacing: '0.1em',
                    textShadow: '0 0 8px rgba(251,191,36,0.6)', marginTop: -2,
                  }}>
                    COMBO
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Shadow 攻击闪光 */}
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

          {/* ── 玩家 HP / 状态 ── */}
          <motion.div
            className="px-4 mt-1 flex-shrink-0 relative"
            animate={{ backgroundColor: hpBarFlash ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0)' }}
            transition={{ duration: 0.3 }}
            style={{ borderRadius: 12, margin: '4px 0', padding: '6px 16px' }}
          >
            <div className="flex items-center gap-2 w-full">
              <div className="flex items-center gap-[2px] flex-1 min-w-0">
                {Array.from({ length: Math.min(snap.playerMaxHp, 60) }, (_, i) => {
                  const unit = snap.playerMaxHp / Math.min(snap.playerMaxHp, 60);
                  const filled = i < Math.ceil(visibleHp / unit);
                  return (
                    <motion.div
                      key={i}
                      animate={{ filter: hpBarFlash && !filled ? 'brightness(2.2)' : 'brightness(1)' }}
                      transition={{ duration: 0.3 }}
                      style={{
                        flex: '1 1 0', minWidth: 2, maxWidth: 10, height: 10, borderRadius: 2,
                        background: filled ? '#ef4444' : 'rgba(255,255,255,0.15)',
                        boxShadow: filled ? '0 0 4px rgba(239,68,68,0.6)' : 'none',
                      }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-gray-400 text-xs whitespace-nowrap">HP {visibleHp}/{snap.playerMaxHp}</span>
                <span className="text-purple-400/70 text-xs whitespace-nowrap">🎭 {attrNamesMap[snap.activeMask]}</span>
                {snap.guardCounterReady && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap"
                        style={{ background: 'rgba(59,130,246,0.25)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.5)', lineHeight: 1.2 }}>
                    ⚔️ 反击预备
                  </span>
                )}
              </div>
            </div>
            {snap.playerStatuses.length > 0 && (
              <div className="mt-1">
                <StatusBar effects={snap.playerStatuses} side="player" />
              </div>
            )}
            {/* 玩家掉血数字 */}
            <AnimatePresence>
              {playerDamageNums.map(dn => (
                <motion.div
                  key={dn.id}
                  initial={{ opacity: 1, y: 0, scale: 0.6 }}
                  animate={{ opacity: 0, y: -60, scale: dn.isCrit ? 1.4 : 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 2, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', top: '-14px', left: `${30 + (dn.id % 5) * 8}%`,
                    color: dn.isCrit ? '#ff1111' : '#ef4444', fontWeight: 900,
                    fontSize: dn.isCrit ? 38 : 30,
                    textShadow: dn.isCrit
                      ? '0 0 20px #ff0000, 0 0 40px rgba(255,0,0,0.6), 0 2px 4px rgba(0,0,0,0.8)'
                      : '0 0 14px rgba(239,68,68,0.9), 0 2px 4px rgba(0,0,0,0.8)',
                    pointerEvents: 'none', zIndex: 10, letterSpacing: '-0.02em',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}
                >
                  -{dn.value}
                </motion.div>
              ))}
            </AnimatePresence>
            {/* 回复数字 */}
            <AnimatePresence>
              {damageNums.filter(d => d.isHeal).map(dn => (
                <motion.div
                  key={dn.id}
                  initial={{ opacity: 1, y: 0, scale: 0.7 }}
                  animate={{ opacity: 0, y: -44, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.4, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', top: '-10px', right: '20%',
                    color: '#34d399', fontWeight: 900, fontSize: 26,
                    textShadow: '0 0 12px rgba(16,185,129,0.8), 0 2px 4px rgba(0,0,0,0.8)',
                    pointerEvents: 'none', zIndex: 10,
                  }}
                >
                  +{dn.value}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {/* 叙事框 */}
          {(phase === 'intro' || phase === 'animating') && (
            <div className="flex-shrink-0 mt-2">
              <NarrationBox lines={narLines} index={narIndex} onAdvance={advanceNarration} canAdvance={true} />
            </div>
          )}

          {/* ── 行动面板 ── */}
          {phase === 'waiting' && (
            <>
              <div className="px-4 mt-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  {/* ② 大字号数字排版：SP 主数字放大、标签小写角标化 */}
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-yellow-200/50">SP</span>
                    <span className="text-yellow-300 text-2xl font-black tabular-nums leading-none" style={{ letterSpacing: '-0.02em' }}>
                      {snap.sp}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {snap.chargeActive && (
                      <motion.span animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 0.7, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.25)', color: '#a78bfa', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.5)' }}>
                        🔮 蓄力×2
                      </motion.span>
                    )}
                    {snap.attackBuff && (
                      <motion.span animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 0.9, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(250,204,21,0.2)', color: '#fde047', border: '1px solid rgba(250,204,21,0.4)' }}>
                        ✨ 攻击+50%
                      </motion.span>
                    )}
                    {snap.vulnerableArmed && (
                      <motion.span animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 0.9, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}>
                        🔻 易伤+30%
                      </motion.span>
                    )}
                    {snap.attackBoostTurns > 0 && (
                      <motion.span animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 0.8, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(244,63,94,0.2)', color: '#fb7185', border: '1px solid rgba(244,63,94,0.4)' }}>
                        🔥 增伤+6 ({snap.attackBoostTurns})
                      </motion.span>
                    )}
                    {isWeakAttr && (
                      <motion.span animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 1, repeat: Infinity }}
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                        ⚡ 弱点 ×1.5
                      </motion.span>
                    )}
                  </div>
                </div>

                {/* 出战面具切换（B案：即时、免费、锁技能面板） */}
                <div className="flex items-center gap-2 mb-2.5">
                  <button
                    onClick={() => {
                      playSound('/ui-menu.mp3', 0.5);
                      const idx = ATTR_IDS.indexOf(snap.activeMask);
                      void handleSwitchMask(ATTR_IDS[(idx - 1 + ATTR_IDS.length) % ATTR_IDS.length]);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white transition-colors text-lg flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    ‹
                  </button>
                  <SlantCard
                    cut={12}
                    edge={isWeakAttr ? 'rgba(239,68,68,0.55)' : 'rgb(var(--color-battle-bright-rgb) / 0.45)'}
                    face={isWeakAttr ? 'rgba(60,10,22,0.92)' : 'rgba(22,8,50,0.92)'}
                    className="flex-1"
                  >
                    {/* 克制关系不做常驻角标（易误解）——只在造成/受到伤害时随叙事行出现 */}
                    <div className="px-3 py-2 text-center">
                      <p className="text-white text-sm font-bold inline-flex items-center justify-center gap-1.5">
                        <IconMask size={14} className="text-purple-300" />
                        {attrNamesMap[snap.activeMask]}
                        {isWeakAttr && (
                          <span className="inline-flex items-center gap-0.5 text-red-400 text-xs font-black">
                            <IconBolt size={11} />弱点
                          </span>
                        )}
                      </p>
                      <p className="text-white/40 text-[11px] mt-0.5">
                        {activePersonaName} · {MASK_PASSIVE_HINT[snap.activeMask]}
                      </p>
                    </div>
                  </SlantCard>
                  <button
                    onClick={() => {
                      playSound('/ui-menu.mp3', 0.5);
                      const idx = ATTR_IDS.indexOf(snap.activeMask);
                      void handleSwitchMask(ATTR_IDS[(idx + 1) % ATTR_IDS.length]);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-white/60 hover:text-white transition-colors text-lg flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    ›
                  </button>
                </div>

                {/* 行动 + 总攻击 */}
                <div className="flex gap-2 mb-3">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setActionMenuOpen(v => !v)}
                    disabled={isAnimating}
                    className="flex-1 py-2 text-xs font-black transition-all disabled:opacity-50"
                    style={{
                      clipPath: slantPoly(10),
                      background: actionMenuOpen ? 'rgb(var(--color-battle-bright-rgb) / 0.34)' : 'rgb(var(--color-battle-bright-rgb) / 0.2)',
                      color: '#c4b5fd',
                    }}
                  >
                    行动 {actionMenuOpen ? '▴' : '▾'}
                    <span className="block text-[9px] opacity-60 mt-0.5 font-semibold">普通攻击 / 防御 / 同伴支援</span>
                  </motion.button>

                  <AnimatePresence>
                    {snap.staggerWindow && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8, width: 0 }}
                        animate={{ opacity: 1, scale: [1, 1.05, 1], width: 'auto' }}
                        exit={{ opacity: 0, scale: 0.7, width: 0 }}
                        transition={{ scale: { duration: 1, repeat: Infinity }, opacity: { duration: 0.35 } }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleAllOut}
                        disabled={isAnimating || !snap.canAllOut}
                        className="flex-1 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-35"
                        style={{
                          background: 'linear-gradient(90deg, rgba(239,68,68,0.35), rgba(250,204,21,0.35))',
                          border: '1px solid rgba(250,204,21,0.7)',
                          color: '#fde047',
                          boxShadow: '0 0 18px rgba(250,204,21,0.45), inset 0 0 10px rgba(250,204,21,0.15)',
                        }}
                      >
                        ⚡ 总攻击
                        <span className="block text-[9px] opacity-90 mt-0.5">{snap.allOutSpCost} SP · 拔河 QTE</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                {/* 行动子菜单 */}
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
                        style={{ background: 'rgba(10,0,30,0.55)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.25)' }}
                      >
                        <div className="flex gap-2">
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setActionMenuOpen(false); playSound('/themea-nav.mp3', 0.5); void runAction({ kind: 'basic' }); }}
                            disabled={isAnimating}
                            className="flex-1 py-2 text-xs font-bold disabled:opacity-50"
                            style={{ clipPath: slantPoly(8), background: 'rgba(244,114,182,0.2)', color: '#fbcfe8' }}
                          >
                            <span className="inline-flex items-center gap-1"><IconSword size={12} />普通攻击</span>
                            <span className="block text-[9px] opacity-60 mt-0.5 font-semibold">0 SP · {basicPower} 伤害</span>
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setActionMenuOpen(false); playSound('/ui-menu.mp3', 0.6); void runAction({ kind: 'defend' }); }}
                            disabled={isAnimating}
                            className="flex-1 py-2 text-xs font-bold disabled:opacity-50"
                            style={{ clipPath: slantPoly(8), background: 'rgba(59,130,246,0.22)', color: '#93c5fd' }}
                          >
                            <span className="inline-flex items-center gap-1"><IconGuard size={12} />防御</span>
                            <span className="block text-[9px] opacity-60 mt-0.5 font-semibold">0 SP · 减半+回5SP</span>
                          </motion.button>
                        </div>
                        <ConfidantSupportRow
                          disabled={isAnimating}
                          onHealHp={(amount, name) => {
                            setActionMenuOpen(false);
                            void runAction({ kind: 'itemHeal', amount, label: `${name} 的慰藉` });
                            setConfidantSupportToast(`${name} 的慰藉 · +HP`);
                            playSound('/themea-nav.mp3', 0.5);
                            triggerLightHaptic();
                            setTimeout(() => setConfidantSupportToast(null), 1600);
                          }}
                          onRestoreSp={(amount, name) => {
                            setActionMenuOpen(false);
                            void runAction({ kind: 'itemSp', amount, label: `${name} 的余韵` });
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

              {/* 技能面板（出战位锁定当前属性） */}
              <div className="flex-1 px-4 overflow-y-auto pb-6 space-y-2">
                {availableSkills.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    提升{attrNamesMap[snap.activeMask]}等级以解锁技能
                  </p>
                ) : (
                  availableSkills.map(skill => {
                    const engine = engineRef.current!;
                    const cost = engine.skillCost(skill);
                    const canAfford = snap.sp >= cost;
                    const isDmg = skill.type === 'damage' || skill.type === 'crit' || skill.type === 'attack_boost';
                    const mappedEffect = SKILL_EFFECT_MAP[snap.activeMask]?.[skill.type];
                    const TYPE_TAG: Record<string, { label: string; color: string; bg: string }> = {
                      damage:       { label: '伤害',   color: '#fca5a5', bg: 'rgba(239,68,68,0.2)' },
                      crit:         { label: '暴击',   color: '#fbbf24', bg: 'rgba(245,158,11,0.2)' },
                      buff:         { label: '增伤',   color: '#93c5fd', bg: 'rgba(59,130,246,0.2)' },
                      debuff:       { label: '易伤',   color: '#fdba74', bg: 'rgba(249,115,22,0.2)' },
                      charge:       { label: '蓄力',   color: '#c4b5fd', bg: 'rgb(var(--color-battle-bright-rgb) / 0.2)' },
                      heal:         { label: '回复',   color: '#6ee7b7', bg: 'rgba(16,185,129,0.2)' },
                      attack_boost: { label: '攻击增益', color: '#fda4af', bg: 'rgba(244,63,94,0.2)' },
                    };
                    const baseTag = TYPE_TAG[skill.type];
                    const tagLabel = mappedEffect?.label ?? baseTag?.label;
                    const tagIcon = mappedEffect?.icon;
                    const EFFECT_HINT: Record<string, string> = {
                      buff: '下次伤害+50%',
                      debuff: mappedEffect?.hint ?? '易伤：下次+30%',
                      charge: '下次伤害×2',
                      heal: `回复${healAmount(skill.power, snap.activeMask)}HP`,
                      attack_boost: mappedEffect?.hint ?? '+6伤·3回合',
                    };
                    const weakCard = isWeakAttr && isDmg;
                    return (
                      <motion.div key={skill.name} whileTap={!canAfford || isAnimating ? undefined : { scale: 0.98 }}>
                        <SlantCard
                          as="button"
                          cut={12}
                          onClick={() => { if (canAfford && !isAnimating) { playSound('/themea-nav.mp3'); void runAction({ kind: 'skill', skill }); } }}
                          disabled={!canAfford || isAnimating}
                          edge={weakCard ? 'rgba(239,68,68,0.55)' : 'rgb(var(--color-battle-bright-rgb) / 0.4)'}
                          face={weakCard ? 'rgba(52,10,22,0.94)' : 'rgba(20,8,46,0.94)'}
                        >
                          <div className="flex items-stretch">
                            {/* 左：类型识别条（几何图标） */}
                            <div
                              className="flex w-9 flex-shrink-0 items-center justify-center"
                              style={{ background: baseTag?.bg ?? 'rgba(255,255,255,0.06)', color: baseTag?.color ?? '#fff' }}
                            >
                              <SkillGlyph type={skill.type} size={16} />
                            </div>
                            {/* 中：技名 + 描述 */}
                            <div className="min-w-0 flex-1 px-2.5 py-2">
                              <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] font-black text-white leading-tight">
                                <span className="truncate">{skill.name}</span>
                                {weakCard && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-red-400">
                                    <IconBolt size={10} />弱点
                                  </span>
                                )}
                                {skill.type !== 'damage' && baseTag && tagLabel && (
                                  <span
                                    className="px-1.5 py-0.5 text-[9px] font-bold"
                                    style={{ color: baseTag.color, background: baseTag.bg, clipPath: slantPoly(4), lineHeight: 1.3 }}
                                  >
                                    {tagIcon ? `${tagIcon} ${tagLabel}` : tagLabel}
                                  </span>
                                )}
                              </span>
                              <p className="mt-0.5 text-[11px] leading-snug text-gray-400">{skill.description}</p>
                            </div>
                            {/* 右：大数字 */}
                            <div className="flex flex-shrink-0 flex-col items-end justify-center py-1.5 pr-3">
                              {isDmg ? (
                                <>
                                  <span
                                    className={`font-black tabular-nums leading-none ${weakCard ? 'text-red-300' : (snap.chargeActive || snap.attackBuff) ? 'text-yellow-300' : 'text-white'}`}
                                    style={{ fontSize: 24, letterSpacing: '-0.03em' }}
                                  >
                                    {skill.power}
                                    {weakCard && <span className="ml-0.5 align-top text-[10px] font-black">×1.5</span>}
                                  </span>
                                  <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/35">power</span>
                                </>
                              ) : (
                                <span className="text-[11px] font-bold text-emerald-300 text-right leading-tight max-w-[88px]">
                                  {EFFECT_HINT[skill.type] ?? baseTag?.label}
                                </span>
                              )}
                              <span
                                className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-black tabular-nums"
                                style={{ clipPath: slantPoly(4), background: 'rgba(250,204,21,0.16)', color: '#fde047', lineHeight: 1.3 }}
                              >
                                SP {cost}
                                {cost === 0 && skill.spCost > 0 && <IconMask size={10} className="text-purple-300" />}
                              </span>
                            </div>
                          </div>
                        </SlantCard>
                      </motion.div>
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
