import type { ReactElement } from 'react';
import {
  FESTIVAL_EN, SOLAR_TERM_EN, seasonOfDate, termOrdinal,
  type SeasonKey, type SeasonMark, type SolarTermName,
} from '@/utils/calendar';

/**
 * 岁时卡（第 6 轮，用户口径：「做成类似塔罗牌的感觉」）。
 * 没有美术资源，44 张卡面全部程序化画出来：一季一套底色，卡框 / 罗马数字 / 名字 / 英文名照塔罗的版式，
 * 中央是每个节气、节日各自的一枚线稿意象（同一支笔、同一种描边，成一套）。
 * 未收录的卡整体去色并用虚线内框，收录后右上角盖一枚朱印。
 */

const VB_W = 200;
const VB_H = 320;

export interface SeasonPal { ink: string; accent: string; soft: string; bgTop: string; bgBottom: string; paper: string }

export const SEASON_PALETTES: Record<SeasonKey, SeasonPal> = {
  spring: { ink: '#2f5a3c', accent: '#62b36a', soft: '#f4b6c6', bgTop: '#e6f4e2', bgBottom: '#fcf8ee', paper: '#fffdf7' },
  summer: { ink: '#1e4a66', accent: '#3aa3c8', soft: '#f7d364', bgTop: '#dff1f6', bgBottom: '#fbfaf1', paper: '#fdfdf8' },
  autumn: { ink: '#6a3a1c', accent: '#df8437', soft: '#f2c463', bgTop: '#fbe9d2', bgBottom: '#fff8ec', paper: '#fffaf2' },
  winter: { ink: '#2a3a62', accent: '#5b7ec4', soft: '#c9d8f2', bgTop: '#e3e9f6', bgBottom: '#f9fafd', paper: '#fbfcfe' },
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV'];

// 固定的几种“物色”：不跟季节底色走（灯笼要红、星要金、瓜要红瓤）
const RED = '#d8322b';
const GOLD = '#f4c542';
const MELON = '#e8515a';
const GREEN = '#4caf6d';
const PINK = '#ef6a86';
const ORANGE = '#f08a2c';
const WHEAT = '#e9c25a';

// ── 一支笔 ──────────────────────────────────────────────────────────────
const ln = (p: SeasonPal, w = 2.4) => ({ fill: 'none' as const, stroke: p.ink, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });
const starPoints = (cx: number, cy: number, r: number) => Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  const rr = i % 2 ? r * 0.42 : r;
  return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
}).join(' ');

const Sun = ({ p, cx = 0, cy = 0, r = 16, rays = 8, len = 8, gap = 6 }: { p: SeasonPal; cx?: number; cy?: number; r?: number; rays?: number; len?: number; gap?: number }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill={p.soft} stroke={p.ink} strokeWidth={2.4} />
    {Array.from({ length: rays }, (_, i) => {
      const a = (i / rays) * Math.PI * 2;
      return <line key={i} x1={cx + Math.cos(a) * (r + gap)} y1={cy + Math.sin(a) * (r + gap)} x2={cx + Math.cos(a) * (r + gap + len)} y2={cy + Math.sin(a) * (r + gap + len)} {...ln(p)} />;
    })}
  </g>
);

const Flake = ({ p, cx = 0, cy = 0, r = 14, w = 2 }: { p: SeasonPal; cx?: number; cy?: number; r?: number; w?: number }) => (
  <g {...ln(p, w)}>
    {[0, 60, 120].map((a) => {
      const t = (a * Math.PI) / 180;
      return <line key={a} x1={cx - Math.cos(t) * r} y1={cy - Math.sin(t) * r} x2={cx + Math.cos(t) * r} y2={cy + Math.sin(t) * r} />;
    })}
    {[0, 60, 120, 180, 240, 300].map((a) => {
      const t = (a * Math.PI) / 180;
      const bx = cx + Math.cos(t) * r * 0.62, by = cy + Math.sin(t) * r * 0.62, l = r * 0.3;
      return (
        <g key={a}>
          <line x1={bx} y1={by} x2={bx + Math.cos(t + Math.PI / 3) * l} y2={by + Math.sin(t + Math.PI / 3) * l} />
          <line x1={bx} y1={by} x2={bx + Math.cos(t - Math.PI / 3) * l} y2={by + Math.sin(t - Math.PI / 3) * l} />
        </g>
      );
    })}
  </g>
);

const Drop = ({ p, cx = 0, cy = 0, s = 8, fill }: { p: SeasonPal; cx?: number; cy?: number; s?: number; fill?: string }) => (
  <path
    d={`M${cx},${cy - s} C${cx + s * 0.55},${cy - s * 0.35} ${cx + s},${cy + s * 0.1} ${cx + s},${cy + s * 0.5} A${s},${s} 0 1 1 ${cx - s},${cy + s * 0.5} C${cx - s},${cy + s * 0.1} ${cx - s * 0.55},${cy - s * 0.35} ${cx},${cy - s} Z`}
    fill={fill ?? p.accent} stroke={p.ink} strokeWidth={2} strokeLinejoin="round"
  />
);

const Leaf = ({ p, cx = 0, cy = 0, rot = 0, s = 16, fill }: { p: SeasonPal; cx?: number; cy?: number; rot?: number; s?: number; fill?: string }) => (
  <g transform={`translate(${cx},${cy}) rotate(${rot})`}>
    <path d={`M0,${-s} C${s * 0.78},${-s * 0.55} ${s * 0.88},${s * 0.35} 0,${s} C${-s * 0.88},${s * 0.35} ${-s * 0.78},${-s * 0.55} 0,${-s} Z`} fill={fill ?? p.accent} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
    <line x1={0} y1={-s * 0.7} x2={0} y2={s * 0.8} {...ln(p, 1.6)} />
  </g>
);

