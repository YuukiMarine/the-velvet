/**
 * 影时间高塔 · 事件池（BATTLE_UPGRADE_PLAN_V2.md §10.1，批2）
 *
 * 全部本地模板零 AI。effect 是声明式描述，由 store/UI 执行：
 *  - 需要真实数据的（旧日回音/镜之自问）由执行层注入素材
 *  - 月相祭坛（依赖词缀）与勤勉试炼（依赖批4 备战抽取）暂不入池，词缀/备战落地后接入
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */

export type TowerEventEffect =
  | { kind: 'sessionBuff'; id: string; label: string; addPct: number }  // 本次登塔伤害加算
  | { kind: 'hpLossPct'; pct: number }
  | { kind: 'hpHealPct'; pct: number }
  | { kind: 'sp'; amount: number }
  | { kind: 'skipNextFloor' }
  | { kind: 'mobFight' }               // 触发一场小影战（当前节点变身战斗）
  | { kind: 'rerollFloor' }            // 重掷本层未探索节点
  | { kind: 'stealFirstStrike' }       // 下一战被夺先手（Shadow 先攻一次）
  | { kind: 'quiz'; reward: number }   // 镜之自问：答对 +SP（素材执行层注入）
  | { kind: 'echoLine' }               // 旧日回音：引用最近一条重要记录（素材执行层注入）
  | { kind: 'nothing' };

export interface TowerEventOption {
  label: string;
  /** 结果文案（{n} 等占位由执行层替换） */
  resultText: string;
  effects: TowerEventEffect[];
  /** 概率分歧：命中 roll < chance 用 effects，否则用 elseEffects */
  chance?: number;
  elseResultText?: string;
  elseEffects?: TowerEventEffect[];
}

export interface TowerEvent {
  id: string;
  title: string;
  icon: string;
  text: string;
  options: TowerEventOption[];
}

