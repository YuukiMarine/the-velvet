/**
 * 据点地图（第 7 轮 · PRD §12.4）：据点页顶部的一张地图，按频道各画一张——
 * 蓝＝校园地图、黄＝商店街、红＝城市夜景、中性＝等高线。
 * 组织在中央；成员按座位号围在四周（有头像放头像，没有放代号首字）；名册 / 公告板 / 会议 / 作战是四个地标（四角），同时也是下面内容的切换页签。
 * 背景是 SVG（纯装饰），地标 / 座位 / 中心是叠在上面的 HTML（字清楚、能点、读屏认得）。
 * 动效只有中心脉冲和选中地标的轻浮动（CSS，合成层）；有弹层、移出视口、粗犷度关掉时暂停。
 * 组织 P2（PRD §17.3）：
 *   · 座位能点（打开那个人的成员牌）；座位上不再挂队长的皇冠，空座位也不画（邀请在名册和下面的邀请码里）；
 *   · 地图随据点等级长大：每升一级多一样东西，满级换一圈金边；
 *   · 满月团战那三晚：天上升起月亮，中心换成首领标记和血条，点了打开团战面板。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAnyOverlayOpen } from '@/ui/overlayPause';
import { useBoldness } from '@/utils/boldness';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { P4Flower, P4Sparkle } from '@/ui/p4Kit';
import { displayCodename } from '@/utils/orgLogic';
import { EmblemBadge, OrgEmblem, useOrgTone, type OrgTone } from './orgUi';
import type { OrgMember, OrgView } from '@/types';

export type HideoutSection = 'roster' | 'board' | 'meeting' | 'ops';

const W = 360;
const H = 220;
const HQ = { x: 180, y: 110 };
/** 七个座位：绕中心一圈的椭圆（1 号在正上方，顺时针） */
const SEATS = Array.from({ length: 7 }, (_, i) => {
  const a = ((-90 + (i * 360) / 7) * Math.PI) / 180;
  return { x: HQ.x + 70 * Math.cos(a), y: HQ.y + 42 * Math.sin(a) };
});
/** 团战那三晚的月亮挂在正上方（1 号座位再往上） */
const MOON = { x: 180, y: 26 };
const MOON_HALO: Record<OrgTone['channel'], string> = { p3: '#35d1e8', p4: '#f9a11b', p5: '#f0e9df', neutral: '#a5b4fc' };
const LANDMARKS: Array<{ id: HideoutSection; label: string; en: string; x: number; y: number }> = [
  { id: 'roster', label: '名册', en: 'MEMBERS', x: 62, y: 46 },
  { id: 'board', label: '公告板', en: 'BOARD', x: 298, y: 46 },
  { id: 'meeting', label: '会议', en: 'MEETING', x: 62, y: 176 },
  { id: 'ops', label: '作战', en: 'OPS', x: 298, y: 176 },
];
const pct = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
const seatNo = (n: number) => String(n).padStart(2, '0');

/** 满月团战那三晚地图上要画的：首领名、剩下的血（0–1）、击退了没有、今晚我还能不能出手（红点） */
export interface MapRaid {
  boss: string;
  left: number;
  defeated: boolean;
  dot: boolean;
}

