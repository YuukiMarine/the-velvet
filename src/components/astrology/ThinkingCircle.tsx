/**
 * ThinkingCircle — 思维链阶段的「结阵中」魔法阵（v2.7.0.6）。
 *
 * 用户口径：思维链在进行时要有一个直观的预估进度——一个正在逐渐生成、路径生长中的
 * 发光魔法阵；正文开始输出后再切到流式文字。
 *
 * 两种阵图（都由进度 p ∈ 0..1 驱动，utils/thinkProgress 给 p）：
 *   · spokes（每日）：外环进度弧 + 24 格刻度依次点亮；八根辐条按 p 逐根从内环长到外环，
 *     相邻两根都长满后尖端连弦，阵图随进度自己"结"出来。
 *   · hexagram（中长期 / 追问）：圆圈本身随进度长大，圈内按顺序画出六芒星的六条边
 *     （先正三角、再倒三角）；没有内圈。
 * 光晕随 p 变亮。视觉语言沿用窥探命运的 MagicCircle（金色、刻度），颜色可换以适配频道。
 * D0（低机能 / reduced-motion）：不旋转、不呼吸，只按进度静态绘制。
 */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';

interface Props {
  /** 0..1 的预估进度 */
  progress: number;
  size?: number;
  /** 阵图主色（hex），默认塔罗金 */
  color?: string;
  /** 阵图下方的一行状态语 */
  label?: string;
  /** 是否在状态语后附百分比 */
  showPercent?: boolean;
  /** 状态语颜色；默认取主色 85% 透明 */
  textColor?: string;
  variant?: 'spokes' | 'hexagram' | 'pentagram';
}

/** '#rrggbb' → 'rgba(r,g,b,a)'；非 hex 原样返回（交给调用方保证可读） */
const withAlpha = (hex: string, a: number): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** 四角星路径（✦），中心 (cx,cy)，半径 r */
const fourStar = (cx: number, cy: number, r: number): string => {
  const k = r * 0.32;
  return [
    `M${cx} ${cy - r}`,
    `C${cx + k * 0.3} ${cy - k} ${cx + k} ${cy - k * 0.3} ${cx + r} ${cy}`,
    `C${cx + k} ${cy + k * 0.3} ${cx + k * 0.3} ${cy + k} ${cx} ${cy + r}`,
    `C${cx - k * 0.3} ${cy + k} ${cx - k} ${cy + k * 0.3} ${cx - r} ${cy}`,
    `C${cx - k} ${cy - k * 0.3} ${cx - k * 0.3} ${cy - k} ${cx} ${cy - r}Z`,
  ].join(' ');
};

