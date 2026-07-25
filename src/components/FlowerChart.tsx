/**
 * FlowerChart —— P4 黄频道的人格指数「花瓣雷达」（p4-dashboard-reference-v2 1:1）。
 *
 * 五枚彩色花瓣绕中心排布（知识顶 → 顺时针 胆量/灵巧/温柔/魅力），
 * 瓣内：属性名（深色调）+ 特大数字；背景：奶油花剪影 + 两圈虚线圆；
 * 中心：奶油圆 + 黄星闪。瓣可点 → 属性档案（与 StarChart.onSelect 同契约）。
 *
 * 字恒水平：文字不随瓣旋转，按极坐标摆放。仅 P4 频道挂载（Dashboard 分支）。
 */
import { motion } from 'motion/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { AttributeId } from '@/types';
import { P4Flower, P4Sparkle } from '@/ui/p4Kit';

export interface FlowerChartItem {
  id: AttributeId;
  name: string;
  level: number;
  maxLevel: number;
}

/** 五瓣定色（设计稿采样）：fill 瓣底 / ink 瓣上文字 */
const PETAL_COLORS: { fill: string; ink: string }[] = [
  { fill: '#8ecdf2', ink: '#1d5ea8' },  // 知识 · 天蓝
  { fill: '#f6b04e', ink: '#a35a00' },  // 胆量 · 橙
  { fill: '#8fce74', ink: '#2f7a1f' },  // 灵巧 · 绿
  { fill: '#f2a0b5', ink: '#b33a5c' },  // 温柔 · 粉
  { fill: '#c3a5e8', ink: '#6f3fae' },  // 魅力 · 紫
];

/** 花瓣路径：从内径 r0 沿 -Y 轴伸到外径 r1 的圆润瓣形（后续按角度 rotate） */
const petalPath = (r0: number, r1: number, w: number) =>
  `M 0 ${-r0}
   C ${w} ${-r0 - 8}, ${w + 6} ${-(r0 + (r1 - r0) * 0.62)}, 0 ${-r1}
   C ${-w - 6} ${-(r0 + (r1 - r0) * 0.62)}, ${-w} ${-r0 - 8}, 0 ${-r0} Z`;

/** 设计稿瓣位固定序：知识顶 → 顺时针 胆量/灵巧/温柔/魅力 */
const PETAL_ORDER: Record<string, number> = { knowledge: 0, guts: 1, dexterity: 2, kindness: 3, charm: 4 };

export const FlowerChart = ({ items, onSelect, showLabels = true }: {
  items: FlowerChartItem[];
  /** 事件透传：调用方用点击坐标作波纹圆心（与 p3 StarChartP3 同契约） */
  onSelect?: (id: AttributeId, e?: ReactMouseEvent) => void;
  /** 档案展开时隐去瓣上文字，只留花形当衬底 */
  showLabels?: boolean;
}) => {
  const R0 = 22;   // 瓣根
  const R1 = 96;   // 瓣尖
  const W = 30;    // 瓣半宽
  const LABEL_R = 64;  // 属性名半径（靠瓣尖；数字固定在名正下方 30px）
  const sorted = [...items].sort(
    (a, b) => (PETAL_ORDER[a.id] ?? 9) - (PETAL_ORDER[b.id] ?? 9)
  );

  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <svg viewBox="-115 -115 230 230" className="block w-full">
        {/* 背景：奶油花剪影（大一号、错开 36°）+ 双虚线圆 */}
        <g opacity={0.9}>
          {[36, 108, 180, 252, 324].map((deg) => (
            <path key={deg} d={petalPath(14, 104, 34)} fill="var(--ui-paper)" transform={`rotate(${deg})`} />
          ))}
        </g>
        <circle r={88} fill="none" stroke="rgba(19,19,19,0.25)" strokeWidth={1} strokeDasharray="2 5" />
        <circle r={104} fill="none" stroke="rgba(19,19,19,0.18)" strokeWidth={1} strokeDasharray="2 6" />

        {/* 彩瓣（可点）：字恒水平 —— 文字按极坐标摆放不随瓣旋转 */}
        {sorted.slice(0, 5).map((item, i) => {
          const deg = i * 72;
          const rad = (deg * Math.PI) / 180;
          const lx = Math.sin(rad) * LABEL_R;
          const ly = -Math.cos(rad) * LABEL_R;
          const c = PETAL_COLORS[i % PETAL_COLORS.length];
          return (
            <g key={item.id}>
              {/* 旋转必须挂在外层静态 <g> 上：motion 的 whileTap 会往元素 style 里写
                  transform，而 style.transform 会整个盖掉 SVG 的 transform **属性**——
                  以前 rotate 写在 motion.path 自己身上，点一下所有花瓣就归位到 0°、
                  全叠在顶瓣底下（用户上报"叶片消失"＋"只有最上面能点"）。 */}
              <g transform={`rotate(${deg})`}>
                <motion.path
                  d={petalPath(R0, R1, W)}
                  fill={c.fill}
                  style={{ cursor: onSelect ? 'pointer' : undefined, transformBox: 'fill-box', transformOrigin: 'center' }}
                  whileTap={{ scale: 0.96 }}
                  onClick={(e) => onSelect?.(item.id, e as unknown as ReactMouseEvent)}
                />
              </g>
              {showLabels && (
                <>
                  <text
                    x={lx}
                    y={ly + 4}
                    textAnchor="middle"
                    fill={c.ink}
                    fontSize={13}
                    fontWeight={900}
                    style={{ pointerEvents: 'none' }}
                  >
                    {item.name}
                  </text>
                  {/* 数字恒在属性名正下方（设计稿：名→数纵向堆叠） */}
                  <text
                    x={lx}
                    y={ly + 30}
                    textAnchor="middle"
                    fill={c.ink}
                    fontSize={27}
                    fontWeight={900}
                    style={{ pointerEvents: 'none' }}
                  >
                    {item.level}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* 中心奶油圆 */}
        <circle r={R0 + 4} fill="var(--ui-paper)" />
      </svg>
      {/* 中心黄星闪（HTML 层压上，避免 SVG 内再画一套） */}
      <P4Sparkle
        size={22}
        color="var(--ui-bg)"
        className="absolute left-1/2 top-1/2 -ml-[11px] -mt-[11px]"
      />
      {/* 角落缀饰 */}
      <P4Sparkle size={14} color="#ffffff" className="absolute left-[12%] top-[16%] opacity-80" />
      <P4Sparkle size={12} color="#ffffff" className="absolute right-[10%] bottom-[20%] opacity-70" />
      <P4Flower size={18} color="rgba(19,19,19,0.2)" className="absolute right-[6%] top-[8%]" />
    </div>
  );
};
