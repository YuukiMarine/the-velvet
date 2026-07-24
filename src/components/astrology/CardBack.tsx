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
 * 频道皮肤：P4 奶油靶心卡 / P3 深蓝星盘卡 / neutral 金色深卡。
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
  const channel = useUiChannel();
  const isP4 = channel === 'p4';
  const isP3 = channel === 'p3';

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

  // ── P3R 卡背（p3-astrology 设计稿）：深蓝夜幕 + 青/洋红角 + 中央星盘白眼 ──
  if (isP3) {
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
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: '0 0 24px 4px rgba(53,209,232,0.55), 0 0 48px 8px rgba(53,209,232,0.28)', borderRadius: 14 }}
          />
        )}
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width={width} height={height} style={{ display: 'block' }}>
          <defs>
            <linearGradient id="back-bg-p3" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2b63ff" />
              <stop offset="100%" stopColor="#1443d6" />
            </linearGradient>
          </defs>
          {/* 底板 + 白描边 */}
          <rect x="2" y="2" width={VB_W - 4} height={VB_H - 4} rx="10" fill="url(#back-bg-p3)" stroke="#ffffff" strokeWidth="2.5" />
          {/* 内白细框 */}
          <rect x="12" y="12" width={VB_W - 24} height={VB_H - 24} rx="6" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
          {/* 左上青角 / 右下洋红角 */}
          <path d={`M6 6 L66 6 L6 60 Z`} fill="#35d1e8" opacity="0.92" />
          <path d={`M${VB_W - 6} ${VB_H - 6} L${VB_W - 46} ${VB_H - 6} L${VB_W - 6} ${VB_H - 40} Z`} fill="#f0417f" opacity="0.88" />
          {/* 对角细虚线 */}
          <line x1="22" y1="298" x2="178" y2="24" stroke="rgba(255,255,255,0.32)" strokeWidth="0.7" strokeDasharray="3 4" />
          <line x1="14" y1="236" x2="186" y2="86" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" strokeDasharray="2 5" />
          {/* 中央星盘 + 白眼 */}
          <g transform={`translate(${VB_W / 2}, ${VB_H / 2})`} stroke="rgba(255,255,255,0.9)" fill="none">
            <circle r="62" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.7" />
            <circle r="50" strokeWidth="1.1" />
            <circle r="38" strokeWidth="0.6" strokeDasharray="1 3" opacity="0.8" />
            {/* 十字准线 */}
            <line x1="0" y1="-72" x2="0" y2="-44" strokeWidth="0.6" opacity="0.6" />
            <line x1="0" y1="44" x2="0" y2="72" strokeWidth="0.6" opacity="0.6" />
            <line x1="-72" y1="0" x2="-44" y2="0" strokeWidth="0.6" opacity="0.6" />
            <line x1="44" y1="0" x2="72" y2="0" strokeWidth="0.6" opacity="0.6" />
            {/* 轨道节点 */}
            <circle cx="50" cy="0" r="3" fill="#ffffff" stroke="none" />
            <circle cx="-35.4" cy="-35.4" r="2.2" fill="#ffffff" stroke="none" />
            <circle cx="0" cy="-62" r="2.6" strokeWidth="1" />
            <circle cx="-50" cy="0" r="1.8" fill="#ffffff" stroke="none" opacity="0.85" />
            <circle cx="26.9" cy="26.9" r="2" fill="#ffffff" stroke="none" opacity="0.9" />
            {/* 眼睛：白杏仁 + 蓝瞳 + 白月牙 */}
            <path d="M -27 0 Q 0 -17 27 0 Q 0 17 -27 0 Z" fill="#ffffff" stroke="none" />
            <circle r="8.5" fill="#1443d6" stroke="none" />
            <path d="M 2 -6.2 A 6.6 6.6 0 1 1 2 6.2 A 8.6 8.6 0 0 0 2 -6.2 Z" fill="#ffffff" stroke="none" />
          </g>
          {/* 四角小四角星 */}
          {[
            [24, 28], [VB_W - 24, 28], [24, VB_H - 28], [VB_W - 24, VB_H - 28],
          ].map(([cx, cy], i) => (
            <path
              key={i}
              d={`M${cx} ${cy - 5} L${cx + 1.4} ${cy - 1.4} L${cx + 5} ${cy} L${cx + 1.4} ${cy + 1.4} L${cx} ${cy + 5} L${cx - 1.4} ${cy + 1.4} L${cx - 5} ${cy} L${cx - 1.4} ${cy - 1.4} Z`}
              fill="#ffffff"
              opacity={i % 2 ? 0.75 : 0.95}
            />
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
        <rect x="2" y="2" width={VB_W - 4} height={VB_H - 4} rx="10"
              fill="url(#back-bg)" stroke="url(#back-gold)" strokeWidth="2" />
        <rect x="2" y="2" width={VB_W - 4} height={VB_H - 4} rx="10"
              fill="url(#back-dots)" />
        <rect x="10" y="10" width={VB_W - 20} height={VB_H - 20} rx="6"
              fill="none" stroke="url(#back-gold)" strokeWidth="0.8" opacity="0.8" />
        <rect x="18" y="18" width={VB_W - 36} height={VB_H - 36} rx="4"
              fill="none" stroke="url(#back-gold)" strokeWidth="0.4" opacity="0.5" />
        <circle cx={VB_W / 2} cy={VB_H / 2} r="90" fill="url(#back-glow)" />
        <g transform={`translate(${VB_W / 2}, ${VB_H / 2})`} stroke="url(#back-gold)" fill="none">
          <circle r="58" strokeWidth="0.6" opacity="0.8" />
          <circle r="48" strokeWidth="0.4" strokeDasharray="1 3" opacity="0.6" />
          <circle r="36" strokeWidth="0.8" />
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
          <path d="M -22 0 Q 0 -14 22 0 Q 0 14 -22 0 Z" strokeWidth="1.2" fill="#140B28" />
          <circle r="7" fill="url(#back-gold)" stroke="none" />
          <circle r="3" fill="#140B28" stroke="none" />
          <circle cx="-1" cy="-1" r="1" fill="#F6E5B5" stroke="none" />
        </g>
        {[
          [14, 14], [VB_W - 14, 14], [14, VB_H - 14], [VB_W - 14, VB_H - 14],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <polygon points={`${cx},${cy - 4} ${cx + 4},${cy} ${cx},${cy + 4} ${cx - 4},${cy}`}
                     fill="url(#back-gold)" />
          </g>
        ))}
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

export default CardBack;
