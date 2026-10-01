/**
 * 据点地图（第 7 轮 · PRD §12.4）：据点页顶部的一张地图，按频道各画一张——
 * 蓝＝校园地图、黄＝商店街、红＝城市夜景、中性＝等高线。
 * 组织在中央；成员按座位号围在四周（有头像放头像，没有放代号首字）；名册 / 公告板 / 会议是三个地标，同时也是下面内容的切换页签。
 * 背景是 SVG（纯装饰），地标 / 座位 / 中心是叠在上面的 HTML（字清楚、能点、读屏认得）。
 * 动效只有中心脉冲和选中地标的轻浮动（CSS，合成层）；有弹层、移出视口、粗犷度关掉时暂停。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAnyOverlayOpen } from '@/ui/overlayPause';
import { useBoldness } from '@/utils/boldness';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { P4Flower, P4Sparkle } from '@/ui/p4Kit';
import { displayCodename } from '@/utils/orgLogic';
import { EmblemBadge, useOrgTone, type OrgTone } from './orgUi';
import type { OrgView } from '@/types';

export type HideoutSection = 'roster' | 'board' | 'meeting';

const W = 360;
const H = 220;
const HQ = { x: 180, y: 110 };
/** 七个座位：绕中心一圈的椭圆（1 号在正上方，顺时针） */
const SEATS = Array.from({ length: 7 }, (_, i) => {
  const a = ((-90 + (i * 360) / 7) * Math.PI) / 180;
  return { x: HQ.x + 70 * Math.cos(a), y: HQ.y + 42 * Math.sin(a) };
});
const LANDMARKS: Array<{ id: HideoutSection; label: string; en: string; x: number; y: number }> = [
  { id: 'roster', label: '名册', en: 'MEMBERS', x: 62, y: 52 },
  { id: 'board', label: '公告板', en: 'BOARD', x: 298, y: 52 },
  { id: 'meeting', label: '会议', en: 'MEETING', x: 180, y: 194 },
];
const pct = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });

