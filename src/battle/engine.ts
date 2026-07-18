/**
 * 战斗引擎 v2 · 回合解析器（BATTLE_UPGRADE_PLAN_V2.md §3）
 *
 * 纯逻辑、无 React、无 IO：随机源注入，可被模拟战脚本（tsx）直跑复现。
 * UI（BattleModal）通过 act() 驱动，拿到 { lines, fx } 渲染叙事与演出，
 * 并按 persist 补丁写回 store（引擎是战斗内的唯一事实源）。
 *
 * 机制总览：
 *  - 出战位面具（B案·自由切换）：仅当前属性技能可用；切换免费不耗回合
 *  - 三段乘区：(基础+平添) × (1+加算Σ) × 乘算Π
 *  - 五维克制环双向生效（输出侧 & 承伤侧）
 *  - 1More：弱点/暴击命中 → 追加行动（2 回合内不再触发，不连锁）
 *  - 失衡条（BOSS）：弱点充能 → 失衡（跳过行动+受伤×1.3+总攻击窗口）→ 3 回合免疫
 *  - 意图明牌：回合开始锁定；洞察（2SP 免回合）展开详情
 *  - 双向打断：玩家把前摇中的大招打入失衡=取消；Shadow 打断意图=真取消玩家蓄力
 *  - 状态口径：回合开始衰减 + fresh 免衰减（statusEngine）
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑，不解析 '@/' 别名）。
 */
import type { AffixKind, AttributeId, ChainKey, PersonaSkill, StatusEffect, StatusKind } from '../types';
import { EngineStatus, applyStatus, findStatus, removeStatus, tickTurnStart } from './statusEngine';
import {
  ringMultiplier, computeDamage, healAmount, turnPressureMult,
  DEFEND_DAMAGE_MULT, DEFEND_SP_REGEN, GUARD_COUNTER_ADD, INSIGHT_SP_COST,
  ATTACK_BOOST_FLAT, ATTACK_BOOST_TURNS, BUFF_ADD, VULNERABLE_ADD,
  CHARGE_MULT, CRIT_MULT, WEAKNESS_MULT, ONE_MORE_CD_TURNS,
  SKILL_CRIT_BY_LEVEL, GUTS_MASK_CRIT, KNOWLEDGE_MASK_WEAK_FLAT, DEX_MASK_EXTRA_EVERY,
  STAGGER_MAX, STAGGER_WEAKNESS_GAIN, STAGGER_CRIT_GAIN, STAGGER_TAKEN_MULT,
  STAGGER_IMMUNE_TURNS, ALL_OUT_SP_COST, ALL_OUT_BASE_RATIO, BOSS_FORCED_WINDOW_HP_RATIO,
  BOSS_ATTACK_BY_LEVEL, MOB_ATTACK_BY_LEVEL, ELITE_ATTACK_BY_LEVEL,
  SHADOW_CRIT_BY_LEVEL, PHASE2_ATTACK_MULT, PHASE2_RESIST_MULT,
  BERSERK_ATK_MULT, BERSERK_SELF_DAMAGE, HEAVY_POWER_MULT, HEAVY_WINDUP_TURNS,
  HEAVY_COOLDOWN_TURNS, GUARD_STANCE_MULT, GUARD_INTENT_ATTACK_MULT,
  DEBUFF_INTENT_ATTACK_MULT, SHADOW_ATKUP_MULT, SHADOW_ATKUP_TURNS,
  shadowPoisonValue, SHADOW_CALM_MULT, SHADOW_STATUS_TURNS,
  // ── 批3 · 养成与生态 ──
  masteryStars, MASTERY_STAR_ADD, RelicMods, ZERO_RELIC_MODS, BANDAGE_HP_THRESHOLD,
  CHAIN_STAGGER_WEAK_BONUS, CHAIN_CRIT_ADD, CHAIN_HEAL_AMP, CHAIN_LETHAL_GUARD,
  CHAIN_GUARD_COUNTER_ADD, CHAIN_FIRST_TURN_ADD, CHAIN_POISON_MEND, CHAIN_RESONANCE_AMP,
  AFFIX_CRIT_ADD, AFFIX_VENGEFUL_ATK, AFFIX_THORNS_PCT, AFFIX_SLIPPERY_FACTOR,
  OATH_HEAL_PCT, OATH_CHARGE_MULT, OATH_SELF_HP_COST_PCT, OATH_POISON_STACKS,
  OATH_POISON_DOT, OATH_SHIELD_PCT, OATH_SP_GAIN,
} from './numbers';
import {
  Intent, IntentKind, decideIntent, makeIntent, intentDetail, pickIntentLine,
  deriveShadowAttribute, initialHeavyCooldown,
} from './intents';
import {
  pickByLevel, PHASE2_DIALOGUE, DEFEAT_DIALOGUE, SHADOW_ATTACK_DIALOGUE,
  SHADOW_CRIT_DIALOGUE, STAGGER_DIALOGUE, HEAVY_RELEASE_DIALOGUE,
  SHADOW_BUFF_DIALOGUE, SHADOW_DEBUFF_DIALOGUE, PLAYER_DEFEAT_MONOLOGUE,
} from './dialogue';
import { pickShadowLine } from '../constants/shadowLines';

// ── 注入的技能效果映射（结构等同 constants/SKILL_EFFECT_MAP，引擎不依赖 '@/constants'） ──
export interface InjectedEffectDef {
  kind: StatusKind;
  target: 'player' | 'shadow';
  turns: number;
  value: number;
  stackable?: boolean;
  hint: string;
  label: string;
  icon: string;
}
export type InjectedEffectMap = Partial<Record<AttributeId, Partial<Record<PersonaSkill['type'], InjectedEffectDef>>>>;

// ── 输入 / 输出契约 ─────────────────────────────────────────
export interface EngineSetup {
  rng?: () => number;
  userName: string;
  attrNames: Record<AttributeId, string>;
  /** 各属性 Persona 显示名（叙事用；未 AI 化时可传"反抗者"） */
  personaNames: Record<AttributeId, string>;
  attrLevels: Record<AttributeId, number>;
  skills: Record<AttributeId, PersonaSkill[]>;
  /** 同伴永久战斗技能：属性 → 平添伤害 */
  damagePlus: Record<AttributeId, number>;
  /** 普通攻击伤害 = 五维等级和 */
  basicAttackPower: number;
  initialMask: AttributeId;
  playerHp: number;
  playerMaxHp: number;
  sp: number;
  shadow: {
    name: string;
    level: number;
    weakAttribute: AttributeId;
    attribute?: AttributeId;
    id: string;
    hp: number; maxHp: number;
    hp2?: number; maxHp2?: number;
    phase: 1 | 2;
    phase2WeakAttribute?: AttributeId;
    phase2ResistAttribute?: AttributeId;
    /** 攻击倍率%（金手指），默认 100 */
    attackScalePct?: number;
    responseLines: string[];
    /** 档位（批2）：小影无失衡条/只会攻击与异常；精英无狂化处刑；默认 boss */
    tier?: 'mob' | 'elite' | 'boss';
    /** （批3）词缀：强敌1条 / 心魔0-1条（加深+1）。顽固的 HP+30% 在生成时已应用 */
    affixes?: AffixKind[];
  };
  effectMap: InjectedEffectMap;
  /** （批2）本次登塔的临时伤害增益（事件/回响来源，进加算段） */
  sessionAddPct?: number;
  /** （批2）事件「被夺先手」：开场 Shadow 先攻一次 */
  firstStrikeStolen?: boolean;
  /** （批3）已装备遗物聚合修正（store 侧汇总；缺省全 0） */
  relicMods?: RelicMods;
  /** （批3）生效中的共鸣链（仅战斗内生效） */
  chain?: ChainKey | null;
  /** （批3）「记仇」词缀判定：玩家曾下塔撤离/败退 */
  playerEverRetreated?: boolean;
}

export type PlayerActionInput =
  | { kind: 'skill'; skill: PersonaSkill }
  | { kind: 'basic' }
  | { kind: 'defend' }
  | { kind: 'allOut'; qteMult: number }
  | { kind: 'switchMask'; attribute: AttributeId }
  | { kind: 'insight' }
  | { kind: 'itemHeal'; amount: number; label: string }
  | { kind: 'itemSp'; amount: number; label: string };

export type FxType =
  | 'shadowHit' | 'playerHit' | 'weak' | 'stagger' | 'staggerEnd' | 'phase2'
  | 'shadowDeath' | 'heal' | 'oneMore' | 'berserk' | 'maskSwitch'
  | 'chargeCancel' | 'block' | 'allOut';

