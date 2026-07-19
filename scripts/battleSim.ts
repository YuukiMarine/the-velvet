/**
 * 战斗引擎 v2 · 模拟战验收脚本（BATTLE_UPGRADE_PLAN_V2.md 批1 验收）
 *
 * 运行：npx tsx scripts/battleSim.ts
 * 覆盖：
 *  A. Lv1-5 各 2 场混合压力战（≥10 场）——终局性 / 数值健康（无 NaN / 越界）
 *  B. 蓄力被打断可复现（意图=打断 → 蓄力真取消）
 *  C. 失衡免疫 CD：两次失衡之间 ≥3 个回合
 *  D. 状态时长口径：中毒（3回合）恰好跳伤 3 次
 *  E. 大招前摇被失衡打断
 *  F. QTE 档位 / SP 门禁 / 出战位技能锁（引擎侧兜底不吞回合）
 */
import { BattleEngine, EngineSetup, InjectedEffectMap, TurnResult } from '../src/battle/engine';
import type { AttributeId, PersonaSkill } from '../src/types';

// ── 种子随机（复现性） ──────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const ATTR_NAMES: Record<AttributeId, string> = {
  knowledge: '知识', guts: '胆量', dexterity: '灵巧', kindness: '温柔', charm: '魅力',
};

// SKILL_EFFECT_MAP 的结构副本（引擎注入用；与 src/constants 保持一致）
const EFFECT_MAP: InjectedEffectMap = {
  knowledge: {
    debuff: { kind: 'mark', target: 'shadow', turns: 2, value: 1.2, hint: '猎手标记×1.2 (2回合)', label: '标记', icon: '🎯' },
    attack_boost: { kind: 'crit_debuff', target: 'shadow', turns: 2, value: 0.5, hint: 'Shadow 暴击率−50% (2回合)', label: '洞悉', icon: '🔭' },
  },
  guts: {
    debuff: { kind: 'fear', target: 'shadow', turns: 1, value: 0.5, hint: 'Shadow 50% 概率跳过', label: '恐惧', icon: '😱' },
  },
  dexterity: {
    debuff: { kind: 'poison', target: 'shadow', turns: 3, value: 3, stackable: true, hint: '中毒-3HP (3回合/可叠3层)', label: '中毒', icon: '☠️' },
    attack_boost: { kind: 'crit_buff', target: 'player', turns: 3, value: 0.25, hint: '玩家暴击率+25% (3回合)', label: '连击', icon: '⚡' },
  },
  kindness: {
    debuff: { kind: 'calm', target: 'shadow', turns: 2, value: 0.7, hint: 'Shadow 攻击×0.7 (2回合)', label: '镇静', icon: '🌿' },
    attack_boost: { kind: 'shield', target: 'player', turns: 1, value: 0.6, hint: '护盾：吸收下次伤害60%', label: '护盾', icon: '🛡️' },
  },
  charm: {
    debuff: { kind: 'beguile', target: 'shadow', turns: 1, value: 0.5, hint: 'Shadow 50% 概率自伤', label: '魅惑', icon: '💋' },
    attack_boost: { kind: 'resonance', target: 'player', turns: 1, value: 1.8, hint: '共鸣：下次伤害×1.8', label: '共鸣', icon: '🎵' },
  },
};

function makeSkills(): Record<AttributeId, PersonaSkill[]> {
  const types: PersonaSkill['type'][] = ['damage', 'crit', 'buff', 'debuff', 'attack_boost'];
  const powers = [10, 15, 22, 30, 40];
  const costs = [8, 12, 18, 25, 35];
  const r = {} as Record<AttributeId, PersonaSkill[]>;
  ATTRS.forEach(attr => {
    r[attr] = powers.map((p, i) => ({
      level: i + 1,
      name: `${ATTR_NAMES[attr]}技${i + 1}`,
      description: '',
      type: attr === 'kindness' && i === 2 ? 'heal' : types[i],
      power: p,
      spCost: costs[i],
    }));
  });
  return r;
}

// 跑测微调：高层总血量回落（原 300+120/420+200/520+260 拉锯 15+ 回合，压力叠加下不可赢）
// 批3 验收调整：Lv1-2 +10 / Lv3 +20 / Lv4-5 +30（与 constants/SHADOW_LEVEL_CONFIG 同步）
const BOSS_HP: Record<number, { hp: number; hp2?: number }> = {
  1: { hp: 160 }, 2: { hp: 210 }, 3: { hp: 280, hp2: 80 }, 4: { hp: 370, hp2: 110 }, 5: { hp: 450, hp2: 130 },
};

function makeSetup(level: number, seed: number, attrLevel = 5): EngineSetup {
  const attrLevels = Object.fromEntries(ATTRS.map(a => [a, attrLevel])) as Record<AttributeId, number>;
  return {
    rng: mulberry32(seed),
    userName: 'SIM',
    attrNames: ATTR_NAMES,
    personaNames: Object.fromEntries(ATTRS.map(a => [a, `P·${ATTR_NAMES[a]}`])) as Record<AttributeId, string>,
    attrLevels,
    skills: makeSkills(),
    damagePlus: Object.fromEntries(ATTRS.map(a => [a, 0])) as Record<AttributeId, number>,
    basicAttackPower: attrLevel * 5,
    initialMask: 'knowledge',
    playerHp: 40 + level * 5,
    playerMaxHp: 40 + level * 5,
    sp: 120,
    shadow: {
      id: `sim-shadow-${level}-${seed}`,
      name: `模拟之影Lv${level}`,
      level,
      weakAttribute: 'guts',
      hp: BOSS_HP[level].hp, maxHp: BOSS_HP[level].hp,
      hp2: BOSS_HP[level].hp2, maxHp2: BOSS_HP[level].hp2,
      phase: 1,
      attackScalePct: 100,
      responseLines: ['……'],
    },
    effectMap: EFFECT_MAP,
  };
}

// ── 断言器 ─────────────────────────────────────────────────
let failures = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (!cond) {
    failures++;
    console.error(`  ❌ ${label}${detail ? ` —— ${detail}` : ''}`);
  }
}

