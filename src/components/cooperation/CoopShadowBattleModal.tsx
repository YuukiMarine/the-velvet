/**
 * 联机暗影狩猎 · 战斗面板
 *
 * 两人共享 Boss HP + 共鸣印记 + COMBO 计数器，异步回合制。
 * 单日常规攻击限 1 次；总攻击（COMBO ≥ 5 解锁）每人每 Boss 限 1 次，不占当日回合。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import {
  attackCoopShadow,
  allOutAttack,
  identifyShadow,
  listAttacksFor,
  COOP_SHADOW_ALWAYS_OPEN,
} from '@/services/coopShadows';
import { sumDamagePlus } from '@/utils/confidantLevels';
import { getUserId } from '@/services/pocketbase';
import { archetypeById } from '@/constants/coopShadowPool';
import { isDailyAttackWindow } from '@/utils/moonPhase';
import type { AttributeId, CoopAttack, CoopShadow, PersonaSkill } from '@/types';
import { triggerLightHaptic, playSound } from '@/utils/feedback';
import { AllOutOverlay } from '@/components/cooperation/AllOutOverlay';
import { ShadowBossSVG } from '@/components/cooperation/ShadowBossSVG';

interface Props {
  isOpen: boolean;
  shadow: CoopShadow | null;
  partnerName: string;
  onClose: () => void;
  onVictory?: () => void;
}

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const ATTR_META: Record<AttributeId, { icon: string; color: string; label: string }> = {
  knowledge: { icon: '📘', color: '#3B82F6', label: '知识' },
  guts:      { icon: '🔥', color: '#EF4444', label: '胆量' },
  dexterity: { icon: '🎯', color: '#F59E0B', label: '灵巧' },
  kindness:  { icon: '🌿', color: '#10B981', label: '温柔' },
  charm:     { icon: '✨', color: '#EC4899', label: '魅力' },
};

const SKILL_TYPE_META: Record<PersonaSkill['type'], { label: string; color: string }> = {
  damage:       { label: '伤害',   color: '#f97316' },
  crit:         { label: '暴击',   color: '#dc2626' },
  charge:       { label: '蓄力',   color: '#8b5cf6' },
  buff:         { label: '强化',   color: '#10b981' },
  debuff:       { label: '弱化',   color: '#64748b' },
  heal:         { label: '治疗',   color: '#22d3ee' },
  attack_boost: { label: '攻击强化', color: '#f59e0b' },
};

const COMBO_THRESHOLD = 5;

export function CoopShadowBattleModal({ isOpen, shadow: shadowProp, partnerName, onClose, onVictory }: Props) {
  const persona = useAppStore(s => s.persona);
  const battleState = useAppStore(s => s.battleState);
  const attributes = useAppStore(s => s.attributes);
  const settings = useAppStore(s => s.settings);
  const confidants = useAppStore(s => s.confidants);
  const upsertCoopShadow = useCloudSocialStore(s => s.upsertCoopShadow);
  // 从 store 实时订阅 —— 上层传进来的 shadow 是创建时的快照，
  // 攻击/总攻击后的最新状态（hp / combo / all_out_by_*）要从 store 取
  const shadow = useCloudSocialStore(
    s => (shadowProp ? s.coopShadows.find(x => x.id === shadowProp.id) ?? shadowProp : null),
  );

  // 当前选中的技能属性 tab（用本地 persona 绑定属性为默认）
  const defaultAttr = persona?.equippedMaskAttribute ?? 'knowledge';
  const [selectedAttr, setSelectedAttr] = useState<AttributeId>(defaultAttr);
  useEffect(() => setSelectedAttr(defaultAttr), [defaultAttr]);

  const [attackLog, setAttackLog] = useState<CoopAttack[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flashDmg, setFlashDmg] = useState<{ n: number; isAllOut?: boolean; isCrit?: boolean } | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [allOutFiring, setAllOutFiring] = useState(false);
  // COMBO 弹字：未满 5 时，每次变化显示一行"COMBO × N"，2s 后淡出
  const [comboFlash, setComboFlash] = useState<{ n: number; key: number } | null>(null);
  const lastComboRef = useRef<number | null>(null);

  // 三段式：identifying（双方尚未完成识破）→ entering（入场动画 1.8s）→ battle
  const bothIdentified = !!(shadow?.identifiedByA && shadow?.identifiedByB);
  // 入场动画"是否已看过"标记，key 绑定到 shadow.id，存 localStorage 跨 session
  const entranceSeenKey = shadow ? `velvet_coop_shadow_entered_${shadow.id}` : null;
  const hasSeenEntrance = (): boolean => {
    if (!entranceSeenKey || typeof window === 'undefined') return false;
    return window.localStorage.getItem(entranceSeenKey) === '1';
  };
  // 初始 phase：双方识破 + 没看过入场 + 还 active → 进入场；其它按当前状态
  const initialPhase = (): 'identifying' | 'entering' | 'battle' => {
    if (!bothIdentified) return 'identifying';
    if (shadow?.status === 'active' && !hasSeenEntrance()) return 'entering';
    return 'battle';
  };
  const [phase, setPhase] = useState<'identifying' | 'entering' | 'battle'>(initialPhase());
  const prevBothRef = useRef(bothIdentified);
  const entrancePlayedRef = useRef(false);

  // 公共的"播放入场"辅助：playsound + 计时器 + 写 localStorage
  const triggerEntrance = () => {
    if (entrancePlayedRef.current) return;
    entrancePlayedRef.current = true;
    setPhase('entering');
    playSound('/battle-seal.mp3', 0.7);
    if (entranceSeenKey && typeof window !== 'undefined') {
      window.localStorage.setItem(entranceSeenKey, '1');
    }
    window.setTimeout(() => setPhase('battle'), 1800);
  };

  // 情况 A：打开时初始 phase 就是 entering（首次进入"双方识破完成"的这只 shadow）→ 触发入场
  useEffect(() => {
    if (phase === 'entering' && !entrancePlayedRef.current) {
      triggerEntrance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 情况 B：面板打开期间，bothIdentified 从 false 翻到 true
  //   (对方刚点完识破 / 我刚点完识破并恰好对方也完成)
  useEffect(() => {
    if (!shadow) return;
    if (!prevBothRef.current && bothIdentified && phase === 'identifying') {
      triggerEntrance();
    }
    prevBothRef.current = bothIdentified;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothIdentified, shadow?.id]);

  // 切换到另一个 shadow 时重置所有 phase / 入场标记
  useEffect(() => {
    if (!shadow) return;
    entrancePlayedRef.current = false;
    const both = shadow.identifiedByA && shadow.identifiedByB;
    if (!both) {
      setPhase('identifying');
    } else if (shadow.status === 'active' && !hasSeenEntrance()) {
      setPhase('entering');
      // 用 microtask 延迟触发 —— 不要在 render 里直接调
      Promise.resolve().then(triggerEntrance);
    } else {
      setPhase('battle');
    }
    prevBothRef.current = both;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shadow?.id]);

  // 拉 attack log
  useEffect(() => {
    if (!isOpen || !shadow) return;
    setLogLoading(true);
    listAttacksFor(shadow.id)
      .then(list => setAttackLog(list))
      .catch(err => {
        console.warn('[CoopShadowBattleModal] listAttacksFor failed', err);
        setAttackLog([]);
      })
      .finally(() => setLogLoading(false));
  }, [isOpen, shadow?.id]);

  const archetype = shadow ? archetypeById(shadow.shadowId) : undefined;
  const displayName = shadow?.nameOverride || archetype?.names?.[0] || '羁绊之影';
  const description = archetype?.description ?? '';

  const hpPct = shadow ? Math.max(0, Math.round((shadow.hpCurrent / shadow.hpMax) * 100)) : 0;
  const weaknessMeta = shadow ? ATTR_META[shadow.weaknessAttribute] : null;
  const pbUserId = getUserId() ?? undefined;

  const resonanceActive = !!(
    shadow?.resonanceUntil
    && shadow.resonanceUntil.getTime() > Date.now()
    && shadow.resonanceBy
    && shadow.resonanceBy !== pbUserId
  );
  const resonanceMine = !!(
    shadow?.resonanceUntil
    && shadow.resonanceUntil.getTime() > Date.now()
    && shadow.resonanceBy === pbUserId
  );

  // 判断今天是否已经攻击过（总攻击 day='allout' 不计入）
  const today = localDayKey();
  const iAlreadyAttackedToday = attackLog.some(
    a => a.attackerId === pbUserId && a.day === today,
  );

  // COMBO & 总攻击可用性
  const comboCount = shadow?.comboCount ?? 0;
  const comboReady = comboCount >= COMBO_THRESHOLD;
  const iAmA = shadow?.userAId === pbUserId;
  const myAllOutUsed = shadow ? (iAmA ? shadow.allOutByA : shadow.allOutByB) : false;
  const allOutAvailable = !!shadow && shadow.status === 'active' && comboReady && !myAllOutUsed;

  // COMBO 变化 → 未到 5 时弹一个 2s 的瞬时提示；到 5 用持久的 READY 状态
  useEffect(() => {
    if (!shadow) return;
    const prev = lastComboRef.current;
    lastComboRef.current = comboCount;
    if (prev === null) return; // 首次打开面板不触发
    if (comboCount <= prev) return; // 只对增量触发
    if (comboCount < COMBO_THRESHOLD) {
      setComboFlash({ n: comboCount, key: Date.now() });
    }
  }, [comboCount, shadow]);
  // 自动淡出
  useEffect(() => {
    if (!comboFlash) return;
    const t = window.setTimeout(() => setComboFlash(null), 2000);
    return () => window.clearTimeout(t);
  }, [comboFlash]);

  // 属性 → 当前佩戴的"子 Persona"名字（attributePersonas 里那套每属性一个的展示名）
  const resolveSubPersonaName = (attr: AttributeId): string => {
    const sub = persona?.attributePersonas?.[attr]?.name?.trim();
    return sub || persona?.name || '未命名';
  };
  const equippedName = resolveSubPersonaName(selectedAttr);

  // 当前可用技能（按选中属性筛 + level 限制 + 过滤 heal）
  // 联机模式玩家没有血条 —— heal 类技能在这里直接隐藏不让选
  const currentAttrLevel = attributes.find(a => a.id === selectedAttr)?.level ?? 1;
  const availableSkills: PersonaSkill[] = useMemo(() => {
    if (!persona) return [];
    const pool = persona.skills?.[selectedAttr] ?? [];
    return pool.filter(s => s.level <= currentAttrLevel && s.type !== 'heal');
  }, [persona, selectedAttr, currentAttrLevel]);

  // 与单人战一致的 damagePlus 加成（来自同伴 buff）
  const damagePlusMap = useMemo(() => sumDamagePlus(confidants), [confidants]);

  const windowOpen = COOP_SHADOW_ALWAYS_OPEN || isDailyAttackWindow(new Date());

  // 我是否已识破 / 是否能点识破 —— phase === 'identifying' 时用
  const myIdentified = shadow ? (iAmA ? shadow.identifiedByA : shadow.identifiedByB) : false;
  const partnerIdentified = shadow ? (iAmA ? shadow.identifiedByB : shadow.identifiedByA) : false;

  const handleIdentify = async () => {
    if (!shadow || working || myIdentified) return;
    setWorking(true);
    setErr(null);
    triggerLightHaptic();
    playSound('/battle-awaken.mp3', 0.7);
    try {
      const updated = await identifyShadow(shadow);
      upsertCoopShadow(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '识破失败');
    } finally {
      setWorking(false);
    }
  };

  const handleAttrChange = (next: AttributeId) => {
    if (next === selectedAttr) return;
    setSelectedAttr(next);
    setExpandedSkill(null);
    playSound('/ui-menu.mp3', 0.55);
  };

  const handleAttack = async (skill: PersonaSkill) => {
    if (!shadow || !persona || working) return;
    if (iAlreadyAttackedToday) {
      setErr('今天你已经对这只羁绊之影出过手了，明天再来');
      return;
    }
    if (!windowOpen) {
      setErr('月相攻击窗口已关闭（每日 18:00 – 次日 07:00 可战斗）');
      return;
    }
    if (!battleState) {
      setErr('请先在逆影战场初始化你的战斗状态');
      return;
    }
    if (battleState.sp < skill.spCost) {
      setErr(`SP 不足（需 ${skill.spCost}）`);
      return;
    }

    setWorking(true);
    setErr(null);
    triggerLightHaptic();
    // 伤害类走 /pi.mp3（打击感）；buff/debuff 类走 /penalty.mp3（状态施加感）
    const isDmgSkill =
      skill.type === 'damage'
      || skill.type === 'crit'
      || skill.type === 'charge'
      || skill.type === 'attack_boost';
    playSound(isDmgSkill ? '/pi.mp3' : '/penalty.mp3', 0.7);

    try {
      // damageRaw = skill.power + 同伴 damagePlus 加成（与单人战计算一致）
      const damageRaw = skill.power + (damagePlusMap[selectedAttr] ?? 0);

      const result = await attackCoopShadow({
        shadow,
        personaId: persona.id,
        personaName: equippedName,  // 使用当前属性对应的子 Persona 名
        skillKind: skill.type,
        skillName: skill.name,
        skillAttribute: selectedAttr,
        damageRaw,
      });

      // 联机模式玩家没有血条 —— 只扣 SP
      await useAppStore.getState().saveBattleState({
        ...battleState,
        sp: battleState.sp - skill.spCost,
      });

      upsertCoopShadow(result.updatedShadow);
      setAttackLog(prev => [result.attack, ...prev]);
      // buff/debuff 类不显示伤害浮字
      if (!result.isBuffCast) {
        setFlashDmg({ n: result.attack.damageFinal, isCrit: result.critTriggered });
        setTimeout(() => setFlashDmg(null), 1200);
      }

      if (result.defeatedNow && onVictory) {
        setTimeout(() => onVictory(), 800);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '攻击失败');
    } finally {
      setWorking(false);
    }
  };

  const handleAllOut = async () => {
    if (!shadow || !persona || working || !allOutAvailable) return;
    setWorking(true);
    setErr(null);
    // 先弹出特效
    setAllOutFiring(true);
    triggerLightHaptic();
    playSound('/battle-start.mp3', 0.85);
    // 特效末尾再补一记 "pi" —— 视觉特效收尾的落点音
    const piTimer = window.setTimeout(() => playSound('/pi.mp3', 0.75), 1100);

    try {
      const myTotalLevels = attributes.reduce((s, a) => s + (a.level ?? 1), 0);
      const result = await allOutAttack({
        shadow,
        personaId: persona.id,
        personaName: equippedName,
        myTotalLevels,
      });
      upsertCoopShadow(result.updatedShadow);
      setAttackLog(prev => [result.attack, ...prev]);
      setFlashDmg({ n: result.attack.damageFinal, isAllOut: true });
      setTimeout(() => setFlashDmg(null), 1600);

      if (result.defeatedNow && onVictory) {
        // 让特效播完再进结算
        setTimeout(() => {
          setAllOutFiring(false);
          onVictory();
        }, 1500);
      } else {
        setTimeout(() => setAllOutFiring(false), 1300);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '总攻击失败');
      setAllOutFiring(false);
      window.clearTimeout(piTimer);
    } finally {
      setWorking(false);
    }
  };

  if (!isOpen || !shadow) return null;

  return createPortal(
    <>
      <AnimatePresence>
        <motion.div
          key="coop-shadow-bg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[190] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            key="coop-shadow-modal"
            initial={{ scale: 0.96, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 10, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl overflow-hidden border"
            style={{
              background: 'linear-gradient(180deg, #120b24 0%, #0a0619 100%)',
              borderColor: 'rgba(196,181,253,0.25)',
              maxHeight: '92vh',
              overflowY: 'auto',
            }}
          >
            {/* 顶部栏 */}
            <div className="relative px-5 pt-4 pb-2 flex items-center gap-2 border-b border-white/5">
              <span className="text-[11px] font-bold tracking-[0.3em] text-purple-300/70">⚔️ COOP SHADOW HUNT</span>
              <span className="ml-auto text-[10px] text-purple-200/50">
                与 @{partnerName} 共战
              </span>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            {/* ─── 识破阶段 · 入场动画 / 战斗三选一 ─── */}
            {phase === 'identifying' ? (
              <IdentifyScreen
                shadow={shadow}
                displayName={displayName}
                description={description}
                partnerName={partnerName}
                myIdentified={myIdentified}
                partnerIdentified={partnerIdentified}
                working={working}
                err={err}
                onIdentify={handleIdentify}
              />
            ) : (
              <>
                {phase === 'entering' && (
                  <EntranceCutscene
                    shadowId={shadow.shadowId}
                    displayName={displayName}
                    line={archetype?.lines?.[0] ?? '"你们终于看清我了。"'}
                  />
                )}

                {/* Boss 展示区 */}
                <div className="px-5 pt-4 pb-3 text-center">
                  <motion.div
                    key={flashDmg?.n ?? 0}
                    initial={flashDmg ? { scale: 1.08 } : undefined}
                    animate={flashDmg ? { scale: 1 } : undefined}
                    transition={{ duration: 0.35 }}
                    className="flex justify-center mb-2 select-none"
                  >
                    <ShadowBossSVG shadowId={shadow.shadowId} size={108} intensity={1 - hpPct / 100} />
                  </motion.div>
                  <div className="text-base font-black text-purple-100">{displayName}</div>
                  {description && (
                    <div className="text-[11px] text-purple-200/60 mt-1 leading-relaxed px-2">
                      {description}
                    </div>
                  )}
                  {weaknessMeta && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-purple-100/90">
                      <span>{weaknessMeta.icon}</span>
                      <span>弱点：{settings.attributeNames[shadow.weaknessAttribute] || weaknessMeta.label}</span>
                      <span className="text-purple-200/60">×1.3 伤害 · 弱点命中 COMBO +1</span>
                    </div>
                  )}
                </div>

            {/* HP 条 */}
            <div className="px-5 pb-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-purple-200/70 mb-1">
                <span>HP</span>
                <span className="tabular-nums">
                  {shadow.hpCurrent.toLocaleString()} / {shadow.hpMax.toLocaleString()}
                </span>
              </div>
              <div className="relative h-2.5 rounded-full overflow-hidden bg-white/5 border border-white/10">
                <motion.div
                  className="absolute inset-y-0 left-0"
                  initial={false}
                  animate={{ width: `${hpPct}%` }}
                  transition={{ duration: 0.4 }}
                  style={{
                    background: hpPct < 20
                      ? 'linear-gradient(90deg, #dc2626, #f97316)'
                      : 'linear-gradient(90deg, #7c3aed, #a855f7)',
                  }}
                />
              </div>
              {flashDmg !== null && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 1.2 }}
                  animate={{ opacity: [0, 1, 0], y: [-6, -14, -22], scale: [1.2, 1.4, 1.2] }}
                  transition={{ duration: 1.2 }}
                  className={`text-center font-black pointer-events-none ${
                    flashDmg.isAllOut
                      ? 'text-rose-300 text-3xl'
                      : flashDmg.isCrit
                      ? 'text-rose-400 text-2xl'
                      : 'text-amber-300 text-lg'
                  }`}
                >
                  {flashDmg.isCrit && <span className="text-[10px] tracking-widest mr-1 align-middle">CRIT</span>}
                  -{flashDmg.n}
                </motion.div>
              )}
            </div>

            {/* COMBO 状态：
                 · 未满 5 → 不常驻 UI；变化时弹 2s "COMBO × N" 黑体小字
                 · 达成 5 → 持久 "ALL-OUT READY" 高亮标签
                 · 超过 5（理论不会，因为 all-out 不清零 combo 但不会超阈）
             */}
            <div className="px-5 pb-2">
              <AnimatePresence>
                {comboReady ? (
                  <motion.div
                    key="combo-ready"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-[0.15em] border"
                    style={{
                      background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(220,38,38,0.12))',
                      borderColor: 'rgba(252,211,77,0.5)',
                      color: '#fcd34d',
                      boxShadow: '0 0 10px -2px rgba(251,191,36,0.5)',
                    }}
                  >
                    <span>⚡</span>
                    <span>ALL-OUT READY</span>
                    <span className="tabular-nums opacity-80">COMBO × {comboCount}</span>
                  </motion.div>
                ) : comboFlash ? (
                  <motion.div
                    key={`combo-flash-${comboFlash.key}`}
                    initial={{ opacity: 0, y: 4, scale: 1.2 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.25 }}
                    className="text-[11px] font-black text-purple-100 tabular-nums"
                  >
                    COMBO × {comboFlash.n}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            {/* 共鸣印记状态 */}
            <div className="px-5 pb-2">
              {resonanceActive ? (
                <div
                  className="rounded-xl px-3 py-2 flex items-center gap-2 border text-[11px]"
                  style={{ borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.08)' }}
                >
                  <span className="text-base">🔥</span>
                  <div className="flex-1 text-amber-200">
                    <div className="font-bold">@{partnerName} 留下了共鸣印记</div>
                    <div className="text-[10px] text-amber-200/70">
                      接力出手 · 下一击伤害 ×1.5 · {formatRelative(shadow.resonanceUntil!)}
                    </div>
                  </div>
                </div>
              ) : resonanceMine ? (
                <div
                  className="rounded-xl px-3 py-2 flex items-center gap-2 border text-[11px] border-white/5 bg-white/3 text-purple-300/60"
                >
                  <span className="text-base opacity-40">✦</span>
                  <span>印记由你留下 · 等待 @{partnerName} 接力</span>
                </div>
              ) : null}
            </div>

            {/* 共享 Buff 状态 */}
            {(shadow.sharedBuffs?.attack_up || shadow.sharedBuffs?.vulnerability) && (
              <div className="px-5 pb-2 flex flex-wrap gap-1.5">
                {shadow.sharedBuffs?.attack_up && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
                    style={{
                      background: 'rgba(16,185,129,0.12)',
                      borderColor: 'rgba(16,185,129,0.45)',
                      color: '#6ee7b7',
                    }}
                    title="双方伤害 ×1.2"
                  >
                    <span>🛡</span>
                    <span>攻击强化 · 剩 {shadow.sharedBuffs.attack_up.remainingTurns} 回合</span>
                  </span>
                )}
                {shadow.sharedBuffs?.vulnerability && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
                    style={{
                      background: 'rgba(244,114,182,0.12)',
                      borderColor: 'rgba(244,114,182,0.45)',
                      color: '#f9a8d4',
                    }}
                    title="Boss 受到的伤害 ×1.15"
                  >
                    <span>💢</span>
                    <span>易伤 · 剩 {shadow.sharedBuffs.vulnerability.remainingTurns} 回合</span>
                  </span>
                )}
              </div>
            )}

            {/* 攻击日志 */}
            <div className="px-5 pb-3">
              <div className="text-[10px] font-bold tracking-wider text-purple-200/60 mb-1.5">
                战斗日志 {logLoading && <span className="opacity-60">（加载中…）</span>}
              </div>
              <div
                className="rounded-xl max-h-32 overflow-y-auto border border-white/5 bg-black/30 divide-y divide-white/5 text-[11px]"
              >
                {attackLog.length === 0 && !logLoading && (
                  <div className="px-3 py-3 text-center text-purple-200/40 italic">
                    尚无交手记录 —— 谁先出手？
                  </div>
                )}
                {attackLog.slice(0, 8).map(a => {
                  const isMe = a.attackerId === pbUserId;
                  const isAllOut = a.day === 'allout';
                  const isBuff = a.skillKind === 'buff' || a.skillKind === 'debuff';
                  return (
                    <div key={a.id} className="px-3 py-2 flex items-start gap-2">
                      <span className={`text-base ${isMe ? '' : 'opacity-80'}`}>
                        {isAllOut ? '⚡' : isBuff ? (a.skillKind === 'buff' ? '🛡' : '💢') : isMe ? '🟣' : '🟡'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] ${isMe ? 'text-purple-200' : 'text-amber-200'}`}>
                          {isMe ? '你' : `@${partnerName}`} · {a.personaName} · {a.skillName}
                        </div>
                        <div className="text-[10px] text-purple-100/50 tabular-nums flex items-center gap-1.5">
                          {isBuff ? (
                            <span className="text-emerald-300 font-bold not-tabular-nums">
                              {a.skillKind === 'buff' ? '施加攻击强化' : '施加易伤'}
                            </span>
                          ) : (
                            <>
                              <span className="font-bold">-{a.damageFinal}</span>
                              {a.weaknessBonus && <span className="text-amber-300">弱点</span>}
                              {a.resonanceBonus && <span className="text-rose-300">共鸣 ×1.5</span>}
                              {isAllOut && <span className="text-rose-200 font-black">ALL-OUT</span>}
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-purple-200/40 flex-shrink-0">
                        {isAllOut ? '' : a.day.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 错误提示 */}
            {err && (
              <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-300">
                {err}
              </div>
            )}

            {/* 总攻击按钮：不消耗当日回合数 */}
            {allOutAvailable && (
              <div className="mx-5 mb-2">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleAllOut}
                  disabled={working}
                  className="relative w-full overflow-hidden py-3 rounded-2xl font-black text-white text-sm tracking-[0.3em] border-2 disabled:opacity-40 active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #dc2626 0%, #7c3aed 50%, #2563eb 100%)',
                    borderColor: 'rgba(252,211,77,0.6)',
                    boxShadow: '0 0 24px -4px rgba(251,191,36,0.7), inset 0 0 20px rgba(255,255,255,0.1)',
                  }}
                >
                  <motion.div
                    aria-hidden
                    className="absolute inset-y-0 left-0 pointer-events-none"
                    initial={{ x: '-100%' }}
                    animate={{ x: '250%' }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.8 }}
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                      width: '40%',
                    }}
                  />
                  <span className="relative">⚡ ALL-OUT ATTACK ⚡</span>
                  <div className="text-[9px] font-normal tracking-wider opacity-80 mt-0.5">
                    COMBO × {comboCount} · 不占当日回合
                  </div>
                </motion.button>
              </div>
            )}

            {/* 今日已攻击 / 攻击窗口已关闭 */}
            {iAlreadyAttackedToday ? (
              <div className="mx-5 mb-4 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-center text-[11px] text-purple-200/70">
                你今日已出手 · 明天 18:00 后再来
                {allOutAvailable && <div className="text-amber-300/80 mt-0.5">（总攻击仍可使用）</div>}
              </div>
            ) : !windowOpen ? (
              <div className="mx-5 mb-4 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-center text-[11px] text-purple-200/70">
                月相攻击窗口已闭合（每日 18:00 – 次日 07:00）
              </div>
            ) : shadow.status !== 'active' ? (
              <div className="mx-5 mb-4 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-center text-[11px] text-purple-200/70">
                羁绊之影已{shadow.status === 'defeated' ? '封印' : '撤退'}
              </div>
            ) : !persona ? (
              <div className="mx-5 mb-4 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center text-[11px] text-rose-200">
                你还没有创建 Persona —— 先去「逆影战场」召唤一位面具
              </div>
            ) : (
              <>
                {/* Persona 提示 —— 随属性 tab 变化，去掉外框让层级不那么抢眼 */}
                <div className="mx-5 mb-2 px-1 text-[11px] text-indigo-200/90 flex items-center gap-2">
                  <span className="opacity-60">🎭</span>
                  <span className="flex-1">
                    <span className="opacity-60">装备中 ·</span> <span className="font-bold">{equippedName}</span>
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${ATTR_META[selectedAttr].color}22`, color: ATTR_META[selectedAttr].color }}
                  >
                    {ATTR_META[selectedAttr].icon} {settings.attributeNames[selectedAttr] || ATTR_META[selectedAttr].label}
                  </span>
                </div>

                {/* 属性 tabs */}
                <div className="mx-5 mb-2 flex gap-1 p-1 rounded-xl bg-black/30">
                  {ATTR_IDS.map(id => {
                    const meta = ATTR_META[id];
                    const active = id === selectedAttr;
                    const name = settings.attributeNames[id] || meta.label;
                    return (
                      <button
                        key={id}
                        onClick={() => handleAttrChange(id)}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                        style={{
                          background: active ? `${meta.color}28` : 'transparent',
                          color: active ? meta.color : 'rgba(196,181,253,0.5)',
                          border: active ? `1px solid ${meta.color}55` : '1px solid transparent',
                        }}
                      >
                        {meta.icon} {name.slice(0, 2)}
                      </button>
                    );
                  })}
                </div>

                {/* 技能网格 */}
                <div className="mx-5 mb-4 grid grid-cols-2 gap-2">
                  {availableSkills.length === 0 && (
                    <div className="col-span-2 text-center text-[11px] text-purple-200/50 py-3">
                      此属性尚无可用技能（需要提升等级）
                    </div>
                  )}
                  {availableSkills.map(skill => {
                    const affordable = (battleState?.sp ?? 0) >= skill.spCost;
                    const typeMeta = SKILL_TYPE_META[skill.type];
                    const isExpanded = expandedSkill === skill.name;
                    // 是否造成伤害 —— 和服务层 isDamagingKind 保持一致
                    const isDamagingType =
                      skill.type === 'damage'
                      || skill.type === 'crit'
                      || skill.type === 'charge'
                      || skill.type === 'attack_boost';
                    const wouldHitWeakness = isDamagingType && selectedAttr === shadow.weaknessAttribute;
                    const wouldEatResonance = resonanceActive && isDamagingType;
                    const displayPower = skill.power + (damagePlusMap[selectedAttr] ?? 0);

                    return (
                      <SkillCard
                        key={skill.name}
                        skill={skill}
                        displayPower={displayPower}
                        typeMeta={typeMeta}
                        affordable={affordable}
                        disabled={!affordable || working}
                        isExpanded={isExpanded}
                        isDamagingType={isDamagingType}
                        wouldHitWeakness={wouldHitWeakness}
                        wouldEatResonance={wouldEatResonance}
                        onToggleExpand={() => setExpandedSkill(isExpanded ? null : skill.name)}
                        onFire={() => void handleAttack(skill)}
                      />
                    );
                  })}
                </div>
              </>
            )}
              </>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* 总攻击全屏特效 */}
      <AllOutOverlay isFiring={allOutFiring} personaName={equippedName} />
    </>,
    document.body,
  );
}

