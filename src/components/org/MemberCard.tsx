/**
 * 成员牌（第 7 轮 · PRD §12.4 / §12.5）：名册格子里的小牌，以及点开后放大翻面的正反两面。
 *   正面：代号、代表牌牌面、座位、总等级 LV、名片状态、连续天数、本周出勤七格、称号（读最新一份纪要，挂一周）；
 *   背面分两页（页签切换，默认第一页）：「五维」= 和首页同一个星形雷达（本人起的名字、等级、称号）+ LV + 总点数；
 *     「面具」= 展示的面具（最多 3 张：一张时列出三个技能，两三张时每张一行写最强一招）+ 本周目标与上周自评；底下是加入日期。
 * 五维和面具的属性名都用这个人自己起的名字（成员牌上推过来的），不是本机的。
 * 四频道各一套皮；我的那张有标记；屏蔽了的人半透明、挂「已屏蔽」；上一场会议没写目标的挂「本周缺席」。
 * 牌面默认是代表牌；点一下小牌的牌面就换成 Ta 的头像（本机偏好，再点换回来），放大牌、公告板跟着用同一个。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { toggleMemberFace } from '@/services/orgSync';
import { liveStatus } from '@/constants/profileStatus';
import { tarotArtUrl } from '@/constants/tarotArt';
import { useTarotArtSet } from '@/ui/useTarotArtSet';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_FONT, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { P4Sparkle } from '@/ui/p4Kit';
import { RESULT_LABEL, displayCodename, memberAttrNames, nextWeekKey, orgWeekKey, shiftDayKey, shownPersonas, tarotCardOf, weekDaysOf, zonedDay } from '@/utils/orgLogic';
import { OrgEmblem, WeekDots, useOrgTone, type OrgTone } from './orgUi';
import { titleBook } from '@/utils/orgTitles';
import type { OrgMember, OrgMinutesSnapshot, OrgView, PersonaSkill } from '@/types';
import { StarChartP3, type StarItem, type StarPalette } from '@/components/StarChartP3';

const SKILL_TYPE: Record<PersonaSkill['type'], string> = {
  damage: '伤害', crit: '暴击', buff: '增伤', debuff: '易伤', charge: '蓄力', heal: '回复', attack_boost: '攻击增益',
};

const seatNo = (n: number) => String(n).padStart(2, '0');

/** 估一行字的宽度（以字号为单位）：汉字 1、W/M 0.95、其余大写 0.72、小写和数字 0.58 */
const textEm = (s: string): number => [...s].reduce((n, ch) => n + (/[WM]/.test(ch) ? 0.95 : /[A-Z]/.test(ch) ? 0.72 : /[a-z0-9 ._-]/.test(ch) ? 0.58 : 1), 0);
/** 在 avail 宽度里放下这串字的字号（夹在 min~max 之间） */
export const fitFont = (s: string, avail: number, max: number, min: number): number =>
  Math.max(min, Math.min(max, Math.floor(avail / Math.max(1, textEm(s)))));
