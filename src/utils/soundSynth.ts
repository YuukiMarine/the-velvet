/**
 * 程序化音效合成（2026-08-03 补齐 —— 用户上报「音效似乎没有装载」）。
 *
 * 【为什么会没声音】
 * feedback.ts 那套 Web Audio 引擎（LRU 缓存、限幅总线、预热）一直是完整的，
 * 缺的是**素材本身**：全站 25 个 `playSound('/xxx.mp3')` 请求的文件，
 * public/ 下一个都不存在。fetch 拿到 404 → `resp.ok` 为 false → 静默返回 null，
 * 于是整套反馈从来没响过，而且因为失败被吞掉，连报错都看不见。
 *
 * 【为什么用合成而不是塞音频文件】
 *   · 这一批全是 0.1–1.2 秒的 UI 反馈音（点击、切页、升级、命中、封印），
 *     本来就是合成器的活儿，不是录音的活儿；
 *   · 零字节：安装包不增大，PWA 不需要为 25 个文件多跑一轮预缓存；
 *   · 离线永远可用，不依赖任何第三方素材的授权与可达性；
 *   · 三套主题音（themea/b/c）可以真的**长得不一样**，而不是同一份素材换个名字。
 *
 * 【与真素材的关系】
 * primeBuffer 仍然**先 fetch**：哪天往 public/ 里放了真的 mp3，它自动接管，
 * 这里一行都不用改。合成只是 404 时的兜底。
 *
 * 【实现口径】
 * 全部离线渲染进一条 Float32 单声道轨，再包成 AudioBuffer 一次性交给引擎——
 * 不用 OfflineAudioContext（旧 WebView 上它的 startRendering 兼容性不齐），
 * 也不在播放时实时起振荡器（那会让每次点击都新建一串 AudioNode）。
 */

// ── 基础渲染原语 ─────────────────────────────────────────────────────────

/** 指数衰减包络：t 为归一化时间(0..1)，k 越大衰减越快 */
const decayEnv = (t: number, k: number) => Math.exp(-k * t);

/**
 * 起振软化：前 ms 毫秒内线性拉起，避免 0 相位硬切造成的「啪」。
 * 必须**很短**：像 pi / dd 这种 50–70ms、衰减极快的短促音，
 * 斜坡拖到 3ms 时峰值恰好落在斜坡还没爬满的地方，实测响度只有其它音的三分之一。
 */
const attackRamp = (i: number, sr: number, ms: number) => Math.min(1, i / Math.max(1, (ms / 1000) * sr));

type Wave = 'sine' | 'square' | 'saw' | 'tri';

function waveform(kind: Wave, phase: number): number {
  const p = phase % (Math.PI * 2);
  switch (kind) {
    case 'square': return p < Math.PI ? 1 : -1;
    case 'saw': return 1 - p / Math.PI;
    case 'tri': return p < Math.PI ? -1 + (2 * p) / Math.PI : 3 - (2 * p) / Math.PI;
    default: return Math.sin(p);
  }
}

interface ToneOpts {
  /** 起始频率 Hz */
  freq: number;
  /** 终止频率 Hz（做滑音；缺省 = 不滑） */
  freqTo?: number;
  /** 起点秒 */
  at: number;
  /** 时长秒 */
  dur: number;
  gain: number;
  wave?: Wave;
  /** 衰减系数（越大越短促） */
  decay?: number;
  /** 起振软化毫秒 */
  attack?: number;
}

function addTone(buf: Float32Array, sr: number, o: ToneOpts): void {
  const start = Math.floor(o.at * sr);
  const len = Math.floor(o.dur * sr);
  const wave = o.wave ?? 'sine';
  const k = o.decay ?? 4;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const t = i / len;
    const f = o.freqTo === undefined ? o.freq : o.freq + (o.freqTo - o.freq) * t;
    phase += (Math.PI * 2 * f) / sr;
    buf[idx] += waveform(wave, phase) * o.gain * decayEnv(t, k) * attackRamp(i, sr, o.attack ?? 1.2);
  }
}

