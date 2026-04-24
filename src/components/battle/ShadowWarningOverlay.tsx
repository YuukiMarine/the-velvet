import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AttributeId } from '@/types';
import { SHADOW_ACCENT_BY_WEAKNESS } from '@/constants';

/**
 * Shadow 识破完成时播放的 WARNING 动画
 * 红色扫描 + "WARNING" 字样闪烁 + Shadow 名字/等级/弱点闪现
 * 总时长 3.55 秒（reveal 阶段延长 0.75s 让名称/弱点停留更久）
 */

interface Props {
  isOpen: boolean;
  shadowName: string;
  level: number;
  weakAttribute?: AttributeId;
  weakAttributeName?: string;
  onDone: () => void;
}

export function ShadowWarningOverlay({ isOpen, shadowName, level, weakAttribute, weakAttributeName, onDone }: Props) {
  const [phase, setPhase] = useState<'warn' | 'reveal' | 'out'>('warn');

  useEffect(() => {
    if (!isOpen) return;
    setPhase('warn');
    const t1 = setTimeout(() => setPhase('reveal'), 900);
    const t2 = setTimeout(() => setPhase('out'), 3150); // reveal 停留延长 0.75s
    const t3 = setTimeout(() => onDone(), 3550);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isOpen, onDone]);

  const accent = weakAttribute ? SHADOW_ACCENT_BY_WEAKNESS[weakAttribute].eye : '#ef4444';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[70] overflow-hidden pointer-events-auto cursor-default select-none"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Red scan lines */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(239,68,68,0.05) 3px, rgba(239,68,68,0.05) 4px)',
            }}
          />

          {/* Sweeping scan bar */}
          <motion.div
            initial={{ top: '-10%' }}
            animate={{ top: '110%' }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              height: 6,
              background: 'linear-gradient(180deg, transparent, rgba(239,68,68,0.55), transparent)',
              filter: 'blur(2px)',
            }}
          />

          {/* Border corners */}
          {phase === 'warn' && [
            { top: 12, left: 12, rotate: 0 },
            { top: 12, right: 12, rotate: 90 },
            { bottom: 12, right: 12, rotate: 180 },
            { bottom: 12, left: 12, rotate: 270 },
          ].map((p, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.5, 1] }}
              transition={{ duration: 0.9, delay: i * 0.08 }}
              className="absolute pointer-events-none"
              style={{
                ...p,
                width: 48,
                height: 48,
                borderTop: '3px solid #ef4444',
                borderLeft: '3px solid #ef4444',
                transform: `rotate(${p.rotate}deg)`,
              }}
            />
          ))}

          {/* Content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {phase === 'warn' && (
                <motion.div
                  key="warn"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.15, opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="text-center"
                >
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1, 0.5, 1] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                    className="text-6xl sm:text-7xl font-black tracking-[0.3em]"
                    style={{
                      color: '#ef4444',
                      textShadow: '0 0 20px #ef4444, 0 0 40px rgba(239,68,68,0.6)',
                      fontFamily: '"Impact", "Arial Black", sans-serif',
                    }}
                  >
                    WARNING
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.85 }}
                    transition={{ delay: 0.3 }}
                    className="mt-3 text-xs tracking-[0.5em] uppercase text-red-300"
                  >
                    shadow manifested
                  </motion.div>
                </motion.div>
              )}

              {phase === 'reveal' && (
                <motion.div
                  key="reveal"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.45 }}
                  className="text-center px-6"
                >
                  <motion.div
                    animate={{ textShadow: [`0 0 12px ${accent}`, `0 0 28px ${accent}`, `0 0 12px ${accent}`] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-[10px] tracking-[0.6em] uppercase font-bold"
                    style={{ color: accent }}
                  >
                    Lv.{level} Shadow
                  </motion.div>
                  <motion.h2
                    initial={{ scale: 0.8, letterSpacing: '0.5em', opacity: 0 }}
                    animate={{ scale: 1, letterSpacing: '0.15em', opacity: 1 }}
                    transition={{ duration: 0.7, delay: 0.1 }}
                    className="text-3xl sm:text-4xl font-black mt-3 text-white"
                    style={{
                      fontFamily: '"Noto Serif SC", "Songti SC", serif',
                      textShadow: `0 0 18px ${accent}80`,
                    }}
                  >
                    {shadowName}
                  </motion.h2>
                  {weakAttributeName && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.7 }}
                      className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full"
                      style={{
                        background: `${accent}15`,
                        border: `1px solid ${accent}60`,
                      }}
                    >
                      <span className="text-[10px] tracking-[0.3em] uppercase text-red-300">weak</span>
                      <span className="text-xs font-bold" style={{ color: accent }}>{weakAttributeName}</span>
                    </motion.div>
                  )}
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.65 }}
                    transition={{ delay: 1.0 }}
                    className="mt-5 text-xs text-red-200/70 tracking-[0.2em]"
                  >
                    已具现于你的内心 —— 准备好战斗
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
