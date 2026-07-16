/**
 * 总攻击 · 拔河连击 QTE（BATTLE_UPGRADE_PLAN_V2.md §3.7）
 *
 * 3.5s：连点右推（+2.2%/次），Shadow 意志按等级回拉；结算档位 ×1.2/×1.5/×1.8/×2.2。
 * D0（useBoldness=false）时由调用方直接走 QTE_FALLBACK_MULT，不渲染本组件。
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  QTE_DURATION_MS, QTE_TAP_GAIN, QTE_START, qtePullPer100ms, qteMultiplier,
} from '@/battle/numbers';
import { triggerLightHaptic, playSound } from '@/utils/feedback';

interface Props {
  shadowLevel: number;
  shadowName: string;
  onDone: (multiplier: number, gauge: number) => void;
}

export function TugQTE({ shadowLevel, shadowName, onDone }: Props) {
  const [gauge, setGauge] = useState(QTE_START);
  const [remainingMs, setRemainingMs] = useState(QTE_DURATION_MS);
  const gaugeRef = useRef(QTE_START);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const start = performance.now();
    let last = start;
    let raf = 0;
    const pullPerMs = qtePullPer100ms(shadowLevel) / 100;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const elapsed = now - start;
      // Shadow 回拉
      gaugeRef.current = Math.max(0, gaugeRef.current - pullPerMs * dt);
      setGauge(gaugeRef.current);
      setRemainingMs(Math.max(0, QTE_DURATION_MS - elapsed));
      // 满条提前收线 / 到时结算
      if (gaugeRef.current >= 100 || elapsed >= QTE_DURATION_MS) {
        if (!doneRef.current) {
          doneRef.current = true;
          const g = Math.min(100, gaugeRef.current);
          playSound('/battle-impact.mp3', 0.8);
          onDoneRef.current(qteMultiplier(g), g);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shadowLevel]);

  const handleTap = () => {
    if (doneRef.current) return;
    gaugeRef.current = Math.min(100, gaugeRef.current + QTE_TAP_GAIN);
    setGauge(gaugeRef.current);
    triggerLightHaptic();
  };

  const mult = qteMultiplier(gauge);
  const secondsLeft = (remainingMs / 1000).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center select-none"
      style={{ background: 'rgba(2,0,12,0.92)' }}
      onPointerDown={handleTap}
    >
      <motion.p
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 0.6, repeat: Infinity }}
        className="text-yellow-300 text-xs font-bold tracking-[0.3em] uppercase mb-1"
      >
        连点压制 · {secondsLeft}s
      </motion.p>
      <p className="text-white/70 text-[11px] mb-4">与 {shadowName} 的意志拔河——把光条推满！</p>

      {/* 拔河条 */}
      <div className="w-[82%] max-w-sm">
        <div
          className="relative h-7 overflow-hidden rounded-md"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(250,204,21,0.4)' }}
        >
          {/* 档位刻度 */}
          {[50, 75].map(g => (
            <div key={g} className="absolute top-0 bottom-0 w-px bg-white/25" style={{ left: `${g}%` }} />
          ))}
          <motion.div
            className="absolute inset-y-0 left-0"
            animate={{ width: `${gauge}%` }}
            transition={{ duration: 0.05, ease: 'linear' }}
            style={{
              background: gauge >= 75
                ? 'linear-gradient(90deg, #f59e0b, #fde047)'
                : gauge >= 50
                  ? 'linear-gradient(90deg, #dc2626, #f59e0b)'
                  : 'linear-gradient(90deg, #7f1d1d, #dc2626)',
              boxShadow: '0 0 16px rgba(250,204,21,0.5)',
            }}
          />
          {/* Shadow 意志（右端压迫感） */}
          <motion.div
            className="absolute inset-y-0 right-0 w-10 pointer-events-none"
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            style={{ background: 'linear-gradient(270deg, rgba(88,28,135,0.8), transparent)' }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] font-bold">
          <span className="text-white/50">{Math.round(gauge)}%</span>
          <motion.span
            key={mult}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            className={gauge >= 75 ? 'text-yellow-300' : gauge >= 50 ? 'text-orange-300' : 'text-red-300'}
          >
            当前档位 ×{mult.toFixed(1)}
          </motion.span>
        </div>
      </div>

      <motion.p
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        className="mt-8 text-white font-black text-lg tracking-widest"
        style={{ textShadow: '0 0 18px rgba(250,204,21,0.8)' }}
      >
        TAP! TAP! TAP!
      </motion.p>
    </motion.div>
  );
}
