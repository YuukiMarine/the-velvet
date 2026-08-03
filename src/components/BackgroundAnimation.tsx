/**
 * BackgroundAnimation
 * ────────────────────────────────────────────────────────────
 * 四种纯 CSS 背景动画，颜色跟随 --color-primary CSS 变量，
 * 所有动画通过 style 标签注入 @keyframes，零 JS 运行开销。
 *
 * aurora    — 极光：三个大色块缓慢漂移
 * particles — 粒子：细小圆点缓慢浮动
 * wave      — 渐变波：全屏渐变背景位移
 * pulse     — 脉冲：半透明网格线呼吸
 *
 * ── v2.6.5 性能整改（多位用户反馈卡顿，蓝/黄尤其明显）──────────────────
 * 最硬的旁证：红频道因为 ui/bgAnim.ts 的 opt-in 闸**默认不开**背景动画，
 * 而用户只在蓝/黄上报——等于一次天然对照实验，主因就在这个文件。
 *
 * 四项改动：
 *   ① 极光块 70/65/55vmax → 42/38/32vmax，并删掉 keyframes 里的 scale。
 *      真正的成本不是 blur（那步早换成 radial-gradient 了，方向是对的），
 *      而是**填充率与纹理**：三块常驻半透明层意味着合成器每帧要把整屏做三次
 *      alpha 混合；而 scale(1.12) 会让 Chrome 按动画最大缩放去光栅化，纹理再涨一档。
 *      尺寸降到 ~60% → 纹理面积约剩 35%，opacity 补 1.15× 保住观感。
 *   ② 相位锚定的 sync **只在挂载时算一次**。原来是在渲染函数体里求值，
 *      App 每重渲染一次就产出一份新的 animation 字符串（delay 变了），
 *      React 就逐个改写 3~27 个元素的 animation 简写——浏览器会因此取消并
 *      重新提交这整批合成动画，外加一次全量 style recalc。而 App 是无选择器
 *      订阅，任何一次 store 写入都会触发。锚定语义只需要"挂载那一刻算一次"，
 *      重渲染时再算纯属浪费。
 *   ③ 粒子父子两层合并成一层（24 → 8 个合成层），删掉常驻 will-change
 *      （MDN 明确点名的反模式：它让浏览器永久保留这些层的后备存储）。
 *      顺带发现 PARTICLE_CONFIG 里的 drift 字段从来没被用过——keyframe 里写死的是 30px。
 *   ④ 新增 frozen / D0：转场垫底层的复刻份与低性能降级下**定格**（paused），不逐帧推进。
 *      第一版是把 animation 整条摘掉，那会让复刻份停在 0% 而活层在任意相位——
 *      这正是用户随后上报的「切页时背景闪一下」。定格必须带相位，见 frozen 的注释。
 *
 * 性能护栏（Android 防闪烁，原有口径保留）：
 * - 动画只动 transform / opacity，全部在合成器线程
 * - contain 限制重绘范围
 * - wave 用 transform: translate3d 而不是 background-position
 */

import { memo, useEffect, useState } from 'react';
import { useBoldness } from '@/utils/boldness';

interface BackgroundAnimationProps {
  styles: string[];
  darkMode?: boolean;
  /**
   * 冻结：动画**定格在与活层同一相位**（animation-play-state: paused），不再逐帧推进。
   * 用在页面擦除转场的**复刻份**上——让合成动画数不至于在最需要帧预算的那一刻翻倍
   * （3 块变 6 块、8 颗粒子变 16 颗），但画面与活层逐像素一致。
   *
   * ⚠️ v2.6.5 第一版把 animation 整条摘掉了，那是错的（用户上报「切页时背景闪一下」）：
   * 没有 animation 的极光块停在 0% 偏移、粒子全部堆在屏幕底缘且 opacity 不为 0，
   * 而活层正处在任意相位——垫层一挂一卸就是两次跳变。定格必须**带相位**，
   * 而 -sync 的负 delay 正好把 paused 的定格点钉在 (now - 纪元) 上，与活层同帧。
   * 擦除只有 420ms，对 18~28s 周期而言漂移 <2%，肉眼不可分辨。
   */
  frozen?: boolean;
}

