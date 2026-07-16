/**
 * 战斗演出组件包（批1 拆分：自 BattleModal 抽离 + 引擎 v2 新增件）
 * 纯演出、无战斗逻辑；均为叠加层，由 BattleModal 按 fx 事件挂载。
 */
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { playSound } from '@/utils/feedback';

export const DEATH_EXPLOSION_PARTICLES = Array.from({ length: 26 }, (_, i) => ({
  id: i,
  angle: (i / 26) * 360,
  distance: 35 + (i % 5) * 18,
  size: 2 + (i % 3) * 1.5,
  color: (['#ef4444', '#f97316', '#fbbf24', '#ffffff'] as const)[i % 4],
  delay: (i % 7) * 0.03,
}));

export function BattleFinishAnim() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden"
      style={{ background: 'rgba(5,0,0,0.97)' }}
    >
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.6, 0] }}
        transition={{ duration: 0.25, delay: 0.05 }}
        style={{ background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.6), rgba(0,0,0,0.5))' }}
      />
      {([0, 0.2, 0.38] as const).map((delay, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{ border: `${1.5 - i * 0.3}px solid rgba(239,68,68,${0.7 - i * 0.15})` }}
          initial={{ width: 0, height: 0, opacity: 1 }}
          animate={{ width: 260 + i * 70, height: 260 + i * 70, opacity: 0 }}
          transition={{ duration: 0.75, delay: 0.3 + delay, ease: 'easeOut' }}
        />
      ))}
      {DEATH_EXPLOSION_PARTICLES.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{ width: p.size, height: p.size, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * p.distance,
            y: Math.sin((p.angle * Math.PI) / 180) * p.distance,
            opacity: [0, 1, 0.6, 0],
            scale: [0, 2, 1, 0],
          }}
          transition={{ duration: 0.85, delay: p.delay, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      {[0, 1].map(i => (
        <motion.div
          key={i}
          className="absolute w-full pointer-events-none"
          style={{
            height: 1.5,
            background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.9), transparent)',
            top: `${43 + i * 14}%`,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 0.3, delay: 0.22 + i * 0.08 }}
        />
      ))}
      <motion.div
        initial={{ x: -400 }}
        animate={{ x: [-400, 14, 0] }}
        transition={{ duration: 0.5, delay: 0.1, times: [0, 0.82, 1], ease: 'circOut' }}
        style={{
          fontSize: 'clamp(2.8rem,14vw,4.6rem)', fontWeight: 900, letterSpacing: '0.1em',
          color: 'transparent', WebkitTextStroke: '2px rgba(239,68,68,0.9)',
          textShadow: '0 0 30px rgba(239,68,68,0.8)',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
          lineHeight: 1.1, userSelect: 'none',
        }}
      >
        BATTLE
      </motion.div>
      <motion.div
        initial={{ x: 400 }}
        animate={{ x: [400, -14, 0] }}
        transition={{ duration: 0.5, delay: 0.28, times: [0, 0.82, 1], ease: 'circOut' }}
        style={{
          fontSize: 'clamp(2.8rem,14vw,4.6rem)', fontWeight: 900, letterSpacing: '0.1em',
          color: 'white', WebkitTextStroke: '2px rgba(239,68,68,0.7)',
          textShadow: '0 0 20px rgba(255,255,255,0.6)',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
          lineHeight: 1.1, userSelect: 'none',
        }}
      >
        FINISH
      </motion.div>
    </motion.div>
  );
}

