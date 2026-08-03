/**
 * OnlineStarBadge —— 在线好友名字左侧的四角星小角标。
 *
 * 两件事：
 *   ① 标记「这是一位在线好友」——名字本身看不出线上线下，一眼可辨的是这颗星；
 *   ② `glow` 时闪闪发光 = **今日的祈愿还没回应**（对方今天为我祈过、我还没回敬）。
 *      这是全站唯一一个「有人在等你」的即时信号，值得会动。
 *
 * 颜色跟随频道：蓝=主蓝 / 黄=橙 / 红=猩红 / 中性=主题色。用 currentColor 交给调用方
 * 也行，但四个频道的强调色并不都等于 --color-primary（黄的强调是橙不是黄底），
 * 所以在这里按频道取。
 *
 * D0 守卫：降级时不闪，只留静态高亮——闪烁是纯装饰，低端机上第一个该省的就是它。
 */
import { useUiChannel } from '@/ui/useUiChannel';
import { useBoldness } from '@/utils/boldness';

const STAR_INK: Record<string, string> = {
  p3: 'var(--p3r-blue, #1b57ff)',
  p4: 'var(--p4-orange, #f9a11b)',
  p5: '#c00008',
  neutral: 'var(--color-primary)',
};

/** 四角星（尖长的十字星，与 P4Sparkle / 站内 ✦ 同族） */
const StarPath = ({ size, ink }: { size: number; ink: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ display: 'block' }}>
    <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill={ink} />
  </svg>
);

export interface OnlineStarBadgeProps {
  /** 今日祈愿未回应 → 闪 */
  glow?: boolean;
  size?: number;
  className?: string;
  /** 覆盖颜色（卡背等已经自带一套配色的地方传进来） */
  ink?: string;
}

export const OnlineStarBadge = ({ glow = false, size = 12, className = '', ink }: OnlineStarBadgeProps) => {
  const channel = useUiChannel();
  const bold = useBoldness();
  const color = ink ?? STAR_INK[channel] ?? STAR_INK.neutral;
  const animate = glow && bold;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-label={glow ? '有一份今日祈愿还没回应' : '在线好友'}
      role="img"
    >
      {animate && (
        <>
          <style>{`
            @keyframes vr-star-pulse {
              0%, 100% { opacity: 0.9; transform: scale(1); }
              50%      { opacity: 1;   transform: scale(1.18); }
            }
            @keyframes vr-star-halo {
              0%, 100% { opacity: 0.15; transform: scale(1); }
              50%      { opacity: 0.5;  transform: scale(2.1); }
            }
          `}</style>
          {/* 光晕：只动 transform/opacity，走合成器 */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: color,
              filter: 'blur(2px)',
              animation: 'vr-star-halo 1.8s ease-in-out infinite',
            }}
          />
        </>
      )}
      <span
        className="relative"
        style={animate ? { animation: 'vr-star-pulse 1.8s ease-in-out infinite' } : undefined}
      >
        <StarPath size={size} ink={color} />
      </span>
    </span>
  );
};
