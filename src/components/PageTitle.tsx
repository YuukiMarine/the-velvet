// PageTitle — large Chinese title with a handwritten English subtitle watermark at bottom-right
// The English text uses Caveat (cursive) in the primary theme color.

interface PageTitleProps {
  /** Main Chinese title */
  title: string;
  /** Handwritten English label shown at the bottom-right in primary color */
  en: string;
}

export const PageTitle = ({ title, en }: PageTitleProps) => (
  <div className="relative inline-block select-none mb-1">
    {/* Main title */}
    <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white leading-none">
      {title}
    </h2>
    {/* Handwritten English — absolutely positioned at bottom-right, slightly overlapping */}
    <span
      className="absolute -bottom-2 -right-1 text-lg leading-none text-primary pointer-events-none"
      style={{ fontFamily: "'Caveat', cursive", fontWeight: 600 }}
    >
      {en}
    </span>
  </div>
);
