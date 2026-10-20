/**
 * 新版（宫格）设置页按版本逐步开放（第 30 批 b · 10-20 用户：教程视频还是竖版的）：
 * 这一版默认用竖排的旧设置页，用户在「使用新版设置」里自己打开才换成宫格，选择记在 settings.newSettingsUi（随设置同步）。
 * 以后要默认开放，只改 NEW_SETTINGS_UI_DEFAULT——明确关过（false）的人不受影响。
 */
import type { Settings } from '@/types';

export const NEW_SETTINGS_UI_DEFAULT = false;

export const usesNewSettingsUi = (s: Pick<Settings, 'newSettingsUi'>): boolean => s.newSettingsUi ?? NEW_SETTINGS_UI_DEFAULT;
