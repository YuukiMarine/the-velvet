/**
 * 天气图形（PRD_V2.6 §7 补齐项：「三频道各自的天气图形（现在统一走 weatherEmoji，是占位）」）。
 *
 * 【为什么不能继续用 emoji】
 * ☀️🌧️⛈️ 这些字形**自带彩色**，而且各平台长得都不一样。
 * 放进 P5R（红/黑/纸三色律）就是一块系统色的补丁，放进 P4 又跟黄/黑撞不上——
 * 之前的成就 emoji（✨💪💝）已经因为同样的理由被用户点名过。
 *
 * 这里改成**双色 SVG**：只吃 `ink` 与 `accent` 两个颜色，由各频道的天空位自己传。
 * 于是同一套形状在红频道是黑+猩红，在黄频道是黑+橙，在蓝频道是深蓝+青。
 */
import type { WeatherIcon } from '@/utils/weather';

interface Props {
  icon: WeatherIcon | undefined;
  size?: number;
  /** 主色：云体 / 月牙 / 线条 */
  ink: string;
  /** 强调色：太阳 / 闪电 / 雨雪点 */
  accent: string;
  className?: string;
}

/** 云的公共轮廓（viewBox 32×32 里靠下居中） */
const CLOUD = 'M9 22 A5 5 0 0 1 9.6 12.1 A6.6 6.6 0 0 1 22 11.4 A4.8 4.8 0 0 1 23.4 22 Z';

export function WeatherGlyph({ icon, size = 24, ink, accent, className }: Props) {
  const vb = '0 0 32 32';
  const common = { className, width: size, height: size, viewBox: vb, 'aria-hidden': true as const };

  switch (icon) {
    case 'clear-day':
      return (
        <svg {...common}>
          {Array.from({ length: 8 }).map((_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                key={i}
                x1={16 + Math.cos(a) * 9.5} y1={16 + Math.sin(a) * 9.5}
                x2={16 + Math.cos(a) * 13.5} y2={16 + Math.sin(a) * 13.5}
                stroke={accent} strokeWidth="2.4" strokeLinecap="round"
              />
            );
          })}
          <circle cx="16" cy="16" r="7" fill={accent} />
        </svg>
      );

    case 'clear-night':
      return (
        <svg {...common}>
          {/* 两圆相减的月牙：实心，不靠 opacity 表达形状 */}
          <path d="M22.4 21.6 A9 9 0 1 1 18.6 6.6 A7.2 7.2 0 0 0 22.4 21.6 Z" fill={ink} />
          <path d="M25 8 L26 11 L29 12 L26 13 L25 16 L24 13 L21 12 L24 11 Z" fill={accent} />
        </svg>
      );

    case 'partly':
      return (
        <svg {...common}>
          <circle cx="21.5" cy="11" r="5.4" fill={accent} />
          <path d={CLOUD} fill={ink} transform="translate(-1.5,2.5) scale(0.94)" />
        </svg>
      );

    case 'cloudy':
      return (
        <svg {...common}>
          <path d={CLOUD} fill={accent} transform="translate(3,-3) scale(0.72)" />
          <path d={CLOUD} fill={ink} transform="translate(0,2)" />
        </svg>
      );

    case 'overcast':
      return (
        <svg {...common}>
          <path d={CLOUD} fill={ink} transform="translate(2,-3.5) scale(0.8)" />
          <path d={CLOUD} fill={ink} transform="translate(-1,2.5) scale(0.94)" />
        </svg>
      );

    case 'rain':
      return (
        <svg {...common}>
          <path d={CLOUD} fill={ink} transform="translate(0,-3) scale(0.94)" />
          {[9.5, 16, 22.5].map((x, i) => (
            <line key={i} x1={x} y1={22 + (i === 1 ? 0 : 1)} x2={x - 2} y2={28 + (i === 1 ? 0 : 1)}
                  stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
          ))}
        </svg>
      );

    case 'heavy-rain':
      return (
        <svg {...common}>
          <path d={CLOUD} fill={ink} transform="translate(0,-4) scale(0.94)" />
          {[8, 12.5, 17, 21.5, 26].map((x, i) => (
            <line key={i} x1={x} y1={20 + (i % 2) * 1.5} x2={x - 2.4} y2={28 + (i % 2) * 1.5}
                  stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
          ))}
        </svg>
      );

    case 'thunder':
      return (
        <svg {...common}>
          <path d={CLOUD} fill={ink} transform="translate(0,-4.5) scale(0.94)" />
          <path d="M17.5 18 L11 26.5 L15.6 26.5 L13.8 32 L21 23 L16.2 23 Z" fill={accent} />
        </svg>
      );

    case 'snow':
      return (
        <svg {...common}>
          <path d={CLOUD} fill={ink} transform="translate(0,-4) scale(0.94)" />
          {[[10, 25], [16, 27.5], [22, 25]].map(([cx, cy], i) => (
            <g key={i} stroke={accent} strokeWidth="1.9" strokeLinecap="round">
              <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} />
              <line x1={cx} y1={cy - 3} x2={cx} y2={cy + 3} />
              <line x1={cx - 2.1} y1={cy - 2.1} x2={cx + 2.1} y2={cy + 2.1} />
              <line x1={cx - 2.1} y1={cy + 2.1} x2={cx + 2.1} y2={cy - 2.1} />
            </g>
          ))}
        </svg>
      );

    case 'fog':
      return (
        <svg {...common}>
          <path d={CLOUD} fill={ink} transform="translate(0,-5) scale(0.9)" />
          {[22, 26, 30].map((y, i) => (
            <line key={i} x1={5 + i * 1.5} y1={y} x2={27 - i * 1.5} y2={y}
                  stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
          ))}
        </svg>
      );

    case 'haze':
      return (
        <svg {...common}>
          <circle cx="16" cy="13" r="6" fill={accent} />
          {[22, 26, 30].map((y, i) => (
            <line key={i} x1={4 + i * 2} y1={y} x2={28 - i * 2} y2={y}
                  stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
          ))}
        </svg>
      );

    case 'wind':
      return (
        <svg {...common}>
          <path d="M3 11 H19 A4 4 0 1 0 15 7" fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M3 18 H23 A3.4 3.4 0 1 1 19.6 21.4" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M3 25 H14" fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );

    default:
      // 未知/未取到：温度计而不是问号——问号会被读成「出错了」
      return (
        <svg {...common}>
          <rect x="13" y="4" width="6" height="17" rx="3" fill={ink} />
          <circle cx="16" cy="24" r="6" fill={accent} />
          <rect x="14.6" y="9" width="2.8" height="13" rx="1.4" fill={accent} />
        </svg>
      );
  }
}
