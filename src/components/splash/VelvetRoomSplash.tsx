/**
 * 「天鹅绒房间」入场动画（PRD_V2.6 §4）—— 取代旧的 velvet 开屏。
 *
 * 分镜（时间以 s 倍率缩放，s 来自「开屏速度」设置）：
 *   ① 纵深建立：透视场景，门在最远处（translateZ 很负，看着极小）
 *   ② 灯带自远而近掠过镜头 —— **速度感来自灯，不是门**（地铁车厢窗外那种）
 *   ③ 镜头旋转着推进：场景整体 translateZ + rotate，门由小变大
 *   ④ 门向两侧开启，门缝白光溢出充满画面
 *   ⑤ 暗下来，标题浮出：靛蓝色房间（大号无衬线）+ THE VELVET（小号衬线）
 *   ⑥ 水波纹 + 粒子收尾
 *
 * 工程护栏：
 *   · 全程**只动 transform / opacity**；灯带走 CSS keyframes（合成器线程，不进主线程）
 *   · 灯带只有 10 根实体，靠 animation-delay 错开复用，不每帧新建
 *   · D0（reduced-motion / 低性能）直接落到 ⑤，不放 ①–④
 *   · 任意点击立即跳到 ⑤ —— 开屏再好看也不能挡着人用
 */
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

/** 左右交替贴边、纵向错落；delay 错开形成连续掠过感 */
const LIGHT_BANDS = Array.from({ length: 10 }, (_, i) => ({
  side: (i % 2 === 0 ? 'left' : 'right') as 'left' | 'right',
  top: 6 + ((i * 37) % 78),
  delay: (i * 0.26) % 2.6,
  h: i % 3 === 0 ? 5 : 3,
}));

