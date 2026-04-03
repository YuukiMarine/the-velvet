import { useState, useRef, useCallback } from 'react';

interface RippleData {
  id: number;
  x: number;
  y: number;
}

/**
 * 涟漪点击反馈 Hook
 *
 * 容器需要 position: relative + overflow: hidden
 *
 * 用法：
 *   const { spawn, ripples } = useRipple('#3b82f6');
 *   <button onClick={e => { spawn(e); doStuff(); }} className="relative overflow-hidden">
 *     {ripples}
 *     ...
 *   </button>
 */
export function useRipple(color: string = 'var(--color-primary)') {
  const [items, setItems] = useState<RippleData[]>([]);
  const nextId = useRef(0);

  const spawn = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = nextId.current++;
    setItems(prev => [...prev, { id, x, y }]);
    setTimeout(() => setItems(prev => prev.filter(r => r.id !== id)), 600);
  }, []);

  const ripples = items.map(rp => (
    <span
      key={rp.id}
      className="pointer-events-none absolute rounded-full"
      style={{
        left: rp.x,
        top: rp.y,
        width: 8,
        height: 8,
        marginLeft: -4,
        marginTop: -4,
        background: color,
        opacity: 0,
        transform: 'scale(0)',
        animation: 'splashRipple 0.55s ease-out forwards',
      }}
    />
  ));

  return { spawn, ripples };
}
