/**
 * 羁绊之影 · 战斗面板里的 Boss 立绘
 *
 * 根据 archetype id 渲染不同 SVG 造型；所有造型共用一组"故障 + 粒子"效果：
 *   - 故障：3 层 SVG 复制体 + RGB 偏移 + 随机位移（CSS / motion 驱动）
 *   - 粒子：6~10 颗弱点色小点，环绕上浮
 *   - 颜色：跟随 archetype.accent（弱点属性主色）
 *
 * 尺寸：容器自适应 <div>，组件固定用 viewBox="0 0 120 120"。
 */

import { motion } from 'framer-motion';
import { archetypeById } from '@/constants/coopShadowPool';

interface Props {
  shadowId: string;
  size?: number;
  /** 0-1；HP 越低特效越狂乱（阶段 2 接） */
  intensity?: number;
}

const PARTICLE_COUNT = 8;

export function ShadowBossSVG({ shadowId, size = 100, intensity = 1 }: Props) {
  const archetype = archetypeById(shadowId);
  const accent = archetype?.accent ?? '#a855f7';

  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: size }}
    >
      {/* 粒子层 —— 放在最底层，给整个 shadow 环绕 */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
          const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
          const radius = size * 0.42;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const delay = (i * 0.18) % 1.6;
          return (
            <motion.div
              key={i}
              aria-hidden
              className="absolute left-1/2 top-1/2 rounded-full"
              initial={{ x, y, opacity: 0 }}
              animate={{
                x: [x, x * 1.15, x],
                y: [y, y - 8, y],
                opacity: [0, 0.9, 0],
                scale: [0.6, 1.1, 0.6],
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                delay,
                ease: 'easeInOut',
              }}
              style={{
                width: 4,
                height: 4,
                marginLeft: -2,
                marginTop: -2,
                background: accent,
                boxShadow: `0 0 8px ${accent}`,
              }}
            />
          );
        })}
      </div>

      {/* 三层故障 —— 两层偏移（青 / 洋红）+ 主层 */}
      <GlitchSVG shadowId={shadowId} accent={accent} size={size} layer="cyan" intensity={intensity} />
      <GlitchSVG shadowId={shadowId} accent={accent} size={size} layer="magenta" intensity={intensity} />
      <GlitchSVG shadowId={shadowId} accent={accent} size={size} layer="main" intensity={intensity} />
    </div>
  );
}

// ── 单层 SVG（故障偏移层共用） ─────────────────────────

function GlitchSVG({
  shadowId,
  accent,
  size,
  layer,
  intensity,
}: {
  shadowId: string;
  accent: string;
  size: number;
  layer: 'cyan' | 'magenta' | 'main';
  intensity: number;
}) {
  const offsetX = layer === 'cyan' ? -1.5 : layer === 'magenta' ? 1.5 : 0;
  const layerColor = layer === 'cyan'
    ? 'rgba(34,211,238,0.7)'
    : layer === 'magenta'
    ? 'rgba(236,72,153,0.6)'
    : accent;
  const opacity = layer === 'main' ? 1 : 0.5;
  const blendMode = layer === 'main' ? undefined : 'screen' as const;

  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className="absolute inset-0"
      style={{ mixBlendMode: blendMode, opacity }}
      animate={{
        x: layer === 'main' ? [0, -0.4, 0.6, 0] : [offsetX, offsetX - 0.8, offsetX + 1.2, offsetX],
        y: layer === 'main' ? [0, 0.3, -0.4, 0] : [0, 0.5, -0.3, 0],
      }}
      transition={{
        duration: 0.18 + Math.random() * 0.12,
        repeat: Infinity,
        ease: 'linear',
        repeatDelay: 0.6 + Math.random() * 1.5,
      }}
    >
      {renderShadowShape(shadowId, layerColor, intensity)}
    </motion.svg>
  );
}

// ── 五种造型 ───────────────────────────────────────────

function renderShadowShape(shadowId: string, color: string, _intensity: number) {
  switch (shadowId) {
    case 'coop:entropy':   return <EntropyShape color={color} />;
    case 'coop:apathy':    return <ApathyShape color={color} />;
    case 'coop:inertia':   return <InertiaShape color={color} />;
    case 'coop:despair':   return <DespairShape color={color} />;
    case 'coop:envy':      return <EnvyShape color={color} />;
    default:               return <EntropyShape color={color} />;
  }
}

/** knowledge · 错乱方程：三层断开的圆环 + 符号 */
function EntropyShape({ color }: { color: string }) {
  return (
    <g>
      {/* 中心核心 */}
      <circle cx={60} cy={60} r={8} fill={color} opacity={0.9} />
      <circle cx={60} cy={60} r={14} fill="none" stroke={color} strokeWidth={1.2} opacity={0.35} />
      {/* 三层断环 —— 每层 arc 不连续 */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '60px 60px' }}
      >
        <path d="M 24 60 A 36 36 0 0 1 60 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <path d="M 74 24 A 36 36 0 0 1 96 60" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <path d="M 96 74 A 36 36 0 0 1 60 96" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </motion.g>
      <motion.g
        animate={{ rotate: -360 }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '60px 60px' }}
      >
        <path d="M 36 60 A 24 24 0 0 1 60 36" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.6} />
        <path d="M 68 36 A 24 24 0 0 1 84 60" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.6} />
      </motion.g>
      {/* 浮动符号 */}
      <text x={28} y={32} fontSize={8} fill={color} opacity={0.5} fontWeight="bold">∑</text>
      <text x={88} y={38} fontSize={8} fill={color} opacity={0.5} fontWeight="bold">∞</text>
      <text x={32} y={98} fontSize={8} fill={color} opacity={0.5} fontWeight="bold">?</text>
      <text x={86} y={96} fontSize={8} fill={color} opacity={0.5} fontWeight="bold">×</text>
    </g>
  );
}