// ── 子组件 · 技能卡 ─────────────────────────────────────

interface SkillCardProps {
  skill: PersonaSkill;
  displayPower: number;
  typeMeta: { label: string; color: string };
  affordable: boolean;
  disabled: boolean;
  isExpanded: boolean;
  /** 是否伤害类 —— 决定是显示 PWR 框还是"施加 N 回合"提示 */
  isDamagingType: boolean;
  wouldHitWeakness: boolean;
  wouldEatResonance: boolean;
  onToggleExpand: () => void;
  onFire: () => void;
}

function SkillCard({
  skill,
  displayPower,
  typeMeta,
  affordable,
  disabled,
  isExpanded,
  isDamagingType,
  wouldHitWeakness,
  wouldEatResonance,
  onToggleExpand,
  onFire,
}: SkillCardProps) {
  return (
    // 外层 relative + overflow-visible → 让角标可以伸出圆角外
    <div className="relative pt-1.5">
      {/* 内层才是"被圆角裁切"的卡片体 */}
      <div
        className="relative rounded-xl border overflow-hidden transition-all"
        style={{
          background: affordable ? 'rgba(124,58,237,0.12)' : 'rgba(80,80,100,0.12)',
          borderColor: affordable ? 'rgba(196,181,253,0.3)' : 'rgba(196,181,253,0.1)',
        }}
      >
        {/* 主体：点击释放技能 */}
        <button
          onClick={onFire}
          disabled={disabled}
          className="w-full px-3 pt-2.5 pb-2 text-left disabled:opacity-50 active:scale-95 transition-transform"
        >
          {/* 第一行：技能名 + 类型 tag */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[12px] font-bold text-purple-100 truncate flex-1">
              {skill.name}
            </span>
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap"
              style={{ background: `${typeMeta.color}28`, color: typeMeta.color }}
            >
              {typeMeta.label}
            </span>
          </div>

          {/* 第二行：伤害（醒目） 或 buff 时长 + SP */}
          <div className="flex items-center justify-between gap-2">
            {isDamagingType ? (
              <div
                className="inline-flex items-baseline gap-0.5 px-2 py-0.5 rounded-md tabular-nums"
                style={{
                  background: 'linear-gradient(90deg, rgba(245,158,11,0.25), rgba(245,158,11,0.08))',
                  border: '1px solid rgba(245,158,11,0.4)',
                  boxShadow: '0 0 8px -2px rgba(245,158,11,0.4)',
                }}
              >
                <span className="text-[9px] text-amber-200/60 font-bold">PWR</span>
                <span className="text-sm font-black text-amber-200">{displayPower}</span>
              </div>
            ) : (
              <div
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                style={{
                  background: 'rgba(16,185,129,0.15)',
                  border: '1px solid rgba(16,185,129,0.4)',
                  color: '#6ee7b7',
                }}
              >
                <span>持续</span>
                <span className="tabular-nums">3</span>
                <span>回合</span>
              </div>
            )}
            <span className="text-[10px] text-cyan-300 tabular-nums flex-shrink-0">
              SP {skill.spCost}
            </span>
          </div>
        </button>

        {/* 简介下拉 */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          className="w-full flex items-center justify-center gap-1 py-1 border-t border-white/5 text-[9px] text-purple-200/50 hover:text-purple-100 hover:bg-white/5 transition"
        >
          <span>{isExpanded ? '收起' : '简介'}</span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.18 }}
            className="inline-block"
          >
            ▼
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="px-3 py-2 text-[10px] leading-relaxed text-purple-200/80 bg-black/30 border-t border-white/5">
                {skill.description || '（未填写描述）'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 角标（放在外层 → 不会被 overflow-hidden 裁切） */}
      {wouldHitWeakness && (
        <span
          className="absolute top-0 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap z-10 shadow"
          style={{ background: '#f59e0b', color: '#1a0b2e' }}
        >
          弱点
        </span>
      )}
      {wouldEatResonance && (
        <span
          className="absolute top-0 left-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-md whitespace-nowrap z-10 shadow"
          style={{ background: '#f43f5e', color: '#fff' }}
        >
          共鸣
        </span>
      )}
    </div>
  );
}

