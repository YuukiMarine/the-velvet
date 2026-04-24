import { motion } from 'framer-motion';
import { TarotCardData, TarotOrientation, SUIT_META } from '@/constants/tarot';

interface TarotCardSVGProps {
  card: TarotCardData;
  orientation?: TarotOrientation;
  width?: number;
  /** 选中态（外发光） */
  selected?: boolean;
  /** 点击 */
  onClick?: () => void;
  /** 是否显示正/逆位角标 */
  showOrientationTag?: boolean;
  /** 禁用 hover 效果 */
  staticCard?: boolean;
  className?: string;
}

/** 为每张大阿卡纳挑选最贴合的 unicode / emoji 作为中心意象 */
const MAJOR_SYMBOLS: Record<string, string> = {
  fool:               '🃏',
  magician:           '✦',
  high_priestess:     '🌙',
  empress:            '♀',
  emperor:            '♔',
  hierophant:         '⛨',
  lovers:             '♥',
  chariot:            '⚔',
  strength:           '∞',
  hermit:             '🕯',
  wheel_of_fortune:   '☸',
  justice:            '⚖',
  hanged_man:         '⸸',
  death:              '☠',
  temperance:         '⚗',
  devil:              '⛧',
  tower:              '⚡',
  star:               '★',
  moon:               '☾',
  sun:                '☀',
  judgement:          '♆',
  world:              '⊛',
};

const COURT_LETTERS: Record<number, string> = {
  11: 'P', 12: 'N', 13: 'Q', 14: 'K',
};

const COURT_NAMES: Record<number, string> = {
  11: 'Page', 12: 'Knight', 13: 'Queen', 14: 'King',
};