const ymd = (d: Date) => `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;

/** 纪要里的称号 → 名册小签上的短写 */
const shortTitle = (t: string): string => (t === '本周出勤王' ? '出勤王' : t.replace(/\s+/g, ''));

/** 这个人在最新一份纪要里的称号、是不是缺席 */
export function memberHonors(minutes: OrgMinutesSnapshot | null | undefined, userId: string): { titles: string[]; absent: boolean } {
  if (!minutes) return { titles: [], absent: false };
  return {
    titles: minutes.titles.filter(t => t.userId === userId).map(t => t.title),
    absent: minutes.absent.some(a => a.userId === userId),
  };
}

/** 背面「目标」一栏：本周 / 下周（会上刚写的）目标，以及这周 / 上周的自评 */
export function goalFacts(view: OrgView, m: OrgMember, now = new Date()) {
  const cur = orgWeekKey(now, view.org.tz);
  const goal = m.goal && m.goalWeek === cur ? { label: '本周目标', text: m.goal }
    : m.goal && m.goalWeek === nextWeekKey(cur) ? { label: '下周目标', text: m.goal }
      : null;
  const result = m.result && m.resultWeek === cur ? `这周自评：${RESULT_LABEL[m.result]}`
    : m.result && m.resultWeek === shiftDayKey(cur, -7) ? `上周自评：${RESULT_LABEL[m.result]}`
      : null;
  return { goal, result };
}

/** 这张牌此刻要显示的东西（按组织时区算本周） */
export function memberFacts(view: OrgView, m: OrgMember, now = new Date()) {
  const weekKey = orgWeekKey(now, view.org.tz);
  return {
    codename: displayCodename(m),
    card: tarotCardOf(m.tarotId),
    leader: m.userId === view.org.leaderId,
    mine: m.id === view.me.id,
    status: liveStatus(m.card.status ?? null, now.getTime()),
    streak: m.card.streak,
    /** 总等级（老版本推的牌子没有 → undefined，不显示） */
    lv: m.card.lv,
    /** 五维（本人的名字 + 等级；老版本推的牌子没有） */
    attrs: m.card.attrs ?? [],
    week: weekDaysOf(m.card, weekKey),
    today: zonedDay(now, view.org.tz).weekday - 1,
  };
}

/**
 * 这个人的牌面：代表牌；本机选了「用头像」、或者 Ta 还没选代表牌时用头像（有头像的话）。
 * fallbackTarot：人已经不在组织里时（公告板上的旧动态），用快照里记下的代表牌。
 */
export function useMemberFace(m: Pick<OrgMember, 'userId' | 'tarotId' | 'avatarUrl'> | undefined, fallbackTarot?: string) {
  const set = useTarotArtSet();
  const prefAvatar = useCloudSocialStore(s => (m ? s.orgAvatarFaces.includes(m.userId) : false));
  // 服务器上的牌 id 不认识（手改数据 / 以后加的牌）就当没选，退回头像
  const rawTarot = m ? m.tarotId : fallbackTarot;
  const tarotId = tarotCardOf(rawTarot) ? rawTarot : undefined;
  const avatar = m?.avatarUrl && (prefAvatar || !tarotId) ? m.avatarUrl : undefined;
  return {
    avatar: !!avatar,
    url: avatar ?? (tarotId ? tarotArtUrl(tarotId, set) : null),
    tarotId,
    /** 头像和代表牌都有，才有得换 */
    canToggle: !!m?.avatarUrl && !!tarotId,
  };
}

/** 牌面：图 + 连续天数角标；toggle 时点一下在代表牌 / 头像之间翻面（右上角挂一枚 ⇄ 提示） */
export function MemberFace({ member, fallbackTarot, streak = 0, toggle = false, empty, className, style }: {
  member?: Pick<OrgMember, 'userId' | 'tarotId' | 'avatarUrl'>;
  fallbackTarot?: string;
  streak?: number;
  toggle?: boolean;
  /** 既没牌也没头像时显示什么（默认「待选代表牌」） */
  empty?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const face = useMemberFace(member, fallbackTarot);
  const card = tarotCardOf(face.tarotId);
  // 只有「点了换面」才播翻面，页面刚出来那一下不翻
  const settled = useRef(false);
  useEffect(() => { settled.current = true; }, []);
  const canToggle = toggle && face.canToggle && !!member;
  const onToggle = (e: MouseEvent) => {
    e.stopPropagation();
    if (member) toggleMemberFace(member.userId);
  };
  const body = (
    <>
      {face.url ? (
        <motion.img
          key={face.url}
          src={face.url}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          initial={settled.current ? { rotateY: 90, opacity: 0.4 } : false}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
        />
      ) : (
        empty ?? <span className="absolute inset-0 flex items-center justify-center text-center text-[10px] font-black leading-tight opacity-70">待选<br />代表牌</span>
      )}
      {streak > 0 && (
        <span className="absolute inset-x-0 bottom-0 bg-black/70 py-[2px] text-center text-[9px] font-black leading-tight text-white tabular-nums" aria-label={`连续 ${streak} 天`}>
          连续 {streak} 天
        </span>
      )}
      {canToggle && (
        <span aria-hidden className="absolute right-[3px] top-[3px] flex h-[15px] w-[15px] items-center justify-center rounded-full bg-black/55 text-[9px] font-black leading-none text-white">⇄</span>
      )}
    </>
  );
  const boxStyle: CSSProperties = { background: card?.accent ?? 'rgba(127,127,127,0.18)', perspective: 400, ...style };
  if (canToggle) {
    return (
      <button type="button" onClick={onToggle} aria-label={face.avatar ? '牌面换回代表牌' : '牌面换成头像'} className={`relative block overflow-hidden ${className ?? ''}`} style={boxStyle}>
        {body}
      </button>
    );
  }
  return <span className={`relative block overflow-hidden ${className ?? ''}`} style={boxStyle}>{body}</span>;
}

// ── 名册里的小牌 ───────────────────────────────────────────────────────────────

export function MemberTile({ view, member, minutes, blocked, onOpen, onMore }: {
  view: OrgView;
  member: OrgMember;
  /** 最新一份纪要（称号 / 缺席） */
  minutes?: OrgMinutesSnapshot | null;
  blocked: boolean;
  onOpen: () => void;
  onMore: () => void;
}) {
  const tone = useOrgTone();
  const f = memberFacts(view, member);
  const honors = memberHonors(minutes, member.userId);
  // 黄频道夜间纸面是紫的：出勤格跟着 --ui-ink 走（白天墨黑、夜里浅紫白），空格用中性灰
  const weekOn = tone.channel === 'p3' ? P3R.blue : tone.channel === 'p4' ? 'var(--ui-ink, #131313)' : tone.channel === 'p5' ? P5R.red : 'var(--ui-accent, #6366f1)';
  const weekOff = tone.channel === 'p5' ? 'rgba(0,0,0,0.16)' : 'rgba(127,127,127,0.24)';

  const inner = (
    <div style={{ opacity: blocked ? 0.55 : 1 }}>
      <div className="relative flex gap-3">
        <SeatGhost tone={tone} n={member.seat} />
        <MemberFace member={member} toggle streak={f.streak} className="h-[84px] w-[53px] shrink-0" style={{ borderRadius: tone.channel === 'p4' ? 8 : tone.channel === 'neutral' ? 6 : 0, clipPath: tone.channel === 'p5' ? roughQuad(member.seat + 0.3, 2.5) : undefined, boxShadow: tone.channel === 'p4' ? '0 0 0 2px #131313' : undefined }} />
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {f.lv && <LvTag tone={tone} lv={f.lv} />}
            {f.leader && <span aria-label="队长" className="text-[11px] leading-none">👑</span>}
            {f.mine && <MineTag tone={tone} />}
            {blocked && <span className="text-[9px] font-black" style={{ color: tone.sub }}>已屏蔽</span>}
          </div>
          <div className="mt-1 truncate text-[15px] font-black leading-tight" style={{ fontFamily: tone.titleFont }}>{f.codename}</div>
          <div className="mt-0.5 truncate text-[11px] font-bold" style={{ color: tone.sub }}>
            {f.status ? `${f.status.emoji} ${f.status.label}` : f.card ? `${f.card.roman ?? ''} ${f.card.name}`.trim() : '还没选代表牌'}
          </div>
          <div className="mt-2">
            <WeekDots days={f.week} today={f.today} on={weekOn} off={weekOff} size={8} />
          </div>
        </div>
      </div>

      {/* 称号：整张牌的宽度横排一行（每人每周最多 3 个，再加「本周缺席」）；放不下就在这一行里横着滑，不往下挤高 */}
      {(honors.titles.length > 0 || honors.absent) && (
        <div className="no-scrollbar relative mt-2 flex flex-nowrap gap-[3px] overflow-x-auto" data-honors>
          {honors.titles.slice(0, 3).map(t => <HonorChip key={t} tone={tone}>{shortTitle(t)}</HonorChip>)}
          {honors.absent && <HonorChip tone={tone} muted>本周缺席</HonorChip>}
        </div>
      )}
    </div>
  );

  const more = (
    <button type="button" onClick={(e) => { e.stopPropagation(); onMore(); }} aria-label={`${f.codename} 的更多操作`} className="absolute right-1.5 top-1 z-10 px-1.5 text-[16px] font-black leading-none" style={{ color: tone.sub }}>⋯</button>
  );

  const shell = (children: ReactNode) => {
    if (tone.channel === 'p3') {
      return (
        <div className="relative px-3 py-2.5" style={{ background: P3R.panelGlass, clipPath: slantClip(9), boxShadow: '0 8px 18px rgba(38,96,140,0.10)', color: tone.ink }}>
          <span aria-hidden className="absolute left-0 right-0 top-0 h-[3px]" style={{ background: f.mine ? P3R.magenta : P3R.blue }} />
          {children}
        </div>
      );
    }
    if (tone.channel === 'p4') {
      return (
        <div className="relative px-3 py-2.5" style={{ background: tone.paper, borderRadius: 16, transform: `rotate(${member.seat % 2 ? 0.7 : -0.7}deg)`, boxShadow: `0 0 0 2px ${f.mine ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-line, #131313)'}, 0 3px 0 2px rgba(19,19,19,0.2)`, color: tone.ink }}>
          {children}
        </div>
      );
    }
    if (tone.channel === 'p5') {
      return (
        <div className="relative" style={{ color: P5R.ink, fontFamily: P5_FONT }}>
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(3px,4px)', background: f.mine ? P5R.red : P5R.ink, clipPath: roughQuad(member.seat + 0.13, 5) }} />
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: P5R.ink, clipPath: roughQuad(member.seat + 0.29, 4) }} />
          <span aria-hidden className="pointer-events-none absolute inset-[2.5px]" style={{ background: P5R.paper, clipPath: roughQuad(member.seat + 0.47, 3) }} />
          <div className="relative px-3 py-2.5">{children}</div>
        </div>
      );
    }
    return (
      <div className="relative rounded-2xl px-3 py-2.5" style={{ background: tone.paper, border: `1px solid ${f.mine ? 'var(--ui-accent, #6366f1)' : 'var(--ui-line, #e5e7eb)'}`, color: tone.ink }}>
        {children}
      </div>
    );
  };

  return (
    <motion.div whileTap={{ scale: 0.98 }} className="relative cursor-pointer" onClick={onOpen} role="button" tabIndex={0} aria-label={`${seatNo(member.seat)} 号 ${f.codename}`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}>
      {shell(inner)}
      {more}
    </motion.div>
  );
}

