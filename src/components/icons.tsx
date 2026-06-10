/**
 * icons — 行动域共享图标（UI_AUDIT_V2.5.md §3.2：收敛 6 处重复 inline SVG path）。
 *
 * 约束：
 *   - viewBox="0 0 16 16"，path / fill / stroke 与原 inline SVG 逐字一致
 *     （只做收敛，不做重绘——替换后零视觉 diff）；
 *   - 一律 currentColor：颜色永远由父级 text-* 类控制，图标自身不带色；
 *   - className 默认 'w-3.5 h-3.5'（全部现存调用点的事实尺寸），可覆盖；
 *     不给默认尺寸的 SVG 会撑满容器，按钮里会爆框，故必须兜底；
 *   - 图标都是装饰性的（语义由外层按钮的 title/aria-label 承担），统一
 *     aria-hidden。
 */

export interface IconProps {
  className?: string;
}

/** 铅笔（编辑）。原 Todos.tsx:1390、Achievements.tsx:424/889/1028 共 4 处重复 */
export const EditIcon = ({ className = 'w-3.5 h-3.5' }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
    <path d="M11.5 2.5a1.5 1.5 0 012.121 2.121L5.561 12.682l-2.829.707.707-2.829L11.5 2.5z" />
  </svg>
);

/** 垃圾桶（删除）。原 Todos.tsx:187/1399/1473、Achievements.tsx:402/435/1041 共 6 处重复 */
export const TrashIcon = ({ className = 'w-3.5 h-3.5' }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
    <path d="M5 2h6l1 1H3L5 2zm-2 2h10l-1 9H4L3 4zm3 2v6h1V6H6zm3 0v6h1V6H9z" />
  </svg>
);

/** 归档旗（归档/停用）。原 Todos.tsx:84/172 共 2 处重复 */
export const ArchiveIcon = ({ className = 'w-3.5 h-3.5' }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
    <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v1.5a1 1 0 01-.4.8L9 8.5V13a1 1 0 01-1.447.894l-2-1A1 1 0 015 12V8.5L2.4 5.3A1 1 0 012 4.5V3zm1 0v1.5l3 3.75V12l2 1V8.25L11 4.5V3H3z" />
  </svg>
);

/**
 * 循环箭头（恢复/撤销完成）。原 Todos.tsx:1408/1484 共 2 处重复。
 * 注意：这是 stroke 图标（其余三个是 fill），rotate(110 8 8) 让开口朝向
 * 左下——与原版完全一致，改角度会变成另一个图标。
 */
export const RestoreIcon = ({ className = 'w-3.5 h-3.5' }: IconProps) => (
  <svg
    viewBox="0 0 16 16"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
  >
    <g transform="rotate(110 8 8)">
      <path d="M13.5 8A5.5 5.5 0 103 5.5" strokeLinecap="round" />
      <path d="M3 2.5v3h3" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);
