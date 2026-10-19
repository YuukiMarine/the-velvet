/** 显示与动效：左侧栏布局（iPad）· 背景动画 · 开屏动画 + 速率 · 天气 · 背景图片 */
import { useRef, useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import { playSound } from '@/utils/feedback';
import { downscaleDataUrl } from '@/utils/imageCrop';
import { getLayoutModeVersion, setSidebarEnabled, sidebarEnabled, sidebarSettingVisible, subscribeLayoutMode } from '@/ui/layoutMode';
import { WeatherSettings } from '@/components/settings/WeatherSettings';
import { P3R } from '@/components/p3r/kit';
import { P5R, P5Rough, P5Star } from '@/components/p5r/kit';
import { P4Check } from '@/ui/p4Kit';
import { Card, Row, Toggle, Segmented, Select, Btn, useSettingsSkin, skinTokens } from '../kit';
import { SplashStyleButton, SPLASH_OPTIONS } from '../pickers';

const ANIM_OPTIONS = [
  { value: 'aurora', label: '极光', desc: '柔和色块漂移' },
  { value: 'particles', label: '粒子', desc: '浮尘缓慢上升' },
  { value: 'wave', label: '渐变波', desc: '流动色彩背景' },
  { value: 'pulse', label: '脉冲', desc: '网格线呼吸' },
];

/** 多选块（背景动画）：按频道给形 */
const OptionBlock = ({ on, label, hint, onToggle, seed }: { on: boolean; label: string; hint: string; onToggle: () => void; seed: number }) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  if (skin === 'p3') {
    return (
      <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={onToggle} aria-pressed={on} title={hint} className="relative flex flex-col items-center gap-1.5">
        <span className="relative h-12 w-full overflow-hidden" style={{ clipPath: 'polygon(11px 0, 100% 0, calc(100% - 11px) 100%, 0 100%)', background: on ? P3R.blue : t.chip, boxShadow: on ? '0 8px 18px rgba(27,87,255,0.22)' : 'none' }}>
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `repeating-linear-gradient(115deg, transparent 0 12px, ${on ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.55)'} 12px 15px)` }} />
        </span>
        <span className="whitespace-nowrap text-[11px] font-black leading-tight" style={{ color: on ? P3R.blue : t.ink }}>{label}</span>
      </motion.button>
    );
  }
  if (skin === 'p5') {
    return (
      <motion.button type="button" whileTap={{ x: 2, y: 3 }} onClick={onToggle} aria-pressed={on} title={hint} className="relative px-2 py-2.5 text-[12px] font-black" style={{ color: on ? P5R.white : P5R.ink }}>
        <P5Rough seed={seed} jag={4} frame={2.5} face={on ? P5R.red : P5R.paper} shadow={{ x: 2.5, y: 3 }} />
        <span className="relative inline-flex items-center gap-1">{label}{on && <P5Star size={11} fill={P5R.white} />}</span>
      </motion.button>
    );
  }
  if (skin === 'p4') {
    return (
      <motion.button type="button" whileTap={{ scale: 0.95, rotate: -1 }} onClick={onToggle} aria-pressed={on} title={hint} className="flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[12px] font-black"
        style={{ background: on ? '#131313' : 'var(--ui-paper, #fff6d0)', color: on ? 'var(--ui-bg, #ffd900)' : 'var(--ui-ink, #131313)', boxShadow: '0 0 0 2px #131313' }}>
        {on && <P4Check size={11} color="var(--ui-bg, #ffd900)" />}{label}
      </motion.button>
    );
  }
  return (
    <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={onToggle} aria-pressed={on} title={hint} className={`rounded-xl border-2 px-2 py-2 text-[12px] font-bold transition-colors ${on ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
      {label}
    </motion.button>
  );
};

export const DisplaySection = () => {
  const { user, settings, updateSettings } = useAppStore(useShallow(s => ({ user: s.user, settings: s.settings, updateSettings: s.updateSettings })));
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  useSyncExternalStore(subscribeLayoutMode, getLayoutModeVersion);
  const sidebarOn = sidebarEnabled();
  const showSidebarSetting = sidebarSettingVisible();
  const opacityDraftRef = useRef(settings.backgroundOpacity ?? 0.3);
  const current = (settings.backgroundAnimation ?? []) as string[];
  let cardIndex = 0;

  return (
    <>
      {showSidebarSetting && (
        <Card title="布局" index={cardIndex++}>
          <Row id="sidebarLayout" glyph="sidebar" label="左侧栏布局" desc={sidebarOn ? '宽屏时导航在左边一列；只影响这台设备' : '改用手机布局（底部导航），平板上按屏幕放大铺满'}
            control={<Toggle checked={sidebarOn} onChange={(v) => setSidebarEnabled(v)} aria-label="左侧栏布局" />} />
        </Card>
      )}

      {!settings.backgroundImage && (
        <Card title="背景动画" meta={user?.theme === 'red' ? '最多开两个' : '最多开两个 · 跟随主题色'} index={cardIndex++}>
          <div className="grid grid-cols-4 gap-2" data-setting-row="backgroundAnimation">
            {ANIM_OPTIONS.map((opt, i) => {
              const on = current.includes(opt.value);
              return (
                <OptionBlock key={opt.value} on={on} label={opt.label} hint={opt.desc} seed={640 + i * 7} onToggle={() => {
                  // 最多两个：已满时再点第三个，挤掉最早开的那个
                  const next = on ? current.filter(v => v !== opt.value) : [...current, opt.value].slice(-2);
                  // 红频道默认不开动画：在红主题下动开关 = 亲手开启，记 opt-in；清空收回
                  updateSettings(user?.theme === 'red' ? { backgroundAnimation: next, p5BgAnimOptIn: next.length > 0 } : { backgroundAnimation: next });
                }} />
              );
            })}
          </div>
        </Card>
      )}

      <Card title="开屏动画" meta="启动时的过场" index={cardIndex++}>
        <div className={skin === 'p3' ? 'grid grid-cols-4 gap-2' : 'grid grid-cols-2 gap-2'} data-setting-row="splashStyle">
          {SPLASH_OPTIONS.map(opt => (
            <SplashStyleButton key={opt.value} opt={opt} active={(settings.splashStyle ?? 'velvet') === opt.value} onSelect={() => { playSound(opt.sound, 0.55); updateSettings({ splashStyle: opt.value }); }} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3" data-setting-row="splashSpeed">
          <span className="shrink-0 text-[13px] font-black" style={{ color: t.ink }}>速率</span>
          <div className="flex-1">
            <Segmented ariaLabel="开屏速率" size="sm" value={(settings.splashSpeed ?? 'normal') as 'fast' | 'normal' | 'slow'}
              options={[{ value: 'fast', label: '快' }, { value: 'normal', label: '正常' }, { value: 'slow', label: '慢' }]}
              onChange={v => updateSettings({ splashSpeed: v })} />
          </div>
        </div>
      </Card>

      <Card index={cardIndex++}>
        <div data-setting-row="weather"><WeatherSettings /></div>
      </Card>

      <Card title="背景图片" index={cardIndex++}>
        <div data-setting-row="backgroundImage" className="space-y-3">
          <input
            type="file"
            accept="image/*"
            aria-label="选择背景图片"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (event) => {
                const raw = event.target?.result as string;
                // 长边缩到 2400px、质量 0.9：3 倍屏也够铺满；原图动辄 5MB，settings 每次读写都得搬它一遍
                void downscaleDataUrl(raw, 2400, 0.9).catch(() => raw).then(img => updateSettings({ backgroundImage: img }));
              };
              reader.readAsDataURL(file);
            }}
            className="w-full text-[12px] font-bold file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-[12px] file:font-black"
            style={{ color: t.sub }}
          />
          {settings.backgroundImage && (
            <>
              <div className="relative h-32 overflow-hidden rounded-xl" style={{ background: t.chip }}>
                <img src={settings.backgroundImage} alt="背景预览" className="h-full w-full object-cover" />
              </div>
              <Row id="backgroundOpacity" label="透明度" desc={`${Math.round((settings.backgroundOpacity ?? 0.3) * 100)}%`}>
                <input type="range" min="0" max="1" step="0.05" value={settings.backgroundOpacity ?? 0.3} aria-label="背景透明度"
                  onChange={(e) => { const next = parseFloat(e.target.value); opacityDraftRef.current = next; updateSettings({ backgroundOpacity: next }); }}
                  onPointerUp={() => updateSettings({ backgroundOpacity: opacityDraftRef.current })}
                  onPointerCancel={() => updateSettings({ backgroundOpacity: opacityDraftRef.current })}
                  className="w-full accent-primary" />
              </Row>
              <div className="flex items-center gap-2">
                <Select value={settings.backgroundOrientation || 'landscape'} aria-label="背景方向" onChange={(e) => updateSettings({ backgroundOrientation: e.target.value as 'landscape' | 'portrait' })} className="flex-1">
                  <option value="landscape">横屏模式</option>
                  <option value="portrait">竖屏模式</option>
                </Select>
                <Btn tone="danger" small onClick={() => updateSettings({ backgroundImage: undefined })}>移除</Btn>
              </div>
            </>
          )}
        </div>
      </Card>
    </>
  );
};