// ── 子组件 · 识破屏 ─────────────────────────────────────

interface IdentifyScreenProps {
  shadow: CoopShadow;
  displayName: string;
  description: string;
  partnerName: string;
  myIdentified: boolean;
  partnerIdentified: boolean;
  working: boolean;
  err: string | null;
  onIdentify: () => void;
}

function IdentifyScreen({
  shadow,
  description,
  partnerName,
  myIdentified,
  partnerIdentified,
  working,
  err,
  onIdentify,
}: IdentifyScreenProps) {
  return (
    <div className="px-5 pt-4 pb-5">
      {/* 剪影 —— 未识破时用深紫遮罩 */}
      <div className="relative flex justify-center mb-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          style={{
            filter: 'brightness(0.35) blur(0.5px)',
          }}
        >
          <ShadowBossSVG shadowId={shadow.shadowId} size={112} intensity={0.3} />
        </motion.div>
        {/* 阴影扰动光晕 */}
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 60%)',
            mixBlendMode: 'screen',
          }}
        />
      </div>

      {/* 标题：未识破时名字被遮 */}
      <div className="text-center mb-3">
        <div className="text-base font-black text-purple-100/30 tracking-[0.35em] select-none">
          ? ? ? ? ? ?
        </div>
        <div className="text-[11px] text-purple-200/60 mt-1.5 leading-relaxed px-2">
          {description || '一只躲在阴影里的羁绊之影。'}
        </div>
      </div>

      {/* 双方识破状态行 */}
      <div
        className="rounded-2xl border px-4 py-3"
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(168,85,247,0.06))',
          borderColor: 'rgba(196,181,253,0.28)',
        }}
      >
        <div className="text-[10px] font-bold tracking-[0.25em] text-purple-200/70 mb-2 text-center">
          识破进度 · BREAK THROUGH
        </div>
        <div className="flex items-center justify-around text-[11px]">
          <IdentifyPill label="你" done={myIdentified} />
          <span className="text-purple-300/40 text-lg">·</span>
          <IdentifyPill label={`@${partnerName}`} done={partnerIdentified} />
        </div>
      </div>

      {/* 错误 */}
      {err && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[11px] text-rose-300">
          {err}
        </div>
      )}

      {/* 主按钮 */}
      <div className="mt-4">
        {!myIdentified ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onIdentify}
            disabled={working}
            className="relative w-full overflow-hidden py-3.5 rounded-2xl font-black text-white text-sm tracking-[0.28em] border-2 disabled:opacity-40 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 60%, #a855f7 100%)',
              borderColor: 'rgba(196,181,253,0.55)',
              boxShadow: '0 0 22px -4px rgba(168,85,247,0.6), inset 0 0 18px rgba(255,255,255,0.08)',
            }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-y-0 left-0 pointer-events-none"
              initial={{ x: '-100%' }}
              animate={{ x: '250%' }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                width: '40%',
              }}
            />
            <span className="relative">🌑 识破 SHADOW</span>
          </motion.button>
        ) : (
          <div
            className="w-full py-3.5 rounded-2xl border-2 text-center text-sm font-bold tracking-[0.15em]"
            style={{
              background: 'rgba(16,185,129,0.1)',
              borderColor: 'rgba(16,185,129,0.4)',
              color: '#6ee7b7',
            }}
          >
            ✓ 你已识破 · 等待 @{partnerName} 一起揭开真相
          </div>
        )}
      </div>
      {/* 无关键字一句 flavor */}
      <div className="mt-3 text-[10px] text-center text-purple-200/40 leading-relaxed">
        两人都识破后，这只影的真身才会现形。
      </div>
    </div>
  );
}