export function TarotCardSVG({
  card,
  orientation = 'upright',
  width = 160,
  selected = false,
  onClick,
  showOrientationTag = true,
  staticCard = false,
  className = '',
}: TarotCardSVGProps) {
  const height = Math.round(width * 1.6);
  const flipped = orientation === 'reversed';

  // 内部使用的 viewBox 尺寸（方便绘制）
  const VB_W = 200;
  const VB_H = 320;

  const accent = card.accent;
  const isMajor = card.arcana === 'major';
  const rankLabel = isMajor
    ? (card.roman ?? String(card.number))
    : (card.number >= 11 ? COURT_LETTERS[card.number] : String(card.number));
  const rankFull = isMajor
    ? (card.roman ?? '')
    : (card.number >= 11 ? COURT_NAMES[card.number] : `No.${card.number}`);

  const suitSymbol = card.suit ? SUIT_META[card.suit].symbol : '';
  const centerSymbol = isMajor
    ? (MAJOR_SYMBOLS[card.id] ?? '✦')
    : (card.number >= 11 ? COURT_LETTERS[card.number] : suitSymbol);

  return (
    <motion.div
      onClick={onClick}
      whileHover={!staticCard ? { y: -4 } : undefined}
      whileTap={!staticCard ? { scale: 0.97 } : undefined}
      className={`relative inline-block select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ width, height }}
    >
      {/* 选中态外发光 */}
      {selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            boxShadow: `0 0 24px 4px ${accent}88, 0 0 48px 8px ${accent}44`,
            borderRadius: 14,
          }}
        />
      )}

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={width}
        height={height}
        style={{
          transform: flipped ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.45s ease',
          display: 'block',
        }}
      >
        <defs>
          {/* 深色背景渐变 */}
          <linearGradient id={`bg-${card.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1A1530" />
            <stop offset="50%" stopColor="#0F0A1F" />
            <stop offset="100%" stopColor="#181230" />
          </linearGradient>
          {/* 中心光晕 */}
          <radialGradient id={`glow-${card.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
            <stop offset="60%" stopColor={accent} stopOpacity="0.1" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          {/* 金色描边 */}
          <linearGradient id={`gold`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F6E5B5" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#A0802A" />
          </linearGradient>
          {/* 网点纹理 */}
          <pattern id={`dots-${card.id}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="#ffffff" opacity="0.05" />
          </pattern>
        </defs>

        {/* 卡面底板 */}
        <rect x="2" y="2" width={VB_W - 4} height={VB_H - 4} rx="10"
              fill={`url(#bg-${card.id})`} stroke="url(#gold)" strokeWidth="2" />
        <rect x="2" y="2" width={VB_W - 4} height={VB_H - 4} rx="10"
              fill={`url(#dots-${card.id})`} />

        {/* 内边框 */}
        <rect x="10" y="10" width={VB_W - 20} height={VB_H - 20} rx="6"
              fill="none" stroke="url(#gold)" strokeWidth="0.8" opacity="0.8" />

        {/* 四角菱形装饰 */}
        {[
          [14, 14], [VB_W - 14, 14], [14, VB_H - 14], [VB_W - 14, VB_H - 14],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <polygon points={`${cx},${cy - 4} ${cx + 4},${cy} ${cx},${cy + 4} ${cx - 4},${cy}`}
                     fill="url(#gold)" />
            <circle cx={cx} cy={cy} r="1.5" fill={accent} />
          </g>
        ))}

        {/* 顶部 rank banner */}
        <g transform={`translate(${VB_W / 2}, 32)`}>
          <line x1="-40" y1="0" x2="-14" y2="0" stroke="url(#gold)" strokeWidth="0.8" />
          <line x1="14"  y1="0" x2="40"  y2="0" stroke="url(#gold)" strokeWidth="0.8" />
          <text x="0" y="5" textAnchor="middle"
                fontFamily="Georgia, 'Times New Roman', serif"
                fontSize={rankLabel.length > 3 ? 13 : 16}
                fontWeight="700" fill="url(#gold)" letterSpacing="1">
            {rankLabel}
          </text>
        </g>

        {/* 中心光晕 */}
        <circle cx={VB_W / 2} cy={VB_H / 2 - 10} r="70" fill={`url(#glow-${card.id})`} />

        {/* 中心符号圈 */}
        <circle cx={VB_W / 2} cy={VB_H / 2 - 10} r="52"
                fill="none" stroke="url(#gold)" strokeWidth="0.6" opacity="0.7" />
        <circle cx={VB_W / 2} cy={VB_H / 2 - 10} r="60"
                fill="none" stroke={accent} strokeWidth="0.5" opacity="0.4"
                strokeDasharray="2 4" />

        {/* 中心符号 */}
        <text
          x={VB_W / 2}
          y={VB_H / 2 - 10 + (isMajor ? 22 : 18)}
          textAnchor="middle"
          fontSize={isMajor ? 64 : 54}
          fontFamily="'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', Georgia, serif"
          fontWeight="700"
          fill="#F6E5B5"
          style={{ filter: `drop-shadow(0 0 6px ${accent})` }}
        >
          {centerSymbol}
        </text>

        {/* 小阿卡纳的花色标记（左上 + 右下）*/}
        {!isMajor && suitSymbol && (
          <>
            <text x="26" y="44" fontSize="14" fill={accent} opacity="0.85"
                  fontFamily="Georgia, serif">{suitSymbol}</text>
            <text x={VB_W - 26} y={VB_H - 34} fontSize="14" fill={accent} opacity="0.85"
                  textAnchor="end" fontFamily="Georgia, serif">{suitSymbol}</text>
          </>
        )}

        {/* 卡名（底部）*/}
        <g transform={`translate(${VB_W / 2}, ${VB_H - 42})`}>
          <line x1="-50" y1="0" x2="50" y2="0" stroke="url(#gold)" strokeWidth="0.6" opacity="0.6" />
          <text x="0" y="16" textAnchor="middle"
                fontFamily="'Songti SC', 'STSong', serif"
                fontSize="15" fontWeight="700" fill="#F6E5B5" letterSpacing="2">
            {card.name}
          </text>
          <text x="0" y="30" textAnchor="middle"
                fontFamily="Georgia, serif"
                fontSize="7.5" fill="#F6E5B5" opacity="0.6" letterSpacing="1.5">
            {card.nameEn.toUpperCase()}
          </text>
          {!isMajor && rankFull && (
            <text x="0" y="40" textAnchor="middle"
                  fontFamily="Georgia, serif"
                  fontSize="6" fill={accent} opacity="0.8" letterSpacing="1">
              {rankFull}
            </text>
          )}
        </g>
      </svg>

      {/* 正/逆位角标（不参与卡面翻转） */}
      {showOrientationTag && (
        <div
          className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
          style={{
            background: flipped ? '#7F1D1D' : '#1E3A8A',
            color: '#F6E5B5',
            border: '1px solid rgba(246,229,181,0.3)',
            letterSpacing: '1px',
          }}
        >
          {flipped ? 'R' : 'U'}
        </div>
      )}
    </motion.div>
  );
}
