/**
 * 塔罗程序化卡面的频道分身（PRD_V2.6 §5）。
 *
 * 【为什么需要这个文件】
 * 22 张大阿卡纳有三套实拍图（`tarotArtUrl`），但**小阿卡纳 56 张一张图都没有**，
 * 外加实拍图加载失败时也会退到程序化卡面。而那张程序化卡面只有一版——
 * 深紫金框的通用款。于是红频道的用户随手一抽小牌，看到的就是一张
 * 完全不属于这个世界的卡（用户原话：「塔罗牌完全没风格化，用的是通用版」）。
 *
 * 本文件补两个分身：
 *   · P5Face —— P5R 语言：纸面 / 猩红 / 黑描边 / 半调网点 / 撕边多边形；
 *   · P4Face —— 浅黄基调（用户定的「改成浅黄色」）+ P4 的黑框套色块 + 四角星。
 * 蓝/粉沿用现成的通用卡（PRD §5：「蓝/粉复用现成 P3R 版本，不动」）。
 *
 * 两张脸共用 TarotCardSVG 的 200×320 viewBox 与外层容器，
 * 所以正/逆位翻转、选中外发光、角标都由宿主统一处理，这里只画脸。
 */
import { P5R, P5_FONT, starPts } from '@/components/p5r/kit';

export interface TarotFaceProps {
  cardId: string;
  name: string;
  nameEn: string;
  /** 顶部编号/字母（大阿卡纳是罗马数字，宫廷牌是 P/N/Q/K） */
  rankLabel: string;
  isMajor: boolean;
  /** 中心意象字符 */
  centerSymbol: string;
  /** 花色符号（小阿卡纳才有） */
  suitSymbol: string;
  /** 牌本身的强调色（各频道按需降饱和或忽略） */
  accent: string;
}

const VB_W = 200;
const VB_H = 320;

// ── 撕边多边形（SVG 版）─────────────────────────────────────────────────────
/**
 * kit 里的 roughQuad 产出的是 CSS clip-path（带 calc/百分比），SVG polygon 吃不下。
 * 这里按同样的思路重做一版**纯数值点集**：八个点（四角 + 四边中点）各自向内错动。
 * 同 seed 恒定形状——否则同一张牌每次重渲染都在抖，像在呼吸。
 */
