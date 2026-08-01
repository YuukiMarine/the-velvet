/**
 * 「今日任务 ⇄ 愿望」切换指示符（PRD_V2.6 反馈 §6）。
 *
 * 首版直接在标题串里写了个 ⇄ 字符：跟着标题继承字号与黑色，
 * 在四个频道里都又大又黑，抢走了标题本身的重量。
 * 现在拆成独立小件——固定 11px、吃频道强调色、且自带一个"两箭错身"的循环微动，
 * 让人一眼看出这里可以切，而不是以为标题旁边多了个符号。
 */
export function PaneSwapMark({ tone }: { tone: string }) {
  return (
    <span
      aria-hidden
      className="ml-1.5 inline-flex shrink-0 flex-col justify-center leading-none"
      style={{ color: tone, fontSize: 11, fontStyle: 'normal', fontWeight: 900 }}
    >
      <style>{`
        @keyframes pane-swap-a { 0%,100% { transform: translateX(0); } 50% { transform: translateX(2px); } }
        @keyframes pane-swap-b { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-2px); } }
      `}</style>
      <span style={{ animation: 'pane-swap-a 2.4s ease-in-out infinite', willChange: 'transform' }}>›</span>
      <span style={{ animation: 'pane-swap-b 2.4s ease-in-out infinite', willChange: 'transform', marginTop: -2 }}>‹</span>
    </span>
  );
}