// ── 相位锚定 ──────────────────────────────────────────────
// 页面擦除转场会把本组件在垫底层临时复刻一份（App.tsx stageDecor）：CSS 动画
// 从挂载时刻起跑，复刻份与活层相位不同，垫层卸载瞬间光斑/粒子就"跳位"（切页闪烁）。
// 解法：所有实例的 delay 都减去"距模块加载的流逝秒数"——负 delay 等于快进，
// 任意时刻挂载的实例相位都等价于 (now - 纪元)，逐帧同相，卸载复刻份无痕。
const BG_EPOCH = performance.now();
const syncSeconds = () => (performance.now() - BG_EPOCH) / 1000;

/** 挂载时锚定一次。见文件头 ② —— 渲染期求值会让每次 store 写入都重提交整批动画。 */
function useSyncOnce(): number {
  const [sync] = useState(syncSeconds);
  return sync;
}

// ── 注入一次性 keyframes CSS（去重）───────────────────────
const KEYFRAMES_ID = 'bg-anim-keyframes-v2';

function ensureKeyframes() {
  if (document.getElementById(KEYFRAMES_ID)) return;
  // 换了 id 就要把旧版那份摘掉，否则同名 keyframes 会按后插入的那份生效
  document.getElementById('bg-anim-keyframes')?.remove();
  const el = document.createElement('style');
  el.id = KEYFRAMES_ID;
  el.textContent = `
    /* aurora — 只平移，**不缩放**：scale 会让 Chrome 按最大倍率光栅化，纹理白涨一档 */
    @keyframes aurora-a {
      0%   { transform: translate3d(0%,    0%,   0); }
      33%  { transform: translate3d(9%,   -14%,  0); }
      66%  { transform: translate3d(-7%,   9%,   0); }
      100% { transform: translate3d(0%,    0%,   0); }
    }
    @keyframes aurora-b {
      0%   { transform: translate3d(0%,   0%,  0); }
      40%  { transform: translate3d(-12%, 12%, 0); }
      75%  { transform: translate3d(8%,  -7%,  0); }
      100% { transform: translate3d(0%,   0%,  0); }
    }
    @keyframes aurora-c {
      0%   { transform: translate3d(0%,  0%,  0); }
      50%  { transform: translate3d(6%,  14%, 0); }
      80%  { transform: translate3d(-9%, -6%, 0); }
      100% { transform: translate3d(0%,  0%,  0); }
    }

    /* particles — 单层同时排 X 与 Y（原本拆父子两层各控一个轴，层数白翻一倍）。
       三套变体错开横向摆幅，避免八颗粒子走出同一条轨迹。 */
    @keyframes particle-float-a {
      0%   { transform: translate3d(0,     0,       0); opacity: 0; }
      10%  { opacity: 1; }
      50%  { transform: translate3d(26px, -55vh,    0); }
      85%  { opacity: 0.7; }
      100% { transform: translate3d(0,    -110vh,   0); opacity: 0; }
    }
    @keyframes particle-float-b {
      0%   { transform: translate3d(0,     0,       0); opacity: 0; }
      10%  { opacity: 1; }
      50%  { transform: translate3d(-18px, -55vh,   0); }
      85%  { opacity: 0.7; }
      100% { transform: translate3d(6px,  -110vh,   0); opacity: 0; }
    }
    @keyframes particle-float-c {
      0%   { transform: translate3d(0,     0,       0); opacity: 0; }
      10%  { opacity: 1; }
      50%  { transform: translate3d(12px, -55vh,    0); }
      85%  { opacity: 0.7; }
      100% { transform: translate3d(-10px,-110vh,   0); opacity: 0; }
    }

    /* wave — 用 translate3d 在独立层上平移，避免 background-position 重绘 */
    @keyframes wave-shift {
      0%   { transform: translate3d(0%,    0%, 0); }
      33%  { transform: translate3d(-15%,  8%, 0); }
      66%  { transform: translate3d(10%,  -8%, 0); }
      100% { transform: translate3d(0%,    0%, 0); }
    }

    /* pulse */
    @keyframes grid-breathe {
      0%, 100% { opacity: 0.06; }
      50%       { opacity: 0.14; }
    }
    @keyframes grid-breathe-dark {
      0%, 100% { opacity: 0.08; }
      50%       { opacity: 0.18; }
    }
  `;
  document.head.appendChild(el);
}

