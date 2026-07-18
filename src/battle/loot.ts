/**
 * 批3 · 战利品内容池与掷取（BATTLE_UPGRADE_PLAN_V2.md §10.2-10.5）
 *
 * 遗物 12 / 迷思 9 / 誓约 6 / 共鸣链 10 / 词缀 8 —— 命名沿文档草案。
 * 品质三档 残月/弦月/满月：词条范围按品质三分段取值，随层高与区层等级上移。
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑，不解析 '@/' 别名）。
 */
import type {
  AttributeId, AffixKind, ChainKey, LootQuality,
  MythKind, MythStone, OathKind, OathStone, PersonaSkill, RelicInstance, RelicKind, ResonanceChain,
} from '../types';
import {
  CHAIN_DROP_RATE, CHEST_MYTH_RATE, DUP_CHAIN_SP, ELITE_LOOT_RATE, OATH_DROP_RATE,
  OATH_CHARGE_MULT, OATH_HEAL_PCT, OATH_POISON_STACKS, OATH_SHIELD_PCT, OATH_SP_GAIN,
} from './numbers';

export const QUALITY_LABEL: Record<LootQuality, string> = { waning: '残月', half: '弦月', full: '满月' };
export const QUALITY_ORDER: LootQuality[] = ['waning', 'half', 'full'];

// ── 遗物池（§10.2）──────────────────────────────────────────
export interface RelicDef {
  name: string;
  /** 词条模板：{v} 会被替换为掷出值 */
  entry: string;
  range: [number, number];
  /** pct=百分比（存小数） flat=整数 */
  unit: 'pct' | 'flat';
}
export const RELIC_POOL: Record<RelicKind, RelicDef> = {
  monocle:      { name: '猎手的单片镜', entry: '弱点伤害 +{v}',        range: [0.08, 0.15], unit: 'pct' },
  pocketwatch:  { name: '月光怀表',     entry: '回合开始 +{v} SP',     range: [1, 2],       unit: 'flat' },
  bulwark:      { name: '铁壁徽记',     entry: '格挡时回复 {v} HP',    range: [2, 4],       unit: 'flat' },
  venomfang:    { name: '蚀骨之牙',     entry: '中毒伤害 +{v}',        range: [0.3, 0.5],   unit: 'pct' },
  starchart:    { name: '观星者的星图', entry: '暴击率 +{v}',          range: [0.05, 0.1],  unit: 'pct' },
  hourglass:    { name: '逆流沙漏',     entry: '蓄力伤害额外 +{v}',    range: [0.15, 0.25], unit: 'pct' },
  bandage:      { name: '执念绷带',     entry: 'HP<30% 时受伤 −{v}',   range: [0.1, 0.18],  unit: 'pct' },
  tuningfork:   { name: '共鸣音叉',     entry: '加算段总和 +{v}',      range: [0.04, 0.08], unit: 'pct' },
  lightningrod: { name: '引雷针',       entry: '1More 后下次伤害 +{v}', range: [0.1, 0.2],  unit: 'pct' },
  compass:      { name: '登塔者罗盘',   entry: '塔内节点 SP 收益 +{v}', range: [0.1, 0.2],  unit: 'pct' },
  maskstrap:    { name: '面具挂绳',     entry: '换面具后首次攻击 +{v}', range: [0.08, 0.15], unit: 'pct' },
  handwarmer:   { name: '影之怀炉',     entry: '回响节点回复 +{v}',    range: [0.05, 0.1],  unit: 'pct' },
};

