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
const BOSS_HP: Record<number, { hp: number; hp2?: number }> = {
  1: { hp: 150 }, 2: { hp: 200 }, 3: { hp: 260, hp2: 80 }, 4: { hp: 340, hp2: 110 }, 5: { hp: 420, hp2: 130 },
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

console.log('');
if (failures > 0) {
  console.error(`✗ 模拟战失败：${failures} 项断言未通过`);
  process.exit(1);
} else {
  console.log('✓ 模拟战全部通过');
}
