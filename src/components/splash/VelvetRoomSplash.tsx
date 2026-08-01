/**
 * 「天鹅绒房间」入场动画（PRD_V2.6 §4，v2.6.1 按实测反馈调校）。
 *
 * 分镜（时间以 s 倍率缩放，s 来自「开屏速度」设置）：
 *   ① 纵深建立：门在**极远处**（-3200px），两侧走廊导轨向它收敛
 *   ② 灯带自远而近掠过 —— 严格分左右两列夹着门排布，形成纵深走廊
 *   ③ 镜头旋转着推进：场景整体 translateZ + rotate，门由小变大
 *   ④ 门先**看得见地**打开（52% 起转），门缝白光押后到 68% 才真正炸开
 *   ⑤ 白光充满 → 暗下来，标题浮出 + 上下两条大无衬线 THE VELVET 划过
 *   ⑥ 水波纹 + 粒子收尾
 *
 * 工程护栏：
 *   · 全程**只动 transform / opacity**；重复类动效走 CSS keyframes（合成器线程）
 *   · 灯带 12 根、星 10 颗、尘埃 16 粒，全部靠 animation-delay 错开复用，不每帧新建
 *   · D0（reduced-motion / 低性能）直接落到 ⑤，不放 ①–④
 *   · 任意点击立即跳到 ⑤ —— 开屏再好看也不能挡着人用
 */
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

/** 推进段总时长（秒，未乘 s）。实测反馈：门起点太近、整体偏短 → 由 2.5 拉到 3.0 */
const TRAVEL_SEC = 3.0;

/**
 * 灯带：**严格分左右两列**夹着门。
 * 首版是满宽横条随机散落，读起来像杂乱的划痕而不是走廊灯——
 * 现在每根都锚在离中轴固定距离的一侧，长度收到 22%，纵向均匀铺开，
 * 于是它们在透视里自然收敛成两道向门延伸的光轨。
 */
const LIGHT_BANDS = Array.from({ length: 12 }, (_, i) => {
  const side = i % 2 === 0 ? 'left' : 'right';
  const row = Math.floor(i / 2);          // 0..5，纵向六档
  return {
    side: side as 'left' | 'right',
    top: 14 + row * 13.5,
    delay: (i * 0.23) % TRAVEL_SEC,
    h: row % 3 === 0 ? 4 : 2.5,
  };
});

/** 开门瞬间背景里闪的十字星（PRD 反馈 §5）：位置固定、闪烁靠 delay 错开 */
const CROSS_STARS = Array.from({ length: 10 }, (_, i) => ({
  left: [12, 78, 26, 88, 8, 66, 40, 92, 20, 72][i],
  top: [18, 26, 72, 62, 46, 12, 84, 38, 58, 90][i],
  size: 8 + (i % 3) * 5,
  delay: (i * 0.19) % 1.4,
}));

/** 收尾漂浮的尘埃 */
const DUST = Array.from({ length: 16 }, (_, i) => ({
  left: ((i * 29) % 100) - 50,
  top: ((i * 17) % 64) - 12,
  dur: 1.6 + (i % 4) * 0.35,
  delay: 0.15 + i * 0.06,
}));