// ── 迷思池（§10.3）──────────────────────────────────────────
export interface MythDef {
  name: string;
  entry: string;
  range: [number, number];
  unit: 'pct' | 'flat';
  /** 仅 damage/crit 技能可镶 */
  damageOnly?: boolean;
}
export const MYTH_POOL: Record<MythKind, MythDef> = {
  charge_echo:   { name: '蓄力余韵', entry: '命中后 {v} 概率获得「蓄力」', range: [0.15, 0.25], unit: 'pct' },
  life_siphon:   { name: '生命虹吸', entry: '命中回复 {v} HP',            range: [1, 2],       unit: 'flat' },
  venom_bite:    { name: '淬毒之牙', entry: '附带 1 层中毒（{v}/回合）',  range: [2, 4],       unit: 'flat', damageOnly: true },
  keen_eye:      { name: '慧眼',     entry: '该技能暴击率 +{v}',          range: [0.08, 0.12], unit: 'pct' },
  amp_circuit:   { name: '增幅回路', entry: '命中后下次伤害 +{v}',        range: [0.08, 0.15], unit: 'pct' },
  calm_ripple:   { name: '镇静涟漪', entry: '命中后 {v} 概率施加镇静',    range: [0.2, 0.3],   unit: 'pct' },
  flaw_insight:  { name: '破绽洞察', entry: '该技能弱点伤害 +{v}',        range: [0.08, 0.14], unit: 'pct' },
  moon_echo:     { name: '月光余响', entry: '该技能 SP 消耗 −{v}（下限1）', range: [1, 2],     unit: 'flat' },
  stagger_boost: { name: '失衡助推', entry: '该技能失衡充能 +{v}',        range: [0.25, 0.5],  unit: 'pct' },
};

// ── 誓约池（§10.4）──────────────────────────────────────────
export interface OathDef {
  stoneName: string;
  /** 技能本体（本地定义；名称/描述装备时由 LLM 按人设生成或模板兜底） */
  skill: Pick<PersonaSkill, 'type' | 'power' | 'spCost' | 'oathEffect'>;
  effectText: string;
}
export const OATH_POOL: Record<OathKind, OathDef> = {
  abyss:      { stoneName: '深渊之誓', skill: { type: 'heal',   power: 0,  spCost: 25, oathEffect: 'heal_pct_max' }, effectText: `回复 ${Math.round(OATH_HEAL_PCT * 100)}% 最大 HP` },
  storedbolt: { stoneName: '蓄雷之誓', skill: { type: 'charge', power: 0,  spCost: 20, oathEffect: 'charge_23' },    effectText: `蓄力强化：下回合伤害 ×${OATH_CHARGE_MULT}` },
  soulfire:   { stoneName: '燃魂之誓', skill: { type: 'damage', power: 55, spCost: 30, oathEffect: 'self_hp_cost' }, effectText: '威力 55，自损 10% 当前 HP' },
  shadowrot:  { stoneName: '蚀影之誓', skill: { type: 'debuff', power: 0,  spCost: 26, oathEffect: 'poison_calm' },  effectText: `${OATH_POISON_STACKS} 层中毒 + 镇静 1 回合` },
  aegis:      { stoneName: '铁壁之誓', skill: { type: 'buff',   power: 0,  spCost: 18, oathEffect: 'shield_block' }, effectText: `护盾 ${Math.round(OATH_SHIELD_PCT * 100)}% + 视为完全格挡` },
  moonlight:  { stoneName: '月光之誓', skill: { type: 'buff',   power: 0,  spCost: 0,  oathEffect: 'sp_once' },      effectText: `+${OATH_SP_GAIN} SP（每场 1 次）` },
};
export const OATH_KINDS = Object.keys(OATH_POOL) as OathKind[];

/** 无 Key / 生成前的模板名 */
export function oathTemplateName(personaName: string): string {
  return `${personaName}·之誓`;
}