/** 名册小牌上的称号 / 缺席小签（纸面上；缺席是描边的淡签，不做成红牌） */
function HonorChip({ tone, muted = false, children }: { tone: OrgTone; muted?: boolean; children: string }) {
  const style: CSSProperties = muted
    ? { color: tone.sub, boxShadow: `inset 0 0 0 1px ${tone.channel === 'p5' ? 'rgba(0,0,0,0.3)' : 'rgba(127,127,127,0.45)'}`, borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0 }
    : tone.channel === 'p3'
      ? { background: P3R.magenta, color: '#ffffff', clipPath: slantClip(3) }
      : tone.channel === 'p4'
        ? { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 999, boxShadow: '0 0 0 1px #131313' }
        : tone.channel === 'p5'
          ? { background: P5R.red, color: P5R.white, clipPath: roughQuad(children.length + 0.7, 1.2), fontFamily: P5_TITLE_FONT }
          : { background: 'var(--ui-accent, #6366f1)', color: '#ffffff', borderRadius: 999 };
  return <span className="inline-flex shrink-0 items-center whitespace-nowrap px-1.5 py-[2px] text-[9px] font-black leading-none" style={style}>{children}</span>;
}

/**
 * 名册小牌右侧的大座号：浅灰色的背景装饰，压在文字下面（读屏不念——小牌的 aria-label 里已经有座号）。
 * 颜色取纸面上的字色再压淡，夜间跟着变；字体按频道：红 = 标题体微斜、蓝 = 斜体、黄 = 衬线、中性 = 无衬线。
 */
