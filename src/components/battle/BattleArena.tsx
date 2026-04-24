import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { toLocalDateKey } from '@/store';
import { isInShadowTime, SKILL_EFFECT_MAP, HEAL_VALUE_BY_ATTR } from '@/constants';
import { AttributeId } from '@/types';
import { playSound } from '@/utils/feedback';
import { PersonaCreateModal } from '@/components/battle/PersonaCreateModal';
import { ShadowCreateModal } from '@/components/battle/ShadowCreateModal';
import { BattleModal } from '@/components/battle/BattleModal';
import { VictoryModal } from '@/components/battle/VictoryModal';
import { PersonaShuffleModal } from '@/components/battle/PersonaShuffleModal';

type TabKey = 'battle' | 'persona' | 'settings';

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const SKILL_TYPE_ICON: Record<string, string> = {
  damage: '⚔️',
  crit: '⚡',
  buff: '✨',
  debuff: '🔻',
  charge: '🔮',
  heal: '💚',
  attack_boost: '🔥',
};

const SKILL_TYPE_TAG: Record<string, { label: string; color: string; bg: string }> = {
  damage:       { label: '伤害', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  crit:         { label: '暴击', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  buff:         { label: '增伤', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  debuff:       { label: '易伤', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  charge:       { label: '蓄力', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  heal:         { label: '回复', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  attack_boost: { label: '攻击增益', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
};

const SKILL_EFFECT_HINT: Record<string, string> = {
  buff:         '下次×1.5',
  debuff:       '易伤×1.3',
  charge:       '下次×2',
  attack_boost: '15伤+3回合增伤',
};

export const BattleArena = () => {
  const {
    user, attributes, persona, shadow, battleState, settings,
    checkShadowHpRegen, updateSettings: saveSettings, resetBattle, equipMask, setCurrentPage,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabKey>('battle');
  const [showPersonaCreate, setShowPersonaCreate] = useState(false);
  const [showShadowCreate, setShowShadowCreate] = useState(false);
  const [showBattle, setShowBattle] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [personaCardIdx, setPersonaCardIdx] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [maskEquipAnim, setMaskEquipAnim] = useState<AttributeId | null>(null);
  const [showDefeatedLog, setShowDefeatedLog] = useState(false);
  const [cheatClicks, setCheatClicks] = useState(0);
  const [showBattleParams, setShowBattleParams] = useState(false);
  const [showPersonaShuffle, setShowPersonaShuffle] = useState(false);

  // Settings local state
  const [battleEnabled, setBattleEnabled] = useState(settings.battleEnabled !== false);
  const [playerMaxHp, setPlayerMaxHp] = useState(String(settings.battlePlayerMaxHp ?? 8));
  const [shadowAttack, setShadowAttack] = useState(String(settings.battleShadowAttack ?? 2));
  const [shadowDays, setShadowDays] = useState<number[]>(settings.battleShadowTimeDays ?? [5, 6, 0]);
  const [shadowTimeStart, setShadowTimeStart] = useState(String(settings.battleShadowTimeStart ?? 20));
  const [shadowTimeEnd, setShadowTimeEnd] = useState(String(settings.battleShadowTimeEnd ?? 7));

  const inShadowTime = isInShadowTime(
    settings.battleShadowTimeDays ?? [5, 6, 0],
    settings.battleShadowTimeStart ?? 20,
    settings.battleShadowTimeEnd ?? 7
  );

  useEffect(() => {
    checkShadowHpRegen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayKey = toLocalDateKey();
  const alreadyChallengedToday = battleState?.lastChallengeDate === todayKey;
  const canBattle = (inShadowTime && !alreadyChallengedToday) || battleState?.status === 'victory';

  const handleBattleClosed = () => {
    setShowBattle(false);
    if (battleState?.status === 'victory') {
      setShowVictory(true);
    }
  };

  const handleVictory = () => {
    setShowBattle(false);
    setShowVictory(true);
  };

  const toggleDay = (day: number) => {
    const next = shadowDays.includes(day)
      ? shadowDays.filter(d => d !== day)
      : [...shadowDays, day];
    setShadowDays(next);
    saveSettings({ battleShadowTimeDays: next });
  };

  const inputCls = "w-full rounded-xl border border-gray-200 dark:border-purple-800/40 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-400/50";

  // Persona card navigation
  const currentAttr = ATTR_IDS[personaCardIdx];
  const currentAttrPersona = persona?.attributePersonas?.[currentAttr];
  const currentSkills = persona?.skills[currentAttr] ?? [];

  return (
    <>
    <motion.div
      key="battle-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-5 pb-8"
    >
      {/* Header — matches Statistics page style */}
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setCurrentPage('dashboard')}
          className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 flex-shrink-0"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
            <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Battle</p>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">逆影战场</h2>
        </div>
        {inShadowTime && (
          <motion.span
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="flex-shrink-0 text-xs font-black px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#7c3aed', border: '1px solid rgba(139,92,246,0.3)' }}
          >
            ✦ 影时间
          </motion.span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
        {([
          { key: 'battle', label: '进入战场' },
          { key: 'persona', label: 'Persona' },
          { key: 'settings', label: '设置' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${activeTab !== tab.key ? 'text-gray-500 dark:text-gray-400' : ''}`}
            style={{
              background: activeTab === tab.key ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : 'transparent',
              color: activeTab === tab.key ? 'white' : undefined,
              boxShadow: activeTab === tab.key ? '0 2px 8px rgba(124,58,237,0.3)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
              <AnimatePresence mode="wait">

                {/* ── 进入战场 ── */}
                {activeTab === 'battle' && (
                  <motion.div
                    key="battle"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    {!persona && (
                      <div className="space-y-3">
                        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm px-4 py-3">
                          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Player</p>
                          <p className="font-black text-gray-900 dark:text-white">{user?.name ?? '旅行者'}</p>
                          <p className="text-gray-400 dark:text-gray-500 text-xs">Lv.{attributes.reduce((s, a) => s + a.level, 0)}</p>
                        </div>
                        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-8 text-center space-y-4">
                          <p className="text-4xl">⚔️</p>
                          <p className="text-gray-500 dark:text-gray-400 text-sm">你尚未召唤 Persona</p>
                          <button
                            onClick={() => setShowPersonaCreate(true)}
                            className="px-6 py-3 rounded-xl font-bold text-white transition-colors"
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                          >
                            召唤 Persona
                          </button>
                        </div>
                      </div>
                    )}

                    {persona && !shadow && (
                      <div className="space-y-3">
                        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Player</p>
                            <p className="font-black text-gray-900 dark:text-white">{user?.name ?? '旅行者'}</p>
                            <p className="text-gray-400 dark:text-gray-500 text-xs">反抗者 · Lv.{attributes.reduce((s, a) => s + a.level, 0)}</p>
                          </div>
                          {battleState && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.15)', color: '#7c3aed', border: '1px solid rgba(139,92,246,0.25)' }}>
                              SP {battleState.sp}
                            </span>
                          )}
                        </div>
                        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-6 text-center space-y-4">
                          <p className="text-gray-500 dark:text-gray-400 text-sm">尚未识破暗影，无法进入战斗</p>
                          <button
                            onClick={() => setShowShadowCreate(true)}
                            className="px-6 py-3 rounded-xl font-bold text-white transition-colors"
                            style={{ background: 'linear-gradient(135deg, #dc2626, #7c3aed)' }}
                          >
                            识破暗影
                          </button>
                        </div>
                      </div>
                    )}

                    {persona && shadow && battleState && (
                      <div className="space-y-3">
                        {/* Player info card */}
                        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Player</p>
                            <p className="font-black text-gray-900 dark:text-white">{user?.name ?? '旅行者'}</p>
                            <p className="text-gray-400 dark:text-gray-500 text-xs">Lv.{attributes.reduce((s, a) => s + a.level, 0)}</p>
                          </div>
                          <div className="text-right">
                            {persona.equippedMaskAttribute && (
                              <p className="text-purple-500 dark:text-purple-400 text-xs mb-1">🎭 {settings.attributeNames[persona.equippedMaskAttribute]}</p>
                            )}
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#7c3aed', border: '1px solid rgba(139,92,246,0.25)' }}>
                              SP {battleState.sp}
                            </span>
                          </div>
                        </div>

                        {/* Shadow info card */}
                        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-gray-900 dark:text-white">👁 {shadow.name}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626' }}>
                                Lv.{shadow.level}
                              </span>
                            </div>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(234,179,8,0.12)', color: '#b45309', border: '1px solid rgba(234,179,8,0.3)' }}>
                              弱 {settings.attributeNames[shadow.weakAttribute]}
                            </span>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
                              <span>HP</span><span>{shadow.currentHp}/{shadow.maxHp}</span>
                            </div>
                            <div className="h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                              <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(to right, #dc2626, #ef4444)' }} animate={{ width: `${(shadow.currentHp / shadow.maxHp) * 100}%` }} transition={{ duration: 0.4 }} />
                            </div>
                          </div>
                          {shadow.maxHp2 !== undefined && shadow.currentHp2 !== undefined && (
                            <div>
                              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
                                <span>HP 2</span><span>{shadow.currentHp2}/{shadow.maxHp2}</span>
                              </div>
                              <div className="h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                                <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(to right, #7c3aed, #a855f7)' }} animate={{ width: `${(shadow.currentHp2 / shadow.maxHp2) * 100}%` }} transition={{ duration: 0.4 }} />
                              </div>
                            </div>
                          )}
                        </div>

                        <motion.button
                          whileTap={canBattle ? { scale: 0.96 } : undefined}
                          onClick={() => canBattle && setShowBattle(true)}
                          disabled={!canBattle}
                          className="w-full py-3.5 rounded-2xl font-black text-white tracking-wide transition-all shadow-sm"
                          style={{
                            background: canBattle ? 'linear-gradient(135deg, #7c3aed, #dc2626)' : undefined,
                          }}
                        >
                          {canBattle ? '⚔️ 进入战斗' : alreadyChallengedToday ? (
                            <span className="text-gray-400 dark:text-gray-500">⚔️ 今日已挑战</span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">⚔️ 等待影时间</span>
                          )}
                        </motion.button>

                        {/* 已击败阴影 */}
                        {(battleState?.defeatedShadowLog?.length ?? 0) > 0 && (
                          <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                            <button
                              onClick={() => setShowDefeatedLog(v => !v)}
                              className="w-full flex items-center justify-between px-4 py-3 text-left"
                            >
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                👁 已击败阴影
                                <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                                  ({battleState!.defeatedShadowLog!.length})
                                </span>
                              </span>
                              <span className="text-gray-400 text-xs">{showDefeatedLog ? '▲' : '▼'}</span>
                            </button>
                            <AnimatePresence>
                              {showDefeatedLog && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800">
                                    {[...(battleState!.defeatedShadowLog!)].reverse().map((rec, i) => (
                                      <div key={i} className="px-4 py-2.5 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                                            {rec.shadowName}
                                          </p>
                                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                                            识破 {rec.breachDate} · 击败 {rec.defeatDate}
                                          </p>
                                        </div>
                                        <div className="flex-shrink-0 text-right space-y-0.5">
                                          <span
                                            className="inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded"
                                            style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626' }}
                                          >
                                            Lv.{rec.level}
                                          </span>
                                          <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                            历时 {rec.daysElapsed} 天
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── Persona 卡片视图 ── */}
                {activeTab === 'persona' && (
                  <motion.div
                    key="persona"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {!persona ? (
                      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                        还没有 Persona，先在「进入战场」页创建
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Navigation header */}
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => { playSound('/ui-menu.mp3', 0.5); setPersonaCardIdx(i => (i - 1 + ATTR_IDS.length) % ATTR_IDS.length); }}
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg"
                          >
                            ‹
                          </button>
                          <div className="text-center flex-1">
                            <p className="text-gray-500 dark:text-gray-400 text-xs font-semibold">
                              {settings.attributeNames[currentAttr]}
                            </p>
                            <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                              {personaCardIdx + 1} / {ATTR_IDS.length}
                            </p>
                          </div>
                          <button
                            onClick={() => { playSound('/ui-menu.mp3', 0.5); setPersonaCardIdx(i => (i + 1) % ATTR_IDS.length); }}
                            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg"
                          >
                            ›
                          </button>
                        </div>

                        {/* Navigation dots */}
                        <div className="flex justify-center gap-1.5">
                          {ATTR_IDS.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setPersonaCardIdx(i)}
                              className="rounded-full transition-all"
                              style={{
                                width: i === personaCardIdx ? 16 : 6,
                                height: 6,
                                background: i === personaCardIdx ? '#7c3aed' : 'rgba(139,92,246,0.2)',
                              }}
                            />
                          ))}
                        </div>

                        {/* Persona card */}
                        {(() => {
                          const MASK_BUFFS: Record<AttributeId, string> = {
                            knowledge: '弱点攻击额外+2伤害，日常该属性+1',
                            guts: '15%暴击率：伤害×1.5并使Shadow失衡，日常该属性+1',
                            dexterity: '每5回合获得强化回合（额外行动），日常该属性+1',
                            kindness: '体力耗尽后回复1点体力（仅一次），日常该属性+1',
                            charm: '每次战斗仅一次，使用技能不消耗SP，日常该属性+1',
                          } as Record<AttributeId, string>;
                          const isEquipped = persona.equippedMaskAttribute === currentAttr;
                          const handleEquip = () => {
                            equipMask(isEquipped ? null : currentAttr);
                            if (!isEquipped) {
                              playSound('/battle-mask-swap.mp3');
                              setMaskEquipAnim(currentAttr);
                              setTimeout(() => setMaskEquipAnim(null), 2200);
                            }
                          };
                          return (
                            <AnimatePresence mode="wait">
                              <motion.div
                                key={currentAttr}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                                className="rounded-2xl overflow-hidden relative bg-white dark:bg-gray-800/40"
                                style={{ borderColor: isEquipped ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.25)', borderWidth: 1 }}
                              >
                                {/* Equip animation overlay — 居中的毛玻璃小卡片，不遮挡整张卡片 */}
                                <AnimatePresence>
                                  {maskEquipAnim === currentAttr && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl pointer-events-none p-4">
                                      <motion.div
                                        initial={{ opacity: 0, scale: 0.85, y: 8 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 1.05 }}
                                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                                        className="rounded-2xl px-5 py-3 text-center shadow-xl max-w-[85%]"
                                        style={{
                                          background: 'rgba(139,92,246,0.78)',
                                          backdropFilter: 'blur(8px) saturate(140%)',
                                          WebkitBackdropFilter: 'blur(8px) saturate(140%)',
                                          border: '1px solid rgba(233,213,255,0.4)',
                                          boxShadow: '0 6px 24px rgba(88,28,135,0.35), 0 0 18px rgba(139,92,246,0.35)',
                                        }}
                                      >
                                        <motion.p
                                          initial={{ y: 6, opacity: 0 }}
                                          animate={{ y: 0, opacity: 1 }}
                                          transition={{ delay: 0.08 }}
                                          className="text-white font-black text-sm"
                                        >
                                          🎭 Persona 已佩戴
                                        </motion.p>
                                        <motion.p
                                          initial={{ y: 6, opacity: 0 }}
                                          animate={{ y: 0, opacity: 1 }}
                                          transition={{ delay: 0.2 }}
                                          className="text-purple-100 text-[11px] leading-snug mt-1"
                                        >
                                          {MASK_BUFFS[currentAttr]}
                                        </motion.p>
                                      </motion.div>
                                    </div>
                                  )}
                                </AnimatePresence>

                                {/* Card header */}
                                <div
                                  className="px-5 py-4 bg-purple-50 dark:bg-gray-700/50"
                                  style={{ borderBottom: isEquipped ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(139,92,246,0.15)' }}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      {currentAttrPersona ? (
                                        <>
                                          <div className="flex items-center gap-2">
                                            <p className="text-purple-500 dark:text-purple-300 text-xl font-black tracking-wide">
                                              ✦ {currentAttrPersona.name}
                                            </p>
                                            {isEquipped && (
                                              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(139,92,246,0.5)', color: '#e9d5ff' }}>
                                                佩戴中
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-gray-600 dark:text-gray-300 text-xs mt-1 leading-relaxed">
                                            {currentAttrPersona.description}
                                          </p>
                                        </>
                                      ) : (
                                        <p className="text-gray-500 dark:text-white/60 text-sm font-semibold">
                                          {settings.attributeNames[currentAttr]} Persona
                                        </p>
                                      )}
                                    </div>
                                    <motion.button
                                      whileTap={{ scale: 0.94 }}
                                      onClick={handleEquip}
                                      className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                                      style={{
                                        background: isEquipped ? 'rgba(139,92,246,0.5)' : 'rgba(139,92,246,0.1)',
                                        color: isEquipped ? '#e9d5ff' : '#7c3aed',
                                        border: isEquipped ? '1px solid rgba(139,92,246,0.7)' : '1px solid rgba(139,92,246,0.3)',
                                      }}
                                    >
                                      {isEquipped ? '已佩戴' : '佩戴'}
                                    </motion.button>
                                  </div>
                                  {isEquipped && (
                                    <p className="text-purple-600 dark:text-purple-300/60 text-xs mt-2 leading-relaxed">
                                      {MASK_BUFFS[currentAttr]}
                                    </p>
                                  )}
                                </div>

                                {/* Skills */}
                                <div className="px-4 py-3 space-y-2 bg-gray-50 dark:bg-gray-800/30">
                                  {currentSkills.length === 0 ? (
                                    <p className="text-center py-4 text-gray-400 dark:text-gray-500 text-sm">暂无技能</p>
                                  ) : (
                                    currentSkills.map((skill, i) => {
                                      const isDmg = skill.type === 'damage' || skill.type === 'crit' || skill.type === 'attack_boost';
                                      const baseTag = SKILL_TYPE_TAG[skill.type];
                                      // 特化效果（按当前属性）—— 优先展示"共鸣/护盾/洞悉"这种风味 label 和 hint
                                      const mapped = SKILL_EFFECT_MAP[currentAttr]?.[skill.type];
                                      const tagLabel = mapped?.label ?? baseTag?.label;
                                      const tagIcon = mapped?.icon;
                                      // 右侧 hint：优先特化，回落到静态；heal 用真实回血值
                                      const effectHint = mapped?.hint
                                        ?? SKILL_EFFECT_HINT[skill.type]
                                        ?? (skill.type === 'heal' ? `+${HEAL_VALUE_BY_ATTR[currentAttr] ?? 5}HP` : '');
                                      return (
                                      <div
                                        key={i}
                                        className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700"
                                      >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <span
                                            className="text-xs font-black flex-shrink-0 px-1.5 py-0.5 rounded text-purple-600 dark:text-purple-300"
                                            style={{ background: 'rgba(139,92,246,0.1)' }}
                                          >
                                            {skill.level}
                                          </span>
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <p className="text-gray-900 dark:text-white text-sm font-semibold truncate">
                                                {SKILL_TYPE_ICON[skill.type]} {skill.name}
                                              </p>
                                              {/* 只要不是纯 damage 就挂 tag 徽章 —— 特化 label 优先（比如灵巧 attack_boost 显示"⚡ 连击"而非"攻击增益"） */}
                                              {skill.type !== 'damage' && baseTag && tagLabel && (
                                                <span
                                                  className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                  style={{ color: baseTag.color, background: baseTag.bg }}
                                                >
                                                  {tagIcon ? `${tagIcon} ${tagLabel}` : tagLabel}
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-gray-500 dark:text-gray-400 text-xs truncate">{skill.description}</p>
                                          </div>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-3">
                                          {isDmg ? (
                                            <p className="text-purple-600 dark:text-purple-300 text-xs font-bold">{skill.power}</p>
                                          ) : (
                                            <p className="text-xs font-bold" style={{ color: baseTag?.color }}>
                                              {effectHint}
                                            </p>
                                          )}
                                          <p className="text-yellow-600 dark:text-yellow-400/70 text-xs">SP {skill.spCost}</p>
                                        </div>
                                      </div>
                                      );
                                    })
                                  )}
                                </div>
                              </motion.div>
                            </AnimatePresence>
                          );
                        })()}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── 设置 ── */}
                {activeTab === 'settings' && (
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-5"
                  >
                    {/* ── 战场开关 ── */}
                    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">启用逆影战场</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">关闭后将隐藏首页入口及所有战斗功能</p>
                        </div>
                        <button
                          onClick={() => {
                            const next = !battleEnabled;
                            setBattleEnabled(next);
                            saveSettings({ battleEnabled: next });
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${battleEnabled ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}`}
                        >
                          <motion.div
                            animate={{ x: battleEnabled ? 20 : 2 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
                          />
                        </button>
                      </div>
                    </div>

                    {/* ── Persona 洗牌 ── */}
                    {persona && (
                      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Persona 洗牌</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">对不满意的属性Persona进行重新匹配</p>
                          </div>
                          <button
                            onClick={() => setShowPersonaShuffle(true)}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-purple-400 transition-all"
                            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)' }}
                          >
                            洗牌
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── 战斗参数（金手指，点击"数据"标题10次后出现） ── */}
                    {showBattleParams && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase px-1">战斗参数</p>
                      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
                        {/* 玩家最大HP */}
                        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">玩家基础 HP</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">击败Shadow后会自动提升上限</p>
                          </div>
                          <input
                            type="number"
                            value={playerMaxHp}
                            onChange={(e) => setPlayerMaxHp(e.target.value)}
                            onBlur={() => {
                              const v = parseInt(playerMaxHp, 10);
                              if (!isNaN(v) && v > 0) saveSettings({ battlePlayerMaxHp: v });
                            }}
                            className={`${inputCls} !w-20 text-center`}
                            min={1}
                          />
                        </div>
                        {/* Shadow 攻击力 */}
                        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Shadow 攻击力</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">每回合对玩家造成的基础伤害</p>
                          </div>
                          <input
                            type="number"
                            value={shadowAttack}
                            onChange={(e) => setShadowAttack(e.target.value)}
                            onBlur={() => {
                              const v = parseInt(shadowAttack, 10);
                              if (!isNaN(v) && v >= 0) saveSettings({ battleShadowAttack: v });
                            }}
                            className={`${inputCls} !w-20 text-center`}
                            min={0}
                          />
                        </div>
                        {/* HP 回复 */}
                        <div className="px-4 py-3.5">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Shadow HP 每日回复</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">未挑战时每天自动恢复（按等级递增）</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Lv1: 2 · Lv2: 3 · Lv3: 4 · Lv4: 5 · Lv5: 5
                          </p>
                        </div>
                      </div>
                    </div>
                    )}

                    {/* ── 影时间 ── */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase px-1">影时间</p>
                      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm p-4 space-y-4">
                        {/* 当前状态 */}
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: inShadowTime ? '#7c3aed' : '#9ca3af' }}
                          />
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {inShadowTime
                              ? `当前正处于影时间（${settings.battleShadowTimeStart ?? 20}:00 – ${settings.battleShadowTimeEnd ?? 7}:00）`
                              : '当前不在影时间范围内'}
                          </span>
                        </div>

                        {/* 星期选择 */}
                        <div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">开放日</p>
                          <div className="flex gap-1.5">
                            {[
                              { day: 1, label: '一' }, { day: 2, label: '二' },
                              { day: 3, label: '三' }, { day: 4, label: '四' },
                              { day: 5, label: '五' }, { day: 6, label: '六' },
                              { day: 0, label: '日' },
                            ].map(({ day, label }) => {
                              const active = shadowDays.includes(day);
                              return (
                                <button
                                  key={day}
                                  onClick={() => toggleDay(day)}
                                  className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all border ${
                                    active
                                      ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                                      : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 时间范围 */}
                        <div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">时间范围</p>
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1">开始（时）</label>
                              <input
                                type="number"
                                value={shadowTimeStart}
                                onChange={(e) => setShadowTimeStart(e.target.value)}
                                onBlur={() => {
                                  const v = parseInt(shadowTimeStart, 10);
                                  if (!isNaN(v) && v >= 0 && v <= 23) saveSettings({ battleShadowTimeStart: v });
                                }}
                                className={inputCls}
                                min={0} max={23}
                              />
                            </div>
                            <span className="text-gray-300 dark:text-gray-600 font-bold mt-4">→</span>
                            <div className="flex-1">
                              <label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-1">结束（时）</label>
                              <input
                                type="number"
                                value={shadowTimeEnd}
                                onChange={(e) => setShadowTimeEnd(e.target.value)}
                                onBlur={() => {
                                  const v = parseInt(shadowTimeEnd, 10);
                                  if (!isNaN(v) && v >= 0 && v <= 23) saveSettings({ battleShadowTimeEnd: v });
                                }}
                                className={inputCls}
                                min={0} max={23}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── 数据 ── */}
                    <div className="space-y-1.5">
                      <p
                        className="text-[11px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase px-1 select-none cursor-default"
                        onClick={() => {
                          if (showBattleParams) return;
                          const next = cheatClicks + 1;
                          setCheatClicks(next);
                          if (next >= 10) setShowBattleParams(true);
                        }}
                      >
                        数据
                      </p>
                      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">重置战场数据</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                            清除所有 Persona、Shadow 和战斗记录，此操作不可撤销。
                          </p>
                        </div>
                        <div className="px-4 pb-4">
                          {!showResetConfirm ? (
                            <button
                              onClick={() => setShowResetConfirm(true)}
                              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                            >
                              重置战场数据
                            </button>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-red-500 dark:text-red-400 text-center font-semibold">确认要重置所有战场数据吗？</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setShowResetConfirm(false)}
                                  className="flex-1 py-2.5 rounded-xl text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                                >
                                  取消
                                </button>
                                <button
                                  onClick={async () => { await resetBattle(); setShowResetConfirm(false); }}
                                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                                >
                                  确认重置
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
    </motion.div>

    {/* Sub-modals */}
    <PersonaCreateModal isOpen={showPersonaCreate} onClose={() => setShowPersonaCreate(false)} />
    <ShadowCreateModal isOpen={showShadowCreate} onClose={() => setShowShadowCreate(false)} />
    <BattleModal isOpen={showBattle} onClose={handleBattleClosed} onVictory={handleVictory} />
    <VictoryModal isOpen={showVictory} onClose={() => setShowVictory(false)} />
    <PersonaShuffleModal isOpen={showPersonaShuffle} onClose={() => setShowPersonaShuffle(false)} />
    </>
  );
};
