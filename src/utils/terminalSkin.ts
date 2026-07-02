/**
 * terminalSkin — F3 无气力症治疗终端的「主题差分皮肤」（PRD F3.6）。
 *
 * 终端 UI/文案随当前主题色切换频道皮肤：
 *   · 蓝 / 粉 / 自定义 → 学园深夜BBS（低语、匿名、彼此扶持；随 App 明暗自适配）
 *   · 黄            → 深夜TV特别节目（综艺/节目化、明亮、口号式打气）
 *   · 红            → 怪盗 channel（怪盗团式「夺回今天」）
 *
 * 注：怪盗皮肤是硬编码暗底 P5 房间，强调色直接用 var(--color-primary) 当「黑底上可读的
 * 高饱和红」。自定义主题的 primary 可为任意（含近黑）色、无明度保证，故**不归怪盗**，
 * 改走自适配明暗的讨论板兜底，避免 text-primary 落在暗卡上不可读。
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
  /** 接受按钮（生成当前 24h 小步卡） */
  accept: string;
  /** 换一件 */
  again: string;
  /** 再拆一次 */
  redo: string;
  /** 完成结算屏大字标题 */
  clearHeading: string;
  /** 完成结算屏印章字 */
  clearStamp: string;
  /** 玄关觉醒文字（逐行揭幕，Persona 觉醒式） */
  awaken: string[];
  /** 玄关进入按钮文案 */
  enterLabel: string;
  /** 玄关主标题（大字） */
  heroTitle: string;
  /** 玄关副标语 */
  heroSub: string;
  /** 终端正文房间标题（页头） */
  roomTitle: string;
  /** Velvet 在场接引语（正文顶部，引导用户） */
  velvet: string;
  /** 结果页鼓励语（随机取一条） */
  encourage: string[];
  /** 离线拆解模板（按 title 套用，随机取一条） */
  stepTemplates: Array<(title: string) => string>;
}

const BOARD: TerminalSkin = {
  channel: 'board',
  label: '学园深夜BBS',
  tagline: '心灵深处，城市的里侧',
  decideHero: '替我决定',
  decideSelf: '我自己选',
  decideHint: '今天不必想清楚全部。挑一件，先迈出一步就好。',
  emptyPool: '还没有可挑的。先许个愿望、记条待办吧。',
  pickTitle: '选一件此刻困扰你的事',
  decomposing: '没那么复杂…',
  stepLead: '你只需要——',
  accept: '去完成 · 给自己 24 小时',
  again: '换一件',
  redo: '再拆一次',
  clearHeading: '你回来了',
  clearStamp: 'BACK',
  awaken: ['影时间之外', '混沌中彷徨的心', '你不是一个人。'],
  enterLabel: '进来坐',
  heroTitle: '深夜讨论板 · 在线',
  heroSub: '停滞的时针将再度转动',
  roomTitle: '深夜留言板',
  velvet: '「自夜间苏醒的人，在此叩问自己的使命。」',
  encourage: ['我们同在命运洪流之中。', '不积跬步无以至千里。', '不要急于追求完美，先做一点就好。'],
  stepTemplates: [
    (t) => `为「${t}」找到一个能动手的位置，停在那里就算开始。`,
    (t) => `给「${t}」写下一个下一句，半行也可以。`,
    (t) => `为「${t}」准备第一件材料，准备好就收手。`,
  ],
};

