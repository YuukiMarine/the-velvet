/**
 * 长按按钮 + 进度环（Lv6 终局演出的「最终觉醒」/「总攻击」共用）
 *
 * 为什么不做成普通按钮：终局的两个决定性动作必须让手停在屏幕上一会儿——
 * 点一下就过去的东西，读起来也就是点一下的重量。
 *
 * D0（校直模式 / reduce-motion / 低端机）：进度环退化为直线填充，时长照旧不跳。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useBoldness } from '@/utils/boldness';

interface Props {
  label: string;
  /** 长按时长（ms），默认 1200 */
  holdMs?: number;
  onComplete: () => void;
  disabled?: boolean;
  accent?: string;
  ink?: string;
  /** 蓄力过程中的副标签（例：按住不放） */
  hint?: string;
}

export function HoldButton({
  label, holdMs = 1200, onComplete, disabled,
  accent = 'linear-gradient(135deg, #92610e, #e8b64c)',
  ink = '#160d02',
  hint = '按住不放',
}: Props) {
  const bold = useBoldness();
  const [progress, setProgress] = useState(0);   // 0..1
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const doneRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const tick = useCallback(() => {
    const p = Math.min(1, (performance.now() - startRef.current) / holdMs);
    setProgress(p);
    if (p >= 1) {
      stop();
      if (!doneRef.current) { doneRef.current = true; onComplete(); }
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdMs, onComplete, stop]);

  const begin = () => {
    if (disabled || doneRef.current) return;
    startRef.current = performance.now();
    stop();
    rafRef.current = requestAnimationFrame(tick);
  };

  const cancel = () => {
    if (doneRef.current) return;
    stop();
    setProgress(0);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={e => e.preventDefault()}
      className="relative w-full select-none overflow-hidden py-4 text-[17px] font-black tracking-wide disabled:opacity-40"
      style={{
        clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)',
        background: accent,
        color: ink,
        touchAction: 'none',
      }}
    >
      {/* 蓄力填充：从左往右压过去，满了就触发 */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 pointer-events-none"
        style={{
          width: `${progress * 100}%`,
          background: 'rgba(255,255,255,0.42)',
          transition: bold ? 'none' : 'width 90ms linear',
          mixBlendMode: 'overlay',
        }}
      />
      <span className="relative">{label}</span>
      <span className="relative ml-2 text-[11px] font-bold opacity-60">
        {progress > 0 && progress < 1 ? `${Math.round(progress * 100)}%` : hint}
      </span>
    </button>
  );
}
