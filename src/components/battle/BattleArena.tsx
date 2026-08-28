import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { Toggle } from '@/components/Toggle';
import { toLocalDateKey } from '@/store';
import { isInShadowTime, SHADOW_LEVEL_CONFIG } from '@/constants';
import { BOSS_ATTACK_BY_LEVEL } from '@/battle/numbers';
import { AttributeId, MobSpec, StratumNode } from '@/types';
import { absoluteFloor } from '@/battle/tower';
import { type LootDrop } from '@/battle/loot';
import { LootReveal, type LootRevealSource } from '@/components/battle/LootReveal';
import { rollPrepDraw, type PrepBuff } from '@/battle/preparation';
import { generateSummonLines, generateRecapComment } from '@/utils/battleAI';
import { playSound } from '@/utils/feedback';
import { BackButton } from '@/components/BackButton';
import { PageTitle } from '@/components/PageTitle';
import { PersonaCreateModal } from '@/components/battle/PersonaCreateModal';
import { StratumRevealModal } from '@/components/battle/StratumRevealModal';
import { FinalBossRevealModal } from '@/components/battle/FinalBossRevealModal';
import { FinalBossFinale } from '@/components/battle/FinalBossFinale';
import { getAIConfig } from '@/utils/aiClient';
import { BattleModal } from '@/components/battle/BattleModal';
import { VictoryModal } from '@/components/battle/VictoryModal';
import { PersonaShuffleModal } from '@/components/battle/PersonaShuffleModal';
import { TowerScreen } from '@/components/battle/TowerScreen';
import { InfiltrationOverlay } from '@/components/battle/InfiltrationOverlay';
import { TowerRecapModal } from '@/components/battle/TowerModals';
import { ArsenalModal, ShadowArchiveModal } from '@/components/battle/ArsenalModal';
import { PersonaCodex } from '@/components/battle/PersonaCodex';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, P3RPage, GhostWords, P3PageHeader, ShatteredStar, slantClip } from '@/components/p3r/kit';
import { NoiseLayer } from '@/components/battle/warKit';
import {
  P5R, P5_FONT, roughQuad, roughSlant,
  P5RPage, P5Panel, P5Btn, P5Collage, P5Star, P5StarOutline, P5RingStar, P5Dots, P5Slab,
} from '@/components/p5r/kit';

type TabKey = 'battle' | 'persona' | 'settings';

/** P5 取景框（p5-battle 稿：空态巨星外那四个黑 L 角标） */
const P5Viewfinder = ({ children }: { children: React.ReactNode }) => {
  const CORNERS = [
    { pos: { left: 0, top: 0 }, h: { left: 0, top: 0 }, v: { left: 0, top: 0 } },
    { pos: { right: 0, top: 0 }, h: { right: 0, top: 0 }, v: { right: 0, top: 0 } },
    { pos: { left: 0, bottom: 0 }, h: { left: 0, bottom: 0 }, v: { left: 0, bottom: 0 } },
    { pos: { right: 0, bottom: 0 }, h: { right: 0, bottom: 0 }, v: { right: 0, bottom: 0 } },
  ];
  return (
    <div className="relative flex h-[128px] w-[158px] items-center justify-center">
      {CORNERS.map((c, i) => (
        <span key={i} aria-hidden className="absolute h-[32px] w-[32px]" style={c.pos}>
          <span className="absolute h-[4.5px] w-[32px]" style={{ ...c.h, background: P5R.ink }} />
          <span className="absolute h-[32px] w-[4.5px]" style={{ ...c.v, background: P5R.ink }} />
        </span>
      ))}
      {children}
    </div>
  );
};

