/**
 * StarChartP3 —— 数据驱动的五角星象仪（角长 = 等级，升级即"长角"）。
 *
 * 原为 DashboardP3 的局部件（白日水面版）；FS2.2 起提取共用：
 *   · 蓝/粉（p3 频道）→ 走默认调色板，即 P3R 变量族（粉主题在 CSS 层换过色）；
 *   · 自定义主题（neutral）→ 传 palette 覆写成 --color-primary 派生的中性色，
 *     取代此前那套过时的深色舞台 StarChart（用户口径：把 P3 的迁过来）。
 *
 * 几何：正立五角星，"上窄下宽"的透视感由容器 skewX + scaleY 承担（不用 3D）。
 * 铁律照旧：SVG 装饰 aria-hidden，五个角是完整 button（命中区），标签反变换回正。
 */
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { AttributeId } from '@/types';

const STAR_CX = 180;
const STAR_CY = 178;
const STAR_R = 150;
const rad = (d: number) => (d * Math.PI) / 180;
const armAngle = (i: number) => -90 + i * 72;
const STAR_SKEW = -13;    // 平行四边形斜切：上边右移、下边左移（下左上右）
const STAR_SCALEY = 1.16; // 整体高度拉伸一点
const pt = (ang: number, r: number): [number, number] => [STAR_CX + r * Math.cos(rad(ang)), STAR_CY + r * Math.sin(rad(ang))];

/** 五角星路径：radii[i] 为第 i 个外角半径；凹点随相邻两角联动，保持尖锐星形 */
const starPathAt = (radii: number[]) => {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const [ox, oy] = pt(armAngle(i), radii[i]);
    const innerR = ((radii[i] + radii[(i + 1) % 5]) / 2) * 0.4;
    const [ix, iy] = pt(armAngle(i) + 36, innerR);
    d += `${i === 0 ? 'M' : 'L'}${ox.toFixed(1)},${oy.toFixed(1)} L${ix.toFixed(1)},${iy.toFixed(1)} `;
  }
  return `${d}Z`;
};

/** 等级 → 外角半径：保底 0.24R 起步，满级顶到底星轮廓（升级即可见地"长角"） */
const levelRadius = (level: number, maxLevel: number) =>
  STAR_R * (0.24 + 0.76 * Math.max(0, Math.min(1, level / Math.max(1, maxLevel))));

export interface StarItem {
  id: AttributeId;
  name: string;
  level: number;
  maxLevel: number;
  title: string;
}

/** 调色板：默认即 P3R 变量族（含浅色 fallback），中性皮传一套 --color-primary 派生值 */
export interface StarPalette {
  /** 数据星填充 */
  data: string;
  /** 属性名 */
  ink: string;
  /** 称号小字 */
  inkSoft: string;
  /** 等级数字 */
  accent: string;
  /** 角端延长细线 */
  arm: string;
  /** 同心环：内浅端 */
  ringPale: string;
  /** 同心环：外深端 */
  ringDeep: string;
  /** 焦点环颜色 */
  focus: string;
}

const P3_PALETTE: StarPalette = {
  data: 'var(--p3r-blue-deep, #0a3bd6)',
  ink: 'var(--p3r-ink, #0a1230)',
  inkSoft: 'var(--p3r-ink-soft, #3d4a66)',
  accent: 'var(--p3r-blue, #1b57ff)',
  arm: 'rgba(var(--p3r-cyan-rgb, 53,209,232), 0.55)',
  ringPale: 'var(--p3r-star-ring-pale, rgb(233, 247, 252))',
  ringDeep: 'var(--p3r-star-ring-deep, rgb(124, 201, 234))',
  focus: 'var(--p3r-blue, #1b57ff)',
};

/** 中性皮（自定义主题）：整族从 --color-primary 派生，深浅由 color-mix 拉开。
 *  字色用 --ui-surface-ink 而非 --ui-ink：星图画在卡片（surface）上，不是舞台底（bg）上——
 *  两者在夜间是相反的极性，用错那一个属性名就会和卡片底同色而隐身（FS7 审查实测对比度 1.00）。
 *  同理同心环不再硬取 #ffffff，改向 --ui-surface 混色，夜间才不会在深卡上炸出白圈。 */
export const NEUTRAL_STAR_PALETTE: StarPalette = {
  data: 'color-mix(in srgb, var(--color-primary) 82%, #0b1020)',
  ink: 'var(--ui-surface-ink, #111827)',
  inkSoft: 'color-mix(in srgb, var(--ui-surface-ink, #111827) 62%, transparent)',
  accent: 'var(--color-primary)',
  arm: 'color-mix(in srgb, var(--color-primary) 45%, transparent)',
  ringPale: 'color-mix(in srgb, var(--color-primary) 12%, var(--ui-surface, #ffffff))',
  ringDeep: 'color-mix(in srgb, var(--color-primary) 62%, var(--ui-surface, #ffffff))',
  focus: 'var(--color-primary)',
};