// ── 共鸣链组合池（§10.5）────────────────────────────────────
export interface ChainDef {
  name: string;
  pair: [AttributeId, AttributeId];
  effectText: string;
}
export const CHAIN_POOL: Record<ChainKey, ChainDef> = {
  'knowledge+guts':      { name: '无畏考据', pair: ['knowledge', 'guts'],      effectText: '弱点命中失衡充能提升' },
  'knowledge+dexterity': { name: '精算连击', pair: ['knowledge', 'dexterity'], effectText: '暴击率 +6%' },
  'knowledge+kindness':  { name: '疗理之学', pair: ['knowledge', 'kindness'],  effectText: '回复效果 +25%' },
  'knowledge+charm':     { name: '雄辩之智', pair: ['knowledge', 'charm'],     effectText: '洞察免费（0 SP）' },
  'guts+dexterity':      { name: '亡命身法', pair: ['guts', 'dexterity'],      effectText: '致命伤 20% 保留 1 HP（每场1次）' },
  'guts+kindness':       { name: '守护之勇', pair: ['guts', 'kindness'],       effectText: '格挡反击 +50% → +70%' },
  'guts+charm':          { name: '烈焰亮相', pair: ['guts', 'charm'],          effectText: '每场首回合伤害 +15%' },
  'dexterity+kindness':  { name: '巧手医心', pair: ['dexterity', 'kindness'],  effectText: '敌中毒期间每回合回复 1 HP' },
  'dexterity+charm':     { name: '舞台魅影', pair: ['dexterity', 'charm'],     effectText: '换面具后首次攻击必暴击（每场1次）' },
  'kindness+charm':      { name: '月下共鸣', pair: ['kindness', 'charm'],      effectText: '共鸣效果 +30%' },
};
export const CHAIN_KEYS = Object.keys(CHAIN_POOL) as ChainKey[];

// ── 词缀池（§5.1）───────────────────────────────────────────
export const AFFIX_POOL: Record<AffixKind, { name: string; desc: string }> = {
  stubborn: { name: '顽固', desc: 'HP +30%' },
  keen:     { name: '敏锐', desc: '暴击率 +10%' },
  vengeful: { name: '记仇', desc: '你曾撤离——攻击 +15%' },
  thorns:   { name: '荆棘', desc: '反弹 10% 所受伤害' },
  slippery: { name: '湿滑', desc: '失衡条 +50% 长' },
  swift:    { name: '迅捷', desc: '开场先制' },
  eclipse:  { name: '月蚀', desc: '弱点隐藏（洞察可揭示）' },
  greedy:   { name: '贪婪', desc: '击败多掉 50% SP' },
};
export const AFFIX_KINDS = Object.keys(AFFIX_POOL) as AffixKind[];

