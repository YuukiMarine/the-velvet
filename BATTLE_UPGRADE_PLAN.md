# 逆影战场 · 深度升级设计文档

> 目标：把当前战斗从"选技能 → 看结果"的简化回合制，升级为有 Shadow AI 策略、持续状态演化、玩家战术权衡的成熟回合制。
> 版本号目标：v1.9.0
> 预估工期：2-3 天，约 500-550 行改动

---

## 核心设计原则（两条硬约束）

### 约束 A：AI 生成接口不变
`generatePersonaSkills` / `reshuffleAttributePersonaAI` / `generateAISkillsForPersona` 的 prompt 与输出 schema **零修改**。技能枚举仍为 7 种：`damage / crit / buff / debuff / charge / heal / attack_boost`。

**效果多样性来自"属性 × type"映射**，由执行器（`performBattleAction` 所在处）根据 `skill.attribute + skill.type` 动态解析最终效果。AI 只负责 type/power/spCost/name/description，不感知复杂度。

### 约束 B：Shadow 台词不扩 AI prompt
现有 AI 仍只生成 8 条通用 `responseLines`。新情境（打断、狂化、Phase 2、DoT tick 等）的台词**全部系统内置**在 `src/constants/shadowLines.ts`，以类别字典的形式存在。触发时按上下文抽取。

---

## 属性 × Type 效果映射表

执行器按此表执行技能最终效果。未在表中指定的组合沿用当前（v1.8.5）行为。

| 属性 | debuff | attack_boost | buff | heal | 其他 |
|---|---|---|---|---|---|
| **knowledge（知识）** | 猎手标记：Shadow 受到伤害 ×1.2，持续 2 回合 | 洞察：Shadow 下回合暴击率 −50%，持续 2 回合 | 原（下次 ×1.5） | 原 | damage/crit/charge 沿用 |
| **guts（胆量）** | 恐惧：Shadow 下回合 50% 概率跳过 | 狂怒：原效果不变（+15 + 3 回合增伤） | 原 | 原 | damage/crit/charge 沿用 |
| **dexterity（灵巧）** | 中毒：每回合 -3 HP，3 回合，可叠 3 层 | 连击强化：下 3 回合暴击率 +25% | 原 | 原 | damage/crit/charge 沿用 |
| **kindness（温柔）** | 镇静：Shadow 下 2 回合攻击 ×0.7 | 护盾：吸收下一次伤害的 60% | 原 | 回复 8 HP（原 5） | damage/crit/charge 沿用 |
| **charm（魅力）** | 魅惑：Shadow 下回合 50% 概率打自己 | 共鸣：下次伤害 ×1.8 | 原 | 原 | damage/crit/charge 沿用 |

**备注**：`damage` / `crit` / `charge` 在所有属性下行为一致（暴力/暴击/蓄力）。`buff` 在 knowledge/charm 之外沿用旧的"下次 ×1.5"。

---

## 数据结构变更

### 新增 StatusEffect 类型

新文件 `src/types/battle.ts`（或加到现有 `src/types/index.ts`）：

```typescript
export type StatusKind =
  | 'poison'        // 中毒（DoT）
  | 'mark'          // 猎手标记（受伤 ×mult）
  | 'fear'          // 恐惧（概率跳过）
  | 'calm'          // 镇静（攻击 ×mult）
  | 'charm'         // 魅惑（概率自伤）
  | 'shield'        // 护盾（吸收伤害）
  | 'crit_buff'     // 暴击率增强
  | 'crit_debuff'   // 暴击率削弱
  | 'resonance';    // 共鸣（下次伤害强化）

export interface StatusEffect {
  kind: StatusKind;
  /** 剩余回合数，0 表示本回合结束后清除 */
  remainingTurns: number;
  /** 数值参数（DoT damage / multiplier / probability / shield amount 等） */
  value: number;
  /** 叠加层数，默认 1 */
  stacks: number;
  /** 触发来源的技能名（显示用） */
  sourceName?: string;
}
```

### BattleState 扩展（非破坏性）

```typescript
interface BattleState {
  // ... 现有字段
  playerStatusEffects?: StatusEffect[];   // 作用于玩家的状态
  shadowStatusEffects?: StatusEffect[];   // 作用于 Shadow 的状态
  shadowBerserk?: boolean;                // Shadow 是否狂化
  lastPlayerWeaknessHits?: number;        // 连续弱点命中计数（用于 All-Out）
}
```

### PersonaSkill 不改

保持原接口，向后兼容所有已生成的 Persona 数据。

---

## 回合流程升级

### 新的回合序（伪代码）