const mulberry = (seed: number) => {
  let a = (Math.round(seed * 1000) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const roughRectPts = (seed: number, inset: number, jag: number): string => {
  const r = mulberry(seed);
  const j = () => r() * jag;
  const x0 = inset, y0 = inset, x1 = VB_W - inset, y1 = VB_H - inset;
  const p: Array<[number, number]> = [
    [x0 + j(), y0 + j()],
    [(x0 + x1) / 2, y0 + j() * 0.6],
    [x1 - j(), y0 + j()],
    [x1 - j() * 0.6, (y0 + y1) / 2],
    [x1 - j(), y1 - j()],
    [(x0 + x1) / 2, y1 - j() * 0.6],
    [x0 + j(), y1 - j()],
    [x0 + j() * 0.6, (y0 + y1) / 2],
  ];
  return p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
};

/** 撕边横条（牌名黑幅 / 顶部红条用） */
const roughBarPts = (seed: number, x: number, y: number, w: number, h: number, jag = 2.4): string => {
  const r = mulberry(seed);
  const j = () => r() * jag;
  return [
    [x + j(), y + j()],
    [x + w - j(), y + j() * 0.7],
    [x + w - j() * 0.7, y + h - j()],
    [x + j(), y + h - j() * 0.6],
  ].map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
};

/** cardId → 稳定 seed（同一张牌的轮廓永远一样） */
const seedOf = (cardId: string): number => {
  let h = 0;
  for (let i = 0; i < cardId.length; i++) h = (h * 31 + cardId.charCodeAt(i)) >>> 0;
  return (h % 9973) / 7;
};

/**
 * 宫廷牌（P/N/Q/K）：中心画的是字母而不是花色符，所以角上那枚花色符才有信息量。
 * 数字牌的中心本来就是花色符，角上再摆就是同一个符号刷三遍。
 */
const isCourt = (p: TarotFaceProps): boolean => !p.isMajor && /^[PNQK]$/.test(p.rankLabel);

// ── P5R 卡面 ────────────────────────────────────────────────────────────────
/**
 * 纸面 + 黑撕边 + 猩红。三层同形不同 seed 叠出「不等宽黑框」——
 * 与 P5Panel 的做法同源，只是搬进 SVG 坐标系。
 */
export function P5Face(p: TarotFaceProps) {
  const s = seedOf(p.cardId);
  const cx = VB_W / 2;
  const cy = VB_H / 2 - 12;
  const dotsId = `p5-dots-${p.cardId}`;
  const clipId = `p5-clip-${p.cardId}`;

  return (
    <>
      <defs>
        {/* 半调网点：P5R 的招牌肌理，压在纸面下半部 */}
        <pattern id={dotsId} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.6" cy="1.6" r="1.35" fill={P5R.ink} opacity="0.13" />
        </pattern>
        <clipPath id={clipId}>
          <polygon points={roughRectPts(s + 1, 5, 5)} />
        </clipPath>
      </defs>

      {/* 硬影 → 黑底板 → 纸面（三层同形不同 seed = 不等宽黑框） */}
      <polygon points={roughRectPts(s + 3, 0, 6)} fill={P5R.redDeep} transform="translate(4,5)" />
      <polygon points={roughRectPts(s, 0, 6)} fill={P5R.ink} />
      <polygon points={roughRectPts(s + 1, 5, 5)} fill={P5R.paper} />

      {/* 网点只铺下半张，上半留白给星 */}
      <g clipPath={`url(#${clipId})`}>
        <rect x="0" y={VB_H * 0.42} width={VB_W} height={VB_H * 0.58} fill={`url(#${dotsId})`} />
        {/* 背后斜插的红块（撕纸拼贴感） */}
        <polygon points={`0,${VB_H - 96} ${VB_W},${VB_H - 128} ${VB_W},${VB_H - 108} 0,${VB_H - 74}`} fill={P5R.red} opacity="0.9" />
      </g>

      {/* 中心：黑 → 红 → 纸 三环星（同 P5RingStar 的叠法，尖角处自然更厚） */}
      <polygon points={starPts(cx, cy, 74, -90 - 7)} fill={P5R.ink} />
      <polygon points={starPts(cx, cy, 60, -90 - 7)} fill={P5R.red} />
      <polygon points={starPts(cx, cy, 42, -90 - 7)} fill={P5R.paper} />
      <text
        x={cx}
        y={cy + (p.isMajor ? 15 : 13)}
        textAnchor="middle"
        fontSize={p.isMajor ? 40 : 34}
        fontFamily="Georgia, 'Songti SC', serif"
        fontWeight="700"
        fill={P5R.ink}
      >
        {p.centerSymbol}
      </text>

      {/* 顶部编号：黑撕边小条 + 纸色字 */}
      <g transform="rotate(-2.2 34 30)">
        <polygon points={roughBarPts(s + 5, 12, 16, p.rankLabel.length > 3 ? 62 : 46, 26)} fill={P5R.ink} />
        <text
          x={12 + (p.rankLabel.length > 3 ? 31 : 23)}
          y="34"
          textAnchor="middle"
          fontFamily={P5_FONT}
          fontSize={p.rankLabel.length > 3 ? 14 : 17}
          fontWeight="900"
          fill={P5R.paper}
        >
          {p.rankLabel}
        </text>
      </g>

      {/* 右上小红星 */}
      <polygon points={starPts(VB_W - 26, 28, 12, -90 + 14)} fill={P5R.red} />

      {/* 花色符只给宫廷牌画一枚：数字牌的中心意象**本来就是花色符**，
          再在角上摆两枚就成了同一个三角形出现三次 */}
      {isCourt(p) && p.suitSymbol && (
        <text x="26" y="62" fontSize="17" fill={P5R.grey} fontFamily="Georgia, serif">{p.suitSymbol}</text>
      )}

      {/* 牌名：黑撕边横幅压在下方，纸色黑体字 */}
      <g transform="rotate(-1.4 100 262)">
        <polygon points={roughBarPts(s + 9, 16, 244, VB_W - 32, 34)} fill={P5R.red} transform="translate(3,4)" />
        <polygon points={roughBarPts(s + 8, 16, 244, VB_W - 32, 34)} fill={P5R.ink} />
        <text
          x={VB_W / 2}
          y="267"
          textAnchor="middle"
          fontFamily={P5_FONT}
          fontSize="19"
          fontWeight="900"
          fill={P5R.paper}
          letterSpacing="1"
        >
          {p.name}
        </text>
      </g>
      <text
        x={VB_W / 2}
        y="296"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="7.5"
        fontWeight="700"
        fill={P5R.ink}
        letterSpacing="2"
      >
        {p.nameEn.toUpperCase()}
      </text>
    </>
  );
}

// ── P4 卡面 ─────────────────────────────────────────────────────────────────
/** 浅黄纸（用户口径「P4 的塔罗牌改成浅黄色」）——比 P4 舞台的正黄退两档，卡面才立得住 */
const P4_FACE_LIGHT = '#fff3c4';
const P4_INK = '#131313';
const P4_YELLOW = '#ffd900';
const P4_ORANGE = '#f9a11b';

/** P4 的四角星路径（与卡背 / p4Kit 同一形状语言：四条边带大弧度） */
const p4Star = (cx: number, cy: number, r: number) =>
  `M ${cx} ${cy - r} C ${cx + r * 0.2} ${cy - r * 0.27}, ${cx + r * 0.27} ${cy - r * 0.2}, ${cx + r} ${cy}
   C ${cx + r * 0.27} ${cy + r * 0.2}, ${cx + r * 0.2} ${cy + r * 0.27}, ${cx} ${cy + r}
   C ${cx - r * 0.2} ${cy + r * 0.27}, ${cx - r * 0.27} ${cy + r * 0.2}, ${cx - r} ${cy}
   C ${cx - r * 0.27} ${cy - r * 0.2}, ${cx - r * 0.2} ${cy - r * 0.27}, ${cx} ${cy - r} Z`;

/**
 * P4：全实心块面（与卡背同口径——不要描边线条，一律纯色块）。
 * 黑底板 → 浅黄卡面 → 黑内框 → 浅黄内面，中心黄靶心托住意象。
 */
export function P4Face(p: TarotFaceProps) {
  const cx = VB_W / 2;
  const cy = VB_H / 2 - 8;

  return (
    <>
      <rect x="0" y="0" width={VB_W} height={VB_H} rx="16" fill={P4_INK} />
      <rect x="4" y="4" width={VB_W - 8} height={VB_H - 8} rx="13" fill={P4_FACE_LIGHT} />
      <rect x="12" y="12" width={VB_W - 24} height={VB_H - 24} rx="9" fill={P4_INK} />
      <rect x="14" y="14" width={VB_W - 28} height={VB_H - 28} rx="8" fill={P4_FACE_LIGHT} />

      {/* 中心靶心：黄大圆 + 浅黄环 + 橙圆，意象压在最上 */}
      <circle cx={cx} cy={cy} r="64" fill={P4_YELLOW} />
      <circle cx={cx} cy={cy} r="52" fill={P4_FACE_LIGHT} />
      <circle cx={cx} cy={cy} r="43" fill={P4_ORANGE} />
      <circle cx={cx} cy={cy} r="35" fill={P4_FACE_LIGHT} />
      <text
        x={cx}
        y={cy + (p.isMajor ? 15 : 13)}
        textAnchor="middle"
        fontSize={p.isMajor ? 40 : 34}
        fontFamily="Georgia, 'Songti SC', serif"
        fontWeight="700"
        fill={P4_INK}
      >
        {p.centerSymbol}
      </text>

      {/* 顶部编号黑药丸 */}
      <g>
        <rect
          x={cx - (p.rankLabel.length > 3 ? 34 : 25)}
          y="26"
          width={p.rankLabel.length > 3 ? 68 : 50}
          height="26"
          rx="13"
          fill={P4_INK}
        />
        <text
          x={cx}
          y="44"
          textAnchor="middle"
          fontFamily="'Noto Sans SC', 'Microsoft YaHei', sans-serif"
          fontSize={p.rankLabel.length > 3 ? 13 : 16}
          fontWeight="900"
          fill={P4_YELLOW}
        >
          {p.rankLabel}
        </text>
      </g>

      {/* 四角小四角星（黑/橙交替） */}
      {([[36, 74], [VB_W - 36, 74], [36, VB_H - 96], [VB_W - 36, VB_H - 96]] as const).map(([sx, sy], i) => (
        <path key={i} d={p4Star(sx, sy, 11)} fill={i % 2 ? P4_ORANGE : P4_INK} />
      ))}

      {/* 花色符只给宫廷牌画一枚（理由同 P5Face） */}
      {isCourt(p) && p.suitSymbol && (
        <text x="30" y="70" fontSize="16" fill={P4_INK} fontFamily="Georgia, serif" opacity="0.75">{p.suitSymbol}</text>
      )}

      {/* 牌名黑条 */}
      <rect x="22" y="244" width={VB_W - 44} height="32" rx="16" fill={P4_INK} />
      <text
        x={cx}
        y="266"
        textAnchor="middle"
        fontFamily="'Noto Sans SC', 'Microsoft YaHei', sans-serif"
        fontSize="18"
        fontWeight="900"
        fill={P4_FACE_LIGHT}
        letterSpacing="1"
      >
        {p.name}
      </text>
      <text
        x={cx}
        y="292"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontSize="7.5"
        fontWeight="700"
        fill={P4_INK}
        letterSpacing="2"
      >
        {p.nameEn.toUpperCase()}
      </text>
    </>
  );
}
