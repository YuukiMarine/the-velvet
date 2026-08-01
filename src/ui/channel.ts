/**
 * Channel（频道）系统 —— PERSONA_UI_REWRITE_GUIDE.md §3.1 / §12.2 的工程入口。
 *
 * 「主题色」与「频道」是两层：
 *   - data-theme（既有）：驱动 --color-primary 等强调色，pink/custom 也有效。
 *   - data-ui-channel（本模块）：驱动 --ui-* 频道 token（舞台底色/纸面/描边/裁切/噪点），
 *     只有三大频道有完整视觉语言，其余落 neutral（继承 :root 缺省中性值）。
 *
 * 映射关系（FS2 起）：red→p5 / yellow→p4 / blue·pink→p3 / custom→neutral。
 *   · 粉不是第四个频道，是 **P3 的换色皮**：走同一套 p3 结构，
 *     配色由 :root[data-theme="pink"] 覆盖 --p3r-* / --p3nav-* 变量族实现
 *     （P3 kit 的颜色全是带 fallback 的 CSS 变量，天生就是为换色留的口子）。
 *   · custom 是唯一的 neutral：无频道戏剧化的干净中性皮（斜界也在那边归零）。
 * 挂载时机与 data-theme 完全同步（store 三个写点），不单独持久化。
 */
import type { ThemeType } from '@/types';

export type UIChannel = 'p5' | 'p4' | 'p3' | 'neutral';

export const themeToChannel = (theme: ThemeType | undefined | null): UIChannel => {
  switch (theme) {
    case 'red': return 'p5';
    case 'yellow': return 'p4';
    case 'blue': return 'p3';
    case 'pink': return 'p3';
    default: return 'neutral';
  }
};

/** 与 setAttribute('data-theme', …) 成对调用；neutral 时移除属性走 :root 缺省 */
export const applyUiChannel = (theme: ThemeType | undefined | null): void => {
  const channel = themeToChannel(theme);
  if (channel === 'neutral') {
    document.documentElement.removeAttribute('data-ui-channel');
  } else {
    document.documentElement.setAttribute('data-ui-channel', channel);
  }
};

/** 当前频道（渲染期读取用；响应式场景请观察 html 属性变化或订阅 store 的 user.theme） */
export const currentChannel = (): UIChannel =>
  (document.documentElement.getAttribute('data-ui-channel') as UIChannel | null) ?? 'neutral';

// ── ChannelSkin：频道级语气与文案词典（guide §10.1 / §12.2）──────────────────
// classes 字段待 P7.3 原语组件落地时填充（避免在没有消费者时臆造类名集）。

export interface ChannelSkin {
  id: UIChannel;
  tone: 'rebellion' | 'broadcast' | 'midnight' | 'neutral';
  copy: {
    save: string;
    start: string;
    complete: string;
    delete: string;
    empty: string;
  };
}

export const CHANNEL_SKINS: Record<UIChannel, ChannelSkin> = {
  p5: {
    id: 'p5',
    tone: 'rebellion',
    copy: { save: '收录', start: '出手', complete: '夺回', delete: '撕掉', empty: '还没有目标可锁定' },
  },
  p4: {
    id: 'p4',
    tone: 'broadcast',
    copy: { save: '收进节目单', start: '开播', complete: '通关', delete: '撤下本期', empty: '节目单还空着' },
  },
  p3: {
    id: 'p3',
    tone: 'midnight',
    copy: { save: '记录', start: '接入', complete: '归档', delete: '移除记录', empty: '暂无可追踪的信号' },
  },
  neutral: {
    id: 'neutral',
    tone: 'neutral',
    copy: { save: '保存', start: '开始', complete: '完成', delete: '删除', empty: '这里还是空的' },
  },
};

export const channelSkin = (theme: ThemeType | undefined | null): ChannelSkin =>
  CHANNEL_SKINS[themeToChannel(theme)];