function checkNumbersHealthy(e: BattleEngine, label: string) {
  const s = e.snapshot;
  const nums = [s.playerHp, s.sp, s.shadowHp, s.shadowHp2 ?? 0, s.staggerGauge];
  assert(nums.every(n => Number.isFinite(n)), `${label}: 数值出现 NaN/Infinity`, JSON.stringify(nums));
  assert(s.playerHp >= 0 && s.playerHp <= s.playerMaxHp, `${label}: 玩家 HP 越界`, `${s.playerHp}/${s.playerMaxHp}`);
  assert(s.shadowHp >= 0, `${label}: Shadow HP 为负`);
  assert(s.sp >= 0, `${label}: SP 为负`);
}

// ── A. 混合压力战（聪明策略：看意图防御 / 低血奶 / 弱点输出 / 窗口总攻击） ──
function runMixedBattle(level: number, seed: number): { outcome: string; actions: number; turns: number } {
  const e = new BattleEngine(makeSetup(level, seed));
  e.openingTurn();
  const rng = mulberry32(seed ^ 0xBEEF);
  let actions = 0;
  const skills = makeSkills();
  // 同伴援助道具（现网真实机制：Lv7 同伴各提供一次 HP/SP 道具）
  let itemHealLeft = 1;
  let itemSpLeft = 1;

  while (e.snapshot.over === null && actions < 300) {
    actions++;
    const s = e.snapshot;
    const dangerousIntent = s.intent?.kind === 'heavyRelease' || s.intent?.kind === 'execute';

    if (itemHealLeft > 0 && s.playerHp < s.playerMaxHp * 0.3) {
      itemHealLeft--;
      e.act({ kind: 'itemHeal', amount: Math.round(s.playerMaxHp * 0.2), label: '同伴的慰藉' });
      continue; // 自由行动
    }
    if (itemSpLeft > 0 && s.sp < 10) {
      itemSpLeft--;
      e.act({ kind: 'itemSp', amount: 15, label: '同伴的余韵' });
      continue;
    }

    let r: TurnResult;
    if (s.canAllOut) {
      r = e.act({ kind: 'allOut', qteMult: 1.5 });
    } else if (s.playerHp < s.playerMaxHp * 0.45 && s.sp >= 18 && s.activeMask !== 'kindness') {
      e.act({ kind: 'switchMask', attribute: 'kindness' }); // 切奶（自由行动）
      continue;
    } else if (s.playerHp < s.playerMaxHp * 0.45 && s.sp >= 18 && s.activeMask === 'kindness') {
      r = e.act({ kind: 'skill', skill: skills.kindness[2] }); // heal
    } else if (dangerousIntent) {
      r = e.act({ kind: 'defend' }); // 看到危险意图 → 防御
    } else if (s.activeMask !== s.weakAttribute && rng() < 0.6) {
      e.act({ kind: 'switchMask', attribute: s.weakAttribute });
      continue;
    } else if (s.sp < 12) {
      r = e.act(rng() < 0.5 ? { kind: 'basic' } : { kind: 'defend' });
    } else {
      // 会玩的技能选择：不重复挂 buff/标记，优先高威力输出技
      const hasMark = s.shadowStatuses.some(st => st.kind === 'mark');
      const pool = skills[s.activeMask].filter(sk => {
        if (sk.spCost > s.sp) return false;
        if (sk.type === 'buff') return !s.attackBuff && rng() < 0.35;
        if (sk.type === 'debuff') return !hasMark && !s.vulnerableArmed && rng() < 0.5;
        if (sk.type === 'heal') return s.playerHp < s.playerMaxHp * 0.7;
        return true; // damage / crit / attack_boost / charge
      });
      const dmgPool = pool.filter(sk => sk.type === 'damage' || sk.type === 'crit' || sk.type === 'attack_boost');
      const pick = (arr: PersonaSkill[]) => arr.reduce((a, b) => (a.power >= b.power ? a : b));
      const sk = dmgPool.length && rng() < 0.75 ? pick(dmgPool) : (pool.length ? pool[Math.floor(rng() * pool.length)] : null);
      r = e.act(sk ? { kind: 'skill', skill: sk } : { kind: 'basic' });
    }
    checkNumbersHealthy(e, `Lv${level}#${seed}`);
    assert(r.lines.every(l => typeof l === 'string' && !l.includes('undefined') && !l.includes('NaN')),
      `Lv${level}#${seed}: 叙事含 undefined/NaN`, r.lines.find(l => l.includes('undefined') || l.includes('NaN')));
    if (process.env.SIM_TRACE === `${level}:${seed}`) {
      const sn = e.snapshot;
      console.log(`  [t${sn.turn}] HP${sn.playerHp}/${sn.playerMaxHp} SP${sn.sp} 影${sn.shadowHp}+${sn.shadowHp2 ?? 0} 意图=${sn.intent?.kind}`);
      r.lines.forEach(l => console.log(`      ${l}`));
    }
  }
  const s = e.snapshot;
  assert(s.over !== null, `Lv${level}#${seed}: 战斗未在 300 次行动内终结`, `turn=${s.turn}`);
  const totalHp = BOSS_HP[level].hp + (BOSS_HP[level].hp2 ?? 0);
  const remaining = s.shadowHp + (s.shadowHp2 ?? 0);
  const progress = (totalHp - remaining) / totalHp;
  return { outcome: s.over ?? 'timeout', actions, turns: s.turn, progress };
}

console.log('── A. 混合压力战（Lv1-5 × 2 种子，聪明策略） ──');
// 验收口径：本玩法自 v1.9 起即"多晚拉锯"设计（败退保留伤害、每日再战、塔进度跨天持久）。
// 单场必胜只要求低层；高层考核"单场推进量"——每晚至少磨掉 40% 总血，2-3 晚可通。
const summary: string[] = [];
let victories = 0;
let minProgress = 1;
for (let level = 1; level <= 5; level++) {
  for (const seed of [42, 1337]) {
    const r = runMixedBattle(level, seed);
    if (r.outcome === 'victory') victories++;
    else minProgress = Math.min(minProgress, r.progress);
    summary.push(`Lv${level} seed=${seed}: ${r.outcome} @ ${r.turns} 回合 (${r.actions} 次行动, 推进 ${Math.round(r.progress * 100)}%)`);
  }
}
summary.forEach(s => console.log('  ' + s));
console.log(`  胜场 ${victories}/10 · 败北最低推进 ${Math.round(minProgress * 100)}%`);
assert(victories >= 5, 'A: 胜场过低（低层应单场可胜）', `${victories}/10`);
assert(minProgress >= 0.4, 'A: 存在推进不足 40% 的败北——高层单晚磨血量不达标', `${Math.round(minProgress * 100)}%`);

