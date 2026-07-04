/**
 * 星形 path 生成（StarTearOverlay 与 HeavyTransition 共用；抽出自 StarTearOverlay）。
 * 稳定伪随机：同 seed 必同值，星形不随重渲染抖动。
 */
export const seededRand = (s: number) => {
  const x = Math.sin(s * 99991.1234) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * 生成星形 polygon 路径（视口 px 坐标）。spikes 个角 = spikes*2 顶点，外/内半径交替，
 * 每点叠 seed 抖动 → 不规则。塌缩态与展开态必须同 spikes（顶点数一致）MorphSVG 才能逐点对插。
 */
export const buildStar = (
  cx: number,
  cy: number,
  spikes: number,
  outerR: number,
  innerR: number,
  jitter: number,
  seed: number,
) => {
  const verts = spikes * 2;
  let d = '';
  for (let i = 0; i < verts; i++) {
    const isOuter = i % 2 === 0;
    const ang = (i / verts) * Math.PI * 2 - Math.PI / 2;
    const jit = 1 + (seededRand(seed + i * 1.37) - 0.5) * jitter;
    const r = (isOuter ? outerR : innerR) * jit;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return `${d}Z`;
};

/** 设计 §4.2「13–17 顶点不规则星形」 */
export const STAR_SPIKES = 14;
