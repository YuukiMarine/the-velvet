import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * 一行放不下就先缩字号、缩到 min 还放不下再出省略号（界面审查，第 7 轮）。
 * 用在「名字」这类长度不定、又不该一上来就被截成三个字的地方（菜单证卡的用户名）。
 * 自己必须处在有宽度约束的位置（flex 里记得给 min-w-0）；容器宽度变了由 ResizeObserver 重算。
 * 只改 fontSize，不动其它样式；首帧在 layout effect 里量完再画，不会先闪一下大字。
 */
export function FitText({ children, max, min = 14, className, style, as: Tag = 'span' }: {
  children: ReactNode;
  max: number;
  min?: number;
  className?: string;
  style?: CSSProperties;
  as?: 'span' | 'h3' | 'div';
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let size = max;
      el.style.fontSize = `${size}px`;
      while (size > min && el.scrollWidth > el.clientWidth + 0.5) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(el.parentElement ?? el);
    return () => ro?.disconnect();
  }, [children, max, min]);
  return (
    <Tag ref={ref as never} className={`block truncate ${className ?? ''}`} style={{ ...style, fontSize: max }}>
      {children}
    </Tag>
  );
}