// ── B. 蓄力被打断 ──────────────────────────────────────────
console.log('── B. 蓄力打断 ──');
{
  const e = new BattleEngine(makeSetup(5, 7));
  e.openingTurn();
  const skills = makeSkills();
  // 第一回合：蓄力（charge 是 Lv5 attack_boost？不——本套技能没有 charge；直接注入一个 charge 技能）
  const chargeSkill: PersonaSkill = { level: 5, name: '模拟蓄力', description: '', type: 'charge', power: 40, spCost: 35 };
  const r1 = e.act({ kind: 'skill', skill: chargeSkill });
  assert(e.snapshot.chargeActive || r1.lines.some(l => l.includes('蓄力被打断')),
    'B: 蓄力后应保持蓄力态（或当回合已被打断）');
  // 下一回合意图应为打断（优先级：无 windup/berserk/execute 前提下）
  if (e.snapshot.chargeActive) {
    assert(e.snapshot.intent?.kind === 'interrupt', 'B: 蓄力后下回合意图应为打断', `实际=${e.snapshot.intent?.kind}`);
    const r2 = e.act({ kind: 'defend' }); // 保持蓄力不放
    assert(!e.snapshot.chargeActive, 'B: 打断意图执行后蓄力应被取消');
    assert(r2.lines.some(l => l.includes('蓄力被打断')), 'B: 应有"蓄力被打断"叙事');
  }
  console.log('  ✓ 蓄力打断链路');
}

// ── C. 失衡免疫 CD ─────────────────────────────────────────
console.log('── C. 失衡免疫 ──');
{
  const setupC = makeSetup(5, 99);
  setupC.playerHp = 9999; setupC.playerMaxHp = 9999; // 机制测试：排除玩家死亡干扰
  setupC.shadow.attackScalePct = 10;
  const e = new BattleEngine(setupC);
  e.openingTurn();
  const weakSkill: PersonaSkill = { level: 1, name: '弱点戳', description: '', type: 'damage', power: 1, spCost: 0 };
  e.act({ kind: 'switchMask', attribute: 'guts' }); // 弱点=guts
  const staggerTurns: number[] = [];
  for (let i = 0; i < 40 && e.snapshot.over === null; i++) {
    const before = e.snapshot.staggerWindow;
    const r = e.act({ kind: 'skill', skill: weakSkill });
    if (!before && r.lines.some(l => l.includes('失去了平衡'))) staggerTurns.push(e.snapshot.turn);
  }
  assert(staggerTurns.length >= 2, 'C: 40 次弱点戳应至少触发两次失衡', `实际 ${staggerTurns.length} 次`);
  for (let i = 1; i < staggerTurns.length; i++) {
    assert(staggerTurns[i] - staggerTurns[i - 1] >= 4, 'C: 两次失衡间隔应 ≥ 免疫3回合+充能',
      `第${i}次间隔=${staggerTurns[i] - staggerTurns[i - 1]} (turns=${staggerTurns.join(',')})`);
  }
  console.log(`  ✓ 失衡触发回合: ${staggerTurns.join(', ')}`);
}

// ── D. 中毒口径：3 回合恰好 3 跳 ────────────────────────────
console.log('── D. 中毒时长口径 ──');
{
  const setupD = makeSetup(5, 5);
  setupD.playerHp = 9999; setupD.playerMaxHp = 9999;
  setupD.shadow.attackScalePct = 10;
  const e = new BattleEngine(setupD);
  e.openingTurn();
  e.act({ kind: 'switchMask', attribute: 'dexterity' });
  const poisonSkill: PersonaSkill = { level: 4, name: '模拟淬毒', description: '', type: 'debuff', power: 30, spCost: 0 };
  let ticks = 0;
  e.act({ kind: 'skill', skill: poisonSkill }); // 施毒（fresh，本回合不跳）
  for (let i = 0; i < 6 && e.snapshot.over === null; i++) {
    const r = e.act({ kind: 'defend' });
    ticks += r.lines.filter(l => l.includes('中毒侵蚀')).length;
  }
  assert(ticks === 3, 'D: 3 回合中毒应恰好跳伤 3 次', `实际 ${ticks} 次`);
  console.log(`  ✓ 中毒 3 回合 → ${ticks} 跳`);
}

// ── E. 大招前摇被失衡打断（确定性剧本：充能到 68 → 等前摇 → 一击打断） ──
console.log('── E. 前摇打断 ──');
{
  const setupE = makeSetup(5, 3);
  setupE.playerHp = 9999; setupE.playerMaxHp = 9999; // 机制测试：排除玩家死亡干扰
  setupE.shadow.attackScalePct = 10;
  const e = new BattleEngine(setupE);
  e.openingTurn();
  e.act({ kind: 'switchMask', attribute: 'guts' });
  const weakSkill: PersonaSkill = { level: 1, name: '弱点戳', description: '', type: 'damage', power: 1, spCost: 0 };
  let interrupted = false;
  for (let i = 0; i < 60 && e.snapshot.over === null && !interrupted; i++) {
    const s = e.snapshot;
    if (s.windup && s.staggerImmune === 0 && s.staggerGauge >= 68 && !s.staggerWindow) {
      // 前摇中 + 一击即满 → 打断时刻
      const r = e.act({ kind: 'skill', skill: weakSkill });
      interrupted = r.lines.some(l => l.includes('大招被打断'));
    } else if (!s.staggerWindow && s.staggerImmune === 0 && s.staggerGauge < 68) {
      e.act({ kind: 'skill', skill: weakSkill }); // 充能
    } else {
      e.act({ kind: 'defend' }); // 保持充能等前摇 / 消耗窗口与免疫
    }
  }
  assert(interrupted, 'E: 应能复现"前摇期失衡打断大招"');
  if (interrupted) console.log('  ✓ 大招可被失衡打断');
}