export interface FxEvent {
  atLine: number;
  type: FxType;
  value?: number;
  isWeak?: boolean;
  isCrit?: boolean;
  hpAfter?: number;
  attr?: AttributeId;
}

export interface PersistPatch {
  playerHp: number;
  sp: number;
  shadowHp: number;
  shadowHp2: number | undefined;
  phase: 1 | 2;
  weakAttribute: AttributeId;
  phase2WeakAttribute?: AttributeId;
  phase2ResistAttribute?: AttributeId;
  activeMask: AttributeId;
}

export interface TurnResult {
  lines: string[];
  fx: FxEvent[];
  /** 是否消耗了回合（free action = false） */
  consumedTurn: boolean;
  /** 本次行动获得追加行动（Shadow 未行动，玩家可再动一次） */
  oneMore: boolean;
  outcome: 'ongoing' | 'victory' | 'defeat';
  persist: PersistPatch;
}

type StaggerState = 'none' | 'window';

// ── 引擎 ────────────────────────────────────────────────────
export class BattleEngine {
  private rng: () => number;
  private setup: EngineSetup;

  // 玩家态
  private playerHp: number;
  private playerMaxHp: number;
  private sp: number;
  private activeMask: AttributeId;
  private playerStatuses: EngineStatus[] = [];
  private chargeActive = false;
  /** 蓄力倍率覆写（蓄雷之誓 ×2.3；null=默认 ×2） */
  private chargeMultOverride: number | null = null;
  /** 攻击强化待消费加算值（含施放技能的熟练度加成；null=未激活） */
  private attackBuffAdd: number | null = null;
  private vulnerableArmed = false;   // 易伤兜底（打在 Shadow 身上的一次性加算）
  private attackBoostTurns = 0;
  private guardCounterReady = false;
  private defending = false;
  private oneMoreCd = 0;
  private insightUsedThisTurn = false;
  private charmFreeUsed = false;
  private kindnessRevived = false;
  private dexSkillCount = 0;
  private consecutiveWeakness = 0;
  private masksSummoned = new Set<AttributeId>();
  comboCount = 0;
  // ── 批3 · 养成侧一次性/待消费标记 ──
  private relicMods: RelicMods;
  private chain: ChainKey | null;
  private oneMoreArmed = false;      // 引雷针：1More 后下一击加算
  private maskSwitchArmed = false;   // 面具挂绳：换面具后首次攻击加算
  private stageCritArmed = false;    // 舞台魅影：换面具后首次攻击必暴击
  private stageCritUsed = false;
  private chainLethalUsed = false;   // 亡命身法：每场 1 次
  private oathSpUsed = false;        // 月光之誓：每场 1 次
  private ampNextAdd = 0;            // 增幅回路：命中后下次伤害加算

  // Shadow 态
  private shName: string;
  private shLevel: number;
  private shAttribute: AttributeId;
  private shWeak: AttributeId;
  private shHp: number; private shMaxHp: number;
  private shHp2: number | undefined; private shMaxHp2: number | undefined;
  private phase: 1 | 2;
  private phase2Weak?: AttributeId;
  private phase2Resist?: AttributeId;
  private shadowStatuses: EngineStatus[] = [];
  private berserk = false;
  private windupRemaining: number | null = null; // null=无前摇
  private heavyCooldown: number;
  private guardUsed = 0;
  private executeUsed = 0;
  private staggerGauge = 0;
  private staggerState: StaggerState = 'none';
  private staggerImmune = 0;
  private everStaggered = false;
  private forcedWindowUsed = false;
  private windowJustOpened = false;
  private weaknessHitCounts: Partial<Record<AttributeId, number>> = {};
  private attackScale: number;
  private affixes: AffixKind[];
  /** 月蚀词缀：弱点是否已被揭示（洞察 / 误打命中） */
  private weaknessRevealed = false;

  private turn = 1;
  private intent: Intent | null = null;
  private over: 'victory' | 'defeat' | null = null;
  private shTier: 'mob' | 'elite' | 'boss';
  private sessionAddPct: number;
  // 登塔回顾统计
  totalDamageDealt = 0;
  maxSingleHit = 0;
  weaknessHits = 0;

  constructor(setup: EngineSetup) {
    this.setup = setup;
    this.rng = setup.rng ?? Math.random;
    this.shTier = setup.shadow.tier ?? 'boss';
    this.sessionAddPct = setup.sessionAddPct ?? 0;
    this.relicMods = setup.relicMods ?? ZERO_RELIC_MODS;
    this.chain = setup.chain ?? null;
    this.affixes = setup.shadow.affixes ?? [];
    this.playerHp = setup.playerHp;
    this.playerMaxHp = setup.playerMaxHp;
    this.sp = setup.sp;
    this.activeMask = setup.initialMask;
    this.masksSummoned.add(setup.initialMask);

    const sh = setup.shadow;
    this.shName = sh.name;
    this.shLevel = Math.min(5, Math.max(1, sh.level));
    this.shWeak = sh.phase === 2 && sh.phase2WeakAttribute ? sh.phase2WeakAttribute : sh.weakAttribute;
    this.shAttribute = sh.attribute ?? deriveShadowAttribute(sh.id, sh.weakAttribute);
    this.shHp = sh.hp; this.shMaxHp = sh.maxHp;
    this.shHp2 = sh.hp2; this.shMaxHp2 = sh.maxHp2;
    this.phase = sh.phase;
    this.phase2Weak = sh.phase2WeakAttribute;
    this.phase2Resist = sh.phase2ResistAttribute;
    this.attackScale = (sh.attackScalePct ?? 100) / 100;
    this.heavyCooldown = initialHeavyCooldown();
  }

  // ── 只读快照（UI 渲染用） ──────────────────────────────
  get snapshot() {
    return {
      turn: this.turn,
      playerHp: this.playerHp, playerMaxHp: this.playerMaxHp, sp: this.sp,
      activeMask: this.activeMask,
      playerStatuses: this.playerStatuses as StatusEffect[],
      shadowStatuses: this.shadowStatuses as StatusEffect[],
      chargeActive: this.chargeActive, attackBuff: this.attackBuffAdd !== null,
      vulnerableArmed: this.vulnerableArmed,
      attackBoostTurns: this.attackBoostTurns,
      guardCounterReady: this.guardCounterReady,
      defending: this.defending,
      shadowHp: this.shHp, shadowMaxHp: this.shMaxHp,
      shadowHp2: this.shHp2, shadowMaxHp2: this.shMaxHp2,
      phase: this.phase,
      weakAttribute: this.shWeak,
      shadowAttribute: this.shAttribute,
      berserk: this.berserk,
      windup: this.windupRemaining !== null,
      intent: this.intent,
      staggerGauge: this.staggerGauge,
      staggerWindow: this.staggerState === 'window',
      staggerImmune: this.staggerImmune,
      canAllOut: this.staggerState === 'window' && this.sp >= ALL_OUT_SP_COST,
      allOutSpCost: ALL_OUT_SP_COST,
      insightAvailable: !this.insightUsedThisTurn && this.sp >= this.insightCost(),
      insightCost: this.insightCost(),
      comboCount: this.comboCount,
      over: this.over,
      masksSummoned: new Set(this.masksSummoned),
      charmFreeAvailable: this.activeMask === 'charm' && !this.charmFreeUsed,
      tier: this.shTier,
      totalDamageDealt: this.totalDamageDealt,
      maxSingleHit: this.maxSingleHit,
      weaknessHits: this.weaknessHits,
      // ── 批3 ──
      affixes: this.affixes,
      /** 月蚀：弱点未揭示（UI 显示 ？？？，WEAK 预判需跳过） */
      weaknessHidden: this.weaknessHidden(),
      oathSpUsed: this.oathSpUsed,
      chainKey: this.chain,
    };
  }

  private hasAffix(a: AffixKind): boolean { return this.affixes.includes(a); }
  private weaknessHidden(): boolean { return this.hasAffix('eclipse') && !this.weaknessRevealed; }
  private insightCost(): number { return this.chain === 'knowledge+charm' ? 0 : INSIGHT_SP_COST; }

  private persistPatch(): PersistPatch {
    return {
      playerHp: this.playerHp, sp: this.sp,
      shadowHp: this.shHp, shadowHp2: this.shHp2,
      phase: this.phase,
      weakAttribute: this.shWeak,
      phase2WeakAttribute: this.phase2Weak,
      phase2ResistAttribute: this.phase2Resist,
      activeMask: this.activeMask,
    };
  }

  private result(lines: string[], fx: FxEvent[], consumedTurn: boolean, oneMore: boolean): TurnResult {
    return {
      lines, fx, consumedTurn, oneMore,
      outcome: this.over ?? 'ongoing',
      persist: this.persistPatch(),
    };
  }

