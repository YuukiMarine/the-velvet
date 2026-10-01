/**
 * 专辑墙铭牌背后那枚「跟着翻牌动」的背景件——同伴专辑墙和组织名册的专辑墙共用。
 *   红：暗红同心五角星，每翻一张转 60°（左右翻分别是 ∓60°）；
 *   黄：实色四角星（频道签名件 P4Sparkle），每翻一张转 90°；
 *   蓝：不转，每翻一张从铭牌处推出两圈水波（这里用 key=index 重挂 = 重播一遍）；
 *   中性：同伴墙没有；名册墙可以要一圈虚线环（neutralRing），每翻一张转 45°。
 * 放在铭牌容器里（容器要 relative，并且自成层叠上下文，-z-10 才是压在铭牌字下面而不是沉到页面背景后面）。
 */
import { motion } from 'motion/react';
import { P3R } from '@/components/p3r/kit';
import { starPts } from '@/components/p5r/kit';
import { P4Sparkle } from '@/ui/p4Kit';

const SPIN = { type: 'spring' as const, stiffness: 140, damping: 15, mass: 0.9 };

/**
 * P3 换牌水波：两圈同心圆环从铭牌处推开、扩到最大时化掉。
 * 环用 motion 补间 SVG 的 r 属性画，描边粗细恒定——拿带 border 的 div 去 scale，
 * 边会跟着放大成一圈粗白箍（与长按轮盘的圆环同一套做法）。
 */
export const P3SwitchRipple = () => (
  <svg
    aria-hidden
    className="pointer-events-none absolute left-1/2 top-1/2 -z-10"
    style={{ width: 460, height: 460, marginLeft: -230, marginTop: -212, overflow: 'visible' }}
    viewBox="0 0 460 460"
  >
    {/* 两圈就够（三圈太吵），再粗一档，并且更早化掉：opacity 的 times 前移 */}
    {[0, 1].map((i) => (
      <motion.circle
        key={i}
        cx={230}
        cy={230}
        fill="none"
        stroke={i === 1 ? P3R.blue : P3R.cyan}
        strokeWidth={i === 1 ? 7 : 5.5}
        initial={{ r: 18, opacity: 0 }}
        animate={{ r: 158 + i * 70, opacity: [0, 0.5, 0.2, 0] }}
        transition={{ duration: 0.9, delay: i * 0.11, ease: [0.16, 0.7, 0.35, 1], opacity: { duration: 0.9, delay: i * 0.11, times: [0, 0.1, 0.38, 0.72] } }}
      />
    ))}
  </svg>
);

export function WallSpinBackdrop({ channel, index, neutralRing = false, ringColor = 'rgba(99,102,241,0.22)' }: {
  channel: 'p3' | 'p4' | 'p5' | 'neutral';
  /** 现在翻到第几张（转角 / 重播都跟着它） */
  index: number;
  /** 中性频道要不要一圈虚线环（同伴墙不要） */
  neutralRing?: boolean;
  ringColor?: string;
}) {
  if (channel === 'p4') {
    return (
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10"
        style={{ width: 300, height: 300, marginLeft: -150, marginTop: -136 }}
        animate={{ rotate: index * 90 }}
        transition={SPIN}
      >
        {/* 黄频道的对位件：**实色**四角星（四条腰是深深内凹的曲线，不是同心描边），每翻一张转 90°（红是同心五角星转 60°） */}
        <P4Sparkle size={300} color="rgba(19,19,19,0.12)" />
      </motion.div>
    );
  }
  if (channel === 'p5') {
    return (
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10"
        style={{ width: 330, height: 330, marginLeft: -165, marginTop: -150 }}
        animate={{ rotate: index * 60 }}
        transition={SPIN}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {[50, 39, 28, 17, 6].map((r) => (
            <polygon key={r} points={starPts(50, 50, r, -90 + 14)} fill="none" stroke="#4a0004" strokeWidth={2.4} strokeLinejoin="miter" />
          ))}
        </svg>
      </motion.div>
    );
  }
  if (channel === 'p3') return <P3SwitchRipple key={index} />;
  if (!neutralRing) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -z-10"
      style={{ width: 300, height: 300, marginLeft: -150, marginTop: -136 }}
      animate={{ rotate: index * 45 }}
      transition={SPIN}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <circle cx={50} cy={50} r={47} fill="none" stroke={ringColor} strokeWidth={1.6} strokeDasharray="6 5" />
        <circle cx={50} cy={50} r={36} fill="none" stroke={ringColor} strokeWidth={1} />
        {[0, 90, 180, 270].map(a => (
          <rect key={a} x={48.5} y={0.5} width={3} height={7} fill={ringColor} transform={`rotate(${a} 50 50)`} />
        ))}
      </svg>
    </motion.div>
  );
}
