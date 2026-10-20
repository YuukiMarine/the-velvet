/**
 * 通知提醒（第 30 批 b）：每日提醒（总开关 + 今天的提醒轨道）· 时段（时刻 / 名称 / 内容）· 还会提醒你 · 截止日进日历。
 * 状态与动作和旧版设置页共用 useNotificationSettings；这里只管长相（三频道游戏语言 + 中性）。
 * 每个时段按游戏里的时间段打英文签（MORNING / AFTER SCHOOL / EVENING…，蓝频道 0 点那一小时是 DARK HOUR）。
 * 测试钩子沿用旧版：各开关的 aria-label、「「名称」时间」「时段名称」「删除时段」、data-testid=auto-calendar。
 */
import type { CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { useCalendarCapabilities } from '@/utils/nativeCalendar';
import { CONTENT_META, useNotificationSettings } from '@/components/useNotificationSettings';
import type { NotifContentType, NotifSlot } from '@/types';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, P5Rough } from '@/components/p5r/kit';
import { Card, Row, Divider, Toggle, Btn, Input, Chip, Note, Glyph, useSettingsSkin, skinTokens, type GlyphName, type SettingsSkin } from '../kit';
import { DayTrack, minutesOf } from '../dayTrack';

const CONTENT_GLYPH: Record<NotifContentType, GlyphName> = {
  tarot: 'cards', todos: 'check', countercurrent: 'wave', summary: 'spark', record: 'pen', together: 'link', quests: 'quest', meeting: 'calendar',
};

/** 游戏里的时间段（P3 / P4 / P5 日历上的 Early Morning … Late Night）；蓝频道 0 点那一小时叫 DARK HOUR（影时间） */
export const timeOfDayTag = (hhmm: string, skin: SettingsSkin): string => {
  const min = minutesOf(hhmm);
  const h = Math.floor(min / 60);
  if (h === 0) return skin === 'p3' ? 'DARK HOUR' : 'MIDNIGHT';
  if (min < 5 * 60) return 'LATE NIGHT';
  if (min < 7 * 60) return 'EARLY MORNING';
  if (min < 11 * 60) return 'MORNING';
  if (min < 13 * 60) return 'LUNCHTIME';
  if (min < 16 * 60) return 'AFTERNOON';
  if (min < 18 * 60) return 'AFTER SCHOOL';
  if (min < 22 * 60) return 'EVENING';
  return 'LATE NIGHT';
};