export function HideoutMap({ view, section, onSection, dots, blocked, level = 1, onSeat, raid, onRaid }: {
  view: OrgView;
  section: HideoutSection;
  onSection: (s: HideoutSection) => void;
  /** 地标上的小红点（7b：公告板有新动态、会议日还没写；第 8 轮：有新作战 / 作战刚达成） */
  dots?: Partial<Record<HideoutSection, boolean>>;
  blocked?: Set<string>;
  /** 据点等级（1–6）：地图跟着长 */
  level?: number;
  onSeat?: (m: OrgMember) => void;
  /** 团战三晚里才有：天上升月亮、中心换成首领 */
  raid?: MapRaid | null;
  onRaid?: () => void;
}) {
  const tone = useOrgTone();
  const anim = useBoldness();
  const overlay = useAnyOverlayOpen();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  // 叠在地图上的地标 / 座位 / 中心是固定像素：地图缩窄（小屏）时它们会挤成一团，跟着地图宽度一起缩放
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    io?.observe(el);
    const measure = () => setScale(Math.max(0.72, Math.min(1.15, el.clientWidth / W)));
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => { io?.disconnect(); ro?.disconnect(); };
  }, []);
  const at = (x: number, y: number, rot = ''): CSSProperties => ({ ...pct(x, y), transform: `translate(-50%, -50%) scale(${scale.toFixed(3)})${rot}` });
  const paused = !anim || overlay || !visible;
  const members = view.members;
  const lv = Math.max(1, Math.min(6, Math.round(level)));

  const frame: CSSProperties = tone.channel === 'p3'
    ? { clipPath: slantClip(16), boxShadow: '0 12px 28px rgba(38,96,140,0.14)' }
    : tone.channel === 'p4'
      ? { borderRadius: 22, boxShadow: '0 0 0 3px var(--ui-line, #131313), 0 5px 0 3px rgba(19,19,19,0.22)' }
      : tone.channel === 'p5'
        ? { clipPath: roughQuad(5.5, 6) }
        : { borderRadius: 20, boxShadow: '0 0 0 1px var(--ui-line, #e5e7eb), 0 14px 30px -20px rgba(0,0,0,0.45)' };

  return (
    <div ref={ref} className={`relative w-full select-none overflow-hidden ${paused ? 'org-map-paused' : ''}`} style={{ aspectRatio: `${W} / ${H}`, ...frame }}>
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" data-level={lv}>
        {tone.channel === 'p3' ? <MapP3 level={lv} /> : tone.channel === 'p4' ? <MapP4 level={lv} /> : tone.channel === 'p5' ? <MapP5 level={lv} /> : <MapNeutral level={lv} />}
        {lv >= 6 && <GoldFrame tone={tone} />}
      </svg>
      {tone.channel === 'p4' && (
        <>
          <P4Flower size={22} color="rgba(255,255,255,0.8)" className="pointer-events-none absolute" style={{ left: '4%', bottom: '8%' }} />
          <P4Sparkle size={16} color="#ffffff" className="pointer-events-none absolute" style={{ right: '5%', bottom: '12%' }} />
        </>
      )}

      {/* 满月团战：天上的月亮 */}
      {raid && (
        <span aria-hidden className="pointer-events-none absolute" style={at(MOON.x, MOON.y)} data-raid-moon>
          <MoonSky tone={tone} />
        </span>
      )}

      {/* 中心：组织徽记 + 脉冲圈；团战那三晚换成首领标记和血条 */}
      <span aria-hidden className="pointer-events-none absolute h-14 w-14" style={at(HQ.x, HQ.y, tone.channel === 'p3' ? ' rotate(45deg)' : '')}>
        <span className="org-map-pulse absolute inset-0" style={{ borderRadius: tone.channel === 'p3' ? 0 : 999, border: `2px solid ${raid ? MOON_HALO[tone.channel] : tone.channel === 'p4' ? '#131313' : tone.channel === 'p5' ? P5R.red : tone.accent}` }} />
      </span>
      {raid ? (
        <button
          type="button"
          onClick={onRaid}
          aria-label={`满月团战：「${raid.boss}」${raid.defeated ? '已击退' : `还剩 ${Math.round(raid.left * 100)}%`}${raid.dot ? '，今晚你还没出手' : ''}。点了打开团战面板`}
          className="absolute z-[2]"
          style={at(HQ.x, HQ.y)}
        >
          <RaidMarker tone={tone} raid={raid} />
        </button>
      ) : (
        <span className="absolute" style={at(HQ.x, HQ.y)}>
          <EmblemBadge id={view.org.emblem} size={44} />
        </span>
      )}

      {/* 座位：点了打开那个人的成员牌 */}
      {members.map(m => {
        const p = SEATS[(m.seat - 1 + 7) % 7];
        const mine = m.id === view.me.id;
        const dim = blocked?.has(m.userId);
        const name = displayCodename(m);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSeat?.(m)}
            aria-label={`${seatNo(m.seat)} 号 ${name}${mine ? '（我）' : ''}${m.userId === view.org.leaderId ? '（队长）' : ''}：打开成员牌`}
            className="absolute"
            style={{ ...at(p.x, p.y), opacity: dim ? 0.4 : 1 }}
          >
            <SeatPin tone={tone} text={[...name][0] ?? '?'} avatarUrl={m.avatarUrl} mine={mine} seat={m.seat} />
          </button>
        );
      })}

      {/* 地标 = 页签（整层不接点击，只有地标本身接——座位、首领在它下面也点得到） */}
      <div role="tablist" aria-label="据点分区" className="pointer-events-none absolute inset-0">
        {LANDMARKS.map(l => {
          const on = l.id === section;
          return (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSection(l.id)}
              className="pointer-events-auto absolute whitespace-nowrap"
              style={at(l.x, l.y)}
            >
              <span className={`block ${on ? 'org-map-float' : ''}`}>
                <Landmark tone={tone} label={l.label} en={l.en} on={on} dot={!!dots?.[l.id]} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 地标 / 座位 ───────────────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: '0 0 0 2px #ffffff' }} />;
}