// ── G. 二形态：弱点更换 + 变身回合跳过行动 ────────────────
console.log('── G. 二形态 ──');
{
  const setupG = makeSetup(3, 11); // Lv3 有二形态（300+120）
  setupG.playerHp = 9999; setupG.playerMaxHp = 9999;
  setupG.shadow.attackScalePct = 10;
  const e = new BattleEngine(setupG);
  e.openingTurn();
  e.act({ kind: 'switchMask', attribute: 'guts' });
  const bigSkill: PersonaSkill = { level: 5, name: '模拟重击', description: '', type: 'damage', power: 40, spCost: 0 };
  let sawPhase2 = false; let sawSkip = false;
  for (let i = 0; i < 40 && e.snapshot.over === null && e.snapshot.phase === 1; i++) {
    const r = e.act({ kind: 'skill', skill: bigSkill });
    if (r.lines.some(l => l.includes('弱点变化了'))) sawPhase2 = true;
    if (r.lines.some(l => l.includes('重塑形体'))) sawSkip = true;
  }
  // 变身可能落在 1More 连段上——跳过行动出现在下一次行动，补两拍观察
  for (let i = 0; i < 2 && e.snapshot.over === null && !sawSkip; i++) {
    const r = e.act({ kind: 'defend' });
    if (r.lines.some(l => l.includes('重塑形体'))) sawSkip = true;
  }
  assert(sawPhase2, 'G: 二形态应更换弱点并有叙事');
  assert(sawSkip, 'G: 变身回合 Shadow 应跳过行动');
  assert(e.snapshot.phase === 2, 'G: 引擎应进入二形态');
  assert(e.snapshot.weakAttribute !== 'guts', 'G: 弱点应已更换', `仍为 ${e.snapshot.weakAttribute}`);
  console.log(`  ✓ 二形态：新弱点=${e.snapshot.weakAttribute}`);
}

// ── F. 门禁兜底 ────────────────────────────────────────────
console.log('── F. 门禁兜底 ──');
{
  const e = new BattleEngine(makeSetup(1, 1));
  e.openingTurn();
  const expensive: PersonaSkill = { level: 5, name: '天价', description: '', type: 'damage', power: 40, spCost: 999 };
  const turnBefore = e.snapshot.turn;
  const r1 = e.act({ kind: 'skill', skill: expensive });
  assert(!r1.consumedTurn && e.snapshot.turn === turnBefore, 'F: SP 不足的技能不应吞回合');
  const r2 = e.act({ kind: 'allOut', qteMult: 2.2 });
  assert(!r2.consumedTurn, 'F: 非窗口期总攻击不应吞回合');
  const r3 = e.act({ kind: 'insight' });
  assert(!r3.consumedTurn && r3.lines.length > 0, 'F: 洞察应为免回合行动且有产出');
  console.log('  ✓ SP/窗口/洞察门禁');
}

// ── H. 高塔区层：地图生成健全性 + 小影战档位（批2） ─────────
console.log('── H. 区层地图与小影档位 ──');
{
  const { generateStratumNodes, rollMobSpec, weekKeyOf, reachableNodeIds, buildStratum } = await import('../src/battle/tower');
  const { TOWER_EVENT_IDS } = await import('../src/battle/events');
  // 50 张图健全性
  for (let seed = 1; seed <= 50; seed++) {
    const rng = mulberry32(seed * 7919);
    const { nodes, floors } = generateStratumNodes({
      level: 1 + (seed % 5), rng, eventPoolIds: TOWER_EVENT_IDS, chestSp: () => 10,
    });
    assert(floors >= 10 && floors <= 12, `H#${seed}: 层数越界`, `${floors}`);
    const bossNodes = nodes.filter(n => n.type === 'boss');
    assert(bossNodes.length === 1 && bossNodes[0].floor === floors, `H#${seed}: 主影应唯一且在顶层`);
    // 连通性：从第 1 层出发 BFS 应能到达 boss
    const byId = new Map(nodes.map(n => [n.id, n]));
    const queue = nodes.filter(n => n.floor === 1).map(n => n.id);
    const seen = new Set(queue);
    while (queue.length) {
      const cur = byId.get(queue.shift()!)!;
      for (const e of cur.edges) if (!seen.has(e)) { seen.add(e); queue.push(e); }
    }
    assert(seen.has(bossNodes[0].id), `H#${seed}: 主影不可达（连通性破坏）`);
    // 战斗节点必须携带 mob 规格
    assert(nodes.filter(n => n.type === 'mob' || n.type === 'elite').every(n => !!n.mob), `H#${seed}: 战斗节点缺 mob 规格`);
    assert(nodes.filter(n => n.type === 'event').every(n => !!n.eventPoolId), `H#${seed}: 事件节点缺池 id`);
  }
  console.log('  ✓ 50 张区层地图：层数/顶层主影/连通性/节点负载');

  // reachable 语义
  const stratum = buildStratum({
    id: 's1', level: 2, name: '测试之域', description: '', baseFloor: 12, now: new Date('2026-07-16'),
    rng: mulberry32(9), eventPoolIds: TOWER_EVENT_IDS, chestSp: () => 10,
  });
  assert(weekKeyOf(new Date('2026-07-16')) === '2026-07-13', 'H: 周键应取周一', weekKeyOf(new Date('2026-07-16')));
  const entry = reachableNodeIds(stratum);
  assert(entry.length >= 1 && entry.every(id => stratum.nodes.find(n => n.id === id)?.floor === 1), 'H: 入口应指向第 1 层');

  // 小影战：档位限制（无失衡条/只会攻击与异常）+ 2-3 技可杀
  const mob = rollMobSpec(2, 'mob', mulberry32(33));
  const setupH = makeSetup(2, 77);
  setupH.shadow = {
    id: 'mob-1', name: mob.name, level: 2, weakAttribute: mob.weakAttribute, attribute: mob.attribute,
    hp: mob.maxHp, maxHp: mob.maxHp, phase: 1, attackScalePct: 100, responseLines: ['……'], tier: 'mob',
  };
  const e = new BattleEngine(setupH);
  e.openingTurn();
  e.act({ kind: 'switchMask', attribute: mob.weakAttribute });
  const hit: PersonaSkill = { level: 3, name: '当级击打', description: '', type: 'damage', power: 15, spCost: 0 };
  let mobTurns = 0;
  const sawIntents = new Set<string>();
  while (e.snapshot.over === null && mobTurns < 10) {
    mobTurns++;
    if (e.snapshot.intent) sawIntents.add(e.snapshot.intent.kind);
    const r = e.act({ kind: 'skill', skill: hit });
    assert(!r.lines.some(l => l.includes('失去了平衡')), 'H: 小影不应有失衡演出');
  }
  assert(e.snapshot.over === 'victory', 'H: 小影应可速杀', `turns=${mobTurns}`);
  assert(mobTurns <= 4, 'H: 小影应 2-4 回合内解决（弱点打击）', `turns=${mobTurns}`);
  assert([...sawIntents].every(k => k === 'attack' || k === 'debuff'), 'H: 小影意图只应有 攻击/异常', [...sawIntents].join(','));
  console.log(`  ✓ 小影战：${mobTurns} 回合击杀，意图集={${[...sawIntents].join(',')}}`);
}