const Star = ({ p, cx = 0, cy = 0, r = 8, fill, w = 1.8 }: { p: SeasonPal; cx?: number; cy?: number; r?: number; fill?: string; w?: number }) => (
  <polygon points={starPoints(cx, cy, r)} fill={fill ?? GOLD} stroke={p.ink} strokeWidth={w} strokeLinejoin="round" />
);

const Cloud = ({ p, cx = 0, cy = 0, s = 1, fill }: { p: SeasonPal; cx?: number; cy?: number; s?: number; fill?: string }) => (
  <path transform={`translate(${cx},${cy}) scale(${s})`} d="M-26,10 a10,10 0 0 1 4,-19 a13,13 0 0 1 25,-5 a11,11 0 0 1 20,8 a9,9 0 0 1 -2,16 Z" fill={fill ?? p.paper} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
);

const Wheat = ({ p, cx = 0, cy = 0, h = 46, grains = 6, tilt = 0, awn = false, half = false }: { p: SeasonPal; cx?: number; cy?: number; h?: number; grains?: number; tilt?: number; awn?: boolean; half?: boolean }) => (
  <g transform={`translate(${cx},${cy}) rotate(${tilt})`}>
    <line x1={0} y1={h / 2} x2={0} y2={-h / 2 + 4} {...ln(p)} />
    {Array.from({ length: grains }, (_, i) => {
      const y = -h / 2 + 6 + i * (h * 0.6 / grains);
      const side = i % 2 ? 1 : -1;
      const filled = !half || i >= grains / 2;
      return (
        <g key={i}>
          <ellipse cx={side * 5} cy={y} rx={4} ry={6} transform={`rotate(${side * 28} ${side * 5} ${y})`} fill={filled ? WHEAT : p.paper} stroke={p.ink} strokeWidth={1.8} />
          {awn && <line x1={side * 7} y1={y - 5} x2={side * 14} y2={y - 16} {...ln(p, 1.4)} />}
        </g>
      );
    })}
  </g>
);

const Lantern = ({ p, cx = 0, cy = 0, s = 1, color = RED }: { p: SeasonPal; cx?: number; cy?: number; s?: number; color?: string }) => (
  <g transform={`translate(${cx},${cy}) scale(${s})`}>
    <rect x={-8} y={-31} width={16} height={7} rx={2} fill={p.ink} />
    <ellipse cx={0} cy={0} rx={22} ry={24} fill={color} stroke={p.ink} strokeWidth={2.2} />
    <line x1={-10} y1={-21} x2={-10} y2={21} stroke={p.ink} strokeWidth={1.4} opacity={0.45} />
    <line x1={10} y1={-21} x2={10} y2={21} stroke={p.ink} strokeWidth={1.4} opacity={0.45} />
    <rect x={-8} y={24} width={16} height={7} rx={2} fill={p.ink} />
    <line x1={0} y1={31} x2={0} y2={46} stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
  </g>
);

const Heart = ({ p, cx = 0, cy = 0, s = 20, fill }: { p: SeasonPal; cx?: number; cy?: number; s?: number; fill?: string }) => (
  <path transform={`translate(${cx},${cy})`} d={`M0,${s * 0.9} C${-s * 1.1},${-s * 0.1} ${-s * 0.6},${-s * 1.1} 0,${-s * 0.4} C${s * 0.6},${-s * 1.1} ${s * 1.1},${-s * 0.1} 0,${s * 0.9} Z`} fill={fill ?? PINK} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
);

const Petals = ({ p, cx = 0, cy = 0, n = 8, r = 4, len = 12, fill }: { p: SeasonPal; cx?: number; cy?: number; n?: number; r?: number; len?: number; fill?: string }) => (
  <g transform={`translate(${cx},${cy})`}>
    {Array.from({ length: n }, (_, i) => <ellipse key={i} cx={0} cy={-len / 2 - 2} rx={r} ry={len / 2} transform={`rotate(${(i * 360) / n})`} fill={fill ?? p.soft} stroke={p.ink} strokeWidth={1.6} />)}
    <circle cx={0} cy={0} r={r + 1} fill={GOLD} stroke={p.ink} strokeWidth={1.6} />
  </g>
);

const Moon = ({ p, cx = 0, cy = 0, r = 16, fill }: { p: SeasonPal; cx?: number; cy?: number; r?: number; fill?: string }) => (
  <path d={`M${cx},${cy - r} A${r},${r} 0 1 1 ${cx},${cy + r} A${r * 0.78},${r * 0.78} 0 1 0 ${cx},${cy - r} Z`} fill={fill ?? p.soft} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
);

const Ground = ({ p, y = 42, w = 92, dashed = false }: { p: SeasonPal; y?: number; w?: number; dashed?: boolean }) => (
  <line x1={-w / 2} y1={y} x2={w / 2} y2={y} {...ln(p, 2)} strokeDasharray={dashed ? '4 5' : undefined} />
);

const Bird = ({ p, cx = 0, cy = 0, s = 1 }: { p: SeasonPal; cx?: number; cy?: number; s?: number }) => (
  <path transform={`translate(${cx},${cy}) scale(${s})`} d="M-9,2 Q-4,-6 0,0 Q4,-6 9,2" {...ln(p, 1.8)} />
);