  /** 战斗开场：锁定首回合意图（不 tick）；「被夺先手」事件 /「迅捷」词缀时 Shadow 先攻一次 */
  openingTurn(): TurnResult {
    const lines: string[] = [];
    const fx: FxEvent[] = [];
    if (this.setup.firstStrikeStolen) {
      lines.push('先手被夺——它抢先出手了！');
      this.shadowAttack(1, false, lines, fx);
      if (this.over === 'defeat') return this.result(lines, fx, false, false);
    } else if (this.hasAffix('swift')) {
      lines.push('【迅捷】之影——它比你的思绪更快！');
      this.shadowAttack(1, false, lines, fx);
      if (this.over === 'defeat') return this.result(lines, fx, false, false);
    }
    this.lockIntent(lines, fx);
    return this.result(lines, fx, false, false);
  }

  // ── 行动入口 ────────────────────────────────────────────
  act(input: PlayerActionInput): TurnResult {
    if (this.over) return this.result([], [], false, false);
    switch (input.kind) {
      case 'switchMask': return this.doSwitchMask(input.attribute);
      case 'insight': return this.doInsight();
      case 'itemHeal': return this.doItemHeal(input.amount, input.label);
      case 'itemSp': return this.doItemSp(input.amount, input.label);
      case 'allOut':
        // 非法时机 / SP 不足：不吞回合（UI 已做门禁，这里是兜底）
        if (this.staggerState !== 'window' || this.sp < ALL_OUT_SP_COST) {
          return this.result(['时机未到——总攻击需要在失衡窗口中发动。'], [], false, false);
        }
        return this.doTurnAction(input);
      case 'skill':
        if (this.sp < this.skillCost(input.skill)) {
          return this.result(['SP 不足，无法施展这个技能。'], [], false, false);
        }
        if (input.skill.oathEffect === 'sp_once' && this.oathSpUsed) {
          return this.result(['誓约之力已在本场战斗中兑现——月光不会照两次。'], [], false, false);
        }
        return this.doTurnAction(input);
      default: return this.doTurnAction(input);
    }
  }

  /** 技能实际 SP 消耗（魅力面具首次免费；月光余响迷思减耗、下限 1） */
  skillCost(skill: PersonaSkill): number {
    if (this.activeMask === 'charm' && !this.charmFreeUsed) return 0;
    if (skill.socket?.kind === 'moon_echo' && skill.spCost > 0) {
      return Math.max(1, skill.spCost - skill.socket.value);
    }
    return skill.spCost;
  }

  /** 当前弱点（二形态会更换） */
  private currentWeak(): AttributeId {
    return this.shWeak;
  }

  // ── 自由行动 ────────────────────────────────────────────
  private doSwitchMask(attr: AttributeId): TurnResult {
    const lines: string[] = [];
    const fx: FxEvent[] = [];
    if (attr === this.activeMask) return this.result(lines, fx, false, false);
    this.activeMask = attr;
    const first = !this.masksSummoned.has(attr);
    this.masksSummoned.add(attr);
    // 批3：面具挂绳（首次攻击加算）/ 舞台魅影（首次攻击必暴击，每场1次）武装
    if (this.relicMods.maskSwitchAdd > 0) this.maskSwitchArmed = true;
    if (this.chain === 'dexterity+charm' && !this.stageCritUsed) this.stageCritArmed = true;
    fx.push({ atLine: 0, type: 'maskSwitch', attr, isCrit: first });
    return this.result(lines, fx, false, false);
  }

  private doInsight(): TurnResult {
    const lines: string[] = [];
    const fx: FxEvent[] = [];
    const cost = this.insightCost();
    if (this.insightUsedThisTurn || this.sp < cost) return this.result(lines, fx, false, false);
    this.sp -= cost;
    this.insightUsedThisTurn = true;
    if (cost === 0) lines.push('【雄辩之智】共鸣——洞察不费吹灰之力。');
    lines.push(`你凝神洞察 ${this.shName} 的气息……`);
    // 月蚀词缀：洞察揭开隐藏的弱点
    if (this.weaknessHidden()) {
      this.weaknessRevealed = true;
      lines.push(`月蚀散去——它的弱点是【${this.setup.attrNames[this.shWeak]}】！`);
    }
    const detail = this.intent
      ? this.intent.detail
      : '尚未捕捉到明确的意图。';
    lines.push(detail);
    lines.push(`${this.shName}：${pickShadowLine('insightUsed', this.shName) || '哼……你也只是在看罢了。'}`);
    return this.result(lines, fx, false, false);
  }

  private doItemHeal(amount: number, label: string): TurnResult {
    const applied = Math.min(this.playerMaxHp - this.playerHp, Math.max(0, amount));
    this.playerHp += applied;
    const lines = [`${label} · 回复了 ${applied} 点体力。`];
    const fx: FxEvent[] = [{ atLine: 0, type: 'heal', value: applied, hpAfter: this.playerHp }];
    return this.result(lines, fx, false, false);
  }

  private doItemSp(amount: number, label: string): TurnResult {
    this.sp += Math.max(0, amount);
    const lines = [`${label} · 回复了 ${amount} 点 SP。`];
    return this.result(lines, [], false, false);
  }

  // ── 回合行动主流程 ──────────────────────────────────────
  private doTurnAction(input: Extract<PlayerActionInput, { kind: 'skill' | 'basic' | 'defend' | 'allOut' }>): TurnResult {
    const lines: string[] = [];
    const fx: FxEvent[] = [];
    this.windowJustOpened = false;
    const windowOpenAtStart = this.staggerState === 'window';
    this.defending = false;

    let grantedExtra = false;

    // ── 玩家阶段
    switch (input.kind) {
      case 'skill': grantedExtra = this.resolveSkill(input.skill, lines, fx); break;
      case 'basic': this.resolveBasic(lines, fx); break;
      case 'defend': this.resolveDefend(lines); break;
      case 'allOut': this.resolveAllOut(input.qteMult, lines, fx); break;
    }

    if (this.over === 'victory') {
      this.appendDefeatLines(lines, fx);
      return this.result(lines, fx, true, false);
    }

    // ── 二形态转变：演出紧跟伤害行；变身消耗 Shadow 的下一次行动
    //   （用实例级标志：即使转变发生在 1More 连段中，跳过也不会丢失）
    this.flushPhase2Lines(lines, fx);

    // ── 追加行动：Shadow 本次不响应，同一回合内玩家再动一次
    if (grantedExtra) {
      return this.result(lines, fx, true, true);
    }

    // ── 总攻击窗口关闭（进入本行动时窗口已开 → 本行动结束后收口）
    if (windowOpenAtStart && this.staggerState === 'window') {
      this.closeStaggerWindow(lines, fx);
    }

    // ── Shadow 阶段（刚变身 / 刚触发失衡的回合跳过；变身演出优先）
    if (this.phase2ActionSkip) {
      this.phase2ActionSkip = false;
      lines.push(`${this.shName} 正在重塑形体——这个回合它无暇顾及你。`);
    } else if (this.windowJustOpened) {
      lines.push(`${this.shName} 失去平衡，无法行动！`);
      lines.push(`${this.shName}：${pickByLevel(STAGGER_DIALOGUE, this.shLevel, this.rng)}`);
    } else if (!this.over) {
      this.shadowPhase(lines, fx);
    }

    if (this.over === 'defeat') {
      return this.result(lines, fx, true, false);
    }

    // ── 回合收尾 + 下回合开始（tick + 锁意图）
    this.endTurn(lines, fx);
    if (this.over === 'victory') {
      this.appendDefeatLines(lines, fx);
    }
    return this.result(lines, fx, true, false);
  }