/** 掷词缀（不重复；exclude 用于加深时避开已有词缀） */
export function rollAffixes(count: number, rng: () => number, exclude: AffixKind[] = []): AffixKind[] {
  const pool = AFFIX_KINDS.filter(a => !exclude.includes(a));
  const out: AffixKind[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

// ── 品质与词条掷取 ──────────────────────────────────────────
/** 品质得分 0..1：区层等级占 55%、层高进度占 45% */
export function qualityScore(stratumLevel: number, floorRatio: number): number {
  const lv = (Math.min(5, Math.max(1, stratumLevel)) - 1) / 4;
  const fr = Math.min(1, Math.max(0, floorRatio));
  return lv * 0.55 + fr * 0.45;
}

export function rollQuality(score: number, rng: () => number): LootQuality {
  const full = Math.min(0.55, 0.05 + 0.5 * score);
  const waning = Math.max(0.12, 0.68 - 0.62 * score);
  const r = rng();
  if (r < full) return 'full';
  if (r < full + (1 - full - waning)) return 'half';
  return 'waning';
}

/** 词条值：范围按品质三分段（残月低段/弦月中段/满月高段），段内随机 */
export function rollEntryValue(range: [number, number], unit: 'pct' | 'flat', quality: LootQuality, rng: () => number): number {
  const [lo, hi] = range;
  const span = (hi - lo) / 3;
  const idx = QUALITY_ORDER.indexOf(quality);
  const v = lo + span * idx + span * rng();
  if (unit === 'flat') {
    // 整数词条：残月取低值、满月取高值，段内四舍五入
    return Math.max(Math.round(lo), Math.min(Math.round(hi), Math.round(v)));
  }
  return Math.round(v * 1000) / 1000;
}

// ── 掷取入口 ────────────────────────────────────────────────
export type LootDrop =
  | { kind: 'relic'; relic: RelicInstance }
  | { kind: 'myth'; myth: MythStone }
  | { kind: 'oath'; oath: OathStone }
  | { kind: 'chain'; chain: ResonanceChain }
  | { kind: 'sp'; amount: number; reason: string };

export interface LootContext {
  stratumLevel: number;
  /** 0..1（boss 传 1） */
  floorRatio: number;
  ownedChainKeys: ChainKey[];
  ownedOathKinds: OathKind[];
  rng: () => number;
  makeId: () => string;
  today: string; // YYYY-MM-DD
}

export function rollRelic(ctx: LootContext, forceQuality?: LootQuality): RelicInstance {
  const kinds = Object.keys(RELIC_POOL) as RelicKind[];
  const kind = kinds[Math.floor(ctx.rng() * kinds.length)];
  const quality = forceQuality ?? rollQuality(qualityScore(ctx.stratumLevel, ctx.floorRatio), ctx.rng);
  const def = RELIC_POOL[kind];
  return { id: ctx.makeId(), kind, quality, value: rollEntryValue(def.range, def.unit, quality, ctx.rng), obtainedAt: ctx.today };
}

export function rollMyth(ctx: LootContext, forceQuality?: LootQuality): MythStone {
  const kinds = Object.keys(MYTH_POOL) as MythKind[];
  const kind = kinds[Math.floor(ctx.rng() * kinds.length)];
  const quality = forceQuality ?? rollQuality(qualityScore(ctx.stratumLevel, ctx.floorRatio), ctx.rng);
  const def = MYTH_POOL[kind];
  return { id: ctx.makeId(), kind, quality, value: rollEntryValue(def.range, def.unit, quality, ctx.rng), obtainedAt: ctx.today };
}

/**
 * 节点战利品（§4.2 拍板：月匣必得、强敌 60%、心魔必得）
 *  - chest：必得 1 件（70% 遗物 / 30% 迷思）
 *  - elite：60% 掉 1 件（75% 遗物 / 25% 迷思）
 *  - boss ：必得 1 遗物 + 35% 共鸣链（重复→SP 补偿）+ 25% 誓约石（不重复）
 */
export function rollNodeLoot(source: 'chest' | 'elite' | 'boss', ctx: LootContext): LootDrop[] {
  const drops: LootDrop[] = [];
  if (source === 'chest') {
    drops.push(ctx.rng() < CHEST_MYTH_RATE
      ? { kind: 'myth', myth: rollMyth(ctx) }
      : { kind: 'relic', relic: rollRelic(ctx) });
  } else if (source === 'elite') {
    if (ctx.rng() < ELITE_LOOT_RATE) {
      drops.push(ctx.rng() < 0.25
        ? { kind: 'myth', myth: rollMyth(ctx) }
        : { kind: 'relic', relic: rollRelic(ctx) });
    }
  } else {
    drops.push({ kind: 'relic', relic: rollRelic({ ...ctx, floorRatio: 1 }) });
    if (ctx.rng() < CHAIN_DROP_RATE) {
      const pool = CHAIN_KEYS.filter(k => !ctx.ownedChainKeys.includes(k));
      if (pool.length === 0) {
        drops.push({ kind: 'sp', amount: DUP_CHAIN_SP, reason: '共鸣已臻圆满' });
      } else {
        const key = pool[Math.floor(ctx.rng() * pool.length)];
        drops.push({ kind: 'chain', chain: { key, obtainedAt: ctx.today } });
      }
    }
    if (ctx.rng() < OATH_DROP_RATE) {
      const pool = OATH_KINDS.filter(k => !ctx.ownedOathKinds.includes(k));
      if (pool.length > 0) {
        const kind = pool[Math.floor(ctx.rng() * pool.length)];
        drops.push({ kind: 'oath', oath: { id: ctx.makeId(), kind, obtainedAt: ctx.today } });
      }
    }
  }
  return drops;
}

/** 掉落物显示名（toast / 回顾用） */
export function lootLabel(drop: LootDrop): string {
  switch (drop.kind) {
    case 'relic': return `${QUALITY_LABEL[drop.relic.quality]}遗物「${RELIC_POOL[drop.relic.kind].name}」`;
    case 'myth':  return `${QUALITY_LABEL[drop.myth.quality]}迷思「${MYTH_POOL[drop.myth.kind].name}」`;
    case 'oath':  return `誓约石「${OATH_POOL[drop.oath.kind].stoneName}」`;
    case 'chain': return `共鸣链「${CHAIN_POOL[drop.chain.key].name}」`;
    case 'sp':    return `${drop.reason} +${drop.amount} SP`;
  }
}

/** 遗物词条完整文案 */
export function relicEntryText(r: RelicInstance): string {
  const def = RELIC_POOL[r.kind];
  const v = def.unit === 'pct' ? `${Math.round(r.value * 100)}%` : `${r.value}`;
  return def.entry.replace('{v}', v);
}

export function mythEntryText(m: MythStone): string {
  const def = MYTH_POOL[m.kind];
  const v = def.unit === 'pct' ? `${Math.round(m.value * 100)}%` : `${m.value}`;
  return def.entry.replace('{v}', v);
}

/** 已装备遗物 → 引擎修正聚合（compass/handwarmer 塔外效果不进引擎） */
export function aggregateRelicMods(relics: RelicInstance[]): import('./numbers').RelicMods {
  const mods = {
    weaknessAdd: 0, addAll: 0, chargeAdd: 0, oneMoreAdd: 0, maskSwitchAdd: 0,
    critAdd: 0, spPerTurn: 0, blockHeal: 0, poisonAmp: 0, lowHpGuard: 0,
  };
  for (const r of relics) {
    if (!r.equipped) continue;
    switch (r.kind) {
      case 'monocle':      mods.weaknessAdd += r.value; break;
      case 'tuningfork':   mods.addAll += r.value; break;
      case 'hourglass':    mods.chargeAdd += r.value; break;
      case 'lightningrod': mods.oneMoreAdd += r.value; break;
      case 'maskstrap':    mods.maskSwitchAdd += r.value; break;
      case 'starchart':    mods.critAdd += r.value; break;
      case 'pocketwatch':  mods.spPerTurn += r.value; break;
      case 'bulwark':      mods.blockHeal += r.value; break;
      case 'venomfang':    mods.poisonAmp += r.value; break;
      case 'bandage':      mods.lowHpGuard += r.value; break;
      case 'compass': case 'handwarmer': break;
    }
  }
  return mods;
}

/** 塔外遗物效果读取：罗盘（节点 SP+）与怀炉（回响回复+） */
export function towerRelicBonus(relics: RelicInstance[] | undefined): { nodeSpPct: number; echoHealAdd: number } {
  let nodeSpPct = 0, echoHealAdd = 0;
  for (const r of relics ?? []) {
    if (!r.equipped) continue;
    if (r.kind === 'compass') nodeSpPct += r.value;
    if (r.kind === 'handwarmer') echoHealAdd += r.value;
  }
  return { nodeSpPct, echoHealAdd };
}

/** 誓约技能本体构造（装备时替换目标槽；名称先模板后 LLM 覆写） */
export function buildOathSkill(kind: OathKind, stoneId: string, replaced: PersonaSkill, personaName: string): PersonaSkill {
  const def = OATH_POOL[kind];
  return {
    level: replaced.level,
    name: oathTemplateName(personaName),
    description: `${def.stoneName} · ${def.effectText}`,
    type: def.skill.type,
    power: def.skill.power,
    spCost: def.skill.spCost,
    oathEffect: def.skill.oathEffect,
    mastery: 0,
    unlocked: replaced.unlocked,
    oath: { stoneId, kind, original: replaced },
  };
}