// ── 四十四枚意象 ────────────────────────────────────────────────────────
type Motif = (p: SeasonPal) => ReactElement;

const MOTIFS: Record<string, Motif> = {
  // 冬 · 年初
  小寒: (p) => (
    <g>
      <line x1={-36} y1={-32} x2={36} y2={-32} {...ln(p, 2.8)} />
      {[-22, 0, 22].map((x, i) => <path key={x} d={`M${x - 6},-32 L${x},${i === 1 ? 26 : 8} L${x + 6},-32 Z`} fill={p.soft} stroke={p.ink} strokeWidth={2} strokeLinejoin="round" />)}
      {[[-32, 30], [30, 26], [8, 40], [-10, 36]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={2.4} fill={p.accent} />)}
    </g>
  ),
  大寒: (p) => (
    <g>
      <Flake p={p} r={27} w={2.6} />
      <Flake p={p} cx={-38} cy={-30} r={7} w={1.5} />
      <Flake p={p} cx={36} cy={30} r={7} w={1.5} />
      <Ground p={p} y={48} w={70} dashed />
    </g>
  ),
  // 春
  立春: (p) => (
    <g>
      <path d="M-42,42 Q0,20 42,42 Z" fill={p.soft} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M0,40 C0,24 0,12 0,-8" {...ln(p, 2.6)} />
      <Leaf p={p} cx={-13} cy={-2} rot={-52} s={13} />
      <Leaf p={p} cx={13} cy={-16} rot={48} s={13} />
      <circle cx={34} cy={-36} r={8} fill={p.soft} stroke={p.ink} strokeWidth={2} />
    </g>
  ),
  雨水: (p) => (
    <g>
      <Cloud p={p} cy={-24} s={1.05} />
      {[[-22, 6], [0, 12], [22, 6], [-11, 30], [12, 32]].map(([x, y]) => <Drop key={`${x},${y}`} p={p} cx={x} cy={y} s={5.5} />)}
      <ellipse cx={0} cy={47} rx={27} ry={5} {...ln(p, 1.8)} />
    </g>
  ),
  惊蛰: (p) => (
    <g>
      <polygon points="8,-48 -14,-6 0,-6 -9,22 17,-14 3,-14" fill={GOLD} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <Ground p={p} y={42} />
      <ellipse cx={16} cy={33} rx={12} ry={8} fill={p.accent} stroke={p.ink} strokeWidth={2.2} />
      <circle cx={30} cy={31} r={4.5} fill={p.ink} />
      {[-6, 0, 6].map((dx) => <g key={dx}><line x1={16 + dx} y1={40} x2={14 + dx} y2={46} {...ln(p, 1.6)} /><line x1={16 + dx} y1={26} x2={14 + dx} y2={20} {...ln(p, 1.6)} /></g>)}
    </g>
  ),
  春分: (p) => (
    <g>
      <circle r={26} fill={p.paper} stroke={p.ink} strokeWidth={2.4} />
      <path d="M0,-26 A26,26 0 0 1 0,26 Z" fill={p.accent} stroke={p.ink} strokeWidth={2.4} strokeLinejoin="round" />
      <line x1={-46} y1={0} x2={46} y2={0} {...ln(p, 2)} />
      <Petals p={p} cx={-34} cy={32} n={5} r={3} len={7} />
    </g>
  ),
  清明: (p) => (
    <g>
      <path d="M-42,-44 C-12,-42 18,-34 42,-42" {...ln(p, 2.6)} />
      {[-30, -12, 8, 28].map((x, i) => (
        <g key={x}>
          <path d={`M${x},${-42 + i * 2} C${x - 6},${-20 + i * 3} ${x + 4},${4 + i * 4} ${x - 2},${26 + i * 3}`} {...ln(p, 1.6)} />
          {[0.35, 0.7].map((t) => <ellipse key={t} cx={x - 3} cy={-42 + (68 * t)} rx={2.4} ry={5} transform={`rotate(20 ${x - 3} ${-42 + 68 * t})`} fill={p.accent} />)}
        </g>
      ))}
      {[[26, 6], [36, 20], [30, 36]].map(([x, y]) => <line key={`${x},${y}`} x1={x} y1={y} x2={x - 4} y2={y + 9} {...ln(p, 1.5)} />)}
    </g>
  ),
  谷雨: (p) => (
    <g>
      {[[-30, -40], [-8, -46], [16, -42], [36, -36], [4, -22]].map(([x, y]) => <line key={`${x},${y}`} x1={x} y1={y} x2={x - 4} y2={y + 10} {...ln(p, 1.6)} />)}
      <Ground p={p} y={42} />
      {[-24, 0, 24].map((x) => (
        <g key={x}>
          <line x1={x} y1={42} x2={x} y2={12} {...ln(p, 2.2)} />
          <path d={`M${x},22 C${x - 12},20 ${x - 16},8 ${x - 12},2 C${x - 4},6 ${x - 2},14 ${x},22 Z`} fill={p.accent} stroke={p.ink} strokeWidth={1.8} strokeLinejoin="round" />
          <path d={`M${x},18 C${x + 12},16 ${x + 16},4 ${x + 12},-2 C${x + 4},2 ${x + 2},10 ${x},18 Z`} fill={p.accent} stroke={p.ink} strokeWidth={1.8} strokeLinejoin="round" />
        </g>
      ))}
    </g>
  ),
  // 夏
  立夏: (p) => (
    <g>
      <Sun p={p} cy={-14} r={18} />
      <Leaf p={p} cx={0} cy={36} rot={-90} s={15} fill={GREEN} />
    </g>
  ),
  小满: (p) => (
    <g>
      <Wheat p={p} cy={-4} h={60} grains={6} half />
      <path d="M-40,44 Q-30,38 -20,44 T0,44 T20,44 T40,44" {...ln(p, 2)} />
    </g>
  ),
  芒种: (p) => (
    <g>
      <Wheat p={p} cx={-14} cy={-2} h={58} grains={6} tilt={-10} awn />
      <Wheat p={p} cx={12} cy={2} h={54} grains={5} tilt={8} awn />
      <path d="M34,4 A22,22 0 0 1 22,46" {...ln(p, 3.2)} />
      <line x1={36} y1={0} x2={44} y2={-12} {...ln(p, 3.2)} />
    </g>
  ),
  夏至: (p) => (
    <g>
      <Sun p={p} cy={-16} r={20} rays={12} len={10} />
      <Ground p={p} y={38} />
      <line x1={0} y1={38} x2={0} y2={24} {...ln(p, 2.6)} />
      <circle cx={0} cy={16} r={9} fill={GREEN} stroke={p.ink} strokeWidth={2} />
      <ellipse cx={5} cy={40} rx={8} ry={2} fill={p.ink} opacity={0.25} />
    </g>
  ),
  小暑: (p) => (
    <g>
      <Sun p={p} cx={-20} cy={-22} r={13} rays={8} len={6} gap={5} />
      {[-4, 10, 24].map((y) => <path key={y} d={`M12,${y - 30} q6,-5 12,0 t12,0 t12,0`} {...ln(p, 1.8)} />)}
      <path d="M0,44 L-22,8 A32,32 0 0 1 42,8 Z" fill={p.soft} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      {[-12, -2, 8, 18, 28].map((x) => <line key={x} x1={0} y1={44} x2={x + 10} y2={x > 20 ? 6 : -4 + Math.abs(x) * 0.1} {...ln(p, 1.2)} />)}
    </g>
  ),
  大暑: (p) => (
    <g>
      <Sun p={p} cy={-24} r={15} rays={12} len={9} gap={5} />
      <path d="M-36,16 A36,36 0 0 0 36,16 Z" fill={MELON} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M-36,16 A36,36 0 0 0 36,16" {...ln(p, 5)} stroke={GREEN} />
      {[[-14, 30], [0, 38], [14, 30], [-4, 24], [8, 22]].map(([x, y]) => <ellipse key={`${x},${y}`} cx={x} cy={y} rx={1.8} ry={3} fill={p.ink} />)}
    </g>
  ),
  // 秋
  立秋: (p) => (
    <g>
      <path d="M-30,42 C-10,30 -22,10 -6,6" {...ln(p, 1.8)} strokeDasharray="3 4" />
      <Leaf p={p} cx={8} cy={-8} rot={35} s={22} />
      <path d="M-44,-20 q8,-4 16,0" {...ln(p, 1.6)} />
      <path d="M-46,-8 q8,-4 16,0" {...ln(p, 1.6)} />
    </g>
  ),
  处暑: (p) => (
    <g>
      <path d="M-24,14 A24,24 0 0 1 24,14 Z" fill={p.soft} stroke={p.ink} strokeWidth={2.4} strokeLinejoin="round" />
      {[-60, -30, 0, 30, 60].map((deg) => { const t = ((deg - 90) * Math.PI) / 180; return <line key={deg} x1={Math.cos(t) * 30} y1={14 + Math.sin(t) * 30} x2={Math.cos(t) * 38} y2={14 + Math.sin(t) * 38} {...ln(p)} />; })}
      <Ground p={p} y={14} w={100} />
      <Cloud p={p} cx={28} cy={-34} s={0.7} />
      <Bird p={p} cx={-30} cy={-34} s={0.9} />
      <Bird p={p} cx={-14} cy={-44} s={0.7} />
      <Ground p={p} y={34} w={60} dashed />
    </g>
  ),
  白露: (p) => (
    <g>
      <Ground p={p} y={46} w={80} />
      {[[-28, -34, 12], [-8, -44, -8], [14, -38, 6], [32, -26, -14]].map(([x, top, bend]) => (
        <path key={x} d={`M${x},46 C${x + bend * 0.3},${top + 50} ${x + bend},${top + 24} ${x + bend * 0.6},${top} C${x + bend * 0.2},${top + 30} ${x - 6},${top + 60} ${x},46 Z`} fill={p.accent} stroke={p.ink} strokeWidth={1.8} strokeLinejoin="round" />
      ))}
      {[[-21, -30], [-13, -40], [18, -34], [24, -22], [-2, 6]].map(([x, y]) => (
        <g key={`${x},${y}`}>
          <circle cx={x} cy={y} r={4.6} fill={p.paper} stroke={p.ink} strokeWidth={1.8} />
          <circle cx={x - 1.5} cy={y - 1.5} r={1.2} fill={p.ink} opacity={0.5} />
        </g>
      ))}
    </g>
  ),
  秋分: (p) => (
    <g>
      <circle r={26} fill={p.paper} stroke={p.ink} strokeWidth={2.4} />
      <path d="M0,26 A26,26 0 0 1 0,-26 Z" fill={p.accent} stroke={p.ink} strokeWidth={2.4} strokeLinejoin="round" />
      <line x1={-46} y1={0} x2={46} y2={0} {...ln(p, 2)} />
      <Moon p={p} cx={36} cy={-34} r={7} />
      <Leaf p={p} cx={-34} cy={32} rot={-30} s={9} />
    </g>
  ),
  寒露: (p) => (
    <g>
      {[[-18, -6], [0, -22], [16, -2]].map(([x, top]) => (
        <g key={x}>
          <line x1={x} y1={46} x2={x} y2={top + 12} {...ln(p, 2.2)} />
          <ellipse cx={x} cy={top} rx={3.6} ry={11} fill={p.accent} stroke={p.ink} strokeWidth={1.8} />
        </g>
      ))}
      <Drop p={p} cx={32} cy={22} s={7} fill={p.paper} />
      {[[-40, 30], [-34, 40], [40, 42]].map(([x, y]) => <line key={`${x},${y}`} x1={x - 3} y1={y} x2={x + 3} y2={y} {...ln(p, 1.5)} />)}
    </g>
  ),
  霜降: (p) => (
    <g>
      <Leaf p={p} rot={-22} s={28} />
      <Flake p={p} cx={-32} cy={-26} r={6} w={1.5} />
      <Flake p={p} cx={32} cy={-16} r={5} w={1.5} />
      <Flake p={p} cx={26} cy={32} r={6} w={1.5} />
      <Flake p={p} cx={-28} cy={30} r={5} w={1.5} />
    </g>
  ),
  // 冬 · 年末
  立冬: (p) => (
    <g>
      <Ground p={p} y={44} />
      <path d="M0,44 L0,-2" {...ln(p, 3)} />
      {['M0,12 L-22,-12', 'M0,-2 L18,-26', 'M0,-6 L-8,-36', 'M-22,-12 L-30,-28', 'M18,-26 L30,-34', 'M-8,-36 L-14,-46'].map((d) => <path key={d} d={d} {...ln(p, 2.4)} />)}
      <Flake p={p} cx={36} cy={-40} r={6} w={1.5} />
    </g>
  ),
  小雪: (p) => (
    <g>
      <rect x={-22} y={2} width={44} height={32} fill={p.paper} stroke={p.ink} strokeWidth={2.2} />
      <polygon points="-32,2 0,-28 32,2" fill={p.soft} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M-30,0 L0,-28 L30,0" {...ln(p, 4)} stroke={p.paper} />
      <rect x={-6} y={18} width={12} height={16} fill={p.ink} />
      <rect x={10} y={8} width={8} height={8} fill={p.soft} stroke={p.ink} strokeWidth={1.4} />
      <Flake p={p} cx={-38} cy={-38} r={5} w={1.4} />
      <Flake p={p} cx={40} cy={-30} r={5} w={1.4} />
      <Flake p={p} cx={-42} cy={22} r={4} w={1.4} />
      <Flake p={p} cx={42} cy={30} r={4} w={1.4} />
    </g>
  ),
  大雪: (p) => (
    <g>
      <path d="M-48,46 Q0,34 48,46" fill={p.paper} stroke={p.ink} strokeWidth={2} />
      <polygon points="-26,42 0,6 26,42" fill={GREEN} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <polygon points="-20,20 0,-12 20,20" fill={GREEN} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <polygon points="-14,0 0,-30 14,0" fill={GREEN} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M-24,40 L0,8" {...ln(p, 3.6)} stroke={p.paper} />
      <path d="M-18,18 L0,-10" {...ln(p, 3.6)} stroke={p.paper} />
      <path d="M-12,-2 L0,-28" {...ln(p, 3.6)} stroke={p.paper} />
      <Flake p={p} cx={-38} cy={-30} r={9} w={2} />
      <Flake p={p} cx={38} cy={-34} r={9} w={2} />
    </g>
  ),
  冬至: (p) => (
    <g>
      <Moon p={p} cx={-24} cy={-26} r={15} />
      <Star p={p} cx={22} cy={-36} r={5} fill={p.soft} w={1.2} />
      <Star p={p} cx={38} cy={-18} r={3.5} fill={p.soft} w={1.2} />
      <Star p={p} cx={10} cy={-14} r={3} fill={p.soft} w={1.2} />
      <path d="M-30,18 A30,30 0 0 0 30,18 Z" fill={p.paper} stroke={p.ink} strokeWidth={2.4} strokeLinejoin="round" />
      <line x1={-30} y1={18} x2={30} y2={18} {...ln(p, 2.4)} />
      {[[-12, 12], [2, 14], [15, 10]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={6} fill={p.paper} stroke={p.ink} strokeWidth={1.8} />)}
      <path d="M-6,-2 q3,-6 0,-12" {...ln(p, 1.4)} opacity={0.6} />
      <path d="M8,-4 q3,-6 0,-12" {...ln(p, 1.4)} opacity={0.6} />
    </g>
  ),
  // 节日
  元旦: (p) => (
    <g>
      <path d="M-24,4 A24,24 0 0 1 24,4 Z" fill={p.soft} stroke={p.ink} strokeWidth={2.4} strokeLinejoin="round" />
      {[-60, -30, 0, 30, 60].map((deg) => { const t = ((deg - 90) * Math.PI) / 180; return <line key={deg} x1={Math.cos(t) * 30} y1={4 + Math.sin(t) * 30} x2={Math.cos(t) * 38} y2={4 + Math.sin(t) * 38} {...ln(p)} />; })}
      <Ground p={p} y={4} w={100} />
      <rect x={-18} y={14} width={36} height={32} rx={3} fill={p.paper} stroke={p.ink} strokeWidth={2.2} />
      <rect x={-18} y={14} width={36} height={8} rx={3} fill={p.accent} stroke={p.ink} strokeWidth={2.2} />
      <text x={0} y={42} textAnchor="middle" fontFamily="Georgia, serif" fontSize={19} fontWeight={700} fill={p.ink}>1</text>
    </g>
  ),
  情人节: (p) => (
    <g>
      <Heart p={p} cx={-10} cy={6} s={22} />
      <Heart p={p} cx={16} cy={-8} s={15} fill={p.soft} />
    </g>
  ),
  妇女节: (p) => (
    <g>
      <line x1={0} y1={2} x2={0} y2={46} {...ln(p, 2.6)} />
      <Leaf p={p} cx={-12} cy={30} rot={-40} s={11} fill={GREEN} />
      <path d="M-18,-4 C-18,-30 -6,-36 0,-22 C6,-36 18,-30 18,-4 Q0,8 -18,-4 Z" fill={PINK} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <line x1={0} y1={-22} x2={0} y2={2} {...ln(p, 1.4)} opacity={0.5} />
    </g>
  ),
  劳动节: (p) => (
    <g>
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={-4} y={-28} width={8} height={9} rx={1.5} transform={`rotate(${i * 45})`} fill={p.accent} stroke={p.ink} strokeWidth={1.8} />)}
      <circle r={20} fill={p.soft} stroke={p.ink} strokeWidth={2.4} />
      <circle r={7} fill={p.paper} stroke={p.ink} strokeWidth={2} />
      <line x1={14} y1={14} x2={40} y2={40} {...ln(p, 6)} />
      <line x1={14} y1={14} x2={40} y2={40} {...ln(p, 2.6)} stroke={GOLD} />
      <path d="M32,32 A10,10 0 1 1 46,46" {...ln(p, 2.4)} />
    </g>
  ),
  青年节: (p) => (
    <g>
      <path d="M-46,32 C-30,28 -32,14 -18,18" {...ln(p, 1.8)} strokeDasharray="3 4" />
      <polygon points="-40,6 44,-32 8,42 2,12" fill={p.paper} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <polygon points="2,12 44,-32 8,42" fill={p.soft} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
    </g>
  ),
  儿童节: (p) => (
    <g>
      <line x1={0} y1={0} x2={0} y2={48} {...ln(p, 2.6)} />
      {[0, 90, 180, 270].map((deg, i) => <polygon key={deg} points="0,0 -30,-30 -30,0" transform={`rotate(${deg})`} fill={i % 2 ? p.accent : p.soft} stroke={p.ink} strokeWidth={2} strokeLinejoin="round" />)}
      <circle r={4} fill={GOLD} stroke={p.ink} strokeWidth={1.8} />
    </g>
  ),
  教师节: (p) => (
    <g>
      <rect x={-6} y={-40} width={12} height={32} rx={2} fill={p.paper} stroke={p.ink} strokeWidth={2} />
      <path d="M0,-58 C4,-52 7,-48 7,-44 A7,7 0 1 1 -7,-44 C-7,-48 -4,-52 0,-58 Z" fill={GOLD} stroke={p.ink} strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M-38,32 L-38,-4 Q-19,-12 0,-4 Q19,-12 38,-4 L38,32 Q19,24 0,32 Q-19,24 -38,32 Z" fill={p.paper} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <line x1={0} y1={-4} x2={0} y2={32} {...ln(p, 1.8)} />
      {[6, 14, 22].map((y) => <g key={y}><line x1={-30} y1={y} x2={-8} y2={y - 2} {...ln(p, 1.2)} opacity={0.5} /><line x1={8} y1={y - 2} x2={30} y2={y} {...ln(p, 1.2)} opacity={0.5} /></g>)}
    </g>
  ),
  国庆节: (p) => (
    <g>
      <Star p={p} cx={-16} cy={-4} r={23} w={2.2} />
      <Star p={p} cx={18} cy={-30} r={7} w={1.6} />
      <Star p={p} cx={32} cy={-12} r={7} w={1.6} />
      <Star p={p} cx={32} cy={10} r={7} w={1.6} />
      <Star p={p} cx={18} cy={26} r={7} w={1.6} />
    </g>
  ),
  万圣夜: (p) => (
    <g>
      <rect x={-5} y={-40} width={10} height={12} rx={2} fill={GREEN} stroke={p.ink} strokeWidth={2} />
      <ellipse cx={-14} cy={4} rx={20} ry={28} fill={ORANGE} stroke={p.ink} strokeWidth={2.2} />
      <ellipse cx={14} cy={4} rx={20} ry={28} fill={ORANGE} stroke={p.ink} strokeWidth={2.2} />
      <ellipse cx={0} cy={4} rx={18} ry={30} fill={ORANGE} stroke={p.ink} strokeWidth={2.2} />
      <polygon points="-16,-8 -6,-2 -18,2" fill={p.ink} />
      <polygon points="16,-8 6,-2 18,2" fill={p.ink} />
      <polygon points="-18,14 -10,20 -4,14 0,20 4,14 10,20 18,14 12,24 -12,24" fill={p.ink} />
    </g>
  ),
  双十一: (p) => (
    <g>
      <path d="M-16,-12 A16,16 0 0 1 16,-12" {...ln(p, 2.6)} />
      <polygon points="-28,-10 -22,44 22,44 28,-10" fill={p.soft} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <text x={0} y={30} textAnchor="middle" fontFamily="Georgia, serif" fontSize={26} fontWeight={700} fill={p.ink}>11</text>
    </g>
  ),
  平安夜: (p) => (
    <g>
      <Star p={p} cx={36} cy={-38} r={6} w={1.4} />
      <path d="M0,-14 C-22,-30 -42,-4 -30,20 C-22,38 -8,42 0,34 C8,42 22,38 30,20 C42,-4 22,-30 0,-14 Z" fill={MELON} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <path d="M0,-14 C2,-24 4,-30 8,-36" {...ln(p, 2.4)} />
      <Leaf p={p} cx={12} cy={-28} rot={50} s={8} fill={GREEN} />
    </g>
  ),
  圣诞节: (p) => (
    <g>
      <rect x={-6} y={34} width={12} height={12} fill={p.ink} />
      <polygon points="-32,36 0,-4 32,36" fill={GREEN} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <polygon points="-24,12 0,-22 24,12" fill={GREEN} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <polygon points="-16,-10 0,-36 16,-10" fill={GREEN} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <Star p={p} cx={0} cy={-40} r={7} w={1.6} />
      {[[-12, 24], [10, 28], [-4, 2], [12, 6]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={3.4} fill={RED} stroke={p.ink} strokeWidth={1.4} />)}
    </g>
  ),
  跨年夜: (p) => (
    <g>
      <circle r={27} fill={p.paper} stroke={p.ink} strokeWidth={2.4} />
      {Array.from({ length: 12 }, (_, i) => { const t = (i * Math.PI) / 6; return <line key={i} x1={Math.cos(t) * 22} y1={Math.sin(t) * 22} x2={Math.cos(t) * 26} y2={Math.sin(t) * 26} {...ln(p, i % 3 ? 1.4 : 2.4)} />; })}
      <line x1={0} y1={0} x2={0} y2={-18} {...ln(p, 2.8)} />
      <line x1={0} y1={0} x2={-3} y2={-13} {...ln(p, 2.8)} />
      <circle r={2.4} fill={p.ink} />
      {[[-40, -36], [42, -30], [44, 34]].map(([x, y]) => <g key={`${x},${y}`}>{[0, 60, 120, 180, 240, 300].map((deg) => { const t = (deg * Math.PI) / 180; return <line key={deg} x1={x + Math.cos(t) * 3} y1={y + Math.sin(t) * 3} x2={x + Math.cos(t) * 8} y2={y + Math.sin(t) * 8} {...ln(p, 1.5)} stroke={GOLD} />; })}</g>)}
    </g>
  ),
  除夕: (p) => (
    <g>
      <Lantern p={p} cx={-18} cy={-4} s={0.82} />
      <Lantern p={p} cx={20} cy={6} s={0.82} />
      <Star p={p} cx={38} cy={-40} r={5} w={1.2} />
      <Star p={p} cx={-40} cy={-34} r={4} w={1.2} />
    </g>
  ),
  春节: (p) => (
    <g>
      <Lantern p={p} cy={-2} s={1.15} />
      <text x={0} y={5} textAnchor="middle" fontFamily="'Songti SC', 'STSong', 'Noto Serif SC', serif" fontSize={20} fontWeight={700} fill={GOLD}>福</text>
    </g>
  ),
  元宵: (p) => (
    <g>
      <circle cx={22} cy={-26} r={15} fill={p.soft} stroke={p.ink} strokeWidth={2.2} />
      <rect x={-22} y={-14} width={16} height={6} rx={2} fill={p.ink} />
      <circle cx={-14} cy={12} r={20} fill={GOLD} stroke={p.ink} strokeWidth={2.2} />
      <line x1={-24} y1={-2} x2={-24} y2={26} stroke={p.ink} strokeWidth={1.4} opacity={0.45} />
      <line x1={-4} y1={-2} x2={-4} y2={26} stroke={p.ink} strokeWidth={1.4} opacity={0.45} />
      <rect x={-22} y={30} width={16} height={6} rx={2} fill={p.ink} />
      <line x1={-14} y1={36} x2={-14} y2={48} stroke={RED} strokeWidth={3} strokeLinecap="round" />
    </g>
  ),
  端午: (p) => (
    <g>
      <Leaf p={p} cx={34} cy={-14} rot={62} s={13} fill={GREEN} />
      <polygon points="-2,-36 -36,26 32,26" fill={GREEN} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <line x1={-22} y1={0} x2={18} y2={0} {...ln(p, 2.4)} stroke={RED} />
      <line x1={-2} y1={-36} x2={-2} y2={26} {...ln(p, 2.4)} stroke={RED} />
    </g>
  ),
  七夕: (p) => (
    <g>
      <path d="M-42,30 Q0,-14 42,30 L32,30 Q0,2 -32,30 Z" fill={p.soft} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      {[-24, -12, 0, 12, 24].map((x) => <line key={x} x1={x} y1={x === 0 ? 0 : x === -12 || x === 12 ? 2.5 : 8} x2={x} y2={x === 0 ? -8 : x === -12 || x === 12 ? -5 : 1} {...ln(p, 1.6)} />)}
      <Star p={p} cx={-30} cy={-24} r={8} fill={p.soft} w={1.8} />
      <Star p={p} cx={30} cy={-24} r={8} fill={p.soft} w={1.8} />
      <Bird p={p} cx={-6} cy={-40} s={0.8} />
      <Bird p={p} cx={12} cy={-46} s={0.6} />
      <Ground p={p} y={44} w={70} dashed />
    </g>
  ),
  中秋: (p) => (
    <g>
      <circle cx={0} cy={-14} r={26} fill={GOLD} stroke={p.ink} strokeWidth={2.4} />
      <circle cx={-8} cy={-20} r={4} fill={p.ink} opacity={0.12} />
      <circle cx={8} cy={-8} r={6} fill={p.ink} opacity={0.12} />
      {Array.from({ length: 12 }, (_, i) => { const t = (i * Math.PI) / 6; return <circle key={i} cx={Math.cos(t) * 14} cy={32 + Math.sin(t) * 14} r={3.2} fill={ORANGE} stroke={p.ink} strokeWidth={1.4} />; })}
      <circle cx={0} cy={32} r={13} fill={ORANGE} stroke={p.ink} strokeWidth={2} />
      <circle cx={0} cy={32} r={6} {...ln(p, 1.4)} />
    </g>
  ),
  重阳: (p) => (
    <g>
      <polyline points="-48,44 -24,4 -4,30 12,-6 46,44" fill={p.soft} stroke={p.ink} strokeWidth={2.2} strokeLinejoin="round" />
      <Petals p={p} cx={-22} cy={-26} n={12} r={3.2} len={13} fill={GOLD} />
    </g>
  ),
};