function Landmark({ tone, label, en, on, dot }: { tone: OrgTone; label: string; en: string; on: boolean; dot: boolean }): ReactNode {
  if (tone.channel === 'p3') {
    // 斜切形状会把角上的红点裁掉：形状画在里层，红点挂在外层
    return (
      <span className="relative block">
        <span className="relative flex flex-col items-center px-3 py-1" style={{ background: on ? P3R.blue : P3R.panel, color: on ? '#ffffff' : P3R.blueDeep, clipPath: slantClip(8), boxShadow: '0 4px 10px rgba(38,96,140,0.18)' }}>
          <span className="text-[13px] font-black leading-none">{label}</span>
          <span className="mt-0.5 text-[7px] font-black tracking-[0.18em] opacity-80">{en}</span>
          {on && <span aria-hidden className="absolute bottom-0 right-2 h-[5px] w-[12px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />}
        </span>
        {dot && <Dot color={P3R.magenta} />}
      </span>
    );
  }
  if (tone.channel === 'p4') {
    return (
      <span className="relative flex flex-col items-center rounded-[12px] px-3 py-1" style={{ background: on ? '#131313' : '#fff6d0', color: on ? '#fff6d0' : '#131313', boxShadow: '0 0 0 2px #131313, 0 3px 0 2px rgba(19,19,19,0.28)', transform: 'rotate(-2deg)' }}>
        <span className="text-[13px] font-black leading-none" style={{ fontFamily: 'var(--p4-display-font, serif)' }}>{label}</span>
        <span className="mt-0.5 text-[7px] font-black tracking-[0.16em]" style={{ color: on ? 'var(--p4-orange, #f9a11b)' : 'rgba(19,19,19,0.55)' }}>{en}</span>
        {on && <P4Sparkle size={12} color="var(--p4-orange, #f9a11b)" className="absolute -right-2 -top-2" />}
        {dot && <Dot color="#e8452c" />}
      </span>
    );
  }
  if (tone.channel === 'p5') {
    return (
      <span className="relative flex flex-col items-center px-3 py-1" style={{ fontFamily: P5_TITLE_FONT }}>
        <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(2px,3px)', background: on ? P5R.paper : P5R.red, clipPath: roughQuad(label.length + 0.2, 3) }} />
        <span aria-hidden className="absolute inset-0" style={{ background: on ? P5R.red : P5R.paper, clipPath: roughQuad(label.length + 0.6, 3) }} />
        <span className="relative text-[13px] font-black leading-none" style={{ color: on ? P5R.white : P5R.ink }}>{label}</span>
        <span className="relative mt-0.5 text-[7px] font-black tracking-[0.16em]" style={{ color: on ? P5R.white : P5R.red }}>{en}</span>
        {dot && <Dot color={P5R.red} />}
      </span>
    );
  }
  return (
    <span className="relative flex flex-col items-center rounded-full px-3 py-1" style={{ background: on ? tone.accent : tone.paper, color: on ? '#ffffff' : tone.ink, boxShadow: on ? '0 6px 14px -6px rgba(99,102,241,0.6)' : '0 0 0 1px var(--ui-line, #e5e7eb)' }}>
      <span className="text-[12px] font-black leading-none">{label}</span>
      <span className="mt-0.5 text-[7px] font-bold tracking-[0.16em] opacity-70">{en}</span>
      {dot && <Dot color="#f43f5e" />}
    </span>
  );
}

function SeatPin({ tone, text, avatarUrl, mine, seat }: { tone: OrgTone; text: string; avatarUrl?: string; mine: boolean; seat: number }) {
  const img = (style?: CSSProperties) => (avatarUrl ? <img src={avatarUrl} alt="" draggable={false} loading="lazy" className="absolute inset-[2px] h-[calc(100%-4px)] w-[calc(100%-4px)] object-cover" style={style} /> : null);
  if (tone.channel === 'p3') {
    return (
      <span className="relative block" title={`${seat} 号`}>
        <span className="relative flex h-7 min-w-[28px] items-center justify-center px-1.5 text-[11px] font-black text-white" style={{ background: mine ? P3R.magenta : P3R.blueDeep, clipPath: slantClip(5), boxShadow: '0 3px 8px rgba(10,59,214,0.25)' }}>
          {avatarUrl ? img({ clipPath: slantClip(4) }) : text}
        </span>
      </span>
    );
  }
  if (tone.channel === 'p4') {
    return (
      <span className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full text-[12px] font-black" style={{ background: mine ? 'var(--p4-orange, #f9a11b)' : '#fff6d0', color: '#131313', boxShadow: '0 0 0 2px #131313' }}>
        {avatarUrl ? img({ borderRadius: 999 }) : text}
      </span>
    );
  }
  if (tone.channel === 'p5') {
    return (
      <span className="relative flex h-7 min-w-[28px] items-center justify-center px-1 text-[12px] font-black" style={{ fontFamily: P5_TITLE_FONT }}>
        <span aria-hidden className="absolute inset-0" style={{ background: mine ? P5R.red : P5R.paper, clipPath: roughQuad(seat + 0.9, 2.5) }} />
        {avatarUrl ? img({ clipPath: roughQuad(seat + 1.3, 2) }) : <span className="relative" style={{ color: mine ? P5R.white : P5R.ink }}>{text}</span>}
      </span>
    );
  }
  return (
    <span className="relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: mine ? '#f43f5e' : tone.accent, boxShadow: '0 0 0 2px var(--ui-paper, #ffffff)' }}>
      {avatarUrl ? img({ borderRadius: 999 }) : text}
    </span>
  );
}

/** 天上的月亮：圆盘慢慢呼吸、光晕一圈圈往外散 */
function MoonSky({ tone }: { tone: OrgTone }) {
  const c = tone.channel;
  const disc: CSSProperties = c === 'p4'
    ? { background: '#ffe066', boxShadow: '0 0 0 2px #131313' }
    : c === 'p5'
      ? { background: 'radial-gradient(circle at 38% 35%, #fffdf5, #f0e9df 60%, #d9cfbf)', boxShadow: '0 0 16px rgba(240,233,223,0.6)' }
      : c === 'p3'
        ? { background: 'radial-gradient(circle at 38% 35%, #ffffff, #e6f6ff 60%, #bfe7f7)', boxShadow: '0 0 16px rgba(53,209,232,0.65)' }
        : { background: 'radial-gradient(circle at 38% 35%, #ffffff, #eef0ff 60%, #c7cbfa)', boxShadow: '0 0 16px rgba(99,102,241,0.5)' };
  return (
    <span className="relative block h-[26px] w-[26px]">
      <span className="org-moon-halo absolute inset-0 rounded-full" style={{ border: `2px solid ${MOON_HALO[c]}` }} />
      <span className="org-moon-glow absolute inset-0 rounded-full" style={disc}>
        <span className="absolute h-[6px] w-[6px] rounded-full" style={{ left: 6, top: 8, background: 'rgba(0,0,0,0.09)' }} />
        <span className="absolute h-[4px] w-[4px] rounded-full" style={{ left: 15, top: 14, background: 'rgba(0,0,0,0.08)' }} />
      </span>
    </span>
  );
}

/** 团战那三晚的中心：首领标记（新月）+ 血条；击退了盖一枚「击退」；今晚还没出手亮红点 */
function RaidMarker({ tone, raid }: { tone: OrgTone; raid: MapRaid }) {
  const c = tone.channel;
  const shape: CSSProperties = c === 'p3' ? { clipPath: slantClip(8) } : c === 'p5' ? { clipPath: roughQuad(4.2, 3) } : { borderRadius: 999 };
  const bg = c === 'p4' ? '#131313' : c === 'p5' ? '#000000' : '#1b1240';
  const fg = c === 'p4' ? '#ffe066' : c === 'p5' ? '#f0e9df' : '#ffffff';
  const bar = c === 'p3' ? P3R.magenta : c === 'p4' ? 'var(--p4-orange, #f9a11b)' : c === 'p5' ? P5R.red : '#a78bfa';
  return (
    <span className="relative flex flex-col items-center">
      <span className="relative block">
        <span
          className="relative flex h-11 w-11 items-center justify-center"
          style={{ background: bg, boxShadow: c === 'p4' ? '0 0 0 2px #fff6d0, 0 0 0 4px #131313' : c === 'p5' ? undefined : '0 6px 16px rgba(27,18,64,0.45)', ...shape }}
        >
          {c === 'p5' && <span aria-hidden className="absolute inset-[3px]" style={{ background: '#c00008', clipPath: roughQuad(5.1, 3) }} />}
          <OrgEmblem id="moon" size={22} color={fg} className="relative" />
        </span>
        {raid.defeated && (
          <span className="absolute left-1/2 top-1/2 whitespace-nowrap px-1.5 py-[1px] text-[10px] font-black leading-tight" style={{ transform: 'translate(-50%, -50%) rotate(-12deg)', background: bar, color: '#ffffff', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
            击退
          </span>
        )}
        {raid.dot && !raid.defeated && <Dot color={c === 'p3' ? P3R.magenta : c === 'p4' ? '#e8452c' : c === 'p5' ? P5R.red : '#f43f5e'} />}
      </span>
      {!raid.defeated && (
        <span className="mt-1 block h-[5px] w-[54px] overflow-hidden" style={{ background: c === 'p4' ? '#fff6d0' : 'rgba(0,0,0,0.38)', borderRadius: c === 'p4' || c === 'neutral' ? 99 : 0, boxShadow: c === 'p4' ? '0 0 0 1.5px #131313' : undefined }}>
          <span className="block h-full" style={{ width: `${Math.max(3, Math.round(raid.left * 100))}%`, background: bar }} />
        </span>
      )}
    </span>
  );
}

/** 满级：一圈金边，四角各一颗小菱形 */
function GoldFrame({ tone }: { tone: OrgTone }) {
  const gold = '#e2b13c';
  const r = tone.channel === 'p4' ? 18 : tone.channel === 'neutral' ? 16 : 0;
  const corners: Array<[number, number]> = [[12, 12], [W - 12, 12], [12, H - 12], [W - 12, H - 12]];
  return (
    <g data-gold-frame>
      <rect x="3" y="3" width={W - 6} height={H - 6} rx={r} fill="none" stroke={gold} strokeWidth="3" />
      <rect x="8" y="8" width={W - 16} height={H - 16} rx={Math.max(0, r - 5)} fill="none" stroke={gold} strokeOpacity="0.55" strokeWidth="1" />
      {corners.map(([x, y], i) => <path key={i} d={`M${x} ${y - 5} L${x + 5} ${y} L${x} ${y + 5} L${x - 5} ${y} Z`} fill={gold} />)}
    </g>
  );
}

// ── 四张底图 ─────────────────────────────────────────────────────────────────

const ROADS = [
  `M${HQ.x} ${HQ.y} L118 78 L62 46`,
  `M${HQ.x} ${HQ.y} L242 78 L298 46`,
  `M${HQ.x} ${HQ.y} L118 146 L62 176`,
  `M${HQ.x} ${HQ.y} L242 146 L298 176`,
];

/** 蓝：校园地图——浅水面网格、教学楼块、白色道路、泳池。随等级：树 → 跑道 → 钟楼 → 楼顶旗 */
function MapP3({ level }: { level: number }) {
  return (
    <>
      <defs>
        <pattern id="org-p3-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" style={{ stroke: 'var(--p3r-blue, #1b57ff)' }} strokeOpacity="0.07" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} style={{ fill: 'var(--p3r-cyan-faint, #e2f2fa)' }} />
      <rect width={W} height={H} fill="url(#org-p3-grid)" />
      {[[14, 96, 72, 40], [276, 94, 70, 44], [100, 10, 48, 26], [214, 12, 50, 24], [26, 160, 60, 36], [262, 150, 70, 40], [118, 170, 30, 30], [214, 172, 34, 28]].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="3" style={{ fill: 'var(--p3r-cyan-pale, #cfeaf6)' }} />
      ))}
      <ellipse cx="316" cy="206" rx="34" ry="12" style={{ fill: 'var(--p3r-cyan, #35d1e8)' }} fillOpacity="0.22" />
      {ROADS.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" style={{ stroke: 'var(--p3r-panel, #ffffff)' }} strokeWidth="11" strokeLinejoin="round" strokeLinecap="round" />
          <path d={d} fill="none" style={{ stroke: 'var(--p3r-blue, #1b57ff)' }} strokeOpacity="0.28" strokeWidth="1.4" strokeDasharray="4 5" strokeLinecap="round" />
        </g>
      ))}
      <text x="10" y="212" fontSize="30" fontStyle="italic" fontWeight="900" style={{ fill: 'var(--p3r-blue, #1b57ff)' }} fillOpacity="0.07" fontFamily="Arial, sans-serif">CAMPUS</text>
      {level >= 2 && (
        <g data-grow="2">
          {[[338, 64], [348, 77], [338, 90], [126, 208], [234, 208]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="5" style={{ fill: 'var(--p3r-cyan, #35d1e8)' }} fillOpacity="0.5" />
              <circle cx={x} cy={y} r="1.6" style={{ fill: 'var(--p3r-blue, #1b57ff)' }} fillOpacity="0.5" />
            </g>
          ))}
        </g>
      )}
      {level >= 3 && (
        <g data-grow="3">
          {/* 跑道：跑道面 + 内场 + 一条实线分道（原来是白圈 + 粉色虚线，看着像拿掉的空座位虚线圈） */}
          <ellipse cx="180" cy="206" rx="28" ry="10" style={{ fill: 'var(--p3r-magenta, #ff2f6d)' }} fillOpacity="0.2" />
          <ellipse cx="180" cy="206" rx="19" ry="5.5" style={{ fill: 'var(--p3r-cyan-pale, #cfeaf6)' }} />
          <ellipse cx="180" cy="206" rx="23.5" ry="7.8" fill="none" style={{ stroke: 'var(--p3r-panel, #ffffff)' }} strokeOpacity="0.9" strokeWidth="0.8" />
        </g>
      )}
      {level >= 4 && (
        <g data-grow="4">
          <path d="M18 98V74L25 66L32 74V98Z" style={{ fill: 'var(--p3r-panel, #ffffff)', stroke: 'var(--p3r-blue, #1b57ff)' }} strokeOpacity="0.55" strokeWidth="1.2" />
          <circle cx="25" cy="78" r="4.2" style={{ fill: 'var(--p3r-cyan-faint, #e2f2fa)', stroke: 'var(--p3r-blue, #1b57ff)' }} strokeWidth="1.2" />
          <path d="M25 78V75.6M25 78H26.8" style={{ stroke: 'var(--p3r-blue, #1b57ff)' }} strokeWidth="1" strokeLinecap="round" />
        </g>
      )}
      {level >= 5 && (
        <g data-grow="5">
          {[[146, 10], [216, 12]].map(([x, y], i) => (
            <g key={i}>
              <path d={`M${x} ${y}V${y - 9}`} style={{ stroke: 'var(--p3r-blue, #1b57ff)' }} strokeOpacity="0.6" strokeWidth="1.2" />
              <path d={`M${x} ${y - 9}L${x + 9} ${y - 6.5}L${x} ${y - 4}Z`} style={{ fill: 'var(--p3r-magenta, #ff2f6d)' }} fillOpacity="0.85" />
            </g>
          ))}
        </g>
      )}
    </>
  );
}