export function VelvetRoomSplash({ onComplete, s }: { onComplete: () => void; s: number }) {
  const anim = useBoldness();
  const [phase, setPhase] = useState<'travel' | 'flood' | 'title'>(anim ? 'travel' : 'title');
  const doneRef = useRef(false);

  const skip = () => setPhase((p) => (p === 'title' ? p : 'title'));

  useEffect(() => {
    if (phase !== 'travel') return;
    const t = setTimeout(() => setPhase('flood'), 2300 * s);
    return () => clearTimeout(t);
  }, [phase, s]);
  useEffect(() => {
    if (phase !== 'flood') return;
    const t = setTimeout(() => setPhase('title'), 700 * s);
    return () => clearTimeout(t);
  }, [phase, s]);
  useEffect(() => {
    if (phase !== 'title' || doneRef.current) return;
    doneRef.current = true;
    const t = setTimeout(onComplete, (anim ? 1900 : 1200) * s);
    return () => clearTimeout(t);
  }, [phase, s, onComplete, anim]);

  const traveling = phase === 'travel';

  return (
    <div
      onClick={skip}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#05030f]"
      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'strict' }}
    >
      <style>{`
        @keyframes vlv-band {
          0%   { transform: translateZ(-1800px) scaleX(0.4); opacity: 0; }
          14%  { opacity: 0.92; }
          82%  { opacity: 0.85; }
          100% { transform: translateZ(620px) scaleX(1.7); opacity: 0; }
        }
        @keyframes vlv-dolly {
          0%   { transform: translateZ(0) rotate(-7deg); }
          100% { transform: translateZ(780px) rotate(3.5deg); }
        }
        @keyframes vlv-door {
          0%   { transform: translateZ(-1750px); }
          100% { transform: translateZ(140px); }
        }
        @keyframes vlv-leaf-l { 0%, 58% { transform: rotateY(0deg); } 100% { transform: rotateY(-96deg); } }
        @keyframes vlv-leaf-r { 0%, 58% { transform: rotateY(0deg); } 100% { transform: rotateY(96deg); } }
        @keyframes vlv-slit {
          0%, 50% { transform: scaleX(0.06); opacity: 0.55; }
          100%    { transform: scaleX(1); opacity: 1; }
        }
        .vlv-band {
          position: absolute; width: 46%; border-radius: 999px;
          background: linear-gradient(90deg, rgba(120,150,255,0) 0%, rgba(190,208,255,0.95) 45%, rgba(255,255,255,0) 100%);
          will-change: transform, opacity;
        }
      `}</style>

      {traveling && (
        <div className="absolute inset-0" style={{ perspective: 900, perspectiveOrigin: '50% 48%' }}>
          <div
            className="absolute inset-0"
            style={{
              transformStyle: 'preserve-3d',
              animation: `vlv-dolly ${2.5 * s}s cubic-bezier(0.55,0,0.85,0.35) forwards`,
              willChange: 'transform',
            }}
          >
            {/* ② 灯带 */}
            {LIGHT_BANDS.map((b, i) => (
              <span
                key={i}
                aria-hidden
                className="vlv-band"
                style={{
                  top: `${b.top}%`,
                  height: b.h,
                  [b.side]: '2%',
                  animation: `vlv-band ${2.6 * s}s linear ${b.delay * s}s infinite`,
                } as CSSProperties}
              />
            ))}

            {/* 走廊导轨：四条长线沿两侧向门收敛。
                没有它，门就是一块浮在纯黑里的方片——纵深要有参照物才成立。
                它们和门在同一个 preserve-3d 里，跟着 dolly 一起推进，不额外动画。 */}
            {[
              { x: '4%', y: '16%', rot: 10 },
              { x: '4%', y: '84%', rot: -10 },
              { x: '96%', y: '16%', rot: -10 },
              { x: '96%', y: '84%', rot: 10 },
            ].map((r, i) => (
              <span
                key={`rail${i}`}
                aria-hidden
                className="absolute"
                style={{
                  left: r.x, top: r.y, width: '52%', height: 1.5,
                  marginLeft: i >= 2 ? '-52%' : 0,
                  transform: `rotate(${r.rot}deg) translateZ(-700px)`,
                  background: 'linear-gradient(90deg, rgba(120,140,230,0) 0%, rgba(146,168,255,0.42) 70%, rgba(200,215,255,0.7) 100%)',
                }}
              />
            ))}

            {/* ①③④ 门：最远处 → 贴脸，末段两扇张开 */}
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: 280, height: 420, marginLeft: -140, marginTop: -210,
                transformStyle: 'preserve-3d',
                animation: `vlv-door ${2.5 * s}s cubic-bezier(0.5,0,0.85,0.4) forwards`,
                willChange: 'transform',
              }}
            >
              {/* 发光门框：门要先"是一扇门"，纵深才有意义 */}
              <span
                aria-hidden
                className="absolute"
                style={{
                  inset: -7,
                  border: '2px solid rgba(160,182,255,0.55)',
                  boxShadow: '0 0 26px rgba(120,150,255,0.45), inset 0 0 18px rgba(120,150,255,0.25)',
                }}
              />
              {/* 门缝白光：压在门扇之后，开门即露出。
                  scaleX 从 0.06 起——一开始就是门中央一条亮缝，而不是全黑到最后才亮 */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-full"
                style={{
                  background: 'radial-gradient(ellipse at 50% 50%, #ffffff 0%, #e2eaff 45%, rgba(180,200,255,0) 78%)',
                  boxShadow: '0 0 40px 12px rgba(210,225,255,0.55)',
                  animation: `vlv-slit ${2.5 * s}s ease-in forwards`,
                  willChange: 'transform, opacity',
                }}
              />
              {(['l', 'r'] as const).map((side) => (
                <span
                  key={side}
                  aria-hidden
                  className="absolute inset-y-0 w-1/2"
                  style={{
                    [side === 'l' ? 'left' : 'right']: 0,
                    transformOrigin: side === 'l' ? 'left center' : 'right center',
                    background: 'linear-gradient(160deg, #241a4d 0%, #140e2e 55%, #0a0720 100%)',
                    borderTop: '2px solid rgba(150,170,255,0.35)',
                    borderBottom: '2px solid rgba(150,170,255,0.2)',
                    [side === 'l' ? 'borderLeft' : 'borderRight']: '2px solid rgba(150,170,255,0.3)',
                    animation: `vlv-leaf-${side} ${2.5 * s}s cubic-bezier(0.4,0,0.2,1) forwards`,
                    willChange: 'transform',
                  } as CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ④ 白光充满画面 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={false}
        animate={{ opacity: phase === 'flood' ? 1 : 0 }}
        transition={{ duration: (phase === 'flood' ? 0.34 : 0.5) * s, ease: 'easeOut' }}
        style={{ background: 'radial-gradient(circle at 50% 48%, #ffffff 0%, #eef3ff 40%, #cdd8ff 100%)' }}
      />

      {/* ⑤⑥ 标题 + 水波纹 + 粒子 */}
      {phase === 'title' && (
        <div className="relative flex flex-col items-center">
          {anim && [0, 1, 2].map((i) => (
            <motion.span
              key={`r${i}`}
              aria-hidden
              className="absolute rounded-full border"
              style={{ width: 120, height: 120, borderColor: 'rgba(150,175,255,0.5)', willChange: 'transform, opacity' }}
              initial={{ scale: 0.3, opacity: 0.85 }}
              animate={{ scale: 5.4, opacity: 0 }}
              transition={{ duration: 2.1 * s, delay: i * 0.36 * s, ease: 'easeOut' }}
            />
          ))}
          {anim && Array.from({ length: 14 }).map((_, i) => (
            <motion.span
              key={`p${i}`}
              aria-hidden
              className="absolute h-1 w-1 rounded-full bg-[#c9d6ff]"
              style={{ left: `${((i * 29) % 100) - 50}%`, top: `${((i * 17) % 60) - 10}%`, willChange: 'transform, opacity' }}
              initial={{ y: 24, opacity: 0, scale: 0.4 }}
              animate={{ y: -70, opacity: [0, 0.9, 0], scale: [0.4, 1, 0.5] }}
              transition={{ duration: (1.6 + (i % 4) * 0.35) * s, delay: (0.2 + i * 0.07) * s, ease: 'easeOut' }}
            />
          ))}

          <motion.h1
            initial={{ opacity: 0, scale: anim ? 1.14 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9 * s, ease: [0.2, 0, 0.1, 1] }}
            className="relative text-[clamp(2.1rem,11vw,4rem)] font-black leading-none tracking-[0.02em] text-white"
            style={{ fontFamily: '"Noto Sans SC", Arial, sans-serif' }}
          >
            靛蓝色房间
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: anim ? 10 : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 * s, delay: 0.45 * s }}
            className="relative mt-3 text-[clamp(0.7rem,3.4vw,0.95rem)] italic tracking-[0.42em] text-[#a9bcff]"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            THE VELVET
          </motion.p>
        </div>
      )}
    </div>
  );
}