// ── 卡面 ───────────────────────────────────────────────────────────────

export function seasonCardEn(mark: SeasonMark): string {
  return (mark.kind === 'term' ? SOLAR_TERM_EN[mark.name as SolarTermName] : FESTIVAL_EN[mark.name]) ?? '';
}

export function SeasonCardSVG({ mark, collected, width = '100%', className }: {
  mark: SeasonMark;
  collected: boolean;
  width?: number | string;
  className?: string;
}) {
  const season = seasonOfDate(mark.date);
  const p = SEASON_PALETTES[season];
  const isTerm = mark.kind === 'term';
  const en = seasonCardEn(mark);
  const numeral = isTerm ? ROMAN[termOrdinal(mark.index) - 1] : '✦';
  const dateLabel = `${Number(mark.date.slice(5, 7))}.${Number(mark.date.slice(8, 10))}`;
  const motif = MOTIFS[mark.name] ?? ((pp: SeasonPal) => <Sun p={pp} />);
  const gid = `sc-${mark.key}`;
  const chars = Array.from(mark.name).length;
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={width}
      className={className}
      style={{ display: 'block', height: 'auto', filter: collected ? undefined : 'grayscale(1)', opacity: collected ? 1 : 0.5 }}
      role="img"
      aria-label={`${mark.name} · ${en}`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.bgTop} />
          <stop offset="1" stopColor={p.bgBottom} />
        </linearGradient>
      </defs>
      <rect x={3} y={3} width={VB_W - 6} height={VB_H - 6} rx={12} fill={`url(#${gid})`} stroke={p.ink} strokeWidth={1.6} />
      <rect x={11} y={11} width={VB_W - 22} height={VB_H - 22} rx={7} fill="none" stroke={p.ink} strokeWidth={0.8} opacity={0.55} strokeDasharray={collected ? undefined : '3 3'} />
      {([[18, 18, 1, 1], [VB_W - 18, 18, -1, 1], [18, VB_H - 18, 1, -1], [VB_W - 18, VB_H - 18, -1, -1]] as const).map(([x, y, sx, sy], i) => (
        <path key={i} d={`M${x},${y + 9 * sy} L${x},${y} L${x + 9 * sx},${y}`} fill="none" stroke={p.accent} strokeWidth={2.2} strokeLinecap="round" />
      ))}

      {/* 顶：罗马数字（节气按传统序 立春 = I）/ 节日一枚星 */}
      <line x1={50} y1={34} x2={78} y2={34} stroke={p.ink} strokeWidth={0.8} opacity={0.5} />
      <line x1={122} y1={34} x2={150} y2={34} stroke={p.ink} strokeWidth={0.8} opacity={0.5} />
      <text x={100} y={39} textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize={isTerm ? 15 : 17} fontWeight={700} fill={p.ink} letterSpacing={1}>{numeral}</text>
      <text x={100} y={54} textAnchor="middle" fontFamily="Georgia, serif" fontSize={7} letterSpacing={1.6} fill={p.ink} opacity={0.65}>{isTerm ? 'SOLAR TERM' : 'FESTIVAL'} · {dateLabel}</text>

      {/* 中：意象 */}
      <circle cx={100} cy={152} r={60} fill={p.soft} opacity={0.32} />
      <circle cx={100} cy={152} r={66} fill="none" stroke={p.accent} strokeWidth={0.8} strokeDasharray="2 4" opacity={0.6} />
      <g transform="translate(100,152)">{motif(p)}</g>

      {/* 底：名字 + 英文 */}
      <line x1={52} y1={240} x2={148} y2={240} stroke={p.ink} strokeWidth={0.7} opacity={0.5} />
      <text x={100} y={268} textAnchor="middle" fontFamily="'Songti SC', 'STSong', 'Noto Serif SC', serif" fontSize={chars > 2 ? 21 : 24} fontWeight={700} fill={p.ink} letterSpacing={chars > 2 ? 2 : 5}>{mark.name}</text>
      <text x={100} y={284} textAnchor="middle" fontFamily="Georgia, serif" fontSize={7.5} fill={p.ink} opacity={0.6} letterSpacing={1.4}>{en.toUpperCase()}</text>

      {/* 收录朱印 */}
      {collected && (
        <g transform="translate(157,28)">
          <rect x={0} y={0} width={19} height={19} rx={2} fill="#c8322a" opacity={0.92} />
          <text x={9.5} y={14} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#fff5ee" fontFamily="'Songti SC', 'STSong', serif">收</text>
        </g>
      )}
    </svg>
  );
}