export const TOWER_EVENTS: TowerEvent[] = [
  {
    id: 'moonlit-pool',
    title: '月光积水',
    icon: '💧',
    text: '塔层的凹陷处积着一汪月光色的水，水面映出的不是你的脸。',
    options: [
      {
        label: '凝视水面',
        chance: 0.5,
        resultText: '水中的你对你点了点头——一股清亮的力量涌上来。（本次登塔伤害 +5%）',
        effects: [{ kind: 'sessionBuff', id: 'moonlit', label: '月光映照 +5%', addPct: 0.05 }],
        elseResultText: '水面骤然扭曲——那张脸抢先夺走了你的气势。（下一战被夺先手）',
        elseEffects: [{ kind: 'stealFirstStrike' }],
      },
      { label: '绕开路过', resultText: '你没有理会。水面平静如常。', effects: [{ kind: 'nothing' }] },
    ],
  },
  {
    id: 'lost-shadow',
    title: '迷途之影',
    icon: '👤',
    text: '一只不具敌意的小影蜷在栏杆边，冲你比划着上层的方向。',
    options: [
      {
        label: '为它引路',
        chance: 0.6,
        resultText: '小影感激地散开，留下一小袋月色碎屑。（+18 SP）',
        effects: [{ kind: 'hpLossPct', pct: 0.08 }, { kind: 'sp', amount: 18 }],
        elseResultText: '引路耗去了你不少体力，小影消散前只留下一声叹息。',
        elseEffects: [{ kind: 'hpLossPct', pct: 0.08 }],
      },
      { label: '无视它', resultText: '你径直走过。身后传来轻微的水声。', effects: [{ kind: 'nothing' }] },
    ],
  },
  {
    id: 'old-echo',
    title: '旧日回音',
    icon: '📻',
    text: '塔壁里嵌着一台老旧的收音机，沙沙声中隐约是你自己的声音。',
    options: [
      {
        label: '侧耳聆听',
        resultText: '电流声里播出了你的记录——「{echo}」。那一刻的你在为现在的你充电。（+8 SP）',
        effects: [{ kind: 'echoLine' }, { kind: 'sp', amount: 8 }],
      },
      { label: '捂住耳朵', resultText: '有些声音，现在还不想听。', effects: [{ kind: 'nothing' }] },
    ],
  },
  {
    id: 'broken-stairs',
    title: '断裂的阶梯',
    icon: '🪜',
    text: '前方的阶梯断了一截，缺口上方隐约可见更高的层面。',
    options: [
      {
        label: '强行攀越',
        resultText: '你抓着断口硬爬了上去，手臂被划出几道口子。（失去 8% 体力，跃过下一层）',
        effects: [{ kind: 'hpLossPct', pct: 0.08 }, { kind: 'skipNextFloor' }],
      },
      {
        label: '稳步绕行',
        resultText: '绕行的暗廊里埋伏着一只小影——遭遇战！',
        effects: [{ kind: 'mobFight' }],
      },
    ],
  },
  {
    id: 'shadow-merchant',
    title: '影之商人',
    icon: '🎭',
    text: '穿旧大衣的影子摆开一方小摊，货物在月光下明明灭灭。「拿 SP 来换，不讲价。」',
    options: [
      { label: '小回复剂（15 SP）', resultText: '苦得像药，但确实管用。（回复 15% 体力）', effects: [{ kind: 'sp', amount: -15 }, { kind: 'hpHealPct', pct: 0.15 }] },
      { label: '月色护符（25 SP）', resultText: '护符贴着掌心微微发烫。（本次登塔伤害 +8%）', effects: [{ kind: 'sp', amount: -25 }, { kind: 'sessionBuff', id: 'charm-amulet', label: '月色护符 +8%', addPct: 0.08 }] },
      { label: '不买', resultText: '影子耸了耸肩，把摊子收进了自己的影子里。', effects: [{ kind: 'nothing' }] },
    ],
  },
  {
    id: 'mirror-question',
    title: '镜之自问',
    icon: '🪞',
    text: '一面立镜拦在路中央，镜中的你开口了：「回答我——关于你自己的问题。」',
    options: [
      {
        label: '直面镜子',
        resultText: '你答对了。镜中的你微微一笑，化作光点涌入你的胸口。（+12 SP）',
        effects: [{ kind: 'quiz', reward: 12 }],
      },
      { label: '移开视线', resultText: '镜面暗了下去。它没有为难你。', effects: [{ kind: 'nothing' }] },
    ],
  },
  {
    id: 'offering-altar',
    title: '供奉台',
    icon: '🕯️',
    text: '一座矮小的供奉台，凹槽的形状像是在等待某种「代价」。',
    options: [
      {
        label: '供奉 20 SP',
        resultText: '烛火转为月白色，暖意漫过全身。（回复 20% 体力）',
        effects: [{ kind: 'sp', amount: -20 }, { kind: 'hpHealPct', pct: 0.2 }],
      },
      { label: '离开', resultText: '烛火轻轻晃了晃，仿佛在目送你。', effects: [{ kind: 'nothing' }] },
    ],
  },
  {
    id: 'hourglass',
    title: '时之沙漏',
    icon: '⏳',
    text: '悬空的巨大沙漏缓缓倒转，本层的景象在沙粒间隐约重组。',
    options: [
      { label: '翻转沙漏', resultText: '沙粒逆流，本层未探索的道路重新洗牌了。', effects: [{ kind: 'rerollFloor' }] },
      { label: '不去碰它', resultText: '沙漏静静悬着，时间照旧流逝。', effects: [{ kind: 'nothing' }] },
    ],
  },
  {
    id: 'lurking-shadow',
    title: '蛰伏之影',
    icon: '🕳️',
    text: '阴影在角落里蠕动——它还没发现你。先下手，还是绕过去？',
    options: [
      {
        label: '突袭它',
        chance: 0.55,
        resultText: '一击得手！它慌乱地逃散，掉落了不少月色碎屑。（+15 SP）',
        effects: [{ kind: 'sp', amount: 15 }],
        elseResultText: '脚下的碎石出卖了你——它猛然回头！（失去 6% 体力）',
        elseEffects: [{ kind: 'hpLossPct', pct: 0.06 }],
      },
      { label: '悄悄绕开', resultText: '你屏住呼吸贴墙而过。有惊无险。', effects: [{ kind: 'nothing' }] },
    ],
  },
  {
    id: 'nameless-letter',
    title: '无名的信',
    icon: '✉️',
    text: '一封没有署名的信被压在石砖下，字迹陌生又熟悉：「继续爬。别回头。」',
    options: [
      {
        label: '收下鼓励',
        resultText: '不知为何，脚步轻快了一些。（本次登塔伤害 +6%）',
        effects: [{ kind: 'sessionBuff', id: 'nameless-letter', label: '无名鼓励 +6%', addPct: 0.06 }],
      },
      { label: '放回原处', resultText: '也许它在等别的什么人。', effects: [{ kind: 'nothing' }] },
    ],
  },
];

export const TOWER_EVENT_IDS = TOWER_EVENTS.map(e => e.id);

export function getTowerEvent(id: string): TowerEvent | undefined {
  return TOWER_EVENTS.find(e => e.id === id);
}