  // ── 玩家：技能 ─────────────────────────────────────────
  private resolveSkill(skill: PersonaSkill, lines: string[], fx: FxEvent[]): boolean {
    const attr = this.activeMask;
    const attrName = this.setup.attrNames[attr];
    const personaName = this.setup.personaNames[attr] ?? '反抗者';

    // SP（魅力面具：每场一次免费；月光余响迷思减耗）
    const cost = this.skillCost(skill);
    if (cost === 0 && skill.spCost > 0 && this.activeMask === 'charm' && !this.charmFreeUsed) {
      this.charmFreeUsed = true;
      lines.push('面具之力：本次技能不消耗SP！');
    }
    this.sp = Math.max(0, this.sp - cost);

    // 灵巧面具：每第 5 次技能获得追加行动
    let grantedExtra = false;
    if (this.activeMask === 'dexterity') {
      this.dexSkillCount++;
      if (this.dexSkillCount % DEX_MASK_EXTRA_EVERY === 0) {
        grantedExtra = true;
        lines.push('面具之力：获得追加行动！');
        fx.push({ atLine: lines.length - 1, type: 'oneMore' });
        if (this.relicMods.oneMoreAdd > 0) this.oneMoreArmed = true; // 引雷针武装
      }
    }

    const isDamage = skill.type === 'damage' || skill.type === 'crit' || skill.type === 'attack_boost';
    lines.push(`${personaName} 使用了 ${skill.name}！`);

    if (isDamage) {
      const isWeakness = attr === this.currentWeak();
      // 月蚀：误打命中隐藏弱点 → 弱点当场暴露
      if (isWeakness && this.weaknessHidden()) {
        this.weaknessRevealed = true;
        lines.push('被月蚀掩藏的弱点——暴露了！');
      }
      // 暴击判定：crit 技能基础 + 胆量面具 + 连击 buff + 星图遗物 + 精算连击 + 慧眼迷思
      const critBuff = findStatus(this.playerStatuses, 'crit_buff')?.value ?? 0;
      let critChance = critBuff + this.relicMods.critAdd;
      if (skill.type === 'crit') critChance += SKILL_CRIT_BY_LEVEL[Math.min(skill.level - 1, 4)];
      if (this.activeMask === 'guts') critChance += GUTS_MASK_CRIT;
      if (this.chain === 'knowledge+dexterity') critChance += CHAIN_CRIT_ADD;
      if (skill.socket?.kind === 'keen_eye') critChance += skill.socket.value;
      let isCrit = this.rng() < critChance;
      // 舞台魅影：换面具后的首次攻击必定暴击（每场 1 次）
      if (this.stageCritArmed && !this.stageCritUsed) {
        this.stageCritArmed = false;
        this.stageCritUsed = true;
        if (!isCrit) { isCrit = true; lines.push('【舞台魅影】共鸣——聚光灯下的一击，必中要害！'); }
      }

      // 三段乘区
      const flats: number[] = [];
      const adds: number[] = [];
      const mults: number[] = [];
      if (this.attackBoostTurns > 0 && skill.type !== 'attack_boost') {
        flats.push(ATTACK_BOOST_FLAT);
        lines.push(`攻击增益：+${ATTACK_BOOST_FLAT}（剩余${this.attackBoostTurns}回合）`);
      }
      flats.push(this.setup.damagePlus[attr] ?? 0);
      if (this.activeMask === 'knowledge' && isWeakness) flats.push(KNOWLEDGE_MASK_WEAK_FLAT);

      if (this.sessionAddPct > 0) adds.push(this.sessionAddPct); // 登塔临时增益（buff 徽标由 UI 常驻展示，不进叙事）
      // ── 批3 加算段：熟练度星级 / 音叉 / 单片镜·破绽洞察（弱点） / 烈焰亮相（首回合） ──
      const stars = masteryStars(skill.mastery ?? 0, skill.level);
      if (stars > 0) adds.push(stars * MASTERY_STAR_ADD);
      if (this.relicMods.addAll > 0) adds.push(this.relicMods.addAll);
      if (isWeakness) {
        if (this.relicMods.weaknessAdd > 0) adds.push(this.relicMods.weaknessAdd);
        if (skill.socket?.kind === 'flaw_insight') adds.push(skill.socket.value);
      }
      if (this.chain === 'guts+charm' && this.turn === 1) {
        adds.push(CHAIN_FIRST_TURN_ADD);
        lines.push('【烈焰亮相】共鸣——开幕的火焰格外炽烈！');
      }
      if (this.oneMoreArmed) {
        this.oneMoreArmed = false;
        if (this.relicMods.oneMoreAdd > 0) {
          adds.push(this.relicMods.oneMoreAdd);
          lines.push('引雷针导流——追击的雷势更猛！');
        }
      }
      if (this.maskSwitchArmed) {
        this.maskSwitchArmed = false;
        if (this.relicMods.maskSwitchAdd > 0) adds.push(this.relicMods.maskSwitchAdd);
      }
      if (this.ampNextAdd > 0) { adds.push(this.ampNextAdd); this.ampNextAdd = 0; }
      if (this.attackBuffAdd !== null) {
        adds.push(this.attackBuffAdd);
        lines.push(`攻击强化触发！伤害 +${Math.round(this.attackBuffAdd * 100)}%！`);
        this.attackBuffAdd = null;
      }
      if (this.vulnerableArmed) { adds.push(VULNERABLE_ADD); this.vulnerableArmed = false; lines.push('易伤触发！伤害 +30%！'); }
      const resonance = findStatus(this.playerStatuses, 'resonance');
      if (resonance) {
        // 月下共鸣：共鸣效果 ×1.3
        const resAdd = (resonance.value - 1) * (this.chain === 'kindness+charm' ? CHAIN_RESONANCE_AMP : 1);
        adds.push(resAdd);
        this.playerStatuses = removeStatus(this.playerStatuses, 'resonance');
        lines.push(`【共鸣】触发！伤害 +${Math.round(resAdd * 100)}%！`);
      }
      const mark = findStatus(this.shadowStatuses, 'mark');
      if (mark) { adds.push(mark.value - 1); lines.push(`【猎手标记】：伤害 +${Math.round((mark.value - 1) * 100)}%！`); }
      if (this.guardCounterReady) {
        const counterAdd = this.chain === 'guts+kindness' ? CHAIN_GUARD_COUNTER_ADD : GUARD_COUNTER_ADD;
        adds.push(counterAdd);
        this.guardCounterReady = false;
        lines.push(`格挡反击！伤害 +${Math.round(counterAdd * 100)}%！`);
      }

      if (this.chargeActive) {
        const chargeMult = this.chargeMultOverride ?? CHARGE_MULT;
        mults.push(chargeMult);
        if (this.relicMods.chargeAdd > 0) adds.push(this.relicMods.chargeAdd); // 逆流沙漏
        this.chargeActive = false;
        this.chargeMultOverride = null;
        lines.push(chargeMult > CHARGE_MULT ? `蓄雷炸裂！伤害 ×${chargeMult}！` : '蓄力爆发！伤害翻倍！');
      }
      if (isCrit) mults.push(CRIT_MULT);
      if (isWeakness) mults.push(WEAKNESS_MULT);
      const ring = ringMultiplier(attr, this.shAttribute);
      if (ring !== 1) {
        mults.push(ring);
        lines.push(ring > 1 ? `属性克制！${attrName} ⇧ 伤害 ×1.2` : `属性受克…${attrName} ⇩ 伤害 ×0.8`);
      }
      if (this.staggerState === 'window') mults.push(STAGGER_TAKEN_MULT);
      const guardStance = findStatus(this.shadowStatuses, 'guard_stance');
      if (guardStance) { mults.push(guardStance.value); lines.push(`${this.shName} 处于警戒——伤害被削减！`); }
      if (this.phase === 2 && this.phase2Resist === attr) {
        mults.push(PHASE2_RESIST_MULT);
        lines.push(`${this.shName} 对${attrName}产生了耐性……伤害 ×0.7`);
      }

      const dmg = computeDamage(skill.power, flats, adds, mults);
      this.damageShadow(dmg);
      if (isWeakness) {
        this.weaknessHits++;
        this.weaknessHitCounts[attr] = (this.weaknessHitCounts[attr] ?? 0) + 1;
        lines.push(`效果拔群！造成了 ${dmg} 点伤害！`);
        if (this.activeMask === 'knowledge') lines.push('面具之力：弱点伤害+2！');
      } else if (isCrit) {
        lines.push(`暴击！造成了 ${dmg} 点伤害！`);
      } else {
        lines.push(`造成了 ${dmg} 点伤害。`);
      }
      fx.push({ atLine: lines.length - 1, type: 'shadowHit', value: dmg, isWeak: isWeakness, isCrit });
      if (isWeakness) fx.push({ atLine: lines.length - 1, type: 'weak' });
      if (isWeakness || isCrit) this.comboCount++;

      // 燃魂之誓：自损 10% 当前 HP（不致死）
      if (skill.oathEffect === 'self_hp_cost' && this.playerHp > 1) {
        const selfCost = Math.min(this.playerHp - 1, Math.max(1, Math.round(this.playerHp * OATH_SELF_HP_COST_PCT)));
        this.playerHp -= selfCost;
        lines.push(`誓约的代价：灼烧自身 ${selfCost} 点体力。`);
        fx.push({ atLine: lines.length - 1, type: 'playerHit', value: selfCost, hpAfter: this.playerHp });
      }

      // 迷思附带效果（命中后触发）
      this.applyMythOnHit(skill, dmg, lines, fx);

      // 荆棘词缀：反弹直接伤害
      this.applyThorns(dmg, lines, fx);
      if (this.over === 'defeat') return grantedExtra;

      // attack_boost 的附带效果
      if (skill.type === 'attack_boost') this.applyMappedEffect(skill, 'attack_boost', lines);

      // 连续弱点（警戒决策用）
      this.consecutiveWeakness = isWeakness ? this.consecutiveWeakness + 1 : 0;

      // 失衡充能（BOSS 常备失衡条；失衡助推迷思增幅）
      const staggerAmp = skill.socket?.kind === 'stagger_boost' ? 1 + skill.socket.value : 1;
      this.gainStagger(isWeakness, isCrit, lines, fx, staggerAmp);

      // 濒死保底窗口
      this.maybeForcedWindow(lines, fx);

      // 1More
      if ((isWeakness || isCrit) && this.oneMoreCd <= 0 && !grantedExtra && this.staggerState !== 'window') {
        this.oneMoreCd = ONE_MORE_CD_TURNS;
        lines.push('1 MORE！乘胜追击——再行动一次！');
        fx.push({ atLine: lines.length - 1, type: 'oneMore' });
        grantedExtra = true;
        if (this.relicMods.oneMoreAdd > 0) this.oneMoreArmed = true; // 引雷针武装
      }
    } else if (skill.type === 'buff') {
      this.consecutiveWeakness = 0;
      if (skill.oathEffect === 'sp_once') {
        // 月光之誓：+18 SP，每场 1 次（重复点击已在 act() 拦截）
        this.oathSpUsed = true;
        this.sp += OATH_SP_GAIN;
        lines.push(`月光倾泻——回复了 ${OATH_SP_GAIN} 点 SP！（本场仅此一次）`);
      } else if (skill.oathEffect === 'shield_block') {
        // 铁壁之誓：护盾 60% + 本回合视为完全格挡（反击预备）
        this.playerStatuses = applyStatus(this.playerStatuses, {
          kind: 'shield', remainingTurns: 1, value: OATH_SHIELD_PCT, stacks: 1, sourceName: skill.name,
        });
        this.guardCounterReady = true;
        lines.push(`铁壁展开！获得 ${Math.round(OATH_SHIELD_PCT * 100)}% 护盾——下回合首次攻击 +50%！`);
      } else {
        const stars = masteryStars(skill.mastery ?? 0, skill.level);
        this.attackBuffAdd = BUFF_ADD * (1 + stars * MASTERY_STAR_ADD);
        lines.push(`攻击力强化！下次伤害 +${Math.round(this.attackBuffAdd * 100)}%！`);
      }
    } else if (skill.type === 'debuff') {
      this.consecutiveWeakness = 0;
      if (skill.oathEffect === 'poison_calm') {
        // 蚀影之誓：3 层中毒 + 镇静 1 回合
        const dot = Math.round(OATH_POISON_DOT * (1 + this.relicMods.poisonAmp));
        this.shadowStatuses = applyStatus(this.shadowStatuses, {
          kind: 'poison', remainingTurns: 3, value: dot, stacks: OATH_POISON_STACKS, sourceName: skill.name,
        }, true, OATH_POISON_STACKS);
        this.shadowStatuses = applyStatus(this.shadowStatuses, {
          kind: 'calm', remainingTurns: 1, value: 0.7, stacks: 1, sourceName: skill.name,
        });
        lines.push(`蚀影缠绕！${this.shName} 中了 ${OATH_POISON_STACKS} 层剧毒（${dot}/层·回合），攻击也被镇静削弱！`);
      } else if (!this.applyMappedEffect(skill, 'debuff', lines)) {
        this.vulnerableArmed = true;
        lines.push(`${this.shName} 陷入易伤！下次攻击 +30%！`);
      }
    } else if (skill.type === 'charge') {
      this.chargeActive = true;
      this.consecutiveWeakness = 0;
      if (skill.oathEffect === 'charge_23') {
        this.chargeMultOverride = OATH_CHARGE_MULT;
        lines.push(`雷霆在面具之后凝聚……下次技能伤害 ×${OATH_CHARGE_MULT}！（小心 Shadow 的打断）`);
      } else {
        lines.push('正在蓄力……下次技能伤害将翻倍！（小心 Shadow 的打断）');
      }
    } else if (skill.type === 'heal') {
      this.consecutiveWeakness = 0;
      const stars = masteryStars(skill.mastery ?? 0, skill.level);
      let amount = skill.oathEffect === 'heal_pct_max'
        ? Math.round(this.playerMaxHp * OATH_HEAL_PCT)
        : healAmount(skill.power, attr);
      amount = Math.round(amount * (1 + stars * MASTERY_STAR_ADD) * (this.chain === 'knowledge+kindness' ? 1 + CHAIN_HEAL_AMP : 1));
      const applied = Math.min(this.playerMaxHp - this.playerHp, amount);
      this.playerHp += applied;
      if (this.chain === 'knowledge+kindness' && applied > 0) lines.push('【疗理之学】共鸣——回复效果提升！');
      lines.push(`回复了 ${applied} 点体力！`);
      fx.push({ atLine: lines.length - 1, type: 'heal', value: applied, hpAfter: this.playerHp });
    }

    return grantedExtra;
  }