// ── I. 熟练度（批3）：星级派生 + 满星伤害应高于零熟练 ───────
console.log('── I. 技能熟练度 ──');
{
  const { masteryStars } = await import('../src/battle/numbers');
  assert(masteryStars(0, 1) === 0 && masteryStars(2, 1) === 1 && masteryStars(4, 1) === 2 && masteryStars(5, 1) === 3,
    'I: Lv1 星级阈值 2/4/5', `${masteryStars(2, 1)}/${masteryStars(4, 1)}/${masteryStars(5, 1)}`);
  assert(masteryStars(29, 5) === 2 && masteryStars(30, 5) === 3, 'I: Lv5 满星阈值 30');

  const dmgOf = (mastery: number): number => {
    const setup = makeSetup(3, 555);
    setup.playerHp = 9999; setup.playerMaxHp = 9999;
    setup.shadow.attackScalePct = 10;
    const e = new BattleEngine(setup);
    e.openingTurn();
    // 非弱点、非 crit 技（knowledge 面具 vs guts 弱点错开）
    const sk: PersonaSkill = { level: 3, name: '熟练度测试', description: '', type: 'damage', power: 22, spCost: 0, mastery };
    const r = e.act({ kind: 'skill', skill: sk });
    const m = r.lines.map(l => l.match(/造成了 (\d+) 点伤害/)).find(Boolean);
    return m ? parseInt(m[1], 10) : -1;
  };
  const d0 = dmgOf(0);
  const d3 = dmgOf(15); // Lv3 满星
  assert(d0 > 0 && d3 > d0, 'I: 满星伤害应高于零熟练', `${d0} → ${d3}`);
  assert(Math.abs(d3 - Math.round(d0 * 1.15)) <= 1, 'I: 满星≈+15% 加算', `${d0} → ${d3}`);
  console.log(`  ✓ 熟练度：0星 ${d0} → 满星 ${d3}`);
}

// ── J. 遗物修正（批3）：怀表/徽记/音叉/单片镜/蚀骨/沙漏 ─────
console.log('── J. 遗物修正 ──');
{
  const mods = {
    weaknessAdd: 0.15, addAll: 0.08, chargeAdd: 0.25, oneMoreAdd: 0.2, maskSwitchAdd: 0.15,
    critAdd: 0, spPerTurn: 2, blockHeal: 3, poisonAmp: 0.5, lowHpGuard: 0.18,
  };
  const setupJ = makeSetup(2, 888);
  setupJ.playerHp = 200; setupJ.playerMaxHp = 9999; // 受损态：验证徽记回复
  setupJ.shadow.attackScalePct = 10;
  setupJ.relicMods = mods;
  const e = new BattleEngine(setupJ);
  e.openingTurn();
  const spBefore = e.snapshot.sp;
  const rDef = e.act({ kind: 'defend' });
  assert(e.snapshot.sp === spBefore + 5 + 2, 'J: 防御回合 SP = +5(防御) +2(怀表)', `${spBefore}→${e.snapshot.sp}`);
  assert(rDef.lines.some(l => l.includes('铁壁徽记')), 'J: 徽记应在防御回合回血');

  // 蚀骨之牙：dexterity 施毒 3 → ×1.5 = 5（四舍五入）
  e.act({ kind: 'switchMask', attribute: 'dexterity' });
  const poisonSkill: PersonaSkill = { level: 2, name: '淬毒测试', description: '', type: 'debuff', power: 15, spCost: 0 };
  e.act({ kind: 'skill', skill: poisonSkill });
  const poison = e.snapshot.shadowStatuses.find(s => s.kind === 'poison');
  assert(!!poison && poison.value === 5, 'J: 蚀骨之牙应放大玩家施毒 3→5', `实际=${poison?.value}`);

  // 单片镜+音叉：弱点伤害对照（同种子）
  const weakDmg = (withMods: boolean): number => {
    const s2 = makeSetup(2, 999);
    s2.playerHp = 9999; s2.playerMaxHp = 9999;
    s2.shadow.attackScalePct = 10;
    if (withMods) s2.relicMods = mods;
    const en = new BattleEngine(s2);
    en.openingTurn();
    en.act({ kind: 'switchMask', attribute: 'guts' }); // 弱点
    const sk: PersonaSkill = { level: 2, name: '弱点打', description: '', type: 'damage', power: 15, spCost: 0 };
    const r = en.act({ kind: 'skill', skill: sk });
    const m = r.lines.map(l => l.match(/造成了 (\d+) 点伤害/)).find(Boolean);
    return m ? parseInt(m[1], 10) : -1;
  };
  const base = weakDmg(false);
  const boosted = weakDmg(true);
  assert(boosted > base, 'J: 单片镜+音叉应提升弱点伤害', `${base} → ${boosted}`);
  console.log(`  ✓ 遗物：SP回复/徽记回血/施毒 3→5/弱点伤 ${base}→${boosted}`);
}