/**
 * 黄：商店街——一条马路、两排带条纹遮阳棚的小店、街心的广场。随等级：路灯 → 彩旗 → 气球 → 灯串。
 * 这张图是底：线条用纸面上的字色压淡、店铺和遮阳棚用半饱和的颜色，不跟上面的头像描边、地标抢（夜间纸面翻紫，跟着 token 走）。
 */
const P4_INK: CSSProperties = { stroke: 'var(--ui-ink, #131313)' };
const P4_SOFT = ['#e9b968', '#8ea6d6', '#9cc795', '#e7a3bf'];
function MapP4({ level }: { level: number }) {
  const shops: Array<[number, string, 'up' | 'down']> = [
    [18, P4_SOFT[0], 'up'], [96, P4_SOFT[1], 'up'], [206, P4_SOFT[2], 'up'], [270, P4_SOFT[3], 'up'], [18, P4_SOFT[1], 'down'], [262, P4_SOFT[0], 'down'],
  ];
  return (
    <>
      <rect width={W} height={H} style={{ fill: 'var(--ui-paper, #fff6d0)' }} />
      {/* 马路：字色压淡的一条带子，中线用纸色 */}
      <rect x="0" y="98" width={W} height="26" style={{ fill: 'var(--ui-ink, #131313)' }} fillOpacity="0.32" />
      <path d={`M0 111H${W}`} style={{ stroke: 'var(--ui-paper, #fff6d0)' }} strokeOpacity="0.85" strokeWidth="2" strokeDasharray="10 9" />
      <rect x="168" y="124" width="24" height={H - 124} style={{ fill: 'var(--ui-ink, #131313)' }} fillOpacity="0.32" />
      <path d={`M180 124V${H}`} style={{ stroke: 'var(--ui-paper, #fff6d0)' }} strokeOpacity="0.85" strokeWidth="1.8" strokeDasharray="8 8" />
      {/* 店铺：上排挂在马路上沿，下排挂在马路下沿 */}
      {shops.map(([x, color, side], i) => {
        const up = side === 'up';
        const y = up ? 44 : 132;
        return (
          <g key={i}>
            <rect x={x} y={y} width="70" height="50" style={{ fill: 'var(--ui-ink, #131313)', ...P4_INK }} fillOpacity="0.05" strokeOpacity="0.28" strokeWidth="1.5" />
            <rect x={x + 8} y={up ? y + 22 : y + 24} width="22" height="20" fill={color} fillOpacity="0.32" style={P4_INK} strokeOpacity="0.24" strokeWidth="1.2" />
            <rect x={x + 38} y={up ? y + 22 : y + 24} width="24" height={up ? 28 : 26} style={{ fill: 'var(--ui-paper, #fff6d0)', ...P4_INK }} strokeOpacity="0.24" strokeWidth="1.2" />
            {Array.from({ length: 7 }, (_, k) => (
              <rect key={k} x={x + k * 10} y={y - 2} width="10" height="12" fill={k % 2 ? 'var(--ui-paper, #fff6d0)' : color} fillOpacity={k % 2 ? 1 : 0.6} style={P4_INK} strokeOpacity="0.22" strokeWidth="1" />
            ))}
          </g>
        );
      })}
      {/* 广场（会议那边）：几张桌子 */}
      {[[132, 176], [228, 176]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="11" style={{ fill: 'var(--ui-paper, #fff6d0)', ...P4_INK }} strokeOpacity="0.28" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r="4" fill={P4_SOFT[0]} fillOpacity="0.8" />
        </g>
      ))}
      {level >= 2 && (
        <g data-grow="2">
          {[92, 186].map(x => (
            <g key={x}>
              <path d={`M${x} 97V70`} style={P4_INK} strokeOpacity="0.35" strokeWidth="1.6" />
              <circle cx={x} cy="68" r="7" fill="#ffe8a3" fillOpacity="0.35" />
              <circle cx={x} cy="68" r="3.2" fill="#f5d77e" style={P4_INK} strokeOpacity="0.35" strokeWidth="1.1" />
            </g>
          ))}
        </g>
      )}
      {level >= 3 && (
        <g data-grow="3">
          <path d={`M0 5Q${W / 2} 16 ${W} 5`} fill="none" style={P4_INK} strokeOpacity="0.3" strokeWidth="1" />
          {Array.from({ length: 24 }, (_, i) => {
            const x = 6 + i * 15;
            const y = 5 + 11 * (1 - ((x - W / 2) / (W / 2)) ** 2) * 0.95;
            return <path key={i} d={`M${x - 4.5} ${y}L${x + 4.5} ${y}L${x} ${y + 8}Z`} fill={P4_SOFT[i % 4]} fillOpacity="0.7" />;
          })}
        </g>
      )}
      {level >= 4 && (
        <g data-grow="4">
          {([[340, 30, P4_SOFT[3]], [350, 22, P4_SOFT[1]], [331, 21, P4_SOFT[2]]] as const).map(([x, y, c], i) => (
            <g key={i}>
              <path d={`M${x} ${y + 6}Q${x + 2} ${y + 14} 342 44`} fill="none" style={P4_INK} strokeOpacity="0.3" strokeWidth="0.8" />
              <ellipse cx={x} cy={y} rx="5" ry="6" fill={c} fillOpacity="0.8" style={P4_INK} strokeOpacity="0.3" strokeWidth="1" />
            </g>
          ))}
        </g>
      )}
      {level >= 5 && (
        <g data-grow="5">
          {Array.from({ length: 8 }, (_, i) => (
            <g key={i}>
              <circle cx="171" cy={132 + i * 11} r="1.8" fill="#ffe8a3" fillOpacity="0.8" />
              <circle cx="189" cy={137 + i * 11} r="1.8" fill="#ffe8a3" fillOpacity="0.8" />
            </g>
          ))}
        </g>
      )}
    </>
  );
}