const TV: TerminalSkin = {
  channel: 'tv',
  label: '深夜TV特别节目！',
  tagline: '欢迎回来，我们的大明星',
  decideHero: '交给转盘！',
  decideSelf: '我自己选',
  decideHint: '风靡小镇的热门节目，找回你的心！',
  emptyPool: '节目单还空着。先许个愿望、或记条待办吧',
  pickTitle: '今天想挑战哪一关？',
  decomposing: '节目组正在准备脚本…',
  stepLead: '本期行动——',
  accept: '就做这件 · 给自己 24 小时',
  again: '换一关',
  redo: '重剪一次',
  clearHeading: '通关！',
  clearStamp: 'CLEAR',
  awaken: ['今晚这档节目，', '来源于你的勇气。', '一起前进吧。'],
  enterLabel: '进入演播厅',
  heroTitle: '本期节目 · 录制中',
  heroSub: '从待机中唤醒你的今天',
  roomTitle: '深夜TV特别篇',
  velvet: '「欢迎回到节目现场。」',
  encourage: ['我们同在命运洪流之中。', '追求真实的路途会很漫长。', '不要急于追求完美，先做一点就好。'],
  stepTemplates: [
    (t) => `把「${t}」剪成一个开头，停在马上能动手的位置。`,
    (t) => `为「${t}」写下一句起始句，写完就算这一幕。`,
    (t) => `把「${t}」需要的第一样东西放到手边。`,
  ],
};

const THIEF: TerminalSkin = {
  channel: 'thief',
  label: '怪盗 channel',
  tagline: '夺回你的今天',
  decideHero: '锁定目标',
  decideSelf: '亲自挑选',
  decideHint: '不用全想清楚，先锁定一件「心之宝物」。',
  emptyPool: '还没有可挑的。先许个愿望、或记条待办吧。',
  pickTitle: '挑一件此刻困扰的事',
  decomposing: '正在制定潜入路线…',
  stepLead: '潜入第一步——',
  accept: '接受 · 发出预告状（24h）',
  again: '换个目标',
  redo: '重定路线',
  clearHeading: '夺回成功',
  clearStamp: 'TAKEN',
  awaken: ['反抗命运的枷锁吧'],
  enterLabel: '潜入',
  heroTitle: '开始潜入行动',
  heroSub: '夺回失控的心',
  roomTitle: '作战室',
  velvet: '「又见面了。这次打算先做什么？」',
  encourage: ['Take your heart——先拿下第一步。', '怪盗的字典里没有「做不到」。', '反抗命运的枷锁吧'],
  stepTemplates: [
    (t) => `锁定「${t}」的入口，停在可以下手的位置。`,
    (t) => `不必做完。为「${t}」写下第一行字，五分钟就好。`,
    (t) => `先把「${t}」要用的第一样东西拿到手边。`,
  ],
};

/** 主题 → 频道：黄=TV / 红=怪盗 / 其余(蓝·粉·自定义)=讨论板（自适配明暗的兜底） */
export const terminalChannel = (theme?: ThemeType): TerminalChannel =>
  theme === 'yellow' ? 'tv' : theme === 'red' ? 'thief' : 'board';

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

const ACTION_TITLE_RE = /^(做|写|读|看|查|改|整理|发送|联系|打开|关闭|完成|提交|练习|复习|背|跑|走|呼吸|喝|洗|收拾|准备|确认|列|选择|选|预约|回复|发|听|画|剪|拍|录|算|检查|标记|归档|安装|下载|上传|打印|打包|清理|删除|移动|复制)/;
const DIRECT_ACTION_HINT_RE = /(呼吸|冥想|拉伸|喝水|关灯|洗澡|睡觉|散步|站起来|坐下|休息)/;

/** 离线兜底：把一件事套用频道模板，拆成「最小第一步」。idx 缺省随机。 */
export const minimalStep = (skin: TerminalSkin, title: string, idx?: number): string => {
  const cleanTitle = title.trim();
  if (ACTION_TITLE_RE.test(cleanTitle) || DIRECT_ACTION_HINT_RE.test(cleanTitle)) {
    return `现在只执行「${cleanTitle}」的前 2 分钟。做到能停，也算完成。`;
  }
  const tpls = skin.stepTemplates;
  const i = idx === undefined ? Math.floor(Math.random() * tpls.length) : ((idx % tpls.length) + tpls.length) % tpls.length;
  return tpls[i](cleanTitle);
};

/** 随机取一条鼓励语 */
export const pickEncourage = (skin: TerminalSkin): string =>
  skin.encourage[Math.floor(Math.random() * skin.encourage.length)];