function IdentifyPill({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-black border"
        style={{
          background: done ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.05)',
          borderColor: done ? 'rgba(16,185,129,0.6)' : 'rgba(196,181,253,0.25)',
          color: done ? '#6ee7b7' : 'rgba(196,181,253,0.5)',
        }}
      >
        {done ? '✓' : '…'}
      </div>
      <span className={`text-[11px] ${done ? 'text-emerald-300' : 'text-purple-200/50'}`}>
        {label}
      </span>
    </div>
  );
}

// ── 子组件 · 入场动画 ───────────────────────────────────

interface EntranceCutsceneProps {
  shadowId: string;
  displayName: string;
  line: string;
}

function EntranceCutscene({ shadowId, displayName, line }: EntranceCutsceneProps) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 top-[60px] bottom-0 z-[50] pointer-events-none flex flex-col items-center justify-center px-5"
      style={{ background: 'radial-gradient(circle at center, rgba(40,20,80,0.7) 0%, rgba(10,5,25,0.92) 70%)' }}
    >
      {/* 主 Shadow 放大登场 */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
        animate={{
          scale: [0.4, 1.25, 1.0],
          opacity: [0, 1, 1],
          rotate: [-8, 4, 0],
        }}
        transition={{ duration: 1.2, times: [0, 0.55, 1], ease: 'easeOut' }}
      >
        <ShadowBossSVG shadowId={shadowId} size={132} intensity={1} />
      </motion.div>
      {/* 名字揭示（字幕式） */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: [0, 1, 1], y: [8, 0, 0] }}
        transition={{ duration: 1, times: [0, 0.4, 1], delay: 0.6 }}
        className="mt-4 text-center"
      >
        <div
          className="text-xl font-black tracking-[0.1em]"
          style={{
            color: '#f5e6ff',
            textShadow: '0 0 14px rgba(168,85,247,0.7)',
          }}
        >
          {displayName}
        </div>
      </motion.div>
      {/* 台词（浮入） */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: [0, 1, 1], y: [6, 0, 0] }}
        transition={{ duration: 0.9, times: [0, 0.5, 1], delay: 0.95 }}
        className="mt-3 text-[12px] text-purple-100/80 italic text-center max-w-xs"
        style={{ textShadow: '0 0 8px rgba(0,0,0,0.9)' }}
      >
        {line}
      </motion.div>
    </motion.div>
  );
}

// ── helpers ────────────────────────────────────────────────

function localDayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRelative(dt: Date): string {
  const diff = dt.getTime() - Date.now();
  if (diff <= 0) return '已失效';
  const hrs = Math.floor(diff / 3600_000);
  const mins = Math.floor((diff % 3600_000) / 60_000);
  if (hrs > 0) return `还剩 ${hrs}h ${mins}m`;
  return `还剩 ${mins}m`;
}