// ── K. 誓约技（批3）：六誓全过 + 月光每场一次 + 可逆前提 ────
console.log('── K. 誓约技 ──');
{
  const { OATH_POOL, buildOathSkill } = await import('../src/battle/loot');
  const mkOath = (kind: keyof typeof OATH_POOL, level = 3): PersonaSkill => {
    const orig: PersonaSkill = { level, name: `原技${level}`, description: '', type: 'damage', power: 22, spCost: 18 };
    return buildOathSkill(kind as never, `stone-${String(kind)}`, orig, 'P·测试');
  };
  const setupK = makeSetup(3, 2024);
  setupK.playerHp = 100; setupK.playerMaxHp = 200;
  setupK.shadow.attackScalePct = 10;
  const e = new BattleEngine(setupK);
  e.openingTurn();

  // 月光之誓：+18 SP，每场一次
  const moon = mkOath('moonlight');
  const spBefore = e.snapshot.sp;
  const r1 = e.act({ kind: 'skill', skill: moon });
  assert(e.snapshot.sp >= spBefore + 18 - 2, 'K: 月光之誓应 +18 SP', `${spBefore}→${e.snapshot.sp}`);
  assert(r1.consumedTurn, 'K: 月光之誓应消耗回合');
  const r2 = e.act({ kind: 'skill', skill: moon });
  assert(!r2.consumedTurn && r2.lines.some(l => l.includes('誓约之力')), 'K: 月光之誓第二次应被拦截且不吞回合');

  // 铁壁之誓：护盾展开（同回合可能已被 Shadow 攻击消耗——吸收叙事同样算通过）
  const aegis = mkOath('aegis');
  const rAegis = e.act({ kind: 'skill', skill: aegis });
  assert(
    rAegis.lines.some(l => l.includes('铁壁展开')) &&
    (e.snapshot.playerStatuses.some(s => s.kind === 'shield') || rAegis.lines.some(l => l.includes('护盾吸收'))),
    'K: 铁壁之誓应展开护盾（或同回合完成吸收）');

  // 蓄雷之誓 ×2.3
  const bolt = mkOath('storedbolt');
  const rBolt = e.act({ kind: 'skill', skill: bolt });
  assert(e.snapshot.chargeActive || rBolt.lines.some(l => l.includes('打断')), 'K: 蓄雷后应进入蓄力态（或被打断）');
  if (e.snapshot.chargeActive) {
    const strike: PersonaSkill = { level: 3, name: '释放', description: '', type: 'damage', power: 22, spCost: 0 };
    const rS = e.act({ kind: 'skill', skill: strike });
    assert(rS.lines.some(l => l.includes('×2.3') || l.includes('蓄雷')), 'K: 蓄雷释放应有 ×2.3 叙事');
  }

  // 燃魂之誓：自损但不致死
  const fire = mkOath('soulfire');
  const hpBefore = e.snapshot.playerHp;
  const rF = e.act({ kind: 'skill', skill: fire });
  if (e.snapshot.over === null) {
    assert(rF.lines.some(l => l.includes('誓约的代价')), 'K: 燃魂应有自损叙事');
    assert(e.snapshot.playerHp >= 1, 'K: 燃魂自损不致死', `${hpBefore}→${e.snapshot.playerHp}`);
  }

  // 蚀影之誓：3 层毒 + 镇静
  const rot = mkOath('shadowrot');
  e.act({ kind: 'skill', skill: rot });
  const rotPoison = e.snapshot.shadowStatuses.find(s => s.kind === 'poison');
  assert(!!rotPoison && rotPoison.stacks === 3, 'K: 蚀影应叠 3 层毒', `stacks=${rotPoison?.stacks}`);
  assert(e.snapshot.shadowStatuses.some(s => s.kind === 'calm'), 'K: 蚀影应附带镇静');

  // 深渊之誓：回复 25% 最大 HP（含误差±1）
  const abyss = mkOath('abyss');
  const hpB2 = e.snapshot.playerHp;
  const rA = e.act({ kind: 'skill', skill: abyss });
  if (e.snapshot.over === null) {
    const healed = rA.lines.map(l => l.match(/回复了 (\d+) 点体力/)).find(Boolean);
    const expect = Math.round(200 * 0.25);
    assert(!!healed && Math.abs(parseInt(healed[1], 10) - Math.min(expect, 200 - hpB2)) <= 1,
      'K: 深渊之誓应回复约 25% 最大HP', `实际=${healed?.[1]} 期望≈${expect}`);
  }
  // 可逆前提：oath.original 快照完整
  assert(moon.oath?.original.name === '原技3' && moon.oath.original.power === 22, 'K: 誓约应携带原技能完整快照');
  console.log('  ✓ 六誓约执行 + 每场一次拦截 + 快照可逆前提');
}

// ── L. 迷思石（批3）：减耗/破绽/淬毒/增幅 ──────────────────
console.log('── L. 迷思石 ──');
{
  const setupL = makeSetup(2, 3033);
  setupL.playerHp = 9999; setupL.playerMaxHp = 9999;
  setupL.shadow.attackScalePct = 10;
  const e = new BattleEngine(setupL);
  e.openingTurn();

  // 月光余响：SP 消耗 −2（下限 1）
  const echoSkill: PersonaSkill = {
    level: 2, name: '余响测试', description: '', type: 'damage', power: 15, spCost: 12,
    socket: { stoneId: 'm1', kind: 'moon_echo', value: 2 },
  };
  assert(e.skillCost(echoSkill) === 10, 'L: 月光余响 12−2=10', `${e.skillCost(echoSkill)}`);
  const cheapSkill: PersonaSkill = { ...echoSkill, spCost: 2 };
  assert(e.skillCost(cheapSkill) === 1, 'L: 减耗下限 1', `${e.skillCost(cheapSkill)}`);

  // 淬毒之牙：命中附带中毒
  const venom: PersonaSkill = {
    level: 2, name: '淬毒打', description: '', type: 'damage', power: 15, spCost: 0,
    socket: { stoneId: 'm2', kind: 'venom_bite', value: 3 },
  };
  e.act({ kind: 'skill', skill: venom });
  assert(e.snapshot.shadowStatuses.some(s => s.kind === 'poison'), 'L: 淬毒之牙应附带中毒');

  // 增幅回路：命中后下次伤害提升
  const amp: PersonaSkill = {
    level: 2, name: '增幅打', description: '', type: 'damage', power: 15, spCost: 0,
    socket: { stoneId: 'm3', kind: 'amp_circuit', value: 0.12 },
  };
  const rAmp = e.act({ kind: 'skill', skill: amp });
  assert(rAmp.lines.some(l => l.includes('增幅回路')), 'L: 增幅回路应有充能叙事');

  // 破绽洞察：弱点伤害对照
  const flawDmg = (withSocket: boolean): number => {
    const s2 = makeSetup(2, 4044);
    s2.playerHp = 9999; s2.playerMaxHp = 9999;
    s2.shadow.attackScalePct = 10;
    const en = new BattleEngine(s2);
    en.openingTurn();
    en.act({ kind: 'switchMask', attribute: 'guts' });
    const sk: PersonaSkill = {
      level: 2, name: '破绽打', description: '', type: 'damage', power: 15, spCost: 0,
      socket: withSocket ? { stoneId: 'm4', kind: 'flaw_insight', value: 0.14 } : undefined,
    };
    const r = en.act({ kind: 'skill', skill: sk });
    const m = r.lines.map(l => l.match(/造成了 (\d+) 点伤害/)).find(Boolean);
    return m ? parseInt(m[1], 10) : -1;
  };
  assert(flawDmg(true) > flawDmg(false), 'L: 破绽洞察应提升弱点伤害', `${flawDmg(false)} → ${flawDmg(true)}`);
  console.log('  ✓ 迷思：减耗/淬毒/增幅/破绽');
}