export function DeathExplosion() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ border: `2px solid rgba(239,68,68,${0.8 - i * 0.2})` }}
          initial={{ width: 0, height: 0, opacity: 1 }}
          animate={{ width: 140 + i * 40, height: 140 + i * 40, opacity: 0 }}
          transition={{ duration: 0.55, delay, ease: 'easeOut' }}
        />
      ))}
      {DEATH_EXPLOSION_PARTICLES.slice(0, 16).map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * (p.distance * 0.55),
            y: Math.sin((p.angle * Math.PI) / 180) * (p.distance * 0.55),
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
          }}
          transition={{ duration: 0.65, delay: p.delay * 0.5, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

export function NarrationBox({
  lines, index, onAdvance, canAdvance,
}: {
  lines: string[];
  index: number;
  onAdvance: () => void;
  canAdvance: boolean;
}) {
  useEffect(() => {
    if (!canAdvance) return;
    const timer = setTimeout(onAdvance, 5000);
    return () => clearTimeout(timer);
  }, [index, canAdvance, onAdvance]);

  const current = lines[index] ?? '';
  return (
    <motion.div
      className="mx-4 mb-3 p-3 rounded-xl cursor-pointer select-none"
      style={{ background: 'rgba(10,0,30,0.9)', border: '2px solid rgb(var(--color-battle-bright-rgb) / 0.5)', minHeight: 52 }}
      onClick={canAdvance ? () => { playSound('/dd.mp3', 0.45); onAdvance(); } : undefined}
      whileTap={canAdvance ? { scale: 0.98 } : {}}
    >
      <p className="text-white text-sm leading-relaxed">{current}</p>
      {canAdvance && index < lines.length - 1 && (
        <motion.span
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="text-purple-400 text-xs"
        >
          ▼
        </motion.span>
      )}
    </motion.div>
  );
}

export function AllOutCutIn({ personaName, shadowName }: { personaName: string; shadowName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ background: 'rgba(0,0,0,0.9)' }}
    >
      <motion.div
        className="absolute w-[200%] h-24"
        initial={{ x: '-120%', rotate: -14, opacity: 0 }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.4, times: [0, 0.25, 0.75, 1], ease: 'easeOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.9), rgba(250,204,21,0.9), rgba(239,68,68,0.9), transparent)',
          boxShadow: '0 0 40px rgba(239,68,68,0.7)',
        }}
      />
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
        animate={{ scale: [0.3, 1.2, 1], opacity: [0, 1, 1], rotate: [-8, -4, -4] }}
        transition={{ duration: 0.9, delay: 0.2, times: [0, 0.6, 1], ease: 'backOut' }}
        style={{
          fontSize: 'clamp(2.8rem,14vw,5rem)', fontWeight: 900, color: 'transparent',
          WebkitTextStroke: '2.5px rgba(250,204,21,0.95)',
          textShadow: '0 0 40px rgba(250,204,21,0.8), 0 0 80px rgba(239,68,68,0.5)',
          fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif',
          letterSpacing: '0.08em', userSelect: 'none',
        }}
      >
        ALL-OUT!
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: [0, 1, 0], y: [50, 80, 80] }}
        transition={{ duration: 1.2, delay: 0.45 }}
        className="absolute text-white text-sm font-bold tracking-wider"
        style={{ bottom: '28%', textShadow: '0 0 10px rgba(239,68,68,0.9)' }}
      >
        {personaName} —— 向 {shadowName} 倾泻全部力量！
      </motion.div>
      <motion.div
        className="absolute h-1 w-[180%]"
        initial={{ scaleX: 0, rotate: 20, opacity: 0 }}
        animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.65, delay: 0.85, ease: 'circOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent, #fbbf24, #ffffff, #fbbf24, transparent)',
          boxShadow: '0 0 24px rgba(250,204,21,0.95)',
        }}
      />
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.8, 0] }}
        transition={{ duration: 0.35, delay: 1.05 }}
        style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.9), transparent 70%)' }}
      />
    </motion.div>
  );
}

export function WeakCutIn() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ background: 'rgba(0,0,0,0.35)' }}
    >
      <motion.div
        className="absolute w-[180%] h-28"
        initial={{ x: '-120%', rotate: -12, opacity: 0 }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.05, times: [0, 0.2, 0.75, 1], ease: 'circOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #0a0a0a 12%, #0a0a0a 88%, transparent 100%)',
          boxShadow: '0 0 30px rgba(251,191,36,0.55), inset 0 0 40px rgba(0,0,0,0.9)',
        }}
      />
      <motion.div
        className="absolute w-[180%] h-1"
        initial={{ x: '-120%', rotate: -12, opacity: 0, top: 'calc(50% - 3.5rem)' }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.05, times: [0, 0.2, 0.75, 1], ease: 'circOut' }}
        style={{ background: 'linear-gradient(90deg, transparent, #fbbf24, #fbbf24, transparent)', boxShadow: '0 0 12px rgba(251,191,36,0.9)' }}
      />
      <motion.div
        className="absolute w-[180%] h-1"
        initial={{ x: '120%', rotate: -12, opacity: 0, top: 'calc(50% + 3.5rem)' }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.05, times: [0, 0.2, 0.75, 1], ease: 'circOut' }}
        style={{ background: 'linear-gradient(90deg, transparent, #fbbf24, #fbbf24, transparent)', boxShadow: '0 0 12px rgba(251,191,36,0.9)' }}
      />
      <motion.div
        initial={{ scale: 0.2, opacity: 0, rotate: -8, letterSpacing: '0.8em' }}
        animate={{ scale: [0.2, 1.25, 1.05], opacity: [0, 1, 1], rotate: [-8, -6, -6], letterSpacing: ['0.8em', '0.12em', '0.12em'] }}
        transition={{ duration: 0.7, delay: 0.18, times: [0, 0.55, 1], ease: 'backOut' }}
        style={{
          fontSize: 'clamp(3.8rem, 19vw, 7rem)', fontWeight: 900, color: '#fbbf24',
          WebkitTextStroke: '3px #000',
          textShadow: '0 0 30px rgba(251,191,36,0.9), 0 0 60px rgba(239,68,68,0.5), 6px 6px 0 #7f1d1d',
          fontFamily: '"Impact", "Arial Black", "Noto Sans SC", sans-serif',
          fontStyle: 'italic', userSelect: 'none', zIndex: 2,
        }}
      >
        WEAK!
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: [0, 1, 0], y: [36, 60, 60] }}
        transition={{ duration: 0.95, delay: 0.38 }}
        className="absolute text-white text-[11px] font-bold tracking-[0.45em] uppercase"
        style={{ bottom: '32%', textShadow: '0 0 10px rgba(239,68,68,0.9)' }}
      >
        effective · weakness struck
      </motion.div>
      <motion.div
        className="absolute h-1 w-[160%]"
        initial={{ scaleX: 0, rotate: 18, opacity: 0 }}
        animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.5, delay: 0.72, ease: 'circOut' }}
        style={{ background: 'linear-gradient(90deg, transparent, #fef3c7, #ffffff, #fef3c7, transparent)', boxShadow: '0 0 22px rgba(254,243,199,0.95)' }}
      />
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0] }}
        transition={{ duration: 0.28, delay: 0.18 }}
        style={{ background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.7), transparent 60%)' }}
      />
    </motion.div>
  );
}