function SeatGhost({ tone, n }: { tone: OrgTone; n: number }) {
  const face: CSSProperties = tone.channel === 'p5'
    ? { fontFamily: P5_TITLE_FONT, transform: 'translateY(-50%) rotate(-6deg)', opacity: 0.1 }
    : tone.channel === 'p3'
      ? { fontStyle: 'italic', letterSpacing: '-0.05em', transform: 'translateY(-50%)', opacity: 0.09 }
      : tone.channel === 'p4'
        ? { fontFamily: 'var(--p4-display-font, serif)', letterSpacing: '-0.04em', transform: 'translateY(-50%)', opacity: 0.1 }
        : { letterSpacing: '-0.05em', transform: 'translateY(-50%)', opacity: 0.07 };
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-[-2px] top-1/2 select-none whitespace-nowrap text-[72px] font-black leading-[0.8] tabular-nums min-[380px]:text-[58px]"
      style={{ color: tone.ink, ...face }}
    >
      {seatNo(n)}
    </span>
  );
}

function MineTag({ tone }: { tone: OrgTone }) {
  if (tone.channel === 'p3') return <span className="px-1 py-[1px] text-[9px] font-black text-white" style={{ background: P3R.magenta, clipPath: slantClip(3) }}>我</span>;
  if (tone.channel === 'p4') return <span className="rounded-full bg-[#131313] px-1.5 py-[1px] text-[9px] font-black text-[#fff6d0]">我</span>;
  if (tone.channel === 'p5') return <span className="px-1 py-[1px] text-[9px] font-black" style={{ background: P5R.red, color: P5R.white, clipPath: roughQuad(2.2, 1.5) }}>我</span>;
  return <span className="rounded-full px-1.5 py-[1px] text-[9px] font-black text-white" style={{ background: tone.accent }}>我</span>;
}