interface NoiseOpts {
  at: number;
  dur: number;
  gain: number;
  decay?: number;
  /** 一阶低通的系数（0..1，越小越闷）；给两个值即在时间上从 from 扫到 to */
  lp?: number;
  lpTo?: number;
  attack?: number;
}

/**
 * 噪声层。用一阶低通把白噪整成"风声/撞击/摩擦"，比直接白噪耐听得多。
 * 随机源用固定种子的 LCG —— 同一个音效每次渲染完全一致，不会时轻时重。
 */
function addNoise(buf: Float32Array, sr: number, o: NoiseOpts, seed = 12345): void {
  const start = Math.floor(o.at * sr);
  const len = Math.floor(o.dur * sr);
  const k = o.decay ?? 6;
  let rnd = seed >>> 0;
  let lastOut = 0;
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx >= buf.length) break;
    const t = i / len;
    rnd = (rnd * 1664525 + 1013904223) >>> 0;
    const white = (rnd / 0xffffffff) * 2 - 1;
    const a = o.lpTo === undefined ? (o.lp ?? 0.35) : (o.lp ?? 0.35) + (o.lpTo - (o.lp ?? 0.35)) * t;
    lastOut = lastOut + a * (white - lastOut);
    buf[idx] += lastOut * o.gain * decayEnv(t, k) * attackRamp(i, sr, o.attack ?? 1);
  }
}

/** 一串音符（琶音）。半音关系用频率比表达，避免记一堆 Hz。 */
function addArp(
  buf: Float32Array, sr: number,
  base: number, semis: number[], at: number, step: number,
  o: { gain: number; wave?: Wave; dur?: number; decay?: number },
): void {
  semis.forEach((st, i) => {
    addTone(buf, sr, {
      freq: base * Math.pow(2, st / 12),
      at: at + i * step,
      dur: o.dur ?? step * 2.4,
      gain: o.gain,
      wave: o.wave ?? 'sine',
      decay: o.decay ?? 5,
    });
  });
}

// ── 25 个音效的配方 ──────────────────────────────────────────────────────
//
// 分三套主题音（与 feedback.ts 的 THEME_SOUNDS 对应）：
//   themea（蓝/粉 · P3）—— 干净的数字音，正弦为主，偏冷
//   themeb（黄 · P4）  —— 温暖的钟琴，三角波 + 泛音
//   themec / dd / ok（红 · P5）—— 短促带攻击性，方波 + 噪声
// 其余为战斗与通用件。

type Recipe = { dur: number; render: (b: Float32Array, sr: number) => void };

