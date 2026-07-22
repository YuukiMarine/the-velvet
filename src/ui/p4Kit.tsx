/**
 * p4Kit —— P4 黄频道专属图形库（design-refs/p4-redraw 定稿 1:1 用料）。
 *
 * 与 motifs.tsx 的关系：motifs 是三频道通用 motif（半调/条带/同心圆），
 * 这里是 P4 重绘引入的签名元素：五瓣花、四角星闪、天空扇角、太阳环、
 * 斜切胶囊面板（skew+圆角，代替 clip 多边形）与橙色数字贴纸。
 * 新建独立文件而不并入 motifs.tsx：并行会话正在改其他频道，缩小共享文件接触面。
 *
 * 铁律（guide §22.3）：纯装饰组件 aria-hidden + pointer-events-none；
 * P4Panel 的 skew 只作用于容器，内容层反向回正（字恒水平）。
 */
import type { CSSProperties, ReactNode } from 'react';

/** 五瓣花（P4 签名符号：按钮/徽章/圆图标/空状态装饰通用） */
export const P4Flower = ({ size = 16, color = 'currentColor', className, style }: {
  size?: number; color?: string; className?: string; style?: CSSProperties;
}) => (
  <svg
    aria-hidden
    className={`pointer-events-none shrink-0 ${className ?? ''}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={style}
  >
    {[0, 72, 144, 216, 288].map((deg) => (
      <ellipse key={deg} cx="12" cy="5.6" rx="3.7" ry="5.4" fill={color} transform={`rotate(${deg} 12 12)`} />
    ))}
  </svg>
);

/** 四角星闪（选中/次要路径/输入框角标/标题缀饰） */
export const P4Sparkle = ({ size = 14, color = 'currentColor', className, style }: {
  size?: number; color?: string; className?: string; style?: CSSProperties;
}) => (
  <svg
    aria-hidden
    className={`pointer-events-none shrink-0 ${className ?? ''}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    style={style}
  >
    <path
      d="M12 0C13.1 6.8 17.2 10.9 24 12C17.2 13.1 13.1 17.2 12 24C10.9 17.2 6.8 13.1 0 12C6.8 10.9 10.9 6.8 12 0Z"
      fill={color}
    />
  </svg>
);

/** 对勾（完成态圆角小方块内用） */
export const P4Check = ({ size = 12, color = 'currentColor', className }: {
  size?: number; color?: string; className?: string;
}) => (
  <svg aria-hidden className={`pointer-events-none shrink-0 ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M4 12.5L9.5 18L20 6.5" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 斜切胶囊面板：P4 定稿轮廓 —— 容器 skew + 大圆角，内容层回正。
 *  tone：paper=奶油纸 / black=黑题板 / orange=橙贴纸 / yellow=黄面。
 *  skew=0 可退化为普通圆角面板（表单/长文场景校直）。 */
export const P4Panel = ({ children, className, style, contentClassName, tone = 'paper', skew = -4, radius = 18 }: {
  children: ReactNode; className?: string; style?: CSSProperties; contentClassName?: string;
  tone?: 'paper' | 'black' | 'orange' | 'yellow'; skew?: number; radius?: number;
}) => {
  const bg =
    tone === 'black' ? '#131313'
    : tone === 'orange' ? 'var(--p4-orange, #f9a11b)'
    : tone === 'yellow' ? 'var(--ui-bg)'
    : 'var(--ui-paper)';
  const ink = tone === 'black' ? '#fff6d0' : '#131313';
  return (
    <div
      className={className}
      style={{ background: bg, color: ink, borderRadius: radius, transform: skew ? `skewX(${skew}deg)` : undefined, ...style }}
    >
      <div className={contentClassName} style={{ transform: skew ? `skewX(${-skew}deg)` : undefined }}>
        {children}
      </div>
    </div>
  );
};

/** 橙色数字贴纸（今日热量 1280 式）：巨大斜体数字的舞台 */
export const P4NumberSticker = ({ children, className, style }: {
  children: ReactNode; className?: string; style?: CSSProperties;
}) => (
  <div className={`relative inline-block ${className ?? ''}`} style={style}>
    <div
      className="px-5 py-1.5"
      style={{ background: 'var(--p4-orange, #f9a11b)', borderRadius: 20, transform: 'skewX(-6deg)' }}
    >
      <div className="font-black italic leading-none tracking-tight text-[#131313]" style={{ transform: 'skewX(6deg)' }}>
        {children}
      </div>
    </div>
    <P4Sparkle size={18} color="var(--p4-orange, #f9a11b)" className="absolute -right-3 -top-2" />
  </div>
);

/** 天空扇角：页首右上角的四分之一圆天空 + 云朵 + 花朵剪影（CSS 绘制，无外部资源）。
 *  贴在 relative 容器右上角使用；size 为扇形半径（px）。 */
export const P4SkyFan = ({ size = 180, className, style }: {
  size?: number; className?: string; style?: CSSProperties;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute right-0 top-0 overflow-hidden ${className ?? ''}`}
    style={{ width: size, height: size, borderBottomLeftRadius: size, ...style }}
  >
    {/* 天空底 + 高光 */}
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(200deg, var(--p4-sky-deep, #2196e0) 0%, var(--p4-sky, #8fd0f4) 55%, #cfeafd 100%)' }}
    />
    {/* 云朵：三团椭圆叠出 */}
    <div className="absolute rounded-full bg-white/95" style={{ width: size * 0.52, height: size * 0.22, left: size * 0.34, top: size * 0.52, filter: 'blur(1px)' }} />
    <div className="absolute rounded-full bg-white/85" style={{ width: size * 0.4, height: size * 0.18, left: size * 0.52, top: size * 0.66, filter: 'blur(1.5px)' }} />
    <div className="absolute rounded-full bg-white/70" style={{ width: size * 0.3, height: size * 0.14, left: size * 0.28, top: size * 0.36, filter: 'blur(2px)' }} />
    {/* 黄花剪影压在天空上 */}
    <P4Flower size={size * 0.42} color="var(--ui-bg)" className="absolute" style={{ right: size * 0.06, top: size * 0.3 }} />
  </div>
);

/** 太阳同心环（dashboard 右上）：橙色实心核 + 两圈渐弱环，超出裁切交给父容器 */
export const P4SunRings = ({ size = 220, className, style }: {
  size?: number; className?: string; style?: CSSProperties;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none ${className ?? ''}`}
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: `radial-gradient(circle,
        var(--p4-orange, #f9a11b) 0 30%,
        #ffb628 30% 44%,
        rgba(255, 200, 60, 0.55) 44% 58%,
        rgba(255, 214, 90, 0.3) 58% 72%,
        transparent 72%)`,
      ...style,
    }}
  />
);

/** 警戒斜纹带（黑黄 DANGER 线）：危险区/重要提醒的边饰 */
export const P4CautionStripes = ({ className, style, height = 8 }: {
  className?: string; style?: CSSProperties; height?: number;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none ${className ?? ''}`}
    style={{
      height,
      background: 'repeating-linear-gradient(-45deg, #131313 0 10px, var(--ui-bg) 10px 20px)',
      ...style,
    }}
  />
);
