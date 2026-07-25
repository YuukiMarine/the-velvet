/**
 * 斜轴世界平面（UI_DESIGN_BOLD_V2.5.md §2 规则1 / §6 技术映射）。
 *
 * 用法——"世界斜、字不斜"：
 *   <PagePlane>                          // 页面根：内容平面整体旋转 var(--ui-axis)
 *     <装饰层 />                          // 跟随世界倾斜
 *     <PlaneLevel>正文 / 表单</PlaneLevel> // 反制层转回水平，文字永不倾斜
 *   </PagePlane>
 *
 * 约束与机制（样式实体在 index.css 末尾的 .sl-* 类）：
 *   · 滚动容器必须在 PagePlane 之外：外层 .sl-plane-clip 只裁旋转出血的横向
 *     溢出、自身不转，原生惯性滚动不受 transform 影响。
 *   · :focus-within 校直（D1 录入态，§2 规则1）：聚焦平面内任意 input/textarea，
 *     整页弹性回正 0°、PlaneLevel 同步停掉反制旋转；失焦自动复斜。
 *     纯 CSS 实现——录入路径的易读性护栏不依赖任何 JS 状态。
 *   · D0（校直模式 / prefers-reduced-motion / 低帧率永久降级）下 --boldness=0，
 *     角度归零，两个组件零开销退化为普通容器。
 *
 * 本 PR 仅提供组件，页面采用在后续迁移 PR 中进行。
 */
import type { CSSProperties, ReactNode } from 'react';

interface PlaneProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** 斜面层：包整页内容；命中区随平面一起旋转（rotate 不破 hit-testing） */
export function PagePlane({ children, className, style }: PlaneProps) {
  return (
    <div className="sl-plane-clip">
      <div className={className ? `sl-plane ${className}` : 'sl-plane'} style={style}>{children}</div>
    </div>
  );
}

/** 反制层：放在 PagePlane 内，把正文等量转回水平——"字恒水平"铁律（§7 规则1） */
export function PlaneLevel({ children, className, style }: PlaneProps) {
  return <div className={className ? `sl-level ${className}` : 'sl-level'} style={style}>{children}</div>;
}