const RECIPES: Record<string, Recipe> = {
  // ── themea：蓝 / 粉 · 干净数字音 ────────────────────────────────
  '/themea-nav.mp3': {
    dur: 0.16,
    render: (b, sr) => {
      addTone(b, sr, { freq: 1320, at: 0, dur: 0.12, gain: 0.42, decay: 14 });
      addTone(b, sr, { freq: 1980, at: 0, dur: 0.07, gain: 0.16, decay: 20 });
    },
  },
  '/themea-switch.mp3': {
    dur: 0.34,
    render: (b, sr) => {
      addTone(b, sr, { freq: 620, freqTo: 1500, at: 0, dur: 0.22, gain: 0.34, decay: 5, wave: 'tri' });
      addNoise(b, sr, { at: 0, dur: 0.14, gain: 0.1, decay: 12, lp: 0.6, lpTo: 0.15 });
    },
  },
  '/themea-success.mp3': {
    dur: 0.62,
    render: (b, sr) => {
      addArp(b, sr, 660, [0, 4, 7], 0, 0.075, { gain: 0.32, decay: 5 });
      addTone(b, sr, { freq: 1320, at: 0.15, dur: 0.4, gain: 0.14, decay: 4 });
    },
  },
  '/themea-level.mp3': {
    dur: 1.05,
    render: (b, sr) => {
      addArp(b, sr, 523.25, [0, 4, 7, 12], 0, 0.085, { gain: 0.3, decay: 3.6 });
      addArp(b, sr, 523.25, [12, 16, 19], 0.34, 0.07, { gain: 0.22, decay: 4 });
      addTone(b, sr, { freq: 2093, at: 0.42, dur: 0.55, gain: 0.1, decay: 3.2 });
    },
  },

  // ── themeb：黄 · 温暖钟琴 ──────────────────────────────────────
  '/themeb-nav.mp3': {
    dur: 0.2,
    render: (b, sr) => {
      addTone(b, sr, { freq: 880, at: 0, dur: 0.17, gain: 0.4, decay: 10, wave: 'tri' });
      addTone(b, sr, { freq: 1760, at: 0, dur: 0.09, gain: 0.12, decay: 16, wave: 'tri' });
    },
  },
  '/themeb-switch.mp3': {
    dur: 0.4,
    render: (b, sr) => {
      addTone(b, sr, { freq: 440, at: 0, dur: 0.3, gain: 0.32, decay: 5, wave: 'tri' });
      addTone(b, sr, { freq: 660, at: 0.05, dur: 0.28, gain: 0.2, decay: 5, wave: 'tri' });
    },
  },
  '/themeb-success.mp3': {
    dur: 0.7,
    render: (b, sr) => {
      addArp(b, sr, 587.33, [0, 5, 9], 0, 0.08, { gain: 0.3, decay: 4, wave: 'tri' });
      addTone(b, sr, { freq: 1174, at: 0.18, dur: 0.44, gain: 0.12, decay: 3.4, wave: 'tri' });
    },
  },
  '/themeb-level.mp3': {
    dur: 1.15,
    render: (b, sr) => {
      addArp(b, sr, 523.25, [0, 5, 9, 12], 0, 0.09, { gain: 0.3, decay: 3.2, wave: 'tri' });
      addArp(b, sr, 1046.5, [0, 5, 9], 0.4, 0.075, { gain: 0.2, decay: 3.4, wave: 'tri' });
    },
  },

  // ── themec / P5：红 · 短促带攻击性 ─────────────────────────────
  '/themec-switch.mp3': {
    dur: 0.3,
    render: (b, sr) => {
      addTone(b, sr, { freq: 1100, freqTo: 380, at: 0, dur: 0.16, gain: 0.3, decay: 9, wave: 'square' });
      addNoise(b, sr, { at: 0, dur: 0.12, gain: 0.2, decay: 14, lp: 0.75, lpTo: 0.2 });
    },
  },
  '/themec-level.mp3': {
    dur: 1.0,
    render: (b, sr) => {
      addArp(b, sr, 349.23, [0, 7, 12], 0, 0.075, { gain: 0.26, decay: 3.6, wave: 'square' });
      addTone(b, sr, { freq: 1396, at: 0.28, dur: 0.5, gain: 0.14, decay: 3, wave: 'saw' });
      addNoise(b, sr, { at: 0, dur: 0.2, gain: 0.12, decay: 9, lp: 0.5, lpTo: 0.1 });
    },
  },
  '/dd.mp3': {
    dur: 0.13,
    render: (b, sr) => {
      addTone(b, sr, { freq: 1560, at: 0, dur: 0.055, gain: 0.5, decay: 13, wave: 'square', attack: 0.8 });
      addTone(b, sr, { freq: 1040, at: 0.055, dur: 0.065, gain: 0.42, decay: 13, wave: 'square', attack: 0.8 });
    },
  },
  '/ok.mp3': {
    dur: 0.42,
    render: (b, sr) => {
      addArp(b, sr, 784, [0, 7], 0, 0.07, { gain: 0.32, decay: 6, wave: 'square' });
      addNoise(b, sr, { at: 0, dur: 0.06, gain: 0.1, decay: 20, lp: 0.8 });
    },
  },
  '/pi.mp3': {
    dur: 0.1,
    render: (b, sr) => addTone(b, sr, { freq: 2200, at: 0, dur: 0.075, gain: 0.46, decay: 12, wave: 'square', attack: 0.8 }),
  },
  '/ui-menu.mp3': {
    dur: 0.14,
    render: (b, sr) => {
      addNoise(b, sr, { at: 0, dur: 0.06, gain: 0.5, decay: 14, lp: 0.9, lpTo: 0.3, attack: 0.6 });
      addTone(b, sr, { freq: 760, at: 0, dur: 0.1, gain: 0.34, decay: 11, wave: 'tri', attack: 0.8 });
    },
  },
  '/penalty.mp3': {
    dur: 0.62,
    render: (b, sr) => {
      // 小二度撞在一起 = 明确的"不对"，比单纯低音更能读出惩罚
      addTone(b, sr, { freq: 196, at: 0, dur: 0.5, gain: 0.3, decay: 3.4, wave: 'saw' });
      addTone(b, sr, { freq: 207.65, at: 0, dur: 0.5, gain: 0.26, decay: 3.4, wave: 'saw' });
      addTone(b, sr, { freq: 98, at: 0, dur: 0.55, gain: 0.2, decay: 3 });
    },
  },
  '/pray.mp3': {
    dur: 1.3,
    render: (b, sr) => {
      // 软钟：基频 + 两个非整数倍泛音，长衰减
      addTone(b, sr, { freq: 587.33, at: 0, dur: 1.25, gain: 0.26, decay: 2.6, attack: 12 });
      addTone(b, sr, { freq: 1480, at: 0, dur: 0.9, gain: 0.1, decay: 3.4, attack: 12 });
      addTone(b, sr, { freq: 2350, at: 0, dur: 0.5, gain: 0.05, decay: 5, attack: 12 });
    },
  },

  // ── 战斗 ───────────────────────────────────────────────────────
  '/battle-impact.mp3': {
    dur: 0.4,
    render: (b, sr) => {
      addNoise(b, sr, { at: 0, dur: 0.16, gain: 0.42, decay: 13, lp: 0.85, lpTo: 0.1 });
      addTone(b, sr, { freq: 150, freqTo: 52, at: 0, dur: 0.3, gain: 0.4, decay: 7 });
    },
  },
  '/battle-critical.mp3': {
    dur: 0.6,
    render: (b, sr) => {
      addNoise(b, sr, { at: 0, dur: 0.22, gain: 0.46, decay: 10, lp: 0.95, lpTo: 0.12 });
      addTone(b, sr, { freq: 220, freqTo: 60, at: 0, dur: 0.42, gain: 0.42, decay: 5.5 });
      addTone(b, sr, { freq: 1760, freqTo: 880, at: 0.02, dur: 0.2, gain: 0.16, decay: 9, wave: 'square' });
    },
  },
  '/battle-start.mp3': {
    dur: 1.0,
    render: (b, sr) => {
      addTone(b, sr, { freq: 110, freqTo: 660, at: 0, dur: 0.6, gain: 0.3, decay: 1.8, wave: 'saw' });
      addNoise(b, sr, { at: 0.1, dur: 0.5, gain: 0.16, decay: 2.2, lp: 0.12, lpTo: 0.8 });
      addArp(b, sr, 440, [0, 7, 12], 0.58, 0.06, { gain: 0.26, decay: 5, wave: 'square' });
    },
  },
  '/battle-awaken.mp3': {
    dur: 1.4,
    render: (b, sr) => {
      addTone(b, sr, { freq: 130.81, freqTo: 523.25, at: 0, dur: 0.95, gain: 0.24, decay: 1.4, wave: 'tri' });
      addTone(b, sr, { freq: 196, freqTo: 784, at: 0.08, dur: 0.9, gain: 0.16, decay: 1.6, wave: 'tri' });
      addNoise(b, sr, { at: 0.2, dur: 0.9, gain: 0.1, decay: 1.5, lp: 0.08, lpTo: 0.9 });
      addTone(b, sr, { freq: 1046.5, at: 0.92, dur: 0.45, gain: 0.2, decay: 4 });
    },
  },
  '/battle-summon.mp3': {
    dur: 1.5,
    render: (b, sr) => {
      addNoise(b, sr, { at: 0, dur: 0.35, gain: 0.2, decay: 5, lp: 0.9, lpTo: 0.2 });
      addArp(b, sr, 261.63, [0, 7, 12, 16, 19], 0.05, 0.075, { gain: 0.26, decay: 3, wave: 'tri' });
      addTone(b, sr, { freq: 1046.5, at: 0.48, dur: 0.9, gain: 0.16, decay: 2.2 });
      addTone(b, sr, { freq: 1568, at: 0.52, dur: 0.75, gain: 0.1, decay: 2.6 });
    },
  },
  '/battle-fanfare.mp3': {
    dur: 1.6,
    render: (b, sr) => {
      addArp(b, sr, 392, [0, 4, 7, 12], 0, 0.1, { gain: 0.3, decay: 3, wave: 'square' });
      addArp(b, sr, 784, [0, 4, 7], 0.44, 0.08, { gain: 0.24, decay: 3, wave: 'square' });
      addTone(b, sr, { freq: 1568, at: 0.7, dur: 0.85, gain: 0.16, decay: 2.4 });
      addNoise(b, sr, { at: 0.68, dur: 0.5, gain: 0.08, decay: 3.5, lp: 0.7, lpTo: 0.2 });
    },
  },
  '/battle-seal.mp3': {
    dur: 0.85,
    render: (b, sr) => {
      addTone(b, sr, { freq: 660, freqTo: 110, at: 0, dur: 0.45, gain: 0.3, decay: 3.2, wave: 'tri' });
      addNoise(b, sr, { at: 0.4, dur: 0.3, gain: 0.24, decay: 8, lp: 0.7, lpTo: 0.06 });
      addTone(b, sr, { freq: 82.4, at: 0.42, dur: 0.4, gain: 0.32, decay: 6 });
    },
  },
  '/battle-mask-swap.mp3': {
    dur: 0.45,
    render: (b, sr) => {
      addNoise(b, sr, { at: 0, dur: 0.28, gain: 0.42, decay: 5, lp: 0.15, lpTo: 0.85 });
      addTone(b, sr, { freq: 520, freqTo: 1560, at: 0.02, dur: 0.22, gain: 0.3, decay: 6, wave: 'tri' });
    },
  },
  '/shadowattack.mp3': {
    dur: 0.75,
    render: (b, sr) => {
      // 两个相差 3Hz 的低频锯齿互相拍频 = 低沉的"嗡"，读起来是暗影而不是打击
      addTone(b, sr, { freq: 87, at: 0, dur: 0.6, gain: 0.3, decay: 3, wave: 'saw' });
      addTone(b, sr, { freq: 90, at: 0, dur: 0.6, gain: 0.28, decay: 3, wave: 'saw' });
      addNoise(b, sr, { at: 0.16, dur: 0.4, gain: 0.22, decay: 5, lp: 0.5, lpTo: 0.08 });
      addTone(b, sr, { freq: 330, freqTo: 120, at: 0.1, dur: 0.35, gain: 0.14, decay: 5, wave: 'square' });
    },
  },
};

