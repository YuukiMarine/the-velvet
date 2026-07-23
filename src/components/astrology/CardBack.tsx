import { motion } from 'motion/react';
import { useUiChannel } from '@/ui/useUiChannel';

/** P4 卡背用的五瓣小花（SVG 内联版，cx/cy 为中心） */
const P4BackFlower = ({ cx, cy, r = 10, color = '#f0b428' }: { cx: number; cy: number; r?: number; color?: string }) => (
  <g transform={`translate(${cx}, ${cy})`}>
    {[0, 72, 144, 216, 288].map(deg => (
      <ellipse key={deg} cx={0} cy={-r * 0.55} rx={r * 0.32} ry={r * 0.5} fill={color} transform={`rotate(${deg})`} />
    ))}
  </g>
);

interface CardBackProps {
  width?: number;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
  hoverable?: boolean;
  /** 禁用点击态但保留外观 */
  disabled?: boolean;
}

/**
 * 统一卡背：深色 + 金色荆棘纹 + 中央眼睛
 * 作为翻开前的卡牌外观，尺寸/比例与 TarotCardSVG 相同 (2:3.2)
 */
export function CardBack({
  width = 160,
  onClick,
  selected = false,
  className = '',
  hoverable = true,
  disabled = false,
}: CardBackProps) {
  const height = Math.round(width * 1.6);
  const VB_W = 200;
  const VB_H = 320;
  const interactive = !!onClick && !disabled;
  const isP4 = useUiChannel() === 'p4';

  // ── P4 卡背（p4-astrology-reference-v2 1:1）：奶油底黑细框 + 黄圆黑星靶心 + 角落黄花 ──
  if (isP4) {
    return (
      <motion.div
        onClick={interactive ? onClick : undefined}
        whileHover={hoverable && interactive ? { y: -4 } : undefined}
        whileTap={interactive ? { scale: 0.97 } : undefined}
        className={`relative inline-block select-none ${interactive ? 'cursor-pointer' : ''} ${className}`}
        style={{ width, height, opacity: disabled ? 0.5 : 1 }}
      >
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 pointer-events-none"
            style={{ boxShadow: '0 0 0 4px var(--ui-accent)', borderRadius: 14 }}
          />
        )}
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={width} height={height} style={{ display: 'block' }}>
          {/* 奶油底板 + 黑色双框 */}
          <rect x="2" y="2" width={VB_W - 4} height={VB_H - 4} rx="14" fill="#fff6d0" stroke="#131313" strokeWidth="3" />
          <rect x="12" y="12" width={VB_W - 24} height={VB_H - 24} rx="8" fill="none" stroke="#131313" strokeWidth="1.4" opacity="0.85" />
          {/* 虚线圆规线 */}
          <circle cx={VB_W / 2} cy={VB_H / 2} r="74" fill="none" stroke="#131313" strokeWidth="1" strokeDasharray="2 5" opacity="0.4" />
          {/* 黄色靶心圆 + 内白环 + 黑圆 + 白四角星 */}
          <circle cx={VB_W / 2} cy={VB_H / 2} r="56" fill="#ffd900" />
          <circle cx={VB_W / 2} cy={VB_H / 2} r="40" fill="none" stroke="#fff6d0" strokeWidth="5" />
          <circle cx={VB_W / 2} cy={VB_H / 2} r="27" fill="#131313" />
          <path
            d={`M ${VB_W / 2} ${VB_H / 2 - 15} C ${VB_W / 2 + 3} ${VB_H / 2 - 4}, ${VB_W / 2 + 4} ${VB_H / 2 - 3}, ${VB_W / 2 + 15} ${VB_H / 2}
               C ${VB_W / 2 + 4} ${VB_H / 2 + 3}, ${VB_W / 2 + 3} ${VB_H / 2 + 4}, ${VB_W / 2} ${VB_H / 2 + 15}
               C ${VB_W / 2 - 3} ${VB_H / 2 + 4}, ${VB_W / 2 - 4} ${VB_H / 2 + 3}, ${VB_W / 2 - 15} ${VB_H / 2}
               C ${VB_W / 2 - 4} ${VB_H / 2 - 3}, ${VB_W / 2 - 3} ${VB_H / 2 - 4}, ${VB_W / 2} ${VB_H / 2 - 15} Z`}
            fill="#fff6d0"
          />
          {/* 角落黄花 + 黑星点 */}
          <P4BackFlower cx={44} cy={52} r={16} />
          <P4BackFlower cx={VB_W - 44} cy={52} r={16} />
          <P4BackFlower cx={44} cy={VB_H - 52} r={16} />
          <P4BackFlower cx={VB_W - 44} cy={VB_H - 52} r={16} />
          {[[VB_W / 2, 36], [VB_W / 2, VB_H - 36]].map(([cx, cy], i) => (
            <polygon key={i} points={`${cx},${cy - 5} ${cx + 3.5},${cy} ${cx},${cy + 5} ${cx - 3.5},${cy}`} fill="#131313" />
          ))}
        </svg>
      </motion.div>
    );
  }

  return (
    <motion.div
      onClick={interactive ? onClick : undefined}
      whileHover={hoverable && interactive ? { y: -4 } : undefined}
      whileTap={interactive ? { scale: 0.97 } : undefined}
      className={`relative inline-block select-none ${interactive ? 'cursor-pointer' : ''} ${className}`}
      style={{ width, height, opacity: disabled ? 0.5 : 1 }}
    >
      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow: `0 0 24px 4px #D4AF3788, 0 0 48px 8px #D4AF3744`,
            borderRadius: 14,
          }}
        />
      )}

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="back-bg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"  stopColor="#2A1F4A" />
            <stop offset="50%" stopColor="#140B28" />
            <stop offset="100%" stopColor="#2A1F4A" />
          </linearGradient>
          <linearGradient id="back-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#F6E5B5" />
            <stop offset="50%"  stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#A0802A" />
          </linearGradient>
          <radialGradient id="back-glow" cx="50%" cy="50%" r="40%">
            <stop offset="0%"   stopColor="#D4AF37" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
          </radialGradient>
          <pattern id="back-dots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="#F6E5B5" opacity="0.08" />
          </pattern>
        </defs>

        {/* 底板 */}
        <rect x="2" y="2" width={VB_W - 4} height={VB_H - 4} rx="10"
              fill="url(#back-bg)" stroke="url(#back-gold)" strokeWidth="2" />
        <rect x="2" y="2" width={VB_W - 4} height={VB_H - 4} rx="10"
              fill="url(#back-dots)" />

        {/* 内边框 */}
        <rect x="10" y="10" width={VB_W - 20} height={VB_H - 20} rx="6"
              fill="none" stroke="url(#back-gold)" strokeWidth="0.8" opacity="0.8" />
        <rect x="18" y="18" width={VB_W - 36} height={VB_H - 36} rx="4"
              fill="none" stroke="url(#back-gold)" strokeWidth="0.4" opacity="0.5" />

        {/* 中央光晕 */}
        <circle cx={VB_W / 2} cy={VB_H / 2} r="90" fill="url(#back-glow)" />

        {/* 中央装饰：星盘 + 眼睛 */}
        <g transform={`translate(${VB_W / 2}, ${VB_H / 2})`} stroke="url(#back-gold)" fill="none">
          {/* 外星圈 */}
          <circle r="58" strokeWidth="0.6" opacity="0.8" />
          <circle r="48" strokeWidth="0.4" strokeDasharray="1 3" opacity="0.6" />
          <circle r="36" strokeWidth="0.8" />
          {/* 放射线 */}
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 12;
            const x1 = Math.cos(a) * 40;
            const y1 = Math.sin(a) * 40;
            const x2 = Math.cos(a) * 56;
            const y2 = Math.sin(a) * 56;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                    strokeWidth={i % 3 === 0 ? 1.1 : 0.5}
                    opacity={i % 3 === 0 ? 1 : 0.5} />
            );
          })}
          {/* 眼睛（杏仁形） */}
          <path d="M -22 0 Q 0 -14 22 0 Q 0 14 -22 0 Z" strokeWidth="1.2" fill="#140B28" />
          <circle r="7" fill="url(#back-gold)" stroke="none" />
          <circle r="3" fill="#140B28" stroke="none" />
          <circle cx="-1" cy="-1" r="1" fill="#F6E5B5" stroke="none" />
        </g>

        {/* 四角菱形 */}
        {[
          [14, 14], [VB_W - 14, 14], [14, VB_H - 14], [VB_W - 14, VB_H - 14],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <polygon points={`${cx},${cy - 4} ${cx + 4},${cy} ${cx},${cy + 4} ${cx - 4},${cy}`}
                     fill="url(#back-gold)" />
          </g>
        ))}

        {/* 顶部 / 底部 文字 */}
        <text x={VB_W / 2} y="34" textAnchor="middle"
              fontFamily="Georgia, serif" fontSize="9" letterSpacing="3"
              fill="#F6E5B5" opacity="0.7">
          THE VELVET
        </text>
        <text x={VB_W / 2} y={VB_H - 22} textAnchor="middle"
              fontFamily="Georgia, serif" fontSize="7" letterSpacing="2"
              fill="#F6E5B5" opacity="0.5">
          ARCANA
        </text>
      </svg>
    </motion.div>
  );
}
