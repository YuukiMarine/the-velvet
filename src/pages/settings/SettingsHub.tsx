/**
 * 设置页（第 30 批）· 两级：总览宫格（8 块 + 搜索 + 账号入口）⇄ 分区子页。
 * 三频道皮在 kit.tsx；旧版竖排手风琴在 pages/Settings.tsx（settings.legacySettings 开着走它）。
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { resolveLevelDifficulty } from '@/utils/levelDifficulty';
import { BUILTIN_NAVIGATOR_PRESETS } from '@/constants/navigatorPresets';
import { P3RPage, P3R, slantClip } from '@/components/p3r/kit';
import { P5RPage, P5R, P5_TITLE_FONT, P5Rough, P5Star } from '@/components/p5r/kit';
import { P4Flower } from '@/ui/p4Kit';
import { Card, Glyph, HubHeader, HubTile, SearchBox, SettingsFlashContext, SubHero, useRowFlash, useSettingsSkin, skinTokens, type SearchHit, type SectionMeta } from './kit';
import { SettingsNavContext, type SettingsSectionId } from './nav';
import { AppearanceSection } from './sections/AppearanceSection';
import { DisplaySection } from './sections/DisplaySection';
import { GrowthSection } from './sections/GrowthSection';
import { PlaySection } from './sections/PlaySection';
import { SummarySection } from './sections/SummarySection';
import { AIServiceSection, AssistantSection, NotificationsSection } from './sections/wrapped';

export const SECTIONS: Array<SectionMeta & { id: SettingsSectionId }> = [
  { id: 'appearance', title: '外观与声音', en: 'LOOK & SOUND', glyph: 'palette', desc: '主题色、夜间、音效与音乐' },
  { id: 'display', title: '显示与动效', en: 'DISPLAY & MOTION', glyph: 'display', desc: '背景动画、开屏、天气与背景图' },
  { id: 'ai', title: 'AI 服务', en: 'AI SERVICE', glyph: 'key', desc: '连接、服务商、模型分档' },
  { id: 'summary', title: 'AI 总结', en: 'AI SUMMARY', glyph: 'spark', desc: '沟通风格、预设、自动撰写' },
  { id: 'assistant', title: '助手', en: 'NAVIGATOR', glyph: 'mask', desc: '人格、记忆、主动与实验' },
  { id: 'notifications', title: '通知提醒', en: 'NOTICE', glyph: 'bell', desc: '每日提醒、主动找你、写完提醒' },
  { id: 'growth', title: '属性与成长', en: 'GROWTH', glyph: 'growth', desc: '属性名称、等级需求、逆流' },
  { id: 'play', title: '玩法扩展', en: 'EXTRAS', glyph: 'play', desc: '记账、委托 AI 卡、关键词、战场' },
];

/** 搜索索引：行 id 优先（新页的行都带 data-setting-row），独立组件的行用它的 aria-label 当 id */
const SEARCH_INDEX: Array<{ sectionId: SettingsSectionId; rowId?: string; label: string; keys: string }> = [
  { sectionId: 'appearance', rowId: 'theme', label: '主题色', keys: '颜色 蓝 黄 红 粉 自定义 theme color' },
  { sectionId: 'appearance', rowId: 'customSoundScheme', label: '音效方案', keys: '自定义 音效 清亮 复古 霓虹' },
  { sectionId: 'appearance', rowId: 'customTarotSet', label: '塔罗卡面', keys: '自定义 牌 卡面' },
  { sectionId: 'appearance', rowId: 'soundMuted', label: '静音模式', keys: '静音 音效 mute' },
  { sectionId: 'appearance', rowId: 'soundVolume', label: '音量', keys: '音量 大小 volume' },
  { sectionId: 'appearance', rowId: 'soundRespectSilent', label: '响应系统静音模式', keys: '静音 拨键 振动 系统' },
  { sectionId: 'appearance', rowId: 'darkMode', label: '夜间模式', keys: '夜间 暗色 深色 dark' },
  { sectionId: 'appearance', rowId: 'bgm', label: '背景音乐', keys: '音乐 bgm 导入 播放' },
  { sectionId: 'appearance', rowId: 'legacySettings', label: '使用旧版设置', keys: '旧版 竖版 手风琴 设置页' },
  { sectionId: 'display', rowId: 'sidebarLayout', label: '左侧栏布局', keys: 'iPad 平板 侧栏 布局' },
  { sectionId: 'display', rowId: 'backgroundAnimation', label: '背景动画', keys: '极光 粒子 渐变波 脉冲 动画' },
  { sectionId: 'display', rowId: 'splashStyle', label: '开屏动画', keys: '开屏 启动 过场 splash' },
  { sectionId: 'display', rowId: 'splashSpeed', label: '开屏速率', keys: '快 慢 速率' },
  { sectionId: 'display', rowId: 'weather', label: '天气', keys: '天气 和风 城市 月相' },
  { sectionId: 'display', rowId: 'backgroundImage', label: '背景图片', keys: '背景 图片 壁纸 透明度' },
  { sectionId: 'ai', rowId: 'aiService', label: 'AI 服务 · 连接', keys: 'key api 密钥 服务商 deepseek openai kimi 模型 自定义' },
  { sectionId: 'ai', rowId: '自定义 API 地址', label: '自定义 API 地址', keys: '中转 base url 地址' },
  { sectionId: 'ai', rowId: '每日塔罗改走深思熟虑', label: '每日塔罗改走深思熟虑', keys: '塔罗 模型 思考' },
  { sectionId: 'ai', rowId: '成长总结改走深思熟虑', label: '成长总结改走深思熟虑', keys: '总结 模型 思考' },
  { sectionId: 'summary', rowId: 'summaryFamiliar', label: '沟通风格 · 熟悉的人', keys: '蓝蝶 青侍 典藏 双子 风格' },
  { sectionId: 'summary', rowId: 'summaryPresets', label: '总结预设', keys: '预设 prompt 自定义 风格' },
  { sectionId: 'summary', rowId: 'summaryAutoWrite', label: '自动撰写上一期总结', keys: '自动 总结 周 月' },
  { sectionId: 'assistant', rowId: 'navigator', label: '助手 · 人格', keys: '人格 黑猫 助手 navigator' },
  { sectionId: 'assistant', rowId: '拟真增强', label: '拟真增强', keys: '拟真 沉浸' },
  { sectionId: 'assistant', rowId: '主动找你', label: '主动找你', keys: '主动 推送' },
  { sectionId: 'assistant', rowId: '记忆按人格隔离', label: '记忆按人格隔离', keys: '记忆 隔离 人格' },
  { sectionId: 'assistant', rowId: '让助手了解你的记录', label: '让助手了解你的记录', keys: '记录 近况 了解' },
  { sectionId: 'assistant', rowId: '实验：原生工具调用', label: '实验：原生工具调用', keys: '工具 tools 实验' },
  { sectionId: 'notifications', rowId: '每日提醒总开关', label: '每日提醒', keys: '提醒 通知 时段 每日' },
  { sectionId: 'notifications', rowId: '让助手来写提醒文案', label: '让助手来写提醒文案', keys: '提醒 文案 助手' },
  { sectionId: 'notifications', rowId: '助手会主动找你', label: '助手会主动找你', keys: '主动 推送 通知' },
  { sectionId: 'notifications', rowId: 'AI 写完了提醒你', label: 'AI 写完了提醒你', keys: '写完 后台 提醒' },
  { sectionId: 'notifications', rowId: '保存带截止日的任务后自动加到日历', label: '自动加到日历', keys: '日历 截止 任务 自动' },
  { sectionId: 'growth', rowId: 'countercurrentEnabled', label: '逆流', keys: '逆流 衰减 预警' },
  { sectionId: 'growth', rowId: 'attributeNames', label: '属性名称', keys: '属性 名字 知识 胆量 灵巧 温柔 魅力' },
  { sectionId: 'growth', rowId: 'aiPresetNames', label: 'AI 匹配成就 / 技能名称', keys: '成就 技能 名称 匹配' },
  { sectionId: 'growth', rowId: 'levelDifficulty', label: '难度档', keys: '简单 困难 难度' },
  { sectionId: 'growth', rowId: 'levelThresholds', label: '等级需求', keys: '等级 阈值 点数 升级' },
  { sectionId: 'growth', rowId: 'levelTitles', label: '等级称号', keys: '称号 四字 等级' },
  { sectionId: 'play', rowId: 'ledgerEnabled', label: '记账', keys: '记账 货币 预算 发薪日 消费' },
  { sectionId: 'play', rowId: 'lifeQuestAiCard', label: '今日委托多一张 AI 写的', keys: '委托 AI 卡 委托板' },
  { sectionId: 'play', rowId: 'keywordRules', label: '关键词规则', keys: '关键词 加分 规则' },
  { sectionId: 'play', rowId: 'battleEnabled', label: '逆影战场', keys: '战场 战斗 persona 开启' },
];

