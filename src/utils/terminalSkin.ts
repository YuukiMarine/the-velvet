/**
 * terminalSkin — F3 无气力症治疗终端的「主题差分皮肤」（PRD F3.6）。
 *
 * 终端 UI/文案随当前主题色切换频道皮肤：
 *   · 蓝            → 匿名讨论板（低语、匿名、彼此扶持）
 *   · 黄            → TV 特别节目（综艺/节目化、明亮、口号式打气）
 *   · 红 / 粉 / 自定义 → 怪盗 channel（怪盗团式「改变心意」、热血宣言）
 *
 * 同时承载「离线拆解模板」：无 AI Key 时，把一件事砍到「最小第一步」的兜底文案
 * （在线拆解走 store.decomposeStepAI）。
 */
import type { ThemeType } from '@/types';

export type TerminalChannel = 'board' | 'tv' | 'thief';

export interface TerminalSkin {
  channel: TerminalChannel;
  /** 频道名 */
  label: string;
  /** 基调副标 */
  tagline: string;
  /** 「替我决定」主按钮 */
  decideHero: string;
  /** 「我自己选」次按钮 */
  decideSelf: string;
  /** 短路决策区引导语 */
  decideHint: string;
  /** 候选池为空时 */
  emptyPool: string;
  /** 候选选择器标题 */
  pickTitle: string;
  /** 拆解中 loading 文案 */
  decomposing: string;
  /** 行动指令前导 */
  stepLead: string;
  /** 接受按钮（落成 24h 限时任务，Batch 3 接） */
  accept: string;
  /** 换一件 */
  again: string;
  /** 再拆一次 */
  redo: string;
  /** 结果页鼓励语（随机取一条） */
  encourage: string[];
  /** 离线拆解模板（按 title 套用，随机取一条） */
  stepTemplates: Array<(title: string) => string>;
}

const BOARD: TerminalSkin = {
  channel: 'board',
  label: '匿名讨论板',
  tagline: '低语 · 匿名 · 彼此扶持',
  decideHero: '替我决定',
  decideSelf: '我自己选一件',
  decideHint: '今天不必想清楚全部。让终端替你挑一件，只迈出一步。',
  emptyPool: '清单和待办都空着——先去许个愿望，或添一条待办，再回来。',
  pickTitle: '选一件此刻困扰你的事',
  decomposing: '正在把它拆小…',
  stepLead: '你只需要做这一件——',
  accept: '接受 · 落成 24h 限时任务',
  again: '换一件',
  redo: '再拆一次',
  encourage: ['有人也这样熬过来。', '迈出去，就已经赢过昨天的自己。', '不必做好，先做一点点。'],
  stepTemplates: [
    (t) => `把「${t}」砍到只剩第一下：现在去打开相关的那样东西——书 / 文件 / 应用，打开就停下，也算数。`,
    (t) => `不必做完。为「${t}」写下你要做的第一行字，五分钟就好。`,
    (t) => `先把「${t}」需要的第一件道具拿到手边，然后开始。`,
  ],
};

const TV: TerminalSkin = {
  channel: 'tv',
  label: 'TV 特别节目',
  tagline: '明亮 · 节目化 · 为你打气',
  decideHero: '交给转盘！',
  decideSelf: '我来点单',
  decideHint: '欢迎回到今天的特别节目——别纠结，转盘一转，任务就来！',
  emptyPool: '节目单还空着！先添个愿望或待办，咱们才好开场。',
  pickTitle: '今天想挑战哪一关？',
  decomposing: '导播正在剪辑你的第一步…',
  stepLead: '本期第一个环节，超简单——',
  accept: '接受 · 落成 24h 限时任务',
  again: '换一关',
  redo: '重剪一次',
  encourage: ['观众席为你鼓掌！', '这一步稳稳的，下一步更容易。', '开场最难，而你已经开场了。'],
  stepTemplates: [
    (t) => `第一关超简单：把「${t}」相关的第一样东西打开，亮个相就过关。`,
    (t) => `热身环节——为「${t}」写下第一行 / 迈出第一步，限时 5 分钟！`,
    (t) => `道具准备：把「${t}」要用的第一件东西摆到手边，预备，开始！`,
  ],
};

const THIEF: TerminalSkin = {
  channel: 'thief',
  label: '怪盗 channel',
  tagline: '改变心意 · 热血宣言',
  decideHero: '锁定目标',
  decideSelf: '亲自挑一件',
  decideHint: '别让无气力偷走今天。锁定一件「心之宝物」，先夺回第一步。',
  emptyPool: '还没有可下手的目标。先立个愿望、或记条待办作为「宝物」。',
  pickTitle: '锁定一件要夺回的「心之宝物」',
  decomposing: '正在制定潜入路线…',
  stepLead: '潜入的第一步，只此一招——',
  accept: '接受 · 发出预告状（24h）',
  again: '换个目标',
  redo: '重定路线',
  encourage: ['Take your heart——先拿下第一步。', '怪盗的字典里没有「做不到」。', '预告已发，行动开始。'],
  stepTemplates: [
    (t) => `潜入第一步：把「${t}」相关的第一样东西「撬开」——翻开书 / 打开文件，门开了就算成功。`,
    (t) => `先夺回 5 分钟：为「${t}」写下第一行 / 迈出第一步，剩下的交给行动。`,
    (t) => `备好第一件「道具」：把「${t}」要用的东西拿到手边，然后出手。`,
  ],
};

/** 主题 → 频道：蓝=讨论板 / 黄=TV / 红·粉·自定义=怪盗 */
export const terminalChannel = (theme?: ThemeType): TerminalChannel =>
  theme === 'blue' ? 'board' : theme === 'yellow' ? 'tv' : 'thief';

export const terminalSkin = (theme?: ThemeType): TerminalSkin => {
  switch (terminalChannel(theme)) {
    case 'board':
      return BOARD;
    case 'tv':
      return TV;
    default:
      return THIEF;
  }
};

/** 离线兜底：把一件事套用频道模板，拆成「最小第一步」。idx 缺省随机。 */
export const minimalStep = (skin: TerminalSkin, title: string, idx?: number): string => {
  const tpls = skin.stepTemplates;
  const i = idx === undefined ? Math.floor(Math.random() * tpls.length) : ((idx % tpls.length) + tpls.length) % tpls.length;
  return tpls[i](title);
};

/** 随机取一条鼓励语 */
export const pickEncourage = (skin: TerminalSkin): string =>
  skin.encourage[Math.floor(Math.random() * skin.encourage.length)];