const SPOKES = 8;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function ThinkingCircle({
  progress,
  size = 120,
  color = '#d4af37',
  label,
  showPercent = true,
  textColor,
  variant = 'spokes',
}: Props) {
  const d0 = !useBoldness();
  const p = clamp01(Number.isFinite(progress) ? progress : 0);
  const c = size / 2;
  const R = size * 0.46;
  const circ = 2 * Math.PI * R;
  const ticks = useMemo(() => Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2), []);
  const soft = withAlpha(color, 0.55);
  const glow = 2 + p * 9;
  const hex = variant === 'hexagram';
  const penta = variant === 'pentagram';
  const star = hex || penta;

  // ── spokes 几何 ──
  const rIn = size * 0.14;
  const rOut = size * 0.36;
  const spokeLen = rOut - rIn;
  const spokeAngle = (i: number) => (i / SPOKES) * Math.PI * 2 - Math.PI / 2;
  const spokeFill = (i: number) => clamp01(p * SPOKES - i);

  // ── hexagram 几何：两枚正三角形内接于半径 rH 的圆，六条边按进度依次画出 ──
  const rH = size * 0.34;
  const hexEdges = useMemo(() => {
    const pt = (deg: number) => [c + Math.cos((deg * Math.PI) / 180) * rH, c + Math.sin((deg * Math.PI) / 180) * rH] as const;
    const up = [pt(-90), pt(30), pt(150)];
    const down = [pt(90), pt(210), pt(330)];
    const tri = (v: ReadonlyArray<readonly [number, number]>) => [0, 1, 2].map(i => [v[i], v[(i + 1) % 3]] as const);
    return [...tri(up), ...tri(down)];
  }, [c, rH]);
  const edgeLen = 2 * rH * Math.sin(Math.PI / 3);

  // ── pentagram 几何：五个顶点内接于半径 rH 的圆，一笔画的顺序 0→2→4→1→3→0，五条边按进度依次画出 ──
  const pentaEdges = useMemo(() => {
    const v = [0, 1, 2, 3, 4].map(k => {
      const deg = -90 + k * 72;
      return [c + Math.cos((deg * Math.PI) / 180) * rH, c + Math.sin((deg * Math.PI) / 180) * rH] as const;
    });
    const order = [0, 2, 4, 1, 3, 0];
    return order.slice(0, 5).map((from, i) => [v[from], v[order[i + 1]]] as const);
  }, [c, rH]);
  const pentaEdgeLen = 2 * rH * Math.sin((2 * Math.PI) / 5);

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-label={label ?? '推演中'}
    >
      <motion.svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        animate={d0 ? undefined : { rotate: 360 }}
        transition={d0 ? undefined : { repeat: Infinity, duration: 28, ease: 'linear' }}
        style={{
          filter: `drop-shadow(0 0 ${glow}px ${soft})`,
          // 星形版（六芒星 / 五角星）：圆圈本身随进度长大
          scale: star ? 0.72 + p * 0.28 : 1,
        }}
      >
        {/* 底环 + 进度弧 */}
        <circle cx={c} cy={c} r={R} fill="none" stroke={withAlpha(color, 0.18)} strokeWidth={1.5} />
        <circle
          cx={c} cy={c} r={R} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round"
          strokeDasharray={`${p * circ} ${circ}`} transform={`rotate(-90 ${c} ${c})`}
        />
        {/* 刻度：按进度依次点亮 */}
        {ticks.map((a, i) => {
          const major = i % 6 === 0;
          const r1 = R - 7;
          const r2 = R - (major ? 15 : 11);
          return (
            <line
              key={i}
              x1={c + Math.cos(a) * r1} y1={c + Math.sin(a) * r1}
              x2={c + Math.cos(a) * r2} y2={c + Math.sin(a) * r2}
              stroke={i / 24 <= p ? color : withAlpha(color, 0.25)}
              strokeWidth={major ? 2 : 1}
            />
          );
        })}

        {penta ? (
          // 五角星：五条边在 p ∈ [0, 0.9] 内一笔画依次画满，最后一成留给圆圈长满
          pentaEdges.map(([a, b], k) => {
            const f = clamp01((p / 0.9) * 5 - k);
            return (
              <line
                key={`p${k}`}
                x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                stroke={color} strokeWidth={1.6} strokeLinecap="round"
                strokeDasharray={pentaEdgeLen} strokeDashoffset={pentaEdgeLen * (1 - f)}
                opacity={0.3 + f * 0.7}
              />
            );
          })
        ) : hex ? (
          // 六芒星：六条边在 p ∈ [0, 0.9] 内依次画满（第 k 条占 [k/6, (k+1)/6] × 0.9），
          // 最后一成留给圆圈长满——正文一到就切走，星要先于圆圈完成才看得到
          hexEdges.map(([a, b], k) => {
            const f = clamp01((p / 0.9) * 6 - k);
            return (
              <line
                key={`h${k}`}
                x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                stroke={color} strokeWidth={1.6} strokeLinecap="round"
                strokeDasharray={edgeLen} strokeDashoffset={edgeLen * (1 - f)}
                opacity={0.3 + f * 0.7}
              />
            );
          })
        ) : (
          <>
            {/* 内环 */}
            <circle cx={c} cy={c} r={size * 0.3} fill="none" stroke={withAlpha(color, 0.5)} strokeWidth={1} strokeDasharray="3 6" />
            {/* 生长的辐条 */}
            {Array.from({ length: SPOKES }, (_, i) => {
              const a = spokeAngle(i);
              const f = spokeFill(i);
              return (
                <line
                  key={`s${i}`}
                  x1={c + Math.cos(a) * rIn} y1={c + Math.sin(a) * rIn}
                  x2={c + Math.cos(a) * rOut} y2={c + Math.sin(a) * rOut}
                  stroke={color} strokeWidth={1.5} strokeLinecap="round"
                  strokeDasharray={spokeLen} strokeDashoffset={spokeLen * (1 - f)}
                  opacity={0.35 + f * 0.65}
                />
              );
            })}
            {/* 结阵：相邻两根都长满后，尖端之间连弦 */}
            {Array.from({ length: SPOKES }, (_, i) => {
              const j = (i + 1) % SPOKES;
              if (spokeFill(i) < 1 || spokeFill(j) < 1) return null;
              const a1 = spokeAngle(i);
              const a2 = spokeAngle(j);
              return (
                <line
                  key={`c${i}`}
                  x1={c + Math.cos(a1) * rOut} y1={c + Math.sin(a1) * rOut}
                  x2={c + Math.cos(a2) * rOut} y2={c + Math.sin(a2) * rOut}
                  stroke={withAlpha(color, 0.7)} strokeWidth={1}
                />
              );
            })}
          </>
        )}

        {/* 中心星：随进度变亮，非 D0 时轻微呼吸（五角星版中间就是星本身，不再叠一颗） */}
        {!penta && (
          <motion.path
            d={fourStar(c, c, size * (hex ? 0.07 : 0.085))}
            fill={color}
            initial={false}
            animate={d0 ? { opacity: 0.5 + p * 0.5 } : { opacity: [0.45 + p * 0.4, 0.7 + p * 0.3, 0.45 + p * 0.4] }}
            transition={d0 ? undefined : { repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
          />
        )}
      </motion.svg>
      {(label || showPercent) && (
        <div className="text-[11px] font-semibold tabular-nums" style={{ color: textColor ?? withAlpha(color, 0.85) }}>
          {label}
          {label && showPercent ? ' · ' : ''}
          {showPercent ? `${Math.round(p * 100)}%` : ''}
        </div>
      )}
    </div>
  );
}
