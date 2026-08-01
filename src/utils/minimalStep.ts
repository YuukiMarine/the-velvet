/**
 * minimalStep — 离线「最小第一步」模板（AI 拆解不可用时的兜底）。
 *
 * 原 F3 终端 terminalSkin 的离线拆步器；终端退役（TASKS_MERGE_PRD 批5）后瘦身迁此，
 * 供「帮我拆」（任务表单 / 黑猫递刀）无 Key / 网络失败时落一条能开始的小步。
 * 模板按主题频道换语气：红=怪盗 / 黄=综艺 / 其余=讨论板。
 */
import type { ThemeType } from '@/types';

const ACTION_TITLE_RE = /^(做|写|读|看|查|改|整理|发送|联系|打开|关闭|完成|提交|练习|复习|背|跑|走|呼吸|喝|洗|收拾|准备|确认|列|选择|选|预约|回复|发|听|画|剪|拍|录|算|检查|标记|归档|安装|下载|上传|打印|打包|清理|删除|移动|复制)/;
const DIRECT_ACTION_HINT_RE = /(呼吸|冥想|拉伸|喝水|关灯|洗澡|睡觉|散步|站起来|坐下|休息)/;

const TEMPLATES: Record<'thief' | 'tv' | 'board', Array<(t: string) => string>> = {
  thief: [
    (t) => `锁定「${t}」的入口，停在可以下手的位置。`,
    (t) => `不必做完。为「${t}」写下第一行字，五分钟就好。`,
    (t) => `先把「${t}」要用的第一样东西拿到手边。`,
  ],
  tv: [
    (t) => `把「${t}」剪成一个开头，停在马上能动手的位置。`,
    (t) => `为「${t}」写下一句起始句，写完就算这一幕。`,
    (t) => `把「${t}」需要的第一样东西放到手边。`,
  ],
  board: [
    (t) => `把「${t}」拆到只剩一个开头，现在只做这个开头。`,
    (t) => `为「${t}」列出第一件要碰的东西，把它拿出来。`,
    (t) => `给「${t}」定一个五分钟的起点，时间到了就算数。`,
  ],
};

const channelOf = (theme?: ThemeType): 'thief' | 'tv' | 'board' =>
  theme === 'red' ? 'thief' : theme === 'yellow' ? 'tv' : 'board';

/** 把一件事套用频道模板，拆成「最小第一步」。idx 缺省随机。 */
export const minimalStep = (theme: ThemeType | undefined, title: string, idx?: number): string => {
  const cleanTitle = title.trim();
  if (ACTION_TITLE_RE.test(cleanTitle) || DIRECT_ACTION_HINT_RE.test(cleanTitle)) {
    return `现在只执行「${cleanTitle}」的前 2 分钟。做到能停，也算完成。`;
  }
  const tpls = TEMPLATES[channelOf(theme)];
  const i = idx === undefined ? Math.floor(Math.random() * tpls.length) : ((idx % tpls.length) + tpls.length) % tpls.length;
  return tpls[i](cleanTitle);
};