```
== 回合开始 ==
1. Tick 玩家状态：
   - poison: 玩家 HP -= value * stacks
   - shield: 保留（在受伤时消费）
   - crit_debuff: 保留（在选技能时应用）
   - 所有状态 remainingTurns--，=0 时清除
2. Tick Shadow 状态：同上（注意 charm 在玩家回合处理）
3. 触发情境台词（如有 DoT → dotTick 台词）

== 玩家回合 ==
4. 判断玩家是否 fear 生效 → 概率跳过
5. 玩家选择动作：
   a) 使用技能（原流程 + 根据属性×type 触发 StatusEffect）
   b) 防御（本回合伤害 ×0.5 + 回复 3 SP）【新】
   c) 洞察（消耗 2 SP，显示 Shadow 下一步 + 下 1 回合 Shadow 暴击率 −50%）【新】
   d) All-Out Attack（需连续 3 次弱点命中解锁，一击释放所有 Persona Lv5 技能伤害之和 × 0.6）【新】

== Shadow 回合 ==
6. Shadow AI 决策（见下节），选择 action
7. Shadow 攻击或特殊行为
8. 判断玩家 shield 吸收、charm 自伤等

== 回合结束 ==
9. 检查 HP 归零 / Phase 2 触发
10. 更新 offBalance CD 等
```

---

## Shadow AI 决策树

新增函数 `decideShadowAction(state)` 于 BattleModal.tsx。按优先级规则命中即返回：

```typescript
// 优先级 1：玩家蓄力 → 打断
if (chargeActive) return { type: 'interrupt', line: 'interrupt' };

// 优先级 2：玩家连续 2 次弱点命中 → 警戒（自身减伤）
if (recentWeaknessHits >= 2) return { type: 'guard', line: 'guarding' };

// 优先级 3：自身 HP < 30% 且非狂化 → 狂化转变
if (shadowHpRatio < 0.3 && !shadowBerserk) return { type: 'enterBerserk', line: 'berserk' };

// 优先级 4：玩家 HP < 25% → 追击（必暴击）
if (playerHpRatio < 0.25) return { type: 'execute', line: 'playerLowHp' };

// 优先级 5：玩家有持续伤害（DoT） → 嘲讽 + 普通攻击
if (playerHasDot) return { type: 'mock', line: 'dotTick' };

// 默认：普通攻击（原有逻辑，含概率暴击）
return { type: 'normal', line: 'generic' };
```

**狂化（berserk）效果**：攻击 ×1.5，每回合自伤 1 HP，持续到战斗结束。
**警戒（guard）效果**：本回合受到弱点攻击 ×0.5（反惩罚）。

---

## 内置台词库结构

新文件 `src/constants/shadowLines.ts`：

```typescript
export const SHADOW_CONTEXTUAL_LINES: Record<string, string[]> = {
  // 现有行为
  generic: [...],  // 从 AI 生成的 responseLines 动态传入，这里留空兜底

  // 新增情境
  interrupt: [
    '就是现在……你的破绽！',
    '蓄力？太天真了。',
    '让我来打破你的节奏。',
    '那一瞬的空隙，足够了。',
  ],
  guarding: [
    '我也学乖了。',
    '你的弱点我已看穿。',
    '两次？够了。',
  ],
  berserk: [
    '{name} 的力量在暗处暴涨……！',
    '不够，还远远不够！',
    '你唤醒了我真正的样子。',
  ],
  phase2Open: [
    '这才是我真正的形态……',
    '你以为这就结束了？',
    '从现在开始，才是真正的交锋。',
  ],
  playerLowHp: [
    '苟延残喘罢了。',
    '结束了。',
    '就到这里吧。',
  ],
  selfLowHp: [
    '还没……还没结束！',
    '我不会就这么消散。',
    '你以为你赢了？',
  ],
  dotTick: [
    '毒性正在侵蚀你……',
    '疼吗？',
    '慢慢品味这份无力吧。',
  ],
  playerDefense: [
    '龟缩无用。',
    '防御撑不了几回合。',
  ],
  insightUsed: [
    '你以为看穿我就够了？',
    '知道了又如何？',
  ],
  allOutReady: [
    '不……你不会——！',
    '那是……禁忌的力量……！',
  ],
};

/** 按类别随机抽一条，替换 {name} 占位符 */
export function pickShadowLine(category: string, shadowName: string): string {
  const pool = SHADOW_CONTEXTUAL_LINES[category] || [];
  if (pool.length === 0) return '';
  return pool[Math.floor(Math.random() * pool.length)].replace('{name}', shadowName);
}
```

**使用**：BattleModal 中渲染 Shadow 反击叙事时，根据当前上下文调 `pickShadowLine(category, shadow.name)`。若 category='generic'，改用 `shadow.responseLines` 随机抽（兼容现有数据）。

---

## 新增玩家战术按钮