/** 一个提醒时段：左边大时刻块，右边时间段签 + 名称，下面一排内容签 */
const SlotCard = ({ slot, index, onPatch, onToggleContent, onRemove }: {
  slot: NotifSlot;
  index: number;
  onPatch: (patch: Partial<NotifSlot>) => void;
  onToggleContent: (c: NotifContentType) => void;
  onRemove: () => void;
}) => {
  const skin = useSettingsSkin();
  const anim = useBoldness();
  const t = skinTokens(skin);
  const tag = timeOfDayTag(slot.time, skin);
  const off = !slot.enabled;

  // 大时刻块：蓝 = 蓝斜块白字斜体；红 = 红撕边块白字黑体；黄 = 黑贴纸里一枚奶油胶囊（输入件毯式皮）；中性 = 主题色淡底
  const timeBlock: CSSProperties = skin === 'p3'
    ? { background: off ? P3R.grey : P3R.blue, clipPath: slantClip(9) }
    : skin === 'p4'
      ? { background: '#131313', borderRadius: 14 }
      : skin === 'p5'
        ? {}
        : { background: 'rgba(27,87,255,0.1)', borderRadius: 14 };
  const timeText: CSSProperties = {
    fontSize: 26, fontWeight: 900, letterSpacing: '0.01em',
    fontStyle: skin === 'p3' ? 'italic' : undefined,
    color: skin === 'p4' ? 'var(--ui-bg, #ffd900)' : skin === 'neutral' ? 'var(--color-primary, #1b57ff)' : '#fff',
    fontFamily: skin === 'p5' ? P5_TITLE_FONT : skin === 'p4' ? 'var(--p4-display-font, serif)' : undefined,
  };
  const tagEl = skin === 'p4'
    ? <span className="text-[16px] font-bold italic leading-none" style={{ color: 'var(--p4-orange, #f9a11b)', fontFamily: "'Caveat', 'Segoe Script', cursive" }}>{tag.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}</span>
    : skin === 'p5'
      ? <span className="px-1.5 py-[2px] text-[9.5px] font-black leading-none tracking-[0.14em]" style={{ background: P5R.ink, color: P5R.white, fontFamily: P5_TITLE_FONT, clipPath: 'polygon(2px 0, 100% 1px, calc(100% - 2px) 100%, 0 calc(100% - 1px))' }}>{tag}</span>
      : skin === 'p3'
        ? <span className="text-[10px] font-black italic tracking-[0.18em]" style={{ color: P3R.cyan }}>{tag}</span>
        : <span className="text-[10px] font-extrabold tracking-[0.14em]" style={{ color: t.sub }}>{tag}</span>;

  const head = (
    <div className="flex items-center gap-3">
      <label className="relative flex shrink-0 cursor-pointer items-center gap-1.5 px-3.5 py-2" style={timeBlock}>
        {skin === 'p5' && <P5Rough seed={1500 + index * 9} jag={4} frame={2.5} face={off ? P5R.grey : P5R.red} shadow={{ x: 2.5, y: 3 }} />}
        <span className="relative tabular-nums leading-none" style={timeText} data-slot-time>{slot.time}</span>
        <span aria-hidden className="relative opacity-75" style={{ color: timeText.color }}><Glyph name="clock" size={15} /></span>
        <input type="time" value={slot.time} data-plain="1" aria-label={`「${slot.label}」时间`}
          onChange={(e) => { if (e.target.value) onPatch({ time: e.target.value }); }}
          onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* 不支持就让系统自己弹 */ } }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
      <span className="min-w-0 flex-1">
        <span className="block leading-none">{tagEl}</span>
        <Input type="text" value={slot.label} maxLength={12} placeholder="名称" aria-label="时段名称" onChange={(e) => onPatch({ label: e.target.value })} className="mt-1 !py-1 !text-[13px]" />
      </span>
      <span className="flex shrink-0 flex-col items-center gap-1">
        <Toggle checked={slot.enabled} onChange={(v) => onPatch({ enabled: v })} aria-label={`启用「${slot.label}」`} />
        <button type="button" onClick={onRemove} aria-label="删除时段" title="删除时段" className="flex h-7 w-7 items-center justify-center opacity-70 hover:opacity-100" style={{ color: skin === 'p5' ? P5R.ink : t.sub }}>
          <Glyph name="trash" size={16} />
        </button>
      </span>
    </div>
  );
  const chips = (
    <div className="mt-3 flex flex-wrap gap-2" style={{ opacity: off ? 0.5 : 1 }}>
      {CONTENT_META.map((c, i) => (
        <Chip key={c.id} seed={index * 10 + i} on={slot.contents.includes(c.id)} onClick={() => onToggleContent(c.id)} title={c.hint} glyph={CONTENT_GLYPH[c.id]}>{c.label}</Chip>
      ))}
    </div>
  );
  const enter = {
    initial: anim ? { opacity: 0, x: -14 } : (false as const),
    animate: { opacity: 1, x: 0 },
    exit: anim ? { opacity: 0, x: 24, height: 0 } : { opacity: 0 },
    transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
  };

  if (skin === 'p5') {
    return (
      <motion.div {...enter} className="relative px-3.5 pb-3.5 pt-3" data-notif-slot={slot.id} style={{ rotate: index % 2 ? 0.4 : -0.4 }}>
        <P5Rough seed={1400 + index * 13} jag={5} frame={2.5} face={P5R.paper} shadow={{ x: 3, y: 4 }} />
        <div className="relative">{head}{chips}</div>
      </motion.div>
    );
  }
  if (skin === 'p4') {
    return (
      <motion.div {...enter} className="relative px-3.5 pb-3.5 pt-3" data-notif-slot={slot.id} style={{ borderRadius: 16, background: 'var(--ui-paper, #fff6d0)', boxShadow: '0 0 0 2px #131313, 0 4px 0 rgba(19,19,19,0.18)' }}>
        {head}{chips}
      </motion.div>
    );
  }
  if (skin === 'p3') {
    return (
      <motion.div {...enter} className="relative py-3 pl-4 pr-3.5" data-notif-slot={slot.id} style={{ clipPath: slantClip(10), background: 'var(--p3r-chip, #ddeef7)' }}>
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'repeating-linear-gradient(115deg, transparent 0 18px, rgba(53,209,232,0.08) 18px 21px)' }} />
        <div className="relative">{head}{chips}</div>
      </motion.div>
    );
  }
  return (
    <motion.div {...enter} className="relative rounded-2xl px-3.5 pb-3.5 pt-3 ring-1 ring-gray-200 dark:ring-gray-700" data-notif-slot={slot.id}>
      {head}{chips}
    </motion.div>
  );
};