/** 页面滚动容器是 #root（App 换页时也是复位它），不是 window */
const scrollRootTop = (smooth: boolean) => {
  const root = document.getElementById('root');
  if (root) root.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
};

const PROVIDER_LABEL: Record<string, string> = { openai: 'OpenAI', deepseek: 'DeepSeek', kimi: 'Kimi', qwen: '通义', gemini: 'Gemini', minimax: 'MiniMax', custom: '自定义' };
const THEME_LABEL: Record<string, string> = { blue: '蓝', yellow: '黄', red: '红', pink: '粉', custom: '自定义' };
const SPLASH_LABEL: Record<string, string> = { velvet: '靛蓝色房间', p5: '红黑剪报', p3: '深夜月光', p4: '黄色警戒线' };

/** 宫格每块下面那一行「当前状态」 */
const useSummaries = (): Record<SettingsSectionId, { text: string; status?: 'ok' | 'warn' | 'off' }> => {
  const { user, settings } = useAppStore(useShallow(s => ({ user: s.user, settings: s.settings })));
  return useMemo(() => {
    const theme = THEME_LABEL[user?.theme ?? 'blue'] ?? '蓝';
    const sound = settings.soundMuted ? '静音' : `音效 ${settings.soundVolume ?? 80}%`;
    const night = user?.theme === 'red' ? '' : ` · 夜间${settings.darkMode ? '开' : '关'}`;
    const anim = (settings.backgroundAnimation ?? []).length;
    const providerKey = settings.summaryApiProvider ?? 'deepseek';
    const provider = providerKey === 'custom' ? (settings.customProviderName?.trim() || '自定义') : (PROVIDER_LABEL[providerKey] ?? providerKey);
    const hasKey = !!settings.summaryApiKey?.trim();
    const preset = BUILTIN_NAVIGATOR_PRESETS.find(p => p.id === (settings.navigatorPresetId ?? BUILTIN_NAVIGATOR_PRESETS[0]?.id));
    const presetName = preset?.name ?? '自定义人格';
    const slots = settings.notificationSlots?.length ?? 0;
    const notifOn = !!settings.notificationsEnabled;
    const difficulty = resolveLevelDifficulty(settings) === 'hard' ? '困难' : '简单';
    const keywordTotal = settings.keywordRules.reduce((n, r) => n + r.keywords.length, 0);
    return {
      appearance: { text: `${theme}${night} · ${sound}${settings.bgmEnabled ? ' · BGM 开' : ''}` },
      display: { text: `背景动画 ${settings.backgroundImage ? '背景图' : anim ? `开 ${anim}` : '关'} · 开屏 ${SPLASH_LABEL[settings.splashStyle ?? 'velvet'] ?? '靛蓝色房间'}` },
      ai: { text: hasKey ? `${provider} · 已配置${settings.summaryModel ? ` · ${settings.summaryModel}` : ''}` : `${provider} · 还没填 Key`, status: hasKey ? 'ok' : 'off' },
      summary: { text: `${settings.summaryActivePresetId ? '已选风格' : '伊戈尔'} · 自动撰写${settings.summaryAutoWrite === false ? '关' : '开'}` },
      assistant: { text: `${presetName} · ${settings.navigatorMemoryIsolated ? '记忆按人格' : '记忆共享'} · 主动找你${settings.navigatorPushEnabled ? '开' : '关'}` },
      notifications: { text: notifOn ? `每日 ${slots} 个时段 · 写完提醒${settings.aiJobDoneNotify === false ? '关' : '开'}` : '每日提醒关', status: notifOn ? 'ok' : 'off' },
      growth: { text: `${settings.levelThresholds.length} 级 · ${difficulty}档 · 逆流${settings.countercurrentEnabled ? '开' : '关'}` },
      play: { text: `记账${settings.ledgerEnabled !== false ? '开' : '关'} · 委托 AI 卡${settings.lifeQuestAiCard ? '开' : '关'} · 关键词 ${keywordTotal} 词` },
    };
  }, [user?.theme, settings]);
};

