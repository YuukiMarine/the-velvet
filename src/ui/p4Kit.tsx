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
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useBoldness } from '@/utils/boldness';

/**
 * P4 页头出血口径（所有 `-mx-4 px-4` 页头共用）：**裁左右与下缘，只朝上放行**。
 *
 * 页头原本用 overflow-hidden 兜横向出血，副作用是天空扇/太阳环被沿题块下缘齐根切断，
 * 看上去像"实景天空被错误截断"（用户反复上报）。中间试过"下缘照裁、页头自己 min-h
 * 给够高度"，但页头高度是会被后续调优改的（并行会话就把首页 164→126、行动 126→104），
 * 一改天空立刻又被切平。
 *
 * 现在：clip-path 只钳制左右（横向不撑出滚动条），**上下全放行**；装饰"盖住下方按钮"
 * 的老问题改由大装饰自己沉到 z-index:-1 解决（见 P4SkyFan / P4SkyCircle / P4ArcRings），
 * 于是天空想多高多低都行，且永远画在内容之后。
 */
export const P4_HEADER_BLEED: CSSProperties = { clipPath: 'inset(-999px 0 -999px 0)' };

/**
 * 六瓣花（P4 签名符号：按钮/徽章/圆图标/空状态装饰通用）。
 *
 * 几何按用户定稿 —— **从一枚六角星出发**：
 *   外半径 120、内半径 18（15~22 区间取中，≈外半径 15%）、6 个角；
 *   六个外尖做**极大圆角**变成圆润花瓣，内侧凹角只留很轻的圆角（≈0~5）。
 * 这里按 1:10 缩到 viewBox -12..12：外半径 12、内半径 1.8。
 *
 * 每瓣两段三次贝塞尔：从左内凹点鼓出去到尖端、再收回右内凹点。尖端处两段的切线都
 * 与瓣轴垂直（控制点与尖端同高、左右对开 4.8），所以尖是一个又宽又圆的帽——这就是
 * "外角圆角尽量大"。内凹点由相邻两瓣共用，切线不共线 → 自然形成近乎尖的谷（≈0 圆角）。
 *
 * 六瓣首尾相接连成**一条**闭合 path（第 k 瓣的右内凹点 = 第 k+1 瓣的左内凹点，
 * 已验算重合）：单一轮廓，没有交叠区，半透明色也不会在瓣根叠深——早先"每瓣一个
 * <path>"的版本就是栽在这里（背景装饰层用的是 rgba）。
 */
const R_OUT = 12;    // 外半径（六角星的角尖）
const R_IN = 1.8;    // 内半径（凹点）≈ 外半径 15%
/** 单瓣锚点（局部系：瓣尖朝 -Y）。顺序＝左凹点 / 左腹两控制点 / 尖端 / 右腹两控制点 / 右凹点 */
const PETAL_ANCHORS: readonly (readonly [number, number])[] = [
  [-R_IN * 0.5, -R_IN * 0.866],   // 左内凹点：内半径 ∠-30°
  [-2.9, -4.3],                    // 左腹控制点1：腰身（从 -3.6 收到 -2.9 → 腹线更朝内、瓣间更分明）
  [-4.8, -R_OUT],                  // 左腹控制点2：与尖端同高 → 尖端切线水平
  [0, -R_OUT],                     // 尖端
  [4.8, -R_OUT],                   // 右腹控制点1：同上，镜像
  [2.9, -4.3],                     // 右腹控制点2
  [R_IN * 0.5, -R_IN * 0.866],     // 右内凹点：内半径 ∠+30°
];

const rotPt = (p: readonly [number, number], deg: number) => {
  const a = (deg * Math.PI) / 180;
  const x = p[0] * Math.cos(a) - p[1] * Math.sin(a);
  const y = p[0] * Math.sin(a) + p[1] * Math.cos(a);
  return `${Math.round(x * 1000) / 1000} ${Math.round(y * 1000) / 1000}`;
};