/**
 * 渲染一个音效为 AudioBuffer。没有配方返回 null。
 * 渲染是纯计算，最长的 1.6 秒在 48kHz 下也只有 ~7.7 万次采样迭代，
 * 首次触发时的开销远小于原来一次网络往返。结果由 feedback.ts 的 LRU 缓存收编。
 */
export function synthesize(ctx: BaseAudioContext, src: string): AudioBuffer | null {
  const recipe = RECIPES[src];
  if (!recipe) return null;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.ceil(recipe.dur * sr));
  const data = new Float32Array(len);
  recipe.render(data, sr);

  // 归一到 -0.9..0.9：各层是直接相加的，叠出来可能越界，
  // 越界在 AudioBuffer 层就是硬削（爆音），必须在这里收住
  let peak = 0;
  for (let i = 0; i < len; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  if (peak > 0.9) { const k = 0.9 / peak; for (let i = 0; i < len; i++) data[i] *= k; }

  // 收尾 6ms 淡出，杜绝末尾非零采样造成的「咔」
  const tail = Math.min(len, Math.floor(sr * 0.006));
  for (let i = 0; i < tail; i++) data[len - tail + i] *= 1 - i / tail;

  try {
    const buf = ctx.createBuffer(1, len, sr);
    buf.copyToChannel ? buf.copyToChannel(data, 0) : buf.getChannelData(0).set(data);
    return buf;
  } catch {
    return null;
  }
}