/** 引擎v2 · 1 MORE 闪现（弱点/暴击追加行动） */
export function OneMoreFlash() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.1 }}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden pointer-events-none"
    >
      <motion.div
        className="absolute w-[170%] h-16"
        initial={{ x: '120%', rotate: 8, opacity: 0 }}
        animate={{ x: '0%', opacity: [0, 0.95, 0.95, 0] }}
        transition={{ duration: 0.85, times: [0, 0.25, 0.8, 1], ease: 'circOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.85), rgba(53,209,232,0.9), transparent)',
          boxShadow: '0 0 32px rgba(53,209,232,0.7)',
        }}
      />
      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: 6, x: 60 }}
        animate={{ scale: [0.4, 1.15, 1], opacity: [0, 1, 1], rotate: [6, -3, -3], x: [60, 0, 0] }}
        transition={{ duration: 0.55, times: [0, 0.6, 1], ease: 'backOut' }}
        style={{
          fontSize: 'clamp(2.6rem,12vw,4rem)', fontWeight: 900, fontStyle: 'italic',
          color: '#fff', WebkitTextStroke: '2px rgba(27,87,255,0.9)',
          textShadow: '0 0 26px rgba(53,209,232,0.9), 4px 4px 0 rgba(10,20,80,0.8)',
          fontFamily: '"Impact", "Arial Black", "Noto Sans SC", sans-serif',
          letterSpacing: '0.06em', userSelect: 'none',
        }}
      >
        1 MORE!
      </motion.div>
    </motion.div>
  );
}

/** 引擎v2 · 出战面具切换切入（每场每属性首次=完整版，之后走轻量 toast） */
export function MaskCutIn({ attrName, personaName, full }: { attrName: string; personaName: string; full: boolean }) {
  if (!full) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.18 }}
        className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full pointer-events-none"
        style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.35)', border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.6)', backdropFilter: 'blur(6px)' }}
      >
        <span className="text-white text-xs font-bold">🎭 {attrName} · {personaName}</span>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ background: 'rgba(4,0,18,0.55)' }}
    >
      <motion.div
        className="absolute w-[190%] h-20"
        initial={{ x: '-120%', rotate: -10, opacity: 0 }}
        animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.0, times: [0, 0.22, 0.78, 1], ease: 'circOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgb(var(--color-battle-bright-rgb) / 0.85), rgba(53,209,232,0.85), transparent)',
          boxShadow: '0 0 36px rgb(var(--color-battle-bright-rgb) / 0.6)',
        }}
      />
      <div className="relative flex flex-col items-center">
        <motion.p
          initial={{ opacity: 0, letterSpacing: '0.7em', y: 8 }}
          animate={{ opacity: [0, 1], letterSpacing: ['0.7em', '0.3em'], y: [8, 0] }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="text-[11px] font-bold uppercase text-white/70"
        >
          persona
        </motion.p>
        <motion.p
          initial={{ scale: 0.5, opacity: 0, rotate: -4 }}
          animate={{ scale: [0.5, 1.12, 1], opacity: [0, 1, 1], rotate: [-4, -2, -2] }}
          transition={{ duration: 0.6, delay: 0.18, times: [0, 0.6, 1], ease: 'backOut' }}
          style={{
            fontSize: 'clamp(1.9rem,9vw,3rem)', fontWeight: 900, color: '#fff',
            WebkitTextStroke: '1.5px rgba(53,209,232,0.8)',
            textShadow: '0 0 28px rgba(53,209,232,0.8), 3px 3px 0 rgba(10,0,40,0.9)',
            userSelect: 'none', lineHeight: 1.15,
          }}
        >
          {personaName}
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: [0, 1, 0.9], y: [12, 0, 0] }}
          transition={{ duration: 0.7, delay: 0.32 }}
          className="mt-1 text-sm font-bold text-purple-200"
        >
          🎭 {attrName}之面具 · 出战
        </motion.p>
      </div>
    </motion.div>
  );
}
