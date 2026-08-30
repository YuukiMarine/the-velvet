/**
 * 战斗演出组件包（批1 拆分：自 BattleModal 抽离 + 引擎 v2 新增件）
 * 纯演出、无战斗逻辑；均为叠加层，由 BattleModal 按 fx 事件挂载。
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

/** 叙事框（批2c-ii ⑦）：打字机逐字 + 说话人名牌分离
 *  - 点击：打字中 → 立即补全；已完整 → 推进下一行
 *  - 台词行「名：内容」自动拆出名牌（斜切小plate 浮在框沿）
 */
export function NarrationBox({
  lines, index, onAdvance, canAdvance,
}: {
  lines: string[];
  index: number;
  onAdvance: () => void;
  canAdvance: boolean;
}) {
  const raw = lines[index] ?? '';
  // 说话人拆分：全角冒号前 ≤12 字视为名牌
  const m = raw.match(/^(.{1,12}?)：(.+)$/s);
  const speaker = m ? m[1] : null;
  const content = m ? m[2] : raw;

  const [shown, setShown] = useState(0);
  const typingDone = shown >= content.length;

  useEffect(() => {
    setShown(0);
  }, [index, content]);

  // 打字机：~45 字/秒
  useEffect(() => {
    if (typingDone) return;
    const t = setInterval(() => setShown(s => Math.min(content.length, s + 1)), 22);
    return () => clearInterval(t);
  }, [content, typingDone]);

  // 自动推进：从"打完"起计 4.2s
  useEffect(() => {
    if (!canAdvance || !typingDone) return;
    const timer = setTimeout(onAdvance, 4200);
    return () => clearTimeout(timer);
  }, [index, canAdvance, onAdvance, typingDone]);

  const handleTap = () => {
    if (!canAdvance) return;
    if (!typingDone) {
      setShown(content.length);
      return;
    }
    playSound('/dd.mp3', 0.45);
    onAdvance();
  };

  return (
    <motion.div
      className="relative mx-4 mb-3 cursor-pointer select-none"
      onClick={handleTap}
      whileTap={canAdvance ? { scale: 0.985 } : {}}
    >
      {/* 名牌（斜切 plate，浮在框沿外） */}
      <AnimatePresence mode="wait">
        {speaker && (
          <motion.span
            key={`${index}-${speaker}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="absolute -top-2.5 left-3 z-[1] px-2.5 py-0.5 text-[11px] font-black text-white"
            style={{
              clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
              background: 'linear-gradient(100deg, rgba(190,30,60,0.95), rgba(120,16,40,0.95))',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
              letterSpacing: '0.04em',
            }}
          >
            {speaker}
          </motion.span>
        )}
      </AnimatePresence>
      <div
        className="p-3 pt-3.5"
        style={{
          clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
          background: 'rgba(8,0,26,0.94)',
          boxShadow: 'inset 0 0 0 1px rgb(var(--color-battle-bright-rgb) / 0.35)',
          minHeight: 56,
        }}
      >
        <p className="text-white text-sm leading-relaxed">
          {content.slice(0, shown)}
          {!typingDone && (
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="inline-block w-[7px] -mb-0.5 h-[14px] ml-0.5 align-baseline"
              style={{ background: 'rgba(196,181,253,0.9)' }}
            />
          )}
        </p>
        {canAdvance && typingDone && index < lines.length - 1 && (
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="text-purple-400 text-xs"
          >
            ▼
          </motion.span>
        )}
      </div>
    </motion.div>
  );
}

export function AllOutCutIn({ personaName, shadowName, summonLine }: { personaName: string; shadowName: string; summonLine?: string }) {
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
        className="absolute text-white text-sm font-bold tracking-wider text-center px-6"
        style={{ bottom: '28%', textShadow: '0 0 10px rgba(239,68,68,0.9)' }}
      >
        {summonLine && <span className="block text-[12px] italic text-amber-200/90 mb-0.5">「{summonLine}」</span>}
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
          fontFamily: '"Impact", "Noto Sans SC Black", "Velvet Sans SC", sans-serif',
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

/** 引擎v2 · 1 MORE 飘带（弱点/暴击追加行动）
 *  形态：右上角斜切小飘带——不占中心舞台（与 WEAK cut-in 区分）、不遮挡、不阻塞操作 */
export function OneMoreFlash() {
  return (
    <motion.div
      initial={{ x: 90, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 70, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 560, damping: 30 }}
      className="absolute top-[92px] right-0 z-40 pointer-events-none"
    >
      <div
        className="pl-5 pr-3 py-1.5"
        style={{
          background: 'linear-gradient(100deg, rgba(27,87,255,0.95), rgba(53,209,232,0.95))',
          clipPath: 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)',
          boxShadow: '0 0 18px rgba(53,209,232,0.6)',
        }}
      >
        <span
          className="font-black italic text-white text-lg leading-none"
          style={{ textShadow: '0 2px 0 rgba(10,20,80,0.6)', letterSpacing: '0.05em', userSelect: 'none' }}
        >
          1 MORE!
        </span>
      </div>
    </motion.div>
  );
}

/** 引擎v2 · 出战面具切换切入（每场每属性首次=完整版，之后走轻量 toast） */
export function MaskCutIn({ attrName, personaName, full, summonLine }: { attrName: string; personaName: string; full: boolean; summonLine?: string }) {
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
      transition={{ duration: 0.1 }}
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ background: 'rgba(4,0,18,0.5)' }}
    >
      <motion.div
        className="absolute w-[190%] h-16"
        initial={{ x: '-110%', rotate: -10 }}
        animate={{ x: '0%', opacity: [0.9, 0.9, 0] }}
        transition={{ duration: 0.62, times: [0, 0.7, 1], ease: 'circOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgb(var(--color-battle-bright-rgb) / 0.8), rgba(53,209,232,0.8), transparent)',
          boxShadow: '0 0 30px rgb(var(--color-battle-bright-rgb) / 0.55)',
        }}
      />
      <div className="relative flex flex-col items-center">
        <motion.p
          initial={{ opacity: 0, x: -36 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          style={{
            fontSize: 'clamp(1.8rem,8.5vw,2.8rem)', fontWeight: 900, color: '#fff',
            textShadow: '0 0 22px rgba(53,209,232,0.75), 0 2px 10px rgba(10,0,40,0.8)',
            userSelect: 'none', lineHeight: 1.15,
          }}
        >
          {personaName}
        </motion.p>
        <motion.p
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32, delay: 0.06 }}
          className="mt-0.5 text-sm font-bold text-purple-200"
          style={{ textShadow: '0 1px 8px rgba(10,0,40,0.8)' }}
        >
          🎭 {attrName}之面具 · 出战
        </motion.p>
        {summonLine && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="mt-1.5 text-[13px] font-bold italic text-cyan-100/90"
            style={{ textShadow: '0 0 12px rgba(53,209,232,0.6)' }}
          >
            「{summonLine}」
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