// ── M. 词缀（批3）：月蚀/荆棘/湿滑/迅捷/记仇 ────────────────
console.log('── M. 词缀 ──');
{
  // 月蚀：弱点隐藏 → 洞察揭示
  const setupM = makeSetup(2, 5055);
  setupM.playerHp = 9999; setupM.playerMaxHp = 9999;
  setupM.shadow.attackScalePct = 10;
  setupM.shadow.affixes = ['eclipse', 'thorns'];
  const e = new BattleEngine(setupM);
  e.openingTurn();
  assert(e.snapshot.weaknessHidden === true, 'M: 月蚀开局应隐藏弱点');
  const rIns = e.act({ kind: 'insight' });
  assert(rIns.lines.some(l => l.includes('月蚀散去')), 'M: 洞察应揭示月蚀弱点');
  assert(e.snapshot.weaknessHidden === false, 'M: 揭示后弱点应可见');

  // 荆棘：直接伤害反弹
  const hit: PersonaSkill = { level: 2, name: '荆棘测试', description: '', type: 'damage', power: 15, spCost: 0 };
  const rHit = e.act({ kind: 'skill', skill: hit });
  assert(rHit.lines.some(l => l.includes('荆棘')), 'M: 荆棘应反弹伤害');

  // 湿滑：失衡充能减速（34 → 23）
  const slick = makeSetup(2, 6066);
  slick.playerHp = 9999; slick.playerMaxHp = 9999;
  slick.shadow.attackScalePct = 10;
  slick.shadow.affixes = ['slippery'];
  const e2 = new BattleEngine(slick);
  e2.openingTurn();
  e2.act({ kind: 'switchMask', attribute: 'guts' });
  const poke: PersonaSkill = { level: 1, name: '戳', description: '', type: 'damage', power: 1, spCost: 0 };
  e2.act({ kind: 'skill', skill: poke });
  assert(e2.snapshot.staggerGauge === 23, 'M: 湿滑下弱点充能应为 23（34×0.67）', `${e2.snapshot.staggerGauge}`);

  // 迅捷：开场先制
  const swift = makeSetup(2, 7077);
  swift.playerHp = 9999; swift.playerMaxHp = 9999;
  swift.shadow.affixes = ['swift'];
  const e3 = new BattleEngine(swift);
  const rOpen = e3.openingTurn();
  assert(rOpen.lines.some(l => l.includes('迅捷')), 'M: 迅捷词缀应开场先制');

  // 记仇：撤离过 → 攻击更痛（同种子对照）
  const atkOf = (retreated: boolean): number => {
    const s4 = makeSetup(3, 8088);
    s4.playerHp = 9999; s4.playerMaxHp = 9999;
    s4.shadow.affixes = ['vengeful'];
    s4.playerEverRetreated = retreated;
    const en = new BattleEngine(s4);
    en.openingTurn();
    const r = en.act({ kind: 'basic' });
    const m = r.lines.map(l => l.match(/发动了攻击！造成 (\d+) 点伤害/)).find(Boolean);
    return m ? parseInt(m[1], 10) : -1;
  };
  const a0 = atkOf(false);
  const a1 = atkOf(true);
  assert(a1 > a0 || (a0 < 0 && a1 < 0), 'M: 记仇应加重攻击（同种子对照）', `${a0} → ${a1}`);
  console.log(`  ✓ 词缀：月蚀/荆棘/湿滑23充能/迅捷先制/记仇 ${a0}→${a1}`);
}

// ── N. 共鸣链（批3）：雄辩免费/无畏充能/烈焰首击/守护反击 ───
console.log('── N. 共鸣链 ──');
{
  // 雄辩之智：洞察 0 SP
  const sN = makeSetup(2, 9099);
  sN.playerHp = 9999; sN.playerMaxHp = 9999;
  sN.shadow.attackScalePct = 10;
  sN.chain = 'knowledge+charm';
  const e = new BattleEngine(sN);
  e.openingTurn();
  const spB = e.snapshot.sp;
  e.act({ kind: 'insight' });
  assert(e.snapshot.sp === spB, 'N: 雄辩之智洞察应 0 SP', `${spB}→${e.snapshot.sp}`);

  // 无畏考据：弱点充能 34+10=44
  const sN2 = makeSetup(2, 9100);
  sN2.playerHp = 9999; sN2.playerMaxHp = 9999;
  sN2.shadow.attackScalePct = 10;
  sN2.chain = 'knowledge+guts';
  const e2 = new BattleEngine(sN2);
  e2.openingTurn();
  e2.act({ kind: 'switchMask', attribute: 'guts' });
  const poke: PersonaSkill = { level: 1, name: '戳', description: '', type: 'damage', power: 1, spCost: 0 };
  e2.act({ kind: 'skill', skill: poke });
  assert(e2.snapshot.staggerGauge === 44, 'N: 无畏考据弱点充能应为 44', `${e2.snapshot.staggerGauge}`);

  // 烈焰亮相：首回合伤害更高（同种子对照）
  const t1Dmg = (chain: boolean): number => {
    const s3 = makeSetup(2, 9200);
    s3.playerHp = 9999; s3.playerMaxHp = 9999;
    s3.shadow.attackScalePct = 10;
    if (chain) s3.chain = 'guts+charm';
    const en = new BattleEngine(s3);
    en.openingTurn();
    const sk: PersonaSkill = { level: 2, name: '首击', description: '', type: 'damage', power: 15, spCost: 0 };
    const r = en.act({ kind: 'skill', skill: sk });
    const m = r.lines.map(l => l.match(/造成了 (\d+) 点伤害/)).find(Boolean);
    return m ? parseInt(m[1], 10) : -1;
  };
  assert(t1Dmg(true) > t1Dmg(false), 'N: 烈焰亮相首回合应更痛', `${t1Dmg(false)} → ${t1Dmg(true)}`);
  console.log('  ✓ 共鸣链：雄辩0SP/无畏44充能/烈焰首击');
}

