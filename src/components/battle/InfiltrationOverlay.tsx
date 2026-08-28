/**
 * 潜入战场 · 入场演出（批2 验收反馈 #4）
 *
 * 构成：大无衬线单词 INFILTRATE + 水波纹外扩 + 破碎的钟表（影时间=时间碎裂）+ 故障切片特效。
 * 时长 ~2.3s；D0（useBoldness=false / reduce-motion）降级为 0.5s 渐隐直接进入。
 */
import { useEffect } from 'react';
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { playSound } from '@/utils/feedback';

interface Props {
  onDone: () => void;
}

const RIPPLES = [0, 0.28, 0.56, 0.84];

const CLOCK_SHARDS = [
  { points: '0,-46 14,-30 -6,-26', dx: 46, dy: -58, rot: 96 },
  { points: '32,-32 44,-10 22,-16', dx: 72, dy: -20, rot: -70 },
  { points: '40,18 26,38 20,14', dx: 62, dy: 46, rot: 120 },
  { points: '-30,34 -10,44 -22,18', dx: -54, dy: 52, rot: -110 },
  { points: '-44,-14 -26,-28 -22,-6', dx: -70, dy: -34, rot: 80 },
];

export function InfiltrationOverlay({ onDone }: Props) {
  const bold = useBoldness();

  useEffect(() => {
    playSound('/battle-start.mp3', 0.85);
    const t = setTimeout(onDone, bold ? 2300 : 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bold) {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[55] flex items-center justify-center"
        style={{ background: '#050a1e' }}
      >
        <p className="text-white font-black text-3xl tracking-[0.2em]">INFILTRATE</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[55] flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 42%, #0a1436 0%, #050a1e 62%, #02040f 100%)' }}
    >
      {/* 水波纹：从中心外扩的青色细环 */}
      {RIPPLES.map((delay, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{ border: `${1.6 - i * 0.25}px solid rgba(53,209,232,${0.65 - i * 0.12})` }}
          initial={{ width: 40, height: 40, opacity: 0 }}
          animate={{ width: 460 + i * 120, height: 460 + i * 120, opacity: [0, 0.9, 0] }}
          transition={{ duration: 1.5, delay: 0.15 + delay, ease: 'easeOut' }}
        />
      ))}

      {/* 破碎的钟表：表盘 + 停摆指针 + 裂纹 + 飞散碎片 */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1.04, 1], opacity: [0, 1, 1] }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'backOut' }}
        className="relative mb-5"
      >
        <svg width="128" height="128" viewBox="-64 -64 128 128" aria-hidden>
          {/* 表盘 */}
          <circle r="52" fill="rgba(8,14,40,0.7)" stroke="rgba(180,205,255,0.5)" strokeWidth="2" />
          {/* 刻度 */}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const r1 = i % 3 === 0 ? 40 : 45;
            return (
              <line
                key={i}
                x1={Math.sin(a) * r1} y1={-Math.cos(a) * r1}
                x2={Math.sin(a) * 49} y2={-Math.cos(a) * 49}
                stroke="rgba(180,205,255,0.55)" strokeWidth={i % 3 === 0 ? 2.4 : 1.2}
              />
            );
          })}
          {/* 指针：停摆在午夜（影时间） */}
          <motion.line
            x1="0" y1="6" x2="0" y2="-30"
            stroke="#e6efff" strokeWidth="3.4" strokeLinecap="round"
            initial={{ rotate: -32 }} animate={{ rotate: [-32, 4, 0] }}
            transition={{ duration: 0.7, delay: 0.35, ease: 'circOut' }}
          />
          <motion.line
            x1="0" y1="8" x2="0" y2="-42"
            stroke="rgba(53,209,232,0.95)" strokeWidth="2" strokeLinecap="round"
            initial={{ rotate: 140 }} animate={{ rotate: [140, -6, 0] }}
            transition={{ duration: 0.8, delay: 0.3, ease: 'circOut' }}
          />
          <circle r="3.4" fill="#e6efff" />
          {/* 裂纹（时间碎裂） */}
          <motion.path
            d="M 2 -50 L -6 -28 L 4 -20 L -3 -2 M -6 -28 L -18 -22"
            fill="none" stroke="rgba(230,240,255,0.9)" strokeWidth="1.6" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 1, 1] }}
            transition={{ duration: 0.42, delay: 0.95, ease: 'easeIn' }}
          />
          <motion.path
            d="M 30 38 L 16 22 L 24 12 M 16 22 L 4 18"
            fill="none" stroke="rgba(230,240,255,0.75)" strokeWidth="1.3" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 1, 1] }}
            transition={{ duration: 0.34, delay: 1.1, ease: 'easeIn' }}
          />
          {/* 飞散的表盘碎片 */}
          {CLOCK_SHARDS.map((s, i) => (
            <motion.polygon
              key={i}
              points={s.points}
              fill="rgba(190,215,255,0.85)"
              stroke="rgba(53,209,232,0.6)"
              strokeWidth="0.6"
              initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
              animate={{ x: s.dx, y: s.dy, rotate: s.rot, opacity: [0, 1, 0] }}
              transition={{ duration: 0.9, delay: 1.18 + i * 0.04, ease: [0.2, 0.9, 0.4, 1] }}
            />
          ))}
        </svg>
        {/* 碎裂瞬间闪光 */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ duration: 0.3, delay: 1.16 }}
          style={{ background: 'radial-gradient(circle, rgba(53,209,232,0.8), transparent 70%)' }}
        />
      </motion.div>

      {/* 大无衬线字：INFILTRATE 撞入 + 故障抖动 */}
      <motion.p
        initial={{ scale: 1.7, opacity: 0 }}
        animate={{ scale: [1.7, 0.98, 1], opacity: [0, 1, 1], x: [0, 0, -5, 4, 0] }}
        transition={{
          scale: { duration: 0.44, delay: 0.5, times: [0, 0.8, 1], ease: 'circOut' },
          opacity: { duration: 0.3, delay: 0.5 },
          x: { duration: 0.24, delay: 1.2 },
        }}
        style={{
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans SC Black", "Noto Sans SC", sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(2.6rem, 13vw, 5.2rem)',
          letterSpacing: '0.14em',
          lineHeight: 1,
          color: '#f2f7ff',
          textShadow: '0 0 34px rgba(53,209,232,0.65), 0 0 90px rgba(27,87,255,0.4)',
        }}
      >
        INFILTRATE
      </motion.p>
      <motion.p
        initial={{ opacity: 0, letterSpacing: '0.9em' }}
        animate={{ opacity: [0, 0.9], letterSpacing: ['0.9em', '0.42em'] }}
        transition={{ duration: 0.5, delay: 0.86 }}
        className="mt-2 text-[11px] font-bold uppercase text-cyan-200/80"
      >
        潜入 · 影时间
      </motion.p>

      {/* 故障切片：两道横向错位条 */}
      {[0.32, 0.6].map((top, i) => (
        <motion.div
          key={i}
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${top * 100}%`,
            height: 7 + i * 4,
            background: 'linear-gradient(90deg, transparent, rgba(53,209,232,0.28), rgba(255,255,255,0.14), transparent)',
            mixBlendMode: 'screen',
          }}
          initial={{ x: i === 0 ? '-100%' : '100%', opacity: 0 }}
          animate={{ x: ['0%', i === 0 ? '6%' : '-6%', '0%'], opacity: [0, 1, 0] }}
          transition={{ duration: 0.4, delay: 1.24 + i * 0.12 }}
        />
      ))}

      {/* 收尾白闪 → 进塔 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0.9, 0] }}
        transition={{ duration: 2.3, times: [0, 0.86, 0.93, 1] }}
        style={{ background: 'radial-gradient(ellipse at center, rgba(220,240,255,0.95), rgba(120,180,255,0.35) 55%, transparent 80%)' }}
      />
    </motion.div>
  );
}