const AccountEntry = ({ onClick }: { onClick: () => void }) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  const enter = { initial: anim ? { opacity: 0, y: 14 } : (false as const), animate: { opacity: 1, y: 0 }, transition: { type: 'spring' as const, stiffness: 360, damping: 30, delay: anim ? 0.42 : 0 } };
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-black" style={{ color: t.ink, fontFamily: skin === 'p5' ? P5_TITLE_FONT : skin === 'p4' ? 'var(--p4-display-font, serif)' : undefined }}>账号与数据</span>
        <span className="mt-0.5 block text-[12px] font-semibold" style={{ color: t.sub, opacity: skin === 'p4' ? 0.68 : 1 }}>云同步 · 数据管理 · 备份导出</span>
      </span>
    </>
  );
  if (skin === 'p5') {
    return (
      <motion.button type="button" {...enter} whileTap={{ x: 3, y: 4 }} onClick={onClick} className="relative block w-full text-left" data-settings-tile="account">
        <P5Rough seed={521} jag={7} frame={3} face={P5R.paper} shadow={{ x: 4, y: 5 }} />
        <span className="relative flex items-center gap-3.5 px-4 py-3.5">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center" style={{ background: P5R.red, border: `2.5px solid ${P5R.ink}`, transform: 'rotate(-3deg)', boxShadow: `2px 2px 0 ${P5R.ink}` }}><P5Star size={22} fill={P5R.white} /></span>
          {body}
          <span aria-hidden className="h-0 w-0 border-y-[8px] border-y-transparent border-l-[12px]" style={{ borderLeftColor: P5R.ink }} />
        </span>
      </motion.button>
    );
  }
  if (skin === 'p4') {
    return (
      <motion.button type="button" {...enter} whileTap={{ scale: 0.98 }} onClick={onClick} className="relative flex w-full items-center gap-3 px-4 py-3.5 text-left" data-settings-tile="account"
        style={{ background: t.panel, borderRadius: 18, boxShadow: '0 0 0 2.5px #131313, 0 6px 0 rgba(19,19,19,0.2)' }}>
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: '#131313', color: 'var(--ui-bg, #ffd900)' }}><Glyph name="cloud" size={22} /></span>
        {body}
        <P4Flower size={16} color="var(--p4-orange, #f9a11b)" />
      </motion.button>
    );
  }
  if (skin === 'p3') {
    return (
      <motion.button type="button" {...enter} whileTap={{ scale: 0.98 }} onClick={onClick} className="relative flex w-full items-center gap-3 px-5 py-4 text-left" data-settings-tile="account"
        style={{ clipPath: slantClip(14), background: t.panel, boxShadow: '0 8px 18px rgba(38,96,140,0.07)' }}>
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center text-white" style={{ background: P3R.blue, clipPath: slantClip(6) }}><Glyph name="cloud" size={22} /></span>
        {body}
        <span aria-hidden className="h-0 w-0 border-y-[6px] border-y-transparent border-l-[9px]" style={{ borderLeftColor: P3R.blue }} />
      </motion.button>
    );
  }
  return (
    <motion.button type="button" {...enter} whileTap={{ scale: 0.98 }} onClick={onClick} className="relative flex w-full items-center gap-3 rounded-[18px] bg-white px-5 py-4 text-left shadow-[0_10px_24px_rgba(27,87,255,0.08)] dark:bg-gray-800" data-settings-tile="account">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Glyph name="cloud" size={22} /></span>
      {body}
      <span className="text-gray-400" aria-hidden>›</span>
    </motion.button>
  );
};

