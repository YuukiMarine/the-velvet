/** 外观与声音：主题色（+ 自定义色 / 音效方案 / 塔罗卡面）· 静音 / 音量 / 响应系统静音 · 夜间 · 背景音乐 · 「使用新版设置」开关 */
import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, applyCustomThemeColor } from '@/store';
import { triggerThemeSwitchFeedback } from '@/utils/feedback';
import type { ThemeType } from '@/types';
import { SoundVolumeRow } from '@/components/SoundVolumeRow';
import { BgmSettings } from '@/components/BgmSettings';
import { usesNewSettingsUi } from '@/utils/settingsUi';
import { Card, Row, Divider, Toggle, Segmented, Input, useSettingsSkin, skinTokens } from '../kit';
import { ThemeColorButton } from '../pickers';

export const AppearanceSection = () => {
  const { user, settings, updateSettings, setTheme } = useAppStore(useShallow(s => ({ user: s.user, settings: s.settings, updateSettings: s.updateSettings, setTheme: s.setTheme })));
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const p5 = skin === 'p5';
  const themes: { value: ThemeType; label: string; color: string }[] = [
    { value: 'blue', label: '蓝色', color: '#3B82F6' },
    { value: 'yellow', label: '黄色', color: '#F59E0B' },
    { value: 'red', label: '红色', color: '#EF4444' },
    { value: 'pink', label: '粉色', color: '#EC4899' },
    { value: 'custom', label: '自定义', color: settings.customThemeColor || '#1c1c1c' },
  ];
  const [customColorDraft, setCustomColorDraft] = useState(settings.customThemeColor || '#1c1c1c');
  const native = Capacitor.isNativePlatform();
  const ios = Capacitor.getPlatform() === 'ios';
  const respectSilent = settings.soundRespectSilent ?? ios;

  return (
    <>
      <Card title="主题色" meta={`当前 ${themes.find(x => x.value === user?.theme)?.label ?? '蓝色'}`} index={0}>
        <div className="flex gap-2" data-setting-row="theme">
          {themes.map(theme => (
            <ThemeColorButton
              key={theme.value}
              theme={theme}
              active={user?.theme === theme.value}
              onSelect={() => {
                triggerThemeSwitchFeedback(theme.value);
                setTheme(theme.value);
                if (theme.value === 'custom') {
                  const color = settings.customThemeColor || customColorDraft;
                  applyCustomThemeColor(color);
                  if (!settings.customThemeColor) updateSettings({ customThemeColor: color });
                }
              }}
            />
          ))}
        </div>
        {user?.theme === 'custom' && (
          <div className="mt-4 space-y-4">
            <Row id="customThemeColor" label="自定义颜色" desc="输入 HEX 色值或用色盘选">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={customColorDraft}
                  aria-label="色盘"
                  onChange={e => { setCustomColorDraft(e.target.value); applyCustomThemeColor(e.target.value); }}
                  onBlur={() => updateSettings({ customThemeColor: customColorDraft })}
                  className="h-11 w-11 shrink-0 cursor-pointer appearance-none rounded-xl border-2 border-gray-200 bg-transparent dark:border-gray-600 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                />
                <Input
                  type="text"
                  value={customColorDraft}
                  aria-label="HEX 色值"
                  onChange={e => { const v = e.target.value; setCustomColorDraft(v); if (/^#[0-9a-fA-F]{6}$/.test(v)) applyCustomThemeColor(v); }}
                  onBlur={() => { if (/^#[0-9a-fA-F]{6}$/.test(customColorDraft)) updateSettings({ customThemeColor: customColorDraft }); }}
                  placeholder="#6366F1"
                  className="font-mono"
                />
              </div>
            </Row>
            <Row id="customSoundScheme" label="音效方案" desc="自定义主题借用哪一套音效">
              <Segmented
                ariaLabel="音效方案"
                value={(settings.customSoundScheme ?? 'blue') as 'blue' | 'yellow' | 'red'}
                options={[{ value: 'blue', label: '清亮', hint: 'P3 风格' }, { value: 'yellow', label: '复古', hint: 'P4 风格' }, { value: 'red', label: '霓虹', hint: 'P5 风格' }]}
                onChange={v => updateSettings({ customSoundScheme: v })}
              />
            </Row>
            <Row id="customTarotSet" label="塔罗卡面" desc="换的是星象页抽到的牌长什么样；小组件上的牌面不跟随，始终是蓝那套">
              <Segmented
                ariaLabel="塔罗卡面"
                value={(settings.customTarotSet ?? 'p3') as 'p3' | 'p4' | 'p5'}
                options={[{ value: 'p3', label: '蓝' }, { value: 'p4', label: '黄' }, { value: 'p5', label: '红' }]}
                onChange={v => updateSettings({ customTarotSet: v })}
              />
            </Row>
          </div>
        )}
      </Card>

      <Card title="声音" index={1}>
        <Row id="soundMuted" glyph="mute" label="静音模式" desc="开启后所有音效静音"
          control={<Toggle checked={!!settings.soundMuted} onChange={(v) => updateSettings({ soundMuted: v })} aria-label="静音模式" />} />
        {!settings.soundMuted && (
          <div className="pb-1 pt-1" data-setting-row="soundVolume">
            <SoundVolumeRow p5={p5} />
          </div>
        )}
        {native && (
          <>
            <Divider />
            <Row
              id="soundRespectSilent"
              glyph="speaker"
              label="响应系统静音模式"
              desc={ios
                ? (respectSilent ? '手机拨到静音时，这里的音效和音乐也不出声' : '静音拨键不影响这里的音效和音乐（和视频类 App 一样）')
                : (respectSilent ? '手机处于静音 / 振动时，这里的音效和音乐也不出声' : '手机静音 / 振动时照常出声（安卓的媒体音量本来就不受静音影响）')}
              control={<Toggle checked={respectSilent} onChange={(v) => updateSettings({ soundRespectSilent: v })} aria-label="响应系统静音模式" />}
            />
          </>
        )}
      </Card>

      {!p5 && (
        <Card title="夜间" index={2}>
          <Row id="darkMode" glyph="moon" label="夜间模式" desc="降低屏幕亮度，保护眼睛"
            control={<Toggle checked={!!settings.darkMode} onChange={(v) => updateSettings({ darkMode: v })} aria-label="夜间模式" />} />
        </Card>
      )}

      <Card index={3}>
        <div data-setting-row="bgm"><BgmSettings p5={p5} /></div>
      </Card>

      <Card index={4}>
        <Row id="newSettingsUi" glyph="legacy" label="使用新版设置" desc="关掉就回到竖排的旧设置页；想再换回来，在那边「主题」最下面打开"
          control={<Toggle checked={usesNewSettingsUi(settings)} onChange={(v) => updateSettings({ newSettingsUi: v })} aria-label="使用新版设置" />} />
        <p className="mt-1 text-[11px] font-semibold" style={{ color: t.sub }}>两版设置改的是同一份数据，只是长相不同。</p>
      </Card>
    </>
  );
};
