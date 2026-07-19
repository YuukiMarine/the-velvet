import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { toLocalDateKey } from '@/store';
import { isInShadowTime, SKILL_EFFECT_MAP } from '@/constants';
import { healAmount, BOSS_ATTACK_BY_LEVEL } from '@/battle/numbers';
import { AttributeId, MobSpec, StratumNode } from '@/types';
import { absoluteFloor } from '@/battle/tower';
import { lootLabel } from '@/battle/loot';
import { rollPrepDraw, type PrepBuff } from '@/battle/preparation';
import { generateSummonLines, generateRecapComment } from '@/utils/battleAI';
import { playSound } from '@/utils/feedback';
import { BackButton } from '@/components/BackButton';
import { PageTitle } from '@/components/PageTitle';
import { PersonaCreateModal } from '@/components/battle/PersonaCreateModal';
import { StratumRevealModal } from '@/components/battle/StratumRevealModal';
import { BattleModal } from '@/components/battle/BattleModal';
import { VictoryModal } from '@/components/battle/VictoryModal';
import { PersonaShuffleModal } from '@/components/battle/PersonaShuffleModal';
import { TowerScreen } from '@/components/battle/TowerScreen';
import { InfiltrationOverlay } from '@/components/battle/InfiltrationOverlay';
import { TowerRecapModal } from '@/components/battle/TowerModals';
import { ArsenalModal, ShadowArchiveModal, MasteryStars } from '@/components/battle/ArsenalModal';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, P3PageHeader, ShatteredStar, slantClip } from '@/components/p3r/kit';

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
  charge:       { label: '蓄力', color: 'rgb(var(--color-battle-bright-rgb))', bg: 'rgb(var(--color-battle-bright-rgb) / 0.12)' },
  heal:         { label: '回复', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  attack_boost: { label: '攻击增益', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
};

const SKILL_EFFECT_HINT: Record<string, string> = {
  buff:         '下次+50%',
  debuff:       '易伤+30%',
  charge:       '下次×2',
  attack_boost: '+6伤·3回合',
};

export const BattleArena = () => {
  const {
    user, attributes, persona, shadow, battleState, settings, stratum,
    checkShadowHpRegen, updateSettings: saveSettings, resetBattle, equipMask, setCurrentPage,
    saveBattleState, enterTowerToday, completeTowerNode, deepenStratumIfNewWeek,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabKey>('battle');
  // P3R（蓝频道）：p3-battle-reference-v2 形态；battleCard = 全页 13 处卡壳的统一开关
  const p3 = useUiChannel() === 'p3';
  const battleCard = p3 ? 'p3r-card' : 'rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm';
  const [showPersonaCreate, setShowPersonaCreate] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [showBattle, setShowBattle] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [personaCardIdx, setPersonaCardIdx] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [maskEquipAnim, setMaskEquipAnim] = useState<AttributeId | null>(null);
  const [showArsenal, setShowArsenal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [cheatClicks, setCheatClicks] = useState(0);
  const [showBattleParams, setShowBattleParams] = useState(false);
  const [showPersonaShuffle, setShowPersonaShuffle] = useState(false);
  // ── 高塔（批2） ──
  const [activeEncounter, setActiveEncounter] = useState<{ mob: MobSpec; level: number; nodeId: string } | null>(null);
  const [recap, setRecap] = useState<'descend' | 'defeat' | 'clear' | null>(null);
  const [recapComment, setRecapComment] = useState<string | null>(null);
  const [spToast, setSpToast] = useState<string | null>(null);
  const [deepenNotice, setDeepenNotice] = useState(false);
  const [towerOpen, setTowerOpen] = useState(false);
  const [infiltrating, setInfiltrating] = useState(false);
  const [prepChoice, setPrepChoice] = useState<PrepBuff[] | null>(null);

  // Settings local state
  const [battleEnabled, setBattleEnabled] = useState(settings.battleEnabled !== false);
  const [playerMaxHp, setPlayerMaxHp] = useState(String(settings.battlePlayerMaxHp ?? 40));
  const [attackScale, setAttackScale] = useState(String(settings.battleAttackScale ?? 100));
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
    // 批3：熟练度/解锁字段惰性迁移（存量技能不回锁，unlocked 缺省按当前属性等级置位）
    void useAppStore.getState().refreshSkillUnlocks();
    // 批3 §4.3：召唤台词懒生成——一次批量 5 条并缓存；无 Key 静默留空（cut-in 走模板）
    void (async () => {
      const { persona: p, settings: st, savePersona } = useAppStore.getState();
      if (!p || p.summonLines || !p.attributePersonas) return;
      const lines = await generateSummonLines(
        st,
        st.attributeNames as Record<AttributeId, string>,
        p.attributePersonas as Record<AttributeId, { name: string; description: string }>,
      ).catch(() => null);
      if (lines) {
        const cur = useAppStore.getState().persona;
        if (cur && !cur.summonLines) await savePersona({ ...cur, summonLines: lines });
      }
    })();
    // 月相日（周一）：未通关区层异变加深——主影回满 + 加深计数
    void deepenStratumIfNewWeek().then(deepened => {
      if (deepened) {
        setDeepenNotice(true);
        playSound('/battle-impact.mp3', 0.5);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 胜利结算恢复：status 'victory' 持久化后（刷新 / PWA 被杀）重新拉起 VictoryModal，
  // 避免奖励悬空、Shadow 尸体被每日回血复活后还得重打一遍
  useEffect(() => {
    if (battleState?.status === 'victory' && !showBattle && !showVictory) {
      setShowVictory(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleState?.status]);

  const todayKey = toLocalDateKey();
  const enteredToday = battleState?.lastChallengeDate === todayKey;
  const sessionActive = !!enteredToday && battleState?.status !== 'session_end' && battleState?.status !== 'victory';
  const stratumCleared = stratum?.status === 'cleared';
  const nextStratumLevel = stratum ? Math.min(5, stratum.level + 1) : 1;
  const towerTopReached = !!stratumCleared && (stratum?.level ?? 0) >= 5;

  const showSpToast = (text: string) => {
    setSpToast(text);
    setTimeout(() => setSpToast(null), 1900);
  };

  const handleBattleClosed = () => {
    setShowBattle(false);
    setActiveEncounter(null);
    if (battleState?.status === 'victory') {
      setShowVictory(true);
    }
  };

  const handleVictory = async () => {
    setShowBattle(false);
    // 主影节点结算：SP 即发 + 标记通关节点 + 批3 心魔战利品（必得遗物 / 35% 共鸣链 / 25% 誓约石）
    const bossNode = stratum?.nodes.find(n => n.type === 'boss');
    if (bossNode && !bossNode.cleared) {
      const sp = await completeTowerNode(bossNode.id);
      const drops = await useAppStore.getState().rollTowerLoot('boss', 1);
      const lootText = drops.map(lootLabel).join(' · ');
      showSpToast(`👁️ 心魔讨伐${sp > 0 ? ` · +${sp} SP` : ''}${lootText ? ` · ${lootText}` : ''}`);
      // 批4 §6.8：通关类壮举——首区层通关 / 一夜通层（本 session 从区层入口爬到心魔）
      const st4 = useAppStore.getState();
      void st4.recordBattleFeat('first_clear');
      if (st4.battleState?.towerSession?.startFloor === 0) void st4.recordBattleFeat('night_climb');
    }
    setShowVictory(true);
  };

  // ── 塔屏委托：开战请求（Shadow/强敌/心魔/事件遭遇战） ──
  const handleRequestBattle = (node: StratumNode, eventMob?: MobSpec) => {
    if (!stratum) return;
    if (node.type === 'boss' && !eventMob) {
      setShowBattle(true);
      return;
    }
    const mob = eventMob ?? node.mob;
    if (!mob) return;
    setActiveEncounter({ mob, level: stratum.level, nodeId: node.id });
    setShowBattle(true);
  };

  const handleEncounterEnd = async (outcome: 'victory' | 'defeat' | 'retreat') => {
    const enc = activeEncounter;
    setShowBattle(false);
    setActiveEncounter(null);
    if (!enc) return;
    if (outcome === 'victory') {
      const sp = await completeTowerNode(enc.nodeId, { wasMob: true });
      // 批3：强敌 60% 掉战利品
      let lootText = '';
      if (enc.mob.tier === 'elite') {
        const node = stratum?.nodes.find(n => n.id === enc.nodeId);
        const floorRatio = stratum ? (node?.floor ?? 1) / Math.max(1, stratum.floors) : 0.5;
        const drops = await useAppStore.getState().rollTowerLoot('elite', floorRatio);
        lootText = drops.map(lootLabel).join(' · ');
      }
      if (sp > 0 || lootText) showSpToast(`⚔️ 节点攻略${sp > 0 ? ` · +${sp} SP` : ''}${lootText ? ` · ${lootText}` : ''}`);
    } else if (outcome === 'defeat') {
      setRecap('defeat');
    }
    // retreat：节点未清，可重试
  };

  const handleDescend = async () => {
    const bs = useAppStore.getState().battleState;
    // 批3：下塔撤离 = 「记仇」词缀与记忆台词的事实源
    if (bs) await saveBattleState({ ...bs, status: 'session_end', everRetreatedDown: true });
    setRecap('descend');
  };

  // ── 潜入战场（验收反馈 #4）：首次进入播潜入演出并开 session；session 中直接回塔 ──
  const canInfiltrate = sessionActive || (!enteredToday && inShadowTime);
  const todayLocked = !!enteredToday && !sessionActive && !stratumCleared;

  const handleInfiltrate = () => {
    if (!canInfiltrate) return;
    playSound('/ui-menu.mp3', 0.6);
    if (sessionActive) {
      setTowerOpen(true); // session 进行中：直接回塔，不重播演出
    } else {
      setInfiltrating(true);
    }
  };

  const handleInfiltrationDone = async () => {
    setInfiltrating(false);
    await enterTowerToday();
    setTowerOpen(true);
    // 批4 §6.2 备战抽取（每次登塔一次）：今日完成待办 ≥3 → 抽 2 选 1，否则抽 1 直接生效
    const st = useAppStore.getState();
    const ts = st.battleState?.towerSession;
    if (ts && ts.dateKey === toLocalDateKey() && !ts.prepDrawnId) {
      const todayDone = st.todoCompletions
        .filter(tc => tc.date === toLocalDateKey())
        .reduce((s, tc) => s + (tc.count ?? 1), 0);
      const options = rollPrepDraw(todayDone >= 3 ? 2 : 1);
      if (options.length >= 2) {
        setPrepChoice(options);
      } else if (options.length === 1) {
        await st.applyPrepBuff(options[0]);
        showSpToast(`🎴 备战抽取 · ${options[0].label}`);
      }
    }
  };

  // session 结束（败退/下塔/心魔讨伐）→ 自动收起塔屏，回顾在战场页弹出
  useEffect(() => {
    if (towerOpen && !sessionActive) setTowerOpen(false);
  }, [towerOpen, sessionActive]);

  // 批4 §6.6 黑猫败因信：败退当晚后台写信（AI/模板兜底）→ 下次打开黑猫时投递
  useEffect(() => {
    if (recap === 'defeat') void useAppStore.getState().deliverDefeatLetter();
  }, [recap]);

  // 批3 §7.3 影之评语：回顾弹出时后台取一句 AI 点评（可在设置关闭；无 Key 静默跳过）
  useEffect(() => {
    if (!recap) { setRecapComment(null); return; }
    const { settings: st, battleState: bs, stratum: stm } = useAppStore.getState();
    if (st.battleCommentEnabled === false || !stm) return;
    const ts = bs?.towerSession;
    let alive = true;
    void generateRecapComment(st, {
      reason: recap,
      floors: ts?.floorsClimbed ?? 0,
      mobs: ts?.mobsDefeated ?? 0,
      damage: ts?.damageDealt ?? 0,
      maxHit: ts?.maxSingleHit ?? 0,
      weakHits: ts?.weaknessHits ?? 0,
      stratumName: stm.name,
    }).then(c => { if (alive && c) setRecapComment(c); }).catch(() => undefined);
    return () => { alive = false; };
  }, [recap]);

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

  // ── P3R 玩家卡（p3-battle 设计稿：PLAYER eyebrow + 名 + Lv + HP 青条 + SP 黄斜块段）──
  // 未开战时 HP 取设置上限的满值、SP 取 0——这是玩家的真实静息状态，不是演出假数据
  const p3Hp = battleState?.playerHp ?? (parseInt(playerMaxHp, 10) || 8);
  const p3HpMax = battleState?.playerMaxHp ?? (parseInt(playerMaxHp, 10) || 8);
  const p3Sp = battleState?.sp ?? 0;
  const renderPlayerCardP3 = (extra?: React.ReactNode) => (
    <div className="p3r-card px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.18em]" style={{ color: P3R.blue }}>PLAYER</p>
          <p className="truncate text-[20px] font-black leading-tight" style={{ color: P3R.ink }}>{user?.name ?? '旅行者'}</p>
          <p className="text-[13px] font-black" style={{ color: P3R.blue }}>Lv.{attributes.reduce((s, a) => s + a.level, 0)}</p>
        </div>
        {extra}
      </div>
      <div className="mt-2.5 flex items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-[11px] font-black" style={{ color: P3R.ink }}>HP</span>
          <div className="h-[7px] min-w-0 flex-1 overflow-hidden" style={{ background: '#e4eef5', clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)' }}>
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, (p3Hp / Math.max(1, p3HpMax)) * 100))}%`, background: 'linear-gradient(90deg, #35d1e8, #7fd8ee)' }} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] font-black" style={{ color: P3R.ink }}>SP</span>
          <span className="flex gap-[3px]" aria-hidden>
            {[0, 1, 2].map(k => (
              <span key={k} className="h-[10px] w-[13px]" style={{ background: k < Math.min(3, p3Sp) ? '#ffd23e' : '#e4eef5', clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
            ))}
          </span>
          <span className="text-[11px] font-black tabular-nums" style={{ color: p3Sp > 0 ? '#c79a00' : P3R.grey }}>{p3Sp}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
    <P3RPage active={p3}>
    <motion.div
      key="battle-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative space-y-5 ${p3 ? 'pb-10' : 'pb-8'}`}
    >
      {p3 && <GhostWords words={['BATTLE']} className="right-[-26px] top-[-14px] text-right text-[72px]" />}

      {/* Header — 宫格子页页头归一 PageTitle 制式（审计 S6），返回归一 → 菜单 */}
      {p3 ? (
        <div className="relative">
          {/* 标题左上小蓝斜片（设计稿装饰） */}
          <span aria-hidden className="absolute left-[2px] top-[30px] h-[12px] w-[22px]" style={{ background: P3R.blue, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
          <div className="flex items-end justify-between gap-3">
            <P3PageHeader title="逆影战场" onBack={() => setCurrentPage('menu')} className="pt-2" />
            {inShadowTime && (
              <motion.span
                animate={{ opacity: [1, 0.55, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="mb-2 flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[12px] font-black text-white"
                style={{ clipPath: slantClip(8), background: P3R.blue }}
              >
                <span aria-hidden className="inline-block h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent" style={{ borderTopColor: '#fff' }} />
                影时间
              </motion.span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <BackButton onClick={() => setCurrentPage('menu')} className="mt-1 -ml-1" />
          <div className="flex-1 min-w-0">
            <PageTitle title="逆影战场" en="Battle" />
          </div>
          {inShadowTime && (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="flex-shrink-0 mt-1 text-xs font-black px-2.5 py-1 rounded-lg"
              style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.15)', color: 'rgb(var(--color-battle-rgb))', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.3)' }}
            >
              ✦ 影时间
            </motion.span>
          )}
        </div>
      )}

      {/* Tabs（p3：斜块三格——选中蓝斜块白字+洋红角 / 未选白斜块黑字） */}
      {p3 ? (
        <div className="relative flex items-stretch">
          {([
            { key: 'battle', label: '进入战场' },
            { key: 'persona', label: 'Persona' },
            { key: 'settings', label: '设置' },
          ] as const).map((tab, i) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className="relative flex-1 py-3 text-center text-[16px] font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff]"
                style={{
                  clipPath: slantClip(12),
                  background: active ? P3R.blue : P3R.panel,
                  color: active ? '#fff' : P3R.ink,
                  marginLeft: i > 0 ? -7 : 0,
                  zIndex: active ? 2 : 1,
                }}
              >
                {tab.label}
                {active && (
                  <span aria-hidden className="absolute bottom-0 right-3 h-[8px] w-[20px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-1 p-1 rounded-2xl" style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.08)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.15)' }}>
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
                background: activeTab === tab.key ? 'linear-gradient(135deg, rgb(var(--color-battle-rgb)), rgb(var(--color-battle-indigo-rgb)))' : 'transparent',
                color: activeTab === tab.key ? 'white' : undefined,
                boxShadow: activeTab === tab.key ? '0 2px 8px rgb(var(--color-battle-rgb) / 0.3)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

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
                      p3 ? (
                        <div className="space-y-3">
                          {renderPlayerCardP3()}
                          {/* 设计稿：碎裂星徽直接坐在水面上（无卡壳）+ 蓝青渐变大梯形召唤钮 */}
                          <div className="space-y-6 pt-8 pb-4 text-center">
                            <ShatteredStar />
                            <p className="text-[16px] font-black" style={{ color: P3R.ink }}>你尚未召唤 Persona</p>
                            <button
                              type="button"
                              onClick={() => setShowPersonaCreate(true)}
                              className="mx-auto block w-[82%] py-4 text-[24px] font-black tracking-wider text-white active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1b57ff] focus-visible:ring-offset-2"
                              style={{ clipPath: 'polygon(9% 0, 100% 0, 91% 100%, 0 100%)', background: 'linear-gradient(135deg, #1b57ff 30%, #35d1e8)' }}
                            >
                              召唤 Persona
                            </button>
                          </div>
                        </div>
                      ) : (
                      <div className="space-y-3">
                        <div className={`${battleCard} px-4 py-3`}>
                          <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Player</p>
                          <p className="font-black text-gray-900 dark:text-white">{user?.name ?? '旅行者'}</p>
                          <p className="text-gray-400 dark:text-gray-500 text-xs">Lv.{attributes.reduce((s, a) => s + a.level, 0)}</p>
                        </div>
                        <div className={`${battleCard} p-8 text-center space-y-4`}>
                          <p className="text-4xl">⚔️</p>
                          <p className="text-gray-500 dark:text-gray-400 text-sm">你尚未召唤 Persona</p>
                          <button
                            onClick={() => setShowPersonaCreate(true)}
                            className="px-6 py-3 rounded-xl font-bold text-white transition-colors"
                            style={{ background: 'linear-gradient(135deg, rgb(var(--color-battle-rgb)), rgb(var(--color-battle-indigo-rgb)))' }}
                          >
                            召唤 Persona
                          </button>
                        </div>
                      </div>
                      )
                    )}

                    {persona && !stratum && (
                      <div className="space-y-3">
                        {p3 ? renderPlayerCardP3() : (
                        <div className={`${battleCard} px-4 py-3 flex items-center justify-between`}>
                          <div>
                            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Player</p>
                            <p className="font-black text-gray-900 dark:text-white">{user?.name ?? '旅行者'}</p>
                            <p className="text-gray-400 dark:text-gray-500 text-xs">反抗者 · Lv.{attributes.reduce((s, a) => s + a.level, 0)}</p>
                          </div>
                          {battleState && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.15)', color: 'rgb(var(--color-battle-rgb))', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.25)' }}>
                              SP {battleState.sp}
                            </span>
                          )}
                        </div>
                        )}
                        <div className={`${battleCard} p-6 text-center space-y-4`}>
                          <p className={p3 ? 'text-[15px] font-black' : 'text-gray-500 dark:text-gray-400 text-sm'} style={p3 ? { color: P3R.ink } : undefined}>
                            影时间高塔隐于夜色——第 1 区层尚未显形
                          </p>
                          <button
                            onClick={() => setShowReveal(true)}
                            className={p3 ? 'px-8 py-3 text-[17px] font-black text-white active:brightness-95' : 'px-6 py-3 rounded-xl font-bold text-white transition-colors'}
                            style={p3 ? { clipPath: slantClip(10), background: P3R.magenta } : { background: 'linear-gradient(135deg, #dc2626, rgb(var(--color-battle-rgb)))' }}
                          >
                            🗼 区层显形仪式
                          </button>
                        </div>
                      </div>
                    )}

                    {persona && stratum && battleState && (
                      <div className="space-y-3">
                        {/* Player info card */}
                        {p3 ? renderPlayerCardP3(
                          persona.equippedMaskAttribute ? (
                            <span className="shrink-0 px-2.5 py-1 text-[12px] font-black" style={{ clipPath: slantClip(6), background: P3R.cyanPale, color: P3R.blueDeep }}>
                              🎭 {settings.attributeNames[persona.equippedMaskAttribute]}
                            </span>
                          ) : undefined,
                        ) : (
                        <div className={`${battleCard} px-4 py-3 flex items-center justify-between`}>
                          <div>
                            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Player</p>
                            <p className="font-black text-gray-900 dark:text-white">{user?.name ?? '旅行者'}</p>
                            <p className="text-gray-400 dark:text-gray-500 text-xs">Lv.{attributes.reduce((s, a) => s + a.level, 0)}</p>
                          </div>
                          <div className="text-right">
                            {persona.equippedMaskAttribute && (
                              <p className="text-purple-500 dark:text-purple-400 text-xs mb-1">🎭 {settings.attributeNames[persona.equippedMaskAttribute]}</p>
                            )}
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.12)', color: 'rgb(var(--color-battle-rgb))', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.25)' }}>
                              SP {battleState.sp}
                            </span>
                          </div>
                        </div>
                        )}

                        {/* 区层头卡：名 / 等级 / 累计层高 / 主影 */}
                        <div className={`${battleCard} px-4 py-3 space-y-2`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-black text-gray-900 dark:text-white truncate">🗼 {stratum.name}</span>
                              <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.14)', color: 'rgb(var(--color-battle-rgb))' }}>
                                第{stratum.level}区层
                              </span>
                              {stratum.deepenCount > 0 && (
                                <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(220,38,38,0.12)', color: '#dc2626' }}>
                                  异变×{stratum.deepenCount}
                                </span>
                              )}
                            </div>
                            <span className="flex-shrink-0 text-xs font-bold tabular-nums text-gray-400 dark:text-gray-500">
                              {absoluteFloor(stratum, stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0)}F / {absoluteFloor(stratum, stratum.floors)}F
                            </span>
                          </div>
                          {shadow && (
                            <div>
                              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
                                <span>👁 {shadow.name} · 弱 {settings.attributeNames[shadow.weakAttribute]}</span>
                                <span>{shadow.currentHp + (shadow.currentHp2 ?? 0)}/{shadow.maxHp + (shadow.maxHp2 ?? 0)}</span>
                              </div>
                              <div className="h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ background: 'linear-gradient(to right, #dc2626, #ef4444)' }}
                                  animate={{ width: `${((shadow.currentHp + (shadow.currentHp2 ?? 0)) / Math.max(1, shadow.maxHp + (shadow.maxHp2 ?? 0))) * 100}%` }}
                                  transition={{ duration: 0.4 }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 月相日加深通告 */}
                        <AnimatePresence>
                          {deepenNotice && (
                            <motion.button
                              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                              onClick={() => setDeepenNotice(false)}
                              className="w-full px-4 py-2.5 rounded-xl text-left text-xs leading-relaxed"
                              style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171' }}
                            >
                              🌕 月相日·异变加深——心魔已回满，气息比上周更加危险（点击知悉）
                            </motion.button>
                          )}
                        </AnimatePresence>

                        {stratumCleared ? (
                          towerTopReached ? (
                            <div className={`${battleCard} p-6 text-center space-y-2`}>
                              <p className="text-3xl">🌌</p>
                              <p className="font-black text-gray-900 dark:text-white">第 5 区层已被攻略</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                                塔顶之上仍有无尽的黑暗在盘旋……<br />「深渊回廊」将在后续版本开放。
                              </p>
                            </div>
                          ) : (
                            <div className={`${battleCard} p-6 text-center space-y-4`}>
                              <p className={p3 ? 'text-[15px] font-black' : 'text-gray-500 dark:text-gray-400 text-sm'} style={p3 ? { color: P3R.ink } : undefined}>
                                区层已攻略——上方的黑暗开始蠕动
                              </p>
                              <button
                                onClick={() => setShowReveal(true)}
                                className={p3 ? 'px-8 py-3 text-[17px] font-black text-white active:brightness-95' : 'px-6 py-3 rounded-xl font-bold text-white transition-colors'}
                                style={p3 ? { clipPath: slantClip(10), background: P3R.magenta } : { background: 'linear-gradient(135deg, #dc2626, rgb(var(--color-battle-rgb)))' }}
                              >
                                🗼 显形第 {nextStratumLevel} 区层
                              </button>
                            </div>
                          )
                        ) : todayLocked ? (
                          <div className={`${battleCard} p-5 text-center space-y-1`}>
                            <p className="text-2xl">🌙</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">今晚的攀登已结束</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">进度已被月光标记——明晚再潜入。</p>
                          </div>
                        ) : (
                          <motion.button
                            whileTap={canInfiltrate ? { scale: 0.96 } : undefined}
                            onClick={handleInfiltrate}
                            disabled={!canInfiltrate}
                            className={p3 ? 'w-full py-4 text-[19px] font-black text-white tracking-wide transition-all' : 'w-full py-3.5 rounded-2xl font-black text-white tracking-wide transition-all shadow-sm'}
                            style={p3 ? {
                              clipPath: 'polygon(7% 0, 100% 0, 93% 100%, 0 100%)',
                              background: canInfiltrate ? 'linear-gradient(135deg, #1b57ff 30%, #35d1e8)' : '#dfe9f1',
                            } : {
                              background: canInfiltrate ? 'linear-gradient(135deg, rgb(var(--color-battle-rgb)), #dc2626)' : undefined,
                            }}
                          >
                            {sessionActive
                              ? '🗼 回到战场'
                              : canInfiltrate
                                ? '🌊 潜入战场'
                                : <span className="text-gray-400 dark:text-gray-500">🌊 等待影时间</span>}
                          </motion.button>
                        )}

                        {/* 批3：装备库 + 阴影档案馆入口 */}
                        <div className="flex gap-2">
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => { playSound('/ui-menu.mp3', 0.4); setShowArsenal(true); }}
                            className={`flex-1 py-2.5 text-sm font-black ${p3 ? 'text-white' : 'rounded-2xl text-white'}`}
                            style={p3
                              ? { clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)', background: 'linear-gradient(135deg,#312e81,#4338ca)' }
                              : { background: 'linear-gradient(135deg,#312e81,#4338ca)' }}
                          >
                            ⚙ 装备库
                            {(() => {
                              const a = battleState?.arsenal;
                              const n = (a?.relics.length ?? 0) + (a?.myths.length ?? 0) + (a?.oaths.length ?? 0);
                              return n > 0 ? <span className="ml-1.5 text-[10px] font-bold opacity-75">{n}</span> : null;
                            })()}
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => { playSound('/ui-menu.mp3', 0.4); setShowArchive(true); }}
                            className={`flex-1 py-2.5 text-sm font-black ${p3 ? 'text-white' : 'rounded-2xl text-white'}`}
                            style={p3
                              ? { clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)', background: 'linear-gradient(135deg,#581c87,#7e22ce)' }
                              : { background: 'linear-gradient(135deg,#581c87,#7e22ce)' }}
                          >
                            👁 阴影档案馆
                            {(battleState?.defeatedShadowLog?.length ?? 0) > 0 && (
                              <span className="ml-1.5 text-[10px] font-bold opacity-75">{battleState!.defeatedShadowLog!.length}</span>
                            )}
                          </motion.button>
                        </div>
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
                      <div className={`${battleCard} p-8 text-center text-gray-400 dark:text-gray-500 text-sm`}>
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
                                background: i === personaCardIdx ? 'rgb(var(--color-battle-rgb))' : 'rgb(var(--color-battle-bright-rgb) / 0.2)',
                              }}
                            />
                          ))}
                        </div>

                        {/* Persona card */}
                        {(() => {
                          const MASK_BUFFS: Record<AttributeId, string> = {
                            knowledge: '弱点攻击额外+2伤害，日常该属性+1',
                            guts: '出战时暴击率+15%，日常该属性+1',
                            dexterity: '每使用5次技能获得追加行动，日常该属性+1',
                            kindness: '体力耗尽后保留1点体力（每场一次），日常该属性+1',
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
                                style={{ borderColor: isEquipped ? 'rgb(var(--color-battle-bright-rgb) / 0.6)' : 'rgb(var(--color-battle-bright-rgb) / 0.25)', borderWidth: 1 }}
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
                                          background: 'rgb(var(--color-battle-bright-rgb) / 0.78)',
                                          backdropFilter: 'blur(8px) saturate(140%)',
                                          WebkitBackdropFilter: 'blur(8px) saturate(140%)',
                                          border: '1px solid rgba(233,213,255,0.4)',
                                          boxShadow: '0 6px 24px rgba(88,28,135,0.35), 0 0 18px rgb(var(--color-battle-bright-rgb) / 0.35)',
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
                                  style={{ borderBottom: isEquipped ? '1px solid rgb(var(--color-battle-bright-rgb) / 0.3)' : '1px solid rgb(var(--color-battle-bright-rgb) / 0.15)' }}
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
                                              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.5)', color: '#e9d5ff' }}>
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
                                        background: isEquipped ? 'rgb(var(--color-battle-bright-rgb) / 0.5)' : 'rgb(var(--color-battle-bright-rgb) / 0.1)',
                                        color: isEquipped ? '#e9d5ff' : 'rgb(var(--color-battle-rgb))',
                                        border: isEquipped ? '1px solid rgb(var(--color-battle-bright-rgb) / 0.7)' : '1px solid rgb(var(--color-battle-bright-rgb) / 0.3)',
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
                                      const effectHint = skill.type === 'heal'
                                        ? `+${healAmount(skill.power, currentAttr)}HP`
                                        : (mapped?.hint ?? SKILL_EFFECT_HINT[skill.type] ?? '');
                                      const locked = skill.unlocked === false; // 批3 双条件：属性等级≥N 且 前技满星
                                      return (
                                      <div
                                        key={i}
                                        className={`flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700 ${locked ? 'opacity-45' : ''}`}
                                      >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <span
                                            className="text-xs font-black flex-shrink-0 px-1.5 py-0.5 rounded text-purple-600 dark:text-purple-300"
                                            style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.1)' }}
                                          >
                                            {locked ? '🔒' : skill.level}
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
                                              {skill.oath && (
                                                <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                      style={{ color: '#fcd34d', background: 'rgba(252,211,77,0.14)' }}>
                                                  誓约
                                                </span>
                                              )}
                                              {skill.socket && (
                                                <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                      style={{ color: '#c4b5fd', background: 'rgba(196,181,253,0.14)' }}>
                                                  ◆ 迷思
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-gray-500 dark:text-gray-400 text-xs truncate">
                                              {locked ? `解锁：${settings.attributeNames[currentAttr]} Lv${skill.level} + 前技满星` : skill.description}
                                            </p>
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
                                          <div className="flex items-center justify-end gap-1.5">
                                            {!locked && <MasteryStars skill={skill} />}
                                            <p className="text-yellow-600 dark:text-yellow-400/70 text-xs">SP {skill.spCost}</p>
                                          </div>
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
                    <div className={`${battleCard} overflow-hidden`}>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">启用逆影战场</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">关闭后将隐藏战斗功能及其全部入口（首页与菜单）</p>
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

                    {/* ── 影之评语开关（批3 §7.3） ── */}
                    <div className={`${battleCard} overflow-hidden`}>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">影之评语</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">登塔回顾附一句 AI 点评（需配置 API Key）</p>
                        </div>
                        <button
                          onClick={() => void saveSettings({ battleCommentEnabled: settings.battleCommentEnabled === false })}
                          className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0"
                          style={{ background: settings.battleCommentEnabled !== false ? 'rgb(var(--color-battle-rgb))' : 'rgba(156,163,175,0.4)' }}
                        >
                          <motion.span
                            animate={{ left: settings.battleCommentEnabled !== false ? 26 : 4 }}
                            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
                          />
                        </button>
                      </div>
                    </div>

                    {/* ── Persona 洗牌 ── */}
                    {persona && (
                      <div className={`${battleCard} overflow-hidden`}>
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Persona 洗牌</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">对不满意的属性Persona进行重新匹配</p>
                          </div>
                          <button
                            onClick={() => setShowPersonaShuffle(true)}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-purple-400 transition-all"
                            style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.1)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.3)' }}
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
                      <div className={`${battleCard} overflow-hidden divide-y divide-gray-50 dark:divide-gray-800`}>
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
                        {/* Shadow 攻击倍率（引擎v2：基础攻击走等级表 5/6/7/8/9） */}
                        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Shadow 攻击倍率 %</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              基础攻击按等级 {BOSS_ATTACK_BY_LEVEL.join('/')}，此倍率整体缩放
                            </p>
                          </div>
                          <input
                            type="number"
                            value={attackScale}
                            onChange={(e) => setAttackScale(e.target.value)}
                            onBlur={() => {
                              const v = parseInt(attackScale, 10);
                              if (!isNaN(v) && v > 0 && v <= 500) saveSettings({ battleAttackScale: v });
                            }}
                            className={`${inputCls} !w-20 text-center`}
                            min={10} max={500}
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
                      <div className={`${battleCard} p-4 space-y-4`}>
                        {/* 当前状态 */}
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: inShadowTime ? 'rgb(var(--color-battle-rgb))' : '#9ca3af' }}
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
                      <div className={`${battleCard} overflow-hidden`}>
                        <div className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">重置战场数据</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                            清除所有 Persona、Shadow、击败史与 HP 上限加成；未使用的 SP 会保留。此操作不可撤销。
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

      {/* P3R 底部幽灵字 */}
      {p3 && (
        <div aria-hidden className="relative h-14">
          <GhostWords words={['TACTICAL']} className="left-[-30px] top-[-4px] text-[62px]" style={{ color: 'rgba(53,209,232,0.28)' }} />
        </div>
      )}
    </motion.div>
    </P3RPage>

    {/* Sub-modals */}
    <PersonaCreateModal isOpen={showPersonaCreate} onClose={() => setShowPersonaCreate(false)} />
    <StratumRevealModal isOpen={showReveal} onClose={() => setShowReveal(false)} level={nextStratumLevel} />
    <BattleModal
      isOpen={showBattle}
      onClose={handleBattleClosed}
      onVictory={() => void handleVictory()}
      encounter={activeEncounter ? { mob: activeEncounter.mob, level: activeEncounter.level } : null}
      onEncounterEnd={(o) => void handleEncounterEnd(o)}
    />
    <VictoryModal
      isOpen={showVictory}
      onClose={() => {
        setShowVictory(false);
        if (useAppStore.getState().stratum?.status === 'cleared') setRecap('clear');
      }}
    />
    <PersonaShuffleModal isOpen={showPersonaShuffle} onClose={() => setShowPersonaShuffle(false)} />
    {/* 塔内独立界面（验收反馈 #4）+ 潜入演出 */}
    <AnimatePresence>
      {towerOpen && (
        <TowerScreen
          open={towerOpen}
          onClose={() => setTowerOpen(false)}
          onDescend={() => void handleDescend()}
          onRequestBattle={handleRequestBattle}
          onToast={showSpToast}
          interactive={sessionActive}
        />
      )}
    </AnimatePresence>
    <AnimatePresence>
      {infiltrating && <InfiltrationOverlay onDone={() => void handleInfiltrationDone()} />}
    </AnimatePresence>
    {/* 批4 §6.2：备战抽取 · 抽2选1（今日待办≥3 的犒赏；z 高于塔屏） */}
    <AnimatePresence>
      {prepChoice && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.82)' }}
        >
          <motion.div initial={{ scale: 0.9, y: 14 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-xs space-y-3">
            <div className="text-center">
              <p className="text-3xl">🎴</p>
              <p className="text-white font-black text-base mt-1">备战抽取</p>
              <p className="text-[11px] text-indigo-200/60 mt-0.5">今日待办勤勉——月光多给了你一次选择</p>
            </div>
            {prepChoice.map(opt => (
              <button
                key={opt.id}
                onClick={() => {
                  void useAppStore.getState().applyPrepBuff(opt);
                  setPrepChoice(null);
                  playSound('/battle-seal.mp3', 0.5);
                  showSpToast(`🎴 备战抽取 · ${opt.label}`);
                }}
                className="w-full py-3 px-4 text-left text-sm font-bold text-indigo-100"
                style={{ clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', background: 'rgba(49,46,129,0.85)', border: '1px solid rgba(99,102,241,0.5)' }}
              >
                {opt.label}
              </button>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    {/* 批3：装备库 + 阴影档案馆 */}
    <AnimatePresence>
      {showArsenal && <ArsenalModal open={showArsenal} onClose={() => setShowArsenal(false)} />}
    </AnimatePresence>
    <AnimatePresence>
      {showArchive && <ShadowArchiveModal open={showArchive} onClose={() => setShowArchive(false)} />}
    </AnimatePresence>
    {/* SP 即发 toast（全局层：塔屏之上也可见） */}
    <AnimatePresence>
      {spToast && (
        <motion.div
          initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          className="fixed left-1/2 -translate-x-1/2 z-[70] px-5 py-2 rounded-full text-sm font-bold shadow-xl"
          style={{
            top: 'calc(1rem + env(safe-area-inset-top))',
            background: 'rgba(30,22,4,0.92)', border: '1px solid rgba(250,204,21,0.5)', color: '#fde047',
            backdropFilter: 'blur(6px)',
          }}
        >
          {spToast}
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence>
      {recap && stratum && (
        <TowerRecapModal
          reason={recap}
          stats={battleState?.towerSession}
          stratum={stratum}
          comment={recapComment}
          onClose={() => setRecap(null)}
        />
      )}
    </AnimatePresence>
    </>
  );
};
