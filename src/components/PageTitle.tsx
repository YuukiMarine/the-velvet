// PageTitle — large Chinese title with a handwritten English subtitle watermark at bottom-right
// The English text uses Caveat (cursive) in the primary theme color.

interface PageTitleProps {
  /** Main Chinese title */
  title: string;
  /** Handwritten English label shown at the bottom-right in primary color */
  en: string;
  /**
   * 英文副标的相对位移（像素）。默认 right=-4（即 -right-1）对应大多数页面的视觉平衡；
   * 某些英文单词（Cooperation 等）较长，可传入更正的 right 让它更往右挪
   */
  enOffset?: { right?: number; bottom?: number };
}

export const PageTitle = ({ title, en, enOffset }: PageTitleProps) => {
  const right = enOffset?.right ?? -4;   // 默认等价于 -right-1 (4px)
  const bottom = enOffset?.bottom ?? -8; // 默认等价于 -bottom-2 (8px)
  return (
    <div className="relative inline-block select-none mb-1">
      <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white leading-none">
        {title}
      </h2>
      <span
        className="absolute text-lg leading-none text-primary pointer-events-none"
        style={{
          fontFamily: "'Caveat', cursive",
          fontWeight: 600,
          right,
          bottom,
        }}
      >
        {en}
      </span>
    </div>
  );
};