/** 红：城市夜景——两层天际线、亮着的窗、一道红斜刀、地铁线。随等级：更多亮窗 → 信号塔 → 探照灯 → 广告牌 */
function MapP5({ level }: { level: number }) {
  const back = 'M0 150 L0 96 L22 96 L22 70 L48 70 L48 104 L70 104 L70 58 L96 58 L96 92 L122 92 L122 76 L150 76 L150 110 L176 110 L176 64 L204 64 L204 98 L230 98 L230 52 L256 52 L256 88 L284 88 L284 66 L312 66 L312 100 L336 100 L336 78 L360 78 L360 150 Z';
  const front = 'M0 220 L0 150 L30 150 L30 132 L58 132 L58 160 L92 160 L92 126 L118 126 L118 154 L146 154 L146 170 L214 170 L214 140 L242 140 L242 124 L270 124 L270 158 L300 158 L300 136 L330 136 L330 150 L360 150 L360 220 Z';
  const windows: Array<[number, number, boolean]> = [[28, 80, true], [76, 66, false], [84, 76, true], [182, 72, true], [236, 60, false], [244, 70, true], [290, 74, true], [34, 140, false], [100, 134, true], [250, 132, true], [306, 144, false], [52, 112, true], [206, 84, false]];
  return (
    <>
      <rect width={W} height={H} fill="#000000" />
      <defs>
        <pattern id="org-p5-dots" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.6" cy="1.6" r="1.2" fill="#3a3a3a" />
        </pattern>
      </defs>
      <rect x="250" y="0" width="110" height="60" fill="url(#org-p5-dots)" />
      {level >= 4 && (
        <g data-grow="4">
          <polygon points={`22,${H} 4,0 44,0`} fill="#f0e9df" fillOpacity="0.07" />
          <polygon points={`326,${H} 312,0 352,0`} fill="#f0e9df" fillOpacity="0.07" />
        </g>
      )}
      <path d={back} fill="#161616" />
      <polygon points={`0,168 ${W},76 ${W},104 0,196`} fill="#c00008" fillOpacity="0.92" />
      <path d={front} fill="#242424" />
      {windows.map(([x, y, red], i) => <rect key={i} x={x} y={y} width="5" height="7" fill={red ? '#c00008' : '#f0e9df'} fillOpacity={red ? 0.95 : 0.7} />)}
      {level >= 2 && (
        <g data-grow="2">
          {([[58, 78, true], [128, 84, false], [262, 70, false], [318, 84, true], [342, 92, false], [150, 140, false], [278, 140, true], [10, 104, true]] as const).map(([x, y, red], i) => (
            <rect key={i} x={x} y={y} width="5" height="7" fill={red ? '#c00008' : '#f0e9df'} fillOpacity={red ? 0.95 : 0.7} />
          ))}
        </g>
      )}
      {level >= 3 && (
        <g data-grow="3">
          <path d="M243 52V24M238 52L243 36L248 52M239 42H247" fill="none" stroke="#3a3a3a" strokeWidth="1.6" />
          <circle cx="243" cy="22" r="2.6" fill="#c00008" />
          <circle cx="243" cy="22" r="6" fill="#c00008" fillOpacity="0.25" />
        </g>
      )}
      {level >= 5 && (
        <g data-grow="5">
          <rect x="216" y="128" width="24" height="10" fill="#c00008" />
          <path d="M219 131H233M219 135H229" stroke="#f0e9df" strokeWidth="1.4" />
        </g>
      )}
      {ROADS.map((d, i) => <path key={i} d={d} fill="none" stroke="#f0e9df" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
      {LANDMARKS.map((l) => <circle key={l.id} cx={l.x} cy={l.y} r="6" fill="#000000" stroke="#f0e9df" strokeWidth="3" />)}
    </>
  );
}

/** 中性：等高线——一圈圈不规则的线，中心最密。随等级：一面旗 → 帐篷 → 外面再一圈 → 指北针 */
function MapNeutral({ level }: { level: number }) {
  const ring = (r: number, k: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const wob = 1 + 0.09 * Math.sin(a * 3 + k) + 0.05 * Math.cos(a * 5 - k * 0.7);
      pts.push(`${(HQ.x + r * 1.55 * wob * Math.cos(a)).toFixed(1)} ${(HQ.y + r * wob * Math.sin(a)).toFixed(1)}`);
    }
    return `M${pts.join(' L')}Z`;
  };
  return (
    <>
      <rect width={W} height={H} style={{ fill: 'var(--ui-paper, #ffffff)' }} />
      {[22, 38, 56, 76, 98, 122].map((r, i) => (
        <path key={r} d={ring(r, i * 1.3)} fill="none" style={{ stroke: i % 2 ? 'var(--ui-line, #e5e7eb)' : 'var(--ui-accent, #6366f1)' }} strokeOpacity={i % 2 ? 1 : 0.22} strokeWidth="1.2" />
      ))}
      {ROADS.map((d, i) => <path key={i} d={d} fill="none" style={{ stroke: 'var(--ui-muted, #6b7280)' }} strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="3 5" strokeLinecap="round" />)}
      {level >= 2 && (
        <g data-grow="2">
          <path d="M332 122V100" style={{ stroke: 'var(--ui-muted, #6b7280)' }} strokeWidth="1.4" strokeLinecap="round" />
          <path d="M332 100L345 104L332 109Z" style={{ fill: 'var(--ui-accent, #6366f1)' }} />
        </g>
      )}
      {level >= 3 && (
        <g data-grow="3">
          {[[22, 118], [36, 126]].map(([x, y], i) => (
            <path key={i} d={`M${x - 7} ${y}L${x} ${y - 10}L${x + 7} ${y}Z M${x} ${y - 10}L${x} ${y}`} style={{ fill: 'var(--ui-paper, #ffffff)', stroke: 'var(--ui-accent, #6366f1)' }} strokeOpacity="0.7" strokeWidth="1.2" strokeLinejoin="round" />
          ))}
        </g>
      )}
      {level >= 4 && <path data-grow="4" d={ring(142, 7.7)} fill="none" style={{ stroke: 'var(--ui-accent, #6366f1)' }} strokeOpacity="0.16" strokeWidth="1.2" />}
      {level >= 5 && (
        <g data-grow="5">
          <circle cx="344" cy="204" r="9" style={{ fill: 'var(--ui-paper, #ffffff)', stroke: 'var(--ui-muted, #6b7280)' }} strokeOpacity="0.6" strokeWidth="1.2" />
          <path d="M344 197L347 204L344 211L341 204Z" style={{ fill: 'var(--ui-accent, #6366f1)' }} fillOpacity="0.8" />
          <text x="344" y="193.5" textAnchor="middle" fontSize="6" fontWeight="900" style={{ fill: 'var(--ui-muted, #6b7280)' }}>N</text>
        </g>
      )}
    </>
  );
}