/** 总等级小签（和同伴页铭牌上的 LV 同一套颜色：蓝斜块 / 橙圆角 / 红块纸边 / 主色圆角） */
export function LvTag({ tone, lv, size = 'sm' }: { tone: OrgTone; lv: number; size?: 'sm' | 'md' | 'lg' }) {
  const num = size === 'lg' ? 'text-[16px]' : size === 'md' ? 'text-[13px]' : 'text-[10px]';
  const cap = size === 'lg' ? 'text-[10px]' : size === 'md' ? 'text-[9px]' : 'text-[8px]';
  const pad = size === 'lg' ? 'px-2.5 py-[3px]' : size === 'md' ? 'px-2 py-[2px]' : 'px-1.5 py-[1px]';
  const skin: CSSProperties = tone.channel === 'p3'
    ? { background: P3R.blue, color: '#ffffff', clipPath: slantClip(size === 'sm' ? 3 : 5) }
    : tone.channel === 'p4'
      ? { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 999, boxShadow: '0 0 0 1.5px #131313' }
      : tone.channel === 'p5'
        ? { background: '#c00008', color: P5R.white, clipPath: 'polygon(2px 0, 100% 1px, calc(100% - 2px) 100%, 0 calc(100% - 1px))', fontFamily: P5_TITLE_FONT }
        : { background: 'var(--color-primary, #6366f1)', color: '#ffffff', borderRadius: 6 };
  return (
    <span className={`inline-flex shrink-0 items-baseline gap-[3px] whitespace-nowrap font-black leading-none ${pad}`} style={skin} aria-label={`等级 ${lv}`}>
      <span className={`${cap} tracking-wider opacity-85`}>LV</span>
      <span className={`${num} tabular-nums ${tone.channel === 'p3' ? 'italic' : ''}`}>{lv}</span>
    </span>
  );
}

/** 成员牌背面星形雷达的配色（背面纸色各频道不同：蓝白卡用首页默认那套，其余三套各配一套） */
const STAR_PALETTES: Partial<Record<OrgTone['channel'], StarPalette>> = {
  p4: { data: '#f9a11b', ink: '#131313', inkSoft: 'rgba(19,19,19,0.6)', accent: '#2e6be0', arm: 'rgba(19,19,19,0.35)', ringPale: '#fffaf0', ringDeep: '#f2d27a', focus: '#131313' },
  p5: { data: '#c00008', ink: '#000000', inkSoft: '#4a4640', accent: '#c00008', arm: 'rgba(0,0,0,0.35)', ringPale: '#f7f2ea', ringDeep: '#d9c8b0', focus: '#c00008' },
  neutral: { data: '#818cf8', ink: '#f3f4f6', inkSoft: '#9ca3af', accent: '#a5b4fc', arm: 'rgba(165,180,252,0.45)', ringPale: '#1f2937', ringDeep: '#4338ca', focus: '#a5b4fc' },
};

// ── 放大翻面的正反两面 ───────────────────────────────────────────────────────────