/**
 * frozen 时保留 animation 串、只把播放状态设成 paused：
 * 定格点由各自的负 delay 决定 = 与活层同相位（见 frozen 的注释）。
 * paused 的动画不上合成器时间线、不逐帧推进，省的是 tick，不是层。
 */
const playState = (frozen: boolean | undefined) => (frozen ? ('paused' as const) : undefined);

// ── Aurora ────────────────────────────────────────────────
function Aurora({ darkMode, frozen }: { darkMode?: boolean; frozen?: boolean }) {
  // 尺寸砍到 ~60% 后单块视觉分量变轻，opacity 补 1.15× 找回层次
  const baseOp = (darkMode ? 0.18 : 0.13) * 1.15;
  const sync = useSyncOnce();
  const d = (-sync).toFixed(2);
  const blobs = [
    { anim: `aurora-a 22s ease-in-out ${d}s infinite`, size: '42vmax', top: '-12%', left: '-8%',  opacity: baseOp },
    { anim: `aurora-b 28s ease-in-out ${d}s infinite`, size: '38vmax', top: '32%',  left: '46%',  opacity: baseOp * 0.85 },
    { anim: `aurora-c 18s ease-in-out ${d}s infinite`, size: '32vmax', top: '58%',  left: '-4%',  opacity: baseOp * 0.7 },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', contain: 'strict' }}>
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            borderRadius: '50%',
            // 用更大的 radial-gradient 中间段模拟 blur，避免实时 filter: blur
            background: 'radial-gradient(circle, var(--color-primary) 0%, var(--color-primary) 15%, transparent 65%)',
            opacity: b.opacity,
            animation: b.anim,
            animationPlayState: playState(frozen),
            willChange: frozen ? undefined : 'transform',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        />
      ))}
    </div>
  );
}

// ── Particles ─────────────────────────────────────────────
// 12 → 8 颗；父子两层合并成一层。原 config 里的 drift 字段从未生效
// （keyframe 写死 30px），合并后改由三套 float 变体表达横向摆幅。
const PARTICLE_CONFIG = [
  { left: '8%',  size: 4, dur: 18, delay: 0,   v: 'a' },
  { left: '22%', size: 3, dur: 24, delay: 4,   v: 'b' },
  { left: '35%', size: 5, dur: 20, delay: 1.5, v: 'c' },
  { left: '48%', size: 3, dur: 26, delay: 7,   v: 'a' },
  { left: '61%', size: 4, dur: 22, delay: 2,   v: 'b' },
  { left: '73%', size: 3, dur: 30, delay: 9,   v: 'c' },
  { left: '84%', size: 5, dur: 19, delay: 3,   v: 'a' },
  { left: '93%', size: 3, dur: 25, delay: 6,   v: 'b' },
] as const;

function Particles({ darkMode, frozen }: { darkMode?: boolean; frozen?: boolean }) {
  const op = darkMode ? 0.5 : 0.35;
  const sync = useSyncOnce();
  return (
    <div style={{ position: 'absolute', inset: 0, contain: 'layout style' }}>
      {PARTICLE_CONFIG.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            bottom: '-10px',
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'var(--color-primary)',
            opacity: op,
            animation: `particle-float-${p.v} ${p.dur}s ease-in ${(p.delay - sync).toFixed(2)}s infinite`,
            animationPlayState: playState(frozen),
            // both：delay 还没走完时先套 0% 帧（opacity:0）。否则那几颗正 delay 的粒子
            // 会以 opacity:0.35 干杵在屏幕底缘等自己出场——冷启动那几秒底边一排静止小点
            animationFillMode: 'both',
            // 不写 will-change：animation 里已经是 transform/opacity，浏览器会自动提升；
            // 常驻 will-change 会让它永久占着后备存储
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
        />
      ))}
    </div>
  );
}