/** 六瓣连成的单一闭合轮廓（模块级算一次） */
export const P4_FLOWER_PATH = (() => {
  const seg = (deg: number) => PETAL_ANCHORS.map((pt) => rotPt(pt, deg));
  const first = seg(0);
  let d = `M${first[0]}`;
  for (const deg of [0, 60, 120, 180, 240, 300]) {
    const p = seg(deg);
    d += `C${p[1]} ${p[2]} ${p[3]}C${p[4]} ${p[5]} ${p[6]}`;
  }
  return `${d}Z`;
})();

export const P4Flower = ({ size = 16, color = 'currentColor', className, style }: {
  size?: number; color?: string; className?: string; style?: CSSProperties;
}) => (
  <svg
    aria-hidden
    className={`pointer-events-none shrink-0 ${className ?? ''}`}
    width={size}
    height={size}
    viewBox="-12 -12 24 24"
    style={style}
  >
    <path d={P4_FLOWER_PATH} fill={color} fillRule="nonzero" />
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

/**
 * P4「活高亮」—— 沿用 P5Highlight 的机制（rAF 每帧朝随机目标插值，得到 60fps 平滑震颤），
 * 但把里面那对**运动不规则四边形换成运动三角形**（用户口径）。
 *
 * 形状定稿（用户口径）：**只留一枚三角，左侧是短边、另外两边是长边**——
 * 即左缘一条竖直短边（条高），两条长边收拢到右端一点，成一枚朝右的楔。
 * 颜色取频道蓝：选中态字翻黄，黄字压在蓝楔上对比最足。
 * preserveAspectRatio="none" → 由调用方拉伸成任意长条。
 * D0 / live=false 时不跑 rAF，退化成静态高亮（常驻屏幕不烧帧）。
 */
// 三个顶点各自的抖动范围 [xmin,xmax,ymin,ymax]：左上、左下（短边两端）、右尖。
// **必须全部落在 viewBox(0..100, 0..50) 之内**：超出的部分会被 svg 视口裁掉，
// 抖到边界外时三角就被切成不规则多边形（用户上报"运动时会变成不规则多边形"）。
// 左上顶点整体右移（短边成为往右倾的斜边，不再是竖直边）。
const TRI_BOXES: number[][][] = [
  [[12, 19, 1, 6], [0, 6, 44, 49], [92, 99, 20, 31]],
];

const triTarget = (box: number[][]) =>
  box.flatMap((v) => [v[0] + Math.random() * (v[1] - v[0]), v[2] + Math.random() * (v[3] - v[2])]);
const triPoints = (a: number[]) =>
  `${a[0].toFixed(1)},${a[1].toFixed(1)} ${a[2].toFixed(1)},${a[3].toFixed(1)} ${a[4].toFixed(1)},${a[5].toFixed(1)}`;

export const P4Highlight = ({ className, live = true }: { className?: string; live?: boolean }) => {
  const bold = useBoldness();
  const refs = useRef<(SVGPolygonElement | null)[]>([]);
  useEffect(() => {
    if (!bold || !live) return;
    const layers = refs.current
      .map((ref, i) => (ref ? { ref, box: TRI_BOXES[i], cur: triTarget(TRI_BOXES[i]), tgt: triTarget(TRI_BOXES[i]), last: 0 } : null))
      .filter((l): l is NonNullable<typeof l> => !!l);
    let raf = 0;
    const loop = (t: number) => {
      for (const L of layers) {
        if (t - L.last > 130) { L.tgt = triTarget(L.box); L.last = t; }
        for (let i = 0; i < 6; i++) L.cur[i] += (L.tgt[i] - L.cur[i]) * 0.18;
        L.ref.setAttribute('points', triPoints(L.cur));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bold, live]);
  return (
    <svg viewBox="0 0 100 50" preserveAspectRatio="none" className={className} aria-hidden>
      <polygon ref={(el) => { refs.current[0] = el; }} fill="var(--ui-accent)" points="15,3 3,47 96,25" />
    </svg>
  );
};

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

/** 实景天空底（p4-cloud-sky 素材，终端玄关同源）：photo 模式共享的内层 */
const P4SkyPhoto = ({ position = '38% 55%' }: { position?: string }) => (
  <>
    <img
      src="/assets/terminal/p4-cloud-sky.png"
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: position, filter: 'saturate(1.15) contrast(1.06)' }}
    />
    <div className="absolute inset-0 bg-[#00a6ff]/10 mix-blend-screen" />
  </>
);

/** 天空扇角：页首右上角的四分之一圆天空 + 云朵 + 花朵剪影。
 *  photo=true（默认）用实景云朵素材（设计稿口径）；false 退 CSS 渐变绘制。
 *  贴在 relative 容器右上角使用；size 为扇形半径（px）。 */
export const P4SkyFan = ({ size = 180, className, style, photo = true, flower = true }: {
  size?: number; className?: string; style?: CSSProperties; photo?: boolean;
  /** 关掉压在天空上的黄花（页头右上另有大日期/弧环时避免叠字） */
  flower?: boolean;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none absolute right-0 top-0 overflow-hidden ${className ?? ''}`}
    // zIndex -1：页头出血已上下全放行，装饰得沉到内容之后才不会盖住下方按钮
    style={{ zIndex: -1, width: size, height: size, borderBottomLeftRadius: size, ...style }}
  >
    {photo ? (
      <P4SkyPhoto position="45% 62%" />
    ) : (
      <>
        {/* 天空底 + 高光 */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(200deg, var(--p4-sky-deep, #2196e0) 0%, var(--p4-sky, #8fd0f4) 55%, #cfeafd 100%)' }}
        />
        {/* 云朵：三团椭圆叠出 */}
        <div className="absolute rounded-full bg-white/95" style={{ width: size * 0.52, height: size * 0.22, left: size * 0.34, top: size * 0.52, filter: 'blur(1px)' }} />
        <div className="absolute rounded-full bg-white/85" style={{ width: size * 0.4, height: size * 0.18, left: size * 0.52, top: size * 0.66, filter: 'blur(1.5px)' }} />
        <div className="absolute rounded-full bg-white/70" style={{ width: size * 0.3, height: size * 0.14, left: size * 0.28, top: size * 0.36, filter: 'blur(2px)' }} />
      </>
    )}
    {/* 黄花剪影压在天空上 */}
    {flower && <P4Flower size={size * 0.42} color="var(--ui-bg)" className="absolute" style={{ right: size * 0.06, top: size * 0.3 }} />}
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

/** 巨型同心弧环（设计稿签名背景件：橙/浅黄粗环一圈套一圈，中心镂空所以能透出底下的
 *  天空/内容）。dashboard 右上的"太阳"与全站背景装饰共用同一个原语。
 *  rings：[相对半径0~1, 环宽px, 色] 三元组；容器只画环，圆心外的部分交给父级裁切。 */
export const P4ArcRings = ({
  size = 260,
  className,
  style,
  rings = [
    [0.30, 26, 'var(--p4-orange, #f9a11b)'],
    [0.52, 20, 'rgba(255, 200, 60, 0.75)'],
    [0.74, 16, 'rgba(255, 176, 40, 0.55)'],
    [0.94, 11, 'rgba(255, 214, 90, 0.45)'],
  ],
}: {
  size?: number; className?: string; style?: CSSProperties;
  rings?: [number, number, string][];
}) => (
  <div
    aria-hidden
    className={`pointer-events-none ${className ?? ''}`}
    style={{ zIndex: -1, width: size, height: size, ...style }}
  >
    <svg width={size} height={size} viewBox="0 0 100 100" className="block overflow-visible">
      {rings.map(([r, w, c], i) => (
        <circle
          key={i}
          cx="50"
          cy="50"
          r={r * 50}
          fill="none"
          stroke={c}
          strokeWidth={(w / size) * 100}
        />
      ))}
    </svg>
  </div>
);

/** 八角贴纸面板（modal v3 定稿）：奶油描边 + 黑底 + 不规则切角 + 微旋。
 *  实现：外层裁切奶油面充当描边，内层同形内缩。cuts=[TL,TR,BR,BL] 切角 px。 */
export const P4StickerPanel = ({ children, className, style, contentClassName, cuts = [18, 10, 20, 10], outline = '#fff6d0', bg = '#131313', pad = 3, rotate = -1 }: {
  children: ReactNode; className?: string; style?: CSSProperties; contentClassName?: string;
  cuts?: [number, number, number, number]; outline?: string; bg?: string; pad?: number; rotate?: number;
}) => {
  const poly = `polygon(${cuts[0]}px 0, calc(100% - ${cuts[1]}px) 0, 100% ${cuts[1]}px, 100% calc(100% - ${cuts[2]}px), calc(100% - ${cuts[2]}px) 100%, ${cuts[3]}px 100%, 0 calc(100% - ${cuts[3]}px), 0 ${cuts[0]}px)`;
  return (
    <div
      className={className}
      style={{ filter: 'drop-shadow(0 6px 0 rgba(19, 19, 19, 0.28))', transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style }}
    >
      <div style={{ clipPath: poly, background: outline, padding: pad }}>
        <div className={contentClassName} style={{ clipPath: poly, background: bg }}>
          {children}
        </div>
      </div>
    </div>
  );
};

/** 衬线分区题（actions/statistics 等页的区块标题）：黑衬线大字 + 蓝星闪 + 右侧 meta 槽 */
export const P4SectionTitle = ({ children, meta, size = 'md', className }: {
  children: ReactNode; meta?: ReactNode; size?: 'md' | 'lg'; className?: string;
}) => (
  <div className={`flex items-center justify-between gap-3 ${className ?? ''}`}>
    <div className="flex items-center gap-2">
      <h3
        className="font-black leading-none text-[#131313]"
        style={{ fontFamily: 'var(--p4-display-font, serif)', fontSize: size === 'lg' ? 30 : 24 }}
      >
        {children}
      </h3>
      <P4Sparkle size={size === 'lg' ? 16 : 14} color="var(--ui-accent)" />
    </div>
    {meta}
  </div>
);

/** 黑胶囊计数章（「0 项」）+ 右上橙星 */
export const P4CountPill = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={`relative inline-flex items-center rounded-full bg-[#131313] px-3.5 py-1.5 text-[13px] font-black leading-none text-white ${className ?? ''}`}>
    {children}
    <P4Sparkle size={15} color="var(--p4-orange, #f9a11b)" className="absolute -right-2 -top-2" />
  </span>
);

/** 漂浮花空状态（actions 页式）：大奶油花 + 白星闪 + 黑粗文案 */
export const P4EmptyBloom = ({ text, hint, className }: { text: string; hint?: string; className?: string }) => (
  <div className={`relative flex flex-col items-center py-8 text-center ${className ?? ''}`}>
    <span className="relative inline-block">
      <P4Flower size={66} color="var(--ui-paper)" />
      <P4Sparkle size={16} color="#ffffff" className="absolute -left-5 top-0" />
    </span>
    <p className="mt-3 text-[14px] font-black text-[#131313]">{text}</p>
    {hint && <p className="mt-1 text-xs font-semibold text-[#131313]/60">{hint}</p>}
  </div>
);

/** 天空圆窗（页头右上）：蓝天照片圆 + 黄花。photo=true（默认）走实景素材。
 *  position 走内联样式而不是 `relative` 类：Tailwind 里 .relative 排在 .absolute 之后，
 *  基类写死 relative 会盖掉调用方传入的 absolute —— 圆窗于是掉回文档流跑到左上角，
 *  还把后面的页标题整整顶下去一个身位（用户上报"行动页标题掉下来了"）。 */
export const P4SkyCircle = ({ size = 160, className, style, photo = true }: {
  size?: number; className?: string; style?: CSSProperties; photo?: boolean;
}) => (
  <div
    aria-hidden
    className={`pointer-events-none overflow-hidden rounded-full ${className ?? ''}`}
    style={{
      position: 'absolute',
      zIndex: -1,
      width: size,
      height: size,
      background: photo ? undefined : 'linear-gradient(210deg, var(--p4-sky-deep, #2196e0) 0%, var(--p4-sky, #8fd0f4) 55%, #e6f6ff 100%)',
      ...style,
    }}
  >
    {photo ? (
      <P4SkyPhoto position="35% 50%" />
    ) : (
      <>
        <div className="absolute rounded-full bg-white/95" style={{ width: size * 0.55, height: size * 0.2, left: size * 0.1, top: size * 0.42, filter: 'blur(1px)' }} />
        <div className="absolute rounded-full bg-white/80" style={{ width: size * 0.42, height: size * 0.16, left: size * 0.36, top: size * 0.6, filter: 'blur(1.5px)' }} />
      </>
    )}
    <P4Flower size={size * 0.46} color="var(--ui-bg)" className="absolute" style={{ right: size * 0.08, bottom: size * 0.1 }} />
  </div>
);

/**
 * P4 舞台背景装饰层（App 顶层挂一次，仅黄频道）。
 *
 * 纯黄底大面积平铺太扎眼（用户上报），按设计稿的背景语汇补进三件套：
 * 屏外两组巨型同心橙弧环 + 大号浅奶油花剪影 + 四角星闪。全部低对比度，
 * 只负责把"整片纯色"打散成有层次的舞台，不与内容抢注意力。
 *
 * 口径：fixed 一层、静态无动画、aria-hidden + pointer-events-none，
 * z-index 0（内容层是 z-10），滚动时不重排不重绘。
 */
export const P4StageDecor = () => (
  <div
    aria-hidden
    className="pointer-events-none fixed inset-0 select-none overflow-hidden"
    style={{ zIndex: 0, contain: 'strict' }}
  >
    {/* 右上：主弧环组，圆心落在屏外右上，弧线横扫上半屏 */}
    <P4ArcRings
      size={720}
      className="absolute"
      style={{ right: '-40vw', top: '-32vh' }}
      rings={[
        [0.34, 46, 'rgba(249,161,27,0.20)'],
        [0.56, 34, 'rgba(255,200,60,0.20)'],
        [0.76, 26, 'rgba(249,161,27,0.13)'],
        [0.94, 18, 'rgba(255,214,90,0.16)'],
      ]}
    />
    {/* 左下：副弧环组，与主组反向呼应 */}
    <P4ArcRings
      size={560}
      className="absolute"
      style={{ left: '-36vw', bottom: '-24vh' }}
      rings={[
        [0.42, 34, 'rgba(249,161,27,0.14)'],
        [0.68, 24, 'rgba(255,214,90,0.16)'],
        [0.92, 16, 'rgba(249,161,27,0.10)'],
      ]}
    />
    {/* 巨型花剪影：三朵错落，压在弧环之上 */}
    <P4Flower size={280} color="rgba(255,248,214,0.34)" className="absolute" style={{ left: '-86px', top: '30%' }} />
    <P4Flower size={190} color="rgba(255,248,214,0.28)" className="absolute" style={{ right: '-40px', top: '58%' }} />
    <P4Flower size={120} color="rgba(255,248,214,0.26)" className="absolute" style={{ left: '38%', bottom: '6%' }} />
    {/* 四角星闪：白/橙/蓝三色点缀 */}
    <P4Sparkle size={30} color="rgba(255,255,255,0.5)" className="absolute" style={{ left: '12%', top: '18%' }} />
    <P4Sparkle size={20} color="rgba(249,161,27,0.4)" className="absolute" style={{ right: '18%', top: '38%' }} />
    <P4Sparkle size={26} color="rgba(33,150,224,0.28)" className="absolute" style={{ left: '8%', bottom: '26%' }} />
    <P4Sparkle size={16} color="rgba(255,255,255,0.42)" className="absolute" style={{ right: '8%', bottom: '14%' }} />
  </div>
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
