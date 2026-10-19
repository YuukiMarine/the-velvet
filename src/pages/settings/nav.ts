/** 设置页内部导航（宫格 ⇄ 子页）：子页里的「前往 AI 服务」之类走这里 */
import { createContext, useContext } from 'react';

export type SettingsSectionId = 'appearance' | 'display' | 'ai' | 'summary' | 'assistant' | 'notifications' | 'growth' | 'play';

export interface SettingsNav {
  /** 打开某个分区；aiJump = 顺手把 AI 服务的连接卡展开；row = 滚到并闪一下某行 */
  open: (id: SettingsSectionId, opts?: { aiJump?: boolean; row?: string }) => void;
  /** 当前是否带着「展开连接卡」的意图进 AI 服务 */
  aiJump: boolean;
}

export const SettingsNavContext = createContext<SettingsNav>({ open: () => {}, aiJump: false });
export const useSettingsNav = (): SettingsNav => useContext(SettingsNavContext);