// ── Wave ──────────────────────────────────────────────────
function Wave({ darkMode, frozen }: { darkMode?: boolean; frozen?: boolean }) {
  const op = darkMode ? 0.12 : 0.08;
  const sync = useSyncOnce();
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', contain: 'strict' }}>
      <div
        style={{
          position: 'absolute',
          top: '-25%',
          left: '-25%',
          width: '150%',
          height: '150%',
          backgroundImage: [
            'radial-gradient(ellipse at 30% 40%, var(--color-primary) 0%, transparent 50%)',
            'radial-gradient(ellipse at 70% 60%, var(--color-secondary, var(--color-primary)) 0%, transparent 50%)',
            'radial-gradient(ellipse at 50% 50%, var(--color-primary) 0%, transparent 40%)',
          ].join(', '),
          opacity: op,
          animation: `wave-shift 20s ease-in-out ${(-sync).toFixed(2)}s infinite`,
          animationPlayState: playState(frozen),
          willChange: frozen ? undefined : 'transform',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
    </div>
  );
}

// ── Pulse ─────────────────────────────────────────────────
function Pulse({ darkMode, frozen }: { darkMode?: boolean; frozen?: boolean }) {
  const animName = darkMode ? 'grid-breathe-dark' : 'grid-breathe';
  // 与 keyframes 0% 帧对齐的初始 opacity，避免动画启动前/延迟期间出现"满亮度闪烁"
  const initialOpacity = darkMode ? 0.08 : 0.06;
  const sync = useSyncOnce();
  const line = (deg: number, size: string, delay: string) => ({
    position: 'absolute' as const,
    inset: 0,
    backgroundImage: `linear-gradient(${deg}deg, var(--color-primary) 1px, transparent 1px)`,
    backgroundSize: size,
    opacity: initialOpacity,
    animation: `${animName} 4s ease-in-out ${delay}s infinite`,
    animationPlayState: playState(frozen),
    animationFillMode: 'both' as const,
    willChange: frozen ? undefined : 'opacity',
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden' as const,
  });
  return (
    <div style={{ position: 'absolute', inset: 0, contain: 'strict' }}>
      <div style={line(0, '100% 48px', (-sync).toFixed(2))} />
      <div style={line(90, '48px 100%', (2 - sync).toFixed(2))} />
    </div>
  );
}

// ── 主导出 ─────────────────────────────────────────────────
function BackgroundAnimationInner({ styles, darkMode, frozen }: BackgroundAnimationProps) {
  useEffect(() => { ensureKeyframes(); }, []);
  /**
   * D0（reduced-motion / 校直模式 / 低帧永久降级）下静止。
   *
   * 之前 D0 只停了 animate-pulse 和 CRT 扫描线，最贵的这一层根本不归它管——
   * 而用户「关掉背景动画就明显改善」恰恰说明：D0 该做没做到的事，用户手动做到了。
   * 这里选择**静止**而不是**关断**：低端机的界面不会因为降级突然变素，
   * 但常驻合成动画归零。
   */
  const bold = useBoldness();
  const still = frozen || !bold;
  return (
    <div
      className="fixed inset-0 pointer-events-none select-none"
      style={{
        zIndex: 0,
        // 整个背景动画容器提升为独立合成层，与页面内容（z-10）隔离
        isolation: 'isolate',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
      aria-hidden="true"
    >
      {styles.includes('aurora')    && <Aurora    darkMode={darkMode} frozen={still} />}
      {styles.includes('particles') && <Particles darkMode={darkMode} frozen={still} />}
      {styles.includes('wave')      && <Wave      darkMode={darkMode} frozen={still} />}
      {styles.includes('pulse')     && <Pulse     darkMode={darkMode} frozen={still} />}
    </div>
  );
}

/**
 * memo 化：App 是无选择器订阅，任何一次 store 写入都会重渲染整棵树。
 * 没有这道边界，下面每个子组件都会重算 animation 字符串并被 React 写回 DOM
 * （见文件头 ②）。styles 数组必须由调用方 useMemo 稳定，否则引用每次都变、memo 失效。
 */
export const BackgroundAnimation = memo(BackgroundAnimationInner);
