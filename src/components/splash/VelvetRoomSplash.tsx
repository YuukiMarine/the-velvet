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
 * 走廊两侧的**白色门板**（参考图 2：天鹅绒房间长廊里立在两壁的一扇扇白门）。
 *
 * 首版是细长光带，读起来像划痕；这版换成有体积的门板——
 * 立在左右两壁、朝内微转，随镜头由远而近掠过。
 * **不做 opacity 衰减**（用户口径）：它们就是实体的门，不是会淡出的光，
 * 掠出视锥即离场，靠 3D 裁切收尾而不是靠变透明。
 */
const SIDE_DOORS = Array.from({ length: 10 }, (_, i) => {
  const side = i % 2 === 0 ? 'left' : 'right';
  const slot = Math.floor(i / 2);         // 0..4，纵深五档
  return {
    side: side as 'left' | 'right',
    // 越靠后的门离中轴越近（透视收敛），高度也略矮
    inset: 3 + slot * 1.6,
    h: 46 - slot * 3.5,
    delay: (i * 0.31) % TRAVEL_SEC,
  };
});

/**
 * 开门瞬间背景里闪的**四角星**（PRD 反馈 §5）。
 * 首版用两条交叉线性渐变画，出来是个规规矩矩的「+」——
 * 要的是四角星：四条尖角向外收细，外加一圈放射状光晕。
 * 形状用 clip-path 的八点多边形（四个长尖 + 四个内凹腰），光晕用 drop-shadow 叠。
 */