export function VelvetRoomSplash({ onComplete, s }: { onComplete: () => void; s: number }) {
  const anim = useBoldness();
  const [phase, setPhase] = useState<'travel' | 'flood' | 'title'>(anim ? 'travel' : 'title');
  const doneRef = useRef(false);

  const skip = () => setPhase((p) => (p === 'title' ? p : 'title'));

  useEffect(() => {
    if (phase !== 'travel') return;
    const t = setTimeout(() => setPhase('flood'), TRAVEL_SEC * 1000 * s);
    return () => clearTimeout(t);
  }, [phase, s]);
  useEffect(() => {
    if (phase !== 'flood') return;
    const t = setTimeout(() => setPhase('title'), 620 * s);
    return () => clearTimeout(t);
  }, [phase, s]);
  useEffect(() => {
    if (phase !== 'title' || doneRef.current) return;
    doneRef.current = true;
    const t = setTimeout(onComplete, (anim ? 2400 : 1200) * s);
    return () => clearTimeout(t);
  }, [phase, s, onComplete, anim]);

  const traveling = phase === 'travel';
  const T = TRAVEL_SEC * s;

  return (
    <div
      onClick={skip}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#05030f]"
      style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'strict' }}
    >
      <style>{`
        /* 灯带：极远 → 掠过镜头后方。只有 transform/opacity，交给合成器 */
        @keyframes vlv-band {
          0%   { transform: translateZ(-3400px) scaleX(0.5); opacity: 0; }
          16%  { opacity: 0.95; }
          84%  { opacity: 0.8; }
          100% { transform: translateZ(700px) scaleX(1.5); opacity: 0; }
        }
        /* 镜头推进：场景整体压向观众并缓缓旋转 */
        @keyframes vlv-dolly {
          0%   { transform: translateZ(0) rotate(-8deg); }
          100% { transform: translateZ(900px) rotate(3.5deg); }
        }
        /* 门：从**极远处**（-3200）放大到贴脸。实测反馈：起点要再靠后很多 */
        @keyframes vlv-door {
          0%   { transform: translateZ(-3200px); }
          100% { transform: translateZ(180px); }
        }
        /* 门扇：52% 起转 —— 比首版(58%)提前，且白光押后，于是"开门"这一下真的看得见 */
        @keyframes vlv-leaf-l { 0%, 52% { transform: rotateY(0deg); } 100% { transform: rotateY(-104deg); } }
        @keyframes vlv-leaf-r { 0%, 52% { transform: rotateY(0deg); } 100% { transform: rotateY(104deg); } }
        /* 门缝白光：68% 之前只是门中央一条克制的亮缝，之后才真正炸开 */
        @keyframes vlv-slit {
          0%      { transform: scaleX(0.05); opacity: 0.45; }
          68%     { transform: scaleX(0.16); opacity: 0.7; }
          100%    { transform: scaleX(1); opacity: 1; }
        }
        /* 背景星尘：极缓慢的整体漂移，给"空间是活的"这个底噪 */
        @keyframes vlv-drift {
          0%   { transform: translate3d(0,0,0); }
          50%  { transform: translate3d(-1.5%, 1.2%, 0); }
          100% { transform: translate3d(0,0,0); }
        }
        /* 十字星闪烁 */
        @keyframes vlv-twinkle {
          0%, 100% { transform: scale(0.35) rotate(0deg); opacity: 0; }
          45%      { transform: scale(1) rotate(12deg); opacity: 0.95; }
          70%      { transform: scale(0.8) rotate(18deg); opacity: 0.4; }
        }
        /* 上下两条大字划过（P3 展示字面：Arial Black + 描边空心） */
        @keyframes vlv-marquee-l { from { transform: translateX(-34%); } to { transform: translateX(6%); } }
        @keyframes vlv-marquee-r { from { transform: translateX(6%); }  to { transform: translateX(-34%); } }
        .vlv-band {
          position: absolute; width: 22%; border-radius: 999px;
          background: linear-gradient(90deg, rgba(120,150,255,0) 0%, rgba(196,214,255,0.98) 50%, rgba(255,255,255,0) 100%);
          will-change: transform, opacity;
        }
        .vlv-marquee {
          white-space: nowrap; font-size: clamp(4.2rem, 20vw, 12rem); font-weight: 900; font-style: italic;
          font-family: "Arial Black", "Noto Sans SC", sans-serif;
          color: transparent; -webkit-text-stroke: 1px rgba(169,188,255,0.5);
          letter-spacing: -0.02em; line-height: 1;
        }
      `}</style>

      {/* ② 背景星尘：travel 与 title 两相都在，给整块画面一个缓慢呼吸的底 */}
      {anim && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-6%]"
          style={{
            background:
              'radial-gradient(1.4px 1.4px at 12% 22%, rgba(190,205,255,0.8), transparent 60%),'
              + 'radial-gradient(1.6px 1.6px at 68% 14%, rgba(210,222,255,0.7), transparent 60%),'
              + 'radial-gradient(1.2px 1.2px at 32% 76%, rgba(170,190,255,0.7), transparent 60%),'
              + 'radial-gradient(1.8px 1.8px at 84% 62%, rgba(200,215,255,0.65), transparent 60%),'
              + 'radial-gradient(1.3px 1.3px at 52% 46%, rgba(180,200,255,0.6), transparent 60%),'
              + 'radial-gradient(1.5px 1.5px at 8% 58%, rgba(200,214,255,0.6), transparent 60%),'
              + 'radial-gradient(1.2px 1.2px at 92% 32%, rgba(185,205,255,0.6), transparent 60%),'
              + 'radial-gradient(1.4px 1.4px at 44% 88%, rgba(195,210,255,0.55), transparent 60%)',
            animation: `vlv-drift ${14 * s}s ease-in-out infinite`,
            willChange: 'transform',
          }}
        />
      )}
      {/* 晕影：把注意力压向中央的门 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 48%, transparent 32%, rgba(3,2,10,0.72) 78%)' }}
      />

      {traveling && (
        <div className="absolute inset-0" style={{ perspective: 900, perspectiveOrigin: '50% 48%' }}>
          <div
            className="absolute inset-0"
            style={{
              transformStyle: 'preserve-3d',
              animation: `vlv-dolly ${T}s cubic-bezier(0.55,0,0.85,0.35) forwards`,
              willChange: 'transform',
            }}
          >
            {/* 走廊导轨：四条向门收敛的长线。没有它，门就是一块浮在纯黑里的方片 */}
            {[
              { x: '6%', y: '18%', rot: 9 },
              { x: '6%', y: '82%', rot: -9 },
              { x: '94%', y: '18%', rot: -9 },
              { x: '94%', y: '82%', rot: 9 },
            ].map((r, i) => (
              <span
                key={`rail${i}`}
                aria-hidden
                className="absolute"
                style={{
                  left: r.x, top: r.y, width: '46%', height: 1.5,
                  marginLeft: i >= 2 ? '-46%' : 0,
                  transform: `rotate(${r.rot}deg) translateZ(-900px)`,
                  background: 'linear-gradient(90deg, rgba(120,140,230,0) 0%, rgba(146,168,255,0.4) 70%, rgba(200,215,255,0.68) 100%)',
                }}
              />
            ))}

            {/* ② 灯带：左右两列夹着门 */}
            {LIGHT_BANDS.map((b, i) => (
              <span
                key={i}
                aria-hidden
                className="vlv-band"
                style={{
                  top: `${b.top}%`,
                  height: b.h,
                  [b.side]: '7%',
                  animation: `vlv-band ${TRAVEL_SEC * 0.92 * s}s linear ${b.delay * s}s infinite`,
                } as CSSProperties}
              />
            ))}

            {/* ⑤ 开门瞬间的十字星（travel 后段才浮现） */}
            {CROSS_STARS.map((st, i) => (
              <span
                key={`st${i}`}
                aria-hidden
                className="absolute"
                style={{
                  left: `${st.left}%`, top: `${st.top}%`, width: st.size, height: st.size,
                  transform: 'translateZ(-260px)',
                  animation: `vlv-twinkle ${1.5 * s}s ease-in-out ${(T * 0.52 + st.delay * s)}s infinite`,
                  background:
                    'linear-gradient(to bottom, transparent 44%, rgba(255,255,255,0.95) 50%, transparent 56%),'
                    + 'linear-gradient(to right, transparent 44%, rgba(255,255,255,0.95) 50%, transparent 56%)',
                  filter: 'drop-shadow(0 0 4px rgba(200,215,255,0.9))',
                  willChange: 'transform, opacity',
                }}
              />
            ))}

            {/* ①③④ 门 */}
            <div
              className="absolute left-1/2 top-1/2"
              style={{
                width: 280, height: 420, marginLeft: -140, marginTop: -210,
                transformStyle: 'preserve-3d',
                animation: `vlv-door ${T}s cubic-bezier(0.42,0,0.8,0.45) forwards`,
                willChange: 'transform',
              }}
            >
              <span
                aria-hidden
                className="absolute"
                style={{
                  inset: -7,
                  border: '2px solid rgba(160,182,255,0.55)',
                  boxShadow: '0 0 26px rgba(120,150,255,0.45), inset 0 0 18px rgba(120,150,255,0.25)',
                }}
              />
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-full"
                style={{
                  background: 'radial-gradient(ellipse at 50% 50%, #ffffff 0%, #e2eaff 45%, rgba(180,200,255,0) 78%)',
                  boxShadow: '0 0 40px 12px rgba(210,225,255,0.5)',
                  animation: `vlv-slit ${T}s cubic-bezier(0.7,0,0.9,0.4) forwards`,
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
                    background: 'linear-gradient(160deg, #2a1f58 0%, #160f33 55%, #0a0720 100%)',
                    borderTop: '2px solid rgba(150,170,255,0.35)',
                    borderBottom: '2px solid rgba(150,170,255,0.2)',
                    [side === 'l' ? 'borderLeft' : 'borderRight']: '2px solid rgba(150,170,255,0.3)',
                    animation: `vlv-leaf-${side} ${T}s cubic-bezier(0.3,0,0.15,1) forwards`,
                    willChange: 'transform',
                  } as CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 白光充满画面 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={false}
        animate={{ opacity: phase === 'flood' ? 1 : 0 }}
        transition={{ duration: (phase === 'flood' ? 0.3 : 0.55) * s, ease: 'easeOut' }}
        style={{ background: 'radial-gradient(circle at 50% 48%, #ffffff 0%, #eef3ff 40%, #cdd8ff 100%)' }}
      />

      {/* ⑤ 上下两条大无衬线 THE VELVET 划过（P3 展示字面） */}
      {phase === 'title' && anim && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-[7%] select-none overflow-hidden">
            <div className="vlv-marquee" style={{ animation: `vlv-marquee-l ${3.4 * s}s linear forwards` }}>THE VELVET</div>
          </div>
          <div className="pointer-events-none absolute bottom-[7%] left-0 right-0 select-none overflow-hidden">
            <div className="vlv-marquee" style={{ animation: `vlv-marquee-r ${3.4 * s}s linear forwards` }}>THE VELVET</div>
          </div>
        </>
      )}

      {/* ⑤⑥ 标题 + 水波纹 + 尘埃 */}
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
          {anim && DUST.map((d, i) => (
            <motion.span
              key={`p${i}`}
              aria-hidden
              className="absolute h-1 w-1 rounded-full bg-[#c9d6ff]"
              style={{ left: `${d.left}%`, top: `${d.top}%`, willChange: 'transform, opacity' }}
              initial={{ y: 26, opacity: 0, scale: 0.4 }}
              animate={{ y: -76, opacity: [0, 0.9, 0], scale: [0.4, 1, 0.5] }}
              transition={{ duration: d.dur * s, delay: d.delay * s, ease: 'easeOut' }}
            />
          ))}

          {/* 标题动效：逐字上浮 + 整体从疏到密收拢 */}
          <motion.h1
            initial={{ opacity: 0, scale: anim ? 1.16 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0 * s, ease: [0.2, 0, 0.1, 1] }}
            className="relative flex text-[clamp(2.1rem,11vw,4rem)] font-black leading-none text-white"
            style={{ fontFamily: '"Noto Sans SC", "Arial Black", Arial, sans-serif' }}
            aria-label="靛蓝色房间"
          >
            {'靛蓝色房间'.split('').map((ch, i) => (
              <motion.span
                key={i}
                aria-hidden
                initial={{ opacity: 0, y: anim ? 26 : 0, filter: anim ? 'blur(6px)' : 'none' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.62 * s, delay: (0.1 + i * 0.085) * s, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'inline-block', willChange: 'transform, opacity' }}
              >
                {ch}
              </motion.span>
            ))}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: anim ? 10 : 0, letterSpacing: anim ? '0.9em' : '0.42em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '0.42em' }}
            transition={{ duration: 0.9 * s, delay: 0.62 * s, ease: [0.16, 1, 0.3, 1] }}
            className="relative mt-3 text-[clamp(0.7rem,3.4vw,0.95rem)] italic text-[#a9bcff]"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            THE VELVET
          </motion.p>
        </div>
      )}
    </div>
  );
}
