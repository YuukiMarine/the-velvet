// PageTitle —— neutral（自定义主题）页头：大号中文标题 + 下方手写英文注记。
//
// v2.7.0.3 形态改版（用户 iOS 实机上报）：原先手写英文是**绝对定位在标题右下**的
// 水印，位置靠每页手调 enOffset——Caveat 加载失败回退系统体时字宽突变，注记直接
// 飘离标题（"错误位移离得有点远"）。现统一为黄主题设置页同款形态：手写字放标题
// **下方流式排布**（-mt + pl 的错位手写感），主题主色、斜体，字体栈同款
// 'Caveat','Segoe Script',cursive（Caveat 已自托管，见 index.css）。
// 流式布局天然不怕字体回退——宽度变了也只是原地伸缩，不会脱离标题。

interface PageTitleProps {
  /** Main Chinese title */
  title: string;
  /** Handwritten English label below the title */
  en: string;
  /** 旧接口保留（原绝对定位时代的每页微调）；流式形态下不再需要，忽略。 */
  enOffset?: { right?: number; bottom?: number };
}

export const PageTitle = ({ title, en }: PageTitleProps) => {
  return (
    <div className="relative inline-block select-none mb-1">
      <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white leading-none">
        {title}
      </h2>
      <div
        className="-mt-0.5 pl-6 text-[17px] font-bold italic leading-none text-primary pointer-events-none"
        style={{ fontFamily: "'Caveat', 'Segoe Script', cursive" }}
      >
        {en}
      </div>
    </div>
  );
};