  /** 按注入的效果映射施加状态；返回是否命中映射 */
  private applyMappedEffect(skill: PersonaSkill, slot: 'debuff' | 'attack_boost', lines: string[]): boolean {
    const mapped = this.setup.effectMap[this.activeMask]?.[slot];
    if (!mapped) {
      if (slot === 'attack_boost' && this.attackBoostTurns <= 0) {
        this.attackBoostTurns = ATTACK_BOOST_TURNS;
        lines.push(`攻击增益发动！接下来${ATTACK_BOOST_TURNS}回合伤害+${ATTACK_BOOST_FLAT}！`);
      }
      return slot === 'attack_boost';
    }
    // 蚀骨之牙遗物：玩家对 Shadow 施加的中毒强度 ×(1+x)
    const value = mapped.kind === 'poison' && mapped.target === 'shadow' && this.relicMods.poisonAmp > 0
      ? Math.round(mapped.value * (1 + this.relicMods.poisonAmp))
      : mapped.value;
    const eff: StatusEffect = {
      kind: mapped.kind,
      remainingTurns: mapped.turns,
      value,
      stacks: 1,
      sourceName: skill.name,
    };
    if (mapped.target === 'player') {
      this.playerStatuses = applyStatus(this.playerStatuses, eff, mapped.stackable);
    } else {
      this.shadowStatuses = applyStatus(this.shadowStatuses, eff, mapped.stackable);
    }
    lines.push(`【${mapped.label}】${mapped.hint}`);
    return true;
  }

  /** 迷思石命中后附带效果（批3 §10.3；仅伤害类技能触发） */
  private applyMythOnHit(skill: PersonaSkill, dmg: number, lines: string[], fx: FxEvent[]) {
    const socket = skill.socket;
    if (!socket || dmg <= 0 || this.over) return;
    switch (socket.kind) {
      case 'charge_echo':
        if (!this.chargeActive && this.rng() < socket.value) {
          this.chargeActive = true;
          lines.push('【蓄力余韵】迷思共振——力量再次凝聚！下次技能伤害翻倍！');
        }
        break;
      case 'life_siphon': {
        const healed = Math.min(this.playerMaxHp - this.playerHp, socket.value);
        if (healed > 0) {
          this.playerHp += healed;
          lines.push(`【生命虹吸】回复了 ${healed} 点体力。`);
          fx.push({ atLine: lines.length - 1, type: 'heal', value: healed, hpAfter: this.playerHp });
        }
        break;
      }
      case 'venom_bite': {
        const dot = Math.round(socket.value * (1 + this.relicMods.poisonAmp));
        this.shadowStatuses = applyStatus(this.shadowStatuses, {
          kind: 'poison', remainingTurns: 3, value: dot, stacks: 1, sourceName: skill.name,
        }, true);
        lines.push(`【淬毒之牙】毒素渗入——${this.shName} 中毒了（${dot}/回合）。`);
        break;
      }
      case 'calm_ripple':
        if (this.rng() < socket.value) {
          this.shadowStatuses = applyStatus(this.shadowStatuses, {
            kind: 'calm', remainingTurns: 1, value: 0.7, stacks: 1, sourceName: skill.name,
          });
          lines.push(`【镇静涟漪】荡开——${this.shName} 的攻击被削弱了。`);
        }
        break;
      case 'amp_circuit':
        this.ampNextAdd = socket.value;
        lines.push(`【增幅回路】充能——下次伤害 +${Math.round(socket.value * 100)}%。`);
        break;
      // keen_eye / flaw_insight / moon_echo / stagger_boost 在各自判定点生效
      case 'keen_eye': case 'flaw_insight': case 'moon_echo': case 'stagger_boost': break;
    }
  }