export const StarChartP3 = ({ items, onSelect, showLabels = true, palette = P3_PALETTE }: {
  items: StarItem[];
  onSelect: (id: AttributeId, e: ReactMouseEvent) => void;
  showLabels?: boolean;
  palette?: StarPalette;
}) => {
  const dataPath = starPathAt(items.slice(0, 5).map((it) => levelRadius(it.level, it.maxLevel)));
  // 同心等级星环（用户定稿）：每一档一圈同色系五角星、内浅外深（最多 10 档），
  // 由外到内实心覆盖形成环带——升级即数据星角尖走向更深的一圈，档位一眼可读
  const ringCount = Math.min(10, Math.max(1, items[0]?.maxLevel ?? 5));
  // 内圈浅 → 外圈深：两端点走调色板、中间档 color-mix 插值——JS 不感知亮暗，
  // 夜间只在 CSS 覆盖两端点，星环整族自动跟随
  const ringColor = (lvl: number) => {
    const t = Math.round((lvl / ringCount) * 100);
    return `color-mix(in srgb, ${palette.ringDeep} ${t}%, ${palette.ringPale})`;
  };
  // 标签锚点：紧贴角端外侧（viewBox 坐标 → 百分比），在同一个变换平面内自动跟随；
  // 按锚点相对中心的方位智能对齐——左角右靠、右角左靠、顶底居中
  const labelAt = (i: number) => {
    const [x, y] = pt(armAngle(i), STAR_R * 1.04);
    const dx = x - STAR_CX;
    const dy = y - STAR_CY;
    const tx = dx < -30 ? -86 : dx > 30 ? -14 : -50;
    const ty = dy < -30 ? -74 : dy > 30 ? -26 : -50;
    return { leftPct: (x / 360) * 100, topPct: (y / 356) * 100, tx, ty };
  };
  return (
    // padding 用固定 px：百分比 padding 按父宽解析，宽屏下会把星整体顶下去裁掉底部标签（用户上报）
    <div className="relative mx-auto w-full max-w-[288px]" style={{ paddingTop: 23, paddingBottom: 32 }}>
      {/* 平行四边形斜切(下左上右) + 高度拉伸；星与标签同处一个 transform，标签再反变换回正 */}
      <div className="relative" style={{ transform: `skewX(${STAR_SKEW}deg) scaleY(${STAR_SCALEY})` }}>
        <svg viewBox="0 0 360 356" className="w-full overflow-visible" aria-hidden>
          {/* 同心星环：从最外档画到最内档，后画的小星盖出环带 */}
          {Array.from({ length: ringCount }).map((_, k) => {
            const lvl = ringCount - k;
            const r = levelRadius(lvl, ringCount);
            return <path key={lvl} d={starPathAt([r, r, r, r, r])} fill={ringColor(lvl)} />;
          })}
          {/* 角端 → 标签方向的臂延长细线（设计稿细节） */}
          {items.slice(0, 5).map((it, i) => {
            const [x1, y1] = pt(armAngle(i), STAR_R * 0.99);
            const [x2, y2] = pt(armAngle(i), STAR_R + 12);
            return <line key={it.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={palette.arm} strokeWidth={1.5} />;
          })}
          {/* 数据星：深色纯色实心（去描边，用户定稿——形状即信息） */}
          <path d={dataPath} fill={palette.data} strokeLinejoin="miter" />
        </svg>
        {/* 五属性标签（可点击 → 属性档案）；反变换把文字转正对屏幕 */}
        {showLabels && items.slice(0, 5).map((it, i) => {
          const pos = labelAt(i);
          return (
            <button
              key={it.id}
              type="button"
              onClick={(e) => onSelect(it.id, e)}
              className="absolute flex flex-col items-center whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{
                left: `${pos.leftPct}%`,
                top: `${pos.topPct}%`,
                transform: `translate(${pos.tx}%, ${pos.ty}%) skewX(${-STAR_SKEW}deg) scaleY(${1 / STAR_SCALEY})`,
                // 焦点环颜色跟调色板（Tailwind 的任意值类拿不到运行期变量）
                ['--tw-ring-color' as string]: palette.focus,
              }}
              aria-label={`${it.name} 等级 ${it.level}，${it.title}`}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="text-[15px] font-black leading-none" style={{ color: palette.ink }}>{it.name}</span>
                <span className="text-[26px] font-black italic leading-none" style={{ color: palette.accent }}>{it.level}</span>
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-none" style={{ color: palette.inkSoft }}>{it.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