export function HideoutMap({ view, section, onSection, dots, blocked }: {
  view: OrgView;
  section: HideoutSection;
  onSection: (s: HideoutSection) => void;
  /** 地标上的小红点（7b：公告板有新动态、会议日还没写） */
  dots?: Partial<Record<HideoutSection, boolean>>;
  blocked?: Set<string>;
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

  const frame: CSSProperties = tone.channel === 'p3'
    ? { clipPath: slantClip(16), boxShadow: '0 12px 28px rgba(38,96,140,0.14)' }
    : tone.channel === 'p4'
      ? { borderRadius: 22, boxShadow: '0 0 0 3px var(--ui-line, #131313), 0 5px 0 3px rgba(19,19,19,0.22)' }
      : tone.channel === 'p5'
        ? { clipPath: roughQuad(5.5, 6) }
        : { borderRadius: 20, boxShadow: '0 0 0 1px var(--ui-line, #e5e7eb), 0 14px 30px -20px rgba(0,0,0,0.45)' };

  return (
    <div ref={ref} className={`relative w-full select-none overflow-hidden ${paused ? 'org-map-paused' : ''}`} style={{ aspectRatio: `${W} / ${H}`, ...frame }}>
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        {tone.channel === 'p3' ? <MapP3 /> : tone.channel === 'p4' ? <MapP4 /> : tone.channel === 'p5' ? <MapP5 /> : <MapNeutral />}
      </svg>
      {tone.channel === 'p4' && (
        <>
          <P4Flower size={22} color="rgba(255,255,255,0.8)" className="pointer-events-none absolute" style={{ left: '4%', bottom: '8%' }} />
          <P4Sparkle size={16} color="#ffffff" className="pointer-events-none absolute" style={{ right: '5%', bottom: '12%' }} />
        </>
      )}

      {/* 中心：组织徽记 + 脉冲圈 */}
      <span aria-hidden className="pointer-events-none absolute h-14 w-14" style={at(HQ.x, HQ.y, tone.channel === 'p3' ? ' rotate(45deg)' : '')}>
        <span className="org-map-pulse absolute inset-0" style={{ borderRadius: tone.channel === 'p3' ? 0 : 999, border: `2px solid ${tone.channel === 'p4' ? '#131313' : tone.channel === 'p5' ? P5R.red : tone.accent}` }} />
      </span>
      <span className="absolute" style={at(HQ.x, HQ.y)}>
        <EmblemBadge id={view.org.emblem} size={44} />
      </span>

      {/* 座位 */}
      {members.map(m => {
        const p = SEATS[(m.seat - 1 + 7) % 7];
        const mine = m.id === view.me.id;
        const lead = m.userId === view.org.leaderId;
        const dim = blocked?.has(m.userId);
        return (
          <span key={m.id} className="absolute" style={{ ...at(p.x, p.y), opacity: dim ? 0.4 : 1 }} aria-hidden>
            <SeatPin tone={tone} text={[...displayCodename(m)][0] ?? '?'} avatarUrl={m.avatarUrl} mine={mine} lead={lead} seat={m.seat} />
          </span>
        );
      })}

      {/* 地标 = 页签 */}
      <div role="tablist" aria-label="据点分区" className="absolute inset-0">
        {LANDMARKS.map(l => {
          const on = l.id === section;
          return (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSection(l.id)}
              className="absolute whitespace-nowrap"
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

function SeatPin({ tone, text, avatarUrl, mine, lead, seat }: { tone: OrgTone; text: string; avatarUrl?: string; mine: boolean; lead: boolean; seat: number }) {
  const crown = lead ? <span aria-hidden className="absolute -top-2.5 left-1/2 z-[1] -translate-x-1/2 text-[10px] leading-none">👑</span> : null;
  const img = (style?: CSSProperties) => (avatarUrl ? <img src={avatarUrl} alt="" draggable={false} loading="lazy" className="absolute inset-[2px] h-[calc(100%-4px)] w-[calc(100%-4px)] object-cover" style={style} /> : null);
  if (tone.channel === 'p3') {
    // 斜切形状会裁掉王冠：形状画在里层，王冠挂外层
    return (
      <span className="relative block" title={`${seat} 号`}>
        <span className="relative flex h-7 min-w-[28px] items-center justify-center px-1.5 text-[11px] font-black text-white" style={{ background: mine ? P3R.magenta : P3R.blueDeep, clipPath: slantClip(5), boxShadow: '0 3px 8px rgba(10,59,214,0.25)' }}>
          {avatarUrl ? img({ clipPath: slantClip(4) }) : text}
        </span>
        {crown}
      </span>
    );
  }
  if (tone.channel === 'p4') {
    return (
      <span className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full text-[12px] font-black" style={{ background: mine ? 'var(--p4-orange, #f9a11b)' : '#fff6d0', color: '#131313', boxShadow: '0 0 0 2px #131313' }}>
        {avatarUrl ? img({ borderRadius: 999 }) : text}
        {crown}
      </span>
    );
  }
  if (tone.channel === 'p5') {
    return (
      <span className="relative flex h-7 min-w-[28px] items-center justify-center px-1 text-[12px] font-black" style={{ fontFamily: P5_TITLE_FONT }}>
        <span aria-hidden className="absolute inset-0" style={{ background: mine ? P5R.red : P5R.paper, clipPath: roughQuad(seat + 0.9, 2.5) }} />
        {avatarUrl ? img({ clipPath: roughQuad(seat + 1.3, 2) }) : <span className="relative" style={{ color: mine ? P5R.white : P5R.ink }}>{text}</span>}
        {crown}
      </span>
    );
  }
  return (
    <span className="relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-white" style={{ background: mine ? '#f43f5e' : tone.accent, boxShadow: '0 0 0 2px var(--ui-paper, #ffffff)' }}>
      {avatarUrl ? img({ borderRadius: 999 }) : text}
      {crown}
    </span>
  );
}

// ── 四张底图 ─────────────────────────────────────────────────────────────────

const ROADS = [
  `M${HQ.x} ${HQ.y} L118 80 L62 52`,
  `M${HQ.x} ${HQ.y} L242 80 L298 52`,
  `M${HQ.x} ${HQ.y} L${HQ.x} 194`,
];

/** 蓝：校园地图——浅水面网格、教学楼块、白色道路、泳池 */
function MapP3() {
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
    </>
  );
}

/** 黄：商店街——一条黑马路、两排带条纹遮阳棚的小店、街心的广场 */
function MapP4() {
  const shops: Array<[number, string, 'up' | 'down']> = [
    [18, '#f9a11b', 'up'], [96, '#2e6be0', 'up'], [206, '#55c34f', 'up'], [270, '#ff6fa8', 'up'], [18, '#2e6be0', 'down'], [262, '#f9a11b', 'down'],
  ];
  return (
    <>
      <rect width={W} height={H} style={{ fill: 'var(--ui-paper, #fff6d0)' }} />
      {/* 马路 */}
      <rect x="0" y="98" width={W} height="26" fill="#131313" />
      <path d={`M0 111H${W}`} stroke="#fff6d0" strokeWidth="2.2" strokeDasharray="10 9" />
      <rect x="168" y="124" width="24" height={H - 124} fill="#131313" />
      <path d={`M180 124V${H}`} stroke="#fff6d0" strokeWidth="2" strokeDasharray="8 8" />
      {/* 店铺：上排挂在马路上沿，下排挂在马路下沿 */}
      {shops.map(([x, color, side], i) => {
        const up = side === 'up';
        const y = up ? 44 : 132;
        return (
          <g key={i}>
            <rect x={x} y={y} width="70" height="50" fill="#ffffff" stroke="#131313" strokeWidth="2.2" />
            <rect x={x + 8} y={up ? y + 22 : y + 24} width="22" height="20" fill={color} fillOpacity="0.28" stroke="#131313" strokeWidth="1.6" />
            <rect x={x + 38} y={up ? y + 22 : y + 24} width="24" height={up ? 28 : 26} fill="#fff6d0" stroke="#131313" strokeWidth="1.6" />
            {Array.from({ length: 7 }, (_, k) => (
              <rect key={k} x={x + k * 10} y={y - 2} width="10" height="12" fill={k % 2 ? '#ffffff' : color} stroke="#131313" strokeWidth="1.4" />
            ))}
          </g>
        );
      })}
      {/* 广场（会议那边）：几张桌子 */}
      {[[132, 176], [228, 176]].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="11" fill="#ffffff" stroke="#131313" strokeWidth="2" />
          <circle cx={cx} cy={cy} r="4" fill="#f9a11b" />
        </g>
      ))}
    </>
  );
}

/** 红：城市夜景——两层天际线、亮着的窗、一道红斜刀、地铁线 */
function MapP5() {
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
      <path d={back} fill="#161616" />
      <polygon points={`0,168 ${W},76 ${W},104 0,196`} fill="#c00008" fillOpacity="0.92" />
      <path d={front} fill="#242424" />
      {windows.map(([x, y, red], i) => <rect key={i} x={x} y={y} width="5" height="7" fill={red ? '#c00008' : '#f0e9df'} fillOpacity={red ? 0.95 : 0.7} />)}
      {ROADS.map((d, i) => <path key={i} d={d} fill="none" stroke="#f0e9df" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />)}
      {[[62, 52], [298, 52], [180, 194]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="6" fill="#000000" stroke="#f0e9df" strokeWidth="3" />)}
    </>
  );
}

/** 中性：等高线——一圈圈不规则的线，中心最密 */
function MapNeutral() {
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
    </>
  );
}