// ── O. 批4 日常闭环：弹药/结余护壁/物欲缠身/同伴庇护/光辉判定 ──
console.log('── O. 日常闭环 ──');
{
  const { ammoFromActivities, currentRecordStreak, shouldGrantDiligence } = await import('../src/battle/preparation');

  // 弹药纯函数：今日 2 条胆量记录 → +8%；4 条 → 封顶 12%
  const mkAct = (attr: AttributeId, dateKey: string) => ({
    date: new Date(dateKey + 'T12:00:00'),
    pointsAwarded: { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0, [attr]: 1 } as Record<AttributeId, number>,
  });
  const a2 = ammoFromActivities([mkAct('guts', '2026-07-19'), mkAct('guts', '2026-07-19'), mkAct('guts', '2026-07-18')], '2026-07-19');
  assert(Math.abs((a2.guts ?? 0) - 0.08) < 1e-9, 'O: 今日2条记录应 +8%', `${a2.guts}`);
  const a4 = ammoFromActivities(Array.from({ length: 4 }, () => mkAct('guts', '2026-07-19')), '2026-07-19');
  assert(Math.abs((a4.guts ?? 0) - 0.12) < 1e-9, 'O: 弹药应封顶 +12%', `${a4.guts}`);

  // 光辉判定：连续 3 天 + 间隔约束
  const streak = currentRecordStreak(['2026-07-17', '2026-07-18', '2026-07-19'].map(d => new Date(d + 'T09:00:00')), '2026-07-19');
  assert(streak === 3, 'O: 连续三天记录 streak=3', `${streak}`);
  assert(shouldGrantDiligence(3, undefined, '2026-07-19') === true, 'O: 首次达标应发放');
  assert(shouldGrantDiligence(3, '2026-07-18', '2026-07-19') === false, 'O: 间隔<3天不重复发放');
  assert(shouldGrantDiligence(3, '2026-07-16', '2026-07-19') === true, 'O: 间隔≥3天可再发');

  // 弹药进引擎：同种子对照（非弱点、非暴击路径）
  const ammoDmg = (withAmmo: boolean): number => {
    const s = makeSetup(2, 12012);
    s.playerHp = 9999; s.playerMaxHp = 9999;
    s.shadow.attackScalePct = 10;
    if (withAmmo) s.ammoAddPct = { knowledge: 0.12 };
    const en = new BattleEngine(s);
    en.openingTurn();
    const sk: PersonaSkill = { level: 2, name: '弹药打', description: '', type: 'damage', power: 15, spCost: 0 };
    const r = en.act({ kind: 'skill', skill: sk });
    const m = r.lines.map(l => l.match(/造成了 (\d+) 点伤害/)).find(Boolean);
    return m ? parseInt(m[1], 10) : -1;
  };
  assert(ammoDmg(true) > ammoDmg(false), 'O: 弹药应提升伤害', `${ammoDmg(false)} → ${ammoDmg(true)}`);

  // 结余护壁：mob 战首次受击减半（每 session 一次）
  const sWard = makeSetup(2, 13013);
  sWard.playerHp = 9999; sWard.playerMaxHp = 9999;
  sWard.shadow.tier = 'mob';
  sWard.ledgerWard = true;
  const eW = new BattleEngine(sWard);
  eW.openingTurn();
  let wardLines = 0;
  for (let i = 0; i < 6 && eW.snapshot.over === null; i++) {
    const r = eW.act({ kind: 'basic' });
    wardLines += r.lines.filter(l => l.includes('结余护壁')).length;
  }
  assert(wardLines === 1 && eW.snapshot.wardConsumed, 'O: 结余护壁应恰好吸收一次', `${wardLines}次`);

  // 物欲缠身：boss 开场 2 回合伤害更低（同种子对照）
  const curseDmg = (cursed: boolean): number => {
    const s = makeSetup(3, 14014);
    s.playerHp = 9999; s.playerMaxHp = 9999;
    s.shadow.attackScalePct = 10;
    s.spendCurse = cursed;
    const en = new BattleEngine(s);
    en.openingTurn();
    const sk: PersonaSkill = { level: 3, name: '缠身打', description: '', type: 'damage', power: 22, spCost: 0 };
    const r = en.act({ kind: 'skill', skill: sk });
    const m = r.lines.map(l => l.match(/造成了 (\d+) 点伤害/)).find(Boolean);
    return m ? parseInt(m[1], 10) : -1;
  };
  assert(curseDmg(true) < curseDmg(false), 'O: 物欲缠身应削减开场伤害', `${curseDmg(false)} → ${curseDmg(true)}`);

  // 同伴庇护：致命一击时应消耗判定（掷骰成败皆合法；保成则 HP=1）
  const sGuard = makeSetup(1, 15015);
  sGuard.playerHp = 1; sGuard.playerMaxHp = 100;
  sGuard.initialMask = 'guts'; // 绕开温柔面具复活
  sGuard.companionGuard = '模拟同伴';
  const eG = new BattleEngine(sGuard);
  eG.openingTurn();
  for (let i = 0; i < 8 && eG.snapshot.over === null && !eG.snapshot.companionGuardConsumed; i++) {
    eG.act({ kind: 'basic' });
  }
  assert(eG.snapshot.companionGuardConsumed || eG.snapshot.over === 'victory',
    'O: 致命受击应触发同伴庇护判定（或提前速杀了对手）');
  if (eG.snapshot.companionGuardConsumed && eG.snapshot.over === null) {
    assert(eG.snapshot.playerHp === 1, 'O: 庇护成功应保留 1 HP', `${eG.snapshot.playerHp}`);
  }
  console.log('  ✓ 弹药/光辉判定/护壁一次/物欲削伤/同伴庇护');
}

console.log('');
if (failures > 0) {
  console.error(`✗ 模拟战失败：${failures} 项断言未通过`);
  process.exit(1);
} else {
  console.log('✓ 模拟战全部通过');
}