/** guts · 怒炎核心：火焰星形 + 心脏脉动 */
function ApathyShape({ color }: { color: string }) {
  // 6 尖角的火焰星
  const spikes = 6;
  const outerR = 42;
  const innerR = 18;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${60 + Math.cos(angle) * r},${60 + Math.sin(angle) * r}`);
  }
  return (
    <g>
      <motion.polygon
        points={pts.join(' ')}
        fill={color}
        opacity={0.85}
        animate={{ scale: [1, 1.05, 0.97, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '60px 60px' }}
      />
      {/* 内部脉动心 */}
      <motion.circle
        cx={60}
        cy={60}
        r={8}
        fill="#fff"
        animate={{ r: [6, 10, 6], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 0.7, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* 外沿火星 */}
      <motion.circle
        cx={60}
        cy={60}
        r={50}
        fill="none"
        stroke={color}
        strokeWidth={1}
        strokeDasharray="3 6"
        opacity={0.5}
        animate={{ rotate: 360 }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '60px 60px' }}
      />
    </g>
  );
}

/** dexterity · 扭曲箭矢：三叠错位三角 + 菱形 */
function InertiaShape({ color }: { color: string }) {
  return (
    <g>
      <motion.g
        animate={{ rotate: [0, 3, -3, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '60px 60px' }}
      >
        {/* 三层错位箭头 */}
        <polygon points="60,18 96,82 60,68 24,82" fill="none" stroke={color} strokeWidth={2} opacity={0.4} />
        <polygon points="60,24 92,80 60,66 28,80" fill="none" stroke={color} strokeWidth={2} opacity={0.7} />
        <polygon points="60,30 88,78 60,64 32,78" fill={color} opacity={0.9} />
      </motion.g>
      {/* 中心菱形 */}
      <motion.polygon
        points="60,52 68,60 60,68 52,60"
        fill="#fff"
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '60px 60px' }}
      />
      {/* 底部散落短线 */}
      <line x1={40} y1={98} x2={48} y2={98} stroke={color} strokeWidth={2} opacity={0.6} />
      <line x1={56} y1={102} x2={64} y2={102} stroke={color} strokeWidth={2} opacity={0.4} />
      <line x1={72} y1={98} x2={80} y2={98} stroke={color} strokeWidth={2} opacity={0.6} />
    </g>
  );
}

/** kindness · 凋萎藤蔓：螺旋带刺 */
function DespairShape({ color }: { color: string }) {
  // 螺旋路径（手工），带"刺"
  return (
    <g>
      <motion.g
        animate={{ rotate: [0, -10, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '60px 60px' }}
      >
        {/* 主螺旋 */}
        <path
          d="M 60 94 C 40 90, 26 74, 30 54 C 34 36, 52 26, 68 32 C 82 38, 84 54, 74 62 C 66 68, 56 62, 58 54"
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
        />
        {/* 刺 */}
        <path d="M 30 54 L 22 50" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <path d="M 42 32 L 40 22" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <path d="M 68 32 L 74 22" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <path d="M 84 54 L 94 56" stroke={color} strokeWidth={2} strokeLinecap="round" />
        {/* 凋叶（半透明） */}
        <ellipse cx={34} cy={70} rx={6} ry={3} fill={color} opacity={0.4} transform="rotate(-30 34 70)" />
        <ellipse cx={82} cy={44} rx={6} ry={3} fill={color} opacity={0.3} transform="rotate(40 82 44)" />
      </motion.g>
      {/* 中心闭合花芯 */}
      <motion.circle
        cx={58}
        cy={54}
        r={5}
        fill={color}
        animate={{ opacity: [0.4, 0.9, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </g>
  );
}

/** charm · 碎镜面：中央八边形 + 散落碎片 */
function EnvyShape({ color }: { color: string }) {
  return (
    <g>
      {/* 中心八边镜 */}
      <motion.polygon
        points="60,22 80,30 92,50 92,70 80,90 60,98 40,90 28,70 28,50 40,30"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        animate={{ rotate: [0, 2, -2, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '60px 60px' }}
      />
      {/* 镜面内部裂纹 */}
      <path d="M 40 30 L 80 90" stroke={color} strokeWidth={1.2} opacity={0.7} />
      <path d="M 80 30 L 40 90" stroke={color} strokeWidth={1.2} opacity={0.7} />
      <path d="M 60 22 L 60 98" stroke={color} strokeWidth={1} opacity={0.5} />
      <path d="M 28 60 L 92 60" stroke={color} strokeWidth={1} opacity={0.5} />
      {/* 散落碎片 */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '60px 60px' }}
      >
        <polygon points="12,20 18,16 16,24" fill={color} opacity={0.7} />
        <polygon points="104,18 110,22 106,28" fill={color} opacity={0.6} />
        <polygon points="108,98 112,104 104,104" fill={color} opacity={0.7} />
        <polygon points="14,100 20,104 14,108" fill={color} opacity={0.6} />
      </motion.g>
      {/* 中心眼 */}
      <circle cx={60} cy={60} r={6} fill={color} opacity={0.9} />
      <circle cx={60} cy={60} r={2.5} fill="#fff" />
    </g>
  );
}