  /** 荆棘词缀：反弹 10% 所受直接伤害（技能/普攻/总攻击） */
  private applyThorns(dmg: number, lines: string[], fx: FxEvent[]) {
    if (!this.hasAffix('thorns') || dmg <= 0 || this.over === 'victory') return;
    const reflect = Math.max(1, Math.round(dmg * AFFIX_THORNS_PCT));
    this.playerHp = Math.max(0, this.playerHp - reflect);
    lines.push(`【荆棘】反噬——你受到 ${reflect} 点反弹伤害！`);
    fx.push({ atLine: lines.length - 1, type: 'playerHit', value: reflect, hpAfter: this.playerHp });
    if (this.playerHp <= 0) this.handlePlayerLethal(lines);
  }

  // ── 玩家：普通攻击 / 防御 / 总攻击 ─────────────────────
  private resolveBasic(lines: string[], fx: FxEvent[]) {
    this.consecutiveWeakness = 0;
    const dmg = Math.max(1, this.setup.basicAttackPower);
    lines.push(`你向 ${this.shName} 发起了普通攻击！`);
    this.damageShadow(dmg);
    lines.push(`造成了 ${dmg} 点伤害。`);
    fx.push({ atLine: lines.length - 1, type: 'shadowHit', value: dmg });
    this.applyThorns(dmg, lines, fx);
    if (this.over === 'defeat') return;
    this.maybeForcedWindow(lines, fx);
  }

  private resolveDefend(lines: string[]) {
    this.defending = true;
    this.consecutiveWeakness = 0;
    // 规则说明放在按钮副标签上，叙事只报动作本身（验收反馈：每次都念规则太啰嗦）
    lines.push('你稳固身形，进入防御姿态。');
  }

  private resolveAllOut(qteMult: number, lines: string[], fx: FxEvent[]) {
    if (this.staggerState !== 'window' || this.sp < ALL_OUT_SP_COST) {
      lines.push('时机未到——总攻击需要在失衡窗口中发动。');
      return;
    }
    this.sp -= ALL_OUT_SP_COST;
    this.consecutiveWeakness = 0;
    const lv5Sum = Object.values(this.setup.skills).flat()
      .filter(s => s.level === 5)
      .reduce((sum, s) => sum + s.power, 0);
    const dmg = Math.round(lv5Sum * ALL_OUT_BASE_RATIO * qteMult * STAGGER_TAKEN_MULT);
    lines.push(`${this.shName}：${pickShadowLine('allOutReady', this.shName) || '那是……禁忌的力量！'}`);
    lines.push('总攻击！五副面具的力量汇于一击！');
    fx.push({ atLine: lines.length - 1, type: 'allOut' });
    this.damageShadow(dmg);
    lines.push(`造成 ${dmg} 点巨额伤害！`);
    fx.push({ atLine: lines.length - 1, type: 'shadowHit', value: dmg, isWeak: true });
    this.applyThorns(dmg, lines, fx);
  }

  // ── Shadow 阶段 ─────────────────────────────────────────
  private shadowPhase(lines: string[], fx: FxEvent[]) {
    const intent = this.intent?.kind ?? 'attack';

    // 恐惧：概率跳过（消耗）
    const fear = findStatus(this.shadowStatuses, 'fear');
    if (fear && this.rng() < fear.value) {
      this.shadowStatuses = removeStatus(this.shadowStatuses, 'fear');
      lines.push(`${this.shName} 被恐惧所缚，动弹不得！`);
      lines.push(`${this.shName}：${pickShadowLine('feared', this.shName)}`);
      return;
    }
    // 魅惑：概率自伤（消耗）
    const beguile = findStatus(this.shadowStatuses, 'beguile');
    if (beguile && this.rng() < beguile.value) {
      this.shadowStatuses = removeStatus(this.shadowStatuses, 'beguile');
      const selfDmg = Math.max(1, Math.round(this.baseAttack() * 1.2));
      lines.push(`${this.shName}：${pickShadowLine('beguiled', this.shName)}`);
      this.damageShadow(selfDmg);
      lines.push(`${this.shName} 在魅惑中自伤 ${selfDmg} 点！`);
      fx.push({ atLine: lines.length - 1, type: 'shadowHit', value: selfDmg });
      return;
    }

    switch (intent) {
      case 'berserk': {
        this.berserk = true;
        lines.push(`${this.shName} 的能量开始失控……`);
        lines.push(`${this.shName}：${pickShadowLine('berserk', this.shName)}`);
        lines.push(`Shadow 进入【狂化】！攻击 ×${BERSERK_ATK_MULT}，每回合自损${BERSERK_SELF_DAMAGE}点。`);
        fx.push({ atLine: lines.length - 1, type: 'berserk' });
        this.shadowAttack(1, false, lines, fx);
        break;
      }
      case 'execute': {
        this.executeUsed++;
        lines.push(`${this.shName}：${pickShadowLine('playerLowHp', this.shName) || '结束了。'}`);
        this.shadowAttack(1, true, lines, fx);
        break;
      }
      case 'interrupt': {
        if (this.chargeActive) {
          this.chargeActive = false;
          lines.push(`${this.shName}：${pickShadowLine('interrupt', this.shName) || '就是现在——你的破绽！'}`);
          lines.push('你的蓄力被打断了！');
          fx.push({ atLine: lines.length - 1, type: 'chargeCancel' });
        } else {
          lines.push(`${this.shName} 想打断你的节奏——却扑了个空。`);
        }
        this.shadowAttack(1, false, lines, fx);
        break;
      }
      case 'guard': {
        this.guardUsed++;
        this.consecutiveWeakness = 0;
        this.shadowStatuses = applyStatus(this.shadowStatuses, {
          kind: 'guard_stance', remainingTurns: 1, value: GUARD_STANCE_MULT, stacks: 1, sourceName: '警戒',
        });
        lines.push(`${this.shName} 警戒起来——下回合它受到的伤害将减少。`);
        lines.push(`${this.shName}：${pickShadowLine('guarding', this.shName)}`);
        this.shadowAttack(GUARD_INTENT_ATTACK_MULT, false, lines, fx);
        break;
      }
      case 'heavy': {
        this.windupRemaining = HEAVY_WINDUP_TURNS;
        this.heavyCooldown = HEAVY_COOLDOWN_TURNS;
        lines.push(`${this.shName} 蓄势待发——大招正在酝酿！（趁前摇将它打入失衡可以打断）`);
        break;
      }
      case 'heavyRelease': {
        this.windupRemaining = null;
        lines.push(`${this.shName}：${pickByLevel(HEAVY_RELEASE_DIALOGUE, this.shLevel, this.rng)}`);
        this.shadowAttack(HEAVY_POWER_MULT, false, lines, fx);
        break;
      }
      case 'buff': {
        this.shadowStatuses = applyStatus(this.shadowStatuses, {
          kind: 'atk_up', remainingTurns: SHADOW_ATKUP_TURNS, value: SHADOW_ATKUP_MULT, stacks: 1, sourceName: '强化',
        });
        lines.push(`${this.shName}：${pickByLevel(SHADOW_BUFF_DIALOGUE, this.shLevel, this.rng)}`);
        lines.push(`${this.shName} 强化了自身！接下来${SHADOW_ATKUP_TURNS}回合攻击提升。`);
        break;
      }
      case 'debuff': {
        lines.push(`${this.shName}：${pickByLevel(SHADOW_DEBUFF_DIALOGUE, this.shLevel, this.rng)}`);
        if (this.rng() < 0.5) {
          const v = shadowPoisonValue(this.baseAttack());
          this.playerStatuses = applyStatus(this.playerStatuses, {
            kind: 'poison', remainingTurns: SHADOW_STATUS_TURNS, value: v, stacks: 1, sourceName: '侵蚀',
          }, true);
          lines.push(`你中了【侵蚀之毒】！每回合损失 ${v} 点体力（${SHADOW_STATUS_TURNS}回合）。`);
        } else {
          this.playerStatuses = applyStatus(this.playerStatuses, {
            kind: 'calm', remainingTurns: SHADOW_STATUS_TURNS, value: SHADOW_CALM_MULT, stacks: 1, sourceName: '侵蚀',
          });
          lines.push(`你的力量被侵蚀……攻击 ×${SHADOW_CALM_MULT}（${SHADOW_STATUS_TURNS}回合）。`);
        }
        this.shadowAttack(DEBUFF_INTENT_ATTACK_MULT, false, lines, fx);
        break;
      }
      default: {
        this.shadowAttack(1, false, lines, fx);
      }
    }
  }