export function MemberCardFront({ view, member, minutes, width, height }: { view: OrgView; member: OrgMember; minutes?: OrgMinutesSnapshot | null; width: number; height: number }) {
  const tone = useOrgTone();
  const f = memberFacts(view, member);
  const honors = memberHonors(minutes, member.userId);
  // 放大牌跟小牌用同一个牌面（本机选了头像就是头像）
  const url = useMemberFace(member).url;
  const frame: CSSProperties = tone.channel === 'p3'
    ? { boxShadow: `inset 0 0 0 5px ${P3R.blue}` }
    : tone.channel === 'p4'
      ? { boxShadow: 'inset 0 0 0 6px #131313, inset 0 0 0 9px #fff6d0' }
      : tone.channel === 'p5'
        ? { boxShadow: `inset 0 0 0 5px ${P5R.ink}, inset 0 0 0 9px ${P5R.red}` }
        : { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' };
  return (
    <div className="relative h-full w-full overflow-hidden text-white" style={{ width, height, background: f.card?.accent ?? '#1f2937' }}>
      {url ? <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-[14px] font-black opacity-70">还没选代表牌</div>}
      <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={frame} />
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="px-2 py-1 text-[11px] font-black tracking-[0.18em]" style={{ background: tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.blue : 'rgba(0,0,0,0.55)', color: tone.channel === 'p4' ? '#131313' : '#ffffff', clipPath: tone.channel === 'p3' ? slantClip(5) : tone.channel === 'p5' ? roughQuad(1.7, 2) : undefined, borderRadius: tone.channel === 'p4' ? 999 : tone.channel === 'neutral' ? 8 : 0, fontFamily: tone.titleFont }}>
          SEAT {seatNo(member.seat)}
        </span>
        {f.lv && <LvTag tone={tone} lv={f.lv} size="md" />}
        {f.leader && <span className="text-[16px] leading-none">👑</span>}
      </div>
      <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
        {f.card && <div className="text-[11px] font-black tracking-[0.2em] text-white/70">{f.card.roman} · {f.card.name}</div>}
        <div className="mt-1 font-black leading-tight" style={{ fontFamily: tone.titleFont, fontSize: fitFont(f.codename, width - 44, 28, 16), overflowWrap: 'anywhere' }}>{f.codename}</div>
        {f.status && <div className="mt-1 text-[13px] font-bold text-white/90">{f.status.emoji} {f.status.label}</div>}
        {(honors.titles.length > 0 || honors.absent) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {honors.titles.map(t => (
              <span key={t} className="whitespace-nowrap px-1.5 py-[3px] text-[10px] font-black leading-none" style={{ background: tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.magenta : 'rgba(255,255,255,0.22)', color: tone.channel === 'p4' ? '#131313' : '#ffffff', clipPath: tone.channel === 'p3' ? slantClip(3) : tone.channel === 'p5' ? roughQuad(t.length + 0.9, 1.2) : undefined, borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0 }}>{t}</span>
            ))}
            {honors.absent && <span className="whitespace-nowrap px-1.5 py-[3px] text-[10px] font-black leading-none text-white/75" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.45)', borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0 }}>本周缺席</span>}
          </div>
        )}
        <div className="mt-3 flex items-end justify-between">
          <WeekDots days={f.week} today={f.today} on={tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : tone.channel === 'p5' ? P5R.red : '#ffffff'} off="rgba(255,255,255,0.22)" size={12} labels />
          <div className="text-right">
            <div className="text-[26px] font-black leading-none tabular-nums" style={{ fontFamily: tone.titleFont }}>{f.streak}</div>
            <div className="mt-0.5 text-[10px] font-bold text-white/70">连续天数</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MemberCardBack({ view, member, width, height, initialTab = 'stats' }: { view: OrgView; member: OrgMember; width: number; height: number; initialTab?: 'stats' | 'masks' | 'titles' }) {
  const tone = useOrgTone();
  const f = memberFacts(view, member);
  const g = goalFacts(view, member);
  const masks = shownPersonas(member.card);
  const p = masks.length === 1 ? masks[0] : null;
  // 面具的属性写这个人自己起的名字
  const names = memberAttrNames(member.card);
  const attrs = member.card.attrs ?? [];
  const [tab, setTab] = useState<'stats' | 'masks' | 'titles'>(initialTab);
  // 组织 P2：称号册——这个人在这个组织拿过的称号和次数（全部纪要现算）
  const book = useMemo(() => {
    const minutes = [...(view.ledger ?? []), ...(view.posts ?? [])].filter(x => x.kind === 'minutes' && x.minutes).map(x => x.minutes!);
    return titleBook(minutes, member.userId, view.org.custom);
  }, [view.ledger, view.posts, view.org.custom, member.userId]);
  // 两三张时每张一行：名字、属性 · 等级、最强的一招
  const best = (m: typeof masks[number]) => [...m.skills].sort((a, b) => b.power - a.power)[0];
  const bg = tone.channel === 'p3' ? P3R.panel : tone.channel === 'p4' ? '#fff6d0' : tone.channel === 'p5' ? P5R.paper : '#111827';
  const ink = tone.channel === 'neutral' ? '#f3f4f6' : tone.channel === 'p5' ? P5R.ink : tone.channel === 'p4' ? '#131313' : P3R.ink;
  const sub = tone.channel === 'neutral' ? '#9ca3af' : tone.channel === 'p5' ? '#4a4640' : tone.channel === 'p4' ? 'rgba(19,19,19,0.6)' : P3R.inkSoft;
  const accent = tone.channel === 'p3' ? P3R.blue : tone.channel === 'p4' ? '#2e6be0' : tone.channel === 'p5' ? P5R.red : '#a5b4fc';
  // 小屏上牌只有两百来宽、三百多高：字号收一档，面具名 / 目标最多两行，日期始终钉在底部
  const small = height < 420;
  const totalPoints = attrs.reduce((n, a) => n + (a.points ?? 0), 0);
  const hasPoints = attrs.some(a => a.points !== undefined);
  const stars: StarItem[] = attrs.map(a => ({ id: a.id, name: a.name, level: a.locked ? 0 : a.level, maxLevel: a.max ?? 10, stars: a.stars, title: a.title ?? '' }));
  const heading = (t: string, en: string) => (
    <div className="flex items-baseline gap-2">
      <span className={`${small ? 'text-[12px]' : 'text-[13px]'} font-black`} style={{ color: ink, fontFamily: tone.titleFont }}>{t}</span>
      <span className="text-[9px] font-black tracking-[0.2em]" style={{ color: accent }}>{en}</span>
    </div>
  );
  // 点页签别把牌翻回去（放大牌点哪都翻面；专辑墙按在按钮上本来就不翻）
  const stop = (e: MouseEvent | React.PointerEvent) => e.stopPropagation();
  const tabBtn = (id: 'stats' | 'masks' | 'titles', label: string, i: number) => {
    const on = tab === id;
    const skin: CSSProperties = tone.channel === 'p3'
      ? { background: on ? P3R.blue : 'transparent', color: on ? '#ffffff' : sub, clipPath: slantClip(5), boxShadow: on ? undefined : `inset 0 0 0 1px ${P3R.cyanPale}` }
      : tone.channel === 'p4'
        ? { background: on ? '#131313' : 'transparent', color: on ? '#fff6d0' : '#131313', borderRadius: 999, boxShadow: '0 0 0 1.5px #131313' }
        : tone.channel === 'p5'
          ? { background: on ? P5R.red : P5R.ink, color: P5R.white, clipPath: roughQuad(i + 4.2, 1.6), fontFamily: P5_TITLE_FONT }
          : { background: on ? '#4f46e5' : 'rgba(255,255,255,0.08)', color: on ? '#ffffff' : '#9ca3af', borderRadius: 999 };
    return (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={on}
        onPointerDown={stop}
        onClick={(e) => { e.stopPropagation(); setTab(id); }}
        className={`px-2.5 py-[3px] font-black leading-none ${small ? 'text-[11px]' : 'text-[12px]'}`}
        style={skin}
      >
        {label}
      </button>
    );
  };
  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden ${small ? 'px-4 pb-4 pt-5' : 'px-5 pb-5 pt-6'}`} style={{ width, height, background: bg, color: ink, fontFamily: tone.bodyFont }}>
      <OrgEmblem id={view.org.emblem} size={Math.round(width * 0.5)} color={accent} className="pointer-events-none absolute -bottom-4 -right-6" style={{ opacity: 0.08 }} />
      {tone.channel === 'p4' && <P4Sparkle size={18} color="var(--p4-orange, #f9a11b)" className="absolute right-4 top-4" />}
      <div className="relative shrink-0 truncate pr-5 text-[11px] font-black tracking-[0.2em]" style={{ color: sub }}>SEAT {seatNo(member.seat)} · {f.codename}</div>
      <div role="tablist" aria-label="成员牌背面" className={`relative flex shrink-0 gap-1.5 ${small ? 'mt-2' : 'mt-3'}`}>
        {tabBtn('stats', '五维', 0)}
        {tabBtn('masks', '面具', 1)}
        {tabBtn('titles', '称号', 2)}
      </div>

      <div className={`relative min-h-0 flex-1 overflow-hidden ${small ? 'mt-1' : 'mt-2'}`} role="tabpanel">
        {tab === 'titles' ? (
          <>
            {heading('称号册', 'TITLES')}
            {book.length > 0 ? (
              <ul className={small ? 'mt-1.5 space-y-1' : 'mt-2 space-y-1.5'} data-title-book>
                {book.slice(0, small ? 5 : 8).map(t => (
                  <li key={t.key} className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="min-w-0">
                      <span className={`block truncate font-black leading-tight ${small ? 'text-[13px]' : 'text-[15px]'}`} style={{ fontFamily: tone.titleFont, opacity: t.retired ? 0.6 : 1 }}>{t.name}</span>
                      <span className={`block truncate font-bold ${small ? 'text-[10px]' : 'text-[11px]'}`} style={{ color: sub }}>
                        最近：{Number(t.last.slice(5, 7))}月{Number(t.last.slice(8, 10))}日那周{t.bestWeeks && t.bestWeeks > 1 ? ` · 最长连续 ${t.bestWeeks} 周` : ''}{t.retired ? ' · 已停用' : ''}
                      </span>
                    </span>
                    <span className={`shrink-0 font-black tabular-nums ${small ? 'text-[14px]' : 'text-[17px]'}`} style={{ color: accent, fontFamily: tone.titleFont }}>×{t.count}</span>
                  </li>
                ))}
                {book.length > (small ? 5 : 8) && <li className="text-[11px] font-bold" style={{ color: sub }}>还有 {book.length - (small ? 5 : 8)} 种</li>}
              </ul>
            ) : (
              <div className="mt-2 text-[12px] font-bold leading-relaxed" style={{ color: sub }}>{view.ledger ? '还没拿过称号。每周一的会议纪要里发，挂一周，这里记着拿过几次。' : '称号册还没拉到，稍后再看。'}</div>
            )}
          </>
        ) : tab === 'stats' ? (
          attrs.length > 0 ? (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1" onPointerDown={stop}>
                <StarChartP3
                  items={stars}
                  palette={STAR_PALETTES[tone.channel]}
                  compact
                  showTitles={!small}
                  onSelect={(_id, e) => e.stopPropagation()}
                />
              </div>
              <div className={`grid shrink-0 grid-cols-2 gap-2 ${small ? 'mt-0' : 'mt-1'}`}>
                <div>
                  <div className="text-[9px] font-black tracking-[0.2em]" style={{ color: sub }}>LV</div>
                  <div className={`${small ? 'text-[20px]' : 'text-[26px]'} font-black leading-none tabular-nums`} style={{ color: accent, fontFamily: tone.titleFont }}>{f.lv ?? attrs.reduce((n, a) => n + (a.locked ? 0 : a.level), 0)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-black tracking-[0.2em]" style={{ color: sub }}>总点数</div>
                  <div className={`${small ? 'text-[20px]' : 'text-[26px]'} font-black leading-none tabular-nums`} style={{ fontFamily: tone.titleFont }}>{hasPoints ? totalPoints.toLocaleString() : '—'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[12px] font-bold leading-relaxed" style={{ color: sub }}>{f.mine ? '五维会在下次同步时推上来。' : 'Ta 的 App 还没更新，五维要等 Ta 更新后才看得到。'}</div>
          )
        ) : (
          <>
            {heading('展示的面具', 'PERSONA')}
            {masks.length > 1 ? (
              <ul className={small ? 'mt-1.5 space-y-1.5' : 'mt-2 space-y-2'}>
                {masks.map((m, i) => {
                  const top = best(m);
                  return (
                    <li key={`${m.attribute}-${i}`} className="min-w-0">
                      <div className={`truncate font-black leading-tight ${small ? 'text-[14px]' : 'text-[16px]'}`} style={{ fontFamily: tone.titleFont }}>{m.name}</div>
                      <div className={`truncate font-bold ${small ? 'text-[10px]' : 'text-[11px]'}`} style={{ color: sub }}>
                        {names[m.attribute] ?? m.attribute} · Lv.{m.level}
                        {top && <span style={{ color: accent }}> · {top.name} {SKILL_TYPE[top.type] ?? top.type} {top.power}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : p ? (
              <div className="mt-1.5">
                <div className={`line-clamp-2 font-black leading-tight ${small ? 'text-[18px]' : 'text-[22px]'}`} style={{ fontFamily: tone.titleFont }}>{p.name}</div>
                <div className="mt-0.5 text-[12px] font-bold" style={{ color: sub }}>{names[p.attribute] ?? p.attribute} · Lv.{p.level}</div>
                <ul className={`${small ? 'mt-2 space-y-1' : 'mt-2.5 space-y-1.5'}`}>
                  {p.skills.map((s, i) => (
                    <li key={i} className={`flex items-center justify-between gap-2 font-bold ${small ? 'text-[11px]' : 'text-[12px]'}`}>
                      <span className="min-w-0 truncate">{s.name}</span>
                      <span className={`shrink-0 font-black tabular-nums ${small ? 'text-[10px]' : 'text-[11px]'}`} style={{ color: accent }}>{SKILL_TYPE[s.type] ?? s.type} · {s.power}</span>
                    </li>
                  ))}
                  {p.skills.length === 0 && <li className="text-[12px] font-bold" style={{ color: sub }}>还没有解锁的技能</li>}
                </ul>
              </div>
            ) : (
              <div className="mt-2 text-[12px] font-bold leading-relaxed" style={{ color: sub }}>{f.mine ? '还没展示面具。在据点设置里可以打开。' : 'Ta 没有展示面具。'}</div>
            )}

            <div className={small ? 'mt-3' : 'mt-5'}>
              {heading(g.goal?.label ?? '本周目标', 'GOAL')}
              <div className={`mt-1.5 line-clamp-2 font-bold leading-relaxed ${small ? 'text-[12px]' : 'text-[14px]'}`}>{g.goal ? `「${g.goal.text}」` : <span style={{ color: sub }}>{f.mine ? '周日会议上写一句下周目标，会出现在这里' : '这周还没有目标'}</span>}</div>
              {g.result && <div className={`mt-1 font-black ${small ? 'text-[11px]' : 'text-[12px]'}`} style={{ color: accent }}>{g.result}</div>}
            </div>
          </>
        )}
      </div>

      <div className="relative mt-2 shrink-0 text-[11px] font-bold" style={{ color: sub }}>加入于 {ymd(member.createdAt)}</div>
    </div>
  );
}