const STAR_CLIP = 'polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%)';
const CROSS_STARS = Array.from({ length: 12 }, (_, i) => ({
  left: [12, 78, 26, 88, 8, 66, 40, 92, 20, 72, 34, 58][i],
  top: [18, 26, 72, 62, 46, 12, 84, 38, 58, 90, 8, 78][i],
  size: 14 + (i % 3) * 9,
  delay: (i * 0.17) % 1.4,
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
  const [phase, setPhase] = useState<'preroll' | 'travel' | 'flood' | 'title'>(anim ? 'preroll' : 'title');
  const doneRef = useRef(false);

  const skip = () => setPhase((p) => (p === 'title' ? p : 'title'));

  // 前置擦除：0.25s（用户口径），不随速度倍率拉长——它是"起手式"，长了就拖沓
  useEffect(() => {
    if (phase !== 'preroll') return;
    const t = setTimeout(() => setPhase('travel'), 250);
    return () => clearTimeout(t);
  }, [phase]);
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
/* 侧门板：极远 → 掠过镜头。**全程 opacity 1，不衰减**（用户口径：
           它们是实体的门，不是会淡出的光；掠出视锥即离场） */
        @keyframes vlv-sidedoor {
          from { transform: translateZ(-3400px); }
          to   { transform: translateZ(780px); }
        }
        /* 镜头推进：场景整体压向观众并缓缓旋转 */
        @keyframes vlv-dolly {
          0%   { transform: translateZ(0) rotate(-8deg); }
          100% { transform: translateZ(900px) rotate(3.5deg); }
        }
        /* 门：从**极远处**（-3200）放大到贴脸。实测反馈：起点要再靠后很多 */
        @keyframes vlv-door {
          0%   { transform: translateZ(-4200px); }
          100% { transform: translateZ(180px); }
        }
        /* 门扇：52% 起转 —— 比首版(58%)提前，且白光押后，于是"开门"这一下真的看得见 */
        @keyframes vlv-leaf-l { 0%, 52% { transform: rotateY(0deg); } 100% { transform: rotateY(-104deg); } }
        @keyframes vlv-leaf-r { 0%, 52% { transform: rotateY(0deg); } 100% { transform: rotateY(104deg); } }
/* 门缝白光：**关键帧与门扇逐帧对齐**。
           首版是一团糊在门中间不动的高光（用户上报"有点好笑"）——
           根因是它只在最后 32% 才开始变宽，前面 68% 都停在同一个 scaleX 上、
           而且底纹是个大范围 radial 模糊团，看不出"缝"的形状。
           现在：52% 门扇起转，缝光就同步开始变宽变白，一路推到满屏，
           曲线与 leaf 同款（linear 段更长），于是"门缝随开门张大"是连续可见的。 */
        @keyframes vlv-slit {
          0%   { transform: scaleX(0.035); opacity: 0.5;  filter: brightness(0.75); }
          52%  { transform: scaleX(0.05);  opacity: 0.62; filter: brightness(0.9); }
          70%  { transform: scaleX(0.30);  opacity: 0.85; filter: brightness(1.25); }
          86%  { transform: scaleX(0.62);  opacity: 0.95; filter: brightness(1.6); }
          100% { transform: scaleX(1);     opacity: 1;    filter: brightness(2.1); }
        }
        /* 背景星尘：极缓慢的整体漂移，给"空间是活的"这个底噪 */
        @keyframes vlv-drift {
          0%   { transform: translate3d(0,0,0); }
          50%  { transform: translate3d(-1.5%, 1.2%, 0); }
          100% { transform: translate3d(0,0,0); }
        }
/* 四角星闪烁（本体）+ 放射光晕（外圈，转速略慢形成层次） */
        @keyframes vlv-twinkle {
          0%, 100% { transform: scale(0.2) rotate(0deg); opacity: 0; }
          40%      { transform: scale(1) rotate(10deg); opacity: 1; }
          72%      { transform: scale(0.78) rotate(16deg); opacity: 0.45; }
        }
        @keyframes vlv-rays {
          0%, 100% { transform: scale(0.4) rotate(0deg); opacity: 0; }
          40%      { transform: scale(1.5) rotate(-8deg); opacity: 0.6; }
          72%      { transform: scale(2.1) rotate(-14deg); opacity: 0; }
        }
        /* 前置擦除（0.25s）：黑底里擦出一条白色长矩形 → 转成靛色 → 交棒给门场景 */
        @keyframes vlv-preroll {
          0%   { transform: scaleX(0) scaleY(1); background: #ffffff; }
          46%  { transform: scaleX(1) scaleY(1); background: #ffffff; }
          72%  { transform: scaleX(1) scaleY(1.9); background: #b9c8ff; }
          100% { transform: scaleX(1) scaleY(26); background: #140e2e; }
        }
        /* 上下两条大字划过（P3 展示字面：Arial Black + 描边空心） */
        @keyframes vlv-marquee-l { from { transform: translateX(-34%); } to { transform: translateX(6%); } }
        @keyframes vlv-marquee-r { from { transform: translateX(6%); }  to { transform: translateX(-34%); } }
.vlv-sidedoor {
          position: absolute;
          background: linear-gradient(180deg, #ffffff 0%, #f2f6ff 62%, #d8e3ff 100%);
          box-shadow: 0 0 26px rgba(190,210,255,0.5);
          will-change: transform;
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

      {/* ⓪ 前置擦除（0.25s）：黑底里横向擦出一条白色长矩形 → 转靛色 → 纵向撑开交棒给门场景。
          它是整段动画的"起手式"：先给一个干净的白，再从白里长出这个空间。 */}
      {phase === 'preroll' && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2"
          style={{
            height: 10,
            transformOrigin: 'center',
            animation: 'vlv-preroll 250ms cubic-bezier(0.6,0,0.2,1) forwards',
            willChange: 'transform, background',
          }}
        />
      )}

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

            {/* ② 两壁的白色门板（图 2 参考形态）：立在左右墙上、朝内微转，随镜头掠过 */}
            {SIDE_DOORS.map((d, i) => (
              <span
                key={i}
                aria-hidden
                className="vlv-sidedoor"
                style={{
                  [d.side]: `${d.inset}%`,
                  top: `${50 - d.h / 2}%`,
                  width: '11%',
                  height: `${d.h}%`,
                  // 朝走廊内侧转 —— 左壁的门右转、右壁的门左转，形成"两侧对开"的观感
                  transformOrigin: d.side === 'left' ? 'right center' : 'left center',
                  animation: `vlv-sidedoor ${TRAVEL_SEC * 0.95 * s}s linear ${d.delay * s}s infinite`,
                  rotate: `${d.side === 'left' ? -16 : 16}deg`,
                } as CSSProperties}
              />
            ))}

            {/* ⑤ 开门瞬间的四角星：本体 clip-path 八点星 + 外圈放射光晕，两层转速不同 */}
            {CROSS_STARS.map((st, i) => (
              <span
                key={`st${i}`}
                aria-hidden
                className="absolute"
                style={{
                  left: `${st.left}%`, top: `${st.top}%`, width: st.size, height: st.size,
                  transform: 'translateZ(-260px)',
                }}
              >
                {/* 放射光晕 */}
                <span
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(190,212,255,0.35) 34%, transparent 70%)',
                    animation: `vlv-rays ${1.7 * s}s ease-out ${(T * 0.5 + st.delay * s)}s infinite`,
                    willChange: 'transform, opacity',
                  }}
                />
                {/* 星本体 */}
                <span
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(180deg, #ffffff 0%, #dbe6ff 100%)',
                    clipPath: STAR_CLIP,
                    filter: 'drop-shadow(0 0 6px rgba(200,220,255,0.95))',
                    animation: `vlv-twinkle ${1.5 * s}s ease-in-out ${(T * 0.5 + st.delay * s)}s infinite`,
                    willChange: 'transform, opacity',
                  }}
                />
              </span>
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