UI 位置：BattleModal 技能面板上方，独立一行 3 个按钮。
视觉风格：比技能按钮略小，icon + 简短标签。

### 1. 🛡️ 防御
- 消耗：0 SP
- 效果：本回合所有受到的伤害 ×0.5 + 回合结束时 SP +3
- 禁用条件：无
- 目的：给 SP 续航提供"放弃输出换资源"的权衡

### 2. 🔍 洞察
- 消耗：2 SP
- 效果：弹出 Shadow 下一步意图提示框（显示 decideShadowAction 返回的 type）+ Shadow 下一回合暴击率 −50%
- 禁用条件：SP < 2
- 目的：配合 Shadow AI 策略化，让"策略猜测"有工具可依

### 3. ⚡ All-Out Attack
- 消耗：所有当前 SP
- 效果：造成"本 Persona 所有 Lv5 技能威力之和 × 0.6"的伤害（忽略 Shadow 防御 buff）
- 解锁条件：连续 3 次弱点命中未断连
- 视觉：全屏 cut-in 动画（类似 P5 致敬，可复用 BattleStartOverlay 的 motion 片段）
- 目的：修复当前 `comboCount` 纯装饰的问题，给"连续击中弱点"一个强化终点

---

## 关键文件清单与改动量

| 文件 | 改动类型 | 预估行数 |
|------|------|------|
| `src/types/index.ts` | 新增 StatusEffect 类型 + BattleState 扩展 | +30 |
| `src/constants/shadowLines.ts` | 新文件（台词库 + pickShadowLine） | +80 |
| `src/constants/index.ts` | 新增属性×type 效果映射表（SKILL_EFFECT_MAP） | +50 |
| `src/components/battle/BattleModal.tsx` | useSkill 重构 + tick 回合状态 + 3 个战术按钮 + Shadow 决策 + All-Out 动画 | +300 / 重构 150 |
| `src/components/battle/StatusBar.tsx` | 新文件（状态效果图标条，显示双方当前 debuff/buff） | +80 |
| `src/store/index.ts` | BattleState 迁移：给存量数据加默认空 StatusEffect 数组 | +20 |

**合计约 560 行新增 + 150 行重构**。

---

## 实施顺序

建议分 3 个 PR / commit 递进，每个都可独立验证：

### Phase 1：基础架构（1 天）
1. `StatusEffect` 类型定义
2. BattleState 迁移（存量数据兜底）
3. `SKILL_EFFECT_MAP`（属性×type 效果表）
4. `performBattleAction` 重构：根据映射表附加 StatusEffect
5. 回合开始的 tick 逻辑（DoT/状态衰减）
6. UI：StatusBar 组件显示双方状态图标

**验证点**：AI 生成的 debuff 技能按属性触发不同效果；中毒每回合扣血可见；状态回合数倒计时正确。

### Phase 2：Shadow AI + 台词（0.5 天）
1. 创建 `src/constants/shadowLines.ts`
2. 实现 `decideShadowAction(state)` 决策树
3. Shadow 狂化 / 警戒效果
4. 各 action 绑定台词类别

**验证点**：蓄力时 Shadow 确实优先打断；Shadow 血量 < 30% 触发狂化台词和攻击强化；Phase 2 开启有专属台词。

### Phase 3：玩家战术按钮（1 天）
1. 添加 3 个按钮 UI
2. 防御 / 洞察逻辑
3. All-Out Attack（含全屏动画）
4. 平衡性调优（数值微调）

**验证点**：防御可续航至 10+ 回合；洞察能准确显示 Shadow 下一步；连续 3 弱点命中后 All-Out 解锁并一击重创。

---

## 兼容性与风险

- **AI 生成数据**：完全兼容，无需迁移
- **BattleState 存量**：加载时补默认空 StatusEffect 数组即可（一行代码）
- **平衡性**：Phase 1 后可能出现中毒/护盾"叠螺旋"，需要在 Phase 2 之前手动跑几场测试战微调数值
- **UI 信息密度**：6 种新状态 + 3 个新按钮 + 决策提示，可能挤满小屏幕。必要时把技能面板做成可折叠抽屉

---

## 未纳入此次升级的方向（备档）

- 战场地形 / 环境效果 → 下一版本
- Phase 3（召唤分身） → 下一版本
- 战斗道具系统 → 需要先规划道具与日常任务的闭环
- 速度属性 / 先攻系统 → 侵入性太高，暂缓

---

## 下一步操作

1. Claude 读完本文档后，按 Phase 1 → Phase 2 → Phase 3 顺序实施
2. 每个 Phase 结束时做一次 `npx tsc --noEmit && npm run build` 验证
3. 若平衡性出问题，优先调整 `SKILL_EFFECT_MAP` 的数值而不是重构结构