  /** Shadow 基础攻击力（档位等级表 × 金手指倍率） */
  private baseAttack(): number {
    const table = this.shTier === 'mob' ? MOB_ATTACK_BY_LEVEL
      : this.shTier === 'elite' ? ELITE_ATTACK_BY_LEVEL
      : BOSS_ATTACK_BY_LEVEL;
    return Math.max(1, Math.round(table[this.shLevel - 1] * this.attackScale));
  }

  private shadowAttack(intentMult: number, forceCrit: boolean, lines: string[], fx: FxEvent[]) {
    let atk = this.baseAttack();
    if (this.berserk) atk *= BERSERK_ATK_MULT;
    if (this.phase === 2) atk *= PHASE2_ATTACK_MULT;
    if (this.hasAffix('vengeful') && this.setup.playerEverRetreated) atk *= AFFIX_VENGEFUL_ATK; // 记仇
    const atkUp = findStatus(this.shadowStatuses, 'atk_up');
    if (atkUp) atk *= atkUp.value;
    const calm = findStatus(this.shadowStatuses, 'calm');
    if (calm) atk *= calm.value;
    atk *= intentMult;
    atk *= turnPressureMult(this.turn);

    // 暴击（敏锐词缀 +10%）
    const critPenalty = findStatus(this.shadowStatuses, 'crit_debuff')?.value ?? 0;
    const critChance = Math.max(0, SHADOW_CRIT_BY_LEVEL[this.shLevel - 1] - critPenalty
      + (this.hasAffix('keen') ? AFFIX_CRIT_ADD : 0));
    const isCrit = forceCrit || this.rng() < critChance;
    if (isCrit) atk *= CRIT_MULT;

    // 执念绷带：HP<30% 时受伤减免
    if (this.relicMods.lowHpGuard > 0 && this.playerHp / Math.max(1, this.playerMaxHp) < BANDAGE_HP_THRESHOLD) {
      atk *= 1 - this.relicMods.lowHpGuard;
    }

    // 克制环（承伤侧：Shadow 属性向 vs 出战面具）——提示只在受伤时随叙事出现，不做常驻角标
    const defRing = ringMultiplier(this.shAttribute, this.activeMask);
    atk *= defRing;
    if (defRing > 1) {
      lines.push(`属性受克！【${this.setup.attrNames[this.activeMask]}】面具难以招架，来袭伤害 ×1.2……`);
    } else if (defRing < 1) {
      lines.push(`面具属性占优！【${this.setup.attrNames[this.activeMask]}】削减了来袭伤害 ×0.8。`);
    }

    let dmg = Math.max(0, Math.round(atk));
    const original = dmg;

    // 护盾吸收（消耗）
    const shield = findStatus(this.playerStatuses, 'shield');
    if (shield && dmg > 0) {
      const absorbed = Math.round(dmg * shield.value);
      dmg = Math.max(0, dmg - absorbed);
      this.playerStatuses = removeStatus(this.playerStatuses, 'shield');
      lines.push(`护盾吸收了 ${absorbed} 点伤害！`);
    }
    // 防御减半
    if (this.defending && dmg > 0) {
      dmg = Math.round(dmg * DEFEND_DAMAGE_MULT);
      lines.push('防御生效：伤害减半！');
    }
    // 完全格挡 → 反击预备
    if (this.defending && original > 0 && dmg === 0) {
      this.guardCounterReady = true;
      lines.push('完全格挡！下回合首次攻击 +50%！');
      fx.push({ atLine: lines.length - 1, type: 'block' });
    }

    this.playerHp = Math.max(0, this.playerHp - dmg);
    if (isCrit) {
      lines.push(`${this.shName} 发动了暴击！造成 ${dmg} 点伤害！`);
      lines.push(`${this.shName}：${pickByLevel(SHADOW_CRIT_DIALOGUE, this.shLevel, this.rng)}`);
    } else {
      lines.push(`${this.shName} 发动了攻击！造成 ${dmg} 点伤害。`);
      lines.push(`${this.shName}：${pickByLevel(SHADOW_ATTACK_DIALOGUE, this.shLevel, this.rng)}`);
    }
    fx.push({ atLine: lines.length - 2, type: 'playerHit', value: dmg, isCrit, hpAfter: this.playerHp });

    if (this.playerHp <= 0) this.handlePlayerLethal(lines);
  }

  private handlePlayerLethal(lines: string[]) {
    if (this.activeMask === 'kindness' && !this.kindnessRevived) {
      this.kindnessRevived = true;
      this.playerHp = 1;
      lines.push('面具之力：绝境中回复了1点体力！');
      lines.push('战斗还未结束……！');
      return;
    }
    // 亡命身法共鸣：致命伤 20% 保留 1 HP（每场 1 次；批4 同伴庇护实装后先到先得不叠加）
    if (this.chain === 'guts+dexterity' && !this.chainLethalUsed) {
      this.chainLethalUsed = true;
      if (this.rng() < CHAIN_LETHAL_GUARD) {
        this.playerHp = 1;
        lines.push('【亡命身法】——千钧一发间侧身，死神擦肩而过！');
        return;
      }
    }
    this.over = 'defeat';
    lines.push('体力耗尽……');
    lines.push(`${this.shName}：${pickByLevel(PLAYER_DEFEAT_MONOLOGUE, this.shLevel, this.rng)}`);
  }

  // ── 失衡系统 ────────────────────────────────────────────
  private gainStagger(isWeakness: boolean, isCrit: boolean, lines: string[], fx: FxEvent[], amp = 1) {
    if (this.shTier === 'mob') return; // 小影无失衡条（血少速杀，§3.4）
    if (this.staggerState === 'window' || this.staggerImmune > 0) return;
    let gain = 0;
    if (isWeakness) {
      gain += STAGGER_WEAKNESS_GAIN;
      if (this.chain === 'knowledge+guts') gain += CHAIN_STAGGER_WEAK_BONUS; // 无畏考据
    }
    if (isCrit) gain += STAGGER_CRIT_GAIN;
    if (gain <= 0) return;
    gain *= amp; // 失衡助推迷思
    if (this.hasAffix('slippery')) gain *= AFFIX_SLIPPERY_FACTOR; // 湿滑：条长 +50%
    gain = Math.round(gain);
    this.staggerGauge = Math.min(STAGGER_MAX, this.staggerGauge + gain);
    if (this.staggerGauge >= STAGGER_MAX) this.triggerStagger(lines, fx);
  }

  private triggerStagger(lines: string[], fx: FxEvent[]) {
    this.staggerState = 'window';
    this.windowJustOpened = true;
    this.everStaggered = true;
    this.staggerGauge = STAGGER_MAX;
    // 打断前摇中的大招
    if (this.windupRemaining !== null) {
      this.windupRemaining = null;
      lines.push(`${this.shName} 的大招被打断了！`);
      fx.push({ atLine: lines.length - 1, type: 'chargeCancel' });
    }
    lines.push(`${this.shName} 失去了平衡！！`);
    lines.push('总攻击窗口开启——下一次行动前它受到的伤害 +30%！');
    fx.push({ atLine: lines.length - 2, type: 'stagger' });
  }

  private maybeForcedWindow(lines: string[], fx: FxEvent[]) {
    if (this.shTier !== 'boss') return; // 濒死保底窗口是主影专属演出
    if (this.forcedWindowUsed || this.everStaggered || this.staggerState !== 'none') return;
    const hp = this.phase === 2 ? (this.shHp2 ?? 0) : this.shHp;
    const maxHp = this.phase === 2 ? (this.shMaxHp2 ?? 1) : this.shMaxHp;
    if (hp > 0 && hp / maxHp < BOSS_FORCED_WINDOW_HP_RATIO) {
      this.forcedWindowUsed = true;
      lines.push(`${this.shName} 已是强弩之末——破绽毕现！`);
      this.triggerStagger(lines, fx);
    }
  }

  private closeStaggerWindow(lines: string[], fx: FxEvent[]) {
    this.staggerState = 'none';
    this.staggerGauge = 0;
    this.staggerImmune = STAGGER_IMMUNE_TURNS;
    lines.push(`${this.shName} 重新站稳了——${STAGGER_IMMUNE_TURNS} 回合内不会再失衡。`);
    fx.push({ atLine: lines.length - 1, type: 'staggerEnd' });
  }

  // ── 伤害落点 / 形态切换 / 胜负 ─────────────────────────
  private damageShadow(dmg: number) {
    this.totalDamageDealt += dmg;
    if (dmg > this.maxSingleHit) this.maxSingleHit = dmg;
    if (this.phase === 2) {
      this.shHp2 = Math.max(0, (this.shHp2 ?? 0) - dmg);
      if ((this.shHp2 ?? 0) <= 0) this.over = 'victory';
    } else {
      this.shHp = Math.max(0, this.shHp - dmg);
      if (this.shHp <= 0) {
        if (this.shMaxHp2 !== undefined) this.enterPhase2();
        else this.over = 'victory';
      }
    }
  }