export const SettingsHub = () => {
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const [active, setActive] = useState<SettingsSectionId | null>(null);
  const [aiJump, setAiJump] = useState(false);
  const [query, setQuery] = useState('');
  const { flashId, flashRow } = useRowFlash();
  const summaries = useSummaries();

  const open = (id: SettingsSectionId, opts?: { aiJump?: boolean; row?: string }) => {
    setAiJump(!!opts?.aiJump);
    setActive(id);
    setQuery('');
    if (opts?.row) flashRow(opts.row);
    scrollRootTop(anim);
  };
  const back = () => { setActive(null); setAiJump(false); scrollRootTop(false); };

  const hits: SearchHit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const titleOf = (id: SettingsSectionId) => SECTIONS.find(s => s.id === id)?.title ?? '';
    const out: SearchHit[] = [];
    for (const s of SECTIONS) {
      if (s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)) out.push({ sectionId: s.id, label: s.title, sectionTitle: '分区' });
    }
    for (const e of SEARCH_INDEX) {
      if (e.label.toLowerCase().includes(q) || e.keys.toLowerCase().includes(q)) out.push({ sectionId: e.sectionId, rowId: e.rowId, label: e.label, sectionTitle: titleOf(e.sectionId) });
    }
    return out.slice(0, 12);
  }, [query]);

  const meta = active ? SECTIONS.find(s => s.id === active)! : null;
  const body = active === 'appearance' ? <AppearanceSection />
    : active === 'display' ? <DisplaySection />
      : active === 'ai' ? <AIServiceSection />
        : active === 'summary' ? <SummarySection />
          : active === 'assistant' ? <AssistantSection />
            : active === 'notifications' ? <NotificationsSection />
              : active === 'growth' ? <GrowthSection />
                : active === 'play' ? <PlaySection />
                  : null;

  const slide = { type: 'spring' as const, stiffness: 380, damping: 36 };
  return (
    <SettingsNavContext.Provider value={{ open, aiJump }}>
      <SettingsFlashContext.Provider value={flashId}>
        <P3RPage active={skin === 'p3'}>
          <P5RPage active={skin === 'p5'}>
            <div className={`relative ${skin === 'p4' ? 'p4-reskin' : ''} ${skin === 'p5' ? 'p5-reskin' : ''}`} data-settings-hub={active ?? 'hub'}>
              <AnimatePresence mode="popLayout" initial={false}>
                {active === null ? (
                  <motion.div key="hub" className="space-y-5" initial={anim ? { opacity: 0, x: -28 } : false} animate={{ opacity: 1, x: 0 }} exit={anim ? { opacity: 0, x: -28, pointerEvents: 'none' } : { pointerEvents: 'none' }} transition={slide}>
                    <HubHeader onBack={() => setCurrentPage('menu')} />
                    <SearchBox value={query} onChange={setQuery} hits={hits} onPick={(h) => open(h.sectionId as SettingsSectionId, { row: h.rowId })} />
                    <div className="grid grid-cols-2 gap-3">
                      {SECTIONS.map((s, i) => (
                        <HubTile key={s.id} section={s} index={i} summary={summaries[s.id].text} status={summaries[s.id].status} onOpen={() => open(s.id)} />
                      ))}
                    </div>
                    <AccountEntry onClick={() => setCurrentPage('account')} />
                  </motion.div>
                ) : (
                  <motion.div key={active} className="space-y-4" initial={anim ? { opacity: 0, x: 44 } : false} animate={{ opacity: 1, x: 0 }} exit={anim ? { opacity: 0, x: 44, pointerEvents: 'none' } : { pointerEvents: 'none' }} transition={slide}>
                    {meta && <SubHero section={meta} onBack={back} />}
                    {body}
                    {active !== 'appearance' && (
                      <Card index={9}>
                        <p className="text-[11px] font-semibold" style={{ color: skinTokens(skin).sub }}>想回旧版竖排设置：外观与声音 → 最下面「使用旧版设置」。</p>
                      </Card>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </P5RPage>
        </P3RPage>
      </SettingsFlashContext.Provider>
    </SettingsNavContext.Provider>
  );
};