export const BattleArena = () => {
  const {
    user, attributes, persona, shadow, battleState, settings, stratum,
    checkShadowHpRegen, updateSettings: saveSettings, resetBattle, setCurrentPage,
    saveBattleState, enterTowerToday, completeTowerNode, deepenStratumIfNewWeek,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabKey>('battle');
  // P3R（蓝频道）：p3-battle-reference-v2 形态；battleCard = 全页 13 处卡壳的统一开关
  const uiChannel = useUiChannel();
  const p3 = uiChannel === 'p3';
  // P5R（红频道）：p5-battle-flat-newsprint-v1 稿——页头/段签/玩家条/空态大板照稿重画，
  // 其余（Persona 页、设置页、塔内）走 .p5-reskin 毯式重皮
  const p5 = uiChannel === 'p5';
  const battleCard = p3 ? 'p3r-card' : 'rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm';
  const [showPersonaCreate, setShowPersonaCreate] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [showFinalReveal, setShowFinalReveal] = useState(false);
  const [revisitPick, setRevisitPick] = useState(false);
  const [showBattle, setShowBattle] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [personaCardIdx, setPersonaCardIdx] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showArsenal, setShowArsenal] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [cheatClicks, setCheatClicks] = useState(0);
  const [showBattleParams, setShowBattleParams] = useState(false);
  const [showPersonaShuffle, setShowPersonaShuffle] = useState(false);
  // ── 高塔（批2） ──
  const [activeEncounter, setActiveEncounter] = useState<{ mob: MobSpec; level: number; nodeId: string } | null>(null);
  // R17 #5：强敌/金色/心魔战利品 → 抽卡仪式（心魔在仪式关闭后再拉 VictoryModal）
  const [lootReveal, setLootReveal] = useState<{ source: LootRevealSource; drops: LootDrop[]; sp: number; thenVictory?: boolean } | null>(null);
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
    // 战场成就自愈：历史竞态丢过壮举记录（见 store.recordBattleFeat 注释），进战场页时对一次账
    void useAppStore.getState().repairBattleFeats();
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
    // Lv6 终局：三条血归零后 status 也是 'victory'，但结算归 FinalBossFinale 管，不弹胜利屏
    if (battleState?.finalBossStage === 'finale') return;
    if (battleState?.status === 'victory' && !showBattle && !showVictory) {
      setShowVictory(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleState?.status, battleState?.finalBossStage]);

  const todayKey = toLocalDateKey();
  const enteredToday = battleState?.lastChallengeDate === todayKey;
  const sessionActive = !!enteredToday && battleState?.status !== 'session_end' && battleState?.status !== 'victory';
  const stratumCleared = stratum?.status === 'cleared';
  // 主塔区层仍钳在 5：Lv6 顶阙不走「显形第 N 区层」这条路，它有自己的仪式
  const nextStratumLevel = stratum ? Math.min(5, stratum.level + 1) : 1;
  // ── Lv6 伪神闸门（PRD_FINAL_BOSS §2.2）──
  const finalStage = battleState?.finalBossStage;
  const finalDefeated = finalStage === 'defeated';
  const inFinale = finalStage === 'finale';
  /**
   * Lv5 通关 且 伪神还没显形 → 该它出场了。
   * 存量存档里已经在深渊回廊的人也算：用户口径是「打败它以后才会开启后续的无尽关卡」，
   * 先跑进回廊的属于抢跑，塔顶会把他叫回去一次。环数不会丢——enterAbyss 从
   * abyssHighestRing 续号。
   */
  const finalBossDue = !!stratumCleared && (stratum?.level ?? 0) >= 5 && !finalStage && !stratum?.revisit;
  // ── R19「回头看看」──
  const inRevisit = !!stratum?.revisit;
  const maxCleared = useAppStore(s => s.highestClearedStratum)();
  /** 塔里没有正在进行的攀登（当前层已通关 / 还没显形）时才给「回头看看」 */
  const canRevisit = maxCleared >= 1 && !inRevisit && (stratumCleared || !stratum);
  const hasAiKey = !!getAIConfig(settings);
  // 深渊回廊：伪神倒下之后才开
  const towerTopReached = !!stratumCleared && (stratum?.level ?? 0) >= 5 && finalDefeated && !stratum?.revisit;

  const showSpToast = (text: string) => {
    setSpToast(text);
    setTimeout(() => setSpToast(null), 1900);
  };

  const handleBattleClosed = () => {
    setShowBattle(false);
    setActiveEncounter(null);
    if (useAppStore.getState().battleState?.finalBossStage === 'finale') return; // 交给终局演出
    if (battleState?.status === 'victory') {
      setShowVictory(true);
    }
  };

  const handleVictory = async () => {
    setShowBattle(false);
    if (useAppStore.getState().battleState?.finalBossStage === 'finale') return; // 伪神不走常规心魔结算
    // 主影节点结算：SP 即发 + 标记通关节点 + 批3 心魔战利品（必得遗物 / 35% 共鸣链 / 25% 誓约石）
    const bossNode = stratum?.nodes.find(n => n.type === 'boss');
    if (bossNode && !bossNode.cleared) {
      const sp = await completeTowerNode(bossNode.id);
      const drops = await useAppStore.getState().rollTowerLoot('boss', 1);
      // 回头看看：残响不给属性点、不进档案（VictoryModal 就是发属性点的那一屏，跳过）
      if (stratum?.revisit) {
        await useAppStore.getState().defeatShadow();
        setLootReveal({ source: 'boss', drops, sp });
        return;
      }
      // 批4 §6.8：通关类壮举——首区层通关 / 一夜通层（本 session 从区层入口爬到心魔）
      const st4 = useAppStore.getState();
      void st4.recordBattleFeat('first_clear');
      if (st4.battleState?.towerSession?.startFloor === 0) void st4.recordBattleFeat('night_climb');
      // R17 #5：抽卡仪式 → DONE AND DUSTED 终幕 → 再进 VictoryModal 领奖
      setLootReveal({ source: 'boss', drops, sp, thenVictory: true });
      return;
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
      // 批3：强敌 60% 掉战利品；批5：金色回响必掉满月
      let drops: LootDrop[] = [];
      const node = stratum?.nodes.find(n => n.id === enc.nodeId);
      const floorRatio = stratum ? (node?.floor ?? 1) / Math.max(1, stratum.floors) : 0.5;
      if (enc.mob.golden) {
        drops = await useAppStore.getState().rollTowerLoot('golden', floorRatio);
      } else if (enc.mob.tier === 'elite') {
        drops = await useAppStore.getState().rollTowerLoot('elite', floorRatio);
      }
      if (drops.length > 0) {
        // R17 #5：有掉落 → 抽卡仪式；空手（强敌 40%）与小怪保持轻量 toast
        setLootReveal({ source: enc.mob.golden ? 'golden' : 'elite', drops, sp });
      } else if (sp > 0) {
        showSpToast(`${enc.mob.golden ? '✨ 金色回响散去' : '⚔️ 节点攻略'} · +${sp} SP`);
      }
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

  // Lv6 终局演出的开关要「闩住」：defeatFinalBoss 会把 finalBossStage 推到 'defeated'，
  // 若直接拿 inFinale 当 isOpen，掉落屏会在结算落库的同一帧被卸掉——玩家根本看不见奖励。
  const [finaleOpen, setFinaleOpen] = useState(false);
  useEffect(() => { if (inFinale) setFinaleOpen(true); }, [inFinale]);

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

  // ── P5R 玩家条（p5-battle 稿：PLAYER 黑标骑上缘 + 大黑名 + LV + 右缘红星探出）──
  const renderPlayerCardP5 = (extra?: React.ReactNode) => (
    <div className="relative mt-1.5">
      <P5Panel seed={620} jag={8} frame={3.5} keyline={2.5} shadow={{ x: 5, y: 6 }} bodyClassName="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[22px] font-black leading-tight" style={{ color: P5R.ink, fontFamily: P5_FONT }}>{user?.name ?? '旅行者'}</p>
            <p className="mt-0.5 text-[15px] font-black leading-none" style={{ color: P5R.ink, fontFamily: P5_FONT }}>
              LV.{attributes.reduce((s, a) => s + a.level, 0)}
            </p>
          </div>
          {extra}
        </div>
        {battleState && (
          <div className="mt-2.5 flex items-center gap-3">
            <span className="text-[11px] font-black" style={{ color: P5R.ink }}>HP</span>
            <div className="relative h-[10px] min-w-0 flex-1" style={{ background: '#c9c3b6', clipPath: roughQuad(622, 3) }}>
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${Math.max(0, Math.min(100, (p3Hp / Math.max(1, p3HpMax)) * 100))}%`,
                  background: P5R.red,
                  clipPath: roughQuad(623, 3),
                }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-black" style={{ color: P5R.ink }}>SP</span>
            <span className="flex shrink-0 gap-[3px]" aria-hidden>
              {[0, 1, 2].map(k => (
                <span key={k} className="h-[11px] w-[13px]" style={{ background: k < Math.min(3, p3Sp) ? P5R.red : '#c9c3b6', clipPath: 'polygon(28% 0, 100% 0, 72% 100%, 0 100%)' }} />
              ))}
            </span>
            <span className="shrink-0 text-[11px] font-black tabular-nums" style={{ color: p3Sp > 0 ? P5R.red : P5R.grey }}>{p3Sp}</span>
          </div>
        )}
      </P5Panel>
      {/* PLAYER 黑标：另一张纸贴在卡的上缘 */}
      <span
        className="absolute -top-2.5 left-3.5 px-2.5 py-[3px] text-[11px] font-black leading-none tracking-[0.2em]"
        style={{ background: P5R.ink, color: P5R.paper, clipPath: roughQuad(621, 3), boxShadow: `0 0 0 2px ${P5R.paper}`, fontFamily: P5_FONT }}
      >
        PLAYER
      </span>
      {/* 再往右下让开：原位会压住 HP/SP 行右端的 SP 数字 */}
      <P5Star size={56} fill={P5R.red} ring={P5R.ink} rot={-8} className="pointer-events-none absolute -bottom-8 -right-7" />
    </div>
  );

  return (
    <>
    <P5RPage active={p5}>
    {/* R19 #4 异空间：战场是「异空间」，页面底永远走深紫虚空——浅色主题下 Persona 紫板
        不再突兀（p5 保留定稿红舞台，本就是暗色异空间）。P3 水面壳就此让位。 */}
    <P3RPage active={false}>
    <motion.div
      key="battle-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative isolate space-y-5 ${p3 ? 'pb-10' : 'pb-8'} ${p5 ? 'p5-reskin' : ''}`}
    >
      {!p5 && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
          style={{ background: 'radial-gradient(circle at 50% 10%, #251b4f 0%, #150e33 46%, #0c0722 100%)' }}
        >
          <NoiseLayer opacity={0.05} />
          {/* 虚空装饰：屏外大弧环 + 底部微光地平线 */}
          <div aria-hidden className="absolute -right-40 -top-44 h-[420px] w-[420px] rounded-full" style={{ border: '30px solid rgba(139,124,246,0.07)' }} />
          <div aria-hidden className="absolute -left-52 top-1/3 h-[480px] w-[480px] rounded-full" style={{ border: '22px solid rgba(139,124,246,0.05)' }} />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(0deg, rgba(139,124,246,0.1), transparent)' }} />
        </div>
      )}
      {p3 && <GhostWords words={['BATTLE']} className="right-[8px] top-[-14px] text-right text-[72px]" style={{ color: 'rgba(160,150,255,0.13)' }} />}

      {/* Header — 宫格子页页头归一 PageTitle 制式（审计 S6），返回归一 → 菜单 */}
      {p5 ? (
        <div className="relative pt-1">
          {/* 区块局部装饰：红斜块碰撞 + 网点 + 探出的纸白星 */}
          <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-8 h-[230px]" style={{ zIndex: -1 }}>
            <P5Slab color={P5R.red} seed={601} rot={-10} style={{ left: -70, top: -16, width: 250, height: 140 }} />
            <P5Slab color={P5R.redDeep} seed={602} rot={12} style={{ right: -80, top: 26, width: 220, height: 160 }} />
            <P5Dots className="absolute" style={{ left: 0, top: 86, width: 74, height: 130 }} color="#4a4741" />
            <P5Star size={30} fill={P5R.paper} rot={-12} className="absolute" style={{ right: 40, top: 62 }} />
            <P5StarOutline size={22} color="#57534c" rot={16} className="absolute" style={{ right: 8, top: 132 }} />
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage('menu')}
                aria-label="返回"
                className="relative mt-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                style={{
                  background: P5R.paper,
                  border: '2.5px solid #050505',
                  boxShadow: '3px 3px 0 #000000',
                  clipPath: 'polygon(2px 1px, calc(100% - 1px) 3px, calc(100% - 3px) calc(100% - 1px), 1px calc(100% - 3px))',
                }}
              >
                <span aria-hidden className="h-0 w-0 border-y-[7px] border-y-transparent border-r-[11px]" style={{ borderRightColor: '#050505' }} />
              </button>
              <div className="min-w-0">
                <P5Collage
                  size={42}
                  gap={4}
                  tiles={[
                    { ch: '逆', bg: P5R.red, fg: P5R.paper, rot: -3.6, dy: 0 },
                    { ch: '影', bg: P5R.paper, fg: P5R.ink, rot: 2.6, dy: 7 },
                    { ch: '战', bg: P5R.red, fg: P5R.paper, rot: -2, dy: 2 },
                    { ch: '场', bg: P5R.paper, fg: P5R.ink, rot: 3, dy: 8 },
                  ]}
                />
                <div className="mt-2.5 pl-7">
                  <P5Collage
                    size={21}
                    gap={2}
                    delay={0.2}
                    tiles={[
                      { ch: 'B', bg: P5R.paper, fg: P5R.red, rot: -4, dy: 2 },
                      { ch: 'A', bg: P5R.paper, fg: P5R.ink, rot: 2, dy: 0 },
                      { ch: 'T', bg: P5R.paper, fg: P5R.ink, rot: -2.5, dy: 3 },
                      { ch: 'T', bg: P5R.paper, fg: P5R.ink, rot: 3, dy: 1 },
                      { ch: 'L', bg: P5R.paper, fg: P5R.red, rot: -3, dy: 4 },
                      { ch: 'E', bg: P5R.paper, fg: P5R.ink, rot: 2.4, dy: 1 },
                    ]}
                  />
                </div>
              </div>
            </div>
            {inShadowTime && (
              <motion.span
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                className="relative mt-1 flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-[13px] font-black"
                style={{ color: P5R.paper, fontFamily: P5_FONT }}
              >
                <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,3px)', background: P5R.ink, clipPath: roughQuad(604, 4) }} />
                <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(605, 3) }} />
                <span aria-hidden className="absolute inset-[2.5px]" style={{ background: P5R.red, clipPath: roughQuad(606, 3) }} />
                <span className="relative flex items-center gap-1.5">
                  <P5Star size={13} fill={P5R.paper} />
                  影时间
                </span>
              </motion.span>
            )}
          </div>
        </div>
      ) : p3 ? (
        <div className="battle-void-head relative">
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
        <div className="battle-void-head flex items-start gap-3">
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

      {/* Tabs（p3：斜块三格——选中蓝斜块白字+洋红角 / 未选白斜块黑字；
          p5：三张斜纸片叠压，选中翻猩红 + 纸白下划线，未选纯纸底黑字——不用透明度分主次） */}
      {p5 ? (
        <div className="relative flex items-stretch">
          {([
            { key: 'battle', label: '进入战场' },
            { key: 'persona', label: 'Persona' },
            { key: 'settings', label: '设置' },
          ] as const).map((tab, i) => {
            const active = activeTab === tab.key;
            return (
              <motion.button
                key={tab.key}
                type="button"
                whileTap={{ x: 2, y: 3 }}
                onClick={() => setActiveTab(tab.key)}
                className="relative flex-1 px-1 py-3 text-center text-[15px] font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
                style={{
                  marginLeft: i > 0 ? -9 : 0,
                  zIndex: active ? 4 : 3 - i,
                  color: active ? P5R.paper : P5R.ink,
                  fontFamily: P5_FONT,
                }}
              >
                <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(3px,4px)', background: P5R.ink, clipPath: roughSlant(610 + i, 14, 3) }} />
                <span aria-hidden className="absolute inset-0" style={{ background: P5R.ink, clipPath: roughSlant(613 + i, 14, 3) }} />
                <span aria-hidden className="absolute inset-[3px]" style={{ background: active ? P5R.red : P5R.paper, clipPath: roughSlant(616 + i, 13, 3) }} />
                <span className="relative">{tab.label}</span>
                {active && (
                  <span aria-hidden className="absolute bottom-[8px] left-1/2 h-[3px] w-[52%] -translate-x-1/2" style={{ background: P5R.paper }} />
                )}
              </motion.button>
            );
          })}
        </div>
      ) : p3 ? (
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
                      p5 ? (
                        <div className="space-y-4">
                          {renderPlayerCardP5()}
                          {/* 空态大纸板：取景框巨星 + 提示 + 猩红召唤钮（稿上主视觉） */}
                          <P5Panel seed={630} jag={10} frame={4} keyline={3} shadow={{ x: 6, y: 7 }} bodyClassName="px-5 pb-8 pt-9">
                            <div className="flex flex-col items-center gap-5">
                              <P5Viewfinder>
                                <P5RingStar size={92} rings={[P5R.ink, P5R.paper, P5R.ink, P5R.red]} step={0.13} />
                              </P5Viewfinder>
                              <p className="text-[16px] font-black" style={{ color: P5R.ink, fontFamily: P5_FONT }}>你尚未召唤 Persona</p>
                              <P5Btn tone="red" seed={631} rot={-1.2} onClick={() => setShowPersonaCreate(true)} className="w-[78%]" bodyClassName="!py-3.5 !text-[21px]">
                                召唤 Persona
                              </P5Btn>
                            </div>
                          </P5Panel>
                        </div>
                      ) : p3 ? (
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
                        {p5 ? renderPlayerCardP5() : p3 ? renderPlayerCardP3() : (
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
                        {p5 ? renderPlayerCardP5(
                          persona.equippedMaskAttribute ? (
                            <span className="relative shrink-0 px-2.5 py-1.5 text-[12px] font-black" style={{ color: P5R.paper, fontFamily: P5_FONT }}>
                              <span aria-hidden className="absolute inset-0" style={{ background: P5R.ink, clipPath: roughQuad(626, 3) }} />
                              <span className="relative">{settings.attributeNames[persona.equippedMaskAttribute]}</span>
                            </span>
                          ) : undefined,
                        ) : p3 ? renderPlayerCardP3(
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

                        {/* R19「回头看看」：重游期间的回塔顶横幅（压在所有区层卡片之上） */}
                        {inRevisit && (
                          <div className={`${battleCard} p-4 text-center space-y-2`}>
                            <p className="text-xs font-black tracking-[0.24em] text-gray-400 dark:text-gray-500">REVISIT</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                              你在回望第 {stratum?.level} 区层
                            </p>
                            <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                              这里的收获照常进背包，但进度、HP 上限与档案都不动。
                            </p>
                            <button
                              onClick={async () => {
                                playSound('/ui-menu.mp3', 0.6);
                                await useAppStore.getState().endRevisit();
                                setTowerOpen(false);
                                showSpToast('🗼 已回到塔顶');
                              }}
                              className="w-full py-2.5 rounded-xl text-sm font-black text-white"
                              style={{ background: 'linear-gradient(135deg, #4b5563, #1f2937)' }}
                            >
                              ↩ 回到塔顶
                            </button>
                          </div>
                        )}
                        {stratumCleared ? (
                          finalBossDue ? (
                            hasAiKey ? (
                              /* Lv6 · 伪神显形入口（击败之前深渊入口不出现） */
                              <div className={`${battleCard} p-6 text-center space-y-3`}>
                                <p className="text-3xl">✦</p>
                                <p className="font-black text-gray-900 dark:text-white">塔顶之上还有一层</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                                  五个区层都空了，可上面的黑暗没有散。<br />
                                  有个东西一直在那儿——它在等你把塔走完，好把结论念给你听。
                                </p>
                                <motion.button
                                  whileTap={{ scale: 0.96 }}
                                  onClick={() => { playSound('/battle-impact.mp3', 0.7); setShowFinalReveal(true); }}
                                  className="w-full py-3 font-black"
                                  style={{
                                    clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)',
                                    background: 'linear-gradient(135deg, #92610e, #e8b64c)',
                                    color: '#160d02',
                                  }}
                                >
                                  ✦ 登上顶阙
                                </motion.button>
                              </div>
                            ) : (
                              /* 无 AI Key：不开放（用户拍板不做本地兜底——它必须读得懂你） */
                              <div className={`${battleCard} p-6 text-center space-y-3`}>
                                <p className="text-3xl opacity-50">🔒</p>
                                <p className="font-black text-gray-900 dark:text-white">终局将至</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                                  高塔之上还有一层，但它需要读得懂你。<br />
                                  去「设置 → AI」配一个 Key，它才会显形。
                                </p>
                                <button
                                  onClick={() => setCurrentPage('settings')}
                                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
                                  style={{ background: 'linear-gradient(135deg, #6b7280, #374151)' }}
                                >
                                  前往设置
                                </button>
                              </div>
                            )
                          ) : towerTopReached ? (
                            <div className={`${battleCard} p-6 text-center space-y-3`}>
                              <p className="text-3xl">🌌</p>
                              <p className="font-black text-gray-900 dark:text-white">
                                {stratum?.abyssRing ? `回廊·第${stratum.abyssRing}环已破` : '伪神已被终结'}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                                {stratum?.abyssRing
                                  ? <>回廊仍在向下盘旋——守卫的词缀会一环比一环更多。<br />最深纪录：第 {Math.max(battleState?.abyssHighestRing ?? 0, stratum.abyssRing)} 环</>
                                  : <>它替你写的那句结论，已经被你划掉了。<br />塔顶之上没有天空——只有向下盘旋的「深渊回廊」。</>}
                              </p>
                              <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={async () => {
                                  playSound('/battle-seal.mp3', 0.6);
                                  await useAppStore.getState().enterAbyss();
                                  showSpToast(`⛩ ${useAppStore.getState().stratum?.name ?? '深渊回廊'} · 显形`);
                                  if (sessionActive) setTowerOpen(true); // 同晚连环：直接回战场继续
                                }}
                                className="w-full py-3 font-black text-white"
                                style={{
                                  clipPath: 'polygon(6% 0, 100% 0, 94% 100%, 0 100%)',
                                  background: 'linear-gradient(135deg, #92610e, #e8b64c)',
                                }}
                              >
                                ⛩ {stratum?.abyssRing ? '深入下一环' : '踏入深渊回廊'}
                              </motion.button>
                              {!sessionActive && (
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {enteredToday ? '今晚的攀登已结束——新环将在下次潜入时等你' : '环显形后，影时间潜入即可进入'}
                                </p>
                              )}
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

                        {/* R19「回头看看」：重开一层走过的区层（只刷战利品与 SP，不推进度） */}
                        {canRevisit && (
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => { playSound('/ui-menu.mp3', 0.4); setRevisitPick(true); }}
                            className={`w-full py-2.5 text-sm font-black ${p3 ? 'text-white' : 'rounded-2xl text-white'}`}
                            style={p3
                              ? { clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)', background: 'linear-gradient(135deg,#334155,#0f172a)' }
                              : { background: 'linear-gradient(135deg,#334155,#0f172a)' }}
                          >
                            ↩ 回头看看
                            <span className="ml-1.5 text-[10px] font-bold opacity-70">1–{maxCleared} 区层</span>
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

                {/* ── Persona 卡片视图（R17 #4：PersonaCodex——面具轨 / 英雄板 / 技能典·熟练度） ── */}
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
                      <PersonaCodex attrIdx={personaCardIdx} onSelectAttr={setPersonaCardIdx} />
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
                        {/* 统一 Toggle（v2.7）：此前是手搓圆角开关——P5 毯式重皮盖不到它，
                            黑白斜切世界里孤零零一颗圆角胶囊（用户上报「开关底部不该是圆角」），
                            顺带没有 role/aria。换制式件后四频道皮肤与可达性全部继承。 */}
                        <Toggle
                          checked={battleEnabled}
                          onChange={(next) => {
                            setBattleEnabled(next);
                            void saveSettings({ battleEnabled: next });
                          }}
                          aria-label="启用逆影战场"
                        />
                      </div>
                    </div>

                    {/* ── 影之评语开关（批3 §7.3） ── */}
                    <div className={`${battleCard} overflow-hidden`}>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">影之评语</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">登塔回顾附一句 AI 点评（需配置 API Key）</p>
                        </div>
                        <Toggle
                          checked={settings.battleCommentEnabled !== false}
                          onChange={(v) => void saveSettings({ battleCommentEnabled: v })}
                          aria-label="影之评语"
                        />
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
          <GhostWords words={['TACTICAL']} className="left-[6px] top-[-4px] text-[54px]" style={{ color: 'rgba(53,209,232,0.28)' }} />
        </div>
      )}
    </motion.div>
    </P3RPage>
    </P5RPage>

    {/* R19「回头看看」：选一层重游。portal 到 body——页面内容层压不过底导（z-40），
        不 portal 的话弹层底部那颗「先不去」会被 tab 栏切掉 */}
    {createPortal(
    <AnimatePresence>
      {revisitPick && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] flex items-end justify-center p-4 sm:items-center"
          style={{ background: 'rgba(0,0,0,0.86)' }}
          onClick={e => { if (e.target === e.currentTarget) setRevisitPick(false); }}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-sm rounded-2xl p-5"
            style={{ background: 'linear-gradient(160deg, #0e1220 0%, #1a2136 60%, #0b0f1a 100%)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <p className="text-center text-[10px] font-black uppercase tracking-[0.4em] text-gray-500">revisit</p>
            <h3 className="mt-1 text-center text-lg font-black text-white">回头看看</h3>
            <p className="mt-2 text-center text-[12px] leading-relaxed text-gray-400">
              走过的区层还在原处。重游只为再刷一遍战利品与 SP——<br />
              不推进度、不加 HP 上限，心魔也不会再入档案。
            </p>
            <div className="mt-4 space-y-2">
              {Array.from({ length: maxCleared }, (_, i) => i + 1).map(lv => (
                <button
                  key={lv}
                  onClick={async () => {
                    setRevisitPick(false);
                    playSound('/battle-seal.mp3', 0.5);
                    await useAppStore.getState().startRevisit(lv);
                    showSpToast(`↩ 回望 · 第 ${lv} 区层已展开`);
                  }}
                  className="w-full rounded-xl px-4 py-3 text-left transition-colors"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <span className="text-sm font-black text-white">第 {lv} 区层</span>
                  <span className="ml-2 text-[11px] text-gray-400">
                    小影 Lv{lv} · 心魔 {SHADOW_LEVEL_CONFIG[lv - 1].maxHp}
                    {SHADOW_LEVEL_CONFIG[lv - 1].maxHp2 ? `+${SHADOW_LEVEL_CONFIG[lv - 1].maxHp2}` : ''} HP
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setRevisitPick(false)}
              className="mt-4 w-full rounded-xl py-2.5 text-sm font-bold text-gray-300"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              先不去
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body)}

    {/* Sub-modals */}
    <PersonaCreateModal isOpen={showPersonaCreate} onClose={() => setShowPersonaCreate(false)} />
    <StratumRevealModal isOpen={showReveal} onClose={() => setShowReveal(false)} level={nextStratumLevel} />
    <FinalBossRevealModal isOpen={showFinalReveal} onClose={() => setShowFinalReveal(false)} />
    {/* Lv6 终局演出：三条血归零后接管；杀进程重入靠 finalBossStage='finale' 恢复 */}
    <FinalBossFinale
      isOpen={finaleOpen}
      onDone={() => {
        setFinaleOpen(false);
        setShowBattle(false);
        setTowerOpen(false);
        setRecap('clear');
      }}
    />
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
    {/* R17 #5：战利品抽卡仪式（强敌/金色即场；心魔在终幕后接 VictoryModal） */}
    <AnimatePresence>
      {lootReveal && (
        <LootReveal
          open
          source={lootReveal.source}
          drops={lootReveal.drops}
          sp={lootReveal.sp}
          onClose={() => {
            const next = lootReveal.thenVictory;
            setLootReveal(null);
            if (next) setShowVictory(true);
          }}
        />
      )}
    </AnimatePresence>
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