export const NotificationsSection = () => {
  const n = useNotificationSettings();
  const { settings, updateSettings, enabled, slots } = n;
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const calendarCaps = useCalendarCapabilities();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const onCount = slots.filter(s => s.enabled).length;

  return (
    <>
      {/* ── 每日提醒 ── */}
      <Card index={0}>
        <Row id="notificationsEnabled" glyph="bell" label="每日提醒" desc="在你选的时段提醒抽塔罗、没做完的待办、逆流预警等；文案在手机上生成，不经服务器"
          control={<Toggle checked={enabled} onChange={(v) => void n.handleMasterToggle(v)} aria-label="每日提醒总开关" />} />
        {!n.supported && (
          <div className="mt-1.5"><Note>网页版收不到本地通知。可以先在这里配好时段和内容，装上 Android / iOS 客户端后就生效。</Note></div>
        )}
        {n.supported && enabled && n.perm !== 'granted' && (
          <div className="mt-1.5"><Note tone="warn" action={<Btn small tone="danger" onClick={() => void n.requestPermission()}>去授权</Btn>}>通知权限没给，提醒送不到。</Note></div>
        )}
        {enabled && (
          <div className="mt-3" data-setting-row="notifTimeline">
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-black" style={{ color: t.ink, fontFamily: skin === 'p5' ? P5_TITLE_FONT : skin === 'p4' ? 'var(--p4-display-font, serif)' : undefined }}>今天的提醒</span>
              <span className="text-[11px] font-bold" style={{ color: t.sub }}>{onCount ? `${onCount} 个时段开着` : '还没有开着的时段'}</span>
            </div>
            <DayTrack ariaLabel={`今天的提醒：${slots.filter(s => s.enabled).map(s => s.time).join('、') || '没有'}`} now={nowMin}
              marks={slots.map(s => ({ id: s.id, time: s.time, on: s.enabled, label: s.label }))} />
          </div>
        )}
        {!enabled && (
          <p className="mt-1 text-[11.5px] font-semibold" style={{ color: t.sub, opacity: skin === 'p4' ? 0.72 : 1 }}>打开后可以设几个时段，每个时段挑要提醒的内容。</p>
        )}
      </Card>

      {/* ── 时段 ── */}
      {enabled && (
        <Card title="时段" meta={`${slots.length} 个`} index={1}>
          <div className="space-y-3" data-setting-row="notifSlots">
            {slots.length === 0 && <Note>还没有提醒时段，点下面添加一个。</Note>}
            <AnimatePresence initial={false}>
              {slots.map((slot, i) => (
                <SlotCard key={slot.id} slot={slot} index={i}
                  onPatch={(patch) => n.updateSlot(slot.id, patch)}
                  onToggleContent={(c) => n.toggleContent(slot, c)}
                  onRemove={() => n.removeSlot(slot.id)} />
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-3.5 space-y-2.5">
            <Btn tone="soft" className="w-full" onClick={n.addSlot} ariaLabel="添加提醒时段"><span className="inline-flex items-center justify-center gap-1.5"><Glyph name="plus" size={16} />添加提醒时段</span></Btn>
            {n.supported && n.perm === 'granted' && (
              <Btn tone="soft" className="w-full" onClick={() => void n.handleTest()} ariaLabel="发送一条测试通知">
                <span className="inline-flex items-center justify-center gap-1.5"><Glyph name={n.testSent ? 'check' : 'send'} size={16} />{n.testSent ? '已发送，请查看通知栏' : '发送一条测试通知'}</span>
              </Btn>
            )}
          </div>
        </Card>
      )}

      {/* ── 还会提醒你 ── */}
      {enabled && (
        <Card title="还会提醒你" index={2}>
          <Row id="notifAIVoice" glyph="pen" label="让助手来写提醒文案" desc="每天用当前人格的口吻写一套推送文案（走助手档模型，一天一次）；没配 AI 或失败时用内置文案"
            control={<Toggle checked={!!settings.notifAIVoice} onChange={(v) => updateSettings({ notifAIVoice: v })} aria-label="让助手来写提醒文案" />} />
          <Divider />
          <Row id="navigatorPushNotif" glyph="bubble" label="助手会主动找你" desc="每天最多一条：约好的事过后问一句结果、纪念日、好几天没见时说一次想念。夜里 22:30～08:30 不发"
            control={<Toggle checked={settings.navigatorPushEnabled !== false} onChange={(v) => updateSettings({ navigatorPushEnabled: v })} aria-label="助手会主动找你" />} />
          <Divider />
          <Row id="aiJobDoneNotify" glyph="spark" label="AI 写完了提醒你" desc="塔罗解读、成长总结、区层显形在后台写完时，你不在 App 里就提醒一条，每个任务只提醒一次"
            control={<Toggle checked={settings.aiJobDoneNotify !== false} onChange={(v) => updateSettings({ aiJobDoneNotify: v })} aria-label="AI 写完了提醒你" />} />
        </Card>
      )}

      {/* ── 截止日进日历（原生才有）── */}
      {calendarCaps.calendar && (
        <Card title="任务截止" index={3}>
          <div data-testid="auto-calendar">
            <Row id="todoAutoCalendar" glyph="calendar" label="保存带截止日的任务后自动加到日历"
              desc="任务页保存、或助手的任务卡确认后，直接拉起手机日历的新建页（都填好了，你点保存就行）。关着也能在长按菜单里手动加"
              control={<Toggle checked={!!settings.todoAutoCalendar} onChange={(v) => updateSettings({ todoAutoCalendar: v })} aria-label="保存带截止日的任务后自动加到日历" />} />
          </div>
        </Card>
      )}
    </>
  );
};

