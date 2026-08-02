/**
 * 「今日任务 ⇄ 愿望」切换指示符（PRD_V2.6 反馈 §6）。
 *
 * 首版直接在标题串里写了个 ⇄ 字符：跟着标题继承字号与黑色，
 * 在四个频道里都又大又黑，抢走了标题本身的重量。
 * 第二版拆成独立小件、吃频道强调色，但用了上下两枚反向箭头做"来回"的循环微动——
 * 两个箭头在 11px 上挤成一小坨，反而更碎。
 *
 * 现在收成**单向一个 ›**：用 SVG 画而不是排版字符，这样线宽能自己定
 * （字符的 › 在各字体里粗细不一，想加粗只能靠 font-weight 碰运气）。
 * 动效保留一个轻微的右推，仍然在说"这里能往下切"，但不再有两个东西在打架。
 */
export function PaneSwapMark({ tone }: { tone: string }) {
  return (
    <span
      aria-hidden
      className="ml-1.5 inline-flex shrink-0 items-center"
      style={{ color: tone }}
    >
      <style>{`
        @keyframes pane-swap-nudge { 0%,100% { transform: translateX(0); } 50% { transform: translateX(2.5px); } }
      `}</style>
      <svg
        viewBox="0 0 12 20"
        width={9}
        height={15}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ animation: 'pane-swap-nudge 2.4s ease-in-out infinite', willChange: 'transform' }}
      >
        <path d="M2.5 2.5 L9.5 10 L2.5 17.5" />
      </svg>
    </span>
  );
}