  private phase2Pending: { newWeak: AttributeId; resist: AttributeId | null } | null = null;
  /** 变身消耗 Shadow 下一次行动（实例级：跨 1More 连段仍然生效） */
  private phase2ActionSkip = false;

  private enterPhase2() {
    this.phase2ActionSkip = true;
    this.phase = 2;
    // 新形态新状态：一形态末段的狂化不带入二形态（避免 ×1.5×1.2 叠满的终局压制）
    this.berserk = false;
    // 变身宣言会公开新弱点——月蚀的隐匿到此为止
    this.weaknessRevealed = true;
    // 更换弱点（排除旧弱点）
    const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
    const pool = ATTRS.filter(a => a !== this.shWeak);
    const newWeak = pool[Math.floor(this.rng() * pool.length)];
    // 对一形态受击最多的属性产生耐性
    let resist: AttributeId | null = null;
    let max = 0;
    for (const a of ATTRS) {
      const c = this.weaknessHitCounts[a] ?? 0;
      if (c > max) { max = c; resist = a; }
    }
    if (resist === newWeak) resist = null; // 不与新弱点冲突
    this.shWeak = newWeak;
    this.phase2Weak = newWeak;
    this.phase2Resist = resist ?? undefined;
    this.phase2Pending = { newWeak, resist };
    // 失衡系统重置（新形态重新博弈）
    this.staggerGauge = 0;
    this.staggerImmune = 0;
    if (this.staggerState === 'window') this.staggerState = 'none';
    this.everStaggered = false;
    this.forcedWindowUsed = false;
  }

  /** phase2 叙事延迟到伤害行之后（UI 时序），由 doTurnAction/endTurn 统一冲洗 */
  private flushPhase2Lines(lines: string[], fx: FxEvent[]) {
    if (!this.phase2Pending) return;
    const { newWeak, resist } = this.phase2Pending;
    this.phase2Pending = null;
    const attrNames = this.setup.attrNames;
    lines.push(`${this.shName} 的形态……发生了变化！`);
    lines.push(`${this.shName}：${pickShadowLine('phase2Open', this.shName) || pickByLevel(PHASE2_DIALOGUE, this.shLevel, this.rng)}`);
    lines.push(`弱点变化了——现在是【${attrNames[newWeak]}】！`);
    if (resist) lines.push(`它对【${attrNames[resist]}】产生了耐性……`);
    lines.push('攻击力提升，小心！');
    fx.push({ atLine: lines.length - 1, type: 'phase2' });
  }

  private appendDefeatLines(lines: string[], fx: FxEvent[]) {
    lines.push(`${this.shName} 倒下了！`);
    lines.push(`${this.shName}：${pickByLevel(DEFEAT_DIALOGUE, this.shLevel, this.rng)}`);
    fx.push({ atLine: lines.length - 2, type: 'shadowDeath' });
  }

  // ── 回合收尾 + 新回合开始 ──────────────────────────────
  private endTurn(lines: string[], fx: FxEvent[]) {
    // phase2 演出（若玩家阶段触发但尚未冲洗）
    this.flushPhase2Lines(lines, fx);

    // 防御回气（铁壁徽记：格挡回合额外回 HP）
    if (this.defending) {
      this.sp += DEFEND_SP_REGEN;
      if (this.relicMods.blockHeal > 0 && this.playerHp < this.playerMaxHp && this.playerHp > 0) {
        const healed = Math.min(this.playerMaxHp - this.playerHp, this.relicMods.blockHeal);
        this.playerHp += healed;
        lines.push(`铁壁徽记微光——回复 ${healed} 点体力。`);
      }
      this.defending = false;
    }
    // 月光怀表：回合开始回 SP
    if (this.relicMods.spPerTurn > 0 && !this.over) {
      this.sp += this.relicMods.spPerTurn;
    }
    // 狂化自损
    if (this.berserk && !this.over) {
      this.damageShadow(BERSERK_SELF_DAMAGE);
      lines.push(`狂化反噬：${this.shName} 自损 ${BERSERK_SELF_DAMAGE} 点。`);
      if (this.over === 'victory') return;
      this.flushPhase2Lines(lines, fx);
    }

    // 计数器推进
    this.turn++;
    if (this.heavyCooldown > 0) this.heavyCooldown--;
    if (this.oneMoreCd > 0) this.oneMoreCd--;
    if (this.staggerImmune > 0) this.staggerImmune--;
    if (this.windupRemaining !== null && this.windupRemaining > 0) this.windupRemaining--;
    this.insightUsedThisTurn = false;

    // ── 新回合开始：状态 tick（回合开始衰减 + fresh 口径）
    const pTick = tickTurnStart(this.playerStatuses);
    this.playerStatuses = pTick.list;
    if (pTick.poisonDamage > 0) {
      this.playerHp = Math.max(0, this.playerHp - pTick.poisonDamage);
      lines.push(`侵蚀之毒发作：你损失 ${pTick.poisonDamage} 点体力。`);
      fx.push({ atLine: lines.length - 1, type: 'playerHit', value: pTick.poisonDamage, hpAfter: this.playerHp });
      if (this.playerHp <= 0) { this.handlePlayerLethal(lines); if (this.over) return; }
    }
    const sTick = tickTurnStart(this.shadowStatuses);
    this.shadowStatuses = sTick.list;
    if (sTick.poisonDamage > 0 && !this.over) {
      this.damageShadow(sTick.poisonDamage);
      lines.push(`中毒侵蚀：${this.shName} 损失 ${sTick.poisonDamage} 点HP。`);
      fx.push({ atLine: lines.length - 1, type: 'shadowHit', value: sTick.poisonDamage });
      this.flushPhase2Lines(lines, fx);
      if (this.over === 'victory') return;
    }

    // 巧手医心共鸣：敌方中毒期间每回合回复 1 HP
    if (this.chain === 'dexterity+kindness' && !this.over
        && findStatus(this.shadowStatuses, 'poison') && this.playerHp > 0 && this.playerHp < this.playerMaxHp) {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + CHAIN_POISON_MEND);
      lines.push(`【巧手医心】共鸣——毒雾之中稳住呼吸，回复 ${CHAIN_POISON_MEND} 点体力。`);
    }

    // 锁定新意图
    this.lockIntent(lines, fx);
  }

  private lockIntent(lines: string[], fx: FxEvent[]) {
    void fx;
    const hp = this.phase === 2 ? (this.shHp2 ?? 0) : this.shHp;
    const maxHp = this.phase === 2 ? (this.shMaxHp2 ?? 1) : this.shMaxHp;
    const kind = decideIntent({
      rng: this.rng,
      turn: this.turn,
      playerChargeActive: this.chargeActive,
      consecutiveWeakness: this.consecutiveWeakness,
      shadowHpRatio: hp / Math.max(1, maxHp),
      playerHpRatio: this.playerHp / Math.max(1, this.playerMaxHp),
      berserk: this.berserk,
      heavyCooldown: this.heavyCooldown,
      windupActive: this.windupRemaining !== null,
      guardUsed: this.guardUsed,
      executeUsed: this.executeUsed,
      level: this.shLevel,
      tier: this.shTier,
    });
    const preview = this.previewAttack(kind);
    this.intent = makeIntent(kind, intentDetail(kind, {
      name: this.shName,
      attackPreview: preview,
      // 月蚀词缀：未揭示前弱点在洞察详情中也保持隐匿
      weakAttrName: this.weaknessHidden() ? '？？？' : this.setup.attrNames[this.shWeak],
    }));
    const flavor = pickIntentLine(kind, this.rng);
    if (flavor) lines.push(flavor);
  }

  /** 意图伤害预告（无暴击随机，用于洞察详情） */
  private previewAttack(kind: IntentKind): number {
    let atk = this.baseAttack();
    if (this.berserk) atk *= BERSERK_ATK_MULT;
    if (this.phase === 2) atk *= PHASE2_ATTACK_MULT;
    const atkUp = findStatus(this.shadowStatuses, 'atk_up');
    if (atkUp) atk *= atkUp.value;
    if (kind === 'heavy' || kind === 'heavyRelease') atk *= HEAVY_POWER_MULT;
    if (kind === 'execute') atk *= CRIT_MULT;
    if (kind === 'guard') atk *= GUARD_INTENT_ATTACK_MULT;
    if (kind === 'debuff') atk *= DEBUFF_INTENT_ATTACK_MULT;
    atk *= turnPressureMult(this.turn);
    return Math.max(1, Math.round(atk));
  }
}
